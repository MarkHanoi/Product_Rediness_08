#!/usr/bin/env node
/**
 * scripts/build/prerender-apex.mjs
 * ============================================================================
 * PRYZM apex pre-render — the SSG (static-site-generation) stage of the
 * Cloudflare Pages apex deploy promised by ADR-055 §0 + §3 Phase A.
 *
 * What this is
 * ------------
 *   pnpm build:apex  →  apps/editor/dist-apex/
 *                         ├─ index.html              (landing)
 *                         ├─ pricing/index.html
 *                         ├─ manifesto/index.html
 *                         ├─ trust/index.html
 *                         ├─ _headers                (Cloudflare Pages CSP/sec)
 *                         └─ _redirects              (Cloudflare Pages SPA-ish)
 *
 * Why a custom script instead of vite-ssg / vite-plugin-prerender / puppeteer
 * --------------------------------------------------------------------------
 *   * The editor's L7 marketing surfaces are vanilla DOM (no React/Vue), so
 *     vite-ssg (which expects a framework-mounted root) is the wrong shape.
 *   * vite-plugin-prerender uses Puppeteer / headless Chrome — a 150 MB
 *     install and a 30+ second cold start per route just to scrape a string
 *     of static HTML. That is gold-plating for four pure-DOM pages.
 *   * Wrangler's SPA helper does no pre-render — it just serves dist/ — so
 *     SEO / first-paint promises in ADR-055 §0 ("< 100 ms first paint, SEO
 *     crawlable") would NOT be honoured.
 *   * The project already has happy-dom + tsx in the workspace (CLAUDE.md
 *     root vitest config + write-prod-shim.mjs respectively). Reusing them
 *     adds zero new dependencies and zero new attack surface.
 *
 * What this script DOES NOT do (deliberate constraint, ADR-055 §0)
 * ----------------------------------------------------------------
 *   * It does NOT call composeRuntime() / does NOT touch THREE / does NOT
 *     open a DB connection / does NOT init Yjs.
 *   * It does NOT dynamically import the editor's LandingPage.ts /
 *     PricingPage.ts CLASSES — those drag in LandingPageMosaic →
 *     @pryzm/core-app-model (the domain-engine SCC). Per MEMORY.md
 *     "SCC: no barrel access at module load", reading the barrel at module
 *     load resolves several re-exports as undefined and crashes the boot.
 *     INSTEAD: the script dynamic-imports only the three pure-CSS-string
 *     modules (tokens.ts, marketingPages.ts, pricingPage.ts) which have
 *     zero `import` statements, and inlines the HTML structure derived
 *     from the editor's build() templates as data.
 *   * It does NOT emit per-route JS bundles. The apex is pure-HTML +
 *     inline-CSS, no client script tags. CSP can therefore forbid script-src
 *     entirely (see _headers below).
 *
 * Idempotency
 * -----------
 *   The script writes byte-identical output on re-run. No build timestamps,
 *   no random IDs, no inline Date.now(). This is a non-negotiable requirement
 *   from the spec — re-running between deploys must produce no diff or it
 *   breaks Cloudflare Pages' deployment-content-hash equality check.
 *
 * Total runtime
 * -------------
 *   Cold: ~1.5 s. No network. No subprocess. Pure ESM + happy-dom DOM build.
 *
 * @see docs/02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md §0, §3
 * @see docs/05-guides/deployments/PHASE-A-MIGRATION-RUNBOOK-2026-Q3.md §3
 * @see scripts/build/write-prod-shim.mjs — sibling build script pattern
 * ============================================================================
 */

import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

// ----- paths --------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
// scripts/build/<file>.mjs  → repoRoot is two levels up.
const repoRoot = resolve(here, '..', '..');
const editorRoot = resolve(repoRoot, 'apps', 'editor');
const stylesPanels = resolve(editorRoot, 'src', 'ui', 'styles', 'panels');
const tokensPath = resolve(editorRoot, 'src', 'ui', 'styles', 'tokens.ts');
const outDir = resolve(editorRoot, 'dist-apex');

// ----- tsx dynamic-import bootstrap ---------------------------------------
//
// tsx is the runtime TypeScript loader already present in the repo (it boots
// production via dist/index.cjs and tests via `tsx --test`). We register it
// in-process so the import() calls below resolve `.ts` modules.
//
// We import tsx's ESM register API rather than spawning `tsx node …` because
// keeping the prerender as a single Node process makes happy-dom's Window
// available without IPC, and produces clearer error stacks.

await import('tsx/esm/api').then((m) => m.register());

// ----- pure-CSS-string modules (safe to dynamic-import) -------------------
//
// These three modules have ZERO imports (verified via grep). They export
// plain template strings only. No runtime, no DOM, no THREE, no engine.
// Re-using the editor's own CSS source is the design-token contract:
// the apex looks identical to the in-app marketing surfaces because it
// IS the same CSS bytes.

const tokensMod = await import(pathToFileURL(tokensPath).href);
const marketingMod = await import(pathToFileURL(join(stylesPanels, 'marketingPages.ts')).href);
const pricingMod = await import(pathToFileURL(join(stylesPanels, 'pricingPage.ts')).href);

const DESIGN_TOKENS = tokensMod.DESIGN_TOKENS ?? '';
const LANDING_PAGE_STYLES = marketingMod.LANDING_PAGE_STYLES ?? '';
const PRICING_PAGE_STYLES = pricingMod.PRICING_PAGE_STYLES ?? '';

