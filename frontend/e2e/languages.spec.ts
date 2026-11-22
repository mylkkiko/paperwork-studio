/**
 * Product owner addition: switching hy -> ru -> en on the dashboard and the signatures table shows no missing
 * translations. A missing key renders as "⟦missing:…⟧" and logs "[i18n]" to the console (see src/i18n/fallback.ts).
 */
import { test, expect, type Page } from '@playwright/test';
import { Api, unique } from './api';
import { loginAs, setLanguage } from './helpers';

const EXPECT = {
  hy: { dashboard: 'Գլխավոր', signatures: 'Ստորագրություններ', nav: 'Փաթեթի ստեղծում', status: 'Ուղարկված', current: 'ընթացիկ' },
  ru: { dashboard: 'Главная', signatures: 'Подписи', nav: 'Создать пакет', status: 'Отправлен', current: 'текущая' },
  en: { dashboard: 'Dashboard', signatures: 'Signatures', nav: 'Generate pack', status: 'Sent', current: 'current' },
} as const;

/** Raw dictionary keys that would leak if a translation were looked up wrongly, e.g. "signatures.olderVersion". */
const RAW_KEY = /\b(common|nav|roles|errors|docStatus|versionStatus|batchStatus|categories|dashboard|templates|signatures|generate|compare|sign|admin|login)\.[a-z][A-Za-z.]+\b/;

async function assertFullyTranslated(page: Page, errors: string[]) {
  await page.waitForLoadState('networkidle');
  const text = await page.locator('body').innerText();
  expect(text).not.toContain('⟦missing:');
  expect(text).not.toMatch(RAW_KEY);
  // titles, tooltips and accessible names are text too
  const attrs = await page.locator('[title], [aria-label], [placeholder]').evaluateAll((els) =>
    els.flatMap((e) => ['title', 'aria-label', 'placeholder'].map((a) => e.getAttribute(a) ?? '')),
  );
  expect(attrs.filter((a) => a.includes('⟦missing:') || RAW_KEY.test(a))).toEqual([]);
  expect(errors).toEqual([]);
}

test('hy -> ru -> en on the dashboard and the signatures table', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('[i18n]')) errors.push(msg.text());
  });

  // a pack with sent documents, so the signatures table has rows, statuses and actions to translate
  const coord = await Api.as('coordinator');
  const { templateId } = await (await Api.as('editor')).createPublishedTemplate(unique('E2E լեզուներ'));
  const docs = await coord.generate(templateId, ['stu-011', 'stu-012']);
  await coord.send(Object.values(docs).map((d) => d.id));

  await loginAs(page, 'coordinator');
  for (const locale of ['hy', 'ru', 'en'] as const) {
    if (locale !== 'hy') await setLanguage(page, locale);
    const e = EXPECT[locale];

    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { name: e.dashboard })).toBeVisible();
    await expect(page.getByRole('navigation').first()).toContainText(e.nav);
    await expect(page.getByTestId('waiting-count')).toBeVisible();
    await assertFullyTranslated(page, errors);

    await page.goto(`/signatures?templateId=${templateId}`);
    await expect(page.getByRole('heading', { name: e.signatures })).toBeVisible();
    const row = page.getByTestId('sig-row-stu-011');
    await expect(row).toContainText(e.status);
    await expect(row).toContainText(e.current);
    await assertFullyTranslated(page, errors);
  }

  // the choice is remembered
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Signatures' })).toBeVisible();
  await setLanguage(page, 'hy');
});
