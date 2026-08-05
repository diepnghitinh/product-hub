import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import {
  CloudStorageConfig,
  DEFAULT_MAX_DOC_MB,
  StorageProvider,
} from '@application/app-settings/domain/storage.types';
import { UploadKind, classifyUpload } from './upload-kind';

/** What each kind is called when it's too big, and which cap it answers to. */
const KIND_LABEL: Record<UploadKind, string> = {
  [UploadKind.IMAGE]: 'Image',
  [UploadKind.VIDEO]: 'Video',
  [UploadKind.DOCUMENT]: 'File',
};

/** A file that passed the gate: what it is, and what type to store it under. */
export interface UploadPlan {
  kind: UploadKind;
  contentType: string;
}

/**
 * Decide whether a file may be stored, and under what type — the single gate
 * both upload paths go through.
 *
 * It lives here rather than in a use-case because the **chunked** path has to
 * ask the same question *before* a byte arrives (from the declared size), and
 * the single-shot path asks it with the bytes already in hand. Two copies of a
 * size cap is how a 400MB video gets in through the side door.
 */
export function planUpload(
  config: CloudStorageConfig,
  file: { contentType: string; originalName: string; size: number },
): UploadPlan {
  if (config.provider === StorageProvider.NONE) {
    throw new BadRequestException(
      'Media storage is not configured. Ask an admin to set it up in Settings → Storage.',
    );
  }

  const classified = classifyUpload(file.contentType, file.originalName);
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
