/**
 * §REGION-HOST-ATTRIBUTION (founder, 2026-08-12)
 *
 * THE DEFECT. There were two slab-creation paths and they produced structurally
 * different slabs:
 *
 *   • PICK-THE-WALLS (`SlabPickWallsController`) — every picked wall becomes a
 *     `HostReferenceEdge` carrying `hostId`. `SlabDependencyTracker` keeps
 *     `wallId → Set<slabId>` and re-projects on wall update. The slab FOLLOWS the wall.
 *
 *   • CLICK-THE-REGION (`SlabRegionTracer.findRegionAtPoint`) — the tracer RECEIVED
 *     the wall array, walked their centrelines to close the ring, and then THREW THE
 *     WALL IDS AWAY, returning a ring of bare points. The resulting slab held no host
 *     reference at all. Move a perimeter wall and the slab silently stayed put — no
 *     error, no warning. Two buttons that look identical behaved differently.
 *
 * A user clicking inside four walls has EXPRESSED A RELATIONSHIP ("the floor of this
 * room"), not drawn a coincidental quadrilateral. These tests hold the tracer to that.
 *
 * They deliberately assert on GEOMETRY, not on "a rebuild was triggered": a rebuild
 * that re-projects to the same coordinates is indistinguishable from the bug.
 */
import { describe, it, expect } from 'vitest';
import {
    traceRegionSketchAtPoint,
    findAttributedRegionAtPoint,
    findRegionAtPoint,
    buildRegionSketch,
    wallsToAttributedSegments,
    type RegionWallLike,
} from '../src/SlabRegionTracer';
import type { HostReferenceEdge, FreeLineEdge, SketchEdge, SlabSketch } from '../src/SketchTypes';

// ── fixtures ────────────────────────────────────────────────────────────────

/** A straight, identified wall — what `wallStore.getAll()` actually yields. */
function wall(id: string, x0: number, z0: number, x1: number, z1: number): RegionWallLike {
    return { id, baseLine: [{ x: x0, z: z0 }, { x: x1, z: z1 }] };
}

/** A curved (quadratic-Bézier) wall. */
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

/** The founder's scenario: a closed polyline of four walls around a 6 × 4 room. */
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

/**
 * The consumer's contract, reproduced from `SlabDependencyTracker.registerSlab`:
 * walk `outerLoop` + `innerLoops` and collect every `edge.type === 'hostReference'`
 * as a `wallId → slabId` dependency. If this yields nothing, the tracker never
 * subscribes and the slab cannot follow anything.
 */
function dependencyGraphFor(sketch: SlabSketch, slabId: string): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    const loops = [sketch.outerLoop, ...(sketch.innerLoops ?? [])];
    for (const loop of loops) {
        for (const edge of loop.edges) {
            if (edge.type === 'hostReference') {
                if (!graph.has(edge.hostId)) graph.set(edge.hostId, new Set());
                graph.get(edge.hostId)!.add(slabId);
            }
        }
    }
    return graph;
}

/**
 * `WallFaceResolver.computeSegment` for `reference: 'centerLine', offset: 0`,
 * reproduced without THREE/`window`. At centreline with zero offset the resolved
 * segment IS the wall's baseLine in the slab's 2D frame (x = world.x, y = world.z) —
 * which is the whole reason `'centerLine'` is the honest reference for a ring traced
 * on centrelines.
 */
function resolveCenterLine(w: RegionWallLike): { start: { x: number; y: number }; end: { x: number; y: number } } {
    const a = w.baseLine![0]!;
    const b = w.baseLine![1]!;
    return { start: { x: a.x, y: a.z }, end: { x: b.x, y: b.z } };
}

/**
 * The projection `SlabDependencyTracker` → builder performs on rebuild: resolve every
 * host edge against the CURRENT wall geometry; keep free edges as authored.
 * Returns the projected boundary as a flat list of segments.
 */
function projectSketch(
    sketch: SlabSketch,
    walls: ReadonlyArray<RegionWallLike>,
): Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> {
    const byId = new Map(walls.filter(w => w.id).map(w => [w.id!, w]));
    return sketch.outerLoop.edges.map((e: SketchEdge) => {
        if (e.type === 'freeLine') return { start: e.start, end: e.end };
        const live = byId.get(e.hostId);
        // Host gone → degrade through the fallback (WallFaceResolver.resolveOrFallback).
        if (!live) return e.fallback!;
        return resolveCenterLine(live);
    });
}

