'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FileSpreadsheet, RefreshCw, Send, Sheet } from 'lucide-react';
import { api, apiBlob, download } from '@/lib/api';
import { DOCUMENT_STATUSES, type DocumentRow, type Group, type SendResult, type TemplateDetail, type TemplateListItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState, PageHeader, QueryState, useErrorMessage } from '@/components/states';
import { PdfViewer } from '@/components/pdf-viewer';
import { SignaturesTable } from '@/components/signatures/signatures-table';
import { PaperSignatureDialog } from '@/components/signatures/paper-signature-dialog';
import { filtersFromParams, filtersToQuery, type SignatureFilters } from '@/lib/signature-filters';

function SignaturesPageInner() {
  const t = useTranslations('signatures');
  const tStatus = useTranslations('docStatus');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const filters = filtersFromParams(params);
  const [selected, setSelected] = useState<string[]>([]);
  const [paperDoc, setPaperDoc] = useState<DocumentRow | null>(null);
  const [viewDoc, setViewDoc] = useState<DocumentRow | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  const setFilter = (patch: Partial<SignatureFilters>) => {
    const next = { ...filters, ...patch };
    if (patch.templateId !== undefined) next.versionId = '';
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v === true ? '1' : String(v));
    setSelected([]);
    router.replace(`/signatures?${qs}`);
  };

  const groups = useQuery({ queryKey: ['core', 'groups'], queryFn: () => api<{ items: Group[] }>('/core/groups') });
  const templates = useQuery({ queryKey: ['templates', {}], queryFn: () => api<{ items: TemplateListItem[] }>('/templates') });
  const template = useQuery({ queryKey: ['template', filters.templateId], queryFn: () => api<TemplateDetail>(`/templates/${filters.templateId}`), enabled: !!filters.templateId });
  const table = useQuery({ queryKey: ['signatures', filters], queryFn: () => api<{ items: DocumentRow[] }>('/signatures/table', { query: filtersToQuery(filters) }) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['signatures'] });
    qc.invalidateQueries({ queryKey: ['documents'] });
  };

  const remind = useMutation({
    mutationFn: (d: DocumentRow) => {
      setRemindingId(d.id);
      return api(`/documents/${d.id}/remind`, { method: 'POST' });
    },
    onSuccess: (_r, d) => {
      toast.success(t('reminded', { name: d.recipientName }));
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => setRemindingId(null),
  });

  const send = useMutation({
    mutationFn: () => api<SendResult>('/documents/send', { body: { documentIds: selected } }),
    onSuccess: (r) => {
      toast.success(t('sentToast', { count: r.sent }));
      setSelected([]);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const resend = useMutation({
    mutationFn: () => api<{ recipients: number; batches: { id: string }[] }>('/documents/resend-new-version', { body: { templateId: filters.templateId } }),
    onSuccess: async (r) => {
      toast.success(t('resendToast', { count: r.recipients }));
      // the new documents are generated in the background and emailed when ready
      await Promise.all(r.batches.map((b) => waitForBatch(b.id)));
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const exportAs = async (format: 'csv' | 'xlsx') => {
    setExporting(format);
    try {
      await download('/signatures/export', `signatures.${format}`, { ...filtersToQuery(filters), format, locale });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(null);
    }
  };

  const openScan = async (d: DocumentRow) => {
    try {
      const { blob } = await apiBlob(`/documents/${d.id}/scan`);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Button variant="outline" onClick={() => exportAs('csv')} loading={exporting === 'csv'}>
              <Sheet /> CSV
            </Button>
            <Button variant="outline" onClick={() => exportAs('xlsx')} loading={exporting === 'xlsx'}>
              <FileSpreadsheet /> XLSX
            </Button>
          </>
        }
      />

      <Card className="mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-group" className="text-xs">{t('group')}</Label>
          <Select id="f-group" value={filters.groupId} onChange={(e) => setFilter({ groupId: e.target.value })}>
            <option value="">{t('allGroups')}</option>
            {groups.data?.items.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-template" className="text-xs">{t('template')}</Label>
          <Select id="f-template" value={filters.templateId} onChange={(e) => setFilter({ templateId: e.target.value })}>
            <option value="">{t('allTemplates')}</option>
            {templates.data?.items.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.title}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-version" className="text-xs">{t('version')}</Label>
          <Select id="f-version" value={filters.versionId} disabled={!filters.templateId} onChange={(e) => setFilter({ versionId: e.target.value })}>
            <option value="">{t('allVersions')}</option>
            {template.data?.versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.versionNumber}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-status" className="text-xs">{t('status')}</Label>
          <Select id="f-status" value={filters.status} onChange={(e) => setFilter({ status: e.target.value })}>
            <option value="">{t('allStatuses')}</option>
            {DOCUMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tStatus(s)}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Checkbox checked={filters.olderVersion} onCheckedChange={(v) => setFilter({ olderVersion: v === true })} />
          {t('olderVersion')}
        </label>
      </Card>

      {filters.olderVersion && (table.data?.items.length ?? 0) > 0 && (
        <Alert variant="info" className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <AlertDescription>{filters.templateId ? t('olderHint', { count: table.data!.items.length }) : t('olderPickTemplate')}</AlertDescription>
          {filters.templateId && (
            <Button size="sm" onClick={() => resend.mutate()} loading={resend.isPending}>
              <RefreshCw /> {t('resend')}
            </Button>
          )}
        </Alert>
      )}

      {selected.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md border bg-background p-2 text-sm">
          <span>{t('selected', { count: selected.length })}</span>
          <Button size="sm" onClick={() => send.mutate()} loading={send.isPending}>
            <Send /> {t('sendSelected')}
          </Button>
        </div>
      )}

      <QueryState query={table}>
        {({ items }) =>
          items.length === 0 ? (
            <EmptyState>{t('empty')}</EmptyState>
          ) : (
            <Card>
              <SignaturesTable
                rows={items}
                selected={selected}
                onSelect={setSelected}
                onRemind={(d) => remind.mutate(d)}
                remindingId={remindingId}
                onPaper={setPaperDoc}
                onView={setViewDoc}
                onScan={openScan}
              />
            </Card>
          )
        }
      </QueryState>

      <PaperSignatureDialog doc={paperDoc} onClose={() => setPaperDoc(null)} />
      <Dialog open={!!viewDoc} onOpenChange={(o) => !o && setViewDoc(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {viewDoc?.number} · {viewDoc?.recipientName}
            </DialogTitle>
          </DialogHeader>
          {viewDoc && <PdfViewer apiPath={`/documents/${viewDoc.id}/pdf?inline=1`} title={viewDoc.number} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Poll a batch until it is finished (used after "resend new version"). */
async function waitForBatch(id: string, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const b = await api<{ status: string }>(`/batches/${id}`);
    if (b.status === 'completed' || b.status === 'failed') return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export default function SignaturesPage() {
  return (
    <Suspense>
      <SignaturesPageInner />
    </Suspense>
  );
}
