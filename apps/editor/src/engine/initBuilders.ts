/**
 * initBuilders — Phase F-1 subsystem initializer.
 *
 * Creates every element store and builder instance, wires the DOM projection
 * layer (bim-*-added / bim-*-updated / bim-*-removed → builder methods), and
 * exposes every store and builder on window for legacy command access.
 *
 * Extracted from EngineBootstrap.ts (Phase F-1).
 * Corresponds to lines 2020–2399 and 2968–2972 of the original monolithic bootstrap.
 *
 * Contracts:
 *   §01-BIM-ENGINE-CORE-CONTRACT §2.7 — builders are NOT created inside tools;
 *     this is the single authoritative builder instantiation point.
 *   §01-BIM-ENGINE-CORE-CONTRACT §3   — stores are created here; registered in
 *     initStores.ts (registerAllStores); never mutated by this module.
 *   §03-BIM-SEMANTIC-MODEL-CONTRACT   — all store reads use structuredClone().
 *   §05-BIM-UI-ARCHITECTURE-CONTRACT  — engine-layer only; must not be imported
 *     by UI components.
 *
 * What is NOT here (stays in EngineBootstrap until later F-1 steps):
 *   - Tool creation (SlabTool, CeilingTool, WallTool, …)  → initTools.ts
 *   - CurtainWallBuilder / ColumnBuilder (internal to their tools) → initTools.ts
 *   - FurnitureDragDropHandler, FloatingObjectCarousel      → initTools.ts / initUI.ts
 *   - commandContext / commandManager creation              → EngineBootstrap.ts (for now)
 *   - SlabWallConnectivityService (needs wallTool.getWallStore()) → EngineBootstrap.ts
 *   - SlabDependencyTracker (needs wallTool.getWallStore())  → EngineBootstrap.ts
 *   - RoomTopologyObserver (needs commandManager)            → EngineBootstrap.ts
 */

import type { BuilderMaterialDef } from '@pryzm/core-app-model/material-resolver';
import * as THREE from '@pryzm/renderer-three/three';
import type { CommandManager } from '@pryzm/command-registry';
import type { BimManager } from '@pryzm/core-app-model';
import type { ProjectContext } from '@pryzm/core-app-model';
import { storeEventBus } from '@pryzm/core-app-model';
// §STARTUP-BUILDERS-LEG — per-subsystem tiling of this function, so "builders took 18.6 s" can
// be checked against WHICH subsystem, and against whether the boot was running or suspended.
// The leg is opened/closed by `engineLauncher.ts` around the whole `boot:scene-done →
// boot:builders-done` span; a `bootStep` with no open leg is a no-op, so calling `initBuilders`
// from a test or a second boot path is unaffected.
import { bootStep } from './bootStepProfile';
// §C13-BUILDER-SCENE-CLEAR — the one owner of the project-switch scene sweep.
import {
    clearProjectScopedBuilderGeometry,
    formatBuilderTeardownReport,
} from './projectScopedBuilderTeardown';

// ── Slab subsystem ─────────────────────────────────────────────────────────
import { SlabStore, SlabFragmentBuilder, SlabLevelCleanupHandler } from '@pryzm/geometry-slab';
// §ADR-0318-ELEMENTS-SLOT — the ONE authoritative slab store (deep path: the
// singleton module, not the geometry barrel, so the identity is unambiguous).
import { slabStore as slabStoreSingleton } from '@pryzm/geometry-slab/store';
import { ColumnFragmentBuilder, installColumnPlanSymbolBuilder } from '@pryzm/geometry-column';
// ADR-0076 Axis 3 (§PERF-WEBGPU-FRAGMENT) — element-agnostic GPU-instancing bridge.
import { ElementInstanceBridge, instancedElementRenderer } from '@pryzm/core-app-model/rendering';
// §PERF-WEBGPU-FURNITURE-INSTANCING (2026-06-26) — furniture GPU-instancing bridge
// + its independent flag (__pryzmFurnitureInstancingV1, default OFF).
import { FurnitureInstanceBridge, isFurnitureInstancingEnabled } from '@pryzm/core-app-model/rendering';

// ── Ceiling subsystem ──────────────────────────────────────────────────────
import { CeilingStore }             from '@pryzm/core-app-model/stores';
import { CeilingPanelBuilder }      from '@pryzm/geometry-slab';
import { ceilingSystemTypeStore }   from '@pryzm/core-app-model/stores';

// ── Floor subsystem ────────────────────────────────────────────────────────
import { FloorStore }               from '@pryzm/core-app-model/stores';
import { FloorPanelBuilder }        from '@pryzm/geometry-slab';
import { FloorSlabBindingHandler }  from '@pryzm/geometry-slab';
import { floorSystemTypeStore }     from '@pryzm/core-app-model/stores';

// ── Room subsystem ─────────────────────────────────────────────────────────
import { RoomStore }                from '@pryzm/room-topology';
// §ADR-0318-ELEMENTS-SLOT — the ONE authoritative room store.
import { roomStore as roomStoreSingleton } from '@pryzm/room-topology/store';
import { RoomBoundaryBuilder }      from '@pryzm/room-topology';
import { RoomLabelRenderer }        from '@pryzm/room-topology';
import { RoomLevelCleanupHandler }  from '@pryzm/room-topology';
import { RoomRelationshipService }  from '@pryzm/room-topology';
import { RoomContentsService }      from '@pryzm/room-topology';

// ── Wall subsystem ─────────────────────────────────────────────────────────
import { WallStore }                from '@pryzm/geometry-wall';
// §ADR-0318-ELEMENTS-SLOT — the ONE authoritative wall store.
import { wallStore as wallStoreSingleton } from '@pryzm/geometry-wall/store';
import { installWallLayerPlanSymbolBuilder } from '@pryzm/geometry-wall';

// ── Roof subsystem ─────────────────────────────────────────────────────────
import { RoofStore, RoofLevelCleanupHandler } from '@pryzm/geometry-roof';
import { RoofFragmentBuilder }      from '@pryzm/geometry-roof';

// ── Plumbing subsystem ─────────────────────────────────────────────────────
import { PlumbingStore, PlumbingFragmentBuilder } from '@pryzm/geometry-plumbing';

// ── Opening subsystem ──────────────────────────────────────────────────────
import { OpeningStore }             from '@pryzm/core-app-model/stores';
import { OpeningCleanupHandler }    from '@pryzm/geometry-wall';

// ── Door subsystem ─────────────────────────────────────────────────────────
import { DoorBuilder, DoorDependencyTracker, DoorLevelCleanupHandler, doorStore } from '@pryzm/geometry-door';

// ── Window subsystem ───────────────────────────────────────────────────────
import { WindowBuilder, WindowDependencyTracker, WindowLevelCleanupHandler, windowStore } from '@pryzm/geometry-window';

// ── Furniture subsystem ────────────────────────────────────────────────────
import { FurnitureStore }           from '@pryzm/geometry-furniture';
import { FurnitureFragmentBuilder } from '@pryzm/geometry-furniture';

// ── Lighting subsystem ─────────────────────────────────────────────────────
import { LightingStore, LightingFragmentBuilder } from '@pryzm/geometry-lighting';

// ── Handrail subsystem ─────────────────────────────────────────────────────
import { HandrailStore }              from '@pryzm/core-app-model/stores';
import { HandrailFragmentBuilder } from '@pryzm/geometry-handrail';
import { HandrailLevelCleanupHandler } from '@pryzm/geometry-handrail';

// ── Stair subsystem ────────────────────────────────────────────────────────
import {
    StairStore,
    StairMeshBuilder,
    StairTypeStore,
    StairLandingStore,
    StairLandingBuilder,
    StairRailingStore,
    StairRailingBuilder,
    StairLevelCleanupHandler,
} from '@pryzm/geometry-stair';

// ── Lift / vertical-circulation subsystem ──────────────────────────────────
import {
    LiftStore,
    LiftMeshBuilder,
    LiftCompoundMeshBuilder,
    LiftTypeStore,
} from '@pryzm/geometry-lift';

// ── Beam subsystem ─────────────────────────────────────────────────────────
import { BeamStore }                from '@pryzm/core-app-model/stores';
import { BeamFragmentBuilder }      from '@pryzm/geometry-beam';
import { BeamLevelCleanupHandler }  from '@pryzm/geometry-beam';

// ── Grid subsystem ─────────────────────────────────────────────────────────
import { GridStore }                from '@pryzm/core-app-model';

// ── Column subsystem ───────────────────────────────────────────────────────
import { ColumnStore, ColumnLevelCleanupHandler } from '@pryzm/geometry-column';

