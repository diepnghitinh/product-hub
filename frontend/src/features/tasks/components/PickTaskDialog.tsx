import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button, Dialog, Input, Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { TASK_STATUS_COLOR, TASK_STATUS_LABEL } from '@/types/enums';
import { useTasks, useUpdateTask } from '../api';

interface PickTaskDialogProps {
  open: boolean;
  onClose: () => void;
  /** The backlog item (roadmap item) the picked task gets linked to. */
  roadmapId: string;
  projectId: string;
  itemId: string;
  /** Denormalized label stored on the task, e.g. "Now · Passkey login". */
  itemLabel: string;
}

/**
 * Pick an existing task and link it to a backlog item. Search runs server-side
 * across task name and task id, so a pasted id resolves straight to its task.
 */
export function PickTaskDialog({
  open,
  onClose,
  roadmapId,
  projectId,
  itemId,
  itemLabel,
}: PickTaskDialogProps) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  const { data, isLoading } = useTasks(search ? { search } : undefined);
  const link = useUpdateTask();

  // Tasks already sitting on this item aren't pickable.
  const tasks = useMemo(
    () => (data?.items ?? []).filter((tk) => tk.roadmapItemId !== itemId),
    [data, itemId],
  );

  function pick(id: string) {
    if (link.isPending) return;
    link.mutate(
      { id, input: { roadmapId, roadmapItemId: itemId, roadmapItemLabel: itemLabel, projectId } },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('tasks.pickTitle')}
      className="max-w-xl"
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('tasks.pickSearch')}
            aria-label={t('tasks.pickSearch')}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-[50vh] min-h-32 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search ? t('tasks.pickEmpty') : t('tasks.pickNone')}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {tasks.map((tk) => (
                <li key={tk.id}>
                  <button
                    type="button"
                    onClick={() => pick(tk.id)}
                    disabled={link.isPending}
                    className="flex w-full items-center gap-2.5 rounded-md border border-border bg-background px-2.5 py-2 text-left transition-colors hover:border-primary hover:bg-accent disabled:opacity-50"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: TASK_STATUS_COLOR[tk.status] }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{tk.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {tk.roadmapItemLabel
                          ? t('tasks.pickLinkedTo').replace('{item}', tk.roadmapItemLabel)
                          : t('tasks.pickUnlinked')}
                      </span>
                    </span>
                    <span
                      className="shrink-0 font-mono text-[11px] text-muted-foreground"
                      title={tk.id}
                    >
                      {tk.id.slice(0, 8)}
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      {TASK_STATUS_LABEL[tk.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {link.isError ? (
          <p className="text-xs text-destructive">{link.error.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('tasks.pickMoveHint')}</p>
        )}
      </div>
    </Dialog>
  );
}
