// §82.1-PARAMETRIC-DATUM — the `set-plane-offset` op (lane CE-PARAMS-AND-PLANES).
//
// STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC §82.1 (*"create a reference plane …
// rename it; DIMENSION TO IT"*) · C110 §2.8 `§TWO-DEFAULT-STORES` · C111 §5.1 D-9
// (*"`referencePlanes` … are inert"*) · C84 EI-6 / EI-9 · spec §75.
//
// ⛔ IMPORTS THE LEAF MODULES, NOT `../../src/index.js` — the package barrel drags
//   in `pdfjs-dist` (`DOMMatrix` at module scope) and throws under this package's
//   `environment: 'node'` config. Same reason `set-extrude-work-plane-op.test.ts`
//   states.
//
// What is proven here is the DOCUMENT half: the op writes the dimension, the
// result still validates, clearing removes the KEY rather than nulling it, and
// every refusal names its cause and leaves the document untouched. The GEOMETRY
// half — that a dimensioned plane MOVES the baked solid, and that changing the
// parameter moves it again — is proven where the bake lives
// (`packages/family-instance/__tests__/planeOffsetFlex.test.ts`). ⛔ Neither
// half establishes the requirement alone: a string that round-trips and never
// reaches the evaluator is exactly the defect §82.1 is about.

import { describe, it, expect } from 'vitest';
import {
  makeAddReferencePlaneMigrator,
  makeSetPlaneOffsetMigrator,
} from '../../src/family-migrations/index.js';
import type { RawFamily } from '../../src/family-migrations/index.js';
import { FamilyDocumentSchema, ReferencePlaneSchema } from '../../src/family-schema.js';
import type { FamilyDocument, FamilyManifest, ReferencePlane } from '../../src/family-schema.js';

const V = '1.1';
const NOW = '2026-09-06T00:00:00.000Z';
const EMPTY_HASH = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

const HOST = 'plane_01HZ00000000000000000PNE01';
const TOP = 'plane_01HZ00000000000000000PNE02';
const OFFSET_PLANE = 'plane_01HZ00000000000000000PNE03';
const NULL_PLANE = 'plane_01HZ00000000000000000PNE04';
const ABSENT_PLANE = 'plane_01HZ00000000000000000PNE99';
const P_HEIGHT = 'par_01HZ00000000000000000HGT01';
const TYPE = 'typ_01HZ00000000000000000DEF01';

const MANIFEST = {
  formatVersion: V,
  id: 'fam_01HZ00000000000000000FAM01',
  name: 'Parametric datum fixture',
  semver: '1.0.0',
  author: { id: 'usr_01HZ00000000000000000ASU82', displayName: 'lane-ce-params-and-planes' },
  description: '',
  ifcEntity: 'IfcBuildingElementProxy',
  category: 'Generic',
  tags: [],
  minPRYZMVersion: '2.0.0',
  schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  createdAt: NOW,
  lastModifiedAt: NOW,
} as unknown as FamilyManifest;

const TOP_PLANE: ReferencePlane = {
  id: TOP, name: 'Top of Datum', origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 }, isHost: false,
} as ReferencePlane;

/** A plane already carrying a LITERAL origin — the v1 datum no evaluator
 *  applies. Dimensioning it would be a second statement of one position. */
const ALREADY_OFFSET: ReferencePlane = {
  id: OFFSET_PLANE, name: 'Already moved', origin: { x: 0, y: 1.5, z: 0 },
  normal: { x: 0, y: 1, z: 0 }, isHost: false,
} as ReferencePlane;

const ZERO_NORMAL: ReferencePlane = {
  id: NULL_PLANE, name: 'No direction', origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 0 }, isHost: false,
} as ReferencePlane;

function makeDoc(): FamilyDocument {
  return {
    formatVersion: V,
    referencePlanes: [
      { id: HOST, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: P_HEIGHT, name: 'DatumHeight', kind: 'type', dataType: 'length', defaultValue: 2100, expression: null, ifcMapping: null, exposed: true },
    ],
    profiles: [],
    solids: [],
    materialSlots: [],
    types: [{ id: TYPE, name: 'Standard', values: {}, checksum: EMPTY_HASH }],
    representations: [],
    connectors: [],
    propertySets: [],
    featureEdges: [],
  } as unknown as FamilyDocument;
}

function frame(planes: readonly ReferencePlane[] = [TOP_PLANE]): RawFamily {
  let f: RawFamily = { manifest: MANIFEST, document: makeDoc(), events: [] };
  for (const plane of planes) {
    f = makeAddReferencePlaneMigrator(V, V, { plane }).apply(f);
  }
  return f;
}

function planeOf(doc: FamilyDocument, id: string): ReferencePlane {
  const pl = doc.referencePlanes.find((p) => p.id === id);
  if (!pl) throw new Error(`fixture is missing plane ${id}`);
  return pl;
}

