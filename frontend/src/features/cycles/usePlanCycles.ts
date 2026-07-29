import { useState } from 'react';
import { toast } from 'sonner';
import { t } from '@/i18n';
import type { CycleDto } from '@/types/dto';
import { useCreateCycle, useDeleteCycle, useUpdateCycle, type CycleInput } from './api';
import { cycleName } from './dates';

/**
 * Planning a manual team's cycles by hand: the form dialog's state and the
 * create / re-schedule / delete calls behind it.
 *
 * Two surfaces offer this — the team's Cycles page and the Cycles card in team
 * settings — and both must behave identically: the dialog stays open holding
 * the entered dates when the server rejects an overlap, and a delete always
 * asks first. That's why it lives here rather than in either page.
 *
 * Whether to offer it at all is the caller's call (manual cadence, cycles on);
 * the API enforces the same rules regardless.
 */
export function usePlanCycles(teamId: string | undefined) {
  // The form dialog: closed, open on a cycle (edit), or open on nothing (create).
  const [form, setForm] = useState<{ open: boolean; cycle?: CycleDto }>({ open: false });
  const [error, setError] = useState<string | null>(null);
  const create = useCreateCycle();
  const update = useUpdateCycle();
  const remove = useDeleteCycle();

  const openCreate = () => {
    setError(null);
    setForm({ open: true });
  };
  const openEdit = (cycle: CycleDto) => {
    setError(null);
    setForm({ open: true, cycle });
  };
  const close = () => {
    setForm({ open: false });
    setError(null);
  };

  /** One save path for both create and edit — the dialog can't tell which it is
   *  from the outside, and a server rejection (an overlap) belongs in it. */
  async function submit(values: CycleInput) {
    if (!teamId) return;
    setError(null);
    try {
      if (form.cycle) {
        await update.mutateAsync({ teamId, cycleId: form.cycle.id, ...values });
      } else {
        await create.mutateAsync({ teamId, input: values });
      }
      setForm({ open: false });
    } catch (err) {
      // Kept open: the usual rejection is an overlap with another cycle, which
      // is fixed by nudging the dates, not by starting over.
      setError((err as Error).message);
    }
  }

  async function deleteCycle(cycle: CycleDto) {
    if (!teamId) return;
    if (!confirm(t('cycles.deleteConfirm').replace('{name}', cycleName(cycle)))) return;
    try {
      await remove.mutateAsync({ teamId, cycleId: cycle.id });
      toast.success(t('cycles.deleted'));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return {
    form,
    error,
    openCreate,
    openEdit,
    close,
    submit,
    deleteCycle,
    submitting: create.isPending || update.isPending,
  };
}
