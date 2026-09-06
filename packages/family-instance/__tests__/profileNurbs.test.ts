// §CURVE-RATIONAL-NURBS — the WEIGHTED, KNOTTED spline entity, end to end.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ WHERE THE PROPERTY IS READ BACK (audit R14 / C16 CA-21)
// ═══════════════════════════════════════════════════════════════════════════
// Every geometry assertion reads the **`BufferGeometryDescriptor.position`
// buffer returned by the real `produceExtrude` inside the real, unmodified
// `bakeFamilyInstance`** — the artefact a committer would upload to the GPU —
// not `profileToPolygon`'s return value, and not the kernel's sampler. The
// refusal assertions read `result.unsupported[].reason` + `.message`, which is
// what a caller actually sees.
//
// ⭐ THE ASSERTION THAT MATTERS IS THE RADIAL ONE. A profile whose curved edge
//    is the rational quadratic semicircle must bake vertices that lie ON the
//    circle to machine precision — every one of them, not merely close in
//    extent. The same profile with its weights DELETED is measured in the same
//    way in the next test and comes out ~6e-2 wrong, which is the number
//    `profileToPolygon.ts`'s own §4D header records for a polynomial quadratic.
//    That pair is what proves the weights survived persistence, evaluation and
//    the bake rather than being read and dropped.
//
// ⚠ WHAT THIS STILL DOES NOT ESTABLISH: nothing here is rendered, placed or
//   seen. `@pryzm/family-instance` still has zero importers in `apps/editor`
//   and no `component.*` bus verb dispatches a bake — the same standing gap
//   `profileSpline.test.ts` and `profileRegeneration.test.ts` both record.
//   This is a CAPABILITY gain, measured at the bake.

import { describe, it, expect } from 'vitest';
import type { FamilyDocument, FamilyManifest, Profile, SolidFeature } from '@pryzm/file-format';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';
import { bakeFamilyInstance } from '../src/index.js';

const NOW = '2026-09-06T00:00:00.000Z';
const PLANE = 'plane_01HZ00000000000000000PNE01';
const TYPE_ID = 'typ_01HZ00000000000000000DEF01';
const P_DEPTH = 'par_01HZ00000000000000000DEP01';
const P_WIDTH = 'par_01HZ00000000000000000WID01';
const PID = 'prof_01HZ00000000000000000NUR01';
const E = (tag: string) => `01HZE0000000000000000NB${tag}`;

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
    formatVersion: '1.1', id: 'fam_01HZ00000000000000000FAM01', name: 'NurbsTest', semver: '1.0.0',
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

/** Largest |√(x²+z²) − 1| over every vertex of the baked buffer.
 *
 *  ⭐ EVERY vertex of this profile is supposed to be on the unit circle: the
 *     curved edge is the semicircle, and the straight edge that closes it runs
 *     between (1,0) and (−1,0), which are themselves on it. So there is no
 *     vertex this measurement has to be lenient about. */
function maxRadialError(position: Float32Array): number {
  let worst = 0;
  for (let i = 0; i < position.length; i += 3) {
    const e = Math.abs(Math.hypot(position[i]!, position[i + 2]!) - 1);
    if (e > worst) worst = e;
  }
  return worst;
}

/**
 * A half-disc whose curved edge is the EXACT rational-quadratic semicircle of
 * radius 1: control points (1,0) (1,1) (0,1) (−1,1) (−1,0), corner weights
 * √2/2, knots [0,0,0,1,1,2,2,2] — the NURBS book's two-arc construction.
 * `overrides` is spread over the spline's `data` so a single test can corrupt
 * exactly one key.
 */
