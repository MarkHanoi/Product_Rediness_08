/**
 * §FIX-STAIR-DELETE-ORPHANS-HANDRAILS (C95 §8.2 / §11 row 12; C84 EI-4a + EI-5).
 *
 * ⛔ THE DEFECT WAS A COMMENT THAT NAMED A MECHANISM THAT DOES NOT EXIST.
 * `plugins/cross/src/stair-handrail.ts` excludes `stair.delete` from the cascade
 * and justifies it:
 *
 *     //   • stair.delete   — handrail lifecycle managed by the host plugin
 *     //                      (orphan handrails are pruned by a separate
 *     //                      garbage-collect pass, not the cascade).
 *
 * **There is no such pass.** The only handrail lifecycle cleanup is LEVEL-scoped
 * (`HandrailLevelCleanupHandler`, `HandrailStore.removeByLevel`) and neither keys
 * on a host. C84 §8.d rates this worse than an open defect: the comment converted
 * it into a closed-looking one, and C95 §8.2 has carried it as OPEN ever since.
 *
 * ⚠ AND IT WAS UNFIXABLE AS WRITTEN, WHICH IS THE PART WORTH RECORDING.
 * `HandrailData` had **no `hostId` at all** (measured 2026-08-19: zero hits in
 * `HandrailTypes.ts` and in `CreateHandrailCommand`), and **no stair→handrail
 * semantic edge was ever written in production** (`CreateStairCommand` writes
 * `sitsOn` plus two `connectedByStair`, and nothing else). So the question "which
 * handrails belong to this stair?" had no answer anywhere in the model — you
 * cannot prune an orphan you cannot identify. Hosting had to become EXPRESSIBLE
 * before the cascade could be written, which is C95 §15.1's MUST.
 *
 * ⚠ HONEST SCOPE, STATED SO NOBODY READS THIS AS A CLOSED LOOP: no UI authors a
 * hosted handrail yet. This proves the MODEL and the CASCADE — a handrail created
 * with a host is identified, deleted with its host, and restored by one undo. The
 * authoring surface that sets `hostId` is C95 §15.1's remaining half.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { semanticGraphManager, ProjectContext } from '@pryzm/core-app-model';
import { HandrailStore } from '@pryzm/core-app-model/stores';
import { CreateHandrailCommand } from '../src/handrails/CreateHandrailCommand';
import { DeleteStairCommand } from '../src/stair/DeleteStairCommand';
import type { CommandContext } from '../src/types';

const STAIR_ID = 'stair-1';
const OTHER_STAIR_ID = 'stair-2';
const BASE_LEVEL = 'L0';
const TOP_LEVEL = 'L1';

const HOSTED_A = 'handrail-hosted-a';
const HOSTED_B = 'handrail-hosted-b';
const FREE = 'handrail-free-standing';
const OTHER_STAIRS = 'handrail-on-other-stair';

const ALL_IDS = [STAIR_ID, OTHER_STAIR_ID, BASE_LEVEL, TOP_LEVEL, HOSTED_A, HOSTED_B, FREE, OTHER_STAIRS];

function makeStairStore() {
    const map = new Map<string, { id: string }>();
    return {
        add: (s: { id: string }) => { map.set(s.id, s); },
        getById: (id: string) => map.get(id),
        remove: (id: string) => { map.delete(id); },
        restoreSnapshot: (s: { id: string }) => { map.set(s.id, s); },
        getStairConnectingLevels: () => undefined,
        getAll: () => Array.from(map.values()),
    };
}

function makeCtx() {
    const stairStore = makeStairStore();
    // ⛔ THE HANDRAIL STORE IS THE REAL ONE, DELIBERATELY. A Map double would
    // merge, clone and emit however this test wanted it to, which is exactly the
    // "fake more capable than the real thing" trap. The stair-side stores stay
    // doubles because the stair is not what is under test.
    const handrailStore = new HandrailStore(new ProjectContext());

    stairStore.add({
        id: STAIR_ID, type: 'stair', baseLevelId: BASE_LEVEL, topLevelId: TOP_LEVEL,
        shape: 'straight', position: { x: 0, y: 0, z: 0 },
        totalRise: 3.0, treadDepth: 0.28, riserHeight: 0.18, width: 1.0,
    } as never);

    const ctx = {
        stores: {
            stairStore,
            handrailStore,
            stairRailingStore: undefined,
            wallStore: { getById: () => undefined },
        },
        bimManager: {
            registerElement: () => {},
            unregisterElement: () => {},
            getLevelById: (id: string) => (id === BASE_LEVEL ? { id, elevation: 0 } : undefined),
        },
        projectContext: { activeLevelId: BASE_LEVEL },
    } as unknown as CommandContext;

    return { ctx, handrailStore, stairStore };
}

function makeHandrail(
    ctx: CommandContext,
    id: string,
    host?: { hostId: string; hostKind: 'stair' | 'slab' },
): void {
    new CreateHandrailCommand({
        id,
        start: { x: 0, z: 0 },
        end: { x: 3, z: 0 },
        height: 0.9,
        thickness: 0.042,
        levelId: BASE_LEVEL,
        ...(host ?? {}),
    }).execute(ctx);
}

beforeEach(() => {
    for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
});

describe('§FIX-STAIR-DELETE-ORPHANS-HANDRAILS — hosting is expressible', () => {
    it('a handrail created with a host CARRIES the host on the authoritative record', () => {
        const { ctx, handrailStore } = makeCtx();
        makeHandrail(ctx, HOSTED_A, { hostId: STAIR_ID, hostKind: 'stair' });

        const rec = handrailStore.getById(HOSTED_A)!;
        expect(rec).toBeDefined();
        expect(rec.hostId).toBe(STAIR_ID);
        expect(rec.hostKind).toBe('stair');
    });

    it('and the host relationship is in the SEMANTIC GRAPH, both directions', () => {
        const { ctx } = makeCtx();
        makeHandrail(ctx, HOSTED_A, { hostId: STAIR_ID, hostKind: 'stair' });

        // Reuses the EXISTING vocabulary (`hosts` / `hostedBy`, the wall-to-opening
        // pair). No new relationship type was minted — C84 EI-8.
        expect(semanticGraphManager.getTargets(STAIR_ID, 'hosts')).toContain(HOSTED_A);
        expect(semanticGraphManager.getTargets(HOSTED_A, 'hostedBy')).toContain(STAIR_ID);
    });

    it('a free-standing handrail carries NO host and no host edges', () => {
        const { ctx, handrailStore } = makeCtx();
        makeHandrail(ctx, FREE);

        expect(handrailStore.getById(FREE)!.hostId).toBeUndefined();
        expect(semanticGraphManager.getTargets(FREE, 'hostedBy')).toEqual([]);
    });
});

describe('§FIX-STAIR-DELETE-ORPHANS-HANDRAILS — the cascade', () => {
    it('THE TOOTH: deleting the stair removes ITS handrails', () => {
        const { ctx, handrailStore } = makeCtx();
        makeHandrail(ctx, HOSTED_A, { hostId: STAIR_ID, hostKind: 'stair' });
        makeHandrail(ctx, HOSTED_B, { hostId: STAIR_ID, hostKind: 'stair' });
        expect(handrailStore.getAll()).toHaveLength(2);

        const cmd = new DeleteStairCommand({ stairId: STAIR_ID });
        expect(cmd.execute(ctx).success).toBe(true);

        // Before the fix BOTH survived, floating in space with no host.
        expect(handrailStore.getById(HOSTED_A)).toBeUndefined();
        expect(handrailStore.getById(HOSTED_B)).toBeUndefined();
        expect(handrailStore.getAll()).toHaveLength(0);
    });

    it('the purge is SCOPED — a free-standing rail and another stair rail SURVIVE', () => {
        const { ctx, handrailStore } = makeCtx();
        makeHandrail(ctx, HOSTED_A, { hostId: STAIR_ID, hostKind: 'stair' });
        makeHandrail(ctx, FREE);
        makeHandrail(ctx, OTHER_STAIRS, { hostId: OTHER_STAIR_ID, hostKind: 'stair' });

        new DeleteStairCommand({ stairId: STAIR_ID }).execute(ctx);

        expect(handrailStore.getById(HOSTED_A)).toBeUndefined();
        expect(handrailStore.getById(FREE)).toBeDefined();
        expect(handrailStore.getById(OTHER_STAIRS)).toBeDefined();
    });

    it('⭐ ONE undo restores them, field-for-field (C84 EI-5 create/delete symmetry)', () => {
        const { ctx, handrailStore } = makeCtx();
        makeHandrail(ctx, HOSTED_A, { hostId: STAIR_ID, hostKind: 'stair' });
        const before = structuredClone(handrailStore.getById(HOSTED_A)!);

        const cmd = new DeleteStairCommand({ stairId: STAIR_ID });
        cmd.execute(ctx);
        expect(handrailStore.getById(HOSTED_A)).toBeUndefined();

        cmd.undo(ctx);

        const after = handrailStore.getById(HOSTED_A);
        expect(after).toBeDefined();
        // Field-for-field, not merely "a record with that id exists" — a
        // reconstruction would pass a presence check and lose the geometry.
        expect(after).toEqual(before);
    });

    it('the handrail graph edges come back with it, not just the record', () => {
        const { ctx } = makeCtx();
        makeHandrail(ctx, HOSTED_A, { hostId: STAIR_ID, hostKind: 'stair' });

        const cmd = new DeleteStairCommand({ stairId: STAIR_ID });
        cmd.execute(ctx);
        expect(semanticGraphManager.getTargets(HOSTED_A, 'hostedBy')).toEqual([]);

        cmd.undo(ctx);
        expect(semanticGraphManager.getTargets(HOSTED_A, 'hostedBy')).toContain(STAIR_ID);
    });

    it('redo purges again, and a second undo restores exactly one rail (idempotent)', () => {
        const { ctx, handrailStore } = makeCtx();
        makeHandrail(ctx, HOSTED_A, { hostId: STAIR_ID, hostKind: 'stair' });

        const cmd = new DeleteStairCommand({ stairId: STAIR_ID });
        cmd.execute(ctx);
        cmd.undo(ctx);
        cmd.execute(ctx);
        expect(handrailStore.getAll()).toHaveLength(0);
        cmd.undo(ctx);
        expect(handrailStore.getAll()).toHaveLength(1);
    });

    it('a stair with NO hosted handrails deletes exactly as before', () => {
        const { ctx, handrailStore } = makeCtx();
        makeHandrail(ctx, FREE);

        const cmd = new DeleteStairCommand({ stairId: STAIR_ID });
        expect(cmd.execute(ctx).success).toBe(true);
        expect(handrailStore.getAll()).toHaveLength(1);
        cmd.undo(ctx);
        expect(handrailStore.getAll()).toHaveLength(1);
    });

    it('the command DECLARES the store it writes (C03 §4.6 U-2)', () => {
        // A cascade that mutates a store it does not declare is invisible to the
        // scoped snapshot, which is how an undo silently stops covering it.
        expect(new DeleteStairCommand({ stairId: STAIR_ID }).affectedStores)
            .toContain('handrail');
    });
});
