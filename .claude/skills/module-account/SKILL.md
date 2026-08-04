---
name: module-account
description: Use when working on Account — the current signed-in user's own profile page at frontend/src/features/account (avatar upload/crop, change-password). Related to module-users, module-auth, module-storage.
---

# Module: Account

**Apps/paths:** `frontend/src/features/account`

## Purpose
The signed-in user's self-service profile page (`/profile`), reached from the profile menu.
It shows the user's identity read-only (name, email, role) and hosts the two self-service
actions the app offers today: changing your avatar photo and changing your own password.
There is no backend module of its own — it's a thin frontend feature that calls existing
`/users/me/*` endpoints owned by [[module-users]].

## Where it lives
- Backend: none dedicated. Mutations go through `users` endpoints (see API surface below),
  owned by [[module-users]].
- Frontend:
  - `MyProfilePage.tsx` — the page itself: avatar control + identity `dl` + change-password
    trigger. Renders inside `CenteredPageLayout` with `PageHeader`.
  - `AvatarCropDialog.tsx` — dependency-free circular avatar cropper (canvas only). Decodes
    the picked file once via `lib/image` (`decodeImage`/`renderAvatarCrop`, EXIF-normalised),
    supports drag-to-pan and wheel/slider zoom, and exports a small (~256px) WebP `File`
    cropped to the circle.
  - `ChangePasswordDialog.tsx` — current + new + confirm password form; confirms match
    client-side (min length 6) before calling the backend, which re-verifies the current
    password.

## Data model & key fields
No dedicated entity — reads/writes fields on the `User` document owned by [[module-users]]:
`name`, `email`, `role`, `avatarUrl`. No new fields introduced by this module.

## API surface
Calls into the users API (`frontend/src/features/users/api.ts`), not a module-account API:
- `PUT /users/me/avatar` — `{ avatarUrl: string | null }` → returns updated `UserDto`
  (`useUpdateMyAvatar`)
- `PUT /users/me/password` — `{ currentPassword, newPassword }` (`useChangeMyPassword`)
- Avatar upload itself goes through [[module-storage]]'s `uploadMedia` (`POST /v1/uploads`)
  before the cropped file's URL is saved via `PUT /users/me/avatar`.

## Relationships to other modules
- [[module-users]]: owns the `User` entity and the `/users/me/*` endpoints this page calls;
  account is purely a UI surface over it (contrast with `PATCH /users/:id/password`, the
  admin-driven reset of *another* user's password, which lives in module-users, not here).
- [[module-auth]]: `useAuth()` supplies `user` and `updateUser` (local cache patch after a
  successful avatar/profile mutation) — no dedicated auth call from this module.
- [[module-storage]]: the crop dialog hands its output `File` to `uploadMedia`, the shared
  upload pipeline, before the resulting URL is persisted.

## Gotchas & conventions
- Language/theme are deliberately **not** on this page — they're per-browser preferences that
  live in the profile menu (sidebar footer) alongside each other, not duplicated here.
- The avatar picker clears `input.value` after reading the file so re-selecting the same file
  still fires `onChange`.
- The cropper always uploads a small (~256px) WebP it renders itself, never the original
  picked file — keeps avatar uploads tiny regardless of source image size.
- Password change requires the *current* password (backend re-checks it); there is no
  "forgot password" email flow in this app — only self-service change while signed in and the
  admin-driven reset in module-users.

## Related skills
[[module-users]] [[module-auth]] [[module-storage]]
