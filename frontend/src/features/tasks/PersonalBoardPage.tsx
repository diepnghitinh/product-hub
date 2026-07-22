import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Lock, MoreHorizontal } from 'lucide-react';
import { Badge, Button, Dialog, DotLabel, Input, Menu, Select, Spinner } from '@/components/ui';
import { BOARD_GUTTER, IssueBoardLayout } from '@/components/IssueBoardLayout';
import { BoardCard, BoardCardAge, KanbanBoard, KanbanCardToolbar } from '@/components/KanbanBoard';
import { PersonalColumnsDialog } from './components/PersonalColumnsDialog';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import type { TeamStatusConfig } from '@/types/enums';
import type { TaskDto } from '@/types/dto';
import { useCreateTask, useDeleteTask, usePersonalStatuses, useSetTaskStatus, useTasks } from './api';

/**
 * The caller's **private** Personal board — their own tasks, in no team, that
 * only they (and admins) can see. Distinct from "Assigned to me": those are team
 * tasks; these never surface on any team/assigned list. The owner is always
 * taken from the token, so this is always *your* board — and always writable by
 * you, regardless of workspace role. Columns are owned by the user too (there's
 * no Settings page for them): manage them via ⋯ → Manage columns.
 */
export function PersonalBoardPage() {
  const navigate = useNavigate();
  // Per-user columns, shaped like a team's statuses so the shared board renders them.
  const { data: columns = [], isLoading: columnsLoading } = usePersonalStatuses();

  // Board is default and kept out of the URL for clean links; ?view=list persists.
  const [searchParams, setSearchParams] = useSearchParams();
  const view: 'board' | 'list' = searchParams.get('view') === 'list' ? 'list' : 'board';
  const setView = (v: 'board' | 'list') => {
    const next = new URLSearchParams(searchParams);
    if (v === 'board') next.delete('view');
    else next.set('view', v);
    setSearchParams(next, { replace: true });
  };

  const [search, setSearch] = useState('');
  // `personal: true` returns only my own personal tasks (owner from the token).
  const { data, isLoading } = useTasks({ personal: true, search: search || undefined });
  const tasks = data?.items ?? [];

  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();

  const [columnsOpen, setColumnsOpen] = useState(false);
  // The column key to pre-select in the quick-add dialog; null = closed.
  const [quickAdd, setQuickAdd] = useState<string | null>(null);

  function onMove(id: string, toStatus: string) {
    const task = tasks.find((tk) => tk.id === id);
    if (task && task.status !== toStatus) setStatus.mutate({ id, status: toStatus });
  }

  const openAdd = () => setQuickAdd(columns[0]?.key ?? '');
  const loading = columnsLoading || isLoading;

  return (
    <IssueBoardLayout
      titleIcon={<Lock className="size-3.5" aria-hidden />}
      title={t('personal.title')}
      subtitle={t('personal.subtitle')}
      search={{ value: search, onChange: setSearch, placeholder: t('personal.search') }}
      view={{
        value: view,
        onChange: (v) => setView(v as 'board' | 'list'),
        options: [
          { value: 'board', label: t('tasks.viewBoard'), icon: <LayoutGrid /> },
          { value: 'list', label: t('tasks.viewList'), icon: <List /> },
        ],
      }}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="muted" className="hidden gap-1 sm:inline-flex">
            <Lock className="size-3" aria-hidden />
            {t('personal.private')}
          </Badge>
          <Button onClick={openAdd} disabled={!columns.length}>
            + {t('personal.new')}
          </Button>
          <Menu
            align="right"
            triggerClassName="size-8 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            trigger={
              <>
                <MoreHorizontal className="size-4" aria-hidden />
                <span className="sr-only">{t('common.more')}</span>
              </>
            }
            items={[{ label: t('personal.manageColumns'), onClick: () => setColumnsOpen(true) }]}
          />
        </div>
      }
    >
      {loading ? (
        <div className={cn('grid place-items-center rounded-xl border border-dashed p-8', BOARD_GUTTER)}>
          <Spinner />
        </div>
      ) : view === 'board' ? (
        // Render the board even when empty, so the columns and their hover "+ Add"
        // are there to start from — a fresh personal board should feel usable, not blank.
        <KanbanBoard
          columns={columns}
          items={tasks}
          getId={(tk) => tk.id}
          getColumnKey={(tk) => tk.status}
          renderCard={(task, overlay) => <PersonalCard task={task} overlay={overlay} />}
          onMove={onMove}
          onCardClick={(task) => navigate(`/tasks/${task.shortId || task.id}`)}
          renderCardToolbar={(task) => (
            <KanbanCardToolbar
              editLabel={t('common.edit')}
              removeLabel={t('common.delete')}
              onEdit={() => navigate(`/tasks/${task.shortId || task.id}`)}
              onRemove={() => {
                if (confirm(t('tasks.confirmDelete'))) remove.mutate(task.id);
              }}
            />
          )}
          onColumnAdd={(col) => setQuickAdd(col.key)}
          addLabel={t('personal.addToColumn')}
        />
      ) : tasks.length === 0 ? (
        <div className="mx-4 rounded-xl border border-dashed p-8 text-center md:mx-8">
          <p className="text-muted-foreground">{t('personal.none')}</p>
          <Button size="sm" className="mt-3" onClick={openAdd} disabled={!columns.length}>
            {t('personal.new')}
          </Button>
        </div>
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-y-auto pb-6', BOARD_GUTTER)}>
          <PersonalList tasks={tasks} columns={columns} />
        </div>
      )}

      {columnsOpen && (
        <PersonalColumnsDialog
          open
          onClose={() => setColumnsOpen(false)}
          columns={columns}
          tasks={tasks}
        />
      )}
      {quickAdd !== null && (
        <QuickAddDialog
          columns={columns}
          defaultStatus={quickAdd || columns[0]?.key || ''}
          onClose={() => setQuickAdd(null)}
        />
      )}
    </IssueBoardLayout>
  );
}

