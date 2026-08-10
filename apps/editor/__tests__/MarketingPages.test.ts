// @vitest-environment happy-dom
//
// MarketingPages — apps/editor/src/ui/marketing/{Pricing,Manifesto,Trust}Page.ts
//
// ADR-055 §7 — the three customer-facing marketing surfaces moved
// from apps/docs-site/src/pages/ into the editor's L7 surface. These
// tests cover the canonical lifecycle every page must honour:
//   • constructor builds + appends a `.mkt-page` element under the root
//   • the build emits the expected sections (one cell per route)
//   • clicking the nav buttons fires the right callbacks
//   • dispose() removes the element from the DOM (no leak)
//
// happy-dom env so HTMLElement / querySelector / appendChild work
// exactly as in the browser.  The pages do not touch any non-DOM
// browser surface (no fetch, no canvas, no animation frame), so the
// happy-dom default surface is enough.

import { describe, it, expect, beforeEach } from 'vitest';
import { PricingPage, mountPricingPage } from '../src/ui/marketing/PricingPage.js';
import { ManifestoPage, mountManifestoPage } from '../src/ui/marketing/ManifestoPage.js';
import { TrustPage, mountTrustPage } from '../src/ui/marketing/TrustPage.js';
import {
    landingMarkup,
    HERO_DATELINE, HERO_HEADLINE, HERO_SUBHEAD_BRAND, HERO_SUBHEAD,
    SHOWCASE_CAPTIONS,
    HERO_IMAGE_URL, HERO_IMAGE_WIDTH, HERO_IMAGE_HEIGHT, HERO_IMAGE_ALT,
} from '../src/ui/platform/landingMarkup.js';
import { LANDING_PAGE_STYLES } from '../src/ui/styles/panels/marketingPages.js';

interface CallSink {
    signIn: number;
    back: number;
    pricing: number;
    manifesto: number;
    trust: number;
}

function makeCallbacks(): { sink: CallSink; callbacks: {
    onSignIn: () => void;
    onBack: () => void;
    onPricing: () => void;
    onManifesto: () => void;
    onTrust: () => void;
} } {
    const sink: CallSink = { signIn: 0, back: 0, pricing: 0, manifesto: 0, trust: 0 };
    return {
        sink,
        callbacks: {
            onSignIn: () => { sink.signIn++; },
            onBack: () => { sink.back++; },
            onPricing: () => { sink.pricing++; },
            onManifesto: () => { sink.manifesto++; },
            onTrust: () => { sink.trust++; },
        },
    };
}

beforeEach(() => {
    // Strip any leftover marketing element between tests so we never
    // assert against a stale DOM.
    for (const el of [...document.body.querySelectorAll('.mkt-page')]) {
        el.remove();
    }
});

describe('PricingPage (marketing)', () => {
    it('build() returns a .mkt-page HTMLElement appended under the root', () => {
        const root = document.createElement('div');
        document.body.appendChild(root);
        const { callbacks } = makeCallbacks();
        const page = new PricingPage(root, callbacks);

        const mounted = root.querySelector('.mkt-page');
        expect(mounted).toBeInstanceOf(HTMLElement);
        expect(mounted?.getAttribute('data-mkt-page')).toBe('pricing');

        page.dispose();
    });

    it('renders the entitlement-registry sections + at least one feature row', () => {
        const root = document.createElement('div');
        const { callbacks } = makeCallbacks();
        const page = new PricingPage(root, callbacks);

        // Hero copy from C39 §1.13 — anchors the registry-driven story.
        expect(root.textContent).toContain('PRYZM Pricing');
        expect(root.textContent).toContain('entitlement registry');

        // At least one section was rendered from buildPricingPageData().
        const sections = root.querySelectorAll('section[data-section]');
        expect(sections.length).toBeGreaterThan(0);

        // At least one feature row exists (the registry is non-empty).
        const rows = root.querySelectorAll('tr[data-feature-key]');
        expect(rows.length).toBeGreaterThan(0);

        // Tier summary header row renders all five consumer tiers.
        const tiers = root.querySelectorAll('.mkt-tier-card');
        expect(tiers.length).toBe(5);

        page.dispose();
    });

    it('top-nav Sign-in + Back + cross-route buttons fire callbacks', () => {
        const root = document.createElement('div');
        const { sink, callbacks } = makeCallbacks();
        new PricingPage(root, callbacks);

        root.querySelector<HTMLButtonElement>('#mkt-signin')!.click();
        root.querySelector<HTMLButtonElement>('#mkt-back')!.click();
        root.querySelector<HTMLButtonElement>('#mkt-link-manifesto')!.click();
        root.querySelector<HTMLButtonElement>('#mkt-link-trust')!.click();

        expect(sink.signIn).toBe(1);
        expect(sink.back).toBe(1);
        expect(sink.manifesto).toBe(1);
        expect(sink.trust).toBe(1);
    });

    it('dispose() removes the mounted element from the DOM', () => {
        const root = document.createElement('div');
        const { callbacks } = makeCallbacks();
        const page = new PricingPage(root, callbacks);
        expect(root.querySelector('.mkt-page')).not.toBeNull();

        page.dispose();
        expect(root.querySelector('.mkt-page')).toBeNull();
    });

    it('mountPricingPage helper returns a working { dispose }', () => {
        const root = document.createElement('div');
        const { callbacks } = makeCallbacks();
        const handle = mountPricingPage(root, callbacks);
        expect(root.querySelector('[data-mkt-page="pricing"]')).not.toBeNull();
        handle.dispose();
        expect(root.querySelector('[data-mkt-page="pricing"]')).toBeNull();
    });
});

