/**
 * initUI — Phase F-1 subsystem extraction.
 *
 * Covers:
 *   - PresentationEngine + VG Governance layer
 *   - ViewRangeFilterService, CropRegionFilterService, UnderlayRenderService, ViewRangeZoneApplicator
 *   - Store exposures on window (semanticIndex, viewDefinitionStore, visibilityRuleEngine, etc.)
 *   - SheetEditorPanel instantiation
 *   - saveViewCamera helper, export-ifc / import-ifc event handlers
 *   - view-selected camera-persistence handler
 *   - CurtainWallBuilder + store subscriber wiring
 *   - applyVisualStyle, deleteSelected, generatePlans, generateElevations, onCloseView
 *   - Section-cut double-click handler
 *   - updateProjectUI, toggleSection, updatePanels
 *   - toggleShadows, updateSunDirection, updateShadowIntensity, toggleBimVisibility
 *   - createMainLayout DOM mount + keyboard shortcut (R → roofTool)
 *
 * Extracted from EngineBootstrap.ts — Phase F-1.
 * Contract: 01-BIM-ENGINE-CORE-CONTRACT §2.7 (builders owned at bootstrap layer).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import * as OBC from '@thatopen/components';
import * as OBCF from '@thatopen/components-front';
// Phase A.6 close (2026-04-29) — `showAppToast` removed; replaced by
// the local `toast(...)` helper below which routes through
// `runtime.toasts.show(...)`.  When `runtime` is null (legacy boot
// path before Phase D.4 lands), the helper falls back to the
// package-owned DOM helper at `@pryzm/runtime-composer/showAppToast`.
import { showAppToast as _packageShowAppToast } from '@pryzm/runtime-composer/showAppToast';
import type { PryzmRuntime, ToastKind } from '@pryzm/runtime-composer';
import { escHtml } from '@pryzm/ui-base';

import { apiFetch }              from '@pryzm/core-app-model';
import { VisualStyle }           from '@pryzm/core-app-model/material-library';
import { createMainLayout }      from '@app/ui/Layout';
import { CurtainWallBuilder }    from '@pryzm/geometry-curtain-wall';
// Contract 47 §5.11 (Step 3′) — IFC export wrappers are loaded lazily on first
// `export-ifc` / `export-ifc-revit` event, or when the URL `?audit` flag fires.
// `import type` only — erased by tsc, so does NOT pull these modules into the
// static graph. Saves ~30–60 KB of OUR app code from `EngineBootstrap`.
// (Note: `vendor-web-ifc` itself remains eager — see §5.7 architectural ceiling.)
import type { exportIFC as _exportIFCFn }                 from '@pryzm/file-format';
import type { auditIfcWorkflow as _auditIfcWorkflowFn }   from '@pryzm/file-format';
import type { IfcImportResult }  from '@pryzm/file-format';
import { deleteIfcImportedElement } from '@pryzm/file-format';

import { PresentationEngine }    from '@pryzm/core-app-model';
import { vgGovernanceStore }     from '@pryzm/core-app-model';
import { VGSceneApplicator }     from '@pryzm/core-app-model';
import { FastPathProjectorService } from '@pryzm/core-app-model';
import { ViewRangeFilterService }from '@pryzm/core-app-model';
import { CropRegionFilterService }from '@pryzm/core-app-model';
import { UnderlayRenderService } from '@pryzm/core-app-model';
import { ViewRangeZoneApplicator }from '@pryzm/core-app-model';
// Contract 25b — Wave 2: VGGovernancePanel retired. The unified V/G header panel
// (OverridePanel) and the master VisibilityIntentPanel are the only authoring surfaces.
import { semanticIndex }         from '@pryzm/core-app-model';
// DOC-5.4 — IFC Pset adapter (exposed on window so IFC loaders can call ifcPsetAdapter.ingest())
import { ifcPsetAdapter }        from '@pryzm/core-app-model';
import { viewDefinitionStore }   from '@pryzm/core-app-model';
import { initDefaultViewsManager }from '@pryzm/core-app-model';
import { visibilityRuleEngine }  from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { sheetStore }            from '@pryzm/core-app-model';
import { titleBlockStore }       from '@pryzm/core-app-model';
import { scheduleStore }         from '@pryzm/core-app-model';
// Contract 47 §1 + Plan §4 / §19.3 (Phase 3) — Both panels are loaded lazily
// on first `open()` call (proxies registered below). `import type` only —
// erased by tsc, so does NOT pull these modules into the static graph. Each
// panel transitively pulls ~30–80 KB of OUR app code (commands, renderers,
// helper services) that are not shared with the bootstrap path; deferring
// them shrinks `EngineBootstrap` and lets Rollup emit each panel as its own
// auto-named chunk. Vendor chunks (three, web-ifc, …) stay eager — see
// §18.2 / Contract 47 §5.7 for why that ceiling cannot move.
// Functional safety: every external consumer
//   • `DataWorkbench.ts:524, 1111`   — `?.open?.()` (optional chaining)
//   • `ViewPropertiesPanel.ts:868`   — `?.open?.()` (optional chaining)
//   • `initUI.ts` Ctrl+Shift+I       — `typeof open === 'function'` guard
//   • `SheetsRailPanel.ts:364`       — `editor?.open && editor.open(id)`
//   • `SheetEditorPanel.ts:2656`     — `typeof panel.open === 'function'`
// is fire-and-forget (no await), so a Promise-returning proxy is safe.
import type { SheetEditorPanel as _SheetEditorPanelImpl }
    from '@app/ui/SheetEditor/SheetEditorPanel';
import type { VisibilityIntentPanel as _VisibilityIntentPanelImpl }
    from '@app/ui/VisibilityIntentPanel';
import { sheetExportService }    from '@pryzm/file-format';
import { dxfExportService }      from '@pryzm/file-format';
// DOC-3.4 / Contract 47 §9 — PdfExportService is loaded lazily (jspdf + svg2pdf.js
// + transitively html2canvas ≈ 1 MB) on first call to `window.pdfExportService
// .exportSheet(...)`. See `_ensurePdfExportService` below. `import type` only —
// erased by tsc, so does NOT pull the module into the static graph.
import type { PdfExportServiceImpl as _PdfExportServiceImpl } from '@pryzm/file-format';
import { sheetIndexService }     from '@pryzm/core-app-model';
import { viewTemplateStore }     from '@pryzm/core-app-model';
import { phaseFilterStore }      from '@pryzm/core-app-model';
import { frameObject }             from '@pryzm/core-app-model';
import { SectionBoxTool }          from '@pryzm/input-host';
import { installShortcutCheatSheet } from '@app/ui/ShortcutCheatSheet';

// ── Params interface ──────────────────────────────────────────────────────────

export interface UIParams {
    /**
     * Phase A.6 close (2026-04-29) — composed runtime forwarded from
     * `bootstrap(runtime)` so toasts route through `runtime.toasts.show(...)`.
     * Optional + nullable until every legacy caller of `initUI` is on
     * the new boot path.
     */
    runtime?: PryzmRuntime | null;
    world: OBC.World;
    components: OBC.Components;
    container: HTMLElement;
    bimManager: any;
    projectContext: any;
    commandManager: any;
    selectionManager: any;
    toolManager: any;
    inspector: any;
    propertyPanel: HTMLElement;
    wallTool: any;
    slabTool: any;
    curtainWallTool: any;
    columnTool: any;
    roofTool: any;
    viewController: any;
    navManager: any;
    gridToggleService: any;
    undoManager: any;
    grid: any;
    viewpoints: any;
    viewpointsTable: any;
    viewsTable: any;
    zoomToAll: () => void;
    createViewpoint: () => void;
    updateViewsTable: () => void;
    addFurniture: (modelPath: string, position?: THREE.Vector3) => void;
    materialMap: Map<string, any>;
    getHdriTexture: () => Promise<THREE.Texture | null>;
    curtainPanelStoreInstance: any;
    fragments: any;
    unselectAll: () => void;
    updateIfManualMode: () => void;
}

type IfcImportOverlay = {
    update: (stage: string, progress: number, detail?: string) => void;
    remove: () => void;
};


function createIfcImportOverlay(fileName: string): IfcImportOverlay {
    document.getElementById('pryzm-ifc-import-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pryzm-ifc-import-overlay';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:999999',
        'display:flex', 'align-items:center', 'justify-content:center',
        'background:rgba(5,8,18,0.42)', 'backdrop-filter:blur(3px)',
        'pointer-events:auto', 'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
        'width:min(380px,calc(100vw - 32px))', 'border-radius:16px',
        'background:#ffffff', 'color:#1a2035',
        'box-shadow:0 8px 32px rgba(30,50,120,0.13),0 2px 8px rgba(30,50,120,0.07)',
        'overflow:hidden',
    ].join(';');

    card.innerHTML = `
        <div style="background:linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%);padding:11px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 2px 12px rgba(102,0,255,0.35);">
            <div style="min-width:0;flex:1;">
                <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:1px;">Importing IFC</div>
                <div style="font-size:12px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escHtml(fileName)}">${escHtml(fileName)}</div>
            </div>
            <div class="ifc-import-percent" style="font-size:14px;font-weight:700;color:#fff;flex-shrink:0;">0%</div>
        </div>
        <div style="padding:12px 14px 14px;">
            <div style="height:5px;border-radius:999px;background:rgba(102,0,255,0.10);overflow:hidden;margin-bottom:10px;">
                <div class="ifc-import-bar" style="height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#8B5CF6,#6600FF);transition:width .22s ease;"></div>
            </div>
            <div class="ifc-import-stage" style="font-size:12px;font-weight:600;margin-bottom:4px;color:#1a2035;">Preparing import…</div>
            <div class="ifc-import-detail" style="font-size:11px;line-height:1.5;color:#5a6a85;">Reading the selected file and preparing the 3D engine.</div>
            <div style="display:flex;gap:6px;margin-top:10px;color:#7a8aaa;font-size:10px;flex-wrap:wrap;">
                <span>Parsing</span><span>→</span><span>Semantics</span><span>→</span><span>Geometry</span><span>→</span><span>Selection ready</span>
            </div>
        </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const percent = card.querySelector<HTMLElement>('.ifc-import-percent')!;
    const bar = card.querySelector<HTMLElement>('.ifc-import-bar')!;
    const stageEl = card.querySelector<HTMLElement>('.ifc-import-stage')!;
    const detailEl = card.querySelector<HTMLElement>('.ifc-import-detail')!;

    return {
        update(stage: string, progress: number, detail = '') {
            const clamped = Math.max(0, Math.min(100, Math.round(progress)));
            percent.textContent = `${clamped}%`;
            bar.style.width = `${clamped}%`;
            stageEl.textContent = stage;
            if (detail) detailEl.textContent = detail;
        },
        remove() {
            overlay.style.pointerEvents = 'none';
            overlay.style.transition = 'opacity .28s ease';
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 300);
        },
    };
}

type IfcExportOverlay = {
    update: (stage: string, progress: number, detail?: string) => void;
    remove: () => void;
};

function createIfcExportOverlay(scope: string): IfcExportOverlay {
    document.getElementById('pryzm-ifc-export-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pryzm-ifc-export-overlay';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:999999',
        'display:flex', 'align-items:center', 'justify-content:center',
        'background:rgba(5,8,18,0.42)', 'backdrop-filter:blur(3px)',
        'pointer-events:auto', 'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
        'width:min(380px,calc(100vw - 32px))', 'border-radius:16px',
        'background:#ffffff', 'color:#1a2035',
        'box-shadow:0 8px 32px rgba(30,50,120,0.13),0 2px 8px rgba(30,50,120,0.07)',
        'overflow:hidden',
    ].join(';');

    const scopeLabel = scope === 'native-and-imported' ? 'Native + Imported' : 'Native elements';

    card.innerHTML = `
        <div style="background:linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%);padding:11px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 2px 12px rgba(102,0,255,0.35);">
            <div style="min-width:0;flex:1;">
                <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:1px;">Exporting IFC</div>
                <div style="font-size:12px;font-weight:600;color:#fff;">${escHtml(scopeLabel)}</div>
            </div>
            <div class="ifc-export-percent" style="font-size:14px;font-weight:700;color:#fff;flex-shrink:0;">0%</div>
        </div>
        <div style="padding:12px 14px 14px;">
            <div style="height:5px;border-radius:999px;background:rgba(102,0,255,0.10);overflow:hidden;margin-bottom:10px;">
                <div class="ifc-export-bar" style="height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#8B5CF6,#6600FF);transition:width .22s ease;"></div>
            </div>
            <div class="ifc-export-stage" style="font-size:12px;font-weight:600;margin-bottom:4px;color:#1a2035;">Preparing export…</div>
            <div class="ifc-export-detail" style="font-size:11px;line-height:1.5;color:#5a6a85;">Initializing the IFC geometry engine.</div>
            <div style="display:flex;gap:6px;margin-top:10px;color:#7a8aaa;font-size:10px;flex-wrap:wrap;">
                <span>Structure</span><span>→</span><span>Geometry</span><span>→</span><span>Properties</span><span>→</span><span>Download</span>
            </div>
        </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const percent = card.querySelector<HTMLElement>('.ifc-export-percent')!;
    const bar     = card.querySelector<HTMLElement>('.ifc-export-bar')!;
    const stageEl = card.querySelector<HTMLElement>('.ifc-export-stage')!;
    const detailEl = card.querySelector<HTMLElement>('.ifc-export-detail')!;

    return {
        update(stage: string, progress: number, detail = '') {
            const clamped = Math.max(0, Math.min(100, Math.round(progress)));
            percent.textContent = `${clamped}%`;
            bar.style.width = `${clamped}%`;
            stageEl.textContent = stage;
            if (detail) detailEl.textContent = detail;
        },
        remove() {
            overlay.style.pointerEvents = 'none';
            overlay.style.transition = 'opacity .28s ease';
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 300);
        },
    };
}

function waitForNextPaints(count = 2): Promise<void> {
    // D.7.6: per-frame yield routed through getFrameScheduler(). Each
    // scheduleOnce fires on the next scheduler tick (= next browser frame),
    // so the recursive chain still waits exactly `count` frames before
    // resolving — bit-exact with the original double-rAF semantics.
    return new Promise(resolve => {
        const step = (remaining: number) => {
            if (remaining <= 0) {
                resolve();
                return;
            }
            getFrameScheduler().scheduleOnce(
                'init-ui-wait-paint',
                () => step(remaining - 1),
            );
        };
        step(count);
    });
}

async function waitForIfcSceneInteractive(modelId: string, scene: THREE.Scene, selectionManager: any): Promise<number> {
    await waitForNextPaints(2);
    await new Promise(resolve => setTimeout(resolve, 250));
    await waitForNextPaints(2);

    const selectable: THREE.Object3D[] = [];
    const semanticTypes = new Set([
        'wall', 'window', 'door', 'slab', 'furniture', 'column',
        'beam', 'roof', 'stairs', 'stair', 'ramp', 'railing', 'opening',
        'curtainwall', 'ceiling', 'floor', 'space', 'element',
    ]);

    scene.traverse(obj => {
        if (obj.userData?.isHelper || obj.userData?.isPreview || obj.userData?.underlayActive || !obj.visible) return;
        const type = String(obj.userData?.elementType || obj.userData?.type || '').toLowerCase();
        if (obj.userData?.selectable || semanticTypes.has(type) || obj.userData?.modelId === modelId) {
            selectable.push(obj);
        }
    });

    if (selectionManager) {
        selectionManager._selectableCache = selectable;
    }

    window.runtime?.events?.emit('pryzm-ifc-ready', { modelId, selectableCount: selectable.filter(obj => obj.userData?.modelId === modelId).length });

    return selectable.filter(obj => obj.userData?.modelId === modelId).length;
}

// ── initUI ────────────────────────────────────────────────────────────────────

