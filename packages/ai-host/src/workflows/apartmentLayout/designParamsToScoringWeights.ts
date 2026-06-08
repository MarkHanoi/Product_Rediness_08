// A.25.1 — Living Design Parameters: pure params → ScoringWeights mapping.
//
// The FIRST slice of the founder's "Living Design Parameters" vision: a small
// set of normalised 0..1 design sliders the user drags in the editor, mapped to
// the D-TGL layout scorer's existing `ScoringWeights` axes (score.ts §9). The
// scorer already weights four 0-1 layout axes — naturalLight, privacy,
// kitchenWorkflow, corridorEfficiency — into the 0-100 overall used to rank +
// label the layout options the modal shows. By re-weighting those axes from the
// sliders we steer WHICH generated layout ranks first WITHOUT touching the
// generator, the program rules, or window emission.
//
// PURE: no stores / DOM / THREE / network. Maps four 0..1 sliders → ScoringWeights.
// Unit-tested in plain Node (ai-host vitest).
//
// TYPOLOGY-AGNOSTIC: these four axes exist for any layout the D-TGL scorer ranks;
// the slider labels are apartment-flavoured but the mapping is just numbers.

import type { ScoringWeights, EngineTuning } from './types.js';

/**
 * The Living Design Parameters — normalised 0..1 design sliders. Each biases ONE
 * piece of EXISTING generation substrate (ADR-0060: bind, don't fork). 0 = "I
 * don't care / minimise this", 1 = "maximise this". 0.5 is the neutral midpoint
 * that reproduces the legacy behaviour exactly (Pareto-equality invariant).
 *
 * The FIRST FOUR (A.25.1) re-weight the four D-TGL scorer axes (`ScoringWeights`):
 *  - `daylight`     → naturalLight       (share of floor area in windowed rooms)
 *  - `privacy`      → privacy            (bedrooms far from the entrance)
 *  - `kitchen`      → kitchenWorkflow    (kitchen↔dining adjacency + exterior wall)
 *  - `compactness`  → corridorEfficiency (less circulation area is better)
 *
 * The NEXT FOUR (A.25.3) tune NON-scoring engine inputs (`EngineTuning`):
 *  - `adjacency`     → program-rules adjacency strictness (preferred rewarded /
 *                      forbidden penalised harder) — feeds `computeObjectives`.
 *  - `accessibility` → corridor clear-width (wider corridors when high) — feeds
 *                      the subdivider's corridor strip.
 *  - `climate`       → the D6 `SolarBias.weight` (sun-facing glazing bias).
 *  - `space`         → habitable-room area generosity (bigger living/bedrooms when
 *                      high) — feeds the bubble-graph area-weight allocator.
 */
export interface DesignParams {
    /** Prioritise daylight / sun-facing rooms. */
    daylight: number;
    /** Prioritise private (deep-from-entrance) bedrooms. */
    privacy: number;
    /** Prioritise an efficient kitchen↔dining workflow. */
    kitchen: number;
    /** Prioritise a compact plan (minimal corridor / circulation area). */
    compactness: number;
    /** A.25.3 — program-rules adjacency strictness (preferred-vs-forbidden). */
    adjacency: number;
    /** A.25.3 — accessibility: corridor / door clear-width (step-free, wider). */
    accessibility: number;
    /** A.25.3 — climate: sun-facing glazing bias (the D6 SolarBias weight). */
    climate: number;
    /** A.25.3 — space: habitable-room area generosity (bigger living/bedrooms). */
    space: number;
}

/** The neutral midpoint — every slider at 0.5 reproduces the all-equal
 *  `DEFAULT_WEIGHTS` (every axis weight 1) AND the identity `EngineTuning`
 *  (`designParamsToEngineTuning` returns null). Handy for "reset". */
export const DEFAULT_DESIGN_PARAMS: DesignParams = {
    daylight: 0.5,
    privacy: 0.5,
    kitchen: 0.5,
    compactness: 0.5,
    adjacency: 0.5,
    accessibility: 0.5,
    climate: 0.5,
    space: 0.5,
};

const clamp01 = (v: number): number =>
    !Number.isFinite(v) ? 0.5 : v < 0 ? 0 : v > 1 ? 1 : v;

/**
 * Map a slider's 0..1 value to a strictly-positive scorer weight.
 *
 * We map [0,1] → [MIN_WEIGHT, MAX_WEIGHT] linearly with the midpoint 0.5 → 1.0
 * (the legacy neutral weight), so dragging UP past the midpoint amplifies an
 * axis and dragging DOWN attenuates it. The weight stays strictly positive (never
 * 0) because `scoreLayout` normalises by the weight sum — a true 0 would just
 * remove the axis from the blend, which is fine, but a small floor keeps every
 * axis faintly in play and avoids a divide-by-zero when ALL sliders are at 0.
 */
const MIN_WEIGHT = 0.05;
const MAX_WEIGHT = 3.0;
const NEUTRAL_WEIGHT = 1.0;

function sliderToWeight(v: number): number {
    const t = clamp01(v);
    // Piecewise-linear so the midpoint lands exactly on the legacy neutral 1.0:
    //   [0, 0.5] → [MIN_WEIGHT, NEUTRAL_WEIGHT]
    //   [0.5, 1] → [NEUTRAL_WEIGHT, MAX_WEIGHT]
    const w = t <= 0.5
        ? MIN_WEIGHT + (NEUTRAL_WEIGHT - MIN_WEIGHT) * (t / 0.5)
        : NEUTRAL_WEIGHT + (MAX_WEIGHT - NEUTRAL_WEIGHT) * ((t - 0.5) / 0.5);
    // Round to 3 dp so the value is stable/deterministic across re-renders.
    return Math.round(w * 1000) / 1000;
}

