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
 * with the shared `createPryzmLogoSpinner('lg')` CSS 3-D pyramid — identical
 * to the prism shown in EngineLoadingOverlay. Still compositor-thread driven
 * (never frozen), now truly 3-D with four shaded faces and correct perspective.
 *
 * §LOADING-REAL-PROGRESS (2026-07-01): Professional overlay that shows REAL
 * build data instead of a bogus per-sub-batch count and a fixed time-guess bar.
 *
 *   Problem the founder saw — "Building 1 element…" with a bar stalled at 85 %:
 *     • The office/house/building generators run MANY deferred sub-batches (per
 *       level / per element type). Each sub-batch declares a tiny/one-element
 *       `totalElementCount` while the real geometry (2,355+ elements for an
 *       office) arrives via the store bus UNCOUNTED. `show(count)` was handed
 *       that per-sub-batch "1", so the label read "Building 1 element…".
 *     • The bar was animated to 85 % over `elementCount × 80 ms` — a pure guess
 *       that stalled long before the build finished (or raced ahead of it).
 *
 *   Fix — drive the overlay from the REAL fragment-builder drain signal:
 *     • BatchCoordinator.reportBuildProgress(built, remaining, phaseHint) is
 *       called by the Wall / Slab / CurtainWall builders on every rAF drain
 *       frame (the same point they log `RAF_DRAIN built=N remaining=M`).
 *     • initBatchLifecycle pipes it to `setProgress(built, remaining, phase)`.
 *     • This overlay ACCUMULATES: `_cumBuilt += built`, and tracks the PEAK
 *       `_total = _cumBuilt + remaining` seen. The bar width = _cumBuilt/_total,
 *       and the sub-label reads "1,240 / 2,355 elements". Because the accumulator
 *       only resets when the overlay is re-shown from a HIDDEN state (not between
 *       back-to-back sub-batches that keep it visible), the count spans the WHOLE
 *       visible generation — so the user sees the true cumulative total.
 *     • The bar is still a CSS `width` transition (compositor thread), so it
 *       keeps advancing through every main-thread LONGTASK. On hide() it snaps
 *       to 100 % exactly as before.
 *
 *   Phase labels: the `phaseHint` from the draining builder drives the title —
 *   'structure' → "Building structure…", 'facade' → "Glazing façade…". The GPU
 *   compile phase is the existing `transitionToGpuCompile()`.
 *
 * The bar animation is a CSS `width` transition so the progress indicator
 * continues moving through every LONGTASK.
 *
 * Architectural compliance:
 *   - C01 §2 (Layer Isolation): Overlay is pure UI — no engine imports. All
 *     progress data flows IN via the injected setProgress() call.
 *   - No FrameScheduler dependency: CSS compositor thread handles animation.
 *   - setBatchLifecycleCallbacks(onShow, onHide): injection API preserved.
 *
 * Visual design:
 *   - Backdrop: the shared --pryzm-panel-backdrop scrim (§PANEL-BACKDROP-UNIFY)
 *     over the canvas — identical to every other PRYZM panel/modal.
 *   - Card: white rounded panel centered in viewport (same PRYZM brand as before).
 *   - PRYZM pyramid logo — larger CSS 3-D prism, identical to EngineLoadingOverlay.
 *   - Purple progress bar advancing via CSS width transition + a live % readout.
 *   - Entrance: backdrop fades in (200ms) + card scales up from 0.94 (250ms).
 *   - Exit: bar fills to 100% → "Done" label → card scales down → backdrop fades out.
 */

import { createPryzmLogoSpinner } from './PryzmLogoSpinner';

export class BatchLoadingIndicator {
    private _backdrop: HTMLElement | null = null;
    private _el: HTMLElement | null = null;
    private _title: HTMLElement | null = null;
    private _label: HTMLElement | null = null;
    private _bar: HTMLElement | null = null;
    private _countEl: HTMLElement | null = null;
    private _pctEl: HTMLElement | null = null;

    private _visible = false;
    private _hideTimer: ReturnType<typeof setTimeout> | null = null;

    // ── §LOADING-REAL-PROGRESS live accumulator ─────────────────────────────
    /** Cumulative elements built since the overlay was last shown from hidden. */
    private _cumBuilt = 0;
    /** Peak `built + remaining` seen — the honest, monotonic total estimate. */
    private _total = 0;
    /** True once at least one real progress frame has arrived this show-session. */
    private _hasRealProgress = false;
    /** Last phase hint applied to the title (dedupes redundant label writes). */
    private _phase = '';
    /** True once transitionToGpuCompile() fired — locks the title to the compile msg. */
    private _inGpuCompile = false;

