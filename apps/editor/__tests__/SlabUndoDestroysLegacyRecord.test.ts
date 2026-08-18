// @vitest-environment happy-dom
//
// §D3-FORWARD-PATCH-PROBE, ARM 6 — THE SAME DEFECT, DRIVEN THROUGH `performUndo()`.
//
// ─── WHY THIS FILE EXISTS SEPARATELY ─────────────────────────────────────────
// `D3ForwardPatchThroughAdapter.probe.test.ts` calls the adapter directly, which
// answers ADR-0331 §D3 (a route that does not exist yet). It leaves the sharper
// question open: is the SAME mechanism already reachable on the UNDO path that
// ships today? That question cannot be answered by calling the adapter — it has
// to go through `performUndo()`, `buildUndoStoreMap()` and `applyRingBufferSide`,
// which is what this file does. §committed-is-not-reachable: prove it at the
// layer the user experiences, not at a function's return value.
//
// ⚠ WHAT IS REAL HERE AND WHAT IS NOT.
//   REAL — `performUndo()` (the Ctrl+Z entry point), `buildUndoStoreMap()`,
//          `elementUndoStoreAdapter`, `applyRingBufferSide`'s JSON-Pointer decode,
//          and `@pryzm/geometry-slab`'s `SlabStore` — the singleton `initTools.ts:995`
//          and `initBuilders.ts:343` assign to `window.slabStore`, and the one
//          `SlabFragmentBuilder`, the plan projector, the IFC exporter and
//          `ProjectSerializer` all read.
//   STAND-IN — the ring-buffer cursor and `commandManager`, mirroring
//          `performUndoRedo.test.ts`'s own stubs. They decide WHICH entry is
//          undone, not what an entry DOES to a store, and it is the latter under test.
//   NOT RUN — a browser session. The entry below carries the shape
//          `_movePatchPair` (`initBusHandlers.ts:565-579`) produces: one
//          `{ op:'replace', path:[id, field] }` PER FIELD. It is asserted here as
//          data because that helper is a closure inside `registerBusHandlers` and
//          cannot be imported; the transcription is one loop and is quoted above
//          it. Its live consumer is `slab.movePolygon` (`initBusHandlers.ts:1110`,
//          `stores: ['slab']`), dispatched from the 3-D gizmo
//          (`registerTransformDragHandler.ts:638`) and the plan move tool
//          (`elementMove.ts:397`) whenever `_recordUndo` is set.
//
// ─── THE FINDING (2026-08-18, lane AD1) ──────────────────────────────────────
// `SlabStore.update(id, nextState: SlabData)` (`SlabStore.ts:259-273`) REPLACES
// the record. The adapter wrote one-key partials. Two fields ⇒ two replaces ⇒ the
// slab that was moved was left holding its LAST patched field and nothing else:
// no id, no polygon, no position, no levelId, no ifcData, no thickness. Frozen,
// still under its own key, and `performUndo` reported the store as APPLIED.
//
// ─── CLOSED 2026-08-18 (L-977, lane UA1) — AND THIS FILE CHANGED SIDES ───────
// ⚠ THE ASSERTIONS BELOW WERE INVERTED DELIBERATELY. This began as a
// CHARACTERISATION LEDGER (C84 §9, the `WallYDatumAgreement` form): it recorded
// what Ctrl+Z DID so a fix would have to come here and change it. The fix came,
// so it changed it. Leaving the old expectations and routing around them would
// have pinned the data loss as the contract.
//
// WHAT THE FIX WAS, AND WHY IT IS NOT THE OBVIOUS ONE. The candidate this file's
// old header describes — "spread the current record first" — is correct for a
// REPLACE store and WRONG for several MERGE stores, whose `update()` branches on
// WHICH KEYS ARE PRESENT (`WallStore` clears `_sourceBaseLine` on `'baseLine' in
// updates`, warns-and-drops `openings`, deletes hosted children on `childrenIds`,
// and Zod-validates the ARGUMENT). All twenty-one stores the adapter is handed
// were therefore MEASURED, and the write shape now comes from a per-store
// declaration carrying its file:line evidence:
// `apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts`.
// FOUR replace — slab, column, furniture, plumbing — not the one that was known.
//
// WHAT THIS FILE ASSERTS NOW: the same keypress, on the same real store, through
// the same real `performUndo`, leaves a WHOLE slab whose polygon is the pre-move
// outline. Both halves are asserted — the record's completeness AND the revert
// value — because a fix that restored the record but lost the revert would have
// satisfied the old ledger's inverse just as well.
//
// ─── WATCHED RED ─────────────────────────────────────────────────────────────
// Reverting `legacyStoreUpdateSemantics.ts`'s `slab` row from 'replace' to
// 'merge' puts both cases below back to red at "the record survived whole",
// leaving `{ holes: [] }` — i.e. this suite fails if the declaration ever stops
// telling the truth about `SlabStore`, not merely if the adapter is edited.

