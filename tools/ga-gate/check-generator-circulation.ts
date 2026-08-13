// ─── GATE · check-generator-circulation  (SPEC-49 CI-2 · C70 §5 · C70 §7) ────
//
// THE INVARIANT (SPEC-49 §1, CI-2 — "every room has a door"):
//   **Every room a generator SHIPS has at least one realised opening.**
//   Circulation rooms INCLUDED — a doorless `Stair` or `Corridor` is the most
//   severe form, and SPEC-49 §2 measured exactly that on `17.491x13.416-b3-s2/F1`.
//
// ─── WHY THIS GATE EXISTS ────────────────────────────────────────────────────
// SPEC-49 §3 item 6, verified by enumeration of `tools/ga-gate/*.ts`: not one of
// the 56 gates at HEAD read `doorAdjacentTo`, read `unreachableHabitableRoomIds`,
// or DROVE any generator. **Generator output quality was entirely ungated in CI.**
// The detection was never missing — `enumerate.ts` computes every one of these
// rules correctly at candidate level — the REFUSAL was. §TOPO-HARD-REJECT-ALL
// ships the least-bad INVALID candidate by design, and until commit `1559275e`
// (CI-0) the verdict was DROPPED at the emit boundary, so a caller that WANTED to
// refuse could not see that the plan was broken.
//
// This gate is CI-2 of SPEC-49 §4: the cheapest real gate on that list, needing no
// product decision. It does not refuse anything at runtime. It pins the measured
// doorless rate and lets it move in one direction only.
//
// ─── IT DRIVES THE ENGINE. IT DOES NOT COUNT ARTEFACTS. ──────────────────────
// A gate that counts ARTEFACTS can be satisfied by producing artefacts —
// `check-move-propagation` went green because somebody authored a consumer file
// wired into nothing. So this gate imports the THREE REAL PRODUCTION ENTRIES and
// executes them:
//
//   apartmentLayout    → generateDeterministicLayouts(...)          → options[0]
//   houseLayout        → generateHouseLayout(...)                   → perStoreyLayout[i]
//   residentialBuilding→ orchestrateResidentialBuilding(...)        → apartments[i].layout
//
// and reads the option that ACTUALLY SHIPS. No fixture supplies the value under
// test (C74 §3.4). The existence of a field, a file or a test proves nothing here.
//
// ─── FOUR ARMS ───────────────────────────────────────────────────────────────
//   ARM C · CONTROLS, executed every run, WATCHED IN BOTH DIRECTIONS (C70 §5.6).
//           Runs FIRST; any control failure exits 2 MISCONFIGURED and NO verdict
//           is published. Six controls, and the reason there are six rather than
//           two is SPEC-49 §7's second recorded instrument defect: a sibling probe
//           reported a clean 0/288 on its first run and the negative control caught
//           it — the struct field was `{minX,minZ}` and the probe passed `{x0,z0}`,
//           which **Vitest does not typecheck in test files**. Every reader in this
//           gate is therefore watched firing on a PLANTED defect before its silence
//           is allowed to mean anything.
//
//   ARM A · THE DRIVEN SWEEP. The three committed sweeps of SPEC-49 §2,
//           re-declared here (they cannot be imported: the reproductions are
//           `*.test.ts` files that import `vitest` at module scope). Per shipped
//           option the gate reads `LayoutOption.circulation` — the CI-0 block.
//
//   ARM B · VERDICT-vs-ARTEFACT AGREEMENT. The carried verdict is computed
//           PRE-rotation inside `runDeterministicLayout`, and house/residential
//           put the option through further orchestration afterwards. So the gate
//           ALSO derives the doorless set INDEPENDENTLY from the shipped
//           `option.rooms[].doorAdjacentTo` and requires the two to agree. A
//           disagreement is a FINDING in its own right: it means the verdict a
//           banner would display no longer describes the plan the user got.
//
//   ARM D · THE LEDGER, shrink-only and checked in BOTH directions.
//
// ─── ⚠ `circulation` IS OPTIONAL, AND `undefined` MEANS NOT MEASURED ─────────
// C70 §2.2. `LayoutOption.circulation` is optional for back-compat with AI-produced
// and hand-built options that never went through `enumerate.ts`. A gate that read
// `undefined` as a pass would be the exact defect this whole programme exists to
// close, so an absent verdict on a SHIPPED option is its own finding class
// (`UNMEASURED::…`) and the count of options CARRYING a verdict is a subject floor.
//
// ─── ⚠ THREE ROOM SETS, THREE QUESTIONS, NEVER MERGED (C75 §1.2) ────────────
// The CI-0 block carries three sets and they are NOT the same fact:
//   • `unreachableRoomIds`           — SEALED by BFS from the entrance. A room here
//                                      may HAVE a door, if every route to it is sealed.
//   • `unroutedToCirculationRoomIds` — no door ONTO CIRCULATION (served-through).
//   • `doorlessRoomIds`              — NO DOOR AT ALL.
// THIS GATE'S LEDGERED SUBJECT IS THE THIRD — the one the founder saw in the
// browser. The other two are MEASURED AND PRINTED under their own names on every
// run, and are deliberately NOT ledgered here: they are SPEC-49's CI-1, which needs
// a product decision this gate must not pre-empt. Merging them would produce one
// blended number true of nothing (SPEC-49 §2, fact 1).
//
// ─── THE LEDGER ─────────────────────────────────────────────────────────────
// `generator-circulation-ledger.json`, keyed by `<CLASS>::<generator>::<sweep-case>`
// — never by room name, which the engine may legitimately re-mint, and never by a
// bare count, which lets one fix and one new break cancel out. Shrink-only (C70
// §5.3): a case that starts shipping doors must LEAVE the ledger in the commit that
// fixes it, or this gate exits 3 STALE. An unledgered finding also exits 3, because
// `declared` below counts only ledger rows that are STILL MEASURED — a count-only
// comparison would let a swap read as no change.
//
// Sweep-case keys are the gate's own (`p0-b1-a1-s0-x0.92`), not the reproduction
// tests' labels, because those collide: two of the four apartment programs both
// carry `bedrooms: 2`, so the test's `b2-…` label names two different runs.
//
// ─── EXIT CODES ─────────────────────────────────────────────────────────────
// From the ONE shared implementation, `tools/rac-conformance/certification/
// contract.ts`. Not hand-rolled here. 0 clean · 1 at the declared level ·
// 2 MISCONFIGURED · 3 ratchet exceeded / ledger stale.
//
// Run directly:  npx tsx tools/ga-gate/check-generator-circulation.ts
//
// ─── WHAT THIS GATE DOES NOT PROVE — named, never green ─────────────────────
// See the UNPROVEN block printed at the end of every run.

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
  ApartmentConstraints, ApartmentProgram, LayoutOption, LayoutRoom, ScoringWeights,
} from '../../packages/ai-host/src/workflows/apartmentLayout/types.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const LEDGER_PATH = join(HERE, 'generator-circulation-ledger.json');

