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

import type { ScoringWeights } from './types.js';

/**
 * Four normalised 0..1 design sliders. Each biases ONE existing ScoringWeights
 * axis. 0 = "I don't care about this", 1 = "maximise this". 0.5 is the neutral
 * midpoint that reproduces the legacy all-equal weighting.
 *
 *  - `daylight`     → naturalLight       (share of floor area in windowed rooms)
 *  - `privacy`      → privacy            (bedrooms far from the entrance)
 *  - `kitchen`      → kitchenWorkflow    (kitchen↔dining adjacency + exterior wall)
 *  - `compactness`  → corridorEfficiency (less circulation area is better)
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
}

/** The neutral midpoint — every slider at 0.5 reproduces the all-equal
 *  `DEFAULT_WEIGHTS` (every axis weight 1). Handy for "reset". */
export const DEFAULT_DESIGN_PARAMS: DesignParams = {
    daylight: 0.5,
    privacy: 0.5,
    kitchen: 0.5,
    compactness: 0.5,
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
