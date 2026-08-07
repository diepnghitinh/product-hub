import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, ColorSelect, Dialog, DotLabel, Input, Select } from '@/components/ui';
import { t } from '@/i18n';
import { ROADMAP_COLUMN_PALETTE } from '@/types/enums';
import type { RoadmapEpic, RoadmapItem } from '@/types/dto';
import { useReplaceRoadmapEpics, useReplaceRoadmapItems } from '../api';
import { UNGROUPED, newEpic } from '../epics';

interface RoadmapEpicsDialogProps {
  open: boolean;
  onClose: () => void;
  roadmapId: string;
  epics: RoadmapEpic[];
  items: RoadmapItem[];
}

/**
 * Manage a roadmap's epics — add, rename, recolour, describe, remove. Admin +
 * product only (gated by the caller), the same gate as Manage columns: how the
 * board is organised is a product decision.
 *
 * Epic `id`s are preserved on edit, so renaming or recolouring never detaches an
 * item. Removing an epic that still holds items asks where they go first — the
 * same courtesy Manage columns extends — except an epic has a legitimate "None"
 * answer that a column doesn't, so ungrouping is offered as a destination.
 */
export function RoadmapEpicsDialog({
  open,
  onClose,
  roadmapId,
  epics,
  items,
}: RoadmapEpicsDialogProps) {
  const replace = useReplaceRoadmapEpics();
  const replaceItems = useReplaceRoadmapItems();
  const [draft, setDraft] = useState<RoadmapEpic[]>(epics);
  // A working copy of the items: removing an epic reassigns its items here
  // first, and this is persisted alongside the epics on save.
  const [draftItems, setDraftItems] = useState<RoadmapItem[]>(items);
  const [itemsDirty, setItemsDirty] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<RoadmapEpic | null>(null);

  const update = (i: number, patch: Partial<RoadmapEpic>) =>
    setDraft((d) => d.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  const countIn = (id: string) => draftItems.filter((it) => it.epicId === id).length;
  const removeEpic = (id: string) => setDraft((d) => d.filter((e) => e.id !== id));

  function requestRemove(epic: RoadmapEpic) {
    if (countIn(epic.id) > 0) setPendingRemoval(epic);
    else removeEpic(epic.id);
  }

  /** Reassign the pending epic's items onto `destId` ('' = ungroup), then drop it. */
  function confirmRemove(destId: string) {
    const from = pendingRemoval!.id;
    setDraftItems((list) =>
      list.map((it) => (it.epicId === from ? { ...it, epicId: destId } : it)),
    );
    setItemsDirty(true);
    removeEpic(from);
    setPendingRemoval(null);
  }

  const add = () => setDraft((d) => [...d, { ...newEpic(d), label: t('roadmaps.newEpic') }]);

  async function save() {
    const cleaned = draft
      .map((e) => ({ ...e, label: e.label.trim(), description: e.description.trim() }))
      .filter((e) => e.label);
    try {
      // Items first: land them on an epic that still exists, *then* drop the old
      // one — so a mid-save failure never leaves items pointing at nothing.
      // (The server clears orphaned pointers anyway; this keeps the intended
      // destination rather than falling back to ungrouped.)
      if (itemsDirty) await replaceItems.mutateAsync({ id: roadmapId, items: draftItems });
      await replace.mutateAsync({ id: roadmapId, epics: cleaned });
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
        title={t('roadmaps.manageEpics')}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={save} loading={saving}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {draft.map((epic, i) => (
            // Name and colour on one row, the one-liner under it — the same
            // shape the lane header renders, so the dialog previews the result.
            <div key={epic.id} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="flex items-center gap-2">
                <div className="w-28 shrink-0">
                  <ColorSelect
                    value={epic.color}
                    options={ROADMAP_COLUMN_PALETTE}
                    onChange={(color) => update(i, { color })}
                    ariaLabel={t('roadmaps.epicColor')}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive sm:hidden"
                  onClick={() => requestRemove(epic)}
                  aria-label={t('common.delete')}
                  type="button"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Input
                  value={epic.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder={t('roadmaps.epicName')}
                />
                <Input
                  value={epic.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  placeholder={t('roadmaps.epicDescription')}
                  className="text-xs"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="hidden size-8 shrink-0 text-muted-foreground hover:text-destructive sm:grid"
                onClick={() => requestRemove(epic)}
                aria-label={t('common.delete')}
                type="button"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {draft.length === 0 && (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              {t('roadmaps.epicsEmpty')}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" className="mt-3 gap-1.5" onClick={add} type="button">
          <Plus className="size-4" />
          {t('roadmaps.addEpic')}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">{t('roadmaps.epicsHint')}</p>
      </Dialog>

      {pendingRemoval && (
        <MoveEpicItemsPrompt
          epic={pendingRemoval}
          count={countIn(pendingRemoval.id)}
          destinations={draft.filter((e) => e.id !== pendingRemoval.id)}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={confirmRemove}
        />
      )}
    </>
  );
}

/**
 * Asks where a to-be-removed epic's items should land. Unlike a column, "nowhere"
 * is a real answer — an item with no epic is an ordinary item — so ungrouping
 * leads the list and is the default when there's no other epic to move to.
 */
function MoveEpicItemsPrompt({
  epic,
  count,
  destinations,
  onCancel,
  onConfirm,
}: {
  epic: RoadmapEpic;
  count: number;
  destinations: RoadmapEpic[];
  onCancel: () => void;
  onConfirm: (destId: string) => void;
}) {
  const [dest, setDest] = useState(UNGROUPED);
  const label = (e: RoadmapEpic) => e.label.trim() || t('roadmaps.newEpic');

  return (
    <Dialog
      open
      onClose={onCancel}
      title={t('roadmaps.moveEpicItemsTitle')}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => onConfirm(dest)}>
            {t('roadmaps.moveAndRemove')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">“{label(epic)}”</span>{' '}
        {t('roadmaps.moveItemsStillHas')} {count}{' '}
        {count === 1 ? t('roadmaps.itemSingular') : t('roadmaps.items')}.{' '}
        {t('roadmaps.moveEpicItemsTrail')}
      </p>
      <div className="mt-4 space-y-1.5">
        <label className="text-sm font-medium" htmlFor="roadmap-move-epic-dest">
          {t('roadmaps.moveEpicItemsTo')}
        </label>
        <Select
          id="roadmap-move-epic-dest"
          value={dest}
          onValueChange={setDest}
          aria-label={t('roadmaps.moveEpicItemsTo')}
          options={[
            { value: UNGROUPED, label: t('roadmaps.leaveUngrouped') },
            ...destinations.map((e) => ({
              value: e.id,
              label: <DotLabel color={e.color}>{label(e)}</DotLabel>,
            })),
          ]}
        />
      </div>
    </Dialog>
  );
}
