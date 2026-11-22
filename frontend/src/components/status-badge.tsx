'use client';

import { useTranslations } from 'next-intl';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { DocumentStatus, VersionStatus, Batch } from '@/lib/types';

const docVariant: Record<DocumentStatus, BadgeProps['variant']> = {
  created: 'secondary',
  sent: 'default',
  viewed: 'warning',
  signed: 'success',
  declined: 'destructive',
  expired: 'destructive',
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const t = useTranslations('docStatus');
  return <Badge variant={docVariant[status]} data-status={status}>{t(status)}</Badge>;
}

const versionVariant: Record<VersionStatus, BadgeProps['variant']> = { draft: 'warning', published: 'success', archived: 'secondary' };

export function VersionStatusBadge({ status }: { status: VersionStatus }) {
  const t = useTranslations('versionStatus');
  return <Badge variant={versionVariant[status]}>{t(status)}</Badge>;
}

const batchVariant: Record<Batch['status'], BadgeProps['variant']> = { queued: 'secondary', running: 'default', completed: 'success', failed: 'destructive' };

export function BatchStatusBadge({ status }: { status: Batch['status'] }) {
  const t = useTranslations('batchStatus');
  return <Badge variant={batchVariant[status]}>{t(status)}</Badge>;
}
