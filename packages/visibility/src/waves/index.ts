// packages/visibility/src/waves — public surface for the 11-wave VI chain.
//
// Waves 1-5 land at S46 D1-D6 ("always-on" primitives — level scope,
// category visibility, view-template inheritance, wall-end joins,
// opening culling).
//
// Waves 6-11 land at S49 + S53 ("user-discretion" + BIM-composition
// primitives — filter overrides, phase filter, temporary isolation,
// element hide, design options, ghost layer).  Spec sources:
//   • PHASE-3A AI-VISIBILITY-COMPLETE.md §S53 D1-D6
//   • PHASE-3A VI-AI-ELEMENT-CREATOR.md §1.2 lines 60-218
//   • SPEC-30 §6 (literal preservation, not redesign)
//
// PURE: no DOM, no THREE, no transport.  See ./types.ts for the wave
// contract; see ./wNN-* for individual wave semantics.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type {
  ChainResult,
  NamedWave,
  VisibilityResult,
  VisibilityWaveContext,
  VisibilityElement,
  VisibilityView,
} from './types.js';
import { w01LevelScope } from './w01-level-scope.js';
import { w02CategoryVisibility } from './w02-category-visibility.js';
import { w03ViewTemplateInheritance } from './w03-view-template-inheritance.js';
import { w04WallEndJoins } from './w04-wall-end-joins.js';
import { w05OpeningCulling } from './w05-opening-culling.js';
import { w06FilterOverrides } from './w06-filter-overrides.js';
import { w07PhaseFilter } from './w07-phase-filter.js';
import { w08TemporaryIsolation } from './w08-temporary-isolation.js';
import { w09ElementHide } from './w09-element-hide.js';
import { w10DesignOption } from './w10-design-option.js';
import { w11GhostLayer } from './w11-ghost-layer.js';

/** The full 11-wave chain (waves 1-5 always-on, waves 6-11 user-discretion).
 *
 *  Ordering rationale (verbatim PRYZM 1, with waves 6-11 appended per
 *  the BIM-canonical order documented in SPEC-30 §6 + retro-decisions
 *  ADR-0030 §3):
 *
 *    1  level-scope               (cheap reject by level)
 *    2  category-visibility       (cheap reject by category)
 *    3  view-template-inheritance (template chain)
 *    4  wall-end-joins            (parent-wall pin)
 *    5  opening-culling           (host-wall pin)
 *    6  filter-overrides          (saved filter rules)
 *    7  phase-filter              (construction-phase slice)
 *    8  temporary-isolation       (user "Isolate" gesture)
 *    9  element-hide              (per-view "Hide in View" set)
 *   10  design-option             (active design-option set)
 *   11  ghost-layer               (CRDT pending-peer-edit halftone)
 *
 *  The order is load-bearing: waves 1-5 are short-circuits that minimise
 *  evaluation cost; waves 6-9 are user-mode short-circuits; waves 10-11
 *  are the final composition layer.
 */
export const DEFAULT_WAVE_CHAIN: readonly NamedWave[] = [
  { id: 'w01-level-scope',                fn: w01LevelScope },
  { id: 'w02-category-visibility',        fn: w02CategoryVisibility },
  { id: 'w03-view-template-inheritance',  fn: w03ViewTemplateInheritance },
  { id: 'w04-wall-end-joins',             fn: w04WallEndJoins },
  { id: 'w05-opening-culling',            fn: w05OpeningCulling },
  { id: 'w06-filter-overrides',           fn: w06FilterOverrides },
  { id: 'w07-phase-filter',               fn: w07PhaseFilter },
  { id: 'w08-temporary-isolation',        fn: w08TemporaryIsolation },
  { id: 'w09-element-hide',               fn: w09ElementHide },
  { id: 'w10-design-option',              fn: w10DesignOption },
  { id: 'w11-ghost-layer',                fn: w11GhostLayer },
];

/** Legacy chain — waves 1-5 only.  Used when the project's
 *  `featureFlags.legacy_vi_fallback === true` (S53 D8 risk-register
 *  R3A-04 mitigation: if waves 6-11 produce regressions, the user can
 *  flip the flag and revert to PRYZM 1 always-on-only behavior). */
export const LEGACY_WAVE_CHAIN: readonly NamedWave[] = DEFAULT_WAVE_CHAIN.slice(0, 5);

/** Run a single (element, view) pair through a wave chain.  Short-circuits
 *  on the first `{ visible: false }`.  Halftone is sticky across waves —
 *  once a wave returns `halftone: true`, subsequent waves can keep it but
 *  not clear it (a stricter wave hiding the element still short-circuits;
 *  a more-lenient wave doesn't un-halftone). */
