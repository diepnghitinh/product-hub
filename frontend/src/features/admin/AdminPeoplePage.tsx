import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { t } from '@/i18n';
import { PageHeader } from '@/components/PageHeader';
import { ROLE_LABEL, Role } from '@/types/enums';
import {
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUsers,
} from '@/features/users/api';

/** First-two-initials fallback for the user avatar. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function AdminPeoplePage() {
  const { user, isAdmin } = useAuth();
  const { data, isLoading } = useUsers({ limit: 100 }, isAdmin);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: Role.TESTER });
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin)
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        Admins only.
      </div>
    );

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    createUser.mutate(form, {
      onSuccess: () => {
        setOpen(false);
        setForm({ name: '', email: '', password: '', role: Role.TESTER });
      },
      onError: (err) => setError((err as Error).message),
    });
  }

  const users = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title={t('people.title')}
        actions={<Button onClick={() => setOpen(true)}>+ {t('people.invite')}</Button>}
      />

      {isLoading ? (
        <div className="grid place-items-center rounded-xl border border-dashed p-8">
          <Spinner />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('people.name')}</TableHead>
                <TableHead>{t('people.email')}</TableHead>
                <TableHead>{t('people.role')}</TableHead>
                <TableHead aria-label="actions" className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">
                        {initials(u.name)}
                      </span>
                      <span className="truncate">{u.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <div className="w-36">
                      <Select
                        value={u.role}
                        disabled={u.id === user?.id}
                        onValueChange={(v) => updateUser.mutate({ id: u.id, input: { role: v as Role } })}
                        options={Object.values(Role).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {u.id !== user?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove"
                        onClick={() => confirm(t('people.confirmDelete')) && deleteUser.mutate(u.id)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('people.invite')}
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button form="user-form" type="submit" loading={createUser.isPending}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={submit}>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field label={t('people.name')} htmlFor="u-name">
            <Input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </Field>
          <Field label={t('people.email')} htmlFor="u-email">
            <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label={t('people.password')} htmlFor="u-pass">
            <Input id="u-pass" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
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
    </div>
  );
}