export async function initUI(p: UIParams): Promise<void> {
    const {
        runtime,
        world, components, container, bimManager, projectContext,
        commandManager, selectionManager, toolManager,
        inspector, propertyPanel,
        wallTool, slabTool, curtainWallTool, columnTool, roofTool,
        viewController, navManager, gridToggleService,
        undoManager, grid,
        viewpoints, viewpointsTable, viewsTable,
        zoomToAll, createViewpoint, updateViewsTable,
        addFurniture,
        materialMap, getHdriTexture,
        curtainPanelStoreInstance,
        fragments,
        unselectAll,
        updateIfManualMode,
    } = p;

    /**
     * Phase A.6 close — local helper that routes every toast through
     * `runtime.toasts.show(...)`.  Falls back to the package-owned DOM
     * helper when `runtime` is null (legacy boot path; will become
     * unreachable once Phase D.4 retires `EngineBootstrap`).
     */
    const toast = (
        message: string,
        kind: ToastKind = 'info',
        durationMs?: number,
    ): void => {
        if (runtime) {
            runtime.toasts.show(message, kind, durationMs);
        } else {
            _packageShowAppToast(message, kind, durationMs);
        }
    };

    // ── Contract 47 §5.11 (Step 3′) — Lazy IFC export wrappers ──────────────
    // Cached-promise + reset-on-failure pattern (Contract 47 §4 / §6.D).
    // Modules are fetched on first user-triggered IFC export / audit.
    let _exportIfcModulePromise:
        Promise<typeof import('@pryzm/file-format')> | null = null;
    let _auditIfcModulePromise:
        Promise<typeof import('@pryzm/file-format')> | null = null;

    const _getExportIFC = (): Promise<typeof _exportIFCFn> => {
        if (!_exportIfcModulePromise) {
            _exportIfcModulePromise = import('@pryzm/file-format')
                .catch((err) => {
                    _exportIfcModulePromise = null; // allow retry on transient failure
                    throw err;
                });
        }
        return _exportIfcModulePromise.then((mod) => mod.exportIFC);
    };

    const _getAuditIfcWorkflow = (): Promise<typeof _auditIfcWorkflowFn> => {
        if (!_auditIfcModulePromise) {
            _auditIfcModulePromise = import('@pryzm/file-format')
                .catch((err) => {
                    _auditIfcModulePromise = null;
                    throw err;
                });
        }
        return _auditIfcModulePromise.then((mod) => mod.auditIfcWorkflow);
    };

    // ── IFC Loader (OBC) — set up once, used by import-ifc handler ───────────
    const ifcLoader = components.get(OBC.IfcLoader);
    await ifcLoader.setup({
        autoSetWasm: false,
        wasm: {
            path: '/wasm/',
            absolute: true,
        },
    });

    /**
     * Convert any vertex attribute whose byte-stride is not a multiple of 4
     * to Float32Array.  WebGPU requires all arrayStrides to be ≥4 and a
     * multiple of 4 — OBC fragments uses Int16/Uint16 attributes (stride=6
     * for vec3) that fail WebGPU validation and cause drawIndexed to receive
     * an infinite index count, crashing the render pipeline.
     */
    function ensureWebGpuCompatibleGeometry(root: THREE.Object3D): void {
        root.traverse((child: any) => {
            if (!(child.isMesh || child.isInstancedMesh)) return;
            const geo: THREE.BufferGeometry = child.geometry;
            if (!geo) return;
            for (const name of Object.keys(geo.attributes)) {
                const attr = geo.attributes[name];
                if (!attr || (attr as any).isInterleavedBufferAttribute) continue;
                const a = attr as THREE.BufferAttribute;
                const stride = a.itemSize * a.array.BYTES_PER_ELEMENT;
                if (stride % 4 === 0) continue;
                const dst = new Float32Array(a.count * a.itemSize);
                for (let i = 0; i < dst.length; i++) dst[i] = (a.array as any)[i];
                geo.setAttribute(name, new THREE.BufferAttribute(dst, a.itemSize, a.normalized));
            }
        });
    }

    // When a model is added to FragmentsManager (by ifcLoader.load or frag load)
    // add it to the Three.js scene and keep LOD streaming up-to-date.
    fragments.list.onItemSet.add(async ({ value: model }: { value: any }) => {
        if (model.useCamera) model.useCamera(world.camera.three);
        // Fix geometry alignment BEFORE entering the WebGPU render pipeline
        ensureWebGpuCompatibleGeometry(model.object);
        world.scene.three.add(model.object);
        // Let the WebGPU pipeline rebuild with the new geometry (same mechanism
        // used when shadow-casting meshes are added).  This pauses the pipeline
        // for one frame (16 ms) and then rebuilds cleanly, preventing the
        // drawIndexed crash that occurs on the very first frame after model load.
        const rpm = window.renderPipelineManager;
        if (rpm && typeof rpm.scheduleShadowRebuild === 'function') {
            rpm.scheduleShadowRebuild();
        }
        if ((fragments as any).core?.update) await (fragments as any).core.update(true);
    });

    // ── Phase 1.1: PresentationEngine Foundation ──────────────────────────────
    const presentationEngine = new PresentationEngine(world);
    window.presentationEngine = presentationEngine;

    // ── VG Governance Layer — Phase 1 Rendering Integration ───────────────────
    // Contract 25b Wave 2: VGGovernancePanel mount removed. The store + applicator
    // remain as the back-end implementation surface for 3D mesh visibility (legacy,
    // marked @deprecated). All authoring flows through the Visibility Intent system.
    vgGovernanceStore.ensureModel('model-default', 'Main Model');
    const vgSceneApplicator = new VGSceneApplicator(
        world.scene.three as THREE.Scene,
        vgGovernanceStore as any,
        'model-default',
    );
    window.vgSceneApplicator = vgSceneApplicator;
    window.vgGovernanceStore = vgGovernanceStore; // TODO(TASK-08)
    console.log('[main] VG Governance Layer initialized');

    // ── Phase VI — View Range Filter Service ──────────────────────────────────
    // Constructed AFTER VGSceneApplicator so its event listeners run second,
    // guaranteeing that VG applies category styles before VRF enforces range visibility.
    const viewRangeFilterService = new ViewRangeFilterService(
        world.scene.three as THREE.Scene,
        () => bimManager.getLevels(),
    );
    window.viewRangeFilterService = viewRangeFilterService;
    console.log('[main] View Range Filter Service initialized');

    // ── Phase VR-3 — Crop Region Filter Service ───────────────────────────────
    // Constructed AFTER ViewRangeFilterService so its event listeners fire second
    // in the pipeline: VG → View Range Z filter → Crop XY filter.
    const cropFilterService = new CropRegionFilterService(
        world.scene.three as THREE.Scene,
    );
    window.cropFilterService = cropFilterService;
    console.log('[main] Crop Region Filter Service initialized');

    // ── Phase VR-4 — Underlay Render Service ──────────────────────────────────
    // Constructed LAST so its event listeners fire after VG, VRF, and CRF:
    // VG → View Range Z filter → Crop XY filter → Underlay ghost pass.
    const underlayRenderService = new UnderlayRenderService(
        world.scene.three as THREE.Scene,
        () => bimManager.getLevels(),
    );
    window.underlayRenderService = underlayRenderService;
    console.log('[main] Underlay Render Service initialized');

    // ── Phase VR-2 — Zone Applicator ──────────────────────────────────────────
    // Constructed AFTER all other presentation services so its 'view-selected'
    // listener fires last: VG → VRF (range) → CRF (crop) → URS (underlay) → VRA (zones).
    const viewRangeZoneApplicator = new ViewRangeZoneApplicator(
        world.scene.three as THREE.Scene,
        () => bimManager.getLevels(),
    );
    // Lifecycle-only object: constructor registers 'view-selected' listener.
    // Variable must be retained (not GC'd) so the listener stays active.
    // Wave 7: expose via exposeDevHelpers() in the shim instead.
    void viewRangeZoneApplicator;
    console.log('[main] View Range Zone Applicator initialized');

    // ── Phase A — Semantic Index (tag system) ─────────────────────────────────
    window.semanticIndex = semanticIndex;
    console.log('[main] Semantic Index initialized');

    // ── DOC-5.4 — IFC Pset adapter ────────────────────────────────────────────
    // Exposed on window so IFC loading code (import-ifc handlers, OBC loaders) can
    // call ifcPsetAdapter.ingest(elementId, psets) after fragment loading.
    // Also available for developer diagnostics: ifcPsetAdapter.getAllKnownFields()
    window.ifcPsetAdapter = ifcPsetAdapter;
    console.log('[main] IFC Pset Adapter initialized (DOC-5.4)');

    // ── Phase B — ViewDefinition Store ───────────────────────────────────────
    window.viewDefinitionStore = viewDefinitionStore; // TODO(TASK-08)
    console.log('[main] ViewDefinition Store initialized');

    window.visibilityIntentStore = visibilityIntentStore; // TODO(TASK-08)
    window.viewIntentInstanceStore = viewIntentInstanceStore; // TODO(TASK-08)

    // ── VisibilityIntentPanel (LAZY — Plan §4 / §19.3 Phase 3) ──────────────
    // Constructor side-effects (DOM div, drag wiring, panelManager.register,
    // 3 vi:intent-* window listeners) are all gated on the user opening the
    // panel — the listeners only call `this.render()`, which is a no-op until
    // first open() anyway, so deferring construction is functionally
    // equivalent. Proxy mirrors the real public API: `open(intentId?)` /
    // `close()`. All four external consumers are fire-and-forget.
    {
        let _viModulePromise:
            Promise<typeof import('@app/ui/VisibilityIntentPanel')> | null = null;
        let _viInstance: _VisibilityIntentPanelImpl | null = null;

        const _ensureVisibilityIntentPanel = (): Promise<_VisibilityIntentPanelImpl> => {
            if (!_viModulePromise) {
                _viModulePromise = import('@app/ui/VisibilityIntentPanel')
                    .catch((err) => {
                        // Allow retry on transient network failures (Contract 47 §4).
                        _viModulePromise = null;
                        throw err;
                    });
            }
            return _viModulePromise.then((mod) => {
                if (!_viInstance) {
                    _viInstance = new mod.VisibilityIntentPanel();
                }
                return _viInstance;
            });
        };

        window.visibilityIntentPanel = {
            async open(intentId?: string): Promise<void> {
                try {
                    const panel = await _ensureVisibilityIntentPanel();
                    panel.open(intentId);
                } catch (err) {
                    console.error('[main] VisibilityIntentPanel lazy load failed:', err);
                }
            },
            close(): void {
                if (_viInstance) _viInstance.close();
            },
        };
        console.log('[main] Visibility Intent stores initialized (panel lazy — loads on first use)');
    }

    // System default views — "{3D}" and "Ground Floor" — always present.
    initDefaultViewsManager();

    // ── Phase C — Visibility Rule Engine ─────────────────────────────────────
    window.visibilityRuleEngine = visibilityRuleEngine;
    console.log('[main] Visibility Rule Engine initialized');

    // ── Phase III — Sheet Store ───────────────────────────────────────────────
    window.sheetStore = sheetStore; // TODO(TASK-08)
    console.log('[main] Sheet Store initialized');

    // ── Phase S1/S3 — TitleBlock Store (read-only, pre-seeded) ───────────────
    window.titleBlockStore = titleBlockStore; // TODO(TASK-08)
    console.log('[main] TitleBlock Store initialized (A0, A1, A3 templates seeded)');

    // ── Phase S4 — Sheet Editor Panel (LAZY — Plan §4 / §19.3 Phase 3) ─────
    // Constructor side-effects (7 sd:/vd:/svp: window listeners + panelManager
    // register) all gate on `this._activeSheetId`, which can only be set by a
    // user-initiated `open(sheetId)` call. Pre-open events therefore no-op
    // even on the eager path, so deferring construction is functionally
    // equivalent. Proxy mirrors the real public API: `open(sheetId)` /
    // `close()`. Both external consumers are fire-and-forget.
    {
        let _seModulePromise:
            Promise<typeof import('@app/ui/SheetEditor/SheetEditorPanel')> | null = null;
        let _seInstance: _SheetEditorPanelImpl | null = null;

        const _ensureSheetEditorPanel = (): Promise<_SheetEditorPanelImpl> => {
            if (!_seModulePromise) {
                _seModulePromise = import('@app/ui/SheetEditor/SheetEditorPanel')
                    .catch((err) => {
                        // Allow retry on transient network failures (Contract 47 §4).
                        _seModulePromise = null;
                        throw err;
                    });
            }
            return _seModulePromise.then((mod) => {
                if (!_seInstance) {
                    _seInstance = new mod.SheetEditorPanel();
                }
                return _seInstance;
            });
        };

        window.sheetEditorPanel = {
            async open(sheetId: string): Promise<void> {
                try {
                    const panel = await _ensureSheetEditorPanel();
                    panel.open(sheetId);
                } catch (err) {
                    console.error('[main] SheetEditorPanel lazy load failed:', err);
                }
            },
            close(): void {
                if (_seInstance) _seInstance.close();
            },
        };
        console.log('[main] Sheet Editor Panel registered (lazy — loads on first use)');
    }

    // ── Phase S7 — Sheet Export Service ──────────────────────────────────────
    window.sheetExportService = sheetExportService;
    console.log('[main] Sheet Export Service initialized');

    // ── DOC-3.2 — DXF Export Service ─────────────────────────────────────────
    dxfExportService.init(components);
    window.dxfExportService = dxfExportService;
    console.log('[main] DXF Export Service initialized');

    // ── DOC-3.4 — PDF Export Service (LAZY — Contract 47 §9) ────────────────
    // jspdf (~477 KB) + svg2pdf.js + html2canvas (~201 KB transitive) ≈ 1 MB
    // are deferred until first `exportSheet()` call. We expose a thin proxy on
    // `window.pdfExportService` so the existing call site
    // (`src/commands/views/ExportSheetCommand.ts:66`) is unchanged — it already
    // treats `exportSheet` as `Promise<boolean>`-returning.
    {
        let _pdfModulePromise:
            Promise<typeof import('@pryzm/file-format')> | null = null;
        let _pdfInitDone = false;

        const _ensurePdfExportService = (): Promise<_PdfExportServiceImpl> => {
            if (!_pdfModulePromise) {
                _pdfModulePromise = import('@pryzm/file-format')
                    .catch((err) => {
                        // Allow retry on transient network failures (Contract 47 §4).
                        _pdfModulePromise = null;
                        throw err;
                    });
            }
            return _pdfModulePromise.then((mod) => {
                if (!_pdfInitDone) {
                    mod.pdfExportService.init(components);
                    _pdfInitDone = true;
                }
                return mod.pdfExportService;
            });
        };

        window.pdfExportService = {
            async exportSheet(sheetId: string): Promise<boolean> {
                try {
                    const svc = await _ensurePdfExportService();
                    return svc.exportSheet(sheetId);
                } catch (err) {
                    console.error('[main] PDF Export Service lazy load failed:', err);
                    return false;
                }
            },
        };
        console.log('[main] PDF Export Service registered (lazy — loads on first use)');
    }

    // ── Phase S8 — Sheet Index Service (Drawing Register) ────────────────────
    window.sheetIndexService = sheetIndexService;
    console.log('[main] Sheet Index Service initialized (Drawing Register ready)');

    // ── Phase III — Schedule Store (expose and seed built-in schedules) ───────
    window.scheduleStore = scheduleStore; // TODO(TASK-08)
    scheduleStore.seedDefaultSchedules();
    console.log('[main] Schedule Store initialized and default schedules seeded');

    // ── Phase VII — View Template Store ───────────────────────────────────────
    window.viewTemplateStore = viewTemplateStore; // TODO(TASK-08)
    console.log('[main] View Template Store initialized');

    // ── Phase VII — Phase Filter Store (seeds built-in filters automatically) ─
    window.phaseFilterStore = phaseFilterStore; // TODO(TASK-08)
    console.log('[main] Phase Filter Store initialized (built-ins seeded)');

    // ── DOC-5.1 — Fast-Path Interactive Projector ──────────────────────────────
    const fastPathProjectorService = new FastPathProjectorService();
    window.fastPathProjectorService = fastPathProjectorService;
    console.log('[main] FastPathProjectorService initialized (sub-50ms interactive projection)');

    // ── Phase VII — Camera Persistence helper ─────────────────────────────────
    // Captures current Three.js camera state and stores it on the active ViewDefinition.
    // Usage (from console or UI): window.saveViewCamera('view-def-id')
    window.saveViewCamera = (viewDefinitionId: string): boolean => {
        if (!viewDefinitionId) {
            console.warn('[saveViewCamera] No viewDefinitionId provided');
            return false;
        }
        try {
            const cam = world.camera.three;
            const projType: 'orthographic' | 'perspective' =
                (cam as any).isOrthographicCamera ? 'orthographic' : 'perspective';

            let target: [number, number, number] = [0, 0, 0];
            const controls = (world.camera as any).controls;
            if (controls?.getTarget) {
                const t = controls.getTarget(new (cam as any).constructor());
                target = [t.x ?? 0, t.y ?? 0, t.z ?? 0];
            } else if (controls?.target) {
                const t = controls.target;
                target = [t.x, t.y, t.z];
            }

            const pos  = cam.position;
            const up   = cam.up;
            const fov  = (cam as any).fov;
            const zoom = (cam as any).zoom;

            const projectionSettings: import('@pryzm/core-app-model').ViewProjectionSettings = {
                type:   projType,
                camera: {
                    position: [pos.x, pos.y, pos.z],
                    target,
                    up:       [up.x, up.y, up.z],
                    fov:      projType === 'perspective'  ? fov  : undefined,
                    zoom:     projType === 'orthographic' ? zoom : undefined,
                },
            };
            // [F-1.3] Bus-primary: commandManager exfiltrated to SetViewProjectionHandler (plugins/view).
            window.runtime?.bus?.executeCommand('view.setProjection', {
                viewDefinitionId,
                projection: projectionSettings,
            } as any).catch((e: Error) => console.error('[saveViewCamera] view.setProjection failed:', e));
            console.log(`[saveViewCamera] Saved camera for view "${viewDefinitionId}" (${projType})`);
            return true;
        } catch (err) {
            console.error('[saveViewCamera] Failed to capture camera state:', err);
            return false;
        }
    };

    // ── Export IFC event ──────────────────────────────────────────────────────
    // H5 (07-BIM-SECURITY-CONTRACT §3): A server-side authorization token MUST
    // be fetched before executing the client-side export. The server checks the
    // caller's plan via planStore — client-side localStorage is not trusted.
    // Graceful degradation: if the server is unreachable, fall through to the
    // client-side entitlement check to preserve existing dev behavior.
    window.runtime?.events?.on('export-ifc', async (p: { exportScope?: 'native-only' | 'native-and-imported' }) => { // F.events.15
        const exportScope = p.exportScope ?? 'native-only';
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('audit')) {
            try {
                const auditIfcWorkflow = await _getAuditIfcWorkflow();
                await auditIfcWorkflow();
            } catch (err) {
                console.error('[export-ifc] Audit workflow lazy load failed:', err);
                alert('IFC audit failed to load. See console for details.');
            }
            return;
        }
        try {
            const authRes = await apiFetch('/api/export/authorize?type=ifc');
            if (authRes.status === 403) {
                const body = await authRes.json().catch(() => ({}));
                console.warn('[export-ifc] Server denied export:', body.reason ?? 'plan not authorized');
                // F.events.2d — DOM dispatch removed; listener migrated to runtime.events
                window.runtime?.events?.emit('pryzm-upgrade-required', { feature: 'IFC_EXPORT', reason: body.reason, plan: body.plan });
                return;
            }
            if (!authRes.ok) {
                if (import.meta.env.PROD) {
                    // H5-FIX (07-BIM-SECURITY-CONTRACT §3): In production builds, server errors
                    // are treated as a deny — fail secure rather than falling through to the
                    // client-side entitlement check.
                    console.warn('[export-ifc] Auth endpoint returned non-OK in production — export blocked.');
                    return;
                }
                console.warn('[export-ifc] Auth endpoint error (dev mode), falling back to client-side check');
            }
        } catch (err) {
            if (import.meta.env.PROD) {
                // H5-FIX: In production builds, network errors also block export (fail secure).
                console.warn('[export-ifc] Auth endpoint unreachable in production — export blocked:', err);
                return;
            }
            console.warn('[export-ifc] Could not reach auth endpoint (dev mode), proceeding with client-side check:', err);
        }
        // PERF-AUDIT-2026 P1: Ensure WASM worker is ready before IFC export.
        // fragments._initPromise is set by EngineBootstrap (non-blocking init).
        // By the time any user can click Export, the ~2-5s init is long complete.
        if ((fragments as any)._initPromise) await (fragments as any)._initPromise;

        const exportOverlay = createIfcExportOverlay(exportScope);
        try {
            const exportIFC = await _getExportIFC();
            await exportIFC(components, fragments, {
                exportScope,
                onProgress: (stage, progress, detail) => {
                    exportOverlay.update(stage, progress, detail);
                },
            });
        } catch (err) {
            console.error('[export-ifc] Export failed', err);
            alert('IFC export failed. See the on-screen log for details.');
        } finally {
            setTimeout(() => exportOverlay.remove(), 900);
        }
    });

    // ── Import IFC event ──────────────────────────────────────────────────────
    const importedIfcGroups = new Map<string, THREE.Group>();

    async function runIfcNativeConversion(mode: 'dry-run' | 'convert', selectedOnly = false, modelId?: string): Promise<void> {
        const { IfcConversionCoordinator } = await import('@pryzm/file-format');
        const { ifcConversionReportStore } = await import('@pryzm/file-format');
        window.ifcConversionReportStore = ifcConversionReportStore; // TODO(TASK-08)

        const coordinator = new IfcConversionCoordinator({
            scene: world.scene.three as unknown as THREE.Scene,
            commandManager,
            bimManager,
            selectionManager,
            options: {
                mode,
                selectedOnly,
                modelId,
                hideSourceMeshes: true,
            },
        });

        const report = coordinator.run({ mode, selectedOnly, modelId, hideSourceMeshes: true });
        const action = mode === 'dry-run' ? 'Dry run' : 'Conversion';
        toast(`${action}: ${report.stats.converted.toLocaleString()} candidate${report.stats.converted === 1 ? '' : 's'} ${mode === 'dry-run' ? 'found' : 'converted'}; ${report.stats.failed.toLocaleString()} failed.`, report.stats.failed ? 'warn' : 'success', 6000);
        window.runtime?.events?.emit('pryzm-ifc-native-conversion-complete', report);
    }

    function showIfcConversionReport(): void {
        const store = window.ifcConversionReportStore; // TODO(TASK-08)
        const report = store?.getLatest?.();
        if (!report) {
            toast('No IFC conversion report is available yet.', 'warn', 3500);
            return;
        }

        document.getElementById('pryzm-ifc-conversion-report')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'pryzm-ifc-conversion-report';
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:999999',
            'display:flex', 'align-items:center', 'justify-content:center',
            'background:rgba(5,8,18,.55)', 'font-family:system-ui,sans-serif',
        ].join(';');
        const issues = report.issues.slice(0, 12).map((issue: any) =>
            `<li style="margin-bottom:6px;color:${issue.severity === 'error' ? '#f87171' : issue.severity === 'warn' ? '#fbbf24' : '#cbd5e1'}">${escHtml(issue.message)}</li>`
        ).join('');
        overlay.innerHTML = `
            <div style="width:min(620px,calc(100vw - 40px));max-height:82vh;overflow:auto;border-radius:18px;background:#111827;color:#f8fafc;border:1px solid rgba(102,0,255,.65);box-shadow:0 24px 70px rgba(0,0,0,.45);padding:22px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;">
                    <div>
                        <div style="font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#9fa8ff;">IFC Native Conversion Report</div>
                        <div style="font-size:18px;font-weight:750;margin-top:4px;">${escHtml(report.mode === 'dry-run' ? 'Dry Run' : 'Conversion')}</div>
                    </div>
                    <button data-close style="border:0;border-radius:10px;background:#263149;color:white;padding:8px 12px;cursor:pointer;">Close</button>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
                    <div style="background:#172033;border-radius:12px;padding:12px;"><div style="font-size:12px;color:#94a3b8;">Converted</div><div style="font-size:24px;font-weight:800;">${report.stats.converted}</div></div>
                    <div style="background:#172033;border-radius:12px;padding:12px;"><div style="font-size:12px;color:#94a3b8;">Candidates</div><div style="font-size:24px;font-weight:800;">${report.stats.candidates}</div></div>
                    <div style="background:#172033;border-radius:12px;padding:12px;"><div style="font-size:12px;color:#94a3b8;">Failed</div><div style="font-size:24px;font-weight:800;">${report.stats.failed}</div></div>
                </div>
                <div style="font-size:13px;line-height:1.7;color:#cbd5e1;margin-bottom:14px;">
                    Rooms ${report.stats.rooms ?? 0} · Walls ${report.stats.walls ?? 0} · Curtain Walls ${report.stats.curtainwalls ?? 0} · Slabs ${report.stats.slabs ?? 0} · Floors ${report.stats.floors ?? 0} · Ceilings ${report.stats.ceilings ?? 0}<br>
                    Columns ${report.stats.columns ?? 0} · Beams ${report.stats.beams ?? 0} · Roofs ${report.stats.roofs ?? 0} · Doors ${report.stats.doors ?? 0} · Windows ${report.stats.windows ?? 0}<br>
                    Railings ${report.stats.railings ?? 0} · Furniture ${report.stats.furniture ?? 0} · Stairs ${report.stats.stairs ?? 0} · Proxies ${report.stats.proxies ?? 0} · Unsupported ${report.stats.unsupported ?? 0}
                </div>
                <div style="font-size:14px;font-weight:700;margin-bottom:8px;">Issues</div>
                <ul style="padding-left:18px;margin:0;">${issues || '<li style="color:#86efac">No issues reported.</li>'}</ul>
            </div>`;
        overlay.querySelector('[data-close]')?.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    /**
     * showImportModeDialog — modal dialog shown before every IFC import.
     *
     * Lets the user choose between:
     *   • "Open as IFC Reference"    — load geometry/semantic data in read-only
     *                                  reference mode (default PRYZM behaviour).
     *   • "Convert to Native"        — load as reference first, then immediately
     *                                  run the full IfcConversionCoordinator pipeline
     *                                  to create editable PRYZM-native elements.
     *
     * Returns the chosen mode, or null if the user dismissed the dialog.
     */
    interface ImportModeChoice {
        mode: 'reference' | 'native';
        addLevels: boolean;
    }

    /**
     * §28-IFC-IMPORT-NATIVE-PARITY-CONTRACT §12
     *
     * Shows a dark modal offering two import modes plus an optional
     * "Add IFC levels" toggle.  Returns the chosen options, or null if cancelled.
     *
     * Visual language: §05 palette — violet gradient header, #0d1827 body,
     * no outer solid border, box-shadow only.
     */
    function showImportModeDialog(file: File): Promise<ImportModeChoice | null> {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = [
                'position:fixed', 'inset:0', 'z-index:200000',
                'display:flex', 'align-items:center', 'justify-content:center',
                'background:rgba(10,12,25,0.82)', 'backdrop-filter:blur(6px)',
            ].join(';');

            const sizeMB = (file.size / 1048576).toFixed(2);
            overlay.innerHTML = `
                <div style="
                    background:#0d1827;
                    border-radius:16px;
                    padding:0;
                    max-width:520px;
                    width:90vw;
                    box-shadow:0 24px 64px rgba(0,0,0,0.7);
                    font-family:var(--app-font,system-ui,sans-serif);
                    color:#e2e8f0;
                    overflow:hidden;
                ">
                    <!-- §05 gradient header -->
                    <div style="
                        background:linear-gradient(135deg,#8B5CF6 0%,#6600FF 100%);
                        padding:14px 20px 12px;
                    ">
                        <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:4px;">IFC Import</div>
                        <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
                             title="${file.name}">${file.name}</div>
                        <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:2px;">${sizeMB} MB — Choose how to open this file</div>
                    </div>

                    <!-- Mode cards -->
                    <div style="padding:20px 20px 0;">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">

                            <!-- Reference -->
                            <button data-mode="reference" style="
                                background:#111827;
                                border:1.5px solid rgba(139,92,246,0.35);
                                border-radius:10px;
                                padding:14px 12px;
                                cursor:pointer;
                                text-align:left;
                                color:#e2e8f0;
                                transition:border-color 160ms,background 160ms;
                            ">
                                <div style="font-size:18px;margin-bottom:6px;">📎</div>
                                <div style="font-size:12px;font-weight:700;margin-bottom:4px;">IFC Reference</div>
                                <div style="font-size:11px;color:#94a3b8;line-height:1.5;">Load geometry and BIM data in read-only reference mode. Fast, no conversion step.</div>
                            </button>

                            <!-- Native -->
                            <button data-mode="native" style="
                                background:#0f1929;
                                border:1.5px solid rgba(139,92,246,0.55);
                                border-radius:10px;
                                padding:14px 12px;
                                cursor:pointer;
                                text-align:left;
                                color:#e2e8f0;
                                transition:border-color 160ms,background 160ms;
                            ">
                                <div style="font-size:18px;margin-bottom:6px;">⚡</div>
                                <div style="font-size:12px;font-weight:700;margin-bottom:4px;">Convert to Native</div>
                                <div style="font-size:11px;color:#94a3b8;line-height:1.5;">Import then auto-convert Rooms, Walls, Doors and Windows into fully editable PRYZM native elements.</div>
                            </button>
                        </div>

                        <!-- "Add IFC levels" toggle — §28 §12 -->
                        <label data-add-levels-row style="
                            display:flex;
                            align-items:flex-start;
                            gap:10px;
                            background:#111827;
                            border:1.5px solid rgba(139,92,246,0.25);
                            border-radius:10px;
                            padding:12px 14px;
                            cursor:pointer;
                            margin-bottom:18px;
                            transition:border-color 160ms;
                        ">
                            <input
                                type="checkbox"
                                data-add-levels
                                checked
                                style="
                                    margin:1px 0 0;
                                    width:14px;height:14px;
                                    accent-color:#8B5CF6;
                                    cursor:pointer;
                                    flex-shrink:0;
                                "
                            />
                            <div>
                                <div style="font-size:12px;font-weight:700;color:#e2e8f0;margin-bottom:3px;">Add IFC levels as PRYZM levels</div>
                                <div style="font-size:11px;color:#94a3b8;line-height:1.5;">
                                    Creates a native PRYZM level and a Floor Plan view for each storey found in the IFC file.
                                    You can then work directly on those levels in the View Browser.
                                </div>
                            </div>
                        </label>
                    </div>

                    <!-- Footer -->
                    <div style="display:flex;justify-content:flex-end;padding:0 20px 16px;">
                        <button data-cancel style="
                            background:none;
                            border:none;
                            color:#64748b;
                            font-size:12px;
                            cursor:pointer;
                            padding:6px 12px;
                        ">Cancel</button>
                    </div>
                </div>`;

            const addLevelsCheckbox = overlay.querySelector('[data-add-levels]') as HTMLInputElement;
            const addLevelsRow = overlay.querySelector('[data-add-levels-row]') as HTMLElement;

            addLevelsRow.addEventListener('mouseenter', () => {
                addLevelsRow.style.borderColor = 'rgba(139,92,246,0.6)';
            });
            addLevelsRow.addEventListener('mouseleave', () => {
                addLevelsRow.style.borderColor = 'rgba(139,92,246,0.25)';
            });

            function cleanup(mode: 'reference' | 'native' | null) {
                overlay.remove();
                if (mode === null) { resolve(null); return; }
                resolve({ mode, addLevels: addLevelsCheckbox?.checked ?? true });
            }

            overlay.querySelector('[data-mode="reference"]')?.addEventListener('click', () => cleanup('reference'));
            overlay.querySelector('[data-mode="native"]')?.addEventListener('click', () => cleanup('native'));
            overlay.querySelector('[data-cancel]')?.addEventListener('click', () => cleanup(null));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });

            // Hover states on mode buttons
            overlay.querySelectorAll('button[data-mode]').forEach((btn) => {
                (btn as HTMLElement).addEventListener('mouseenter', () => {
                    (btn as HTMLElement).style.borderColor = 'rgba(139,92,246,0.9)';
                    (btn as HTMLElement).style.background  = '#162040';
                });
                (btn as HTMLElement).addEventListener('mouseleave', () => {
                    const isNative = (btn as HTMLElement).dataset.mode === 'native';
                    (btn as HTMLElement).style.borderColor = isNative ? 'rgba(139,92,246,0.55)' : 'rgba(139,92,246,0.35)';
                    (btn as HTMLElement).style.background  = isNative ? '#0f1929' : '#111827';
                });
            });

            document.body.appendChild(overlay);
        });
    }

    // ── §IFC-STORE-1: IFC persistence helpers ────────────────────────────────

    // modelId → server upload UUID (for delete cleanup)
    const _ifcServerUploadIds = new Map<string, string>();

    /**
     * Upload the raw IFC binary to the server after a successful import.
     * Called non-blocking (fire-and-forget) so it never delays the UI.
     */
    async function _uploadIfcToServer(fileName: string, buffer: ArrayBuffer, elementCount: number, modelId: string): Promise<void> {
        const projectId = window.currentProjectId as string | null | undefined;
        if (!projectId) {
            console.log('[IFC Storage] No active project — skipping server upload.');
            return;
        }
        const token = localStorage.getItem('bim-platform-token');
        if (!token) {
            console.log('[IFC Storage] Not authenticated — skipping server upload.');
            return;
        }

        const form = new FormData();
        form.append('file', new Blob([buffer], { type: 'application/octet-stream' }), fileName);
        form.append('elementCount', String(elementCount));

        const resp = await fetch(`/api/projects/${projectId}/ifc-uploads`, {
            method:  'POST',
            headers: { Authorization: `Bearer ${token}` },
            body:    form,
        });

        if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`Server responded ${resp.status}: ${body}`);
        }

        const json = await resp.json() as { ok: boolean; upload: { id: string; upload_status: string } };
        if (json.upload?.id) {
            _ifcServerUploadIds.set(modelId, json.upload.id);
        }
        console.log(`[IFC Storage] Upload persisted — id: ${json.upload?.id}, status: ${json.upload?.upload_status}`);
    }

    // §IFC-STORE-1 — Delete server-side upload when a model is removed
    window.runtime?.events?.on('pryzm-import-model-remove', (p: { modelId: string }) => { // F.events.13
        const { modelId } = p;
        if (!modelId) return;
        const serverId  = _ifcServerUploadIds.get(modelId);
        const projectId = window.currentProjectId as string | null | undefined;
        const token     = localStorage.getItem('bim-platform-token');
        if (!serverId || !projectId || !token) return;

        fetch(`/api/projects/${projectId}/ifc-uploads/${serverId}`, {
            method:  'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        }).then(() => {
            _ifcServerUploadIds.delete(modelId);
            console.log(`[IFC Storage] Deleted server upload for model ${modelId}`);
        }).catch(err => {
            console.warn('[IFC Storage] Delete cleanup failed:', err);
        });
    });

    /**
     * Restore IFC models for a project after sign-in / project open.
     * Fetches the list of stored IFC uploads, downloads each binary, and
     * re-runs the import pipeline in 'reference' mode (no dialog shown).
     */
    async function _restoreIfcUploads(projectId: string): Promise<void> {
        const token = localStorage.getItem('bim-platform-token');
        if (!token) return;

        const listResp = await fetch(`/api/projects/${projectId}/ifc-uploads`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!listResp.ok) return;

        const { uploads } = await listResp.json() as { uploads: Array<{ id: string; file_name: string; element_count: number }> };
        if (!uploads?.length) return;

        console.log(`[IFC Restore] Found ${uploads.length} stored IFC model(s) for project ${projectId} — restoring…`);

        for (const upload of uploads) {
            try {
                const dataResp = await fetch(
                    `/api/projects/${projectId}/ifc-uploads/${upload.id}/data`,
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                if (!dataResp.ok) {
                    console.warn(`[IFC Restore] Could not get data for upload ${upload.id} — skipping.`);
                    continue;
                }

                const data = await dataResp.json() as { url?: string; base64?: string; fileName: string };
                let arrayBuffer: ArrayBuffer;

                if (data.url) {
                    // Supabase Storage — fetch the binary via signed URL
                    const binResp = await fetch(data.url);
                    if (!binResp.ok) {
                        console.warn(`[IFC Restore] Binary download failed for ${data.fileName} — skipping.`);
                        continue;
                    }
                    arrayBuffer = await binResp.arrayBuffer();
                } else if (data.base64) {
                    // DB fallback — decode base64 to binary
                    const byteStr = atob(data.base64);
                    const arr     = new Uint8Array(byteStr.length);
                    for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
                    arrayBuffer = arr.buffer;
                } else {
                    console.warn(`[IFC Restore] No binary data for upload ${upload.id} — skipping.`);
                    continue;
                }

                // Create a synthetic File and re-run the import pipeline
                const file = new File([arrayBuffer], data.fileName ?? upload.file_name, {
                    type: 'application/octet-stream',
                });

                console.log(`[IFC Restore] Re-importing ${file.name} (${arrayBuffer.byteLength} bytes)`);
                // 'reference' mode, no "Add IFC levels" — silent restore
                await processIfcFile(file, 'reference', false);

                // Register modelId → server upload ID so delete cleanup works this session
                const restoredModelName = file.name.replace(/\.ifc$/i, '');
                const restoredModelId   = 'ifc-' + restoredModelName.toLowerCase().replace(/[^a-z0-9]/g, '-');
                _ifcServerUploadIds.set(restoredModelId, upload.id);

            } catch (restoreErr) {
                console.warn(`[IFC Restore] Failed to restore ${upload.file_name}:`, restoreErr);
            }
        }

        console.log(`[IFC Restore] Restoration complete for project ${projectId}`);
    }

    // §IFC-STORE-1 — Restore IFC models when a project is opened
    window.runtime?.events?.on('pryzm-project-loaded', (payload: unknown) => { // F.events.9
        const detail = payload as { projectId?: string; empty?: boolean } | undefined;
        if (!detail?.projectId || detail.empty) return;
        // Small delay so the native BIM scene fully hydrates first
        setTimeout(() => {
            _restoreIfcUploads(detail.projectId!).catch(err =>
                console.warn('[IFC Restore] Failed:', err),
            );
        }, 500);
    });

    // ─────────────────────────────────────────────────────────────────────────

    // Shared file processor — used by both the file-picker and the drag-drop zone
    async function processIfcFile(file: File, importMode: 'reference' | 'native' = 'reference', addLevels = false): Promise<void> {
        // Phase 2.6: Auto-register the imported IFC file as a VG model record
        // and create a dedicated VGSceneApplicator for per-model rendering isolation.
        const modelName = file.name.replace(/\.ifc$/i, '');
        const modelId   = 'ifc-' + modelName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        vgGovernanceStore.ensureModel(modelId, modelName);
        // Contract 25b Wave 2: VGGovernancePanel retired; model registration is now
        // handled internally by vgGovernanceStore.ensureModel above.
        const ifcApplicator = new VGSceneApplicator(
            world.scene.three as any,
            vgGovernanceStore as any,
            modelId,
        );
        (window as unknown as Record<string, unknown>)[`vgSceneApplicator_${modelId}`] = ifcApplicator;
        console.log(`[VG] IFC model registered: ${modelId} (${modelName})`);
        console.log(`[VG] VGSceneApplicator created for IFC model: ${modelId}`);
        console.log('[main] IFC Import triggered for file:', file.name);

        // Auto-enable performance mode for the duration of the IFC import.
        // This suspends shadows/SSGI/TRAA so the GPU stays free for geometry
        // streaming, then automatically restores quality when the model is ready.
        window.performanceModePanel?.autoEnablePerf();

        const importOverlay = createIfcImportOverlay(file.name);
        importOverlay.update('Reading IFC file', 6, 'Loading the selected model into memory.');

        // §IFC-STORE-1 — Closure to carry buffer across chained .then() callbacks
        let _capturedBuffer: ArrayBuffer | null = null;

        file.arrayBuffer().then(async (buffer: ArrayBuffer) => {
            _capturedBuffer = buffer;
            importOverlay.update('Preparing WebIFC', 12, 'Starting the IFC parser and geometry pipeline.');
            const bytes = new Uint8Array(buffer);

            // ── IfcGeometryRenderer + IfcImporter (shared WASM parse) ────
            // OBC's ifcLoader.load() creates ShaderMaterial-based fragment
            // meshes which are incompatible with Three.js WebGPU's
            // NodeMaterial system.  This causes:
            //   "THREE.NodeMaterial: Material ShaderMaterial is not compatible"
            //   → drawIndexed crash with infinite index count
            //   → RenderPipelineManager retries exhaust → viewport crash
            //
            // Fix: use our own IfcGeometryRenderer which calls StreamAllMeshes
            // directly and creates THREE.MeshStandardMaterial (WebGPU-safe,
            // auto-promoted to MeshStandardNodeMaterial by the TSL backend).
            // We share one WASM IfcAPI instance (importAndKeepOpen) to avoid
            // parsing the file twice.
            console.log('[IFC Import] Loading geometry with IfcGeometryRenderer:', file.name);
            const { IfcImporter } = await import('@pryzm/file-format');
            const { IfcGeometryRenderer } = await import('@pryzm/file-format');

            const importer = new IfcImporter();
            await importer.init();
            importOverlay.update('Parsing IFC structure', 24, 'Reading project, building, level, room, and relationship data.');

            // Parse once: semantic extraction (model stays open for geometry)
            const { result, modelID } = await importer.importAndKeepOpen(bytes);
            result.modelId   = modelId;
            result.modelName = modelName;
            result.fileName  = file.name;
            importOverlay.update('Extracting semantic data', 38, `${result.stats.totalStoreys} levels, ${result.stats.totalSpaces} spaces, and ${result.relationships.length} relationships found.`);

            // §28: Extract elements FIRST (with psets) so the index is ready for the renderer
            const { ifcModelStore } = await import('@pryzm/file-format');
            const elements = importer.extractElements(modelID);
            console.log(`[IFC Import] Extracted ${elements.length} physical elements with psets`);
            importOverlay.update('Registering model elements', 52, `${elements.length.toLocaleString()} selectable BIM elements recognised.`);

            // Build expressID → record index for geometry renderer (§28 §3.2)
            const elementIndex = new Map(elements.map(e => [e.expressID, e]));

            // Render geometry from the same open WASM model, enriching each mesh.
            // Suspend the WebGPU post-FX pipeline (SSGI/TRAA) while StreamAllMeshes
            // runs synchronously — this is the biggest single source of LONGTASK
            // warnings and 3-7 FPS drops during IFC loading.
            importOverlay.update('Streaming 3D geometry', 66, 'Creating WebGPU-safe meshes for the viewport.');
            const rpm = window.renderPipelineManager;
            if (rpm && typeof rpm.setSuspended === 'function') rpm.setSuspended(true);
            // Disable shadow maps during streaming to avoid redundant shadow-map
            // rebuilds for each mesh added to the scene.
            const threeRenderer = (world as any).renderer?.three ?? (world as any).renderer;
            const prevShadowEnabled = threeRenderer?.shadowMap?.enabled ?? true;
            if (threeRenderer?.shadowMap) threeRenderer.shadowMap.enabled = false;

            const geoRenderer = new IfcGeometryRenderer(importer.getApi());
            const renderedModel = geoRenderer.renderFromOpenModel(
                modelID, world.scene.three as unknown as THREE.Scene, modelId, modelName, elementIndex,
            );

            // Record mesh/triangle stats in the result
            result.stats.totalMeshes    = renderedModel.meshCount;
            result.stats.totalTriangles = renderedModel.triangleCount;
            result.geometry = {
                meshCount: renderedModel.meshCount,
                triangleCount: renderedModel.triangleCount,
                elementCount: renderedModel.elementCount,
            };
            importedIfcGroups.set(modelId, renderedModel.group);
            importOverlay.update('Building viewport model', 78, `${renderedModel.meshCount.toLocaleString()} meshes and ${renderedModel.triangleCount.toLocaleString()} triangles loaded.`);

            // Register elements in the model store
            const storeyOrder = [...new Set(elements.map(e => e.storeyName).filter(s => s !== 'Unassigned'))];
            if (elements.some(e => e.storeyName === 'Unassigned')) storeyOrder.push('Unassigned');
            ifcModelStore.register({ modelId, modelName, elements, storeyOrder });
            window.ifcModelStore = ifcModelStore; // TODO(TASK-08)
            console.log(`[IFC Import] Element store: ${elements.length} elements across ${storeyOrder.length} storeys`);
            importOverlay.update('Preparing model browser', 84, `${storeyOrder.length.toLocaleString()} levels and element metadata are ready.`);

            // Build element type summary for import modal (§28)
            const typeCounts: Record<string, number> = {};
            for (const el of elements) {
                const t = el.ifcTypeName ?? 'Unknown';
                typeCounts[t] = (typeCounts[t] ?? 0) + 1;
            }
            (result.stats as any).typeCounts    = typeCounts;
            (result.stats as any).totalElements = elements.length;

            // Close the WASM model now that both passes are done
            importer.getApi().CloseModel(modelID);
            importer.dispose();

            // Fix any non-4-byte-aligned vertex attributes before WebGPU sees them
            ensureWebGpuCompatibleGeometry(renderedModel.group);
            importOverlay.update('Finalizing scene', 90, 'Uploading geometry and rebuilding rendering support.');

            // Restore shadow maps and resume post-FX pipeline now that all geometry is in place.
            if (threeRenderer?.shadowMap) threeRenderer.shadowMap.enabled = prevShadowEnabled;
            if (rpm && typeof rpm.setSuspended === 'function') rpm.setSuspended(false);

            // Give the WebGPU pipeline one clean frame to build GPU handles
            // for the new geometry (same mechanism used by the shadow system)
            if (rpm && typeof rpm.scheduleShadowRebuild === 'function') {
                rpm.scheduleShadowRebuild();
            }

            console.log(`[IFC Import] Geometry loaded: ${renderedModel.meshCount} meshes, ${renderedModel.triangleCount} triangles`);
            return result;
        }).then(async (result: IfcImportResult) => {
            console.log('[IFC Import] Result:', result.stats);

            // Write relationships to SemanticGraph
            const sgm = window.semanticGraphManager;
            if (sgm) {
                for (const rel of result.relationships) {
                    try {
                        sgm.addRelationship({
                            type:      rel.type,
                            sourceId:  rel.sourceId,
                            targetId:  rel.targetId,
                            metadata:  rel.metadata ?? {},
                            createdBy: 'ifc-import',
                        });
                    } catch (_) {}
                }
                console.log(`[IFC Import] ${result.relationships.length} relationships written to SemanticGraph`);
            }

            // Fire event so other subsystems can consume the result.
            // DOM event is the current primary path; runtime.events is the
            // IFC-P6 target path — emit to both so subscribers on either bus
            // receive the notification once the runtime slot lands.
            window.runtime?.events?.emit('pryzm-ifc-imported', result as any); // F.events.13
            (window.runtime as any)?.events?.emit?.('ifc.modelImported', result);

            // Notify SpatialTree to refresh IFC section
            window.runtime?.events?.emit('pryzm-ifc-tree-updated', {});

            // §IFC-STORE-1 — persist the binary to the server so it survives sign-out.
            // Non-blocking: runs in the background without blocking the UI.
            if (_capturedBuffer) {
                _uploadIfcToServer(file.name, _capturedBuffer, (result.stats as any).totalElements ?? 0, modelId)
                    .catch(err => console.warn('[IFC Storage] Background upload failed:', err));
                // IFC-P1.6: Release the 38 MB ArrayBuffer as soon as the upload
                // has been handed off. Without this, _capturedBuffer persists for
                // the entire session (closure keeps it alive) leaking heap memory.
                _capturedBuffer = null;
            }

            // IFC-P1.7: Store the CRS record for the GeospatialAdapter and
            // IFC4X3 re-export round-trip (contract C12 §1.4).
            // readIfcProjectedCRS() returns null when no IfcProjectedCRS entity
            // is present (most IFC files) — the null is stored intentionally so
            // downstream code knows the lookup was attempted.
            if ((result as any).crsRecord !== undefined) {
                window.pryzmCRS = (result as any).crsRecord;
                if ((result as any).crsRecord) {
                    console.log('[IFC Import] CRS record found:', (result as any).crsRecord.name);
                }
            }

            // Invalidate SelectionManager's selectable-objects cache so the
            // newly added IFC meshes (which have selectable:true) get picked up
            // on the next click without requiring a full page reload.
            const sm = window.selectionManager;
            if (sm) sm._selectableCache = null;

            importOverlay.update('Making model interactive', 96, 'Finishing navigation and selection readiness.');
            const selectableCount = await waitForIfcSceneInteractive(result.modelId ?? modelId, world.scene.three as unknown as THREE.Scene, selectionManager);

            if (importMode === 'native') {
                importOverlay.update('Converting to native elements', 98, 'Running element conversion pipeline. This may take a moment…');
                console.log(`[IFC Import] Auto-starting native conversion for model: ${modelId}`);
                try {
                    await runIfcNativeConversion('convert', false, modelId);
                    importOverlay.update('Native conversion complete', 100, 'All convertible IFC elements are now editable PRYZM native elements.');
                    setTimeout(() => importOverlay.remove(), 800);
                    toast('IFC converted to native PRYZM elements successfully.', 'success', 5000);
                } catch (convErr) {
                    console.error('[IFC Import] Native conversion failed:', convErr);
                    importOverlay.update('Conversion error', 100, 'Native conversion encountered errors. Model is still available as a reference.');
                    setTimeout(() => importOverlay.remove(), 1200);
                    toast('IFC model loaded (conversion encountered errors — see console).', 'error', 6000);
                }
            } else {
                importOverlay.update('Ready to navigate and select', 100, `${selectableCount.toLocaleString()} imported elements are selectable in the viewport.`);
                setTimeout(() => importOverlay.remove(), 650);
                toast(`IFC ready: ${(result.geometry?.meshCount ?? result.stats.totalMeshes ?? 0).toLocaleString()} meshes loaded and selection is available.`, 'success', 5000);
            }

            // §28 §12 — "Add IFC levels" option
            // Run after the import/conversion step so that native-conversion levels
            // (created by IfcStoreyLevelMapper) are already in place and de-duplication
            // skips them correctly.
            //
            // PERF: Set the global IFC-import-in-progress flag so that the
            // activeLevelChanged → camera-slide handler in EngineBootstrap.ts
            // is suppressed during level creation. Without this the camera
            // animates to each storey elevation as IfcLevelImporter creates them,
            // leaving the camera pointing at the Parapet level (top of building)
            // when the import finishes — causing the "model disappears" bug.
            if (addLevels && result.storeys?.length) {
                console.log(`[IFC Import] Running IfcLevelImporter for ${result.storeys.length} storeys…`);
                window._ifcLevelImportInProgress = true;
                try {
                    const { importIfcLevelsAndViews } = await import('@pryzm/file-format');
                    const summary = await importIfcLevelsAndViews(result.storeys, commandManager, bimManager);
                    if (summary.levelsCreated > 0 || summary.viewsCreated > 0) {
                        const parts: string[] = [];
                        if (summary.levelsCreated) parts.push(`${summary.levelsCreated} level${summary.levelsCreated !== 1 ? 's' : ''}`);
                        if (summary.viewsCreated)  parts.push(`${summary.viewsCreated} floor plan view${summary.viewsCreated !== 1 ? 's' : ''}`);
                        toast(`IFC levels added: ${parts.join(' and ')} created.`, 'success', 5000);
                    } else if (summary.skipped > 0) {
                        toast(`IFC levels: all ${summary.skipped} storey${summary.skipped !== 1 ? 's' : ''} already exist as PRYZM levels.`, 'info', 4000);
                    }
                } catch (lvlErr) {
                    console.error('[IFC Import] IfcLevelImporter failed:', lvlErr);
                } finally {
                    window._ifcLevelImportInProgress = false;
                }
            }

            // Fit the viewport to the newly imported IFC geometry.
            // zoomToAll is NOT called by pryzm-project-loaded at this point
            // (that event fired when the project was opened, before the IFC import).
            // Without this call the camera stays at whatever elevation the last
            // level-switch animation landed on, making the model appear invisible.
            setTimeout(() => {
                try {
                    zoomToAll();
                } catch (e) {
                    console.warn('[IFC Import] zoomToAll after import failed:', e);
                }
                // Restore full render quality now that the model is visible and
                // the camera is positioned. Only fires if auto-perf was activated
                // by this import — manual user toggles are left untouched.
                window.performanceModePanel?.autoDisablePerf();
            }, 300);

        }).catch((err: Error) => {
            importOverlay.remove();
            // Make sure perf mode is restored even on import failure.
            window.performanceModePanel?.autoDisablePerf();
            console.error('[IFC Import] Failed:', err);
            const errToast = document.createElement('div');
            errToast.style.cssText = [
                'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
                'background:#1a2035', 'color:#E24B4A', 'padding:10px 20px',
                'border-radius:8px', 'font-size:13px', 'z-index:9999',
                'border:1px solid #E24B4A', 'font-family:system-ui,sans-serif',
            ].join(';');
            errToast.textContent = `IFC Import failed: ${err.message}`;
            document.body.appendChild(errToast);
            setTimeout(() => errToast.remove(), 6000);
        });
    }

    // Slim file-picker listener — shows import-mode dialog then delegates to shared processor
    window.runtime?.events?.on('import-ifc', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ifc';
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            const choice = await showImportModeDialog(file);
            if (choice === null) return;
            processIfcFile(file, choice.mode, choice.addLevels);
        };
        input.click();
    });

    // ── Phase 1 Interop: Revit-guided import ─────────────────────────────────
    // Shows the Revit wizard (step-by-step instructions) then opens a file picker.
    window.runtime?.events?.on('import-revit-guided', async () => {
        const { RevitWizardPanel } = await import('@app/ui/interop/RevitWizardPanel');
        // Phase B.40 (S73-WIRE) — thread composed runtime so the wizard can
        // mount through runtime.dialogs once C.x lands.
        const confirmed = await RevitWizardPanel.show(p.runtime ?? null /* B-runtime-thread RevitWizardPanel.show */);
        if (!confirmed) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ifc';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const choice = await showImportModeDialog(file);
            if (choice === null) return;
            // Tag this import as coming from Revit so the fidelity report shows the right label
            window._pryzmLastImportSource = 'revit';
            processIfcFile(file, choice.mode, choice.addLevels);
        };
        input.click();
    });

    // ── Phase 1 Interop: Post-conversion fidelity report ─────────────────────
    // Shown after any native IFC conversion completes (converts IFC → editable elements).
    window.runtime?.events?.on('pryzm-ifc-native-conversion-complete', async (report: any) => { // F.events.13
        if (!report) return;
        const { showIfcFidelityReport } = await import('@app/ui/interop/InteropFidelityReport');
        const sourceApp = window._pryzmLastImportSource as 'revit' | 'unknown' | undefined;
        delete window._pryzmLastImportSource;
        // Phase B.40 (S73-WIRE) — thread composed runtime so the report can
        // route through runtime.toasts once C.x lands.
        showIfcFidelityReport(report, sourceApp === 'revit' ? 'revit' : 'unknown', p.runtime ?? null /* B-runtime-thread showIfcFidelityReport */);
    });

    // ── Phase 1 Interop: Rhino .3DM import ───────────────────────────────────
    // Opens a file picker, imports via Three.js Rhino3dmLoader (rhino3dm WASM served
    // from /libs/rhino3dm/), adds the geometry to the scene as reference meshes.
    const _rhinoImportGroups = new Map<string, THREE.Group>();

    async function processRhinoFile(file: File): Promise<void> {
        const overlay = createIfcImportOverlay(file.name);
        try {
            const buffer = await file.arrayBuffer();
            const { importRhino3DM } = await import('@pryzm/file-format');
            const result = await importRhino3DM(
                buffer,
                file.name,
                (stage, pct, detail) => overlay.update(stage, pct, detail),
            );

            // Add the imported group to the Three.js scene
            (world.scene.three as unknown as THREE.Scene).add(result.group);
            _rhinoImportGroups.set(result.group.userData.modelId, result.group);

            // Invalidate selection cache so new geometry is pickable
            const sm = window.selectionManager;
            if (sm) sm._selectableCache = null;

            // Show fidelity report card
            setTimeout(async () => {
                const { showRhinoFidelityReport } = await import('@app/ui/interop/InteropFidelityReport');
                // Phase B.40 (S73-WIRE) — thread composed runtime so the report can
                // route through runtime.toasts once C.x lands.
                showRhinoFidelityReport(result.stats, result.fileName, result.elapsed, result.issues, p.runtime ?? null /* B-runtime-thread showRhinoFidelityReport */);
            }, 600);

            // Notify Import Manager — §32
            // F.events.2d — full migration: DOM dispatch replaced with runtime.events.emit
            window.runtime?.events?.emit('pryzm-rhino-imported', { modelId: result.group.userData.modelId, fileName: result.fileName });

            toast(
                `Rhino model imported: ${result.stats.objectCount.toLocaleString()} objects, ${result.stats.layerCount} layers.`,
                'success',
                5000,
            );
        } catch (err: any) {
            console.error('[Rhino Import] Failed:', err);
            toast(`Rhino import failed: ${err?.message ?? String(err)}`, 'error', 7000);
        } finally {
            setTimeout(() => overlay.remove(), 800);
        }
    }

    window.runtime?.events?.on('import-rhino', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.3dm';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            console.log('[Rhino Import] File selected:', file.name, `(${(file.size / 1024).toFixed(0)} KB)`);
            processRhinoFile(file);
        };
        input.click();
    });

    // ── Rhino Import Manager event bridge (§32) ──────────────────────────────

    window.runtime?.events?.on('pryzm-rhino-remove', (p: { modelId: string }) => { // F.events.15
        const id = p.modelId;
        if (!id) return;
        const group = _rhinoImportGroups.get(id);
        if (!group) { console.warn('[Rhino IM] modelId not found:', id); return; }
        (world.scene.three as unknown as THREE.Scene).remove(group);
        _rhinoImportGroups.delete(id);
        console.log('[Rhino IM] removed modelId:', id);
    });

    window.runtime?.events?.on('pryzm-rhino-set-visibility', (p: { modelId: string; visible: boolean }) => { // F.events.15
        const id = p.modelId;
        if (!id) return;
        const group = _rhinoImportGroups.get(id);
        if (!group) return;
        group.visible = p.visible ?? true;
        console.log('[Rhino IM] setVisibility', id, p.visible);
    });

    window.runtime?.events?.on('pryzm-rhino-set-locked', (p: { modelId: string; locked: boolean; noSelect?: boolean }) => { // F.events.15
        const id = p.modelId;
        if (!id) return;
        const group = _rhinoImportGroups.get(id);
        if (!group) return;
        group.userData.locked   = p.locked   ?? true;
        group.userData.noSelect = p.noSelect  ?? false;
        console.log('[Rhino IM] setLocked', id, 'locked=', p.locked, 'noSelect=', p.noSelect);
    });

    // ── Import Manager Panel — §32 ─────────────────────────────────────────────
    // Mount exactly once; toggle via 'pryzm-import-manager-toggle' event.
    {
        const { ImportManagerPanel } = await import('@app/ui/import-manager/ImportManagerPanel');
        // Phase B.16-IM (S73-WIRE) — forward composed runtime so ImportManagerPanel
        // toasts + future imports route through the typed PryzmRuntime handle.
        const importManagerPanel = new ImportManagerPanel(p.runtime ?? null);
        window.runtime?.events?.on('pryzm-import-manager-toggle', () => importManagerPanel.toggle()); // F.events.13
        console.log('[initUI] ImportManagerPanel mounted');
    }

    // ── Phase 1 Interop: Export for Revit (IFC 2x3) ──────────────────────────
    // Uses IFC 2x3 schema for maximum Revit compatibility, and names the file
    // with a _for_revit suffix to signal to the user which export to use.
    window.runtime?.events?.on('export-ifc-revit', async () => { // F.events.15
        try {
            const authRes = await apiFetch('/api/export/authorize?type=ifc');
            if (authRes.status === 403) {
                const body = await authRes.json().catch(() => ({}));
                console.warn('[export-ifc-revit] Server denied export:', (body as any).reason ?? 'plan not authorized');
                // F.events.2d — DOM dispatch removed; listener migrated to runtime.events
                window.runtime?.events?.emit('pryzm-upgrade-required', { feature: 'IFC_EXPORT', reason: (body as any).reason, plan: (body as any).plan });
                return;
            }
            if (!authRes.ok && import.meta.env.PROD) {
                console.warn('[export-ifc-revit] Auth check returned non-OK in production — export blocked.');
                return;
            }
        } catch (err) {
            if (import.meta.env.PROD) {
                console.warn('[export-ifc-revit] Auth endpoint unreachable in production — export blocked:', err);
                return;
            }
            console.warn('[export-ifc-revit] Auth endpoint unreachable (dev mode), proceeding:', err);
        }

        if ((fragments as any)._initPromise) await (fragments as any)._initPromise;

        const projectName = (window.projectName ?? 'project') as string;
        const safeName    = projectName.replace(/[^a-z0-9_\- .]/gi, '').trim() || 'project';
        const filename    = `${safeName}_for_revit.ifc`;

        const exportOverlay = createIfcExportOverlay('Revit-optimised (IFC 2x3)');
        try {
            const exportIFC = await _getExportIFC();
            await exportIFC(components, fragments, {
                exportScope: 'native-only',
                schema:      'IFC2X3',
                filename,
                onProgress:  (stage, progress, detail) => exportOverlay.update(stage, progress, detail),
            });
            toast(`Exported "${filename}" — open Revit, go to File → Open → IFC to import.`, 'success', 7000);
        } catch (err) {
            console.error('[export-ifc-revit] Export failed:', err);
            alert('Revit IFC export failed. See console for details.');
        } finally {
            setTimeout(() => exportOverlay.remove(), 900);
        }
    });

    // ── Drag-and-drop IFC import zone on the 3D viewport ─────────────────────
    (function attachIfcDropZone() {
        let dropOverlay: HTMLElement | null = null;
        let dragCounter = 0;

        function showDropOverlay() {
            if (dropOverlay) return;
            dropOverlay = document.createElement('div');
            dropOverlay.style.cssText = [
                'position:absolute', 'inset:0', 'z-index:99990',
                'display:flex', 'align-items:center', 'justify-content:center',
                'pointer-events:none',
                'border:2px dashed rgba(102,0,255,0.85)',
                'border-radius:6px',
                'background:rgba(13,18,35,0.72)',
                'backdrop-filter:blur(4px)',
                'transition:opacity 120ms ease',
            ].join(';');
            dropOverlay.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;gap:12px;pointer-events:none;text-align:center">
                    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="26" cy="26" r="25" stroke="rgba(102,0,255,0.7)" stroke-width="1.5"/>
                        <path d="M26 16v14M19 23l7-7 7 7" stroke="#c4b5fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M17 34h18" stroke="#c4b5fd" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <div style="font-family:system-ui,sans-serif;font-size:15px;font-weight:600;color:#c4b5fd;letter-spacing:.2px">Drop .ifc file to import</div>
                    <div style="font-family:system-ui,sans-serif;font-size:12px;color:rgba(196,181,253,0.55)">File will be added to the current scene</div>
                </div>`;
            container.style.position = container.style.position || 'relative';
            container.appendChild(dropOverlay);
        }

        function hideDropOverlay() {
            if (!dropOverlay) return;
            dropOverlay.style.opacity = '0';
            const el = dropOverlay;
            setTimeout(() => el.remove(), 130);
            dropOverlay = null;
        }

        container.addEventListener('dragenter', (e: DragEvent) => {
            e.preventDefault();
            const items = e.dataTransfer?.items;
            if (!items) return;
            let hasFile = false;
            for (let i = 0; i < items.length; i++) { if (items[i].kind === 'file') { hasFile = true; break; } }
            if (!hasFile) return;
            dragCounter++;
            showDropOverlay();
        });

        container.addEventListener('dragover', (e: DragEvent) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        });

        container.addEventListener('dragleave', (e: DragEvent) => {
            e.preventDefault();
            dragCounter = Math.max(0, dragCounter - 1);
            if (dragCounter === 0) hideDropOverlay();
        });

        container.addEventListener('drop', async (e: DragEvent) => {
            e.preventDefault();
            dragCounter = 0;
            hideDropOverlay();
            const file = e.dataTransfer?.files[0];
            if (!file) return;
            const lname = file.name.toLowerCase();
            if (lname.endsWith('.3dm')) {
                console.log('[Rhino Drop] File dropped:', file.name, `(${(file.size / 1024).toFixed(0)} KB)`);
                processRhinoFile(file);
                return;
            }
            if (!lname.endsWith('.ifc')) {
                toast('Drop a .ifc or .3dm file here to import it.', 'error', 4000);
                return;
            }
            console.log('[IFC Drop] File dropped:', file.name, `(${(file.size / 1024).toFixed(0)} KB)`);
            const choice = await showImportModeDialog(file);
            if (choice === null) return;
            processIfcFile(file, choice.mode, choice.addLevels);
        });
    })();

    window.runtime?.events?.on('pryzm-import-model-visibility', (p: { modelId: string; visible: boolean }) => { // F.events.13
        const group = importedIfcGroups.get(p.modelId);
        if (group) group.visible = p.visible !== false;
    });

    // §32 — Import Manager: pin / no-select lock for IFC models
    window.runtime?.events?.on('pryzm-import-model-set-locked', (p: { modelId: string; locked: boolean; noSelect?: boolean }) => { // F.events.13
        const group = importedIfcGroups.get(p.modelId);
        if (!group) return;
        group.userData.locked   = p.locked   ?? true;
        group.userData.noSelect = p.noSelect  ?? false;
        // When noSelect is true, mark every mesh inside as non-selectable
        group.traverse((obj) => {
            if ((obj as any).isMesh) {
                obj.userData.selectable = !group.userData.noSelect;
            }
        });
        console.log('[IFC IM] setLocked', p.modelId, 'locked=', p.locked, 'noSelect=', p.noSelect);
    });

    window.runtime?.events?.on('pryzm-import-model-remove', (p: { modelId: string }) => { // F.events.13
        const group = importedIfcGroups.get(p.modelId);
        if (!group) return;
        const renderer = (group as any).__ifcRenderer;
        if (renderer?.disposeGroup) {
            renderer.disposeGroup(group);
        } else {
            // Fallback: detach from scene AND dispose every mesh's geometry +
            // material + textures so the GPU memory is reclaimed. Without this
            // the IFC group is invisible after a Delete but its buffers stay
            // allocated until page reload.
            group.removeFromParent();
            group.traverse((obj: any) => {
                if (!obj.isMesh) return;
                obj.geometry?.dispose?.();
                const disposeMat = (m: any) => {
                    if (!m) return;
                    m.map?.dispose?.();
                    m.normalMap?.dispose?.();
                    m.roughnessMap?.dispose?.();
                    m.metalnessMap?.dispose?.();
                    m.emissiveMap?.dispose?.();
                    m.dispose?.();
                };
                if (Array.isArray(obj.material)) obj.material.forEach(disposeMat);
                else disposeMat(obj.material);
            });
        }
        window.ifcModelStore?.remove?.(p.modelId); // TODO(TASK-08)
        importedIfcGroups.delete(p.modelId);
        // Drop server-side upload tracking so the next mount doesn't try to
        // re-issue a stale DELETE.
        _ifcServerUploadIds.delete(p.modelId);
        console.log(`[IFC IM] Removed and disposed model ${p.modelId}`);
    });

    window.runtime?.events?.on('pryzm-ifc-native-dry-run', (p: { modelId?: string; selectedOnly?: boolean }) => { // F.events.13
        runIfcNativeConversion('dry-run', !!p.selectedOnly, p.modelId).catch((err) => {
            console.error('[IFC Conversion] Dry run failed', err);
            toast(`IFC dry run failed: ${err instanceof Error ? err.message : String(err)}`, 'error', 6000);
        });
    });

    window.runtime?.events?.on('pryzm-ifc-native-convert-model', (p: { modelId?: string }) => { // F.events.13
        runIfcNativeConversion('convert', false, p.modelId).catch((err) => {
            console.error('[IFC Conversion] Convert model failed', err);
            toast(`IFC conversion failed: ${err instanceof Error ? err.message : String(err)}`, 'error', 6000);
        });
    });

    window.runtime?.events?.on('pryzm-ifc-native-convert-selected', (p: { modelId?: string }) => { // F.events.13
        runIfcNativeConversion('convert', true, p.modelId).catch((err) => {
            console.error('[IFC Conversion] Convert selected failed', err);
            toast(`IFC selected conversion failed: ${err instanceof Error ? err.message : String(err)}`, 'error', 6000);
        });
    });

    window.runtime?.events?.on('pryzm-ifc-native-report', () => showIfcConversionReport()); // F.events.13

    window.runtime?.events?.on('pryzm-ifc-native-source-visibility', async (p: { modelId: string; visible: boolean }) => { // F.events.13
        const detail = p;
        const { IfcConversionCoordinator } = await import('@pryzm/file-format');
        const coordinator = new IfcConversionCoordinator({
            scene: world.scene.three as unknown as THREE.Scene,
            commandManager,
            bimManager,
            selectionManager,
            options: {
                mode: 'dry-run',
                selectedOnly: false,
                modelId: detail.modelId,
                hideSourceMeshes: true,
            },
        });
        const count = coordinator.setConvertedSourceVisibility(detail.visible !== false, detail.modelId);
        toast(`${detail.visible !== false ? 'Showing' : 'Hiding'} ${count.toLocaleString()} converted IFC source mesh${count === 1 ? '' : 'es'}.`, 'info', 3500);
    });


    // ── Phase 2.5: Propagate view activation/deactivation to VGSceneApplicator ─
    // VGSceneApplicator subscribes to 'view-selected' / 'view-deactivated' internally,
    // so no additional wiring is needed here. When 'view-selected' fires, we also
    // ensure the view is registered in the store so that it appears in the
    // VGGovernancePanel view selector.
    window.runtime?.events?.on('view-selected', async (payload: unknown) => { // F.events.8
        const p = payload as { viewId?: string | null; view?: { id?: string } } | undefined;
        const viewId   = p?.viewId ?? p?.view?.id ?? null;
        const viewName = (p as any)?.viewName ?? p?.view?.id ?? 'Unnamed View';
        if (viewId) {
            vgGovernanceStore.ensureView(viewId, viewName, 'model-default');
        }

        // Phase VII — Camera Persistence: restore saved camera state when a view
        // that has a ViewDefinition with projection data is activated.
        //
        // RC2-FIX: Use controls.setLookAt() instead of direct THREE.Camera writes.
        //
        // The old code called cam.position.set() + cam.up.set() + cam.lookAt() directly
        // on the Three.js camera object, bypassing camera-controls' internal state
        // machine (interpolation targets, quaternion, dolly distance).  This caused a
        // divergence: camera-controls "snapped" back to its internal state on the next
        // user interaction (drag/scroll), making the controls feel broken after the
        // second view activation.
        //
        // The fix routes all camera positioning through camera-controls so the internal
        // state stays in sync with the visual camera position.
        if (viewId) {
            const viewDef = viewDefinitionStore.get(viewId);
            const projection = viewDef?.projection;
            if (projection?.camera) {
                try {
                    const { position, target, up, fov, zoom } = projection.camera;
                    const controls = (world.camera as any).controls;
                    const cam      = world.camera.three;

                    if (controls?.setLookAt) {
                        // Route through camera-controls so its internal state stays in sync.
                        // animate=false: snap immediately; a tween here would race the
                        // render loop just like the RC1 bug in _activate3DView().
                        await controls.setLookAt(
                            position[0], position[1], position[2],
                            target[0],   target[1],   target[2],
                            false
                        );
                        // Apply up vector after setLookAt (controls may reset it).
                        if (up) {
                            cam.up.set(up[0], up[1], up[2]);
                        }
                        controls.update?.(0);
                    } else {
                        // Fallback (non-camera-controls environment): direct write is the
                        // only option, but log a warning so regressions are visible.
                        console.warn('[Phase VII] controls.setLookAt not available — falling back to direct camera write (controls state may diverge)');
                        cam.position.set(position[0], position[1], position[2]);
                        if (up) cam.up.set(up[0], up[1], up[2]);
                        cam.lookAt(target[0], target[1], target[2]);
                    }

                    if (projection.type === 'perspective' && fov !== undefined) {
                        (cam as any).fov = fov;
                        (cam as any).updateProjectionMatrix?.();
                    } else if (projection.type === 'orthographic' && zoom !== undefined) {
                        (cam as any).zoom = zoom;
                        (cam as any).updateProjectionMatrix?.();
                    }

                    console.log(`[Phase VII] Restored camera for view "${viewId}" (${projection.type ?? 'unknown'}) via controls.setLookAt`);
                } catch (err) {
                    console.warn(`[Phase VII] Camera restore failed for view "${viewId}":`, err);
                }
            }
        }
    });

    // ── §DW-04: CurtainWallBuilder (bootstrap layer — tools must not own builders) ─
    window.curtainWallStore = (curtainWallTool as any).store; // TODO(TASK-08)
    window.curtainWallBuilder = new CurtainWallBuilder(world.scene.three as THREE.Scene);

    // ── §3.8 / §Critical #3 FIX: Wire CurtainWallStore → CurtainWallBuilder ──
    {
        const cwStore = window.curtainWallStore as import('@pryzm/geometry-curtain-wall').CurtainWallStore; // TODO(TASK-08)
        const cwBuilder = window.curtainWallBuilder as import('@pryzm/geometry-curtain-wall').CurtainWallBuilder;

        if (cwStore?.subscribe && cwBuilder) {
            cwStore.subscribe((event: string, cw: any) => {
                try {
                    if (event === 'remove') {
                        cwBuilder.remove(cw.id);
                    } else {
                        cwBuilder.updateCurtainWall(cw);
                    }
                } catch (err) {
                    console.error('[CurtainWall] Store→Builder subscriber error:', err);
                }
            });
            console.log('[CurtainWall] Store→Builder event wiring established');
        }

        // ── §MI-02 FIX: CurtainPanelStore → CurtainWallBuilder rebuild subscriber ──
        // When a panel is updated (e.g. by ReplacePanelTypeCommand), the panel store
        // emits an 'update' event. This subscriber finds the parent curtain wall and
        // calls the builder directly — replacing the old fragile "touch" pattern.
        {
            const cpStore = curtainPanelStoreInstance;
            if (cpStore?.subscribe && cwBuilder) {
                cpStore.subscribe((event: string, panel: any) => {
                    if (event !== 'update') return;
                    try {
                        // PERF-FIX-5: Use getReadOnly() instead of get() to avoid an
                        // extra deep clone of the CurtainWallData. The reference is
                        // consumed immediately inside updateCurtainWall() and never stored.
                        // Contract §01 §3.4: Readonly<> prevents accidental mutation.
                        const cw = cwStore?.getReadOnly(panel.curtainWallId);
                        if (cw) {
                            cwBuilder.updateCurtainWall(cw as any);
                        }
                    } catch (err) {
                        console.error('[CurtainWall] PanelStore→Builder subscriber error:', err);
                    }
                });
                console.log('[CurtainWall] PanelStore→Builder event wiring established (§MI-02)');
            }
        }
    }

    window.columnStore = (columnTool as any).store; // TODO(TASK-08)
    window.columnBuilder = (columnTool as any).builder;


    window.addEventListener('beforeunload', () => {
        slabTool.dispose();
        wallTool.dispose();
        bimManager.dispose();
    });

    // ── applyVisualStyle ──────────────────────────────────────────────────────
    const applyVisualStyle = async (style: VisualStyle) => {
        const shadowedScene = world.scene as OBC.ShadowedScene;
        const renderer = world.renderer!;
        const threeScene = world.scene.three as unknown as THREE.Scene;

        if (style === VisualStyle.REALISTIC) {
            const texture = await getHdriTexture();
            if (texture) threeScene.environment = texture;
            renderer.three.toneMapping = THREE.NeutralToneMapping;
            renderer.three.toneMappingExposure = 1.0;
            shadowedScene.shadowsEnabled = true;

            const postproduction = (renderer as OBCF.PostproductionRenderer).postproduction;
            postproduction.style = OBCF.PostproductionAspect.COLOR_SHADOWS;
            postproduction.aoPass.blendIntensity = 0.6;
        } else {
            threeScene.environment = null;
            renderer.three.toneMapping = THREE.NoToneMapping;
            shadowedScene.shadowsEnabled = false;

            const postproduction = (renderer as OBCF.PostproductionRenderer).postproduction;
            postproduction.style = OBCF.PostproductionAspect.PEN;
            postproduction.aoPass.blendIntensity = 0.15;
        }

        world.scene.three.traverse((obj: THREE.Object3D) => {
            if (obj instanceof THREE.Mesh && obj.userData.materialId) {
                const def = materialMap.get(obj.userData.materialId);
                if (def) {
                    const params = { ...def.params };
                    if (style === VisualStyle.CONSISTENT_COLORS) {
                        params.metalness = 0;
                        params.roughness = 1;
                        params.map = undefined;
                        params.normalMap = undefined;
                        params.roughnessMap = undefined;
                    } else {
                        params.map = def.textures?.color;
                        params.normalMap = def.textures?.normal;
                        params.roughnessMap = def.textures?.roughness;
                    }
                    obj.material = new THREE.MeshStandardMaterial(params);
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            }
        });

        await shadowedScene.updateShadows();
        wallTool.updateVisualStyle(style);
    };

    // ── deleteSelected ────────────────────────────────────────────────────────
    // §ROOF-SYSTEM-AUDIT-2026 §3.1 / §6.2  AND  §BUG-1: roof not deleted.
    //
    // Previous behaviour did `parent.remove(obj)` directly on the THREE.Object3D,
    // which:
    //   • removed only the visual node (not the store entry, registry,
    //     SemanticGraph relations, shadow caches, or downstream views);
    //   • created a fake undo entry that re-attached an already-disposed mesh;
    //   • caused selection of a child mesh (e.g. a single RoofPart slope face)
    //     to delete only that face while the rest of the roof remained.
    //
    // The fix: walk up the parent chain to find the first node carrying
    // `userData.elementType` + `userData.id` (set by every fragment builder at
    // the BIM-element root), then dispatch the polymorphic DeleteElementCommand
    // which routes to the correct per-type delete branch and registers itself
    // with commandManager's undo stack.
    const deleteSelected = async () => {
        if (!selectionManager.selectedObject) {
            toast('No element selected to delete', 'warn');
            return;
        }
        const obj = selectionManager.selectedObject;

        // 1. Imported-IFC elements have their own purge path.
        if (await deleteIfcImportedElement(obj, {
            selectionManager,
            updateShadows: () => {
                if (world.scene instanceof OBC.ShadowedScene) {
                    world.scene.updateShadows();
                }
            },
        })) {
            toast('Imported IFC element deleted', 'success');
            return;
        }

        // 2. Walk up to find the BIM root (carries userData.elementType + id).
        let bimRoot: THREE.Object3D | null = obj;
        while (bimRoot && !(bimRoot.userData?.elementType && bimRoot.userData?.id)) {
            bimRoot = bimRoot.parent;
        }

        if (bimRoot && bimRoot.userData?.id && bimRoot.userData?.elementType) {
            const elementId   = bimRoot.userData.id as string;
            const elementType = bimRoot.userData.elementType as string;
            try {
                // [F-1.3] Bus-primary: commandManager exfiltrated to DeleteElementHandler (plugins/view).
                window.runtime?.bus?.executeCommand('element.delete', { elementId, elementType, source: 'HUMAN_DIRECT' })
                    .catch((e: Error) => console.error('[deleteSelected] element.delete failed:', e));
                unselectAll();
                if (world.scene instanceof OBC.ShadowedScene) {
                    world.scene.updateShadows();
                }
                toast(`${elementType} deleted`, 'success');
                return;
            } catch (err) {
                console.error('[deleteSelected] DeleteElementCommand failed:', err);
                toast(`Failed to delete ${elementType}: ${(err as Error).message}`, 'error');
                return;
            }
        }

        // 3. Non-BIM Object3D (e.g. annotation helper) — fall back to detach.
        const parent = obj.parent;
        if (parent) {
            undoManager.add({
                execute: () => {
                    parent.remove(obj);
                    if (world.scene instanceof OBC.ShadowedScene) {
                        world.scene.updateShadows();
                    }
                },
                undo: () => {
                    parent.add(obj);
                    if (world.scene instanceof OBC.ShadowedScene) {
                        world.scene.updateShadows();
                    }
                }
            });
            parent.remove(obj);
            if (world.scene instanceof OBC.ShadowedScene) {
                world.scene.updateShadows();
            }
        }
        unselectAll();
    };

    // ── Views: plans, elevations, section cuts ────────────────────────────────
    const views = components.get(OBC.Views);
    views.world = world;
    OBC.Views.defaultRange = 100;

    const generatePlans = async () => {
        const planViewService = viewController.planViewService;
        const config = planViewService.getViewConfig('top');

        const view = views.create(
            config.direction,
            config.center.clone().add(new THREE.Vector3(0, 50, 0)),
            { id: 'Ground Floor', world },
        );
        view.range = 2;
        (view as any).type = 'Floor Plan';

        await viewController.activate('Top');
        updateViewsTable();
        console.log('[generatePlans] Floor plan created with fragment-based positioning');
    };

    const generateElevations = async () => {
        const planViewService = viewController.planViewService;

        const frontConfig = planViewService.getViewConfig('front');
        const backConfig  = planViewService.getViewConfig('back');
        const leftConfig  = planViewService.getViewConfig('left');
        const rightConfig = planViewService.getViewConfig('right');

        const distance = Math.max(
            frontConfig.size.x, frontConfig.size.y, frontConfig.size.z, 20,
        );

        views.create(new THREE.Vector3(0, 0, 1),  frontConfig.center.clone().add(new THREE.Vector3(0, 0, -distance)), { id: 'North Elevation', world });
        views.create(new THREE.Vector3(0, 0, -1), backConfig.center.clone().add(new THREE.Vector3(0, 0, distance)),  { id: 'South Elevation', world });
        views.create(new THREE.Vector3(-1, 0, 0), leftConfig.center.clone().add(new THREE.Vector3(distance, 0, 0)),  { id: 'East Elevation',  world });
        views.create(new THREE.Vector3(1, 0, 0),  rightConfig.center.clone().add(new THREE.Vector3(-distance, 0, 0)),{ id: 'West Elevation',  world });

        updateViewsTable();
        console.log('[generateElevations] Elevations created with fragment-based positioning');
    };

    const onCloseView = async () => {
        views.close();
        (world.camera as any).projection?.set('Perspective');
        const persCam = world.camera.three as THREE.PerspectiveCamera;
        persCam.far = 1000;
        persCam.updateProjectionMatrix();
        grid.fade = true;
        await world.camera.controls!.setLookAt(8, 8, 8, 0, 0, 0, true);
    };

    // ── SectionBoxTool — initialise and expose on window ─────────────────────
    const sectionBoxTool = new SectionBoxTool();
    window.sectionBoxTool = sectionBoxTool;
    // Expose world & viewport container so BottomActionMenu / SectionBoxTool can find them
    window.world           = world;
    window.viewportContainer = container;

    // ── Double-click: zoom camera to the clicked BIM element ─────────────────
    //
    // Algorithm:
    //   1. If a tool is active (drawing mode), skip — tools own dblclick.
    //   2. Cast a ray from the current pointer position.
    //   3. Walk up from the hit mesh to find the *closest* ancestor that
    //      carries a BIM semantic id (userData.id + elementType/type).
    //      This gives us the individual element, not the whole scene root.
    //   4. Fall back to the direct scene-child if no semantic root is found.
    //   5. Frame the camera to that object with a smooth animation.
    //
    const caster = components.get(OBC.Raycasters).get(world);

    const SEMANTIC_TYPES_FOR_ZOOM = new Set([
        'wall', 'slab', 'floor', 'ceiling', 'door', 'window',
        'curtain-wall', 'curtainwall', 'furniture', 'column',
        'roof', 'ifc-element', 'ifc-model', 'beam',
    ]);

    container.addEventListener('dblclick', async (e: MouseEvent) => {
        // Let SelectionManager's slab-profile dblclick handle slabs first
        // (it calls e.preventDefault() so we check defaultPrevented)
        if (e.defaultPrevented) return;
        const activeToolMode = toolManager.getActiveTool?.();
        if (activeToolMode && activeToolMode !== 'none') return;

        const result = await caster.castRay();
        if (!result?.object) {
            // Nothing hit — try using the already-selected element from selectionManager
            const selected = selectionManager?.selectedObject as THREE.Object3D | null;
            if (selected && world.camera.controls) {
                await frameObject(selected, world.camera.controls as any);
            }
            return;
        }

        // Walk up from hit mesh → find first ancestor with a BIM semantic id
        let target: THREE.Object3D = result.object;
        let semanticRoot: THREE.Object3D | null = null;
        let cur: THREE.Object3D | null = result.object;

        while (cur && !(cur instanceof THREE.Scene) && cur.type !== 'Scene') {
            const type = (cur.userData?.elementType || cur.userData?.type || '').toLowerCase();
            if (
                cur.userData?.id &&
                !cur.userData?.isHelper &&
                !cur.userData?.isPreview &&
                !cur.userData?.isSectionBoxGizmo &&
                (SEMANTIC_TYPES_FOR_ZOOM.has(type) || cur.userData?.selectable)
            ) {
                semanticRoot = cur;
                break; // take the *closest* semantic ancestor (most specific element)
            }
            // Keep advancing; if no semantic root found, use the direct scene child
            if (cur.parent && (cur.parent instanceof THREE.Scene || cur.parent.type === 'Scene')) {
                target = cur; // direct scene child as last-resort fallback
            }
            cur = cur.parent;
        }

        const frameTarget = semanticRoot ?? target;
        const controls = world.camera.controls;
        if (controls) {
            console.log('[dblclick-zoom] Framing:', frameTarget.userData?.id ?? frameTarget.uuid, '| type:', frameTarget.userData?.type ?? frameTarget.userData?.elementType ?? 'n/a');
            await frameObject(frameTarget, controls as any);
        }
    });

    // ── Expose camera controls for CameraRailPanel navigation arrows ──────────
    window.cameraControls = world.camera.controls;

    // ── Viewport cursor — orbit/pan/zoom visual feedback ─────────────────────
    {
        let _leftDown  = false;
        let _rightDown = false;
        let _midDown   = false;
        let _shift     = false;

        const _cursor = (c: string) => { container.style.cursor = c; };

        container.addEventListener('mousedown', (e) => {
            if (e.button === 0) { _leftDown  = true; _cursor('grabbing'); }
            if (e.button === 1) { _midDown   = true; _cursor('ns-resize'); }
            if (e.button === 2) { _rightDown = true; _cursor('all-scroll'); }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) _leftDown  = false;
            if (e.button === 1) _midDown   = false;
            if (e.button === 2) _rightDown = false;
            if (!_leftDown && !_rightDown && !_midDown) {
                _cursor(_shift ? 'move' : 'default');
            }
        });

        container.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') { _shift = true;  if (!_leftDown) _cursor('move'); }
        });
        container.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') { _shift = false; if (!_leftDown) _cursor('default'); }
        });

        container.addEventListener('mouseleave', () => {
            if (!_leftDown && !_rightDown && !_midDown) _cursor('default');
        });
    }

    // ── updateProjectUI, toggleSection, updatePanels ──────────────────────────
    let activeRightSection: string | null = null;

    const updateProjectUI = () => {
        const listContainer = document.getElementById('levels-list-container');
        if (!listContainer) return;
        listContainer.innerHTML = '';
        const levels = bimManager.getLevels();
        levels.forEach((level: any) => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: 0.65rem; padding: 2px 4px; border-bottom: 1px solid #fafafa; pointer-events: auto; color: #333;';

            const text = document.createElement('span');
            text.textContent = `${level.name} (${level.elevation}m)`;
            row.appendChild(text);

            if (level.id !== 'L0') {
                const btn = document.createElement('button');
                btn.innerHTML = '🗑️';
                btn.style.cssText = 'min-width: 20px; height: 20px; border: none; background: none; cursor: pointer; font-size: 0.6rem;';
                btn.onclick = (e) => {
                    e.stopPropagation();
                    bimManager.removeLevel(level.id);
                    wallTool.getWallStore().removeLevel(level.id);
                    updateProjectUI();
                };
                row.appendChild(btn);
            }
            listContainer.appendChild(row);
        });
    };

    window.addEventListener('update-project-ui', updateProjectUI);

    const updatePanels = () => {
        const createContent    = document.getElementById('create-content');
        const libraryContent   = document.getElementById('library-content');
        const editContent      = document.getElementById('edit-content');
        const visibilityContent = document.getElementById('visibility-content');
        const projectContent   = document.getElementById('project-content');

        if (createContent)    createContent.style.display    = activeRightSection === 'create'     ? 'flex'  : 'none';
        if (libraryContent)   libraryContent.style.display   = activeRightSection === 'library'    ? 'grid'  : 'none';
        if (editContent)      editContent.style.display      = activeRightSection === 'edit'       ? 'flex'  : 'none';
        if (visibilityContent) visibilityContent.style.display = activeRightSection === 'visibility' ? 'flex' : 'none';
        if (projectContent)   projectContent.style.display   = activeRightSection === 'project'    ? 'flex'  : 'none';
    };

    const toggleSection = (section: string) => {
        activeRightSection = activeRightSection === section ? null : section;
        updatePanels();
        if (activeRightSection === 'project') {
            setTimeout(updateProjectUI, 0);
        }
    };

    // ── Shadow / lighting utilities ───────────────────────────────────────────
    const toggleShadows = async () => {
        const shadowedScene = world.scene as OBC.ShadowedScene;
        shadowedScene.shadowsEnabled = !shadowedScene.shadowsEnabled;
        const enabling = shadowedScene.shadowsEnabled;

        // ── WebGPU path: toggle the PRYZM renderer's shadowMap ───────────────────
        // When Phase 5 is active, pryzmRenderer (window.pryzmRenderer) is the
        // PRYZM-owned WebGPU renderer that exclusively drives shadow rendering.
        // OBC's WebGL shadowMap is permanently disabled in Phase 5 (initScene.ts
        // sets postproductionRenderer.three.shadowMap.enabled=false at §1131).
        // Without this, "Cast shadows" toggle has zero effect under WebGPU — it
        // only flips shadowedScene.shadowsEnabled on OBC's silenced renderer.
        try {
            const webgpuRenderer = window.pryzmRenderer;
            if (webgpuRenderer?.shadowMap) {
                webgpuRenderer.shadowMap.enabled = enabling;
            }
        } catch { /* non-fatal — pryzmRenderer may not be initialised */ }

        // ── Sync castShadow/receiveShadow on ALL scene meshes (both directions) ──
        // The prior implementation only traversed meshes when ENABLING shadows,
        // never when DISABLING — leaving mesh.castShadow=true while the shadow
        // pass was supposedly off. We toggle both directions so GPU state stays
        // consistent. InstancedMesh is also covered (was excluded before).
        world.scene.three.traverse((obj) => {
            if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
                obj.castShadow    = enabling;
                obj.receiveShadow = enabling;
            }
        });

        if (enabling) {
            await shadowedScene.updateShadows();
        }

        // ── Batch-window guard ────────────────────────────────────────────────────
        // BatchCoordinator._setupBatch() stores window.__pryzmBatchShadowWasEnabled
        // so _reactivateShadows() can restore the renderer to the pre-batch state at
        // T+30s. If the user explicitly toggles shadows during a batch, update that
        // flag so the restore honours the user's actively chosen state.
        window.__pryzmBatchShadowWasEnabled = enabling;

        updateIfManualMode();
    };

    const updateSunDirection = async (x: number, y: number, z: number) => {
        const shadowedScene = world.scene as OBC.ShadowedScene;
        shadowedScene.config.directionalLight.position.set(x, y, z);
        await shadowedScene.updateShadows();
        updateIfManualMode();
    };

    const updateShadowIntensity = (intensity: number) => {
        const shadowedScene = world.scene as OBC.ShadowedScene;
        shadowedScene.config.directionalLight.intensity = intensity * 4;
        updateIfManualMode();
    };

    const toggleBimVisibility = (type: 'levels' | 'grids', visible: boolean) => {
        bimManager.toggleVisibility(type, visible);
        updateIfManualMode();
    };

    // ── Phase 2.2 — ViewPropertiesSection engine bridge ──────────────────────
    // These listeners let the inspector's View Properties panel (which has no
    // engine import) drive the Three.js scene by dispatching window CustomEvents.
    //
    // FIX: All six events now wired. Sun direction + intensity previously only
    // updated OBC's built-in directional light (unit-magnitude position).
    // PRYZM's RealSunService adds a separate DirectionalLight at ×120 scale —
    // we traverse the scene to update ALL DirectionalLights so both are covered.
    // AO, Bloom, Exposure had no listeners at all — added below.

    // F.events.14 — pryzm-set-sun-direction migrated from DOM CustomEvent to runtime.events.
    window.runtime?.events?.on('pryzm-set-sun-direction', async ({ x, y, z }: { x: number; y: number; z: number }) => {
        // OBC ShadowedScene light (uses unit magnitude internally)
        await updateSunDirection(x, y, z);
        // All scene DirectionalLights (including RealSunService's at ×120 scale)
        const LIGHT_DIST = 120;
        world.scene.three.traverse((obj: THREE.Object3D) => {
            if (obj instanceof THREE.DirectionalLight) {
                obj.position.set(x * LIGHT_DIST, y * LIGHT_DIST, z * LIGHT_DIST);
                obj.shadow?.camera.updateProjectionMatrix();
            }
        });
        updateIfManualMode();
    });

    // F.events.14 — pryzm-set-sun-intensity migrated from DOM CustomEvent to runtime.events.
    window.runtime?.events?.on('pryzm-set-sun-intensity', ({ intensity }: { intensity: number }) => {
        // OBC ShadowedScene light
        updateShadowIntensity(intensity);
        // All scene DirectionalLights (including RealSunService's)
        world.scene.three.traverse((obj: THREE.Object3D) => {
            if (obj instanceof THREE.DirectionalLight) {
                obj.intensity = intensity * 4;
            }
        });
        updateIfManualMode();
    });

    // F.events.14 — pryzm-toggle-shadows migrated from DOM CustomEvent to runtime.events.
    window.runtime?.events?.on('pryzm-toggle-shadows', async ({ enabled }: { enabled: boolean }) => {
        const shadowedScene = world.scene as OBC.ShadowedScene;
        if (shadowedScene.shadowsEnabled !== enabled) {
            // toggleShadows() handles: OBC shadowsEnabled, pryzmRenderer.shadowMap,
            // mesh castShadow/receiveShadow traversal, and __pryzmBatchShadowWasEnabled.
            await toggleShadows();
        }
        // ── Sync DirectionalLight.castShadow (per-light shadow depth-pass gate) ──
        // toggleShadows() covers mesh castShadow and the WebGPU renderer.
        // DirectionalLight.castShadow is the per-light gate for the shadow depth
        // pass and must also be synced to prevent the light from writing a shadow
        // map when the user has switched shadows off.
        world.scene.three.traverse((obj: THREE.Object3D) => {
            if (obj instanceof THREE.DirectionalLight) {
                obj.castShadow = enabled;
            }
        });
        updateIfManualMode();
    });

    // F.events.14 — pryzm-set-ao migrated from DOM CustomEvent to runtime.events.
    window.runtime?.events?.on('pryzm-set-ao', ({ enabled }: { enabled: boolean }) => {
        try {
            const postprod = (world.renderer as OBCF.PostproductionRenderer).postproduction;
            if (postprod?.aoPass) {
                postprod.aoPass.blendIntensity = enabled ? 0.6 : 0;
            }
        } catch { /* renderer may not be PostproductionRenderer */ }
        updateIfManualMode();
    });

    // F.events.14 — pryzm-set-bloom migrated from DOM CustomEvent to runtime.events.
    window.runtime?.events?.on('pryzm-set-bloom', ({ enabled }: { enabled: boolean }) => {
        try {
            if (enabled) {
                window.enableEnhancedBloom?.();
            } else {
                window.disableEnhancedBloom?.();
            }
        } catch { /* bloom service may not be initialised */ }
        updateIfManualMode();
    });

    // F.events.14 — pryzm-set-exposure migrated from DOM CustomEvent to runtime.events.
    window.runtime?.events?.on('pryzm-set-exposure', ({ exposure }: { exposure: number }) => {
        try {
            const threeRenderer = (world.renderer as OBCF.PostproductionRenderer).three;
            threeRenderer.toneMapping         = THREE.ACESFilmicToneMapping;
            threeRenderer.toneMappingExposure = exposure;
        } catch { /* ignore */ }
        updateIfManualMode();
    });

    // ── createMainLayout + DOM mount ──────────────────────────────────────────
    // Phase B.2 (S73-WIRE): `runtime` is the second positional arg (default null).
    // The legacy `initUI` boot path predates `composeRuntime()` (that comes in
    // Phase C), so we explicitly pass `null` here to make the wire visible and
    // keep the orchestrator backward-compatible.  When Phase C lands, this call
    // site is replaced by the composed-runtime boot in PlatformShell.
    const mainLayout = createMainLayout({
        components,
        world,
        grid,
        bimManager,
        wallTool,
        slabTool,
        toolManager,
        undoManager,
        selectionManager,
        inspector,
        viewpoints,
        views,
        viewpointsTable,
        viewsTable,
        zoomToAll: async () => { zoomToAll(); },
        createViewpoint: async () => { await createViewpoint(); },
        generatePlans,
        generateElevations,
        onCloseView,
        toggleShadows,
        updateShadowIntensity,
        updateSunDirection,
        toggleBimVisibility,
        applyVisualStyle,
        deleteSelected,
        addFurniture,
        toggleSection,
        container,
        navManager,
        gridToggleService,
        _viewController: viewController,
        projectContext,
        roofTool,
    }, null /* Phase B.2 (S73-WIRE): runtime — null in legacy boot path */);

    document.body.append(mainLayout);
    document.body.append(propertyPanel);

    // Phase 2.2 — show View Properties as the initial default inspector state.
    // Nothing is selected on startup, so display environment controls immediately.
    inspector.update(null);

    // ── Keyboard shortcut: R → roofTool rectangle mode ───────────────────────
    // Per PRYZM_ROOF_SYSTEM_STATUS_2026-03-31 §6 STEP 7
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'r' && e.key !== 'R') return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (roofTool) {
            console.log('[EngineBootstrap] Shortcut R → enterRectangleMode');
            roofTool.enterRectangleMode();
        }
    });

    // ── Keyboard shortcut: Escape → cancel / deactivate active tool ──────────
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        console.log('[EngineBootstrap] Shortcut Escape → deactivateAll');
        toolManager.deactivateAll();
        // Always clear selection on Escape so the WallTransform gizmo detaches
        // even when no tool is active (e.g., user has a wall selected but no tool
        // running). Without this, the gizmo stays attached and TransformControls
        // intercepts left-click-drag, blocking camera orbit.
        unselectAll();
    });

    // ── Keyboard shortcut: P → RoomTool POINT_PICK mode ─────────────────────
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'p' && e.key !== 'P') return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        console.log('[EngineBootstrap] Shortcut P → activateRoomPointPick');
        toolManager.activateRoomPointPick();
    });

    const executeSelectedVisibilityShortcut = (kind: 'hide' | 'isolate' | 'ghost'): boolean => {
        const selected = selectionManager?.selectedObject;
        const elementId = selected?.userData?.id as string | undefined;
        const activeViewId = (viewDefinitionStore as any).getActiveId?.() ?? viewController?.currentViewDefinitionId;
        if (!elementId || !activeViewId) return false;
        if (kind === 'hide') {
            // [F-1.3] Bus-primary: commandManager exfiltrated to HideElementInViewHandler (plugins/view).
            window.runtime?.bus?.executeCommand('element.hideInView', { viewId: activeViewId, elementId, source: 'HUMAN_DIRECT' })
                .catch((e: Error) => console.error('[executeSelectedVisibilityShortcut] element.hideInView failed:', e));
        } else if (kind === 'isolate') {
            // [F-1.3] Bus-primary: commandManager exfiltrated to IsolateElementInViewHandler (plugins/view).
            window.runtime?.bus?.executeCommand('element.isolateInView', { viewId: activeViewId, elementId, source: 'HUMAN_DIRECT' })
                .catch((e: Error) => console.error('[executeSelectedVisibilityShortcut] element.isolateInView failed:', e));
        } else {
            // [F-1.3] Bus-primary: commandManager exfiltrated to SetElementGraphicOverrideHandler (plugins/view).
            window.runtime?.bus?.executeCommand('element.setGraphicOverride', {
                viewId: activeViewId, scope: 'element', elementId, category: 'projection',
                overrides: { visible: true, line: { opacity: 0.35 }, fill: { opacity: 0.15 }, ghostStyle: 'fade', ghostOpacity: 0.25 },
                source: 'HUMAN_DIRECT',
            }).catch((e: Error) => console.error('[executeSelectedVisibilityShortcut] element.setGraphicOverride failed:', e));
        }
        return true;
    };

    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const key = e.key.toLowerCase();
        if (key !== 'h' && key !== 'i' && key !== 'g') return;
        const kind = key === 'h' ? 'hide' : key === 'i' ? 'isolate' : 'ghost';
        if (executeSelectedVisibilityShortcut(kind)) {
            e.preventDefault();
            console.log(`[EngineBootstrap] Shortcut ${e.key.toUpperCase()} → ${kind} selected element in view`);
        }
    });

    // ── Wave 36 U-1: ring-buffer store map builder ────────────────────────────
    // Maps the affectedStores keys declared by each CommandHandler to the L1
    // store instances registered on window.*. Keys cover both singular and
    // plural spellings to match whichever convention a handler uses.
    // CONTRACT (C03 §4.1): never throws — applyRingBufferSide silently skips
    // any store key absent from this map.
    // ISSUE-02 (OI-035): Added 10 previously-missing element-type stores so that
    // future CommandBus-native commands for these types can reach Ctrl+Z correctly.
    function _buildRingBufferStoreMap(): Record<string, { applyPatch: (p: unknown[]) => void } | undefined> {
        return {
            wall:           window.wallStore, // TODO(TASK-08)
            walls:          window.wallStore, // TODO(TASK-08)
            slab:           window.slabStore, // TODO(TASK-08)
            slabs:          window.slabStore, // TODO(TASK-08)
            room:           window.roomStore, // TODO(TASK-08)
            rooms:          window.roomStore, // TODO(TASK-08)
            'curtain-wall': window.curtainWallStore, // TODO(TASK-08)
            curtainWalls:   window.curtainWallStore, // TODO(TASK-08)
            door:           window.doorStore, // TODO(TASK-08)
            doors:          window.doorStore, // TODO(TASK-08)
            window:         window.windowStore, // TODO(TASK-08)
            windows:        window.windowStore, // TODO(TASK-08)
            furniture:      window.furnitureStore, // TODO(TASK-08)
            level:          window.levelStore, // TODO(TASK-08)
            levels:         window.levelStore, // TODO(TASK-08)
            // OI-035: previously missing — added now
            column:         (window as any).columnStore, // TODO(TASK-08)
            columns:        (window as any).columnStore, // TODO(TASK-08)
            beam:           (window as any).beamStore, // TODO(TASK-08)
            beams:          (window as any).beamStore, // TODO(TASK-08)
            stair:          (window as any).stairStore, // TODO(TASK-08)
            stairs:         (window as any).stairStore, // TODO(TASK-08)
            stairRailing:   (window as any).stairRailingStore, // TODO(TASK-08)
            stairLanding:   (window as any).stairLandingStore, // TODO(TASK-08)
            handrail:       (window as any).handrailStore, // TODO(TASK-08)
            handrails:      (window as any).handrailStore, // TODO(TASK-08)
            roof:           (window as any).roofStore, // TODO(TASK-08)
            roofs:          (window as any).roofStore, // TODO(TASK-08)
            floor:          (window as any).floorStore, // TODO(TASK-08)
            floors:         (window as any).floorStore, // TODO(TASK-08)
            ceiling:        (window as any).ceilingStore, // TODO(TASK-08)
            ceilings:       (window as any).ceilingStore, // TODO(TASK-08)
            plumbing:       (window as any).plumbingStore, // TODO(TASK-08)
        };
    }

    // ── Keyboard shortcut: Ctrl+Z / Cmd+Z → Undo ─────────────────────────────
    // CONTRACT Phase 7 — platform-wide undo/redo/delete keyboard shortcuts
    // Wave 36 U-1 (Phase D Ctrl-Z): prefer ring-buffer path (O(1), no LONGTASK)
    // over commandManager.undo() (80 ms blocking snapshot replay).
    // Access pattern: window.runtime?.bus?.ringBuffer is the CommandBus-attached
    // RingBufferUndoStack (composeRuntime.ts:642-643, Sprint A31).
    // undoPatch() atomically returns the inverse PatchSide AND steps cursor back;
    // current() is called BEFORE undoPatch() to capture affectedStores from the
    // entry that is about to be undone (cursor points to it pre-decrement).
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (!((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z')) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        console.log('[EngineBootstrap] Shortcut Ctrl+Z → undo');

        const rb = window.runtime?.bus?.ringBuffer;
        if (rb?.canUndo()) {
            const currentPair = rb.current();       // capture affectedStores BEFORE cursor moves
            // ISSUE-01 (OI-034): If the ring-buffer entry has empty affectedStores the
            // entry was produced by a legacy-bridge handler (e.g. DeleteElementHandler,
            // Move handlers) that stores its real undo state in CommandManager.history[].
            // Applying an empty patch set is a no-op, so we fall through to the
            // commandManager fallback instead of consuming a ring-buffer cursor slot.
            const hasRealPatches = (currentPair?.affectedStores?.length ?? 0) > 0;
            if (hasRealPatches) {
                const inverseSide = rb.undoPatch();     // step cursor back + return inverse PatchSide
                if (inverseSide && currentPair) {
                    import('@pryzm/command-bus').then(({ applyRingBufferSide }) => {
                        // Wave 36 U-4: OTel span on ring-buffer undo path (C10 §2).
                        const tracer = trace.getTracer('pryzm-engine');
                        tracer.startActiveSpan('pryzm.undo.apply', (span) => {
                            try {
                                span.setAttribute('pryzm.undo.affectedStores', (currentPair.affectedStores ?? []).join(','));
                                span.setAttribute('pryzm.undo.side', 'inverse');
                                applyRingBufferSide(
                                    inverseSide,
                                    currentPair.affectedStores ?? [],
                                    _buildRingBufferStoreMap(),
                                );
                                console.log('[Undo] ring-buffer undo applied — stores:', currentPair.affectedStores);
                                span.end();
                            } catch (err) {
                                span.recordException(err as Error);
                                span.setStatus({ code: SpanStatusCode.ERROR });
                                span.end();
                            }
                        });
                    }).catch((err: unknown) => {
                        console.error('[Undo] ring-buffer undo failed:', err);
                    });
                    return;
                }
            }
            // OI-034 fallback: ring-buffer entry has empty patches — delegate to
            // legacy CommandManager which holds the real undo state for this operation.
            console.log('[Undo] ring-buffer entry has empty affectedStores — delegating to legacy undo stack');
        }
        // Fallback: ring buffer unavailable, empty, or entry has no patches — use legacy stack.
        if (commandManager?.canUndo?.()) {
            commandManager.undo(); // TODO(Wave36) — remove when E.5.x migration routes all commands through bus
            console.log('[Undo] legacy undo executed (ring-buffer fallback path — Wave36 pending)');
        } else {
            console.log('[Undo] ring-buffer empty or unavailable — undo skipped');
        }
    });

    // ── Keyboard shortcut: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y → Redo ────────
    // Wave 36 U-1 (Phase D Ctrl-Y): mirror of Ctrl-Z using redoPatch().
    // redoPatch() reads _entries[_cursor + 1].forward THEN increments cursor,
    // so current() called AFTER redoPatch() correctly reflects the just-redone entry.
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        const isRedoZ = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z';
        const isRedoZ2 = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z';
        const isRedoY  = (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'y' || e.key === 'Y');
        if (!(isRedoZ || isRedoZ2 || isRedoY)) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        console.log('[EngineBootstrap] Shortcut Ctrl+Shift+Z / Ctrl+Y → redo');

        const rb = window.runtime?.bus?.ringBuffer;
        if (rb?.canRedo()) {
            // OI-034 mirror: peek at the NEXT entry's affectedStores before consuming it.
            // redoPatch() steps the cursor forward, so we must peek before calling it.
            const nextPair = rb.peekRedo?.() ?? rb.current();
            const hasRealPatches = (nextPair?.affectedStores?.length ?? 0) > 0;
            if (hasRealPatches) {
                const forwardSide = rb.redoPatch();     // step cursor forward + return forward PatchSide
                const currentPair = rb.current();       // cursor now at just-redone entry
                if (forwardSide && currentPair) {
                    import('@pryzm/command-bus').then(({ applyRingBufferSide }) => {
                        // Wave 36 U-4: OTel span on ring-buffer redo path (C10 §2).
                        const tracer = trace.getTracer('pryzm-engine');
                        tracer.startActiveSpan('pryzm.undo.apply', (span) => {
                            try {
                                span.setAttribute('pryzm.undo.affectedStores', (currentPair.affectedStores ?? []).join(','));
                                span.setAttribute('pryzm.undo.side', 'forward');
                                applyRingBufferSide(
                                    forwardSide,
                                    currentPair.affectedStores ?? [],
                                    _buildRingBufferStoreMap(),
                                );
                                console.log('[Undo] ring-buffer redo applied — stores:', currentPair.affectedStores);
                                span.end();
                            } catch (err) {
                                span.recordException(err as Error);
                                span.setStatus({ code: SpanStatusCode.ERROR });
                                span.end();
                            }
                        });
                    }).catch((err: unknown) => {
                        console.error('[Undo] ring-buffer redo failed:', err);
                    });
                    return;
                }
            }
            // OI-034 fallback: next ring-buffer entry has empty patches — delegate to
            // legacy CommandManager which holds the real redo state for this operation.
            console.log('[Redo] ring-buffer entry has empty affectedStores — falling back to commandManager.redo()');
        }
        // Fallback: ring buffer unavailable, empty, or entry has no patches — use legacy stack.
        if (commandManager?.canRedo?.()) {
            commandManager.redo();
            console.log('[Redo] commandManager.redo() executed (legacy fallback)');
        } else {
            console.log('[Redo] ring-buffer empty or unavailable — redo skipped');
        }
    });

    // ── Keyboard shortcut: Delete / Backspace → delete selected element ───────
    // §T-B2 (DAILY-USE-AUDIT 2026-05-20) — three reinforced guards:
    //   1. PlanViewToolOverlay / SvpPlanToolOverlay now call e.preventDefault() +
    //      e.stopPropagation() when their active handler consumes the key (e.g.
    //      Backspace pops a polyline vertex). This listener runs AFTER those
    //      overlays during the bubbling phase, so a consumed event never reaches
    //      `deleteSelected()`.
    //   2. We additionally check for contenteditable / select / role=textbox so
    //      typing Backspace inside a property-panel custom widget or sheet-editor
    //      annotation text doesn't trigger element deletion.
    //   3. If any tool is in DRAWING state, suppress deletion as a belt-and-braces
    //      guard in case the overlay-consume mechanism is bypassed.
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        // Defended by overlay preventDefault — but check defaultPrevented just in case.
        if (e.defaultPrevented) return;
        const t = e.target;
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
        if (t instanceof HTMLElement) {
            if (t.isContentEditable) return;
            if (t.matches?.('[contenteditable="true"], [role="textbox"], [role="combobox"]')) return;
            // Custom widgets sometimes self-identify via data-attr.
            if (t.closest?.('[data-pryzm-input], [data-text-edit]')) return;
        }
        // Suppress if a drawing tool is mid-stroke (belt-and-braces beyond the
        // overlay's preventDefault — if a future tool forgets to return true,
        // this still protects the user's selection).
        const toolState = (window as { toolManager?: { getToolState?: () => string } }).toolManager?.getToolState?.();
        if (toolState === 'DRAWING' || toolState === 'drawing') return;
        e.preventDefault();
        console.log('[EngineBootstrap] Shortcut Delete → deleteSelected');
        deleteSelected();
    });

    // ── Keyboard shortcut: ? → toggle keyboard-shortcut cheat sheet ──────────
    // Owns its own '?' / Escape listener; safe to install once at bootstrap.
    // B.13-SC: runtime threaded for Phase C consumption (currently void-stubbed).
    installShortcutCheatSheet(runtime ?? null);
    console.log('[initUI] ShortcutCheatSheet installed (press ? to view all shortcuts)');

    // ── Contract 25b Wave 2 — Ctrl+Shift+G handler retired ─────────────────────
    // Previously opened the legacy VGGovernancePanel. All authoring is now routed
    // through Ctrl+Shift+I (Visibility Intent Panel) and the per-view V/G header
    // button (OverridePanel) — both already registered below.

    // ── Keyboard shortcut: Ctrl+Shift+I → owner-only Visibility Intent Panel ──
    // Opens the VisibilityIntentPanel (Contract 25 full intent rules editor)
    // when the signed-in user has plan === 'owner'.
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (!e.ctrlKey || !e.shiftKey || e.key !== 'I') return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        try {
            const raw  = localStorage.getItem('bim-platform-user');
            const plan = raw ? (JSON.parse(raw) as { plan?: string }).plan : undefined;
            if (plan !== 'owner') return;
        } catch { return; }
        e.preventDefault();
        console.log('[EngineBootstrap] Ctrl+Shift+I → owner Visibility Intent Panel');
        const intentPanel = window.visibilityIntentPanel;
        if (intentPanel && typeof intentPanel.open === 'function') { intentPanel.open(); }
        else { console.warn('[EngineBootstrap] visibilityIntentPanel not ready'); }
    });

    // ── Split View Toggle Button ──────────────────────────────────────────────
    // Mounts a fixed button in the lower-left area of the canvas so the user can
    // activate / deactivate the 3D + Floor Plan split view at any time.
    // CONTRACT §05 §6: plain <button> — zero bim-* elements.
    // CONTRACT §05 §2: styling via svp-toggle-btn class (AppTheme.ts).
    {
        const svpBtn = document.createElement('button');
        svpBtn.id        = 'svp-toggle-button';
        svpBtn.className = 'svp-toggle-btn';
        svpBtn.title     = 'Toggle Split View (3D + Floor Plan)';
        svpBtn.setAttribute('aria-label', 'Toggle split view');
        svpBtn.style.cssText = [
            'position:fixed',
            'bottom:52px',
            'left:62px',
            'z-index:20',
            'pointer-events:auto',
        ].join(';');

        // Split-pane icon (two vertical panels)
        svpBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="1"  y="1" width="5.5" height="14" rx="1" fill="currentColor" opacity="0.55"/>
            <rect x="9.5" y="1" width="5.5" height="14" rx="1" fill="currentColor" opacity="0.9"/>
            <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1"/>
        </svg>`;

        const syncBtnState = () => {
            const svm = window.splitViewManager;
            const active = svm?.isActive ?? false;
            svpBtn.classList.toggle('svp-toggle-btn--active', active);
            svpBtn.title = active
                ? 'Close Split View'
                : 'Split View — 3D + Floor Plan';
        };

        svpBtn.addEventListener('click', () => {
            const svm = window.splitViewManager;
            if (!svm) {
                console.warn('[SplitView] splitViewManager not yet ready');
                return;
            }
            svm.toggle();
            syncBtnState();
        });

        // Keep button state in sync — F.events.7: migrated to runtime.events typed bus.
        window.runtime?.events?.on('split-view-activated',   syncBtnState);
        window.runtime?.events?.on('split-view-deactivated', syncBtnState);

        document.body.appendChild(svpBtn);
        console.log('[initUI] Split View toggle button mounted');
    }
}
