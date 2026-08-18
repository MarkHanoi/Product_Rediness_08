/**
 * §D3-FORWARD-PATCH-PROBE — the EXECUTED read-back ADR-0331 §D3 has never had.
 *
 * ─── WHAT THIS SUITE IS FOR ──────────────────────────────────────────────────
 * `docs/02-decisions/contracts/C84-ELEMENT-INTEGRITY.md` §9 carries the row:
 *
 *   "ADR-0331 §D3 has never been executed — routing the forward patch through
 *    `elementUndoStoreAdapter` is inferred from that file's own header and
 *    surface analysis. The SPEC sequences a one-verb probe before any wiring."
 *
 * ADR-0331 §D3 decides: *"route the FORWARD patch through the same adapter"*, on
 * the stated ground that the machinery *"exists, is production-tested, and runs
 * today"*. Its two pieces of evidence are both sentences in
 * `apps/editor/src/engine/undo/elementUndoStoreAdapter.ts`'s own header:
 *
 *   - "SURFACE ANALYSIS (verified 2026-05-24 across [13 stores]): all expose
 *      `add(element)` + `remove(id)` + an existence check + `update(id, partial)`."
 *   - "PATCH SHAPE (verified): every `Create<Element>Handler` does
 *      `produceCommand(ctx.stores.<x>, d => d[id] = element)` ... so patches are
 *      store-relative."
 *
 * This suite executes that route instead of reading it: a REAL verb on a REAL
 * `CommandBus` with the REAL plugin handler set, the REAL emitted forward patch
 * taken off the REAL `PatchEmitter`, applied through the REAL adapter to the REAL
 * legacy geometry store, then READ BACK out of that store (C16 CA-21).
 *
 * WHY THE EXISTING SUITE DID NOT ANSWER THIS. `elementUndoStoreAdapter.test.ts`
 * is green, and it is green against `makeStandardStore()` / `makeVariantStore()` —
 * hand-written Maps whose `update` merges and which validate nothing. Both real
 * stores below reject that model, in opposite directions. A fake built from a
 * header cannot falsify the header.
 *
 * ─── THE VERDICT THIS SUITE RECORDS ──────────────────────────────────────────
 * §D3's PATCH-SHAPE half is TRUE (ARM 1). Its SURFACE-ANALYSIS half is FALSE, and
 * routing the forward patch as decided would be a REGRESSION, not a fix:
 *
 *   ARM 2  create   -> the real L1 value is REFUSED by the legacy store's own Zod
 *                      add-schema on four fields; the adapter swallows the throw.
 *   ARM 3  roof     -> the write "succeeds" onto a key the legacy record does not
 *                      have. `pitch` occurs ZERO times in `packages/geometry-roof/src`
 *                      (`grep -rn '\.pitch\b' packages/geometry-roof/src/*.ts` -> no
 *                      matches); the geometry reads `slope`, and in rise/run, not
 *                      radians. Silent, diagnostic-free, and wrong.
 *   ARM 4  slab     -> `SlabStore.update(id, nextState: SlabData)` is a WHOLE-RECORD
 *                      REPLACE, not a merge. A one-key partial ANNIHILATES the record.
 *   ARM 5  absent   -> a depth-2 field patch for an id the store does not hold is a
 *                      silent no-op with ZERO diagnostics, while both whole-element
 *                      arms warn. §D3's own premise is that the legacy store may not
 *                      have received the create, so this is the branch it would meet.
 *
 * ARMS 3-5 ARE NOT HYPOTHETICAL FUTURE STATE — ARM 4's MECHANISM IS ON THE UNDO
 * PATH TODAY. `buildUndoStoreMap()` (`performUndoRedo.ts:308-353`) already maps
 * `slab`->`window.slabStore` and `roof`->`window.roofStore`, so the INVERSE of any
 * `affectedStores:['slab'|'roof']` verb already takes this exact route on Ctrl+Z.
 * The live producer is `_movePatchPair` (`initBusHandlers.ts:565-579`), which emits
 * ONE `{ op:'replace', path:[id, field] }` PER FIELD — a depth-2 op, the ARM 4
 * shape — and `slab.movePolygon` (`initBusHandlers.ts:1110`, `stores:['slab']`,
 * dispatched from the 3-D gizmo at `registerTransformDragHandler.ts:638` and from
 * the plan move tool via `elementMove.ts:397`) uses it with `{ polygon, holes }`.
 * Applied in sequence each op REPLACES the whole record, so the second leaves
 * `{ holes }` alone in the store.
 *
 * ⚠ NOT VERIFIED HERE: no browser session was run. What is measured is the store
 * behaviour and the patch shape; the dispatch-to-Ctrl+Z chain above is read from
 * source. `transformDragUndoCapture.matrix.test.ts:14-17` states that chain as a
 * PRECONDITION ("the precondition performUndo() needs to route an inverse patch
 * through elementUndoStoreAdapter -> window.<x>Store.update()") and asserts the
 * ring-buffer shape only — it never touches a legacy store. That is the gap here.
 *
 * ─── THIS IS A CHARACTERISATION LEDGER, NOT AN APPROVAL ──────────────────────
 * Same form as `WallYDatumAgreement.test.ts` (C84 §9): it records what the route
 * DOES, so a fix has to come here and change these numbers deliberately. Nothing
 * below is a specification of desired behaviour.
 *
 * ─── WATCHED RED ─────────────────────────────────────────────────────────────
 * Break A — `elementUndoStoreAdapter.ts:506` `store.update(id, { [fieldName]: v })`
 *   -> `store.update(id, { ...(_getValue(store,id) as object), [fieldName]: v })`
 *   (the candidate fix): ARM 4 FAILS (the record survives). Restored.
 * Break B — `RoofStore.add`'s `RoofDataAddSchema.safeParse` guard bypassed:
 *   ARM 2 FAILS (the L1 value lands). Restored.
 * Both recorded in the lane report; neither is committed.
 */

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, attachStores, createId } from '@pryzm/plugin-sdk';
import { RoofStore as PluginRoofStore, buildRoofHandlerSet, type RoofsState } from '@pryzm/plugin-roof';
import { SlabStore as PluginSlabStore, buildSlabHandlerSet, type SlabsState } from '@pryzm/plugin-slab';
import { RoofStore as LegacyRoofStore } from '@pryzm/geometry-roof';
import { SlabStore as LegacySlabStore } from '@pryzm/geometry-slab';
import type { Store } from '@pryzm/stores';
import {
    elementUndoStoreAdapter,
    __resetUndoRestoreSnapshots,
} from '../src/engine/undo/elementUndoStoreAdapter.js';

