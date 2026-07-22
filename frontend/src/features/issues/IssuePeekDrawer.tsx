import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Drawer, Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { TeamIssueType } from '@/types/enums';

// Lazy so the sub-task → task-detail → sub-task chain never forms a *static*
// import cycle: TaskDetail renders SubtaskSection, which opens this drawer, which
// renders TaskDetail. Loading the detail on demand keeps the graph acyclic.
const BugDetail = lazy(() =>
  import('@/features/bugs/components/BugDetail').then((m) => ({ default: m.BugDetail })),
);
const TaskDetail = lazy(() =>
  import('@/features/tasks/components/TaskDetail').then((m) => ({ default: m.TaskDetail })),
);

export interface IssuePeek {
  /** Resolved uuid of the issue to preview. */
  id: string;
  /** Which detail to render — a bug's team vs a task's. */
  issueType: TeamIssueType;
  /** Where "open full page" navigates (the shortId route when available). */
  href: string;
}

/**
 * A right-side slide-over previewing a bug or task in place — opened from a
 * sub-task row so you can read or edit it without leaving the parent. Renders the
 * same embeddable detail the full route shows (in `menuTarget="header"` mode, so
 * its ⋯ menu + favourite stay inside the panel), with an "open full page" link in
 * the header for when you want the whole route.
 */
export function IssuePeekDrawer({ peek, onClose }: { peek: IssuePeek | null; onClose: () => void }) {
  if (!peek) return null;
  const isBug = peek.issueType === TeamIssueType.BUG;
  return (
    <Drawer
      open
      onClose={onClose}
      title={t('common.details')}
      headerActions={
        <Link
          to={peek.href}
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          {t('common.openFull')}
        </Link>
      }
    >
      <Suspense
        fallback={
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        }
      >
        {isBug ? (
          <BugDetail bugId={peek.id} onDeleted={onClose} menuTarget="header" />
        ) : (
          <TaskDetail taskId={peek.id} onDeleted={onClose} menuTarget="header" />
        )}
      </Suspense>
    </Drawer>
  );
}
