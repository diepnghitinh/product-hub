# 03 · Roles & Permissions

The product has **three roles** plus **API-key** and **public-link** access. This
document is the single source of truth for who-can-do-what.

Sources: `types/index.ts` (Role), `hooks/useRole.ts`, `lib/projectAccess.ts`,
`lib/rbac.ts`, `lib/auth.config.ts`.

---

## 1. The three roles

| Role | Intent | `canWrite`? |
|---|---|:---:|
| **admin** | Product owner / workspace administrator. Full control. | ✅ |
| **tester** | QA / engineer. Can create and edit content, run tests, file bugs. | ✅ |
| **guest** | Read-only stakeholder. | ❌ |

`canWrite` = `admin` OR `tester` (from `useRole()`), and gates most "create/edit" UI.

---

## 2. Capability matrix

| Capability | admin | tester | guest |
|---|:---:|:---:|:---:|
| View dashboard, projects, reports, roadmaps, bugs, milestones | ✅ | ✅ | ✅ |
| Create project / roadmap / milestone | ✅ | ✅ | ❌ |
| Create / edit / duplicate reports & groups | ✅ | ✅¹ | ❌ |
| Edit **all** report fields (title, meta, all sections) | ✅ | ❌ | ❌ |
| Edit report **status** + **testing sections / test cases** | ✅ | ✅ | ❌ |
| Import test cases (Excel/JSON), edit test results | ✅ | ✅ | ❌ |
| Create / edit / assign / delete bugs | ✅ | ✅ | ❌ |
| Comment on bugs (Activity), @-mention | ✅ | ✅ | ❌² |
| Create / reorder roadmap items, set RICE | ✅ | ✅ | ❌ |
| Create / edit milestones (OKRs, KRs, individuals) | ✅ | ✅ | ❌ |
| Archive (soft-delete) a project | ✅ | creator only³ | ❌ |
| Restore / permanently delete archived projects | ✅ | ❌ | ❌ |
| Share a project with members / toggle public link | ✅ | creator only³ | ❌ |
| Manage people (create users, set roles) | ✅ | ❌ | ❌ |
| App settings (webhooks, bug statuses, bug fields) | ✅ | ❌ | ❌ |
| Create / revoke API keys | ✅ | ❌ | ❌ |
| View project History (audit log) | ✅ | ✅ | ❌ |
| Change own password | ✅ | ✅ | ✅ |

¹ Testers can create/edit content generally, but **report field edits are restricted** (next section).
² Guests are read-only; commenting requires a writer role.
³ A non-admin can archive/share a project only if they are its **creator** (`createdBy` matches their email/name/id). See §4.

---

## 3. Report field-level rules (`lib/rbac.ts`)

Reports have a finer-grained rule than "can edit":

- **admin** — may patch any report field:
  `title, subtitle, groupSlug, label, featureId, module, statusVariant, reported, owner, sections`.
- **tester** — may patch **only** `statusVariant` and `sections`, and within `sections`
  **only `testing` sections are honored** — edits to non-testing sections at the same
  indices are merged back to the existing content (`mergeTestingOnly`).

**Why:** testers own the QA surface (status + test cases) without being able to rewrite
the feature's narrative sections. Admins own the whole document.

---

## 4. Project access (`lib/projectAccess.ts`)

Beyond global role, each project computes an effective "can edit as owner":

```
canEditProjectAsOwner(user, project):
  guest            → false
  admin            → true
  creator          → true   (project.createdBy === user.email | user.name | user.id)
  shared member    → true   (project.sharedWith includes user.id)
  otherwise        → false

canManageShare(user, project):
  guest  → false
  admin  → true
  creator→ true            (only the creator or an admin manages members / public link)
```

**Implications**

- A tester who is **not** the creator and **not** shared on a project can still see it
  but is treated as read-only for owner-level actions on that project.
- Sharing a project with a tester's user id grants them edit access to that project.
- Only the **creator or an admin** can add/remove members or flip the public link.

---

## 5. Non-human access

### API keys (automation / CI)
- **Global**, admin-created bearer tokens (`hw_…`). Any non-revoked key authorizes the
  **public test-case API**. The key is shown once at creation; only a SHA-256 hash is stored.
- Scope is limited by the URL: a key can only affect the `{projectId}` named in the request,
  and only the `result` field of a test case. Every change is written to the audit log with
  `actorType: 'api'` and the key's name.
- Revoking (`revokedAt`) disables a key without deleting its audit references.

### Public links (stakeholders)
- A project / roadmap with `publicEnabled` + a `publicToken`, or the single global bug
  board `BugShare`, is viewable at `/public/…` **without logging in**.
- Public pages are **strictly read-only** — no mutations are exposed on the public routes.
- Turning the link off (or rotating the token) revokes access immediately.

---

## 6. Practical guidance

- Give PMs **admin**, engineers/QA **tester**, and external viewers **guest** (or just a public link).
- To let a tester fully own a specific project, make them its **creator** or **share** it with them.
- Use **API keys** for CI to tick results — never share a user password with automation.
- Prefer **public links** over creating guest accounts for one-off stakeholder viewing.
