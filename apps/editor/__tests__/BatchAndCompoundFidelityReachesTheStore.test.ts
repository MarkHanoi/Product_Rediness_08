/**
 * §FIX-BEAM-BATCH-CEB-STEEL · §FIX-LIFT-CEB-GLAZING · §REFUSE-SLAB-HOLES-AND-COLOUR
 * (B-FIX LANE 1 — the bridge carriers · C84 EI-2a/EI-9 · C100 §2.1 · C74/CA-18)
 *
 * ─── WHAT THE 2026-08-31 BUILDERS AUDIT MEASURED, AND WHAT THIS PINS ────────
 * `audit/full-stack/2026-08-31/builders/_EIGHT-FACT-ROW.json` scored 6 of 24
 * drawable families as drawing what the user authored. Three of its rows belong
 * to `CommandEventBridge`, and each is a DIFFERENT disposition:
 *
 *   (a) CARRIED — beam.batch.create. *"THE SINGLE EMIT AND THE BATCH EMIT
 *       DISAGREE … a batch-created steel beam is drawn as a RECTANGLE."*
 *   (a) CARRIED — the lift's curtain-wall fan-out. *"its shaft glazing loses all
 *       four material fields."* ONE of the four had a real authored source and a
 *       live reader; it is carried. The other three are refused in the source,
 *       by name, with the measured reason (`LiftAssembly` authors none of them).
 *   (b) REFUSED — slab's `holes` / `materialColor`. *"an authored void renders
 *       solid … and it counts as renders_3d = YES."* NOT carried, because the
 *       §FT1 mirror reads neither and a key nothing reads is worse than an
 *       honest gap. ANNOUNCED at runtime instead.
 *
 * ─── WHY THESE ARMS DRIVE THE REAL PATH (D6 — construct nothing) ────────────
 * Every arm runs the REAL handler, hands its REAL forward patches to the REAL
 * `CommandEventBridge`, and — for the two carries — feeds the emitted event to
 * THE mirror `initTools.ts` calls, reading the value back out of the real store
 * the builder meshes from. Nothing on the measured path is supplied by the test:
 * a test that handed the bridge a beam already carrying `steelProfileName` could
 * not observe a bridge that drops it.
 *
 * ─── STUB LEDGER ────────────────────────────────────────────────────────────
 * · `events` is a capture object. It is the SUBSCRIBER side, not the emitter —
 *   the emitter under test is the real `wireCommandEventBridge`.
 * · `ctx.stores` are plain empty objects, which is what the handlers' own suites
 *   pass; `produceCommand` needs a base state, not a live store.
 * · Nothing else is substituted. No fake bridge, no fake mirror, no fake store.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { BeamStore } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';

const LEVEL_ID = 'L0';
/** A real member of `SteelProfileLibrary.UB` (`SteelProfileLibrary.ts:117`). */
const UB_PROFILE = '254x146x37';

type Rec = Record<string, unknown>;

/* ────────────────────────────────────────────────────────────────────────────
 * THE REAL BRIDGE. One helper, used by every arm, so no arm can accidentally
 * measure a different emitter than another.
 * ──────────────────────────────────────────────────────────────────────────── */
async function emitThrough(
    commandType: string,
    payload: Rec,
    forward: readonly unknown[],
    channel: string,
): Promise<Rec[]> {
    const { wireCommandEventBridge } = await import(
        '../../../packages/runtime-composer/src/CommandEventBridge'
    );
    const seen: Rec[] = [];
    let emit!: (bytes: unknown, record: unknown) => void;
    const patches = {
        subscribe: (cb: (b: unknown, r: unknown) => void) => {
            emit = cb;
            return () => {};
        },
    };
    const events = {
        emit: (name: string, p: unknown) => {
            if (name === channel) seen.push(p as Rec);
        },
    };
    wireCommandEventBridge(patches as never, events as never);
    emit(new Uint8Array(), {
        id: 'evt-' + commandType,
        type: commandType,
        payload,
        affectedStores: ['beam'],
        audit: { actorId: 'probe' },
        forward,
    });
    return seen;
}

/* ══════════════════════════════════════════════════════════════════════════
 * ARM A — §FIX-BEAM-BATCH-CEB-STEEL
 * ══════════════════════════════════════════════════════════════════════════ */
