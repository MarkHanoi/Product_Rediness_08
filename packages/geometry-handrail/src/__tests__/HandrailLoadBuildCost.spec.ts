// @vitest-environment happy-dom
/**
 * §LOAD-HANDRAIL-BUILD-COST (L-3055, lane LOAD1) — how long does it take to BUILD
 * the founder's 137 handrails, and did restoring instancing change that number?
 *
 * ═══ WHY THIS FILE EXISTS ═══════════════════════════════════════════════════
 *
 * The founder's project (`proj-1787150674754-fe43bbbc18c5`, 259 elements) takes
 * 47 397.8 ms to open, up from 32 051.3 ms earlier the same day, and 47 168.2 ms
 * of that total sits inside ONE bucket — the element import. 259 elements at
 * 47.2 s is 182 ms per element.
 *
 * HANDRAILS ARE THE LARGEST FAMILY HE HAS: 137 of the 259. And between the two
 * builds his scene mesh count fell 3898 → 1843, which is the signature of
 * `46b14397` restoring `__pryzmElementInstancing.{handrail,stairRailing}` to ON.
 * So the two changes are CO-TIMED, and "instancing made the load slower" is a
 * live hypothesis that nothing had measured. This file measures it.
 *
 * ═══ WHAT IT ESTABLISHES, AND WHAT IT DOES NOT ═════════════════════════════
 *
 * ⭐ IT DOES: drive the REAL `HandrailFragmentBuilder` at the founder's exact N,
 * through the REAL `InstancedElementRenderer` + `ElementInstanceBridge`, into a
 * REAL `THREE.Scene`, twice — instancing OFF then ON — and time the build loop.
 * That loop is what `ImportProjectCommand`'s handrail step drives during a load
 * (via the `bim-handrail-added` fan-out), so the wall time is the load's
 * handrail geometry cost.
 *
 * ⛔ IT DOES NOT measure the founder's machine, his handrail geometry, his GPU,
 * or the rest of his load. There is no GPU in this process: every `THREE`
 * upload, shader compile and PSO build is absent, so this is a LOWER BOUND on
 * the real cost and must never be quoted as the whole of it. It also does not
 * measure the 41-event DOM fan-out each `bim-handrail-added` triggers in the
 * app — that is `initScene`'s, not this builder's.
 *
 * ⛔ IT ASSERTS NOTHING ABOUT MILLISECONDS. A wall-clock assertion on shared CI
 * is a flake generator. The timings are LOGGED; the assertions are on the
 * deterministic scene-graph facts (mesh/draw-call collapse) that make the
 * timings attributable.
 *
 * CONTRACTS: C04 (rendering/scheduling budget) · C95 §15.5 (handrail) ·
 * ADR-0076 Axis 3 (instancing) · C66 (scale).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    InstancedElementRenderer,
    ElementInstanceBridge,
    resetSharedMaterialCache,
} from '@pryzm/core-app-model/rendering';
import type { HandrailData } from '@pryzm/core-app-model/stores';

import { HandrailFragmentBuilder } from '../HandrailFragmentBuilder';

/** The founder's own count, from his console: `137 handrails`. */
const FOUNDER_HANDRAILS = 137;

const g = globalThis as {
    __pryzmElementInstancingV1?: boolean;
    __pryzmElementInstancing?: Record<string, boolean>;
};

const _origWindow = (globalThis as { window?: unknown }).window;
beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        runtime: { events: { on: vi.fn() } },
    };
});
afterEach(() => {
    (globalThis as { window?: unknown }).window = _origWindow;
    delete g.__pryzmElementInstancingV1;
    delete g.__pryzmElementInstancing;
});

const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as never;

/**
 * `elementRegistry` is a module singleton that throws on a duplicate id, and
 * this file builds the same scene twice on purpose. Each run gets its own id
 * namespace rather than reaching into the registry to clear it.
 */
let _run = 0;

function makeHandrail(ns: string, i: number): HandrailData {
    return {
        id: `${ns}-handrail-${i}`,
        type: 'handrail',
        levelId: `level-${i % 7}`,   // his project carries 7 levels
        baseLine: [{ x: i * 3, y: 0, z: 10 }, { x: i * 3 + 2, y: 0, z: 10 }],
        height: 1.0,
        thickness: 0.05,
        baseOffset: 0,
        materialColor: '#888888',
        fillType: 'baluster',
        balusterSpacing: 0.1,
        balusterShape: 'rectangular',
        balusterWidth: 0.02,
        postSpacing: 1.0,
    } as unknown as HandrailData;
}

interface Run {
    ms: number;
    msPerElement: number;
    meshes: number;
    instancedGroups: number;
    drawCalls: number;
}