describe('§82.1-PARAMETRIC-DATUM — set-plane-offset dimensions ONE plane', () => {
  it('⭐ writes the expression, leaves the origin at zero, and the document still validates', () => {
    const before = frame();
    expect(planeOf(before.document, TOP).offsetExpression).toBeUndefined();

    const after = makeSetPlaneOffsetMigrator(V, V, {
      planeId: TOP, offsetExpression: 'DatumHeight',
    }).apply(before);

    const pl = planeOf(after.document, TOP);
    expect(pl.offsetExpression).toBe('DatumHeight');
    // ⛔ ONE POSITION. The literal origin must stay at the model origin — the op
    //    dimensions the plane, it does not also move it a second way.
    expect(pl.origin).toEqual({ x: 0, y: 0, z: 0 });
    // The whole document still parses: an additive optional key is not a break.
    expect(FamilyDocumentSchema.safeParse(after.document).success).toBe(true);
  });

  it('accepts an ARITHMETIC dimension — the engine reads it, so this op need not', () => {
    const after = makeSetPlaneOffsetMigrator(V, V, {
      planeId: TOP, offsetExpression: 'DatumHeight - 100',
    }).apply(frame());
    expect(planeOf(after.document, TOP).offsetExpression).toBe('DatumHeight - 100');
  });

  it('leaves every OTHER plane untouched', () => {
    const after = makeSetPlaneOffsetMigrator(V, V, {
      planeId: TOP, offsetExpression: 'DatumHeight',
    }).apply(frame());
    expect(planeOf(after.document, HOST).offsetExpression).toBeUndefined();
    expect(after.document.referencePlanes).toHaveLength(2);
  });

  it('CLEARING removes the KEY, not sets it to null — an undimensioned plane re-packs identically', () => {
    const dimensioned = makeSetPlaneOffsetMigrator(V, V, {
      planeId: TOP, offsetExpression: 'DatumHeight',
    }).apply(frame());
    const cleared = makeSetPlaneOffsetMigrator(V, V, {
      planeId: TOP, offsetExpression: null,
    }).apply(dimensioned);

    const pl = planeOf(cleared.document, TOP);
    expect('offsetExpression' in pl).toBe(false);
    // ⭐ The reason it matters: the cleared plane is the SAME OBJECT SHAPE as one
    //    that never carried a dimension, so its canonical bytes — and therefore
    //    the document's `schemaHash` and signature — are identical.
    expect(pl).toEqual(planeOf(frame().document, TOP));
    expect(FamilyDocumentSchema.safeParse(cleared.document).success).toBe(true);
  });

  it('a plane WITHOUT a dimension parses and carries no key at all (C111 §5.4-a)', () => {
    const parsed = ReferencePlaneSchema.parse({
      id: TOP, name: 'Top', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 },
    });
    expect('offsetExpression' in parsed).toBe(false);
  });
});

describe('§82.1-PARAMETRIC-DATUM — the refusals, each naming its cause', () => {
  function expectRefusal(
    planes: readonly ReferencePlane[],
    params: { planeId: string; offsetExpression: string | null },
    fragment: string,
  ): void {
    const before = frame(planes);
    const snapshot = JSON.stringify(before.document);
    expect(() => makeSetPlaneOffsetMigrator(V, V, params).apply(before)).toThrow(fragment);
    // ⛔ A refusal leaves the document untouched — the migrator throws before it
    //    builds a new one, so a half-dimensioned plane is not a state this op
    //    can produce.
    expect(JSON.stringify(before.document)).toBe(snapshot);
  }

  it('refuses a plane this definition does not carry', () => {
    expectRefusal(
      [TOP_PLANE],
      { planeId: ABSENT_PLANE, offsetExpression: 'DatumHeight' },
      'is not carried by this definition',
    );
  });

  it('refuses a BLANK expression, and says null is how you clear it', () => {
    expectRefusal([TOP_PLANE], { planeId: TOP, offsetExpression: '   ' }, 'blank');
  });

  it('refuses a plane whose normal names no direction', () => {
    expectRefusal(
      [ZERO_NORMAL],
      { planeId: NULL_PLANE, offsetExpression: 'DatumHeight' },
      'zero-length normal',
    );
  });

  it('⭐ refuses to state one position TWICE — a literal origin plus a dimension', () => {
    expectRefusal(
      [ALREADY_OFFSET],
      { planeId: OFFSET_PLANE, offsetExpression: 'DatumHeight' },
      'SECOND statement of where the plane is',
    );
  });

  it('CLEARING a plane with a literal origin is still allowed — the refusal is about the PAIR', () => {
    const before = frame([ALREADY_OFFSET]);
    const after = makeSetPlaneOffsetMigrator(V, V, {
      planeId: OFFSET_PLANE, offsetExpression: null,
    }).apply(before);
    expect(planeOf(after.document, OFFSET_PLANE).origin).toEqual({ x: 0, y: 1.5, z: 0 });
  });
});
