// Wave 14 FILE 3 (2026-05-02) — 1,962-LOC monolith split into 7 mount functions
// under src/ui/layout/.  This shell ≤400 LOC orchestrates them in dependency
// order and assembles the BUI lit-html return template.
// P6 fix applied: 3 × commandManager.execute() → runtime.commandBus.dispatch().
import * as BUI from '@thatopen/ui';
import * as OBC from '@thatopen/components';
import * as THREE from '@pryzm/renderer-three/three';
import { GridToggleService } from './GridToggleService';
import { VisualStyle } from '@pryzm/core-app-model/material-library';
import { ViewNavigationManager } from '@pryzm/core-app-model';
import { ViewController } from '@app/engine/ViewController';
import { BimService } from '@app/engine/BimService';
import { injectAppTheme } from './styles/AppTheme';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

// Wave 14 FILE 3 split — orchestration imported from src/ui/layout/
import { mountGISArea }        from './layout/GISAreaLayout';
import { mountAIArea }         from './layout/AIAreaLayout';
import { mountToolsArea }      from './layout/ToolsAreaLayout';
import { mountCreatePanel }    from './layout/CreatePanelLayout';
import { mountNavigationArea } from './layout/NavigationAreaLayout';
import { mountDockingArea }    from './layout/DockingLayout';
import { mountRenderArea }     from './layout/RenderAreaLayout';
export interface UIProps {
    components: OBC.Components;
    world: OBC.World;
    grid: any;
    bimManager: any;
    wallTool: any;
    slabTool: any;
    toolManager: any;
    undoManager: any;
    selectionManager: any;
    inspector: any;
    viewpoints: OBC.Viewpoints;
    views: OBC.Views;
    viewpointsTable: any;
    viewsTable: any;
    zoomToAll: () => Promise<void>;
    createViewpoint: () => Promise<void>;
    generatePlans: () => Promise<void>;
    generateElevations: () => Promise<void>;
    onCloseView: () => Promise<void>;
    toggleShadows: () => Promise<void>;
    updateShadowIntensity: (val: number) => void;
    updateSunDirection: (x: number, y: number, z: number) => Promise<void>;
    toggleBimVisibility: (type: 'levels' | 'grids', visible: boolean) => void;
    applyVisualStyle: (style: VisualStyle) => Promise<void>;
    deleteSelected: () => void;
    addFurniture: (path: string, position?: THREE.Vector3) => void;
    toggleSection: (section: string) => void;
    container: HTMLElement;
    navManager: ViewNavigationManager;
    gridToggleService?: GridToggleService;
    _viewController?: ViewController;
    projectContext: any;
    roofTool?: any;
}

/**
 * Phase B.2 (S73-WIRE) — `createMainLayout` now accepts the composed
 * `PryzmRuntime` handle from `@pryzm/runtime-composer`.  The orchestrator
 * threads `runtime` to every child panel constructor (LeftNavRail,
 * PropertyInspector, ContextualEditBar, SaveUndoRedoHUD, SelectionOverlay,
 * ViewCube, BottomActionMenu, WorkspaceModeBar, plus the per-family mode
 * pickers and drawing HUDs).  The argument is OPTIONAL with default `null`
 * so the legacy in-process boot path (`src/engine/subsystems/initUI.ts`,
 * which has no composed runtime today) keeps compiling unchanged; the
 * field is consumed by Phase B+ panels only.  Per S72 §16.2: "no
 * behavioural change — the runtime is plumbed; gesture wires still go
 * to legacy."
 *
 * @param props   UI property bag wired by EngineBootstrap (legacy props bag).
 * @param runtime PryzmRuntime — threaded to every child panel constructor;
 *                `null` permitted only during the legacy boot path.  Once
 *                Phase D.4 (EngineBootstrap split) lands this param becomes
 *                required and the `| null` union is dropped (see B.2.3).
 *
 * Phase B.2.2 (S73-WIRE) — JSDoc runtime contract declared per §II.B.2.
 *
 * Wave 14 FILE 3 (2026-05-02) — 1,962-LOC monolith split into 7 mount
 * functions under src/ui/layout/.  This shell ≤400 LOC orchestrates them
 * in dependency order and assembles the BUI lit-html return template.
 * P6 fix applied: 3 × the legacy command manager → runtime.commandBus.dispatch().
 */
