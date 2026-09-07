// The space-envelope round-trip — create / delete / move / serialise, ONE gesture ONE undo.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §11 items 4 & 5 · C16 §8.6 B-6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE ESTABLISHES, AND WHAT IT DELIBERATELY DOES NOT
// ═══════════════════════════════════════════════════════════════════════════════
//
// ✅ ESTABLISHES: the verbs dispatch through a REAL `CommandBus` against a REAL
//    `SpaceEnvelopeStore` with a REAL `UndoStack`; a batch of N is ONE undo entry;
//    undo RESTORES rather than recomputes; the record survives a JSON round-trip with
//    every field intact; and the refusals refuse.
//
// ⛔ DOES NOT ESTABLISH: that the family is reachable from the COMPOSED runtime, that
//    it persists into a project snapshot, or that anything draws it. Those need
//    `PluginRegistry` / `PLUGIN_CATALOG` / a `StoresSlot` key and a renderer, and
//    C114 §14a forbids reporting one as the other. The store-vs-slot distinction is
//    not pedantry: the balcony family read `persisted` for four days while every
//    balcony was destroyed on reload (L-11530).

import { describe, expect, it } from 'vitest';
import {
    CommandBus,
    PatchEmitter,
    UndoStack,
    attachStores,
    type EventRecord,
} from '@pryzm/plugin-sdk';
import { SpaceEnvelopeStore, type SpaceEnvelopeData, type SpaceEnvelopesState } from '../src/store.js';
import { buildSpaceEnvelopeHandlerSet, SPACE_ENVELOPE_HANDLER_TYPES } from '../src/handlers/index.js';

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
    const detach = attachStores(emitter, stores);
    return { spaceEnvelope, bus, undoStack, detach };
}

function undoLast(s: SpaceEnvelopeStore, ev: EventRecord<unknown>): void {
    s.applyPatch([...ev.inverse].reverse());
}

const ULID_A = 'spaceEnvelope_01J0000000000000000000000A';
const ULID_B = 'spaceEnvelope_01J0000000000000000000000B';
const ULID_C = 'spaceEnvelope_01J0000000000000000000000C';

function squareSpec(id: string, x0 = 0, z0 = 0) {
    return {
        spaceEnvelopeId: id,
        levelId: 'level-1',
        footprint: [
            { x: x0, y: 0, z: z0 },
            { x: x0 + 4, y: 0, z: z0 },
            { x: x0 + 4, y: 0, z: z0 + 4 },
            { x: x0, y: 0, z: z0 + 4 },
        ],
        height: 3,
    };
}

describe('registration', () => {
    it('registers the whole declared roster', () => {
        expect(buildSpaceEnvelopeHandlerSet()).toHaveLength(SPACE_ENVELOPE_HANDLER_TYPES.length);
    });

    it('⛔ exposes NO singular spaceEnvelope.create (C114 §6a)', () => {
        expect(SPACE_ENVELOPE_HANDLER_TYPES).not.toContain('spaceEnvelope.create' as never);
        expect(SPACE_ENVELOPE_HANDLER_TYPES).toContain('spaceEnvelope.batch.create');
    });
});

describe('create', () => {
    it('creates an envelope and derives its metrics', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [squareSpec(ULID_A)],
        });
        const rec = env.spaceEnvelope.get(ULID_A)!;
        expect(rec.type).toBe('spaceEnvelope');
        expect(rec.role).toBe('room');
        expect(rec.footprintAreaM2).toBeCloseTo(16, 9);
        expect(rec.volumeM3).toBeCloseTo(48, 9);
        // ⭐ The honesty literal travels with the record.
        expect(rec.standing).toBe('design-intent');
    });

    it('⭐ RECOMPUTES area rather than believing the payload', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            // A caller claiming a wildly wrong area for their own polygon.
            envelopes: [{ ...squareSpec(ULID_A), footprintAreaM2: 9999, volumeM3: 9999 }],
        });
        expect(env.spaceEnvelope.get(ULID_A)!.footprintAreaM2).toBeCloseTo(16, 9);
    });

    it('⛔ REFUSES role: maximumBuildable with the schema’s own sentence (C114 §6b)', async () => {
        const env = buildEnv();
        await expect(
            env.bus.executeCommand('spaceEnvelope.batch.create', {
                envelopes: [{ ...squareSpec(ULID_A), role: 'maximumBuildable' }],
            }),
        ).rejects.toThrow(/SOLVED from the zoning rules, not drawn/);
        expect(env.spaceEnvelope.ids()).toHaveLength(0);
    });

    it('refuses a duplicate id and an envelope with no level', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [squareSpec(ULID_A)] });
        await expect(
            env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [squareSpec(ULID_A)] }),
        ).rejects.toThrow(/duplicate/);
        await expect(
            env.bus.executeCommand('spaceEnvelope.batch.create', {
                envelopes: [{ ...squareSpec(ULID_B), levelId: '' }],
            }),
        ).rejects.toThrow(/levelId is required/);
    });
});

