# Spec 05 · Milestones (OKR)

A **milestone** is a **time-boxed OKR**. It aggregates work into
**Objective → Key Result → Individual**, rolls progress up automatically, and can span
multiple roadmaps.

> ⚠️ **Spelling:** the code calls this **"Minestone"** (model `Minestone`, routes
> `/api/minestones`, screens `/milestones`). Prose here says **Milestone**.

Model: `Minestone` (with embedded objectives/KRs/individuals).
Screens: `/milestones` (list), `/milestones/[minestone]` (detail + Gantt).
Components: `MinestoneBoard`, `MilestoneGantt`, `MilestoneDetailGantt`.

---

## 1. Concept (from `features/Minestone.md`)

- A milestone **aggregates product backlogs** — a backlog item can belong to multiple OKRs.
- It is **an OKR with a specific timeframe** (`startDate` → `endDate`).
- Structure: **1 OKR → Objectives (n) → Key Results (n) → Individuals (n)**.

---

## 2. Structure & fields

### Milestone (`MinestoneDTO`)
| Field | Notes |
|---|---|
| `id`, `title`, `description` | Header. |
| `roadmapId` + `roadmapIds[]` | The roadmap(s) this milestone spans. |
| `startDate`, `endDate` | The timeframe (drives the Gantt). |
| `status` | `active` \| `completed` \| `archived`. |
| `createdBy` | Owner. |
| `objectives[]` | The OKR tree (below). |

### Objective (`MinestoneObjectiveDTO`)
`id, title, description?, order, startDate?, endDate?, keyResults[]`

### Key Result (`MinestoneKeyResultDTO`)
`id, title, order, progress (0–100, auto-calculated), individuals[]`

### Individual (`MinestoneIndividualDTO`) — the checkable unit of work
`id, title, status (todo | in-progress | done), assigneeIds[], order`

---

## 3. Progress rollup (automatic)

Progress flows **up** the tree:

```
Individual.status (todo / in-progress / done)
        │  done individuals ÷ total individuals
        ▼
KeyResult.progress  (0–100, auto-calculated)
        │  averaged across KRs
        ▼
Objective progress
        │  averaged across objectives
        ▼
Milestone progress  (MinestoneSummary.progress, 0–100)
```

- You don't type KR progress — it's derived from how many of its **individuals** are `done`.
- The milestone list (`MinestoneSummary`) shows `objectiveCount` and an overall `progress` %.

---

## 4. Timeframe & Gantt

- Each milestone has `startDate`/`endDate`; objectives can carry their own dates too.
- `MilestoneGantt` (list view) and `MilestoneDetailGantt` (detail) render the timeline —
  objectives/KRs plotted across the milestone's window so you can see overlap and slippage.

---

## 5. Statuses

| Level | Values |
|---|---|
| Milestone | `active` · `completed` · `archived` |
| Individual (task) | `todo` · `in-progress` · `done` |

Objectives and Key Results have **no explicit status** — their state is expressed through
their children's completion (rolled-up progress).

---

## 6. Actions & endpoints

| Action | Endpoint |
|---|---|
| List milestones | `GET /api/minestones` |
| Create milestone | `POST /api/minestones` |
| Read / update / delete | `GET·PUT·DELETE /api/minestones/[minestone]` |
| Roadmaps linked to a milestone | `GET /api/minestones/[minestone]/roadmaps` |
| Milestones linked to a roadmap | `GET /api/roadmaps/[roadmap]/minestones` |

- Editing objectives/KRs/individuals happens through the milestone **PUT** (the whole
  objectives tree is embedded on the `Minestone` document).
- `Minestone` is **soft-deleted** (`deletedAt`) and auto-excluded from queries.

---

## 7. How it connects

```
Roadmap(s) ──roadmapIds[]──> Milestone (OKR, timeframe)
                              └─ Objective ── Key Result ── Individual ──assigneeIds[]──> User
                                                                  │
                                                                  └─> assignee's Inbox (kind: assigned-milestone)
```

- Milestones sit **above** roadmaps: a roadmap holds the backlog (what/when + RICE), a
  milestone frames outcomes (why/by-when) as OKRs and pulls in one or more roadmaps.
- Assigning an individual to a user surfaces it in that user's **Inbox**
  (see [`03-activity-and-inbox.md`](./03-activity-and-inbox.md)).

---

## 8. Notable rules

- **A backlog item can belong to multiple OKRs** — the relationship is many-to-many by intent
  (milestones reference roadmaps via `roadmapIds[]`, not the reverse).
- **KR progress is never edited directly** — always derived from individuals.
- Keep the **"Minestone"** code spelling in mind when searching the codebase or writing queries.
