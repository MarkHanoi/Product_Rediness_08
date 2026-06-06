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
import { apartmentDimensionsFor } from '../apartmentLayout/dimensions/roomDimensions.js';
import { reserveStairCoreShaped, splitRisersForShape, type StairCoreShaped } from './stairCore.js';
import { allocateProgramToStoreys } from './storeyAllocation.js';
import type {
    HouseLayoutResult, Pt, RoofDescriptor, RoofKind, SlabVoid, StairCore, StairFlightPlan, StoreyPlate,
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
 * Envelope reconciliation: the per-storey engine runs the apartment §D3.5 envelope
 * gate, which HARD-rejects when gross area is absurd for the BEDROOM count alone
 * (it can't see that a house ground floor's area is consumed by living/kitchen/
 * dining, not bedrooms). A large house plate with a low per-storey bedroom count
 * (e.g. a 120 m² ground floor with one guest bedroom) trips the gate and the engine
 * returns []. To keep every storey producing a real layout WITHOUT editing the
 * frozen engine, we clamp the area we PASS into the engine into the admissible
 * band (`apartmentDimensionsFor(bedrooms).{grossMin,grossMax}`) for that storey's
 * bedroom count. The TRUE footprint (walls/elevations) is unchanged — only the
 * room-budget the bubble graph subdivides is clamped, so rooms are sized sensibly
 * and the gate passes. The editor-wiring follow-up (A.21.h) can replace this with a
 * house-specific envelope validator that counts non-bedroom area properly.
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

    // (c) per-storey layout via the UNCHANGED single-plate engine.
    const storeys: StoreyPlate[] = [];
    const perStoreyLayout: ScoredLayoutOption[] = [];

    for (const sp of storeyPrograms) {
        const i = sp.storeyIndex;
        const levelId = levelIdForStorey(i);
        const elevationM = r3(baseElevationM + i * floorToFloorM);

        // Shrink the usable area by the stair core, then clamp into the apartment
        // §D3.5 envelope band for THIS storey's bedroom count so the per-storey
        // engine's envelope gate passes (see the obstacle/envelope note above).
        const usableAreaM2 = coreRect
            ? Math.max(1, shell.netAreaM2 - coreAreaM2)
            : shell.netAreaM2;
        const env = apartmentDimensionsFor(sp.program.bedrooms);
        const clampedAreaM2 = Math.min(env.grossMax, Math.max(env.grossMin, usableAreaM2));
        const storeyShell: ShellAnalysis =
            clampedAreaM2 !== shell.netAreaM2 ? { ...shell, netAreaM2: clampedAreaM2 } : shell;

        const options = generateDeterministicLayouts(
            storeyShell,
            sp.program,
            constraints,
            weights,
            1,
            undefined,
            undefined,
            opts.solar,
        );
        // option[0] (best-first). If the plate can't be decomposed the engine
        // returns [] — we still record a (possibly empty) plate so the stack and
        // the per-storey arrays stay index-aligned.
        const chosen = options[0];
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
