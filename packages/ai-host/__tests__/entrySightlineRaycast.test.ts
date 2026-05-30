// L2-β-2b — Ray-cast EntrySightline pure tests.

import { describe, expect, it } from 'vitest';
import {
    scoreVisibleSpaceCount,
    polygonCentroid,
    segmentIntersect,
    closedWallRanges,
    isSightBlocked,
    gatherSightcastWalls,
    countVisibleSpacesByRaycast,
    entrySightlineRaycastScore,
} from '../src/workflows/apartmentLayout/tgl/entrySightlineRaycast.js';
import type { GraphNode, GraphEdge, LayoutGraph } from '../src/workflows/apartmentLayout/tgl/semanticGraph.js';

// ── Building blocks for synthetic graphs ────────────────────────────────────

const space = (guid: string, polygon: Array<{ x: number; z: number }>, spaceType = 'living'): GraphNode => ({
    guid, kind: 'Space', sourceId: guid,
    attrs: { spaceType, netAreaM2: 10, needsWindow: false },
    geometry: { polygon },
    psets: {},
});
const wall = (guid: string, a: { x: number; z: number }, b: { x: number; z: number }): GraphNode => ({
    guid, kind: 'Wall', sourceId: guid,
    attrs: { thickness: 0.1, heightM: 2.7, isExternal: false },
    geometry: { baseLine: [a, b] },
    psets: {},
});
const opening = (guid: string, offsetM: number, widthM: number): GraphNode => ({
    guid, kind: 'Opening', sourceId: guid,
    attrs: { offsetM, widthM, heightM: 2.1, sillM: 0 },
    psets: {},
});
const hostedBy = (openingGuid: string, wallGuid: string): GraphEdge =>
    ({ kind: 'HOSTED_BY', from: openingGuid, to: wallGuid });

const graphOf = (nodes: GraphNode[], edges: GraphEdge[] = []): LayoutGraph => ({ nodes, edges });

// ── §1 — Pure helpers ──────────────────────────────────────────────────────

describe('scoreVisibleSpaceCount (L2-β-2b)', () => {
    it('1-2 visible spaces = 1.0', () => {
        expect(scoreVisibleSpaceCount(1)).toBe(1.0);
        expect(scoreVisibleSpaceCount(2)).toBe(1.0);
    });
    it('0 visible = 0.3 (entry reveals nothing)', () => {
        expect(scoreVisibleSpaceCount(0)).toBe(0.3);
    });
    it('3 visible = 0.7 (over-reveal)', () => {
        expect(scoreVisibleSpaceCount(3)).toBe(0.7);
    });
    it('≥4 visible = 0.3 (lobby-of-doors anti-pattern)', () => {
        expect(scoreVisibleSpaceCount(4)).toBe(0.3);
        expect(scoreVisibleSpaceCount(99)).toBe(0.3);
    });
});

describe('polygonCentroid', () => {
    it('returns the centre of a unit square', () => {
        const c = polygonCentroid([
            { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 },
        ]);
        expect(c.x).toBeCloseTo(1, 6);
        expect(c.z).toBeCloseTo(1, 6);
    });
    it('returns first vertex on degenerate (<3 vertex) polygons', () => {
        expect(polygonCentroid([{ x: 5, z: 7 }])).toEqual({ x: 5, z: 7 });
    });
    it('handles a collinear triangle gracefully', () => {
        // All three points on a line — area is 0; centroid falls back to v0.
        const c = polygonCentroid([{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }]);
        expect(c).toEqual({ x: 0, z: 0 });
    });
});

describe('segmentIntersect', () => {
    it('returns the crossing of two perpendicular segments', () => {
        // Horizontal (0,1)→(2,1); vertical (1,0)→(1,2); intersect at (1,1).
        const r = segmentIntersect({ x: 0, z: 1 }, { x: 2, z: 1 }, { x: 1, z: 0 }, { x: 1, z: 2 });
        expect(r).not.toBeNull();
        expect(r!.t).toBeCloseTo(0.5, 6);
        expect(r!.u).toBeCloseTo(0.5, 6);
    });
    it('returns null for parallel segments', () => {
        const r = segmentIntersect({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 });
        expect(r).toBeNull();
    });
    it('returns null when segments meet only at an endpoint', () => {
        // sight ends exactly at wall start → touch-at-endpoint, no proper crossing.
        const r = segmentIntersect({ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 });
        expect(r).toBeNull();
    });
    it('returns null when sight is short of the wall', () => {
        const r = segmentIntersect({ x: 0, z: 0 }, { x: 0.5, z: 0 }, { x: 1, z: -1 }, { x: 1, z: 1 });
        expect(r).toBeNull();
    });
});

