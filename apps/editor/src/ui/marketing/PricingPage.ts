/**
 * PricingPage (marketing) — native editor L7 route for /pricing.
 *
 * Replaces apps/docs-site/src/pages/pricing.astro per ADR-055 §7
 * (apex/app split — one PRYZM codebase, two deploy targets).
 *
 * The Astro version consumed pricing.json (JSON-snapshot pattern) because
 * Starlight/Astro's bundled zod@3 collided with @pryzm/entitlements's
 * zod@4. The editor's Vite closure has no such conflict, so we import
 * `buildPricingPageData` directly from `@pryzm/entitlements` at module
 * load — C39 §1.13's "no hand-written tier feature lists" is honoured
 * by reading the registry live, not via a generated snapshot.
 *
 * Contract compliance:
 *   §05 §5    — CSS in marketingPageStyles.ts (mkt- prefix); injected
 *               through injectAppTheme().
 *   §06 §3    — Implements dispose() for full cleanup.
 *   §06 §10   — No imports from src/core/, src/commands/, src/elements/,
 *               src/ai/.
 *   C39 §1.13 — Pricing table generated from the entitlement registry.
 *   C43       — All colour resolves through DESIGN_TOKENS; no hardcoded
 *               hex literals beyond what LANDING_PAGE_STYLES already uses.
 *
 * Class prefix: mkt-  (shared with ManifestoPage + TrustPage)
 *
 * Lifecycle mirrors LandingPage.ts: constructor builds + appends, the
 * returned object holds the mounted element, dispose() removes it.
 */

import { injectAppTheme } from '../styles/AppTheme';
import {
    buildPricingPageData,
    type PricingPageData,
    type PricingSection,
    type PricingRow,
} from '@pryzm/entitlements';
import type { PlanTier } from '@pryzm/schemas';

export interface MarketingPageCallbacks {
    /** "Sign in" button in the top nav. */
    onSignIn: () => void;
    /** "← Back" button — returns to whatever surface mounted this page. */
    onBack: () => void;
    /** Optional: jump to the manifesto route from this page's top nav. */
    onManifesto?: () => void;
    /** Optional: jump to the trust route from this page's top nav. */
    onTrust?: () => void;
    /** Optional: jump to the pricing route from this page's top nav. */
    onPricing?: () => void;
}

/** Page kind — used by the shared top-nav builder for active state. */
type ActivePage = 'pricing' | 'manifesto' | 'trust';

export class PricingPage {
    private root: HTMLElement;
    private el: HTMLElement;
    private readonly data: PricingPageData;

    constructor(root: HTMLElement, private callbacks: MarketingPageCallbacks) {
        this.root = root;
        injectAppTheme();
        // Build registry data at construction time. Pure function — no
        // network, no DOM, deterministic. Tests can stub by mocking the
        // module if they need a fixed shape; we trust the live registry
        // for production renders.
        this.data = buildPricingPageData();
        this.el = this.build();
        this.root.appendChild(this.el);
    }

    private build(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'mkt-page';
        el.setAttribute('data-mkt-page', 'pricing');
        el.innerHTML = `
            ${buildNavHtml('pricing', this.callbacks)}
            <div class="mkt-body">
                <div class="mkt-content">
                    <h1 class="mkt-hero-title">PRYZM Pricing</h1>
                    <p class="mkt-hero-lede">
                        Five consumer tiers. Every feature gate listed below maps
                        to a single canonical key in the PRYZM entitlement registry
                        — generated, not hand-written, per C39 §1.13.
                    </p>

                    <div class="mkt-tiers" aria-label="Plan tiers">
                        ${this.data.tiers.map((t) => this.renderTierCard(t)).join('')}
                    </div>

                    ${this.data.sections.map((s) => this.renderSection(s)).join('')}

                    <footer class="mkt-footer">
                        Generated from <code>@pryzm/entitlements</code> ·
                        ${this.data.totalEntitlements} feature gates across
                        ${this.data.sections.length} categories · Single source
                        of truth per <code>C39 §1.13</code>.
                    </footer>
                </div>
            </div>
        `;
        wireNav(el, this.callbacks);
        return el;
    }

    private renderTierCard(tier: PlanTier): string {
        const name = escape(this.data.tierDisplayNames[tier]);
        return `
            <div class="mkt-tier-card" data-tier="${escape(tier)}">
                <h2 class="mkt-tier-name">${name}</h2>
                <div class="mkt-tier-key">${escape(tier)}</div>
            </div>
        `;
    }

    private renderSection(section: PricingSection): string {
        const headers = this.data.tiers
            .map(
                (t) =>
                    `<th class="mkt-th--tier">${escape(this.data.tierDisplayNames[t])}</th>`,
            )
            .join('');
        const rows = section.rows.map((r) => this.renderRow(r)).join('');
        return `
            <section class="mkt-section" data-section="${escape(section.category)}">
                <h3 class="mkt-section-title">${escape(section.displayName)}</h3>
                <table class="mkt-table">
                    <thead>
                        <tr>
                            <th>Feature</th>
                            ${headers}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </section>
        `;
    }

