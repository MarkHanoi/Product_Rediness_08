import * as THREE from '@pryzm/renderer-three/three';
import { ProjectBrowserPanel } from '../ViewBrowser/ProjectBrowserPanel';
import { LeftNavRail }         from '../LeftNavRail';
import { ViewCube } from '../ViewCube';
import { showExportScopeModal } from '@pryzm/file-format';
import { apiFetch } from '@pryzm/core-app-model'; // §HUB-SERVICE-GLB — real GLB export auth gate
// §CAM-ECEF-HANDBACK (L-746) — Home snapshots the LIVE camera, so it inherits an ECEF
// pose whenever the globe has not yet handed back. Same predicate as L-378.
import { isGlobeScalePosition } from '@pryzm/core-app-model';
import { restoreDxfOverlay } from '../import/DxfImportPanel';
import type { UIProps } from '../Layout';
import type { BimService } from '@app/engine/BimService';
import type { GISCallbacks } from './GISAreaLayout';
import type { AIResult } from './AIAreaLayout';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

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

    /**
     * §CAM-ECEF-HANDBACK (L-746) — Home is a SNAPSHOT of the live camera, not a derived
     * framing, so it inherits whatever state the camera is in when the timer fires.
     *
     * FOUNDER EVIDENCE, two consecutive sessions, same line:
     *   [HomeView] Default viewpoint captured: {x: 119.12,        y: 131.07, z: 192.98}
     *   [HomeView] Default viewpoint captured: {x: -4073337.567,  y: 1021.43, z: -215808.25}
     *
     * The first looks like proof that a correct default already exists. The second shows
     * it was luck: the capture runs 1.2–1.5 s after project load, and whether the Cesium
     * globe has handed the camera back by then is a race. Home "working" was a
     * coincidence of timing, and it very nearly became the fallback for the whole
     * default-framing path — which would have restored users to 4,000 km.
     *
     * Both ends are guarded, because they fail differently: a bad CAPTURE poisons the
     * viewpoint for the rest of the session, while a bad RESTORE would replay an
     * already-poisoned one. Guarding capture alone would leave any viewpoint stored
     * before this change live forever.
     */
    const captureDefaultView = () => {
        const controls = (props.world.camera as any).controls;
        if (!controls) return;
        const pos = new THREE.Vector3();
        const tgt = new THREE.Vector3();
        controls.getPosition(pos);
        controls.getTarget(tgt);

        if (isGlobeScalePosition(pos.x, pos.y, pos.z) || isGlobeScalePosition(tgt.x, tgt.y, tgt.z)) {
            // Keep any previously captured BIM-scale viewpoint rather than overwriting it
            // with a globe pose — the older value is strictly better than ECEF.
            console.warn(
                '[HomeView] §CAM-ECEF-HANDBACK (L-746) — refusing to capture a globe/ECEF-scale viewpoint ' +
                `(position=${pos.toArray().map(v => v.toFixed(0)).join(',')}); ` +
                `${defaultViewPos ? 'keeping the previous BIM-scale viewpoint.' : 'Home stays unset until a BIM-scale camera is available.'}`,
            );
            return;
        }

        defaultViewPos = { x: pos.x, y: pos.y, z: pos.z };
        defaultViewTarget = { x: tgt.x, y: tgt.y, z: tgt.z };
        console.log('[HomeView] Default viewpoint captured:', defaultViewPos, defaultViewTarget);
    };

    const goToDefaultView = async () => {
        if (!defaultViewPos || !defaultViewTarget) return;
        const controls = (props.world.camera as any).controls;
        if (!controls) return;

        // §CAM-ECEF-HANDBACK (L-746) — never replay a contaminated viewpoint, including one
        // stored by a build that predates the capture guard above.
        if (
            isGlobeScalePosition(defaultViewPos.x, defaultViewPos.y, defaultViewPos.z) ||
            isGlobeScalePosition(defaultViewTarget.x, defaultViewTarget.y, defaultViewTarget.z)
        ) {
            console.error(
                '[HomeView] §CAM-ECEF-HANDBACK (L-746) — the stored Home viewpoint is globe/ECEF-scale ' +
                'and would send the camera thousands of km from the model; discarding it. ' +
                'Home will re-capture on the next BIM-scale camera.',
            );
            defaultViewPos = null;
            defaultViewTarget = null;
            return;
        }

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
            // §OI-054 (2026-05-24) — route through THE single unified undo path (C03 §4.6 U-5)
            // instead of a hand-rolled ring-buffer apply. Undoes the most recent action (the
            // just-placed georeference), with the same coverage/shadow-drop/fallback semantics.
            void import('@app/engine/undo/performUndoRedo').then(m => m.performUndo());
        },
        gisStartBoundaryDraw: () => gis.startBoundaryDraw(),
        toggleShadows,
        applyVisualStyle: props.applyVisualStyle,
        service,
    }, runtime ?? null);

    // ── Export event bridge ───────────────────────────────────────────────────
    // §HUB-EXPORT-BRIDGE-RUNTIME (2026-06-23) — these PROJECT HUB → "Export &
    // Print" listeners were registered on `window.runtime` only. When the editor
    // mounted before the boot path assigned `window.runtime` (the documented
    // null-at-mount race that also broke Import PDF/DXF and the lighting cascade),
    // every `window.runtime?.events?.on(...)` silently no-opped, so "Export IFC",
    // "Export GLB" and the import bridges below were dead — the menu emitted the
    // event onto a bus nothing was listening on. Bind to the runtime THREADED into
    // this mount (guaranteed live when present) and fall back to `window.runtime`
    // for the legacy boot path. This is the registration-side root fix; the
    // dispatch side (handleHubMenuAction) is unchanged.
    const bridgeEvents = (runtime ?? window.runtime)?.events ?? null;
    bridgeEvents?.on('pryzm-export-ifc', async () => { // F.events.15
        try {
            const scope = await showExportScopeModal();
            if (scope) {
                if (typeof (service as any).exportIfc === 'function') {
                    console.log('[ProjectHub] §HUB-SERVICE action=export-ifc → invoked BimService.exportIfc');
                    (service as any).exportIfc({ exportScope: scope });
                } else {
                    console.warn('[ProjectHub] §HUB-SERVICE action=export-ifc → MISSING BimService.exportIfc');
                }
            }
        } catch (e) { console.warn('[Export] IFC export error', e); }
    });
    bridgeEvents?.on('pryzm-export-glb', async () => { // F.events.15
        // §HUB-SERVICE-GLB (2026-06-23) — BimService has NO exportGlb method, so the
        // old `(service as any).exportGlb?.()` was a permanent silent no-op: optional-
        // chaining a missing member just returns undefined. That is exactly why
        // "Export GLB" did nothing from the hub. Do the real export inline, mirroring
        // ExportRailPanel._exportGlb() (server auth gate → exportFragmentsToGLB).
        try {
            try {
                const authRes = await apiFetch('/api/export/authorize?type=glb');
                if (authRes.status === 403) {
                    const body = await authRes.json().catch(() => ({}));
                    console.warn('[Export] §HUB-SERVICE action=export-glb → server denied:', (body as any).reason ?? 'plan not authorized');
                    bridgeEvents?.emit('pryzm-upgrade-required', { feature: 'GLB_EXPORT', reason: (body as any).reason, plan: (body as any).plan });
                    return;
                }
                if (!authRes.ok && import.meta.env.PROD) {
                    console.warn('[Export] §HUB-SERVICE action=export-glb → auth error in PROD, blocked.');
                    return;
                }
            } catch (err) {
                if (import.meta.env.PROD) {
                    console.warn('[Export] §HUB-SERVICE action=export-glb → auth unreachable in PROD, blocked:', err);
                    return;
                }
                console.warn('[Export] auth unreachable (dev), proceeding:', err);
            }
            const { exportFragmentsToGLB } = await import('@pryzm/file-format');
            const bimManager = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer
            if (bimManager?.scene) {
                console.log('[ProjectHub] §HUB-SERVICE action=export-glb → invoked exportFragmentsToGLB');
                exportFragmentsToGLB(bimManager.scene);
            } else {
                console.warn('[ProjectHub] §HUB-SERVICE action=export-glb → MISSING bimManager.scene');
            }
        } catch (e) { console.warn('[Export] GLB export error', e); }
    });
    bridgeEvents?.on('pryzm-import-pdf', () => { // F.events.13
        ai.toggleFloorPlanPanel();
    });
    window.addEventListener('pryzm-import-ifc', () => {
        try { (service as any).importIfc?.(); } catch (e) { console.warn('[Import] IFC import error', e); }
    });
    window.addEventListener('pryzm-import-dxf', () => { ai.toggleDxfPanel(); });
    bridgeEvents?.on('import-dxf', () => { ai.toggleDxfPanel(); });

    // §31 Phase 2 — Restore DXF overlays from project snapshot
    bridgeEvents?.on('pryzm-dxf-restore-overlays', async (p: { overlays: readonly unknown[] }) => { // F.events.13
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
