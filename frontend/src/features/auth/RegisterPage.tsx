import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button, Field, Input, PasswordInput } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { t } from '@/i18n';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [tenantName, setTenantName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(tenantName, name, email, password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-[100dvh] place-items-center p-6">
      <ThemeToggle className="fixed right-6 top-6 z-30 border-border bg-card" />
      <form
        className="w-full max-w-[400px] rounded-xl border bg-card p-8 text-card-foreground shadow-sm"
        onSubmit={onSubmit}
      >
        <h1 className="text-xl font-semibold tracking-tight">{t('auth.getStarted')}</h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">{t('app.tagline')}</p>
        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <Field label={t('auth.tenantName')} htmlFor="tenantName">
          <Input
            id="tenantName"
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            placeholder="Acme Product Team"
            required
            autoFocus
          />
        </Field>
        <Field label={t('auth.name')} htmlFor="name">
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label={t('auth.email')} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label={t('auth.password')} htmlFor="password">
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </Field>
        <Button type="submit" loading={loading} className="mt-1 w-full">
          {t('auth.signUpCta')}
        </Button>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('auth.haveAccount')}{' '}
          <Link
            to="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t('auth.signInCta')}
          </Link>
        </p>
      </form>
    </div>
  );
}
