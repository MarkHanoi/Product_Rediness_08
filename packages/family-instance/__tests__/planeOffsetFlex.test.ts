// LANE CE-PARAMS-AND-PLANES ACCEPTANCE — §82.1-PARAMETRIC-DATUM:
// **a parameter moves a reference plane, and the geometry locked to that plane
// moves with it.**
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS SUITE IS FOR, AND WHAT WOULD MAKE IT A LIE
// ═══════════════════════════════════════════════════════════════════════════
// The founder's requirement is a Revit semantic, not a storage one: geometry is
// LOCKED to reference planes, planes are positioned by PARAMETRIC dimensions,
// so changing a parameter moves the plane and the geometry follows. A suite
// that asserted `document.referencePlanes[0].offsetExpression === 'Height'`
// would prove only that a string round-trips — the exact "stores a number
// beside the geometry" outcome the requirement excludes.
//
// So every assertion below reads the **`BufferGeometryDescriptor.position`
// buffer returned by the real `produceExtrude` inside the real, unmodified
// `bakeFamilyInstance`** — the artefact a committer uploads to the GPU
// (C16 CA-21: never the DTO the writer wrote).
//
// ⛔ THE NEGATIVE CONTROL IS THE UNIT (C110 §3.3-b). The parameter is authored
//    in the runtime's canonical length unit (millimetres today) and the
//    descriptor is metres, so every fixture value here is one whose millimetre
//    and metre readings differ by three orders of magnitude AND are both
//    physically plausible for a datum height: 2100 mm / 2.1 m, 3000 mm / 3.0 m.
//    A fixture of `1` could not falsify a 1000× error — both readings look
//    plausible and the assertion passes either way.
//
// ⚠ WHAT THIS DOES NOT ESTABLISH, stated so a blank is not read as "fine":
//   nothing here is rendered, placed or seen. It measures the bake, which is
//   the evaluator the definition workspace's live preview and the bake-worker
//   both call. The UI leg is measured in
//   `apps/editor/src/ui/component-editor-workspace/__tests__/`.

import { describe, it, expect } from 'vitest';
import type { FamilyDocument, FamilyManifest, ReferencePlane, SolidFeature } from '@pryzm/file-format';
import { bakeFamilyInstance } from '../src/index.js';

const NOW = '2026-04-28T12:00:00.000Z';
const PLANE = 'plane_01HZ00000000000000000PNE01';
const PROFILE = 'prof_01HZ00000000000000000PRF01';
const SOLID = 'sol_01HZ00000000000000000SLD01';
const TYPE_ID = 'typ_01HZ00000000000000000DEF01';
const P_DATUM = 'par_01HZ00000000000000000DTM01';

/** The datum height, in the `@pryzm/family-runtime` canonical length unit
 *  (millimetres today — ADR-0376 D3 rules metres and lane 4A recorded the
 *  migration as OWED). 2100 here MUST arrive as 2.1 in the descriptor. */
const DATUM_MM = 2100;
const DATUM_M = 2.1;
/** The flexed value. 3000 mm / 3.0 m — 900 mm of movement to assert. */
const FLEXED_MM = 3000;
const FLEXED_M = 3.0;
/** Solid thickness, so "the plane moved" is distinguishable from "the solid
 *  grew": the height is CONSTANT across every flex below. */
const THICK_MM = 200;
const THICK_M = 0.2;

/** Float32 round-trip band. The descriptor's position buffer is Float32Array,
 *  so 2.1 m arrives as the nearest float32 (~1.2e-7 relative). This is a
 *  storage-precision band, NOT a model tolerance — deliberately not spelt with
 *  the kernel's `COINCIDENT_M`, which answers a different question (C73 §2.2). */
const F32 = 1e-6;

interface PlaneOverrides {
  readonly offsetExpression?: string;
  readonly origin?: { x: number; y: number; z: number };
  readonly normal?: { x: number; y: number; z: number };
}

