/**
 * @file src/ui/primitives/ViewportCrashGuard.ts
 *
 * Vanilla TypeScript analog of a React ErrorBoundary around the 3D viewport.
 *
 * CONTRACT (08-ERROR-RESILIENCE-CRASH-RECOVERY §Mechanism 1):
 *  - Detects unhandled render-loop errors via window 'error' and
 *    'unhandledrejection' events, filtered to GPU/rendering keywords.
 *  - Also accepts explicit crash notifications from RenderPipelineManager
 *    (phase === 'error') via handlePipelineError().
 *  - On crash: shows SceneCrashFallback.  Toolbar, sidebar, and AI panel
 *    remain fully functional — only the canvas overlay is covered.
 *  - "Reload viewport" button attempts soft recovery via
 *    window.renderPipelineManager.onProjectSwitch(); falls back to hard reload.
 *
 * CONTRACT (01-BIM-ENGINE-CORE §4.3):
 *  - No @thatopen/* imports.
 *  - No direct store mutations.
 *
 * Usage (EngineBootstrap.ts):
 *   const guard = new ViewportCrashGuard();
 *   guard.activate();
 *   renderPipelineManager.onStateChange = (s) => {
 *     if (s.phase === 'error') guard.handlePipelineError();
 *   };
 */

import { showSceneCrashFallback, hideSceneCrashFallback } from '../fallbacks/SceneCrashFallback';

// ── GPU/render error keywords (case-insensitive) ───────────────────────────

const RENDER_ERROR_KEYWORDS: string[] = [
    'webgpu', 'webgl', 'gpu', 'shader', 'pipeline',
    'context lost', 'wgsl', 'gpudevice', 'renderer',
    'renderpipeline', 'postprocessing', 'tsl', 'three',
];

// §I3-USEDTIMES-SUPPRESS: Errors that match these substrings are known non-fatal
// THREE WebGPU internal errors that must be suppressed before they reach the crash
// guard (which would show the SceneCrashFallback overlay unnecessarily).
//
// Root cause: when a Three.js renderObject is disposed after a project-switch or
// Escape/deactivateAll, its internal onDispose callback fires
// NodeManager.delete(renderObject). The new session's NodeManager has no record
// of the stale renderObject (it belongs to the previous GPU session), so
// this.nodes.get(renderObject) returns undefined and THREE reads .usedTimes on it.
//   "Cannot read properties of undefined (reading 'usedTimes')"
//   at NodeManager.delete (three.webgpu.js:53547)
// The error is non-fatal: the old GPU resource is already reclaimed. Showing the
// crash overlay would confuse users because the viewport is fully functional.
const KNOWN_NONFATAL_KEYWORDS: string[] = [
    'usedtimes',
];

// §GPU-RESOURCE-LIFETIME (ADR-0281) — SUPPRESSION MUST BE ACCOUNTED.
//
// The `usedtimes` suppression above was written for a genuinely non-fatal case: a
// stale render object from a PREVIOUS GPU session being torn down after a project
// switch. That reasoning is sound ONCE. It is NOT sound at volume: `usedTimes` is
// the dispose-time symptom of the same defect family as the founder's
// `setIndexBuffer … not of type 'GPUBuffer'` hard stop — a GPU resource released
// while the renderer still referenced it. A guard that swallows that signal
// silently, forever, with `preventDefault()`, is itself a defect: it is exactly
// how a fatal resource-lifetime bug reaches production looking like nothing at all
// (the founder saw a blocked scene and blank thumbnails, and no error).
//
// Policy: keep suppressing the OVERLAY (a single stale-session teardown must not
// bounce the user), but COUNT the suppressions. A burst above the threshold inside
// the window is not teardown noise — it is a live resource-lifetime fault — and is
// escalated to the normal render-failure path so it can surface and be diagnosed.
const NONFATAL_BURST_THRESHOLD  = 12;
const NONFATAL_BURST_WINDOW_MS  = 2000;

