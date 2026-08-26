/**
 * §BATH102 — the C109 bathroom-pod compound's DISPATCH half, at the handler layer.
 *
 * L-11480..L-11486 · C109 §5.4 / §7 / §8 / R-1 / R-3 / R-4 / R-7 / R-10 · C03 §4.6 U-2 ·
 * C16 §8.6 · C67 rule 12.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠ WHAT THIS FILE PROVES, AND WHAT IT EXPLICITLY DOES NOT.
 * ═══════════════════════════════════════════════════════════════════════════════
 * It proves the two handlers are correct: that a pod lands in the store as ONE patch
 * pair over ONE declared store, that the refusal carries both numbers, that the delete
 * reaps by the RECORD, and that the inverse round-trips.
 *
 * ⛔ IT DOES NOT PROVE A PERSON CAN CREATE A POD. That is axis 3 (a palette row) and
 * axis 4 (a real DOM event on the real plan overlay), and C109 R-9 — adopted verbatim
 * from C104 R-10 — says a reachability claim for this family is NOT ADMISSIBLE without
 * the pointer-layer proof. It lives in
 * `apps/editor/src/engine/views/plantools/__tests__/bathroomPodPointerReach.spec.ts`.
 * Axis 2 exists because a missing `PluginRegistry` descriptor throws BEFORE anything
 * mutates; that is measured in `apps/editor/__tests__/`, off the REAL composition root.
 *
 * ⭐ EVERY ASSERTION READS BACK THROUGH THE REAL STORE (C67 rule 12), never a handler's
 * own return value. `success: true` is a claim; `store.get(id)` is a measurement.
 */

import { describe, it, expect } from 'vitest';
import {
    BATHROOM_POD_DEFAULT_MEMBERS,
    bathroomPodChildIds,
    bathroomPodMemberCount,
    bathroomPodMemberOrder,
    type BathroomPodMemberKind,
    type BathroomPodRoom,
} from '@pryzm/geometry-plumbing';
import { BathroomPodStore } from '../src/bathroomPodStore.js';
import {
    CreateBathroomPodHandler,
    type CreateBathroomPodPayload,
} from '../src/handlers/CreateBathroomPod.js';
import { DeleteBathroomPodHandler } from '../src/handlers/DeleteBathroomPod.js';

// ── The world ────────────────────────────────────────────────────────────────
// A 2.60 x 2.10 m room, which the solver's own suite pins as fitting the default
// member set on ONE wall. ⛔ The numbers here are the QUESTION, not an assertion about
// the answer — C109 R-10 forbids a test that asserts a pod dimension EQUALS a
// documented default, because such a test goes RED on a deliberate change and GREEN on
// a silently-ignored override.
const ROOM: BathroomPodRoom = Object.freeze({
    clearWidth: 2.6,
    clearDepth: 2.1,
    origin: Object.freeze({ x: 10, y: 0, z: 5 }),
    rotation: 0,
});

/** A room too narrow for the default module — the REFUSAL case (C109 §5.4). */
const TIGHT_ROOM: BathroomPodRoom = Object.freeze({
    clearWidth: 1.4,
    clearDepth: 2.1,
    origin: Object.freeze({ x: 0, y: 0, z: 0 }),
    rotation: 0,
});

const LEVEL = 'level-1';

function memberIdsFor(kinds: readonly BathroomPodMemberKind[]): string[] {
    return bathroomPodMemberOrder(kinds).map((k, i) => `plumbing_${k}_${i}`);
}

function payload(
    over: Partial<CreateBathroomPodPayload> = {},
): CreateBathroomPodPayload {
    const members = over.members ?? BATHROOM_POD_DEFAULT_MEMBERS;
    return {
        podId: 'bathroomPod_01',
        levelId: LEVEL,
        room: ROOM,
        handedness: 'left',
        memberIds: memberIdsFor(members),
        ...over,
    };
}

/**
 * A `HandlerContext` the two handlers can read.
 *
 * ⭐ THE RECORD VIEW IS BUILT FROM THE REAL STORE, and the patches are applied BACK to
 * the real store through `Store.applyPatch()` — which is the very method the bus calls
 * on execute and the very method the undo adapter calls on Ctrl+Z. A hand-written Map
 * here would be a fake built from the header, and a fake built from the header cannot
 * falsify the header.
 */
function ctxOver(store: BathroomPodStore): {
    stores: { bathroomPod: Record<string, unknown> };
    audit: { timestamp: number };
} {
    return {
        stores: { bathroomPod: Object.fromEntries(store.getState()) },
        audit: { timestamp: 0 },
    };
}

