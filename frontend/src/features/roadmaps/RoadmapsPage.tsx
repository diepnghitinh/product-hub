import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button, Dialog, Field, Input, Spinner, Textarea } from '@/components/ui';
import { t } from '@/i18n';
import { PageHeader } from '@/components/PageHeader';
import { timeAgo } from '@/lib/format';
import { Role } from '@/types/enums';
import { useCreateRoadmap, useRoadmaps } from './api';

const CARD_GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]';

export function RoadmapsPage() {
  const { user } = useAuth();
  const canWrite = user?.role === Role.ADMIN || user?.role === Role.TESTER;
  const navigate = useNavigate();
  const { data, isLoading } = useRoadmaps();
  const create = useCreateRoadmap();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), description: description.trim() },
      {
        onSuccess: (r) => {
          setOpen(false);
          setTitle('');
          setDescription('');
          navigate(`/roadmaps/${r.id}`);
        },
      },
    );
  }

  const roadmaps = data ?? [];

  return (
    <div>
      <PageHeader
        title={t('roadmaps.title')}
        actions={
          canWrite ? (
            <Button onClick={() => setOpen(true)}>+ {t('roadmaps.new')}</Button>
          ) : undefined
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
              className="flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-foreground/20"
              onClick={() => navigate(`/roadmaps/${r.id}`)}
            >
              <h3 className="text-[15px] font-medium">{r.title}</h3>
              {r.description && (
                <p className="text-sm text-muted-foreground">{r.description}</p>
              )}
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>
                  {r.itemCount} {t('roadmaps.items')}
                </span>
                <span>{timeAgo(r.updatedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('roadmaps.create')}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button form="rm-create" type="submit" loading={create.isPending}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <form id="rm-create" onSubmit={submit}>
          <Field label={t('roadmaps.itemTitle')} htmlFor="rm-title">
            <Input id="rm-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </Field>
          <Field label="Description" htmlFor="rm-desc">
            <Textarea id="rm-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
