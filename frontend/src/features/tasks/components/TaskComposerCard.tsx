import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Circle, Triangle } from 'lucide-react';
import {
  Button,
  Combobox,
  DatePicker,
  DotLabel,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { t } from '@/i18n';
import { useTeamStatuses } from '@/features/teams/api';
import { TASK_ESTIMATES, TeamIssueType, taskEstimateLabel } from '@/types/enums';

export interface TaskDraft {
  title: string;
  description?: string;
  status?: string;
  assigneeId?: string;
  dueDate?: string;
  estimate?: number;
  /** The team the composer resolved to — its picker's choice, or the default. */
  teamId?: string;
}

interface TeamOption {
  id: string;
  name: string;
}

/**
 * Linear-style inline create card shared by the two task twins — sub-tasks
 * ({@link SubtaskPanel}) and a backlog item's tasks ({@link TaskPanel}). A titled
 * composer exposing the same property controls as the New-task form
 * (status · assignee · due date · estimate), laid out on one row with the
 * Cancel/Create buttons. Stays open after Create (title/description cleared,
 * property picks kept) so several siblings can be added fast.
 *
 * Give it a `teams` list with more than one entry and it grows a team picker
 * that both files the task and drives which status columns appear.
 */
export function TaskComposerCard({
  teams,
  defaultTeamId,
  users,
  pending,
  onCreate,
  onCancel,
  titlePlaceholder = t('tasks.titlePlaceholder'),
  extraActions,
}: {
  /** Task teams the new task may land in. >1 shows a picker that also switches
   *  the status columns; 0/1 hides it and the card uses `defaultTeamId`. */
  teams?: TeamOption[];
  /** The team selected initially — the only team, or the workspace default. */
  defaultTeamId: string;
  users: { id: string; name: string }[];
  pending: boolean;
  onCreate: (input: TaskDraft, done: () => void) => void;
  onCancel: () => void;
  titlePlaceholder?: string;
  /** Optional footer action rendered left of Cancel/Create. */
  extraActions?: ReactNode;
}) {
  // Team is owned here so the picker can re-resolve the status columns live.
  const [teamId, setTeamId] = useState('');
  const effectiveTeamId = teamId || defaultTeamId;
  const columns = useTeamStatuses(effectiveTeamId, TeamIssueType.TASK);
  const showTeamPicker = (teams?.length ?? 0) > 1;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState<string | undefined>();
  const [estimate, setEstimate] = useState(0);

  const effectiveStatus = status ?? columns[0]?.key;

  function submit() {
    if (!title.trim() || pending) return;
    onCreate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        status: effectiveStatus || undefined,
        assigneeId: assigneeId || undefined,
        dueDate: dueDate || undefined,
        estimate: estimate || undefined,
        teamId: effectiveTeamId || undefined,
      },
      () => {
        // Clear the text but keep property picks for the next sibling.
        setTitle('');
        setDescription('');
      },
    );
  }

  function onTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') onCancel();
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-card p-3 shadow-sm">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onTitleKeyDown}
        placeholder={titlePlaceholder}
        aria-label={titlePlaceholder}
        autoFocus
        className="h-8 border-0 px-0 text-sm font-medium shadow-none focus-visible:ring-0"
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('tasks.addDescription')}
        rows={2}
        className="mt-1 resize-none border-0 px-0 text-sm shadow-none focus-visible:ring-0"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {showTeamPicker && (
          <Select
            value={effectiveTeamId}
            onValueChange={(v) => {
              setTeamId(v);
              // The picked status may not exist in the new team — fall back to
              // that team's first column.
              setStatus(undefined);
            }}
            options={teams!.map((tm) => ({ value: tm.id, label: tm.name }))}
            className="h-8 w-[150px]"
            aria-label={t('tasks.team')}
          />
        )}
        <Select
          value={effectiveStatus}
          onValueChange={setStatus}
          options={columns.map((c) => ({
            value: c.key,
            label: <DotLabel color={c.color}>{c.label}</DotLabel>,
          }))}
          className="h-8 w-[140px]"
          aria-label={t('tasks.status')}
        />
        <Combobox
          value={assigneeId}
          onChange={setAssigneeId}
          placeholder={t('tasks.assignee')}
          className="h-8 w-[150px]"
          options={[
            { value: '', label: t('tasks.unassigned') },
            ...users.map((u) => ({ value: u.id, label: u.name })),
          ]}
        />
        <DatePicker
          value={dueDate}
          onChange={(v) => setDueDate(v || undefined)}
          placeholder={t('tasks.dueDate')}
          className="h-8 w-[150px]"
        />
        <Combobox
          value={String(estimate || 0)}
          onChange={(v) => setEstimate(Number(v))}
          placeholder={t('tasks.estimate')}
          className="h-8 w-[130px]"
          options={[
            {
              value: '0',
              label: t('tasks.noEstimate'),
              icon: <Circle className="size-3.5 text-muted-foreground" />,
            },
            ...TASK_ESTIMATES.map((v) => ({
              value: String(v),
              label: taskEstimateLabel(v),
              icon: <Triangle className="size-3 fill-current text-muted-foreground" />,
            })),
          ]}
        />

        <div className="ml-auto flex items-center gap-2">
          {extraActions}
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            loading={pending}
            disabled={!title.trim()}
          >
            {t('common.create')}
          </Button>
        </div>
      </div>
    </div>
  );
}
