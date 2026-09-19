import { useQueries } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { t } from '@/i18n';
import { shortDay, todayIso } from '@/features/cycles/dates';
import { useTasks } from '@/features/tasks/api';
import { useTeams } from '@/features/teams/api';
import { CycleStatus } from '@/types/enums';
import type { CycleDto, TaskDto } from '@/types/dto';

/**
 * A roadmap's sprints, and which backlog item / task sits in which.
 *
 * Two facts about the data shape everything in this file:
 *
 * 1. **A backlog item has no cycle of its own.** `cycleId` lives on the *issue*;
 *    a roadmap item is an element of `roadmaps.items` and stores nothing about
 *    sprints. So an item's sprints are **derived** from the tasks linked to it —
 *    which is also the Scrum-true reading: a backlog item is delivered by work
 *    committed to sprints, and it may well take two of them. Nothing here writes;
 *    moving an item between sprints means moving its tasks, which is where the
 *    commitment actually lives — that write is `useSprintMove`, which reads the
 *    windows this file derives and turns one into a `cycleId` per task.
 * 2. **A cycle belongs to a team; a roadmap does not.** One item's tasks routinely
 *    span Design / Frontend / Backend, each running its own calendar, so a cycle
 *    *id* means nothing at roadmap level. The unit here is therefore the **window**:
 *    every team's cycle covering 3 Aug – 16 Aug is one sprint as far as this
 *    roadmap is concerned. A team running off-rhythm keeps its own entry rather
 *    than being force-fitted into someone else's — it just shows up as its own
 *    sprint on the list.
 */

/** `?sprint=` sentinels, alongside a concrete {@link RoadmapSprint.key}. */
export const SPRINT_ALL = 'all';
export const SPRINT_CURRENT = 'current';
export const SPRINT_NONE = 'none';

/**
 * The default scope — **the whole board**.
 *
 * It was `current`, so opening a roadmap landed you inside one sprint. That read
 * as the board being broken rather than filtered: the items you were looking for
 * were simply not in the running sprint, and during a cooldown gap there is no
 * current sprint at all. The product owner's ask is to see the board itself
 * first; the sprint scope is still one click away in the banner, and picking one
 * writes `?sprint=` so that narrowed board is still shareable.
 *
 * Kept out of the URL either way — a clean roadmap link means "the whole board",
 * not whichever sprint happened to be running when it was copied.
 */
export const SPRINT_DEFAULT = SPRINT_ALL;

/** One sprint on the roadmap's shared axis: a date window, plus every team cycle
 *  that runs in it. */
export interface RoadmapSprint {
  /** `2026-08-03_2026-08-16` — the window, which is the identity. */
  key: string;
  startDate: string;
  endDate: string;
  /** Derived from the dates against today, exactly as the backend derives a
   *  cycle's — never stored. */
  status: CycleStatus;
  /** Short name for a chip: the shared cycle name, else "Cycle 12", else the dates. */
  name: string;
  /** "Cycle 12 · Aug 3 – Aug 16" — the same shape as `cycleLabel`. */
  label: string;
  /** The team cycles merged into this window. */
  cycleIds: string[];
  /** Teams running this window (one per cycle above, deduped). */
  teamIds: string[];
  /**
   * `teamId` → the cycle that team runs in this window.
   *
   * A window is not a writable thing: a move writes a **task's** `cycleId`, and
   * the backend accepts only a cycle belonging to that task's own team (see
   * `update-issue.use-case.ts` — "Cycle not found" otherwise). So moving an item
   * here means looking up one cycle per task's team, which is exactly this map.
   * At most one entry per team: a team's cycles can't overlap and a window is an
   * exact start+end pair, so no team can have two cycles in it. A team missing
   * from the map runs nothing in this window — its tasks can't follow the move.
   */
  cycleIdByTeam: Record<string, string>;
}

