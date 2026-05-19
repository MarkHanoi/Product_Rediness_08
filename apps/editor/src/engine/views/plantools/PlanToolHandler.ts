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
}
