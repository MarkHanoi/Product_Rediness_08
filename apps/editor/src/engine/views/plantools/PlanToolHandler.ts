/**
 * PlanToolHandler — Contract 21 §2 / Contract 24 §4 Step 2
 *
 * Interface and context types for all 2D plan-view tool handlers.
 *
 * Contract compliance:
 *   §21 §2  — Immutable context injected on activate(); handlers never attach DOM listeners.
 *   §24 §3  — PlanToolDrawContext now includes ViewPlane for view-type-agnostic coordinate
 *             reconstruction. Handlers call canvasHitToWorld3D(pt, ctx.viewPlane) to get
 *             the correct 3D world position regardless of view type.
 */

import type { PlanViewCanvas }    from '@pryzm/core-app-model';
import type { PlanViewInteraction } from '../PlanViewInteraction';
import type { ViewDefinition }    from '@pryzm/core-app-model';
import type { ViewPlane }         from '@pryzm/core-app-model';
import type { CommandManager }    from '@pryzm/command-registry';
import type { WallStore } from '@pryzm/geometry-wall';
import type { StairToolConfig } from '@pryzm/geometry-stair';
import type { DoorToolConfig } from '@pryzm/geometry-door';
import type { FloorToolConfig } from '@pryzm/core-app-model/stores';
import type { PryzmRuntime }     from '@pryzm/runtime-composer/types';

/**
 * Immutable context injected into every handler on activate().
 * Handlers MUST NOT store these references beyond the activate/deactivate lifecycle.
 * Handlers MUST NOT call addEventListener/removeEventListener on any of these.
 */
export interface PlanToolDrawContext {
    /** The transparent Canvas2D overlay element — for geometry reads only. */
    readonly overlayCanvas: HTMLCanvasElement;
    /** The raw HTML canvas element used by the plan view (base drawing surface). */
    readonly baseCanvas: HTMLCanvasElement;
    /** 2D rendering context for preview drawing. */
    readonly ctx: CanvasRenderingContext2D;
    /** PlanViewCanvas — coordinate transforms (worldToScreen, screenToWorld, hitTest, getPixelsPerUnit). */
    readonly planCanvas: PlanViewCanvas;
    /** PlanViewInteraction — snap query. */
    readonly interaction: PlanViewInteraction;
    /** Active view definition (levelId, spatial bounds, view ID). */
    readonly viewDef: ViewDefinition;
    /**
     * Device pixel ratio (already computed and bounded to [1, 4]).
     * Handlers MUST apply this via ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
     * at the start of every draw call.
     */
    readonly dpr: number;
    /**
     * The abstract work plane for the active view — Contract 24 §3.1.
     *
     * Use `canvasHitToWorld3D(pt, ctx.viewPlane)` (from ViewPlane.ts) to convert
     * a `WorldPoint` click into a correct 3D world-space position for command dispatch.
     *
     * For plan/ceiling-plan/detail views:
     *   viewPlane.isVertical = false → world3D = (pt.worldX, levelY, pt.worldZ)
     *
     * For section/elevation views:
     *   viewPlane.isVertical = true → world3D accounts for hWorldAxis remapping
     *   (pt.worldZ is actually world-Y / elevation in these views).
     */
    readonly viewPlane: ViewPlane;

    /**
     * §DOOR-AUDIT-2026 / §WINDOW-AUDIT-2026 (DI cleanup) — explicit dependency
     * injection for plan-tool handlers that previously reached into window-global
     * to grab the command manager, wall store, or active opening tool. The overlay
     * populates these from its bootstrap singletons; handlers must read them from
     * the context only and never touch window globals.
     *
     * All three are optional so existing handlers (Wall/Slab/Column/Roof/etc.) that
     * don't need them remain unchanged.
     */
    readonly commandManager?: CommandManager;
    readonly wallStore?:      WallStore;
    /**
     * §P4.1 — Full PryzmRuntime handle threaded from `_buildCtx()` so handlers
     * can use `ctx.runtime?.bus?.executeCommand(...)` instead of reaching into
     * `(window as any).runtime`.  Optional so existing handlers that do not need
     * it remain unchanged.  Set to `window.runtime` at construction time by both
     * `PlanViewToolOverlay._buildCtx()` and `SvpPlanToolOverlay._buildCtx()`.
     */
    readonly runtime?: PryzmRuntime;
    /**
     * The 3D opening tool currently selected (DoorTool or WindowTool instance) —
     * carries live `doorType` / `windowType` / `width` / `systemTypeId` config that
     * the plan-view handler mirrors when placing an opening. Typed `unknown` to
     * avoid a circular import between core/views and elements.
     */
    readonly activeOpeningTool?: { readonly doorType?: 'single' | 'double'; readonly windowType?: 'single' | 'double'; readonly systemTypeId?: string };

