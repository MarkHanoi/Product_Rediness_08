// PRYZM 2 — Browser matrix visual-regression spec (S70 D1, ADR-0052 §B.1).
//
// Per phase doc: chromium captures the reference; the other browsers
// diff with a 5-pixel tolerance.  Operator-side only.

// @ts-expect-error — optional dep at S70 D1.
import { test, expect } from '@playwright/test';

test('landing visual-regression vs chromium reference', async ({ page }, info) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  // Per phase doc S70 row #2 exit criterion: < 5px tolerance.
  await expect(page).toHaveScreenshot(`landing-${info.project.name}.png`, {
    maxDiffPixels: 5,
    fullPage: true,
  });
});
