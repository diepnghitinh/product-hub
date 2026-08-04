---
name: module-mcp
description: Use when working on the MCP server — the Model Context Protocol surface at /v1/mcp that lets an AI assistant read workspace context and create/update/delete issues, subtasks, comments, backlog items and docs, authenticated by an API key whose scope (read-only | read-write | read-write-delete) gates every write. Related to module-api-keys, module-issues, module-activity, module-roadmaps, module-docs.
---

# Module: MCP Server

**Apps/paths:** `backend/src/presentation/mcp`, `backend/src/application/mcp`, `backend/src/infrastructure/mcp`, `frontend/src/features/mcp`

## Purpose
Exposes Product OS to an AI assistant (Claude Code, etc.) over the Model Context Protocol
(`@modelcontextprotocol/sdk`), so the assistant can list the workspace (teams, statuses,
roadmaps, people), search/read issues, and **create, update, delete** tasks/bugs (incl.
subtasks), comments, roadmap backlog items and docs directly — without a browser session. Tool
calls funnel through the *same* application use-cases the web app uses (`CreateIssueUseCase`,
`UpdateIssueUseCase`, `DeleteIssueUseCase`, `SetIssueStatusUseCase`, the issue-comment
use-cases, `AddRoadmapItemUseCase`, `CreateDocUseCase`/`UpdateDocPageUseCase`, etc.), so a tool
call and a click produce identical records. Every write is logged to an append-only MCP event
history the workspace can review in Settings.

**Every write is gated by the calling key's scope** (`read-only` | `read-write` |
`read-write-delete`, see [[module-api-keys]]): a read-only key may only read, and only a
`read-write-delete` key may delete. The scope is a ceiling *independent of* the key owner's
role — within what the scope allows, the owner's role/ownership still applies (bug-delete needs
ADMIN/PRODUCT, a personal task stays private to its owner).

## Where it lives
- Backend presentation: `McpHttpController` (`POST/GET/DELETE /v1/mcp`, real Streamable-HTTP
  MCP JSON-RPC endpoint), `McpController` (plain REST mirror of the same use-cases:
  `/mcp/context`, `/mcp/issues`, `/mcp/backlog-items`, `/mcp/docs`), `McpEventsController`
  (`GET /mcp/events`, JWT-guarded, powers the Settings history view), `McpServerFactory`
  (builds one `McpServer` per session and registers its tools), `McpSessionRegistry`
  (in-memory Streamable-HTTP session map, 30 min idle timeout, 200-session cap, LRU eviction).
- Application: `backend/src/application/mcp/use-cases/mcp.use-cases.ts` —
  `GetMcpContextUseCase`, `McpSearchIssuesUseCase`, `McpGetIssueUseCase`, `McpCreateIssueUseCase`,
  `McpUpdateIssueUseCase`, `McpSetStatusUseCase`, `McpDeleteIssueUseCase`,
  `McpListCommentsUseCase`, `McpAddCommentUseCase`, `McpUpdateCommentUseCase`,
  `McpDeleteCommentUseCase`, `McpCreateBacklogItemUseCase`, `McpCreateDocUseCase`,
  `McpUpdateDocUseCase`, `GetMcpEventsUseCase`. Name resolution ("QC", "Next", "Aaron" → real
  ids), `resolveIssueRef` (ref→uuid) and `resolveMentions` (names/emails → userIds) live in
  `domain/mcp-resolve.ts`; Markdown/HTML/Mermaid doc-body conversion lives in
  `domain/mcp-doc-body.ts`. Comment use-cases come from [[module-activity]]
  (`ApplicationActivityModule`, imported by `application/mcp/mcp.module.ts`). `McpEventEntity`
  (immutable, `domain/entities`) is the audit record. **The scope gate** (`assertCanWrite`,
  `assertCanDelete`) lives in `presentation/mcp/mcp-scope.ts` — a tiny SDK-free file both the
  JSON-RPC factory and the REST mirror share.
- Infrastructure: Mongoose `McpEventSchema` (`mcp-event.schema.ts`) + `McpEventRepository`.
- Frontend: `frontend/src/features/mcp/api.ts` (`useMcpEvents` read-only query), consumed by
  `frontend/src/features/admin/McpSection.tsx` (Settings history table).