describe('closedWallRanges', () => {
    it('returns one [0,1] range for a wall with no openings', () => {
        const r = closedWallRanges(5, []);
        expect(r).toEqual([{ u0: 0, u1: 1 }]);
    });
    it('returns [] for a degenerate wall (length 0)', () => {
        expect(closedWallRanges(0, [{ offsetM: 0, widthM: 1 }])).toEqual([]);
    });
    it('splits the wall around one opening in the middle', () => {
        // 5 m wall, opening offsetM=2, widthM=1 → ranges [0, 0.4] and [0.6, 1].
        const r = closedWallRanges(5, [{ offsetM: 2, widthM: 1 }]);
        expect(r).toHaveLength(2);
        expect(r[0]!.u0).toBe(0);
        expect(r[0]!.u1).toBeCloseTo(0.4, 6);
        expect(r[1]!.u0).toBeCloseTo(0.6, 6);
        expect(r[1]!.u1).toBe(1);
    });
    it('an opening spanning the whole wall yields no closed range', () => {
        const r = closedWallRanges(5, [{ offsetM: 0, widthM: 5 }]);
        expect(r).toHaveLength(0);
    });
});

// ── §2 — Sight-blocking ─────────────────────────────────────────────────────

describe('isSightBlocked', () => {
    it('blocks when a solid wall crosses the sight line', () => {
        // Wall from (1, -1) to (1, 1) — vertical at x=1. Sight (0,0)→(2,0).
        const blocked = isSightBlocked(
            { x: 0, z: 0 }, { x: 2, z: 0 },
            [{ baseLine: [{ x: 1, z: -1 }, { x: 1, z: 1 }], openings: [] }],
        );
        expect(blocked).toBe(true);
    });
    it('does NOT block when the sight passes through an opening', () => {
        // Wall (1, -1) → (1, 1) — length 2; opening offsetM=0.8, widthM=0.4 →
        // covers u ∈ [0.4, 0.6] which is exactly where the sight crosses (u=0.5).
        const blocked = isSightBlocked(
            { x: 0, z: 0 }, { x: 2, z: 0 },
            [{
                baseLine: [{ x: 1, z: -1 }, { x: 1, z: 1 }],
                openings: [{ offsetM: 0.8, widthM: 0.4 }],
            }],
        );
        expect(blocked).toBe(false);
    });
    it('blocks when the sight crosses outside the opening', () => {
        // Same wall, opening offsetM=0, widthM=0.3 (so u ∈ [0, 0.15]); sight crosses at u=0.5 → solid.
        const blocked = isSightBlocked(
            { x: 0, z: 0 }, { x: 2, z: 0 },
            [{
                baseLine: [{ x: 1, z: -1 }, { x: 1, z: 1 }],
                openings: [{ offsetM: 0, widthM: 0.3 }],
            }],
        );
        expect(blocked).toBe(true);
    });
    it('does NOT block when the sight is parallel to the wall', () => {
        const blocked = isSightBlocked(
            { x: 0, z: 0 }, { x: 2, z: 0 },
            [{ baseLine: [{ x: 0.5, z: 1 }, { x: 1.5, z: 1 }], openings: [] }],
        );
        expect(blocked).toBe(false);
    });
});

// ── §3 — Full raycaster + scorer ────────────────────────────────────────────

