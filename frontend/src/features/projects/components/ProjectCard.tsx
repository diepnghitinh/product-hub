import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Menu, ProgressBar } from '@/components/ui';
import { t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { ENVIRONMENT_LABEL, ProjectEnvironment } from '@/types/enums';
import type { ProjectDto, ProjectStatsDto } from '@/types/dto';
import { EnvironmentBadge } from './EnvironmentBadge';
import { ProjectFormDialog, type ProjectFormValues } from './ProjectFormDialog';
import { useArchiveProject, useUpdateProject } from '../api';

interface ProjectCardProps {
  project: ProjectDto;
  canWrite: boolean;
  canArchive: boolean;
  /** Live report rollups; falls back to the project's own (0) counters. */
  stats?: ProjectStatsDto;
}

export function ProjectCard({ project, canWrite, canArchive, stats }: ProjectCardProps) {
  const rollup = stats ?? {
    reportsTotal: project.reportsTotal,
    reportsDone: project.reportsDone,
    reportsTesting: project.reportsTesting,
    reportsInfo: project.reportsInfo,
    progress: project.progress,
  };
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateProject();
  const archive = useArchiveProject();

  function togglePin() {
    update.mutate({ id: project.id, input: { pinned: !project.pinned } });
  }

  function onArchive() {
    if (!confirm(t('projects.confirmArchive'))) return;
    archive.mutate(project.id);
  }

  function onEditSubmit(values: ProjectFormValues) {
    setError(null);
    update.mutate(
      { id: project.id, input: values },
      {
        onSuccess: () => setEditOpen(false),
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  const items = [];
  if (canWrite) {
    items.push({
      label: project.pinned ? t('projects.unpin') : t('projects.pin'),
      onClick: togglePin,
    });
    items.push({ label: t('projects.edit'), onClick: () => setEditOpen(true) });
    items.push({ label: t('projects.environment'), onClick: () => {}, disabled: true });
    for (const env of [
      ProjectEnvironment.DEVELOPMENT,
      ProjectEnvironment.STAGING,
      ProjectEnvironment.PRODUCTION,
    ]) {
      items.push({
        label: `${project.environment === env ? '✓ ' : '   '}${ENVIRONMENT_LABEL[env]}`,
        onClick: () => update.mutate({ id: project.id, input: { environment: env } }),
      });
    }
  }
  if (canArchive) {
    items.push({ label: t('projects.archive'), onClick: onArchive, danger: true });
  }

  return (
    <>
      <article
        className="flex cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-foreground/20 focus-visible:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => navigate(`/projects/${project.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') navigate(`/projects/${project.id}`);
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {project.pinned && (
              <span className="text-sm text-warning" title={t('projects.unpin')}>
                ★
              </span>
            )}
            <h3 className="truncate text-[15px] font-semibold">{project.title}</h3>
          </div>
          {items.length > 0 && (
            <Menu
              trigger={
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Menu"
                >
                  ⋯
                </span>
              }
              items={items}
            />
          )}
        </div>

        {project.subtitle && (
          <p className="line-clamp-2 text-[13px] text-muted-foreground">{project.subtitle}</p>
        )}

        <div className="flex items-center gap-2 text-xs">
          <EnvironmentBadge env={project.environment} />
          {project.owner && <span className="text-muted-foreground">· {project.owner}</span>}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar value={rollup.progress} />
          </div>
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {rollup.reportsDone}/{rollup.reportsTotal} {t('projects.done')}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <Badge variant="success">
              {rollup.reportsDone} {t('projects.done')}
            </Badge>
            <Badge variant="warning">
              {rollup.reportsTesting} {t('projects.testing')}
            </Badge>
            <Badge variant="muted">
              {rollup.reportsInfo} {t('projects.info')}
            </Badge>
          </div>
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">
            {t('projects.updated')} {timeAgo(project.updatedAt)}
          </span>
        </div>
      </article>

      {editOpen && (
        <ProjectFormDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          project={project}
          submitting={update.isPending}
          error={error}
          onSubmit={onEditSubmit}
        />
      )}
    </>
  );
}
