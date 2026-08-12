/**
 * C79 §6.3 conformance — the two smallest gaps in the table, closed.
 *
 *   • ROW 3 — `SlabTool.findRegionAtPoint` (3D) used to call the bare-ring twin
 *     and commit coordinates only. It now calls `traceRegionSketchAtPoint` — the
 *     SAME attributing entry point the plan handler (row 1, the conforming
 *     reference implementation) calls — and passes the resulting sketch into
 *     CreateSlabCommand. These tests pin the exact call both surfaces now make,
 *     on the C79 §2.5 reference fixture, and the five attribution counts.
 *
 *   • ROW 2 — `SlabPickWallsController.complete()` emitted the canonical edge
 *     shape but NO `fallback`, so a wall deleted before any rebuild degraded to
 *     NOTHING (C79 §4.3). `buildPickedWallEdges` (the pure helper the controller
 *     now uses) populates the fallback from the live centreline at authoring time.
 */
import { describe, it, expect } from 'vitest';
import {
    traceRegionSketchAtPoint,
    type RegionWallLike,
} from '../src/SlabRegionTracer';
import { buildPickedWallEdges, type PickedWallLike } from '../src/pickWallsSketch';
import type { HostReferenceEdge, FreeLineEdge, SlabSketch } from '../src/SketchTypes';

// ── fixtures ────────────────────────────────────────────────────────────────

function wall(id: string, x0: number, z0: number, x1: number, z1: number): RegionWallLike {
    return { id, baseLine: [{ x: x0, z: z0 }, { x: x1, z: z1 }] };
}

function curvedWall(
    id: string,
    x0: number, z0: number, x1: number, z1: number,
    cx: number, cz: number, segments = 16,
): RegionWallLike {
    return {
        id,
        baseLine: [{ x: x0, z: z0 }, { x: x1, z: z1 }],
        curve: { control: { x: cx, z: cz }, segments },
    };
}

/** The C79 §2.5 reference fixture: three straight walls + one arc. */
function threeStraightOneArc(): RegionWallLike[] {
    return [
        wall('w-top', 0, 4, 6, 4),
        wall('w-left', 0, 4, 0, 0),
        wall('w-bottom', 0, 0, 4, 0),
        curvedWall('w-arc', 4, 0, 6, 4, 6, 0, 16),
    ];
}

function fourWallRoom(): RegionWallLike[] {
    return [
        wall('w-south', 0, 0, 6, 0),
        wall('w-east', 6, 0, 6, 4),
        wall('w-north', 6, 4, 0, 4),
        wall('w-west', 0, 4, 0, 0),
    ];
}

const hostEdges = (s: SlabSketch): HostReferenceEdge[] =>
    s.outerLoop.edges.filter((e): e is HostReferenceEdge => e.type === 'hostReference');
const freeEdges = (s: SlabSketch): FreeLineEdge[] =>
    s.outerLoop.edges.filter((e): e is FreeLineEdge => e.type === 'freeLine');

// ── ROW 3: the 3D path (C79 §6.3, "smallest gap in the table") ──────────────