## Data model & key fields
`McpEventEntity` / Mongo collection for `McpEventSchema` (createdAt only, immutable):
`tenantId`, `keyId`/`keyName` (denormalized — survives key revocation), `userId`/`userName`
(the key's owner, who the write is attributed to), `clientName` (from the `x-mcp-client`
header or the MCP handshake's client info, e.g. `claude-code/2.1.0`), `tool` (free string —
any of the write tools: `create_issue` | `update_issue` | `set_issue_status` | `delete_issue`
| `add_comment` | `update_comment` | `delete_comment` | `create_backlog_item` | `create_doc` |
`update_doc`, from the `McpTool` enum vocabulary — stored as a plain string so a new tool needs
no migration), `entity` (`McpEntity`: `task` | `bug` | `backlog-item` | `doc` | `comment` —
the issue values are deliberately the same strings as `IssueKind` for icon selection),
`entityId`, `entityRef` (`TSK-…`/`BUG-…`/`RM-…`, empty for docs/comments), `entityTitle`,
`contextLabel` (team name, roadmap title, doc tags, or the issue ref for a comment), `link`
(in-app path). Reads (`search_issues`, `get_issue`, `list_comments`) log nothing.

## API surface
- `GET /v1/mcp` / `POST /v1/mcp` / `DELETE /v1/mcp` — Streamable HTTP MCP JSON-RPC transport
  (`McpHttpController`). Session pinned via `mcp-session-id` header + the API key that opened
  it; `x-api-key` checked via `ApiKeyGuard` on **every** request so revoking a key kills its
  sessions immediately.
- `GET /v1/mcp/context` — teams/statuses/roadmaps/people this key can file into.
- Issues: `GET /mcp/issues` (search — also `?parent=` lists subtasks) · `POST /mcp/issues`
  (create; `parent` nests a subtask) · `GET /mcp/issues/:issue` (read one, with comments +
  subtasks) · `PATCH /mcp/issues/:issue` (update) · `PATCH /mcp/issues/:issue/status` (move
  column) · `DELETE /mcp/issues/:issue` (delete — refused while subtasks exist).
- Comments: `GET /mcp/issues/:issue/comments` · `POST …/comments` (add; `mentions` by
  name/email) · `PATCH …/comments/:comment` · `DELETE …/comments/:comment`.
