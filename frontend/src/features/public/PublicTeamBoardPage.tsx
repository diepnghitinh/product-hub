import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { t } from '@/i18n';
import { KanbanBoard } from '@/components/KanbanBoard';
import { BugCard } from '@/features/bugs/BugsBoardPage';
import { TaskCard } from '@/features/tasks/MyTasksPage';
import { TeamIssueType } from '@/types/enums';
import type { BugDto, TaskDto } from '@/types/dto';
import { usePublicTeamBoard } from './api';
import { PublicShell } from './PublicShell';
import { PublicIssueDialog } from './PublicIssueDialog';

const noop = () => {};

/** A team board (tasks or bugs) shared read-only. Branches the card by the
 * team's issue type and reuses the same `BugCard`/`TaskCard` the app renders. */
export function PublicTeamBoardPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = usePublicTeamBoard(token);
  const [openItem, setOpenItem] = useState<BugDto | TaskDto | null>(null);

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

  return (
    <PublicShell>
      <div className="shrink-0 border-b px-4 py-4 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight">{team.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('teams.issuesSubtitle')}</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <KanbanBoard
          columns={team.statuses}
          items={items}
          getId={(i) => i.id}
          getColumnKey={(i) => i.status}
          renderCard={(item, overlay) =>
            isBug ? (
              <BugCard bug={item as BugDto} overlay={overlay} />
            ) : (
              <TaskCard task={item as TaskDto} overlay={overlay} />
            )
          }
          onMove={noop}
          disabled
          onCardClick={(item) => setOpenItem(item)}
        />
      </div>
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
