import { useMemo, useState } from 'react';
import { ChartLine, ChevronLeft, ChevronRight, Folder, Target } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Drawer,
  ProgressBar,
  SaveButton,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { CycleStatus } from '@/types/enums';
import type { CycleBurndownDto, CycleBurndownGroup, CycleDto, TeamDto } from '@/types/dto';
import { useProjects } from '@/features/projects/api';
import { useCycleBurndown, useCycles, useFocusedCycle, useUpdateCycle } from './api';
import { cycleName, cycleStatusBadge, cycleTimeHint, shortDay } from './dates';
import { CycleBurnupChart, StatSwatch } from './CycleBurnupChart';
import { CycleIcon } from './CycleIcon';

const SCOPE_INK = 'hsl(var(--muted-foreground))';

/**
 * The team board's "cycle insights" toggle — the button that opens the burn-up
 * drawer. Its home is the **cycle bar** (`CycleBoardBanner`), immediately left of
 * that bar's "All cycles" chip, so insights sits with the cycle it reports on.
 * The bar only exists when the board is scoped to one cycle, so the boards also
 * render this in the toolbar's `filtersEnd` cluster when there's no bar —
 * exactly one is on screen at a time. Renders nothing unless the team runs
 * cycles and has at least one, so non-cycle boards are untouched.
 *
 * The drawer opens on the board's currently-focused cycle (the `?cycle=` scope),
 * falling back to the active one; from there its own `‹ ›` steps through history.
 */
export function CycleInsightsButton({
  team,
  cycleParam = '',
  className,
}: {
  team: TeamDto | undefined;
  cycleParam?: string;
  /** Sizing for the surface it sits on (the cycle bar matches its chips). */
  className?: string;
}) {
  const enabled = !!team?.cyclesEnabled;
  const { data: cycles } = useCycles(enabled ? team?.id : undefined);
  const focused = useFocusedCycle(team, cycleParam);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');

  if (!enabled || !cycles?.length) return null;

  const openDrawer = () => {
    setSelectedId(
      focused?.id ??
        cycles.find((c) => c.status === CycleStatus.ACTIVE)?.id ??
        cycles[0]?.id ??
        '',
    );
    setOpen(true);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Outline + shrink-0: it always sits beside the bordered "All cycles"
              control, so it has to keep that weight and its full hit area when
              the row gets tight. */}
          <Button
            variant="outline"
            size="icon"
            className={cn('shrink-0', className)}
            aria-label={t('cycles.insights.open')}
            onClick={openDrawer}
          >
            <ChartLine className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('cycles.insights.open')}</TooltipContent>
      </Tooltip>
      <CycleInsightsDrawer
        open={open}
        onClose={() => setOpen(false)}
        team={team!}
        cycles={cycles}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    </>
  );
}

/**
 * The drawer itself — the burn-up plus the cycle's goal editor. Exported because
 * the cycles page opens it too (a row's goal strip), so the goal has exactly one
 * editor no matter where you reach it from.
 */
