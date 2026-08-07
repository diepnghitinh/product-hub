import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Activity,
  CalendarRange,
  CircleDot,
  Gauge,
  HelpCircle,
  Layers,
  MoreHorizontal,
  Plus,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  DateRangePicker,
  DotLabel,
  Input,
  Menu,
  RichText,
  RichTextEditor,
  Select,
  TITLE_FIELD,
  formatDateRange,
} from '@/components/ui';
import { AssigneeField, fallbackNames } from '@/components/AssigneeField';
import { DetailSkeleton } from '@/components/Skeletons';
import { DescriptionTemplates, useTemplateSeed } from '@/components/DescriptionTemplates';
import { AttachmentsRow } from '@/components/AttachmentsRow';
import { ClickUpLinkPanel } from '@/features/clickup/ClickUpLinkPanel';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { usePageChrome } from '@/layouts/headers/PageChrome';
import { firstImageUrl } from '@/lib/editorjs';
import { daysBetween, formatDate } from '@/lib/format';
import { useUsers } from '@/features/users/api';
import { useMilestones } from '@/features/milestones/api';
import {
  DetailGrid,
  PropField,
  PropSection,
  PropSidebar,
  PropValue,
} from '@/features/issues/IssueDetail';
import { TaskPanel } from '@/features/tasks/components/TaskPanel';
import { issueRefsInText, useLinkIssuesByRef } from '@/features/tasks/api';
import { FavouriteButton } from '@/features/favourites/FavouriteButton';
import { ReactionBar } from '@/features/reactions/ReactionBar';
import { ActivityHeader, CommentThread } from '@/features/activity/CommentThread';
import { LinkedDocsSection } from '@/features/docs/components/LinkedDocsSection';
import {
  ClickUpLinkTarget,
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
import { useReplaceRoadmapItems, useRoadmap } from '../api';
import { BACKLOG_TEMPLATES } from '../backlogTemplates';
import { UNGROUPED } from '../epics';
import { RoadmapEpicsDialog } from './RoadmapEpicsDialog';

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

interface RoadmapItemDetailProps {
  roadmapId: string | undefined;
  /** The item's ref (`RM-6HCUHKX`) or its uuid — both resolve. */
  itemId: string | undefined;
  /** Called after a successful delete — the route navigates back to the board, a
   *  peek drawer closes. */
  onDeleted?: () => void;
  /** 'topbar' on the standalone route (favourite + ⋯ portal beside the
   *  breadcrumb); 'header' (default) when embedded in a drawer, which has no
   *  topbar of its own. Mirrors {@link IssueDetailMain}. */
  menuTarget?: 'header' | 'topbar';
  /** Drawer (peek) layout — one column with the Properties inline under the
   *  title, two per row. Off on the full-page route, which keeps its sidebar. */
  dense?: boolean;
}

/**
 * The full backlog (roadmap) item detail body — the same shape as Task/Bug detail
 * (title · description · linked tasks · activity beside a Properties sidebar),
 * built from the shared `DetailGrid` / `PropField` parts. Extracted from the route
 * page (mirroring {@link TaskDetail}) so it can be embedded: the route wraps it
 * with the breadcrumb + Esc handling, and the roadmap timeline renders it inside a
 * peek drawer.
 *
 * Every field auto-saves — the item is written back through the roadmap's items
 * array (optimistically, see `useReplaceRoadmapItems`); there is no "Done" button.
 */
export function RoadmapItemDetail({
  roadmapId,
  itemId,
  onDeleted,
  menuTarget = 'header',
  dense = false,
}: RoadmapItemDetailProps) {
  const { user, canManageDelivery, canEditDelivery: canWrite, isAdmin } = useAuth();

  const { data: roadmap, isLoading } = useRoadmap(roadmapId);
  const replaceItems = useReplaceRoadmapItems();
  const linkIssues = useLinkIssuesByRef();
  // People list feeds both the assignee picker and comment @-mentions, so fetch
  // it for anyone who can write here (not just those who can manage assignees).
  const { data: usersData } = useUsers({ limit: 100 }, canWrite);
  const users = usersData?.items ?? [];
  // Milestones feed the OKR picker (link this item to an objective / key result).
  const { data: milestones } = useMilestones();
  const { crumbActions } = usePageChrome();

  const items = roadmap?.items ?? [];
  // Callers hand us the item's ref (`RM-6HCUHKX`), but resolve a uuid too: links
  // handed out before refs existed — and the board's own create-and-open, which
  // navigates before the server has minted one — still name items that way.
  const wanted = itemId?.toUpperCase();
  const item =
    items.find((i) => i.shortId && i.shortId.toUpperCase() === wanted) ??
    items.find((i) => i.id === itemId);

  // Progress slider keeps a local draft so it stays smooth while dragging; the
  // value is written back only on release. Synced when the item changes.
  const [progressDraft, setProgressDraft] = useState(item?.progress ?? 0);
  // "＋" beside the epic picker opens the same Manage epics dialog the board uses,
  // so there is one place an epic is ever created.
  const [epicsOpen, setEpicsOpen] = useState(false);
  useEffect(() => {
    if (item) setProgressDraft(item.progress);
  }, [item?.progress]);
  // Debounce description saves the way the issue detail does — save on pause.
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (descTimer.current && clearTimeout(descTimer.current)), []);

  /** Persist a field patch: recompute RICE, re-derive the cover, PUT the array.
   *  Declared above the loading guard so the template picker (a hook) can save
   *  through it; it no-ops until the item resolves. */
  const save = (patch: Partial<RoadmapItem>) => {
    if (!roadmap || !item) return;
    const next: RoadmapItem = { ...item, ...patch };
    next.rice = Math.round(riceOf(next));
    if (patch.description !== undefined) next.imageUrl = firstImageUrl(next.description);
    replaceItems.mutate({ id: roadmap.id, items: items.map((i) => (i.id === item.id ? next : i)) });
  };

  // Backlog templates (User Story / JTBD) — the shared picker, same as a bug's.
  const seed = useTemplateSeed(
    item?.description ?? '',
    (html) => save({ description: html }),
    itemId,
  );

  if (isLoading) {
    return <DetailSkeleton />;
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
  const epics = roadmap.epics ?? [];
  const epic = epics.find((e) => e.id === item.epicId);
  const score = riceOf(item);
  const clampRice = (v: string) => Math.min(5, Math.max(1, Number(v) || 1));
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
        : t('board.ageDays').replace('{n}', String(daysBetween(from, to)))
      : '—';
  const itemLabel = `${columns.find((c) => c.key === item.phase)?.label ?? item.phase} · ${item.title}`;

  const saveDescription = (html: string) => {
    if (descTimer.current) clearTimeout(descTimer.current);
    descTimer.current = setTimeout(() => {
      save({ description: html });
      // A pasted issue link (/issues/TSK-5, /issues/BUG-12) links it to this
      // item. Add-only: unresolved refs are ignored and deleting the text later
      // won't unlink.
      const refs = issueRefsInText(html);
      if (refs.length) {
        linkIssues.mutate({
          refs,
          roadmapId: roadmap.id,
          roadmapItemId: item.id,
          roadmapItemLabel: itemLabel,
          projectId: roadmap.projectId,
        });
      }
    }, 700);
  };

  /** id → the `{id,name}` pair the item stores; keeps the name of anyone the
   *  workspace no longer lists rather than blanking it. */
  const toAssignee = (id: string) => ({
    id,
    name:
      users.find((u) => u.id === id)?.name ?? item.assignees.find((a) => a.id === id)?.name ?? '',
  });

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
        { onSuccess: onDeleted },
      );
  };

  // The ⋯ overflow menu + favourite star. On the standalone route they portal up
  // into the app topbar (right of the breadcrumb, exactly like task/bug detail);
  // in a drawer they render inline in the title row.
  const overflow = canWrite ? (
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
  ) : null;
  const favourite = user ? (
    <FavouriteButton
      kind={FavouriteKind.ROADMAP_ITEM}
      refId={item.id}
      roadmapId={roadmap.id}
      title={item.title}
      size={menuTarget === 'topbar' ? 16 : undefined}
      className={menuTarget === 'topbar' ? 'size-7' : undefined}
    />
  ) : null;

  // ── Properties ──────────────────────────────────────────────────────────────
  const properties = (
    <>
      <PropSection grid={dense} label={t('tasks.properties')}>
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

        {/* One range, not two fields — the same control (and wording) a task uses
            for its window, and the pair the timeline drags. */}
        <PropField bare label={t('roadmaps.dates')}>
          {canWrite ? (
            <DateRangePicker
              start={item.startDate}
              end={item.endDate}
              onChange={(r) => save({ startDate: r.start, endDate: r.end })}
              placeholder={t('tasks.setDates')}
            />
          ) : item.startDate || item.endDate ? (
            <PropValue icon={<CalendarRange />}>
              {formatDateRange(item.startDate, item.endDate)}
            </PropValue>
          ) : (
            <PropValue icon={<CalendarRange />} muted>
              {t('tasks.noDates')}
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
          {/* Several people, one control — the same picker the issue sidebars use,
              in multi mode. Names are stored alongside the ids (denormalised on
              the item), so they survive here even for someone since removed. */}
          <AssigneeField
            multiple
            value={item.assignees.map((a) => a.id)}
            onChange={(ids) => save({ assignees: ids.map(toAssignee) })}
            readOnly={!canManageDelivery}
            placeholder={t('roadmaps.addAssignee')}
            fallbackNames={fallbackNames(item.assignees)}
            aria-label={t('roadmaps.assignees')}
          />
        </PropField>

        {/* Which bet this belongs to. Sits beside the OKR link because they answer
            the same kind of question — what larger thing is this part of — and
            unlike the OKR the epic is a live pointer, never a copied label. */}
        <PropField label={t('roadmaps.epic')} icon={<Layers />} align="stack">
          {canWrite ? (
            <div className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <Select
                  value={item.epicId || UNGROUPED}
                  onValueChange={(v) => save({ epicId: v })}
                  aria-label={t('roadmaps.epic')}
                  options={[
                    { value: UNGROUPED, label: t('roadmaps.noEpic') },
                    ...epics.map((e) => ({
                      value: e.id,
                      label: <DotLabel color={e.color}>{e.label}</DotLabel>,
                    })),
                  ]}
                />
              </div>
              {/* Same gate as the board's Manage epics — editing an item doesn't
                  make you the person who defines the roadmap's groups. */}
              {canManageDelivery && (
                <button
                  type="button"
                  onClick={() => setEpicsOpen(true)}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t('roadmaps.manageEpics')}
                  title={t('roadmaps.manageEpics')}
                >
                  <Plus className="size-4" />
                </button>
              )}
            </div>
          ) : epic ? (
            <DotLabel color={epic.color}>{epic.label}</DotLabel>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
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

      {/* A backlog item is the other thing a ClickUp task can hang off — same
          panel as an issue's, told which roadmap owns this item because items
          are embedded and the item id alone doesn't locate one. */}
      <ClickUpLinkPanel
        targetType={ClickUpLinkTarget.ROADMAP_ITEM}
        targetId={item.id}
        roadmapId={roadmap.id}
        canWrite={canWrite}
      />
    </>
  );

  // ── Main column ─────────────────────────────────────────────────────────────
  const main = (
    <div className="min-w-0">
      {/* The item's ref, above the title exactly as a task/bug shows its own. */}
      {item.shortId && (
        <span className="mb-1 block font-mono text-xs text-muted-foreground">{item.shortId}</span>
      )}
      <div className="flex items-center gap-2">
        {canWrite ? (
          <input
            key={item.id}
            className={cn(TITLE_FIELD, 'flex-1')}
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
          <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">
            {item.title || t('roadmaps.untitled')}
          </h1>
        )}
        {/* Drawer (no topbar): favourite + ⋯ sit inline in the title row. */}
        {menuTarget === 'header' && favourite}
        {menuTarget === 'header' && overflow}
      </div>

      {/* Standalone route: lift the favourite star + the ⋯ menu up beside the
          breadcrumb (the crumbActions slot), matching task/bug detail. */}
      {menuTarget === 'topbar' &&
        crumbActions &&
        favourite &&
        createPortal(favourite, crumbActions)}
      {menuTarget === 'topbar' && crumbActions && overflow && createPortal(overflow, crumbActions)}

      {/* Drawer (single-column) layout: Properties sit inline under the title, in
          a self-contained band, rather than in a right-hand sidebar. */}
      {dense && <div className="mt-4 flex flex-col gap-5 border-y py-5">{properties}</div>}

      <div className="mt-4">
        {canWrite ? (
          <>
            <DescriptionTemplates
              templates={BACKLOG_TEMPLATES}
              hasContent={seed.hasContent}
              onApply={seed.apply}
            />
            <RichTextEditor
              key={`${item.id}:${seed.nonce}`}
              value={seed.value}
              onChange={saveDescription}
              placeholder={t('roadmaps.description')}
              minHeight={80}
              images
              // A backlog item is where a flow gets described before it's built,
              // so it gets the diagram block too. See IssueDetailMain.
              diagrams
              // `@` names a person here too — a reference in the text, not a ping.
              mentions
              className="border-0"
            />
          </>
        ) : item.description ? (
          <RichText className="text-sm text-muted-foreground" html={item.description} />
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

      {/* Specs, sheets and mockups that belong to this item. Held back from the
          public share view entirely — see `toPublicResponseDto`. */}
      <AttachmentsRow
        items={item.attachments ?? []}
        canWrite={canWrite}
        onChange={(attachments) => save({ attachments })}
        title={t('uploads.files')}
        className="mt-8"
      />

      <TaskPanel
        roadmapId={roadmap.id}
        projectId={roadmap.projectId ?? ''}
        itemId={item.id}
        itemLabel={itemLabel}
      />

      {/* Doc pages written about this item — the other end of a page's
          "Link Task or Doc". Renders nothing when there are none. */}
      <LinkedDocsSection refId={item.id} className="mt-8" />

      {/* ── Activity ─────────────────────────────────────────────────────── */}
      <section className={cn('border-t pt-6', dense ? 'mt-8' : 'mt-10')}>
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
  );

  // Rendered outside the two layouts so both the page and the drawer get it.
  const epicsDialog = epicsOpen && (
    <RoadmapEpicsDialog
      open
      onClose={() => setEpicsOpen(false)}
      roadmapId={roadmap.id}
      epics={epics}
      items={items}
    />
  );

  if (dense)
    return (
      <>
        {main}
        {epicsDialog}
      </>
    );
  return (
    <>
      <DetailGrid>
        {main}
        <PropSidebar>{properties}</PropSidebar>
      </DetailGrid>
      {epicsDialog}
    </>
  );
}