function halfDisc(overrides: Record<string, unknown> = {}): Profile {
  const w = Math.SQRT1_2;
  return {
    id: PID, name: 'HalfDisc', planeId: PLANE,
    entities: [
      { id: E('P0'), kind: 'point', data: { x: 1, z: 0 } },
      { id: E('P1'), kind: 'point', data: { x: 1, z: 1 } },
      { id: E('P2'), kind: 'point', data: { x: 0, z: 1 } },
      { id: E('P3'), kind: 'point', data: { x: -1, z: 1 } },
      { id: E('P4'), kind: 'point', data: { x: -1, z: 0 } },
      {
        id: E('SP'), kind: 'spline',
        data: {
          degree: 2, count: 5, knotCount: 8,
          cp0: E('P0'), cp1: E('P1'), cp2: E('P2'), cp3: E('P3'), cp4: E('P4'),
          knot0: 0, knot1: 0, knot2: 0, knot3: 1, knot4: 1, knot5: 2, knot6: 2, knot7: 2,
          w0: 1, w1: w, w2: 1, w3: w, w4: 1,
          ...overrides,
        },
      },
      { id: E('LN'), kind: 'line', data: { p1: E('P4'), p2: E('P0') } },
    ],
    constraints: [],
  } as unknown as Profile;
}

describe('§CURVE-RATIONAL-NURBS — the rational curve reaches the bake', () => {
  it('bakes an EXACT semicircle: every baked vertex is on the circle to float32 precision', async () => {
    const r = await bake(halfDisc());
    expect(r.unsupported).toEqual([]);
    expect(r.baked).toHaveLength(1);
    // Not "close in extent" — ON the circle. Sampling evaluates the curve, so
    // the chord tolerance decides HOW MANY vertices, never whether they lie on
    // it.
    //
    // ⚠ MEASURED 3.15804347117421e-8, and the bound below is 1e-6 rather than
    //   the 1e-15 the maths gives, FOR A NAMED REASON: `descriptor.position`
    //   is a **Float32Array**, whose relative precision at magnitude 1 is
    //   ~1.2e-7. 3.16e-8 IS float32 rounding — the residual of the buffer, not
    //   of the curve. `packages/geometry-kernel/__tests__/nurbsCurve.test.ts`
    //   measures the same circle in float64 at < 1e-12 (actual ~1e-16). Quoting
    //   1e-15 here would be quoting a number this artefact cannot carry.
    expect(maxRadialError(r.baked[0]!.descriptor.position)).toBeLessThan(1e-6);
    const ext = xzExtent(r.baked[0]!.descriptor.position);
    expect(ext.minX).toBeCloseTo(-1, 6);
    expect(ext.maxX).toBeCloseTo(1, 6);
    expect(ext.minZ).toBeCloseTo(0, 6);
    expect(ext.maxZ).toBeCloseTo(1, 6);
  });

  it('THE SAME curve with its weights deleted bakes a visibly different solid', async () => {
    // `w*` is optional and ALL-OR-NONE: dropping all five is a legal
    // non-rational curve, and it is NOT a circle. The delta is the whole
    // capability, measured on the baked buffer.
    const p = halfDisc();
    const sp = p.entities.find((e) => e.kind === 'spline') as { data: Record<string, unknown> };
    for (const k of ['w0', 'w1', 'w2', 'w3', 'w4']) delete sp.data[k];
    const r = await bake(p);
    expect(r.unsupported).toEqual([]);
    const err = maxRadialError(r.baked[0]!.descriptor.position);
    // 3/(2√2) − 1 = 0.0606601717…, the polynomial quadratic's exact bulge
    // deficit and the same number §4D-CLOSED-FORM-PROFILE records.
    expect(err).toBeGreaterThan(0.06);
    expect(err).toBeCloseTo(3 / (2 * Math.SQRT2) - 1, 3);
    // The RELATIVE claim, which needs no absolute threshold at all: the
    // weighted bake is more than a millionfold closer to the circle than the
    // unweighted one, on the same control points and the same buffer type.
    const weighted = maxRadialError((await bake(halfDisc())).baked[0]!.descriptor.position);
    expect(err / weighted).toBeGreaterThan(1e6);
  });

  it('a degree-5 curve bakes — the "degree 3 only" refusal is genuinely retired', async () => {
    // 6 control points, degree 5, clamped: knots = six 0s then six 1s.
    const p: Profile = {
      id: PID, name: 'Quintic', planeId: PLANE,
      entities: [
        { id: E('Q0'), kind: 'point', data: { x: 0, z: 0 } },
        { id: E('Q1'), kind: 'point', data: { x: 0.4, z: 1 } },
        { id: E('Q2'), kind: 'point', data: { x: 1.2, z: 1.4 } },
        { id: E('Q3'), kind: 'point', data: { x: 2.0, z: 1.4 } },
        { id: E('Q4'), kind: 'point', data: { x: 2.6, z: 1 } },
        { id: E('Q5'), kind: 'point', data: { x: 3, z: 0 } },
        {
          id: E('QS'), kind: 'spline',
          data: {
            degree: 5, count: 6, knotCount: 12,
            cp0: E('Q0'), cp1: E('Q1'), cp2: E('Q2'), cp3: E('Q3'), cp4: E('Q4'), cp5: E('Q5'),
            knot0: 0, knot1: 0, knot2: 0, knot3: 0, knot4: 0, knot5: 0,
            knot6: 1, knot7: 1, knot8: 1, knot9: 1, knot10: 1, knot11: 1,
          },
        },
        { id: E('QL'), kind: 'line', data: { p1: E('Q5'), p2: E('Q0') } },
      ],
      constraints: [],
    } as unknown as Profile;
    const r = await bake(p);
    expect(r.unsupported).toEqual([]);
    const ext = xzExtent(r.baked[0]!.descriptor.position);
    // Endpoints are interpolated (clamped knots); the interior handles are
    // CONSTRUCTION GEOMETRY, so the peak stays under the control polygon's 1.4.
    expect(ext.minX).toBeCloseTo(0, 6);
    expect(ext.maxX).toBeCloseTo(3, 6);
    expect(ext.maxZ).toBeGreaterThan(0.5);
    expect(ext.maxZ).toBeLessThan(1.4);
  });

  it('control points stay parametric — an expression-valued cp moves the NURBS', async () => {
    const p = halfDisc();
    // Width = 2000 runtime-mm = 2 m: the apex control point rises to z = 2, and
    // the curve is then an ellipse-ish rational quadratic, no longer radius 1.
    (p.entities[2] as { data: Record<string, unknown> }).data = { x: 0, z: 'Width' };
    const r = await bake(p);
    expect(r.unsupported).toEqual([]);
    expect(xzExtent(r.baked[0]!.descriptor.position).maxZ).toBeGreaterThan(1.2);
  });

  it('regenerating the same document twice is byte-identical', async () => {
    const a = await bake(halfDisc());
    const b = await bake(halfDisc());
    expect(Array.from(a.baked[0]!.descriptor.position))
      .toEqual(Array.from(b.baked[0]!.descriptor.position));
  });

  it('the chord tolerance is the kernel\'s, so the semicircle is not over-tessellated', async () => {
    const r = await bake(halfDisc());
    const verts = r.baked[0]!.descriptor.position.length / 3;
    // A sanity band, not a snapshot: a 180° arc at COINCIDENT_M = 1e-3 m and
    // R = 1 m needs tens of chords, not thousands. If this ever reads in the
    // thousands the adaptive sampler has stopped converging.
    expect(verts).toBeGreaterThan(12);
    expect(verts).toBeLessThan(4000);
    expect(COINCIDENT_M).toBe(0.001);
  });
});

