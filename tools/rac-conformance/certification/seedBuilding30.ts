// ─── The BIM 3.0 canonical world — a BUILDING, not a kind inventory ──────────
//
// BIM30-CERTIFICATION-PLAN §1.1 decided EXTEND, not supersede: `seed.ts` keeps
// its floors, its ratchet and its artefact untouched, and this second builder
// gets its own. The justification is §1.1(c), the reviewability argument —
// editing `seed.ts` would move the subject UNDERNEATH `floors.ts` and
// `cert-ratchet.json` in the same commit, which is indistinguishable in review
// from lowering a floor to make a run green (C70 §5.3).
//
// WHY A SECOND WORLD AT ALL (§1.1(b)): `seed.ts` proves that EACH KIND CAN BE
// COMPOSED. It cannot support one BIM 3.0 topology assertion, because its two
// walls are parallel and never touch (zero junctions), it has one room on a
// manual boundary, and every element sits on L0 while the stair declares
// `topLevelId: 'L1'`. An 18-kind inventory is not a building. This world asks
// the different question: DOES A BUILDING HOLD TOGETHER.
//
// THE SEEDING DISCIPLINE IS COPIED VERBATIM FROM `seed.ts` AND IS THE WHOLE
// POINT: every element is composed through a REAL `@pryzm/command-registry`
// command on the REAL `CommandManager`. No store is ever written directly. A
// kind that cannot be composed by a real command is REPORTED as unseeded —
// `REFUSED: <reason>` or `THREW: <error>` — and is never faked into existence.
// That is what makes the floors in `geometryFloors.ts` mean anything.
//
// DECLARED TARGETS (§1.2). Every count below is asserted by the harness. A
// target the machinery cannot yet produce is a NAMED ZERO AND A FINDING, never
// a silent absence:
//
//     3 levels · 14 walls · >= 8 openings · 10 rooms · 3 slabs · 6 columns
//     4 beams · 1 multi-level stair · 1 roof with a 300 mm overhang
//
// The 300 mm overhang is deliberate: it is the polygon-offset oracle case
// (§2.4), so the geometry link has a KNOWN ANSWER rather than a self-consistent
// one. An operation with an oracle is worth ten with self-consistency.

import type { World } from './world';

/** Declared targets from BIM30-CERTIFICATION-PLAN §1.2, asserted by the harness. */
export const BUILDING30_TARGETS = {
  levels: 3,
  walls: 14,
  openings: 8,
  rooms: 10,
  slabs: 3,
  columns: 6,
  beams: 4,
  stairs: 1,
  roofs: 1,
} as const;

export interface Building30Outcome {
  /** per-kind seeding outcome — SEEDED / REFUSED: … / THREW: … . Never swallowed. */
  seedOutcomes: Record<string, string>;
  /** measured store counts AFTER seeding, read back from the authoritative stores. */
  counts: Record<string, number>;
  /** every declared target vs its measured reading — a zero here is a FINDING. */
  targetReadings: Array<{ family: string; target: number; measured: number }>;
  /** ids the geometry harness builds from, so the fixture and the build agree. */
  ids: {
    walls: string[];
    slabs: string[];
    roofs: string[];
  };
  /** the roof's declared overhang — the polygon-offset oracle input. */
  roofOverhang: number;
}

/** The 12.0 x 8.0 m exterior rectangle, per §1.2. Corners ARE the junction subject. */
const SHELL: Array<[number, number]> = [[0, 0], [12, 0], [12, 8], [0, 8]];

/**
 * A DETERMINISTIC v4-shaped UUID for room `n`.
 *
 * MEASURED: `RoomStore.add` rejects a readable id with "room.id must be a valid
 * UUID" — the schema is the authority and the fixture yields to it. But
 * `crypto.randomUUID()` would make the room ids differ on every run, and this
 * harness feeds a suite whose neighbouring gates compare snapshots for BYTE
 * IDENTITY. A random id would turn a determinism check into a coin flip and the
 * failure would be blamed on the code rather than on the fixture. So the ids are
 * derived from a fixed prefix and the room index: schema-valid AND stable.
 */
