import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PrecheckTable } from '@/components/generate/precheck-table';
import { renderWithProviders } from '../setup/render';
import { precheck } from '../setup/fixtures';

describe('PrecheckTable', () => {
  it('summarizes ready / missing / excluded and lists only recipients that need attention', () => {
    renderWithProviders(<PrecheckTable precheck={precheck()} overrides={{}} excludedIds={[]} onOverride={vi.fn()} onExclude={vi.fn()} onlyProblems />);
    const summary = screen.getByTestId('precheck-summary');
    expect(summary).toHaveTextContent('1 ready');
    expect(summary).toHaveTextContent('2 need data');
    expect(summary).toHaveTextContent('0 excluded');
    expect(screen.queryByTestId('precheck-row-stu-001')).toBeNull();
    expect(screen.getByTestId('precheck-row-stu-007')).toHaveTextContent('Անձնագրի համար');
    expect(screen.getByTestId('precheck-row-stu-015')).toHaveTextContent('Ուսանողի հասցե');
  });

  it('typing a missing value reports it for that recipient and field', async () => {
    const onOverride = vi.fn();
    function Harness() {
      const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
      return (
        <PrecheckTable
          precheck={precheck()}
          overrides={overrides}
          excludedIds={[]}
          onlyProblems
          onExclude={vi.fn()}
          onOverride={(rid, key, value) => {
            onOverride(rid, key, value);
            setOverrides((o) => ({ ...o, [rid]: { ...o[rid], [key]: value } }));
          }}
        />
      );
    }
    renderWithProviders(<Harness />);
    const input = screen.getByLabelText('Նարե Հովհաննիսյան: Անձնագրի համար');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(input, 'AN7');
    expect(onOverride).toHaveBeenLastCalledWith('stu-007', 'student.passport', 'AN7');
    expect(input).toHaveValue('AN7');
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('a filled value stays editable after the precheck no longer reports it as missing', () => {
    const fixed = precheck({ recipients: precheck().recipients.map((r) => (r.id === 'stu-007' ? { ...r, missing: [] } : r)) });
    renderWithProviders(<PrecheckTable precheck={fixed} overrides={{ 'stu-007': { 'student.passport': 'AN7654321' } }} excludedIds={[]} onOverride={vi.fn()} onExclude={vi.fn()} onlyProblems />);
    expect(within(screen.getByTestId('precheck-row-stu-007')).getByRole('textbox')).toHaveValue('AN7654321');
  });

  it('excluding a recipient reports it and disables its inputs', async () => {
    const onExclude = vi.fn();
    const { rerender } = renderWithProviders(<PrecheckTable precheck={precheck()} overrides={{}} excludedIds={[]} onOverride={vi.fn()} onExclude={onExclude} onlyProblems />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Exclude Մանե Ղազարյան' }));
    expect(onExclude).toHaveBeenCalledWith('stu-015', true);
    rerender(<PrecheckTable precheck={precheck({ recipients: precheck().recipients.map((r) => ({ ...r, excluded: r.id === 'stu-015' })) })} overrides={{}} excludedIds={['stu-015']} onOverride={vi.fn()} onExclude={onExclude} onlyProblems />);
    expect(within(screen.getByTestId('precheck-row-stu-015')).getByRole('textbox')).toBeDisabled();
  });

  it('shows "all complete" when nothing is missing', () => {
    const ok = precheck({ recipients: precheck().recipients.map((r) => ({ ...r, missing: [] })) });
    renderWithProviders(<PrecheckTable precheck={ok} overrides={{}} excludedIds={[]} onOverride={vi.fn()} onExclude={vi.fn()} onlyProblems />);
    expect(screen.getByText('All recipients have the required data.')).toBeInTheDocument();
  });
});
