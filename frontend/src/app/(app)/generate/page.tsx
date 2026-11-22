'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Download, FileArchive, Play, RotateCcw, Send } from 'lucide-react';
import { api, ApiError, download } from '@/lib/api';
import type { Batch, DocumentRow, Precheck, SendResult } from '@/lib/types';
import { buildPayload, fieldTypesOf, initialState, STEPS, stepError, type Step, type WizardState } from '@/lib/wizard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { ErrorState, LoadingState, PageHeader, useErrorMessage } from '@/components/states';
import { Stepper } from '@/components/generate/stepper';
import { TemplateStep } from '@/components/generate/template-step';
import { RecipientsStep } from '@/components/generate/recipients-step';
import { PrecheckTable } from '@/components/generate/precheck-table';
import { SharedFieldsForm } from '@/components/generate/shared-fields-form';

const SHARED_FORM_ID = 'shared-fields-form';

function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function GeneratePage() {
  const t = useTranslations('generate');
  const tCommon = useTranslations('common');
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const [state, setState] = useState<WizardState>(initialState);
  const [step, setStep] = useState<Step>('template');
  const update = (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch }));

  // Precheck runs from step 3 on and re-runs (debounced) while values are typed in.
  const debounced = useDebounced(state);
  const precheckPayload = useMemo(() => (debounced.templateVersionId ? buildPayload(debounced) : null), [debounced]);
  const precheck = useQuery({
    queryKey: ['precheck', precheckPayload],
    queryFn: () => api<Precheck>('/batches/precheck', { body: precheckPayload }),
    enabled: Boolean(precheckPayload) && (step === 'precheck' || step === 'shared'),
    placeholderData: (prev) => prev,
  });
  const typing = state !== debounced || precheck.isFetching;

  const generate = useMutation({
    mutationFn: (commonValues: Record<string, string>) => {
      const next = { ...state, commonValues };
      update({ commonValues });
      return api<Batch>('/batches', { body: buildPayload(next, fieldTypesOf(precheck.data)) });
    },
    onSuccess: (batch) => {
      update({ batchId: batch.id });
      setStep('progress');
      qc.invalidateQueries({ queryKey: ['batches'] });
    },
  });

  const error = step === 'precheck' && typing ? 'precheckPending' : stepError(step, state, precheck.data);
  const index = STEPS.indexOf(step);
  const go = (delta: number) => setStep(STEPS[index + delta]);
  const restart = () => {
    setState(initialState);
    setStep('template');
    generate.reset();
  };

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Stepper current={step} />
      <Card>
        <CardHeader>
          <CardTitle>{t(`stepTitle.${step}`)}</CardTitle>
          <CardDescription>{t(`stepHint.${step}`)}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'template' && <TemplateStep state={state} onChange={update} />}
          {step === 'recipients' && <RecipientsStep state={state} onChange={update} />}
          {step === 'precheck' &&
            (precheck.error ? (
              <ErrorState error={precheck.error} onRetry={() => precheck.refetch()} />
            ) : !precheck.data ? (
              <LoadingState />
            ) : (
              <PrecheckTable
                precheck={precheck.data}
                overrides={state.overrides}
                excludedIds={state.excludedIds}
                onlyProblems
                onOverride={(rid, key, value) => update({ overrides: { ...state.overrides, [rid]: { ...state.overrides[rid], [key]: value } } })}
                onExclude={(rid, ex) => update({ excludedIds: ex ? [...state.excludedIds, rid] : state.excludedIds.filter((x) => x !== rid) })}
              />
            ))}
          {step === 'shared' &&
            (!precheck.data ? (
              <LoadingState />
            ) : (
              <div className="flex flex-col gap-4">
                <SharedFieldsForm formId={SHARED_FORM_ID} fields={precheck.data.commonFields} values={state.commonValues} onSubmit={(v) => generate.mutate(v)} />
                {generate.error && generateErrorAlert(generate.error)}
                <p className="text-sm text-muted-foreground">{t('willGenerate', { count: precheck.data.total })}</p>
              </div>
            ))}
          {step === 'progress' && state.batchId && <ProgressStep batchId={state.batchId} onDone={() => setStep('done')} />}
          {step === 'done' && state.batchId && <DoneStep batchId={state.batchId} />}
          {error && step !== 'template' && step !== 'recipients' && error !== 'precheckPending' && (
            <p className="mt-4 text-sm text-destructive" role="status">
              {t(`errors.${error}`)}
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-between border-t pt-4">
          {index > 0 && index < 4 ? (
            <Button variant="outline" onClick={() => go(-1)}>
              <ArrowLeft /> {tCommon('back')}
            </Button>
          ) : (
            <span />
          )}
          {index < 3 && (
            <Button onClick={() => go(1)} disabled={!!error} title={error ? t(`errors.${error}`) : undefined}>
              {tCommon('next')} <ArrowRight />
            </Button>
          )}
          {step === 'shared' && (
            <Button type="submit" form={SHARED_FORM_ID} loading={generate.isPending}>
              <Play /> {t('generate')}
            </Button>
          )}
          {step === 'done' && (
            <Button variant="outline" onClick={restart}>
              <RotateCcw /> {t('newPack')}
            </Button>
          )}
        </CardFooter>
      </Card>
    </>
  );

  function generateErrorAlert(error: unknown) {
    if (error instanceof ApiError && error.code === 'INVALID_VALUES') {
      const keys = (error.details as { key: string }[]).map((d) => d.key).join(', ');
      return (
        <Alert variant="destructive">
          <AlertDescription>{t('errors.invalidValues', { fields: keys })}</AlertDescription>
        </Alert>
      );
    }
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(error)}</AlertDescription>
      </Alert>
    );
  }
}

