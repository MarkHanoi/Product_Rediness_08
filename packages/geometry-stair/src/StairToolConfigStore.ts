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
    /**
     * The SKETCH MODE — how the architect draws the run. See `StairDrawMode`.
     *
     * ⚠ This is a DIFFERENT AXIS from `shape`. Do not merge them (§STAIR-TWO-AXES).
     */
    readonly mode?: StairDrawMode;
}

/**
 * §STAIR-TWO-AXES / §FEAT-STAIR-CREATION-MODES (founder, 2026-08-19) — the SECOND
 * AXIS, declared here because the FIRST one already lives in this file and the two
 * were being conflated everywhere else.
 *
 *   `shape` (I / L / U / C)  — the geometry that RESULTS.
 *   `mode`  (linear / ortho) — HOW THE ARCHITECT SKETCHES IT.
 *
 * A stair drawn in Orthogonal mode is still an L-shaped stair. The founder asked for
 * the second axis ("use the UI/UX as the walls: MODE + STAIR TYPE"); he did NOT ask
 * to rename the first. `elementCreationMatrix` had the four SHAPES sitting in the slot
 * it defines as MODE, which is why the stair had four "modes" that were four results.
 *
 * ⛔ CURVED IS NOT A MEMBER, AND THAT IS DELIBERATE. 'C' is a SHAPE
 * (`StairShapeChoice`), authored by the stair-path arc gesture. Adding a `curved`
 * MODE would make one letter mean two things on one bar — the exact defect this
 * split exists to remove. Whether a curved stair should ALSO be sketchable by an
 * arc-constrained mode is an OPEN QUESTION, stated as such in C98 §16.
 */
export type StairDrawMode = 'linear' | 'ortho';

/** Runtime guard — the bar hands back a `string`, so the union must be checked. */
export function isStairDrawMode(v: unknown): v is StairDrawMode {
    return v === 'linear' || v === 'ortho';
}

/**
 * ORTHO is the default, and that is a UNIFICATION rather than a new opinion.
 *
 * MEASURED BEFORE THIS (§FIX-STAIR-MODE-SURFACE-DESYNC): the two surfaces DISAGREED.
 *   • 3D   — `StairCreationController._drawingMode` initialises to `'ortho'` and its
 *            own comment says "matches WallTool ortho". So the 3D tool has ALWAYS
 *            snapped to 90°, and nothing offered a way to turn that off.
 *   • PLAN — `StairPathToolController` has the identical `_snapTo90`, but gated on
 *            SHIFT BEING HELD. Free-hand by default, ortho only while a key is down.
 *
 * One element, two surfaces, opposite defaults, and no picker on either. Taking the
 * 3D default as the shared one changes NO shipped 3D behaviour and turns the plan
 * surface's hold-a-key transient into a real mode that is now visible on the bar and
 * one click from Linear. SHIFT keeps forcing ortho in linear mode, unchanged.
 */
export const DEFAULT_STAIR_DRAW_MODE: StairDrawMode = 'ortho';

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

/**
 * Record the architect's SKETCH MODE. Called by the shared `DrawingModeBar`'s
 * stair branch, from ANY panel instance.
 *
 * ⛔ A mode switch MUST NOT re-activate the tool. `ToolManager.activateTool` runs
 * `deactivateAllInternal()` and destroys the in-progress polyline, so switching mode
 * would mean starting the run over — the defect the shared bar exists to remove
 * (§FEAT-PERSISTENT-MODE-BAR). This writes the store and nothing else.
 *
 * A value outside the union is IGNORED rather than stored, so a stray shape id
 * ('I', 'L', …) arriving from the other axis can never masquerade as a mode.
 */
export function setActiveStairDrawMode(mode: unknown): void {
    if (isStairDrawMode(mode)) _current = { ..._current, mode };
}

/**
 * Resolve the SKETCH MODE, live. Both surfaces call this on every pointer sample —
 * never at activation only — so a pill click applies to the very next click and the
 * points already placed SURVIVE.
 *
 * This is the function that makes `modeSource: 'shared'` TRUE for the stair rows in
 * `elementCreationMatrix`. Before it, the matrix CLAIMED 'shared' while the only
 * writer of `mode` was `StairSetupPanel.onConfirm` (a 3D confirm dialog) and neither
 * plan handler read the field at all — §FIX-FINISH-MODE-PLAN-UNREACHABLE, reproduced
 * verbatim in a second family.
 */
export function resolveActiveStairDrawMode(): StairDrawMode {
    return _current.mode ?? DEFAULT_STAIR_DRAW_MODE;
}
