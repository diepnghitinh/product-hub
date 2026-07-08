# Spec 03 · Activity (comments) & Inbox

Two connected features: **Activity** is a comment thread attached to a bug;
**Inbox** is your personal feed of mentions and assignments.

Models: `Activity` (+ embedded comments), `User.inboxSeenAt`.
Screens: bug detail `/bugs/[bug]` (Activity panel), `/inbox`.
Components: `ActivityPanel`, `CommentImageUploadModal`, `InboxNavLink`.

---

## 1. Activity (comment thread)

### Concept
Activity is "like chatting" but **not realtime** — it's comments. Each thread lives
**1-to-1** with a host entity. Today that host is a **bug**; the model is already built
to also attach to a **backlog** item (`entityType: 'bug' | 'backlog'`), so the same
thread UI can be reused later.

`(entityType, entityId)` is unique → each entity owns exactly one thread.

### A comment (`ActivityCommentDTO`)
| Field | Notes |
|---|---|
| `id` | Comment id. |
| `authorId` + `authorName` | Author; **name is denormalized** so the thread stays readable after a rename/removal. |
| `body` | The text. |
| `mentions[]` | User ids @-mentioned in the body — drives highlighting + the webhook ping. |
| `images[]` | Uploaded media `{ url, name, originalName, size, contentType }` in Azure Blob. Despite the name, this covers **images *and* short video clips** (distinguished by `contentType`). |
| `editedAt` | Set when edited (shows an "edited" marker). |
| `createdAt`, `updatedAt` | Timestamps. |

### Behaviours
- **Add comment** — `POST /api/bugs/[bug]/activity` with body + optional media + mentions.
- **Edit comment** — `PATCH /api/bugs/[bug]/activity/[comment]` (stamps `editedAt`).
- **Delete comment** — `DELETE …/activity/[comment]`.
- **@-mentions** — typing `@` lets you mention users; mentioned ids are stored on the comment.
- **Media** — attach images/video through `CommentImageUploadModal`; stored in Azure Blob with the blob key kept for deletion.
- Comments are embedded subdocuments mutated with raw `$push`/`$pull`/positional `$` operators (robust against schema caching).

### On mention → notification
When a comment mentions people, the app fires the **`commentMention`** webhook
(`notifyBugComment`): a Lark message with the author, a snippet (≤280 chars), and real
`@` pings for mentioned users who have a Lark mapping. It also surfaces the mention in
each mentioned user's **Inbox**.

---

## 2. Inbox

### Concept
A personal feed at `/inbox` of things that need your attention:
- **Mentions** — you were @-mentioned in a comment.
- **Assigned bugs** — a bug was assigned to you.
- **Assigned milestones** — a milestone individual/task was assigned to you.

### An inbox item (`InboxItemDTO`)
| Field | Notes |
|---|---|
| `id` | Stable de-dupe key, e.g. `mention:{commentId}`. |
| `kind` | `mention` \| `assigned-bug` \| `assigned-milestone`. |
| `title` | Primary line (the bug/milestone title). |
| `snippet` | Secondary line (comment snippet or assignment context). |
| `actorName` | Who triggered it (mention author; empty for assignments). |
| `href` | Where clicking navigates ("enter the feature"). |
| `at` | Timestamp, used for ordering and the unread cutoff. |
| `read` | True once older than your last inbox visit. |

### Tabs & counts (`InboxResponse`)
- Tabs: **All · Mentions · Assigned**, each with its own total (`counts { all, mention, assigned }`), independent of the current page.
- `unreadCount` drives the nav badge (`InboxNavLink`).
- `seenAt` = your last visit (`User.inboxSeenAt`); anything newer is unread.
- `hasMore` supports pagination per active filter.

### Read / unread
- `GET /api/inbox` returns the feed (filtered + paginated) plus counts and `seenAt`.
- `POST /api/inbox` marks the inbox **seen** — updates `User.inboxSeenAt` (written via a raw
  `collection.updateOne` so a stale schema can't drop the field), which clears the unread badge.

---

## 3. How it fits together

```
Comment with @mention ─┬─> stored on Activity.comments[].mentions[]
                       ├─> Lark webhook ping (commentMention, if configured)
                       └─> appears in mentioned user's Inbox (kind: mention)

Bug assigned ──────────┬─> Lark webhook ping (bugAssigned)
                       └─> appears in assignee's Inbox (kind: assigned-bug)

Milestone individual assigned ──> assignee's Inbox (kind: assigned-milestone)
```

---

## 4. Notable rules

- **No realtime** — the thread is refreshed on load/refetch, not pushed live (by design).
- **Denormalized author names** keep old comments readable after a user is renamed or removed.
- **Media = images + video** under one `images[]` array; render logic branches on `contentType`.
- **Backlog threads are modeled but not yet wired to a UI** — the `backlog` host type exists in the schema for future reuse.
- Notifications are **best-effort**: a webhook failure never blocks posting a comment.
