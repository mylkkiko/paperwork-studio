import { vi } from 'vitest';

/** State behind the mocked next/navigation hooks. */
export const navigation = {
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
  pathname: '/dashboard',
  searchParams: new URLSearchParams(),
  params: {} as Record<string, string>,
  reset() {
    this.router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
    this.pathname = '/dashboard';
    this.searchParams = new URLSearchParams();
    this.params = {};
  },
};
