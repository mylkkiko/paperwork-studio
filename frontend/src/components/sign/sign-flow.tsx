'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, FileX2, Link2Off, XCircle } from 'lucide-react';
import { api, apiUrl, ApiError } from '@/lib/api';
import { useFormat } from '@/lib/format';
import type { SignView } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingState, useErrorMessage } from '@/components/states';
import { PdfViewer } from '@/components/pdf-viewer';

export type SignState = 'loading' | 'invalid' | 'expired' | 'revoked' | 'error' | 'ready' | 'signed' | 'declined';

/** Which screen to show for the token lookup result. */
export function signStateOf(data: SignView | undefined, error: unknown, isPending: boolean): SignState {
  if (isPending) return 'loading';
  if (error instanceof ApiError) {
    if (error.code === 'TOKEN_EXPIRED') return 'expired';
    if (error.code === 'TOKEN_REVOKED') return 'revoked';
    if (error.status === 404) return 'invalid';
    return 'error';
  }
  if (error || !data) return 'error';
  if (data.status === 'signed') return 'signed';
  if (data.status === 'declined') return 'declined';
  if (data.status === 'expired') return 'expired';
  return 'ready';
}

/**
 * Public signing (S-2): no login, the token in the link is the credential.
 * Shows the PDF, a small "I have read and agree" checkbox and a confirm button; plus the end states.
 */
export function SignFlow({ token }: { token: string }) {
  const t = useTranslations('sign');
  const f = useFormat();
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  const [agree, setAgree] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  const query = useQuery({ queryKey: ['sign', token], queryFn: () => api<SignView>(`/sign/${token}`, { anonymous: true }), retry: false });
  const sign = useMutation({
    mutationFn: () => api<{ status: 'signed'; signedAt: string }>(`/sign/${token}`, { body: { agree: true }, anonymous: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sign', token] }),
  });
  const decline = useMutation({
    mutationFn: () => api(`/sign/${token}/decline`, { body: { reason: reason.trim() || undefined }, anonymous: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sign', token] }),
  });

  const state = signStateOf(query.data, query.error, query.isPending);
  const doc = query.data;

  if (state === 'loading') return <LoadingState rows={5} />;
  if (state === 'invalid') return <EndState icon={<Link2Off className="h-10 w-10 text-muted-foreground" />} title={t('invalidTitle')} text={t('invalidText')} testId="sign-invalid" />;
  if (state === 'expired') return <EndState icon={<Clock className="h-10 w-10 text-warning" />} title={t('expiredTitle')} text={t('expiredText')} testId="sign-expired" />;
  if (state === 'revoked') return <EndState icon={<Link2Off className="h-10 w-10 text-warning" />} title={t('revokedTitle')} text={t('revokedText')} testId="sign-revoked" />;
  if (state === 'error') return <EndState icon={<FileX2 className="h-10 w-10 text-destructive" />} title={t('errorTitle')} text={errorMessage(query.error)} testId="sign-error" />;

  const pdfSrc = apiUrl(`/sign/${token}/pdf`, { v: doc!.signedAt ?? doc!.status });
  const header = (
    <CardHeader>
      <CardTitle className="text-lg">{doc!.title}</CardTitle>
      <CardDescription>
        {t('documentInfo', { number: doc!.documentNumber, version: doc!.versionNumber, name: doc!.recipientName })}
      </CardDescription>
    </CardHeader>
  );

  if (state === 'signed' || state === 'declined') {
    return (
      <Card>
        {header}
        <CardContent className="flex flex-col gap-4">
          {state === 'signed' ? (
            <Alert variant="success" data-testid="sign-success">
              <CheckCircle2 className="text-success" />
              <AlertDescription>
                <p className="font-medium">{t('signedTitle')}</p>
                <p>{t(doc!.signatureMethod === 'paper' ? 'signedPaperText' : 'signedText', { date: f.dateTime(doc!.signedAt) })}</p>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive" data-testid="sign-declined">
              <XCircle />
              <AlertDescription>
                <p className="font-medium">{t('declinedTitle')}</p>
                <p>{t('declinedText', { date: f.dateTime(doc!.declinedAt) })}</p>
              </AlertDescription>
            </Alert>
          )}
          <PdfViewer src={pdfSrc} title={doc!.title} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {header}
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('expiresAt', { date: f.date(doc!.expiresAt) })}</p>
        <PdfViewer src={pdfSrc} title={doc!.title} />
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t bg-background/95 p-4 backdrop-blur sm:static sm:mx-0 sm:rounded-md sm:border">
          <label className="flex items-start gap-3 text-sm" htmlFor="agree">
            <Checkbox id="agree" checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
            <span>{t('agree')}</span>
          </label>
          {sign.error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(sign.error)}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button size="lg" disabled={!agree} loading={sign.isPending} onClick={() => sign.mutate()} data-testid="confirm-sign">
              {t('confirm')}
            </Button>
            <Button variant="link" className="text-muted-foreground" onClick={() => setDeclining((d) => !d)}>
              {t('decline')}
            </Button>
          </div>
          {declining && (
            <div className="flex flex-col gap-2">
              <label htmlFor="reason" className="text-sm">{t('declineReason')}</label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
              <Button variant="destructive" onClick={() => decline.mutate()} loading={decline.isPending} className="self-start">
                {t('declineConfirm')}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EndState({ icon, title, text, testId }: { icon: React.ReactNode; title: string; text: string; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        {icon}
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
