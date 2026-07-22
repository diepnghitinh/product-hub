import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button, Dialog, DotLabel, Input, Select } from '@/components/ui';
import { t } from '@/i18n';
import type { TeamStatusConfig } from '@/types/enums';
import type { TaskDto } from '@/types/dto';
import { useReplacePersonalStatuses, useSetTaskStatus } from '../api';

interface PersonalColumnsDialogProps {
  open: boolean;
  onClose: () => void;
  columns: TeamStatusConfig[];
  /** The personal tasks currently on the board — used to reassign a removed
   *  column's tasks before it's dropped, so none are orphaned. */
  tasks: TaskDto[];
}

/**
 * Manage the Personal board's columns — reorder, rename, recolour, add, remove.
 * Unlike team statuses there are no protected built-ins: the user owns every
 * column. Removing a column that still holds tasks asks where they should go
 * first (see {@link MoveTasksPrompt}), then moves them onto a surviving column
 * *before* the column is dropped, so a task is never left in a column that's
 * gone. Colours are raw hex to match the task-status convention.
 */
export function PersonalColumnsDialog({ open, onClose, columns, tasks }: PersonalColumnsDialogProps) {
  const replace = useReplacePersonalStatuses();
  const setStatus = useSetTaskStatus();
  const [draft, setDraft] = useState<TeamStatusConfig[]>(columns);
  // Working copy of task→column, so a removal reassigns here first and the moves
  // are applied on save. Keyed by task id.
  const [assigned, setAssigned] = useState<Record<string, string>>(() =>
    Object.fromEntries(tasks.map((tk) => [tk.id, tk.status])),
  );
  const [pendingRemoval, setPendingRemoval] = useState<TeamStatusConfig | null>(null);

  const update = (i: number, patch: Partial<TeamStatusConfig>) =>
    setDraft((d) => d.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const countIn = (key: string) => Object.values(assigned).filter((s) => s === key).length;
  const removeColumn = (key: string) => setDraft((d) => d.filter((c) => c.key !== key));

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= draft.length) return;
    setDraft((d) => {
      const copy = [...d];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  /** Trash a column — but if it still holds tasks, ask where they go first. */
  function requestRemove(col: TeamStatusConfig) {
    if (countIn(col.key) > 0) setPendingRemoval(col);
    else removeColumn(col.key);
  }

  /** Reassign the pending column's tasks onto `destKey`, then drop the column. */
  function confirmRemove(destKey: string) {
    const from = pendingRemoval!.key;
    setAssigned((map) => {
      const next = { ...map };
      for (const id of Object.keys(next)) if (next[id] === from) next[id] = destKey;
      return next;
    });
    removeColumn(from);
    setPendingRemoval(null);
  }

  function add() {
    const taken = new Set(draft.map((c) => c.key));
    let n = draft.length + 1;
    while (taken.has(`custom-${n}`)) n += 1;
    setDraft((d) => [...d, { key: `custom-${n}`, label: t('personal.newColumn'), color: '#a855f7' }]);
  }

  async function save() {
    const cleaned = draft.map((c) => ({ ...c, label: c.label.trim() })).filter((c) => c.label);
    if (cleaned.length === 0) return;
    try {
      // Move tasks first — land them on a column that still exists, *then*
      // replace the column list, so a mid-save failure never orphans a task.
      const moves = tasks
        .filter((tk) => assigned[tk.id] && assigned[tk.id] !== tk.status)
        .map((tk) => ({ id: tk.id, status: assigned[tk.id] }));
      for (const m of moves) await setStatus.mutateAsync(m);
      await replace.mutateAsync(cleaned);
      onClose();
    } catch {
      // Each mutation surfaces its own error; keep the dialog open to retry.
    }
  }

  const saving = replace.isPending || setStatus.isPending;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={t('personal.manageColumns')}
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
        <div className="divide-y rounded-xl border">
          {draft.map((col, i) => (
            <div key={col.key} className="flex flex-wrap items-center gap-3 p-3 sm:px-4">
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
              <input
                type="color"
                className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                value={col.color}
                aria-label={t('personal.columnColor')}
                onChange={(e) => update(i, { color: e.target.value })}
              />
              <Input
                className="min-w-0 flex-1 sm:max-w-xs"
                value={col.label}
                placeholder={t('personal.columnName')}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-8 shrink-0 text-muted-foreground hover:text-destructive"
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
          {t('personal.addColumn')}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">{t('personal.columnsHint')}</p>
      </Dialog>

      {pendingRemoval && (
        <MoveTasksPrompt
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

/** Asks where a to-be-removed column's tasks land before it's dropped. */
function MoveTasksPrompt({
  column,
  count,
  destinations,
  onCancel,
  onConfirm,
}: {
  column: TeamStatusConfig;
  count: number;
  destinations: TeamStatusConfig[];
  onCancel: () => void;
  onConfirm: (destKey: string) => void;
}) {
  const [dest, setDest] = useState(destinations[0]?.key ?? '');
  const label = (c: TeamStatusConfig) => c.label.trim() || t('personal.newColumn');

  return (
    <Dialog
      open
      onClose={onCancel}
      title={t('personal.moveTasksTitle')}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => onConfirm(dest)} disabled={!dest}>
            {t('personal.moveAndRemove')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">“{label(column)}”</span>{' '}
        {t('personal.moveTasksStillHas')} {count}{' '}
        {count === 1 ? t('personal.taskSingular') : t('personal.tasks')}.{' '}
        {t('personal.moveTasksTrail')}
      </p>
      <div className="mt-4 space-y-1.5">
        <label className="text-sm font-medium" htmlFor="personal-move-dest">
          {t('personal.moveTasksTo')}
        </label>
        <Select
          id="personal-move-dest"
          value={dest}
          onValueChange={setDest}
          aria-label={t('personal.moveTasksTo')}
          options={destinations.map((c) => ({
            value: c.key,
            label: <DotLabel color={c.color}>{label(c)}</DotLabel>,
          }))}
        />
      </div>
    </Dialog>
  );
}