// ── the founder's scenario ──────────────────────────────────────────────────

describe('§REGION-HOST-ATTRIBUTION — a region slab follows its walls', () => {
    it('emits a HostReferenceEdge per straight bounding wall, matching the pick-walls edge shape', () => {
        const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2);
        expect(traced).not.toBeNull();

        const hosts = hostEdges(traced!.sketch);
        // Four straight walls bound the room → four host-referenced edges.
        expect(hosts.length).toBe(4);
        expect(freeEdges(traced!.sketch).length).toBe(0);

        for (const e of hosts) {
            // BYTE-FOR-BYTE the shape SlabPickWallsController.complete() emits, plus
            // the fallback (which pick-walls leaves for the builder to cache later).
            expect(e.type).toBe('hostReference');
            expect(e.hostType).toBe('wall');
            expect(e.reference).toBe('centerLine');
            expect(e.offset).toBe(0);
            expect(typeof e.hostId).toBe('string');
        }

        // Every bounding wall is referenced exactly once, and NO id was invented.
        expect(new Set(hosts.map(e => e.hostId))).toEqual(
            new Set(['w-south', 'w-east', 'w-north', 'w-west']),
        );
    });

    it('the sketch registers a wall→slab dependency in SlabDependencyTracker\'s own walk', () => {
        const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2)!;
        const graph = dependencyGraphFor(traced.sketch, 'slab-1');

        // Before the fix this map was EMPTY for a region slab — the tracker had
        // nothing to subscribe to, which is precisely why nothing followed.
        expect(graph.size).toBe(4);
        for (const id of ['w-south', 'w-east', 'w-north', 'w-west']) {
            expect(graph.get(id)).toEqual(new Set(['slab-1']));
        }
    });

    it('THE FOUNDER SCENARIO: moving one wall RE-PROJECTS the slab boundary', () => {
        const walls = fourWallRoom();
        const traced = traceRegionSketchAtPoint(walls, 3, 2)!;
        const sketch = traced.sketch;

        const before = projectSketch(sketch, walls);

        // Move the EAST wall from x = 6 out to x = 9. This is the founder's exact
        // gesture: grab a perimeter wall of a room whose floor was made by region.
        const moved: RegionWallLike[] = walls.map(w =>
            w.id === 'w-east' ? wall('w-east', 9, 0, 9, 4) : w,
        );
        const after = projectSketch(sketch, moved);

        // ── the assertion that matters: the GEOMETRY changed ──────────────────
        expect(after).not.toEqual(before);

        // And it changed in the RIGHT direction and by the RIGHT amount: the edge
        // hosted by w-east now sits at x = 9, not x = 6.
        const eastIdx = sketch.outerLoop.edges.findIndex(
            e => e.type === 'hostReference' && e.hostId === 'w-east',
        );
        expect(eastIdx).toBeGreaterThanOrEqual(0);
        expect(before[eastIdx]!.start.x).toBeCloseTo(6, 6);
        expect(before[eastIdx]!.end.x).toBeCloseTo(6, 6);
        expect(after[eastIdx]!.start.x).toBeCloseTo(9, 6);
        expect(after[eastIdx]!.end.x).toBeCloseTo(9, 6);

        // The three walls that did NOT move must not have drifted.
        for (let i = 0; i < before.length; i++) {
            if (i === eastIdx) continue;
            expect(after[i]).toEqual(before[i]);
        }
    });

    it('REGRESSION GUARD: a ring with NO host references does not move — the old behaviour', () => {
        // The same room, but with the wall ids stripped (exactly what the tracer used
        // to hand downstream). This is the bug, pinned, so the test above cannot pass
        // for an unrelated reason.
        const anonymous = fourWallRoom().map(({ baseLine }) => ({ baseLine }));
        const traced = traceRegionSketchAtPoint(anonymous, 3, 2)!;
        expect(hostEdges(traced.sketch).length).toBe(0);

        const before = projectSketch(traced.sketch, anonymous as RegionWallLike[]);
        const moved = anonymous.map((w, i) =>
            i === 1 ? { baseLine: [{ x: 9, z: 0 }, { x: 9, z: 4 }] } : w,
        );
        const after = projectSketch(traced.sketch, moved as RegionWallLike[]);

        // Unchanged: the slab silently stays put. That is the defect being closed.
        expect(after).toEqual(before);
    });
});

// ── degradation on wall removal (the undoable path) ─────────────────────────

