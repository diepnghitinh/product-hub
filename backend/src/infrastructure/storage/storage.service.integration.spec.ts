import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageProvider, defaultStorageConfig } from '@application/app-settings/domain/storage.types';
import { MULTIPART_PART_SIZE_BYTES } from '@application/storage/use-cases/upload-policy';
import { StorageService } from './storage.service';
import type { CloudStorageConfig } from '@application/app-settings/domain/storage.types';

/**
 * The presigned upload against a real S3-compatible server, because the parts
 * that can go wrong here don't go wrong in a mock: which headers end up inside
 * the signature, whether the bucket gets created, what the object is stored as.
 *
 * Opt-in. Point `S3_TEST_ENDPOINT` at a MinIO and it runs; without one the suite
 * skips rather than failing a machine that has no container running:
 *
 *   docker run -d --name ph-minio-test -p 19000:9000 \
 *     -e MINIO_ROOT_USER=testkey -e MINIO_ROOT_PASSWORD=testsecret123 \
 *     quay.io/minio/minio:latest server /data
 *   S3_TEST_ENDPOINT=http://127.0.0.1:19000 npx jest storage.service.integration
 */
const endpoint = process.env.S3_TEST_ENDPOINT;
const describeIf = endpoint ? describe : describe.skip;

function config(): CloudStorageConfig {
  return {
    ...defaultStorageConfig(),
    provider: StorageProvider.S3,
    s3Endpoint: endpoint,
    s3Region: 'us-east-1',
    s3Bucket: `ph-presign-test`,
    s3AccessKeyId: process.env.S3_TEST_KEY || 'testkey',
    s3SecretAccessKey: process.env.S3_TEST_SECRET || 'testsecret123',
  };
}

/** A plain client for reading back what the signed PUT stored. */
function client(): S3Client {
  const c = config();
  return new S3Client({
    region: c.s3Region,
    endpoint: c.s3Endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: c.s3AccessKeyId as string,
      secretAccessKey: c.s3SecretAccessKey as string,
    },
  });
}

/** `http://host/bucket/uploads/2026-09-18/uuid-spec.pdf` → the object key. */
function keyOf(publicUrl: string): string {
  return new URL(publicUrl).pathname.replace(`/${config().s3Bucket}/`, '');
}

