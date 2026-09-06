// THE PROFILE-EDIT WRITE-BACK, end to end at the MODEL layer — the authoring frame the
// dialog draws in, mapped back, dispatched as `spaceEnvelope.setFootprint`, against a REAL
// CommandBus + REAL store + REAL UndoStack.
// §RESI-STAGE-G (2026-09-06) · C114 §10b / §11 item 7 / §12 / §14 ·
// STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §12 · C03 §4.5–4.8 (undo) · C84 §6.
//
// ✅ ESTABLISHES: a ring authored in the surface's `u`/`v` frame lands in the store as the
//    EXACT world footprint the author drew; one Apply is ONE undo entry and Ctrl+Z restores
//    the previous ring; a room ring dragged out of its level is REFUSED with both numbers and
//    writes nothing; a LEVEL footprint edit that would strand a room is refused the same way
//    (the founder's *"rooms re-check containment after a level edit"*).
// ⛔ DOES NOT ESTABLISH: that the dialog opens, that the button appears, or anything drawn.
//    The DIALOG half is `apps/editor/src/engine/__tests__/spaceEnvelopeProfileEditTool.spec.ts`,
//    and neither file is browser evidence (C114 §14a / §0.2).

import { describe, expect, it } from 'vitest';
import {
    CommandBus,
    PatchEmitter,
    UndoStack,
    attachStores,
    type EventRecord,
} from '@pryzm/plugin-sdk';
import {
    footprintFromProfileRing,
    isProfileFrameRefusal,
    spaceEnvelopeProfileFrame,
    type SpaceEnvelopeProfileFrame,
} from '@pryzm/geometry-space-envelope';
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

const LEVEL = 'spaceEnvelope_01J0000000000000000000000A';
const ROOM = 'spaceEnvelope_01J0000000000000000000000B';

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

async function seed(env: ReturnType<typeof buildEnv>) {
    await env.bus.executeCommand('spaceEnvelope.batch.create', {
        envelopes: [
            box(LEVEL, 0, 0, 10, 10, { role: 'level', name: 'Ground' }),
            box(ROOM, 1, 1, 4, 4, { role: 'room', withinId: LEVEL, name: 'Kitchen' }),
        ],
    });
    expect(env.undoStack.size).toBe(1);
}

/** The frame the dialog would be opened in, for the record currently in the store. */
function frameFor(env: ReturnType<typeof buildEnv>, id: string): SpaceEnvelopeProfileFrame {
    const rec = env.spaceEnvelope.get(id)!;
    const f = spaceEnvelopeProfileFrame(rec.footprint);
    if (isProfileFrameRefusal(f)) throw new Error(`no frame for ${id}: ${f.message}`);
    return f;
}

/** What the tool does on Apply: ring (frame metres) → world footprint → the ONE command. */
function applyRing(
    env: ReturnType<typeof buildEnv>,
    id: string,
    frame: SpaceEnvelopeProfileFrame,
    ring: readonly { u: number; v: number }[],
): Promise<unknown> {
    const footprint = footprintFromProfileRing(frame, ring).map((p) => ({ x: p.x, z: p.z }));
    return env.bus.executeCommand('spaceEnvelope.setFootprint', { spaceEnvelopeId: id, footprint }) as Promise<unknown>;
}

