import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { CardGridSkeleton, ListSkeleton } from '@/components/Skeletons';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { Icon, type IconName } from '@/components/Icon';
import { ProgressBar, buttonVariants } from '@/components/ui';
import { localeTag, t } from '@/i18n';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  BugStatus,
  InboxKind,
  IssueKind,
  ROADMAP_PHASE_LABEL,
  ROADMAP_PHASES,
  TaskStatus,
} from '@/types/enums';
import type { InboxItemDto, IssueDto } from '@/types/dto';
import { ProjectCard } from '@/features/projects/components/ProjectCard';
import { useProjects } from '@/features/projects/api';
import { useProjectStats } from '@/features/reports/api';
import { useBugs } from '@/features/bugs/api';
import { useIssues } from '@/features/issues/api';
import { useRoadmaps } from '@/features/roadmaps/api';
import { useMilestones } from '@/features/milestones/api';
import { useInbox } from '@/features/inbox/api';
import { CenteredPageLayout } from '@/layouts/shared';

const CARD_GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]';
/** A panel body: the same card as everywhere else, with its rows divided inside. */
const PANEL = 'divide-y overflow-hidden rounded-xl border bg-card text-card-foreground';
const ROW = 'flex gap-3 px-4 py-3 transition-colors hover:bg-accent';

/** Statuses that mean "off my plate" — a task's Done, a bug's Resolved/Closed.
 *  A team's custom columns are its own words, so anything else counts as open. */
const TERMINAL: ReadonlySet<string> = new Set([
  TaskStatus.DONE,
  BugStatus.RESOLVED,
  BugStatus.CLOSED,
]);

/** Local calendar day (YYYY-MM-DD), string-compared to an issue's date so
 *  timezones never shift the boundary. `en-CA` is the ISO shape, not a language. */
const todayStr = () => new Date().toLocaleDateString('en-CA');
/** `endDate` is the truth; `dueDate` is the legacy task mirror, read as a fallback. */
const dueDay = (issue: IssueDto) => (issue.endDate || issue.dueDate || '').slice(0, 10);
const formatDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(localeTag(), { month: 'short', day: 'numeric' });

interface StatTile {
  to: string;
  icon: IconName;
  value: number;
  label: string;
  /** Draw the count in the overdue tone once there's something to act on. */
  alert?: boolean;
}