const L0 = 'L0';

type AnyRec = Record<string, unknown>;

/** Every `console.warn`/`console.error` the adapter emits while `fn` runs.
 *  The adapter NEVER throws (C03 §4.6 U-4), so its console output is the only
 *  channel by which a refusal is distinguishable from a success — which is
 *  precisely why an EMPTY list beside an unchanged store is a finding. */
function captureDiagnostics(fn: () => void): string[] {
    const out: string[] = [];
    const oldWarn = console.warn;
    const oldError = console.error;
    console.warn = (...a: unknown[]) => { out.push('warn: ' + a.map(String).join(' ')); };
    console.error = (...a: unknown[]) => { out.push('error: ' + a.map(String).join(' ')); };
    try { fn(); } finally { console.warn = oldWarn; console.error = oldError; }
    return out;
}

interface CapturedRecord { forward: readonly unknown[]; affectedStores: readonly string[] }

/** A real bus with the real handler set, recording every emitted `EventRecord`. */
function makeBus<S extends object>(
    key: string,
    pluginStore: { getState(): Iterable<[string, unknown]> },
    handlers: readonly unknown[],
): { bus: CommandBus; records: CapturedRecord[] } {
    const emitter = new PatchEmitter();
    const records: CapturedRecord[] = [];
    emitter.subscribe((_bytes, record) => { records.push(record as unknown as CapturedRecord); });
    const bus = new CommandBus({
        audit: { actorId: 'd3-probe', projectId: 'p1', clientId: 't1' },
        emitter,
        undoStack: new UndoStack({ maxSize: 50 }),
        storesProvider: () => ({ [key]: Object.fromEntries(pluginStore.getState()) as S }),
    });
    for (const h of handlers) bus.register(h as never);
    attachStores(emitter, { [key]: pluginStore as unknown as Store<object> });
    return { bus, records };
}

/** The legacy-shaped roof record the production `.created` bridge builds —
 *  schema-valid for `RoofDataAddSchema`, so ARM 3 measures the FIELD arm and not
 *  ARM 2's rejection a second time. */
