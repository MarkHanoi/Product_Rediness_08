/**
 * §ARC-DENSITY secondary — plan-view triangulation-leak regression.
 *
 * THE REPORTED SYMPTOM: in plan, the roof-by-region slab showed a FAN of
 * interior lines across the region instead of boundary + layer bands.
 *
 * ROOT-CAUSE FINDING (measured, 2026-08-07 scratchpad probes): the two plan
 * line paths for a slab both run `THREE.EdgesGeometry` over the SlabPart
 * geometry — the `SlabEdges` overlay at 30° and `EdgeProjectorService`'s
 * generic projection at 1° — and for a SIMPLE ring the flat caps are exactly
 * coplanar (every cap vertex shares one float Y), so interior earcut edges are
 * dropped at ANY threshold: the leak is NOT reproducible from a simple ring at
 * any density (probed n = 16/23/48 × thresholds 1°/10°/30° ⇒ 0 interior
 * segments). The fan the founder saw was fed by the SELF-INTERSECTING ring
 * (mixed pre/post-trim frame) whose earcut output is undefined — closed
 * upstream by §FIX-REGION-RING-PRETRIM-FRAME and gated by
 * §REFUSE-NONSIMPLE-SLAB-RING. This suite PINS that state so a future geometry
 * change (a non-manifold cap, duplicated ring vertices, a triangle-soup
 * rebuild) cannot silently re-open the leak, and proves the gate does NOT
 * erase legitimate cut edges (openings / stair carves = hole contours).
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';
import { wallPlanCenterline, type RegionPoint2D } from '../src/SlabRegionTracer';
import { outsetPolygon, SLAB_WALL_OUTSET } from '../src/SlabGeometryUtils';
import type { SlabData } from '../src/SlabTypes';

const THICKNESS = 0.3;

/** Founder shape class: 10 m × 8 m region whose south edge is a 10 m arc. */
function founderRing(): RegionPoint2D[] {
    const arc = wallPlanCenterline(
        [{ x: 0, z: 0 }, { x: 10, z: 0 }],
        { control: { x: 5, z: -5 }, segments: 16 },
    );
    return [...arc.slice(0, -1), { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
}

function slabData(polygon: RegionPoint2D[], holes?: RegionPoint2D[][]): SlabData {
    return {
        id: 'SB-test-leak',
        type: 'slab',
        levelId: 'L1',
        properties: {},
        width: 10,
        depth: 8,
        thickness: THICKNESS,
        position: { x: 0, y: 0, z: 0 },
        polygon,
        ...(holes ? { holes } : {}),
    } as SlabData;
}

function distToSeg(px: number, py: number, a: RegionPoint2D, b: RegionPoint2D): number {
    const abx = b.x - a.x, aby = b.y - a.y;
    const l2 = abx * abx + aby * aby;
    let t = l2 > 0 ? ((px - a.x) * abx + (py - a.y) * aby) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (a.x + abx * t), py - (a.y + aby * t));
}

/**
 * Split a mesh's EdgesGeometry cap segments into boundary vs interior, exactly
 * the classification the plan view cares about: an "interior" segment is a
 * horizontal cap edge whose midpoint lies on NEITHER the (outset) outer ring
 * NOR any hole contour — i.e. a triangulation edge leaking into the drawing.
 */
function auditCapEdges(
    geometry: THREE.BufferGeometry,
    thresholdDeg: number,
    boundaries: RegionPoint2D[][],
): { interior: number; boundary: number } {
    const edges = new THREE.EdgesGeometry(geometry, thresholdDeg);
    const pos = edges.getAttribute('position') as THREE.BufferAttribute;
    let interior = 0, boundary = 0;
    const onBoundary = (x: number, y: number) =>
        boundaries.some(r => r.some((a, i) => distToSeg(x, y, a, r[(i + 1) % r.length]!) < 1e-3));
    for (let i = 0; i + 1 < pos.count; i += 2) {
        const y0 = pos.getY(i), y1 = pos.getY(i + 1);
        const onTop = Math.abs(y0 - THICKNESS) < 1e-4 && Math.abs(y1 - THICKNESS) < 1e-4;
        const onBot = Math.abs(y0) < 1e-4 && Math.abs(y1) < 1e-4;
        if (!onTop && !onBot) continue;
        const mx = (pos.getX(i) + pos.getX(i + 1)) / 2;
        const mz = (pos.getZ(i) + pos.getZ(i + 1)) / 2;
        if (onBoundary(mx, mz)) boundary++;
        else interior++;
    }
    edges.dispose();
    return { interior, boundary };
}

describe('§ARC-DENSITY — plan-view triangulation leak stays closed', () => {
    it('the founder-class slab leaks ZERO interior cap edges on both plan line paths', () => {
        const ring = founderRing();
        const { mesh, edges } = SlabFragmentBuilder.createSlabMeshWithEdges(slabData(ring));
        expect(mesh.userData.degraded).toBeUndefined(); // ring is simple — no refusal

        const outset = outsetPolygon(ring, SLAB_WALL_OUTSET);
        // EdgeProjectorService path (1°) and the SlabEdges overlay path (30°).
        for (const threshold of [1, 30]) {
            const r = auditCapEdges(mesh.geometry as THREE.BufferGeometry, threshold, [outset]);
            expect(r.interior, `threshold=${threshold}`).toBe(0);
            expect(r.boundary, `threshold=${threshold}`).toBeGreaterThan(0);
        }
        // The overlay object the plan mode actually shows.
        const overlayGeo = (edges as THREE.LineSegments).geometry as THREE.BufferGeometry;
        const posCount = overlayGeo.getAttribute('position')!.count;
        expect(posCount).toBeGreaterThan(0);
    });

    it('legitimate cut edges (openings / stair carves) are NOT erased — hole contours survive', () => {
        const ring = founderRing();
        const hole: RegionPoint2D[] = [
            { x: 4, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 5 }, { x: 4, y: 5 },
        ];
        const { mesh } = SlabFragmentBuilder.createSlabMeshWithEdges(slabData(ring, [hole]));
        const outset = outsetPolygon(ring, SLAB_WALL_OUTSET);

        for (const threshold of [1, 30]) {
            const all = auditCapEdges(mesh.geometry as THREE.BufferGeometry, threshold, [outset, hole]);
            expect(all.interior, `threshold=${threshold}`).toBe(0);
            // Without counting the hole as boundary, its edges would read as
            // "interior" — assert they exist and are classified as boundary.
            const noHole = auditCapEdges(mesh.geometry as THREE.BufferGeometry, threshold, [outset]);
            expect(noHole.interior, `threshold=${threshold} hole edges present`).toBeGreaterThanOrEqual(8);
        }
    });

    it('a denser ring (authored 48 chords) still leaks nothing', () => {
        const arc = wallPlanCenterline(
            [{ x: 0, z: 0 }, { x: 10, z: 0 }],
            { control: { x: 5, z: -5 }, segments: 48 },
        );
        const ring = [...arc.slice(0, -1), { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }];
        const { mesh } = SlabFragmentBuilder.createSlabMeshWithEdges(slabData(ring));
        const outset = outsetPolygon(ring, SLAB_WALL_OUTSET);
        const r = auditCapEdges(mesh.geometry as THREE.BufferGeometry, 1, [outset]);
        expect(r.interior).toBe(0);
    });
});
