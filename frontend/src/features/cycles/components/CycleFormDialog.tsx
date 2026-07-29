import { useEffect, useState, type FormEvent } from 'react';
import { Button, Dialog, DateRangePicker, Field, Input, Textarea } from '@/components/ui';
import { t } from '@/i18n';
import type { CycleDto } from '@/types/dto';
import type { CycleInput } from '../api';
import { addDays, dayDiff, todayIso } from '../dates';

/** How long a fresh cycle runs when nothing suggests otherwise — the same
 *  two weeks the automatic rhythm defaults to. */
const DEFAULT_LENGTH_DAYS = 14;

interface CycleFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Present when editing; absent when planning a new one. */
  cycle?: CycleDto;
  /** The team's existing cycles — the new one starts the day after the last of
   *  them, so back-to-back planning needs no date-picking at all. */
  cycles: CycleDto[];
  submitting?: boolean;
  /** Server-side rejection (an overlap, usually) — shown above the fields. */
  error?: string | null;
  onSubmit: (values: CycleInput) => void;
}

/**
 * Plan or re-plan one cycle by hand: what it's called, when it runs, and the
 * goal it's for. Only reachable on a manual-cadence team — an automatic team's
 * dates belong to the scheduler.
 *
 * The dates are deliberately a single range control (the same one tasks and bugs
 * use for start→end): a cycle is a window, and picking its ends separately is
 * what lets someone leave `end` before `start`.
 */
export function CycleFormDialog({
  open,
  onClose,
  cycle,
  cycles,
  submitting = false,
  error,
  onSubmit,
}: CycleFormDialogProps) {
  const editing = !!cycle;
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [description, setDescription] = useState('');
  // A server rejection is about the dates that were *sent*. The moment they're
  // nudged it's answering a question nobody is asking any more, so it's hidden
  // until the next submit (which re-arms it, even for the same message).
  const [staleError, setStaleError] = useState(false);

  // Re-seed each time it opens: editing loads that cycle, creating proposes the
  // next free window. Keyed on `open` so a second edit of the same row re-seeds
  // rather than showing the last edit's abandoned text.
  useEffect(() => {
    if (!open) return;
    setStaleError(false);
    if (cycle) {
      setName(cycle.name);
      setStart(cycle.startDate);
      setEnd(cycle.endDate);
      setDescription(cycle.description ?? '');
      return;
    }
    // Start the day after the team's latest cycle ends, so the common case —
    // "the next one" — is already filled in and can't overlap. With no cycles
    // yet (or all of them in the past), start today.
    const latestEnd = cycles.reduce((max, c) => (c.endDate > max ? c.endDate : max), '');
    const proposed = latestEnd >= todayIso() ? addDays(latestEnd, 1) : todayIso();
    setName('');
    setStart(proposed);
    setEnd(addDays(proposed, DEFAULT_LENGTH_DAYS - 1));
    setDescription('');
  }, [open, cycle, cycles]);

  const invalidRange = !start || !end || dayDiff(start, end) < 0;
  const days = invalidRange ? 0 : dayDiff(start, end) + 1;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (invalidRange) return;
    setStaleError(false);
    onSubmit({
      name: name.trim(),
      startDate: start,
      endDate: end,
      description: description.trim() || null,
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t('cycles.editCycle') : t('cycles.newCycle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} type="button">
            {t('common.cancel')}
          </Button>
          <Button form="cycle-form" type="submit" loading={submitting} disabled={invalidRange}>
            {editing ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <form id="cycle-form" onSubmit={submit}>
        {error && !staleError && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <Field label={t('cycles.name')} htmlFor="cycle-name">
          <Input
            id="cycle-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder={
              editing ? `${t('cycles.cycle')} ${cycle.number}` : t('cycles.namePlaceholder')
            }
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{t('cycles.nameHint')}</p>
        </Field>
        <Field label={t('cycles.dates')} htmlFor="cycle-dates">
          <DateRangePicker
            id="cycle-dates"
            start={start}
            end={end}
            clearable={false}
            onChange={(r) => {
              setStart(r.start);
              setEnd(r.end);
              setStaleError(true);
            }}
          />
          {days > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('cycles.lengthDays').replace('{n}', String(days))}
            </p>
          )}
        </Field>
        <Field label={t('cycles.goal.title')} htmlFor="cycle-goal">
          <Textarea
            id="cycle-goal"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            placeholder={t('cycles.goal.placeholder')}
          />
        </Field>
      </form>
    </Dialog>
  );
}
