// §CURVE-MIXED-ROUNDTRIP — a profile that closes across ALL THREE curve kinds,
// SAVED and LOADED through the real schema, must bake to identical geometry.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHAT THIS ESTABLISHES, AND WHAT IT DELIBERATELY DOES NOT
// ═══════════════════════════════════════════════════════════════════════════
// The founder's requirement is *"ANY SHAPE LIKE RHINOCEROS"*, and the half of
// that which is falsifiable here is: **a boundary may mix straight, circular
// and free-form spans and still be one closed, extrudable loop, and it must
// survive a save/load unchanged.** `profileSpline.test.ts` already proves the
// spline BAKES; it uses a line+spline "D". This adds the `arc` kind to the same
// loop — so all three co-exist on one boundary — and then round-trips it.
//
// ⭐ **THE ROUND TRIP IS THROUGH `FamilyDocumentSchema`, NOT A HAND-COPY.**
//    The document is `JSON.stringify`-ed and re-`parse`-d by the REAL exported
//    Zod schema — the same code path a `.pryzm-family` reader runs. A test that
//    round-tripped a structuredClone would prove only that JS copies objects;
//    it would not catch a `.default()`, a coercion or a strip, which is exactly
//    the class of loss C111 §5 is about. Zod is the component under test here.
//
// ⭐ **THE COMPARISON IS THE POSITION BUFFER, EXACT.** Not the polygon, not a
//    field diff, and not `toBeCloseTo`: the `Float32Array` a committer would
//    upload, compared element-for-element. Tessellation of BOTH the arc and the
//    cubic is deterministic in its inputs (`segmentsForSweep`,
//    `segmentsForCubicBezier` — no clock, no counter, no LOD), so anything but
//    bit-equality is a real defect and an epsilon here would hide it.
//
// ⚠ WHAT THIS DOES NOT ESTABLISH (C57 §1.9, and it is the honest half):
//   • **There is still no SKETCH → `profiles[]` producer, and there must not
//     be one yet.** C111 §9.4-c forbids it until the §9.4-b unit migration
//     lands (the sketch surface is millimetres, this format is metres). So this
//     round-trips the DOCUMENT, which is the artefact that persists — it does
//     NOT round-trip a user's drawn sketch, because that seam does not exist.
//     Measured at HEAD: `grep -rn "profiles:" apps/component-editor/src` → 0.
//   • Nothing here is rendered, placed or seen; `@pryzm/family-instance` still
//     has no `component.*` bus verb dispatching a bake.

import { describe, it, expect } from 'vitest';
import type {
  FamilyDocument,
  FamilyManifest,
  Profile,
  SolidFeature,
} from '@pryzm/file-format';
// ⚠ §BARREL-DRAGS-PDFJS — the SCHEMA is imported from its own module, NOT from
//   the `@pryzm/file-format` barrel, and the reason is measured, not stylistic:
//   the barrel re-exports `src/import/PDFToImageConverter.ts`, which imports
//   `pdfjs-dist` at module scope, which touches `DOMMatrix` at module scope.
//   A VALUE import of the barrel therefore throws
//   `ReferenceError: DOMMatrix is not defined` in this package's node-env
//   suite before a single test runs. (The type-only imports above are erased
//   by the compiler and are unaffected — which is why `profileSpline.test.ts`
//   never hit this.) `package.json` exposes no `./family-schema` subpath and
//   this lane may not add one, so the source path is the honest route.
//   This is `[[server-safe-entry-can-import-browser-ui]]` recurring at a new
//   seam; it is logged rather than worked around silently.
import { FamilyDocumentSchema } from '../../file-format/src/family-schema.js';
import { bakeFamilyInstance } from '../src/index.js';

