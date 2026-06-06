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
import { validateHouseStorey, houseStoreyBand } from './houseEnvelope.js';
import { reserveStairCoreShaped, splitRisersForShape, type StairCoreShaped } from './stairCore.js';
import { allocateProgramToStoreys } from './storeyAllocation.js';
import type {
    HouseLayoutResult, Pt, RoofDescriptor, RoofKind, ScoredHouseLayoutOption, SlabVoid, StairCore, StairFlightPlan, StoreyPlate,
} from './types.js';

const DEFAULT_FLOOR_TO_FLOOR_M = 3.0;
const DEFAULT_BASE_ELEVATION_M = 0;
const DEFAULT_ROOF_KIND: RoofKind = 'gable';
const DEFAULT_ROOF_PITCH_DEG = 30;
/** Target riser height (m) — sets the total riser count for the floor-to-floor gap. */
const STAIR_RISER_TARGET_M = 0.18;

/** Resolve the per-flight plan directions for a shaped stair core (A.21.D18).
 *  Flight 1 runs along the core's LONGER plan axis. For L the second flight turns
 *  90° left (matching StairCreationController._computeLDir2 default); for U it
 *  reverses (parallel return run). Returns one entry for I, two for L/U. */
function resolveFlightPlans(
    core: StairCoreShaped,
    totalRisers: number,
): StairFlightPlan[] {
    const runAlongZ = core.rectMm.h >= core.rectMm.w; // longer dim carries flight 1
    const dir1 = runAlongZ ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    if (core.shape === 'I') {
        return [{ riserCount: totalRisers, direction: dir1 }];
    }
    const { before, after } = splitRisersForShape(core.shape, totalRisers);
    let dir2: { x: number; y: number; z: number };
    if (core.shape === 'L') {
        // Left turn: rotate dir1 +90° about Y → (-z, 0, x).
        dir2 = { x: -dir1.z, y: 0, z: dir1.x };
    } else {
        // U: reverse run (parallel return flight).
        dir2 = { x: -dir1.x, y: 0, z: -dir1.z };
    }
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
    // The single-result entry: enumerate ONE option per storey and assemble. This
    // is byte-identical to the pre-A.21.k path (the engine is called with count=1
    // and the assembler selects index 0 on every storey).
    const enumerated = enumeratePerStorey(shell, program, constraints, weights, opts, 1);
    return assembleHouse(enumerated, (_storeyIdx, options) => options[0] ?? null);
}

