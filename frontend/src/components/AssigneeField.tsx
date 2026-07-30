import { useMemo, useState, type ReactNode } from 'react';
import { UsersRound } from 'lucide-react';
import { PeoplePicker, type PickerPerson } from '@/components/PeoplePicker';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/features/users/api';
import { InvitePersonDialog } from '@/features/users/InvitePersonDialog';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

interface BaseProps {
  disabled?: boolean;
  /** Show who's on it without letting anyone change it (no popover, no chrome). */
  readOnly?: boolean;
  /** Trigger text when nobody is picked. Defaults to "Unassigned". */
  placeholder?: string;
  /** Replaces the built-in field trigger (rendered `asChild`) — for toolbars. */
  trigger?: ReactNode;
  /** Adds an explicit "Unassigned" row — for a field that holds no value to
   *  click off (the bulk bar). See {@link PeoplePicker}. */
  clearLabel?: string;
  /**
   * Names to fall back on for ids the people list doesn't cover — a denormalised
   * `assigneeName`, or a roadmap item's stored assignees. Without it a person who
   * has since been removed would show as nothing at all.
   */
  fallbackNames?: Record<string, string>;
  className?: string;
  align?: 'start' | 'center' | 'end';
  /** Applied to the built-in trigger only — a custom `trigger` carries its own. */
  id?: string;
  'aria-label'?: string;
}

/**
 * `fallbackNames` built from an issue's own stored assignees — pass it whenever
 * the value comes off an issue, so someone since removed from the workspace still
 * shows as their name instead of "—".
 */
export function fallbackNames(assignees: { id: string; name: string }[]): Record<string, string> {
  return Object.fromEntries(assignees.map((a) => [a.id, a.name]));
}

export type AssigneeFieldProps = BaseProps &
  (
    | { multiple?: false; value: string | null | undefined; onChange: (id: string) => void }
    | { multiple: true; value: string[]; onChange: (ids: string[]) => void }
  );

/**
 * "Who's on this?" — the one assignee control in the app, on every issue sidebar,
 * every quick-add row, the roadmap item (where it takes several people) and the
 * board's bulk bar. It owns the people list, so a screen only hands it the
 * current value: `useUsers` is one shared query, cached across every instance on
 * the page.
 *
 * Unassigning is the ✕ in the popover header (or picking the same person again),
 * not a row in the list — see {@link PeoplePicker}. Admins additionally get
 * "Invite people via email", which opens the same dialog Settings → People uses
 * and assigns whoever it creates; `POST /users` is `@Roles(ADMIN)`, so for
 * everyone else the row would only ever 403.
 */
export function AssigneeField({
  value,
  onChange,
  multiple = false,
  disabled,
  readOnly = false,
  placeholder = t('assignee.unassigned'),
  trigger,
  clearLabel,
  fallbackNames,
  className,
  align = 'start',
  id,
  'aria-label': ariaLabel,
}: AssigneeFieldProps) {
  const { user, isAdmin } = useAuth();
  // Readable by any member, so assignees resolve for everyone — and shared with
  // every other `useUsers({limit:100})` on the page rather than re-fetched.
  const { data } = useUsers({ limit: 100 });
  const [inviting, setInviting] = useState<string | null>(null);

  const ids = useMemo(
    () => (multiple ? ((value as string[]) ?? []) : value ? [value as string] : []),
    [multiple, value],
  );

  /** Everyone the workspace knows, plus any assignee it no longer does. */
  const people = useMemo<PickerPerson[]>(() => {
    const known = (data?.items ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
    }));
    const seen = new Set(known.map((p) => p.id));
    const extras = ids
      .filter((personId) => !seen.has(personId))
      .map((personId) => ({ id: personId, name: fallbackNames?.[personId] || '—' }));
    return [...known, ...extras];
  }, [data, ids, fallbackNames]);

  const emit = (next: string[]) => {
    if (multiple) (onChange as (v: string[]) => void)(next);
    else (onChange as (v: string) => void)(next[0] ?? '');
  };

  if (readOnly) {
    const picked = ids
      .map((personId) => people.find((p) => p.id === personId))
      .filter((p): p is PickerPerson => !!p);
    return (
      <div className={cn('flex min-h-9 items-center gap-2 px-3 text-sm', className)}>
        {picked.length === 0 ? (
          <>
            <UsersRound className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{placeholder}</span>
          </>
        ) : (
          <>
            <span className="flex shrink-0 items-center">
              {picked.map((p, i) => (
                <UserAvatar
                  key={p.id}
                  tint
                  seed={p.id}
                  name={p.name}
                  email={p.email}
                  src={p.avatarUrl}
                  className={cn('size-5 ring-2 ring-background', i > 0 && '-ml-1.5')}
                  fallbackClassName="text-[9px]"
                />
              ))}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {picked.length === 1
                ? picked[0].id === user?.id
                  ? t('assignee.me')
                  : picked[0].name
                : t('assignee.count').replace('{n}', String(picked.length))}
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <PeoplePicker
        people={people}
        value={ids}
        onChange={emit}
        multiple={multiple}
        meId={user?.id}
        disabled={disabled}
        placeholder={placeholder}
        trigger={trigger}
        clearLabel={clearLabel}
        onInvite={isAdmin ? (email) => setInviting(email) : undefined}
        className={className}
        align={align}
        id={id}
        aria-label={ariaLabel}
      />
      <InvitePersonDialog
        open={inviting !== null}
        defaultEmail={inviting ?? ''}
        onClose={() => setInviting(null)}
        // Inviting from here means "I want *them* on this" — so put them on it.
        onCreated={(created) => emit(multiple ? [...ids, created.id] : [created.id])}
      />
    </>
  );
}