const NOW = '2026-09-06T00:00:00.000Z';
const PLANE = 'plane_01HZ0000000000000000PNE001';
const TYPE_ID = 'typ_01HZ0000000000000000DEF001';
const P_DEPTH = 'par_01HZ0000000000000000DEP001';
const PID = 'prof_01HZ0000000000000000MXD001';
const SOLID = 'sol_01HZ0000000000000000SD0001';
const E = (tag: string) => `01HZE00000000000000000MX${tag}`;

function makeFamily(profiles: Profile[], solids: SolidFeature[]): {
  manifest: FamilyManifest;
  document: FamilyDocument;
  schemaHash: string;
} {
  const document = {
    formatVersion: '1.1',
    referencePlanes: [
      { id: PLANE, name: 'Host', origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, isHost: true },
    ],
    parameters: [
      {
        id: P_DEPTH, name: 'Depth', kind: 'type', dataType: 'length',
        defaultValue: 100, expression: null, ifcMapping: null, exposed: true,
      },
    ],
    profiles,
    solids,
    materialSlots: [],
    types: [
      {
        id: TYPE_ID, name: 'Default', values: {},
        checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
      },
    ],
    representations: [], connectors: [], propertySets: [], featureEdges: [],
  } as unknown as FamilyDocument;
  const manifest = {
    formatVersion: '1.1', id: 'fam_01HZ0000000000000000FAM001', name: 'MixedRoundTrip',
    semver: '1.0.0',
    author: { id: 'usr_01HZ0000000000000000ASR001', displayName: 'Test' },
    description: '', ifcEntity: 'IfcWindow', category: 'Window', tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: NOW, lastModifiedAt: NOW,
  } as unknown as FamilyManifest;
  return { manifest, document, schemaHash: manifest.schemaHash };
}

function extrudeSolid(profileId: string): SolidFeature {
  return {
    id: SOLID, kind: 'extrude', profileId, materialSlotId: null,
    lod: { coarse: false, medium: true, fine: true },
    lengthExpression: 'Depth', direction: { x: 0, y: 1, z: 0 },
  } as SolidFeature;
}

/**
 * A closed loop walked in ONE direction, using all three curve kinds:
 *
 *   (0,0) ──line──▶ (2,0) ──arc──▶ (2,2)   [quarter circle, centre (1,2)... ]
 *   (2,2) ─spline─▶ (0,0)                  [free-form return, bulging −x]
 *
 * The arc is a semicircle of radius 1 centred at (2,1): it starts at angle
 * −π/2 (i.e. (2,0)) and sweeps CCW to +π/2 (i.e. (2,2)), bulging to +x.
 * The spline is a single cubic whose endpoints are shared with its neighbours,
 * so the boundary closes at AUTHORED points rather than near them.
 */
function mixedProfile(): Profile {
  return {
    id: PID, name: 'Mixed', planeId: PLANE,
    entities: [
      { id: E('A0'), kind: 'point', data: { x: 0, z: 0 } },
      { id: E('A1'), kind: 'point', data: { x: 2, z: 0 } },
      { id: E('A2'), kind: 'point', data: { x: 2, z: 2 } },
      { id: E('AC'), kind: 'point', data: { x: 2, z: 1 } },
      // spline interior handles — construction geometry, off the curve
      { id: E('H1'), kind: 'point', data: { x: 1.4, z: 2.6 } },
      { id: E('H2'), kind: 'point', data: { x: -0.9, z: 1.2 } },
      { id: E('E1'), kind: 'line', data: { p1: E('A0'), p2: E('A1') } },
      {
        id: E('AR'), kind: 'arc',
        data: {
          center: E('AC'), radius: 1,
          startAngle: -Math.PI / 2, endAngle: Math.PI / 2,
        },
      },
      {
        id: E('SP'), kind: 'spline',
        data: {
          degree: 3, count: 4,
          cp0: E('A2'), cp1: E('H1'), cp2: E('H2'), cp3: E('A0'),
        },
      },
    ],
    constraints: [],
  } as unknown as Profile;
}

