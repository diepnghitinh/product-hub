# Spec 07 · API Keys, Public Test-Case API & Audit Log

Lets **external automation (CI)** update test-case results, and records **every change**
in a per-project History.

Models: `ApiKey`, `AuditLog`.
Screens: Admin → Settings (API keys), project **History** dialog.
Endpoints: `/api/api-keys*`, `/api/public/testcases/[project]/[testcase]`, `/api/projects/[project]/audit-log`.
Libs: `lib/apiKeys.ts`, `lib/auditLog.ts`, `lib/testCaseLookup.ts`.

Intent: `features/update-testcase-via-api.md` — "As an admin I create API keys; a public API
uses a key to update a test case's state at `/{project}/{testcase}`, scoped to that project;
the project shows a History of updates including via API keys."

---

## 1. API keys

### What they are
**Global** bearer tokens created by admins. A key isn't tied to a project — any valid
(non-revoked) key authorizes the public test-case API, and the **target project comes from
the URL**, so a key can't accidentally cross projects (an update only touches the case in
the named project).

### Security model (`ApiKey`)
- The plaintext key (`hw_…`) is shown **once** at creation. Only a **SHA-256 hash**
  (`keyHash`) + a short display **prefix** (`keyPrefix`, ~8 chars) are stored.
- Verification re-hashes the incoming bearer token and compares to `keyHash`.
- `lastUsedAt` is stamped on use; `revokedAt` disables a key **without deleting** the row
  (so audit references stay stable). Hard-delete is also safe — the audit log keeps a
  denormalized `apiKeyName`.

### Managing keys
| Action | Endpoint | Who |
|---|---|---|
| List keys | `GET /api/api-keys` | admin |
| Create key | `POST /api/api-keys` | admin (returns plaintext once) |
| Revoke key | `DELETE /api/api-keys/[key]` | admin |

The `ApiKeyDTO` exposes `id, name, prefix, createdBy, createdAt, lastUsedAt, revokedAt`
(never the secret).

---

## 2. Public test-case API

Two endpoints, authenticated with `Authorization: Bearer hw_…`:

```
GET   /api/public/testcases/{projectId}/{testCaseId}   → read current state
PATCH /api/public/testcases/{projectId}/{testCaseId}   → set result
```

- `{testCaseId}` accepts **either** the internal UUID **or** the human short id.
- The lookup is **scoped to `{projectId}`** — updating here never touches a same-id case in
  another project (duplication copies ids).
- Lives under `/api/public/*` so the auth middleware lets the bearer request through.

### PATCH body
```json
{ "result": "Passed" }
```
`result` must be one of the 6 test results: `Passed · Failed · Blocked · Retest · Skipped · Untested`
(invalid → `400` with the allowed list).

### Responses
| Case | Response |
|---|---|
| Read | `{ testCase: { id, shortId, area, type, result, reportSlug, reportTitle } }` |
| Changed | `{ ok: true, changed: true, testCase: {…} }` + an audit entry |
| No-op (already that value) | `{ ok: true, changed: false, testCase: {…} }` — **no write, no audit** |
| Bad/missing key | `401` + `WWW-Authenticate: Bearer` |
| Project/case not found | `404` |
| Malformed JSON / bad result | `400` |

> The **no-op short-circuit** is deliberate: polling CI that re-asserts the same result
> won't spam the History log.

### Example
```bash
curl -X PATCH \
  https://<host>/api/public/testcases/6630…ab/TC-1042 \
  -H "Authorization: Bearer hw_live_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"result":"Passed"}'
```

---

## 3. Audit log (project History)

Every test-case result change — and report-level field changes — is recorded.

### An entry (`AuditLogDTO`)
| Field | Notes |
|---|---|
| `entityType` | `testcase` \| `report`. |
| `reportSlug`, `reportTitle` | Where it happened (denormalized for readable History). |
| `caseId`, `caseShortId`, `caseArea` | Which case (for `testcase` entries). |
| `field`, `oldValue`, `newValue` | What changed (e.g. `result: Failed → Passed`). |
| `actorType` | `user` \| `api`. |
| `actorName` | Denormalized user name… |
| `apiKeyName` | …or the API key's name (for `api` actors). |
| `createdAt` | When. |

### Viewing
- In-app: the project **History** dialog (`HistoryModal`, opened from the Topbar "…" menu),
  backed by `GET /api/projects/[project]/audit-log`.
- Shows a chronological feed: *"`<actor>` changed `result` on `<case>` from `<old>` to `<new>`"* —
  clearly marking whether it came from a person or an API key.

### Why denormalize actor/key names?
So History stays readable even after a user is renamed or a key is revoked/deleted —
the same reason comment `authorName` is snapshotted (see Architecture §9).

---

## 4. End-to-end flow

```
Admin creates API key (hw_…) ──> stored as SHA-256 hash + prefix
        │
CI runs tests ──PATCH /api/public/testcases/{project}/{case} {result} (Bearer hw_…)
        │        ├─ key verified (re-hash), lastUsedAt stamped
        │        ├─ case located within {project} (by id or shortId)
        │        ├─ if result changed → write + AuditLog(actorType:'api', apiKeyName)
        │        └─ if unchanged → no-op (no audit)
        ▼
Team opens project History ──> sees "CI Pipeline set result: Failed → Passed on TC-1042"
```

---

## 5. Notable rules

- **Keys are global; scope is by URL.** Guard key distribution accordingly.
- **Only `result` is writable** via the public API — the surface is intentionally tiny.
- **Read + write** both require a valid key; there is no anonymous read of test-case state.
- Revoke a key the moment it leaks — audit history is preserved regardless.
