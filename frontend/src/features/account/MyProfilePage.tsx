import { useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Camera, KeyRound, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Separator, Spinner } from '@/components/ui';
import { UserAvatar } from '@/components/UserAvatar';
import { CenteredPageLayout } from '@/layouts/shared';
import { PageHeader } from '@/layouts/headers/PageHeader';
import { cn } from '@/lib/utils';
import { uploadMedia } from '@/features/uploads/api';
import { useUpdateMyAvatar } from '@/features/users/api';
import { ROLE_LABEL } from '@/types/enums';
import { t } from '@/i18n';
import { ChangePasswordDialog } from '@/features/account/ChangePasswordDialog';
import { AvatarCropDialog } from '@/features/account/AvatarCropDialog';

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
  const { user, updateUser } = useAuth();
  const updateAvatar = useUpdateMyAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  if (!user) return null;

  // Pick → open the circular cropper. Clearing the input value lets the same
  // file be re-picked (selecting it again would otherwise not fire change).
  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.photoInvalid'));
      return;
    }
    setCropFile(file);
  }

  // The cropper hands back a small (~256px) WebP already framed to the circle,
  // so we never ship the original megabytes. Upload it, save the URL, close.
  async function onCropConfirm(cropped: File) {
    setBusy(true);
    try {
      const { url } = await uploadMedia(cropped);
      updateUser(await updateAvatar.mutateAsync(url));
      toast.success(t('profile.photoUpdated'));
      setCropFile(null);
    } catch (err) {
      toast.error((err as Error).message || t('profile.photoFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function onRemovePhoto() {
    setBusy(true);
    try {
      updateUser(await updateAvatar.mutateAsync(null));
      toast.success(t('profile.photoRemoved'));
    } catch (err) {
      toast.error((err as Error).message || t('profile.photoFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CenteredPageLayout>
      <PageHeader title={t('profile.myProfile')} />

      <div className="mx-auto w-full max-w-2xl space-y-6">
        {/* Identity */}
        <section className="rounded-xl border p-6">
          <div className="flex items-center gap-4">
            {/* The avatar itself is the primary control — click to change, with a
                hover scrim hinting it's editable and doubling as the busy state. */}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label={user.avatarUrl ? t('profile.changePhoto') : t('profile.addPhoto')}
              className="group relative shrink-0 rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
            >
              <UserAvatar
                name={user.name}
                email={user.email}
                src={user.avatarUrl}
                className="size-16"
                fallbackClassName="text-xl"
              />
              <span
                className={cn(
                  'absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white transition-opacity',
                  busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
              >
                {busy ? <Spinner className="size-5 text-white" /> : <Camera className="size-5" />}
              </span>
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-foreground">{user.name}</h2>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <Badge variant="secondary" className="mt-1.5">
                {ROLE_LABEL[user.role]}
              </Badge>
            </div>
          </div>

          {/* Explicit controls + the hidden picker both the disc and this row open. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickFile}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={busy}>
              <Camera className="size-4" />
              {user.avatarUrl ? t('profile.changePhoto') : t('profile.addPhoto')}
            </Button>
            {user.avatarUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemovePhoto}
                disabled={busy}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
                {t('profile.removePhoto')}
              </Button>
            )}
            <span className="text-xs text-muted-foreground">{t('profile.photoHint')}</span>
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
      <AvatarCropDialog
        open={!!cropFile}
        file={cropFile}
        saving={busy}
        onCancel={() => !busy && setCropFile(null)}
        onConfirm={onCropConfirm}
      />
    </CenteredPageLayout>
  );
}