describe('ManifestoPage (marketing)', () => {
    it('build() appends a .mkt-page element with data-mkt-page="manifesto"', () => {
        const root = document.createElement('div');
        const { callbacks } = makeCallbacks();
        const page = new ManifestoPage(root, callbacks);

        const mounted = root.querySelector<HTMLElement>('.mkt-page');
        expect(mounted).not.toBeNull();
        expect(mounted!.getAttribute('data-mkt-page')).toBe('manifesto');

        page.dispose();
    });

    it('renders the §1-§5 manifesto narrative beats', () => {
        const root = document.createElement('div');
        const { callbacks } = makeCallbacks();
        const page = new ManifestoPage(root, callbacks);

        const text = root.textContent ?? '';
        expect(text).toContain('Buildings are made of light');
        expect(text).toContain('The promise');
        expect(text).toContain('Why now');
        expect(text).toContain('Who we are');
        expect(text).toContain('How we talk to customers');
        expect(text).toContain('One conversation, from raw site to coordinated building');

        page.dispose();
    });

    it('mountManifestoPage helper disposes cleanly', () => {
        const root = document.createElement('div');
        const { callbacks } = makeCallbacks();
        const handle = mountManifestoPage(root, callbacks);
        expect(root.querySelector('[data-mkt-page="manifesto"]')).not.toBeNull();
        handle.dispose();
        expect(root.querySelector('[data-mkt-page="manifesto"]')).toBeNull();
    });
});

