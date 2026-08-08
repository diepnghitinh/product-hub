import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowUpRight } from 'lucide-react';
import { apiPatch } from '@/lib/api';
import { t } from '@/i18n';
import { Button } from '@/components/ui';
import { Icon } from '@/components/Icon';
import type { KanbanSwimlane } from '@/components/KanbanBoard';
import {
  DEFAULT_ROADMAP_COLUMNS,
  ROADMAP_ITEM_STATUS_COLOR,
  ROADMAP_ITEM_STATUS_LABEL,
  type RoadmapItemStatus,
  type TeamStatusConfig,
} from '@/types/enums';
import type { ListResponse, RoadmapDto } from '@/types/dto';

/**
 * Cutting a board by **backlog item** — the second axis every issue board can be
 * read on: not "what state is this in" but "which bet is it paying for".
 *
 * One module because the board and the list must agree. A kanban grouped by item
 * draws one horizontal band per item; the list draws one section per item. Same
 * groups, same order, same names — two implementations would drift the moment one
 * of them changed how it handles an item nobody can resolve any more.
 *
 * Nothing here needs an API: an issue already carries `roadmapItemId` plus a
 * denormalized `roadmapItemLabel`, so grouping is a pure read over what the board
 * already fetched.
 */

/** The lane/section for issues attached to no backlog item. Not an item id — no
 *  item can be `''`. Mirrors the roadmap board's `UNGROUPED`. */
export const UNLINKED = '';

/**
 * A backlog (roadmap) item, flattened out of the roadmap that holds it. The
 * Backlog-item *filter's* options and the board's lanes read from the same pass,
 * so both stay in roadmap order and name items the same way.
 */
export interface BacklogItemRef {
  id: string;
  title: string;
  /** The roadmap it belongs to — two roadmaps can name an item the same thing. */
  roadmap: string;
  roadmapId: string;
  /**
   * The denormalized label an issue stores when it's linked ("Now · Passkey
   * sign-in") — byte-for-byte what the item page, the picker dialog and the New
   * task form write, so a relink can't leave two spellings in the workspace.
   */
  label: string;
  status: RoadmapItemStatus;
  /** The item's own page (`shortId || id`, which the detail resolves either way). */
  href: string;
}

/** Every backlog item in the workspace, in roadmap order. */
export function backlogItemRefs(roadmaps: RoadmapDto[] | undefined): BacklogItemRef[] {
  return (roadmaps ?? []).flatMap((r) => {
    const columns = r.columns?.length ? r.columns : DEFAULT_ROADMAP_COLUMNS;
    return (r.items ?? []).map((i) => ({
      id: i.id,
      title: i.title,
      roadmap: r.title,
      roadmapId: r.id,
      label: `${columns.find((c) => c.key === i.phase)?.label ?? i.phase} · ${i.title}`,
      status: i.status,
      href: `/roadmaps/${r.id}/items/${i.shortId || i.id}`,
    }));
  });
}

/** What grouping needs off an issue — `TaskDto`, `BugDto` and `IssueDto` all
 *  satisfy it structurally, so one set of functions serves all three boards. */
export interface LinkedIssue {
  id: string;
  status: string;
  roadmapItemId: string;
  roadmapItemLabel: string;
}

/** Which band an issue belongs in. Pass straight to `KanbanBoard`'s
 *  `getSwimlaneKey` — it returns the same key {@link groupByBacklogItem} files
 *  the issue under, which is what keeps the lanes and their cards in step. */
export const backlogKeyOf = (issue: LinkedIssue) => issue.roadmapItemId || UNLINKED;

/** One block of a grouped board: a heading (or lane header) and its issues. */
export interface IssueGroup<T> {
  /** A status column key, a backlog item id, or {@link UNLINKED}. */
  key: string;
  /** Which axis cut this group — a status leads with its dot, an item with the
   *  roadmap glyph and a link to the bet it names. */
  kind: 'status' | 'item';
  label: string;
  /** Dot colour: the column's own, or the item's status colour. */
  color: string;
  /** The roadmap the item sits on (item groups only). */
  hint?: string;
  /** The item's page, when the group names one that still resolves. */
  href?: string;
  /** Where the *item* is (Idea / Planned / In progress / Done) — not the issues'. */
  statusLabel?: string;
  list: T[];
}

/** The default cut: one section per status column, in the board's column order.
 *  Empty columns are dropped rather than left as headings. */