/**
 * A.21.k — produce N whole-house VARIANTS for the "Choose a house layout" modal.
 *
 * Reuses the apartment engine's EXISTING multi-option enumeration: each storey is
 * laid out with `generateDeterministicLayouts(..., count)`, which already returns
 * up to `count` Pareto-ranked options. We then assemble N whole-house variants by
 * varying which per-storey option index each variant selects:
 *
 *   variant v, storey s → option index `(v + s) % availableOptions(s)`
 *
 * The `+ s` rotation means variant 0 isn't simply "best on every storey then
 * second-best on every storey" — it staggers the selection so the variants are
 * visibly distinct (variant 1's ground floor differs from variant 0's, AND its
 * upper floor differs too). Selection is fully DETERMINISTIC (no `Math.random`):
 * re-running with the same inputs yields the same N variants in the same order.
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
    count = 3,
): ScoredHouseLayoutOption[] {
    const wanted = Math.max(1, Math.floor(Number.isFinite(count) ? count : 3));
    // Enumerate up to `wanted` options PER STOREY (the apartment engine already
    // Pareto-ranks + dedupes within a storey).
    const enumerated = enumeratePerStorey(shell, program, constraints, weights, opts, wanted);

    const out: ScoredHouseLayoutOption[] = [];
    const seenSelections = new Set<string>();
    for (let v = 0; v < wanted; v++) {
        // Resolve the per-storey selection tuple for this variant.
        const selection: number[] = enumerated.perStorey.map((storey, s) => {
            const n = storey.options.length;
            if (n === 0) return -1;                       // empty plate — assembler records a blank storey
            return (v + s) % n;                           // staggered, deterministic
        });
        const key = selection.join(',');
        if (seenSelections.has(key)) continue;            // collapsed to an already-emitted variant — skip
        seenSelections.add(key);

        const result = assembleHouse(enumerated, (storeyIdx, options) => {
            const idx = selection[storeyIdx];
            return idx != null && idx >= 0 ? (options[idx] ?? null) : null;
        });

        // Aggregate score = mean of the chosen per-storey option scores (0-100).
        // A storey with no option contributes nothing (skipped in the mean).
        const scored = result.perStoreyLayout;
        const overallScore = scored.length > 0
            ? Math.round(scored.reduce((s, o) => s + (o.score?.overall ?? 0), 0) / scored.length)
            : 0;

        out.push({ result, overallScore, variantIndex: out.length });
    }

    // Best-first by aggregate score, then by original variant order (stable).
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
    readonly coreRect: { x: number; y: number; w: number; h: number } | null;
    readonly totalRisers: number;
    readonly floorToFloorM: number;
    readonly baseElevationM: number;
    readonly levelIdForStorey: (i: number) => string;
    readonly roofKind: RoofKind;
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

    // (a) split the brief across storeys.
    const storeyPrograms = allocateProgramToStoreys(program, storeyCount);

    // (b) reserve the shared stair core (mm) + choose its shape (I/L/U). Only
    // meaningful for ≥2 storeys. `totalRisers` (from the floor-to-floor gap) drives
    // the L/U flight split (A.21.D18).
    const totalRisers = totalRisersForGap(floorToFloorM);
    const core: StairCoreShaped | null =
        storeyCount > 1 ? reserveStairCoreShaped(footprint, storeyCount, totalRisers) : null;
    const coreRect = core ? core.rectMm : null;
    const coreAreaM2 = coreRect ? stairCoreAreaM2(coreRect) : 0;

    // (c) per-storey layout via the UNCHANGED single-plate engine — enumerate up
    // to `count` options each (the apartment engine already Pareto-ranks them).
    const perStorey: Array<{ storeyIndex: number; options: ScoredLayoutOption[] }> = [];
    for (const sp of storeyPrograms) {
        const i = sp.storeyIndex;

        // Shrink the usable area by the stair core ONLY (a real obstacle). We hand
        // the engine the storey's TRUE area and gate feasibility with the house-aware
        // envelope (A.21.h — replaces the bedroom-count area-clamp, Deviation B).
        const usableAreaM2 = coreRect
            ? Math.max(1, shell.netAreaM2 - coreAreaM2)
            : shell.netAreaM2;

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
        const houseMax = houseStoreyBand({ program: sp.program, grossAreaM2: usableAreaM2 }).grossMaxM2;
        const presentedAreaM2 = Math.min(usableAreaM2, houseMax);
        const storeyShell: ShellAnalysis =
            presentedAreaM2 !== shell.netAreaM2 ? { ...shell, netAreaM2: presentedAreaM2 } : shell;

        const options = generateDeterministicLayouts(
            storeyShell,
            sp.program,
            constraints,
            weights,
            Math.max(1, count),
            undefined,
            undefined,
            opts.solar,
            // House-aware envelope gate: judge the plate by its FULL programme, not
            // bedroom count. Replaces the per-storey area-clamp kludge (Deviation B).
            validateHouseStorey,
        );
        perStorey.push({ storeyIndex: i, options });
    }

    return {
        perStorey, footprint, core, coreRect, totalRisers,
        floorToFloorM, baseElevationM, levelIdForStorey, roofKind,
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
    const { footprint, core, coreRect, totalRisers, floorToFloorM, baseElevationM, levelIdForStorey, roofKind } = h;

    const storeys: StoreyPlate[] = [];
    const perStoreyLayout: ScoredLayoutOption[] = [];

    for (const sp of h.perStorey) {
        const i = sp.storeyIndex;
        const levelId = levelIdForStorey(i);
        const elevationM = r3(baseElevationM + i * floorToFloorM);

        // option[selected] (best-first by default). If the plate can't be
        // decomposed the engine returned [] → null → we still record a storey so
        // the stack + the per-storey arrays stay index-aligned.
        const chosen = select(i, sp.options);
        if (chosen) perStoreyLayout.push(chosen);

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
        const flights = resolveFlightPlans(core, totalRisers);
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
    const topStorey = storeys[storeys.length - 1]!;
    const roof: RoofDescriptor = {
        levelId: topStorey.levelId,
        footprint: footprint.map(p => ({ x: p.x, z: p.z })),
        kind: roofKind,
        ...(roofKind === 'flat' ? {} : { pitchDeg: DEFAULT_ROOF_PITCH_DEG }),
    };

    return { storeys, perStoreyLayout, stairs, voids, roof };
}

export { stairCoreAreaM2 as __stairCoreAreaM2ForTest, clampStoreyCount as __clampStoreyCountForTest };
