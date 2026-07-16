import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { t } from '@/i18n';import { ProjectCard } from '@/features/projects/components/ProjectCard';
import {
  ProjectFormDialog,
  type ProjectFormValues,
} from '@/features/projects/components/ProjectFormDialog';
import { ArchivedProjectsPanel } from '@/features/projects/components/ArchivedProjectsPanel';
import { useCreateProject, useProjects } from '@/features/projects/api';
import { useProjectStats } from '@/features/reports/api';

const CARD_GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]';

export function ProjectsPage() {
  const { user, canManageDelivery: isAdmin, canWrite } = useAuth();

  const { data, isLoading, isError, refetch } = useProjects({ limit: 100 });
  const create = useCreateProject();
  const projects = data?.items ?? [];
  const { data: statsList } = useProjectStats(projects.map((p) => p.id));
  const statsById = new Map((statsList ?? []).map((s) => [s.projectId, s]));

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  function onCreate(values: ProjectFormValues) {
    setCreateError(null);
    create.mutate(values, {
      onSuccess: () => setCreateOpen(false),
      onError: (e) => setCreateError((e as Error).message),
    });
  }

  return (
    <div>
      <PageHeader
        title={t('nav.projects')}
        subtitle={t('dashboard.subtitle')}
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>+ {t('projects.new')}</Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="grid place-items-center rounded-xl border border-dashed p-8">
          <Spinner />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('common.error')}{' '}
          <button
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => refetch()}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {canWrite ? t('projects.empty') : t('projects.emptyGuest')}
        </div>
      ) : (
        <div className={CARD_GRID}>
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              canWrite={canWrite}
              canArchive={isAdmin}
              stats={statsById.get(p.id)}
            />
          ))}
        </div>
      )}

      {isAdmin && (
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('projects.archived')}
            </h2>
            <button
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? t('projects.hideArchived') : t('projects.showArchived')}
            </button>
          </div>
          {showArchived && <ArchivedProjectsPanel />}
        </section>
      )}

      {createOpen && (
        <ProjectFormDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          submitting={create.isPending}
          error={createError}
          onSubmit={onCreate}
        />
      )}
    </div>
  );
}