describe('§FIX-BEAM-BATCH-CEB-STEEL — a batch-created steel beam is still a steel beam', () => {
    const A = { x: 0, y: 3, z: 0 };
    const B = { x: 6, y: 3, z: 0 };

    /** Run the REAL `CreateBeamBatchHandler`. */
    async function commitBatch(beams: readonly Rec[]): Promise<readonly unknown[]> {
        const { CreateBeamBatchHandler } = await import(
            '../../../plugins/beam/src/handlers/CreateBeamBatch'
        );
        const handler = new CreateBeamBatchHandler();
        const ctx = { stores: { beam: {} } } as never;
        const payload = { beams, levelId: LEVEL_ID } as never;
        const verdict = handler.canExecute(ctx, payload);
        if (!verdict.valid) throw new Error('REFUSED: ' + verdict.reason);
        return handler.execute(ctx, payload).forward as readonly unknown[];
    }

    /** REAL handler → REAL bridge → THE mirror → a REAL `BeamStore`. */
    async function batchBeamInStore(extra: Rec = {}): Promise<Rec | null> {
        const id = createId('beam') as unknown as string;
        const member: Rec = {
            id,
            baseLine: [A, B],
            // The L0 spelling of a rolled steel section. `CreateBeamBatch`'s seed
            // DOES carry `shape` (`:104`), so this reaches the commit — and
            // `beamCreatedMirror` maps it to the legacy `sectionType: 'UB'`.
            shape: 'i-section',
            width: 0.25,
            depth: 0.45,
            levelId: LEVEL_ID,
            materialId: 'mat-steel-s355',
            loadBearing: true,
            fireRating: 'R60',
            steelProfileName: UB_PROFILE,
            ...extra,
        };
        const forward = await commitBatch([member]);
        const evs = await emitThrough(
            'beam.batch.create',
            { beams: [member], levelId: LEVEL_ID },
            forward,
            'beam.created',
        );
        expect(evs.length, 'the batch fan-out must emit one beam.created per member').toBe(1);
        const { beamRecordFromCreatedEvent } = await import('../src/engine/beamCreatedMirror');
        const record = beamRecordFromCreatedEvent(evs[0] as never);
        if (!record) return null;
        const store = new BeamStore();
        store.add(record as never);
        return (store.get(id) ?? null) as unknown as Rec | null;
    }

    it('MECHANISM — the batch HANDLER does NOT commit the three fields, so the fix had to read the request', async () => {
        // This is the measurement that decided `b.x` over `_committed?.x`, and it
        // must keep failing loudly if `CreateBeamBatch` ever starts seeding them
        // (at which point the bridge may prefer the commit, as beam.create does).
        const id = createId('beam') as unknown as string;
        const forward = await commitBatch([
            {
                id,
                baseLine: [A, B],
                levelId: LEVEL_ID,
                loadBearing: false,
                fireRating: 'R60',
                steelProfileName: UB_PROFILE,
            },
        ]);
        const committed = (forward as Array<{ value?: Rec }>)[0]?.value ?? {};
        // Positive control on the SAME object — a field the batch seed DOES carry.
        expect(committed['width'], 'the seed carries width, so this object is the real commit').toBe(0.2);
        expect(
            committed['steelProfileName'],
            'CreateBeamBatch.ts:101-108 omits it from the seed — this is the upstream half, still open',
        ).toBeUndefined();
        expect(committed['fireRating']).toBeUndefined();
        expect(
            committed['loadBearing'],
            'an AUTHORED `false` became `true`: this is Beam.parse.default(true), not the user\'s value',
        ).toBe(true);
    });

    it('ARM A1 — the stored beam takes BeamFragmentBuilder\'s steel branch instead of being REFUSED outright', async () => {
        const stored = await batchBeamInStore();
        // ⭐ THIS `not.toBeNull()` IS THE ROW, and the defect was WORSE than the
        // audit recorded. With `shape: 'i-section'` reaching the event but
        // `steelProfileName` dropped at the batch emit, `beamCreatedMirror`'s
        // §FIX-BEAM-CEB-STEEL guard (:155) REFUSED the beam and returned null — so
        // a batch-placed steel beam produced no legacy record and NO MESH AT ALL,
        // not merely a rectangle. Both outcomes are silent to the seven facts.
        expect(stored, 'the mirror refuses an i-section with no profile name — the batch emit dropped it').not.toBeNull();
        // The exact conjunction `BeamFragmentBuilder.ts:253` gates its steel branch on.
        expect(stored!['steelProfileName']).toBe(UB_PROFILE);
        expect(stored!['sectionType']).toBe('UB');
        expect(stored!['sectionType']).not.toBe('rectangular');
    });

    it('ARM A2 — `fireRating` survives to the store RuleEngine and the IFC export read', async () => {
        const stored = await batchBeamInStore();
        expect(stored!['fireRating']).toBe('R60');
    });

    it('ARM A3 — an AUTHORED `loadBearing: false` reaches the store, THROUGH a commit that says true', async () => {
        // The arm that pins the request-over-commit choice end to end. The commit
        // carries `true` (schema default); the store must carry the authored `false`.
        const stored = await batchBeamInStore({ loadBearing: false });
        expect(
            stored!['loadBearing'],
            'reading the commit first would have silently restored the L0 default here',
        ).toBe(false);
    });

    it('ARM A3 CONTROL — an UNSTATED `loadBearing` still lands on the repo default `true`', async () => {
        const stored = await batchBeamInStore({ loadBearing: undefined });
        expect(stored!['loadBearing']).toBe(true);
    });
});

