// @vitest-environment happy-dom
//
// §L-977 — THE MERGE-VS-REPLACE DECLARATION, RE-DERIVED FROM THE REAL STORES.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// `elementUndoStoreAdapter`'s field arm turns an undo patch into a call on a live
// legacy store's `update()`. For three years it wrote a ONE-KEY PARTIAL, on the
// strength of a SURFACE audit in its own header ("all expose `update(id,
// partial)`"). Four of the stores it is handed do not take a partial at all —
// they take a NEXT STATE — so that write annihilated the record. That is L-977,
// reachable today by moving a slab and pressing Ctrl+Z.
//
// It survived because `elementUndoStoreAdapter.test.ts` is green against
// hand-written Maps whose `update` merges and validates nothing. **A FAKE BUILT
// FROM THE HEADER CANNOT FALSIFY THE HEADER** — the fake was MORE CAPABLE than
// the real store, so the suite proved only that the adapter works against a store
// behaving as its comment claims.
//
// So this file uses NO fakes for the subject. Every store below is the REAL class
// the production `window.<x>Store` global holds (traced through `initBuilders.ts`,
// `initTools.ts` and `engineLauncher.ts`), constructed here, seeded through its
// OWN `add()` — schemas and all — and then ASKED what its `update()` does.
//
// ─── THE ARMS ────────────────────────────────────────────────────────────────
// ARM A — IS THE DECLARATION TRUE? Call the REAL `update(id, {oneField})` directly
//   and read the record back. Fields survived ⇒ MERGE; fields gone ⇒ REPLACE.
//   Compare that MEASUREMENT against the row in `legacyStoreUpdateSemantics.ts`.
//   A row that lies fails here — the declaration is falsifiable by its own subject,
//   which is exactly what the old header was not.
//
// ARM B — DOES THE ADAPTER HONOUR IT? Drive a depth-2 patch through the REAL
//   adapter with the REAL store key and assert BOTH halves on the same record: the
//   patched field took the new value, AND nothing else was lost. `redBefore`
//   records, per family, whether this arm could have failed before the fix —
//   because "the suite is green" is not evidence that it was ever capable of red.
//   It was RED for slab, column, furniture and plumbing; the merge families were
//   always green here and ARM A is what carries their evidence.
//
// ARM C — THE REJECTED CANDIDATE. The obvious fix (always spread the record into
//   the write) is right for a replace store and WRONG for a merge store whose
//   `update()` branches on which keys are PRESENT — `WallStore.ts:764-766` clears
//   the pre-join `_sourceBaseLine` when a caller supplies `baseLine` WITHOUT it,
//   and a full-record write (whose record already carries `_sourceBaseLine`)
//   silently suppresses that. ARM C measures the ARGUMENT SHAPE the adapter hands
//   each kind of store, so the blanket spread cannot land later without turning
//   this file red.
//
// ─── WHAT IS NOT PROVEN HERE ─────────────────────────────────────────────────
// • No browser session. These are the real stores, not the real running editor.
// • Families whose store could not be driven in-process are listed in
//   `NOT_DRIVEN` with the reason, and are asserted to be DECLARED but are NOT
//   behaviourally proven. They are named, never quietly skipped.

import { describe, expect, it } from 'vitest';
import {
  elementUndoStoreAdapter,
  __resetUndoRestoreSnapshots,
} from '../src/engine/undo/elementUndoStoreAdapter.js';
import {
  LEGACY_STORE_UPDATE_SEMANTICS,
  normaliseStoreKey,
  resolveLegacyStoreUpdateDeclaration,
} from '../src/engine/undo/legacyStoreUpdateSemantics.js';
import { buildUndoStoreMap } from '../src/engine/undo/performUndoRedo.js';

import { SlabStore } from '@pryzm/geometry-slab';
import { WallStore } from '@pryzm/geometry-wall';
import { ColumnStore } from '@pryzm/geometry-column';
import { FurnitureStore } from '@pryzm/geometry-furniture';
import { PlumbingStore } from '@pryzm/geometry-plumbing';
import { LightingStore } from '@pryzm/geometry-lighting';
import { RoofStore } from '@pryzm/geometry-roof';
import { CurtainWallStore, CurtainPanelStore } from '@pryzm/geometry-curtain-wall';
import { StairStore, StairRailingStore, StairLandingStore } from '@pryzm/geometry-stair';
import { BeamStore, HandrailStore, FloorStore, CeilingStore, GridStore } from '@pryzm/core-app-model/stores';

