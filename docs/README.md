# HWAVE Feature Reports — Product Documentation

> Statistics & feature specification for the existing application in `old-report/`
> (the running product, package name `hwave-feature-reports`, v0.2.0).
> Reverse-engineered from source on **2026-07-07**.

This folder documents **what the product already does today**, in plain language, so
the team can use it, extend it, or rebuild it without depending on the source code
or any single conversation.

---

## What is this product, in one line?

A **product-management workspace** where a team writes feature/QA reports, tracks
**test cases** and **bugs**, plans a **roadmap** (Now / Next / Later + RICE scoring),
runs **OKR milestones**, and shares any of it publicly via read-only links — with a
small **public API** so external CI/automation can flip test-case results.

It is a single web app (Next.js) backed by MongoDB, with role-based access
(admin / tester / guest), Azure Blob storage for attachments, and optional Lark
chat notifications.

---

## How to read these docs

Read them roughly in order. The numbered files are the "why + how it fits
together"; the `specs/` files are the per-feature detail.

| # | Document | What it covers |
|---|----------|----------------|
| 📊 | [`00-feature-inventory.md`](./00-feature-inventory.md) | **The statistics** — everything counted: features, data models, endpoints, pages, every enum/status value. Start here for the "thống kê". |
| 🧭 | [`01-product-overview.md`](./01-product-overview.md) | Vision, who it's for, the problem it solves, the feature map, glossary. |
| 🏗️ | [`02-architecture.md`](./02-architecture.md) | Tech stack, data model, information architecture (routes), storage, the auto-save model, code conventions. |
| 🔐 | [`03-roles-and-permissions.md`](./03-roles-and-permissions.md) | The three roles and exactly what each can do (RBAC matrix + access rules). |

### Feature specs (`specs/`)

| Spec | Feature area |
|------|--------------|
| [`specs/01-projects-reports-testcases.md`](./specs/01-projects-reports-testcases.md) | Projects, groups, feature reports, report sections, the feature summary, **test cases** (import, results, coverage). |
| [`specs/02-bugs.md`](./specs/02-bugs.md) | Bug tracking — Kanban board, severities, configurable statuses, custom fields, attachments, linking to test cases. |
| [`specs/03-activity-and-inbox.md`](./specs/03-activity-and-inbox.md) | Comment threads on bugs (with @-mentions & image/video), and the personal Inbox. |
| [`specs/04-roadmaps.md`](./specs/04-roadmaps.md) | Roadmaps — Now / Next / Later board, backlog items, **RICE** prioritization chart. |
| [`specs/05-milestones-okr.md`](./specs/05-milestones-okr.md) | Milestones — OKR structure (Objective → Key Result → Individual), Gantt view. |
| [`specs/06-public-sharing.md`](./specs/06-public-sharing.md) | Read-only public share links for projects, bugs, and roadmaps. |
| [`specs/07-api-keys-and-audit-log.md`](./specs/07-api-keys-and-audit-log.md) | Global API keys, the **public test-case API**, and the History / audit log. |
| [`specs/08-admin-settings-and-webhooks.md`](./specs/08-admin-settings-and-webhooks.md) | People management, app settings, project archive, and **Lark** webhook notifications. |

---

## Status of this documentation

- ✅ Covers every data model, every enum, and every API route present in the codebase.
- ✅ Behaviour described is what the code does (not aspirational).
- ⚠️ A few feature-intent notes (`old-report/features/*.md`) were terse or empty; where
  intent was ambiguous, the doc describes the **implemented** behaviour and flags the gap.
- 📌 Naming quirk: the OKR feature is spelled **"Minestone"** in code (a misspelling of
  "Milestone"). Docs use **"Milestone"** in prose and note the code spelling where it matters.

---

## Quick facts

- **App name:** `hwave-feature-reports` · **Version:** 0.2.0
- **Stack:** Next.js 15 (App Router, React 19) · MongoDB + Mongoose 8 · NextAuth 5 (beta) · Tailwind 3 · Editor.js · Azure Blob
- **13** data models · **49** API route modules · **~21** app pages · **~55** React components
- **3** roles · **8** major feature areas · **3** public-share surfaces
