/**
 * GR-12 — **MUTATION-UPDATE ON MOVE**: the founder's original question, EXECUTED.
 *
 * > *"closed polyline of walls → slab by region → move a wall — does the slab follow?"*
 *
 * C78 §6 calls move **"the unmeasured lifecycle phase"**. C79 §5.5 records that no path
 * in this repository has been shown to DISTINGUISH the five recomputation states, and
 * C79 §6.3's own caveat says a green attribution table *"says nothing about whether the
 * finish follows when its wall moves"*. C79 §8.3(b) states the reason plainly: **no
 * static gate can see this — it is provable only by an executed test.** This file is
 * that test.
 *
 * It is a MEASUREMENT, not a fix. Nothing here edits production code. Every number
 * below was produced by running this file.
 *
 * ── WHAT IS REAL, AND WHAT IS NOT (C74 §3.4 — a fixture that supplies the value under
 *    test proves nothing) ────────────────────────────────────────────────────────────
 *
 * REAL — imported from production modules, never re-implemented here:
 *   • `traceRegionSketchAtPoint`  (`src/SlabRegionTracer.ts:730`) — the ONE
 *     host-reference-producing region entry point in the tree (C79 §6.4). **This file
 *     never writes a `hostReference` edge literal.** Every sketch under test is
 *     PRODUCED BY THE TRACER, so a tracer that stopped emitting references would turn
 *     this suite red rather than be masked by it.
 *   • `WallFaceResolver`          (`src/WallFaceResolver.ts:36`) — the real resolver,
 *     reading the real `window.wallStore` global it reads in production.
 *   • `SlabFragmentBuilder.resolveLoop` (`src/SlabFragmentBuilder.ts:683`) — **the
 *     production sketch→polygon function**, the one `createSlabMeshWithEdges:978` calls
 *     to decide where the slab is drawn. Reached through the class (it is `private
 *     static`, i.e. a TypeScript-only visibility marker) rather than re-composed here,
 *     precisely so this probe cannot drift from the shipped geometry path.
 *   • `SlabStore`                 (`src/SlabStore.ts`) — the real store, the real
 *     `validateSlabData` boundary, the real event fan-out.
 *   • `SlabDependencyTracker`     (`src/SlabDependencyTracker.ts`) — the real tracker,
 *     constructed the way `apps/editor/src/engine/initTools.ts:825` constructs it.
 *   • `buildRoomFinishBoundarySketch` (`@pryzm/command-registry`
 *     `src/rooms/roomBoundarySketch.ts:220`) — the real producer of floor/ceiling
 *     finish references (C79 §10.3's DERIVE-FROM-THE-ROOM decision).
 *
 * NOT REAL, stated so nothing is overclaimed:
 *   • The wall store is a probe double. It has to be: the production `WallStore` is an
 *     L2 package geometry-slab does not depend on. It implements exactly the two
 *     surfaces the code under test uses — `subscribe(cb)` (the tracker) and
 *     `getById(id)` (the resolver) — and it is the SUBJECT of the move, never the
 *     source of the answer.
 *   • No THREE scene is rendered. The measurement stops at the polygon
 *     `SlabFragmentBuilder` extrudes, which is where "does it follow" is decided.
 *   • ROOF is not probed here and cannot be: `@pryzm/geometry-roof` is not a dependency
 *     of this package. Its arm lives in
 *     `tools/rac-conformance/certification/gates/check-move-propagation.ts`.
 *
 * ── THE FALSIFIER (C74 §6.2 / §3.4) ─────────────────────────────────────────────────
 * `§0 — THE PROBE'S OWN FALSIFIER` runs the identical measurement over a sketch whose
 * `hostId`s have been stripped — a pre-`e6c8cb58` coordinate-only slab — and proves the
 * probe reports NOT-FOLLOWING for it. A move-propagation probe that passes because it
 * never really moved anything is worthless; this is the arm that rules that out.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
    traceRegionSketchAtPoint,
    type RegionWallLike,
} from '../src/SlabRegionTracer';
import { WallFaceResolver } from '../src/WallFaceResolver';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';
import { SlabStore } from '../src/SlabStore';
import { SlabDependencyTracker } from '../src/SlabDependencyTracker';
// §C79-5.2-SLAB-STATES — the five-state channel this suite used to measure as absent.
import { classifySlabRecompute } from '../src/slabRecomputeVerdict';
import { validateSlabData } from '../src/SlabValidator';
import type {
    HostReferenceEdge,
    SketchEdge,
    SlabSketch,
    SketchLoop,
} from '../src/SketchTypes';
import type { SlabData } from '../src/SlabTypes';
import {
    buildRoomFinishBoundarySketch,
    type FinishHostReferenceEdge,
} from '../../command-registry/src/rooms/roomBoundarySketch';

// ─── the probe's wall store ─────────────────────────────────────────────────
//
// Two surfaces, because the code under test uses exactly two:
//   `subscribe(cb)`  — SlabDependencyTracker.ts:69
//   `getById(id)`    — WallFaceResolver.ts:40 (via `window.wallStore`)
// `move()` is the ACT under measurement. It mutates the wall's centreline and
// then emits the SAME `'update'` event a real WallStore emits.

type ProbeWall = {
    id: string;
    baseLine: { x: number; y: number; z: number }[];
    thickness: number;
};
type WallEvent = 'add' | 'update' | 'remove';

class ProbeWallStore {
    private walls = new Map<string, ProbeWall>();
    private listeners: ((e: WallEvent, w: ProbeWall) => void)[] = [];

    seed(w: ProbeWall): void {
        this.walls.set(w.id, w);
    }
    getById(id: string): ProbeWall | undefined {
        return this.walls.get(id);
    }
    getAll(): ProbeWall[] {
        return [...this.walls.values()];
    }
    subscribe(cb: (e: WallEvent, w: ProbeWall) => void): () => void {
        this.listeners.push(cb);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== cb);
        };
    }
    /** THE ACT: translate a wall's centreline, then emit the real 'update' event. */
    move(id: string, dx: number, dz: number): void {
        const w = this.walls.get(id);
        if (!w) throw new Error(`probe wall "${id}" not seeded`);
        w.baseLine = w.baseLine.map((p) => ({ x: p.x + dx, y: p.y, z: p.z + dz }));
        for (const l of this.listeners) l('update', w);
    }
    /** Vanish a wall WITHOUT a remove event — the resolver's `undetermined` case. */
    vanish(id: string): void {
        this.walls.delete(id);
    }
    /** A real removal, which is what drives C79 §4 degradation. */
    remove(id: string): void {
        const w = this.walls.get(id);
        if (!w) return;
        this.walls.delete(id);
        for (const l of this.listeners) l('remove', w);
    }
    /** The tracer's view of the same walls (`RegionWallLike`). */
    asRegionWalls(): RegionWallLike[] {
        return this.getAll().map((w) => ({
            id: w.id,
            baseLine: w.baseLine.map((p) => ({ x: p.x, z: p.z })),
        }));
    }
}

