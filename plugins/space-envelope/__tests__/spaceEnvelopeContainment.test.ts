// CONTAINMENT at the command seam — room ⊂ level is REFUSED with both numbers, on every
// geometry verb, and never clamped.
// §RESI-STAGE-G (2026-09-05) · STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §12 · C114 §12a / §14 ·
// C84 §6 · C03 §4.5–4.8 (undo).
//
// ✅ ESTABLISHES: against a REAL CommandBus + REAL store + REAL UndoStack, each of
//    create / move / moveFace / setFootprint / setParameter / setWithin refuses a room
//    that would leave its level (and a level that would strand a room) with the asked
//    number and the permitted number in the reason; a refusal writes NOTHING and mints
//    NO undo entry; the accepted edit is ONE entry and undo RESTORES it.
// ⛔ DOES NOT ESTABLISH: anything about the drawn prism, the drag gizmo, or persistence.

import { describe, expect, it } from 'vitest';
import {
    CommandBus,
    PatchEmitter,
    UndoStack,
    attachStores,
    type EventRecord,
} from '@pryzm/plugin-sdk';
import { SpaceEnvelopeStore, type SpaceEnvelopesState } from '../src/store.js';
import { buildSpaceEnvelopeHandlerSet } from '../src/handlers/index.js';

function buildEnv() {
    const spaceEnvelope = new SpaceEnvelopeStore();
    const stores = {
        spaceEnvelope: spaceEnvelope as unknown as import('@pryzm/stores').Store<object>,
    };
    const emitter = new PatchEmitter();
    const undoStack = new UndoStack({ maxSize: 50 });
    const bus = new CommandBus({
        audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
        emitter,
        undoStack,
        storesProvider: () => ({
            spaceEnvelope: Object.fromEntries(spaceEnvelope.getState()) as SpaceEnvelopesState,
        }),
    });
    for (const h of buildSpaceEnvelopeHandlerSet()) bus.register(h);
    attachStores(emitter, stores);
    return { spaceEnvelope, bus, undoStack };
}

function undoLast(s: SpaceEnvelopeStore, ev: EventRecord<unknown>): void {
    s.applyPatch([...ev.inverse].reverse());
}

// Crockford base32 — no I, L, O, U — so the suffixes are A / B / C like the round-trip suite.
const LEVEL = 'spaceEnvelope_01J0000000000000000000000A';
const ROOM = 'spaceEnvelope_01J0000000000000000000000B';
const ROOM2 = 'spaceEnvelope_01J0000000000000000000000C';

function box(id: string, x0: number, z0: number, w: number, d: number, extra: Record<string, unknown> = {}) {
    return {
        spaceEnvelopeId: id,
        levelId: 'level-1',
        footprint: [
            { x: x0, y: 0, z: z0 },
            { x: x0 + w, y: 0, z: z0 },
            { x: x0 + w, y: 0, z: z0 + d },
            { x: x0, y: 0, z: z0 + d },
        ],
        height: 3,
        ...extra,
    };
}

const level10 = () => box(LEVEL, 0, 0, 10, 10, { role: 'level', name: 'Ground' });
const kitchen = () => box(ROOM, 0, 0, 4, 4, { role: 'room', withinId: LEVEL, name: 'Kitchen' });

async function seed(env: ReturnType<typeof buildEnv>) {
    await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [level10(), kitchen()] });
    expect(env.undoStack.size).toBe(1);
}

describe('create — a room born outside its level is REFUSED (STR §12)', () => {
    it('⛔ refuses with the measured excursion, and writes nothing', async () => {
        const env = buildEnv();
        await expect(
            env.bus.executeCommand('spaceEnvelope.batch.create', {
                envelopes: [level10(), box(ROOM, 12, 0, 4, 4, { role: 'room', withinId: LEVEL, name: 'Far' })],
            }),
        ).rejects.toThrow(/'Far' would sit 6\.00 m outside 'Ground' in plan .* asks for 6\.00 m; the limit is 0\.00 m/);
        // A refusal is not a partial write: NEITHER the level nor the room landed.
        expect(env.spaceEnvelope.ids()).toHaveLength(0);
        expect(env.undoStack.size).toBe(0);
    });

    it('accepts a room inside a level minted in the SAME batch', async () => {
        const env = buildEnv();
        await seed(env);
        expect(env.spaceEnvelope.get(ROOM)!.withinId).toBe(LEVEL);
    });

    it('a room naming NO level is not gated (there is nothing to be inside)', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [box(ROOM, 100, 100, 4, 4, { role: 'room' })],
        });
        expect(env.spaceEnvelope.ids()).toHaveLength(1);
    });
});

