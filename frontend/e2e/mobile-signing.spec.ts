/** Product owner addition: the signing page on a phone — "Open document" button, sign, success. */
import { test, expect, devices } from '@playwright/test';
import { Api, linkFrom, unique, waitForMail } from './api';

// Chromium phone profile (390-ish px, touch, mobile UA); WebKit isn't needed for this check.
test.use({ ...devices['Pixel 7'], locale: 'hy-AM', timezoneId: 'Asia/Yerevan' });

test('phone: open the document, tick, confirm, success', async ({ page }) => {
  const editor = await Api.as('editor');
  const coord = await Api.as('coordinator');
  const { templateId } = await editor.createPublishedTemplate(unique('E2E հեռախոս'));
  const docs = await coord.generate(templateId, ['stu-010']);
  const doc = docs['stu-010'];
  await coord.send([doc.id]);
  const link = linkFrom((await waitForMail(doc.recipientEmail, doc.number)).text);

  await page.goto(link);
  await expect(page.getByText(`№ ${doc.number}`)).toBeVisible();
  // phones get a button instead of an (empty) inline PDF frame
  const open = page.getByTestId('open-pdf-mobile');
  await expect(open).toBeVisible();
  await expect(open).toHaveText('Բացել փաստաթուղթը (PDF)');
  await expect(page.locator('iframe')).toBeHidden();
  // nothing overflows horizontally
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // the button opens a new tab with the actual PDF of this document
  const href = (await open.getAttribute('href'))!;
  expect(href).toMatch(/\/api\/sign\/[A-Za-z0-9_-]+\/pdf/);
  const [popup] = await Promise.all([page.waitForEvent('popup'), open.click()]);
  await popup.close();
  const response = await page.request.get(href);
  expect(response.headers()['content-type']).toBe('application/pdf');
  expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');

  const confirm = page.getByTestId('confirm-sign');
  await expect(confirm).toBeDisabled();
  await page.getByText('Ծանոթացել եմ փաստաթղթին և համաձայն եմ').tap();
  await expect(confirm).toBeEnabled();
  await confirm.tap();
  await expect(page.getByTestId('sign-success')).toContainText('Շնորհակալություն, փաստաթուղթը հաստատված է։');
  await expect(page.getByTestId('open-pdf-mobile')).toBeVisible(); // signed copy still available
  const after = await coord.documents({ templateId });
  expect(after['stu-010'].status).toBe('signed');
});
