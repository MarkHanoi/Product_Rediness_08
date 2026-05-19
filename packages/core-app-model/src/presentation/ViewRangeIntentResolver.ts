/**
 * ViewRangeIntentResolver — Plan View Below-Level Depth Resolution
 * src/core/presentation/ViewRangeIntentResolver.ts
 *
 * Resolves the effective "view depth Y" for a plan view by consulting the
 * active VisibilityIntent's planViewRange.belowLevelDepth setting.
 *
 * Problem being solved:
 *   ViewRangeDefaults sets depth = host.elevation − 0.05 m (5 cm below the
 *   current level).  This makes the BEYOND zone effectively empty: elements
 *   from the storey below are never visible in plan view.
 *
 * Solution:
 *   Read the intent's planViewRange.belowLevelDepth (architectural default
 *   1.20 m) and return depthY = host.elevation − belowLevelDepth.
 *   This extends the BEYOND zone downward so the top 1.20 m of the lower
 *   storey's elements (structure, walls, columns) are rendered as
 *   semi-transparent reference geometry — exactly matching Revit behaviour.
 *
 * Usage in ViewRangeFilterService and ViewRangeZoneApplicator:
 *   Use resolveEffectiveViewRange(viewDef, levels) to get the active range,
 *   then resolveViewRangeWorldY(bound, levels) to get absolute Y values.
 *   The depth bound automatically extends 1.20 m below the host level floor.
 *
 * Contract compliance:
 *   §01 §2   — Read-only; no store writes, no Command calls.
 *   §02 §1.2 — No absolute Y stored; all resolved from level + offset.
 *   §05 §7   — No DOM, no Three.js, pure TypeScript utility.
 *   §07      — No server routes; client-side only.
 */

import type { Level } from '@pryzm/core-app-model';
import type { ViewDefinition, ViewRangeBound, ViewRangeSettings } from '../views/ViewDefinitionTypes';
import { viewIntentInstanceStore } from './ViewIntentInstanceStore';
import { visibilityIntentStore } from './VisibilityIntentStore';
import { computeViewRangeDefaults } from '@pryzm/core-app-model';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Architectural convention: metres below the current level floor elevation
 * that define the bottom of the BEYOND reference zone in plan views.
 * Matches the system intent default (ArchitecturalDocumentation).
 */
