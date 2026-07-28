import { useParams } from 'react-router-dom';
import { DetailSkeleton } from '@/components/Skeletons';
import { CenteredPageLayout } from '@/layouts/shared';
import { IssueKind } from '@/types/enums';
import { BugDetailPage } from '@/features/bugs/BugDetailPage';
import { TaskDetailPage } from '@/features/tasks/TaskDetailPage';
import { useIssue } from './api';

/**
 * Every ref we mint names its own kind — `BUG-WHHY3ZV`, `TSK-6HCUHKX` — so the
 * right page renders immediately, with no lookup and no skeleton flash. Only a
 * bare-UUID link (a row from before refs, or someone pasting an internal id)
 * says nothing, and that one asks the API.
 */
function kindFromRef(ref: string): IssueKind | undefined {
  const prefix = ref.slice(0, 4).toUpperCase();
  if (prefix === 'BUG-') return IssueKind.BUG;
  if (prefix === 'TSK-') return IssueKind.TASK;
  return undefined;
}

/**
 * One detail URL for both kinds: `/issues/TSK-Y8HH6RY`, `/issues/BUG-3`. A ref
 * identifies an issue on its own, so the URL never had to carry the kind — and
 * making it carry one meant every link site had to branch on `issue.kind` first,
 * with a bug chip pointing at `/tasks/…` the standing bug. This resolves the kind
 * once, here, and renders that kind's page. (`/tasks/:ref` and `/bugs/:ref` still
 * redirect here, so older links and bookmarks keep working.)
 */
export function IssueDetailPage() {
  const { issueRef = '' } = useParams<{ issueRef: string }>();
  const known = kindFromRef(issueRef);
  // Skipped entirely when the ref already told us (`enabled: !!id`).
  const { data: issue, isLoading } = useIssue(known ? undefined : issueRef);
  const kind = known ?? issue?.kind;

  if (!kind && isLoading) {
    return (
      <CenteredPageLayout>
        <DetailSkeleton />
      </CenteredPageLayout>
    );
  }

  // A ref that resolves to nothing falls through to the task page, whose own
  // "not found" state is the right answer for a dead link of either kind.
  return kind === IssueKind.BUG ? (
    <BugDetailPage issueRef={issueRef} />
  ) : (
    <TaskDetailPage issueRef={issueRef} />
  );
}
