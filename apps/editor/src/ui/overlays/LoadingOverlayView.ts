/**
 * LoadingOverlayView.ts — THE ONE loading overlay surface.
 *
 * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270, 2026-07-13) — this file was
 * `BatchLoadingIndicator.ts`: a full-viewport frosted overlay that ONLY the batch
 * element-creation lifecycle could ever show. The founder asked for the SAME overlay
 * during "3D globe" / "3D Site" activation. The answer is NOT a second overlay
 * component — it is the SAME overlay with more than one producer. So:
 *
 *   • This class is now a pure PRESENTATION surface (`LoadingOverlaySurface`): it
 *     renders a title, a phase label, an ABSOLUTE progress ratio, a note line, and an
 *     ERROR state with actions. It knows nothing about batches, tiles or views.
 *   • `LoadingOverlayController` arbitrates N producers over this ONE surface
 *     (ref-counted sessions).
 *   • The producers are: BATCH EXECUTION (initBatchLifecycle) and VIEW ACTIVATION
 *     (3D globe / 3D Site — viewActivationLoading.ts).
 *
 * WHAT MOVED OUT (and why):
 *   • The `_cumBuilt += built` accumulation is BATCH semantics ("elements built this
 *     rAF drain frame"), not overlay semantics. It moved to the batch producer
 *     (`loadingProgress.ts` → `accumulateBatchProgress`, pure + unit-tested). The
 *     surface now takes an ABSOLUTE `{completed, total}` — which the tile-streaming
 *     producer can supply just as honestly. Behaviour for the batch is unchanged.
 *   • The phase→label map is BATCH vocabulary; it moved to `loadingProgress.ts`.
 *
 * §L-385 UNIFIED-LOADING-AESTHETIC (2026-07-17) — the founder asked for ONE calm,
 * brand-forward loading look everywhere: the ROTATING PRYZM PRISM floating directly
 * over the translucent backdrop with just text beneath it — the exact aesthetic already
 * shipped by RendererSwapOverlay / EngineLoadingOverlay (and the crash-recovery flow).
 * The frosted WHITE CARD + the grey placeholder TILE that used to box the prism are
 * gone. NOTHING about the state machine changed — this is a pure VISUAL-CHROME swap on
 * the ONE surface, so every producer (batch, view-activation, building-generation)
 * inherits the new look automatically. The prism now reads on its own because the
 * backdrop is the same translucent-white scrim RendererSwapOverlay floats it on (the
 * grey tile only existed to give a white prism contrast on a solid-white card).
 *
 * WHAT STAYED (hard-won, do not regress):
 *   • §FIX-PYRAMID-ANIM / §PRYZM-LOGO-SPINNER — a CSS 3-D prism (compositor thread),
 *     never frozen by the 100 ms–20 s main-thread LONGTASKs a batch or a Cesium tile
 *     upload produces. NEVER go back to a JS-driven animation.
 *   • §LOADING-WHITE-BACKDROP — the white, semi-transparent, blurred scrim.
 *   • §LOADING-REAL-PROGRESS — the bar is driven by a REAL signal, never a time guess.
 *     The bar is a CSS `width` transition (compositor), monotonic, clamped 2–97 % while
 *     working and snapped to 100 % on hide.
 *   • The backdrop is `pointer-events: all` at z 88880 — ABOVE the Cesium container
 *     (z 15) and the view toggles (z 30/31). That is the INPUT GATE: while the overlay
 *     is up, the user cannot navigate the scene underneath. (The Cesium camera
 *     controller is ALSO disabled by the view producer — belt and braces, because a
 *     z-order gate is a rendering accident, not a contract.)
 *
 * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY adds the ERROR state: a readiness signal that
 * never arrives must NEVER strand the user behind an eternal spinner (L-250: "a hang is
 * invisible to a cost test"). The surface can render a message + actions (Retry /
 * Continue anyway) — the card becomes interactive ONLY in that state.
 *
 * Architectural compliance:
 *   - C01 §2 (Layer Isolation): pure UI — no engine imports. Everything flows IN.
 *   - C04: no FrameScheduler / rAF dependency (P3) — CSS compositor animation only.
 */

