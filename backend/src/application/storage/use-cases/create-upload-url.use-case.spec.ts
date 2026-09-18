import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { StorageProvider, defaultStorageConfig } from '@application/app-settings/domain/storage.types';
import { CreateUploadUrlUseCase } from './create-upload-url.use-case';
import { UploadMediaUseCase } from './upload-media.use-case';
import {
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_THRESHOLD_BYTES,
} from './upload-policy';
import type { CloudStorageConfig } from '@application/app-settings/domain/storage.types';
import type { PresignInput } from '../storage.port';

function configured(overrides: Partial<CloudStorageConfig> = {}): CloudStorageConfig {
  return {
    ...defaultStorageConfig(),
    provider: StorageProvider.S3,
    s3Bucket: 'ph-media',
    maxVideoMb: 30,
    maxImageMb: 10,
    maxDocMb: 25,
    ...overrides,
  };
}

class FakeSettings {
  constructor(private readonly storage: CloudStorageConfig) {}
  async findByTenant() {
    return { storage: this.storage } as never;
  }
}

class FakeStorage {
  signed?: PresignInput;
  opened?: PresignInput;
  uploaded?: { contentType: string };
  /** Set for a provider that can't sign — what the real service returns for Azure. */
  canSign = true;
  /** Independently settable: a provider may sign a PUT but have no multipart. */
  canMultipart = true;
  async createUploadUrl(_config: CloudStorageConfig, input: PresignInput) {
    this.signed = input;
    if (!this.canSign) return null;
    return {
      uploadUrl: `https://ph-media.s3.amazonaws.com/uploads/x?X-Amz-Signature=abc`,
      url: `https://ph-media.s3.amazonaws.com/uploads/x`,
      headers: { 'Content-Type': input.contentType },
      expiresInSeconds: 3600,
    };
  }
  async createMultipartUpload(_config: CloudStorageConfig, input: PresignInput) {
    this.opened = input;
    if (!this.canSign || !this.canMultipart) return null;
    const partSize = MULTIPART_PART_SIZE_BYTES;
    const count = Math.ceil(input.size / partSize);
    return {
      uploadId: 'upload-1',
      key: 'uploads/2026-09-18/abc-clip.mp4',
      url: 'https://ph-media.s3.amazonaws.com/uploads/2026-09-18/abc-clip.mp4',
      partSize,
      partUrls: Array.from({ length: count }, (_, i) => `https://ph-media/part/${i + 1}?sig=x`),
      expiresInSeconds: 3600,
    };
  }
  async upload(_config: CloudStorageConfig, file: { contentType: string }) {
    this.uploaded = file;
    return { url: 'https://ph-media.s3.amazonaws.com/uploads/x', key: 'uploads/x' };
  }
  async testConnection() {}
}

function makeUseCase(config: CloudStorageConfig) {
  const storage = new FakeStorage();
  const useCase = new CreateUploadUrlUseCase(new FakeSettings(config) as never, storage as never);
  return { useCase, storage };
}

