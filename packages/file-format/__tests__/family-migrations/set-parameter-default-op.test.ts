// §PARAM-VALUE-IS-EDITABLE — the `set-parameter-default` op (lane CE-PARAMS-AND-PLANES).
//
// C110 §1.1 row 6 · C110 §2 (`§PARAM-PRECEDENCE`) · C110 §3 (quantity kinds) ·
// ADR-0376 D4 · C111 §5.3-a · C84 EI-6 / EI-9 · spec §75.
//
// ⛔ IMPORTS THE BARREL AT `../../src/family-migrations/index.js` ON PURPOSE — and
//   that is an assertion, not a convenience. The `.js` beside the sources is what
//   LOADS, so importing the barrel here is what proves the op is reachable through
//   the module every consumer actually executes. The op one commit ago failed 9 of
//   10 tests with `makeSetPlaneOffsetMigrator is not a function` for exactly this
//   reason, and that failure is worth being able to reproduce.
//
// What is proven here is the DOCUMENT half: the op writes the value, the result
// still validates, clearing sets `null`, and every refusal names its cause and
// leaves the document untouched. That a changed value MOVES GEOMETRY is proven in
// `packages/family-instance/__tests__/planeOffsetFlex.test.ts` and, at the layer a
// user touches, in `apps/editor/__tests__/componentPlaneDimensionGestureReach.test.ts`.

import { describe, it, expect } from 'vitest';
import { makeSetParameterDefaultMigrator } from '../../src/family-migrations/index.js';
import type { RawFamily } from '../../src/family-migrations/index.js';
import { FamilyDocumentSchema } from '../../src/family-schema.js';
import type { FamilyDocument, FamilyManifest, FamilyParameter } from '../../src/family-schema.js';

const V = '1.1';
const NOW = '2026-09-06T00:00:00.000Z';
const EMPTY_HASH = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

const P_LEN = 'par_01HZ00000000000000000HGT01';
const P_COUNT = 'par_01HZ00000000000000000CNT01';
const P_BOOL = 'par_01HZ00000000000000000BNR01';
const P_STR = 'par_01HZ00000000000000000STR01';
const P_FORMULA = 'par_01HZ00000000000000000FRM01';
const P_ABSENT = 'par_01HZ00000000000000000XXX99';
const TYPE = 'typ_01HZ00000000000000000DEF01';

function param(over: Partial<FamilyParameter> & { id: string; name: string }): FamilyParameter {
  return {
    kind: 'type', dataType: 'length', defaultValue: 2100, expression: null,
    ifcMapping: null, exposed: true, ...over,
  } as FamilyParameter;
}

const PARAMS: readonly FamilyParameter[] = [
  param({ id: P_LEN, name: 'Height' }),
  param({ id: P_COUNT, name: 'Treads', dataType: 'count', defaultValue: 12 }),
  param({ id: P_BOOL, name: 'Mirrored', dataType: 'boolean', defaultValue: 0 }),
  param({ id: P_STR, name: 'Label', dataType: 'string', defaultValue: 'A' }),
  param({ id: P_FORMULA, name: 'Glass', defaultValue: null, expression: 'Height - 100' }),
];

function frame(): RawFamily {
  const document = {
    formatVersion: V,
    referencePlanes: [],
    parameters: [...PARAMS],
    profiles: [],
    solids: [],
    materialSlots: [],
    types: [{ id: TYPE, name: 'Default', values: {}, checksum: EMPTY_HASH }],
    representations: [],
    connectors: [],
    propertySets: [],
    featureEdges: [],
  } as unknown as FamilyDocument;
  const manifest: FamilyManifest = {
    formatVersion: V, id: 'fam_01HZ00000000000000000FAM01', name: 'ValueTest', semver: '1.0.0',
    author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'Test' },
    description: '', ifcEntity: 'IfcBuildingElementProxy', category: 'Generic', tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: NOW, lastModifiedAt: NOW,
  } as unknown as FamilyManifest;
  return { manifest, document, events: [] } as unknown as RawFamily;
}

function paramOf(doc: FamilyDocument, id: string): FamilyParameter {
  const p = doc.parameters.find((q) => q.id === id);
  if (!p) throw new Error(`no parameter ${id}`);
  return p;
}