// §VCG-CONSECUTIVE-FRAME-GUARD: A SINGLE render-related throw is almost never a
// real, persistent viewport crash. Heavy WebGL2 scenes (e.g. a 5-storey
// residential building with the analysis side-panel open) routinely emit a
// one-off transient throw from a shadow update, an analysis overlay, or a
// stale render target left behind by a live renderer-swap / level operation —
// the very next frame renders fine. Showing the hard crash dialog on the first
// such throw is a false positive that bounces the founder back to the hub.
//
// We therefore COUNT consecutive render-related throws and only escalate to the
// crash dialog once we cross the threshold inside a short window. Any throw that
// is NOT followed by another render-related throw within RESET_WINDOW_MS resets
// the streak (one-off throws are swallowed + logged, never crashed on).
const CONSECUTIVE_CRASH_THRESHOLD = 4;
const CONSECUTIVE_RESET_WINDOW_MS = 4000;

// ── ViewportCrashGuard ─────────────────────────────────────────────────────

export class ViewportCrashGuard {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private _active     = false;
    private _hasCrashed = false;

    // §VCG-CONSECUTIVE-FRAME-GUARD state.
    private _consecutiveFailures = 0;
    private _lastFailureAt       = 0;

    // §GPU-RESOURCE-LIFETIME (ADR-0281) — accounted suppression state.
    private _nonFatalSuppressed  = 0;
    private _nonFatalWindowStart = 0;

    /** Total non-fatal GPU internals suppressed this session (diagnostics/tests). */
    get suppressedNonFatalCount(): number { return this._nonFatalSuppressed; }

    private _errorHandler?:     (e: ErrorEvent) => void;
    private _rejectionHandler?: (e: PromiseRejectionEvent) => void;

    // ── Lifecycle ──────────────────────────────────────────────────────────

    /**
     * Starts listening for unhandled render-loop errors.
     * Idempotent — safe to call multiple times.
     */
    activate(): void {
        if (this._active) return;
        this._active = true;

        this._errorHandler = (e: ErrorEvent): void => {
            // §I3-USEDTIMES-SUPPRESS: Swallow known non-fatal THREE WebGPU internal
            // errors entirely (preventDefault marks the event as handled so the browser
            // does not log them to the console or report them as unhandled).
            if (this._isKnownNonFatal(e.message ?? '')) {
                e.preventDefault();
                const realError = e.error instanceof Error ? e.error : new Error(e.message ?? '');
                // §GPU-RESOURCE-LIFETIME (ADR-0281) — accounted, not silent.
                this._recordNonFatalSuppression(realError, 'window.onerror');
                return;
            }
            if (this._hasCrashed) return;
            if (this._isRenderRelated(e.message ?? '')) {
                // §VCG-DIAGNOSTIC: surface the REAL error (with the original
                // Error object + stack when the browser gives us one via
                // e.error) so the true cause is visible in prod, not just dev.
                const realError = e.error instanceof Error ? e.error : new Error(e.message);
                this._recordRenderFailure(realError, 'window.onerror (render context)');
            }
        };

        this._rejectionHandler = (e: PromiseRejectionEvent): void => {
            const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
            // §I3-USEDTIMES-SUPPRESS: same suppression for promise-rejection path.
            if (this._isKnownNonFatal(msg)) {
                e.preventDefault();
                const reason = e.reason instanceof Error ? e.reason : new Error(msg);
                // §GPU-RESOURCE-LIFETIME (ADR-0281) — accounted, not silent.
                this._recordNonFatalSuppression(reason, 'unhandledrejection');
                return;
            }
            if (this._hasCrashed) return;
            const reason = e.reason instanceof Error
                ? e.reason
                : new Error(msg);
            if (this._isRenderRelated(reason.message)) {
                this._recordRenderFailure(reason, 'unhandledrejection (render context)');
            }
        };

        window.addEventListener('error', this._errorHandler);
        window.addEventListener('unhandledrejection', this._rejectionHandler);

        console.log('[ViewportCrashGuard] Activated — monitoring viewport render errors.');
    }

