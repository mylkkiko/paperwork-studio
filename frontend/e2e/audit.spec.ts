/**
 * UI audit: screenshots of every screen and the main states, desktop and phone.
 *   npx playwright test --config playwright.screenshots.config.ts e2e/audit.spec.ts
 * Output: docs/screenshots/<AUDIT_DIR or ui-v1-audit>/{desktop,phone}-NN-name.png
 * Sets up its own data through the API (works on any database state).
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { Api, API_URL, expireLinks, linkFrom, unique, waitForMail } from './api';
import { loginAs } from './helpers';

const DIR = `../docs/screenshots/${process.env.AUDIT_DIR ?? 'ui-v1-audit'}`;
const THEME = (process.env.AUDIT_THEME ?? 'light') as 'light' | 'dark';
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } } as const;

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

for (const [device, viewport] of Object.entries(VIEWPORTS)) {
  test(`all screens — ${device}`, async ({ browser }) => {
    const ctx: BrowserContext = await browser.newContext({ viewport, locale: 'hy-AM', timezoneId: 'Asia/Yerevan', colorScheme: THEME, isMobile: device === 'phone', hasTouch: device === 'phone' });
    const page = await ctx.newPage();
    const shot = (name: string, full = true) => page.screenshot({ path: `${DIR}/${THEME}-${device}-${name}.png`, fullPage: full });

    // data: a template with v1 published + v2 draft, a sent pack with signed / declined / expired documents
    const editor = await Api.as('editor');
    const coord = await Api.as('coordinator');
    const title = unique('Աուդիտ պայմանագիր');
    const { templateId } = await editor.createPublishedTemplate(title);
    const docs = await coord.generate(templateId, ['stu-001', 'stu-002', 'stu-003', 'stu-004', 'stu-005', 'stu-006']);
    await coord.send(Object.values(docs).map((d) => d.id));
    const link = async (rid: string) => linkFrom((await waitForMail(docs[rid].recipientEmail, docs[rid].number)).text);
    const signLink = await link('stu-001');
    const declineLink = await link('stu-002');
    const expiredLink = await link('stu-003');
    const openLink = await link('stu-004');
    await coord.paperSign(docs['stu-001'].id); // signed = scan uploaded by the coordinator
    await fetch(`${API_URL}${declineLink}/decline`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expireLinks(docs['stu-003'].id);
    await editor.call(`/templates/${templateId}/versions`, {
      form: (() => {
        const fd = new FormData();
        fd.append('file', new Blob([require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'backend', 'seed', 'templates', 'student_agreement_v2.docx'))]), 'v2.docx');
        return fd;
      })(),
    });

    // public signing page states
    await page.goto(openLink);
    await expect(page.getByTestId('sign-instruction')).toBeVisible();
    await shot('01-sign-open', false);
    await page.goto(signLink);
    await expect(page.getByTestId('sign-success')).toBeVisible();
    await shot('02-sign-signed', false);
    await page.goto(declineLink);
    await expect(page.getByTestId('sign-declined')).toBeVisible();
    await shot('03-sign-declined', false);
    await page.goto(expiredLink);
    await expect(page.getByTestId('sign-expired')).toBeVisible();
    await shot('04-sign-expired', false);
    await page.goto('/sign/not-a-real-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await expect(page.getByTestId('sign-invalid')).toBeVisible();
    await shot('05-sign-invalid', false);

    // login
    await page.goto('/login');
    await shot('10-login');
    await page.getByRole('button', { name: 'Մուտք գործել' }).click();
    await expect(page.getByText('Մուտքագրեք վավեր էլ. փոստի հասցե։')).toBeVisible();
    await shot('11-login-errors');

    // editor
    await loginAs(page, 'editor');
    await shot('20-dashboard-editor');
    await page.goto('/templates');
    await expect(page.getByRole('link', { name: title })).toBeVisible();
    await shot('21-templates');
    await page.goto('/templates?q=zzzz-nothing');
    await expect(page.getByText('Ֆիլտրերին համապատասխանող ձևանմուշներ չկան։')).toBeVisible();
    await shot('22-templates-empty');
    await page.goto('/templates');
    await page.getByRole('button', { name: 'Վերբեռնել ձևանմուշ' }).click();
    await page.getByRole('button', { name: 'Վերբեռնել', exact: true }).click();
    await page.waitForTimeout(400); // let the open animation finish
    await shot('23-upload-dialog', false);
    await page.keyboard.press('Escape');
    await page.goto(`/templates/${templateId}`);
    await expect(page.getByTestId('version-row-2')).toBeVisible();
    await shot('24-template-detail');
    await page.getByTestId('version-row-2').getByRole('button', { name: 'Նախադիտում' }).click();
    await page.waitForTimeout(2500);
    await shot('25-preview-dialog', false);
    await page.keyboard.press('Escape');
    await page.getByTestId('version-row-2').getByRole('link', { name: 'Համեմատել' }).click();
    await expect(page.getByTestId('compare-counts')).toBeVisible();
    await shot('26-compare');
    await page.getByRole('checkbox', { name: 'Ցույց տալ անփոփոխ կետերը' }).click();
    await shot('27-compare-all');
    await page.goto(`/templates/${templateId}`);
    await page.getByTestId('version-row-2').getByRole('button', { name: 'Հրապարակել' }).click();
    await page.waitForTimeout(400); // let the open animation finish
    await shot('28-publish-dialog', false);
    await page.keyboard.press('Escape');
    await page.goto('/signatures');
    await expect(page.getByText('Մուտքն արգելված է')).toBeVisible();
    await shot('29-no-access');
    await ctx.clearCookies();
    await page.evaluate(() => localStorage.clear());

    // coordinator
    await loginAs(page, 'coordinator');
    await shot('30-dashboard-coordinator');
    await page.goto('/generate');
    await expect(page.getByRole('radio').first()).toBeVisible();
    await shot('31-wizard-1-template');
    await page.getByRole('radio', { name: new RegExp(title) }).click();
    await page.getByRole('button', { name: 'Առաջ' }).click();
    await page.getByLabel('Խումբ').selectOption('grp-web-2026-a');
    await expect(page.getByText('Ընտրված է 24-ը 24-ից')).toBeVisible();
    await shot('32-wizard-2-recipients');
    await page.getByRole('button', { name: 'Առաջ' }).click();
    await expect(page.getByTestId('precheck-row-stu-007')).toBeVisible();
    await shot('33-wizard-3-precheck');
    await page.getByLabel('Նարե Հովհաննիսյան: Անձնագրի համար').fill('AN7654321');
    await page.getByLabel('Մանե Ղազարյան: Ուսանողի հասցե').fill('ք. Երևան, Աբովյան փ. 52');
    await expect(page.getByRole('button', { name: 'Առաջ' })).toBeEnabled();
    await page.getByRole('button', { name: 'Առաջ' }).click();
    await page.getByRole('button', { name: 'Ստեղծել' }).click();
    await shot('34-wizard-4-shared-errors');
    await page.getByLabel(/Պայմանագրի ամսաթիվ/).fill('2026-11-21');
    await page.getByLabel(/Ուսման վարձ/).fill('450000');
    await page.getByRole('button', { name: 'Ստեղծել' }).click();
    await expect(page.getByTestId('progress-text').or(page.getByTestId('done-message'))).toBeVisible();
    await shot('35-wizard-5-progress', false);
    await expect(page.getByTestId('done-message')).toBeVisible({ timeout: 120_000 });
    await shot('36-wizard-6-done');
    await page.goto(`/signatures?templateId=${templateId}`);
    await expect(page.getByTestId('sig-row-stu-001').first()).toBeVisible();
    await shot('37-signatures');
    await page.goto(`/signatures?templateId=${templateId}&olderVersion=1`);
    await shot('38-signatures-older-empty');
    await page.goto(`/signatures?templateId=${templateId}`);
    await page.getByTestId('sig-row-stu-005').first().getByTestId('upload-scan').click();
    await page.waitForTimeout(400); // let the open animation finish
    await shot('39-paper-dialog', false);
    await page.keyboard.press('Escape');
    await ctx.clearCookies();
    await page.evaluate(() => localStorage.clear());

    // admin
    await loginAs(page, 'admin');
    await page.goto('/admin/users');
    await expect(page.getByText('admin@academy.am')).toBeVisible();
    await shot('40-admin-users');
    await page.getByRole('button', { name: 'Նոր օգտատեր' }).click();
    await page.waitForTimeout(400); // let the open animation finish
    await shot('41-admin-user-dialog', false);
    await page.keyboard.press('Escape');
    await page.goto('/admin/merge-fields');
    await expect(page.getByText('{{student.full_name}}')).toBeVisible();
    await shot('42-admin-fields');
    if (device === 'phone') {
      await page.goto('/dashboard');
      await page.getByRole('button', { name: 'Ընտրացանկ' }).click();
      await page.waitForTimeout(400); // let the open animation finish
    await shot('43-phone-menu', false);
    }
    await ctx.close();
  });
}
