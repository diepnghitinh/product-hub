import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  Button,
  Menu,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { TableSkeleton } from '@/components/Skeletons';
import { UserAvatar } from '@/components/UserAvatar';
import { t } from '@/i18n';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { ROLE_LABEL, Role } from '@/types/enums';
import { useDeleteUser, useUpdateUser, useUsers } from '@/features/users/api';
import { InvitePersonDialog } from '@/features/users/InvitePersonDialog';
import { CenteredPageLayout } from '@/layouts/shared';
import { ResetPasswordDialog } from '@/features/admin/ResetPasswordDialog';

export function AdminPeoplePage() {
  const { user, isAdmin } = useAuth();
  const { data, isLoading } = useUsers({ limit: 100 }, isAdmin);
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [open, setOpen] = useState(false);
  const [resetUser, setResetUser] = useState<{ id: string; name: string } | null>(null);

  if (!isAdmin)
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        Admins only.
      </div>
    );

  const users = data?.items ?? [];

  return (
    <CenteredPageLayout>
      <PageHeader
        title={t('people.title')}
        actions={<Button onClick={() => setOpen(true)}>+ {t('people.invite')}</Button>}
      />

      {isLoading ? (
        <TableSkeleton rows={6} cols={3} />
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
                      {/* Same tinted disc the assignee picker draws, so a person
                          is the same colour here as wherever they're assigned. */}
                      <UserAvatar
                        tint
                        seed={u.id}
                        name={u.name}
                        email={u.email}
                        src={u.avatarUrl}
                        className="size-8 shrink-0"
                        fallbackClassName="text-xs"
                      />
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
                    <Menu
                      align="right"
                      triggerClassName="size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      trigger={<MoreHorizontal className="size-4" />}
                      items={[
                        {
                          label: t('people.resetPassword'),
                          closeOnSelect: true,
                          onClick: () => setResetUser({ id: u.id, name: u.name }),
                        },
                        ...(u.id !== user?.id
                          ? [
                              {
                                label: t('people.remove'),
                                danger: true,
                                closeOnSelect: true,
                                onClick: () => {
                                  if (confirm(t('people.confirmDelete'))) deleteUser.mutate(u.id);
                                },
                              },
                            ]
                          : []),
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* The same dialog the assignee picker's "Invite people via email" opens. */}
      <InvitePersonDialog open={open} onClose={() => setOpen(false)} />

      <ResetPasswordDialog
        user={resetUser}
        open={!!resetUser}
        onClose={() => setResetUser(null)}
      />
    </CenteredPageLayout>
  );
}
