/**
 * ViewRangeDefaults — Phase VI (VI-13)
 * src/core/views/ViewRangeDefaults.ts
 *
 * Pure computation helper: derives intelligent default ViewRangeSettings
 * from a view's spatial context (levelId) and the project's level hierarchy.
 *
 * Revit-equivalent offset conventions (metres, relative to level elevation):
 *   Top    = level above at offset 0 (if exists), else host level + floor-to-floor height
 *   Cut    = host level + 1.2  (standard architectural cut plane, ~door/window height)
 *   Bottom = host level + 0.0  (level datum — shows elements from floor slab up)
 *   Depth  = host level − 0.05 (slightly below floor for slab/foundation visibility)
 *
 * Contract compliance:
 *   §01 §2    — Read-only computation; no store writes, no command calls.
 *   §02 §1    — No absolute Y values stored or returned. All results are
 *               (levelId + offset) pairs — worldY deferred to engine via
 *               BimManager.getLevelById(id).elevation + offset.
 *   §02 §1.2  — Level-to-world mapping is the engine's responsibility, not ours.
 *   §05 §7    — No @thatopen/ui, no bim-* elements, no Three.js. Pure TypeScript.
 *   §07       — No server routes; client-only module.
 */

import type { ViewRangeSettings } from './ViewDefinitionTypes';
import type { Level }             from '@pryzm/core-app-model';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Standard offsets in metres — Revit-equivalent architectural conventions. */
const STD_OFFSETS = {
    CUT:    1.2,    // Cut plane: standard door/window height above floor
    BOTTOM: 0.0,    // Bottom: level datum (top-of-structural-slab reference)
    DEPTH: -0.05,   // Depth: just below floor datum for slab/footing visibility
} as const;

/**
 * DOC-1.5d — Named presets for `ViewDefinitionSpatial.viewRange`.
 *
 * Both fields are measured IN METRES FROM THE LEVEL FLOOR ELEVATION
 * (see ViewDefinitionTypes.ts §spatial.viewRange for the definitive contract).
 *
 *   nearOffset = cut plane height above floor (where walls/doors are cut).
 *   farOffset  = top of the visible range above floor.
 *
 * Usage:
 *   viewDef.spatial.viewRange = VIEW_RANGE_PRESETS.structural;
 */
export const VIEW_RANGE_PRESETS = {
    /** Standard AEC floor plan — 1.2 m cut, 3.0 m upper range. */
    standard:   { nearOffset: 1.2, farOffset: 3.0 },
    /** Structural plan — shows ceiling beams up to 4.0 m above floor. */
    structural: { nearOffset: 1.2, farOffset: 4.0 },
    /** Reflected ceiling plan — shallow cut, 2.8 m upper range. */
    rcp:        { nearOffset: 0.0, farOffset: 2.8 },
    /** Site plan — low cut at 0.5 m, 1.5 m upper range. */
    site:       { nearOffset: 0.5, farOffset: 1.5 },
} as const;

/**
 * Assumed floor-to-floor height (metres) when the inter-level distance cannot
 * be derived from the level hierarchy (e.g. only one level exists, or host
 * level is the topmost).
 */
const DEFAULT_FLOOR_HEIGHT = 3.0;

/**
 * Architectural default for below-level depth visibility in plan views.
 * Matches PlanViewRangeDefaults.belowLevelDepth in the system intents.
 */
const DEFAULT_BELOW_LEVEL_DEPTH = 1.20;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Computes intelligent default ViewRangeSettings for a plan-type view.
 *
 * All returned values are (levelId + offset) pairs. No absolute Y/elevation
 * values are computed or stored — in strict compliance with §02 §1.2.
 *
 * @param hostLevelId      The `spatial.levelId` of the ViewDefinition whose
 *                         view range is being initialised. May be `undefined`
 *                         when the view is not yet anchored to a specific level.
 * @param levels           All project levels as returned by BimManager.getLevels().
 *                         May be an empty array during initial project setup.
 * @param belowLevelDepth  Metres below the host level floor to set the depth
 *                         boundary. Defaults to 1.20 m (architectural convention).
 *                         Set to 0 for no below-level visibility.
 * @returns                A fully-populated ViewRangeSettings ready for use as
 *                         default values in the UI or as a SetViewRangeCommand
 *                         payload.
 */
export function computeViewRangeDefaults(
    hostLevelId: string | undefined,
    levels: Level[],
    belowLevelDepth: number = DEFAULT_BELOW_LEVEL_DEPTH,
): ViewRangeSettings {
    // Sort ascending by elevation to reliably locate the level above.
    const sorted = [...levels].sort((a, b) => a.elevation - b.elevation);

    // Resolve host level; fall back to the lowest level when levelId is missing.
    const hostIdx = sorted.findIndex(l => l.id === hostLevelId);
    const host    = hostIdx >= 0 ? sorted[hostIdx] : (sorted[0] ?? null);

    // ── Degenerate case: no levels in project ────────────────────────────────
    if (!host) {
        const fallbackId = hostLevelId ?? '';
        const depthOffset = belowLevelDepth > 0 ? -belowLevelDepth : STD_OFFSETS.DEPTH;
        return {
            top:    { levelId: fallbackId, offset: DEFAULT_FLOOR_HEIGHT },
            cut:    { levelId: fallbackId, offset: STD_OFFSETS.CUT    },
            bottom: { levelId: fallbackId, offset: STD_OFFSETS.BOTTOM },
            depth:  { levelId: fallbackId, offset: depthOffset         },
        };
    }

    // Level immediately above the host floor (next storey up).
    const above = sorted[hostIdx + 1] ?? null;

    // Floor-to-floor height: prefer measured distance; fall back to constant.
    const floorHeight = above
        ? above.elevation - host.elevation
        : DEFAULT_FLOOR_HEIGHT;

    // Depth: extend below the host level floor by belowLevelDepth so that
    // elements from the storey below are visible as BEYOND reference geometry.
    // This captures structural beams, slab edges, column capitals, and the
    // top portion of walls from the level below (architectural convention: 1.20 m).
    const depthOffset = belowLevelDepth > 0 ? -belowLevelDepth : STD_OFFSETS.DEPTH;

    return {
        // Top: underside of the floor above (offset 0) if a level exists above;
        //      otherwise host level + full floor-to-floor height.
        top: above
            ? { levelId: above.id, offset: 0           }
            : { levelId: host.id,  offset: floorHeight },

        // Cut: host level at the standard architectural cut plane (1.2 m).
        cut: { levelId: host.id, offset: STD_OFFSETS.CUT },

        // Bottom: host level datum — base of the visible range.
        bottom: { levelId: host.id, offset: STD_OFFSETS.BOTTOM },

        // Depth: below the host level floor for below-level reference geometry.
        // ViewRangeFilterService and ViewRangeZoneApplicator also use
        // ViewRangeIntentResolver at runtime to respect the intent's
        // belowLevelDepth, so this default serves as the initial persisted value.
        depth: { levelId: host.id, offset: depthOffset },
    };
}
