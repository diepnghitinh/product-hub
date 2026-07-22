import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  Calendar,
  CircleDot,
  FileText,
  Gauge,
  HelpCircle,
  MoreHorizontal,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
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
import { useMilestones } from '@/features/milestones/api';
import { DetailGrid, PropField, PropSection, PropSidebar, PropValue } from '@/features/issues/IssueDetail';
import { TaskPanel } from '@/features/tasks/components/TaskPanel';
import { taskRefsInText, useLinkTasksByRef } from '@/features/tasks/api';
import { FavouriteButton } from '@/features/favourites/FavouriteButton';
import { ReactionBar } from '@/features/reactions/ReactionBar';
import { ActivityHeader, CommentThread } from '@/features/activity/CommentThread';
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
import type { Objective, RoadmapItem } from '@/types/dto';
import { useReplaceRoadmapItems, useRoadmap } from './api';
import { BACKLOG_TEMPLATES, type BacklogTemplate } from './backlogTemplates';
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

/** Sentinel for the key-result Select's "link at the objective level" option —
 *  distinct from '' (unlinked) so choosing it clears just the KR, not the OKR. */
const OKR_WHOLE = '__whole__';

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
  const { user, canManageDelivery, canEditDelivery: canWrite, isAdmin } = useAuth();
  useEscapeBack();

  const { data: roadmap, isLoading } = useRoadmap(roadmapId);
  const replaceItems = useReplaceRoadmapItems();
  const linkTasks = useLinkTasksByRef();
  // People list feeds both the assignee picker and comment @-mentions, so fetch
  // it for anyone who can write here (not just those who can manage assignees).
  const { data: usersData } = useUsers({ limit: 100 }, canWrite);
  const users = usersData?.items ?? [];
  // Milestones feed the OKR picker (link this item to an objective / key result).
  const { data: milestones } = useMilestones();
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

  // Applying a backlog template seeds the editor's value and bumps `nonce` to
  // remount it (the editor reads `value` only at mount, keyed) — so the template
  // shows regardless of when the optimistic cache flushes. Clears on item change.
  const [seed, setSeed] = useState<{ nonce: number; html: string | null }>({
    nonce: 0,
    html: null,
  });
  useEffect(() => setSeed({ nonce: 0, html: null }), [itemId]);

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
  // OKR picker — every objective across all milestones, labelled "Milestone ›
  // Objective". `linkedObjective` is the one this item points at (if any), whose
  // key results fill the optional second Select.
  const objectiveOptions = (milestones ?? []).flatMap((m) =>
    m.objectives.map((o) => ({ value: o.id, label: `${m.title} › ${o.title}`, milestoneId: m.id })),
  );
  let linkedObjective: Objective | undefined;
  for (const m of milestones ?? []) {
    const found = m.objectives.find((o) => o.id === item.objectiveId);
    if (found) {
      linkedObjective = found;
      break;
    }
  }
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

  // The description as the editor will render it (seed wins right after a
  // template is applied), and whether it already holds anything worth guarding.
  const effectiveDesc = seed.html ?? item.description;
  const descHasContent =
    /<(img|video)/i.test(effectiveDesc) || effectiveDesc.replace(/<[^>]*>/g, '').trim().length > 0;
  const applyTemplate = (tpl: BacklogTemplate) => {
    if (descHasContent && !confirm(t('roadmaps.templateReplaceConfirm'))) return;
    const html = tpl.buildHtml();
    setSeed((s) => ({ nonce: s.nonce + 1, html }));
    save({ description: html });
  };

  const addAssignee = (id: string) => {
    const u = users.find((x) => x.id === id);
    if (!u || assignedIds.has(id)) return;
    save({ assignees: [...item.assignees, { id: u.id, name: u.name }] });
  };

  // ── OKR link ────────────────────────────────────────────────────────────────
  const linkObjective = (objectiveId: string) => {
    const opt = objectiveOptions.find((o) => o.value === objectiveId);
    const obj = (milestones ?? []).flatMap((m) => m.objectives).find((o) => o.id === objectiveId);
    if (!opt || !obj) return;
    // Link at the objective level; the label is the objective's title until a KR
    // is chosen. `keyResultId` resets so a re-link doesn't keep the old KR.
    save({ milestoneId: opt.milestoneId, objectiveId, keyResultId: '', okrLabel: obj.title });
  };
  const linkKeyResult = (v: string) => {
    if (!linkedObjective) return;
    if (v === OKR_WHOLE) {
      save({ keyResultId: '', okrLabel: linkedObjective.title });
      return;
    }
    const kr = linkedObjective.keyResults.find((k) => k.id === v);
    if (kr) save({ keyResultId: v, okrLabel: kr.title });
  };
  const clearOkr = () => save({ milestoneId: '', objectiveId: '', keyResultId: '', okrLabel: '' });

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

      <DetailGrid>
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
              <>
                {descHasContent ? (
                  <div className="mb-2 flex justify-end">
                    <BacklogTemplateMenu onApply={applyTemplate} />
                  </div>
                ) : (
                  <BacklogTemplatePanel onApply={applyTemplate} />
                )}
                <RichTextEditor
                  key={`${item.id}:${seed.nonce}`}
                  value={effectiveDesc}
                  onChange={saveDescription}
                  placeholder={t('roadmaps.description')}
                  minHeight={80}
                  images
                  className="border-0"
                />
              </>
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

          {/* ── Activity ─────────────────────────────────────────────────────── */}
          <section className="mt-10 border-t pt-6">
            <ActivityHeader />
            <div className="flex flex-col gap-5">
              <CommentThread
                source={{ kind: 'roadmapItem', roadmapId: roadmap.id, id: item.id }}
                users={users}
                canWrite={canWrite}
                isAdmin={isAdmin}
                currentUserId={user?.id}
              />
            </div>
          </section>
        </div>

        {/* ── Properties sidebar ──────────────────────────────────────────── */}
        <PropSidebar>
          <PropSection label={t('tasks.properties')}>
            <PropField bare label={t('roadmaps.status')}>
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
                <PropValue icon={<CircleDot />}>
                  <DotLabel color={ROADMAP_ITEM_STATUS_COLOR[item.status]}>
                    {ROADMAP_ITEM_STATUS_LABEL[item.status]}
                  </DotLabel>
                </PropValue>
              )}
            </PropField>

            <PropField bare label={t('roadmaps.difficulty')}>
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
                <PropValue icon={<Gauge />}>
                  <DotLabel color={ROADMAP_DIFFICULTY_COLOR[item.difficulty]}>
                    {ROADMAP_DIFFICULTY_LABEL[item.difficulty]}
                  </DotLabel>
                </PropValue>
              )}
            </PropField>

            <PropField bare label={t('roadmaps.startDate')}>
              {canWrite ? (
                <DatePicker
                  value={item.startDate}
                  onChange={(v) => save({ startDate: v })}
                  clearable
                />
              ) : (
                <PropValue icon={<Calendar />} muted={!item.startDate}>
                  {item.startDate ? formatDate(item.startDate) : '—'}
                </PropValue>
              )}
            </PropField>

            <PropField label={t('roadmaps.progress')} icon={<Activity />} align="stack">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={progressDraft}
                  disabled={!canWrite}
                  onChange={(e) => setProgressDraft(Number(e.target.value) || 0)}
                  onPointerUp={() =>
                    progressDraft !== item.progress && save({ progress: progressDraft })
                  }
                  onKeyUp={() => progressDraft !== item.progress && save({ progress: progressDraft })}
                  className="h-1.5 flex-1 cursor-pointer accent-primary"
                  aria-label={t('roadmaps.progress')}
                />
                <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                  {progressDraft}%
                </span>
              </div>
            </PropField>

            <PropField label={t('roadmaps.assignees')} icon={<Users />} align="stack">
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

            <PropField label={t('roadmaps.okr')} icon={<Target />} align="stack">
              {canWrite ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="min-w-0 flex-1">
                      <Select
                        value={item.objectiveId}
                        onValueChange={linkObjective}
                        placeholder={t('roadmaps.linkOkr')}
                        aria-label={t('roadmaps.okr')}
                        options={objectiveOptions.map(({ value, label }) => ({ value, label }))}
                      />
                    </div>
                    {item.objectiveId && (
                      <button
                        type="button"
                        onClick={clearOkr}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={t('roadmaps.unlinkOkr')}
                        title={t('roadmaps.unlinkOkr')}
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                  {linkedObjective && linkedObjective.keyResults.length > 0 && (
                    <Select
                      value={item.keyResultId || OKR_WHOLE}
                      onValueChange={linkKeyResult}
                      aria-label={t('roadmaps.keyResult')}
                      options={[
                        { value: OKR_WHOLE, label: t('roadmaps.wholeObjective') },
                        ...linkedObjective.keyResults.map((k) => ({ value: k.id, label: k.title })),
                      ]}
                    />
                  )}
                </div>
              ) : item.okrLabel ? (
                <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
                  <Target className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{item.okrLabel}</span>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </PropField>
          </PropSection>

          {/* RICE */}
          <section className="rounded-xl border border-border p-3">
            <span className="inline-block rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('roadmaps.rice')}
            </span>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
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
            <div className="mt-2.5 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-1.5">
              <span className="text-sm text-muted-foreground">{t('roadmaps.score')}</span>
              <span className="font-mono text-base font-bold text-primary">{score.toFixed(1)}</span>
            </div>
          </section>

          {/* Timing — driven by status, stamped server-side. */}
          {item.createdAt && (
            <section className="rounded-xl border border-border p-3">
              <span className="inline-block rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('roadmaps.timing')}
              </span>
              <dl className="mt-2.5 space-y-1 text-sm">
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
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-1.5">
                  <div className="text-xs text-muted-foreground">{t('roadmaps.leadTime')}</div>
                  <div className="font-mono text-base font-bold text-primary">
                    {dur(item.createdAt, item.completedAt)}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-1.5">
                  <div className="text-xs text-muted-foreground">{t('roadmaps.cycleTime')}</div>
                  <div className="font-mono text-base font-bold text-primary">
                    {dur(item.startedAt, item.completedAt)}
                  </div>
                </div>
              </div>
            </section>
          )}
        </PropSidebar>
      </DetailGrid>
    </CenteredPageLayout>
  );
}

/** The empty-state prompt above the description: pick a proven structure to start
 *  from (User Story / INVEST, JTBD) instead of a blank page. */
function BacklogTemplatePanel({ onApply }: { onApply: (tpl: BacklogTemplate) => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2">
      <span className="mr-1 text-xs font-medium text-muted-foreground">
        {t('roadmaps.startFromTemplate')}
      </span>
      {BACKLOG_TEMPLATES.map((tpl) => (
        <button
          key={tpl.id}
          type="button"
          onClick={() => onApply(tpl)}
          title={t(tpl.hintKey)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
        >
          <FileText className="size-3.5 text-primary" aria-hidden />
          {t(tpl.labelKey)}
        </button>
      ))}
    </div>
  );
}

/** Quiet templates menu shown once the description has content — applying
 *  confirms first (see `applyTemplate`), since it replaces what's there. */
function BacklogTemplateMenu({ onApply }: { onApply: (tpl: BacklogTemplate) => void }) {
  return (
    <Menu
      align="right"
      triggerClassName="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
      trigger={
        <>
          <FileText className="size-3.5" aria-hidden />
          {t('roadmaps.templates')}
        </>
      }
      items={BACKLOG_TEMPLATES.map((tpl) => ({
        label: t(tpl.labelKey),
        icon: <FileText className="size-4" />,
        closeOnSelect: true,
        onClick: () => onApply(tpl),
      }))}
    />
  );
}
