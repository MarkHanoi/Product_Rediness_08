// PRYZM 2 — Browser matrix smoke spec (S70 D1, ADR-0052 §B.1).
//
// Operator-side only.  This file is loaded by Playwright when
// `pnpm --filter @pryzm/test-browser-matrix run test:e2e[:matrix]` is
// invoked from a runner that has the browser binaries installed (CI
// matrix or a dev workstation with `npx playwright install`).
//
// In the dev container we don't run this — the config-shape test in
// the package root locks the matrix shape; the live boot is the
// operator-side gate.

// @ts-expect-error — optional dep at S70 D1; installed by the GHA matrix runner.
import { test, expect } from '@playwright/test';

test('boot smoke — landing renders with main landmark + skip link', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', /^[a-z]{2}/i);
  await expect(page).toHaveTitle(/.+/);
  // Skip link is the first focusable element.
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.className ?? '');
  expect(focused).toMatch(/skip-link/);
  // Main landmark present and focusable via skip-link target.
  await expect(page.locator('#main, main, [role="main"]')).toBeVisible();
});

test('boot smoke — capture full-page screenshot per browser', async ({ page }, info) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.screenshot({
    path: `screenshots/${info.project.name}/landing.png`,
    fullPage: true,
  });
});