    /**
     * Stops error monitoring and hides any visible crash fallback.
     */
    deactivate(): void {
        if (!this._active) return;
        if (this._errorHandler)     window.removeEventListener('error', this._errorHandler);
        if (this._rejectionHandler) window.removeEventListener('unhandledrejection', this._rejectionHandler);
        this._active     = false;
        this._hasCrashed = false;
        this._consecutiveFailures = 0;
        this._lastFailureAt       = 0;
        this._nonFatalSuppressed  = 0;
        this._nonFatalWindowStart = 0;
        hideSceneCrashFallback();
        console.log('[ViewportCrashGuard] Deactivated.');
    }

    // ── Explicit crash notification ────────────────────────────────────────

    /**
     * Called by external code (e.g. RenderPipelineManager.onStateChange)
     * when the pipeline enters a permanent error state (retries exhausted).
     *
     * This does NOT trigger for soft degradation (retryCount > 0) — only for
     * the final `phase === 'error'` state after all retries are consumed.
     *
     * @param error — Optional error to display in development mode.
     */
    handlePipelineError(error?: Error): void {
        if (this._hasCrashed) return;
        this._handleCrash(
            error ?? new Error('Render pipeline retries exhausted — phase=error'),
            'RenderPipelineManager.onStateChange (phase=error)',
        );
    }

    // ── Private ────────────────────────────────────────────────────────────

    /**
     * §VCG-CONSECUTIVE-FRAME-GUARD + §VCG-DIAGNOSTIC.
     *
     * Records a render-related throw caught from the window 'error' /
     * 'unhandledrejection' listeners. ALWAYS logs the real caught error + stack
     * to the console (tagged) so the true cause is visible in production — the
     * old code only displayed it in dev mode, hiding it from the founder.
     *
     * A single transient throw is swallowed (logged only). The crash dialog is
     * shown only after CONSECUTIVE_CRASH_THRESHOLD render-related throws arrive
     * within CONSECUTIVE_RESET_WINDOW_MS of each other — a genuinely persistent
     * render failure. A gap longer than the window resets the streak.
     */
    /**
     * §GPU-RESOURCE-LIFETIME (ADR-0281) — record a suppressed "known non-fatal"
     * GPU internal, and ESCALATE when they arrive as a burst.
     *
     * One (or a few) `usedTimes` throws after a project switch really are stale
     * previous-session teardown, and the overlay must stay hidden. A BURST of them
     * is a live resource-lifetime fault — a resource being released while the
     * renderer still references it — and it is the leading indicator of exactly the
     * class of failure that blocked the founder's scene. Escalating routes it into
     * `_recordRenderFailure`, which logs the real error + stack and (only if the
     * failures then persist frame-after-frame) shows the crash dialog.
     */
    private _recordNonFatalSuppression(error: Error, source: string): void {
        const now = Date.now();
        if (now - this._nonFatalWindowStart > NONFATAL_BURST_WINDOW_MS) {
            this._nonFatalWindowStart = now;
            this._nonFatalSuppressed  = 0;
        }
        this._nonFatalSuppressed++;

        if (this._nonFatalSuppressed <= NONFATAL_BURST_THRESHOLD) {
            console.warn(
                `[ViewportCrashGuard] §I3 suppressed non-fatal GPU internal (${source}) ` +
                `${this._nonFatalSuppressed}/${NONFATAL_BURST_THRESHOLD}:`,
                error.message.slice(0, 80),
            );
            return;
        }

        console.error(
            `[ViewportCrashGuard] §GPU-RESOURCE-LIFETIME ${this._nonFatalSuppressed} "non-fatal" GPU ` +
            `internals in ${NONFATAL_BURST_WINDOW_MS}ms — this is NOT stale-session teardown noise, it is ` +
            'a live resource-lifetime fault (a GPU resource released while the renderer still referenced ' +
            'it). Escalating instead of suppressing.',
            error,
        );
        this._recordRenderFailure(error, `${source} (non-fatal burst ×${this._nonFatalSuppressed})`);
    }

