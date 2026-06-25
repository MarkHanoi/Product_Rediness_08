/**
 * §WALL-NAN-GUARD (2026-06-25) — REGRESSION test.
 *
 * THE DEFECT: the §RESI-FACADE-INTERIOR-WHITE change made exterior perimeter walls
 * LAYERED (façade / structure / interior-white). Perimeter walls also carry windows,
 * so they take the `buildLayeredWallSegmentsAroundOpenings` path. That path read
 * `wall.baseOffset` WITHOUT a `?? 0` default (the plain-wall path defaults it via
 * §FIX-NAN-Y). The residential shell-wall generator does NOT stamp baseOffset, so it
 * arrived `undefined` → `wallBaseOffset + y === NaN` for EVERY vertex Y → the
 * BufferGeometry's computeBoundingBox()/computeBoundingSphere() spammed
 * "Computed min/max have NaN values" / "radius is NaN" once per wall rebuild, and the
 * wall vanished from the scene ("perimeter walls did not render this time").
 *
 * THE FIX: default baseOffset to 0 at the call boundary (root) PLUS a defence-in-depth
 * non-finite coercion + final NaN-vertex backstop inside buildContinuousLayerGeometry
 * that falls back to a valid plain box if any vertex is still non-finite.
 *
 * These tests assert that a layered wall with openings and an UNDEFINED baseOffset
 * produces an all-finite geometry (no NaN positions → no NaN bounding volumes).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { buildLayeredWallSegmentsAroundOpenings, clusterOpenings } from '../src/LayeredWallOpeningBuilder';
import { buildMiterPrism } from '../src/MiterPrismBuilder';
import type { WallData } from '../src/WallTypes';

function allFinite(geo: THREE.BufferGeometry): boolean {
    const pos = geo.getAttribute('position');
    if (!pos) return false;
    const arr = pos.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) {
        if (!Number.isFinite(arr[i])) return false;
    }
    return true;
}

/** A layered exterior shell wall with a window — the regression shape. */
function layeredWallWithWindow(baseOffset: number | undefined): WallData {
    return {
        id: 'wall-resi-shell-1',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
        height: 3,
        thickness: 0.2,
        // The defect: baseOffset arrives undefined from the generator path.
        baseOffset: baseOffset as number,
        layers: [
            { name: 'Façade Finish', function: 'finish-exterior', thickness: 0.02, materialColor: '#e2c044' },
            { name: 'Structure', function: 'structure', thickness: 0.16, materialColor: '#d9d4cc' },
            { name: 'Paint - Matt Emulsion', function: 'finish-interior', thickness: 0.02, materialColor: '#f4f1ec' },
        ],
        openings: [
            { id: 'op-1', offset: 2, width: 1.2, height: 1.2, sillHeight: 0.9, type: 'window', elementId: 'win-1' },
        ],
    } as unknown as WallData;
}

describe('§WALL-NAN-GUARD — layered wall with window + undefined baseOffset', () => {
    it('produces all-finite geometry when baseOffset is undefined (was NaN flood)', () => {
        const wall = layeredWallWithWindow(undefined);
        const group = new THREE.Group();
        const totalThickness = wall.layers!.reduce((s, l: any) => s + l.thickness, 0);
        const clusters = clusterOpenings([...wall.openings!] as any);
        const meshes = buildLayeredWallSegmentsAroundOpenings(wall, group, clusters, totalThickness);
        expect(meshes.length).toBe(3); // one per layer
        for (const m of meshes) {
            expect(allFinite(m.geometry as THREE.BufferGeometry)).toBe(true);
            const g = m.geometry as THREE.BufferGeometry;
            g.computeBoundingBox();
            g.computeBoundingSphere();
            expect(Number.isFinite(g.boundingSphere!.radius)).toBe(true);
            expect(Number.isFinite(g.boundingBox!.min.y)).toBe(true);
            expect(Number.isFinite(g.boundingBox!.max.y)).toBe(true);
        }
    });

    it('still produces finite geometry for a normal baseOffset (no regression)', () => {
        const wall = layeredWallWithWindow(0);
        const group = new THREE.Group();
        const totalThickness = wall.layers!.reduce((s, l: any) => s + l.thickness, 0);
        const clusters = clusterOpenings([...wall.openings!] as any);
        const meshes = buildLayeredWallSegmentsAroundOpenings(wall, group, clusters, totalThickness);
        for (const m of meshes) {
            expect(allFinite(m.geometry as THREE.BufferGeometry)).toBe(true);
        }
    });
});

describe('§WALL-NAN-GUARD — buildMiterPrism hardening', () => {
    it('square-caps a non-finite miter normal instead of emitting NaN vertices', () => {
        const geo = buildMiterPrism(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(4, 0, 0),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(4, 0, 0),
            0.1, 3, 0,
            { nx: NaN, nz: NaN },   // poisoned miter normal
            null,
        );
        expect(allFinite(geo)).toBe(true);
    });

    it('coerces an undefined baseOffset (NaN) to finite geometry', () => {
        const geo = buildMiterPrism(
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(4, 0, 0),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(4, 0, 0),
            0.1, 3, (undefined as unknown as number),
            null, null,
        );
        expect(allFinite(geo)).toBe(true);
    });
});