    /**
     * §FIX-STAIR-PLAN-CREATION-BLOCKED (L-243) P2 — the architect's resolved stair
     * configuration (shape / width / stair TYPE), injected by the overlay from the
     * single `StairToolConfigStore` chokepoint in `@pryzm/geometry-stair`.
     *
     * This slot exists to KILL `window.activeStairConfig`. The plan stair handler
     * used to scavenge that global — which only the *3D* path's StairSetupPanel ever
     * stamped — so a plan-drawn stair silently lost the user's shape/width/type
     * (the same C11 defect as L-239 / L-213 / L-240) and it was a live P4 violation.
     * The config now reaches every creation path identically, resolved BELOW the tools.
     *
     * This is the `TODO(STAIR-PLAN-DI)` the handler itself asked for, discharged.
     */
    readonly stairConfig?: StairToolConfig;

    /**
     * §FIX-DOOR-CREATION-PARITY (L-260 A) — the architect's resolved DOOR configuration,
     * injected by the overlay from the single `DoorToolConfigStore` chokepoint in
     * `@pryzm/geometry-door`.
     *
     * THE SEVENTH INSTANCE OF THE SAME DEFECT, AND THE SAME CURE.
     *
     * The founder: *"The doors are rendering different — one was created on PLAN VIEW
     * (split mode), the other in 3D — why?"* Because the two creation paths resolved the
     * door's configuration from different places, so a plan-drawn door and a 3D-drawn door
     * of the "same" type were not the same object.
     *
     * That is C11's signature failure, and this audit has now hit it seven times:
     *   L-239 (wall layers) · L-240 (floor-finish inner face) · L-243 (stair config, the
     *   slot directly above) · L-246 (the plan cut) · L-251 (the mitre) · L-255 (the
     *   floor-finish elevation modal) · and now the door.
     *
     * The cure is always the same shape, and it is the one L-243 established: DO NOT teach
     * the plan tool to imitate the 3D tool — that leaves two paths that must be kept in
     * step by hand, and they never are. Resolve the config ONCE, BELOW the tools, at the
     * creation chokepoint, and let the 3D tool, the plan tool, batch generators and the AI
     * all inherit the identical truth.
     *
     * Optional so a handler constructed without a context still falls back to
     * `getDoorToolConfig()` — the SAME store, never a `window.*` global (P4).
     */
    readonly doorConfig?: DoorToolConfig;

    /**
     * §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — the architect's resolved FLOOR-FINISH
     * configuration (finish TYPE · assembly THICKNESS · BASE OFFSET, i.e. the FFL elevation),
     * injected by the overlay from the single `FloorToolConfigStore` chokepoint in
     * `@pryzm/core-app-model/stores`.
     *
     * THE EIGHTH INSTANCE OF THE SAME DEFECT, AND THE SAME CURE.
     *
     * The founder: *"Floor finish creation in PLAN VIEW (auto) doesn't bring the UI modal that
     * is required and IS WORKING on 3D VIEW — which provides the ELEVATION LEVEL of the floor
     * finish."* The missing modal was the symptom; the missing RECORD was the defect. The plan
     * handler dispatched `floor.create` with polygon + levelId and nothing else, so the finish
     * type, its layer snapshot, its thickness and its elevation were all re-invented by three
     * different downstream defaults — and the one the MESH builder read (`?? 0.075` / `?? 0` in
     * the initTools bus→legacy mirror) was the one nobody had chosen.
     *
     * Same lineage, same fix as the two slots above: the choice is resolved ONCE, BELOW the
     * tools; the 3D tool, the plan handler, batch generators and the AI all inherit it.
     *
     * Optional so a handler constructed without a context still falls back to
     * `getFloorToolConfig()` — the SAME store, never a `window.*` global (P4).
     */
    readonly floorConfig?: FloorToolConfig;
}

/**
 * 2D point returned by PlanViewCanvas.screenToWorld().
 *
 * IMPORTANT — naming caveat for section/elevation views:
 *   `worldZ` is repurposed to carry **world-Y (elevation)** in section/elevation views
 *   (Contract 22 §6.1). Never reconstruct 3D coordinates by hand — always use
 *   `canvasHitToWorld3D(pt, ctx.viewPlane)` which handles the mapping correctly.
 */
