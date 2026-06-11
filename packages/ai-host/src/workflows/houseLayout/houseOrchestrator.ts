// Casa Unifamiliar — the storey orchestrator (§6 "the new orchestration layer").
//
// PURE + DETERMINISTIC L2. The outer loop that grows the single-plate D-TGL engine
// into a multi-storey house. It REUSES `generateDeterministicLayouts` UNCHANGED
// per storey and adds the three invariants the apartment never needed (§6):
//  - a stair core that is identical across storeys (vertical alignment),
//  - per-storey `levelId` + elevation stamping (apartment stamps ONE level),
//  - a stairwell void on every non-ground slab + a roof cap.
//
// No spans here: the apartment tgl pure functions (`generateDeterministicLayouts`,
// `allocateProgramToStoreys`, `reserveStairCore`) carry NO OTel spans — spans live
// at the AiPlane boundary (P8 §C09 §2.4). This orchestrator follows the same
// convention exactly: pure, span-free; the editor's AiPlane wraps the call.

import type {
    ApartmentConstraints, ApartmentProgram, ScoringWeights, ScoredLayoutOption,
} from '../apartmentLayout/types.js';
import type { ShellAnalysis } from '../apartmentLayout/shellAnalysis.js';
import { generateDeterministicLayouts } from '../apartmentLayout/tgl/runDeterministicLayout.js';
import { principalAxisAngle, rotatePt } from '../apartmentLayout/tgl/rectDecomposition.js';
import { equatorFacingDir } from '../apartmentLayout/windowEmission/solarOrientation.js';
import { validateHouseStorey, houseStoreyBand } from './houseEnvelope.js';
import { reserveStairCoreShaped, splitRisersForShape, type StairCoreShaped, type StairSolar } from './stairCore.js';
import { computeStairWorldFootprint, type XZ as StairXZ } from './stairWorldFootprint.js';
import { solveStairContainmentWorld, allCornersInside } from './stairContainment.js';
import { allocateProgramToStoreys } from './storeyAllocation.js';
import { enrichStoreyProgramToPlate } from './houseProgramFloor.js';
import { roofBaseElevationM, roofBaseOffsetM } from './houseVertical.js';
import type {
    HouseLayoutResult, Pt, RoofDescriptor, RoofKind, ScoredHouseLayoutOption, SlabVoid, StairCore, StairFlightPlan, StoreyPlate,
} from './types.js';

const DEFAULT_FLOOR_TO_FLOOR_M = 3.0;
const DEFAULT_BASE_ELEVATION_M = 0;
const DEFAULT_ROOF_KIND: RoofKind = 'gable';
const DEFAULT_ROOF_PITCH_DEG = 30;
/** Target riser height (m) — sets the total riser count for the floor-to-floor gap. */
const STAIR_RISER_TARGET_M = 0.18;

/** §STAIR-DEFAULT-BIAS (Fix 1) — the latitude used to synthesise a stair AspectBias
 *  when the caller captured NO site solar. A mid-Northern-hemisphere value (≥ the
 *  equatorial band) so `equatorFacingDir` returns the constant `{x:0,y:1}` (back/max-Z
 *  wall = best aspect): the chooser then prefers a back/side CORNER, never the centre.
 *  A pure constant — deterministic; no Date/RNG. NOT a real climate claim (no real
 *  solar windows are emitted from it — only the stair-corner topology preference). */
const STAIR_DEFAULT_LAT_DEG = 45;

/** Resolve the per-flight plan directions for a shaped stair core (A.21.D18).
 *  Flight 1 runs along the core's LONGER plan axis. For L the second flight turns
 *  90° left (matching StairCreationController._computeLDir2 default); for U it
 *  reverses (parallel return run). Returns one entry for I, two for L/U.
 *
 *  A.21.D24 — `principalAxisRad` (the layout's dominant-edge angle) rotates the
 *  axis-aligned flight directions BACK into the world frame so the stair runs
 *  along the rotated plate's walls, not the world axes. 0 for an axis-aligned plot
 *  → directions are the bit-identical world axes (no regression). */
function resolveFlightPlans(
    core: StairCoreShaped,
    totalRisers: number,
    principalAxisRad: number,
): StairFlightPlan[] {
    const runAlongZ = core.rectMm.h >= core.rectMm.w; // longer dim carries flight 1
    // Author the directions in the axis-aligned (layout) frame, then rotate each
    // back to world by +principalAxisRad (a direction → pivot is the origin).
    const toWorld = (d: { x: number; z: number }): { x: number; y: number; z: number } => {
        const r = principalAxisRad === 0 ? d : rotatePt(d, principalAxisRad, { x: 0, z: 0 });
        return { x: r.x, y: 0, z: r.z };
    };
    const dir1 = toWorld(runAlongZ ? { x: 0, z: 1 } : { x: 1, z: 0 });
    if (core.shape === 'I') {
        return [{ riserCount: totalRisers, direction: dir1 }];
    }
    const { before, after } = splitRisersForShape(core.shape, totalRisers);
    // Derive flight-2 from the axis-aligned dir1 BEFORE the world rotation, then
    // rotate it back the same way (keeps the L/U turn geometry exact).
    const a1 = runAlongZ ? { x: 0, z: 1 } : { x: 1, z: 0 };
    const a2 = core.shape === 'L'
        ? { x: -a1.z, z: a1.x }   // left turn: rotate dir1 +90° about Y
        : { x: -a1.x, z: -a1.z }; // U: reverse run (parallel return flight)
    const dir2 = toWorld(a2);
    return [
        { riserCount: before, direction: dir1 },
        { riserCount: after, direction: dir2 },
    ];
}

/** Total riser count for a floor-to-floor gap (≈ ftf / target), ≥2. */
function totalRisersForGap(floorToFloorM: number): number {
    return Math.max(2, Math.round(floorToFloorM / STAIR_RISER_TARGET_M));
}

export interface HouseLayoutOptions {
    readonly storeyCount: number;
    readonly floorToFloorM?: number;
    readonly baseElevationM?: number;
    /** Deterministic per-storey level id (e.g. `i => bimLevelIds[i]`). Defaults to
     *  `storey-0`, `storey-1`, … so the result is self-consistent without the editor. */
    readonly levelIdForStorey?: (i: number) => string;
    /** Site latitude (decimal degrees) for climate-driven window orientation — threaded
     *  straight into the per-storey D-TGL call (no behaviour change when absent). */
    readonly solar?: { readonly latDeg: number; readonly weight?: number };
    readonly roofKind?: RoofKind;
}

function clampStoreyCount(n: number): number {
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.floor(n));
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Area (m²) of the stair-core rect (mm) — to subtract from per-storey usable area. */
function stairCoreAreaM2(rectMm: { w: number; h: number }): number {
    return (rectMm.w / 1000) * (rectMm.h / 1000);
}

/** Default whole-house variant count for the modal. The single-best path enumerates
 *  with the SAME count so its option[0] matches `generateHouseLayoutOptions(...)[0]`
 *  (the A.21.D18 equality invariant — the apartment engine's option[0] is
 *  count-dependent, so both paths MUST request the same N). */
const DEFAULT_VARIANT_COUNT = 3;

