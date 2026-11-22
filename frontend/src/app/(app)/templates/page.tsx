'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Search, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/roles';
import { useFormat } from '@/lib/format';
import { CATEGORIES, type TemplateListItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState, PageHeader, QueryState } from '@/components/states';
import { VersionStatusBadge } from '@/components/status-badge';
import { UploadTemplateDialog } from '@/components/upload-dialog';

function TemplatesList() {
  const t = useTranslations('templates');
  const tc = useTranslations('categories');
  const tv = useTranslations('versionStatus');
  const f = useFormat();
  const role = useAuth().user?.role;
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debouncedQ, setDebouncedQ] = useState(q);
  const category = params.get('category') ?? '';
  const status = params.get('status') ?? '';
  const [uploadOpen, setUploadOpen] = useState(params.get('upload') === '1' && can.manageTemplates(role));

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('upload');
    router.replace(`/templates?${next}`);
  };

  const query = useQuery({
    queryKey: ['templates', { category, status, q: debouncedQ }],
    queryFn: () => api<{ items: TemplateListItem[] }>('/templates', { query: { category, status, q: debouncedQ } }),
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          can.manageTemplates(role) && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload /> {t('upload')}
            </Button>
          )
        }
      />
      <Card className="mb-4 grid gap-3 p-3 sm:grid-cols-3">
        <label className="relative">
          <span className="sr-only">{t('search')}</span>
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input className="pl-8" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Select aria-label={t('category')} value={category} onChange={(e) => setParam('category', e.target.value)}>
          <option value="">{t('allCategories')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {tc(c)}
            </option>
          ))}
        </Select>
        <Select aria-label={t('status')} value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">{t('allStatuses')}</option>
          {(['published', 'draft', 'archived'] as const).map((s) => (
            <option key={s} value={s}>
              {tv(s)}
            </option>
          ))}
        </Select>
      </Card>
      <QueryState query={query}>
        {({ items }) =>
          items.length === 0 ? (
            <EmptyState>{t('empty')}</EmptyState>
          ) : (
            <Card>
              <Table>
                <THead>
                  <TR>
                    <TH>{t('name')}</TH>
                    <TH>{t('category')}</TH>
                    <TH>{t('published')}</TH>
                    <TH>{t('latest')}</TH>
                    <TH>{t('created')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((tpl) => (
                    <TR key={tpl.id}>
                      <TD>
                        <Link href={`/templates/${tpl.id}`} className="font-medium text-primary hover:underline">
                          {tpl.title}
                        </Link>
                      </TD>
                      <TD>
                        <Badge variant="outline">{tc(tpl.category)}</Badge>
                      </TD>
                      <TD>{tpl.publishedVersion ? `v${tpl.publishedVersion.versionNumber}` : '—'}</TD>
                      <TD>
                        {tpl.latestVersion && (
                          <span className="flex items-center gap-2">
                            v{tpl.latestVersion.versionNumber} <VersionStatusBadge status={tpl.latestVersion.status} />
                          </span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{f.date(tpl.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )
        }
      </QueryState>
      {can.manageTemplates(role) && <UploadTemplateDialog open={uploadOpen} onOpenChange={setUploadOpen} />}
    </>
  );
}

export default function TemplatesPage() {
  return (
    <Suspense>
      <TemplatesList />
    </Suspense>
  );
}