describe('§REGION-HOST-ATTRIBUTION — onWallRemoved degrades through the fallback', () => {
    it('populates `fallback` on EVERY emitted HostReferenceEdge', () => {
        const traced = traceRegionSketchAtPoint(fourWallRoom(), 3, 2)!;
        for (const e of hostEdges(traced.sketch)) {
            // WallFaceResolver.degrade() → resolveOrFallback() returns null when the
            // host is gone AND no fallback was stored, and a null degrades to NOTHING.
            // An edge shipped without a fallback is an edge that silently vanishes.
            expect(e.fallback).toBeDefined();
            expect(Number.isFinite(e.fallback!.start.x)).toBe(true);
            expect(Number.isFinite(e.fallback!.start.y)).toBe(true);
            expect(Number.isFinite(e.fallback!.end.x)).toBe(true);
            expect(Number.isFinite(e.fallback!.end.y)).toBe(true);
        }
    });

    it('the fallback equals the live centreline resolution at authoring time', () => {
        const walls = fourWallRoom();
        const traced = traceRegionSketchAtPoint(walls, 3, 2)!;
        const byId = new Map(walls.map(w => [w.id!, w]));

        for (const e of hostEdges(traced.sketch)) {
            const live = resolveCenterLine(byId.get(e.hostId)!);
            // The fallback is the ring's own chord; the ring is traced on centrelines,
            // so it must coincide with the live centreline resolution (up to which end
            // the ring walk entered from — compare as an unordered segment).
            const f = e.fallback!;
            const same =
                (Math.hypot(f.start.x - live.start.x, f.start.y - live.start.y) < 1e-6 &&
                 Math.hypot(f.end.x - live.end.x, f.end.y - live.end.y) < 1e-6) ||
                (Math.hypot(f.start.x - live.end.x, f.start.y - live.end.y) < 1e-6 &&
                 Math.hypot(f.end.x - live.start.x, f.end.y - live.start.y) < 1e-6);
            expect(same).toBe(true);
        }
    });

    it('degrading a removed wall\'s edge yields a FreeLineEdge with the fallback geometry', () => {
        const walls = fourWallRoom();
        const traced = traceRegionSketchAtPoint(walls, 3, 2)!;
        const sketch = traced.sketch;

        const removedId = 'w-east';
        const target = hostEdges(sketch).find(e => e.hostId === removedId)!;
        const expected = target.fallback!;

        // `SlabDependencyTracker.onWallRemoved` → `WallFaceResolver.degrade(edge)`
        // → `resolveOrFallback` → with the wall gone, the fallback IS the answer.
        const degraded: SketchEdge[] = sketch.outerLoop.edges.map(e => {
            if (e.type !== 'hostReference' || e.hostId !== removedId) return e;
            return { type: 'freeLine', start: e.fallback!.start, end: e.fallback!.end } as FreeLineEdge;
        });

        const nowFree = degraded.filter((e): e is FreeLineEdge => e.type === 'freeLine');
        expect(nowFree.length).toBe(1);
        expect(nowFree[0]!.start).toEqual(expected.start);
        expect(nowFree[0]!.end).toEqual(expected.end);

        // Non-destructive: the other three edges still reference their live walls, so
        // the slab keeps following them.
        const stillHosted = degraded.filter(e => e.type === 'hostReference');
        expect(stillHosted.length).toBe(3);

        // And the degraded boundary is geometrically INTACT — nothing vanished.
        const projected = projectSketch(
            { outerLoop: { edges: degraded } },
            walls.filter(w => w.id !== removedId),
        );
        expect(projected.length).toBe(4);
        for (const seg of projected) {
            expect(Number.isFinite(seg.start.x)).toBe(true);
            expect(Number.isFinite(seg.end.y)).toBe(true);
        }
    });
});

// ── the honest refusal ──────────────────────────────────────────────────────

