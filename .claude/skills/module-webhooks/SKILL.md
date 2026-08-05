---
name: module-webhooks
description: Use when working on Webhooks — outbound Lark/Telegram chat notifications fired on bug-created, bug-assigned, and comment-mention events, at backend/src/{application,infrastructure}/webhooks. Related to module-app-settings, module-issues, module-activity.
---

# Module: Webhooks

**Apps/paths:** `backend/src/application/webhooks`, `backend/src/infrastructure/webhooks`

## Purpose
Fires best-effort outbound chat notifications so a team hears about product events (a new bug, a bug assigned to them, being @mentioned in a comment) in Lark or Telegram without leaving their chat app. Backend-only — there is no dedicated `/v1/webhooks` REST surface or frontend feature folder; the hook *configuration* is managed as part of App Settings, this module only *sends*.

## Where it lives
- Backend, application layer: `application/webhooks/notifier.port.ts` — the `INotifier` abstract port (`notify(tenantId, event, text, opts?)`), with `NotifyOptions` (`mentionUserIds`, `link`).
- Backend, infrastructure layer: `infrastructure/webhooks/webhook-notifier.service.ts` — `WebhookNotifier implements INotifier`; `infrastructure/webhooks/webhooks.module.ts` — `InfrastructureWebhooksModule`, imports `InfrastructureAppSettingsModule` and provides `INotifier` (DI token) bound to `WebhookNotifier`.
- No presentation layer (no controller) — this module is only ever called from other use-cases via the `INotifier` port, never hit directly by the frontend.
- Webhook config types (`WebhookEvent`, `WebhookConfig`, `WebhookProvider`, `WebhookMemberMapping`) live in `application/app-settings/domain/webhook.types.ts` — see [[module-app-settings]] for where hooks are CRUD'd.

## Data model & key fields
No own collection — reads the tenant's `AppSettings.webhooks: WebhookConfig[]` array (via `IAppSettingsRepository.findByTenant`). Per-hook fields: `id`, `provider` (`lark` | `telegram`), `name`, `url` (Lark incoming-webhook), `botToken`/`chatId` (Telegram Bot API), `events: WebhookEvent[]`, `enabled`, `memberMappings?: { userId, providerUserId, displayName }[]` (maps a workspace user to their Lark `open_id` or Telegram numeric id, for @mentions).

`WebhookEvent` enum: `bug-created`, `bug-assigned`, `comment-mention`.

## API surface
None. Outbound-only side effect, invoked in-process via `INotifier.notify(tenantId, event, text, opts)`.

## Relationships to other modules
- [[module-app-settings]] — owns hook configuration (create/edit/enable/member-mapping) as a section of the tenant's `AppSettings` singleton; `WebhookNotifier` reads that same repository to find which hooks are enabled for an event.
- [[module-issues]] — `create-issue.use-case.ts` injects `INotifier` and calls `notify(..., WebhookEvent.BUG_CREATED, ...)` on bug creation and `WebhookEvent.BUG_ASSIGNED, ...` when an assignee is set.
- [[module-activity]] — `issue-comment.use-cases.ts`, `doc-comment.use-cases.ts`, and `roadmap-item-comment.use-cases.ts` all call `INotifier.notify(..., WebhookEvent.COMMENT_MENTION, ...)` with `mentionUserIds` when a comment @mentions someone.
- [[module-bugs]] — the only issue `kind` that currently drives `BUG_CREATED`/`BUG_ASSIGNED` events (task creation does not fire webhooks).

## Gotchas & conventions
- **`BUG_ASSIGNED` only fires at bug-creation time**, when `dto.assignees` is non-empty on
  `CreateIssueUseCase`'s initial save — reassigning an existing bug via `update-issue.use-case.ts`
  does not call `INotifier` at all, so don't assume a chat ping on every assignee change.
- **Best-effort, never throws**: `notify()` catches everything internally and only logs (`Logger.warn`) — a broken webhook must never fail the calling use-case (e.g. issue creation, posting a comment).
- **6s hard timeout** (`WEBHOOK_TIMEOUT_MS`, via `AbortController`) per outbound POST so a hung chat provider can't stall a save.
- **Lark's silent-failure trap**: Lark responds HTTP 200 even for app-level errors (bad webhook, missing signature, malformed `<at>` mention) with a non-zero `code` in the body — `postLark` inspects and logs `code`/`msg` explicitly, otherwise a misconfigured Lark hook just looks like nothing happened.
- A hook only fires if it `hasTarget()`: Telegram needs both `botToken` and `chatId`; Lark needs `url`.
- `link` in `NotifyOptions` is relative (e.g. `/bugs/BUG-12`); the notifier prefixes `APP_BASE_URL` (env, default `http://localhost:3001`) to make it tappable in chat.
- Telegram messages are HTML-escaped manually (`esc()`); mentions render as `tg://user?id=` deep links vs. Lark's `<at user_id=...>` tag — the two providers have different payload/escaping rules, don't share formatting code between them without care.

## Related skills
[[module-app-settings]] [[module-issues]] [[module-activity]] [[module-bugs]]
