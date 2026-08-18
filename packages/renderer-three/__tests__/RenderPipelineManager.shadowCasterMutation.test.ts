// §FIX-SHADOW-TIER-CASTER-DESTROY (founder L-908) — ordering a shadow CASTER-SET change
// against submission.
//
// L-908 is the unexplained FIRST fault of L-930. L-930's entry says of its own log: "Step 2
// is a recovery from an EARLIER render failure that is not in the captured log — that first
// fault is itself unexplained." L-908 IS that first fault, captured WITH its trigger (a
// generation batch + `batchAutoFrame`). §L930-DETACH-BEFORE-FREE closed the SECOND fault and
// said so ("§RECOVERY-MUST-REFUSE is untouched … It should simply no longer be REACHED").
//
// WHY A FREEZE IS THE WRONG LEVER HERE — the thing these tests exist to stop anyone
// "simplifying" back:
//   setShadowReallocFrozen / setShadowPassSuppressed set autoUpdate=false, which suppresses
//   the depth PASS. Right for a mapSize realloc. Useless for a caster-set change: when a
//   light stops casting, three's AnalyticLightNode drops its ShadowNode and releases the
//   ShadowDepthTexture on its OWN schedule inside the next render(). There is no depth pass
//   left to suppress, so freezing defers nothing. Only PAUSING SUBMITS orders that release
//   against the frames still in flight.
//
// These tests pin:
//   (1) submits are paused for the DURATION of the mutation (the load-bearing invariant);
//   (2) the resume is DEFERRED, never synchronous — a synchronous resume puts the next
//       frame, and three's release with it, back inside the window it was moved out of;
//   (3) NOTHING is disposed or destroyed — this orders three's release, it never performs
//       one (ADR-0111 / C04 §SHADOW rule 6; ADR-0297 INVARIANT L2);
//   (4) it COMPOSES with the existing freeze latches via the shared ref-count rather than
//       adding a fifth independent one;
//   (5) a throwing mutation never strands the viewport paused;
//   (6) it is inert on the WebGL2 fallback (which owns its own shadowMap).

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** A fake renderer.shadowMap that records every mutation + any dispose/destroy. */
function makeFakeRenderer() {
    const disposeSpy = vi.fn();
    const destroySpy = vi.fn();
    const shadowMap = {
        autoUpdate: true,
        needsUpdate: false,
        // A mid-submit shadow-texture destroy is exactly the crash — these MUST NOT fire.
        dispose: disposeSpy,
        map: { dispose: destroySpy, destroy: destroySpy },
    };
    return { shadowMap, disposeSpy, destroySpy };
}

/** Force the manager into active-WebGPU state with a fake renderer, no real GPU. */
function armWebGpu(rpm: RenderPipelineManager, renderer: unknown): void {
    (rpm as unknown as { _webGpuActive: boolean })._webGpuActive = true;
    (rpm as unknown as { _renderer: unknown })._renderer = renderer;
}

/** The boolean `render()` actually gates the WebGPU submit on. */
function submitsPaused(rpm: RenderPipelineManager): boolean {
    return (rpm as unknown as { _shadowRebuildPaused: boolean })._shadowRebuildPaused;
}

/** The shared ref-count the freeze latches compose through. */
function freezeDepth(rpm: RenderPipelineManager): number {
    return (rpm as unknown as { _shadowReallocFreezeDepth: number })._shadowReallocFreezeDepth;
}

