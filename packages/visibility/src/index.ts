// @pryzm/visibility — Visibility-Intent legacy adapter (post-2B closeout
// / ADR-0030).
//
// HISTORY
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM 1 carried an 11-wave Visibility-Intent system that fanned a
// single user gesture ("hide this wall in this view") through a chain
// of stores (selection → visibility-intent → category-VG → poche → …).
// Phase 2B's S34 row originally claimed to "implement waves 3-4"; the
// Phase 2B audit (2026-04-27) found that the work landed under a
// different label (annotations migration + Track C backfill) and the
// VI waves never shipped.
//
// SCOPE (skeleton; full 11-wave port = S49 / Phase 3A)
// ─────────────────────────────────────────────────────────────────────────────
// This package now ships:
//   * `LegacyVisibilityIntent` — the wire shape (stable; matches the
//     PRYZM 1 schema 1:1 for forward-migration).
//   * `applyVisibilityIntent` — pure waves 3-4 reducer over the
//     `ViewElementVisibility` shape.  Wave 3 = "category fan" (an
//     intent on a category propagates to every element in the
//     category).  Wave 4 = "halftone propagation" (a hide-cousin
//     intent on element X propagates to all elements sharing X's
//     `linkedGroupId`).
//   * `roundTripWire` — the JSON round-trip helper the migration
//     reader uses to load PRYZM 1 saves.
//
// PURE: no DOM, no THREE, no Node-only globals.

export type VisibilityIntentVerb = 'hide' | 'show' | 'halftone' | 'unhalftone';

export interface LegacyVisibilityIntent {
  /** The view this intent applies to. */
  readonly viewId: string;
  /** The verb being applied. */
  readonly verb: VisibilityIntentVerb;
  /** The "what" — exactly one of these is set. */
  readonly target:
    | { readonly kind: 'element'; readonly elementId: string }
    | { readonly kind: 'category'; readonly category: string }
    | { readonly kind: 'linkedGroup'; readonly linkedGroupId: string };
}

/** Per-element index needed for waves 3-4 to fan an intent. */
export interface VisibilityIntentIndex {
  readonly elementsByCategory: ReadonlyMap<string, ReadonlySet<string>>;
  readonly elementsByLinkedGroup: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Output of one wave-3/4 reduction.  The `hidden` / `halftone` sets
 *  carry the IDs that should be in the corresponding side-table row
 *  for the affected viewId. */
export interface VisibilityIntentResult {
  readonly viewId: string;
  readonly hidden: ReadonlySet<string>;
  readonly halftone: ReadonlySet<string>;
}

/** Apply one intent against an existing per-view side-table.  Returns
 *  the next state (does NOT mutate prior). */
export function applyVisibilityIntent(
  prior: VisibilityIntentResult,
  intent: LegacyVisibilityIntent,
  index: VisibilityIntentIndex,
): VisibilityIntentResult {
  if (intent.viewId !== prior.viewId) return prior;

  const ids = expandTarget(intent.target, index);
  const hidden = new Set(prior.hidden);
  const halftone = new Set(prior.halftone);

  for (const id of ids) {
    switch (intent.verb) {
      case 'hide':       hidden.add(id);    halftone.delete(id); break;
      case 'show':       hidden.delete(id); break;
      case 'halftone':   halftone.add(id);  hidden.delete(id);   break;
      case 'unhalftone': halftone.delete(id); break;
    }
  }
  return { viewId: prior.viewId, hidden, halftone };
}

function expandTarget(
  target: LegacyVisibilityIntent['target'],
  index: VisibilityIntentIndex,
): ReadonlySet<string> {
  switch (target.kind) {
    case 'element':     return new Set([target.elementId]);
    case 'category':    return index.elementsByCategory.get(target.category) ?? new Set();
    case 'linkedGroup': return index.elementsByLinkedGroup.get(target.linkedGroupId) ?? new Set();
  }
}

/** Empty per-view result. */
export function emptyResult(viewId: string): VisibilityIntentResult {
  return { viewId, hidden: new Set(), halftone: new Set() };
}

/** JSON wire round-trip — sets serialise as sorted arrays for byte-stable output. */
export function toJSON(result: VisibilityIntentResult): {
  viewId: string; hidden: readonly string[]; halftone: readonly string[];
} {
  return {
    viewId: result.viewId,
    hidden: [...result.hidden].sort(),
    halftone: [...result.halftone].sort(),
  };
}

export function fromJSON(j: { viewId: string; hidden: readonly string[]; halftone: readonly string[] }): VisibilityIntentResult {
  return { viewId: j.viewId, hidden: new Set(j.hidden), halftone: new Set(j.halftone) };
}

// ─── Waves 1-5 (S46) — re-exported for convenience ────────────────────────
//
// New L4 visibility entry points landed in S46 — the legacy
// `applyVisibilityIntent` reducer above remains for the JSON-wire migration
// path (PRYZM 1 .pryzm save loader).  The wave chain is the canonical
// runtime for live visibility evaluation; full 11-wave port lands at S49
// (Phase 3A) per ADR-0036.

export {
  DEFAULT_WAVE_CHAIN,
  LEGACY_WAVE_CHAIN,
  runWaveChain,
  runWaveChainTraced,
  evaluateViewVisibility,
  w01LevelScope,
  w02CategoryVisibility,
  w03ViewTemplateInheritance,
  w04WallEndJoins,
  w05OpeningCulling,
  w06FilterOverrides,
  w07PhaseFilter,
  w08TemporaryIsolation,
  w09ElementHide,
  w10DesignOption,
  w11GhostLayer,
} from './waves/index.js';
export type {
  VisibilityElement,
  VisibilityView,
  VisibilityViewTemplate,
  VisibilityWaveContext,
  VisibilityResult as WaveVisibilityResult,
  WaveFn,
  NamedWave,
  ChainResult,
  ViewFilterOverride,
  PhaseFilterState,
  TemporaryIsolationState,
} from './waves/index.js';

// S53 D8: manifest-driven legacy fallback adapter.
export {
  selectWaveChain,
  evaluateVisibilityForManifest,
  type VisibilityFeatureFlags,
} from './runtime.js';

// S88-WIRE (2026-05-01): legacy builder-time governance store migrated from
// `src/visibility/VGGovernanceStore.ts` (deleted). Four element builders
// (Door/Window Plan/Builder) now import from `@pryzm/visibility`.
// @deprecated Contract 25b — new code MUST use the Visibility Intent system.
export { vgGovernanceStore, type VGStyle } from './legacyGovernanceStore.js';
