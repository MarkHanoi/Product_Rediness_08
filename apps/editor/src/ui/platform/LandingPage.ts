/**
 * LandingPage — Platform entry point
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (lp- prefix)
 *   §05 §7.6 — No independent <style> injection; uses injectAppTheme()
 *   §06      — Zero BIM engine interaction; purely presentational
 *   §06 §10  — No imports from src/core/, src/commands/, src/elements/, src/ai/
 *
 * Class prefix: lp-  (Landing Page)
 *
 * PRYZM branding:
 *   - Logo icon/text: inline SVG for crisp vector rendering.
 *   - Colour    : violet gradient #8B5CF6 → #6600FF (docs/ColourPalette)
 * Layout: Figma-style — white navbar, drifting mosaic background, white hero card.
 */

import { injectAppTheme } from '../styles/AppTheme';
import { LandingPageMosaic } from './LandingPageMosaic';
import { initLandingScrollReveal } from './LandingPageScrollReveal';
import { ResourcesDropdown } from './ResourcesDropdown';
import { SolutionsDropdown } from './SolutionsDropdown';
import { createPryzmLogoSpinner } from '../overlays/PryzmLogoSpinner';

export interface LandingPageCallbacks {
    onGetStarted: () => void;
    onLogin: () => void;
    onPricing: () => void;
    onContactSales: () => void;
}

export class LandingPage {
    private root: HTMLElement;
    private el: HTMLElement;
    private mosaic: LandingPageMosaic | null = null;
    private scrollRevealCleanup: (() => void) | null = null;
    private resourcesDropdown: ResourcesDropdown | null = null;
    private solutionsDropdown: SolutionsDropdown | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(root: HTMLElement, private callbacks: LandingPageCallbacks, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.root = root;
        injectAppTheme();

        // Wave 1.5 (paint-on-first-byte) — remove the inline boot skeleton from
        // index.html before mounting the real landing.  The skeleton paints on
        // first byte while Vite resolves the ~233-module plugin graph; once we
        // get here the real component is ready to take over.  See `index.html`
        // for the skeleton markup and the `__pryzmPendingActions` / auth-flag
        // boot detection.  Idempotent: silently no-ops if the skeleton was
        // already removed (e.g. by PlatformRouter on the signed-in hub path).
        const skeleton = document.querySelector<HTMLElement>('[data-pryzm-skeleton="landing"]');
        skeleton?.remove();

        this.el = this.build();

        // Mount the CSS 3-D rotating spinner into the hero logo slot.
        // Same spinner used by EngineLoadingOverlay — satisfies "same logo everywhere".
        const heroLogoBlock = this.el.querySelector<HTMLElement>('.lp-hero-logo-block');
        if (heroLogoBlock) {
            const spinner = createPryzmLogoSpinner('lg');
            spinner.classList.add('lp-hero-spinner');
            heroLogoBlock.appendChild(spinner);
        }

        this.root.appendChild(this.el);

        // Wave 1.5b — drain any pre-boot CTA clicks the user made on the skeleton
        // before this module finished loading.  The inline <script> in index.html
        // pushes 'login' / 'getStarted' / 'contactSales' strings into this queue.
        // Replay them through the real callbacks so the user's intent is honored
        // without forcing a second click.  `window.__pryzmPendingActions` is
        // declared in `src/types/boot-shell.d.ts` (typed App-Shell carve-out;
        // P4-compliant — no untyped window cast needed).
        const pending = window.__pryzmPendingActions;
        if (pending && pending.length > 0) {
            const first = pending.shift();
            // Only replay the first action — replaying 3 queued clicks would open
            // 3 modals.  The rest are discarded once the live UI is interactive.
            window.__pryzmPendingActions = [];
            queueMicrotask(() => {
                if (first === 'login') callbacks.onLogin();
                else if (first === 'getStarted') callbacks.onGetStarted();
                else if (first === 'contactSales') callbacks.onContactSales();
            });
        }

        const mosaicContainer = this.el.querySelector<HTMLElement>('.lp-mosaic-container');
        if (mosaicContainer) {
            this.mosaic = new LandingPageMosaic(mosaicContainer);
        }

        const solWrapper = this.el.querySelector<HTMLElement>('#lp-sol-nav-wrapper');
        if (solWrapper) {
            this.solutionsDropdown = new SolutionsDropdown(solWrapper, this.el, {
                onGetStarted: callbacks.onGetStarted,
            });
        }

        const resWrapper = this.el.querySelector<HTMLElement>('#lp-res-nav-wrapper');
        if (resWrapper) {
            this.resourcesDropdown = new ResourcesDropdown(resWrapper, this.el, {
                onContactSales: callbacks.onContactSales,
                onPricing: callbacks.onPricing,
            });
        }

        this.scrollRevealCleanup = initLandingScrollReveal(this.el);
    }

