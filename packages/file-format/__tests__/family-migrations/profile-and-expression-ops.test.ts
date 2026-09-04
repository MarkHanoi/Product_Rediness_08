// §UCE-PROFILE-WRITE-BACK + §UCE-FORMULA-IS-EDITABLE — the two ops that close
// lane U3's OWED O-1 and O-2 (lane UCE-FAMILY).
//
// ⛔ IMPORTS THE LEAF MODULES, NOT `../../src/index.js` — the package barrel
//   drags in `pdfjs-dist` (`DOMMatrix` at module scope) and throws under this
//   package's `environment: 'node'` config. Same reason as `box-solid-ops.test.ts`.
//
// What is proven here is the DOCUMENT half: the ops write what they say, every
// refusal names its cause and its escape, and the produced document passes the
// ONE schema. The USER half — that an author drags a vertex in the workspace,
// commits, saves, reloads and sees the moved geometry — is proven where the
// workspace lives, in
// `apps/editor/src/ui/component-editor-workspace/__tests__/profileWriteBackAndFormulaEdit.spec.ts`.

import { describe, it, expect } from 'vitest';
import {
  makeAddBoxSolidMigrator,
  makeDeleteExpressionMigrator,
  makeIntroduceExpressionMigrator,
  makeUpdateProfileMigrator,
} from '../../src/family-migrations/index.js';
import type { RawFamily } from '../../src/family-migrations/index.js';
import { FamilyDocumentSchema } from '../../src/family-schema.js';
import type { FamilyDocument, FamilyManifest, Profile } from '../../src/family-schema.js';

const V = '1.1';
const EMPTY_HASH = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

