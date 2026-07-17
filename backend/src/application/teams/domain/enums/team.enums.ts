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

/**
 * The symbol shown next to a team in the nav. Values match the frontend's icon
 * registry names, so the API validates against exactly what can be rendered.
 */
export enum TeamIcon {
  BUG = 'bug',
  TASKS = 'tasks',
  CODE = 'code',
  FLASK = 'flask',
  SHIELD = 'shield',
  ROCKET = 'rocket',
  PEN = 'pen',
  CHART = 'chart',
  DATABASE = 'database',
  SERVER = 'server',
  BOOK = 'book',
  MEGAPHONE = 'megaphone',
  WRENCH = 'wrench',
  SPARKLES = 'sparkles',
  PEOPLE = 'people',
  FLAG = 'flag',
  ZAP = 'zap',
  CLOUD = 'cloud',
  LOCK = 'lock',
  COMPASS = 'compass',
  PACKAGE = 'package',
  GLOBE = 'globe',
  HEADPHONES = 'headphones',
  MILESTONE = 'milestone',
}

export const TEAM_ICONS: TeamIcon[] = Object.values(TeamIcon);

/** A team with no icon set falls back to the symbol for the list it owns. */
export function defaultIconFor(issueType: TeamIssueType): TeamIcon {
  return issueType === TeamIssueType.BUG ? TeamIcon.BUG : TeamIcon.TASKS;
}

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