if (!DESIGN_TOKENS || !LANDING_PAGE_STYLES || !PRICING_PAGE_STYLES) {
  console.error('[prerender-apex] FATAL — at least one CSS source string is empty.');
  console.error('  tokens length:           ', DESIGN_TOKENS.length);
  console.error('  marketing landing length:', LANDING_PAGE_STYLES.length);
  console.error('  pricing length:          ', PRICING_PAGE_STYLES.length);
  process.exit(1);
}

// ----- shared static HTML fragments ---------------------------------------

/**
 * The PRYZM pyramid icon — same inline SVG the editor's LandingPage emits in
 * its lp-nav-brand block. Lifted as a constant so all four routes render
 * the identical brand mark byte-for-byte.
 */
const PRYZM_PYRAMID_SVG = `
<svg class="lp-logo-icon" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path d="M18.2 2.6 3.6 27.9 26.8 33.2 32.4 23.6 18.2 2.6Z" stroke="#0b0b12" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M18.2 2.6 3.6 27.9" stroke="#6600FF" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M18.2 2.6 26.8 33.2" stroke="#0b0b12" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`.trim();

/**
 * Marketing-surface CSP — no inline JS, no remote script-src, no eval.
 * The apex is pure static HTML; allowing script-src would be a footgun
 * for a future contributor who pastes a tracking pixel without thinking.
 * `style-src 'unsafe-inline'` is required because every route inlines its
 * CSS into <style> for first-paint speed.
 */
const APEX_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

// ----- per-route renderers ------------------------------------------------
//
// Each renderer returns an object with the route's HTML structure
// (head + body) as separate strings. Common shell wrapping (<!DOCTYPE>,
// <html>, charset, viewport, CSP meta) is applied later by writeRoute().

/**
 * Landing route — mirrors apps/editor/src/ui/platform/LandingPage.ts build()
 * minus the dynamic behaviours (mosaic media-list fetch, scroll-reveal,
 * dropdown menus). The apex landing is a static teaser; clicking any CTA
 * jumps to app.pryzm.so where the live editor takes over.
 */
function renderLanding() {
  // Inline CSS bundle: tokens first (so var(...) references resolve), then
  // the landing page panel. Pricing CSS is NOT included on the landing page —
  // the apex bundle stays per-route-minimal.
  const head = `
    <title>PRYZM — Build the future, intelligently.</title>
    <meta name="description" content="PRYZM is a design-intelligence platform for the built environment. One conversation, from raw site to coordinated building.">
    <meta name="theme-color" content="#6600FF">
    <link rel="canonical" href="https://pryzm.so/">
    <style>${DESIGN_TOKENS}${LANDING_PAGE_STYLES}</style>
  `;

  // Body mirrors LandingPage.build() output. Every CTA on the apex points
  // at app.pryzm.so/<action> (signup/login) rather than the in-app router,
  // because there IS no in-app router on the apex.
  const body = `
    <div class="lp-shell">
      <nav class="lp-nav">
        <div class="lp-nav-brand" aria-label="PRYZM">
          ${PRYZM_PYRAMID_SVG}
          <div class="lp-logo-wordmark">
            <span class="lp-logo-name">PRYZM</span>
            <span class="lp-logo-sub">BIM PLATFORM</span>
          </div>
        </div>
        <div class="lp-nav-links">
          <a class="lp-nav-link" href="/manifesto">Manifesto</a>
          <a class="lp-nav-link" href="/pricing">Pricing</a>
          <a class="lp-nav-link" href="/trust">Trust</a>
        </div>
        <div class="lp-nav-actions">
          <a class="lp-nav-login" href="https://app.pryzm.so/sign-in">Log in</a>
          <a class="lp-nav-contact" href="https://app.pryzm.so/contact">Contact sales</a>
          <a class="lp-nav-cta" href="https://app.pryzm.so/signup">Get started for free</a>
        </div>
      </nav>

      <section class="lp-hero">
        <div class="lp-hero-logo-block" aria-hidden="true"></div>
        <h1 class="lp-hero-heading">PRYZM</h1>
        <p class="lp-hero-sub">Build the future, intelligently.</p>
        <div class="lp-hero-ctas">
          <a class="lp-hero-btn lp-hero-btn--enter" href="https://app.pryzm.so/signup">
            <svg width="14" height="18" viewBox="0 0 18 22" fill="none" aria-hidden="true" style="flex-shrink:0">
              <path d="M0 0L0 17.5L4.5 13L7.5 20L9.5 19.2L6.5 12H12L0 0Z" fill="currentColor"/>
            </svg>
            Start here
          </a>
        </div>
      </section>

      <section class="lp-bespoke lp-reveal" id="lp-bespoke">
        <div class="lp-bespoke-inner">
          <div class="lp-bespoke-col lp-bespoke-col--left">
            <h2 class="lp-bespoke-heading">Building your own platform?</h2>
            <p class="lp-bespoke-desc">AI is making software cheap to build. We partner with enterprises to deploy a bespoke BIM platform under their brand — custom element libraries, your workflows, your infrastructure.</p>
            <div class="lp-bespoke-actions">
              <a href="https://app.pryzm.so/contact">Talk to us</a>
              <a href="/pricing">See enterprise options</a>
            </div>
          </div>
          <div class="lp-bespoke-col lp-bespoke-col--right">
            <ul class="lp-bespoke-list">
              <li>Custom element &amp; material libraries</li>
              <li>Integration with Revit, ArchiCAD, and ERP systems</li>
              <li>White-label under your brand</li>
              <li>On-premise or private cloud deployment</li>
              <li>Dedicated build team and ongoing support</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  `;

  return { head, body };
}