/**
 * Home — the page you land on. It answers "what needs me today?" first and
 * "what's going on?" second, so the layout runs:
 *   greeting → focus counters → my work (wide) beside what's new (rail) → projects.
 * Every panel summarises a real view and links out to it; nothing lives only here.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const today = todayStr();

  const { data: projectData, isLoading } = useProjects({ limit: 100 });
  const projects = projectData?.items ?? [];
  const recent = projects.slice(0, 4);
  const { data: statsList } = useProjectStats(recent.map((p) => p.id));
  const statsById = new Map((statsList ?? []).map((s) => [s.projectId, s]));

  // Everything assigned to me, both kinds — a bug on my plate is my work too.
  const { data: mineData, isLoading: mineLoading } = useIssues({ mine: user?.id ?? '__none__' });
  const { data: bugData } = useBugs();
  const openBugs = (bugData?.items ?? []).filter((b) => !TERMINAL.has(b.status)).length;
  const { data: roadmaps } = useRoadmaps();
  const { data: milestones } = useMilestones();
  const { data: inbox } = useInbox();

  const { focus, upNext, overdueCount, todayCount, openCount } = useMemo(() => {
    const open = (mineData?.items ?? []).filter((i) => !TERMINAL.has(i.status));
    const due = open.filter((i) => dueDay(i) && dueDay(i) <= today);
    const dueIds = new Set(due.map((i) => i.id));
    return {
      focus: [...due].sort((a, b) => (dueDay(a) < dueDay(b) ? -1 : 1)).slice(0, 6),
      // Undated and future work, soonest first — so the panel is never dead just
      // because nothing happens to be due right now.
      upNext: open
        .filter((i) => !dueIds.has(i.id))
        .sort((a, b) => {
          const da = dueDay(a) || '9999-99-99';
          const db = dueDay(b) || '9999-99-99';
          return da === db ? b.updatedAt.localeCompare(a.updatedAt) : da < db ? -1 : 1;
        })
        .slice(0, 6),
      overdueCount: due.filter((i) => dueDay(i) < today).length,
      todayCount: due.filter((i) => dueDay(i) === today).length,
      openCount: open.length,
    };
  }, [mineData, today]);

  const tiles: StatTile[] = [
    {
      to: '/issues/today',
      icon: 'calendar',
      value: overdueCount,
      label: t('tasks.overdue'),
      alert: overdueCount > 0,
    },
    { to: '/issues/today', icon: 'checks', value: todayCount, label: t('tasks.dueToday') },
    { to: '/issues/me', icon: 'tasks', value: openCount, label: t('nav.assignedToMe') },
    { to: '/bugs', icon: 'bug', value: openBugs, label: t('home.statBugs') },
    { to: '/inbox', icon: 'inbox', value: inbox?.unseenCount ?? 0, label: t('home.statInbox') },
  ];

  const inboxItems = (inbox?.items ?? []).slice(0, 4);
  const topRoadmaps = (roadmaps ?? []).slice(0, 3);
  const topOkrs = (milestones ?? []).slice(0, 3);

  return (
    <CenteredPageLayout>
      {/* The crumb names the page; the greeting is content, not identity — a
          breadcrumb reading "Welcome back, Tester" tells you nothing about
          where you are. */}
      <PageHeader
        title={t('nav.home')}
        subtitle={t('home.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/bugs/new" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              {t('bugs.new')}
            </Link>
            <Link to="/tasks/new" className={buttonVariants({ size: 'sm' })}>
              {t('tasks.new')}
            </Link>
          </div>
        }
      />

      <div className="mb-6">
        <p className="text-2xl font-semibold tracking-tight">
          {t('home.greeting')}
          {user ? `, ${user.name}` : ''}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date().toLocaleDateString(localeTag(), {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </div>

      {/* Focus counters. Every one is something on my plate and links to the view
          that lists it — laid out on a row so they read as a status strip rather
          than five destinations. */}
      <div className="mb-8 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            to={tile.to}
            className="flex items-center gap-3 rounded-xl border bg-card p-3 text-card-foreground transition-colors hover:border-foreground/20"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-foreground">
              <Icon name={tile.icon} size={18} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  'text-xl font-semibold leading-none tracking-tight tabular-nums',
                  tile.alert && 'text-destructive',
                )}
              >
                {tile.value}
              </span>
              <span className="mt-1 truncate text-[13px] text-muted-foreground">{tile.label}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* My work (wide) beside what's new (rail); one column below lg. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel label={t('tasks.today')} to="/issues/today">
            {mineLoading ? (
              <ListSkeleton rows={3} />
            ) : focus.length === 0 ? (
              <EmptyPanel>{t('tasks.noneToday')}</EmptyPanel>
            ) : (
              <div className={PANEL}>
                {focus.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} overdue={dueDay(issue) < today} />
                ))}
              </div>
            )}
          </Panel>

          <Panel label={t('nav.assignedToMe')} to="/issues/me">
            {mineLoading ? (
              <ListSkeleton rows={4} />
            ) : upNext.length === 0 ? (
              <EmptyPanel>{t('tasks.none')}</EmptyPanel>
            ) : (
              <div className={PANEL}>
                {upNext.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} />
                ))}
              </div>
            )}
          </Panel>

          {/* Projects sit under my work rather than in the rail: the card carries
              a progress bar and three counts, which a ~380px rail would squeeze —
              and it's what balances the two columns' heights. */}
          <Panel label={t('home.recentProjects')} to="/testing">
            {isLoading ? (
              <CardGridSkeleton cards={2} />
            ) : recent.length === 0 ? (
              <EmptyPanel>{t('home.noProjects')}</EmptyPanel>
            ) : (
              <div className={CARD_GRID}>
                {recent.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    canWrite={false}
                    canArchive={false}
                    stats={statsById.get(p.id)}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel label={t('inbox.title')} to="/inbox">
            {inboxItems.length === 0 ? (
              <EmptyPanel>{t('inbox.empty')}</EmptyPanel>
            ) : (
              <div className={PANEL}>
                {inboxItems.map((item) => (
                  <InboxRow key={`${item.kind}-${item.id}`} item={item} />
                ))}
              </div>
            )}
          </Panel>

          <Panel label={t('home.statRoadmaps')} to="/roadmaps">
            {topRoadmaps.length === 0 ? (
              <EmptyPanel>{t('roadmaps.empty')}</EmptyPanel>
            ) : (
              <div className={PANEL}>
                {topRoadmaps.map((r) => (
                  <Link key={r.id} to={`/roadmaps/${r.id}`} className={cn(ROW, 'flex-col gap-1.5')}>
                    <span className="truncate text-sm font-medium">{r.title}</span>
                    {r.items && r.items.length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {ROADMAP_PHASES.map((ph) => {
                          const n = r.items.filter((i) => i.phase === ph).length;
                          return n > 0 ? (
                            <span
                              key={ph}
                              className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {n} {ROADMAP_PHASE_LABEL[ph].toLowerCase()}
                            </span>
                          ) : null;
                        })}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {r.itemCount} {t('roadmaps.items')}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel label={t('home.statMilestones')} to="/okrs">
            {topOkrs.length === 0 ? (
              <EmptyPanel>{t('milestones.empty')}</EmptyPanel>
            ) : (
              <div className={PANEL}>
                {topOkrs.map((m) => (
                  <Link key={m.id} to={`/okrs/${m.id}`} className={cn(ROW, 'flex-col gap-2')}>
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.title}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {Math.round(m.progress)}%
                      </span>
                    </span>
                    <ProgressBar value={m.progress} className="h-1.5" />
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </CenteredPageLayout>
  );
}

/** A titled block: the section label on the left, its "View all" on the right. */
function Panel({
  label,
  to,
  children,
}: {
  label: string;
  to: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </h2>
        <Link
          className="shrink-0 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          to={to}
        >
          {t('home.viewAll')} →
        </Link>
      </div>
      {children}
    </section>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** One issue on my plate: kind glyph, title, its date (red once overdue), ref. */
function IssueRow({ issue, overdue }: { issue: IssueDto; overdue?: boolean }) {
  const day = dueDay(issue);
  return (
    <Link to={`/issues/${issue.shortId || issue.id}`} className={cn(ROW, 'items-center py-2.5')}>
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon name={issue.kind === IssueKind.BUG ? 'bug' : 'tasks'} size={13} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
      {day && (
        <span
          className={cn(
            'shrink-0 text-[11px] tabular-nums',
            overdue ? 'font-medium text-destructive' : 'text-muted-foreground',
          )}
        >
          {formatDay(day)}
        </span>
      )}
      {issue.shortId && (
        <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
          {issue.shortId}
        </span>
      )}
    </Link>
  );
}

/** One notification. Doc mentions open the doc; everything else opens the inbox
 *  focused on that item — the same targets the inbox itself navigates to. */
function InboxRow({ item }: { item: InboxItemDto }) {
  const to =
    item.kind === InboxKind.DOC_MENTION
      ? `/docs/${item.refId}`
      : `/inbox?item=${encodeURIComponent(item.refId)}`;
  return (
    <Link to={to} className={cn(ROW, 'items-start')}>
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
        aria-hidden
      >
        {(item.actorName || '?').charAt(0).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
          {!item.seen && <span className="size-2 shrink-0 rounded-full bg-primary" />}
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {timeAgo(item.createdAt)}
          </span>
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {item.actorName}{' '}
          {item.kind === InboxKind.ASSIGNED_BUG
            ? t('inbox.assignedYou')
            : item.kind === InboxKind.DOC_MENTION
              ? t('inbox.mentionedYouDoc')
              : t('inbox.mentionedYou')}
        </span>
      </span>
    </Link>
  );
}
