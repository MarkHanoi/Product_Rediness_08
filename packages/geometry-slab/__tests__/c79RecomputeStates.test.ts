/**
 * §C79-5.2-SLAB-STATES — the five recomputation states, EXECUTED.
 *
 * ─── WHAT THIS FILE IS THE INVERSION OF ──────────────────────────────────────
 * `c79MovePropagation.test.ts` §3 measured the ABSENCE, and
 * `check-move-propagation` declared it as two of its three findings. Verbatim,
 * from a run on 2026-08-14 BEFORE any line of this change:
 *
 *   ❌ all families · C79 §5.2.1 — `preserved` and `undetermined` are
 *      distinguishable at the caller: "a zero-move re-derivation and a
 *      re-derivation whose host cannot be resolved both return the SAME
 *      24.000 m² ring, byte-identical: true."
 *   ❌ all families · C79 §5.2 — a re-derivation reports exactly one of the five
 *      states: "the whole move path returns no state."
 *
 * Every assertion below fails against that HEAD. That is the point: an arm never
 * watched failing is UNPROVEN (C74 §6.2), and these were watched failing as a
 * declared gate finding for a day before they were watched passing.
 *
 * ─── THE NEGATIVE CONTROLS (C74 §3.4) ────────────────────────────────────────
 * A verdict channel that answered `undetermined` for everything would satisfy
 * §5.2.1 while being worthless, so:
 *   N1 · the SAME fixture over a LIVE re-derivation must report `resized` with
 *        both numbers — the channel discriminates rather than always refusing.
 *   N2 · `preserved` and `undetermined` must produce the SAME ring (asserted, not
 *        assumed) and DIFFERENT verdicts. If the rings ever stopped matching, the
 *        §5.2.1 claim would be trivially true for the wrong reason.
 *   N3 · "the store is unreachable" and "the wall is gone" must print DIFFERENT
 *        reasons. One collapsed reason channel is the defect wearing a fix's
 *        uniform.
 *
 * REAL, never re-implemented here: `traceRegionSketchAtPoint` (the only
 * host-reference-producing entry point — this file writes no `hostReference`
 * literal), `WallFaceResolver`, `SlabFragmentBuilder.resolveLoopVerdict`,
 * `SlabStore`, `SlabDependencyTracker`. The wall store is a probe double for the
 * same reason it is in `c79MovePropagation.test.ts`: it is the SUBJECT of the
 * move, never the source of the answer.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { traceRegionSketchAtPoint, type RegionWallLike } from '../src/SlabRegionTracer';
import { WallFaceResolver } from '../src/WallFaceResolver';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';
import { SlabStore } from '../src/SlabStore';
import { SlabDependencyTracker } from '../src/SlabDependencyTracker';
import {
    classifySlabRecompute,
    worstSlabRecomputeState,
    signedAreaXY,
    SLAB_RECOMPUTE_STATE_ORDER,
    type SlabRecomputeState,
    type SlabLoopResolution,
} from '../src/slabRecomputeVerdict';
import type { SlabData } from '../src/SlabTypes';
import type { SketchLoop, SlabSketch } from '../src/SketchTypes';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../..');

// ─── the probe's wall store (two surfaces: subscribe + getById) ─────────────

type ProbeWall = { id: string; baseLine: { x: number; y: number; z: number }[]; thickness: number };
type WallEvent = 'add' | 'update' | 'remove';

class ProbeWallStore {
    private walls = new Map<string, ProbeWall>();
    private listeners: ((e: WallEvent, w: ProbeWall) => void)[] = [];
    seed(w: ProbeWall): void { this.walls.set(w.id, w); }
    getById(id: string): ProbeWall | undefined { return this.walls.get(id); }
    getAll(): ProbeWall[] { return [...this.walls.values()]; }
    subscribe(cb: (e: WallEvent, w: ProbeWall) => void): () => void {
        this.listeners.push(cb);
        return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
    }
    /** THE ACT: translate a centreline, then emit the real 'update' event. */
    move(id: string, dx: number, dz: number): void {
        this.moveSilently(id, dx, dz);
        const w = this.walls.get(id)!;
        for (const l of this.listeners) l('update', w);
    }
    /**
     * The same translation with NO event, so a test can drive the re-derivation
     * EXACTLY ONCE through `recomputeForWall` and read the verdict it produced.
     *
     * Needed because the re-derivation is IDEMPOTENT (C79 §5.1): the live
     * subscription re-derives and persists on the event, so a second pass over
     * the same walls correctly reports `preserved`. §3's last test asserts that
     * property directly rather than letting it silently swallow a verdict.
     */
    moveSilently(id: string, dx: number, dz: number): void {
        const w = this.walls.get(id);
        if (!w) throw new Error(`probe wall "${id}" not seeded`);
        w.baseLine = w.baseLine.map((p) => ({ x: p.x + dx, y: p.y, z: p.z + dz }));
    }
    /** Vanish WITHOUT a remove event — no §4 degradation runs, so the resolver
     *  falls back silently. This is C79 §5.2's `undetermined`, staged exactly as
     *  check-move-propagation A3 stages it. */
    vanish(id: string): void { this.walls.delete(id); }
    asRegionWalls(): RegionWallLike[] {
        return this.getAll().map((w) => ({ id: w.id, baseLine: w.baseLine.map((p) => ({ x: p.x, z: p.z })) }));
    }
}

