/**
 * PRYZM BIM — Global Window Augmentation
 *
 * B1-B2 (Wave B): Typed declarations for every `window.*` global written or
 * read across the editor's engine layer (SelectionManager, initScene, initTools).
 *
 * Design rules:
 *   • Use precise discriminated-union types for globals that gate selection
 *     logic (isCameraDragging, __curtainSubElement, __kitchenSubUnit, etc.).
 *   • Use `unknown` for opaque service singletons where the full API surface is
 *     defined in their own package — callers must cast explicitly.
 *   • Every optional global is `T | undefined` (not just `T`) so TypeScript
 *     forces a null-check before use.
 *
 * This file is picked up automatically by the editor tsconfig's source-tree
 * include glob.  No explicit import is needed in consuming files.
 */

// ── Sub-element shape declarations (inlined to avoid import cycles) ──────────

/** A selected curtain-wall glass panel. */
interface PryzmCurtainSubElementPanel {
    type: 'panel';
    id: string;
    parentCwId: string;
    panelData?: unknown;
    cellIndex?: [number, number];
    panelType?: string;
}

/** A selected curtain-wall mullion (vertical or horizontal framing member). */
interface PryzmCurtainSubElementMullion {
    type: 'mullion';
    id: string;
    parentCwId: string;
    mullionAxis: 'u' | 'v';
    mullionT?: number;
}

/** Transient sub-element cache for curtain-wall sub-component selection. */
type PryzmCurtainSubElement = PryzmCurtainSubElementPanel | PryzmCurtainSubElementMullion;

/** Transient sub-unit cache for kitchen component selection. */
type PryzmKitchenSubUnit =
    | { type: 'countertop'; furnitureId: string }
    | { type: 'unit'; furnitureId: string; unitIndex: number; arm: string };

/** Transient sub-unit cache for wardrobe component selection. */
interface PryzmWardrobeSubUnit {
    type: 'unit';
    furnitureId: string;
    unitIndex: number;
    arm: string;
}

/** Feature-flag bag for runtime toggles. New flags should be added here. */
interface PryzmRuntimeFlags {
    EDGE_PROJECTOR_NATIVE: boolean;
    [flag: string]: boolean | string | number | undefined;
}

// ── Global Window augmentation ────────────────────────────────────────────────