describe('§PARAM-VALUE-IS-EDITABLE — the op writes the value', () => {
  it('⭐ changes a length parameter\'s value, and the document still validates', () => {
    const before = frame();
    expect(paramOf(before.document, P_LEN).defaultValue).toBe(2100);

    const after = makeSetParameterDefaultMigrator(V, V, {
      parameterId: P_LEN, defaultValue: 2400,
    }).apply(before);

    expect(paramOf(after.document, P_LEN).defaultValue).toBe(2400);
    expect(FamilyDocumentSchema.safeParse(after.document).success).toBe(true);
    // ⛔ The INPUT is untouched — an op returns a new document, it does not mutate.
    expect(paramOf(before.document, P_LEN).defaultValue).toBe(2100);
  });

  it('touches nothing else on the parameter, and no other parameter', () => {
    const before = frame();
    const after = makeSetParameterDefaultMigrator(V, V, {
      parameterId: P_LEN, defaultValue: 2400,
    }).apply(before);
    const p = paramOf(after.document, P_LEN);
    expect(p.name).toBe('Height');
    expect(p.dataType).toBe('length');
    expect(p.expression).toBeNull();
    expect(p.exposed).toBe(true);
    // ⛔ `supersededDefault` is `introduce-expression`'s provenance record of ONE
    //    event. Rewriting it here would make it a mutable second default store.
    expect('supersededDefault' in p).toBe(false);
    expect(paramOf(after.document, P_COUNT).defaultValue).toBe(12);
    expect(paramOf(after.document, P_STR).defaultValue).toBe('A');
  });

  it('CLEARS a value with null, which is a different act from setting 0', () => {
    const after = makeSetParameterDefaultMigrator(V, V, {
      parameterId: P_LEN, defaultValue: null,
    }).apply(frame());
    expect(paramOf(after.document, P_LEN).defaultValue).toBeNull();
    // ⭐ `null` here is NOT the absent-key convention `offsetExpression` uses:
    //    `FamilyParameterSchema.defaultValue` is `.default(null)`, so null IS the
    //    schema's "no default" and an absent key would be normalised to it anyway.
    expect(FamilyDocumentSchema.safeParse(after.document).success).toBe(true);
  });

  it('accepts every datatype in ITS OWN terms — count, boolean-as-scalar, string', () => {
    const c = makeSetParameterDefaultMigrator(V, V, { parameterId: P_COUNT, defaultValue: 14 })
      .apply(frame());
    expect(paramOf(c.document, P_COUNT).defaultValue).toBe(14);
    const b = makeSetParameterDefaultMigrator(V, V, { parameterId: P_BOOL, defaultValue: 1 })
      .apply(frame());
    expect(paramOf(b.document, P_BOOL).defaultValue).toBe(1);
    const s = makeSetParameterDefaultMigrator(V, V, { parameterId: P_STR, defaultValue: 'B' })
      .apply(frame());
    expect(paramOf(s.document, P_STR).defaultValue).toBe('B');
  });

  it('accepts a NEGATIVE length — "150 below" is a real intent and is not clamped', () => {
    const after = makeSetParameterDefaultMigrator(V, V, { parameterId: P_LEN, defaultValue: -150 })
      .apply(frame());
    expect(paramOf(after.document, P_LEN).defaultValue).toBe(-150);
  });
});

describe('§PARAM-VALUE-IS-EDITABLE — the refusals, each naming its own cause', () => {
  function expectRefusal(
    params: { parameterId: string; defaultValue: number | string | null },
    fragment: string,
  ): void {
    const before = frame();
    const snapshot = JSON.stringify(before.document);
    expect(() => makeSetParameterDefaultMigrator(V, V, params).apply(before)).toThrow(fragment);
    expect(JSON.stringify(before.document), 'the document is untouched').toBe(snapshot);
  }

  it('refuses a parameter the definition does not carry', () => {
    expectRefusal({ parameterId: P_ABSENT, defaultValue: 1 }, 'is not carried by this definition');
  });

  it('⭐⭐ refuses a parameter that carries a FORMULA — D4 means the value would resolve to nothing', () => {
    expectRefusal({ parameterId: P_FORMULA, defaultValue: 900 }, 'ADR-0376 D4');
    // The refusal names the op that makes the value reachable again, rather than
    // leaving the author to find it.
    expect(() => makeSetParameterDefaultMigrator(V, V, {
      parameterId: P_FORMULA, defaultValue: 900,
    }).apply(frame())).toThrow('delete-expression');
  });

  it('⭐ CLEARING a formula-carrying parameter is still allowed — the refusal is about writing a VALUE', () => {
    // Its `defaultValue` is already null, so this refuses for the OTHER reason —
    // and that distinction is the point: the two refusals are not one rule.
    expect(() => makeSetParameterDefaultMigrator(V, V, {
      parameterId: P_FORMULA, defaultValue: null,
    }).apply(frame())).toThrow('already carries no default');
  });

  it('refuses a value whose type contradicts the declared dataType, in both directions', () => {
    expectRefusal({ parameterId: P_LEN, defaultValue: 'tall' }, 'finite');
    expectRefusal({ parameterId: P_STR, defaultValue: 12 }, 'is text');
  });

  it('refuses a fractional or negative COUNT rather than rounding it', () => {
    expectRefusal({ parameterId: P_COUNT, defaultValue: 2.5 }, 'non-negative whole');
    expectRefusal({ parameterId: P_COUNT, defaultValue: -1 }, 'non-negative whole');
    // ⭐ The refusal says WHY rounding is wrong, not merely that it did not happen.
    expect(() => makeSetParameterDefaultMigrator(V, V, {
      parameterId: P_COUNT, defaultValue: 2.5,
    }).apply(frame())).toThrow('rather than rounded');
  });

  it('refuses a boolean spelled any way but the resolver\'s scalar 0/1', () => {
    expectRefusal({ parameterId: P_BOOL, defaultValue: 2 }, 'scalar 0 or 1');
    expectRefusal({ parameterId: P_BOOL, defaultValue: 'true' }, 'scalar 0 or 1');
  });

  it('refuses a "change" to the value already held, rather than reporting a no-op as success', () => {
    expectRefusal({ parameterId: P_LEN, defaultValue: 2100 }, 'already has the value');
  });

  it('refuses a non-finite number — NaN is not a measurement', () => {
    expectRefusal({ parameterId: P_LEN, defaultValue: Number.NaN }, 'finite');
    expectRefusal({ parameterId: P_LEN, defaultValue: Number.POSITIVE_INFINITY }, 'finite');
  });
});
