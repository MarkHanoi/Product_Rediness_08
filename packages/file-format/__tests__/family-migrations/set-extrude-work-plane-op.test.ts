// §82.4-DIRECTED-EXTRUDE — the `set-extrude-work-plane` op (lane UCE-ACCEPTANCES).
//
// STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC §82.4 · §82.1 · spec §75 · C84 EI-9.
//
// ⛔ IMPORTS THE LEAF MODULES, NOT `../../src/index.js` — the package barrel drags
//   in `pdfjs-dist` (`DOMMatrix` at module scope) and throws under this package's
//   `environment: 'node'` config. Same reason `box-solid-ops.test.ts` states.
//
// What is proven here is the DOCUMENT half: the op writes BOTH fields of the one
// fact (profile→plane, solid→axis), the result still validates, and every refusal
// names its cause and leaves the document untouched. The GEOMETRY half — that a
// non-+Y direction bakes into a mesh swept along that axis — is proven where the
// bake lives (`packages/family-instance/__tests__/profileRegeneration.test.ts`)
// and where the producer lives
// (`packages/geometry-kernel/__tests__/produceExtrude.direction.test.ts`).

import { describe, it, expect } from 'vitest';
import {
  makeAddBoxSolidMigrator,
  makeAddReferencePlaneMigrator,
  makeSetExtrudeWorkPlaneMigrator,
} from '../../src/family-migrations/index.js';
import type { RawFamily } from '../../src/family-migrations/index.js';
import { FamilyDocumentSchema } from '../../src/family-schema.js';
import type { FamilyDocument, FamilyManifest, ReferencePlane } from '../../src/family-schema.js';

const V = '1.1';
const NOW = '2026-09-05T00:00:00.000Z';
const EMPTY_HASH = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

const PLANE = 'plane_01HZ00000000000000000PNE01';
const WALL_PLANE = 'plane_01HZ00000000000000000PNE02';
const OFFSET_PLANE = 'plane_01HZ00000000000000000PNE03';
const NULL_PLANE = 'plane_01HZ00000000000000000PNE04';
const P_WIDTH = 'par_01HZ00000000000000000WDT01';
const SOLID = 'sol_01HZ00000000000000000BXA01';
const PROFILE = 'prof_01HZ00000000000000000BXA01';
const TYPE = 'typ_01HZ00000000000000000DEF01';
const E = [
  '01HZE0000000000000000PT001', '01HZE0000000000000000PT002',
  '01HZE0000000000000000PT003', '01HZE0000000000000000PT004',
];

