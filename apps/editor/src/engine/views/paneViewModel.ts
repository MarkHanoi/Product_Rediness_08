// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59) — PURE core of the native multi-pane
// view system: a renderer-agnostic model of WHICH view is assigned to WHICH pane,
// plus the invariants that keep the heavyweight singleton renderers (one Cesium
// instance, one WebGPU device) safe.
//
// WHY A PURE MODULE (no DOM / no Cesium / no THREE / no I/O): the live pane hosts
// mount real renderers that cannot run headless, so — exactly as with
// `globePlacementDecisions.ts` (L-193) and `siteAuthoringSplit` — we pin the
// DECISION logic (assignment, swap, singleton-conflict validation, mount-target
// resolution) here so the founder-visible behaviour ("swap any view into either
// pane, natively, robust for the long run") is unit-testable WITHOUT a live viewer.
// Pure decisions are P8 span-exempt (see globePlacementDecisions header).
//
// This is Phase 1a of C59 (SPEC-MULTI-PANE-VIEW-SYSTEM). It defines the vocabulary
// (ViewType / RendererKind / PaneId) + the pure layout algebra. The live
// `PaneHost` DOM/renderer wiring (mounting Cesium/MapLibre/WebGPU/Canvas2D into a
// pane element instead of always #container) lands in later phases ON TOP of this
// model — see the phased plan in the SPEC.

// ── Vocabulary ──────────────────────────────────────────────────────────────

/** The rendering backend a view type is drawn with. */
export type RendererKind =
    | 'maplibre'      // 2D site map (SiteBoundaryMap2D)
    | 'cesium'        // 3D Site / globe (CesiumViewport) — heavyweight singleton
    | 'webgpu-three'  // BIM 3D editor (renderer-three) — heavyweight singleton
    | 'canvas2d';     // BIM plan / section projection (SplitViewManager / PlanViewCanvas)

/** A hostable view. Extensible: elevations, RCP, schedules, sheets slot in later. */
export type ViewType =
    | 'site-map-2d'   // MapLibre parcel draw/select surface
    | 'site-3d'       // Cesium Forma / 3D Site (boundary + buildable envelope)
    | 'bim-3d'        // BIM WebGPU 3D editor
    | 'bim-plan-2d';  // Canvas2D plan projection (today's SVP secondary pane)

/** A pane slot. `left`/`right` today; extensible to `pane-2`, `pane-3`, … for N-up. */
export type PaneId = string;
export const LEFT_PANE: PaneId = 'left';
export const RIGHT_PANE: PaneId = 'right';

export interface ViewTypeDescriptor {
    readonly viewType: ViewType;
    readonly rendererKind: RendererKind;
    /**
     * True when the backing renderer is a heavyweight app-wide singleton (one Cesium
     * viewer / one WebGPU device). A singleton view MUST NOT be mounted into two
     * panes at once (that would require a second GPU device / Cesium instance — the
     * exact double-mount the founder's constraints forbid). Non-singleton views
     * (a Canvas2D projection) can be replicated cheaply.
     */
    readonly singleton: boolean;
    /** Human-readable label for the pane's view-picker. */
    readonly label: string;
}

/** The canonical view-type registry. The live PaneHost consults this to pick a mounter. */
export const VIEW_TYPE_REGISTRY: Readonly<Record<ViewType, ViewTypeDescriptor>> = {
    'site-map-2d': { viewType: 'site-map-2d', rendererKind: 'maplibre',     singleton: false, label: '2D Site Map' },
    'site-3d':     { viewType: 'site-3d',     rendererKind: 'cesium',       singleton: true,  label: '3D Site' },
    'bim-3d':      { viewType: 'bim-3d',      rendererKind: 'webgpu-three', singleton: true,  label: '3D Model' },
    'bim-plan-2d': { viewType: 'bim-plan-2d', rendererKind: 'canvas2d',     singleton: false, label: 'Plan' },
};

/** Which view (if any) each pane currently hosts. `null` = the pane is empty. */
export type PaneLayout = Readonly<Record<PaneId, ViewType | null>>;

// ── Pure layout algebra ─────────────────────────────────────────────────────

function descriptorOf(
    viewType: ViewType,
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>>,
): ViewTypeDescriptor {
    return registry[viewType];
}

/** The panes currently hosting a view backed by `rendererKind`. */
export function panesShowingRenderer(
    layout: PaneLayout,
    rendererKind: RendererKind,
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): PaneId[] {
    return Object.keys(layout).filter((paneId) => {
        const vt = layout[paneId];
        return vt != null && descriptorOf(vt, registry).rendererKind === rendererKind;
    });
}

/**
 * Assign `viewType` to `paneId`, returning a NEW layout (immutable). If the view is
 * a heavyweight singleton and is already live in ANOTHER pane, that other pane is
 * vacated (set to `null`) — because the one Cesium/WebGPU instance can only be in
 * one place. This is the invariant that makes "swap the 3D Site into either pane"
 * safe: it MOVES the singleton rather than cloning it.
 */
export function assignViewToPane(
    layout: PaneLayout,
    paneId: PaneId,
    viewType: ViewType | null,
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): PaneLayout {
    const next: Record<PaneId, ViewType | null> = { ...layout, [paneId]: viewType };
    if (viewType != null && descriptorOf(viewType, registry).singleton) {
        for (const otherPane of Object.keys(next)) {
            if (otherPane !== paneId && next[otherPane] === viewType) {
                next[otherPane] = null; // vacate the singleton's previous pane.
            }
        }
    }
    return next;
}

/** Swap the views hosted by two panes, returning a NEW layout (immutable). */
export function swapPanes(layout: PaneLayout, a: PaneId, b: PaneId): PaneLayout {
    return { ...layout, [a]: layout[b] ?? null, [b]: layout[a] ?? null };
}

export interface LayoutConflict {
    readonly rendererKind: RendererKind;
    readonly panes: PaneId[];
}

/**
 * Validate that no heavyweight singleton renderer is claimed by more than one pane.
 * A well-formed layout never has two panes both showing `cesium` (or both `webgpu-three`).
 * `assignViewToPane` maintains this invariant; `validatePaneLayout` is the guard the
 * live PaneHost asserts before it (re)mounts, and the property the tests pin.
 */
export function validatePaneLayout(
    layout: PaneLayout,
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): { ok: boolean; conflicts: LayoutConflict[] } {
    const conflicts: LayoutConflict[] = [];
    const singletonKinds: RendererKind[] = ['cesium', 'webgpu-three'];
    for (const kind of singletonKinds) {
        const panes = panesShowingRenderer(layout, kind, registry);
        if (panes.length > 1) conflicts.push({ rendererKind: kind, panes });
    }
    return { ok: conflicts.length === 0, conflicts };
}

/**
 * Resolve the DOM element a view should mount into. In the multi-pane world a view
 * mounts into its assigned PANE element, NOT the shared `#container`. This is the
 * seam that fixes the three founder-found incompatibilities (SVP owns the right pane
 * via a fixed element; Cesium hard-targets `#container`; MapLibre is a `#container`
 * overlay): every renderer is handed a pane element to mount into.
 *
 * Returns the pane hosting `viewType`, or `null` when it is not currently assigned.
 */
export function resolveHostPane(layout: PaneLayout, viewType: ViewType): PaneId | null {
    for (const paneId of Object.keys(layout)) {
        if (layout[paneId] === viewType) return paneId;
    }
    return null;
}
