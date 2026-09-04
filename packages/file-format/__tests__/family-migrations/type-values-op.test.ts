// §UCE-TYPE-CHECKSUM-IS-COMPUTED — `set-type-values`, the op the LIVE type editor
// did not have (lane UCE-FAMILY).
//
// ⛔ IMPORTS THE LEAF MODULES, NOT `../../src/index.js` — the package barrel drags
//   in `pdfjs-dist` (`DOMMatrix` at module scope) and throws under this package's
//   `environment: 'node'` config. Same reason as `box-solid-ops.test.ts`.
//
// ⭐⭐ THE ARM THAT MATTERS IS `THE CHECKSUM MOVES`. `ComponentTypeCatalog` could
//     already edit a type — through a raw `document.types` transform that carried
//     the per-type `checksum` UNCHANGED. Nothing downstream repaired it: measured
//     `grep -c checksum packages/file-format/src/family-pack.ts` → 0, and the same
//     for `family-unpack.ts`, so an edited type's checksum was stale FOREVER in a
//     content-addressed format. The falsifier for this whole change is one line:
//     if `set-type-values` stopped recomputing, `the checksum MOVES` goes red.

import { describe, it, expect } from 'vitest';
import {
  makeSetTypeValuesMigrator,
  makeSplitTypeMigrator,
  typeValuesChecksum,
} from '../../src/family-migrations/index.js';
import type { RawFamily } from '../../src/family-migrations/index.js';
import { FamilyDocumentSchema } from '../../src/family-schema.js';
import type { FamilyDocument, FamilyManifest } from '../../src/family-schema.js';

const V = '1.1';
const EMPTY_HASH = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

const P_WIDTH = 'par_01HZ00000000000000000WDT01';
const P_COUNT = 'par_01HZ00000000000000000CNT01';
const P_LABEL = 'par_01HZ00000000000000000TXT01';
const P_FLAG = 'par_01HZ00000000000000000VNT01';
const TYPE_A = 'typ_01HZ00000000000000000DEF01';
const TYPE_B = 'typ_01HZ00000000000000000BGX01';

const MANIFEST = {
  formatVersion: V,
  familyId: 'fam_01HZ00000000000000000FAM01',
  name: 'Test Component',
  category: 'generic',
  schemaHash: EMPTY_HASH,
} as unknown as FamilyManifest;

