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

import * as THREE from '@pryzm/renderer-three/three';
import type { CommandManager } from '@pryzm/command-registry';
import type { BimManager } from '@pryzm/core-app-model';
import type { ProjectContext } from '@pryzm/core-app-model';
import { storeEventBus } from '@pryzm/core-app-model';

// ── Slab subsystem ─────────────────────────────────────────────────────────
import { SlabStore, SlabFragmentBuilder, SlabLevelCleanupHandler } from '@pryzm/geometry-slab';
import { ColumnFragmentBuilder, installColumnPlanSymbolBuilder } from '@pryzm/geometry-column';

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
import { RoomBoundaryBuilder }      from '@pryzm/room-topology';
import { RoomLabelRenderer }        from '@pryzm/room-topology';
import { RoomLevelCleanupHandler }  from '@pryzm/room-topology';
import { RoomRelationshipService }  from '@pryzm/room-topology';
import { RoomContentsService }      from '@pryzm/room-topology';

// ── Wall subsystem ─────────────────────────────────────────────────────────
import { WallStore }                from '@pryzm/geometry-wall';

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
import { HandrailFragmentBuilder }    from '@pryzm/geometry-stair';
import { HandrailLevelCleanupHandler }from '@pryzm/geometry-stair';

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

    // ── Slab subsystem ────────────────────────────────────────────────────────
    const slabStore = new SlabStore(projectContext);
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

    // ── Room subsystem ────────────────────────────────────────────────────────
    const roomStore = new RoomStore(projectContext, bimManager);
    window.roomStore = roomStore; // TODO(TASK-08)

    const roomBoundaryBuilder = new RoomBoundaryBuilder(scene, bimManager);
    window.roomBoundaryBuilder = roomBoundaryBuilder;

    // §13 / C3 fix: explicit DI for the boundary builder. workspaceController
    // and hierarchyStore are module singletons safe to import here; passing
    // them directly removes the implicit window-global runtime lookup.
    try {
        const [{ workspaceController }, { hierarchyStore }] = await Promise.all([
            import('@app/ui/WorkspaceController'),
            import('@pryzm/core-app-model'),
        ]);
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

    // ── Door / Window singleton stores ────────────────────────────────────────
    // doorStore and windowStore are module-level singletons (not instantiated here).
    // Exposed on window so RoomGraphService, RoomFinishResolver, etc. can read them.
    window.doorStore   = doorStore; // TODO(TASK-08)
    window.windowStore = windowStore; // TODO(TASK-08)
    console.log('[initBuilders] Door/Window singleton stores exposed on window');

    // ── Wall Store ────────────────────────────────────────────────────────────
    // WallTool wraps this store; wallTool.getWallStore() returns this instance.
    // DoorBuilder and WindowBuilder take it by reference (read-only, §03 compliant).
    const wallStore = new WallStore(projectContext, bimManager);
    window.wallStore = wallStore; // TODO(TASK-08)
    console.log('[WallStore] attached to window', window.wallStore); // TODO(TASK-08)

    // ── Wall + Slab type stores — async parallel import ───────────────────────
    // These are module-level singletons from their respective files; the dynamic
    // import avoids a heavy static import at bootstrap top level (PERF-FIX-#2).
    const [{ wallSystemTypeStore }, { slabSystemTypeStore }] = await Promise.all([
        import('@pryzm/geometry-wall'),
        import('@pryzm/geometry-slab'),
    ]);
    window.wallSystemTypeStore = wallSystemTypeStore; // TODO(TASK-08)
    window.slabSystemTypeStore = slabSystemTypeStore; // TODO(TASK-08)
    console.log('[initBuilders] Wall + Slab system type stores loaded');

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
    let _roofMaterialMap: ReadonlyMap<string, { params?: Record<string, unknown>; textures?: { color?: unknown; normal?: unknown; roughness?: unknown } }> | undefined;
    try {
        const matLib = await import('@pryzm/core-app-model/material-library');
        _roofMaterialMap = new Map(matLib.STANDARD_MATERIAL_LIBRARY.map(m => [m.id, m] as const));
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
    slabBuilder.setDeps({ openingStore });
    console.log('[initBuilders] Opening subsystem initialised — openingStore injected into slabBuilder');

    // ── Door + Window builders ─────────────────────────────────────────────────
    // Both builders self-subscribe to their respective stores via activate().
    // wallStore is passed read-only (§03 compliant).
    const doorBuilder = new DoorBuilder(scene, wallStore);
    doorBuilder.activate();

    const windowBuilder = new WindowBuilder(scene, wallStore);
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

    // ── Furniture subsystem ───────────────────────────────────────────────────
    const furnitureStore = new FurnitureStore();
    window.furnitureStore = furnitureStore; // TODO(TASK-08)

    const furnitureBuilder = new FurnitureFragmentBuilder(scene);
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

    // ── Lighting subsystem ────────────────────────────────────────────────────
    const lightingStore = new LightingStore();
    window.lightingStore = lightingStore; // TODO(TASK-08)

    const lightingBuilder = new LightingFragmentBuilder();
    lightingBuilder.setScene(scene);
    window.lightingBuilder = lightingBuilder;

    console.log('[initBuilders] Lighting subsystem initialised');

    // ── Handrail subsystem ────────────────────────────────────────────────────
    const handrailStore = new HandrailStore(projectContext);
    window.handrailStore = handrailStore; // TODO(TASK-08)
    new HandrailLevelCleanupHandler(handrailStore);

    const handrailBuilder = new HandrailFragmentBuilder(scene, bimManager);

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

    console.log('[initBuilders] Stair subsystem initialised');

    // ── Beam subsystem ────────────────────────────────────────────────────────
    const beamStore = new BeamStore(projectContext);
    window.beamStore = beamStore; // TODO(TASK-08)
    new BeamLevelCleanupHandler(beamStore);

    const beamBuilder = new BeamFragmentBuilder(scene);
    beamStore.setBuilder(beamBuilder);
    console.log('[initBuilders] Beam subsystem initialised');

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

    // ── Room Bounding Line subsystem ──────────────────────────────────────────
    // Store is a module-level singleton (roomBoundingLineStore) — no constructor args.
    // Builder listens to DOM events fired by the store on add/update/remove.
    window.roomBoundingLineStore = roomBoundingLineStore; // TODO(TASK-08)
    const roomBoundingLineBuilder = new RoomBoundingLineBuilder(scene, bimManager);

    window.addEventListener('bim-room-bounding-line-added', (e: Event) => {
        const data = (e as CustomEvent).detail;
        if (data) roomBoundingLineBuilder.build(data);
    });
    window.addEventListener('bim-room-bounding-line-updated', (e: Event) => {
        const data = (e as CustomEvent).detail;
        if (data) roomBoundingLineBuilder.rebuild(data);
    });
    window.addEventListener('bim-room-bounding-line-removed', (e: Event) => {
        const data = (e as CustomEvent).detail;
        if (data?.id) roomBoundingLineBuilder.delete(data.id);
    });
    console.log('[initBuilders] RoomBoundingLine subsystem initialised');

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

    // ─────────────────────────────────────────────────────────────────────────
    console.log('[initBuilders] All builder subsystems fully initialised.');
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
        stairLandingBuilder,
        roomBoundingLineBuilder,
        stairRailingBuilder,
        beamBuilder,
    };
}
