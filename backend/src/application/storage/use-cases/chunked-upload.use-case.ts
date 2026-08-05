import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import {
  CloudStorageConfig,
  defaultStorageConfig,
} from '@application/app-settings/domain/storage.types';
import { planUpload } from '../domain/upload-limits';
import {
  CHUNK_SIZE,
  UploadTicket,
  partCount,
  readUploadTicket,
  signUploadTicket,
  ticketExpiry,
} from '../domain/upload-ticket';
import { IStorageService, UploadedPart } from '../storage.port';
import { UploadedMediaResult } from './upload-media.use-case';

/** What the client needs to start sending chunks. */
export interface BeginChunkedUploadResult {
  ticket: string;
  /** Bytes per chunk — the client must split on exactly this boundary. */
  chunkSize: number;
  /** How many chunks that works out to, so the client can show "3 of 12". */
  parts: number;
}

/** One accepted chunk, echoed back for the client to collect. */
export interface UploadChunkResult {
  partNumber: number;
  etag: string;
}

/**
 * Upload a large file in chunks.
 *
 * The API never holds more than one chunk: each one is forwarded straight to
 * the provider's own multipart API (S3 multipart, Azure block blobs) and the
 * provider assembles the object at the end. That's what makes a 200MB video
 * possible on a small server — the single-shot path buffers the entire file in
 * memory, so the request size *is* the memory cost.
 *
 * Progress in between lives nowhere on the server. The signed ticket carries
 * the whole state (see {@link signUploadTicket}), so any replica can take any
 * chunk and there's no session to expire, sweep or migrate.
 */
@Injectable()
export class ChunkedUploadUseCase {
  constructor(
    @Inject(IAppSettingsRepository) private readonly settingsRepo: IAppSettingsRepository,
    @Inject(IStorageService) private readonly storage: IStorageService,
  ) {}

  /**
   * Agree to an upload before a byte of it arrives. The type and size gate is
   * the same `planUpload` the single-shot path uses, asked here against the
   * size the client *declares*.
   *
   * A client that lies about the size can't get much for it: the ticket fixes
   * how many chunks may be sent, and each chunk is capped at `CHUNK_SIZE`, so
   * what actually lands can only overshoot the declared size by less than one
   * chunk. That's cheaper than a `HeadObject` round trip on every upload.
   */
  async begin(
    tenantId: string,
    file: { name: string; size: number; contentType: string },
  ): Promise<BeginChunkedUploadResult> {
    if (!Number.isFinite(file.size) || file.size <= 0) {
      throw new BadRequestException('The file size is missing or invalid.');
    }
    const config = await this.config(tenantId);
    const classified = planUpload(config, {
      contentType: file.contentType,
      originalName: file.name,
      size: file.size,
    });

    const target = await this.storage.createMultipart(config, {
      originalName: file.name,
      contentType: classified.contentType,
    });

    const ticket: UploadTicket = {
      tenantId,
      key: target.key,
      uploadId: target.uploadId,
      name: file.name,
      contentType: classified.contentType,
      size: file.size,
      exp: ticketExpiry(),
    };
    return {
      ticket: signUploadTicket(ticket),
      chunkSize: CHUNK_SIZE,
      parts: partCount(file.size),
    };
  }

  /**
   * Store one chunk. `partNumber` is 1-based. Re-sending a chunk is safe and is
   * how the client retries: the provider overwrites that part, and the last
   * `etag` the client keeps is the one that counts.
   */
  async part(
    tenantId: string,
    token: string | undefined,
    partNumber: number,
    body: Buffer,
  ): Promise<UploadChunkResult> {
    const ticket = readUploadTicket(token, tenantId);
    const total = partCount(ticket.size);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > total) {
      throw new BadRequestException(`Chunk number must be between 1 and ${total}.`);
    }
    if (!body?.length) throw new BadRequestException('That chunk is empty.');
    // A part bigger than the agreed chunk size would let a client smuggle past
    // the cap it was measured against at `begin`.
    if (body.length > CHUNK_SIZE) throw new BadRequestException('That chunk is too large.');

    const config = await this.config(tenantId);
    return this.storage.uploadPart(config, ticket, partNumber, body);
  }

  /**
   * Assemble the parts into the finished file and return it in exactly the
   * shape `POST /uploads` returns, so callers can't tell which path a file took.
   */
  async complete(
    tenantId: string,
    token: string | undefined,
    parts: UploadedPart[],
  ): Promise<UploadedMediaResult> {
    const ticket = readUploadTicket(token, tenantId);
    const expected = partCount(ticket.size);
    if (!parts?.length) throw new BadRequestException('No chunks were sent.');
    if (parts.length !== expected) {
      throw new BadRequestException(
        `This upload needs ${expected} chunks but ${parts.length} arrived — upload it again.`,
      );
    }

    const config = await this.config(tenantId);
    const { url } = await this.storage.completeMultipart(config, ticket, parts, ticket.contentType);
    return { url, name: ticket.name, contentType: ticket.contentType, size: ticket.size };
  }

  /**
   * Throw an abandoned upload away. Worth calling on cancel: until it's aborted
   * (or a bucket lifecycle rule sweeps it) S3 keeps billing for parts that will
   * never become a file.
   */
  async abort(tenantId: string, token: string | undefined): Promise<void> {
    const ticket = readUploadTicket(token, tenantId);
    const config = await this.config(tenantId);
    await this.storage.abortMultipart(config, ticket);
  }

  private async config(tenantId: string): Promise<CloudStorageConfig> {
    const settings = await this.settingsRepo.findByTenant(tenantId);
    return settings?.storage ?? defaultStorageConfig();
  }
}