/**
 * Pricing route — static plan-card grid. The apex copy must MATCH the
 * editor's PricingPage source-of-truth for the five public plans listed in
 * apps/editor/src/ui/platform/PricingPage.ts (free, architect, studio,
 * firm, enterprise). The "owner" tier is intentionally omitted — that's a
 * platform-internal plan, not customer-facing.
 *
 * To keep the apex apex-only (no auth, no Stripe), every "Choose this plan"
 * link points at app.pryzm.so/signup?plan=<id> where the editor's existing
 * AuthModal + upgrade flow takes over.
 */
function renderPricing() {
  const head = `
    <title>PRYZM — Pricing</title>
    <meta name="description" content="Start free. Upgrade when your practice grows. Cancel anytime. From solo architect to enterprise — pick the plan that fits.">
    <meta name="theme-color" content="#6600FF">
    <link rel="canonical" href="https://pryzm.so/pricing">
    <style>${DESIGN_TOKENS}${PRICING_PAGE_STYLES}</style>
  `;

  // Five customer-facing plans. Prices and feature bullets are copied from
  // the editor's PricingPage so the apex matches what users see post-auth.
  // Source: apps/editor/src/ui/platform/PricingPage.ts:25-86.
  const PLANS = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      features: [
        'Up to 3 saved projects',
        'All core modeling tools',
        '5 AI actions/month (Design Advisor)',
        'Basic view modes',
        'PNG export',
        'Single user',
      ],
    },
    {
      id: 'architect',
      name: 'Architect',
      price: '$29 / mo',
      features: [
        'Unlimited projects',
        'All modeling features incl. curtain walls & roofs',
        'IFC & GLB/GLTF export',
        '50 AI actions/month (all AI tools)',
        'Geospatial / Cesium view',
        'Version history (last 15)',
        'PDF export',
        'Email support',
      ],
    },
    {
      id: 'studio',
      name: 'Studio',
      price: '$99 / mo',
      features: [
        'Everything in Architect',
        'Up to 8 seats (floating licenses)',
        'Real-time collaboration',
        'Shared project library',
        '200 AI actions/month (shared pool)',
        'Unlimited version history',
        'Custom roles & permissions',
        'Priority email + chat support',
      ],
    },
    {
      id: 'firm',
      name: 'Firm',
      price: '$249 / mo',
      features: [
        'Everything in Studio',
        'Up to 25 seats',
        '500 AI actions/month (shared pool)',
        'Cloud-backed persistent storage',
        'SSO / SAML authentication',
        'AI Approval audit trail export',
        'API access',
        '4-hour priority support SLA',
        'Dedicated onboarding session',
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'Contact sales',
      features: [
        'Bespoke platform deployment (custom scoping)',
        'Unlimited seats',
        'Custom AI action limits',
        'White-labeling options',
        'On-premise deployment option',
        'Custom IFC schema configuration',
        'Dedicated customer success manager',
        'Custom SLAs & DPA',
        'Volume discounts on AI add-ons',
      ],
    },
  ];

  const planCard = (p) => `
    <article class="pr-plan-card" data-plan="${p.id}">
      <header class="pr-plan-header">
        <h3 class="pr-plan-name">${p.name}</h3>
        <p class="pr-plan-price">${p.price}</p>
      </header>
      <ul class="pr-plan-features">
        ${p.features.map((f) => `<li>${f}</li>`).join('')}
      </ul>
      <a class="pr-plan-cta" href="https://app.pryzm.so/signup?plan=${p.id}">
        ${p.id === 'enterprise' ? 'Talk to us' : 'Choose ' + p.name}
      </a>
    </article>
  `;

  const body = `
    <div class="pr-page">
      <header class="pr-header">
        <a class="pr-back-btn" href="/">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 12H5"/><path d="m12 5-7 7 7 7"/>
          </svg>
          Back
        </a>
        <div class="pr-header-brand">
          ${PRYZM_PYRAMID_SVG}
          <span style="font-weight:700;letter-spacing:0.04em">PRYZM</span>
        </div>
      </header>

      <div class="pr-hero">
        <h1 class="pr-hero-title">Plans &amp; Pricing</h1>
        <p class="pr-hero-subtitle">Start free. Upgrade when your practice grows. Cancel anytime.</p>
      </div>

      <div class="pr-plans" id="pr-plans">
        ${PLANS.map(planCard).join('')}
      </div>

      <div class="pr-bespoke-band">
        <div class="pr-bespoke-band-inner">
          <div class="pr-bespoke-content">
            <h2 class="pr-bespoke-heading">Enterprise custom deployments</h2>
            <p class="pr-bespoke-desc">For organisations that need PRYZM deployed as their own product — white-labelled, on-premise, and fully customised to your workflows. Scoped and priced separately from the plans above.</p>
            <ul class="pr-bespoke-list">
              <li>Discovery and scoping workshop</li>
              <li>Custom IFC schema configuration</li>
              <li>Bespoke element family and material libraries</li>
              <li>Integration with your existing tools (ERP, Revit, project management)</li>
              <li>White-label branding and private deployment</li>
              <li>Handover, training, and ongoing engineering support</li>
            </ul>
          </div>
          <div class="pr-bespoke-cta-wrap">
            <a id="pr-bespoke-cta" href="https://app.pryzm.so/contact">Talk to us about a bespoke build</a>
          </div>
        </div>
      </div>
    </div>
  `;

  return { head, body };
}

