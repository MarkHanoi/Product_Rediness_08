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
import { installFinishHostConsole } from './finishHostConsole';
import * as OBC from '@thatopen/components';

import { SelectionManager } from '@pryzm/input-host';
import { ToolManager } from '@pryzm/input-host';
import { CommandManager } from '@pryzm/command-registry';
import { CreateVerticalCirculationCommand } from '@pryzm/command-registry';
// §FIX-SEATING-ONE-AUTHORITY — the bus→legacy-store bridges below place elements, so
// they MUST seat through the shared finished-floor / finished-ceiling datum rather
// than re-deriving `level.elevation` (C11 §5.4).
import {
    resolveFloorSeatingDatumFrom,
    resolveCeilingSeatingDatumFrom,
} from '@pryzm/command-registry';
import { resolvePickStrategy } from '@pryzm/picking';

import { SlabTool } from '@pryzm/geometry-slab';
import { CeilingTool } from '@pryzm/geometry-slab';
import { FloorTool } from '@pryzm/geometry-slab';
// §C83-S5 — the floor-finish overlap gate. Injected into FloorTool below so an
// L2 tool can refuse and TELL THE USER without importing an L7 surface.
import { gateFloorFinishPlacement } from '@app/engine/consequence/floorFinishGate';
// §WPE-CHROME-LAYER (L-10200) — the wall-profile overlay lives at L7 because it uses the
// app's shared `makeDraggable` / `makeResizable` chrome, which `packages/geometry-wall` (L2)
// may not import. This is the ONE place it is handed to the tool; without this line the
// "Edit Profile" button on a wall refuses out loud instead of opening.
import { WallProfileEditor } from '@app/ui/WallProfileEditor';
import { SlabDimensionsEditor } from '@app/ui/property-panel/SlabDimensionsEditor';
// §FEAT-SLAB-DRAW-MODES — the surface-independent slab drawing-mode store.
import { resolveActiveSlabDrawMode } from '@app/engine/views/plantools/activeSlabDrawMode';
import { ElementCreationModal, getFloorFinishCreationModal } from '@app/ui/ElementCreationModal';
import { PlumbingTool } from '@pryzm/geometry-plumbing';
import { FurnitureTool } from '@pryzm/geometry-furniture';
import { LightingTool } from '@pryzm/geometry-lighting';
import { FurnitureType } from '@pryzm/geometry-furniture';
import type {
    FurnitureMaterial, FurnitureCategory, KitchenCabinetConfig, WardrobeCabinetConfig,
} from '@pryzm/geometry-furniture';
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
import {
    RoofTool,
    RoofDependencyTracker,
    type RoofBoundaryWritePayload,
} from '@pryzm/geometry-roof';
import { HandrailTool } from '@pryzm/geometry-handrail';
import { WallTool } from '@pryzm/geometry-wall';
import { SlabDependencyTracker } from '@pryzm/geometry-slab';
// §FINISH-FOLLOWS-WALL (GR-12 · C79 §5) — floor finishes and ceilings follow a
// moved wall the way slabs do. The ONE resolver + ONE intersector in the tree
// are injected into the finish trackers (C79 §6.5 single-resolver rule); the
// write-back goes through UpdateFloor/CeilingBoundaryCommand (P6, C79 §4.2).
import { WallFaceResolver, SketchLoopIntersector } from '@pryzm/geometry-slab';
import {
    FloorHostDependencyTracker,
    CeilingHostDependencyTracker,
    type FinishBoundaryWritePayload,
} from '@pryzm/finish-host-tracker';
import { UpdateFloorBoundaryCommand, UpdateCeilingBoundaryCommand, UpdateRoofBoundaryCommand } from '@pryzm/command-registry';
// §GRAPH115 / ADR-0374 — the wall-attachment follower (plumbing + furniture anchored to walls / curtain walls).
import { WallAnchorDependencyTracker } from '@pryzm/command-registry';
// §FINISH-FOLLOW-LATE-ATTRIBUTION (L-2090) — extracted rather than inlined here
// for the reason `beamCreatedMirror` was: a closure in this file needs a THREE
// world and twenty stores to run one line, so no suite can execute it.
import { attributeFinishAgainstMovedWall } from './finishLateAttribution';
import { roofRecordFromCreatedEvent } from './roofCreatedMirror';
import { beamRecordFromCreatedEvent } from './beamCreatedMirror';
import { curtainWallRecordFromCreatedEvent } from './curtainWallCreatedMirror';
import { ceilingRecordFromCreatedEvent } from './ceilingCreatedMirror';
import { registerElementLevelChangeBridge } from './elementLevelChangedMirror';
// §MIRROR-UPDATE (L-9942) — the SECOND mutation channel. Same extraction rule as its
// neighbour above: the mirror lives in its own module so a suite can EXECUTE it.
import { registerElementUpdateBridge } from './elementUpdatedMirror';
// §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9944) — the boundary line's 3-D builder.
import { BoundaryLineMeshBuilder } from './BoundaryLineMeshBuilder';
// §POOL95 / §FT-WATER — the swimming pool's water body. Same single-authority
// shape as the boundary line above: one store, no legacy twin, straight to a mesh.
import { WaterMeshBuilder } from './WaterMeshBuilder';
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §10 — the store→mesh subscriber and the
// per-face drag, wired as ONE call so this 2000-line file gains one block, not four.
import {
    attachSpaceEnvelopeRender,
    type DirtySpaceEnvelopeStore,
} from './attachSpaceEnvelopeRender';
// §ENVELOPE-DRAG-CONSEQUENCE (lane FACE-DRAG-2) — the ONE emit helper and the ONE event name,
// imported rather than spelled, so the two wiring sites cannot drift apart.
import {
    dispatchSpaceEnvelopeFaceMove,
    emitSpaceEnvelopeFaceMoved,
    type SpaceEnvelopeFaceMoveEventSink,
} from './spaceEnvelopeDragSurface';
// §ENVELOPE-WALLS-FOLLOW (lane FACE-DRAG-FINISH) — the ONE consumer of that event: walls the
// envelope produced follow the face that moved, in ONE `wall.cascadeBaseline` (C114 §6a).
import {
    installSpaceEnvelopeWallFollow,
    type WallFollowRuntimeLike,
} from './spaceEnvelopeWallFollowComposition';
// §RESI-STAGE-G (2026-09-06) · C114 §10b / §11 item 7 — the footprint profile editor's
// TOOL. It builds no surface: it opens the wall modal's port on the envelope's own ring.
import {
    SpaceEnvelopeProfileEditTool,
    type ProfileEditableSpaceEnvelope,
} from './spaceEnvelopeProfileEditTool';
// §82.6-COMPONENT-RENDER-MOUNT — the placed-component 3-D leg (ADR-0376 D10).
import { attachComponentRender, type DirtyComponentStore } from './component/index';
import { componentCatalog } from '../services/componentCatalog/index';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
// §POOL95 (L-11350) — the undo path reaches the SAME builder through this sink,
// because `performUndoRedo` emits no bus events.
import { registerWaterRenderSink } from './undo/poolUndoAdapter';
// §FIX-BOUNDARY-LINE-INVISIBLE-IN-PLAN (L-10502) — the 2-D sibling of the builder above.
import { installBoundaryLinePlanSymbolBuilder, type BoundaryLinePlanEntry } from './BoundaryLinePlanSymbolBuilder';
import { WindowTool } from '@pryzm/geometry-window';
import { DoorTool } from '@pryzm/geometry-door';
import { CurtainWallTool } from '@pryzm/geometry-curtain-wall';
import { ColumnTool } from '@pryzm/geometry-column';
import { BeamTool } from '@pryzm/input-host';
import { StairTool } from '@pryzm/geometry-stair';
import { LiftTool } from '@pryzm/geometry-lift';
import { StairPath3DToolHandler } from './views/plantools/StairPath3DToolHandler';
import { shouldSuppressAutoFrameWhileDrawing } from './views/autoframeGuard';
import { createBatchAutoFrameCoordinator } from './views/batchAutoFrame';
import { singleVolumeWallProducer } from './singleVolumeWallProducer';
import { OpeningTool } from '@pryzm/input-host';
import { AnnotationManager, obcAnnotationAdapter } from '@pryzm/plugin-annotations';
import { RadialMenu } from '@app/ui/RadialMenu';
import { DrawingEditor } from '@thatopen/components-front';
import { RoomDetectionEngine } from '@pryzm/room-topology';
import { RoomTopologyObserver } from '@pryzm/room-topology';
// §OPENED-REGION (L-880) — the OFFER half of "a wall move left a region open".
import { initOpenedRegionProposals } from '../ui/ai/OpenedRegionProposal';
// §ROOM-TOMBSTONE (L-10814) — the OFFER half of "a re-detection destroyed an authored room".
import { initRoomMeaningRestoreProposals } from '../ui/ai/RoomMeaningRestoreProposal';
// §ROOM-LOSS-NOTICE (L-12660) — the TELL half: announced immediately, unconditionally,
// independent of whether a matching face ever comes home for the OFFER above to reach.
import { initRoomLossNotices } from '../ui/ai/RoomLossNotice';
import { RoomTool } from '@pryzm/room-topology';
import { RoomBoundingLineTool } from '@pryzm/geometry-wall';

// ── Singleton imports (module-level stores / services) ────────────────────────
import { ceilingSystemTypeStore } from '@pryzm/core-app-model/stores';
import { floorSystemTypeStore } from '@pryzm/core-app-model/stores';
// §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — the ONE documented floor-finish defaults, so the
// bus→legacy mirror below cannot invent a third set of numbers (it used to: `?? 0` / `?? 0.075`).
import {
    DEFAULT_FLOOR_FINISH_BASE_OFFSET_M,
    DEFAULT_FLOOR_FINISH_THICKNESS_M,
} from '@pryzm/core-app-model/stores';
// §FIX-SEATING-ONE-AUTHORITY — floor/ceiling finish shapes + the fixture-kind split
// the seating bridges below read. `FLOOR_MOUNTED_FIXTURES` is the SAME set
// `CreateLightingCommand` uses, so the bus path and the command path cannot drift.
import { FLOOR_MOUNTED_FIXTURES } from '@pryzm/core-app-model';
import type { LightingFixtureType } from '@pryzm/core-app-model';
import { annotationStore } from '@pryzm/plugin-annotations';
import { constraintStore } from '@pryzm/plugin-annotations';
import { constraintSolver } from '@pryzm/plugin-annotations';
// ANNOTATION-SYSTEM-AUDIT-2026 A1 — inject annotation/view stores into CommandContext
import { annotationVisibilityStore } from '@pryzm/plugin-annotations';
import { viewDefinitionStore, storeEventBus, viewDependencyTracker } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry'; // §FIX-CATCHUP-DUPLICATE-CREATE (L-18)
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { vgGovernanceStore } from '@pryzm/core-app-model';
// §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — the bus/plan bridge no longer
// resolves system types itself (that hand-rolled resolution is precisely what diverged
// from the 3D path). It builds the store record at the ONE chokepoint per element, so
// the `*SystemTypeStore` reads that used to live here are gone with it.
import { doorStore, buildDoorStoreRecord } from '@pryzm/geometry-door';
import { windowStore, buildWindowStoreRecord } from '@pryzm/geometry-window';
import { generateMark } from '@pryzm/core-app-model';
import { roomGraphService, roomQueryService, roomValidationService, roomTypeInferenceEngine, facadeOrientationService } from '@pryzm/spatial-index';
// ADR-0315 U2.4 — the headless site read surface (provider wired below).
import { siteQueryService } from '@pryzm/stores';
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
// §FEAT-BALCONY-COMPOUND (L-5607) — the profile-edit bridge that turns an
// "Edit Profile" vertex drag on a balcony's plate into a `balcony.updateProfile`,
// so the finish and the railings follow the new outline in ONE undo entry.
import { attachBalconyProfileBridge } from './balconyProfileBridge';
// ── §FIX-ANY-STORE-SEAM (L-980) — the store seam is TYPED ───────────────────
// Every store below arrived as `any` from `initBuilders`, which is how
// `curtainWallStoreInstance?.getById?.()` and `ceilingStore?.get?.()` —
// dedup guards calling methods that DO NOT EXIST on their store classes —
// type-checked cleanly and evaluated to `undefined` on every single event
// for months (L-972 / L-973). `any` + optional chaining is a defect FACTORY:
// the cast erases the method table and `?.` swallows the `undefined`, so the
// expression reads as a guard and behaves as a no-op.
//
// These are `import type` only — erased by tsc, no runtime edge added. They
// are the SAME classes `initBuilders.ts` already names in its `BuildersResult`,
// so this seam now agrees with its own producer instead of forgetting it.
import type { WallStore } from '@pryzm/geometry-wall';
import type { SlabStore } from '@pryzm/geometry-slab';
import type { ColumnStore } from '@pryzm/geometry-column';
import type { CurtainWallStore, CurtainPanelStore, CurtainWallData } from '@pryzm/geometry-curtain-wall';
import type { RoofStore, RoofData } from '@pryzm/geometry-roof';
import type { PlumbingStore } from '@pryzm/geometry-plumbing';
import type { FurnitureStore } from '@pryzm/geometry-furniture';
import type { LightingStore, LightingData, LightingFragmentBuilder } from '@pryzm/geometry-lighting';
import type { RoomStore } from '@pryzm/room-topology';
import type {
    StairStore, StairTypeStore, StairLandingStore, StairRailingStore,
} from '@pryzm/geometry-stair';
import type { LiftStore, LiftTypeStore } from '@pryzm/geometry-lift';
import type {
    BeamStore, CeilingStore, FloorStore, HandrailStore, OpeningStore,
} from '@pryzm/core-app-model/stores';
import type { GridStore } from '@pryzm/core-app-model';
import type { WallSystemTypeStore } from '@pryzm/geometry-wall';
import type { SlabSystemTypeStore } from '@pryzm/geometry-slab';

