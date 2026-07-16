import { useMemo, useState, type FormEvent } from 'react';
import { Button, Combobox, Dialog, Field, Input, Textarea } from '@/components/ui';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { ROADMAP_PHASE_LABEL } from '@/types/enums';
import { useRoadmaps } from '@/features/roadmaps/api';
import { useCreateTask } from '../api';

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Create a task straight from "My Tasks". Auto-assigns to the current user (so it
 * lands in their list) and lets them optionally link a backlog item — picked from
 * any roadmap item, which back-fills the same flat link the Tasks panel writes.
 */
export function CreateTaskDialog({ open, onClose }: CreateTaskDialogProps) {
  const { user } = useAuth();
  const create = useCreateTask();
  const { data: roadmaps } = useRoadmaps();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [itemId, setItemId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // "No backlog item" first, then every roadmap item (roadmap-qualified for clarity).
  const itemOptions = useMemo(
    () => [
      { value: '', label: t('tasks.noBacklogItem') },
      ...(roadmaps ?? []).flatMap((r) =>
        (r.items ?? []).map((it) => ({
          value: it.id,
          label: `${r.title} · ${ROADMAP_PHASE_LABEL[it.phase]} · ${it.title}`,
        })),
      ),
    ],
    [roadmaps],
  );

  // itemId → the flat link fields stored on the task (canonical short label).
  const linkFor = useMemo(() => {
    const map = new Map<string, { roadmapId: string; projectId: string; label: string }>();
    (roadmaps ?? []).forEach((r) =>
      (r.items ?? []).forEach((it) =>
        map.set(it.id, {
          roadmapId: r.id,
          projectId: r.projectId,
          label: `${ROADMAP_PHASE_LABEL[it.phase]} · ${it.title}`,
        }),
      ),
    );
    return map;
  }, [roadmaps]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    const link = itemId ? linkFor.get(itemId) : undefined;
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId: user?.id,
        roadmapItemId: itemId || undefined,
        roadmapItemLabel: link?.label,
        roadmapId: link?.roadmapId,
        projectId: link?.projectId,
      },
      {
        onSuccess: () => {
          setTitle('');
          setDescription('');
          setItemId('');
          onClose();
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('tasks.new')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} type="button">
            {t('common.cancel')}
          </Button>
          <Button form="task-form" type="submit" loading={create.isPending} disabled={!title.trim()}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit}>
        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <Field label={t('tasks.titleLabel')} htmlFor="tk-title">
          <Input
            id="tk-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label={t('tasks.backlogItem')} htmlFor="tk-item">
          <Combobox
            id="tk-item"
            value={itemId}
            onChange={setItemId}
            options={itemOptions}
            placeholder={t('tasks.noBacklogItem')}
          />
        </Field>
        <Field label={t('tasks.descriptionLabel')} htmlFor="tk-desc">
          <Textarea
            id="tk-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <p className="text-xs text-muted-foreground">{t('tasks.assignedToYouHint')}</p>
      </form>
    </Dialog>
  );
}
