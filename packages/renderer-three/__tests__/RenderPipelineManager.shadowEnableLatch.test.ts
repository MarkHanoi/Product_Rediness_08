// §FIX-SHADOW-ENABLE-LATCH (founder L-205) — the single-owner, ref-counted shadow-PASS
// enable latch that closes the "first wall → uniform grey square, no ground shadow" bug.
//
// ROOT DEFECT it replaces: `renderer.shadowMap.enabled` was a GLOBAL GPU flag save/restored
// by FIVE modules across FOUR packages via a `window` hand-off (`__pryzmBatchShadowWasEnabled`)
// with NO single owner. Any consumer that threw between save and restore leaked `enabled=false`
// FOREVER; `requestShadowRefresh()` then silently no-op'd, so the L0 ground catcher composited
// SOLID GREY until a manual backend swap constructed a fresh adapter (enabled=true) — exactly
// the founder's "swap to webgl→webgpu makes the grey disappear" clue.
//
// The manager (renderer-three, the L1 THREE owner — P2) is now the SOLE writer of the flag.
// Two orthogonal channels compose into it: persistent PREFERENCES (user Cast-shadows toggle,
// performance mode) and transient ref-counted SUPPRESSIONS (batch PSO-storm, IFC streaming).
// These tests pin: ref-counting, idempotent re-assert (incl. after a renderer REPLACEMENT),
// preference-vs-suppression independence, and exception-safe (idempotent) release handles.

import { describe, expect, it } from 'vitest';
import { RenderPipelineManager } from '../src/pipeline/RenderPipelineManager.js';

/** A fake renderer.shadowMap that starts enabled (WebGPU/WebGL adapters set enabled=true). */
function makeFakeRenderer(enabled = true) {
    const shadowMap = { enabled, autoUpdate: true, needsUpdate: false };
    return { shadowMap };
}

/** Force the manager into active-WebGPU state with a fake renderer, no real GPU. */
function armWebGpu(rpm: RenderPipelineManager, renderer: unknown): void {
    (rpm as unknown as { _webGpuActive: boolean })._webGpuActive = true;
    (rpm as unknown as { _renderer: unknown })._renderer = renderer;
}

/** Directly invoke the private appliers bind() runs on a renderer (re)attach. */
function reassertOnBoundRenderer(rpm: RenderPipelineManager): void {
    (rpm as unknown as { _applyShadowEnabledState(): void })._applyShadowEnabledState();
    (rpm as unknown as { _applyShadowFreezeState(): void })._applyShadowFreezeState();
}

