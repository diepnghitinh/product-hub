import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, ColorSelect, Dialog, Input } from '@/components/ui';
import { t } from '@/i18n';
import { ROADMAP_COLUMN_PALETTE } from '@/types/enums';
import type { RoadmapColumn } from '@/types/dto';
import { useReplaceRoadmapColumns } from '../api';

interface RoadmapColumnsDialogProps {
  open: boolean;
  onClose: () => void;
  roadmapId: string;
  columns: RoadmapColumn[];
}

/**
 * Manage a roadmap's columns ("pools") — add, rename, recolour, remove. Admin +
 * product only (gated by the caller). Column `key`s are preserved on edit so
 * existing items keep their column; a removed column's items fall into the first
 * column on the board.
 */
export function RoadmapColumnsDialog({
  open,
  onClose,
  roadmapId,
  columns,
}: RoadmapColumnsDialogProps) {
  const replace = useReplaceRoadmapColumns();
  const [draft, setDraft] = useState<RoadmapColumn[]>(columns);

  const update = (i: number, patch: Partial<RoadmapColumn>) =>
    setDraft((d) => d.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => setDraft((d) => d.filter((_, idx) => idx !== i));

  function add() {
    const used = new Set(draft.map((c) => c.color));
    const color =
      ROADMAP_COLUMN_PALETTE.find((p) => !used.has(p.value))?.value ??
      ROADMAP_COLUMN_PALETTE[0].value;
    setDraft((d) => [
      ...d,
      { key: `col-${crypto.randomUUID().slice(0, 8)}`, label: t('roadmaps.newColumn'), color },
    ]);
  }

  function save() {
    const cleaned = draft.map((c) => ({ ...c, label: c.label.trim() })).filter((c) => c.label);
    if (cleaned.length === 0) return;
    replace.mutate({ id: roadmapId, columns: cleaned }, { onSuccess: onClose });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('roadmaps.manageColumns')}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={save}
            loading={replace.isPending}
            disabled={draft.every((c) => !c.label.trim())}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {draft.map((col, i) => (
          <div key={col.key} className="flex items-center gap-2">
            <div className="w-28 shrink-0">
              <ColorSelect
                value={col.color}
                options={ROADMAP_COLUMN_PALETTE}
                onChange={(color) => update(i, { color })}
                ariaLabel={t('roadmaps.columnColor')}
              />
            </div>
            <Input
              value={col.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder={t('roadmaps.columnName')}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(i)}
              disabled={draft.length <= 1}
              aria-label={t('common.delete')}
              type="button"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="mt-3 gap-1.5" onClick={add} type="button">
        <Plus className="size-4" />
        {t('roadmaps.addColumn')}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">{t('roadmaps.columnsHint')}</p>
    </Dialog>
  );
}
