import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { HelpCircle, MoreHorizontal, Trash2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useEscapeBack } from '@/lib/useEscapeBack';
import {
  DatePicker,
  DotLabel,
  Input,
  Menu,
  RichTextEditor,
  Select,
  Spinner,
} from '@/components/ui';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { usePageChrome } from '@/layouts/headers/PageChrome';
import { Icon } from '@/components/Icon';
import { firstImageUrl } from '@/lib/editorjs';
import { daysBetween, formatDate } from '@/lib/format';
import { useUsers } from '@/features/users/api';
import { PropField } from '@/features/issues/IssueDetail';
import { TaskPanel } from '@/features/tasks/components/TaskPanel';
import { taskRefsInText, useLinkTasksByRef } from '@/features/tasks/api';
import { FavouriteButton } from '@/features/favourites/FavouriteButton';
import { ReactionBar } from '@/features/reactions/ReactionBar';
import {
  DEFAULT_ROADMAP_COLUMNS,
  FavouriteKind,
  ReactionTargetType,
  ROADMAP_DIFFICULTIES,
  ROADMAP_DIFFICULTY_COLOR,
  ROADMAP_DIFFICULTY_LABEL,
  ROADMAP_ITEM_STATUS_COLOR,
  ROADMAP_ITEM_STATUS_LABEL,
  ROADMAP_ITEM_STATUSES,
  RoadmapDifficulty,
  RoadmapItemStatus,
} from '@/types/enums';
import type { RoadmapItem } from '@/types/dto';
import { useReplaceRoadmapItems, useRoadmap } from './api';
import { CenteredPageLayout } from '@/layouts/shared';

/** RICE inputs, in order, with the field key + help copy. */
const RICE_FIELDS = [
  ['reach', 'roadmaps.reach', 'roadmaps.reachHelp'],
  ['impact', 'roadmaps.impact', 'roadmaps.impactHelp'],
  ['confidence', 'roadmaps.confidence', 'roadmaps.confidenceHelp'],
  ['effort', 'roadmaps.effort', 'roadmaps.effortHelp'],
] as const;

const riceOf = (i: Pick<RoadmapItem, 'reach' | 'impact' | 'confidence' | 'effort'>) =>
  i.effort > 0 ? (i.reach * i.impact * i.confidence) / i.effort : 0;

/**
 * A roadmap item as a full page — the same shell and two-column layout as Task
 * detail (breadcrumb · main column · Properties sidebar), reusing `PropField`,
 * `ReactionBar`, `FavouriteButton` and `TaskPanel`. Every field auto-saves (the
 * item is written back via the roadmap's items array, optimistically); there's no
 * "Done" button. Roadmap items have no comment thread, so the "activity" area is
 * the linked Tasks panel + reactions.
 */
