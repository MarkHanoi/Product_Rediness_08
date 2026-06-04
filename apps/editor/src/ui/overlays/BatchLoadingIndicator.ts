/**
 * BatchLoadingIndicator.ts
 *
 * §FIX-BATCH-OVERLAY (2026-05-04): Upgraded from a small floating card at the
 * bottom of the screen to a full-viewport frosted backdrop + centered card.
 *
 * §FIX-PYRAMID-ANIM (2026-05-06): Replaced the JS-driven 3-D SVG pyramid
 * animation (which froze during LONGTASKs) with a CSS `rotateY` animation on
 * a static SVG pyramid shape. CSS animations run on the compositor thread and
 * are immune to main-thread blocking, which is exactly what happens during a
 * wall/CW batch (geometry builds, WebGPU shader compilation, etc. produce
 * 100 ms–20 s LONGTASKs that starve requestAnimationFrame callbacks).
 *
 * §PRYZM-LOGO-SPINNER (2026-05-09): Replaced the flat CSS rotateY SVG triangle
 * with the shared `createPryzmLogoSpinner('sm')` CSS 3-D pyramid — identical
 * to the prism shown in EngineLoadingOverlay. Still compositor-thread driven
 * (never frozen), now truly 3-D with four shaded faces and correct perspective.
 *
 * The bar animation was similarly converted to a CSS `width` transition so the
 * progress indicator continues moving through every LONGTASK.
 *
 * Architectural compliance:
 *   - C01 §2 (Layer Isolation): Overlay is pure UI — no engine imports.
 *   - No FrameScheduler dependency: CSS compositor thread handles animation.
 *   - setBatchLifecycleCallbacks(onShow, onHide): injection API preserved.
 *
 * Visual design:
 *   - Backdrop: the shared --pryzm-panel-backdrop scrim (§PANEL-BACKDROP-UNIFY)
 *     over the canvas — identical to every other PRYZM panel/modal.
 *   - Card: white rounded panel centered in viewport (same PRYZM brand as before).
 *   - PRYZM pyramid logo — CSS 3-D prism, identical to EngineLoadingOverlay.
 *   - Purple progress bar advancing via CSS width transition.
 *   - Entrance: backdrop fades in (200ms) + card scales up from 0.94 (250ms).
 *   - Exit: bar fills to 100% → "Done" label → card scales down → backdrop fades out.
 */

import { createPryzmLogoSpinner } from './PryzmLogoSpinner';

export class BatchLoadingIndicator {
    private _backdrop: HTMLElement | null = null;
    private _el: HTMLElement | null = null;
    private _label: HTMLElement | null = null;
    private _bar: HTMLElement | null = null;
    private _countEl: HTMLElement | null = null;

    private _visible = false;
    private _hideTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Show the full-viewport overlay + indicator card.
     * Initialises the DOM on first call.
     * @param elementCount  Estimated number of elements being created.
     */
    show(elementCount: number): void {
        if (this._hideTimer !== null) {
            clearTimeout(this._hideTimer);
            this._hideTimer = null;
        }
        if (!this._el) this._build();
        if (!this._el || !this._backdrop) return;

        this._updateLabel(elementCount);
        this._resetBar();

        if (!this._visible) {
            this._backdrop.style.display = 'block';
            void this._backdrop.offsetHeight;
            this._backdrop.style.opacity = '1';

            this._el.style.display = 'flex';
            void this._el.offsetHeight;
            this._el.style.opacity = '1';
            this._el.style.transform = 'translate(-50%, -50%) scale(1)';
            this._visible = true;
        }

        this._animateBar(elementCount);
    }

    /**
     * Switch the label to "Compiling GPU shaders…" just before the WebGPU
     * PSO LONGTASK fires.  Called synchronously so the user sees the correct
     * message on the last painted frame before the main thread blocks.
     * §FIX-GPU-COMPILE-LABEL
     */
    transitionToGpuCompile(): void {
        if (this._label) this._label.textContent = 'Compiling GPU shaders…';
        if (this._countEl) this._countEl.textContent = '';
    }

    /**
     * Fade out overlay + card.  Safe to call even if not shown.
     */
    hide(): void {
        if (!this._el || !this._visible) return;
        this._visible = false;

        if (this._bar) {
            this._bar.style.transition = 'width 0.25s ease';
            this._bar.style.width = '100%';
        }
        if (this._label) this._label.textContent = 'Done';

        const el       = this._el;
        const backdrop = this._backdrop;

        this._hideTimer = setTimeout(() => {
            el.style.transition = 'opacity 0.30s ease, transform 0.30s cubic-bezier(0.4,0,1,1)';
            el.style.opacity = '0';
            el.style.transform = 'translate(-50%, -50%) scale(0.94)';

            if (backdrop) {
                backdrop.style.transition = 'opacity 0.40s ease';
                backdrop.style.opacity = '0';
            }

            setTimeout(() => {
                el.style.display = 'none';
                el.style.transform = 'translate(-50%, -50%) scale(0.94)';
                this._resetBar();
                if (backdrop) backdrop.style.display = 'none';
            }, 450);
            this._hideTimer = null;
        }, 280);
    }

    // ── DOM construction ────────────────────────────────────────────────────

