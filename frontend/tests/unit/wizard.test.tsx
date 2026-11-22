import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildPayload, fieldKey, formName, initialState, sharedFieldsSchema, stepError, summarizePrecheck, type WizardState } from '@/lib/wizard';
import { SharedFieldsForm } from '@/components/generate/shared-fields-form';
import { renderWithProviders } from '../setup/render';
import { precheck } from '../setup/fixtures';

const state = (over: Partial<WizardState> = {}): WizardState => ({ ...initialState, ...over });

describe('step validation', () => {
  it('template step needs a published version', () => {
    expect(stepError('template', state())).toBe('chooseTemplate');
    expect(stepError('template', state({ templateVersionId: 'v1' }))).toBeNull();
  });

  it('recipients step needs a group for students and at least one recipient', () => {
    expect(stepError('recipients', state())).toBe('chooseGroup');
    expect(stepError('recipients', state({ groupId: 'g' }))).toBe('chooseRecipients');
    expect(stepError('recipients', state({ groupId: 'g', recipientIds: ['stu-001'] }))).toBeNull();
    expect(stepError('recipients', state({ recipientType: 'staff' }))).toBe('chooseRecipients');
    expect(stepError('recipients', state({ recipientType: 'staff', recipientIds: ['stf-001'] }))).toBeNull();
  });

  it('precheck step blocks while data is missing or everyone is excluded', () => {
    expect(stepError('precheck', state(), undefined)).toBe('precheckPending');
    expect(stepError('precheck', state(), precheck())).toBe('missingData');
    const fixed = precheck({ recipients: precheck().recipients.map((r) => ({ ...r, missing: [] })) });
    expect(stepError('precheck', state(), fixed)).toBeNull();
    const allOut = precheck({ recipients: precheck().recipients.map((r) => ({ ...r, excluded: true })) });
    expect(stepError('precheck', state(), allOut)).toBe('allExcluded');
    // excluded recipients' gaps don't block
    const someOut = precheck({ recipients: precheck().recipients.map((r) => ({ ...r, excluded: r.missing.length > 0 })) });
    expect(stepError('precheck', state(), someOut)).toBeNull();
  });

  it('summarizes the precheck', () => {
    expect(summarizePrecheck(precheck())).toEqual({ included: 3, excluded: 0, needData: 2, ready: 1 });
  });
});

describe('API payload', () => {
  it('drops empty values, converts money/number to numbers, and sends no group for staff', () => {
    const s = state({
      templateVersionId: 'v1',
      groupId: 'g',
      recipientIds: ['stu-001'],
      overrides: { 'stu-007': { 'student.passport': ' AN1 ', 'student.address': '' }, 'stu-015': { 'student.address': '   ' } },
      commonValues: { 'contract.amount': '450 000', 'contract.date': '2026-11-21', 'contract.note': '' },
    });
    expect(buildPayload(s, { 'contract.amount': 'money' })).toEqual({
      templateVersionId: 'v1',
      recipientType: 'student',
      groupId: 'g',
      recipientIds: ['stu-001'],
      overrides: { 'stu-007': { 'student.passport': 'AN1' } },
      excludedIds: [],
      commonValues: { 'contract.amount': 450000, 'contract.date': '2026-11-21' },
    });
    expect(buildPayload(state({ recipientType: 'staff', groupId: 'g' })).groupId).toBeNull();
  });

  it('encodes dotted keys for the form library', () => {
    expect(formName('contract.amount')).toBe('contract__amount');
    expect(fieldKey('contract__amount')).toBe('contract.amount');
  });

  it('shared-fields schema validates by type and requiredness', () => {
    const schema = sharedFieldsSchema([
      { key: 'contract.date', type: 'date', required: true },
      { key: 'contract.amount', type: 'money', required: true },
      { key: 'contract.note', type: 'text', required: false },
    ]);
    expect(schema.safeParse({ contract__date: '2026-11-21', contract__amount: '450 000', contract__note: '' }).success).toBe(true);
    const bad = schema.safeParse({ contract__date: '', contract__amount: 'a lot', contract__note: '' });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.map((i) => [i.path[0], i.message])).toEqual([
      ['contract__date', 'required'],
      ['contract__amount', 'number'],
    ]);
  });
});

describe('SharedFieldsForm', () => {
  const fields = precheck().commonFields;

  it('shows translated errors for empty required fields and does not submit', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <>
        <SharedFieldsForm fields={fields} values={{}} onSubmit={onSubmit} formId="f" />
        <button type="submit" form="f">go</button>
      </>,
    );
    await userEvent.click(screen.getByText('go'));
    expect(await screen.findAllByText('Required')).toHaveLength(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits decoded keys when valid', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <>
        <SharedFieldsForm fields={fields} values={{}} onSubmit={onSubmit} formId="f" />
        <button type="submit" form="f">go</button>
      </>,
    );
    await userEvent.type(screen.getByLabelText(/Պայմանագրի ամսաթիվ/), '2026-11-21');
    await userEvent.type(screen.getByLabelText(/Ուսման վարձ/), 'abc');
    await userEvent.click(screen.getByText('go'));
    expect(await screen.findByText('Enter a number')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/Ուսման վարձ/));
    await userEvent.type(screen.getByLabelText(/Ուսման վարձ/), '450000');
    await userEvent.click(screen.getByText('go'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ 'contract.date': '2026-11-21', 'contract.amount': '450000' }));
  });

  it('says so when the template needs no shared values', () => {
    renderWithProviders(<SharedFieldsForm fields={[]} values={{}} onSubmit={vi.fn()} formId="f" />);
    expect(screen.getByText('This template needs no shared values.')).toBeInTheDocument();
  });
});