/**
 * Marketing-page CSS (dark, content-heavy theme) for the Manifesto and Trust
 * routes. These two pages don't (yet) exist as editor TS components — the
 * editor currently routes manifesto/trust through the same lp- shell. The
 * Astro-era content was the canonical source (apps/docs-site/src/pages/
 * {manifesto,trust}.astro); this stylesheet is its visual translation,
 * lifted from those files' inline <style> blocks so the apex output
 * matches the historical content surface byte-for-byte.
 *
 * LANDMINE (flagged in the migration runbook): when ManifestoPage.ts and
 * TrustPage.ts land in the editor, this stylesheet should move into
 * apps/editor/src/ui/styles/panels/contentPages.ts and be dynamic-imported
 * here the same way LANDING_PAGE_STYLES is. Until then, the content layer
 * has a small style-source duplication.
 */
const CONTENT_PAGE_STYLES = `
  :root {
    --pryzm-purple: #6600ff;
    --pryzm-purple-lighter: #8c4dff;
    --pryzm-ink: #0a0a0f;
    --pryzm-paper: #14141c;
    --pryzm-paper-elevated: #1c1c28;
    --pryzm-border: #2a2a36;
    --pryzm-text-primary: #f5f5fa;
    --pryzm-text-secondary: #a8a8b5;
    --pryzm-success: #00c781;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    background: var(--pryzm-ink);
    color: var(--pryzm-text-primary);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    line-height: 1.6;
  }
  main { max-width: 880px; margin: 0 auto; padding: 4rem 1.5rem 6rem; }
  h1 { font-size: 2.75rem; font-weight: 700; margin: 0 0 1rem; letter-spacing: -0.02em; line-height: 1.15; }
  h2 { font-size: 1.6rem; font-weight: 700; margin: 3rem 0 1rem; letter-spacing: -0.01em; }
  h3 { font-size: 1.15rem; font-weight: 600; margin: 2rem 0 0.5rem; color: var(--pryzm-purple-lighter); }
  p { margin: 0 0 1rem; }
  .lede { font-size: 1.2rem; color: var(--pryzm-text-secondary); margin-bottom: 3rem; }
  .promise { font-size: 1.4rem; font-weight: 600; padding: 1.25rem 1.5rem; margin: 1.5rem 0 2rem; background: var(--pryzm-paper); border-left: 3px solid var(--pryzm-purple); border-radius: 0.5rem; }
  .nb { color: var(--pryzm-purple-lighter); font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; font-size: 0.95rem; }
  thead th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--pryzm-border); font-weight: 600; color: var(--pryzm-text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
  tbody td { padding: 0.85rem 0.75rem; border-bottom: 1px solid var(--pryzm-border); vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  .dont { color: var(--pryzm-text-secondary); }
  .say  { color: var(--pryzm-text-primary); }
  .nav { padding: 1rem 0; border-bottom: 1px solid var(--pryzm-border); margin-bottom: 2rem; font-size: 0.95rem; }
  .nav a { color: var(--pryzm-text-secondary); text-decoration: none; margin-right: 1.5rem; }
  .nav a:hover, .nav a:focus-visible { color: var(--pryzm-purple-lighter); }
  .nav a.brand { color: var(--pryzm-text-primary); font-weight: 700; }
  .pillar-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin: 2rem 0; }
  .pillar { background: var(--pryzm-paper); border: 1px solid var(--pryzm-border); border-radius: 0.75rem; padding: 1.25rem; }
  .pillar h3 { margin-top: 0; }
  .pillar p { font-size: 0.95rem; color: var(--pryzm-text-secondary); margin-bottom: 0.5rem; }
  .pillar .contract { font-size: 0.8rem; color: var(--pryzm-purple-lighter); font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
  ul { padding-left: 1.5rem; }
  li { margin-bottom: 0.5rem; }
  .check { color: var(--pryzm-success); font-weight: 700; }
  footer.colophon { margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--pryzm-border); font-size: 0.85rem; color: var(--pryzm-text-secondary); }
  footer.colophon code { background: var(--pryzm-paper); padding: 0.1rem 0.4rem; border-radius: 0.25rem; color: var(--pryzm-text-primary); }
  a { color: var(--pryzm-purple-lighter); }
  a:hover, a:focus-visible { color: var(--pryzm-text-primary); }
`;

/**
 * Manifesto route — content surface of docs/01-strategy/manifesto.md. Until
 * a ManifestoPage.ts component ships in the editor, this is the canonical
 * apex-side rendering. Content lifted from apps/docs-site/src/pages/
 * manifesto.astro (the Astro-era source-of-truth that ADR-052 retired).
 *
 * Per manifesto §5: aspirational about the result, plain-spoken about the
 * work, curated about what we ship. The body is intentionally long-form;
 * if it ever exceeds ~50 KB consider splitting.
 */
