/**
 * SheetEditorContracts — shared types and constants for the Sheet Editor subsystem.
 *
 * Wave 7 WS-B (S85-WIRE): extracted from SheetEditorPanel.ts to eliminate the
 * >1,200 LOC monolith.  Import this file from any SheetEditor/* module that
 * needs these definitions.
 *
 * §05 contract: CSS prefix sh-; no bim-* elements.
 * §06 contract: no platform-layer imports.
 */

// ── View-type icon map ─────────────────────────────────────────────────────

export const VIEW_TYPE_ICONS: Record<string, string> = {
    '3d':             '⬛',
    'plan':           '▦',
    'section':        '✂',
    'elevation':      '↕',
    'analysis':       '◈',
    'ceiling-plan':   '▦',
    'structural-plan':'▦',
    'detail':         '⊞',
    'drafting':       '⊡',
    'legend':         '☰',
    'render':         '◐',
    'walkthrough':    '▷',
};

// ── §SHEET-DROP-WHERE-THE-CURSOR-IS (L-1632) ───────────────────────────────

/**
 * MIME type carrying a ViewDefinition id across an HTML5 drag from the
 * "Available Views" list onto the sheet canvas.
 *
 * Declared here, once, because a drag is a contract between two modules that
 * never call each other: the producer is `SheetEditorSidebar.buildViewPickerEntry`
 * and the consumer is `SheetEditorPanel._buildCanvas`. A string literal repeated
 * in both is a contract that can drift silently — the drop would simply stop
 * finding a payload and nothing would report why.
 */
export const VIEW_DRAG_MIME = 'application/x-pryzm-view-id';

// ── Drag-state type ────────────────────────────────────────────────────────

/** Internal state for the viewport drag gesture. */
export interface DraggingState {
    viewportId:   string;
    startMouseX:  number;
    startMouseY:  number;
    startPosX:    number;
    startPosY:    number;
}

// ── SC-11 viewport focus state ─────────────────────────────────────────────

/**
 * The viewport's navigation camera expressed in the units the SURFACE works in
 * — CSS pixels of translation and a unitless zoom multiplier.
 *
 * §SHEET-NAVIGATE-INSIDE-THE-VIEWPORT (L-1865) — this is a PROJECTION of
 * `ViewportEditController`'s `EditCamera`, which is the authority and stores the
 * same camera in DRAWING-SPACE METRES. The two are related by an exact,
 * drawing-independent constant, `pxPerWorldM = scaleFactor × 1000 / scaleDenom`,
 * so neither is an approximation of the other. Pixels live here because that is
 * what a wheel event and a CSS transform speak; metres live in the controller
 * because that is what a crop rectangle and a viewBox speak, and the navigated
 * rect must be convertible into a crop without a unit guess.
 */
export interface VpCameraPx {
    /** CSS translate applied to the viewport's content container. */
    panPx: { x: number; y: number };
    /** Zoom multiplier. 1 = fit. */
    zoom: number;
}

/** Internal state for the SC-11 "Edit-in-Sheet" viewport focus mode. */
export interface VpFocusState {
    vpId:        string;
    viewId:      string;
    scaleDenom:  number;
    activeTool:  'select' | 'dimension';
    dimPoints:   Array<{ x: number; y: number }>;
    annotations: Array<{ x1: number; y1: number; x2: number; y2: number; label: string }>;
}

// ── Sidebar callback interface ─────────────────────────────────────────────

/**
 * Callbacks that the sidebar modules call into the owning SheetEditorPanel.
 * Keeps the sidebar modules free of any `this` reference to the panel class.
 */
export interface SidebarOpts {
    /** Dispatch an UpdateSheetCommand for the given field. */
    updateSheetField:    (sheetId: string, key: string, value: string) => void;
    /** Dispatch RemoveViewportFromSheetCommand. */
    removeViewport:      (sheetId: string, vpId: string) => void;
    /** Dispatch AddViewportToSheetCommand for a view. */
    addViewToSheet:      (sheet: import('@pryzm/core-app-model').SheetDefinition,
                          view:  import('@pryzm/core-app-model').ViewDefinition) => void;
    /** Trigger a full sidebar rebuild. */
    refreshSidebar:      () => void;
    /** Read `_revisionFormOpen` panel state. */
    getRevisionFormOpen: () => boolean;
    /** Write `_revisionFormOpen` panel state. */
    setRevisionFormOpen: (open: boolean) => void;
    /** Read `_selectedVpId` panel state. */
    getSelectedVpId:     () => string | null;
    /** Read `_activeSheetId` panel state. */
    getActiveSheetId:    () => string | null;

    /**
     * §SHEET-DBLCLICK-STAYS-ON-THE-SHEET (L-1866) — open the viewport's SOURCE
     * view in the main editor, leaving the sheet.
     *
     * This is the escape hatch for the one thing a sheet viewport genuinely
     * cannot do: EDIT ELEMENTS. The composed SVG carries no element identity to
     * pick against (`SVGCompositeRenderer` emits anonymous `<line>` segments
     * grouped by layer, because the identity is already gone in the merged
     * `THREE.LineSegments` buffers it reads). So element editing happens on the
     * real view, with the real picking stack.
     *
     * It is a BUTTON and not a double-click, because leaving the sheet is a
     * decision the user should make on purpose. Double-click activates
     * navigation and stays put.
     */
    openViewInMainEditor: (viewId: string) => void;

    /**
     * §SHEET-VIEWPORT-CROP-UI (L-1864) — the drawing-space rectangle the
     * activated viewport is currently showing, in METRES, or null when it has
     * no composed drawing.
     *
     * Powers "Crop to current view": the navigated frame and
     * `SheetViewport.crop` are the same four numbers in the same units, so
     * cropping to what you are looking at is a copy, not a conversion.
     */
    getVisibleWorldRect: (vpId: string) => { minX: number; minZ: number; maxX: number; maxZ: number } | null;
}

// ── Renderer-bridge callback interface ────────────────────────────────────

/**
 * Callbacks that RendererBridge focus-mode functions call back into the panel.
 * Avoids any direct import of SheetEditorPanel in the bridge module.
 */
export interface FocusOpts {
    /** Current focus state (mutable — bridge mutates it in place). */
    focusState:     VpFocusState;
    activeSheetId:  string | null;
    scaleFactor:    number;
    /** Re-render dim annotations on the SVG overlay. */
    renderDim:      (svgEl: SVGSVGElement, w: number, h: number, fs: VpFocusState | null) => void;
    /**
     * §SHEET-NAVIGATE-INSIDE-THE-VIEWPORT (L-1865) — read the activated
     * viewport's navigation camera, in CSS pixels.
     *
     * The bridge holds NO camera state of its own. It used to mutate
     * `focusState.camOffset` / `camZoom` directly, which made it a second owner
     * of a fact `ViewportEditController` already models — and the bridge's copy
     * was destroyed on every exit, so the founder's pan was silently discarded
     * the moment he clicked another viewport.
     */
    getCamera:      () => VpCameraPx;
    /**
     * Write the camera. Returns the camera that was ACTUALLY applied, which may
     * differ from the request: the controller clamps zoom to its rails. Callers
     * that derive a focal-point pan must use the returned value, never their own
     * request.
     */
    setCamera:      (cam: VpCameraPx) => VpCameraPx;
    /** Reset this viewport's camera to fit (identity). */
    resetCamera:    () => void;
    /** Exit SC-11 focus mode (panel callback). */
    exitFocusMode:  () => void;
    /** Store the event-listener cleanup fn so `_exitViewportFocusMode` can call it. */
    setFocusCleanup: (fn: (() => void) | null) => void;
}
