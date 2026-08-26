/**
 * @vitest-environment happy-dom
 */
// §BATH102 — C109 §9 AXIS 5 (undo / redo), AXIS 6 (delete reaps every member) and the
// data half of AXIS 7 (the members reach the family that draws them).
//
// L-11480..L-11486 · C109 §2 / §7 / §8 / R-4 / R-5 · C104 §8 · C16 §8.6 · C67 rule 12.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE PATCHES ARE REAL, THE POD STORE IS REAL, AND THE LEGACY FIXTURE STORE IS THE
//    REAL `@pryzm/geometry-plumbing` ONE — THE STORE THE MESH BUILDER LISTENS TO.
// ═══════════════════════════════════════════════════════════════════════════════
// `poolUndoAdapter.test.ts` and `liftUndoRoundTrip.test.ts` both record why this
// matters: a suite that hand-writes the store it is testing against cannot falsify the
// header it was written from. Here the pod store is `BathroomPodStore`, the fixture
// store is `PlumbingStore` from `@pryzm/geometry-plumbing` (whose `add()` emits
// `bim-plumbing-added`, the event `initBuilders.ts` wires straight into
// `PlumbingFragmentBuilder`), the patches come out of the REAL handlers, and the undo
// is the REAL `bathroomPodUndoAdapter` resolving `window.runtime.stores.bathroomPod`
// exactly as it does in a browser.
//
// ⚠ WHAT IS NOT MEASURED HERE, STATED SO A GREEN RUN IS NOT OVER-READ: no mesh is
// built (there is no scene), and no project is saved. So this proves the members REACH
// the store every drawing and export consumer reads — not that the pixels are right.
// And a saved-and-reloaded project still keeps every MEMBER and loses the PARENT
// (L-11405, C109 §12), which nothing here changes.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { PlumbingStore } from '@pryzm/geometry-plumbing';
import {
    BATHROOM_POD_DEFAULT_MEMBERS,
    bathroomPodMemberOrder,
} from '@pryzm/geometry-plumbing';
import { BathroomPodStore } from '@pryzm/plugin-plumbing';
import {
    CreateBathroomPodHandler,
    DeleteBathroomPodHandler,
} from '@pryzm/plugin-plumbing';
import {
    bathroomPodUndoAdapter,
    resolveBathroomPodStoreFromWindow,
} from '../src/engine/undo/bathroomPodUndoAdapter.js';
import {
    attachBathroomPodMemberMirror,
    __resetBathroomPodMemberMirrorForTests,
} from '../src/engine/bathroomPodMemberMirror.js';

const POD_ID = 'bathroomPod_01ARZ3NDEKTSV4RRFFQ69G5H00';
const MEMBER_IDS = bathroomPodMemberOrder(BATHROOM_POD_DEFAULT_MEMBERS).map(
    (_k, i) => `plumbing_01ARZ3NDEKTSV4RRFFQ69G5H2${i}`,
);

const PAYLOAD = {
    podId: POD_ID,
    levelId: 'level-1',
    room: { clearWidth: 2.6, clearDepth: 2.1, origin: { x: 0, y: 0, z: 0 }, rotation: 0 },
    handedness: 'left' as const,
    memberIds: MEMBER_IDS,
};

let podStore: BathroomPodStore;
let fixtures: PlumbingStore;
let dispose: (() => void) | null = null;
/** Every `bim-plumbing-added` id, in order — the event the 3-D builder listens to. */
let addedEvents: string[] = [];
let removedEvents: string[] = [];

const ctxOver = (): { stores: { bathroomPod: Record<string, unknown> }; audit: { timestamp: number } } => ({
    stores: { bathroomPod: Object.fromEntries(podStore.getState()) },
    audit: { timestamp: 0 },
});

/** Run a handler against the REAL store and return its patch pair. */
function run(
    handler: { canExecute: Function; execute: Function },
    cmd: unknown,
): { forward: readonly unknown[]; inverse: readonly unknown[] } {
    const ctx = ctxOver();
    const v = handler.canExecute(ctx, cmd);
    if (!v.valid) throw new Error(String(v.reason));
    const out = handler.execute(ctx, cmd);
    podStore.applyPatch(out.forward);
    return out;
}

const onAdded = (e: Event): void => {
    const id = (e as CustomEvent<{ id?: string }>).detail?.id;
    if (id) addedEvents.push(id);
};
const onRemoved = (e: Event): void => {
    const id = (e as CustomEvent<{ id?: string }>).detail?.id;
    if (id) removedEvents.push(id);
};