/* ══════════════════════════════════════════════════════════════════════════
 * ARM B — §FIX-LIFT-CEB-GLAZING
 * ══════════════════════════════════════════════════════════════════════════ */
describe('§FIX-LIFT-CEB-GLAZING — a glass lift\'s authored glazing material reaches the curtain-wall store', () => {
    const GLASS_ID = 'mat-glass-low-iron';

    async function liftForward(payload: Rec): Promise<readonly unknown[]> {
        const { CreateLiftHandler } = await import('../../../plugins/lift/src/handlers/CreateLift');
        const handler = new CreateLiftHandler();
        const ctx = {
            stores: { lift: {}, liftPart: {}, wall: {}, curtainwall: {}, door: {}, slab: {} },
        } as never;
        const verdict = handler.canExecute(ctx, payload as never);
        if (!verdict.valid) throw new Error('REFUSED: ' + verdict.reason);
        return handler.execute(ctx, payload as never).forward as readonly unknown[];
    }

    function liftPayload(extra: Rec = {}): Rec {
        const liftId = createId('lift') as unknown as string;
        return {
            liftId,
            levelId: LEVEL_ID,
            enclosureType: 'standalone-glass',
            origin: { x: 0, y: 0, z: 0 },
            servedLevels: [
                { levelId: LEVEL_ID, elevation: 0 },
                { levelId: 'L1', elevation: 3 },
            ],
            enclosureIds: [0, 1, 2, 3].map((i) => `enc-${liftId}-${i}`),
            landingDoorIds: [0, 1].map((i) => `door-${liftId}-${i}`),
            cabinPartIds: Array.from({ length: 5 }, (_, i) => `part-${liftId}-${i}`),
            ...extra,
        };
    }

    /** REAL handler → REAL bridge → THE mirror → the legacy curtain-wall record. */
    async function glazedSidesFor(extra: Rec = {}): Promise<Rec[]> {
        const payload = liftPayload(extra);
        const forward = await liftForward(payload);
        const evs = await emitThrough('lift.create', payload, forward, 'curtain-wall.created');
        const { curtainWallRecordFromCreatedEvent } = await import(
            '../src/engine/curtainWallCreatedMirror'
        );
        return evs
            .map((ev) => curtainWallRecordFromCreatedEvent(ev as never) as Rec | null)
            .filter((r): r is Rec => r !== null);
    }

    it('MECHANISM — a standalone-glass lift really does commit curtain-wall sides for this bridge to relay', async () => {
        const payload = liftPayload({ glassMaterialId: GLASS_ID });
        const forward = await liftForward(payload);
        const cwPatches = (forward as Array<{ path?: unknown[] }>).filter(
            (p) => Array.isArray(p.path) && String(p.path[0]) === 'curtainwall',
        );
        expect(cwPatches.length, 'no glazed side committed — the arm below would prove nothing').toBeGreaterThan(0);
        const liftPatch = (forward as Array<{ path?: unknown[]; value?: Rec }>).find(
            (p) => Array.isArray(p.path) && String(p.path[0]) === 'lift',
        );
        expect(
            liftPatch?.value?.['glassMaterialId'],
            'CreateLift.ts:449 spreads the authored id onto the lift record — the bridge reads it there',
        ).toBe(GLASS_ID);
    });

    it('ARM B1 — the AUTHORED glassMaterialId lands in CurtainWallData.glazingMaterialId', async () => {
        const sides = await glazedSidesFor({ glassMaterialId: GLASS_ID });
        expect(sides.length, 'a standalone-glass lift mirrors its glazed sides').toBeGreaterThan(0);
        for (const s of sides) {
            expect(
                s['glazingMaterialId'],
                'before §FIX-LIFT-CEB-GLAZING the mirror warned and dropped it — every glass lift glazed in the default',
            ).toBe(GLASS_ID);
        }
    });

    it('ARM B2 CONTROL — an UNSTATED glassMaterialId stays unstated (C100 §2.1, not the assembly\'s fallback)', async () => {
        const sides = await glazedSidesFor();
        expect(sides.length).toBeGreaterThan(0);
        for (const s of sides) {
            expect(
                'glazingMaterialId' in s,
                'relaying LiftAssembly\'s LIFT_GLASS_MATERIAL_ID would assert a library id the user never chose',
            ).toBe(false);
        }
    });
});

