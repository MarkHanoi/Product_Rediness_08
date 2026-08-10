/**
 * @vitest-environment happy-dom
 *
 * §PLAN-CAMTARGET-SANITY-DEDUP (L-814) — the L-481 refusal must log once per DISTINCT
 * rejected camera target, not once per frame.
 *
 * PRODUCTION EVIDENCE (2026-08-10): a producer re-pushing the same implausible target
 * through `setFrustum` at ~30 fps repeated the refusal 191× / 399× per burst, burying
 * every other console line. The refusal POLICY is unchanged (refuse, keep the last good
 * target — L-481); only the repetition is suppressed, and the latch re-arms when a
 * plausible target is accepted so a recurring fault is reported again.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlanViewCanvas, PLAN_CAMTARGET_MAX_ABS_M } from '../PlanViewCanvas';
import type * as THREE from '@pryzm/renderer-three/three';

function makeCanvas(): PlanViewCanvas {
    const fake = {
        getContext: () => ({}),
        width: 0,
        height: 0,
        clientWidth: 800,
        clientHeight: 600,
    } as unknown as HTMLCanvasElement;
    return new PlanViewCanvas(fake);
}

const v = (x: number, y: number, z: number) => ({ x, y, z }) as unknown as THREE.Vector3;

describe('§PLAN-CAMTARGET-SANITY-DEDUP (L-814)', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        errorSpy.mockRestore();
    });

    it('still refuses an implausible target and keeps the last good one (L-481 unchanged)', () => {
        const pvc = makeCanvas();
        pvc.setFrustum(10, v(5, 0, 7));                       // good
        pvc.setFrustum(10, v(114525.76, -1577006.42, 135718.26)); // the production target
        expect(pvc.getCamTarget().x).toBe(5);
        expect(pvc.getCamTarget().z).toBe(7);
        expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('logs ONCE for a target re-pushed every frame', () => {
        const pvc = makeCanvas();
        const bad = v(114525.76, -1577006.42, 135718.26);
        for (let frame = 0; frame < 400; frame++) pvc.setFrustum(10, bad);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(String(errorSpy.mock.calls[0]![0])).toContain('§PLAN-CAMTARGET-SANITY');
    });

    it('logs again for a DISTINCT rejected target', () => {
        const pvc = makeCanvas();
        pvc.setFrustum(10, v(114525.76, -1577006.42, 135718.26));
        pvc.setFrustum(10, v(114525.76, -1577006.42, 135718.26));
        pvc.setFrustum(10, v(-1505720.29, -1635527.14, -948869.49)); // the L-604 target
        expect(errorSpy).toHaveBeenCalledTimes(2);
    });

    it('re-arms after a plausible target is accepted (recurring fault is reported again)', () => {
        const pvc = makeCanvas();
        const bad = v(PLAN_CAMTARGET_MAX_ABS_M + 1, 0, 0);
        pvc.setFrustum(10, bad);
        pvc.setFrustum(10, bad);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        pvc.setFrustum(10, v(1, 0, 1));   // recovery
        pvc.setFrustum(10, bad);          // fault recurs
        expect(errorSpy).toHaveBeenCalledTimes(2);
    });

    it('non-finite targets are refused and deduped too', () => {
        const pvc = makeCanvas();
        pvc.setFrustum(10, v(NaN, 0, 0));
        pvc.setFrustum(10, v(NaN, 0, 0));
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(pvc.getCamTarget().x).toBe(0);
    });
});
