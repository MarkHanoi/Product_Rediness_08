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
 * shown in `BatchLoadingIndicator`, satisfying the "same logo everywhere"
 * design requirement.
 *
 * Progress bar + stage-label rotation still run through the FrameScheduler
 * (they only update text / a CSS width, not a per-frame 3-D render, so their
 * occasional stutter during LONGTASKs is invisible to the user).
 */

import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { createPryzmLogoSpinner } from '../overlays/PryzmLogoSpinner';

const STAGES: { label: string; durationMs: number }[] = [
    { label: 'Downloading BIM engine…',   durationMs: 6000 },
    { label: 'Compiling 3D modules…',     durationMs: 6000 },
    { label: 'Initialising 3D scene…',    durationMs: 3000 },
    { label: 'Loading building tools…',   durationMs: 3000 },
    { label: 'Preparing workspace…',      durationMs: 500  },
];

const TOTAL_MS = STAGES.reduce((s, st) => s + st.durationMs, 0);

export class EngineLoadingOverlay {
    private el: HTMLElement | null = null;
    private progressBar: HTMLElement | null = null;
    private stageLabel: HTMLElement | null = null;
    private stageTimer: ReturnType<typeof setInterval> | null = null;
    private startTime = 0;
    private rafHandle: TickListenerDisposer | null = null;

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
            this.stageLabel.classList.add('pryzm-loader-ready');
        }
        const el = this.el;
        setTimeout(() => {
            el.style.transition = 'opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1)';
            el.style.opacity = '0';
            setTimeout(() => {
                el.remove();
                // CSS animation stops automatically when element leaves DOM.
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
            window.runtime?.events?.emit('pryzm-go-hub', {}); // F.events.12
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
        this.ensureStyles();

        const overlay = document.createElement('div');
        overlay.id = 'pryzm-engine-loading-overlay';
        overlay.className = 'pryzm-loader-overlay';

        // ── Pyramid — centered, scaled to fill the hero slot ──
        // §PRYZM-LOGO-SPINNER: CSS 3-D pyramid on compositor thread.
        // MIAW proportions: pyramid centered above the wordmark, 2.8× larger.
        const spinner = createPryzmLogoSpinner('lg');
        spinner.classList.add('pryzm-loader-pyramid-slot');

        // ── Wordmark below pyramid ──
        const wordmark = document.createElement('div');
        wordmark.className = 'pryzm-loader-wordmark';
        wordmark.innerHTML = `<span class="pryzm-loader-name">PRYZM</span>`;

        // ── Progress ──
        const track = document.createElement('div');
        track.className = 'pryzm-loader-track';
        const bar = document.createElement('div');
        bar.className = 'pryzm-loader-bar';
        track.appendChild(bar);
        this.progressBar = bar;

        const label = document.createElement('div');
        label.className = 'pryzm-loader-label';
        label.textContent = STAGES[0].label;
        this.stageLabel = label;

        // Stacked layout — pyramid → PRYZM → progress → label
        overlay.appendChild(spinner);
        overlay.appendChild(wordmark);
        overlay.appendChild(track);
        overlay.appendChild(label);
        return overlay;
    }

    // ── Styles ──────────────────────────────────────────────────────────────

    private ensureStyles(): void {
        if (document.getElementById('pryzm-engine-loading-style')) return;
        const style = document.createElement('style');
        style.id = 'pryzm-engine-loading-style';
        style.textContent = `
            /* ── MIAW-proportioned loading screen ─────────────────────────────
             * Pastel mesh gradient background (static snapshot of lp4-mesh-flow)
             * matches the landing page palette so the transition feels seamless.
             * Pyramid is centred large (2.8× scale), PRYZM wordmark below,
             * thin progress bar + stage label below that — matching MIAW layout.
             */
            .pryzm-loader-overlay {
                position: fixed; inset: 0; z-index: 99999;
                display: none; opacity: 0;
                flex-direction: column; align-items: center; justify-content: center;
                background:
                    radial-gradient(ellipse at 22% 44%, #c8b6ff 0%, transparent 54%),
                    radial-gradient(ellipse at 72% 22%, #daceff 0%, transparent 52%),
                    radial-gradient(ellipse at 58% 78%, #b8a2ff 0%, transparent 48%),
                    radial-gradient(ellipse at 38% 72%, #ece7ff 0%, transparent 50%),
                    #f3f0ff;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                transition: opacity 0.36s cubic-bezier(0.22, 1, 0.36, 1);
                user-select: none; overflow: hidden;
            }

            /* ── Pyramid slot — scaled 2.8× to fill the hero position ──────
             * The lg spinner is 44×56 px base; at 2.8× it becomes ~123×157 px.
             * overflow:visible lets the shadow extend beyond the bounding box.
             * margin-bottom provides breathing room before the PRYZM wordmark.
             */
            .pryzm-loader-pyramid-slot {
                transform: scale(2.8);
                transform-origin: center center;
                margin-bottom: 52px;
                overflow: visible;
                flex-shrink: 0;
                opacity: 0;
                animation: pryzm-fade-in 0.9s cubic-bezier(0.22,1,0.36,1) 0.08s forwards;
            }

            .pryzm-loader-wordmark {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                margin-bottom: 32px;
                opacity: 0;
                animation: pryzm-fade-in 0.9s cubic-bezier(0.22,1,0.36,1) 0.22s forwards;
            }
            .pryzm-loader-name {
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
                font-size: clamp(28px, 5vw, 40px);
                font-weight: 700;
                letter-spacing: 8px;
                color: rgba(60,30,120,0.82);
                line-height: 1;
            }
            .pryzm-loader-track {
                position: relative; z-index: 1;
                width: min(200px, 48vw); height: 1.5px;
                background: rgba(100,60,200,0.12); border-radius: 999px; overflow: hidden;
                margin-bottom: 12px;
                opacity: 0;
                animation: pryzm-fade-in 0.7s ease 0.36s forwards;
            }
            .pryzm-loader-bar {
                height: 100%; width: 0%;
                background: linear-gradient(90deg, #8B5CF6 0%, #6600FF 100%);
                border-radius: inherit;
                transition: width 0.44s cubic-bezier(0.22,1,0.36,1);
                box-shadow: 0 0 8px rgba(102,0,255,0.45);
            }
            .pryzm-loader-label {
                position: relative; z-index: 1;
                min-height: 16px; font-size: 10px; font-weight: 500;
                letter-spacing: 0.22em; text-transform: uppercase;
                color: rgba(80,60,140,0.58);
                transition: opacity 0.3s ease;
                opacity: 0;
                animation: pryzm-fade-in 0.7s ease 0.44s forwards;
            }
            .pryzm-loader-ready { color: rgba(80,60,140,0.72); letter-spacing: 0.26em; }
            @keyframes pryzm-fade-in {
                from { opacity: 0; transform: translateY(-10px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            @media (max-width: 520px) {
                .pryzm-loader-pyramid-slot { transform: scale(2.0); margin-bottom: 40px; }
                .pryzm-loader-name  { font-size: 26px; letter-spacing: 5px; }
            }
            @media (prefers-reduced-motion: reduce) {
                .pryzm-loader-pyramid-slot,
                .pryzm-loader-wordmark,
                .pryzm-loader-track,
                .pryzm-loader-label { animation-duration: 0.001ms !important; }
            }
        `;
        document.head.appendChild(style);
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
            'engine-loading-progress',
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
