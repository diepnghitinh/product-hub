import { useEffect, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  Field,
  PasswordInput,
} from '@/components/ui';
import { t } from '@/i18n';
import { useResetUserPassword } from '@/features/users/api';

const MIN_LENGTH = 6;

/**
 * A strong, readable random password. Look-alike characters (0/O, 1/l/I) are left
 * out so it survives being read aloud or copied by hand, and one of each class is
 * guaranteed before the rest is filled and shuffled — `crypto` for the randomness.
 */
function generatePassword(length = 14): string {
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digit = '23456789';
  const symbol = '!@#$%^&*?-_';
  const all = lower + upper + digit + symbol;

  const rand = new Uint32Array(length);
  crypto.getRandomValues(rand);
  const pick = (set: string, n: number) => set[n % set.length];

  const chars = [
    pick(lower, rand[0]),
    pick(upper, rand[1]),
    pick(digit, rand[2]),
    pick(symbol, rand[3]),
  ];
  for (let i = 4; i < length; i++) chars.push(pick(all, rand[i]));

  // Fisher–Yates shuffle so the guaranteed classes aren't always up front.
  const swap = new Uint32Array(chars.length);
  crypto.getRandomValues(swap);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = swap[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

interface ResetPasswordDialogProps {
  /** The user being reset; `null` keeps the dialog closed. */
  user: { id: string; name: string } | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Admin sets another user's password. The admin can type one or hit Generate, then
 * relays it out-of-band — there's no reset email. After it's saved the password
 * stays on screen with a Copy button so it can't be lost before it's shared.
 */
export function ResetPasswordDialog({ user, open, onClose }: ResetPasswordDialogProps) {
  const reset = useResetUserPassword();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  // Kept so the heading doesn't flash an empty name during the close animation,
  // when `user` has already gone back to null.
  const [shownName, setShownName] = useState('');

  useEffect(() => {
    if (user) setShownName(user.name);
  }, [user]);

  useEffect(() => {
    if (open) {
      setPassword('');
      setError(null);
      setDone(false);
      setCopied(false);
    }
  }, [open, user?.id]);

  function copy() {
    void navigator.clipboard?.writeText(password);
    setCopied(true);
  }

  function submit() {
    if (!user) return;
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(t('account.passwordTooShort'));
      return;
    }
    reset.mutate(
      { id: user.id, newPassword: password },
      {
        onSuccess: () => setDone(true),
        onError: (err) => setError((err as Error).message),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('people.resetTitle').replace('{name}', shownName)}
      footer={
        done ? (
          <Button type="button" onClick={onClose}>
            {t('common.done')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" type="button" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={submit} loading={reset.isPending} disabled={!password}>
              {t('people.resetPassword')}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('people.resetDone').replace('{name}', shownName)}
          </p>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <code className="min-w-0 flex-1 select-all break-all font-mono text-sm">
              {password}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? t('common.copied') : t('common.copy')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field label={t('people.newPassword')} htmlFor="reset-password">
            <PasswordInput
              id="reset-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setCopied(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              autoComplete="new-password"
              autoFocus
              placeholder={t('people.newPasswordPlaceholder')}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPassword(generatePassword());
                setCopied(false);
                setError(null);
              }}
            >
              <RefreshCw />
              {t('people.generate')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={copy} disabled={!password}>
              {copied ? <Check /> : <Copy />}
              {copied ? t('common.copied') : t('common.copy')}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t('people.resetHint')}</p>
        </>
      )}
    </Dialog>
  );
}