describe('⭐ ONE GESTURE = ONE UNDO — asserted on the STACK DEPTH, not the final state', () => {
    it('three envelopes in one batch make ONE undo entry', async () => {
        const env = buildEnv();
        expect(env.undoStack.size).toBe(0);
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [squareSpec(ULID_A, 0, 0), squareSpec(ULID_B, 10, 0), squareSpec(ULID_C, 20, 0)],
        });
        expect(env.spaceEnvelope.ids()).toHaveLength(3);
        // ⭐ THE ASSERTION THAT MATTERS. A final-state check passes just as happily with
        // three entries; only the DEPTH distinguishes one gesture from three.
        expect(env.undoStack.size).toBe(1);
    });

    it('one undo removes all three', async () => {
        const env = buildEnv();
        const ev = await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [squareSpec(ULID_A, 0, 0), squareSpec(ULID_B, 10, 0), squareSpec(ULID_C, 20, 0)],
        });
        undoLast(env.spaceEnvelope, ev);
        expect(env.spaceEnvelope.ids()).toHaveLength(0);
    });

    it('each subsequent gesture adds exactly one entry', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [squareSpec(ULID_A)] });
        expect(env.undoStack.size).toBe(1);
        await env.bus.executeCommand('spaceEnvelope.move', {
            spaceEnvelopeId: ULID_A, delta: { x: 5, z: 5 },
        });
        expect(env.undoStack.size).toBe(2);
        await env.bus.executeCommand('spaceEnvelope.setParameter', {
            spaceEnvelopeId: ULID_A, height: 4,
        });
        expect(env.undoStack.size).toBe(3);
    });
});

describe('move', () => {
    it('translates the ring and keeps y === 0', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [squareSpec(ULID_A)] });
        await env.bus.executeCommand('spaceEnvelope.move', {
            spaceEnvelopeId: ULID_A, delta: { x: 3, z: -2 },
        });
        const rec = env.spaceEnvelope.get(ULID_A)!;
        expect(rec.footprint[0]!.x).toBeCloseTo(3, 9);
        expect(rec.footprint[0]!.z).toBeCloseTo(-2, 9);
        expect(rec.footprint.every((p) => p.y === 0)).toBe(true);
        // Area is invariant under translation — a cheap check that the cache tracks.
        expect(rec.footprintAreaM2).toBeCloseTo(16, 9);
    });

    it('⭐ the vertical component goes to baseOffset, never into the ring', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [squareSpec(ULID_A)] });
        await env.bus.executeCommand('spaceEnvelope.move', {
            spaceEnvelopeId: ULID_A, delta: { x: 0, y: 2.5, z: 0 },
        });
        const rec = env.spaceEnvelope.get(ULID_A)!;
        expect(rec.baseOffset).toBeCloseTo(2.5, 9);
        expect(rec.footprint.every((p) => p.y === 0)).toBe(true);
    });

    it('⭐ undo RESTORES the previous geometry — it does not recompute it (EI-7e)', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [squareSpec(ULID_A)] });
        const before = JSON.parse(JSON.stringify(env.spaceEnvelope.get(ULID_A)));
        const ev = await env.bus.executeCommand('spaceEnvelope.move', {
            spaceEnvelopeId: ULID_A, delta: { x: 7, z: 11 },
        });
        undoLast(env.spaceEnvelope, ev);
        expect(JSON.parse(JSON.stringify(env.spaceEnvelope.get(ULID_A)))).toEqual(before);
    });
});

describe('moveFace — the founder’s face drag, at the command seam', () => {
    it('grows the footprint and the neighbours follow', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [squareSpec(ULID_A)] });
        await env.bus.executeCommand('spaceEnvelope.moveFace', {
            spaceEnvelopeId: ULID_A, face: { kind: 'side', edgeIndex: 0 }, deltaM: 1,
        });
        expect(env.spaceEnvelope.get(ULID_A)!.footprintAreaM2).toBeCloseTo(20, 6);
    });

    it('⛔ REFUSES a move that collapses the solid, and the reason carries BOTH numbers', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', { envelopes: [squareSpec(ULID_A)] });
        await expect(
            env.bus.executeCommand('spaceEnvelope.moveFace', {
                spaceEnvelopeId: ULID_A, face: { kind: 'top' }, deltaM: -3,
            }),
        ).rejects.toThrow(/asks for .* the limit is /);
        // And the record is untouched — a refusal is not a partial write.
        expect(env.spaceEnvelope.get(ULID_A)!.height).toBeCloseTo(3, 9);
    });
});

