// ─── GATE · check-generator-program-integrity  (R4 DIMENSIONAL + R5 ADJACENCY)
//
// GENERATIVE-QUALITY-MASTER-TRACKER item **1.7** — *"Wire R4 + R5: the 24 existing
// validators become gates over emitted plans"*, exit condition *"validators run
// over emitted plans, not only over solver candidates"*. §1.2 recorded both cells
// as **"❌ no gate — validators exist, UNWIRED as a gate"**. This is that gate.
//
// ─── THE INVARIANTS ──────────────────────────────────────────────────────────
//   R4 DIMENSIONAL — corridor widths, room minima and maxima, aspect ratios,
//      wall usability and spatial hierarchy hold against the normative database
//      (`validators/dimensional/limits.ts`). Classes G-1, G-2, G-3, G-5, G-6,
//      G-7, G-8, G-10.
//   R5 ADJACENCY  — mandatory adjacencies present, forbidden adjacencies absent,
//      privacy gradient monotone, wet rooms clustered, arrival sequence sane.
//      Classes A-1 … A-8.
//
// ─── WHY IT DID NOT EXIST, WHICH IS THE WHOLE POINT ──────────────────────────
// Not one line of the checking had to be written. `validators/orchestrator.ts`
// runs all 16 slices in one pass and returns a frozen `AggregatedViolationReport`;
// `layout-adapter.ts` converts a DTO into its input; `validate-and-format.ts`
// chains the three layers. Measured at HEAD before this gate landed, EVERY ONE of
// those was imported by nothing but its own `__tests__` file. The one missing hop
// was a projection from a SHIPPED `LayoutOption` into the DTO — which
// `layout-adapter.ts`'s own header defers as *"the wire-in from the live AI
// generation path is a future slice"*. The slice never came, and the machinery
// read as working machinery. That is the authored-but-unwired pattern this
// repository has hit repeatedly, and it is why the tracker's R4/R5 cells said
// "validators exist" and "no gate" in the same sentence.
//
// The hop now lives at `validators/layoutOptionAdapter.ts` (pure L2, so a runtime
// consumer — a banner, a refusal, the modal — can use the same projection this
// gate uses, exactly as `houseLayout/circulationBanner.ts` consumes §CI-0).
//
// ─── IT DRIVES THE ENGINE. IT DOES NOT COUNT ARTEFACTS. ──────────────────────
// Same discipline as `check-generator-circulation.ts`, and for the same reason: a
// gate that counts artefacts is satisfied by producing artefacts. This one imports
// the THREE REAL PRODUCTION ENTRIES and executes them —
//
//   apartmentLayout     → generateDeterministicLayouts(...)   → options[0]
//   houseLayout         → generateHouseLayout(...)            → perStoreyLayout[i]
//   residentialBuilding → orchestrateResidentialBuilding(...) → apartments[i].layout
//
// — and validates the option that ACTUALLY SHIPS. No fixture supplies the value
// under test (C74 §3.4).
//
// ⚠ THE SWEEP IS DECLARED IN TWO GATES. `check-generator-circulation.ts` declares
// the same three sweeps inline, for the reason it records: the SPEC-49 §2
// reproductions are `*.test.ts` files that import `vitest` at module scope and
// cannot be imported by a gate. This gate keeps the SAME case-key format so rows
// in the two ledgers are cross-referenceable by hand — but **nothing enforces that
// the two declarations stay identical**, and that silence is named in the UNPROVEN
// block rather than left to be discovered. Extracting one shared sweep module is
// the fix; it is not undertaken here because it would edit a gate this lane does
// not own.
//
// ─── TWO ADJACENCY GRAPHS, NEVER ONE ─────────────────────────────────────────
// The A-class rules are not all defined over the same edge set, so the orchestrator
// runs TWICE per option and each class is kept from the graph it is defined over
// (`TOPOLOGY_CLASS_GRAPH`, argued in the projection module's header):
//   ACCESS   (realised doors)  A-1 · A-2 · A-4 · A-7 · A-8
//   NUISANCE (shared walls)    A-3 · A-5 · A-6
// This is not a refinement. On the very first probe, running A-4 on the wall graph
// minted a privacy-gradient ERROR against an en-suite whose only DOOR is to its
// master — a false positive that one-graph modelling would have shipped as fact.
// The G-class classes read no edges, so they are taken from the access run and the
// two runs are asserted to agree on them (control C5).
//
// ─── FOUR ARMS ───────────────────────────────────────────────────────────────
//   ARM C · CONTROLS, executed first, every run, watched in BOTH directions
//           (C70 §5.6). If any fails the gate exits 2 and publishes NO verdict.
//           The vocabulary control (C2) is the one that earns its keep: the engine
//           spells the entrance lobby `hall` and the A-class tables spell it
//           `entrance_hall`, so a projection that passed the raw type through
//           would have made A-1…A-5 match NOTHING and report a serene zero. That
//           is SPEC-49 §7's recorded instrument defect in a new costume.
//   ARM A · THE DRIVEN SWEEP — per-class violation counts over shipped options.
//   ARM B · THE HONESTY ARM — rooms whose plan rectangle could NOT be measured,
//           types no rule covers, and duplicate room names (which make the
//           name-keyed projection unsafe). Counted and printed under their own
//           names, NEVER merged into the clean population.
//   ARM D · THE LEDGER, shrink-only, checked in both directions.
//
// ─── THE LEDGER ──────────────────────────────────────────────────────────────
// `generator-program-integrity-ledger.json`, keyed `<CLASS>::<generator>::<case>`
// — never by room name (the engine re-mints those legitimately) and never by a
// bare count (which lets one fix and one new break cancel out, C70 §5.5).
// Shrink-only (C70 §5.3): a case that stops exhibiting a class must LEAVE the
// ledger in the commit that fixes it or this gate exits 3 STALE.
//
// ⛔ THE ONE FORBIDDEN FIX. This ledger is pinned AT its first executed reading
// (C73 §3.4). Do not raise a row, delete a class from `LEDGERED_CLASSES`, widen a
// limit in `limits.ts`, or drop a failing sweep case to go green. A number that
// improves because the instrument got weaker is worse than the red reading it
// replaced.
//
// ─── EXIT CODES ──────────────────────────────────────────────────────────────
// From the ONE shared implementation, `tools/rac-conformance/certification/
// contract.ts`. 0 clean · 1 at the declared level · 2 MISCONFIGURED · 3 ratchet
// exceeded / ledger stale.
//
// Run directly:  npx tsx tools/ga-gate/check-generator-program-integrity.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor } from '../rac-conformance/certification/contract.js';

