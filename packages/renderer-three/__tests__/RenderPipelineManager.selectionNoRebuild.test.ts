// §FIX-SSGI-DEFAULT-OFF-TRAA-SELECT-FLASH (founder L-59) — selection must NOT rebuild
// the post-FX pipeline.
//
// Context: the founder reported that clicking an element flashes the whole viewport
// BLACK for ~1s before recovering. A full pipeline rebuild recompiles the WebGPU TSL
// shader graph (SSGI/TRAA/outline nodes) — a heavy PSO compile that presents a black
// frame while it runs. The fix keeps SSGI/TRAA OFF by default (so the tier never drives
// activateTRAA → _rebuildPipelineWithCurrentState on a tier transition) AND relies on
// the selection path only mutating the live outline arrays in place.
//
// These tests pin that invariant at the RenderPipelineManager surface: updating the
// selected / hovered object arrays touches NONE of the rebuild entry points, so a
// selection can never trigger the shader recompile that flashes black.

import { describe, expect, it, vi } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

type RebuildSpies = {
    rebuildPipeline: ReturnType<typeof vi.fn>;
    rebuildWithState: ReturnType<typeof vi.fn>;
    fullRebuild: ReturnType<typeof vi.fn>;
    scheduleShadowRebuild: ReturnType<typeof vi.fn>;
};

/** Force the active-WebGPU state and replace every rebuild entry point with a spy so
 *  we can assert none of them fire on a selection update — without a real GPU. */
function spyRebuilds(rpm: RenderPipelineManager): RebuildSpies {
    (rpm as unknown as { _webGpuActive: boolean })._webGpuActive = true;
    const rebuildPipeline = vi.fn();
    const rebuildWithState = vi.fn().mockResolvedValue(undefined);
    const fullRebuild = vi.fn().mockResolvedValue(undefined);
    const scheduleShadowRebuild = vi.fn();
    const anyRpm = rpm as unknown as Record<string, unknown>;
    anyRpm._rebuildPipeline = rebuildPipeline;
    anyRpm._rebuildPipelineWithCurrentState = rebuildWithState;
    anyRpm._fullRebuild = fullRebuild;
    anyRpm.scheduleShadowRebuild = scheduleShadowRebuild;
    return { rebuildPipeline, rebuildWithState, fullRebuild, scheduleShadowRebuild };
}

function expectNoRebuild(spies: RebuildSpies): void {
    expect(spies.rebuildPipeline).not.toHaveBeenCalled();
    expect(spies.rebuildWithState).not.toHaveBeenCalled();
    expect(spies.fullRebuild).not.toHaveBeenCalled();
    expect(spies.scheduleShadowRebuild).not.toHaveBeenCalled();
}

describe('RenderPipelineManager selection -> NO pipeline rebuild (§FIX-...-TRAA-SELECT-FLASH, L-59)', () => {
    it('setSelectedObjects does not trigger any pipeline rebuild', () => {
        const rpm = new RenderPipelineManager();
        const spies = spyRebuilds(rpm);
        const obj = { isObject3D: true } as unknown as import('three').Object3D;
        rpm.setSelectedObjects([obj]);
        rpm.setSelectedObjects([]);
        rpm.setSelectedObjects([obj, obj]);
        expectNoRebuild(spies);
    });

    it('setHoveredObjects does not trigger any pipeline rebuild', () => {
        const rpm = new RenderPipelineManager();
        const spies = spyRebuilds(rpm);
        const obj = { isObject3D: true } as unknown as import('three').Object3D;
        rpm.setHoveredObjects([obj]);
        rpm.setHoveredObjects([]);
        expectNoRebuild(spies);
    });

    it('a select -> hover -> deselect sequence stays rebuild-free', () => {
        const rpm = new RenderPipelineManager();
        const spies = spyRebuilds(rpm);
        const a = { isObject3D: true } as unknown as import('three').Object3D;
        const b = { isObject3D: true } as unknown as import('three').Object3D;
        rpm.setSelectedObjects([a]);
        rpm.setHoveredObjects([b]);
        rpm.setHoveredObjects([]);
        rpm.setSelectedObjects([]);
        expectNoRebuild(spies);
    });
});
