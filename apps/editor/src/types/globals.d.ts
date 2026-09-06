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
    /** §KITCHEN107 — `upper` distinguishes the wall-cabinet row (independent
     *  unit list) from the base row; they share (arm, unitIndex). */
    | { type: 'unit'; furnitureId: string; unitIndex: number; arm: string; upper?: boolean };

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
         * §NAV-SHADOW-CAMERA-CANNOT-CHANGE-IT (L-3310) — DevTools kill switch. Set to
         * `false` to restore per-frame shadow-map rendering during camera motion. Declared
         * here rather than reached for through a cast, so P4 holds and the flag is
         * discoverable by anyone grepping this file for what the session can be told.
         */
        __pryzmShadowFreezeOnNav?: boolean;

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

        // §FIX-STAIR-PLAN-CREATION-BLOCKED (L-243) P2 — `activeStairConfig` DELETED.
        // It was a transitional global that ONLY `BimService.createStair`'s 3D setup
        // panel ever stamped, and that the plan stair handler scavenged. A stair drawn
        // in plan therefore silently lost the architect's chosen shape / width / type
        // (the C11 defect of L-239 / L-213 / L-240), and the read was a live P4
        // violation. The config now lives in the single `StairToolConfigStore`
        // chokepoint (@pryzm/geometry-stair) and reaches the plan handlers by DI via
        // `PlanToolDrawContext.stairConfig`. Do not reintroduce this global.

        // ── Tool singletons (registered by initTools) ─────────────────────────
        // §FIX-SLAB-EDITOR-CHOICE (L-1320) — the slab exposes TWO editors by name.
        // ⚠ `enterProfileEditMode` no longer silently redirects to the dimension
        // panel; each editor is its own verb and each request is judged on its own.
        slabTool: {
            enterProfileEditMode: (slab: object) => void;
            enterDimensionEditMode?: (slabId: string) => { ok: boolean; reason?: string };
            slabEditorAvailability?: (
                slabId: string,
                requested: 'outline' | 'dimensions',
            ) => { ok: boolean; reason?: string };
        } | undefined;
        /**
         * ⭐ §RESI-STAGE-G (2026-09-06) · C114 §10b / §11 item 7 — the SPACE ENVELOPE's
         * footprint editor. Registered by `initTools` and read by exactly two callers:
         * `ContextualEditBar._profileEditToolFor` (the "Edit Profile" button) and the
         * double-click seam in `spaceEnvelopeFaceDragController`.
         *
         * ⚠ TYPED, NOT `unknown`, deliberately. The resolver decides the button's visibility
         * from `typeof tool.enterProfileEditMode === 'function'`; declaring the shape here
         * means renaming either method breaks the BUILD rather than silently hiding a button
         * that used to work — the §FIX-DEAD-EDIT-PROFILE-BUTTON failure, inverted.
         */
        spaceEnvelopeTool:
            | {
                enterProfileEditMode: (spaceEnvelopeId: string) => void;
                profileEditAvailability: (spaceEnvelopeId: string) => { ok: boolean; reason?: string };
            }
            | undefined;
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
            | { hide(): void; show(furnitureId: string, unitIndex: number, arm: unknown, upper?: boolean): void }
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
        /**
         * §PRYZM-PERF (INSTR1) — the one console entry point for batch/gesture
         * performance evidence. Typed here rather than cast at the use site (P4).
         *
         *   pryzmPerf.on()      ← BEFORE the gesture: arm + zero
         *   …gesture…
         *   pryzmPerf.report()  ← AFTER: print one table
         *   pryzmPerf.reset()   ← between gestures: zero, stay armed
         *
         * Accumulation is OFF until `on()`; the cost while off is one typed-global
         * read per instrumented call site. `report()` is always safe to call, but
         * its accumulated sections print "UNMEASURED" rather than 0 when unarmed —
         * a zero from an unarmed run would be a false exoneration, not a finding.
         *
         * Structural, not an import, so this ambient file stays dependency-free.
         */
        pryzmPerf?: {
            on(): void;
            off(): void;
            reset(): void;
            report(): unknown;
            data(): unknown;
        };
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
        /** §L-384 — RE-DRAW after a committed boundary: clears the immutable C19 §1.4
         *  boundary (site.replace) and re-arms the still-mounted 2D map for a fresh draw.
         *  Called by the onboarding "← Back to drawing" action. Registered by GISAreaLayout. */
        pryzmRearmBoundaryDraw?: () => void;
        /** §FIX-DRAW-WATCHDOG-MUST-NOT-AUTHOR (ADR-0299) — `Date.now()` at the moment the 2D
         *  boundary-draw surface finished loading and became genuinely drawable (MapLibre `load`);
         *  `undefined` while there is nothing to draw on. Stamped + cleared by SiteBoundaryMap2D.
         *  The onboarding draw-idle timer starts its clock from THIS rather than from when its own
         *  step rendered, so a slow tile/map load is never charged to the user's patience. */
        pryzmBoundaryDrawSurfaceReadyAt?: number;
        /** §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — mount the site-authoring
         *  SPLIT: LEFT pane = the 2D site map (draw/select), RIGHT pane = the LIVE 3D Site
         *  (boundary + buildable envelope). The single Cesium viewer is RE-TARGETED into
         *  the right pane element (never cloned), and the layout is assigned through the
         *  pure `assignViewToPane` model (`siteAuthoringDefaultLayout`), not a hard-coded
         *  toggle. Entering the site step calls this so the user lands directly on the
         *  side-by-side; a draw/select on the left re-renders the boundary + envelope live
         *  on the right (no view-switch dance). Registered by GISAreaLayout. */
        pryzmMountSiteAuthoringPanes?: (opts?: {
            /** §PANE-DEFAULT-IS-PLAN-LEFT (L-12988) — WHICH declared opening to seed.
             *  `'site-authoring'` (the default, and what onboarding needs) opens 2D map LEFT ·
             *  3D Site RIGHT; `'parcel-law'` opens PLAN LEFT · 3D Site RIGHT, which is what the
             *  founder asked the Parcel Law tab to open as. A NAME, not a layout object: a
             *  layout shipped through a global would be a second place for a default to live,
             *  and `paneLayoutForPreset` in the pure model is the first. */
            readonly layout?: 'site-authoring' | 'parcel-law';
            // RETURNS (§SITE-CHECK-RUNS-BEFORE-THE-SITE-IS-ANCHORED, L-13002): `true` iff the
            // split is ON SCREEN after the call (a fresh mount, or an already-mounted re-seed);
            // `false` when the host declined, in which case the console line it printed says
            // why. Callers that report the step to the user (the §22 reveal) MUST read this —
            // the previous `void` made a refusal indistinguishable from a mount, which is how
            // "split mounted in order" was logged over a split that never appeared.
        }) => boolean | void;
        /** §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412) — dismiss the site-authoring split: the
         *  2D map disposes and the single Cesium viewer re-homes to `#container` + hides
         *  (never disposed). Idempotent. Registered by GISAreaLayout. */
        pryzmUnmountSiteAuthoringPanes?: () => void;
        /** PRYZM-EARTH-ONBOARDING PRD §22 (§17.4 "Split-screen fades in") — bring the
         *  just-mounted site-authoring split in with a CSS opacity transition instead of a hard
         *  cut over the full-screen globe. Presentation only: it gates nothing, and the mount
         *  itself schedules the same one-shot as a safety net. No-op when nothing is mounted.
         *  Registered by GISAreaLayout. */
        pryzmFadeInSiteAuthoringPanes?: () => void;
        /** O.2 — activate/deactivate the GIS (Cesium) view programmatically. The
         *  onboarding step controller's "Draw it on the map" path calls this to
         *  mount + activate GIS before `pryzmStartBoundaryDraw`. Mirrors the GIS
         *  rail's "Activate Geospatial" checkbox (`props.gisToggle`). Registered by
         *  GISAreaLayout once the editor's GIS area mounts. */
        pryzmToggleGIS?: (active: boolean) => void;
        /** PRYZM-EARTH-ONBOARDING PRD Milestone 2 (§9/§10) — resolve the ONE live Cesium
         *  viewport as a `GlobeCameraHost` (structurally: `flyToGeographic()` only), for the
         *  onboarding `location` step's `GlobeHeroSearch` to drive via `SiteEntryStore`'s
         *  existing camera port (`cesiumSiteEntryCameraPort`). A resolver, not a reference, so
         *  it always returns the CURRENT viewport (survives device-loss recreate) and returns
         *  `null` before `pryzmToggleGIS(true)` has mounted one yet. Declared structurally here
         *  (not imported from `CesiumViewport`) so this file adds no import edge along which a
         *  second viewer could be constructed — mirrors `siteEntryStore.ts`'s own
         *  `GlobeCameraHost` rationale. Registered by GISAreaLayout. */
        pryzmGetSiteEntryCameraHost?: () => { flyToGeographic(target: {
            lat: number;
            lon: number;
            altitudeM: number;
            pitchDeg: number;
            instant?: boolean;
            /** §REVEAL-FLIGHT-COMPLETE — seconds. Declared by the model
             *  (`SITE_ENTRY_FLIGHT_DURATION_S`) and honoured by `CesiumViewport.flyToGeographic`.
             *  ⚠ It was MISSING from this declaration while the implementation accepted it, so
             *  every caller that passed a `SiteEntryCameraTarget` through here had its pacing
             *  silently untyped — added §GLOBE-QUICK-TOGGLE (L-6806). */
            durationS?: number;
        }): void;
        /** §GLOBE-INHERITS-THE-CITY-TERRAIN (L-12991) — declare WHERE this one viewer is framed, so
         *  the SURFACE moves with the camera instead of whichever view activated last winning for
         *  both. `'world'` (the `3D Globe` row) forbids a city-bounded terrain tileset and turns the
         *  imagery, the photoreal tileset and the sky back on; `'site'` (the `3D Site` row) restores
         *  the Forma ground and the city terrain. Call it BEFORE `flyToGeographic`.
         *
         *  ⚠ REQUIRED, not optional. An optional method would be silently dropped by any host that
         *  forgot it, and a silently dropped surface swap is exactly the defect this closes —
         *  the founder's beige triangular shard. `CesiumViewport.setViewFraming` implements it and
         *  `GISAreaLayout` returns that viewport verbatim. */
        setViewFraming(framing: 'site' | 'world'): void } | null;
        /** PRYZM-EARTH-ONBOARDING PRD §16 (Milestone 2 polish) — resolves once the ONE Cesium
         *  viewport `pryzmGetSiteEntryCameraHost()` returns is actually live and accepting
         *  camera commands (i.e. `pryzmToggleGIS(true)`'s first activation has finished
         *  `CesiumViewport.mount()`, or failed it). Closes the "no globe mounted — camera
         *  target dropped" race: `getCameraHost()` alone can return `null` for a while after
         *  `pryzmToggleGIS(true)` because `CesiumViewport` is constructed and mounted inside a
         *  lazy async import chain. Pre-resolved before any activation; a caller that awaits
         *  this before its first `flyTo`/`frameCurrent()` call is guaranteed a live host (or an
         *  honest failure already logged) rather than a silently dropped camera command.
         *  Registered by GISAreaLayout. */
        pryzmGetSiteEntryCameraHostReady?: () => Promise<void>;
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
        /** §GIS-ACTION-REGISTRY (L-1187, C06 §13) — toggle the FORMA.5 site-analysis panel
         *  (sun · weather · wind). Brings the Forma view up first when the panel is not
         *  mounted, so it never dead-ends. Registered by GISAreaLayout. */
        pryzmToggleSiteAnalysis?: () => void;
        /** §GIS-ACTION-REGISTRY (L-1187, C06 §13) — show / hide the buildable-envelope
         *  facts card. Same not-built-yet branch as the launcher pill. Registered by
         *  GISAreaLayout. */
        pryzmToggleEnvelopeCard?: () => void;
        /** L-1587 - re-derive the buildability determination for the COMMITTED parcel and
         *  re-render the facts card. Returns TRUE only if a card is on screen afterwards.
         *
         *  Exists because the determination is SESSION state: `_lastEnvelope` in
         *  `siteDispatch.ts` is a module-local written only on parcel commit and never
         *  persisted, so after any reload the card cannot be built and every host of it shows
         *  an empty state with no way back. Registered by GISAreaLayout.
         *
         *  It re-runs the same C58 computation against the same committed boundary - it does
         *  NOT persist or infer an envelope, so a parcel that legitimately has none still
         *  refuses, and FALSE is a real answer rather than a failure. */
        pryzmRecomputeEnvelopeCard?: () => boolean;
        /** §GIS-ACTION-REGISTRY (L-1187, C06 §13) — reframe the camera on the site. The
         *  ACTIVE SURFACE decides the target (Forma preset vs the placed building on the
         *  photoreal tiles), which is what the two rival "Zoom to Site" buttons disagreed
         *  about. Registered by GISAreaLayout. */
        pryzmZoomToSite?: () => void;
        /** §GIS-ACTION-REGISTRY (L-1360, C06 §13.7) — restore every optional panel to its
         *  declared default state, size and position. APP-WIDE: it walks the whole
         *  `PANEL_REGISTRY`, not only the site panels. Registered by GISAreaLayout; it is
         *  the re-host of the floating ⟲ pill the launcher rail used to carry. */
        pryzmResetPanelLayout?: () => void;
        /** §GIS-ACTION-REGISTRY (L-1361, C06 §13) — a SNAPSHOT of which site view and
         *  building fidelity are current, so a surface can paint an active state that is
         *  DERIVED from the authority instead of mirrored beside it. `buildingFidelity`
         *  reports whichever of the two fidelity variables governs the visible surface.
         *  ⚠ Snapshot, not a subscription: it changes only when you ask again. Registered
         *  by GISAreaLayout. */
        pryzmGetSiteViewState?: () => {
            segment: '2D' | '3D' | 'forma';
            formaMode: 'map2d' | 'plan' | '3d';
            buildingFidelity: 'massing' | 'real';
            /** §VIEW-PANEL-PER-PANE — which 2D basemap the site map is drawing. Optional:
             *  a host registered before this field existed reports `undefined`, which a
             *  reader must treat as "not reported", never as "cream". */
            basemap?: 'map' | 'satellite';
        };
        /** §VIEW-PANEL-PER-PANE (founder 2026-09-06) — swap the 2D site map between the
         *  cream Hektar vector basemap and the ESRI satellite raster.
         *
         *  ⭐ It forwards to `SiteBoundaryMap2D`'s own `swapBasemap` (A.8.c.f.4) — the exact
         *  function the map's corner `Map | Satellite` chip drives. Registered by
         *  GISAreaLayout, which REMEMBERS the request when no map is mounted yet and applies
         *  it when one opens, so the panel button is never a silent no-op. */
        pryzmSetSiteBasemap?: (next: 'map' | 'satellite') => void;
        /** §VIEW-PANEL-PER-PANE — the LIVE basemap reading (the map's own state when one is
         *  mounted, otherwise the last request). Registered by GISAreaLayout. */
        pryzmGetSiteBasemap?: () => 'map' | 'satellite';
        /** §GIS-ENVELOPE-REHOST (L-1362, C06 §13.3) — claim the buildability read-out (the
         *  C58 buildable-envelope card) for a host element; `null` releases it back to the
         *  viewport. Returns whether a card is present afterwards.
         *
         *  ⚠ `false` means the C58 render decided there is NOTHING HONEST TO SHOW — not that
         *  the mount failed. The caller must say so in words; a blank container reads as a
         *  crash rather than as "we could not determine this" (L-553). It must never be
         *  softened into showing zeros: a 0/0/0 envelope REFUSES to draw rather than overstate
         *  on real land (§L-616 / C58 §1.16). Registered by GISAreaLayout. */
        pryzmMountEnvelopeCard?: (host: HTMLElement | null) => boolean;
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
        /** §TERRAIN-TOGGLE (founder 2026-07-27) — flip the 3D-Site baked terrain ON/OFF live.
         *  OFF → detach the terrain provider (flat ellipsoid ground) so the founder can study
         *  the pre-terrain "buildings always visible" behaviour in high-relief cities; ON →
         *  re-attach + re-clamp. Default ON. Registered by CesiumViewport at mount. */
        pryzmSetFormaTerrain?: (on: boolean) => void;
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
                /** §P4-CAST-AT-SOURCE (H4, 2026-08-16) — runtime-composer Slot 5,
                 *  `ToolsSlot` (packages/runtime-composer/src/types.ts:2181). This
                 *  is the seam the Create palette itself calls
                 *  (`CreateRailPanel._activateTool`) and that the chat placement
                 *  bridge reaches; before this slot existed the ONLY route was
                 *  `window as unknown as { runtime?: … }`, a double cast through
                 *  `unknown` that defeats the Window type exactly as completely as
                 *  `as any` — the blind spot `check-cast-unknown` (L-845) exists
                 *  to close. Declared with the narrow read surface the consumers
                 *  actually use, not the whole slot, so widening it stays a
                 *  deliberate act. Optional for the same reason as
                 *  `familyRegistryStore` above: transitional writers of this narrow
                 *  window slot may not carry the full runtime. */
                /**
                 * §FIX-ACTIVATE-REPORTS-WHETHER-ANYTHING-RAN (L-4600) — `activate`
                 * now RETURNS whether a registered activator actually ran. It used to
                 * be declared `=> void` here and in `ToolsSlot`, which is precisely
                 * why the chat placement bridge could not tell "armed" from "no
                 * activator exists for this family" and said "tool is active" for
                 * both. Widened deliberately — this slot is documented as
                 * narrow-by-design, so widening it is a deliberate act, which this is.
                 * `hasActivator` is added so a caller can ASK before it commits to a
                 * sentence. `boolean | void` keeps every existing call site valid.
                 */
                readonly tools?: {
                    activate?: (toolId: string, mode?: string) => boolean | void;
                    hasActivator?: (family: string) => boolean;
                };
                /** §U2-COMPONENT-SECTION (UI/UX wave, lane U2) — the composed
                 *  `component` store (the ONE authority for placed occurrences,
                 *  C84 EI-1; `plugins/component/src/store.ts`). Declared with the
                 *  narrow READ surface the instance property section actually uses
                 *  — same reasoning as `tools` above: widening stays a deliberate
                 *  act, and this slot exists so the section needs no
                 *  `(window as any)` (P4) and no double cast through `unknown`
                 *  (L-845). Optional for the same reason as `familyRegistryStore`:
                 *  transitional writers of this narrow window slot may not carry
                 *  the full runtime. */
                readonly stores?: {
                    readonly component?: {
                        get(id: string): {
                            readonly id: string;
                            readonly definitionId: string;
                            readonly typeId: string;
                            readonly instanceParameters:
                                Readonly<Record<string, number | string | boolean>>;
                        } | undefined;
                        getState(): ReadonlyMap<string, object>;
                    };
                };
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

        /**
         * §LEVEL-STACK-LOCKS-VIEW-Y (L-1010) — the SAME quantity as above, but for
         * the level stack driven by the Bottom Action Menu's Level-Stack button.
         *
         * These are two independent explode implementations with two independent
         * offset maps. `pryzmLevelExplodeOffsetForObject` answers 0 whenever
         * inspect mode is inactive, so it silently reports "no offset" for a model
         * the BAM button has genuinely lifted — "unknown" and "zero" sharing a
         * value. Readers must SUM both, never pick one. Undefined until the menu
         * is constructed.
         */
        pryzmBamLevelExplodeOffsetForObject?: ((obj: unknown) => number) | undefined;

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
            // §L-372 Batch 2 / L-382 — 'webgl-classic' is a PROGRAMMATIC heavy-gen target
            // (a classic THREE.WebGLRenderer → backend 'webgl-only'); the corner toggle
            // only ever sends 'auto'|'webgpu'|'webgl'.
            | ((pref: 'auto' | 'webgpu' | 'webgl' | 'webgl-classic') => Promise<boolean>)
            | undefined;
        /**
         * §VIEWPORT-BG-PROBE (L-1191) — read-only diagnostic that names every
         * surface which can be "the background of the 3D view" and returns the
         * hex each one currently holds (overlay clear colour + alpha,
         * `scene.background`, `<bim-viewport>` CSS, `#container` CSS) plus the
         * resolved backend and whether the lightweight per-frame render is armed.
         *
         * Exists because "the background is sometimes grey" has been reported four
         * times without a hex, and the fix each time had to guess which of five
         * stacked surfaces the user was looking at. Call it from the console after
         * reproducing; paste the object into the report. Mutates nothing.
         */
        pryzmViewportBackgroundReport:
            | ((label?: string) => Record<string, unknown>)
            | undefined;
        /**
         * §VIEWPORT-GREY-PIXEL-PROBE (L-1942) — the measurement its sibling above cannot
         * make: the colour actually IN THE FRAMEBUFFER.
         *
         * `pryzmViewportBackgroundReport` reports what each surface is CONFIGURED to be,
         * so every answer built on it ends in an inference. This one renders, downsamples
         * the live canvas to a 5x5 grid and reads the 25 real RGBA values; then hides the
         * ground shadow-catcher, re-reads, and restores it. The per-cell delta says
         * whether the catcher is painting those pixels — an observation, not a verdict —
         * without anyone toggling a panel. Works on both backends.
         *
         * MUTATES: renders up to 3 extra frames and flips `catcher.visible` inside a
         * try/finally that always restores it. No GPU dispose, no material/light change.
         */
        pryzmViewportGreyPixelProbe:
            | ((label?: string) => Record<string, unknown>)
            | undefined;
        obcRendererCanvas: HTMLCanvasElement | undefined;
        renderPipelineManager:
            | {
                onProjectSwitch?: () => void;
                /**
                 * §RESIZE-IS-NOT-A-PROJECT-SWITCH (ADR-0302 §2, L-749) — the ONLY correct
                 * lever for a viewport-geometry change. Reconciles the render size and
                 * NOTHING else: no shadow rebuild, no pipeline reconstruction, no outline
                 * reset, no paused submits.
                 *
                 * ⚠ Do NOT reach for `onProjectSwitch()` here. It pauses WebGPU submits for
                 * the rebuild's duration (834–1862 ms measured), and a `ResizeObserver` on
                 * the editor container fires for the inspector opening, a sidebar toggle, a
                 * panel drag, devtools, browser zoom, and the split view mounting during
                 * project load — a founder trace showed 677 → 678 → 677 px oscillation, each
                 * step taking the full reconstruction path.
                 *
                 * Post-FX targets need nothing (PassNode re-derives from `renderer.getSize()`
                 * every frame) and the shadow map needs nothing (its resolution is a function
                 * of quality TIER, not viewport size).
                 *
                 * @returns true when a corrective `setSize` was issued (real drift), false
                 *          when the renderer already matched — so callers can log honestly
                 *          instead of claiming work they did not do.
                 */
                onViewportResize?: () => boolean;
                /**
                 * §GPU-RESOURCE-LIFETIME (ADR-0297) — the ONLY correct recovery lever
                 * for a viewport that has failed into `phase='error'`. Drives a real
                 * `_rebuildPipeline()`.
                 *
                 * ⚠ Do NOT reach for `onProjectSwitch()` here: it defers the pipeline
                 * rebuild to `onProjectLoaded()` and therefore prints a confident
                 * recovery message while leaving the viewport permanently dark.
                 *
                 * @returns false when there is nothing to rebuild (no WebGPU pipeline),
                 *          so the caller must fall back to a hard reload instead of
                 *          reporting a recovery that did not happen.
                 */
                recoverFromRenderFailure?: () => boolean;
                // §L-361-WEBGPU-TRANSMISSION-GUARD (ADR-0267 §Fix-2 / L-366) — neutralize
                // transmission glass on the NON-batched geometry-add path (resi/office
                // generators add glass outside batchCoordinator batches, so the batch-only
                // neutralizer never fired for them). Real-WebGPU-gated + idempotent; no-op on WebGL.
                neutralizeTransmissionForWebGPU?: () => void;
                /**
                 * §L-10010-TRANSMISSION-SWEEP-COVERS-THE-BATCH — arm a transmission sweep
                 * for the next `render()`. One boolean write; the sweep runs at the frame
                 * boundary, which is the only instant provably after every material the
                 * next compile will touch.
                 */
                armTransmissionSweep?: (reason: string) => void;
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
                /**
                 * §FIX-SHADOW-TIER-CASTER-DESTROY (founder L-908) — run a mutation that
                 * changes the shadow CASTER SET (any `light.castShadow` flip) with WebGPU
                 * submits PAUSED, resuming deferred past the in-flight submit.
                 *
                 * NOT interchangeable with setShadowReallocFrozen: a freeze suppresses the
                 * depth PASS (right for a mapSize realloc), but a caster-set change has no
                 * depth pass left to suppress — three releases the ShadowDepthTexture when
                 * the light stops casting, on its own schedule, inside the next render().
                 * Only pausing submits orders that release against frames in flight.
                 * Never disposes a GPU resource. No-op on WebGL / inactive.
                 */
                runShadowCasterMutation?: (mutate: () => void) => void;
                /**
                 * §FIX-WEBGPU-GROUND-SHADOW-DEVICE-LOSS (founder L-197) — freeze-AWARE
                 * single shadow-map refresh for the L-171 ground-shadow re-home. Sets
                 * `shadowMap.needsUpdate=true` ONLY when no freeze latch is active (the
                 * deferred thaw refreshes the settled scene otherwise), so it can never
                 * force the shadow depth pass mid-tier-realloc / mid-submit and destroy
                 * the ShadowDepthTexture. No-op on WebGL / when shadows are off.
                 */
                requestShadowRefresh?: () => void;
                /**
                 * §FIX-WEBGPU-SCENEPASS-FIRST-CASTER (L-200 follow-up) — debounced,
                 * freeze-aware rebuild of the WebGPU TSL ScenePass. The pass is composed via
                 * `createScenePass(scene)` at boot, when the scene holds no shadow-casters, and
                 * is never rebuilt when one appears — leaving the ground shadow-catcher fully
                 * shadowed (opaque grey) with no projected shadow. initScene calls this ONCE,
                 * the first time real geometry is added, so the pass sees the caster.
                 */
                scheduleShadowRebuild?: () => void;
                /**
                 * §DIAG-GROUND-SHADOW (L-205) — read-only dump of every state that can leave
                 * the key light's shadow depth map unrendered (shadowMap.enabled/autoUpdate,
                 * the freeze latches, keyLight.castShadow, shadow.map, the ScenePass). Mutates
                 * nothing; called from the first-caster gate to name the failing mechanism.
                 */
                logShadowDiagnostics?: (tag: string) => void;
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
        /**
         * §FEAT-PLAN-WALL-ALIGN-INFERENCE (L-135) — gate for the 2D plan wall
         * tool's perpendicular / alignment inference snap + dashed guide. ON by
         * default (the proven 3D behaviour, brought to parity in plan view). Set
         * explicitly to `false` to disable and restore the exact prior plan-wall
         * drawing (no inference snap, no guide); any other value ⇒ enabled.
         */
        __pryzmPlanWallAlignInference?: boolean | undefined;
        __resetCwPrewarm: (() => void) | undefined;
    }
}

export {};
