'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, FileX2, Link2Off, Printer, XCircle } from 'lucide-react';
import { api, apiUrl, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import type { SignView } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingState, useErrorMessage } from '@/components/states';
import { PdfViewer } from '@/components/pdf-viewer';

export type SignState = 'loading' | 'invalid' | 'revoked' | 'error' | 'open' | 'expired' | 'signed' | 'declined';

/** Which screen to show for the token lookup result. */
export function signStateOf(data: SignView | undefined, error: unknown, isPending: boolean): SignState {
  if (isPending) return 'loading';
  if (error instanceof ApiError) {
    if (error.code === 'TOKEN_REVOKED') return 'revoked';
    if (error.status === 404) return 'invalid';
    return 'error';
  }
  if (error || !data) return 'error';
  if (data.status === 'signed') return 'signed';
  if (data.status === 'declined') return 'declined';
  if (data.status === 'expired') return 'expired';
  return 'open';
}

/**
 * Public document page (S-2): no login. Signatures are handwritten on paper, so this page only delivers the
 * document: the PDF, a Download / Print button, a short instruction and "I do not agree".
 * The document becomes "signed" only when the coordinator uploads the scan of the signed paper.
 */
export function SignFlow({ token }: { token: string }) {
  const t = useTranslations('sign');
  const f = useFormat();
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  const query = useQuery({ queryKey: ['sign', token], queryFn: () => api<SignView>(`/sign/${token}`, { anonymous: true }), retry: false });
  const decline = useMutation({
    mutationFn: () => api(`/sign/${token}/decline`, { body: { reason: reason.trim() || undefined }, anonymous: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sign', token] }),
  });

  const state = signStateOf(query.data, query.error, query.isPending);
  const doc = query.data;

  if (state === 'loading') return <LoadingState rows={5} />;
  if (state === 'invalid') return <EndState icon={<Link2Off className="h-8 w-8 text-text-muted" />} title={t('invalidTitle')} text={t('invalidText')} testId="sign-invalid" />;
  if (state === 'revoked') return <EndState icon={<Link2Off className="h-8 w-8 text-warning-fg" />} title={t('revokedTitle')} text={t('revokedText')} testId="sign-revoked" />;
  if (state === 'error') return <EndState icon={<FileX2 className="h-8 w-8 text-danger-fg" />} title={t('errorTitle')} text={errorMessage(query.error)} testId="sign-error" />;

  const pdfSrc = apiUrl(`/sign/${token}/pdf`, { v: doc!.status });
  const download = (
    <Button asChild size="lg" variant={state === 'open' ? 'default' : 'secondary'} className="w-full sm:w-auto">
      <a href={pdfSrc} target="_blank" rel="noreferrer" data-testid="download-pdf">
        <Printer aria-hidden /> {t('download')}
      </a>
    </Button>
  );

  return (
    <Card data-testid="sign-page" data-state={state}>
      <CardHeader>
        <CardTitle className="text-xl">{doc!.title}</CardTitle>
        <CardDescription>{t('documentInfo', { number: doc!.documentNumber, version: doc!.versionNumber, name: doc!.recipientName })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state === 'signed' && (
          <Alert variant="success" data-testid="sign-success">
            <CheckCircle2 />
            <AlertDescription>
              <p className="font-medium">{t('signedTitle')}</p>
              <p>{t('signedText', { date: f.date(doc!.signedAt) })}</p>
            </AlertDescription>
          </Alert>
        )}
        {state === 'declined' && (
          <Alert variant="destructive" data-testid="sign-declined">
            <XCircle />
            <AlertDescription>
              <p className="font-medium">{t('declinedTitle')}</p>
              <p>{t('declinedText', { date: f.dateTime(doc!.declinedAt) })}</p>
            </AlertDescription>
          </Alert>
        )}
        {state === 'expired' && (
          <Alert variant="warning" data-testid="sign-expired">
            <Clock />
            <AlertDescription>
              <p className="font-medium">{t('expiredTitle')}</p>
              <p>{t('expiredText', { date: f.date(doc!.expiresAt) })}</p>
            </AlertDescription>
          </Alert>
        )}

        {state === 'open' && (
          <section className="flex flex-col gap-4 rounded-lg border bg-surface-muted p-4" aria-labelledby="how-to-sign" data-testid="sign-instruction">
            <h2 id="how-to-sign" className="text-base font-semibold">
              {t('howTitle')}
            </h2>
            <ol className="flex flex-col gap-2.5 text-base">
              {[t('step1'), t('step2'), t('step3', { date: f.date(doc!.expiresAt) })].map((text, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-fg" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{text}</span>
                </li>
              ))}
            </ol>
            {download}
          </section>
        )}
        {state !== 'open' && <div>{download}</div>}

        <PdfViewer src={pdfSrc} title={doc!.title} mobileOpen={false} />

        {state === 'open' && (
          <div className="flex flex-col gap-3 border-t pt-4">
            <Button variant="ghost" className="self-start text-text-muted" onClick={() => setDeclining((d) => !d)} aria-expanded={declining} data-testid="decline-toggle">
              {t('decline')}
            </Button>
            {declining && (
              <div className="flex flex-col gap-2">
                <label htmlFor="reason" className="text-sm">
                  {t('declineReason')}
                </label>
                <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
                {decline.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{errorMessage(decline.error)}</AlertDescription>
                  </Alert>
                )}
                <Button variant="destructive" onClick={() => decline.mutate()} loading={decline.isPending} className="self-start">
                  {t('declineConfirm')}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EndState({ icon, title, text, testId }: { icon: React.ReactNode; title: string; text: string; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted">{icon}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-sm text-base text-text-muted">{text}</p>
      </CardContent>
    </Card>
  );
}
