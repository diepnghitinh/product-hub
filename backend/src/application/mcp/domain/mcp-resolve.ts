import { TeamEntity } from '@application/teams/domain/entities/team.entity';
import { TeamIssueType, TeamStatusConfig } from '@application/teams/domain/enums/team.enums';
import { UserEntity } from '@application/users/domain/entities/user.entity';
import { ProjectEntity } from '@application/projects/domain/entities/project.entity';
import { ReportEntity } from '@application/reports/domain/entities/report.entity';
import { RoadmapEntity } from '@application/roadmaps/domain/entities/roadmap.entity';
import {
  DEFAULT_ROADMAP_COLUMNS,
  RoadmapColumn,
} from '@application/roadmaps/domain/types/roadmap-item.type';
import { IssueKind } from '@application/issues/domain/enums/issue.enums';

/**
 * Name-or-id resolution for MCP calls.
 *
 * An assistant works from what the user said — "file it under QC", "put it in
 * Next" — not from uuids. Every reference therefore accepts an id, a name, or a
 * label, matched case- and space-insensitively. When nothing matches we fail
 * with the list of valid choices rather than guessing: a silently misfiled issue
 * looks saved and simply isn't where the user will go looking for it.
 */
const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** `Result.fail` text that tells the model what it *could* have said. */
export const didYouMean = (what: string, ref: string, choices: string[]): string =>
  `Unknown ${what} "${ref}". Available: ${choices.join(', ')}`;

export function resolveTeam(
  teams: TeamEntity[],
  ref: string | undefined,
  kind: IssueKind,
): TeamEntity | null {
  const issueType = kind === IssueKind.BUG ? TeamIssueType.BUG : TeamIssueType.TASK;
  // A team owns exactly one issue type, so a bug can only land in a bug team —
  // filtering first means "Engineering" for a bug fails loudly instead of
  // creating a bug on a task board with task-only columns.
  const pool = teams.filter((t) => t.issueType === issueType && !t.archived);
  if (!ref) return pool.find((t) => t.isDefault) ?? pool[0] ?? null;
  const wanted = norm(ref);
  return (
    pool.find((t) => t.id.toString() === ref) ??
    pool.find((t) => norm(t.name) === wanted) ??
    pool.find((t) => norm(t.key) === wanted) ??
    null
  );
}

export function teamChoices(teams: TeamEntity[], kind: IssueKind): string[] {
  const issueType = kind === IssueKind.BUG ? TeamIssueType.BUG : TeamIssueType.TASK;
  return teams.filter((t) => t.issueType === issueType && !t.archived).map((t) => t.name);
}

/** A status is stored by `key`; accept the visible label too. */
export function resolveStatus(
  statuses: TeamStatusConfig[],
  ref: string | undefined,
): string | null {
  if (!ref) return statuses[0]?.key ?? null;
  const wanted = norm(ref);
  return (
    statuses.find((s) => s.key === ref)?.key ??
    statuses.find((s) => norm(s.key) === wanted)?.key ??
    statuses.find((s) => norm(s.label) === wanted)?.key ??
    null
  );
}

export function resolvePerson(users: UserEntity[], ref: string): UserEntity | null {
  const wanted = norm(ref);
  return (
    users.find((u) => u.id.toString() === ref) ??
    users.find((u) => norm(u.email) === wanted) ??
    users.find((u) => norm(u.name) === wanted) ??
    // Last resort: a first name, as long as it's unmistakable.
    (users.filter((u) => norm(u.name).startsWith(wanted)).length === 1
      ? (users.find((u) => norm(u.name).startsWith(wanted)) ?? null)
      : null)
  );
}

export function resolveRoadmap(
  roadmaps: RoadmapEntity[],
  ref: string | undefined,
): RoadmapEntity | null {
  // No roadmap named and only one exists — that's the one they mean.
  if (!ref) return roadmaps.length === 1 ? roadmaps[0] : null;
  const wanted = norm(ref);
  return (
    roadmaps.find((r) => r.id.toString() === ref) ??
    roadmaps.find((r) => norm(r.title) === wanted) ??
    roadmaps.find((r) => norm(r.title).includes(wanted)) ??
    null
  );
}

export const columnsOf = (roadmap: RoadmapEntity): RoadmapColumn[] =>
  roadmap.columns.length ? roadmap.columns : DEFAULT_ROADMAP_COLUMNS;

export function resolvePhase(columns: RoadmapColumn[], ref: string | undefined): string | null {
  if (!ref) return columns[0]?.key ?? null;
  const wanted = norm(ref);
  return (
    columns.find((c) => c.key === ref)?.key ??
    columns.find((c) => norm(c.key) === wanted)?.key ??
    columns.find((c) => norm(c.label) === wanted)?.key ??
    null
  );
}

/**
 * A testing project. Same "only one, so that's the one" rule roadmaps get: a
 * workspace that tests a single product shouldn't make an assistant name it.
 */
export function resolveProject(
  projects: ProjectEntity[],
  ref: string | undefined,
): ProjectEntity | null {
  if (!ref) return projects.length === 1 ? projects[0] : null;
  const wanted = norm(ref);
  return (
    projects.find((p) => p.id.toString() === ref) ??
    projects.find((p) => norm(p.slug) === wanted) ??
    projects.find((p) => norm(p.title) === wanted) ??
    // A partial only counts when it is unmistakable — two projects sharing a
    // word must not silently resolve to whichever was created first.
    (projects.filter((p) => norm(p.title).includes(wanted)).length === 1
      ? (projects.find((p) => norm(p.title).includes(wanted)) ?? null)
      : null)
  );
}

/**
 * A feature (report) inside a project. A feature has four names people use for
 * it — its title, its short sidebar label, its slug and the team's own feature
 * id ("FE-12") — and any of them is a fair thing for an assistant to have been
 * told, so all four resolve.
 */
export function resolveFeature(reports: ReportEntity[], ref: string): ReportEntity | null {
  const wanted = norm(ref);
  return (
    reports.find((r) => r.id.toString() === ref) ??
    reports.find((r) => norm(r.slug) === wanted) ??
    reports.find((r) => norm(r.title) === wanted) ??
    reports.find((r) => norm(r.label) === wanted) ??
    reports.find((r) => r.featureId && norm(r.featureId) === wanted) ??
    (reports.filter((r) => norm(r.title).includes(wanted)).length === 1
      ? (reports.find((r) => norm(r.title).includes(wanted)) ?? null)
      : null)
  );
}

/** In-app paths, so a history row and a tool reply both link to the real page.
 *  Tasks and bugs share one detail URL — the ref/id names the issue, and the app
 *  works out which kind it is. */
export const issueLink = (id: string): string => `/issues/${id}`;

/** A feature report opens inside its project's full-screen testing workspace. */
export const featureLink = (projectId: string, reportId: string): string =>
  `/testing/${projectId}/reports/${reportId}`;

export const backlogItemLink = (roadmapId: string, itemId: string): string =>
  `/roadmaps/${roadmapId}/items/${itemId}`;

/** A doc is only ever read through a page, so link to the one that was written. */
export const docPageLink = (docId: string, pageId: string): string => `/docs/${docId}/${pageId}`;