/** What the board's `?sprint=` resolves to. `all` also covers a `current` that
 *  can't resolve (a cooldown gap) — showing everything is the honest answer when
 *  there is no sprint running, and it never leaves a board mysteriously empty. */
export type SprintScope =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'sprint'; sprint: RoadmapSprint };

export interface RoadmapSprintData {
  /** Every sprint on this roadmap, **newest first** (like the cycles API). */
  sprints: RoadmapSprint[];
  /** The sprints an item has work in, oldest → newest. `[]` = no task in any
   *  sprint (unplanned, or tasks on teams that don't run cycles). */
  sprintsForItem: (itemId: string) => RoadmapSprint[];
  /** The sprint a single task is committed to, if any. */
  sprintForTask: (task: TaskDto) => RoadmapSprint | undefined;
  /** Every task linked to this roadmap, and the same grouped by item — fetched
   *  once here and shared, so the five views don't each pay for it. */
  tasks: TaskDto[];
  tasksByItem: Map<string, TaskDto[]>;
  isLoading: boolean;
}

/** Where today sits in a window. ISO `YYYY-MM-DD` compares correctly as a string. */
function statusOf(startDate: string, endDate: string): CycleStatus {
  const today = todayIso();
  if (today < startDate) return CycleStatus.UPCOMING;
  if (today > endDate) return CycleStatus.COMPLETED;
  return CycleStatus.ACTIVE;
}

/**
 * What to call a window covered by several teams' cycles. The shared name wins
 * (a team that named its sprint meant something by it); failing that the shared
 * number, which is how an auto team identifies a cycle; failing that the dates,
 * which are always true.
 */
function nameOf(group: CycleDto[]): string {
  const names = group.map((c) => c.name.trim());
  if (names[0] && names.every((n) => n === names[0])) return names[0];
  const num = group[0].number;
  if (group.every((c) => c.number === num)) return `${t('cycles.cycle')} ${num}`;
  return `${shortDay(group[0].startDate)} – ${shortDay(group[0].endDate)}`;
}

/** Merge every team's cycles into the roadmap's window-based sprints, newest first. */
function mergeCycles(cycles: CycleDto[]): RoadmapSprint[] {
  const byWindow = new Map<string, CycleDto[]>();
  for (const c of cycles) {
    if (!c.startDate || !c.endDate) continue;
    const key = `${c.startDate}_${c.endDate}`;
    const group = byWindow.get(key);
    if (group) group.push(c);
    else byWindow.set(key, [c]);
  }

  return [...byWindow.entries()]
    .map(([key, group]) => {
      const { startDate, endDate } = group[0];
      const name = nameOf(group);
      return {
        key,
        startDate,
        endDate,
        status: statusOf(startDate, endDate),
        name,
        label: `${name} · ${shortDay(startDate)} – ${shortDay(endDate)}`,
        cycleIds: group.map((c) => c.id),
        teamIds: [...new Set(group.map((c) => c.teamId))],
        cycleIdByTeam: Object.fromEntries(group.map((c) => [c.teamId, c.id])),
      };
    })
    .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0));
}

/**
 * The roadmap's sprint layer. One task fetch for the whole roadmap (the same
 * query key the timeline already used, so the two share a cache entry), plus the
 * cycle list of every team that actually has work here — asking the rest would
 * fill the filter with sprints no item on this roadmap belongs to.
 */
