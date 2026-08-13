/**
 * reprojectFinishBoundary — the pure re-derivation, exercised against sketches
 * PRODUCED BY THE PRODUCTION ATTRIBUTOR (`buildRoomFinishBoundarySketch`, the
 * same function every conforming finish path calls — C79 §6.3 rows 6-10).
 *
 * C74 §3.4: this file never writes a `hostReference` literal for the follow
 * cases — every reference under test was minted by the producer, so a producer
 * that stopped emitting references would turn this suite red rather than be
 * masked by it. (The REFUSAL cases — non-centreline frame, missing fallback —
 * hand-craft deliberately invalid edges, because production cannot mint them and
 * the refusal is the thing under test.)
 *
 * Relative import into command-registry source follows the worked precedent of
 * `geometry-slab/__tests__/c79MovePropagation.test.ts:79`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { buildRoomFinishBoundarySketch } from '../../command-registry/src/rooms/roomBoundarySketch';
import { WallFaceResolver } from '../../geometry-slab/src/WallFaceResolver';
import { SketchLoopIntersector } from '../../geometry-slab/src/SketchLoopIntersector';
import { resolveFinishHostEdgeXZ, type FinishSketchEdgeLike, type XZ } from '../src/FinishSegmentAdapter';
import {
    reprojectFinishBoundary,
    signedAreaXZ,
    type WallSnapshotLike,
} from '../src/reprojectFinishBoundary';

// ── probe wall store — subject of the move, source of nothing (C74 §3.4) ─────

type ProbeWall = { id: string; baseLine: { x: number; y: number; z: number }[]; thickness: number };

class ProbeWallStore {
    private walls = new Map<string, ProbeWall>();
    seed(w: ProbeWall): void { this.walls.set(w.id, w); }
    getById(id: string): ProbeWall | undefined { return this.walls.get(id); }
    vanish(id: string): void { this.walls.delete(id); }
    /** THE ACT: translate a wall's centreline; returns the PRE-move snapshot. */
    move(id: string, dx: number, dz: number): WallSnapshotLike {
        const w = this.walls.get(id);
        if (!w) throw new Error(`probe wall "${id}" not seeded`);
        const prev: WallSnapshotLike = {
            id: w.id,
            baseLine: w.baseLine.map((p) => ({ ...p })),
            thickness: w.thickness,
        };
        w.baseLine = w.baseLine.map((p) => ({ x: p.x + dx, y: p.y, z: p.z + dz }));
        return prev;
    }
}

/** C79 §10.3's reference fixture: a 6 m × 4 m room of four 200 mm walls. */
function seedRoom(store: ProbeWallStore): void {
    const w = (id: string, x0: number, z0: number, x1: number, z1: number): ProbeWall => ({
        id,
        baseLine: [{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }],
        thickness: 0.2,
    });
    store.seed(w('w-south', 0, 0, 6, 0));
    store.seed(w('w-east', 6, 0, 6, 4));
    store.seed(w('w-north', 6, 4, 0, 4));
    store.seed(w('w-west', 0, 4, 0, 0));
}

/** The ring the finish commands store: inset 100 mm to the walls' inner faces. */
const RING: XZ[] = [
    { x: 0.1, z: 0.1 },
    { x: 5.9, z: 0.1 },
    { x: 5.9, z: 3.9 },
    { x: 0.1, z: 3.9 },
];

let walls: ProbeWallStore;

/** The PRODUCTION producer — the same call every conforming finish path makes. */
function producedSketch(boundingWallIds: string[] = ['w-south', 'w-east', 'w-north', 'w-west']) {
    return buildRoomFinishBoundarySketch(RING, 'room-1', {
        getRoomById: () => ({ boundingWallIds }),
        getWallById: (id) => {
            const w = walls.getById(id);
            return w
                ? { id: w.id, baseLine: w.baseLine.map((p) => ({ x: p.x, z: p.z })), thickness: w.thickness }
                : undefined;
        },
    });
}

