// L-965 DEFECT 1 — a CURVED slab edge must become a CURVED WALL, not N straight ones.
//
// The founder drew a curved slab, ran "walls by slab", and got a faceted drum:
//
//   [SlabTool] … polylinePoints=17
//   [CreateWallsOnAllSlabsCommand] slab="…" walls=33
//   [WallJoinResolver] §SELF-CLUSTER-GUARD: skipped 8 endpoint(s) from 4 wall(s)
//                      whose BOTH ends are in this cluster
//
// `CreateWallsFromSlabCommand` walked the slab's TESSELLATED boundary vertices and
// emitted one straight wall per edge. It never consulted the curve — and it could
// not have, because a slab boundary is a POLYGON by schema and the arc that drew it
// is not stored anywhere (see `boundaryArc.ts`). So the arc is RECOVERED from the
// uniform-t sampling that produced those vertices.
//
// ⛔ THE FIX IS NOT MORE TESSELLATION. The third log line is why: thirty-three short
// chords around a tight arc put several endpoints inside ONE junction cluster, and
// WallJoinResolver skips every wall with BOTH ends in it. More, smaller straight
// walls is the same defect with a bigger number and a strictly worse cluster. The
// last test in this file measures that directly against the REAL clustering code.
//
// ⚠ THE FIXTURE IS BUILT INDEPENDENTLY OF THE SUBJECT. The arc vertices below are
// sampled by a Bézier written out longhand in this file — NOT by `tessellateArcSegment`,
// which the recovery under test calls. A fixture built with the subject's own sampler
// would move oracle and subject together and measure nothing.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { detectJunctionClusters, DEFAULT_SNAP_RADIUS } from '@pryzm/geometry-wall';
import { CreateWallsFromSlabCommand } from '../src/walls/CreateWallsFromSlabCommand';
import type { CommandContext } from '../src/types';

// ── The founder's shape class, at the scale that self-clusters ────────────────
// A 4 m × 4 m slab whose SOUTH edge is one arc gesture: start (0,0) → clicked
// midpoint (2,−2) → end (4,0), tessellated at the tool's 16 chords. Every chord is
// well under the 0.5 m join snap radius, which is exactly why the drum defeated the
// solver.
const S = { x: 0, z: 0 };
const M = { x: 2, z: -2 };
const E = { x: 4, z: 0 };
const ARC_CHORDS = 16;

/** C = 2·M − 0.5·(S + E) — the control that puts the Bézier through M at t = 0.5. */
const CONTROL = { x: 2 * M.x - 0.5 * (S.x + E.x), z: 2 * M.z - 0.5 * (S.z + E.z) };

/** Longhand quadratic Bézier. Deliberately NOT the module the subject calls. */
function bezierAt(t: number): { x: number; z: number } {
    const u = 1 - t;
    return {
        x: u * u * S.x + 2 * u * t * CONTROL.x + t * t * E.x,
        z: u * u * S.z + 2 * u * t * CONTROL.z + t * t * E.z,
    };
}

/**
 * The slab polygon exactly as the slab tool would have stored it: the arc start,
 * then the 16 sampled arc vertices, then two square corners. 19 vertices, and
 * therefore 19 straight walls before this fix.
 */
function curvedSlabPolygon(): { x: number; y: number }[] {
    const ring: { x: number; y: number }[] = [{ x: S.x, y: S.z }];
    for (let i = 1; i <= ARC_CHORDS; i++) {
        const p = bezierAt(i / ARC_CHORDS);
        ring.push({ x: p.x, y: p.z });
    }
    ring.push({ x: 4, y: 4 });
    ring.push({ x: 0, y: 4 });
    return ring;
}

const RECT = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];

// ── Harness ───────────────────────────────────────────────────────────────────
type Pt = { x: number; y: number; z: number };

interface W {
    id: string;
    levelId: string;
    baseLine: [Pt, Pt];
    curve?: { control: Pt; segments: number };
    openings: unknown[];
    childrenIds: string[];
}

