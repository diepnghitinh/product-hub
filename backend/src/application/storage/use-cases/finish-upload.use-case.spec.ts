import { BadRequestException } from '@nestjs/common';
import { StorageProvider, defaultStorageConfig } from '@application/app-settings/domain/storage.types';
import { FinishUploadUseCase } from './finish-upload.use-case';
import type { CloudStorageConfig } from '@application/app-settings/domain/storage.types';
import type { MultipartRef } from '../storage.port';

const REF: MultipartRef = { key: 'uploads/2026-09-18/abc-clip.mp4', uploadId: 'upload-1' };

class FakeSettings {
  constructor(private readonly storage: CloudStorageConfig) {}
  async findByTenant() {
    return { storage: this.storage } as never;
  }
}

class FakeStorage {
  completed?: { ref: MultipartRef; etags: string[]; bucket?: string };
  aborted?: MultipartRef;
  async completeMultipartUpload(config: CloudStorageConfig, ref: MultipartRef, etags: string[]) {
    this.completed = { ref, etags, bucket: config.s3Bucket };
    return { url: `https://ph-media.s3.amazonaws.com/${ref.key}`, key: ref.key };
  }
  async abortMultipartUpload(_config: CloudStorageConfig, ref: MultipartRef) {
    this.aborted = ref;
  }
}

function makeUseCase() {
  const config: CloudStorageConfig = {
    ...defaultStorageConfig(),
    provider: StorageProvider.S3,
    s3Bucket: 'ph-media',
  };
  const storage = new FakeStorage();
  const useCase = new FinishUploadUseCase(new FakeSettings(config) as never, storage as never);
  return { useCase, storage };
}

describe('FinishUploadUseCase', () => {
  it('joins the parts in the order they were given and answers with the public URL', async () => {
    const { useCase, storage } = makeUseCase();
    const result = await useCase.complete('t1', REF, ['"a1"', '"b2"', '"c3"']);
    expect(storage.completed?.etags).toEqual(['"a1"', '"b2"', '"c3"']);
    expect(storage.completed?.ref).toEqual(REF);
    expect(result.url).toContain(REF.key);
    expect(result.url).not.toContain('X-Amz-Signature');
  });

  it('reads the bucket from the tenant, never from the request', async () => {
    const { useCase, storage } = makeUseCase();
    await useCase.complete('t1', REF, ['"a1"']);
    expect(storage.completed?.bucket).toBe('ph-media');
  });

  it('refuses to join a part that never uploaded, rather than store a file with a hole', async () => {
    const { useCase, storage } = makeUseCase();
    await expect(useCase.complete('t1', REF, ['"a1"', '', '"c3"'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.completed).toBeUndefined();
  });

  it('refuses an empty part list', async () => {
    const { useCase } = makeUseCase();
    await expect(useCase.complete('t1', REF, [])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bins an upload that will not finish, so its parts stop being billed', async () => {
    const { useCase, storage } = makeUseCase();
    await useCase.abort('t1', REF);
    expect(storage.aborted).toEqual(REF);
  });
});