const MANIFEST = {
  formatVersion: V,
  id: 'fam_01HZ00000000000000000FAM01',
  name: 'Work plane fixture',
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
      { id: PLANE, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
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

function frame(document: FamilyDocument = makeDoc()): RawFamily {
  return { manifest: MANIFEST, document, events: [] };
}

/** A document already carrying one box on the host plane — the state a user is
 *  in after "Add shape" in the workspace. */
function withBox(extraPlanes: readonly ReferencePlane[] = []): RawFamily {
  let f = frame();
  for (const plane of extraPlanes) {
    f = makeAddReferencePlaneMigrator(V, V, { plane }).apply(f);
  }
  return makeAddBoxSolidMigrator(V, V, {
    solidId: SOLID,
    profileId: PROFILE,
    profileName: 'Box',
    planeId: PLANE,
    entityIds: E,
    width: { kind: 'parameter', parameterId: P_WIDTH },
    depth: { kind: 'literal', value: 600 },
    height: { kind: 'literal', value: 600 },
  }).apply(f);
}

const WALL: ReferencePlane = {
  id: WALL_PLANE, name: 'Wall face', origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 4 }, isHost: false,
} as ReferencePlane;

function solidOf(doc: FamilyDocument) {
  const s = doc.solids.find((x) => x.id === SOLID)!;
  if (s.kind !== 'extrude') throw new Error('fixture solid is not an extrude');
  return s;
}

describe('§82.4 — set-extrude-work-plane binds ONE solid to ONE plane, both fields at once', () => {

  it('⭐ writes the plane\'s UNIT normal as the sweep axis AND re-binds the profile; the document still validates', () => {
    const before = withBox([WALL]);
    expect(solidOf(before.document).direction).toEqual({ x: 0, y: 1, z: 0 });
    expect(before.document.profiles[0]!.planeId).toBe(PLANE);

    const out = makeSetExtrudeWorkPlaneMigrator(V, V, { solidId: SOLID, planeId: WALL_PLANE })
      .apply(before);

    // ⭐ NORMALISED at the op, so no downstream reader has to: the plane's
    //    normal was (0,0,4) and the persisted axis is (0,0,1).
    expect(solidOf(out.document).direction).toEqual({ x: 0, y: 0, z: 1 });
    // ⭐ BOTH halves of the one fact — a profile still on the old plane would be
    //    the persistable-and-wrong state this op exists to prevent.
    expect(out.document.profiles[0]!.planeId).toBe(WALL_PLANE);

    const parsed = FamilyDocumentSchema.safeParse(out.document);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues[0])).toBe(true);
    // Nothing else moved: same solid count, same profile geometry, same id.
    expect(out.document.solids).toHaveLength(1);
    expect(out.document.profiles[0]!.entities).toEqual(before.document.profiles[0]!.entities);
  });

  it('is idempotent, and re-binding BACK to the host plane restores +Y exactly', () => {
    const once = makeSetExtrudeWorkPlaneMigrator(V, V, { solidId: SOLID, planeId: WALL_PLANE })
      .apply(withBox([WALL]));
    const twice = makeSetExtrudeWorkPlaneMigrator(V, V, { solidId: SOLID, planeId: WALL_PLANE })
      .apply(once);
    expect(twice.document.solids).toEqual(once.document.solids);

    const back = makeSetExtrudeWorkPlaneMigrator(V, V, { solidId: SOLID, planeId: PLANE }).apply(once);
    expect(solidOf(back.document).direction).toEqual({ x: 0, y: 1, z: 0 });
    expect(back.document.profiles[0]!.planeId).toBe(PLANE);
  });

  it('⛔ REFUSES an unknown solid, an unknown plane, and a missing profile — each by name', () => {
    const f = withBox([WALL]);
    expect(() => makeSetExtrudeWorkPlaneMigrator(V, V, {
      solidId: 'sol_01HZ00000000000000000NOP01', planeId: WALL_PLANE,
    }).apply(f)).toThrow(/sol_01HZ00000000000000000NOP01 is not carried/);

    expect(() => makeSetExtrudeWorkPlaneMigrator(V, V, {
      solidId: SOLID, planeId: 'plane_01HZ00000000000000000NOP01',
    }).apply(f)).toThrow(/plane_01HZ00000000000000000NOP01 is not carried/);

    const orphaned: RawFamily = {
      ...f,
      document: { ...f.document, profiles: [] } as FamilyDocument,
    };
    expect(() => makeSetExtrudeWorkPlaneMigrator(V, V, { solidId: SOLID, planeId: WALL_PLANE })
      .apply(orphaned)).toThrow(/does not carry/);
  });

  it('⛔ REFUSES a zero-length normal rather than defaulting to +Y (spec §75)', () => {
    const nullPlane = {
      id: NULL_PLANE, name: 'Unstated', origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 0 }, isHost: false,
    } as ReferencePlane;
    expect(() => makeSetExtrudeWorkPlaneMigrator(V, V, { solidId: SOLID, planeId: NULL_PLANE })
      .apply(withBox([nullPlane]))).toThrow(/zero-length normal/);
    // The refusal says what it refused to do, not only that it refused.
    expect(() => makeSetExtrudeWorkPlaneMigrator(V, V, { solidId: SOLID, planeId: NULL_PLANE })
      .apply(withBox([nullPlane]))).toThrow(/defaulting to \+Y/);
  });

  it('⛔ REFUSES an OFFSET plane — the bake applies no per-solid transform, and honouring half a plane is the §75 defect', () => {
    const offset = {
      id: OFFSET_PLANE, name: 'Raised', origin: { x: 0, y: 2.5, z: 0 },
      normal: { x: 0, y: 1, z: 0 }, isHost: false,
    } as ReferencePlane;
    expect(() => makeSetExtrudeWorkPlaneMigrator(V, V, { solidId: SOLID, planeId: OFFSET_PLANE })
      .apply(withBox([offset]))).toThrow(/applies NO per-solid transform/);
  });

  it('⛔ REFUSES a non-extrude solid, NAMING its kind', () => {
    const f = withBox([WALL]);
    const doc = {
      ...f.document,
      solids: [{
        id: SOLID, kind: 'revolve', profileId: PROFILE, materialSlotId: null,
        lod: { coarse: false, medium: true, fine: true }, sweepDeg: 360, segments: 24,
      }],
    } as unknown as FamilyDocument;
    expect(() => makeSetExtrudeWorkPlaneMigrator(V, V, { solidId: SOLID, planeId: WALL_PLANE })
      .apply({ ...f, document: doc })).toThrow(/kind 'revolve'/);
  });

  it('a refusal leaves the input document UNTOUCHED (no half-moved solid)', () => {
    const f = withBox([WALL]);
    const snapshot = JSON.stringify(f.document);
    try {
      makeSetExtrudeWorkPlaneMigrator(V, V, { solidId: SOLID, planeId: 'plane_01HZ00000000000000000NOP01' }).apply(f);
    } catch { /* expected */ }
    expect(JSON.stringify(f.document)).toBe(snapshot);
  });
});