import { describe, it, expect, beforeEach } from 'vitest';
import { performUndo } from '../src/engine/undo/performUndoRedo.js';
import { __resetUndoRestoreSnapshots } from '../src/engine/undo/elementUndoStoreAdapter.js';
import { SlabStore as LegacySlabStore } from '@pryzm/geometry-slab';

const L0 = 'L0';
const SLAB_ID = 'slab_01KSDNXWM0510W2JHHHNYESK11';

type AnyRec = Record<string, unknown>;

const PREV_POLYGON = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
const MOVED_POLYGON = [{ x: 2, y: 1 }, { x: 6, y: 1 }, { x: 6, y: 5 }, { x: 2, y: 5 }];

function legacySlab(polygon: ReadonlyArray<{ x: number; y: number }>): AnyRec {
    return {
        id: SLAB_ID, type: 'slab', levelId: L0, parentId: L0, childrenIds: [],
        position: { x: 0, y: 0, z: 0 },
        polygon: polygon.map(p => ({ ...p })),
        thickness: 0.25, baseOffset: 0, holes: [], properties: { mark: 'SB001' },
        ifcData: { guid: 'arm6-guid', ifcClass: 'IfcSlab' },
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'system', version: 1 },
    };
}

/**
 * The ring-buffer entry a slab move leaves behind. `_movePatchPair` is:
 *
 *     for (const field of Object.keys(next)) {
 *       forward.push({ op: 'replace', path: [id, field], value: next[field] });
 *       inverse.push({ op: 'replace', path: [id, field], value: prev[field] });
 *     }
 *
 * stored as RFC-6902 JSON Pointers and decoded back by `patchSideToImmer`.
 * `slab.movePolygon` calls it with `{ polygon, holes }` when the mover sent holes.
 */
function slabMoveEntry() {
    const ptr = (field: string) => `/${SLAB_ID}/${field}`;
    return {
        forward: {
            ops: [
                { op: 'replace' as const, path: ptr('polygon'), value: MOVED_POLYGON },
                { op: 'replace' as const, path: ptr('holes'), value: [] },
            ],
        },
        inverse: {
            ops: [
                { op: 'replace' as const, path: ptr('polygon'), value: PREV_POLYGON },
                { op: 'replace' as const, path: ptr('holes'), value: [] },
            ],
        },
        affectedStores: ['slab'],
    };
}

function makeRingBuffer(pair: ReturnType<typeof slabMoveEntry>) {
    let cursorHasUndo = true;
    return {
        canUndo: () => cursorHasUndo,
        canRedo: () => !cursorHasUndo,
        current: () => (cursorHasUndo ? pair : null),
        peek: () => (!cursorHasUndo ? pair : null),
        undoPatch: () => { if (!cursorHasUndo) return null; cursorHasUndo = false; return pair.inverse; },
        redoPatch: () => { if (cursorHasUndo) return null; cursorHasUndo = true; return pair.forward; },
    };
}

/** The `commandManager` half — empty, so the ring buffer owns this gesture and
 *  nothing below can be explained away as a legacy-stack fallback. */
function makeCommandManager() {
    return {
        entries: [] as unknown[],
        undo: () => { throw new Error('commandManager.undo() must not be reached — the ring buffer covers `slab`'); },
        redo: () => {},
        canUndo: () => false,
        canRedo: () => false,
        peekUndoTimestamp: () => null,
        peekUndoTargetIds: () => [] as string[],
        peekUndoGestureId: () => null,
        peekRedoTimestamp: () => null,
        dropEntriesForTargets: () => 0,
    };
}

