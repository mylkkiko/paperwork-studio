/** Product owner addition: the document page on a phone — read, Download / Print, instruction; no online signing. */
import { test, expect, devices } from '@playwright/test';
import { Api, linkFrom, unique, waitForMail } from './api';

// Chromium phone profile (390-ish px, touch, mobile UA); WebKit isn't needed for this check.
test.use({ ...devices['Pixel 7'], locale: 'hy-AM', timezoneId: 'Asia/Yerevan' });

test('phone: open the document, Download / Print, instruction; signed after the coordinator uploads the scan', async ({ page }) => {
  const editor = await Api.as('editor');
  const coord = await Api.as('coordinator');
  const { templateId } = await editor.createPublishedTemplate(unique('E2E հեռախոս'));
  const docs = await coord.generate(templateId, ['stu-010']);
  const doc = docs['stu-010'];
  await coord.send([doc.id]);
  const link = linkFrom((await waitForMail(doc.recipientEmail, doc.number)).text);

  await page.goto(link);
  await expect(page.getByText(`№ ${doc.number}`)).toBeVisible();
  await expect(page.getByTestId('sign-instruction')).toContainText('Ստորագրեք ձեռքով ☐ վանդակի կողքին։');
  // phones get a big Download / Print button instead of an (empty) inline PDF frame
  const download = page.getByTestId('download-pdf');
  await expect(download).toBeVisible();
  await expect(download).toHaveText('Ներբեռնել / Տպել');
  await expect(page.locator('iframe')).toBeHidden();
  await expect(page.getByTestId('confirm-sign')).toHaveCount(0);
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  // nothing overflows horizontally
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // the button opens a new tab with the actual PDF of this document
  const href = (await download.getAttribute('href'))!;
  expect(href).toMatch(/\/api\/sign\/[A-Za-z0-9_-]+\/pdf/);
  const [popup] = await Promise.all([page.waitForEvent('popup'), download.tap()]);
  await popup.close();
  const response = await page.request.get(href);
  expect(response.headers()['content-type']).toBe('application/pdf');
  expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  expect((await coord.documents({ templateId }))['stu-010'].status).toBe('viewed');

  // the coordinator records the paper signature; the phone page then shows "signed on paper"
  await coord.paperSign(doc.id);
  await page.reload();
  await expect(page.getByTestId('sign-success')).toContainText('Ստորագրվել է թղթային տարբերակով՝');
  await expect(page.getByTestId('download-pdf')).toBeVisible(); // the document stays available
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await coord.documents({ templateId }))['stu-010'].status).toBe('signed');
});
