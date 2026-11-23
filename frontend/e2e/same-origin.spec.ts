/**
 * One address for everything: the browser reaches the API only through the site's own origin (/api, proxied by
 * Next.js), never a separate backend address — so the same build works on any public address.
 */
import { test, expect, type Page } from '@playwright/test';
import { Api, linkFrom, unique, waitForMail } from './api';
import { loginAs } from './helpers';

function recordRequests(page: Page) {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  return urls;
}

const httpOnly = (urls: string[]) => urls.filter((u) => u.startsWith('http'));

test('every browser request goes to the site origin; the API is reached via /api', async ({ page, baseURL }) => {
  const urls = recordRequests(page);
  await loginAs(page, 'coordinator');
  await page.goto('/signatures');
  await expect(page.getByRole('heading', { name: 'Ստորագրություններ' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  const origin = new URL(baseURL!).origin;
  expect(httpOnly(urls).filter((u) => new URL(u).origin !== origin)).toEqual([]);
  expect(urls.some((u) => u.startsWith(`${origin}/api/auth/login`))).toBe(true);
  expect(urls.some((u) => u.startsWith(`${origin}/api/signatures/table`))).toBe(true);
  expect(urls.filter((u) => u.includes(':4000'))).toEqual([]);
});

test('the same build works on another address (127.0.0.1 instead of localhost): login, API calls and the document page', async ({ browser, baseURL }) => {
  const other = baseURL!.replace('localhost', '127.0.0.1');
  test.skip(other === baseURL, 'baseURL is not localhost');
  const coord = await Api.as('coordinator');
  const { templateId } = await (await Api.as('editor')).createPublishedTemplate(unique('E2E հասցե'));
  const doc = (await coord.generate(templateId, ['stu-013']))['stu-013'];
  await coord.send([doc.id]);
  const signPath = linkFrom((await waitForMail(doc.recipientEmail, doc.number)).text);

  const ctx = await browser.newContext({ baseURL: other, locale: 'hy-AM' });
  const page = await ctx.newPage();
  const urls = recordRequests(page);
  await loginAs(page, 'coordinator');
  await page.goto(`/signatures?templateId=${templateId}`);
  await expect(page.getByTestId('sig-row-stu-013')).toHaveAttribute('data-status', 'sent');

  // the public document page: info and the PDF come through the same address
  await page.goto(signPath);
  await expect(page.getByTestId('sign-instruction')).toBeVisible();
  const pdfHref = (await page.getByTestId('download-pdf').getAttribute('href'))!;
  expect(pdfHref.startsWith(`${other}/api/sign/`)).toBe(true);
  const pdf = await page.request.get(pdfHref);
  expect(pdf.headers()['content-type']).toBe('application/pdf');

  expect(httpOnly(urls).filter((u) => new URL(u).origin !== new URL(other).origin)).toEqual([]);
  await ctx.close();
});
