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
    it('MEASURED: a slab created AFTER the tracker is wired NEVER re-projects — 0 rebuilds', () => {
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

        expect(rebuilds).toEqual([]); // ← THE ANSWER. Nothing was asked to re-project.

        // And the mesh polygon the builder would draw is unchanged, because nothing
        // asked it to redraw. The reference is CORRECT and UNREACHED.
        const stored = slabStore.getById('sb-live')!;
        expect(area(stored.polygon as { x: number; y: number }[])).toBeCloseTo(24, 6);

        console.log(
            `[GR-12 §2 SLAB/LIVE] wall moved 2 m; SlabDependencyTracker requested ` +
            `${rebuilds.length} rebuild(s). The slab does NOT follow.`,
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

describe('§3 — C79 §5.2/§5.5: the five states are NOT distinguishable', () => {
    it('the re-derivation returns NO state at all — every entry point is void or a bare polygon', () => {
        const slabStore = new SlabStore();
        const tracker = new SlabDependencyTracker(slabStore, asTrackerWallStore(walls), { current: undefined });
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        slabStore.add(regionSlab('sb-state', traced.sketch, traced.ring));
        tracker.bootstrap();

        // The whole propagation chain, and what each link can tell a caller:
        expect(slabStore.triggerRebuild('sb-state')).toBeUndefined();          // void
        const poly = productionResolve(traced.sketch.outerLoop);
        expect(Array.isArray(poly)).toBe(true);                                 // a ring, no state
        expect((poly as unknown as Record<string, unknown>).state).toBeUndefined();

        console.log(
            `[GR-12 §3 STATES] triggerRebuild → void · resolveLoop → ring | null. ` +
            `No value anywhere on the move path names preserved | resized | ` +
            `regenerated | conflicted | undetermined. C79 §5.5 is CONFIRMED, not refuted.`,
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

        // And the resolver itself does not report which branch it took.
        const northEdge = hostEdgesOf(traced2.sketch).find((e) => e.hostId === 'w-north')!;
        expect(WallFaceResolver.resolve(northEdge)).toBeNull();            // it KNOWS
        expect(WallFaceResolver.resolveOrFallback(northEdge)).not.toBeNull(); // …and does not say

        console.log(
            `[GR-12 §3 §5.2.1] preserved and undetermined both resolve to the same ` +
            `${area(preserved).toFixed(3)} m² ring. WallFaceResolver.resolve() returns ` +
            `null (it knows the host is gone) and resolveOrFallback() absorbs that into ` +
            `a stale segment with no reason attached — C79 §5.2.1's forbidden collapse, ` +
            `EXECUTED. This is C79 §0's defect exactly: "a slab that did not follow was ` +
            `indistinguishable from a slab that had nothing to follow".`,
        );
    });

    it('§5.2 `regenerated` / `conflicted` are not reported either — an INVERTING move returns a ring', () => {
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

        console.log(
            `[GR-12 §3 REGENERATED/CONFLICTED] a move that drives w-north through ` +
            `w-south re-derives a ring whose signed area goes ${before.toFixed(3)} → ` +
            `${after.toFixed(3)} m² — the winding INVERTED and the slab now covers ` +
            `ground the user never enclosed. The re-derivation refuses nothing, reports ` +
            `nothing, and hands back a plausible ring. SlabFragmentBuilder.` +
            `refuseNonSimpleRings exists but sits DOWNSTREAM of resolveLoop, catches ` +
            `only self-INTERSECTION (which four straight lines cannot produce), and ` +
            `only logs — it is not a §5.2 verdict any caller reads.`,
        );
    });

    it('§5.3 element-state-is-worst-of-its-edges has no implementation to exercise', () => {
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

        // Authoring-time counts exist (C79 §2.5). Nothing carries them to move time:
        // the sketch stored on SlabData has edges only — no per-edge state channel.
        for (const e of traced.sketch.outerLoop.edges) {
            expect((e as unknown as Record<string, unknown>).state).toBeUndefined();
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §4 — SLAB: even when it follows, WHAT follows? (mesh vs model)
// ════════════════════════════════════════════════════════════════════════════

describe('§4 — the mesh follows; the stored polygon does not', () => {
    it('after a re-projection the sketch resolves to 36 m² while `slab.polygon` still says 24 m²', () => {
        const slabStore = new SlabStore();
        const tracker = new SlabDependencyTracker(slabStore, asTrackerWallStore(walls), { current: undefined });
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        slabStore.add(regionSlab('sb-model', traced.sketch, traced.ring));
        tracker.bootstrap();

        walls.move('w-north', 0, 2);

        const stored = slabStore.getById('sb-model')!;
        const drawn = area(productionResolve(stored.sketch!.outerLoop));
        const recorded = area(stored.polygon as { x: number; y: number }[]);

        expect(drawn).toBeCloseTo(36, 6);
        expect(recorded).toBeCloseTo(24, 6);

        console.log(
            `[GR-12 §4 MESH-vs-MODEL] after the move the builder draws ${drawn.toFixed(3)} m² ` +
            `(createSlabMeshWithEdges:978 prefers data.sketch) but SlabData.polygon still ` +
            `records ${recorded.toFixed(3)} m². Every consumer that reads the POLYGON — ` +
            `root.userData.polygon (SlabFragmentBuilder:445), schedules, exports, area ` +
            `take-off — sees the pre-move shape. "Follows" is TRUE of the mesh and FALSE ` +
            `of the model.`,
        );
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
    it('the reloaded sketch re-projects correctly — and is registered by nothing, exactly as before', () => {
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
        // …and the LIVE path is just as unreachable after a load as before one.
        expect(rebuilds).toEqual([]);

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