export function CycleInsightsDrawer({
  open,
  onClose,
  team,
  cycles,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  team: TeamDto;
  cycles: CycleDto[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { data, isLoading, isError } = useCycleBurndown(team.id, selectedId || undefined, open);

  const current = cycles.find((c) => c.id === selectedId);
  // Cycles are newest-first: the past sits at the next index, the future at the
  // previous — `‹` steps back in time, `›` forward (mirrors the board banner).
  const idx = cycles.findIndex((c) => c.id === selectedId);
  const newer = idx > 0 ? cycles[idx - 1] : undefined;
  const older = idx >= 0 && idx < cycles.length - 1 ? cycles[idx + 1] : undefined;
  const badge = current ? cycleStatusBadge(current.status) : undefined;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      widthClassName="sm:max-w-2xl"
      title={t('cycles.insights.title')}
      headerActions={
        <div className="flex items-center gap-2 pl-1">
          <CycleIcon className="text-muted-foreground" />
          <span className="text-sm font-semibold">{current ? cycleName(current) : ''}</span>
          {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
        </div>
      }
    >
      {/* Date window + the cycle stepper */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {current && (
            <>
              {shortDay(current.startDate)} → {shortDay(current.endDate)}
              {cycleTimeHint(current) && (
                <span className="ml-1.5 whitespace-nowrap text-xs">· {cycleTimeHint(current)}</span>
              )}
            </>
          )}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            disabled={!older}
            onClick={() => older && onSelect(older.id)}
            aria-label={t('cycles.prevCycle')}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            disabled={!newer}
            onClick={() => newer && onSelect(newer.id)}
            aria-label={t('cycles.nextCycle')}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* The cycle's goal (sprint goal) — a plain-text note, independent of the
          burn-up below, so it shows even for an empty or still-loading cycle.
          Keyed by cycle id so switching cycles reseeds the draft from that one. */}
      {current && <CycleGoal key={current.id} team={team} cycle={current} />}

      {isLoading ? (
        <div className="grid place-items-center rounded-xl border border-dashed p-10">
          <Spinner />
        </div>
      ) : isError || !data ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t('cycles.insights.error')}
        </div>
      ) : data.scopeCount === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="font-medium">{t('cycles.insights.empty')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('cycles.insights.emptyHint')}</p>
        </div>
      ) : (
        <>
          <StatisticsRow data={data} />
          <div className="mt-5">
            <CycleBurnupChart data={data} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('cycles.insights.caveat')}</p>
          <BreakdownTabs data={data} />
        </>
      )}
    </Drawer>
  );
}

/**
 * A cycle's goal / notes — the Scrum "sprint goal". Plain text, saved on its own
 * (independent of the rhythm config) via `PATCH /teams/:id/cycles/:id`. Delivery
 * managers (Admin & Product) get an inline editor with the shared SaveButton;
 * everyone else sees the text read-only. Mounted keyed by cycle id, so the draft
 * always seeds from the cycle in view. The goal is lost on a rhythm rebuild —
 * called out in the hint so it's an expectation, not a surprise.
 */
function CycleGoal({ team, cycle }: { team: TeamDto; cycle: CycleDto }) {
  const { canManageDelivery } = useAuth();
  const update = useUpdateCycle();
  const saved = cycle.description ?? '';
  const [draft, setDraft] = useState(saved);
  const dirty = draft.trim() !== saved;

  const heading = (
    <div className="mb-2 flex items-center gap-1.5">
      <Target className="size-4 text-muted-foreground" aria-hidden />
      <h3 className="text-sm font-medium">{t('cycles.goal.title')}</h3>
    </div>
  );

  if (!canManageDelivery) {
    return (
      <section className="mb-5">
        {heading}
        {saved ? (
          <p className="whitespace-pre-wrap text-sm">{saved}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('cycles.goal.empty')}</p>
        )}
      </section>
    );
  }

  return (
    <section className="mb-5">
      {heading}
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t('cycles.goal.placeholder')}
        maxLength={2000}
        rows={2}
        className="resize-y"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{t('cycles.goal.hint')}</span>
        <SaveButton
          size="sm"
          disabled={!dirty}
          onSave={() =>
            update.mutateAsync({
              teamId: team.id,
              cycleId: cycle.id,
              description: draft.trim() || null,
            })
          }
        >
          {t('cycles.goal.save')}
        </SaveButton>
      </div>
    </section>
  );
}

/** Scope / Started / Completed — the swatches double as the chart's legend. */
function StatisticsRow({ data }: { data: CycleBurndownDto }) {
  const points = data.unit === 'points';
  const scope = points ? data.scopePoints : data.scopeCount;
  const started = points ? data.startedPoints : data.startedCount;
  const completed = points ? data.completedPoints : data.completedCount;
  const pct = (v: number) => (scope ? Math.round((v / scope) * 100) : 0);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">{t('cycles.insights.statistics')}</h3>
        <span className="text-xs text-muted-foreground">
          {points ? t('cycles.insights.inPoints') : t('cycles.insights.inIssues')}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat color={SCOPE_INK} label={t('cycles.insights.scope')} value={scope} />
        <Stat
          color={data.startedColor || '#2563eb'}
          label={t('cycles.insights.started')}
          value={started}
          pct={pct(started)}
        />
        <Stat
          color={data.completedColor || '#16a34a'}
          label={t('cycles.insights.completed')}
          value={completed}
          pct={pct(completed)}
        />
      </div>
    </div>
  );
}

