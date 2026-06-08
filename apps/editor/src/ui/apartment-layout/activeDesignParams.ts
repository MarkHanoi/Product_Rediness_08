// A.25.1 — Living Design Parameters: session stash for the active design sliders.
//
// THE PROBLEM IT SOLVES
// ---------------------
// The design-parameter PANEL sits OUTSIDE the generate call stack (the same way
// the active-brief stash sits outside it — see activeDesignParams' sibling
// `activeBrief.ts`). The user drags the sliders, then a generate is triggered
// from any entry point (the panel's own debounced re-generate, the AI panel, the
// console `pryzmGenerateApartmentLayout()`, or the modal's program-edit
// re-generate). All of those funnel through `gatherLayoutPayload`, which reads
// THIS stash to apply the sliders' ScoringWeights to the payload it builds.
//
// Holds the LAST-set normalised DesignParams (0..1 per axis). Writer: the panel.
// Reader: gatherLayoutPayload. Null ⇒ no override ⇒ the payload uses
// DEFAULT_WEIGHTS (legacy all-equal). Typology-agnostic: pure numbers.

import {
    designParamsToScoringWeights,
    designParamsToEngineTuning,
    type DesignParams,
    type ScoringWeights,
    type EngineTuning,
} from '@pryzm/ai-host';

let _params: DesignParams | null = null;

/** Record the design sliders the user set (panel). Latest wins; null clears. */
export function setActiveDesignParams(params: DesignParams | null | undefined): void {
    _params = params ?? null;
    if (_params) {
        console.log('[design-params] set', _params);
    }
}

/** The last-set design sliders, or null when the user never touched the panel. */
export function getActiveDesignParams(): DesignParams | null {
    return _params;
}

/** The ScoringWeights derived from the active sliders, or null when unset.
 *  `gatherLayoutPayload` uses this to override the payload's scoringWeights. */
export function getActiveScoringWeights(): ScoringWeights | null {
    return _params ? designParamsToScoringWeights(_params) : null;
}

/** A.25.3 — the non-scoring engine tuning (adjacency / accessibility / climate /
 *  space) derived from the active sliders, or null when unset OR when all four
 *  of those axes sit at their neutral midpoint (identity — the engine then uses
 *  its built-in defaults). `gatherLayoutPayload` sets it onto `payload.tuning`. */
export function getActiveEngineTuning(): EngineTuning | null {
    return _params ? designParamsToEngineTuning(_params) : null;
}

/** Clear the stash (e.g. project close / re-onboard). */
export function clearActiveDesignParams(): void {
    _params = null;
}