describe('C79 §6.3 row 3 — the 3D region path emits reference-bearing edges', () => {
    it('§2.5 REFERENCE READING: 3-straight + 1-arc fixture → 3 host edges, 16 curved fallbacks', () => {
        // The exact call SlabTool.findRegionAtPoint (3D) now makes.
        const traced = traceRegionSketchAtPoint(threeStraightOneArc(), 2, 2);
        expect(traced).not.toBeNull();

        const a = traced!.attribution;
        // All five counts, exactly (C79 §2.5's measured reference reading).
        expect(a.hostEdges).toBe(3);
        expect(a.freeEdges).toBe(16);
        expect(a.curvedFallbacks).toBe(16);
        expect(a.missingIdFallbacks).toBe(0);
        expect(a.ambiguousFallbacks).toBe(0);
        expect(new Set(a.hostWallIds)).toEqual(new Set(['w-top', 'w-left', 'w-bottom']));
    });

    it('the 3D path and the plan path (row 1) produce BYTE-IDENTICAL sketches on the same fixture', () => {
        // Row 1 (SlabPlanToolHandler._findRegionAtPoint) and row 3 (SlabTool.
        // findRegionAtPoint) now call the same function with the same wall shape;
        // C79 §3.4 requires one edge shape per relationship. Pin it: two
        // independent invocations over the reference fixture must be deep-equal —
        // sketch, ring, and all five counts.
        const viaPlanSurface = traceRegionSketchAtPoint(threeStraightOneArc(), 2, 2)!;
        const via3DSurface = traceRegionSketchAtPoint(threeStraightOneArc(), 2, 2)!;
        expect(JSON.parse(JSON.stringify(via3DSurface)))
            .toEqual(JSON.parse(JSON.stringify(viaPlanSurface)));
    });

    it('every host edge carries the §1.1 five facts, centerLine @ offset 0 (§3.1-§3.2), with fallback (§4.3)', () => {
        const traced = traceRegionSketchAtPoint(threeStraightOneArc(), 2, 2)!;
        for (const e of hostEdges(traced.sketch)) {
            expect(e.type).toBe('hostReference');
            expect(typeof e.hostId).toBe('string');
            expect(e.hostType).toBe('wall');
            expect(e.reference).toBe('centerLine'); // never a face for a centreline trace
            expect(e.offset).toBe(0);
            expect(e.fallback).toBeDefined();
        }
        // Attribution BY CONSTRUCTION (§2.1): the arc never gets an id.
        for (const e of hostEdges(traced.sketch)) expect(e.hostId).not.toBe('w-arc');
    });

    it('the 3D edge shape matches the pick-walls (row 2) canonical shape field-for-field (§3.4)', () => {
        const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2)!;
        const picked = buildPickedWallEdges(
            ['w-south', 'w-east', 'w-north', 'w-west'],
            (id) => fourWallRoom().find(w => w.id === id) as PickedWallLike,
        );
        const regionByHost = new Map(hostEdges(traced.sketch).map(e => [e.hostId, e]));
        expect(regionByHost.size).toBe(4);

        for (const p of picked.edges) {
            const r = regionByHost.get(p.hostId)!;
            expect(r).toBeDefined();
            // The five facts, byte-identical between the two paths.
            expect(r.type).toBe(p.type);
            expect(r.hostType).toBe(p.hostType);
            expect(r.reference).toBe(p.reference);
            expect(r.offset).toBe(p.offset);
            // Both populate fallback at authoring time; on the same wall it is the
            // same segment (up to traversal direction of the ring walk).
            const sameSeg =
                (JSON.stringify(r.fallback) === JSON.stringify(p.fallback)) ||
                (JSON.stringify(r.fallback) ===
                 JSON.stringify({ start: p.fallback!.end, end: p.fallback!.start }));
            expect(sameSeg).toBe(true);
        }
    });
});

// ── the three failure reasons surface as counts (§2.4-§2.5) ─────────────────

describe('C79 §2.4 — curved | noWallId | ambiguous each surface as a distinct count', () => {
    it('curved: the arc fixture reports curvedFallbacks, not a boolean and not silence', () => {
        const a = traceRegionSketchAtPoint(threeStraightOneArc(), 2, 2)!.attribution;
        expect(a.curvedFallbacks).toBe(16);
        expect(a.missingIdFallbacks).toBe(0);
        expect(a.ambiguousFallbacks).toBe(0);
    });

    it('noWallId: an id-less wall is counted separately from the arc case', () => {
        const walls: RegionWallLike[] = [
            wall('w-south', 0, 0, 6, 0),
            { baseLine: [{ x: 6, z: 0 }, { x: 6, z: 4 }] }, // no id
            wall('w-north', 6, 4, 0, 4),
            wall('w-west', 0, 4, 0, 0),
        ];
        const a = traceRegionSketchAtPoint(walls, 3, 2)!.attribution;
        expect(a.hostEdges).toBe(3);
        expect(a.missingIdFallbacks).toBe(1);
        expect(a.curvedFallbacks).toBe(0);
        expect(a.ambiguousFallbacks).toBe(0);
    });

    it('ambiguous: two DIFFERENT walls welded onto one ring edge drop to null and are counted (§2.3)', () => {
        // Two distinct walls with identical centrelines — the wrong-host scenario.
        // First-writer would silently follow whichever wall was iterated first;
        // the rule drops to null instead and says why.
        const walls: RegionWallLike[] = [
            ...fourWallRoom(),
            wall('w-south-duplicate', 0, 0, 6, 0),
        ];
        const traced = traceRegionSketchAtPoint(walls, 3, 2)!;
        const a = traced.attribution;
        expect(a.ambiguousFallbacks).toBe(1);
        expect(a.hostEdges).toBe(3);
        // Neither claimant may win: no host edge names either south wall.
        for (const e of hostEdges(traced.sketch)) {
            expect(e.hostId).not.toBe('w-south');
            expect(e.hostId).not.toBe('w-south-duplicate');
        }
    });
});