export function groupByStatus<T extends LinkedIssue>(
  items: T[],
  columns: TeamStatusConfig[],
): IssueGroup<T>[] {
  return columns
    .map((col) => ({
      key: col.key,
      kind: 'status' as const,
      label: col.label,
      color: col.color,
      list: items.filter((it) => it.status === col.key),
    }))
    .filter((g) => g.list.length > 0);
}

/**
 * Cut by backlog item. Known items come first in roadmap order (so a grouped
 * board reads the way its roadmap does), then anything pointing at an item this
 * page can't resolve — a deleted item, or one on a roadmap the fetch didn't carry
 * — labelled from the issue's own denormalized copy rather than dropped. Whatever
 * isn't linked at all lands in one group at the end: that group *is* the answer to
 * "what work isn't attached to a bet yet", so it's never hidden.
 *
 * **Only items with issues get a group.** A workspace has far more backlog items
 * than any one board has work for, and a board of empty bands says nothing. The
 * cost is that you can't drag onto a bet nothing is on yet — that link is made on
 * the issue itself (or from the item's own page), which is where an empty bet is
 * being planned anyway.
 */
export function groupByBacklogItem<T extends LinkedIssue>(
  items: T[],
  refs: BacklogItemRef[],
): IssueGroup<T>[] {
  const byItem = new Map<string, T[]>();
  for (const it of items) {
    const key = backlogKeyOf(it);
    const list = byItem.get(key);
    if (list) list.push(it);
    else byItem.set(key, [it]);
  }

  const groups: IssueGroup<T>[] = [];
  for (const ref of refs) {
    const list = byItem.get(ref.id);
    if (!list) continue;
    byItem.delete(ref.id);
    groups.push({
      key: ref.id,
      kind: 'item',
      label: ref.title,
      color: ROADMAP_ITEM_STATUS_COLOR[ref.status],
      hint: ref.roadmap,
      href: ref.href,
      statusLabel: ROADMAP_ITEM_STATUS_LABEL[ref.status],
      list,
    });
  }
  // Held back so it stays last, however many unresolvable ids follow it.
  const unlinked = byItem.get(UNLINKED);
  byItem.delete(UNLINKED);
  for (const [key, list] of byItem) {
    groups.push({
      key,
      kind: 'item',
      label: list[0].roadmapItemLabel || t('tasks.backlogItem'),
      color: 'hsl(var(--muted-foreground))',
      list,
    });
  }
  if (unlinked) {
    groups.push({
      key: UNLINKED,
      kind: 'item',
      label: t('tasks.noBacklogItem'),
      color: 'hsl(var(--muted-foreground))',
      list: unlinked,
    });
  }
  return groups;
}

/**
 * The same groups as swimlanes — one band per backlog item, each holding the
 * board's full set of status columns, so the header cuts horizontally across the
 * kanban. Built *from* the groups rather than beside them: the board and the list
 * are then the same reading, drawn twice.
 */
export function backlogLanes<T>(groups: IssueGroup<T>[]): KanbanSwimlane[] {
  return groups.map((g) => ({
    key: g.key,
    label: g.label,
    color: g.color,
    // The roadmap the bet sits on — the lane header drops it below `sm`, where
    // the name and the count are all there's room for.
    description: g.hint,
    meta: (
      <>
        {g.statusLabel && (
          <span className="hidden text-xs text-muted-foreground sm:inline">{g.statusLabel}</span>
        )}
        {g.href && (
          <Link
            to={g.href}
            title={t('tasks.backlogItem')}
            className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowUpRight className="size-4" aria-hidden />
            <span className="sr-only">{g.label}</span>
          </Link>
        )}
      </>
    ),
  }));
}

/**
 * The heading above a list section — shared so the three issue lists (`/issues`,
 * a team's Tasks, a team's Bugs) can't drift apart. `leading` is the bulk
 * select-all checkbox on the boards that have one.
 */
export function IssueGroupHeading<T>({
  group,
  leading,
}: {
  group: IssueGroup<T>;
  leading?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      {leading}
      {group.kind === 'status' ? (
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: group.color }}
          aria-hidden
        />
      ) : (
        <Icon name="roadmap" size={14} className="shrink-0 text-muted-foreground" />
      )}
      <h2 className="min-w-0 shrink truncate text-sm font-medium text-foreground">
        {group.href ? (
          <Link to={group.href} className="underline-offset-4 hover:underline">
            {group.label}
          </Link>
        ) : (
          group.label
        )}
      </h2>
      {/* The roadmap comes straight after the item it names, so the two read as
          one phrase and the count stays where the status headings put it —
          trailing. Dropped below `sm`, where the title needs the room. */}
      {group.hint && (
        <span className="hidden min-w-0 shrink truncate text-xs text-muted-foreground sm:inline">
          · {group.hint}
        </span>
      )}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {group.list.length}
      </span>
    </div>
  );
}

