import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button, Dialog, Field, Input, Spinner, Textarea } from '@/components/ui';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { BackLink } from '@/components/BackLink';
import { timeAgo } from '@/lib/format';
import type { RoadmapDto } from '@/types/dto';
import { useCreateRoadmap, useRoadmaps, useUpdateRoadmap } from './api';
import { CenteredPageLayout } from '@/layouts/shared';

const CARD_GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]';

export function RoadmapsPage() {
  const { user, canWrite } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const projectId = params.get('projectId') || undefined;
  const projectName = params.get('project') || undefined;
  const { data, isLoading } = useRoadmaps();
  const create = useCreateRoadmap();
  const update = useUpdateRoadmap();

  const [open, setOpen] = useState(false);
  /** null = creating; a roadmap = editing that card's meta. */
  const [editing, setEditing] = useState<RoadmapDto | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  function openCreate() {
    setEditing(null);
    setTitle('');
    setDescription('');
    setOpen(true);
  }

  function openEdit(r: RoadmapDto) {
    setEditing(r);
    setTitle(r.title);
    setDescription(r.description);
    setOpen(true);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const name = title.trim();
    if (!name) return;
    const input = { title: name, description: description.trim() };
    if (editing) {
      // Editing meta only — stay on the list, the card updates in place.
      update.mutate({ id: editing.id, input }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(
        { ...input, projectId },
        {
          onSuccess: (r) => {
            setOpen(false);
            navigate(`/roadmaps/${r.id}`);
          },
        },
      );
    }
  }

  const saving = editing ? update.isPending : create.isPending;

  const roadmaps = (data ?? []).filter((r) => !projectId || r.projectId === projectId);

  return (
    <CenteredPageLayout>
      {projectId && (
        <BackLink to={`/testing/${projectId}`}>{projectName || t('nav.projects')}</BackLink>
      )}
      <PageHeader
        title={projectName ? `${t('roadmaps.title')} — ${projectName}` : t('roadmaps.title')}
        actions={
          canWrite ? <Button onClick={openCreate}>+ {t('roadmaps.new')}</Button> : undefined
        }
      />

      {isLoading ? (
        <div className="grid place-items-center rounded-xl border border-dashed p-8">
          <Spinner />
        </div>
      ) : roadmaps.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('roadmaps.empty')}
        </div>
      ) : (
        <div className={CARD_GRID}>
          {roadmaps.map((r) => (
            <article
              key={r.id}
              className="group relative flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-foreground/20"
              onClick={() => navigate(`/roadmaps/${r.id}`)}
            >
              <h3 className="pr-8 text-[15px] font-medium">{r.title}</h3>
              {r.description && (
                <p className="text-sm text-muted-foreground">{r.description}</p>
              )}
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>
                  {r.itemCount} {t('roadmaps.items')}
                </span>
                <span>{timeAgo(r.updatedAt)}</span>
              </div>
              {canWrite && (
                // Always visible on touch, where there's no hover to reveal it.
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.edit')}
                  title={t('roadmaps.edit')}
                  onClick={(e) => {
                    e.stopPropagation(); // don't open the board
                    openEdit(r);
                  }}
                  className="absolute right-2 top-2 size-7 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
                >
                  <Pencil />
                </Button>
              )}
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? t('roadmaps.edit') : t('roadmaps.create')}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button form="rm-create" type="submit" loading={saving}>
              {editing ? t('common.save') : t('common.create')}
            </Button>
          </>
        }
      >
        <form id="rm-create" onSubmit={submit}>
          <Field label={t('roadmaps.itemTitle')} htmlFor="rm-title">
            <Input id="rm-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </Field>
          <Field label={t('roadmaps.description')} htmlFor="rm-desc">
            <Textarea id="rm-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </form>
      </Dialog>
    </CenteredPageLayout>
  );
}
