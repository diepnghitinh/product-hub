# 01 · Product Overview

## What it is

**HWAVE Feature Reports** is an internal **product-management workspace**. It gives a
small product/QA team one place to:

1. **Document features** as living, sectioned reports (overview, screenshots, steps, test cases…).
2. **Run QA** — track test cases with results and coverage, and let automation update results via an API.
3. **Track bugs** on a Kanban board with severities, configurable statuses, and custom fields.
4. **Discuss** — comment threads on bugs with @-mentions, images, and video, plus a personal Inbox.
5. **Plan** — Now / Next / Later roadmaps with RICE prioritization.
6. **Align** — OKR milestones (Objective → Key Result → Individual) with progress rollup.
7. **Share** — read-only public links to projects, bugs, and roadmaps for stakeholders.

It's the connective tissue between **"what are we building"** (reports + roadmap),
**"does it work"** (test cases + bugs), and **"are we on track"** (milestones + dashboards).

## The problem it solves

Most teams scatter this across Jira + Confluence + a spreadsheet + Notion. HWAVE
Feature Reports collapses the **feature spec, the test evidence, and the bug list**
into a single per-feature report, and connects those to planning (roadmap/OKR).
Because reports are structured (not free-form docs), the app can compute rollups
(status counts, coverage, progress) and expose a machine API for CI to tick test
results — something a wiki can't do.

## Who it's for (personas)

| Persona | Role in app | What they do |
|---|---|---|
| **Product owner / PM** | `admin` | Creates projects, structures reports, owns the roadmap & milestones, manages people and settings. |
| **QA / tester / engineer** | `tester` | Writes & runs test cases, files & works bugs, comments, edits report testing sections. |
| **Stakeholder / viewer** | `guest` (or public link) | Reads reports, bugs, and roadmaps. Cannot edit. |
| **Automation / CI** | API key | Reads and updates test-case results via the public API. |

## Feature map

```
Dashboard (/)
├── Roadmaps
│   └── Roadmap detail ── Now/Next/Later board · RICE chart · public share
│       └── linked Milestones (OKR)
├── Projects
│   └── Project
│       ├── Report(s) ──── sectioned feature doc (overview, screenshots, steps, test cases…)
│       │                  └── Test cases ── results · coverage · import (xlsx/json) · public API
│       ├── Overview ───── feature summary + status rollup
│       ├── Roadmap tab ── project-scoped roadmap
│       ├── Bugs tab ───── project-scoped bug board
│       ├── History ────── audit log of test-case/report changes
│       └── Share ──────── members + public link · export JSON · export PDF
├── Bugs (global) ─────── Kanban · severity · configurable statuses · custom fields · attachments
│   └── Bug detail ────── Activity thread (comments · @mentions · media)
├── Milestones (global) ─ OKR list → detail (objectives/KRs/individuals) · Gantt
├── Inbox ─────────────── your mentions + assignments
└── Admin
    ├── People ────────── users & roles
    └── Settings ──────── Lark webhooks · bug statuses · bug fields · API keys · Archive
```

## Design language

The product ships a **Linear-inspired dark theme** (see `old-report/DESIGN.md`):
near-black canvas (`#010102`), a single lavender-blue accent (`#5e6ad2`), a four-step
surface ladder with hairline borders, dense typography with negative tracking, and
minimal chrome. Cards use 12px radii; buttons 8px. It's meant to read as
software-craft tooling, not a hackathon project. All screens are **responsive**.

## Glossary

| Term | Meaning |
|---|---|
| **Project** | A workspace grouping feature reports (has an environment, owner, members, optional public link). |
| **Group** | A named section in a project's sidebar that holds features/reports (e.g. "Billing"). |
| **Report / Feature** | One feature's document, made of ordered **sections**. "Feature" (menu label) and "Report" (the page) are the same object. |
| **Section** | A typed block in a report: overview, screenshot, cards, steps, bullets, ordered, or **testing**. |
| **Test case** | A structured row inside a report's *testing* section: area, type, result, steps, expected/actual… Has an internal `id` and a short human ID. |
| **Coverage** | Labeled percentage bars shown on a testing section (e.g. "Happy path 80%"). |
| **Bug** | An issue with severity, status, type, assignee, links to test cases, attachments, and custom fields. Has a `shortId`. |
| **Activity** | The 1-to-1 comment thread attached to a bug (designed to also attach to backlog items). |
| **Inbox** | Your personal feed of @-mentions and things assigned to you. |
| **Roadmap** | A standalone board of backlog items across Now / Next / Later / Done. |
| **RICE** | Reach × Impact × Confidence ÷ Effort — a prioritization score for roadmap items. |
| **Milestone** | A time-boxed OKR. Spelled **"Minestone"** in code. Structure: Objective → Key Result → Individual. |
| **Objective / Key Result / Individual** | OKR hierarchy. Individual = a checkable task; its status rolls up into KR progress, then objective, then milestone. |
| **Environment** | A project tag: development / staging / production. |
| **API key** | A global bearer token (admin-created) that authorizes the public test-case API. |
| **Public token** | An unguessable string that enables a read-only public URL for a project / bug board / roadmap. |

## Known intent gaps

The `old-report/features/*.md` intent notes are terse. Where they were ambiguous or
empty (`bugs.feature.md` was empty), these docs describe the **implemented** behaviour.
The clearest recorded intents:

- **Roadmap** (`roadmap.md`): a *separate* space (not inside projects) — "Dashboard shows Roadmaps then Projects." ✅ Implemented, though a project-scoped roadmap tab also exists.
- **Milestone** (`Minestone.md`): "aggregates backlogs; a backlog item can belong to multiple OKRs; it's an OKR with a timeframe: Objective → Key Result → Individual." ✅ Implemented as `Minestone`.
- **Activity** (`Activity.md`): "like chatting, 1-1 with a bug/backlog, comments only (no realtime)." ✅ Implemented for bugs; backlog wiring is stubbed in the model.
- **Update test case via API** (`update-testcase-via-api.md`): admin creates API keys → public API `/{project}/{testcase}` updates result, scoped to that project; History view shows the changes. ✅ Implemented.