/**
 * The tracker's constructor is typed against the full `WallData` record. The probe
 * store carries the three fields the tracker and the resolver actually READ
 * (`id`, `baseLine`, `thickness`) and nothing else, so this is a widening cast at
 * ONE named seam rather than a fake `WallData` literal with twenty invented fields —
 * inventing them would be exactly the fixture-supplies-the-answer shape C74 §3.4
 * forbids, and every invented field would be a value this probe silently asserted.
 */
type TrackerWallStore = ConstructorParameters<typeof SlabDependencyTracker>[1];
const asTrackerWallStore = (s: ProbeWallStore): TrackerWallStore =>
    s as unknown as TrackerWallStore;

/** A 6 m × 4 m room of four straight walls — C79 §10.3's reference fixture. */
function seedRoom(store: ProbeWallStore): void {
    const w = (id: string, x0: number, z0: number, x1: number, z1: number): ProbeWall => ({
        id,
        baseLine: [
            { x: x0, y: 0, z: z0 },
            { x: x1, y: 0, z: z1 },
        ],
        thickness: 0.2,
    });
    store.seed(w('w-south', 0, 0, 6, 0));
    store.seed(w('w-east', 6, 0, 6, 4));
    store.seed(w('w-north', 6, 4, 0, 4));
    store.seed(w('w-west', 0, 4, 0, 0));
}

/**
 * THE PRODUCTION SKETCH→POLYGON CALL, verbatim.
 * `SlabFragmentBuilder.resolveLoop` is `private static` — a compile-time marker, not a
 * runtime one. Reaching it through the class is deliberate: re-composing
 * `WallFaceResolver.resolveOrFallback` + `SketchLoopIntersector.computePolygon` here
 * would let this probe drift from the shipped path, which is the exact defect class
 * C79 §0 is about.
 */
function productionResolve(loop: SketchLoop): { x: number; y: number }[] | null {
    const fn = (SlabFragmentBuilder as unknown as {
        resolveLoop(l: SketchLoop): { x: number; y: number }[] | null;
    }).resolveLoop;
    return fn(loop);
}

/** Shoelace area of a resolved ring, in m². The number the user reads as "the slab". */
function area(poly: ReadonlyArray<{ x: number; y: number }> | null): number {
    if (!poly || poly.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!;
        const q = poly[(i + 1) % poly.length]!;
        a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a / 2);
}

