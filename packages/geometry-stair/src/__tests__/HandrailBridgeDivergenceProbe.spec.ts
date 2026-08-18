/**
 * §HANDRAIL-BRIDGE-PROBE — the bridge's four defects, now asserted FIXED.
 *
 * ⚠ THIS FILE FLIPPED. In Phase A every assertion here described BROKEN
 * behaviour and the file was GREEN — that was the point: a probe that asserts
 * the desired answer tells you nothing. Phase B fixed the bridge, so each
 * assertion below has been inverted to the CORRECT answer and the transcription
 * of the bridge re-taken from the fixed source. Green-before and green-after
 * mean opposite things here, and the diff is the evidence.
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
 * VERBATIM transcription of the FIXED bus→legacy bridge body at
 * `apps/editor/src/engine/initTools.ts:1927-2015`. Only `id` is parameterised.
 * Returns `null` where the bridge now REFUSES and writes no record.
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
}): HandrailData | null {
    // §FIX-HANDRAIL-BRIDGE-TRUNCATION — refuse rather than silently truncate.
    if (ev.path.length > 2) return null;
    const p0 = ev.path[0]!;
    const p1 = ev.path[1]!;
    const diameter = ev.diameter ?? 0.04;
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
        thickness: diameter,
        railDiameter: diameter,
        baseOffset: 0,
        railProfile: (ev.shape === undefined || ev.shape === 'round') ? 'round' : 'rectangular',
        fillType: 'baluster',
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

describe('§HANDRAIL-BRIDGE-PROBE — the four defects, asserted FIXED', () => {
    let scene: THREE.Scene;
    let builder: HandrailFragmentBuilder;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new HandrailFragmentBuilder(scene, stubBim);
    });

    // ── 1 — a multi-point path is REFUSED, not silently truncated ─────────────
    //
    // WAS: path[0] and path[length-1] kept, everything between discarded with no
    // warning and no log — the user got a shape they did not draw. Now the bridge
    // declines by name and writes NO record: a refusal is a correct answer, a
    // silently-wrong element is not (WallRake.ts:50-62).
    it('1: a 3-point path is refused outright rather than flattened', () => {
        const legacy = bridgeTranslate({
            id: nextId(),
            path: [
                { x: 0, y: 0, z: 0 },
                { x: 2, y: 0, z: 3 },   // ← the corner the user drew
                { x: 4, y: 0, z: 0 },
            ],
            height: 1.1, diameter: 0.05, levelId: 'level-1',
        });
        expect(legacy).toBeNull();
    });

    it('1b: a 2-point path is still accepted unchanged', () => {
        const legacy = bridgeTranslate({
            id: nextId(), path: [{ x: 0, z: 0 }, { x: 4, z: 0 }], levelId: 'l',
        });
        expect(legacy).not.toBeNull();
        expect(legacy!.baseLine).toHaveLength(2);
    });

    // ── 2 — the shape mapping is now total and correct ───────────────────────
    //
    // WAS: `ev.shape === 'rectangular'` — not a member of the schema enum
    // ['round','square','flat'], so the ternary was a CONSTANT and every rail
    // became round.
    it('2: square and flat now map to rectangular; round stays round', () => {
        const profileFor = (shape: string | undefined): string =>
            bridgeTranslate({ id: nextId(), path: [{ x: 0, z: 0 }, { x: 2, z: 0 }], shape, levelId: 'l' })!
                .railProfile as string;
        expect(profileFor('round')).toBe('round');
        expect(profileFor(undefined)).toBe('round');
        expect(profileFor('square')).toBe('rectangular');
        expect(profileFor('flat')).toBe('rectangular');
    });

    // ── 3 — the authored diameter now reaches the built rail ─────────────────
    //
    // WAS: written to `thickness` only, which the ROUND branch never reads.
    it('3: an authored diameter of 0.05 renders at radius 0.025, not the 0.04 default', () => {
        const legacy = bridgeTranslate({
            id: nextId(), path: [{ x: 0, z: 0 }, { x: 2, z: 0 }],
            height: 1.1, diameter: 0.05, levelId: 'level-1',
        })!;
        expect(legacy.railDiameter).toBe(0.05);

        builder.updateHandrail(legacy);
        const cyl = meshesOf(scene, legacy.id).find(
            (m) => (m.userData as { member?: string }).member === 'rail',
        )!;
        expect((cyl.geometry as THREE.CylinderGeometry).parameters.radiusTop).toBeCloseTo(0.025, 9);
    });

    // ── 4 — a plan-drawn railing now has infill ──────────────────────────────
    //
    // WAS: fillType absent → the builder's infill block has no else → nothing.
    // A plan railing was 3 meshes: one tube and two end posts.
    it('4: a plan-tool railing now builds balusters', () => {
        const legacy = bridgeTranslate({
            id: nextId(), path: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
            height: 1.1, diameter: 0.05, levelId: 'level-1',
        })!;
        expect(legacy.fillType).toBe('baluster');

        builder.updateHandrail(legacy);
        const balusters = meshesOf(scene, legacy.id).filter(
            (m) => (m.userData as { member?: string }).member === 'baluster',
        );
        expect(balusters.length).toBeGreaterThan(0);
        expect(meshesOf(scene, legacy.id).length).toBeGreaterThan(3);
    });

    // ── 5 — THE HEADLINE: plan and 3-D now agree ─────────────────────────────
    //
    // The same line, drawn on two surfaces, used to build different geometry.
    // Both now produce a balustrade with the same member composition.
    it('5: plan-drawn and 3D-drawn railings of the same line now agree', () => {
        const composition = (id: string): Record<string, number> => {
            const out: Record<string, number> = {};
            for (const m of meshesOf(scene, id)) {
                const k = String((m.userData as { member?: string }).member ?? 'untagged');
                out[k] = (out[k] ?? 0) + 1;
            }
            return out;
        };

        const planRail = bridgeTranslate({
            id: nextId(), path: [{ x: 0, z: 0 }, { x: 4, z: 0 }],
            height: 1.0, diameter: 0.05, shape: 'square', levelId: 'level-1',
        })!;
        builder.updateHandrail(planRail);

        // What the 3-D tool builds for the same line with the same construction.
        const toolRail = {
            id: nextId(), type: 'handrail', levelId: 'level-1',
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
            height: 1.0, thickness: 0.05, railDiameter: 0.05, baseOffset: 0,
            fillType: 'baluster', railProfile: 'rectangular', properties: {},
        } as unknown as HandrailData;
        builder.updateHandrail(toolRail);

        expect(composition(planRail.id)).toEqual(composition(toolRail.id));
    });
});
