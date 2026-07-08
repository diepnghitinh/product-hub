import { Button, Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { useArchivedProjects, useDeleteProject, useRestoreProject } from '../api';

/** Admin-only list of archived projects with restore / permanent-delete. */
export function ArchivedProjectsPanel() {
  const { data, isLoading } = useArchivedProjects();
  const restore = useRestoreProject();
  const remove = useDeleteProject();

  if (isLoading) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed p-8">
        <Spinner />
      </div>
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {t('projects.noArchived')}
      </div>
    );
  }

  return (
    <div className="divide-y rounded-xl border bg-card text-card-foreground shadow-sm">
      {items.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium">{p.title}</span>
            <span className="text-xs text-muted-foreground">
              {t('projects.updated')} {timeAgo(p.updatedAt)}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={restore.isPending && restore.variables === p.id}
              onClick={() => restore.mutate(p.id)}
            >
              {t('projects.restore')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={remove.isPending && remove.variables === p.id}
              onClick={() => {
                if (confirm(t('projects.confirmDelete'))) remove.mutate(p.id);
              }}
            >
              {t('common.delete')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
