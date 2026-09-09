// MASSING GROUPS through the REAL create path — ADR-0383 D1/D2/D3 · C114 §6d clause 6 / §6e.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS FILE EXISTS AT THIS EXACT PATH
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `packages/schemas/src/elements/SpaceEnvelope.ts`'s `SpaceEnvelopeGroupSchema` doc names the cost
// of denormalising `label` across a group's members, and closes it with three things — the second
// of which is, verbatim: *"A test asserts every `group.id` in a store resolves to exactly one
// distinct `label` (`spaceEnvelopeGroups.test.ts`)"*. That file did not exist when the schema
// shipped. A contract clause whose enforcing test is named but absent is [[authored-but-unwired]]
// with a citation attached, so the file is created HERE, under the name the schema already cites,
// rather than under a new one that would leave the citation dangling.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE LIMIT OF THIS FILE, STATED BEFORE ITS FIRST ASSERTION
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ✅ ESTABLISHES: `group` survives the REAL `CommandBus` → `CreateSpaceEnvelopeBatchHandler` →
//    `SpaceEnvelopeStore` path and a JSON round-trip; two groups coexist on ONE storey; a malformed
//    group is REFUSED by the schema rather than coerced to the ungrouped bucket; a group of N
//    storeys is still ONE undo entry.
// ⛔ DOES NOT ESTABLISH: that any surface can produce a multi-group store (that is S3, and the
//    planner's own suite), that groups persist into a project snapshot, or that anything draws
//    them. C114 §14a forbids reporting one as the other, and the balcony family read `persisted`
//    for four days while every balcony was destroyed on reload (L-11530).

import { describe, expect, it } from 'vitest';
import {
    CommandBus,
    PatchEmitter,
    UndoStack,
    attachStores,
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
    const detach = attachStores(emitter, stores);
    return { spaceEnvelope, bus, undoStack, detach };
}

const A1 = 'spaceEnvelope_01J00000000000000000000A01';
const A2 = 'spaceEnvelope_01J00000000000000000000A02';
const B1 = 'spaceEnvelope_01J00000000000000000000B01';
const U1 = 'spaceEnvelope_01J00000000000000000000G01';

const BLOCK_A = { id: 'mg_blockA', label: 'Block A' } as const;
const BLOCK_B = { id: 'mg_blockB', label: 'Block B' } as const;

