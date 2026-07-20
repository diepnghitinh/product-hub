import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  Field,
  PasswordInput,
} from '@/components/ui';
import { t } from '@/i18n';
import { useChangeMyPassword } from '@/features/users/api';

const MIN_LENGTH = 6;

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The signed-in user changes their own password. Requires the current one (the
 * backend re-checks it), and confirms the new one client-side to catch typos
 * before the round-trip.
 */
export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const change = useChangeMyPassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setError(null);
    }
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) {
      setError(t('account.passwordTooShort'));
      return;
    }
    if (next !== confirm) {
      setError(t('account.passwordMismatch'));
      return;
    }
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast.success(t('account.passwordChanged'));
          onClose();
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('account.changePassword')}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="change-password-form" type="submit" loading={change.isPending}>
            {t('account.update')}
          </Button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={submit}>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field label={t('account.currentPassword')} htmlFor="cp-current">
          <PasswordInput
            id="cp-current"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </Field>
        <Field label={t('account.newPassword')} htmlFor="cp-new">
          <PasswordInput
            id="cp-new"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label={t('account.confirmPassword')} htmlFor="cp-confirm">
          <PasswordInput
            id="cp-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
      </form>
    </Dialog>
  );
}
