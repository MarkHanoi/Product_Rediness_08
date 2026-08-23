// §FEAT-LIFT-COMPOUND-SYSTEM (L-5700..L-5712) — the lift COMPOUND is DISPATCHABLE,
// proven at the composed runtime rather than at a hand-built world.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS AND `plugins/lift/__tests__/` CANNOT REPLACE IT
// ═══════════════════════════════════════════════════════════════════════════════
//
// This is the pool's argument (`poolReachableThroughComposedRuntime.test.ts`),
// re-run for the lift, and it is worth restating because it is the ONLY reason this
// file is separate from the plugin's own suite:
//
//   A plugin's own tests build their own `World` object and hand it to the bus as
//   the stores provider. The storesProvider is the very thing that breaks, so a test
//   that SUPPLIES it cannot observe its absence. `pool.create` passed its own suite
//   for MONTHS while being undispatchable by the application.
//
// In production the provider is `storesAsRecordView(stores)` over `stores[storeKey]`
// accumulated from `ALL_PLUGINS` (bootstrap.everything.ts:145). `CreateLiftHandler`
// declares SIX affectedStores — `lift`, `liftPart`, `wall`, `curtainwall`, `door`,
// `slab` — and `CommandBus.buildContext` (CommandBus.ts:286-292) throws
//
//     lift.create: required store 'lift' is missing from HandlerContext.stores
//
// BEFORE anything mutates, unless EVERY ONE of them resolves.
//
// ⭐ SO THE ONE RULE THIS FILE ENFORCES IS: the lift compound is reachable THROUGH
// THE REAL COMPOSITION ROOT. It deliberately never constructs a store, a stores
// object or a bus of its own. Delete the two descriptors from `PluginRegistry.ts`
// and every case below fails; that is the property being pinned.
//
// ⚠ WHAT THIS FILE DOES **NOT** PROVE, STATED SO NOBODY READS MORE INTO A GREEN RUN:
// it proves the command is dispatchable and that its patches land in the stores the
// renderer and the schedule read. It does NOT prove that a person can click a Lift
// button and get one — the palette button at `CreatePanelLayout.ts:278` still drives
// the LEGACY massing command (`CreateVerticalCirculationCommand`), not `lift.create`.
// That gap is real, measured, and recorded as L-5709; it is not hidden behind a
// green test here.

import { describe, expect, it } from 'vitest';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { LiftCompoundStore, LiftPartStore } from '@pryzm/plugin-lift';
import { LIFT_PART_CYCLE_ORDER, LIFT_PART_KINDS } from '@pryzm/geometry-lift';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

// ⚠ EVERY ID THAT GOES THROUGH AN EXISTING FAMILY'S COMMAND IS A REAL BRANDED ULID.
// `slab.create` rejects readable slugs (`/^slab_[0-9A-HJKMNP-TV-Z]{26}$/` — Crockford
// base32, I/L/O/U excluded). The pool suite records the same constraint. The lift's
// OWN ids only need to be non-empty, but they are minted in the same shape so a
// later L0 promotion (L-5711) does not have to rewrite this file.
const HOST_WALL = 'wall_01ARZ3NDEKTSV4RRFFQ69G5H00';
const SLAB_L0 = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H01';
const SLAB_L1 = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H02';
const SLAB_L2 = 'slab_01ARZ3NDEKTSV4RRFFQ69G5H03';
const LIFT_ID = 'lift_01ARZ3NDEKTSV4RRFFQ69G5H04';

const ENCLOSURE_IDS = [
    'wall_01ARZ3NDEKTSV4RRFFQ69G5H10',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5H11',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5H12',
    'wall_01ARZ3NDEKTSV4RRFFQ69G5H13',
];
const LANDING_DOOR_IDS = [
    'door_01ARZ3NDEKTSV4RRFFQ69G5H20',
    'door_01ARZ3NDEKTSV4RRFFQ69G5H21',
    'door_01ARZ3NDEKTSV4RRFFQ69G5H22',
];
const CABIN_PART_IDS = [
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5H30',
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5H31',
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5H32',
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5H33',
    'liftpart_01ARZ3NDEKTSV4RRFFQ69G5H34',
];