// ── Curtain Wall subsystem ─────────────────────────────────────────────────
import { CurtainWallStore }         from '@pryzm/geometry-curtain-wall';
import { CurtainPanelStore }        from '@pryzm/geometry-curtain-wall';
import { CurtainPanelSyncHandler }  from '@pryzm/geometry-curtain-wall';

// ── Room Bounding Line subsystem ───────────────────────────────────────────
import { roomBoundingLineStore }    from '@pryzm/core-app-model/stores';
import { RoomBoundingLineBuilder }  from '@pryzm/geometry-wall';

// ── Services ───────────────────────────────────────────────────────────────
import { RoomFinishSyncService }    from '@pryzm/core-app-model';

// ── EngineContext (for type narrowing only) ────────────────────────────────
// import type { EngineContext } from './EngineContext';  // (reserved for future initScene step)

// ── Dynamic-import type aliases (resolved at runtime) ─────────────────────
import type { WallSystemTypeStore } from '@pryzm/geometry-wall';
import type { SlabSystemTypeStore } from '@pryzm/geometry-slab';
import { annotationStore } from '@pryzm/plugin-annotations';
export type WallSystemTypeStoreShape  = WallSystemTypeStore;
export type SlabSystemTypeStoreShape  = SlabSystemTypeStore;
export type CeilingSystemTypeStoreShape = typeof ceilingSystemTypeStore;
export type FloorSystemTypeStoreShape   = typeof floorSystemTypeStore;

// ─────────────────────────────────────────────────────────────────────────────
// Public interface — inputs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal set of already-initialised engine objects that initBuilders requires.
 * All of these are produced by the scene/BIM setup that precedes builder creation
 * in EngineBootstrap.
 */
export interface BuilderInputs {
    /** Resolved THREE.Scene from world.scene.three. */
    scene: THREE.Scene;
    /**
     * BimManager singleton — some builders (SlabFragmentBuilder, CeilingPanelBuilder,
     * FloorPanelBuilder, RoofFragmentBuilder, HandrailFragmentBuilder) accept it as a
     * second ctor argument for geometry helpers.
     */
    bimManager: BimManager;
    /**
     * Active ProjectContext.  Stores that own per-project data
     * (SlabStore, ColumnStore, WallStore, RoofStore, …) take this as their first ctor arg.
     */
    projectContext: ProjectContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public interface — outputs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry returned by initBuilders.
 * EngineBootstrap destructures this to obtain stores/builders for:
 *   1. Tool creation  (initTools — next F-1 extraction step)
 *   2. registerAllStores()  (already extracted in initStores.ts)
 *   3. commandContext assembly
 *   4. Subsequent service wiring (SlabDependencyTracker, SlabWallConnectivityService, …)
 */
export interface BuilderRegistry {
    /**
     * Shared lazy ref — EngineBootstrap sets `.current` once commandManager is live.
     * SlabLevelCleanupHandler and others store this ref and resolve it at event-fire time.
     */
    commandManagerRef: { current: CommandManager | undefined };

    // ── Stores ────────────────────────────────────────────────────────────────
    columnStore:        ColumnStore;
    curtainWallStore:   CurtainWallStore;
    curtainPanelStore:  CurtainPanelStore;
    slabStore:          SlabStore;
    ceilingStore:       CeilingStore;
    floorStore:         FloorStore;
    roomStore:          RoomStore;
    wallStore:          WallStore;
    roofStore:          RoofStore;
    plumbingStore:      PlumbingStore;
    openingStore:       OpeningStore;
    furnitureStore:     FurnitureStore;
    lightingStore:      LightingStore;
    handrailStore:      HandrailStore;
    beamStore:          BeamStore;
    stairStore:         StairStore;
    stairTypeStore:     StairTypeStore;
    stairLandingStore:  StairLandingStore;
    stairRailingStore:  StairRailingStore;
    liftStore:          LiftStore;
    liftTypeStore:      LiftTypeStore;
    gridStore:          GridStore;

    // ── Type-stores (module-level singletons — re-exported for commandContext) ─
    wallSystemTypeStore:    WallSystemTypeStoreShape;
    slabSystemTypeStore:    SlabSystemTypeStoreShape;
    ceilingSystemTypeStore: CeilingSystemTypeStoreShape;
    floorSystemTypeStore:   FloorSystemTypeStoreShape;