/** Build N handrails under the current instancing regime and time the loop. */
function timeBuild(n: number): Run {
    const ns = `lc${_run++}`;
    resetSharedMaterialCache();

    const scene = new THREE.Scene();
    const renderer = new InstancedElementRenderer();
    renderer.setScene(scene);
    const bridge = new ElementInstanceBridge(renderer);

    const builder = new HandrailFragmentBuilder(scene, stubBim);
    builder.setInstanceBridge(bridge);

    // Pre-build the payloads so the timed window contains BUILD work only, not
    // fixture construction. A fixture cost folded into the measurement is how a
    // benchmark reports its own harness.
    const payloads: HandrailData[] = [];
    for (let i = 0; i < n; i++) payloads.push(makeHandrail(ns, i));

    const t0 = performance.now();
    for (const p of payloads) builder.updateHandrail(p);
    const ms = performance.now() - t0;

    let meshes = 0;
    let instancedGroups = 0;
    let standalone = 0;
    scene.traverse((o) => {
        const mesh = o as THREE.Mesh & { isInstancedMesh?: boolean };
        if (!mesh.isMesh) return;
        meshes++;
        if (mesh.isInstancedMesh) instancedGroups++;
        else if (o.visible !== false) standalone++;
    });

    return {
        ms,
        msPerElement: ms / n,
        meshes,
        instancedGroups,
        drawCalls: standalone + instancedGroups,
    };
}

function print(label: string, r: Run, n: number): void {
    // eslint-disable-next-line no-console
    console.log(
        `[load-cost] ${label}: ${n} handrails built in ${r.ms.toFixed(1)}ms ` +
        `(${r.msPerElement.toFixed(2)}ms/element) → ${r.meshes} meshes, ` +
        `${r.instancedGroups} instanced groups, ${r.drawCalls} draw calls`,
    );
}

describe('§LOAD-HANDRAIL-BUILD-COST (L-3055) — the founder\'s 137 handrails, built and timed', () => {

    it(
        '⭐ builds 137 handrails on BOTH instancing regimes and reports the wall time — ' +
        'instancing ON must COLLAPSE the scene graph, and the timing is logged, not asserted',
        () => {
            g.__pryzmElementInstancing = { handrail: false };
            const off = timeBuild(FOUNDER_HANDRAILS);
            print('instancing OFF (the 32 s build)', off, FOUNDER_HANDRAILS);

            g.__pryzmElementInstancing = { handrail: true };
            const on = timeBuild(FOUNDER_HANDRAILS);
            print('instancing ON  (the 47 s build)', on, FOUNDER_HANDRAILS);

            // eslint-disable-next-line no-console
            console.log(
                `[load-cost] DELTA: ON is ${(on.ms - off.ms).toFixed(1)}ms ` +
                `(${(on.ms / Math.max(off.ms, 0.001)).toFixed(2)}×) versus OFF for the same 137 ` +
                `handrails. ⛔ CPU-only — no GPU upload, no shader compile. LOWER BOUND.`,
            );

            // ── The deterministic half ──────────────────────────────────────
            // The collapse is what makes the timing attributable: if ON did not
            // actually instance, the two runs would not be comparable and the
            // delta would mean nothing.
            expect(on.drawCalls, 'instancing ON must submit fewer draw calls').toBeLessThan(off.drawCalls);
            expect(on.instancedGroups, 'instancing ON must create at least one InstancedMesh').toBeGreaterThan(0);
            expect(off.instancedGroups, 'instancing OFF must create NO InstancedMesh').toBe(0);
        },
    );

    it(
        'the per-element build cost does NOT grow with N — a quadratic here would be ' +
        'the load defect itself, so it is measured rather than assumed',
        () => {
            // ⭐ THE POINT. A load is N sequential builds. A per-element cost that
            // rises with N is the shape a chunked loader cannot chunk away (the
            // §4.2 `_neighbourSnapshot` finding is exactly that shape). Measuring
            // the RATIO of per-element costs across a 4× range is what separates
            // "handrails are expensive" from "handrails are quadratic".
            g.__pryzmElementInstancing = { handrail: true };
            const small = timeBuild(50);
            const large = timeBuild(200);
            print('N=50  (instancing ON)', small, 50);
            print('N=200 (instancing ON)', large, 200);
            const ratio = large.msPerElement / Math.max(small.msPerElement, 0.0001);
            // eslint-disable-next-line no-console
            console.log(
                `[load-cost] SCALING: per-element cost N=200 / N=50 = ${ratio.toFixed(2)}×. ` +
                `Linear ⇒ ~1×; quadratic ⇒ ~4×.`,
            );

            // Deliberately loose: this is a SHAPE assertion, not a budget. A true
            // quadratic at 4× N shows ~4× per-element cost; noise on a shared
            // runner does not reach 3×.
            expect(ratio, 'per-element handrail build cost must not scale with N').toBeLessThan(3);
        },
    );
});
