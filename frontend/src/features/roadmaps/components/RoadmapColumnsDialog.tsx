import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Layers, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  Button,
  ColorSelect,
  Dialog,
  DotLabel,
  Input,
  SegmentedControl,
  Select,
} from '@/components/ui';
import { t } from '@/i18n';
import { ROADMAP_COLUMN_PALETTE } from '@/types/enums';
import type { RoadmapColumn, RoadmapItem } from '@/types/dto';
import { useReplaceRoadmapColumns, useReplaceRoadmapItems, useRoadmapTemplates } from '../api';

interface RoadmapColumnsDialogProps {
  open: boolean;
  onClose: () => void;
  roadmapId: string;
  columns: RoadmapColumn[];
  items: RoadmapItem[];
  /** The template this board is on, '' when its columns are its own. */
  columnTemplateId: string;
}

type Mode = 'template' | 'custom';

/**
 * Manage a roadmap's columns ("pools"). Admin + product only (gated by the
 * caller).
 *
 * Two ways to answer the same question, and a roadmap is always on exactly one:
 *
 * - **A workspace template** — a named set shared by any number of roadmaps.
 *   The link is live, so editing the template in Settings moves every board on
 *   it. That's the point: one place to say how the company plans.
 * - **Custom for this roadmap** — add, rename, recolour, remove, in place.
 *
 * Column `key`s are preserved on edit so existing items keep their column, and
 * an item is never left pointing at a column that isn't on the board: removing
 * a column that still holds items asks where they go first (see
 * {@link MoveItemsPrompt}), and switching to a template that lacks a column
 * says how many items that strands and where they'll land, inline.
 */
