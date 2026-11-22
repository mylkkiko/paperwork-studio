'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowRight, FilePlus2, FileText, PenLine, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/roles';
import { useFormat } from '@/lib/format';
import type { Batch, DocumentRow, TemplateListItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState, PageHeader, QueryState } from '@/components/states';
import { BatchStatusBadge, DocumentStatusBadge, VersionStatusBadge } from '@/components/status-badge';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { user } = useAuth();
  const role = user?.role;
  return (
    <>
      <PageHeader title={t('title')} description={t('welcome', { name: user?.name ?? '' })} />
      <QuickActions />
      {/* two columns only on very wide screens: tables need the full width at laptop sizes */}
      <div className="mt-6 grid gap-6 2xl:grid-cols-2 [&>*]:min-w-0">
        {can.generate(role) && <RecentBatches />}
        {can.manageSignatures(role) && <WaitingDocuments />}
        {can.manageTemplates(role) && <DraftTemplates />}
      </div>
    </>
  );
}

function QuickActions() {
  const t = useTranslations('dashboard');
  const role = useAuth().user?.role;
  const actions = [
    { href: '/generate', label: t('actionGenerate'), icon: PenLine, show: can.generate(role) },
    { href: '/signatures', label: t('actionSignatures'), icon: Send, show: can.manageSignatures(role) },
    { href: '/templates?upload=1', label: t('actionUpload'), icon: FilePlus2, show: can.manageTemplates(role) },
    { href: '/templates', label: t('actionTemplates'), icon: FileText, show: true },
  ].filter((a) => a.show);
  return (
    <nav className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('quickActions')}>
      {actions.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group flex min-h-16 items-center gap-3 rounded-lg border bg-surface px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:border-accent/40 hover:bg-accent-soft"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text transition-colors group-hover:bg-surface" aria-hidden>
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <span className="leading-snug">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function RecentBatches() {
  const t = useTranslations('dashboard');
  const f = useFormat();
  const query = useQuery({ queryKey: ['batches', { limit: 5 }], queryFn: () => api<{ items: Batch[] }>('/batches', { query: { limit: 5 } }) });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('recentBatches')}</CardTitle>
      </CardHeader>
      <CardContent>
        <QueryState query={query} rows={3}>
          {({ items }) =>
            items.length === 0 ? (
              <EmptyState hint={t('noBatchesHint')}>{t('noBatches')}</EmptyState>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{t('template')}</TH>
                    <TH>{t('group')}</TH>
                    <TH numeric>{t('documents')}</TH>
                    <TH>{t('status')}</TH>
                    <TH>{t('when')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((b) => (
                    <TR key={b.id}>
                      <TD className="max-w-56">
                        <div className="truncate font-medium" title={b.template?.title}>
                          {b.template?.title}
                        </div>
                        <div className="tabular text-xs text-text-muted">v{b.template?.versionNumber}</div>
                      </TD>
                      <TD className="whitespace-nowrap">{b.groupName ?? '—'}</TD>
                      <TD numeric className="whitespace-nowrap">
                        {b.progress} / {b.total}
                      </TD>
                      <TD>
                        <BatchStatusBadge status={b.status} />
                      </TD>
                      <TD className="tabular whitespace-nowrap text-text-muted">{f.date(b.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )
          }
        </QueryState>
      </CardContent>
    </Card>
  );
}

function WaitingDocuments() {
  const t = useTranslations('dashboard');
  const f = useFormat();
  // "Waiting for signature" = sent or viewed.
  const query = useQuery({
    queryKey: ['documents', 'waiting'],
    queryFn: async () => {
      const [sent, viewed] = await Promise.all([
        api<{ items: DocumentRow[] }>('/documents', { query: { status: 'sent' } }),
        api<{ items: DocumentRow[] }>('/documents', { query: { status: 'viewed' } }),
      ]);
      return [...viewed.items, ...sent.items];
    },
  });
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t('waiting')}</CardTitle>
        <Button asChild variant="link" size="sm">
          <Link href="/signatures">
            {t('viewAll')} <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <QueryState query={query} rows={3}>
          {(docs) =>
            docs.length === 0 ? (
              <EmptyState>{t('noWaiting')}</EmptyState>
            ) : (
              <>
                <p className="mb-3 text-sm text-text-muted" data-testid="waiting-count">
                  {t('waitingCount', { count: docs.length })}
                </p>
                <Table>
                  <TBody>
                    {docs.slice(0, 6).map((d) => (
                      <TR key={d.id}>
                        <TD className="font-medium">{d.recipientName}</TD>
                        <TD className="tabular whitespace-nowrap text-text-muted">{d.number}</TD>
                        <TD>
                          <DocumentStatusBadge status={d.status} />
                        </TD>
                        <TD className="tabular whitespace-nowrap text-text-muted">{f.date(d.sentAt)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </>
            )
          }
        </QueryState>
      </CardContent>
    </Card>
  );
}

function DraftTemplates() {
  const t = useTranslations('dashboard');
  const query = useQuery({ queryKey: ['templates', { status: 'draft' }], queryFn: () => api<{ items: TemplateListItem[] }>('/templates', { query: { status: 'draft' } }) });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('drafts')}</CardTitle>
      </CardHeader>
      <CardContent>
        <QueryState query={query} rows={2}>
          {({ items }) =>
            items.length === 0 ? (
              <EmptyState>{t('noDrafts')}</EmptyState>
            ) : (
              <ul className="divide-y">
                {items.map((tpl) => (
                  <li key={tpl.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`/templates/${tpl.id}`} className="rounded-sm font-medium text-accent-text hover:underline">
                      {tpl.title}
                    </Link>
                    {tpl.latestVersion && (
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular">v{tpl.latestVersion.versionNumber}</span> <VersionStatusBadge status={tpl.latestVersion.status} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
      </CardContent>
    </Card>
  );
}
