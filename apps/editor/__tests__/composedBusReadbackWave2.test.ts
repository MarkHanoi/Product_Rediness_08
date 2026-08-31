/**
 * @vitest-environment happy-dom
 */
// composedBusReadbackWave2 — §CFIX5-READBACK-WAVE-2.
//   C67 rule 12 · C70 A-INV-3 · C70 L-INV-1 · C84 EI-5 · C103 · C106 · ADR-0318 · ADR-0333.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS FILE RAISES, AND WHY IT IS NOT THE FILE NEXT DOOR.
// ═══════════════════════════════════════════════════════════════════════════════
//
// `audit/full-stack/2026-08-31/commands/_ROLLUPS.json` measured PROVEN READ-BACK at
// **22 of 361 verbs (6.1%)**, across 13 of 50 families — evidence class (c) only,
// meaning a vitest run somebody EXECUTED whose assertion reads a store back after a
// dispatch. 93.9% of the command surface had never been proven to write anything.
//
// This file adds TEN verbs to that numerator and records THREE measured negatives.
// Every arm dispatches on the runtime `composeRuntime()` PRODUCES — P1 (CLAUDE.md)
// makes that the only way production obtains a runtime — and reads back out of a
// slot THIS FILE DID NOT BUILD.
//
// ─── ⛔ WHY THE EXISTING BALCONY / LIFT / POOL SUITES DID NOT ALREADY COUNT ──────
//
// They are not weaker tests; they answer a different question. `balconyReachable-
// ThroughComposedRuntime.test.ts` reads `rt.stores.balcony` and is 13/13 green — but
// it boots `bootstrapWithEverything({ audit })` DIRECTLY, which is the DATA HALF, not
// the composition root. `rt.stores` there is the inner 29-key plugin record; the
// `StoresSlot` that `composeRuntime` actually ships is a FRESH OBJECT built from an
// explicit field list, and the whole of L-11060 / §PERSIST-BALCONY is the history of
// keys that were present on the first object and absent from the second. A test that
// reads the inner record cannot observe that gap — which is the same shape
// `composedBusElementReadback.test.ts` records for `hello-12-elements`, and the same
// shape `persistedFamiliesReachTheSerializerChannel.test.ts` records for
// `snapshotFamilyRoundTrip`. `liftUndoRoundTrip` and `PoolAndSlabUpdateReachThe-
// RenderStore` boot the data half and a HAND-BUILT `World` respectively, for the same
// reason and with the same limit.
//
// So the arms below are deliberately the COMPOSED-SLOT halves of claims that already
// hold one layer down. Where the audit already banked a verb at the data half
// (`balcony.create` was NOT banked; `pool.create` and `lift.create` WERE), this file
// still runs the seed — because a delete cannot be judged unless the seed landed, and
// `door.delete` is on record in `CreateDoor.ts` as having come back
// `seed-did-not-land` for exactly that reason.
//
// ─── STUB LEDGER (read before trusting any green below) ─────────────────────────
//
//  1. THE LEVEL AUTHORITY in the wall/slab arms. `new BimManager(scene)` cannot be
//     constructed headlessly (its `LevelVisualizer` label sprites need a canvas 2D
//     context happy-dom does not provide). The stand-in implements the two members
//     `WallStore` actually calls — `getLevelById` / `getLevels` — and nothing else.
//     It stands in for the LEVEL REGISTRY: not for the store, not for the bus, and
//     not for the write. This is the identical, identically-declared substitution
//     `composedBusElementReadback.test.ts` makes, and `slabStore.attachEngine(
//     projectContext)` takes the REAL `ProjectContext` singleton with no stub at all.
//  2. NOTHING ELSE ON THE MEASURED PATH IS STUBBED. The runtime is a real
//     `composeRuntime`; the bus is its real bus; every store read is a slot the
//     composed runtime itself exposes; every handler and patch pair is real.
//  3. NOT PROVEN HERE: that any of this reaches a PIXEL. Every arm stops at a store
//     record. None of them renders, and D-2 says so rather than implying otherwise.
//
// ─── ⛔ CO-OCCURRENCE IS NOT PROOF, SO EACH ARM ASSERTS THE CAUSAL LINK ──────────
//
// The audit EXCLUDED 12 verbs whose test merely calls `composeRuntime` AND reads a
// store in the same file. Every positive arm below therefore reads the slot BEFORE
// the dispatch and asserts it is empty of the subject, dispatches, and reads again —
// so the record is attributable to the dispatch and not to boot state. `D-0` is the
// executed falsification control for the whole file.

