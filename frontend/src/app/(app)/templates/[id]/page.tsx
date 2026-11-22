'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowLeft, Eye, GitCompare, Rocket, Trash2, Upload } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/roles';
import { useFormat } from '@/lib/format';
import type { TemplateDetail, VersionDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PageHeader, QueryState, useErrorMessage } from '@/components/states';
import { VersionStatusBadge } from '@/components/status-badge';
import { UploadTemplateDialog } from '@/components/upload-dialog';
import { PdfViewer } from '@/components/pdf-viewer';
import { WarningsList } from '@/components/warnings';

type Version = TemplateDetail['versions'][number];

export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('templateDetail');
  const tc = useTranslations('categories');
  const tCommon = useTranslations('common');
  const role = useAuth().user?.role;
  const f = useFormat();
  const router = useRouter();
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<Version | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useQuery({ queryKey: ['template', id], queryFn: () => api<TemplateDetail>(`/templates/${id}`) });

  const publish = useMutation({
    mutationFn: (vid: string) => api(`/templates/${id}/versions/${vid}/publish`, { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('published'));
      setPublishing(null);
      qc.invalidateQueries({ queryKey: ['template', id] });
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'UNKNOWN_FIELDS') toast.error(t('publishBlocked', { fields: (e.details as string[]).join(', ') }));
      else toast.error(errorMessage(e));
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('deleted'));
      qc.invalidateQueries({ queryKey: ['templates'] });
      router.replace('/templates');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <QueryState query={query}>
      {(tpl) => {
        const selected = tpl.versions.find((v) => v.id === selectedId) ?? tpl.versions[0];
        return (
          <>
            <Link href="/templates" className="mb-3 inline-flex items-center gap-1 rounded-sm text-sm text-text-muted hover:text-text">
              <ArrowLeft className="h-4 w-4" /> {t('back')}
            </Link>
            <PageHeader
              title={tpl.title}
              description={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text">{tc(tpl.category)}</span>
                  <span aria-hidden>·</span>
                  {t('documentCount', { count: tpl.documentCount })}
                </span>
              }
              actions={
                <>
                  {can.manageTemplates(role) && (
                    <Button onClick={() => setUploadOpen(true)}>
                      <Upload /> {t('uploadVersion')}
                    </Button>
                  )}
                  {can.deleteTemplates(role) && (
                    <Button variant="secondary" onClick={() => setConfirmDelete(true)} disabled={tpl.documentCount > 0} title={tpl.documentCount > 0 ? t('cannotDelete') : undefined}>
                      <Trash2 /> {tCommon('delete')}
                    </Button>
                  )}
                </>
              }
            />

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>{t('versions')}</CardTitle>
              </CardHeader>
              <Table>
                <THead>
                  <TR>
                    <TH>{t('version')}</TH>
                    <TH>{t('status')}</TH>
                    <TH className="hidden md:table-cell">{t('created')}</TH>
                    <TH className="hidden md:table-cell">{t('publishedAt')}</TH>
                    <TH numeric>{t('warnings')}</TH>
                    <TH className="text-right">{tCommon('actions')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {tpl.versions.map((v) => (
                    <TR key={v.id} className="cursor-pointer" data-selected={v.id === selected?.id} onClick={() => setSelectedId(v.id)} data-testid={`version-row-${v.versionNumber}`}>
                      <TD sticky className="tabular font-semibold">v{v.versionNumber}</TD>
                      <TD>
                        <VersionStatusBadge status={v.status} />
                      </TD>
                      <TD className="tabular hidden whitespace-nowrap text-text-muted md:table-cell">{f.dateTime(v.createdAt)}</TD>
                      <TD className="tabular hidden whitespace-nowrap text-text-muted md:table-cell">{f.dateTime(v.publishedAt)}</TD>
                      <TD numeric>{v.warnings.length ? <Badge variant="warning">{v.warnings.length}</Badge> : <span className="text-text-muted">—</span>}</TD>
                      <TD>
                        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="secondary" onClick={() => setPreviewId(v.id)} aria-label={t('preview')} title={t('preview')}>
                            <Eye /> <span className="hidden 2xl:inline">{t('preview')}</span>
                          </Button>
                          {v.comparedToId && (
                            <Button size="sm" variant="secondary" asChild>
                              <Link href={`/templates/${id}/compare?from=${v.comparedToId}&to=${v.id}`} aria-label={t('compare')} title={t('compare')}>
                                <GitCompare /> <span className="hidden 2xl:inline">{t('compare')}</span>
                              </Link>
                            </Button>
                          )}
                          {can.manageTemplates(role) && v.status === 'draft' && (
                            <Button size="sm" onClick={() => setPublishing(v)} aria-label={t('publish')} title={t('publish')}>
                              <Rocket /> <span className="hidden sm:inline">{t('publish')}</span>
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>

            {selected && <VersionPanel templateId={id} versionId={selected.id} />}

            {can.manageTemplates(role) && <UploadTemplateDialog open={uploadOpen} onOpenChange={setUploadOpen} templateId={id} />}

            <Dialog open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}>
              <DialogContent className="sm:max-w-4xl" closeLabel={tCommon('close')}>
                <DialogHeader>
                  <DialogTitle>{t('previewTitle')}</DialogTitle>
                  <DialogDescription>{t('previewHint')}</DialogDescription>
                </DialogHeader>
                {previewId && <PdfViewer apiPath={`/templates/${id}/versions/${previewId}/preview`} title={t('previewTitle')} />}
              </DialogContent>
            </Dialog>

            <Dialog open={!!publishing} onOpenChange={(o) => !o && setPublishing(null)}>
              <DialogContent closeLabel={tCommon('close')}>
                <DialogHeader>
                  <DialogTitle>{t('publishTitle', { version: publishing?.versionNumber ?? '' })}</DialogTitle>
                  <DialogDescription>{t('publishHint')}</DialogDescription>
                </DialogHeader>
                {publishing?.changeSummary && <pre className="whitespace-pre-wrap rounded-md bg-surface-muted p-3 font-sans text-sm leading-relaxed">{publishing.changeSummary}</pre>}
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setPublishing(null)}>
                    {tCommon('cancel')}
                  </Button>
                  <Button onClick={() => publishing && publish.mutate(publishing.id)} loading={publish.isPending}>
                    <Rocket /> {t('publish')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <DialogContent closeLabel={tCommon('close')}>
                <DialogHeader>
                  <DialogTitle>{t('deleteTitle')}</DialogTitle>
                  <DialogDescription>{t('deleteHint', { title: tpl.title })}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                    {tCommon('cancel')}
                  </Button>
                  <Button variant="destructive" onClick={() => remove.mutate()} loading={remove.isPending}>
                    <Trash2 /> {tCommon('delete')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        );
      }}
    </QueryState>
  );
}

/** Fields of one version (unknown fields highlighted), its warnings and its change summary. */
function VersionPanel({ templateId, versionId }: { templateId: string; versionId: string }) {
  const t = useTranslations('templateDetail');
  const tSource = useTranslations('fieldSource');
  const tType = useTranslations('fieldType');
  const query = useQuery({ queryKey: ['version', versionId], queryFn: () => api<VersionDetail>(`/templates/${templateId}/versions/${versionId}`) });
  return (
    <QueryState query={query} rows={3}>
      {(v) => {
        const unknown = v.fields.filter((fl) => !fl.known);
        return (
          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader>
                <CardTitle>{t('fieldsTitle', { version: v.versionNumber })}</CardTitle>
                <CardDescription>{unknown.length ? t('unknownCount', { count: unknown.length }) : t('allKnown')}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <WarningsList warnings={v.warnings} />
                <ul className="flex flex-wrap gap-1.5" data-testid="fields">
                  {v.fields.map((fl) => (
                    <li key={fl.key}>
                      <Badge variant={fl.known ? 'neutral' : 'danger'} title={fl.known ? `${fl.label} · ${tSource(fl.source!)} · ${tType(fl.type!)}` : t('unknownField')} data-unknown={!fl.known || undefined}>
                        <code>{`{{${fl.key}}}`}</code>
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('summaryTitle')}</CardTitle>
                <CardDescription>{v.comparedToId ? t('summaryHint') : t('noComparison')}</CardDescription>
              </CardHeader>
              {v.changeSummary && (
                <CardContent>
                  <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed" lang="hy">
                    {v.changeSummary.split('\n').filter(Boolean).map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </CardContent>
              )}
            </Card>
          </div>
        );
      }}
    </QueryState>
  );
}
