/**
 * landingMarkup — single source of truth for the PRYZM landing page's inner HTML.
 *
 * WHY THIS EXISTS (C51 §2.1.5 / tracker A.17.x.21)
 * ------------------------------------------------
 * The apex pre-render (`scripts/build/prerender-apex.mjs`) and the editor's
 * `LandingPage.ts` MUST emit byte-identical landing structure. Previously the
 * prerender HAND-WROTE a simplified landing, which drifted from the real
 * editor landing (missing bottom-bar Pricing/Solutions/Resources, different
 * nav). C51 §2.1.5 forbids exactly that hand-mirror drift. Both surfaces now
 * call this one function.
 *
 * IMPORT PURITY (NON-NEGOTIABLE)
 * ------------------------------
 * This module has ZERO imports. It exports a plain string-builder only — no
 * THREE, no DOM, no @pryzm/core-app-model, no LandingPageMosaic, nothing with
 * side effects. That is what lets the apex prerender dynamic-import it via tsx
 * (the same way it imports the pure-CSS `marketingPages.ts`). See MEMORY.md
 * "SCC: no barrel access at module load" for why importing the LandingPage
 * CLASS would crash the prerender boot.
 *
 * TWO MODES
 * ---------
 *   mode:'app'   → the IDENTICAL markup the editor renders. Every id/class is
 *                  preserved so LandingPage's constructor wiring
 *                  (addEventListener on #lp-nav-login, #lp-hero-btn,
 *                  #lp-bot-pricing, #lp-bespoke-contact, …) still resolves.
 *                  Interactive CTAs are <button id=…> with NO href.
 *   mode:'apex'  → same structure, but interactive CTAs become <a href>
 *                  anchors (there is no JS / no router on the apex). App
 *                  routes point at `${appOrigin}/<route>`; apex-owned content
 *                  routes are root-relative (`/pricing`, `/manifesto`, `/trust`).
 *
 * The mosaic container and the Solutions/Resources nav dropdowns are filled by
 * JS in the editor; on the apex they stay as the same empty <div> wrappers
 * (no script, so nothing mounts — which is fine for a static teaser).
 */

export interface LandingMarkupOptions {
    /** 'app' = editor (buttons + JS wiring); 'apex' = static prerender (anchors). */
    mode: 'app' | 'apex';
    /** App origin for apex CTAs, e.g. 'https://app.pryzm.so'. Required when mode==='apex'. */
    appOrigin?: string;
}

/** Inline PRYZM pyramid logo — identical in nav brand and bottom-bar brand. */
const PRYZM_PYRAMID_SVG = `<svg class="lp-logo-icon" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                        <path d="M18.2 2.6 3.6 27.9 26.8 33.2 32.4 23.6 18.2 2.6Z" stroke="#0b0b12" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
                        <path d="M18.2 2.6 3.6 27.9" stroke="#6600FF" stroke-width="1.6" stroke-linecap="round"/>
                        <path d="M18.2 2.6 26.8 33.2" stroke="#0b0b12" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>`;

/**
 * Returns the landing page's inner HTML (the contents of `.lp-shell`).
 *
 * In 'app' mode the caller (LandingPage.build) sets this as innerHTML on a
 * `<div class="lp-shell">` and then attaches its event listeners. In 'apex'
 * mode the prerender wraps it in `<div class="lp-shell">…</div>` as the body.
 */