describe('move — translating a room out of its level is REFUSED, never clamped', () => {
    it('⛔ refuses with both numbers; the record and the undo stack are untouched', async () => {
        const env = buildEnv();
        await seed(env);
        const before = JSON.stringify(env.spaceEnvelope.get(ROOM));
        await expect(
            env.bus.executeCommand('spaceEnvelope.move', { spaceEnvelopeId: ROOM, delta: { x: 8, z: 0 } }),
        ).rejects.toThrow(/'Kitchen' would sit 2\.00 m outside 'Ground'.*asks for 2\.00 m; the limit is 0\.00 m/);
        expect(JSON.stringify(env.spaceEnvelope.get(ROOM))).toBe(before);
        expect(env.undoStack.size).toBe(1);
    });

    it('a move that stays inside lands as ONE undo entry and undo restores it', async () => {
        const env = buildEnv();
        await seed(env);
        const before = JSON.parse(JSON.stringify(env.spaceEnvelope.get(ROOM)));
        const ev = await env.bus.executeCommand('spaceEnvelope.move', { spaceEnvelopeId: ROOM, delta: { x: 6, z: 6 } });
        expect(env.undoStack.size).toBe(2);
        expect(env.spaceEnvelope.get(ROOM)!.footprint[0]!.x).toBeCloseTo(6, 9);
        undoLast(env.spaceEnvelope, ev);
        expect(JSON.parse(JSON.stringify(env.spaceEnvelope.get(ROOM)))).toEqual(before);
    });

    it('⛔ translating the LEVEL off its room refuses, naming the room', async () => {
        const env = buildEnv();
        await seed(env);
        await expect(
            env.bus.executeCommand('spaceEnvelope.move', { spaceEnvelopeId: LEVEL, delta: { x: 7, z: 0 } }),
        ).rejects.toThrow(/'Kitchen' would be left 7\.00 m outside 'Ground'/);
        expect(env.spaceEnvelope.get(LEVEL)!.footprint[0]!.x).toBe(0);
    });
});

describe('moveFace — the founder’s face drag stays inside the level', () => {
    it('⛔ a room face pushed past the level refuses with the asked AND the permitted delta', async () => {
        const env = buildEnv();
        await seed(env);
        await expect(
            env.bus.executeCommand('spaceEnvelope.moveFace', {
                spaceEnvelopeId: ROOM, face: { kind: 'side', edgeIndex: 1 }, deltaM: 8,
            }),
        ).rejects.toThrow(/asks for 8\.00 m; the limit is 6\.0[01] m/);
        expect(env.spaceEnvelope.get(ROOM)!.footprintAreaM2).toBeCloseTo(16, 9);
        expect(env.undoStack.size).toBe(1);
    });

    it('a room face moved to the level bound exactly is accepted', async () => {
        const env = buildEnv();
        await seed(env);
        await env.bus.executeCommand('spaceEnvelope.moveFace', {
            spaceEnvelopeId: ROOM, face: { kind: 'side', edgeIndex: 1 }, deltaM: 6,
        });
        expect(env.spaceEnvelope.get(ROOM)!.footprintAreaM2).toBeCloseTo(40, 6);
    });

    it('⛔ a LEVEL face pulled through a room refuses the same way, naming the room', async () => {
        const env = buildEnv();
        await seed(env);
        // Level face #3 is x = 0 (edge (0,10)→(0,0)), outward -x; -2 pushes it to x = 2, through the Kitchen.
        await expect(
            env.bus.executeCommand('spaceEnvelope.moveFace', {
                spaceEnvelopeId: LEVEL, face: { kind: 'side', edgeIndex: 3 }, deltaM: -2,
            }),
        ).rejects.toThrow(/would leave 'Kitchen' 2\.00 m outside it.*asks for -2\.00 m; the limit is/);
        expect(env.spaceEnvelope.get(LEVEL)!.footprintAreaM2).toBeCloseTo(100, 9);
    });

    it('⛔ the room’s top face may not rise above the level', async () => {
        const env = buildEnv();
        await seed(env);
        await expect(
            env.bus.executeCommand('spaceEnvelope.moveFace', {
                spaceEnvelopeId: ROOM, face: { kind: 'top' }, deltaM: 0.5,
            }),
        ).rejects.toThrow(/room-leaves-level|outside the level envelope/);
    });
});

