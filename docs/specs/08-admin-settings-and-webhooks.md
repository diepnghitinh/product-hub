# Spec 08 · Admin, Settings & Webhooks

Admin-only surfaces: **People** management, the app **Settings** (webhooks, bug statuses,
bug fields, API keys, archive), and the **Lark** notification integration.

Models: `User`, `AppSettings` (singleton), `ApiKey`, `Project` (archive).
Screens: `/admin/people`, `/admin/settings`.
Endpoints: `/api/admin/*`, `/api/users`, `/api/bug-statuses`, `/api/bug-fields`.
Libs: `lib/webhook.ts`, `models/AppSettings.ts`.

---

## 1. People management (`/admin/people`)

Admin-only. Backed by `GET·POST /api/admin/users` and `PUT·DELETE /api/admin/users/[id]`.

- **List** all users (name, email, role, created date — `UserAdminSummary`).
- **Create** a user (sets name, email, password, role).
- **Change role** — `admin` / `tester` / `guest`.
- **Delete** a user.
- Non-admin surfaces use `GET /api/users` (a lightweight `UserSummary` list) to populate
  assignee/owner pickers.

### Accounts & auth
- **Self-registration**: `POST /api/register` + `/register` page (creates a normal account).
- **First admin**: seeded from env `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` if no user exists.
- **Passwords**: bcrypt-hashed; users change their own via `PUT /api/users/me/password` (`ChangePasswordModal`).

---

## 2. App Settings (`/admin/settings`)

A tabbed admin screen. Tabs:

| Tab | What it manages | Backed by |
|---|---|---|
| **Webhooks** | Lark channels + per-event toggles + member mappings | `AppSettings.webhooks`, `GET·PUT /api/admin/settings` |
| **Bug statuses** | Configurable statuses (label/color/order/add) | `AppSettings.bugStatuses`, `GET·PUT /api/bug-statuses` |
| **Bug fields** | Custom bug fields (text/dropdown, options) | `AppSettings.bugFields`, `GET·PUT /api/bug-fields` |
| **API keys** | Create/list/revoke keys | `/api/api-keys*` (see spec 07) |
| **Archive** | Restore / permanently delete archived projects | `/api/admin/archived-projects*` |

`AppSettings` is a **singleton** (`singleton: 'default'`, upserted by `getAppSettings`).
Bug-status and bug-field details are in [`02-bugs.md`](./02-bugs.md).

---

## 3. Project archive (restore / purge)

- Archiving a project is a **soft delete** (sets `deletedAt`, frees the slug) — done from the
  Dashboard card by an admin **or** the project's creator.
- **Admin → Settings → Archive** (also reachable via `/admin/settings?tab=archive`) lists
  archived projects (`ArchivedProjectDTO`: title, subtitle, recovered slug, owner, reportCount, `archivedAt`).
- Actions: **Restore** (`POST /api/admin/archived-projects/[project]`) or **Permanently delete**
  (`DELETE …`). Only admins can restore/purge.

---

## 4. Lark webhooks (notifications)

Outbound notifications to **Lark (Feishu)** group chats. Configured per-channel in
Settings → Webhooks; sent from `lib/webhook.ts`.

### Channel config (`WebhookChannelDoc`)
| Field | Notes |
|---|---|
| `type` | `lark` (only supported channel today). |
| `enabled` | Master on/off for the channel. |
| `url` | The Lark bot webhook URL. |
| `events` | Per-event toggles (below). |
| `members[]` | User → Lark mapping `{ userId, larkOpenId, displayName }` for real `@`-pings. |

### Events (each independently toggleable)
| Event | Fires when | Message contents |
|---|---|---|
| `bugCreated` | A bug is created | 🐛 title, severity, type, status, reporter, assignee, link |
| `bugAssigned` | A bug is (re)assigned | 📌 pings new assignee, status, link |
| `commentMention` | A comment @-mentions someone | 💬 author, snippet (≤280 chars), `cc:` pings, link |

### Behaviour & robustness
- **Real `@`-mentions**: a mentioned user with a `larkOpenId` mapping gets a true Lark
  `<at>` ping; others appear as plain text.
- **Backward-compatible toggles**: channels saved before per-event toggles existed default to "on".
- **Hard timeout**: each POST aborts after 6s.
- **Error surfacing**: Lark returns HTTP 200 even for app-level errors (bad webhook, malformed
  `<at>`), so the code inspects the response `code` and logs failures — a misconfigured webhook
  won't fail silently.
- **Never blocks the operation**: all webhook calls are best-effort (`Promise.allSettled`,
  wrapped in try/catch); a webhook failure never breaks bug creation, assignment, or commenting.
- **Link base**: built from `AUTH_URL` (falls back to `http://localhost:3000`).

### Extending
Only `lark` exists today. The schema (`WebhookChannelDoc.type` enum) is the place to add
Slack/Teams/etc.; each new channel type needs its own `fire*` sender in `lib/webhook.ts`.

---

## 5. Configuration & environment

Relevant env vars (from usage + `.env.example`):

| Var | Purpose |
|---|---|
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | Bootstrap the first admin. |
| `AUTH_URL` | Base URL used in webhook links (and NextAuth). |
| MongoDB connection | `lib/mongodb.ts` / `lib/db.ts` (Mongo URI). |
| Azure Blob credentials | `lib/azureBlob.ts` (attachments/media/screenshots). |
| NextAuth secret | Session signing. |

---

## 6. Notable rules

- **All of Settings is admin-only** (People, webhooks, statuses, fields, keys, archive).
- **AppSettings is one document** — statuses, fields, and webhooks all live on the singleton.
- **Denormalize for durability** — webhook member display names and audit/key names are
  snapshotted so history/notifications survive renames.
- **Seed once** — `ensureSeeded` imports `data.json` only into an empty database.
