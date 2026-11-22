/**
 * Walks the main flow through the UI and saves a screenshot of every main screen into docs/screenshots/.
 * Run against a freshly seeded stack:  docker compose down -v && docker compose up -d --build && npm run screenshots
 */
import { test, expect, type Page } from '@playwright/test';
import { loginAs, logout, setLanguage, signLinkFor } from './helpers';

const OUT = '../docs/screenshots';
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

test('main screens', async ({ page, browser }) => {
  // 1. Login with demo accounts
  await page.goto('/login');
  await expect(page.getByTestId('demo-logins')).toBeVisible();
  await shot(page, '01-login');

  // Editor: templates, detail, comparison
  await loginAs(page, 'editor');
  await shot(page, '02-dashboard-editor');
  await page.getByRole('link', { name: 'Ձևանմուշներ', exact: true }).first().click();
  await expect(page.getByRole('link', { name: 'Ուսուցման պայմանագիր' })).toBeVisible();
  await shot(page, '03-templates');

  await page.getByRole('link', { name: 'Ուսուցման պայմանագիր' }).click();
  await expect(page.getByTestId('version-row-2')).toBeVisible();
  await expect(page.getByTestId('fields')).toBeVisible();
  await shot(page, '04-template-detail');

  await page.getByTestId('version-row-2').getByRole('button', { name: 'Նախադիտում' }).click();
  await expect(page.locator('iframe')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await shot(page, '05-preview');
  await page.keyboard.press('Escape');

  await page.getByTestId('version-row-2').getByRole('link', { name: 'Համեմատել' }).click();
  await expect(page.getByTestId('compare-counts')).toBeVisible();
  await shot(page, '06-compare');
  await logout(page);

  // Coordinator: generate wizard
  await loginAs(page, 'coordinator');
  await shot(page, '07-dashboard-coordinator');
  await page.getByRole('link', { name: 'Փաթեթի ստեղծում' }).first().click();
  await page.getByRole('radio', { name: /Ուսուցման պայմանագիր/ }).click();
  await page.getByRole('button', { name: 'Առաջ' }).click();
  await page.getByLabel('Խումբ').selectOption({ index: 1 });
  await expect(page.getByText('Ընտրված է 24-ը 24-ից')).toBeVisible();
  await shot(page, '08-wizard-recipients');
  await page.getByRole('button', { name: 'Առաջ' }).click();

  await expect(page.getByTestId('precheck-row-stu-007')).toBeVisible();
  await shot(page, '09-wizard-precheck');
  await page.getByTestId('precheck-row-stu-007').getByRole('textbox').fill('AN7654321');
  await page.getByTestId('precheck-row-stu-015').getByRole('textbox').fill('ք. Երևան, Աբովյան փ. 52, բն. 4');
  await expect(page.getByRole('button', { name: 'Առաջ' })).toBeEnabled({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Առաջ' }).click();

  await page.getByLabel(/Պայմանագրի ամսաթիվ/).fill('2026-11-21');
  await page.getByLabel(/Ուսման վարձ/).fill('450000');
  await shot(page, '10-wizard-shared');
  await page.getByRole('button', { name: 'Ստեղծել' }).click();
  await expect(page.getByTestId('progress-text')).toBeVisible();
  await shot(page, '11-wizard-progress');
  await expect(page.getByTestId('done-message')).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: /Ուղարկել 24-ը/ }).click();
  await expect(page.getByTestId('send-result')).toBeVisible();
  await shot(page, '12-wizard-done');

  // Signatures table
  await page.getByRole('link', { name: 'Բացել ստորագրությունների աղյուսակը' }).click();
  await expect(page.getByTestId('sig-row-stu-001')).toBeVisible();
  await shot(page, '13-signatures');

  // Signer on a phone
  const link = await signLinkFor('anna.hakobyan@student.academy.am');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'hy-AM' });
  const signer = await phone.newPage();
  await signer.goto(link.replace(/^https?:\/\/[^/]+/, process.env.BASE_URL ?? 'http://localhost:3100'));
  await expect(signer.getByTestId('confirm-sign')).toBeDisabled();
  await signer.screenshot({ path: `${OUT}/14-sign-mobile.png` });
  await signer.getByRole('checkbox').click();
  await signer.getByTestId('confirm-sign').click();
  await expect(signer.getByTestId('sign-success')).toBeVisible({ timeout: 30_000 });
  await signer.screenshot({ path: `${OUT}/15-sign-success.png` });
  await signer.goto('/sign/this-token-does-not-exist-aaaaaaaaaaaaaaaaaaaaa');
  await expect(signer.getByTestId('sign-invalid')).toBeVisible();
  await signer.screenshot({ path: `${OUT}/16-sign-invalid.png` });
  await phone.close();

  await page.reload();
  await expect(page.getByTestId('sig-row-stu-001')).toHaveAttribute('data-status', 'signed');
  await page.getByTestId('sig-row-stu-002').getByRole('button', { name: 'Թղթային' }).click();
  await shot(page, '17-paper-signature');
  await page.keyboard.press('Escape');
  await logout(page);

  // Admin screens + languages
  await loginAs(page, 'admin');
  await page.goto('/admin/users');
  await expect(page.getByText('admin@academy.am')).toBeVisible();
  await shot(page, '18-admin-users');
  await page.goto('/admin/merge-fields');
  await expect(page.getByText('{{student.full_name}}')).toBeVisible();
  await shot(page, '19-admin-merge-fields');
  await page.goto('/dashboard');
  await setLanguage(page, 'en');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await shot(page, '20-dashboard-en');
  await setLanguage(page, 'ru');
  await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
  await page.goto('/signatures');
  await expect(page.getByTestId('sig-row-stu-001')).toBeVisible();
  await shot(page, '21-signatures-ru');
  await setLanguage(page, 'hy');

  // Mobile layout of the app
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await shot(page, '22-dashboard-mobile');
});
