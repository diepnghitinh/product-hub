import { ClickUpStatusType } from '@application/app-settings/domain/clickup.types';

/**
 * The two boards' columns, reconciled.
 *
 * This is the whole of the feature's hard problem. Product OS boards and ClickUp
 * lists both have columns, both call them statuses, and neither agrees with the
 * other about what they are: ours are per-team `key`s that outlive a rename
 * (`in-progress`), ClickUp's are **names** that *are* the identity (`in progress`)
 * and are redefined per list.
 *
 * Three rules follow from that, and every function below obeys them:
 *
 * 1. **The map is explicit and stored.** We never re-derive at write time by
 *    comparing labels — a team renaming "Done" to "Shipped" would silently
 *    re-point the mapping and start moving work into the wrong ClickUp column.
 *    {@link autoMapStatuses} exists to *propose* a map for a human to confirm.
 * 2. **Unmapped means nothing happens.** Neither side gets a guess. Pushing an
 *    unmapped column sends no status at all (ClickUp keeps whatever it has), and
 *    an inbound change from an unmapped ClickUp status leaves our card where it
 *    is. A board that stays put is honest; a board that guesses is not.
 * 3. **Names are matched case-insensitively and shape-insensitively, values are
 *    stored verbatim.** ClickUp's API is case-sensitive on write but reports
 *    statuses lowercased, and workspaces write "In Progress", "in-progress" and
 *    "in progress" interchangeably. So comparison normalises; storage doesn't.
 */

/** One of our board columns bound to one ClickUp status. */
export interface ClickUpStatusPair {
  /** Our column key — a `TeamStatusConfig.key` or a `RoadmapColumn.key`. */
  key: string;
  /** ClickUp's status name, stored as ClickUp gave it. '' = deliberately unmapped. */
  clickupStatus: string;
}

/** One column of ours, as the mapper needs to see it. */
export interface OurColumn {
  key: string;
  label: string;
}

/** One status on the bound ClickUp list. */
export interface ClickUpListStatus {
  /** ClickUp's identity for it — the string a task's `status` field carries. */
  name: string;
  color: string;
  type: ClickUpStatusType;
  orderindex: number;
}

/**
 * Fold away everything two people typing the same column name would differ on:
 * case, spaces, hyphens, underscores. `In Progress`, `in-progress` and
 * `in_progress` all become `inprogress`.
 */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Words that mean the same column in the two vocabularies.
 *
 * Only for **auto-mapping**, and only as a fallback after exact matching — a
 * suggestion a human then confirms. Each list is a set of interchangeable names;
 * two columns match if they land in the same set.
 */
const SYNONYMS: string[][] = [
  ['todo', 'toDo', 'open', 'backlog', 'new', 'pending', 'notstarted'],
  ['inprogress', 'doing', 'active', 'started', 'wip', 'development'],
  ['inreview', 'review', 'codereview', 'qa', 'testing', 'verify'],
  ['blocked', 'onhold', 'hold', 'waiting', 'stuck'],
  ['done', 'complete', 'completed', 'resolved', 'fixed', 'shipped', 'released'],
  ['closed', 'cancelled', 'canceled', 'archived', 'wontdo', 'wontfix'],
];

/** The synonym set a name belongs to, or -1 when it's a word we don't know. */
function synonymGroup(name: string): number {
  const n = normalise(name);
  return SYNONYMS.findIndex((group) => group.some((word) => normalise(word) === n));
}

/** ClickUp's two finished buckets — the only judgement its API hands us for free. */
function isFinished(status: ClickUpListStatus): boolean {
  return status.type === ClickUpStatusType.DONE || status.type === ClickUpStatusType.CLOSED;
}

/**
 * Propose a mapping between our columns and a ClickUp list's statuses.
 *
 * A suggestion, never a commitment — it fills the form so the common case (both
 * boards use the obvious words) is one glance and a Save, and the uncommon case
 * is a form with the odd row left blank for a human to answer.
 *
 * It tries, in order and never reusing a ClickUp status already taken:
 *
 * 1. **The same name** — our label or our key equals a ClickUp status, ignoring
 *    case and punctuation. Unambiguous, so it goes first.
 * 2. **A synonym** — both names land in the same {@link SYNONYMS} set. This is
 *    what turns ClickUp's "complete" into our "done".
 * 3. **The ends** — our first column takes ClickUp's first *unfinished* status
 *    and our finished columns take its first *finished* one. Boards disagree
 *    about the middle far more often than about where work enters and leaves,
 *    so the ends are the only positional guess worth making.
 *
 * Anything still unmatched is left `''`, which the rest of the feature reads as
 * "this column doesn't sync" rather than as a hole to fill in later.
 */
