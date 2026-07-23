import { useMemo, type ReactNode } from 'react';
import { CircleDot, Columns3, Trash2, UserRound, X } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui';
import { t } from '@/i18n';
import { CycleStatus, type TeamStatusConfig } from '@/types/enums';
import type { CycleDto } from '@/types/dto';
import { useBulkIssueAction, type BulkIssueAction } from './bulk.api';
import type { IssueSelection } from './useIssueSelection';

/** A picked value → label pair for the assignee / cycle menus. */
export interface BulkOption {
  value: string;
  label: string;
}

/**
 * Assignee targets for the bar: unassign first, then "me", then everyone else.
 * `users` is the workspace people list (manager-only, so it's often just the two
 * self-serve rows for a plain member — still enough to unassign or self-assign).
 */
export function buildAssigneeOptions(
  user: { id: string } | null | undefined,
  users: { id: string; name: string }[] | undefined,
): BulkOption[] {
  return [
    { value: '', label: t('filters.unassigned') },
    ...(user ? [{ value: user.id, label: t('filters.assignedToMe') }] : []),
    ...(users ?? []).filter((u) => u.id !== user?.id).map((u) => ({ value: u.id, label: u.name })),
  ];
}

/**
 * Cycle targets for the bar: "No cycle" (remove) plus the only cycles a move can
 * actually land in — the active one first, then upcoming soonest-first. Completed
 * cycles are omitted because the API rejects them, so we never offer a dead end.
 * `cycles` is the team list (newest-first); pass undefined on non-cycle teams to
 * hide the menu entirely.
 */
export function buildCycleOptions(cycles: CycleDto[] | undefined): BulkOption[] {
  const active = (cycles ?? []).filter((c) => c.status === CycleStatus.ACTIVE);
  // Newest-first ⇒ reversing the upcoming run puts the soonest cycle at the top.
  const upcoming = (cycles ?? []).filter((c) => c.status === CycleStatus.UPCOMING).reverse();
  return [
    { value: '', label: t('cycles.noCycle') },
    ...[...active, ...upcoming].map((c) => ({
      value: c.id,
      label: `${t('cycles.cycle')} ${c.number} · ${
        c.status === CycleStatus.ACTIVE ? t('cycles.current') : t('cycles.upcoming')
      }`,
    })),
  ];
}

/**
 * The floating toolbar that appears while rows are selected in a team board's
 * List view — the surface for "move these to a cycle" and its natural companions
 * (status, assignee, delete). It's a thin shell over {@link useBulkIssueAction}:
 * it only turns a menu pick into an action and clears the selection once the write
 * lands. Options are prepared by the board (which already has the columns, people
 * and cycles loaded), so the bar stays presentational and identical for bugs and
 * tasks. Renders nothing when the (visible) selection is empty.
 */
export function BulkActionBar({
  selection,
  visibleIds,
  columns,
  assignees,
  cycles,
}: {
  selection: IssueSelection;
  /** Ids currently shown — the selection is clamped to these so a filter change
   *  or a delete can't leave the count referring to rows that aren't on screen. */
  visibleIds: string[];
  columns: TeamStatusConfig[];
  assignees: BulkOption[];
  /** Cycle targets (open cycles + "No cycle"); omit/empty on non-cycle teams. */
  cycles?: BulkOption[];
}) {
  const bulk = useBulkIssueAction();
  const ids = useMemo(
    () => visibleIds.filter((id) => selection.isSelected(id)),
    [visibleIds, selection],
  );
  const count = ids.length;
  if (count === 0) return null;

  const busy = bulk.isPending;
  const apply = (action: BulkIssueAction) => {
    if (action.type === 'delete' && !window.confirm(t('bulk.confirmDelete'))) return;
    bulk.mutate({ ids, action }, { onSuccess: () => selection.clear() });
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border bg-card p-1.5 text-card-foreground shadow-lg">
        <span className="ml-1 mr-1 inline-flex shrink-0 items-center gap-2 text-sm font-medium">
          <span className="grid size-5 place-items-center rounded-md bg-primary text-[11px] font-semibold tabular-nums text-primary-foreground">
            {count}
          </span>
          {t('bulk.selected')}
        </span>
        <Divider />

        {cycles && cycles.length > 0 && (
          <BulkMenu label={t('bulk.moveToCycle')} icon={<CircleDot />} disabled={busy}>
            {cycles.map((o) => (
              <DropdownMenuItem
                key={o.value || '__none__'}
                onSelect={() => apply({ type: 'cycle', cycleId: o.value })}
              >
                {o.label}
              </DropdownMenuItem>
            ))}
          </BulkMenu>
        )}

        <BulkMenu label={t('bulk.status')} icon={<Columns3 />} disabled={busy}>
          {columns.map((c) => (
            <DropdownMenuItem
              key={c.key}
              className="gap-2"
              onSelect={() => apply({ type: 'status', status: c.key })}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: c.color }}
                aria-hidden
              />
              {c.label}
            </DropdownMenuItem>
          ))}
        </BulkMenu>

        {assignees.length > 0 && (
          <BulkMenu label={t('bulk.assignee')} icon={<UserRound />} disabled={busy}>
            {assignees.map((o) => (
              <DropdownMenuItem
                key={o.value || '__unassigned__'}
                onSelect={() => apply({ type: 'assignee', assigneeId: o.value })}
              >
                {o.label}
              </DropdownMenuItem>
            ))}
          </BulkMenu>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={busy}
          onClick={() => apply({ type: 'delete' })}
        >
          <Trash2 />
          <span className="hidden sm:inline">{t('common.delete')}</span>
        </Button>

        <Divider />
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 px-2 text-muted-foreground"
          aria-label={t('bulk.clear')}
          disabled={busy}
          onClick={selection.clear}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}

/** A labelled action menu — the trigger shows an icon + (on ≥sm) its label. */
function BulkMenu({
  label,
  icon,
  disabled,
  children,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="shrink-0" disabled={disabled}>
          {icon}
          <span className="hidden sm:inline">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />;
}
