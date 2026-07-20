import { DEFAULT_BUG_STATUSES } from '@application/bugs/domain/enums/bug.enums';
import { DEFAULT_TASK_STATUSES } from '@application/tasks/domain/enums/task.enums';

/**
 * What kind of issues a team's list holds. A team owns exactly one type, so its
 * board renders either the bug board or the task board.
 */
export enum TeamIssueType {
  BUG = 'bug',
  TASK = 'task',
}

export const TEAM_ISSUE_TYPES: TeamIssueType[] = [TeamIssueType.BUG, TeamIssueType.TASK];


/** A team with no icon set falls back to the symbol for the list it owns. */
export function defaultIconFor(issueType: TeamIssueType): string {
  return issueType === TeamIssueType.BUG ? 'bug' : 'tasks';
}

/**
 * The accent a team's symbol is drawn in. Same palette the roadmap columns use,
 * so a workspace never sprouts off-brand colours.
 */
export const TEAM_COLORS: string[] = [
  'hsl(248 53% 58%)', // violet
  'hsl(212 72% 52%)', // blue
  'hsl(180 52% 40%)', // teal
  'hsl(142 55% 40%)', // green
  'hsl(38 92% 50%)', // amber
  'hsl(18 80% 54%)', // orange
  'hsl(0 70% 58%)', // red
  'hsl(330 68% 56%)', // pink
  'hsl(220 9% 46%)', // slate
];

/** No colour set means the symbol inherits its surroundings, as it always did. */
export const DEFAULT_TEAM_COLOR = null;

/**
 * Every workspace gets these two on creation and they can't be removed — QC
 * owns the bug list, Engineering owns the task list. (They can be renamed;
 * `key` is the stable identity.)
 */
export const DEFAULT_TEAMS: { key: string; name: string; issueType: TeamIssueType }[] = [
  { key: 'qc', name: 'QC', issueType: TeamIssueType.BUG },
  { key: 'engineering', name: 'Engineering', issueType: TeamIssueType.TASK },
];

export const DEFAULT_TEAM_KEYS = DEFAULT_TEAMS.map((t) => t.key);


/** A board column on a team. Same shape for bugs and tasks. */
export interface TeamStatusConfig {
  key: string;
  label: string;
  color: string;
}

/** The statuses a team of this type starts with — also the ones it can never drop. */
export function defaultStatusesFor(issueType: TeamIssueType): TeamStatusConfig[] {
  const base = issueType === TeamIssueType.BUG ? DEFAULT_BUG_STATUSES : DEFAULT_TASK_STATUSES;
  return base.map((s) => ({ ...s }));
}

/**
 * Built-in status keys are the board's contract: rollups read them literally
 * (open bugs = not resolved/closed; "N of M done" = done). They can be renamed,
 * recoloured and reordered, but never removed.
 */
export function builtinStatusKeys(issueType: TeamIssueType): string[] {
  return defaultStatusesFor(issueType).map((s) => s.key);
}
