/**
 * @vitest-environment happy-dom
 */
// componentJoinThroughComposedRuntime — §COMPONENT-PLACE (audit §12 Phase 4C).
//   ADR-0376 **D9** · C16 **CA-21** · C69 · C84 EI-1 / EI-6 / §6.2 · C13 · C47 ·
//   spec §63 (placement + persistence) · spec §66 F-2 · audit R11 / R12 / R14.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THIS FILE IS THE LANE'S DELIVERABLE. THE SCHEMA AND THE PLUGIN ARE NOT.
// ═══════════════════════════════════════════════════════════════════════════════
//
// The audit's §3.1 headline gap: **there is no bus verb anywhere in this repository
// that places a component into a project.** Every arm below exists to answer the
// one question that gap raises — *is there one NOW, and does it reach the model the
// user's project is made of?* — in the only way this repository accepts.
//
// ─── ⛔ WHY IT NEVER CONSTRUCTS A STORE, A `stores` OBJECT OR A BUS ────────────
// R12, verbatim: *"Had I probed the DTO store, all fifteen would have shown a
// correct patch and returned a FALSE PASS."* And R14: `tests/family-load-into-
// project/` — a directory whose NAME is this lane's subject — touches no project,
// no store, no element and no bus. And the pool: a thorough suite that ran the real
// bus, the real ring buffer and the real multi-store router, green for weeks, while
// `pool.create` could not be dispatched by the application AT ALL — because the
// suite SUPPLIED the stores provider, and the stores provider was the broken thing
// ([[fake-more-capable-than-real]]).
//
// So this file obtains its runtime the one way P1 permits — `composeRuntime()` — and
// reads `rt.stores.component`, the SAME key `ProjectSerializer.readPluginStore
// ('component')` resolves in production. Delete the `component` descriptor from
// `PluginRegistry.ts`, or the `component` key from `StoresSlot`, and arms below go
// RED rather than silently empty.
//
// ─── ⛔ AND WHY NO ARM READS `success: true`, A SPY, OR A PATCH SHAPE ──────────
// C16 **CA-21** is absolute: *"dispatch, then read the property back out of the
// AUTHORITATIVE store."* At the last recorded reading, executed read-back was
// PROVEN for **7 of 326** verbs. Every assertion below reads
// `rt.stores.component.getState().get(id)` — the store `ProjectSerializer` saves
// from and `restoreCompoundFamilies` restores into. `executeCommand`'s return value
// is used for exactly one thing: proving a REFUSAL rejected.
//
// ─── ⚠ WHAT THIS FILE DOES NOT PROVE — stated, so a green is not over-read ────
//  1. **That a placed component RENDERS.** Nothing subscribes the component store's
//     dirty channel at this commit; the 3-D leg is Phase 4E's under ADR-0376 D10,
//     whose descope is PRE-AUTHORISED. Not measured here, and not claimed anywhere.
//  2. **That a CLICK places one.** There is no plan-view tool for this family yet
//     (Phase 4F). These arms prove the VERB is reachable and lands, not that a
//     gesture reaches the verb.
//  3. ⭐ **CAVEAT CLOSED BY LANE U0 (2026-09-02).** This entry used to declare:
//     *"there is no project-level definition registry at this commit."* There is
//     now — `apps/editor/src/services/componentCatalog/` — and the handlers
//     ENFORCE definition-existence through it, which is why `beforeAll` below
//     loads the fixture definition through `packFamily` → the ONE loader before
//     any arm places. The enforcement itself is proven red-first in
//     `componentCatalogSeamThroughComposedRuntime.test.ts` (the U0 acceptance);
//     THIS file keeps proving the join and its persistence.
//  4. **That a parameter RESOLVES through the ladder.** `resolveParameter()` in
//     `@pryzm/family-runtime` is 4A's, and reaching it needs the definition document
//     that (3) says is not reachable. ARM F proves the STRUCTURAL precondition F-2
//     depends on — that no occurrence holds a resolved copy to go stale — which is
//     what this lane owns; it does not evaluate a width.
//  5. The ~24 LEGACY stores the serializer also reads are SENTINELS in ARM G (the
//     device `persistedFamiliesReachTheSerializerChannel.test.ts` and
//     `snapshotFamilyRoundTrip.spec.ts` both use). Those families are not the
//     subject, and hand-building two dozen geometry stores would be a larger fake
//     than the one it replaces.

