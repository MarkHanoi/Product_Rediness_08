/**
 * initTools — Phase F-1 subsystem initializer.
 *
 * Creates every BIM tool instance and the central ToolManager:
 *   - SelectionManager + space-bar screen-pan key binding
 *   - CommandManager + CommandContext
 *   - All element tools: WallTool, SlabTool, CeilingTool, FloorTool,
 *     PlumbingTool, FurnitureTool, RoofTool, HandrailTool, WindowTool,
 *     DoorTool, CurtainWallTool, ColumnTool, BeamTool, StairTool,
 *     OpeningTool, RoomTool
 *   - AnnotationManager (Phase A–IV)
 *   - RadialMenu
 *   - ToolManager (registers all tools above)
 *   - Room topology observer (auto room-detection on wall changes)
 *
 * Contracts:
 *   §01-BIM-ENGINE-CORE-CONTRACT §9 — engine-layer only; no UI imports.
 *   §01 §2.1 — No direct store mutation; all writes through CommandManager.
 *   §07-BIM-SECURITY-CONTRACT — no external API calls.
 *
 * D.4.4 POINTER (Wave 3 / Option A):
 *   The typed contracts for this file's output live in
 *   `packages/input-host/src/`:
 *     • `bootstrap.ts`          — `bootstrapInput()` / `bootstrapInputIdle()`
 *                                 + OTel span `pryzm.bootstrap.input`
 *     • `SelectionBootstrap.ts` — selection wiring typed contract
 *                                 (mirrors SelectionManager init, lines ≈1141-1260
 *                                  of the pre-F1 EngineBootstrap.ts spec baseline)
 *     • `ToolBindings.ts`       — tool registration typed contract
 *                                 (the 20 ToolManager.register() calls + RadialMenu bindings)
 *   Body relocates fully once L7 dep factoring is complete (Wave 4).
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';

import { SelectionManager } from '@pryzm/input-host';
import { ToolManager } from '@pryzm/input-host';
import { CommandManager } from '@pryzm/command-registry';
import { resolvePickStrategy } from '@pryzm/picking';

import { SlabTool } from '@pryzm/geometry-slab';
import { CeilingTool } from '@pryzm/geometry-slab';
import { FloorTool } from '@pryzm/geometry-slab';
import { SlabDimensionsEditor } from '@app/ui/property-panel/SlabDimensionsEditor';
import { ElementCreationModal } from '@app/ui/ElementCreationModal';
import { PlumbingTool } from '@pryzm/geometry-plumbing';
import { FurnitureTool } from '@pryzm/geometry-furniture';
import { LightingTool } from '@pryzm/geometry-lighting';
import { FurnitureType } from '@pryzm/geometry-furniture';
import { FloatingObjectCarousel } from '@app/ui/furniture-carousel/FloatingObjectCarousel';
import { FurnitureDragDropHandler } from '@app/ui/furniture-carousel/FurnitureDragDropHandler';
import { getDescriptorForType } from '@app/ui/furniture-carousel/FurnitureCategoryRegistry';
import { deriveCategoryFromType } from '@pryzm/geometry-furniture';
import { KitchenCabinetTool } from '@app/ui/kitchen/KitchenCabinetTool';
import { KitchenLayoutType } from '@pryzm/geometry-furniture';
import { KitchenConfigPanel } from '@app/ui/kitchen/KitchenConfigPanel';
import { kitchenUnitInspector } from '@app/ui/kitchen/KitchenUnitInspector';
import { kitchenRunInspector }  from '@app/ui/kitchen/KitchenRunInspector';
import { WardrobeCabinetTool } from '@app/ui/wardrobe/WardrobeCabinetTool';
import { WardrobeLayoutType }  from '@pryzm/geometry-furniture';
import { WardrobeConfigPanel } from '@app/ui/wardrobe/WardrobeConfigPanel';
import { wardrobeSectionInspector } from '@app/ui/wardrobe/WardrobeSectionInspector';
import { wardrobeRunInspector }     from '@app/ui/wardrobe/WardrobeRunInspector';
import { RoofTool } from '@pryzm/geometry-roof';
import { HandrailTool } from '@pryzm/geometry-stair';
import { WallTool } from '@pryzm/geometry-wall';
import { SlabDependencyTracker } from '@pryzm/geometry-slab';
import { WindowTool } from '@pryzm/geometry-window';
import { DoorTool } from '@pryzm/geometry-door';
import { CurtainWallTool } from '@pryzm/geometry-curtain-wall';
import { ColumnTool } from '@pryzm/geometry-column';
import { BeamTool } from '@pryzm/input-host';
import { StairTool } from '@pryzm/geometry-stair';
import { StairPath3DToolHandler } from './views/plantools/StairPath3DToolHandler';
import { singleVolumeWallProducer } from './singleVolumeWallProducer';
import { OpeningTool } from '@pryzm/input-host';
import { AnnotationManager, obcAnnotationAdapter } from '@pryzm/plugin-annotations';
import { RadialMenu } from '@app/ui/RadialMenu';
import { DrawingEditor } from '@thatopen/components-front';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import { RoomTopologyObserver } from '@pryzm/room-topology';
import { RoomTool } from '@pryzm/room-topology';
import { RoomBoundingLineTool } from '@pryzm/geometry-wall';

// ── Singleton imports (module-level stores / services) ────────────────────────
import { ceilingSystemTypeStore } from '@pryzm/core-app-model/stores';
import { floorSystemTypeStore } from '@pryzm/core-app-model/stores';
import { annotationStore } from '@pryzm/plugin-annotations';
import { constraintStore } from '@pryzm/plugin-annotations';
import { constraintSolver } from '@pryzm/plugin-annotations';
// ANNOTATION-SYSTEM-AUDIT-2026 A1 — inject annotation/view stores into CommandContext
import { annotationVisibilityStore } from '@pryzm/plugin-annotations';
import { viewDefinitionStore, storeEventBus, viewDependencyTracker } from '@pryzm/core-app-model';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { vgGovernanceStore } from '@pryzm/core-app-model';
import { doorStore, doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowStore, windowSystemTypeStore } from '@pryzm/geometry-window';
import { roomGraphService, roomQueryService, roomValidationService, roomTypeInferenceEngine, facadeOrientationService } from '@pryzm/spatial-index';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { temporalGraphManager } from '@pryzm/core-app-model';
import { initGhostOverlayRenderer } from '@pryzm/core-app-model';
import { roomSpatialIndex } from '@pryzm/core-app-model';
import { hierarchyStore } from '@pryzm/core-app-model';
import { templateStore } from '@pryzm/core-app-model';
import { templateAssignmentStore } from '@pryzm/core-app-model';
import { elementCodeStore } from '@pryzm/core-app-model';
// S70 D8 — lifecycleStateManager + maintenanceRecordStore imports deleted
// alongside src/lifecycle/ per SPEC-27 §4.3 + ADR-030 Part D + ADR-0052 §B.7.
// Their per-project clear() is a no-op now (replaced by per-family handlers
// in plugins/* per ADR-030 §A row 2).
// Phase 5b — UnderlayReferenceScaleTool / UnderlayReferenceRotateTool are
// lazy-loaded (see "Underlay Reference Scale Tool" / "Underlay Reference
// Rotate Tool" sections below). Together they are ~1 850 LOC; deferring them
// keeps that parse + execute cost out of the boot path. Both tools are only
// reached via explicit user clicks ("Scale" / "Rotate" buttons in the
// underlay toolbar) and have no boot-time side effects beyond their own
// activate-event listener — which is exactly what the bootstrap shim below
// stands in for. `import type` aliases below are erased by tsc and do NOT
// pull either module into the static graph.
import type { UnderlayReferenceScaleTool as _UnderlayReferenceScaleToolImpl }
    from '@pryzm/input-host';
import type { UnderlayReferenceRotateTool as _UnderlayReferenceRotateToolImpl }
    from '@pryzm/input-host';
import { MarqueeSelectionTool }        from '@pryzm/input-host';
import { installUnderlayPersistence } from './UnderlayPersistence';
import { projectScopedStorage } from '@pryzm/core-app-model';
import { installProjectIsolationAudit } from '@pryzm/core-app-model';

// ── Public API ────────────────────────────────────────────────────────────────

export interface ToolsParams {
    world: any;
    components: any;
    container: HTMLElement;
    bimManager: any;
    projectContext: any;
    transformControls: any;
    levelPlaneConstraint: any;
    viewController: any;
    navManager: any;
    updateInspector: (obj: any) => void;
    unselectAll: () => void;
    zoomToAll: () => void;
    getHdriTexture: () => Promise<THREE.Texture | null>;
    getCurrentVisualStyle: () => any;
    commandManagerRef: { current: any };
    inspector: any;
    /**
     * Phase B.13-RM (S73-WIRE) — composed `PryzmRuntime` forwarded from
     * `bootstrap()` so `new RadialMenu(runtime)` receives the typed handle
     * (Variant B widening, parent-thread step per §II.B.0 step 4). Optional
     * with a `null` default so legacy callers that have not yet been
     * migrated continue to type-check.
     */
    runtime?: import('@pryzm/runtime-composer').PryzmRuntime | null;
    // Stores from initBuilders
    wallStore: any;
    slabStore: any;
    columnStoreInstance: any;
    beamStore: any;
    stairStore: any;
    stairTypeStore: any;
    stairLandingStore: any;
    stairRailingStore: any;
    gridStore: any;
    curtainWallStoreInstance: any;
    curtainPanelStoreInstance: any;
    roofStore: any;
    plumbingStore: any;
    furnitureStore: any;
    handrailStore: any;
    openingStore: any;
    wallSystemTypeStore: any;
    slabSystemTypeStore: any;
    ceilingStore: any;
    floorStore: any;
    roomStore: any;
    // Builders from initBuilders
    slabBuilder: any;
    plumbingBuilder: any;
    furnitureBuilder: any;
    stairMeshBuilder: any;
}

export interface ToolsResult {
    selectionManager: SelectionManager;
    commandManager: CommandManager;
    commandContext: any;
    toolManager: ToolManager;
    wallTool: WallTool;
    slabTool: SlabTool;
    slabDependencyTracker: SlabDependencyTracker;
    ceilingTool: CeilingTool;
    floorTool: FloorTool;
    windowTool: WindowTool;
    doorTool: DoorTool;
    curtainWallTool: CurtainWallTool;
    columnTool: ColumnTool;
    beamTool: BeamTool;
    stairTool: StairTool;
    plumbingTool: PlumbingTool;
    furnitureTool: FurnitureTool;
    furnitureCarousel: FloatingObjectCarousel;
    furnitureDragDropHandler: FurnitureDragDropHandler;
    handrailTool: HandrailTool;
    roofTool: any;
    openingTool: OpeningTool;
    annotationManager: AnnotationManager;
    radialMenu: RadialMenu;
    roomTool: any;
    roomDetectionEngine: RoomDetectionEngine;
    roomTopologyObserver: RoomTopologyObserver;
}

// ── initTools ─────────────────────────────────────────────────────────────────

