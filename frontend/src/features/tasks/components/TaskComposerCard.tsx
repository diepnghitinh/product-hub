import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Circle, Triangle } from 'lucide-react';
import {
  Button,
  Combobox,
  DateRangePicker,
  DotLabel,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { AssigneeField } from '@/components/AssigneeField';
import { t } from '@/i18n';
import { TeamSymbol } from '@/components/TeamSymbol';
import { useTeamStatuses } from '@/features/teams/api';
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_COLOR,
  BUG_SEVERITY_LABEL,
  BugSeverity,
  IssueKind,
  TASK_ESTIMATES,
  TeamIssueType,
  defaultTeamIcon,
  taskEstimateLabel,
} from '@/types/enums';

export interface TaskDraft {
  title: string;
  description?: string;
  status?: string;
  /** Everyone to put on it — the composer's picker takes several. */
  assigneeIds?: string[];
  startDate?: string;
  endDate?: string;
  estimate?: number;
  /** The team the composer resolved to — its picker's choice, or the default. */
  teamId?: string;
  /** What the picked team files — a bug team creates a bug, not a task. */
  kind: IssueKind;
  /** Bug-only, and only set when the picked team is a bug team. */
  severity?: BugSeverity;
}

export interface TeamOption {
  id: string;
  name: string;
  /** Decides the kind created, which status columns show, and estimate ⇄ severity. */
  issueType: TeamIssueType;
  /** The team's own nav symbol + accent, so the two kinds read apart in the picker. */
  icon?: string;
  color?: string | null;
}

/**
 * Linear-style inline create card used by the shared Sub-tasks section
 * ({@link SubtaskSection}), for both a team task's sub-tasks and a backlog
 * item's tasks. A titled
 * composer exposing the same property controls as the New-task form
 * (status · assignee · due date · estimate), laid out on one row with the
 * Cancel/Create buttons. Stays open after Create (title/description cleared,
 * property picks kept) so several siblings can be added fast.
 *
 * Give it a `teams` list with more than one entry and it grows a team picker
 * that both files the task and drives which status columns appear. Offer a **bug
 * team** in that list and the card composes a bug instead — same card, but the
 * bug team's columns and a severity in place of the estimate — so a backlog item
 * can take "fix this bug" as a child without a second composer.
 */
export function TaskComposerCard({
  teams,
  defaultTeamId,
  pending,
  onCreate,
  onCancel,
  titlePlaceholder = t('tasks.titlePlaceholder'),
  extraActions,
}: {
  /** Teams the new issue may land in — task teams, bug teams, or both. >1 shows
   *  a picker that also switches the kind and the status columns; 0/1 hides it
   *  and the card uses `defaultTeamId`. */
  teams?: TeamOption[];
  /** The team selected initially — the only team, or the workspace default. */
  defaultTeamId: string;
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
  // The team decides the kind: a bug team files a bug, with its own columns and
  // a severity. Unknown team (none offered) ⇒ a task, as before.
  const issueType =
    teams?.find((tm) => tm.id === effectiveTeamId)?.issueType ?? TeamIssueType.TASK;
  const isBug = issueType === TeamIssueType.BUG;
  const columns = useTeamStatuses(effectiveTeamId, issueType);
  const showTeamPicker = (teams?.length ?? 0) > 1;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [estimate, setEstimate] = useState(0);
  const [severity, setSeverity] = useState<BugSeverity>(BugSeverity.MEDIUM);

  const effectiveStatus = status ?? columns[0]?.key;

  function submit() {
    if (!title.trim() || pending) return;
    onCreate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        status: effectiveStatus || undefined,
        assigneeIds,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        // Each kind sends only its own field, so switching teams mid-compose
        // can't smuggle an estimate onto a bug (or a severity onto a task).
        estimate: isBug ? undefined : estimate || undefined,
        severity: isBug ? severity : undefined,
        teamId: effectiveTeamId || undefined,
        kind: isBug ? IssueKind.BUG : IssueKind.TASK,
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
            options={teams!.map((tm) => ({
              value: tm.id,
              label: (
                <span className="flex min-w-0 items-center gap-1.5">
                  <TeamSymbol
                    name={tm.icon || defaultTeamIcon(tm.issueType)}
                    size={14}
                    color={tm.color ?? undefined}
                  />
                  <span className="truncate">{tm.name}</span>
                </span>
              ),
            }))}
            className="h-8 w-[170px]"
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
        <AssigneeField
          multiple
          value={assigneeIds}
          onChange={setAssigneeIds}
          placeholder={t('tasks.assignee')}
          className="h-8 w-[150px]"
          aria-label={t('tasks.assignee')}
        />
        <DateRangePicker
          start={startDate}
          end={endDate}
          onChange={(r) => {
            setStartDate(r.start);
            setEndDate(r.end);
          }}
          placeholder={t('tasks.dates')}
          className="h-8 w-[180px]"
        />
        {/* Kind-specific slot: a bug is sized by severity, a task by points. */}
        {isBug ? (
          <Select
            value={severity}
            onValueChange={(v) => setSeverity(v as BugSeverity)}
            options={BUG_SEVERITIES.map((s) => ({
              value: s,
              label: <DotLabel color={BUG_SEVERITY_COLOR[s]}>{BUG_SEVERITY_LABEL[s]}</DotLabel>,
            }))}
            className="h-8 w-[130px]"
            aria-label={t('bugs.severity')}
          />
        ) : (
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
        )}

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