async function bakeDoc(document: FamilyDocument, manifest: FamilyManifest) {
  return bakeFamilyInstance({
    family: { manifest, document, schemaHash: manifest.schemaHash },
    typeId: TYPE_ID,
  });
}

describe('§CURVE-MIXED-ROUNDTRIP — line + arc + spline on ONE closed boundary', () => {
  it('bakes a boundary that mixes all three curve kinds', async () => {
    const fam = makeFamily([mixedProfile()], [extrudeSolid(PID)]);
    const r = await bakeDoc(fam.document, fam.manifest);

    // ⛔ The refusal list is asserted EMPTY first. `bakeFamilyInstance`
    //    completes supported solids and REPORTS the rest, so a bake that
    //    silently produced nothing would still return `baked: []` — checking
    //    only `unsupported` or only `baked` each miss half the failure.
    expect(r.unsupported).toEqual([]);
    expect(r.baked).toHaveLength(1);
    expect(r.baked[0]!.descriptor.position.length).toBeGreaterThan(0);
  });

  it('all three kinds contribute — the extents come from arc AND spline, not the line alone', async () => {
    const fam = makeFamily([mixedProfile()], [extrudeSolid(PID)]);
    const r = await bakeDoc(fam.document, fam.manifest);
    const pos = r.baked[0]!.descriptor.position;
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    // maxX > 2 can ONLY come from the arc bulging past the straight edge at
    // x = 2. minX < 0 can ONLY come from the spline bulging past the line's
    // start at x = 0. If either curve had been dropped, one bound collapses.
    expect(maxX).toBeGreaterThan(2);
    expect(minX).toBeLessThan(0);
  });

  it('SAVE → LOAD through the real FamilyDocumentSchema yields a BIT-IDENTICAL position buffer', async () => {
    const fam = makeFamily([mixedProfile()], [extrudeSolid(PID)]);

    const before = await bakeDoc(fam.document, fam.manifest);

    // The actual persistence round trip: serialise, re-parse with the exported
    // schema, bake the REPARSED document.
    const wire = JSON.stringify(fam.document);
    const reloaded = FamilyDocumentSchema.parse(JSON.parse(wire)) as FamilyDocument;
    const after = await bakeDoc(reloaded, fam.manifest);

    expect(after.unsupported).toEqual([]);
    expect(after.baked).toHaveLength(1);

    const a = before.baked[0]!.descriptor.position;
    const b = after.baked[0]!.descriptor.position;
    expect(b.length).toBe(a.length);
    // Element-for-element, EXACT. See the header: an epsilon here would hide
    // precisely the drift this test exists to catch.
    for (let i = 0; i < a.length; i++) {
      expect(b[i]).toBe(a[i]);
    }
  });

  it('the spline survives the round trip AS A SPLINE — its spelling is not silently stripped', async () => {
    const fam = makeFamily([mixedProfile()], [extrudeSolid(PID)]);
    const reloaded = FamilyDocumentSchema.parse(
      JSON.parse(JSON.stringify(fam.document)),
    ) as FamilyDocument;

    const prof = reloaded.profiles.find((p) => p.id === PID)!;
    const spline = prof.entities.find((e) => e.id === E('SP'))!;
    expect(spline.kind).toBe('spline');
    // ⭐ The control-point ids are the load-bearing payload: `data` is a record
    //    of SCALARS, so an `cpN` key silently dropped by a schema change would
    //    turn an authored curve into a refusal at the next bake. Assert the
    //    whole spelling, not merely that the entity survived.
    expect(spline.data).toEqual({
      degree: 3, count: 4,
      cp0: E('A2'), cp1: E('H1'), cp2: E('H2'), cp3: E('A0'),
    });
    // The arc's angles are floats and must not be coerced or rounded.
    const arc = prof.entities.find((e) => e.id === E('AR'))!;
    expect(arc.data['startAngle']).toBe(-Math.PI / 2);
    expect(arc.data['endAngle']).toBe(Math.PI / 2);
  });
});
