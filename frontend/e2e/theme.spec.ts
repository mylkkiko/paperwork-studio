/**
 * Light / Dark / System theme: toggle, persistence, following the OS setting, no flash of the wrong theme.
 */
import { test, expect, type Page } from '@playwright/test';

const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'));

async function choose(page: Page, theme: 'light' | 'dark' | 'system') {
  await page.getByTestId('theme-toggle').click();
  await page.getByTestId(`theme-${theme}`).click();
  await expect(page.getByTestId('theme-toggle')).toHaveAttribute('data-theme-choice', theme);
}

test.describe('System (default) follows the OS setting', () => {
  test.use({ colorScheme: 'dark' });
  test('OS dark -> dark theme, and it follows a live OS change', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('data-theme-choice', 'system');
    expect(await isDark(page)).toBe(true);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => isDark(page)).toBe(false);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => isDark(page)).toBe(true);
  });
});

test.describe('System with a light OS', () => {
  test.use({ colorScheme: 'light' });
  test('OS light -> light theme', async ({ page }) => {
    await page.goto('/login');
    expect(await isDark(page)).toBe(false);
    // the page background really is the light token
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(245, 246, 248)');
  });
});

test.describe('explicit choice', () => {
  test.use({ colorScheme: 'light' });

  test('the toggle switches themes and the choice persists after reload', async ({ page }) => {
    await page.goto('/login');
    await choose(page, 'dark');
    expect(await isDark(page)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(22, 25, 30)');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');

    await page.reload();
    expect(await isDark(page)).toBe(true);
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('data-theme-choice', 'dark');

    // an explicit choice wins over the OS setting
    await page.emulateMedia({ colorScheme: 'dark' });
    await choose(page, 'light');
    expect(await isDark(page)).toBe(false);
    await page.reload();
    expect(await isDark(page)).toBe(false);

    // back to System -> follows the OS (dark now)
    await choose(page, 'system');
    await expect.poll(() => isDark(page)).toBe(true);
    await page.reload();
    expect(await isDark(page)).toBe(true);
  });

  test('no flash: the stored theme is applied before the page is rendered', async ({ page }) => {
    await page.goto('/login');
    await choose(page, 'dark');
    // record the <html> class at DOMContentLoaded — before React hydrates and before anything is painted
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        (window as unknown as { __themeAtDCL: string }).__themeAtDCL = document.documentElement.className;
      });
    });
    await page.goto('/sign/any-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(await page.evaluate(() => (window as unknown as { __themeAtDCL: string }).__themeAtDCL)).toContain('dark');
  });

  test('the toggle is on the signing page too, and the PDF area stays white in dark mode', async ({ page, browser }) => {
    await page.goto('/sign/any-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    await choose(page, 'dark');
    expect(await isDark(page)).toBe(true);
    // the PDF frame uses the "paper" token: its computed background must be white even in dark mode
    const paperBg = await page.evaluate(() => {
      const el = document.createElement('div');
      el.className = 'bg-paper';
      document.body.appendChild(el);
      const bg = getComputedStyle(el).backgroundColor;
      el.remove();
      return bg;
    });
    expect(paperBg).toBe('rgb(255, 255, 255)');
    void browser;
  });
});
