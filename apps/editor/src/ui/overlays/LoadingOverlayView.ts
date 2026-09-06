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

// §SPLASH-IS-ONE-COMPONENT (founder 2026-09-06: "the loading, don't use the current one
// (photo 1), add photo 2, which is the project start-up") — the pastel mesh gradient, the hero
// pyramid, the PRYZM wordmark, the hairline track and the caption belong to the BOOT SPLASH, and
// they are now ONE component shared with it. This surface supplies the caption and the honest
// numbers; it defines no colour of its own. ⚠ Copying the splash's hexes in here instead would
// have been the L-12965 defect again: seven colours defined twice, drifted apart, and neither
// definition wrong on its own. Same look must mean SAME CODE.
import { buildPryzmSplashButton, buildPryzmSplashChrome, type PryzmSplashChrome } from './PryzmSplashChrome';

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
    private _chrome: PryzmSplashChrome | null = null;
    private _bar: HTMLElement | null = null;
    private _track: HTMLElement | null = null;
    private _spinner: HTMLElement | null = null;

    /** The producer's own strings, held so any one of them can be updated independently and the
     *  ONE honest line under the caption re-composed from all three. */
    private _titleText = 'Loading';
    private _labelText = 'Preparing…';
    private _noteText = '';
    private _pctText = '';

    private _visible = false;
    private _hideTimer: ReturnType<typeof setTimeout> | null = null;
    /** True once a real ratio has been rendered this show-session (stops the creep). */
    private _hasRealProgress = false;
    /** True while the ERROR state is on screen (the column is interactive). */
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
            this._pctText = '';
            this._noteText = '';

            this._backdrop.style.display = 'block';
            void this._backdrop.offsetHeight;
            this._backdrop.style.opacity = '1';

            this._el.style.display = 'block';
            void this._el.offsetHeight;
            this._el.style.opacity = '1';
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
        if (this._titleText === title) return;
        this._titleText = title;
        this._renderCaption();
    }

    setLabel(label: string): void {
        if (this._labelText === label) return;
        this._labelText = label;
        this._renderMeta();
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
        this._pctText = `${pct}%`;
        this._noteText = p.note ?? '';
        this._renderMeta();
    }

    setIndeterminate(note?: string): void {
        if (!this._el || !this._visible || this._inError) return;
        this._noteText = note ?? '';
        this._renderMeta();
        if (!this._hasRealProgress) this._startIndeterminateCreep();
    }

    /**
     * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY — the FAILURE PATH. A readiness signal that
     * never arrives must surface as an explicit, escapable error — never an eternal
     * spinner. The column becomes pointer-interactive ONLY here.
     */
    showError(e: { title: string; message: string; actions: readonly LoadingOverlayAction[] }): void {
        if (!this._el) this._build();
        if (!this._el || !this._backdrop || !this._chrome) return;
        if (!this._visible) this.show({ title: e.title });

        this._inError = true;
        this._el.classList.add('pryzm-loading-overlay--error');
        this._el.style.pointerEvents = 'auto';
        if (this._track) this._track.style.display = 'none';

        const chrome = this._chrome;
        chrome.caption.classList.add('pryzm-splash-caption--error');
        chrome.caption.textContent = `${e.title} — ${e.message}`;
        chrome.meta.textContent = '';

        const actions = chrome.actions;
        actions.textContent = '';
        actions.hidden = false;
        for (const a of e.actions) {
            const b = buildPryzmSplashButton(a.label, a.primary === true);
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
        this._pctText = '100%';
        this._labelText = 'Done';
        this._noteText = '';
        this._renderMeta();

        const el = this._el;
        const backdrop = this._backdrop;

        this._hideTimer = setTimeout(() => {
            el.style.transition = 'opacity 0.30s ease';
            el.style.opacity = '0';

            if (backdrop) {
                backdrop.style.transition = 'opacity 0.40s ease';
                backdrop.style.opacity = '0';
            }

            setTimeout(() => {
                el.style.display = 'none';
                this._resetBar();
                if (backdrop) backdrop.style.display = 'none';
            }, 450);
            this._hideTimer = null;
        }, 280);
    }

    // ── DOM construction ────────────────────────────────────────────────────

    private _build(): void {
        this._ensureStyles();

        // The GROUND. It keeps its id, its z-index and its `pointer-events: all` — that is the
        // INPUT GATE and it is unchanged. What changed is only what it is PAINTED with: the
        // shared `pryzm-splash-ground` mesh gradient instead of this file's own flat token fill.
        const backdrop = document.createElement('div');
        backdrop.id = 'pryzm-loading-backdrop';
        backdrop.className = 'pryzm-loading-backdrop pryzm-splash-ground';
        backdrop.setAttribute('data-testid', 'pryzm-loading-backdrop');
        document.body.appendChild(backdrop);
        this._backdrop = backdrop;

        const card = document.createElement('div');
        card.id = 'pryzm-loading-overlay';
        card.className = 'pryzm-loading-overlay';
        card.setAttribute('data-testid', 'pryzm-loading-overlay');

        // §SPLASH-IS-ONE-COMPONENT — the pyramid, wordmark, hairline track, caption and honest
        // meta row all come from the ONE factory the engine boot uses. No hex, no gradient and
        // no type scale is defined in this file any more.
        const chrome = buildPryzmSplashChrome();
        this._chrome = chrome;
        this._bar = chrome.bar;
        this._track = chrome.track;
        this._spinner = chrome.spinner;
        chrome.column.style.position = 'absolute';
        chrome.column.style.inset = '0';
        card.appendChild(chrome.column);

        document.body.appendChild(card);
        this._el = card;
        this._renderCaption();
        this._renderMeta();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private _clearError(): void {
        if (!this._inError) return;
        this._inError = false;
        this._el?.classList.remove('pryzm-loading-overlay--error');
        if (this._el) this._el.style.pointerEvents = 'none';
        if (this._spinner) this._spinner.style.display = '';
        if (this._track) this._track.style.display = '';
        if (this._chrome) {
            this._chrome.caption.classList.remove('pryzm-splash-caption--error');
            this._chrome.actions.textContent = '';
            this._chrome.actions.hidden = true;
        }
        this._renderCaption();
        this._renderMeta();
    }

    /** The caption line = the producer's TITLE ("Opening the 3D Site"), uppercased by CSS. */
    private _renderCaption(): void {
        if (!this._chrome || this._inError) return;
        if (this._chrome.caption.textContent !== this._titleText) {
            this._chrome.caption.textContent = this._titleText;
        }
    }

    /**
     * ⛔ THE HONEST ROW. The founder asked for the prettier screen AND still wants to know it is
     * working, so the phase line, the producer's own note (the tile counter — "48 / 49 tiles")
     * and the percentage are composed onto ONE line under the caption rather than dropped. A
     * splash that says less than the surface it replaced would be a regression wearing a nicer
     * background.
     */
    private _renderMeta(): void {
        if (!this._chrome || this._inError) return;
        const parts = [this._labelText, this._noteText].filter((t) => t.length > 0);
        const meta = this._chrome.meta;
        meta.textContent = parts.join(' · ');
        if (this._pctText) {
            if (parts.length > 0) meta.appendChild(document.createTextNode(' · '));
            const pct = document.createElement('span');
            pct.className = 'pryzm-splash-meta-pct';
            pct.textContent = this._pctText;
            meta.appendChild(pct);
        }
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
    }

    // ── Styles ──────────────────────────────────────────────────────────────

    /**
     * ⚠ WHAT IS LEFT HERE IS POSITIONING AND THE INPUT GATE — NOTHING VISUAL.
     *
     * Every colour, gradient, type scale and animation this file used to own moved to
     * `PryzmSplashChrome.ts` (§SPLASH-IS-ONE-COMPONENT). The two rules below are the ones that
     * are genuinely THIS surface's own: where it sits in the stacking order, and the fact that
     * the ground eats pointer events while the column does not.
     */
    private _ensureStyles(): void {
        const id = 'pryzm-loading-overlay-style';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = `
            /* §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY — THE INPUT GATE. pointer-events:all at
               z 88880, above the Cesium container (z 15) and the view toggles (z 30/31), so
               nothing underneath can be navigated or clicked until the readiness signal
               dismisses the overlay. §LOAD-MASK-OPAQUE-WHITE (L-483) — the ground is a FULL
               mask (the splash gradient's final stop is opaque), never a translucent scrim over
               a half-painted dark globe. The blur is kept for the brief fade in/out. */
            .pryzm-loading-backdrop {
                z-index: 88880;
                display: none;
                opacity: 0;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                transition: opacity 0.20s ease;
                pointer-events: all;
            }
            .pryzm-loading-overlay {
                position: fixed;
                inset: 0;
                z-index: 88888;
                display: none;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s cubic-bezier(0.22, 1, 0.36, 1);
            }
        `;
        document.head.appendChild(style);
    }
}
