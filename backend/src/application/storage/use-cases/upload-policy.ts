import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import {
  CloudStorageConfig,
  DEFAULT_MAX_DOC_MB,
  StorageProvider,
} from '@application/app-settings/domain/storage.types';
import { UploadKind, classifyUpload, contentTypeFromName } from '../domain/upload-kind';

/**
 * A generous hard ceiling, enforced before the tenant's own per-kind caps get a
 * look in. On the multipart route it's what multer refuses at; on the presign
 * route it's what the DTO refuses at — same number either way, so a file can't be
 * larger through one door than the other. Anything past it is almost certainly
 * abuse rather than a screen recording.
 */
export const UPLOAD_HARD_LIMIT_BYTES = 250 * 1024 * 1024;

/**
 * Bytes per part on the multipart route. 5MiB is not a preference — it is S3's
 * minimum for every part but the last, and going under it makes `CompleteMultipart`
 * fail at the very end, after the whole file has been uploaded.
 *
 * It is also the granularity of a lost connection: a part that drops is re-sent,
 * and nothing else is. Bigger parts mean fewer round trips and more to lose.
 */
export const MULTIPART_PART_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Below this a single signed PUT is used instead.
 *
 * Two parts is the least that buys anything — with one part, multipart is a plain
 * PUT wrapped in two extra API calls. So the threshold is exactly two parts, and
 * small files (most images, most documents) keep the simpler, one-round-trip path.
 */
export const MULTIPART_THRESHOLD_BYTES = 2 * MULTIPART_PART_SIZE_BYTES;

/**
 * Every part is signed up front, so the ceiling above decides how many signatures
 * one request produces: 250MB ÷ 5MiB = 50. Cheap to compute, small to send, and a
 * client that asks for more than this was refused before it got here.
 */
export const MULTIPART_MAX_PARTS = Math.ceil(UPLOAD_HARD_LIMIT_BYTES / MULTIPART_PART_SIZE_BYTES);

/** What each kind is called when it's too big, and which cap it answers to. */
const KIND_LABEL: Record<UploadKind, string> = {
  [UploadKind.IMAGE]: 'Image',
  [UploadKind.VIDEO]: 'Video',
  [UploadKind.DOCUMENT]: 'File',
};

/** Everything the rules need to know about a file — bytes not included. */
export interface UploadCandidate {
  contentType: string;
  originalName: string;
  size: number;
}

/**
 * The one place a file is judged: storage configured, type accepted, size within
 * the tenant's cap. Returns the content type it should be **stored** under, which
 * is not always the one the browser claimed — see `classifyUpload`.
 *
 * Shared by both doors so they cannot drift: the API upload has the bytes in hand
 * when it asks, the presigned upload asks *before* any byte is sent. That is the
 * whole reason this is a function over a description of the file rather than a
 * step inside the use-case that stores it.
 */
export function resolveUpload(
  config: CloudStorageConfig,
  file: UploadCandidate,
): { kind: UploadKind; contentType: string } {
  if (config.provider === StorageProvider.NONE) {
    throw new BadRequestException(
      'Media storage is not configured. Ask an admin to set it up in Settings → Storage.',
    );
  }

  // A browser normally sends a type, but not always — `.md` and `.csv` routinely
  // arrive blank, and a drag from some apps sends nothing at all. The name is the
  // better witness then, exactly as it is on the MCP upload path.
  const declared = file.contentType?.trim() || contentTypeFromName(file.originalName);
  const classified = classifyUpload(declared, file.originalName);
  if (!classified) {
    throw new BadRequestException(
      'That file type cannot be uploaded — images, videos, PDFs, Office documents and text files are accepted.',
    );
  }

  const capMb =
    classified.kind === UploadKind.VIDEO
      ? config.maxVideoMb
      : classified.kind === UploadKind.DOCUMENT
        ? // Absent on configs saved before documents were uploadable.
          (config.maxDocMb ?? DEFAULT_MAX_DOC_MB)
        : config.maxImageMb;
  if (file.size > capMb * 1024 * 1024) {
    throw new PayloadTooLargeException(
      `${KIND_LABEL[classified.kind]} is too large — the limit is ${capMb}MB.`,
    );
  }

  return classified;
}
