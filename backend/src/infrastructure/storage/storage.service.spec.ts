import { BROWSER_UPLOAD_CORS, allowsBrowserUpload } from './storage.service';
import type { CORSRule } from '@aws-sdk/client-s3';

/**
 * This one predicate decides, silently, whether a workspace gets direct browser
 * uploads or quietly spends forever on the slow path through the API — it is the
 * "leave the bucket alone, it's already configured" guard. Nothing surfaces when
 * it gets that wrong, so it is worth pinning down here rather than in an
 * integration test that only runs when someone has MinIO up.
 */
describe('allowsBrowserUpload', () => {
  it('accepts the rule the app writes', () => {
    expect(allowsBrowserUpload(BROWSER_UPLOAD_CORS)).toBe(true);
  });

  it('rejects a rule that allows PUT but hides the ETag', () => {
    // The dangerous shape: every part uploads happily and the file can never be
    // joined, because the browser is not allowed to read back what joins them.
    const rule: CORSRule = { AllowedMethods: ['PUT', 'GET'], AllowedOrigins: ['*'] };
    expect(allowsBrowserUpload(rule)).toBe(false);
  });

  it('rejects a read-only rule even when it exposes ETag', () => {
    const rule: CORSRule = {
      AllowedMethods: ['GET', 'HEAD'],
      AllowedOrigins: ['*'],
      ExposeHeaders: ['ETag'],
    };
    expect(allowsBrowserUpload(rule)).toBe(false);
  });

  it('matches the exposed header however it is cased or padded', () => {
    const rule: CORSRule = {
      AllowedMethods: ['PUT'],
      AllowedOrigins: ['*'],
      ExposeHeaders: [' etag '],
    };
    expect(allowsBrowserUpload(rule)).toBe(true);
  });

  it('takes the wildcard some S3-compatible servers allow', () => {
    const rule: CORSRule = { AllowedMethods: ['PUT'], AllowedOrigins: ['*'], ExposeHeaders: ['*'] };
    expect(allowsBrowserUpload(rule)).toBe(true);
  });

  it('rejects a rule with nothing in it rather than assuming the bucket is fine', () => {
    // The SDK types both lists as required; a bucket can still answer with less.
    expect(allowsBrowserUpload({} as CORSRule)).toBe(false);
  });
});