/** Step 5: poll the batch until the background job finishes. */
function ProgressStep({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const t = useTranslations('generate.progress');
  const query = useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => api<Batch>(`/batches/${batchId}`),
    refetchInterval: (q) => (q.state.data && ['completed', 'failed'].includes(q.state.data.status) ? false : 1000),
  });
  const batch = query.data;
  useEffect(() => {
    if (batch?.status === 'completed') onDone();
  }, [batch?.status, onDone]);

  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!batch) return <LoadingState rows={1} />;
  if (batch.status === 'failed')
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('failed', { error: batch.error ?? '' })}</AlertDescription>
      </Alert>
    );
  const pct = batch.total ? (batch.progress / batch.total) * 100 : 0;
  return (
    <div className="flex flex-col gap-3 py-4" aria-live="polite">
      <Progress value={pct} label={t('label')} />
      <p className="text-center text-lg font-medium" data-testid="progress-text">
        {batch.progress} / {batch.total}
      </p>
      <p className="text-center text-sm text-muted-foreground">{t(batch.status === 'queued' ? 'queued' : 'running')}</p>
    </div>
  );
}

/** Step 6: downloads and "send for signature". */
function DoneStep({ batchId }: { batchId: string }) {
  const t = useTranslations('generate.done');
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const batch = useQuery({ queryKey: ['batch', batchId], queryFn: () => api<Batch>(`/batches/${batchId}`) });
  const docs = useQuery({ queryKey: ['documents', { batchId }], queryFn: () => api<{ items: DocumentRow[] }>('/documents', { query: { batchId } }) });
  const [busy, setBusy] = useState<'zip' | 'pdf' | null>(null);

  const send = useMutation({
    mutationFn: () => api<SendResult>('/documents/send', { body: { documentIds: docs.data!.items.map((d) => d.id) } }),
    onSuccess: (r) => {
      toast.success(t('sentToast', { count: r.sent }));
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const get = async (kind: 'zip' | 'pdf') => {
    setBusy(kind);
    try {
      await download(`/batches/${batchId}/${kind === 'zip' ? 'zip' : 'merged-pdf'}`, kind === 'zip' ? 'pack.zip' : 'pack.pdf');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (batch.isPending || docs.isPending) return <LoadingState rows={2} />;
  if (batch.error || docs.error) return <ErrorState error={batch.error ?? docs.error} />;
  const b = batch.data!;
  const sent = send.data;
  return (
    <div className="flex flex-col gap-5">
      <Alert variant="success">
        <AlertDescription data-testid="done-message">{t('ready', { count: b.total, title: b.template?.title ?? '' })}</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => get('zip')} loading={busy === 'zip'}>
          <FileArchive /> {t('zip')}
        </Button>
        <Button variant="outline" onClick={() => get('pdf')} loading={busy === 'pdf'}>
          <Download /> {t('mergedPdf')}
        </Button>
      </div>
      <div className="flex flex-col gap-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">{t('sendHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => send.mutate()} loading={send.isPending} disabled={!!sent}>
            <Send /> {t('send', { count: docs.data!.items.length })}
          </Button>
          {sent && (
            <Button variant="link" asChild>
              <Link href={`/signatures?${b.groupId ? `groupId=${b.groupId}&` : ''}templateId=${b.template?.id ?? ''}`}>{t('openSignatures')}</Link>
            </Button>
          )}
        </div>
        {sent && (
          <p className="text-sm" data-testid="send-result">
            {t('sentResult', { sent: sent.sent, failed: sent.results.length - sent.sent })}
          </p>
        )}
      </div>
    </div>
  );
}
