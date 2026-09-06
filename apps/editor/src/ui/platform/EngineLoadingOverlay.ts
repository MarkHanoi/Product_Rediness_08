/**
 * EngineLoadingOverlay.ts
 *
 * Full-screen loading overlay — white background, PRYZM pyramid logo
 * rotating in true 3-D.
 *
 * §PRYZM-LOGO-SPINNER (2026-05-09): The pyramid is now rendered by the shared
 * `createPryzmLogoSpinner('lg')` CSS 3-D spinner (see
 * `src/ui/overlays/PryzmLogoSpinner.ts`).  This replaces the previous
 * JS rAF-driven painter's-algorithm renderer which:
 *   (a) could freeze during main-thread LONGTASKs (shader compilation, IFC
 *       parse, geometry builds), violating CONTRACT §5.1 "overlay must stay
 *       visually alive", and
 *   (b) used a separate `addTickListener` registration that conflicted with
 *       rapid show()/hide() cycles (duplicate-ID throw).
 *
 * The CSS compositor thread drives the spin animation independently of JS,
 * so it is guaranteed to keep flowing even when the main thread is blocked
 * for multiple seconds.  The prism is geometrically identical to the one
 * shown in `LoadingOverlayView`, satisfying the "same logo everywhere"
 * design requirement.
 *
 * Progress bar + stage-label rotation still run through the FrameScheduler
 * (they only update text / a CSS width, not a per-frame 3-D render, so their
 * occasional stutter during LONGTASKs is invisible to the user).
 */

import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
// §SPLASH-IS-ONE-COMPONENT (founder 2026-09-06) — the mesh gradient, the hero pyramid, the
// wordmark, the hairline track and the caption now live in ONE module, because the founder asked
// for THIS screen during site activation too and "same look" may only ever mean "same code"
// (L-12965: the palette that was defined twice and drifted). This file no longer owns any of
// those values; it owns the BOOT STAGE MACHINE that drives them.
import { buildPryzmSplashChrome } from '../overlays/PryzmSplashChrome';
// §UX3-LOADING-CHROME — the GPU pill (z 2147483000) floats ABOVE this overlay
// (z 99999) and initScene mounts it mid-boot, so without the gate it appears
// over the boot screen. Same mechanism as LoadingOverlayController: declare the
// moment; panelDefaults owns the decision, phaseChrome applies it.
import { pushLoadingChromeGate } from '../layout/panelDefaults';

const STAGES: { label: string; durationMs: number }[] = [
    { label: 'Downloading BIM engine…',   durationMs: 6000 },
    { label: 'Compiling 3D modules…',     durationMs: 6000 },
    { label: 'Initialising 3D scene…',    durationMs: 3000 },
    { label: 'Loading building tools…',   durationMs: 3000 },
    { label: 'Preparing workspace…',      durationMs: 500  },
];

const TOTAL_MS = STAGES.reduce((s, st) => s + st.durationMs, 0);

/**
 * §FIX-OVERLAY-DUP-ID (2026-05-19): monotonic counter used to mint a UNIQUE
 * FrameScheduler tick-listener id per overlay instance.
 *
 * `FrameScheduler.addTickListener` throws `duplicate id` if the same id is
 * registered twice (its contract — `FrameScheduler.ts:327` — is "each listener
 * must register a unique id"), and the scheduler exposes no `removeTickListener(id)`.
 * The engine-bootstrap overlay and the project-open overlay (`PlatformRouter
 * ._openProjectViaRuntime`) are SEPARATE instances that can be alive at the same
 * time; both calling `show()` with the constant id `engine-loading-progress`
 * made the second `addTickListener` throw — an uncaught promise rejection that
 * aborted project opening ("old projects don't open"). An instance-local
 * `stopProgressTimers()` cannot prevent it: a fresh instance has `rafHandle = null`.
 * Each instance now owns a distinct id, so two overlays never collide.
 */
let _overlayTickSeq = 0;

