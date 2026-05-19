// PRYZM 2 — Browser matrix WCAG smoke gate (S70 D6, ADR-0052 §B.2).
//
// Asserts the boot route has zero serious + zero critical WCAG 2.2 AA
// violations per browser.  Operator-side only — see smoke.spec.ts.

// @ts-expect-error — optional dep at S70 D1.
import { test, expect } from '@playwright/test';
// @ts-expect-error — optional dep at S70 D1.
import AxeBuilder from '@axe-core/playwright';

test('zero serious/critical WCAG 2.2 AA violations on /', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blockers = results.violations.filter(
    (v: { impact?: string }) => v.impact === 'serious' || v.impact === 'critical',
  );
  if (blockers.length > 0) {
    // eslint-disable-next-line no-console
    console.error('WCAG blockers:', JSON.stringify(blockers, null, 2));
  }
  expect(blockers).toEqual([]);
});