/**
 * §A.21.D18 / §STAIR-CARVE-NO-DROP (2026-06-08) — the per-storey "single best" option
 * for the modal's default card. The shared apartment engine ranks options by PARETO
 * front then weighted objectives, so `options[0]` is the architecturally-best
 * candidate — but its scalar `score.overall` is NOT guaranteed to be the maximum in
 * the returned set (e.g. on a tight §STAIR-OBSTACLE-CARVE storey a Pareto-inferior
 * alternative that drops a required en-suite can post a slightly higher `overall`).
 * The whole-house modal sorts VARIANTS best-first by aggregate `overall`, and the
 * A.21.D18 invariant requires variant 0 (this selector on every storey) to equal the
 * single best AND to sort first. Both hold iff variant 0 picks the MAX-`overall`
 * option per storey — so we select argmax(`overall`), tie-broken by the engine's own
 * order (lowest index, i.e. best Pareto rank). Empty set ⇒ -1 (blank storey).
 * Pre-stair this argmax always landed on index 0, so this is byte-identical there.
 */
function bestStoreyOptionIndex(options: readonly ScoredLayoutOption[]): number {
    if (options.length === 0) return -1;
    let best = 0;
    for (let i = 1; i < options.length; i++) {
        if ((options[i]!.score?.overall ?? 0) > (options[best]!.score?.overall ?? 0)) best = i;
    }
    return best;
}

/**
 * Generate a complete multi-storey house layout (§6).
 *
 * Algorithm:
 *  (a) `allocateProgramToStoreys` — split the brief across storeys (§3).
 *  (b) `reserveStairCore` — one shared XZ rect on every storey (§7).
 *  (c) per storey, run `generateDeterministicLayouts` (UNCHANGED) for that storey's
 *      sub-program, treating the stair core as a RESERVED OBSTACLE (see below);
 *      take option[0].
 *  (d) build a `StairCore` per adjacent storey pair (ground→upper…).
 *  (e) build a `SlabVoid` over the stair on every NON-ground storey's slab.
 *  (f) build a `RoofDescriptor` over the shell.
 *
 * Stair-core-as-obstacle, given `generateDeterministicLayouts` is FROZEN: it has
 * no obstacle parameter, so we DON'T try to carve the polygon (which would require
 * editing the engine). Instead we shrink the storey's USABLE AREA — we hand the
 * engine a `ShellAnalysis` whose `netAreaM2` is the true area MINUS the stair-core
 * footprint. The bubble-graph area distribution (which keys off `shellAreaM2` /
 * `netAreaM2`) then sizes rooms to fit the plate WITHOUT the core, so the generated
 * rooms don't expand into the core's space. The core itself is returned separately
 * as a `StairCore` (mm rect) for the editor-wiring step to place the actual stair +
 * punch the void. The perimeter/footprint is left intact (the shell still exists),
 * only the area budget shrinks. Single-storey → no core subtraction (no stair).
 *
 * Envelope reconciliation (A.21.h — Deviation B RESOLVED, SPEC-CASA §13.3): the
 * per-storey engine runs an envelope gate that, by DEFAULT, keys its gross-area
 * band on BEDROOM count alone (the apartment §D3.5 gate). That is wrong for a house
 * GROUND floor, whose large area is consumed by living/kitchen/dining, not bedrooms
 * — it would HARD-reject (e.g. a 120 m² ground floor with one guest bedroom). The
 * old kludge faked the area: it CLAMPED the area passed into the engine into the
 * apartment band so the gate passed but the engine laid out for a wrong area.
 *
 * The fix: we now pass the storey's TRUE area AND inject a HOUSE-aware envelope
 * validator (`validateHouseStorey`) into the engine. It judges the plate by the sum
 * of its full programme's room target areas (living + kitchen + dining + bedrooms +
 * baths + circulation), so a big house ground floor is accepted at its real size.
 * The engine is NOT forked — `generateDeterministicLayouts` takes an OPTIONAL
 * `envelopeValidator` whose default is the apartment gate, so the apartment path is
 * byte-identical. The stair-core area is still subtracted (it's a real obstacle,
 * not the area-fake) so rooms don't grow into the core.
 *
 * 1-storey input → a single plate, NO stairs, NO voids, default-or-given roof — a
 * strict superset of today's single-storey single-plate bridge.
 */
export function generateHouseLayout(
    shell: ShellAnalysis,
    program: ApartmentProgram,
    constraints: ApartmentConstraints,
    weights: ScoringWeights,
    opts: HouseLayoutOptions,
): HouseLayoutResult {
    // The single-result entry: enumerate up to DEFAULT_VARIANT_COUNT options per
    // storey and assemble variant 0 (index 0 on every storey).
    //
    // §A.21.D18 EQUALITY INVARIANT — this MUST be byte-identical to
    // `generateHouseLayoutOptions(...)[0].result` (the modal's first/default card).
    // The apartment engine's `generateDeterministicLayouts` surfaces a DIFFERENT
    // option[0] when asked for 1 vs N options (it Pareto-ranks the larger candidate
    // set, so option[0]'s score/room-order can shift) — so the single-best path MUST
    // enumerate with the SAME count as the options path or the two diverge. We
    // therefore enumerate with the shared DEFAULT_VARIANT_COUNT here (NOT count=1),
    // then select index 0 on every storey — exactly what variant 0 of the options
    // path does. The stair core is reserved identically on both paths (it depends
    // only on the footprint, not the option count), so this change only aligns the
    // per-storey option[0] selection. Apartment + single-storey paths are unaffected.
    const enumerated = enumeratePerStorey(shell, program, constraints, weights, opts, DEFAULT_VARIANT_COUNT);
    return assembleHouse(enumerated, (_storeyIdx, options) => {
        const idx = bestStoreyOptionIndex(options);
        return idx >= 0 ? (options[idx] ?? null) : null;
    });
}

/**
 * A.21.k — produce N whole-house VARIANTS for the "Choose a house layout" modal.
 *
 * Reuses the apartment engine's EXISTING multi-option enumeration: each storey is
 * laid out with `generateDeterministicLayouts(..., count)`, which already returns
 * up to `count` Pareto-ranked options. We then assemble N whole-house variants by
 * varying which per-storey option index each variant selects:
 *
 *   variant 0     , storey s → option index 0       (the single best on EVERY storey)
 *   variant v ≥ 1 , storey s → option index `(v + s) % availableOptions(s)`
 *
 * Variant 0 is the all-best-index selection so it is byte-identical to
 * `generateHouseLayout(...)` (the A.21.D18 equality invariant — see below). The
 * `+ s` rotation on variants v ≥ 1 staggers the selection so the alternative cards
 * are visibly distinct (variant 1's ground floor differs from variant 0's, AND its
 * upper floor differs too) WITHOUT ever colliding with variant 0's all-zero tuple
 * (their storey-0 index is `v % n ≠ 0` for v in 1..n-1). Selection is fully
 * DETERMINISTIC (no `Math.random`): re-running with the same inputs yields the same
 * N variants in the same order.
 *
 * Variant 0 always selects index 0 on every storey, so it is IDENTICAL to
 * `generateHouseLayout(...)` — the modal's first/default card is the engine's
 * single best house.
 *
 * Returns at most `count` variants, best-first by aggregate score (the mean of
 * the chosen per-storey option scores). De-duplicates variants whose per-storey
 * selection collapses to the same index tuple (e.g. when a storey produced only
 * one option), so the modal never shows two identical cards.
 */
