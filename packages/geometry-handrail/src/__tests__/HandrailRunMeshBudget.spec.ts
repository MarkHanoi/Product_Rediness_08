// @vitest-environment happy-dom
/**
 * HandrailRunMeshBudget — THE CENSUS THAT MUST HAPPEN BEFORE R6 INFILL PANELLING.
 *
 * ═══ WHY THIS EXISTS BEFORE THE FEATURE, NOT AFTER IT ═══════════════════════
 *
 * A census established that a window at default `fine` LOD is **12 meshes**, and
 * that the founder's project holds 3,304 windows = 39,648 meshes — **85% of his
 * entire scene**. `__pryzmElementInstancingV1` DEFAULTS TO OFF, so handrails,
 * columns, beams and stair railings **cannot instance at all** today.
 *
 * A handrail RUN is the same trap in a different shape, and worse in one respect:
 * `dispatchHandrailRun` commits **one `HandrailData` record per SEGMENT**, and a
 * `circular` loop emits up to 48 chords. So a single two-click gesture can author
 * 48 records, each of which builds its own rail, its own posts, its own balusters
 * — and its own MATERIALS.
 *
 * ⭐ THE MATERIAL AXIS IS THE ONE THAT KILLED A NEIGHBOURING FAMILY. The C-shaped
 * stair froze the scene and lost the WebGPU device, and
 * `StairCurvedRailingBudget.spec.ts` records the reason in its header: *"a
 * `railMat.clone()` for EVERY sub-mesh, so a 17-step curved stair allocated ~100
 * UNIQUE MeshStandardMaterials per railing. Unique materials defeat instancing and
 * each one costs a render pipeline on the WebGPU backend."* This suite is that
 * suite's shape, applied to the handrail run — deliberately mirroring the proven
 * pattern rather than inventing a second one.
 *
 * ⛔ AND IT IS A CENSUS FIRST, A BUDGET SECOND. The numbers below were MEASURED,
 * not chosen; the ceilings are set at what the code does today so the suite is a
 * ratchet on a real baseline. It asserts NOTHING about what is acceptable — that
 * is the founder's call — only about what changes.
 *
 * ⚠ THIS SUITE DOES NOT FLIP THE INSTANCING FLAG. It is left exactly as
 * production has it, so these are the numbers a USER gets.
 *
 * ⭐ AND THE REASON NOT TO FLIP IT CHANGED WHILE THIS FILE WAS BEING WRITTEN —
 * RE-MEASURED 2026-08-19 rather than left as inherited caution. The original
 * rationale was PERF2's: L-691/ADR-0297 dispose-before-detach was UNFIXED in
 * `WindowBuilder` and `ColumnFragmentBuilder`. Lane INST1 (`079aab83`) has since
 * closed that at the L1 chokepoint — `dedupInstanceMaterial` now stamps the elected
 * canonical material — which it states covers all six families. So the DISPOSE
 * hazard is no longer the blocker it was.
 *
 * ⛔ WHAT BLOCKS HANDRAIL NOW IS SOMETHING ELSE, AND IT IS AUTHORED-BUT-UNWIRED:
 * `_FAMILY_DEFAULTS` in `ElementInstanceBridge` DECLARES `handrail: false`, and a
 * caller reaches its per-family default only by NAMING the family.
 * `WindowBuilder.ts:331` calls `isElementInstancingEnabled('window')`;
 * `HandrailFragmentBuilder.ts:78` calls `isElementInstancingEnabled()` with NO
 * argument, which is the legacy master-only contract. **So the `handrail` entry in
 * the per-family table is unreachable from the handrail builder** — the family can
 * only ever be switched by the global master flag, all-or-nothing, which is
 * precisely what the per-family table exists to avoid.
 *
 * That is the shape of the fix when someone takes it: name the family at :78, the
 * way the window builder does. It is deliberately NOT done here — this is a census,
 * and turning on instancing inside a measurement commit would invalidate the very
 * numbers the commit exists to record.
 *
 * CONTRACTS: C95 §15.5 (R6 infill) · ADR-0076 Axis 3 · C04 (rendering budget).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import type { HandrailData } from '@pryzm/core-app-model/stores';
import { HandrailFragmentBuilder } from '../HandrailFragmentBuilder';
import { loopSegmentsForMode } from '../handrailRunGenerators';

const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as never;

let _seq = 0;

function rail(over: Partial<HandrailData> = {}): HandrailData {
    return {
        id: `budget-rail-${_seq++}`,
        type: 'handrail',
        levelId: 'level-1',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
        height: 1.0,
        thickness: 0.05,
        baseOffset: 0,
        materialColor: '#888888',
        fillType: 'baluster',
        balusterSpacing: 0.1,
        balusterShape: 'rectangular',
        balusterWidth: 0.02,
        postSpacing: 1.0,
        ...over,
    } as HandrailData;
}

/** Every `THREE.Mesh` in the scene — what the renderer actually has to draw. */
function meshCount(scene: THREE.Scene): number {
    let n = 0;
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; });
    return n;
}

