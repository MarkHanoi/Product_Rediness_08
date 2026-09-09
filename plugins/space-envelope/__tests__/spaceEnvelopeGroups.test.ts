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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ADR-0383 S4 — THE THREE GROUP VERBS.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const A3 = 'spaceEnvelope_01J00000000000000000000A03';
const AR = 'spaceEnvelope_01J00000000000000000000AR1';
const NEW1 = 'spaceEnvelope_01J00000000000000000000N01';
const NEW2 = 'spaceEnvelope_01J00000000000000000000N02';

/** A level envelope of side `s` at the origin, seated at `baseOffset`. */
function level(id: string, levelId: string, s: number, baseOffset: number) {
    return {
        spaceEnvelopeId: id,
        levelId,
        role: 'level' as const,
        footprint: [
            { x: 0, y: 0, z: 0 },
            { x: s, y: 0, z: 0 },
            { x: s, y: 0, z: s },
            { x: 0, y: 0, z: s },
        ],
        baseOffset,
        height: 3,
    };
}

/**
 * A SET-BACK block: 20 m on the ground, 10 m on top. ⭐ The two rings DIFFER, which is the whole
 * point — §4a(b) rules that a grown storey copies the TOP ring, and a fixture whose rings matched
 * could not tell the two rules apart.
 */
