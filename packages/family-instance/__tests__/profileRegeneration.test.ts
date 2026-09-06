// LANE 4D ACCEPTANCE — spec §67 (partial): **rectangular, arched, polygon and
// rhomboid profiles REGENERATE FROM PARAMETERS.**
//
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ WHERE THE PROPERTY IS READ BACK (audit R14 / C16 CA-21, applied)
// ═══════════════════════════════════════════════════════════════════════════
// Every assertion below reads the **`BufferGeometryDescriptor.position` buffer
// returned by the real `produceExtrude` inside the real, unmodified
// `bakeFamilyInstance`** — the artefact a committer would upload to the GPU.
//
// ⛔ It NEVER asserts on `profileToPolygon`'s return value. That function is
//    the thing under test; reading the property back out of the function that
//    computed it is the exact defect R14 names ("trusting a test's name") and
//    CA-21 forbids ("never the DTO the handler wrote, never `success: true`").
//    If the polygon were right and the bake dropped it, every test here fails.
//
// ⚠ WHAT THIS STILL DOES NOT ESTABLISH, stated so a blank is not read as
//   "fine": **nothing here is rendered, placed, or seen.** The four-axis
//   reachability of this capability at HEAD is import ✅ / bus verb ⛔ (no
//   `component.*` verb dispatches a bake — lane 4C) / build graph ⚠
//   (`@pryzm/family-instance` has zero importers in `apps/editor`, and its
//   `package.json` declares `test` but not `test:ci`, so THIS SUITE DOES NOT
//   RUN IN CI) / call ⚠ (one production caller,
//   `apps/bake-worker/.../RebakeFamilyInstanceJob.ts`, itself unfed).
//   This is a CAPABILITY gain, not yet a user-visible one.

import { describe, it, expect } from 'vitest';
import type { FamilyDocument, FamilyManifest, Profile, SolidFeature } from '@pryzm/file-format';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';
import {
  bakeFamilyInstance,
  kernelGeometryAdapter,
  segmentsForSweep,
  type GeometryAdapter,
} from '../src/index.js';

const NOW = '2026-04-28T12:00:00.000Z';
const PLANE = 'plane_01HZ00000000000000000PNE01';
const TYPE_ID = 'typ_01HZ00000000000000000DEF01';

/* ── parameter ids ─────────────────────────────────────────────────────── */
const P_WIDTH = 'par_01HZ00000000000000000WID01';
const P_HEIGHT = 'par_01HZ00000000000000000HGT01';
const P_SKEW = 'par_01HZ00000000000000000SKW01';
const P_RADIUS = 'par_01HZ00000000000000000RAD01';
const P_DEPTH = 'par_01HZ00000000000000000DEP01';

/** ⭐ Lengths are authored in the `@pryzm/family-runtime` canonical unit,
 *  which is MILLIMETRES today (ADR-0376 D3 rules metres and lane 4A recorded
 *  the migration as OWED). 1200 here is 1.2 m in the descriptor — the
 *  `§4D-ONE-LENGTH-SEAM` conversion, asserted rather than assumed. */