import { createPryzmLogoSpinner } from './PryzmLogoSpinner';

/** An interactive escape hatch offered in the overlay's ERROR state. */
export interface LoadingOverlayAction {
    readonly label: string;
    readonly onClick: () => void;
    /** Renders as the filled PRYZM-purple button. */
    readonly primary?: boolean;
}

/** The surface contract the controller drives. Implemented by this DOM view; faked in tests. */
export interface LoadingOverlaySurface {
    show(opts: { title: string; label?: string }): void;
    setTitle(title: string): void;
    setLabel(label: string): void;
    /** ABSOLUTE progress. The producer owns how completed/total are derived. */
    setProgress(p: { completed: number; total: number; note?: string }): void;
    /** No honest ratio available (yet) — creep the bar, show the note if given. */
    setIndeterminate(note?: string): void;
    /** Readiness failed / stalled. Overlay stays up, but the user can always escape. */
    showError(e: { title: string; message: string; actions: readonly LoadingOverlayAction[] }): void;
    hide(): void;
    isVisible(): boolean;
}

export class LoadingOverlayView implements LoadingOverlaySurface {
    private _backdrop: HTMLElement | null = null;
    private _el: HTMLElement | null = null;
    private _title: HTMLElement | null = null;
    private _label: HTMLElement | null = null;
    private _bar: HTMLElement | null = null;
    private _track: HTMLElement | null = null;
    private _noteEl: HTMLElement | null = null;
    private _pctEl: HTMLElement | null = null;
    private _actionsEl: HTMLElement | null = null;
    private _spinner: HTMLElement | null = null;

    private _visible = false;
    private _hideTimer: ReturnType<typeof setTimeout> | null = null;
    /** True once a real ratio has been rendered this show-session (stops the creep). */
    private _hasRealProgress = false;
    /** True while the ERROR state is on screen (the card is interactive). */
    private _inError = false;

    // ── Public API ──────────────────────────────────────────────────────────

    show(opts: { title: string; label?: string }): void {
        if (this._hideTimer !== null) {
            clearTimeout(this._hideTimer);
            this._hideTimer = null;
        }
        if (!this._el) this._build();
        if (!this._el || !this._backdrop) return;

        if (!this._visible) {
            this._hasRealProgress = false;
            this._clearError();
            this._resetBar();
            this._renderPercent(0);
            if (this._noteEl) this._noteEl.textContent = '';

            this._backdrop.style.display = 'block';
            void this._backdrop.offsetHeight;
            this._backdrop.style.opacity = '1';

            this._el.style.display = 'flex';
            void this._el.offsetHeight;
            this._el.style.opacity = '1';
            this._el.style.transform = 'translate(-50%, -50%) scale(1)';
            this._visible = true;
        }

        this.setTitle(opts.title);
        this.setLabel(opts.label ?? 'Preparing…');

        // Gentle indeterminate creep so the bar is never dead-still before the first
        // real signal lands. Any setProgress() overrides it with the true ratio.
        this._startIndeterminateCreep();
    }

    isVisible(): boolean {
        return this._visible;
    }

    setTitle(title: string): void {
        if (this._title && this._title.textContent !== title) this._title.textContent = title;
    }

    setLabel(label: string): void {
        if (this._label && this._label.textContent !== label) this._label.textContent = label;
    }

    /**
     * ABSOLUTE progress — `completed` of `total`. Monotonic, clamped 2–97 % while
     * working so the bar never visually "completes" before the readiness signal
     * actually arrives (a bar that hits 100 % and then sits there is a lie).
     */
    setProgress(p: { completed: number; total: number; note?: string }): void {
        if (!this._el || !this._visible || this._inError) return;
        const total = Math.max(0, p.total);
        const completed = Math.max(0, Math.min(p.completed, total));
        this._hasRealProgress = true;
        const ratio = total > 0 ? completed / total : 0;
        const pct = Math.max(2, Math.min(97, Math.round(ratio * 100)));
        this._setBarWidth(pct, /* smooth */ true);
        this._renderPercent(pct);
        if (this._noteEl) this._noteEl.textContent = p.note ?? '';
    }

