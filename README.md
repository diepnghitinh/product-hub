<div align="center">

# product-hub

### The product team's operating system — from discovery to delivery, in one workspace.

Write the thinking down, decide what matters, commit it to a cycle, ship it, and prove it
works — without stitching together Jira, Confluence, a spreadsheet, and Notion.

<img src="docs/images/home.png" alt="product-hub dashboard" width="900" />

</div>

---

## Why product-hub

Most teams scatter the product loop across five tools: the discovery doc in one place, the
roadmap in another, the sprint in a third, bugs in a fourth, test evidence in a spreadsheet,
and OKRs in a doc nobody opens. The context lives in the gaps between them.

**product-hub keeps the whole loop in one place** and *connects* the pieces:

> **Write it down** in the docs hub → **prioritize** with RICE → **align** on OKRs →
> **commit** to a cycle → **execute** on team boards → **watch** the burn-up →
> **catch** bugs → **prove** it works with test cases.

Because everything is structured — not free-form pages — the app computes the rollups a wiki
can't: RICE scores, OKR progress, "N of M done", per-person workload, cycle burn-up, test
coverage, cycle & lead time.

---

## What's inside

### 🗺️ Roadmaps with RICE prioritization

Now / Next / Later / Done boards where every item carries a **RICE score** (Reach × Impact ×
Confidence ÷ Effort), a status, difficulty, and a progress bar. Sort the whole board by RICE
to see what actually deserves the next cycle — and switch to Chart, Table, Workflow, or
Timeline views of the same data.

![Roadmap board](docs/images/roadmap-board.png)

### 🎯 Item detail — score it, break it down, track it

Open any roadmap item to tune its RICE inputs, assign owners, link it to an OKR, and break
the work into **issues that roll up** into a "1 of 3 done" bar. Roadmap items link tasks
*and* bugs, so a fix-it-first item tracks like any other. Cycle & lead time are measured
automatically from the moment work starts.

![Roadmap item detail](docs/images/roadmap-item.png)

### 📌 OKRs that roll up on their own

Objectives → Key Results with **drag-to-adjust weights**. Move a key result's progress and
watch its objective — and the overall milestone — recompute in real time. No more quarterly
OKR spreadsheet math.

![OKRs](docs/images/okr.png)

### ✅ Team boards for execution

Each team (Engineering, QC, …) gets its own Kanban board with **its own statuses**, labels,
and custom fields — set once in Settings, respected everywhere. Issues carry assignees, story
points, a start → end date range, and a short ID (`TSK-6HCUHKX`). Drag between columns, add
straight into a column, or flip to a list view with bulk actions.

![Team task board](docs/images/task-board.png)

### 🐞 Bugs — a separate board, the same object

Bugs get their own board with severity dots, reproduction detail, and per-team statuses —
but under the hood a bug and a task are the **same issue**. One URL (`/issues/BUG-3`) opens
either, and links work across kinds, so a bug can **block** a task and both sides show it.

![Bug board](docs/images/bugs.png)

### 🔁 Cycles — sprints that run themselves

Turn cycles on for a team and pick a rhythm: **1–4 week length**, an optional **0–2 week
cooldown** between them, and the date the first one starts from. That's the whole setup.

From then on there is nothing to open, close, or roll over by hand:

- Cycles are **generated as time passes** — no cron job, no scheduled task. The next read
  after a boundary moves the clock forward and keeps upcoming cycles queued ahead of you.
- New issues on a cycles-on team **join the active cycle** automatically.
- When a cycle ends, unfinished work **rolls into the next one** (or drops back to no cycle,
  if you'd rather it didn't).
- The board gets a cycle bar to scope it to the cycle you care about; a **cycles page** lists
  the history newest-first, cooldown gaps included.
- Each cycle carries a plain-text **goal** — the one sentence the sprint is about.

Change the rhythm later and every cycle is rebuilt from the new anchor and renumbered from 1
— it's deliberate, and it sits behind a confirmation.

### 📈 Burn-up chart — is this cycle going to land?

Open any cycle's **insights** drawer for a burn-up of the work: **Scope**, **Started**, and
**Completed** plotted across the cycle, drawn in your team's own column colours, with a faint
diagonal "ideal completion" guide to compare against. The remaining days of an active cycle
are hatched, a *now* line marks today, and hovering reads out a single day.

- **It measures itself.** If anything in the cycle is estimated, the chart is in **story
  points**; if nothing is, it counts **issues** — no setting to get wrong.
- **Scope rising mid-cycle is the signal**, and it's visible: the gap between the Scope and
  Completed curves is scope creep you can point at in a retro.
- **Breakdowns** by assignee, label, and project sit under the chart, each showing how much
  of its slice is done.

One honest caveat, stated in the drawer too: the daily series is **reconstructed from issue
timestamps**, because the app doesn't keep a per-status audit history. It's the best available
reading of what happened, not a signed ledger — treat it as a trend, not evidence.

### 👥 My Team — who's carrying what

A card per person: how much is open vs. done, a segmented bar of their statuses, their story
points, and a workload chart comparing the team at a glance. Open a status inside a card to
see the actual issues without leaving the page.

### 📚 Docs hub — the thinking, next to the work

The discovery half of the product loop, in the same workspace as the delivery half.

- **A hub of docs as cards** — icon, accent colour, tags, page count, and when it was last
  touched. Filter by tag to find the one you mean.
- **Nested pages** in a tree beside the editor — drag to reorder or re-parent. The rail
  collapses on a laptop and becomes a drawer on a phone.