export class EngineLoadingOverlay {
    private el: HTMLElement | null = null;
    private progressBar: HTMLElement | null = null;
    private stageLabel: HTMLElement | null = null;
    private stageTimer: ReturnType<typeof setInterval> | null = null;
    private startTime = 0;
    private rafHandle: TickListenerDisposer | null = null;
    /** §FIX-OVERLAY-DUP-ID — unique per instance; never collides across overlays. */
    private readonly tickId = `engine-loading-progress-${++_overlayTickSeq}`;
    /** §UX3-LOADING-CHROME — held while this instance is visibly up. The gate is a
     *  COUNTER in panelDefaults, so two live instances (§FIX-OVERLAY-DUP-ID) never
     *  release each other's hold. */
    private releaseChromeGate: (() => void) | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.el = this.build();
        document.body.appendChild(this.el);
    }

    show(): void {
        if (!this.el) return;
        // Guard: dispose any in-flight tick listeners from a previous show() call
        // that was never followed by hide(). Without this, a rapid second project-open
        // calls addTickListener('engine-loading-progress', ...) while the previous
        // listener is still registered, causing a duplicate-ID throw that aborts bootstrap.
        this.stopProgressTimers();
        // §UX3-LOADING-CHROME — suppress overlay-hostile editor chrome (the GPU pill)
        // for as long as this boot screen is up. Idempotent per instance; must never
        // block the overlay itself.
        if (!this.releaseChromeGate) {
            try { this.releaseChromeGate = pushLoadingChromeGate(); } catch { /* non-fatal chrome */ }
        }
        this.el.style.display = 'flex';
        void this.el.offsetHeight;
        this.el.style.opacity = '1';
        this.startTime = Date.now();

        // §FIX-OVERLAY-RAF (2026-05-06): Prime the FrameScheduler before adding
        // tick listeners. The overlay appears before the engine ever calls
        // scheduler.start(), so the rAF pump may not be running yet.
        const sched = getFrameScheduler();
        if (!sched.isRunning) sched.start();

        this.startProgressAnimation();
        this.startStageRotation();
        // §PRYZM-LOGO-SPINNER: No pyramid RAF needed — CSS compositor drives the spin.
    }

    hide(): void {
        if (!this.el) return;
        // CONTRACT §5.1 — keep pyramid spinning until the very last moment.
        // Stop only the progress / stage-label timers here; the CSS pyramid
        // animation continues through the entire fade-out automatically.
        this.stopProgressTimers();
        if (this.progressBar) this.progressBar.style.width = '100%';
        if (this.stageLabel) {
            this.stageLabel.textContent = 'READY';
            this.stageLabel.classList.add('pryzm-splash-caption--ready');
        }
        const el = this.el;
        // §UX3-LOADING-CHROME — release when the overlay is actually GONE, not at the
        // start of its 1.3 s fade, so the pill never fades back in over the boot
        // screen's exit. Captured locally: `this.el` is nulled below and a second
        // hide() must not double-release (the release is idempotent anyway).
        const releaseGate = this.releaseChromeGate;
        this.releaseChromeGate = null;
        setTimeout(() => {
            el.style.transition = 'opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1)';
            el.style.opacity = '0';
            setTimeout(() => {
                el.remove();
                // CSS animation stops automatically when element leaves DOM.
                try { releaseGate?.(); } catch { /* non-fatal chrome */ }
            }, 750);
        }, 520);
        this.el = null;
    }

    showError(message: string): void {
        if (!this.el) return;
        // Keep the pyramid rotating while the error banner is visible.
        this.stopProgressTimers();
        if (this.progressBar) {
            this.progressBar.style.transition = 'width 0.3s ease, background 0.3s ease';
            this.progressBar.style.background = 'linear-gradient(90deg,#ef4444,#dc2626)';
            this.progressBar.style.width = '100%';
        }
        if (this.stageLabel) {
            this.stageLabel.style.opacity = '0';
            setTimeout(() => {
                if (!this.stageLabel) return;
                this.stageLabel.textContent = message;
                this.stageLabel.style.color = '#ef4444';
                this.stageLabel.style.transition = 'opacity 0.3s ease';
                this.stageLabel.style.opacity = '1';
            }, 150);
        }
        const btn = document.createElement('button');
        btn.textContent = 'Return to Hub';
        btn.style.cssText = [
            'margin-top:28px', 'padding:10px 28px',
            'background:linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%)',
            'color:#fff', 'border:none', 'border-radius:8px',
            'font-size:14px', 'font-weight:600', 'cursor:pointer',
            'font-family:inherit', 'letter-spacing:0.02em',
            'box-shadow:0 2px 12px rgba(102,0,255,0.25)',
            'transition:opacity 0.15s ease',
        ].join(';');
        btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.85'; });
        btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
        btn.addEventListener('click', () => {
            window.runtime?.events?.emit('pryzm-go-hub', {}); window.dispatchEvent(new Event('pryzm-go-hub')); // F.events.12 + §33-NAV-FIX
            this.hide();
        });
        this.el.appendChild(btn);
        setTimeout(() => this.hide(), 5_000);
    }

    transitionToProjectLoad(projectName: string): void {
        if (!this.el) return;
        // CONTRACT §5.1 — overlay must STAY VISIBLE (and animated) until
        // `pryzm-project-loaded` fires. Stop only the stage-label rotation and
        // progress-bar RAF; the CSS pyramid keeps spinning automatically.
        this.stopProgressTimers();
        if (this.progressBar) {
            this.progressBar.style.transition = 'width 0.4s ease';
            this.progressBar.style.width = '96%';
        }
        if (this.stageLabel) {
            this.stageLabel.style.opacity = '0';
            setTimeout(() => {
                if (!this.stageLabel) return;
                const displayName = projectName.length > 28
                    ? projectName.slice(0, 25) + '…' : projectName;
                this.stageLabel.textContent = `Opening "${displayName}"…`;
                this.stageLabel.style.transition = 'opacity 0.3s ease';
                this.stageLabel.style.opacity = '1';
            }, 150);
        }
    }

    // ── DOM construction ────────────────────────────────────────────────────

    private build(): HTMLElement {
        // §SPLASH-IS-ONE-COMPONENT — the whole visual is the SHARED chrome. The only thing this
        // overlay adds is its own id (the perf harness and `initScene` both key on it) and the
        // fade/positioning it drives in show()/hide(). Nothing about the look is defined here.
        const overlay = document.createElement('div');
        overlay.id = 'pryzm-engine-loading-overlay';
        overlay.className = 'pryzm-splash-ground pryzm-engine-splash';
        overlay.style.zIndex = '99999';
        overlay.style.display = 'none';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.36s cubic-bezier(0.22, 1, 0.36, 1)';

        const chrome = buildPryzmSplashChrome();
        this.progressBar = chrome.bar;
        this.stageLabel = chrome.caption;
        chrome.caption.textContent = STAGES[0].label;
        // The engine boot has no counter of its own to be honest ABOUT, so the meta row stays
        // empty and `:empty` collapses it — the boot screen is byte-for-byte photo 2.
        chrome.column.style.position = 'absolute';
        chrome.column.style.inset = '0';
        overlay.appendChild(chrome.column);
        return overlay;
    }

    // ── Progress & stage timers ─────────────────────────────────────────────

    private startProgressAnimation(): void {
        const animate = () => {
            if (!this.progressBar) return;
            const elapsed = Date.now() - this.startTime;
            const pct = Math.min((elapsed / TOTAL_MS) * 92, 92);
            this.progressBar.style.width = `${pct}%`;
            if (elapsed >= TOTAL_MS && this.rafHandle) {
                this.rafHandle();
                this.rafHandle = null;
            }
        };
        this.rafHandle = getFrameScheduler().addTickListener(
            this.tickId,   // §FIX-OVERLAY-DUP-ID — per-instance id, no cross-overlay collision
            animate,
            'overlay',
        );
    }

    private startStageRotation(): void {
        let stageIndex = 0, elapsed = 0;
        const tick = () => {
            if (!this.stageLabel) return;
            elapsed += 500;
            let acc = 0;
            for (let i = 0; i < STAGES.length; i++) {
                acc += STAGES[i].durationMs;
                if (elapsed <= acc) {
                    if (i !== stageIndex) {
                        stageIndex = i;
                        this.stageLabel.style.opacity = '0';
                        setTimeout(() => {
                            if (this.stageLabel) {
                                this.stageLabel.textContent = STAGES[i].label;
                                this.stageLabel.style.transition = 'opacity 0.3s ease';
                                this.stageLabel.style.opacity = '1';
                            }
                        }, 150);
                    }
                    break;
                }
            }
        };
        this.stageTimer = setInterval(tick, 500);
    }

    /**
     * Stops the progress-bar RAF and the stage-label rotation timer ONLY.
     * The CSS pyramid animation continues running (compositor-driven) so the
     * user keeps seeing the prism rotate while we wait for `pryzm-project-loaded`
     * (or the safety timeout). See CONTRACT §5.1 — the overlay must stay
     * visually alive.
     */
    private stopProgressTimers(): void {
        if (this.stageTimer !== null) { clearInterval(this.stageTimer); this.stageTimer = null; }
        if (this.rafHandle)           { this.rafHandle(); this.rafHandle = null; }
    }
}