- `POST /v1/mcp/backlog-items` — add a roadmap backlog item.
- `POST /v1/mcp/docs` — write a new doc · `PATCH /v1/mcp/docs/:doc` — edit an existing doc
  (title/tags, a page's content, or append a page).
- `GET /v1/mcp/events` — JWT-guarded (not API key) history of everything MCP has done;
  read by the Settings screen only, so one key can never enumerate another's activity.

Writes (`POST`/`PATCH`) require a key scope ≥ `read-write`; `DELETE` requires
`read-write-delete` — enforced in the REST mirror by `guardWrite`/`guardDelete` and in the
JSON-RPC tools by `gated`/`gatedDelete`. Reads are ungated.

The **14 MCP tools** registered by `McpServerFactory` (same use-cases as the REST routes):
`list_workspace`, `search_issues`, `get_issue`, `create_issue`, `update_issue`,
`set_issue_status`, `delete_issue`, `list_comments`, `add_comment`, `update_comment`,
`delete_comment`, `create_backlog_item`, `create_doc`, `update_doc`. (Subtasks have **no
dedicated tool** — a subtask is an issue with a `parent`, so it is created via `create_issue`
+ `parent`, listed via `search_issues` + `parent`, and edited/deleted/commented with the
ordinary issue/comment tools on the subtask's ref.)

## Relationships to other modules
- [[module-issues]] — `create_issue`/`update_issue`/`set_issue_status`/`delete_issue` call
  `CreateIssueUseCase`/`UpdateIssueUseCase`/`SetIssueStatusUseCase`/`DeleteIssueUseCase`;
  `search_issues`/`get_issue` read via `GetIssuesUseCase`/`GetIssueUseCase`. Subtasks are just
  issues with a `parentId` (the `parent` field on create/search). `delete_issue` counts children
  with `IIssueRepository.countChildren` (owner-blind) and refuses while any exist, so it can
  never orphan a subtask. `search_issues`/subtask reads pass `userId: ''` so a key can never
  read anyone's private board.
- [[module-activity]] — the four comment tools call `CreateIssueCommentUseCase` /
  `GetIssueCommentsUseCase` / `UpdateIssueCommentUseCase` / `DeleteIssueCommentUseCase`.
  `add_comment`/`update_comment` resolve `mentions` (names/emails → userIds) before the DTO so
  the @mention webhook reaches the right person; edit/delete are gated by the use-case's
  author-or-ADMIN/PRODUCT rule using the key owner's resolved role.
- [[module-roadmaps]] — `create_backlog_item` calls `AddRoadmapItemUseCase`; `create_issue`
  can link a new issue to a roadmap backlog item via `backlogItemId` (ref or uuid resolved by
  `findRoadmapItem`).
- [[module-teams]] — team/status names ("QC", "In progress") are resolved against
  `GetTeamsUseCase`'s output; an unresolvable name fails with the valid choices
  (`didYouMean`) rather than a silent fallback.
- [[module-docs]] — `create_doc` calls `CreateDocUseCase` then `UpdateDocPageUseCase` to write
  the body into the doc's first page; Markdown/HTML and ```mermaid fences are converted via
  `docBodyToHtml`.
- [[module-users]] — assignee names/emails resolved via `IUserRepository`; the calling key's
  owner (`actor.userId`) is who every created record is attributed to.
- [[module-api-keys]] — `ApiKeyGuard` / `ApiAuth` from `presentation/api-keys` authenticates
  every `/v1/mcp*` route except `/mcp/events`, which uses JWT. `ApiAuth` now carries the key's
  `scope` (`ApiKeyScope`), which `actorOf` puts on the `McpActor`; the scope gate reads it.
  Keys created before the scope field are grandfathered to `read-write-delete` in the
  repository's `toDomain`, so existing integrations keep working; **new** keys default to
  `read-only`.
- [[module-admin]] — `McpSection.tsx` (Settings → MCP tab) is the only frontend consumer of
  `useMcpEvents`; it also drives `useGenerateApiKey` to hand out a key for the connection
  snippet it builds.

## Gotchas & conventions
- Session state is in-memory only (`McpSessionRegistry`) — does not survive a backend restart
  or span replicas behind a load balancer; a client with an unknown session id just
  reconnects, so this is a designed-for failure mode, not a bug.
- Claude Desktop's custom connectors expect OAuth; this server only supports a static
  `x-api-key` header, so it works with Claude Code and other header-capable clients, not
  Desktop's connector UI.
- Tool registration bypasses the SDK's Zod-derived TypeScript inference
  (`registerTool<TArgs>` wrapper in `mcp-server.factory.ts`) because that inference exceeds
  TS's instantiation depth under this backend's `strictNullChecks: false` — runtime validation
  is unaffected, only compile-time typing is manual per tool.
- References (team, status, assignee, roadmap, phase) are always resolved by name *or* id,
  never id-only — because that's what an assistant has to work with.
- **Resolve ref → uuid before every issue write.** `UpdateIssueUseCase`/`SetIssueStatusUseCase`/
  `DeleteIssueUseCase` (and the comment use-cases' `issueId`) take a **uuid via `findById`** —
  only `GetIssueUseCase` accepts a ref. So the write wrappers call `resolveIssueRef` first and
  pass `issue.id`, never the raw `TSK-7`. Skip this and every write 400s with "not found".
- **`update_issue` has no `status` and no `team`.** `UpdateIssueDto` can't change either, so
  those fields would be silent no-ops — status moves go through `set_issue_status`. `assignee`
  and `labels` on `update_issue` **REPLACE** the whole set (not additive); the tool descriptions
  say so, because an AI told to "add label X" would otherwise wipe the rest.
- **The key owner's role, not the actor, decides ownership.** Each write wrapper resolves
  `roleOf(users.findById(actor.userId))` fresh → `isAdmin` (personal-task edits) and
  `canDeleteBug` (ADMIN/PRODUCT). Scope caps *what* a key can do; role caps *whose* records it
  can touch. `add_comment` only checks tenant (matches the web app) — a write path deliberately
  laxer than the read path; see the spec's open question if that matters.
- **Read replies are bounded.** `get_issue` inlines the latest ~20 comments + total count;
  `list_comments` returns the most recent ~100 — so one hot issue can't flood the assistant's
  context.
- `McpEventDto`/`McpEventEntity` fields are intentionally denormalized (`keyName`, `userName`)
  so history stays readable after a key is revoked or a user is removed.

## Related skills
[[module-issues]] [[module-activity]] [[module-roadmaps]] [[module-teams]] [[module-docs]] [[module-users]] [[module-api-keys]] [[module-admin]]