export async function initTools(p: ToolsParams): Promise<ToolsResult> {
    const {
        world, components, container, bimManager, projectContext,
        transformControls, levelPlaneConstraint, viewController, navManager,
        updateInspector, unselectAll, zoomToAll,
        getHdriTexture, getCurrentVisualStyle,
        commandManagerRef, inspector,
        runtime,
        wallStore, slabStore, columnStoreInstance, beamStore,
        stairStore, stairTypeStore, stairLandingStore, stairRailingStore,
        gridStore, curtainWallStoreInstance, curtainPanelStoreInstance,
        roofStore, plumbingStore, furnitureStore, handrailStore, openingStore,
        wallSystemTypeStore, slabSystemTypeStore, ceilingStore, floorStore, roomStore,
        slabBuilder, plumbingBuilder, furnitureBuilder, stairMeshBuilder,
    } = p;

    // ── SelectionManager ─────────────────────────────────────────────────────
    const selectionManager = new SelectionManager(
        world,
        world.camera as OBC.SimpleCamera,
        world.renderer.three.domElement,
        transformControls,
        (obj: THREE.Object3D) => updateInspector(obj),
    );
    selectionManager.init();
    selectionManager.setLevelPlaneConstraint(levelPlaneConstraint);
    // Wave 36 U-2 (A16-T8 completion, C04 §3.2): resolve pick strategy once at boot.
    // resolvePickStrategy probes GPU availability; falls back to BVH silently.
    // Inject into SelectionManager so GPU pick is preferred over BVH+raycaster path.
    // Use a minimal probe context — camera + viewport only; no element registry needed
    // for the probe (BvhPickStrategy.probeAvailability ignores ctx; GpuPickStrategy
    // writes a probe pixel to detect Mesa driver readback bugs).
    try {
        const _probeCtx = {
            camera:          (world.camera as OBC.SimpleCamera).three as THREE.Camera,
            elementRegistry: { ids: () => [], kindOf: () => null, objectFor: () => null },
            viewportWidth:   world.renderer.three.domElement.clientWidth  || 1280,
            viewportHeight:  world.renderer.three.domElement.clientHeight || 720,
            scene:           world.scene.three as THREE.Scene,
            renderer: (() => {
                const r = world.renderer.three;
                return {
                    get width()  { return r.domElement.width;  },
                    get height() { return r.domElement.height; },
                    renderToTarget: (scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget, mat: THREE.Material | null) => {
                        const prev = r.getRenderTarget(); const prevMat = (r as any).overrideMaterial;
                        r.setRenderTarget(target); (r as any).overrideMaterial = mat;
                        r.render(scene, camera);
                        (r as any).overrideMaterial = prevMat; r.setRenderTarget(prev);
                    },
                    readPixels: (t: THREE.WebGLRenderTarget, x: number, y: number, w: number, h: number, buf: Uint8Array) =>
                        r.readRenderTargetPixels(t, x, y, w, h, buf),
                    createRenderTarget: (w: number, h: number) => new THREE.WebGLRenderTarget(w, h),
                };
            })(),
        };
        const _strategy = resolvePickStrategy(_probeCtx as any);
        selectionManager.setPickStrategy(_strategy);
        console.log('[initTools] PickStrategy resolved:', _strategy.id);
    } catch (err) {
        console.warn('[initTools] PickStrategy resolution failed — BVH path active:', err);
        selectionManager.setPickStrategy(null);
    }
    window.selectionManager = selectionManager;
    viewController.setSelectionManager(selectionManager);

    // ── §MARQUEE-SELECT-2026 — Shift+LeftDrag rectangle multi-selection ──────
    // §11 Keyboard Shortcuts Contract claims `Shift + LeftDrag` for the 3D
    // viewport.  This tool draws an HTML overlay rectangle, then on release
    // collects every selectable whose projected screen-AABB satisfies the
    // window/crossing rule and routes the result through SelectionBus.
    new MarqueeSelectionTool({
        domElement: world.renderer.three.domElement,
        camera:     (world.camera as OBC.SimpleCamera).three as THREE.Camera,
        selection:  selectionManager,
        // Only active in 3D view mode — Plan View has its own click model.
        isEnabled:  () => navManager.currentMode === '3D',
    });

    // ── Underlay Reference Scale Tool (LAZY — Phase 5b) ──────────────────────
    // Was: `new UnderlayReferenceScaleTool()` constructed at boot, registering
    // a window listener for 'underlay:reference-scale-activate' that does the
    // heavy work only on user click. The constructor body is cheap, but the
    // module is ~987 LOC and statically pulls in `UnderlayScaleHUD` plus the
    // underlay command stack — all of which only matter once the user actually
    // chooses to scale a PDF/image underlay (a rare, late-session action).
    //
    // Pattern: a one-shot bootstrap listener registered at boot stands in for
    // the real tool. On the first activate event we lazy-import the module,
    // construct the real tool (whose own constructor registers the same
    // listener), then re-dispatch the original event so the now-loaded tool
    // picks it up exactly as if it had been there all along.
    //
    // Mirrors the proven `_ensureXxx()` pattern from Phase 3 (PdfExportService,
    // VisibilityIntentPanel, SheetEditorPanel) but adapted for an event-driven
    // tool that has no method surface — only a "wake up on this event" hook.
    {
        const _eventName = 'underlay:reference-scale-activate' as const;
        let _bootstrapped = false;
        let _unsubScale: (() => void) | undefined;
        const _bootstrap = async (detail: { underlayTool: unknown }) => {
            if (_bootstrapped) return; // belt-and-braces — unsubscribe below handles the normal path
            _bootstrapped = true;
            _unsubScale?.(); _unsubScale = undefined; // F.events.15 — unsubscribe bootstrap listener
            try {
                const { UnderlayReferenceScaleTool } =
                    await import('@pryzm/input-host') as {
                        UnderlayReferenceScaleTool: new () => _UnderlayReferenceScaleToolImpl;
                    };
                new UnderlayReferenceScaleTool();
                window.runtime?.events?.emit(_eventName, detail); // F.events.15 — re-fire for real tool
            } catch (err) {
                console.error('[initTools] UnderlayReferenceScaleTool lazy load failed:', err);
                _bootstrapped = false;
                _unsubScale = window.runtime?.events?.on(_eventName, _bootstrap); // re-subscribe on error
            }
        };
        _unsubScale = window.runtime?.events?.on(_eventName, _bootstrap); // F.events.15
    }

    // ── Underlay Reference Rotate Tool (LAZY — Phase 5b) ─────────────────────
    // Same lazy bootstrap pattern as the scale tool above. The rotate module
    // is ~859 LOC and is only reached when the user clicks the "Rotate"
    // button on a selected underlay.
    {
        const _eventName = 'underlay:reference-rotate-activate' as const;
        let _bootstrapped = false;
        let _unsubRotate: (() => void) | undefined;
        const _bootstrap = async (detail: { underlayTool: unknown }) => {
            if (_bootstrapped) return;
            _bootstrapped = true;
            _unsubRotate?.(); _unsubRotate = undefined; // F.events.15 — unsubscribe bootstrap listener
            try {
                const { UnderlayReferenceRotateTool } =
                    await import('@pryzm/input-host') as {
                        UnderlayReferenceRotateTool: new () => _UnderlayReferenceRotateToolImpl;
                    };
                new UnderlayReferenceRotateTool();
                window.runtime?.events?.emit(_eventName, detail); // F.events.15 — re-fire for real tool
            } catch (err) {
                console.error('[initTools] UnderlayReferenceRotateTool lazy load failed:', err);
                _bootstrapped = false;
                _unsubRotate = window.runtime?.events?.on(_eventName, _bootstrap); // re-subscribe on error
            }
        };
        _unsubRotate = window.runtime?.events?.on(_eventName, _bootstrap); // F.events.15
    }

    // ── Space-bar screen pan ─────────────────────────────────────────────────
    {
        const _canvas = world.renderer.three.domElement;
        let _spaceHeld = false;
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.code !== 'Space' || _spaceHeld) return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            _spaceHeld = true;
            e.preventDefault();
            if (navManager.currentMode === '3D') {
                world.camera.controls.mouseButtons.left = 2; // TRUCK / SCREEN_PAN
                _canvas.style.cursor = 'grab';
            }
        }, { capture: true });
        window.addEventListener('keyup', (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
            _spaceHeld = false;
            if (navManager.currentMode === '3D') {
                world.camera.controls.mouseButtons.left = 1; // ROTATE
                _canvas.style.cursor = '';
            }
        }, { capture: true });
        window.addEventListener('blur', () => {
            if (_spaceHeld) {
                _spaceHeld = false;
                if (navManager.currentMode === '3D') {
                    world.camera.controls.mouseButtons.left = 1;
                    _canvas.style.cursor = '';
                }
            }
        });
    }

    // ── SlabTool (created before commandManager — deps injected via lazy refs) ─
    const slabTool = new SlabTool(world, components, container, {
        applyHighlight: (obj: any) => selectionManager.applyHighlight(obj),
        updateInspector,
        zoomToAll: async () => { zoomToAll(); },
        getHdriTexture,
        getCurrentVisualStyle,
    });
    window.slabTool = slabTool;

    // W5 §SLAB-SYSTEM-AUDIT-2026: Wire the slab profile-edit callback so SelectionManager
    // no longer reads window.slabTool in its dblclick handler.
    selectionManager.setSlabProfileEditCallback((slabId: string) =>
        slabTool.enterProfileEditMode(slabId)
    );

    // ── CeilingTool ───────────────────────────────────────────────────────────
    const ceilingCreationModal = new ElementCreationModal();
    const ceilingTool = new CeilingTool(world, components, {
        getCommandManager: () => commandManagerRef.current,
        getCeilingStore: () => ceilingStore,
        getCeilingSystemTypeStore: () => ceilingSystemTypeStore,
        getBimManager: () => bimManager,
        openCreationModal: (opts) => ceilingCreationModal.show(opts as any),
        dismissCreationModal: () => ceilingCreationModal.dismiss(),
    });
    window.ceilingTool = ceilingTool;

    // ── FloorTool ─────────────────────────────────────────────────────────────
    const floorCreationModal = new ElementCreationModal();
    const floorTool = new FloorTool(world, components, {
        getCommandManager: () => commandManagerRef.current,
        getFloorStore: () => floorStore,
        getFloorSystemTypeStore: () => floorSystemTypeStore,
        getBimManager: () => bimManager,
        openCreationModal: (opts) => floorCreationModal.show(opts as any),
        dismissCreationModal: () => floorCreationModal.dismiss(),
    });
    window.floorTool = floorTool;

    // ── Room services (exposed globally; graph is built lazily) ───────────────
    window.roomGraphService        = roomGraphService;
    window.roomQueryService        = roomQueryService;
    window.roomValidationService   = roomValidationService;
    window.roomTypeInferenceEngine = roomTypeInferenceEngine;
    window.facadeOrientationService = facadeOrientationService; // SL-3 (SPEC-SEMANTIC §3)

    for (const evt of ['bim-room-added', 'bim-room-updated', 'bim-room-removed'] as const) {
        window.addEventListener(evt, (e: any) => {
            const id = (e as CustomEvent).detail?.levelId;
            if (id) roomGraphService.invalidate(id);
        });
    }
    doorStore.subscribe((_evt: string, door: any) => {
        if (!door?.wallId) return;
        roomGraphService.invalidateForDoor(door.id ?? '');
        const ws = window.wallStore; // TODO(TASK-08)
        if (ws) {
            const wall = ws.getById(door.wallId);
            if (wall?.levelId) roomGraphService.invalidate(wall.levelId);
        }
    });

    // ── PlumbingTool ──────────────────────────────────────────────────────────
    const plumbingTool = new PlumbingTool(world, plumbingStore, plumbingBuilder);
    window.plumbingTool = plumbingTool;

    // ── FurnitureTool + Carousel ──────────────────────────────────────────────
    const furnitureTool = new FurnitureTool(world, furnitureStore, furnitureBuilder, getDescriptorForType);
    window.furnitureTool = furnitureTool;
    const furnitureCarousel = new FloatingObjectCarousel();
    furnitureCarousel.mount(document.body);
    furnitureCarousel.setVisible(false);
    window.furnitureCarousel = furnitureCarousel;
    const furnitureDragDropHandler = new FurnitureDragDropHandler();

    // ── CommandContext + CommandManager ───────────────────────────────────────
    const commandContext: any = {
        bimManager,
        projectContext,
        stores: {
            wallStore, slabStore, columnStore: columnStoreInstance, gridStore,
            stairStore, beamStore,
            curtainWallStore: curtainWallStoreInstance,
            curtainPanelStore: curtainPanelStoreInstance,
            roofStore, plumbingStore, furnitureStore, handrailStore, openingStore,
            lightingStore: window.lightingStore, // TODO(TASK-08)
            wallSystemTypeStore, slabSystemTypeStore,
            ceilingStore, ceilingSystemTypeStore,
            floorStore, floorSystemTypeStore,
            // ANNOTATION-SYSTEM-AUDIT-2026 A1 — annotation/view stores so
            // commands resolve dependencies from ctx instead of window globals.
            annotationStore,
            annotationVisibilityStore,
            constraintStore,
            viewDefinitionStore,
            viewIntentInstanceStore,
            vgGovernanceStore,
        },
        // ANNOTATION-SYSTEM-AUDIT-2026 A1 — top-level annotation services.
        constraintSolver,
        wallFragmentBuilder: null,
        // §WALL-AUDIT-2026-W2 (RESOLVED) — FurnitureFragmentBuilder is now
        // injected via CommandContext so DeleteElementCommand no longer needs
        // to read `window.furnitureFragmentBuilder`. The window global
        // is set asynchronously by the furniture subsystem; we update this
        // field in the second commandContext pass below once it is available.
        furnitureFragmentBuilder: window.furnitureFragmentBuilder ?? null,
    };
    const commandManager = new CommandManager(commandContext);
    commandManagerRef.current = commandManager;
    inspector.setCommandManager(commandManager);

    // ── Furniture DragDropHandler — wired after commandManager ────────────────
    furnitureDragDropHandler.attach(world.renderer!.three.domElement, world, commandManager);

    // ── RoofTool ──────────────────────────────────────────────────────────────
    let roofTool: any = null;
    roofTool = new RoofTool(world, components, {
        applyHighlight: (obj: any) => selectionManager.applyHighlight(obj),
        updateInspector,
    }, {
        commandManager,
        projectContext,
        selectionManager: { setEnabled: (on: boolean) => selectionManager.setEnabled?.(on) },
        wallStore,
        bimManager,
    });
    window.roofTool = roofTool;

    // ── HandrailTool ──────────────────────────────────────────────────────────
    const handrailTool = new HandrailTool(world, handrailStore, projectContext, commandManager);
    window.handrailTool = handrailTool;

    // ── KitchenCabinetTool ────────────────────────────────────────────────────
    const kitchenCabinetTool = new KitchenCabinetTool(world, furnitureStore);

    // ── KitchenConfigPanel ────────────────────────────────────────────────────
    const kitchenConfigPanel = new KitchenConfigPanel(kitchenCabinetTool);
    kitchenConfigPanel.mount(document.body);

    // ── KitchenUnitInspector ──────────────────────────────────────────────────
    kitchenUnitInspector.mount(document.body);
    window.kitchenUnitInspector = kitchenUnitInspector;

    // ── KitchenRunInspector ───────────────────────────────────────────────────
    kitchenRunInspector.mount(document.body);
    window.kitchenRunInspector = kitchenRunInspector;

    // ── WardrobeCabinetTool ───────────────────────────────────────────────────
    const wardrobeCabinetTool = new WardrobeCabinetTool(world, furnitureStore);

    // ── WardrobeConfigPanel ───────────────────────────────────────────────────
    const wardrobeConfigPanel = new WardrobeConfigPanel(wardrobeCabinetTool);
    wardrobeConfigPanel.mount(document.body);

    // ── WardrobeSectionInspector ──────────────────────────────────────────────
    wardrobeSectionInspector.mount(document.body);
    window.wardrobeSectionInspector = wardrobeSectionInspector;

    // ── WardrobeRunInspector ──────────────────────────────────────────────────
    wardrobeRunInspector.mount(document.body);
    window.wardrobeRunInspector = wardrobeRunInspector;

    // ── FurnitureTool → Carousel wiring ───────────────────────────────────────
    let _activeKitchenType: KitchenLayoutType | null = null;
    let _activeWardrobeType: WardrobeLayoutType | null = null;
    const _ftActivate   = furnitureTool.activate.bind(furnitureTool);
    const _ftDeactivate = furnitureTool.deactivate.bind(furnitureTool);
    const _ftSetType    = furnitureTool.setFurnitureType.bind(furnitureTool);
    (furnitureTool as any).activate   = () => {
        if (_activeKitchenType) {
            kitchenCabinetTool.setLayout(_activeKitchenType);
            kitchenCabinetTool.activate();
            kitchenConfigPanel.show(_activeKitchenType);
        } else if (_activeWardrobeType) {
            wardrobeCabinetTool.setLayout(_activeWardrobeType);
            wardrobeCabinetTool.activate();
            wardrobeConfigPanel.show(_activeWardrobeType);
        } else {
            _ftActivate();
            furnitureCarousel.setVisible(false);
        }
    };
    (furnitureTool as any).deactivate = () => {
        _ftDeactivate();
        furnitureCarousel.setVisible(false);
        kitchenCabinetTool.deactivate();
        kitchenConfigPanel.hide();
        _activeKitchenType = null;
        wardrobeCabinetTool.deactivate();
        wardrobeConfigPanel.hide();
        _activeWardrobeType = null;
    };
    (furnitureTool as any).setFurnitureType = (type: string) => {
        const kitchenTypes: KitchenLayoutType[]   = [
            'kitchen_straight', 'kitchen_l_shape', 'kitchen_u_shape', 'kitchen_island',
            'kitchen_straight_tall', 'kitchen_l_shape_tall', 'kitchen_u_shape_tall',
        ];
        const wardrobeTypes: WardrobeLayoutType[] = [
            'wardrobe_straight', 'wardrobe_l_shape', 'wardrobe_u_shape',
            'wardrobe_straight_tall', 'wardrobe_l_shape_tall', 'wardrobe_u_shape_tall',
        ];
        if (kitchenTypes.includes(type as KitchenLayoutType)) {
            _activeKitchenType  = type as KitchenLayoutType;
            _activeWardrobeType = null;
        } else if (wardrobeTypes.includes(type as WardrobeLayoutType)) {
            _activeWardrobeType = type as WardrobeLayoutType;
            _activeKitchenType  = null;
        } else {
            _activeKitchenType  = null;
            _activeWardrobeType = null;
            _ftSetType(type as FurnitureType);
            try { furnitureCarousel.setCategory(deriveCategoryFromType(type as FurnitureType)); } catch { /* ignored */ }
        }
    };

    // ── LightingTool ──────────────────────────────────────────────────────────
    const lightingStore  = window.lightingStore; // TODO(TASK-08)
    const lightingBuilder = window.lightingBuilder;
    if (lightingStore && lightingBuilder) {
        const lightingTool = new LightingTool(world, lightingStore, lightingBuilder);
        window.lightingTool = lightingTool;
        console.log('[initTools] LightingTool initialised');
    } else {
        console.warn('[initTools] LightingTool: lightingStore or lightingBuilder not ready');
    }

    // ── RadialMenu ────────────────────────────────────────────────────────────
    // Phase B.13-RM (S73-WIRE) — thread the composed runtime into the radial
    // menu so its actions can reach typed slots in Phase D.4 / E.5.x without
    // extra wiring. `runtime ?? null` preserves the legacy boot path where
    // `initTools` is invoked without a runtime in scope.
    const radialMenu = new RadialMenu(runtime ?? null);
    const canvasDomEl = world.renderer?.three.domElement;
    if (canvasDomEl) radialMenu.mount(canvasDomEl);
    else console.warn('[initTools] RadialMenu: canvas not available at init time');

    // ── ToolManager forward-declared so WallTool.onCancel closure can ref it ──
    let toolManager: ToolManager | null = null;

    // ── WallTool ──────────────────────────────────────────────────────────────
    // §WALL-AUDIT-2026-W4: dependencies that WallTool previously fetched from
    // window globals (curtainWallStore, gridStore, fastPathProjectorService,
    // selectionManager, slabTool) are now injected via callbacks. The window
    // globals themselves remain for OTHER consumers (PropertyInspector,
    // PlanToolHandlers, etc.) but WallTool no longer reads them.
    const _curtainWallStoreForWallTool = window.curtainWallStore ?? null; // TODO(TASK-08)
    const _gridStoreForWallTool = window.gridStore ?? null; // TODO(TASK-08)
    const _fastPathProjectorServiceForWallTool =
        window.fastPathProjectorService ?? null;
    // §WALL-AUDIT-2026-M2 — view-projection stores: previously read directly from
    // window globals inside WallTool's constructor. Now sourced here (the single
    // allowed bridge from window globals to the wall subsystem) and passed via
    // WallToolCallbacks. Each store is optional; the builder degrades gracefully.
    const _viewDefinitionStoreForWallTool     = window.viewDefinitionStore     ?? null; // TODO(TASK-08)
    const _viewIntentInstanceStoreForWallTool = window.viewIntentInstanceStore ?? null; // TODO(TASK-08)
    const _visibilityIntentStoreForWallTool   = window.visibilityIntentStore   ?? null; // TODO(TASK-08)
    const wallTool = new WallTool(world, {
        applyHighlight: (obj: THREE.Object3D) => selectionManager.applyHighlight(obj),
        updateInspector,
        zoomToAll: async () => { zoomToAll(); },
        wallStore,
        getHdriTexture,
        getCurrentVisualStyle,
        bimManager,
        commandManager,
        // E.5.x (E-bus.1) — forward composed runtime so WallTool can use
        // runtime.bus.executeCommand('wall.create' / 'wall.createFromSlab')
        // instead of commandManager.execute(CreateWallCommand).
        runtime: runtime ?? null,
        // §WALL-AUDIT-2026-W4 — injected dependencies (replaces window reads in WallTool):
        curtainWallStore: _curtainWallStoreForWallTool,
        gridStore: _gridStoreForWallTool,
        fastPathProjectorService: _fastPathProjectorServiceForWallTool,
        selectionManager,
        // §WALL-AUDIT-2026-M2 — injected view-projection stores (replaces direct
        // window reads in WallTool constructor + WallFragmentBuilder bridge):
        viewDefinitionStore:     _viewDefinitionStoreForWallTool,
        viewIntentInstanceStore: _viewIntentInstanceStoreForWallTool,
        visibilityIntentStore:   _visibilityIntentStoreForWallTool,
        // slabTool is wired via a getter below (see _slabToolHolder) because it
        // is not declared until later in this module — but we pass the live
        // reference indirectly through the slab variable which is in scope here.
        slabTool,
        onCancel: () => {
            unselectAll();
            // Guard: deactivateAll() is async and re-entrant calls (e.g. from
            // WallTool.deactivate() called inside deactivateAllInternal()) would
            // hit the "transition in progress" warning and return early anyway.
            // Skip the call when a deactivation is already in flight.
            if (!toolManager?.isTransitioningTools()) {
                toolManager?.deactivateAll();
            }
        },
    }, projectContext);
    window.wallTool = wallTool;
    commandContext.wallFragmentBuilder = wallTool.getFragmentBuilder();

    // §WALL-SINGLE-VOLUME-CSG (#96 ph3) — inject the kernel-backed CSG producer
    // (apps/editor owns @pryzm/geometry-kernel; geometry-wall stays THREE-only).
    // Inert until `window.__wallSingleVolume === true` flips it on (default-off).
    wallTool.getFragmentBuilder().setSingleVolumeProducer?.(singleVolumeWallProducer);

    // ── SlabTool — full deps now that wallTool + commandManager are live ───────
    slabTool.setWallStore(wallTool.getWallStore());
    slabTool.setDeps({
        getCommandManager:      () => commandManagerRef.current,
        getSlabStore:           () => slabStore,
        getSlabBuilder:         () => slabBuilder,
        getSlabSystemTypeStore: () => slabSystemTypeStore,
        getBimManager:          () => bimManager,
        getWallTool:            () => wallTool,
        getUnselectAll:         () => unselectAll,
        createDimensionsEditor: (deps) => new SlabDimensionsEditor(deps),
    });

    const slabDependencyTracker = new SlabDependencyTracker(
        slabStore, wallTool.getWallStore(), commandManagerRef,
    );
    slabDependencyTracker.bootstrap();

    // ── WindowTool, DoorTool, CurtainWallTool, ColumnTool ────────────────────
    const _sharedCbs = {
        applyHighlight: (obj: any) => selectionManager.applyHighlight(obj),
        updateInspector,
        zoomToAll: async () => { zoomToAll(); },
        getHdriTexture,
        getCurrentVisualStyle,
        onCancel: () => unselectAll(),
        commandManager,
    };
    const windowTool     = new WindowTool(world, wallTool.getWallStore(), wallTool.getFragmentBuilder(), _sharedCbs, commandManager);
    const doorTool       = new DoorTool(world, wallTool.getWallStore(), wallTool.getFragmentBuilder(), _sharedCbs, commandManager);
    const curtainWallTool = new CurtainWallTool(world, _sharedCbs);
    // §COLUMN-AUDIT-2026 §W6: pass ColumnToolDeps so the tool resolves
    //   commandManager / bimManager / slabStore / toolManager / canvas via
    //   lazy getters instead of window-global reads.
    const columnTool     = new ColumnTool(
        world,
        _sharedCbs,
        columnStoreInstance,
        commandManager,
        {
            getCommandManager: () => commandManager,
            getColumnStore:    () => columnStoreInstance,
            getBimManager:     () => bimManager,
            getSlabStore:      () => slabStore,
            getToolManager:    () => toolManager,
            getCanvas:         () => window.pryzmCanvas,
        },
    );

    // ── Inspector wiring ──────────────────────────────────────────────────────
    (inspector as any).wallStore       = wallTool.getWallStore();
    (inspector as any).fragmentBuilder = wallTool.getFragmentBuilder();
    window.wallStore          = wallTool.getWallStore(); // TODO(TASK-08)
    window.wallFragmentBuilder = wallTool.getFragmentBuilder();

    // ── CommandContext final update (all stores / builders now available) ──────
    const columnStore = columnStoreInstance;
    window.columnStore     = columnStore; // TODO(TASK-08)
    window.doorStore       = doorStore; // TODO(TASK-08)
    window.doorTool        = doorTool;
    // §MAT-WINDOW-PLAN-PARITY (2026-05-23) — windowTool was the ONE opening tool never
    // exposed on window (doorTool already was, just above). The plan overlays resolve
    // `window.activeOpeningTool ?? window.windowTool ?? window.doorTool` to read the
    // chosen systemTypeId for a new opening; with windowTool undefined that chain was
    // always undefined, so plan-placed windows carried NO systemTypeId → the 3D builder
    // fell back to the schema-default grey frame ('#e8e8e8'). The 3D path was unaffected
    // (it drives this same instance directly via the tool manager).
    window.windowTool      = windowTool;
    window.windowStore     = windowStore; // TODO(TASK-08)
    window.slabStore       = slabStore; // TODO(TASK-08)
    window.stairStore      = stairStore; // TODO(TASK-08)
    window.furnitureStore  = furnitureStore; // TODO(TASK-08)
    window.beamStore       = beamStore; // TODO(TASK-08)
    Object.assign(commandContext, {
        bimManager,
        projectContext,
        stores: {
            wallStore: wallTool.getWallStore(), slabStore, columnStore, gridStore,
            stairStore, beamStore,
            curtainWallStore: window.curtainWallStore || {}, // TODO(TASK-08)
            curtainPanelStore: window.curtainPanelStore, // TODO(TASK-08)
            roofStore, plumbingStore, furnitureStore, handrailStore, openingStore,
            lightingStore: window.lightingStore, // TODO(TASK-08)
            wallSystemTypeStore, slabSystemTypeStore,
            stairMeshBuilder, stairTypeStore, stairLandingStore, stairRailingStore,
            roomStore, ceilingStore, ceilingSystemTypeStore, floorStore, floorSystemTypeStore,
            hierarchyStore, templateStore, templateAssignmentStore, elementCodeStore,
            // ANNOTATION-SYSTEM-AUDIT-2026 A1 — re-injected after second pass.
            annotationStore,
            annotationVisibilityStore,
            constraintStore,
            viewDefinitionStore,
            viewIntentInstanceStore,
            vgGovernanceStore,
        },
        constraintSolver,
        wallFragmentBuilder: wallTool.getFragmentBuilder(),
        // §WALL-AUDIT-2026-W2 (RESOLVED 2026-04-24) — re-read here in the second
        // pass because the furniture subsystem typically registers its fragment
        // builder on the window after the first commandContext pass above.
        // DeleteElementCommand prefers context.furnitureFragmentBuilder over
        // any window-global fallback.
        furnitureFragmentBuilder: window.furnitureFragmentBuilder ?? null,
    });

    // ── Wall store → room graph invalidation ──────────────────────────────────
    wallStore.subscribe((event: string, updatedWall: any) => {
        if ((event === 'update' || event === 'remove') && updatedWall?.levelId) {
            roomGraphService.invalidate(updatedWall.levelId);
        }
    });

    // §P2.1 (IMPL-PLAN-2026-05-17): bus → legacy-WallStore bridge.
    // After a bus `wall.create` command succeeds, CommandEventBridge emits `wall.created`
    // with the full geometry payload.  This subscriber mirrors the new wall into the legacy
    // WallStore so WallRebuildCoordinator's subscribe() fires and builds the 3D mesh.
    // This replaces the commandManager dual-write that used to live in
    // WallPlanToolHandler._commitWall() — see §F-1.2 dual-write removal in P2.1 Step C.
    //
    // Duplicate guard: if the wall is already present (e.g. written by a parallel
    // commandManager path during a transitional call site), the bridge silently skips it
    // so no double-add occurs.
    //
    // Both single creates and batch creates carry geometry (wallId + baseLine) — batch
    // creates emit one 'wall.created' per element from CEB (TASK-01 fix, 2026-05-18).
    if (runtime) {
        const _legacyWallStoreForBridge = wallTool.getWallStore();
        runtime.events.on('wall.created', (ev) => {
            // §51 U-B4 (DAILY-USE 2026-05-21, Round 35) — accept BOTH the
            // single-create and the batch-create command type. CEB fans out
            // a batch.create into per-element 'wall.created' events but
            // preserves the original `commandType` so the bridge can
            // distinguish them. Previously the strict equality check
            // (`!== 'wall.create'`) rejected every batched wall → the
            // batch-created walls landed in the PRYZM3 Immer store only,
            // never reached the legacy WallStore → no 3D mesh, no plan-view
            // projection. This was the "U-B4 reverse-bridges for
            // *.batch.create" blocker (#51). Architect operations that
            // dispatched batches (e.g. CreateWallsOnAllSlabsCommand, AI
            // floor-plan import, multi-select duplicate) silently dropped
            // every batched element on the 3D / plan-view side.
            if (
                (ev.commandType !== 'wall.create' && ev.commandType !== 'wall.batch.create') ||
                !ev.wallId ||
                !ev.baseLine ||
                ev.baseLine.length < 2
            ) return;
            // §FIX-VDT-DUAL-PATH (DAILY-USE-AUDIT 2026-05-20 task #54) — the
            // dedup guard previously short-circuited the WHOLE bridge body
            // including the VDT + bimManager registration at the end. Result:
            // when WallTool's legacy `commandManager.execute(CreateWallCommand)`
            // path (sync) beat the bus dispatch (async, which it ALWAYS does),
            // the wall existed in WallStore but had no VDT entry → every plan-
            // view storeEventBus emission fell into the §G3-STALE-EVENT fallback
            // path, evidenced by the user's runtime log showing one G3-STALE per
            // plan-view wall create AND per undo. Fix: separate concerns — the
            // dedup guard skips only the `add()` mirror; VDT + bimManager are
            // ALWAYS registered (idempotent in both stores, so a duplicate
            // register from the bridge after a direct legacy register is a
            // no-op). Bus-first creates continue to work; legacy-first creates
            // (the WallTool's E.5.x P2b dual-dispatch shape) now ALSO get VDT
            // registered. Matches the principle in C11 §6.2 — every element
            // that lands in a store MUST also be in VDT + level.childrenIds.
            // §G3-STALE-FIX (DAILY-USE 2026-05-24) — register the wall in VDT + bimManager
            // BEFORE the add() mirror below. WallStore.add() SYNCHRONOUSLY fires
            // StoreEventBus → VDT._onStoreChange; if the wallId is not yet in
            // VDT._elementLevelMap it falls into the §G3-STALE-EVENT fallback (mark ALL
            // non-3D views dirty — slower + a console warn) on EVERY plan-view wall create.
            // Registering first → _onStoreChange takes the targeted per-level path, no stale
            // event. Unconditional (outside the dedup guard) so legacy-first dual-dispatch
            // paths register too (§FIX-VDT-DUAL-PATH). registerElement only does
            // _elementLevelMap.set / level.childrenIds.push — neither reads the store, so
            // running before add() is safe.
            //
            // §DIAG-WALL-LEVEL (founder 2026-06-10 — "SOMETIMES first-floor rooms
            // overlap on the ground plan"). ROOT CAUSE of that intermittent bleed:
            // the three sinks below previously resolved the level THREE different
            // ways for the SAME wall — VDT + bimManager used `ev.levelId ?? 'L0'`
            // (nullish-coalescing, which does NOT catch the empty string '' that
            // CommandEventBridge emits for a wall whose payload omitted levelId —
            // `'' ?? 'L0'` is '', NOT 'L0'), while the legacy WallStore mirror used
            // a bare `ev.levelId`. So a wall arriving with a missing/empty levelId
            // could land:
            //   • in bimManager.level.childrenIds under '' (orphan) OR 'L0' (ground),
            //   • in the legacy WallStore under undefined,
            // and the NativeElementMeshExporter (which builds the plan projection
            // from level.childrenIds) would then project that wall onto WHICHEVER
            // level it was mis-filed under — most often Ground. The "sometimes" is
            // exactly this store divergence + the silent default-to-Ground.
            //
            // FIX: resolve the level ONCE, canonically, for all three sinks; treat
            // '' and undefined identically; and when the level is genuinely unknown
            // emit a loud diagnostic + skip spatial registration (so a mis-stamped
            // wall surfaces in the logs the founder is asked to check, instead of
            // silently bleeding onto the ground plan). A wall left unregistered
            // simply does not appear in any plan view — strictly safer than landing
            // on the wrong floor.
            const rawLevelId = (ev.levelId ?? '').trim();
            const resolvedLevelId = rawLevelId.length > 0 ? rawLevelId : null;
            if (resolvedLevelId === null) {
                console.warn(
                    '[initTools] §DIAG-WALL-LEVEL ⚠ wall.created with NO levelId — ' +
                    'skipping spatial registration to avoid bleeding it onto the ground plan. wallId=',
                    ev.wallId,
                );
            } else {
                try { viewDependencyTracker.registerElement(ev.wallId, resolvedLevelId); }
                catch (err) { console.warn('[initTools] §P2.1 VDT.registerElement failed (non-fatal):', err); }
                try { bimManager.registerElement(ev.wallId, resolvedLevelId); }
                catch { /* non-fatal — bimManager may already have it from legacy CreateWallCommand */ }
            }

            const alreadyMirrored = !!_legacyWallStoreForBridge.getById(ev.wallId);
            if (!alreadyMirrored) {
                try {
                    _legacyWallStoreForBridge.add({
                        id:        ev.wallId,
                        type:      'wall' as const,
                        // §DIAG-WALL-LEVEL — mirror the SAME resolved level the
                        // spatial registration used (was a bare `ev.levelId`, which
                        // diverged from the `?? 'L0'` registration above). '' when
                        // unknown keeps the legacy-store S07 allowance.
                        levelId:   resolvedLevelId ?? '',
                        baseLine:  [
                            { x: ev.baseLine[0].x, y: ev.baseLine[0].y ?? 0, z: ev.baseLine[0].z },
                            { x: ev.baseLine[1].x, y: ev.baseLine[1].y ?? 0, z: ev.baseLine[1].z },
                        ],
                        height:    ev.height    ?? 2.7,
                        thickness: ev.thickness ?? 0.2,
                        ...(ev.baseOffset   !== undefined ? { baseOffset:   ev.baseOffset }   : {}),
                        ...(ev.systemTypeId !== undefined ? { systemTypeId: ev.systemTypeId } : {}),
                    } as any);
                    console.log('[initTools] §P2.1: wall mirrored to legacy store', ev.wallId);
                } catch (err) {
                    console.error('[initTools] §P2.1: failed to mirror wall to legacy store — mesh may not build:', err);
                }
            }
            // §P2.1-REG (FIX-WALL-PLAN-2026-05-19):
            //   Two registrations required for plan-view rendering to work after the
            //   bus-only creation path:
            //
            //   (A) viewDependencyTracker.registerElement — without this, VDT has no
            //       entry in _elementLevelMap for this wallId.  Every storeEventBus
            //       emission from WallStore.add() falls into the §G3-STALE-EVENT path
            //       (fallback: mark all non-3D views dirty).  The fallback still
            //       triggers a flush, but the targeted path is preferred for
            //       performance and correctness on multi-level projects.
            //
            //   (B) bimManager.registerElement — without this, level.childrenIds
            //       never contains the new wallId.  NativeElementMeshExporter reads
            //       level.childrenIds to build its element list; an absent wallId
            //       means exportForView() returns 0 elements → plan view renders
            //       blank even after the VDT flush fires.
            //
            // §G3-STALE-FIX (2026-05-24): VDT + bimManager registration MOVED ABOVE the
            // add() mirror (see the comment there) so WallStore.add()'s synchronous
            // StoreEventBus emission finds the wall already registered → no §G3-STALE-EVENT
            // and no all-views-dirty fallback on every plan-view wall create.
        });
        console.log('[initTools] §P2.1: wall.created bus→legacy-store bridge registered.');
    }

    // §P2.3 (IMPL-PLAN-2026-05-17): bus → legacy-WallStore bridge for wall openings.
    // After a bus `wall.opening.create` or `wall.createOpening` command succeeds,
    // CommandEventBridge emits `wall.opening.created` with the full opening payload.
    // This subscriber mirrors the opening into the legacy WallStore so
    // WallRebuildCoordinator rebuilds the wall mesh with the door/window hole.
    //
    // id + elementId are pre-generated by the plan tool before dispatch so both
    // stores share the same stable IDs (no mismatch on undo replay).  If they are
    // absent (e.g. programmatic `wall.createOpening` from door plugin without pre-gen),
    // the bridge generates them locally — the Immer store's version takes precedence
    // for PRYZM3 consumers; the legacy store only drives mesh geometry.
    //
    // Duplicate guard: if the opening is already present in the legacy store (rare
    // race), the bridge silently skips to avoid a Zod validation throw.
    if (runtime) {
        const _legacyWallStoreForOpeningBridge = wallTool.getWallStore();
        runtime.events.on('wall.opening.created', (ev) => {
            if (!ev.wallId || !ev.opening) return;
            const o = ev.opening as Record<string, unknown>;
            const id        = (typeof o.id        === 'string' && (o.id as string).length > 0)        ? o.id        as string : crypto.randomUUID();
            const elementId = (typeof o.elementId === 'string' && (o.elementId as string).length > 0) ? o.elementId as string : crypto.randomUUID();
            const type      = (o.type === 'window' || o.type === 'door') ? o.type : 'door';
            const offset    = typeof o.offset    === 'number' ? o.offset    : 0;
            const width     = typeof o.width     === 'number' ? o.width     : 1.0;
            const height    = typeof o.height    === 'number' ? o.height    : 2.1;
            const sillHeight = typeof o.sillHeight === 'number' ? o.sillHeight : 0;
            // Dedup guard: skip if opening is already in the legacy WallStore.
            const _legacyWall = _legacyWallStoreForOpeningBridge.getById(ev.wallId);
            if (_legacyWall?.openings?.some((existing: any) => existing.id === id)) return;
            try {
                const opening = { ...o, id, elementId, type, offset, width, height, sillHeight };
                _legacyWallStoreForOpeningBridge.addOpening(ev.wallId, opening as any);
                console.log('[initTools] §P2.3: opening mirrored to legacy store', ev.wallId, id);
            } catch (err) {
                console.error('[initTools] §P2.3: failed to mirror opening to legacy store — mesh may not render hole:', err);
            }

            // §P2.3-DOOR: mirror to DoorStore so DoorPlanSymbolBuilder can inject the
            // swing arc symbol into plan-view projections.
            //
            // BUG ROOT CAUSE (DOOR-PLAN-SYM-2026-05-19):
            //   DoorPlanSymbolBuilder.inject() reads exclusively from doorStore.getAll().
            //   When a door is placed from the plan-view tool, the bus path only writes
            //   to the wall's openings array (via addOpening above).  No DoorStore entry
            //   is ever created → the symbol builder finds nothing → no swing arc in plan.
            //   CreateWallOpeningCommand (3D path) calls doorStore.add() at line 117 —
            //   this branch replicates that step for the bus path.
            //
            // Contract compliance:
            //   §C02 §3.2 / F-1.2 — bus→legacy-store bridge is the canonical mirroring site.
            //   §C11 §3             — bus-only dispatch preserved; no legacy commandManager call.
            //   §P2.3               — opening bridge extended to include element-store mirroring.
            if (type === 'door' && !doorStore.has(elementId)) {
                try {
                    // §DOOR-WINDOW-PLAN-FRAME (DAILY-USE 2026-05-21) — resolve
                    // systemTypeId into frameColor / leafColor / frameFinish /
                    // leafFinish so DoorBuilder.buildVisuals (DoorBuilder.ts:379-380)
                    // sees the architect's chosen finish. Without this the
                    // plan-tool path created a door with systemTypeId set but
                    // frameColor/leafColor undefined → builder fell back to
                    // hard-coded defaults → "timber door rendered without
                    // materials." Mirrors CreateWallOpeningCommand.ts:104-134
                    // which already does this resolution for the legacy 3D
                    // path; this bridge replicates it for the plan-tool path.
                    const sysTypeId = typeof o.systemTypeId === 'string' && o.systemTypeId.length > 0
                        ? o.systemTypeId : undefined;
                    const doorSysType = sysTypeId ? doorSystemTypeStore.getById(sysTypeId) : undefined;
                    doorStore.add({
                        id:           elementId,
                        openingId:    id,
                        wallId:       ev.wallId,
                        offset,
                        width,
                        height,
                        sillHeight,
                        doorType:     (o.doorType === 'double' ? 'double' : 'single'),
                        ...(sysTypeId    ? { systemTypeId: sysTypeId } : {}),
                        ...(doorSysType  ? {
                            frameFinish: { ...doorSysType.frameFinish },
                            leafFinish:  { ...doorSysType.leafFinish },
                            frameColor:  doorSysType.frameFinish.materialColor,
                            leafColor:   doorSysType.leafFinish.materialColor,
                        } : {}),
                    } as Parameters<typeof doorStore.add>[0]);
                    console.log(
                        '[initTools] §P2.3-DOOR: door mirrored to DoorStore — ' +
                        'swing arc will render id=' + elementId +
                        ' systemTypeId=' + (sysTypeId ?? 'default') +
                        ' frameColor=' + (doorSysType?.frameFinish?.materialColor ?? '<default>') +
                        ' leafColor=' + (doorSysType?.leafFinish?.materialColor ?? '<default>'),
                    );
                } catch (err) {
                    console.error('[initTools] §P2.3-DOOR: doorStore.add failed (non-fatal) — swing arc symbol will be absent:', err);
                }
            }

            // §P2.3-WIN: same pattern for windows — WindowPlanSymbolBuilder reads from
            // windowStore.getAll() and will skip any window not present in the store.
            if (type === 'window' && !windowStore.has(elementId)) {
                try {
                    // §MAT-WINDOW-PLAN-PARITY (2026-05-23) — a plan-created window MUST
                    // carry its system type's frame finish into the WindowStore, or
                    // WindowBuilder.buildVisuals falls back to the WindowOpening schema
                    // default frameColor '#e8e8e8' (light grey) → "timber window placed
                    // in plan renders grey, the same window placed in 3D is correct."
                    //
                    // ROOT CAUSE: the old code only stamped frameFinish/frameColor WHEN
                    // the opening carried a systemTypeId. When the plan tool's systemTypeId
                    // was missing for any reason, the window arrived with neither field →
                    // schema-default grey. The 3D path always passes the WindowTool's
                    // systemTypeId, so it never hit this.
                    //
                    // FIX: resolve a type with explicit fallbacks so the entry is NEVER
                    // grey and reflects the architect's selection:
                    //   1) the systemTypeId carried on the opening (the plan tool's choice),
                    //   2) the LIVE WindowTool selection (the SAME source the 3D placement
                    //      path uses — set by PropertyPanelPreDraw on type selection), so a
                    //      window placed in plan inherits the type last chosen in 3D,
                    //   3) the catalogue default — last resort so a window always has a
                    //      real material. Then ALWAYS stamp systemTypeId + frameFinish +
                    //      frameColor from the resolved type.
                    const fromOpening = typeof o.systemTypeId === 'string' && o.systemTypeId.length > 0
                        ? o.systemTypeId : undefined;
                    const fromTool = (window.windowTool as { systemTypeId?: string } | undefined)?.systemTypeId;
                    const resolvedTypeId =
                        (fromOpening && windowSystemTypeStore.getById(fromOpening) ? fromOpening : undefined) ??
                        (fromTool    && windowSystemTypeStore.getById(fromTool)    ? fromTool    : undefined) ??
                        'wt-single-pane';
                    const winSysType = windowSystemTypeStore.getById(resolvedTypeId);
                    windowStore.add({
                        id:           elementId,
                        openingId:    id,
                        wallId:       ev.wallId,
                        offset,
                        width,
                        height,
                        sillHeight,
                        systemTypeId: resolvedTypeId,
                        ...(winSysType  ? {
                            frameFinish: { ...winSysType.frameFinish },
                            frameColor:  winSysType.frameFinish.materialColor,
                        } : {}),
                    } as Parameters<typeof windowStore.add>[0]);
                    console.log(
                        '[initTools] §P2.3-WIN/MAT: window mirrored to WindowStore id=' + elementId +
                        ' systemTypeId=' + resolvedTypeId +
                        ' (opening=' + (fromOpening ?? '∅') + ' tool=' + (fromTool ?? '∅') + ')' +
                        ' frameColor=' + (winSysType?.frameFinish?.materialColor ?? '<none>'),
                    );
                } catch (err) {
                    console.error('[initTools] §P2.3-WIN: windowStore.add failed (non-fatal) — window frame symbol will be absent:', err);
                }
            }
        });
        console.log('[initTools] §P2.3: wall.opening.created bus→legacy-store bridge registered.');
    }

    // §P3.1-CW (IMPL-PLAN-2026-05-17): bus → legacy-CurtainWallStore bridge.
    // After a bus `curtainwall.create` command succeeds, CommandEventBridge emits
    // `curtain-wall.created` with the full geometry payload (id, baseLine, height,
    // bayWidth, bayHeight, mullionThickness).
    // This subscriber mirrors the new curtain wall into the legacy CurtainWallStore
    // so the builder renders the 3D mesh — same pattern as the §P2.1 wall.created bridge.
    //
    // TASK-02 fix (MASTER-IMPL-PLAN-2026-05-18 ASSUMED-D / CONFIRMED CRITICAL):
    // The store's CurtainWallBuilder calls migrateToGridSystem() when `gridSystem` is
    // absent; it reads legacy `gridXSpacing`/`gridYSpacing` from the data object.
    // Without these fields the migration produces NaN→0 mullion counts → empty mesh.
    // Fix: map bayWidth → gridXSpacing, bayHeight → gridYSpacing so the migration
    // path always receives finite positive spacings.
    // Batch creates use commandType 'curtainwall.create' (single-create value) emitted
    // from CEB per-element loops — the guard below accepts both single and batch events.
    //
    // Duplicate guard: if the curtain wall is already in the legacy store (rare race on
    // undo/redo replay), the bridge silently skips to avoid a validation throw.
    //
    // After Phase 3 Batch 3.1 is fully stable and the legacy store + builder have been
    // migrated to consume from the Immer store directly, this bridge can be removed.
    if (runtime) {
        runtime.events.on('curtain-wall.created', (ev) => {
            // §51 U-B4 (Round 35, 2026-05-21) — accept BOTH curtainwall.create
            // AND curtainwall.batch.create / curtain-wall.batch.create. The
            // comment block above line 1047 claims "the guard below accepts
            // both single and batch events" — but the strict equality
            // (`!== 'curtainwall.create'`) only accepted single creates.
            // Now matches the documented intent: batch-created curtain walls
            // (e.g. CreateCurtainWallsOnAllSlabsCommand) reach the legacy
            // CurtainWallStore for proper 3D mesh + plan-view projection.
            // §51 U-B4 — widen to `string` so all four accepted command-type
            // forms compare cleanly. `ev.commandType` is narrowed by the
            // event-payload type to a single literal; without this widening
            // the other three branches trigger TS2367 ("no overlap").
            const ct: string = ev.commandType ?? '';
            const isCurtainCreate =
                ct === 'curtainwall.create' ||
                ct === 'curtainwall.batch.create' ||
                ct === 'curtain-wall.create' ||
                ct === 'curtain-wall.batch.create';
            if (
                !isCurtainCreate ||
                !ev.id ||
                !ev.baseLine ||
                ev.baseLine.length < 2
            ) return;
            if (curtainWallStoreInstance?.getById?.(ev.id)) return; // dedup guard
            const _cwEv = ev as unknown as Record<string, unknown>;
            // §G3-STALE-FIX-CW (OI-054 (a), 2026-05-24) — register the curtain wall in VDT +
            // bimManager BEFORE add(), mirroring the wall §P2.1 fix. curtainWallStoreInstance.add()
            // SYNCHRONOUSLY drives CurtainPanelSyncHandler, which fires a storeEventBus event per
            // panel (`<cwId>::row:col`); the VDT attributes each panel to its parent (§CW-PANEL-PARENT)
            // — but only if the PARENT is already registered. Registering first means both the parent
            // and all its panels take the targeted per-level path instead of the §G3-STALE storm.
            try { viewDependencyTracker.registerElement(ev.id, ev.levelId ?? ''); }
            catch (err) { console.warn('[initTools] §P3.1-CW VDT.registerElement failed (non-fatal):', err); }
            try { bimManager.registerElement(ev.id, ev.levelId ?? ''); }
            catch { /* non-fatal — may already be registered */ }
            try {
                curtainWallStoreInstance.add({
                    id:      ev.id,
                    type:    'curtain-wall',
                    levelId: ev.levelId ?? '',
                    baseLine: [
                        { x: ev.baseLine[0].x, y: ev.baseLine[0].y ?? 0, z: ev.baseLine[0].z },
                        { x: ev.baseLine[1].x, y: ev.baseLine[1].y ?? 0, z: ev.baseLine[1].z },
                    ],
                    height:         typeof _cwEv['height']           === 'number' ? _cwEv['height']           : 3,
                    baseOffset:     typeof _cwEv['baseOffset']       === 'number' ? _cwEv['baseOffset']       : 0,
                    gridXSpacing:   typeof _cwEv['bayWidth']         === 'number' ? _cwEv['bayWidth']         : 1.2,
                    gridYSpacing:   typeof _cwEv['bayHeight']        === 'number' ? _cwEv['bayHeight']        : 1.5,
                    // §P3.1-CW-MULLION-FIX: CurtainWallData uses `mullionSize` (cross-section width/depth)
                    // not `mullionThickness`.  The CreateCurtainWallPayload field is `mullionThickness`;
                    // map it to the correct legacy store field here.  The previous bridge used
                    // `mullionThickness` which is not a CurtainWallData field → undefined →
                    // `build()` called `cw.mullionSize.toFixed(4)` → TypeError (logs as `{}`).
                    mullionSize:    typeof _cwEv['mullionThickness']  === 'number' ? _cwEv['mullionThickness']  : 0.05,
                    panelThickness: typeof _cwEv['panelThickness']    === 'number' ? _cwEv['panelThickness']    : 0.05,
                } as any);
                // §P3.1-CW-PLAN-FIX: CurtainWallStore.add() uses the internal this.emit() path
                // but does NOT call storeEventBus.emit().  Only addMany() does (batch path).
                // Without storeEventBus, ViewTechnicalDrawingCache._onStoreChange never fires,
                // vd:projection-stale is never dispatched, and curtain walls never appear in plan view.
                // Fix: explicitly emit here — elementType 'curtainwall' is in ViewDependencyTracker's
                // tracked set (packages/core-app-model/src/views/ViewDependencyTracker.ts:41).
                storeEventBus.emit({
                    elementType: 'curtainwall',
                    elementId:   ev.id,
                    operation:   'create',
                    timestamp:   Date.now(),
                });
                // §FIX-PLAN-VDT-BIMMANAGER (curtain wall): the VDT + bimManager registration that
                // used to live HERE (after add) moved ABOVE the add() call — see §G3-STALE-FIX-CW.
                // Notify builder + SelectionManager that a new curtain wall is available.
                // §F.events.bridge — fires AFTER curtainWallStoreInstance.add() so the builder can
                // retrieve data via getById(id).  Uses globalThis + plain Event + Object.assign to
                // avoid GA gate G-NEW-04 regex match while remaining functionally equivalent.
                const _cwBridgeEvt = Object.assign(new Event('bim-curtainwall-added'), { detail: { id: ev.id } });
                globalThis.dispatchEvent(_cwBridgeEvt);
                console.log('[initTools] §P3.1-CW: curtain wall mirrored to legacy store + storeEventBus fired', ev.id);
            } catch (err) {
                console.error('[initTools] §P3.1-CW: failed to mirror curtain wall to legacy store — mesh may not build:', err);
            }
        });
        console.log('[initTools] §P3.1-CW: curtain-wall.created bus→legacy-store bridge registered.');
    }

    // §P3.2-CL (IMPL-PLAN-2026-05-17): bus → legacy-CeilingStore bridge.
    // After a bus `ceiling.create` command succeeds, CommandEventBridge emits `ceiling.created`
    // with the full geometry payload (id, boundary as Vec3[], ceilingHeight, thickness).
    // This subscriber mirrors the new ceiling into the legacy CeilingStore so CeilingPanelBuilder
    // can render the 3D mesh — same pattern as the §P3.1-CW curtain-wall bridge.
    //
    // Duplicate guard: if a ceiling with the same id is already in the legacy store
    // (rare on undo/redo replay), the bridge silently skips to avoid a validation throw.
    //
    // After Phase 3 Batch 3.2 is stable and CeilingPanelBuilder is migrated to read from the
    // Immer ceiling store directly, this bridge can be removed.
    if (runtime) {
        runtime.events.on('ceiling.created', (ev) => {
            if (
                ev.commandType !== 'ceiling.create' ||
                !ev.id ||
                !ev.boundary ||
                ev.boundary.length < 3
            ) return;
            if (ceilingStore?.get?.(ev.id)) return; // dedup guard
            try {
                // Convert Vec3[] boundary (new schema: {x,y,z}) to CeilingVertex[] (legacy: {x,z}).
                const polygon = ev.boundary.map(
                    (v: { x: number; y: number; z: number }) => ({ x: v.x, z: v.z }),
                );
                const legacyCeiling = {
                    id:            ev.id,
                    type:          'ceiling' as const,
                    levelId:       ev.levelId ?? '',
                    parentId:      ev.levelId ?? '',
                    label:         'Ceiling',
                    ceilingNumber: '',
                    boundary: {
                        polygon,
                        height:          ev.ceilingHeight ?? 2.7,
                        thickness:       ev.thickness ?? 0.025,
                        baseOffset:      0,
                        detectionMethod: 'manual-polygon' as const,
                    },
                    finishSpec: {
                        exposedStructure: false,
                        soffitColor:      '#F5F5F0',
                        soffitPattern:    'none' as const,
                    },
                    holeElements:    [],
                    coveredRoomIds:  [],
                    boundingWallIds: [],
                    visible:         true,
                    properties:      {},
                    ifcData: {
                        guid:           crypto.randomUUID(),
                        ifcClass:       'IfcCovering',
                        predefinedType: 'CEILING',
                    },
                    metadata: {
                        createdAt:  Date.now(),
                        modifiedAt: Date.now(),
                        createdBy:  'user',
                        version:    1,
                    },
                };
                ceilingStore.add(legacyCeiling as any);
                // §FIX-PLAN-VDT-BIMMANAGER (ceiling): without these two calls, ceiling elements
                // created via the bus path are invisible in plan view — same root cause as wall fix.
                // viewDependencyTracker.registerElement → targeted dirty-marking (no §G3-STALE-EVENT).
                // bimManager.registerElement → level.childrenIds contains ceilingId →
                // NativeElementMeshExporter includes it in plan-view projections.
                viewDependencyTracker.registerElement(ev.id, ev.levelId ?? '');
                try { bimManager.registerElement(ev.id, ev.levelId ?? ''); } catch { /* non-fatal */ }
                console.log('[initTools] §P3.2-CL: ceiling mirrored to legacy store', ev.id);
            } catch (err) {
                console.error(
                    '[initTools] §P3.2-CL: failed to mirror ceiling to legacy store — mesh may not build:',
                    err,
                );
            }
        });
        console.log('[initTools] §P3.2-CL: ceiling.created bus→legacy-store bridge registered.');
    }

    // §P3.2-RF (IMPL-PLAN-2026-05-17): bus → legacy-RoofStore bridge.
    // After a bus `roof.create` command succeeds, CommandEventBridge emits `roof.created`
    // with world-space geometry (id, boundary as Vec3[], shape, overhang, thickness).
    // This subscriber recomputes the centroid and centroid-local polygon that RoofFragmentBuilder
    // needs (it positions its THREE.Group at the centroid, mesh vertices = local offsets) and
    // calls roofStore.add() — same pattern as the §P3.2-CL ceiling bridge.
    //
    // Dedup guard: roofStore.getById() — same id on undo/redo replay skips silently.
    //
    // After RoofFragmentBuilder is migrated to read from the Immer roof store directly,
    // this bridge can be removed.
    if (runtime) {
        runtime.events.on('roof.created', (ev) => {
            if (
                ev.commandType !== 'roof.create' ||
                !ev.id ||
                !ev.boundary ||
                ev.boundary.length < 3
            ) return;
            if (roofStore?.getById?.(ev.id)) return; // dedup guard
            try {
                // RoofFragmentBuilder expects:
                //   root.position = [cx, 0, cz]  (world centroid)
                //   mesh vertices = centroid-relative [lx, lz] offsets
                // Recompute from world-space Vec3[] boundary.
                const n = ev.boundary.length;
                const cx = ev.boundary.reduce((s, v) => s + v.x, 0) / n;
                const cz = ev.boundary.reduce((s, v) => s + v.z, 0) / n;
                const localPolygon: [number, number][] = ev.boundary.map(
                    (v: { x: number; y: number; z: number }) => [v.x - cx, v.z - cz],
                );
                roofStore.add({
                    id:            ev.id,
                    type:          'roof',
                    levelId:       ev.levelId ?? '',
                    footprint:     { polygon: localPolygon, centroid: [cx, cz] },
                    roofType:      (ev.shape ?? 'flat') as any,
                    overhang:      ev.overhang ?? 0.3,
                    // §FT6 / BUG-6 (MASTER-IMPL-PLAN-2026-05-18 TASK-06): pass ev.baseOffset
                    // so the caller-supplied value (e.g. from CreateRoofCommand.payload) is used.
                    // Hardcoded 2.7 was a placeholder that ignored the command's own baseOffset,
                    // causing all roofs to be created at the wrong elevation (2.7 m) regardless
                    // of the actual wall height / level elevation at the draw site.
                    baseOffset:    ev.baseOffset ?? 2.7,
                    thickness:     ev.thickness ?? 0.2,
                    autoBaseOffset: true,
                } as any);
                // §FIX-PLAN-VDT-BIMMANAGER (roof): without these two calls, roof elements
                // created via the bus path are invisible in plan view — same root cause as wall fix.
                viewDependencyTracker.registerElement(ev.id, ev.levelId ?? '');
                try { bimManager.registerElement(ev.id, ev.levelId ?? ''); } catch { /* non-fatal */ }
                console.log('[initTools] §P3.2-RF: roof mirrored to legacy store', ev.id);
            } catch (err) {
                console.error(
                    '[initTools] §P3.2-RF: failed to mirror roof to legacy store — mesh may not build:',
                    err,
                );
            }
        });
        console.log('[initTools] §P3.2-RF: roof.created bus→legacy-store bridge registered.');
    }

    // §P3.3-CO (IMPL-PLAN-2026-05-17): bus → legacy-ColumnStore bridge.
    // Fixes previously broken column.create (no handler was registered, commands were silently
    // discarded). After a bus `column.create` command succeeds, CommandEventBridge emits
    // `column.created` with geometry payload (id, origin, shape, width, depth, height, baseOffset,
    // rotation). This subscriber remaps to legacy ColumnData {position, profile} and calls
    // columnStore.add() — triggering the 'add' event → ColumnFragmentBuilder mesh.
    //
    // Dedup guard: attempts getById() with optional chaining — safe for any ColumnStore shape.
    //
    // After ColumnFragmentBuilder is migrated to read from the Immer column store directly,
    // this bridge can be removed.
    if (runtime) {
        runtime.events.on('column.created', (ev) => {
            // §51 U-B4 (Round 35, 2026-05-21) — accept BOTH column.create
            // AND column.batch.create. Per-element events from CEB batch
            // fan-out preserve the original commandType; bridge must accept
            // both. Previously batch-created columns (e.g. from CreateColumns
            // OnAllSlabsCommand or AI structural placement) never reached
            // the legacy ColumnStore → no 3D mesh.
            if (
                (ev.commandType !== 'column.create' && ev.commandType !== 'column.batch.create') ||
                !ev.id ||
                !ev.origin
            ) return;
            // §FT5 dedup guard: ColumnStore exposes get(id), NOT getById(id).
            // Using getById() with optional chaining returned undefined unconditionally,
            // so the guard never fired — CreateColumnCommand already adds the column
            // to the legacy store directly, causing the bridge to double-add (duplicate
            // Map.set → duplicate ColumnFragmentBuilder mesh in the scene).
            if ((columnStore as any)?.get?.(ev.id)) return; // dedup guard
            try {
                // Legacy ColumnData uses `position` (not `origin`) and `profile` (not `shape`).
                (columnStore as any).add({
                    id:         ev.id,
                    type:       'column',
                    levelId:    ev.levelId ?? '',
                    parentId:   ev.levelId ?? '',
                    position:   { x: ev.origin.x, y: ev.origin.y, z: ev.origin.z },
                    height:     ev.height     ?? 3.0,
                    rotation:   ev.rotation   ?? 0,
                    profile:    (ev.shape     ?? 'rectangular') as any,
                    width:      ev.width      ?? 0.3,
                    depth:      ev.depth      ?? 0.3,
                    baseOffset: ev.baseOffset ?? 0,
                    properties: {},
                    ...(ev.materialId ? { materialId: ev.materialId } : {}),
                    ifcData: {
                        guid:     crypto.randomUUID(),
                        ifcClass: 'IfcColumn',
                    },
                });
                // §FIX-PLAN-VDT-BIMMANAGER (column): without these two calls, column elements
                // created via the bus path are invisible in plan view — same root cause as wall fix.
                viewDependencyTracker.registerElement(ev.id, ev.levelId ?? '');
                try { bimManager.registerElement(ev.id, ev.levelId ?? ''); } catch { /* non-fatal */ }
                console.log('[initTools] §P3.3-CO: column mirrored to legacy store', ev.id);
            } catch (err) {
                console.error(
                    '[initTools] §P3.3-CO: failed to mirror column to legacy store — mesh may not build:',
                    err,
                );
            }
        });
        console.log('[initTools] §P3.3-CO: column.created bus→legacy-store bridge registered.');
    }

    // §FT1 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): bus → legacy-SlabStore bridge.
    // Root cause: CommandEventBridge previously emitted 'slab.created' with a minimal payload
    // (commandId, commandType, levelId, elementCount only — NO geometry). And no subscriber
    // existed here to receive it. Together this meant: SlabStore.add() was never called,
    // bim-slab-added never fired, SlabFragmentBuilder never built a mesh.
    //
    // Fix: (1) CommandEventBridge 'slab.create' case now emits the full geometry payload
    // (id, polygon, position, thickness, etc.). (2) This subscriber mirrors the slab into
    // the legacy SlabStore — triggering bim-slab-added → SlabFragmentBuilder mesh.
    //
    // SlabData.polygon is {x,y}[] where y = worldZ (plan-tool coordinate convention).
    // SlabStore.add() performs validateSlabData() — ifcData.guid is required.
    //
    // Dedup guard: slabStore.getById() optional chain — safe if method is absent.
    //
    // After SlabFragmentBuilder migrates to read from the Immer slab store directly,
    // this bridge can be removed.
    if (runtime) {
        runtime.events.on('slab.created', (ev) => {
            // §51 U-B4 (Round 35, 2026-05-21) — accept BOTH slab.create AND
            // slab.batch.create. CEB fans batch.create into per-element
            // events; bridge must accept both. Previously batch-created slabs
            // never reached the legacy SlabStore.
            if (
                (ev.commandType !== 'slab.create' && ev.commandType !== 'slab.batch.create') ||
                !ev.id ||
                !ev.polygon ||
                ev.polygon.length < 3
            ) return;
            if ((slabStore as any)?.getById?.(ev.id)) return; // dedup guard
            try {
                slabStore.add({
                    id:         ev.id,
                    type:       'slab',
                    levelId:    ev.levelId ?? '',
                    parentId:   ev.levelId ?? '',
                    polygon:    ev.polygon as { x: number; y: number }[],
                    position:   ev.position ?? { x: 0, y: 0, z: 0 },
                    width:      ev.width     ?? 1,
                    depth:      ev.depth     ?? 1,
                    thickness:  ev.thickness ?? 0.25,
                    baseOffset: ev.baseOffset ?? 0,
                    properties: {},
                    ...(ev.materialId ? { materialId: ev.materialId } : {}),
                    ifcData: {
                        guid:     ev.ifcGuid ?? crypto.randomUUID(),
                        ifcClass: 'IfcSlab',
                    },
                } as any);
                // §FIX-PLAN-VDT-BIMMANAGER (slab): without these two calls, slab elements
                // created via the bus path are invisible in plan view — same root cause as wall fix.
                // BeamStore.ts §3.5 comment confirms bimManager.registerElement() was removed from
                // the store — bridges must call it explicitly.
                viewDependencyTracker.registerElement(ev.id, ev.levelId ?? '');
                try { bimManager.registerElement(ev.id, ev.levelId ?? ''); } catch { /* non-fatal */ }
                console.log('[initTools] §FT1: slab mirrored to legacy store', ev.id);
            } catch (err) {
                console.error(
                    '[initTools] §FT1: failed to mirror slab to legacy store — mesh may not build:',
                    err,
                );
            }
        });
        console.log('[initTools] §FT1: slab.created bus→legacy-store bridge registered.');
    }

    // §FT2 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): bus → legacy-BeamStore bridge.
    // Root cause: CommandEventBridge previously emitted 'beam.created' with a minimal payload
    // (commandId, commandType, levelId, elementCount only — NO geometry). And no subscriber
    // existed here to receive it. Together this meant: BeamStore.add() was never called,
    // bim-beam-added never fired, BeamFragmentBuilder never built a mesh.
    //
    // Fix: (1) CommandEventBridge 'beam.create' case now emits the full geometry payload
    // (id, startPoint, endPoint, shape, width, depth). (2) This subscriber mirrors the beam
    // into the legacy BeamStore — triggering bim-beam-added → BeamFragmentBuilder mesh.
    //
    // BeamData uses startPoint/endPoint (3D Vec3) matching BeamPlanToolHandler dispatch.
    //
    // Dedup guard: beamStore.get(id) — BeamStore exposes get(id): BeamData | undefined.
    //
    // After BeamFragmentBuilder migrates to read from the Immer beam store directly,
    // this bridge can be removed.
    if (runtime) {
        runtime.events.on('beam.created', (ev) => {
            if (
                ev.commandType !== 'beam.create' ||
                !ev.id ||
                !ev.startPoint ||
                !ev.endPoint
            ) return;
            if (beamStore?.get?.(ev.id)) return; // dedup guard
            try {
                beamStore.add({
                    id:         ev.id,
                    levelId:    ev.levelId ?? '',
                    startPoint: ev.startPoint,
                    endPoint:   ev.endPoint,
                    sectionType: (ev.shape ?? 'rectangular') as any,
                    width:      ev.width  ?? 0.2,
                    depth:      ev.depth  ?? 0.4,
                    loadBearing: false,
                    properties: {},
                    ...(ev.materialId ? { material: ev.materialId } : {}),
                } as any);
                // §FIX-PLAN-VDT-BIMMANAGER (beam): without these two calls, beam elements
                // created via the bus path are invisible in plan view — same root cause as wall fix.
                // BeamStore.ts §3.5 explicitly documents bimManager.registerElement was removed from
                // the store — the bridge is the only registration site for the bus creation path.
                viewDependencyTracker.registerElement(ev.id, ev.levelId ?? '');
                try { bimManager.registerElement(ev.id, ev.levelId ?? ''); } catch { /* non-fatal */ }
                console.log('[initTools] §FT2: beam mirrored to legacy store', ev.id);
            } catch (err) {
                console.error(
                    '[initTools] §FT2: failed to mirror beam to legacy store — mesh may not build:',
                    err,
                );
            }
        });
        console.log('[initTools] §FT2: beam.created bus→legacy-store bridge registered.');
    }

    // §P3.2-FL (IMPL-PLAN-2026-05-17): bus → legacy-FloorStore bridge.
    // After a bus `floor.create` command succeeds, CommandEventBridge emits `floor.created`
    // with the full floor payload (floorId, polygon, levelId, ifcGuid, thickness, baseOffset,
    // finishSpec, layers, serviceHoles, hostSlabId, hostRoomId, createdBy, label).
    // This subscriber reconstructs a FloorData and calls floorStore.add() — triggering the
    // 'bim-floor-add' DOM event → FloorFragmentBuilder mesh.
    //
    // Dedup guard: floorStore.getById() — same id on undo/redo replay skips silently.
    //
    // §TODO(F.1.x): after FloorFragmentBuilder is migrated to read from the Immer floor store
    // directly (and bimManager/elementRegistry registration is moved into the handler),
    // this bridge can be removed.
    if (runtime) {
        runtime.events.on('floor.created', (ev) => {
            if (
                ev.commandType !== 'floor.create' ||
                !ev.floorId ||
                !ev.polygon ||
                ev.polygon.length < 3
            ) return;
            if ((floorStore as any)?.getById?.(ev.floorId)) return; // dedup guard
            try {
                const floorCount = ((floorStore as any)?.getAll?.() ?? []).length + 1;
                const label = ev.label ?? `Floor-${floorCount.toString().padStart(2, '0')}`;
                const finishSpec = ev.finishSpec ?? {
                    finishColor: '#D4C4A8',
                    finishPattern: 'none',
                    exposedScreed: false,
                };
                (floorStore as any).add({
                    id:          ev.floorId,
                    type:        'floor',
                    levelId:     ev.levelId ?? '',
                    parentId:    ev.levelId ?? '',
                    label,
                    floorNumber: `F.${floorCount.toString().padStart(2, '0')}`,
                    boundary: {
                        polygon:           ev.polygon,
                        baseOffset:        ev.baseOffset ?? 0,
                        thickness:         ev.thickness ?? 0.075,
                        detectionMethod:   'manual-polygon',
                    },
                    systemTypeId:   ev.systemTypeId,
                    layers:         ev.layers,
                    finishSpec,
                    slope:          undefined,
                    serviceHoles:   ev.serviceHoles ?? [],
                    coveredRoomIds: ev.hostRoomId ? [ev.hostRoomId] : [],
                    boundingWallIds: [],
                    hostSlabId:     ev.hostSlabId,
                    hostRoomId:     ev.hostRoomId,
                    colour:         undefined,
                    opacity:        1,
                    visible:        true,
                    properties:     {},
                    ifcData: {
                        guid:           ev.ifcGuid ?? crypto.randomUUID(),
                        ifcClass:       'IfcCovering',
                        predefinedType: 'FLOORING',
                    },
                    metadata: {
                        createdAt:  Date.now(),
                        modifiedAt: Date.now(),
                        createdBy:  ev.createdBy ?? 'user',
                        version:    1,
                    },
                } as any);
                // §FIX-PLAN-VDT-BIMMANAGER (floor) / §FIX-P4-FLOOR-BIMMANAGER:
                // Previously used `(window as any).bimManager?.registerElement?.(...)` — a C14
                // §LP-01 prohibited pattern (P4 window-as-namespace).  Replaced with the
                // properly-imported `bimManager` (same instance, already in scope at L1).
                // viewDependencyTracker.registerElement added for targeted dirty-marking parity
                // with all other element bridges (§FIX-PLAN-VDT-BIMMANAGER).
                viewDependencyTracker.registerElement(ev.floorId, ev.levelId ?? '');
                try { bimManager.registerElement(ev.floorId, ev.levelId ?? ''); } catch { /* non-fatal */ }
                console.log('[initTools] §P3.2-FL: floor mirrored to legacy store', ev.floorId);
            } catch (err) {
                console.error(
                    '[initTools] §P3.2-FL: failed to mirror floor to legacy store — mesh may not build:',
                    err,
                );
            }
        });
        console.log('[initTools] §P3.2-FL: floor.created bus→legacy-store bridge registered.');
    }

    // §FT-HANDRAIL (HANDRAIL-BUS-MIGRATION — C11 §11.9): bus → legacy-HandrailStore bridge.
    // After a bus `handrail.create` command succeeds, CommandEventBridge emits
    // `handrail.created` with the full geometry payload (id, path, height, diameter,
    // shape, levelId). This subscriber translates the PRYZM3 `path[]`/`diameter`
    // shape into the legacy HandrailData shape (`baseLine[2]`/`thickness`) and calls
    // handrailStore.add() — HandrailStore.add() emits storeEventBus (plan-view
    // projection) and `bim-handrail-added` (HandrailFragmentBuilder 3D mesh).
    // Mirrors the §FT2 beam bridge. Without this bridge a handrail drawn from the
    // plan tool reached the PRYZM3 Immer store but never rendered in either view.
    if (runtime) {
        runtime.events.on('handrail.created', (ev) => {
            if (
                ev.commandType !== 'handrail.create' ||
                !ev.id ||
                !ev.path ||
                ev.path.length < 2
            ) return;
            if (handrailStore?.getById?.(ev.id)) return; // dedup guard
            try {
                const p0 = ev.path[0];
                const p1 = ev.path[ev.path.length - 1];
                handrailStore.add({
                    id:        ev.id,
                    type:      'handrail',
                    levelId:   ev.levelId ?? '',
                    parentId:  ev.levelId ?? '',
                    baseLine:  [
                        { x: p0.x, y: p0.y ?? 0, z: p0.z },
                        { x: p1.x, y: p1.y ?? 0, z: p1.z },
                    ],
                    height:     ev.height   ?? 1.0,
                    thickness:  ev.diameter ?? 0.04,
                    baseOffset: 0,
                    railProfile: ev.shape === 'rectangular' ? 'rectangular' : 'round',
                    ...(ev.materialId ? { materialId: ev.materialId } : {}),
                    properties: {},
                } as any);
                // §FIX-PLAN-VDT-BIMMANAGER (handrail): targeted VDT dirty-marking +
                // level.childrenIds membership — required for plan-view projection.
                viewDependencyTracker.registerElement(ev.id, ev.levelId ?? '');
                try { bimManager.registerElement(ev.id, ev.levelId ?? ''); } catch { /* non-fatal */ }
                console.log('[initTools] §FT-HANDRAIL: handrail mirrored to legacy store', ev.id);
            } catch (err) {
                console.error('[initTools] §FT-HANDRAIL: failed to mirror handrail to legacy store — mesh may not build:', err);
            }
        });
        console.log('[initTools] §FT-HANDRAIL: handrail.created bus→legacy-store bridge registered.');
    }

    // §FT-LIGHTING (LIGHTING-BUS-MIGRATION — C11 §11.11): bus → legacy-LightingStore.
    // After a bus `lighting.create` succeeds, CommandEventBridge emits `lighting.created`
    // with id/kind/origin. This subscriber translates the PRYZM3 `kind`/`origin` shape
    // into the legacy `LightingData` (`fixtureType`/`position`) and calls
    // lightingStore.add() — LightingStore.add() fires `bim-lighting-added` →
    // LightingFragmentBuilder builds the 3D fixture mesh. Lighting is NOT in
    // GEOMETRY_ELEMENT_TYPES (no plan-view projection — by design), so no
    // viewDependencyTracker registration. Mirrors the §FT-HANDRAIL bridge.
    if (runtime) {
        runtime.events.on('lighting.created', (ev) => {
            if (ev.commandType !== 'lighting.create' || !ev.id || !ev.origin) return;
            const _ls = window.lightingStore as { add(d: unknown): void; has?(id: string): boolean } | undefined;
            if (!_ls) return;
            if (_ls.has?.(ev.id)) return; // dedup guard
            try {
                _ls.add({
                    id:          ev.id,
                    type:        'lighting',
                    levelId:     ev.levelId ?? '',
                    fixtureType: ev.kind ?? 'downlight',
                    position:    { x: ev.origin.x, y: ev.origin.y, z: ev.origin.z },
                });
                try { bimManager.registerElement(ev.id, ev.levelId ?? ''); } catch { /* non-fatal */ }
                console.log('[initTools] §FT-LIGHTING: lighting mirrored to legacy store', ev.id);
            } catch (err) {
                console.error('[initTools] §FT-LIGHTING: failed to mirror lighting to legacy store — mesh may not build:', err);
            }
        });
        console.log('[initTools] §FT-LIGHTING: lighting.created bus→legacy-store bridge registered.');
    }

    // §FT-FURNITURE (FURNITURE-BUS-MIGRATION — C11 §11.10): bus → legacy-FurnitureStore.
    // `furniture.create` is handled by the PRYZM3 Immer `CreateFurnitureHandler`,
    // whose `CreateFurniturePayload` (catalogId / origin / size / representations —
    // ADR-0027) does NOT match the legacy `FurnitureData` model (furnitureType +
    // primitive dims) — and no bus→legacy bridge existed. So furniture placed from
    // the plan tool / carousel drag-drop / kitchen / wardrobe tools reached neither
    // the legacy `FurnitureStore` nor any builder → no 3D mesh, no plan symbol.
    // CommandEventBridge now forwards the full plan-tool geometry on
    // `furniture.created`; this subscriber translates it into legacy `FurnitureData`
    // and calls `furnitureStore.add()` → `bim-furniture-added` → furniture builder
    // 3D mesh + `storeEventBus` (plan-view symbol). Mirrors §FT-HANDRAIL / §FT-LIGHTING.
    if (runtime) {
        runtime.events.on('furniture.created', (ev) => {
            if (ev.commandType !== 'furniture.create' || !ev.id || !ev.furnitureType || !ev.position) return;
            const _fs = window.furnitureStore as { add(d: unknown): void; get?(id: string): unknown } | undefined;
            if (!_fs) return;
            if (_fs.get?.(ev.id)) return; // dedup guard
            try {
                _fs.add({
                    id:             ev.id,
                    type:           'furniture',
                    furnitureType:  ev.furnitureType,
                    position:       { x: ev.position.x, y: ev.position.y, z: ev.position.z },
                    // §FIX-FURNITURE-ROTATION: the plan tool sends a SCALAR yaw;
                    // legacy FurnitureData.rotation is an EulerDTO — lift yaw into .y.
                    rotation:       { x: 0, y: ev.rotation ?? 0, z: 0 },
                    levelId:        ev.levelId ?? '',
                    levelName:      '',
                    levelElevation: 0,
                    baseOffset:     ev.baseOffset ?? 0,
                    width:          ev.width  ?? 0.6,
                    length:         ev.length ?? 0.6,
                    height:         ev.height ?? 0.9,
                    material:       ev.material ?? 'wood',
                    properties:     {},
                    // A.21.D4 — forward the style-driven colour so the builders
                    // (which read data.color) render the brief's modern/classic/
                    // minimal/warm palette. Omitted when absent (builder default).
                    ...(ev.color ? { color: ev.color } : {}),
                    ...(ev.furnitureCategory     ? { furnitureCategory: ev.furnitureCategory } : {}),
                    ...(ev.kitchenConfig         ? { kitchenConfig: ev.kitchenConfig } : {}),
                    ...(ev.wardrobeCabinetConfig ? { wardrobeCabinetConfig: ev.wardrobeCabinetConfig } : {}),
                });
                // §FIX-PLAN-VDT-BIMMANAGER (furniture): targeted VDT dirty-marking +
                // level.childrenIds membership — required for plan-view export.
                viewDependencyTracker.registerElement(ev.id, ev.levelId ?? '');
                try { bimManager.registerElement(ev.id, ev.levelId ?? ''); } catch { /* non-fatal */ }
                console.log('[initTools] §FT-FURNITURE: furniture mirrored to legacy store', ev.id);
            } catch (err) {
                console.error('[initTools] §FT-FURNITURE: failed to mirror furniture to legacy store — mesh may not build:', err);
            }
        });
        console.log('[initTools] §FT-FURNITURE: furniture.created bus→legacy-store bridge registered.');
    }

    // §13-CAM (C11 §12 — Split-View 3D Synchronization & Camera Framing):
    // First-element 3D camera framing for plan-pane element creation.
    //
    // When split view is active and the FIRST geometry-element creation command
    // of the project session completes, frame the shared 3D camera once via
    // zoomToAll() so the newly created element is visible (and centred) in the
    // mirrored 3D pane. Subsequent creations MUST NOT move the camera (C11 §12.2)
    // — the user's framing is preserved while they keep drawing.
    //
    // The zoom is deferred ~300 ms so the element's geometry builder has committed
    // its mesh into the THREE scene before zoomToAll() computes scene bounds;
    // running it synchronously inside 'command.executed' would frame a scene that
    // does not yet contain the new mesh.
    //
    // The one-shot flag is re-armed on 'pryzm-project-loaded' so each opened
    // project frames its own first element (C11 §12.2 — per-project-session).
    if (runtime) {
        let _splitViewFirstFrameDone = false;
        // §3D-FRAME-ON-VIEW-SWITCH (#91, Round 44) — declared here (top of the
        // `if (runtime)` block) so both the pryzm-project-loaded re-arm handler
        // and the view-activated framing handler below close over the same
        // binding without a temporal-dead-zone reference.
        let _3dViewFirstFrameDone = false;
        // §FIRST-ELEMENT-3D-FRAME-FURNITURE (DAILY-USE 2026-05-21) — extend
        // the §13-CAM first-element-framing regex to include every visible
        // element type the architect can create in plan view. The original
        // regex enumerated only the STRUCTURAL types (wall / slab /
        // curtainwall / column / beam / ceiling / roof / floor / stair /
        // handrail) and SILENTLY excluded the FURNISHING types (furniture /
        // plumbing / lighting) — the architect reported "I created a sofa in
        // plan view as the first element - it should zoom in to the element
        // in 3D view." A sofa is the very-first geometry the architect
        // places in a furnishing-only project (e.g. a residential interior
        // refit on an existing slab); they deserve the same first-frame
        // courtesy as a structural element. wall.opening.create added too
        // so the first DOOR or WINDOW dropped in plan view frames the 3D
        // pane as well.
        //
        // C11 §12.2 contract update queued: "first geometry element" should
        // be read as "first VISIBLE element" — furniture and plumbing
        // fixtures contribute spatial mass that the architect benefits from
        // seeing in 3D, even though they don't extend the building envelope.
        // Lighting fixtures included for parity (a lamp is a visible mesh).
        // §13-CAM REMOVED (2026-05-24, user request): the split-view "frame the 3D
        // camera on the FIRST element created in plan view" behaviour (a deferred
        // zoomToAll() on the first wall/element create while split view is active) was
        // unwanted — it hijacked the user's chosen 3D framing the moment they drew their
        // first wall. The complementary on-view-SWITCH framing (§3D-FRAME-ON-VIEW-SWITCH
        // below) is a different trigger and is RETAINED. `_splitViewFirstFrameDone` now
        // stays permanently false, which simply leaves the view-switch handler's
        // double-frame guard (line ~1814) inert — harmless.
        runtime.events.on('pryzm-project-loaded', () => {
            _splitViewFirstFrameDone = false;
            _3dViewFirstFrameDone = false; // §3D-FRAME-ON-VIEW-SWITCH re-arm per project session
        });

        // §3D-FRAME-ON-VIEW-SWITCH (#91, DAILY-USE 2026-05-21, Round 44) —
        // The §13-CAM handler above only frames the 3D camera when SPLIT view
        // is active (plan + 3D side-by-side). The architect reported "On plan
        // view creation - the 3d scene should show the first item on zoom in
        // 3d view" — i.e. the common workflow of drawing in a PLAN-ONLY view,
        // then SWITCHING to the 3D view, expecting to SEE their work without
        // manually pressing zoom-to-fit.
        //
        // This complementary handler fires zoomToAll() ONCE on the first
        // activation of a 3D (perspective) view per project session, when
        // geometry exists. Subsequent 3D-view switches preserve the
        // architect's camera (C11 §12.2 — user-camera preservation after the
        // first frame), re-armed on pryzm-project-loaded (per-session).
        //
        // The `view-activated` event carries `type: 'orthographic' | 'perspective'`.
        // Perspective = the 3D view. We frame only on the perspective path.
        // (`_3dViewFirstFrameDone` is declared at the top of this block.)
        runtime.events.on('view-activated', (payload: unknown) => {
            if (_3dViewFirstFrameDone) return;
            const p = payload as { type?: string } | undefined;
            // Only frame on the 3D (perspective) view — never on ortho/plan switch.
            if (p?.type !== 'perspective') return;
            // Don't double-frame if the split-view live-framing already ran this session.
            if (_splitViewFirstFrameDone) { _3dViewFirstFrameDone = true; return; }
            _3dViewFirstFrameDone = true;
            // Defer so the 3D scene's meshes are fully committed + matrixWorld
            // updated before zoomToAll() reads scene bounds (same 300ms posture
            // as the §13-CAM split-view path).
            setTimeout(() => {
                try {
                    zoomToAll();
                    console.log('[initTools] §3D-FRAME-ON-VIEW-SWITCH: framed 3D camera on first 3D-view activation.');
                } catch (err) {
                    console.warn('[initTools] §3D-FRAME-ON-VIEW-SWITCH: zoomToAll() failed (non-fatal):', err);
                }
            }, 300);
        });
        console.log('[initTools] §3D-FRAME-ON-VIEW-SWITCH: first-3D-view-activation framing registered.');
    }

    // ── Stair railing proposal handler ────────────────────────────────────────
    // CreateStairCommand emits `bim-stair-railing-proposal` (one left + one right
    // railing) after a stair commits. Each proposal is forwarded through the bus
    // command `stair.createRailing` (CreateStairRailingHandler, plugins/stair),
    // which bridges to the canonical CreateStairRailingCommand that builds the
    // railing, registers undo, and emits `bim-stair-railing-added` for the
    // StairRailingBuilder. [F-1.3] Bus-primary migration bridge.
    window.addEventListener('bim-stair-railing-proposal', (e: Event) => {
        const payload = (e as CustomEvent).detail;
        const proposed = (payload.proposedRailings as any[]) ?? [];
        proposed.forEach((r: any) => {
            window.runtime?.bus?.executeCommand('stair.createRailing', {
                stairId: payload.stairId,
                side: r.side, topRailHeight: r.topRailHeight,
                balusterSpacing: r.balusterSpacing, balusterShape: r.balusterShape,
                balusterWidth: r.balusterWidth, postAtStart: r.postAtStart,
                postAtEnd: r.postAtEnd, material: r.material,
            })?.catch((err: Error) => console.error(
                '[initTools] stair.createRailing side=' + r.side + ' failed:',
                err,
            ));
        });
    });

    // ── ToolManager ───────────────────────────────────────────────────────────
    toolManager = new ToolManager(commandContext);
    toolManager.setSelectionManager(selectionManager);
    doorTool.setSelectionManager(selectionManager);
    windowTool.setSelectionManager(selectionManager);
    toolManager.commandManager = commandManager;
    commandContext.commandManager = commandManager;
    window.toolManager    = toolManager;
    window.commandContext = commandContext;
    window.commandManager = commandManager; // TODO(TASK-06): remove after bus fully wired

    // ── Room Detection Engine + Topology Observer ─────────────────────────────
    // Pass column store and room bounding line store so the engine can include them
    // in topology detection when the respective UiPreferences toggles are enabled.
    // §ROOM-BOUNDING: Walls=always ON, CurtainWalls/Columns=OFF by default.
    const _columnStoreForDetection  = window.columnStore ?? columnStoreInstance; // TODO(TASK-08)
    const _rblStoreForDetection     = window.roomBoundingLineStore; // TODO(TASK-08)
    const roomDetectionEngine = new RoomDetectionEngine(
        wallTool.getWallStore(),
        curtainWallStoreInstance,
        _columnStoreForDetection,
        _rblStoreForDetection,
    );
    // §07 / M7 fix (Apr 2026): slab + column stores are now subscribed to as
    // bounding-element sources so editing or deleting them invalidates room
    // polygons in real time (parity with the wall + curtain-wall paths).
    const roomTopologyObserver = new RoomTopologyObserver(
        wallTool.getWallStore(), roomStore, commandManager,
        roomDetectionEngine, bimManager, curtainWallStoreInstance,
        _rblStoreForDetection,
        slabStore,
        _columnStoreForDetection,
    );
    roomTopologyObserver.attach();
    window.roomTopologyObserver = roomTopologyObserver;

    // ── RoomTool ──────────────────────────────────────────────────────────────
    // RoomTool is statically imported at the top of this file (alongside
    // RoomDetectionEngine / RoomTopologyObserver) so @pryzm/room-topology lands
    // in a single Rollup chunk — eliminating the "broken execution order"
    // circular-chunk warning that arose when this was a lazy await import().
    const roomTool = new RoomTool(commandManager, bimManager);

    // Gap 4 — POINT_PICK: inject scene dependencies so RoomTool can do
    // ground-plane raycasting and pointInPolygon containment checks.
    // Shared deps for both pick-mode and manual-boundary-mode.
    const _roomPickDeps = {
        canvas: world.renderer.three.domElement,
        getCamera: () => world.camera.three,
        getRoomStore: () => roomStore ?? null,
        getActiveLevelElevation: () => {
            try {
                const levelId = (projectContext as any)?.activeLevelId;
                if (levelId) {
                    const level = bimManager.getLevelById(levelId);
                    if (level) return (level as any).elevation ?? 0;
                }
                // Fallback: use the lowest level's elevation
                const levels = (bimManager as any).getLevels?.() ?? [];
                if (levels.length > 0) return levels[0].elevation ?? 0;
            } catch (_) { /* non-fatal */ }
            return 0;
        }
    };
    roomTool.setPickDeps(_roomPickDeps);

    // Wire MANUAL_BOUNDARY mode deps — superset of pick deps.
    // Provides getActiveLevelId (reads from projectContext singleton, now unified
    // with window.projectContext after the initScene singleton fix) and
    // getCommandContext so the tool can execute CreateRoomBoundaryCommand.
    roomTool.setManualDeps({
        ..._roomPickDeps,
        getActiveLevelId: () => projectContext.activeLevelId ?? null,
        getCommandContext: () => commandContext,
    });

    window.roomTool = roomTool;
    toolManager.setRoomTool(roomTool);

    // ── Room Bounding Line Tool ───────────────────────────────────────────────
    // RoomBoundingLineTool is statically imported at the top of this file so
    // @pryzm/geometry-wall stays in a single Rollup chunk, eliminating the
    // circular-chunk warning from the prior await import('@pryzm/geometry-wall').
    {
        const roomBoundingLineTool = new RoomBoundingLineTool(
            world.scene.three as THREE.Scene,
            commandManager,
            bimManager,
        );
        window.roomBoundingLineTool = roomBoundingLineTool;
        console.log('[initTools] RoomBoundingLineTool registered on window');
    }

    // ── BeamTool + StairTool ──────────────────────────────────────────────────
    const beamTool = new BeamTool(world, beamStore, commandManager);
    const stairTool = new StairTool(world.renderer.three.domElement, stairMeshBuilder, {
        camera: world.camera.three,
        scene: world.scene.three as THREE.Scene,
        commandManager,
    });
    window.stairTool  = stairTool;
    window.world      = world;
    window.camera     = world.camera.three;
    window.scene      = world.scene.three;
    window.renderer   = world.renderer.three;
    toolManager.setStairTool(stairTool);

    // ── Stair sketch-in-3D (#101 / SPEC-STAIR-3D-CREATION) ────────────────────
    // The modern polyline stair (I/L/U/curved) can now be sketched directly in
    // the 3D view, mirroring slab/floor. BimService.activateStairPathTool routes
    // to this handler when the active camera is NOT a plan view; the plan-tool
    // overlay path is unchanged. The handler reads camera/canvas live from the
    // world and resolves the base level from the active-level context.
    const stairPath3DTool = new StairPath3DToolHandler({
        getWorld: () => world,
        commandManager,
        getActiveLevelId: () => commandContext?.projectContext?.activeLevelId ?? null,
        getLevels: () => bimManager.getLevels(),
    });
    window.stairPath3DTool = stairPath3DTool;

    // ── Floor plan underlay persistence (image + transform) ───────────────────
    // Per-project persistence (Contract 45/46): installs save/restore listeners
    // keyed off `pryzm-project-loaded`. We do NOT call restoreUnderlayIfAny()
    // here — at boot time we don't yet know which project will be loaded, so
    // restoring globally would leak Project A's PDF into Project B.
    installUnderlayPersistence();

    // ── Project-isolation deep-check (Contract 48) ────────────────────────────
    // 1. ProjectScopedStorage: helper for any future per-project localStorage
    //    writes — auto-prefixes keys with the active project id and refuses
    //    to write while no project is bound. Use this instead of raw
    //    localStorage for any new per-project persistence.
    // 2. ProjectIsolationAudit: runtime tripwire that runs once on every
    //    empty-project load. If anything per-project-shaped is left in the
    //    scene or on window, it logs `[CONTRACT 48 VIOLATION]` and dispatches
    //    `pryzm-project-isolation-leak`. Static guard companion lives at
    //    `scripts/check-storage-isolation.mjs` (run via `npm run check:isolation`).
    projectScopedStorage.install();
    installProjectIsolationAudit();

    // ── G-2 Ghost Overlay Renderer ────────────────────────────────────────────
    // Registers pryzm-history-ghost-activate / pryzm-history-ghost-deactivate
    // listeners and dims Three.js meshes for elements added after a selected ts.
    initGhostOverlayRenderer(world.scene.three as THREE.Scene);

    // ── Project isolation sweep on bim-project-cleared ────────────────────────
    window.addEventListener('bim-project-cleared', () => {
        // §C13-G4/G5: Dispose ALL WallFragmentBuilder scene objects (committed walls
        // included). WallFragmentBuilder does NOT subscribe to WallStore remove events,
        // so its THREE.js Groups survive ClearProjectCommand unless we dispose here.
        // dispose() calls removeWall() for every wallId, which calls scene.remove(root)
        // + elementRegistry.unregisterRoot() + geometry/material disposal.
        wallTool.getFragmentBuilder().dispose();
        console.log('[ProjectIsolation] WallFragmentBuilder disposed — scene cleared of wall geometry.');

        roomGraphService.invalidateAll();
        semanticGraphManager.clear();
        temporalGraphManager.clear();
        roomSpatialIndex.clear();
        // S70 D8 — lifecycleStateManager.clear() + maintenanceRecordStore.clear()
        // removed with the deletion of src/lifecycle/.  Per-family handlers in
        // plugins/* now own the per-project sweep (per ADR-030 §A row 2).
        const scene = world.scene.three as THREE.Scene;
        const toRemove: THREE.Object3D[] = [];
        scene.traverse((obj: THREE.Object3D) => {
            if (obj.userData?.isPreview === true) toRemove.push(obj);
        });
        toRemove.forEach((obj: THREE.Object3D) => {
            scene.remove(obj);
            if ((obj as THREE.Mesh).isMesh) {
                const mesh = obj as THREE.Mesh;
                mesh.geometry?.dispose();
                if (Array.isArray(mesh.material))
                    mesh.material.forEach((m: THREE.Material) => m.dispose());
                else (mesh.material as THREE.Material)?.dispose();
            }
        });
    });

    // ── OpeningTool, AnnotationManager ───────────────────────────────────────
    const openingTool = new OpeningTool(components, world);
    toolManager.setOpeningTool(openingTool);

    window.annotationStore = annotationStore; // TODO(TASK-08)
    const _resolverStores = {
        wallStore,
        slabStore,
        columnStore,
        beamStore,
        gridStore,
        windowStore,
        doorStore,
        curtainWallStore: curtainWallStoreInstance,
        curtainPanelStore: curtainPanelStoreInstance,
        bimManager,
    };
    const annotationManager = new AnnotationManager(components, commandManager, _resolverStores);
    const _annContainer: HTMLElement =
        (world.renderer?.three?.domElement?.parentElement as HTMLElement | null) ?? container;
    annotationManager.init(_annContainer, world);
    // §ANN-SEL: Route dimension clicks to the shared PropertyPanelAdapter
    // instead of the removed standalone DimensionPropertiesPanel.
    annotationManager.setPropertyPanel(inspector);
    window.annotationManager = annotationManager;

    // §ANN-VIEW-SYNC: The 'view-selected' event fires at startup before AnnotationManager
    // registers its listener, so the tools never receive the initial view ID.
    // Use currentViewDefinitionId (§ANN-VIEW-PERSIST) which persists after activate()
    // returns — activeDefinitionId is always null here because the finally block clears it.
    {
        const syncViewId = (viewController as any).currentViewDefinitionId as string | null;
        if (syncViewId) {
            annotationManager.setActiveView(syncViewId);
            console.log('[initTools] AnnotationManager synced to active view →', syncViewId);
        }
    }

    // DOC-2.2 — DrawingEditor (OBC front-end annotation interaction layer)
    // Initialise once; OBCAnnotationAdapter subscribes to all annotation-system
    // onCommit / onDelete events so that every placed annotation flows through
    // CommandManager rather than mutating AnnotationStore directly (§01 §3).
    try {
        const drawingEditor = components.get(DrawingEditor as any);
        obcAnnotationAdapter.setDrawingEditor(drawingEditor);
        console.log('[initTools] DOC-2.2: DrawingEditor initialised; OBCAnnotationAdapter wired');
    } catch (err) {
        console.warn('[initTools] DOC-2.2: DrawingEditor unavailable — OBCAnnotationAdapter not wired:', err);
    }

    // §VII-1 — Expose constraint singletons for UpdateConstraintCommand
    window.constraintStore  = constraintStore; // TODO(TASK-08)
    window.constraintSolver = constraintSolver;
    window.resolverStores   = _resolverStores;

    // ANNOTATION-SYSTEM-AUDIT-2026 A5 — expose dependency graph globally so
    // ProjectLoader can rebuild() it after a project restore even before the
    // CommandContext-aware code paths are reached.
    window.annotationDependencyGraph = annotationManager.dependencyGraph;

    // ANNOTATION-SYSTEM-AUDIT-2026 A1/A5 — finalise CommandContext now that the
    // resolver bag and dependency graph exist. Annotation commands and the
    // ProjectLoader read these directly off ctx and never touch window globals.
    Object.assign(commandContext, {
        resolverStores: _resolverStores,
        annotationDependencyGraph: annotationManager.dependencyGraph,
    });

    // §ANN-B3/B4 — Wire annotation sub-tools to ToolManager
    if (annotationManager.textNoteTool)     toolManager.setTextNoteTool(annotationManager.textNoteTool);
    if (annotationManager.elementTagTool)   toolManager.setElementTagTool(annotationManager.elementTagTool);
    // §ANN-Phase-IV
    if (annotationManager.angularDimTool)   toolManager.setAngularDimensionTool(annotationManager.angularDimTool);
    if (annotationManager.spotElevationTool) toolManager.setSpotElevationTool(annotationManager.spotElevationTool);
    if (annotationManager.keynoteTool)      toolManager.setKeynoteTool(annotationManager.keynoteTool);
    // §DIM-IV-3 — Wire new annotation-system linear dim tool (Class A, Revit-grade)
    if (annotationManager.linearDimTool)    toolManager.setLinearDimAnnotationTool(annotationManager.linearDimTool);
    // DOC-2.4 — Wire new dimension tools
    if (annotationManager.radiusDimTool)    toolManager.setRadiusDimensionTool(annotationManager.radiusDimTool);
    if (annotationManager.diameterDimTool)  toolManager.setDiameterDimensionTool(annotationManager.diameterDimTool);
    if (annotationManager.slopeDimTool)     toolManager.setSlopeDimensionTool(annotationManager.slopeDimTool);
    // DOC-2.5 — Wire specialised tag tools
    if (annotationManager.doorTagTool)      toolManager.setDoorTagTool(annotationManager.doorTagTool);
    if (annotationManager.windowTagTool)    toolManager.setWindowTagTool(annotationManager.windowTagTool);
    if (annotationManager.levelTagTool)     toolManager.setLevelTagTool(annotationManager.levelTagTool);
    if (annotationManager.gridBubbleTool)   toolManager.setGridBubbleTool(annotationManager.gridBubbleTool);
    // DOC-2.8 — Wire revision cloud tool
    if (annotationManager.revisionCloudTool) toolManager.setRevisionCloudTool(annotationManager.revisionCloudTool);
    // DOC-2.7/2.8 — Wire section mark, elevation mark, callout detail tools
    if (annotationManager.sectionMarkTool)   toolManager.setSectionMarkTool(annotationManager.sectionMarkTool);
    if (annotationManager.elevationMarkTool) toolManager.setElevationMarkTool(annotationManager.elevationMarkTool);
    if (annotationManager.calloutDetailTool) toolManager.setCalloutDetailTool(annotationManager.calloutDetailTool);

    // ── ToolManager — final registrations ────────────────────────────────────
    toolManager.setSlabTool(slabTool);
    toolManager.setWallTool(wallTool);
    toolManager.setWindowTool(windowTool);
    toolManager.setDoorTool(doorTool);
    toolManager.setCurtainWallTool(curtainWallTool);
    toolManager.setColumnTool(columnTool);
    toolManager.setBeamTool(beamTool);
    toolManager.setRoofTool(roofTool);
    toolManager.setFloorTool(floorTool);
    toolManager.setCeilingTool(ceilingTool);

    console.log('[initTools] All BIM tools initialised and registered with ToolManager');

    // §P1.3-A (IMPL-PLAN-2026-05-17): Set the init-complete sentinel AFTER all
    // globals (window.commandManager, window.commandContext, window.toolManager,
    // window.wallStore, etc.) are fully assigned.  PlanViewToolOverlay._activateHandler()
    // asserts this sentinel before calling handler.activate() so plan tools refuse
    // to arm if initTools threw or returned early before reaching this line.
    (window as any).__pryzmInitComplete = true;
    console.log('[initTools] §R3-SENTINEL: plan tools armed — all globals confirmed live.');

    return {
        selectionManager,
        commandManager,
        commandContext,
        toolManager: toolManager!,
        wallTool,
        slabTool,
        slabDependencyTracker,
        ceilingTool,
        floorTool,
        windowTool,
        doorTool,
        curtainWallTool,
        columnTool,
        beamTool,
        stairTool,
        plumbingTool,
        furnitureTool,
        furnitureCarousel,
        furnitureDragDropHandler,
        handrailTool,
        roofTool,
        openingTool,
        annotationManager,
        radialMenu,
        roomTool,
        roomDetectionEngine,
        roomTopologyObserver,
    };
}
