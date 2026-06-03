/**
 * ToolsPanelTypes — shared interfaces for the right-hand Tools panel rail system.
 *
 * Mirrors the pattern established by ProjectBrowserTypes.ts for the left rail,
 * adapted for the right-side tools panel and its rail panels that open to the LEFT.
 *
 * Contract compliance:
 *   §05 §9   — New UI file under src/ui/
 *   §05 §6   — Zero bim-* elements; pure native HTML
 *   §01      — Read-only interface definitions; no store mutations
 *
 * CSS prefix registered: tpr- (Tools Panel Rail — floating panel opening LEFT)
 */

import type { BimService } from '@app/engine/BimService';

/**
 * Props passed from the main layout into the ToolsPanelController and
 * forwarded to individual rail panels as needed.
 */
export interface ToolsPanelProps {
    bimManager:       any;
    toolManager:      any;
    selectionManager: any;
    wallTool:         any;
    slabTool:         any;
    service:          BimService;
    projectContext:   any;
    toggleShadows:    () => Promise<void>;
    toggleBimVisibility: (type: 'levels' | 'grids', visible: boolean) => void;
    applyVisualStyle: (style: any) => Promise<void>;

    /** §40 — accessor for the active CommandManager, required by Levels & Grids panel. */
    getCommandManager?: () => { execute: (cmd: any) => any } | null;

    // GIS section — wired from Layout.ts closures
    gisToggle:            (active: boolean) => void;
    gisFlyTo:             () => Promise<void>;
    gisPlaceBim:          () => Promise<void>;
    gisGizmoMode:         (mode: number) => void;
    gisResetGeoreference: () => void;
    /** A.8.c — start the Cesium site-boundary polygon-draw tool. */
    gisStartBoundaryDraw: () => void;
}

/**
 * A single item in the hierarchical Create navigation tree.
 */
export interface CreateItem {
    label:        string;
    icon:         string;
    action?:      () => void;
    children?:    CreateLayer;
    customRender?: () => HTMLElement;
    disabled?:    () => boolean;
}

/**
 * A navigation layer in the Create panel — a titled list of CreateItems.
 */
export interface CreateLayer {
    title:        string;
    items:        CreateItem[];
    carouselMode?: boolean;
}

/**
 * Section identifiers for the tools rail — used as stable toggle keys.
 */
export type ToolsSectionId =
    | 'CREATE'
    | 'CREATE_ARCH'
    | 'CREATE_STRUCT'
    | 'CREATE_SERVICES'
    | 'CREATE_INTERIORS'
    | 'CREATE_LANDSCAPE'
    | 'LEVELS_GRIDS'
    | 'GRIDS_LEVELS'
    | 'ANNOTATION'
    | 'EXPORT'
    | 'RENDER'
    | 'GIS';
