import { Target } from 'lucide-react';
import { Dialog, DotLabel, ProgressBar } from '@/components/ui';
import type { RoadmapColumn, RoadmapItem } from '@/types/dto';
import { ROADMAP_ITEM_STATUS_COLOR, ROADMAP_ITEM_STATUS_LABEL } from '@/types/enums';

/** Read-only roadmap item, opened from a public roadmap board. Roadmap items
 * have no comment thread, so this is just the item's meta + description. */
export function PublicRoadmapItemDialog({
  item,
  columns,
  onClose,
}: {
  item: RoadmapItem;
  columns: RoadmapColumn[];
  onClose: () => void;
}) {
  const col = columns.find((c) => c.key === item.phase);
  return (
    <Dialog open onClose={onClose} title={item.title} fullscreenKey="public-roadmap-item">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {col && <DotLabel color={col.color}>{col.label}</DotLabel>}
        <DotLabel color={ROADMAP_ITEM_STATUS_COLOR[item.status]}>
          {ROADMAP_ITEM_STATUS_LABEL[item.status]}
        </DotLabel>
        <span className="font-mono text-muted-foreground" title="RICE score">
          RICE {item.rice}
        </span>
        {item.okrLabel && (
          // Linked OKR — the denormalized objective / key-result title.
          <span className="inline-flex min-w-0 items-center gap-1.5" title={item.okrLabel}>
            <Target className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{item.okrLabel}</span>
          </span>
        )}
      </div>
      <div className="mt-3">
        <ProgressBar value={item.progress} />
      </div>
      {item.description ? (
        <div
          className="mt-4 text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md"
          dangerouslySetInnerHTML={{ __html: item.description }}
        />
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">—</p>
      )}
      {item.assignees?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {item.assignees.map((a) => (
            <span key={a.id} className="rounded-md border px-2 py-0.5">
              {a.name}
            </span>
          ))}
        </div>
      )}
    </Dialog>
  );
}