type TrackerWallStore = ConstructorParameters<typeof SlabDependencyTracker>[1];
const asTrackerWallStore = (s: ProbeWallStore): TrackerWallStore => s as unknown as TrackerWallStore;

/** A 6 m × 4 m room of four straight walls — C79 §10.3's reference fixture. */
function seedRoom(store: ProbeWallStore): void {
    const w = (id: string, x0: number, z0: number, x1: number, z1: number): ProbeWall => ({
        id, thickness: 0.2,
        baseLine: [{ x: x0, y: 0, z: z0 }, { x: x1, y: 0, z: z1 }],
    });
    store.seed(w('w-south', 0, 0, 6, 0));
    store.seed(w('w-east', 6, 0, 6, 4));
    store.seed(w('w-north', 6, 4, 0, 4));
    store.seed(w('w-west', 0, 4, 0, 0));
}

const regionSlab = (id: string, sketch: SlabSketch, ring: { x: number; y: number }[]): SlabData => ({
    id, type: 'slab', levelId: 'L0', thickness: 0.2,
    position: { x: 0, y: 0, z: 0 },
    polygon: ring, sketch,
    ifcData: { guid: `guid-${id}`, ifcClass: 'IfcSlab' },
} as unknown as SlabData);

const area = (poly: ReadonlyArray<{ x: number; y: number }> | null): number =>
    poly && poly.length >= 3 ? Math.abs(signedAreaXY(poly)) : 0;

/** The production resolution, verbatim — never re-composed here. */
const productionVerdict = (loop: SketchLoop): SlabLoopResolution =>
    SlabFragmentBuilder.resolveLoopVerdict(loop);

let walls: ProbeWallStore;

beforeEach(() => {
    walls = new ProbeWallStore();
    seedRoom(walls);
    Object.assign(window, { wallStore: walls });
});
afterEach(() => { Object.assign(window, { wallStore: undefined }); });

// ════════════════════════════════════════════════════════════════════════════
// §1 — the vocabulary is C79's and C78's, NOT a new one
// ════════════════════════════════════════════════════════════════════════════

