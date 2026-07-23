import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CalendarRange, LayoutGrid, List } from 'lucide-react';
import { Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { BOARD_GUTTER, ViewTabs } from '@/components/IssueBoardLayout';
import { KanbanBoard } from '@/components/KanbanBoard';
import { BugCard, BugList } from '@/features/bugs/BugsBoardPage';
import { TaskCard, TaskList } from '@/features/tasks/MyTasksPage';
import { IssueTimelineView } from '@/features/issues/IssueTimelineView';
import { TeamIssueType } from '@/types/enums';
import type { BugDto, TaskDto } from '@/types/dto';
import { usePublicTeamBoard } from './api';
import { PublicShell } from './PublicShell';
import { PublicIssueDialog } from './PublicIssueDialog';

const noop = () => {};

type TeamView = 'board' | 'list' | 'timeline';

/**
 * A team board (tasks or bugs) shared read-only. Branches the card by the
 * team's issue type and reuses the same `BugCard`/`TaskCard`, and — like the
 * authenticated board — offers List and Timeline alongside Board. This is a
 * single team, so the status/label lookups the internal views normally fetch
 * per-row are just `team.statuses`/`team.labels` handed in directly.
 */
export function PublicTeamBoardPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = usePublicTeamBoard(token);
  const [openItem, setOpenItem] = useState<BugDto | TaskDto | null>(null);

  // Board is the default and kept out of the URL; ?view=list|timeline survive
  // reloads and are shareable (same pattern as the authenticated board).
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const view: TeamView = viewParam === 'list' ? 'list' : viewParam === 'timeline' ? 'timeline' : 'board';
  const setView = (v: TeamView) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'board') next.delete('view');
    else next.set('view', v);
    setSearchParams(next, { replace: true });
  };

  if (isLoading) {
    return (
      <PublicShell>
        <div className="grid flex-1 place-items-center">
          <Spinner />
        </div>
      </PublicShell>
    );
  }
  if (isError || !data) {
    return (
      <PublicShell>
        <div className="grid flex-1 place-items-center p-6 text-muted-foreground">
          {t('public.notAvailable')}
        </div>
      </PublicShell>
    );
  }

  const { team, issueType, items } = data;
  const isBug = issueType === TeamIssueType.BUG;
  const labelsFor = () => team.labels;

  return (
    <PublicShell title={team.name}>
      <ViewTabs
        view={{
          value: view,
          onChange: (v) => setView(v as TeamView),
          options: [
            { value: 'board', label: t('tasks.viewBoard'), icon: <LayoutGrid /> },
            { value: 'list', label: t('tasks.viewList'), icon: <List /> },
            { value: 'timeline', label: t('boards.viewTimeline'), icon: <CalendarRange /> },
          ],
        }}
      />
      {view === 'board' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <KanbanBoard
            columns={team.statuses}
            items={items}
            getId={(i) => i.id}
            getColumnKey={(i) => i.status}
            renderCard={(item, overlay) =>
              isBug ? (
                <BugCard bug={item as BugDto} labels={team.labels} overlay={overlay} />
              ) : (
                <TaskCard task={item as TaskDto} labels={team.labels} overlay={overlay} />
              )
            }
            onMove={noop}
            disabled
            onCardClick={(item) => setOpenItem(item)}
          />
        </div>
      ) : view === 'list' ? (
        <div className={cn('min-h-0 flex-1 overflow-y-auto py-4 md:py-6', BOARD_GUTTER)}>
          {isBug ? (
            <BugList
              bugs={items as BugDto[]}
              columns={team.statuses}
              labelsFor={labelsFor}
              onOpen={(b) => setOpenItem(b)}
            />
          ) : (
            <TaskList
              tasks={items as TaskDto[]}
              columns={team.statuses}
              labelsFor={labelsFor}
              onOpen={(tk) => setOpenItem(tk)}
            />
          )}
        </div>
      ) : (
        <div className={cn('min-h-0 flex-1 overflow-y-auto py-4 md:py-6', BOARD_GUTTER)}>
          <IssueTimelineView
            items={items}
            issueType={issueType}
            statusesFor={() => team.statuses}
            onOpenItem={(item) => setOpenItem(item as BugDto | TaskDto)}
          />
        </div>
      )}
      {openItem && token && (
        <PublicIssueDialog
          token={token}
          issueType={issueType}
          item={openItem}
          columns={team.statuses}
          onClose={() => setOpenItem(null)}
        />
      )}
    </PublicShell>
  );
}