describe('§REGION-HOST-ATTRIBUTION — non-attributable segments refuse, they do not guess', () => {
    it('a CURVED bounding wall yields FreeLineEdges with NO hostId, and is COUNTED', () => {
        // The §SLAB-REGION-CURVED fixture: three straight walls + one arc.
        const walls = [
            wall('w-top', 0, 4, 6, 4),
            wall('w-left', 0, 4, 0, 0),
            wall('w-bottom', 0, 0, 4, 0),
            curvedWall('w-arc', 4, 0, 6, 4, 6, 0, 16),
        ];
        const traced = traceRegionSketchAtPoint(walls, 2, 2);
        expect(traced).not.toBeNull();

        const { sketch, attribution } = traced!;

        // NOT ONE edge may name the curved wall. `WallFaceResolver` resolves a host
        // edge to ONE straight segment spanning baseLine[0]→baseLine[1]; attributing
        // the arc's chords to it would re-project every chord onto that straight
        // chord and DESTROY the curve the tracer exists to preserve.
        for (const e of hostEdges(sketch)) {
            expect(e.hostId).not.toBe('w-arc');
        }

        // The arc's chords are free edges, and the refusal is MEASURED, not silent.
        expect(attribution.curvedFallbacks).toBeGreaterThan(0);
        expect(attribution.freeEdges).toBeGreaterThanOrEqual(attribution.curvedFallbacks);
        expect(attribution.hostWallIds).not.toContain('w-arc');

        // Every free edge really carries no hostId (structurally, not just by name).
        for (const e of freeEdges(sketch)) {
            expect((e as unknown as Record<string, unknown>).hostId).toBeUndefined();
        }

        // The straight walls are still honoured — the refusal is scoped to the arc.
        expect(attribution.hostEdges).toBeGreaterThan(0);
    });

    it('a wall carrying no id is unattributable and is counted separately from the arc case', () => {
        const walls = [
            wall('w-south', 0, 0, 6, 0),
            { baseLine: [{ x: 6, z: 0 }, { x: 6, z: 4 }] }, // no id
            wall('w-north', 6, 4, 0, 4),
            wall('w-west', 0, 4, 0, 0),
        ];
        const { sketch, attribution } = traceRegionSketchAtPoint(walls, 3, 2)!;

        expect(attribution.hostEdges).toBe(3);
        expect(attribution.missingIdFallbacks).toBe(1);
        expect(attribution.curvedFallbacks).toBe(0);
        expect(freeEdges(sketch).length).toBe(1);
    });

    it('reports the reason on each unattributed chord at the segment level', () => {
        const segs = wallsToAttributedSegments([
            wall('w-straight', 0, 0, 4, 0),
            curvedWall('w-arc', 4, 0, 6, 4, 6, 0, 16),
            { baseLine: [{ x: 6, z: 4 }, { x: 0, z: 4 }] },
        ]);
        const straight = segs.filter(s => s.hostId === 'w-straight');
        expect(straight.length).toBe(1);
        expect(straight[0]!.reason).toBeUndefined();

        // Arc chords: many, all refused, all for the SAME stated reason.
        const arcChords = segs.filter(s => s.reason === 'curved');
        expect(arcChords.length).toBeGreaterThan(1);
        for (const s of arcChords) expect(s.hostId).toBeNull();

        const anonymous = segs.filter(s => s.reason === 'noWallId');
        expect(anonymous.length).toBe(1);
        expect(anonymous[0]!.hostId).toBeNull();
    });
});

// ── zero regression ─────────────────────────────────────────────────────────

describe('§REGION-HOST-ATTRIBUTION — the ring geometry is unchanged', () => {
    it('the attributed ring is point-for-point identical to findRegionAtPoint', () => {
        const cases: Array<[RegionWallLike[], number, number]> = [
            [fourWallRoom(), 3, 2],
            [[
                wall('a', 0, 4, 6, 4),
                wall('b', 0, 4, 0, 0),
                wall('c', 0, 0, 4, 0),
                curvedWall('d', 4, 0, 6, 4, 6, 0, 16),
            ], 2, 2],
        ];

        for (const [walls, x, z] of cases) {
            const plain = findRegionAtPoint(walls, x, z);
            const attributed = findAttributedRegionAtPoint(walls, x, z);
            expect(plain).not.toBeNull();
            expect(attributed).not.toBeNull();
            expect(attributed!.map(v => v.point)).toEqual(plain);
        }
    });

    it('returns null where no region encloses the point — a refusal, not an empty sketch', () => {
        expect(traceRegionSketchAtPoint(fourWallRoom(), 20, 20)).toBeNull();
        expect(findAttributedRegionAtPoint(fourWallRoom(), 20, 20)).toBeNull();
    });

    it('buildRegionSketch refuses a degenerate ring rather than emit a 2-edge loop', () => {
        expect(buildRegionSketch([])).toBeNull();
        expect(buildRegionSketch([
            { point: { x: 0, y: 0 }, hostId: null },
            { point: { x: 1, y: 0 }, hostId: null },
        ])).toBeNull();
    });
});
