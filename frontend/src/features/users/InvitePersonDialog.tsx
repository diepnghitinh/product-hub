import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  Field,
  Input,
  Select,
} from '@/components/ui';
import { t } from '@/i18n';
import { ROLE_LABEL, Role } from '@/types/enums';
import type { UserDto } from '@/types/dto';
import { useCreateUser } from '@/features/users/api';

const EMPTY = { name: '', email: '', password: '', role: Role.TESTER };

/**
 * Add a person to the workspace. There's no email invite flow in the product —
 * `POST /users` creates the account outright — so the dialog asks for the one
 * thing a real invite would have sent them: a password to sign in with.
 *
 * Shared by Settings → People and the assignee picker's "Invite people via
 * email" row, which is why it takes `defaultEmail` (what was typed in the search
 * box) and reports the new person back through `onCreated` so the caller can
 * assign them on the spot. Admin-only, matching `@Roles(ADMIN)` on the endpoint.
 */
export function InvitePersonDialog({
  open,
  onClose,
  defaultEmail = '',
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultEmail?: string;
  onCreated?: (user: UserDto) => void;
}) {
  const createUser = useCreateUser();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  // Reopening is a fresh invite — carry in whatever was typed in the picker.
  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, email: defaultEmail });
    setError(null);
  }, [open, defaultEmail]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createUser.mutate(form, {
      onSuccess: (user) => {
        onCreated?.(user);
        onClose();
      },
      onError: (err) => setError((err as Error).message),
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('people.invite')}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button form="invite-person-form" type="submit" loading={createUser.isPending}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <form id="invite-person-form" onSubmit={submit}>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field label={t('people.name')} htmlFor="u-name">
          <Input
            id="u-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoFocus
          />
        </Field>
        <Field label={t('people.email')} htmlFor="u-email">
          <Input
            id="u-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </Field>
        <Field label={t('people.password')} htmlFor="u-pass">
          <Input
            id="u-pass"
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          {/* Nothing is emailed — say so, or the password looks optional. */}
          <p className="text-xs text-muted-foreground">{t('assignee.inviteHint')}</p>
        </Field>
        <Field label={t('people.role')} htmlFor="u-role">
          <Select
            id="u-role"
            value={form.role}
            onValueChange={(v) => setForm({ ...form, role: v as Role })}
            options={Object.values(Role).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          />
        </Field>
      </form>
    </Dialog>
  );
}
