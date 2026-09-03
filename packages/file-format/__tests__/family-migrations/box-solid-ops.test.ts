// §U8-AUTHORED-SHAPE — the geometry-authoring ops (lane U8).
//
// ⛔ IMPORTS THE LEAF MODULES, NOT `../../src/index.js` — the package barrel
//   drags in `pdfjs-dist` (`DOMMatrix` at module scope) and throws under this
//   package's `environment: 'node'` config. Same reason as
//   `v1_1-round-trip.test.ts`.
//
// What is proven here is the DOCUMENT half: the op writes the canonical
// §U8-BOX-SPELLING, `readBoxSolid` recovers exactly what was written, every
// refusal names its cause, and the produced document passes the schema. The
// GEOMETRY half — that the spelling bakes into a mesh carrying the authored
// millimetres — is proven where the bake lives, in
// `apps/editor/__tests__/componentAuthoredShapeBakes.test.ts`.

import { describe, it, expect } from 'vitest';
import {
  makeAddBoxSolidMigrator,
  makeAddReferencePlaneMigrator,
  makeDeleteSolidMigrator,
  makeDeleteParameterMigrator,
  makeRenameParameterMigrator,
  makeSetBoxDimensionsMigrator,
  readBoxSolid,
} from '../../src/family-migrations/index.js';
import type { RawFamily } from '../../src/family-migrations/index.js';
import { FamilyDocumentSchema } from '../../src/family-schema.js';
import type { FamilyDocument, FamilyManifest } from '../../src/family-schema.js';

const V = '1.1';
const NOW = '2026-09-03T00:00:00.000Z';
const EMPTY_HASH = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

const PLANE = 'plane_01HZ00000000000000000PNE01';
const PLANE_B = 'plane_01HZ00000000000000000PNE02';
const P_WIDTH = 'par_01HZ00000000000000000WDT01';
const P_HEIGHT = 'par_01HZ00000000000000000HGT01';
const P_COUNT = 'par_01HZ00000000000000000CNT01';
const P_SPACED = 'par_01HZ00000000000000000SPC01';
const SOLID = 'sol_01HZ00000000000000000BXA01';
const SOLID_B = 'sol_01HZ00000000000000000BXB01';
const PROFILE = 'prof_01HZ00000000000000000BXA01';
const PROFILE_B = 'prof_01HZ00000000000000000BXB01';
const TYPE = 'typ_01HZ00000000000000000DEF01';
const E = ['01HZE0000000000000000PT001', '01HZE0000000000000000PT002', '01HZE0000000000000000PT003', '01HZE0000000000000000PT004'];

