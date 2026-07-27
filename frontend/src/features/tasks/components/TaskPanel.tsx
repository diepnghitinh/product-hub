import { useState } from 'react';
import { TeamIssueType } from '@/types/enums';
import { useTeams } from '@/features/teams/api';
import { SubtaskSection } from './SubtaskSection';
import { PickTaskDialog } from './PickTaskDialog';

interface TaskPanelProps {
  roadmapId: string;
  projectId: string;
  /** The linked backlog item (roadmap item) id — tasks created here link to it. */
  itemId: string;
  /** Denormalized label stored on each task, e.g. "Now · Passkey login". */
  itemLabel: string;
}

/**
 * A backlog item's (roadmap item's) linked issues — the shared
 * {@link SubtaskSection} wired for the roadmap: children fetch by `roadmapItemId`
 * across **both kinds** (so a linked bug shows beside the tasks), new ones are
 * filed as tasks in any task team (the composer's picker) and linked back to this
 * item, and the link-existing icon opens the cross-team, cross-kind picker — a
 * bug that blocks the item can be linked just like a task that delivers it.
 */
export function TaskPanel({ roadmapId, projectId, itemId, itemLabel }: TaskPanelProps) {
  const [pickOpen, setPickOpen] = useState(false);

  // Which teams a new task may land in — every non-archived task team.
  const { data: teams } = useTeams();
  const taskTeams = (teams ?? []).filter(
    (tm) => tm.issueType === TeamIssueType.TASK && !tm.archived,
  );
  const defaultTeamId = taskTeams.find((tm) => tm.isDefault)?.id ?? taskTeams[0]?.id ?? '';

  return (
    <>
      <SubtaskSection
        className="mt-5"
        query={{ roadmapItemId: itemId }}
        createLink={{ roadmapId, roadmapItemId: itemId, roadmapItemLabel: itemLabel, projectId }}
        composerTeams={taskTeams.map((tm) => ({ id: tm.id, name: tm.name }))}
        defaultTeamId={defaultTeamId}
        crossTeam
        onLinkExisting={() => setPickOpen(true)}
      />

      {pickOpen && (
        <PickTaskDialog
          open={pickOpen}
          onClose={() => setPickOpen(false)}
          roadmapId={roadmapId}
          projectId={projectId}
          itemId={itemId}
          itemLabel={itemLabel}
        />
      )}
    </>
  );
}
