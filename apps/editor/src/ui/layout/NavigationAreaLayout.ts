import * as THREE from '@pryzm/renderer-three/three';
import { ProjectBrowserPanel } from '../ViewBrowser/ProjectBrowserPanel';
import { LeftNavRail }         from '../LeftNavRail';
import { ViewCube } from '../ViewCube';
import { showExportScopeModal } from '@pryzm/file-format';
import { restoreDxfOverlay } from '../import/DxfImportPanel';
import type { UIProps } from '../Layout';
import type { BimService } from '@app/engine/BimService';
import type { GISCallbacks } from './GISAreaLayout';
import type { AIResult } from './AIAreaLayout';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { wallUndoStoreAdapter } from '@app/engine/undo/wallUndoStoreAdapter'; // §ADR-051 wall slice (OI-054)

export interface NavResult {
    vbPanelWrapper: HTMLElement;
    captureDefaultView: () => void;
    goToDefaultView: () => Promise<void>;
    getCommandManager: () => any;
    gridStoreAdapter: any;
}

export function mountNavigationArea(
    props: UIProps,
    service: BimService,
    gis: GISCallbacks,
    ai: AIResult,
    runtime: PryzmRuntime | null,
): NavResult {
    // ─── Default Viewpoint (Home View) ───────────────────────────────────────
    let defaultViewPos: { x: number; y: number; z: number } | null = null;
    let defaultViewTarget: { x: number; y: number; z: number } | null = null;

    const captureDefaultView = () => {
        const controls = (props.world.camera as any).controls;
        if (!controls) return;
        const pos = new THREE.Vector3();
        const tgt = new THREE.Vector3();
        controls.getPosition(pos);
        controls.getTarget(tgt);
        defaultViewPos = { x: pos.x, y: pos.y, z: pos.z };
        defaultViewTarget = { x: tgt.x, y: tgt.y, z: tgt.z };
        console.log('[HomeView] Default viewpoint captured:', defaultViewPos, defaultViewTarget);
    };

    const goToDefaultView = async () => {
        if (!defaultViewPos || !defaultViewTarget) return;
        const controls = (props.world.camera as any).controls;
        if (!controls) return;
        await controls.setLookAt(
            defaultViewPos.x, defaultViewPos.y, defaultViewPos.z,
            defaultViewTarget.x, defaultViewTarget.y, defaultViewTarget.z,
            true
        );
        console.log('[HomeView] Returned to default viewpoint');
    };

    setTimeout(() => captureDefaultView(), 1500);
    window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
        setTimeout(() => captureDefaultView(), 1200);
    });

    // Shared helper — resolves the commandManager from toolManager or the window global.
    const getCommandManager = () =>
        props.toolManager?.commandManager ?? window.commandManager ?? null; // TODO(E.x.X): legacy commandManager (toolbar fallback) — replace with runtime.bus.executeCommand

    // GridStore adapter for LevelsGridsRailPanel
    const gridStoreAdapter = window.gridStore ?? { // TODO(E.13.S): legacy gridStore — replace with runtime.stores.grids slot
        getAll: () => (props.bimManager as any).getGrids?.() ?? []
    };

    // ── Phase I: ProjectBrowserPanel ──────────────────────────────────────────
    const { gridToggleService, createViewpoint, viewpointsTable, toggleShadows, toggleBimVisibility } = props;

    const projectBrowserPanel = new ProjectBrowserPanel({
        onViewSelect:          (id) => gis.activateView(id as any),
        onActivate3D:          () => gis.activateView('3D'),
        onActivateOrtho:       () => gis.activateView('Top'),
        onZoomToAll:           () => props.zoomToAll(),
        onGoToDefaultView:     () => goToDefaultView(),
        onCaptureDefaultView:  () => captureDefaultView(),
        gridToggleService,
        onToggleAIPanel:       () => ai.toggleAIPanel(),
        onToggleSpatialTree:   () => ai.toggleSpatialTree(),
        onToggleAICreatePanel: () => ai.toggleAICreatePanel(),
        onToggleFloorPlanPanel:() => ai.toggleFloorPlanPanel(),
        onCreateViewpoint:     () => createViewpoint(),
        viewpointsTableEl:     viewpointsTable instanceof Element ? viewpointsTable : null,
        bimManager:        props.bimManager,
        projectContext:    props.projectContext,
        getCommandManager,
        gridStore:         gridStoreAdapter,
        toggleBimVisibility,
        aiCreateEl:  ai.aiCreatePanel  instanceof Element ? ai.aiCreatePanel  : undefined,
        floorPlanEl: ai.floorPlanImportPanel instanceof Element ? ai.floorPlanImportPanel : undefined,
        gisToggle:            (active) => gis.toggleGIS(active),
        gisFlyTo:             () => gis.flyToCremornePoint(),
        gisPlaceBim:          () => gis.placeBimOnEarth(),
        gisGizmoMode:         (mode) => gis.gizmoMode(String(mode)),
        gisResetGeoreference: () => {
            // F-1.4: ring-buffer undo for GIS georeference reset.
            const rb = runtime?.bus?.ringBuffer;
            if (rb?.canUndo()) {
                const pair = rb.current();
                const side = rb.undoPatch();
                if (side && pair) {
                    import('@pryzm/command-bus').then(({ applyRingBufferSide }) => {
                        applyRingBufferSide(side, pair.affectedStores ?? [], {
                            wall: (window as any).wallStore ? wallUndoStoreAdapter((window as any).wallStore) : undefined,    walls: (window as any).wallStore ? wallUndoStoreAdapter((window as any).wallStore) : undefined, // §ADR-051 wall slice
                            slab: (window as any).slabStore,    slabs: (window as any).slabStore, // TODO(TASK-08)
                            room: (window as any).roomStore,    rooms: (window as any).roomStore, // TODO(TASK-08)
                            level: (window as any).levelStore,  levels: (window as any).levelStore, // TODO(TASK-08)
                            door: (window as any).doorStore,    doors: (window as any).doorStore, // TODO(TASK-08)
                            window: (window as any).windowStore, windows: (window as any).windowStore, // TODO(TASK-08)
                        });
                    }).catch(() => {});
                }
            }
        },
        toggleShadows,
        applyVisualStyle: props.applyVisualStyle,
        service,
    }, runtime ?? null);

    // ── Export event bridge ───────────────────────────────────────────────────
    window.runtime?.events?.on('pryzm-export-ifc', async () => { // F.events.15
        try {
            const scope = await showExportScopeModal();
            if (scope) (service as any).exportIfc?.({ exportScope: scope });
        } catch (e) { console.warn('[Export] IFC export error', e); }
    });
    window.runtime?.events?.on('pryzm-export-glb', () => { // F.events.15
        try { (service as any).exportGlb?.(); } catch (e) { console.warn('[Export] GLB export error', e); }
    });
    window.runtime?.events?.on('pryzm-import-pdf', () => { // F.events.13
        ai.toggleFloorPlanPanel();
    });
    window.addEventListener('pryzm-import-ifc', () => {
        try { (service as any).importIfc?.(); } catch (e) { console.warn('[Import] IFC import error', e); }
    });
    window.addEventListener('pryzm-import-dxf', () => { ai.toggleDxfPanel(); });
    window.runtime?.events?.on('import-dxf', () => { ai.toggleDxfPanel(); });

    // §31 Phase 2 — Restore DXF overlays from project snapshot
    window.runtime?.events?.on('pryzm-dxf-restore-overlays', async (p: { overlays: readonly unknown[] }) => { // F.events.13
        const overlays = p.overlays as any[];
        if (!overlays.length) return;
        try {
            const { scene, camera, domElement } = ai.dxfSceneRefs;
            for (const rec of overlays) {
                await restoreDxfOverlay(
                    rec.overlayId, rec.sourceText, rec.fileName,
                    rec.metersPerUnit, rec.elevation, rec.positionOffset,
                    rec.opacity, rec.layers, scene, camera, domElement,
                );
            }
        } catch (err) {
            console.warn('[Layout] DXF overlay restore failed (non-fatal):', err);
        }
    });

    // ── LeftNavRail — kept but NOT mounted (reverted to ProjectBrowserPanel) ──
    const leftNavRail = new LeftNavRail({
        onViewSelect:        (id) => gis.activateView(id as any),
        onToggleAIPanel:     () => ai.toggleAIPanel(),
        onToggleSpatialTree: () => ai.toggleSpatialTree(),
    }, runtime);
    void leftNavRail; // suppressed — not mounted

    // ── Left panel: vb-panel icon strip ──────────────────────────────────────
    const vbPanelWrapper = document.createElement('div');
    vbPanelWrapper.className = 'vb-panel';
    vbPanelWrapper.appendChild(projectBrowserPanel.getElement());

    // ── Phase 1.2 — ViewCube Navigation HUD ──────────────────────────────────
    if (props.world?.camera?.three) {
        ViewCube.mountOrReplace(
            () => (props.world.camera as any).three as THREE.Camera,
            props._viewController,
            runtime,
        );
    }

    return { vbPanelWrapper, captureDefaultView, goToDefaultView, getCommandManager, gridStoreAdapter };
}