export function RoadmapItemDetailPage() {
  const { roadmapId, itemId } = useParams<{ roadmapId: string; itemId: string }>();
  const navigate = useNavigate();
  const { user, canManageDelivery, canEditDelivery: canWrite } = useAuth();
  useEscapeBack();

  const { data: roadmap, isLoading } = useRoadmap(roadmapId);
  const replaceItems = useReplaceRoadmapItems();
  const linkTasks = useLinkTasksByRef();
  // People list is admin/product-only; only fetch it for those who can assign.
  const { data: usersData } = useUsers({ limit: 100 }, canManageDelivery);
  const users = usersData?.items ?? [];
  const { crumbActions } = usePageChrome();

  const items = roadmap?.items ?? [];
  const item = items.find((i) => i.id === itemId);

  // Progress slider keeps a local draft so it stays smooth while dragging; the
  // value is written back only on release. Synced when the item changes.
  const [progressDraft, setProgressDraft] = useState(item?.progress ?? 0);
  useEffect(() => {
    if (item) setProgressDraft(item.progress);
  }, [item?.progress]);
  // Debounce description saves the way the issue detail does — save on pause.
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (descTimer.current && clearTimeout(descTimer.current)), []);

  if (isLoading) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed p-8">
        <Spinner />
      </div>
    );
  }
  if (!roadmap || !item) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {t('roadmaps.itemNotFound')}{' '}
        <Link
          to={roadmap ? `/roadmaps/${roadmap.id}` : '/roadmaps'}
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {roadmap?.title ?? t('roadmaps.title')}
        </Link>
      </div>
    );
  }

  const columns = roadmap.columns?.length ? roadmap.columns : DEFAULT_ROADMAP_COLUMNS;
  const score = riceOf(item);
  const clampRice = (v: string) => Math.min(5, Math.max(1, Number(v) || 1));
  const assignedIds = new Set(item.assignees.map((a) => a.id));
  const addableUsers = users.filter((u) => !assignedIds.has(u.id));
  const dur = (from?: string, to?: string) =>
    from && to
      ? daysBetween(from, to) === 0
        ? t('roadmaps.underDay')
        : `${daysBetween(from, to)}d`
      : '—';

  /** Persist a field patch: recompute RICE, re-derive the cover, PUT the array. */
  const save = (patch: Partial<RoadmapItem>) => {
    const next: RoadmapItem = { ...item, ...patch };
    next.rice = Math.round(riceOf(next));
    if (patch.description !== undefined) next.imageUrl = firstImageUrl(next.description);
    replaceItems.mutate({ id: roadmap.id, items: items.map((i) => (i.id === item.id ? next : i)) });
  };

  const saveDescription = (html: string) => {
    if (descTimer.current) clearTimeout(descTimer.current);
    descTimer.current = setTimeout(() => {
      save({ description: html });
      // A pasted task link (/tasks/TSK-5) links that task to this item. Add-only:
      // unresolved refs are ignored and deleting the text later won't unlink.
      const refs = taskRefsInText(html);
      if (refs.length) {
        const label = `${columns.find((c) => c.key === item.phase)?.label ?? item.phase} · ${item.title}`;
        linkTasks.mutate({
          refs,
          roadmapId: roadmap.id,
          roadmapItemId: item.id,
          roadmapItemLabel: label,
          projectId: roadmap.projectId,
        });
      }
    }, 700);
  };

  const addAssignee = (id: string) => {
    const u = users.find((x) => x.id === id);
    if (!u || assignedIds.has(id)) return;
    save({ assignees: [...item.assignees, { id: u.id, name: u.name }] });
  };

  const removeItem = () => {
    if (confirm(t('roadmaps.confirmDeleteItem')))
      replaceItems.mutate(
        { id: roadmap.id, items: items.filter((i) => i.id !== item.id) },
        { onSuccess: () => navigate(`/roadmaps/${roadmap.id}`) },
      );
  };

  return (
    <CenteredPageLayout>
      {/* Breadcrumb: Roadmaps' board › item. The item name also rides the topbar. */}
      <PageHeader
        title={item.title || t('roadmaps.untitled')}
        parent={{ to: `/roadmaps/${roadmap.id}`, label: roadmap.title }}
        leading={
          <span className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground">
            <Icon name="roadmap" size={16} />
          </span>
        }
        actions={
          canWrite ? (
            <Menu
              align="right"
              triggerClassName="size-8 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              trigger={
                <>
                  <MoreHorizontal className="size-4" aria-hidden />
                  <span className="sr-only">{t('common.more')}</span>
                </>
              }
              items={[
                {
                  label: t('common.delete'),
                  danger: true,
                  closeOnSelect: true,
                  icon: <Trash2 className="size-4" />,
                  onClick: removeItem,
                },
              ]}
            />
          ) : undefined
        }
      />

      {/* Favourite star — right of the breadcrumb, matching task/bug detail. */}
      {user &&
        crumbActions &&
        createPortal(
          <FavouriteButton
            kind={FavouriteKind.ROADMAP_ITEM}
            refId={item.id}
            roadmapId={roadmap.id}
            title={item.title}
            size={16}
            className="size-7"
          />,
          crumbActions,
        )}

      <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_280px]">
        {/* ── Main column ─────────────────────────────────────────────────── */}
        <div className="min-w-0">
          {canWrite ? (
            <input
              key={item.id}
              className="w-full min-w-0 border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
              defaultValue={item.title}
              placeholder={t('roadmaps.itemTitlePlaceholder')}
              aria-label={t('roadmaps.itemTitle')}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== item.title) save({ title: v });
                else e.target.value = item.title;
              }}
            />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">
              {item.title || t('roadmaps.untitled')}
            </h1>
          )}

          <div className="mt-4">
            {canWrite ? (
              <RichTextEditor
                key={item.id}
                value={item.description}
                onChange={saveDescription}
                placeholder={t('roadmaps.description')}
                minHeight={80}
                images
                className="border-0"
              />
            ) : item.description ? (
              <div
                className="text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md"
                dangerouslySetInnerHTML={{ __html: item.description }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t('roadmaps.description')}</p>
            )}
          </div>

          {user && (
            <ReactionBar
              targetType={ReactionTargetType.ROADMAP_ITEM}
              targetId={item.id}
              className="mt-3"
            />
          )}

          <TaskPanel
            roadmapId={roadmap.id}
            projectId={roadmap.projectId ?? ''}
            itemId={item.id}
            itemLabel={`${columns.find((c) => c.key === item.phase)?.label ?? item.phase} · ${item.title}`}
          />
        </div>

        {/* ── Properties sidebar ──────────────────────────────────────────── */}
        <aside className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-sm md:sticky md:top-6">
          <PropField label={t('roadmaps.status')}>
            {canWrite ? (
              <Select
                value={item.status}
                onValueChange={(v) => save({ status: v as RoadmapItemStatus })}
                options={ROADMAP_ITEM_STATUSES.map((s) => ({
                  value: s,
                  label: (
                    <DotLabel color={ROADMAP_ITEM_STATUS_COLOR[s]}>
                      {ROADMAP_ITEM_STATUS_LABEL[s]}
                    </DotLabel>
                  ),
                }))}
              />
            ) : (
              <DotLabel color={ROADMAP_ITEM_STATUS_COLOR[item.status]}>
                {ROADMAP_ITEM_STATUS_LABEL[item.status]}
              </DotLabel>
            )}
          </PropField>

          <PropField label={t('roadmaps.difficulty')}>
            {canWrite ? (
              <Select
                value={item.difficulty}
                onValueChange={(v) => save({ difficulty: v as RoadmapDifficulty })}
                options={ROADMAP_DIFFICULTIES.map((d) => ({
                  value: d,
                  label: (
                    <DotLabel color={ROADMAP_DIFFICULTY_COLOR[d]}>
                      {ROADMAP_DIFFICULTY_LABEL[d]}
                    </DotLabel>
                  ),
                }))}
              />
            ) : (
              <DotLabel color={ROADMAP_DIFFICULTY_COLOR[item.difficulty]}>
                {ROADMAP_DIFFICULTY_LABEL[item.difficulty]}
              </DotLabel>
            )}
          </PropField>

          <PropField label={t('roadmaps.startDate')}>
            {canWrite ? (
              <DatePicker value={item.startDate} onChange={(v) => save({ startDate: v })} clearable />
            ) : (
              <span className="text-sm">{item.startDate ? formatDate(item.startDate) : '—'}</span>
            )}
          </PropField>

          <PropField label={t('roadmaps.assignees')}>
            <div className="flex flex-col gap-2">
              {item.assignees.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.assignees.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-0.5 pl-0.5 pr-2 text-sm"
                    >
                      <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                        {a.name.charAt(0).toUpperCase()}
                      </span>
                      {a.name}
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() =>
                            save({ assignees: item.assignees.filter((x) => x.id !== a.id) })
                          }
                          className="text-muted-foreground transition-colors hover:text-destructive"
                          aria-label={t('common.delete')}
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {canManageDelivery && addableUsers.length > 0 ? (
                <Select
                  value=""
                  onValueChange={addAssignee}
                  placeholder={t('roadmaps.addAssignee')}
                  options={addableUsers.map((u) => ({ value: u.id, label: u.name }))}
                />
              ) : (
                item.assignees.length === 0 && (
                  <span className="text-sm text-muted-foreground">—</span>
                )
              )}
            </div>
          </PropField>

          {/* RICE */}
          <section className="rounded-xl border border-border p-3">
            <span className="inline-block rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('roadmaps.rice')}
            </span>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {RICE_FIELDS.map(([key, labelKey, helpKey]) => (
                <div key={key}>
                  <label className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {t(labelKey)}
                    <HelpCircle className="size-3" aria-hidden />
                    <span className="sr-only">{t(helpKey)}</span>
                  </label>
                  <Input
                    key={`${item.id}-${key}`}
                    type="number"
                    min={1}
                    max={5}
                    step={key === 'impact' || key === 'effort' ? '0.5' : undefined}
                    defaultValue={item[key]}
                    disabled={!canWrite}
                    onBlur={(e) => {
                      const v = clampRice(e.target.value);
                      if (v !== item[key]) save({ [key]: v } as Partial<RoadmapItem>);
                      e.target.value = String(v);
                    }}
                    className="h-9"
                    title={t(helpKey)}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
              <span className="text-sm text-muted-foreground">{t('roadmaps.score')}</span>
              <span className="font-mono text-base font-bold text-primary">{score.toFixed(1)}</span>
            </div>
          </section>

          <PropField label={t('roadmaps.progress')}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={progressDraft}
                disabled={!canWrite}
                onChange={(e) => setProgressDraft(Number(e.target.value) || 0)}
                onPointerUp={() => progressDraft !== item.progress && save({ progress: progressDraft })}
                onKeyUp={() => progressDraft !== item.progress && save({ progress: progressDraft })}
                className="h-1.5 flex-1 cursor-pointer accent-primary"
                aria-label={t('roadmaps.progress')}
              />
              <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                {progressDraft}%
              </span>
            </div>
          </PropField>

          {/* Timing — driven by status, stamped server-side. */}
          {item.createdAt && (
            <section className="rounded-xl border border-border p-3">
              <span className="inline-block rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('roadmaps.timing')}
              </span>
              <dl className="mt-3 space-y-1.5 text-sm">
                {(
                  [
                    { label: t('roadmaps.requested'), value: item.createdAt },
                    { label: t('roadmaps.started'), value: item.startedAt },
                    { label: t('roadmaps.completed'), value: item.completedAt },
                  ] as { label: string; value?: string }[]
                ).map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="tabular-nums">{value ? formatDate(value) : '—'}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <div className="text-xs text-muted-foreground">{t('roadmaps.leadTime')}</div>
                  <div className="font-mono text-base font-bold text-primary">
                    {dur(item.createdAt, item.completedAt)}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <div className="text-xs text-muted-foreground">{t('roadmaps.cycleTime')}</div>
                  <div className="font-mono text-base font-bold text-primary">
                    {dur(item.startedAt, item.completedAt)}
                  </div>
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>
    </CenteredPageLayout>
  );
}