beforeEach(() => {
    __resetBathroomPodMemberMirrorForTests();
    podStore = new BathroomPodStore();
    fixtures = new PlumbingStore();
    addedEvents = [];
    removedEvents = [];

    const w = window as unknown as Record<string, unknown>;
    w.plumbingStore = fixtures;
    w.runtime = { stores: { bathroomPod: podStore } };

    window.addEventListener('bim-plumbing-added', onAdded);
    window.addEventListener('bim-plumbing-removed', onRemoved);

    // The SAME call `initTools.ts` makes. ⛔ Not a re-implementation of it.
    dispose = attachBathroomPodMemberMirror(podStore as never);
});

afterEach(() => {
    dispose?.();
    dispose = null;
    window.removeEventListener('bim-plumbing-added', onAdded);
    window.removeEventListener('bim-plumbing-removed', onRemoved);
    delete (window as unknown as Record<string, unknown>).plumbingStore;
    delete (window as unknown as Record<string, unknown>).runtime;
});

describe('§BATH102 — axes 5, 6 and the data half of 7', () => {
    // ── ARM A — the members reach the family that DRAWS them ────────────────
    describe('ARM A — C109 §2 / axis 7: every member is a real `plumbing` record', () => {
        it('A-1 creating a pod puts ONE fixture per member in the LEGACY store', () => {
            run(new CreateBathroomPodHandler(), PAYLOAD);

            for (const id of MEMBER_IDS) {
                // ⭐ READ BACK THROUGH THE REAL STORE (C67 rule 12). This is the store
                // `PlumbingFragmentBuilder`, `PlumbingPlanSymbolBuilder`,
                // `PlumbingElevationSymbolBuilder`, `ProjectSerializer` and
                // `PlumbingReader` all read — C109 §2 reason 2's five consumers.
                expect(fixtures.get(id), `member ${id} must exist as a plumbing fixture`).toBeDefined();
            }
        });

        it('A-2 the RENDER EVENT fires for every member — one per fixture', () => {
            run(new CreateBathroomPodHandler(), PAYLOAD);
            // `PlumbingStore.add()` emits `bim-plumbing-added { id }`, and
            // `initBuilders.ts` turns that into `plumbingBuilder.updateFixture(...)`.
            // Asserting the EVENT rather than the record is what separates "the data
            // landed" from "the 3-D scene was told" — [[committed-is-not-reachable]].
            expect(addedEvents.sort()).toEqual([...MEMBER_IDS].sort());
        });

        it('A-3 every member carries `parentId` — the C109 §2.3 ownership link', () => {
            run(new CreateBathroomPodHandler(), PAYLOAD);
            for (const id of MEMBER_IDS) {
                const rec = fixtures.get(id) as unknown as { parentId?: string };
                expect(rec.parentId, `member ${id} must name its pod`).toBe(POD_ID);
            }
        });

        it('A-4 the shower keeps its VARIANT SLUG — the glass panel rides it (R-8)', () => {
            run(new CreateBathroomPodHandler(), PAYLOAD);
            const pod = podStore.get(POD_ID)!;
            const shower = pod.members.find((m) => m.fixtureType === 'shower');
            expect(shower, 'the default member set includes a shower').toBeDefined();
            const rec = fixtures.get(shower!.id) as unknown as { showerVariant?: string };
            // ⛔ C109 R-8 — there is NO `panel` member and none may be minted. The glass
            // panel and its return are emitted by the shower's OWN builder, decoded from
            // this slug by `walkInGlassSide()`. A separate record would draw the glass
            // twice (C84 EI-9).
            expect(rec.showerVariant).toBe(shower!.variant);
            expect(String(rec.showerVariant)).toMatch(/walkin/);
        });
    });

    // ── ARM B — axis 5: one Ctrl+Z takes the WHOLE pod back ─────────────────
    describe('ARM B — C109 §9 axis 5: undo / redo, through the REAL adapter', () => {
        it('B-1 the adapter resolves the composed runtime and applies the inverse', () => {
            const out = run(new CreateBathroomPodHandler(), PAYLOAD);
            expect(resolveBathroomPodStoreFromWindow(), 'the resolver must find the store').not.toBeNull();

            const adapter = bathroomPodUndoAdapter(resolveBathroomPodStoreFromWindow);
            adapter.applyPatch(out.inverse as never);

            expect(podStore.get(POD_ID), 'one Ctrl+Z removes the pod').toBeUndefined();
            // ⭐ AND EVERY MEMBER GOES WITH IT. This is the half a pod could most easily
            // get wrong: C109 §8 warns that an undeclared store has its patches dropped
            // from undo routing, so "Ctrl+Z would remove the pod and leave every fixture
            // standing". The projection makes that impossible by construction.
            for (const id of MEMBER_IDS) {
                expect(fixtures.get(id), `member ${id} must be reaped by the undo`).toBeUndefined();
            }
            expect(removedEvents.sort()).toEqual([...MEMBER_IDS].sort());
        });

        it('B-2 REDO puts the pod and every member back', () => {
            const out = run(new CreateBathroomPodHandler(), PAYLOAD);
            const adapter = bathroomPodUndoAdapter(resolveBathroomPodStoreFromWindow);

            adapter.applyPatch(out.inverse as never);
            addedEvents = [];
            adapter.applyPatch(out.forward as never);

            expect(podStore.get(POD_ID)).toBeDefined();
            for (const id of MEMBER_IDS) expect(fixtures.get(id)).toBeDefined();
            expect(addedEvents.sort()).toEqual([...MEMBER_IDS].sort());
        });

        it('B-3 an ABSENT runtime THROWS BY NAME — never a silent no-op', () => {
            const out = run(new CreateBathroomPodHandler(), PAYLOAD);
            delete (window as unknown as Record<string, unknown>).runtime;

            // ⛔ L-980's rule, kept rather than bent: `_covered()` saw a working
            // `applyPatch` and promised this side would land. If the runtime is absent
            // the promise is broken and `applyRingBufferSide` must report a per-store
            // FAILURE. Returning quietly would make a broken undo indistinguishable
            // from a successful one.
            const adapter = bathroomPodUndoAdapter(resolveBathroomPodStoreFromWindow);
            expect(() => adapter.applyPatch(out.inverse as never)).toThrow(
                /runtime\.stores\.bathroomPod is not reachable/,
            );
        });
    });

    // ── ARM C — axis 6: delete reaps by the RECORD ──────────────────────────
    describe('ARM C — C109 §7 / R-4: delete reaps every member and orphans none', () => {
        it('C-1 deleting the pod removes every member from the fixture store', () => {
            run(new CreateBathroomPodHandler(), PAYLOAD);
            run(new DeleteBathroomPodHandler(), { podId: POD_ID });

            expect(podStore.get(POD_ID)).toBeUndefined();
            for (const id of MEMBER_IDS) {
                expect(fixtures.get(id), `member ${id} must not outlive its pod`).toBeUndefined();
            }
        });

        it('C-2 a HAND-PLACED fixture in the same room SURVIVES the delete', () => {
            // ⛔ THE CLAUSE C109 §7 EXISTS FOR: *"delete the fixtures inside this
            // rectangle" is wrong the moment an architect hand-places a bidet in the
            // same room.* The reap is by `childrenIds`, from the RECORD — so a bidet
            // sitting in the middle of the pod's own room is untouched.
            run(new CreateBathroomPodHandler(), PAYLOAD);
            fixtures.add({
                id: 'plumbing_01ARZ3NDEKTSV4RRFFQ69G5H99',
                type: 'plumbing_fixture',
                fixtureType: 'bidet',
                position: { x: 1.3, y: 0, z: 1.0 } as never,
                rotation: { x: 0, y: 0, z: 0 } as never,
                levelId: 'level-1',
                baseOffset: 0,
                properties: {},
            } as never);

            run(new DeleteBathroomPodHandler(), { podId: POD_ID });

            expect(
                fixtures.get('plumbing_01ARZ3NDEKTSV4RRFFQ69G5H99'),
                'a hand-placed bidet inside the pod\'s room must survive',
            ).toBeDefined();
        });

        it('C-3 undoing the DELETE restores the pod AND re-projects every member', () => {
            run(new CreateBathroomPodHandler(), PAYLOAD);
            const del = run(new DeleteBathroomPodHandler(), { podId: POD_ID });

            const adapter = bathroomPodUndoAdapter(resolveBathroomPodStoreFromWindow);
            adapter.applyPatch(del.inverse as never);

            expect(podStore.get(POD_ID)).toBeDefined();
            for (const id of MEMBER_IDS) expect(fixtures.get(id)).toBeDefined();
        });

        it('C-4 the pod itself is NOT a plumbing fixture — no id means two objects', () => {
            run(new CreateBathroomPodHandler(), PAYLOAD);
            // ⛔ C84 EI-9. The pod "carries no geometry of its own beyond its placement
            // and its room envelope" (C109 §1); projecting a record for it would put a
            // second object at the same place with a second id.
            expect(fixtures.get(POD_ID)).toBeUndefined();
        });
    });
});