export function generateHouseLayoutOptions(
    shell: ShellAnalysis,
    program: ApartmentProgram,
    constraints: ApartmentConstraints,
    weights: ScoringWeights,
    opts: HouseLayoutOptions,
    count = DEFAULT_VARIANT_COUNT,
): ScoredHouseLayoutOption[] {
    const wanted = Math.max(1, Math.floor(Number.isFinite(count) ? count : 3));
    // Enumerate up to `wanted` options PER STOREY (the apartment engine already
    // Pareto-ranks + dedupes within a storey).
    const enumerated = enumeratePerStorey(shell, program, constraints, weights, opts, wanted);

    const out: ScoredHouseLayoutOption[] = [];
    const seenSelections = new Set<string>();
    for (let v = 0; v < wanted; v++) {
        // Resolve the per-storey selection tuple for this variant.
        //   v === 0 → the per-storey single best (`bestStoreyOptionIndex`, the SAME
        //             selector `generateHouseLayout` uses) on EVERY storey — the
        //             A.21.D18 equality invariant: this variant MUST equal the single
        //             best AND, being max-`overall` per storey, sort first.
        //   v ≥ 1   → staggered `(v + s) % n` so the alternatives are visibly
        //             distinct. A staggered tuple that happens to equal variant 0's is
        //             de-duped below (seenSelections), so the modal never shows a
        //             duplicate of the default card.
        const selection: number[] = enumerated.perStorey.map((storey, s) => {
            const n = storey.options.length;
            if (n === 0) return -1;                       // empty plate — assembler records a blank storey
            return v === 0 ? bestStoreyOptionIndex(storey.options) : (v + s) % n;
        });
        const key = selection.join(',');
        if (seenSelections.has(key)) continue;            // collapsed to an already-emitted variant — skip
        seenSelections.add(key);

        const result = assembleHouse(enumerated, (storeyIdx, options) => {
            const idx = selection[storeyIdx];
            return idx != null && idx >= 0 ? (options[idx] ?? null) : null;
        });

        // Aggregate score = mean of the chosen per-storey option scores (0-100).
        // perStoreyLayout is now strictly index-aligned with storeys (HSE-AUDIT-1), so
        // blank storeys appear as null placeholders — filter them so a blank plate
        // contributes nothing AND the divisor stays the count of real options.
        const scored = result.perStoreyLayout.filter(
            (o): o is ScoredLayoutOption => o != null,
        );
        const overallScore = scored.length > 0
            ? Math.round(scored.reduce((s, o) => s + (o.score?.overall ?? 0), 0) / scored.length)
            : 0;

        out.push({ result, overallScore, variantIndex: out.length });
    }

    // Best-first by aggregate score, then by original variant order (stable).
    // §A.21.D18 EQUALITY INVARIANT holds because variant 0 selects the MAX-`overall`
    // option on every storey (see `bestStoreyOptionIndex` below — the SAME selector
    // `generateHouseLayout` uses), so its mean aggregate is maximal and it always
    // sorts first — i.e. the modal's first card stays byte-equal to the single best.
    out.sort((a, b) => b.overallScore - a.overallScore || a.variantIndex - b.variantIndex);
    // Re-stamp variantIndex to the post-sort position so it's a stable 0..n-1.
    return out.map((o, i) => ({ ...o, variantIndex: i }));
}

/** The shared per-storey context the single + multi-option entries both build on:
 *  the resolved storey programs, the stair core, and the up-to-`count` enumerated
 *  options PER STOREY (index-aligned with `storeyPrograms`). Pure. */
interface EnumeratedHouse {
    readonly perStorey: ReadonlyArray<{ readonly storeyIndex: number; readonly options: ScoredLayoutOption[] }>;
    readonly footprint: { x: number; z: number }[];
    readonly core: StairCoreShaped | null;
    /** The stair-core rect in the LAYOUT (principal-axis) frame (mm). On an
     *  axis-aligned plot this equals the world rect (angle 0). */
    readonly coreRect: { x: number; y: number; w: number; h: number } | null;
    /** §STAIR-CONTAIN-UPSTREAM — the WORLD-XZ inward-containment offset (m) the
     *  executor applies to the shipped stair body so it sits inside the (rotated)
     *  shell. {0,0} when the reserved footprint already fits. */
    readonly containOffsetWorld: { x: number; z: number };
    readonly totalRisers: number;
    readonly floorToFloorM: number;
    readonly baseElevationM: number;
    readonly levelIdForStorey: (i: number) => string;
    readonly roofKind: RoofKind;
    /** A.21.D24 — the layout's principal-axis angle (rad) + world pivot the stair
     *  rect/flights are rotated back by. 0 / footprint-centroid for axis-aligned. */
    readonly principalAxisRad: number;
    readonly pivot: { x: number; z: number };
}

/**
 * §STAIR-CONTAIN-UPSTREAM (2026-06-09) — contain the reserved stair core INSIDE the
 * (rotated) world shell BEFORE the room-tiling keep-out is carved, so the carved
 * keep-out == the shipped stair footprint (the §8.5 cure).
 *
 * Frames (verified against source):
 *  - `reserved.rectMm` is the LAYOUT (principal-axis) frame, mm. The keep-out + the
 *    executor both rotate it to WORLD by `+principalAxisRad` about `pivot`.
 *  - `shellWorld` (shell) is WORLD-XZ metres (ShellAnalysis.perimeter).
 *  - The containment offset is solved in the WORLD frame (the frame the executor's
 *    §STAIR-CONTAIN ran in). It is returned as a WORLD-XZ translation that flows to the
 *    executor on StairCore.containOffsetWorld so the executor applies the SAME shift.
 *
 * The RESERVED `rectMm` is NOT mutated (it keeps the §STAIR-DEFAULT-BIAS wall-hugging
 * placement); only the SHIPPED body is shifted by the returned offset. Returns the
 * WORLD-XZ footprint of the CONTAINED body (4 corners) for the keep-out AABB.
 *
 * Pure + deterministic. When the footprint already fits, the offset is {0,0} (no
 * regression to §STAIR-DEFAULT-BIAS / the rectMm-equality invariants).
 */
