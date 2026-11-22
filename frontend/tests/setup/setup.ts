import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './msw';
import { navigation } from './navigation';

// Next.js router hooks don't exist outside the framework; tests read/assert them through `navigation`.
vi.mock('next/navigation', () => ({
  useRouter: () => navigation.router,
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
  useParams: () => navigation.params,
  redirect: vi.fn(),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  navigation.reset();
  window.localStorage.clear();
});
afterAll(() => server.close());

// jsdom lacks these browser APIs used by Radix / downloads.
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLElement.prototype.hasPointerCapture = () => false;
window.HTMLElement.prototype.releasePointerCapture = () => {};
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
URL.createObjectURL ??= () => 'blob:mock';
URL.revokeObjectURL ??= () => {};
