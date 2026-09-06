// §PROFILE-RING-IS-AUTHORABLE — `set-profile-ring`, the op that lets a component
// author DRAW a profile instead of nudging the corners of a seeded rectangle
// (lane CE-MAKE-IT-REACHABLE · L-12976).
//
// ⛔ IMPORTS THE LEAF MODULES, NOT `../../src/index.js` — the package barrel drags
//   in `pdfjs-dist` (`DOMMatrix` at module scope) and throws under this package's
//   `environment: 'node'` config. Same reason as `profile-and-expression-ops.test.ts`.
//
// What is proven here is the DOCUMENT half: a five-sided ring replaces a
// four-sided one, ids that survive keep every other `data` key, ids that appear
// are minted as bare points, and every refusal names its cause and its escape.
// The USER half — draw in the workspace, commit, save, reload, see the new shape
// — is proven in
// `apps/editor/src/ui/component-editor-workspace/__tests__/profileRingAuthoring.spec.ts`.

import { describe, it, expect } from 'vitest';
import { makeSetProfileRingMigrator } from '../../src/family-migrations/index.js';
import type { RawFamily } from '../../src/family-migrations/index.js';
import { FamilyDocumentSchema } from '../../src/family-schema.js';
import type { FamilyDocument, FamilyManifest, Profile } from '../../src/family-schema.js';

const V = '1.1';
const EMPTY_HASH = 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

const PLANE = 'plane_01HZ00000000000000000PNE01';
const PROFILE = 'prof_01HZ00000000000000000BXA01';
const TYPE = 'typ_01HZ00000000000000000DEF01';
const SOLID = 'sol_01HZ00000000000000000BXA01';

/** Four existing corner ids + one freshly "minted" id, all real ULID shapes. */
const E = [
  '01HZE0000000000000000PT001',
  '01HZE0000000000000000PT002',
  '01HZE0000000000000000PT003',
  '01HZE0000000000000000PT004',
];
const MINTED = '01HZE0000000000000000PT005';
const CONSTRAINT = '01HZC0000000000000000CN001';

const MANIFEST = {
  formatVersion: V,
  familyId: 'fam_01HZ00000000000000000FAM01',
  name: 'Test Component',
  category: 'generic',
  schemaHash: EMPTY_HASH,
} as unknown as FamilyManifest;

/**
 * A SKETCHED rectangle whose first corner carries an EXTRA `data` key. The extra
 * key is the falsification seam for "overlay, never replace": if the op rebuilt
 * the entity from the caller's `{id,x,z}` triple, `construction` would vanish.
 */