/** Run a handler end-to-end against the REAL store and return the patch pair. */
function run(
    handler: { canExecute: Function; execute: Function },
    store: BathroomPodStore,
    cmd: unknown,
): { forward: readonly unknown[]; inverse: readonly unknown[] } {
    const ctx = ctxOver(store);
    const v = handler.canExecute(ctx, cmd);
    if (!v.valid) throw new Error(String(v.reason));
    const out = handler.execute(ctx, cmd);
    store.applyPatch(out.forward);
    return out;
}

describe('§BATH102 — bathroomPod.create / bathroomPod.delete', () => {
    // ── ARM A — the pod lands, through the real store ────────────────────────
    describe('ARM A — the record', () => {
        it('A-1 one create puts ONE pod, carrying EVERY member, in the store', () => {
            const store = new BathroomPodStore();
            run(new CreateBathroomPodHandler(), store, payload());

            const pod = store.get('bathroomPod_01');
            expect(pod, 'the pod must be READ BACK from the store, not inferred').toBeDefined();
            expect(pod!.levelId).toBe(LEVEL);
            // The member COUNT is asked of the solver, never typed — C109 R-10.
            expect(pod!.members.length).toBe(
                bathroomPodMemberCount(BATHROOM_POD_DEFAULT_MEMBERS),
            );
            // ⭐ EVERY member is a real plumbing FIXTURE TYPE (C109 §2 / R-2). A member
            // that is not is a pod-private object, which R-2 forbids.
            for (const m of pod!.members) {
                expect(['toilet', 'sink', 'shower', 'bath', 'accessory']).toContain(m.fixtureType);
            }
        });

        it('A-2 the pre-minted ids are HONOURED — redo cannot mint a different pod', () => {
            const store = new BathroomPodStore();
            const ids = memberIdsFor(BATHROOM_POD_DEFAULT_MEMBERS);
            run(new CreateBathroomPodHandler(), store, payload({ memberIds: ids }));

            // ⭐ CA-2 stated as a MEASUREMENT: `execute()` runs again on redo, so ids
            // minted inside the handler would silently produce a different pod the
            // second time. Asserting the ids we PASSED come back is C109 R-10's
            // "assert an explicit value is honoured", not a pinned default.
            expect([...store.childIdsOf('bathroomPod_01')]).toEqual(ids);
        });

        it('A-3 the pod carries NO sanitaryware dimension of its own (C109 R-6)', () => {
            const store = new BathroomPodStore();
            run(new CreateBathroomPodHandler(), store, payload());
            const pod = store.get('bathroomPod_01')!;
            // Every footprint sits on the MEMBER, resolved by the family's own tables.
            // The parent carries the room envelope and nothing dimensional beside it.
            expect(Object.keys(pod)).not.toContain('footprint');
            for (const m of pod.members) {
                expect(m.footprint.width).toBeGreaterThan(0);
                expect(m.footprint.length).toBeGreaterThan(0);
            }
        });
    });

    // ── ARM B — ONE store, ONE patch pair ───────────────────────────────────
    describe('ARM B — the undo-routing declaration', () => {
        it('B-1 create and delete BOTH declare exactly ["bathroomPod"]', () => {
            // ⛔ THE LOAD-BEARING ASSERTION OF THIS FILE. C109 §8 as minted said
            // `['bathroomPod','plumbing']`; the amendment records the two measurements
            // that make that wrong — `ctx.stores.plumbing` is the PIPE DTO store on
            // write, and `buildUndoStoreMap()` resolves the same key to the LEGACY
            // FIXTURE store on undo (C03 §4.6 U-2b's corrupting case).
            expect([...new CreateBathroomPodHandler().affectedStores]).toEqual(['bathroomPod']);
            expect([...new DeleteBathroomPodHandler().affectedStores]).toEqual(['bathroomPod']);
        });

        it('B-2 ONE patch pair carries the WHOLE pod — one gesture, one undo entry', () => {
            const store = new BathroomPodStore();
            const out = run(new CreateBathroomPodHandler(), store, payload());
            // C16 §8.6 B-6: one gesture is one undo entry because it is ONE command
            // producing ONE patch pair — never because a batch was held open.
            expect(out.forward.length).toBe(1);
            expect(out.inverse.length).toBe(1);
            // …and every member rides inside that one patch, which is what makes the
            // single-store declaration honest rather than a narrowing.
            const value = (out.forward[0] as { value: { members: unknown[] } }).value;
            expect(value.members.length).toBe(bathroomPodMemberCount(BATHROOM_POD_DEFAULT_MEMBERS));
        });

        it('B-3 the INVERSE restores the store exactly — round-trip through applyPatch', () => {
            const store = new BathroomPodStore();
            const out = run(new CreateBathroomPodHandler(), store, payload());
            expect(store.ids().length).toBe(1);

            store.applyPatch(out.inverse as never);
            expect(store.get('bathroomPod_01'), 'Ctrl+Z must take the WHOLE pod back').toBeUndefined();
            expect(store.ids().length).toBe(0);

            // …and REDO puts it back, with the same members.
            store.applyPatch(out.forward as never);
            expect(store.childIdsOf('bathroomPod_01').length).toBe(
                bathroomPodMemberCount(BATHROOM_POD_DEFAULT_MEMBERS),
            );
        });
    });

    // ── ARM C — the refusal names BOTH numbers ──────────────────────────────
    describe('ARM C — C109 §5.4 / R-3: it fits or it refuses with both numbers', () => {
        it('C-1 a room too narrow is REFUSED, and nothing is written', () => {
            const store = new BathroomPodStore();
            const h = new CreateBathroomPodHandler();
            const cmd = payload({ room: TIGHT_ROOM });
            const v = h.canExecute(ctxOver(store) as never, cmd);

            expect(v.valid).toBe(false);
            const reason = String((v as { reason: string }).reason);
            // BOTH numbers, in metres, to 2 dp — the required and the available.
            expect(reason).toMatch(/needs \d+\.\d{2} m/);
            expect(reason).toMatch(/offers 1\.40 m/);
            // C16 CA-18: the reason AND the route back to success.
            expect(reason).toMatch(/Widen the room|remove the shower/i);
            // ⛔ R-3: never silently overlaps, shrinks or drops a member — so nothing
            // lands at all. Read back through the store, not from the return value.
            expect(store.ids().length).toBe(0);
        });

        it('C-2 a mis-counted id list is refused BEFORE the solver runs', () => {
            const store = new BathroomPodStore();
            const v = new CreateBathroomPodHandler().canExecute(
                ctxOver(store) as never,
                payload({ memberIds: ['only-one'] }),
            );
            expect(v.valid).toBe(false);
            expect(String((v as { reason: string }).reason)).toMatch(/pre-minted member id/);
        });

        it('C-3 a duplicate pod id is refused', () => {
            const store = new BathroomPodStore();
            run(new CreateBathroomPodHandler(), store, payload());
            const v = new CreateBathroomPodHandler().canExecute(ctxOver(store) as never, payload());
            expect(v.valid).toBe(false);
            expect(String((v as { reason: string }).reason)).toMatch(/duplicate/);
        });
    });

    // ── ARM D — delete reaps by the RECORD ──────────────────────────────────
    describe('ARM D — C109 §7 / R-4: delete reaps by childrenIds, never spatially', () => {
        it('D-1 deleting the pod removes it and names every member it reaped', () => {
            const store = new BathroomPodStore();
            run(new CreateBathroomPodHandler(), store, payload());
            const reaped = [...store.childIdsOf('bathroomPod_01')];
            expect(reaped.length).toBeGreaterThan(0);

            run(new DeleteBathroomPodHandler(), store, { podId: 'bathroomPod_01' });

            expect(store.get('bathroomPod_01')).toBeUndefined();
            // ⛔ R-4 — NO ORPHANS. Every member id the pod named must now be owned by
            // no pod at all; a member still resolving to a parent is exactly the
            // "orphan fixtures standing in an empty room" case C109 §7 forbids.
            for (const id of reaped) expect(store.podOfMember(id)).toBeUndefined();
        });

        it('D-2 deleting an id the store does not have is REFUSED, not a silent no-op', () => {
            const store = new BathroomPodStore();
            const v = new DeleteBathroomPodHandler().canExecute(ctxOver(store) as never, {
                podId: 'bathroomPod_nope',
            });
            expect(v.valid).toBe(false);
            expect(String((v as { reason: string }).reason)).toMatch(/not found/);
        });

        it('D-3 undoing a DELETE restores the pod AND all its members', () => {
            const store = new BathroomPodStore();
            run(new CreateBathroomPodHandler(), store, payload());
            const before = [...store.childIdsOf('bathroomPod_01')];

            const del = run(new DeleteBathroomPodHandler(), store, { podId: 'bathroomPod_01' });
            expect(store.get('bathroomPod_01')).toBeUndefined();

            store.applyPatch(del.inverse as never);
            const pod = store.get('bathroomPod_01');
            expect(pod, 'one Ctrl+Z must bring the whole pod back').toBeDefined();
            expect([...bathroomPodChildIds(pod!)]).toEqual(before);
        });
    });
});
