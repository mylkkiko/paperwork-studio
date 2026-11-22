/**
 * The six E2E scenarios of the spec, in order, against the real stack:
 *   1 editor: new version -> comparison + summary -> publish
 *   2 coordinator: generate the 24-student pack -> download ZIP -> send
 *   3 signer: link from Mailpit -> tick -> sign; coordinator sees "signed" on the right version
 *   4 coordinator: reminder -> email in Mailpit
 *   5 coordinator: "signed an older version" -> resend new version
 *   6 expired link -> expired state
 */
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { Api, expireLinks, linkFrom, seedFile, signViaApi, unique, waitForMail } from './api';
import { loginAs } from './helpers';

test.describe.configure({ mode: 'serial' });

let templateA: { templateId: string; v1: string };
const titleA = unique('E2E պայմանագիր');

test.beforeAll(async () => {
  const editor = await Api.as('editor');
  templateA = await editor.createPublishedTemplate(titleA);
});

test('1. editor uploads a new version, reviews comparison and summary, publishes', async ({ page }) => {
  await loginAs(page, 'editor');
  await page.goto(`/templates/${templateA.templateId}`);
  await expect(page.getByRole('heading', { name: titleA })).toBeVisible();

  await page.getByRole('button', { name: 'Վերբեռնել նոր տարբերակ' }).click();
  await page.locator('#tpl-file').setInputFiles(seedFile('student_agreement_v2.docx'));
  await page.getByRole('button', { name: 'Վերբեռնել', exact: true }).click();
  await expect(page.getByText('2-րդ տարբերակը վերբեռնվեց որպես սևագիր։')).toBeVisible();
  const row2 = page.getByTestId('version-row-2');
  await expect(row2).toContainText('Սևագիր');

  await row2.getByRole('link', { name: 'Համեմատել' }).click();
  const counts = page.getByTestId('compare-counts');
  await expect(counts).toContainText('1 ավելացված');
  await expect(counts).toContainText('1 հանված');
  await expect(counts).toContainText('1 փոփոխված');
  await expect(page.locator('#summary')).toHaveValue(/Կետ 4\.2․ վճարման ժամկետը փոխվել է՝ 10 → 5 օր/);
  const changed = page.locator('[data-testid="clause-row"][data-status="changed"]');
  await expect(changed.locator('[data-diff="removed"]')).toHaveText('10');
  await expect(changed.locator('[data-diff="added"]')).toHaveText('5');
  await expect(page.locator('[data-testid="clause-row"][data-status="removed"]')).toContainText('Կետ 3.2');
  await expect(page.locator('[data-testid="clause-row"][data-status="added"]')).toContainText('Կետ 6.2');

  // the editor adjusts the summary, then publishes
  await page.locator('#summary').fill('Կետ 4.2․ վճարման ժամկետը կրճատվել է 10-ից 5 աշխատանքային օրի։\nԿետ 3.2-ը հանվել է\nԿետ 6.2-ն ավելացվել է');
  await page.getByRole('button', { name: 'Հրապարակել' }).click();
  await expect(page.getByText('Տարբերակը հրապարակվեց։')).toBeVisible();

  await page.goto(`/templates/${templateA.templateId}`);
  await expect(page.getByTestId('version-row-2')).toContainText('Հրապարակված');
  await expect(page.getByTestId('version-row-1')).toContainText('Արխիվացված');
});