describe('CreateUploadUrlUseCase', () => {
  it('signs the URL for the size the browser declared, so S3 can enforce it', async () => {
    const { useCase, storage } = makeUseCase(configured());
    const result = await useCase.execute('t1', {
      originalName: 'clip.mp4',
      contentType: 'video/mp4',
      size: 5_000_000,
    });
    expect(storage.signed?.size).toBe(5_000_000);
    expect(result.uploadUrl).toContain('X-Amz-Signature');
    expect(result.url).not.toContain('X-Amz-Signature');
    expect(result.headers['Content-Type']).toBe('video/mp4');
  });

  it('refuses an over-cap file before a byte is sent', async () => {
    const { useCase, storage } = makeUseCase(configured({ maxVideoMb: 30 }));
    await expect(
      useCase.execute('t1', {
        originalName: 'clip.mp4',
        contentType: 'video/mp4',
        size: 40 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(storage.signed).toBeUndefined();
  });

  it('refuses a type that is not accepted', async () => {
    const { useCase } = makeUseCase(configured());
    await expect(
      useCase.execute('t1', { originalName: 'payload.exe', contentType: '', size: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses when the tenant has no storage set up', async () => {
    const { useCase } = makeUseCase(defaultStorageConfig());
    await expect(
      useCase.execute('t1', { originalName: 'a.png', contentType: 'image/png', size: 10 }),
    ).rejects.toThrow(/Settings → Storage/);
  });

  it('signs the classified type, not the one the browser claimed', async () => {
    const { useCase, storage } = makeUseCase(configured());
    // A drag-and-drop with no type at all: the extension is the only witness.
    const result = await useCase.execute('t1', {
      originalName: 'spec.pdf',
      contentType: '',
      size: 1_000,
    });
    expect(storage.signed?.contentType).toBe('application/pdf');
    expect(result.contentType).toBe('application/pdf');
  });

  it('answers with an empty uploadUrl — not an error — when the provider cannot sign', async () => {
    const { useCase, storage } = makeUseCase(
      configured({ provider: StorageProvider.AZURE, azureContainer: 'media' }),
    );
    storage.canSign = false;
    const result = await useCase.execute('t1', {
      originalName: 'shot.png',
      contentType: 'image/png',
      size: 1_000,
    });
    // The verdict on the file still stands; only the road it takes changes.
    expect(result.uploadUrl).toBe('');
    expect(result.contentType).toBe('image/png');
  });

  it('sends a small file as one PUT — parts would only add round trips', async () => {
    const { useCase, storage } = makeUseCase(configured());
    const result = await useCase.execute('t1', {
      originalName: 'shot.png',
      contentType: 'image/png',
      size: MULTIPART_THRESHOLD_BYTES - 1,
    });
    expect(storage.opened).toBeUndefined();
    expect(result.uploadId).toBe('');
    expect(result.partUrls).toEqual([]);
    expect(result.uploadUrl).toContain('X-Amz-Signature');
  });

  it('sends a large file in parts, one signed URL each, so a drop costs one part', async () => {
    const { useCase, storage } = makeUseCase(configured({ maxVideoMb: 30 }));
    const size = 26 * 1024 * 1024;
    const result = await useCase.execute('t1', {
      originalName: 'clip.mp4',
      contentType: 'video/mp4',
      size,
    });
    expect(storage.opened?.size).toBe(size);
    expect(result.uploadId).toBe('upload-1');
    expect(result.partSize).toBe(MULTIPART_PART_SIZE_BYTES);
    expect(result.partUrls).toHaveLength(Math.ceil(size / MULTIPART_PART_SIZE_BYTES));
    // There is nothing to PUT the whole file to — the parts are the upload.
    expect(result.uploadUrl).toBe('');
    // And the durable URL is still signature-free.
    expect(result.url).not.toContain('X-Amz-Signature');
  });

  it('still refuses an over-cap file before opening a multipart upload', async () => {
    const { useCase, storage } = makeUseCase(configured({ maxVideoMb: 20 }));
    await expect(
      useCase.execute('t1', {
        originalName: 'clip.mp4',
        contentType: 'video/mp4',
        size: 40 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(storage.opened).toBeUndefined();
    expect(storage.signed).toBeUndefined();
  });

  it('falls back to a single PUT when the provider has no multipart', async () => {
    const { useCase, storage } = makeUseCase(configured({ maxVideoMb: 30 }));
    storage.canMultipart = false;
    const result = await useCase.execute('t1', {
      originalName: 'clip.mp4',
      contentType: 'video/mp4',
      size: 26 * 1024 * 1024,
    });
    // It asked for parts, was told no, and asked for the ordinary URL instead.
    expect(storage.opened).toBeDefined();
    expect(storage.signed).toBeDefined();
    expect(result.uploadId).toBe('');
    expect(result.uploadUrl).toContain('X-Amz-Signature');
  });

  it('applies the document cap to a document, not the image one', async () => {
    const { useCase } = makeUseCase(configured({ maxImageMb: 1, maxDocMb: 25 }));
    await expect(
      useCase.execute('t1', {
        originalName: 'deck.pptx',
        contentType: 'application/octet-stream',
        size: 5 * 1024 * 1024,
      }),
    ).resolves.toMatchObject({ name: 'deck.pptx' });
  });
});

describe('UploadMediaUseCase (the fallback door)', () => {
  it('judges a file exactly as the presign door does', async () => {
    const config = configured({ maxImageMb: 1 });
    const storage = new FakeStorage();
    const useCase = new UploadMediaUseCase(new FakeSettings(config) as never, storage as never);
    await expect(
      useCase.execute('t1', {
        buffer: Buffer.alloc(0),
        originalName: 'big.png',
        contentType: 'image/png',
        size: 2 * 1024 * 1024,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);

    // And stores under the classified type, same as the signature is built for.
    await useCase.execute('t1', {
      buffer: Buffer.alloc(0),
      originalName: 'spec.pdf',
      contentType: 'text/html',
      size: 10,
    });
    expect(storage.uploaded?.contentType).toBe('application/pdf');
  });
});
