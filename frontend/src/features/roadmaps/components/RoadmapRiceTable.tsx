import { Target } from 'lucide-react';
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
import type { RoadmapColumn, RoadmapItem } from '@/types/dto';

/**
 * RICE prioritization as a table — every item ranked by RICE score (desc), with
 * its column ("pool") and the four RICE inputs. Rows open the item editor.
 */
export function RoadmapRiceTable({
  items,
  columns,
  onOpen,
}: {
  items: RoadmapItem[];
  columns: RoadmapColumn[];
  onOpen?: (item: RoadmapItem) => void;
}) {
  const sorted = [...items].sort((a, b) => b.rice - a.rice);
  const colFor = (key: string) => columns.find((c) => c.key === key);

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
          {sorted.map((item, i) => {
            const col = colFor(item.phase);
            return (
              <TableRow
                key={item.id}
                className={cn(onOpen && 'cursor-pointer')}
                onClick={() => onOpen?.(item)}
              >
                <TableCell className="text-right tabular-nums text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{item.title}</TableCell>
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
        </TableBody>
      </Table>
    </div>
  );
}