function renderManifesto() {
  const head = `
    <title>PRYZM — Manifesto</title>
    <meta name="description" content="One conversation, from raw site to coordinated building. The PRYZM design-intelligence platform exists to replace the Revit-and-WeTransfer workflow for a generation of architects.">
    <meta name="theme-color" content="#0a0a0f">
    <link rel="canonical" href="https://pryzm.so/manifesto">
    <style>${CONTENT_PAGE_STYLES}</style>
  `;

  const body = `
    <main>
      <nav class="nav" aria-label="Site">
        <a href="/" class="brand">PRYZM</a>
        <a href="/manifesto" aria-current="page">Manifesto</a>
        <a href="/pricing">Pricing</a>
        <a href="/trust">Trust</a>
      </nav>

      <h1>Buildings are made of light. Of habit. Of weather. Of money. Of compromise.</h1>
      <p class="lede">The software that builds them treats them as geometry.</p>

      <p>
        For thirty years the industry's answer to "how does an architect
        design a building?" has been a CAD command line in a 3D viewport.
        Walls are line segments. Doors are stretched holes. Rooms are
        derived polygons. The intent — the bedroom that needs a south
        window, the kitchen that needs a triangle, the corridor that
        must reach every room, the apartment a family will actually live
        in — sits in the architect's head and never enters the model.
      </p>

      <p>
        PRYZM exists to fix this. We are building the first design
        platform where the model knows what it is and the conversation
        is the interface.
      </p>

      <h2>The promise</h2>
      <p class="promise">One conversation, from raw site to coordinated building.</p>
      <p>
        That is the only promise. Everything else — the renderer, the
        file format, the constraint database, the marketplace, the
        sovereignty model, the WCAG audit — is in service of that
        single line. When we ship a feature, we ask: does this make
        the single-conversation promise more true, less true, or the
        same? Features that don't move the needle don't ship.
      </p>

      <h2>Why now</h2>
      <p>Three things became possible between 2023 and 2026:</p>
      <table>
        <thead>
          <tr><th>Capability</th><th>What changed</th><th>Why it matters</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>LLMs with spatial reasoning</strong></td>
            <td>Modern frontier models handle "make the master bedroom face south and put the bathroom between it and the kids' room" as a coherent instruction.</td>
            <td>The brief becomes the input. The model becomes the output. The middle is the platform.</td>
          </tr>
          <tr>
            <td><strong>Browser-native 3D at desktop performance</strong></td>
            <td>WebGL2 → WebGPU; offscreen canvas; 60 fps rendering of 10 k+ elements in Chrome / Safari / Firefox without an installer.</td>
            <td>A BIM tool can finally run where the architect actually works — the browser. Not Windows-only. Not 18 GB downloads. Not per-seat licence dongles.</td>
          </tr>
          <tr>
            <td><strong>CRDT collaboration at design-tool fidelity</strong></td>
            <td>Yjs + Automerge are mature enough to hold a BIM scene with hundreds of concurrent edits; explicit-conflict semantics are solved.</td>
            <td>Architects working with consultants, clients, and contractors in the same model — not in a chain of WeTransfer'd IFCs.</td>
          </tr>
        </tbody>
      </table>
      <p>We are not early. We are not late. The wave is breaking. The window is open and will not stay open.</p>

      <h2>Who we are</h2>
      <p>We are not a Revit replacement vendor. We are not a generative AI demo. We are not an image generator with rectangles on top.</p>
      <p><span class="nb">We are building a design-intelligence platform for the built environment.</span> Every word matters.</p>
      <ul>
        <li><strong>Design</strong> — not analysis, not visualisation, not documentation. The act of deciding what a building should be.</li>
        <li><strong>Intelligence</strong> — the platform carries spatial, environmental, regulatory, and programmatic knowledge. It is not a passive editor.</li>
        <li><strong>Platform</strong> — not a tool. Plugin authors, family creators, pricing-catalogue vendors, and AI-workflow developers extend it. The marketplace is a first-class surface.</li>
        <li><strong>Built environment</strong> — buildings, but also rooms, neighbourhoods, sites, climates. We do not stop at the building envelope.</li>
      </ul>

      <h2>How we talk to customers</h2>
      <p>Three sentences:</p>
      <p class="promise">Aspirational about the result. Plain-spoken about the work. Curated about what we ship.</p>

      <h3>Aspirational about the result</h3>
      <p>The villa-rental ad does not say "47 affordable holiday properties available." It says <strong>"Stay where the light is different."</strong> That is the result, not the inventory.</p>
      <table>
        <thead><tr><th>Don't say</th><th>Say</th></tr></thead>
        <tbody>
          <tr><td class="dont">"Generate apartment layouts with our AI engine."</td><td class="say">"Move from site to plan in one afternoon."</td></tr>
          <tr><td class="dont">"BIM editor with IFC export."</td><td class="say">"The model your engineer receives is the model you authored."</td></tr>
          <tr><td class="dont">"WCAG 2.2 AA accessible."</td><td class="say">"Designed so a blind architect can lead a project, not just contribute."</td></tr>
        </tbody>
      </table>

      <h3>Plain-spoken about the work</h3>
      <p>We do not promise magic. We do not claim our AI "understands buildings" — we claim our AI <strong>routes a prompt through a 248-rule constraint database to produce a layout the architect refines</strong>. Specifics are the credibility.</p>

      <h3>Curated about what we ship</h3>
      <p>Every capability listed in product is shipped, measured, and supported. The roadmap is internal. The track record is external.</p>

      <h2>What we will not be</h2>
      <ul>
        <li><strong>A Revit clone.</strong> Revit exists. PRYZM is not a price-undercutting alternative; it is a different category of product.</li>
        <li><strong>The AI hype company.</strong> AI is a technique we use, not a product we sell. We do not put "AI" in the company name. We do not name features after model versions.</li>
        <li><strong>A shovel-ware vendor.</strong> PRYZM is for the <em>design</em> phase, where decisions are made. Construction-administration, facilities-management, asset-tracking — important markets, but adjacencies, not the core.</li>
        <li><strong>A closed format.</strong> <code>.pryzm</code> is open. IFC round-trip is real. No lock-in. Customers can leave with their data, and that fact alone constrains what we can do with the format forever.</li>
      </ul>

      <h2>The shape of the company</h2>
      <p>Three structural commitments:</p>
      <ul>
        <li><strong>Engineering-led, design-tasted.</strong> One team that holds the whole shape — no product-team-hands-spec-to-engineering-team pipeline.</li>
        <li><strong>Open by default, paid by tier.</strong> Every customer-facing capability is documented publicly. The file format is open. The plugin SDK is open. We trade the moat of secrecy for the moat of momentum.</li>
        <li><strong>Long-arc, not VC-financialised.</strong> We are building a 10-year company. Our north-star metric is net revenue retention of architects with &gt; 12-month tenure.</li>
      </ul>

      <footer class="colophon">
        This page is generated from the canonical
        <code>docs/01-strategy/manifesto.md</code>.
        Single source of truth · every word here traces back there.
      </footer>
    </main>
  `;

  return { head, body };
}