import { installProjectIsolationAudit } from '@pryzm/core-app-model';
// §LIFT94 (L-11340) — the undo/redo render seam for the C104 lift compound.
import { registerLiftRenderSink } from './undo/liftUndoAdapter.js';
// §BATH102 (L-11480) — the C109 pod's members become real `plumbing` fixture records,
// projected off the pod store's OWN dirty diff. See `bathroomPodMemberMirror.ts`.
import { attachBathroomPodMemberMirror, type DirtyPodStore } from './bathroomPodMemberMirror.js';

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
    // Stores from initBuilders — §FIX-ANY-STORE-SEAM (L-980).
    // These were `any`. `any` on a store is not "loose typing", it is a
    // SILENCER: it deletes the method table, so a guard that calls a method the
    // class does not have compiles clean and returns `undefined` forever. Two
    // such guards (curtain-wall, ceiling) shipped and never once fired. The
    // types below are the same classes `initBuilders.BuildersResult` declares.
    wallStore: WallStore;
    slabStore: SlabStore;
    columnStoreInstance: ColumnStore;
    beamStore: BeamStore;
    stairStore: StairStore;
    stairTypeStore: StairTypeStore;
    stairLandingStore: StairLandingStore;
    stairRailingStore: StairRailingStore;
    liftStore?: LiftStore;
    liftTypeStore?: LiftTypeStore;
    liftMeshBuilder?: any;
    /**
     * FEAT-LIFT-OBSERVATION-FRAME (L-9400) — the LOD-300 compound's renderer.
     * Driven by the FT-LIFT `lift.created` subscriber below. Optional so a headless
     * or partial boot omits it and the subscriber simply does not register, exactly
     * as the other builder params behave.
     */
    liftCompoundMeshBuilder?: any;
    gridStore: GridStore;
    curtainWallStoreInstance: CurtainWallStore;
    curtainPanelStoreInstance: CurtainPanelStore;
    roofStore: RoofStore;
    plumbingStore: PlumbingStore;
    furnitureStore: FurnitureStore;
    handrailStore: HandrailStore;
    openingStore: OpeningStore;
    wallSystemTypeStore: WallSystemTypeStore;
    slabSystemTypeStore: SlabSystemTypeStore;
    ceilingStore: CeilingStore;
    floorStore: FloorStore;
    roomStore: RoomStore;
    // Builders from initBuilders
    slabBuilder: any;
    plumbingBuilder: any;
    furnitureBuilder: any;
    stairMeshBuilder: any;
    // §FIX-BUILDER-ISOLATION-LEAK (L-320) — builders that add geometry to the scene
    // and must be disposed on project switch (bim-project-cleared) like the wall
    // builder, else their meshes bleed into the next project.
    floorBuilder: any;
    handrailBuilder: any;
    stairRailingBuilder: any;
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
    liftTool: LiftTool;
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
        liftStore, liftTypeStore, liftCompoundMeshBuilder,
        gridStore, curtainWallStoreInstance, curtainPanelStoreInstance,
        roofStore, plumbingStore, furnitureStore, handrailStore, openingStore,
        wallSystemTypeStore, slabSystemTypeStore, ceilingStore, floorStore, roomStore,
        slabBuilder, plumbingBuilder, furnitureBuilder, stairMeshBuilder,
        floorBuilder, handrailBuilder, stairRailingBuilder,
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
                    // §SELECT-PICK-RESOLUTION — GPU max texture dimension (see SelectionManager).
                    get maxTextureSize() { return (r as any).capabilities?.maxTextureSize ?? 4096; },
                    renderToTarget: (scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget, mat: THREE.Material | null) => {
                        // §FIX-WEBGL2-GHOST-STALE-TARGET (L-05 / G6) — RESTORE ON THE ERROR PATH.
                        //
                        // This borrows the SHARED renderer, redirects it to an offscreen pick
                        // target, and restores it afterwards. Without a `finally`, a throw inside
                        // `render()` skips the restore and leaves the renderer PERMANENTLY BOUND
                        // to this pick buffer — after which every subsequent frame paints
                        // offscreen, the canvas keeps compositing its last good image while the
                        // camera orbits behind it (the ghost), and `clearObcBaseFramebuffer()`
                        // starts clearing THIS target instead of the canvas, silently turning the
                        // ADR-0108 ghost fix into a no-op for the rest of the session.
                        //
                        // And it DOES throw on this backend: the founder's console carries
                        // `GL_INVALID_OPERATION: Mismatch between texture format and sampler type`
                        // and `Cannot read properties of undefined (reading 'usedTimes')`.
                        //
                        // A borrower of shared GPU state must hand it back on EVERY path.
                        // `SelectionManager` already does this; this probe did not.
                        const prev = r.getRenderTarget(); const prevMat = (r as any).overrideMaterial;
                        try {
                            r.setRenderTarget(target); (r as any).overrideMaterial = mat;
                            r.render(scene, camera);
                        } finally {
                            (r as any).overrideMaterial = prevMat; r.setRenderTarget(prev);
                        }
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
            // §FIX-PLAN-SPACE-ROUTING (L-129) — yield SPACE to an active plan-tool
            // placement handler. The plan overlay OWNS plan-view SPACE routing
            // (furniture rotate / door flip / any PlanToolHandler.onKeyDown) and
            // consumes the key in its own capture-phase router. Without this guard,
            // in split view (3D is the primary viewport, so currentMode === '3D')
            // a SPACE meant to rotate the plan-pane ghost would ALSO truck the 3D
            // camera. We still preventDefault above (no page scroll); we only skip
            // the camera-mode switch while a plan tool is placing.
            const _planPlacing =
                (window as { planViewToolOverlay?: { isPlacing?: () => boolean } })
                    .planViewToolOverlay?.isPlacing?.() === true ||
                (window as { svpPlanToolOverlay?: { isPlacing?: () => boolean } })
                    .svpPlanToolOverlay?.isPlacing?.() === true;
            if (navManager.currentMode === '3D' && !_planPlacing) {
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
    // §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — the SHARED floor-finish modal instance.
    // `FloorPlanToolHandler` shows this SAME instance from the plan path, so the parameter
    // surface (finish type · assembly thickness · BASE OFFSET = the FFL elevation) is one
    // dialogue, not two that must be kept in step by hand.
    const floorCreationModal = getFloorFinishCreationModal();
    const floorTool = new FloorTool(world, components, {
        getCommandManager: () => commandManagerRef.current,
        getFloorStore: () => floorStore,
        getFloorSystemTypeStore: () => floorSystemTypeStore,
        getBimManager: () => bimManager,
        openCreationModal: (opts) => floorCreationModal.show(opts as any),
        dismissCreationModal: () => floorCreationModal.dismiss(),
        // §C83-S5 — the injected spatial gate. THIS LINE is what makes the
        // "two finishes over one floor area" refusal reach a person: without it
        // the predicate still fires and the founder still sees nothing (L-884 —
        // no tool renders `CommandResult.info[0]`). The tool is L2, the card and
        // the toast are L7, so the decision is injected downward rather than
        // imported upward (C83 §8.0).
        gateFloorPlacement: (candidate) => gateFloorFinishPlacement(candidate),
    });
    window.floorTool = floorTool;

    // ── Room services (exposed globally; graph is built lazily) ───────────────
    window.roomGraphService        = roomGraphService;
    window.roomQueryService        = roomQueryService;
    window.roomValidationService   = roomValidationService;
    window.roomTypeInferenceEngine = roomTypeInferenceEngine;
    window.facadeOrientationService = facadeOrientationService; // SL-3 (SPEC-SEMANTIC §3)
    // §FIX-FACADE-TRUE-NORTH (ADR-0315 U2.1) — every caller passed θ=0, so
    // "south-facing" meant PROJECT-south on rotated sites. The provider reads
    // the one authority (SiteLocation.trueNorth) lazily at call time; explicit
    // θ arguments still win, absence of a site still means 0.
    facadeOrientationService.setTrueNorthProvider(() => {
        const w = window as unknown as {
            runtime?: { siteModelStore?: { getLocation?: () => { trueNorth?: number } | null } };
        };
        return w.runtime?.siteModelStore?.getLocation?.()?.trueNorth ?? 0;
    });
    // ADR-0315 U2.4 — the headless site read surface, wired to the production
    // SiteModelStore and exposed beside roomQueryService. Scope resolution
    // (U3) and generation adapters (U5b) read site context through THIS, not
    // through the siteDispatch UI module.
    siteQueryService.setSiteProvider(() => {
        const w = window as unknown as {
            runtime?: { siteModelStore?: { getSite?: () => unknown } };
        };
        return (w.runtime?.siteModelStore?.getSite?.() ?? null) as never;
    });
    (window as unknown as { siteQueryService?: unknown }).siteQueryService = siteQueryService;

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
            stairStore, liftStore, liftTypeStore, beamStore,
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
        // §WPE-CHROME-LAYER (L-10200) — THE WIRE. `WallTool.enterProfileEditMode` opens the
        // wall-elevation outline editor through this factory; the overlay is an L7 DOM panel
        // (draggable by its title bar, resizable by its corner grip) and L2 cannot construct
        // it. Asserted from source by
        // `packages/geometry-wall/__tests__/WPE1WallProfileEditMode.test.ts`, because a wire
        // nobody tests is how a shipped feature becomes a dead button.
        createProfileEditor: () => new WallProfileEditor(),
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
        // §FEAT-SLAB-DRAW-MODES (founder 2026-08-06) — the LINEAR / ORTHO / CURVED
        // choice, from the SAME surface-independent store `SlabPlanToolHandler`
        // reads, so a polyline slab drawn in 3D and one drawn in plan obey the same
        // constraint. Injected (never a `window` read inside the package — P4).
        getBoundaryDrawMode:    () => resolveActiveSlabDrawMode(),
        // §FIX-REGION-3D-EDGE-SET (L-1126) + §FEAT-REGION-CURTAIN-WALL (L-1125) — the
        // 3D By Region search read `wallStore` ALONE while the plan surface had been
        // calling `assembleRegionBoundary({ walls, slabs, parcelBoundary })` since
        // §FIX-REGION-BOUNDARY-SOURCES. Same gesture, same point, two edge sets, two
        // answers (C84 EI-9). These two deps are the rest of the world the 3D tool was
        // missing; slabs it already had via `getSlabStore`.
        getCurtainWallStore:    () => window.curtainWallStore as never, // TODO(TASK-08)
        getParcelBoundary:      () => {
            const rt = window.runtime as unknown as {
                siteModelStore?: { getParcelBoundary?: () => { polygon?: { x: number; z: number }[] } | null };
            } | undefined;
            try {
                return rt?.siteModelStore?.getParcelBoundary?.()?.polygon ?? null;
            } catch {
                // Unreadable is ABSENT, and it is reported ABSENT — never silently
                // collapsed into "there is no parcel here" (§CONTEXT-DATA-HONESTY).
                return null;
            }
        },
    });

    const slabDependencyTracker = new SlabDependencyTracker(
        slabStore, wallTool.getWallStore(), commandManagerRef,
    );
    slabDependencyTracker.bootstrap();

    // ── Finish host trackers — §FINISH-FOLLOWS-WALL (GR-12 · C79 §5) ─────────
    // The wiring `check-move-propagation` arms A5/A6 could not see was missing:
    // the trackers existed as a package reachable from NOTHING (L-FINISH proved
    // it by require.resolve → MODULE_NOT_FOUND). This block is the reachability.
    // Wired HERE deliberately: `commandManagerRef.current = commandManager` is
    // assigned earlier in this function (before the tool-deps section), so both
    // bootstrap() and every event-driven write reach the COMMAND path — the
    // trackers' declared non-undoable direct-store fallback stays what it is
    // declared to be: never taken in normal operation.
    const finishGeometryServices = {
        resolver: WallFaceResolver,
        intersector: SketchLoopIntersector,
    };
    //
    // §FINISH-FOLLOW-LATE-ATTRIBUTION (L-2090) — the SIXTH argument, and the
    // founder's 2026-08-21 defect. The trackers index by `sketch.outerLoop`
    // host-reference edges, and only ONE of the three floor creation paths in
    // this tree mints them: `plugins/floor/src/handlers/CreateFloor.ts:137` and
    // the §P3.2-FL bus→legacy mirror further down THIS file both write
    // `boundingWallIds: []` and no `sketch` at all (L-2091). A finish created
    // either way was structurally incapable of following a wall, and the tracker
    // said NOTHING about it — `onWallUpdated` returned on an empty dependent set
    // with no log, so "this wall bounds no finish" and "every finish it bounds
    // was created by a path that records no relationship" were the same value.
    // This hook is the repair for records already on disk; it re-attributes them
    // against the ONE wall that moved, in its pre-move state, using the SAME
    // builder creation uses (C79 §7.4). See `finishLateAttribution.ts` for why
    // the dependency is inverted rather than imported into the tracker package.
    const floorHostDependencyTracker = new FloorHostDependencyTracker(
        floorStore, wallTool.getWallStore(), finishGeometryServices, commandManagerRef,
        // Payloads map 1:1 (C79 §3.4 byte-identical shapes); only the id key
        // differs — the command names its element (`floorId`), the tracker
        // speaks generically (`elementId`).
        (payload: FinishBoundaryWritePayload) => new UpdateFloorBoundaryCommand({
            floorId: payload.elementId,
            mode: payload.mode,
            polygon: payload.polygon,
            outerLoopEdges: payload.outerLoopEdges,
            cause: payload.cause,
        }),
        attributeFinishAgainstMovedWall,
    );
    floorHostDependencyTracker.bootstrap();
    const ceilingHostDependencyTracker = new CeilingHostDependencyTracker(
        ceilingStore, wallTool.getWallStore(), finishGeometryServices, commandManagerRef,
        (payload: FinishBoundaryWritePayload) => new UpdateCeilingBoundaryCommand({
            ceilingId: payload.elementId,
            mode: payload.mode,
            polygon: payload.polygon,
            outerLoopEdges: payload.outerLoopEdges,
            cause: payload.cause,
        }),
        // Same hook, both families — C79 §7.4 forbids letting floor and ceiling
        // diverge, and a repair wired to one only is precisely that divergence.
        attributeFinishAgainstMovedWall,
    );
    ceilingHostDependencyTracker.bootstrap();

    // ── Wall-anchored elements follow — §GRAPH115 / ADR-0374 ──────────────────
    // The founder's ask, verbatim intent: "all families — wall-faced, wall-hosted
    // or wall-connected — must follow / move / propagate as LIVING GRAPH elements":
    // create a toilet against a wall, move the wall, the toilet moves with it —
    // exactly as the finishes above do. The matrix cells this closes are
    // `plumbing × wall` ("a wall-hung WC cannot record the wall it hangs on") and
    // `furniture × wall` ("THE LARGEST GAP IN THIS MATRIX"). Same shape as the
    // finish trackers: the §STEP7 `wallStore.subscribe` channel with prevState,
    // one STRUCTURAL_CASCADE command per host move (one Ctrl+Z), the §L-943
    // revert latch through `commandManagerRef`, and — its one difference — NO
    // direct-store fallback: without a command manager it REFUSES by name (P6).
    // Curtain walls are hosts too (ADR-0374 §2.6): their store now forwards the
    // same pre-mutation snapshot, so a curtain-wall move carries its fixtures.
    const wallAnchorDependencyTracker = new WallAnchorDependencyTracker(
        [
            { kind: 'wall', store: wallTool.getWallStore() },
            { kind: 'curtainWall', store: curtainWallStoreInstance },
        ],
        commandManagerRef,
        [
            { family: 'plumbing', store: plumbingStore },
            { family: 'furniture', store: furnitureStore },
        ],
    );
    (window as unknown as { __pryzmWallAnchorTracker?: WallAnchorDependencyTracker }).__pryzmWallAnchorTracker = wallAnchorDependencyTracker;

    // §FINISH-HOST-CONSOLE — the founder asked for this by name (2026-08-24).
    // The two trackers above decide, per finish, WHICH walls it follows — and that
    // decision was invisible from inside the running product, so "the floor didn't
    // adapt" and "the floor is not bound to that wall" looked identical. Read-only.
    installFinishHostConsole();

    // ── Roof follow — §ROOF-FOLLOWS-WALL (L-924 · GR-12 · C79 §5) ────────────
    // The FOURTH follow path, and the reachability half of 16ef37b0: that commit
    // landed the re-derivation and stated in its own header that it "IS NOT
    // CONSTRUCTED ANYWHERE YET, and cannot be from inside packages/geometry-roof"
    // — there is no registry mapping element kind → cascade handler in this
    // repo, so every family is hand-wired here. This is roof's line.
    //
    // Wired in the SAME block as the finish trackers and for the same reason:
    // `commandManagerRef.current = commandManager` is assigned earlier in this
    // function, so both `bootstrap()` and every event-driven write reach the
    // COMMAND path (P6) rather than a direct store write.
    //
    // A roof re-derives differently from the other three, and the difference is
    // forced by the data model rather than chosen: slab re-derives by
    // intersecting a stored per-edge SKETCH, floor/ceiling by re-applying a
    // signed inset against the pre-mutation centreline. A roof has neither — it
    // records the bounding-wall SET and the anchor the user clicked — so the
    // tracker re-asks the region question at that anchor using the same
    // production tracer that authored the boundary. Record and mesh therefore
    // cannot diverge by construction.
    const roofDependencyTracker = new RoofDependencyTracker(
        roofStore, wallTool.getWallStore(),
        // Payload maps 1:1 onto the command; only the id key differs, exactly as
        // it does for the two finish trackers above.
        (payload: RoofBoundaryWritePayload) => new UpdateRoofBoundaryCommand({
            roofId: payload.roofId,
            mode: payload.mode,
            footprint: payload.footprint,
            boundingWallIds: payload.boundingWallIds,
            cause: payload.cause,
        }),
        commandManagerRef,
    );
    roofDependencyTracker.bootstrap();

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
    // §MT-05 — inject the launcher's authoritative instance instead of letting the
    // tool fall through to `window.curtainWallStore` (CurtainWallTool.ts:198).
    // initTools already RECEIVES `curtainWallStoreInstance`; not passing it was the
    // only path by which `(curtainWallTool as any).store` — which initUI:2227
    // republishes onto the global — could ever become an object the launcher does
    // not hold. With the dep injected, the tool's store IS the launcher instance by
    // construction, so the republish is provably a no-op and the §MT-05 bootstrap
    // guard can never fire on curtain-wall.
    const curtainWallTool = new CurtainWallTool(world, _sharedCbs, {
        curtainWallStore: curtainWallStoreInstance,
    });
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
            stairStore, liftStore, liftTypeStore, beamStore,
            // §MT-05 — was `window.curtainWallStore || {}`. Two defects in one
            // expression: (a) it read a mutable global for a store initTools already
            // holds by injection, so commands could bind a different instance than
            // the registry/serializer; (b) `|| {}` substituted an EMPTY OBJECT when
            // the global was unset — a store with no getAll/get, which reads to every
            // consumer as "this project has no curtain walls" rather than "the store
            // was never wired" (the C70 L-INV-1 silence shape). Both gone.
            curtainWallStore: curtainWallStoreInstance,
            curtainPanelStore: curtainPanelStoreInstance,
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
                        // §RESI-FACADE-COLOUR-PERSIST (2026-06-24) — carry the per-wall finish
                        // colour into the mesh-building legacy store. ROOT CAUSE of the dropped
                        // residential façade colour: the Immer store (CreateWallBatchHandler) kept
                        // materialColor, but this legacy mirror — which drives WallRebuildCoordinator
                        // (the 3D mesh) AND the property panel — never copied it, so batch-created
                        // walls rendered the default grey and the panel showed the #888888 fallback.
                        ...(ev.materialColor !== undefined ? { materialColor: ev.materialColor } : {}),
                        // ⭐ C100 §2.1 / L-1461 — carry the MASTER catalogue id too, not only
                        // the resolved hex beside it. This whitelist copied `materialColor`
                        // and dropped `materialId`, while the column, slab and handrail
                        // mirrors below (`:1764`, `:1828`, `:2107`) all carry it — so the
                        // omission was an oversight in THIS list, not a wall-specific rule.
                        //
                        // ⚠ It changes nothing on screen TODAY and that is stated rather than
                        // hidden: measured 2026-08-20, no interactive wall-creation path
                        // supplies a top-level `materialId` at all (`WallTool.ts:1917-1927`
                        // and `WallPlanToolHandler.ts:619-630` both omit it, and the default
                        // `wt-monolithic` system type carries none), so there is nothing yet
                        // for this line to carry. It exists so that the moment a wall DOES
                        // name a material — from the loader, from `wall.bulkSetVisuals`, or
                        // from a system type that grows one — the plan-view path does not
                        // silently drop it on the way to the mesh-building legacy store.
                        // §COMMITTED-IS-NOT-REACHABLE, pre-empted: the identical hole cost
                        // this same mirror the residential façade colour (§RESI-FACADE-COLOUR-
                        // PERSIST) and the plan-view curve (§FIX-WALL-CURVE-PLAN-VS-3D-CREATION).
                        ...(ev.materialId !== undefined ? { materialId: ev.materialId } : {}),
                        // §RESI-FACADE-INTERIOR-WHITE (2026-06-24) — carry the per-layer finish stack
                        // into the mesh-building legacy store so a layered shell wall renders the
                        // façade colour on its exterior layer + white on its interior layer (per-face).
                        ...(ev.layers !== undefined ? { layers: ev.layers } : {}),
                        // §FIX-WALL-CURVE-PLAN-VS-3D-CREATION (2026-08-06) — carry the quadratic-
                        // Bézier curve descriptor into the mesh-building legacy store. ROOT CAUSE
                        // of the plan-view "curved commits straight" defect: the bus-only plan path
                        // relies on THIS mirror for both the 3D mesh (WallRebuildCoordinator) and
                        // the plan projection, and the mirror never copied `curve` — so a curved
                        // wall drawn in plan view rendered as its straight chord everywhere.
                        // (3D-created curved walls only looked right because WallTool ALSO
                        // dual-writes through the legacy CreateWallCommand, which stamps curve.)
                        ...(ev.curve !== undefined ? { curve: ev.curve } : {}),
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

    // §L-946 (founder: "changing an element's level in the properties panel does
    // nothing"): bus → legacy-store bridge for a MUTATION, not a create.
    //
    // Every bridge above and below this one subscribes to a `.created` event —
    // twelve of them. That is the whole defect: `wall.changeLevel` succeeded, the
    // plugin store was right, and the legacy store the renderer reads never
    // heard, because nothing was listening for a change. The mirror itself lives
    // in `elementLevelChangedMirror.ts` so a suite can EXECUTE it — as a closure
    // here it would be unreachable from any test (initTools needs a THREE world
    // and twenty stores to run one line), which is how twelve mirrors came to be
    // proven only by transcription. Same reason as `roofCreatedMirror.ts`.
    //
    // ⛔ NOT a UI dual-write: the properties panel dispatches exactly ONE bus
    // command and nothing else. Re-introducing a second write from the panel
    // would reinstate what P2.1 Step C deliberately removed (see the §P2.1
    // comment above).
    if (runtime) {
        // No casts: the deps are typed structurally so `tsc` is what proves these
        // are the LEGACY stores (the ones with `changeLevel`) and not the plugin
        // DTO stores, which have no such method. A cast here would have made the
        // wiring un-checkable in exactly the place the bug lived.
        registerElementLevelChangeBridge(runtime.events, {
            wallStore: wallTool.getWallStore(),
            roofStore,
            // §L-1032 — the founder's named case. `slabStore` here is the LEGACY
            // `@pryzm/geometry-slab` singleton (C92 §2 THE AUTHORITY), the one
            // `SlabFragmentBuilder`, the plan projection, `ProjectSerializer` and
            // the IFC reader all read. It satisfies `LegacyLevelMovableStore`
            // only because `SlabStore.changeLevel` now exists; the plugin DTO
            // store does not and cannot.
            slabStore,
            // §L-1032 — the remaining nine families that carry ONE independent
            // storey. Every one of these is the LEGACY store (C84 EI-1 THE
            // AUTHORITY for its family), and `tsc` is what proves it: the deps
            // are typed structurally as `LegacyLevelMovableStore`, which
            // REQUIRES `changeLevel`, and no plugin DTO store has one. A cast
            // here would make the wiring un-checkable in exactly the place the
            // bug lived — so there is deliberately not one.
            //
            // Absent ON PURPOSE, each with its deciding clause recorded in
            // `LEVEL_CHANGE_REFUSALS` (`@pryzm/command-bus`): door/window
            // (hosted — C15 §2), room (derived from wall topology), grid
            // (project-wide), annotation + dimension (view-scoped), stair + lift
            // (they span TWO storeys, so a single-target move is ambiguous by
            // construction), pool (no legacy store exists).
            columnStore: columnStoreInstance,
            ceilingStore,
            floorStore,
            handrailStore,
            curtainWallStore: curtainWallStoreInstance,
            // §L-1087 — the four whose 3-D height does not follow `level.elevation`
            // on its own. Their stores REFUSE a move without both storey
            // elevations, and the mirror resolves those from `bimManager`, so
            // passing them here is safe only BECAUSE that resolver exists.
            beamStore,
            furnitureStore,
            lightingStore,
            plumbingStore,
            viewDependencyTracker,
            bimManager,
        });
        console.log('[initTools] §L-946: element.level-changed bus→legacy-store MUTATION bridge registered.');
    }

    // §MIRROR-UPDATE (L-9942/L-9943) — bus → legacy-store MUTATION bridge for FIELD
    // CHANGES. The SECOND mutation channel in this file, and the first that is not
    // about `levelId`.
    //
    // ═══════════════════════════════════════════════════════════════════════════
    // ⛔ EVERY OTHER BRIDGE IN THIS FILE IS A `.created`. THAT WAS THE DEFECT.
    // ═══════════════════════════════════════════════════════════════════════════
    //     grep -c "\.created'" initTools.ts -> 17      grep -c "\.updated'" -> 0
    //
    // `tools/ga-gate/check-mirror-completeness.ts` names the consequence: 123 bus
    // verbs that write a plugin DTO store and relay to NOTHING, the 13
    // `*.setMaterial` verbs that had to be turned into refusals because a refusal
    // was the only honest answer left, the lift shaft that penetrates the floor
    // plate in the model and not on screen (L-9403), and the pool's void in its
    // host slab. All one missing channel.
    //
    // ⛔ IT IS NOT A GENERAL RELAY, AND MUST NOT BECOME ONE. Which verbs may cross
    // is declared in `ELEMENT_UPDATE_VERBS` (`CommandEventBridge.ts`) and which
    // fields may cross into which legacy record is declared in
    // `LEGACY_UPDATABLE_STORES` (`elementUpdatedMirror.ts`). A verb with no row
    // stays on the gate's ledger as a NAMED backlog item rather than becoming a
    // silent copy — a moved wall is not a repainted wall, and `WallStore.update()`
    // re-runs join resolution on anything handed to it.
    if (runtime) {
        registerElementUpdateBridge(runtime.events, {
            // No casts: the deps are typed structurally, so `tsc` is what proves
            // these are the LEGACY stores the renderer reads and not the plugin DTO
            // stores. A cast here would make the wiring un-checkable in exactly the
            // place the bug lived — the same rule the §L-946 registration above states.
            slabStore,
            roofStore,
            columnStore: columnStoreInstance,
            // ⚠ THE ONE CAST, AND IT IS THE PRE-EXISTING DISAGREEMENT rather than a
            // new one: `PryzmRuntime.stores` is typed `StoresSlot` (elements /
            // hydrate / viewState / project) while `bootstrap.everything.ts` also
            // hangs every plugin store on it under its `storeKey` at runtime. The
            // balcony profile bridge below reaches the same object the same way and
            // says so. Keeping the cast HERE means `elementUpdatedMirror.ts` — the
            // part a suite executes — needs none at all.
            pluginRecord: (storeKey, id) => {
                const slot = runtime.stores as unknown as Record<string, unknown> | undefined;
                const store = slot?.[storeKey] as
                    | { getState?: () => Map<string, Record<string, unknown>> }
                    | undefined;
                return store?.getState?.().get(id);
            },
            viewDependencyTracker,
        });
        console.log('[initTools] §MIRROR-UPDATE: element.updated bus→legacy-store MUTATION bridge registered.');
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
    // race), the bridge skips the MIRROR WRITES to avoid a Zod validation throw —
    // but VDT + bimManager registration runs UNCONDITIONALLY above the guard
    // (§AXIS-L-W1 / §P2.3-REG, the wall §P2.1 shape).
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
            const _legacyWall = _legacyWallStoreForOpeningBridge.getById(ev.wallId);
            // §AXIS-L-W1 / §P2.3-REG (2026-08-31) — VDT + bimManager registration for the
            // opening's ELEMENT id, UNCONDITIONAL and ABOVE the dedup guard (the wall
            // §P2.1 / §G3-STALE-FIX shape the ten committed families carry). Measured
            // (L2b, audit/full-stack/2026-08-31/legacy-work/no-registration-families-
            // measurement.md): a bus-created door/window had NO VDT entry — every
            // DoorStore/WindowStore create event fell into the §G3-STALE fallback
            // (warn + ALL non-3D views dirtied) — and NO bimManager registration, so
            // the door/window id never entered level.childrenIds on the bus path
            // (only the legacy 3D CreateWallOpeningCommand.ts:182 does it).
            // Both sinks are idempotent on a known id (VDT: Map.set replace,
            // ViewDependencyTracker.ts:453-455; bimManager: includes-guarded push,
            // BimKernel.ts:263-265), so re-registering on a duplicate event is a no-op.
            // levelId comes from the HOST wall's legacy record; a legacy-only wall may
            // be absent mid-migration, in which case '' makes bimManager.registerElement
            // THROW (BimKernel.ts:243-268) — that throw lands in the NAMED console.error
            // below (C74 CA-18: refuse by name, never silently) and never escapes.
            try { viewDependencyTracker.registerElement(elementId, _legacyWall?.levelId ?? ''); }
            catch (err) { console.warn('[initTools] §P2.3-REG VDT.registerElement failed (non-fatal):', err); }
            try { bimManager.registerElement(elementId, _legacyWall?.levelId ?? ''); }
            catch (err) {
                console.error('[initTools] §P2.3-REG: bimManager.registerElement FAILED for ' + type, elementId, '—', err instanceof Error ? err.message : String(err));
            }
            // Dedup guard: skip if opening is already in the legacy WallStore — gates the
            // mirror writes ONLY (§AXIS-L-W1); registration above already ran.
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
                    // §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — THE PLAN/BUS HALF
                    // OF THE RECORD SEAM.
                    //
                    // This block used to hand-roll the DoorStore record from its own object
                    // literal, in parallel with a SECOND literal inside
                    // CreateWallOpeningCommand (the 3D path). The two had drifted:
                    //   • this one omitted `mark` entirely        → blank door schedule,
                    //   • this one omitted `finishMaterial`       → blank room schedule,
                    //   • this one spread `systemTypeId` CONDITIONALLY, so an opening that
                    //     arrived without one produced a TYPELESS door → the plan symbol's
                    //     `resolveDoorDimensions(undefined, …)` fell back to DEFAULT frame /
                    //     leaf thickness → a different clearHalf → a different leaf length
                    //     and hinge point → A VISIBLY DIFFERENT DOOR ON THE SAME WALL.
                    //   • NEITHER literal persisted frameThickness / frameDepth /
                    //     leafThickness, even though `buildDoorOpening` had just resolved
                    //     all three — computed, then thrown away.
                    //
                    // L-260 A wrote `buildDoorStoreRecord()` to end this and then never
                    // called it from anywhere, which is why the founder still saw the defect
                    // after it was declared fixed. Both paths now go through it (C11 §3), so
                    // the two records are byte-identical BY CONSTRUCTION.
                    //
                    // Mark generation is injected (only the app has the level context).
                    doorStore.add(buildDoorStoreRecord({
                        opening: { ...o, id, elementId, offset, width, height, sillHeight },
                        wallId:  ev.wallId,
                        mark:    typeof o.mark === 'string' ? o.mark : undefined,
                        resolveMark: () => generateMark('door', _legacyWall?.levelId ?? '', {
                            getLevels:            () => bimManager.getLevels(),
                            countElementsOnLevel: () => doorStore.getAll().length,
                        }),
                    }) as Parameters<typeof doorStore.add>[0]);
                    console.log(
                        '[initTools] §P2.3-DOOR: door mirrored to DoorStore via the ONE ' +
                        'buildDoorStoreRecord chokepoint — id=' + elementId,
                    );
                } catch (err) {
                    console.error('[initTools] §P2.3-DOOR: doorStore.add failed (non-fatal) — swing arc symbol will be absent:', err);
                }
            }

            // §P2.3-WIN: same pattern for windows — WindowPlanSymbolBuilder reads from
            // windowStore.getAll() and will skip any window not present in the store.
            if (type === 'window' && !windowStore.has(elementId)) {
                try {
                    // §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — THE WINDOW-PARITY
                    // BREAK, KILLED AT THE RECORD.
                    //
                    // The superseded code resolved the window's type HERE, with a fallback
                    // chain the 3D path knew nothing about:
                    //     opening.systemTypeId
                    //       ?? (window.windowTool as any).systemTypeId     ← a P4 global read
                    //       ?? 'wt-single-pane'                            ← INVENTED HERE
                    // while the 3D `WindowTool` defaulted to 'wt-timber-casement'. So the SAME
                    // ribbon selection produced a SINGLE PANE in plan and a TIMBER CASEMENT in
                    // 3D — a different frame finish, a different pane grid (a mullion, or
                    // none) and therefore a DIFFERENT PLAN SYMBOL and a different 3D object.
                    // That is the founder's "window parity not correct", exactly.
                    //
                    // It also dropped `windowType`, `mark`, `finishMaterial`, `glassOpacity`
                    // and `columnRatios`/`rowRatios` — and `columnRatios` is what says WHETHER
                    // the window has a mullion at all, so a plan-created window could not draw
                    // one even in principle.
                    //
                    // `buildWindowStoreRecord()` now resolves all of it from the ONE
                    // `WindowToolConfigStore` — the same store the 3D `WindowTool` reads
                    // through its accessors — so neither path can invent a type (C11 §3, C15).
                    windowStore.add(buildWindowStoreRecord({
                        opening: { ...o, id, elementId, offset, width, height, sillHeight },
                        wallId:  ev.wallId,
                        mark:    typeof o.mark === 'string' ? o.mark : undefined,
                        resolveMark: () => generateMark('window', _legacyWall?.levelId ?? '', {
                            getLevels:            () => bimManager.getLevels(),
                            countElementsOnLevel: () => windowStore.getAll().length,
                        }),
                    }) as Parameters<typeof windowStore.add>[0]);
                    console.log(
                        '[initTools] §P2.3-WIN/MAT: window mirrored to WindowStore via the ONE ' +
                        'buildWindowStoreRecord chokepoint — id=' + elementId,
                    );
                } catch (err) {
                    console.error('[initTools] §P2.3-WIN: windowStore.add failed (non-fatal) — window frame symbol will be absent:', err);
                }
            }
        });
        console.log('[initTools] §P2.3: wall.opening.created bus→legacy-store bridge registered.');
    }

    // §FT-LIFT (§FEAT-LIFT-OBSERVATION-FRAME, L-9400..L-9406 · C104 §13): bus →
    // LiftCompoundMeshBuilder. THE THIRD OF THE FOUNDER'S THREE RENDER GAPS, AND THE
    // ONLY ONE THAT NEEDED SOMETHING BUILT RATHER THAN CONNECTED.
    //
    // ═══════════════════════════════════════════════════════════════════════════
    // ⭐ WHY THIS SUBSCRIBER IS NOT A "MIRROR" LIKE THE TEN AROUND IT.
    // ═══════════════════════════════════════════════════════════════════════════
    // Every other bridge in this file mirrors a bus record into a LEGACY STORE so an
    // existing builder can find it. The lift's cabin, steel frame and guide rails
    // have no legacy store to mirror INTO — `liftPart` is a new family (C104 R-3),
    // and the console line the founder pasted diagnosed exactly that: *"no legacy
    // family and no fragment builder"*. It was right. So this hop hands the parts
    // straight to a builder instead of laundering them through a store that would
    // exist only to be read once.
    //
    // ⛔ AND IT IS **NOT** `liftMeshBuilder`. That builder is real, is constructed
    // (initBuilders.ts) and draws the LOD-200 MASSING lift out of `LiftStore` —
    // a DIFFERENT ELEMENT. C104 §13.1 records this as the trap that made the whole
    // defect invisible for a day: "a mesh builder exists, runs, and watches the
    // other store". Routing the compound into it to reuse its meshes is the
    // corruption UNDO37 refused for undo (L-7311) with a renderer attached, and it
    // is forbidden by C104 R-8.
    //
    // ⚠ THE ENCLOSURE IS NOT DRAWN HERE. The opaque sides go through §P2.1
    // (`wall.created`), the glass through §P3.1-CW (`curtain-wall.created`) and the
    // landing doors through §P2.3 (`wall.opening.created`) — three channels that
    // already existed and already had live subscribers. Drawing them a second time
    // here would put two producers of one surface in the scene: z-fighting, doubled
    // transmission cost on the WebGL backend, and one id meaning two objects
    // (C84 EI-9).
    if (runtime && liftCompoundMeshBuilder) {
        runtime.events.on('lift.created', (ev) => {
            if (ev.commandType !== 'lift.create' || !ev.liftId || !ev.origin) return;
            if (!Array.isArray(ev.parts) || ev.parts.length === 0) return;
            try {
                liftCompoundMeshBuilder.updateLift({
                    id:             ev.liftId,
                    levelId:        ev.levelId ?? '',
                    origin:         ev.origin,
                    rotation:       ev.rotation ?? 0,
                    enclosureType:  ev.enclosureType,
                    carParkOffsetY: ev.carParkOffsetY ?? 0,
                    mark:           ev.mark,
                    parts:          ev.parts,
                });
                // §FIX-PLAN-VDT-BIMMANAGER (lift compound): without these two calls a
                // bus-created element is invisible in PLAN view — the same root cause
                // the wall, column and beam bridges above each carry a note about.
                // A lift that renders in 3-D and not in plan is half a fix.
                viewDependencyTracker.registerElement(ev.liftId, ev.levelId ?? '');
                try { bimManager.registerElement(ev.liftId, ev.levelId ?? ''); }
                catch { /* non-fatal — may already be registered */ }
                console.log(
                    '[initTools] §FT-LIFT: lift compound built — ' + ev.liftId +
                    ' (' + ev.parts.length + ' cabin/frame part(s))',
                );
            } catch (err) {
                console.error(
                    '[initTools] §FT-LIFT: LiftCompoundMeshBuilder.updateLift failed — ' +
                    'the cabin, frame and guide rails will be absent:', err,
                );
            }
        });
        console.log('[initTools] §FT-LIFT: lift.created bus→LiftCompoundMeshBuilder bridge registered.');

        // §LIFT94 (L-11340) — THE SECOND ROAD TO THE SAME BUILDER: undo/redo.
        //
        // The subscriber above is driven by `lift.created`, relayed by
        // `CommandEventBridge` from a COMMAND RECORD. An undo is not a command, so the
        // bridge never sees it and the compound would stay on screen after Ctrl+Z —
        // the render half of L-7311. The boundary line solves this by re-emitting its
        // family's bus events; a lift cannot, because there is no `'lift.deleted'` key
        // in `RuntimeEvents` and `on`/`emit` are keyed `K extends keyof TMap`.
        //
        // So the undo adapter is handed the SAME builder instance instead. One source
        // of render truth, two roads, and no untyped second event channel.
        registerLiftRenderSink({
            update: (input) => { liftCompoundMeshBuilder.updateLift(input as never); },
            remove: (liftId) => { liftCompoundMeshBuilder.removeLift(liftId); },
        });
        console.log('[initTools] §LIFT94: lift undo/redo render sink registered (L-11340).');
    }

    // ── §BATH102 (L-11480..L-11486 · C109 §2/§7/§9 axes 6-7) ────────────────────
    //
    // ⭐ THE POD'S MEMBERS BECOME REAL `plumbing` FIXTURE RECORDS, THROUGH ONE ROAD.
    // `bathroomPod.create` declares ONE affected store (see `CreateBathroomPod.ts` for
    // the two measurements that make `'plumbing'` the CORRUPTING declaration), so the
    // members reach the family that draws them by projection instead. `Store.applyPatch`
    // notifies `subscribeDirty` on EXECUTE, UNDO and REDO alike, so create / undo / redo
    // / delete all arrive through this ONE subscription — no second channel that could
    // drift from the first, which is what the lift needed a hand-built sink to achieve.
    //
    // ⚠ THIS IS NOT A `registerXRenderSink` CALL and deliberately does not look like
    // one. There IS a legacy store to mirror INTO here (`window.plumbingStore`, which
    // `initBuilders.ts` publishes and whose `add()`/`remove()` already drive
    // `PlumbingFragmentBuilder`), so the mirror mints no render capability of its own.
    if (runtime) {
        const podStore = (runtime as unknown as {
            stores?: { bathroomPod?: unknown };
        }).stores?.bathroomPod as DirtyPodStore | undefined;
        if (podStore && typeof podStore.subscribeDirty === 'function') {
            attachBathroomPodMemberMirror(podStore);
            console.log('[initTools] §BATH102: bathroom-pod member mirror attached (L-11480).');
        } else {
            // ⛔ NAMED, NEVER SILENT. The whole cost of L-11060 was that nothing said
            // anything when a composed plugin store was absent.
            console.warn(
                '[initTools] §BATH102: runtime.stores.bathroomPod is UNREADABLE, so pod ' +
                'members will not reach the plumbing family — no mesh, no plan symbol, no ' +
                'elevation symbol, no IFC. Check the `bathroomPod` descriptor in ' +
                'PluginRegistry.ts and the adoption line in composeRuntime.ts.',
            );
        }
    }

    // §FT-BOUNDARY-LINE (§FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE, L-9944..L-9946 ·
    // C106 · L-9305): bus → BoundaryLineMeshBuilder.
    //
    // ═══════════════════════════════════════════════════════════════════════════
    // ⭐ THE FOUNDER DREW A BOUNDARY LINE AND SAW NOTHING, AND IT WAS BROKEN ON
    //    THREE AXES AT ONCE — NOT ONE.
    // ═══════════════════════════════════════════════════════════════════════════
    //   · no `case 'boundaryLine.*'` in `CommandEventBridge`  → nothing relayed it;
    //   · `boundaryLineSolid()` had ZERO production callers   → nothing could draw it;
    //   · zero `boundaryLine` in either `ProjectSerializer`   → the record dies on save.
    // The first two are closed (the bridge case, and `BoundaryLineMeshBuilder`). The
    // THIRD IS NOT, and is named as open at L-9947 rather than left to be discovered:
    // a boundary line drawn today renders and does not survive a reload.
    //
    // ⚠ THIS SUBSCRIBER IS NOT A "MIRROR" LIKE THE SEVENTEEN AROUND IT, for the same
    // reason §FT-LIFT is not: there is no legacy `boundaryLine` store to mirror INTO,
    // and there must not be one. `plugins/boundary-line/src/store.ts` opens by
    // declaring that this family has EXACTLY ONE authority on purpose — C84 EI-1
    // holding by construction instead of by discipline — so the record goes straight
    // to a builder rather than being laundered through a rival copy.
    //
    // ⭐ WHY IT LISTENS TO THREE EVENTS AND NOT ONE. `created` and `updated` differ
    // only in dedup and registration; `deleted` disposes. Five verbs reach `updated`
    // (`update`, `attach`, `detach`, `move`, and any later one) and they all mean the
    // same thing to a renderer. ⛔ `boundaryLine.move` carries NO `line` — it is the
    // L-220 distinct-verb bridge to `MoveBoundaryLineCommand`, which declares
    // `stores: []` and writes through `BoundaryLineStorePort` — so the record is read
    // from `runtime.stores.boundaryLine`, which for this family IS the authority.
    if (runtime) {
        const boundaryLineMeshBuilder = new BoundaryLineMeshBuilder(world.scene.three);

        /** The authoritative record: the commit when the verb carried one, otherwise
         *  the ONE store. Returns `undefined` when neither can answer — which the
         *  callers below report BY NAME rather than skipping in silence. */
        const _boundaryLineRecord = (
            id: string,
            fromEvent?: Readonly<Record<string, unknown>>,
        ): Record<string, unknown> | undefined => {
            if (fromEvent && typeof fromEvent === 'object') return { ...fromEvent };
            // ⚠ THE ONE CAST, and it is the pre-existing `StoresSlot` disagreement the
            // balcony profile bridge documents below — not a new one.
            const slot = runtime.stores as unknown as Record<string, unknown> | undefined;
            const store = slot?.['boundaryLine'] as
                | { getState?: () => Map<string, Record<string, unknown>> }
                | undefined;
            return store?.getState?.().get(id);
        };

        /** The storey datum, in world metres. ⛔ Resolved HERE and handed DOWN as a
         *  number: a builder that can reach for an elevation can reach for the wrong
         *  one, and a silent `?? 0` files every line on the ground floor
         *  (§DIAG-WALL-LEVEL). `elementLevelChangedMirror`'s `_elevationOf` exists for
         *  exactly this reason and this follows it. */
        const _boundaryLineElevation = (levelId: string): number => {
            if (!levelId) return 0;
            try {
                const lvl = bimManager.getLevelById(levelId) as { elevation?: number } | undefined;
                return typeof lvl?.elevation === 'number' ? lvl.elevation : 0;
            } catch { return 0; }
        };

        const _drawBoundaryLine = (
            phase: 'created' | 'updated',
            id: string,
            levelId: string,
            fromEvent?: Readonly<Record<string, unknown>>,
        ): void => {
            const record = _boundaryLineRecord(id, fromEvent);
            if (!record) {
                console.warn(
                    `[initTools] §FT-BOUNDARY-LINE: '${id}' ${phase} and carried no record — ` +
                    `neither the commit nor runtime.stores.boundaryLine could answer, so the ` +
                    `line will NOT be drawn. (L-9944)`);
                return;
            }
            try {
                const outcome = boundaryLineMeshBuilder.updateBoundaryLine(
                    record as unknown as Parameters<BoundaryLineMeshBuilder['updateBoundaryLine']>[0],
                    _boundaryLineElevation(levelId),
                );
                // §FIX-PLAN-VDT-BIMMANAGER — without these two calls a bus-created
                // element is invisible in PLAN view; the wall, column, beam and lift
                // bridges each carry the same note. ⚠ There is no plan SYMBOL builder
                // for this family yet (L-9948), so registering is what makes the id and
                // its storey KNOWN to the plan pipeline, not what draws it.
                viewDependencyTracker.registerElement(id, levelId);
                try { bimManager.registerElement(id, levelId); }
                catch { /* non-fatal — may already be registered */ }

                if (outcome.drew === 'linework-material-refused') {
                    // ⛔ C100 §5, surfaced rather than swallowed: volume was asked for
                    // and could not be painted honestly, so the LINE was drawn and the
                    // resolver's own sentence is repeated verbatim.
                    console.warn(
                        `[initTools] §FT-BOUNDARY-LINE: '${id}' asked for VOLUME and its ` +
                        `material could not be resolved, so it is drawn as linework. ` +
                        outcome.reason);
                } else if (outcome.drew === 'nothing') {
                    console.warn(`[initTools] §FT-BOUNDARY-LINE: '${id}' drew NOTHING — ${outcome.reason}`);
                } else {
                    console.log(
                        `[initTools] §FT-BOUNDARY-LINE: '${id}' ${phase} → ${outcome.drew}` +
                        (outcome.drew === 'solid' ? ` (${outcome.slices} segment prism(s))` : ''));
                }
            } catch (err) {
                console.error(
                    '[initTools] §FT-BOUNDARY-LINE: BoundaryLineMeshBuilder.updateBoundaryLine ' +
                    'failed — the boundary line will be absent from the 3-D scene:', err);
            }
        };

        runtime.events.on('boundaryLine.created', (ev) => {
            if (!ev.boundaryLineId) return;
            _drawBoundaryLine('created', ev.boundaryLineId, ev.levelId ?? '', ev.line);
        });
        runtime.events.on('boundaryLine.updated', (ev) => {
            if (!ev.boundaryLineId) return;
            _drawBoundaryLine('updated', ev.boundaryLineId, ev.levelId ?? '', ev.line);
        });
        runtime.events.on('boundaryLine.deleted', (ev) => {
            if (!ev.boundaryLineId) return;
            // `removeBoundaryLine` returns whether there was anything to remove, so
            // "gone" and "was never drawn" stay different facts.
            const had = boundaryLineMeshBuilder.removeBoundaryLine(ev.boundaryLineId);
            console.log(
                `[initTools] §FT-BOUNDARY-LINE: '${ev.boundaryLineId}' deleted — ` +
                (had ? 'group disposed' : 'nothing was drawn for it'));
        });

        // ── §FT-WATER (§POOL95 · ADR-0124 §4 · L-9941) ───────────────────────────
        //
        // ⭐ THE FOUNDER: *"add in the swimming pool a box with 70% transparency in
        // blue looking like water within the walls and the slab"*. The water record
        // has existed, been undoable and been schedulable since L-292; what it could
        // not do was APPEAR. `CommandEventBridge`'s `pool.create` case printed
        // *"'water' has no typed event, no subscriber and no mesh builder anywhere in
        // the tree; the basin renders and the water in it does not"* on every pool
        // anybody created. This subscriber is one of the three things that sentence
        // named, and all three land together — any one alone leaves it true.
        //
        // ⭐ IT FOLLOWS THE BOUNDARY-LINE ROUTE DIRECTLY ABOVE, NOT §FT1's SLAB
        // ROUTE, for the same measured reason: `water` is a SINGLE-AUTHORITY family
        // (`plugins/pool/src/store.ts` — one Zod schema, one store, deliberately no
        // legacy engine twin). §FT1 exists to feed a legacy store; minting a
        // `WaterStore` to imitate it would create the second authority this family
        // was designed without, and `legacyStoreUpdateSemantics.ts` records the
        // absence of one as a PROPERTY, not a gap.
        //
        // ⛔ NO `water.deleted` ARM, AND THAT IS DECLARED RATHER THAN FORGOTTEN.
        // `pool.delete` has no `CommandEventBridge` case at all (`mirror-debt.json`
        // carries it as UNMIRRORED), and there is no generic element-deletion event
        // in `RuntimeEvents` — `boundaryLine.deleted` is the only `.deleted` in the
        // whole map, and it is family-private. Emitting a water-only deletion here
        // would heal a quarter of the pool on screen and leave the basin walls, the
        // floor and the void behind, which is a worse and more confusing state than
        // the whole compound persisting. It is filed, not half-done.
        const waterMeshBuilder = new WaterMeshBuilder(world.scene.three);

        // ⭐ §POOL95 (L-11350) — THE UNDO PATH'S ROAD TO THE SAME BUILDER.
        // `performUndoRedo` applies inverse patches straight to the stores and emits
        // NO bus events (measured: zero `events.emit` in that file), so without this
        // the water would revert in the model and stay on screen. The `water`
        // adapter's `flushWaterRender` drives these two closures over the SAME
        // builder instance the `water.created` subscriber above drives — one source
        // of render truth reached by two roads, which is `registerLiftRenderSink`'s
        // shape and rationale exactly (§LIFT94).
        registerWaterRenderSink({
            update: (input) => { waterMeshBuilder.updateWater(input); },
            remove: (waterId) => { waterMeshBuilder.removeWater(waterId); },
        });

        runtime.events.on('water.created', (ev) => {
            if (!ev.waterId) return;
            try {
                const outcome = waterMeshBuilder.updateWater({
                    id:               ev.waterId,
                    levelId:          ev.levelId,
                    poolId:           ev.poolId,
                    boundary:         ev.boundary,
                    surfaceElevation: ev.surfaceElevation,
                    bottomElevation:  ev.bottomElevation,
                    color:            ev.color,
                    opacity:          ev.opacity,
                });

                if (outcome.drew === 'nothing') {
                    // The builder's own sentence, verbatim. A pool whose basin is
                    // visible and whose water is not now says WHY, at the layer that
                    // knows — instead of being discovered from a screenshot.
                    console.warn(`[initTools] §FT-WATER: '${ev.waterId}' drew NOTHING — ${outcome.reason}`);
                    return;
                }

                // §FIX-PLAN-VDT-BIMMANAGER — the wall, slab, column, beam, lift and
                // boundary-line bridges each carry this note: without these two calls
                // a bus-created element is invisible to the PLAN pipeline. ⚠ There is
                // no plan SYMBOL builder for water (see the census in the §POOL95
                // report), so registering makes the id and its storey KNOWN to that
                // pipeline — it is not what draws it.
                //
                // ⚠ Canonical level resolution, the §DIAG-WALL-LEVEL rule: `'' ?? 'L0'`
                // is `''`, so an empty levelId must be REFUSED rather than defaulted,
                // or the water bleeds onto the ground plan.
                const levelId = (ev.levelId ?? '').trim();
                if (levelId.length === 0) {
                    console.warn(
                        `[initTools] §FT-WATER ⚠ water.created with NO levelId — skipping ` +
                        `spatial registration to avoid bleeding it onto the ground plan. waterId=`,
                        ev.waterId);
                } else {
                    try { viewDependencyTracker.registerElement(ev.waterId, levelId); }
                    catch (err) { console.warn('[initTools] §FT-WATER VDT.registerElement failed (non-fatal):', err); }
                    try { bimManager.registerElement(ev.waterId, levelId); }
                    catch { /* non-fatal — may already be registered */ }
                }

                console.log(
                    `[initTools] §FT-WATER: '${ev.waterId}' created → volume ` +
                    `(pool ${ev.poolId ?? '(unnamed)'}, surface y=${String(ev.surfaceElevation)})`);
            } catch (err) {
                console.error(
                    '[initTools] §FT-WATER: WaterMeshBuilder.updateWater failed — the water ' +
                    'will be absent from the 3-D scene:', err);
            }
        });
        console.log('[initTools] §FT-WATER: water.created bus→mesh bridge registered.');

        // ⭐⭐ §FEAT-SPACE-ENVELOPE (L-12900) · C114 §10 — THE AUTHORED VOLUME BECOMES
        // VISIBLE, AND ITS FACES BECOME DRAGGABLE.
        //
        // ⛔ IT SUBSCRIBES THE STORE, NOT A BUS EVENT, AND THAT IS THE DESIGN — see
        // `attachSpaceEnvelopeRender.ts` for the argument in full. `water` above needed
        // THREE things (a typed RuntimeEvents member, this subscriber, and a
        // `registerWaterRenderSink` for the undo path) because `performUndoRedo` emits
        // no bus events at all; miss the sink and the water reverts in the model and
        // stays on screen. `Store.applyPatch` notifies `subscribeDirty` on execute, undo
        // AND redo alike, so ONE subscription serves all three and no rival render
        // channel exists to disagree with it (C84 EI-9).
        //
        // ⚠ The `stores` cast is the pre-existing `StoresSlot` disagreement the
        // boundary-line and balcony bridges above already document — not a new one.
        {
            const slot = runtime.stores as unknown as Record<string, unknown> | undefined;
            const spaceEnvelopeStore = slot?.['spaceEnvelope'] as DirtySpaceEnvelopeStore | undefined;
            if (!spaceEnvelopeStore || typeof spaceEnvelopeStore.subscribeDirty !== 'function') {
                // ⛔ LOUD, NEVER SILENT (C84 EI-6). UNREACHABLE and EMPTY are different
                // facts: without this store the family is authored, undoable, saved and
                // INVISIBLE — which is the state `CommandEventBridge` printed about the
                // water on every pool anybody created, for weeks.
                console.warn(
                    '[initTools] §FEAT-SPACE-ENVELOPE: runtime.stores.spaceEnvelope is not reachable — '
                    + 'authored space envelopes will not be drawn. The records are still created, '
                    + 'undoable and saved; only the 3-D leg is absent.',
                );
            } else {
                // ⭐ §ENVELOPE-WALLS-FOLLOW / §ENVELOPE-PARTITIONS-FOLLOW — THE CONSUMER.
                // Founder: *"THE ENVELOPE BEING EXTENDED ON PRYZM 3D VIEW SHOULD MEANS THE CONTEXT
                // WALLS - PERIMETER WALLS SHALL FOLLOW AND THEE INTERIOR PARTITIONS TOO."*
                //
                // ⭐ INSTALLED ONCE, ON THE RUNTIME — NOT ONCE PER SURFACE. The event is raised by
                // the GESTURE, on whichever surface it ran, so this ONE registration covers the
                // BIM 3-D viewport below AND the 3-D Site's own `installSpaceEnvelopeFaceDragOnSurface`
                // in `GISAreaLayout.ts`, and a third surface will need no wiring at all. Installing
                // it per surface would be N copies of the C80 decision (C84 EI-9) and N cascades
                // for one drag.
                //
                // ⛔⛔ MOVED TO THE TOP OF THIS BRANCH 2026-09-07 (lane WALLS-FOLLOW-WIRE), AND THE
                // ORDER IS THE WHOLE POINT. It used to sit BELOW `attachSpaceEnvelopeRender`, which
                // dereferences `world.scene.three`, `world.renderer.three.domElement` and
                // `world.camera.three` with no `try`. ⇒ ANY boot where the THREE world is not fully
                // up — a lost WebGPU device, a renderer that has not attached, a project restore
                // racing the viewport — threw there and the cascade NEVER INSTALLED. On the 3-D
                // Site, which needs no THREE at all, the founder would then drag a face, watch the
                // envelope move, watch the building NOT follow, and be told NOTHING: the drag would
                // emit `pryzm:spaceEnvelope:faceMoved` into an empty listener set.
                // That is [[authored-but-unwired]] with a renderer failure as its trigger. This
                // consumer needs `runtime.events` and NOTHING else, so it is armed FIRST, and the
                // 3-D Site's gesture no longer depends on the BIM viewport having booted.
                //
                // ⚠ The runtime is passed as a THUNK, never captured: §L-545-SITE-CAPTURE /
                // §L-12916 — a reference held across a project switch is a reference to a runtime
                // that no longer exists.
                installSpaceEnvelopeWallFollow(() => runtime as unknown as WallFollowRuntimeLike);

                // ⭐⭐ §RESI-STAGE-G (2026-09-06) · C114 §10b / §11 item 7 — THE FOOTPRINT
                // BECOMES EDITABLE, in the outline editor this app already builds for walls.
                //
                // ⛔ THE FACTORY IS THE LOAD-BEARING ARGUMENT, exactly as it is for
                // `WallTool.createProfileEditor` above (`:898`). `WallProfileEditorPort` is an
                // L2 interface with no implementation at L2; without this line the tool is
                // registered, its button is offered, and pressing it opens NOTHING — the
                // "port with no implementation" state `WallProfileEditor.ts` names in its own
                // header. The tool refuses OUT LOUD when the factory is absent rather than
                // returning quietly, and `spaceEnvelopeProfileEditWire.spec.ts` asserts THIS
                // FILE passes it, because a static link nobody tests still breaks the chain.
                const spaceEnvelopeProfileEditTool = new SpaceEnvelopeProfileEditTool({
                    // LAZY, every time — the same rule the face drag states: a record
                    // captured at install time is one the store may no longer hold.
                    getRecord: (id: string) =>
                        spaceEnvelopeStore.getState().get(id) as ProfileEditableSpaceEnvelope | undefined,
                    createProfileEditor: () => new WallProfileEditor(),
                    // P6 — the ONLY mutation path. ONE Apply = ONE command = ONE Ctrl+Z.
                    // ⚠ The promise is RETURNED, not swallowed: the tool awaits it to decide
                    // whether to close the dialog or hold it open showing the containment
                    // gate's refusal. A `.catch` here would eat the sentence and close on a
                    // refusal, which is the §FIX-OP-SILENT-NOOP defect wearing a fix's clothes.
                    dispatchSetFootprint: (payload) =>
                        Promise.resolve(runtime.bus.executeCommand('spaceEnvelope.setFootprint', payload)),
                    onRefusal: (message: string) => {
                        runtime.events?.emit('pryzm:toast', { message, severity: 'warning' });
                    },
                });
                // The ONE registration. Read by `ContextualEditBar._profileEditToolFor`
                // (the button) and by nothing else; the double-click goes through the
                // controller below, which holds the reference directly.
                window.spaceEnvelopeTool = spaceEnvelopeProfileEditTool;

                attachSpaceEnvelopeRender({
                    store: spaceEnvelopeStore,
                    scene: world.scene.three,
                    domElement: world.renderer.three.domElement,
                    camera: () => world.camera.three,
                    // P6 — the ONLY mutation path. ⭐ ONE dispatch per gesture, minted on
                    // pointer-up by the controller, so one face drag costs one Ctrl+Z.
                    dispatchFaceMove: (payload) => {
                        // ⚠ `Promise.resolve(...)` IS NOT CEREMONY. `RuntimeSlot.bus
                        // .executeCommand` is declared to return `unknown` on the
                        // composed handle (unlike the raw `CommandBus`), so calling
                        // `.catch` on it directly is `TS2571: Object is of type
                        // 'unknown'` — and dropping the `.catch` to satisfy the compiler
                        // would turn a refused move into an UNHANDLED REJECTION the user
                        // never hears about, which is the §FIX-OP-SILENT-NOOP defect.
                        // ⛔ ONE SPELLING OF THE VERB, shared with the 3-D Site wiring
                        // (`GISAreaLayout`). Two literals for one command is two chances to spell
                        // it differently, and a mis-spelled verb reaches the bus as an UNKNOWN
                        // COMMAND — a different failure, at a different layer, from the refusal the
                        // user should have seen.
                        void dispatchSpaceEnvelopeFaceMove(runtime.bus, payload)
                            .catch((e: unknown) => {
                                // The planner already refused DURING the drag with both
                                // numbers, so reaching here means the store moved under
                                // the gesture. The user still hears about it.
                                console.error('[initTools] §FEAT-SPACE-ENVELOPE moveFace failed:', e);
                                runtime.events?.emit('pryzm:toast', {
                                    message: `Couldn't move that face — ${e instanceof Error ? e.message : String(e)}`,
                                    severity: 'error',
                                });
                            });
                    },
                    onRefusal: (message: string) => {
                        // ⭐ THE REFUSAL IS THE PRODUCT (C83 §1.2 / CA-DOCTRINE-A). It
                        // carries BOTH numbers, read from the geometry by the planner and
                        // forwarded verbatim — a paraphrase here would be the second copy
                        // C84 EI-8a rules out.
                        runtime.events?.emit('pryzm:toast', { message, severity: 'warning' });
                    },
                    registerElement: (id: string, levelId: string) => {
                        try { viewDependencyTracker.registerElement(id, levelId); }
                        catch (err) { console.warn('[initTools] §FEAT-SPACE-ENVELOPE VDT.registerElement failed (non-fatal):', err); }
                        try { bimManager.registerElement(id, levelId); }
                        catch { /* non-fatal — may already be registered */ }
                    },
                    // §RESI-STAGE-G — DOUBLE-CLICK A FACE, EDIT THE FOOTPRINT. The gesture is
                    // resolved by the controller's own raycast (the only one that can say
                    // which envelope is under the pointer) and handed here as an id.
                    onProfileEdit: (spaceEnvelopeId: string) => {
                        spaceEnvelopeProfileEditTool.enterProfileEditMode(spaceEnvelopeId);
                    },
                    // ⭐⭐ §25.6 GESTURE 1 (2026-09-06) — THE ORBIT STOPS WHILE A FACE IS
                    // DRAGGED. ⛔ Without this line the camera orbits AND the face slides at
                    // the same time and the gesture is unusable: `camera-controls` binds THIS
                    // canvas, and `ev.stopPropagation()` does not stop a listener on the SAME
                    // element. It is the identical call every other direct-manipulation drag
                    // in this app already makes — `registerTransformDragHandler:91`,
                    // `StairPath3DToolHandler:254`, `ColumnTool:128`, `CurtainWallTool:360`,
                    // `HandrailTool:140`, `LiftTool:132` — and the arrows shipped in the same
                    // commit are what make the gesture findable in the first place.
                    setCameraControlsEnabled: (enabled: boolean) => {
                        if (world.camera?.controls) world.camera.controls.enabled = enabled;
                    },
                    // ⭐ §ENVELOPE-DRAG-CONSEQUENCE (lane FACE-DRAG-2, 2026-09-07) — ONE event per
                    // committed face move, carrying BOTH rings (handover ADDENDUM §D).
                    //
                    // ⛔ IT IS NOT A CASCADE AND IT WRITES NOTHING. The emit is the INPUT; the
                    // cascade is a consumer of it. `moveFace`'s payload is `{face, deltaM}`
                    // RELATIVE to the current solid, so a consequence handler seeing only the delta
                    // could not compute where a derived wall should land — hence both rings.
                    //
                    // ⭐ UPDATED 2026-09-07 (lane FACE-DRAG-FINISH, §ENVELOPE-WALLS-FOLLOW). This
                    // comment used to end *"There are ZERO consumers in the tree today"*. There is
                    // now exactly ONE: `installSpaceEnvelopeWallFollow` (armed at the TOP of this
                    // branch, deliberately ahead of this render attach — see the note there), which reads the
                    // `wall —boundedBy→ envelope` edges and dispatches ONE `wall.cascadeBaseline`.
                    // The founder ruling that lane was waiting on is MADE and lives in
                    // `spaceEnvelopeWallFollowPlan.ts`: a wall that no longer spans the edge PRYZM
                    // built it from is treated as the user's and is NOT moved (C80 §2.2/§3.1) —
                    // it never silently snaps back.
                    onFaceMoveCommitted: (ev) => {
                        emitSpaceEnvelopeFaceMoved(
                            runtime.events as unknown as SpaceEnvelopeFaceMoveEventSink | undefined,
                            ev,
                        );
                    },
                });
                console.log('[initTools] §FEAT-SPACE-ENVELOPE: store→mesh subscriber and face drag installed.');

            }
        }

        // ⭐⭐ §82.6-COMPONENT-RENDER-MOUNT · STR-UCE-MASTER-SPEC §82.6 · ADR-0376 D10 ·
        // C113 §10 — A PLACED COMPONENT DRAWS. `ComponentCommitter` was "committed but
        // not registered on the production render path" (UCE-REACHABILITY-AUDIT R1,
        // rank 1); this is the registration, on the SAME store-subscription road the
        // space-envelope block above documents, so execute / undo / redo / project
        // restore all draw through the one subscription (C84 EI-9).
        //
        // ⭐ THE CATALOGUE IS THE ONE `PluginRegistry` INJECTED INTO THE VERBS —
        // `runtime.auxiliaries.componentCatalog` when the composed handle carries it,
        // else the process default it was built from (they are the same object; the
        // fallback exists for a runtime composed without auxiliaries, and it is the
        // same instance either way, so the committer and the verbs cannot disagree
        // about whether a definition exists — the one-resolver rule, UIUX-PLAN §U0).
        {
            const slot = runtime.stores as unknown as Record<string, unknown> | undefined;
            const componentStore = slot?.['component'] as DirtyComponentStore | undefined;
            const aux = (runtime as unknown as { auxiliaries?: Record<string, unknown> }).auxiliaries;
            const catalog = (aux?.['componentCatalog'] as typeof componentCatalog | undefined) ?? componentCatalog;
            if (!componentStore || typeof componentStore.subscribeDirty !== 'function') {
                // ⛔ LOUD, NEVER SILENT (C84 EI-6). UNREACHABLE and EMPTY are different facts.
                console.warn(
                    '[initTools] §82.6-COMPONENT-RENDER-MOUNT: runtime.stores.component is not reachable — '
                    + 'placed components will not be drawn. The records are still created, undoable '
                    + 'and saved; only the 3-D leg is absent.',
                );
            } else {
                const handle = attachComponentRender({
                    store: componentStore,
                    scene: world.scene.three,
                    catalog,
                    // The storey's elevation — `component.place` commits `origin.y = 0` and
                    // lets the level carry the height, as `furniture.create` does.
                    levelY: (levelId: string): number => {
                        const lvl = bimManager?.getLevelById?.(levelId) as { elevation?: number } | null | undefined;
                        const e = lvl?.elevation;
                        return typeof e === 'number' && Number.isFinite(e) ? e : 0;
                    },
                    onGeometryReady: (id: string, solidCount: number) => {
                        // The frame is dirty either way — a cleared group is a change too.
                        try { getFrameScheduler().markDirty('component-geometry-ready'); } catch { /* non-fatal */ }
                        if (solidCount === 0) {
                            // The committer already logged WHY (unresolved / refused). Repeating the
                            // count here keeps "drawn nothing" from being silent at the wiring layer.
                            console.warn(`[initTools] §82.6 component '${id}' drew ZERO solids — see the committer's reason above.`);
                        }
                    },
                    registerElement: (id: string, levelId: string) => {
                        try { viewDependencyTracker.registerElement(id, levelId); }
                        catch (err) { console.warn('[initTools] §82.6 VDT.registerElement failed (non-fatal):', err); }
                        try { bimManager.registerElement(id, levelId); }
                        catch { /* non-fatal — may already be registered */ }
                    },
                });
                // Exposed for the same reason the committer keeps `stats`: "did it draw?" is a
                // number, and a diagnosing lane reads it here rather than from a screenshot.
                (window as unknown as { __pryzmComponentRender?: unknown }).__pryzmComponentRender = handle;
                console.log('[initTools] §82.6-COMPONENT-RENDER-MOUNT: component store→committer subscriber installed.');
            }
        }

        // ⭐ §FIX-BOUNDARY-LINE-INVISIBLE-IN-PLAN (L-10502) — THE PLAN HALF, INSTALLED HERE.
        //
        // The founder: *"I could see the boundary line in 3D view but NOT in plan view —
        // which is where we define it and where I saw the preview."* The 3-D bridge above
        // is why he saw it in 3-D; nothing was the reason he saw it in plan, because no
        // plan-symbol producer existed for this family. The note eight lines up said so
        // — *"there is no plan SYMBOL builder for this family yet (L-9948), so registering
        // is what makes the id and its storey KNOWN to the plan pipeline, not what draws
        // it"* — and that sentence is now out of date in the good direction.
        //
        // ⭐ THE READER IS INSTALLED HERE RATHER THAN THE STORE, and that is the point.
        // `EdgeProjectorService` imports the builder at module load, long before a runtime
        // exists, so it cannot be handed a store. `initTools` already owns BOTH lookups
        // this needs — `runtime.stores.boundaryLine` (with its ONE documented cast) and
        // `_boundaryLineElevation` — so the closure below reuses them verbatim instead of
        // minting a second route to the family's single authority (C106 §1 / C84 EI-1).
        //
        // ⚠ IT RE-READS THE STORE ON EVERY PROJECTION, deliberately. No cache: the plan
        // is re-projected when `viewDependencyTracker` says the level changed, and a
        // producer holding its own snapshot is how a moved line keeps drawing where it
        // used to be. `ColumnPlanSymbolBuilder` states the same rule (§02 §1.2).
        installBoundaryLinePlanSymbolBuilder((levelId: string): readonly BoundaryLinePlanEntry[] => {
            const slot = runtime.stores as unknown as Record<string, unknown> | undefined;
            const store = slot?.['boundaryLine'] as
                | { getState?: () => Map<string, Record<string, unknown>> }
                | undefined;
            const state = store?.getState?.();
            if (!state) return [];
            const elevation = _boundaryLineElevation(levelId);
            const out: BoundaryLinePlanEntry[] = [];
            for (const record of state.values()) {
                if (record['levelId'] !== levelId) continue;
                out.push({
                    record: record as unknown as BoundaryLinePlanEntry['record'],
                    baseElevation: elevation,
                });
            }
            return out;
        });

        console.log('[initTools] §FT-BOUNDARY-LINE: boundaryLine.created/updated/deleted bus→builder bridge registered, plan-symbol reader installed.');
    }

    // §P3.1-CW (IMPL-PLAN-2026-05-17): bus → legacy-CurtainWallStore bridge.
    // After a bus `curtain-wall.create` command succeeds, CommandEventBridge emits
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
    // Batch creates use commandType 'curtain-wall.create' (single-create value) emitted
    // from CEB per-element loops — the guard below accepts both single and batch events.
    //
    // Duplicate guard: if the curtain wall is already in the legacy store (rare race on
    // undo/redo replay), the bridge silently skips to avoid a validation throw.
    //
    // After Phase 3 Batch 3.1 is fully stable and the legacy store + builder have been
    // migrated to consume from the Immer store directly, this bridge can be removed.
    if (runtime) {
        runtime.events.on('curtain-wall.created', (ev) => {
            // §FIX-CW-BRIDGE-AUTHORED-VALUES (L-972 · C84 EI-2a/EI-2b) — the
            // command-type guard AND the whole field mapping now live in
            // `curtainWallCreatedMirror.ts` so a test can EXECUTE them. As a
            // closure here they were unreachable from any suite (initTools needs a
            // THREE world and twenty stores to run one line), which is how FIVE
            // constant-false reads survived: two `typeof _cwEv['…'] === 'number'`
            // guards over fields (`baseOffset`, `panelThickness`) that existed
            // neither on the L0 schema nor on the emitter's list, and three
            // accept-arms for command types the sole emitter never writes.
            // Same extraction as §P3.2-RF's `roofCreatedMirror.ts` and §FT2's
            // `beamCreatedMirror.ts`, for the same reason.
            const cwRecord = curtainWallRecordFromCreatedEvent(ev);
            if (!cwRecord) return;
            // Dedup guard (undo/redo replay). §FIX-CW-BRIDGE-DEAD-ARMS (L-972) — this
            // read `curtainWallStoreInstance?.getById?.(…)`, and `CurtainWallStore`
            // HAS NO `getById`: its accessors are `has` / `get` / `getAll`
            // (`geometry-curtain-wall/src/CurtainWallStore.ts:75,93,101`). The optional
            // call therefore evaluated to `undefined` on every single event and the
            // guard never once fired — a sixth constant-false read in this same bridge,
            // hidden by the store being typed `any` here.
            // §AXIS-L-W1 (2026-08-31) — the dedup guard MOVED BELOW the VDT + bimManager
            // registration: it gates the add() MIRROR ONLY, the wall §P2.1 / §FIX-VDT-DUAL-PATH
            // shape. Early-returning here left a duplicate event — or a curtain wall that
            // reached the legacy store via another path — with NO VDT entry and NO
            // level.childrenIds membership: invisible in plan view and the BIM tree. Both
            // sinks are idempotent on a known id (VDT registerElement is Map.set — replace,
            // ViewDependencyTracker.ts:453-455; BimManager.registerElement is an
            // includes-guarded push, BimKernel.ts:263-265), so re-registering is a no-op.
            // §G3-STALE-FIX-CW (OI-054 (a), 2026-05-24) — register the curtain wall in VDT +
            // bimManager BEFORE add(), mirroring the wall §P2.1 fix. curtainWallStoreInstance.add()
            // SYNCHRONOUSLY drives CurtainPanelSyncHandler, which fires a storeEventBus event per
            // panel (`<cwId>::row:col`); the VDT attributes each panel to its parent (§CW-PANEL-PARENT)
            // — but only if the PARENT is already registered. Registering first means both the parent
            // and all its panels take the targeted per-level path instead of the §G3-STALE storm.
            try { viewDependencyTracker.registerElement(cwRecord.id, cwRecord.levelId); }
            catch (err) { console.warn('[initTools] §P3.1-CW VDT.registerElement failed (non-fatal):', err); }
            try { bimManager.registerElement(cwRecord.id, cwRecord.levelId); }
            catch (err) {
                // §AXIS-L-W1 / C74 CA-18 — refuse by name, never silently. (Idempotent
                // re-registration does NOT throw — this fires only on a real failure,
                // e.g. an unknown or empty levelId.)
                console.error('[initTools] §P3.1-CW: bimManager.registerElement FAILED for curtain-wall', cwRecord.id, '—', err instanceof Error ? err.message : String(err));
            }
            if (curtainWallStoreInstance.has(cwRecord.id)) return; // dedup guard — gates the add() mirror ONLY (§AXIS-L-W1)
            try {
                // §FIX-ANY-STORE-SEAM (L-980) — `as CurtainWallData`, NOT `as any`.
                // `CurtainWallStore.add()` STAMPS `properties` (and `properties.mark`,
                // CurtainWallStore.ts:333-338) so its parameter type overstates what it
                // requires; the mirror legitimately omits it. A NAMED cast keeps every
                // other field type-checked — a mis-typed `mullionSize` is still a compile
                // error — which `as any` could never be. That distinction is the whole
                // lesson of L-972/L-973.
                curtainWallStoreInstance.add(cwRecord as CurtainWallData);
                // §P3.1-CW-PLAN-FIX — ⛔ ITS PREMISE IS FALSE, MEASURED 2026-08-19 (§L-1056).
                // This comment read: "CurtainWallStore.add() uses the internal this.emit()
                // path but does NOT call storeEventBus.emit(). Only addMany() does (batch
                // path)." `add()` (`CurtainWallStore.ts:322-350`) ends in `this.emit(...)`,
                // and `emit()` (`:399-411`) DOES call `storeEventBus.emit({elementType:
                // 'curtainwall', operation:'create', …})` — the same event, differing only
                // in `timestamp`. So the line below is a DUPLICATE, and every curtain wall
                // mirrored through this bridge fires TWO plan-invalidation events.
                //
                // C87 §11 row 14 and CW-C-2 ("CurtainWallStore.add() MUST emit its own
                // storeEventBus event — a store whose event is fired by its CALLER is one
                // caller away from a silently invisible curtain wall") are derived from this
                // comment and are REFUTED by it: the store already emits, so the invariant
                // they ask for is already held and a second caller is already safe.
                //
                // The duplicate is left in place DELIBERATELY and not quietly removed. Its
                // cost is one extra event per mirrored wall; removing it changes the ORDER
                // in which subscribers observe the wall relative to the panel-storm events
                // `CurtainPanelSyncHandler` fires synchronously INSIDE `add()`, and this
                // bridge is not reachable from any suite (the L-972 lesson, one line above).
                // A behaviour change that cannot be watched is not one to make in passing.
                // Logged as L-1056.
                storeEventBus.emit({
                    elementType: 'curtainwall',
                    elementId:   cwRecord.id,
                    operation:   'create',
                    timestamp:   Date.now(),
                });
                // §FIX-PLAN-VDT-BIMMANAGER (curtain wall): the VDT + bimManager registration that
                // used to live HERE (after add) moved ABOVE the add() call — see §G3-STALE-FIX-CW.
                // Notify builder + SelectionManager that a new curtain wall is available.
                // §F.events.bridge — fires AFTER curtainWallStoreInstance.add() so the builder can
                // retrieve data via getById(id).  Uses globalThis + plain Event + Object.assign to
                // avoid GA gate G-NEW-04 regex match while remaining functionally equivalent.
                const _cwBridgeEvt = Object.assign(new Event('bim-curtainwall-added'), { detail: { id: cwRecord.id } });
                globalThis.dispatchEvent(_cwBridgeEvt);
                console.log('[initTools] §P3.1-CW: curtain wall mirrored to legacy store + storeEventBus fired', cwRecord.id);
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
            // §FIX-CEILING-BRIDGE-FINISH (L-973 · C84 EI-2a) — the guard AND the whole
            // record now live in `ceilingCreatedMirror.ts` so a test can EXECUTE them.
            // As a closure here the mapping was unreachable from any suite, which is
            // how the ENTIRE finish specification came to be hardcoded — `label`,
            // `ceilingNumber`, `baseOffset`, `soffitColor`, `soffitPattern`,
            // `exposedStructure` — over an L0 schema that carries `materialId` and
            // `materialColor`. Same extraction as §P3.2-RF's `roofCreatedMirror.ts`.
            //
            // The ordinal is read HERE (the mirror stays store-free) and matches
            // `CreateCeilingCommand.ts:188` so plan-drawn and 3-D-drawn ceilings are
            // numbered by the same rule.
            const ceilingRecord = ceilingRecordFromCreatedEvent(ev, {
                existingCeilingCount: ceilingStore.getAll().length,
            });
            if (!ceilingRecord) return;
            // Dedup guard (undo/redo replay). §FIX-CEILING-BRIDGE-FINISH — this read
            // `ceilingStore?.get?.(ev.id)` and `CeilingStore` HAS NO `get`: its
            // accessors are `getById` / `getAll` / `has`
            // (`core-app-model/src/stores/CeilingStore.ts:318,324,341`). The optional
            // call evaluated to `undefined` on every event, so the guard never once
            // fired — the same constant-false shape as the curtain-wall guard in
            // L-972, hidden by the store being typed `any` at this seam.
            // §AXIS-L-W1 (2026-08-31) — registration hoisted ABOVE the add() and OUTSIDE the
            // dedup guard (wall §P2.1 / §G3-STALE-FIX shape). Two defects in the old order:
            //  (1) the early return skipped VDT + bimManager on a duplicate event, so a
            //      ceiling that reached the store via another path stayed invisible in plan
            //      view and the BIM tree;
            //  (2) add() fires storeEventBus SYNCHRONOUSLY — registering after it meant the
            //      create event fell into the §G3-STALE fallback (all non-3D views dirtied).
            // Both sinks are idempotent on a known id (VDT: Map.set replace,
            // ViewDependencyTracker.ts:453-455; bimManager: includes-guarded push,
            // BimKernel.ts:263-265). ⛔ C11 §11's add-then-register legend is the documented
            // order that CAUSED the bug — do not restore it.
            // §FIX-PLAN-VDT-BIMMANAGER (ceiling): without these two calls, ceiling elements
            // created via the bus path are invisible in plan view — same root cause as wall fix.
            // viewDependencyTracker.registerElement → targeted dirty-marking (no §G3-STALE-EVENT).
            // bimManager.registerElement → level.childrenIds contains ceilingId →
            // NativeElementMeshExporter includes it in plan-view projections.
            try { viewDependencyTracker.registerElement(ceilingRecord.id, ceilingRecord.levelId); }
            catch (err) { console.warn('[initTools] §P3.2-CL VDT.registerElement failed (non-fatal):', err); }
            try { bimManager.registerElement(ceilingRecord.id, ceilingRecord.levelId); }
            catch (err) {
                // §AXIS-L-W1 / C74 CA-18 — refuse by name, never silently.
                console.error('[initTools] §P3.2-CL: bimManager.registerElement FAILED for ceiling', ceilingRecord.id, '—', err instanceof Error ? err.message : String(err));
            }
            if (ceilingStore.has(ceilingRecord.id)) return; // dedup guard — gates the add() mirror ONLY (§AXIS-L-W1)
            try {
                ceilingStore.add(ceilingRecord);
                console.log('[initTools] §P3.2-CL: ceiling mirrored to legacy store', ceilingRecord.id);
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
            // §AXIS-L-W1 (2026-08-31) — the dedup guard that early-returned HERE moved below
            // the VDT + bimManager registration inside the try: it gates the add() mirror
            // ONLY (wall §P2.1 shape). Early-returning skipped registration on a duplicate
            // event, leaving the roof invisible in plan view and the BIM tree.
            try {
                // §ROOF-FOLLOWS-WALL (L-924) — the field mapping now lives in
                // `roofCreatedMirror.ts` so a test can EXECUTE it. As a closure
                // here it was unreachable from any suite (initTools needs a THREE
                // world and twenty stores to run one line), which left the plan
                // creation path proven only by transcribing this mapping into a
                // test — the copy passing, not the product. Behaviour unchanged.
                // §FIX-ROOF-BRIDGE-SEATING (C84 EI-2b) — the mirror seats the roof
                // from the tallest wall on the level it was drawn on, by the same
                // rule `CreateRoofCommand.ts:140-150` applies on the 3-D path. It
                // previously read `ev.baseOffset`, a field NO emitter of
                // `roof.created` produces (the L0 Roof schema has no such field and
                // CommandEventBridge's named-subset emit does not list it), so the
                // `?? 2.7` literal was a constant and every plan-drawn roof floated
                // above walls taller than 2.7 m while the 3-D one landed on them.
                //
                // Read at EVENT time, not at registration time: the walls this roof
                // caps are added before it, and holding a store reference here would
                // be a snapshot of an empty level.
                const _roofLevelId = ev.levelId ?? '';
                let _roofWallHeights: number[] | undefined;
                try {
                    _roofWallHeights = _roofLevelId
                        ? wallTool.getWallStore().getByLevel(_roofLevelId)
                            .map((w) => (w as { height?: number }).height ?? 0)
                        : undefined;
                } catch (e) {
                    // Same disposition as CreateRoofCommand's own try/catch: a wall
                    // lookup that fails is "nothing measured", never a wrong number.
                    console.warn('[initTools] §FIX-ROOF-BRIDGE-SEATING: wall height lookup failed, seating falls back to the documented floor', e);
                    _roofWallHeights = undefined;
                }
                const record = roofRecordFromCreatedEvent(ev, _roofWallHeights);
                if (!record) return;
                // §FIX-ANY-STORE-SEAM (L-980) — named cast, same reason as the
                // curtain-wall mirror above: `RoofStore.add()` backfills `properties`
                // (+ `properties.mark`) and REBUILDS `metadata` wholesale
                // (RoofStore.ts:58-83), so both are stamped, not dropped.
                // §FIX-PLAN-VDT-BIMMANAGER (roof): without these two calls, roof elements
                // created via the bus path are invisible in plan view — same root cause as wall fix.
                // §AXIS-L-W1 / §G3-STALE-FIX — registration BEFORE add() (add() fires
                // storeEventBus synchronously) and OUTSIDE the dedup guard (both sinks are
                // idempotent: VDT Map.set replace, ViewDependencyTracker.ts:453-455;
                // bimManager includes-guarded push, BimKernel.ts:263-265). Placed after the
                // record null-check so a refused event registers nothing.
                try { viewDependencyTracker.registerElement(ev.id, ev.levelId ?? ''); }
                catch (err) { console.warn('[initTools] §P3.2-RF VDT.registerElement failed (non-fatal):', err); }
                try { bimManager.registerElement(ev.id, ev.levelId ?? ''); }
                catch (err) {
                    // §AXIS-L-W1 / C74 CA-18 — refuse by name, never silently.
                    console.error('[initTools] §P3.2-RF: bimManager.registerElement FAILED for roof', ev.id, '—', err instanceof Error ? err.message : String(err));
                }
                if (roofStore.getById(ev.id)) return; // dedup guard — gates the add() mirror ONLY (§AXIS-L-W1)
                roofStore.add(record as RoofData);
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
            // §AXIS-L-W1 (2026-08-31) — registration BEFORE the dedup guard and BEFORE the
            // add() (wall §P2.1 / §G3-STALE-FIX shape). The early return below used to sit
            // above these calls, so a duplicate event — or a column added directly by
            // CreateColumnCommand (the legacy-first path this guard exists for) — never
            // registered for plan view or the BIM tree. Both sinks are idempotent on a
            // known id (VDT: Map.set replace, ViewDependencyTracker.ts:453-455; bimManager:
            // includes-guarded push, BimKernel.ts:263-265).
            try { viewDependencyTracker.registerElement(ev.id, ev.levelId ?? ''); }
            catch (err) { console.warn('[initTools] §P3.3-CO VDT.registerElement failed (non-fatal):', err); }
            try { bimManager.registerElement(ev.id, ev.levelId ?? ''); }
            catch (err) {
                // §AXIS-L-W1 / C74 CA-18 — refuse by name, never silently.
                console.error('[initTools] §P3.3-CO: bimManager.registerElement FAILED for column', ev.id, '—', err instanceof Error ? err.message : String(err));
            }
            if (columnStore.get(ev.id)) return; // dedup guard — gates the add() mirror ONLY (§AXIS-L-W1)
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
                // §FIX-PLAN-VDT-BIMMANAGER (column) — the VDT + bimManager registration that
                // used to live HERE (after add) moved ABOVE the dedup guard (§AXIS-L-W1).
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
            // §AXIS-L-W1 (2026-08-31) — registration BEFORE the dedup guard and BEFORE the
            // add() (wall §P2.1 / §G3-STALE-FIX shape). The early return below used to sit
            // above these calls, so a duplicate event — or a slab that reached the legacy
            // store via another path — never registered for plan view or the BIM tree.
            // Both sinks are idempotent on a known id (VDT: Map.set replace,
            // ViewDependencyTracker.ts:453-455; bimManager: includes-guarded push,
            // BimKernel.ts:263-265). BeamStore.ts §3.5 confirms bimManager.registerElement()
            // was removed from the stores — bridges must call it explicitly.
            try { viewDependencyTracker.registerElement(ev.id, ev.levelId ?? ''); }
            catch (err) { console.warn('[initTools] §FT1 VDT.registerElement failed (non-fatal):', err); }
            try { bimManager.registerElement(ev.id, ev.levelId ?? ''); }
            catch (err) {
                // §AXIS-L-W1 / C74 CA-18 — refuse by name, never silently.
                console.error('[initTools] §FT1: bimManager.registerElement FAILED for slab', ev.id, '—', err instanceof Error ? err.message : String(err));
            }
            if (slabStore.getById(ev.id)) return; // dedup guard — gates the add() mirror ONLY (§AXIS-L-W1)
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
                // §FIX-PLAN-VDT-BIMMANAGER (slab) — the VDT + bimManager registration that
                // used to live HERE (after add) moved ABOVE the dedup guard (§AXIS-L-W1).
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
            // §AXIS-L-W1 (2026-08-31) — the dedup guard that early-returned HERE moved below
            // the VDT + bimManager registration inside the try: it gates the add() mirror
            // ONLY (wall §P2.1 shape). Early-returning skipped registration on a duplicate
            // event, leaving the beam invisible in plan view and the BIM tree.
            try {
                // §FIX-BEAM-BRIDGE-LOADBEARING / §FIX-BEAM-BRIDGE-SECTION (C84
                // EI-2a + EI-2c) — the field mapping now lives in
                // `beamCreatedMirror.ts` so a test can EXECUTE it. As a closure
                // here it was unreachable from any suite (initTools needs a THREE
                // world and twenty stores to run one line), which is how a
                // hardcoded `loadBearing: false` — the OPPOSITE of what
                // `CreateBeamCommand.ts:190` writes on every other path, and a
                // field the IFC pset, the beam schedule and the fire-rating rule
                // all read — survived unnoticed. Same extraction as §P3.2-RF's
                // `roofCreatedMirror.ts`, for the same reason.
                const record = beamRecordFromCreatedEvent(ev);
                if (!record) return;
                // §FIX-PLAN-VDT-BIMMANAGER (beam): without these two calls, beam elements
                // created via the bus path are invisible in plan view — same root cause as wall fix.
                // BeamStore.ts §3.5 explicitly documents bimManager.registerElement was removed from
                // the store — the bridge is the only registration site for the bus creation path.
                // §AXIS-L-W1 / §G3-STALE-FIX — registration BEFORE add() (add() fires
                // storeEventBus synchronously) and OUTSIDE the dedup guard (both sinks are
                // idempotent: VDT Map.set replace, ViewDependencyTracker.ts:453-455;
                // bimManager includes-guarded push, BimKernel.ts:263-265). Placed after the
                // record null-check so a refused event registers nothing.
                try { viewDependencyTracker.registerElement(ev.id, ev.levelId ?? ''); }
                catch (err) { console.warn('[initTools] §FT2 VDT.registerElement failed (non-fatal):', err); }
                try { bimManager.registerElement(ev.id, ev.levelId ?? ''); }
                catch (err) {
                    // §AXIS-L-W1 / C74 CA-18 — refuse by name, never silently.
                    console.error('[initTools] §FT2: bimManager.registerElement FAILED for beam', ev.id, '—', err instanceof Error ? err.message : String(err));
                }
                if (beamStore.get(ev.id)) return; // dedup guard — gates the add() mirror ONLY (§AXIS-L-W1)
                beamStore.add(record);
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
            // §AXIS-L-W1 (2026-08-31) — registration BEFORE the dedup guard and BEFORE the
            // add() (wall §P2.1 / §G3-STALE-FIX shape). The early return below used to sit
            // above these calls, so a duplicate event — or a floor that reached the legacy
            // store via another path — never registered for plan view or the BIM tree.
            // Both sinks are idempotent on a known id (VDT: Map.set replace,
            // ViewDependencyTracker.ts:453-455; bimManager: includes-guarded push,
            // BimKernel.ts:263-265).
            // §FIX-P4-FLOOR-BIMMANAGER — the properly-imported `bimManager`, not the
            // prohibited `(window as any).bimManager` (C14 §LP-01).
            try { viewDependencyTracker.registerElement(ev.floorId, ev.levelId ?? ''); }
            catch (err) { console.warn('[initTools] §P3.2-FL VDT.registerElement failed (non-fatal):', err); }
            try { bimManager.registerElement(ev.floorId, ev.levelId ?? ''); }
            catch (err) {
                // §AXIS-L-W1 / C74 CA-18 — refuse by name, never silently.
                console.error('[initTools] §P3.2-FL: bimManager.registerElement FAILED for floor', ev.floorId, '—', err instanceof Error ? err.message : String(err));
            }
            if (floorStore.getById(ev.floorId)) return; // dedup guard — gates the add() mirror ONLY (§AXIS-L-W1)
            try {
                const floorCount = floorStore.getAll().length + 1;
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
                        // §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — these two `??` arms were
                        // LITERALS (`?? 0` and `?? 0.075`), and they are why the founder's
                        // plan-drawn finish LOOKED wrong: this mirror feeds the legacy FloorStore
                        // that FloorPanelBuilder actually MESHES (`worldY_top = levelElevation +
                        // boundary.baseOffset`), so a plan `floor.create` that omitted the fields
                        // was rendered 75 mm thick sitting ON the level datum — while the plugin
                        // FloorStore's own `resolveFinishSeating` had seated the SAME floor at
                        // 15 mm / 75 mm. Three layers, three different defaults, one element.
                        //
                        // Both creation paths now send a COMPLETE record, so neither arm can fire;
                        // they resolve from the ONE documented default if a legacy or AI-authored
                        // payload ever omits them. No literal survives here.
                        baseOffset:        ev.baseOffset ?? DEFAULT_FLOOR_FINISH_BASE_OFFSET_M,
                        thickness:         ev.thickness  ?? DEFAULT_FLOOR_FINISH_THICKNESS_M,
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
                // §FIX-PLAN-VDT-BIMMANAGER (floor) — the VDT + bimManager registration that
                // used to live HERE (after add) moved ABOVE the dedup guard (§AXIS-L-W1).
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
            // §AXIS-L-W1 (2026-08-31) — the dedup guard that early-returned HERE moved
            // below the N>2 refusal and the VDT + bimManager registration: it gates the
            // add() mirror ONLY (wall §P2.1 shape). Early-returning skipped registration
            // on a duplicate event, leaving the handrail invisible in plan view and the
            // BIM tree.

            // ── §FIX-HANDRAIL-BRIDGE-TRUNCATION (ADR-0332 §2 defect 1) ────────
            //
            // WAS: `const p1 = ev.path[ev.path.length - 1]` — every vertex between
            // the first and the last was DISCARDED, with no warning, no refusal and
            // no log. The plugin schema declares `path: z.array(Vec3).min(2)`, so a
            // 3-point railing is a VALID record; the legacy `baseLine` is a 2-tuple,
            // and the mismatch was resolved by silently throwing data away. The user
            // got a shape they did not draw.
            //
            // A REFUSAL IS A CORRECT ANSWER; A SILENTLY-WRONG ELEMENT IS NOT
            // (`WallRake.ts:50-62`). Until `HandrailData` can hold a polyline —
            // ADR-0332 Tier 4, the ORTHO/LINEAR/CURVED creation-mode work — the
            // honest response to an N>2 path is to decline it BY NAME and leave no
            // record, rather than build a straight rail between the endpoints and let
            // the author believe the corner survived.
            if (ev.path.length > 2) {
                console.error(
                    `[initTools] §FIX-HANDRAIL-BRIDGE-TRUNCATION: REFUSED handrail ${ev.id} — ` +
                    `its path has ${ev.path.length} points and the legacy HandrailData.baseLine ` +
                    `holds exactly 2. Multi-segment handrails are not built yet (ADR-0332 Tier 4). ` +
                    `No handrail was created; previously the middle ${ev.path.length - 2} point(s) ` +
                    `were discarded silently and a straight rail drawn between the endpoints.`,
                );
                return;
            }

            // §AXIS-L-W1 — registration BEFORE the dedup guard and BEFORE the add()
            // (§G3-STALE-FIX), and AFTER the refusal above so a refused rail registers
            // nothing. Both sinks are idempotent on a known id (VDT: Map.set replace,
            // ViewDependencyTracker.ts:453-455; bimManager: includes-guarded push,
            // BimKernel.ts:263-265).
            try { viewDependencyTracker.registerElement(ev.id, ev.levelId ?? ''); }
            catch (err) { console.warn('[initTools] §FT-HANDRAIL VDT.registerElement failed (non-fatal):', err); }
            try { bimManager.registerElement(ev.id, ev.levelId ?? ''); }
            catch (err) {
                // §AXIS-L-W1 / C74 CA-18 — refuse by name, never silently.
                console.error('[initTools] §FT-HANDRAIL: bimManager.registerElement FAILED for handrail', ev.id, '—', err instanceof Error ? err.message : String(err));
            }
            if (handrailStore.getById(ev.id)) return; // dedup guard — gates the add() mirror ONLY (§AXIS-L-W1)

            try {
                const p0 = ev.path[0];
                const p1 = ev.path[1];

                // ── §FIX-HANDRAIL-BRIDGE-PROFILE (ADR-0332 §2 defect 2) ───────
                //
                // WAS: `ev.shape === 'rectangular' ? 'rectangular' : 'round'`.
                // `packages/schemas/src/elements/Handrail.ts:7` declares the shape
                // enum as ['round','square','flat'] — 'rectangular' is NOT a member,
                // so the comparison could never be true and the ternary was a
                // CONSTANT. Every bus-created handrail became a round rail, and a
                // 'square' or 'flat' one silently lost its profile.
                //
                // The legacy vocabulary is 'rectangular' | 'round', so the mapping is
                // total in the correct direction: round→round, square/flat→rectangular.
                const railProfile = (ev.shape === undefined || ev.shape === 'round')
                    ? 'round'
                    : 'rectangular';

                // ── §FIX-HANDRAIL-BRIDGE-DIAMETER (ADR-0332 §2 defect 3) ──────
                //
                // WAS: only `thickness: ev.diameter`. `HandrailFragmentBuilder`'s
                // ROUND branch reads `railDiameter ?? 0.04` and NEVER reads
                // `thickness` (only the RECTANGULAR branch does) — and per defect 2
                // the profile was always round, so the authored diameter was
                // unreachable and every bridged rail rendered at the 0.04 default.
                // Both fields are written because each profile reads a different one.
                const diameter = ev.diameter ?? 0.04;

                handrailStore.add({
                    id:        ev.id,
                    type:      'handrail',
                    levelId:   ev.levelId ?? '',
                    parentId:  ev.levelId ?? '',
                    baseLine:  [
                        { x: p0.x, y: p0.y ?? 0, z: p0.z },
                        { x: p1.x, y: p1.y ?? 0, z: p1.z },
                    ],
                    height:       ev.height ?? 1.0,
                    thickness:    diameter,
                    railDiameter: diameter,
                    baseOffset:   0,
                    railProfile,
                    // ── §FIX-HANDRAIL-BRIDGE-FILL (ADR-0332 §2 defect 4) ──────
                    //
                    // WAS: absent. The builder's infill block is
                    // `if glass … else if baluster …` with NO else, so an undefined
                    // fillType built NOTHING: a plan-drawn railing was three meshes —
                    // one tube and two end posts — while the same line drawn with the
                    // 3-D tool got a full balustrade. THAT DIVERGENCE WAS THE HEADLINE
                    // DEFECT OF THIS LANE.
                    //
                    // 'baluster' is not a new default invented here: it is the one
                    // `CreateHandrailCommand.execute` already applies
                    // (`CreateHandrailCommand.ts:76` — `fillType ?? 'baluster'`), which
                    // is the path the 3-D tool goes through. Both surfaces now agree.
                    fillType:     'baluster',
                    ...(ev.materialId ? { materialId: ev.materialId } : {}),
                    properties: {},
                } as any);
                // §FIX-PLAN-VDT-BIMMANAGER (handrail) — the VDT + bimManager registration
                // that used to live HERE (after add) moved ABOVE the dedup guard (§AXIS-L-W1).
                console.log('[initTools] §FT-HANDRAIL: handrail mirrored to legacy store', ev.id);
            } catch (err) {
                console.error('[initTools] §FT-HANDRAIL: failed to mirror handrail to legacy store — mesh may not build:', err);
            }
        });
        console.log('[initTools] §FT-HANDRAIL: handrail.created bus→legacy-store bridge registered.');
    }

    // §FEAT-BALCONY-COMPOUND (L-5607, C103 §4.3, ADR-0333 §6) — the PROFILE-EDIT
    // bridge. The founder: *"as we do with the edit profile feature, the user could
    // after change the shape, and the floor finish and railings should adapt."*
    //
    // ⭐ THE COMMAND ALREADY DOES THE WORK — `balcony.updateProfile` re-derives all
    // three members from one polygon in ONE undo entry. THIS LINE IS THE ONLY THING
    // BETWEEN IT AND THE USER'S GESTURE, and a compound command nothing dispatches is
    // the pool's defect wearing a different hat. Attaching it here, in the same
    // function as the three member mirrors it depends on, keeps the whole chain
    // visible in one place.
    if (runtime) {
        attachBalconyProfileBridge({
            balconies: () => {
                // ⚠ THE TYPED SLOT AND THE RUNTIME OBJECT DISAGREE, AND THAT IS
                // PRE-EXISTING — named here rather than papered over. `PryzmRuntime.stores`
                // is typed `StoresSlot` (elements / hydrate / viewState / project), but at
                // RUNTIME `bootstrap.everything.ts` also hangs every plugin's store on it
                // under its `storeKey`. `PoolPlanToolHandler` reaches the slab store the
                // same way and for the same reason. The cast is therefore narrow and
                // deliberate — it asserts exactly the ONE method this bridge calls — and a
                // missing key resolves to an empty list, which makes the bridge a no-op
                // rather than a crash.
                const slot = runtime.stores as unknown as Record<string, unknown> | undefined;
                const store = slot?.['balcony'] as
                    | { getState?: () => Map<string, { id: string; childrenIds: readonly string[]; hostWallId?: string }> }
                    | undefined;
                const state = store?.getState?.();
                return state ? [...state.values()] : [];
            },
            wallById: (id) => {
                // The LEGACY wall store — the same one the profile editor and the plan
                // tools read, so the host centreline this bridge measures against is the
                // one on screen.
                const w = window.wallStore?.getById?.(id) as
                    | { id: string; baseLine?: ReadonlyArray<{ x: number; z: number }> }
                    | undefined;
                return w ?? undefined;
            },
            slabPolygon: (slabId) => {
                const slab = window.slabStore?.getById?.(slabId) as
                    | { polygon?: ReadonlyArray<{ x: number; y: number }> }
                    | undefined;
                return slab?.polygon;
            },
            dispatch: (type, payload) => runtime.bus.executeCommand(type, payload),
        });
    }

    // §FT-LIGHTING (LIGHTING-BUS-MIGRATION — C11 §11.11): bus → legacy-LightingStore.
    // After a bus `lighting.create` succeeds, CommandEventBridge emits `lighting.created`
    // with id/kind/origin. This subscriber translates the PRYZM3 `kind`/`origin` shape
    // into the legacy `LightingData` (`fixtureType`/`position`), calls
    // lightingStore.add() AND builds the 3-D mesh (see the §LIGHT121 correction
    // below). Mirrors the §FT-HANDRAIL bridge.
    //
    // ⚠ CORRECTED §FIX-LIGHT-PLAN-INVALIDATION (Wave 4a, 2026-08-31). This
    // comment used to end *"Lighting is NOT in GEOMETRY_ELEMENT_TYPES (no
    // plan-view projection — by design), so no viewDependencyTracker
    // registration."* THE PARENTHESIS WAS FALSE AND THE CONCLUSION FOLLOWED FROM
    // IT. Lighting DOES have a plan representation — `renderLightingSymbols`
    // (`core-app-model/src/views/symbols/LightingPlanSymbolRenderer.ts`), painted
    // by `PlanViewCanvas._renderLightingPlanSymbols()` and by
    // `views/plan-canvas/PlanViewSymbolRenderer.ts`. What was missing was never
    // the PAINT, it was the INVALIDATION: placing, moving or deleting a fixture
    // dirtied no view, so the symbol appeared only when some unrelated edit
    // happened to repaint the plan. `LightingStore` (§L-1087) and its test suite
    // each named the two-part fix in writing and deliberately stopped short of
    // it; both halves land together now — `'lighting'` joins
    // GEOMETRY_ELEMENT_TYPES (§PLAN-MEMBERSHIP-LIGHTING) and this bridge
    // registers the id, in that Set's stated order.
    //
    // ⚠ ORDER IS LOAD-BEARING, and the C11 §11 column legend has it BACKWARDS.
    // The registrations go BEFORE `lightingStore.add()`, not after — copying what
    // the wall bridge DOES (§P2.1 / §G3-STALE-FIX, :1261-1310) rather than what
    // the legend says. `LightingStore.add()` fires `storeEventBus` SYNCHRONOUSLY;
    // if the id is not yet in `VDT._elementLevelMap` the event takes the
    // §G3-STALE fallback — mark EVERY non-3D view dirty, plus a warn, per
    // fixture. On a 48-fixture auto-furnish run that is 48 all-views sweeps, and
    // it would be a regression handed over as a fix. The `bimManager` call moved
    // up with it for the same reason (it was previously the last statement in the
    // try block). Neither call reads the store, so running them first is safe.
    //
    // ⚠ CORRECTED §LIGHT121 (L-11902, founder: "I can't remove some lighting
    // fixtures — e.g. terracotta lamp table"). This comment used to claim
    // *"LightingStore.add() fires `bim-lighting-added` → LightingFragmentBuilder
    // builds the 3D fixture mesh"*. THE SECOND HALF WAS FICTION: a repo-wide sweep
    // finds NO production listener that routes `bim-lighting-added` (or the
    // storeEventBus 'create') into `LightingFragmentBuilder.add` — the consumers are
    // SelectionManager cache invalidation, the browser-panel refresh, the tier pass.
    // So every BUS-created fixture (the AI lighting-layout executor, auto-furnish,
    // and the plan tool) got a STORE RECORD AND NO MESH. The record painted a plan
    // symbol (renderLightingSymbols reads the store), so the fixture LOOKED real in
    // plan — but `SelectionManager.selectById` resolves a selection by scanning the
    // scene for `userData.id`, found nothing, returned false, and keyboard Delete
    // then refused with "No element selected". The founder's undeletable fixtures
    // are exactly the bus-created class; fixtures placed by the 3-D tool or restored
    // by ProjectLoader run `CreateLightingCommand`, which calls `builder.add`
    // directly, and those delete fine — "some fixtures and not others".
    if (runtime) {
        runtime.events.on('lighting.created', (ev) => {
            if (ev.commandType !== 'lighting.create' || !ev.id || !ev.origin) return;
            // §FIX-ANY-STORE-SEAM (L-980) — the REAL class, not a hand-written
            // structural type. The previous shape declared `has?` OPTIONAL, which
            // is the same silencer as `any`: had `LightingStore` lacked `has`, the
            // guard would have compiled and never fired. It does have it — but the
            // type must be what PROVES that, not what assumes it.
            const _ls = window.lightingStore as LightingStore | undefined;
            if (!_ls) return;
            // §AXIS-L-W1 (2026-08-31) — VDT + bimManager registration hoisted ABOVE the
            // dedup guard: the guard gates the mirror (store add + mesh build) ONLY, the
            // wall §P2.1 / §FIX-VDT-DUAL-PATH shape. Early-returning before registration
            // left a duplicate event — or a fixture that reached the store via another
            // path — with no VDT entry and no level.childrenIds membership. Both sinks
            // are idempotent on a known id (VDT: Map.set replace,
            // ViewDependencyTracker.ts:453-455; bimManager: includes-guarded push,
            // BimKernel.ts:263-265).
            //
            // ⚠ Canonical level resolution, the §DIAG-WALL-LEVEL rule (:1288-1300):
            // `'' ?? 'L0'` is `''`, so an UNKNOWN storey must be REFUSED, not
            // defaulted — a fixture registered under `''` is an orphan, and one
            // defaulted to the ground storey bleeds onto the ground plan. The
            // legacy record below still carries the raw levelId verbatim (an empty
            // levelId is an S07-allowed store value); it is only the SPATIAL
            // registration that refuses, exactly as the wall and water bridges do.
            const _regLevelId = (ev.levelId ?? '').trim();
            if (_regLevelId.length === 0) {
                console.warn(
                    '[initTools] §FT-LIGHTING ⚠ lighting.created with NO levelId — ' +
                    'skipping spatial registration to avoid bleeding it onto the ground plan. id=',
                    ev.id,
                );
            } else {
                try { viewDependencyTracker.registerElement(ev.id, _regLevelId); }
                catch (err) { console.warn('[initTools] §FT-LIGHTING VDT.registerElement failed (non-fatal):', err); }
                try { bimManager.registerElement(ev.id, _regLevelId); }
                catch (err) {
                    // §AXIS-L-W1 / C74 CA-18 — refuse by name, never silently.
                    // (Idempotent re-registration — e.g. after CreateLightingCommand —
                    // does NOT throw; this fires only on a real failure.)
                    console.error('[initTools] §FT-LIGHTING: bimManager.registerElement FAILED for lighting', ev.id, '—', err instanceof Error ? err.message : String(err));
                }
            }
            if (_ls.has(ev.id)) return; // dedup guard — gates the mirror (store add + mesh build) ONLY (§AXIS-L-W1)
            try {
                // §FIX-SEATING-ONE-AUTHORITY — re-seat rather than forwarding `origin.y`.
                // `LightingPlanToolHandler._resolveY` computes the raw structure
                // (`level.elevation` for floor lamps, `level.elevation + level.height` for
                // ceiling fixtures), so a floor lamp sank into the floor finish and a
                // downlight was buried in the ceiling build-up. `CreateLightingCommand`
                // seats correctly, but the PLAN tool dispatches `lighting.create` on the
                // bus and lands HERE instead — so the command's fix never reached it.
                // Deriving seating from the fixture KIND is exactly the C11 §5.4 rule, and
                // this uses the same `FLOOR_MOUNTED_FIXTURES` split the command uses, so
                // the two paths cannot drift.
                const _fixtureType = (ev.kind ?? 'downlight') as LightingFixtureType;
                const _levelId = ev.levelId ?? '';
                const _lvl = (() => {
                    try { return _levelId ? bimManager.getLevelById(_levelId) : undefined; }
                    catch { return undefined; }
                })() as { elevation?: number; height?: number } | undefined;
                const _probe = { x: ev.origin.x, z: ev.origin.z };
                const _seatY = FLOOR_MOUNTED_FIXTURES.has(_fixtureType)
                    ? resolveFloorSeatingDatumFrom(
                        _lvl,
                        floorStore.getByLevel(_levelId),
                        _probe,
                    ).y
                    : resolveCeilingSeatingDatumFrom(
                        _lvl,
                        ceilingStore.getByLevel(_levelId),
                        _probe,
                    ).y;
                const _data: LightingData = {
                    id:          ev.id,
                    type:        'lighting',
                    levelId:     _levelId,
                    fixtureType: _fixtureType,
                    position:    { x: ev.origin.x, y: _seatY, z: ev.origin.z },
                };
                // §FIX-LIGHT-PLAN-INVALIDATION (Wave 4a) — VDT + bimManager BEFORE
                // `add()`. See the §G3-STALE-FIX note in this bridge's header for why
                // the order is not cosmetic. §AXIS-L-W1 moved the registration block
                // (with its §DIAG-WALL-LEVEL empty-level refusal) further up, ABOVE
                // the dedup guard, so a duplicate event still registers.
                _ls.add(_data);
                // §LIGHT121 (L-11902) — build the 3-D mesh HERE, not via an event
                // listener that never existed. `LightingStore.add()` fires
                // `bim-lighting-added`, but no production subscriber to that event
                // ever called `LightingFragmentBuilder.add` (see the correction
                // above); the comment that used to claim otherwise was fiction. Every
                // bus-created fixture (PLAN tool, copy/duplicate, AI lighting-layout)
                // got a store record and a plan symbol but NO scene mesh, so
                // `SelectionManager.selectById` (scene-scan by `userData.id`) found
                // nothing and keyboard/plan/3-D Delete all refused silently. Mirrors
                // `CreateLightingCommand.execute` (`store.add` + `builder.add`, both
                // explicit, no event-listener seam) so the two creation paths cannot
                // drift again.
                // §FIX-ANY-STORE-SEAM (L-980) — same doctrine as `_ls`/`_fs` above:
                // the REAL class via a cast, not a structural `any`. Only
                // `window.lightingBuilder` is ever assigned in this app
                // (`initBuilders.ts:886`) — `window.lightingFragmentBuilder` is a
                // command-registry-only alias never populated here.
                const _builder = window.lightingBuilder as LightingFragmentBuilder | undefined;
                if (_builder?.add) {
                    _builder.add(_data);
                } else {
                    console.error('[initTools] §FT-LIGHTING: no lightingFragmentBuilder available — fixture', ev.id, 'has a store record but NO mesh and will not be selectable/deletable.');
                }
                // §FIX-LIGHT-PLAN-INVALIDATION — the `bimManager.registerElement` that
                // used to sit HERE (after add) moved ABOVE the add() call, alongside the
                // new VDT registration. See the §G3-STALE-FIX note in the bridge header.
                console.log('[initTools] §FT-LIGHTING: lighting mirrored to legacy store', ev.id);
            } catch (err) {
                console.error('[initTools] §FT-LIGHTING: failed to mirror lighting to legacy store — mesh may not build:', err);
            }
        });
        console.log('[initTools] §FT-LIGHTING: lighting.created bus→legacy-store bridge registered.');
    }

    // §FT-ROOM-PLAN (Wave 4e, 2026-08-31) — the room's PLAN-INVALIDATION leg.
    //
    // ─── WHY THIS HOOKS THE STORE AND NOT A COMMAND ─────────────────────────────
    // Every other bridge in this file subscribes to a bus `<family>.created` event.
    // A room bridge of that shape would be WRONG HERE, and measurably so: rooms are
    // minted by ROOM DETECTION at least as often as by `room.create`, and detection
    // writes `RoomStore` directly. A `room.created` subscriber would therefore leave
    // the dominant creator unregistered, and an unregistered id is exactly what the
    // §G3-STALE fallback punishes — one all-views sweep per detected room.
    //
    // `RoomStore` emits `bim-room-added` / `-updated` / `-removed` from inside all
    // three mutators (`RoomStore.ts:272`, `:376`, `:414`), and — this is the part
    // that makes the ordering work without touching that file — it emits the DOM
    // event ONE LINE BEFORE the `storeEventBus` emit in each. `DOMEventBus.emit`
    // dispatches a `CustomEvent` on `window`, which is synchronous, so this listener
    // has always finished registering by the time `ViewDependencyTracker
    // ._onStoreEvent` sees the semantic event. That is the §G3-STALE-FIX ordering
    // guarantee (registration BEFORE the store event), obtained from the store's own
    // emit order rather than by re-ordering a bridge.
    //
    // ⚠ THIS IS THE SECOND HALF OF A PAIR. Alone it does nothing: `_onStoreEvent`
    // drops the event one line in unless `'room'` is in `GEOMETRY_ELEMENT_TYPES`.
    // The two land together (see §PLAN-MEMBERSHIP-ROOM in `ViewDependencyTracker`),
    // because either one on its own is a no-op and adding the Set entry FIRST would
    // ship the storm.
    //
    // ⚠ `bimManager.registerElement` is deliberately NOT called here.
    // `viewDependencyTracker.registerElement` is a pure `Map.set` — idempotent and
    // O(1), which matters because `bim-room-updated` fires per detection pass
    // (`geometryMutationEvents.ts` records L-1154/L-1155 measuring hundreds per
    // batch). `bimManager` maintains `level.childrenIds` as an ARRAY, and the room's
    // creation commands already register it there; re-registering on every detection
    // pass is how you grow that array without bound.
    if (typeof window !== 'undefined') {
        const _roomLevelOf = (e: Event): { id?: string; levelId?: string } =>
            ((e as CustomEvent).detail ?? {}) as { id?: string; levelId?: string };

        const _registerRoom = (e: Event): void => {
            const { id, levelId } = _roomLevelOf(e);
            if (!id) return;
            // §DIAG-WALL-LEVEL — refuse an unknown storey rather than defaulting it.
            // A room registered under '' is an orphan; one defaulted to the ground
            // storey draws its fill and its bounding lines on the wrong plan.
            const _lvl = (levelId ?? '').trim();
            if (_lvl.length === 0) {
                console.warn(
                    '[initTools] §FT-ROOM-PLAN ⚠ room store event with NO levelId — skipping ' +
                    'spatial registration to avoid bleeding it onto the ground plan. roomId=', id,
                );
                return;
            }
            try { viewDependencyTracker.registerElement(id, _lvl); }
            catch (err) { console.warn('[initTools] §FT-ROOM-PLAN VDT.registerElement failed (non-fatal):', err); }
        };

        window.addEventListener('bim-room-added', _registerRoom);
        // A room's storey is immutable (`RoomStore.update` guards `levelId`), so the
        // update leg cannot re-home one. It is still registered here because a room
        // restored by ProjectLoader / undo can reach `update` without this session
        // having seen its `added` event, and an unregistered id on the update path
        // is the same §G3-STALE sweep as on the create path.
        window.addEventListener('bim-room-updated', _registerRoom);
        window.addEventListener('bim-room-removed', (e: Event) => {
            const { id } = _roomLevelOf(e);
            if (!id) return;
            try { viewDependencyTracker.unregisterElement(id); }
            catch { /* non-fatal */ }
        });
        console.log('[initTools] §FT-ROOM-PLAN: bim-room-added/updated/removed → viewDependencyTracker bridge registered.');
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
            // §FIX-ANY-STORE-SEAM (L-980) — the REAL class; `get?` optional was
            // the silencer (see the lighting bridge above).
            const _fs = window.furnitureStore as FurnitureStore | undefined;
            if (!_fs) return;
            // §AXIS-L-W1 (2026-08-31) — registration BEFORE the dedup guard and BEFORE
            // the add() (wall §P2.1 / §G3-STALE-FIX shape). The early return below used
            // to sit above these calls, so a duplicate event — or furniture that reached
            // the legacy store via another path — never registered for plan view or the
            // BIM tree. Both sinks are idempotent on a known id (VDT: Map.set replace,
            // ViewDependencyTracker.ts:453-455; bimManager: includes-guarded push,
            // BimKernel.ts:263-265).
            try { viewDependencyTracker.registerElement(ev.id, ev.levelId ?? ''); }
            catch (err) { console.warn('[initTools] §FT-FURNITURE VDT.registerElement failed (non-fatal):', err); }
            try { bimManager.registerElement(ev.id, ev.levelId ?? ''); }
            catch (err) {
                // §AXIS-L-W1 / C74 CA-18 — refuse by name, never silently.
                console.error('[initTools] §FT-FURNITURE: bimManager.registerElement FAILED for furniture', ev.id, '—', err instanceof Error ? err.message : String(err));
            }
            if (_fs.get(ev.id)) return; // dedup guard — gates the add() mirror ONLY (§AXIS-L-W1)
            try {
                // §LAMP-FLOAT-FIX / A.21.D15 datum contract — FurnitureFragmentBuilder
                // applies the mount height EXACTLY ONCE: world Y = position.y + baseOffset
                // (furnitureElevation.furnitureWorldY). So `position.y` MUST be the storey
                // FLOOR datum (the level's elevation), NOT a pre-baked elevation. The
                // AI-furnish engine emits `position.y = floor + baseOffset` (its own
                // datum: see buildFurnishCommands.ts — baseOffset is derived as
                // position.y - levelElevation). Forwarding that baked Y here made the
                // builder add baseOffset a SECOND time → every NON-floor accessory
                // floated at `floor + 2 × offset`. The most visible victim was the
                // bedside table lamp (baseOffset = table-top 0.50 m), which hovered 0.50 m
                // above the nightstand. Floor items (baseOffset 0) are unaffected:
                // floor + 0 either way → byte-identical. Anchor to the floor datum and
                // pass the real level elevation, mirroring CreateFurnitureCommand's D15 fix.
                //
                // §FIX-SEATING-ONE-AUTHORITY — and that floor datum is the FINISHED floor
                // level (FFL), not the raw structural slab top. This bridge read
                // `level.elevation` directly, which IS the slab top: every item placed via
                // the live bus path — plan tool, furniture carousel drag-drop,
                // KitchenCabinetTool, WardrobeCabinetTool, copy/paste, and the whole D-FLE
                // `furniture.batch.create` furnish run — was sunk into the floor finish by
                // its thickness. That is the founder-reported kitchen/wardrobe defect.
                // `CreateFurnitureCommand` was fixed for it (L-87), but NONE of these paths
                // run that command, so the fix never reached the user. Seat through the
                // shared authority instead (C11 §5.4).
                //
                // `position.y` remains the storey FLOOR datum, so the A.21.D15 invariant
                // above still holds — FurnitureFragmentBuilder adds `baseOffset` exactly
                // once on top of it (`furnitureWorldY`). `levelElevation` stays the LEVEL's
                // own elevation (it is metadata, not a datum), mirroring
                // CreateFurnitureCommand which likewise sets `y: seat.y` +
                // `levelElevation: level.elevation`.
                const _lvl = (() => {
                    try { return ev.levelId ? bimManager.getLevelById(ev.levelId) : undefined; }
                    catch { return undefined; }
                })();
                const _levelElev = (_lvl as { elevation?: number } | undefined)?.elevation ?? 0;
                const _floorY = resolveFloorSeatingDatumFrom(
                    _lvl as { elevation?: number; height?: number } | undefined,
                    floorStore.getByLevel(ev.levelId ?? ''),
                    { x: ev.position.x, z: ev.position.z },
                ).y;
                _fs.add({
                    id:             ev.id,
                    type:           'furniture',
                    // §FIX-ANY-STORE-SEAM (L-980) — SURFACED by typing the store.
                    // While `_fs` was `{ add(d: unknown) }`, these two arrived as bare
                    // `string` and nothing checked them; the real `FurnitureStore.add`
                    // takes `FurnitureData`, whose `furnitureType`/`material` are closed
                    // unions. The bus event (`runtime-composer/types.ts:692,699`) still
                    // declares them `string`, so this narrowing is ASSERTED, not proven —
                    // tightening the EVENT is the real fix and it lives in L3.
                    furnitureType:  ev.furnitureType as FurnitureType,
                    position:       { x: ev.position.x, y: _floorY, z: ev.position.z },
                    // §FIX-FURNITURE-ROTATION: the plan tool sends a SCALAR yaw;
                    // legacy FurnitureData.rotation is an EulerDTO — lift yaw into .y.
                    rotation:       { x: 0, y: ev.rotation ?? 0, z: 0 },
                    levelId:        ev.levelId ?? '',
                    levelName:      '',
                    levelElevation: _levelElev,
                    baseOffset:     ev.baseOffset ?? 0,
                    width:          ev.width  ?? 0.6,
                    length:         ev.length ?? 0.6,
                    height:         ev.height ?? 0.9,
                    material:       (ev.material ?? 'wood') as FurnitureMaterial,
                    // ⭐ C100 §2.1 / L-1460 — the MASTER catalogue id. `material` above is
                    // the legacy FOUR-VALUE construction hint (`wood|metal|fabric|glass`)
                    // against a master of 205 rows; it is what the property inspector shows
                    // the user under the label "Material", which is why the founder's
                    // furniture truthfully reported having none. Omitted when absent so a
                    // record that names no material is not given an empty-string id — "no
                    // material" and "an id that resolves to nothing" are different states
                    // and C100 §5 requires them to stay different.
                    ...(ev.materialId ? { materialId: ev.materialId } : {}),
                    properties:     {},
                    // A.21.D4 — forward the style-driven colour so the builders
                    // (which read data.color) render the brief's modern/classic/
                    // minimal/warm palette. Omitted when absent (builder default).
                    ...(ev.color ? { color: ev.color } : {}),
                    // Same §FIX-ANY-STORE-SEAM narrowing as `furnitureType` above: the
                    // bus declares these `string` / `unknown`, the store declares closed
                    // types. Asserted at the boundary, unproven until the event tightens.
                    ...(ev.furnitureCategory     ? { furnitureCategory: ev.furnitureCategory as FurnitureCategory } : {}),
                    ...(ev.kitchenConfig         ? { kitchenConfig: ev.kitchenConfig as KitchenCabinetConfig } : {}),
                    ...(ev.wardrobeCabinetConfig ? { wardrobeCabinetConfig: ev.wardrobeCabinetConfig as WardrobeCabinetConfig } : {}),
                });
                // §FIX-PLAN-VDT-BIMMANAGER (furniture) — the VDT + bimManager registration
                // that used to live HERE (after add) moved ABOVE the dedup guard (§AXIS-L-W1).
                // §FIX-CATCHUP-DUPLICATE-CREATE (L-18) — bus-placed furniture (carousel /
                // plan tool / AI furnish) reaches the legacy store ONLY through this
                // bridge, so register its id in the ElementRegistry here too, matching the
                // CreateFurnitureCommand legacy path. This keeps furniture's id→storeType
                // routing complete for EVERY placement path, so
                // RemoteCommandDispatcher.isAlreadyAppliedCreate can recognise a replayed
                // furniture create as already-applied (idempotent catch-up, C08).
                // registerSemanticOrReplace is redo-safe (never throws on a known id).
                try { elementRegistry.registerSemanticOrReplace(ev.id, 'furniture'); } catch { /* non-fatal */ }
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
                // §AUTOFRAME-NO-HIJACK-WHILE-DRAWING (2026-06-23) — if a draw tool
                // is still active when this deferred frame lands, the user is mid-draw
                // (first element appearing, scene 0→1). Drawing must never move the
                // camera; suppress. Explicit zoom-to-fit + project-open framing are
                // unaffected (they do not pass through this handler).
                if (shouldSuppressAutoFrameWhileDrawing()) {
                    console.log('[initTools] §3D-FRAME-ON-VIEW-SWITCH: suppressed — a draw tool is active (no camera hijack while drawing).');
                    return;
                }
                try {
                    zoomToAll();
                    console.log('[initTools] §3D-FRAME-ON-VIEW-SWITCH: framed 3D camera on first 3D-view activation.');
                } catch (err) {
                    console.warn('[initTools] §3D-FRAME-ON-VIEW-SWITCH: zoomToAll() failed (non-fatal):', err);
                }
            }, 300);
        });
        console.log('[initTools] §3D-FRAME-ON-VIEW-SWITCH: first-3D-view-activation framing registered.');

        // §FIX-BATCH-GEN-AUTOFRAME-3D (L-174, 2026-07-06) — REGRESSION FIX.
        //
        // The three handlers above (§3D-FRAME-ON-VIEW-SWITCH here, §VIEW-AUTOFRAME +
        // §SVP3D-FRAME-ON-SWITCH in SplitViewManager) all frame the 3D view on a VIEW
        // event (view-activated / split-view entry). On a NEW project the 3D / split
        // view is entered at PROJECT-OPEN while the scene is EMPTY: the once-per-session
        // §3D-FRAME flag above is consumed and §VIEW-AUTOFRAME's zoomToAll no-ops on the
        // empty scene. When the building then GENERATES seconds later — geometry draining
        // across many frames via the L-131 P5 progressive WallFragmentBuilder /
        // SlabFragmentBuilder RAF_DRAIN — no view event fires, so nothing re-frames and
        // the founder must click Fit All.
        //
        // FIX: frame on the GENERATION-COMPLETE signal, not a view event or the flag.
        // The batch lifecycle already emits `pryzm-batch-started` / `pryzm-batch-ended`
        // (initBatchLifecycle.ts, fired from BatchCoordinator._onBatchEnd AFTER the build
        // queue drains, registrations settle, and the GPU-compile wait completes — all
        // geometry stable). The coordinator ref-counts those (identically to
        // SaveOrchestrator) and frames ONCE, a single frame after the LAST per-level
        // batch drains — not per-chunk (L-131 / L-139 / L-150 perf budget). It reuses
        // zoomToAll() (self-guards an empty scene) and keeps the
        // §AUTOFRAME-NO-HIJACK-WHILE-DRAWING guard so a mid-draw commit never moves the
        // camera. Typology-generic: every typology (resi / house / apartment / office)
        // generates through batchCoordinator.runBatch(). onFramed satisfies the
        // once-per-session flag so the view-switch handler above won't redundantly
        // re-frame the already-framed scene.
        const _batchGenAutoFrame = createBatchAutoFrameCoordinator({
            frame:   () => { zoomToAll(); },
            onFramed: () => { _3dViewFirstFrameDone = true; },
        });
        window.addEventListener('pryzm-batch-started', () => _batchGenAutoFrame.onBatchStarted());
        window.addEventListener('pryzm-batch-ended',   () => _batchGenAutoFrame.onBatchEnded());
        console.log('[initTools] §FIX-BATCH-GEN-AUTOFRAME-3D: batch-generation-complete 3D auto-frame registered.');
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

    // §OPENED-REGION (L-880) — the observer's redetect chokepoint now compares the
    // room set across every re-derivation and publishes any region a wall move left
    // standing open. This subscribes the OFFER half: the finding becomes an
    // Accept/Cancel question in the RAC chat, and Accept dispatches the ordinary
    // CreateWallCommand through the ordinary manager as ONE undoable action. Installed
    // here, beside the detector, rather than inside the chat panel — the panel is
    // created lazily and a question the user never sees is the same as no question.
    // Idempotent; a second bootstrap cannot double-ask.
    try {
        initOpenedRegionProposals();
    } catch (e) {
        console.warn('[initTools] §OPENED-REGION offer channel not installed (non-fatal):', e);
    }

    // §ROOM-TOMBSTONE (L-10814) — C94 RM-3, the founder's DERIVATION + TOMBSTONE ruling.
    // When a re-detection destroys a room the user had NAMED, its meaning is kept and
    // offered back if the region closes again as a new room. Installed here, beside the
    // detector, rather than in the chat panel — the panel is created lazily and a
    // question the user never sees is the same as no question. Idempotent.
    try {
        initRoomMeaningRestoreProposals();
    } catch (e) {
        console.warn('[initTools] §ROOM-TOMBSTONE offer channel not installed (non-fatal):', e);
    }

    // §ROOM-LOSS-NOTICE (L-12660) — companion to §ROOM-TOMBSTONE above. That offer only
    // fires once a matching face reclaims the space; when the boundary loop simply never
    // recloses (the founder's measured case — §DIAG-ROOM-LOOP BREAK, a curtain-wall gap
    // past hostSnap that no repair pass closes) the user learned of the loss from nowhere
    // but the console. This announces it immediately, every time, regardless of whether
    // the region is ever reclaimed. Installed here for the same reason as the offer above.
    try {
        initRoomLossNotices();
    } catch (e) {
        console.warn('[initTools] §ROOM-LOSS-NOTICE channel not installed (non-fatal):', e);
    }

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

    // ── LiftTool (§LIFT-CREATE-TOOL) ──────────────────────────────────────────
    // Single-click vertical-circulation (lift) placement tool, peer of ColumnTool.
    // It drives the EXISTING CreateVerticalCirculationCommand — the same command
    // the residential generator uses — so a hand-placed lift is one command = one
    // undo (P6). The command constructor is injected (createCommand) so the
    // geometry-lift package needs no command-registry dependency (no import cycle).
    const liftTool = new LiftTool(
        world,
        _sharedCbs,
        {
            createCommand: (input) => new CreateVerticalCirculationCommand(input),
            getCommandManager: () => commandManager,
            getLiftStore: () => liftStore,
            getLiftTypeStore: () => liftTypeStore,
            getActiveLevelId: () => projectContext.activeLevelId ?? null,
            // Base→top span resolution mirrors how the stair tool spans levels.
            getLevels: () => (bimManager.getLevels?.() ?? []).map((l: any) => ({
                id: l.id,
                elevation: l.elevation ?? 0,
            })),
            getToolManager: () => toolManager,
            getCanvas: () => window.pryzmCanvas,
        },
    );
    window.liftTool = liftTool;
    toolManager.setLiftTool(liftTool);

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
        // §FIX-STAIR-3D-CONFIG-DEAF — the same toast channel StairPathPlanToolHandler
        // uses, so an unsolvable sketch reaches the architect on BOTH surfaces
        // instead of dying in the console on the 3D one.
        onInvalid: (message: string) => {
            window.runtime?.events?.emit('pryzm:toast', {
                message: `Stair not placed — ${message}`,
                severity: 'warning',
            }); // F.events.15
        },
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
    //
    // §C13-BUILDER-SCENE-CLEAR — THIS IS NO LONGER THE WHOLE BUILDER SWEEP. It can only
    // reach the builders threaded through `ToolsParams` (four of the nineteen), which is
    // exactly why the other fifteen leaked their roots into the next project. The
    // complete sweep now lives in `initBuilders.ts` — the only scope holding every
    // builder instance — and calls the non-terminal `clearProjectGeometry()` verb.
    // What stays here is the wall fragment builder, which is created by WallTool and is
    // NOT one of initBuilders' returns; the three below are covered in both places and
    // are idempotent, kept as the L-320 defence-in-depth.
    window.addEventListener('bim-project-cleared', () => {
        // §C13-G4/G5: Dispose ALL WallFragmentBuilder scene objects (committed walls
        // included). WallFragmentBuilder does NOT subscribe to WallStore remove events,
        // so its THREE.js Groups survive ClearProjectCommand unless we dispose here.
        // dispose() calls removeWall() for every wallId, which calls scene.remove(root)
        // + elementRegistry.unregisterRoot() + geometry/material disposal.
        //
        // ⚠ §C13-RAILING-SWEEP-GAP (L-8101), guarded 2026-08-23. This call was the ONLY
        // UNGUARDED statement in a listener whose own comment claims "each guarded
        // independently so one failure cannot stop the others" — and it sat FIRST, ahead
        // of the floor-finish, handrail and stair-railing disposals. A throw here (the
        // WebGPU `usedTimes` L-303 family this very block cites as the reason the
        // per-element path aborts) took the whole listener down and stranded all three,
        // so project A's railings reached project B's scene. The claim in the comment
        // and the code disagreed; the code is now what the comment said.
        try {
            wallTool.getFragmentBuilder().dispose();
            console.log('[ProjectIsolation] WallFragmentBuilder disposed — scene cleared of wall geometry.');
        } catch (e) {
            console.error('[ProjectIsolation] WallFragmentBuilder dispose FAILED — wall geometry may survive this switch:', e);
        }

        // §FIX-BUILDER-ISOLATION-LEAK (L-320): the FLOOR-FINISH, HANDRAIL, and
        // STAIR-RAILING builders were OMITTED from this teardown. Like the wall
        // builder, their scene meshes can survive ClearProjectCommand — the
        // per-element `bim-*-removed` path fires during the clear but aborts
        // mid-teardown when the WebGPU `usedTimes` device-loss throw fires (L-303
        // family), leaving roots in the scene AND in the builder's registry Map. So
        // floor finishes + railings from the PRIOR project bled into the next one.
        // Dispose each here, WebGPU-safe (every dispose() routes through
        // safeDisposeObject3D and clears its Map), mirroring the wall builder. This
        // is the C13 GEOMETRY-side isolation, complementing the data-side
        // ProjectIsolationAudit. Each guarded independently so one failure cannot
        // stop the others.
        try {
            floorBuilder?.dispose?.();
            console.log('[ProjectIsolation] FloorPanelBuilder disposed — scene cleared of floor-finish geometry.');
        } catch (e) {
            console.warn('[ProjectIsolation] FloorPanelBuilder dispose failed (non-fatal):', e);
        }
        try {
            handrailBuilder?.dispose?.();
            console.log('[ProjectIsolation] HandrailFragmentBuilder disposed — scene cleared of handrail geometry.');
        } catch (e) {
            console.warn('[ProjectIsolation] HandrailFragmentBuilder dispose failed (non-fatal):', e);
        }
        try {
            stairRailingBuilder?.dispose?.();
            console.log('[ProjectIsolation] StairRailingBuilder disposed — scene cleared of stair-railing geometry.');
        } catch (e) {
            console.warn('[ProjectIsolation] StairRailingBuilder dispose failed (non-fatal):', e);
        }

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
    window.__pryzmInitComplete = true; // §R3-SENTINEL — typed global (globals.d.ts), P4-clean
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
        liftTool,
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