const roomUuid = (n: number): string =>
  `b30d0000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export async function seedBuilding30(world: World): Promise<Building30Outcome> {
  const reg = await import('@pryzm/command-registry') as any;
  const { deserializeRoom } = await import('@pryzm/room-topology');
  const cm = world.cm;
  const seedOutcomes: Record<string, string> = {};

  /** A THROW or a refused result is RECORDED, never swallowed (copied from seed.ts). */
  const seed = (kind: string, fn: () => { success?: boolean; info?: string[] } | void): void => {
    try {
      const r = fn();
      if (r && r.success === false) {
        const why = [...(r.info ?? []), (r as { error?: string }).error ?? '']
          .filter(Boolean).join('; ') || 'no reason given';
        seedOutcomes[kind] = `REFUSED: ${why}`;
      } else if (seedOutcomes[kind] === undefined || seedOutcomes[kind] === 'SEEDED') {
        seedOutcomes[kind] = 'SEEDED';
      }
    } catch (e) {
      seedOutcomes[kind] = `THREW: ${String(e).slice(0, 300)}`;
    }
  };

  // ── Hierarchy: 3 levels (L0 exists from ProjectContext; add L1 + L2) ────────
  seed('level', () => cm.execute(new reg.AddLevelCommand({
    levelId: 'L1', name: 'Level 1', elevation: 3.2, height: 3.2,
  })));
  seed('level', () => cm.execute(new reg.AddLevelCommand({
    levelId: 'L2', name: 'Roof datum', elevation: 6.4, height: 3.2,
  })));
  // §1.2 asks for 2 grids, "one X and one Z". MEASURED: `AddGridCommand`
  // validates against `['X', 'Y']` and REFUSES `Z` with "Invalid orientation: Z".
  // The command's vocabulary is the authority, so the second grid is authored
  // as `Y` — the fixture yields to the real command, never the reverse.
  seed('grid', () => cm.execute(new reg.AddGridCommand({ gridId: 'b30-grid-x', orientation: 'X', position: 6 })));
  seed('grid', () => cm.execute(new reg.AddGridCommand({ gridId: 'b30-grid-y', orientation: 'Y', position: 4 })));

  // ── Walls — 14 total, and the SHELLS ARE CLOSED so corners are junctions ───
  const wallIds: string[] = [];
  const wall = (
    id: string, a: [number, number], b: [number, number], levelId: string, extra: Record<string, unknown> = {},
  ): void => {
    seed('wall', () => cm.execute(new reg.CreateWallCommand(id, {
      start: { x: a[0], z: a[1] }, end: { x: b[0], z: b[1] },
      height: 3.2, thickness: 0.2, levelId, ...extra,
    })));
    wallIds.push(id);
  };

  // 8 exterior: the closed 12.0 x 8.0 rectangle, once on L0 and again on L1.
  // A closed shell is mandatory — four corners per level is the >= 8 L-junction
  // target, and a shell that does not close produces ZERO of them.
  for (const [lvl, tag] of [['L0', 'l0'], ['L1', 'l1']] as const) {
    for (let i = 0; i < 4; i++) {
      wall(`b30-ext-${tag}-${i}`, SHELL[i]!, SHELL[(i + 1) % 4]!, lvl,
        { materialColor: i % 2 === 0 ? '#aabbcc' : '#ccbbaa' });
    }
  }
  // 6 interior: 3 per occupied level — one spine at x = 6.0 the full depth,
  // two cross walls MEETING it (those meetings are the >= 4 T-junction target).
  for (const [lvl, tag] of [['L0', 'l0'], ['L1', 'l1']] as const) {
    wall(`b30-spine-${tag}`, [6, 0], [6, 8], lvl, { materialColor: '#dddddd' });
    wall(`b30-cross-${tag}-a`, [0, 3], [6, 3], lvl);
    wall(`b30-cross-${tag}-b`, [6, 5], [12, 5], lvl);
  }
  // The 14th is the curtain wall — a distinct wall SYSTEM TYPE on the L0 south
  // elevation, not a 15th structural wall (§1.2).
  seed('curtainWall', () => cm.execute(new reg.CreateCurtainWallCommand({
    id: 'b30-cw-1', levelId: 'L0',
    start: { x: 0, z: 0 }, end: { x: 12, z: 0 }, height: 3.2,
    gridXSpacing: 1.5, gridYSpacing: 1.5,
  })));

  // ── Hosted openings — >= 8, at least one per wall type ─────────────────────
  // 1 entrance door + 4 windows on exterior; 2 interior doors (these are what
  // make room <-> room `connectedTo` measurable at all); 1 curtain-wall opening
  // ATTEMPTED — if CreateWallOpeningCommand refuses a curtain-wall host, THE
  // REFUSAL IS THE EVIDENCE and it scores REFUSES-CORRECTLY with the reason
  // printed. It is never a blank and never an assumed pass (§1.2).
  const opening = (kind: string, wallId: string, data: Record<string, unknown>): void => {
    seed(kind, () => cm.execute(new reg.CreateWallOpeningCommand({ wallId, openingData: data })));
  };
  opening('door', 'b30-ext-l0-0', { type: 'door', offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' });
  opening('window', 'b30-ext-l0-1', { type: 'window', offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9, windowType: 'single' });
  opening('window', 'b30-ext-l0-2', { type: 'window', offset: 4.0, width: 1.2, height: 1.4, sillHeight: 0.9, windowType: 'single' });
  opening('window', 'b30-ext-l1-1', { type: 'window', offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9, windowType: 'single' });
  opening('window', 'b30-ext-l1-2', { type: 'window', offset: 4.0, width: 1.2, height: 1.4, sillHeight: 0.9, windowType: 'single' });
  opening('door', 'b30-spine-l0', { type: 'door', offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' });
  opening('door', 'b30-cross-l0-a', { type: 'door', offset: 3.0, width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' });
  opening('door', 'b30-cross-l1-a', { type: 'door', offset: 3.0, width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' });
  // The curtain-wall host attempt — recorded under its own key so a refusal is
  // legible as a refusal rather than folded into the door tally.
  //
  // MEASURED: this REFUSES with "Wall not found" — `CreateWallOpeningCommand`
  // resolves hosts through the wallStore, and a curtain wall is not in it. Per
  // §1.2 THE REFUSAL IS THE EVIDENCE: the row scores REFUSES-CORRECTLY with the
  // reason printed, never a blank and never an assumed pass. Note honestly that
  // the refusal names the wrong thing — the true reason is "a curtain wall is
  // not a valid opening host", and "Wall not found" is the generic lookup miss.
  // That gap between the real rule and the delivered message is itself a
  // finding, recorded here rather than smoothed over.
  opening('openingOnCurtainWall', 'b30-cw-1', {
    type: 'door', offset: 3.0, width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single',
  });

  // ── Slabs — 3: a plate per occupied level plus a PARTIAL balcony plate ──────
  // The partial plate is what makes `sitsOn` and `supports` non-trivial (§1.2).
  const slabIds: string[] = [];
  const slab = (id: string, levelId: string, poly: Array<{ x: number; y: number }>, w: number, d: number, cx: number, cz: number): void => {
    seed('slab', () => cm.execute(new reg.CreateSlabCommand({
      id, levelId, position: { x: cx, y: 0, z: cz }, polygon: poly,
      thickness: 0.25, width: w, depth: d,
    })));
    slabIds.push(id);
  };
  const rectPoly = (x0: number, z0: number, x1: number, z1: number) =>
    [{ x: x0, y: z0 }, { x: x1, y: z0 }, { x: x1, y: z1 }, { x: x0, y: z1 }];
  slab('b30-slab-l0', 'L0', rectPoly(0, 0, 12, 8), 12, 8, 6, 4);
  slab('b30-slab-l1', 'L1', rectPoly(0, 0, 12, 8), 12, 8, 6, 4);
  slab('b30-slab-balcony', 'L1', rectPoly(12, 2, 14, 6), 2, 4, 13, 4);

  // ── Roof — the polygon-offset ORACLE case, 300 mm overhang over the L2 ─────
  // footprint. The oracle: offsetting the 12x8 shell outward by 0.3 must give a
  // 12.6 x 8.6 ring, EXACTLY. That is a known answer, not a self-consistency
  // check — which is why this specific number is in the fixture (§2.4).
  const ROOF_OVERHANG = 0.3;
  seed('roof', () => cm.execute(new reg.CreateRoofCommand('b30-roof-1', {
    levelId: 'L2',
    footprint: { polygon: SHELL.map(([x, z]) => [x, z]), centroid: [6, 4] },
    roofType: 'flat', overhang: ROOF_OVERHANG, baseOffset: 6.4, thickness: 0.2,
  })));

  // ── Structure — 6 columns at grid intersections, 4 beams spanning them ─────
  // `supports` needs a real subject in BOTH directions (§1.2).
  const COLS: Array<[number, number]> = [[0, 0], [6, 0], [12, 0], [0, 8], [6, 8], [12, 8]];
  for (const [x, z] of COLS) {
    seed('column', () => cm.execute(new reg.CreateColumnCommand({
      position: { x, y: 0, z }, levelId: 'L0', width: 0.3, depth: 0.3, height: 3.2,
      rotation: 0, profile: 'rectangular', baseOffset: 0,
    })));
  }
  const BEAMS: Array<[[number, number], [number, number]]> = [
    [[0, 0], [6, 0]], [[6, 0], [12, 0]], [[0, 8], [6, 8]], [[6, 8], [12, 8]],
  ];
  for (const [a, b] of BEAMS) {
    seed('beam', () => cm.execute(new reg.CreateBeamCommand({
      startPoint: { x: a[0], y: 3.2, z: a[1] }, endPoint: { x: b[0], y: 3.2, z: b[1] },
      levelId: 'L0', sectionType: 'rectangular', width: 0.2, depth: 0.4,
    })));
  }

  // ── Circulation — ONE STAIR SPANNING TWO LEVELS ────────────────────────────
  // A single-level stair cannot exercise level connectivity (§1.2), so the
  // L0 -> L1 span is the requirement, not a preference.
  seed('stair', () => cm.execute(new reg.CreateStairCommand({
    id: 'b30-stair-1', baseLevelId: 'L0', topLevelId: 'L1', shape: 'I',
    riserHeight: 3.2 / 18, treadDepth: 0.28, width: 1.0,
    startPosition: { x: 7, y: 0, z: 6 },
    flights: [{ direction: { x: 0, y: 0, z: 1 }, riserCount: 18 }],
  })));
  seed('handrail', () => cm.execute(new reg.CreateHandrailCommand({
    id: 'b30-hr-1', start: { x: 7, z: 6 }, end: { x: 7, z: 8 },
    height: 0.9, thickness: 0.05, levelId: 'L0',
  })));
  seed('plumbing', () => cm.execute(new reg.CreatePlumbingFixtureCommand({
    id: 'b30-pl-1', levelId: 'L0', fixtureType: 'toilet',
    position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0 }, baseOffset: 0,
  })));
  seed('furniture', () => cm.execute(new reg.CreateFurnitureCommand({
    id: 'b30-fu-1', levelId: 'L0', furnitureType: 'bed', position: { x: 2, y: 0, z: 6 },
    rotation: { x: 0, y: 0, z: 0 }, baseOffset: 0,
    width: 1.6, length: 2.0, height: 0.5, material: 'wood',
  })));

  // ── Rooms — 10: six on L0 (the founder's number), four on L1 ───────────────
  // §1.2 requires rooms be DERIVED from wall topology where the detection
  // engine can run, with `manual-boundary` permitted ONLY where derivation
  // refuses — and the fallback recorded per room. This seed composes manual
  // boundaries and RECORDS THAT FACT in `detectionMethod`, so the harness can
  // report how many rooms are derived vs fallback rather than implying all ten
  // came from topology. That count is evidence, not decoration.
  const ROOMS: Array<[string, string, [number, number, number, number]]> = [
    ['hall',     'L0', [0, 0, 6, 3]],
    ['living',   'L0', [6, 0, 12, 5]],
    ['kitchen',  'L0', [0, 3, 6, 5]],
    ['bath',     'L0', [0, 5, 3, 8]],
    ['bed1',     'L0', [3, 5, 6, 8]],
    ['corridor', 'L0', [6, 5, 12, 8]],
    ['landing',  'L1', [6, 5, 12, 8]],
    ['bed2',     'L1', [0, 0, 6, 3]],
    ['bed3',     'L1', [6, 0, 12, 5]],
    ['bath2',    'L1', [0, 3, 6, 8]],
  ];
  seed('room', () => cm.execute(new reg.BatchCreateRoomsCommand(
    ROOMS.map(([name, levelId, [x0, z0, x1, z1]], i) => deserializeRoom({
      id: roomUuid(i + 1), type: 'room', name, levelId,
      boundary: {
        polygon: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }],
        height: 3.2, baseOffset: 0, detectionMethod: 'manual-boundary',
      },
    })),
  )));

  // opening records ride along with the door/window seeds, exactly as seed.ts.
  seedOutcomes['opening'] = seedOutcomes['door'] === 'SEEDED' || seedOutcomes['window'] === 'SEEDED'
    ? 'SEEDED (via door/window CreateWallOpeningCommand)'
    : 'NOT SEEDED (door/window seeding failed)';

  // ── Read back the AUTHORITATIVE stores. Never the plugin-DTO sinks. ────────
  // world.ts's stub ledger: those DTO record objects are write-only by
  // construction and nothing in this harness may read a verdict from them.
  const { doorStore } = await import('@pryzm/geometry-door');
  const { windowStore } = await import('@pryzm/geometry-window');
  const s = world.stores;
  const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
  const counts: Record<string, number> = {
    levels: len(world.bimManager?.getLevels?.()),
    walls: len(s.wallStore?.getAll?.()),
    curtainWalls: len(s.curtainWallStore?.getAll?.()),
    doors: len(doorStore?.getAll?.()),
    windows: len(windowStore?.getAll?.()),
    rooms: len(s.roomStore?.getAll?.()),
    slabs: len(s.slabStore?.getAll?.()),
    columns: len(s.columnStore?.getAll?.()),
    beams: len(s.beamStore?.getAll?.()),
    stairs: len(s.stairStore?.getAll?.()),
    roofs: len(s.roofStore?.getAll?.()),
  };
  counts.openings = counts.doors + counts.windows;

  // Every declared target vs its measured reading. §1.2.1: a world that declares
  // a target and measures 0 makes the gap a FINDING WITH A NAME, where a world
  // that never declared it would let the absence read as "nothing to measure".
  const targetReadings = [
    { family: 'levels', target: BUILDING30_TARGETS.levels, measured: counts.levels },
    { family: 'walls', target: BUILDING30_TARGETS.walls, measured: counts.walls + counts.curtainWalls },
    { family: 'openings', target: BUILDING30_TARGETS.openings, measured: counts.openings },
    { family: 'rooms', target: BUILDING30_TARGETS.rooms, measured: counts.rooms },
    { family: 'slabs', target: BUILDING30_TARGETS.slabs, measured: counts.slabs },
    { family: 'columns', target: BUILDING30_TARGETS.columns, measured: counts.columns },
    { family: 'beams', target: BUILDING30_TARGETS.beams, measured: counts.beams },
    { family: 'stairs', target: BUILDING30_TARGETS.stairs, measured: counts.stairs },
    { family: 'roofs', target: BUILDING30_TARGETS.roofs, measured: counts.roofs },
  ];

  return {
    seedOutcomes,
    counts,
    targetReadings,
    ids: {
      walls: (s.wallStore?.getAll?.() ?? []).map((w: { id: string }) => w.id),
      slabs: slabIds,
      roofs: ['b30-roof-1'],
    },
    roofOverhang: ROOF_OVERHANG,
  };
}