/**
 * Trust route — customer-facing surface of contracts C22 (Privacy / PII Tier),
 * C23 (Provenance & AI Audit), C43 (Accessibility), C48 (Backup & DR).
 * Content lifted from apps/docs-site/src/pages/trust.astro.
 */
function renderTrust() {
  const head = `
    <title>PRYZM — Trust</title>
    <meta name="description" content="What PRYZM promises about your data, your AI artefacts, your accessibility, and your recovery — each backed by a contract you can read.">
    <meta name="theme-color" content="#0a0a0f">
    <link rel="canonical" href="https://pryzm.so/trust">
    <style>${CONTENT_PAGE_STYLES}</style>
  `;

  const body = `
    <main>
      <nav class="nav" aria-label="Site">
        <a href="/" class="brand">PRYZM</a>
        <a href="/manifesto">Manifesto</a>
        <a href="/pricing">Pricing</a>
        <a href="/trust" aria-current="page">Trust</a>
      </nav>

      <h1>What we promise. How we deliver. What you can audit.</h1>
      <p class="lede">Every promise on this page is anchored to a public contract in the PRYZM repository. The contracts are the source of truth; this page is the customer-readable summary.</p>

      <div class="pillar-grid">
        <div class="pillar">
          <h3>Privacy</h3>
          <p>Your PII stays in your region. Your project data stays where you put it. You can delete everything in 30 days.</p>
          <div class="contract">C22 — Privacy &amp; PII Tier</div>
        </div>
        <div class="pillar">
          <h3>Provenance</h3>
          <p>Every AI call is recorded with the model, the prompt hash, the cost, the approval state. You can audit any element back to its origin.</p>
          <div class="contract">C23 — Provenance &amp; AI Audit</div>
        </div>
        <div class="pillar">
          <h3>Accessibility</h3>
          <p>WCAG 2.2 AA across every shipped surface. AAA on text-dense surfaces. Keyboard-complete for every editor tool.</p>
          <div class="contract">C43 — Accessibility</div>
        </div>
        <div class="pillar">
          <h3>Recovery</h3>
          <p>Per-tier backups. Cross-region failover. Runbooks for every failure mode. Drill cadence stamped on the trust page.</p>
          <div class="contract">C48 — Backup &amp; DR</div>
        </div>
      </div>

      <h2>Your data</h2>
      <p>We classify every byte in four tiers. Different tiers live in different storage with different controls:</p>
      <table>
        <thead><tr><th>Tier</th><th>What it is</th><th>Where it lives</th><th>Who can read it</th></tr></thead>
        <tbody>
          <tr><td><strong>PII</strong></td><td>Your email, name, billing address, IP, payment refs</td><td>Region-locked (EU / US / AP per your choice); platform-key encrypted</td><td>You · DSAR worker · privacy team (audited)</td></tr>
          <tr><td><strong>Project</strong></td><td>Geometry, element properties, comments, AI artefacts</td><td>Region-locked; BYOK available (Mid-Firm+)</td><td>You + collaborators you invited</td></tr>
          <tr><td><strong>Telemetry</strong></td><td>Anonymised usage metrics + perf timing</td><td>Cross-region aggregation OK; never receives raw PII</td><td>PRYZM engineering (aggregate only)</td></tr>
          <tr><td><strong>Derived</strong></td><td>Generated layouts, exports, summaries inheriting PROJECT data</td><td>Inherits PROJECT region</td><td>You + collaborators you invited</td></tr>
        </tbody>
      </table>
      <p>You can ask for an export of every PII + PROJECT row tied to you. We deliver within 30 days. You can ask for erasure; we purge within 30 days plus 90 days of cold-backup TTL.</p>

      <h2>Your AI calls</h2>
      <p>PRYZM uses AI to propose apartment layouts, critique plans, and answer queries. Every model call is audited:</p>
      <ul>
        <li><span class="check">✓</span> Model name + version recorded (no aliases)</li>
        <li><span class="check">✓</span> Prompt SHA recorded; redacted preview stored (first 1 KB only)</li>
        <li><span class="check">✓</span> Cost in USD recorded per call</li>
        <li><span class="check">✓</span> Approval state tracked: <em>auto-applied</em>, <em>user-approved</em>, <em>user-rejected</em>, <em>pending</em>, <em>never-applied</em></li>
        <li><span class="check">✓</span> Reproducibility flag: deterministic (with seed) for our offline engines; non-deterministic for relay-based calls</li>
        <li><span class="check">✓</span> Element-id graph: every element produced by an AI call links back to the artefact that proposed it</li>
      </ul>

      <h2>Your access</h2>
      <p>Everything we ship meets WCAG 2.2 AA. Text-dense surfaces (Inspect tree, Data panel) target AAA. Every editor tool has a keyboard shortcut documented in the in-product cheat-sheet (press <kbd>?</kbd>).</p>
      <ul>
        <li>Static contrast audit runs on every PR — zero failing token pairs to merge</li>
        <li>Live axe-core gate scheduled per accessibility roadmap</li>
        <li>Screen-reader announce service for every aria-live region (no raw <code>aria-live</code> attributes)</li>
        <li>Focus indicators meet 3:1 contrast minimum; the platform's focus ring is its own audited token</li>
      </ul>

      <h2>Your recovery</h2>
      <p>Things go wrong. We've written down what we do when they do:</p>
      <table>
        <thead><tr><th>Failure mode</th><th>Recovery target</th><th>Runbook</th></tr></thead>
        <tbody>
          <tr><td>Database primary failure</td><td>30-minute RTO</td><td>Promote read-replica → reconnect → verify</td></tr>
          <tr><td>Regional outage</td><td>4-hour RTO</td><td>Cross-region failover with cold-backup fallback</td></tr>
          <tr><td>Ransomware</td><td>24-hour RTO</td><td>Quarantine-first → credential rotation → mandatory disclosure</td></tr>
          <tr><td>Accidental deletion</td><td>Tier-keyed (see below)</td><td>Per-tier retention window → in-place restore</td></tr>
        </tbody>
      </table>

      <h2>The contracts</h2>
      <p>Every promise above is anchored to a contract. The contracts live in the PRYZM repo and are public:</p>
      <ul>
        <li><strong>C22</strong> Privacy &amp; PII Tier — data classification, region routing, DSAR, breach reporting</li>
        <li><strong>C23</strong> Provenance &amp; AI Audit — every AI call writes an artefact before returning; cycle-free DAG of elements ↔ artefacts</li>
        <li><strong>C39</strong> Pricing &amp; Plan Tiers — every feature gate; pricing page is generated from the registry, never hand-edited</li>
        <li><strong>C43</strong> Accessibility — WCAG 2.2 AA target with AAA elevations; per-surface keyboard surface; reduced-motion respected</li>
        <li><strong>C48</strong> Backup &amp; Disaster Recovery — per-tier retention; cross-region failover; drill cadence; runbook discipline</li>
      </ul>

      <footer class="colophon">
        This page summarises the canonical contracts in <code>docs/02-decisions/contracts/</code>.
        Single source of truth · every word here traces back there.
      </footer>
    </main>
  `;

  return { head, body };
}