import { describe, expect, it, beforeAll } from 'vitest';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';

const AUDIT = { actorId: 'cfix5', projectId: 'cfix5', clientId: 'node' } as const;
const BUDGET = 600_000;
const LEVEL = 'L0';

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });

    // ── The engine half, attached exactly the way apps/editor/src/engine/initBuilders.ts
    //    attaches it. See STUB LEDGER 1 for the one declared substitution.
    const { projectContext } = await import('@pryzm/core-app-model/context');
    const { wallStore } = await import('@pryzm/geometry-wall/store');
    const { slabStore } = await import('@pryzm/geometry-slab/store');
    const LEVELS: Record<string, unknown> = {};
    for (const id of [LEVEL, 'level-1', 'level-2', 'level-3']) {
        LEVELS[id] = { id, name: id, elevation: 0, childrenIds: [] as string[] };
    }
    (wallStore as any).attachEngine(projectContext, {
        getLevelById: (id: string) => LEVELS[id],
        getLevels: () => Object.values(LEVELS),
        registerElement: () => { /* spatial registration is an L7 concern */ },
    });
    (slabStore as any).attachEngine(projectContext);
}, BUDGET);

/** The `getState()` map handle the composed runtime exposes for a plugin family. */
function rec(slot: unknown, id: string): any {
    const s = slot as { getState?: () => Map<string, unknown> } | undefined;
    if (s === undefined || typeof s.getState !== 'function') return undefined;
    return s.getState().get(id);
}

async function outcome(verb: string, payload: unknown): Promise<string> {
    try {
        await rt.bus.executeCommand(verb, payload);
        return 'OK';
    } catch (err) {
        return (err as Error).message ?? String(err);
    }
}

// ── Fixtures. Every id is a real branded ULID: `defineElement` enforces
//    /^<kind>_[0-9A-HJKMNP-TV-Z]{26}$/ (Crockford base32, I/L/O/U excluded), so a test
//    that had bypassed the bus to seed a store directly would never have met the rule.
const BL = 'boundaryLine_01ARZ3NDEKTSV4RRFFQ69G5K01';
const BL_SQUARE = [
    { x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 },
    { x: 20, y: 0, z: 20 }, { x: 0, y: 0, z: 20 },
];
const BL_HOST = 'wall_01ARZ3NDEKTSV4RRFFQ69G5K02';

const BALCONY = 'balcony_01ARZ3NDEKTSV4RRFFQ69G5K10';
const B_SLAB = 'slab_01ARZ3NDEKTSV4RRFFQ69G5K11';
const B_FLOOR = 'floor_01ARZ3NDEKTSV4RRFFQ69G5K12';
const B_RAILS = [
    'handrail_01ARZ3NDEKTSV4RRFFQ69G5K13',
    'handrail_01ARZ3NDEKTSV4RRFFQ69G5K14',
    'handrail_01ARZ3NDEKTSV4RRFFQ69G5K15',
];
const B_HOST_WALL = 'wall_01ARZ3NDEKTSV4RRFFQ69G5K16';
const B_HOST_SEGMENT = { a: { x: 0, z: 0 }, b: { x: 6, z: 0 } };
const B_BOUNDARY = [
    { x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 0 },
    { x: 3, y: 0, z: 0.5 }, { x: 2, y: 0, z: 0.5 },
];
const BALCONY_PAYLOAD = {
    balconyId: BALCONY, levelId: LEVEL, boundary: B_BOUNDARY,
    hostWallId: B_HOST_WALL, hostOffset: 2, hostSegment: B_HOST_SEGMENT,
    slabId: B_SLAB, floorId: B_FLOOR, railingIds: B_RAILS,
};

const W1 = 'wall_01ARZ3NDEKTSV4RRFFQ69G5K20';
const W2 = 'wall_01ARZ3NDEKTSV4RRFFQ69G5K21';