function makeFamily(
  planeOpts: PlaneOverrides = {},
  solidOpts: Partial<Pick<SolidFeature & { direction: unknown }, 'direction'>> = {},
): { manifest: FamilyManifest; document: FamilyDocument; schemaHash: string } {
  const plane = {
    id: PLANE,
    name: 'Top of Datum',
    origin: planeOpts.origin ?? { x: 0, y: 0, z: 0 },
    normal: planeOpts.normal ?? { x: 0, y: 1, z: 0 },
    isHost: false,
    // ⭐ ABSENT, not null, when undimensioned — `offsetExpression` is
    //    `.optional()` and ABSENT is its "this datum is not dimensioned" value.
    ...(planeOpts.offsetExpression === undefined
      ? {}
      : { offsetExpression: planeOpts.offsetExpression }),
  } as ReferencePlane;

  const document = {
    formatVersion: '1.1',
    referencePlanes: [plane],
    parameters: [
      {
        id: P_DATUM, name: 'DatumHeight', kind: 'type', dataType: 'length',
        defaultValue: DATUM_MM, expression: null, ifcMapping: null, exposed: true,
      },
    ],
    profiles: [
      {
        id: PROFILE,
        name: 'Slab',
        // ⭐ THE LOCK. This is the field that binds the geometry to the datum.
        planeId: PLANE,
        entities: [
          { id: '01HZE0000000000000000PT001', kind: 'point', data: { x: 0, z: 0 } },
          { id: '01HZE0000000000000000PT002', kind: 'point', data: { x: 1, z: 0 } },
          { id: '01HZE0000000000000000PT003', kind: 'point', data: { x: 1, z: 1 } },
          { id: '01HZE0000000000000000PT004', kind: 'point', data: { x: 0, z: 1 } },
        ],
        constraints: [],
      },
    ],
    solids: [
      {
        id: SOLID,
        kind: 'extrude',
        profileId: PROFILE,
        materialSlotId: null,
        lod: { coarse: false, medium: true, fine: true },
        // CONSTANT. Only the plane moves in the flex cases below.
        lengthExpression: String(THICK_MM),
        direction: solidOpts.direction ?? { x: 0, y: 1, z: 0 },
      },
    ],
    materialSlots: [],
    types: [
      {
        id: TYPE_ID, name: 'Default', values: {},
        checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
      },
    ],
    representations: [],
    connectors: [],
    propertySets: [],
    featureEdges: [],
  } as unknown as FamilyDocument;

  const manifest: FamilyManifest = {
    formatVersion: '1.1', id: 'fam_01HZ00000000000000000FAM01', name: 'DatumTest', semver: '1.0.0',
    author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'Test' },
    description: '', ifcEntity: 'IfcBuildingElementProxy', category: 'Generic', tags: [],
    minPRYZMVersion: '2.0.0',
    schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    createdAt: NOW, lastModifiedAt: NOW,
  };
  return { manifest, document, schemaHash: manifest.schemaHash };
}

/** Y extent read out of the position buffer the producer actually wrote. */
function yExtent(position: Float32Array): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 1; i < position.length; i += 3) {
    const y = position[i]!;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return { min, max };
}

async function bake(
  fam: ReturnType<typeof makeFamily>,
  overrides?: Readonly<Record<string, number>>,
) {
  return bakeFamilyInstance({
    family: fam,
    typeId: TYPE_ID,
    ...(overrides ? { instanceOverrides: overrides } : {}),
  });
}

