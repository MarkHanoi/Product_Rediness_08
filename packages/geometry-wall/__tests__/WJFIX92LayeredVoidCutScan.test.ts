/**
 * §WJFIX92 F-1 (L-11310) — THE VOID-CUT SCAN MUST SEE A LAYERED WALL'S BODY PARTS.
 *
 * `WallRebuildCoordinator._flushOpeningsOnly` verifies, after its fast-path body rebuild,
 * that the opening's void was actually carved. Its check is a census of the wall group's
 * DIRECT children by `userData.elementType`:
 *
 *     if (ud?.elementType === 'WallPart' || ud?.elementType === 'WallLayer') bodyParts++;
 *     const voidCut = !isHidden && bodyParts > 0;
 *
 * `LayeredWallOpeningBuilder` — the `path=layered-grid` arm, i.e. EVERY layered wall that
 * hosts a door or a window — stamped `role:'geometry'` and no `elementType` at all, so that
 * census read `bodyParts=0 → voidCut=false` on a wall whose void was genuinely cut. Not a
 * rare miss: a STRUCTURAL false positive on every window edit of every layered wall, which
 * routed each one into the whole-level `_rebuildWalls` fallback — the path that re-resolves
 * the level's joins and (pre-F-2/F-3) square-capped the founder's mitres and evicted them
 * from `_prevJoinMap`.
 *
 * This file pins BOTH halves, because either alone is satisfiable by a lie:
 *   (1) the coordinator's predicate, TRANSCRIBED VERBATIM below, now counts > 0; and
 *   (2) the void is INDEPENDENTLY, GEOMETRICALLY cut — a raycast scanline finds a
 *       material-free band exactly where the opening is.
 * A tag stamped on meshes that carved nothing would pass (1) and fail (2); the pre-fix
 * builder passed (2) and failed (1). The defect is precisely their disagreement.
 *
 * Fixture: `packages/geometry-wall/probes/probe-wj91-03-layered-voidcut-false-positive.local.mts`.
 * Governing: C84 EI-9 (one vocabulary per concept), C85 (wall family), C86 §11 #1.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { buildLayeredWallSegmentsAroundOpenings, clusterOpenings } from '../src/LayeredWallOpeningBuilder';
import type { WallData, Opening } from '../src/WallTypes';

const OPENING: Opening = {
    id: 'op-1', type: 'window', offset: 2.0, width: 1.2, height: 1.5,
    sillHeight: 0.9, elementId: 'win-1',
} as Opening;

function layeredWallWithOpening(): WallData {
    return {
        id: 'wL', type: 'wall', levelId: 'L0', properties: {}, childrenIds: [],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3, thickness: 0.3, baseOffset: 0,
        openings: [OPENING],
        layers: [
            { name: 'finish-ext', function: 'finish-exterior', thickness: 0.02 },
            { name: 'core',       function: 'structure',       thickness: 0.26 },
            { name: 'finish-int', function: 'finish-interior', thickness: 0.02 },
        ],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

function build(): { group: THREE.Group; meshes: THREE.Mesh[] } {
    const wall = layeredWallWithOpening();
    const group = new THREE.Group();
    const meshes = buildLayeredWallSegmentsAroundOpenings(
        wall, group, clusterOpenings([OPENING]), 0.3,
    ) as unknown as THREE.Mesh[];
    return { group, meshes };
}

/**
 * `WallRebuildCoordinator.ts` §DIAG-OPENING-VOID, transcribed VERBATIM rather than
 * imported: the coordinator is an `apps/editor` module and this is an L2 package suite, so
 * the predicate is copied and its source line named. If the coordinator's predicate ever
 * changes, this comment is the pointer that says where to look.
 * Source: `apps/editor/src/engine/WallRebuildCoordinator.ts` (`_flushOpeningsOnly`,
 * the `bodyParts` census + `const voidCut = !isHidden && bodyParts > 0`).
 */
