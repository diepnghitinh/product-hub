import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { IAppSettingsRepository } from '@application/app-settings/repositories/app-settings.repository';
import {
  DEFAULT_MAX_DOC_MB,
  defaultStorageConfig,
} from '@application/app-settings/domain/storage.types';
import { classifyUpload } from '../domain/upload-kind';
import { IStorageService } from '../storage.port';

/** A stored file read back, ready to be written to the response. */
export interface FetchedUpload {
  buffer: Buffer;
  /** What to serve it as — re-derived here, never echoed from the origin. */
  contentType: string;
  filename: string;
  /** Whether it's safe to render in place (`inline`) or must be downloaded. */
  inline: boolean;
}

/** How long to wait on the storage origin before giving up. */
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Read one file back out of the tenant's own storage, through the API.
 *
 * The frontend could link straight at the storage URL — and for a download it
 * does. This exists for the *viewer*: rendering a spreadsheet or a Word file in
 * the browser means reading its bytes with `fetch`, and the storage origin
 * (S3, MinIO, Azure) is cross-origin, so that read needs CORS the bucket almost
 * never has. Proxying makes the bytes same-origin, and means an admin doesn't
 * have to hand-configure CORS on their bucket for previews to work.
 *
 * Two things are deliberately strict:
 *
 * - **Only this tenant's storage.** The URL must sit under the prefix this
 *   tenant's own config produces (`IStorageService.publicBaseUrl`). Without that
 *   check, `?url=` is a server-side request forgery hole — any signed-in user
 *   could make the API fetch `http://169.254.169.254/…` and read the reply.
 * - **The content type is re-derived, not echoed.** Same rule as upload
 *   (`classifyUpload`): the extension decides. Anything that doesn't classify
 *   is served as an opaque download, so a file that somehow got into the bucket
 *   as HTML can't come back as a page on the API's own origin.
 */
@Injectable()
export class FetchUploadUseCase {
  constructor(
    @Inject(IAppSettingsRepository) private readonly settingsRepo: IAppSettingsRepository,
    @Inject(IStorageService) private readonly storage: IStorageService,
  ) {}

  async execute(tenantId: string, url: string): Promise<FetchedUpload> {
    const settings = await this.settingsRepo.findByTenant(tenantId);
    const config = settings?.storage ?? defaultStorageConfig();
    const base = this.storage.publicBaseUrl(config);
    if (!base) {
      throw new BadRequestException(
        'Media storage is not configured. Ask an admin to set it up in Settings → Storage.',
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('That is not a valid file URL.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BadRequestException('That is not a valid file URL.');
    }
    // `base + '/'` on purpose: a bare `startsWith(base)` would also accept a
    // look-alike host that merely begins with the same characters.
    if (!url.startsWith(`${base}/`)) {
      throw new ForbiddenException('That file is not in this workspace’s storage.');
    }

    // The largest thing any cap allows — the per-kind limit was already enforced
    // when it was uploaded, so this is only a ceiling on what we'll buffer.
    const capMb = Math.max(
      config.maxVideoMb,
      config.maxImageMb,
      config.maxDocMb ?? DEFAULT_MAX_DOC_MB,
    );
    const capBytes = capMb * 1024 * 1024;

    let res: globalThis.Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch {
      throw new NotFoundException('That file could not be read from storage.');
    }
    if (!res.ok) throw new NotFoundException('That file could not be read from storage.');

    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > capBytes) {
      throw new PayloadTooLargeException(`That file is too large to open here (over ${capMb}MB).`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > capBytes) {
      throw new PayloadTooLargeException(`That file is too large to open here (over ${capMb}MB).`);
    }

    const path = decodeURIComponent(parsed.pathname);
    const filename = path.slice(path.lastIndexOf('/') + 1) || 'file';
    const classified = classifyUpload(res.headers.get('content-type') ?? '', filename);
    // SVG is an image the browser will happily run scripts inside, so it never
    // gets an inline render even though it classifies as one.
    const inline = !!classified && classified.contentType !== 'image/svg+xml';

    return {
      buffer,
      contentType: inline
        ? (classified as { contentType: string }).contentType
        : 'application/octet-stream',
      filename,
      inline,
    };
  }
}