describe('TrustPage (marketing)', () => {
    it('build() appends a .mkt-page element with data-mkt-page="trust"', () => {
        const root = document.createElement('div');
        const { callbacks } = makeCallbacks();
        const page = new TrustPage(root, callbacks);

        const mounted = root.querySelector<HTMLElement>('.mkt-page');
        expect(mounted).not.toBeNull();
        expect(mounted!.getAttribute('data-mkt-page')).toBe('trust');

        page.dispose();
    });

    it('renders the four trust pillars + the retention table', () => {
        const root = document.createElement('div');
        const { callbacks } = makeCallbacks();
        const page = new TrustPage(root, callbacks);

        const pillars = root.querySelectorAll('.mkt-pillar');
        expect(pillars.length).toBe(4);

        const text = root.textContent ?? '';
        expect(text).toContain('Privacy');
        expect(text).toContain('Provenance');
        expect(text).toContain('Accessibility');
        expect(text).toContain('Recovery');

        // Retention list pulls tier names from @pryzm/entitlements — the
        // entries must include "Free Trial" (free-trial), "Solo", "Studio",
        // "Mid-Firm", "Enterprise" in that order.
        const retention = root.querySelector('[data-mkt-retention]');
        expect(retention?.textContent).toMatch(/Free Trial/);
        expect(retention?.textContent).toMatch(/Solo/);
        expect(retention?.textContent).toMatch(/Studio/);
        expect(retention?.textContent).toMatch(/Mid-Firm/);
        expect(retention?.textContent).toMatch(/Enterprise/);

        page.dispose();
    });

    it('Sign-in + Back wiring fires the right callbacks', () => {
        const root = document.createElement('div');
        const { sink, callbacks } = makeCallbacks();
        const page = new TrustPage(root, callbacks);

        root.querySelector<HTMLButtonElement>('#mkt-signin')!.click();
        root.querySelector<HTMLButtonElement>('#mkt-back')!.click();
        expect(sink.signIn).toBe(1);
        expect(sink.back).toBe(1);

        page.dispose();
    });

    it('mountTrustPage helper disposes cleanly', () => {
        const root = document.createElement('div');
        const { callbacks } = makeCallbacks();
        const handle = mountTrustPage(root, callbacks);
        expect(root.querySelector('[data-mkt-page="trust"]')).not.toBeNull();
        handle.dispose();
        expect(root.querySelector('[data-mkt-page="trust"]')).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// landingMarkup — the SINGLE source of the landing header (C51 §2.1.5).
// The apex prerender and the in-app LandingPage both call this function, so
// these tests are the guard against the two surfaces drifting apart again.
// ─────────────────────────────────────────────────────────────────────────────

const APEX_ORIGIN = 'https://app.pryzm.test';

describe('landingMarkup — motif-modelled header', () => {
    it('emits the nav ABOVE the hero, and no temporary bottom bar', () => {
        for (const html of [
            landingMarkup({ mode: 'app' }),
            landingMarkup({ mode: 'apex', appOrigin: APEX_ORIGIN }),
        ]) {
            expect(html).toContain('class="lp-nav');
            // The nav must be the FIRST thing in the shell (logo top-left).
            expect(html.indexOf('lp-nav')).toBeLessThan(html.indexOf('lp-hero'));
            // The "temporary bottom bar" the nav had been exiled to is gone.
            expect(html).not.toContain('lp-bottom-bar');
            expect(html).not.toContain('lp-bot-');
        }
    });

    it('nav actions carry all four CTAs, ending with Book a demo', () => {
        for (const html of [
            landingMarkup({ mode: 'app' }),
            landingMarkup({ mode: 'apex', appOrigin: APEX_ORIGIN }),
        ]) {
            // §NAV-CTA-TRIM (2026-08-10 round 2): the BAR keeps only Log in +
            // Book a demo. "Contact sales" / "Get started for free" were removed
            // from it — asserted absent here so they cannot creep back silently.
            for (const id of ['lp-nav-login', 'lp-nav-demo']) {
                expect(html).toContain(`id="${id}"`);
            }
            for (const id of ['lp-nav-contact', 'lp-nav-cta']) {
                expect(html).not.toContain(`id="${id}"`);
            }
            expect(html).toContain('Book a demo');
            // Focus order follows visual order: demo is the LAST action.
            expect(html.indexOf('lp-nav-demo')).toBeGreaterThan(html.indexOf('lp-nav-login'));
        }
    });

    it('app mode emits interactive <button> CTAs with no href', () => {
        const html = landingMarkup({ mode: 'app' });
        expect(html).toContain('<button class="lp-nav-demo" id="lp-nav-demo">Book a demo</button>');
        expect(html).not.toContain('href="https://');
    });

    it('apex Book a demo is a cross-domain link to the APP contact surface (C51 §2.2.1)', () => {
        const html = landingMarkup({ mode: 'apex', appOrigin: APEX_ORIGIN });
        expect(html).toContain(`<a class="lp-nav-demo" id="lp-nav-demo" href="${APEX_ORIGIN}/contact?intent=demo">`);
        // Never an apex-owned auth/sales route, never a hardcoded host.
        expect(html).not.toContain('href="/contact');
        expect(html).not.toContain('app.pryzm.so');
    });

    it('apex nav is fully usable with JS DISABLED (C51 §2.1.1 / §2.1.3)', () => {
        const html = landingMarkup({ mode: 'apex', appOrigin: APEX_ORIGIN });
        // Solutions/Resources are real crawlable anchors, not empty JS mounts.
        expect(html).toContain(`<a class="lp-nav-link" id="lp-nav-solutions" href="${APEX_ORIGIN}/solutions">Solutions</a>`);
        expect(html).toContain(`<a class="lp-nav-link" id="lp-nav-resources" href="${APEX_ORIGIN}/resources">Resources</a>`);
        expect(html).toContain('id="lp-nav-pricing"');
        // The JS-only hamburger + drawer are NOT emitted on apex — they would
        // be dead markup. The apex header wraps instead (.lp-nav--apex).
        expect(html).toContain('lp-nav--apex');
        expect(html).not.toContain('lp-hamburger');
        expect(html).not.toContain('lp-mobile-drawer');
    });

    it('app mode keeps the JS dropdown mounts empty and the mobile drawer intact', () => {
        const html = landingMarkup({ mode: 'app' });
        expect(html).toContain('<div class="lp-sol-nav-wrapper" id="lp-sol-nav-wrapper"></div>');
        expect(html).toContain('<div class="lp-res-nav-wrapper" id="lp-res-nav-wrapper"></div>');
        expect(html).toContain('id="lp-hamburger"');
        // The drawer mirrors the desktop actions — including Book a demo.
        for (const id of ['lp-mob-demo', 'lp-mob-cta', 'lp-mob-login', 'lp-mob-contact']) {
            expect(html).toContain(`id="${id}"`);
        }
        expect(html).not.toContain('lp-nav--apex');
    });
});

describe('LANDING_PAGE_STYLES — apex-inlined CSS covers the whole header', () => {
    it('the nav is visible and pinned to the top (no display:none)', () => {
        expect(LANDING_PAGE_STYLES).not.toMatch(/\.lp-nav\s*\{\s*display:\s*none/);
        // 2026-08-09 (KRETZ pass): position went relative → STICKY. Sticky still
        // establishes the containing block the absolutely-positioned links pill
        // and the mobile drawer (top:100%) resolve against, which is what the
        // original `position: relative` assertion was really protecting.
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-nav\s*\{[^}]*position:\s*sticky/);
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-nav\s*\{[^}]*top:\s*0/);
        // …and align-items went flex-start → CENTER: the 2026-08-07 header hung
        // the brand off the viewport's top edge; the 2026-08-09 one is a slim
        // bar with everything vertically centred in it.
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-nav\s*\{[^}]*align-items:\s*center/);
    });

    it('styles every header control the markup emits', () => {
        for (const sel of [
            '.lp-nav-links', '.lp-nav-link', '.lp-nav-actions',
            '.lp-nav-login', '.lp-nav-demo',
            // Relocated out of SOLUTIONS_STYLES — the apex prerender only
            // inlines LANDING_PAGE_STYLES, so these must live here.
            '.lp-hamburger', '.lp-mobile-drawer', '.lp-mobile-drawer-demo',
            '.lp-nav--apex',
        ]) {
            expect(LANDING_PAGE_STYLES).toContain(sel);
        }
    });

    it('uses a11y tokens for the new CTA colours, never an off-brand hex (C51 §2.1.4)', () => {
        // 2026-08-09: the BAR is now #6600FF, so the primary pill inverted to
        // solid white with #4A00B7 text — a solid-purple pill on a purple bar
        // would vanish. Both are C43 §1.5 tokens; the point of this test is
        // that the header never reaches outside the token set, not that any
        // one control keeps a particular fill.
        // 2026-08-10: the bar became a RADIAL gradient (§NAV-GRADIENT round 2) —
        // a pool of the deeper token behind the mark dissolving into the brand
        // violet. The assertion still enforces the real invariant (the header
        // reaches only into the token set) rather than pinning one fill: the base
        // colour and the pool's dark stop must both be canonical tokens.
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-nav\s*\{[^}]*background-color:\s*#6600FF/);
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-nav\s*\{[^}]*background-image:\s*radial-gradient\([^;]*#4A00B7/);
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-nav-demo\s*\{[^}]*background:\s*#ffffff/);
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-nav-demo\s*\{[^}]*color:\s*#4A00B7/);
        // The retired ADR-0252 mirror hex must never reappear.
        expect(LANDING_PAGE_STYLES).not.toContain('#5a4282');
    });

    it('gives every header control a visible focus ring (C43)', () => {
        expect(LANDING_PAGE_STYLES).toContain('.lp-nav-demo:focus-visible');
        expect(LANDING_PAGE_STYLES).toContain('.lp-nav-login:focus-visible');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The 2026-08-07 hero — copy lives in exactly ONE place and both surfaces
// read it. These tests are the guard against the copy being restated inline.
// ─────────────────────────────────────────────────────────────────────────────

describe('landingMarkup — hero + product showcase', () => {
    // Founder brief 2026-08-10 (reference homepage): the hero hierarchy is now
    // small date eyebrow → headline → supporting line → CTA, all from the shared
    // constants. The order assertions below ARE the hierarchy — they are what
    // stops a later edit from re-stacking the column by accident.
    it('renders date → headline → subhead → CTA, from the shared constants', () => {
        for (const html of [
            landingMarkup({ mode: 'app' }),
            landingMarkup({ mode: 'apex', appOrigin: APEX_ORIGIN }),
        ]) {
            expect(html).toContain(`<p class="lp-hero-dateline">${HERO_DATELINE}</p>`);
            expect(html).toContain(`<h1 class="lp-hero-heading">${HERO_HEADLINE}</h1>`);
            // The product name opens the supporting line as its own span, so the
            // sentence itself is never re-typed with a prefix baked in.
            expect(html).toContain(
                `<p class="lp-hero-sub"><span class="lp-hero-sub-brand">${HERO_SUBHEAD_BRAND}</span> ${HERO_SUBHEAD}</p>`,
            );
            const at = {
                date: html.indexOf('lp-hero-dateline'),
                heading: html.indexOf('lp-hero-heading'),
                sub: html.indexOf('lp-hero-sub"'),
                cta: html.indexOf('lp-hero-ctas'),
            };
            expect(at.date).toBeGreaterThan(-1);
            expect(at.date).toBeLessThan(at.heading);
            expect(at.heading).toBeLessThan(at.sub);
            expect(at.sub).toBeLessThan(at.cta);
            // The CTA still ships and still says what it said.
            expect(html).toContain('id="lp-hero-btn"');
            expect(html).toContain('Start here');
        }
        expect(HERO_DATELINE).toBe('SEPTEMBER 2027');
        expect(HERO_HEADLINE).toBe('DEVELOPMENT. COMPUTED.');
        expect(HERO_SUBHEAD_BRAND).toBe('PRYZM DESIGN:');
        expect(HERO_SUBHEAD).toBe('Turning planning law into development intelligence.');
    });

    it('the hero column is left-ragged and bottom-anchored, with no glass card', () => {
        // The card is what the brief asked to drop: no blur, no border, no fill
        // on the copy column. Asserted on the RULE, because "it looks right in
        // one screenshot" is not a regression guard.
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-hero-panel\s*\{[^}]*align-items:\s*flex-start/);
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-hero-panel\s*\{[^}]*text-align:\s*left/);
        expect(LANDING_PAGE_STYLES).not.toMatch(/\.lp-hero-panel\s*\{[^}]*backdrop-filter/);
        expect(LANDING_PAGE_STYLES).not.toMatch(/\.lp-hero-panel\s*\{[^}]*border:/);
        // Bottom-left anchor on the video hero.
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-hero--video\s*\{[^}]*justify-content:\s*flex-end/);
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-hero--video\s*\{[^}]*align-items:\s*flex-start/);
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-hero-ctas\s*\{[^}]*justify-content:\s*flex-start/);
    });

    it('the headline SHRANK and the date line is small, tracked and uppercase', () => {
        // Was clamp(30px, 6.0vw, 88px) — the brief called it "massive". The
        // video hero now caps at 58px; the pale-ground base rule is untouched.
        expect(LANDING_PAGE_STYLES).toMatch(
            /\.lp-hero--video \.lp-hero-heading\s*\{[^}]*font-size:\s*clamp\(30px,\s*4\.0vw,\s*58px\)/,
        );
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-hero-dateline\s*\{[^}]*text-transform:\s*uppercase/);
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-hero-dateline\s*\{[^}]*letter-spacing:\s*0\.30em/);
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-hero-dateline\s*\{[^}]*font-size:\s*clamp\(11px,[^)]*13px\)/);
    });

    it('losing the card does not lose contrast: the scrim gained a left weight', () => {
        // With no card behind the copy, the ONLY guarantee of AA over an unknown
        // video frame is the scrim — and the copy moved to the bottom-LEFT, which
        // the old bottom-only gradient did not weight. Both directions must exist.
        expect(LANDING_PAGE_STYLES).toMatch(
            /\.lp-hero-media::after\s*\{[^}]*linear-gradient\(to right,\s*rgba\(26,6,64,0\.62\)/,
        );
        expect(LANDING_PAGE_STYLES).toMatch(
            /\.lp-hero-media::after\s*\{[^}]*linear-gradient\(to bottom,[^)]*\)[^;]*rgba\(26,6,64,0\.74\)/,
        );
        // Brand: the scrim is deep violet, never black.
        expect(LANDING_PAGE_STYLES).not.toMatch(/\.lp-hero-media::after\s*\{[^}]*rgba\(0,0,0/);
    });

    it('reduced-motion still silences every animated hero element', () => {
        expect(LANDING_PAGE_STYLES).toContain('prefers-reduced-motion');
        // The eyebrow is animated too, so it must be in the silence list — the
        // whole point of the assertion is that a new animated element cannot be
        // added to the hero without being added here as well.
        expect(LANDING_PAGE_STYLES).toContain(
            '.lp-hero-dateline, .lp-hero-heading, .lp-hero-sub, .lp-hero-btn--enter { animation: none; }',
        );
        expect(LANDING_PAGE_STYLES).toContain('.lp-hero-video { display: none; }');
    });

    // Founder brief 2026-08-10: the centred hero glyph is GONE — it competed with
    // the headline for the same focal point, and the mark now appears exactly once,
    // leading the nav on the LEFT. This test inverts: it used to assert the glyph
    // existed, and now pins that it does not come back by accident, and that the
    // brand appears once rather than twice.
    it('the hero has NO centred glyph; the mark leads the nav on the left, once', () => {
        for (const mode of ['apex', 'app'] as const) {
            const html = landingMarkup(mode === 'apex' ? { mode, appOrigin: APEX_ORIGIN } : { mode });
            expect(html).not.toContain('lp-hero-logo-block');
            // Exactly ONE brand image in the whole page — the nav mark.
            expect(html.match(/lp-nav-mark/g) ?? []).toHaveLength(1);
            // It leads the bar: inside the brand block, before the actions band.
            expect(html.indexOf('lp-nav-mark')).toBeLessThan(html.indexOf('lp-nav-actions'));
            // The mark is now the ONLY brand element in the bar — no wordmark text,
            // no descender. It therefore carries the accessible name itself, which is
            // why its alt text must be non-empty (asserted below).
            expect(html).not.toContain('lp-logo-wordmark');
            expect(html).not.toContain('lp-logo-name');
            expect(html).not.toContain('BIM PLATFORM');
            expect(html).not.toContain('lp-logo-sub');
            expect(html).toMatch(/lp-nav-mark[^>]*alt="PRYZM"/);
        }
    });

    it('the showcase image is SAME-ORIGIN, sized, lazy and described (C51 §2.2.4 / §2.1.3 / C43)', () => {
        expect(HERO_IMAGE_URL).toMatch(/^\//);              // never cross-origin
        expect(HERO_IMAGE_URL).not.toContain('://');
        const html = landingMarkup({ mode: 'apex', appOrigin: APEX_ORIGIN });
        expect(html).toContain(`src="${HERO_IMAGE_URL}"`);
        expect(html).toContain(`width="${HERO_IMAGE_WIDTH}" height="${HERO_IMAGE_HEIGHT}"`);
        expect(html).toContain('loading="lazy"');
        expect(html).toContain('decoding="async"');
        expect(html).toContain(`alt="${HERO_IMAGE_ALT}"`);
        expect(HERO_IMAGE_ALT.length).toBeGreaterThan(40); // a real description
    });

    it('renders every caption in order, from the shared list', () => {
        const html = landingMarkup({ mode: 'apex', appOrigin: APEX_ORIGIN });
        let cursor = -1;
        for (const caption of SHOWCASE_CAPTIONS) {
            const at = html.indexOf(`>${caption}</span>`);
            expect(at, caption).toBeGreaterThan(cursor);
            cursor = at;
        }
    });

    it('showcase CSS holds the frame open and keeps the caption legible either way', () => {
        // aspect-ratio on the placeholder = no collapse and no CLS when the
        // asset is absent; the <img> gets its ratio from width/height attrs.
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-showcase-placeholder\s*\{[^}]*aspect-ratio:\s*1600 \/ 442/);
        expect(LANDING_PAGE_STYLES).toContain('.lp-showcase-frame--pending');
        // A scrim behind the white caption row so it clears AA over any shot.
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-showcase-caption\s*\{[^}]*background:\s*linear-gradient/);
    });

    it('hero type uses a11y tokens — measured to pass AA on the gradient', () => {
        // #6600FF: 6.22:1 lightest / 3.07:1 darkest → AA large text.
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-hero-heading\s*\{[^}]*color:\s*#6600FF/);
        // #4A00B7: 4.68:1 darkest → AA normal text, which the subhead needs.
        expect(LANDING_PAGE_STYLES).toMatch(/\.lp-hero-sub\s*\{[^}]*color:\s*#4A00B7/);
    });
});