function makeCtx(polygon: { x: number; y: number }[]) {
    const map = new Map<string, W>();
    const wallStore = {
        add(w: W) { map.set(w.id, w); },
        remove(id: string) { map.delete(id); },
        getById(id: string) { return map.get(id); },
        getAll() { return [...map.values()]; },
        getByLevel(levelId: string) { return [...map.values()].filter(w => w.levelId === levelId); },
        update(id: string, patch: Partial<W>) { const w = map.get(id); if (w) map.set(id, { ...w, ...patch } as W); },
    };
    const slab = { id: 'slab-1', type: 'slab', levelId: 'L0', position: { x: 0, y: 0, z: 0 }, polygon };
    const level = { id: 'L0', elevation: 0, childrenIds: [] as string[] };
    const ctx = {
        stores: {
            wallStore,
            slabStore: { getById: (id: string) => (id === 'slab-1' ? slab : undefined), getAll: () => [slab] },
        },
        bimManager: {
            getLevels: () => [level],
            getLevelById: (id: string) => (id === 'L0' ? level : undefined),
            registerElement: () => {},
            unregisterElement: () => {},
            registerMany: () => {},
        },
    } as unknown as CommandContext;
    return { ctx, wallStore };
}

/**
 * How many walls have BOTH endpoints inside ONE junction cluster — the population
 * `WallJoinResolver` §SELF-CLUSTER-GUARD refuses to resolve and skips.
 * Measured with the REAL clustering code at the REAL default snap radius.
 */
function selfClusteredWallCount(walls: Array<{ id: string; baseLine: [Pt, Pt] }>): number {
    const bl = new Map<string, [THREE.Vector3, THREE.Vector3]>();
    for (const w of walls) {
        bl.set(w.id, [
            new THREE.Vector3(w.baseLine[0].x, w.baseLine[0].y, w.baseLine[0].z),
            new THREE.Vector3(w.baseLine[1].x, w.baseLine[1].y, w.baseLine[1].z),
        ]);
    }
    const clusters = detectJunctionClusters(walls as never[], bl, DEFAULT_SNAP_RADIUS);
    const offenders = new Set<string>();
    for (const cluster of clusters) {
        const seen = new Map<string, number>();
        for (const ep of cluster.endpoints) seen.set(ep.wallId, (seen.get(ep.wallId) ?? 0) + 1);
        for (const [id, count] of seen) if (count >= 2) offenders.add(id);
    }
    return offenders.size;
}

/** The faceted drum the OLD path produced: one straight wall per polygon edge. */
function facetedWalls(polygon: { x: number; y: number }[]): Array<{ id: string; baseLine: [Pt, Pt] }> {
    return polygon.map((p, i) => {
        const q = polygon[(i + 1) % polygon.length]!;
        return {
            id: `faceted-${i}`,
            baseLine: [{ x: p.x, y: 0, z: p.y }, { x: q.x, y: 0, z: q.y }] as [Pt, Pt],
        };
    });
}

function installBus() {
    const bus = {
        registry: { has: (t: string) => t === 'wall.batch.create' },
        executeCommand: () => Promise.resolve({ ok: true }),
    };
    (window as unknown as { runtime?: unknown }).runtime = { bus };
}