    private static readonly _PHASE_TITLES: Record<string, string> = {
        structure: 'Building structure…',
        facade:    'Glazing façade…',
        openings:  'Placing windows & doors…',
        furnish:   'Furnishing…',
        lighting:  'Placing lighting…',
    };

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Show the full-viewport overlay + indicator card.
     * Initialises the DOM on first call.
     * @param elementCount  Declared element count for this sub-batch (best-effort
     *   seed only — the real total is discovered live via setProgress()).
     */
    show(elementCount: number): void {
        if (this._hideTimer !== null) {
            clearTimeout(this._hideTimer);
            this._hideTimer = null;
        }
        if (!this._el) this._build();
        if (!this._el || !this._backdrop) return;

        // §LOADING-REAL-PROGRESS — only RESET the live accumulator when the overlay
        // was actually hidden. Back-to-back sub-batches (office/house per-level runs)
        // keep it visible, so the cumulative count spans the whole generation and the
        // user sees the TRUE total, not one sub-batch's declared "1".
        if (!this._visible) {
            this._cumBuilt = 0;
            this._total = Math.max(0, elementCount | 0);
            this._hasRealProgress = false;
            this._phase = '';
            this._inGpuCompile = false;
            this._resetBar();
            this._updateTitle('');
            this._renderCountLabel();
            this._renderPercent(0);
        }

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

        // Kick a gentle "indeterminate creep" so the bar is never dead-still before
        // the first real drain frame lands. Real progress (setProgress) overrides it.
        this._startIndeterminateCreep();
    }

    /**
     * §LOADING-REAL-PROGRESS — receive a live fragment-builder drain frame.
     *
     * `built`     — elements built in the frame that just completed,
     * `remaining` — elements still queued in that builder,
     * `phaseHint` — coarse phase label ('structure' | 'facade' | …).
     *
     * Accumulates a cumulative built / peak-total ratio and drives the CSS bar
     * from the REAL ratio (never the old time guess). Safe to call before show()
     * (no-ops if the DOM isn't up yet).
     */
    setProgress(built: number, remaining: number, phaseHint?: string): void {
        if (!this._el || !this._visible) return;

        const b = Math.max(0, Math.floor(built));
        const r = Math.max(0, Math.floor(remaining));
        this._cumBuilt += b;
        // Peak total: the highest (built-so-far + still-queued) we have ever seen.
        // Monotonic → the bar never jumps backwards even as new sub-batches enqueue.
        this._total = Math.max(this._total, this._cumBuilt + r);
        this._hasRealProgress = true;

        // Phase title (GPU-compile phase locks the title — don't overwrite it).
        if (!this._inGpuCompile && phaseHint) this._updateTitle(phaseHint);

        this._renderCountLabel();

        // Real ratio. Clamp to 2 %..97 % while building so the bar always shows a
        // little progress and never visually "completes" before hide() snaps to 100 %.
        const ratio = this._total > 0 ? this._cumBuilt / this._total : 0;
        const pct = Math.max(2, Math.min(97, Math.round(ratio * 100)));
        this._setBarWidth(pct, /* smooth */ true);
        this._renderPercent(pct);
    }

    /**
     * Switch the label to "Compiling GPU shaders…" just before the WebGPU
     * PSO LONGTASK fires.  Called synchronously so the user sees the correct
     * message on the last painted frame before the main thread blocks.
     * §FIX-GPU-COMPILE-LABEL
     */
    transitionToGpuCompile(): void {
        this._inGpuCompile = true;
        if (this._label) this._label.textContent = 'Compiling GPU shaders…';
        if (this._title) this._title.textContent = 'Finishing up';
        // Nudge the bar toward completion — the compile is the last visible phase.
        this._setBarWidth(96, /* smooth */ true);
        this._renderPercent(96);
    }

