/**
 * §FIX-SLAB-BATCH-CEB-SHAPE (P3-C1 · B1-SLAB-04) — the batch arm of the slab
 * relay, measured at the seam the defect lives on.
 *
 * ─── WHAT WAS MEASURED, AND WHY THE BRIEF'S VERSION OF IT WAS BACKWARDS ─────
 *
 * The P3 AXIS-C brief carried: *"the batch case already reads `polygon ??
 * boundary`; the single case reads `polygon` only."* At HEAD the truth is the
 * OTHER WAY ROUND. §FIX-SLAB-CEB-BOUNDARY closed the single case (it reads the
 * COMMIT through `planPolygonFromCommittedBoundary`) and left the batch case as
 * the surviving half of the asymmetry, holding TWO defects:
 *
 *   1. `if (!s.id ...) continue;` — `CreateSlabBatchHandler` MINTS an id when the
 *      payload omits one (`CreateSlabBatch.ts:101`, s.id ?? createId). Every such
 *      slab COMMITTED and emitted NOTHING: no mesh, no plan symbol, no snapshot
 *      row, and no console line saying so.
 *   2. `const _slabPolygon = s.polygon ?? s.boundary;` — `boundary` is a WORLD
 *      Vec3, and a plan ring's second coordinate is world **z**. Relayed raw, the
 *      plan `y` becomes the LEVEL ELEVATION, so the ring collapses to zero area.
 *      The §FIX-SLAB-ZERO-AREA convention (world Z in both `y` and `z`) is why
 *      this was invisible to the plan tool and fatal to every other producer.
 *
 * ─── STUB LEDGER ───────────────────────────────────────────────────────────
 *
 * Nothing on the measured path is stubbed. The patches are produced by the REAL
 * `CreateSlabBatchHandler` — so the ids are the ones the handler really mints and
 * the records are the ones it really commits — and they are relayed by the REAL
 * `wireCommandEventBridge`. The only doubles are the two one-line seams the
 * bridge is wired to (a `subscribe` that hands back the listener, an `emit` that
 * records), which is the harness `CommittedPatchReachesTheStore.test.ts` already
 * uses for the same reason: a bridge body no test can reach is a bridge body no
 * test can measure.
 *
 * WHAT THIS DOES NOT CLAIM: that the slab reaches the authoritative `SlabStore`.
 * It does not, in a composed-only process — that write is performed by the L7
 * §FT1 subscriber in `initTools.ts`, which is P3-C1's REMAINING half and is not
 * this lane's file. `composedBusElementReadback.test.ts` A-4 continues to pin the
 * readback as NEGATIVE with its reason attached. This file measures the hop that
 * FEEDS §FT1, which is where both defects above live.
 */

import { describe, it, expect, vi } from 'vitest';
import { createId } from '@pryzm/schemas';
import { CreateSlabBatchHandler } from '@pryzm/plugin-slab/handlers';

const LEVEL = 'L0';

/** A world Vec3 ring, 4 m x 4 m in plan, sitting at a NON-ZERO elevation.
 *  The elevation is what a raw relay puts in the plan `y`, so it must differ
 *  from every `z` for the two readings to be distinguishable at all. */
const ELEVATION = 3;
const VEC3_RING = [
    { x: 0, y: ELEVATION, z: 0 },
    { x: 4, y: ELEVATION, z: 0 },
    { x: 4, y: ELEVATION, z: 4 },
    { x: 0, y: ELEVATION, z: 4 },
];

/** Shoelace area of a plan ring. Zero means degenerate, which means no plate. */
function planArea(ring: ReadonlyArray<{ x: number; y: number }>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
}

/** Run the REAL batch handler and hand back its committed forward patches. */
function commit(payload: unknown): ReadonlyArray<{ op: string; path: (string | number)[]; value?: unknown }> {
    const handler = new CreateSlabBatchHandler();
    const ctx = { stores: { slab: {} } } as never;
    const res = handler.execute(ctx, payload as never);
    return res.forward as never;
}

/** Drive the REAL CommandEventBridge over one record; return every event, in order. */
async function relay(
    type: string,
    payload: Record<string, unknown>,
    forward: ReadonlyArray<{ op: string; path: (string | number)[]; value?: unknown }> = [],
): Promise<Array<{ name: string; payload: Record<string, unknown> }>> {
    const { wireCommandEventBridge } = await import(
        '../../../packages/runtime-composer/src/CommandEventBridge'
    );
    const out: Array<{ name: string; payload: Record<string, unknown> }> = [];
    let emit!: (bytes: unknown, record: unknown) => void;
    const patches = {
        subscribe: (cb: (b: unknown, r: unknown) => void) => { emit = cb; return () => {}; },
    };
    const events = {
        emit: (name: string, p: unknown) => { out.push({ name, payload: p as Record<string, unknown> }); },
    };
    wireCommandEventBridge(patches as never, events as never);
    emit(new Uint8Array(), {
        id: 'evt-' + type, type, payload,
        affectedStores: ['slab'], audit: { actorId: 'probe' }, forward,
    });
    return out;
}