/** Area of a `{x,z}` finish ring — the FloorPanelBuilder / CeilingPanelBuilder input. */
function areaXZ(poly: ReadonlyArray<{ x: number; z: number }>): number {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!;
        const q = poly[(i + 1) % poly.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

const hostEdgesOf = (s: SlabSketch): HostReferenceEdge[] =>
    s.outerLoop.edges.filter((e): e is HostReferenceEdge => e.type === 'hostReference');

/** Strip every reference — the pre-`e6c8cb58` coordinate-only slab, for the falsifier. */
function stripReferences(sketch: SlabSketch): SlabSketch {
    const edges: SketchEdge[] = sketch.outerLoop.edges.map((e) =>
        e.type === 'hostReference'
            ? { type: 'freeLine', start: e.fallback!.start, end: e.fallback!.end }
            : e,
    );
    return { outerLoop: { edges } };
}

// ─── harness ────────────────────────────────────────────────────────────────

let walls: ProbeWallStore;

beforeEach(() => {
    walls = new ProbeWallStore();
    seedRoom(walls);
    // The resolver reads this global in production (`WallFaceResolver.ts:37`,
    // TODO(TASK-08)). Setting it is wiring the probe to the production read path,
    // not substituting for it.
    Object.assign(window, { wallStore: walls });
});

afterEach(() => {
    Object.assign(window, { wallStore: undefined });
});

// ════════════════════════════════════════════════════════════════════════════
// §0 — THE PROBE'S OWN FALSIFIER
// ════════════════════════════════════════════════════════════════════════════

describe('§0 — the probe DETECTS a non-following slab (C74 §3.4)', () => {
    it('a reference-stripped sketch does NOT move when its wall moves, and the probe says so', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        expect(traced).not.toBeNull();

        // Same ring, same geometry, references removed — a slab drawn before the
        // region relationship was retained at all.
        const inert = stripReferences(traced.sketch);
        expect(hostEdgesOf(inert)).toHaveLength(0);

        const before = productionResolve(inert.outerLoop);
        walls.move('w-north', 0, 2); // the north wall goes from z=4 to z=6
        const after = productionResolve(inert.outerLoop);

        expect(area(before)).toBeCloseTo(24, 6);
        expect(area(after)).toBeCloseTo(24, 6); // 24, not 36 — it did NOT follow
        expect(after).toEqual(before);

        console.log(
            `[GR-12 §0 FALSIFIER] reference-stripped slab after a 2 m wall move: ` +
            `${area(before).toFixed(3)} m² → ${area(after).toFixed(3)} m² — DID NOT FOLLOW. ` +
            `The probe can therefore tell a follower from a non-follower.`,
        );
    });

    it('the SAME measurement over the SAME move reports FOLLOWING when references are present', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        const before = productionResolve(traced.sketch.outerLoop);
        walls.move('w-north', 0, 2);
        const after = productionResolve(traced.sketch.outerLoop);

        expect(area(before)).toBeCloseTo(24, 6);
        expect(area(after)).toBeCloseTo(36, 6);
        expect(after).not.toEqual(before);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §1 — SLAB, at the RESOLVER: does the reference re-project?
// ════════════════════════════════════════════════════════════════════════════

describe('§1 — SLAB: the region reference RE-PROJECTS when its wall moves', () => {
    it('the production sketch→polygon path tracks the moved centreline exactly', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        expect(traced.attribution.hostEdges).toBe(4);
        expect(traced.attribution.freeEdges).toBe(0);

        const before = productionResolve(traced.sketch.outerLoop)!;
        expect(area(before)).toBeCloseTo(24, 6);

        walls.move('w-north', 0, 2);
        const after = productionResolve(traced.sketch.outerLoop)!;

        // Every vertex on the north edge moved by exactly 2 m; the south edge did not.
        expect(area(after)).toBeCloseTo(36, 6);
        expect(Math.max(...after.map((p) => p.y))).toBeCloseTo(6, 6);
        expect(Math.min(...after.map((p) => p.y))).toBeCloseTo(0, 6);

        console.log(
            `[GR-12 §1 SLAB/RESOLVER] region slab after a 2 m move of w-north: ` +
            `${area(before).toFixed(3)} m² → ${area(after).toFixed(3)} m² — FOLLOWS. ` +
            `The re-projection MECHANISM works; §2 measures whether it is ever REACHED.`,
        );
    });

    it('§5.1 — re-derivation is idempotent and order-independent', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        walls.move('w-north', 0, 2);
        const a = productionResolve(traced.sketch.outerLoop);
        const b = productionResolve(traced.sketch.outerLoop);
        const c = productionResolve(traced.sketch.outerLoop);
        expect(b).toEqual(a);
        expect(c).toEqual(a);

        // …and the same end state is reached by a different move ORDER.
        const walls2 = new ProbeWallStore();
        seedRoom(walls2);
        Object.assign(window, { wallStore: walls2 });
        const traced2 = traceRegionSketchAtPoint(walls2.asRegionWalls(), 3, 2)!;
        walls2.move('w-north', 0, 1);
        walls2.move('w-north', 0, 1);
        expect(productionResolve(traced2.sketch.outerLoop)).toEqual(a);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §2 — SLAB, LIVE: is the re-projection ever REACHED?
//      This is the founder's question end to end.
// ════════════════════════════════════════════════════════════════════════════

/** A minimal, schema-valid region slab. `polygon` mirrors what the plan handler commits. */
function regionSlab(id: string, sketch: SlabSketch, ring: { x: number; y: number }[]): SlabData {
    return {
        id,
        type: 'slab',
        levelId: 'L0',
        thickness: 0.2,
        position: { x: 0, y: 0, z: 0 },
        polygon: ring,
        sketch,
        ifcData: { guid: `guid-${id}`, ifcClass: 'IfcSlab' },
    } as unknown as SlabData;
}

describe('§2 — SLAB, LIVE WIRING: the founder\'s question, end to end', () => {
    // ⚠ INVERTED 2026-08-13 by §FIX-SLAB-TRACKER-EVENT-SHAPE. This test pinned the
    // DEFECT: it asserted `rebuilds` stayed EMPTY, because the tracker's listeners
    // guarded on `e.detail.slab` while the store emits `{ id }`, so registerSlab()
    // was unreachable and nothing was ever asked to re-project.
    //
    // The wire is now fixed, so the pin must flip — a test that still demanded 0
    // rebuilds would FORBID the fix and force the next author to delete the proof
    // rather than the defect. It now positively enforces that the slab follows.
    it('a slab created AFTER the tracker is wired DOES re-project — the wire is fixed', () => {
        const slabStore = new SlabStore();
        const rebuilds: string[] = [];
        const realTrigger = slabStore.triggerRebuild.bind(slabStore);
        slabStore.triggerRebuild = (id: string): void => {
            rebuilds.push(id);
            realTrigger(id);
        };

        // Wired exactly as `initTools.ts:825` wires it.
        const tracker = new SlabDependencyTracker(
            slabStore,
            asTrackerWallStore(walls),
            { current: undefined },
        );

        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        // The production write path. Fires the canonical `bim-slab-added` event.
        slabStore.add(regionSlab('sb-live', traced.sketch, traced.ring));

        walls.move('w-north', 0, 2);

        // ← THE ANSWER, post-fix: the slab IS asked to re-project. `toContain`
        //   rather than `toEqual([...])` because the count is not the invariant —
        //   "at least once, for THIS slab" is. Pinning an exact call count would
        //   go red on a harmless coalescing change and teach the next author to
        //   loosen the assertion instead of reading it.
        expect(rebuilds).toContain('sb-live');

        // ⚠ INVERTED 2026-08-13 (second time, by §FIX-SLAB-POLYGON-WRITEBACK).
        // This assertion pinned the SECOND half of the defect: after the wire fix
        // the slab was ASKED to re-project, but the stored polygon still said 24 m²
        // because nothing wrote the re-derived ring back. The tracker now persists
        // it through slabStore.update() on the same move, so the RECORD follows too.
        const stored = slabStore.getById('sb-live')!;
        expect(area(stored.polygon as { x: number; y: number }[])).toBeCloseTo(36, 6);

        console.log(
            `[GR-12 §2 SLAB/LIVE] wall moved 2 m; SlabDependencyTracker requested ` +
            `${rebuilds.length} rebuild(s) and SlabData.polygon now records ` +
            `${area(stored.polygon as { x: number; y: number }[]).toFixed(3)} m². ` +
            `The slab follows — mesh AND model.`,
        );
        tracker.dispose();
    });

    it('POSITIVE CONTROL: the same harness DOES observe a rebuild after tracker.bootstrap()', () => {
        const slabStore = new SlabStore();
        const rebuilds: string[] = [];
        const realTrigger = slabStore.triggerRebuild.bind(slabStore);
        slabStore.triggerRebuild = (id: string): void => {
            rebuilds.push(id);
            realTrigger(id);
        };

        const tracker = new SlabDependencyTracker(slabStore, asTrackerWallStore(walls), { current: undefined });
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        slabStore.add(regionSlab('sb-boot', traced.sketch, traced.ring));

        // The ONE call that populates the graph — `initTools.ts:828`, run once at
        // wiring time and never again.
        tracker.bootstrap();
        walls.move('w-north', 0, 2);

        expect(rebuilds).toEqual(['sb-boot']);
        // …and the re-projection then produces the FOLLOWED geometry.
        const stored = slabStore.getById('sb-boot')!;
        expect(area(productionResolve(stored.sketch!.outerLoop))).toBeCloseTo(36, 6);

        console.log(
            `[GR-12 §2 CONTROL] identical harness + tracker.bootstrap(): ` +
            `${rebuilds.length} rebuild(s), re-projected to ` +
            `${area(productionResolve(stored.sketch!.outerLoop)).toFixed(3)} m². ` +
            `The zero above is a REAL zero, not a broken probe.`,
        );
        tracker.dispose();
    });

    it('ROOT CAUSE, pinned: the store emits `{ id }`; all three tracker listeners read `{ slab }` / `{ slabId }`', () => {
        const seen: unknown[] = [];
        const capture = (e: Event): void => { seen.push((e as CustomEvent).detail); };
        window.addEventListener('bim-slab-added', capture);
        window.addEventListener('bim-slab-updated', capture);
        window.addEventListener('bim-slab-removed', capture);

        const slabStore = new SlabStore();
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        slabStore.add(regionSlab('sb-shape', traced.sketch, traced.ring));
        slabStore.triggerRebuild('sb-shape');
        slabStore.remove('sb-shape');

        window.removeEventListener('bim-slab-added', capture);
        window.removeEventListener('bim-slab-updated', capture);
        window.removeEventListener('bim-slab-removed', capture);

        expect(seen).toHaveLength(3);
        for (const detail of seen) {
            // The canonical F.events.18 payload (`event-bus/src/catalog.ts:95-97`).
            expect(detail).toEqual({ id: 'sb-shape' });
            // The three fields `SlabDependencyTracker.ts:57-67` guards on — all absent.
            expect((detail as Record<string, unknown>).slab).toBeUndefined();
            expect((detail as Record<string, unknown>).slabId).toBeUndefined();
        }

        console.log(
            `[GR-12 §2 ROOT CAUSE] bim-slab-{added,updated,removed} all carry ` +
            `{ id } only. SlabDependencyTracker.ts:57-67 guards on detail.slab / ` +
            `detail.slabId, so registerSlab() and unregisterSlab() are unreachable ` +
            `from the event path. Only bootstrap() (initTools.ts:828, once) populates ` +
            `the graph. initBuilders.ts:367-383 was fixed for this exact mismatch ` +
            `(§DOM-EVENT-LISTENER-AUDIT-2026-05-18); the trackers were not.`,
        );
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §3 — C79 §5: can the system DISTINGUISH the five recomputation states?
// ════════════════════════════════════════════════════════════════════════════

// §C79-5.2-SLAB-STATES (2026-08-14) — THIS BLOCK'S TITLE WAS INVERTED. It read
// "the five states are NOT distinguishable", which was true when it was written
// and is the two declared check-move-propagation findings A3/A4. The RING-level
// observations below are unchanged and still true — the rings ARE byte-identical,
// which is exactly why the fact had to travel beside them — but the caller-level
// claim is now the opposite, and is proven by `c79RecomputeStates.test.ts`.
// Leaving the old title would have been a document describing a state the code
// no longer has, which is the defect this suite exists to catch.
describe('§3 — C79 §5.2: the RING cannot distinguish the states; the VERDICT does', () => {
    it('the ring-level entry points are still bare — the state travels BESIDE them', () => {
        const slabStore = new SlabStore();
        const tracker = new SlabDependencyTracker(slabStore, asTrackerWallStore(walls), { current: undefined });
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        slabStore.add(regionSlab('sb-state', traced.sketch, traced.ring));
        tracker.bootstrap();

        // Unchanged, deliberately: no draw path was given a new shape.
        expect(slabStore.triggerRebuild('sb-state')).toBeUndefined();          // still void
        const poly = productionResolve(traced.sketch.outerLoop);
        expect(Array.isArray(poly)).toBe(true);                                 // still a bare ring
        expect((poly as unknown as Record<string, unknown>).state).toBeUndefined();

        // …and the channel that DOES carry the state is reachable from the same act.
        const verdicts = tracker.recomputeForWall('w-north');
        expect(verdicts).toHaveLength(1);
        expect(verdicts[0]!.state).toBe('preserved');   // nothing moved, and we checked

        console.log(
            `[GR-12 §3 STATES] triggerRebuild → void · resolveLoop → ring | null, both ` +
            `UNCHANGED. SlabDependencyTracker.recomputeForWall → ` +
            `${JSON.stringify(verdicts.map((v) => v.state))} — C79 §5.2's five states are ` +
            `reported beside the ring, not encoded into it (§C79-5.2-SLAB-STATES).`,
        );
        tracker.dispose();
    });

    it('§5.2.1 FORBIDDEN COLLAPSE, executed: `preserved` and `undetermined` are byte-identical', () => {
        // Case PRESERVED — a wall this slab references moves by zero.
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        const p0 = productionResolve(traced.sketch.outerLoop);
        walls.move('w-north', 0, 0);
        const preserved = productionResolve(traced.sketch.outerLoop);

        // Case UNDETERMINED — the host wall is no longer resolvable at all, so
        // `resolveOrFallback` silently returns the STALE authoring-time fallback.
        const walls2 = new ProbeWallStore();
        seedRoom(walls2);
        Object.assign(window, { wallStore: walls2 });
        const traced2 = traceRegionSketchAtPoint(walls2.asRegionWalls(), 3, 2)!;
        walls2.vanish('w-north');
        const undetermined = productionResolve(traced2.sketch.outerLoop);

        // Same pixels. Opposite facts. Nothing at the caller can tell them apart.
        expect(preserved).toEqual(p0);
        expect(undetermined).toEqual(p0);
        expect(undetermined).toEqual(preserved);

        // §C79-5.2-SLAB-STATES — the resolver KNEW and used not to say. It says now.
        const northEdge = hostEdgesOf(traced2.sketch).find((e) => e.hostId === 'w-north')!;
        expect(WallFaceResolver.resolve(northEdge)).toBeNull();            // it KNOWS
        expect(WallFaceResolver.resolveOrFallback(northEdge)).not.toBeNull(); // §4.3 fallback kept
        const provenance = WallFaceResolver.resolveWithProvenance(northEdge);
        expect(provenance.source).toBe('fallback');                        // …and now it SAYS
        expect(provenance.reason).toBe('STALE_DERIVED_STATE');

        console.log(
            `[GR-12 §3 §5.2.1] preserved and undetermined both resolve to the same ` +
            `${area(preserved).toFixed(3)} m² ring — the RING still cannot tell them ` +
            `apart, and never could: they are the same pixels. What changed is that ` +
            `WallFaceResolver.resolveWithProvenance now reports source="${provenance.source}" ` +
            `reason="${provenance.reason}" beside the identical geometry, so the CALLER can ` +
            `(§C79-5.2-SLAB-STATES; the end-to-end verdicts are in c79RecomputeStates.test.ts).`,
        );
    });

    it('§5.2.2 an INVERTING move still returns a ring — and is now REPORTED as `conflicted`', () => {
        const signed = (poly: ReadonlyArray<{ x: number; y: number }> | null): number => {
            if (!poly || poly.length < 3) return 0;
            let a = 0;
            for (let i = 0; i < poly.length; i++) {
                const p = poly[i]!;
                const q = poly[(i + 1) % poly.length]!;
                a += p.x * q.y - q.x * p.y;
            }
            return a / 2;
        };

        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        const before = signed(productionResolve(traced.sketch.outerLoop));

        // Drive the north wall THROUGH the south wall. The region the user enclosed
        // no longer exists; the re-derived ring is on the OTHER SIDE of the south
        // wall with its winding reversed.
        walls.move('w-north', 0, -8);
        const after = signed(productionResolve(traced.sketch.outerLoop));

        expect(productionResolve(traced.sketch.outerLoop)).not.toBeNull(); // no refusal
        expect(Math.sign(after)).toBe(-Math.sign(before));                 // winding flipped
        expect(Math.abs(after)).toBeGreaterThan(0);                        // plausible area

        // §C79-5.2-SLAB-STATES — the ring is unchanged (record ≡ mesh, §4's
        // property) and the winding flip is now a NAMED verdict carrying both
        // numbers, instead of a plausible ring handed back in silence.
        const res = SlabFragmentBuilder.resolveLoopVerdict(traced.sketch.outerLoop);
        const v = classifySlabRecompute({
            slabId: 'sb-invert',
            previousRing: traced.ring,
            resolution: res,
        });
        expect(v.state).toBe('conflicted');
        expect(v.subReason).toMatch(/INVERTED its winding/);
        expect(v.numbers!.oldAreaM2).toBeCloseTo(Math.abs(before), 6);
        expect(v.numbers!.newAreaM2).toBeCloseTo(Math.abs(after), 6);

        console.log(
            `[GR-12 §3 CONFLICTED] a move that drives w-north through w-south re-derives ` +
            `a ring whose signed area goes ${before.toFixed(3)} → ${after.toFixed(3)} m² — ` +
            `the winding INVERTED and the slab covers ground the user never enclosed. ` +
            `The re-derivation still hands back that ring (record ≡ mesh), and now REPORTS ` +
            `"${v.state}": ${v.subReason}. NOTE what is still open: this is a verdict a ` +
            `caller can read, NOT a message a user sees — C79 §10.6's UI surface is absent ` +
            `and is not claimed closed here. \`regenerated\` is classified but not ` +
            `producible by a move (see slabRecomputeVerdict.ts's header).`,
        );
    });

    it('§5.3 element-state-is-worst-of-its-edges: the SKETCH still carries none, the VERDICT does', () => {
        // A mixed boundary: three references and one free edge (id-less wall).
        const mixed: RegionWallLike[] = [
            { id: 'w-south', baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] },
            { baseLine: [{ x: 6, z: 0 }, { x: 6, z: 4 }] }, // no id → free edge
            { id: 'w-north', baseLine: [{ x: 6, z: 4 }, { x: 0, z: 4 }] },
            { id: 'w-west', baseLine: [{ x: 0, z: 4 }, { x: 0, z: 0 }] },
        ];
        const traced = traceRegionSketchAtPoint(mixed, 3, 2)!;
        expect(traced.attribution.hostEdges).toBe(3);
        expect(traced.attribution.missingIdFallbacks).toBe(1);

        // Authoring-time counts exist (C79 §2.5). The PERSISTED sketch still carries
        // no per-edge state, deliberately — the state is a property of a
        // RE-DERIVATION, not of a stored edge, so persisting it would be a cache
        // that can go stale (C79 §5.1 forbids depending on one).
        for (const e of traced.sketch.outerLoop.edges) {
            expect((e as unknown as Record<string, unknown>).state).toBeUndefined();
        }

        // §C79-5.2-SLAB-STATES — the per-edge channel exists at re-derivation time,
        // and one bad edge decides the element (§5.3's worst-of rule).
        walls.vanish('w-north');
        const res = SlabFragmentBuilder.resolveLoopVerdict(traced.sketch.outerLoop);
        expect(res.edgeOutcomes).toHaveLength(traced.sketch.outerLoop.edges.length);
        expect(res.edgeOutcomes.filter((o) => o.state === 'undetermined')).toHaveLength(1);
        expect(res.fullyLive).toBe(false);
        expect(classifySlabRecompute({
            slabId: 'sb-mixed', previousRing: traced.ring, resolution: res,
        }).state).toBe('undetermined');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §4 — SLAB: even when it follows, WHAT follows? (mesh vs model)
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠ INVERTED 2026-08-13 by §FIX-SLAB-POLYGON-WRITEBACK. The first test in this
// block pinned the defect: it asserted `recorded` STAYED 24 m² after the move,
// proving nothing wrote the re-derived ring back to the model. Left as-is it
// would FORBID the fix. It now positively enforces drawn ≡ recorded, and the
// two tests after it pin the write-back's discriminations — `preserved` writes
// nothing, `undetermined` never overwrites the record with a fiction
// (C79 §5.2.1 — and never silently: the skip warns).

describe('§4 — the mesh follows AND the stored polygon follows (write-back)', () => {
    it('after a re-projection drawn ≡ recorded: `slab.polygon` re-derives 24 m² → 36 m²', () => {
        const slabStore = new SlabStore();
        const tracker = new SlabDependencyTracker(slabStore, asTrackerWallStore(walls), { current: undefined });
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        slabStore.add(regionSlab('sb-model', traced.sketch, traced.ring));
        tracker.bootstrap();

        const before = slabStore.getById('sb-model')!;
        expect(area(before.polygon as { x: number; y: number }[])).toBeCloseTo(24, 6);

        walls.move('w-north', 0, 2);

        const stored = slabStore.getById('sb-model')!;
        const drawn = area(productionResolve(stored.sketch!.outerLoop));
        const recorded = area(stored.polygon as { x: number; y: number }[]);

        // THE DIFFERENTIATOR: the stored polygon CHANGED, and it changed to
        // exactly the ring the builder draws. 36 ≠ 24, so a write-back that
        // silently failed cannot pass this by coincidence.
        expect(recorded).toBeCloseTo(36, 6);
        expect(recorded).not.toBeCloseTo(24, 6);
        expect(drawn).toBeCloseTo(recorded, 9);

        // Derived AABB metadata follows too — mirroring UpdateSlabPolygonCommand
        // §03, the sanctioned polygon-write path this cascade is modelled on.
        // 6 m × 4 m room, north wall +2 m → 6 m × 6 m extent.
        expect(stored.width).toBeCloseTo(6, 6);
        expect(stored.depth).toBeCloseTo(6, 6);

        console.log(
            `[GR-12 §4 MESH-vs-MODEL] after the move the builder draws ${drawn.toFixed(3)} m² ` +
            `and SlabData.polygon records ${recorded.toFixed(3)} m² — the record follows the ` +
            `same line the mesh is drawn on (§FIX-SLAB-POLYGON-WRITEBACK, via ` +
            `SlabFragmentBuilder.resolveLoop → slabStore.update, a structural cascade).`,
        );
        tracker.dispose();
    });

    it('`preserved` — a zero move re-derives, matches, and writes NOTHING (no update event)', () => {
        const slabStore = new SlabStore();
        const tracker = new SlabDependencyTracker(slabStore, asTrackerWallStore(walls), { current: undefined });
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        slabStore.add(regionSlab('sb-prsv', traced.sketch, traced.ring));
        tracker.bootstrap();

        const polyBefore = slabStore.getById('sb-prsv')!.polygon;
        const updates: string[] = [];
        const unsubscribe = slabStore.subscribe((event, slab) => {
            if (event === 'update') updates.push(slab.id);
        });

        walls.move('w-north', 0, 0); // fires the tracker; nothing actually moved

        // Same frozen array INSTANCE — the store was not written at all. An update
        // event claiming a change that did not happen would be noise to every
        // diff-based subscriber (C72 §3.1).
        expect(slabStore.getById('sb-prsv')!.polygon).toBe(polyBefore);
        expect(updates).toEqual([]);

        unsubscribe();
        tracker.dispose();
    });

    it('`undetermined` — an unresolvable loop never overwrites the record (C79 §5.2.1)', () => {
        const slabStore = new SlabStore();
        const tracker = new SlabDependencyTracker(slabStore, asTrackerWallStore(walls), { current: undefined });
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;

        // Strip the north edge's authoring-time fallback so that, once the wall
        // vanishes, resolveOrFallback has NOTHING to absorb the failure into and
        // resolveLoop honestly returns null (the un-absorbed undetermined case —
        // the absorbed one is §3's standing §5.2.1 finding, at the resolver).
        const northEdge = hostEdgesOf(traced.sketch).find((e) => e.hostId === 'w-north')!;
        delete northEdge.fallback;

        slabStore.add(regionSlab('sb-und', traced.sketch, traced.ring));
        tracker.bootstrap();

        walls.vanish('w-north');          // gone WITHOUT a remove event — no §4 degradation
        walls.move('w-south', 0, -1);     // a real move of a wall the slab references

        const stored = slabStore.getById('sb-und')!;
        // The record keeps the last successfully derived ring — 24 m², NOT a
        // partial ring, NOT an empty one, and NOT a fiction built from three
        // resolvable walls. No answer beats a wrong answer (C79 §2.3).
        expect(area(stored.polygon as { x: number; y: number }[])).toBeCloseTo(24, 6);
        expect(productionResolve(stored.sketch!.outerLoop)).toBeNull();

        tracker.dispose();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §5 — FLOOR FINISH & CEILING (C79 §10.3 — derived from the ROOM)
// ════════════════════════════════════════════════════════════════════════════

describe('§5 — FINISHES: the references are CORRECT and read by NOTHING', () => {
    /** The ring `CreateFloorCommand` / `CreateCeilingCommand` store, in `{x,z}`. */
    const ring = [
        { x: 0.1, z: 0.1 },
        { x: 5.9, z: 0.1 },
        { x: 5.9, z: 3.9 },
        { x: 0.1, z: 3.9 },
    ];

    function finishSketch() {
        // The PRODUCTION producer — C79 §6.3 rows 6-10 all route through this call.
        return buildRoomFinishBoundarySketch(ring, 'room-1', {
            getRoomById: () => ({
                boundingWallIds: ['w-south', 'w-east', 'w-north', 'w-west'],
            }),
            getWallById: (id) => {
                const w = walls.getById(id);
                return w
                    ? { id: w.id, baseLine: w.baseLine.map((p) => ({ x: p.x, z: p.z })), thickness: w.thickness }
                    : undefined;
            },
        });
    }

    it('creation-time attribution is real: 4 host edges, 4 bounding walls', () => {
        const s = finishSketch();
        expect(s.attribution.hostEdges).toBe(4);
        expect(s.attribution.freeEdges).toBe(0);
        expect(s.boundingWallIds.sort()).toEqual(['w-east', 'w-north', 'w-south', 'w-west']);
    });

    it('MEASURED: the reference is resolvable after the move — but nothing resolves it', () => {
        const s = finishSketch();
        const northEdge = s.outerLoop.edges.find(
            (e): e is FinishHostReferenceEdge => e.type === 'hostReference' && e.hostId === 'w-north',
        )!;
        expect(northEdge.reference).toBe('centerLine');
        expect(northEdge.offset).toBe(0);

        walls.move('w-north', 0, 2);

        // The wall IS at z=6 now, and the edge names it. Anything that wanted to
        // re-derive could. The stored boundary — the ONLY input FloorPanelBuilder:122
        // and CeilingPanelBuilder:220 read — is untouched.
        expect(walls.getById('w-north')!.baseLine[0]!.z).toBe(6);
        expect(areaXZ(ring)).toBeCloseTo(22.04, 6); // 5.8 m × 3.8 m — unchanged

        // The edge still carries its AUTHORING-time fallback, i.e. the old line.
        expect(northEdge.fallback.start.z).toBeCloseTo(3.9, 6);

        console.log(
            `[GR-12 §5 FINISHES] w-north moved to z=6. The floor/ceiling sketch names ` +
            `it (hostId=w-north, centerLine@0) and could re-derive. boundary.polygon — ` +
            `the ONLY geometry input of FloorPanelBuilder:122 / CeilingPanelBuilder:220 ` +
            `— is still ${areaXZ(ring).toFixed(3)} m². The finish does NOT follow.`,
        );
    });

    it('STRUCTURAL: the finish edge uses `{x,z}` — the only resolver in the tree returns `{x,y}`', () => {
        const s = finishSketch();
        const e = s.outerLoop.edges.find(
            (x): x is FinishHostReferenceEdge => x.type === 'hostReference',
        )!;
        // FloorHostReferenceEdge / CeilingHostReferenceEdge fallbacks are `{x,z}`
        // (FloorTypes.ts:205-212). WallFaceResolver returns Segment2D `{x,y}`
        // (WallFaceResolver.ts:4-7). There is no adapter between them anywhere.
        expect(Object.keys(e.fallback.start).sort()).toEqual(['x', 'z']);
        const slabTraced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        const slabEdge = hostEdgesOf(slabTraced.sketch)[0]!;
        expect(Object.keys(slabEdge.fallback!.start).sort()).toEqual(['x', 'y']);

        console.log(
            `[GR-12 §5 STRUCTURAL] finish edges are {x,z}; WallFaceResolver speaks {x,y}. ` +
            `Even if a finish tracker existed it could not call the one resolver in the ` +
            `tree without a coordinate adapter that does not exist.`,
        );
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §6 — POST-LOAD RE-PROJECTION (closes C79 §10.1's named residual UNPROVEN)
// ════════════════════════════════════════════════════════════════════════════
//
// C79 §10.1 answered "does the region relationship SURVIVE persistence?" — it does
// (`regionSketchPersistenceRoundTrip.test.ts`, 16 tests) — and then recorded a
// residual, verbatim: *"post-load re-projection — whether the reloaded slab actually
// FOLLOWS when its wall moves — is SlabDependencyTracker's axis and remains
// unmeasured."* This is that measurement.

describe('§6 — the RELOADED slab: does it follow?', () => {
    it('the reloaded sketch re-projects correctly — AND is now registered, exactly as a fresh slab is', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        const authored = regionSlab('sb-reload', traced.sketch, traced.ring);

        // serialise → JSON → schema-validate. `ProjectSerializer.serializeSlab:432`
        // forwards `sketch` through `deepStrip` (pinned by the §10.1 suite), and
        // `validateSlabData` is the exact Zod gate `SlabStore.add:201` applies.
        const reloaded = JSON.parse(JSON.stringify(authored)) as SlabData;
        expect(() => validateSlabData(reloaded)).not.toThrow();
        expect(hostEdgesOf(reloaded.sketch as SlabSketch)).toHaveLength(4);

        const slabStore = new SlabStore();
        const rebuilds: string[] = [];
        const realTrigger = slabStore.triggerRebuild.bind(slabStore);
        slabStore.triggerRebuild = (id: string): void => { rebuilds.push(id); realTrigger(id); };
        const tracker = new SlabDependencyTracker(slabStore, asTrackerWallStore(walls), { current: undefined });
        slabStore.add(reloaded);

        walls.move('w-north', 0, 2);

        // The RELATIONSHIP survived the round trip and re-projects perfectly…
        const drawn = area(productionResolve((slabStore.getById('sb-reload')!.sketch as SlabSketch).outerLoop));
        expect(drawn).toBeCloseTo(36, 6);
        // …and the LIVE path is now reachable after a load, exactly as it is for a
        // freshly-created slab. ⚠ INVERTED 2026-08-13 by §FIX-SLAB-TRACKER-EVENT-SHAPE:
        // this asserted `[]` to pin that a RELOADED slab was as unreachable as a new
        // one. That was the sharper half of the defect — a project could be saved
        // with correct references and reopened with a dependency graph that never
        // learned about them. Both halves are fixed by the same wire.
        expect(rebuilds).toContain('sb-reload');

        console.log(
            `[GR-12 §6 POST-LOAD] the reloaded sketch re-projects to ${drawn.toFixed(3)} m² ` +
            `when resolved — but the tracker still requested ${rebuilds.length} rebuild(s). ` +
            `C79 §10.1's residual is now MEASURED: persistence is not the failure; the ` +
            `registration path is, identically before and after a load. A project loaded ` +
            `AFTER initTools.ts:828 has run gets no bootstrap of its own.`,
        );
        tracker.dispose();
    });
});