export function useRoadmapSprints(roadmapId: string): RoadmapSprintData {
  const { data, isLoading: tasksLoading } = useTasks({ roadmapId: [roadmapId] });
  const { data: teams } = useTeams();
  const tasks = data?.items ?? [];

  // Only teams that (a) run cycles and (b) own a task on this roadmap. Reading a
  // team's cycles also advances its lazy scheduler server-side, so this isn't a
  // list to pad.
  const teamIds = new Set(tasks.map((tk) => tk.teamId).filter(Boolean));
  const cycleTeamIds = (teams ?? [])
    .filter((team) => team.cyclesEnabled && teamIds.has(team.id))
    .map((team) => team.id);

  // Same query key as `useCycles`, so a team board visited earlier has already
  // paid for this and the roadmap reads it straight from cache.
  const cycleQueries = useQueries({
    queries: cycleTeamIds.map((teamId) => ({
      queryKey: ['cycles', teamId],
      queryFn: () => apiGet<CycleDto[]>(`/teams/${teamId}/cycles`),
    })),
  });

  const sprints = mergeCycles(cycleQueries.flatMap((q) => q.data ?? []));
  const sprintByCycleId = new Map<string, RoadmapSprint>();
  for (const sprint of sprints) {
    for (const id of sprint.cycleIds) sprintByCycleId.set(id, sprint);
  }

  const tasksByItem = new Map<string, TaskDto[]>();
  for (const tk of tasks) {
    if (!tk.roadmapItemId) continue;
    const arr = tasksByItem.get(tk.roadmapItemId);
    if (arr) arr.push(tk);
    else tasksByItem.set(tk.roadmapItemId, [tk]);
  }

  // Item → its sprints, oldest first (the order you'd narrate them in: "started
  // in 11, finished in 12"). Built once rather than per lookup — the board calls
  // this for every card.
  const sprintsByItem = new Map<string, RoadmapSprint[]>();
  for (const [itemId, itemTasks] of tasksByItem) {
    const seen = new Map<string, RoadmapSprint>();
    for (const tk of itemTasks) {
      const sprint = tk.cycleId ? sprintByCycleId.get(tk.cycleId) : undefined;
      if (sprint) seen.set(sprint.key, sprint);
    }
    sprintsByItem.set(
      itemId,
      [...seen.values()].sort((a, b) => (a.startDate < b.startDate ? -1 : 1)),
    );
  }

  return {
    sprints,
    sprintsForItem: (itemId) => sprintsByItem.get(itemId) ?? [],
    sprintForTask: (task) => (task.cycleId ? sprintByCycleId.get(task.cycleId) : undefined),
    tasks,
    tasksByItem,
    isLoading: tasksLoading || cycleQueries.some((q) => q.isLoading),
  };
}

/** The board's `?sprint=` value → the scope actually in effect. */
export function resolveScope(sprints: RoadmapSprint[], param: string): SprintScope {
  if (!param || param === SPRINT_ALL) return { kind: 'all' };
  if (param === SPRINT_NONE) return { kind: 'none' };
  const sprint =
    param === SPRINT_CURRENT
      ? sprints.find((s) => s.status === CycleStatus.ACTIVE)
      : sprints.find((s) => s.key === param);
  // An unresolvable scope (cooldown gap; a link to a sprint since re-rhythmed)
  // falls back to everything rather than to an empty board with no explanation.
  return sprint ? { kind: 'sprint', sprint } : { kind: 'all' };
}

/**
 * Is this backlog item in scope?
 *
 * **Strict**: scoped to a sprint, only items with work committed to that sprint
 * survive — every column, Now through Later. An item nobody scheduled therefore
 * *disappears* from the sprint view, which is the point: a gap you can see beats
 * a card sitting in Later looking planned. The {@link SPRINT_NONE} scope is the
 * other half of that pair — it lists exactly the items no sprint has picked up.
 */
export function itemInScope(itemSprints: RoadmapSprint[], scope: SprintScope): boolean {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'none') return itemSprints.length === 0;
  return itemSprints.some((s) => s.key === scope.sprint.key);
}

/** The chip's text for an item: "Cycle 12", or "Cycle 12 +1" when it spans more. */
export function sprintChipLabel(sprints: RoadmapSprint[]): string {
  if (sprints.length === 0) return '';
  const first = sprints[sprints.length - 1].name;
  return sprints.length > 1 ? `${first} +${sprints.length - 1}` : first;
}
