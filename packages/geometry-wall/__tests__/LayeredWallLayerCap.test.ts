/**
 * §PERF-PHASE2 — layered-wall mesh-explosion cap regression tests.
 *
 * A layered wall with openings emits one mesh+material PER LAYER. A system type that
 * stacks many layers therefore produces many draw calls per wall, multiplied across a
 * façade — the layered-wall mesh explosion the spike flagged.
 *
 * Cap (buildLayeredWallSegmentsAroundOpenings): once the layer count exceeds
 * MAX_WALL_LAYER_SEGMENTS, layers that share an IDENTICAL material colour are MERGED
 * into one mesh per colour. Distinct-colour layers stay separate (visual result
 * preserved). Under the threshold the path is byte-identical (no merge).
 *
 * These tests pin: (a) under-threshold → one mesh per layer (unchanged); (b)
 * over-threshold with shared colours → fewer meshes, one per distinct colour, all
 * geometry finite, total triangle count preserved (no geometry dropped); (c)
 * over-threshold with all-distinct colours → NO merge (visual result identical).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    buildLayeredWallSegmentsAroundOpenings,
    clusterOpenings,
    MAX_WALL_LAYER_SEGMENTS,
} from '../src/LayeredWallOpeningBuilder';
import type { WallData } from '../src/WallTypes';

function allFinite(geo: THREE.BufferGeometry): boolean {
    const pos = geo.getAttribute('position');
    if (!pos) return false;
    const arr = pos.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
    return true;
}

function triCount(geo: THREE.BufferGeometry): number {
    const idx = geo.getIndex();
    if (idx) return idx.count / 3;
    return (geo.getAttribute('position')?.count ?? 0) / 3;
}

interface LayerSpec { name: string; color: string; thickness: number; }

function layeredWall(layers: LayerSpec[]): WallData {
    return {
        id: 'wall-cap-1',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
        height: 3,
        thickness: layers.reduce((s, l) => s + l.thickness, 0),
        baseOffset: 0,
        layers: layers.map(l => ({
            name: l.name, function: 'structure', thickness: l.thickness, materialColor: l.color,
        })),
        openings: [
            { id: 'op-1', offset: 2, width: 1.2, height: 1.2, sillHeight: 0.9, type: 'window', elementId: 'win-1' },
        ],
    } as unknown as WallData;
}

function build(wall: WallData): THREE.Mesh[] {
    const group = new THREE.Group();
    const totalThickness = wall.layers!.reduce((s, l: any) => s + l.thickness, 0);
    const clusters = clusterOpenings([...wall.openings!] as any);
    return buildLayeredWallSegmentsAroundOpenings(wall, group, clusters, totalThickness);
}

describe('§PERF-PHASE2 layered-wall layer cap', () => {
    it('threshold is the documented value', () => {
        expect(MAX_WALL_LAYER_SEGMENTS).toBe(4);
    });

    it('UNDER threshold (3 layers): one mesh per layer (byte-identical path)', () => {
        const meshes = build(layeredWall([
            { name: 'a', color: '#111111', thickness: 0.02 },
            { name: 'b', color: '#222222', thickness: 0.16 },
            { name: 'c', color: '#333333', thickness: 0.02 },
        ]));
        expect(meshes.length).toBe(3);
        for (const m of meshes) {
            expect((m.userData as any).layerMerged).toBeUndefined();
            expect(allFinite(m.geometry as THREE.BufferGeometry)).toBe(true);
        }
    });

    it('OVER threshold with shared colours: merges to one mesh per distinct colour', () => {
        // 6 layers, 2 distinct colours (3 + 3). 6 > 4 → cap engages.
        const meshes = build(layeredWall([
            { name: 'brick-1', color: '#aa0000', thickness: 0.05 },
            { name: 'brick-2', color: '#aa0000', thickness: 0.05 },
            { name: 'brick-3', color: '#aa0000', thickness: 0.05 },
            { name: 'board-1', color: '#0000bb', thickness: 0.05 },
            { name: 'board-2', color: '#0000bb', thickness: 0.05 },
            { name: 'board-3', color: '#0000bb', thickness: 0.05 },
        ]));
        // 6 layer meshes collapse to 2 (one per colour).
        expect(meshes.length).toBe(2);
        const colors = meshes.map(m => '#' + (m.material as THREE.MeshStandardMaterial).color.getHexString());
        expect(new Set(colors)).toEqual(new Set(['#aa0000', '#0000bb']));
        for (const m of meshes) {
            expect((m.userData as any).layerMerged).toBe(true);
            expect((m.userData as any).wallId).toBe('wall-cap-1');
            expect(allFinite(m.geometry as THREE.BufferGeometry)).toBe(true);
        }
    });

    it('OVER threshold preserves total triangle count (no geometry dropped on merge)', () => {
        const layers: LayerSpec[] = [
            { name: 'l1', color: '#aa0000', thickness: 0.05 },
            { name: 'l2', color: '#aa0000', thickness: 0.05 },
            { name: 'l3', color: '#aa0000', thickness: 0.05 },
            { name: 'l4', color: '#aa0000', thickness: 0.05 },
            { name: 'l5', color: '#aa0000', thickness: 0.05 },
        ];
        // Sum of per-layer tris built individually (force per-layer by staying ≤ threshold
        // is not possible at 5; instead compute expected via a separate single-colour pair).
        const merged = build(layeredWall(layers));
        expect(merged.length).toBe(1); // all same colour → one merged mesh
        const mergedTris = triCount(merged[0]!.geometry as THREE.BufferGeometry);

        // Reference: build each layer's geometry count by building a 1-layer wall per layer.
        let refTris = 0;
        for (const l of layers) {
            const one = build(layeredWall([l])); // 1 layer ≤ threshold → per-layer path
            refTris += triCount(one[0]!.geometry as THREE.BufferGeometry);
        }
        expect(mergedTris).toBe(refTris);
    });

    it('OVER threshold with ALL-DISTINCT colours: NO merge (visual result preserved)', () => {
        const meshes = build(layeredWall([
            { name: 'a', color: '#100000', thickness: 0.04 },
            { name: 'b', color: '#200000', thickness: 0.04 },
            { name: 'c', color: '#300000', thickness: 0.04 },
            { name: 'd', color: '#400000', thickness: 0.04 },
            { name: 'e', color: '#500000', thickness: 0.04 },
        ]));
        // 5 distinct colours, 5 > 4 → cap engages but each colour group has size 1 → no merge.
        expect(meshes.length).toBe(5);
        for (const m of meshes) {
            expect((m.userData as any).layerMerged).toBeUndefined();
            expect((m.userData as any).layerIndex).toBeTypeOf('number');
        }
    });
});