declare global {
    interface Window {

        // ── Camera drag state ─────────────────────────────────────────────────
        /**
         * Set true by initScene camera `controlstart` handler; cleared by
         * `controlend`, `rest`, `sleep`, `visibilitychange`, and `blur`.
         * Guards ALL click/hover selection — must be false for a pick to proceed.
         */
        isCameraDragging: boolean;

        // ── Sub-element selection caches ──────────────────────────────────────
        /**
         * Transient curtain-wall sub-element last clicked.
         * Written by SelectionManager.performSelection() / cycleSubElement().
         * Read + cleared by PropertyPanel.showElement() on first access.
         * Cleared by SelectionManager.unselectAll().
         */
        __curtainSubElement: PryzmCurtainSubElement | null;

        /**
         * Transient kitchen sub-unit last selected.
         * Written by SelectionManager kitchen-path; read by KitchenInspector.
         */
        __kitchenSubUnit: PryzmKitchenSubUnit | null;

        /**
         * Transient wardrobe sub-unit last selected.
         * Written by SelectionManager wardrobe-path; read by WardrobeInspector.
         */
        __wardrobeSubUnit: PryzmWardrobeSubUnit | null;

        // ── Pick-gate flags ───────────────────────────────────────────────────
        /**
         * Set true by FloorPlanUnderlayTool to suppress SelectionManager from
         * consuming the same pointer event.  Cleared after consumption.
         */
        __underlayHit: boolean | undefined;

        // ── Level constraint ──────────────────────────────────────────────────
        /** Y-elevation (metres) of the currently active floor level. */
        activeLevelElevation: number | undefined;

        /**
         * §STAIR-L-U-PLAN (DAILY-USE 2026-05-20) — Transitional global
         * stamped by `BimService.createStair`'s setup-panel onConfirm so the
         * plan-view `StairPlanToolHandler` can read the architect's choice
         * of shape / width / typeId / mode without a new DI plumbing change.
         * TODO(STAIR-PLAN-DI): replace with a `PlanToolDrawContext.stairConfig`
         * slot threaded by the overlay so this complies with PRYZM-3 P4.
         */
        activeStairConfig: {
            shape: 'I' | 'L' | 'U';
            width?: number;
            typeId?: string;
            mode?: 'linear' | 'ortho';
            baseLevelId?: string;
            topLevelId?: string;
        } | undefined;

        // ── Tool singletons (registered by initTools) ─────────────────────────
        slabTool: { enterProfileEditMode: (slab: object) => void } | undefined;
        ceilingTool:        unknown;
        floorTool:          unknown;
        roofTool:           unknown;
        handrailTool:       unknown;
        plumbingTool:       unknown;
        furnitureTool:      unknown;
        furnitureCarousel:  unknown;
        lightingTool:       unknown;
        annotationManager:  unknown;
        selectionManager:   unknown;

        // ── Inspector / panel bridges ─────────────────────────────────────────
        curtainPanelStore: unknown;
        kitchenUnitInspector:
            | { hide(): void; show(furnitureId: string, unitIndex: number, arm: unknown): void }
            | undefined;
        kitchenRunInspector:
            | { hide(): void; show(furnitureId: string): void }
            | undefined;
        wardrobeSectionInspector:
            | { show(furnitureId: string, unitIndex: number, arm: unknown): void }
            | undefined;
        wardrobeRunInspector:
            | { hide(): void; show(furnitureId: string): void }
            | undefined;
        gridStore:                  unknown;
        furnitureFragmentBuilder:   unknown;
        /** §FT-FURNITURE (FURNITURE-BUS-MIGRATION): legacy FurnitureStore — set by
         *  initBuilders.ts:609, consumed by the initTools §FT-FURNITURE bridge. */
        furnitureStore:             unknown;
        lightingStore:              unknown;
        lightingBuilder:            unknown;

        // ── Room-graph system ─────────────────────────────────────────────────
        roomGraphService:       unknown;
        roomQueryService:       unknown;
        roomValidationService:  unknown;
        roomTypeInferenceEngine:unknown;
        facadeOrientationService: unknown; // SL-3 (SPEC-SEMANTIC §3)
        wallStore:              unknown;
        /** #51 — DevTools console command to generate AI apartment layouts. */
        pryzmGenerateApartmentLayout?: () => void;
        /** A.5.g.2 — draw a footprint shell (default 10×8 m) THEN generate, so an
         *  empty project can produce a layout. The `footprint` polygon is the seam
         *  the GIS site-boundary feeds ("apartment from the 3D boundary lines"). */
        pryzmGenerateApartmentFromScratch?: (opts?: {
            footprint?: ReadonlyArray<{ x: number; z: number }>;
            width?: number;
            depth?: number;
        }) => void;
        /** §HELP — prints every pryzm…() console command for the apartment
         *  generation pipeline (apartment → ceiling → furnish → lighting). */
        pryzmShowApartmentHelp?: () => void;
        /** §FLOOR-FINISH (#34) — auto-floor-finish every room on the active
         *  level by occupancyType (timber in living/bedroom, tile in
         *  kitchen/bathroom). Auto-fires after `apartment.layout-executed`. */
        pryzmFloorAllRooms?: () => void;

        // ── Dev-only test functions (installPryzmTestFunctions) ───────────────
        // In-browser smoke-test helpers for the Family Platform pipeline +
        // apartment validator framework. Registered by
        // `apps/editor/src/dev/installPryzmTestFunctions.ts`; safe to call
        // from the DevTools console without touching the live AI path.
        /** Run the Family Generation Pipeline on raw JSON (Stage 1 → 5). */
        __pryzmFamilyPipeline?:    (rawJson: unknown, opts?: unknown) => unknown;
        /** Run the apartment-layout validators + format the Markdown report.
         *  Async because the validator surface is loaded lazily via dynamic
         *  import (the `@pryzm/ai-host` root barrel doesn't surface it yet). */
        __pryzmValidateLayout?:    (dto: unknown, opts?: unknown) => Promise<unknown>;
        /** Print the available `__pryzm*` dev-test functions. */
        __pryzmListTestFunctions?: () => void;
        /** Return a paste-ready sample FamilyRequest JSON (deep-cloned). */
        __pryzmSampleFamilyRequest?: () => unknown;
        /** Return a paste-ready sample apartment-layout DTO (deep-cloned). */
        __pryzmSampleLayoutDto?:   () => unknown;

        // ── Command dispatch globals ──────────────────────────────────────────
        commandManager:
            | { executeCommand?: (cmd: string, payload?: unknown) => void }
            | undefined;
        runtime:
            | {
                bus: {
                    executeCommand(cmd: string, payload?: unknown): Promise<void>;
                    // Sprint F-2.0: ringBuffer exposed on the narrow slot so
                    // BimService / initUI can reach undo state without `as any`.
                    readonly ringBuffer: import('@pryzm/command-bus').RingBufferUndoStack | null;
                    setRingBuffer(rb: import('@pryzm/command-bus').RingBufferUndoStack): void;
                };
                /** F.events.2c — typed event emitter slot (runtime-composer §14). */
                events: {
                    emit(event: string, payload: unknown): void;
                    on(event: string, handler: (payload: unknown) => void): () => void;
                };
                /** P0.3 Family Platform — the live FamilyRegistryStore owned by
                 *  composeRuntime (runtime-composer §types.ts). Surfaced here so
                 *  dev-tooling (familyPlatformTestModal) can register families
                 *  end-to-end without `(window as any)`. Optional because the
                 *  narrow window slot is also written by transitional code paths
                 *  that may not include the full runtime (defensive null check). */
                readonly familyRegistryStore?: import('@pryzm/stores').FamilyRegistryStore;
              }
            | undefined;
        unselectAll: (() => void) | undefined;

        // ── Constraint & solver globals ───────────────────────────────────────
        constraintStore:          unknown;
        constraintSolver:         unknown;
        resolverStores:           unknown;
        annotationDependencyGraph:unknown;

        // ── Renderer / pipeline globals ───────────────────────────────────────
        pryzmCanvas:       HTMLCanvasElement | undefined;
        pryzmRenderer:     unknown;
        obcRendererCanvas: HTMLCanvasElement | undefined;
        renderPipelineManager:
            | { onProjectSwitch?: () => void }
            | undefined;
        renderingPipelineCoordinator: unknown;
        renderingQualityPanel:
            | { syncState?: (state: unknown) => void }
            | undefined;
        currentPipelinePhase:   number | undefined;
        viewportPathTracer:     unknown;
        viewportRenderModePanel:unknown;
        enableViewportRenderMode:  (() => void) | undefined;
        disableViewportRenderMode: (() => void) | undefined;
        enhancedBloomService:      unknown;
        enableEnhancedBloom:       (() => void) | undefined;
        disableEnhancedBloom:      (() => void) | undefined;
        ssgiService:               unknown;
        enableSSGI:                (() => void) | undefined;
        disableSSGI:               (() => void) | undefined;
        setRenderQualityLevel:     ((level: string) => void) | undefined;
        pascalSceneLighting:       unknown;
        splitViewManager:          unknown;

        // ── Navigation & view ─────────────────────────────────────────────────
        navManager:           unknown;
        groundFloorController:unknown;
        viewController:       unknown;
        bimManager:           unknown;

        // ── Internal caches & feature flags ──────────────────────────────────
        __viewRenderCache:          unknown;
        __planViewsDisabled:        boolean | undefined;
        __sceneBoundsCache:         { invalidate(): void } | undefined;
        __instancedElementRenderer: unknown;
        /** Runtime feature-flag bag. Safe to read with optional chaining. */
        __PRYZM_FLAGS__: Partial<PryzmRuntimeFlags>;
        __resetCwPrewarm: (() => void) | undefined;
    }
}

export {};