export function RoadmapColumnsDialog({
  open,
  onClose,
  roadmapId,
  columns,
  items,
  columnTemplateId,
}: RoadmapColumnsDialogProps) {
  const replace = useReplaceRoadmapColumns();
  const replaceItems = useReplaceRoadmapItems();
  const { data: templates } = useRoadmapTemplates();
  const [mode, setMode] = useState<Mode>(columnTemplateId ? 'template' : 'custom');
  const [templateId, setTemplateId] = useState(columnTemplateId);
  const [draft, setDraft] = useState<RoadmapColumn[]>(columns);
  // A working copy of the items: removing a column reassigns its items here
  // first so none are orphaned, and this is persisted alongside the columns on
  // save. `itemsDirty` tracks whether any reassignment actually happened.
  const [draftItems, setDraftItems] = useState<RoadmapItem[]>(items);
  const [itemsDirty, setItemsDirty] = useState(false);
  // The column awaiting a "move its items where?" answer before it can be removed.
  const [pendingRemoval, setPendingRemoval] = useState<RoadmapColumn | null>(null);
  // Where items stranded by a template switch should land (a key in the chosen
  // template). '' until the picker below is answered.
  const [strandedDest, setStrandedDest] = useState('');

  const update = (i: number, patch: Partial<RoadmapColumn>) =>
    setDraft((d) => d.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const countIn = (key: string) => draftItems.filter((it) => it.phase === key).length;
  const removeColumn = (key: string) => setDraft((d) => d.filter((c) => c.key !== key));

  const chosen = (templates ?? []).find((tpl) => tpl.id === templateId);

  /**
   * Land on the workspace default whenever this side of the switch has nothing
   * picked — a roadmap on custom columns arrives here with no `templateId`, and
   * an unmatched value renders the Select *empty*: no value, and not the
   * placeholder either. An empty picker over a disabled Save reads as broken.
   */
  useEffect(() => {
    if (mode !== 'template' || !templates?.length) return;
    if (templates.some((tpl) => tpl.id === templateId)) return;
    setTemplateId((templates.find((tpl) => tpl.isDefault) ?? templates[0]).id);
  }, [mode, templates, templateId]);

  /** …and the same for where stranded items land: the first column of the set
   *  being adopted, exactly as {@link MoveItemsPrompt} defaults. The amber block
   *  says what will happen; the picker is there to change it, not to unblock
   *  Save. */
  useEffect(() => {
    if (!chosen) return;
    setStrandedDest((cur) =>
      chosen.columns.some((c) => c.key === cur) ? cur : (chosen.columns[0]?.key ?? ''),
    );
  }, [chosen]);

  /**
   * Columns holding items that the chosen template doesn't have. Switching
   * templates is the one move that can strand items without anyone deleting
   * anything — the item keeps a `phase` no column claims and simply stops being
   * on the board — so the switch says so, and names where they'll land.
   */
  const stranded = useMemo(() => {
    if (mode !== 'template' || !chosen) return [];
    const keys = new Set(chosen.columns.map((c) => c.key));
    const seen = new Map<string, number>();
    for (const item of draftItems) {
      if (keys.has(item.phase)) continue;
      seen.set(item.phase, (seen.get(item.phase) ?? 0) + 1);
    }
    return [...seen].map(([key, count]) => ({
      key,
      count,
      label: columns.find((c) => c.key === key)?.label || key,
    }));
  }, [mode, chosen, draftItems, columns]);

  const strandedCount = stranded.reduce((sum, s) => sum + s.count, 0);

  /** Column order, left to right. The board can be dragged instead, but that's
   *  pointer-only — this is the keyboard path, and it matches the arrows the
   *  team-statuses editor in Settings has always had. */
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= draft.length) return;
    setDraft((d) => {
      const copy = [...d];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

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

  /** Going custom starts from whatever is on screen, so the board doesn't jump
   *  the moment the mode changes — an unlinked template is a copy, not a reset. */
  function pickMode(next: Mode) {
    if (next === 'custom' && mode === 'template' && chosen) setDraft(chosen.columns);
    setMode(next);
  }

  async function save() {
    if (mode === 'template') {
      if (!chosen) return;
      // Land the stranded items on a column the template *has*, before the
      // link changes — the same order the custom path uses, for the same
      // reason: a mid-save failure must never leave items pointing at nothing.
      const dest = strandedDest;
      const moved = strandedCount
        ? draftItems.map((it) =>
            chosen.columns.some((c) => c.key === it.phase) ? it : { ...it, phase: dest },
          )
        : draftItems;
      try {
        if (strandedCount || itemsDirty) {
          await replaceItems.mutateAsync({ id: roadmapId, items: moved });
        }
        await replace.mutateAsync({
          id: roadmapId,
          columns: chosen.columns,
          templateId: chosen.id,
        });
        onClose();
      } catch {
        // Both mutations surface their own errors; keep the dialog open to retry.
      }
      return;
    }

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
  const blocked =
    mode === 'template'
      ? !chosen || (strandedCount > 0 && !strandedDest)
      : draft.every((c) => !c.label.trim());

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
            <Button type="button" onClick={save} loading={saving} disabled={blocked}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {/* The choice itself. Full width on a phone so both segments stay tappable. */}
        <SegmentedControl
          value={mode}
          onChange={pickMode}
          size="sm"
          className="w-full [&>button]:flex-1 sm:w-auto"
          aria-label={t('roadmaps.columnsSource')}
          options={[
            {
              value: 'template',
              label: t('roadmaps.useTemplate'),
              icon: <Layers className="size-3.5" />,
            },
            {
              value: 'custom',
              label: t('roadmaps.customColumns'),
              icon: <SlidersHorizontal className="size-3.5" />,
            },
          ]}
        />

        {mode === 'template' ? (
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="roadmap-template">
                {t('roadmaps.template')}
              </label>
              <Select
                id="roadmap-template"
                value={templateId}
                onValueChange={setTemplateId}
                aria-label={t('roadmaps.template')}
                placeholder={t('roadmaps.pickTemplate')}
                options={(templates ?? []).map((tpl) => ({
                  value: tpl.id,
                  label: tpl.name,
                }))}
              />
            </div>

            {chosen && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border bg-muted/30 p-3">
                {chosen.columns.map((c) => (
                  <DotLabel key={c.key} color={c.color}>
                    <span className="text-sm">{c.label}</span>
                  </DotLabel>
                ))}
              </div>
            )}

            {stranded.length > 0 && chosen && (
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="text-sm text-foreground">
                  {t(
                    strandedCount === 1
                      ? 'roadmaps.templateStrandedOne'
                      : 'roadmaps.templateStranded',
                  )
                    .replace('{count}', String(strandedCount))
                    .replace('{columns}', stranded.map((s) => s.label).join(', '))}
                </p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="roadmap-stranded-dest">
                    {t('roadmaps.moveItemsTo')}
                  </label>
                  <Select
                    id="roadmap-stranded-dest"
                    value={strandedDest}
                    onValueChange={setStrandedDest}
                    aria-label={t('roadmaps.moveItemsTo')}
                    placeholder={t('roadmaps.pickColumn')}
                    options={chosen.columns.map((c) => ({
                      value: c.key,
                      label: <DotLabel color={c.color}>{c.label}</DotLabel>,
                    }))}
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{t('roadmaps.templateHint')}</p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-2">
              {draft.map((col, i) => (
                <div key={col.key} className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                      aria-label={t('settings.moveUp')}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                      aria-label={t('settings.moveDown')}
                      disabled={i === draft.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </div>
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
          </>
        )}
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