function containStairCoreUpstream(
    reserved: StairCoreShaped,
    shellWorld: { x: number; z: number }[],
    totalRisers: number,
    floorToFloorM: number,
    principalAxisRad: number,
    pivot: { x: number; z: number },
    storeyCount: number,
): { containOffsetWorld: { x: number; z: number }; footprintWorld: StairXZ[] | null } {
    // The WORLD-rotated per-flight plan (same `resolveFlightPlans` the assembler uses).
    const flights = resolveFlightPlans(reserved, totalRisers, principalAxisRad);

    const fpInput = {
        rectMm: reserved.rectMm,
        shape: reserved.shape,
        flights: flights.map(f => ({ riserCount: f.riserCount, direction: f.direction })),
        risersBeforeLanding: reserved.risersBeforeLanding,
        interiorSide: reserved.interiorSide,
        principalAxisRad,
        pivot,
        floorToFloorM,
        startY: 0,   // footprint is XZ-only; y is ignored by computeStairFootprintRect
    } as const;

    // (1) un-contained world footprint.
    const built0 = computeStairWorldFootprint(fpInput, { x: 0, z: 0 });
    const fp0 = built0.footprintWorld;
    if (!fp0 || fp0.length < 3 || shellWorld.length < 3) {
        // Degenerate — no offset; the keep-out falls back to the core-rect AABB and the
        // executor's §STAIR-CONTAIN still guards (best-effort).
        return { containOffsetWorld: { x: 0, z: 0 }, footprintWorld: fp0 };
    }

    // (2) inward direction = the LAYOUT-frame interior side rotated to WORLD (same as the
    //     executor); central/absent → degenerate → the solver falls back to the centroid.
    const sideLayout =
        reserved.interiorSide === 'left' ? { x: 1, z: 0 } :
        reserved.interiorSide === 'right' ? { x: -1, z: 0 } :
        reserved.interiorSide === 'back' ? { x: 0, z: -1 } :
        { x: 0, z: 0 };
    const inwardWorld = principalAxisRad === 0
        ? sideLayout
        : rotatePt(sideLayout, principalAxisRad, { x: 0, z: 0 });

    // (3) solve the world-frame containment (same two-attempt gate as the old executor).
    const solved = solveStairContainmentWorld(fp0, shellWorld, inwardWorld);

    // §DIAG-STAIR-CONTAIN-UPSTREAM — log the reserve-time containment so a prod run proves
    // the keep-out now matches the shipped footprint. `storey=0..N-1` (the core is shared).
    console.log(
        `[house-layout] §DIAG-STAIR-CONTAIN-UPSTREAM storey=0..${storeyCount - 1} `
        + `offset=(${solved.dx.toFixed(2)},${solved.dz.toFixed(2)}) cornersInShell=${solved.cornersInShell}/4`
        + `${solved.alreadyInside ? ' (already-contained)' : solved.viaCentroid ? ' (via-centroid)' : ''}`,
    );

    // §DIAG-STAIR-RULE (founder verification, 2026-06-09) — the four EXPLICIT stair-placement
    // rules, each checked + logged with a ✓/⚠ verdict so a prod paste proves rule health at a
    // glance. Logging only (no behaviour change); the rules are ENFORCED upstream by
    // §STAIR-DEFAULT-BIAS (corner) + §STAIR-KEEPOUT (room carve) + §STAIR-CONTAIN-UPSTREAM
    // (shell containment). The rules:
    //   R1 — CORNER, never central: `interiorSide` is left/right/back (a perimeter wall),
    //        not 'central'. A central stair holes the subdivision → rooms merge.
    //   R2 — hugs the worst-aspect / back-or-side wall (freeing the prime frontage). The
    //        chosen kind names the abutted wall; 'central' fails this too.
    //   R3 — does NOT overlap a habitable room: the keep-out the rooms tile around IS this
    //        contained footprint, so the rule holds by CONSTRUCTION iff the keep-out AABB is
    //        itself inside the shell (rooms then tile around it, inside the shell).
    //   R4 — full footprint contained in the shell: cornersInShell === 4/4.
    // A ⚠ on any line is a real, actionable founder-visible violation.
    const fpFinal = (solved.dx === 0 && solved.dz === 0) ? fp0 : fp0.map(c => ({ x: c.x + solved.dx, z: c.z + solved.dz }));
    const kind = reserved.interiorSide;
    const r1Corner = kind !== 'central';
    const r2WorstAspect = kind === 'back' || kind === 'left' || kind === 'right';
    const r4Contained = solved.cornersInShell === 4;
    // R3: the keep-out AABB the subdivider carves rooms around == this footprint's AABB; if
    // ALL its corners are inside the shell the rooms tile around it INSIDE the shell, so no
    // room can overlap the stair (the carve removes the stair cell before tiling). We test
    // the AABB corners (the keep-out is axis-aligned in world) against the shell polygon.
    const x0 = Math.min(...fpFinal.map(c => c.x)), z0 = Math.min(...fpFinal.map(c => c.z));
    const x1 = Math.max(...fpFinal.map(c => c.x)), z1 = Math.max(...fpFinal.map(c => c.z));
    const keepOutCorners = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
    const keepOutInShell = keepOutCorners.filter(c => allCornersInside([c], shellWorld)).length;
    const r3NoRoomOverlap = keepOutInShell === 4;
    const v = (ok: boolean): string => (ok ? '✓' : '⚠ VIOLATION');
    console.log(
        `[house-layout] §DIAG-STAIR-RULE kind=${kind} `
        + `R1-corner-not-central=${v(r1Corner)} `
        + `R2-worst-aspect-wall=${v(r2WorstAspect)} `
        + `R3-no-room-overlap(keepOutInShell=${keepOutInShell}/4)=${v(r3NoRoomOverlap)} `
        + `R4-footprint-in-shell(cornersInShell=${solved.cornersInShell}/4)=${v(r4Contained)}`,
    );
    // §STAIR-CENTRAL-SPINE (founder §68.6, 2026-06-11) — a CENTRAL stair is no longer an
    // automatic R1/R2 violation: the founder explicitly prefers a central-spine U-stair
    // flanked by two room banks WHEN the plate is wide enough (the §STAIR-LANDING-SEAL +
    // corridor spine keep it from fragmenting). So the chooser now LEGITIMATELY returns
    // 'central' on a wide plate. R1/R2 are about the OTHER failure mode (a stair marooned
    // MID-PLATE with NO clean carve); a deliberate central-spine is fine. We therefore only
    // warn when the placement is neither a wall-corner NOR a viable central spine.
    const centralSpine = kind === 'central';
    const r1ok = r1Corner || centralSpine;
    const r2ok = r2WorstAspect || centralSpine;
    if (!r1ok || !r2ok || !r3NoRoomOverlap || !r4Contained) {
        console.warn(
            `[house-layout] §DIAG-STAIR-RULE ⚠ one or more stair rules VIOLATED `
            + `(kind=${kind} — a MID-EDGE/marooned stair holes the subdivision; cornersInShell<4 pokes the shell). `
            + `See §DIAG-STAIR candidate scores above for WHY this candidate won.`,
        );
    }

    // §DIAG-STAIR-FOOTPRINT-RATIO (founder §68.6, 2026-06-11) — the stair must be a TIGHT
    // vertical-circulation core (footprint + ~1.5 m landing), NOT an oversized room. This
    // engine-side line reports the carved STAIR-CELL (the room-tiling keep-out AABB the rooms
    // tile around — what becomes the detected stair room) ÷ the TIGHT stair geometry footprint
    // (flights + landings + width). Target ≤ ~1.6×: at/above that the cell is bigger than the
    // stair needs (the founder's oversized-stair room). It also names the disposition: a
    // central-spine stair (flanked by two room banks — the founder's preferred U-stair) vs a
    // cornered stair (≥2 perimeter walls). Logging only; the TIGHTENING is enforced by
    // §STAIR-LANDING-SEAL (the residual claim seals the landing band so detection can't flood
    // the cell) + the tight keep-out == the shipped footprint (containStairCoreUpstream).
    const cellArea = (x1 - x0) * (z1 - z0);                       // the keep-out AABB (stair cell)
    // The tight oriented stair footprint area (flights+landings+width) = the convex span of
    // fpFinal's 4 corners along its own axes; the AABB over-covers a skewed run, so use the
    // edge lengths of the oriented rect (corner0→1 × corner1→2) as the true footprint area.
    const e01 = Math.hypot(fpFinal[1]!.x - fpFinal[0]!.x, fpFinal[1]!.z - fpFinal[0]!.z);
    const e12 = Math.hypot(fpFinal[2]!.x - fpFinal[1]!.x, fpFinal[2]!.z - fpFinal[1]!.z);
    const footprintArea = Math.max(1e-6, e01 * e12);
    const cellToFootprint = cellArea / footprintArea;
    const disposition = centralSpine ? 'central-spine (U, two banks)' : `cornered (${kind})`;
    console.log(
        `[house-layout] §DIAG-STAIR-FOOTPRINT-RATIO storey=0..${storeyCount - 1} `
        + `stairCell=${cellArea.toFixed(1)}m² footprint=${footprintArea.toFixed(1)}m² `
        + `cellToFootprint=${cellToFootprint.toFixed(2)}× disposition=${disposition}`
        + `${cellToFootprint > 1.6 ? ' ⚠ OVERSIZED (stair should be a tight ~1.5 m landing, not a large room)' : ' ✓ tight'}`,
    );

    const containOffsetWorld = { x: solved.dx, z: solved.dz };
    if (solved.dx === 0 && solved.dz === 0) {
        // Already contained — keep-out == the un-shifted footprint.
        return { containOffsetWorld, footprintWorld: fp0 };
    }
    // (4) the CONTAINED world footprint = the un-contained footprint shifted by the world
    //     offset (the executor will shift the SAME body by the SAME StairCore.containOffsetWorld).
    const fpContained = fp0.map(c => ({ x: c.x + solved.dx, z: c.z + solved.dz }));
    return { containOffsetWorld, footprintWorld: fpContained };
}