describe('§82.1-PARAMETRIC-DATUM — a parameter moves the plane and the geometry follows', () => {
  it('places the solid ON the dimensioned plane, in metres', async () => {
    const res = await bake(makeFamily({ offsetExpression: 'DatumHeight' }));
    expect(res.ok).toBe(true);
    expect(res.unsupported).toEqual([]);
    const { min, max } = yExtent(res.baked[0]!.descriptor.position);
    // ⛔ THE 1000× NEGATIVE CONTROL. If `§4D-ONE-LENGTH-SEAM` were skipped this
    //    would read 2100, not 2.1 — three orders of magnitude apart.
    expect(min).toBeCloseTo(DATUM_M, 5);
    expect(max).toBeCloseTo(DATUM_M + THICK_M, 5);
  });

  it('FLEXES: changing the parameter moves the baked geometry by exactly that much', async () => {
    const fam = makeFamily({ offsetExpression: 'DatumHeight' });
    const before = yExtent((await bake(fam)).baked[0]!.descriptor.position);
    const after = yExtent(
      (await bake(fam, { [P_DATUM]: FLEXED_MM })).baked[0]!.descriptor.position,
    );

    // The plane moved 2100 mm → 3000 mm, i.e. 0.9 m.
    expect(after.min - before.min).toBeCloseTo(FLEXED_M - DATUM_M, 5);
    expect(after.max - before.max).toBeCloseTo(FLEXED_M - DATUM_M, 5);
    // ⭐ AND THE SOLID DID NOT GROW. `lengthExpression` is a constant, so a
    //    thickness that changed would mean the offset had been folded into the
    //    height — the "number stored beside the geometry" outcome, passing a
    //    naive min-Y assertion. Both ends must move together.
    expect(after.max - after.min).toBeCloseTo(THICK_M, 5);
    expect(before.max - before.min).toBeCloseTo(THICK_M, 5);
  });

  it('reads the dimension through the ONE expression engine, not a parseFloat', async () => {
    // `DatumHeight - 100` is arithmetic the grammar evaluates; `Number.parseFloat`
    // would read it as 2100 and a bare `Number()` as NaN. Only the engine gives
    // 2000 mm → 2.0 m.
    const res = await bake(makeFamily({ offsetExpression: 'DatumHeight - 100' }));
    expect(res.ok).toBe(true);
    expect(yExtent(res.baked[0]!.descriptor.position).min).toBeCloseTo(2.0, 5);
  });

  it('accepts a negative dimension — "below the datum" is a real intent', async () => {
    const res = await bake(makeFamily({ offsetExpression: '0 - DatumHeight' }));
    expect(res.ok).toBe(true);
    expect(yExtent(res.baked[0]!.descriptor.position).min).toBeCloseTo(-DATUM_M, 5);
  });

  it('flexes along a NON-vertical plane too — the offset follows the normal', async () => {
    const fam = makeFamily(
      { offsetExpression: 'DatumHeight', normal: { x: 1, y: 0, z: 0 } },
      { direction: { x: 1, y: 0, z: 0 } },
    );
    const res = await bake(fam);
    expect(res.ok).toBe(true);
    const pos = res.baked[0]!.descriptor.position;
    let minX = Infinity;
    for (let i = 0; i < pos.length; i += 3) if (pos[i]! < minX) minX = pos[i]!;
    expect(minX).toBeCloseTo(DATUM_M, 4);
  });

  it('an UNDIMENSIONED plane bakes byte-identically — the pre-§82.1 path is untouched', async () => {
    const withPlane = await bake(makeFamily());
    const withoutOffsetKey = await bake(makeFamily({}));
    expect(withPlane.ok).toBe(true);
    const a = withPlane.baked[0]!.descriptor;
    const b = withoutOffsetKey.baked[0]!.descriptor;
    expect(a.position).toEqual(b.position);
    // ⭐ The HASH is the content address a cache keys on. `produceExtrude` reads
    //    `options?.worldY ?? 0`, so an undimensioned plane must not re-key one
    //    descriptor in the repository.
    expect(a.hash).toBe(b.hash);
    expect(yExtent(a.position).min).toBeCloseTo(0, 6);
  });
});

describe('§82.1-PARAMETRIC-DATUM — the refusals, each naming its own reason', () => {
  it('refuses when the sweep axis is not the plane normal, rather than projecting', async () => {
    const fam = makeFamily(
      { offsetExpression: 'DatumHeight', normal: { x: 0, y: 1, z: 0 } },
      { direction: { x: 0, y: 0, z: 1 } },
    );
    const res = await bake(fam);
    expect(res.ok).toBe(false);
    expect(res.baked).toEqual([]);
    expect(res.unsupported).toHaveLength(1);
    expect(res.unsupported[0]!.reason).toBe('unsupported-feature');
    expect(res.unsupported[0]!.message).toContain('set-extrude-work-plane');
  });

  it('refuses an ANTIPARALLEL sweep axis rather than guessing the sign', async () => {
    const fam = makeFamily(
      { offsetExpression: 'DatumHeight' },
      { direction: { x: 0, y: -1, z: 0 } },
    );
    const res = await bake(fam);
    expect(res.ok).toBe(false);
    expect(res.unsupported[0]!.reason).toBe('unsupported-feature');
  });

  it('refuses a plane that states its position TWICE (literal origin + dimension)', async () => {
    const fam = makeFamily({ offsetExpression: 'DatumHeight', origin: { x: 0, y: 1.5, z: 0 } });
    const res = await bake(fam);
    expect(res.ok).toBe(false);
    expect(res.unsupported[0]!.message).toContain('TWICE');
  });

  it('refuses a dimension naming an identifier the definition does not carry', async () => {
    const res = await bake(makeFamily({ offsetExpression: 'NoSuchParameter' }));
    expect(res.ok).toBe(false);
    expect(res.unsupported[0]!.reason).toBe('invalid-length');
    expect(res.unsupported[0]!.message).toContain('NoSuchParameter');
  });

  it('refuses a dimension the grammar cannot parse, in the engine’s own words', async () => {
    const res = await bake(makeFamily({ offsetExpression: '2100 +' }));
    expect(res.ok).toBe(false);
    expect(res.unsupported[0]!.reason).toBe('invalid-length');
  });
});
