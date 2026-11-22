'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowLeft, Inbox, Lock, RotateCw } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Translated message for an API error: by error code when we have one, generic otherwise. */
export function useErrorMessage() {
  const t = useTranslations('errors');
  return (err: unknown) => {
    if (err instanceof ApiError) {
      if (t.has(err.code)) return t(err.code);
      if (err.status === 403) return t('FORBIDDEN');
      if (err.status === 404) return t('NOT_FOUND');
    }
    return t('generic');
  };
}

/** Skeleton shaped like a table (header + rows with cells), so the page doesn't jump when data arrives. */
export function LoadingState({ rows = 4 }: { rows?: number }) {
  const t = useTranslations('common');
  return (
    <div className="overflow-hidden rounded-lg border bg-surface" aria-busy="true" role="status" aria-label={t('loading')}>
      <div className="flex gap-4 border-b bg-surface-muted px-4 py-3">
        <Skeleton className="h-3.5 w-1/4" />
        <Skeleton className="h-3.5 w-1/6" />
        <Skeleton className="hidden h-3.5 w-1/6 sm:block" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-b-0">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-5 w-16 rounded-sm" />
          <Skeleton className="hidden h-4 w-1/5 sm:block" />
          <Skeleton className="ml-auto h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTranslations('common');
  const message = useErrorMessage();
  if (error instanceof ApiError && error.status === 403) return <ForbiddenState />;
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-transparent bg-danger-bg p-8 text-center text-danger-fg">
      <AlertTriangle className="h-6 w-6" aria-hidden />
      <p className="text-sm">{message(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw /> {t('retry')}
        </Button>
      )}
    </div>
  );
}

export function ForbiddenState() {
  const t = useTranslations('errors');
  const tc = useTranslations('common');
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border bg-surface px-6 py-10 text-center shadow-sm">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-text-muted">
        <Lock className="h-5 w-5" aria-hidden />
      </span>
      <p className="text-lg font-semibold">{t('forbiddenTitle')}</p>
      <p className="text-sm text-text-muted">{t('FORBIDDEN')}</p>
      <Button asChild variant="secondary" className="mt-2">
        <Link href="/dashboard">
          <ArrowLeft /> {tc('backToDashboard')}
        </Link>
      </Button>
    </div>
  );
}

/** Empty state: icon, one-line message, optional short hint and one action. */
export function EmptyState({ children, hint, action, icon }: { children: ReactNode; hint?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-surface px-6 py-10 text-center">
      <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted text-text-muted" aria-hidden>
        {icon ?? <Inbox className="h-5 w-5" />}
      </span>
      <p className="font-medium">{children}</p>
      {hint && <p className="max-w-sm text-sm text-text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Renders loading / error / content for a TanStack Query result. */
export function QueryState<T>({ query, children, rows }: { query: { data?: T; isPending: boolean; error: unknown; refetch: () => unknown }; children: (data: T) => ReactNode; rows?: number }) {
  if (query.isPending) return <LoadingState rows={rows} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <>{children(query.data as T)}</>;
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <div className="mt-1.5 text-sm text-text-muted">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
