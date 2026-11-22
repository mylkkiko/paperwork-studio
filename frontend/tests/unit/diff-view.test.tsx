import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ClauseRow, DiffText } from '@/components/diff-view';
import { renderWithProviders } from '../setup/render';
import { change } from '../setup/fixtures';

const spans = [
  { type: 'equal' as const, value: 'Վճարումը կատարվում է ' },
  { type: 'removed' as const, value: '10' },
  { type: 'added' as const, value: '5' },
  { type: 'equal' as const, value: ' աշխատանքային օրվա ընթացքում։' },
];

describe('DiffText', () => {
  // Colours are theme tokens (diff-removed / diff-added), readable in light and dark: assert the token, not a palette name.
  it('old side: removed words struck through in the "removed" colour, added words hidden', () => {
    const { container } = renderWithProviders(<DiffText spans={spans} side="old" />);
    expect(container.textContent).toBe('Վճարումը կատարվում է 10 աշխատանքային օրվա ընթացքում։');
    const del = container.querySelector('del')!;
    expect(del).toHaveTextContent('10');
    expect(del.className).toMatch(/bg-diff-removed-bg/);
    expect(del.className).toMatch(/text-diff-removed-fg/);
    expect(container.querySelector('ins')).toBeNull();
  });

  it('new side: added words highlighted in the "added" colour, removed words hidden', () => {
    const { container } = renderWithProviders(<DiffText spans={spans} side="new" />);
    expect(container.textContent).toBe('Վճարումը կատարվում է 5 աշխատանքային օրվա ընթացքում։');
    const ins = container.querySelector('ins')!;
    expect(ins).toHaveTextContent('5');
    expect(ins.className).toMatch(/bg-diff-added-bg/);
    expect(ins.className).toMatch(/text-diff-added-fg/);
    expect(container.querySelector('del')).toBeNull();
  });
});

describe('ClauseRow', () => {
  it('changed clause: both columns with the word diff and a "Changed" badge', () => {
    const { container } = renderWithProviders(<ClauseRow change={change({ status: 'changed', oldNumber: '4.2', newNumber: '4.2', oldText: 'a 10', newText: 'a 5', diff: spans })} />);
    expect(screen.getAllByText('Clause 4.2')).toHaveLength(2);
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(container.querySelector('[data-diff="removed"]')).toHaveTextContent('10');
    expect(container.querySelector('[data-diff="added"]')).toHaveTextContent('5');
    expect(container.firstElementChild).toHaveAttribute('data-status', 'changed');
  });

  it('removed clause: old text struck through, "removed in this version" on the right', () => {
    renderWithProviders(<ClauseRow change={change({ status: 'removed', oldNumber: '3.2', newNumber: null, oldText: 'Պահպանել կանոնները', newText: null })} />);
    expect(screen.getByText('Պահպանել կանոնները').className).toMatch(/line-through/);
    expect(screen.getByText('Removed in this version')).toBeInTheDocument();
    expect(screen.getByText('Removed')).toBeInTheDocument();
  });

  it('added clause: new text in the "added" colour with an "Added" badge', () => {
    renderWithProviders(<ClauseRow change={change({ status: 'added', oldNumber: null, newNumber: '6.2', oldText: null, newText: 'Լուսանկարներ' })} />);
    expect(screen.getByText('Clause 6.2')).toBeInTheDocument();
    expect(screen.getByText('Լուսանկարներ').className).toMatch(/text-diff-added-fg/);
    expect(screen.getByText('Added')).toBeInTheDocument();
  });

  it('moved clause shows the renumbering', () => {
    renderWithProviders(<ClauseRow change={change({ status: 'unchanged', moved: true, oldNumber: '3.3', newNumber: '3.2' })} />);
    expect(screen.getByText('Moved 3.3 → 3.2')).toBeInTheDocument();
    expect(screen.getByText('Unchanged')).toBeInTheDocument();
  });

  it('preamble is labelled as such, in Armenian too', () => {
    renderWithProviders(<ClauseRow change={change({ kind: 'preamble', oldNumber: null, newNumber: null })} />, { locale: 'hy' });
    expect(screen.getAllByText('Նախաբան')).toHaveLength(2);
  });
});