    // ── Builders ──────────────────────────────────────────────────────────────
    columnBuilder:            ColumnFragmentBuilder;
    slabBuilder:              SlabFragmentBuilder;
    ceilingBuilder:           CeilingPanelBuilder;
    floorBuilder:             FloorPanelBuilder;
    roomBoundaryBuilder:      RoomBoundaryBuilder;
    roomLabelRenderer:        RoomLabelRenderer;
    roofBuilder:              RoofFragmentBuilder;
    plumbingBuilder:          PlumbingFragmentBuilder;
    doorBuilder:              DoorBuilder;
    windowBuilder:            WindowBuilder;
    furnitureBuilder:         FurnitureFragmentBuilder;
    lightingBuilder:          LightingFragmentBuilder;
    handrailBuilder:          HandrailFragmentBuilder;
    stairMeshBuilder:         StairMeshBuilder;
    liftMeshBuilder:          LiftMeshBuilder;
    /**
     * FEAT-LIFT-OBSERVATION-FRAME (L-9400) — the LOD-300 COMPOUND's renderer.
     *
     * DELIBERATELY A SECOND BUILDER, NOT A BRANCH INSIDE `liftMeshBuilder`. That one
     * draws the LOD-200 MASSING lift from `LiftStore`; this one draws the compound's
     * cabin, steel frame and guide rails from `lift.created`. C104 section 1 / R-8
     * forbid merging the two ELEMENTS, and one builder reading two stores would be
     * that merge arriving through the renderer (C104 section 13.1 records the trap).
     */
    liftCompoundMeshBuilder:  LiftCompoundMeshBuilder;
    stairLandingBuilder:      StairLandingBuilder;
    stairRailingBuilder:      StairRailingBuilder;
    beamBuilder:              BeamFragmentBuilder;
    roomBoundingLineBuilder:  RoomBoundingLineBuilder;
}

// ─────────────────────────────────────────────────────────────────────────────
// initBuilders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Instantiate all element stores and builders, wire DOM projection events,
 * and expose everything on `window` for legacy command access.
 *
 * Execution order follows the dependency graph:
 *   column/curtainWall stores (no deps) → slab → ceiling → floor → room →
 *   wall (+ async type stores) → roof → plumbing → opening → door/window →
 *   furniture → handrail → stair → beam → grid → services.
 *
 * Must be called AFTER scene objects exist (world.scene.three is live).
 * Must be called BEFORE tool creation so stores exist when tools are wired.
 *
 * @param inputs – scene, bimManager, projectContext
 * @returns BuilderRegistry  – destructure in EngineBootstrap for tool wiring.
 */
export async function initBuilders(inputs: BuilderInputs): Promise<BuilderRegistry> {
    const { scene, bimManager, projectContext } = inputs;

    // ── Lazy CommandManager reference ─────────────────────────────────────────
    // Cleanup handlers (e.g. SlabLevelCleanupHandler) need to dispatch commands
    // but commandManager doesn't exist yet. They store this ref and EngineBootstrap
    // resolves .current after commandManager is instantiated.
    const commandManagerRef: { current: CommandManager | undefined } = { current: undefined };

    // ── Column subsystem ──────────────────────────────────────────────────────
    const columnStore = new ColumnStore(projectContext);
    window.columnStore = columnStore; // TODO(TASK-08)
    // §COLUMN-AUDIT-2026 §C1: cleanup handler dispatches RemoveColumnsOnLevelCommand
    //   via the lazy commandManagerRef so level deletion is fully undoable.
    new ColumnLevelCleanupHandler(columnStore, commandManagerRef);
    // §COLUMN-AUDIT-2026 §W9: BimManager + slabStore are constructor-injected
    //   so build() can re-resolve world Y from level.elevation + slab top each
    //   call — and throw SpatialAuthorityError on a dangling levelId.
    //   slabStore is set later via setSpatialDeps() because slabStore is built
    //   AFTER columnBuilder in the bootstrap order.
    const columnBuilder = new ColumnFragmentBuilder(scene, bimManager, null);
    window.columnBuilder = columnBuilder;
    // ADR-0076 Axis 3 (§PERF-WEBGPU-FRAGMENT) — inject the GPU-instancing bridge
    // over the SAME shared renderer walls use. DEFAULT-OFF: simple concrete
    // columns only instance when globalThis.__pryzmElementInstancingV1 === true;
    // otherwise the builder stays entirely on the fragment path.
    try {
        columnBuilder.setInstanceBridge(new ElementInstanceBridge(instancedElementRenderer));
    } catch (instErr) {
        console.warn('[initBuilders] §PERF-WEBGPU-FRAGMENT column instance bridge wiring failed:', instErr);
    }
    // §COLUMN-AUDIT-2026 §W8: install the plan-symbol builder factory now
    //   that columnStore exists. EdgeProjectorService imports the singleton
    //   reference and sees the resolved instance from this point on.
    installColumnPlanSymbolBuilder(columnStore);
    storeEventBus.subscribe(event => {
        if (event.elementType !== 'column') return;
        if (event.operation === 'delete') {
            columnBuilder.remove(event.elementId);
            return;
        }
        const column = columnStore.get(event.elementId);
        if (column) columnBuilder.updateColumn(column);
    });
    console.log('[initBuilders] Column subsystem initialised');
    bootStep('column');

    // ── Curtain Wall subsystem — stores only ──────────────────────────────────
    // CurtainWallBuilder and ColumnBuilder are owned by their respective tools
    // (§01-BIM-ENGINE-CORE-CONTRACT §2.7).  They are created in EngineBootstrap
    // alongside CurtainWallTool / ColumnTool.
    const curtainWallStore = new CurtainWallStore();
    window.curtainWallStore = curtainWallStore; // TODO(TASK-08)

    const curtainPanelStore = new CurtainPanelStore();
    window.curtainPanelStore = curtainPanelStore; // TODO(TASK-08)

    const curtainPanelSyncHandler = new CurtainPanelSyncHandler(curtainWallStore, curtainPanelStore);
    curtainPanelSyncHandler.activate();
    console.log('[initBuilders] CurtainWall subsystem stores initialised');
    bootStep('curtain-wall');

    // ── Slab subsystem ────────────────────────────────────────────────────────
    // §ADR-0318-ELEMENTS-SLOT (per-kind adoption, slab) — adopt the module
    // singleton and attach the engine half. See the wall note below for why a
    // `new SlabStore(...)` here would break I-1.
    const slabStore = slabStoreSingleton.attachEngine(projectContext);
    window.slabStore = slabStore; // TODO(TASK-08)

    // SlabLevelCleanupHandler needs commandManagerRef (resolved after commandManager is live).
    new SlabLevelCleanupHandler(slabStore, commandManagerRef);

    const slabBuilder = new SlabFragmentBuilder(scene, bimManager);
    window.slabBuilder = slabBuilder;

    // §COLUMN-AUDIT-2026 §W9: late-bind slabStore into ColumnFragmentBuilder
    //   so build() can resolve the slab top under each column.
    columnBuilder.setSpatialDeps({ slabStore });

    // §SLAB-LISTENER-FIX-2026-05-18: SlabStore.emit() fires the canonical
    // DOMEventBus shape { id: string } (F.events.18 — "typed bus replaces
    // variable CustomEvent"). The three listeners below were written against
    // an older shape { slab: SlabData } / { slabId: string } that no longer
    // matches, so they silently short-circuited on every event — slabs were
    // never rendered in 3D (no mesh) or in plan view (no overhead symbol).
    //
    // Fix: resolve the id from the canonical field (e.detail.id), with a ??
    // fallback to the legacy field names so any caller that still emits the
    // old shape continues to work.  For add/update, look up the full SlabData
    // from slabStore.getById() before passing to SlabFragmentBuilder (which
    // requires a complete SlabData, not just an id).
    window.addEventListener('bim-slab-added', (e: any) => {
        const id: string | undefined = e.detail?.id ?? e.detail?.slab?.id;
        if (!id) return;
        const data = slabStore.getById(id);
        if (data) slabBuilder.updateSlab(data);
    });
    window.addEventListener('bim-slab-updated', (e: any) => {
        const id: string | undefined = e.detail?.id ?? e.detail?.slab?.id;
        if (!id) return;
        const data = slabStore.getById(id);
        if (data) slabBuilder.updateSlab(data);
    });
    window.addEventListener('bim-slab-removed', (e: any) => {
        const id: string | undefined = e.detail?.id ?? e.detail?.slabId;
        if (!id) return;
        slabBuilder.removeSlab(id);
    });
    console.log('[initBuilders] Slab subsystem initialised');
    bootStep('slab');

    // ── Ceiling subsystem ─────────────────────────────────────────────────────
    const ceilingStore = new CeilingStore();
    window.ceilingStore          = ceilingStore; // TODO(TASK-08)
    window.ceilingSystemTypeStore = ceilingSystemTypeStore; // TODO(TASK-08)

    const ceilingBuilder = new CeilingPanelBuilder(scene, bimManager);

    // §DOM-EVENT-LISTENER-AUDIT-2026-05-18: CeilingStore emits { id } (F.events.18
    // canonical shape).  Old listeners guarded on e.detail.ceiling (full object) and
    // e.detail.ceilingId — both always undefined → buildCeiling/removeCeiling never
    // called → no ceiling geometry rendered.  Fix mirrors the slab listener fix:
    // resolve id from the canonical field, look up full data from the store.
    window.addEventListener('bim-ceiling-added', (e: any) => {
        const id: string | undefined = e.detail?.id ?? e.detail?.ceiling?.id;
        if (!id) return;
        const data = ceilingStore.getById(id);
        if (data) ceilingBuilder.buildCeiling(data);
    });
    window.addEventListener('bim-ceiling-updated', (e: any) => {
        const id: string | undefined = e.detail?.id ?? e.detail?.ceiling?.id;
        if (!id) return;
        const data = ceilingStore.getById(id);
        if (data) ceilingBuilder.buildCeiling(data);
    });
    window.addEventListener('bim-ceiling-removed', (e: any) => {
        const id: string | undefined = e.detail?.id ?? e.detail?.ceilingId;
        if (!id) return;
        ceilingBuilder.removeCeiling(id);
    });
    console.log('[initBuilders] Ceiling subsystem initialised');
    bootStep('ceiling');

    // ── Floor subsystem ───────────────────────────────────────────────────────
    const floorStore = new FloorStore();
    window.floorStore          = floorStore; // TODO(TASK-08)
    window.floorSystemTypeStore = floorSystemTypeStore; // TODO(TASK-08)

    const floorBuilder = new FloorPanelBuilder(scene, bimManager);

    // §DOM-EVENT-LISTENER-AUDIT-2026-05-18: FloorStore emits { id } (F.events.17
    // canonical shape).  Old listeners guarded on e.detail.floor / e.detail.floorId
    // — both always undefined → buildFloor/removeFloor never called → no floor
    // finish geometry rendered.  Fix: resolve id then look up full data from store.
    window.addEventListener('bim-floor-added', (e: any) => {
        const id: string | undefined = e.detail?.id ?? e.detail?.floor?.id;
        if (!id) return;
        const data = floorStore.getById(id);
        if (data) floorBuilder.buildFloor(data);
    });
    window.addEventListener('bim-floor-updated', (e: any) => {
        const id: string | undefined = e.detail?.id ?? e.detail?.floor?.id;
        if (!id) return;
        const data = floorStore.getById(id);
        if (data) floorBuilder.buildFloor(data);
    });
    window.addEventListener('bim-floor-removed', (e: any) => {
        const id: string | undefined = e.detail?.id ?? e.detail?.floorId;
        if (!id) return;
        floorBuilder.removeFloor(id);
    });

    const floorSlabBindingHandler = new FloorSlabBindingHandler({ floorStore, bimManager });
    floorSlabBindingHandler.attach();
    console.log('[initBuilders] Floor finish subsystem initialised');
    bootStep('floor-finish');

    // ── Room subsystem ────────────────────────────────────────────────────────
    // §ADR-0318-ELEMENTS-SLOT (per-kind adoption, room) — adopt the module
    // singleton and attach the engine half. See the wall note below for why a
    // `new RoomStore(...)` here would break I-1.
    const roomStore = roomStoreSingleton.attachEngine(projectContext, bimManager);
    window.roomStore = roomStore; // TODO(TASK-08)

    const roomBoundaryBuilder = new RoomBoundaryBuilder(scene, bimManager);
    window.roomBoundaryBuilder = roomBoundaryBuilder;

    // §13 / C3 fix: explicit DI for the boundary builder. workspaceController
    // and hierarchyStore are module singletons safe to import here; passing
    // them directly removes the implicit window-global runtime lookup.
    bootStep('room (stores + builders, pre-DI)');
    try {
        // §STARTUP-BUILDERS-LEG — MEASURED NOT TO BE A CHUNK DOWNLOAD. Both specifiers are
        // already in the engine chunk: `@app/ui/WorkspaceController` is a STATIC import in
        // `engineLauncher.ts:23`, and `@pryzm/core-app-model` is a static import at the top of
        // this file and is routed to the `domain-engine` manual chunk by `vite.config.ts`. So
        // this `await` costs a microtask, not a round trip — but it does YIELD the main thread,
        // which is why it gets its own `await:` step rather than being folded into `room`.
        const [{ workspaceController }, { hierarchyStore }] = await Promise.all([
            import('@app/ui/WorkspaceController'),
            import('@pryzm/core-app-model'),
        ]);
        bootStep('await:WorkspaceController + core-app-model');
        roomBoundaryBuilder.attachDependencies({
            roomStore,
            workspaceController,
            hierarchyStore,
        });
    } catch (err) {
        console.warn('[initBuilders] RoomBoundaryBuilder DI wiring deferred:', err);
    }

    const roomLabelRenderer = new RoomLabelRenderer(scene, bimManager);
    // §ROOM-LABELS-TOGGLE (2026-06-10) — expose so the BottomActionMenu toggle
    // button can call setRoomLabelsVisible(); mirrors window.roomBoundaryBuilder.
    window.roomLabelRenderer = roomLabelRenderer;

    // Projection Layer Binding: RoomStore → RoomBoundaryBuilder + RoomLabelRenderer
    // NOTE: bim-room-* events carry { id, levelId } — look up full room from store.
    window.addEventListener('bim-room-added', (e: any) => {
        const room = roomStore.getById(e.detail?.id);
        if (room) {
            roomBoundaryBuilder.updateRoom(room);
            roomLabelRenderer.updateRoom(room);
        }
    });
    window.addEventListener('bim-room-updated', (e: any) => {
        const room = roomStore.getById(e.detail?.id);
        if (room) {
            roomBoundaryBuilder.updateRoom(room);
            roomLabelRenderer.updateRoom(room);
        }
    });
    window.addEventListener('bim-room-removed', (e: any) => {
        const roomId = e.detail?.id;
        if (roomId) {
            roomBoundaryBuilder.removeRoom(roomId);
            roomLabelRenderer.removeRoom(roomId);
        }
    });

    // §07 / M8 fix: cascading cleanup when a level is removed.  Mirrors
    // StairLevelCleanupHandler / SlabLevelCleanupHandler so rooms can no
    // longer leak past the lifetime of their host level.
    const roomLevelCleanupHandler = new RoomLevelCleanupHandler(roomStore, bimManager);
    // Lifecycle-only object: constructor subscribes to level-removed events.
    // Must be retained so the subscription stays alive. Wave 7: shim.
    void roomLevelCleanupHandler;

    // §13 / M3 fix: explicit static-DI for RoomRelationshipService.
    // The window fallback remains in place but every spatial query now goes
    // through the injected reference, eliminating the runtime resolution.
    RoomRelationshipService.setRoomStore(roomStore);

    // §6.4 Room Containment Query Contract — single canonical answer for
    // "what elements are in / on / adjacent to room R?". Constructor DI for
    // every store known at this point; further stores (door/window/slab/
    // furniture/plumbing/lighting/beam/handrail/stair/annotation/curtainwall)
    // are attached lazily from below in this file once they have been
    // instantiated. The service degrades gracefully — any unattached store
    // simply yields an empty bucket, so partial wiring never throws.
    const roomContentsService = new RoomContentsService({
        roomStore,
        bimManager,
    });
    window.roomContentsService = roomContentsService;

    console.log('[initBuilders] Room subsystem initialised');
    bootStep('room');

    // ── Door / Window singleton stores ────────────────────────────────────────
    // doorStore and windowStore are module-level singletons (not instantiated here).
    // Exposed on window so RoomGraphService, RoomFinishResolver, etc. can read them.
    window.doorStore   = doorStore; // TODO(TASK-08)
    window.windowStore = windowStore; // TODO(TASK-08)
    console.log('[initBuilders] Door/Window singleton stores exposed on window');
    bootStep('door/window stores');

    // ── Wall Store ────────────────────────────────────────────────────────────
    // WallTool wraps this store; wallTool.getWallStore() returns this instance.
    // DoorBuilder and WindowBuilder take it by reference (read-only, §03 compliant).
    // §ADR-0318-ELEMENTS-SLOT (per-kind adoption, wall) — ADOPT the module
    // singleton and attach the engine half, instead of constructing a rival.
    // This is what makes ADR-0318 I-1 true BY CONSTRUCTION for walls: the object
    // handed below to `registerAllStores()` and to `initPersistence()` (hence to
    // ProjectSerializer) is the SAME object `composeRuntime` registers under
    // `stores.elements.get('wall')`. A `new WallStore(...)` here would fork them
    // and reproduce the plugin-DTO defect at the engine boundary.
    const wallStore = wallStoreSingleton.attachEngine(projectContext, bimManager);
    window.wallStore = wallStore; // TODO(TASK-08)
    console.log('[WallStore] attached to window', window.wallStore); // TODO(TASK-08)
    // §FIX-PLAN-LAYERED-WALL-SYMBOL (L-62) — install the plan layer-line symbol builder now
    // that wallStore exists; EdgeProjectorService reads the resolved singleton from here on
    // (falls back to window.wallStore until this runs).
    installWallLayerPlanSymbolBuilder(wallStore);

    // ── Wall + Slab type stores — async parallel import ───────────────────────
    // These are module-level singletons from their respective files; the dynamic
    // import avoids a heavy static import at bootstrap top level (PERF-FIX-#2).
    bootStep('wall (store + plan-symbol builder)');
    const [{ wallSystemTypeStore }, { slabSystemTypeStore }] = await Promise.all([
        import('@pryzm/geometry-wall'),
        import('@pryzm/geometry-slab'),
    ]);
    bootStep('await:geometry-wall + geometry-slab type stores');
    window.wallSystemTypeStore = wallSystemTypeStore; // TODO(TASK-08)
    window.slabSystemTypeStore = slabSystemTypeStore; // TODO(TASK-08)
    // §CW90 item 5 — publish the curtain-wall type catalogue for the chat
    // bridge's ctx.catalogues['curtain-wall'] row (ZeroTokenChatBridge
    // buildCatalogueChannel reads window.curtainWallTypeStore).
    const { curtainWallTypeStore } = await import('@pryzm/core-app-model/stores');
    bootStep('await:curtainWallTypeStore');
    window.curtainWallTypeStore = curtainWallTypeStore; // TODO(TASK-08)
    console.log('[initBuilders] Wall + Slab system type stores loaded');
    bootStep('wall');

    // ── Roof subsystem ────────────────────────────────────────────────────────
    // §ROOF-SYSTEM-AUDIT-2026 §10.2: retain the cleanup handler reference so its
    // dispose() lifecycle can be invoked on engine teardown (was: discarded ref
    // → listener leaked across SPA navigations).
    const roofStore = new RoofStore(projectContext);
    const roofLevelCleanupHandler = new RoofLevelCleanupHandler(roofStore);
    // Lifecycle-only object: constructor subscribes to level-removed events.
    // Must be retained so the subscription stays alive. Wave 7: shim.
    void roofLevelCleanupHandler;

    // §M-H1 follow-up (DAILY-USE-AUDIT 2026-05-20) — thread the same
    // STANDARD_MATERIAL_LIBRARY map into RoofFragmentBuilder that WallTool now
    // threads into WallFragmentBuilder, so user-picked roof materials render
    // as real PBR (terracotta tile, zinc seam, slate, etc.) instead of flat
    // shingle colour. Lazy dynamic import keeps `initBuilders` decoupled from
    // a renderer-layer library at module load time; the map is module-scoped
    // + immutable so a single resolution per builder suffices.
    let _roofMaterialMap: ReadonlyMap<string, BuilderMaterialDef> | undefined;
    // §FEAT-LANDSCAPE-SLAB-TYPES (L-963) — the SAME map, for the slab builder.
    // `SlabBuilderDeps.materialMap` is typed `Map`, not `ReadonlyMap`, so it gets
    // its own binding rather than a cast. Injected at the setDeps call below.
    let _slabMaterialMap: Map<string, any> | undefined;
    bootStep('roof (store + cleanup handler)');
    try {
        const matLib = await import('@pryzm/core-app-model/material-library');
        bootStep('await:material-library');
        _roofMaterialMap = new Map(matLib.STANDARD_MATERIAL_LIBRARY.map(m => [m.id, m] as const));
        _slabMaterialMap = new Map(matLib.STANDARD_MATERIAL_LIBRARY.map(m => [m.id, m] as const));
    } catch (err) {
        console.warn('[initBuilders] §M-H1 roof materialMap unavailable (non-fatal):', err);
    }
    const roofBuilder = new RoofFragmentBuilder(scene, bimManager, undefined, _roofMaterialMap);

    // §DOM-EVENT-LISTENER-AUDIT-2026-05-18: RoofStore emits { id } (F.events.18
    // canonical shape).  Old listeners guarded on e.detail.roof / e.detail.roofId
    // — both always undefined → updateRoof/removeRoof never called → no roof
    // geometry rendered and slope-arrow cleanup never ran.  Fix: resolve id then
    // look up full data from store.  Roof remove also cleans up slope-arrow
    // annotations — use the resolved id consistently for the filter.
    window.addEventListener('bim-roof-added', (e: any) => {
        const id: string | undefined = e.detail?.id ?? e.detail?.roof?.id;
        if (!id) return;
        const data = roofStore.getById(id);
        if (data) roofBuilder.updateRoof(data);
    });
    window.addEventListener('bim-roof-updated', (e: any) => {
        const id: string | undefined = e.detail?.id ?? e.detail?.roof?.id;
        if (!id) return;
        const data = roofStore.getById(id);
        if (data) roofBuilder.updateRoof(data);
    });
    window.addEventListener('bim-roof-removed', (e: any) => {
        const id: string | undefined = e.detail?.id ?? e.detail?.roofId;
        if (!id) return;
        roofBuilder.removeRoof(id);
        // ROOF-SYSTEM-AUDIT-2026 Bug 2 fix: delete any slope-arrow annotations
        // that were created for this roof so they don't linger in the plan view.
        annotationStore.getAll()
            .filter(a => a.type === 'roof-slope-arrow' && a.parameters?.['roofId'] === id)
            .forEach(a => annotationStore.remove(a.id));
    });
    console.log('[initBuilders] Roof subsystem initialised');
    bootStep('roof');

    // ── Plumbing subsystem ────────────────────────────────────────────────────
    const plumbingStore = new PlumbingStore();
    window.plumbingStore = plumbingStore; // TODO(TASK-08)

    const plumbingBuilder = new PlumbingFragmentBuilder(scene);

    // §FURN-PLUMB-3D-PREVIEW-OK-COMMIT-BROKEN (DAILY-USE 2026-05-21) — Same
    // payload-shape regression as the furniture listener (Round 17 §70 fix).
    // PlumbingStore.add() emits `bim-plumbing-added { id }` (geometry-plumbing/
    // PlumbingStore.ts:11) and core-app-model PlumbingStore matches; the
    // listener guarded on `e.detail?.fixture` (full object) which the store
    // NEVER emits. Every plumbing add was silently dropped. Plan view +
    // Project Browser read the store directly so they correctly showed the
    // new fixture; the 3D scene stayed empty. The architect reported
    // "Furniture and plumbing fixture render on 3d preview - but not
    // possible creation or rendering on 3d" — same shape as the furniture
    // payload-mismatch bug Round 17 closed.
    //
    // Fix: resolve the fixture from the store using the `id` carried on the
    // payload. Backward-compat with any legacy caller passing `fixture`
    // inline. Same `_resolveFromEvent` pattern as the furniture listener;
    // matches the §3.5 invariant "builders refetch from the authoritative
    // store; never trust event payloads as transport".
    const _resolvePlumbingFromEvent = (e: { detail?: { id?: string; fixture?: unknown; fixtureId?: string } }): unknown | null => {
        const inline = e.detail?.fixture;
        if (inline) return inline;
        const id = e.detail?.id ?? e.detail?.fixtureId;
        if (!id) return null;
        const _ps = plumbingStore as { get?(id: string): unknown };
        return _ps.get?.(id) ?? null;
    };
    window.addEventListener('bim-plumbing-added', (e: Event) => {
        const f = _resolvePlumbingFromEvent(e as CustomEvent<{ id?: string; fixture?: unknown }>);
        if (f) plumbingBuilder.updateFixture(f as any);
        else console.warn('[PlumbingBuilder] bim-plumbing-added — no id/fixture in payload, and store has no matching record');
    });
    window.addEventListener('bim-plumbing-updated', (e: Event) => {
        const f = _resolvePlumbingFromEvent(e as CustomEvent<{ id?: string; fixture?: unknown }>);
        if (f) plumbingBuilder.updateFixture(f as any);
    });
    window.addEventListener('bim-plumbing-removed', (e: any) => {
        const id = e.detail?.id ?? e.detail?.fixtureId;
        if (id && (plumbingBuilder as { removeFixture?(id: string): void }).removeFixture) {
            try { (plumbingBuilder as { removeFixture(id: string): void }).removeFixture(id); }
            catch (err) {
                console.warn('[PlumbingBuilder] bim-plumbing-removed failed', { id, message: (err as Error)?.message ?? String(err) });
            }
        }
    });
    console.log('[initBuilders] Plumbing subsystem initialised');
    bootStep('plumbing');

    // ── Opening subsystem ─────────────────────────────────────────────────────
    const openingStore = new OpeningStore(projectContext);
    window.openingStore = openingStore; // TODO(TASK-08)
    new OpeningCleanupHandler(openingStore);

    // OPENING-FIX §01 §4.3 / O1: Inject openingStore into slabBuilder.
    //
    // SlabFragmentBuilder was created BEFORE openingStore (slab subsystem is
    // initialised first at line 296 to satisfy the event-listener ordering
    // contract).  setDeps() is the contractual post-construction injection
    // mechanism — see SlabBuilderDeps interface and the FIX-5 comment block.
    //
    // Without this call, this._deps.openingStore is always undefined; the guard
    //   if (openingStore) { ... }
    // at SlabFragmentBuilder.ts:654 is always false, so openingHoles[] stays
    // empty and buildSlabGeometry() receives zero holes — no hole is ever punched
    // into the slab geometry even though CreateOpeningCommand runs successfully.
    // §FEAT-LANDSCAPE-SLAB-TYPES (L-963) — `materialMap` is injected HERE, and it
    // never was before. `SlabBuilderDeps` has declared it since FIX-5, and
    // `SlabFragmentBuilder`'s material branch reads
    //   `if (data.materialId && materialMap)`
    // — but the only construction of this builder (above) passes no deps and the
    // only setDeps call was this line with `{ openingStore }` alone. So the map was
    // ALWAYS undefined, that branch was DEAD IN PRODUCTION, and every slab in the
    // product has been rendering from a raw hex with the master catalogue's
    // metalness/roughness discarded. The roof builder four hundred lines up already
    // threads the identical map (§M-H1); the slab was simply never given it.
    //
    // Routing around a dead branch the feature needs would have meant resolving
    // colours in the builder and quietly leaving the PBR half broken.
    slabBuilder.setDeps({ openingStore, materialMap: _slabMaterialMap });
    // §ROOF-HOSTED-OPENINGS — the SAME injection for the roof builder, for the
    // same reason spelled out above. `CreateRoofOpeningCommand` writes the
    // skylight into `openingStore`; without this line `RoofFragmentBuilder`
    // cannot read it back, `RoofGeometryBuilder.generate` receives zero holes and
    // takes the untouched original path, and the roof renders SOLID while the
    // command reports success. §COMMITTED-IS-NOT-REACHABLE — this line is what
    // makes the feature exist for the user rather than only for the store.
    roofBuilder.setDeps({ openingStore });
    console.log('[initBuilders] Opening subsystem initialised — openingStore injected into slabBuilder + roofBuilder');
    bootStep('opening');

    // ── Door + Window builders ─────────────────────────────────────────────────
    // Both builders self-subscribe to their respective stores via activate().
    // wallStore is passed read-only (§03 compliant).
    const doorBuilder = new DoorBuilder(scene, wallStore);
    doorBuilder.activate();

    const windowBuilder = new WindowBuilder(scene, wallStore);
    // §INSTANCE-WINDOWS (2026-07-01) — inject the GPU-instancing bridge over the
    // SAME shared renderer walls/columns/beams use. DEFAULT-OFF: window sub-meshes
    // (frame bars + glass panes) only route to instancing when
    // globalThis.__pryzmElementInstancingV1 === true; otherwise every window stays
    // on the individual-mesh path. Material SHARING (the always-on part of
    // §INSTANCE-WINDOWS) is independent of this flag and always active. Mirrors the
    // columnBuilder instance-bridge wiring above.
    try {
        windowBuilder.setInstanceBridge(new ElementInstanceBridge(instancedElementRenderer));
    } catch (instErr) {
        console.warn('[initBuilders] §INSTANCE-WINDOWS window instance bridge wiring failed:', instErr);
    }
    windowBuilder.activate();

    // §DOOR-AUDIT-2026 P2 #12 / §WIN-AUDIT-2026 W9 — element-class dependency
    // trackers + level cleanup handlers. Bootstrap the trackers from current
    // store contents so they index pre-existing project data on hot reload.
    const doorTracker = new DoorDependencyTracker(commandManagerRef, wallStore);
    doorTracker.bootstrap();
    new DoorLevelCleanupHandler(wallStore, commandManagerRef);

    const windowTracker = new WindowDependencyTracker(commandManagerRef, wallStore);
    windowTracker.bootstrap();
    new WindowLevelCleanupHandler(wallStore, commandManagerRef);

    console.log('[initBuilders] Door + Window builders activated (with dependency trackers)');
    bootStep('door+window builders');

    // ── Furniture subsystem ───────────────────────────────────────────────────
    const furnitureStore = new FurnitureStore();
    window.furnitureStore = furnitureStore; // TODO(TASK-08)

    const furnitureBuilder = new FurnitureFragmentBuilder(scene);
    // §PERF-WEBGPU-FURNITURE-INSTANCING (2026-06-26) — wire the furniture
    // GPU-instancing bridge to the SAME shared InstancedElementRenderer that
    // walls/columns/beams use. Default-OFF behind __pryzmFurnitureInstancingV1
    // (a separate switch from the wall/element flag), so this is inert until the
    // flag is explicitly enabled and verified in-browser. Mirrors the columnBuilder
    // / beamBuilder instance-bridge wiring above.
    try {
        furnitureBuilder.setInstanceBridge(
            new FurnitureInstanceBridge(instancedElementRenderer),
            isFurnitureInstancingEnabled,
        );
    } catch (instErr) {
        console.warn('[initBuilders] §PERF-WEBGPU-FURNITURE-INSTANCING furniture instance bridge wiring failed:', instErr);
    }
    // §09 F-09: expose the builder as a non-enumerable, non-writable handle so it
    // does not leak through `Object.keys(window)` enumeration or get reassigned by
    // untrusted scripts at runtime. Existing callers that read it directly continue
    // to work; we just make it less discoverable from a hostile console session.
    Object.defineProperty(window, 'furnitureFragmentBuilder', {
        value: furnitureBuilder,
        writable: false,
        configurable: true,
        enumerable: false,
    });

    // Furniture DOM event listeners — wired here so they close over the live
    // furnitureBuilder reference.  Previously lived in EngineBootstrap (Phase F-1 move).
    // Listeners are wrapped in try/catch because dispatchEvent reports any
    // synchronous listener exception as "Uncaught" via window.onerror but
    // continues normally — meaning a single bad furniture item (e.g. a legacy
    // corner_wardrobe with missing schema fields) would otherwise corrupt the
    // scene silently and leave a half-built root behind. We catch, dispose
    // the partial root, and emit a structured warning the user can act on.
    const _safeFurnitureUpdate = (eventName: string, fd: any) => {
        try {
            furnitureBuilder.updateFurniture(fd);
        } catch (err: any) {
            console.warn(`[FurnitureBuilder] ${eventName} failed for item`, {
                id: fd?.id,
                furnitureType: fd?.furnitureType,
                furnitureCategory: fd?.furnitureCategory,
                message: err?.message ?? String(err),
            });
            // Best-effort cleanup: remove any half-built root so it doesn't
            // sit invisible in the scene and trip up subsequent re-validation.
            try { if (fd?.id) furnitureBuilder.removeFurniture(fd.id); } catch { /* noop */ }
        }
    };
    // §FURNITURE-3D-RENDER-REGRESSION (DAILY-USE 2026-05-21) — The store
    // dispatches `bim-furniture-added`/`-updated`/`-removed` with payload
    // `{ id }` only (FurnitureStore.ts:23, 34, 44 — both the legacy
    // packages/geometry-furniture store AND the new core-app-model store).
    // Previously these listeners checked `e.detail?.furniture` (a full
    // furniture object), which the store NEVER emits — so the guard silently
    // dropped every event and the 3D mesh never built. Plan view + Project
    // Browser read the store directly so they correctly showed the new
    // furniture; the 3D scene stayed empty. The architect reported
    // "the element seems to be on the store ... but cannot see it on the
    // 3d scene" — exactly this disconnect.
    //
    // Architectural fix: payload carries only the id; the listener
    // dereferences it against the store (the store is the source of truth,
    // not the event payload — matches the §3.5 invariant that builders
    // never trust event payloads, they refetch from the authoritative store).
    // Backward-compat: if a legacy caller still passes `e.detail.furniture`
    // inline, that path also fires — defensive `??` handles both shapes.
    const _resolveFurnitureFromEvent = (e: { detail?: { id?: string; furniture?: unknown; furnitureId?: string } }): unknown | null => {
        const inline = e.detail?.furniture;
        if (inline) return inline;
        const id = e.detail?.id ?? e.detail?.furnitureId;
        if (!id) return null;
        return furnitureStore.get(id) ?? null;
    };
    window.addEventListener('bim-furniture-added', (e: Event) => {
        const fd = _resolveFurnitureFromEvent(e as CustomEvent<{ id?: string; furniture?: unknown }>);
        if (fd) _safeFurnitureUpdate('bim-furniture-added', fd);
        else console.warn('[FurnitureBuilder] bim-furniture-added — no id/furniture in payload, and store has no matching record');
    });
    window.addEventListener('bim-furniture-updated', (e: Event) => {
        const fd = _resolveFurnitureFromEvent(e as CustomEvent<{ id?: string; furniture?: unknown }>);
        if (fd) _safeFurnitureUpdate('bim-furniture-updated', fd);
    });
    window.addEventListener('bim-furniture-removed', (e: any) => {
        // Removed: cannot resolve from store (record is already gone). Read
        // id from payload — payload key is either `id` (new shape) or
        // `furnitureId` (legacy shape). Both supported.
        const id = e.detail?.id ?? e.detail?.furnitureId;
        if (id) {
            try {
                furnitureBuilder.removeFurniture(id);
            } catch (err: any) {
                console.warn('[FurnitureBuilder] bim-furniture-removed failed', {
                    id,
                    message: err?.message ?? String(err),
                });
            }
        }
    });

    console.log('[initBuilders] Furniture subsystem initialised');
    bootStep('furniture');

    // ── Lighting subsystem ────────────────────────────────────────────────────
    const lightingStore = new LightingStore();
    window.lightingStore = lightingStore; // TODO(TASK-08)

    const lightingBuilder = new LightingFragmentBuilder();
    lightingBuilder.setScene(scene);
    window.lightingBuilder = lightingBuilder;

    // §FEAT-FIXTURE-PHOTOMETRY — importance origin for the live-light budget.
    // The fixtures NEAREST the camera get a real THREE PointLight; the rest keep
    // only their (photometry-driven) emissive lens, so they still read as
    // switched-on. Without a focus the ordering falls back to distance-from-origin,
    // which is deterministic but arbitrary.
    //
    // ⭐ §LIGHT102 (L-11427, 2026-08-26) — WIRED UNCONDITIONALLY, RESOLVED LATE.
    //
    // This block used to read `window.world.camera.three` HERE and install the
    // provider only `if (cam?.position)`. When the camera was not yet on `window`
    // at this point in boot, NOTHING was wired — not then, not later — and every
    // fixture in that session was ranked by distance from the WORLD ORIGIN. The
    // budget still worked and was still deterministic, so it never looked broken;
    // it just lit the wrong three fixtures for the rest of the session, and the
    // only trace was `focused: false` on L-11420's honesty stamp.
    //
    // The camera is now resolved INSIDE the closure, on every budget sync, and the
    // provider returns `null` when there is genuinely no camera — so a camera that
    // arrives after `initBuilders` is picked up on the next add/remove/tier change,
    // and `focused` reports what actually happened rather than what was installed.
    // Same reasoning as the handrail instance-bridge injection below: gate the USE,
    // never the wiring, or flipping the condition changes nothing at runtime.
    try {
        lightingBuilder.setFocusProvider(() => {
            const pos = (window.world?.camera?.three as { position?: { x: number; y: number; z: number } } | undefined)?.position;
            return pos ? { x: pos.x, y: pos.y, z: pos.z } : null;
        });
    } catch (focusErr) {
        console.warn('[initBuilders] §FEAT-FIXTURE-PHOTOMETRY light-budget focus wiring failed:', focusErr);
    }

    console.log('[initBuilders] Lighting subsystem initialised');
    bootStep('lighting');

    // ── Handrail subsystem ────────────────────────────────────────────────────
    const handrailStore = new HandrailStore(projectContext);
    window.handrailStore = handrailStore; // TODO(TASK-08)
    new HandrailLevelCleanupHandler(handrailStore);

    const handrailBuilder = new HandrailFragmentBuilder(scene, bimManager);
    // ADR-0076 Axis 3 (§PERF-WEBGPU-FRAGMENT / §PERF-RAIL-INSTANCING) — inject the
    // GPU-instancing bridge over the SAME shared renderer walls + columns + beams use.
    //
    // ⚠ CORRECTED 2026-08-21 (§NAV-SMOOTHNESS, L-1781). This said "DEFAULT-OFF: the
    // repeated handrail balusters + posts only instance when
    // globalThis.__pryzmElementInstancingV1 === true". `handrail` is now DEFAULT-ON
    // via the per-family table in `ElementInstanceBridge._FAMILY_DEFAULTS`, which the
    // builder finally consults — it used to call `isElementInstancingEnabled()` with
    // no argument (the legacy master-only contract), so its per-family row was
    // authored-but-unwired. Measured worth, through the real builders into a real
    // scene: 240 railing elements 4920 → 250 draw calls, 19.7x.
    // `__pryzmElementInstancingV1 = false` remains a true kill switch.
    //
    // ⭐ THIS INJECTION IS UNCONDITIONAL AND MUST STAY SO. The flag decides whether
    // the builder USES the bridge; if the bridge were itself gated, flipping the
    // default would change nothing at runtime — the shape this lane found and fixed.
    try {
        handrailBuilder.setInstanceBridge(new ElementInstanceBridge(instancedElementRenderer));
    } catch (instErr) {
        console.warn('[initBuilders] §PERF-RAIL-INSTANCING handrail instance bridge wiring failed:', instErr);
    }

    // §A.21.D29 — HandrailStore.emit() dispatches `bim-handrail-*` with detail
    // `{ id }` (the handrail id only — see HandrailStore.emit). The previous
    // listeners read `e.detail.handrail` / `e.detail.handrailId`, which are
    // ALWAYS undefined for this payload → the builder NEVER ran, so handrails
    // (e.g. the generated-house stairwell-void guardrail) landed in the store
    // but rendered no mesh. FIX: read `e.detail.id`, resolve the full record
    // from the store, and build it. Builds the manual railing tool the same way
    // for any caller routing through CreateHandrailCommand/HandrailStore.
    const buildHandrailById = (id: unknown): void => {
        if (typeof id !== 'string') return;
        const h = handrailStore.getById(id);
        if (h) handrailBuilder.updateHandrail(h);
    };
    window.addEventListener('bim-handrail-added',
        (e: any) => buildHandrailById(e.detail?.id ?? e.detail?.handrail?.id));
    window.addEventListener('bim-handrail-updated',
        (e: any) => buildHandrailById(e.detail?.id ?? e.detail?.handrail?.id));
    window.addEventListener('bim-handrail-removed',
        (e: any) => { const id = e.detail?.id ?? e.detail?.handrailId; if (typeof id === 'string') handrailBuilder.removeHandrail(id); });
    console.log('[initBuilders] Handrail subsystem initialised');
    bootStep('handrail');

    // ── Stair subsystem ───────────────────────────────────────────────────────
    const stairStore = new StairStore(projectContext);
    window.stairStore = stairStore; // TODO(TASK-08)
    new StairLevelCleanupHandler(stairStore);

    const stairMeshBuilder = new StairMeshBuilder(stairStore, scene);

    const stairTypeStore = new StairTypeStore();
    stairMeshBuilder.setTypeStore(stairTypeStore);

    const stairLandingStore = new StairLandingStore();

    const stairLandingBuilder = new StairLandingBuilder(stairLandingStore, scene);

    const stairRailingStore = new StairRailingStore();
    window.stairRailingStore = stairRailingStore; // TODO(TASK-08)

    const stairRailingBuilder = new StairRailingBuilder(stairRailingStore, scene, stairStore);
    // ADR-0076 Axis 3 (§PERF-WEBGPU-FRAGMENT / §PERF-RAIL-INSTANCING) — inject the
    // GPU-instancing bridge so the repeated stair-railing posts + balusters (the
    // ~200-300 post / ~500-1000 baluster mesh multiplier the spike measured) route
    // through the shared InstancedMesh.
    //
    // ⚠ CORRECTED 2026-08-21 (§NAV-SMOOTHNESS, L-1781). This said "DEFAULT-OFF: only
    // instances when globalThis.__pryzmElementInstancingV1 === true". `stairRailing`
    // is now DEFAULT-ON. Its recorded blocker — "safe, but it leaks" — was retired by
    // MEASUREMENT, not by assertion: after deleting every railing, 5 railings retain
    // ONE material and 50 railings retain ONE material (constant, handed back at
    // project close), against a 19.7x draw-call collapse.
    // `__pryzmElementInstancingV1 = false` remains a true kill switch.
    try {
        stairRailingBuilder.setInstanceBridge(new ElementInstanceBridge(instancedElementRenderer));
    } catch (instErr) {
        console.warn('[initBuilders] §PERF-RAIL-INSTANCING stair-railing instance bridge wiring failed:', instErr);
    }

    console.log('[initBuilders] Stair subsystem initialised');
    bootStep('stair');

    // ── Lift / vertical-circulation subsystem ──────────────────────────────────
    // Peer of the stair subsystem (mirror of the StairStore/StairMeshBuilder wiring
    // above). The CreateVerticalCirculationCommand reads ctx.stores.liftStore; the
    // LiftMeshBuilder is driven by the `bim-lift-added/-updated/-removed` events the
    // LiftStore emits. Residential-building multi-family core renders the lift here.
    const liftStore = new LiftStore(projectContext);
    window.liftStore = liftStore; // TODO(TASK-08)

    const liftMeshBuilder = new LiftMeshBuilder(liftStore, scene);

    // FEAT-LIFT-OBSERVATION-FRAME (L-9400). Driven by the `lift.created` bus event
    // through the FT-LIFT subscriber in initTools.ts — NOT by a store event, because
    // the compound's records live in the plugin `lift` / `liftPart` Immer stores and
    // there is no legacy store for it to listen to. That absence was the third of
    // the founder's three render gaps, and the only one that needed something built
    // rather than connected.
    // C13-BUILDER-SCENE-CLEAR: it is ON the `bim-project-cleared` sweep list below.
    // A lift compound left in the scene across a project switch is a steel tower
    // standing in the next project — L-8101's shape, which is exactly what happens
    // to a new builder whose author does not add the row.
    const liftCompoundMeshBuilder = new LiftCompoundMeshBuilder(scene);

    const liftTypeStore = new LiftTypeStore();

    console.log('[initBuilders] Lift subsystem initialised');
    bootStep('lift');

    // ── Beam subsystem ────────────────────────────────────────────────────────
    const beamStore = new BeamStore(projectContext);
    window.beamStore = beamStore; // TODO(TASK-08)
    new BeamLevelCleanupHandler(beamStore);

    const beamBuilder = new BeamFragmentBuilder(scene);
    // ADR-0076 Axis 3 (§PERF-WEBGPU-FRAGMENT / §PERF-BEAM-INSTANCING) — inject the
    // GPU-instancing bridge over the SAME shared renderer walls + columns use.
    // DEFAULT-OFF: simple concrete rectangular beams only instance when
    // globalThis.__pryzmElementInstancingV1 === true; otherwise the builder stays
    // entirely on the fragment path. Mirrors the columnBuilder wiring above.
    try {
        beamBuilder.setInstanceBridge(new ElementInstanceBridge(instancedElementRenderer));
    } catch (instErr) {
        console.warn('[initBuilders] §PERF-BEAM-INSTANCING beam instance bridge wiring failed:', instErr);
    }
    beamStore.setBuilder(beamBuilder);
    console.log('[initBuilders] Beam subsystem initialised');
    bootStep('beam');

    // §6.4 Room Containment Query Contract — finalise the contents service
    // now that every element store has been instantiated. From this point on,
    // `roomContentsService.getContents(roomId)` returns the complete set of
    // bounding / hosted / contained / vertical-adjacent elements for any room.
    {
        // annotationStore is already statically imported at the top of this
        // file from '@pryzm/plugin-annotations'.  Using the static reference
        // here (rather than a lazy await import) keeps @pryzm/plugin-annotations
        // in a single Rollup chunk, eliminating circular-chunk warnings.
        roomContentsService.attach({
            wallStore,
            doorStore,
            windowStore,
            openingStore,
            slabStore,
            columnStore,
            curtainWallStore,
            furnitureStore,
            plumbingStore,
            lightingStore,
            beamStore,
            handrailStore,
            stairStore,
            annotationStore: annotationStore,
        });
        console.log('[initBuilders] RoomContentsService — all element stores attached');
    }

    // ── Grid subsystem ────────────────────────────────────────────────────────
    const gridStore = new GridStore(projectContext);
    window.gridStore = gridStore; // TODO(TASK-08)
    console.log('[initBuilders] Grid subsystem initialised');
    bootStep('grid');

    // ── Room Bounding Line subsystem ──────────────────────────────────────────
    // Store is a module-level singleton (roomBoundingLineStore) — no constructor args.
    // Builder listens to DOM events fired by the store on add/update/remove.
    window.roomBoundingLineStore = roomBoundingLineStore; // TODO(TASK-08)
    const roomBoundingLineBuilder = new RoomBoundingLineBuilder(scene, bimManager);

    // §FIX-RBL-IDONLY-EVENT-NO-RENDER (L-172): the F.events.17 catalog contract
    // for `bim-room-bounding-line-added/updated` is `{ id }`-only (see
    // event-bus/catalog.ts). The store persists the FULL record (with a valid
    // `placement`), so the handler must resolve id → full record via
    // roomBoundingLineStore.get(id) BEFORE calling build/rebuild — otherwise the
    // builder sees no placement.start/end and §RBL-PLACEMENT-GUARD skips every
    // line, so the dashed room-bounding lines never render. This mirrors the
    // sibling slab/roof handlers (id → store.getById → builder). We still accept a
    // full record passed inline in the detail for backward-compat.
    window.addEventListener('bim-room-bounding-line-added', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        const id: string | undefined = detail?.id;
        if (!id) return;
        const data = roomBoundingLineStore.get(id) ?? (detail?.placement ? detail : undefined);
        if (data) roomBoundingLineBuilder.build(data);
    });
    window.addEventListener('bim-room-bounding-line-updated', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        const id: string | undefined = detail?.id;
        if (!id) return;
        const data = roomBoundingLineStore.get(id) ?? (detail?.placement ? detail : undefined);
        if (data) roomBoundingLineBuilder.rebuild(data);
    });
    window.addEventListener('bim-room-bounding-line-removed', (e: Event) => {
        const data = (e as CustomEvent).detail;
        if (data?.id) roomBoundingLineBuilder.delete(data.id);
    });
    console.log('[initBuilders] RoomBoundingLine subsystem initialised');
    bootStep('room-bounding-line');

    // ── Room finish sync service ──────────────────────────────────────────────
    // Propagates room finish assignments to corresponding floor/ceiling records.
    // All dependencies (roomStore, floorStore, ceilingStore) are live at this point.
    const roomFinishSyncService = new RoomFinishSyncService({
        getRoomStore:    () => roomStore,
        getFloorStore:   () => floorStore,
        getCeilingStore: () => ceilingStore,
    });
    roomFinishSyncService.start();
    console.log('[initBuilders] RoomFinishSyncService started');
    bootStep('room-finish-sync');

    // ── §C13-BUILDER-SCENE-CLEAR — the project-switch scene sweep ─────────────
    //
    // C13 §3.8/§3.10: the scene graph is project-scoped state and needs ONE named
    // owner. This is it, and it lives HERE because this is the only scope in which
    // every builder instance is simultaneously in hand — the previous sweep
    // (`initTools.ts`, §FIX-BUILDER-ISOLATION-LEAK / L-320) could only reach the four
    // builders that happened to be threaded through `ToolsParams`, which is why the
    // other fifteen leaked their roots into the next project.
    //
    // `bim-project-cleared` is emitted by `ClearProjectCommand` (the data-side C13
    // teardown) on EVERY project-entry path, after the stores are emptied and before
    // the incoming snapshot is created — so a clear here can never race the new
    // project's own geometry.
    //
    // The verb is `clearProjectGeometry()`, NOT `dispose()`. See the header of
    // `projectScopedBuilderTeardown.ts`: several of these builders' `dispose()` is
    // terminal (it drops the very subscriptions the incoming project needs) and one
    // of them removes no roots at all.
    window.addEventListener('bim-project-cleared', () => {
        const report = clearProjectScopedBuilderGeometry([
            { name: 'slabBuilder',             builder: slabBuilder },
            { name: 'ceilingBuilder',          builder: ceilingBuilder },
            { name: 'floorBuilder',            builder: floorBuilder },
            { name: 'columnBuilder',           builder: columnBuilder },
            { name: 'beamBuilder',             builder: beamBuilder },
            { name: 'roofBuilder',             builder: roofBuilder },
            { name: 'plumbingBuilder',         builder: plumbingBuilder },
            { name: 'furnitureBuilder',        builder: furnitureBuilder },
            { name: 'lightingBuilder',         builder: lightingBuilder },
            { name: 'doorBuilder',             builder: doorBuilder },
            { name: 'windowBuilder',           builder: windowBuilder },
            { name: 'stairMeshBuilder',        builder: stairMeshBuilder },
            { name: 'stairLandingBuilder',     builder: stairLandingBuilder },
            { name: 'liftMeshBuilder',         builder: liftMeshBuilder },
            { name: 'liftCompoundMeshBuilder', builder: liftCompoundMeshBuilder }, // L-9400
            { name: 'roomBoundingLineBuilder', builder: roomBoundingLineBuilder },
            // Already had a geometry-only bulk clear before this sweep existed.
            { name: 'roomBoundaryBuilder',     builder: roomBoundaryBuilder, via: 'removeAll' },
            { name: 'roomLabelRenderer',       builder: roomLabelRenderer,   via: 'removeAll' },
            // ── §C13-RAILING-SWEEP-GAP (L-8101), added 2026-08-23 ──────────────────
            //
            // These two were LEFT BEHIND when this sweep was created. The header of
            // `projectScopedBuilderTeardown.ts` records the split: the four L-320
            // builders (wall, floor-finish, handrail, stair-railing) were to stay in
            // the older `initTools.ts` sweep, and "the other fifteen" moved here. But
            // the initTools sweep's FIRST statement was
            // `wallTool.getFragmentBuilder().dispose()` — UNGUARDED, ahead of the three
            // `try`-wrapped ones. A throw there (the WebGPU `usedTimes` L-303 family
            // that this very sweep's comments cite as the reason the per-element path
            // aborts) skipped floor-finish, handrail AND stair-railing teardown
            // entirely. Stair-railing teardown was therefore conditional on wall
            // teardown not throwing, and 36 of project A's stair-railing roots reached
            // project B's scene in the founder's 2026-08-23 report.
            //
            // Listing them HERE as well makes the two sweeps defence-in-depth rather
            // than a chain: `clearProjectScopedBuilderGeometry` isolates every entry in
            // its own try/catch and REPORTS what it could not clear, so neither builder
            // can be stranded by an unrelated failure again. Both are idempotent — a
            // second dispose() iterates an already-empty Map.
            //
            // `via: 'dispose'` is used, and it is PROVEN non-terminal for both, which is
            // the bar this file's header sets ("a terminal dispose here is a new L-224"):
            //   grep -n 'removeEventListener|_disposers|_unsub' \
            //     packages/geometry-handrail/src/HandrailFragmentBuilder.ts \
            //     packages/geometry-stair/src/StairRailingBuilder.ts   -> 0 hits
            // Neither holds a subscription handle, so neither can drop one. Both
            // dispose() bodies only walk their root Map, remove each root from the
            // scene through the WebGPU-safe release path, and clear their indices.
            { name: 'handrailBuilder',         builder: handrailBuilder,     via: 'dispose' },
            { name: 'stairRailingBuilder',     builder: stairRailingBuilder, via: 'dispose' },
        ]);
        console.log(formatBuilderTeardownReport(report));
    });

    // ─────────────────────────────────────────────────────────────────────────
    console.log('[initBuilders] All builder subsystems fully initialised.');
    bootStep('teardown wiring + window publish');
    // ─────────────────────────────────────────────────────────────────────────

    return {
        commandManagerRef,

        // Stores
        columnStore,
        curtainWallStore,
        curtainPanelStore,
        slabStore,
        ceilingStore,
        floorStore,
        roomStore,
        wallStore,
        roofStore,
        plumbingStore,
        openingStore,
        furnitureStore,
        lightingStore,
        handrailStore,
        beamStore,
        stairStore,
        stairTypeStore,
        stairLandingStore,
        stairRailingStore,
        liftStore,
        liftTypeStore,
        gridStore,

        // Type stores (singletons)
        wallSystemTypeStore,
        slabSystemTypeStore,
        ceilingSystemTypeStore,
        floorSystemTypeStore,

        // Builders
        columnBuilder,
        slabBuilder,
        ceilingBuilder,
        floorBuilder,
        roomBoundaryBuilder,
        roomLabelRenderer,
        roofBuilder,
        plumbingBuilder,
        doorBuilder,
        windowBuilder,
        furnitureBuilder,
        lightingBuilder,
        handrailBuilder,
        stairMeshBuilder,
        liftMeshBuilder,
        liftCompoundMeshBuilder,
        stairLandingBuilder,
        roomBoundingLineBuilder,
        stairRailingBuilder,
        beamBuilder,
    };
}
