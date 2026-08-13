/**
 * FinishSegmentAdapter — the `{x,z}` ↔ `{x,y}` adapter, tested as the NAMED UNIT
 * the brief demands (move-propagation.json A5/A6: "a coordinate adapter that
 * does not exist"). The resolver side is the REAL WallFaceResolver reading the
 * REAL `window.wallStore` global it reads in production — the probe wall store
 * is the SUBJECT of resolution, never the source of the answer (C74 §3.4).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WallFaceResolver } from '../../geometry-slab/src/WallFaceResolver';
import {
    xzPointToResolverPoint,
    resolverPointToXzPoint,
    xzSegmentToResolverSegment,
    resolverSegmentToXzSegment,
    finishEdgeToResolverEdge,
    resolveFinishHostEdgeXZ,
    degradeFinishHostEdgeXZ,
    type FinishHostReferenceEdgeLike,
} from '../src/FinishSegmentAdapter';

// ── probe wall store (two surfaces: getById for the resolver) ────────────────

type ProbeWall = { id: string; baseLine: { x: number; y: number; z: number }[]; thickness: number };

class ProbeWallStore {
    private walls = new Map<string, ProbeWall>();
    seed(w: ProbeWall): void { this.walls.set(w.id, w); }
    getById(id: string): ProbeWall | undefined { return this.walls.get(id); }
    vanish(id: string): void { this.walls.delete(id); }
}

let walls: ProbeWallStore;

beforeEach(() => {
    walls = new ProbeWallStore();
    walls.seed({
        id: 'w-north',
        baseLine: [{ x: 6, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }],
        thickness: 0.2,
    });
    Object.assign(window, { wallStore: walls });
});

afterEach(() => {
    Object.assign(window, { wallStore: undefined });
});

const northEdge = (overrides?: Partial<FinishHostReferenceEdgeLike>): FinishHostReferenceEdgeLike => ({
    type: 'hostReference',
    hostId: 'w-north',
    hostType: 'wall',
    reference: 'centerLine',
    offset: 0,
    fallback: { start: { x: 5.9, z: 3.9 }, end: { x: 0.1, z: 3.9 } },
    ...overrides,
});

describe('point / segment frame conversion (pure rename, y ↔ z)', () => {
    it('round-trips a point through both frames losslessly', () => {
        const p = { x: 1.25, z: -7.5 };
        expect(xzPointToResolverPoint(p)).toEqual({ x: 1.25, y: -7.5 });
        expect(resolverPointToXzPoint(xzPointToResolverPoint(p))).toEqual(p);
    });

    it('round-trips a segment and never touches the x axis', () => {
        const s = { start: { x: 0.1, z: 0.2 }, end: { x: 9.9, z: -3.3 } };
        const there = xzSegmentToResolverSegment(s);
        expect(there).toEqual({ start: { x: 0.1, y: 0.2 }, end: { x: 9.9, y: -3.3 } });
        expect(resolverSegmentToXzSegment(there)).toEqual(s);
    });
});

describe('finishEdgeToResolverEdge — the five §1.1 facts pass through', () => {
    it('preserves type/hostId/hostType/reference/offset and renames only the fallback frame', () => {
        const resolverEdge = finishEdgeToResolverEdge(northEdge())!;
        expect(resolverEdge).not.toBeNull();
        expect(resolverEdge.type).toBe('hostReference');
        expect(resolverEdge.hostId).toBe('w-north');
        expect(resolverEdge.hostType).toBe('wall');
        expect(resolverEdge.reference).toBe('centerLine');
        expect(resolverEdge.offset).toBe(0);
        expect(resolverEdge.fallback).toEqual({ start: { x: 5.9, y: 3.9 }, end: { x: 0.1, y: 3.9 } });
    });

    it('refuses a non-wall host — the one resolver resolves walls, and a wall lookup by a slab id would be a §2.3 wrong host', () => {
        expect(finishEdgeToResolverEdge(northEdge({ hostType: 'slab' }))).toBeNull();
        expect(resolveFinishHostEdgeXZ(WallFaceResolver, northEdge({ hostType: 'slab' }))).toBeNull();
    });
});

describe('resolveFinishHostEdgeXZ — live resolution through the ONE resolver', () => {
    it('returns the wall centreline in the finish {x,z} frame', () => {
        const seg = resolveFinishHostEdgeXZ(WallFaceResolver, northEdge());
        expect(seg).toEqual({ start: { x: 6, z: 4 }, end: { x: 0, z: 4 } });
    });

    it('follows the wall: after the wall moves, resolution returns the NEW centreline', () => {
        walls.seed({ id: 'w-north', baseLine: [{ x: 6, y: 0, z: 6 }, { x: 0, y: 0, z: 6 }], thickness: 0.2 });
        const seg = resolveFinishHostEdgeXZ(WallFaceResolver, northEdge());
        expect(seg).toEqual({ start: { x: 6, z: 6 }, end: { x: 0, z: 6 } });
    });

    it('returns null — NOT the stale fallback — when the host wall is gone (the §5.2.1 distinction)', () => {
        walls.vanish('w-north');
        // resolveOrFallback would silently return the authoring-time fallback
        // here; that is the measured C79 §5.2.1 collapse. The adapter must say null.
        expect(resolveFinishHostEdgeXZ(WallFaceResolver, northEdge())).toBeNull();
    });
});

describe('degradeFinishHostEdgeXZ — wall-removal degradation geometry', () => {
    it('uses the LIVE geometry when the wall still resolves', () => {
        const freeLine = degradeFinishHostEdgeXZ(WallFaceResolver, northEdge());
        expect(freeLine).toEqual({ type: 'freeLine', start: { x: 6, z: 4 }, end: { x: 0, z: 4 } });
    });

    it('falls back to the authored {x,z} fallback when the wall is gone (§4.3: that is what the fallback is FOR)', () => {
        walls.vanish('w-north');
        const freeLine = degradeFinishHostEdgeXZ(WallFaceResolver, northEdge());
        expect(freeLine).toEqual({ type: 'freeLine', start: { x: 5.9, z: 3.9 }, end: { x: 0.1, z: 3.9 } });
    });

    it('returns null only when BOTH live resolution and fallback are unavailable', () => {
        walls.vanish('w-north');
        const edge = northEdge();
        delete edge.fallback;
        expect(degradeFinishHostEdgeXZ(WallFaceResolver, edge)).toBeNull();
    });
});