export function createMainLayout(props: UIProps, runtime: PryzmRuntime | null = null) {
    injectAppTheme();
    const service = new BimService(props);

    // ── 1. GIS area ──────────────────────────────────────────────────────────
    // Owns: CesiumViewport, bridge, toggleGIS, activateView, flyTo, placeBim, gizmoMode
    const gis = mountGISArea(props, runtime);

    // ── 2. AI area ───────────────────────────────────────────────────────────
    // Owns: AI/spatial-tree/floor-plan/DXF panels + toggle closures
    const ai = mountAIArea(props, runtime);

    // ── 3. Tools area (monkey-patches service.activate* before CREATE_CONFIG) ─
    // Owns: mode pickers, HUDs, 21 runtime.tools.register() activators,
    //       wall/floor/ceiling/slab/door/window/plumbing/CW wrappers, P6 fix
    const pickers = mountToolsArea(props, service, runtime);

    // ── 4. Create panel ──────────────────────────────────────────────────────
    // Owns: CREATE_CONFIG, renderCreateContent, createNavigationStack,
    //       updateLevelsList, ActiveLevelHUD mount, level event listeners
    mountCreatePanel(props, service, pickers, runtime);

    // ── 5. Navigation area ───────────────────────────────────────────────────
    // Owns: ProjectBrowserPanel, export event bridge, LeftNavRail (dormant),
    //       vbPanelWrapper, ViewCube, captureDefaultView/goToDefaultView,
    //       getCommandManager, gridStoreAdapter, DXF restore event
    const nav = mountNavigationArea(props, service, gis, ai, runtime);

    // ── 6. Docking area ──────────────────────────────────────────────────────
    // Owns: ToolsPanelController, docking system, ContextualEditBar,
    //       WorkspaceModeBar, SaveUndoRedoHUD, BottomActionMenu, ResizeObserver
    const dock = mountDockingArea(
        props, service, gis, runtime,
        nav.vbPanelWrapper, nav.getCommandManager
    );

    // ── 7. Render area ───────────────────────────────────────────────────────
    // Owns: 10 render panels, window.X globals, pipeline event listeners,
    //       RealSunControl, PerformanceModePanel, Walkthrough, FirstPersonController
    mountRenderArea(props, runtime);

    // ── BUI layout root ──────────────────────────────────────────────────────
    return BUI.Component.create<any>(() => {
        return BUI.html`
            <div style="display: flex; height: 100vh; width: 100vw; font-family: var(--app-font); overflow: hidden; position: absolute; top: 0; left: 0; z-index: 10; pointer-events: none;">
                <!-- Phase 1.1: LEFT PANEL placeholder — vb-panel icon strip (52 px).
                     When pinned, applyDockLayout() moves vbPanelWrapper from here
                     into #dck-left-dock (sibling of #container in dck-workspace). -->
                ${dock.leftPlaceholder}

                <!-- AI PANEL: Bottom Left -->
                <div id="ai-panel-container" class="lt-float-panel" style="display: none;">
                    ${ai.aiPanel}
                </div>

                <!-- SPATIAL TREE PANEL -->
                <div id="spatial-tree-container-wrapper" class="lt-float-panel lt-float-panel--tree" style="display: none;">
                    ${ai.spatialTree}
                </div>

                <!-- AI CREATE PANEL -->
                <div id="ai-create-panel-container" class="lt-float-panel lt-float-panel--sm" style="display: none;">
                    ${ai.aiCreatePanel}
                </div>

                <!-- FLOOR PLAN IMPORT PANEL -->
                <div id="fp-import-panel-container" style="
                    display: none;
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 300px;
                    height: auto;
                    max-height: 80vh;
                    border-radius: 8px;
                    flex-direction: column;
                    pointer-events: auto;
                    z-index: 10;
                    overflow: hidden;
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
                ">
                    ${ai.floorPlanImportPanel}
                </div>

                <!-- DXF / DWG IMPORT PANEL (§31 Phase 1-3) — mounted directly -->
                ${ai.dxfImportPanel}

                <!-- ACTIVE LEVEL HUD: mounted by ActiveLevelHUD class over the canvas -->
                <div id="alh-hud-mount" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 15;"></div>

                <div style="flex: 1; pointer-events: none;"></div>

                <!-- Phase 1.1: RIGHT PANEL placeholder — tp-panel (52 px spine).
                     When pinned, applyDockLayout() moves toolsPanelController.element
                     from here into #dck-right-dock (sibling of #container). -->
                ${dock.rightPlaceholder}
            </div>
        `;
    });

}
