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
 * ⚠ UPDATED 2026-08-18 (L-977). ARMS 3, 4 and 5 NOW ASSERT THE FIXED BEHAVIOUR,
 * DELIBERATELY — they are not "regressions worked around". The three defects they
 * characterised were closed in `elementUndoStoreAdapter.ts`'s field arm, so an
 * unchanged ARM would have gone red against its own subject's repair. What each
 * one asserts NOW, and why the arm is still worth keeping:
 *
 *   ARM 3  the `pitch` write is REFUSED with a cited diagnostic, `slope` is
 *          untouched, and the record is whole. The arm still proves the NAME
 *          divergence is real — it just proves the adapter now says so instead of
 *          writing through it. It is deliberately NOT translated: the per-family
 *          L1->legacy shape translator is SPEC S7.2a, a PREREQUISITE of §D3, and
 *          minting a `tan()` here one field at a time is how a translator ends up
 *          existing in thirteen half-versions.
 *   ARM 4  the slab SURVIVES with every field, because the adapter now builds the
 *          complete replacement object `SlabStore`'s own contract asks for. It is
 *          also the arm that proves the fix is KEY-DRIVEN: `elementUndoStoreAdapter`
 *          is called with the store key `'slab'`, exactly as `adaptElementStoreMap`
 *          calls it. Called WITHOUT a key it still falls back to the historical
 *          one-key partial, loudly — asserted below, because a direct caller
 *          (which is what a future §D3 forward route would be) MUST pass its key.
 *   ARM 5  the field arm now warns on the absent id, like the whole-element arm
 *          beside it. §D3's premise is that this branch is the ORDINARY case.
 *
 * §D3's SURFACE-ANALYSIS verdict is UNCHANGED: it was false, and ARM 2 (the create
 * refusal) is still open. What L-977 closed is the reachable-today undo half.
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
 * Break B — `RoofStore.add`'s `RoofDataAddSchema.safeParse` guard bypassed:
 *   ARM 2 FAILS (the L1 value lands). Restored, not committed.
 *
 * ⚠ Break A is HISTORY, not a live control. It read: change the field write to
 * spread the current record first (the candidate fix) and ARM 4 fails because the
 * record survives. That candidate was measured against ALL the stores in L-977 and
 * REJECTED — correct for the four replace stores, wrong for the merge stores whose
 * `update()` branches on key PRESENCE. What shipped instead is a per-store
 * declaration (`src/engine/undo/legacyStoreUpdateSemantics.ts`), and ARM 4 now
 * asserts the surviving record deliberately. The live RED controls for the shipped
 * fix are in `LegacyStoreUpdateSemantics.measured.test.ts`: reverting the adapter
 * reddens ARM B for slab/column/furniture/plumbing, and installing the REJECTED
 * blanket spread reddens ARM C — and ONLY ARM C, which is why ARM C exists.
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
    it('ARM 3 — §L-977: the L1 `pitch` name is REFUSED with a cited diagnostic; `slope` and the record are untouched', async () => {
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

        // The record AS THE STORE HOLDS IT (add() backfills defaults), captured
        // before the patch so "unchanged" is measured against the real prior and
        // not against the seed literal.
        const beforeRoof = legacy.getById(id) as unknown as AnyRec;
        expect(Object.keys(beforeRoof), 'seeded and holding slope').toContain('slope');

        const mutations: string[] = [];
        legacy.on('add', () => mutations.push('add'));
        legacy.on('update', () => mutations.push('update'));
        legacy.on('remove', () => mutations.push('remove'));

        const diagnostics = captureDiagnostics(() => {
            // `'roof'` is the bus store key `buildUndoStoreMap()` binds this store
            // to; it is how the adapter reaches the measured declaration.
            elementUndoStoreAdapter(legacy as never, 'roof').applyPatch(forward);
        });
        const after = legacy.getById(id) as unknown as AnyRec;

        // §L-977. The refusal is real and it is CITED — both names and both units.
        expect(diagnostics, 'the refusal exists — this branch used to be mute').toHaveLength(1);
        const why = diagnostics.join(' | ');
        expect(why).toContain('§L-977 REFUSED');
        expect(why, 'names the L1 field').toContain("'pitch'");
        expect(why, 'names the legacy counterpart').toContain("'slope'");
        expect(why, 'names the unit mismatch').toContain('RADIANS');

        // S7.2's mandated double-write control, inverted: the refusal means ZERO
        // store mutations, not one. Stated positively too — `mutations` is a live
        // recorder, and it did capture the seeding `add` before it was reset.
        expect(mutations, 'a refusal writes NOTHING').toEqual([]);

        // Positive and negative on the SAME record:
        expect(after.slope, 'the field the builder reads is untouched ...').toBe(0.3);
        expect(after.pitch, '... and the phantom key was never minted').toBeUndefined();
        // Stated as membership on both sides, so a future rename cannot pass this
        // by making both undefined.
        expect(Object.keys(after), 'the record is whole').toEqual(Object.keys(beforeRoof));
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
    it('ARM 4 — §L-977: on a REPLACE-semantics store the KEYED adapter writes a complete replacement and the slab survives', async () => {
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
            elementUndoStoreAdapter(legacy as never, 'slab').applyPatch(forward);
        });
        const after = legacy.getById(id) as unknown as AnyRec;

        expect(diagnostics, 'a correct write needs no diagnostic').toEqual([]);
        // Positive and negative on the SAME expression: the patched field landed,
        // and it is NOT the only thing there any more.
        expect(after.thickness, 'the patched field landed ...').toBe(0.35);
        expect(Object.keys(after), '... onto a record that kept everything else').toEqual(Object.keys(before));
        expect(after.id, 'the slab still knows its own id').toBe(id);
        expect(after.polygon, 'still has its outline').toEqual(before.polygon);
        expect(after.levelId, 'still knows which storey it is on').toBe(L0);

        // ── THE KEY IS LOAD-BEARING, AND AN UNKEYED CALLER IS TOLD SO ──────────
        // The declaration is reached by store key. A direct caller that omits it —
        // which is precisely what a future §D3 forward route would be if it copied
        // ARM 4's old call — gets the historical one-key partial back, and the
        // adapter says so on the console rather than destroying the record quietly.
        const legacy2 = new LegacySlabStore({ activeLevelId: L0 } as never);
        legacy2.add(legacySlabSeed(id) as never);
        const unkeyed = captureDiagnostics(() => {
            elementUndoStoreAdapter(legacy2 as never).applyPatch(forward);
        });
        expect(unkeyed.join(' | '), 'the omission is REPORTED, not guessed at')
            .toContain('§L-977 UNDECLARED STORE');
        expect(Object.keys(legacy2.getById(id) as unknown as AnyRec),
            'and the historical destruction is what it falls back to — hence the error')
            .toEqual(['thickness']);
    });

    /**
     * ARM 5 — THE BRANCH §D3 WOULD MEET MOST, AND IT IS MUTE.
     *
     * `applyPatch`'s field arm USED TO END `if (!exists || typeof store.update !==
     * 'function') continue;` — no warn, no error. Both whole-element arms DO warn
     * ("skip remove — not found in store", "skip add — exists?"). §D3's entire
     * premise is that the forward write currently lands in the DTO store and NOT in
     * the legacy one, so "the id is absent here" is the ordinary case, not the
     * exotic one; routing forward patches through a mute arm converts a visible
     * no-op into an invisible one.
     *
     * §L-977 gave the field arm a voice. This arm now asserts that BOTH branches
     * speak on the identical absent id — the asymmetry was the defect, so the
     * assertion is stated as a comparison between the two arms and not as a bare
     * "it warns", which a future silencing of BOTH would still satisfy.
     */
    it('ARM 5 — §L-977: a field patch for an absent id now SPEAKS, like the whole-element arm beside it', () => {
        __resetUndoRestoreSnapshots();
        const legacy = new LegacyRoofStore({ activeLevelId: L0 } as never);
        const adapter = elementUndoStoreAdapter(legacy as never, 'roof');

        const fieldArm = captureDiagnostics(() => {
            adapter.applyPatch([{ op: 'replace', path: ['roof_ABSENT', 'slope'], value: 0.9 }]);
        });
        const wholeElementArm = captureDiagnostics(() => {
            adapter.applyPatch([{ op: 'remove', path: ['roof_ABSENT'] }]);
        });

        expect(legacy.getById('roof_ABSENT'), 'nothing was created by either arm').toBeUndefined();
        // Both arms, same adapter, same absent id — and the field arm names the id
        // and the path so the reader can tell WHICH revert did nothing.
        expect(fieldArm, 'the field arm is no longer mute').toHaveLength(1);
        expect(fieldArm.join(' '), 'and it says what did not happen')
            .toContain('reverted NOTHING');
        expect(fieldArm.join(' '), 'naming the id').toContain('roof_ABSENT');
        expect(wholeElementArm.join(' '), 'the whole-element arm, on the identical id, still does too')
            .toContain('skip remove');
    });
});