export function runWaveChain(
  ctx: VisibilityWaveContext,
  chain: readonly NamedWave[] = DEFAULT_WAVE_CHAIN,
): ChainResult {
  const verdicts: { waveId: string; result: VisibilityResult }[] = [];
  let halftone = false;
  for (const wave of chain) {
    const v = wave.fn(ctx);
    verdicts.push({ waveId: wave.id, result: v });
    if (!v.visible) {
      return {
        result: {
          visible: false,
          halftone: halftone || v.halftone === true,
          ...(v.reason !== undefined ? { reason: v.reason } : {}),
        },
        verdicts,
      };
    }
    if (v.halftone) halftone = true;
  }
  return { result: { visible: true, halftone, reason: 'chain-passed' }, verdicts };
}

/** Run the full chain wrapped in an OTel span per the spec's
 *  `pryzm.visibility.wave.{n}` requirement (S46 §"Exit Criteria" line 568).
 *
 *  Each wave gets its own span so per-wave latency is visible in Honeycomb.
 *  Production exporter wiring is shared with the rest of L7 (no separate
 *  setup); the spans are dropped if no exporter is configured. */
export function runWaveChainTraced(
  ctx: VisibilityWaveContext,
  chain: readonly NamedWave[] = DEFAULT_WAVE_CHAIN,
): ChainResult {
  const tracer = trace.getTracer('@pryzm/visibility');
  return tracer.startActiveSpan('pryzm.visibility.chain', (rootSpan) => {
    try {
      const verdicts: { waveId: string; result: VisibilityResult }[] = [];
      let halftone = false;
      for (const wave of chain) {
        const v = tracer.startActiveSpan(`pryzm.visibility.${wave.id}`, (span) => {
          try {
            const result = wave.fn(ctx);
            span.setAttribute('pryzm.visibility.visible', result.visible);
            if (result.halftone) span.setAttribute('pryzm.visibility.halftone', true);
            if (result.reason) span.setAttribute('pryzm.visibility.reason', result.reason);
            return result;
          } catch (err) {
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw err;
          } finally {
            span.end();
          }
        });
        verdicts.push({ waveId: wave.id, result: v });
        if (!v.visible) {
          rootSpan.setAttribute('pryzm.visibility.short_circuit_at', wave.id);
          return {
            result: {
              visible: false,
              halftone: halftone || v.halftone === true,
              ...(v.reason !== undefined ? { reason: v.reason } : {}),
            },
            verdicts,
          };
        }
        if (v.halftone) halftone = true;
      }
      return { result: { visible: true, halftone, reason: 'chain-passed' }, verdicts };
    } finally {
      rootSpan.end();
    }
  });
}

/** Bulk evaluator — runs the chain for every element in the view, in the
 *  order required by the wave dependencies.  Walls are resolved BEFORE
 *  their join caps (wave-4 dependency) and BEFORE openings (wave-5
 *  dependency).  Returns a per-element visibility map.
 *
 *  This is the entry point apps/editor will use; individual `runWaveChain`
 *  is exported for tests + ad-hoc callers. */
export function evaluateViewVisibility(
  elements: readonly VisibilityElement[],
  view: VisibilityView,
  chain: readonly NamedWave[] = DEFAULT_WAVE_CHAIN,
): ReadonlyMap<string, VisibilityResult> {
  const resolved = new Map<string, VisibilityResult>();
  // Pass 1: walls + plain elements (no parent / host dependency).
  for (const el of elements) {
    if (el.parentWallId || el.hostWallId) continue;
    const ctx: VisibilityWaveContext = { element: el, activeView: view, resolvedVisibility: visibilityView(resolved) };
    resolved.set(el.id, runWaveChain(ctx, chain).result);
  }
  // Pass 2: dependents (join caps + openings).
  for (const el of elements) {
    if (!el.parentWallId && !el.hostWallId) continue;
    const ctx: VisibilityWaveContext = { element: el, activeView: view, resolvedVisibility: visibilityView(resolved) };
    resolved.set(el.id, runWaveChain(ctx, chain).result);
  }
  return resolved;
}

function visibilityView(resolved: ReadonlyMap<string, VisibilityResult>): ReadonlyMap<string, boolean> {
  const out = new Map<string, boolean>();
  for (const [id, r] of resolved) out.set(id, r.visible);
  return out;
}

// ─── Re-exports ────────────────────────────────────────────────────────────

export {
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
};
export type {
  VisibilityElement,
  VisibilityView,
  VisibilityViewTemplate,
  VisibilityWaveContext,
  VisibilityResult,
  WaveFn,
  NamedWave,
  ChainResult,
  ViewFilterOverride,
  PhaseFilterState,
  TemporaryIsolationState,
} from './types.js';
