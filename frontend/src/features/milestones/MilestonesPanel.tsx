import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Dialog, Field, Input, ProgressBar } from '@/components/ui';
import { CardGridSkeleton } from '@/components/Skeletons';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { CenteredPageLayout } from '@/layouts/shared';
import { MILESTONE_STATUS_LABEL } from '@/types/enums';
import { useCreateMilestone, useMilestones } from './api';

/**
 * The OKRs tab of the planning page (`PlanningPage`) — the objectives as cards
 * with their progress, and the create dialog.
 *
 * A *panel*, not a page: see `RoadmapsPanel`. Its own `PageHeader` portals into
 * the topbar, so opening this tab swaps both the title and the primary action.
 */
export function MilestonesPanel() {
  const { user, canWrite } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useMilestones();
  const create = useCreateMilestone();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [timeframe, setTimeframe] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), timeframe: timeframe.trim() },
      {
        onSuccess: (m) => {
          setOpen(false);
          setTitle('');
          setTimeframe('');
          navigate(`/okrs/${m.id}`);
        },
      },
    );
  }

  const milestones = data ?? [];

  return (
    <>
      <PageHeader
        title={t('milestones.title')}
        actions={
          canWrite ? (
            <Button onClick={() => setOpen(true)}>+ {t('milestones.new')}</Button>
          ) : undefined
        }
      />

      {/* The reading column, applied here rather than by the page: `PlanningPage`
          owns only the tab strip, so each tab picks its own shape. This one is
          cards, so it's the default centred column. */}
      <CenteredPageLayout>
        {isLoading ? (
          <CardGridSkeleton />
        ) : milestones.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {t('milestones.empty')}
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {milestones.map((m) => (
              <article
                key={m.id}
                className="flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground transition-colors hover:border-foreground/20"
                onClick={() => navigate(`/okrs/${m.id}`)}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] font-medium">{m.title}</h3>
                  <Badge variant="muted">{MILESTONE_STATUS_LABEL[m.status]}</Badge>
                </div>
                {m.timeframe && <p className="text-sm text-muted-foreground">{m.timeframe}</p>}
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <ProgressBar value={m.progress} className="flex-1" />
                  <span className="text-muted-foreground">{m.progress}%</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </CenteredPageLayout>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('milestones.create')}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button form="ms-create" type="submit" loading={create.isPending}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <form id="ms-create" onSubmit={submit}>
          <Field label="Title" htmlFor="ms-title">
            <Input
              id="ms-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label={t('milestones.timeframe')} htmlFor="ms-tf">
            <Input
              id="ms-tf"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              placeholder={t('milestones.timeframePlaceholder')}
            />
          </Field>
        </form>
      </Dialog>
    </>
  );
}
