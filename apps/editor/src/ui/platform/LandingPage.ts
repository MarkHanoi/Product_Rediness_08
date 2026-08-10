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
import { landingMarkup } from './landingMarkup';
import { LandingPageMosaic } from './LandingPageMosaic';
import { initLandingScrollReveal } from './LandingPageScrollReveal';
import { initLandingVideoLazy } from './LandingPageVideoLazy';
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
    private videoLazyCleanup: (() => void) | null = null;
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
        // Rounds 6 — the stacked video sections stream lazily: play/pause is
        // viewport-driven so four ~24 MB MP4s never load eagerly (brief §5).
        this.videoLazyCleanup = initLandingVideoLazy(this.el);
    }

    private build(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'lp-shell';

        // Single-source the static markup (C51 §2.1.5 / tracker A.17.x.21).
        // The same `landingMarkup` powers the apex prerender — both surfaces
        // emit byte-identical structure, killing the hand-mirror drift. In
        // 'app' mode every CTA is an interactive <button> with the original
        // id/class, so the addEventListener wiring below still resolves.
        el.innerHTML = landingMarkup({ mode: 'app' });

        el.querySelector('#lp-nav-login')!.addEventListener('click', () => this.callbacks.onLogin());
        // §NAV-CTA-TRIM (founder brief 2026-08-10 round 2) — "Contact sales" and
        // "Get started for free" were removed from the BAR. These two are now
        // OPTIONAL-chained rather than `!`-asserted: the non-null assertion would
        // have thrown a TypeError on mount the moment the markup stopped emitting
        // them, taking the whole in-app landing page down. They are still wired
        // when present, because the MOBILE DRAWER emits the same two ids.
        el.querySelector('#lp-nav-contact')?.addEventListener('click', () => this.callbacks.onContactSales());
        el.querySelector('#lp-nav-cta')?.addEventListener('click', () => this.callbacks.onGetStarted());
        // "Book a demo" — a SALES surface. In-app it routes through the same
        // contact-sales callback the apex points at (${APP_ORIGIN}/contact).
        el.querySelector('#lp-nav-demo')!.addEventListener('click', () => this.callbacks.onContactSales());
        el.querySelector('#lp-hero-btn')!.addEventListener('click', () => this.callbacks.onGetStarted());
        el.querySelector('#lp-nav-pricing')!.addEventListener('click', (e) => {
            e.preventDefault();
            this.callbacks.onPricing();
        });
        el.querySelector('#lp-bespoke-contact')!.addEventListener('click', () => this.callbacks.onContactSales());
        el.querySelector('#lp-bespoke-learn')!.addEventListener('click', () => this.callbacks.onPricing());

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
        el.querySelector('#lp-mob-demo')!.addEventListener('click', () => { closeDrawer(); this.callbacks.onContactSales(); });
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
        this.videoLazyCleanup?.();
        this.videoLazyCleanup = null;
        this.mosaic?.destroy();
        this.mosaic = null;
        this.el.remove();
    }
}