test('2. coordinator generates the 24-student pack, downloads the ZIP and sends it', async ({ page }) => {
  await loginAs(page, 'coordinator');
  await page.getByRole('link', { name: 'Փաթեթի ստեղծում' }).first().click();

  await page.getByRole('radio', { name: new RegExp(titleA) }).click();
  await page.getByRole('button', { name: 'Առաջ' }).click();
  await page.getByLabel('Խումբ').selectOption('grp-web-2026-a');
  await expect(page.getByText('Ընտրված է 24-ը 24-ից')).toBeVisible();
  await page.getByRole('button', { name: 'Առաջ' }).click();

  // precheck: two students miss data in the Core Engine
  await expect(page.getByTestId('precheck-summary')).toContainText('22 պատրաստ');
  await expect(page.getByRole('button', { name: 'Առաջ' })).toBeDisabled();
  await page.getByLabel('Նարե Հովհաննիսյան: Անձնագրի համար').fill('AN7654321');
  await page.getByLabel('Մանե Ղազարյան: Ուսանողի հասցե').fill('ք. Երևան, Աբովյան փ. 52, բն. 4');
  await expect(page.getByTestId('precheck-summary')).toContainText('24 պատրաստ');
  await page.getByRole('button', { name: 'Առաջ' }).click();

  await page.getByRole('button', { name: 'Ստեղծել' }).click(); // empty shared fields -> validation
  await expect(page.getByText('Պարտադիր դաշտ').first()).toBeVisible();
  await page.getByLabel(/Պայմանագրի ամսաթիվ/).fill('2026-11-21');
  await page.getByLabel(/Ուսման վարձ/).fill('450000');
  await expect(page.getByText('Կստեղծվի 24 փաստաթուղթ։')).toBeVisible();
  await page.getByRole('button', { name: 'Ստեղծել' }).click();

  await expect(page.getByTestId('progress-text').or(page.getByTestId('done-message'))).toBeVisible();
  await expect(page.getByTestId('done-message')).toContainText('24 փաստաթուղթը պատրաստ է', { timeout: 120_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /ZIP/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const zip = readFileSync((await download.path())!);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  expect(zip.length).toBeGreaterThan(100_000); // 24 PDF + 24 DOCX

  await page.getByRole('button', { name: 'Ուղարկել 24-ը ստորագրության' }).click();
  await expect(page.getByTestId('send-result')).toHaveText('Ուղարկված՝ 24։ Չուղարկված՝ 0։');
});

test('3. signer signs via the link from Mailpit; coordinator sees "signed" on version 2', async ({ page, browser }) => {
  const docs = await (await Api.as('coordinator')).documents({ templateId: templateA.templateId });
  const anna = docs['stu-001'];
  expect(anna.versionNumber).toBe(2);
  const mail = await waitForMail(anna.recipientEmail, anna.number);
  expect(mail.subject).toBe(`Ստորագրման համար՝ ${titleA} № ${anna.number}`);

  const signer = await (await browser.newContext({ locale: 'hy-AM' })).newPage();
  await signer.goto(linkFrom(mail.text));
  await expect(signer.getByText(`№ ${anna.number} · տարբերակ 2 · Աննա Հակոբյան`)).toBeVisible();
  await expect(signer.getByTestId('confirm-sign')).toBeDisabled();
  await signer.getByRole('checkbox', { name: 'Ծանոթացել եմ փաստաթղթին և համաձայն եմ' }).check();
  await signer.getByTestId('confirm-sign').click();
  await expect(signer.getByTestId('sign-success')).toContainText('Շնորհակալություն, փաստաթուղթը հաստատված է։');
  await signer.context().close();

  await loginAs(page, 'coordinator');
  await page.goto(`/signatures?templateId=${templateA.templateId}`);
  const row = page.getByTestId('sig-row-stu-001');
  await expect(row).toHaveAttribute('data-status', 'signed');
  await expect(row).toContainText('v2');
  await expect(row).toContainText('ընթացիկ');
  await expect(row).toContainText('Ստորագրված');
});

test('4. coordinator sends a reminder; it arrives in Mailpit', async ({ page }) => {
  const docs = await (await Api.as('coordinator')).documents({ templateId: templateA.templateId });
  const davit = docs['stu-002'];
  await loginAs(page, 'coordinator');
  await page.goto(`/signatures?templateId=${templateA.templateId}`);
  const row = page.getByTestId('sig-row-stu-002');
  await expect(row).toContainText('0');
  await row.getByRole('button', { name: 'Հիշեցնել' }).click();
  await expect(page.getByText('Հիշեցումն ուղարկվեց՝ Դավիթ Գրիգորյան։')).toBeVisible();

  const mail = await waitForMail(davit.recipientEmail, 'Հիշեցում', davit.number);
  expect(mail.text).toContain('դեռ հաստատված չէ');
  expect(mail.text).toMatch(/\/sign\/[A-Za-z0-9_-]{43}/);
  await expect(row.locator('td').nth(7)).toHaveText('1'); // reminder counter
  // the signed document offers no reminder
  await expect(page.getByTestId('sig-row-stu-001').getByRole('button', { name: 'Հիշեցնել' })).toHaveCount(0);
});

test('5. coordinator filters "signed an older version" and resends the new version', async ({ page }) => {
  // setup: template B, two students get v1, one signs it, then v2 is published
  const titleB = unique('E2E հին տարբերակ');
  const editor = await Api.as('editor');
  const coord = await Api.as('coordinator');
  const { templateId } = await editor.createPublishedTemplate(titleB);
  const docs = await coord.generate(templateId, ['stu-005', 'stu-006']);
  await coord.send([docs['stu-005'].id, docs['stu-006'].id]);
  const lilit = docs['stu-005'];
  await signViaApi(linkFrom((await waitForMail(lilit.recipientEmail, lilit.number)).text));
  await editor.uploadAndPublishVersion(templateId);

  await loginAs(page, 'coordinator');
  await page.goto(`/signatures?templateId=${templateId}`);
  // the filter lives in the URL: the checkbox follows once router.replace() has updated it
  const older = page.getByRole('checkbox', { name: 'Ստորագրել են հին տարբերակը' });
  await older.click();
  await expect(older).toBeChecked();
  await expect(page).toHaveURL(/olderVersion=1/);
  await expect(page.getByTestId('sig-row-stu-005')).toContainText('հին');
  await expect(page.getByTestId('sig-row-stu-006')).toHaveCount(0); // never signed: not "signed an older version"
  await page.getByRole('button', { name: 'Ուղարկել նոր տարբերակը' }).click();
  await expect(page.getByText('Նոր տարբերակն ուղարկվում է 1 ստացողի')).toBeVisible();

  const mail = await waitForMail(lilit.recipientEmail, 'Թարմացված փաստաթուղթ', titleB);
  expect(mail.text).toContain('• Կետ 4.2․ վճարման ժամկետը փոխվել է՝ 10 → 5 օր');
  await expect(page.getByText('Ֆիլտրերին համապատասխանող փաստաթղթեր չկան։')).toBeVisible(); // nobody left on the old version

  await older.click();
  await expect(older).not.toBeChecked();
  const rows = page.getByTestId('sig-row-stu-005');
  await expect(rows).toHaveCount(2); // old signed v1 + new v2 sent
  await expect(rows.filter({ hasText: 'v2' })).toHaveAttribute('data-status', 'sent');
});

test('6. an expired link shows the expired state', async ({ page }) => {
  const docs = await (await Api.as('coordinator')).documents({ templateId: templateA.templateId });
  const aram = docs['stu-004'];
  const link = linkFrom((await waitForMail(aram.recipientEmail, aram.number)).text);
  expireLinks(aram.id);

  await page.goto(link);
  await expect(page.getByTestId('sign-expired')).toContainText('Հղման ժամկետն անցել է');
  await expect(page.getByTestId('confirm-sign')).toHaveCount(0);

  await loginAs(page, 'coordinator');
  await page.goto(`/signatures?templateId=${templateA.templateId}`);
  await expect(page.getByTestId('sig-row-stu-004')).toHaveAttribute('data-status', 'expired');
});
