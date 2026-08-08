import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, ChevronsUpDown, Search, UserPlus, UserRound, UsersRound, X } from 'lucide-react';
import { UserAvatar, avatarColor } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

/** The little a picker needs to know about a person to show and match them. */
export interface PickerPerson {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

export interface PeoplePickerProps {
  people: PickerPerson[];
  /** Selected ids (controlled) — at most one entry unless `multiple`. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Pick several people instead of replacing the one. */
  multiple?: boolean;
  /** The signed-in person's id — they read as "Me" and sort first. */
  meId?: string;
  disabled?: boolean;
  /** Trigger text when nobody is picked. */
  placeholder?: string;
  /** Replaces the built-in field trigger entirely (rendered `asChild`). */
  trigger?: ReactNode;
  /**
   * Label for an explicit "nobody" row at the top of the list. Only needed where
   * the field holds no current value to click off — the board's bulk bar, where
   * "unassign these" is a command, not the absence of a pick.
   */
  clearLabel?: string;
  /** Present = the "Invite people via email" row shows; gets the typed email. */
  onInvite?: (email: string) => void;
  /**
   * Headings for the two groups in the open list. The defaults name this
   * control's usual job — who's on it, then everyone else. A picker that isn't
   * about assignment passes its own words (ClickUp's people map says "Linked" /
   * "ClickUp members"): the *grouping* is still right there — picked first, rest
   * below — even where "Assignees" would be the wrong noun entirely.
   */
  groupLabels?: { selected: string; others: string };
  /**
   * Show each person's email under their name. Off by default: picking an
   * assignee, the name is the whole answer and a second line only makes a long
   * list longer. On where the address *is* the answer — mapping our people onto
   * another system's accounts, where two seats can carry the same display name
   * and the email is the only thing that tells them apart. Search has always
   * matched on email either way; this is about being able to read it.
   */
  showEmail?: boolean;
  className?: string;
  align?: 'start' | 'center' | 'end';
  /** Applied to the built-in trigger only — a custom `trigger` carries its own. */
  id?: string;
  'aria-label'?: string;
}

const isEmail = (q: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());

/** A person as one row of the open list, with the label they're shown under. */
interface PersonRow {
  person: PickerPerson;
  label: string;
  selected: boolean;
}

/**
 * The app's one "who's on this?" control: a field showing the people picked, and
 * a popover to change them — search, the current **Assignees** on top (you first,
 * as "Me"), then everyone else under **People**, each as their own coloured
 * avatar. Presentational on purpose, so it can be shown a list of anyone;
 * `AssigneeField` is the wired version every screen actually uses.
 *
 * Single-select (the default) replaces the pick, and clicking the selected person
 * again clears it — the same gesture as the header's ✕, which is why no
 * "Unassigned" row takes up space in the list. (`clearLabel` adds one back for
 * the one caller that needs it: a bulk bar, which holds no value to click off.)
 */
export function PeoplePicker({
  people,
  value,
  onChange,
  multiple = false,
  meId,
  disabled,
  placeholder = t('assignee.assign'),
  trigger,
  clearLabel,
  onInvite,
  groupLabels,
  showEmail,
  className,
  align = 'start',
  id,
  'aria-label': ariaLabel,
}: PeoplePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  /** Selected, in the order picked — unknown ids (someone since removed) drop out. */
  const selected = useMemo(
    () => value.map((v) => byId.get(v)).filter((p): p is PickerPerson => !!p),
    [value, byId],
  );

  const { assignees, others } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nameOf = (p: PickerPerson) => (p.id === meId ? t('assignee.me') : p.name);
    const matches = (p: PickerPerson) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q) ||
      nameOf(p).toLowerCase().includes(q);
    // Me first in either group, then alphabetical — a long list stays scannable.
    const order = (a: PickerPerson, b: PickerPerson) =>
      (a.id === meId ? -1 : 0) - (b.id === meId ? -1 : 0) || a.name.localeCompare(b.name);
    const picked = new Set(value);
    const row = (p: PickerPerson, isSelected: boolean): PersonRow => ({
      person: p,
      label: nameOf(p),
      selected: isSelected,
    });
    return {
      assignees: selected.filter(matches).sort(order).map((p) => row(p, true)),
      others: people
        .filter((p) => !picked.has(p.id) && matches(p))
        .sort(order)
        .map((p) => row(p, false)),
    };
  }, [people, selected, value, query, meId]);

  /** Keyboard walks the rows in the order they're drawn: clear · people · invite. */
  const rows = useMemo(() => [...assignees, ...others], [assignees, others]);
  const clearIndex = clearLabel ? 0 : -1;
  const firstPerson = clearLabel ? 1 : 0;
  const inviteIndex = onInvite ? firstPerson + rows.length : -1;

  const clear = () => {
    onChange([]);
    if (!multiple) setOpen(false);
  };

  const pick = (personId: string) => {
    if (multiple) {
      onChange(
        value.includes(personId) ? value.filter((v) => v !== personId) : [...value, personId],
      );
      setQuery('');
      return;
    }
    // Single: the same person again means "nobody".
    onChange(value.includes(personId) ? [] : [personId]);
    setOpen(false);
  };

  const invite = () => {
    setOpen(false);
    onInvite?.(isEmail(query) ? query.trim() : '');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const last = Math.max(0, onInvite ? inviteIndex : firstPerson + rows.length - 1);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, last));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active === clearIndex) clear();
      else if (active === inviteIndex) invite();
      else if (rows[active - firstPerson]) pick(rows[active - firstPerson].person.id);
    }
  };

  /** Overlapping avatars, each lifted off the one behind it by its ring. */
  const stack = (size: string, max: number, ring: string) => (
    <span className="flex shrink-0 items-center">
      {selected.slice(0, max).map((p, i) => (
        <UserAvatar
          key={p.id}
          tint
          seed={p.id}
          name={p.name}
          email={p.email}
          src={p.avatarUrl}
          className={cn(size, 'ring-2', ring, i > 0 && '-ml-1.5')}
          fallbackClassName="text-[9px]"
        />
      ))}
      {selected.length > max && (
        <span
          className={cn(
            size,
            ring,
            '-ml-1.5 grid place-items-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground ring-2',
          )}
        >
          +{selected.length - max}
        </span>
      )}
    </span>
  );

  const personRow = ({ person: p, label, selected: isSelected }: PersonRow, i: number) => (
    <button
      key={p.id}
      type="button"
      role="option"
      aria-selected={isSelected}
      onMouseEnter={() => setActive(i)}
      onClick={() => pick(p.id)}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none',
        i === active && 'bg-accent text-accent-foreground',
      )}
    >
      <span
        className="relative shrink-0 rounded-full"
        // Picked people wear a ring in their own colour, so the list reads as
        // "these ones are on it" from the avatars alone.
        style={
          isSelected
            ? { boxShadow: `0 0 0 2px hsl(var(--popover)), 0 0 0 3.5px ${avatarColor(p.id)}` }
            : undefined
        }
      >
        <UserAvatar
          tint
          seed={p.id}
          name={p.name}
          email={p.email}
          src={p.avatarUrl}
          className="size-7"
          fallbackClassName="text-[10px]"
        />
        {isSelected && (
          <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-popover">
            <Check className="size-2.5" strokeWidth={3} aria-hidden />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {showEmail && p.email && (
          <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
        )}
      </span>
    </button>
  );

  const groupLabel = (text: string) => (
    <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{text}</p>
  );

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (disabled) return;
        setOpen(o);
        if (o) {
          setQuery('');
          setActive(0);
        }
      }}
    >
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        {trigger ?? (
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            className={cn(
              'flex h-9 w-full items-center justify-between gap-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              {selected.length === 0 ? (
                <>
                  <UsersRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate text-muted-foreground">{placeholder}</span>
                </>
              ) : (
                <>
                  {stack('size-5', 3, 'ring-background')}
                  <span className="truncate">
                    {selected.length === 1
                      ? selected[0].id === meId
                        ? t('assignee.me')
                        : selected[0].name
                      : t('assignee.count').replace('{n}', String(selected.length))}
                  </span>
                </>
              )}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
          </button>
        )}
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="z-50 w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* Who's on it right now, and one gesture to take them all off. */}
          {selected.length > 0 && (
            <div className="flex items-center gap-2 border-b bg-muted/50 px-2.5 py-2">
              <span className="min-w-0 flex-1">{stack('size-7', 6, 'ring-popover')}</span>
              <button
                type="button"
                onClick={() => onChange([])}
                aria-label={t('assignee.clear')}
                title={t('assignee.clear')}
                className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}

          <div className="p-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder={t('assignee.search')}
                aria-label={t('assignee.search')}
                className="h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto px-1 pb-2" role="listbox">
            {clearLabel && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseEnter={() => setActive(clearIndex)}
                onClick={clear}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none',
                  active === clearIndex && 'bg-accent text-accent-foreground',
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-dashed border-border text-muted-foreground">
                  <UserRound className="size-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate">{clearLabel}</span>
              </button>
            )}
            {assignees.length > 0 && (
              <>
                {groupLabel(groupLabels?.selected ?? t('assignee.assignees'))}
                {assignees.map((r, i) => personRow(r, firstPerson + i))}
              </>
            )}
            {others.length > 0 && (
              <>
                {groupLabel(groupLabels?.others ?? t('assignee.people'))}
                {others.map((r, i) => personRow(r, firstPerson + assignees.length + i))}
              </>
            )}
            {rows.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t('assignee.noMatch')}
              </p>
            )}
            {onInvite && (
              <button
                type="button"
                onMouseEnter={() => setActive(inviteIndex)}
                onClick={invite}
                className={cn(
                  'mt-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none',
                  active === inviteIndex && 'bg-accent text-accent-foreground',
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <UserPlus className="size-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {isEmail(query) ? query.trim() : t('assignee.invite')}
                </span>
              </button>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
