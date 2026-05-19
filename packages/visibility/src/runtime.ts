// Runtime adapter for the manifest-driven `legacy_vi_fallback` feature
// flag.  Centralises the "which wave chain do I run?" decision so
// every consumer (apps/editor, plugins/visibility-intent, the headless
// renderer) gets identical behaviour.
//
// Spec source: PHASE-3A AI-VISIBILITY-COMPLETE.md §S53 D8 + Risk-register
// R3A-04 — `featureFlags.legacy_vi_fallback` flipped to opt-in only.
//
// PURE: no DOM, no THREE, no transport.

import {
  DEFAULT_WAVE_CHAIN,
  LEGACY_WAVE_CHAIN,
  evaluateViewVisibility,
  type NamedWave,
  type VisibilityElement,
  type VisibilityResult,
  type VisibilityView,
} from './waves/index.js';

/** A subset of the persisted manifest carrying just the visibility-related
 *  feature flags.  Decoupled from `@pryzm/persistence-client` to avoid a
 *  circular dependency (persistence-client is a higher layer). */
export interface VisibilityFeatureFlags {
  readonly legacy_vi_fallback?: boolean;
}

/** Choose the wave chain to run for a given project's manifest.
 *
 *  Returns:
 *    - `LEGACY_WAVE_CHAIN` (waves 1-5 only) when `legacy_vi_fallback === true`.
 *    - `DEFAULT_WAVE_CHAIN` (waves 1-11) otherwise.
 *
 *  The fallback flag defaults to `false` per S53 D8 — every NEW project AND
 *  every project that doesn't carry the flag (older manifests) gets the
 *  full 11-wave chain. */
export function selectWaveChain(flags?: VisibilityFeatureFlags | null): readonly NamedWave[] {
  if (flags?.legacy_vi_fallback === true) {
    return LEGACY_WAVE_CHAIN;
  }
  return DEFAULT_WAVE_CHAIN;
}

/** Convenience: evaluate visibility for an entire view, honouring the
 *  manifest's `legacy_vi_fallback` flag.  This is the entry point most
 *  apps will use; lower-level control is available via `selectWaveChain`
 *  + the chain runners in `./waves/index.ts`. */
export function evaluateVisibilityForManifest(
  elements: readonly VisibilityElement[],
  view: VisibilityView,
  flags?: VisibilityFeatureFlags | null,
): ReadonlyMap<string, VisibilityResult> {
  return evaluateViewVisibility(elements, view, selectWaveChain(flags));
}