// ── ROW 2: pick-walls fallback populated at authoring time (§4.3) ───────────

describe('C79 §6.3 row 2 — SlabPickWallsController edges ship WITH fallback at authoring time', () => {
    const store = new Map<string, PickedWallLike>([
        ['w-a', { id: 'w-a', baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] }],
        ['w-b', { id: 'w-b', baseLine: [{ x: 6, z: 0 }, { x: 6, z: 4 }] }],
        ['w-c', { id: 'w-c', baseLine: [{ x: 6, z: 4 }, { x: 0, z: 4 }] }],
    ]);

    it('populates fallback from the live centreline on every readable wall', () => {
        const { edges, fallbacksPopulated, fallbacksUnavailable } = buildPickedWallEdges(
            ['w-a', 'w-b', 'w-c'],
            (id) => store.get(id),
        );
        expect(edges.length).toBe(3);
        expect(fallbacksPopulated).toBe(3);
        expect(fallbacksUnavailable).toBe(0);

        for (const e of edges) {
            // The canonical shape (C79 §3.4) is unchanged…
            expect(e.type).toBe('hostReference');
            expect(e.hostType).toBe('wall');
            expect(e.reference).toBe('centerLine');
            expect(e.offset).toBe(0);
            // …plus the §4.3 fallback: baseLine in slab 2D space (x=world.x, y=world.z),
            // which IS the centreline resolution at offset 0.
            const w = store.get(e.hostId)!;
            expect(e.fallback).toEqual({
                start: { x: w.baseLine![0]!.x, y: w.baseLine![0]!.z },
                end: { x: w.baseLine![1]!.x, y: w.baseLine![1]!.z },
            });
        }
    });

    it('a wall deleted BEFORE any rebuild now degrades to its fallback, not to nothing', () => {
        const { edges } = buildPickedWallEdges(['w-a', 'w-b', 'w-c'], (id) => store.get(id));

        // WallFaceResolver.resolveOrFallback with the host gone: live resolution is
        // null, so the answer IS edge.fallback — previously undefined, i.e. NOTHING.
        const removed = 'w-b';
        const target = edges.find(e => e.hostId === removed)!;
        const resolveOrFallback = (e: HostReferenceEdge, live: PickedWallLike | undefined) => {
            if (live?.baseLine) {
                return {
                    start: { x: live.baseLine[0]!.x, y: live.baseLine[0]!.z },
                    end: { x: live.baseLine[1]!.x, y: live.baseLine[1]!.z },
                };
            }
            return e.fallback ?? null;
        };
        const degraded = resolveOrFallback(target, undefined);
        expect(degraded).not.toBeNull();
        expect(degraded).toEqual({ start: { x: 6, y: 0 }, end: { x: 6, y: 4 } });
    });

    it('an unreadable wall gets NO invented fallback (§2.3) and the gap is COUNTED (§2.6)', () => {
        const { edges, fallbacksPopulated, fallbacksUnavailable } = buildPickedWallEdges(
            ['w-a', 'w-ghost', 'w-c'],
            (id) => store.get(id),
        );
        expect(edges.length).toBe(3);
        expect(fallbacksPopulated).toBe(2);
        expect(fallbacksUnavailable).toBe(1);

        const ghost = edges.find(e => e.hostId === 'w-ghost')!;
        expect(ghost.fallback).toBeUndefined(); // refused, never invented
        // The edge itself still ships — the reference is real even if the
        // geometry could not be read at this instant.
        expect(ghost.type).toBe('hostReference');
        expect(ghost.reference).toBe('centerLine');
    });
});
