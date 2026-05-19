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

/** Internal state for the SC-11 "Edit-in-Sheet" viewport focus mode. */
export interface VpFocusState {
    vpId:        string;
    viewId:      string;
    scaleDenom:  number;
    camOffset:   { x: number; y: number };
    camZoom:     number;
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
    /** Exit SC-11 focus mode (panel callback). */
    exitFocusMode:  () => void;
    /** Store the event-listener cleanup fn so `_exitViewportFocusMode` can call it. */
    setFocusCleanup: (fn: (() => void) | null) => void;
}