const liveResolve = (edge: Parameters<typeof resolveFinishHostEdgeXZ>[1]) => resolveFinishHostEdgeXZ(WallFaceResolver, edge);

beforeEach(() => {
    walls = new ProbeWallStore();
    seedRoom(walls);
    Object.assign(window, { wallStore: walls });
});

afterEach(() => {
    Object.assign(window, { wallStore: undefined });
});

describe("'resized' — the founder's question, floor-finish edition", () => {
    it('a 2 m move of w-north re-derives the ring: 22.040 m² → 33.640 m², inset preserved', () => {
        const sketch = producedSketch();
        expect(sketch.attribution.hostEdges).toBe(4);

        const prev = walls.move('w-north', 0, 2);
        const result = reprojectFinishBoundary({
            edges: sketch.outerLoop.edges,
            movedWallId: 'w-north',
            prevWall: prev,
            resolveHostSegmentXZ: liveResolve,
            intersector: SketchLoopIntersector,
        });

        expect(result.state).toBe('resized');
        expect(result.numbers!.oldAreaM2).toBeCloseTo(22.04, 6);
        expect(result.numbers!.newAreaM2).toBeCloseTo(33.64, 6);

        // The moved edge sits 100 mm INSIDE the new centreline (z = 6), exactly
        // where it sat relative to the old one — the measured-inset re-application.
        const ring = result.polygon!;
        expect(ring).toHaveLength(4);
        expect(ring[2]!.x).toBeCloseTo(5.9, 9);
        expect(ring[2]!.z).toBeCloseTo(5.9, 9);
        expect(ring[3]!.x).toBeCloseTo(0.1, 9);
        expect(ring[3]!.z).toBeCloseTo(5.9, 9);
        // Index alignment preserved: the south corners did not move AND kept
        // their indices (edge i still runs ring[i] → ring[(i+1) % n]).
        expect(ring[0]!.x).toBeCloseTo(0.1, 9);
        expect(ring[0]!.z).toBeCloseTo(0.1, 9);
        expect(ring[1]!.x).toBeCloseTo(5.9, 9);
        expect(ring[1]!.z).toBeCloseTo(0.1, 9);
    });

    it('§4.3 — every edge geometry (host fallbacks) is refreshed to the new ring', () => {
        const sketch = producedSketch();
        const prev = walls.move('w-north', 0, 2);
        const result = reprojectFinishBoundary({
            edges: sketch.outerLoop.edges,
            movedWallId: 'w-north',
            prevWall: prev,
            resolveHostSegmentXZ: liveResolve,
            intersector: SketchLoopIntersector,
        });

        expect(result.state).toBe('resized');
        const ring = result.polygon!;
        const edges = result.edges!;
        edges.forEach((edge, i) => {
            const geom = edge.type === 'freeLine' ? { start: edge.start, end: edge.end } : edge.fallback!;
            expect(geom.start.x).toBeCloseTo(ring[i]!.x, 9);
            expect(geom.start.z).toBeCloseTo(ring[i]!.z, 9);
            expect(geom.end.x).toBeCloseTo(ring[(i + 1) % 4]!.x, 9);
            expect(geom.end.z).toBeCloseTo(ring[(i + 1) % 4]!.z, 9);
        });
        // The references themselves survive untouched — re-projection must never
        // degrade an edge (C79 §4.4: degradation is a state change with a cause).
        expect(edges.filter((e) => e.type === 'hostReference')).toHaveLength(4);
    });

    it('a FREE edge (id-less wall) trims/extends along its own unchanged line when a neighbour moves', () => {
        // East wall drops out of attribution: the producer refuses it (noWallId)
        // and mints a freeLine — the honest fallback, produced by production code.
        const sketch = producedSketch(['w-south', 'w-north', 'w-west']);
        expect(sketch.attribution.hostEdges).toBe(3);
        expect(sketch.attribution.freeEdges).toBe(1);

        const prev = walls.move('w-north', 0, 2);
        const result = reprojectFinishBoundary({
            edges: sketch.outerLoop.edges,
            movedWallId: 'w-north',
            prevWall: prev,
            resolveHostSegmentXZ: liveResolve,
            intersector: SketchLoopIntersector,
        });

        expect(result.state).toBe('resized');
        const ring = result.polygon!;
        // The free east edge's LINE is unchanged (x = 5.9) but its far endpoint
        // extended to meet the moved north edge.
        expect(ring[1]).toEqual({ x: 5.9, z: 0.1 });
        expect(ring[2]!.x).toBeCloseTo(5.9, 9);
        expect(ring[2]!.z).toBeCloseTo(5.9, 9);
    });

    it('§5.1 — re-derivation is deterministic: identical inputs, identical outputs', () => {
        const sketch = producedSketch();
        const prev = walls.move('w-north', 0, 2);
        const input = {
            edges: sketch.outerLoop.edges,
            movedWallId: 'w-north',
            prevWall: prev,
            resolveHostSegmentXZ: liveResolve,
            intersector: SketchLoopIntersector,
        };
        const a = reprojectFinishBoundary(input);
        const b = reprojectFinishBoundary(input);
        expect(b).toEqual(a);
    });
});