/**
 * DISTINCT material INSTANCES, by object identity.
 *
 * ⭐ IDENTITY, NOT COLOUR — and that distinction is the whole point. Two
 * `MeshStandardMaterial`s with identical parameters are still two render
 * pipelines on the WebGPU backend and still defeat instancing. Counting by
 * `.color.getHex()` would report "1" over the exact explosion this measures.
 */
function materialCount(scene: THREE.Scene): number {
    const seen = new Set<THREE.Material>();
    scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (!m) return;
        for (const one of Array.isArray(m) ? m : [m]) seen.add(one);
    });
    return seen.size;
}

/** Build a whole RUN the way `dispatchHandrailRun` does: ONE record per segment. */
function buildRun(
    scene: THREE.Scene,
    builder: HandrailFragmentBuilder,
    mode: 'square' | 'circular' | 'ellipse',
    a: { x: number; z: number },
    b: { x: number; z: number },
    over: Partial<HandrailData> = {},
): number {
    const { segments } = loopSegmentsForMode(mode, a, b);
    for (const s of segments) {
        builder.updateHandrail(rail({
            baseLine: [
                { x: s.start.x, y: 0, z: s.start.z },
                { x: s.end.x, y: 0, z: s.end.z },
            ],
            ...over,
        }));
    }
    return segments.length;
}

