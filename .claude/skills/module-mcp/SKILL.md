---
name: module-mcp
description: Use when working on the MCP server — the Model Context Protocol surface at /v1/mcp that lets an AI assistant read workspace context and create issues/backlog items/docs, authenticated by API key. Related to module-api-keys, module-issues, module-roadmaps, module-docs.
---

# Module: MCP Server

**Apps/paths:** `backend/src/presentation/mcp`, `backend/src/application/mcp`, `backend/src/infrastructure/mcp`, `frontend/src/features/mcp`

## Purpose
Exposes Product OS to an AI assistant (Claude Code, etc.) over the Model Context Protocol
(`@modelcontextprotocol/sdk`), so the assistant can list the workspace (teams, statuses,
roadmaps, people), search issues, and create tasks/bugs, roadmap backlog items, and docs
directly — without a browser session. Tool calls funnel through the *same* application
use-cases the web app uses (`CreateIssueUseCase`, `AddRoadmapItemUseCase`, `CreateDocUseCase`,
etc.), so a tool call and a click produce identical records. Every write is logged to an
append-only MCP event history the workspace can review in Settings.

## Where it lives
- Backend presentation: `McpHttpController` (`POST/GET/DELETE /v1/mcp`, real Streamable-HTTP
  MCP JSON-RPC endpoint), `McpController` (plain REST mirror of the same use-cases:
  `/mcp/context`, `/mcp/issues`, `/mcp/backlog-items`, `/mcp/docs`), `McpEventsController`
  (`GET /mcp/events`, JWT-guarded, powers the Settings history view), `McpServerFactory`
  (builds one `McpServer` per session and registers its tools), `McpSessionRegistry`
  (in-memory Streamable-HTTP session map, 30 min idle timeout, 200-session cap, LRU eviction).
- Application: `backend/src/application/mcp/use-cases/mcp.use-cases.ts` —
  `GetMcpContextUseCase`, `McpCreateIssueUseCase`, `McpCreateBacklogItemUseCase`,
  `McpCreateDocUseCase`, `McpSearchIssuesUseCase`, `GetMcpEventsUseCase`. Name resolution
  ("QC", "Next", "Aaron" → real ids) lives in `domain/mcp-resolve.ts`; Markdown/HTML/Mermaid
  doc-body conversion lives in `domain/mcp-doc-body.ts`. `McpEventEntity` (immutable,
  `domain/entities`) is the audit record.
- Infrastructure: Mongoose `McpEventSchema` (`mcp-event.schema.ts`) + `McpEventRepository`.
- Frontend: `frontend/src/features/mcp/api.ts` (`useMcpEvents` read-only query), consumed by
  `frontend/src/features/admin/McpSection.tsx` (Settings history table).

## Data model & key fields
`McpEventEntity` / Mongo collection for `McpEventSchema` (createdAt only, immutable):
`tenantId`, `keyId`/`keyName` (denormalized — survives key revocation), `userId`/`userName`
(the key's owner, who the write is attributed to), `clientName` (from the `x-mcp-client`
header or the MCP handshake's client info, e.g. `claude-code/2.1.0`), `tool` (free string —
`create_issue` | `create_backlog_item` | `create_doc`, from `McpTool` enum vocabulary),
`entity` (`McpEntity`: `task` | `bug` | `backlog-item` | `doc` — deliberately same strings as
`IssueKind` for icon selection), `entityId`, `entityRef` (`TSK-…`/`BUG-…`/`RM-…`, empty for
docs — `McpCreateDocUseCase` never sets it), `entityTitle`, `contextLabel` (team name, or
roadmap title, or doc tags), `link` (in-app path).

## API surface
- `GET /v1/mcp` / `POST /v1/mcp` / `DELETE /v1/mcp` — Streamable HTTP MCP JSON-RPC transport
  (`McpHttpController`). Session pinned via `mcp-session-id` header + the API key that opened
  it; `x-api-key` checked via `ApiKeyGuard` on **every** request so revoking a key kills its
  sessions immediately.
- `GET /v1/mcp/context` — teams/statuses/roadmaps/people this key can file into.
- `POST /v1/mcp/issues` — create a task or bug.
- `GET /v1/mcp/issues` — search issues by title/reference (dedup check before creating).
- `POST /v1/mcp/backlog-items` — add a roadmap backlog item.
- `POST /v1/mcp/docs` — write a doc (title + body, HTML/Markdown/Mermaid).
- `GET /v1/mcp/events` — JWT-guarded (not API key) history of everything MCP has created;
  read by the Settings screen only, so one key can never enumerate another's activity.

MCP tools registered by `McpServerFactory` (same use-cases as the REST routes above):
`list_workspace`, `search_issues`, `create_issue`, `create_backlog_item`, `create_doc`.

## Relationships to other modules
- [[module-issues]] — `create_issue` calls `CreateIssueUseCase` directly; `search_issues` calls
  `GetIssuesUseCase` with `userId: ''` so a key can never read anyone's private board.
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
  every `/v1/mcp*` route except `/mcp/events`, which uses JWT.
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
- `McpEventDto`/`McpEventEntity` fields are intentionally denormalized (`keyName`, `userName`)
  so history stays readable after a key is revoked or a user is removed.

## Related skills
[[module-issues]] [[module-roadmaps]] [[module-teams]] [[module-docs]] [[module-users]] [[module-api-keys]] [[module-admin]]
