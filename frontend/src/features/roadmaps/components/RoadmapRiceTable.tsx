import { Fragment, useState } from 'react';
import { ChevronDown, Target } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { ROADMAP_ITEM_STATUS_LABEL } from '@/types/enums';
import type { RoadmapColumn, RoadmapEpic, RoadmapItem } from '@/types/dto';
import { epicCountLabel, epicIndex, epicLanes, epicOf } from '../epics';

/**
 * RICE prioritization as a table — every item ranked by RICE score (desc), with
 * its column ("pool") and the four RICE inputs. Rows open the item editor.
 *
 * `groupByEpic` splits it into one ranked block per epic: the same items, ranked
 * *within* each bet rather than against the whole backlog — which is the question
 * you're actually asking once the work is grouped ("what's next in this epic?").
 */
export function RoadmapRiceTable({
  items,
  columns,
  epics = [],
  groupByEpic = false,
  onOpen,
}: {
  items: RoadmapItem[];
  columns: RoadmapColumn[];
  epics?: RoadmapEpic[];
  groupByEpic?: boolean;
  onOpen?: (item: RoadmapItem) => void;
}) {
  // Which groups are folded away. Presentational + per-session, like the board's.
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const sorted = [...items].sort((a, b) => b.rice - a.rice);
  const colFor = (key: string) => columns.find((c) => c.key === key);
  const epicsById = epicIndex(epics);
  const grouped = groupByEpic && epics.length > 0;
  // The same split the board's swimlanes use, so a group holds the same items in
  // both views. Ungrouped, the whole table is one nameless block.
  const groups = grouped
    ? epicLanes(epics, sorted)
    : [{ key: '', label: '', color: '', description: '', items: sorted, rollup: null }];
  // The Epic column is dropped when the group header already names it.
  const colCount = grouped ? 10 : 11;

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        {t('roadmaps.empty')}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-right">#</TableHead>
            <TableHead>{t('roadmaps.itemTitle')}</TableHead>
            {!grouped && <TableHead>{t('roadmaps.epic')}</TableHead>}
            <TableHead>{t('roadmaps.phase')}</TableHead>
            <TableHead>{t('roadmaps.status')}</TableHead>
            <TableHead>{t('roadmaps.okr')}</TableHead>
            <TableHead className="text-right">{t('roadmaps.reach')}</TableHead>
            <TableHead className="text-right">{t('roadmaps.impact')}</TableHead>
            <TableHead className="text-right">{t('roadmaps.confidence')}</TableHead>
            <TableHead className="text-right">{t('roadmaps.effort')}</TableHead>
            <TableHead className="text-right">{t('roadmaps.rice')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => {
            const shut = folded.has(group.key);
            return (
              <Fragment key={group.key || '__all'}>
                {grouped && group.rollup && (
                  // A full-width band rather than an indented row: the group is a
                  // heading over the rows beneath it, not a row of its own data.
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={colCount} className="py-2">
                      <button
                        type="button"
                        onClick={() => toggle(group.key)}
                        aria-expanded={!shut}
                        className="flex w-full min-w-0 items-center gap-2 text-left"
                      >
                        <ChevronDown
                          className={cn(
                            'size-4 shrink-0 text-muted-foreground transition-transform',
                            shut && '-rotate-90',
                          )}
                          aria-hidden
                        />
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: group.color }}
                          aria-hidden
                        />
                        <span className="truncate text-sm font-semibold">{group.label}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {epicCountLabel(group.rollup)}
                        </span>
                        {group.description && (
                          <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block">
                            {group.description}
                          </span>
                        )}
                      </button>
                    </TableCell>
                  </TableRow>
                )}
                {!shut &&
                  group.items.map((item, i) => {
                    const col = colFor(item.phase);
                    const epic = epicOf(item, epicsById);
                    return (
                      <TableRow
                        key={item.id}
                        className={cn(onOpen && 'cursor-pointer')}
                        onClick={() => onOpen?.(item)}
                      >
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium">{item.title}</TableCell>
                        {!grouped && (
                          <TableCell>
                            {epic ? (
                              <span
                                className="inline-flex max-w-[180px] items-center gap-1.5 whitespace-nowrap text-sm"
                                title={epic.label}
                              >
                                <span
                                  className="size-2 shrink-0 rounded-full"
                                  style={{ background: epic.color }}
                                  aria-hidden
                                />
                                <span className="min-w-0 truncate">{epic.label}</span>
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <span
                            className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm"
                            style={{ color: col?.color }}
                          >
                            <span className="size-2 shrink-0 rounded-full bg-current" aria-hidden />
                            {col?.label ?? item.phase}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {ROADMAP_ITEM_STATUS_LABEL[item.status]}
                        </TableCell>
                        <TableCell>
                          {/* Linked OKR — the denormalized leaf label (objective or KR title),
                              same read-only treatment as the item detail page. */}
                          {item.okrLabel ? (
                            <span
                              className="inline-flex max-w-[220px] items-center gap-1.5 text-sm"
                              title={item.okrLabel}
                            >
                              <Target className="size-3.5 shrink-0 text-primary" aria-hidden />
                              <span className="min-w-0 truncate">{item.okrLabel}</span>
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{item.reach}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.impact}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.confidence}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.effort}</TableCell>
                        <TableCell className="text-right font-mono font-semibold tabular-nums">
                          {item.rice}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
