import { Result } from '@shared/logic/result';
import { TeamEntity } from '@application/teams/domain/entities/team.entity';
import { TeamIssueType, TeamStatusConfig } from '@application/teams/domain/enums/team.enums';
import { UserEntity } from '@application/users/domain/entities/user.entity';
import { IssueEntity } from '@application/issues/domain/entities/issue.entity';
import { IIssueRepository } from '@application/issues/repositories/issue.repository';
import { TaskLabelConfig } from '@application/tasks/domain/enums/task.enums';
import { RoadmapEntity } from '@application/roadmaps/domain/entities/roadmap.entity';
import { RelationType } from '@application/issue-links/domain/relation-type.enum';
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

/**
 * Turn an issue *ref* (`TSK-7`, `BUG-12`) or a uuid into the issue itself.
 *
 * The write use-cases (`UpdateIssueUseCase`/`SetIssueStatusUseCase`/
 * `DeleteIssueUseCase`) look an issue up by `findById` — uuid ONLY — so a ref
 * passed straight through comes back "Issue not found". Every MCP write therefore
 * resolves the ref here first and hands the resulting `issue.id` (uuid) to the
 * use-case. `findByRef` accepts either form, so this is safe for both.
 */
export function resolveIssueRef(
  issues: IIssueRepository,
  tenantId: string,
  ref: string,
): Promise<IssueEntity | null> {
  return issues.findByRef(tenantId, ref);
}

export function resolvePerson(users: UserEntity[], ref: string): UserEntity | null {
  const wanted = norm(ref);
  return (
    users.find((u) => u.id.toString() === ref) ??
    users.find((u) => norm(u.email) === wanted) ??
    users.find((u) => norm(u.name) === wanted) ??
    // Last resort: a first name, as long as it's unmistakable.
    (users.filter((u) => norm(u.name).startsWith(wanted)).length === 1
      ? users.find((u) => norm(u.name).startsWith(wanted)) ?? null
      : null)
  );
}

/**
 * Turn a list of mention *names/emails* into userIds for a comment.
 *
 * An assistant writes "@jane", never her uuid — but `CreateCommentDto.mentions`
 * (and the @mention webhook it fires) is userIds only. Each name resolves through
 * the same `resolvePerson` the assignee fields use; an unknown one fails with the
 * valid choices rather than dropping the ping silently. An empty/absent list is a
 * clean `[]`, which lets `update_comment` clear mentions by passing `[]`.
 */
export function resolveMentions(
  users: UserEntity[],
  refs: string[] | undefined,
): Result<string[]> {
  const ids: string[] = [];
  for (const ref of refs ?? []) {
    const person = resolvePerson(users, ref);
    if (!person) {
      return Result.fail(
        didYouMean(
          'mention',
          ref,
          users.map((u) => u.name),
        ),
      );
    }
    ids.push(person.id.toString());
  }
  return Result.ok(ids);
}

/** A team label is stored by `key`; accept its visible label too. */
export function resolveLabel(
  labels: TaskLabelConfig[],
  ref: string,
): TaskLabelConfig | null {
  const wanted = norm(ref);
  return (
    labels.find((l) => l.key === ref) ??
    labels.find((l) => norm(l.key) === wanted) ??
    labels.find((l) => norm(l.name) === wanted) ??
    null
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

export function resolvePhase(
  columns: RoadmapColumn[],
  ref: string | undefined,
): string | null {
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
 * Turn a relation *word* into a {@link RelationType}. The canonical enum values
 * are the six stored strings (`blocks`, `blocked_by`, …); an assistant, though,
 * says "blocks", "blocked-by", "related", "duplicate" — so the friendly aliases
 * map onto the same values. Matched case-insensitively with `-`/`_`/spaces
 * folded, so `Blocked By`, `blocked-by` and `blocked_by` all resolve. Unknown →
 * `null`, and the caller lists {@link RELATION_TYPE_CHOICES}.
 */
const RELATION_ALIASES: Record<string, RelationType> = {
  blocks: RelationType.BLOCKS,
  blocking: RelationType.BLOCKS,
  'blocked-by': RelationType.BLOCKED_BY,
  related: RelationType.RELATED_TO,
  'related-to': RelationType.RELATED_TO,
  duplicate: RelationType.DUPLICATE_OF,
  'duplicate-of': RelationType.DUPLICATE_OF,
  parent: RelationType.PARENT_OF,
  'parent-of': RelationType.PARENT_OF,
  'sub-issue': RelationType.SUB_ISSUE_OF,
  'sub-issue-of': RelationType.SUB_ISSUE_OF,
  subissue: RelationType.SUB_ISSUE_OF,
};

/** The valid `type` words, quoted back when an unknown one is passed. */
export const RELATION_TYPE_CHOICES: string[] = [
  'blocks',
  'blocked-by',
  'parent-of',
  'sub-issue-of',
  'related-to',
  'duplicate-of',
];

export function resolveRelationType(ref: string | undefined): RelationType | null {
  if (!ref) return null;
  // Fold case, spaces and underscores to the hyphen form the alias table keys on,
  // so `Blocked By`, `blocked_by` and `blocked-by` all resolve to one value.
  const wanted = norm(ref).replace(/[\s_]+/g, '-');
  return RELATION_ALIASES[wanted] ?? null;
}

/** In-app paths, so a history row and a tool reply both link to the real page.
 *  Tasks and bugs share one detail URL — the ref/id names the issue, and the app
 *  works out which kind it is. */
export const issueLink = (id: string): string => `/issues/${id}`;

export const backlogItemLink = (roadmapId: string, itemId: string): string =>
  `/roadmaps/${roadmapId}/items/${itemId}`;

/** A doc is only ever read through a page, so link to the one that was written. */
export const docPageLink = (docId: string, pageId: string): string => `/docs/${docId}/${pageId}`;

/**
 * Giải tên team khi *chưa biết* team đó quản task hay bug — thứ `resolveTeam`
 * luôn cần. Cycle thuộc về team bất kể loại issue, nên analytics phải hỏi được
 * "team QC" mà không phải đoán trước.
 *
 * Khác `resolveTeam` một điểm quan trọng: ref rỗng trả `null` chứ không rơi về
 * team mặc định. Ở đây `team` là tham số bắt buộc — im lặng đọc nhầm team là
 * kiểu sai tệ nhất cho một tool báo số.
 */
export function resolveTeamAnyKind(teams: TeamEntity[], ref: string): TeamEntity | null {
  if (!ref?.trim()) return null;
  return resolveTeam(teams, ref, IssueKind.TASK) ?? resolveTeam(teams, ref, IssueKind.BUG);
}

/** Mọi team chưa lưu trữ, cả hai loại — danh sách cho `didYouMean`. */
export function anyTeamChoices(teams: TeamEntity[]): string[] {
  return [...teamChoices(teams, IssueKind.TASK), ...teamChoices(teams, IssueKind.BUG)];
}