describeIf('StorageService.createUploadUrl (against a real S3 endpoint)', () => {
  const service = new StorageService();
  const pdf = Buffer.from('%PDF-1.4 presigned');

  it('signs a URL the browser can PUT to, and creates the bucket on the way', async () => {
    const signed = await service.createUploadUrl(config(), {
      originalName: 'spec.pdf',
      contentType: 'application/pdf',
      size: pdf.length,
    });
    expect(signed).not.toBeNull();

    const res = await fetch(signed!.uploadUrl, {
      method: 'PUT',
      headers: signed!.headers,
      body: pdf,
    });
    expect(res.status).toBe(200);

    // The public URL is the durable one — the signature belongs to the PUT and
    // must not leak into what gets stored on a comment or a doc.
    expect(signed!.url).not.toContain('X-Amz-Signature');

    // And the object landed under the type we signed for. Read with credentials:
    // whether the bucket is *publicly* readable is the admin's policy to set
    // (MinIO ships private), and has nothing to do with the upload working.
    const head = await client().send(
      new HeadObjectCommand({ Bucket: config().s3Bucket, Key: keyOf(signed!.url) }),
    );
    expect(head.ContentType).toBe('application/pdf');
    expect(head.ContentLength).toBe(pdf.length);
  }, 30_000);

  it('refuses a PUT that understates its size, so the tenant cap cannot be walked around', async () => {
    const signed = await service.createUploadUrl(config(), {
      originalName: 'small.pdf',
      contentType: 'application/pdf',
      size: pdf.length,
    });
    const res = await fetch(signed!.uploadUrl, {
      method: 'PUT',
      headers: signed!.headers,
      body: Buffer.alloc(50_000, 'x'),
    });
    expect(res.status).toBe(403);
  }, 30_000);

  it('refuses a PUT that relabels the file, so a .pdf cannot be stored as a web page', async () => {
    const signed = await service.createUploadUrl(config(), {
      originalName: 'spec.pdf',
      contentType: 'application/pdf',
      size: pdf.length,
    });
    const res = await fetch(signed!.uploadUrl, {
      method: 'PUT',
      headers: { ...signed!.headers, 'Content-Type': 'text/html' },
      body: pdf,
    });
    expect(res.status).toBe(403);
  }, 30_000);

  it('uploads a large file in parts and joins them into one object', async () => {
    // Two full parts and a remainder, so the "every part but the last is exactly
    // partSize" rule is actually exercised rather than assumed.
    const size = 2 * MULTIPART_PART_SIZE_BYTES + 1234;
    const body = Buffer.alloc(size, 'v');

    const upload = await service.createMultipartUpload(config(), {
      originalName: 'clip.mp4',
      contentType: 'video/mp4',
      size,
    });
    expect(upload).not.toBeNull();
    expect(upload!.partUrls).toHaveLength(3);

    const etags: string[] = [];
    for (let i = 0; i < upload!.partUrls.length; i += 1) {
      const start = i * upload!.partSize;
      const res = await fetch(upload!.partUrls[i], {
        method: 'PUT',
        body: body.subarray(start, Math.min(start + upload!.partSize, size)),
      });
      expect(res.status).toBe(200);
      const etag = res.headers.get('etag');
      expect(etag).toBeTruthy();
      etags.push(etag as string);
    }

    const done = await service.completeMultipartUpload(
      config(),
      { key: upload!.key, uploadId: upload!.uploadId },
      etags,
    );
    expect(done.url).toBe(upload!.url);

    // One object, the whole file, stored under the type the API chose — the parts
    // never carried one, so it could not have been talked out of it.
    const head = await client().send(
      new HeadObjectCommand({ Bucket: config().s3Bucket, Key: upload!.key }),
    );
    expect(head.ContentLength).toBe(size);
    expect(head.ContentType).toBe('video/mp4');
  }, 60_000);

  it('refuses a part that is bigger than the one it signed', async () => {
    const size = 2 * MULTIPART_PART_SIZE_BYTES;
    const upload = await service.createMultipartUpload(config(), {
      originalName: 'clip.mp4',
      contentType: 'video/mp4',
      size,
    });
    const res = await fetch(upload!.partUrls[0], {
      method: 'PUT',
      body: Buffer.alloc(MULTIPART_PART_SIZE_BYTES + 5000, 'v'),
    });
    expect(res.status).toBe(403);
    await service.abortMultipartUpload(config(), {
      key: upload!.key,
      uploadId: upload!.uploadId,
    });
  }, 60_000);

  it('leaves nothing behind when an upload is binned', async () => {
    const size = 2 * MULTIPART_PART_SIZE_BYTES;
    const upload = await service.createMultipartUpload(config(), {
      originalName: 'abandoned.mp4',
      contentType: 'video/mp4',
      size,
    });
    await fetch(upload!.partUrls[0], {
      method: 'PUT',
      body: Buffer.alloc(MULTIPART_PART_SIZE_BYTES, 'v'),
    });
    await service.abortMultipartUpload(config(), {
      key: upload!.key,
      uploadId: upload!.uploadId,
    });

    // The part is gone, and so is any chance of finishing the upload.
    await expect(
      service.completeMultipartUpload(
        config(),
        { key: upload!.key, uploadId: upload!.uploadId },
        ['"whatever"'],
      ),
    ).rejects.toBeDefined();
  }, 60_000);

  it('has nothing to sign for Azure — that tenant uploads through the API', async () => {
    const signed = await service.createUploadUrl(
      { ...config(), provider: StorageProvider.AZURE, azureContainer: 'media' },
      { originalName: 'a.png', contentType: 'image/png', size: 10 },
    );
    expect(signed).toBeNull();
  });
});
