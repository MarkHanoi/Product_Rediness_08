/**
 * §HANDRAIL-BRIDGE-PROBE — Phase-A AUDIT PROBE, not a fix.
 *
 * ⭐ SHIP THE PROBE BEFORE THE FIX (§CONTEXT-DATA-HONESTY). This file changes no
 * behaviour. It exists to turn four things that are currently only READABLE in
 * the source into MEASURED runtime facts, so the Phase-B plan is built on
 * observations rather than on my reading of a 30-line translation block.
 *
 * ─── WHAT IS BEING PROBED ─────────────────────────────────────────────────────
 *
 * A handrail can be created two ways, and they do NOT converge:
 *
 *   3-D TOOL  `packages/geometry-stair/src/HandrailTool.ts:143-156`
 *             → legacy `CreateHandrailCommand` directly, carrying the selected
 *               HandrailTypeDefinition's fillType / railProfile / railDiameter /
 *               postSpacing / materialColor.
 *
 *   PLAN TOOL `apps/editor/src/engine/views/plantools/RailingPlanToolHandler.ts:92-101`
 *             → bus `handrail.create` with ONLY `{id, path[2], height, diameter,
 *               levelId}`, then `apps/editor/src/engine/initTools.ts:1909-1956`
 *               mirrors it into the legacy store.
 *
 * The bridge is quoted VERBATIM below as `bridgeTranslate` so the probe cannot
 * drift from the code it is characterising. Everything asserted here is what the
 * REAL `HandrailFragmentBuilder` does with the record that bridge produces.
 *
 * ⚠ Every `expect` in this file asserts CURRENT behaviour, including behaviour
 * that looks wrong. A probe that asserts the desired answer tells you nothing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import type { HandrailData } from '@pryzm/core-app-model/stores';
import { HandrailFragmentBuilder } from '../HandrailFragmentBuilder';

const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as any;

let seq = 0;
const nextId = (): string => `hr-probe-${seq++}`;

/**
 * VERBATIM transcription of the bus→legacy bridge body at
 * `apps/editor/src/engine/initTools.ts:1925-1947`. Only `id` is parameterised.
 * If the real bridge changes, this probe's premise is stale and must be re-read.
 */
function bridgeTranslate(ev: {
    id: string;
    path: Array<{ x: number; y?: number; z: number }>;
    height?: number;
    diameter?: number;
    shape?: string;
    levelId?: string;
    materialId?: string;
}): HandrailData {
    const p0 = ev.path[0]!;
    const p1 = ev.path[ev.path.length - 1]!;
    return {
        id: ev.id,
        type: 'handrail',
        levelId: ev.levelId ?? '',
        parentId: ev.levelId ?? '',
        baseLine: [
            { x: p0.x, y: p0.y ?? 0, z: p0.z },
            { x: p1.x, y: p1.y ?? 0, z: p1.z },
        ],
        height: ev.height ?? 1.0,
        thickness: ev.diameter ?? 0.04,
        baseOffset: 0,
        railProfile: ev.shape === 'rectangular' ? 'rectangular' : 'round',
        ...(ev.materialId ? { materialId: ev.materialId } : {}),
        properties: {},
    } as unknown as HandrailData;
}

function meshesOf(scene: THREE.Scene, id: string): THREE.Mesh[] {
    const root = scene.children.find(
        (c) => (c.userData as { id?: string })?.id === id,
    ) as THREE.Group | undefined;
    if (!root) return [];
    const out: THREE.Mesh[] = [];
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
    return out;
}

