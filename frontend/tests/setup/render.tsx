import { useState, type ReactElement, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { IntlProvider } from '@/components/intl-provider';
import { AuthProvider } from '@/lib/auth';
import type { Role, User } from '@/lib/types';
import en from '../../messages/en.json';
import hy from '../../messages/hy.json';
import ru from '../../messages/ru.json';
import { api, server } from './msw';

const MESSAGES = { en, hy, ru };

export const USERS: Record<Role, User> = {
  admin: { id: 'u-admin', name: 'Admin User', email: 'admin@academy.am', role: 'admin' },
  editor: { id: 'u-editor', name: 'Editor User', email: 'editor@academy.am', role: 'editor' },
  coordinator: { id: 'u-coord', name: 'Coordinator User', email: 'coordinator@academy.am', role: 'coordinator' },
};

interface Options {
  locale?: keyof typeof MESSAGES;
  /** log in as this role (stores a token and mocks /auth/me) */
  as?: Role;
  withAuth?: boolean;
}

export function Providers({ children, locale = 'en' }: { children: ReactNode; locale?: keyof typeof MESSAGES }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }));
  return (
    <IntlProvider locale={locale} messages={MESSAGES[locale]}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </IntlProvider>
  );
}

/** Render with i18n + TanStack Query (+ AuthProvider when `as`/`withAuth` is given). English by default. */
export function renderWithProviders(ui: ReactElement, { locale = 'en', as, withAuth }: Options = {}) {
  if (as) {
    window.localStorage.setItem('ps.token', `token-${as}`);
    server.use(http.get(api('/auth/me'), () => HttpResponse.json({ user: USERS[as] })));
  }
  const auth = Boolean(as || withAuth);
  // As `wrapper`, the providers survive rerender().
  const Wrapper = ({ children }: { children: ReactNode }) => <Providers locale={locale}>{auth ? <AuthProvider>{children}</AuthProvider> : children}</Providers>;
  return render(ui, { wrapper: Wrapper });
}