- **A real editor**: headings, lists, code, highlights, **resizable tables** (drag a column
  or row, with a `/` menu inside cells), images and short video compressed on upload, and
  **Mermaid diagrams** stored as text so they stay editable rather than becoming a screenshot.
- **Per-page attachments and links** — the spec's PDF and the Figma URL live on the page, not
  in a chat thread.
- **Version history** per page, so a rewrite is never a loss.
- **Page styles** — font, size, page width, and which of the cover/title/attachments show.
- **Share it publicly** with an unguessable link that deep-links to a specific page. No
  account needed at the other end.

### 🧪 Test cases as living evidence

Every feature gets a structured report: an overview, a coverage summary, and a **test-case
table** with colour-coded results — Passed, Failed, Blocked, Retest. Import cases from a
spreadsheet, or let CI tick results through the API. This is the "does it actually work?"
half a wiki can't give you.

![Test cases](docs/images/testcases.png)

### 🤖 File work from Claude, over MCP

Your workspace *is* the MCP server. There's nothing to clone and nothing to install —
**Settings → MCP** generates a key and hands you one command:

```bash
claude mcp add --transport http product-os https://your-host/v1/mcp \
  --header "x-api-key: phk_…"
```

Then file work without leaving the conversation — *"there's a bug where avatar upload fails
over 5MB, file it for QC"* — or have it write up what you just talked through: *"turn that
into a discovery doc, with a diagram of the flow"*. Docs accept Mermaid, so the diagram
arrives drawn and stays editable as text. Team, status, and assignee take plain names; an
unknown one comes back with the valid choices instead of guessing. Items are authored by
**you**, and every one an assistant created is listed under **Settings → MCP**.

### …and the details that make it a workspace

- **Inbox** — mentions, assignments, and comment replies in one list, with reactions and an
  activity trail on every issue.
- **Personal tasks** — a private board only you can see, with your own columns, next to the
  team's.
- **Today & Overdue / Assigned to me** — the two views you actually start the morning in.
- **English & 한국어** — the whole UI, switchable per person.

---

## Works on every screen

Every board, form, editor, and detail view is fully responsive — the same roadmap, stacked
for a phone.

<div align="center">
<img src="docs/images/roadmap-mobile.png" alt="Roadmap on mobile" width="320" />
</div>

---

## Roles & permissions

Five roles, enforced on both the API and the UI:

| Role | Can do |
|---|---|
| **Admin** | Everything — manage people, workspace settings, delete roadmaps & OKRs. |
| **Product** | Create/edit roadmaps, OKRs & docs, manage delivery, set cycle goals. |
| **Tester** | Edit planning content and delivery work items (tasks, bugs, test cases). |
| **Developer** | Maintain delivery work items only. |
| **Guest** | Read-only — plus unguessable public links for stakeholders. |

---

## Tech stack

| Layer | Built with |
|---|---|
| **Frontend** | React + TypeScript, Vite, Tailwind CSS, Radix UI (shadcn-style), TanStack Query, React Router, Editor.js |
| **Backend** | NestJS 11, MongoDB (Mongoose), JWT auth, class-validator, Swagger, MCP over HTTP |
| **Platform console** | Same stack, separate app and separate origin ([`saas-admin/`](saas-admin/)) |
| **Tooling** | Docker Compose (MongoDB), one-command dev script |

---

## Run it locally

**Prerequisites:** Node.js 20+, and Docker (for MongoDB — or bring your own on `:27017`).

```bash
git clone <your-repo-url> product-hub
cd product-hub
./dev.sh
```

`./dev.sh` copies the example `.env` files, installs dependencies on first run, starts
MongoDB, and boots both servers:

| | URL |
|---|---|
| **App** | http://localhost:3001 |
| **API** | http://localhost:3000/v1 |
| **API docs (Swagger)** | http://localhost:3000/swagger |

Already have MongoDB running? Skip Docker with `SKIP_DB=1 ./dev.sh`.

Open the app, **register** a workspace, and you're in as its admin.

---

## Running it as a SaaS — the platform console

product-hub is multi-tenant: one deployment holds many workspaces. The **platform console**
([`saas-admin/`](saas-admin/)) is the vendor's own app for running that — every workspace on
the deployment, the plan catalog, subscriptions, and what each workspace actually uses.

```bash
ADMIN=1 ./dev.sh                            # console → http://localhost:3003
cd backend && npm run seed:platform         # first operator + a Free/Pro/Business catalog
```

It is a **separate app on a separate origin** with its own account collection and its own JWT
secret — a workspace user has no URL under the app that loads it, and a workspace token is not
valid against `/v1/platform`. That separation is the security model, so don't collapse it into
an `/admin` route. Full details, including the deployment checklist:
[`saas-admin/README.md`](saas-admin/README.md).

> In V1 plan limits are **reported, not enforced** — a workspace over its limit keeps working
> and the console tells you who to talk to.

---

## Project layout

```
product-hub/
├── frontend/     React + Vite SPA (features/, components/ui abstraction layer)
├── backend/      NestJS API (DDD: presentation / application / infrastructure)
│                 — also serves the MCP endpoint at /v1/mcp
│                 — and /v1/platform for the console
├── saas-admin/   Platform console SPA — tenants, plans, subscriptions, usage (vendor only)
├── collab/       Yjs sync server for collaborative doc editing (optional)
├── docs/         Product overview, architecture, roles, feature inventory
└── dev.sh        One-command local stack (Mongo + API + web [+ collab] [+ console])
```

More detail lives in [`docs/`](docs/) — start with
[`docs/01-product-overview.md`](docs/01-product-overview.md).

---

<div align="center">
<sub>Built to keep the product owner in control and the whole team on the same page.</sub>
</div>