describe('L-965 §L965-RECOVER-BOUNDARY-ARCS — walls by slab on a CURVED slab', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        installBus();
    });
    afterEach(() => {
        vi.restoreAllMocks();
        delete (window as unknown as { runtime?: unknown }).runtime;
    });

    it('THE FOUNDER CASE — 19 boundary vertices become 4 walls, one of them CURVED', () => {
        const polygon = curvedSlabPolygon();
        expect(polygon).toHaveLength(19); // the fixture really is a tessellated drum

        const { ctx, wallStore } = makeCtx(polygon);
        const cmd = new CreateWallsFromSlabCommand({ slabId: 'slab-1' });
        expect(cmd.canExecute(ctx).ok).toBe(true);

        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);

        // The count drops to DISTINCT EDGES, not tessellation stations.
        expect(r.affectedElementIds, 'one arc + three straight sides').toHaveLength(4);

        const walls = wallStore.getAll();
        const curved = walls.filter(w => w.curve);
        expect(curved, 'exactly one wall carries the arc').toHaveLength(1);

        // …and it is THE arc: same endpoints, same control point the tool authored.
        const arc = curved[0]!;
        const ends = [arc.baseLine[0], arc.baseLine[1]];
        const hasEnd = (p: { x: number; z: number }) =>
            ends.some(e => Math.hypot(e.x - p.x, e.z - p.z) < 1e-6);
        expect(hasEnd(S) && hasEnd(E), 'the curved wall spans the whole arc gesture').toBe(true);
        expect(arc.curve!.control.x).toBeCloseTo(CONTROL.x, 6);
        expect(arc.curve!.control.z).toBeCloseTo(CONTROL.z, 6);
        expect(arc.curve!.segments).toBeGreaterThanOrEqual(4); // WallCurve schema floor

        // The other three are straight — a curve stamped on a square side would be
        // a different bug wearing this fix as a disguise.
        expect(walls.filter(w => !w.curve)).toHaveLength(3);
    });

    it("THE FOUNDER'S DRUM — 33 boundary vertices, TWO arc gestures, become 3 walls", () => {
        // His log: polylinePoints=17 mid-draw (start + one 16-chord arc), walls=33 at
        // commit (start + two 16-chord arcs). Two arcs drawn back to back SHARE the
        // vertex between them, which is the case a naive overlap guard silently
        // half-fixes — one arc recovered, the second left as sixteen chords.
        const A = { x: 0, z: 0 };
        const B = { x: 6, z: 0 };
        const via1 = { x: 3, z: -2.5 };
        const back = { x: 0.5, z: 1 };
        const via2 = { x: 3, z: 3 };
        const ctrl = (s: { x: number; z: number }, m: { x: number; z: number }, e: { x: number; z: number }) =>
            ({ x: 2 * m.x - 0.5 * (s.x + e.x), z: 2 * m.z - 0.5 * (s.z + e.z) });
        const C1 = ctrl(A, via1, B);
        const C2 = ctrl(B, via2, back);
        const sample = (s: typeof A, c: typeof A, e: typeof A, t: number) => {
            const u = 1 - t;
            return { x: u * u * s.x + 2 * u * t * c.x + t * t * e.x, z: u * u * s.z + 2 * u * t * c.z + t * t * e.z };
        };

        const polygon: { x: number; y: number }[] = [{ x: A.x, y: A.z }];
        for (let i = 1; i <= ARC_CHORDS; i++) { const p = sample(A, C1, B, i / ARC_CHORDS); polygon.push({ x: p.x, y: p.z }); }
        for (let i = 1; i <= ARC_CHORDS; i++) { const p = sample(B, C2, back, i / ARC_CHORDS); polygon.push({ x: p.x, y: p.z }); }
        expect(polygon).toHaveLength(33);

        const { ctx, wallStore } = makeCtx(polygon);
        const r = new CreateWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);

        expect(r.affectedElementIds, 'two arcs plus the closing chord').toHaveLength(3);
        expect(wallStore.getAll().filter(w => w.curve)).toHaveLength(2);
    });

    it('THE JOIN SOLVER IS SATISFIED — no wall has both ends in one junction cluster', () => {
        const polygon = curvedSlabPolygon();

        // What the OLD path handed the resolver, constructed here rather than by the
        // subject: chords far shorter than the 0.5 m snap radius, several endpoints
        // in one cluster, and §SELF-CLUSTER-GUARD skipping the walls it cannot resolve.
        const before = selfClusteredWallCount(facetedWalls(polygon));
        expect(before, 'the faceted drum really does defeat the solver').toBeGreaterThan(0);

        const { ctx, wallStore } = makeCtx(polygon);
        new CreateWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);

        const after = selfClusteredWallCount(
            wallStore.getAll().map(w => ({ id: w.id, baseLine: w.baseLine })),
        );
        expect(after, 'every wall is now resolvable by the join solver').toBe(0);
    });

    it('NON-REGRESSION — a STRAIGHT-edged slab still produces one wall per edge, uncurved', () => {
        const { ctx, wallStore } = makeCtx(RECT);
        const r = new CreateWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);

        expect(r.affectedElementIds).toHaveLength(4);
        expect(wallStore.getAll().filter(w => w.curve)).toHaveLength(0);

        // The four walls are the four sides of the rectangle, unchanged.
        const ends = wallStore.getAll()
            .map(w => `${w.baseLine[0].x},${w.baseLine[0].z}->${w.baseLine[1].x},${w.baseLine[1].z}`)
            .sort();
        // Pinned to the CURRENT walk, winding included, so a change of direction is a
        // deliberate act and not a side effect of the arc work.
        expect(ends).toEqual([
            '0,0->6,0',
            '0,4->0,0',
            '6,0->6,4',
            '6,4->0,4',
        ].sort());
    });

    it('the slab POSITION offset lands on the curve control too, not only the endpoints', () => {
        const polygon = curvedSlabPolygon();
        const { ctx, wallStore } = makeCtx(polygon);
        // Move the slab; the arc must move with it.
        (ctx.stores as unknown as { slabStore: { getById: (id: string) => { position: Pt } } })
            .slabStore.getById('slab-1').position = { x: 100, y: 0, z: -50 };

        new CreateWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);
        const arc = wallStore.getAll().find(w => w.curve)!;
        expect(arc).toBeDefined();
        expect(arc.curve!.control.x).toBeCloseTo(CONTROL.x + 100, 6);
        expect(arc.curve!.control.z).toBeCloseTo(CONTROL.z - 50, 6);
    });
});