describe('delete — a reference, not ownership (C114 §8)', () => {
    it('⭐ deleting a level envelope does NOT delete the rooms within it', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...squareSpec(ULID_A, 0, 0), role: 'level' },
                { ...squareSpec(ULID_B, 0, 0), role: 'room', withinId: ULID_A },
            ],
        });
        await env.bus.executeCommand('spaceEnvelope.delete', { spaceEnvelopeId: ULID_A });
        expect(env.spaceEnvelope.get(ULID_A)).toBeUndefined();
        const child = env.spaceEnvelope.get(ULID_B);
        expect(child).toBeDefined();
        // The dangling reference is cleared rather than left pointing at a ghost.
        expect(child!.withinId).toBeNull();
    });

    it('one undo restores BOTH the parent and the child’s reference', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...squareSpec(ULID_A, 0, 0), role: 'level' },
                { ...squareSpec(ULID_B, 0, 0), role: 'room', withinId: ULID_A },
            ],
        });
        const ev = await env.bus.executeCommand('spaceEnvelope.delete', { spaceEnvelopeId: ULID_A });
        undoLast(env.spaceEnvelope, ev);
        expect(env.spaceEnvelope.get(ULID_A)).toBeDefined();
        expect(env.spaceEnvelope.get(ULID_B)!.withinId).toBe(ULID_A);
    });
});

describe('setWithin', () => {
    it('⛔ refuses to give a LEVEL envelope a container (ADR-0380 D2)', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...squareSpec(ULID_A, 0, 0), role: 'level' },
                { ...squareSpec(ULID_B, 0, 0), role: 'level' },
            ],
        });
        await expect(
            env.bus.executeCommand('spaceEnvelope.setWithin', {
                spaceEnvelopeId: ULID_A, withinId: ULID_B,
            }),
        ).rejects.toThrow(/LEVEL envelope has no containing envelope/);
    });

    it('⛔ REFUSES to declare a room within a level it sticks out of — §RESI-STAGE-G reverses the old ADVISORY row', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...squareSpec(ULID_A, 0, 0), role: 'level' },
                // Far outside the level envelope's 4x4 footprint.
                { ...squareSpec(ULID_B, 100, 100), role: 'room' },
            ],
        });
        // STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §12: a room "stays constrained within the
        // level envelope". This case used to be ACCEPTED as advisory (C114 §12); it is now
        // refused with the measured excursion, and C114 §14 records the supersession.
        await expect(
            env.bus.executeCommand('spaceEnvelope.setWithin', {
                spaceEnvelopeId: ULID_B, withinId: ULID_A,
            }),
        // 141.42 m = 100·√2, the Euclidean distance from the room's worst vertex
        // (104, 104) to the 4 m level ring's corner (4, 4). MEASURED from the shared
        // `checkEnvelopeContainment` authority (C84 EI-9.2), not a per-axis overhang.
        ).rejects.toThrow(/outside .* asks for 141\.42 m; the limit is 0\.00 m/);
        expect(env.spaceEnvelope.get(ULID_B)!.withinId).toBeNull();
    });
});

