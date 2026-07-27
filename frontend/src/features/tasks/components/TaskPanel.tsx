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
 * created in any team — task *or* bug — and linked back to this item, and the
 * link-existing icon opens the cross-team, cross-kind picker. Whichever route
 * you take, a bug that blocks the item sits beside the tasks that deliver it.
 */
export function TaskPanel({ roadmapId, projectId, itemId, itemLabel }: TaskPanelProps) {
  const [pickOpen, setPickOpen] = useState(false);

  // Every non-archived team, both kinds — the composer's picker files the child
  // in the one you choose, so a backlog item's work can be "fix this bug" as
  // easily as "build this". Tasks first, bugs after, each group in team order.
  const { data: teams } = useTeams();
  const composerTeams = (teams ?? [])
    .filter((tm) => !tm.archived)
    .sort(
      (a, b) =>
        Number(a.issueType === TeamIssueType.BUG) - Number(b.issueType === TeamIssueType.BUG),
    )
    .map((tm) => ({
      id: tm.id,
      name: tm.name,
      issueType: tm.issueType,
      icon: tm.icon,
      color: tm.color,
    }));
  // A new child still defaults to a task — you opt into a bug by picking its team.
  const taskTeams = composerTeams.filter((tm) => tm.issueType === TeamIssueType.TASK);
  const defaultTeamId =
    (teams ?? []).find((tm) => tm.issueType === TeamIssueType.TASK && !tm.archived && tm.isDefault)
      ?.id ??
    taskTeams[0]?.id ??
    '';

  return (
    <>
      <SubtaskSection
        className="mt-5"
        query={{ roadmapItemId: itemId }}
        createLink={{ roadmapId, roadmapItemId: itemId, roadmapItemLabel: itemLabel, projectId }}
        composerTeams={composerTeams}
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
