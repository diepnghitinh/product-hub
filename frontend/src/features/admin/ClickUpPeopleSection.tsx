import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Check } from 'lucide-react';
import { SaveButton } from '@/components/ui';
import { PeoplePicker, type PickerPerson } from '@/components/PeoplePicker';
import { RowsSkeleton } from '@/components/Skeletons';
import { UserAvatar } from '@/components/UserAvatar';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import type { ClickUpPersonDto } from '@/types/dto';
import { useClickUpPeople, useSaveClickUpPeople } from '@/features/settings/api';

/**
 * People → ClickUp members, inside Settings → External tools → ClickUp.
 *
 * The thing worth understanding before reading the JSX: **this screen is not
 * where the mapping happens — it's where the mapping is corrected.** Assignees
 * push to ClickUp as numeric member ids, and the two systems share no identifier
 * but email, so the sync matches on that and gets it right for almost everyone
 * with nothing configured. An empty table here is a healthy workspace, not an
 * unfinished one.
 *
 * What the automatic match can't do is *say when it failed*. Someone whose
 * ClickUp seat uses a different address matches nobody, and their assignments
 * have been dropped silently — the push posts the other assignees and carries on,
 * because losing one name is better than losing the whole task. That silence is
 * the actual problem, so every row states which of three things it is:
 *
 * - **pinned** — an admin chose it, and it wins over the email outright
 * - **matched** — nothing configured, the emails happen to line up
 * - **no match** — nobody. Called out in warning colour, because it's the only
 *   row that means something is quietly not working
 *
 * So the default option in every dropdown is "match by email", not a blank: a
 * row that resolves to someone should read as resolved, and only a row that
 * resolves to no one should look like it needs attention.
 */
export function ClickUpPeopleSection() {
  const { data, isLoading } = useClickUpPeople();
  const save = useSaveClickUpPeople();
  /** userId → chosen member id as a string. '' = fall back to the email match. */
  const [edits, setEdits] = useState<Record<string, string>>({});

  const people = data?.people ?? [];
  const members = data?.members ?? [];

  /**
   * What a row is set to *right now*: an unsaved edit, else the saved pin, else
   * '' for "match by email". Not seeded into state on load — the saved value is
   * read through here instead, so a background refetch can't overwrite an edit
   * in progress and there's no effect to keep in step.
   */
  function valueOf(p: ClickUpPersonDto): string {
    return edits[p.userId] ?? (p.pinned ? String(p.memberId) : '');
  }

  const dirty = people.some((p) => valueOf(p) !== (p.pinned ? String(p.memberId) : ''));

  /**
   * The ClickUp roster as people the picker can search. `username` is the label
   * and `email` rides alongside — the picker matches on both, which is the point
   * here: the rows an admin actually needs to fix are the ones whose ClickUp
   * address differs from ours, so the address is what they'll have to hand and
   * what they'll type. A workspace of any size is unusable by scrolling.
   */
  const seats = useMemo<PickerPerson[]>(
    () => members.map((m) => ({ id: String(m.id), name: m.username || m.email, email: m.email })),
    [members],
  );

  async function onSave() {
    try {
      // The whole table goes, not just what changed: the server replaces the map
      // outright, so a row cleared back to "match by email" has to travel as a 0
      // rather than simply not being mentioned.
      await save.mutateAsync(
        people.map((p) => ({ userId: p.userId, memberId: Number(valueOf(p) || 0) })),
      );
      setEdits({});
      toast.success(t('clickup.peopleSaved'));
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    }
  }

  if (isLoading) return <RowsSkeleton rows={3} />;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">{t('clickup.people')}</h4>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('clickup.peopleHint')}</p>
      </div>

      {/* ClickUp unreachable: the dropdowns would be empty, so say why rather
          than presenting a form that can't be filled in. The saved pins below
          still render — from the names cached when they were saved. */}
      {data?.membersUnavailable && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span className="min-w-0 leading-relaxed">{data.membersUnavailable}</span>
        </div>
      )}

      <div className="divide-y rounded-xl border">
        {people.map((p) => (
          <PersonRow
            key={p.userId}
            person={p}
            value={valueOf(p)}
            seats={seats}
            disabled={!!data?.membersUnavailable}
            onChange={(v) => setEdits((e) => ({ ...e, [p.userId]: v }))}
          />
        ))}
        {!people.length && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t('clickup.peopleEmpty')}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <SaveButton onSave={onSave} disabled={!dirty}>
          {t('common.save')}
        </SaveButton>
      </div>
    </div>
  );
}

/**
 * One person and their ClickUp seat.
 *
 * Stacks on a phone and goes to a row at `sm`, like the status map next door —
 * the arrow between the two sides only appears once they're actually side by
 * side, where it means something.
 */
function PersonRow({
  person,
  value,
  seats,
  disabled,
  onChange,
}: {
  person: ClickUpPersonDto;
  value: string;
  seats: PickerPerson[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <UserAvatar
          name={person.name}
          email={person.email}
          src={person.avatarUrl}
          seed={person.userId}
          tint
          className="size-7 shrink-0"
          fallbackClassName="text-[11px]"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{person.name}</p>
          <p className="truncate text-xs text-muted-foreground">{person.email}</p>
        </div>
      </div>

      <ArrowRight className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" />

      <div className="w-full space-y-1 sm:w-64">
        {/* The app's one people control, pointed at ClickUp's roster instead of
            ours — so this searches by name *or* email like every other people
            field, rather than being a list you scroll. "Match by email" is the
            clear row at the top: picking nobody here isn't an empty field, it's
            the automatic behaviour, so it needs a row of its own to choose. */}
        <PeoplePicker
          people={seats}
          value={value ? [value] : []}
          onChange={(ids) => onChange(ids[0] ?? '')}
          placeholder={t('clickup.peopleAuto')}
          clearLabel={t('clickup.peopleAuto')}
          groupLabels={{
            selected: t('clickup.peopleLinked'),
            others: t('clickup.peopleMembers'),
          }}
          showEmail
          disabled={disabled}
          aria-label={`${person.name} → ClickUp`}
        />
        {/* Only under a row left on "match by email", because a pinned row's
            answer is already the thing in the dropdown. Saying it twice would
            just be noise; saying nothing when the match found no one is the
            silence this screen exists to break.

            And nothing at all when the roster couldn't be read: with no members
            to match against, every one of these rows resolves to nobody, and
            "no ClickUp match" would be an accusation about people when the
            actual fault is the connection. The banner above says that instead. */}
        {!value && !disabled && <MatchNote person={person} />}
      </div>
    </div>
  );
}

/** What the email match resolves this person to, when nothing is pinned. */
function MatchNote({ person }: { person: ClickUpPersonDto }) {
  const matched = person.memberId > 0;
  return (
    <p
      className={cn(
        'flex items-center gap-1 text-[11px] leading-tight',
        matched ? 'text-muted-foreground' : 'text-warning',
      )}
    >
      {matched ? (
        <Check className="size-3 shrink-0 text-success" />
      ) : (
        <AlertTriangle className="size-3 shrink-0" />
      )}
      <span className="min-w-0 truncate">
        {matched
          ? t('clickup.peopleMatched').replace('{name}', person.clickupUsername || person.email)
          : t('clickup.peopleNoMatch')}
      </span>
    </p>
  );
}
