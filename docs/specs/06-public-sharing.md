# Spec 06 · Public Sharing

Read-only, tokenized public links let stakeholders view content **without logging in**.
Three surfaces support it: **projects**, the **bug board**, and **roadmaps**.

Models: `Project` (`publicEnabled`/`publicToken`), `Roadmap` (same), `BugShare` (global singleton).
Screens: `/public/projects/[token]`, `/public/bugs/[token]`, `/public/roadmaps/[token]`, `/public/roadmaps/[token]/[item]`.
Components: `PublicProjectView`, `PublicBugBoard`, `PublicRoadmapView`, `PublicRoadmapItemView`, `PublicDataProvider`, `ShareProjectModal`, `RoadmapShareModal`, `PublicBugShareModal`.

---

## 1. How public access works

- Each shareable object holds a boolean `publicEnabled` and an unguessable `publicToken`.
- The public URL embeds the **token**, not the id: `/public/<type>/<token>`.
- **Middleware** (`middleware.ts`) lets any path under `/public/` and `/api/public/`
  through without a session — so these pages render for logged-out visitors.
- Public pages are **strictly read-only**. No create/edit/delete/drag is exposed; the
  public API surface is limited to read (the one exception is the API-key test-case PATCH,
  which is a different, authenticated mechanism — see spec 07).

---

## 2. Project sharing (two kinds)

`ShareProjectModal` handles **both**:

### a) Member sharing (collaborators)
- Add users to `Project.sharedWith[]` → they get **edit** access (not just view).
- `GET·POST /api/projects/[project]/share`, `DELETE /api/projects/[project]/share/[user]`.
- Only the project **creator** or an **admin** can manage members (`canManageShare`).

### b) Public link (read-only)
- `PUT /api/projects/[project]/public` toggles `publicEnabled` + issues a `publicToken`.
- Anyone with the link sees `/public/projects/[token]` — the reports, sections, and test
  results — read-only.

> Member sharing = "help me edit". Public link = "let outsiders read". They're independent.

---

## 3. Bug board sharing (global)

- Governed by a **single global** `BugShare` document (`scope: 'global'`, `token`, `enabled`).
- `POST /api/bugs/share` toggles it; `GET /api/public/bugs/[token]` serves the data.
- Exposes the whole bug board read-only at `/public/bugs/[token]` (`PublicBugBoard`).
- Because it's global (not per-project), there's exactly one public bug link for the workspace.

---

## 4. Roadmap sharing

- `PUT /api/roadmaps/[roadmap]/share` toggles `publicEnabled` + `publicToken`.
- Public board at `/public/roadmaps/[token]`; a single item at `/public/roadmaps/[token]/[item]`.
- Read-only — RICE and phases are visible, but nothing can be moved or edited.

---

## 5. Revoking access

Turning `enabled`/`publicEnabled` **off** immediately breaks the public URL. Rotating the
`publicToken` invalidates any previously shared link. There's no expiry/TTL — access lasts
until it's toggled off or the token is rotated.

---

## 6. Security notes

- Tokens are the **only** gate on public content — treat a public URL as "anyone with the
  link can read this." Don't enable public sharing on sensitive projects.
- Public routes must never expose mutations; keep new public endpoints read-only.
- The tokenized model means you can share externally without provisioning `guest` accounts.

---

## 7. Summary table

| Surface | Enable via | Public URL | Storage |
|---|---|---|---|
| Project | `PUT /api/projects/[project]/public` | `/public/projects/[token]` | `Project.publicEnabled` + `publicToken` |
| Bug board | `POST /api/bugs/share` | `/public/bugs/[token]` | `BugShare` (global singleton) |
| Roadmap | `PUT /api/roadmaps/[roadmap]/share` | `/public/roadmaps/[token]` (+ `/[item]`) | `Roadmap.publicEnabled` + `publicToken` |