/** A 12 x 10 m floor plate, world XZ, OPEN loop. */
const PLATE = [
    { x: 0, y: 0, z: 0 },
    { x: 12, y: 0, z: 0 },
    { x: 12, y: 0, z: 10 },
    { x: 0, y: 0, z: 10 },
];

/** THREE storeys — the founder's "how many stories that lift should cover". */
const SERVED_LEVELS = [
    { levelId: 'level-1', elevation: 0, slabId: SLAB_L0 },
    { levelId: 'level-2', elevation: 3, slabId: SLAB_L1 },
    { levelId: 'level-3', elevation: 6, slabId: SLAB_L2 },
];

const LIFT_PAYLOAD = {
    liftId: LIFT_ID,
    levelId: 'level-1',
    enclosureType: 'wall-hosted' as const,
    hostWallId: HOST_WALL,
    origin: { x: 6, y: 0, z: 5 },
    rotation: 0,
    servedLevels: SERVED_LEVELS,
    enclosureIds: ENCLOSURE_IDS,
    landingDoorIds: LANDING_DOOR_IDS,
    cabinPartIds: CABIN_PART_IDS,
};

/** Boot the app's real composition root and give the lift a host wall + 3 plates. */
async function bootWithLift() {
    const rt = await bootstrapWithEverything({ audit: AUDIT });
    await rt.bus.executeCommand('wall.create', {
        id: HOST_WALL,
        levelId: 'level-1',
        baseLine: [
            { x: 0, y: 0, z: 5 },
            { x: 12, y: 0, z: 5 },
        ],
        height: 3,
        thickness: 0.2,
    });
    for (const [id, lvl] of [
        [SLAB_L0, 'level-1'],
        [SLAB_L1, 'level-2'],
        [SLAB_L2, 'level-3'],
    ] as const) {
        await rt.bus.executeCommand('slab.create', { id, levelId: lvl, boundary: PLATE });
    }
    return rt;
}

