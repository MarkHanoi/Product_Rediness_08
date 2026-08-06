/**
 * StairToolConfigStore — §FIX-STAIR-PLAN-CREATION-BLOCKED (L-243) P2.
 *
 * THE SINGLE SOURCE OF TRUTH for the stair configuration the architect chose
 * (shape / width / stair TYPE / drawing mode), resolved ONCE, BELOW the tools.
 *
 * ── The disease this cures (C11) ──────────────────────────────────────────────
 *
 * `StairPlanToolHandler` used to read `window.activeStairConfig` — a global that
 * only the *3D* path's `StairSetupPanel.onConfirm` ever stamped. So a stair drawn
 * in PLAN silently lost the user's chosen shape, width and type unless they had
 * first been through the 3D flow. The file's own `TODO(STAIR-PLAN-DI)` admitted it.
 *
 * That is the same defect as L-239 (wall layers), L-213 (floor finishes) and
 * L-240 (floor inner face): ONE element type, TWO creation paths, and the plan
 * path silently drops what the 3D path resolved. It was also a live P4 violation
 * (a `window.*` global read from a package-governed handler).
 *
 * ── The cure ──────────────────────────────────────────────────────────────────
 *
 * Every WRITER (the ribbon's I/L/U buttons, the StairSetupPanel, the stair-path
 * param panel) writes HERE. Every READER (the plan tool, the stair-path tool, the
 * 3D sketch tool, batch generators, AI) reads the SAME resolved config — the plan
 * handlers receive it by DEPENDENCY INJECTION through `PlanToolDrawContext.stairConfig`,
 * matching the `WallPlanToolHandler` / `SlabPlanToolHandler` shape. No globals.
 *
 * L-216 (15 stair types) NOTE: `typeId` is threaded end-to-end here. Once the
 * catalogue lands, a type picker only has to call `setStairToolConfig({ typeId })`
 * and EVERY creation path — plan, 3D, path-tool, batch, AI — inherits it by
 * construction. No further plumbing is required.
 *
 * Pure: no DOM, no THREE, no I/O.
 */

// §FIX-STAIR-SHAPE-DESYNC — the shape CATALOGUE (labels, drawing mode, click
// budget) lives in ONE place, `stairPath/StairShapeRegistry`. This store remains
// the authority for the architect's CHOSEN config; it no longer carries a second,
// narrower spelling of the shape union. The old local union omitted 'C', which is
// why curved stairs were authorable in the param panel but had no palette icon and
// could not survive a round-trip through the tool config (founder: "we are MISSING
// ONE FOR CURVED STAIR").
export type { StairShapeChoice } from './stairPath/StairShapeRegistry';
import type { StairShapeChoice } from './stairPath/StairShapeRegistry';

export interface StairToolConfig {
    /** The architect's chosen stair shape. Defaults to straight. */
    readonly shape: StairShapeChoice;
    /**
     * Chosen stair width in metres, or undefined to let the tool derive it from
     * the drawn footprint (the plan tool's bounding box short axis).
     */
    readonly width?: number;
    /** Stair TYPE id (L-216 catalogue). Undefined = engine default type. */
    readonly typeId?: string;
    /** Drawing mode hint carried by the 3D setup panel. */
    readonly mode?: 'linear' | 'ortho';
}

export const DEFAULT_STAIR_TOOL_CONFIG: StairToolConfig = { shape: 'I' };

let _current: StairToolConfig = DEFAULT_STAIR_TOOL_CONFIG;

/** Read the resolved stair config. Tools should prefer the DI'd `ctx.stairConfig`. */
export function getStairToolConfig(): StairToolConfig {
    return _current;
}

/** Merge a partial choice into the resolved config. Called by every WRITER. */
export function setStairToolConfig(patch: Partial<StairToolConfig>): StairToolConfig {
    _current = { ..._current, ...patch };
    return _current;
}

/** Reset to defaults — used on project switch (Contract 48 project isolation). */
export function resetStairToolConfig(): void {
    _current = DEFAULT_STAIR_TOOL_CONFIG;
}