function sketchedRect(
  opts: { readonly constraints?: readonly unknown[] } = {},
): RawFamily {
  const document = {
    formatVersion: V,
    referencePlanes: [
      { id: PLANE, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [],
    profiles: [{
      id: PROFILE,
      name: 'Body',
      planeId: PLANE,
      entities: [
        { id: E[0], kind: 'point', data: { x: 0, z: 0, construction: false } },
        { id: E[1], kind: 'point', data: { x: 1200, z: 0 } },
        { id: E[2], kind: 'point', data: { x: 1200, z: 600 } },
        { id: E[3], kind: 'point', data: { x: 0, z: 600 } },
      ],
      constraints: opts.constraints ?? [],
    }],
    solids: [{
      id: SOLID, kind: 'extrude', profileId: PROFILE, materialSlotId: null,
      lod: { coarse: false, medium: true, fine: true },
      lengthExpression: '600', direction: { x: 0, y: 1, z: 0 },
    }],
    materialSlots: [],
    types: [{ id: TYPE, name: 'Standard', values: {}, checksum: EMPTY_HASH }],
    representations: [],
    connectors: [],
    propertySets: [],
    featureEdges: [],
  } as unknown as FamilyDocument;
  return { manifest: MANIFEST, document, events: [] } as unknown as RawFamily;
}

function profileOf(f: RawFamily): Profile {
  const p = (f.document.profiles as readonly Profile[]).find((pr) => pr.id === PROFILE);
  if (!p) throw new Error('fixture lost its profile');
  return p;
}

const RECT = [
  { id: E[0]!, x: 0, z: 0 },
  { id: E[1]!, x: 1200, z: 0 },
  { id: E[2]!, x: 1200, z: 600 },
  { id: E[3]!, x: 0, z: 600 },
];

describe('§PROFILE-RING-IS-AUTHORABLE — a vertex can be INSERTED and DELETED, not only moved', () => {
  it('⭐ THE HEADLINE: a four-point rectangle becomes a five-point L, and the document still validates', () => {
    const before = sketchedRect();
    // An L: the top-right corner is pushed in and a fifth vertex added.
    const drawn = [
      { id: E[0]!, x: 0, z: 0 },
      { id: E[1]!, x: 1200, z: 0 },
      { id: E[2]!, x: 1200, z: 300 },
      { id: MINTED, x: 600, z: 300 },
      { id: E[3]!, x: 0, z: 600 },
    ];
    const after = makeSetProfileRingMigrator(V, V, { profileId: PROFILE, points: drawn }).apply(before);
    const prof = profileOf(after);

    expect(prof.entities).toHaveLength(5);
    // ⭐ RING ORDER IS ARRAY ORDER — `profileToPolygon` iterates `entities` in
    //    order, so a sorted write would silently re-wind the polygon.
    expect(prof.entities.map((e) => e.id)).toEqual([E[0], E[1], E[2], MINTED, E[3]]);
    expect(prof.entities.map((e) => [e.data['x'], e.data['z']])).toEqual([
      [0, 0], [1200, 0], [1200, 300], [600, 300], [0, 600],
    ]);
    // The minted vertex is a bare point — nothing invented beyond its coordinates.
    expect(prof.entities[3]).toEqual({ id: MINTED, kind: 'point', data: { x: 600, z: 300 } });
    expect(FamilyDocumentSchema.safeParse(after.document).success).toBe(true);
  });

  it('⭐ a RETAINED entity is OVERLAID: every other `data` key survives a redraw', () => {
    const before = sketchedRect();
    const after = makeSetProfileRingMigrator(V, V, {
      profileId: PROFILE,
      points: [...RECT, { id: MINTED, x: 600, z: 900 }],
    }).apply(before);
    expect(profileOf(after).entities[0]!.data).toEqual({ x: 0, z: 0, construction: false });
  });

  it('deletes vertices the drawn ring no longer names', () => {
    const before = sketchedRect();
    const after = makeSetProfileRingMigrator(V, V, {
      profileId: PROFILE,
      points: [RECT[0]!, RECT[1]!, RECT[2]!],
    }).apply(before);
    expect(profileOf(after).entities.map((e) => e.id)).toEqual([E[0], E[1], E[2]]);
    expect(FamilyDocumentSchema.safeParse(after.document).success).toBe(true);
  });

  it('a pure MOVE (identical id set) is admitted and leaves the ids alone', () => {
    const before = sketchedRect();
    const after = makeSetProfileRingMigrator(V, V, {
      profileId: PROFILE,
      points: RECT.map((p, i) => (i === 0 ? { ...p, x: -50, z: -50 } : p)),
    }).apply(before);
    expect(profileOf(after).entities.map((e) => e.id)).toEqual(E);
    expect(profileOf(after).entities[0]!.data['x']).toBe(-50);
  });

  it('does not mutate its input (the migrator contract)', () => {
    const before = sketchedRect();
    makeSetProfileRingMigrator(V, V, {
      profileId: PROFILE,
      points: [...RECT, { id: MINTED, x: 600, z: 900 }],
    }).apply(before);
    expect(profileOf(before).entities).toHaveLength(4);
  });
});

describe('§PROFILE-RING-IS-AUTHORABLE — every refusal names its cause and its escape', () => {
  const ring = (points: readonly { id: string; x: number; z: number }[]) =>
    makeSetProfileRingMigrator(V, V, { profileId: PROFILE, points });

  it('refuses an unknown profile', () => {
    expect(() => makeSetProfileRingMigrator(V, V, {
      profileId: 'prof_01HZ0000000000000000NONE1', points: RECT,
    }).apply(sketchedRect())).toThrow(/not found/);
  });

  it('refuses fewer than three points, naming the floor', () => {
    expect(() => ring([RECT[0]!, RECT[1]!]).apply(sketchedRect()))
      .toThrow(/needs at least 3 to bound an area/);
  });

  it('refuses an id that is not a ULID — id minting stays the caller’s ONE factory', () => {
    expect(() => ring([...RECT, { id: 'not-a-ulid', x: 1, z: 1 }]).apply(sketchedRect()))
      .toThrow(/Crockford-base32 ULID/);
  });

  it('refuses a duplicated id rather than letting the last writer win', () => {
    expect(() => ring([...RECT, { id: E[0]!, x: 5, z: 5 }]).apply(sketchedRect()))
      .toThrow(/listed twice/);
  });

  it('refuses a non-finite coordinate', () => {
    expect(() => ring([...RECT, { id: MINTED, x: Number.NaN, z: 1 }]).apply(sketchedRect()))
      .toThrow(/non-finite coordinate/);
  });

  it('⛔ refuses a profile carrying a curve — a flattened ring would replace authored curvature', () => {
    const before = sketchedRect();
    (profileOf(before).entities as unknown as { kind: string }[])[2]!.kind = 'arc';
    expect(() => ring([...RECT, { id: MINTED, x: 600, z: 900 }]).apply(before))
      .toThrow(/is a 'arc'.*own tessellation/s);
  });

  it('⛔ refuses to freeze an expression-valued coordinate into the literal it produced', () => {
    const before = sketchedRect();
    (profileOf(before).entities as unknown as { data: Record<string, unknown> }[])[1]!.data['x'] =
      '(Width) / 2';
    expect(() => ring([...RECT, { id: MINTED, x: 600, z: 900 }]).apply(before))
      .toThrow(/expression-valued coordinate/);
  });

  it('⛔ C111 §1.3-b — refuses an id-set change on a profile carrying constraints (FAIL CLOSED)', () => {
    const before = sketchedRect({
      constraints: [{ id: CONSTRAINT, kind: 'coincident', entityIds: [E[0]!, E[1]!], parameterRef: null, value: null }],
    });
    expect(() => ring([...RECT, { id: MINTED, x: 600, z: 900 }]).apply(before))
      .toThrow(/carries 1 constraint\(s\).*fails closed/s);
  });

  it('⭐ but a pure MOVE on a constrained profile is STILL admitted — the anchors do not move', () => {
    const before = sketchedRect({
      constraints: [{ id: CONSTRAINT, kind: 'coincident', entityIds: [E[0]!, E[1]!], parameterRef: null, value: null }],
    });
    const after = ring(RECT.map((p, i) => (i === 2 ? { ...p, x: 900 } : p))).apply(before);
    expect(profileOf(after).entities[2]!.data['x']).toBe(900);
    expect(profileOf(after).constraints).toHaveLength(1);
  });

  it('⛔ C111 §1.3 — refuses a minted id that collides with a constraint id in the shared ULID space', () => {
    const before = sketchedRect({
      constraints: [{ id: CONSTRAINT, kind: 'coincident', entityIds: [E[0]!, E[1]!], parameterRef: null, value: null }],
    });
    // The id set is otherwise unchanged in COUNT terms, but E[3] is swapped for
    // a "minted" id that happens to be the constraint's own id.
    (profileOf(before).constraints as unknown as { entityIds: string[] }[])[0]!.entityIds = [];
    expect(() => makeSetProfileRingMigrator(V, V, {
      profileId: PROFILE,
      points: [RECT[0]!, RECT[1]!, RECT[2]!, { id: CONSTRAINT, x: 0, z: 600 }],
    }).apply(before)).toThrow(/already a constraint id|fails closed/);
  });
});
