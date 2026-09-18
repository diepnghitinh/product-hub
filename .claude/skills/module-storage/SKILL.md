---
name: module-storage
description: Use when working on Storage / Uploads — the tenant-configured S3/Azure file upload pipeline behind POST /v1/uploads (presigned direct-to-bucket, multipart for large files, API passthrough as fallback), at backend/src/{presentation,application,infrastructure}/storage and frontend/src/features/uploads. Related to module-app-settings (storage credentials live there), module-bugs/module-issues/module-docs (comment and doc attachments), module-auth.
---

# Module: Storage / Uploads

**Apps/paths:** `backend/src/presentation/storage`, `backend/src/application/storage`, `backend/src/infrastructure/storage`, `frontend/src/features/uploads`

## Purpose
Lets any authenticated user upload an image, short video, or office/PDF/text document to the tenant's own cloud bucket (S3 or Azure Blob) and get back a public URL. There is no local file model — uploads are stateless pass-through storage used to attach media to comments, docs, and other rich content elsewhere in the app.

## The three routes — read this first
Bytes normally go **browser → bucket**, never through the API. `POST /uploads/presign` judges the
file and answers with the route it takes; the client reads the answer rather than deciding:

| the answer has | route | when |
|---|---|---|
| `uploadId` set | **multipart** — one signed PUT per 5MiB part, then `multipart/complete` joins them | S3, file ≥ `MULTIPART_THRESHOLD_BYTES` (10MiB) |
| `uploadUrl` set | **one signed PUT** | S3, smaller file |
| neither | **`POST /uploads`** — bytes through the API | Azure (a blob SAS can't sign headers, so it can't pin the content type) |

The frontend also falls back to `POST /uploads` at runtime when a direct upload never leaves the
browser (bucket CORS), and when `/uploads/presign` 404s (an API mid-rolling-deploy).

## Where it lives
- Backend:
  - Controller: `uploads.controller.ts` — `UploadsController` (`POST /uploads/presign`, `POST /uploads/multipart/complete`, `POST /uploads/multipart/abort`, `POST /uploads`, `POST /uploads/test-connection`)
  - Use-cases: `CreateUploadUrlUseCase` (judges the file, signs the route), `FinishUploadUseCase` (`complete`/`abort` a multipart upload), `UploadMediaUseCase` (the API-passthrough fallback), `TestStorageConnectionUseCase` (verifies admin-entered credentials before saving)
  - Policy: `use-cases/upload-policy.ts` — `resolveUpload()` plus `UPLOAD_HARD_LIMIT_BYTES`, `MULTIPART_PART_SIZE_BYTES`, `MULTIPART_THRESHOLD_BYTES`, `MULTIPART_MAX_PARTS`
  - Domain: `upload-kind.ts` — `UploadKind` enum (`image`/`video`/`document`) and `classifyUpload()`
  - Port: `storage.port.ts` — `IStorageService` abstract class (`upload`, `createUploadUrl`, `createMultipartUpload`, `completeMultipartUpload`, `abortMultipartUpload`, `testConnection`)
  - Infra: `storage.service.ts` — `StorageService`, the S3 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) + Azure (`@azure/storage-blob`) implementation, wired in `infrastructure/storage/storage.module.ts`
  - Tests: `create-upload-url.use-case.spec.ts`, `finish-upload.use-case.spec.ts`, and `storage.service.integration.spec.ts` — the last one runs against a real MinIO, opt-in via `S3_TEST_ENDPOINT` (the command is in its header comment), skipped otherwise
- Frontend:
  - `frontend/src/features/uploads/api.ts` — `uploadMedia(file)` (plain async, used outside React too) and `useUploadMedia()` mutation
  - `frontend/src/features/uploads/useMediaAttachments.ts` — `useMediaAttachments()` hook: staged-files state for a composer, sequential upload, drag/drop/paste handlers
  - Consumers: `components/MediaUploader.tsx`, `components/ui/RichTextEditor.tsx`, `lib/editor/ResizableImageTool.ts`, `features/activity/CommentThread.tsx` & `CommentMedia.tsx`, `features/docs/components/DocAttachments.tsx`, `features/users/api.ts` (avatar), `features/account/MyProfilePage.tsx`