function coordinatorVoidCutScan(group: THREE.Group): { bodyParts: number; hasHitProxy: boolean; isHidden: boolean; voidCut: boolean } {
    let bodyParts = 0;
    let hasHitProxy = false;
    const isHidden = group.visible === false || (group.userData as { __wjrNaNHidden?: boolean })?.__wjrNaNHidden === true;
    for (const child of group.children) {
        const ud = (child as { userData?: { elementType?: string; role?: string } }).userData;
        if (ud?.elementType === 'WallPart' || ud?.elementType === 'WallLayer') bodyParts++;
        if (ud?.role === 'hit-proxy') hasHitProxy = true;
    }
    return { bodyParts, hasHitProxy, isHidden, voidCut: !isHidden && bodyParts > 0 };
}

/** Material-free x-bands along the wall at the opening's mid-height (probe 3's method). */
function materialFreeBands(meshes: THREE.Mesh[]): Array<[number, number]> {
    const cy = (OPENING.sillHeight ?? 0) + OPENING.height / 2;
    const solidAt = (x: number): boolean => {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, cy, -5), new THREE.Vector3(0, 0, 1), 0, 10);
        for (const m of meshes) {
            m.updateMatrixWorld(true);
            if (ray.intersectObject(m, false).length > 0) return true;
        }
        return false;
    };
    const bands: Array<[number, number]> = [];
    let runStart: number | null = null;
    for (let x = 0.05; x <= 5.95 + 1e-9; x += 0.1) {
        const solid = solidAt(x);
        if (!solid && runStart === null) runStart = x;
        if ((solid || x > 5.9) && runStart !== null) {
            bands.push([runStart, solid ? x - 0.1 : x]);
            runStart = null;
        }
    }
    return bands;
}

describe('§WJFIX92 F-1 — the layered-grid arm speaks the body-part vocabulary', () => {
    it('every emitted mesh carries elementType "WallLayer" (not an untagged role-only mesh)', () => {
        const { meshes } = build();
        expect(meshes.length).toBeGreaterThan(0);
        const tags = meshes.map(m => String((m.userData as { elementType?: string })?.elementType ?? 'NONE'));
        expect(tags.every(t => t === 'WallLayer'), `tags were [${tags.join(', ')}]`).toBe(true);
        // The pre-existing `role` is additive, never replaced — selection and the
        // instancing sweeps read it.
        expect(meshes.every(m => (m.userData as { role?: string })?.role === 'geometry')).toBe(true);
        // wallId/parentId survive the stamp — the whole reason selection works.
        expect(meshes.every(m => (m.userData as { wallId?: string })?.wallId === 'wL')).toBe(true);
    });

    it("the coordinator's §DIAG-OPENING-VOID scan reads voidCut=true (BEFORE the fix: bodyParts=0, voidCut=false)", () => {
        const { group } = build();
        const scan = coordinatorVoidCutScan(group);
        expect(scan.bodyParts, 'the scan must see the layer bodies it is looking for').toBeGreaterThan(0);
        expect(scan.isHidden).toBe(false);
        expect(scan.voidCut, 'a false here is the whole-level fallback firing on every window edit').toBe(true);
    });

    it('and the void really IS cut — the scan agrees with the geometry, it does not merely assert', () => {
        const { group, meshes } = build();
        const bands = materialFreeBands(meshes);
        // The 1.2 m opening at offset 2.0 ⇒ a material-free span inside [2.0, 3.2].
        expect(bands.length, 'no material-free band ⇒ no void was carved at all').toBeGreaterThan(0);
        const hole = bands.find(([a, b]) => a >= 1.9 && b <= 3.3);
        expect(hole, `bands were ${JSON.stringify(bands)}`).toBeDefined();
        // The two readings must AGREE. That agreement is the fix; their disagreement
        // was the defect.
        expect(coordinatorVoidCutScan(group).voidCut).toBe(true);
    });
});
