import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import LoginPage from '@/app/login/page';
import { renderWithProviders, USERS } from '../setup/render';
import { api, server } from '../setup/msw';
import { navigation } from '../setup/navigation';

describe('login page', () => {
  it('lists the demo accounts (test environment) and logs in with one click', async () => {
    let body: unknown;
    server.use(
      http.post(api('/auth/login'), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ token: 'jwt', user: USERS.coordinator });
      }),
    );
    renderWithProviders(<LoginPage />, { withAuth: true });
    const demo = await screen.findByTestId('demo-logins');
    expect(demo).toHaveTextContent('coordinator@academy.am');
    expect(demo).toHaveTextContent('Coord123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in as Coordinator' }));
    await waitFor(() => expect(body).toEqual({ email: 'coordinator@academy.am', password: 'Coord123!' }));
    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/dashboard'));
    expect(window.localStorage.getItem('ps.token')).toBe('jwt');
  });

  it('validates the form and shows a translated error for wrong credentials', async () => {
    server.use(http.post(api('/auth/login'), () => HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }, { status: 401 })));
    renderWithProviders(<LoginPage />, { withAuth: true, locale: 'ru' });
    await userEvent.click(await screen.findByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('Введите корректный email.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), 'x@academy.am');
    await userEvent.type(screen.getByLabelText('Пароль'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('Неверный email или пароль.')).toBeInTheDocument();
  });
});