describe('§CURVE-RATIONAL-NURBS — every refusal names what the document does not determine', () => {
  it('REFUSES a knotCount that is not count + degree + 1', async () => {
    const r = await bake(halfDisc({ knotCount: 7 }));
    expect(r.baked).toEqual([]);
    expect(r.unsupported[0]!.reason).toBe('unsupported-feature');
    expect(r.unsupported[0]!.message).toMatch(/needs exactly 8 knots/);
  });

  it('REFUSES decreasing knots', async () => {
    const r = await bake(halfDisc({ knot4: 0.5 }));
    expect(r.unsupported[0]!.message).toMatch(/non-decreasing/);
  });

  it('REFUSES an EXPRESSION-valued knot — parameterisation may not depend on a parameter', async () => {
    const r = await bake(halfDisc({ knot3: 'Width / 2000' }));
    expect(r.unsupported[0]!.message).toMatch(/knot3 = "Width \/ 2000"/);
    expect(r.unsupported[0]!.message).toMatch(/not expression-valued/);
  });

  it('REFUSES a zero weight — a pole inside the curve\'s own domain', async () => {
    const r = await bake(halfDisc({ w1: 0 }));
    expect(r.unsupported[0]!.message).toMatch(/w1 = 0/);
    expect(r.unsupported[0]!.message).toMatch(/pole inside/);
  });

  it('REFUSES a PARTIAL weight set rather than defaulting the missing half', async () => {
    const p = halfDisc();
    const sp = p.entities.find((e) => e.kind === 'spline') as { data: Record<string, unknown> };
    delete sp.data['w3'];
    const r = await bake(p);
    expect(r.unsupported[0]!.message).toMatch(/carries 4 of 5 weights/);
    expect(r.unsupported[0]!.message).toMatch(/ALL-OR-NONE/);
  });

  it('REFUSES an out-of-range degree with the range named', async () => {
    const r = await bake(halfDisc({ degree: 12, knotCount: 18 }));
    expect(r.unsupported[0]!.message).toMatch(/literal integer degree in \[1, 11\]/);
  });

  it('REFUSES fewer control points than degree + 1', async () => {
    const r = await bake(halfDisc({ degree: 6, count: 5, knotCount: 12 }));
    expect(r.unsupported[0]!.message).toMatch(/needs a literal integer control-point count ≥ 7/);
  });

  it('REFUSES an interior knot whose multiplicity exceeds the degree', async () => {
    // Degree 2 over SIX control points ⇒ 9 knots, interior indices 3…5.
    // [0,0,0, 1,1,1, 2,2,2] puts multiplicity 3 > degree 2 on an interior knot,
    // which is two disconnected pieces rather than one curve.
    const p: Profile = {
      id: PID, name: 'Split', planeId: PLANE,
      entities: [
        { id: E('S0'), kind: 'point', data: { x: 0, z: 0 } },
        { id: E('S1'), kind: 'point', data: { x: 1, z: 1 } },
        { id: E('S2'), kind: 'point', data: { x: 2, z: 1 } },
        { id: E('S3'), kind: 'point', data: { x: 3, z: 1 } },
        { id: E('S4'), kind: 'point', data: { x: 4, z: 1 } },
        { id: E('S5'), kind: 'point', data: { x: 5, z: 0 } },
        {
          id: E('SS'), kind: 'spline',
          data: {
            degree: 2, count: 6, knotCount: 9,
            cp0: E('S0'), cp1: E('S1'), cp2: E('S2'),
            cp3: E('S3'), cp4: E('S4'), cp5: E('S5'),
            knot0: 0, knot1: 0, knot2: 0, knot3: 1, knot4: 1,
            knot5: 1, knot6: 2, knot7: 2, knot8: 2,
          },
        },
        { id: E('SL'), kind: 'line', data: { p1: E('S5'), p2: E('S0') } },
      ],
      constraints: [],
    } as unknown as Profile;
    const r = await bake(p);
    expect(r.baked).toEqual([]);
    expect(r.unsupported[0]!.message).toMatch(/multiplicity 3 > degree 2/);
  });

  it('ACCEPTS a short-domain (unclamped-tail) knot vector — the check is well-formedness, not clamping', async () => {
    // ⭐ RECORDED BECAUSE IT CAUGHT A WRONG TEST, NOT A WRONG IMPLEMENTATION.
    //    [0,0,0,1,1,1,2,2] over 5 degree-2 control points was written here as a
    //    multiplicity violation. It is not: for n = 4, p = 2 the INTERIOR knots
    //    are indices 3…4 only, so the run of three 1s is an interior pair plus
    //    the domain's own end knot. The domain is [U[2], U[5]] = [0, 1] — a
    //    legitimate curve that simply does not reach its last two control
    //    points. The validator accepts it, and that is correct.
    const r = await bake(halfDisc({ knot5: 1 }));
    expect(r.unsupported).toEqual([]);
    expect(r.baked).toHaveLength(1);
  });

  it('REFUSES a dangling control-point reference rather than dropping it', async () => {
    const r = await bake(halfDisc({ cp2: '01HZE0000000000000000NOPE0' }));
    expect(r.unsupported[0]!.message).toMatch(/which is not an entity of this profile/);
  });
});
