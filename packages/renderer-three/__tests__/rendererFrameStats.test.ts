/**
 * §PERF-DRAWCALLS-ARE-CUMULATIVE (L-2502) — the oracle for the draw-call reader.
 *
 * ⭐ THE FIXTURES ARE THE REAL FIELD SETS, NOT INVENTED ONES. Each `info` literal
 * below is the exact `render` object shape the vendored `three@0.183.2` builds
 * construct, so a three upgrade that changes either shape breaks these tests
 * rather than silently changing what the instrument means:
 *
 *   three.module.js  `WebGLInfo`  render = { frame, calls, triangles, points, lines }
 *   three.webgpu.js  `Info`       render = { calls, frameCalls, drawCalls, triangles,
 *                                            points, lines, timestamp }
 *
 * ⛔ The load-bearing assertion is NOT "it returns a number". It is that the SAME
 * numeric value of `render.calls` resolves to a DIFFERENT meaning on the two
 * renderers — which is the whole defect, and the reason a reader that ignores the
 * shape cannot be right on both.
 */

import { describe, it, expect } from 'vitest';
import { readFrameDrawCalls, isCumulativeCallsField } from '../src/rendererFrameStats';

/** `three.webgpu.js` Info.render after a frame — `calls` is a since-boot odometer. */
const webgpuInfo = (calls: number, drawCalls: number, frameCalls = 6) => ({
    render: { calls, frameCalls, drawCalls, triangles: 480010, points: 0, lines: 0 },
});

/** `three.module.js` WebGLInfo.render after a frame — `calls` IS this frame. */
const classicInfo = (calls: number) => ({
    render: { frame: 12, calls, triangles: 480010, points: 0, lines: 0 },
});

describe('readFrameDrawCalls — one field name, two meanings', () => {
    it('WebGPU-family: reads render.drawCalls, NOT the render.calls odometer', () => {
        // The founder's shape: 7591 render calls since boot, 3685 draw calls this frame.
        const r = readFrameDrawCalls(webgpuInfo(7591, 3685));
        expect(r.perFrame).toBe(3685);
        expect(r.provenance).toBe('drawCalls/frame (webgpu-family Info)');
        expect(r.cumulativeCalls).toBe(7591);
        expect(r.frameCalls).toBe(6);
    });

    it('classic WebGL: reads render.calls, because reset() zeroes it every frame', () => {
        const r = readFrameDrawCalls(classicInfo(3685));
        expect(r.perFrame).toBe(3685);
        expect(r.provenance).toBe('calls/frame (classic WebGLInfo)');
        // ⭐ No odometer exists on this renderer. Echoing `calls` here would
        // re-merge the two meanings the module exists to separate.
        expect(r.cumulativeCalls).toBeNull();
        expect(r.frameCalls).toBeNull();
    });

    it('⭐ THE DEFECT: identical render.calls, opposite meanings', () => {
        // Both renderers report render.calls = 7591. On one it is this frame's
        // work; on the other it is every frame since page load. A reader that
        // takes `calls` blind prints 7591 for both and is wrong for exactly one.
        const webgpu = readFrameDrawCalls(webgpuInfo(7591, 3685));
        const classic = readFrameDrawCalls(classicInfo(7591));

        expect(webgpu.perFrame).toBe(3685);   // ← the truth on WebGPU
        expect(classic.perFrame).toBe(7591);  // ← the truth on classic WebGL
        expect(webgpu.perFrame).not.toBe(7591);

        expect(isCumulativeCallsField(webgpuInfo(7591, 3685))).toBe(true);
        expect(isCumulativeCallsField(classicInfo(7591))).toBe(false);
    });

    it('⭐ the odometer keeps rising while the per-frame count stays flat', () => {
        // The signature that makes the mislabelling visible: a steady 60 Hz idle
        // scene submits the same work every frame, but `calls` climbs forever.
        const f1 = readFrameDrawCalls(webgpuInfo(6000, 3685));
        const f2 = readFrameDrawCalls(webgpuInfo(6006, 3685));
        expect(f2.perFrame).toBe(f1.perFrame);                       // work: unchanged
        expect(f2.cumulativeCalls!).toBeGreaterThan(f1.cumulativeCalls!); // odometer: up
    });

    it('a drawCalls of 0 is a real reading, not an absence', () => {
        const r = readFrameDrawCalls(webgpuInfo(120, 0));
        expect(r.perFrame).toBe(0);
        expect(r.provenance).toBe('drawCalls/frame (webgpu-family Info)');
    });

    it('⛔ unavailable resolves to null, NEVER 0', () => {
        for (const bad of [null, undefined, {}, { render: {} }, { render: { triangles: 5 } }]) {
            const r = readFrameDrawCalls(bad as never);
            expect(r.perFrame).toBeNull();
            expect(r.provenance).toBe('unavailable');
        }
        expect(isCumulativeCallsField(null)).toBe(false);
    });

    it('is pure — it does not mutate the info it reads', () => {
        const info = webgpuInfo(7591, 3685);
        const before = JSON.stringify(info);
        readFrameDrawCalls(info);
        isCumulativeCallsField(info);
        expect(JSON.stringify(info)).toBe(before);
    });
});
