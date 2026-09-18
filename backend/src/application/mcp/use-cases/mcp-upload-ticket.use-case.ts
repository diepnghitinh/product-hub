import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IUsecaseExecute } from '@core/interfaces';
import { Result } from '@shared/logic/result';
import { UploadMediaUseCase } from '@application/storage/use-cases/upload-media.use-case';
import { contentTypeFromName } from '@application/storage/domain/upload-kind';
import { jwtConstants } from '@application/auth/constants';
import { McpCreateUploadUrlDto } from '../dtos/mcp.dtos';
import { McpUploadUrlDto, McpUploadedFileDto } from '../dtos/mcp.response.dto';
import type { McpActor } from './mcp.use-cases';

/**
 * How long a ticket stays good. Long enough for an assistant to run the command
 * it was just handed, short enough that a URL left in a transcript is dead by
 * the time anyone reads it back.
 */
export const MCP_UPLOAD_TICKET_TTL_SECONDS = 30 * 60;

/**
 * The ceiling multer enforces on the redeem route — the same hard limit the web
 * app's own upload route uses, so the two doors are equally wide. The tenant's
 * per-type caps (Settings → Storage) still apply underneath and are usually the
 * stricter of the two.
 */
export const MCP_UPLOAD_TICKET_MAX_BYTES = 250 * 1024 * 1024;

/** Stamped on every ticket and checked on redeem. */
const TICKET_PURPOSE = 'mcp-upload';

/**
 * A secret of its own, derived from `JWT_SECRET` rather than reusing it.
 *
 * A ticket is verified on an unauthenticated route, so if it were signed with
 * the login secret then any ticket would be a token minted with that key — and
 * the only thing standing between it and `JwtStrategy` would be the shape of its
 * payload. Deriving keeps them mathematically unrelated (the platform tokens
 * separate themselves the same way) while needing no new env var, so this can
 * ship without a config change on the box.
 */
export const MCP_UPLOAD_TICKET_SECRET = createHmac('sha256', jwtConstants.secret)
  .update(`${TICKET_PURPOSE}/v1`)
  .digest('hex');

/** What a redeemed ticket says about who is uploading. Short, unshared claim
 *  names — nothing here reads as a login payload to another verifier. */
interface McpUploadTicketPayload {
  pur: string;
  /** Whose bucket the bytes land in. */
  tnt: string;
}

/** The bytes multer parsed out of the multipart body. */
export interface McpTicketFile {
  buffer: Buffer;
  contentType: string;
  originalName: string;
  size: number;
}

/**
 * Hand back a one-shot URL that accepts a file over plain HTTP multipart.
 *
 * `upload_file` carries bytes base64 inside the JSON-RPC body, which means the
 * file passes through the assistant's context — a real screenshot costs more
 * context than the conversation it belongs to, and anything past ~7MB does not
 * fit at all. This is the way out: the tool returns a URL, the assistant runs
 * one `curl -F`, and the bytes go from disk to storage without ever being read
 * into a model.
 *
 * It is our own endpoint rather than a provider-signed PUT on purpose. The web
 * app signs one (`POST /uploads/presign`) because the browser knows the file's
 * name, type and exact size before it sends anything, and those three are what a
 * signature has to be built around. An assistant handed a URL to `curl` knows
 * none of them yet — so the ticket stays type- and size-agnostic, and the file is
 * judged by {@link UploadMediaUseCase} when it arrives.
 */
@Injectable()
export class McpCreateUploadUrlUseCase
  implements
    IUsecaseExecute<
      { actor: McpActor; dto: McpCreateUploadUrlDto; baseUrl: string },
      Result<McpUploadUrlDto>
    >
{
  constructor(private readonly jwt: JwtService) {}

  async execute({
    actor,
    dto,
    baseUrl,
  }: {
    actor: McpActor;
    dto: McpCreateUploadUrlDto;
    baseUrl: string;
  }): Promise<Result<McpUploadUrlDto>> {
    const payload: McpUploadTicketPayload = { pur: TICKET_PURPOSE, tnt: actor.tenantId };
    const ticket = await this.jwt.signAsync(payload, {
      secret: MCP_UPLOAD_TICKET_SECRET,
      expiresIn: MCP_UPLOAD_TICKET_TTL_SECONDS,
    });

    const uploadUrl = `${baseUrl.replace(/\/+$/, '')}/uploads/ticket/${ticket}`;
    const name = dto.name?.trim() || 'screenshot.png';
    return Result.ok({
      uploadUrl,
      expiresInSeconds: MCP_UPLOAD_TICKET_TTL_SECONDS,
      maxBytes: MCP_UPLOAD_TICKET_MAX_BYTES,
      // Handed over ready to run: the failure mode this replaces is an assistant
      // inventing a multipart request and getting the field name wrong.
      curl: `curl -sS -F "file=@${name}" "${uploadUrl}"`,
    });
  }
}

/**
 * Spend a ticket: multipart bytes in, stored file out.
 *
 * The ticket carries the tenant, so the route needs no `x-api-key` — which is
 * the point, since the key lives in the MCP client's config and not in the hands
 * of whatever is running `curl`. It is bearer-style: whoever holds it can upload
 * to that tenant's storage until it expires. That is a deliberately small
 * authority — it stores a file and returns its URL, it cannot read, change or
 * attach anything — bounded by {@link MCP_UPLOAD_TICKET_TTL_SECONDS}.
 */
@Injectable()
export class McpRedeemUploadTicketUseCase
  implements
    IUsecaseExecute<{ ticket: string; file: McpTicketFile }, Result<McpUploadedFileDto>>
{
  constructor(
    private readonly jwt: JwtService,
    private readonly uploadMedia: UploadMediaUseCase,
  ) {}

  async execute({
    ticket,
    file,
  }: {
    ticket: string;
    file: McpTicketFile;
  }): Promise<Result<McpUploadedFileDto>> {
    let payload: McpUploadTicketPayload;
    try {
      payload = await this.jwt.verifyAsync<McpUploadTicketPayload>(ticket, {
        secret: MCP_UPLOAD_TICKET_SECRET,
      });
    } catch {
      // Expired and forged are answered identically: a caller learns only that
      // this URL is no longer worth trying.
      return Result.fail(
        'That upload link is invalid or has expired — call create_upload_url for a new one.',
      );
    }

    if (payload.pur !== TICKET_PURPOSE || !payload.tnt) {
      return Result.fail('That upload link is invalid or has expired — call create_upload_url.');
    }

    // curl labels a part it doesn't recognise `application/octet-stream`, which
    // the accepted-type check would reject even for a plain `.png`. The file name
    // is the better witness whenever the declared type is that placeholder.
    const declared = file.contentType?.trim() ?? '';
    const contentType =
      declared && declared !== 'application/octet-stream'
        ? declared
        : contentTypeFromName(file.originalName) || declared;
    if (!contentType) {
      return Result.fail(
        `Could not tell what "${file.originalName}" is — give the file an extension ` +
          '(bug.png, spec.pdf) before uploading it.',
      );
    }

    try {
      const stored = await this.uploadMedia.execute(payload.tnt, {
        buffer: file.buffer,
        contentType,
        originalName: file.originalName,
        size: file.size,
      });
      return Result.ok(stored);
    } catch (err) {
      // Same reasoning as the base64 path: storage-not-configured and
      // type/size refusals already carry a sentence written for a person, and
      // that sentence is what sends someone to Settings → Storage.
      return Result.fail((err as Error).message);
    }
  }
}
