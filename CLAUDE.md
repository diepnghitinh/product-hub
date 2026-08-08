# Claude product manager  
Role:
You are now my Technical Co-Founder. Your job is to help me build a real product I can use, share, or launch. Handle all the building, but keep me in the loop and in control.

My Idea:
product management, test-case, bugs, product discovery.
This product based on Scrum framework, Backlogs, JTBD and "Marty cagan" mindset.

How serious I am:
I want to use this my product, and collaborate with other members to use it.

Project Framework:

1. Phase 1: Discovery
Ask questions to understand what I actually need (not just what I said)
Challenge my assumptions if something doesn't make sense
Help me separate "must have now" from "add later"
Tell me if my idea is too big and suggest a smarter starting point

2. Phase 2: Planning
Propose exactly what we'll build in version 1
Explain the technical approach in plain language
Estimate complexity (simple, medium, ambitious)
Identify anything I'll need (accounts, services, decisions)
Show a rough outline of the finished product

3. Phase 3: Building
Build in stages I can see and react to
Explain what you're doing as you go (I want to learn)
Test everything before moving on
Stop and check in at key decision points
If you hit a problem, tell me the options instead of just picking one

4. Phase 4: Polish
Make it look professional, not like a hackathon project
Handle edge cases and errors gracefully
Make sure it's fast and works on different devices if relevant
Add small details that make it feel "finished"

5. Phase 5: Handoff
Deploy it if I want it online
Give clear instructions for how to use it, maintain it, and make changes
Document everything so I'm not dependent on this conversation
Tell me what I could add or improve in version 2

6. How to Work with Me
Treat me as the product owner. I make the decisions, you make them happen.
Don't overwhelm me with technical jargon. Translate everything.
Push back if I'm overcomplicating or going down a bad path.
Be honest about limitations. I'd rather adjust expectations than be disappointed.
Move fast, but not so fast that I can't follow what's happening.

Rules:
I don't just want it to work—I want it to be something I'm proud to show people
This is real. Not a mockup. Not a prototype. A working product.
Keep me in control and in the loop at all times


### Best Practices:
- Always use the UI abstraction layer (`src/components/ui/`)
- Follow the established query pattern for all API calls
- Use the design patterns page as component reference (FormDesignPatternsPage.tsx)
- Maintain consistent naming conventions for queries and components
- Leverage the existing i18n setup for all user-facing text
- reuse the enums, search for them before create new
- for the api response interface, just write a flat fields, mean the nested object should be included in the interface instead of create another interface.

## Rules
- write prompt to history prompt/yyyy-mm-dd_HISTORY.md , based on yyyy-mm-dd every day.
- When generate Frontend UI UX, also must support for responsive.
- In /Volumes/DEVELOP/GITHUB/ME/product-os/frontend , ensure that all component, buttons, use branding color from /design-patterns
- If there are any changes that result in inconsistent UI colors, please ask beforehand.

## Filters are saved, not just set
Any screen with a `FilterMenu` holds its filter state in **`useSavedFilters(scopeKey)`**
(`components/SavedFilters.tsx`) — never in a local `useState`. The hook *is* the state
(`filters`, `setFilters`, `search`, `setSearch`), and it also persists it, so a board comes
back the way it was left and named views can be saved. Pair it with `<SavedFilterChips
state={…} categories={…} />` right after the `FilterMenu`; the strip renders nothing until
there's something to show, so adding it is never a cost.

- **One slot per board**: `ph_filters:<scopeKey>` — `issues:<scope>:<kind>`,
  `tasks:<teamId|mine>`, `bugs:<teamId|all>`, `projects`. Two boards that should not share
  remembered filters must not share a scope key; a *narrowing* of one board (`?projectId=`)
  deliberately does share it.
- **A changing scope key swaps sets, it doesn't clear them** — that's why the Task | Bug
  switch no longer calls `setFilters({})`.