describe('RenderPipelineManager — shadow-enable latch (§FIX-SHADOW-ENABLE-LATCH)', () => {
    it('a single transient suppression disables the pass; releasing it re-enables', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        const release = rpm.pushShadowPassDisabled('batch');
        expect(shadowMap.enabled).toBe(false);

        release();
        expect(shadowMap.enabled).toBe(true);
    });

    it('is ref-counted — two pushes of the same reason require two releases', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        const r1 = rpm.pushShadowPassDisabled('batch');
        const r2 = rpm.pushShadowPassDisabled('batch');
        expect(shadowMap.enabled).toBe(false);

        r1();
        expect(shadowMap.enabled).toBe(false); // r2 still holds it

        r2();
        expect(shadowMap.enabled).toBe(true);
    });

    it('independent reasons compose — every reason must release before the pass returns', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        const releaseBatch = rpm.pushShadowPassDisabled('batch');
        const releaseIfc   = rpm.pushShadowPassDisabled('ifc-import');
        expect(shadowMap.enabled).toBe(false);

        releaseBatch();
        expect(shadowMap.enabled).toBe(false); // ifc-import still active

        releaseIfc();
        expect(shadowMap.enabled).toBe(true);
    });

    it('setShadowPassDisabled(reason) is boolean-presence (idempotent) — the cross-package batch form', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        rpm.setShadowPassDisabled('batch', true);
        rpm.setShadowPassDisabled('batch', true); // idempotent — still one logical suppression
        expect(shadowMap.enabled).toBe(false);

        // Several batch restore paths may each fire false; the FIRST fully releases, the
        // rest are harmless no-ops (never over-enabling nor throwing).
        rpm.setShadowPassDisabled('batch', false);
        expect(shadowMap.enabled).toBe(true);
        rpm.setShadowPassDisabled('batch', false);
        expect(shadowMap.enabled).toBe(true);
    });

    it('re-asserts the effective state onto a REPLACED renderer (the L-205 leak-survives-swap fix)', () => {
        const rpm = new RenderPipelineManager();
        const first = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap: first.shadowMap });

        // A transient suppression is active on the first renderer.
        rpm.pushShadowPassDisabled('batch');
        expect(first.shadowMap.enabled).toBe(false);

        // A renderer replacement (bind after a backend swap / recoverPipeline) attaches a
        // FRESH renderer whose shadowMap defaults to enabled=true — divergent from the latch.
        const second = makeFakeRenderer(true);
        (rpm as unknown as { _renderer: unknown })._renderer = { shadowMap: second.shadowMap };

        // bind() re-runs the appliers, which must re-assert the intended state onto the NEW
        // renderer (the pre-L-205 transition-only writer left it stale → the grey square).
        reassertOnBoundRenderer(rpm);
        expect(second.shadowMap.enabled).toBe(false);
    });

    it('re-asserts a FREEZE (autoUpdate) onto a replaced renderer', () => {
        const rpm = new RenderPipelineManager();
        const first = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap: first.shadowMap });

        rpm.setShadowReallocFrozen(true);
        expect(first.shadowMap.autoUpdate).toBe(false);

        // Swap in a fresh renderer (autoUpdate defaults to true) while still frozen.
        const second = makeFakeRenderer();
        expect(second.shadowMap.autoUpdate).toBe(true);
        (rpm as unknown as { _renderer: unknown })._renderer = { shadowMap: second.shadowMap };

        reassertOnBoundRenderer(rpm);
        // The freeze is re-asserted onto the new renderer — not left at THREE's default.
        expect(second.shadowMap.autoUpdate).toBe(false);
    });

    it('models the user PREFERENCE independently of transient suppressions', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        // User turns shadows OFF (Cast-shadows toggle).
        rpm.setShadowsEnabledPreference('user', false);
        expect(shadowMap.enabled).toBe(false);

        // A transient suppression push + release can NEVER re-enable over the user's OFF.
        const release = rpm.pushShadowPassDisabled('batch');
        expect(shadowMap.enabled).toBe(false);
        release();
        expect(shadowMap.enabled).toBe(false); // still honouring the user's choice

        // Only the user turning it back ON re-enables.
        rpm.setShadowsEnabledPreference('user', true);
        expect(shadowMap.enabled).toBe(true);
    });

    it('a transient suppression that spans a user toggle-ON keeps the pass off until BOTH agree', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        const release = rpm.pushShadowPassDisabled('batch'); // batch in progress
        expect(shadowMap.enabled).toBe(false);

        rpm.setShadowsEnabledPreference('user', true); // user prefers ON, but batch still holds
        expect(shadowMap.enabled).toBe(false);

        release(); // batch done → now both agree
        expect(shadowMap.enabled).toBe(true);
    });

    it('independent preference sources compose — performance mode OFF wins over user ON', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        rpm.setShadowsEnabledPreference('user', true);
        rpm.setShadowsEnabledPreference('performance', false);
        expect(shadowMap.enabled).toBe(false);

        rpm.setShadowsEnabledPreference('performance', true);
        expect(shadowMap.enabled).toBe(true);
    });

    it('the release handle is EXCEPTION-SAFE — idempotent, so a throwing consumer cannot leak the flag', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });

        const r1 = rpm.pushShadowPassDisabled('batch');
        const r2 = rpm.pushShadowPassDisabled('batch');
        expect(shadowMap.enabled).toBe(false);

        // A consumer throws mid-work but releases in `finally`. Even if the SAME handle is
        // (defensively) called again, it must pop only ONCE — never under-count into a
        // spurious re-enable while r2 still legitimately holds the suppression.
        try {
            throw new Error('consumer blew up');
        } catch {
            r1();
            r1(); // idempotent — second call is a no-op
        }
        expect(shadowMap.enabled).toBe(false); // r2 still holds it; r1's double-call did NOT leak-enable

        r2();
        expect(shadowMap.enabled).toBe(true);
    });

    it('reports the latch state in logShadowDiagnostics without touching the deleted window global', () => {
        const rpm = new RenderPipelineManager();
        const { shadowMap } = makeFakeRenderer();
        armWebGpu(rpm, { shadowMap });
        rpm.pushShadowPassDisabled('batch');

        // Pure read — must not throw and must not reference __pryzmBatchShadowWasEnabled.
        expect(() => rpm.logShadowDiagnostics('unit-test')).not.toThrow();
    });
});
