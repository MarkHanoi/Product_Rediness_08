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

// ── ViewportCrashGuard ─────────────────────────────────────────────────────

export class ViewportCrashGuard {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private _active     = false;
    private _hasCrashed = false;

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
                console.warn('[ViewportCrashGuard] §I3 suppressed non-fatal GPU internal:', e.message.slice(0, 80));
                return;
            }
            if (this._hasCrashed) return;
            if (this._isRenderRelated(e.message ?? '')) {
                this._handleCrash(new Error(e.message), 'window.onerror (render context)');
            }
        };

        this._rejectionHandler = (e: PromiseRejectionEvent): void => {
            const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
            // §I3-USEDTIMES-SUPPRESS: same suppression for promise-rejection path.
            if (this._isKnownNonFatal(msg)) {
                e.preventDefault();
                console.warn('[ViewportCrashGuard] §I3 suppressed non-fatal GPU internal (rejection):', msg.slice(0, 80));
                return;
            }
            if (this._hasCrashed) return;
            const reason = e.reason instanceof Error
                ? e.reason
                : new Error(msg);
            if (this._isRenderRelated(reason.message)) {
                this._handleCrash(reason, 'unhandledrejection (render context)');
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

    private _handleCrash(error: Error, source: string): void {
        this._hasCrashed = true;

        console.error(`[ViewportCrashGuard] Viewport crash (${source}):`, error.message);

        if (typeof window.Sentry !== 'undefined') { // TODO(C.3.x): legacy Sentry — replace with runtime.telemetry (Sentry)
            window.Sentry.captureException(error); // TODO(C.3.x): legacy Sentry — replace with runtime.telemetry (Sentry)
        }

        const onRetry = (): void => {
            hideSceneCrashFallback();
            this._hasCrashed = false;

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