const PLANE = 'plane_01HZ00000000000000000PNE01';
const P_WIDTH = 'par_01HZ00000000000000000WDT01';
const P_HEIGHT = 'par_01HZ00000000000000000HGT01';
const P_GLASS = 'par_01HZ00000000000000000GWD01';
const SOLID = 'sol_01HZ00000000000000000BXA01';
const PROFILE = 'prof_01HZ00000000000000000BXA01';
const TYPE = 'typ_01HZ00000000000000000DEF01';
const E = [
  '01HZE0000000000000000PT001',
  '01HZE0000000000000000PT002',
  '01HZE0000000000000000PT003',
  '01HZE0000000000000000PT004',
];

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
    referencePlanes: [
      { id: PLANE, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: P_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
      { id: P_HEIGHT, name: 'Height', kind: 'instance', dataType: 'length', defaultValue: 1500, expression: null, ifcMapping: null, exposed: true },
      { id: P_GLASS, name: 'GlassWidth', kind: 'instance', dataType: 'length', defaultValue: 1000, expression: null, ifcMapping: null, exposed: true },
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

function raw(document: FamilyDocument): RawFamily {
  return { manifest: MANIFEST, document, events: [] } as unknown as RawFamily;
}

/**
 * A SKETCHED rectangle — four corner points with NUMERIC `x`/`z`, exactly the
 * spelling `server/familySeeds.js`'s `makeRectProfile` writes for the shipped
 * starter Window. This is the profile shape `update-profile` exists to move.
 *
 * ⭐⭐ IT IS DELIBERATELY *NOT* BUILT BY `add-box-solid`, and that is a finding,
 *     not a convenience. `add-box-solid` writes every corner as an EXPRESSION
 *     STRING (`boxEntities` → `halfExpression`, e.g. `-Width/2`) whether the
 *     dimension was authored as a parameter or as a literal — so no profile that
 *     op produces is write-back admissible, and the arm below proves the op says
 *     so. A parametric box is edited through `set-box-dimensions`; a sketched
 *     profile is edited through this one. Two shapes of geometry, two ops, and
 *     neither silently doing the other's job.
 */
function sketchedRect(): RawFamily {
  const doc = makeDoc() as unknown as { profiles: unknown[]; solids: unknown[] };
  doc.profiles = [{
    id: PROFILE,
    name: 'Box',
    planeId: PLANE,
    entities: [
      { id: E[0], kind: 'point', data: { x: 0, z: 0 } },
      { id: E[1], kind: 'point', data: { x: 1.2, z: 0 } },
      { id: E[2], kind: 'point', data: { x: 1.2, z: 0.6 } },
      { id: E[3], kind: 'point', data: { x: 0, z: 0.6 } },
    ],
    constraints: [],
  }];
  doc.solids = [{
    id: SOLID, kind: 'extrude', profileId: PROFILE, materialSlotId: null,
    lod: { coarse: false, medium: true, fine: true },
    lengthExpression: 'Height', direction: { x: 0, y: 1, z: 0 },
  }];
  return raw(doc as unknown as FamilyDocument);
}

function profileOf(f: RawFamily): Profile {
  const p = (f.document.profiles as readonly Profile[]).find((pr) => pr.id === PROFILE);
  if (!p) throw new Error('fixture lost its profile');
  return p;
}

function pointsOf(f: RawFamily): { id: string; x: number; z: number }[] {
  return profileOf(f).entities.map((e) => ({
    id: e.id,
    x: e.data['x'] as number,
    z: e.data['z'] as number,
  }));
}

describe('§UCE-PROFILE-WRITE-BACK — update-profile moves points and refuses everything else', () => {
  it('⭐ writes the new coordinates, and the document still validates', () => {
    const before = sketchedRect();
    const moved = pointsOf(before).map((p, i) => (i === 0 ? { ...p, x: p.x - 250, z: p.z + 125 } : p));
    const after = makeUpdateProfileMigrator(V, V, { profileId: PROFILE, points: moved }).apply(before);

    expect(pointsOf(after)[0]).toEqual(moved[0]);
    // the other three are untouched
    expect(pointsOf(after).slice(1)).toEqual(pointsOf(before).slice(1));
    expect(FamilyDocumentSchema.safeParse(after.document).success).toBe(true);
  });

  it('is PURE — the input document is not mutated', () => {
    const before = sketchedRect();
    const snapshot = JSON.stringify(before.document);
    const moved = pointsOf(before).map((p) => ({ ...p, x: p.x + 10 }));
    makeUpdateProfileMigrator(V, V, { profileId: PROFILE, points: moved }).apply(before);
    expect(JSON.stringify(before.document)).toBe(snapshot);
  });

  it('preserves every other `data` key by construction (overlay, never replace)', () => {
    const before = sketchedRect();
    const doc = before.document as unknown as { profiles: Profile[] };
    // stamp a key the caller never sees
    doc.profiles[0]!.entities[0]!.data['authoredBy'] = 'fixture';
    const after = makeUpdateProfileMigrator(V, V, {
      profileId: PROFILE,
      points: pointsOf(before).map((p) => ({ ...p, x: p.x + 1 })),
    }).apply(before);
    expect(profileOf(after).entities[0]!.data['authoredBy']).toBe('fixture');
  });

  it('⛔ REFUSES a vertex-count change, naming the orphaned-constraint reason', () => {
    const before = sketchedRect();
    const short = pointsOf(before).slice(0, 3);
    expect(() =>
      makeUpdateProfileMigrator(V, V, { profileId: PROFILE, points: short }).apply(before),
    ).toThrow(/mint or delete entity ids/);
  });

  it('⛔ REFUSES an id the profile does not carry', () => {
    const before = sketchedRect();
    const wrong = pointsOf(before).map((p, i) => (i === 0 ? { ...p, id: '01HZE0000000000000000XXX01' } : p));
    expect(() =>
      makeUpdateProfileMigrator(V, V, { profileId: PROFILE, points: wrong }).apply(before),
    ).toThrow(/which the update does not name/);
  });

  it('⛔ REFUSES a duplicated id rather than letting the last writer win', () => {
    const before = sketchedRect();
    const pts = pointsOf(before);
    const dup = [pts[0]!, pts[0]!, pts[2]!, pts[3]!];
    expect(() =>
      makeUpdateProfileMigrator(V, V, { profileId: PROFILE, points: dup }).apply(before),
    ).toThrow(/listed twice/);
  });

  it.each([
    ['parameter-bound', { kind: 'parameter' as const, parameterId: P_GLASS }],
    ['literal',         { kind: 'literal' as const, value: 1200 }],
  ])('⭐⭐ REFUSES to freeze an expression-valued coordinate into a literal (%s box)', (_l, width) => {
    // ⭐ EVERY profile `add-box-solid` writes is expression-valued — even the
    //   all-literal one, because `halfExpression` spells `1200/2` as a STRING.
    //   That is the mechanism behind the §64 demo (glazing bound to GlassWidth
    //   visibly shrinks), and a dragged literal would end it. Both arms refuse.
    const before = makeAddBoxSolidMigrator(V, V, {
      solidId: SOLID,
      profileId: PROFILE,
      profileName: 'Glass',
      planeId: PLANE,
      entityIds: E,
      width,
      depth: { kind: 'literal', value: 600 },
      height: { kind: 'literal', value: 900 },
    }).apply(raw(makeDoc()));
    const pts = profileOf(before).entities.map((e) => ({ id: e.id, x: 0, z: 0 }));
    expect(() =>
      makeUpdateProfileMigrator(V, V, { profileId: PROFILE, points: pts }).apply(before),
    ).toThrow(/freeze the formula/);
  });

  it('⛔ REFUSES a non-finite coordinate', () => {
    const before = sketchedRect();
    const bad = pointsOf(before).map((p, i) => (i === 1 ? { ...p, z: Number.NaN } : p));
    expect(() =>
      makeUpdateProfileMigrator(V, V, { profileId: PROFILE, points: bad }).apply(before),
    ).toThrow(/non-finite coordinate/);
  });

  it('⛔ REFUSES an unknown profile', () => {
    expect(() =>
      makeUpdateProfileMigrator(V, V, { profileId: 'prof_01HZ00000000000000000NNE01', points: [] })
        .apply(sketchedRect()),
    ).toThrow(/not found/);
  });
});

describe('§UCE-FORMULA-IS-EDITABLE — delete-expression is introduce-expression’s exact inverse', () => {
  const introduce = (f: RawFamily, expr: string): RawFamily =>
    makeIntroduceExpressionMigrator(V, V, { parameterId: P_GLASS, expression: expr }).apply(f);

  it('⭐⭐ introduce → delete restores the parameter byte-for-byte', () => {
    const start = raw(makeDoc());
    const before = JSON.stringify(start.document.parameters);
    const withExpr = introduce(start, 'Width - 2*Height');
    const back = makeDeleteExpressionMigrator(V, V, { parameterId: P_GLASS }).apply(withExpr);
    expect(JSON.stringify(back.document.parameters)).toBe(before);
    expect(FamilyDocumentSchema.safeParse(back.document).success).toBe(true);
  });

  it('⭐⭐ makes a formula EDITABLE — delete then introduce a corrected one', () => {
    const withTypo = introduce(raw(makeDoc()), 'Width - 2*Hieght');
    const cleared = makeDeleteExpressionMigrator(V, V, { parameterId: P_GLASS }).apply(withTypo);
    const fixed = introduce(cleared, 'Width - 2*Height');
    const p = fixed.document.parameters.find((q) => q.id === P_GLASS)!;
    expect(p.expression).toBe('Width - 2*Height');
    // D4 still holds across the edit: the original default is still the recorded provenance
    expect(p.defaultValue).toBeNull();
    expect((p as { supersededDefault?: number | string }).supersededDefault).toBe(1000);
  });

  it('`restoreSupersededDefault: false` DROPS the recorded default instead', () => {
    const withExpr = introduce(raw(makeDoc()), 'Width / 2');
    const back = makeDeleteExpressionMigrator(V, V, {
      parameterId: P_GLASS,
      restoreSupersededDefault: false,
    }).apply(withExpr);
    const p = back.document.parameters.find((q) => q.id === P_GLASS)!;
    expect(p.expression).toBeNull();
    expect(p.defaultValue).toBeNull();
    expect('supersededDefault' in p).toBe(false);
  });

  it('`replacementDefault` wins over the restored one', () => {
    const withExpr = introduce(raw(makeDoc()), 'Width / 2');
    const back = makeDeleteExpressionMigrator(V, V, {
      parameterId: P_GLASS,
      replacementDefault: 42,
    }).apply(withExpr);
    expect(back.document.parameters.find((q) => q.id === P_GLASS)!.defaultValue).toBe(42);
  });

  it('⛔ REFUSES a parameter that carries no expression rather than reporting a no-op as success', () => {
    expect(() =>
      makeDeleteExpressionMigrator(V, V, { parameterId: P_WIDTH }).apply(raw(makeDoc())),
    ).toThrow(/carries no expression/);
  });

  it('⛔ REFUSES an unknown parameter', () => {
    const withExpr = introduce(raw(makeDoc()), 'Width / 2');
    expect(() =>
      makeDeleteExpressionMigrator(V, V, { parameterId: 'par_01HZ00000000000000000NNE01' }).apply(withExpr),
    ).toThrow(/not found/);
  });

  it('is PURE — the input document is not mutated', () => {
    const withExpr = introduce(raw(makeDoc()), 'Width / 2');
    const snapshot = JSON.stringify(withExpr.document);
    makeDeleteExpressionMigrator(V, V, { parameterId: P_GLASS }).apply(withExpr);
    expect(JSON.stringify(withExpr.document)).toBe(snapshot);
  });
});