describe("'preserved' — nothing happened, and we checked", () => {
    it('a zero-move re-derives an identical ring and reports preserved (no output geometry)', () => {
        const sketch = producedSketch();
        const prev = walls.move('w-north', 0, 0);
        const result = reprojectFinishBoundary({
            edges: sketch.outerLoop.edges,
            movedWallId: 'w-north',
            prevWall: prev,
            resolveHostSegmentXZ: liveResolve,
            intersector: SketchLoopIntersector,
        });
        expect(result.state).toBe('preserved');
        expect(result.polygon).toBeUndefined();
        expect(result.edges).toBeUndefined();
    });

    it('a wall the sketch does not reference reports preserved with the non-dependency named', () => {
        const sketch = producedSketch();
        const prev = walls.move('w-north', 0, 2);
        void prev;
        const result = reprojectFinishBoundary({
            edges: sketch.outerLoop.edges,
            movedWallId: 'w-detached',
            prevWall: { id: 'w-detached', baseLine: [{ x: 0, z: 10 }, { x: 6, z: 10 }] },
            resolveHostSegmentXZ: liveResolve,
            intersector: SketchLoopIntersector,
        });
        expect(result.state).toBe('preserved');
        expect(result.subReason).toContain('w-detached');
    });
});

describe("'undetermined' — C79 §5.2.1: never collapsed into preserved, reason from C78 §8.1", () => {
    it('no prevState → STALE_DERIVED_STATE / no-prevState (C72 §3.5 forbids re-reading the store)', () => {
        const sketch = producedSketch();
        walls.move('w-north', 0, 2);
        const result = reprojectFinishBoundary({
            edges: sketch.outerLoop.edges,
            movedWallId: 'w-north',
            prevWall: undefined,
            resolveHostSegmentXZ: liveResolve,
            intersector: SketchLoopIntersector,
        });
        expect(result.state).toBe('undetermined');
        expect(result.reason).toBe('STALE_DERIVED_STATE');
        expect(result.subReason).toContain('no-prevState');
        expect(result.polygon).toBeUndefined();
    });

    it('host wall unresolvable → STALE_DERIVED_STATE, and it is DISTINGUISHABLE from preserved', () => {
        const sketch = producedSketch();
        const prev = walls.move('w-north', 0, 2);
        walls.vanish('w-north');
        const result = reprojectFinishBoundary({
            edges: sketch.outerLoop.edges,
            movedWallId: 'w-north',
            prevWall: prev,
            resolveHostSegmentXZ: liveResolve,
            intersector: SketchLoopIntersector,
        });
        expect(result.state).toBe('undetermined');
        expect(result.reason).toBe('STALE_DERIVED_STATE');
        expect(result.subReason).toContain('w-north');
    });

    it('a non-centreline reference frame refuses (GEOMETRY_UNPREDICTABLE) rather than coin-flipping the side', () => {
        // Hand-crafted INVALID edge — production mints centerLine@0 only (§3.1/§3.2);
        // the refusal is the thing under test.
        const edges: FinishSketchEdgeLike[] = [
            { type: 'hostReference', hostId: 'w-south', hostType: 'wall', reference: 'interiorFace', offset: 0, fallback: { start: RING[0]!, end: RING[1]! } },
            { type: 'freeLine', start: RING[1]!, end: RING[2]! },
            { type: 'freeLine', start: RING[2]!, end: RING[3]! },
            { type: 'freeLine', start: RING[3]!, end: RING[0]! },
        ];
        const prev = walls.move('w-south', 0, -1);
        const result = reprojectFinishBoundary({
            edges,
            movedWallId: 'w-south',
            prevWall: prev,
            resolveHostSegmentXZ: liveResolve,
            intersector: SketchLoopIntersector,
        });
        expect(result.state).toBe('undetermined');
        expect(result.reason).toBe('GEOMETRY_UNPREDICTABLE');
    });

    it('a host edge with no fallback refuses (RELATIONSHIP_NOT_RECORDED — §4.3 violated at authoring)', () => {
        const edges: FinishSketchEdgeLike[] = [
            { type: 'hostReference', hostId: 'w-south', hostType: 'wall', reference: 'centerLine', offset: 0 },
            { type: 'freeLine', start: RING[1]!, end: RING[2]! },
            { type: 'freeLine', start: RING[2]!, end: RING[3]! },
            { type: 'freeLine', start: RING[3]!, end: RING[0]! },
        ];
        const prev = walls.move('w-south', 0, -1);
        const result = reprojectFinishBoundary({
            edges,
            movedWallId: 'w-south',
            prevWall: prev,
            resolveHostSegmentXZ: liveResolve,
            intersector: SketchLoopIntersector,
        });
        expect(result.state).toBe('undetermined');
        expect(result.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });

    it('fewer than 3 edges → RELATIONSHIP_NOT_RECORDED', () => {
        const result = reprojectFinishBoundary({
            edges: [],
            movedWallId: 'w-north',
            resolveHostSegmentXZ: liveResolve,
            intersector: SketchLoopIntersector,
        });
        expect(result.state).toBe('undetermined');
        expect(result.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });
});

describe("'conflicted' — §5.2.2: refusal names BOTH numbers, never a silent clamp", () => {
    it('an inverting move (w-north driven through w-south) refuses with old AND new areas', () => {
        const sketch = producedSketch();
        const prev = walls.move('w-north', 0, -8); // centreline z: 4 → -4
        const result = reprojectFinishBoundary({
            edges: sketch.outerLoop.edges,
            movedWallId: 'w-north',
            prevWall: prev,
            resolveHostSegmentXZ: liveResolve,
            intersector: SketchLoopIntersector,
        });

        // The slab path measurably hands back a winding-flipped ring here with no
        // refusal (move-propagation.json A4). This path refuses, with both numbers.
        expect(result.state).toBe('conflicted');
        expect(result.polygon).toBeUndefined();
        expect(result.numbers!.oldAreaM2).toBeCloseTo(22.04, 6);
        expect(result.numbers!.newAreaM2).toBeGreaterThan(0);
        expect(result.subReason).toMatch(/winding|inverted/);
    });
});

describe('signedAreaXZ (verdict arithmetic)', () => {
    it('measures the reference ring at 22.04 m² and flips sign with winding', () => {
        expect(Math.abs(signedAreaXZ(RING))).toBeCloseTo(22.04, 9);
        const reversed = [...RING].reverse();
        expect(signedAreaXZ(reversed)).toBeCloseTo(-signedAreaXZ(RING), 12);
    });
});
