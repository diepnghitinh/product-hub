import { useState, type FormEvent } from 'react';
import { Button, Dialog, Field, Input } from '@/components/ui';
import { EnvironmentSelect } from '@/features/projects/components/EnvironmentSelect';
import { t } from '@/i18n';
import { ProjectEnvironment } from '@/types/enums';
import type { ProjectDto } from '@/types/dto';

export interface ProjectFormValues {
  title: string;
  subtitle: string;
  owner: string;
  environment: ProjectEnvironment;
}

interface ProjectFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Present when editing; absent when creating. */
  project?: ProjectDto;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (values: ProjectFormValues) => void;
}

/** Shared create/edit dialog. Title is required; the rest optional. */
export function ProjectFormDialog({
  open,
  onClose,
  project,
  submitting = false,
  error,
  onSubmit,
}: ProjectFormDialogProps) {
  const editing = !!project;
  const [title, setTitle] = useState(project?.title ?? '');
  const [subtitle, setSubtitle] = useState(project?.subtitle ?? '');
  const [owner, setOwner] = useState(project?.owner ?? '');
  const [environment, setEnvironment] = useState<ProjectEnvironment>(
    project?.environment ?? ProjectEnvironment.DEVELOPMENT,
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), subtitle: subtitle.trim(), owner: owner.trim(), environment });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t('projects.edit') : t('projects.create')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} type="button">
            {t('common.cancel')}
          </Button>
          <Button form="project-form" type="submit" loading={submitting}>
            {editing ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={submit}>
        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <Field label={t('projects.title')} htmlFor="p-title">
          <Input
            id="p-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label={t('projects.subtitle')} htmlFor="p-subtitle">
          <Input
            id="p-subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
          />
        </Field>
        <Field label={t('projects.owner')} htmlFor="p-owner">
          <Input
            id="p-owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
        </Field>
        <Field label={t('projects.environment')} htmlFor="p-env">
          <EnvironmentSelect id="p-env" value={environment} onChange={setEnvironment} />
        </Field>
      </form>
    </Dialog>
  );
}
