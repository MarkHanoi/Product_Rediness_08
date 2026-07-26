// ─── Stair tread tiling + landing↔run gap regression (§FIX-STAIR-LANDING-RUN-GAP) ───
// Founder defect (screenshot): on an L-shaped stair there was a visible GAP/seam
// where the LANDING meets the SECOND run — the first tread ("thread") of run 2 did
// not butt the landing's outbound edge.
//
// Root cause: StairMeshBuilder.buildStairGeometry advanced `currentPosition` by a
// FULL tread BEFORE placing the tread (and riser/nosing) AT that advanced point, so
// every flight's treads were shifted forward by half a tread from the flight start.
// For a post-landing flight (run 2) that forward shift opened a half-tread hole
// between the landing's outbound edge (= the flight start) and the flight's first
// riser; it also mismatched the stringers, which StairStringerBuilder lays from the
// flight start. The fix places tread/riser/nosing at the step MIDPOINT (retreating
// flightTread/2), so each flight tiles its drawn span [flightStart, flightStart+run]
// exactly.
//
// This spec drives the REAL StairMeshBuilder.buildStairGeometry and inspects the
// emitted tread geometry. Node vitest with a minimal window stub (the builder ctor
// wires window/runtime listeners), matching the sibling StairRailingInstancing.spec.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

const _origWindow = (globalThis as any).window;
beforeEach(() => {
    (globalThis as any).window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        runtime: { events: { on: vi.fn() } },
    };
});
afterEach(() => {
    (globalThis as any).window = _origWindow;
});

import { StairMeshBuilder } from '../StairMeshBuilder';
import type { StairData } from '../StairTypes';

/** min/max of every vertex of a geometry projected onto a world axis. */
function extent(geo: THREE.BufferGeometry, axis: 'x' | 'y' | 'z'): { min: number; max: number } {
    const pos = geo.getAttribute('position');
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < pos.count; i++) {
        const v = axis === 'x' ? pos.getX(i) : axis === 'y' ? pos.getY(i) : pos.getZ(i);
        if (v < min) min = v;
        if (v > max) max = v;
    }
    return { min, max };
}

const baseProps = {
    riserVisible: true, nosingType: 'none' as const, nosingDepth: 0.025,
    stringerType: 'none' as const, handrailLeft: false, handrailRight: false, handrailHeight: 1.0,
};

function makeBuilder(): StairMeshBuilder {
    const stubStore = { get: () => undefined, getById: () => undefined } as any;
    return new StairMeshBuilder(stubStore);
}

describe('Stair tread tiling + landing↔run gap (§FIX-STAIR-LANDING-RUN-GAP)', () => {
    // ── (i) Single flight: treads tile [start, start+run] with NO half-tread shift ──
    it('an I-stair tiles treads from the START point, contiguously, to the flight end', () => {
        const T = 0.28, N = 5, W = 1.0;
        const stair = {
            id: 's-i', type: 'stair', levelId: 'L0', baseLevelId: 'L0', topLevelId: 'L1',
            baseOffset: 0, topOffset: 0, shape: 'I',
            startPosition: { x: 0, y: 0, z: 0 },
            width: W, riserHeight: 0.18, treadDepth: T, riserCount: N,
            flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount: N, treadDepth: T }],
            landings: [],
            properties: baseProps,
        } as unknown as StairData;

        const { treads } = makeBuilder().buildStairGeometry(stair);
        // nosing + stringer are OFF, so `treads` is exactly the N step treads.
        expect(treads.length).toBe(N);

        const spans = treads.map(g => extent(g, 'x')).sort((a, b) => a.min - b.min);

        // THE fix: the first tread's near edge sits at the start point (x = 0),
        // NOT half a tread forward (pre-fix would be T/2 = 0.14).
        expect(spans[0].min).toBeCloseTo(0, 6);
        // Treads butt cleanly end-to-end (no gaps, no overlaps).
        for (let i = 1; i < spans.length; i++) {
            expect(spans[i].min).toBeCloseTo(spans[i - 1].max, 6);
        }
        // The run ends exactly at flightStart + N*T.
        expect(spans[spans.length - 1].max).toBeCloseTo(N * T, 6);
    });

    // ── (ii) L-stair: run 2's first tread butts the landing outbound edge (no gap) ──
    it('an L-stair second run starts flush with the landing (no gap between landing and run 2)', () => {
        const T = 0.28, N = 5, W = 1.0;
        const flight1Run = N * T;                 // 1.4
        const cornerX = flight1Run + W / 2;       // 1.9  (polyline corner)
        const landingFarEdgeZ = W / 2;            // 0.5  (landing +Z edge = run-2 start)
        const startOverride = { x: cornerX, y: 0, z: landingFarEdgeZ };

        const stair = {
            id: 's-l', type: 'stair', levelId: 'L0', baseLevelId: 'L0', topLevelId: 'L1',
            baseOffset: 0, topOffset: 0, shape: 'L',
            startPosition: { x: 0, y: 0, z: 0 },
            width: W, riserHeight: 0.18, treadDepth: T, riserCount: 2 * N,
            flights: [
                { direction: { x: 1, y: 0, z: 0 }, riserCount: N, treadDepth: T },
                { direction: { x: 0, y: 0, z: 1 }, riserCount: N, treadDepth: T, startOverride },
            ],
            landings: [{ depth: W, center: { x: cornerX, y: 0, z: 0 } }],
            properties: baseProps,
        } as unknown as StairData;

        const { treads } = makeBuilder().buildStairGeometry(stair);

        // Run-2 treads are the ones that extend past the landing's +Z far edge.
        const run2 = treads.filter(g => extent(g, 'z').max > landingFarEdgeZ + 0.01);
        expect(run2.length).toBe(N);

        // The nearest run-2 tread edge coincides with the landing outbound edge —
        // no gap. Pre-fix this was landingFarEdgeZ + T/2 (a half-tread hole).
        const nearEdgeZ = Math.min(...run2.map(g => extent(g, 'z').min));
        expect(nearEdgeZ).toBeCloseTo(landingFarEdgeZ, 6);
    });
});