describe('the profile editor’s commit path — the ring the author drew is the ring the store holds', () => {
    it('an UNEDITED ring is a round trip: the same footprint, to 12 decimal places', async () => {
        const env = buildEnv();
        await seed(env);
        const before = env.spaceEnvelope.get(ROOM)!.footprint.map((p) => ({ x: p.x, z: p.z }));
        const frame = frameFor(env, ROOM);
        await applyRing(env, ROOM, frame, frame.ring);
        const after = env.spaceEnvelope.get(ROOM)!.footprint;
        after.forEach((p, i) => {
            expect(p.x).toBeCloseTo(before[i]!.x, 12);
            expect(p.z).toBeCloseTo(before[i]!.z, 12);
        });
    });

    it('⭐ an EDITED vertex lands at the world position it was dragged to — and costs ONE Ctrl+Z', async () => {
        const env = buildEnv();
        await seed(env);
        const frame = frameFor(env, ROOM);
        // Pull the room's east edge (world x = 5) out by 1.5 m; v untouched.
        const edited = frame.ring.map((p, i) => (i === 1 || i === 2 ? { u: p.u + 1.5, v: p.v } : p));
        const ev = (await applyRing(env, ROOM, frame, edited)) as EventRecord<unknown>;

        const fp = env.spaceEnvelope.get(ROOM)!.footprint;
        expect(fp[1]!.x).toBeCloseTo(6.5, 12);
        expect(fp[2]!.x).toBeCloseTo(6.5, 12);
        expect(fp[0]!.x).toBeCloseTo(1, 12);
        // 5.5 × 4 — the DERIVED metric is re-written by the one authority, not left stale.
        expect(env.spaceEnvelope.get(ROOM)!.footprintAreaM2).toBeCloseTo(22, 9);

        // ⭐ ONE gesture, ONE entry: the create above, plus this edit. Not two, not three.
        expect(env.undoStack.size).toBe(2);
        undoLast(env.spaceEnvelope, ev);
        const undone = env.spaceEnvelope.get(ROOM)!;
        expect(undone.footprint[1]!.x).toBeCloseTo(5, 12);
        expect(undone.footprintAreaM2).toBeCloseTo(16, 9);
    });

    it('⛔ a ring dragged OUT of its level is REFUSED with both numbers, and nothing is written', async () => {
        const env = buildEnv();
        await seed(env);
        const frame = frameFor(env, ROOM);
        // 7 m outward: the room's east edge would reach x = 12, and the level ends at 10.
        const edited = frame.ring.map((p, i) => (i === 1 || i === 2 ? { u: p.u + 7, v: p.v } : p));
        await expect(applyRing(env, ROOM, frame, edited))
            .rejects.toThrow(/'Kitchen' would sit 2\.00 m outside 'Ground'.*asks for 2\.00 m; the limit is 0\.00 m/);
        // NEVER CLAMPED: the record is untouched, not moved back to the bound.
        expect(env.spaceEnvelope.get(ROOM)!.footprint[1]!.x).toBeCloseTo(5, 12);
        expect(env.spaceEnvelope.get(ROOM)!.footprintAreaM2).toBeCloseTo(16, 9);
        expect(env.undoStack.size).toBe(1);
    });

    it('⭐ a LEVEL footprint edit re-checks its rooms — the founder’s §12, at the editor’s commit', async () => {
        const env = buildEnv();
        await seed(env);
        const frame = frameFor(env, LEVEL);
        // Pull the level's WEST edge (world x = 0) in to x = 3; the kitchen starts at x = 1.
        const edited = frame.ring.map((p, i) => (i === 0 || i === 3 ? { u: p.u + 3, v: p.v } : p));
        await expect(applyRing(env, LEVEL, frame, edited))
            .rejects.toThrow(/'Kitchen' would be left 2\.00 m outside 'Ground'/);
        expect(env.spaceEnvelope.get(LEVEL)!.footprint[0]!.x).toBeCloseTo(0, 12);
        expect(env.undoStack.size).toBe(1);
    });

    it('a LEVEL edit that keeps every room inside is accepted, and the rooms are untouched', async () => {
        const env = buildEnv();
        await seed(env);
        const frame = frameFor(env, LEVEL);
        // Grow the level east by 4 m — no room is stranded by growing.
        const edited = frame.ring.map((p, i) => (i === 1 || i === 2 ? { u: p.u + 4, v: p.v } : p));
        await applyRing(env, LEVEL, frame, edited);
        expect(env.spaceEnvelope.get(LEVEL)!.footprintAreaM2).toBeCloseTo(140, 9);
        // ⛔ The level edit did NOT drag its rooms with it — containment is a constraint,
        // not a parenting relationship (C114 §8: `withinId` is a REFERENCE, not ownership).
        expect(env.spaceEnvelope.get(ROOM)!.footprintAreaM2).toBeCloseTo(16, 9);
        expect(env.undoStack.size).toBe(2);
    });
});
