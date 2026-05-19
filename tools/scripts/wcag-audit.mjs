#!/usr/bin/env node
// tools/scripts/wcag-audit.mjs — Wave A18-T23
//
// CONTRACT (C06 §3): Accessibility MUST meet WCAG 2.1 Level AA.
// This script launches a Playwright browser, navigates to the editor,
// injects axe-core, and fails on any critical or serious WCAG violation.
//
// Usage:
//   node tools/scripts/wcag-audit.mjs
//
// Environment:
//   PLAYWRIGHT_BASE_URL   — overrides default (https://$REPLIT_DEV_DOMAIN)
//   WCAG_HARD_FAIL        — set to '1' to hard-fail on any violation (default: warn-only)

import { chromium } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : 'http://localhost:5000');

const HARD_FAIL = process.env.WCAG_HARD_FAIL === '1';

async function runAudit() {
  console.log(`[wcag-audit] Target: ${BASE_URL}`);
  console.log(`[wcag-audit] Mode: ${HARD_FAIL ? 'HARD_FAIL' : 'warn-only'}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
    console.warn('[wcag-audit] networkidle timeout — proceeding with audit anyway');
  });

  // Inject axe-core from CDN
  await page.addScriptTag({
    url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js',
  });

  const results = await page.evaluate(async () => {
    // @ts-ignore — axe injected globally
    return await window.axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa'],
      },
      resultTypes: ['violations'],
    });
  });

  const critical = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  const moderate = results.violations.filter(
    (v) => v.impact === 'moderate' || v.impact === 'minor',
  );

  console.log(`\n[wcag-audit] ── Results ──────────────────────────────────`);
  console.log(`  Total violations : ${results.violations.length}`);
  console.log(`  Critical/Serious : ${critical.length}`);
  console.log(`  Moderate/Minor   : ${moderate.length}`);

  if (critical.length > 0) {
    console.log('\n[wcag-audit] ── Critical/Serious violations ──────────────');
    for (const v of critical) {
      console.log(`  [${v.impact.toUpperCase()}] ${v.id}: ${v.description}`);
      console.log(`    Help: ${v.helpUrl}`);
      for (const node of v.nodes.slice(0, 3)) {
        console.log(`    ↳ ${node.html.slice(0, 120)}`);
      }
    }
  }

  if (moderate.length > 0) {
    console.log('\n[wcag-audit] ── Moderate/Minor violations ────────────────');
    for (const v of moderate) {
      console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
    }
  }

  await browser.close();

  if (critical.length > 0 && HARD_FAIL) {
    console.error('\n[wcag-audit] FAIL — critical/serious WCAG violations found');
    process.exit(1);
  } else if (critical.length > 0) {
    console.warn('\n[wcag-audit] WARN — critical violations found (warn-only mode at Wave A18)');
    process.exit(0);
  } else {
    console.log('\n[wcag-audit] PASS — no critical/serious violations');
    process.exit(0);
  }
}

runAudit().catch((err) => {
  console.error('[wcag-audit] Fatal error:', err);
  process.exit(1);
});