describe('§1 — vocabulary: narrowed from the contracts, never minted', () => {
    it('the five states are exactly C79 §5.2\'s, in §5.3\'s worst-of ordering', () => {
        expect([...SLAB_RECOMPUTE_STATE_ORDER]).toEqual([
            'preserved', 'resized', 'regenerated', 'conflicted', 'undetermined',
        ]);
        // §5.3 — the element is the WORST of its edges, and `undetermined` wins.
        expect(worstSlabRecomputeState(['preserved', 'resized'])).toBe('resized');
        expect(worstSlabRecomputeState(['resized', 'undetermined'])).toBe('undetermined');
        expect(worstSlabRecomputeState(['conflicted', 'regenerated'])).toBe('conflicted');
        expect(worstSlabRecomputeState([])).toBe('preserved');
    });

    it('the state union has NOT drifted from @pryzm/finish-host-tracker\'s ReprojectState', () => {
        // The two packages are siblings and neither imports the other, so the
        // guarantee that matters is that they cannot silently diverge.
        const src = readFileSync(
            resolve(REPO, 'packages/finish-host-tracker/src/reprojectFinishBoundary.ts'), 'utf8');
        const block = /export type ReprojectState =([\s\S]*?);/.exec(src);
        expect(block, 'ReprojectState not found — the finish path was renamed').not.toBeNull();
        const finishMembers = [...block![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!).sort();
        expect(finishMembers).toEqual([...SLAB_RECOMPUTE_STATE_ORDER].sort());
    });

    it('every undetermined reason is a member of command-bus\'s CLOSED C78 §8.1 union', () => {
        const src = readFileSync(resolve(REPO, 'packages/command-bus/src/consequence.ts'), 'utf8');
        for (const member of ['STALE_DERIVED_STATE', 'RELATIONSHIP_NOT_RECORDED', 'ENGINE_NOT_AVAILABLE']) {
            expect(src, `${member} must exist in C78 §8.1, not be minted here`).toContain(`'${member}'`);
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §2 — C79 §5.2.1: `preserved` and `undetermined` are the same PIXELS
//      and now DIFFERENT VALUES
// ════════════════════════════════════════════════════════════════════════════

describe('§2 — §5.2.1: the forbidden collapse is CLOSED', () => {
    it('N2 · the two rings are byte-identical AND the two verdicts differ', () => {
        // PRESERVED — a wall this slab references moves by zero.
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        walls.move('w-north', 0, 0);
        const preservedRes = productionVerdict(traced.sketch.outerLoop);

        // UNDETERMINED — the host wall is no longer resolvable at all, so the
        // resolver returns the STALE authoring-time fallback (§4.3 keeps it).
        const walls2 = new ProbeWallStore();
        seedRoom(walls2);
        Object.assign(window, { wallStore: walls2 });
        const traced2 = traceRegionSketchAtPoint(walls2.asRegionWalls(), 3, 2)!;
        walls2.vanish('w-north');
        const undeterminedRes = productionVerdict(traced2.sketch.outerLoop);

        // The CONTROL: the pixels really are identical. If this ever stopped
        // being true the §5.2.1 claim below would be true for the wrong reason.
        expect(JSON.stringify(undeterminedRes.ring)).toBe(JSON.stringify(preservedRes.ring));
        expect(area(preservedRes.ring)).toBeCloseTo(24, 6);

        // …and the FACTS are now opposite values.
        const a = classifySlabRecompute({ slabId: 's1', previousRing: traced.ring, resolution: preservedRes });
        const b = classifySlabRecompute({ slabId: 's1', previousRing: traced2.ring, resolution: undeterminedRes });
        expect(a.state).toBe('preserved');
        expect(b.state).toBe('undetermined');
        expect(b.reason).toBe('STALE_DERIVED_STATE');
        expect(b.subReason).toContain('w-north');

        console.log(
            `[§C79-5.2 §5.2.1 CLOSED] same ${area(preservedRes.ring).toFixed(3)} m² ring, ` +
            `byte-identical: ${JSON.stringify(preservedRes.ring) === JSON.stringify(undeterminedRes.ring)} — ` +
            `verdicts "${a.state}" vs "${b.state}" (${b.reason}).`,
        );
    });

    it('N3 · "the store is unreachable" and "the wall is gone" are DIFFERENT reasons', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        const northEdge = traced.sketch.outerLoop.edges.find(
            (e) => e.type === 'hostReference' && e.hostId === 'w-north')!;

        // (a) the store is there and the wall is gone
        walls.vanish('w-north');
        const gone = WallFaceResolver.resolveWithProvenance(northEdge as never);
        // (b) the store itself is not reachable in this runtime
        Object.assign(window, { wallStore: undefined });
        const noEngine = WallFaceResolver.resolveWithProvenance(northEdge as never);

        expect(gone.source).toBe('fallback');
        expect(noEngine.source).toBe('fallback');
        expect(gone.reason).toBe('STALE_DERIVED_STATE');
        expect(noEngine.reason).toBe('ENGINE_NOT_AVAILABLE');
        expect(gone.reason).not.toBe(noEngine.reason);
        // The fallback is NEVER removed (C79 §4.3) — both still hand back geometry.
        expect(gone.segment).not.toBeNull();
        expect(noEngine.segment).not.toBeNull();
    });

    it('resolveOrFallback is a PROJECTION of the provenance call — one implementation', () => {
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        for (const edge of traced.sketch.outerLoop.edges) {
            if (edge.type !== 'hostReference') continue;
            expect(WallFaceResolver.resolveOrFallback(edge))
                .toEqual(WallFaceResolver.resolveWithProvenance(edge).segment);
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §3 — C79 §5.2: FOUR of the five, driven through the real move path
// ════════════════════════════════════════════════════════════════════════════

describe('§3 — a re-derivation reports EXACTLY ONE of the five states', () => {
    const drive = (act: (w: ProbeWallStore) => void) => {
        const slabStore = new SlabStore();
        const tracker = new SlabDependencyTracker(slabStore, asTrackerWallStore(walls), { current: undefined });
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        slabStore.add(regionSlab('sb', traced.sketch, traced.ring));
        tracker.bootstrap();
        act(walls);
        const verdicts = tracker.recomputeForWall('w-north');
        const stored = slabStore.getById('sb')!;
        tracker.dispose();
        return { verdicts, stored, traced };
    };

    it('preserved — a ZERO move: re-derived, and nothing changed', () => {
        const { verdicts, stored } = drive((w) => w.moveSilently('w-north', 0, 0));
        expect(verdicts).toHaveLength(1);
        expect(verdicts[0]!.state).toBe('preserved');
        expect(verdicts[0]!.numbers!.oldAreaM2).toBeCloseTo(24, 6);
        expect(verdicts[0]!.numbers!.newAreaM2).toBeCloseTo(24, 6);
        expect(area(stored.polygon!)).toBeCloseTo(24, 6);   // no write, no fiction
    });

    it('N1 · resized — a 2 m move: the channel DISCRIMINATES, with both numbers', () => {
        const { verdicts, stored } = drive((w) => w.moveSilently('w-north', 0, 2));
        expect(verdicts[0]!.state).toBe('resized');
        expect(verdicts[0]!.numbers!.oldAreaM2).toBeCloseTo(24, 6);
        expect(verdicts[0]!.numbers!.newAreaM2).toBeCloseTo(36, 6);
        // The RECORD followed too (the A2 property this must not regress).
        expect(area(stored.polygon!)).toBeCloseTo(36, 6);
        console.log(
            `[§C79-5.2 resized] ${verdicts[0]!.subReason}`,
        );
    });

    it('the LIVE wall-store subscription runs the SAME re-derivation (idempotent, §5.1)', () => {
        // `move()` emits the real 'update' event, so the subscription re-derives and
        // persists. A second pass over the same walls must therefore report
        // `preserved` — which is C79 §5.1's determinism ("re-derivation MUST NOT
        // depend on how many times the element has already been re-derived") and is
        // the proof that the verdict `recomputeForWall` returns is the live path's,
        // not a second inference under different rules.
        const { verdicts, stored } = drive((w) => w.move('w-north', 0, 2));
        expect(area(stored.polygon!)).toBeCloseTo(36, 6);     // the LIVE path wrote it
        expect(verdicts[0]!.state).toBe('preserved');         // the second pass adds nothing
        expect(verdicts[0]!.numbers!.newAreaM2).toBeCloseTo(36, 6);
    });

    it('conflicted — an INVERTING move refuses with BOTH numbers, and record ≡ mesh', () => {
        // Drive w-north THROUGH w-south: the region the user enclosed is gone and
        // the re-derived ring sits on the far side with its winding reversed. This
        // is the measured slab failure (signed area 24.000 → -24.000, no refusal).
        const { verdicts, stored } = drive((w) => w.moveSilently('w-north', 0, -8));
        const v = verdicts[0]!;
        expect(v.state).toBe('conflicted');
        expect(v.numbers!.oldAreaM2).toBeCloseTo(24, 6);
        expect(v.numbers!.newAreaM2).toBeGreaterThan(0);
        expect(v.subReason).toMatch(/INVERTED its winding/);
        expect(v.subReason).toContain('m²');                       // BOTH numbers, named
        // §5.2.2 forbids SUBSTITUTING a value that is not the derived one. The
        // derived ring is exactly what is stored, so record still equals mesh.
        const drawn = SlabFragmentBuilder.resolveLoop(stored.sketch!.outerLoop)!;
        expect(area(stored.polygon!)).toBeCloseTo(area(drawn), 6);
        console.log(`[§C79-5.2 conflicted] ${v.subReason}`);
    });

    it('undetermined — a vanished host: no write, and NOT "preserved"', () => {
        const { verdicts, stored } = drive((w) => {
            // A real listener needs a real event, so move a DIFFERENT bounding wall
            // by zero after removing the north wall from the store's view.
            w.vanish('w-north');
        });
        const v = verdicts[0]!;
        expect(v.state).toBe('undetermined');
        expect(v.reason).toBe('STALE_DERIVED_STATE');
        expect(v.numbers).toBeUndefined();                          // nothing to compare
        // The record keeps its last SUCCESSFULLY derived ring — a memory is never
        // laundered into the record as if it had been re-derived.
        expect(area(stored.polygon!)).toBeCloseTo(24, 6);
        console.log(`[§C79-5.2 undetermined] ${v.reason}: ${v.subReason}`);
    });

    it('the verdict is EXACTLY ONE state, every time, and it is a member of the five', () => {
        for (const act of [
            (w: ProbeWallStore) => w.moveSilently('w-north', 0, 0),
            (w: ProbeWallStore) => w.moveSilently('w-north', 0, 2),
            (w: ProbeWallStore) => w.moveSilently('w-north', 0, -8),
            (w: ProbeWallStore) => w.vanish('w-north'),
        ]) {
            walls = new ProbeWallStore(); seedRoom(walls);
            Object.assign(window, { wallStore: walls });
            const { verdicts } = drive(act);
            expect(verdicts).toHaveLength(1);
            expect(SLAB_RECOMPUTE_STATE_ORDER).toContain(verdicts[0]!.state);
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════
// §4 — §5.3 worst-of-its-edges, and the ONE state a move cannot produce
// ════════════════════════════════════════════════════════════════════════════

describe('§4 — §5.3 and the named residual', () => {
    it('one unresolved edge decides the ELEMENT, however green the others are', () => {
        // A mixed boundary: three references and one free edge (an id-less wall).
        const mixed: RegionWallLike[] = [
            { id: 'w-south', baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] },
            { baseLine: [{ x: 6, z: 0 }, { x: 6, z: 4 }] },   // no id → free edge
            { id: 'w-north', baseLine: [{ x: 6, z: 4 }, { x: 0, z: 4 }] },
            { id: 'w-west', baseLine: [{ x: 0, z: 4 }, { x: 0, z: 0 }] },
        ];
        const m = new ProbeWallStore();
        seedRoom(m);
        Object.assign(window, { wallStore: m });
        const traced = traceRegionSketchAtPoint(mixed, 3, 2)!;

        m.vanish('w-north');                       // exactly ONE edge goes stale
        const res = productionVerdict(traced.sketch.outerLoop);
        const live = res.edgeOutcomes.filter((o) => o.state === 'preserved');
        const bad = res.edgeOutcomes.filter((o) => o.state === 'undetermined');
        expect(live.length).toBeGreaterThanOrEqual(2);   // most edges are fine…
        expect(bad).toHaveLength(1);                     // …and one is not
        expect(res.fullyLive).toBe(false);

        const v = classifySlabRecompute({ slabId: 's', previousRing: traced.ring, resolution: res });
        expect(v.state).toBe('undetermined');            // NOT a false green
        expect(worstSlabRecomputeState(res.edgeOutcomes.map((o) => o.state))).toBe('undetermined');
    });

    it('regenerated is CLASSIFIED, and is NOT producible by a wall move today', () => {
        // Driven directly on the pure classifier, because the move path cannot
        // reach it: `SketchLoopIntersector.computePolygon` returns one vertex per
        // segment and a move changes neither the edge count nor the host set. The
        // reachable producer is a sketch EDIT (DegradeSlabSketchCommand changes
        // the host set — C79 §5.2's own words for `regenerated`), which does not
        // call this classifier yet. Named, not counted as shipped.
        const resolution: SlabLoopResolution = {
            ring: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 3, y: 5 }, { x: 0, y: 4 }],
            edgeOutcomes: [0, 1, 2, 3, 4].map((i) => ({ index: i, source: 'live' as const, state: 'preserved' as const })),
            fullyLive: true,
        };
        const v = classifySlabRecompute({
            slabId: 's',
            previousRing: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }],
            resolution,
        });
        expect(v.state).toBe('regenerated');
        expect(v.subReason).toContain('5 corner(s)');
        expect(v.subReason).toContain('4');
        expect(v.numbers!.oldAreaM2).toBeCloseTo(24, 6);

        // …and the move path really cannot get there: the re-derived ring always
        // has exactly as many corners as the sketch has edges.
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        walls.move('w-north', 0, 2);
        const moved = productionVerdict(traced.sketch.outerLoop);
        expect(moved.ring!.length).toBe(traced.sketch.outerLoop.edges.length);
    });

    it('a state that is not one of the five can never be produced', () => {
        const states = new Set<SlabRecomputeState>();
        const traced = traceRegionSketchAtPoint(walls.asRegionWalls(), 3, 2)!;
        for (const dz of [0, 2, -8]) {
            const w = new ProbeWallStore(); seedRoom(w);
            Object.assign(window, { wallStore: w });
            const t = traceRegionSketchAtPoint(w.asRegionWalls(), 3, 2)!;
            w.move('w-north', 0, dz);
            states.add(classifySlabRecompute({
                slabId: 's', previousRing: t.ring, resolution: productionVerdict(t.sketch.outerLoop),
            }).state);
        }
        for (const s of states) expect(SLAB_RECOMPUTE_STATE_ORDER).toContain(s);
        expect(states.size).toBe(3);        // preserved · resized · conflicted
        expect(traced).not.toBeNull();
    });
});