import { describe, expect, it, beforeAll } from 'vitest';

import { composeRuntime } from '@pryzm/runtime-composer';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { ComponentStore } from '@pryzm/plugin-component';
// ⭐ Lane U0 — the SAME singleton PluginRegistry injects into the handlers; the
// fixture definition is loaded into it below so the arms' placements RESOLVE.
import { componentCatalog } from '../src/services/componentCatalog/index.js';
import { ProjectSerializer } from '../src/engine/persistence/ProjectSerializer';
import { restoreCompoundFamilies } from '../src/engine/persistence/restoreCompoundFamilies';
import { SNAPSHOT_FAMILY_COVERAGE } from '../src/engine/persistence/snapshotFamilyCoverage';
import { buildUndoStoreMap, UNMAPPED_BUS_STORE_KEYS } from '../src/engine/undo/performUndoRedo';

const AUDIT = { actorId: 'component-join', projectId: 'component-join', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });

    // ⭐ Lane U0 — load the fixture definition through packFamily → the ONE loader,
    // into the SAME catalogue the handlers consult. Without this, every placement
    // below is refused BY NAME (caveat 3 above, closed; proven red-first in the U0
    // acceptance file). ⚠ There is no corpus (C111 §3.1) — the fixture is authored
    // here and that is stated, not hidden. Parameter defaults are in the
    // family-runtime canonical unit (mm); placements stay in metres (D3).
    componentCatalog.clear();
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [],
        parameters: [
            { id: PARAM_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_HEIGHT, name: 'Height', kind: 'instance', dataType: 'length', defaultValue: 1500, expression: null, ifcMapping: null, exposed: true },
        ],
        profiles: [],
        solids: [],
        materialSlots: [],
        types: [
            { id: TYPE_A, name: 'W1200', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
            { id: TYPE_B, name: 'W600', values: { [PARAM_WIDTH]: 600 }, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
        ],
        representations: [],
        connectors: [],
        propertySets: [],
        featureEdges: [],
    } as unknown as FamilyDocument;
    const manifest: FamilyManifest = {
        formatVersion: '1.1',
        id: DEF_ID,
        name: 'JoinFixtureWindow',
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'component-join' },
        description: 'componentJoin fixture',
        ifcEntity: 'IfcWindow',
        category: 'Window',
        tags: [],
        minPRYZMVersion: '2.0.0',
        schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        createdAt: '2026-09-02T00:00:00.000Z',
        lastModifiedAt: '2026-09-02T00:00:00.000Z',
    } as unknown as FamilyManifest;
    const packed = await packFamily({ manifest, document });
    if (!packed.ok) throw new Error(`[test] packFamily failed: ${(packed as { message?: string }).message}`);
    const loaded = await componentCatalog.loadFromBytes(packed.bytes, { provenance: 'project' });
    if (!loaded.ok) throw new Error(`[test] catalogue load failed: ${loaded.message}`);
}, BUDGET);

// ── IDS ──────────────────────────────────────────────────────────────────────
// ⚠ EVERY ID IS A REAL PREFIXED ULID, NOT A READABLE SLUG.
// `defineElement('component')` enforces /^component_[0-9A-HJKMNP-TV-Z]{26}$/ and the
// handlers enforce `fam_` / `typ_` / `par_` + ULID (C111 §1.1-a). Crockford base32
// excludes I, L, O and U — a test that had seeded the store directly would never
// have met these rules, which is one more reason everything below goes through the
// bus.
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5F';
/** A distinct, VALID ULID tail per index — no I/L/O/U, exactly 26 characters. */
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const COMPONENT_ID = `component_${ulidN(0)}`;
const DEF_ID = `fam_${ulidN(1)}`;
const TYPE_A = `typ_${ulidN(2)}`;
const TYPE_B = `typ_${ulidN(3)}`;
const PARAM_WIDTH = `par_${ulidN(4)}`;
const PARAM_HEIGHT = `par_${ulidN(5)}`;

/** The founder's §64 window, as a PLACEMENT: 1.200 m × 1.500 m, in METRES (D3). */
const PLACE = {
    componentId: COMPONENT_ID,
    levelId: LEVEL_ID,
    definitionId: DEF_ID,
    typeId: TYPE_A,
    definitionVersion: '1.0.0',
    origin: { x: 2, y: 0, z: 3 },
    rotation: 0,
};