export function landingMarkup(opts: LandingMarkupOptions): string {
    const apex = opts.mode === 'apex';
    const origin = (opts.appOrigin ?? '').replace(/\/+$/, '');

    // CTA helper — in app mode emit an interactive <button id> (NO href) so the
    // editor's addEventListener wiring drives it; in apex mode emit an <a href>
    // anchor (no JS) to the given URL. id/class are identical across modes.
    const cta = (
        id: string,
        cls: string,
        href: string,
        inner: string,
    ): string => {
        // Omit the class attribute entirely when empty — the editor's bespoke
        // CTAs are `<button id="lp-bespoke-contact">` with NO class attribute,
        // and we must reproduce that byte-for-byte in 'app' mode.
        const clsAttr = cls ? ` class="${cls}"` : '';
        return apex
            ? `<a${clsAttr} id="${id}" href="${href}">${inner}</a>`
            : `<button${clsAttr} id="${id}">${inner}</button>`;
    };

    // Apex CTA destinations (ignored in app mode, where buttons have no href).
    const SIGNUP = `${origin}/signup`;
    const SIGNIN = `${origin}/sign-in`;
    const CONTACT = `${origin}/contact`;
    const SOLUTIONS = `${origin}/solutions`;
    const RESOURCES = `${origin}/resources`;

    return `
            <!-- ── Nav bar ──────────────────────────────────── -->
            <nav class="lp-nav">
                <div class="lp-nav-brand" aria-label="PRYZM">
                    ${PRYZM_PYRAMID_SVG}
                    <div class="lp-logo-wordmark">
                        <span class="lp-logo-name">PRYZM</span>
                        <span class="lp-logo-sub">BIM PLATFORM</span>
                    </div>
                </div>
                <div class="lp-nav-links">
                    <div class="lp-sol-nav-wrapper" id="lp-sol-nav-wrapper"></div>
                    <div class="lp-res-nav-wrapper" id="lp-res-nav-wrapper"></div>
                    <a class="lp-nav-link" href="${apex ? '/pricing' : '#'}" id="lp-nav-pricing">Pricing</a>
                </div>
                <div class="lp-nav-actions">
                    ${cta('lp-nav-login', 'lp-nav-login', SIGNIN, 'Log in')}
                    ${cta('lp-nav-contact', 'lp-nav-contact', CONTACT, 'Contact sales')}
                    ${cta('lp-nav-cta', 'lp-nav-cta', SIGNUP, 'Get started for free')}
                </div>
                <!-- ── Mobile hamburger (visible at ≤768px) ── -->
                <button class="lp-hamburger" id="lp-hamburger" aria-label="Open menu" aria-expanded="false">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <line x1="3" y1="6" x2="21" y2="6"/>
                        <line x1="3" y1="12" x2="21" y2="12"/>
                        <line x1="3" y1="18" x2="21" y2="18"/>
                    </svg>
                </button>
                <!-- ── Mobile nav drawer ── -->
                <div class="lp-mobile-drawer" id="lp-mobile-drawer" aria-hidden="true">
                    <div class="lp-mobile-drawer-links">
                        ${cta('lp-mob-solutions', 'lp-mobile-drawer-link', SOLUTIONS, 'Solutions')}
                        ${cta('lp-mob-resources', 'lp-mobile-drawer-link', RESOURCES, 'Resources')}
                        ${cta('lp-mob-pricing', 'lp-mobile-drawer-link', apex ? '/pricing' : '#', 'Pricing')}
                    </div>
                    <div class="lp-mobile-drawer-actions">
                        ${cta('lp-mob-cta', 'lp-mobile-drawer-cta', SIGNUP, 'Get started for free')}
                        ${cta('lp-mob-login', 'lp-mobile-drawer-login', SIGNIN, 'Log in')}
                        ${cta('lp-mob-contact', 'lp-mobile-drawer-contact', CONTACT, 'Contact sales')}
                    </div>
                </div>
            </nav>

            <!-- ── Hero section — PRYZM4 centred gradient layout ─── -->
            <section class="lp-hero">
                <!-- Pyramid spinner mount — filled by createPryzmLogoSpinner after build (app mode only) -->
                <div class="lp-hero-logo-block" aria-hidden="true"></div>

                <!-- PRYZM as the hero wordmark heading -->
                <h1 class="lp-hero-heading">PRYZM</h1>

                <!-- Tagline as subtitle -->
                <p class="lp-hero-sub">Build the future, intelligently.</p>

                <!-- CTA button — MIAW "ask me anything" glass-pill style, delayed entrance -->
                <div class="lp-hero-ctas">
                    ${cta(
                        'lp-hero-btn',
                        'lp-hero-btn lp-hero-btn--enter',
                        SIGNUP,
                        `<svg width="14" height="18" viewBox="0 0 18 22" fill="none" aria-hidden="true" style="flex-shrink:0"><path d="M0 0L0 17.5L4.5 13L7.5 20L9.5 19.2L6.5 12H12L0 0Z" fill="currentColor"/></svg>
                        Start here`,
                    )}
                </div>

            </section>

            <!-- ── Temporary bottom bar — nav moved here for simple-layout test ── -->
            <div class="lp-bottom-bar">
                <div class="lp-nav-brand" aria-label="PRYZM">
                    ${PRYZM_PYRAMID_SVG}
                    <div class="lp-logo-wordmark">
                        <span class="lp-logo-name">PRYZM</span>
                        <span class="lp-logo-sub">BIM PLATFORM</span>
                    </div>
                </div>
                <div class="lp-bottom-bar-links">
                    <a class="lp-nav-link" href="${apex ? '/pricing' : '#'}" id="lp-bot-pricing">Pricing</a>
                    <a class="lp-nav-link" href="${apex ? SOLUTIONS : '#'}" id="lp-bot-solutions">Solutions</a>
                    <a class="lp-nav-link" href="${apex ? RESOURCES : '#'}" id="lp-bot-resources">Resources</a>
                </div>
                <div class="lp-bottom-bar-actions">
                    ${cta('lp-bot-login', 'lp-nav-login', SIGNIN, 'Log in')}
                    ${cta('lp-bot-contact', 'lp-nav-contact', CONTACT, 'Contact sales')}
                    ${cta('lp-bot-cta', 'lp-nav-cta', SIGNUP, 'Get started for free')}
                </div>
            </div>

            <!-- ── Stream 2 — Bespoke / Enterprise section ─── -->
            <section class="lp-bespoke lp-reveal" id="lp-bespoke">
                <div class="lp-bespoke-inner">
                    <div class="lp-bespoke-col lp-bespoke-col--left">
                        <h2 class="lp-bespoke-heading">Building your own platform?</h2>
                        <p class="lp-bespoke-desc">AI is making software cheap to build. We partner with enterprises to deploy a bespoke BIM platform under their brand — custom element libraries, your workflows, your infrastructure.</p>
                        <div class="lp-bespoke-actions">
                            ${cta('lp-bespoke-contact', '', CONTACT, 'Talk to us')}
                            ${cta('lp-bespoke-learn', '', apex ? '/pricing' : '#', 'See enterprise options')}
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

        `;
}
