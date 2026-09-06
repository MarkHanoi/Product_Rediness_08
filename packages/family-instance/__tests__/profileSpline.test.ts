// §CURVE-SPLINE-SPELLING — the `spline` profile entity, end to end.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ WHERE THE PROPERTY IS READ BACK (audit R14 / C16 CA-21)
// ═══════════════════════════════════════════════════════════════════════════
// The geometry assertions read the **`BufferGeometryDescriptor.position`
// buffer returned by the real `produceExtrude` inside the real, unmodified
// `bakeFamilyInstance`** — the artefact a committer would upload to the GPU —
// not `profileToPolygon`'s return value. The refusal assertions read
// `result.unsupported[].reason` + `.message`, which is what a caller actually
// sees. If the polygon were right and the bake dropped it, these fail.
//
// ⚠ WHAT THIS STILL DOES NOT ESTABLISH: nothing here is rendered, placed or
//   seen. `@pryzm/family-instance` still has zero importers in `apps/editor`
//   and no `component.*` bus verb dispatches a bake, exactly as
//   `profileRegeneration.test.ts` records. This is a CAPABILITY gain.

import { describe, it, expect } from 'vitest';
import type { FamilyDocument, FamilyManifest, Profile, SolidFeature } from '@pryzm/file-format';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';
import { bakeFamilyInstance } from '../src/index.js';

const NOW = '2026-09-06T00:00:00.000Z';
const PLANE = 'plane_01HZ00000000000000000PNE01';
const TYPE_ID = 'typ_01HZ00000000000000000DEF01';
const P_DEPTH = 'par_01HZ00000000000000000DEP01';
const P_WIDTH = 'par_01HZ00000000000000000WID01';