/**
 * Map the four normalised design sliders to D-TGL `ScoringWeights` overrides.
 *
 * Pure + deterministic. All-0.5 input ⇒ all-1.0 weights (the legacy default).
 * The result is fed straight into the generate payload's `options.scoringWeights`
 * so the next layout-generate ranks options by the user's priorities.
 */
export function designParamsToScoringWeights(params: Partial<DesignParams>): ScoringWeights {
    const p: DesignParams = { ...DEFAULT_DESIGN_PARAMS, ...params };
    return {
        naturalLight: sliderToWeight(p.daylight),
        privacy: sliderToWeight(p.privacy),
        kitchenWorkflow: sliderToWeight(p.kitchen),
        corridorEfficiency: sliderToWeight(p.compactness),
    };
}

// ── A.25.3 — the four NON-scoring engine-tuning axes ──────────────────────────
//
// Each binds a slider to an existing engine input that re-runs the deterministic
// engine differently (ADR-0060: bind to substrate, never a parallel scorer). The
// neutral midpoint 0.5 reproduces the legacy constant EXACTLY, so a centred slider
// is identity (the A.21.D18 Pareto-equality invariant).

/** D6 SolarBias.weight default (windowEmission/solarOrientation.ts `solar.weight ?? 0.6`).
 *  The climate slider's NEUTRAL (0.5) must reproduce this exact value. */
const NEUTRAL_SOLAR_WEIGHT = 0.6;
/** Engine corridor strip default (tgl/subdivide.ts `CORRIDOR_STRIP_WIDTH_M`, m).
 *  The accessibility slider's NEUTRAL (0.5) must reproduce this exact value. */
const NEUTRAL_CORRIDOR_WIDTH_M = 1.2;
/** Widest corridor the accessibility slider commands at the extreme (m) — a
 *  generous step-free / wheelchair-turning corridor. */
const MAX_CORRIDOR_WIDTH_M = 1.8;
/** Narrowest the corridor may go (m) — UK Part M minimum clear width. */
const MIN_CORRIDOR_WIDTH_M = 1.0;

/** Linear map [0,1] → [lo, hi] with midpoint 0.5 → mid (piecewise so the
 *  neutral point lands EXACTLY on `mid`, which need not be (lo+hi)/2). */
function sliderToRange(v: number, lo: number, mid: number, hi: number): number {
    const t = clamp01(v);
    const r = t <= 0.5
        ? lo + (mid - lo) * (t / 0.5)
        : mid + (hi - mid) * ((t - 0.5) / 0.5);
    return Math.round(r * 1000) / 1000;
}

/**
 * Map the four NON-scoring design sliders to concrete engine-input tunings.
 *
 * Returns `null` when ALL FOUR are at (or indistinguishably near) the neutral
 * midpoint — the IDENTITY case the engine treats as "no tuning supplied", so the
 * deterministic output is byte-identical to the pre-A.25.3 baseline (the
 * Pareto-equality invariant). Otherwise returns the populated tuning; every field
 * still holds its neutral constant for axes the user left centred, so a single
 * raised slider changes exactly one engine input.
 *
 * Bindings (each re-runs the EXISTING engine differently — no parallel scorer):
 *   • adjacency     → `adjacencyStrictness` ∈ [0.5, 2] (neutral 1) — sharpens the
 *                     program-rules preferred/forbidden adjacency scoring.
 *   • accessibility → `corridorWidthM` ∈ [1.0, 1.8] m (neutral 1.2) — the corridor
 *                     strip width in the subdivider.
 *   • climate       → `solarWeight` ∈ [0, 1] (neutral 0.6) — the D6 SolarBias weight.
 *   • space         → `spaceGenerosity` ∈ [0.6, 1.6] (neutral 1) — habitable-room
 *                     area-weight multiplier in the bubble graph.
 */
export function designParamsToEngineTuning(params: Partial<DesignParams>): EngineTuning | null {
    const p: DesignParams = { ...DEFAULT_DESIGN_PARAMS, ...params };
    const NEUTRAL_EPS = 1e-6;
    const isNeutral =
        Math.abs(clamp01(p.adjacency) - 0.5) < NEUTRAL_EPS &&
        Math.abs(clamp01(p.accessibility) - 0.5) < NEUTRAL_EPS &&
        Math.abs(clamp01(p.climate) - 0.5) < NEUTRAL_EPS &&
        Math.abs(clamp01(p.space) - 0.5) < NEUTRAL_EPS;
    if (isNeutral) return null;

    return {
        // 0 → 0.5 (relax), 0.5 → 1.0 (neutral), 1 → 2.0 (strict).
        adjacencyStrictness: sliderToRange(p.adjacency, 0.5, 1.0, 2.0),
        // 0 → 1.0 m, 0.5 → 1.2 m (engine default), 1 → 1.8 m.
        corridorWidthM: sliderToRange(p.accessibility, MIN_CORRIDOR_WIDTH_M, NEUTRAL_CORRIDOR_WIDTH_M, MAX_CORRIDOR_WIDTH_M),
        // 0 → 0.0 (no solar bias), 0.5 → 0.6 (D6 default), 1 → 1.0 (max bias).
        solarWeight: sliderToRange(p.climate, 0.0, NEUTRAL_SOLAR_WEIGHT, 1.0),
        // 0 → 0.6 (mean rooms), 0.5 → 1.0 (neutral), 1 → 1.6 (generous habitable rooms).
        spaceGenerosity: sliderToRange(p.space, 0.6, 1.0, 1.6),
    };
}