describe('§L-977 / §D3 ARM 6 — Ctrl+Z on a moved slab, through the REAL performUndo and the REAL legacy store', () => {
    beforeEach(() => {
        __resetUndoRestoreSnapshots();
        delete (window as unknown as AnyRec).runtime;
        delete (globalThis as unknown as AnyRec).commandManager;
        delete (window as unknown as AnyRec).slabStore;
    });

    it('reverts the outline and leaves the slab WHOLE — every field it had before the keypress', () => {
        const legacy = new LegacySlabStore({ activeLevelId: L0 } as never);
        legacy.add(legacySlab(MOVED_POLYGON) as never);

        // The store is genuinely populated before the keypress — stated so the
        // assertions below cannot be satisfied by an empty store.
        const before = legacy.getById(SLAB_ID) as unknown as AnyRec;
        expect(before, 'seeded').toBeTruthy();
        expect(Object.keys(before)).toEqual(
            expect.arrayContaining(['id', 'type', 'levelId', 'position', 'polygon', 'thickness', 'ifcData']),
        );

        (window as unknown as AnyRec).runtime = { bus: { ringBuffer: makeRingBuffer(slabMoveEntry()) } };
        (globalThis as unknown as AnyRec).commandManager = makeCommandManager();
        (window as unknown as AnyRec).slabStore = legacy;

        // THE KEYPRESS.
        const result = performUndo() as unknown as { source?: string } | boolean;

        const after = legacy.getById(SLAB_ID) as unknown as AnyRec | undefined;

        // Positive: the ring buffer DID own this, and the store DID receive it.
        expect(result, 'performUndo did not refuse').toBeTruthy();
        expect(after, 'the key is still occupied — this is not a delete').toBeTruthy();

        // HALF ONE — THE RECORD SURVIVED. Asserted as the full key set against the
        // pre-keypress record, not as a spot-check, so a fix that saved six fields
        // and dropped the seventh cannot pass.
        expect(Object.keys(after!), 'every field it had before the keypress').toEqual(Object.keys(before));
        expect(after!.id, 'it still knows its own id').toBe(SLAB_ID);
        expect(after!.position, 'still has a position').toEqual({ x: 0, y: 0, z: 0 });
        expect(after!.levelId, 'still knows its storey').toBe(L0);
        expect(after!.thickness, 'still has a thickness').toBe(0.25);
        expect(after!.ifcData, 'still has the IFC identity an export needs')
            .toEqual({ guid: 'arm6-guid', ifcClass: 'IfcSlab' });

        // HALF TWO — AND THE USER GOT THE REVERT THEY ASKED FOR. The old defect
        // failed BOTH halves; a fix that restored the record while losing the
        // revert would fail only this one, so it is asserted separately.
        expect(after!.polygon, 'the pre-move outline is back').toEqual(PREV_POLYGON);
        expect(after!.polygon, 'and it is not the moved one').not.toEqual(MOVED_POLYGON);
        // `holes` is the LAST op in the entry — the field that used to be the whole
        // record. It landed as its own value, not as a replacement for everything.
        expect(after!.holes, 'the second op wrote its own field ...').toEqual([]);
    });

    /**
     * CONTROL — the SAME store, the SAME adapter, a ONE-op entry.
     *
     * Without this the suite would prove only "two ops no longer clobber each
     * other" — which multi-op batching, op de-duplication or a dozen other changes
     * could also produce. With it the claim is exact: the single-field case, which
     * has no ordering to get wrong, is correct too. That is the difference between
     * "the ops stopped fighting" and "the WRITE SHAPE is right".
     */
    it('CONTROL — a ONE-field entry keeps the record whole, so the write shape is right, not just the op order', () => {
        const legacy = new LegacySlabStore({ activeLevelId: L0 } as never);
        legacy.add(legacySlab(MOVED_POLYGON) as never);

        const oneOp = {
            forward: { ops: [{ op: 'replace' as const, path: `/${SLAB_ID}/polygon`, value: MOVED_POLYGON }] },
            inverse: { ops: [{ op: 'replace' as const, path: `/${SLAB_ID}/polygon`, value: PREV_POLYGON }] },
            affectedStores: ['slab'],
        };
        (window as unknown as AnyRec).runtime = { bus: { ringBuffer: makeRingBuffer(oneOp) } };
        (globalThis as unknown as AnyRec).commandManager = makeCommandManager();
        (window as unknown as AnyRec).slabStore = legacy;

        performUndo();

        const after = legacy.getById(SLAB_ID) as unknown as AnyRec | undefined;
        // Positive: the revert VALUE is correct — the adapter resolved the patch right.
        expect(after!.polygon, 'the pre-move outline is restored ...').toEqual(PREV_POLYGON);
        // Positive, same record: onto a slab that still has everything else.
        expect(Object.keys(after!), '... onto a record that kept every other field')
            .toEqual(Object.keys(legacySlab(MOVED_POLYGON)));
        expect(after!.ifcData, 'including the IFC identity')
            .toEqual({ guid: 'arm6-guid', ifcClass: 'IfcSlab' });
        // Negative, same record: nothing was invented either.
        expect(Object.keys(after!), 'and gained no phantom keys').not.toContain('pitch');
    });
});
