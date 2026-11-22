'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowLeft, RotateCcw, Rocket, Save } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/roles';
import type { Comparison, TemplateDetail, VersionDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { EmptyState, ErrorState, LoadingState, PageHeader, useErrorMessage } from '@/components/states';
import { VersionStatusBadge } from '@/components/status-badge';
import { ClauseRow } from '@/components/diff-view';

function ComparePageInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const t = useTranslations('compare');
  const locale = useLocale();

  const template = useQuery({ queryKey: ['template', id], queryFn: () => api<TemplateDetail>(`/templates/${id}`) });
  const versions = template.data?.versions ?? [];
  // Defaults: the latest version against the version it was compared with on upload.
  const latest = versions[0];
  const to = params.get('to') ?? latest?.id ?? '';
  const from = params.get('from') ?? versions.find((v) => v.id === to)?.comparedToId ?? versions[1]?.id ?? '';

  const comparison = useQuery({
    queryKey: ['compare', id, from, to, locale],
    queryFn: () => api<Comparison>(`/templates/${id}/compare`, { query: { from, to, locale } }),
    enabled: Boolean(from && to),
  });
  const [showUnchanged, setShowUnchanged] = useState(false);

  const setVersion = (key: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(params);
    next.set('from', from);
    next.set('to', to);
    next.set(key, value);
    router.replace(`/templates/${id}/compare?${next}`);
  };

  if (template.isPending) return <LoadingState />;
  if (template.error) return <ErrorState error={template.error} onRetry={() => template.refetch()} />;
  const tpl = template.data!;
  const toVersion = versions.find((v) => v.id === to);

  return (
    <>
      <Link href={`/templates/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {tpl.title}
      </Link>
      <PageHeader title={t('title')} description={tpl.title} />

      {versions.length < 2 ? (
        <EmptyState>{t('needTwo')}</EmptyState>
      ) : (
        <>
          <Card className="mb-4 grid gap-3 p-3 sm:grid-cols-2">
            {(['from', 'to'] as const).map((key) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={`v-${key}`}>{t(key)}</Label>
                <Select id={`v-${key}`} value={key === 'from' ? from : to} onChange={(e) => setVersion(key, e.target.value)}>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.versionNumber} · {t(`versionStatus.${v.status}`)}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </Card>

          {toVersion && <SummaryEditor templateId={id} versionId={toVersion.id} autoSummary={comparison.data?.summary} />}

          {comparison.isPending ? (
            <LoadingState rows={8} />
          ) : comparison.error ? (
            <ErrorState error={comparison.error} onRetry={() => comparison.refetch()} />
          ) : (
            <Card className="overflow-hidden">
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2" data-testid="compare-counts">
                  <Badge variant="success">{t('count.added', { count: comparison.data!.counts.added })}</Badge>
                  <Badge variant="destructive">{t('count.removed', { count: comparison.data!.counts.removed })}</Badge>
                  <Badge variant="warning">{t('count.changed', { count: comparison.data!.counts.changed })}</Badge>
                  <Badge variant="secondary">{t('count.unchanged', { count: comparison.data!.counts.unchanged })}</Badge>
                  {comparison.data!.counts.moved > 0 && <Badge variant="outline">{t('count.moved', { count: comparison.data!.counts.moved })}</Badge>}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={showUnchanged} onCheckedChange={(v) => setShowUnchanged(v === true)} />
                  {t('showUnchanged')}
                </label>
              </CardHeader>
              <div className="hidden grid-cols-2 gap-3 border-y bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
                <span>{t('oldColumn', { version: versions.find((v) => v.id === from)?.versionNumber ?? '' })}</span>
                <span>{t('newColumn', { version: toVersion?.versionNumber ?? '' })}</span>
              </div>
              <div>
                {comparison.data!.changes
                  .filter((c) => showUnchanged || c.status !== 'unchanged' || c.moved)
                  .map((c, i) => (
                    <ClauseRow key={i} change={c} />
                  ))}
                {!showUnchanged && comparison.data!.changes.every((c) => c.status === 'unchanged' && !c.moved) && (
                  <p className="p-6 text-center text-sm text-muted-foreground">{t('identical')}</p>
                )}
              </div>
              <CardContent className="flex flex-wrap gap-4 border-t py-3 text-xs text-muted-foreground sm:py-3">
                <span>
                  <del className="rounded bg-red-100 px-1 text-red-800">{t('legendRemoved')}</del>
                </span>
                <span>
                  <ins className="rounded bg-green-100 px-1 text-green-800 no-underline">{t('legendAdded')}</ins>
                </span>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  );
}

/**
 * Change summary of the target version. Stored in Armenian (it goes into emails), editable by editors while the
 * version is a draft (V-5). The auto-generated lines in the current UI language are shown alongside.
 */
function SummaryEditor({ templateId, versionId, autoSummary }: { templateId: string; versionId: string; autoSummary?: string[] }) {
  const t = useTranslations('compare');
  const tCommon = useTranslations('common');
  const role = useAuth().user?.role;
  const locale = useLocale();
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  const version = useQuery({ queryKey: ['version', versionId], queryFn: () => api<VersionDetail>(`/templates/${templateId}/versions/${versionId}`) });
  const [text, setText] = useState('');
  useEffect(() => setText(version.data?.changeSummary ?? ''), [version.data?.changeSummary]);

  const editable = can.manageTemplates(role) && version.data?.status === 'draft';
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['version', versionId] });
    qc.invalidateQueries({ queryKey: ['template', templateId] });
    qc.invalidateQueries({ queryKey: ['templates'] });
  };
  const save = useMutation({
    mutationFn: () => api(`/templates/${templateId}/versions/${versionId}`, { method: 'PATCH', body: { changeSummary: text } }),
    onSuccess: () => {
      toast.success(t('summarySaved'));
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const regenerate = useMutation({
    // the stored summary is Armenian: regenerate it in Armenian whatever the UI language
    mutationFn: () => api<Comparison>(`/templates/${templateId}/compare`, { query: { from: version.data!.comparedToId!, to: versionId, locale: 'hy' } }),
    onSuccess: (c) => setText((c.summary ?? []).join('\n')),
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (editable && text !== (version.data?.changeSummary ?? '')) await api(`/templates/${templateId}/versions/${versionId}`, { method: 'PATCH', body: { changeSummary: text } });
      return api(`/templates/${templateId}/versions/${versionId}/publish`, { method: 'POST' });
    },
    onSuccess: () => {
      toast.success(t('published'));
      invalidate();
    },
    onError: (e) => toast.error(e instanceof ApiError && e.code === 'UNKNOWN_FIELDS' ? t('publishBlocked', { fields: (e.details as string[]).join(', ') }) : errorMessage(e)),
  });

  if (version.isPending) return <LoadingState rows={2} />;
  if (version.error) return <ErrorState error={version.error} />;
  const v = version.data!;

  return (
    <Card className="mb-4" data-testid="summary-card">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            {t('summaryTitle', { version: v.versionNumber })} <VersionStatusBadge status={v.status} />
          </CardTitle>
          <CardDescription>{editable ? t('summaryEditable') : t('summaryReadonly')}</CardDescription>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            {v.comparedToId && (
              <Button variant="outline" size="sm" onClick={() => regenerate.mutate()} loading={regenerate.isPending}>
                <RotateCcw /> {t('regenerate')}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={text === (v.changeSummary ?? '')}>
              <Save /> {tCommon('save')}
            </Button>
            <Button size="sm" onClick={() => publish.mutate()} loading={publish.isPending}>
              <Rocket /> {t('publish')}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="summary">{t('summaryStored')}</Label>
          {editable ? (
            <Textarea id="summary" lang="hy" rows={Math.max(4, text.split('\n').length + 1)} value={text} onChange={(e) => setText(e.target.value)} />
          ) : (
            <ul id="summary" lang="hy" className="list-disc space-y-1 rounded-md bg-muted/50 p-3 pl-7 text-sm">
              {(v.changeSummary ?? '').split('\n').filter(Boolean).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </div>
        {locale !== 'hy' && autoSummary && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t('summaryAuto')}</span>
            <ul className="list-disc space-y-1 rounded-md bg-muted/50 p-3 pl-7 text-sm" data-testid="auto-summary">
              {autoSummary.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <ComparePageInner />
    </Suspense>
  );
}