async function buildSetBackBlock() {
    const env = buildEnv();
    await env.bus.executeCommand('spaceEnvelope.batch.create', {
        envelopes: [
            { ...level(A1, 'level-1', 20, 0), group: BLOCK_A },
            { ...level(A2, 'level-2', 20, 3), group: BLOCK_A },
            { ...level(A3, 'level-3', 10, 6), group: BLOCK_A },
        ],
    });
    return env;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('spaceEnvelope.group.rename', () => {
    it('⭐ rewrites the label on EVERY member in ONE undo entry', async () => {
        const env = await buildSetBackBlock();
        const before = env.undoStack.size;
        await env.bus.executeCommand('spaceEnvelope.group.rename', {
            groupId: 'mg_blockA', label: 'The North Tower',
        });
        for (const id of [A1, A2, A3]) {
            expect(env.spaceEnvelope.get(id)!.group?.label).toBe('The North Tower');
        }
        // ⛔ DEPTH, not state: renaming a three-storey block must not cost three Ctrl+Zs.
        expect(env.undoStack.size).toBe(before + 1);
    });

    it('⭐⭐ reaches a role:"room" member too — no role filter', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...level(A1, 'level-1', 20, 0), group: BLOCK_A },
                {
                    spaceEnvelopeId: AR,
                    levelId: 'level-1',
                    role: 'room' as const,
                    withinId: A1,
                    footprint: [
                        { x: 1, y: 0, z: 1 },
                        { x: 5, y: 0, z: 1 },
                        { x: 5, y: 0, z: 5 },
                        { x: 1, y: 0, z: 5 },
                    ],
                    baseOffset: 0,
                    height: 2.5,
                    group: BLOCK_A,
                },
            ],
        });
        await env.bus.executeCommand('spaceEnvelope.group.rename', {
            groupId: 'mg_blockA', label: 'The North Tower',
        });
        // ⛔ A room left holding the OLD label is the exact drift this verb exists to prevent,
        // created by the verb itself, and invisible until the reader reports a disagreement.
        expect(env.spaceEnvelope.get(AR)!.group?.label).toBe('The North Tower');
    });

    it('does not touch another group', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...level(A1, 'level-1', 20, 0), group: BLOCK_A },
                { ...level(B1, 'level-1', 10, 0), group: BLOCK_B },
            ],
        });
        await env.bus.executeCommand('spaceEnvelope.group.rename', {
            groupId: 'mg_blockA', label: 'Renamed',
        });
        expect(env.spaceEnvelope.get(B1)!.group?.label).toBe('Block B');
    });

    it('⛔ refuses a blank label', async () => {
        const env = await buildSetBackBlock();
        await expect(
            env.bus.executeCommand('spaceEnvelope.group.rename', { groupId: 'mg_blockA', label: '  ' }),
        ).rejects.toThrow();
        expect(env.spaceEnvelope.get(A1)!.group?.label).toBe('Block A');
    });

    it('⛔ refuses a groupId nothing carries — an empty group is not representable (D2)', async () => {
        const env = await buildSetBackBlock();
        await expect(
            env.bus.executeCommand('spaceEnvelope.group.rename', { groupId: 'mg_nope', label: 'X' }),
        ).rejects.toThrow();
    });

    it('⛔ refuses a NO-OP — it would spend the user’s next Ctrl+Z on an edit that never happened', async () => {
        const env = await buildSetBackBlock();
        await expect(
            env.bus.executeCommand('spaceEnvelope.group.rename', { groupId: 'mg_blockA', label: 'Block A' }),
        ).rejects.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('spaceEnvelope.group.dissolve', () => {
    it('clears the group on every member', async () => {
        const env = await buildSetBackBlock();
        await env.bus.executeCommand('spaceEnvelope.group.dissolve', { groupId: 'mg_blockA' });
        for (const id of [A1, A2, A3]) expect(env.spaceEnvelope.get(id)!.group).toBeNull();
    });

    it('⭐⭐ KEEPS THE ENVELOPES — dissolve is not delete', async () => {
        const env = await buildSetBackBlock();
        expect(env.spaceEnvelope.getState().size).toBe(3);
        await env.bus.executeCommand('spaceEnvelope.group.dissolve', { groupId: 'mg_blockA' });
        // ⛔ "a verb whose name says 'ungroup' and whose effect is 'destroy three buildings' is the
        // worst kind of irreversible surprise" — ADR-0383 §4.
        expect(env.spaceEnvelope.getState().size).toBe(3);
        for (const id of [A1, A2, A3]) expect(env.spaceEnvelope.get(id)).toBeDefined();
    });

    it('is ONE undo entry', async () => {
        const env = await buildSetBackBlock();
        const before = env.undoStack.size;
        await env.bus.executeCommand('spaceEnvelope.group.dissolve', { groupId: 'mg_blockA' });
        expect(env.undoStack.size).toBe(before + 1);
    });

    it('⛔ refuses a groupId nothing carries', async () => {
        const env = await buildSetBackBlock();
        await expect(
            env.bus.executeCommand('spaceEnvelope.group.dissolve', { groupId: 'mg_nope' }),
        ).rejects.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('spaceEnvelope.group.setStoreys — ONE verb, BOTH directions, ONE undo', () => {
    it('⭐⭐ GROWS by copying the TOP-seated member’s ring, NOT the ground’s (§4a(b))', async () => {
        const env = await buildSetBackBlock();   // ground 20 m, top 10 m — a set-back
        await env.bus.executeCommand('spaceEnvelope.group.setStoreys', {
            groupId: 'mg_blockA',
            targetStoreys: 4,
            added: [{ spaceEnvelopeId: NEW1, levelId: 'level-4', baseOffset: 9, height: 3 }],
        });
        const grown = env.spaceEnvelope.get(NEW1)!;
        // 10 x 10 = 100, the TOP ring. The ground ring would be 20 x 20 = 400 — and copying it
        // would silently undo the set-back the designer already drew.
        expect(grown.footprintAreaM2).toBeCloseTo(100, 6);
        expect(grown.role).toBe('level');
        expect(grown.baseOffset).toBeCloseTo(9, 6);
        expect(grown.group?.id).toBe('mg_blockA');
    });

    it('grows by TWO in ONE undo entry', async () => {
        const env = await buildSetBackBlock();
        const before = env.undoStack.size;
        await env.bus.executeCommand('spaceEnvelope.group.setStoreys', {
            groupId: 'mg_blockA',
            targetStoreys: 5,
            added: [
                { spaceEnvelopeId: NEW1, levelId: 'level-4', baseOffset: 9, height: 3 },
                { spaceEnvelopeId: NEW2, levelId: 'level-5', baseOffset: 12, height: 3 },
            ],
        });
        expect(env.spaceEnvelope.getState().size).toBe(5);
        expect(env.undoStack.size).toBe(before + 1);
    });

    it('⭐ SHRINKS from the TOP — the lower storeys survive', async () => {
        const env = await buildSetBackBlock();
        await env.bus.executeCommand('spaceEnvelope.group.setStoreys', {
            groupId: 'mg_blockA', targetStoreys: 2, added: [],
        });
        expect(env.spaceEnvelope.get(A1)).toBeDefined();
        expect(env.spaceEnvelope.get(A2)).toBeDefined();
        // The TOP one (baseOffset 6) is the one removed — never the ground.
        expect(env.spaceEnvelope.get(A3)).toBeUndefined();
    });

    it('⭐ a shrink CLEARS a room’s withinId rather than CASCADING it (C114 §8, one implementation)', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...level(A1, 'level-1', 20, 0), group: BLOCK_A },
                { ...level(A2, 'level-2', 20, 3), group: BLOCK_A },
                {
                    spaceEnvelopeId: AR,
                    levelId: 'level-2',
                    role: 'room' as const,
                    withinId: A2,
                    footprint: [
                        { x: 1, y: 0, z: 1 },
                        { x: 5, y: 0, z: 1 },
                        { x: 5, y: 0, z: 5 },
                        { x: 1, y: 0, z: 5 },
                    ],
                    baseOffset: 3,
                    height: 2.5,
                },
            ],
        });
        await env.bus.executeCommand('spaceEnvelope.group.setStoreys', {
            groupId: 'mg_blockA', targetStoreys: 1, added: [],
        });
        // ⛔ The room SURVIVES with a cleared parent. Cascading would destroy an architect's room
        // layout because they reduced the storey count.
        expect(env.spaceEnvelope.get(AR)).toBeDefined();
        expect(env.spaceEnvelope.get(AR)!.withinId).toBeNull();
    });

    it('⛔ refuses a target of 0 — a delete wearing a resize’s name', async () => {
        const env = await buildSetBackBlock();
        await expect(
            env.bus.executeCommand('spaceEnvelope.group.setStoreys', {
                groupId: 'mg_blockA', targetStoreys: 0, added: [],
            }),
        ).rejects.toThrow();
        expect(env.spaceEnvelope.getState().size).toBe(3);
    });

    it('⛔ refuses a no-op', async () => {
        const env = await buildSetBackBlock();
        await expect(
            env.bus.executeCommand('spaceEnvelope.group.setStoreys', {
                groupId: 'mg_blockA', targetStoreys: 3, added: [],
            }),
        ).rejects.toThrow();
    });

    it('⭐⭐ refuses when `added` DISAGREES with `targetStoreys` — the cross-check, with both numbers', async () => {
        const env = await buildSetBackBlock();
        // Asked for 5 (needs 2 new) but supplied 1. Trusting either number silently would make the
        // button's label and the store's contents two different answers.
        await expect(
            env.bus.executeCommand('spaceEnvelope.group.setStoreys', {
                groupId: 'mg_blockA',
                targetStoreys: 5,
                added: [{ spaceEnvelopeId: NEW1, levelId: 'level-4', baseOffset: 9, height: 3 }],
            }),
        ).rejects.toThrow();
        expect(env.spaceEnvelope.getState().size).toBe(3);
    });

    it('⛔ refuses an added id that already exists', async () => {
        const env = await buildSetBackBlock();
        await expect(
            env.bus.executeCommand('spaceEnvelope.group.setStoreys', {
                groupId: 'mg_blockA',
                targetStoreys: 4,
                added: [{ spaceEnvelopeId: A1, levelId: 'level-4', baseOffset: 9, height: 3 }],
            }),
        ).rejects.toThrow();
    });

    it('⛔ refuses a groupId nothing carries', async () => {
        const env = await buildSetBackBlock();
        await expect(
            env.bus.executeCommand('spaceEnvelope.group.setStoreys', {
                groupId: 'mg_nope', targetStoreys: 2, added: [],
            }),
        ).rejects.toThrow();
    });

    it('leaves a PEER block completely alone', async () => {
        const env = buildEnv();
        await env.bus.executeCommand('spaceEnvelope.batch.create', {
            envelopes: [
                { ...level(A1, 'level-1', 20, 0), group: BLOCK_A },
                { ...level(A2, 'level-2', 20, 3), group: BLOCK_A },
                { ...level(B1, 'level-1', 10, 0), group: BLOCK_B },
            ],
        });
        await env.bus.executeCommand('spaceEnvelope.group.setStoreys', {
            groupId: 'mg_blockA', targetStoreys: 1, added: [],
        });
        expect(env.spaceEnvelope.get(B1)).toBeDefined();
        expect(env.spaceEnvelope.get(A1)).toBeDefined();
        expect(env.spaceEnvelope.get(A2)).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('the roster declares exactly what it builds', () => {
    it('registers all three group verbs', async () => {
        const { SPACE_ENVELOPE_HANDLER_TYPES, MASSING_GROUP_VERBS } =
            await import('../src/handlers/index.js');
        for (const v of MASSING_GROUP_VERBS) {
            expect(SPACE_ENVELOPE_HANDLER_TYPES).toContain(v);
        }
        expect(buildSpaceEnvelopeHandlerSet()).toHaveLength(SPACE_ENVELOPE_HANDLER_TYPES.length);
    });
});
