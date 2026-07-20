import { Dialog, DotLabel } from '@/components/ui';
import { t } from '@/i18n';
import { IssueDetailMain } from '@/features/issues/IssueDetailMain';
import { BUG_SEVERITY_COLOR, BUG_SEVERITY_LABEL, TeamIssueType } from '@/types/enums';
import type { TeamStatusConfig } from '@/types/enums';
import type { BugDto, TaskDto } from '@/types/dto';
import { usePublicIssueComments } from './api';

const noop = () => {};

/** Read-only bug/task detail opened from a public team board — the shared
 * `IssueDetailMain` in read-only mode, fed comments from the public endpoint so
 * it never touches an authed route. */
export function PublicIssueDialog({
  token,
  issueType,
  item,
  columns,
  onClose,
}: {
  token: string;
  issueType: TeamIssueType;
  item: BugDto | TaskDto;
  columns: TeamStatusConfig[];
  onClose: () => void;
}) {
  const isBug = issueType === TeamIssueType.BUG;
  const bug = isBug ? (item as BugDto) : null;
  const { data: comments } = usePublicIssueComments(token, item.id);
  const col = columns.find((c) => c.key === item.status);

  return (
    <Dialog
      open
      onClose={onClose}
      title={item.shortId || item.title}
      className="max-w-2xl"
      fullscreenKey="public-issue"
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {col && <DotLabel color={col.color}>{col.label}</DotLabel>}
        {bug && (
          <DotLabel color={BUG_SEVERITY_COLOR[bug.severity]}>
            {BUG_SEVERITY_LABEL[bug.severity]}
          </DotLabel>
        )}
        <span className="text-muted-foreground">{item.assigneeName || t('tasks.unassigned')}</span>
      </div>
      <IssueDetailMain
        key={item.id}
        subject={isBug ? 'bug' : 'task'}
        issueId={item.id}
        title={item.title}
        titlePlaceholder=""
        description={item.description}
        descriptionPlaceholder="—"
        createdByName={bug ? bug.reporterName : (item as TaskDto).createdByName}
        createdAt={item.createdAt}
        createdLabel={isBug ? t('bugs.reportedThis') : t('tasks.createdThis')}
        canWrite={false}
        isAdmin={false}
        users={[]}
        comments={comments ?? []}
        onSaveTitle={noop}
        onSaveDescription={noop}
      />
    </Dialog>
  );
}