/* ══════════════════════════════════════════════════════════════════════════
 * ARM C — §REFUSE-SLAB-HOLES-AND-COLOUR (disposition (b): refused, ANNOUNCED)
 * ══════════════════════════════════════════════════════════════════════════ */
describe('§REFUSE-SLAB-HOLES-AND-COLOUR — the loss slab cannot carry is named at runtime', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    /** Run the REAL `CreateSlabHandler` so the holes are really COMMITTED. */
    async function commitSlab(payload: Rec): Promise<readonly unknown[]> {
        const { CreateSlabHandler } = await import('../../../plugins/slab/src/handlers/CreateSlab');
        const handler = new CreateSlabHandler();
        const ctx = { stores: { slab: {} } } as never;
        const verdict = handler.canExecute(ctx, payload as never);
        if (!verdict.valid) throw new Error('REFUSED: ' + verdict.reason);
        return handler.execute(ctx, payload as never).forward as readonly unknown[];
    }

    const RING = [
        { x: 0, y: 0, z: 0 },
        { x: 6, y: 0, z: 0 },
        { x: 6, y: 0, z: 4 },
        { x: 0, y: 0, z: 4 },
    ];
    const HOLE = [
        { x: 2, y: 0, z: 1 },
        { x: 3, y: 0, z: 1 },
        { x: 3, y: 0, z: 2 },
        { x: 2, y: 0, z: 2 },
    ];

    it('MECHANISM — the hole really is COMMITTED, so the silence being measured is the BRIDGE\'s', async () => {
        const id = createId('slab') as unknown as string;
        const forward = await commitSlab({
            id, levelId: LEVEL_ID, boundary: RING, holes: [HOLE], thickness: 0.25,
            materialColor: '#334455',
        });
        const committed = (forward as Array<{ value?: Rec }>)[0]?.value ?? {};
        expect((committed['holes'] as unknown[] | undefined)?.length,
            'CreateSlab.ts:176-178 commits holes — the void exists before the bridge sees it').toBe(1);
        expect(committed['materialColor']).toBe('#334455');
    });

    it('ARM C1 — the bridge ANNOUNCES both fields by name, with the consequence', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const id = createId('slab') as unknown as string;
        const payload: Rec = {
            id, levelId: LEVEL_ID, boundary: RING, holes: [HOLE], thickness: 0.25,
            materialColor: '#334455',
        };
        const forward = await commitSlab(payload);
        const evs = await emitThrough('slab.create', payload, forward, 'slab.created');
        expect(evs.length, 'the refusal must NOT suppress the emit — a solid slab beats no slab').toBe(1);

        const lines = warn.mock.calls.map((c) => String(c[0])).join('\n');
        expect(lines).toContain('§REFUSE-SLAB-HOLES-AND-COLOUR');
        expect(lines, 'name the field').toContain('holes');
        expect(lines, 'name the other field AND its value').toContain('#334455');
        expect(lines, 'name the visible consequence').toContain('renders SOLID');
        expect(lines, 'name the hop that is missing, so the next lane fixes the right file')
            .toContain('initTools.ts:2377-2392');
    });

    it('ARM C2 CONTROL — a plain slab is SILENT, so the announcement cannot become noise', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const id = createId('slab') as unknown as string;
        const payload: Rec = { id, levelId: LEVEL_ID, boundary: RING, thickness: 0.25 };
        const forward = await commitSlab(payload);
        await emitThrough('slab.create', payload, forward, 'slab.created');
        const lines = warn.mock.calls.map((c) => String(c[0])).join('\n');
        expect(lines).not.toContain('§REFUSE-SLAB-HOLES-AND-COLOUR');
    });
});
