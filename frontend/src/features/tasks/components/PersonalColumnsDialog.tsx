import { useState } from 'react';
import { Button, Dialog, DotLabel, Select } from '@/components/ui';
import { normalizeStatusRows, StatusColumnsList } from '@/components/StatusColumnsList';
import { t } from '@/i18n';
import {
  BUILTIN_TASK_STATUS_CATEGORY,
  IssueStatusCategory,
  resolveStatusCategories,
  type TeamStatusConfig,
} from '@/types/enums';
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
 * Manage the Personal board's columns — group, reorder, rename, recolour,
 * describe, add, remove. Unlike team statuses there are no protected built-ins:
 * the user owns every column. Removing one that still holds tasks asks where
 * they should go first (see {@link MoveTasksPrompt}), then moves them onto a
 * surviving column *before* the column is dropped, so a task is never left in a
 * column that's gone.
 *
 * The list itself is the same {@link StatusColumnsList} the team settings screen
 * uses, so a private board and a team board are configured the same way — and a
 * personal "Done" column means done for the same reason theirs does.
 */
export function PersonalColumnsDialog({ open, onClose, columns, tasks }: PersonalColumnsDialogProps) {
  const replace = useReplacePersonalStatuses();
  const setStatus = useSetTaskStatus();
  // A personal board predates categories too, so its columns are read through
  // the task defaults exactly as a team's are.
  const [draft, setDraft] = useState<TeamStatusConfig[]>(() =>
    normalizeStatusRows(resolveStatusCategories(columns, BUILTIN_TASK_STATUS_CATEGORY)),
  );
  // Working copy of task→column, so a removal reassigns here first and the moves
  // are applied on save. Keyed by task id.
  const [assigned, setAssigned] = useState<Record<string, string>>(() =>
    Object.fromEntries(tasks.map((tk) => [tk.id, tk.status])),
  );
  const [pendingRemoval, setPendingRemoval] = useState<TeamStatusConfig | null>(null);

  const countIn = (key: string) => Object.values(assigned).filter((s) => s === key).length;
  const removeColumn = (key: string) => setDraft((d) => d.filter((c) => c.key !== key));
  // The list shows "N tasks" per column from this draft, not from the server:
  // a pending reassignment has to be visible before it's saved.
  const counts = Object.fromEntries(draft.map((c) => [c.key, countIn(c.key)]));
  const missingCompleted = !draft.some((c) => c.category === IssueStatusCategory.COMPLETED);

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

  async function save() {
    const cleaned = normalizeStatusRows(draft)
      .map((c) => ({ ...c, label: c.label.trim() }))
      .filter((c) => c.label);
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
              disabled={missingCompleted || draft.every((c) => !c.label.trim())}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <StatusColumnsList
          rows={draft}
          onChange={setDraft}
          counts={counts}
          onRemoveColumn={requestRemove}
          compact
        />
        {missingCompleted && (
          <p className="mt-3 text-xs text-destructive">{t('settings.needCompletedColumn')}</p>
        )}
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
