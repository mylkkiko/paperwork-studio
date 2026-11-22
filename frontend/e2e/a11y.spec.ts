/**
 * Automated accessibility check (axe-core, WCAG 2.1 A/AA rules incl. colour contrast) on the main screens,
 * in the light and the dark theme. Fails on serious or critical violations.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Api, linkFrom, unique, waitForMail } from './api';
import { loginAs } from './helpers';

let templateId = '';
let signLink = '';

test.beforeAll(async () => {
  const editor = await Api.as('editor');
  const coord = await Api.as('coordinator');
  ({ templateId } = await editor.createPublishedTemplate(unique('A11y')));
  const docs = await coord.generate(templateId, ['stu-020']);
  await coord.send([docs['stu-020'].id]);
  signLink = linkFrom((await waitForMail(docs['stu-020'].recipientEmail, docs['stu-020'].number)).text);
  await editor.uploadAndPublishVersion(templateId); // so the compare page has a comparison
});

async function audit(page: Page, label: string) {
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('iframe') // the PDF itself is not our UI
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`);
  expect(report, `${label}\n${report.join('\n')}`).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test('public pages: login, signing page', async ({ page }) => {
      await page.goto('/login');
      await audit(page, 'login');
      await page.goto(signLink);
      await expect(page.getByTestId('confirm-sign')).toBeVisible();
      await audit(page, 'sign');
    });

    test('editor screens: dashboard, templates, template detail, compare', async ({ page }) => {
      await loginAs(page, 'editor');
      await audit(page, 'dashboard (editor)');
      await page.goto('/templates');
      await audit(page, 'templates');
      await page.goto(`/templates/${templateId}`);
      await expect(page.getByTestId('version-row-2')).toBeVisible();
      await audit(page, 'template detail');
      await page.getByTestId('version-row-2').getByRole('link', { name: 'Համեմատել' }).click();
      await expect(page.getByTestId('compare-counts')).toBeVisible();
      await audit(page, 'compare');
    });

    test('coordinator screens: dashboard, wizard, signatures', async ({ page }) => {
      await loginAs(page, 'coordinator');
      await audit(page, 'dashboard (coordinator)');
      await page.goto('/generate');
      await expect(page.getByRole('radio').first()).toBeVisible();
      await audit(page, 'wizard');
      await page.goto(`/signatures?templateId=${templateId}`);
      await expect(page.getByTestId('sig-row-stu-020')).toBeVisible();
      await audit(page, 'signatures');
    });

    test('admin screens: users, merge fields', async ({ page }) => {
      await loginAs(page, 'admin');
      await page.goto('/admin/users');
      await expect(page.getByText('admin@academy.am')).toBeVisible();
      await audit(page, 'users');
      await page.goto('/admin/merge-fields');
      await audit(page, 'merge fields');
    });
  });
}