const created = (evs: Array<{ name: string; payload: Record<string, unknown> }>) =>
    evs.filter((e) => e.name === 'slab.created').map((e) => e.payload);

// =============================================================================
describe('§FIX-SLAB-BATCH-CEB-SHAPE — DEFECT 1: the id the HANDLER mints', () => {
    it('ARM 1 — a batch that names NO ids still emits one slab.created per COMMITTED slab, under the minted ids', async () => {
        const payload = {
            levelId: LEVEL,
            slabs: [{ boundary: VEC3_RING }, { boundary: VEC3_RING }],
        };
        const forward = commit(payload);
        // A control on the control: the handler really did mint two ids, so a zero
        // below is the bridge's doing and not an empty commit.
        const mintedIds = forward.filter((p) => p.op === 'add' && p.path.length === 1)
            .map((p) => String(p.path[0]));
        expect(mintedIds, 'the handler must commit two slabs for this arm to mean anything').toHaveLength(2);
        expect(mintedIds[0]).not.toBe(mintedIds[1]);

        const evs = created(await relay('slab.batch.create', payload, forward));
        expect(
            evs.length,
            'N slabs committed, ZERO slab.created — no mesh, no plan symbol, no snapshot row, and no console line',
        ).toBe(2);
        expect(evs.map((e) => e['id']).sort()).toEqual([...mintedIds].sort());
    });

    it('ARM 2 — and it carries the values the HANDLER resolved, not the ones the caller omitted', async () => {
        // `thickness` is omitted; CreateSlabBatch defaults it to 0.2 and commits
        // that. Reading the request instead of the commit emits undefined.
        const payload = { levelId: LEVEL, slabs: [{ boundary: VEC3_RING }] };
        const forward = commit(payload);
        const [ev] = created(await relay('slab.batch.create', payload, forward));
        expect(ev).toBeDefined();
        expect(ev!['thickness'], 'the committed default must reach the mirror').toBe(0.2);
        expect(ev!['thickness']).not.toBeUndefined();
        expect(ev!['levelId']).toBe(LEVEL);
    });
});

// =============================================================================
describe('§FIX-SLAB-BATCH-CEB-SHAPE — DEFECT 2: the world Vec3 relayed as a plan ring', () => {
    it('ARM 3 — the plan polygon takes its second coordinate from world Z, so the ring has AREA', async () => {
        // An EXPLICIT id, so this arm cannot pass or fail on defect 1: the old code
        // emitted for this payload. What it emitted was the wrong ring.
        const FIXED_ID = createId('slab');
        const payload = { levelId: LEVEL, slabs: [{ id: FIXED_ID, boundary: VEC3_RING }] };
        const forward = commit(payload);
        const [ev] = created(await relay('slab.batch.create', payload, forward));
        expect(ev, 'an id-carrying batch member must still emit').toBeDefined();
        const ring = ev!['polygon'] as ReadonlyArray<{ x: number; y: number }>;
        expect(ring).toHaveLength(4);
        // Positive and negative on the same quantity — the defect spelled both ways.
        expect(planArea(ring), 'a zero-area plan ring is the degenerate sliver, not a floor plate').toBe(16);
        expect(planArea(ring)).not.toBe(0);
        // And the failure MECHANISM, named: no vertex may carry the elevation.
        expect(ring.map((q) => q.y)).toEqual([0, 0, 4, 4]);
        expect(ring.every((q) => q.y === ELEVATION)).toBe(false);
    });

    it('ARM 4 CONTROL — a caller that already sent the PLAN alias gets it back byte-identical (no double conversion)', async () => {
        const PLAN_RING = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
        const payload = { levelId: LEVEL, slabs: [{ id: 'slab-plan-1', polygon: PLAN_RING }] };
        // No commit at all: the plan alias must win from the payload alone, exactly
        // as the single case's ladder puts the payload polygon first.
        const [ev] = created(await relay('slab.batch.create', payload, []));
        expect(ev).toBeDefined();
        expect(ev!['polygon']).toEqual(PLAN_RING);
        expect(planArea(ev!['polygon'] as never)).toBe(16);
    });
});

// =============================================================================
describe('§FIX-SLAB-BATCH-CEB-SHAPE — the refusal', () => {
    it('ARM 5 — a member with neither a usable id nor a usable outline emits NOTHING and says so by name', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const evs = created(await relay('slab.batch.create', { levelId: LEVEL, slabs: [{}] }, []));
            expect(evs).toHaveLength(0);
            const said = spy.mock.calls.map((c) => String(c[0])).join('\n');
            // A bare `continue` is what made defect 1 invisible for as long as it was.
            expect(said).toMatch(/FIX-SLAB-BATCH-CEB-SHAPE/);
            expect(said).toMatch(/REFUSED 1 of 1/);
            expect(said).toMatch(/no mesh, plan symbol or snapshot row/);
        } finally {
            spy.mockRestore();
        }
    });
});
