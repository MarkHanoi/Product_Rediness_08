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
// ─── THE FINDING ─────────────────────────────────────────────────────────────
// `SlabStore.update(id, nextState: SlabData)` (`SlabStore.ts:259-273`) REPLACES
// the record. The adapter writes one-key partials. Two fields ⇒ two replaces ⇒ the
// slab that was moved is left holding its LAST patched field and nothing else:
// no id, no polygon, no position, no levelId, no ifcData, no thickness. Frozen,
// still under its own key, and `performUndo` reports the store as APPLIED.
//
// This is a CHARACTERISATION LEDGER (C84 §9, the `WallYDatumAgreement` form): it
// records what Ctrl+Z does today so a fix has to come here and change it.
//
// ─── WATCHED RED ─────────────────────────────────────────────────────────────
// With `elementUndoStoreAdapter.ts`'s field write changed to spread the current
// record first, this suite FAILS at "the record is gone" — the slab survives with
// its polygon reverted, which is what a working undo looks like. Restored; the
// candidate fix is documented at that line and is NOT landed here (WallStore's
// change-detection side effects need their own RED-first proof).

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

describe('§D3 ARM 6 — Ctrl+Z on a moved slab, through the REAL performUndo and the REAL legacy store', () => {
    beforeEach(() => {
        __resetUndoRestoreSnapshots();
        delete (window as unknown as AnyRec).runtime;
        delete (globalThis as unknown as AnyRec).commandManager;
        delete (window as unknown as AnyRec).slabStore;
    });

    it('leaves the slab record holding ONE field and nothing else — silently, and reported as applied', () => {
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

        // Negative, on the same record: everything that made it a slab is gone.
        // `holes` is last in the entry, so it is the survivor.
        expect(Object.keys(after!), 'the LAST patched field is the whole record now').toEqual(['holes']);
        expect(after!.id, 'no id').toBeUndefined();
        expect(after!.polygon, 'no outline — the field the undo was FOR').toBeUndefined();
        expect(after!.position, 'no position').toBeUndefined();
        expect(after!.levelId, 'no storey').toBeUndefined();
        expect(after!.thickness, 'no thickness').toBeUndefined();
        expect(after!.ifcData, 'no IFC identity — the GUID an export needs').toBeUndefined();

        // And the thing the user pressed Ctrl+Z to get back is NOT back: the
        // pre-move polygon was written and then destroyed by the very next op.
        expect(after!.polygon, 'the revert did not survive its own patch list').not.toEqual(PREV_POLYGON);
    });

    /**
     * CONTROL — the SAME store, the SAME adapter, a ONE-op entry.
     *
     * Without this the suite would prove only "two ops clobber each other". With
     * it the finding is exact: even a single field patch replaces the record, so
     * the defect is `update`'s REPLACE semantics and not op ordering.
     */
    it('CONTROL — a ONE-field entry destroys the record too, so this is REPLACE semantics, not op ordering', () => {
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
        // Negative, same record: and it is now the only thing the slab has.
        expect(Object.keys(after!), '... onto a record with nothing else left').toEqual(['polygon']);
    });
});
