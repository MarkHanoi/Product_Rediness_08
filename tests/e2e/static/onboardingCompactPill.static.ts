// §UX-COMPACT-TYPE-PILL (L-11131, lane UXPILL70) — PIXEL proof that the BUILDING TYPE pill
// renders in the view-mode bar's band, at its height, beside it, over black and white alike.
//
// WHAT IS REAL HERE
//   · the bar's DOM      — `mountSiteViewQuickToggle` output, serialised by the vitest harness
//   · the pill's DOM     — `OnboardingStepController.renderGenerateConfirmStep` output, same
//   · the CSS            — DESIGN_TOKENS + SITE_VIEW_QUICK_TOGGLE_STYLES + ONBOARDING_STYLES
//                          through `scaleCssText(UI_SCALE)`, i.e. what `injectAppTheme` injects
//   · the placement rule — `placeCompactPill` (its source is embedded by the harness)
// WHAT IS NOT
//   · the app: no server, no Cesium, no PaneLayoutStore live — the harness page re-runs the
//     pure placement on real rects with a small inline script that restates the controller's
//     DOM half. So this proves the SHEET and the MODEL in a real layout engine; the live flow
//     (auth → project → geocode → draw → confirm) is still owed a browser pass.
//
// The harness is produced by `apps/editor/__tests__/onboardingCompactPill.test.ts` arm G when
// PRYZM_PILL_HARNESS_OUT is set. This spec generates it (≈2 min, the controller's import graph)
// unless PRYZM_PILL_HARNESS points at one already on disk.
//
//   npx playwright test --config tests/e2e/static/playwright.config.ts

import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The root package is `"type": "module"`, so there is no `__dirname` here.
const REPO = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const SHOTS = join(REPO, 'test-results', 'static');

/** Authored 8px / 16px × UI_SCALE 0.85 — the same numbers the controller and harness use. */
const GAP = 8 * 0.85;
const GUTTER = 16 * 0.85;

let harnessUrl = '';

test.beforeAll(() => {
  const given = process.env['PRYZM_PILL_HARNESS'];
  const out = given ?? join(tmpdir(), 'pryzm-uxpill70', 'onboarding-compact-pill.html');
  if (!given) {
    mkdirSync(join(tmpdir(), 'pryzm-uxpill70'), { recursive: true });
    execSync('npx vitest run __tests__/onboardingCompactPill.test.ts', {
      cwd: join(REPO, 'apps', 'editor'),
      env: { ...process.env, PRYZM_PILL_HARNESS_OUT: out },
      stdio: 'inherit',
      timeout: 600_000,
    });
  }
  expect(existsSync(out), `harness not written: ${out}`).toBe(true);
  harnessUrl = pathToFileURL(out).href;
  mkdirSync(SHOTS, { recursive: true });
});

interface Box { x: number; y: number; width: number; height: number }