    private _build(): void {
        this._ensureStyles();

        const backdrop = document.createElement('div');
        backdrop.id = 'pryzm-batch-backdrop';
        backdrop.className = 'pryzm-batch-backdrop';
        document.body.appendChild(backdrop);
        this._backdrop = backdrop;

        const card = document.createElement('div');
        card.id = 'pryzm-batch-indicator';
        card.className = 'pryzm-batch-indicator';

        // ── §PRYZM-LOGO-SPINNER: CSS 3-D pyramid — compositor thread, never
        // frozen by main-thread LONGTASKs (WebGPU compilation, geometry drain,
        // room redetection, etc.). Identical prism to EngineLoadingOverlay.
        const spinner = createPryzmLogoSpinner('sm');
        spinner.classList.add('pryzm-batch-indicator__spinner');

        const textBlock = document.createElement('div');
        textBlock.className = 'pryzm-batch-indicator__text';

        const label = document.createElement('div');
        label.className = 'pryzm-batch-indicator__label';
        label.textContent = 'Building elements…';
        this._label = label;

        const countEl = document.createElement('div');
        countEl.className = 'pryzm-batch-indicator__count';
        countEl.textContent = '';
        this._countEl = countEl;

        const track = document.createElement('div');
        track.className = 'pryzm-batch-indicator__track';
        const bar = document.createElement('div');
        bar.className = 'pryzm-batch-indicator__bar';
        track.appendChild(bar);
        this._bar = bar;

        textBlock.appendChild(label);
        textBlock.appendChild(countEl);
        textBlock.appendChild(track);

        card.appendChild(spinner);
        card.appendChild(textBlock);

        document.body.appendChild(card);
        this._el = card;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private _updateLabel(count: number): void {
        if (this._label) {
            this._label.textContent = count > 0
                ? `Building ${count} element${count !== 1 ? 's' : ''}…`
                : 'Building elements…';
        }
        if (this._countEl) this._countEl.textContent = '';
    }

    private _resetBar(): void {
        if (this._bar) {
            this._bar.style.transition = 'none';
            this._bar.style.width = '0%';
        }
    }

    /**
     * Animate the bar to ~85 % using a CSS `width` transition so it continues
     * advancing through LONGTASKs (compositor-driven, not blocked by JS work).
     *
     * `totalMs` is derived from `elementCount` (80 ms per element, min 2 s) to
     * approximate real build time; the bar intentionally stalls at 85 % until
     * `hide()` snaps it to 100 % with a short completion flash.
     */
    private _animateBar(elementCount: number): void {
        if (!this._bar) return;
        this._resetBar();
        const totalMs = Math.max(2000, elementCount * 80);
        // Force a layout flush so the 0% reset is committed before we set the
        // transition — without this the browser may coalesce the two style writes
        // and skip the animation entirely.
        void this._bar.offsetWidth;
        this._bar.style.transition = `width ${totalMs}ms ease-out`;
        this._bar.style.width = '85%';
    }

    // ── Styles ──────────────────────────────────────────────────────────────

    private _ensureStyles(): void {
        const id = 'pryzm-batch-indicator-style';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = `
            /* §FIX-BATCH-OVERLAY: Full-viewport frosted backdrop */
            .pryzm-batch-backdrop {
                position: fixed;
                inset: 0;
                z-index: 88880;
                display: none;
                opacity: 0;
                /* §PANEL-BACKDROP-UNIFY — shared scrim (was rgba(10,6,30,0.58)+blur10).
                   The AI batch "Building N elements" modal now uses the one token. */
                background: var(--pryzm-panel-backdrop);
                backdrop-filter: var(--pryzm-panel-backdrop-blur);
                -webkit-backdrop-filter: var(--pryzm-panel-backdrop-blur);
                transition: opacity 0.20s ease;
                pointer-events: all;
            }

            /* Centered card — sits above the backdrop */
            .pryzm-batch-indicator {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.94);
                z-index: 88888;
                display: none;
                opacity: 0;
                align-items: center;
                gap: 18px;
                padding: 22px 28px;
                background: #ffffff;
                border-radius: 18px;
                box-shadow:
                    0 8px 48px rgba(10, 6, 30, 0.22),
                    0 2px 8px rgba(10, 6, 30, 0.12),
                    inset 0 0 0 1px rgba(10, 6, 30, 0.06);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                             Helvetica, Arial, sans-serif;
                user-select: none;
                pointer-events: none;
                transition:
                    opacity 0.25s cubic-bezier(0.22, 1, 0.36, 1),
                    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
                min-width: 280px;
                max-width: 380px;
            }

            /* Spinner wrapper: ensure proper alignment in card row */
            .pryzm-batch-indicator__spinner {
                /* Override scale from 'sm' so the card size is intentional */
                flex-shrink: 0;
            }

            .pryzm-batch-indicator__text {
                display: flex;
                flex-direction: column;
                gap: 8px;
                flex: 1;
                min-width: 0;
            }
            .pryzm-batch-indicator__label {
                font-size: 14px;
                font-weight: 600;
                color: #0a0616;
                letter-spacing: 0.01em;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .pryzm-batch-indicator__count {
                font-size: 11px;
                font-weight: 500;
                color: #9095a8;
                letter-spacing: 0.05em;
                min-height: 13px;
            }
            .pryzm-batch-indicator__track {
                width: 100%;
                height: 3px;
                background: rgba(10, 6, 30, 0.08);
                border-radius: 999px;
                overflow: hidden;
            }
            .pryzm-batch-indicator__bar {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #8B5CF6 0%, #6600FF 100%);
                border-radius: inherit;
                box-shadow: 0 0 8px rgba(102, 0, 255, 0.40);
            }
        `;
        document.head.appendChild(style);
    }
}