/** Enumerate up to `count` options per storey via the UNCHANGED apartment engine.
 *  This carries (b)+(c) of the §6 algorithm; assembly (d)–(f) is in `assembleHouse`. */
function enumeratePerStorey(
    shell: ShellAnalysis,
    program: ApartmentProgram,
    constraints: ApartmentConstraints,
    weights: ScoringWeights,
    opts: HouseLayoutOptions,
    count: number,
): EnumeratedHouse {
    const storeyCount = clampStoreyCount(opts.storeyCount);
    const floorToFloorM = opts.floorToFloorM && opts.floorToFloorM > 0 ? opts.floorToFloorM : DEFAULT_FLOOR_TO_FLOOR_M;
    const baseElevationM = opts.baseElevationM ?? DEFAULT_BASE_ELEVATION_M;
    const levelIdForStorey = opts.levelIdForStorey ?? ((i: number) => `storey-${i}`);
    const roofKind = opts.roofKind ?? DEFAULT_ROOF_KIND;

    const footprint = (shell.perimeter as Pt[]).map(p => ({ x: p.x, z: p.z }));

    // §PRINCIPAL-AXIS / A.21.D24 — the layout's dominant-edge angle + world pivot.
    // The per-storey D-TGL engine lays out axis-aligned in this rotated frame, so we
    // reserve the stair core in the SAME rotated frame (a tight rect aligned with
    // the rotated walls) and carry the angle/pivot so the editor rotates the stair
    // back to world. Axis-aligned plots (rectangle / L / U / T) → angle 0 → the
    // footprint passes through unrotated and the core rect is bit-identical (no
    // regression). Mirrors PRINCIPAL_AXIS_MIN_RAD (~0.6°) in runDeterministicLayout.
    const rawAngle = principalAxisAngle(footprint);
    const principalAxisRad = Math.abs(rawAngle) >= 0.01 ? rawAngle : 0;
    const pivot = footprint.length > 0
        ? footprint.reduce((a, p) => ({ x: a.x + p.x, z: a.z + p.z }), { x: 0, z: 0 })
        : { x: 0, z: 0 };
    if (footprint.length > 0) { pivot.x /= footprint.length; pivot.z /= footprint.length; }
    // The footprint expressed in the rotated (layout/principal-axis) frame.
    const footprintLayout = principalAxisRad === 0
        ? footprint
        : footprint.map(p => rotatePt(p, -principalAxisRad, pivot));

    // (a) split the brief across storeys.
    const storeyPrograms = allocateProgramToStoreys(program, storeyCount);

    // (b) reserve the shared stair core (mm) + choose its shape (I/L/U). Only
    // meaningful for ≥2 storeys. `totalRisers` (from the floor-to-floor gap) drives
    // the L/U flight split (A.21.D18). Reserved in the rotated LAYOUT frame so the
    // rect sits squarely against the rotated plate (A.21.D24).
    const totalRisers = totalRisersForGap(floorToFloorM);
    // §STAIR-WORST-ASPECT (2026-06-08) — thread the site latitude so the core hugs
    // the POOR-ASPECT perimeter wall (founder rule: the stair takes the worst
    // façade; habitable rooms keep the best). The core is reserved in the LAYOUT
    // (principal-axis-rotated) frame, so we map the WORLD equator-facing direction
    // into that frame by the SAME −principalAxisRad rotation `runDeterministicLayout`
    // applies to the window sun direction (a direction → pivot is the origin). +y in
    // the layout frame then means the BACK (max-Z) wall. On an axis-aligned plate the
    // rotation is identity.
    //
    // §STAIR-DEFAULT-BIAS (Fix 1, 2026-06-09, founder "stair location critical") —
    // ALWAYS supply an AspectBias to the position chooser, even when NO solar/latitude
    // is captured (the common modal path). PREVIOUSLY a missing `opts.solar` left
    // `stairSolar = undefined`, so `reserveStairCoreShaped` → `chooseStairCorePosition`
    // ran the legacy WASTE-ONLY path with NEITHER the PERIMETER_PREFERENCE nor the
    // FRAGMENT_PENALTY term. On most plates the waste scorer alone already corners the
    // stair, but on plates where a MID-EDGE (`back`) candidate ties/beats a true CORNER
    // by waste, OR where shell-containment culls thin the candidate set, the chooser
    // could land the stair MID-PLATE/MID-EDGE → the plate fractures into a 4-way
    // picture-frame (no dominant rect) → §STAIR-OBSTACLE-CARVE can't run the corridor
    // spine → the private zone merges into one blob (the founder's "Bedroom 2 / Bedroom
    // 1 / Bathroom 101.8 m²"). Forcing a CORNER yields one dominant rect (~75-80 %) so
    // the corridor carve fires and the rooms stay distinct — a TOPOLOGY-level fix.
    //
    // So when solar is absent we fall back to a DETERMINISTIC Northern-hemisphere
    // default (`worldSun = {x:0, y:1}` — the back/max-Z wall treated as best-aspect, the
    // entrance-opposite wall as worst), mapped into the layout frame the same way the
    // real solar path is. `aspectBiasFor` then returns a real bias → the corner-
    // preferring PERIMETER_PREFERENCE + FRAGMENT_PENALTY always fire → the stair takes a
    // back/side CORNER and never holes the centre. `kind='central'` survives ONLY as a
    // genuine last resort (no perimeter candidate fits — a tiny plate). Pure +
    // deterministic (constant direction; no Date/RNG). When solar IS present the bias is
    // byte-identical to before (this branch is unchanged).
    const stairSolar: StairSolar = (() => {
        const latDeg = opts.solar?.latDeg ?? STAIR_DEFAULT_LAT_DEG;
        // Real solar uses the equator-facing dir for the captured latitude; the no-solar
        // default uses a constant +y (Northern-hemisphere) world sun so a bias ALWAYS
        // exists. equatorFacingDir(STAIR_DEFAULT_LAT_DEG) === {x:0,y:1} by construction,
        // so both paths share one code path with no behavioural fork.
        const worldSun = equatorFacingDir(latDeg);   // (x=East, y=South=+planZ) or null
        const sunDirLayout = worldSun
            ? (() => {
                const r = principalAxisRad === 0
                    ? { x: worldSun.x, z: worldSun.y }
                    : rotatePt({ x: worldSun.x, z: worldSun.y }, -principalAxisRad, { x: 0, z: 0 });
                return { x: r.x, y: r.z };
            })()
            : null;
        return { latDeg, sunDirLayout };
    })();
    const reservedCore: StairCoreShaped | null =
        storeyCount > 1
            ? reserveStairCoreShaped(footprintLayout, storeyCount, totalRisers, stairSolar)
            : null;

    // §STAIR-CONTAIN-UPSTREAM (2026-06-09, founder "circulation must be perfectly
    // orchestrated") — CONTAIN the stair BEFORE the keep-out is carved, so the carved
    // room-tiling keep-out == the SHIPPED stair footprint (closing the §8.5 desync).
    //
    // PREVIOUSLY the keep-out was derived from the RESERVED `core.rectMm` (the reserved
    // cell), and the editor then NUDGED the actual stair body ~1.5 m inward to fit the
    // rotated shell — AFTER the rooms were tiled around the un-nudged cell — so the
    // shipped stair overlapped the rooms tiled in the vacated region and cut their
    // sealing partitions → room-detection flood → merge.
    //
    // NOW: build the SHARED world footprint (the SAME geometry the executor builds, via
    // `computeStairWorldFootprint`), solve the inward-containment offset against the
    // (rotated) world shell with the SAME two-attempt gate the executor used
    // (`solveStairContainmentWorld`), and carry that WORLD offset on
    // `StairCore.containOffsetWorld`. The executor applies the SAME shift to the SAME body,
    // so its §STAIR-CONTAIN becomes a no-op verification. The RESERVED `rectMm` is left
    // UNCHANGED (so §STAIR-DEFAULT-BIAS wall-hug + the rectMm-equality tests hold); only the
    // SHIPPED body + the keep-out move together. The keep-out below is the CONTAINED footprint.
    //
    // House-only: a single-storey house / the apartment path has NO core → this block is
    // skipped entirely (apartment byte-identical). Pure + deterministic (ADR-0061).
    const contained = reservedCore
        ? containStairCoreUpstream(reservedCore, footprint, totalRisers, floorToFloorM, principalAxisRad, pivot, storeyCount)
        : null;
    // §STAIR-CONTAIN-UPSTREAM — the RESERVED core is preserved UNCHANGED (rectMm still
    // hugs the wall per §STAIR-DEFAULT-BIAS / §STAIR-WORST-ASPECT); the inward-containment
    // is carried as a SEPARATE world-XZ offset on the StairCore so the executor applies the
    // SAME shift to the SAME body. The keep-out below is derived from the CONTAINED footprint
    // (`coreFootprintWorld`), so the rooms tile around the FINAL stair position.
    const core: StairCoreShaped | null = reservedCore;
    const containOffsetWorld = contained ? contained.containOffsetWorld : { x: 0, z: 0 };
    const coreFootprintWorld = contained ? contained.footprintWorld : null;
    const coreRect = core ? core.rectMm : null;   // RESERVED, in the LAYOUT frame (mm)
    const coreAreaM2 = coreRect ? stairCoreAreaM2(coreRect) : 0;

    // §DIAG-STAIR-RESERVE (Part 8, 2026-06-09, founder verification line) — log the
    // shared stair reserve (it is identical across ALL storeys by construction — the
    // §7 vertical-alignment invariant — so one line describes every storey). The `kind`
    // field is THE key signal: `left`/`right`/`back` = a CORNER/side reserve (one
    // dominant rect → the corridor carve fires → distinct rooms); `central` = the
    // founder's merged-blob risk (should now appear ONLY on a tiny plate with no fitting
    // perimeter candidate, after Fix 1). `rect` is the LAYOUT-frame mm rect; `rot` is the
    // principal-axis angle the editor rotates the stair back to world by. Logging only —
    // no behaviour change. Pure/deterministic.
    if (core) {
        console.log(
            `[house-layout] §DIAG-STAIR-RESERVE storey=${storeyCount > 1 ? '0..' + (storeyCount - 1) : '0'} `
            + `shape=${core.shape} kind=${core.interiorSide} `
            + `rect=${Math.round(core.rectMm.x)},${Math.round(core.rectMm.y)},${Math.round(core.rectMm.w)},${Math.round(core.rectMm.h)}mm `
            + `rot=${principalAxisRad.toFixed(4)}rad`,
        );
    }

    // §STAIR-KEEPOUT (A.21.D21, SPEC-CASA §7) — the keep-out the subdivider carves out
    // of every storey's buildable region so rooms/partitions never tile across the stair.
    //
    // §STAIR-CONTAIN-UPSTREAM — the keep-out is now the world AABB of the CONTAINED,
    // SHIPPED stair FOOTPRINT (all flights + landings + width), NOT the smaller reserved
    // `core.rectMm`. Because `core` was already contained upstream, this AABB == the AABB
    // of the body the executor ships, so the rooms tile around the FINAL stair position
    // and no stair-vs-room overlap can arise by construction (the §8.5 acceptance: the
    // carved keep-out region coincides with the executor's final footprint within ε).
    //
    // The shared `computeStairWorldFootprint` builds the SAME world geometry the executor
    // builds; `coreFootprintWorld` (computed in `containStairCoreUpstream`) is reused here.
    const keepOutRectsWorld = core && coreFootprintWorld && coreFootprintWorld.length >= 3
        ? [{
            x0: Math.min(...coreFootprintWorld.map(c => c.x)), z0: Math.min(...coreFootprintWorld.map(c => c.z)),
            x1: Math.max(...coreFootprintWorld.map(c => c.x)), z1: Math.max(...coreFootprintWorld.map(c => c.z)),
        }]
        : coreRect
            ? (() => {
                // Fallback (degenerate footprint): the contained core-rect AABB.
                const corners = [
                    { x: coreRect.x / 1000, z: coreRect.y / 1000 },
                    { x: (coreRect.x + coreRect.w) / 1000, z: coreRect.y / 1000 },
                    { x: (coreRect.x + coreRect.w) / 1000, z: (coreRect.y + coreRect.h) / 1000 },
                    { x: coreRect.x / 1000, z: (coreRect.y + coreRect.h) / 1000 },
                ].map(c => principalAxisRad === 0 ? c : rotatePt(c, principalAxisRad, pivot));
                return [{
                    x0: Math.min(...corners.map(c => c.x)), z0: Math.min(...corners.map(c => c.z)),
                    x1: Math.max(...corners.map(c => c.x)), z1: Math.max(...corners.map(c => c.z)),
                }];
            })()
            : undefined;

    // §DIAG-FILL-RESIDUAL (founder defect §65.2, 2026-06-11) — the RESERVED stair-core world
    // AABB (the modal "Stair" cell, `coreRect`). It can sit OFFSET from `keepOutRectsWorld`
    // (the SHIPPED footprint, contained upstream), so the residual-claim pass excludes BOTH
    // (it must never mint a "Store" in the cell the modal draws the stair). Consumed ONLY by
    // that pass (NOT the main carve) so every layout is byte-identical. None ⇒ undefined.
    const residualExcludeRectsWorld = coreRect
        ? (() => {
            const corners = [
                { x: coreRect.x / 1000, z: coreRect.y / 1000 },
                { x: (coreRect.x + coreRect.w) / 1000, z: coreRect.y / 1000 },
                { x: (coreRect.x + coreRect.w) / 1000, z: (coreRect.y + coreRect.h) / 1000 },
                { x: coreRect.x / 1000, z: (coreRect.y + coreRect.h) / 1000 },
            ].map(c => principalAxisRad === 0 ? c : rotatePt(c, principalAxisRad, pivot));
            return [{
                x0: Math.min(...corners.map(c => c.x)), z0: Math.min(...corners.map(c => c.z)),
                x1: Math.max(...corners.map(c => c.x)), z1: Math.max(...corners.map(c => c.z)),
            }];
        })()
        : undefined;

    // (c) per-storey layout via the UNCHANGED single-plate engine — enumerate up
    // to `count` options each (the apartment engine already Pareto-ranks them).
    // §STAIR-KEEPOUT is passed into each per-storey engine call below.
    const perStorey: Array<{ storeyIndex: number; options: ScoredLayoutOption[] }> = [];
    for (const sp of storeyPrograms) {
        const i = sp.storeyIndex;

        // Shrink the usable area by the stair core ONLY (a real obstacle). We hand
        // the engine the storey's TRUE area and gate feasibility with the house-aware
        // envelope (A.21.h — replaces the bedroom-count area-clamp, Deviation B).
        const usableAreaM2 = coreRect
            ? Math.max(1, shell.netAreaM2 - coreAreaM2)
            : shell.netAreaM2;

        // §HOUSE-PLATE-PROGRAM-FLOOR (A.21.D25 Defect 2) — fill the plate with a
        // sensible house room SET before laying it out. A SPARSE captured brief (a
        // 0/1-bedroom brief, or a storeyAllocation upper storey left with just a
        // hall) makes the frozen engine stretch one or two rooms to fill the whole
        // plate — the founder's "165 m² Room 00-001". We raise (never lower) the
        // storey's programme to a full house floor sized to its plate. The §HOUSE-
        // MAX-CAP below still bounds the subdivision budget so the added rooms stay
        // sensibly sized; the two passes are complementary. House-only — the
        // apartment path never calls this.
        //
        // growBedrooms: an UPPER storey is the private level → grow bedrooms to fill
        // it. A SINGLE-storey house carries the whole programme on the ground plate
        // → the ground floor DOES grow bedrooms to fill.
        const growBedrooms = sp.role === 'upper' || storeyCount <= 1;
        // §HOUSE-GROUND-FILL (A.21.D28 #4): the GROUND floor of a MULTI-storey house
        // is NOT the private level (bedrooms live upstairs), so it must NOT grow the
        // full bedroom count — but the OLD behaviour left it with only the sparse
        // captured brief, which the frozen engine stretched into ONE giant room on a
        // large plate (the founder's "167.9 m² Living Room / Bedroom 2 / Corridor /
        // …" merge). Fill it with GROUND-appropriate rooms (a guest bedroom + bath,
        // capped low) so it reads as a real ground floor with real interior
        // partitions. Distinct from growBedrooms (the heavy private-level fill); only
        // the multi-storey ground uses this lever.
        const growGroundRooms = sp.role === 'ground' && storeyCount > 1;
        const storeyProgram = enrichStoreyProgramToPlate(
            sp.program, usableAreaM2, sp.role, { growBedrooms, growGroundRooms },
        );

        // §HOUSE-MAX-CAP — the ground floor's rich programme is accepted at its TRUE
        // size, but a SPARSE upper storey (e.g. one bedroom on the full plate of a
        // 3-storey house) can genuinely exceed its programme's house grossMax. The
        // engine's house gate would then reject and the storey would emit no rooms —
        // a regression vs. the old clamp. To keep every storey producing a real
        // layout we cap the SUBDIVISION area at the house envelope's OWN grossMax for
        // this storey's full programme (NOT the bedroom-count apartment band). This
        // is house-derived + only bites the oversize edge; the ground floor's true
        // area passes through untouched (usableArea ≤ grossMax there). The TRUE
        // footprint (walls/elevations) is unchanged — only the room-budget the
        // bubble graph subdivides is capped, so rooms stay sensibly sized.
        // §AREA-AGREEMENT (G12, 2026-06-08) — only cap a SPARSE storey whose programme
        // genuinely under-fills the plate (the "1 bedroom on a 3-storey upper plate" case
        // the cap was written for). A storey already enriched toward its plate (gross
        // target ≥ half the plate) keeps its TRUE area so its rooms fill the real rects —
        // capping it shrinks the bubble-graph budget and starves the program, forcing
        // §FEASIBILITY-ALLOC to drop rooms on a plate that is actually big enough (the
        // founder's generic "Room 00-00x" voids). Deterministic; apartment path untouched.
        const band = houseStoreyBand({ program: storeyProgram, grossAreaM2: usableAreaM2 });
        const presentedAreaM2 = band.grossTargetM2 >= usableAreaM2 * 0.5
            ? usableAreaM2
            : Math.min(usableAreaM2, band.grossMaxM2);
        const storeyShell: ShellAnalysis =
            presentedAreaM2 !== shell.netAreaM2 ? { ...shell, netAreaM2: presentedAreaM2 } : shell;

        // §DIAG-STOREY (G12, 2026-06-08) — the money log for over-program diagnosis: the
        // TRUE plate vs the area presented to the subdivider vs the program's gross
        // target/max, the room SET, and the stair shape. If presentedArea << usableArea
        // while the program wants the whole plate, that's the §AREA-AGREEMENT starve; if
        // the subdivider then logs §DIAG-RECTS with many small fragments, that's the stair
        // fragmenting the plate. Read both together to pinpoint a room drop.
        console.log(
            `[house-layout] §DIAG-STOREY i=${i} role=${sp.role} usableArea=${usableAreaM2.toFixed(1)} ` +
            `presentedArea=${presentedAreaM2.toFixed(1)} grossTarget=${band.grossTargetM2.toFixed(1)} ` +
            `grossMax=${band.grossMaxM2.toFixed(1)} program={bed:${storeyProgram.bedrooms},bath:${storeyProgram.bathrooms},` +
            `kitchen:${storeyProgram.includeKitchen ?? false},living:${storeyProgram.livingRoom ?? false},` +
            `dining:${storeyProgram.openPlanKitchenDining ?? false},hall:${storeyProgram.entranceHall ?? false},` +
            `ensuite:${storeyProgram.masterEnSuite ?? false}} ` +
            `stair=${core ? `${core.shape}@(${(core.rectMm.x / 1000).toFixed(1)},${(core.rectMm.y / 1000).toFixed(1)}) ${(core.rectMm.w / 1000).toFixed(1)}×${(core.rectMm.h / 1000).toFixed(1)}m` : 'none'}`,
        );
        const options = generateDeterministicLayouts(
            storeyShell,
            storeyProgram,
            constraints,
            weights,
            Math.max(1, count),
            undefined,
            undefined,
            opts.solar,
            // House-aware envelope gate: judge the plate by its FULL programme, not
            // bedroom count. Replaces the per-storey area-clamp kludge (Deviation B).
            validateHouseStorey,
            // §STAIR-KEEPOUT (A.21.D21) — carve the stair core out of every storey's
            // buildable region (incl. the ground floor, so the run is clear there too).
            keepOutRectsWorld,
            // tuning — house orchestrator uses engine defaults.
            undefined,
            // §DIAG-FILL-RESIDUAL (§65.2) — the RESERVED stair-core cell the residual-claim
            // pass must keep clear (the modal "Stair" cell, offset from the shipped footprint).
            residualExcludeRectsWorld,
        );
        perStorey.push({ storeyIndex: i, options });
    }

    return {
        perStorey, footprint, core, coreRect, containOffsetWorld, totalRisers,
        floorToFloorM, baseElevationM, levelIdForStorey, roofKind,
        principalAxisRad, pivot,
    };
}

