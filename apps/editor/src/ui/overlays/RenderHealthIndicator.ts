/**
 * @file src/ui/overlays/RenderHealthIndicator.ts
 *
 * Vanilla TypeScript implementation of the RenderHealthIndicator UI badge.
 *
 * CONTRACT (08-ERROR-RESILIENCE-CRASH-RECOVERY §Mechanism 3):
 *  - Shows a subtle badge in the bottom-right viewport corner when the
 *    WebGPU render pipeline is degraded (retrying) or in error state.
 *  - Hidden when the pipeline is healthy ('ok').
 *  - Subscribes to RenderPipelineManager.onStateChange (injected at mount).
 *  - Does NOT show during WebGL fallback (status.webGpuActive === false) because
 *    the WebGL renderer has no TSL pipeline to degrade.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE §2):
 *  - CSS class prefix: `rhi-` (Render Health Indicator).
 *  - Styles live in AppTheme.ts (RHI_STYLES constant) — this file emits no
 *    inline <style> tags.
 *
 * CONTRACT (01-BIM-ENGINE-CORE §4.3):
 *  - No @thatopen/* imports.
 *  - No store mutations.
 *
 * Usage (EngineBootstrap.ts):
 *   const healthIndicator = new RenderHealthIndicator();
 *   healthIndicator.mount();
 *   renderPipelineManager.onStateChange = (status) => {
 *     healthIndicator.syncFromPipelineStatus(status);
 *   };
 */

import type { PipelineStatus } from '@pryzm/renderer-three';

// ── Health state ───────────────────────────────────────────────────────────

export type RenderHealthState = 'ok' | 'degraded' | 'error';

const BADGE_LABELS: Record<Exclude<RenderHealthState, 'ok'>, string> = {
    degraded: '⚠ Reduced quality mode',
    error:    '⚠ GPU error — reload recommended',
};

const RHI_BADGE_ID = 'rhi-badge';

// ── RenderHealthIndicator ──────────────────────────────────────────────────

export class RenderHealthIndicator {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private _el:    HTMLElement | null = null;
    private _state: RenderHealthState  = 'ok';

    // ── Lifecycle ──────────────────────────────────────────────────────────

    /**
     * Creates and appends the badge element.
     * Default parent is document.body — the badge is position:fixed so the
     * actual DOM parent does not affect its visual position.
     *
     * Idempotent — removes any existing badge first.
     */
    mount(parent: HTMLElement = document.body): void {
        this.unmount();

        const el = document.createElement('div');
        el.id          = RHI_BADGE_ID;
        el.className   = 'rhi-badge';
        el.dataset.state = 'ok';
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('role', 'status');
        el.style.display = 'none';   // hidden until a non-ok state is reported

        parent.appendChild(el);
        this._el = el;
    }

    /** Removes the badge from the DOM. */
    unmount(): void {
        document.getElementById(RHI_BADGE_ID)?.remove();
        this._el = null;
    }

    // ── State updates ──────────────────────────────────────────────────────

    /**
     * Directly set the health state.
     * 'ok' → badge hidden.
     * 'degraded' | 'error' → badge visible with appropriate label.
     */
    update(state: RenderHealthState): void {
        if (this._state === state) return;
        this._state = state;

        if (!this._el) return;

        if (state === 'ok') {
            this._el.style.display = 'none';
            this._el.textContent   = '';
            this._el.dataset.state = 'ok';
            return;
        }

        this._el.dataset.state   = state;
        this._el.textContent     = BADGE_LABELS[state];
        this._el.style.display   = 'block';
    }

    /**
     * Convenience method — derives the health state directly from a
     * PipelineStatus snapshot and calls update().
     *
     * Called from RenderPipelineManager.onStateChange.
     *
     * State derivation:
     *  - WebGPU inactive → 'ok' (WebGL has no pipeline to degrade)
     *  - phase === 'error' → 'error'
     *  - retryCount > 0 and phase !== 'error' → 'degraded' (recovering)
     *  - everything else → 'ok'
     */
    syncFromPipelineStatus(status: PipelineStatus): void {
        if (!status.webGpuActive) {
            this.update('ok');
            return;
        }
        if (status.phase === 'error') {
            this.update('error');
        } else if (status.retryCount > 0) {
            this.update('degraded');
        } else {
            this.update('ok');
        }
    }

    /** Current health state. */
    get state(): RenderHealthState { return this._state; }
}
