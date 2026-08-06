// @vitest-environment happy-dom
//
// §FIX-CURVED-WALL-MITER-WATERTIGHT — curved-wall plan poché regression suite.
//
// THE DEFECT (founder, live-tested 2026-08-05): in the 2D plan view a CURVED wall
// renders as an UNFILLED outline while the straight walls around it get the
// default-grey poché fill.
//
// ROOT CAUSE (probe-proven in this suite's own history): the §06-FIX miter
// projection in the curved-wall builders (WallFragmentBuilder §03-1.2 branch and
// CurvedWallLayerBuilder) moved the CAP QUAD onto the shared miter plane but left
// the outer/inner/top/bottom face strips ending at the UNPROJECTED terminal-station
// corners. At every wall join the solid therefore had a slit between face-end and
// cap. Invisible in 3D (the neighbouring wall covers the joint) — fatal in plan:
// the true cut section (`buildPlanCutSectionGeometry`, L-246) of a non-watertight
// solid is an OPEN chain, and `PocheFillBuilder` stitches CLOSED loops only, so a
// JOINED curved wall produced ZERO poché polygons. The founder chains walls
// (polyline mode: endpoint becomes the next start), so every live curved wall was
// joined — hence "curved is always hollow".
//
// THE FIX: one corner table per builder — each station's outer/inner corner is
// computed once, the TERMINAL corners are miter-projected, and the face strips AND
// the caps consume the SAME table. Watertight by construction; the section closes;
// the poché stitches. No arc representation was added or changed (the wall's ONE
// `curve: { control, segments }` descriptor still drives everything).
//
// The chain under test is the real one: WallFragmentBuilder / buildCurvedLayerGeometry
// → buildPlanCutSectionGeometry (true plane∩triangle section) → PocheFillBuilder.
//
// Contracts: C11 (one creation/render pipeline per element), C04 (geometry built in
// the renderer-three owner), ADR-121/C09 §4.6 solidity rule (a cut solid is FILLED).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { buildPlanCutSectionGeometry } from '../src/engine/views/EdgeProjectorService.js';
import { PocheFillBuilder } from '@pryzm/core-app-model';
import {
    WallFragmentBuilder,
    buildCurvedLayerGeometry,
    computeStations,
} from '@pryzm/geometry-wall';

const CUT = 1.2;
/** 45° miter normal — what WallJoinResolver hands the curved branch when the
 *  founder chains a straight wall into a curved one at a shared endpoint. */
const MITER_45 = { nx: Math.SQRT1_2, nz: Math.SQRT1_2 };

/** A real curved wall record for the legacy render store shape. */
function curvedWall(id: string, layers?: Array<{ name: string; function: string; thickness: number }>) {
    return {
        id,
        type: 'wall',
        levelId: 'L0',
        baseLine: [
            { x: 0, y: 0, z: 0 },
            { x: 4, y: 0, z: 0 },
        ],
        height: 2.7,
        thickness: 0.2,
        baseOffset: 0,
        openings: [],
        curve: { control: { x: 2, y: 0, z: 3 }, segments: 16 },
        ...(layers ? { layers } : {}),
    } as never;
}

function buildViaFragmentBuilder(joinData: object | null): THREE.Mesh {
    const scene = new THREE.Scene();
    const bimManager = { getLevelById: () => ({ id: 'L0', elevation: 0 }) };
    const builder = new WallFragmentBuilder(scene, bimManager as never);
    builder.buildWall(curvedWall('wall_curved_test'), joinData as never, undefined, 0);
    let found: THREE.Mesh | null = null;
    scene.traverse((o) => {
        if (!found && o instanceof THREE.Mesh && o.userData?.elementType === 'WallPart') found = o;
    });
    expect(found).not.toBeNull();
    (found as unknown as THREE.Mesh).updateWorldMatrix(true, false);
    return found as unknown as THREE.Mesh;
}

/** Cut the mesh at the plan cut plane and stitch poché polygons. */
function pocheOf(mesh: THREE.Mesh) {
    const cut = buildPlanCutSectionGeometry(mesh, CUT);
    expect(cut).not.toBeNull();
    return PocheFillBuilder.fromGeometry(cut!, '#c9c9c9', 1);
}

describe('§FIX-CURVED-WALL-MITER-WATERTIGHT — curved wall plan poché', () => {
    it('an UNJOINED curved wall yields exactly ONE closed poché region (baseline)', () => {
        const polys = pocheOf(buildViaFragmentBuilder(null));
        expect(polys).toHaveLength(1);
        expect(polys[0]!.points.split(/\s+/).length).toBeGreaterThanOrEqual(8);
    });

    it('a JOINED curved wall (mitered start cap) STILL yields ONE closed region (the bug)', () => {
        // THE DEFECT: before the fix this produced ZERO polygons — the mitered cap
        // was disconnected from the face strips, the section chain never closed,
        // and the founder's chained curved wall drew hollow in plan.
        const polys = pocheOf(buildViaFragmentBuilder({ startMN: MITER_45, endMN: null }));
        expect(polys).toHaveLength(1);
    });

    it('a curved wall mitered at BOTH ends closes too (mid-polyline segment)', () => {
        const polys = pocheOf(buildViaFragmentBuilder({
            startMN: MITER_45,
            endMN: { nx: -Math.SQRT1_2, nz: Math.SQRT1_2 },
        }));
        expect(polys).toHaveLength(1);
    });

    it('a LAYERED curved wall layer with a mitered cap yields a closed region per layer', () => {
        const start = new THREE.Vector3(0, 0, 0);
        const end = new THREE.Vector3(4, 0, 0);
        const ctrl = new THREE.Vector3(2, 0, 3);
        const stations = computeStations(start, end, ctrl, 16);
        const layers = [
            { name: 'Skin', function: 'finish-exterior', thickness: 0.02 },
            { name: 'Core', function: 'structure', thickness: 0.16 },
            { name: 'Board', function: 'finish-interior', thickness: 0.02 },
        ];
        const total = layers.reduce((s, l) => s + l.thickness, 0);
        let cursor = -total / 2;
        const startCapTan = { x: ctrl.x / Math.hypot(ctrl.x, ctrl.z), z: ctrl.z / Math.hypot(ctrl.x, ctrl.z) };

        for (const layer of layers) {
            const layerCenter = cursor + layer.thickness / 2;
            cursor += layer.thickness;
            const geom = buildCurvedLayerGeometry(
                layer as never,
                layerCenter,
                stations,
                2.7,
                0,
                layer.thickness / 2,
                MITER_45,     // joined at start — the defect path
                null,
                startCapTan,
                null,
            );
            const mesh = new THREE.Mesh(geom);
            mesh.updateMatrixWorld(true);
            const polys = pocheOf(mesh);
            // Before the fix: 0 polygons per mitered layer — hollow layered curved wall.
            expect(polys).toHaveLength(1);
        }
    });
});