describe('countVisibleSpacesByRaycast', () => {
    it('returns 0 for an entry with no polygon', () => {
        const g = graphOf([{ ...space('e', [], 'hall'), geometry: {} } as GraphNode]);
        expect(countVisibleSpacesByRaycast(g, 'e')).toBe(0);
    });

    it('two rooms with no separating wall → both visible from the entry', () => {
        const e = space('e', [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }], 'hall');
        const a = space('a', [{ x: 2, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }]);
        // No walls at all.
        expect(countVisibleSpacesByRaycast(graphOf([e, a]), 'e')).toBe(1);
    });

    it('solid wall between entry and other room blocks visibility', () => {
        const e = space('e', [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }], 'hall');
        const a = space('a', [{ x: 2, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }]);
        const w = wall('w', { x: 2, z: 0 }, { x: 2, z: 2 });
        // No openings on the wall → blocks sight.
        expect(countVisibleSpacesByRaycast(graphOf([e, a, w]), 'e')).toBe(0);
    });

    it('door opening on the dividing wall restores visibility', () => {
        const e = space('e', [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }], 'hall');
        const a = space('a', [{ x: 2, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }]);
        const w = wall('w', { x: 2, z: 0 }, { x: 2, z: 2 });
        // Opening from offsetM=0.8 to 1.2 (covers u ∈ [0.4, 0.6] — exactly the
        // sight's crossing point at u=0.5 on the 2m wall).
        const op = opening('op', 0.8, 0.4);
        const edges = [hostedBy('op', 'w')];
        expect(countVisibleSpacesByRaycast(graphOf([e, a, w, op], edges), 'e')).toBe(1);
    });

    it('skips rooms with no polygon', () => {
        const e = space('e', [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }], 'hall');
        const a = { ...space('a', []), geometry: {} } as GraphNode;
        expect(countVisibleSpacesByRaycast(graphOf([e, a]), 'e')).toBe(0);
    });
});

describe('entrySightlineRaycastScore', () => {
    it('picks the hall-type space as entry', () => {
        const hall = space('h', [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }], 'hall');
        const liv  = space('l', [{ x: 2, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }], 'living');
        const r = entrySightlineRaycastScore(graphOf([hall, liv]), { h: 0, l: 1 });
        expect(r.entryGuid).toBe('h');
        expect(r.visibleCount).toBe(1);
        expect(r.score).toBe(1.0);
    });

    it('falls back to depth-0 when no hall exists', () => {
        const a = space('a', [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }], 'living');
        const b = space('b', [{ x: 2, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }], 'kitchen');
        const r = entrySightlineRaycastScore(graphOf([a, b]), { a: 0, b: 1 });
        expect(r.entryGuid).toBe('a');
        expect(r.visibleCount).toBe(1);
    });

    it('returns score 1.0 + entryGuid=null when no entry can be resolved', () => {
        const a = space('a', [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }], 'living');
        const b = space('b', [{ x: 2, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }], 'kitchen');
        // No depth-0 entry → fallback fails too.
        const r = entrySightlineRaycastScore(graphOf([a, b]), { a: 1, b: 1 });
        expect(r.entryGuid).toBeNull();
        expect(r.score).toBe(1.0);
    });

    it('over-reveal: 4 visible spaces → 0.3 (anti-pattern band)', () => {
        const hall = space('h', [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }], 'hall');
        // Place 4 other rooms around the hall, each visible (no walls).
        const a = space('a', [{ x: 2, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 2, z: 2 }]);
        const b = space('b', [{ x: -2, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 2 }, { x: -2, z: 2 }]);
        const c = space('c', [{ x: 0, z: 2 }, { x: 2, z: 2 }, { x: 2, z: 4 }, { x: 0, z: 4 }]);
        const d = space('d', [{ x: 0, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 0 }, { x: 0, z: 0 }]);
        const r = entrySightlineRaycastScore(graphOf([hall, a, b, c, d]), { h: 0 });
        expect(r.visibleCount).toBe(4);
        expect(r.score).toBe(0.3);
    });
});

describe('gatherSightcastWalls (data collection)', () => {
    it('attaches openings to their host walls', () => {
        const w = wall('w', { x: 0, z: 0 }, { x: 5, z: 0 });
        const op = opening('op', 1, 1);
        const out = gatherSightcastWalls(graphOf([w, op], [hostedBy('op', 'w')]));
        expect(out).toHaveLength(1);
        expect(out[0]!.openings).toEqual([{ offsetM: 1, widthM: 1 }]);
    });

    it('returns an empty openings array when the wall has none', () => {
        const w = wall('w', { x: 0, z: 0 }, { x: 5, z: 0 });
        const out = gatherSightcastWalls(graphOf([w]));
        expect(out[0]!.openings).toEqual([]);
    });

    it('drops walls with degenerate baseLine', () => {
        const out = gatherSightcastWalls(graphOf([{
            ...wall('w', { x: 0, z: 0 }, { x: 0, z: 0 }),
            geometry: {},
        } as GraphNode]));
        expect(out).toHaveLength(0);
    });
});
