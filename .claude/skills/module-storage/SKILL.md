---
name: module-storage
description: Use when working on Storage / Uploads — the tenant-configured S3/Azure file upload pipeline behind POST /v1/uploads, at backend/src/{presentation,application,infrastructure}/storage and frontend/src/features/uploads. Related to module-app-settings (storage credentials live there), module-bugs/module-issues/module-docs (comment and doc attachments), module-auth.
---

# Module: Storage / Uploads

**Apps/paths:** `backend/src/presentation/storage`, `backend/src/application/storage`, `backend/src/infrastructure/storage`, `frontend/src/features/uploads`

## Purpose
Lets any authenticated user upload an image, short video, or office/PDF/text document to the tenant's own cloud bucket (S3 or Azure Blob) and get back a public URL. There is no local file model — uploads are stateless pass-through storage used to attach media to comments, docs, and other rich content elsewhere in the app.

## Where it lives
- Backend:
  - Controller: `uploads.controller.ts` — `UploadsController` (`POST /uploads`, `POST /uploads/test-connection`)
  - Use-cases: `UploadMediaUseCase` (validates + stores one file), `TestStorageConnectionUseCase` (verifies admin-entered credentials before saving)
  - Domain: `upload-kind.ts` — `UploadKind` enum (`image`/`video`/`document`) and `classifyUpload()`
  - Port: `storage.port.ts` — `IStorageService` abstract class (`upload`, `testConnection`)
  - Infra: `storage.service.ts` — `StorageService`, the S3 (`@aws-sdk/client-s3`) + Azure (`@azure/storage-blob`) implementation, wired in `infrastructure/storage/storage.module.ts`
- Frontend:
  - `frontend/src/features/uploads/api.ts` — `uploadMedia(file)` (plain async, used outside React too) and `useUploadMedia()` mutation
  - `frontend/src/features/uploads/useMediaAttachments.ts` — `useMediaAttachments()` hook: staged-files state for a composer, sequential upload, drag/drop/paste handlers
  - Consumers: `components/MediaUploader.tsx`, `components/ui/RichTextEditor.tsx`, `lib/editor/ResizableImageTool.ts`, `features/activity/CommentThread.tsx` & `CommentMedia.tsx`, `features/docs/components/DocAttachments.tsx`, `features/users/api.ts` (avatar), `features/account/MyProfilePage.tsx`

## Data model & key fields
No persisted entity/collection — storage is per-request pass-through. Key shapes:
- `UploadFileInput` (application): `{ buffer, contentType, originalName, size }`
- `UploadedMedia` (infra result): `{ url, key }`
- `UploadedMediaResult` (API response, flat): `{ url, name, contentType, size }`
- `UploadKind` enum: `image | video | document`
- `CloudStorageConfig` (owned by `module-app-settings`, `backend/src/application/app-settings/domain/storage.types.ts`): `provider` (`StorageProvider.NONE|S3|AZURE`), `s3Bucket`/`s3Region`/`s3Endpoint`/`s3AccessKeyId`/`s3SecretAccessKey`/`s3PublicBaseUrl`, `azureConnectionString`/`azureContainer`, `maxVideoMb`, `maxImageMb`, `maxDocMb?` (defaults to `DEFAULT_MAX_DOC_MB = 25`). This config is per-tenant and edited in Settings → Storage, then read fresh on every upload — not wired once at boot.
- Object keys are foldered by UTC day: `uploads/yyyy-mm-dd/<uuid>-<sanitized-filename>`.

## API surface
- `POST /v1/uploads` — multipart `file` field; auth required; returns `UploadedMediaResult`. Hard ceiling 250MB at the interceptor; the real per-kind cap (from tenant config) is enforced in `UploadMediaUseCase` with a friendly 413 message.
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
- Frontend `uploadMedia` is a plain async function (not just a hook) so it can be called from non-React code like the ProseMirror/editor image tool.
- `useMediaAttachments` uploads staged files **sequentially**, so one failed file doesn't abort the rest of the batch.
- `useMediaAttachments`'s `isMediaFile` filter only accepts `image/*`/`video/*` — a composer built on it can never stage a document. `DocAttachments.tsx` needs PDFs/Office files too, so it skips the hook and calls `uploadMedia` directly per file, with its own `ACCEPT` list (`.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.rtf,image/*`).
- Avatar uploads pre-compress client-side first: `lib/image.ts`'s `compressAvatar` cover-crops to a square and re-encodes as WebP (a multi-MB photo typically lands under 40KB) before the result `File` is handed to `uploadMedia` — see `module-account`'s crop dialog.

## Related skills
[[module-app-settings]] [[module-bugs]] [[module-issues]] [[module-docs]] [[module-users]] [[module-account]] [[module-auth]]
