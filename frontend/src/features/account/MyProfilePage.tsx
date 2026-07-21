import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Separator } from '@/components/ui';
import { CenteredPageLayout } from '@/layouts/shared';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { initials } from '@/lib/format';
import { ROLE_LABEL } from '@/types/enums';
import { t } from '@/i18n';
import { ChangePasswordDialog } from '@/features/account/ChangePasswordDialog';

/** A read-only field in the identity grid. */
function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-foreground">{value}</dd>
    </div>
  );
}

/**
 * The signed-in user's own account page (`/profile`), reached from the profile
 * menu. Shows their identity read-only and hosts the change-password flow — the
 * one self-service account action the app has today.
 */
export function MyProfilePage() {
  const { user } = useAuth();
  const [changing, setChanging] = useState(false);

  if (!user) return null;

  return (
    <CenteredPageLayout>
      <PageHeader title={t('profile.myProfile')} />

      <div className="mx-auto w-full max-w-2xl space-y-6">
        {/* Identity */}
        <section className="rounded-xl border p-6">
          <div className="flex items-center gap-4">
            <span
              className="grid size-16 shrink-0 place-items-center rounded-full bg-primary text-xl font-semibold text-primary-foreground"
              aria-hidden
            >
              {initials(user.name, user.email)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-foreground">{user.name}</h2>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <Badge variant="secondary" className="mt-1.5">
                {ROLE_LABEL[user.role]}
              </Badge>
            </div>
          </div>

          <Separator className="my-6" />

          <dl className="grid gap-5 sm:grid-cols-2">
            <DetailField label={t('people.name')} value={user.name} />
            <DetailField label={t('people.email')} value={user.email} />
            <DetailField label={t('people.role')} value={ROLE_LABEL[user.role]} />
          </dl>
        </section>

        {/* Security */}
        <section className="flex flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{t('account.changePassword')}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('profile.passwordHint')}</p>
          </div>
          <Button variant="outline" className="shrink-0" onClick={() => setChanging(true)}>
            <KeyRound className="size-4" />
            {t('account.changePassword')}
          </Button>
        </section>
      </div>

      <ChangePasswordDialog open={changing} onClose={() => setChanging(false)} />
    </CenteredPageLayout>
  );
}
