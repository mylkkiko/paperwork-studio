'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Inbox, Lock, RotateCw } from 'lucide-react';
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

export function LoadingState({ rows = 4 }: { rows?: number }) {
  const t = useTranslations('common');
  return (
    <div className="space-y-3" aria-busy="true" aria-label={t('loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTranslations('common');
  const message = useErrorMessage();
  if (error instanceof ApiError && error.status === 403) return <ForbiddenState />;
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
      <p className="text-sm">{message(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> {t('retry')}
        </Button>
      )}
    </div>
  );
}

export function ForbiddenState() {
  const t = useTranslations('errors');
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border bg-background p-8 text-center">
      <Lock className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{t('forbiddenTitle')}</p>
      <p className="text-sm text-muted-foreground">{t('FORBIDDEN')}</p>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
      <Inbox className="h-6 w-6" aria-hidden />
      {children}
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
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