/** ⛔ Read off `rt`, NEVER constructed — a store this file built could falsify nothing. */
function store(): any {
    const s = (rt.stores as Record<string, unknown>)['component'];
    if (s === undefined) {
        throw new Error(
            '[test] runtime.stores.component is undefined on the REAL composed runtime — the ' +
            'PluginRegistry descriptor or the StoresSlot key is missing, which is exactly the ' +
            'L-11530 defect this file exists to make unrepeatable.',
        );
    }
    return s;
}

/** ⭐ THE CA-21 READ-BACK. The authoritative record, out of the authoritative store. */
function readBack(id: string): any {
    return store().getState().get(id);
}

function wipe(): void {
    const ids = [...store().getState().keys()];
    if (ids.length > 0) store().applyPatch(ids.map((id: string) => ({ op: 'remove', path: [id] })));
}

/** Sentinel for the ~24 LEGACY stores the serializer also reads (caveat 5). */
function sentinel(): any {
    return {
        getAll: () => [], getLevels: () => [], isBuiltIn: () => true, getCustom: () => [],
        size: () => 0, serialize: () => ({}), getState: () => new Map(), activeLevelId: LEVEL_ID,
    };
}
function serializerBundle(): any {
    const b: any = {};
    for (const k of [
        'wallStore', 'slabStore', 'columnStore', 'gridStore', 'stairStore', 'beamStore',
        'curtainWallStore', 'roofStore', 'plumbingStore', 'furnitureStore', 'handrailStore',
        'openingStore', 'roomStore', 'ceilingStore', 'floorStore',
        'slabSystemTypeStore', 'wallSystemTypeStore', 'ceilingSystemTypeStore',
        'floorSystemTypeStore', 'doorSystemTypeStore', 'windowSystemTypeStore',
        'handrailTypeStore', 'roomBoundingLineStore', 'curtainPanelStore',
    ]) b[k] = sentinel();
    return b;
}