import { generateDeterministicLayouts } from '../../packages/ai-host/src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import { generateHouseLayout } from '../../packages/ai-host/src/workflows/houseLayout/index.js';
import {
  orchestrateResidentialBuilding,
  type ResidentialBuildingOrchestratorInput,
} from '../../packages/ai-host/src/workflows/residentialBuilding/residentialBuildingOrchestrator.js';
import { polygonAreaM2, type ShellAnalysis } from '../../packages/ai-host/src/workflows/apartmentLayout/shellAnalysis.js';
import type {
  ApartmentConstraints, ApartmentProgram, LayoutOption, ScoringWeights,
} from '../../packages/ai-host/src/workflows/apartmentLayout/types.js';
import {
  projectLayoutOption,
  FRAMEWORK_TYPE_OF,
  TOPOLOGY_CLASS_GRAPH,
} from '../../packages/ai-host/src/workflows/apartmentLayout/validators/layoutOptionAdapter.js';
import { validateApartmentLayout } from '../../packages/ai-host/src/workflows/apartmentLayout/validators/orchestrator.js';
import { toValidationInput } from '../../packages/ai-host/src/workflows/apartmentLayout/validators/layout-adapter.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const LEDGER_PATH = join(HERE, 'generator-program-integrity-ledger.json');

// ─── SUBJECT FLOORS (R5 / L-811 — the empty-seed guard) ──────────────────────
// A violation count over generators that were never driven is "0 problems found"
// over nothing. Below any floor the gate exits 2 MISCONFIGURED.
const MIN_APARTMENT_SUBJECTS = 100;   // sweep is 108 cases
const MIN_HOUSE_SUBJECTS = 20;        // sweep is 24 storeys
const MIN_RESI_SUBJECTS = 25;         // sweep is 34 units
const MIN_SHIPPED_SUBJECTS = 140;     // 165 at the first reading
const MIN_ROOM_SUBJECTS = 700;        // 1464 at the first reading
const MIN_CLASSES_EXERCISED = 6;      // classes seen firing across the sweep
const MIN_CONTROLS = 7;