/** Assemble a complete `HouseLayoutResult` from an enumerated house + a per-storey
 *  option selector. Carries (d)–(f) of the §6 algorithm (stairs, voids, roof) plus
 *  the storey-plate stamping. The selector receives the storey INDEX (0-based) and
 *  that storey's option list and returns the chosen option (or null for a blank
 *  plate). Pure + deterministic. */
function assembleHouse(
    h: EnumeratedHouse,
    select: (storeyIndex: number, options: ScoredLayoutOption[]) => ScoredLayoutOption | null,
): HouseLayoutResult {
    const { footprint, core, coreRect, containOffsetWorld, totalRisers, floorToFloorM, baseElevationM, levelIdForStorey, roofKind, principalAxisRad, pivot } = h;

    const storeys: StoreyPlate[] = [];
    const perStoreyLayout: (ScoredLayoutOption | null)[] = [];

    for (const sp of h.perStorey) {
        const i = sp.storeyIndex;
        const levelId = levelIdForStorey(i);
        const elevationM = r3(baseElevationM + i * floorToFloorM);

        // option[selected] (best-first by default). If the plate can't be
        // decomposed the engine returned [] → null. We push the option (or a null
        // placeholder) for EVERY storey so perStoreyLayout[i] is always the option
        // for storeys[i] — STRICT index alignment (HSE-AUDIT-1: a blank middle storey
        // used to compact the array and mis-pair every later storey the executor reads
        // positionally). Consumers that read positionally null-guard each slot; the
        // aggregate-score mean filters the nulls.
        const chosen = select(i, sp.options);
        perStoreyLayout.push(chosen);

        storeys.push({
            levelId,
            storeyIndex: i,
            elevationM,
            floorToFloorM,
            footprint: footprint.map(p => ({ x: p.x, z: p.z })),
        });
    }

    // (d) one StairCore per adjacent storey pair (ground→upper, upper→upper…).
    // Each carries the chosen shape + resolved per-flight risers/directions so the
    // editor emits the matching CreateStairInput directly (A.21.D18).
    const stairs: StairCore[] = [];
    if (core && coreRect && storeys.length >= 2) {
        // A.21.D24 — flight directions resolved in the LAYOUT frame then rotated
        // back to world by +principalAxisRad so the run aligns with the rotated plate.
        const flights = resolveFlightPlans(core, totalRisers, principalAxisRad);
        for (let i = 0; i < storeys.length - 1; i++) {
            stairs.push({
                rectMm: { ...coreRect },
                fromLevelId: storeys[i]!.levelId,
                toLevelId: storeys[i + 1]!.levelId,
                shape: core.shape,
                flights: flights.map(f => ({ riserCount: f.riserCount, direction: { ...f.direction } })),
                ...(core.shape !== 'I'
                    ? { landingDepthM: core.landingDepthM, risersBeforeLanding: core.risersBeforeLanding }
                    : {}),
                footprintMm: { w: coreRect.w, h: coreRect.h },
                // A.21.D24 — the angle + pivot the editor rotates the stair footprint
                // (startPosition / startOverride) back to world by (+angle about pivot).
                principalAxisRad,
                pivot: { x: pivot.x, z: pivot.z },
                // §STAIR-HALF-LANDING-INWARD (2026-06-09) — carry the core's placement kind
                // so the editor folds a U-stair's half-landing TOWARD the plate interior
                // (away from the flush perimeter wall). Layout-frame, same as `rectMm`.
                interiorSide: core.interiorSide,
                // §STAIR-CONTAIN-UPSTREAM (2026-06-09) — the WORLD-XZ inward-containment
                // offset solved at reserve time (against the rotated shell). The executor
                // applies this SAME shift to the shipped body so it matches the carved
                // keep-out; its §STAIR-CONTAIN then VERIFIES (a no-op nudge). {0,0} when the
                // reserved footprint already fits (axis-aligned plates byte-identical).
                containOffsetWorld: { x: containOffsetWorld.x, z: containOffsetWorld.z },
            });
        }
    }

    // (e) one SlabVoid on every NON-ground storey (the hole over the stair).
    const voids: SlabVoid[] = [];
    if (coreRect) {
        for (let i = 1; i < storeys.length; i++) {
            voids.push({ levelId: storeys[i]!.levelId, rectMm: { ...coreRect } });
        }
    }

    // (f) roof over the topmost storey. Flat roof has no meaningful pitch.
    // §ROOF-CAP-ELEVATION (founder v45) — the roof base world-Y caps the topmost
    // storey's wall head: top-storey floor elevation + wall head. Computed PURELY
    // from (storeyCount × floorToFloor) + base elevation so an N-storey house caps
    // at the right height every time (the executor places the roof here, not via a
    // racy wall-store lookup). The house executor's wall height === floorToFloor, so
    // the wall head above the top floor is floorToFloorM.
    const topStorey = storeys[storeys.length - 1]!;
    const roof: RoofDescriptor = {
        levelId: topStorey.levelId,
        footprint: footprint.map(p => ({ x: p.x, z: p.z })),
        kind: roofKind,
        ...(roofKind === 'flat' ? {} : { pitchDeg: DEFAULT_ROOF_PITCH_DEG }),
        baseElevationM: roofBaseElevationM(storeys.length, floorToFloorM, baseElevationM, floorToFloorM),
        baseOffsetM: roofBaseOffsetM(floorToFloorM, floorToFloorM),
    };

    return { storeys, perStoreyLayout, stairs, voids, roof };
}

export { stairCoreAreaM2 as __stairCoreAreaM2ForTest, clampStoreyCount as __clampStoreyCountForTest };