// ----- routes table -------------------------------------------------------

const ROUTES = [
  { path: '/',          file: 'index.html',           render: renderLanding,    label: 'landing' },
  { path: '/pricing',   file: 'pricing/index.html',   render: renderPricing,    label: 'pricing' },
  { path: '/manifesto', file: 'manifesto/index.html', render: renderManifesto,  label: 'manifesto' },
  { path: '/trust',     file: 'trust/index.html',     render: renderTrust,      label: 'trust' },
];

// ----- DOM-snapshot pipeline ----------------------------------------------

/**
 * Builds a happy-dom Document for one route, injects head + body, returns
 * a serialised HTML string. Using happy-dom (rather than string templating)
 * gives us a real DOM tree for any future visitor (a11y-axe pre-check, link
 * audit, image-path resolver) without re-architecting.
 *
 * The happy-dom Window is freshly constructed per route — no state leaks
 * between routes.
 */
function renderToHtmlString({ head, body }) {
  const win = new Window({ url: 'https://pryzm.so/' });
  const doc = win.document;

  // happy-dom's default Document already has <html>, <head>, <body>.
  // We replace head content and body content rather than rebuild the tree
  // so the resulting outerHTML is canonical.
  doc.documentElement.setAttribute('lang', 'en');

  // Common head — every route gets these. Route-specific head (title, meta
  // description, route-specific styles) is concatenated after.
  doc.head.innerHTML = `
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta http-equiv="Content-Security-Policy" content="${APEX_CSP.replace(/"/g, '&quot;')}">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta name="color-scheme" content="light dark">
    ${head}
  `.trim();

  doc.body.innerHTML = body.trim();

  // Serialise with DOCTYPE prefix; happy-dom's outerHTML does not emit one.
  const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML + '\n';

  // Tear down the Window's internal timers / event listeners. Important for
  // running this script repeatedly in a single Node process (e.g. from a
  // wrapper that builds all four routes in a loop without re-spawning).
  win.happyDOM.close();

  return html;
}

