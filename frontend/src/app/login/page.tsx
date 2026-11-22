'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { SHOW_DEMO_LOGINS } from '@/lib/env';
import type { Role } from '@/lib/types';
import { DEMO_ACCOUNTS } from '@/lib/demo-accounts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { useErrorMessage } from '@/components/states';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
type FormValues = z.infer<typeof schema>;

function LoginForm() {
  const t = useTranslations('login');
  const tr = useTranslations('roles');
  const { login, user } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next') || '/dashboard';
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [busyRole, setBusyRole] = useState<Role | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  useEffect(() => {
    if (user) router.replace(next.startsWith('/') ? next : '/dashboard');
  }, [user, next, router]);

  const submit = async (values: FormValues) => {
    setError(null);
    try {
      await login(values.email, values.password);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const loginAs = async (role: Role) => {
    const account = DEMO_ACCOUNTS.find((a) => a.role === role)!;
    setBusyRole(role);
    form.reset({ email: account.email, password: account.password });
    await submit(account);
    setBusyRole(null);
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-16">
      <div className="absolute right-3 top-3 flex items-center gap-1 sm:right-6 sm:top-4">
        <LanguageSwitcher compact />
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t('email')}</Label>
              <Input id="email" type="email" autoComplete="username" aria-invalid={!!form.formState.errors.email} {...form.register('email')} />
              {form.formState.errors.email && <p className="text-xs text-danger-fg">{t('emailInvalid')}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{t('password')}</Label>
              <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!form.formState.errors.password} {...form.register('password')} />
              {form.formState.errors.password && <p className="text-xs text-danger-fg">{t('passwordRequired')}</p>}
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" loading={form.formState.isSubmitting && !busyRole}>
              <LogIn /> {t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {SHOW_DEMO_LOGINS && DEMO_ACCOUNTS.length > 0 && (
        <Card className="w-full max-w-md border-dashed shadow-none" data-testid="demo-logins">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t('demoTitle')}</CardTitle>
            <CardDescription className="text-xs">{t('demoHint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <div key={a.role} className="flex flex-col gap-2.5 rounded-md border bg-surface-muted px-3 py-3">
                <div className="min-w-0 text-xs leading-relaxed">
                  <div className="text-sm font-medium">{tr(a.role)}</div>
                  <div className="text-text-muted [overflow-wrap:anywhere]">{a.email}</div>
                  <div className="whitespace-nowrap text-text-muted">
                    {t('password')}: <code className="text-text">{a.password}</code>
                  </div>
                </div>
                <Button size="sm" variant="secondary" className="self-start" onClick={() => loginAs(a.role)} loading={busyRole === a.role} disabled={!!busyRole}>
                  {t('loginAs', { role: tr(a.role) })}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