function legacyRoofSeed(id: string): AnyRec {
    return {
        id, type: 'roof', levelId: L0,
        footprint: { polygon: [[0, 0], [5, 0], [5, 5], [0, 5]], centroid: [2.5, 2.5] },
        roofType: 'gable', slope: 0.3, overhang: 0.5, thickness: 0.2, baseOffset: 3,
    };
}

/** Ditto for slab — `SlabValidator.SlabDataSchema` requires `position.y === 0`
 *  and 2-D `{x,y}` polygon points, neither of which the L1 record carries. */
function legacySlabSeed(id: string): AnyRec {
    return {
        id, type: 'slab', levelId: L0, parentId: L0, childrenIds: [],
        position: { x: 0, y: 0, z: 0 },
        polygon: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }],
        thickness: 0.2, baseOffset: 0, holes: [], properties: {},
        ifcData: { guid: 'd3-probe-guid', ifcClass: 'IfcSlab' },
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'system', version: 1 },
    };
}

describe('ADR-0331 §D3 — the forward patch, EXECUTED through elementUndoStoreAdapter', () => {
    /**
     * ARM 1 — the half of the header that IS true.
     *
     * Stated first and separately so nothing below can be read as "the patches
     * are the wrong shape". They are the right shape. That is the trap: a
     * store-relative PATH says nothing about whether the legacy record carries
     * the FIELD that path names, and §D3 reads the first as evidence of the second.
     */
    it('ARM 1 — a real dispatch emits a STORE-RELATIVE patch (path[0] is the element id, not the store key)', async () => {
        __resetUndoRestoreSnapshots();
        const plugin = new PluginRoofStore();
        const { bus, records } = makeBus<RoofsState>('roof', plugin, buildRoofHandlerSet());

        const id = createId('roof');
        await bus.executeCommand('roof.create', {
            id, levelId: L0,
            boundary: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 5 }, { x: 0, y: 0, z: 5 }],
            shape: 'gable', pitch: 0.3, thickness: 0.2,
        });

        const rec = records[records.length - 1]!;
        const patch = rec.forward[0] as { op: string; path: readonly string[] };

        expect(rec.affectedStores, 'the ring buffer is keyed by this').toEqual(['roof']);
        expect(patch.op).toBe('add');
        // Positive AND negative on the SAME expression: it IS the id, and it is
        // NOT the store key — the two ways `path[0]` could have been minted.
        expect(patch.path[0], 'store-relative — the header is right about this').toBe(id);
        expect(patch.path[0], 'not store-PREFIXED').not.toBe('roof');
        expect(patch.path).toHaveLength(1);
    });

    /**
     * ARM 2 — THE CREATE SHAPE, WHICH IS THE ONLY SHAPE THE HEADER CITES.
     *
     * The header's "PATCH SHAPE (verified)" sentence is about creates and nothing
     * else. Executed, the L1 value that patch carries cannot enter the legacy
     * store at all: `RoofStore.add` parses through `RoofDataAddSchema` and throws,
     * and the adapter's per-op `try/catch` turns that into ONE console.error while
     * reporting nothing to any caller.
     */
    it('ARM 2 — the real create forward VALUE is REFUSED by the legacy store schema; the adapter swallows the throw', async () => {
        __resetUndoRestoreSnapshots();
        const plugin = new PluginRoofStore();
        const { bus, records } = makeBus<RoofsState>('roof', plugin, buildRoofHandlerSet());
        const legacy = new LegacyRoofStore({ activeLevelId: L0 } as never);

        const id = createId('roof');
        await bus.executeCommand('roof.create', {
            id, levelId: L0,
            boundary: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 5 }, { x: 0, y: 0, z: 5 }],
            shape: 'gable', pitch: 0.3, thickness: 0.2,
        });
        const forward = records[records.length - 1]!.forward;

        // The command itself worked — said explicitly so the failure below cannot
        // be misread as "the handler is broken".
        expect(plugin.get(id), 'the plugin handler is not the defect').toBeTruthy();

        const diagnostics = captureDiagnostics(() => {
            elementUndoStoreAdapter(legacy as never).applyPatch(forward);
        });

        // THE MEASUREMENT: nothing landed.
        expect(legacy.getById(id), '§D3 routed the forward create — the store stayed empty').toBeUndefined();

        // The reason, read back off the real store's own refusal rather than asserted
        // from the schema file. Four fields, and each names an L1<->legacy divergence
        // that a "surface analysis" of add/remove/update/getById cannot see.
        const why = diagnostics.join(' | ');
        expect(diagnostics, 'the refusal exists — it is not silent').toHaveLength(1);
        expect(why).toContain('[RoofStore.add] Schema validation failed');
        expect(why, 'legacy `footprint` vs L1 `boundary`').toContain('footprint');
        expect(why, 'legacy `roofType` vs L1 `shape`').toContain('roofType');
        expect(why, 'legacy requires baseOffset; L1 has none').toContain('baseOffset');
        expect(why, 'legacy requires metadata.version > 0; L1 mints 0').toContain('metadata.version');
        // ...and it reached NOBODY: it is on the console, not in a return value.
        expect(why, 'the console is the ONLY channel — the op is "skipped", not raised')
            .toContain('op failed (skipped)');
    });

    /**
     * ARM 3 — A FIELD NAME THE LEGACY RECORD DOES NOT HAVE.
     *
     * `roof.setPitch` writes L1 `pitch` (radians). The legacy roof geometry reads
     * `slope` (rise/run) — `RoofGeometryBuilder.ts:520,583,675,707,750,814,854,906`.
     * The adapter's depth-2 arm never consults the legacy record before writing
     * (`_resolveFieldValue` returns `{ok:true}` immediately when `path.length === 2`),
     * so the name divergence the header itself documents for curtain wall
     * (bayWidth->gridXSpacing) is invisible to it on the FIELD path — it is handled
     * only on the whole-element `add` path, and only via a snapshot that a
     * forward-only dispatch has never captured.
     */
    it('ARM 3 — a real field patch lands SILENTLY on a phantom key while the geometry field never moves', async () => {
        __resetUndoRestoreSnapshots();
        const plugin = new PluginRoofStore();
        const { bus, records } = makeBus<RoofsState>('roof', plugin, buildRoofHandlerSet());
        const legacy = new LegacyRoofStore({ activeLevelId: L0 } as never);

        const id = createId('roof');
        await bus.executeCommand('roof.create', {
            id, levelId: L0,
            boundary: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 5 }, { x: 0, y: 0, z: 5 }],
            shape: 'gable', pitch: 0.3, thickness: 0.2,
        });
        legacy.add(legacyRoofSeed(id) as never);            // as the .created bridge does

        records.length = 0;
        await bus.executeCommand('roof.setPitch', { roofId: id, pitch: 0.55 });
        const forward = records[records.length - 1]!.forward;
        expect(forward[0], 'depth-2 replace, store-relative').toMatchObject({
            op: 'replace', path: [id, 'pitch'], value: 0.55,
        });

        const mutations: string[] = [];
        legacy.on('add', () => mutations.push('add'));
        legacy.on('update', () => mutations.push('update'));
        legacy.on('remove', () => mutations.push('remove'));

        const diagnostics = captureDiagnostics(() => {
            elementUndoStoreAdapter(legacy as never).applyPatch(forward);
        });
        const after = legacy.getById(id) as unknown as AnyRec;

        // S7.2's mandated double-write control: exactly ONE store mutation.
        expect(mutations, 'exactly one mutation per dispatch').toEqual(['update']);
        // And it reported no problem whatsoever.
        expect(diagnostics, 'ZERO diagnostics — this is what makes it dangerous').toEqual([]);

        // Positive and negative on the SAME record:
        expect(after.pitch, 'the write LANDED ...').toBe(0.55);
        expect(after.slope, '... on a key nothing reads, while the field the builder DOES read never moved').toBe(0.3);
        // Stated as membership on both sides, so a future rename cannot pass this
        // by making both undefined.
        expect(Object.keys(after)).toContain('pitch');
        expect(Object.keys(legacyRoofSeed(id)), 'pitch was never part of the legacy record').not.toContain('pitch');
    });

    /**
     * ARM 4 — `update(id, partial)` IS NOT UNIVERSAL, AND THE HEADER SAYS IT IS.
     *
     * `SlabStore.update(id: string, nextState: SlabData)` (`SlabStore.ts:259-273`)
     * does `structuredClone(nextState)` -> `freeze` -> `set(id, next)`. It is a
     * WHOLE-RECORD REPLACE. Handing it the adapter's one-key partial replaces the
     * slab with that one key. This is the sentence in the adapter header —
     * "verified ... across [13 stores]: all expose ... `update(id, partial)`" —
     * being false for one of the thirteen, and it is the sentence §D3 rests on.
     */
    it('ARM 4 — on a REPLACE-semantics store the one-key partial ANNIHILATES the legacy record, silently', async () => {
        __resetUndoRestoreSnapshots();
        const plugin = new PluginSlabStore();
        const { bus, records } = makeBus<SlabsState>('slab', plugin, buildSlabHandlerSet());
        const legacy = new LegacySlabStore({ activeLevelId: L0 } as never);

        const id = createId('slab');
        // `slab.create` REFUSES (§FIX-DEAD-VERB-REFUSE), so the L1 record is seeded
        // through the store's own patch surface — the same route `attachStores` uses.
        plugin.applyPatch([{
            op: 'add', path: [id], value: {
                id, type: 'slab', parentId: null, childrenIds: [], levelId: L0,
                metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'system', version: 0 },
                polygon: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 5 }, { x: 0, y: 0, z: 5 }],
                thickness: 0.2, holes: [],
            },
        }] as never);
        legacy.add(legacySlabSeed(id) as never);

        const before = legacy.getById(id) as unknown as AnyRec;
        expect(Object.keys(before), 'a whole slab before the patch').toEqual(
            expect.arrayContaining(['id', 'levelId', 'polygon', 'position', 'thickness', 'ifcData']),
        );

        records.length = 0;
        await bus.executeCommand('slab.setThickness', { slabId: id, thickness: 0.35 });
        const forward = records[records.length - 1]!.forward;
        // Field NAME agrees here — `thickness` on both sides. Chosen deliberately:
        // it isolates the REPLACE defect from ARM 3's rename defect.
        expect(forward[0]).toMatchObject({ op: 'replace', path: [id, 'thickness'], value: 0.35 });

        const diagnostics = captureDiagnostics(() => {
            elementUndoStoreAdapter(legacy as never).applyPatch(forward);
        });
        const after = legacy.getById(id) as unknown as AnyRec;

        expect(diagnostics, 'ZERO diagnostics for a destroyed record').toEqual([]);
        // Positive and negative on the SAME expression: the patched field is there,
        // and it is the ONLY thing there.
        expect(after.thickness, 'the patched field landed ...').toBe(0.35);
        expect(Object.keys(after), '... and it is the whole record now').toEqual(['thickness']);
        expect(after.id, 'the slab no longer knows its own id').toBeUndefined();
        expect(after.polygon, 'nor its outline').toBeUndefined();
        expect(after.levelId, 'nor which storey it is on').toBeUndefined();
    });

    /**
     * ARM 5 — THE BRANCH §D3 WOULD MEET MOST, AND IT IS MUTE.
     *
     * `applyPatch`'s field arm ends `if (!exists || typeof store.update !== 'function') continue;`
     * — no warn, no error. Both whole-element arms DO warn ("skip remove — not
     * found in store", "skip add — exists?"). §D3's entire premise is that the
     * forward write currently lands in the DTO store and NOT in the legacy one, so
     * "the id is absent here" is the ordinary case, not the exotic one; routing
     * forward patches through this arm converts a visible no-op into an invisible one.
     */
    it('ARM 5 — a field patch for an id the legacy store does not hold is a SILENT no-op (the whole-element arm warns; this one does not)', () => {
        __resetUndoRestoreSnapshots();
        const legacy = new LegacyRoofStore({ activeLevelId: L0 } as never);
        const adapter = elementUndoStoreAdapter(legacy as never);

        const fieldArm = captureDiagnostics(() => {
            adapter.applyPatch([{ op: 'replace', path: ['roof_ABSENT', 'slope'], value: 0.9 }]);
        });
        const wholeElementArm = captureDiagnostics(() => {
            adapter.applyPatch([{ op: 'remove', path: ['roof_ABSENT'] }]);
        });

        expect(legacy.getById('roof_ABSENT')).toBeUndefined();
        // Negative and positive on the SAME adapter, same absent id, same call:
        expect(fieldArm, 'the field arm says nothing at all').toEqual([]);
        expect(wholeElementArm.join(' '), 'the whole-element arm, on the identical id, does')
            .toContain('skip remove');
    });
});