    setIndeterminate(note?: string): void {
        if (!this._el || !this._visible || this._inError) return;
        if (this._noteEl) this._noteEl.textContent = note ?? '';
        if (!this._hasRealProgress) this._startIndeterminateCreep();
    }

    /**
     * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY — the FAILURE PATH. A readiness signal that
     * never arrives must surface as an explicit, escapable error — never an eternal
     * spinner. The card becomes pointer-interactive ONLY here.
     */
    showError(e: { title: string; message: string; actions: readonly LoadingOverlayAction[] }): void {
        if (!this._el) this._build();
        if (!this._el || !this._backdrop) return;
        if (!this._visible) this.show({ title: e.title });

        this._inError = true;
        this._el.classList.add('pryzm-loading-overlay--error');
        // The card must accept clicks now (it is pointer-events:none while loading, so
        // the frosted backdrop owns the input gate).
        this._el.style.pointerEvents = 'auto';
        if (this._spinner) this._spinner.style.display = 'none';
        if (this._track) this._track.style.display = 'none';
        if (this._pctEl) this._pctEl.style.display = 'none';

        this.setTitle(e.title);
        this.setLabel(e.message);
        if (this._noteEl) this._noteEl.textContent = '';

        const actions = this._actionsEl;
        if (!actions) return;
        actions.textContent = '';
        actions.style.display = 'flex';
        for (const a of e.actions) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className =
                'pryzm-loading-overlay__btn' +
                (a.primary ? ' pryzm-loading-overlay__btn--primary' : '');
            b.textContent = a.label;
            b.addEventListener('click', () => {
                try { a.onClick(); } catch (err) { console.error('[LoadingOverlayView] action threw:', err); }
            });
            actions.appendChild(b);
        }
    }

    hide(): void {
        if (!this._el || !this._visible) return;
        this._visible = false;

        this._clearError();
        this._setBarWidth(100, /* smooth */ true);
        this._renderPercent(100);
        if (this._label) this._label.textContent = 'Done';

        const el = this._el;
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
        backdrop.id = 'pryzm-loading-backdrop';
        backdrop.className = 'pryzm-loading-backdrop';
        backdrop.setAttribute('data-testid', 'pryzm-loading-backdrop');
        document.body.appendChild(backdrop);
        this._backdrop = backdrop;

        const card = document.createElement('div');
        card.id = 'pryzm-loading-overlay';
        card.className = 'pryzm-loading-overlay';
        card.setAttribute('data-testid', 'pryzm-loading-overlay');

        // §PRYZM-LOGO-SPINNER — CSS 3-D prism on the compositor thread: it keeps
        // turning through every main-thread LONGTASK (geometry drain, WebGPU PSO
        // compile, Cesium tile upload).
        const spinner = createPryzmLogoSpinner('lg');
        spinner.classList.add('pryzm-loading-overlay__spinner');
        this._spinner = spinner;

        const textBlock = document.createElement('div');
        textBlock.className = 'pryzm-loading-overlay__text';

        const title = document.createElement('div');
        title.className = 'pryzm-loading-overlay__title';
        title.textContent = 'Loading';
        this._title = title;

        const label = document.createElement('div');
        label.className = 'pryzm-loading-overlay__label';
        label.textContent = 'Preparing…';
        this._label = label;

        const noteEl = document.createElement('div');
        noteEl.className = 'pryzm-loading-overlay__note';
        noteEl.textContent = '';
        this._noteEl = noteEl;

        const progressRow = document.createElement('div');
        progressRow.className = 'pryzm-loading-overlay__progress-row';

        const track = document.createElement('div');
        track.className = 'pryzm-loading-overlay__track';
        const bar = document.createElement('div');
        bar.className = 'pryzm-loading-overlay__bar';
        track.appendChild(bar);
        this._bar = bar;
        this._track = track;

        const pct = document.createElement('div');
        pct.className = 'pryzm-loading-overlay__pct';
        pct.textContent = '';
        this._pctEl = pct;

        progressRow.appendChild(track);
        progressRow.appendChild(pct);

        const actions = document.createElement('div');
        actions.className = 'pryzm-loading-overlay__actions';
        actions.style.display = 'none';
        this._actionsEl = actions;

        textBlock.appendChild(title);
        textBlock.appendChild(label);
        textBlock.appendChild(noteEl);
        textBlock.appendChild(progressRow);
        textBlock.appendChild(actions);

        card.appendChild(spinner);
        card.appendChild(textBlock);

        document.body.appendChild(card);
        this._el = card;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private _clearError(): void {
        if (!this._inError) return;
        this._inError = false;
        this._el?.classList.remove('pryzm-loading-overlay--error');
        if (this._el) this._el.style.pointerEvents = 'none';
        if (this._spinner) this._spinner.style.display = '';
        if (this._track) this._track.style.display = '';
        if (this._pctEl) this._pctEl.style.display = '';
        if (this._actionsEl) {
            this._actionsEl.textContent = '';
            this._actionsEl.style.display = 'none';
        }
    }

    private _renderPercent(pct: number): void {
        if (this._pctEl) this._pctEl.textContent = `${Math.round(pct)}%`;
    }

    private _resetBar(): void {
        if (this._bar) {
            this._bar.style.transition = 'none';
            this._bar.style.width = '0%';
        }
    }

    /** CSS `width` transition (compositor-driven → keeps moving through LONGTASKs). */
    private _setBarWidth(pct: number, smooth: boolean): void {
        if (!this._bar) return;
        // Never let progress move the bar backwards (monotonic UX).
        const current = parseFloat(this._bar.style.width) || 0;
        const next = Math.max(current, pct);
        this._bar.style.transition = smooth ? 'width 0.35s ease-out' : 'none';
        this._bar.style.width = `${next}%`;
    }

    /** Creep toward ~20 % before the first real signal, so the bar is never dead-still. */
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
        const id = 'pryzm-loading-overlay-style';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = `
            /* §LOADING-WHITE-BACKDROP — a WHITE but SEMI-TRANSPARENT scrim: the scene
               reads faintly behind the card, on a clean white tint (no dark/purple).
               §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY — this is ALSO the INPUT GATE:
               pointer-events:all at z 88880, above the Cesium container (z 15) and the
               view toggles (z 30/31), so nothing underneath can be navigated or clicked
               until the readiness signal dismisses the overlay. */
            .pryzm-loading-backdrop {
                position: fixed;
                inset: 0;
                z-index: 88880;
                display: none;
                opacity: 0;
                /* §LOAD-MASK-OPAQUE-WHITE (L-483) — a FULL white mask, not a translucent scrim.
                   The old rgba(...,0.68) let the layer being loaded show THROUGH at 32%, and on a
                   view transition the thing behind is a Cesium globe whose 3D tiles have not
                   painted yet — i.e. a DARK sphere. So the "Opening the 3D globe" card sat on a
                   muddy grey-through-to-black wash (founder: "an ugly dark background comes up").
                   Brand is white + purple, explicitly no black (onboarding brand note), so the
                   honest mask is opaque white: the user sees a clean white field with the prism
                   and progress until the scene is genuinely ready, never a half-loaded globe.
                   The blur is kept for the brief fade in/out, when a frame may still show through. */
                background: #FFFFFF;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                transition: opacity 0.20s ease;
                pointer-events: all;
            }

            /* §L-385 — NO CARD. A transparent, centered COLUMN that floats the rotating
               prism directly over the translucent backdrop with the text beneath it,
               matching RendererSwapOverlay / EngineLoadingOverlay. The fixed-centre
               position + the scale/opacity entrance-and-exit transitions are unchanged
               (show()/hide() still drive transform: translate(-50%,-50%) scale(...)). */
            .pryzm-loading-overlay {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.94);
                z-index: 88888;
                display: none;
                opacity: 0;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 0;
                padding: 0;
                background: transparent;
                border-radius: 0;
                box-shadow: none;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                             Helvetica, Arial, sans-serif;
                user-select: none;
                pointer-events: none;
                text-align: center;
                transition:
                    opacity 0.25s cubic-bezier(0.22, 1, 0.36, 1),
                    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
                width: min(440px, 86vw);
            }

            /* §L-385 — the prism floats free (grey placeholder tile removed); scaled up
               for hero presence over the scrim, its own purple drop-shadow (baked into
               the shared spinner) gives it lift on the translucent-white backdrop. */
            .pryzm-loading-overlay__spinner {
                flex-shrink: 0;
                transform: scale(1.85);
                transform-origin: center center;
                margin-bottom: 46px;
                overflow: visible;
            }

            .pryzm-loading-overlay__text {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 7px;
                width: 100%;
                min-width: 0;
            }
            .pryzm-loading-overlay__title {
                font-size: 16px;
                font-weight: 700;
                color: #1a1130;
                letter-spacing: -0.01em;
                max-width: 100%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .pryzm-loading-overlay__label {
                font-size: 12.5px;
                font-weight: 500;
                color: #5a5f70;
                letter-spacing: 0.005em;
                max-width: 100%;
            }
            .pryzm-loading-overlay__note {
                font-size: 11px;
                font-weight: 500;
                color: #8b7fb0;
                letter-spacing: 0.04em;
                min-height: 13px;
                font-variant-numeric: tabular-nums;
            }
            .pryzm-loading-overlay__progress-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-top: 16px;
                width: min(240px, 62vw);
            }
            /* §LOADING-REAL-PROGRESS — thin brand-purple bar (was neutral grey). */
            .pryzm-loading-overlay__track {
                flex: 1;
                height: 3px;
                background: rgba(102, 0, 255, 0.14);
                border-radius: 999px;
                overflow: hidden;
            }
            .pryzm-loading-overlay__bar {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #8B5CF6 0%, #6600FF 100%);
                border-radius: inherit;
                box-shadow: 0 0 8px rgba(102, 0, 255, 0.40);
            }
            .pryzm-loading-overlay__pct {
                flex-shrink: 0;
                min-width: 34px;
                text-align: right;
                font-size: 11px;
                font-weight: 600;
                color: #6600FF;
                letter-spacing: 0.02em;
                font-variant-numeric: tabular-nums;
            }

            /* ── ERROR state (§FEAT-VIEW-ACTIVATION-LOADING-OVERLAY) ─────────────
               A readiness signal that never arrives is a DEFECT, not a longer wait.
               Say so, and always give the user a way out. */
            .pryzm-loading-overlay--error .pryzm-loading-overlay__label {
                color: #b4232a;
                white-space: normal;
            }
            .pryzm-loading-overlay__actions {
                display: none;
                gap: 8px;
                margin-top: 18px;
                justify-content: center;
            }
            .pryzm-loading-overlay__btn {
                appearance: none;
                border: 1px solid #ece7fb;
                background: #ffffff;
                color: #6600FF;
                cursor: pointer;
                padding: 7px 14px;
                border-radius: 8px;
                font: 600 12px/1 system-ui, sans-serif;
            }
            .pryzm-loading-overlay__btn:hover { background: #f4f0ff; }
            .pryzm-loading-overlay__btn--primary {
                background: #6600FF;
                border-color: #6600FF;
                color: #ffffff;
            }
            .pryzm-loading-overlay__btn--primary:hover { background: #5500dd; }
        `;
        document.head.appendChild(style);
    }
}
