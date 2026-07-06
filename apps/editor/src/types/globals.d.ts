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

        /**
         * §PERF-WALL-DRAG-DEFER (ADR-061) — true while a wall is being moved via
         * the 3D transform gizmo or an endpoint-handle drag. Set on the
         * TransformControls `dragging-changed`(true) for a wall; cleared on
         * `dragging-changed`(false). Read by WallRebuildCoordinator._scheduleFlush
         * to DEFER the expensive whole-level wall-join resolve + room redetect +
         * plan re-projection until the drag settles, so the heavy rebuild runs
         * ONCE on release rather than blocking each interaction frame. The live
         * mesh follows the gizmo via WallTransformController (visual-only) during
         * the drag, matching the door-move pattern (ADR-057).
         */
        __wallDragInProgress?: boolean;

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
        /** A.7.c.x — create a Site + set a rectangular parcel boundary (default
         *  20×16 m) on the active project via the pure `site.*` handlers. The
         *  stub-GIS step: stands in for the real geocode + polygon-draw UI until
         *  A.8.a/c land. Typology-agnostic (site-layer only). Returns false on
         *  any reject. */
        pryzmCreateSiteFromRect?: (address?: string, width?: number, depth?: number) => boolean;
        /** A.5.g.3 — generate an apartment from the authored Site parcel boundary
         *  (`runtime.siteModelStore.getParcelBoundary()`). Run
         *  pryzmCreateSiteFromRect() first. The site read is typology-agnostic;
         *  only the generator call is apartment-specific. */
        pryzmGenerateApartmentFromBoundary?: () => void;
        /** Office building (4th typology) — DevTools console command to generate a
         *  circular office tower. §OFFICE-ONBOARDING-WIRE: feature is ON by default;
         *  only `__PRYZM_OFFICE_BUILDING__ === false` force-disables it. */
        pryzmGenerateOfficeBuilding?: (opts?: {
            stories?: number;
            radiusM?: number;
            floorToFloorM?: number;
            deskDensityPer1000Sqft?: number;
            deskMode?: 'bench' | 'individual';
            culture?: 'open-plan-first' | 'perimeter-offices-first';
            mechanicalEveryN?: number;
        }) => void;
        /** A.8.c.f — open the Hektar-style 2D cream/shadow boundary-draw map
         *  (MapLibre). Click each corner, double-click / Enter to close, Esc to
         *  cancel. On close it projects the lat/lon ring → site-XZ + dispatches
         *  site.setParcelBoundary (same path as the Cesium tool). This is the
         *  DEFAULT draw surface; the 3D globe stays for the rendered result. */
        pryzmStartBoundaryDraw?: () => void;
        /** §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — open the 2D map in OVERLAY-ONLY mode
         *  (boundary draw disarmed) for the PDF/image import path: only the site-plan
         *  overlay panel + its 2-point calibration are live; no boundary can be traced and
         *  no generate is armed. Registered by GISAreaLayout. */
        pryzmStartSitePlanOverlayImport?: () => void;
        /** §FIX-SITE-OVERLAY-ENTER-CANVAS (L-78) — switch the editor into a BIM view, EXITING
         *  GIS first (routes through activateView → toggleGIS(false) → ViewController.activate).
         *  Used by the overlay-import "✓ Finish" to land the user in PLAN ('Top') view where the
         *  imported plan underlay is visible. Registered by GISAreaLayout. */
        pryzmActivateBimView?: (mode?: 'Top' | '3D' | 'Front' | 'Back' | 'Left' | 'Right') => Promise<void> | void;
        /** A.8.c — start the legacy Cesium-globe site-boundary polygon-draw tool
         *  (fallback). Requires the GIS view to be active. */
        pryzmStartBoundaryDraw3D?: () => void;
        /** A.8.c — cancel an in-progress site-boundary draw (2D map or Cesium). */
        pryzmCancelBoundaryDraw?: () => void;
        /** O.7.2.b — explicit teardown of the (possibly committed-but-still-live) 2D
         *  Hektar boundary map. After a boundary COMMIT the cream plan map + drawn
         *  boundary stay mounted so the onboarding "Generate with AI?" confirm renders
         *  over a live plan map; this disposes it — called ONLY at generate-time (the
         *  onboarding "Generate" action). Idempotent + double-dispose safe. Registered
         *  by GISAreaLayout. */
        pryzmCloseBoundaryMap2D?: () => void;
        /** O.2 — activate/deactivate the GIS (Cesium) view programmatically. The
         *  onboarding step controller's "Draw it on the map" path calls this to
         *  mount + activate GIS before `pryzmStartBoundaryDraw`. Mirrors the GIS
         *  rail's "Activate Geospatial" checkbox (`props.gisToggle`). Registered by
         *  GISAreaLayout once the editor's GIS area mounts. */
        pryzmToggleGIS?: (active: boolean) => void;
        /** O.2 (zoom-to-address defect) — seed the 2D boundary map's `getMapInitial`
         *  frame from a geocode result captured OUTSIDE the GIS-rail search box (the
         *  onboarding location step has its own geocode path). Supplies lat/lon and,
         *  when the provider returned one, the `[west,south,east,north]` bbox so the
         *  map `fitBounds` to the exact plot on open instead of opening at world zoom.
         *  Registered by GISAreaLayout; mirrors the rail's `onFlyTo` capture. */
        pryzmSetGeocodeFrame?: (frame: { lat: number; lon: number; bbox?: [number, number, number, number] }) => void;
        /** O.7.2 — mount the post-generate DUAL-VIEW toggle and land the left pane on
         *  the chosen view ('2D' BIM plan by default — the no-blank fix — or '3D'
         *  Cesium globe re-framed to the plot). The onboarding generate-finish step
         *  calls this INSTEAD of force-activating the BIM 3D view over an orphaned
         *  Cesium overlay (which left the pane blank). Registered by GISAreaLayout. */
        pryzmShowSiteResultView?: (initial?: '2D' | '3D') => void;
        /** O.7.2 — remove the post-generate dual-view toggle (e.g. on dispose). */
        pryzmHideSiteResultToggle?: () => void;
        /** FORMA.3 / FORMA-PLAN-OBLIQUE — mount the floating [2D Map][Plan][3D]
         *  toggle (top-right) and land on the chosen view (defaults to 'plan', the
         *  Forma plan-oblique signature look). 'plan' + '3d' are BOTH the Cesium-
         *  Forma canvas (setFormaMode + white massing + OSM context + shadows) at
         *  different pitches: 'plan' = near-top-down plan-oblique (heading N, pitch
         *  −68°, shadows as the depth cue), '3d' = NW oblique (heading 325°, pitch
         *  −45°). 'map2d' reveals the MapLibre 2D cream draw map. Registered by
         *  GISAreaLayout. */
        pryzmShowFormaView?: (initial?: 'map2d' | 'plan' | '3d') => void;
        /** §FEAT-SITE-VIEW-ALWAYS-ON (L-40, ADR-0114) — always-available entry to the
         *  3D globe / 3D site view from ANY 3D view. Self-bootstraps GIS + Cesium (no
         *  prior "Activate Geospatial" needed) and enters on a sensible default centre
         *  even when no site/geolocation exists yet. Registered by GISAreaLayout at
         *  boot, so it is defined regardless of geospatial activation state. */
        pryzmEnterSiteView?: (initial?: 'map2d' | 'plan' | '3d') => void;
        /** §FEAT-PLAN-VIEW-GIS (L-104, ADR-0115) — the PLAN-VIEW analogue of the 3D site
         *  view: switch to the orthographic Top (plan) view and composite the real-world
         *  GIS/aerial context as a plan-canvas underlay BENEATH the authored building,
         *  rotated onto PROJECT NORTH (θ = SiteLocation.trueNorth). Self-bootstraps + no-ops
         *  gracefully when no site is set. Registered by GISAreaLayout at boot. */
        pryzmEnterPlanViewGis?: () => void | Promise<void>;
        /** FORMA.3 — remove the [2D Map][Plan][3D] toggle. */
        pryzmHideFormaView?: () => void;
        /** FORMA.3/4 — re-read the authored footprints + boundary and (re)render the
         *  Forma white massing into Cesium. `frame` repeats the NW oblique flyTo.
         *  The FORMA.4 live-update seam (clear + re-place on edit). Registered by
         *  GISAreaLayout. */
        pryzmRenderFormaMassing?: (frame?: boolean) => void;
        /** FORMA.4 — drop the live-update subscriptions (site.parcel-boundary-set /
         *  apartment.layout-executed) that re-place the Forma massing in 3D.
         *  Registered by GISAreaLayout. */
        pryzmDisposeFormaLiveUpdate?: () => void;
        /** FORMA.2 — toggle the Cesium Forma massing render mode directly. Registered
         *  by CesiumViewport at mount. */
        pryzmSetCesiumFormaMode?: (on: boolean) => void;
        /** FORMA.6 — toggle the Forma study building fidelity ('real' = full PRYZM
         *  model / 'massing' = abstract pastel volumes). Default 'real'. Registered
         *  by GISAreaLayout; re-exports + re-places on switch to 'real'. */
        pryzmSetFormaBuildingFidelity?: (fidelity: 'massing' | 'real') => void;
        /** §GLOBE-FIDELITY — set the photoreal "3D globe" building fidelity ('real' =
         *  full PRYZM model overlaid on the tiles / 'massing' = abstract massing blocks
         *  on the tiles). Default 'real'. Registered by GISAreaLayout; drops/re-places
         *  the real-model primitive + re-renders the massing in place (no re-fly). */
        pryzmSetGlobeBuildingFidelity?: (fidelity: 'massing' | 'real') => void;
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

        /**
         * §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — the active per-level explode
         * Y offset (metres) for the level owning `obj`, or 0 when the Level
         * STACKED/UNSTACKED (explode) view is inactive or collapsed. Published by
         * LevelExplodeController.init(); read by the SelectionManager anchor logic
         * (a LOWER layer, @pryzm/input-host) so a MODEL-space highlight box for an
         * instanced/OBB-fallback element is placed in the SAME exploded space the
         * mesh is drawn — the explode offset stays a pure view transform and never
         * pollutes the persisted model position. Undefined until init.
         */
        pryzmLevelExplodeOffsetForObject?: ((obj: unknown) => number) | undefined;

        // ── Constraint & solver globals ───────────────────────────────────────
        constraintStore:          unknown;
        constraintSolver:         unknown;
        resolverStores:           unknown;
        annotationDependencyGraph:unknown;

        // ── Renderer / pipeline globals ───────────────────────────────────────
        pryzmCanvas:       HTMLCanvasElement | undefined;
        pryzmRenderer:     unknown;
        /**
         * §PERF-WEBGPU-FRAGMENT / ADR-0076 — the GPU backend actually resolved at
         * boot ('webgpu' | 'webgl-fallback' | 'webgl-only'). Written by
         * createRenderer(); read by RendererBackendToggle to show the active
         * backend. Typed here so the toggle needs no `(window as any)` (P4).
         */
        pryzmRendererBackend: 'webgpu' | 'webgl-fallback' | 'webgl-only' | undefined;
        /**
         * ADR-0077 (§RENDERER-LIVE-SWAP) — live, in-place renderer backend swap.
         * Registered by initScene once the rebind layer is wired. The corner
         * RendererBackendToggle calls this INSTEAD of persist+reload. Resolves
         * `true` when the new backend is live and rendering; `false` when the
         * swap could not complete (caller falls back to the legacy reload path).
         * Typed here so the toggle needs no `(window as any)` (P4).
         */
        pryzmSwapRendererBackend:
            | ((pref: 'auto' | 'webgpu' | 'webgl') => Promise<boolean>)
            | undefined;
        obcRendererCanvas: HTMLCanvasElement | undefined;
        renderPipelineManager:
            | {
                onProjectSwitch?: () => void;
                // §PERF-WEBGPU-FRAGMENT / ADR-0076 — TRAA toggle driven by the render
                // quality tier (Axis 1). Both are async + idempotent + no-op on WebGL.
                activateTRAA?: () => Promise<void>;
                deactivateTRAA?: () => Promise<void>;
                // §FIX-POSTFX-WEBGPU (L-111) — SSGI == the WebGPU screen-space Ambient
                // Occlusion pass (SSGINode, giIntensity=0 → AO-only). Driven by the View
                // Properties "Ambient Occlusion" toggle AND the RenderRail "SSGI" toggle.
                // User-opt-in only (§FIX-SSGI-DEFAULT-OFF / L-59); async + idempotent;
                // no-op on WebGL. Optional param passes SSGI quality overrides.
                activateSSGI?: (params?: object) => Promise<void>;
                deactivateSSGI?: () => Promise<void>;
                /** Pipeline status — webGpuActive gates the WebGL SSGI path (read at initScene). */
                readonly status?: { webGpuActive?: boolean };
                // §RPM-RECOVERY-DOWNGRADE (ADR-0087) — NON-FATAL device-loss recovery.
                // Rebuilds the pipeline and downgrades to lightweight phase-2 on a
                // shader-compile failure instead of killing the viewport. Returns the
                // resolved phase. Older RPMs may not expose it — call defensively.
                recoverPipeline?: (
                    scene: unknown,
                    camera: unknown,
                    renderer: unknown,
                    backendIsWebGPU?: boolean,
                    restorePostFx?: boolean,
                ) => Promise<string>;
                /** True while running the lightweight (post-FX-disabled) recovery path. */
                readonly isPostFxDisabled?: boolean;
                /** Best-effort re-upgrade to the full post-FX pipeline after a downgrade. */
                tryUpgradePostFx?: () => Promise<boolean>;
                /**
                 * §FIX-SHADOW-MIDSUBMIT-DESTROY (founder L-25) — freeze/thaw the WebGPU
                 * shadow PASS without destroying the ShadowDepthTexture. Driven by the
                 * §PERF-NAV-LOD gate during camera motion. No-op on WebGL / when inactive.
                 */
                setShadowPassSuppressed?: (suppressed: boolean) => void;
                /**
                 * §FIX-SHADOW-LOAD-TIER-DESTROY (founder L-39) — ref-counted freeze of
                 * the WebGPU shadow map around a shadow-map REALLOC (resolution/level
                 * change) or the whole project-load window, so the tier-escalation
                 * realloc never destroys the ShadowDepthTexture mid-submit on load.
                 * Load-time sibling of setShadowPassSuppressed. No-op on WebGL / inactive.
                 */
                setShadowReallocFrozen?: (frozen: boolean) => void;
              }
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
        /** §FEAT-REAL-ENVIRONMENT (ADR-0106) — RealEnvironmentService (real sun + ground catcher). */
        realEnvironmentService:    unknown;
        splitViewManager:          unknown;

        // ── Navigation & view ─────────────────────────────────────────────────
        navManager:           unknown;
        groundFloorController:unknown;
        viewController:       unknown;
        bimManager:           unknown;

        // ── Internal caches & feature flags ──────────────────────────────────
        /**
         * §R3-SENTINEL (P1.3, IMPL-PLAN-2026-05-17) — init-complete sentinel.
         * Set to `true` as the FINAL act of `initTools()` once every store, bus
         * handler, and scene singleton (`window.commandManager`, `window.wallStore`,
         * …) is confirmed live. `undefined`/`false` means init threw or returned
         * early before the §R3-SENTINEL line. The plan-tool overlays assert this
         * before arming a handler so a partial-init tool fails loudly at activation
         * instead of silently producing ghost elements on the first click.
         */
        __pryzmInitComplete:        boolean | undefined;
        __viewRenderCache:          unknown;
        __planViewsDisabled:        boolean | undefined;
        __sceneBoundsCache:         { invalidate(): void } | undefined;
        __instancedElementRenderer: unknown;
        /** Runtime feature-flag bag. Safe to read with optional chaining. */
        __PRYZM_FLAGS__: Partial<PryzmRuntimeFlags>;
        /** Office-building (4th typology) feature gate. §OFFICE-ONBOARDING-WIRE: ON by
         *  default (picking the office typology IS the opt-in). Set explicitly to
         *  `false` to force-disable; any other value (incl. undefined) ⇒ enabled. */
        __PRYZM_OFFICE_BUILDING__: boolean | undefined;
        __resetCwPrewarm: (() => void) | undefined;
    }
}

export {};