/**
 * Object-snap families that may be attached to a WorldPoint by the overlay.
 * Mirrors PlanSnapType in PlanViewInteraction.ts. When a handler sees one of
 * the "strong" snaps (everything except 'nearest'), it MUST respect the snap
 * verbatim and skip auxiliary constraints like ortho / angle locks — this is
 * the Revit/AutoCAD convention: an explicit object snap always wins.
 */
export type WorldPointSnapType =
    | 'endpoint'
    | 'midpoint'
    | 'perpendicular'
    | 'grid-line'
    | 'grid-intersection'
    | 'intersection'
    | 'nearest';

export interface WorldPoint {
    readonly worldX: number;
    readonly worldZ: number;
    /** Set by the overlay when this point was resolved by an object snap. */
    readonly snapType?: WorldPointSnapType;
    /** Optional source id for grid-line / grid-intersection snaps. */
    readonly snapSourceId?: string;
}

/** Returns true when the snap is a strong, explicit object snap (not the low-priority "nearest" fallback). */
export function isStrongSnap(pt: WorldPoint): boolean {
    return !!pt.snapType && pt.snapType !== 'nearest';
}

/**
 * Every plan-view creation/annotation tool implements this interface.
 *
 * Lifecycle:
 *   activate(ctx) → [mouse/keyboard events] → deactivate()
 *
 * The coordinator calls these methods; the handler NEVER attaches DOM listeners itself.
 */
export interface PlanToolHandler {
    /**
     * Called when the tool becomes active (user selects it from the toolbar).
     * Handler initialises its state and may render an idle preview.
     */
    activate(ctx: PlanToolDrawContext): void;

    /**
     * Called when the tool is deactivated (tool change, ESC, view close).
     * Handler MUST reset all state and clear the overlay via ctx.ctx.clearRect().
     * After this call the coordinator nulls out its ctx reference.
     */
    deactivate(): void;

    /**
     * Called on every mousemove event while this tool is active.
     * Handler updates its cursor preview and redraws the overlay.
     */
    onMouseMove(pt: WorldPoint): void;

    /**
     * Called on confirmed mouse click (not a pan start).
     * Handler progresses the tool state machine (first click, second click, commit).
     */
    onClick(pt: WorldPoint): void;

    /**
     * Optional mouse-up hook for drag-first tools. Existing click-based tools do
     * not implement it and keep their current behavior.
     */
    onMouseUp?(pt: WorldPoint): void;

    /**
     * Called on double-click (if the coordinator forwards it).
     * Most tools use this to close a polygon/polyline.
     * Default behaviour: ignored. Handlers only override if they need it.
     */
    onDoubleClick?(pt: WorldPoint): void;

    /**
     * Called on keydown events forwarded by the coordinator.
     * @returns true if the handler consumed the event (prevents coordinator defaults).
     */
    onKeyDown?(e: KeyboardEvent): boolean;

    /**
     * Called when the user presses Escape or the coordinator resets tools.
     * Handler resets its multi-step state but stays active (tool remains selected).
     */
    cancel(): void;

    /**
     * Redraws the current tool preview onto the overlay.
     * Called by the coordinator when a redraw is needed outside of a mousemove
     * (e.g. canvas resize). Handlers MUST be idempotent.
     */
    redraw(): void;

    /**
     * §T-B1 (DAILY-USE-AUDIT 2026-05-20) — OPT-IN stroke-preservation contract.
     *
     * Multi-step tools (Wall polyline, Slab polygon, Floor polygon, Roof polyline,
     * Room boundary, Ceiling polygon, Opening, etc.) accumulate intermediate state
     * across multiple clicks (`_points[]`, `_wallFirstPoint`, etc.). When the user
     * temporarily leaves the canvas area mid-stroke (e.g. moves the cursor to the
     * toolbar to read a dimension), the overlay would previously deactivate the
     * handler — wiping the entire in-progress polyline.
     *
     * Handlers with multi-click state SHOULD implement this method to return
     * `true` whenever they hold uncommitted state. The overlay's mouse-leave path
     * will then SUSPEND focus (hide tooltip, blur) without calling `deactivate()`,
     * so the partial stroke survives the user's brief excursion off-canvas.
     *
     * Single-click tools (Door, Window, Furniture single-placement, Plumbing
     * fixture, Lighting, etc.) need NOT implement this — the default `undefined`
     * is treated as "no active stroke" and the overlay's existing deactivate-on-leave
     * behaviour applies.
     *
     * Lifecycle invariant: a handler returning `true` from `hasActiveStroke()`
     * MUST also fully reset that state inside `cancel()` (Escape) and
     * `deactivate()` (tool switch / project switch) — those are the only two
     * paths that should ever discard pending stroke state.
     */
    hasActiveStroke?(): boolean;
}
