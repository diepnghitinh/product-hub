import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Input, Menu, ProgressBar } from '@/components/ui';
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
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(project.title);
  const renameRef = useRef<HTMLInputElement>(null);
  const update = useUpdateProject();
  const archive = useArchiveProject();

  // The dropdown hands focus back to its trigger as it closes, so claim it a
  // frame later or the input opens without focus.
  useEffect(() => {
    if (!renaming) return;
    const frame = requestAnimationFrame(() => {
      renameRef.current?.focus();
      renameRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [renaming]);

  function beginRename() {
    setDraft(project.title);
    setRenaming(true);
  }

  function commitRename() {
    const title = draft.trim();
    setRenaming(false);
    // Blank or unchanged is a no-op, not a way to wipe the title.
    if (!title || title === project.title) return;
    update.mutate(
      { id: project.id, input: { title } },
      // Put the field back with what they typed rather than losing it.
      { onError: () => setRenaming(true) },
    );
  }

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
    items.push({ label: t('projects.rename'), onClick: beginRename, closeOnSelect: true });
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
        onClick={() => navigate(`/testing/${project.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') navigate(`/testing/${project.id}`);
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {project.pinned && (
              <span className="shrink-0 text-sm text-warning" title={t('projects.unpin')}>
                ★
              </span>
            )}
            {renaming ? (
              // Sits inside a card that navigates on click and on Enter — so
              // every event this input handles has to stop there.
              <Input
                ref={renameRef}
                value={draft}
                aria-label={t('projects.rename')}
                // Matches the API's cap, so a long name is stopped here rather
                // than coming back as a 400 the card has no way to show.
                maxLength={160}
                className="h-7 min-w-0 flex-1 px-2 text-[15px] font-semibold"
                onChange={(e) => setDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    // Resetting the draft first means a stray blur-on-unmount
                    // sees an unchanged title and no-ops, so Escape can't save.
                    setDraft(project.title);
                    setRenaming(false);
                  }
                }}
              />
            ) : (
              <h3 className="truncate text-[15px] font-semibold">{project.title}</h3>
            )}
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