const POOL_HOST = 'slab_01ARZ3NDEKTSV4RRFFQ69G5K30';
const POOL = 'pool_01ARZ3NDEKTSV4RRFFQ69G5K31';
const POOL_WATER = 'water_01ARZ3NDEKTSV4RRFFQ69G5K32';
const POOL_FLOOR = 'slab_01ARZ3NDEKTSV4RRFFQ69G5K33';
const POOL_WALLS = [
    'wall_01ARZ3NDEKTSV4RRFFQ69G5K34', 'wall_01ARZ3NDEKTSV4RRFFQ69G5K35',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5K36', 'wall_01ARZ3NDEKTSV4RRFFQ69G5K37',
];

const LIFT = 'lift_01ARZ3NDEKTSV4RRFFQ69G5K40';
const LIFT_HOST_WALL = 'wall_01ARZ3NDEKTSV4RRFFQ69G5K41';
const LIFT_SLABS = [
    'slab_01ARZ3NDEKTSV4RRFFQ69G5K42',
    'slab_01ARZ3NDEKTSV4RRFFQ69G5K43',
    'slab_01ARZ3NDEKTSV4RRFFQ69G5K44',
];
const LIFT_ENCLOSURE = [
    'wall_01ARZ3NDEKTSV4RRFFQ69G5K45', 'wall_01ARZ3NDEKTSV4RRFFQ69G5K46',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5K47', 'wall_01ARZ3NDEKTSV4RRFFQ69G5K48',
];
const LIFT_DOORS = [
    'door_01ARZ3NDEKTSV4RRFFQ69G5K49', 'door_01ARZ3NDEKTSV4RRFFQ69G5K4A',
    'door_01ARZ3NDEKTSV4RRFFQ69G5K4B',
];
const LIFT_CABIN = [
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5K50', 'liftpart_01ARZ3NDEKTSV4RRFFQ69G5K51',
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5K52', 'liftpart_01ARZ3NDEKTSV4RRFFQ69G5K53',
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5K54',
];
const PLATE = [
    { x: 0, y: 0, z: 0 }, { x: 12, y: 0, z: 0 },
    { x: 12, y: 0, z: 10 }, { x: 0, y: 0, z: 10 },
];