describe('setFootprint / setParameter / setWithin — the same gate', () => {
    it('⛔ setFootprint (the profile editor’s commit) refuses a ring that leaves the level', async () => {
        const env = buildEnv();
        await seed(env);
        await expect(
            env.bus.executeCommand('spaceEnvelope.setFootprint', {
                spaceEnvelopeId: ROOM,
                footprint: [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 4 }, { x: 0, z: 4 }],
            }),
        ).rejects.toThrow(/'Kitchen' would sit 4\.00 m outside 'Ground'/);
        expect(env.spaceEnvelope.get(ROOM)!.footprintAreaM2).toBeCloseTo(16, 9);
    });

    it('⛔ setFootprint on the LEVEL re-checks every room within it', async () => {
        const env = buildEnv();
        await seed(env);
        await expect(
            env.bus.executeCommand('spaceEnvelope.setFootprint', {
                spaceEnvelopeId: LEVEL,
                footprint: [{ x: 2, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 2, z: 10 }],
            }),
        ).rejects.toThrow(/'Kitchen' would be left 2\.00 m outside 'Ground'/);
    });

    it('⛔ setParameter height refuses a room taller than its level; name changes are not gated', async () => {
        const env = buildEnv();
        await seed(env);
        await expect(
            env.bus.executeCommand('spaceEnvelope.setParameter', { spaceEnvelopeId: ROOM, height: 4 }),
        ).rejects.toThrow(/1\.00 m outside 'Ground'/);
        await env.bus.executeCommand('spaceEnvelope.setParameter', { spaceEnvelopeId: ROOM, name: 'Cocina' });
        expect(env.spaceEnvelope.get(ROOM)!.name).toBe('Cocina');
    });

    it('⛔ setWithin refuses to declare a room within a level it sticks out of', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [level10(), box(ROOM2, 100, 100, 4, 4, { role: 'room', name: 'Loose' })],
        });
        await expect(
            env.bus.executeCommand('spaceEnvelope.setWithin', { spaceEnvelopeId: ROOM2, withinId: LEVEL }),
        // ⭐ 132.94 m is MEASURED, not derived: the excursion is
        // `checkEnvelopeContainment(...).worstExcursionM` — the EUCLIDEAN distance from the
        // worst room vertex (104, 104) to the level ring's nearest point (10, 10),
        // 94·√2 = 132.94 — because C84 EI-9.2 forbids a second containment test and that
        // shared authority answers in distance, not in per-axis overhang. This assertion
        // read `94.00` (the per-axis figure) when it was written and FAILED; the number was
        // corrected to what the geometry reports, never the geometry to the number.
        ).rejects.toThrow(/'Loose' would sit 132\.94 m outside 'Ground'/);
        expect(env.spaceEnvelope.get(ROOM2)!.withinId).toBeNull();
    });

    it('setWithin accepts a room that IS inside, and clearing membership is always fine', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [level10(), box(ROOM2, 1, 1, 4, 4, { role: 'room', name: 'Inside' })],
        });
        await env.bus.executeCommand('spaceEnvelope.setWithin', { spaceEnvelopeId: ROOM2, withinId: LEVEL });
        expect(env.spaceEnvelope.get(ROOM2)!.withinId).toBe(LEVEL);
        await env.bus.executeCommand('spaceEnvelope.setWithin', { spaceEnvelopeId: ROOM2, withinId: null });
        expect(env.spaceEnvelope.get(ROOM2)!.withinId).toBeNull();
    });
});