type AnyRec = Record<string, unknown>;

const L0 = 'L0';

/** Duck-typed read across the two accessor spellings the legacy stores use
 *  (`getById` on slab/wall/roof/handrail/floor/ceiling/room; `get` elsewhere). */
function read(store: AnyRec, id: string): AnyRec | undefined {
  const s = store as { getById?(i: string): unknown; get?(i: string): unknown };
  const v = typeof s.getById === 'function' ? s.getById(id) : s.get?.(id);
  return v as AnyRec | undefined;
}

function add(store: AnyRec, rec: AnyRec): void {
  (store as { add(r: unknown): void }).add(rec);
}

function keysOf(rec: AnyRec | undefined): string[] {
  return rec == null ? [] : Object.keys(rec).sort();
}

/** Swallow the console so a suite of deliberate refusals does not drown the
 *  reporter — and return what was captured, because several cases assert on it. */
function captureDiagnostics(fn: () => void): string[] {
  const out: string[] = [];
  const oldWarn = console.warn;
  const oldError = console.error;
  const oldLog = console.log;
  console.warn = (...a: unknown[]) => { out.push('warn: ' + a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { out.push('error: ' + a.map(String).join(' ')); };
  console.log = () => { /* StairStore logs on every update */ };
  try { fn(); } finally { console.warn = oldWarn; console.error = oldError; console.log = oldLog; }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

interface Family {
  /** The bus `affectedStores` key `buildUndoStoreMap()` binds this store to. */
  readonly key: string;
  /** A real store holding one record its own `add()` accepted. */
  readonly make: () => { store: AnyRec; id: string };
  readonly field: string;
  readonly next: unknown;
  /** Could ARM B have failed before the L-977 fix? True for the replace families. */
  readonly redBefore: boolean;
  /**
   * MEASURED: this store's `update()` THROWS when handed a one-key partial,
   * rather than quietly overwriting. That is still proof it does not merge — a
   * merge store has no reason to miss a field it was not given — so it counts as
   * REPLACE evidence, but it is recorded separately because the OLD failure mode
   * differed: a throw landed in the adapter's per-op catch as one console.error
   * while the keypress reported success, instead of being silent.
   */
  readonly partialThrows?: true;
}

const metadata = { createdAt: 1, modifiedAt: 1, createdBy: 'l977', version: 1 };

/** `WallStore.add` and `RoomStore.add` resolve the storey through a BIM kernel and
 *  THROW without one. This is the duck-type the repo's own seam suites use
 *  (`packages/room-topology/src/__tests__/gr2UpdateSurrenderSeam.test.ts:38-47`). */
const level = { id: L0, name: L0, elevation: 0, height: 3, childrenIds: [] };
const levelProvider = {
  getLevelById: (id: string) => (id === L0 ? level : undefined),
  getLevels: () => [level],
};

/** Shared 4-point ring for the floor / ceiling seeds. */
const RING = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }];

const FAMILIES: readonly Family[] = [
  // ── THE FOUR REPLACE STORES — ARM B was RED for every one of these ─────────
  {
    key: 'slab', redBefore: true, field: 'thickness', next: 0.42,
    make: () => {
      const store = new SlabStore({ activeLevelId: L0 } as never) as unknown as AnyRec;
      const id = 'slab_L977';
      add(store, {
        id, type: 'slab', levelId: L0, parentId: L0,
        position: { x: 0, y: 0, z: 0 }, thickness: 0.2,
        polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
        layers: [{ name: 'Plain Structure', function: 'structure', thickness: 0.2, materialColor: '#909090' }],
        properties: { mark: 'SB001' },
        ifcData: { guid: 'guid-slab_L977', ifcClass: 'IfcSlab' },
      });
      return { store, id };
    },
  },
  {
    key: 'column', redBefore: true, partialThrows: true, field: 'height', next: 3.6,
    make: () => {
      const store = new ColumnStore({ activeLevelId: L0 } as never) as unknown as AnyRec;
      const id = 'col_L977';
      add(store, {
        id, type: 'column', levelId: L0, parentId: L0,
        position: { x: 3, y: 0, z: 2 },
        height: 3, rotation: 0, profile: 'rectangular',
        width: 0.3, depth: 0.3, baseOffset: 0,
        properties: {}, ifcData: { guid: 'guid-col_L977', ifcClass: 'IfcColumn' },
      });
      return { store, id };
    },
  },
  {
    key: 'furniture', redBefore: true, field: 'width', next: 2.2,
    make: () => {
      const store = new FurnitureStore() as unknown as AnyRec;
      const id = 'furn_L977';
      add(store, {
        id, type: 'furniture', furnitureType: 'bed', furnitureCategory: 'beds',
        position: { x: 1, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
        width: 1.8, length: 2.0, height: 1.0, baseOffset: 0.2, levelId: L0,
        material: 'fabric', color: '#8899aa', mark: 'FU-FF-002', properties: {},
      });
      return { store, id };
    },
  },
  {
    key: 'plumbing', redBefore: true, field: 'width', next: 0.9,
    make: () => {
      const store = new PlumbingStore() as unknown as AnyRec;
      const id = 'plumb_L977';
      add(store, {
        id, type: 'plumbing', fixtureType: 'toilet', levelId: L0,
        position: { x: 10, y: 0, z: 20 }, rotation: { x: 0, y: 0, z: 0 },
        width: 0.4, length: 0.6, height: 0.4, baseOffset: 0, color: '#ffffff',
        properties: {},
      });
      return { store, id };
    },
  },

  // ── THE MERGE STORES ──────────────────────────────────────────────────────
  {
    key: 'wall', redBefore: false, field: 'height', next: 3.5,
    make: () => {
      const store = new WallStore({ activeLevelId: L0 } as never, levelProvider as never) as unknown as AnyRec;
      const id = 'wall_L977';
      add(store, {
        id, type: 'wall', levelId: L0, properties: {}, childrenIds: [],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3, thickness: 0.2, baseOffset: 0, openings: [], metadata,
      });
      return { store, id };
    },
  },
  {
    key: 'roof', redBefore: false, field: 'slope', next: 0.55,
    make: () => {
      const store = new RoofStore({ activeLevelId: L0 } as never) as unknown as AnyRec;
      const id = 'roof_L977';
      add(store, {
        id, type: 'roof', levelId: L0, parentId: L0,
        footprint: { polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], centroid: [2, 2] },
        roofType: 'gable', slope: 0.3, overhang: 0.5, thickness: 0.2, baseOffset: 3,
        properties: {}, metadata,
      });
      return { store, id };
    },
  },
  {
    key: 'curtainwall', redBefore: false, field: 'height', next: 4.2,
    make: () => {
      const store = new CurtainWallStore() as unknown as AnyRec;
      const id = 'cw_L977';
      add(store, {
        id, type: 'curtain-wall', levelId: L0,
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3, baseOffset: 0,
        gridXSpacing: 1.5, gridYSpacing: 3, mullionSize: 0.05, panelThickness: 0.024,
        properties: {},
      });
      return { store, id };
    },
  },
  {
    key: 'curtainPanel', redBefore: false, field: 'panelType', next: 'SystemPanel_Spandrel',
    make: () => {
      const store = new CurtainPanelStore() as unknown as AnyRec;
      const id = 'cwpanel_L977';
      add(store, {
        id, type: 'curtain-panel', levelId: L0, curtainWallId: 'cw_L977',
        cellIndex: [0, 0], panelType: 'SystemPanel_Glazed', properties: {},
      });
      return { store, id };
    },
  },
  {
    key: 'stair', redBefore: false, field: 'rotation', next: 1.57,
    make: () => {
      const store = new StairStore({ activeLevelId: L0 } as never) as unknown as AnyRec;
      const id = 'stair_L977';
      add(store, {
        id, type: 'stair', levelId: L0, baseLevelId: L0, topLevelId: 'L1',
        shape: 'straight', rotation: 0, properties: {},
        metadata: { createdAt: '1', modifiedAt: '1', version: 0 },
      });
      return { store, id };
    },
  },
  {
    key: 'stairRailing', redBefore: false, field: 'topRailHeight', next: 1.1,
    make: () => {
      const store = new StairRailingStore() as unknown as AnyRec;
      const id = 'rail_L977';
      add(store, {
        id, stairId: 'stair_L977', side: 'left', topRailHeight: 0.9,
        balusterSpacing: 0.12, balusterShape: 'round', balusterWidth: 0.02,
        postAtStart: true, postAtEnd: true, material: 'steel',
      });
      return { store, id };
    },
  },
  {
    key: 'stairLanding', redBefore: false, field: 'length', next: 1.6,
    make: () => {
      const store = new StairLandingStore() as unknown as AnyRec;
      const id = 'land_L977';
      add(store, { id, stairId: 'stair_L977', afterFlightIndex: 0, elevation: 1.5, length: 1.2, width: 1.0 });
      return { store, id };
    },
  },
  {
    key: 'lighting', redBefore: false, field: 'intensity', next: 900,
    make: () => {
      const store = new LightingStore() as unknown as AnyRec;
      const id = 'light_L977';
      add(store, {
        id, type: 'lighting', levelId: L0, fixtureType: 'downlight',
        position: { x: 1, y: 2.7, z: 1 }, intensity: 600, properties: {},
      });
      return { store, id };
    },
  },
  {
    key: 'beam', redBefore: false, field: 'depth', next: 0.55,
    make: () => {
      const store = new BeamStore({ activeLevelId: L0 } as never) as unknown as AnyRec;
      const id = 'beam_L977';
      add(store, {
        id, type: 'beam', levelId: L0,
        startPoint: { x: 0, y: 3, z: 0 }, endPoint: { x: 6, y: 3, z: 0 },
        sectionType: 'rectangular', width: 0.2, depth: 0.4, properties: {},
      });
      return { store, id };
    },
  },
  {
    key: 'handrail', redBefore: false, field: 'height', next: 1.05,
    make: () => {
      const store = new HandrailStore({ activeLevelId: L0 } as never) as unknown as AnyRec;
      const id = 'handrail_L977';
      add(store, {
        id, type: 'handrail', levelId: L0, height: 0.9, diameter: 0.04,
        path: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
        properties: { mark: 'HR-01' }, metadata: { ...metadata },
      });
      return { store, id };
    },
  },
  {
    key: 'grid', redBefore: false, field: 'name', next: 'B',
    make: () => {
      const store = new GridStore() as unknown as AnyRec;
      const id = 'grid_L977';
      add(store, { id, name: 'A', axis: 'X', position: 2 });
      return { store, id };
    },
  },
  {
    key: 'floor', redBefore: false, field: 'label', next: 'Reverted Floor',
    make: () => {
      const store = new FloorStore() as unknown as AnyRec;
      const id = 'floor_L977';
      add(store, {
        id, type: 'floor', levelId: L0,
        label: 'Floor-L977', floorNumber: 'F.01',
        boundary: {
          polygon: RING.map(p => ({ ...p })),
          baseOffset: 0.015, thickness: 0.015, detectionMethod: 'from-room',
        },
        finishSpec: { exposedScreed: false },
        serviceHoles: [], coveredRoomIds: [], boundingWallIds: [],
        hostRoomId: 'room-1', visible: true, properties: {},
        metadata: { ...metadata },
      });
      return { store, id };
    },
  },
  {
    key: 'ceiling', redBefore: false, field: 'label', next: 'Reverted Ceiling',
    make: () => {
      const store = new CeilingStore() as unknown as AnyRec;
      const id = 'ceiling_L977';
      add(store, {
        id, type: 'ceiling', levelId: L0,
        label: 'Ceiling-L977', ceilingNumber: 'C.01',
        boundary: {
          polygon: RING.map(p => ({ ...p })),
          height: 2.5, thickness: 0.05, baseOffset: 0, detectionMethod: 'from-room',
        },
        finishSpec: { exposedStructure: false },
        holeElements: [], coveredRoomIds: [], boundingWallIds: [],
        hostRoomId: 'room-1', visible: true, properties: {},
        ifcData: { guid: 'guid-ceiling_L977', ifcClass: 'IfcCovering', predefinedType: 'CEILING' },
        metadata: { ...metadata },
      });
      return { store, id };
    },
  },
];

/**
 * Families the adapter is handed that this suite does NOT drive, each with the
 * reason — named rather than silently omitted, because an unproven family that
 * looks proven is the exact defect this file exists to stop repeating.
 */
const NOT_DRIVEN: ReadonlyArray<{ key: string; reason: string }> = [
  {
    key: 'room',
    reason:
      'RoomStore.add requires a UUID id, a full computed-metrics block AND a BIM kernel, and it '
      + 'inserts into the MODULE-SINGLETON roomSpatialIndex (RoomStore.ts:268) — a store fixture here '
      + 'would leak across every other suite in this file. Declaration is source-measured '
      + '(RoomStore.ts:287-320: three immutability throws, a Zod gate, and a boundary-presence '
      + 'recompute); its BEHAVIOUR is NOT proven here.',
  },
  {
    key: 'annotation',
    reason:
      'AnnotationStore is exported as a module SINGLETON whose file imports the core-app-model barrel '
      + 'mid-file (AnnotationStore.ts:397); driving it here would share mutable state with any other '
      + 'suite that touches annotations. Declaration is source-measured '
      + '(AnnotationStore.ts:134-159, a shallow merge with an unconditional updatedAt stamp); its '
      + 'BEHAVIOUR is NOT proven here.',
  },
  {
    key: 'pool',
    reason:
      'UNREACHABLE IN PRODUCTION — and L-980 (2026-08-18) established it is the FAMILY that is '
      + 'unreachable, not merely the global: `new PoolStore()` appears zero times repo-wide and '
      + '`PluginRegistry.ts` declares no `pool` storeKey, so `pool.create` throws at '
      + '`CommandBus.buildContext` before mutating anything. The `pool` map entry (permanently '
      + '`undefined`) has been REMOVED and the gap declared in `UNMAPPED_BUS_STORE_KEYS`. Still '
      + '`unmeasured`; there is no store to drive.',
  },
  {
    key: 'water',
    reason:
      'UNREACHABLE IN PRODUCTION — same measurement as pool (L-980): WaterStore is never '
      + 'constructed, there is no `water` storeKey, and the map entry has been removed in favour of '
      + 'a declared gap. `unmeasured`; there is no store to drive.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────

describe('§L-977 ARM A — every declaration re-derived from the REAL store it describes', () => {
  for (const fam of FAMILIES) {
    it(`${fam.key}: the real update(id, {${fam.field}}) behaves exactly as declared`, () => {
      const declared = resolveLegacyStoreUpdateDeclaration(fam.key);
      expect(declared, `no declaration for '${fam.key}'`).toBeDefined();

      const { store, id } = fam.make();
      const before = read(store, id);
      // POSITIVE CONTROL: the real add() accepted the seed, so "the fields are
      // gone" below cannot be satisfied by a store that never held the record.
      expect(before, `${fam.key} seed was accepted by the real add()`).toBeTruthy();
      expect(keysOf(before).length, 'and it is a whole record, not a stub').toBeGreaterThan(4);

      // THE MEASUREMENT — the store's OWN update(), called directly. No adapter.
      // A THROW is a third outcome and is recorded as such: it is still proof the
      // store does not merge (`ColumnStore.ts:226-228` refuses a partial that omits
      // `levelId` — a merge store would never be missing it), but it is a REFUSAL,
      // not a destruction, and conflating the two would hide which stores were
      // losing data quietly and which were shouting into a swallowed catch.
      let threw: unknown;
      captureDiagnostics(() => {
        try {
          (store as { update(i: string, u: unknown): unknown }).update(id, { [fam.field]: fam.next });
        } catch (e) { threw = e; }
      });
      const after = read(store, id);

      const lost = keysOf(before).filter(k => !keysOf(after).includes(k));
      const measured = (threw != null || lost.length > 0) ? 'replace' : 'merge';

      // The throw/no-throw half is asserted on its own, so a store that starts or
      // stops refusing is caught even though both outcomes read as 'replace'.
      expect(
        threw != null,
        `${fam.key}: a one-key partial ${threw != null ? 'THREW' : 'did not throw'} `
        + `(${threw instanceof Error ? threw.message : ''}) — the family table says `
        + `partialThrows=${fam.partialThrows === true}.`,
      ).toBe(fam.partialThrows === true);

      expect(
        measured,
        `MEASURED '${measured}' but legacyStoreUpdateSemantics.ts declares '${declared!.semantics}' `
        + `for '${fam.key}'. Evidence on file: ${declared!.evidence}. Fields a one-key partial `
        + `destroys: [${lost.join(', ')}]${threw != null ? '; it threw instead' : ''}.`,
      ).toBe(declared!.semantics);
    });
  }

  it('the four REPLACE families are not a theory — the direct write really does destroy', () => {
    // Stated once, positively, so ARM A cannot pass vacuously by declaring
    // everything 'merge' and measuring 'merge' everywhere.
    const replaces = FAMILIES.filter(f => resolveLegacyStoreUpdateDeclaration(f.key)!.semantics === 'replace');
    expect(replaces.map(f => f.key).sort()).toEqual(['column', 'furniture', 'plumbing', 'slab']);
    const merges = FAMILIES.filter(f => resolveLegacyStoreUpdateDeclaration(f.key)!.semantics === 'merge');
    expect(merges.length, 'and the table is not uniformly replace either').toBeGreaterThan(5);
  });
});

describe('§L-977 ARM B — the adapter honours what was measured, against the REAL store', () => {
  for (const fam of FAMILIES) {
    const tag = fam.redBefore
      ? 'RED before the fix — this family lost its whole record'
      : "green before the fix — ARM A carries this family's evidence";
    it(`${fam.key}: a depth-2 patch changes ONE field and loses none — ${tag}`, () => {
      __resetUndoRestoreSnapshots();
      const { store, id } = fam.make();
      const before = read(store, id)!;
      const beforeKeys = keysOf(before);
      expect(before[fam.field], 'the seed does not already hold the target value').not.toEqual(fam.next);

      captureDiagnostics(() => {
        elementUndoStoreAdapter(store as never, fam.key).applyPatch([
          { op: 'replace', path: [id, fam.field], value: fam.next },
        ]);
      });

      const after = read(store, id);
      // POSITIVE — the revert landed.
      expect(after, 'the record is still there').toBeTruthy();
      expect(after![fam.field], 'the patched field took the new value').toEqual(fam.next);
      // NEGATIVE, on the SAME record — and nothing was taken away. Stated as the
      // full key set, so a fix that saved six fields and dropped the seventh fails.
      const lost = beforeKeys.filter(k => !keysOf(after).includes(k));
      expect(lost, 'fields the write destroyed').toEqual([]);
      // Identity is called out separately: it is what an IFC export and every
      // downstream builder key on, and it is what L-977 actually cost.
      if ('id' in before) expect(after!.id, 'it still knows its own id').toBe(id);
      if ('levelId' in before) expect(after!.levelId, 'and which storey it is on').toBe(L0);
    });
  }

  it('REPLACE families gain nothing either — the replacement is the record, not a superset', () => {
    for (const fam of FAMILIES.filter(f => f.redBefore)) {
      __resetUndoRestoreSnapshots();
      const { store, id } = fam.make();
      const beforeKeys = keysOf(read(store, id));
      captureDiagnostics(() => {
        elementUndoStoreAdapter(store as never, fam.key).applyPatch([
          { op: 'replace', path: [id, fam.field], value: fam.next },
        ]);
      });
      expect(keysOf(read(store, id)), `${fam.key}: exact same shape`).toEqual(beforeKeys);
    }
  });
});

describe('§L-977 ARM C — the REJECTED blanket-spread candidate, pinned so it cannot land quietly', () => {
  /**
   * The candidate — `update(id, { ...record, [field]: value })` for every store —
   * was watched green against the slab arm and NOT landed, because
   * `WallStore._updateImpl` branches on which keys are PRESENT in its argument:
   *
   *   WallStore.ts:764-766  'baseLine' in safeUpdates && !('_sourceBaseLine' in …)
   *                         → clears the pre-join baseline
   *   WallStore.ts:787-790  safeUpdates.openings !== undefined → warn + DROP
   *   WallStore.ts:856-859  childrenIds present → DELETES hosted door/window records
   *   WallStore.ts:771-779  Zod-validates the ARGUMENT, not the merged record
   *
   * A full-record write changes all four. These cases measure the ARGUMENT SHAPE
   * the adapter actually hands each kind of store, so the spread cannot be
   * reintroduced without turning this file red.
   */
  function spyOnUpdate(store: AnyRec): string[][] {
    const seen: string[][] = [];
    const real = (store as { update(i: string, u: AnyRec): unknown }).update.bind(store);
    (store as AnyRec).update = (i: string, u: AnyRec) => { seen.push(Object.keys(u)); return real(i, u); };
    return seen;
  }

  it('a MERGE store receives a ONE-KEY argument, never the whole record', () => {
    const { store, id } = FAMILIES.find(f => f.key === 'wall')!.make();
    const seen = spyOnUpdate(store);
    captureDiagnostics(() => {
      elementUndoStoreAdapter(store as never, 'wall').applyPatch([
        { op: 'replace', path: [id, 'height'], value: 3.9 },
      ]);
    });
    expect(seen, 'exactly one write').toHaveLength(1);
    expect(seen[0], 'carrying ONLY the patched key — the spread would carry ~10').toEqual(['height']);
    // Negative on the same argument: the presence-keyed branches are not tripped.
    expect(seen[0], 'no baseLine ⇒ _sourceBaseLine is not cleared').not.toContain('baseLine');
    expect(seen[0], 'no openings ⇒ WallStore does not warn-and-drop').not.toContain('openings');
    expect(seen[0], 'no childrenIds ⇒ hosted door/window records are not deleted').not.toContain('childrenIds');
  });

  it('a REPLACE store receives the WHOLE record, because that is its stated contract', () => {
    const { store, id } = FAMILIES.find(f => f.key === 'slab')!.make();
    const seen = spyOnUpdate(store);
    captureDiagnostics(() => {
      elementUndoStoreAdapter(store as never, 'slab').applyPatch([
        { op: 'replace', path: [id, 'thickness'], value: 0.4 },
      ]);
    });
    expect(seen, 'exactly one write').toHaveLength(1);
    expect(seen[0], 'the complete replacement object SlabStore.ts:255-258 asks for')
      .toEqual(expect.arrayContaining(['id', 'type', 'levelId', 'polygon', 'position', 'thickness']));
    expect(seen[0]!.length, 'genuinely more than one key').toBeGreaterThan(1);
  });

  it('the declaration says merge for wall and replace for slab — not one answer for everything', () => {
    expect(resolveLegacyStoreUpdateDeclaration('wall')?.semantics).toBe('merge');
    expect(resolveLegacyStoreUpdateDeclaration('walls')?.semantics, 'the plural alias agrees').toBe('merge');
    expect(resolveLegacyStoreUpdateDeclaration('slab')?.semantics).toBe('replace');
    expect(resolveLegacyStoreUpdateDeclaration('slabs')?.semantics, 'and its alias too').toBe('replace');
  });
});

describe('§L-977 — coverage: no store the adapter is handed may be undeclared', () => {
  /**
   * THE ANTI-ROT GATE. `adaptElementStoreMap` looks the declaration up by store
   * key; a key with no row falls back to the historical destructive partial (and
   * says so on the console). This makes that fallback unreachable for every key
   * production can actually produce, so it can only be hit by a NEW key added
   * without a measurement — which fails here rather than in a user's project.
   */
  it('every key buildUndoStoreMap() produces resolves to a declared row', () => {
    // `buildUndoStoreMap` reads `window`; without the stores the VALUES are
    // undefined, but the KEY SET — the thing under test — is complete.
    const keys = Object.keys(buildUndoStoreMap());
    expect(keys.length, 'the map is non-empty — this is not a vacuous pass').toBeGreaterThan(20);

    const undeclared = keys.filter(k => LEGACY_STORE_UPDATE_SEMANTICS[normaliseStoreKey(k)] == null);
    expect(
      undeclared,
      'These buildUndoStoreMap() keys have no merge-vs-replace row, so the adapter falls back to a '
      + 'one-key partial for them — which DESTROYS the record if the store replaces. Measure each '
      + "store's update() and add a row to apps/editor/src/engine/undo/legacyStoreUpdateSemantics.ts.",
    ).toEqual([]);
  });

  it('normalisation collapses every alias onto one row and collides with nothing', () => {
    // Positive: the aliases really do collapse.
    expect(normaliseStoreKey('curtain-wall')).toBe(normaliseStoreKey('curtainWalls'));
    expect(normaliseStoreKey('walls')).toBe('wall');
    // Negative, same mechanism: the trailing-`s` strip must not merge two real
    // families, and nested prefixes must stay apart.
    const families = Object.keys(LEGACY_STORE_UPDATE_SEMANTICS);
    expect(new Set(families.map(normaliseStoreKey)).size, 'no two rows normalise together')
      .toBe(families.length);
    expect(normaliseStoreKey('stairRailing')).not.toBe(normaliseStoreKey('stair'));
  });

  it('names every family this suite could NOT drive, with its reason', () => {
    for (const { key, reason } of NOT_DRIVEN) {
      expect(reason.length, `${key} needs a stated reason`).toBeGreaterThan(40);
      expect(
        LEGACY_STORE_UPDATE_SEMANTICS[normaliseStoreKey(key)],
        `${key} is unproven here but must still carry a source-measured declaration`,
      ).toBeDefined();
    }
    // The two halves together must account for every declared family, so a family
    // cannot fall out of BOTH lists unnoticed.
    const covered = new Set([
      ...FAMILIES.map(f => normaliseStoreKey(f.key)),
      ...NOT_DRIVEN.map(u => normaliseStoreKey(u.key)),
    ]);
    const orphans = Object.keys(LEGACY_STORE_UPDATE_SEMANTICS).filter(k => !covered.has(k));
    expect(orphans, 'declared but neither driven nor listed as undrivable').toEqual([]);
  });
});

describe('§L-977 sibling defects — the two silent branches now speak', () => {
  it('a depth-2 patch for an ABSENT id warns, like the whole-element arm beside it', () => {
    __resetUndoRestoreSnapshots();
    const { store } = FAMILIES.find(f => f.key === 'slab')!.make();
    const adapter = elementUndoStoreAdapter(store as never, 'slab');

    const fieldArm = captureDiagnostics(() => {
      adapter.applyPatch([{ op: 'replace', path: ['slab_GONE', 'thickness'], value: 0.3 }]);
    });
    const wholeElementArm = captureDiagnostics(() => {
      adapter.applyPatch([{ op: 'remove', path: ['slab_GONE'] }]);
    });

    expect(read(store, 'slab_GONE'), 'neither arm created anything').toBeUndefined();
    expect(fieldArm, 'the field arm is no longer mute').toHaveLength(1);
    expect(fieldArm.join(' '), 'and it names the id whose revert did nothing').toContain('slab_GONE');
    expect(wholeElementArm.join(' '), 'the whole-element arm, on the identical id, still speaks too')
      .toContain('skip remove');
  });

  it('the roof `pitch` write is REFUSED — the legacy record keeps `slope`, in its own unit', () => {
    __resetUndoRestoreSnapshots();
    const { store, id } = FAMILIES.find(f => f.key === 'roof')!.make();
    const beforeKeys = keysOf(read(store, id));

    const diagnostics = captureDiagnostics(() => {
      elementUndoStoreAdapter(store as never, 'roof').applyPatch([
        // What `roof.setPitch` actually mints: an L1 name, in RADIANS.
        { op: 'replace', path: [id, 'pitch'], value: 0.55 },
      ]);
    });

    const after = read(store, id)!;
    expect(diagnostics.join(' '), 'the refusal is cited, not silent').toContain('§L-977 REFUSED');
    expect(diagnostics.join(' '), 'and it names both fields').toContain("'slope'");
    expect(after.slope, 'the field the builder reads is untouched').toBe(0.3);
    expect(after.pitch, 'and no phantom key was minted').toBeUndefined();
    expect(keysOf(after), 'the record is the shape it was').toEqual(beforeKeys);

    // POSITIVE CONTROL, same store and same adapter: the LEGACY name still writes.
    // Without this the case would also pass on a roof that stopped accepting
    // patches altogether.
    captureDiagnostics(() => {
      elementUndoStoreAdapter(store as never, 'roof').applyPatch([
        { op: 'replace', path: [id, 'slope'], value: 0.8 },
      ]);
    });
    expect(read(store, id)!.slope, 'the legacy name lands normally').toBe(0.8);
  });

  it('an UNDECLARED store key is reported on the console rather than guessed at', () => {
    __resetUndoRestoreSnapshots();
    const { store, id } = FAMILIES.find(f => f.key === 'slab')!.make();

    const diagnostics = captureDiagnostics(() => {
      // No key — the deprecated single-argument call shape.
      elementUndoStoreAdapter(store as never).applyPatch([
        { op: 'replace', path: [id, 'thickness'], value: 0.4 },
      ]);
    });

    expect(diagnostics.join(' '), 'the omission is stated').toContain('§L-977 UNDECLARED STORE');
    // And it is an ERROR, not a warn, because the consequence is real: the
    // fallback IS the old destructive write. Asserted so the diagnostic can never
    // be downgraded to cosmetic.
    expect(keysOf(read(store, id)), 'the fallback destroys — which is why it is an error')
      .toEqual(['thickness']);
  });
});
