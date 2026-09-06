// §82.1-NAME-A-DATUM — the `rename-reference-plane` op (lane UCE-ACCEPTANCES).
//
// STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC §82.1, verbatim: *"Create a reference
// plane in a 2-D view; it is visible in the 3-D view; **rename it**; dimension to
// it."* Three of those four had an op before this one; `rename it` did not.
//
// ⛔ IMPORTS THE LEAF BARREL, NOT `../../src/index.js` — the package barrel drags
//   in `pdfjs-dist` (`DOMMatrix` at module scope) and throws under this package's
//   `environment: 'node'` config. Same reason `set-extrude-work-plane-op.test.ts`
//   states. ⚠ That is ALSO why this file cannot catch a missing entry in the TOP
//   barrel — the defect §82.4-BARREL-SUBSET fixed. Only the DOM gesture probe
//   (`apps/editor/__tests__/componentWorkPlaneGestureReach.test.ts`) can.

import { describe, it, expect } from 'vitest';
import {
  makeAddBoxSolidMigrator,
  makeAddReferencePlaneMigrator,
  makeRenameReferencePlaneMigrator,
} from '../../src/family-migrations/index.js';
import type { RawFamily } from '../../src/family-migrations/index.js';
import { FamilyDocumentSchema } from '../../src/family-schema.js';
import type { FamilyDocument, FamilyManifest, ReferencePlane } from '../../src/family-schema.js';

const V = '1.1';
const NOW = '2026-09-06T00:00:00.000Z';
const EMPTY_HASH = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

const HOST = 'plane_01HZ00000000000000000RNM01';
const WALL = 'plane_01HZ00000000000000000RNM02';
const ABSENT = 'plane_01HZ00000000000000000RNM99';
const P_WIDTH = 'par_01HZ00000000000000000WDT02';
const SOLID = 'sol_01HZ00000000000000000BXR01';
const PROFILE = 'prof_01HZ00000000000000000BXR01';
const TYPE = 'typ_01HZ00000000000000000DEF02';
const E = [
  '01HZE0000000000000000RN001', '01HZE0000000000000000RN002',
  '01HZE0000000000000000RN003', '01HZE0000000000000000RN004',
];

const MANIFEST = {
  formatVersion: V,
  id: 'fam_01HZ00000000000000000FAM02',
  name: 'Rename fixture',
  semver: '1.0.0',
  author: { id: 'usr_01HZ00000000000000000ASU82', displayName: 'lane-uce-acceptances' },
  description: '',
  ifcEntity: 'IfcBuildingElementProxy',
  category: 'Generic',
  tags: [],
  minPRYZMVersion: '2.0.0',
  schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  createdAt: NOW,
  lastModifiedAt: NOW,
} as unknown as FamilyManifest;