describe('HandrailRunMeshBudget — the per-run census (C95 §15.5 R6 gate)', () => {
    let scene: THREE.Scene;
    let builder: HandrailFragmentBuilder;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new HandrailFragmentBuilder(scene, stubBim);
    });

    it('CENSUS: one 2 m baluster handrail — meshes and DISTINCT materials, printed', () => {
        builder.updateHandrail(rail());
        const meshes = meshCount(scene);
        const materials = materialCount(scene);
        // Printed so the number is readable in CI output without reading source.
        console.log(`[budget] ONE 2 m baluster rail: ${meshes} meshes, ${materials} distinct materials`);

        // A single rail is small. The ceiling is the measured value; it exists so a
        // change to the builder has to come past this line.
        expect(meshes).toBeLessThanOrEqual(30);
        expect(meshes).toBeGreaterThan(0);
        // ⭐ THE MATERIAL FLOOR MATTERS MORE THAN THE MESH COUNT. Balusters share one
        // material and posts share one; if this ever climbs with the BALUSTER COUNT,
        // the stair's per-sub-mesh `clone()` defect has arrived here.
        expect(materials).toBeLessThanOrEqual(4);
    });

    it('⭐ THE REAL SHAPE: a CIRCULAR run is N RECORDS, and materials scale with N', () => {
        const n = buildRun(scene, builder, 'circular', { x: 0, z: 0 }, { x: 3, z: 0 });
        const meshes = meshCount(scene);
        const materials = materialCount(scene);
        console.log(
            `[budget] CIRCULAR run: ${n} segments -> ${meshes} meshes, ${materials} distinct materials ` +
            `(${(meshes / n).toFixed(1)} meshes and ${(materials / n).toFixed(1)} materials PER SEGMENT)`,
        );

        expect(n).toBeGreaterThanOrEqual(3);

        // ⭐⭐ THE FINDING, PINNED AS A LAW RATHER THAN A NUMBER.
        //
        // MEASURED 2026-08-19: a circular run is 31 segments -> 279 meshes and
        // **93 DISTINCT MeshStandardMaterials**, from ONE two-click gesture.
        //
        // ⛔ COMPARE `StairCurvedRailingBudget.spec.ts`'s header: the C-shaped stair
        // FROZE THE SCENE and lost the WebGPU device at **~100 unique materials per
        // railing**. The handrail's circular run is ALREADY AT THAT NUMBER TODAY.
        // The stair got there by cloning a material per SUB-MESH; handrail gets there
        // a different way — `dispatchHandrailRun` commits one RECORD per segment and
        // every record allocates its own rail / post / baluster material — but the
        // number the GPU sees is the same, and so is the consequence.
        //
        // The law, not the literal, is asserted: materials scale with the SEGMENT
        // count and not with the mesh count. A fix (shared materials per run) makes
        // this fail, which is correct — change it in the same commit, deliberately.
        expect(materials).toBe(n * 3);
        expect(meshes / n).toBeCloseTo(9, 0);
    });

    it('a SQUARE run of 4 segments stays within its measured ceiling', () => {
        const n = buildRun(scene, builder, 'square', { x: 0, z: 0 }, { x: 4, z: 3 });
        const meshes = meshCount(scene);
        const materials = materialCount(scene);
        console.log(`[budget] SQUARE run: ${n} segments -> ${meshes} meshes, ${materials} distinct materials`);
        expect(n).toBe(4);
        expect(meshes).toBeLessThanOrEqual(240);
        expect(materials).toBeLessThanOrEqual(16);
    });

    /**
     * ⭐ THE R6 CONTROL, AND THE REASON THIS FILE IS DATED BEFORE R6 RATHER THAN
     * AFTER IT.
     *
     * `fillType: 'glass'` is the CHEAP infill: one panel mesh per segment. R6 adds
     * PANELLED infill, which is the shape that explodes — a panel per bay rather
     * than a panel per run. This records what the cheap version costs so the
     * expensive version's cost is a DELTA against a measured number instead of an
     * impression.
     */
    it('GLASS infill today is ONE panel per segment — the baseline R6 must be compared against', () => {
        const glass = new THREE.Scene();
        const gb = new HandrailFragmentBuilder(glass, stubBim);
        const n = buildRun(glass, gb, 'square', { x: 0, z: 0 }, { x: 4, z: 3 }, { fillType: 'glass' });
        const meshes = meshCount(glass);
        const materials = materialCount(glass);
        console.log(`[budget] SQUARE run, GLASS infill: ${n} segments -> ${meshes} meshes, ${materials} materials`);

        // ⚠ MEASURED: 4 segments -> 26 meshes but STILL 12 materials — the same 3
        // per record as the baluster run. So dropping every baluster cut the MESH
        // count by 83% and the MATERIAL count by NOTHING. That is the proof the
        // material axis is per-RECORD, and it is why R6 cannot be reasoned about on
        // mesh count alone.
        expect(materials).toBe(n * 3);

        // Glass has no balusters, so it must be CHEAPER than the baluster run —
        // asserted as a relation, not a literal, so it survives a builder change.
        const bal = new THREE.Scene();
        const bb = new HandrailFragmentBuilder(bal, stubBim);
        buildRun(bal, bb, 'square', { x: 0, z: 0 }, { x: 4, z: 3 });
        expect(meshes).toBeLessThan(meshCount(bal));
    });

    /**
     * ⚠ NOT A PERFORMANCE ASSERTION — a REACHABILITY one, and it is the reason the
     * two counts above are the numbers a real user gets.
     *
     * `isElementInstancingEnabled()` — which is how `HandrailFragmentBuilder:78`
     * asks — is the legacy master-only contract: `__pryzmElementInstancingV1 === true`,
     * default OFF. So every baluster and post counted above is a REAL MESH. If this
     * ever reads `true` by default, the ceilings in this file stop describing
     * production and must be re-measured.
     */
    it('records that instancing is OFF by default, so these are the LIVE numbers', () => {
        const flag = (globalThis as { __pryzmElementInstancingV1?: boolean }).__pryzmElementInstancingV1;
        expect(flag).toBeFalsy();
    });
});