describe('§HANDRAIL-BRIDGE-PROBE — measured divergences (Phase-A audit)', () => {
    let scene: THREE.Scene;
    let builder: HandrailFragmentBuilder;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new HandrailFragmentBuilder(scene, stubBim);
    });

    // ── PROBE 1 — a multi-point path is SILENTLY TRUNCATED to its endpoints ───
    //
    // The plugin schema allows `path: Vec3[]` with `.min(2)` — three, four, N
    // points are valid records. `baseLine` is a 2-tuple. The bridge takes
    // `path[0]` and `path[length-1]` and DISCARDS everything between, with no
    // warning, no refusal and no log.
    it('PROBE 1: a 3-point path loses its middle vertex with no diagnostic', () => {
        const legacy = bridgeTranslate({
            id: nextId(),
            path: [
                { x: 0, y: 0, z: 0 },
                { x: 2, y: 0, z: 3 },   // ← the corner the user drew
                { x: 4, y: 0, z: 0 },
            ],
            height: 1.1,
            diameter: 0.05,
            levelId: 'level-1',
        });

        // The corner is simply gone from the record.
        expect(legacy.baseLine).toHaveLength(2);
        expect(legacy.baseLine[0]).toMatchObject({ x: 0, z: 0 });
        expect(legacy.baseLine[1]).toMatchObject({ x: 4, z: 0 });

        // And the built geometry is a straight run — nothing reaches z = 3.
        builder.updateHandrail(legacy);
        const world = meshesOf(scene, legacy.id).map((m) => {
            const v = new THREE.Vector3(); m.getWorldPosition(v); return v;
        });
        expect(world.length).toBeGreaterThan(0);
        expect(Math.max(...world.map((v) => Math.abs(v.z)))).toBeLessThan(1e-6);
    });

    // ── PROBE 2 — the shape ternary compares against an IMPOSSIBLE value ──────
    //
    // `packages/schemas/src/elements/Handrail.ts:7` declares
    //   HandrailShape = z.enum(['round', 'square', 'flat'])
    // The bridge asks `ev.shape === 'rectangular'`. 'rectangular' is not a member
    // of that enum, so the test can never be true and the ternary is a constant.
    it('PROBE 2: every bus shape maps to railProfile "round", including square/flat', () => {
        for (const shape of ['round', 'square', 'flat'] as const) {
            const legacy = bridgeTranslate({
                id: nextId(), path: [{ x: 0, z: 0 }, { x: 2, z: 0 }], shape, levelId: 'l',
            });
            expect(legacy.railProfile).toBe('round');
        }
        // The only input that would select 'rectangular' is one the schema
        // cannot produce — documenting that the branch is unreachable in
        // production, not merely unused.
        expect(bridgeTranslate({
            id: nextId(), path: [{ x: 0, z: 0 }, { x: 2, z: 0 }],
            shape: 'rectangular', levelId: 'l',
        }).railProfile).toBe('rectangular');
    });

    // ── PROBE 3 — the authored diameter lands in a field the round rail ignores ─
    //
    // Bridge writes `thickness: ev.diameter`. HandrailFragmentBuilder's ROUND
    // branch (`:217`) reads `railDiameter ?? 0.04` and never reads `thickness`;
    // `thickness` is only read by the RECTANGULAR branch (`:226`). Since PROBE 2
    // shows railProfile is always 'round', the authored diameter is unreachable.
    it('PROBE 3: authored diameter 0.05 renders as the 0.04 default', () => {
        const legacy = bridgeTranslate({
            id: nextId(), path: [{ x: 0, z: 0 }, { x: 2, z: 0 }],
            height: 1.1, diameter: 0.05, levelId: 'level-1',
        });
        expect(legacy.thickness).toBe(0.05);
        expect((legacy as { railDiameter?: number }).railDiameter).toBeUndefined();

        builder.updateHandrail(legacy);
        const cyl = meshesOf(scene, legacy.id)
            .find((m) => m.geometry.type === 'CylinderGeometry'
                && (m.geometry as THREE.CylinderGeometry).parameters.height > 1);
        expect(cyl).toBeTruthy();
        // radius = (railDiameter ?? 0.04) / 2 = 0.02 — the authored 0.05 is lost.
        expect((cyl!.geometry as THREE.CylinderGeometry).parameters.radiusTop).toBeCloseTo(0.02, 9);
    });

    // ── PROBE 4 — a plan-drawn railing has NO INFILL AT ALL ───────────────────
    //
    // The bridge never sets `fillType`. The builder's infill block is
    // `if (fillType === 'glass') … else if (fillType === 'baluster') …` with no
    // else, so an undefined fillType builds nothing. `postSpacing` is likewise
    // unset → `?? 0` → no intermediate posts. The result is a bare tube.
    it('PROBE 4: a plan-tool railing builds 1 rail + 2 end posts and nothing else', () => {
        const legacy = bridgeTranslate({
            id: nextId(),
            path: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
            height: 1.1, diameter: 0.05, levelId: 'level-1',
        });
        expect((legacy as { fillType?: string }).fillType).toBeUndefined();
        expect((legacy as { postSpacing?: number }).postSpacing).toBeUndefined();

        builder.updateHandrail(legacy);
        // 1 swept rail + exactly 2 end posts. No balusters, no glass.
        expect(meshesOf(scene, legacy.id)).toHaveLength(3);
    });

    // ── PROBE 5 — the SAME element drawn in 3-D is materially different ───────
    //
    // This is the divergence stated as one assertion: identical endpoints,
    // identical length, two creation surfaces, two different buildings.
    it('PROBE 5: plan-drawn and 3D-drawn railings of the same line differ in mesh count', () => {
        const planRail = bridgeTranslate({
            id: nextId(), path: [{ x: 0, z: 0 }, { x: 4, z: 0 }],
            height: 1.0, diameter: 0.05, levelId: 'level-1',
        });
        builder.updateHandrail(planRail);
        const planCount = meshesOf(scene, planRail.id).length;

        // What the 3-D tool produces for the built-in 'timber-baluster' type
        // (height 1.0, thickness 0.05, fillType 'baluster', railProfile
        // 'rectangular', postSpacing 1.8, materialColor '#8B4513').
        const toolRail = {
            id: nextId(), type: 'handrail', levelId: 'level-1',
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
            height: 1.0, thickness: 0.05, baseOffset: 0,
            fillType: 'baluster', railProfile: 'rectangular',
            postSpacing: 1.8, materialColor: '#8B4513', properties: {},
        } as unknown as HandrailData;
        builder.updateHandrail(toolRail);
        const toolCount = meshesOf(scene, toolRail.id).length;

        expect(planCount).toBe(3);
        // 1 rail + balusters (spacing falls back to postSpacing 1.8 → floor(4/1.8)-1 = 1)
        // + 2 end posts + 1 mid post = 5. The point is only that it is NOT 3.
        expect(toolCount).not.toBe(planCount);
    });
});
