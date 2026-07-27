import { useState } from 'react';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { Button, Combobox, ProgressBar, Select, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/features/users/api';
import { useTeams, useTeamStatusesLookup } from '@/features/teams/api';
import { TeamIconPicker } from '@/features/teams/TeamIconPicker';
import { IssuePeekDrawer, type IssuePeek } from '@/features/issues/IssuePeekDrawer';
import { TeamIssueType, isIssueDone, taskStatusColor } from '@/types/enums';
import {
  useCreateIssue,
  useDeleteIssue,
  useIssues,
  useSetIssueStatus,
  useUpdateIssue,
  type CreateIssueInput,
  type IssueQuery,
} from '@/features/issues/api';
import { TaskComposerCard, type TeamOption } from './TaskComposerCard';

export interface SubtaskSectionProps {
  /** How to fetch the children — `{ roadmapItemId }` (a backlog item's linked
   *  issues) or `{ parentId }` (a task's sub-tasks). Reads the unified `/issues`
   *  collection, so a backlog item shows the **tasks and bugs** linked to it; the
   *  sub-task query only ever matches tasks (bugs carry no `parentId`). */
  query: IssueQuery;
  /** Fields merged into every created child — the link (and, for a backlog item,
   *  the project scope + denormalized label). */
  createLink: Partial<CreateIssueInput>;
  /** Teams offered in the composer; more than one grows a picker that also drives
   *  the status columns. **The picked team decides the kind** — offer a bug team
   *  and the child is created as a bug (a backlog item can take "fix this bug"
   *  as work); offer only task teams and nothing changes. */
  composerTeams: TeamOption[];
  /** The team a new child lands in by default (the only team, or the workspace
   *  default task team — so a new child is a task unless you pick otherwise). */
  defaultTeamId: string;
  titlePlaceholder?: string;
  /** Children can span teams (a backlog item's do) — shows a per-row team badge. */
  crossTeam?: boolean;
  /** When set, a "link existing" icon sits beside `+`; clicking it opens the
   *  host's picker (only the backlog board can link across teams today). */
  onLinkExisting?: () => void;
  /** Outer wrapper — the top border + spacing, so each host can tune the gap. */
  className?: string;
}

/**
 * The one Sub-tasks section, shared by a backlog item (roadmap) and a team task.
 * Modelled on the backlog item's panel — the richer of the two: a header with the
 * "N of M done" rollup, a `+` add and an optional link-existing icon, a progress
 * bar, then rows whose title opens that child's own detail (a task or a bug, by
 * its team). Adding one merges `createLink` so the child is filed and linked in
 * one write; completed children drive the rollup.
 *
 * Both kinds are first-class here: which team you pick in the composer decides
 * whether the child is a task or a bug, matching what the section already
 * *shows* (a linked bug has always rendered beside the tasks).
 */
export function SubtaskSection({
  query,
  createLink,
  composerTeams,
  defaultTeamId,
  titlePlaceholder = t('subtasks.titlePlaceholder'),
  crossTeam = false,
  onLinkExisting,
  className,
}: SubtaskSectionProps) {
  const { user, canManageDelivery: isAdmin, canEditDelivery: canWrite } = useAuth();
  // People list is readable by any member, so assignees resolve for everyone.
  const { data: usersData } = useUsers({ limit: 100 });
  const users = usersData?.items ?? [];

  // Spans both kinds: a backlog item lists its linked tasks *and* bugs.
  const { data, isLoading } = useIssues(query);
  const issues = data?.items ?? [];

  // Columns are per-team, and these children can span teams — resolve per row.
  const statusesFor = useTeamStatusesLookup();
  // Each row is labelled with its own team when children can span teams.
  const { data: teams } = useTeams();
  const teamById = new Map((teams ?? []).map((tm) => [tm.id, tm]));

  const create = useCreateIssue();
  const update = useUpdateIssue();
  const setStatus = useSetIssueStatus();
  const remove = useDeleteIssue();

  const [adding, setAdding] = useState(false);
  // The child previewed in the right-side drawer (click a row to peek).
  const [peek, setPeek] = useState<IssuePeek | null>(null);

  // Rollup spans both kinds, so "done" is read per issue — a bug is finished at
  // resolved/closed, a task at done.
  const done = issues.filter((tk) => isIssueDone(tk.kind, tk.status)).length;
  const total = issues.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <section className={cn('mt-8 border-t border-border pt-4', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('subtasks.title')}
        </span>
        <div className="flex items-center gap-1.5">
          {total > 0 && (
            <span className="mr-1 text-xs tabular-nums text-muted-foreground">
              {t('tasks.doneOf').replace('{done}', String(done)).replace('{total}', String(total))}
            </span>
          )}
          {canWrite && onLinkExisting && (
            <button
              type="button"
              onClick={onLinkExisting}
              className="grid size-6 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('tasks.pick')}
              title={t('tasks.pick')}
            >
              <Link2 className="size-3.5" />
            </button>
          )}
          {canWrite && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="grid size-6 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('subtasks.add')}
              title={t('subtasks.add')}
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {total > 0 && (
        <div className="mb-3">
          <ProgressBar value={pct} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {isLoading ? (
          <div className="flex justify-center py-3">
            <Spinner />
          </div>
        ) : issues.length === 0 && !adding ? (
          <p className="py-2 text-sm text-muted-foreground">{t('subtasks.empty')}</p>
        ) : (
          issues.map((tk) => {
            const mine = !!user && tk.assigneeId === user.id;
            const team = teamById.get(tk.teamId);
            // A linked child is a bug or a task depending on its team; its title
            // links to the matching detail page.
            const detailBase = team?.issueType === TeamIssueType.BUG ? '/bugs' : '/tasks';
            // This child's own columns — a bug team's `open`/`resolved` are as
            // real here as a task's `todo`, so the dot reads its colour from the
            // resolved column, not the task palette.
            const columns = statusesFor(tk.teamId, team?.issueType ?? TeamIssueType.TASK);
            const column = columns.find((c) => c.key === tk.status);
            return (
              <div
                key={tk.id}
                className={cn(
                  'grid items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5',
                  // Fixed columns so status · assignee · delete line up across rows.
                  canWrite
                    ? 'grid-cols-[minmax(0,1fr)_128px_150px_28px]'
                    : 'grid-cols-[minmax(0,1fr)_128px_150px]',
                )}
              >
                {/* Title (+ status dot) — peeks the child in a right-side drawer. */}
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: column?.color ?? taskStatusColor(tk.status) }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPeek({
                        id: tk.id,
                        issueType: team?.issueType ?? TeamIssueType.TASK,
                        href: `${detailBase}/${tk.shortId || tk.id}`,
                      })
                    }
                    className={cn(
                      'min-w-0 flex-1 truncate text-left text-sm underline-offset-4 hover:underline',
                      isIssueDone(tk.kind, tk.status) && 'text-muted-foreground line-through',
                    )}
                    title={tk.title}
                  >
                    {tk.title}
                  </button>
                  {/* Which team owns this child — only when they can span teams. */}
                  {crossTeam && team && (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                      title={`${t('tasks.team')}: ${team.name}`}
                    >
                      <TeamIconPicker team={team} readOnly size={12} className="shrink-0" />
                      <span className="max-w-[90px] truncate">{team.name}</span>
                    </span>
                  )}
                </div>

                {/* Status */}
                {canWrite ? (
                  <Select
                    value={tk.status}
                    onValueChange={(v) => setStatus.mutate({ id: tk.id, status: v })}
                    options={columns.map((c) => ({ value: c.key, label: c.label }))}
                    className="h-7 w-full"
                    aria-label={t('roadmaps.status')}
                  />
                ) : (
                  <span className="truncate text-xs text-muted-foreground">
                    {column?.label ?? tk.status}
                  </span>
                )}

                {/* Assignee */}
                <div className="flex min-w-0 items-center">
                  {isAdmin ? (
                    <Combobox
                      value={tk.assigneeId || ''}
                      onChange={(v) => update.mutate({ id: tk.id, input: { assigneeId: v } })}
                      placeholder={t('tasks.assign')}
                      className="h-7 w-full"
                      options={[
                        { value: '', label: t('tasks.unassigned') },
                        ...users.map((u) => ({ value: u.id, label: u.name })),
                      ]}
                    />
                  ) : canWrite && tk.assigneeId && !mine ? (
                    <span className="truncate text-xs text-muted-foreground" title={tk.assigneeName}>
                      {tk.assigneeName}
                    </span>
                  ) : canWrite ? (
                    <Button
                      type="button"
                      variant={mine ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7"
                      onClick={() =>
                        update.mutate({
                          id: tk.id,
                          input: { assigneeId: mine ? '' : user?.id ?? '' },
                        })
                      }
                    >
                      {mine ? t('tasks.assignedYou') : t('tasks.assignMe')}
                    </Button>
                  ) : (
                    <span className="truncate text-xs text-muted-foreground">
                      {tk.assigneeName || t('tasks.unassigned')}
                    </span>
                  )}
                </div>

                {/* Delete */}
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(tk.id)}
                    className="justify-self-end rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {canWrite && adding && (
        <TaskComposerCard
          teams={composerTeams}
          defaultTeamId={defaultTeamId}
          users={users}
          pending={create.isPending}
          titlePlaceholder={titlePlaceholder}
          onCancel={() => setAdding(false)}
          onCreate={(input, finish) =>
            create.mutate(
              // `createLink` owns the link fields; `kind` stays the composer's —
              // it follows the team picked there, so a bug team files a bug.
              { ...input, ...createLink, kind: input.kind },
              // Keep the card open with its property picks so you can batch several.
              { onSuccess: () => finish() },
            )
          }
        />
      )}

      {/* Click a row → preview that child (task or bug) in a right-side drawer. */}
      <IssuePeekDrawer peek={peek} onClose={() => setPeek(null)} />
    </section>
  );
}