function makeDoc(): FamilyDocument {
  return {
    formatVersion: V,
    referencePlanes: [],
    parameters: [
      { id: P_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
      { id: P_COUNT, name: 'Panes', kind: 'type', dataType: 'count', defaultValue: 2, expression: null, ifcMapping: null, exposed: true },
      { id: P_LABEL, name: 'Label', kind: 'type', dataType: 'string', defaultValue: 'std', expression: null, ifcMapping: null, exposed: true },
      { id: P_FLAG, name: 'Vented', kind: 'type', dataType: 'boolean', defaultValue: null, expression: null, ifcMapping: null, exposed: true },
    ],
    profiles: [],
    solids: [],
    materialSlots: [],
    types: [
      { id: TYPE_A, name: 'Standard', values: { [P_WIDTH]: 1200 }, checksum: typeValuesChecksum({ [P_WIDTH]: 1200 }) },
      { id: TYPE_B, name: 'Large', values: { [P_WIDTH]: 1800 }, checksum: typeValuesChecksum({ [P_WIDTH]: 1800 }) },
    ],
    representations: [],
    connectors: [],
    propertySets: [],
    featureEdges: [],
  } as unknown as FamilyDocument;
}

function raw(document: FamilyDocument = makeDoc()): RawFamily {
  return { manifest: MANIFEST, document, events: [] } as unknown as RawFamily;
}

const typeOf = (f: RawFamily, id: string): { name: string; values: Record<string, unknown>; checksum: string } =>
  f.document.types.find((t) => t.id === id) as never;

describe('§UCE-TYPE-CHECKSUM-IS-COMPUTED — set-type-values writes values AND their checksum', () => {
  it('⭐⭐ THE CHECKSUM MOVES with the values, and matches the stored map exactly', () => {
    const before = raw();
    const wasChecksum = typeOf(before, TYPE_A).checksum;
    const after = makeSetTypeValuesMigrator(V, V, {
      typeId: TYPE_A,
      values: { [P_WIDTH]: 1600 },
    }).apply(before);

    const t = typeOf(after, TYPE_A);
    expect(t.values[P_WIDTH]).toBe(1600);
    expect(t.checksum, 'a changed values map MUST change the checksum').not.toBe(wasChecksum);
    // ⭐ Not merely "different" — it is the digest OF THE STORED MAP. A checksum
    //   that moved but does not describe the values is the same defect wearing
    //   fresh bytes.
    expect(t.checksum).toBe(typeValuesChecksum(t.values as Record<string, number>));
    expect(t.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(FamilyDocumentSchema.safeParse(after.document).success).toBe(true);
  });

  it('⭐ REPLACES the map — it never merges, so a value can be CLEARED', () => {
    const after = makeSetTypeValuesMigrator(V, V, { typeId: TYPE_A, values: {} }).apply(raw());
    const t = typeOf(after, TYPE_A);
    expect(t.values, 'the type no longer pins anything').toEqual({});
    expect(t.checksum).toBe(typeValuesChecksum({}));
  });

  it('renames in the SAME op, so a rename cannot land without its values', () => {
    const after = makeSetTypeValuesMigrator(V, V, {
      typeId: TYPE_B, name: '  XL  ', values: { [P_WIDTH]: 2400 },
    }).apply(raw());
    expect(typeOf(after, TYPE_B).name, 'trimmed').toBe('XL');
    expect(typeOf(after, TYPE_B).values[P_WIDTH]).toBe(2400);
    expect(typeOf(after, TYPE_A).name, 'and touches no other type').toBe('Standard');
  });

  it('accepts every declared dataType in its own shape', () => {
    const after = makeSetTypeValuesMigrator(V, V, {
      typeId: TYPE_A,
      values: { [P_WIDTH]: 1500, [P_COUNT]: 3, [P_LABEL]: 'wide', [P_FLAG]: true },
    }).apply(raw());
    expect(typeOf(after, TYPE_A).values).toEqual({
      [P_WIDTH]: 1500, [P_COUNT]: 3, [P_LABEL]: 'wide', [P_FLAG]: true,
    });
  });

  it('is PURE — the input document is not mutated', () => {
    const before = raw();
    const snapshot = JSON.stringify(before.document);
    makeSetTypeValuesMigrator(V, V, { typeId: TYPE_A, values: { [P_WIDTH]: 1 } }).apply(before);
    expect(JSON.stringify(before.document)).toBe(snapshot);
  });

  it('does not let the CALLER mutate the document after the fact', () => {
    const values: Record<string, number> = { [P_WIDTH]: 1000 };
    const after = makeSetTypeValuesMigrator(V, V, { typeId: TYPE_A, values }).apply(raw());
    values[P_WIDTH] = 9999;
    expect(typeOf(after, TYPE_A).values[P_WIDTH]).toBe(1000);
  });

  it('⛔ REFUSES an unknown type', () => {
    expect(() =>
      makeSetTypeValuesMigrator(V, V, { typeId: 'typ_01HZ00000000000000000NNE01', values: {} })
        .apply(raw()),
    ).toThrow(/not found/);
  });

  it('⛔ REFUSES a value keyed to a parameter the definition does not declare', () => {
    expect(() =>
      makeSetTypeValuesMigrator(V, V, {
        typeId: TYPE_A, values: { par_01HZ00000000000000000NNE01: 5 },
      }).apply(raw()),
    ).toThrow(/declares no parameter for/);
  });

  it.each([
    ['a string into a length', { [P_WIDTH]: 'wide' as unknown as number }],
    ['a fraction into a count', { [P_COUNT]: 2.5 }],
    ['a number into a boolean', { [P_FLAG]: 1 as unknown as boolean }],
    ['a number into a string', { [P_LABEL]: 7 as unknown as string }],
    ['a non-finite length', { [P_WIDTH]: Number.POSITIVE_INFINITY }],
  ])('⛔ REFUSES %s rather than storing a value no resolver can read', (_l, values) => {
    expect(() =>
      makeSetTypeValuesMigrator(V, V, { typeId: TYPE_A, values }).apply(raw()),
    ).toThrow(/is declared as/);
  });

  it('⛔ REFUSES an empty name, and a name another type already carries', () => {
    expect(() =>
      makeSetTypeValuesMigrator(V, V, { typeId: TYPE_A, name: '   ', values: {} }).apply(raw()),
    ).toThrow(/cannot be empty/);
    // ⭐ Uniqueness lives in the OP because `FamilyTypeSchema` only says `min(1)`
    //   — a UI-only guard is one deleted line from two types nobody can tell apart.
    expect(() =>
      makeSetTypeValuesMigrator(V, V, { typeId: TYPE_A, name: 'large', values: {} }).apply(raw()),
    ).toThrow(/already exists/);
    // …but a type may keep its OWN name.
    expect(() =>
      makeSetTypeValuesMigrator(V, V, { typeId: TYPE_A, name: 'Standard', values: {} }).apply(raw()),
    ).not.toThrow();
  });
});

describe('§UCE-TYPE-CHECKSUM-IS-COMPUTED — ONE digest, shared with split-type', () => {
  it('⭐ a type CREATED by split-type and one EDITED to the same values agree byte-for-byte', () => {
    // The create path…
    const split = makeSplitTypeMigrator(V, V, {
      sourceTypeId: TYPE_A,
      newTypeId: 'typ_01HZ00000000000000000NEW01',
      newTypeName: 'Cloned',
      valueOverrides: { [P_WIDTH]: 1750 },
    }).apply(raw());
    // …and the edit path, landing on the same values.
    const edited = makeSetTypeValuesMigrator(V, V, {
      typeId: TYPE_B, values: { [P_WIDTH]: 1750 },
    }).apply(raw());

    expect(typeOf(split, 'typ_01HZ00000000000000000NEW01').checksum)
      .toBe(typeOf(edited, TYPE_B).checksum);
    // ⛔ If these two ever diverge, the create path and the edit path have grown
    //   private digests and "is this type dirty?" has two answers (C84 EI-9).
  });

  it('the digest is a pure function of the values, not of key order', () => {
    const a = typeValuesChecksum({ [P_WIDTH]: 1, [P_COUNT]: 2 });
    const b = typeValuesChecksum({ [P_COUNT]: 2, [P_WIDTH]: 1 });
    expect(a).toBe(b);
    expect(a).not.toBe(typeValuesChecksum({ [P_WIDTH]: 1, [P_COUNT]: 3 }));
  });
});