## Data model & key fields
No persisted entity/collection — storage is per-request pass-through. Key shapes:
- `UploadFileInput` (application): `{ buffer, contentType, originalName, size }`
- `UploadedMedia` (infra result): `{ url, key }`
- `UploadedMediaResult` (API response, flat): `{ url, name, contentType, size }`
- `PresignedUploadResult` (API response, flat): `{ uploadUrl, url, name, contentType, size, headers, expiresInSeconds, uploadId, key, partSize, partUrls }` — blank/`0`/`[]` rather than absent fields, so the shape a caller destructures never changes between routes
- `MultipartUpload` (infra result): `{ uploadId, key, url, partSize, partUrls, expiresInSeconds }`; `MultipartRef`: `{ key, uploadId }`
- `UploadKind` enum: `image | video | document`
- `CloudStorageConfig` (owned by `module-app-settings`, `backend/src/application/app-settings/domain/storage.types.ts`): `provider` (`StorageProvider.NONE|S3|AZURE`), `s3Bucket`/`s3Region`/`s3Endpoint`/`s3AccessKeyId`/`s3SecretAccessKey`/`s3PublicBaseUrl`, `azureConnectionString`/`azureContainer`, `maxVideoMb`, `maxImageMb`, `maxDocMb?` (defaults to `DEFAULT_MAX_DOC_MB = 25`). This config is per-tenant and edited in Settings → Storage, then read fresh on every upload — not wired once at boot.
- Object keys are foldered by UTC day: `uploads/yyyy-mm-dd/<uuid>-<sanitized-filename>`.

## API surface
- `POST /v1/uploads/presign` — **the main door.** Body `CreateUploadUrlDto` (`name`, `contentType?`, `size`) — no bytes. Judges the file with `resolveUpload` *before* anything is sent, so an over-cap or unaccepted file is refused instantly with the same wording it always had. Returns `PresignedUploadResult` (flat), whose `uploadId`/`uploadUrl` pick the route above.
- `POST /v1/uploads/multipart/complete` — body `CompleteUploadDto` (`key`, `uploadId`, `etags[]` in part order); joins the parts and returns `{ url }`. **This call, not the last part PUT, is what finishes the upload** — the object does not exist until the parts are joined.
- `POST /v1/uploads/multipart/abort` — body `MultipartRefDto` (`key`, `uploadId`); bins an upload that will not finish so its parts stop being billed.
- `POST /v1/uploads` — the fallback. Multipart `file` field; returns `UploadedMediaResult`. Hard ceiling 250MB at the interceptor; the real per-kind cap (from tenant config) is enforced in `UploadMediaUseCase` with a friendly 413 message.
- `POST /v1/uploads/test-connection` — `Role.ADMIN` only; body is `UpdateStorageDto` (partial config, secrets may be blank/merged over the saved config); verifies bucket/container reachability, throws 400 with the provider's reason on failure.

## Relationships to other modules
- **module-app-settings** owns `CloudStorageConfig`/`IAppSettingsRepository` — storage reads the tenant's saved config on every call rather than caching it, so an admin's Settings → Storage edit takes effect immediately.
- **module-bugs** / **module-issues** — comment attachments and bug-report screenshots go through `useMediaAttachments`/`uploadMedia` before being attached as URLs.
- **module-docs** — `DocAttachments.tsx` and the rich-text editor's image tool (`ResizableImageTool.ts`) upload inline images/files the same way.
- **module-users** / **module-account** — avatar upload (`features/users/api.ts`, `MyProfilePage.tsx`) reuses the same `/uploads` endpoint.
- **module-auth** — every upload call requires a valid JWT (`AuthUser`/`JwtPayload`); the tenant is taken from the auth token, never the request body.