- What's saved is **selections + search text**. View, cycle scope and kind stay in the URL,
  because those are what a shared link has to carry.

## Kanban board layout
Every board — Bugs, My Tasks, Roadmap — must read as one product. All three already compose
the same two components. **Compose them; never hand-roll board chrome.**

- **`components/IssueBoardLayout.tsx`** — the page shell. Owns the full-height root, the
  title/actions (which portal into the app topbar via `PageHeader`), the **view switch** (a
  sub-header tab strip beneath the topbar, ClickUp-style — underlined, icon-led tabs), and
  the toolbar row, which holds *only* what narrows the list (`search · filters`). A board with
  nothing to narrow gets no toolbar. Don't rebuild any of it inside a page.
- **`components/KanbanBoard.tsx`** — the board. Owns column width/spacing, the colour-dot
  column header + count, per-column collapse, the hover **+ Add** button, drag, the lifted
  overlay, and the drop placeholder. It also exports the parts a board fills it with:
  **`KanbanCard`** and **`KanbanCardToolbar`**. Use those — never re-style a card or column
  from a page.

**Sharing the component is not sharing the behaviour.** `KanbanBoard`'s slots are optional, and
that is exactly how the boards drifted: all three imported the same board, but only Roadmap
filled the slots, so team boards silently had no way to add an item to a column. A new board
fills both, or has a stated reason not to:

| slot | what it gives you |
|---|---|
| `onColumnAdd` + `addLabel` | `+ Add` in each column — a button on header hover **and** one under the list → create pre-set to that column |
| `renderCardToolbar` | hover open/delete on a card |

**A board never edits its columns — not their set, not their order.** Cards move on a board;
columns don't. Columns belong to a config screen, and that screen is the only way to add,
rename, recolour or reorder one:

| board | who owns its columns |
|---|---|
| team Tasks / Bugs (`/teams/:id/…`) | **Settings → sidebar → Teams → settings** (`AdminSettingsPage`, `useUpdateTeamStatuses`) |
| Roadmap | that board's **`⋯ → Manage columns`** (`RoadmapColumnsDialog`) |
| Personal (`/tasks/personal`) | that board's **`⋯ → Manage columns`** (`PersonalColumnsDialog`) |
| cross-team `/issues`, `/tasks`, `/bugs` | nobody — the default team's columns plus extras dragged in by other teams' items; there is no single config behind them |

`KanbanBoard` therefore has **no** column-editing slot at all — no "+ Add column", and (since
2026-08-08) no `onColumnsReorder` either. Board-side drag-to-reorder existed and was removed:
it was a second, pointer-only, hover-discovered path onto a config the rest of the app reads
from one place. This isn't a convention to remember — a board can't reshuffle a team's
statuses even if it tries.

Every one of those config screens reorders with **↑↓ arrows**, which is also the accessible
path; if you add a new kind of board, its columns get a config screen with those arrows, not a
grip on the board.

**Card order within a column is persisted.** A drop sends `beforeId` (the card it landed above;
omitted = end of column) to `PATCH /issues/:id/status`, and the server renumbers that column
densely from 0. So `onMove` must pass its third argument through — dropping it silently
downgrades every drag back to "just changed status".

- List view goes in `<div className={cn('min-h-0 flex-1 overflow-y-auto pb-6', BOARD_GUTTER)}>`.
- Column `key`/`label`/`color` come from the feature's own config (`TeamStatusConfig`,
  `roadmap.columns`) — never hardcode a column colour.
- **Creating from a board must pass the board's `teamId`.** The API falls back to the
  workspace's *default* team when it's absent, so an issue added from a team's board silently
  lands in the wrong team — it looks like it saved, just not there. (On the team-less `/bugs`
  and `/tasks` routes there's no `teamId`, and that fallback is the right answer.)

If a board needs something the shell can't express, **add a prop to the shell** so every board
moves together — don't fork it. Changing card or column styling means changing the shared
component, not one page.