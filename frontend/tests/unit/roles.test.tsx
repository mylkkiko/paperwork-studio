import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { AppShell, isRouteAllowed, visibleNav } from '@/components/app-shell';
import { ErrorState } from '@/components/states';
import { ApiError } from '@/lib/api';
import { can } from '@/lib/roles';
import { renderWithProviders } from '../setup/render';
import { navigation } from '../setup/navigation';

const keys = (role: 'admin' | 'editor' | 'coordinator') => visibleNav(role).map((n) => n.key);

describe('role-based navigation', () => {
  it('each role sees only what it can use', () => {
    expect(keys('admin')).toEqual(['dashboard', 'templates', 'generate', 'signatures', 'users', 'mergeFields']);
    expect(keys('editor')).toEqual(['dashboard', 'templates']);
    expect(keys('coordinator')).toEqual(['dashboard', 'templates', 'generate', 'signatures']);
  });

  it('direct URLs are checked with the same rules', () => {
    expect(isRouteAllowed('/admin/users', 'coordinator')).toBe(false);
    expect(isRouteAllowed('/admin/merge-fields', 'admin')).toBe(true);
    expect(isRouteAllowed('/generate', 'editor')).toBe(false);
    expect(isRouteAllowed('/templates/abc/compare', 'editor')).toBe(true);
    expect(isRouteAllowed('/signatures', 'coordinator')).toBe(true);
  });

  it('permission helpers', () => {
    expect(can.manageTemplates('editor')).toBe(true);
    expect(can.manageTemplates('coordinator')).toBe(false);
    expect(can.deleteTemplates('editor')).toBe(false);
    expect(can.generate('admin')).toBe(true);
  });

  it.each([
    ['editor', ['Dashboard', 'Templates'], ['Generate pack', 'Signatures', 'Users', 'Merge fields']],
    ['coordinator', ['Dashboard', 'Templates', 'Generate pack', 'Signatures'], ['Users', 'Merge fields']],
    ['admin', ['Dashboard', 'Templates', 'Generate pack', 'Signatures', 'Users', 'Merge fields'], []],
  ] as const)('the menu of %s', async (role, shown, hidden) => {
    renderWithProviders(<AppShell>content</AppShell>, { as: role });
    expect(await screen.findAllByText('content')).toHaveLength(1);
    const nav = screen.getAllByRole('navigation', { name: 'Main navigation' })[0];
    for (const label of shown) expect(nav).toHaveTextContent(label);
    for (const label of hidden) expect(nav).not.toHaveTextContent(label);
  });

  it('opening a forbidden page by URL shows "No access" instead of the page', async () => {
    navigation.pathname = '/admin/users';
    renderWithProviders(<AppShell>secret admin page</AppShell>, { as: 'coordinator' });
    expect(await screen.findByText('No access')).toBeInTheDocument();
    expect(screen.queryByText('secret admin page')).toBeNull();
  });

  it('without a session, redirects to login', async () => {
    navigation.pathname = '/signatures';
    renderWithProviders(<AppShell>x</AppShell>, { withAuth: true });
    await vi.waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/login?next=%2Fsignatures'));
  });

  it('a 403 from the API is shown gracefully', () => {
    renderWithProviders(<ErrorState error={new ApiError(403, 'FORBIDDEN', 'nope')} />);
    expect(screen.getByText('No access')).toBeInTheDocument();
    expect(screen.getByText('Your role does not allow this action.')).toBeInTheDocument();
  });
});