    /**
     * Fade out overlay + card.  Safe to call even if not shown.
     */
    hide(): void {
        if (!this._el || !this._visible) return;
        this._visible = false;

        this._setBarWidth(100, /* smooth */ true);
        this._renderPercent(100);
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
        // §LOADING-REAL-PROGRESS: use the 'lg' prism (same as EngineLoadingOverlay)
        // so the founder's "make the logo turn like the other loading page" is met.
        const spinner = createPryzmLogoSpinner('lg');
        spinner.classList.add('pryzm-batch-indicator__spinner');

        const textBlock = document.createElement('div');
        textBlock.className = 'pryzm-batch-indicator__text';

        // Title line — best-effort generation phase ("Building structure…", …).
        const title = document.createElement('div');
        title.className = 'pryzm-batch-indicator__title';
        title.textContent = 'Generating your model';
        this._title = title;

        const label = document.createElement('div');
        label.className = 'pryzm-batch-indicator__label';
        label.textContent = 'Preparing…';
        this._label = label;

        const countEl = document.createElement('div');
        countEl.className = 'pryzm-batch-indicator__count';
        countEl.textContent = '';
        this._countEl = countEl;

        // Progress row: track + live percentage readout.
        const progressRow = document.createElement('div');
        progressRow.className = 'pryzm-batch-indicator__progress-row';

        const track = document.createElement('div');
        track.className = 'pryzm-batch-indicator__track';
        const bar = document.createElement('div');
        bar.className = 'pryzm-batch-indicator__bar';
        track.appendChild(bar);
        this._bar = bar;

        const pct = document.createElement('div');
        pct.className = 'pryzm-batch-indicator__pct';
        pct.textContent = '';
        this._pctEl = pct;

        progressRow.appendChild(track);
        progressRow.appendChild(pct);

        textBlock.appendChild(title);
        textBlock.appendChild(label);
        textBlock.appendChild(countEl);
        textBlock.appendChild(progressRow);

        card.appendChild(spinner);
        card.appendChild(textBlock);

        document.body.appendChild(card);
        this._el = card;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** Map a coarse phase hint to a human title in the label line. */
    private _updateTitle(phaseHint: string): void {
        if (phaseHint && phaseHint === this._phase) return;
        this._phase = phaseHint;
        if (this._label) {
            this._label.textContent =
                BatchLoadingIndicator._PHASE_TITLES[phaseHint] ?? 'Building elements…';
        }
    }

    /** Render the "N / M elements" (or "N elements") sub-label from live counts. */
    private _renderCountLabel(): void {
        if (!this._countEl) return;
        if (!this._hasRealProgress && this._total <= 1) {
            // No real data yet and only a bogus seed count — say nothing rather
            // than the misleading "Building 1 element…".
            this._countEl.textContent = '';
            return;
        }
        const built = this._fmt(this._cumBuilt);
        if (this._total > this._cumBuilt) {
            this._countEl.textContent = `${built} / ${this._fmt(this._total)} elements`;
        } else {
            this._countEl.textContent = `${built} element${this._cumBuilt === 1 ? '' : 's'}`;
        }
    }

    private _renderPercent(pct: number): void {
        if (this._pctEl) this._pctEl.textContent = `${Math.round(pct)}%`;
    }

    /** Thousands-separated integer (locale-independent grouping). */
    private _fmt(n: number): string {
        return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    private _resetBar(): void {
        if (this._bar) {
            this._bar.style.transition = 'none';
            this._bar.style.width = '0%';
        }
    }

    /**
     * Set the bar width via a CSS `width` transition (compositor-driven, so it keeps
     * moving through main-thread LONGTASKs). `smooth` uses a short ease so real
     * progress ticks glide rather than jump.
     */
    private _setBarWidth(pct: number, smooth: boolean): void {
        if (!this._bar) return;
        // Never let real progress move the bar backwards (monotonic UX).
        const current = parseFloat(this._bar.style.width) || 0;
        const next = Math.max(current, pct);
        this._bar.style.transition = smooth ? 'width 0.35s ease-out' : 'none';
        this._bar.style.width = `${next}%`;
    }

    /**
     * Before the first real drain frame arrives, creep the bar slowly toward ~20 %
     * so it is never dead-still — a compositor-driven CSS transition (LONGTASK-safe).
     * The first setProgress() call overrides this with the real ratio.
     */
    private _startIndeterminateCreep(): void {
        if (!this._bar || this._hasRealProgress) return;
        this._resetBar();
        void this._bar.offsetWidth; // flush the 0% reset before arming the transition
        this._bar.style.transition = 'width 2500ms cubic-bezier(0.15,0.6,0.3,1)';
        this._bar.style.width = '20%';
        this._renderPercent(0);
    }

    // ── Styles ──────────────────────────────────────────────────────────────

    private _ensureStyles(): void {
        const id = 'pryzm-batch-indicator-style';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = `
            /* §FIX-BATCH-OVERLAY: Full-viewport backdrop.
               §LOADING-WHITE-BACKDROP (founder 2026-07-01) — a WHITE but SEMI-TRANSPARENT
               scrim (the founder wanted the white look back to being see-through "as it was",
               not the solid-white field): a soft white haze + blur so the scene reads faintly
               behind the card, on a clean white tint (no dark/purple scrim). */
            .pryzm-batch-backdrop {
                position: fixed;
                inset: 0;
                z-index: 88880;
                display: none;
                opacity: 0;
                background: rgba(255, 255, 255, 0.68);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
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
                gap: 22px;
                padding: 26px 32px;
                background: #ffffff;
                border-radius: 20px;
                box-shadow:
                    0 12px 56px rgba(10, 6, 30, 0.24),
                    0 2px 10px rgba(10, 6, 30, 0.12),
                    inset 0 0 0 1px rgba(10, 6, 30, 0.05);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                             Helvetica, Arial, sans-serif;
                user-select: none;
                pointer-events: none;
                transition:
                    opacity 0.25s cubic-bezier(0.22, 1, 0.36, 1),
                    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
                min-width: 340px;
                max-width: 440px;
            }

            /* §LOADING-REAL-PROGRESS — pastel-lavender tile behind the prism.
               The shared PRYZM prism has WHITE translucent glass faces (tuned for
               the EngineLoadingOverlay's pastel-mesh background). On a pure-white
               card those faces would be invisible, so we seat the turning prism on
               a soft lavender field — matching the other loading page's palette so
               the 3-D shape reads clearly and the card feels premium. The prism
               keeps turning on the compositor thread (immune to main-thread
               LONGTASKs); this tile is a static backdrop only. */
            /* §LOADING-WHITE-BACKDROP — the founder wants to SEE the turning prism on the
               white panel (a pure-white tile made the white-faced prism vanish). Use a very
               light NEUTRAL tile (soft grey, no purple) — reads as near-white so the panel
               still feels clean, but gives the white prism enough contrast to read + turn
               visibly. Kept a faint drop-shadow for depth. */
            .pryzm-batch-indicator__spinner {
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 74px;
                height: 74px;
                border-radius: 16px;
                background:
                    radial-gradient(ellipse at 32% 30%, #f6f7f9 0%, transparent 62%),
                    #e4e6ec;
                box-shadow: inset 0 0 0 1px rgba(10, 6, 30, 0.05);
                filter: drop-shadow(0 2px 6px rgba(10, 6, 30, 0.12));
            }

            .pryzm-batch-indicator__text {
                display: flex;
                flex-direction: column;
                gap: 6px;
                flex: 1;
                min-width: 0;
            }
            /* Title — the "what" ("Generating your model" / phase-agnostic header). */
            .pryzm-batch-indicator__title {
                font-size: 15px;
                font-weight: 700;
                color: #0a0616;
                letter-spacing: -0.01em;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            /* Label — the live phase ("Building structure…", "Glazing façade…"). */
            .pryzm-batch-indicator__label {
                font-size: 12.5px;
                font-weight: 500;
                color: #5a5f70;
                letter-spacing: 0.005em;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .pryzm-batch-indicator__count {
                font-size: 11px;
                font-weight: 500;
                color: #9095a8;
                letter-spacing: 0.04em;
                min-height: 13px;
                font-variant-numeric: tabular-nums;
            }
            .pryzm-batch-indicator__progress-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-top: 6px;
            }
            .pryzm-batch-indicator__track {
                flex: 1;
                height: 4px;
                background: rgba(10, 6, 30, 0.08);
                border-radius: 999px;
                overflow: hidden;
            }
            .pryzm-batch-indicator__bar {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #6b7080 0%, #3a3e4a 100%);
                border-radius: inherit;
                box-shadow: 0 0 6px rgba(10, 6, 30, 0.18);
            }
            .pryzm-batch-indicator__pct {
                flex-shrink: 0;
                min-width: 34px;
                text-align: right;
                font-size: 11px;
                font-weight: 600;
                color: #5a5f70;
                letter-spacing: 0.02em;
                font-variant-numeric: tabular-nums;
            }
        `;
        document.head.appendChild(style);
    }
}