    private renderRow(row: PricingRow): string {
        const cells = this.data.tiers
            .map((t) =>
                row.availability[t]
                    ? `<td class="mkt-td--tier"><span class="mkt-yes" aria-label="included">✓</span></td>`
                    : `<td class="mkt-td--tier"><span class="mkt-no" aria-label="not included">—</span></td>`,
            )
            .join('');
        const dep = row.deprecated
            ? `<span class="mkt-badge--deprecated">Deprecated</span>`
            : '';
        return `
            <tr data-feature-key="${escape(row.key)}">
                <td>
                    <span class="mkt-feature-name">${escape(row.displayName)}${dep}</span>
                    <span class="mkt-feature-desc">${escape(row.description)}</span>
                </td>
                ${cells}
            </tr>
        `;
    }

    /** Tear down: remove the page element. Mirrors LandingPage.destroy(). */
    dispose(): void {
        this.el.remove();
    }
}

/**
 * Imperative mount helper — matches the project-wide
 * `mountX(root, callbacks): { dispose }` convention so callers that
 * prefer the function shape (e.g. lazy dynamic-import sites) don't
 * need to know the class name.
 */
export function mountPricingPage(
    root: HTMLElement,
    callbacks: MarketingPageCallbacks,
): { dispose(): void } {
    const page = new PricingPage(root, callbacks);
    return { dispose: () => page.dispose() };
}

// ── shared nav helpers (used by Pricing + Manifesto + Trust) ─────────────────

/**
 * Build the marketing-page top nav. Shared across all three routes so
 * the "Manifesto · Pricing · Trust · Sign in" trio is identical
 * everywhere — one place to edit if a route is renamed.
 */
export function buildNavHtml(
    active: ActivePage,
    callbacks: MarketingPageCallbacks,
): string {
    const cls = (kind: ActivePage) =>
        `mkt-nav-link${active === kind ? ' mkt-nav-link--active' : ''}`;
    const wantManifesto = Boolean(callbacks.onManifesto || active === 'manifesto');
    const wantPricing = Boolean(callbacks.onPricing || active === 'pricing');
    const wantTrust = Boolean(callbacks.onTrust || active === 'trust');
    return `
        <nav class="mkt-nav" aria-label="PRYZM marketing navigation">
            <button class="mkt-nav-brand" id="mkt-brand" aria-label="PRYZM home">
                <svg class="mkt-nav-brand-mark" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                    <path d="M18.2 2.6 3.6 27.9 26.8 33.2 32.4 23.6 18.2 2.6Z" stroke="#0b0b12" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
                    <path d="M18.2 2.6 3.6 27.9" stroke="#6600FF" stroke-width="1.6" stroke-linecap="round"/>
                    <path d="M18.2 2.6 26.8 33.2" stroke="#0b0b12" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="mkt-nav-brand-text">PRYZM</span>
            </button>
            <div class="mkt-nav-links">
                ${wantManifesto ? `<button class="${cls('manifesto')}" id="mkt-link-manifesto"${active === 'manifesto' ? ' aria-current="page"' : ''}>Manifesto</button>` : ''}
                ${wantPricing ? `<button class="${cls('pricing')}" id="mkt-link-pricing"${active === 'pricing' ? ' aria-current="page"' : ''}>Pricing</button>` : ''}
                ${wantTrust ? `<button class="${cls('trust')}" id="mkt-link-trust"${active === 'trust' ? ' aria-current="page"' : ''}>Trust</button>` : ''}
            </div>
            <button class="mkt-back" id="mkt-back" aria-label="Back">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                    <path d="M19 12H5"/><path d="m12 5-7 7 7 7"/>
                </svg>
                Back
            </button>
            <button class="mkt-nav-signin" id="mkt-signin">Sign in</button>
        </nav>
    `;
}

/** Bind the click handlers for the buttons emitted by buildNavHtml. */
export function wireNav(
    container: HTMLElement,
    callbacks: MarketingPageCallbacks,
): void {
    const bind = (id: string, fn: (() => void) | undefined): void => {
        if (!fn) return;
        const btn = container.querySelector<HTMLButtonElement>(`#${id}`);
        btn?.addEventListener('click', () => fn());
    };
    // Brand returns to the back surface — most marketing-site behaviour.
    bind('mkt-brand', callbacks.onBack);
    bind('mkt-back', callbacks.onBack);
    bind('mkt-signin', callbacks.onSignIn);
    bind('mkt-link-manifesto', callbacks.onManifesto);
    bind('mkt-link-pricing', callbacks.onPricing);
    bind('mkt-link-trust', callbacks.onTrust);
}

/** Minimal HTML-escape for string interpolation. */
function escape(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
