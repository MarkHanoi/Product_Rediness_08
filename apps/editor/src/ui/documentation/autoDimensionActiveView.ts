// §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS (L-263) — the SINGLE Auto-Dimension entry point.
//
// One engine, multiple consumers — and therefore ONE button, not two. The user asks
// for "auto-dimension"; the ACTIVE VIEW decides which measurement plane and which
// rule set that means. Adding a second "Auto-dimension elevation" command would push
// the view/strategy choice onto the user and would be the very plan-first,
// bolt-on-per-view-type pattern this ticket exists to stop.
//
// Routing is by view type, resolved from the ViewDefinition — the same discriminator
// `ViewPlane.isVertical` uses (Contract 24 §3.1):
//
//   plan / ceiling-plan / structural-plan  → applyAutoDimensions          (horizontal, XZ)
//   elevation / building-elevation         → applyElevationAutoDimensions (vertical, world-Y)
//   section                                → NOT YET. See below.
//
// SECTION is deliberately not routed. A section's vertical rule set is genuinely
// different again (it measures the CUT: structural zones, ceiling voids, head heights
// on the cut plane — not just the façade datums), and shipping the elevation rules
// under a section's name would produce a drawing that is confidently wrong. It is the
// next consumer of this same engine, not a copy of this one.

import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { applyAutoDimensions } from './applyAutoDimensions.js';
import { applyElevationAutoDimensions } from './applyElevationAutoDimensions.js';

const PLAN_VIEW_TYPES: ReadonlySet<string> = new Set(['plan', 'ceiling-plan', 'structural-plan']);
const ELEVATION_VIEW_TYPES: ReadonlySet<string> = new Set(['elevation', 'building-elevation']);

interface ViewControllerLike { currentViewDefinitionId?: string | null }

/**
 * The strategy the active view calls for. Exported (and pure over its input) so the
 * routing rule is unit-testable without a runtime — the decision must not be locked
 * inside a click handler.
 */
export function resolveAutoDimensionStrategy(
  viewType: string | undefined,
): 'plan' | 'elevation' | 'unsupported' {
  if (!viewType) return 'unsupported';
  if (PLAN_VIEW_TYPES.has(viewType)) return 'plan';
  if (ELEVATION_VIEW_TYPES.has(viewType)) return 'elevation';
  return 'unsupported';
}

/**
 * Auto-dimension the ACTIVE view, whatever kind it is. Returns the number of
 * dimensions created. Never throws.
 */
export function autoDimensionActiveView(runtime: PryzmRuntime): number {
  const viewId = (window as unknown as { viewController?: ViewControllerLike })
    .viewController?.currentViewDefinitionId ?? undefined;
  const viewType = viewId ? viewDefinitionStore.get(viewId)?.viewType : undefined;

  switch (resolveAutoDimensionStrategy(viewType)) {
    case 'plan':
      return applyAutoDimensions(runtime);
    case 'elevation':
      return applyElevationAutoDimensions(runtime);
    default:
      runtime.events?.emit('pryzm:toast', {
        message:
          viewType === 'section'
            ? 'Auto-Dimension: sections are not supported yet — open a plan or an elevation.'
            : 'Auto-Dimension: open a plan or an elevation view first.',
        severity: 'warn',
      });
      return 0;
  }
}