describe('RenderPipelineManager.runShadowCasterMutation (§FIX-SHADOW-TIER-CASTER-DESTROY)', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('pauses WebGPU submits for the DURATION of the caster-set mutation', () => {
        const rpm = new RenderPipelineManager();
        armWebGpu(rpm, { shadowMap: makeFakeRenderer().shadowMap });

        let pausedDuringFlip: boolean | null = null;
        expect(submitsPaused(rpm)).toBe(false);

        rpm.runShadowCasterMutation(() => {
            // This thunk stands in for `keyLight.castShadow = false`. If a frame can be
            // submitted at THIS instant, three's release lands mid-submit — the crash.
            pausedDuringFlip = submitsPaused(rpm);
        });

        expect(pausedDuringFlip).toBe(true);
    });

    it('freezes the map too, and NEVER disposes or destroys it', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap, disposeSpy, destroySpy } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        rpm.runShadowCasterMutation(() => { /* flip */ });

        // Frozen while the window is open — the map is REUSED, never reallocated.
        expect(shadowMap.autoUpdate).toBe(false);
        // The whole family is destroy-in-submit. This primitive orders three's release;
        // it must never perform one itself.
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();
    });

    it('the resume is DEFERRED, not synchronous (the ordering, stated as a test)', () => {
        const rpm = new RenderPipelineManager();
        armWebGpu(rpm, { shadowMap: makeFakeRenderer().shadowMap });

        rpm.runShadowCasterMutation(() => { /* flip */ });

        // Still paused after the call returns — a synchronous resume would let the very
        // next frame carry three's release back into the window a pre-pause submit may
        // still occupy. That is the defect, so this assertion is the fix.
        expect(submitsPaused(rpm)).toBe(true);

        vi.advanceTimersToNextTimer();
        expect(submitsPaused(rpm)).toBe(false);   // T+1: submits resume

        vi.advanceTimersToNextTimer();
        expect(freezeDepth(rpm)).toBe(0);         // T+2: the freeze pops
    });

    it('the freeze outlives the resume by one macrotask (regen lands on an idle frame)', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        rpm.runShadowCasterMutation(() => { /* flip */ });
        vi.advanceTimersToNextTimer();

        // Submits are back, but the map is STILL frozen for this frame — so the first
        // resumed frame reuses the existing texture instead of regenerating into one
        // three may be about to release.
        expect(submitsPaused(rpm)).toBe(false);
        expect(shadowMap.autoUpdate).toBe(false);

        vi.advanceTimersToNextTimer();
        expect(shadowMap.autoUpdate).toBe(true);
        expect(shadowMap.needsUpdate).toBe(true); // exactly one regen at the new caster set
    });

    it('COMPOSES with an overlapping realloc freeze — no fifth independent latch', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        // A whole-load / wall-commit freeze is already held (L-39 / L-64).
        rpm.setShadowReallocFrozen(true);
        rpm.runShadowCasterMutation(() => { /* flip */ });
        expect(freezeDepth(rpm)).toBe(2);

        vi.runAllTimers();

        // The caster window released its own reference and NOT the outer one — the outer
        // holder still owns a frozen map. Sharing the ref-count is what makes that true.
        expect(freezeDepth(rpm)).toBe(1);
        expect(shadowMap.autoUpdate).toBe(false);

        rpm.setShadowReallocFrozen(false);
        expect(shadowMap.autoUpdate).toBe(true);
    });

    it('nests with an outer submit pause — only the OUTERMOST release resumes submits', () => {
        const rpm = new RenderPipelineManager();
        armWebGpu(rpm, { shadowMap: makeFakeRenderer().shadowMap });

        // Stand in for an in-flight `_rebuildPipeline()` window (§L930-SUBMIT-PAUSE-DEPTH).
        (rpm as unknown as { _beginShadowRebuildGuard(): void })._beginShadowRebuildGuard();

        rpm.runShadowCasterMutation(() => { /* flip */ });
        vi.runAllTimers();

        // The inner window released, but the outer rebuild is still tearing GPU state
        // down. Resuming here is exactly the bug §L930-SUBMIT-PAUSE-DEPTH was minted for.
        expect(submitsPaused(rpm)).toBe(true);
    });

    it('a throwing mutation never strands the viewport paused', () => {
        const rpm = new RenderPipelineManager();
        armWebGpu(rpm, { shadowMap: makeFakeRenderer().shadowMap });

        expect(() => rpm.runShadowCasterMutation(() => {
            throw new Error('PascalSceneLighting disposed mid-tier');
        })).toThrow('PascalSceneLighting disposed mid-tier');

        vi.runAllTimers();
        expect(submitsPaused(rpm)).toBe(false);   // the `finally` still released
        expect(freezeDepth(rpm)).toBe(0);
    });

    it('is INERT on the WebGL2 fallback — the mutation still runs, unwrapped', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        // _webGpuActive stays false: the WebGL2 fallback owns its own shadowMap.
        (rpm as unknown as { _renderer: unknown })._renderer = { shadowMap };

        let ran = false;
        rpm.runShadowCasterMutation(() => { ran = true; });

        expect(ran).toBe(true);                   // never swallow the caller's work
        expect(submitsPaused(rpm)).toBe(false);
        expect(shadowMap.autoUpdate).toBe(true);  // untouched
    });

    it('does not presence-gate or late-attach anything (L-107 / L-112 guard)', () => {
        // L-107 deferred the ground shadow-catcher's ATTACHMENT and broke the real-shadow
        // rendering the founder had called "amazing"; L-112 reverted it with a standing
        // instruction never to re-introduce presence-gating or late-attach on the receive
        // path. This primitive must therefore never read or touch the scene graph at all.
        const rpm = new RenderPipelineManager();
        armWebGpu(rpm, { shadowMap: makeFakeRenderer().shadowMap });

        const traverse = vi.fn();
        (rpm as unknown as { _scene: unknown })._scene = { traverse };

        rpm.runShadowCasterMutation(() => { /* flip */ });

        // The freeze applier's per-light sweep is allowed to traverse (it writes timing
        // flags only, C04 §SHADOW rule 10) — but nothing here may add, remove or re-parent
        // an object. Assert the primitive itself performs no attachment work: the scene is
        // only ever READ.
        const sceneObj = (rpm as unknown as { _scene: Record<string, unknown> })._scene;
        expect(sceneObj.add).toBeUndefined();
        expect(sceneObj.remove).toBeUndefined();
    });
});
