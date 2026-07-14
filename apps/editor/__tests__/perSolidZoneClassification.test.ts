// @vitest-environment happy-dom
//
// §FIX-PER-SOLID-ZONE-CLASSIFICATION (L-282) — THE MERGE-BLOCKING GUARD.
//
// THE FOUNDER'S RULE, VERBATIM:
//
//   "Classification is performed PER GEOMETRY, not per element hierarchy.
//        wallClass = classify(wallSolid)
//        doorClass = classify(doorSolid)
//    These are COMPLETELY INDEPENDENT. `Wall -> Door` does NOT mean `Door == Cut => Wall == Cut`.
//    THE ONLY DETERMINANT OF CUT vs PROJECTION IS WHETHER *THAT SPECIFIC SOLID* INTERSECTS
//    THE CUT PLANE."
//
// AND THE COROLLARY — THE HALF THAT GETS MISSED:
//
//   "The opening created by a hosted door appears as a CUT opening ONLY IF THE WALL ITSELF
//    IS INTERSECTED. If the wall remains PROJECTION: do NOT render cut edges around the
//    opening, do NOT render cut faces, do NOT switch the wall to cut graphics."
//
// ═══ THE BUG, REPRODUCED — AND IT IS *NOT* A HOST-TREE POINTER ═══
//
// There is no `if (door.isCut()) wall.setCut(true)` in this codebase, and no `Group` whose
// zone is lifted from a child. The propagation is GEOMETRIC, and it is worse, because it
// needs no hierarchy at all to fire:
//
//   `classifyByProjectionDepth()` decided CUT with a PROXIMITY test —
//
//       crossesCutPlane = |d0 - near| <= CUT_LINE_EPSILON      // 15 CENTIMETRES
//                      || |d1 - near| <= CUT_LINE_EPSILON
//                      || (d0 - near) * (d1 - near) < 0        // ← the only honest term
//
//   — so ANY edge lying WITHIN 15 cm OF THE PLANE was declared CUT even though the plane
//   never entered its solid. `CUT_LINE_EPSILON` is the PLAN classifier's vertex-Y tolerance
//   ("generous enough to capture wall top/bottom edge artefacts"); reused on the DEPTH axis
//   it means 15 cm of pure slop.
//
//   A hosted door's frame/architrave/leaf stands a FEW CENTIMETRES PROUD of its host wall's
//   face. So the depth plane that first touches the DOOR is, always and by construction,
//   within 15 cm of the WALL FACE — and the wall's whole front silhouette (including the
//   jamb and head edges around the opening) flipped to `:cut` IN THE SAME FRAME the door did.
//
//   That is exactly what the founder saw, and his RULE is exactly the fix: a solid is CUT
//   iff THAT SOLID's own geometry intersects the plane. The coupling looked like host
//   propagation because the door is what puts a solid 3 cm in front of the wall.
//
// VERIFIED AT THE OUTCOME, NOT AT THE SEAM: every assertion below ends at the pen the canvas
// actually resolves — `graphicsRulesEngine.resolveStyle()`, not `resolvePen()` — because the
// intent chain may override the table (L-246 / L-277).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    classifyByProjectionDepth,
    classifyByVertexY,
    buildMeshPlaneIntersectionGeometry,
    buildPlanCutSectionGeometry,
    solidIntersectsDepthPlane,
    solidIntersectsPlanCutPlane,
} from '../src/engine/views/EdgeProjectorService.js';
import {
    layerForZone,
    drawingZoneFromLayerName,
    penZoneOf,
    graphicsRulesEngine,
} from '@pryzm/core-app-model';
import type { ViewDefinition } from '@pryzm/core-app-model';

// ─── The fixture: a wall, and a door hosted in it that stands PROUD of its face ──
//
// Depth axis = +Z. The view's near (cut) plane is z = 0.
//
//   wall solid   z ∈ [0.02, 0.22]   ← 2 cm BEHIND the plane. The plane NEVER enters it.
//   door solid   z ∈ [-0.03, 0.25]  ← its frame stands 3 cm PROUD. It STRADDLES the plane.
//
// This is the founder's screenshot, as numbers.

const WALL_LEN = 4, WALL_H = 3;
const WALL_Z0 = 0.02, WALL_Z1 = 0.22;
const VOID_X0 = 1.5, VOID_X1 = 2.5, HEAD = 2.1;
const DOOR_Z0 = -0.03, DOOR_Z1 = 0.25;