function makeDoc(): FamilyDocument {
  return {
    formatVersion: V,
    referencePlanes: [
      { id: HOST, name: 'Base', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: P_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1000, expression: null, ifcMapping: null, exposed: true },
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

function frame(): RawFamily {
  return { manifest: MANIFEST, document: makeDoc(), events: [] };
}

const WALL_PLANE: ReferencePlane = {
  id: WALL, name: 'Wall face', origin: { x: 0, y: 0, z: 0 },
  normal: { x: 1, y: 0, z: 0 }, isHost: false,
} as ReferencePlane;

/** A document with two planes and one box drawn on the HOST plane — the state a
 *  user reaches with "Add shape" then "Add work plane…" in the workspace. */
function withTwoPlanesAndABox(): RawFamily {
  let f = makeAddReferencePlaneMigrator(V, V, { plane: WALL_PLANE }).apply(frame());
  f = makeAddBoxSolidMigrator(V, V, {
    solidId: SOLID,
    profileId: PROFILE,
    profileName: 'Box',
    planeId: HOST,
    entityIds: E,
    width: { kind: 'parameter', parameterId: P_WIDTH },
    depth: { kind: 'literal', value: 600 },
    height: { kind: 'literal', value: 600 },
  }).apply(f);
  return f;
}

function planeOf(doc: FamilyDocument, id: string): ReferencePlane {
  const pl = doc.referencePlanes.find((p) => p.id === id);
  if (!pl) throw new Error(`plane ${id} missing from the result`);
  return pl as ReferencePlane;
}

describe('§82.1-NAME-A-DATUM — rename-reference-plane', () => {

  it('⭐ renames the plane, leaves the ID alone, and the result still validates', () => {
    const before = withTwoPlanesAndABox();
    const after = makeRenameReferencePlaneMigrator(V, V, {
      planeId: WALL, newName: 'North elevation',
    }).apply(before);

    expect(planeOf(after.document, WALL).name).toBe('North elevation');
    // ⭐ THE POINT OF THE OP: identity is the id, and it does not move.
    expect(after.document.referencePlanes.map((p) => p.id))
      .toEqual(before.document.referencePlanes.map((p) => p.id));
    // …and nothing else about the plane changed.
    expect(planeOf(after.document, WALL).normal).toEqual({ x: 1, y: 0, z: 0 });
    expect(planeOf(after.document, WALL).isHost).toBe(false);
    // …and the OTHER plane is untouched.
    expect(planeOf(after.document, HOST).name).toBe('Base');
    expect(FamilyDocumentSchema.safeParse(after.document).success).toBe(true);
  });

  it('⭐⭐ a rename CANNOT orphan geometry — the profile still points at the plane it was drawn on, and no solid moved', () => {
    const before = withTwoPlanesAndABox();
    const after = makeRenameReferencePlaneMigrator(V, V, {
      planeId: HOST, newName: 'Ground datum',
    }).apply(before);

    // The profile references the plane BY ID, so a rename is invisible to it.
    const profile = after.document.profiles.find((p) => p.id === PROFILE)!;
    expect(profile.planeId).toBe(HOST);
    // The solid is byte-for-byte what it was — a rename touches no geometry, which
    // is precisely why it is offerable on a plane that already carries shapes while
    // reorient and delete are not.
    expect(after.document.solids).toEqual(before.document.solids);
    expect(after.document.profiles).toEqual(before.document.profiles);
  });

  it('trims the name, and a name that is only whitespace REFUSES by name', () => {
    const f = withTwoPlanesAndABox();
    const after = makeRenameReferencePlaneMigrator(V, V, {
      planeId: WALL, newName: '  Sill line  ',
    }).apply(f);
    expect(planeOf(after.document, WALL).name).toBe('Sill line');

    expect(() => makeRenameReferencePlaneMigrator(V, V, {
      planeId: WALL, newName: '   ',
    }).apply(f)).toThrow(/empty name/);
    expect(() => makeRenameReferencePlaneMigrator(V, V, {
      planeId: WALL, newName: '   ',
    }).apply(f)).toThrow(/cannot be referred to/);
  });

  it('⛔ a DUPLICATE name refuses, and says why: the chooser picks a plane by NAME, never by id', () => {
    const f = withTwoPlanesAndABox();
    expect(() => makeRenameReferencePlaneMigrator(V, V, {
      planeId: WALL, newName: 'Base',
    }).apply(f)).toThrow(/already carries a reference plane named "Base"/);
    expect(() => makeRenameReferencePlaneMigrator(V, V, {
      planeId: WALL, newName: 'Base',
    }).apply(f)).toThrow(/chosen by NAME and never by id/);
  });

  it('⛔ an unknown plane refuses by id, and a rename to the CURRENT name refuses rather than reporting a no-op as success', () => {
    const f = withTwoPlanesAndABox();
    expect(() => makeRenameReferencePlaneMigrator(V, V, {
      planeId: ABSENT, newName: 'Anything',
    }).apply(f)).toThrow(/is not carried by this definition/);
    expect(() => makeRenameReferencePlaneMigrator(V, V, {
      planeId: WALL, newName: 'Wall face',
    }).apply(f)).toThrow(/already named "Wall face"/);
  });

  it('⛔ EVERY refusal leaves the input document byte-identical — the throw happens before a new document is built', () => {
    const f = withTwoPlanesAndABox();
    const snapshot = JSON.stringify(f.document);
    for (const bad of [
      { planeId: ABSENT, newName: 'X' },
      { planeId: WALL, newName: '  ' },
      { planeId: WALL, newName: 'Base' },
      { planeId: WALL, newName: 'Wall face' },
    ]) {
      expect(() => makeRenameReferencePlaneMigrator(V, V, bad).apply(f)).toThrow();
    }
    expect(JSON.stringify(f.document)).toBe(snapshot);
  });
});