// ----- file emission ------------------------------------------------------

/**
 * Writes one route's index.html to apps/editor/dist-apex/. Creates any
 * intermediate directories. Reports the byte size for the build log.
 */
function writeRoute(route, htmlString) {
  const outPath = resolve(outDir, route.file);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, htmlString, 'utf8');
  const size = statSync(outPath).size;
  const rel = relative(repoRoot, outPath).replace(/\\/g, '/');
  console.log(`[prerender-apex]   ${route.label.padEnd(10)}  ${rel.padEnd(48)}  ${size.toLocaleString().padStart(8)} bytes`);
  return size;
}

/**
 * Cloudflare Pages _headers — header rules applied at the edge.
 *
 * The marketing surface needs zero JS, no auth cookies, no API access. The
 * strictest sensible header set (no script-src at all, strict transport
 * security, content-type sniffing off, frame-ancestors none) is therefore
 * not just defensible — it's correct.
 *
 * Reference: https://developers.cloudflare.com/pages/configuration/headers/
 */
const HEADERS_FILE = `# PRYZM apex — Cloudflare Pages edge headers
# Generated by scripts/build/prerender-apex.mjs (ADR-055 §0).
# Do not edit by hand — re-run \`pnpm build:apex\` to regenerate.

/*
  Content-Security-Policy: ${APEX_CSP}
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin

/*.html
  Cache-Control: public, max-age=300, s-maxage=86400, stale-while-revalidate=604800
`;

/**
 * Cloudflare Pages _redirects — route fallbacks. Any unknown path falls
 * back to the landing page (status 200, NOT a true redirect, so the user
 * sees the URL they typed). When a real /404 surface ships, swap the
 * fallback line below to point at /404.html with status 404.
 *
 * Reference: https://developers.cloudflare.com/pages/configuration/redirects/
 */
const REDIRECTS_FILE = `# PRYZM apex — Cloudflare Pages edge redirects
# Generated by scripts/build/prerender-apex.mjs (ADR-055 §0).

# www → apex (handled at the DNS layer per runbook §5.1, kept here as belt-and-braces)
https://www.pryzm.so/*  https://pryzm.so/:splat  301

# Trailing-slash normalisation — Cloudflare Pages serves /pricing/index.html
# at BOTH /pricing and /pricing/, but explicit rules avoid any ambiguity.
/pricing/    /pricing    301
/manifesto/  /manifesto  301
/trust/      /trust      301

# Fallback — unknown paths render the landing page (status 200, transparent).
# When a /404 surface ships, change to: /*  /404.html  404
/*  /index.html  200
`;

// ----- main ---------------------------------------------------------------

console.log(`[prerender-apex] → ${relative(repoRoot, outDir).replace(/\\/g, '/')}`);
console.log(`[prerender-apex]   CSS sources:`);
console.log(`[prerender-apex]     tokens.ts                 ${DESIGN_TOKENS.length.toLocaleString().padStart(8)} bytes`);
console.log(`[prerender-apex]     marketingPages.ts          ${LANDING_PAGE_STYLES.length.toLocaleString().padStart(8)} bytes`);
console.log(`[prerender-apex]     pricingPage.ts             ${PRICING_PAGE_STYLES.length.toLocaleString().padStart(8)} bytes`);
console.log(`[prerender-apex]   content-page CSS (inline)   ${CONTENT_PAGE_STYLES.length.toLocaleString().padStart(8)} bytes`);
console.log(`[prerender-apex]`);

mkdirSync(outDir, { recursive: true });

let total = 0;
const failures = [];
for (const route of ROUTES) {
  try {
    const fragments = route.render();
    const html = renderToHtmlString(fragments);
    total += writeRoute(route, html);
  } catch (err) {
    console.error(`[prerender-apex] FAILED ${route.path} — ${err && err.stack ? err.stack : String(err)}`);
    failures.push(route.path);
  }
}

// Emit Cloudflare Pages control files.
writeFileSync(resolve(outDir, '_headers'), HEADERS_FILE, 'utf8');
writeFileSync(resolve(outDir, '_redirects'), REDIRECTS_FILE, 'utf8');
const headersSize = statSync(resolve(outDir, '_headers')).size;
const redirectsSize = statSync(resolve(outDir, '_redirects')).size;
console.log(`[prerender-apex]   _headers                                                   ${headersSize.toLocaleString().padStart(8)} bytes`);
console.log(`[prerender-apex]   _redirects                                                 ${redirectsSize.toLocaleString().padStart(8)} bytes`);
total += headersSize + redirectsSize;

console.log(`[prerender-apex]`);
console.log(`[prerender-apex] total:                                                       ${total.toLocaleString().padStart(8)} bytes`);

if (failures.length > 0) {
  console.error(`[prerender-apex] FATAL — ${failures.length} route(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}

if (total > 200 * 1024) {
  // Soft warning per spec: apex bundle should be < 200 KB total. Above that,
  // first-paint on slow networks starts to suffer.
  console.warn(`[prerender-apex] WARN — total output ${(total / 1024).toFixed(1)} KB exceeds 200 KB soft budget.`);
}

console.log(`[prerender-apex] done.`);
