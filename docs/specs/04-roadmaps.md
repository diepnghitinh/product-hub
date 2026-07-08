# Spec 04 · Roadmaps

A **roadmap** is a standalone **Now / Next / Later** board of backlog items, with
**RICE** prioritization. Roadmaps are their own space on the Dashboard — deliberately
**not** nested inside a project (per `features/roadmap.md`).

Models: `Roadmap`, `RoadmapItem`.
Screens: Dashboard (Roadmaps grid), `/roadmaps/[roadmap]` (board + RICE chart).
Components: `RoadmapBoard`, `RoadmapRiceChart`, `RoadmapPrintView`, `RoadmapShareModal`.

---

## 1. Roadmap object

| Field | Notes |
|---|---|
| `id`, `title` | A roadmap has just a name; **rename** is inline. |
| `owner`, `createdBy` | Ownership. |
| `projectIds[]` | Optional links to related projects. |
| `pinned` | Pins the card on the Dashboard. |
| `publicEnabled` + `publicToken` | Read-only public link. |
| `deletedAt` | Soft delete (hidden from all normal queries). |

### Dashboard card
Shows the title and **phase pills** — counts of items in **now / next / later / done** —
plus owner and "Updated … ago". Pinned first, then most-recent.

### Actions
- **Create** — `+ Roadmap` (writers) → prompts for a name → opens it.
- **Rename / Pin / Delete** — from the card kebab. Delete removes the roadmap and **all its items** (confirmed, irreversible).
- **Share** — members/public link (see [`06-public-sharing.md`](./06-public-sharing.md)).

> Note: a **project also has a Roadmap tab** (`/[project]/roadmap`, `GET·PUT /api/projects/[project]/roadmap`).
> That tab is a project-scoped roadmap surface; the standalone Roadmaps space is the
> primary, cross-project one described here.

---

## 2. Roadmap items (backlog items)

Each item is a card on the board.

| Field | Type | Notes |
|---|---|---|
| `title`, `desc` | string | The backlog item and its description. |
| `phase` | enum | `now` \| `next` \| `later` \| `done` — the **column**. |
| `status` | enum | `idea` \| `planned` \| `in-progress` \| `done` — workflow state within a phase. |
| `difficulty` | enum | `easy` \| `medium` \| `hard`. |
| `progress` | 0–100 | Manual progress. |
| `order` | number | Position within the phase. |
| `imageUrl` | string | Optional cover image. |
| `startDate` | string | Optional. |
| `assigneeIds[]` | string[] | Who's on it. |
| `reach`, `impact`, `confidence`, `effort` | 1–5 each | **RICE inputs** (default 3). |

### Behaviours
- **Add item** — with title + description.
- **Drag to order / move phase** — reorder within a column and move between Now/Next/Later/Done (`…/items/reorder`, `PUT …/items/[item]`).
- **Edit** — all fields incl. RICE, difficulty, assignees, progress, cover image.
- **Delete** — removes the item.

---

## 3. RICE prioritization

RICE turns four 1–5 inputs into a comparable priority score:

```
RICE = (Reach × Impact × Confidence) ÷ Effort
```

- Each input is an integer **1–5** (default **3**). Higher reach/impact/confidence = higher
  priority; higher effort lowers it.
- `RoadmapRiceChart.tsx` visualizes items by score so the team can see what's worth doing
  first — a scatter/ranking of value-vs-effort across the roadmap's items.

> This is the quantitative complement to the qualitative Now/Next/Later placement:
> the phase says *when*, RICE says *why this order*.

---

## 4. Linking to milestones & projects

- A roadmap can list related **projects** via `projectIds[]`.
- **Milestones** (OKRs) reference roadmaps via `Minestone.roadmapIds[]`, and
  `GET /api/roadmaps/[roadmap]/minestones` returns the milestones tied to a roadmap.
  This is how a roadmap's backlog rolls up into time-boxed OKR outcomes — see
  [`05-milestones-okr.md`](./05-milestones-okr.md).

---

## 5. Export & public view

- **Print / PDF** — `RoadmapPrintView` renders a print-friendly layout for browser print-to-PDF.
- **Public** — `/public/roadmaps/[token]` (board) and `/public/roadmaps/[token]/[item]` (single item), read-only.

---

## 6. Notable rules

- Roadmaps are **soft-deleted** (`deletedAt`) and auto-excluded from queries; deletion in the
  UI is presented as permanent (there is no roadmap "archive restore" UI like projects have).
- Phase (`now/next/later/done`) and item `status` (`idea/planned/in-progress/done`) are
  **separate axes** — an item can be in the `now` column with status `idea`.
- Reordering is index-based per phase; the API persists both `phase` and `order`.