export function autoMapStatuses(
  ours: OurColumn[],
  theirs: ClickUpListStatus[],
): ClickUpStatusPair[] {
  const taken = new Set<string>();
  const pairs: ClickUpStatusPair[] = ours.map((c) => ({ key: c.key, clickupStatus: '' }));

  const claim = (i: number, status: ClickUpListStatus | undefined) => {
    if (!status || taken.has(status.name)) return false;
    pairs[i].clickupStatus = status.name;
    taken.add(status.name);
    return true;
  };
  const free = () => theirs.filter((s) => !taken.has(s.name));

  // 1. Same name — on the label first (what people read), then the key.
  ours.forEach((col, i) => {
    const wanted = [normalise(col.label), normalise(col.key)];
    claim(
      i,
      free().find((s) => wanted.includes(normalise(s.name))),
    );
  });

  // 2. Synonyms, for the rows the exact pass left blank.
  ours.forEach((col, i) => {
    if (pairs[i].clickupStatus) return;
    const group = synonymGroup(col.label) >= 0 ? synonymGroup(col.label) : synonymGroup(col.key);
    if (group < 0) return;
    claim(
      i,
      free().find((s) => synonymGroup(s.name) === group),
    );
  });

  // 3. The ends. Entry first: our first column is where work begins, so it takes
  //    ClickUp's first unfinished status.
  if (ours.length && !pairs[0].clickupStatus) {
    claim(
      0,
      free().find((s) => !isFinished(s)),
    );
  }
  // Then the exit: any of our columns whose *name* reads as finished, in order,
  // against ClickUp's finished statuses. Read from the name because our columns
  // carry no done-flag — a custom column called "Shipped" is finished to a human
  // and to this mapping, even though nothing in the schema says so.
  const finishedGroups = [
    SYNONYMS.findIndex((g) => g[0] === 'done'),
    SYNONYMS.findIndex((g) => g[0] === 'closed'),
  ];
  ours.forEach((col, i) => {
    if (pairs[i].clickupStatus) return;
    const group = synonymGroup(col.label) >= 0 ? synonymGroup(col.label) : synonymGroup(col.key);
    if (!finishedGroups.includes(group)) return;
    claim(i, free().find(isFinished));
  });

  return pairs;
}

/**
 * Our column → the ClickUp status to send, or '' when this column doesn't sync.
 *
 * '' is a real answer with a real meaning downstream: the push omits `status`
 * entirely, so ClickUp keeps whatever the task had. Moving a card into a column
 * nobody mapped must not knock the ClickUp task into ClickUp's default.
 */
export function clickupStatusFor(map: ClickUpStatusPair[], ourKey: string): string {
  if (!ourKey) return '';
  return map.find((p) => p.key === ourKey)?.clickupStatus ?? '';
}

/**
 * A ClickUp status → our column key, or '' when nothing here matches it.
 *
 * The inbound half, and the reason comparison normalises: ClickUp reports a
 * task's status lowercased (`in progress`) even when the list defines it in
 * title case (`In Progress`), so a map stored from the list definition would
 * never match a delivery if this compared verbatim.
 */
export function ourStatusFor(map: ClickUpStatusPair[], clickupStatus: string): string {
  if (!clickupStatus) return '';
  const wanted = normalise(clickupStatus);
  return map.find((p) => p.clickupStatus && normalise(p.clickupStatus) === wanted)?.key ?? '';
}

/**
 * Drop pairs for columns that no longer exist, and add blank ones for columns
 * that have appeared since the map was saved.
 *
 * Called on every read of a binding, because a team can add or delete a board
 * column at any time and the mapping form must show today's columns — not the
 * ones that existed when someone last pressed Save. Order follows the board, so
 * the form reads top-to-bottom like the board does.
 */
export function reconcileMap(map: ClickUpStatusPair[], ours: OurColumn[]): ClickUpStatusPair[] {
  const saved = new Map(map.map((p) => [p.key, p.clickupStatus]));
  return ours.map((c) => ({ key: c.key, clickupStatus: saved.get(c.key) ?? '' }));
}