function Stat({
  color,
  label,
  value,
  pct,
}: {
  color: string;
  label: string;
  value: number;
  pct?: number;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 text-card-foreground">
      <div className="flex items-center gap-1.5">
        <StatSwatch color={color} />
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {pct != null && <span className="text-xs tabular-nums text-muted-foreground">· {pct}%</span>}
      </div>
    </div>
  );
}

/** Assignees / Labels / Projects — a current snapshot per bucket. */
function BreakdownTabs({ data }: { data: CycleBurndownDto }) {
  const { data: projectsData } = useProjects({ limit: 100 });
  const projectTitle = useMemo(() => {
    const m = new Map<string, string>();
    (projectsData?.items ?? []).forEach((p) => m.set(p.id, p.title));
    return m;
  }, [projectsData]);

  return (
    <div className="mt-5">
      <Tabs defaultValue="assignees">
        <TabsList>
          <TabsTrigger value="assignees">{t('cycles.insights.assignees')}</TabsTrigger>
          <TabsTrigger value="labels">{t('cycles.insights.labels')}</TabsTrigger>
          <TabsTrigger value="projects">{t('cycles.insights.projects')}</TabsTrigger>
        </TabsList>
        <TabsContent value="assignees">
          <GroupList groups={data.assignees} unit={data.unit} kind="assignee" />
        </TabsContent>
        <TabsContent value="labels">
          <GroupList groups={data.labels} unit={data.unit} kind="label" />
        </TabsContent>
        <TabsContent value="projects">
          <GroupList
            groups={data.projects}
            unit={data.unit}
            kind="project"
            resolve={(g) => projectTitle.get(g.key)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GroupList({
  groups,
  unit,
  kind,
  resolve,
}: {
  groups: CycleBurndownGroup[];
  unit: 'points' | 'count';
  kind: 'assignee' | 'label' | 'project';
  resolve?: (g: CycleBurndownGroup) => string | undefined;
}) {
  if (!groups.length) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted-foreground">
        {t('cycles.insights.noBreakdown')}
      </p>
    );
  }

  const noneLabel =
    kind === 'assignee'
      ? t('cycles.insights.noAssignee')
      : kind === 'label'
        ? t('cycles.insights.noLabel')
        : t('cycles.insights.noProject');

  return (
    <div className="rounded-xl border bg-card">
      {groups.map((g) => {
        const total = unit === 'points' ? g.points : g.count;
        const done = unit === 'points' ? g.completedPoints : g.completedCount;
        const name = (kind === 'project' ? resolve?.(g) : g.label) || (g.key ? g.label || g.key : noneLabel);
        return (
          <div
            key={g.key || '__none__'}
            className="flex items-center gap-3 px-3 py-2.5 [&:not(:last-child)]:border-b"
          >
            <GroupLeading kind={kind} name={name} color={g.color} muted={!g.key} />
            <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
            <ProgressBar
              value={total ? (done / total) * 100 : 0}
              className="hidden h-1.5 w-16 shrink-0 sm:block"
            />
            <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums">{total}</span>
          </div>
        );
      })}
    </div>
  );
}

function GroupLeading({
  kind,
  name,
  color,
  muted,
}: {
  kind: 'assignee' | 'label' | 'project';
  name: string;
  color: string;
  muted: boolean;
}) {
  if (kind === 'assignee') {
    return (
      <Avatar className="size-6">
        <AvatarFallback className={cn('text-[10px]', muted && 'text-muted-foreground')}>
          {muted ? '—' : initials(name)}
        </AvatarFallback>
      </Avatar>
    );
  }
  if (kind === 'label') {
    return (
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: color || 'hsl(var(--muted-foreground))' }}
        aria-hidden
      />
    );
  }
  return <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
}

/** Up to two initials from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
