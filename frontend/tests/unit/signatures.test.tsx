import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { filtersFromParams, filtersToQuery } from '@/lib/signature-filters';
import { SignaturesTable } from '@/components/signatures/signatures-table';
import SignaturesPage from '@/app/(app)/signatures/page';
import { renderWithProviders } from '../setup/render';
import { doc } from '../setup/fixtures';
import { api, server } from '../setup/msw';
import { navigation } from '../setup/navigation';

describe('signature filters', () => {
  it('URL params <-> API query', () => {
    const f = filtersFromParams(new URLSearchParams('groupId=g1&templateId=t1&status=signed&olderVersion=1'));
    expect(f).toEqual({ groupId: 'g1', templateId: 't1', versionId: '', status: 'signed', olderVersion: true });
    expect(filtersToQuery(f)).toEqual({ groupId: 'g1', templateId: 't1', versionId: '', status: 'signed', olderVersion: 'true' });
    expect(filtersToQuery(filtersFromParams(new URLSearchParams())).olderVersion).toBeUndefined();
  });
});

describe('SignaturesTable', () => {
  const rows = [
    doc({ id: 'a', recipientId: 'stu-001', status: 'sent' }),
    doc({ id: 'b', recipientId: 'stu-002', status: 'signed', signedAt: '2026-11-22T10:00:00Z', signatureMethod: 'online', isCurrentVersion: false }),
    doc({ id: 'c', recipientId: 'stu-003', status: 'signed', signedAt: '2026-11-22T10:00:00Z', signatureMethod: 'paper', hasScan: true }),
    doc({ id: 'd', recipientId: 'stu-004', status: 'created' }),
    doc({ id: 'e', recipientId: 'stu-005', status: 'declined' }),
  ];
  const handlers = () => ({ onSelect: vi.fn(), onRemind: vi.fn(), onPaper: vi.fn(), onView: vi.fn(), onScan: vi.fn() });

  it('shows the actions each status allows', () => {
    renderWithProviders(<SignaturesTable rows={rows} selected={[]} {...handlers()} />);
    const actions = (rid: string) => within(screen.getByTestId(`sig-row-${rid}`)).queryAllByRole('button').map((b) => b.getAttribute('aria-label')).filter(Boolean);
    expect(actions('stu-001')).toEqual(['Remind', 'Paper']); // sent
    expect(actions('stu-002')).toEqual([]); // signed online
    expect(actions('stu-003')).toEqual(['Scan']); // signed on paper with a scan
    expect(actions('stu-004')).toEqual(['Paper']); // created: can't remind before sending
    expect(actions('stu-005')).toEqual([]); // declined
  });

  it('marks current vs older versions', () => {
    renderWithProviders(<SignaturesTable rows={rows} selected={[]} {...handlers()} />);
    expect(screen.getByTestId('sig-row-stu-001')).toHaveTextContent('current');
    expect(screen.getByTestId('sig-row-stu-002')).toHaveTextContent('older');
  });

  it('"select all" selects only documents that can still be sent', async () => {
    const h = handlers();
    renderWithProviders(<SignaturesTable rows={rows} selected={[]} {...h} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(h.onSelect).toHaveBeenCalledWith(['a', 'd']);
    expect(within(screen.getByTestId('sig-row-stu-002')).getByRole('checkbox')).toBeDisabled();
  });

  it('remind and paper buttons call back with the row', async () => {
    const h = handlers();
    renderWithProviders(<SignaturesTable rows={rows} selected={[]} {...h} />);
    await userEvent.click(within(screen.getByTestId('sig-row-stu-001')).getByRole('button', { name: 'Remind' }));
    expect(h.onRemind).toHaveBeenCalledWith(rows[0]);
    await userEvent.click(within(screen.getByTestId('sig-row-stu-004')).getByRole('button', { name: 'Paper' }));
    expect(h.onPaper).toHaveBeenCalledWith(rows[3]);
    await userEvent.click(screen.getAllByText('PS-2026-000001')[0]);
    expect(h.onView).toHaveBeenCalledWith(rows[0]);
  });
});

describe('Signatures page filters (MSW)', () => {
  const tableRequests: URL[] = [];
  const setup = () => {
    tableRequests.length = 0;
    server.use(
      http.get(api('/core/groups'), () => HttpResponse.json({ items: [{ id: 'g1', name: 'ՎԾ-2026-Ա', courseName: 'Վեբ', startDate: '', endDate: '', schedule: '', studentCount: 24 }] })),
      http.get(api('/templates'), () => HttpResponse.json({ items: [{ id: 't1', title: 'Ուսուցման պայմանագիր', category: 'student_agreement' }] })),
      http.get(api('/templates/t1'), () => HttpResponse.json({ id: 't1', versions: [{ id: 'v2', versionNumber: 2 }, { id: 'v1', versionNumber: 1 }] })),
      http.get(api('/signatures/table'), ({ request }) => {
        const url = new URL(request.url);
        tableRequests.push(url);
        const older = url.searchParams.get('olderVersion') === 'true';
        return HttpResponse.json({ items: older ? [doc({ status: 'signed', isCurrentVersion: false, signedAt: '2026-11-22T10:00:00Z', signatureMethod: 'online' })] : [doc(), doc({ id: 'd2', recipientId: 'stu-002' })] });
      }),
    );
  };

  it('sends the filters to the API and updates the URL when they change', async () => {
    setup();
    navigation.searchParams = new URLSearchParams('groupId=g1');
    renderWithProviders(<SignaturesPage />);
    expect(await screen.findByTestId('sig-row-stu-002')).toBeInTheDocument();
    expect(tableRequests.at(-1)!.searchParams.get('groupId')).toBe('g1');

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'signed');
    expect(navigation.router.replace).toHaveBeenLastCalledWith('/signatures?groupId=g1&status=signed');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Signed an older version' }));
    expect(navigation.router.replace).toHaveBeenLastCalledWith('/signatures?groupId=g1&olderVersion=1');
  });

  it('"signed an older version" + template: offers to resend and calls the API', async () => {
    setup();
    let resendBody: unknown;
    server.use(
      http.post(api('/documents/resend-new-version'), async ({ request }) => {
        resendBody = await request.json();
        return HttpResponse.json({ recipients: 1, batches: [{ id: 'nb' }] });
      }),
      http.get(api('/batches/nb'), () => HttpResponse.json({ status: 'completed' })),
    );
    navigation.searchParams = new URLSearchParams('templateId=t1&olderVersion=1');
    renderWithProviders(<SignaturesPage />);
    expect(await screen.findByText(/1 recipient signed an older version/)).toBeInTheDocument();
    expect(tableRequests.at(-1)!.searchParams.get('olderVersion')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Send the new version' }));
    await waitFor(() => expect(resendBody).toEqual({ templateId: 't1' }));
  });

  it('without a template, explains that one must be chosen to resend', async () => {
    setup();
    navigation.searchParams = new URLSearchParams('olderVersion=1');
    renderWithProviders(<SignaturesPage />);
    expect(await screen.findByText('Choose a template to send the new version.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send the new version' })).toBeNull();
  });

  it('shows an error state with retry when the API fails', async () => {
    setup();
    server.use(http.get(api('/signatures/table'), () => HttpResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'x' } }, { status: 500 })));
    renderWithProviders(<SignaturesPage />);
    expect(await screen.findByText('Server error. Please try again later.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});
