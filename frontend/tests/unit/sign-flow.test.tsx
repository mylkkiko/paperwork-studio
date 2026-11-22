import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SignFlow, signStateOf } from '@/components/sign/sign-flow';
import { ApiError } from '@/lib/api';
import { renderWithProviders } from '../setup/render';
import { signView } from '../setup/fixtures';
import { api, server } from '../setup/msw';

const TOKEN = 'tok_123';
const view = (status: number, body: unknown) => server.use(http.get(api(`/sign/${TOKEN}`), () => HttpResponse.json(body as object, { status })));
const error = (code: string) => ({ error: { code, message: code } });

describe('signStateOf', () => {
  it('maps API results to screens', () => {
    expect(signStateOf(undefined, null, true)).toBe('loading');
    expect(signStateOf(undefined, new ApiError(410, 'TOKEN_EXPIRED', ''), false)).toBe('expired');
    expect(signStateOf(undefined, new ApiError(410, 'TOKEN_REVOKED', ''), false)).toBe('revoked');
    expect(signStateOf(undefined, new ApiError(404, 'NOT_FOUND', ''), false)).toBe('invalid');
    expect(signStateOf(undefined, new ApiError(500, 'INTERNAL_ERROR', ''), false)).toBe('error');
    expect(signStateOf(signView({ status: 'viewed' }), null, false)).toBe('ready');
    expect(signStateOf(signView({ status: 'signed' }), null, false)).toBe('signed');
    expect(signStateOf(signView({ status: 'declined' }), null, false)).toBe('declined');
    expect(signStateOf(signView({ status: 'expired' }), null, false)).toBe('expired');
  });
});

describe('signing page', () => {
  it('Armenian by default: document info, and confirm is disabled until the checkbox is ticked', async () => {
    view(200, signView());
    renderWithProviders(<SignFlow token={TOKEN} />, { locale: 'hy' });
    expect(await screen.findByText('№ PS-2026-000001 · տարբերակ 2 · Աննա Հակոբյան')).toBeInTheDocument();
    const confirm = screen.getByTestId('confirm-sign');
    expect(confirm).toHaveTextContent('Հաստատել');
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ծանոթացել եմ փաստաթղթին և համաձայն եմ' }));
    expect(confirm).toBeEnabled();
  });

  it('shows the PDF (frame on desktop, "open" button on phones) from the public URL', async () => {
    view(200, signView());
    const { container } = renderWithProviders(<SignFlow token={TOKEN} />);
    await screen.findByTestId('confirm-sign');
    expect(container.querySelector('iframe')!.getAttribute('src')).toMatch(/\/sign\/tok_123\/pdf\?v=sent$/);
    expect(screen.getByTestId('open-pdf-mobile')).toHaveTextContent('Open the document (PDF)');
  });

  it('confirming sends { agree: true } and shows the success state', async () => {
    let signed = false;
    let body: unknown;
    server.use(
      http.get(api(`/sign/${TOKEN}`), () => HttpResponse.json(signView(signed ? { status: 'signed', signedAt: '2026-11-22T10:05:00Z', signatureMethod: 'online' } : {}))),
      http.post(api(`/sign/${TOKEN}`), async ({ request }) => {
        body = await request.json();
        signed = true;
        return HttpResponse.json({ status: 'signed', signedAt: '2026-11-22T10:05:00Z' });
      }),
    );
    renderWithProviders(<SignFlow token={TOKEN} />);
    await userEvent.click(await screen.findByRole('checkbox'));
    await userEvent.click(screen.getByTestId('confirm-sign'));
    expect(await screen.findByTestId('sign-success')).toHaveTextContent('Thank you, the document is confirmed.');
    expect(screen.getByTestId('sign-success')).toHaveTextContent('Confirmed online on 22 Nov 2026, 14:05');
    expect(body).toEqual({ agree: true });
  });

  it.each([
    [410, 'TOKEN_EXPIRED', 'sign-expired', 'This link has expired'],
    [410, 'TOKEN_REVOKED', 'sign-revoked', 'This link is no longer valid'],
    [404, 'NOT_FOUND', 'sign-invalid', 'Link not found'],
    [500, 'INTERNAL_ERROR', 'sign-error', 'The document could not be loaded'],
  ])('HTTP %i %s -> %s screen', async (status, code, testId, title) => {
    view(status, error(code));
    renderWithProviders(<SignFlow token={TOKEN} />);
    expect(await screen.findByTestId(testId)).toHaveTextContent(title);
    expect(screen.queryByTestId('confirm-sign')).toBeNull();
  });

  it('expired state in Armenian', async () => {
    view(410, error('TOKEN_EXPIRED'));
    renderWithProviders(<SignFlow token={TOKEN} />, { locale: 'hy' });
    expect(await screen.findByTestId('sign-expired')).toHaveTextContent('Հղման ժամկետն անցել է');
  });

  it('an already signed (paper) document shows a receipt', async () => {
    view(200, signView({ status: 'signed', signedAt: '2026-11-20T09:00:00Z', signatureMethod: 'paper' }));
    renderWithProviders(<SignFlow token={TOKEN} />);
    expect(await screen.findByTestId('sign-success')).toHaveTextContent('Signed on paper on 20 Nov 2026');
    expect(screen.queryByTestId('confirm-sign')).toBeNull();
  });

  it('declining sends the reason and shows the declined state', async () => {
    let declined = false;
    let body: unknown;
    server.use(
      http.get(api(`/sign/${TOKEN}`), () => HttpResponse.json(signView(declined ? { status: 'declined', declinedAt: '2026-11-22T10:00:00Z' } : {}))),
      http.post(api(`/sign/${TOKEN}/decline`), async ({ request }) => {
        body = await request.json();
        declined = true;
        return HttpResponse.json({ status: 'declined' });
      }),
    );
    renderWithProviders(<SignFlow token={TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'I do not agree' }));
    await userEvent.type(screen.getByLabelText('Reason (optional)'), 'Wrong amount');
    await userEvent.click(screen.getByRole('button', { name: 'Decline the document' }));
    expect(await screen.findByTestId('sign-declined')).toBeInTheDocument();
    expect(body).toEqual({ reason: 'Wrong amount' });
  });

  it('a signing error (e.g. signed meanwhile in another tab) is shown', async () => {
    view(200, signView());
    server.use(http.post(api(`/sign/${TOKEN}`), () => HttpResponse.json(error('ALREADY_SIGNED'), { status: 409 })));
    renderWithProviders(<SignFlow token={TOKEN} />);
    await userEvent.click(await screen.findByRole('checkbox'));
    await userEvent.click(screen.getByTestId('confirm-sign'));
    await waitFor(() => expect(screen.getByText('This document is already signed.')).toBeInTheDocument());
  });
});
