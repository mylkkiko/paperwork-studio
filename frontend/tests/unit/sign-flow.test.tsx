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
    expect(signStateOf(undefined, new ApiError(410, 'TOKEN_REVOKED', ''), false)).toBe('revoked');
    expect(signStateOf(undefined, new ApiError(404, 'NOT_FOUND', ''), false)).toBe('invalid');
    expect(signStateOf(undefined, new ApiError(500, 'INTERNAL_ERROR', ''), false)).toBe('error');
    expect(signStateOf(signView({ status: 'sent' }), null, false)).toBe('open');
    expect(signStateOf(signView({ status: 'viewed' }), null, false)).toBe('open');
    expect(signStateOf(signView({ status: 'signed' }), null, false)).toBe('signed');
    expect(signStateOf(signView({ status: 'declined' }), null, false)).toBe('declined');
    expect(signStateOf(signView({ status: 'expired' }), null, false)).toBe('expired');
  });
});

describe('document page (paper-only signatures)', () => {
  it('Armenian by default: document info, the instruction and Download / Print; no checkbox, no sign button', async () => {
    view(200, signView({ status: 'viewed' }));
    renderWithProviders(<SignFlow token={TOKEN} />, { locale: 'hy' });
    expect(await screen.findByText('№ PS-2026-000001 · տարբերակ 2 · Աննա Հակոբյան')).toBeInTheDocument();
    const how = screen.getByTestId('sign-instruction');
    expect(how).toHaveTextContent('Ինչպես ստորագրել');
    expect(how).toHaveTextContent('Ներբեռնեք կամ տպեք փաստաթուղթը։');
    expect(how).toHaveTextContent('Ստորագրեք ձեռքով ☐ վանդակի կողքին։');
    expect(how).toHaveTextContent('Ստորագրված թուղթը հանձնեք Ձեր համակարգողին մինչև 5 դեկ 2026։');
    expect(screen.getByTestId('download-pdf')).toHaveTextContent('Ներբեռնել / Տպել');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByTestId('confirm-sign')).toBeNull();
    expect(screen.queryByRole('button', { name: /Հաստատել|Confirm|Sign/i })).toBeNull();
  });

  it('shows the PDF from the public URL; Download / Print opens the same PDF in a new tab', async () => {
    view(200, signView());
    const { container } = renderWithProviders(<SignFlow token={TOKEN} />);
    const download = await screen.findByTestId('download-pdf');
    expect(container.querySelector('iframe')!.getAttribute('src')).toMatch(/\/sign\/tok_123\/pdf\?v=sent$/);
    expect(download).toHaveTextContent('Download / Print');
    expect(download.getAttribute('href')).toBe(container.querySelector('iframe')!.getAttribute('src'));
    expect(download).toHaveAttribute('target', '_blank');
    expect(screen.queryByTestId('open-pdf-mobile')).toBeNull(); // the Download / Print button covers phones
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
    expect(screen.getByTestId('sign-page')).toHaveAttribute('data-state', 'declined');
    expect(screen.queryByTestId('sign-instruction')).toBeNull();
    expect(screen.queryByRole('button', { name: 'I do not agree' })).toBeNull();
    expect(body).toEqual({ reason: 'Wrong amount' });
  });

  it('a decline error (e.g. the deadline passed meanwhile) is shown', async () => {
    view(200, signView());
    server.use(http.post(api(`/sign/${TOKEN}/decline`), () => HttpResponse.json(error('TOKEN_EXPIRED'), { status: 410 })));
    renderWithProviders(<SignFlow token={TOKEN} />);
    await userEvent.click(await screen.findByRole('button', { name: 'I do not agree' }));
    await userEvent.click(screen.getByRole('button', { name: 'Decline the document' }));
    await waitFor(() => expect(screen.getByText('The deadline for this document has passed.')).toBeInTheDocument());
  });

  it('signed: "signed on paper on <date>" with the document still visible', async () => {
    view(200, signView({ status: 'signed', signedAt: '2026-11-20T09:00:00Z', signatureMethod: 'paper' }));
    const { container } = renderWithProviders(<SignFlow token={TOKEN} />);
    expect(await screen.findByTestId('sign-success')).toHaveTextContent('The signed document has been received.');
    expect(screen.getByTestId('sign-success')).toHaveTextContent('Signed on paper on 20 Nov 2026');
    expect(container.querySelector('iframe')).not.toBeNull();
    expect(screen.queryByTestId('sign-instruction')).toBeNull();
    expect(screen.queryByRole('button', { name: 'I do not agree' })).toBeNull();
  });

  it('expired: the document is still shown with "deadline passed, contact your coordinator"; no decline', async () => {
    view(200, signView({ status: 'expired' }));
    const { container } = renderWithProviders(<SignFlow token={TOKEN} />);
    const note = await screen.findByTestId('sign-expired');
    expect(note).toHaveTextContent('The deadline has passed');
    expect(note).toHaveTextContent('The signed document was due by 5 Dec 2026. Please contact your coordinator.');
    expect(container.querySelector('iframe')).not.toBeNull();
    expect(screen.getByTestId('download-pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'I do not agree' })).toBeNull();
  });

  it('expired in Armenian and Russian', async () => {
    view(200, signView({ status: 'expired' }));
    const hy = renderWithProviders(<SignFlow token={TOKEN} />, { locale: 'hy' });
    expect(await screen.findByTestId('sign-expired')).toHaveTextContent('Հանձնման ժամկետն անցել է');
    hy.unmount();
    renderWithProviders(<SignFlow token={TOKEN} />, { locale: 'ru' });
    expect(await screen.findByTestId('sign-expired')).toHaveTextContent('Срок сдачи истёк');
  });

  it.each([
    [410, 'TOKEN_REVOKED', 'sign-revoked', 'This link is no longer valid'],
    [404, 'NOT_FOUND', 'sign-invalid', 'Link not found'],
    [500, 'INTERNAL_ERROR', 'sign-error', 'The document could not be loaded'],
  ])('HTTP %i %s -> %s screen', async (status, code, testId, title) => {
    view(status, error(code));
    renderWithProviders(<SignFlow token={TOKEN} />);
    expect(await screen.findByTestId(testId)).toHaveTextContent(title);
    expect(screen.queryByTestId('download-pdf')).toBeNull();
  });
});