describe('serialisation round-trip (C114 §11 item 5)', () => {
    it('⭐ every field survives JSON out and back, byte-identical', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [{
                ...squareSpec(ULID_A),
                role: 'level',
                name: 'Ground storey envelope',
                occupancy: 'residential',
                materialColor: '#6600FF',
                baseOffset: 1.5,
            }],
        });
        const original = env.spaceEnvelope.get(ULID_A)!;
        const revived = JSON.parse(JSON.stringify(original)) as SpaceEnvelopeData;
        expect(revived).toEqual(original);

        // ⭐ AND THE REVIVED RECORD IS STILL SCHEMA-VALID. A round-trip that produced
        // something the schema would reject is a round-trip that only looks lossless.
        const { SpaceEnvelope } = await import('@pryzm/plugin-sdk');
        expect(SpaceEnvelope.safeParse(revived).success).toBe(true);

        // Named-field sweep — a deep-equal alone would pass if BOTH sides lost a field.
        for (const key of [
            'id', 'type', 'levelId', 'name', 'role', 'footprint', 'baseOffset', 'height',
            'withinId', 'occupancy', 'standing', 'basis', 'footprintAreaM2', 'volumeM3',
            'materialColor', 'provenance', 'confidence',
        ]) {
            expect(revived).toHaveProperty(key);
        }
        expect(revived.standing).toBe('design-intent');
        expect(revived.role).toBe('level');
        expect(revived.baseOffset).toBeCloseTo(1.5, 9);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §KEEPING-A-MASSING-OPTION-ACCUMULATES-INSTEAD-OF-REPLACING (L-13038, 2026-09-07)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Founder: *"WHEN I SELECT ANOTHER MASSING OPTION THE PREVIOUS ONE SHALL BE REMOVED."*
//
// ⭐ THE ARM THAT MATTERS IS THE UNDO **DEPTH**, NOT THE FINAL STATE. A delete followed by
// a create leaves exactly the same store as a supersede — and costs the user TWO Ctrl+Z,
// with a torn empty-storey state in between. `batchCoordinator.runBatch` is undo-NEUTRAL
// (C114 §6a), so the only way to buy one entry is one `produceCommand`, and only a
// depth assertion can tell the two implementations apart.

describe('batch.create supersedes — replacing a massing option is ONE undo', () => {
    it('⭐ replaces the previous envelope and spends exactly ONE undo entry', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [{ ...squareSpec(ULID_A), role: 'level' }],
        });
        expect(env.undoStack.size).toBe(1);

        const ev = await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [{ ...squareSpec(ULID_B, 0, 0), role: 'level' }],
            supersedes: [ULID_A],
        });
        // One gesture, one ring entry — NOT two (delete + create).
        expect(env.undoStack.size).toBe(2);
        expect(env.spaceEnvelope.get(ULID_A)).toBeUndefined();
        expect(env.spaceEnvelope.get(ULID_B)).toBeDefined();

        // …and ONE undo brings the previous one back, with the new one gone.
        undoLast(env.spaceEnvelope, ev);
        expect(env.spaceEnvelope.get(ULID_A)).toBeDefined();
        expect(env.spaceEnvelope.get(ULID_B)).toBeUndefined();
    });

    it('⭐ heals an ACCUMULATED storey — three rivals go in one gesture', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...squareSpec(ULID_A), role: 'level' },
                { ...squareSpec(ULID_B), role: 'level' },
            ],
        });
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [{ ...squareSpec(ULID_C), role: 'level' }],
            supersedes: [ULID_A, ULID_B],
        });
        expect(env.spaceEnvelope.byLevel('level-1').map((e) => e.id)).toEqual([ULID_C]);
    });

    it('⛔ a superseded LEVEL does not cascade to its rooms — withinId is CLEARED (C114 §8)', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...squareSpec(ULID_A), role: 'level' },
                { ...squareSpec(ULID_B), role: 'room', withinId: ULID_A },
            ],
        });
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [{ ...squareSpec(ULID_C), role: 'level' }],
            supersedes: [ULID_A],
        });
        // The room SURVIVES its level being replaced — an architect's layout is not collateral.
        expect(env.spaceEnvelope.get(ULID_B)).toBeDefined();
        expect(env.spaceEnvelope.get(ULID_B)!.withinId).toBeNull();
    });

    it('⛔ REFUSES a supersede id that is not in the store — never a silent skip', async () => {
        const env = buildEnv();
        await expect(
            env.bus.executeCommand('spaceEnvelope.batch.create', {
                envelopes: [{ ...squareSpec(ULID_A), role: 'level' }],
                supersedes: ['spaceEnvelope_01J000000000000000000000ZZ'],
            }),
        ).rejects.toThrow(/no such space envelope to supersede/);
        // Nothing was created: a refusal is not a partial write.
        expect(env.spaceEnvelope.ids()).toHaveLength(0);
    });

    it('⛔ REFUSES a batch that supersedes an id it is also creating', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [{ ...squareSpec(ULID_A), role: 'level' }],
        });
        await expect(
            env.bus.executeCommand('spaceEnvelope.batch.create', {
                envelopes: [{ ...squareSpec(ULID_B), role: 'level' }],
                supersedes: [ULID_B],
            }),
        ).rejects.toThrow(/cannot supersede an envelope it is also creating|no such space envelope/);
    });

    it('carries the caller PROVENANCE onto the record — the stamp that makes replacement safe', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [{
                ...squareSpec(ULID_A),
                role: 'level',
                provenance: { origin: 'computed', detail: 'fitted by the massing solver' },
            }],
        });
        expect(env.spaceEnvelope.get(ULID_A)!.provenance).toEqual({
            origin: 'computed', detail: 'fitted by the massing solver',
        });
    });

    it('⛔ a caller that says NOTHING gets the schema default, never an invented origin', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [{ ...squareSpec(ULID_A), role: 'level' }],
        });
        const p = env.spaceEnvelope.get(ULID_A)!.provenance;
        expect(p.origin).toBeNull();
        expect(p.unknownReason).toBe('predates-provenance');
    });
});
