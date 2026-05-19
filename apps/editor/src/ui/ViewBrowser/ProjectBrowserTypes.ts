/**
 * ProjectBrowserTypes — shared interface for the ProjectBrowserPanel and its
 * modular rail panel sub-panels.
 *
 * Extracted to a separate file to avoid circular imports between
 * ProjectBrowserPanel.ts and the panel files in panels/.
 *
 * Contract compliance:
 *   §05 §9 — New UI files go under src/ui/
 *   §01    — Interface is read-only; no store mutation types included
 */

import type { GridToggleService } from '../GridToggleService';

export interface ProjectBrowserPanelProps {
    onViewSelect: (viewId: string) => void;
    onZoomToAll?: () => void;
    onGoToDefaultView?: () => void;
    onCaptureDefaultView?: () => void;
    onActivate3D?: () => void | Promise<void>;
    onActivateOrtho?: () => void;
    gridToggleService?: GridToggleService;
    onToggleAIPanel?: () => void;
    onToggleSpatialTree?: () => void;
    onToggleAICreatePanel?: () => void;
    onToggleFloorPlanPanel?: () => void;
    onCreateViewpoint?: () => void;
    viewpointsTableEl?: Element | null;

    // ── Levels & Grids section (moved from right tp-panel "Project" section) ──
    bimManager?:        any;
    projectContext?:    any;
    getCommandManager?: () => { execute: (cmd: any) => any } | null;
    gridStore?:         { getAll: () => any[] };

    // ── Visibility controls (moved from VISUAL rail panel) ────────────────────
    toggleBimVisibility?: (type: 'levels' | 'grids', visible: boolean) => void;

    // ── AI & Tools inline panel elements ──────────────────────────────────────
    // Passed from Layout.ts so AIRailPanel can embed them inline (below buttons).
    aiCreateEl?:   Element;
    floorPlanEl?:  Element;

    // ── GIS / Geospatial (moved from right rail) ───────────────────────────────
    gisToggle?:            (active: boolean) => void;
    gisFlyTo?:             () => Promise<void>;
    gisPlaceBim?:          () => Promise<void>;
    gisGizmoMode?:         (mode: number) => void;
    gisResetGeoreference?: () => void;

    // ── Render / Visual controls (moved from right rail) ─────────────────────
    toggleShadows?:    () => Promise<void>;
    applyVisualStyle?: (style: any) => Promise<void>;
    service?:          any;
}
