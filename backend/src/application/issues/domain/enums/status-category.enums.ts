/**
 * Where a board column sits in the flow of work.
 *
 * Before this existed, "is this issue done?" was answered by reading the
 * *built-in key* literally (`done` / `resolved` / `closed`), which meant a team
 * that added its own column — "Released", "Wait to deploy" — had work that could
 * never be finished: it never stamped `resolvedAt`, never counted in a cycle's
 * burn-up, and rolled over into the next cycle forever.
 *
 * A category is that answer, moved onto the column itself. The status *key* is
 * still the stable identity stored on every issue; the category is what the rest
 * of the system reads to know what the column **means**.
 *
 * This file deliberately imports nothing: bugs, tasks, teams, users, issues and
 * cycles all read it, and any import here would close a cycle between them.
 */
export enum IssueStatusCategory {
  /** Not scheduled — someday/maybe work. Off the board's critical path. */
  BACKLOG = 'backlog',
  /** Scheduled and accepted, but nobody has started. */
  UNSTARTED = 'unstarted',
  /** Being worked on right now — including work that is stuck. */
  STARTED = 'started',
  /** Finished, and it counts: the one category that means "done". */
  COMPLETED = 'completed',
  /** Dropped without being delivered. Closed, but never "done". */
  CANCELED = 'canceled',
  /** Already covered by another issue. Closed, but never "done". */
  DUPLICATE = 'duplicate',
}

/**
 * Display order, and therefore board order: settings groups the columns under
 * these headings and saves the flattened result, so a board renders the array as
 * given and never has to sort. Left-to-right, this is the life of an issue.
 */
export const ISSUE_STATUS_CATEGORIES: IssueStatusCategory[] = [
  IssueStatusCategory.BACKLOG,
  IssueStatusCategory.UNSTARTED,
  IssueStatusCategory.STARTED,
  IssueStatusCategory.COMPLETED,
  IssueStatusCategory.CANCELED,
  IssueStatusCategory.DUPLICATE,
];

/**
 * Categories where an issue has left the flow of work. All three are "closed";
 * only {@link IssueStatusCategory.COMPLETED} is *finished* — a canceled or
 * duplicate issue was never delivered, so it must not inflate a completed count
 * or a burn-up line.
 */
export const CLOSED_CATEGORIES: IssueStatusCategory[] = [
  IssueStatusCategory.COMPLETED,
  IssueStatusCategory.CANCELED,
  IssueStatusCategory.DUPLICATE,
];

/** The category new work starts in when a column doesn't say otherwise. */
export const DEFAULT_STATUS_CATEGORY = IssueStatusCategory.UNSTARTED;

/**
 * The category a *legacy custom* column reads as — one stored before columns
 * carried a category at all.
 *
 * `STARTED` and not `COMPLETED` on purpose: an unknown column has always counted
 * as unfinished, so reading it this way changes nothing for existing data. A team
 * that meant "Released" to be done says so in settings; nothing is guessed on
 * their behalf, because guessing wrong would silently close live work.
 */
export const LEGACY_CUSTOM_CATEGORY = IssueStatusCategory.STARTED;

/** How long a column's one-line description may be — a hint, not a document. */
export const STATUS_DESCRIPTION_MAX = 200;

/** The shape every board column has, whatever owns it (a team, or a person's
 *  private board). Kept here so teams, users and issues share one definition. */
export interface StatusConfig {
  /** Built-in workflow key or a custom slug. Stable — issues store it. */
  key: string;
  label: string;
  color: string;
  /** What this column means. The one field the rest of the system reasons about. */
  category: IssueStatusCategory;
  /** Optional one-liner shown under the label ("Ready for QC to test"). */
  description?: string;
}

/** Whether `value` is a category we know. Guards data read back from the store. */
export function isStatusCategory(value: unknown): value is IssueStatusCategory {
  return ISSUE_STATUS_CATEGORIES.includes(value as IssueStatusCategory);
}

/**
 * Fill in the category of a column stored before categories existed.
 *
 * `builtinCategories` maps the shipped keys (`done`, `resolved`, …) to what they
 * have always meant, so every existing board keeps behaving exactly as it did.
 * Anything else is a team's own column and reads as {@link LEGACY_CUSTOM_CATEGORY}.
 *
 * This runs on *read*, not as a migration: a team that never opens settings is
 * never rewritten, and one that saves gets its choices stored properly.
 */
export function normalizeStatuses<T extends { key: string; label: string; color: string }>(
  statuses: T[],
  builtinCategories: Record<string, IssueStatusCategory>,
): StatusConfig[] {
  return statuses.map((s) => {
    const stored = (s as Partial<StatusConfig>).category;
    return {
      key: s.key,
      label: s.label,
      color: s.color,
      category: isStatusCategory(stored)
        ? stored
        : builtinCategories[s.key] ?? LEGACY_CUSTOM_CATEGORY,
      description: (s as Partial<StatusConfig>).description?.trim() || '',
    };
  });
}

/** The keys of the columns that mean **done** — what a rollup counts. */
export function completedKeysOf(statuses: StatusConfig[]): string[] {
  return statuses.filter((s) => s.category === IssueStatusCategory.COMPLETED).map((s) => s.key);
}

/** The keys of every column an issue can rest in without being in flight —
 *  done, dropped or duplicated. */
export function closedKeysOf(statuses: StatusConfig[]): string[] {
  return statuses.filter((s) => CLOSED_CATEGORIES.includes(s.category)).map((s) => s.key);
}
