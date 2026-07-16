import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { Icon, type IconName } from '@/components/Icon';
import { t } from '@/i18n';
import { BugStatus, ROADMAP_PHASE_LABEL, ROADMAP_PHASES } from '@/types/enums';
import { ProjectCard } from '@/features/projects/components/ProjectCard';
import { useProjects } from '@/features/projects/api';
import { useProjectStats } from '@/features/reports/api';
import { useBugs } from '@/features/bugs/api';
import { useRoadmaps } from '@/features/roadmaps/api';
import { useMilestones } from '@/features/milestones/api';
import { useInbox } from '@/features/inbox/api';

interface StatTile {
  to: string;
  icon: IconName;
  value: number;
  label: string;
}

const CARD_GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]';

export function DashboardPage() {
  const { user } = useAuth();

  const { data: projectData, isLoading } = useProjects({ limit: 100 });
  const projects = projectData?.items ?? [];
  const recent = projects.slice(0, 4);
  const { data: statsList } = useProjectStats(recent.map((p) => p.id));
  const statsById = new Map((statsList ?? []).map((s) => [s.projectId, s]));

  const { data: bugData } = useBugs();
  const openBugs = (bugData?.items ?? []).filter(
    (b) => b.status !== BugStatus.RESOLVED && b.status !== BugStatus.CLOSED,
  ).length;
  const { data: roadmaps } = useRoadmaps();
  const { data: milestones } = useMilestones();
  const { data: inbox } = useInbox();

  const tiles: StatTile[] = [
    { to: '/projects', icon: 'projects', value: projects.length, label: t('home.statProjects') },
    { to: '/bugs', icon: 'bug', value: openBugs, label: t('home.statBugs') },
    { to: '/roadmaps', icon: 'roadmap', value: (roadmaps ?? []).length, label: t('home.statRoadmaps') },
    { to: '/milestones', icon: 'milestone', value: (milestones ?? []).length, label: t('home.statMilestones') },
    { to: '/inbox', icon: 'inbox', value: inbox?.unseenCount ?? 0, label: t('home.statInbox') },
  ];

  return (
    <div>
      <PageHeader
        title={`${t('home.greeting')}${user ? `, ${user.name}` : ''}`}
        subtitle={t('home.subtitle')}
      />

      <div className="mb-8 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        {tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="flex flex-col gap-0.5 rounded-xl border bg-card p-4 text-card-foreground transition-colors hover:border-foreground/20"
          >
            <span className="mb-2 grid size-9 place-items-center rounded-md bg-muted text-foreground">
              <Icon name={tile.icon} size={18} />
            </span>
            <span className="text-2xl font-semibold tracking-tight">{tile.value}</span>
            <span className="text-[13px] text-muted-foreground">{tile.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent projects */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('home.recentProjects')}
          </h2>
          <Link
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
            to="/projects"
          >
            {t('home.viewAll')} →
          </Link>
        </div>
        {isLoading ? (
          <div className="grid place-items-center rounded-xl border border-dashed p-8">
            <Spinner />
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {t('home.noProjects')}
          </div>
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
      </section>

      {/* Roadmaps */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('dashboard.roadmaps')}
          </h2>
          <Link
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
            to="/roadmaps"
          >
            {t('home.viewAll')} →
          </Link>
        </div>
        {(roadmaps ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {t('roadmaps.empty')}
          </div>
        ) : (
          <div className={CARD_GRID}>
            {(roadmaps ?? []).slice(0, 4).map((r) => (
              <Link
                key={r.id}
                to={`/roadmaps/${r.id}`}
                className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground transition-colors hover:border-foreground/20"
              >
                <h3 className="font-medium">{r.title}</h3>
                {r.items && r.items.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
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
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {r.itemCount} {t('roadmaps.items')}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