function params() {
  return [
    { id: P_WIDTH, name: 'Width', kind: 'type', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
    { id: P_HEIGHT, name: 'Height', kind: 'type', dataType: 'length', defaultValue: 1500, expression: null, ifcMapping: null, exposed: true },
    { id: P_SKEW, name: 'Skew', kind: 'type', dataType: 'length', defaultValue: 300, expression: null, ifcMapping: null, exposed: true },
    { id: P_RADIUS, name: 'R', kind: 'type', dataType: 'length', defaultValue: 500, expression: null, ifcMapping: null, exposed: true },
    { id: P_DEPTH, name: 'Depth', kind: 'type', dataType: 'length', defaultValue: 100, expression: null, ifcMapping: null, exposed: true },
  ];
}

function makeFamily(profiles: Profile[], solids: SolidFeature[]) {
  const document = {
    formatVersion: '1.1',
    referencePlanes: [
      { id: PLANE, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: params(),
    profiles,
    solids,
    materialSlots: [],
    types: [
      { id: TYPE_ID, name: 'Default', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
    ],
    representations: [],
    connectors: [],
    propertySets: [],
    featureEdges: [],
  } as unknown as FamilyDocument;
  const manifest = {
    formatVersion: '1.1', id: 'fam_01HZ00000000000000000FAM01', name: 'TestWindow', semver: '1.0.0',
    author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'Test' },
    description: '', ifcEntity: 'IfcWindow', category: 'Window', tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: NOW, lastModifiedAt: NOW,
  } as unknown as FamilyManifest;
  return { manifest, document, schemaHash: manifest.schemaHash };
}

function extrudeSolid(id: string, profileId: string, lengthExpression = 'Depth'): SolidFeature {
  return {
    id, kind: 'extrude', profileId, materialSlotId: null,
    lod: { coarse: false, medium: true, fine: true },
    lengthExpression,
    direction: { x: 0, y: 1, z: 0 },
  } as SolidFeature;
}

/** The read-back layer: the extents of the descriptor's OWN position buffer. */
function xzExtent(position: Float32Array) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    const x = position[i]!, z = position[i + 2]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ };
}

async function bakeOne(
  profiles: Profile[],
  solids: SolidFeature[],
  overrides?: Record<string, number | string | boolean>,
  adapter?: GeometryAdapter,
) {
  return bakeFamilyInstance({
    family: makeFamily(profiles, solids),
    typeId: TYPE_ID,
    instanceOverrides: overrides,
    adapter,
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   THE FOUR PROFILES
   ══════════════════════════════════════════════════════════════════════════ */

/** 1 · RECTANGULAR — four points whose coordinates are EXPRESSIONS. */
function rectangularProfile(): Profile {
  return {
    id: 'prof_01HZ00000000000000000RCT01', name: 'Rect', planeId: PLANE,
    entities: [
      { id: '01HZE0000000000000000RC001', kind: 'point', data: { x: '0', z: '0' } },
      { id: '01HZE0000000000000000RC002', kind: 'point', data: { x: 'Width', z: '0' } },
      { id: '01HZE0000000000000000RC003', kind: 'point', data: { x: 'Width', z: 'Height' } },
      { id: '01HZE0000000000000000RC004', kind: 'point', data: { x: '0', z: 'Height' } },
    ],
    constraints: [],
  } as unknown as Profile;
}

/**
 * 2 · ARCHED — spec §64's *"arched top"*: two jambs, a sill, and a SEMICIRCULAR
 * head of radius `Width / 2` centred on the springing line at `Height`.
 *
 * ⭐ The four corner points are all REFERENCED by the lines, so
 *    `§4D-CONSTRUCTION-BY-REFERENCE` makes them construction geometry: the
 *    boundary is produced by the edges, and the arc centre `M` never appears
 *    as a vertex.
 */
function archedProfile(): Profile {
  return {
    id: 'prof_01HZ00000000000000000ARC01', name: 'Arched', planeId: PLANE,
    entities: [
      { id: '01HZE0000000000000000AR0A0', kind: 'point', data: { x: '0', z: '0' } },
      { id: '01HZE0000000000000000AR0B0', kind: 'point', data: { x: 'Width', z: '0' } },
      { id: '01HZE0000000000000000AR0C0', kind: 'point', data: { x: 'Width', z: 'Height' } },
      { id: '01HZE0000000000000000AR0D0', kind: 'point', data: { x: '0', z: 'Height' } },
      { id: '01HZE0000000000000000AR0M0', kind: 'point', data: { x: 'Width / 2', z: 'Height' } },
      { id: '01HZE0000000000000000AR0L1', kind: 'line', data: { p1: '01HZE0000000000000000AR0A0', p2: '01HZE0000000000000000AR0B0' } },
      { id: '01HZE0000000000000000AR0L2', kind: 'line', data: { p1: '01HZE0000000000000000AR0B0', p2: '01HZE0000000000000000AR0C0' } },
      {
        id: '01HZE0000000000000000AR0H0', kind: 'arc',
        data: { center: '01HZE0000000000000000AR0M0', radius: 'Width / 2', startAngle: 0, endAngle: Math.PI },
      },
      { id: '01HZE0000000000000000AR0L3', kind: 'line', data: { p1: '01HZE0000000000000000AR0D0', p2: '01HZE0000000000000000AR0A0' } },
    ],
    constraints: [],
  } as unknown as Profile;
}

/** 3 · POLYGON — a regular hexagon of circumradius `R`, authored as six points
 *  joined by six lines (so both the line arm and construction-by-reference are
 *  exercised on a many-sided outline). */
function hexagonProfile(): Profile {
  const COS60 = 0.5;
  const SIN60 = 0.8660254037844386;
  const pts = [
    { x: 'R', z: '0' },
    { x: `R * ${COS60}`, z: `R * ${SIN60}` },
    { x: `0 - R * ${COS60}`, z: `R * ${SIN60}` },
    { x: '0 - R', z: '0' },
    { x: `0 - R * ${COS60}`, z: `0 - R * ${SIN60}` },
    { x: `R * ${COS60}`, z: `0 - R * ${SIN60}` },
  ];
  const ids = pts.map((_, i) => `01HZE0000000000000000HX0P${i}`);
  return {
    id: 'prof_01HZ00000000000000000HEX01', name: 'Hexagon', planeId: PLANE,
    entities: [
      ...pts.map((data, i) => ({ id: ids[i]!, kind: 'point', data })),
      ...ids.map((id, i) => ({
        id: `01HZE0000000000000000HX0L${i}`,
        kind: 'line',
        data: { p1: id, p2: ids[(i + 1) % ids.length]! },
      })),
    ],
    constraints: [],
  } as unknown as Profile;
}

/** 4 · RHOMBOID — a parallelogram whose lean is the `Skew` parameter. */
function rhomboidProfile(): Profile {
  return {
    id: 'prof_01HZ00000000000000000RHM01', name: 'Rhomboid', planeId: PLANE,
    entities: [
      { id: '01HZE0000000000000000RH001', kind: 'point', data: { x: '0', z: '0' } },
      { id: '01HZE0000000000000000RH002', kind: 'point', data: { x: 'Width', z: '0' } },
      { id: '01HZE0000000000000000RH003', kind: 'point', data: { x: 'Width + Skew', z: 'Height' } },
      { id: '01HZE0000000000000000RH004', kind: 'point', data: { x: 'Skew', z: 'Height' } },
    ],
    constraints: [],
  } as unknown as Profile;
}

/** 5 · CIRCLE — a circular column section: one centre point + one circle. */
function circleProfile(): Profile {
  return {
    id: 'prof_01HZ00000000000000000CIR01', name: 'Circle', planeId: PLANE,
    entities: [
      { id: '01HZE0000000000000000CI0M0', kind: 'point', data: { x: '0', z: '0' } },
      { id: '01HZE0000000000000000CI0C0', kind: 'circle', data: { center: '01HZE0000000000000000CI0M0', radius: 'R' } },
    ],
    constraints: [],
  } as unknown as Profile;
}

/* ══════════════════════════════════════════════════════════════════════════
   §67-PARTIAL — the four shapes REGENERATE FROM PARAMETERS
   ══════════════════════════════════════════════════════════════════════════ */

describe('§67 partial — profiles regenerate from parameters', () => {
  it('RECTANGULAR: the descriptor extent equals the resolved Width/Height, and follows an override', async () => {
    const solids = [extrudeSolid('sol_01HZ00000000000000000RCS01', 'prof_01HZ00000000000000000RCT01')];
    const base = await bakeOne([rectangularProfile()], solids);
    expect(base.ok).toBe(true);
    expect(base.unsupported).toHaveLength(0);
    const a = xzExtent(base.baked[0]!.descriptor.position);
    // 1200 mm and 1500 mm authored -> 1.2 m and 1.5 m in the descriptor.
    expect(a.width).toBeCloseTo(1.2, 6);
    expect(a.depth).toBeCloseTo(1.5, 6);

    // ⭐ REGENERATION: change ONE parameter; the geometry follows.
    const wide = await bakeOne([rectangularProfile()], solids, { [P_WIDTH]: 1800 });
    const b = xzExtent(wide.baked[0]!.descriptor.position);
    expect(b.width).toBeCloseTo(1.8, 6);
    expect(b.depth).toBeCloseTo(1.5, 6); // unchanged
  });

  it('ARCHED (spec §64 "arched top"): every head vertex lies ON the circle, and the rise follows Width', async () => {
    const solids = [extrudeSolid('sol_01HZ00000000000000000ARS01', 'prof_01HZ00000000000000000ARC01')];
    const res = await bakeOne([archedProfile()], solids);
    expect(res.ok).toBe(true);
    expect(res.unsupported).toHaveLength(0);

    const pos = res.baked[0]!.descriptor.position;
    const e = xzExtent(pos);
    expect(e.width).toBeCloseTo(1.2, 6);
    // sill at z=0, springing at z=1.5, crown at 1.5 + Width/2 = 2.1
    expect(e.minZ).toBeCloseTo(0, 6);
    expect(e.maxZ).toBeCloseTo(2.1, 6);

    // ⛔ THE FALSIFIER FOR "arcToPoints would have done": measured from the
    //    DESCRIPTOR, every vertex above the springing line must sit on the
    //    circle of radius Width/2 about (Width/2, Height) to within the
    //    kernel's declared COINCIDENT_M. A quadratic Bezier bottoms out at
    //    0.1077 m here — 108x COINCIDENT_M — and would fail this assertion.
    const cx = 0.6, cz = 1.5, r = 0.6;
    let checked = 0;
    let worst = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]!, z = pos[i + 2]!;
      if (z <= cz + 1e-9) continue;
      const dev = Math.abs(Math.hypot(x - cx, z - cz) - r);
      worst = Math.max(worst, dev);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(worst).toBeLessThan(COINCIDENT_M);

    // ⭐ REGENERATION: the arch is driven by Width, so widening raises the crown.
    const wide = await bakeOne([archedProfile()], solids, { [P_WIDTH]: 2000 });
    const w = xzExtent(wide.baked[0]!.descriptor.position);
    expect(w.width).toBeCloseTo(2.0, 6);
    expect(w.maxZ).toBeCloseTo(1.5 + 1.0, 6);
  });

  it('POLYGON (hexagon): six distinct sides, extent = 2R, and it follows R', async () => {
    const solids = [extrudeSolid('sol_01HZ00000000000000000HXS01', 'prof_01HZ00000000000000000HEX01')];
    const res = await bakeOne([hexagonProfile()], solids);
    expect(res.ok).toBe(true);
    expect(res.unsupported).toHaveLength(0);
    const e = xzExtent(res.baked[0]!.descriptor.position);
    expect(e.width).toBeCloseTo(1.0, 6);                       // 2R, R = 500 mm
    expect(e.depth).toBeCloseTo(2 * 0.5 * 0.8660254037844386, 6);

    // Six unique XZ vertices survive construction-by-reference de-duplication.
    const pos = res.baked[0]!.descriptor.position;
    const unique = new Set<string>();
    for (let i = 0; i < pos.length; i += 3) {
      unique.add(`${pos[i]!.toFixed(6)},${pos[i + 2]!.toFixed(6)}`);
    }
    expect(unique.size).toBe(6);

    const bigger = await bakeOne([hexagonProfile()], solids, { [P_RADIUS]: 1000 });
    expect(xzExtent(bigger.baked[0]!.descriptor.position).width).toBeCloseTo(2.0, 6);
  });

  it('RHOMBOID: the lean equals Skew and changes with it, while the base stays Width', async () => {
    const solids = [extrudeSolid('sol_01HZ00000000000000000RHS01', 'prof_01HZ00000000000000000RHM01')];
    const res = await bakeOne([rhomboidProfile()], solids);
    expect(res.ok).toBe(true);
    const e = xzExtent(res.baked[0]!.descriptor.position);
    // total x span = Width + Skew = 1.2 + 0.3
    expect(e.width).toBeCloseTo(1.5, 6);
    expect(e.minX).toBeCloseTo(0, 6);

    const leaned = await bakeOne([rhomboidProfile()], solids, { [P_SKEW]: 900 });
    const l = xzExtent(leaned.baked[0]!.descriptor.position);
    expect(l.width).toBeCloseTo(1.2 + 0.9, 6);
    // ⛔ negative control: it is the LEAN that moved, not the base. The two
    //    bottom corners are still Width apart.
    const bottom = collectAt(leaned.baked[0]!.descriptor.position, 0);
    expect(Math.max(...bottom) - Math.min(...bottom)).toBeCloseTo(1.2, 6);
  });

  it('CIRCLE: the section is a real circle at the declared tolerance, not a polygon of arbitrary density', async () => {
    const solids = [extrudeSolid('sol_01HZ00000000000000000CIS01', 'prof_01HZ00000000000000000CIR01')];
    const res = await bakeOne([circleProfile()], solids);
    expect(res.ok).toBe(true);
    const pos = res.baked[0]!.descriptor.position;
    const e = xzExtent(pos);
    expect(e.width).toBeCloseTo(1.0, 3);
    let worst = 0;
    for (let i = 0; i < pos.length; i += 3) {
      worst = Math.max(worst, Math.abs(Math.hypot(pos[i]!, pos[i + 2]!) - 0.5));
    }
    expect(worst).toBeLessThan(COINCIDENT_M);
  });

  it('is DETERMINISTIC — the same document baked twice is byte-identical on every profile', async () => {
    const profiles = [rectangularProfile(), archedProfile(), hexagonProfile(), rhomboidProfile()];
    const solids = [
      extrudeSolid('sol_01HZ00000000000000000RCS01', 'prof_01HZ00000000000000000RCT01'),
      extrudeSolid('sol_01HZ00000000000000000ARS01', 'prof_01HZ00000000000000000ARC01'),
      extrudeSolid('sol_01HZ00000000000000000HXS01', 'prof_01HZ00000000000000000HEX01'),
      extrudeSolid('sol_01HZ00000000000000000RHS01', 'prof_01HZ00000000000000000RHM01'),
    ];
    const a = await bakeOne(profiles, solids);
    const b = await bakeOne(profiles, solids);
    expect(a.baked).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(a.baked[i]!.descriptor.position).toEqual(b.baked[i]!.descriptor.position);
      expect(a.baked[i]!.descriptor.index).toEqual(b.baked[i]!.descriptor.index);
      expect(a.baked[i]!.descriptor.hash).toBe(b.baked[i]!.descriptor.hash);
    }
  });

  it('tessellation density is a PURE function of the resolved inputs', () => {
    // No clock, no counter, no LOD: same inputs -> same count, and a bigger
    // radius at the same tolerance needs strictly more segments.
    expect(segmentsForSweep(0.6, Math.PI)).toBe(segmentsForSweep(0.6, Math.PI));
    expect(segmentsForSweep(6, Math.PI)).toBeGreaterThan(segmentsForSweep(0.6, Math.PI));
    // A radius at or below the coincidence tolerance is not a curve at model
    // scale and must not consume vertices for one.
    expect(segmentsForSweep(COINCIDENT_M / 2, Math.PI * 2)).toBe(2);
  });
});

function collectAt(position: Float32Array, targetZ: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < position.length; i += 3) {
    if (Math.abs(position[i + 2]! - targetZ) < 1e-6) out.push(position[i]!);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PORT — §4D-GEOMETRY-ADAPTER
   ══════════════════════════════════════════════════════════════════════════ */

describe('§4D-GEOMETRY-ADAPTER — the kernel is behind a port', () => {
  it('the INJECTED adapter is what evaluates — the kernel is no longer hard-wired', async () => {
    const seen: Array<{ verts: number; heightM: number }> = [];
    const recording: GeometryAdapter = {
      id: 'test-recording-adapter',
      extrude: (profile, heightM, options) => {
        seen.push({ verts: profile.length, heightM });
        return kernelGeometryAdapter.extrude!(profile, heightM, options);
      },
    };
    const res = await bakeOne(
      [rectangularProfile()],
      [extrudeSolid('sol_01HZ00000000000000000RCS01', 'prof_01HZ00000000000000000RCT01')],
      undefined,
      recording,
    );
    expect(res.ok).toBe(true);
    // The TRANSLATION is observable at the port: four polygon vertices and a
    // height that already crossed §4D-ONE-LENGTH-SEAM (100 mm -> 0.1 m).
    expect(seen).toHaveLength(1);
    expect(seen[0]!.verts).toBe(4);
    expect(seen[0]!.heightM).toBeCloseTo(0.1, 9);
  });

  it('an adapter WITHOUT a capability refuses by name instead of substituting one', async () => {
    const empty: GeometryAdapter = { id: 'no-capabilities-adapter' };
    const res = await bakeOne(
      [rectangularProfile()],
      [extrudeSolid('sol_01HZ00000000000000000RCS01', 'prof_01HZ00000000000000000RCT01')],
      undefined,
      empty,
    );
    expect(res.ok).toBe(false);
    expect(res.baked).toHaveLength(0);
    expect(res.unsupported[0]!.reason).toBe('unsupported-feature');
    expect(res.unsupported[0]!.message).toContain('no-capabilities-adapter');
    expect(res.unsupported[0]!.message).toContain('provides: none');
  });

  it('the default adapter declares all four kernel capabilities', () => {
    expect(kernelGeometryAdapter.id).toBe('@pryzm/geometry-kernel');
    expect(typeof kernelGeometryAdapter.extrude).toBe('function');
    expect(typeof kernelGeometryAdapter.sweep).toBe('function');
    expect(typeof kernelGeometryAdapter.loft).toBe('function');
    expect(typeof kernelGeometryAdapter.revolve).toBe('function');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THE REFUSALS — they must name the TRUE cause
   ══════════════════════════════════════════════════════════════════════════ */

describe('§4D-SCHEMA-DELTA — refusals name the missing SCHEMA fields, never a solver', () => {
  const cases: Array<[string, SolidFeature, string[]]> = [
    [
      'sweep',
      { id: 'sol_01HZ00000000000000000SWP01', kind: 'sweep', profileId: 'prof_01HZ00000000000000000RCT01', pathProfileId: 'prof_01HZ00000000000000000RCT01', materialSlotId: null, lod: { coarse: false, medium: true, fine: true } } as SolidFeature,
      ['ReferencePlaneSchema', 'in-plane basis', 'SCHEMA gap'],
    ],
    [
      'loft',
      { id: 'sol_01HZ00000000000000000LFT01', kind: 'loft', profileIds: ['prof_01HZ00000000000000000RCT01', 'prof_01HZ00000000000000000RCT01'], materialSlotId: null, lod: { coarse: false, medium: true, fine: true } } as SolidFeature,
      ['right', 'up', 'vertex count'],
    ],
    [
      'revolve',
      { id: 'sol_01HZ00000000000000000RVL01', kind: 'revolve', profileId: 'prof_01HZ00000000000000000RCT01', materialSlotId: null, lod: { coarse: false, medium: true, fine: true }, sweepDeg: 360, segments: 24 } as SolidFeature,
      ['AXIS', 'no axis'],
    ],
    [
      'boolean',
      { id: 'sol_01HZ00000000000000000BOL01', kind: 'boolean', op: 'subtract', subjectSolidId: 'sol_01HZ00000000000000000RCS01', toolSolidId: 'sol_01HZ00000000000000000RCS01', materialSlotId: null, lod: { coarse: false, medium: true, fine: true } } as SolidFeature,
      ['featureEdges', 'D7'],
    ],
  ];

  for (const [kind, solid, mustSay] of cases) {
    it(`${kind} refuses, and the message does NOT cite a constraint solver`, async () => {
      const res = await bakeOne(
        [rectangularProfile()],
        [extrudeSolid('sol_01HZ00000000000000000RCS01', 'prof_01HZ00000000000000000RCT01'), solid],
      );
      expect(res.ok).toBe(true);          // the supported solid still bakes
      expect(res.baked).toHaveLength(1);
      expect(res.unsupported).toHaveLength(1);
      const u = res.unsupported[0]!;
      expect(u.kind).toBe(kind);
      expect(u.reason).toBe('unsupported-feature');
      // ⛔ THE POINT OF THIS ASSERTION: the old message said *"requires the S57
      //    constraint solver"*. C74 §1.2 forbids that reasoning and lane TESS
      //    falsified it. A message that reintroduces it fails here.
      expect(u.message).not.toMatch(/constraint solver/i);
      expect(u.message).not.toMatch(/S57/);
      for (const phrase of mustSay) expect(u.message).toContain(phrase);
    });
  }

  // ⭐⭐ §82.4-DIRECTED-EXTRUDE — THIS CASE WAS INVERTED, DELIBERATELY.
  //
  // It read: *"a non-+Y extrude direction REFUSES instead of being silently
  // ignored (L-11530 shape)"*, and it was correct while `ExtrudeOptions` had no
  // axis: refusing beat building a vertical solid for a document that asked for
  // a horizontal one. `produceExtrude` now sweeps along any axis
  // (`__tests__/produceExtrude.direction.test.ts`), so the refusal became the
  // OPPOSITE lie — "cannot" said by code that can. What the L-11530 lesson
  // actually protects is that the persisted field must not be IGNORED; that is
  // now asserted the strong way, by measuring the geometry the field produced.
  it('§82.4 — a non-+Y extrude direction BAKES, swept along that axis (the field is read, not ignored)', async () => {
    const sideways = {
      ...extrudeSolid('sol_01HZ00000000000000000RCS01', 'prof_01HZ00000000000000000RCT01'),
      direction: { x: 1, y: 0, z: 0 },
    } as SolidFeature;
    const res = await bakeOne([rectangularProfile()], [sideways]);
    expect(res.ok).toBe(true);
    expect(res.unsupported).toHaveLength(0);
    expect(res.baked).toHaveLength(1);

    const b = res.baked[0]!.descriptor.bounds;
    const upright = await bakeOne(
      [rectangularProfile()],
      [extrudeSolid('sol_01HZ00000000000000000RCS01', 'prof_01HZ00000000000000000RCT01')],
    );
    const u = upright.baked[0]!.descriptor.bounds;
    // The upright solid's height is its Y extent; the directed one's is its X
    // extent — the same length, moved onto the axis the document named.
    expect(b.max.x - b.min.x).toBeCloseTo(u.max.y - u.min.y, 6);
    expect(b.max.y - b.min.y).not.toBeCloseTo(u.max.y - u.min.y, 6);
  });

  it('§82.4 — a ZERO-LENGTH direction still REFUSES by name, and does not take the bake down with it', async () => {
    const axisless = {
      ...extrudeSolid('sol_01HZ00000000000000000RCS01', 'prof_01HZ00000000000000000RCT01'),
      direction: { x: 0, y: 0, z: 0 },
    } as SolidFeature;
    const res = await bakeOne([rectangularProfile()], [axisless]);
    expect(res.ok).toBe(false);
    expect(res.unsupported).toHaveLength(1);
    expect(res.unsupported[0]!.reason).toBe('unsupported-feature');
    expect(res.unsupported[0]!.message).toContain('names no sweep axis');
    // ⛔ The producer THROWS on this input; the bake must turn that into a
    //    per-solid sentence rather than letting one solid kill the whole bake.
    expect(res.unsupported[0]!.message).toContain('spec §75');
  });

  it('an UNDER-DETERMINED arc still refuses — and that is where `profile-needs-solver` was always TRUE', async () => {
    const broken = {
      id: 'prof_01HZ00000000000000000BAD01', name: 'BadArc', planeId: PLANE,
      entities: [
        { id: '01HZE0000000000000000BD0M0', kind: 'point', data: { x: '0', z: '0' } },
        // no `radius`, no angles — the schema accepts this, the evaluator must not
        { id: '01HZE0000000000000000BD0A0', kind: 'arc', data: { center: '01HZE0000000000000000BD0M0' } },
      ],
      constraints: [],
    } as unknown as Profile;
    const res = await bakeOne([broken], [extrudeSolid('sol_01HZ00000000000000000BDS01', 'prof_01HZ00000000000000000BAD01')]);
    expect(res.ok).toBe(false);
    expect(res.unsupported[0]!.reason).toBe('unsupported-feature');
    expect(res.unsupported[0]!.message).toContain('under-determined');
  });

  it('a spline refuses honestly rather than being approximated (spec §75)', async () => {
    const spliney = {
      id: 'prof_01HZ00000000000000000SPL01', name: 'Spline', planeId: PLANE,
      entities: [
        { id: '01HZE0000000000000000SP001', kind: 'point', data: { x: '0', z: '0' } },
        { id: '01HZE0000000000000000SP002', kind: 'point', data: { x: 'Width', z: '0' } },
        { id: '01HZE0000000000000000SP003', kind: 'spline', data: {} },
      ],
      constraints: [],
    } as unknown as Profile;
    const res = await bakeOne([spliney], [extrudeSolid('sol_01HZ00000000000000000SPS01', 'prof_01HZ00000000000000000SPL01')]);
    expect(res.ok).toBe(false);
    expect(res.unsupported[0]!.message).toContain('spline');
    expect(res.unsupported[0]!.message).toContain('not determined by the document');
  });

  it('a STRING coordinate with no resolvable parameter refuses instead of defaulting to zero', async () => {
    const ghost = {
      id: 'prof_01HZ00000000000000000GHO01', name: 'Ghost', planeId: PLANE,
      entities: [
        { id: '01HZE0000000000000000GH001', kind: 'point', data: { x: 'NoSuchParameter', z: '0' } },
        { id: '01HZE0000000000000000GH002', kind: 'point', data: { x: 'Width', z: '0' } },
        { id: '01HZE0000000000000000GH003', kind: 'point', data: { x: 'Width', z: 'Height' } },
      ],
      constraints: [],
    } as unknown as Profile;
    const res = await bakeOne([ghost], [extrudeSolid('sol_01HZ00000000000000000GHS01', 'prof_01HZ00000000000000000GHO01')]);
    expect(res.ok).toBe(false);
    expect(res.unsupported[0]!.message).toContain('NoSuchParameter');
    // ⚠ The "refuses rather than defaulting" half of this arm ALSO held before
    //   this lane (a string coordinate failed the old `typeof x === 'number'`
    //   check), so it is a regression guard, not a falsifier. The CLASSIFICATION
    //   is the falsifier: an unresolvable identifier means the entity is not
    //   determined by the resolved scope, which is `'unsupported-feature'` —
    //   HEAD reported `'profile-eval-failed'`, i.e. a malformed coordinate.
    expect(res.unsupported[0]!.reason).toBe('unsupported-feature');
    expect(res.unsupported[0]!.message).toContain('unknown identifier');
  });
});