describe('§FEAT-LIFT-COMPOUND-SYSTEM — the lift compound is dispatchable through the composed runtime', () => {
    it('R-1: the composition root contributes BOTH the lift and the liftPart store', async () => {
        const rt = await bootstrapWithEverything({ audit: AUDIT });
        // The six stores `lift.create` declares in `affectedStores` must ALL resolve.
        // `wall`, `slab`, `door` and `curtainwall` always did; `lift` and `liftPart`
        // are what L-5700 added, and they are the pair that would throw.
        expect(rt.stores.lift).toBeInstanceOf(LiftCompoundStore);
        expect(rt.stores.liftPart).toBeInstanceOf(LiftPartStore);
        expect(rt.stores.wall).toBeDefined();
        expect(rt.stores.slab).toBeDefined();
        expect(rt.stores.door).toBeDefined();
        expect(rt.stores.curtainwall).toBeDefined();
        rt.tearDown();
    });

    it('R-2: lift.create DISPATCHES — it no longer throws at CommandBus.buildContext', async () => {
        const rt = await bootWithLift();
        // The assertion that matters: this line THREW before the descriptors existed,
        // at CommandBus.buildContext, BEFORE any mutation. The THROW is what is
        // pinned — a `.toBeDefined()` on the result would also pass on a handler that
        // silently did nothing.
        await expect(rt.bus.executeCommand('lift.create', LIFT_PAYLOAD)).resolves.toBeDefined();
        rt.tearDown();
    });

    it('R-3: ONE dispatch lands the lift, its 4 enclosure sides, its 3 landing doors and its 5 cabin parts', async () => {
        const rt = await bootWithLift();
        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);

        // Read the stores the application reads, not the handler's return value.
        // [[committed-is-not-reachable]] — a handler result proves the function ran,
        // never that the patch reached the store the renderer and schedule consume.
        expect(rt.stores.lift.getState().get(LIFT_ID)).toBeDefined();
        for (const id of ENCLOSURE_IDS) {
            expect(rt.stores.wall.getState().get(id), `enclosure side ${id}`).toBeDefined();
        }
        for (const id of LANDING_DOOR_IDS) {
            expect(rt.stores.door.getState().get(id), `landing door ${id}`).toBeDefined();
        }
        for (const id of CABIN_PART_IDS) {
            expect(rt.stores.liftPart.getState().get(id), `cabin part ${id}`).toBeDefined();
        }
        rt.tearDown();
    });

    it('R-4: ⭐ ONE LANDING DOOR PER SERVED LEVEL, each on the level it serves', async () => {
        const rt = await bootWithLift();
        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);

        // This is the founder's "will create the relevant doors instances" — asserted
        // as a RELATION between the served-level set and the door set, not as the
        // literal 3, so it survives a different storey count and still catches a
        // lift that made one door for a 3-storey shaft.
        const doors = LANDING_DOOR_IDS.map(
            (id) => rt.stores.door.getState().get(id) as { levelId: string; sillHeight: number },
        );
        expect(doors).toHaveLength(SERVED_LEVELS.length);
        expect(doors.map((d) => d.levelId)).toEqual(SERVED_LEVELS.map((l) => l.levelId));

        // ⭐ AND THE SILL HEIGHTS RISE WITH THE STOREYS. A shaft wall spanning
        // pit-to-overrun carries all N doors, so the ONLY thing that puts a door on
        // the right floor is its sillHeight. Three doors all at sillHeight 0 would
        // pass every "there are 3 doors" check and be a stack of doors in the pit.
        for (let i = 1; i < doors.length; i++) {
            expect(doors[i]!.sillHeight, `door ${i} sill above door ${i - 1}`).toBeGreaterThan(
                doors[i - 1]!.sillHeight,
            );
        }
        // The rise between consecutive doors IS the storey height.
        expect(doors[1]!.sillHeight - doors[0]!.sillHeight).toBeCloseTo(3, 10);
        rt.tearDown();
    });

    it('R-5: ⭐ THE SHAFT VOIDS EVERY SLAB IT PASSES — a hole per storey, not a box on the floor', async () => {
        const rt = await bootWithLift();
        for (const id of [SLAB_L0, SLAB_L1, SLAB_L2]) {
            const before = rt.stores.slab.getState().get(id) as { holes?: unknown[] };
            expect(before.holes ?? [], `slab ${id} before`).toHaveLength(0);
        }

        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);

        for (const id of [SLAB_L0, SLAB_L1, SLAB_L2]) {
            const after = rt.stores.slab.getState().get(id) as { holes: unknown[][] };
            expect(after.holes, `slab ${id} after`).toHaveLength(1);
            // The void IS the shaft footprint — one polygon drives the enclosure and
            // every hole, so they cannot drift apart.
            expect(after.holes[0]).toHaveLength(4);
        }
        rt.tearDown();
    });

    it('R-6: the lift OWNS its parts — parentId on each child, childrenIds on the parent', async () => {
        const rt = await bootWithLift();
        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);

        // This is what makes a lift ONE thing to select, inspect and delete, and it is
        // the blessed C15/ADR-0124 §3 ownership mechanism — C103 §2 — rather than a
        // new compound pattern.
        const lift = rt.stores.lift.getState().get(LIFT_ID) as { childrenIds: string[] };
        const owned = new Set(lift.childrenIds);
        // ⭐ EVERY PRE-MINTED MEMBER IS OWNED — stated as a COVERING relationship
        // rather than as a set EQUALITY (§FEAT-LIFT-OBSERVATION-FRAME, L-9400).
        //
        // ⚠ THIS ASSERTION USED TO BE `toEqual(new Set([...three arrays]))` AND IT WENT
        // RED FOR THE RIGHT REASON. The lift now also owns its structural frame — four
        // corner columns, a ring beam per side per served storey, top-bay bracing and
        // two guide rails — whose ids are DERIVED from the parent rather than pre-minted
        // by the tool (a variable member count cannot be pre-minted without the tool
        // re-deriving the assembly's own arithmetic). A set equality against the
        // pre-minted arrays can only ever mean "the frame must not exist", so it is
        // restated as the property that actually matters: nothing the tool minted is
        // dropped, and nothing is owned that is not a member.
        for (const id of [...ENCLOSURE_IDS, ...LANDING_DOOR_IDS, ...CABIN_PART_IDS]) {
            expect(owned.has(id), `pre-minted member ${id} is not owned`).toBe(true);
        }
        // ⛔ And the HOST WALL is still not among them — a wall-hosted lift BORROWS its
        // host, and a `childrenIds` that grew is exactly when that could slip.
        expect(owned.has(HOST_WALL)).toBe(false);
        // The closure: enclosure + doors + every liftPart the command wrote. Anything
        // else in the list is an id the delete would try to reap and could not find.
        const allParts = (rt.stores.liftPart as LiftPartStore).byLift(LIFT_ID);
        expect(owned.size).toBe(
            ENCLOSURE_IDS.length + LANDING_DOOR_IDS.length + allParts.length,
        );
        for (const id of ENCLOSURE_IDS) {
            expect((rt.stores.wall.getState().get(id) as { parentId: string }).parentId).toBe(
                LIFT_ID,
            );
        }
        for (const id of LANDING_DOOR_IDS) {
            expect((rt.stores.door.getState().get(id) as { parentId: string }).parentId).toBe(
                LIFT_ID,
            );
        }
        for (const id of CABIN_PART_IDS) {
            expect((rt.stores.liftPart.getState().get(id) as { parentId: string }).parentId).toBe(
                LIFT_ID,
            );
        }
        // ⛔ AND THE HOST WALL IS **NOT** OWNED. A wall-hosted lift BORROWS a wall.
        // If the host ended up in childrenIds, `lift.delete` would delete the user's
        // wall — which is why this is asserted rather than assumed.
        expect(lift.childrenIds).not.toContain(HOST_WALL);
        rt.tearDown();
    });

    it('R-7: the parts are REAL records in the families that already own them — so take-off and IFC find them', async () => {
        const rt = await bootWithLift();
        const wallsBefore = rt.stores.wall.getState().size;
        const doorsBefore = rt.stores.door.getState().size;
        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);

        // The founder asked for sub-elements that are "querible and selectable". This
        // is the assertion that the composition is REAL rather than bespoke meshes:
        // the parts sit in the same stores every other wall and door lives in, which
        // is what makes a lift measurable (C28) and exportable (C25).
        expect(rt.stores.wall.getState().size).toBe(wallsBefore + ENCLOSURE_IDS.length);
        expect(rt.stores.door.getState().size).toBe(doorsBefore + LANDING_DOOR_IDS.length);
        for (const id of ENCLOSURE_IDS) {
            const w = rt.stores.wall.getState().get(id) as { type: string; thickness: number };
            // `type: 'wall'` is the load-bearing claim: it is what makes every
            // wall-aware consumer (schedule, IFC exporter, material dispatcher) pick
            // these up. Thickness is asserted as a RULE — positive — rather than
            // against a documented default, which would go red on a deliberate change
            // rather than on a defect.
            expect(w.type).toBe('wall');
            expect(w.thickness, `${id} thickness`).toBeGreaterThan(0);
        }
        for (const id of LANDING_DOOR_IDS) {
            const d = rt.stores.door.getState().get(id) as { type: string; width: number };
            expect(d.type).toBe('door');
            expect(d.width).toBeGreaterThan(0);
        }
        rt.tearDown();
    });

    it('R-8: ⭐ THE CABIN DECOMPOSES — five named, individually addressable parts', async () => {
        const rt = await bootWithLift();
        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);

        // The founder's "cabinet will be composed by structure, finishes wall, floor
        // ceiling etc.. all sub elements querible and selectable", asserted as the
        // SET of kinds rather than as a count — a count of 5 would pass on five
        // copies of the same part.
        const parts = CABIN_PART_IDS.map(
            (id) => rt.stores.liftPart.getState().get(id) as { kind: string; height: number },
        );
        expect(new Set(parts.map((p) => p.kind))).toEqual(new Set(LIFT_PART_CYCLE_ORDER));
        // Every part is a real dimensioned box — LOD 300, not a marker.
        for (const p of parts) expect(p.height, `${p.kind} height`).toBeGreaterThan(0);

        // ⭐ "SELECT THE CABIN CEILING ALONE" — the query the Tab drill-in resolves
        // through. This is the founder's acceptance criterion, expressed as a store
        // read rather than as a click, because a store read is what a test can pin.
        const ceiling = (rt.stores.liftPart as LiftPartStore).partOfKind(
            LIFT_ID,
            'cabin-ceiling',
        );
        expect(ceiling).toBeDefined();
        expect(ceiling!.kind).toBe('cabin-ceiling');
        // ⭐ THE CABIN IS FIVE PARTS, AND THE LIFT IS MORE THAN ITS CABIN.
        //
        // ⚠ This used to assert `byLift(LIFT_ID)` had exactly `LIFT_PART_CYCLE_ORDER
        // .length` members, i.e. that a lift owns FIVE liftParts and no more. It went
        // red at 33 when the shaft frame landed (§FEAT-LIFT-OBSERVATION-FRAME, L-9400),
        // and the number was the point: a lift owns its cabin AND its structure.
        //
        // Restated so it keeps catching what it was written to catch — a cabin that
        // silently loses a part — without also forbidding the frame: the CABIN kinds
        // are exactly the cycle order, one member each, and every other part is a
        // SHAFT kind rather than an unclassified stray.
        const byLift = (rt.stores.liftPart as LiftPartStore).byLift(LIFT_ID);
        const cabinMembers = byLift.filter(
            (m) => (LIFT_PART_CYCLE_ORDER as readonly string[]).includes(m.kind),
        );
        expect(cabinMembers).toHaveLength(LIFT_PART_CYCLE_ORDER.length);
        for (const m of byLift) {
            expect(
                (LIFT_PART_KINDS as readonly string[]).includes(m.kind),
                `part ${m.id} has an unclassified kind '${m.kind}'`,
            ).toBe(true);
        }
        // The frame really is there — a lift that owns only its cabin is the pre-fix
        // state, and this arm must not go quietly green on it.
        expect(byLift.length).toBeGreaterThan(LIFT_PART_CYCLE_ORDER.length);
        rt.tearDown();
    });

    it('R-9: the CAR is smaller than the SHAFT, and stays so when the shaft is resized', async () => {
        const rt = await bootWithLift();
        // A deliberately NON-default shaft, so a resolution chain that silently fell
        // back to the default would fail here.
        const WIDE = 2.4;
        await rt.bus.executeCommand('lift.create', {
            ...LIFT_PAYLOAD,
            shaftWidth: WIDE,
            shaftDepth: WIDE,
        });

        const structure = (rt.stores.liftPart as LiftPartStore).partOfKind(
            LIFT_ID,
            'cabin-structure',
        );
        expect(structure).toBeDefined();
        // The car is DERIVED from the shaft (C104 §4), so widening the shaft widens
        // the car — and the car is always strictly inside it. Storing both would let
        // them disagree; this is the assertion that they cannot.
        expect(structure!.width).toBeLessThan(WIDE);
        expect(structure!.width).toBeGreaterThan(0);
        rt.tearDown();
    });

    it('R-10: ⭐ THE STANDALONE GLASS TYPE REUSES THE CURTAIN-WALL FAMILY — it does not invent glass', async () => {
        const rt = await bootWithLift();
        await rt.bus.executeCommand('lift.create', {
            ...LIFT_PAYLOAD,
            enclosureType: 'standalone-glass' as const,
            hostWallId: undefined,
        });

        // Three of the four sides are REAL CurtainWall records (C87 governs them);
        // the LANDING side stays a Wall because `Door.wallId` hosts in a wall and a
        // CurtainWall has no opening list. See LiftAssembly.ts §2 for the argument.
        const cwCount = ENCLOSURE_IDS.filter((id) =>
            rt.stores.curtainwall.getState().get(id),
        ).length;
        const wallCount = ENCLOSURE_IDS.filter((id) => rt.stores.wall.getState().get(id)).length;
        expect(cwCount).toBe(3);
        expect(wallCount).toBe(1);

        // The landing doors still host in the one solid side — so a glass lift's
        // doors are still countable doors.
        const landingSideId = (rt.stores.lift.getState().get(LIFT_ID) as { landingSideId: string })
            .landingSideId;
        expect(rt.stores.wall.getState().get(landingSideId)).toBeDefined();
        for (const id of LANDING_DOOR_IDS) {
            expect((rt.stores.door.getState().get(id) as { wallId: string }).wallId).toBe(
                landingSideId,
            );
        }
        rt.tearDown();
    });

    it('R-11: lift.delete removes the whole compound AND HEALS EVERY VOID', async () => {
        const rt = await bootWithLift();
        await rt.bus.executeCommand('lift.create', LIFT_PAYLOAD);
        await rt.bus.executeCommand('lift.delete', {
            liftId: LIFT_ID,
            servedLevels: SERVED_LEVELS,
        });

        expect(rt.stores.lift.getState().get(LIFT_ID)).toBeUndefined();
        for (const id of ENCLOSURE_IDS) {
            expect(rt.stores.wall.getState().get(id), `side ${id} after delete`).toBeUndefined();
        }
        for (const id of LANDING_DOOR_IDS) {
            expect(rt.stores.door.getState().get(id), `door ${id} after delete`).toBeUndefined();
        }
        for (const id of CABIN_PART_IDS) {
            expect(rt.stores.liftPart.getState().get(id), `part ${id}`).toBeUndefined();
        }
        // A lift that vanishes but leaves its voids is "worse than no feature" — and
        // it leaves ONE PER STOREY. Asserted separately from the "the lift is gone"
        // checks above, because those would score a perfect pass on exactly that bug.
        for (const id of [SLAB_L0, SLAB_L1, SLAB_L2]) {
            const slab = rt.stores.slab.getState().get(id) as { holes: unknown[] };
            expect(slab.holes, `slab ${id} healed`).toHaveLength(0);
        }
        // ⛔ AND THE HOST WALL SURVIVES. Deleting a lift must not delete the user's wall.
        expect(rt.stores.wall.getState().get(HOST_WALL)).toBeDefined();
        rt.tearDown();
    });

    it('R-12: a wall-hosted lift REFUSES a missing host, and an unknown slab — before mutating', async () => {
        const rt = await bootWithLift();
        // C01 §6 rule 6 / the refusing half: a compound that silently places itself
        // against nothing is worse than one that refuses.
        await expect(
            rt.bus.executeCommand('lift.create', {
                ...LIFT_PAYLOAD,
                hostWallId: 'wall_01ARZ3NDEKTSV4RRFFQ69G5HZZ',
            }),
        ).rejects.toThrow();
        // Nothing landed.
        expect(rt.stores.lift.getState().get(LIFT_ID)).toBeUndefined();

        // A served level naming a slab that does not exist is a DANGLING reference,
        // and it must fail rather than punch a void into nothing.
        await expect(
            rt.bus.executeCommand('lift.create', {
                ...LIFT_PAYLOAD,
                servedLevels: [
                    { levelId: 'level-1', elevation: 0, slabId: 'slab_01ARZ3NDEKTSV4RRFFQ69G5HZY' },
                ],
                landingDoorIds: [LANDING_DOOR_IDS[0]!],
            }),
        ).rejects.toThrow();
        expect(rt.stores.lift.getState().get(LIFT_ID)).toBeUndefined();
        rt.tearDown();
    });
});