## Gotchas & conventions
- For documents, the file **extension** decides the stored content-type (via `DOCUMENT_TYPE_BY_EXT`), not the browser-supplied MIME type — this stops a mislabeled file (e.g. `spec.pdf` sent as `text/html`) from being served back as a web page from the storage domain.
- `classifyUpload` returns `null` for anything not image/video/whitelisted document; the use-case turns that into a 400.
- Per-kind size caps come from the tenant's `CloudStorageConfig`, not a hardcoded constant — video defaults to `maxVideoMb`, docs fall back to `DEFAULT_MAX_DOC_MB` only when the saved config predates document uploads (`maxDocMb` absent).
- S3 upload auto-creates the configured bucket on first `NoSuchBucket` error and retries once, so admins don't need to pre-provision it; Azure has no such fallback (`assertAzure` just validates connection string + container are present).
- `IStorageService` is a provider-agnostic port — `StorageProvider.NONE` short-circuits with a "storage not configured" 400 before hitting the port at all.
- **The API never sees a byte on the direct routes.** It signs, then the browser talks to the bucket. Two small JSON calls per multipart upload (presign + complete), one per single PUT.
- **Both direct routes pin the stored content type, by different means.** Single PUT: `getSignedUrl(..., { signableHeaders: new Set(['content-type']) })` — the presigner leaves content-type *unsigned* by default, and without this a `spec.pdf` can be stored as `text/html`. Multipart: the type is set once on `CreateMultipartUpload` by the server and the parts carry no `Content-Type` at all (`file.slice()` with no third argument gives an empty blob type, so the browser sends none).
- **Sizes are signed too**, so a client that understates its file gets a 403 from the provider rather than a way around the tenant's cap — `ContentLength` on the single PUT, and the exact per-part length on each `UploadPart` (last part is the remainder).
- `prepareBucket()` runs **before** signing and is cached per bucket per process: a presigned URL can't react to `NoSuchBucket` the way a server-side PUT can. It also sets, best-effort, the bucket's CORS rule and the `AbortIncompleteMultipartUpload` lifecycle rule — both log a warning and continue on failure, because neither is worth failing an upload over.
- **`ExposeHeaders: ETag` in the bucket CORS is load-bearing for multipart** — parts are joined by their ETags, and without it the parts upload fine and the file can never be finished. The frontend detects exactly this and falls back to the API with a message naming it. `ensureBucketCors` therefore treats a bucket as already-configured only when a rule has **both** `PUT` and an ETag (or `*`) in `ExposeHeaders` — `allowsBrowserUpload()`, exported and unit-tested in `storage.service.spec.ts`, because a PUT-only rule would otherwise pin a tenant to the slow path forever with nothing logged.
- **`backend/scripts/check-storage-cors.ts`** (`npm run storage:cors`, `-- --apply [--origin=https://app…]`) audits every S3 workspace's bucket from the saved `CloudStorageConfig` and reports/fixes those two rules — it imports `allowsBrowserUpload`/`BROWSER_UPLOAD_CORS`/`ABANDONED_PARTS_RULE` from the service so the audit can't disagree with the upload path. Read-only without `--apply`; additive; needs an explicit `MONGODB_URI` under `NODE_ENV=prod`.
- The lifecycle rule deliberately has **no `Expiration`** — it deletes unfinished *parts*, never a stored file. MinIO refuses an abort-only rule and logs a warning; harmless, since it expires stale uploads itself after 24h. Only AWS actually needs the rule.
- Keys coming back from the client (`complete`/`abort`) are validated against the shape `buildKey` produces, and the bucket is always read from the caller's own tenant settings — never from the request.
- Frontend: a part that drops mid-transfer is retried **on its own** (3 attempts, widening backoff), which is the whole point of multipart here. A failure where *no bytes moved* is not retried — that's a blocked CORS preflight, indistinguishable from a disconnect except by whether `xhr.upload.onprogress` ever fired. Progress reaches 100 only after `complete` returns.
- Frontend `uploadMedia` is a plain async function (not just a hook) so it can be called from non-React code like the ProseMirror/editor image tool.
- `useMediaAttachments` uploads staged files **sequentially**, so one failed file doesn't abort the rest of the batch.
- `useMediaAttachments`'s `isMediaFile` filter only accepts `image/*`/`video/*` — a composer built on it can never stage a document. `DocAttachments.tsx` needs PDFs/Office files too, so it skips the hook and calls `uploadMedia` directly per file, with its own `ACCEPT` list (`.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.rtf,image/*`).
- Avatar uploads pre-compress client-side first: `lib/image.ts`'s `compressAvatar` cover-crops to a square and re-encodes as WebP (a multi-MB photo typically lands under 40KB) before the result `File` is handed to `uploadMedia` — see `module-account`'s crop dialog.

## Related skills
[[module-app-settings]] [[module-bugs]] [[module-issues]] [[module-docs]] [[module-users]] [[module-account]] [[module-auth]]