export const DEFAULT_BELOW_LEVEL_DEPTH = 1.20;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function resolveWorldY(levelId: string, offset: number, levels: Level[]): number | null {
    const level = levels.find(l => l.id === levelId);
    return level != null ? level.elevation + offset : null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Converts a ViewRangeBound { levelId, offset } to an absolute world Y
 * coordinate using the supplied level list.
 * Returns null when the referenced level is not found.
 */
export function resolveViewRangeWorldY(
    bound: ViewRangeBound,
    levels: Level[],
): number | null {
    return resolveWorldY(bound.levelId, bound.offset, levels);
}

/**
 * Returns the effective ViewRangeSettings for the given plan view.
 *
 * Priority:
 *  1. viewDef.viewRange if it is explicitly stored — returned as-is.
 *  2. Synthesised defaults from computeViewRangeDefaults, using the intent's
 *     planViewRange.belowLevelDepth (default: 1.20 m) so the BEYOND zone
 *     already extends 1.20 m below the host level floor even for views that
 *     have never had their range explicitly saved.
 *
 * Returns null only when neither a viewRange nor a host level can be resolved
 * (degenerate: no levels in the project at all).
 */
export function resolveEffectiveViewRange(
    viewDef: ViewDefinition,
    levels: Level[],
): ViewRangeSettings | null {
    if (viewDef.viewRange) return viewDef.viewRange;

    if (!viewDef.spatial?.levelId && levels.length === 0) return null;

    // Read belowLevelDepth from the active intent so the synthesised depth
    // already matches the intent's architectural convention.
    let belowLevelDepth = DEFAULT_BELOW_LEVEL_DEPTH;

    const instance = viewIntentInstanceStore.get(viewDef.id);
    const intent   = instance ? visibilityIntentStore.get(instance.intentId) : undefined;

    if (intent?.planViewRange) {
        const pvr = intent.planViewRange;
        if (viewDef.viewType === 'structural-plan' && pvr.structuralPlanBelowLevelDepth !== undefined) {
            belowLevelDepth = pvr.structuralPlanBelowLevelDepth;
        } else if (pvr.belowLevelDepth !== undefined) {
            belowLevelDepth = pvr.belowLevelDepth;
        }
    }

    return computeViewRangeDefaults(viewDef.spatial?.levelId, levels, belowLevelDepth);
}

/**
 * Resolves the effective depth-Y world coordinate for a plan view.
 *
 * Priority order:
 *  1. Intent's planViewRange.belowLevelDepth (or structuralPlanBelowLevelDepth)
 *     → depthY = host.elevation − belowLevelDepth
 *  2. If belowLevelDepth = 0 or no intent found → fall back to the view's
 *     explicit viewRange.depth binding.
 *  3. If no host level is known → fall back to the view's depth binding.
 *
 * @param viewId         — The active ViewDefinition's ID.
 * @param viewType       — The active view's type string (e.g. 'plan', 'structural-plan').
 * @param hostLevelId    — The host level ID from viewDef.spatial.levelId.
 * @param viewRangeDepth — The explicit depth binding from viewDef.viewRange.depth.
 * @param levels         — All project levels (from BimManager.getLevels()).
 * @returns              World Y of the effective depth boundary, or null if it
 *                       cannot be resolved.
 */
export function resolveEffectivePlanDepthY(
    viewId: string,
    viewType: string,
    hostLevelId: string | undefined,
    viewRangeDepth: { levelId: string; offset: number } | undefined,
    levels: Level[],
): number | null {

    // ── Step 1: read belowLevelDepth from the active intent ──────────────────
    let belowLevelDepth = DEFAULT_BELOW_LEVEL_DEPTH;

    const instance = viewIntentInstanceStore.get(viewId);
    const intent   = instance ? visibilityIntentStore.get(instance.intentId) : undefined;

    if (intent?.planViewRange) {
        const pvr = intent.planViewRange;
        if (viewType === 'structural-plan' && pvr.structuralPlanBelowLevelDepth !== undefined) {
            belowLevelDepth = pvr.structuralPlanBelowLevelDepth;
        } else if (pvr.belowLevelDepth !== undefined) {
            belowLevelDepth = pvr.belowLevelDepth;
        }
    }

    // ── Step 2: fall back when feature is disabled or no host level ──────────
    if (belowLevelDepth <= 0 || !hostLevelId) {
        if (!viewRangeDepth) return null;
        return resolveWorldY(viewRangeDepth.levelId, viewRangeDepth.offset, levels);
    }

    // ── Step 3: find the host level ──────────────────────────────────────────
    const host = levels.find(l => l.id === hostLevelId);
    if (!host) {
        if (!viewRangeDepth) return null;
        return resolveWorldY(viewRangeDepth.levelId, viewRangeDepth.offset, levels);
    }

    // ── Step 4: compute depthY = host floor − belowLevelDepth ────────────────
    // This places the BEYOND zone from (host.elevation − belowLevelDepth) up to
    // host.elevation, which captures the top 1.20 m of the storey below:
    // structural beams, slab edges, column capitals, and the tops of walls.
    const depthY = host.elevation - belowLevelDepth;

    console.debug(
        `[ViewRangeIntentResolver] view="${viewId}" host="${hostLevelId}"` +
        ` elevation=${host.elevation.toFixed(3)}` +
        ` belowLevelDepth=${belowLevelDepth}` +
        ` → depthY=${depthY.toFixed(3)}`
    );

    return depthY;
}