/** Personal-board card — deliberately lean: no team, assignee or labels apply to
 *  a private task, so it's just the title and its age (the shortId badge is
 *  hidden on cards board-wide). */
function PersonalCard({ task, overlay = false }: { task: TaskDto; overlay?: boolean }) {
  return (
    <BoardCard
      overlay={overlay}
      title={task.title}
      metaTrailing={<BoardCardAge createdAt={task.createdAt} />}
    />
  );
}

/** List view: tasks grouped by column, mirroring the board's order. */
function PersonalList({ tasks, columns }: { tasks: TaskDto[]; columns: TeamStatusConfig[] }) {
  return (
    <div className="flex flex-col gap-6">
      {columns.map((col) => {
        const list = tasks.filter((tk) => tk.status === col.key);
        if (list.length === 0) return null;
        return (
          <section key={col.key}>
            <div className="mb-2 flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: col.color }} aria-hidden />
              <h2 className="text-sm font-medium text-foreground">{col.label}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{list.length}</span>
            </div>
            <div className="rounded-xl border bg-card p-2 text-card-foreground shadow-sm">
              {list.map((task) => (
                <Link
                  key={task.id}
                  to={`/tasks/${task.shortId || task.id}`}
                  className="flex items-center gap-3 rounded-md px-4 py-3 text-foreground transition-colors hover:bg-accent [&:not(:last-child)]:border-b"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                  <BoardCardAge createdAt={task.createdAt} />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Add a private task straight onto the board — title only, no team/assignee/roadmap
 * (none of which apply to a personal task). Lands in the pre-selected column; a
 * short board picks it automatically, longer ones offer a column dropdown.
 */
function QuickAddDialog({
  columns,
  defaultStatus,
  onClose,
}: {
  columns: TeamStatusConfig[];
  defaultStatus: string;
  onClose: () => void;
}) {
  const create = useCreateTask();
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState(defaultStatus || columns[0]?.key || '');

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({ personal: true, title: trimmed, status });
      onClose();
    } catch {
      // The mutation surfaces its own error; keep the dialog open to retry.
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('personal.new')}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={submit} loading={create.isPending} disabled={!title.trim()}>
            {t('personal.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Input
            autoFocus
            value={title}
            placeholder={t('personal.quickAddPlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">{t('personal.quickAddHint')}</p>
        </div>
        {columns.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="personal-quickadd-col">
              {t('personal.addToColumn')}
            </label>
            <Select
              id="personal-quickadd-col"
              value={status}
              onValueChange={setStatus}
              options={columns.map((c) => ({
                value: c.key,
                label: <DotLabel color={c.color}>{c.label}</DotLabel>,
              }))}
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}
