/**
 * §FIX-ONCE-IMPORT-EVERYWHERE (ADR-0297 / ADR-0302) — `onViewportResize()` is the
 * narrow entry point for a viewport GEOMETRY change.
 *
 * WHY IT EXISTS. `initScene.ts` routed every viewport-geometry change — a
 * `window.resize` listener AND a `ResizeObserver` on `#container` — into
 * `onProjectSwitch()`, which additionally runs `scheduleShadowRebuild()`: a full
 * pipeline dispose + `createScenePass()` recomposition with WebGPU submits paused,
 * measured at 1,862 ms on the founder's 445-mesh project. The founder's Cesium log
 * shows the container oscillating 677 → 678 → 677 px, each oscillation taking that
 * path. Opening the property inspector bought a multi-second shadow reconstruction.
 *
 * ADR-0297 already forbade borrowing `onProjectSwitch()` for RECOVERY
 * (`ViewportCrashGuardRecoveryLever.test.ts:79` pins "NEVER via onProjectSwitch()").
 * The resize subscription was the same defect one call-site over, never audited
 * under the rule. These tests pin the rule for resize so it is not re-derived a
 * fourth time.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** WebGPU-shaped renderer whose canvas and backing store can disagree. */
function fakeRenderer(canvas: { w: number; h: number }, backing: { w: number; h: number }) {
    const setSizeCalls: Array<{ w: number; h: number }> = [];
    return {
        isWebGPURenderer: true,
        backend: { isWebGPUBackend: true },
        domElement: { clientWidth: canvas.w, clientHeight: canvas.h, width: backing.w, height: backing.h },
        getSize: (t: any) => { if (t?.set) { t.set(backing.w, backing.h); return t; } return { x: backing.w, y: backing.h }; },
        getDrawingBufferSize: (t: any) => { if (t?.set) { t.set(backing.w, backing.h); return t; } return { x: backing.w, y: backing.h }; },
        setSize: (w: number, h: number) => { setSizeCalls.push({ w, h }); backing.w = w; backing.h = h; },
        __setSizeCalls: setSizeCalls,
    };
}

function armed(canvasW: number, canvasH: number, backingW: number, backingH: number) {
    const rpm = new RenderPipelineManager() as any;
    rpm._webGpuActive = true;
    rpm._renderer = fakeRenderer({ w: canvasW, h: canvasH }, { w: backingW, h: backingH });
    // Observable, so we can prove a resize does NOT reach into them.
    rpm.scheduleShadowRebuild = vi.fn();
    rpm._rebuildPipeline      = vi.fn(async () => { /* noop */ });
    rpm.onProjectSwitch       = vi.fn();
    return rpm;
}

describe('RenderPipelineManager.onViewportResize — does only what a resize requires', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

    it('reconciles the renderer backing store to the canvas', () => {
        const rpm = armed(1200, 900, 1180, 900);

        expect(rpm.onViewportResize()).toBe(true);

        expect(rpm._renderer.__setSizeCalls).toEqual([{ w: 1200, h: 900 }]);
    });

    it('NEVER schedules a shadow rebuild — the 1,862 ms cost this removes', () => {
        const rpm = armed(1200, 900, 1180, 900);

        rpm.onViewportResize();

        // A shadow map's resolution is light.shadow.mapSize — a function of QUALITY
        // TIER, not of viewport size. Reallocating it on resize bought no
        // correctness, and reallocating it is exactly what destroyed a
        // ShadowDepthTexture mid-submit (§GPU-RESOURCE-LIFETIME).
        expect(rpm.scheduleShadowRebuild).not.toHaveBeenCalled();
    });

    it('NEVER rebuilds the pipeline and NEVER borrows onProjectSwitch (ADR-0297)', () => {
        const rpm = armed(1200, 900, 1180, 900);

        rpm.onViewportResize();

        // Post-FX targets need no help: PassNode.updateBefore calls renderer.getSize()
        // and cascades setSize to its render target on EVERY frame
        // (three/src/nodes/display/PassNode.js:788-794).
        expect(rpm._rebuildPipeline).not.toHaveBeenCalled();
        expect(rpm.onProjectSwitch).not.toHaveBeenCalled();
    });

    it('reports false — honestly — when the renderer already matches the canvas', () => {
        const rpm = armed(1200, 900, 1200, 900);

        expect(rpm.onViewportResize()).toBe(false);

        expect(rpm._renderer.__setSizeCalls).toHaveLength(0);
    });

    it("survives the founder's 677 → 678 → 677 oscillation at trivial cost", () => {
        const rpm = armed(677, 981, 677, 981);

        rpm._renderer.domElement.clientWidth = 678;
        expect(rpm.onViewportResize()).toBe(true);
        rpm._renderer.domElement.clientWidth = 677;
        expect(rpm.onViewportResize()).toBe(true);

        // Two setSize calls total — versus two full shadow reconstructions before.
        expect(rpm._renderer.__setSizeCalls).toEqual([{ w: 678, h: 981 }, { w: 677, h: 981 }]);
        expect(rpm.scheduleShadowRebuild).not.toHaveBeenCalled();
    });

    it('declines a 0×0 canvas rather than resizing to zero', () => {
        // A collapsed / not-yet-laid-out pane: resizing to zero would itself produce
        // "Attachment has zero size". render()'s own gate skips the submit until
        // layout lands.
        const rpm = armed(0, 0, 1200, 900);

        expect(rpm.onViewportResize()).toBe(false);
        expect(rpm._renderer.__setSizeCalls).toHaveLength(0);
    });

    it('is safe before bind() and on the WebGL path (no renderer bound)', () => {
        const rpm = new RenderPipelineManager() as any;
        expect(() => rpm.onViewportResize()).not.toThrow();
        expect(rpm.onViewportResize()).toBe(false);
    });

    it('a throwing reconcile can never break the frame loop', () => {
        const rpm = armed(1200, 900, 1180, 900);
        rpm._reconcileRenderSize = () => { throw new Error('layout exploded'); };

        expect(() => rpm.onViewportResize()).not.toThrow();
        expect(rpm.onViewportResize()).toBe(false);
    });
});