const DIRECTION = new THREE.Vector3(0, 0, 1);

/** A section/elevation view whose cut plane is z = 0, looking down +Z. */
const VIEW_DEF = {
    id: 'v-l282',
    viewType: 'section',
    spatial: { sectionPlane: { normal: [0, 0, 1], constant: 0 } },
} as unknown as ViewDefinition;

function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.Mesh {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const m = new THREE.Mesh(g);
    m.updateMatrixWorld(true);
    return m;
}

/** The wall AS THE SOLID ACTUALLY IS once the door void is cut into it: two piers + a lintel. */
function hostWall(): THREE.Mesh {
    const parts = [
        new THREE.BoxGeometry(VOID_X0, WALL_H, WALL_Z1 - WALL_Z0)
            .translate(VOID_X0 / 2, WALL_H / 2, (WALL_Z0 + WALL_Z1) / 2),
        new THREE.BoxGeometry(WALL_LEN - VOID_X1, WALL_H, WALL_Z1 - WALL_Z0)
            .translate((WALL_LEN + VOID_X1) / 2, WALL_H / 2, (WALL_Z0 + WALL_Z1) / 2),
        new THREE.BoxGeometry(VOID_X1 - VOID_X0, WALL_H - HEAD, WALL_Z1 - WALL_Z0)
            .translate((VOID_X0 + VOID_X1) / 2, (HEAD + WALL_H) / 2, (WALL_Z0 + WALL_Z1) / 2),
    ];
    // Merged by hand — the three pieces are ONE wall solid (pier + pier + lintel).
    const positions: number[] = [];
    for (const g of parts) {
        const nonIndexed = g.index ? g.toNonIndexed() : g;
        const p = nonIndexed.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) positions.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mesh = new THREE.Mesh(geo);
    mesh.updateMatrixWorld(true);
    return mesh;
}

/** The hosted door solid — its frame stands 3 cm proud of the wall face. */
function hostedDoor(): THREE.Mesh {
    return box(VOID_X0, VOID_X1, 0, HEAD, DOOR_Z0, DOOR_Z1);
}

function edgesOf(mesh: THREE.Mesh): THREE.BufferGeometry {
    const e = new THREE.EdgesGeometry(mesh.geometry, 1);
    e.applyMatrix4(mesh.matrixWorld);
    return e;
}

function segCount(geo: THREE.BufferGeometry | null): number {
    if (!geo) return 0;
    const p = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    return p ? p.count / 2 : 0;
}