function makeFamily(profiles: Profile[], solids: SolidFeature[]) {
  const document = {
    formatVersion: '1.1',
    referencePlanes: [
      { id: PLANE, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      { id: P_DEPTH, name: 'Depth', kind: 'type', dataType: 'length', defaultValue: 100, expression: null, ifcMapping: null, exposed: true },
      { id: P_WIDTH, name: 'Width', kind: 'type', dataType: 'length', defaultValue: 2000, expression: null, ifcMapping: null, exposed: true },
    ],
    profiles,
    solids,
    materialSlots: [],
    types: [
      { id: TYPE_ID, name: 'Default', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
    ],
    representations: [], connectors: [], propertySets: [], featureEdges: [],
  } as unknown as FamilyDocument;
  const manifest = {
    formatVersion: '1.1', id: 'fam_01HZ00000000000000000FAM01', name: 'SplineTest', semver: '1.0.0',
    author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'Test' },
    description: '', ifcEntity: 'IfcWindow', category: 'Window', tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: NOW, lastModifiedAt: NOW,
  } as unknown as FamilyManifest;
  return { manifest, document, schemaHash: manifest.schemaHash };
}

function extrudeSolid(id: string, profileId: string): SolidFeature {
  return {
    id, kind: 'extrude', profileId, materialSlotId: null,
    lod: { coarse: false, medium: true, fine: true },
    lengthExpression: 'Depth', direction: { x: 0, y: 1, z: 0 },
  } as SolidFeature;
}

async function bake(profile: Profile) {
  return bakeFamilyInstance({
    family: makeFamily([profile], [extrudeSolid('sld_01HZ00000000000000000SL001', profile.id)]),
    typeId: TYPE_ID,
  });
}

function xzExtent(position: Float32Array) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    const x = position[i]!, z = position[i + 2]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

/* ── ids ───────────────────────────────────────────────────────────────── */
const PID = 'prof_01HZ00000000000000000SPL01';
const E = (tag: string) => `01HZE0000000000000000SP${tag}`;

/** A "D"-shaped profile: a straight back edge from (0,0) to (0,1) and a single
 *  cubic Bézier bulging out to +x and back. Four control points; the two ends
 *  are shared with the line, so the loop closes. */
function dProfile(splineData: Record<string, unknown> = {}): Profile {
  return {
    id: PID, name: 'D', planeId: PLANE,
    entities: [
      { id: E('C0'), kind: 'point', data: { x: 0, z: 0 } },
      { id: E('C1'), kind: 'point', data: { x: 1.2, z: 0 } },
      { id: E('C2'), kind: 'point', data: { x: 1.2, z: 1 } },
      { id: E('C3'), kind: 'point', data: { x: 0, z: 1 } },
      {
        id: E('SP'), kind: 'spline',
        data: { degree: 3, count: 4, cp0: E('C0'), cp1: E('C1'), cp2: E('C2'), cp3: E('C3'), ...splineData },
      },
      { id: E('LN'), kind: 'line', data: { p1: E('C3'), p2: E('C0') } },
    ],
    constraints: [],
  } as unknown as Profile;
}

describe('spline profile entity — the refusal is retired by DEFINING the spelling', () => {
  it('bakes a line+spline closed profile through the real produceExtrude', async () => {
    const r = await bake(dProfile());
    expect(r.unsupported).toEqual([]);
    expect(r.baked).toHaveLength(1);
    const ext = xzExtent(r.baked[0]!.descriptor.position);
    // The curve's endpoints are INTERPOLATED, so the extents in z are exactly
    // the authored 0…1. The x bulge is the cubic's own maximum, which for
    // control points (0,·),(1.2,·),(1.2,·),(0,·) is 3/4 · 1.2 = 0.9.
    expect(ext.minZ).toBeCloseTo(0, 6);
    expect(ext.maxZ).toBeCloseTo(1, 6);
    expect(ext.minX).toBeCloseTo(0, 6);
    // ⭐ The bulge is checked against the CURVE'S ANALYTIC MAXIMUM and the
    //    DECLARED chord tolerance, not against a hand-picked digit count.
    //    For control points (0,·),(1.2,·),(1.2,·),(0,·) the cubic's x-maximum
    //    is 3/4 · 1.2 = 0.9 exactly. A chord polyline can only UNDERSHOOT it,
    //    and `segmentsForCubicBezier` promises by at most `COINCIDENT_M`.
    //    Measured undershoot at HEAD: 7.35e-4 m — inside the 1e-3 m bound.
    expect(ext.maxX).toBeLessThanOrEqual(0.9);
    expect(0.9 - ext.maxX).toBeLessThanOrEqual(COINCIDENT_M);
  });

  it('control points are CONSTRUCTION GEOMETRY — the interior handles are not boundary vertices', async () => {
    // cp1/cp2 sit at x = 1.2. If they leaked into the polygon as their own
    // vertices the extent would reach 1.2 rather than the curve's 0.9.
    const r = await bake(dProfile());
    expect(xzExtent(r.baked[0]!.descriptor.position).maxX).toBeLessThan(1.0);
  });

  it('coordinates stay parametric — an expression-valued control point moves the curve', async () => {
    const withExpr = dProfile();
    // Width = 2000 runtime-mm = 2 m; the bulge becomes 3/4 · 2 = 1.5.
    (withExpr.entities[1] as { data: Record<string, unknown> }).data = { x: 'Width', z: 0 };
    (withExpr.entities[2] as { data: Record<string, unknown> }).data = { x: 'Width', z: 1 };
    const r = await bake(withExpr);
    expect(r.unsupported).toEqual([]);
    const maxX = xzExtent(r.baked[0]!.descriptor.position).maxX;
    expect(maxX).toBeLessThanOrEqual(1.5);
    expect(1.5 - maxX).toBeLessThanOrEqual(COINCIDENT_M);
  });

  it('a MULTI-SPAN chain (7 control points) bakes, and its far end is interpolated', async () => {
    const p: Profile = {
      id: PID, name: 'S', planeId: PLANE,
      entities: [
        { id: E('A0'), kind: 'point', data: { x: 0, z: 0 } },
        { id: E('A1'), kind: 'point', data: { x: 0.5, z: 0.6 } },
        { id: E('A2'), kind: 'point', data: { x: 1.5, z: -0.6 } },
        { id: E('A3'), kind: 'point', data: { x: 2, z: 0 } },
        { id: E('A4'), kind: 'point', data: { x: 2.5, z: 0.6 } },
        { id: E('A5'), kind: 'point', data: { x: 3.5, z: 0.6 } },
        { id: E('A6'), kind: 'point', data: { x: 4, z: 0 } },
        { id: E('A7'), kind: 'point', data: { x: 4, z: -2 } },
        { id: E('A8'), kind: 'point', data: { x: 0, z: -2 } },
        {
          id: E('SS'), kind: 'spline',
          data: {
            degree: 3, count: 7,
            cp0: E('A0'), cp1: E('A1'), cp2: E('A2'), cp3: E('A3'),
            cp4: E('A4'), cp5: E('A5'), cp6: E('A6'),
          },
        },
        { id: E('L1'), kind: 'line', data: { p1: E('A6'), p2: E('A7') } },
        { id: E('L2'), kind: 'line', data: { p1: E('A7'), p2: E('A8') } },
        { id: E('L3'), kind: 'line', data: { p1: E('A8'), p2: E('A0') } },
      ],
      constraints: [],
    } as unknown as Profile;
    const r = await bake(p);
    expect(r.unsupported).toEqual([]);
    const ext = xzExtent(r.baked[0]!.descriptor.position);
    expect(ext.maxX).toBeCloseTo(4, 6);
    expect(ext.minZ).toBeCloseTo(-2, 6);
  });
});

describe('spline refusals — each NAMES what the document does not determine', () => {
  it('REFUSES a non-cubic degree, and the bake reason is unsupported-feature', async () => {
    const r = await bake(dProfile({ degree: 5 }));
    expect(r.baked).toEqual([]);
    expect(r.unsupported).toHaveLength(1);
    expect(r.unsupported[0]!.reason).toBe('unsupported-feature');
    expect(r.unsupported[0]!.message).toMatch(/declares degree 5/);
    expect(r.unsupported[0]!.message).toMatch(/only degree 3/);
  });

  it('REFUSES a control-point count that is not 3k+1', async () => {
    const r = await bake(dProfile({ count: 5 }));
    expect(r.unsupported[0]!.message).toMatch(/has count 5/);
    expect(r.unsupported[0]!.message).toMatch(/3k\+1/);
  });

  it('REFUSES an EXPRESSION-valued count — topology may not depend on a parameter', async () => {
    const r = await bake(dProfile({ count: 'Width / 500' }));
    expect(r.unsupported[0]!.message).toMatch(/deliberately not expression-valued/);
  });

  it('REFUSES a dangling control-point reference rather than dropping it', async () => {
    const r = await bake(dProfile({ cp2: '01HZE0000000000000000NOPE0' }));
    expect(r.unsupported[0]!.message).toMatch(/which is not an entity of this profile/);
  });

  it('REFUSES a control point that is not a `point` entity', async () => {
    const r = await bake(dProfile({ cp2: E('LN') }));
    expect(r.unsupported[0]!.message).toMatch(/which is a 'line' and not a 'point'/);
  });

  it('REFUSES a missing control point rather than guessing one', async () => {
    const p = dProfile();
    const sp = p.entities.find((e) => e.kind === 'spline') as { data: Record<string, unknown> };
    delete sp.data['cp2'];
    const r = await bake(p);
    expect(r.unsupported[0]!.message).toMatch(/has no 'cp2' reference/);
  });
});