const CONSTRAINTS: ApartmentConstraints =
  { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights =
  { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

type Generator = 'apartmentLayout' | 'houseLayout' | 'residentialBuilding';

/**
 * The classes this ledger holds. ALL SIXTEEN — R4's eight G-classes and R5's
 * eight A-classes — because the tracker's exit condition for item 1.7 is that the
 * validators run as a gate, and a gate over half of them is not that.
 *
 * ⚠ G-7, G-10 and A-7 read MEASURED daylight/frontage inputs that a `LayoutOption`
 * does not carry, so they SKIP on every option and record a NotMeasuredNote. They
 * stay in this list deliberately: their zero is a NOT-MEASURED zero, it is printed
 * as such in ARM B, and the day the projection can measure frontage they must
 * start ratcheting without anyone remembering to add them.
 */
const LEDGERED_CLASSES: readonly string[] = [
  'G-1', 'G-2', 'G-3', 'G-5', 'G-6', 'G-7', 'G-8', 'G-10',
  'A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6', 'A-7', 'A-8',
];

interface Reading {
  readonly generator: Generator;
  readonly key: string;
  readonly shipped: boolean;
  readonly rooms: number;
  /** classId → count, already selected per `TOPOLOGY_CLASS_GRAPH`. */
  readonly byClass: Readonly<Record<string, number>>;
  /** classId → the room ids that fired it, for ledger reconciliation. */
  readonly roomsByClass: Readonly<Record<string, readonly string[]>>;
  readonly errors: number;
  readonly warnings: number;
  readonly notMeasured: number;
  readonly approximatedRooms: readonly string[];
  readonly unmeasurableRooms: readonly string[];
  readonly unruledTypes: readonly string[];
  readonly duplicateNames: readonly string[];
  readonly hasEntrance: boolean;
  /** G-class counts must be identical on both runs — the edge set cannot touch
   *  them. A disagreement means the projection is not a pure re-edging. */
  readonly gClassAgree: boolean;
}

interface LedgerRow { key: string; generator: string; rooms: string; why: string }
interface Ledger {
  gate: string; note: string; pinnedAt: string;
  /** R4 — dimensional (G-class) cases. */
  dimensionalCases: LedgerRow[];
  /** R5 — adjacency / topology (A-class) cases. */
  topologyCases: LedgerRow[];
}

// ── The reader ───────────────────────────────────────────────────────────────

const EMPTY: Reading = {
  generator: 'apartmentLayout', key: '', shipped: false, rooms: 0,
  byClass: {}, roomsByClass: {}, errors: 0, warnings: 0, notMeasured: 0,
  approximatedRooms: [], unmeasurableRooms: [], unruledTypes: [], duplicateNames: [],
  hasEntrance: false, gClassAgree: true,
};

/**
 * Validate ONE shipped option through the projection + the 16 existing validators.
 *
 * Runs the orchestrator twice (access edges, nuisance edges) and keeps each A-class
 * from the graph it is defined over. G-classes are taken from the access run and
 * cross-checked against the nuisance run.
 */
function read(generator: Generator, key: string, option: LayoutOption | null | undefined): Reading {
  if (!option) return { ...EMPTY, generator, key };
  const p = projectLayoutOption(option);
  const access = validateApartmentLayout(toValidationInput(p.access));
  const nuisance = validateApartmentLayout(toValidationInput(p.nuisance));

  const byClass: Record<string, number> = {};
  const roomsByClass: Record<string, string[]> = {};
  let errors = 0, warnings = 0;

  const take = (
    rep: typeof access,
    keep: (classId: string) => boolean,
  ): void => {
    for (const v of [...rep.dimensional, ...rep.topology]) {
      if (!keep(v.classId)) continue;
      byClass[v.classId] = (byClass[v.classId] ?? 0) + 1;
      const room = 'roomId' in v ? (v as { roomId: string }).roomId : (v as { roomAId: string }).roomAId;
      (roomsByClass[v.classId] ??= []).push(room);
      if (v.severity === 'error') errors++; else warnings++;
    }
  };
  // G-* and the ACCESS-graph A-* come from the access run.
  take(access, (c) => !c.startsWith('A-') || TOPOLOGY_CLASS_GRAPH[c] === 'access');
  // The NUISANCE-graph A-* come from the nuisance run.
  take(nuisance, (c) => c.startsWith('A-') && TOPOLOGY_CLASS_GRAPH[c] === 'nuisance');

  const gOf = (rep: typeof access): string =>
    JSON.stringify(rep.dimensional.map((v) => `${v.classId}:${v.roomId}`).sort());

  return {
    generator, key, shipped: true, rooms: option.rooms?.length ?? 0,
    byClass,
    roomsByClass: Object.fromEntries(
      Object.entries(roomsByClass).map(([k, v]) => [k, [...new Set(v)].sort()]),
    ),
    errors, warnings,
    notMeasured: access.notMeasured.length,
    approximatedRooms: p.approximatedRooms,
    unmeasurableRooms: p.unmeasurableRooms,
    unruledTypes: p.unruledTypes,
    duplicateNames: p.duplicateNames,
    hasEntrance: p.entranceRoomId !== undefined,
    gClassAgree: gOf(access) === gOf(nuisance),
  };
}

// ── ARM A · the three committed sweeps, re-declared (SPEC-49 §2) ─────────────

const rect = (w: number, d: number): Array<{ x: number; z: number }> =>
  [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];

function mkShell(poly: Array<{ x: number; z: number }>): ShellAnalysis {
  const xs = poly.map((p) => p.x), zs = poly.map((p) => p.z);
  return {
    netAreaM2: polygonAreaM2(poly),
    widthM: Math.max(...xs) - Math.min(...xs),
    depthM: Math.max(...zs) - Math.min(...zs),
    perimeter: poly, faces: [],
  };
}

/** Deterministic convex-quad plate with an optional shear (m). No Math.random. */
function plate(width: number, depth: number, skew: number): Array<{ x: number; z: number }> {
  return [
    { x: -skew, z: skew * 0.5 }, { x: width + skew * 0.5, z: -skew },
    { x: width - skew, z: depth + skew * 0.6 }, { x: skew * 0.4, z: depth - skew * 0.3 },
  ];
}

const APARTMENT_PROGRAMS: ApartmentProgram[] = [
  { bedrooms: 1, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true,  livingRoom: true, entranceHall: true },
  { bedrooms: 2, bathrooms: 1, masterEnSuite: true,  openPlanKitchenDining: true,  livingRoom: true, entranceHall: true },
  { bedrooms: 3, bathrooms: 2, masterEnSuite: true,  openPlanKitchenDining: false, livingRoom: true, entranceHall: true },
  { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true,  livingRoom: true, entranceHall: false },
];

function sweepApartments(): Reading[] {
  const aspects = [1.0, 1.35, 1.75];
  const skews = [0, 0.8, 1.8];
  const areaScales = [0.92, 1.05, 1.18];
  const out: Reading[] = [];
  APARTMENT_PROGRAMS.forEach((prog, pi) => {
    for (const a of aspects) for (const sk of skews) for (const scale of areaScales) {
      const area = (58 + prog.bedrooms * 34) * scale;
      const w = Math.sqrt(area / a);
      const shell: ShellAnalysis = {
        netAreaM2: area, widthM: w, depthM: w * a, perimeter: plate(w, w * a, sk), faces: [],
      };
      const key = `p${pi}-b${prog.bedrooms}-a${a}-s${sk}-x${scale}`;
      let opts: LayoutOption[] = [];
      try { opts = generateDeterministicLayouts(shell, prog, CONSTRAINTS, WEIGHTS, 1); } catch { opts = []; }
      out.push(read('apartmentLayout', key, opts[0] ?? null));
    }
  });
  return out;
}

function sweepHouses(): Reading[] {
  const plates: Array<[number, number]> = [[12, 10], [17.491, 13.416], [10, 8], [14, 11]];
  const programs: ApartmentProgram[] = [
    { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
    { bedrooms: 3, bathrooms: 2, masterEnSuite: true,  openPlanKitchenDining: true, livingRoom: true, entranceHall: true },
  ];
  const out: Reading[] = [];
  for (const [w, d] of plates) for (const prog of programs) for (const sc of [1, 2]) {
    const label = `${w}x${d}-b${prog.bedrooms}-s${sc}`;
    let res: ReturnType<typeof generateHouseLayout> | null = null;
    try { res = generateHouseLayout(mkShell(rect(w, d)), prog, CONSTRAINTS, WEIGHTS, { storeyCount: sc }); }
    catch { res = null; }
    if (!res) { for (let i = 0; i < sc; i++) out.push(read('houseLayout', `${label}/F${i}`, null)); continue; }
    res.perStoreyLayout.forEach((opt, i) => out.push(read('houseLayout', `${label}/F${i}`, opt)));
  }
  return out;
}

const RESI_INPUTS: Array<[string, ResidentialBuildingOrchestratorInput]> = [
  ['founder-38x43', {
    footprint: rect(38, 43), upperLevels: 1,
    coreWidthM: 6, coreDepthM: 4, corridorWidthM: 1.5,
    minApartmentAreaM2: 60, maxApartmentAreaM2: 100,
    typologies: { T1: false, T2: true, T3: true, T4: false },
  }],
  ['slab-45x18', {
    footprint: rect(45, 18), upperLevels: 2,
    coreWidthM: 6, coreDepthM: 4, corridorWidthM: 1.5,
    minApartmentAreaM2: 55, maxApartmentAreaM2: 95,
    typologies: { T1: true, T2: true, T3: false, T4: false },
  }],
  ['block-30x30', {
    footprint: rect(30, 30), upperLevels: 1,
    coreWidthM: 6, coreDepthM: 5, corridorWidthM: 1.4,
    minApartmentAreaM2: 65, maxApartmentAreaM2: 110,
    typologies: { T1: false, T2: true, T3: true, T4: true },
  }],
];

function sweepResidential(): Reading[] {
  const out: Reading[] = [];
  for (const [label, input] of RESI_INPUTS) {
    let r: ReturnType<typeof orchestrateResidentialBuilding> | null = null;
    try { r = orchestrateResidentialBuilding(input); } catch { r = null; }
    if (!r || r.status !== 'ok') continue;
    for (const lvl of r.perLevelApartments) {
      lvl.apartments.forEach((apt, i) => {
        const key = `${label}/L${lvl.levelIndex}/A${i}`;
        out.push(read('residentialBuilding', key, apt.status === 'ok' ? apt.layout : null));
      });
    }
  }
  return out;
}

// ── ARM C · controls, both directions, executed in-process every run ─────────

function cloneOption(o: LayoutOption): LayoutOption {
  return { ...o, rooms: o.rooms.map((r) => ({ ...r, adjacentTo: [...r.adjacentTo], doorAdjacentTo: [...(r.doorAdjacentTo ?? [])] })) };
}

function runControls(): { ok: boolean; passed: number; lines: string[] } {
  const out: string[] = [];
  let ok = true, passed = 0;
  const check = (name: string, pass: boolean, detail: string): void => {
    out.push(`  ${pass ? '✓' : '❌'} ${name} — ${detail}`);
    if (pass) passed++; else ok = false;
  };

  // A REAL engine-emitted option is the substrate — never a hand-built literal.
  // A fixture built from the gate's own idea of the shape cannot catch a field
  // the ENGINE spells differently, which is the defect SPEC-49 §7 records.
  const shell: ShellAnalysis = {
    netAreaM2: 92, widthM: 8.3, depthM: 11.084, perimeter: rect(8.3, 11.084), faces: [],
  };
  let base: LayoutOption | null = null;
  try {
    base = generateDeterministicLayouts(shell, APARTMENT_PROGRAMS[1]!, CONSTRAINTS, WEIGHTS, 1)[0] ?? null;
  } catch { base = null; }
  if (!base) {
    check('C0 substrate', false, 'the control substrate could not be generated — no verdict can be published');
    return { ok, passed, lines: out };
  }
  const baseProj = projectLayoutOption(base);
  check('C0 substrate', true,
    `a REAL engine option: ${base.rooms.length} rooms, ${baseProj.access.edges!.length} door edge(s), ${baseProj.nuisance.edges!.length} wall edge(s)`);

  // C1 — THE PROJECTION MEASURES, IT DOES NOT DEFAULT. Every emitted room must
  //      resolve a real plan rectangle from its polygon, and the three daylight
  //      inputs must stay ABSENT (undefined = NOT MEASURED, never 0 — §L-909(b)).
  const r0 = baseProj.access.rooms[0]!;
  const dimsOk = baseProj.measuredRooms.length === base.rooms.length
    && baseProj.unmeasurableRooms.length === 0
    && r0.widthM > 0 && r0.lengthM > 0;
  const absentOk = r0.externalFrontageM === undefined
    && r0.hasExteriorEdge === undefined
    && r0.glazedAreaM2 === undefined;
  check('C1 measured dimensions · absent daylight inputs stay ABSENT',
    dimsOk && absentOk,
    `measured ${baseProj.measuredRooms.length}/${base.rooms.length} room rect(s), unmeasurable ${baseProj.unmeasurableRooms.length} (want 0) · frontage/exterior/glazed all undefined=${absentOk} (want true — a defaulted 0 mints violations out of values nobody measured)`);

  // C2 — THE VOCABULARY BRIDGE, WATCHED IN BOTH DIRECTIONS ON A RULE THAT KEYS
  //      ON A RENAMED TYPE. This is the control that would have caught a serene,
  //      entirely false all-clear: the A-class tables key on `master_bedroom` /
  //      `entrance_hall` / `living_room`, the engine emits `master` / `hall` /
  //      `living`, so an unmapped projection makes A-1…A-5 match NOTHING.
  //
  //      ⚠ It is NOT enough to compare total violation counts on the clean
  //      substrate — the first version of this control did exactly that and
  //      read 5 vs 5, because the classes that happened to fire there (A-4, A-6,
  //      A-8) key on `ensuite` / `bathroom` / `kitchen`, which are spelled the
  //      same in both vocabularies. It passed the mapping through a hole. The
  //      control therefore plants a defect against rule A-1 #1
  //      (`master_bedroom` ↔ `ensuite`, if-toType-exists) — a rule whose fromType
  //      is one of the RENAMED four — and requires it to fire mapped and to be
  //      INVISIBLE unmapped.
  const engineTypes = new Set(base.rooms.map((r) => r.type as string));
  const renamed = [...engineTypes].filter((t) => FRAMEWORK_TYPE_OF[t as keyof typeof FRAMEWORK_TYPE_OF] !== t);
  const total = [...engineTypes].every((t) => t in FRAMEWORK_TYPE_OF);
  const master = base.rooms.find((r) => r.type === 'master');
  const ensuite = base.rooms.find((r) => r.type === 'ensuite');
  let a1Mapped = -1, a1Raw = -1;
  if (master && ensuite) {
    const cut = cloneOption(base);
    cut.rooms = cut.rooms.map((r) =>
      r.name === master.name ? { ...r, doorAdjacentTo: (r.doorAdjacentTo ?? []).filter((n) => n !== ensuite.name) }
        : r.name === ensuite.name ? { ...r, doorAdjacentTo: (r.doorAdjacentTo ?? []).filter((n) => n !== master.name) } : r);
    const cutProj = projectLayoutOption(cut);
    const a1Of = (dto: typeof cutProj.access): number =>
      validateApartmentLayout(toValidationInput(dto)).topology.filter((v) => v.classId === 'A-1').length;
    a1Mapped = a1Of(cutProj.access);
    // The SAME planted option, projected with the engine's RAW spellings — what
    // this gate would have measured had the bridge been forgotten.
    a1Raw = a1Of({
      ...cutProj.access,
      rooms: cutProj.access.rooms.map((r, i) => ({ ...r, type: cut.rooms[i]!.type as string })),
    });
  }
  check('C2 vocabulary bridge · both directions, on a rule keyed to a RENAMED type',
    renamed.length > 0 && total && a1Mapped > 0 && a1Raw === 0,
    `engine emits ${renamed.length} type(s) the A-class tables spell differently (${renamed.join(',') || '∅'}), mapping total over the emitted union=${total} · master↔ensuite door cut → A-1 MAPPED=${a1Mapped} (want > 0) vs A-1 UNMAPPED=${a1Raw} (want exactly 0 — an unmapped projection reports a false zero on a real defect)`);

  // C3 — PLANTED A-3: a forbidden adjacency introduced into the WALL graph must
  //      fire (watched RED), and the clean substrate must not (watched GREEN).
  const cleanA3 = (validateApartmentLayout(toValidationInput(baseProj.nuisance))
    .topology.filter((v) => v.classId === 'A-3')).length;
  const wc = base.rooms.find((r) => r.type === 'kitchen');
  const bed = base.rooms.find((r) => r.type === 'bedroom' || r.type === 'master');
  let plantedA3 = -1;
  if (wc && bed) {
    const planted = cloneOption(base);
    planted.rooms = planted.rooms.map((r) =>
      r.name === wc.name ? { ...r, adjacentTo: [...new Set([...r.adjacentTo, bed.name])] }
        : r.name === bed.name ? { ...r, adjacentTo: [...new Set([...r.adjacentTo, wc.name])] } : r);
    plantedA3 = validateApartmentLayout(toValidationInput(projectLayoutOption(planted).nuisance))
      .topology.filter((v) => v.classId === 'A-3').length;
  }
  check('C3 planted forbidden adjacency (A-3) · both directions',
    cleanA3 === 0 && plantedA3 > 0,
    `clean substrate A-3=${cleanA3} (want 0) · kitchen↔bedroom wall planted → A-3=${plantedA3} (want > 0)`);

  // C4 — PLANTED G-CLASS: a room grown past its programmatic area ceiling must
  //      fire G-1 (watched RED) through the REAL limits table, not a local copy.
  const victim = base.rooms.find((r) => r.type === 'bathroom') ?? base.rooms[0]!;
  const fat = cloneOption(base);
  fat.rooms = fat.rooms.map((r) => (r.name === victim.name ? { ...r, area: 999 } : r));
  const fatG1 = validateApartmentLayout(toValidationInput(projectLayoutOption(fat).access))
    .dimensional.filter((v) => v.classId === 'G-1' && v.roomId === victim.name).length;
  check('C4 planted dimensional defect (G-1) · watched RED',
    fatG1 > 0,
    `"${victim.name}" grown to 999 m² → G-1 on that room = ${fatG1} (want > 0; the ceiling comes from validators/dimensional/limits.ts, not from this gate)`);

  // C5 — THE TWO RUNS DIFFER ONLY IN EDGES. G-class validators read no edge set,
  //      so their findings must be IDENTICAL across the access and nuisance runs.
  //      A difference would mean the projection changes rooms between graphs and
  //      the per-class selection is unsound.
  const gA = JSON.stringify(validateApartmentLayout(toValidationInput(baseProj.access))
    .dimensional.map((v) => `${v.classId}:${v.roomId}`).sort());
  const gN = JSON.stringify(validateApartmentLayout(toValidationInput(baseProj.nuisance))
    .dimensional.map((v) => `${v.classId}:${v.roomId}`).sort());
  check('C5 access/nuisance differ ONLY in edges',
    gA === gN,
    `G-class findings identical across both runs=${gA === gN} (want true — the two DTOs share one rooms array by construction)`);

  // C6 — THE TWO GRAPHS ARE NOT THE SAME GRAPH. If door edges and wall edges were
  //      identical, the whole two-run design would be ceremony and the A-4 false
  //      positive it prevents would not be preventable. Watched by identity.
  const doorE = baseProj.access.edges!.length, wallE = baseProj.nuisance.edges!.length;
  check('C6 door graph ⊊ wall graph',
    doorE > 0 && wallE > doorE,
    `door edges=${doorE}, wall edges=${wallE} (want 0 < door < wall — every door implies a shared wall, not the reverse)`);

  // C7 — DUPLICATE NAMES ARE DETECTED, NOT TRUSTED AWAY. The projection keys on
  //      the display name because LayoutRoom carries no id; §DUP-NAME-UNIQUE is a
  //      GUARD, not a fix (SPEC-49 §7). Watched in both directions.
  const dup = cloneOption(base);
  dup.rooms = dup.rooms.map((r, i) => (i === 1 ? { ...r, name: dup.rooms[0]!.name } : r));
  const dupNames = projectLayoutOption(dup).duplicateNames;
  check('C7 duplicate room names detected · both directions',
    baseProj.duplicateNames.length === 0 && dupNames.length === 1,
    `clean substrate duplicates=${baseProj.duplicateNames.length} (want 0) · planted duplicate → ${dupNames.length} reported (want 1 — a name-keyed projection over duplicates is UNSAFE and must say so)`);

  return { ok, passed, lines: out };
}

// ── main ─────────────────────────────────────────────────────────────────────

function pct(n: number, d: number): string {
  return `${((n / Math.max(1, d)) * 100).toFixed(0)}%`;
}

function main(): number {
  const lines: string[] = [];

  lines.push('ARM C — CONTROLS (executed this run, watched in BOTH directions · C70 §5.6, L-716):');
  const ctl = runControls();
  lines.push(...ctl.lines);
  if (!ctl.ok || ctl.passed < MIN_CONTROLS) {
    console.log('\n── check-generator-program-integrity ─────────────────────');
    for (const l of lines) console.log('   ' + l);
    console.log(`   → [2] MISCONFIGURED — controls proven ${ctl.passed}/${MIN_CONTROLS}. A reader never watched firing publishes no verdict. NEVER absorbable as debt.`);
    process.exit(2);
  }
  lines.push('');

  const t0 = Date.now();
  const readings: Reading[] = [...sweepApartments(), ...sweepHouses(), ...sweepResidential()];
  const elapsedS = ((Date.now() - t0) / 1000).toFixed(1);

  const findings: string[] = [];
  /** finding key → the room(s) that fired it, so a ledger row is reconcilable
   *  against this run without re-executing the sweep. */
  const roomsOfFinding = new Map<string, string>();
  const byGen: Generator[] = ['apartmentLayout', 'houseLayout', 'residentialBuilding'];

  lines.push(`ARM A — THE DRIVEN SWEEP: ${readings.length} generator run(s) executed in ${elapsedS}s against the REAL production entries, each shipped option validated through the 16 EXISTING validator slices.`);

  let totalRooms = 0, totalShipped = 0;
  const classesSeen = new Set<string>();
  for (const gen of byGen) {
    const rs = readings.filter((r) => r.generator === gen);
    const shipped = rs.filter((r) => r.shipped);
    const rooms = shipped.reduce((n, r) => n + r.rooms, 0);
    totalRooms += rooms; totalShipped += shipped.length;

    const tally: Record<string, number> = {};
    let errs = 0, warns = 0;
    for (const r of shipped) {
      errs += r.errors; warns += r.warnings;
      for (const [c, n] of Object.entries(r.byClass)) {
        tally[c] = (tally[c] ?? 0) + n;
        classesSeen.add(c);
      }
    }

    lines.push('');
    lines.push(`  ${gen}`);
    lines.push(`    SUBJECTS: ${rs.length} case(s) driven · ${shipped.length} shipped an option · ${rooms} room(s) validated`);
    lines.push(`    ⛔ R4 DIMENSIONAL (G-class) — cases exhibiting each class, of ${shipped.length} shipped:`);
    for (const c of LEDGERED_CLASSES.filter((c) => c.startsWith('G-'))) {
      const cases = shipped.filter((r) => (r.byClass[c] ?? 0) > 0);
      lines.push(`         ${c}: ${cases.length}/${shipped.length} (${pct(cases.length, shipped.length)}) case(s), ${tally[c] ?? 0} violation(s)`);
    }
    lines.push(`    ⛔ R5 ADJACENCY (A-class) — cases exhibiting each class, of ${shipped.length} shipped:`);
    for (const c of LEDGERED_CLASSES.filter((c) => c.startsWith('A-'))) {
      const cases = shipped.filter((r) => (r.byClass[c] ?? 0) > 0);
      lines.push(`         ${c} [${TOPOLOGY_CLASS_GRAPH[c] ?? '—'} graph]: ${cases.length}/${shipped.length} (${pct(cases.length, shipped.length)}) case(s), ${tally[c] ?? 0} violation(s)`);
    }
    lines.push(`    severity split across this generator: ${errs} error(s) · ${warns} warning(s) — printed apart, never blended into one "violations" number (C75 §1.2)`);

    for (const r of rs) {
      if (!r.shipped) continue;
      for (const c of LEDGERED_CLASSES) {
        if ((r.byClass[c] ?? 0) > 0) {
          const key = `${c}::${gen}::${r.key}`;
          findings.push(key);
          roomsOfFinding.set(key, (r.roomsByClass[c] ?? []).join(', '));
        }
      }
      if (r.duplicateNames.length > 0) {
        const key = `DUPNAME::${gen}::${r.key}`;
        findings.push(key);
        roomsOfFinding.set(key, r.duplicateNames.join(', '));
      }
      if (!r.gClassAgree) findings.push(`GRAPH-LEAK::${gen}::${r.key}`);
    }
  }

  // ARM B — the honesty arm.
  const shippedAll = readings.filter((r) => r.shipped);
  const approx = shippedAll.filter((r) => r.approximatedRooms.length > 0);
  const unmeas = shippedAll.filter((r) => r.unmeasurableRooms.length > 0);
  const noEntrance = shippedAll.filter((r) => !r.hasEntrance);
  const unruled = new Set<string>();
  for (const r of shippedAll) for (const t of r.unruledTypes) unruled.add(t);
  const notMeasuredTotal = shippedAll.reduce((n, r) => n + r.notMeasured, 0);

  lines.push('');
  lines.push('ARM B — WHAT THE PROJECTION COULD NOT MEASURE. Counted and printed under its own name; never merged into the clean population, because a room nobody could measure is not a room that passed (C70 §2.2).');
  lines.push(`  rooms whose plan rectangle is APPROXIMATED (sheared polygon; the oriented bbox OVER-states width and length): ${approx.reduce((n, r) => n + r.approximatedRooms.length, 0)} room(s) across ${approx.length} case(s)`);
  lines.push(`  rooms with NO polygon at all (dimensions fall back to an area-square): ${unmeas.reduce((n, r) => n + r.unmeasurableRooms.length, 0)} room(s) across ${unmeas.length} case(s)`);
  lines.push(`  NOT-MEASURED notes raised by G-7 / G-10 / A-7 (frontage, glazing, exterior edge — a LayoutOption carries windowCount, and a COUNT is not an AREA): ${notMeasuredTotal}`);
  lines.push(`  cases with no single entrance hall, so A-8 sequencing SKIPPED rather than guessing its BFS root: ${noEntrance.length}/${shippedAll.length}`);
  lines.push(`  room types no rule table and no limits row covers (every class skips them): ${[...unruled].sort().join(', ') || '∅'}`);

  findings.sort();

  // ARM D — the ledger, both directions.
  let ledger: Ledger | null = null;
  try { ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger; } catch { ledger = null; }
  const declaredKeys = new Set([
    ...(ledger?.dimensionalCases ?? []),
    ...(ledger?.topologyCases ?? []),
  ].map((r) => r.key));
  const measuredKeys = new Set(findings);
  const stale = [...declaredKeys].filter((k) => !measuredKeys.has(k)).sort();
  const declaredStillMeasured = [...declaredKeys].filter((k) => measuredKeys.has(k)).length;

  lines.push('');
  lines.push(`FINDINGS: ${findings.length} against a NAMED ledger of ${declaredKeys.size} (${declaredStillMeasured} still measured).`);
  const unledgered = findings.filter((f) => !declaredKeys.has(f));
  lines.push(`  ⛔ UNLEDGERED: ${unledgered.length}`);
  for (const f of unledgered) lines.push(`     ⛔ ${f} → ${roomsOfFinding.get(f) ?? '(no room detail)'}`);
  for (const k of stale) {
    lines.push(`  ⚠ STALE LEDGER ROW: "${k}" is declared but is no longer measured — strike it in the commit that pays it (C70 §5.4).`);
  }

  lines.push('');
  lines.push('UNPROVEN — named, never green:');
  lines.push('  ◌ THE COUNT IS NOT THE QUALITY. This gate proves the 16 validators RUN over emitted plans and that their');
  lines.push('    verdict is now visible. It does NOT prove the rules are the right rules, nor that a plan with zero');
  lines.push('    findings is architecturally good. R4/R5 moving off "no gate" is an INSTRUMENTATION fact, not an');
  lines.push('    OUTPUT-QUALITY one, and the tracker keeps those axes apart deliberately (§0).');
  lines.push('  ◌ G-7 (frontage), G-10 (lighting) and A-7 (frontage-topology) SKIP on EVERY option, because a LayoutOption');
  lines.push('    carries no measured frontage, glazed area or exterior-edge flag. Their zero is a NOT-MEASURED zero. They');
  lines.push('    are ledgered classes with no rows, so the day the projection can measure frontage they ratchet without');
  lines.push('    anyone remembering to add them — but today they cover nothing.');
  lines.push('  ◌ G-5 (wall usability) runs on the CONSERVATIVE fallback `longestUsableWallM = lengthM` — the whole longest');
  lines.push('    wall assumed unbroken by any door or window. That can only UNDER-report. Its zero is a floor, not a reading.');
  lines.push('  ◌ `stair` and `open_plan` reach the validators and match no rule table and no limits row, so every class');
  lines.push('    skips them silently. A doorless stair is CI-2\'s subject (check-generator-circulation); a stair with absurd');
  lines.push('    proportions is nobody\'s.');
  lines.push('  ◌ The projection keys rooms by DISPLAY NAME, because `LayoutRoom` carries no id. §DUP-NAME-UNIQUE makes that');
  lines.push('    safe today and SPEC-49 §7 records it as a GUARD, not a fix. DUPNAME is a finding class here for that reason.');
  lines.push('  ◌ The three sweeps are DECLARED IN TWO GATES (here and check-generator-circulation.ts) because the SPEC-49 §2');
  lines.push('    reproductions import vitest at module scope and cannot be imported. Nothing enforces that the two');
  lines.push('    declarations stay identical; if they drift, the two ledgers stop being cross-referenceable and neither');
  lines.push('    gate notices. Extracting one shared sweep module is the fix and is not done here.');
  lines.push('  ◌ Synthetic plates only — convex quads and founder-scale rectangles. SPEC-49 §6 CI-5-INSTRUMENT (real user');
  lines.push('    shells) still does not exist, so a green reading here is NOT "the generators are sound in production".');

  const floors: Floor[] = [
    { what: 'apartmentLayout cases driven', measured: readings.filter((r) => r.generator === 'apartmentLayout').length, min: MIN_APARTMENT_SUBJECTS },
    { what: 'houseLayout storeys driven', measured: readings.filter((r) => r.generator === 'houseLayout').length, min: MIN_HOUSE_SUBJECTS },
    { what: 'residentialBuilding units driven', measured: readings.filter((r) => r.generator === 'residentialBuilding').length, min: MIN_RESI_SUBJECTS },
    { what: 'options that SHIPPED and were validated', measured: totalShipped, min: MIN_SHIPPED_SUBJECTS },
    { what: 'rooms validated', measured: totalRooms, min: MIN_ROOM_SUBJECTS },
    { what: 'validator classes seen firing across the sweep', measured: classesSeen.size, min: MIN_CLASSES_EXERCISED },
    { what: 'controls proven in-run (both directions)', measured: ctl.passed, min: MIN_CONTROLS },
  ];

  return reportGate({
    gate: 'check-generator-program-integrity (R4 DIMENSIONAL + R5 ADJACENCY · tracker 1.7)',
    floors,
    lines,
    findings: findings.length,
    declared: declaredStillMeasured,
    findingNames: findings,
    stale,
  });
}

process.exit(main());