/** THE OUTCOME — the pen the canvas actually resolves for a layer. */
function penOfLayer(layerTag: string, category: string) {
    const zone = drawingZoneFromLayerName(layerTag);
    expect(zone).not.toBeNull();
    return graphicsRulesEngine.resolveStyle(penZoneOf(zone!), category, { viewType: 'section' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// (A) THE BUG — the door is CUT, the wall is NOT, and the wall must stay PROJECTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('§FIX-PER-SOLID-ZONE-CLASSIFICATION — the zone is a property of THE SOLID', () => {

    it('THE PREMISE: the door solid intersects the plane; the host wall solid does NOT', () => {
        // If this ever stops holding, every assertion below is vacuous — so it is asserted
        // FIRST, from the geometry, with no reference to any hierarchy.
        expect(solidIntersectsDepthPlane(hostedDoor(), VIEW_DEF, DIRECTION, 0)).toBe(true);
        expect(solidIntersectsDepthPlane(hostWall(),   VIEW_DEF, DIRECTION, 0)).toBe(false);
    });

    it('THE FOUNDER\'S BUG: the HOST WALL must NOT emit a single CUT edge — the door being cut is NOT the wall\'s business', () => {
        const wallCutEligible = solidIntersectsDepthPlane(hostWall(), VIEW_DEF, DIRECTION, 0);

        const { cutGeo, projGeo } = classifyByProjectionDepth(
            edgesOf(hostWall()), VIEW_DEF, DIRECTION,
            /* projectionDepth */ 12, /* farClipDepth */ 200, /* nearDepth */ 0,
            /* sectionBox */ null, /* epsilon */ undefined, wallCutEligible,
        );

        expect(segCount(cutGeo), 'a wall the plane never entered has NO cut edges').toBe(0);
        expect(segCount(projGeo), 'and all of its linework is PROJECTION').toBeGreaterThan(0);
    });

    it('THE BUG ITSELF, PINNED: run the SAME classifier UNGATED and the wall flips to CUT — so this guard is not vacuous', () => {
        // `solidIntersectsCutPlane = true` is the pre-L-282 behaviour, verbatim: the proximity
        // terms alone decide. The wall's front silhouette sits 2 cm behind a plane it never
        // enters — well inside the 15 cm CUT_LINE_EPSILON — and is declared CUT. In the founder's
        // model that same instant is when the door (3 cm proud) first meets the plane, so the two
        // events are SIMULTANEOUS and it reads as `Door == Cut => Wall == Cut`.
        //
        // If this assertion ever stops holding, the epsilon has changed and the guard above has
        // become tautological — which is exactly the failure mode the founder warned about
        // ("a test that only checks the second case passes today and proves nothing").
        const { cutGeo } = classifyByProjectionDepth(
            edgesOf(hostWall()), VIEW_DEF, DIRECTION, 12, 200, 0, null, undefined,
            /* solidIntersectsCutPlane — the OLD, ungated answer */ true,
        );
        expect(segCount(cutGeo), 'THE BUG: an un-intersected wall was given cut edges').toBeGreaterThan(0);
        // …and the solid it came from does not meet the plane. Both facts, side by side.
        expect(solidIntersectsDepthPlane(hostWall(), VIEW_DEF, DIRECTION, 0)).toBe(false);
    });

    it('THE DOOR IS STILL CUT — the fix must not buy the wall\'s correctness with the door\'s', () => {
        const doorCutEligible = solidIntersectsDepthPlane(hostedDoor(), VIEW_DEF, DIRECTION, 0);
        const { cutGeo } = classifyByProjectionDepth(
            edgesOf(hostedDoor()), VIEW_DEF, DIRECTION, 12, 200, 0, null, undefined, doorCutEligible,
        );
        expect(segCount(cutGeo), 'the door straddles the plane — it IS cut').toBeGreaterThan(0);
    });

    it('THE COROLLARY — NO CUT FACES: an un-intersected wall yields no plane∩solid section, so there is nothing to poché', () => {
        // The `:cut` FILL (poché) is stitched from `buildMeshPlaneIntersectionGeometry`.
        // A wall the plane never enters must contribute NOTHING to it — no cut face, no
        // poché region, no cut profile around the opening.
        expect(buildMeshPlaneIntersectionGeometry(hostWall(), VIEW_DEF, DIRECTION, 0)).toBeNull();
        // …while the door, which the plane DOES enter, yields its section.
        expect(buildMeshPlaneIntersectionGeometry(hostedDoor(), VIEW_DEF, DIRECTION, 0)).not.toBeNull();
    });

    it('THE COROLLARY — NO OPENING EDGES: the jamb + head edges belong to the WALL\'s cut representation, so a PROJECTION wall must not expose them', () => {
        const wallCutEligible = solidIntersectsDepthPlane(hostWall(), VIEW_DEF, DIRECTION, 0);
        const { cutGeo, projGeo } = classifyByProjectionDepth(
            edgesOf(hostWall()), VIEW_DEF, DIRECTION, 12, 200, 0, null, undefined, wallCutEligible,
        );

        // NOT ONE segment of the wall — least of all the ones bounding the opening — reaches
        // the cut layer. The opening reads as an ordinary projected outline, exactly like any
        // other projection wall.
        expect(cutGeo).toBeNull();

        // …and the opening edges ARE present, on PROJECTION. (Suppressing them entirely would
        // be the opposite error: the wall does have a hole in it.)
        const p = projGeo!.getAttribute('position') as THREE.BufferAttribute;
        const jambXs = Array.from({ length: p.count }, (_, i) => p.getX(i));
        expect(jambXs.some(x => Math.abs(x - VOID_X0) < 1e-4)).toBe(true);
        expect(jambXs.some(x => Math.abs(x - VOID_X1) < 1e-4)).toBe(true);
    });

    it('THE OUTCOME, AT THE PEN THE CANVAS RESOLVES: the wall paints PROJECTION, the door paints CUT', () => {
        const wallPen = penOfLayer(layerForZone('A-WALL', 'projection'), 'wall');
        const doorPen = penOfLayer(layerForZone('A-DOOR', 'cut'), 'door');
        const wallCut = penOfLayer(layerForZone('A-WALL', 'cut'), 'wall');

        // The wall reads as a projection wall: solid, thinner than a cut wall.
        expect(wallPen.dashPx).toBeNull();
        expect(wallPen.widthMm).toBeLessThan(wallCut.widthMm);
        // The door reads as cut. Two independent verdicts, from two independent solids.
        expect(doorPen.dashPx).toBeNull();
        expect(doorPen.widthMm).toBeGreaterThan(penOfLayer(layerForZone('A-DOOR', 'projection'), 'door').widthMm);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// (B) THE CONVERSE — push the plane INTO the wall and BOTH are cut.
//     *** A TEST THAT ONLY CHECKS THIS CASE PASSES TODAY AND PROVES NOTHING. ***
// ═══════════════════════════════════════════════════════════════════════════════

describe('§FIX-PER-SOLID-ZONE-CLASSIFICATION — push the plane INTO the wall and BOTH are cut', () => {
    // Plane at z = 0.12 — inside the wall's [0.02, 0.22] body AND inside the door's.
    const NEAR = 0.12;

    it('the wall is now genuinely intersected — cut edges AND a cut face', () => {
        const eligible = solidIntersectsDepthPlane(hostWall(), VIEW_DEF, DIRECTION, NEAR);
        expect(eligible).toBe(true);

        const { cutGeo } = classifyByProjectionDepth(
            edgesOf(hostWall()), VIEW_DEF, DIRECTION, 12, 200, NEAR, null, undefined, eligible,
        );
        expect(segCount(cutGeo)).toBeGreaterThan(0);
        expect(buildMeshPlaneIntersectionGeometry(hostWall(), VIEW_DEF, DIRECTION, NEAR)).not.toBeNull();
    });

    it('the door is cut too — and NEITHER verdict was borrowed from the other', () => {
        const eligible = solidIntersectsDepthPlane(hostedDoor(), VIEW_DEF, DIRECTION, NEAR);
        expect(eligible).toBe(true);
        const { cutGeo } = classifyByProjectionDepth(
            edgesOf(hostedDoor()), VIEW_DEF, DIRECTION, 12, 200, NEAR, null, undefined, eligible,
        );
        expect(segCount(cutGeo)).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// (C) THE SAME RULE IN PLAN — one rule, every view type (C09 §4.6, L-264)
// ═══════════════════════════════════════════════════════════════════════════════

describe('§FIX-PER-SOLID-ZONE-CLASSIFICATION — the plan classifier obeys the same granularity rule', () => {
    const CUT_Y = 1.2;

    /** A hosted window's head transom: a solid sitting ENTIRELY ABOVE the plan cut plane… */
    function headTransomAboveCut(): THREE.Mesh {
        return box(1, 2, CUT_Y + 0.06, CUT_Y + 0.16, 0, 0.1);   // 6 cm clear of the plane
    }

    it('a solid the plan cut plane never reaches contributes NO cut edges — even when it sits within the 15 cm epsilon', () => {
        const solid = headTransomAboveCut();
        expect(solidIntersectsPlanCutPlane(solid, CUT_Y)).toBe(false);

        const { cutGeo, projGeo } = classifyByVertexY(
            edgesOf(solid), CUT_Y, /* floorY */ 0, /* epsilon */ 0.15, /* belowY */ null,
            /* solidIntersectsCutPlane */ false,
        );
        // Its lower edge is 6 cm from the plane — WELL inside CUT_LINE_EPSILON. Proximity is
        // not intersection. The plane does not enter this solid, so this solid is not cut.
        expect(cutGeo).toBeNull();
        expect(segCount(projGeo)).toBeGreaterThan(0);
    });

    it('a wall the plan cut plane DOES pass through is cut — and yields its section', () => {
        const wall = box(0, WALL_LEN, 0, WALL_H, 0, 0.2);
        expect(solidIntersectsPlanCutPlane(wall, CUT_Y)).toBe(true);
        expect(buildPlanCutSectionGeometry(wall, CUT_Y)).not.toBeNull();
    });
});
