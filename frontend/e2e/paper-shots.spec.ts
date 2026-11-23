/**
 * Screenshots of the screens changed by "paper-only signatures": the public document page in every state and the
 * signatures table (+ the upload-scan dialog), light and dark, desktop and phone.
 *   npx playwright test --config playwright.screenshots.config.ts e2e/paper-shots.spec.ts
 * Output: docs/screenshots/paper-only/{light,dark}-{desktop,phone}-NN-name.png
 */
import { test, expect } from '@playwright/test';
import { Api, API_URL, expireLinks, linkFrom, unique, waitForMail } from './api';
import { loginAs } from './helpers';

const DIR = '../docs/screenshots/paper-only';
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } } as const;

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

let templateId = '';
const links: Record<string, string> = {};

test.beforeAll(async () => {
  const editor = await Api.as('editor');
  const coord = await Api.as('coordinator');
  ({ templateId } = await editor.createPublishedTemplate(unique('Թղթային ստորագրություն')));
  const docs = await coord.generate(templateId, ['stu-001', 'stu-002', 'stu-003', 'stu-004', 'stu-005']);
  await coord.send(Object.values(docs).map((d) => d.id));
  for (const [state, rid] of [['open', 'stu-001'], ['signed', 'stu-002'], ['declined', 'stu-003'], ['expired', 'stu-004']] as const) {
    links[state] = linkFrom((await waitForMail(docs[rid].recipientEmail, docs[rid].number)).text);
  }
  await fetch(`${API_URL}/sign/${links.open.split('/').pop()}`); // "viewed"
  await coord.paperSign(docs['stu-002'].id);
  await fetch(`${API_URL}${links.declined}/decline`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"reason":"Գումարը սխալ է"}' });
  expireLinks(docs['stu-004'].id);
  await fetch(`${API_URL}/sign/${links.expired.split('/').pop()}`); // marks it expired
});

for (const theme of ['light', 'dark'] as const) {
  for (const [device, viewport] of Object.entries(VIEWPORTS)) {
    test(`${theme} ${device}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport, locale: 'hy-AM', timezoneId: 'Asia/Yerevan', colorScheme: theme, isMobile: device === 'phone', hasTouch: device === 'phone' });
      const page = await ctx.newPage();
      const shot = (name: string, full = true) => page.screenshot({ path: `${DIR}/${theme}-${device}-${name}.png`, fullPage: full });

      for (const [i, [state, testId]] of ([['open', 'sign-instruction'], ['expired', 'sign-expired'], ['signed', 'sign-success'], ['declined', 'sign-declined']] as const).entries()) {
        await page.goto(links[state]);
        await expect(page.getByTestId(testId)).toBeVisible();
        await page.waitForLoadState('networkidle');
        await shot(`0${i + 1}-document-${state}`);
      }
      await page.goto(links.open);
      await page.getByTestId('decline-toggle').click();
      await shot('05-document-decline-open');

      await loginAs(page, 'coordinator');
      await page.goto(`/signatures?templateId=${templateId}`);
      await expect(page.getByTestId('sig-row-stu-002').getByTestId('view-scan')).toBeVisible();
      await shot('10-signatures');
      await page.getByTestId('sig-row-stu-001').getByTestId('upload-scan').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.waitForTimeout(400);
      await shot('11-upload-scan-dialog', false);
      await ctx.close();
    });
  }
}
