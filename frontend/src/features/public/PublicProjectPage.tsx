import { useParams } from 'react-router-dom';
import { Badge, Spinner, type BadgeProps } from '@/components/ui';
import { t } from '@/i18n';
import {
  FEATURE_STATUS_LABEL,
  FeatureStatus,
  SectionType,
} from '@/types/enums';
import type { ReportSection, TestingSection } from '@/types/dto';
import { SectionBlock } from '@/features/reports/components/SectionBlock';
import { TestingTable } from '@/features/reports/components/TestingTable';
import { EnvironmentBadge } from '@/features/projects/components/EnvironmentBadge';
import { ThemeToggle } from '@/components/ThemeToggle';
import { usePublicProject } from './api';

const noop = () => {};

const STATUS_VARIANT: Record<FeatureStatus, BadgeProps['variant']> = {
  [FeatureStatus.TESTING]: 'warning',
  [FeatureStatus.DONE]: 'success',
  [FeatureStatus.INFO]: 'muted',
};

export function PublicProjectPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = usePublicProject(token);

  if (isLoading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background p-6">
        <Spinner />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background p-6 text-muted-foreground">
        {t('public.notAvailable')}
      </div>
    );
  }

  const { project, reports } = data;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4 sm:px-6">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
          <span className="text-primary">◑</span> product-hub
        </span>
        <div className="flex items-center gap-3">
          <Badge variant="muted">{t('public.viewOnly')}</Badge>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
            <EnvironmentBadge env={project.environment} />
          </div>
          {project.subtitle && (
            <p className="mt-1 text-sm text-muted-foreground">{project.subtitle}</p>
          )}
        </div>

        {reports.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {t('project.noFeatures')}
          </div>
        ) : (
          reports.map((report) => (
            <section
              key={report.id}
              className="mb-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight">{report.title}</h2>
                <Badge variant={STATUS_VARIANT[report.statusVariant]}>
                  {FEATURE_STATUS_LABEL[report.statusVariant]}
                </Badge>
              </div>
              <div className="flex flex-col gap-6">
                {(report.sections ?? []).map((section: ReportSection) =>
                  section.type === SectionType.TESTING ? (
                    <TestingTable
                      key={section.id}
                      section={section as TestingSection}
                      canWrite={false}
                      onSetResult={noop}
                      onChangeSection={noop}
                      onImport={noop}
                    />
                  ) : (
                    <SectionBlock
                      key={section.id}
                      section={section}
                      canWrite={false}
                      onChange={noop}
                      onDelete={noop}
                      onMoveUp={noop}
                      onMoveDown={noop}
                    />
                  ),
                )}
              </div>
            </section>
          ))
        )}

        <footer className="mt-8 text-center text-xs text-muted-foreground">
          {t('public.poweredBy')}
        </footer>
      </main>
    </div>
  );
}
