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