/** A row's own status — grouped by item no heading carries it any more, so the
 *  rows say it themselves. The dot alone on a narrow screen: the label is the
 *  first thing worth dropping when a row runs out of room. */
export function IssueStatusChip({ status }: { status: TeamStatusConfig | undefined }) {
  if (!status) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
      title={status.label}
    >
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: status.color }}
        aria-hidden
      />
      <span className="hidden sm:inline">{status.label}</span>
    </span>
  );
}

/**
 * The grouping toggle, in the page header beside the primary action. Below `sm`
 * it drops to its glyph: the header doesn't wrap, and a second worded button
 * there truncates the page title instead.
 */
export function GroupByItemButton({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Button
      variant={on ? 'primary' : 'secondary'}
      size="sm"
      aria-pressed={on}
      title={t('issues.groupByItem')}
      onClick={() => onChange(!on)}
    >
      <Icon name="roadmap" />
      <span className="max-sm:sr-only">{t('issues.groupByItem')}</span>
    </Button>
  );
}

/**
 * Grouping rides in the URL (`?group=item`) for the same reason the view does:
 * "here's the board, cut by bet" has to survive a reload and be a link you can
 * send. It's the same `?group=` the roadmap board uses for epics.
 */
export function useGroupByItem(): [boolean, (on: boolean) => void] {
  const [params, setParams] = useSearchParams();
  const on = params.get('group') === 'item';
  return [
    on,
    (next: boolean) => {
      const p = new URLSearchParams(params);
      if (next) p.set('group', 'item');
      else p.delete('group');
      setParams(p, { replace: true });
    },
  ];
}

/** The three issue cache namespaces (see `makeIssueHooks`) — a relink shows up on
 *  every board at once, so all three are patched and refreshed. */
const LIST_KEYS = ['issues', 'tasks', 'bugs'];
const DETAIL_KEYS = ['issue', 'task', 'bug'];

/**
 * Move an issue onto another backlog item — what dropping a card into a different
 * band means. Optimistic like the status move beside it: both coordinates land
 * the instant the card is released, so one drag doesn't animate in two steps.
 * Passing no `ref` unlinks it (the "No backlog item" band).
 *
 * `after` is the caller's *other* write to the same issue — the status move, when
 * the card crossed a column as well as a band. Every issue endpoint replaces the
 * whole document, so two PATCHes in flight at once means the slower one hands
 * back what the other just changed: fired together, the drop looked like it
 * worked and then quietly reverted. This one waits its turn. Only the network
 * call waits — the optimistic update below still lands on release.
 */
export function useRelinkBacklogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ref,
      after,
    }: {
      id: string;
      ref?: BacklogItemRef;
      after?: Promise<unknown>;
    }) => {
      // Swallowed, not ignored: that mutation reports its own failure, and this
      // is also what keeps a rejection from going unhandled at the call site.
      await after?.catch(() => {});
      return apiPatch(`/issues/${id}`, {
        roadmapId: ref?.roadmapId ?? '',
        roadmapItemId: ref?.id ?? '',
        roadmapItemLabel: ref?.label ?? '',
      });
    },
    onMutate: async ({ id, ref }) => {
      const link = {
        roadmapId: ref?.roadmapId ?? '',
        roadmapItemId: ref?.id ?? '',
        roadmapItemLabel: ref?.label ?? '',
      };
      const snapshots: [readonly unknown[], unknown][] = [];
      for (const key of LIST_KEYS) {
        // Stop in-flight refetches from clobbering the optimistic state.
        await qc.cancelQueries({ queryKey: [key] });
        snapshots.push(...qc.getQueriesData({ queryKey: [key] }));
        qc.setQueriesData<ListResponse<LinkedIssue>>({ queryKey: [key] }, (old) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((it) => (it.id === id ? { ...it, ...link } : it)),
          };
        });
      }
      return { snapshots };
    },
    onError: (err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      // Say why — an unexplained snap-back just reads as a broken board.
      toast.error(t('boards.moveFailed'), { description: (err as Error).message });
    },
    // Resync either way — the server owns updatedAt and any derived fields.
    onSettled: () => {
      [...LIST_KEYS, ...DETAIL_KEYS].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
    },
  });
}
