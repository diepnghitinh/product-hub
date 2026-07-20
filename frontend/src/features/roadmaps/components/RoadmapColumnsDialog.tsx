import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, ColorSelect, Dialog, DotLabel, Input, Select } from '@/components/ui';
import { t } from '@/i18n';
import { ROADMAP_COLUMN_PALETTE } from '@/types/enums';
import type { RoadmapColumn, RoadmapItem } from '@/types/dto';
import { useReplaceRoadmapColumns, useReplaceRoadmapItems } from '../api';

interface RoadmapColumnsDialogProps {
  open: boolean;
  onClose: () => void;
  roadmapId: string;
  columns: RoadmapColumn[];
  items: RoadmapItem[];
}

/**
 * Manage a roadmap's columns ("pools") — add, rename, recolour, remove. Admin +
 * product only (gated by the caller). Column `key`s are preserved on edit so
 * existing items keep their column. Removing a column that still holds items
 * asks where those items should go first (see {@link MoveItemsPrompt}), so a
 * delete never silently dumps them into the first column.
 */
export function RoadmapColumnsDialog({
  open,
  onClose,
  roadmapId,
  columns,
  items,
}: RoadmapColumnsDialogProps) {
  const replace = useReplaceRoadmapColumns();
  const replaceItems = useReplaceRoadmapItems();
  const [draft, setDraft] = useState<RoadmapColumn[]>(columns);
  // A working copy of the items: removing a column reassigns its items here
  // first so none are orphaned, and this is persisted alongside the columns on
  // save. `itemsDirty` tracks whether any reassignment actually happened.
  const [draftItems, setDraftItems] = useState<RoadmapItem[]>(items);
  const [itemsDirty, setItemsDirty] = useState(false);
  // The column awaiting a "move its items where?" answer before it can be removed.
  const [pendingRemoval, setPendingRemoval] = useState<RoadmapColumn | null>(null);

  const update = (i: number, patch: Partial<RoadmapColumn>) =>
    setDraft((d) => d.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const countIn = (key: string) => draftItems.filter((it) => it.phase === key).length;
  const removeColumn = (key: string) => setDraft((d) => d.filter((c) => c.key !== key));

  /** Trash a column — but if it still holds items, ask where they go first so
   * they aren't silently swept into another column. */
  function requestRemove(col: RoadmapColumn) {
    if (countIn(col.key) > 0) setPendingRemoval(col);
    else removeColumn(col.key);
  }

  /** Reassign the pending column's items onto `destKey`, then drop the column. */
  function confirmRemove(destKey: string) {
    const from = pendingRemoval!.key;
    setDraftItems((list) => list.map((it) => (it.phase === from ? { ...it, phase: destKey } : it)));
    setItemsDirty(true);
    removeColumn(from);
    setPendingRemoval(null);
  }

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

  async function save() {
    const cleaned = draft.map((c) => ({ ...c, label: c.label.trim() })).filter((c) => c.label);
    if (cleaned.length === 0) return;
    try {
      // Items first: land them on a column that still exists, *then* drop the old
      // one — so a mid-save failure never leaves items pointing at nothing.
      if (itemsDirty) await replaceItems.mutateAsync({ id: roadmapId, items: draftItems });
      await replace.mutateAsync({ id: roadmapId, columns: cleaned });
      onClose();
    } catch {
      // Both mutations surface their own errors; keep the dialog open to retry.
    }
  }

  const saving = replace.isPending || replaceItems.isPending;

  return (
    <>
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
              loading={saving}
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
                onClick={() => requestRemove(col)}
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

      {pendingRemoval && (
        <MoveItemsPrompt
          column={pendingRemoval}
          count={countIn(pendingRemoval.key)}
          destinations={draft.filter((c) => c.key !== pendingRemoval.key)}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={confirmRemove}
        />
      )}
    </>
  );
}

/**
 * Asks where a to-be-removed column's items should land before it's dropped.
 * Its own dialog (stacked over Manage columns) so the destination select gets a
 * fresh choice each time; nothing is persisted until the outer dialog saves.
 */
function MoveItemsPrompt({
  column,
  count,
  destinations,
  onCancel,
  onConfirm,
}: {
  column: RoadmapColumn;
  count: number;
  destinations: RoadmapColumn[];
  onCancel: () => void;
  onConfirm: (destKey: string) => void;
}) {
  const [dest, setDest] = useState(destinations[0]?.key ?? '');
  const label = (c: RoadmapColumn) => c.label.trim() || t('roadmaps.newColumn');

  return (
    <Dialog
      open
      onClose={onCancel}
      title={t('roadmaps.moveItemsTitle')}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => onConfirm(dest)} disabled={!dest}>
            {t('roadmaps.moveAndRemove')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">“{label(column)}”</span>{' '}
        {t('roadmaps.moveItemsStillHas')} {count}{' '}
        {count === 1 ? t('roadmaps.itemSingular') : t('roadmaps.items')}.{' '}
        {t('roadmaps.moveItemsTrail')}
      </p>
      <div className="mt-4 space-y-1.5">
        <label className="text-sm font-medium" htmlFor="roadmap-move-dest">
          {t('roadmaps.moveItemsTo')}
        </label>
        <Select
          id="roadmap-move-dest"
          value={dest}
          onValueChange={setDest}
          aria-label={t('roadmaps.moveItemsTo')}
          options={destinations.map((c) => ({
            value: c.key,
            label: <DotLabel color={c.color}>{label(c)}</DotLabel>,
          }))}
        />
      </div>
    </Dialog>
  );
}
