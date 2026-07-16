import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Input, Select, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { PageHeader } from '@/components/PageHeader';
import { BackLink } from '@/components/BackLink';
import { timeAgo } from '@/lib/format';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_LABEL,
  BugSeverity,
  BugStatus,
  DEFAULT_BUG_STATUSES,
  Role,
} from '@/types/enums';
import type { BugDto } from '@/types/dto';
import { CreateBugDialog } from './components/CreateBugDialog';
import { useBugs, useSetBugStatus } from './api';
import { useBugStatuses } from '@/features/settings/api';

/** Severity → dot color (shadcn semantic tokens). */
const SEVERITY_DOT: Record<BugSeverity, string> = {
  [BugSeverity.LOW]: 'bg-muted-foreground',
  [BugSeverity.MEDIUM]: 'bg-info',
  [BugSeverity.HIGH]: 'bg-warning',
  [BugSeverity.CRITICAL]: 'bg-destructive',
};

export function BugsBoardPage() {
  const { user } = useAuth();
  const canWrite = user?.role === Role.ADMIN || user?.role === Role.TESTER;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const projectId = params.get('projectId') || undefined;
  const projectName = params.get('project') || undefined;
  const caseId = params.get('caseId') || undefined;
  const caseName = params.get('case') || undefined;
  const reportId = params.get('reportId') || undefined;

  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<BugSeverity | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const { data, isLoading } = useBugs({
    search: search || undefined,
    severity: severity || undefined,
    projectId,
    caseId,
  });
  const setStatus = useSetBugStatus();
  const { data: statusConfig } = useBugStatuses();
  const columns = statusConfig?.length ? statusConfig : DEFAULT_BUG_STATUSES;

  const bugs = data?.items ?? [];
  const byStatus = (status: BugStatus) => bugs.filter((b) => b.status === status);

  function onDrop(status: BugStatus) {
    if (dragId) {
      const bug = bugs.find((b) => b.id === dragId);
      if (bug && bug.status !== status) setStatus.mutate({ id: dragId, status });
    }
    setDragId(null);
  }

  return (
    <div>
      {projectId && (
        <BackLink to={`/testing/${projectId}`}>{projectName || t('nav.projects')}</BackLink>
      )}
      <PageHeader
        title={
          caseName
            ? `${t('bugs.forCase')} ${caseName}`
            : projectName
              ? `${t('bugs.title')} — ${projectName}`
              : t('bugs.title')
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          className="sm:max-w-[280px]"
          placeholder={t('bugs.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="sm:w-44">
          <Select
            value={severity}
            onValueChange={(v) => setSeverity(v as BugSeverity | '')}
            options={[
              { value: '', label: t('bugs.allSeverities') },
              ...BUG_SEVERITIES.map((s) => ({ value: s, label: BUG_SEVERITY_LABEL[s] })),
            ]}
          />
        </div>
        {canWrite && (
          <Button className="sm:ml-auto" onClick={() => setCreateOpen(true)}>
            + {t('bugs.new')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid place-items-center rounded-xl border border-dashed p-8">
          <Spinner />
        </div>
      ) : bugs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('bugs.empty')}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3">
          {columns.map((col) => {
            const status = col.key;
            const items = byStatus(status);
            return (
              <div
                key={status}
                className="flex min-h-[120px] min-w-[220px] flex-1 flex-col rounded-xl border bg-muted/40 p-3"
                onDragOver={(e) => canWrite && e.preventDefault()}
                onDrop={() => canWrite && onDrop(status)}
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: col.color }}
                      aria-hidden
                    />
                    {col.label}
                  </span>
                  <Badge variant="muted">{items.length}</Badge>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {items.map((bug: BugDto) => (
                    <article
                      key={bug.id}
                      className="flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-3 text-card-foreground shadow-sm transition-colors hover:border-foreground/20"
                      draggable={canWrite}
                      onDragStart={() => setDragId(bug.id)}
                      onClick={() => navigate(`/bugs/${bug.id}`)}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={cn(
                            'mt-1.5 size-2 shrink-0 rounded-full',
                            SEVERITY_DOT[bug.severity],
                          )}
                          title={BUG_SEVERITY_LABEL[bug.severity]}
                        />
                        <span className="text-[13px] leading-snug">{bug.title}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>{bug.assigneeName || t('bugs.unassigned')}</span>
                        <span>{timeAgo(bug.updatedAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <CreateBugDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          defaultProjectId={projectId}
          defaultCaseId={caseId}
          defaultCaseLabel={caseName}
          defaultReportId={reportId}
        />
      )}
    </div>
  );
}
