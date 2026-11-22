'use client';

import { useTranslations } from 'next-intl';
import { Archive, BadgeCheck, CheckCircle2, Clock, Eye, FilePlus, Loader, PencilLine, Send, XCircle, type LucideIcon } from 'lucide-react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import type { Batch, DocumentStatus, VersionStatus } from '@/lib/types';

/** One tone + one icon per status, everywhere (docs/UI-REDESIGN.md §5). */
export const DOCUMENT_STATUS_STYLE: Record<DocumentStatus, { tone: BadgeVariant; icon: LucideIcon }> = {
  created: { tone: 'neutral', icon: FilePlus },
  sent: { tone: 'info', icon: Send },
  viewed: { tone: 'violet', icon: Eye },
  signed: { tone: 'success', icon: CheckCircle2 },
  declined: { tone: 'danger', icon: XCircle },
  expired: { tone: 'warning', icon: Clock },
};

export const VERSION_STATUS_STYLE: Record<VersionStatus, { tone: BadgeVariant; icon: LucideIcon }> = {
  draft: { tone: 'warning', icon: PencilLine },
  published: { tone: 'success', icon: BadgeCheck },
  archived: { tone: 'neutral', icon: Archive },
};

const BATCH_STATUS_STYLE: Record<Batch['status'], { tone: BadgeVariant; icon: LucideIcon }> = {
  queued: { tone: 'neutral', icon: Clock },
  running: { tone: 'info', icon: Loader },
  completed: { tone: 'success', icon: CheckCircle2 },
  failed: { tone: 'danger', icon: XCircle },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const t = useTranslations('docStatus');
  const { tone, icon: Icon } = DOCUMENT_STATUS_STYLE[status];
  return (
    <Badge variant={tone} data-status={status}>
      <Icon aria-hidden />
      {t(status)}
    </Badge>
  );
}

export function VersionStatusBadge({ status }: { status: VersionStatus }) {
  const t = useTranslations('versionStatus');
  const { tone, icon: Icon } = VERSION_STATUS_STYLE[status];
  return (
    <Badge variant={tone} data-status={status}>
      <Icon aria-hidden />
      {t(status)}
    </Badge>
  );
}

export function BatchStatusBadge({ status }: { status: Batch['status'] }) {
  const t = useTranslations('batchStatus');
  const { tone, icon: Icon } = BATCH_STATUS_STYLE[status];
  return (
    <Badge variant={tone} data-status={status}>
      <Icon aria-hidden />
      {t(status)}
    </Badge>
  );
}
