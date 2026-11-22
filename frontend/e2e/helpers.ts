import { expect, type Page } from '@playwright/test';

export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/** One-click demo login (the login page shows these buttons outside production). */
export async function loginAs(page: Page, role: 'admin' | 'editor' | 'coordinator') {
  const roleName = { admin: 'Ադմինիստրատոր', editor: 'Խմբագիր', coordinator: 'Համակարգող' }[role];
  await page.goto('/login');
  await page.getByRole('button', { name: `Մուտք որպես ${roleName}` }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId('current-user').first()).toBeVisible();
}

export async function logout(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
}

/** Latest signing link sent to an address (Mailpit API). */
export async function signLinkFor(email: string, subjectStartsWith?: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
    const msg = messages.find((m) => !subjectStartsWith || m.Subject.startsWith(subjectStartsWith));
    if (msg) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { Text: string };
      const m = full.Text.match(/https?:\/\/\S+\/sign\/[A-Za-z0-9_-]+/);
      if (m) return m[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No signing email for ${email}`);
}

export async function setLanguage(page: Page, locale: 'hy' | 'en' | 'ru') {
  await page.locator('select[aria-label]').filter({ has: page.locator('option[value="ru"]') }).first().selectOption(locale);
  await page.waitForLoadState('networkidle');
}