function makeDoc(): FamilyDocument {
  return {
    formatVersion: V,
    referencePlanes: [
      { id: PLANE, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: P_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1000, expression: null, ifcMapping: null, exposed: true },
      { id: P_HEIGHT, name: 'Height', kind: 'instance', dataType: 'length', defaultValue: 600, expression: null, ifcMapping: null, exposed: true },
      { id: P_COUNT, name: 'Leaves', kind: 'type', dataType: 'count', defaultValue: 2, expression: null, ifcMapping: null, exposed: true },
      { id: P_SPACED, name: 'Glass Width', kind: 'type', dataType: 'length', defaultValue: 500, expression: null, ifcMapping: null, exposed: true },
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

const MANIFEST = {
  formatVersion: V,
  id: 'fam_01HZ00000000000000000FAM01',
  name: 'U8 Box',
  semver: '1.0.0',
  author: { id: 'usr_01HZ00000000000000000ASU08', displayName: 'lane-u8' },
  description: '',
  ifcEntity: 'IfcBuildingElementProxy',
  category: 'Generic',
  tags: [],
  minPRYZMVersion: '2.0.0',
  schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  createdAt: NOW,
  lastModifiedAt: NOW,
} as unknown as FamilyManifest;

function frame(document: FamilyDocument = makeDoc()): RawFamily {
  return { manifest: MANIFEST, document, events: [] };
}

function addBox(overrides: Partial<Parameters<typeof makeAddBoxSolidMigrator>[2]> = {}) {
  return makeAddBoxSolidMigrator(V, V, {
    solidId: SOLID,
    profileId: PROFILE,
    profileName: 'Box',
    planeId: PLANE,
    entityIds: E,
    width: { kind: 'parameter', parameterId: P_WIDTH },
    depth: { kind: 'literal', value: 600 },
    height: { kind: 'literal', value: 600 },
    ...overrides,
  });
}

describe('§U8-AUTHORED-SHAPE — add-box-solid writes ONE canonical spelling', () => {
  it('⭐ appends a rectangular profile + its extrude, and the document still validates', () => {
    const out = addBox().apply(frame());
    expect(out.document.profiles).toHaveLength(1);
    expect(out.document.solids).toHaveLength(1);
    const parsed = FamilyDocumentSchema.safeParse(out.document);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues[0])).toBe(true);

    const profile = out.document.profiles[0]!;
    expect(profile.entities.map((e) => e.data['x'])).toEqual([
      '-(Width) / 2', '(Width) / 2', '(Width) / 2', '-(Width) / 2',
    ]);
    expect(profile.entities.map((e) => e.data['z'])).toEqual([
      '-(600) / 2', '-(600) / 2', '(600) / 2', '(600) / 2',
    ]);
    const solid = out.document.solids[0]!;
    expect(solid.kind).toBe('extrude');
    if (solid.kind !== 'extrude') return;
    // ⛔ +Y only — any other direction is REFUSED by the bake, so authoring one
    // would author a refusal.
    expect(solid.direction).toEqual({ x: 0, y: 1, z: 0 });
    expect(solid.lengthExpression).toBe('600');
  });

  it('⭐ readBoxSolid recovers EXACTLY what was written — one authority for the spelling', () => {
    const out = addBox().apply(frame());
    const read = readBoxSolid(out.document, SOLID);
    expect(read).not.toBeNull();
    expect(read!.width).toEqual({ kind: 'parameter', parameterId: P_WIDTH });
    expect(read!.depth).toEqual({ kind: 'literal', value: 600 });
    expect(read!.height).toEqual({ kind: 'literal', value: 600 });
    expect(read!.profileId).toBe(PROFILE);
  });

  it('a profile this op did not write is NOT read as a box (null is an answer, not a failure)', () => {
    const doc = makeDoc();
    const sketched = {
      ...doc,
      profiles: [{
        id: PROFILE, name: 'Sketched', planeId: PLANE,
        entities: [
          { id: E[0]!, kind: 'point', data: { x: 0, z: 0 } },
          { id: E[1]!, kind: 'point', data: { x: 0.9, z: 0 } },
          { id: E[2]!, kind: 'point', data: { x: 0.9, z: 0.4 } },
          { id: E[3]!, kind: 'point', data: { x: 0, z: 0.4 } },
        ],
        constraints: [],
      }],
      solids: [{
        id: SOLID, kind: 'extrude', profileId: PROFILE, materialSlotId: null,
        lod: { coarse: false, medium: true, fine: true },
        lengthExpression: 'Height', direction: { x: 0, y: 1, z: 0 },
      }],
    } as unknown as FamilyDocument;
    expect(readBoxSolid(sketched, SOLID)).toBeNull();
  });

  it('every refusal names its cause', () => {
    expect(() => addBox().apply(frame(addBox().apply(frame()).document)))
      .toThrow(/already present/);
    expect(() => addBox({ planeId: PLANE_B }).apply(frame()))
      .toThrow(/reference plane .* is not carried/);
    expect(() => addBox({ entityIds: [E[0]!, E[1]!, E[2]!] }).apply(frame()))
      .toThrow(/exactly 4 distinct corner entity ids/);
    expect(() => addBox({ width: { kind: 'parameter', parameterId: P_COUNT } }).apply(frame()))
      .toThrow(/dataType is 'count'/);
    expect(() => addBox({ width: { kind: 'parameter', parameterId: P_SPACED } }).apply(frame()))
      .toThrow(/contains a space/);
    expect(() => addBox({ depth: { kind: 'literal', value: 0 } }).apply(frame()))
      .toThrow(/finite positive length/);
    expect(() => addBox({ height: { kind: 'parameter', parameterId: 'par_01HZ00000000000000000ZZZ01' } }).apply(frame()))
      .toThrow(/does not carry/);
  });
});

describe('§U8-AUTHORED-SHAPE — set-box-dimensions re-binds without rebuilding', () => {
  it('⭐ literal → parameter (the §64 move), and the entity IDS survive', () => {
    const withBox = addBox().apply(frame());
    const out = makeSetBoxDimensionsMigrator(V, V, {
      solidId: SOLID,
      height: { kind: 'parameter', parameterId: P_HEIGHT },
    }).apply(frame(withBox.document));
    const read = readBoxSolid(out.document, SOLID)!;
    expect(read.height).toEqual({ kind: 'parameter', parameterId: P_HEIGHT });
    expect(read.width).toEqual({ kind: 'parameter', parameterId: P_WIDTH });
    expect(out.document.profiles[0]!.entities.map((e) => e.id)).toEqual(E);
    const solid = out.document.solids[0]!;
    expect(solid.kind === 'extrude' && solid.lengthExpression).toBe('Height');
  });

  it('REFUSES a profile it cannot read, rather than overwriting authored geometry', () => {
    const withBox = addBox().apply(frame());
    const tampered = {
      ...withBox.document,
      profiles: [{ ...withBox.document.profiles[0]!, entities: withBox.document.profiles[0]!.entities.map(
        (e, i) => (i === 0 ? { ...e, data: { x: 0.25, z: -0.3 } } : e)) }],
    } as unknown as FamilyDocument;
    expect(() => makeSetBoxDimensionsMigrator(V, V, {
      solidId: SOLID, width: { kind: 'literal', value: 900 },
    }).apply(frame(tampered))).toThrow(/not a box authored by add-box-solid/);
  });

  it('REFUSES an empty change and an unknown solid', () => {
    const withBox = addBox().apply(frame());
    expect(() => makeSetBoxDimensionsMigrator(V, V, { solidId: SOLID }).apply(frame(withBox.document)))
      .toThrow(/no dimension to change/);
    expect(() => makeSetBoxDimensionsMigrator(V, V, { solidId: SOLID_B, width: { kind: 'literal', value: 1 } })
      .apply(frame(withBox.document))).toThrow(/not found/);
  });
});

describe('§U8-AUTHORED-SHAPE — delete-solid', () => {
  it('⭐ removes the solid AND its now-orphaned profile — and the last one may go, restoring the honest no-solids state', () => {
    const withBox = addBox().apply(frame());
    const out = makeDeleteSolidMigrator(V, V, { solidId: SOLID }).apply(frame(withBox.document));
    expect(out.document.solids).toHaveLength(0);
    expect(out.document.profiles).toHaveLength(0);
    const parsed = FamilyDocumentSchema.safeParse(out.document);
    expect(parsed.success).toBe(true);
  });

  it('keeps a profile another solid still references', () => {
    const withBox = addBox().apply(frame());
    const shared = {
      ...withBox.document,
      solids: [...withBox.document.solids, {
        id: SOLID_B, kind: 'extrude', profileId: PROFILE, materialSlotId: null,
        lod: { coarse: false, medium: true, fine: true },
        lengthExpression: 'Height', direction: { x: 0, y: 1, z: 0 },
      }],
    } as unknown as FamilyDocument;
    const out = makeDeleteSolidMigrator(V, V, { solidId: SOLID }).apply(frame(shared));
    expect(out.document.solids).toHaveLength(1);
    expect(out.document.profiles).toHaveLength(1);
  });

  it('REFUSES while a boolean feature consumes it as an operand', () => {
    const withBox = addBox().apply(frame());
    const withBoolean = {
      ...withBox.document,
      solids: [...withBox.document.solids, {
        id: SOLID_B, kind: 'boolean', op: 'subtract',
        subjectSolidId: SOLID, toolSolidId: SOLID, materialSlotId: null,
        lod: { coarse: false, medium: true, fine: true },
      }],
    } as unknown as FamilyDocument;
    expect(() => makeDeleteSolidMigrator(V, V, { solidId: SOLID }).apply(frame(withBoolean)))
      .toThrow(/consumes it as an operand/);
  });
});

describe('§U8-AUTHORED-SHAPE — add-reference-plane', () => {
  it('appends a plane and refuses a duplicate id or a second host', () => {
    const plane = { id: PLANE_B, name: 'Vertical', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, isHost: false };
    const out = makeAddReferencePlaneMigrator(V, V, { plane }).apply(frame());
    expect(out.document.referencePlanes).toHaveLength(2);
    expect(() => makeAddReferencePlaneMigrator(V, V, { plane }).apply(frame(out.document)))
      .toThrow(/already present/);
    expect(() => makeAddReferencePlaneMigrator(V, V, {
      plane: { ...plane, id: 'plane_01HZ00000000000000000PNE03', isHost: true },
    }).apply(frame())).toThrow(/already declares a host plane/);
  });
});

describe('§U8-RENAME-REACHES-PROFILES — the parameter ops now see profile expressions', () => {
  it('⭐ rename rewrites the bound corner expressions, not only lengthExpression', () => {
    const withBox = makeSetBoxDimensionsMigrator(V, V, {
      solidId: SOLID, height: { kind: 'parameter', parameterId: P_HEIGHT },
    }).apply(frame(addBox().apply(frame()).document));
    const out = makeRenameParameterMigrator(V, V, { parameterId: P_WIDTH, newName: 'BodyWidth' })
      .apply(frame(withBox.document));
    expect(out.document.profiles[0]!.entities[0]!.data['x']).toBe('-(BodyWidth) / 2');
    // …and the box is STILL a readable box afterwards, which is the whole point.
    expect(readBoxSolid(out.document, SOLID)!.width).toEqual({ kind: 'parameter', parameterId: P_WIDTH });
  });

  it('⭐ delete REFUSES a parameter a profile coordinate still references, naming the entity', () => {
    const withBox = addBox().apply(frame());
    expect(() => makeDeleteParameterMigrator(V, V, { parameterId: P_WIDTH }).apply(frame(withBox.document)))
      .toThrow(/profile .* coordinate 'x' is the expression/);
  });

  it('an unreferenced parameter still deletes cleanly', () => {
    const withBox = addBox().apply(frame());
    const out = makeDeleteParameterMigrator(V, V, { parameterId: P_COUNT }).apply(frame(withBox.document));
    expect(out.document.parameters.some((p) => p.id === P_COUNT)).toBe(false);
  });
});