    private _recordRenderFailure(error: Error, source: string): void {
        if (this._hasCrashed) return;

        const now = Date.now();
        if (now - this._lastFailureAt > CONSECUTIVE_RESET_WINDOW_MS) {
            // Streak broken (or first failure) — start a fresh count.
            this._consecutiveFailures = 0;
        }
        this._consecutiveFailures++;
        this._lastFailureAt = now;

        // ALWAYS surface the real error + stack (prod + dev), tagged so the
        // founder can copy it out of the console when reporting.
        console.error(
            `[ViewportCrashGuard] caught render error (${source}) — ` +
            `consecutive ${this._consecutiveFailures}/${CONSECUTIVE_CRASH_THRESHOLD}:`,
            error,
        );

        if (this._consecutiveFailures < CONSECUTIVE_CRASH_THRESHOLD) {
            // Transient — swallow + log, keep the viewport alive. The next clean
            // frame (no further throw within the window) clears the streak.
            console.warn(
                '[ViewportCrashGuard] Transient render error swallowed — ' +
                'viewport kept alive (not a persistent crash yet).',
            );
            return;
        }

        // Threshold crossed — this is a persistent, frame-after-frame failure.
        this._handleCrash(error, `${source} ×${this._consecutiveFailures}`);
    }

    private _handleCrash(error: Error, source: string): void {
        this._hasCrashed = true;

        // §VCG-DIAGNOSTIC: log the FULL error object + stack (not just .message)
        // so the true failing render path is recoverable from the prod console.
        console.error(`[ViewportCrashGuard] Viewport crash (${source}):`, error);
        if (error.stack) console.error('[ViewportCrashGuard] stack:', error.stack);

        if (typeof window.Sentry !== 'undefined') { // TODO(C.3.x): legacy Sentry — replace with runtime.telemetry (Sentry)
            window.Sentry.captureException(error); // TODO(C.3.x): legacy Sentry — replace with runtime.telemetry (Sentry)
        }

        const onRetry = (): void => {
            hideSceneCrashFallback();
            this._hasCrashed = false;
            // Reset the consecutive-failure streak so a recovered viewport
            // starts from a clean slate (and is not one throw away from re-crash).
            this._consecutiveFailures = 0;
            this._lastFailureAt       = 0;

            // Prefer soft recovery: rebuild the RPM pipeline (clears outline arrays,
            // disposes GPU targets, schedules a pipeline rebuild).
            const rpm = window.renderPipelineManager; // TODO(D.4): legacy renderPipelineManager — replace with runtime.scene.renderer.pipeline
            if (rpm && typeof rpm.onProjectSwitch === 'function') {
                try {
                    rpm.onProjectSwitch();
                    console.log('[ViewportCrashGuard] Soft recovery initiated via RPM.onProjectSwitch().');
                } catch {
                    window.location.reload();
                }
            } else {
                window.location.reload();
            }
        };

        showSceneCrashFallback({ error, onRetry });
    }

    private _isRenderRelated(message: string): boolean {
        const lc = message.toLowerCase();
        // §I3-USEDTIMES-SUPPRESS: skip known non-fatal THREE WebGPU internals.
        if (KNOWN_NONFATAL_KEYWORDS.some(kw => lc.includes(kw))) return false;
        return RENDER_ERROR_KEYWORDS.some(kw => lc.includes(kw));
    }

    private _isKnownNonFatal(message: string): boolean {
        const lc = message.toLowerCase();
        return KNOWN_NONFATAL_KEYWORDS.some(kw => lc.includes(kw));
    }
}