// ─── SUBJECT FLOORS (R5 / L-811 — the empty-seed guard) ──────────────────────
// A doorless count over generators that were never driven is the empty-seed lie:
// "0 problems found" over nothing. Every constant below is compared against the
// measured subject before any verdict is published; below any of them the gate
// exits 2 MISCONFIGURED via contract.ts's floor short-circuit (and the control
// arm's own process.exit(2) path). Values sit just under the committed sweep
// sizes (108 / 24 / 34), so a truncated sweep cannot read as a clean one.
const MIN_APARTMENT_SUBJECTS = 100;   // sweep is 108 cases
const MIN_HOUSE_SUBJECTS = 20;        // sweep is 24 storeys
const MIN_RESI_SUBJECTS = 25;         // sweep is 34 units
const MIN_SHIPPED_SUBJECTS = 140;     // 164 at the first reading
const MIN_MEASURED_SUBJECTS = 140;    // options CARRYING a CI-0 verdict (C70 §2.2)
const MIN_ROOM_SUBJECTS = 700;        // 1460 at the first reading
const MIN_CONTROLS = 7;               // all seven arms, both directions

const CONSTRAINTS: ApartmentConstraints =
  { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights =
  { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

type Generator = 'apartmentLayout' | 'houseLayout' | 'residentialBuilding';

interface Reading {
  readonly generator: Generator;
  readonly key: string;               // sweep case, unique within its generator
  readonly rooms: number;
  /** false ⇒ the generator refused / produced nothing for this case. Not a finding. */
  readonly shipped: boolean;
  /** false ⇒ SHIPPED but `option.circulation` is undefined. NOT MEASURED, never sound. */
  readonly measured: boolean;
  /** From the CARRIED CI-0 verdict — the headline subject. */
  readonly carriedDoorless: readonly string[];
  /** Derived INDEPENDENTLY from the shipped artefact's own door graph. */
  readonly independentDoorless: readonly string[];
  /** Carried, counted under its own name. NOT this gate's ledgered subject (CI-1). */
  readonly unreachable: readonly string[];
  /** Carried, counted under its own name. NOT this gate's ledgered subject (CI-1). */
  readonly unrouted: readonly string[];
  readonly hardValid: boolean;
  readonly hardFailedRules: readonly string[];
  readonly corridorStairGap: boolean;
  readonly corridorHallGap: boolean;
}

interface LedgerRow { key: string; generator: string; rooms: string; why: string }
interface Ledger { gate: string; note: string; pinnedAt: string; doorlessCases: LedgerRow[] }

// ── The two readers. Both are watched firing before either is trusted. ───────

/**
 * READER 1 — the CARRIED CI-0 verdict (`LayoutOption.circulation.doorlessRoomNames`).
 * This is the field a refusal or a banner would consume, so it is the headline.
 */
function carriedDoorlessOf(option: LayoutOption): readonly string[] | null {
  const c = option.circulation;
  if (!c) return null;                       // NOT MEASURED. Never "sound" (C70 §2.2).
  return [...c.doorlessRoomNames].sort();
}

/**
 * READER 2 — derived from the SHIPPED ARTEFACT's own door graph, independently of
 * anything the engine asserted about itself. Mirrors `doorlessRoomNames` in
 * `packages/ai-host/__tests__/helpers/circulationPredicates.ts`, including its
 * single-room exclusion (nothing to connect to).
 */
function independentDoorlessOf(option: LayoutOption): readonly string[] {
  const rooms: readonly LayoutRoom[] = option.rooms ?? [];
  if (rooms.length <= 1) return [];
  return rooms
    .filter((r) => !Array.isArray(r.doorAdjacentTo) || r.doorAdjacentTo.length === 0)
    .map((r) => r.name)
    .sort();
}

function read(generator: Generator, key: string, option: LayoutOption | null | undefined): Reading {
  if (!option) {
    return {
      generator, key, rooms: 0, shipped: false, measured: false,
      carriedDoorless: [], independentDoorless: [], unreachable: [], unrouted: [],
      hardValid: true, hardFailedRules: [], corridorStairGap: false, corridorHallGap: false,
    };
  }
  const carried = carriedDoorlessOf(option);
  const c = option.circulation;
  return {
    generator, key,
    rooms: (option.rooms ?? []).length,
    shipped: true,
    measured: carried !== null,
    carriedDoorless: carried ?? [],
    independentDoorless: independentDoorlessOf(option),
    unreachable: c ? [...c.unreachableRoomNames].sort() : [],
    unrouted: c ? [...c.unroutedToCirculationRoomNames].sort() : [],
    hardValid: c ? c.hardValid : true,
    hardFailedRules: c ? [...c.hardFailedRules] : [],
    corridorStairGap: c ? c.corridorStairGap : false,
    corridorHallGap: c ? c.corridorHallGap : false,
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

/** Deep-enough clone to plant a defect without touching the corpus. */
function cloneOption(o: LayoutOption): LayoutOption {
  return { ...o, rooms: o.rooms.map((r) => ({ ...r, doorAdjacentTo: [...(r.doorAdjacentTo ?? [])] })) };
}

function runControls(): { ok: boolean; passed: number; lines: string[] } {
  const out: string[] = [];
  let ok = true, passed = 0;
  const check = (name: string, pass: boolean, detail: string): void => {
    out.push(`  ${pass ? '✓' : '❌'} ${name} — ${detail}`);
    if (pass) passed++; else ok = false;
  };

  // A REAL engine-emitted option is the control substrate — not a hand-built
  // literal. A hand-built fixture cannot catch a field the ENGINE spells
  // differently from the gate, which is the exact defect SPEC-49 §7 records.
  const shell: ShellAnalysis = {
    netAreaM2: 92, widthM: 8.3, depthM: 11.084,
    perimeter: rect(8.3, 11.084), faces: [],
  };
  let base: LayoutOption | null = null;
  try {
    base = generateDeterministicLayouts(shell, APARTMENT_PROGRAMS[1]!, CONSTRAINTS, WEIGHTS, 1)[0] ?? null;
  } catch { base = null; }
  if (!base) {
    check('C0 substrate', false, 'the control substrate could not be generated — no verdict can be published');
    return { ok, passed, lines: out };
  }
  check('C0 substrate', true,
    `a REAL engine option: ${base.rooms.length} rooms, circulation block ${base.circulation ? 'PRESENT' : 'ABSENT'}`);

  // C1 — CLEAN CORPUS READS ZERO, on both readers (watched GREEN + satisfiability,
  //      L-716). If this cannot pass, the gate can never exit 0 and is a defect
  //      rather than a standard. It is ALSO the spelling check: had
  //      `doorAdjacentTo` been misspelled, EVERY room would read doorless here.
  const cleanCarried = carriedDoorlessOf(base);
  const cleanIndep = independentDoorlessOf(base);
  check('C1 clean · both readers',
    cleanCarried !== null && cleanCarried.length === 0 && cleanIndep.length === 0,
    `carried=[${(cleanCarried ?? ['(NOT MEASURED)']).join(',') || '∅'}] independent=[${cleanIndep.join(',') || '∅'}] (want ∅/∅ — this is the state in which the gate exits 0)`);

  // C2 — PLANTED IN THE ARTEFACT → the INDEPENDENT reader must flag it BY NAME
  //      (watched RED). Planting empties one room's realised door list, which is
  //      precisely the shape of the shipped defect.
  const victim = base.rooms[base.rooms.length - 1]!.name;
  const planted = cloneOption(base);
  planted.rooms = planted.rooms.map((r) => (r.name === victim ? { ...r, doorAdjacentTo: [] } : r));
  const plantedIndep = independentDoorlessOf(planted);
  check('C2 planted-in-artefact · independent reader goes RED',
    plantedIndep.length === 1 && plantedIndep[0] === victim,
    `sealed "${victim}" → independent reader reports [${plantedIndep.join(',') || '∅'}] (want exactly ["${victim}"])`);

  // C3 — the SAME planted option must trip the ARM B agreement check, because the
  //      CARRIED verdict still says clean. Watched in both directions: agreement
  //      holds on the untouched option, and breaks on the planted one.
  const plantedCarried = carriedDoorlessOf(planted) ?? [];
  const agreeClean = JSON.stringify(cleanCarried) === JSON.stringify(cleanIndep);
  const agreePlanted = JSON.stringify(plantedCarried) === JSON.stringify(plantedIndep);
  check('C3 agreement check · both directions',
    agreeClean && !agreePlanted,
    `untouched option agrees=${agreeClean} (want true) · artefact-planted option agrees=${agreePlanted} (want false — a stale verdict must not read as sound)`);

  // C4 — PLANTED IN THE CARRIED VERDICT → the CARRIED reader must flag it BY NAME
  //      (watched RED). This is the half C2 cannot prove: it is the only control
  //      that would notice `circulation.doorlessRoomNames` being read from the
  //      wrong field, the §7 struct-mismatch failure mode.
  const carriedPlant: LayoutOption = {
    ...cloneOption(base),
    circulation: { ...base.circulation!, doorlessRoomNames: ['PLANTED-ROOM'], doorlessRoomIds: ['planted-id'] },
  };
  const cp = carriedDoorlessOf(carriedPlant) ?? [];
  check('C4 planted-in-verdict · carried reader goes RED',
    cp.length === 1 && cp[0] === 'PLANTED-ROOM' && independentDoorlessOf(carriedPlant).length === 0,
    `carried reader reports [${cp.join(',') || '∅'}] (want ["PLANTED-ROOM"]) while the independent reader correctly stays ∅`);

  // C5 — ABSENT VERDICT IS "NOT MEASURED", NEVER "SOUND" (C70 §2.2). Watched by
  //      identity: the reader must return null, and `read()` must classify the
  //      option as shipped-but-unmeasured rather than clean.
  const noVerdict: LayoutOption = { ...cloneOption(base), circulation: undefined };
  const r5 = read('apartmentLayout', 'ctl/no-verdict', noVerdict);
  check('C5 undefined verdict · NOT MEASURED',
    carriedDoorlessOf(noVerdict) === null && r5.shipped && !r5.measured,
    `circulation:undefined → carried reader null=${carriedDoorlessOf(noVerdict) === null}, shipped=${r5.shipped}, measured=${r5.measured} (want null/true/false — an absent verdict must never print as a pass)`);

  // C6 — the three room sets stay SEPARATE (C75 §1.2). A sealed room planted into
  //      `unreachableRoomNames` must NOT move the doorless headline, and vice
  //      versa. Merging them is the one modelling error SPEC-49 §2 forbids.
  const crossPlant: LayoutOption = {
    ...cloneOption(base),
    circulation: {
      ...base.circulation!,
      unreachableRoomNames: ['UNREACHABLE-ONLY'],
      unroutedToCirculationRoomNames: ['SERVED-THROUGH-ONLY'],
    },
  };
  const r6 = read('apartmentLayout', 'ctl/cross', crossPlant);
  check('C6 three sets never merged',
    r6.carriedDoorless.length === 0 && r6.unreachable.length === 1 && r6.unrouted.length === 1,
    `doorless=${r6.carriedDoorless.length} (want 0), unreachable=${r6.unreachable.length} (want 1), unrouted=${r6.unrouted.length} (want 1)`);

  return { ok, passed, lines: out };
}

// ── main ─────────────────────────────────────────────────────────────────────

function pct(n: number, d: number): string {
  return `${((n / Math.max(1, d)) * 100).toFixed(0)}%`;
}

function main(): number {
  const lines: string[] = [];

  // ARM C first. A gate whose readers are unverified publishes no verdict.
  lines.push('ARM C — CONTROLS (executed this run, watched in BOTH directions · C70 §5.6, L-716):');
  const ctl = runControls();
  lines.push(...ctl.lines);
  if (!ctl.ok || ctl.passed < MIN_CONTROLS) {
    console.log('\n── check-generator-circulation ───────────────────────────');
    for (const l of lines) console.log('   ' + l);
    console.log(`   → [2] MISCONFIGURED — controls proven ${ctl.passed}/${MIN_CONTROLS}. A reader never watched firing publishes no verdict. NEVER absorbable as debt.`);
    // Literal exit(2), not only the shared constant, so the R5 meta-gate's
    // static EXIT2_RE can see the misconfiguration path from source.
    process.exit(2);
  }
  lines.push('');

  // ARM A — drive the three generators.
  const t0 = Date.now();
  const readings: Reading[] = [...sweepApartments(), ...sweepHouses(), ...sweepResidential()];
  const elapsedS = ((Date.now() - t0) / 1000).toFixed(1);

  const findings: string[] = [];
  const byGen: Generator[] = ['apartmentLayout', 'houseLayout', 'residentialBuilding'];

  lines.push(`ARM A — THE DRIVEN SWEEP: ${readings.length} generator run(s) executed in ${elapsedS}s against the REAL production entries.`);
  let totalRooms = 0, totalShipped = 0, totalMeasured = 0;
  for (const gen of byGen) {
    const rs = readings.filter((r) => r.generator === gen);
    const shipped = rs.filter((r) => r.shipped);
    const measured = shipped.filter((r) => r.measured);
    const rooms = shipped.reduce((n, r) => n + r.rooms, 0);
    totalRooms += rooms; totalShipped += shipped.length; totalMeasured += measured.length;

    const doorless = shipped.filter((r) => r.carriedDoorless.length > 0 || r.independentDoorless.length > 0);
    const unreachable = measured.filter((r) => r.unreachable.length > 0);
    const unrouted = measured.filter((r) => r.unrouted.length > 0);
    const hardInvalid = measured.filter((r) => !r.hardValid);
    const gaps = measured.filter((r) => r.corridorStairGap || r.corridorHallGap);

    lines.push('');
    lines.push(`  ${gen}`);
    lines.push(`    SUBJECTS: ${rs.length} case(s) driven · ${shipped.length} shipped an option · ${rooms} room(s) examined`);
    lines.push(`    verdict CARRIED (CI-0): ${measured.length}/${shipped.length} — an absent block is NOT MEASURED, never sound (C70 §2.2)`);
    lines.push(`    ⛔ CI-2  DOORLESS (LEDGERED SUBJECT): ${doorless.length}/${shipped.length} (${pct(doorless.length, shipped.length)}) case(s) ship a room with NO DOOR AT ALL`);
    // Enumerated in FULL, never truncated: the ledger is keyed on these cases and a
    // reader must be able to reconcile it against this block without re-running.
    for (const r of doorless) {
      const names = (r.carriedDoorless.length ? r.carriedDoorless : r.independentDoorless).join(', ');
      lines.push(`         · ${r.key} → ${names}`);
    }
    lines.push(`    ── the OTHER two sets, counted under their OWN names and NEVER merged into the above (C75 §1.2):`);
    lines.push(`       CI-1 UNREACHABLE (sealed by BFS):     ${unreachable.length}/${measured.length} (${pct(unreachable.length, measured.length)})`);
    lines.push(`       NO DOOR ONTO CIRCULATION (served-thru): ${unrouted.length}/${measured.length} (${pct(unrouted.length, measured.length)})`);
    lines.push(`       hard-INVALID winners shipped anyway:   ${hardInvalid.length}/${measured.length} (${pct(hardInvalid.length, measured.length)}) — §TOPO-HARD-REJECT-ALL`);
    lines.push(`       CI-4 corridor↔stair / ↔hall gap:       ${gaps.length}/${measured.length} (${pct(gaps.length, measured.length)})`);
    lines.push(`       ⚠ NOT ledgered by this gate. They are SPEC-49's CI-1/CI-4, which need a product decision this gate must not pre-empt.`);

    for (const r of rs) {
      if (r.shipped && !r.measured) findings.push(`UNMEASURED::${gen}::${r.key}`);
      if (r.carriedDoorless.length > 0 || r.independentDoorless.length > 0) findings.push(`DOORLESS::${gen}::${r.key}`);
    }
  }

  // ARM B — verdict vs artefact.
  lines.push('');
  const disagreements = readings.filter(
    (r) => r.shipped && r.measured
      && JSON.stringify(r.carriedDoorless) !== JSON.stringify(r.independentDoorless),
  );
  lines.push(`ARM B — VERDICT-vs-ARTEFACT AGREEMENT: ${disagreements.length} disagreement(s) across ${totalMeasured} measured option(s).`);
  lines.push('  The CI-0 verdict is computed PRE-rotation inside runDeterministicLayout; house and residential put the');
  lines.push('  option through further orchestration afterwards. A disagreement means the verdict a banner would DISPLAY');
  lines.push('  no longer describes the plan the user GOT, which is a defect in its own right, not a rounding note.');
  for (const r of disagreements.slice(0, 8)) {
    lines.push(`  ⛔ ${r.generator}::${r.key} — carried [${r.carriedDoorless.join(',') || '∅'}] vs artefact [${r.independentDoorless.join(',') || '∅'}]`);
    findings.push(`DISAGREE::${r.generator}::${r.key}`);
  }
  for (const r of disagreements.slice(8)) findings.push(`DISAGREE::${r.generator}::${r.key}`);
  findings.sort();

  // ARM D — the ledger, both directions.
  let ledger: Ledger | null = null;
  try { ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger; } catch { ledger = null; }
  const declaredKeys = new Set((ledger?.doorlessCases ?? []).map((r) => r.key));
  const measuredKeys = new Set(findings);
  const stale = [...declaredKeys].filter((k) => !measuredKeys.has(k)).sort();
  // `declared` counts only ledger rows that are STILL MEASURED, so an UNLEDGERED
  // finding pushes findings > declared and exits 3 even when the totals match.
  // A count-only comparison lets one fix and one new break cancel out.
  const declaredStillMeasured = [...declaredKeys].filter((k) => measuredKeys.has(k)).length;

  lines.push('');
  lines.push(`FINDINGS: ${findings.length} against a NAMED ledger of ${declaredKeys.size} (${declaredStillMeasured} still measured).`);
  for (const f of findings) {
    lines.push(`  ${declaredKeys.has(f) ? '·' : '⛔ UNLEDGERED'} ${f}`);
  }
  for (const k of stale) {
    lines.push(`  ⚠ STALE LEDGER ROW: "${k}" is declared but is no longer measured — strike it in the commit that pays it (C70 §5.4).`);
  }

  lines.push('');
  lines.push('UNPROVEN — named, never green:');
  lines.push('  ◌ This measures the SHIPPED SWEEP ARTEFACTS, not what a live user session generates. The sweeps are synthetic');
  lines.push('    convex quads and founder-scale rectangles; a real project shell is neither. That corpus is SPEC-49 §6');
  lines.push('    CI-5-INSTRUMENT and does not exist. A green reading here is NOT "the generators are sound in production".');
  lines.push('  ◌ It COUNTS DOORS. It does not check that a door is USABLE — width, swing clearance, whether furniture stands');
  lines.push('    in it (SPEC-49 CI-3), or whether it is hung at all after the executor runs. A room with one 400 mm door into');
  lines.push('    a wardrobe reads identically to a room with a proper entrance.');
  lines.push('  ◌ It reads the ENGINE payload, never the BUILT MODEL. Everything downstream of `LayoutOption` — executePlan,');
  lines.push('    the wall-opening cascade, room re-detection — is outside this gate. A door that is emitted and then dropped');
  lines.push('    at build time is invisible here.');
  lines.push('  ◌ CI-1 and CI-4 are MEASURED AND PRINTED above but NOT LEDGERED. Their silence is not coverage: nothing fails');
  lines.push('    if the unreachable rate doubles. That gate is SPEC-49 §4 CI-1 and needs the founder decision §4 names.');
  lines.push('  ◌ The reachability figure is the ENGINE\'s own (`unreachableRoomIds`), which SPEC-49 §7 records as duplicate-name');
  lines.push('    LATENT-unsafe. It is latent, not active, only because §DUP-NAME-UNIQUE mints unique names — a guard, not a fix.');

  const floors: Floor[] = [
    { what: 'apartmentLayout cases driven', measured: readings.filter((r) => r.generator === 'apartmentLayout').length, min: MIN_APARTMENT_SUBJECTS },
    { what: 'houseLayout storeys driven', measured: readings.filter((r) => r.generator === 'houseLayout').length, min: MIN_HOUSE_SUBJECTS },
    { what: 'residentialBuilding units driven', measured: readings.filter((r) => r.generator === 'residentialBuilding').length, min: MIN_RESI_SUBJECTS },
    { what: 'options that SHIPPED', measured: totalShipped, min: MIN_SHIPPED_SUBJECTS },
    { what: 'options CARRYING a CI-0 verdict', measured: totalMeasured, min: MIN_MEASURED_SUBJECTS },
    { what: 'rooms examined', measured: totalRooms, min: MIN_ROOM_SUBJECTS },
    { what: 'controls proven in-run (both directions)', measured: ctl.passed, min: MIN_CONTROLS },
  ];

  return reportGate({
    gate: 'check-generator-circulation (SPEC-49 CI-2 · C70 §5)',
    floors,
    lines,
    findings: findings.length,
    declared: declaredStillMeasured,
    findingNames: findings,
    stale,
  });
}

process.exit(main());