/** A square of side 4 at (x0, z0) on `levelId`, seated on that storey. */
function square(id: string, levelId: string, x0 = 0, z0 = 0) {
    return {
        spaceEnvelopeId: id,
        levelId,
        role: 'level' as const,
        footprint: [
            { x: x0, y: 0, z: z0 },
            { x: x0 + 4, y: 0, z: z0 },
            { x: x0 + 4, y: 0, z: z0 + 4 },
            { x: x0, y: 0, z: z0 + 4 },
        ],
        height: 3,
    };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('group reaches the record through the real create path', () => {
    it('⭐ a grouped create ROUND-TRIPS its group — id and label both', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [{ ...square(A1, 'level-1'), group: BLOCK_A }],
        });
        const rec = env.spaceEnvelope.get(A1)!;
        expect(rec.group).not.toBeNull();
        expect(rec.group?.id).toBe('mg_blockA');
        expect(rec.group?.label).toBe('Block A');
    });

    it('⭐ and it survives a JSON round-trip — a group that dies on save is not a group', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [{ ...square(A1, 'level-1'), group: BLOCK_A }],
        });
        const revived = JSON.parse(JSON.stringify(env.spaceEnvelope.get(A1)!)) as Record<string, unknown>;
        expect(revived.group).toEqual({ id: 'mg_blockA', label: 'Block A' });
    });

    it('a spec that says NOTHING about a group lands in the UNGROUPED bucket (null), not undefined', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [square(U1, 'level-1')],
        });
        const rec = env.spaceEnvelope.get(U1)!;
        // ⭐ ADR-0383 D3 — `null` IS the ungrouped bucket, and it is every envelope written before
        // ADR-0383. The whole migration is that this line is already true without a backfill.
        expect(rec.group).toBeNull();
        expect('group' in (rec as object)).toBe(true);
    });

    it('an EXPLICIT null is accepted and means the same bucket (the routes differ, the value does not)', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [{ ...square(U1, 'level-1'), group: null }],
        });
        expect(env.spaceEnvelope.get(U1)!.group).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('two buildings on one parcel', () => {
    it('⭐⭐ TWO GROUPS COEXIST ON ONE STOREY — neither create touches the other', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [{ ...square(A1, 'level-1', 0, 0), group: BLOCK_A }],
        });
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            // 40 m away, same storey. Before ADR-0383 there was no field that could say these are
            // different buildings; the supersession rule's bucket is this field (C114 §6e clause 3).
            envelopes: [{ ...square(B1, 'level-1', 40, 0), group: BLOCK_B }],
        });
        expect(env.spaceEnvelope.get(A1)?.group?.id).toBe('mg_blockA');
        expect(env.spaceEnvelope.get(B1)?.group?.id).toBe('mg_blockB');
        expect(env.spaceEnvelope.getState().size).toBe(2);
    });

    it('a grouped and an ungrouped envelope coexist — ungrouped is a bucket, not an absence', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...square(A1, 'level-1', 0, 0), group: BLOCK_A },
                square(U1, 'level-1', 40, 0),
            ],
        });
        expect(env.spaceEnvelope.get(A1)?.group?.id).toBe('mg_blockA');
        expect(env.spaceEnvelope.get(U1)?.group).toBeNull();
    });

    it('⭐ a group of N storeys is still ONE undo entry (C114 §6a)', async () => {
        const env = buildEnv();
        const before = env.undoStack.size;
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...square(A1, 'level-1'), group: BLOCK_A },
                { ...square(A2, 'level-2'), group: BLOCK_A },
            ],
        });
        // ⛔ The DEPTH, not the state: a state assertion passes just as happily with N entries.
        expect(env.undoStack.size).toBe(before + 1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('⛔ a malformed group is REFUSED, never coerced to the ungrouped bucket', () => {
    it('refuses a group with a blank id', async () => {
        const env = buildEnv();
        await expect(
            env.bus.executeCommand('spaceEnvelope.batch.create', {
                envelopes: [{ ...square(A1, 'level-1'), group: { id: '', label: 'Block A' } }],
            }),
        ).rejects.toThrow();
        // ⛔ AND NOTHING WAS WRITTEN. A coerced-to-ungrouped record would be the §CONTEXT-DATA-HONESTY
        // defect exactly: a malformed statement and "the user said ungrouped" sharing one value.
        expect(env.spaceEnvelope.get(A1)).toBeUndefined();
    });

    it('refuses a group with a blank label', async () => {
        const env = buildEnv();
        await expect(
            env.bus.executeCommand('spaceEnvelope.batch.create', {
                envelopes: [{ ...square(A1, 'level-1'), group: { id: 'mg_blockA', label: '' } }],
            }),
        ).rejects.toThrow();
        expect(env.spaceEnvelope.get(A1)).toBeUndefined();
    });

    it('refuses a group that is not an object at all', async () => {
        const env = buildEnv();
        await expect(
            env.bus.executeCommand('spaceEnvelope.batch.create', {
                envelopes: [{ ...square(A1, 'level-1'), group: 'Block A' as unknown as null }],
            }),
        ).rejects.toThrow();
        expect(env.spaceEnvelope.get(A1)).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⭐ THE CLAUSE THE SCHEMA NAMES THIS FILE FOR — one `group.id`, exactly one `label`.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('the denormalisation cost the schema names', () => {
    it('⭐ every group.id in the store resolves to exactly ONE distinct label', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...square(A1, 'level-1'), group: BLOCK_A },
                { ...square(A2, 'level-2'), group: BLOCK_A },
                { ...square(B1, 'level-1', 40, 0), group: BLOCK_B },
            ],
        });
        const labels = new Map<string, Set<string>>();
        for (const rec of env.spaceEnvelope.getState().values()) {
            const g = rec.group;
            if (g === null || g === undefined) continue;
            const set = labels.get(g.id) ?? new Set<string>();
            set.add(g.label);
            labels.set(g.id, set);
        }
        expect(labels.size).toBe(2);
        for (const [id, set] of labels) {
            expect(`${id}:${set.size}`).toBe(`${id}:1`);
        }
    });
});