describe('§CFIX5-READBACK-WAVE-2 — ten verbs read back off the COMPOSED runtime', () => {

    // ═══════════════════════════════════════════════════════════════════════════
    // D — THE CONTROLS. Run first, so nothing below is credited to boot state.
    // ═══════════════════════════════════════════════════════════════════════════

    it('D-0: ⭐ FALSIFICATION CONTROL — every slot this file reads is EMPTY of its subject before any dispatch', () => {
        // If any arm below could pass without its dispatch, this arm is the one that
        // would have caught it. Asserted as a SET rather than one id, so the control
        // covers the whole file rather than one lucky arm.
        expect(rec(rt.stores.boundaryLine, BL), 'boundaryLine seeded by boot').toBeUndefined();
        expect(rec(rt.stores.balcony, BALCONY), 'balcony seeded by boot').toBeUndefined();
        expect(rec(rt.stores.pool, POOL), 'pool seeded by boot').toBeUndefined();
        expect(rec(rt.stores.water, POOL_WATER), 'water seeded by boot').toBeUndefined();
        expect(rec(rt.stores.lift, LIFT), 'lift seeded by boot').toBeUndefined();
        expect(rec(rt.stores.liftPart, LIFT_CABIN[0]!), 'liftPart seeded by boot').toBeUndefined();
        expect(rt.stores.elements.get('wall').getById(W1), 'wall seeded by boot').toBeUndefined();
        expect(rt.stores.elements.get('wall').getById(W2), 'wall seeded by boot').toBeUndefined();
    });

    it('D-1: the slots are the COMPOSED StoresSlot, and the wall authority is the module singleton', async () => {
        // ⭐ IDENTITY, NOT A LOOKALIKE, for the one family where a singleton exists to
        // compare against — a rival construction or a proxy fails this line, which is
        // what makes A-1's read a read of THE record `ProjectSerializer` consumes.
        const { wallStore } = await import('@pryzm/geometry-wall/store');
        expect(rt.stores.elements.get('wall')).toBe(wallStore);

        // For the twin-less families the composed slot IS the authority: there is no
        // geometry singleton to be a rival OF (StoresSlot documents this per key).
        // What must hold is that the composer ADOPTED the instance the bus writes
        // through rather than constructing a second one — which is precisely what a
        // dispatch becoming visible here demonstrates, and what D-0 makes non-vacuous.
        for (const key of ['boundaryLine', 'balcony', 'pool', 'water', 'lift', 'liftPart'] as const) {
            expect(rt.stores[key], `composed StoresSlot.${key}`).toBeDefined();
            expect(typeof rt.stores[key].getState, `StoresSlot.${key}.getState`).toBe('function');
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // A — WALL. The one authoritative element store the composition root populates.
    // ═══════════════════════════════════════════════════════════════════════════

    it('A-1: ⭐ wall.batch.create is READBACK-POSITIVE in the AUTHORITATIVE store [VERB 1/10]', async () => {
        // `wall.batch.create` is the SECOND of the two command types
        // `authoritativeElementMirror.MIRRORED` covers, and the audit banked only
        // `wall.create`. Both walls are asserted, with DIFFERENT committed values, so
        // this cannot pass on a placeholder record or on a single-element loop.
        const auth = rt.stores.elements.get('wall');
        expect(auth.isEngineAttached()).toBe(true);

        expect(await outcome('wall.batch.create', {
            walls: [
                { id: W1, levelId: LEVEL, baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }], thickness: 0.30, height: 2.9 },
                { id: W2, levelId: LEVEL, baseLine: [{ x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 4 }], thickness: 0.25, height: 3.1 },
            ],
        })).toBe('OK');

        const a = auth.getById(W1);
        const b = auth.getById(W2);
        expect(a, 'wall 1 of the batch').toBeDefined();
        expect(b, 'wall 2 of the batch').toBeDefined();
        expect(a.thickness).toBe(0.30);
        expect(a.height).toBe(2.9);
        expect(b.thickness).toBe(0.25);
        expect(b.height).toBe(3.1);
        expect(b.baseLine[1].z).toBe(4);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // B — BOUNDARY LINE. `create` was already banked; its other four were not.
    // ═══════════════════════════════════════════════════════════════════════════

    it('B-1: boundaryLine.update writes the composed slot — TWO fields, one of them boolean [VERB 2/10]', async () => {
        expect(await outcome('boundaryLine.create', {
            boundaryLineId: BL, levelId: LEVEL, vertices: BL_SQUARE,
            closed: true, drawMode: 'rectangular',
        })).toBe('OK');
        const born = rec(rt.stores.boundaryLine, BL);
        expect(born, 'the seed did not land — nothing below is judgeable').toBeDefined();
        // The BEFORE value, so the AFTER assertion is a change rather than a coincidence.
        expect(born.name).not.toBe('CFIX5-RENAMED');
        // MEASURED, not assumed: a boundary line is born PINNED. This arm was first
        // written expecting `false` and the run said `true` — recorded here rather than
        // quietly flipped, because the direction of the edit below depends on it.
        expect(born.pinned).toBe(true);

        expect(await outcome('boundaryLine.update', { boundaryLineId: BL, name: 'CFIX5-RENAMED' })).toBe('OK');
        expect(rec(rt.stores.boundaryLine, BL).name).toBe('CFIX5-RENAMED');

        // §FEAT-BOUNDARY-LINE-PINNED (L-10504) — the field whose "yes" branch L-942 is
        // about. Asserted separately, and UNPINNING rather than pinning: writing `true`
        // over a record already born `true` would have passed on a handler that dropped
        // the field entirely, which is the exact defect `_merged` exists to avoid.
        expect(await outcome('boundaryLine.update', { boundaryLineId: BL, pinned: false })).toBe('OK');
        const after = rec(rt.stores.boundaryLine, BL);
        expect(after.pinned).toBe(false);
        // …and the earlier edit SURVIVED the second one (UpdateBoundaryLine._merged's
        // "`undefined` means not sent, NOT clear it" rule, measured rather than trusted).
        expect(after.name).toBe('CFIX5-RENAMED');
    });

    it('B-2: boundaryLine.attach records the attachment IN the record [VERB 3/10]', async () => {
        expect(rec(rt.stores.boundaryLine, BL).attachments).toEqual([]);
        expect(await outcome('boundaryLine.attach', {
            boundaryLineId: BL, elementId: BL_HOST, elementKind: 'wall',
            at: { x: 0, z: 0 }, to: { x: 20, z: 0 },
        })).toBe('OK');

        const att = rec(rt.stores.boundaryLine, BL).attachments;
        expect(att).toHaveLength(1);
        expect(att[0].elementId).toBe(BL_HOST);
        expect(att[0].elementKind).toBe('wall');
        // C106 — an attachment is a REFERENCE, not ownership: `childrenIds` stays empty.
        // This is the line that would fail if attach were quietly implemented as parenting.
        expect(rec(rt.stores.boundaryLine, BL).childrenIds).toEqual([]);
    });

    it('B-3: boundaryLine.detach removes it again [VERB 4/10]', async () => {
        expect(rec(rt.stores.boundaryLine, BL).attachments).toHaveLength(1);
        expect(await outcome('boundaryLine.detach', { boundaryLineId: BL, elementId: BL_HOST })).toBe('OK');
        expect(rec(rt.stores.boundaryLine, BL).attachments).toEqual([]);
        // The LINE survives its own detach — deleting the attachment must not delete
        // the record that carried it.
        expect(rec(rt.stores.boundaryLine, BL)).toBeDefined();
    });

    it('B-4: boundaryLine.delete removes ONE record from ONE store [VERB 5/10]', async () => {
        expect(rec(rt.stores.boundaryLine, BL)).toBeDefined();
        const before = (rt.stores.boundaryLine.getState() as Map<string, unknown>).size;
        expect(await outcome('boundaryLine.delete', { boundaryLineId: BL })).toBe('OK');
        expect(rec(rt.stores.boundaryLine, BL)).toBeUndefined();
        // C84 EI-5 / C106 §6 — create wrote one record in one store, so delete removes
        // exactly one. A delete that took the store with it would also satisfy the line
        // above; this is the line that separates them.
        expect((rt.stores.boundaryLine.getState() as Map<string, unknown>).size).toBe(before - 1);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // C — BALCONY. Zero of its three verbs were banked.
    // ═══════════════════════════════════════════════════════════════════════════

    it('C-1: balcony.create lands the compound in the COMPOSED slot [VERB 6/10]', async () => {
        expect(await outcome('balcony.create', BALCONY_PAYLOAD)).toBe('OK');
        const b = rec(rt.stores.balcony, BALCONY);
        expect(b, 'the composed slot did not see the bus write — it is a RIVAL store').toBeDefined();
        expect(b.levelId).toBe(LEVEL);
        expect(b.hostWallId).toBe(B_HOST_WALL);
        // ADR-0333 — ONE gesture mints the parent AND names every member it owns.
        expect(b.childrenIds).toEqual([B_SLAB, B_FLOOR, ...B_RAILS]);
    });

    it('C-2: balcony.updateProfile RESHAPES the stored record [VERB 7/10]', async () => {
        // 0.5 m deep at creation; a value deliberately not the default, so a handler
        // that silently fell back to the system type would fail here.
        expect(Math.max(...rec(rt.stores.balcony, BALCONY).boundary.map((p: any) => p.z))).toBeCloseTo(0.5, 9);
        expect(await outcome('balcony.updateProfile', {
            balconyId: BALCONY,
            boundary: [
                { x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 0 },
                { x: 3, y: 0, z: 1.4 }, { x: 2, y: 0, z: 1.4 },
            ],
            hostSegment: B_HOST_SEGMENT,
        })).toBe('OK');
        expect(Math.max(...rec(rt.stores.balcony, BALCONY).boundary.map((p: any) => p.z))).toBeCloseTo(1.4, 9);
    });

    it('C-3: balcony.delete removes the compound [VERB 8/10]', async () => {
        expect(rec(rt.stores.balcony, BALCONY)).toBeDefined();
        expect(await outcome('balcony.delete', { balconyId: BALCONY })).toBe('OK');
        expect(rec(rt.stores.balcony, BALCONY)).toBeUndefined();
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // E — THE TWO COMPOUND DELETES. `delete` was the worst-covered kind at 1 / 40.
    // ═══════════════════════════════════════════════════════════════════════════

    it('E-1: pool.delete removes the pool AND its water [VERB 9/10]', async () => {
        expect(await outcome('slab.create', {
            id: POOL_HOST, levelId: 'level-1', thickness: 0.2,
            boundary: [
                { x: -5, y: 0, z: -5 }, { x: 15, y: 0, z: -5 },
                { x: 15, y: 0, z: 15 }, { x: -5, y: 0, z: 15 },
            ],
        })).toBe('OK');
        expect(await outcome('pool.create', {
            poolId: POOL, levelId: 'level-1', hostSlabId: POOL_HOST,
            boundary: [
                { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
                { x: 4, y: 0, z: 2 }, { x: 0, y: 0, z: 2 },
            ],
            wallIds: POOL_WALLS, floorSlabId: POOL_FLOOR, waterId: POOL_WATER,
        })).toBe('OK');
        // ⛔ THE SEED MUST BE PROVEN TO HAVE LANDED, or the delete is UNJUDGEABLE —
        // `door.delete` came back `seed-did-not-land` for want of exactly this line.
        expect(rec(rt.stores.pool, POOL), 'pool seed did not land').toBeDefined();
        expect(rec(rt.stores.water, POOL_WATER), 'water seed did not land').toBeDefined();

        expect(await outcome('pool.delete', { poolId: POOL })).toBe('OK');
        expect(rec(rt.stores.pool, POOL)).toBeUndefined();
        // C103 §6 — the water belongs to the pool and goes with it. Asserted on its OWN
        // channel: a delete that removed only the parent would leave water in the void.
        expect(rec(rt.stores.water, POOL_WATER), 'water outlived its pool').toBeUndefined();
    });

    it('E-2: lift.delete removes the lift AND its cabin parts [VERB 10/10]', async () => {
        expect(await outcome('wall.create', {
            id: LIFT_HOST_WALL, levelId: 'level-1', height: 3, thickness: 0.2,
            baseLine: [{ x: 0, y: 0, z: 5 }, { x: 12, y: 0, z: 5 }],
        })).toBe('OK');
        const levels = ['level-1', 'level-2', 'level-3'] as const;
        for (let i = 0; i < 3; i++) {
            expect(await outcome('slab.create', {
                id: LIFT_SLABS[i], levelId: levels[i], boundary: PLATE,
            })).toBe('OK');
        }
        expect(await outcome('lift.create', {
            liftId: LIFT, levelId: 'level-1', enclosureType: 'wall-hosted',
            hostWallId: LIFT_HOST_WALL, origin: { x: 6, y: 0, z: 5 }, rotation: 0,
            servedLevels: [
                { levelId: 'level-1', elevation: 0, slabId: LIFT_SLABS[0] },
                { levelId: 'level-2', elevation: 3, slabId: LIFT_SLABS[1] },
                { levelId: 'level-3', elevation: 6, slabId: LIFT_SLABS[2] },
            ],
            enclosureIds: LIFT_ENCLOSURE,
            landingDoorIds: LIFT_DOORS,
            cabinPartIds: LIFT_CABIN,
        })).toBe('OK');
        expect(rec(rt.stores.lift, LIFT), 'lift seed did not land').toBeDefined();
        for (const p of LIFT_CABIN) {
            expect(rec(rt.stores.liftPart, p), `cabin part ${p} seed`).toBeDefined();
        }

        expect(await outcome('lift.delete', { liftId: LIFT })).toBe('OK');
        expect(rec(rt.stores.lift, LIFT)).toBeUndefined();
        // C104 — every cabin part, not just the first. A delete that popped one member
        // and stopped would pass a single-id assertion.
        for (const p of LIFT_CABIN) {
            expect(rec(rt.stores.liftPart, p), `cabin part ${p} outlived its lift`).toBeUndefined();
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // F — MEASURED NEGATIVES. C70 L-INV-1: "not proven" and "measured absent" are
    //     different values, and neither may be recorded as the other.
    // ═══════════════════════════════════════════════════════════════════════════

    it('F-1: ⭐ MEASURED NEGATIVE — wall.createOpening reports OK and the AUTHORITATIVE wall never gets the opening', async () => {
        // This is the same defect class §FIX-CREATE-LIVENESS-LIE names for `door.create`,
        // one level up: the handler writes the plugin DTO wall record, and
        // `authoritativeElementMirror` only mirrors `{op:'add', path:[id]}` for
        // `wall.create` / `wall.batch.create` — an opening is a nested `replace` on an
        // EXISTING wall, so no mirrored patch exists and nothing carries it across.
        const auth = rt.stores.elements.get('wall');
        expect(auth.getById(W1).openings).toEqual([]);

        const OPENING = 'opening_01ARZ3NDEKTSV4RRFFQ69G5K60';
        const DOOR = 'door_01ARZ3NDEKTSV4RRFFQ69G5K61';
        expect(await outcome('wall.createOpening', {
            wallId: W1,
            opening: {
                id: OPENING, type: 'door', offset: 2,
                width: 0.9, height: 2.1, sillHeight: 0, elementId: DOOR,
            },
        })).toBe('OK');

        // ⛔ REPORTS SUCCESS, MOVES NOTHING THE SERIALIZER READS.
        expect(auth.getById(W1).openings, 'authoritative wall gained the opening — UPDATE THIS ROW').toEqual([]);
        // …and the authoritative door store is likewise untouched, which is why
        // `CreateDoor.ts` records `door.delete` as `seed-did-not-land`.
        expect(rt.stores.elements.get('door').getById(DOOR)).toBeUndefined();
    });

    it('F-2: ⭐ MEASURED NEGATIVE — the schedule family is NOT REGISTERED on the composed bus', () => {
        // All seven `schedule.*` verbs are in the 361-row register and none of them is
        // dispatchable here. "No handler" and "handler that refuses" are different
        // facts; the audit's `liveness: UNKNOWN` covers both, and this arm separates
        // them for one family so the row can stop saying UNKNOWN.
        for (const verb of [
            'schedule.create', 'schedule.delete', 'schedule.setFilter',
            'schedule.setGroupBy', 'schedule.column.add', 'schedule.column.remove',
        ]) {
            expect(rt.bus.has(verb), `${verb} became registered — UPDATE THIS ROW`).toBe(false);
        }
        // POSITIVE CONTROL — the same `has()` DOES find the verbs this file proved, so
        // the arm above is a measurement and not a broken lookup.
        for (const verb of ['balcony.create', 'pool.delete', 'lift.delete', 'wall.batch.create']) {
            expect(rt.bus.has(verb), `${verb} positive control`).toBe(true);
        }
    });

    it('F-3: ⭐ MEASURED NEGATIVE — view.create IS registered and CANNOT execute: two stores share the key "view"', async () => {
        // `plugins/view/src/handlers/CreateView.ts` reads `ctx.stores.view.getState()`
        // (a `ViewRegistry`); the composed bus resolves the key `view` to the ADR-0318
        // authoritative `ViewDefinitionStoreImpl`, which has no `getState`. So the verb
        // is registered, dispatchable, and dead on arrival — a store-KEY COLLISION, not
        // a payload defect, which is why a valid payload does not rescue it.
        expect(rt.bus.has('view.create')).toBe(true);
        const result = await outcome('view.create', {
            definition: {
                id: 'view-cfix5-1', name: 'CFIX5', kind: '3d-perspective',
                camera: {
                    position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 },
                    up: { x: 0, y: 1, z: 0 }, fovDeg: 50,
                },
                renderMode: 'shaded', levelFilter: null, elementKindFilter: null,
            },
        });
        expect(result).not.toBe('OK');
        expect(result).toMatch(/getState is not a function/);
        // The collision, named at both ends rather than inferred from the message.
        const authView = rt.stores.elements.get('view');
        expect(authView).toBeDefined();
        expect(typeof (authView as { getState?: unknown }).getState).not.toBe('function');
    });
});