    private build(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'lp-shell';

        el.innerHTML = `
            <!-- ── Nav bar ──────────────────────────────────── -->
            <nav class="lp-nav">
                <div class="lp-nav-brand" aria-label="PRYZM">
                    <svg class="lp-logo-icon" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                        <path d="M18.2 2.6 3.6 27.9 26.8 33.2 32.4 23.6 18.2 2.6Z" stroke="#0b0b12" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
                        <path d="M18.2 2.6 3.6 27.9" stroke="#6600FF" stroke-width="1.6" stroke-linecap="round"/>
                        <path d="M18.2 2.6 26.8 33.2" stroke="#0b0b12" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <div class="lp-logo-wordmark">
                        <span class="lp-logo-name">PRYZM</span>
                        <span class="lp-logo-sub">BIM PLATFORM</span>
                    </div>
                </div>
                <div class="lp-nav-links">
                    <div class="lp-sol-nav-wrapper" id="lp-sol-nav-wrapper"></div>
                    <div class="lp-res-nav-wrapper" id="lp-res-nav-wrapper"></div>
                    <a class="lp-nav-link" href="#" id="lp-nav-pricing">Pricing</a>
                </div>
                <div class="lp-nav-actions">
                    <button class="lp-nav-login" id="lp-nav-login">Log in</button>
                    <button class="lp-nav-contact" id="lp-nav-contact">Contact sales</button>
                    <button class="lp-nav-cta" id="lp-nav-cta">Get started for free</button>
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
                        <button class="lp-mobile-drawer-link" id="lp-mob-solutions">Solutions</button>
                        <button class="lp-mobile-drawer-link" id="lp-mob-resources">Resources</button>
                        <button class="lp-mobile-drawer-link" id="lp-mob-pricing">Pricing</button>
                    </div>
                    <div class="lp-mobile-drawer-actions">
                        <button class="lp-mobile-drawer-cta" id="lp-mob-cta">Get started for free</button>
                        <button class="lp-mobile-drawer-login" id="lp-mob-login">Log in</button>
                        <button class="lp-mobile-drawer-contact" id="lp-mob-contact">Contact sales</button>
                    </div>
                </div>
            </nav>

            <!-- ── Hero section — PRYZM4 centred gradient layout ─── -->
            <section class="lp-hero">
                <!-- Pyramid spinner mount — filled by createPryzmLogoSpinner after build -->
                <div class="lp-hero-logo-block" aria-hidden="true"></div>

                <!-- PRYZM as the hero wordmark heading -->
                <h1 class="lp-hero-heading">PRYZM</h1>

                <!-- Tagline as subtitle -->
                <p class="lp-hero-sub">Build the future, intelligently.</p>

                <!-- CTA buttons — MIAW "ask me anything" glass-pill style -->
                <div class="lp-hero-ctas">
                    <button class="lp-hero-btn" id="lp-hero-btn">
                        <svg width="14" height="18" viewBox="0 0 18 22" fill="none" aria-hidden="true" style="flex-shrink:0"><path d="M0 0L0 17.5L4.5 13L7.5 20L9.5 19.2L6.5 12H12L0 0Z" fill="currentColor"/></svg>
                        Start for free
                    </button>
                    <button class="lp-hero-btn-demo" id="lp-hero-demo-btn">
                        <svg width="14" height="18" viewBox="0 0 18 22" fill="none" aria-hidden="true" style="flex-shrink:0"><path d="M0 0L0 17.5L4.5 13L7.5 20L9.5 19.2L6.5 12H12L0 0Z" fill="currentColor"/></svg>
                        See a demo
                    </button>
                </div>

            </section>

            <!-- ── Temporary bottom bar — nav moved here for simple-layout test ── -->
            <div class="lp-bottom-bar">
                <div class="lp-nav-brand" aria-label="PRYZM">
                    <svg class="lp-logo-icon" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                        <path d="M18.2 2.6 3.6 27.9 26.8 33.2 32.4 23.6 18.2 2.6Z" stroke="#0b0b12" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>
                        <path d="M18.2 2.6 3.6 27.9" stroke="#6600FF" stroke-width="1.6" stroke-linecap="round"/>
                        <path d="M18.2 2.6 26.8 33.2" stroke="#0b0b12" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <div class="lp-logo-wordmark">
                        <span class="lp-logo-name">PRYZM</span>
                        <span class="lp-logo-sub">BIM PLATFORM</span>
                    </div>
                </div>
                <div class="lp-bottom-bar-links">
                    <a class="lp-nav-link" href="#" id="lp-bot-pricing">Pricing</a>
                    <a class="lp-nav-link" href="#" id="lp-bot-solutions">Solutions</a>
                    <a class="lp-nav-link" href="#" id="lp-bot-resources">Resources</a>
                </div>
                <div class="lp-bottom-bar-actions">
                    <button class="lp-nav-login" id="lp-bot-login">Log in</button>
                    <button class="lp-nav-contact" id="lp-bot-contact">Contact sales</button>
                    <button class="lp-nav-cta" id="lp-bot-cta">Get started for free</button>
                </div>
            </div>

            <!-- ── Stream 2 — Bespoke / Enterprise section ─── -->
            <section class="lp-bespoke lp-reveal" id="lp-bespoke">
                <div class="lp-bespoke-inner">
                    <div class="lp-bespoke-col lp-bespoke-col--left">
                        <h2 class="lp-bespoke-heading">Building your own platform?</h2>
                        <p class="lp-bespoke-desc">AI is making software cheap to build. We partner with enterprises to deploy a bespoke BIM platform under their brand — custom element libraries, your workflows, your infrastructure.</p>
                        <div class="lp-bespoke-actions">
                            <button id="lp-bespoke-contact">Talk to us</button>
                            <button id="lp-bespoke-learn">See enterprise options</button>
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

        el.querySelector('#lp-nav-login')!.addEventListener('click', () => this.callbacks.onLogin());
        el.querySelector('#lp-nav-contact')!.addEventListener('click', () => this.callbacks.onContactSales());
        el.querySelector('#lp-nav-cta')!.addEventListener('click', () => this.callbacks.onGetStarted());
        el.querySelector('#lp-hero-btn')!.addEventListener('click', () => this.callbacks.onGetStarted());
        el.querySelector('#lp-hero-demo-btn')!.addEventListener('click', () => this.callbacks.onContactSales());
        el.querySelector('#lp-nav-pricing')!.addEventListener('click', (e) => {
            e.preventDefault();
            this.callbacks.onPricing();
        });
        el.querySelector('#lp-bespoke-contact')!.addEventListener('click', () => this.callbacks.onContactSales());
        el.querySelector('#lp-bespoke-learn')!.addEventListener('click', () => this.callbacks.onPricing());
        // ── Bottom bar (temporary, nav moved for layout test) ────────────
        el.querySelector('#lp-bot-login')!.addEventListener('click', () => this.callbacks.onLogin());
        el.querySelector('#lp-bot-contact')!.addEventListener('click', () => this.callbacks.onContactSales());
        el.querySelector('#lp-bot-cta')!.addEventListener('click', () => this.callbacks.onGetStarted());
        el.querySelector('#lp-bot-pricing')!.addEventListener('click', (e) => { e.preventDefault(); this.callbacks.onPricing(); });
        el.querySelector('#lp-bot-solutions')!.addEventListener('click', (e) => { e.preventDefault(); this.callbacks.onGetStarted(); });
        el.querySelector('#lp-bot-resources')!.addEventListener('click', (e) => { e.preventDefault(); this.callbacks.onContactSales(); });

        // ── Mobile hamburger menu toggle (MOB-001-LP) ─────────────────────
        const hamburger = el.querySelector<HTMLButtonElement>('#lp-hamburger')!;
        const drawer = el.querySelector<HTMLElement>('#lp-mobile-drawer')!;
        const closeDrawer = () => {
            drawer.classList.remove('lp-mobile-drawer--open');
            drawer.setAttribute('aria-hidden', 'true');
            hamburger.setAttribute('aria-expanded', 'false');
        };
        hamburger.addEventListener('click', () => {
            const isOpen = drawer.classList.contains('lp-mobile-drawer--open');
            drawer.classList.toggle('lp-mobile-drawer--open', !isOpen);
            drawer.setAttribute('aria-hidden', String(isOpen));
            hamburger.setAttribute('aria-expanded', String(!isOpen));
        });
        el.querySelector('#lp-mob-cta')!.addEventListener('click', () => { closeDrawer(); this.callbacks.onGetStarted(); });
        el.querySelector('#lp-mob-login')!.addEventListener('click', () => { closeDrawer(); this.callbacks.onLogin(); });
        el.querySelector('#lp-mob-contact')!.addEventListener('click', () => { closeDrawer(); this.callbacks.onContactSales(); });
        el.querySelector('#lp-mob-pricing')!.addEventListener('click', () => { closeDrawer(); this.callbacks.onPricing(); });
        el.querySelector('#lp-mob-solutions')!.addEventListener('click', () => { closeDrawer(); this.callbacks.onGetStarted(); });
        el.querySelector('#lp-mob-resources')!.addEventListener('click', () => { closeDrawer(); this.callbacks.onContactSales(); });

        return el;
    }

    destroy(): void {
        this.solutionsDropdown?.destroy();
        this.solutionsDropdown = null;
        this.resourcesDropdown?.destroy();
        this.resourcesDropdown = null;
        this.scrollRevealCleanup?.();
        this.scrollRevealCleanup = null;
        this.mosaic?.destroy();
        this.mosaic = null;
        this.el.remove();
    }
}
