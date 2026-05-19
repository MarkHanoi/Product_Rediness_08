/**
 * IntentBindingResolver — Wave 9 / Stage S6 facade
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Thin coordinator that wires the three live singletons
 * (`viewDefinitionStore`, `viewIntentInstanceStore`, `visibilityIntentStore`)
 * into the lower-level, dependency-injected helper
 * `resolveWithInheritance` from `IntentRuleResolver.ts`.
 *
 * Wave 9 closes the Stage S6 gap (G-A4): detail / dependent views inherit
 * their parent view's bound Intent when no own binding exists. The walk is
 * cycle-safe (delegated to `resolveWithInheritance`'s `Set<viewId>` guard,
 * Risk R1 in the plan).
 *
 * Three top-level entry points:
 *
 *   - `resolveBoundIntentWithInheritance(viewId)` — primary read path.
 *     Returns the leaf view's `ViewIntentInstance` plus the
 *     `VisibilityIntent` definition that the resolver chain landed on
 *     (own binding if present, else nearest ancestor).
 *
 *   - `getInheritedFromViewId(viewId)` — UI helper for the "Inherits from
 *     <parent>" badge in `ViewPropertiesPanel`. Returns the ancestor view
 *     id whose binding was actually used, or `null` if (a) the view has its
 *     own binding, or (b) no ancestor in the chain has one either.
 *
 *   - `resolveInheritanceChain(viewId)` — diagnostic helper that lists the
 *     full ancestor chain walked (leaf first), useful for tooltips and
 *     future debug surfaces.
 *
 * The helpers are deliberately stateless and synchronous — they read the
 * three stores at call time and never cache. Stores already emit events on
 * mutation, so consumers can re-call on `vi:instance-updated` /
 * `view-definition-updated` without staleness risk.
 */

import {
    resolveWithInheritance,
    type InheritanceContext,
} from './IntentRuleResolver';
import { viewIntentInstanceStore } from './ViewIntentInstanceStore';
import { visibilityIntentStore } from './VisibilityIntentStore';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import type { ViewIntentInstance, VisibilityIntent } from './VisibilityIntentTypes';

/**
 * Build the live `InheritanceContext` from the three singleton stores.
 *
 * Kept as a top-level factory (rather than a module-level constant) so unit
 * tests and future synthetic-store sites can construct a context against a
 * stub set without monkey-patching the singletons.
 */
export function defaultInheritanceContext(): InheritanceContext {
    return {
        getParentViewId: (viewId: string): string | null => {
            const def = viewDefinitionStore.get(viewId);
            return def?.parentViewId ?? null;
        },
        getInstance: (viewId: string): ViewIntentInstance | null => {
            return viewIntentInstanceStore.get(viewId) ?? null;
        },
        getIntent: (intentId: string): VisibilityIntent | null => {
            return visibilityIntentStore.get(intentId) ?? null;
        },
    };
}

/**
 * Primary read path — returns the effective `(instance, intent)` pair for the
 * given view, walking the parent chain when the view has no own binding.
 *
 * Returns `null` when neither the view nor any ancestor has a bound Intent.
 *
 * Note: the `instance` field is the **leaf** view's instance (so local
 * overrides are preserved). The `intent` field is whichever intent definition
 * the chain resolved to — this is the contract from `resolveWithInheritance`.
 */
export function resolveBoundIntentWithInheritance(
    viewId: string,
): { instance: ViewIntentInstance; intent: VisibilityIntent } | null {
    if (!viewId) return null;
    return resolveWithInheritance(viewId, defaultInheritanceContext());
}

/**
 * UI helper — returns the ancestor view id whose binding was actually used,
 * or `null` if (a) the view has its own binding, or (b) no ancestor has one.
 *
 * Used by `ViewPropertiesPanel` to render an "Inherits from <parentName>"
 * badge when the active view is showing an inherited intent.
 *
 * The walk is cycle-safe via the same `Set<viewId>` guard as
 * `resolveWithInheritance`.
 */
export function getInheritedFromViewId(viewId: string): string | null {
    if (!viewId) return null;
    if (viewIntentInstanceStore.has(viewId)) return null;
    const seen = new Set<string>();
    let current: string | null = viewDefinitionStore.get(viewId)?.parentViewId ?? null;
    while (current && !seen.has(current)) {
        seen.add(current);
        if (viewIntentInstanceStore.has(current)) return current;
        current = viewDefinitionStore.get(current)?.parentViewId ?? null;
    }
    return null;
}

/**
 * Diagnostic helper — returns the full ancestor chain walked starting from
 * (and including) `viewId`. Useful for tooltips, debug overlays, and future
 * "show inheritance chain" surfaces.
 *
 * Cycle-safe: stops as soon as a view id is seen twice.
 */
export function resolveInheritanceChain(viewId: string): string[] {
    if (!viewId) return [];
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | null = viewId;
    while (current && !seen.has(current)) {
        seen.add(current);
        chain.push(current);
        current = viewDefinitionStore.get(current)?.parentViewId ?? null;
    }
    return chain;
}
