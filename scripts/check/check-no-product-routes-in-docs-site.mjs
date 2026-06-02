#!/usr/bin/env node
/**
 * scripts/check/check-no-product-routes-in-docs-site.mjs
 * ============================================================================
 * C51 §2.1.5 / §8 gate — "NO parallel marketing source outside the editor tree."
 *
 * ADR-055 §7 retired the Astro docs-site as a MARKETING surface: the customer-
 * facing pages (landing, pricing, manifesto, trust, start, solutions, resources)
 * moved into `apps/editor/src/ui/marketing/` so there is ONE source of truth the
 * apex pre-render + the in-app router both consume. The docs-site survives ONLY
 * as the developer-docs surface (`docs.pryzm.so`).
 *
 * This gate fails any PR that re-introduces a customer-facing marketing route as
 * an `apps/docs-site/src/pages/<name>.astro` file — the exact drift trap C51 §8
 * describes (two implementations of "the landing page" diverging within days).
 *
 * Allowed under apps/docs-site/src/pages/: developer-docs pages + `404.astro`
 * (site infrastructure). Forbidden: the marketing route names below.
 *
 * Exit 0 = clean. Exit 1 = a forbidden marketing page is present (prints which).
 *
 * @see docs/02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md §2.1.5, §8, §7
 * @see docs/02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md §7
 * ============================================================================
 */

import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const pagesDir = resolve(repoRoot, 'apps', 'docs-site', 'src', 'pages');

// Customer-facing marketing route names that now live ONLY in
// apps/editor/src/ui/marketing/ (+ the apex pre-render). Re-adding any as an
// .astro page reopens the ADR-052 drift trap. Compared case-insensitively on
// the file's basename without extension.
const FORBIDDEN = new Set([
  'index',      // landing — editor LandingPage.ts is canonical
  'pricing',    // C39 single pricing surface — @pryzm/entitlements
  'manifesto',
  'trust',
  'start',      // RAC onboarding — runs in-app per ADR-055 §5.2
  'solutions',
  'resources',
]);

if (!existsSync(pagesDir)) {
  // No docs-site pages dir at all → trivially compliant.
  console.log('[check-no-product-routes-in-docs-site] PASS — no apps/docs-site/src/pages/ directory.');
  process.exit(0);
}

/** Recursively collect every .astro file basename (sans ext) under pagesDir. */
function astroBasenames(dir, acc = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, name.name);
    if (name.isDirectory()) astroBasenames(full, acc);
    else if (name.name.toLowerCase().endsWith('.astro')) {
      acc.push({ base: name.name.replace(/\.astro$/i, '').toLowerCase(), rel: relative(repoRoot, full).replace(/\\/g, '/') });
    }
  }
  return acc;
}

const offenders = astroBasenames(pagesDir).filter((f) => FORBIDDEN.has(f.base));

if (offenders.length > 0) {
  console.error('[check-no-product-routes-in-docs-site] FAIL — marketing route(s) re-introduced in the docs-site:');
  for (const o of offenders) console.error(`  ${o.rel}`);
  console.error('\n  C51 §2.1.5 + §8: customer-facing marketing lives ONLY in apps/editor/src/ui/marketing/');
  console.error('  (consumed by the apex pre-render + the in-app router). The docs-site is developer-docs only.');
  console.error('  If you meant to add a developer-docs page, rename it so it is not one of:');
  console.error(`  ${[...FORBIDDEN].join(', ')}`);
  process.exit(1);
}

console.log('[check-no-product-routes-in-docs-site] PASS — no marketing routes in apps/docs-site/src/pages/.');