describe('§COMPONENT-PLACE — THE JOIN: a component definition reaches a project, and survives a reload', () => {

    it('ARM A — the composition root contributes the `component` store (the axis that silently throws)', () => {
        // §FIX-POOL-UNREACHABLE (L-5200): without the PluginRegistry descriptor the
        // key is simply absent and `CommandBus.buildContext` throws at DISPATCH with
        // the handlers registered — the shape that hid the pool for weeks.
        expect(store()).toBeInstanceOf(ComponentStore);
        // …and it is the SAME instance the serializer's read channel names. This is
        // the L-11530 half: a store can exist and still be unreachable through
        // `window.runtime.stores.<key>`.
        expect(store().storeKey).toBe('component');
    }, BUDGET);

    it('ARM B — ⭐⭐ component.place DISPATCHES, and the occurrence is READ BACK OUT OF THE AUTHORITATIVE STORE (C16 CA-21)', async () => {
        wipe();
        expect(store().getState().size, 'the store must start EMPTY or the count below proves nothing').toBe(0);

        await expect(rt.bus.executeCommand('component.place', PLACE)).resolves.toBeDefined();

        // ⛔ THE ASSERTION THAT MATTERS. Not `result.success`, not a spy, not the
        // handler's `nextStates`, not the patch pair — the RECORD, out of the store
        // the serializer saves from and the World Model will read.
        const placed = readBack(COMPONENT_ID);
        expect(placed, 'the placed occurrence must BE in the authoritative store').toBeDefined();
        expect(placed.type).toBe('component');
        expect(placed.definitionId, 'the definition half of the JOIN').toBe(DEF_ID);
        expect(placed.typeId, 'the type half of the JOIN').toBe(TYPE_A);
        expect(placed.levelId).toBe(LEVEL_ID);
        expect(placed.origin, 'metres, ADR-0376 D3').toEqual({ x: 2, y: 0, z: 3 });
        expect(placed.definitionVersion, 'provenance — it pins nothing, and it is still recorded').toBe('1.0.0');
        expect(placed.instanceParameters, 'no overrides were sent').toEqual({});
    }, BUDGET);

    it('ARM C — NEGATIVE CONTROL: a placement with no resolvable definition is REFUSED, and the store is untouched', async () => {
        wipe();
        // ⭐ WITHOUT THIS ARM, ARM B PROVES ONLY THAT SOMETHING WAS WRITTEN. An
        // occurrence of no definition parses fine, stores fine, saves fine and refers
        // to nothing — so the refusal is the half that makes the JOIN a join.
        await expect(
            rt.bus.executeCommand('component.place', { ...PLACE, definitionId: 'not-a-family-id' }),
        ).rejects.toThrow(/definitionId/);
        expect(store().getState().size, 'a refused placement must write NOTHING').toBe(0);

        await expect(
            rt.bus.executeCommand('component.place', { ...PLACE, typeId: 'window-type-a' }),
        ).rejects.toThrow(/typeId/);
        expect(store().getState().size, 'a refused placement must write NOTHING').toBe(0);

        // A duplicate id is refused too — CA-2's other half.
        await rt.bus.executeCommand('component.place', PLACE);
        await expect(rt.bus.executeCommand('component.place', PLACE)).rejects.toThrow(/duplicate/);
        expect(store().getState().size).toBe(1);
    }, BUDGET);

    it('ARM D — component.swapType moves the TYPE rung and READ-BACK confirms it, WITHOUT touching the instance overrides', async () => {
        wipe();
        await rt.bus.executeCommand('component.place', PLACE);
        await rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: COMPONENT_ID, parameterId: PARAM_WIDTH, value: 1.8,
        });
        expect(readBack(COMPONENT_ID).instanceParameters[PARAM_WIDTH]).toBe(1.8);

        await expect(
            rt.bus.executeCommand('component.swapType', { componentId: COMPONENT_ID, typeId: TYPE_B }),
        ).resolves.toBeDefined();

        const after = readBack(COMPONENT_ID);
        expect(after.typeId, 'the type rung moved').toBe(TYPE_B);
        // ⭐ THE PROPERTY SPEC §66 F-2 DEPENDS ON. A type swap that "helpfully"
        // resolved the new type's values onto the occurrence would silently overwrite
        // the user's deliberate act — *"the instance has collapsed into the type"*.
        expect(after.instanceParameters[PARAM_WIDTH], 'the INSTANCE override survives a type swap').toBe(1.8);

        // A swap to the type already worn is REFUSED — a command that mutates nothing
        // still costs the user a Ctrl+Z.
        await expect(
            rt.bus.executeCommand('component.swapType', { componentId: COMPONENT_ID, typeId: TYPE_B }),
        ).rejects.toThrow(/already wears/);
    }, BUDGET);

    it('ARM E — component.setInstanceParameter sets, clears, and refuses the ambiguous cases — all read back from the store', async () => {
        wipe();
        await rt.bus.executeCommand('component.place', PLACE);

        await rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: COMPONENT_ID, parameterId: PARAM_WIDTH, value: 1.2,
        });
        await rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: COMPONENT_ID, parameterId: PARAM_HEIGHT, value: 1.5,
        });
        expect(readBack(COMPONENT_ID).instanceParameters).toEqual({
            [PARAM_WIDTH]: 1.2, [PARAM_HEIGHT]: 1.5,
        });

        // ⭐ CLEARING REMOVES THE KEY — it does not write a null. `null` is not a
        // member of the value union precisely so "cleared" and "set to nothing"
        // cannot become the same value.
        await rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: COMPONENT_ID, parameterId: PARAM_WIDTH, clear: true,
        });
        const cleared = readBack(COMPONENT_ID).instanceParameters;
        expect(Object.prototype.hasOwnProperty.call(cleared, PARAM_WIDTH), 'the KEY is gone, not nulled').toBe(false);
        expect(cleared[PARAM_HEIGHT], 'the other override is untouched').toBe(1.5);

        // The three refusals, each a different fact.
        await expect(rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: COMPONENT_ID, parameterId: PARAM_HEIGHT, value: 1, clear: true,
        })).rejects.toThrow(/BOTH a value and clear/);
        await expect(rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: COMPONENT_ID, parameterId: PARAM_HEIGHT,
        })).rejects.toThrow(/needs either a value or clear/);
        await expect(rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: COMPONENT_ID, parameterId: PARAM_WIDTH, clear: true,
        })).rejects.toThrow(/nothing to clear/);
        // …and none of them changed anything.
        expect(readBack(COMPONENT_ID).instanceParameters).toEqual({ [PARAM_HEIGHT]: 1.5 });
    }, BUDGET);

    it('ARM F — spec §66 F-2, the STRUCTURAL half: place 20, override ONE, swap all 20 types — the 19 hold no copy and the 1 keeps its override', async () => {
        wipe();
        const ids: string[] = [];
        for (let i = 0; i < 20; i++) {
            const id = `component_${ulidN(100 + i)}`;
            ids.push(id);
            await rt.bus.executeCommand('component.place', { ...PLACE, componentId: id });
        }
        expect(store().getState().size, 'twenty placed occurrences').toBe(20);

        // Change ONE.
        const OVERRIDDEN = ids[7]!;
        await rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: OVERRIDDEN, parameterId: PARAM_WIDTH, value: 1.8,
        });

        // ⭐ THE OTHER NINETEEN ARE UNCHANGED — read back one by one, out of the store.
        for (const id of ids) {
            const rec = readBack(id);
            if (id === OVERRIDDEN) continue;
            expect(Object.keys(rec.instanceParameters), `occurrence ${id} must hold NO override`).toEqual([]);
        }

        // Now change the TYPE on all twenty.
        for (const id of ids) {
            await rt.bus.executeCommand('component.swapType', { componentId: id, typeId: TYPE_B });
        }

        for (const id of ids) {
            const rec = readBack(id);
            expect(rec.typeId, `occurrence ${id} wears the new type`).toBe(TYPE_B);
            if (id === OVERRIDDEN) {
                // ⭐ THE OVERRIDE DID NOT FOLLOW THE TYPE. That is F-2's second half.
                expect(rec.instanceParameters[PARAM_WIDTH]).toBe(1.8);
            } else {
                // ⭐ AND THE NINETEEN STILL HOLD NOTHING. This is the property the whole
                // design rests on: they follow the type because they carry NO resolved
                // copy that could go stale, not because anything propagated to them.
                expect(Object.keys(rec.instanceParameters)).toEqual([]);
            }
        }
    }, BUDGET);

    it('ARM G — ⭐⭐ SAVE → RELOAD: the placed component is still there, through the REAL serializer and the REAL restore', async () => {
        wipe();
        await rt.bus.executeCommand('component.place', PLACE);
        await rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: COMPONENT_ID, parameterId: PARAM_WIDTH, value: 1.2,
        });
        expect(store().getState().size, 'N BEFORE the save').toBe(1);

        // The REAL runtime, published the one way production publishes it
        // (`engineLauncher.ts` — `if (runtime) window.runtime = runtime`). ⚠ This is
        // NOT the D6 breach the balcony's proof committed: the object assigned is the
        // REAL composed handle, not a literal built to satisfy the reader. The defect
        // was never "nothing assigns window.runtime"; it was that the real handle
        // lacked the key — which ARM A measures with no assignment at all.
        (window as unknown as { runtime: unknown }).runtime = rt;

        // Cross the JSON boundary, exactly as a save to disk does.
        const saved = JSON.parse(ProjectSerializer.stringify(
            ProjectSerializer.serialize(serializerBundle(), null as any, { projectName: 'component-join' }),
        ));

        expect(saved.components, 'the occurrence must be IN THE FILE — the half L-11530 found dead').toHaveLength(1);
        expect(saved.components[0].id).toBe(COMPONENT_ID);
        expect(saved.components[0].definitionId, 'the JOIN survives serialisation').toBe(DEF_ID);
        expect(saved.components[0].instanceParameters[PARAM_WIDTH], 'the override survives serialisation').toBe(1.2);
        // ⭐ C84 EI-6's counting half: a placed component IS an element, so the save
        // log's element count must move. That number is what let the founder count
        // the §PERSIST103 losses at all.
        expect(saved.elementCount, 'the element count includes the occurrence').toBeGreaterThanOrEqual(1);

        // ── RELOAD ────────────────────────────────────────────────────────────────
        wipe();
        expect(store().getState().size, 'the reload starts from an empty store').toBe(0);

        const result = restoreCompoundFamilies(saved);
        expect(result.errors, 'the restore must report no failures').toEqual([]);
        expect(result.restored['component'], 'one occurrence restored').toBe(1);

        // ⛔ THE ACCEPTANCE. Read back OUT OF THE AUTHORITATIVE STORE, after a full
        // save → JSON → restore. Not `result.restored`, which is the restore's own
        // opinion of itself.
        const reloaded = readBack(COMPONENT_ID);
        expect(reloaded, 'THE COMPONENT IS STILL THERE').toBeDefined();
        expect(reloaded.definitionId).toBe(DEF_ID);
        expect(reloaded.typeId).toBe(TYPE_A);
        expect(reloaded.origin).toEqual({ x: 2, y: 0, z: 3 });
        expect(reloaded.instanceParameters[PARAM_WIDTH], 'the override survived the round trip').toBe(1.2);
    }, BUDGET);

    it('ARM H — NEGATIVE CONTROL for ARM G: an empty store writes NO `components` key at all (C47 — omit-when-absent)', () => {
        wipe();
        (window as unknown as { runtime: unknown }).runtime = rt;
        const saved = JSON.parse(ProjectSerializer.stringify(
            ProjectSerializer.serialize(serializerBundle(), null as any, { projectName: 'component-join' }),
        ));
        // ⭐ WITHOUT THIS ARM, ARM G's `toHaveLength(1)` could pass on a serializer
        // that wrote a constant. And the omission is itself the C47 property: a
        // project with no placed components produces a snapshot byte-identical to a
        // pre-Phase-4C one, so no schema version bump and no migration are owed.
        expect(saved.components).toBeUndefined();
        expect(restoreCompoundFamilies(saved).restored['component']).toBeUndefined();
    }, BUDGET);

    it('ARM J — UNDO IS COVERED: `buildUndoStoreMap()` resolves an adapter for `component`, and applying the REAL inverse patch reverts the REAL record', async () => {
        wipe();
        (window as unknown as { runtime: unknown }).runtime = rt;

        // ⛔ WHY THIS ARM IS NOT DECORATION. All three verbs declare
        // `affectedStores = ['component']`, and `_covered()` is ALL-OR-NOTHING: with
        // no adapter for that key `performUndo` does NOT step the ring-buffer cursor
        // and falls through to the legacy `commandManager`, which owns nothing at all
        // for a family that has no legacy twin. Ctrl+Z would be a measured no-op —
        // the shape L-11160 reported verbatim (*"[Undo] STRANDED … no applyPatch
        // adapter for store(s) [boundaryLine]"*) and the shape
        // `audit/full-stack/2026-08-31/commands/` counted 47 times in 361 verbs.
        const adapter = buildUndoStoreMap()['component'];
        expect(adapter, 'the `component` key must have an undo adapter').toBeDefined();
        expect(typeof adapter!.applyPatch, 'and it must be callable').toBe('function');

        // ⚠ IT IS NOT IN THE REFUSAL LEDGER. A key can only be in one of the two, and
        // a key in both would mean the file contradicts itself.
        expect(UNMAPPED_BUS_STORE_KEYS['component'], '`component` is adapted, not refused').toBeUndefined();

        // Place through the bus, then apply the INVERSE the handler's own
        // `produceCommand` would mint for that placement — the same operation the
        // ring buffer applies on Ctrl+Z, through the same adapter, resolved lazily
        // off the live runtime rather than off anything this file built.
        await rt.bus.executeCommand('component.place', PLACE);
        expect(readBack(COMPONENT_ID), 'placed').toBeDefined();

        adapter!.applyPatch([{ op: 'remove', path: [COMPONENT_ID] } as never]);

        // ⭐ READ BACK, AGAIN OUT OF THE AUTHORITATIVE STORE. The adapter reached the
        // live store — not a detached instance — which is the property
        // `resolveComposedStoreFromWindow` exists to provide and the one a cached
        // reference would have broken on the next runtime recomposition.
        expect(readBack(COMPONENT_ID), 'the inverse reverted the REAL record').toBeUndefined();
        expect(store().getState().size).toBe(0);
    }, BUDGET);

    it('ARM I — the snapshotFamilyCoverage row for `component` claims `persisted`, and the arms above are what that claim rests on (audit R11)', () => {
        const row = SNAPSHOT_FAMILY_COVERAGE.find((r) => r.storeKey === 'component');
        expect(row, 'the family must have a coverage row — ARM A of the gate').toBeDefined();
        expect(row!.status).toBe('persisted');
        expect(row!.snapshotKey).toBe('components');
        // ⛔ THE ROW IS NOT THE PROOF, AND THIS ARM EXISTS TO SAY SO IN CODE. The
        // `balcony` row read `persisted` for FOUR DAYS while every balcony was
        // destroyed on reload (L-11530), because `check-snapshot-family-coverage.ts`
        // verifies that a snapshot FIELD exists and that `serialize()` writes it —
        // never that the writer can READ its store. ARM G is the executed proof the
        // row leans on; this arm only pins that the row and the code agree about
        // WHICH key, so the two cannot drift apart in silence.
        expect(row!.reason.length).toBeGreaterThan(0);
    }, BUDGET);
});