async function measure(page: Page) {
  const bar = (await page.locator('[data-testid="site-view-quick-toggle"]').boundingBox()) as Box;
  const pill = (await page.locator('[data-testid="onboarding-compact-pill"]').boundingBox()) as Box;
  const body = (await page.locator('[data-testid="onboarding-step-body"]').boundingBox()) as Box;
  const kind = await page.locator('[data-testid="onboarding-step-overlay"]').getAttribute('data-os-compact-placement');
  expect(bar, 'bar not laid out').toBeTruthy();
  expect(pill, 'pill not laid out').toBeTruthy();
  return { bar, pill, body, kind };
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('1440 wide: the pill sits in the bar\'s band, at the bar\'s height, one gap to its right', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(harnessUrl);
  const { bar, pill, body, kind } = await measure(page);

  expect(kind).toBe('beside-right');
  // SAME BAND, SAME HEIGHT — the founder's "on the top … following the standard shape".
  expect(Math.abs(pill.y - bar.y), `top: pill ${pill.y} vs bar ${bar.y}`).toBeLessThanOrEqual(1);
  expect(Math.abs(pill.height - bar.height), `height: pill ${pill.height} vs bar ${bar.height}`).toBeLessThanOrEqual(1);
  // IMMEDIATELY BESIDE, never over it, inside the canvas gutter.
  expect(pill.x).toBeGreaterThanOrEqual(bar.x + bar.width + GAP - 1);
  expect(pill.x).toBeLessThanOrEqual(bar.x + bar.width + GAP + 1);
  expect(pill.x + pill.width).toBeLessThanOrEqual(1440 - GUTTER + 1);
  expect(overlaps(bar, pill)).toBe(false);
  // L-11206 in pixels: the overlay body is the pill and nothing more (no 264px card behind it).
  expect(Math.abs(body.width - pill.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(body.height - pill.height)).toBeLessThanOrEqual(1);

  // The pill's surface is the bar's: opaque panel white, stadium radius.
  const surface = await page.locator('[data-testid="onboarding-compact-pill"]').evaluate((el) => {
    const cs = getComputedStyle(el);
    const bar = getComputedStyle(document.querySelector('[data-testid="site-view-quick-toggle"]')!);
    return {
      pillBg: cs.backgroundColor, barBg: bar.backgroundColor,
      pillRadius: cs.borderRadius, barRadius: bar.borderRadius,
      pillShadow: cs.boxShadow, barShadow: bar.boxShadow,
      pillBorder: cs.borderTopColor, barBorder: bar.borderTopColor,
      bodyBg: getComputedStyle(document.querySelector('[data-testid="onboarding-step-body"]')!).backgroundColor,
    };
  });
  expect(surface.pillBg).toBe(surface.barBg);
  expect(surface.pillBg).toBe('rgb(255, 255, 255)');
  expect(surface.pillRadius).toBe(surface.barRadius);
  expect(surface.pillShadow).toBe(surface.barShadow);
  expect(surface.pillBorder).toBe(surface.barBorder);
  expect(surface.bodyBg).toBe('rgba(0, 0, 0, 0)');

  await page.screenshot({ path: join(SHOTS, 'compact-pill-1440.png'), clip: { x: 0, y: 0, width: 1440, height: 160 } });
});

test('the words on the surface are BUILDING TYPE and Do it myself — nothing else', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(harnessUrl);
  const visible = await page.locator('[data-testid="onboarding-step-overlay"]').evaluate((el) => {
    // Chromium's innerText of a <select> lists EVERY option; what the eye sees is the
    // selected one. So: the rendered text of every element that is not an <option>, plus
    // the select's displayed value — and the hidden header / step chip render no boxes.
    const texts: string[] = [];
    for (const node of Array.from(el.querySelectorAll<HTMLElement>('label, select, button'))) {
      if (node.getClientRects().length === 0) continue; // display:none — not on the surface
      texts.push(node instanceof HTMLSelectElement ? node.selectedOptions[0]?.text ?? '' : node.innerText);
    }
    const header = el.querySelector<HTMLElement>('.os-header');
    return { text: texts.join(' ').replace(/\s+/g, ' ').trim(), headerBoxes: header ? header.getClientRects().length : -1 };
  });
  expect(visible.text).toBe('BUILDING TYPE Choose… Do it myself');
  expect(visible.headerBoxes, 'the "Set up your project" header still paints').toBe(0);
});

test('every width: the pill never overlaps the bar, and leaves the band only when nothing fits', async ({ page }) => {
  for (const width of [1440, 1180, 980, 820, 640, 520]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(harnessUrl);
    const { bar, pill, kind } = await measure(page);
    expect(overlaps(bar, pill), `${width}px: pill overlaps the bar (${kind})`).toBe(false);
    expect(pill.x, `${width}px: pill outside the left gutter`).toBeGreaterThanOrEqual(GUTTER - 1);
    expect(pill.x + pill.width, `${width}px: pill outside the right gutter`).toBeLessThanOrEqual(width - GUTTER + 1);
    if (kind === 'below') {
      expect(pill.y).toBeGreaterThanOrEqual(bar.y + bar.height + GAP - 1);
    } else {
      expect(Math.abs(pill.y - bar.y), `${width}px: left the band while placed ${kind}`).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: join(SHOTS, `compact-pill-${width}.png`), clip: { x: 0, y: 0, width, height: 160 } });
  }
});
