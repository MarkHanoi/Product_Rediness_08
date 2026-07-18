import { getCesium, storeRegistry } from '@pryzm/core-app-model';
import type { CesiumThreeBridge } from '@pryzm/plugin-geospatial';
import type { UIProps } from '../Layout';
// §FIX-UI-LAYERING-ZINDEX-CONTRACT (L-149, C06 §7) — the single z-index source of
// truth + the no-overlap launcher-rail layout policy. Replaces the hand-picked
// `position:absolute … zIndex:'20'`-inside-#container anchoring that buried these
// always-on pills under root-level chrome (toolbar 9000, nav rail 9999).
import { launcherRailStyle } from './zLayers';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { getCurrentSiteOrigin, getLastBuildableEnvelope } from '../site/siteDispatch';
// §PARCEL-SELECT (L-380 P1) — the real cadastral parcel data source for the map's
// "Select parcel" mode (Barcelona / Catastro pilot, via the same-origin proxy). With
// this wired the select mode fetches REAL parcels; where no parcel exists / outside
// the provider's coverage the map falls back to the honest "no parcel — draw" state.
import { defaultParcelProvider } from '../site/parcel';
// FORMA.6 — pure geometry signature for the real-building GLB re-export cache.
import { buildingGeometrySignature } from '../geospatial/formaBuildingFidelity';
// §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY (L-193) — PURE view-switch
// decision helpers (no Cesium/DOM/THREE): the Forma real-model cache reuse decision +
// its invalidation when the photoreal globe destroys the Forma primitive (Symptom A),
// and the toggleGIS re-activation branch action (Symptom B).
import {
    decideGlobeReactivationAction,
    decideFormaRealPlacement,
    invalidateFormaRealCacheOnPhotorealGlobeEntry,
} from '../geospatial/globePlacementDecisions';
// §FEAT-PLAN-VIEW-GIS (L-104, ADR-0115) — the PLAN-VIEW analogue of the 3D site view:
// composite the real-world GIS/aerial context (buildSiteGisContextRaster) as a plan-canvas
// underlay BENEATH the authored building via the EXISTING L-71 underlay pipeline
// (createPlanCanvasUnderlayFromSiteOverlay), rotated onto PROJECT NORTH by θ
// (computeGisContextUnderlayRotationZ). No new engine / no parallel projector.
import { buildSiteGisContextRaster } from '../../engine/buildSiteGisContextRaster';
import { createPlanCanvasUnderlayFromSiteOverlay } from '../../engine/createSiteOverlayUnderlay';
import { computeGisContextUnderlayRotationZ } from '../site/overlay/siteGisContextGeometry';
// §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the "3D globe" / "3D Site" activations are
// now PRODUCERS of the SAME loading overlay the batch coordinator uses (one overlay, N
// producers — LoadingOverlayController). The overlay dismisses on the REAL readiness chain
// (viewer → tiles → content placed → L-259 ground seat-and-reveal), gates scene input until
// then, and fails visibly (never hangs) if a signal never arrives.
import { beginViewActivationLoading, containViewActivation, type ViewActivationHandle, type ViewActivationTarget } from '../geospatial/viewActivationLoading';
import { getLoadingOverlay } from '../overlays/LoadingOverlayController';
// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — the renderer-agnostic pane
// host: the site-authoring default lands the 2D map (LEFT) + the live 3D Site (RIGHT)
// through the pure `assignViewToPane` model, NOT a hard-coded toggle. The single
// Cesium viewer is RE-TARGETED into the right pane element (never cloned).
import { mountSiteAuthoringPaneShell, type SiteAuthoringPaneShell } from '../../engine/views/SiteAuthoringPaneShell';
import { siteAuthoringDefaultLayout, RIGHT_PANE } from '../../engine/views/paneViewModel';
import type { PaneRendererMounter } from '../../engine/views/PaneHost';
// §L-412 (C59) — PURE decision: should a paned 3D-Site live-update FRAME the plot
// (first parcel commit) or re-render in place (no re-fly)? Keeps the no-jitter
// guarantee unit-testable without a live Cesium viewer.
import { shouldFramePanedSiteOnUpdate } from '../../engine/views/siteAuthoringPaneDecisions';

export interface GISCallbacks {
    toggleGIS: (active: boolean) => void;
    flyToCremornePoint: () => Promise<void>;
    placeBimOnEarth: () => Promise<void>;
    activateView: (mode: '3D' | 'Top' | 'Front' | 'Back' | 'Left' | 'Right') => Promise<void>;
    /** §CESIUM-GIZMO-REMOVED — retained as a no-op (the move-on-globe gizmo + its
     *  origin axis lines were removed); kept so the GIS API shape is stable. */
    gizmoMode: (mode: string) => void;
    /** A.8.c — start the site-boundary polygon-draw tool (no-op until GIS mounted). */
    startBoundaryDraw: () => void;
    /** A.8.c — cancel an in-progress boundary draw. */
    cancelBoundaryDraw: () => void;
}

export function mountGISArea(props: UIProps, runtime: PryzmRuntime | null): GISCallbacks {
    let cesiumViewport: any = null;
    let bridge: CesiumThreeBridge | null = null;
    let isGisInitialized = false;
    let isBimPlacedOnEarth = false;
    let _gisActive = false;
    // §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY (L-193, Symptom B) — set true
    // by an orchestrator (applyResultView('3D') globe entry / engageFormaCesium Forma entry)
    // around its own `toggleGIS(true)` call so the re-activation branch does NOT ALSO place
    // (avoids a double-place / fighting Forma mode). Direct entries (nav-rail GIS button,
    // onboarding pryzmToggleGIS) leave it false → the branch restores the modern real model.
    let gisReactivationSelfPlaceSuppressed = false;
    // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the in-flight "3D globe" / "3D Site"
    // activation (at most one). Holds the shared loading overlay open + the scene input gated
    // until its readiness chain completes; cancelled when the user leaves for another view.
    let activeViewActivation: ViewActivationHandle | null = null;
    // A.8.a/A.8.c — GIS site-authoring surfaces, created when Cesium mounts.
    let geocodeBox: import('../site/siteGeocodeSearchBox').SiteGeocodeSearchBox | null = null;
    let boundaryTool: import('../geospatial/SiteBoundaryDrawTool').SiteBoundaryDrawTool | null = null;
    // A.8.c.f — the Hektar-style 2D cream/shadow boundary-draw map. This REPLACES
    // the Cesium-3D draw surface for the DRAW step (Cesium stays for 3D render):
    // startBoundaryDraw() opens THIS 2D map; the legacy Cesium `boundaryTool` is
    // retained for the console fallback (pryzmStartBoundaryDraw3D) only.
    let map2dHandle: { dispose: () => void; rearm: () => void } | null = null;
    // §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — the live site-authoring
    // split (2D map LEFT · 3D Site RIGHT). Non-null while the paned layout is active;
    // consulted by the Forma live-update gate (a paned 3D Site is NOT `map2d`) and by
    // the envelope facts-card host resolution so the card renders on the RIGHT pane.
    let siteAuthoringPanes: SiteAuthoringPaneShell | null = null;
    // §L-412 (C59, Req 2) — has the paned 3D Site been FRAMED to the committed plot yet?
    // The pane opens zoomed out (whole-city scale); on the FIRST parcel-boundary commit
    // we fire ONE framed render (renderFormaMassing(true) → §GLOBE-FIT-BUILDING
    // flyToBoundingSphere) so the user sees THEIR plot + envelope, not the whole city.
    // Reset on every (re)mount; every subsequent zoning/edit update falls back to the
    // no-re-fly path so continuous edits never yank the camera (the no-jitter guarantee).
    let siteAuthoringPaneFramed = false;
    // A.8.c.f.2 (defect 1) — remember the LAST geocoded result so the 2D map can
    // fit its exact bbox (the Site location store keeps only lat/lon — the bbox is
    // otherwise lost, leaving the 2D map at a coarse point zoom). Set in the
    // geocode `onFlyTo` callback below; consumed by getMapInitial().
    let lastGeocodeFrame: { lat: number; lon: number; bbox?: [number, number, number, number] } | null = null;

    // Read the Site's location (set by the geocode search box) as the
    // projection origin for the boundary-draw tool. Falls back to null so the
    // draw tool uses its first clicked vertex.
    const getSiteOrigin = (): { lat: number; lon: number } | null => {
        const loc = (runtime?.siteModelStore as { getSite?: () => { location?: { latitude: number; longitude: number } } | null } | undefined)?.getSite?.()?.location;
        if (loc && (loc.latitude !== 0 || loc.longitude !== 0)) {
            return { lat: loc.latitude, lon: loc.longitude };
        }
        return null;
    };

    // A.8.c.f — read the geocoded Site location to centre the 2D map. The geocode
    // search box (A.8.a) sets this via site.updateLocation. Returns null if unset
    // (the 2D map then opens at a world view; drawing still works).
    const getMapInitial = (): { lat: number; lon: number; bbox?: [number, number, number, number]; zoom?: number } | undefined => {
        // Prefer the last geocoded frame (carries the bbox → the 2D map fits the
        // exact plot, not a coarse point). Fall back to the Site location point.
        if (lastGeocodeFrame) {
            console.log(
                '[gis] getMapInitial: opening 2D map at geocode frame; fitBounds target =',
                lastGeocodeFrame.bbox ?? `point(${lastGeocodeFrame.lat},${lastGeocodeFrame.lon}) @ z17`,
            );
            return { lat: lastGeocodeFrame.lat, lon: lastGeocodeFrame.lon, bbox: lastGeocodeFrame.bbox, zoom: 17 };
        }
        const o = getSiteOrigin();
        return o ? { lat: o.lat, lon: o.lon, zoom: 17 } : undefined;
    };

    // A.8.c.f — open the Hektar-style 2D cream/shadow boundary-draw map overlay
    // (NOT the Cesium 3D draw). Mounts on #container; on commit/cancel it disposes
    // + closes. Lazy-imports the MapLibre chunk so it is not in the main bundle.
    const startBoundaryDraw = (drawOpts?: { overlayOnly?: boolean; parent?: HTMLElement }): void => {
        if (map2dHandle) {
            console.log('[gis] map2d already open');
            return;
        }
        // §L-412 (C59 Phase 1b) — the MapLibre 2D map mounts into its assigned PANE
        // element (LEFT pane) when the site-authoring split is active, instead of the
        // `inset:0` `#container` overlay. Falls back to `#container` for the classic
        // single-pane launchers (unchanged behaviour).
        const viewport = drawOpts?.parent ?? document.getElementById('container');
        if (!viewport) {
            console.error('[gis] map2d: #container not found');
            return;
        }
        void import('../geospatial/SiteBoundaryMap2D').then(({ mountSiteBoundaryMap2D }) => {
            map2dHandle = mountSiteBoundaryMap2D({
                parent: viewport,
                runtime: runtime ?? null,
                initial: getMapInitial(),
                getOrigin: getSiteOrigin,
                // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — open the map in overlay-only mode
                // for the PDF/image import path: the draw tool is disarmed (no boundary, no
                // generate), only the site-plan overlay panel + calibration are live.
                overlayOnly: drawOpts?.overlayOnly ?? false,
                // §PARCEL-SELECT (L-380 P1) — wire the real Catastro parcel provider so the
                // map's "Select parcel" mode fetches REAL cadastral geometry (Barcelona pilot).
                // Outside coverage the map degrades to the honest "no parcel — draw" state.
                parcelProvider: defaultParcelProvider,
                // O.7.2.b — CANCEL (Esc / ×) disposes the map → drop the handle.
                onClose: () => { map2dHandle = null; },
                // O.7.2.b — COMMIT does NOT dispose: the cream map + boundary stay
                // alive so the onboarding "Generate with AI?" confirm renders over a
                // live plan map. Keep `map2dHandle` so closeBoundaryMap2D() (called at
                // generate-time) can tear it down.
                onCommit: () => {
                    console.log('[gis] map2d: boundary committed — keeping cream plan map alive (teardown deferred to generate).');
                },
            });
            console.log('[gis] map2d: Hektar 2D boundary-draw map opened');
        }).catch((err: unknown) => {
            console.error('[gis] map2d: failed to open', err);
            runtime?.events?.emit('pryzm:toast', { message: 'Could not open the 2D boundary map — see console.', severity: 'error' });
        });
    };
    const cancelBoundaryDraw = (): void => {
        if (map2dHandle) {
            map2dHandle.dispose();
            map2dHandle = null;
        }
        boundaryTool?.cancel();
    };

    // O.7.2.b — explicit teardown of the (possibly committed-but-still-live) 2D
    // Hektar map. After a boundary COMMIT the map stays mounted showing the drawn
    // boundary (so the "Generate with AI?" confirm renders over a live cream plan
    // map); it is disposed ONLY here, at generate-time. Idempotent + double-dispose
    // safe (the handle's dispose() guards on `disposed`, and we null the handle).
    const closeBoundaryMap2D = (): void => {
        // §L-412 — when the site-authoring SPLIT is live, the 2D map lives in the left
        // pane; tearing down at generate-time means dismissing the whole split (which
        // unmounts the map AND re-homes the single Cesium viewer back to #container).
        if (siteAuthoringPanes && !siteAuthoringPanes.isDisposed) {
            console.log('[gis] §L-412 closeBoundaryMap2D() — dismissing the site-authoring split at generate-time.');
            unmountSiteAuthoringPanes();
            return;
        }
        if (map2dHandle) {
            console.log('[gis] map2d: closeBoundaryMap2D() — tearing down the cream plan map at generate-time.');
            map2dHandle.dispose();
            map2dHandle = null;
        }
    };

    // §L-384 — RE-DRAW after a committed boundary. The 2D map stays mounted post-commit
    // (O.7.2.b); this asks it to CLEAR the immutable C19 §1.4 boundary (via site.replace)
    // and re-arm the draw so the user can author a new plot. No-op if the map isn't open.
    const rearmBoundaryDraw = (): void => {
        if (map2dHandle) {
            console.log('[gis] §L-384 rearmBoundaryDraw() — clear committed boundary + re-arm draw.');
            map2dHandle.rearm();
        }
    };

    // F.11.4 Wave 14 — runtime.geospatial.isConfigured wiring.
    // Phase F stub always returns false; Phase F.11.4 wires the real adapter
    // once the geographic origin is set by the user.
    const _geoConfigured = runtime?.geospatial.isConfigured() ?? false;
    console.debug('[GIS] geospatial configured:', _geoConfigured);

    // PERF-FIX-#1: Made async so we can await the lazy Cesium load.
    // Cesium is already loaded by the time this is called (GIS must be active first),
    // so getCesium() resolves from cache instantly with zero network cost.
    const flyToCremornePoint = async () => {
        if (!cesiumViewport) return;
        const viewer = cesiumViewport.getViewer();
        if (!viewer) return;

        const Cesium = await getCesium();
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(151.21809, -33.84495, 400),
            duration: 3.5
        });
    };

    const toggleGIS = (active: boolean) => {
        _gisActive = active;
        console.log("GIS toggle activated:", active);
        const viewport = document.getElementById('container');
        if (!viewport) {
            console.error("GIS: Viewport container not found");
            return;
        }

        // §CESIUM-GIZMO-DETACH (founder 2026-06-19) — the BIM TransformControls gizmo's
        // stock three.js "helper" axis lines (scaled ~1e6, recolored to PRYZM violet in
        // initTransformControllers: X→#6600FF, Z→#7B3FF2) are the near-infinite
        // green/purple lines at the building corner that composite through into the
        // Cesium view when a wall is selected. Detach the gizmo on GIS entry so no helper
        // lines are live; it reattaches on reselect back in the BIM view (real geometry +
        // in-editor snapping untouched). Carrier-independent: kills the lines whether or
        // not the BIM canvas is fully hidden.
        const detachBimGizmoForGis = () => {
            try {
                (globalThis as unknown as { transformControls?: { detach?: () => void } }).transformControls?.detach?.();
            } catch { /* noop */ }
        };

        if (active) {
            console.log("GIS: Activating geospatial view...");
            viewport.style.position = 'relative';
            viewport.style.overflow = 'hidden';

            // 🎮 DISABLE THREE.JS CAMERA CONTROLS - Let Cesium handle navigation
            if (props.world.camera && props.world.camera.controls) {
                props.world.camera.controls.enabled = false;
                console.log("GIS: Three.js camera controls disabled");
            }

            if (!isGisInitialized) {
                // PERF-FIX-#1: Load Cesium and CesiumThreeBridge dynamically here,
                // co-located with the CesiumViewport import that already fires on first use.
                // Both imports are batched in Promise.all so they download in parallel.
                Promise.all([
                    import('../geospatial/CesiumViewport'),
                    getCesium(),
                    import('@pryzm/plugin-geospatial'),
                    // A.8.a/A.8.c — GIS site-authoring surfaces (lazy-loaded with Cesium).
                    import('../site/siteGeocodeSearchBox'),
                    import('../geospatial/SiteBoundaryDrawTool'),
                ]).then(async ([{ CesiumViewport }, Cesium, { CesiumThreeBridge }, { mountSiteGeocodeSearchBox }, { SiteBoundaryDrawTool }]) => {
                    if (!cesiumViewport) {
                        cesiumViewport = new CesiumViewport(viewport, runtime ?? null /* B-runtime-thread CesiumViewport */);
                        await cesiumViewport.mount();
                        // GIS-CESIUM-ZRAISE — the Cesium container now defaults to
                        // display:none (so it never floats over the BIM view before
                        // GIS is toggled). The FIRST-init path mounts but previously
                        // relied on the container being visible by default — now we
                        // must explicitly show it (raises z-index above the BIM
                        // WebGPU overlay + hides the BIM canvases + resizes).
                        detachBimGizmoForGis();
                        cesiumViewport.setVisible(true);
                        console.log("GIS: Cesium viewer mounted successfully");
                        const viewer = cesiumViewport.getViewer();
                        if (viewer) {
                            // §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — wire the bridge to the
                            // OWNER via a provider, not a captured viewer. A WebGPU device-loss
                            // recovery disposes+recreates CesiumViewport's viewer; the provider
                            // re-reads the CURRENT one on every activate() so the bridge never
                            // binds to (and reads `.scene` off) a disposed viewer.
                            bridge = new CesiumThreeBridge(() => cesiumViewport?.getViewer() ?? null, props.world);
                            bridge.activate();

                            // Set anchor for Sydney Opera House (Default)
                            const lon = 151.2153;
                            const lat = -33.8568;
                            const height = 0;
                            const cartesian = Cesium.Cartesian3.fromDegrees(lon, lat, height);
                            bridge.setAnchor(cartesian);

                            isGisInitialized = true;

                            // A.8.a — mount the address-search box. onFlyTo flies the
                            // Cesium camera to the picked result (bbox if available,
                            // else a framed point); the box itself dispatches
                            // site.updateLocation (no Cesium import in that module).
                            geocodeBox = mountSiteGeocodeSearchBox({
                                parent: viewport,
                                runtime: runtime ?? null,
                                onFlyTo: (result) => {
                                    // A.8.c.f.2 — capture the bbox so the 2D Hektar
                                    // map can fit the exact plot when opened.
                                    lastGeocodeFrame = { lat: result.lat, lon: result.lon, bbox: result.bbox };
                                    // We fly to the exact plot bbox below; the geocode
                                    // box ALSO dispatches site.updateLocation, which the
                                    // CesiumViewport subscribes to. Tell it to skip the
                                    // resulting (coarser, point-altitude) re-fly so we
                                    // don't double-fly — this bbox framing is better.
                                    cesiumViewport?.suppressNextSiteLocationFly?.();
                                    if (result.bbox) {
                                        const [w, s, e, n] = result.bbox;
                                        viewer.camera.flyTo({
                                            destination: Cesium.Rectangle.fromDegrees(w, s, e, n),
                                            duration: 2.5,
                                        });
                                    } else {
                                        viewer.camera.flyTo({
                                            destination: Cesium.Cartesian3.fromDegrees(result.lon, result.lat, 600),
                                            duration: 2.5,
                                        });
                                    }
                                    console.log('[gis] camera flying to', result.displayName);
                                },
                            });

                            // A.8.c — construct the polygon-draw tool (started on demand
                            // via startBoundaryDraw()).
                            boundaryTool = new SiteBoundaryDrawTool({
                                viewer,
                                Cesium,
                                runtime: runtime ?? null,
                                getOrigin: getSiteOrigin,
                            });
                            // A.8.c.f — DevTools console entry points. The default
                            // pryzmStartBoundaryDraw() now opens the Hektar 2D map
                            // (the draw surface); pryzmStartBoundaryDraw3D() keeps the
                            // legacy Cesium-globe draw as a fallback.
                            window.pryzmStartBoundaryDraw = () => startBoundaryDraw();
                            window.pryzmStartBoundaryDraw3D = () => boundaryTool?.start();
                            window.pryzmCancelBoundaryDraw = () => cancelBoundaryDraw();
                            console.log('[gis] site-authoring surfaces ready (geocode search + 2D Hektar boundary map). Run pryzmStartBoundaryDraw() for the 2D draw, pryzmStartBoundaryDraw3D() for the Cesium draw.');
                        }
                    }
                }).catch((err: any) => {
                    console.error("GIS: Error mounting Cesium viewer:", err);
                });
            } else {
                console.log("GIS: Re-activating existing Cesium viewer");
                // A.8.a — re-show the geocode search box overlay with the GIS view.
                if (geocodeBox) geocodeBox.element.style.display = '';
                // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — the DIRECT re-entry path (nav-rail GIS
                // button / window.pryzmToggleGIS) has no orchestrator try/catch around it, so a
                // synchronous throw here (setVisible / restorePhotorealGlobeContent) would escape as
                // an uncaught error the ViewportCrashGuard does not net → router navigate-out/reload.
                // Contain the whole re-entry placement: log + surface in-editor retry, never propagate.
                try {
                if (cesiumViewport) {
                    detachBimGizmoForGis();
                    cesiumViewport.setVisible(true);

                    // §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY (L-193/L-186,
                    // Symptom B) — decide how to restore the building on a Cesium RE-entry.
                    // `setVisible(false)` (on GIS exit) preserved the Cesium primitives, but a
                    // view round-trip (esp. globe→forma→globe) DESTROYS the globe real-model
                    // primitive (CesiumViewport.clearRealModelOnGlobe). The old branch only
                    // re-synced the LEGACY loadBimGltf model (gated on isBimPlacedOnEarth) and
                    // never re-ran the modern real-model placement + reframe — so a building
                    // placed via the real-model path vanished on a direct re-entry (nav-rail
                    // GIS button / onboarding). The pure decision preserves the legacy re-sync
                    // exactly and ADDS the modern restore for the direct (non-suppressed) path;
                    // applyResultView/engageFormaCesium suppress it (they self-place).
                    const reactivation = decideGlobeReactivationAction({
                        isBimPlacedOnEarth,
                        selfPlaceSuppressed: gisReactivationSelfPlaceSuppressed,
                    });
                    if (reactivation === 'legacy-gltf-resync') {
                        // 🔄 SYNC UPDATE (legacy placeBimOnEarth path) — no camera fly.
                        // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — this detached promise had NO .catch;
                        // a rejected GLB export / loadBimGltf became an unhandled rejection. Contain it.
                        import('@pryzm/file-format').then(async ({ exportFragmentsToGLB }) => {
                            const url = await exportFragmentsToGLB(props.world.scene.three as any);
                            await cesiumViewport.loadBimGltf(url, {}, 1.0, false);
                            console.log("GIS: Sync update completed (no camera fly)");
                        }).catch((err: unknown) => {
                            console.error('[gis] §FIX-GLOBE-CLICK-NAVIGATES-OUT legacy GLB re-sync failed — contained (globe stays open):', err);
                        });
                    } else if (reactivation === 'restore-real-model') {
                        console.log('[gis] §FIX-GISLAYOUT-…-GLOBE-REENTRY: direct globe re-entry — re-placing the real model + reframing (idempotent).');
                        restorePhotorealGlobeContent();
                    } else {
                        console.log('[gis] §FIX-GISLAYOUT-…-GLOBE-REENTRY: re-activation placement suppressed (orchestrator self-places).');
                    }
                }
                } catch (err) {
                    console.error('[gis] §FIX-GLOBE-CLICK-NAVIGATES-OUT re-entry placement threw — contained (kept in-editor):', err);
                    activeViewActivation?.fail(`The 3D globe failed to reopen: ${String((err as Error)?.message ?? err)}`);
                }
                if (bridge) {
                    // §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — after a device-loss recovery the
                    // bridge re-acquires the CURRENT viewer; if none is live (viewer missing /
                    // mid-recreate) activate() throws by design. SURFACE that to the loading
                    // overlay's "Try again" instead of letting the unhandled throw hang the
                    // overlay for 25s at stage "content".
                    try {
                        bridge.activate();
                    } catch (err) {
                        console.error('[gis] §FIX-GLOBE-ACTIVATE-STALE-VIEWER re-activation could not bind the bridge to a live viewer:', err);
                        activeViewActivation?.fail(
                            `The 3D globe could not reopen after a graphics reset: ${String((err as Error)?.message ?? err)}`,
                        );
                    }
                }
            }
        } else {
            console.log("GIS: Deactivating geospatial view (preserving state)");

            // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the user left the Cesium view
            // while it was still loading. Cancel the activation so the overlay comes down and
            // the input gate lifts; never leave a dismissed view holding the screen hostage.
            activeViewActivation?.cancel('GIS deactivated');

            // A.8.c — abort any in-progress boundary draw when leaving GIS.
            boundaryTool?.cancel();
            // A.8.a — hide the geocode search box overlay so it doesn't float over
            // the BIM view (it shares the #container parent, not the Cesium canvas).
            if (geocodeBox) geocodeBox.element.style.display = 'none';

            if (bridge) {
                bridge.deactivate();
            }

            if (cesiumViewport) {
                cesiumViewport.setVisible(false);
            }

            // 🎮 RE-ENABLE THREE.JS CAMERA CONTROLS - Return control to BIM mode
            if (props.world.camera && props.world.camera.controls) {
                props.world.camera.controls.enabled = true;
                console.log("GIS: Three.js camera controls re-enabled");
            }

            // Reset Three world transform to identity when leaving GIS
            const threeScene = props.world.scene.three;
            threeScene.matrixAutoUpdate = true;
            threeScene.matrix.identity();
            threeScene.position.set(0, 0, 0);
            threeScene.quaternion.set(0, 0, 0, 1);
            threeScene.scale.set(1, 1, 1);
            threeScene.updateMatrixWorld(true);
        }
    };

    // Extract Place-BIM-on-Earth into a named closure so GISRailPanel can call
    // props.gisPlaceBim() — keeps the complex GLB export + Cesium wiring inside
    // GISAreaLayout where cesiumViewport, bridge, and getCesium() are in scope.
    const placeBimOnEarth = async () => {
        const lat = parseFloat(prompt('Latitude:', '-33.8568') || '');
        const lon = parseFloat(prompt('Longitude:', '151.2153') || '');
        const alt = parseFloat(prompt('Altitude (m):', '0.0') || '0.0');
        if (isNaN(lat) || isNaN(lon)) return;
        const bimManagerGlb = window.bimManager; // TODO(D.4): legacy bimManager — replace with runtime.scene.renderer once EngineBootstrap split lands
        if (!bimManagerGlb?.scene) return;
        const glbModule = await import('@pryzm/file-format');
        const blobUrl = await glbModule.exportFragmentsToGLB(bimManagerGlb.scene);
        console.log('[GIS] Loading GLB in Cesium:', blobUrl);
        if (cesiumViewport) {
            await cesiumViewport.loadBimGltf(blobUrl, { lat, lon, height: alt }, 1.0, true);
            isBimPlacedOnEarth = true;
            if (bridge) {
                const Cesium = await getCesium();
                const cartesian = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
                bridge.setAnchor(cartesian);
            }
        }
    };

    const activateView = async (mode: '3D' | 'Top' | 'Front' | 'Back' | 'Left' | 'Right') => {
        // If GIS is active, deactivate it before switching back to BIM views
        if (_gisActive) {
            toggleGIS(false);
        }

        // Route ALL view switches through ViewController.activate() — the single
        // authority that dispatches 'view-activated', triggering
        // RenderPipelineManager.updateCamera() so the TSL pipeline rebuilds
        // against the new camera object (perspective ↔ orthographic switch).
        //
        // Before this fix the call went directly to navManager.setViewMode(),
        // which switched the OBC camera projection but never dispatched
        // 'view-activated'.  The WebGPU TSL pipeline then held a stale camera
        // reference; the first rp.render() threw, _hasPipelineError latched
        // true, and the scene appeared frozen.
        if (props._viewController) {
            await props._viewController.activate(mode);
        } else if (props.navManager) {
            // Fallback: pre-ViewController callers; grid.fade must be set manually.
            props.grid.fade = mode === '3D';
            await props.navManager.setViewMode(mode as any);
        }
    };

    // §CESIUM-GIZMO-REMOVED (2026-06-19) — the move-on-globe transform gizmo (the
    // green/purple origin axis lines) was removed from the Cesium viewer; this stays
    // as a no-op so the GIS API shape is unchanged for any caller.
    const gizmoMode = (_mode: string) => { /* gizmo removed — no-op */ };

    // O.7.2 — re-frame the Cesium camera to the authored Site plot. Used by the
    // post-generate 3D toggle: when the user opts into the 3D globe AFTER generate,
    // the Cesium viewer may be sitting at a stale/default view (it was mounted for
    // the DRAW step and never re-framed once the boundary committed). Re-flying to
    // the Site lat/lon lands the user looking straight at their plot instead of the
    // washed-out globe limb. Best-effort + public API only (no CesiumViewport edit).
    const reframeSiteIn3D = async (): Promise<void> => {
        if (!cesiumViewport) return;
        const viewer = cesiumViewport.getViewer?.();
        if (!viewer) return;
        // §GLOBE-CAMERA-FOLLOWS-BUILDING (2026-06-17) — PRIMARY framing path. The
        // building was just placed by placeBuildingOnGlobe() → renderBuildingOnGlobe,
        // which seats `formaMassingOrigin` (the centroid of the ACTUAL placed massing
        // in the LTP-ENU scene frame) even on the photoreal globe (it runs before the
        // frameCentroid:false guard). flyToFormaSite() frames the camera to THAT
        // building centroid — so the view follows the building to its correct
        // geocoded location. This fixes the founder's "building in the WRONG location
        // / camera looks at the wrong place": the old path below read getSiteOrigin()
        // (siteModelStore.getSite()?.location), a DIFFERENT and often-empty source
        // than the getFormaOrigin() (LTP scene-frame) that actually anchors the
        // building — when empty it logged "no Site location yet — leaving camera
        // as-is", stranding the camera at a stale view while the building sat correctly
        // elsewhere. flyToFormaSite() is public, Cesium-only, and no-ops cleanly when
        // no massing has been placed (then we fall through to the Site-location flyTo).
        if (typeof cesiumViewport.flyToFormaSite === 'function' && cesiumViewport.hasFormaMassingPlaced?.()) {
            try {
                cesiumViewport.flyToFormaSite();
                console.log('[gis] reframeSiteIn3D: framed camera to the placed building (formaMassingOrigin).');
                return;
            } catch (err) {
                console.warn('[gis] reframeSiteIn3D: building-anchored flyTo failed, falling back to Site location:', err);
            }
        }
        const o = getSiteOrigin();
        if (!o) {
            console.log('[gis] reframeSiteIn3D: no Site location yet — leaving camera as-is.');
            return;
        }
        try {
            const Cesium = await getCesium();
            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(o.lon, o.lat, 600),
                orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 },
                duration: 1.5,
            });
            viewer.scene.requestRender();
            console.log('[gis] reframeSiteIn3D: framed plot at', o);
        } catch (err) {
            console.warn('[gis] reframeSiteIn3D failed (non-fatal):', err);
        }
    };

    // O.7.2 / O.7.2.b — the post-generate DUAL-VIEW toggle. Founder-tested twice:
    // after "Generate apartment" the LEFT pane went BLANK. ORIGINAL root cause: the
    // cream 2D Hektar map disposed itself on boundary-COMMIT and the onboarding flow
    // then force-activated the BIM 3D view WITHOUT turning GIS off — leaving the
    // orphaned Cesium overlay over the BIM canvas. O.7.2.b ALSO fixes the upstream
    // half: commit() now FREEZES (keeps the cream map + boundary alive) so the
    // confirm renders over a live plan map; the map is disposed ONLY here, at
    // generate-time (showSiteResultView → closeBoundaryMap2D).
    //
    // The result landing: DEFAULT to the BIM DUAL-PANE (GIS off → LEFT 3D viewport ·
    // RIGHT 2D plan via SplitViewManager — the user sees their generated apartment,
    // not white) and give an explicit, on-brand control to flip to the Cesium-3D
    // globe (the building on the globe, re-framed to the plot) and back. Reuses the
    // existing toggleGIS + view-switch + split-view plumbing.
    let resultToggle: HTMLElement | null = null;
    let resultViewMode: '2D' | '3D' = '2D';
    // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — the ONE view-mode control is the
    // segmented result bar (◧ 3D + plan · ◉ 3D globe · ◉ 3D Site). `activeSegment`
    // is the tri-state truth of which of the THREE top-level modes is active — it
    // paints all three segments (so the user ALWAYS knows which view they're in)
    // and gates the globe-only sub-controls. The Forma ("3D Site") view is no longer
    // a rival bar that REPLACES this one: it mounts a SECONDARY contextual sub-bar
    // beneath it while `activeSegment === 'forma'` keeps ◉ 3D Site lit here.
    let activeSegment: '2D' | '3D' | 'forma' = '2D';
    let btn2dRef: HTMLButtonElement | null = null;
    let btn3dRef: HTMLButtonElement | null = null;
    let formaBtnRef: HTMLButtonElement | null = null;

    // §GLOBE-FIDELITY (founder) — mirror the Forma view's [Real][Massing] toggle on
    // the photoreal "3D globe" result view. 'real' (the default — matches today's
    // behaviour where the globe overlays the full PRYZM model on the tiles) shows the
    // authored building; 'massing' shows the abstract Forma massing blocks ON the
    // tiles instead. The fidelity buttons live in the result-view bar and are shown
    // ONLY while the "3D globe" mode is active (scoped exactly like the Forma toggle's
    // own fidelity buttons are scoped to the Forma canvas).
    let globeBuildingFidelity: 'massing' | 'real' = 'real';
    let globeFidelityWrap: HTMLElement | null = null;
    let refreshGlobeFidelityButtons: () => void = () => { /* bar not mounted yet */ };
    // §CESIUM-PERF-GLOBE-GLB-CACHE (2026-07-01) — signature cache for the REAL-model
    // GLB export on the PHOTOREAL globe path (mirrors the Forma path's formaReal* set).
    // The globe path previously re-exported the ~22 MB GLB on EVERY entry; these let it
    // export ONCE per geometry-version and reuse the placed model across view switches.
    // `computeBuildingSignature()` (defined below) folds element counts + coarse geom.
    let globeRealLastSig: string | null = null;
    let globeRealExporting = false;
    let globeRealPlaced = false;
    // §GLOBE-ZOOM-DEFAULT (founder, 2026-06-17) — the "Zoom to Site" affordance used
    // to live ONLY on the Forma toggle bar (mounted exclusively by "Site 3D (Forma)"),
    // so on the photoreal "3D globe" path the user had no way to reframe to the house.
    // We mount it in the RESULT bar too, shown whenever the 3D-globe mode is active
    // (same gating as the fidelity group), so it is visible BY DEFAULT once the globe
    // view is entered.
    let globeZoomBtn: HTMLButtonElement | null = null;
    // §FLY-TOUR (founder, 2026-06-17) — "▶ Fly tour" cinematic flythrough button,
    // mounted next to "Zoom to Site" on the 3D-globe result bar. Enabled only once
    // a building is placed (hasFormaMassingPlaced); disabled while a tour runs.
    let globeTourBtn: HTMLButtonElement | null = null;

    const removeResultToggle = (): void => {
        if (resultToggle?.parentElement) resultToggle.parentElement.removeChild(resultToggle);
        resultToggle = null;
        btn2dRef = null;
        btn3dRef = null;
        formaBtnRef = null;
        globeFidelityWrap = null;
        globeZoomBtn = null;
        globeTourBtn = null;
        refreshGlobeFidelityButtons = () => { /* bar gone */ };
    };

    // Active-state styling for the toggle buttons (no <style> injection — inline,
    // on-brand white / #6600FF).
    const styleResultBtn = (el: HTMLButtonElement | null, active: boolean): void => {
        if (!el) return;
        el.style.background = active ? '#6600FF' : 'transparent';
        el.style.color = active ? '#ffffff' : '#6600FF';
    };
    const refreshResultButtons = (): void => {
        // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — paint all THREE top-level segments
        // from the single `activeSegment` truth so the active view is ALWAYS visible
        // (the founder's "I don't know which view I'm in"). ◉ 3D Site (forma) is now a
        // first-class lit segment, not an unpainted launch button.
        styleResultBtn(btn2dRef, activeSegment === '2D');
        styleResultBtn(btn3dRef, activeSegment === '3D');
        styleResultBtn(formaBtnRef, activeSegment === 'forma');
        const globeActive = activeSegment === '3D';
        // §GLOBE-FIDELITY — the [Real][Massing] group is only meaningful on the
        // photoreal "3D globe" view; hide it on the BIM dual-pane + Forma modes.
        if (globeFidelityWrap) globeFidelityWrap.style.display = globeActive ? 'flex' : 'none';
        // §GLOBE-ZOOM-DEFAULT — "Zoom to Site" is only meaningful on the 3D globe
        // (it reframes the Cesium camera to the placed building); hide otherwise.
        if (globeZoomBtn) globeZoomBtn.style.display = globeActive ? 'inline-block' : 'none';
        // §FLY-TOUR — same gating as Zoom to Site; also disabled (greyed) until a
        // building is placed, since the tour orbits the placed massing centroid.
        if (globeTourBtn) {
            globeTourBtn.style.display = globeActive ? 'inline-block' : 'none';
            const canTour = cesiumViewport?.hasFormaMassingPlaced?.() ?? false;
            globeTourBtn.disabled = !canTour;
            globeTourBtn.style.opacity = canTour ? '1' : '0.45';
            globeTourBtn.style.cursor = canTour ? 'pointer' : 'not-allowed';
        }
    };

    // O.7.2.b — land the generated result on the FIXED DUAL-PANE: LEFT = 3D
    // viewport, RIGHT = 2D plan (the editor's SplitViewManager secondary pane). GIS
    // off reveals the BIM canvas; activating the 3D view + opening the split-view
    // gives the founder-specified "LEFT 3D · RIGHT plan" without the Cesium globe.
    const applyBimDualPane = async (): Promise<void> => {
        if (_gisActive) toggleGIS(false);
        try {
            if (props._viewController) await props._viewController.activate('3D');
            else if (props.navManager) { props.grid.fade = true; await props.navManager.setViewMode('3D' as any); }
        } catch (err) {
            console.warn('[gis] applyBimDualPane: 3D activation failed (non-fatal):', err);
        }
        // Open the secondary plan pane (RIGHT). Idempotent — activate() is a no-op
        // when already active; auto-open on project-load may already have run.
        try {
            const svp = window.splitViewManager as { isActive?: boolean; activate?: () => void } | undefined;
            if (svp?.activate && !svp.isActive) svp.activate();
        } catch (err) {
            console.warn('[gis] applyBimDualPane: split-view activate failed (non-fatal):', err);
        }
    };

    /**
     * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — open a loading session on the SHARED
     * overlay for a Cesium view activation and GATE the scene until it is genuinely ready.
     *
     * The signals port is bound LATE (each closure reads the live `cesiumViewport`), because
     * `toggleGIS(true)` constructs the viewport asynchronously — the producer subscribes to the
     * tile counters only after `whenViewerReady()` resolves.
     *
     * Everything the producer waits on is a REAL signal that already existed:
     *   • whenReady()            — the viewer is mounted (already used by awaitCesiumReady).
     *   • onTileLoadProgress()   — Cesium's own pending/processing tile counters.
     *   • whenGroundSettled()    — the L-259 (§FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF) ground
     *                              seat-and-reveal terminal: the building is anchored on ground
     *                              that has been MEASURED. That is the whole point — L-259 was
     *                              caused by acting BEFORE that signal.
     */
    const startViewActivationLoading = (
        target: ViewActivationTarget,
        retry: () => void,
    ): ViewActivationHandle => {
        // Rapid view switching must never stack overlays — supersede the previous activation.
        activeViewActivation?.cancel('superseded by a new view activation');
        const handle = beginViewActivationLoading({
            target,
            overlay: getLoadingOverlay(),
            onRetry: retry,
            signals: {
                whenViewerReady: () => awaitCesiumReady(),
                // §SS-FIX-FORMA-TILES-READINESS-KEYLESS-GATE (L-327) — tell the (Cesium-free)
                // readiness state machine whether tiles will EVER stream. A keyless flat-ground
                // Forma study has no provider → the tiles gate is skipped instead of stalling for
                // 25 s. Bound late like the other closures (reads the live viewport). Null viewport
                // → false (skip): there is no viewer to stream tiles, so gating would only hang.
                hasRealTileProvider: () => cesiumViewport?.hasRealTileProvider?.() ?? false,
                onTileLoadProgress: (cb) =>
                    (cesiumViewport?.onTileLoadProgress?.(cb) as (() => void) | undefined) ??
                    (() => { /* old build / no viewer — the poll below still drives the bar */ }),
                sampleTileLoadProgress: () =>
                    cesiumViewport?.sampleTileLoadProgress?.() ??
                    { pending: 0, processing: 0, tilesLoaded: true },
                whenGroundSettled: () =>
                    cesiumViewport?.whenGroundSettled?.() ??
                    Promise.resolve({ settled: true, source: 'no-viewport', baseHeightM: 0 }),
                setNavigationEnabled: (on: boolean) => { cesiumViewport?.setNavigationEnabled?.(on); },
            },
        });
        activeViewActivation = handle;
        void handle.done.then(() => {
            if (activeViewActivation === handle) activeViewActivation = null;
        });
        return handle;
    };

    /**
     * L-270 — register an in-flight content placement (the GLB export + Cesium primitive load)
     * with the active view activation, so the overlay stays up until the building has ACTUALLY
     * landed on the globe/site — not merely until the massing call returned.
     */
    const trackViewActivationPlacement = (p: Promise<unknown>): void => {
        activeViewActivation?.trackPlacement(p);
    };

    const applyResultView = async (mode: '2D' | '3D'): Promise<void> => {
        // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — choosing a top-level 2D/3D segment
        // leaves the Forma "3D Site" view, so tear down its secondary sub-bar (no-op
        // when it isn't mounted). Keeps exactly ONE contextual sub-bar at a time.
        removeFormaViewToggle();
        resultViewMode = mode;
        activeSegment = mode;
        if (mode === '3D') {
            // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the founder's "3D globe" takes
            // seconds (Cesium mount → photoreal tile streaming → GLB export → the L-259 ground
            // clamp) and used to show NOTHING while the user could already fly a half-assembled
            // scene. Put the SHARED overlay up NOW (synchronously, before any await) and gate
            // input until the readiness chain completes.
            const activation = startViewActivationLoading('globe', () => {
                // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — the retry re-runs the globe activation;
                // contain any throw/rejection so a failing retry never escapes as an unhandled
                // rejection (which the ViewportCrashGuard does NOT catch → ejects the user to /projects).
                void containViewActivation(() => applyResultView('3D'), (m) => activeViewActivation?.fail(m), 'The 3D globe failed to open');
            });
            // Show the Cesium globe with the site context and frame the plot.
            // §FIX-GISLAYOUT-…-GLOBE-REENTRY (L-193, Symptom B) — this orchestrator drives its
            // OWN placement below (restorePhotorealGlobeContent), so suppress the synchronous
            // re-activation-branch placement to avoid a double-place. toggleGIS runs the
            // re-activation branch SYNCHRONOUSLY, so the flag is only live for that tick.
            gisReactivationSelfPlaceSuppressed = true;
            try {
                toggleGIS(true);
            } catch (err) {
                // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — a SYNCHRONOUS throw from toggleGIS must NOT
                // escape this void-ed async call as an unhandled rejection. The ViewportCrashGuard only
                // swallows GPU/render-keyword unhandled errors; a Cesium/GIS activation error slips its
                // net and propagates to the router/global handler that navigates to /projects (or hard-
                // reloads) — ejecting the founder from the editor. Keep it IN-editor: surface L-313 retry.
                console.error('[gis] §FIX-GLOBE-CLICK-NAVIGATES-OUT globe toggleGIS threw — contained (in-editor retry):', err);
                activation.fail(`The 3D globe failed to open: ${String((err as Error)?.message ?? err)}`);
            } finally {
                gisReactivationSelfPlaceSuppressed = false;
            }
            // toggleGIS mounts Cesium async on first use. L-270 — await the viewer's REAL ready
            // signal (awaitCesiumReady) instead of the old fixed 350 ms guess, which on a cold
            // mount fired BEFORE the viewport existed → renderBuildingOnGlobe no-oped and the
            // globe opened empty. On FIRST mount the re-activation branch does NOT run, so this
            // is the sole placement path there; on a re-entry the branch was suppressed above.
            void awaitCesiumReady()
                .then(() => {
                    restorePhotorealGlobeContent();
                    // The ground clamp is now armed → it is safe to await whenGroundSettled().
                    activation.contentIssued();
                })
                .catch((err: unknown) => {
                    activation.fail(`The 3D globe failed to open: ${String((err as Error)?.message ?? err)}`);
                });
        } else {
            // O.7.2.b — '2D' now means the BIM DUAL-PANE (LEFT 3D · RIGHT plan), the
            // founder-specified post-generate landing, not the Cesium globe.
            await applyBimDualPane();
        }
        refreshResultButtons();
    };

    /**
     * §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — build the ONE segmented view-mode bar
     * (◧ 3D + plan · ◉ 3D globe · ◉ 3D Site + the globe sub-controls). IDEMPOTENT:
     * a no-op when the bar already exists, so it can be called from EVERY entry path
     * (onboarding generate, the always-on "3D Site / Globe" launcher, the GIS rail)
     * without duplicating or replacing the bar. It only builds DOM — it does NOT pick
     * a landing view (callers drive that via applyResultView / mountFormaViewToggle).
     */
    const mountResultToggleBar = (): void => {
        if (resultToggle) return; // the single bar is already mounted.
        const viewport = document.getElementById('container');
        if (!viewport) {
            console.error('[gis] mountResultToggleBar: #container not found');
            return;
        }
        if (viewport.style.position !== 'absolute' && viewport.style.position !== 'relative') {
            viewport.style.position = 'relative';
        }
        // (Re)build the floating control so it sits ABOVE the Cesium overlay (z 20).
        removeResultToggle();
        const bar = document.createElement('div');
        bar.className = 'pryzm-result-toggle';
        bar.setAttribute('data-testid', 'gis-result-view-toggle');
        Object.assign(bar.style, {
            // §A.10.h (founder) — CENTRED over the 3D view (was left:12px, clipped
            // behind the left icon rail / "not visible"). Absolute within the
            // position:relative viewport + left:50% + translateX(-50%) → the bar
            // stays centred and DYNAMICALLY adapts when the viewport width changes
            // (e.g. a side panel resizes the 3D view). Sits just below the top
            // save/Author/Inspect/Data toolbar.
            position: 'absolute', top: '64px', left: '50%', transform: 'translateX(-50%)',
            zIndex: '30', display: 'flex', gap: '4px', padding: '4px',
            background: '#ffffff', borderRadius: '10px',
            boxShadow: '0 4px 18px rgba(20,10,60,0.18)', border: '1px solid #ece7fb',
            font: '600 12px/1 system-ui, sans-serif',
            whiteSpace: 'nowrap',
        } satisfies Partial<CSSStyleDeclaration>);

        const mkBtn = (mode: '2D' | '3D', label: string): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pryzm-result-toggle-btn';
            b.setAttribute('data-result-mode', mode);
            b.textContent = label;
            Object.assign(b.style, {
                appearance: 'none', border: 'none', cursor: 'pointer',
                padding: '7px 14px', borderRadius: '7px', color: '#6600FF',
                background: 'transparent', font: 'inherit',
            } satisfies Partial<CSSStyleDeclaration>);
            b.addEventListener('mouseenter', () => { if (activeSegment !== mode) b.style.background = '#f4f0ff'; });
            b.addEventListener('mouseleave', () => { if (activeSegment !== mode) b.style.background = 'transparent'; });
            // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — the "3D globe" segment click. Contain any
            // throw/rejection so a globe-activation failure surfaces the in-editor retry overlay and
            // NEVER escapes as an unhandled rejection to the crash-guard-blind router navigate-out.
            b.addEventListener('click', () => {
                void containViewActivation(() => applyResultView(mode), (m) => activeViewActivation?.fail(m), 'The 3D view failed to open');
            });
            return b;
        };
        btn2dRef = mkBtn('2D', '◧ 3D + plan');
        btn3dRef = mkBtn('3D', '◉ 3D globe');
        bar.appendChild(btn2dRef);
        bar.appendChild(btn3dRef);

        // FORMA.3 — a third, prominent entry to the Cesium "massing study" view,
        // right where the founder lands after Generate. Distinct from the BIM
        // "3D + plan" dual-pane and the photoreal "3D globe": this mounts the
        // [2D Map][Plan][3D] Forma toggle and lands on the Forma PLAN-oblique
        // (the Forma signature look — white shadowed massing, near-top-down).
        const formaBtn = document.createElement('button');
        formaBtn.type = 'button';
        formaBtn.className = 'pryzm-result-toggle-btn';
        formaBtn.setAttribute('data-result-mode', 'forma');
        formaBtn.setAttribute('data-testid', 'gis-result-forma');
        formaBtn.textContent = '◉ 3D Site';
        formaBtn.title = 'Open the Cesium massing study — white extruded buildings on your real-world plot';
        Object.assign(formaBtn.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 14px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
        } satisfies Partial<CSSStyleDeclaration>);
        formaBtn.addEventListener('mouseenter', () => { if (activeSegment !== 'forma') formaBtn.style.background = '#f4f0ff'; });
        formaBtn.addEventListener('mouseleave', () => { if (activeSegment !== 'forma') formaBtn.style.background = 'transparent'; });
        formaBtn.addEventListener('click', () => {
            console.log('[gis][forma] result-toggle: launching Forma "3D Site" view (Plan-oblique default).');
            // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — mountFormaViewToggle sets
            // activeSegment='forma' + repaints, so this segment lights up and the
            // Forma sub-bar mounts BELOW (never replacing) this segmented switch.
            mountFormaViewToggle('plan');
        });
        bar.appendChild(formaBtn);
        formaBtnRef = formaBtn;

        // §GLOBE-FIDELITY — [ ◉ Real ] [ ▢ Massing ] for the photoreal "3D globe".
        // Mirrors the Forma view's fidelity toggle (same labels, same #6600FF brand,
        // same active-paint). Wrapped in a group that is shown ONLY while the 3D globe
        // is the active result view (refreshResultButtons toggles its display) — the
        // BIM dual-pane (2D) has no globe to switch. Defaults to 'real' (today's
        // behaviour); 'massing' shows the abstract blocks on the tiles instead.
        const fidelityWrap = document.createElement('span');
        Object.assign(fidelityWrap.style, {
            display: resultViewMode === '3D' ? 'flex' : 'none',
            gap: '4px', alignItems: 'center', borderLeft: '1px solid #ece7fb',
            paddingLeft: '4px', marginLeft: '2px',
        } satisfies Partial<CSSStyleDeclaration>);
        const mkGlobeFidelityBtn = (
            fidelity: 'real' | 'massing',
            label: string,
            title: string,
        ): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pryzm-globe-fidelity-btn';
            b.setAttribute('data-globe-fidelity', fidelity);
            b.setAttribute('data-testid', `globe-fidelity-${fidelity}`);
            b.textContent = label;
            b.title = title;
            Object.assign(b.style, {
                appearance: 'none', border: 'none', cursor: 'pointer',
                padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
                background: 'transparent', font: 'inherit',
            } satisfies Partial<CSSStyleDeclaration>);
            b.addEventListener('mouseenter', () => { if (globeBuildingFidelity !== fidelity) b.style.background = '#f4f0ff'; });
            b.addEventListener('mouseleave', () => { refreshGlobeFidelityButtons(); });
            b.addEventListener('click', () => { setGlobeBuildingFidelity(fidelity); });
            return b;
        };
        const globeRealBtn = mkGlobeFidelityBtn('real', '◉ Real', 'Show the real PRYZM building on the globe (full elements: windows · doors · roof · furniture)');
        const globeMassingBtn = mkGlobeFidelityBtn('massing', '▢ Massing', 'Show the abstract massing study (white/pastel volumes) on the globe tiles');
        refreshGlobeFidelityButtons = (): void => {
            for (const [b, f] of [[globeRealBtn, 'real'], [globeMassingBtn, 'massing']] as const) {
                const on = globeBuildingFidelity === f;
                b.style.background = on ? '#6600FF' : 'transparent';
                b.style.color = on ? '#ffffff' : '#6600FF';
            }
        };
        refreshGlobeFidelityButtons();
        fidelityWrap.appendChild(globeRealBtn);
        fidelityWrap.appendChild(globeMassingBtn);
        bar.appendChild(fidelityWrap);
        globeFidelityWrap = fidelityWrap;

        // §GLOBE-ZOOM-DEFAULT — "Zoom to Site" on the 3D-globe result bar. Reframes
        // the Cesium camera to the PLACED BUILDING (flyToFormaSite via reframeSiteIn3D)
        // — the same building-anchored framing the Forma toggle's Zoom button uses.
        // Shown only while the 3D globe is the active result view (refreshResultButtons
        // toggles display). Brand-styled (white + #6600FF, no black) like the rest.
        const zoomToSiteBtn = document.createElement('button');
        zoomToSiteBtn.type = 'button';
        zoomToSiteBtn.className = 'pryzm-globe-zoom-btn';
        zoomToSiteBtn.setAttribute('data-testid', 'globe-zoom-to-site');
        zoomToSiteBtn.title = 'Zoom to site — reframe the camera to the placed building on the globe';
        zoomToSiteBtn.textContent = '⤢ Zoom to Site';
        Object.assign(zoomToSiteBtn.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
            display: resultViewMode === '3D' ? 'inline-block' : 'none',
        } satisfies Partial<CSSStyleDeclaration>);
        zoomToSiteBtn.addEventListener('mouseenter', () => { zoomToSiteBtn.style.background = '#f4f0ff'; });
        zoomToSiteBtn.addEventListener('mouseleave', () => { zoomToSiteBtn.style.background = 'transparent'; });
        zoomToSiteBtn.addEventListener('click', () => { void reframeSiteIn3D(); });
        bar.appendChild(zoomToSiteBtn);
        globeZoomBtn = zoomToSiteBtn;

        // §FLY-TOUR (founder, 2026-06-17) — "▶ Fly tour" cinematic flythrough.
        // Runs CesiumViewport.flyTour() (overview → approach → close-up → pull-back
        // around the placed building). Brand-styled (white + #6600FF, no black);
        // disabled until a building is placed + while a tour is mid-flight.
        const tourBtn = document.createElement('button');
        tourBtn.type = 'button';
        tourBtn.className = 'pryzm-globe-tour-btn';
        tourBtn.setAttribute('data-testid', 'globe-fly-tour');
        tourBtn.title = 'Fly tour — cinematic flythrough around the placed building';
        tourBtn.textContent = '▶ Fly tour';
        Object.assign(tourBtn.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
            display: resultViewMode === '3D' ? 'inline-block' : 'none',
        } satisfies Partial<CSSStyleDeclaration>);
        tourBtn.addEventListener('mouseenter', () => { if (!tourBtn.disabled) tourBtn.style.background = '#f4f0ff'; });
        tourBtn.addEventListener('mouseleave', () => { tourBtn.style.background = 'transparent'; });
        tourBtn.addEventListener('click', () => {
            if (tourBtn.disabled) return;
            const vp = cesiumViewport;
            if (!vp?.flyTour || !(vp.hasFormaMassingPlaced?.() ?? false)) {
                console.warn('[gis][forma] Fly tour: no building placed — ignored.');
                return;
            }
            if (vp.isFlyTourRunning?.()) return; // re-entrancy guard (viewport also guards)
            console.log('[gis][forma] Fly tour: launching cinematic flythrough.');
            void Promise.resolve(vp.flyTour()).finally(() => { refreshResultButtons(); });
            refreshResultButtons();
        });
        bar.appendChild(tourBtn);
        globeTourBtn = tourBtn;

        viewport.appendChild(bar);
        resultToggle = bar;
        refreshResultButtons(); // paint the current activeSegment on the fresh bar.
        console.log('[gis] mountResultToggleBar: segmented view-mode switch mounted.');
    };

    // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — guarantee the ONE segmented switch is
    // present. Called by every site/globe/forma entry so the top-level view switch is
    // ALWAYS visible (fixes the launcher path that used to open the Forma bar alone,
    // leaving the user unable to tell which view they were in or swap out of it).
    const ensureResultToggle = (): void => { mountResultToggleBar(); };

    /**
     * O.7.2 — mount the post-generate view switch + land on the chosen view. Called
     * by the onboarding generate-finish handoff (window.pryzmShowSiteResultView).
     * `initial` is the view to land on first ('2D' plan by default — the no-blank fix).
     */
    const showSiteResultView = (initial: '2D' | '3D' = '2D'): void => {
        // O.7.2.b — GENERATE-TIME teardown of the cream 2D plan map. After the
        // boundary commit the map stayed alive (so the confirm step rendered over a
        // live plan map); this is the ONLY place it is disposed — reached exclusively
        // via the onboarding "Generate" action's pryzmShowSiteResultView() handoff.
        closeBoundaryMap2D();
        mountResultToggleBar();
        console.log(`[gis] showSiteResultView: landing on "${initial}".`);
        // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — onboarding "Generate" landing; contain any
        // activation failure so it surfaces in-editor retry rather than ejecting the user to /projects.
        void containViewActivation(() => applyResultView(initial), (m) => activeViewActivation?.fail(m), 'The 3D view failed to open');
    };

    // O.7.2 — window-hook handoff for the onboarding generate-finish step (same idiom
    // as pryzmToggleGIS / pryzmStartBoundaryDraw). OnboardingStepController calls this
    // INSTEAD of force-activating the BIM 3D view over an orphaned Cesium overlay.
    window.pryzmShowSiteResultView = (initial?: '2D' | '3D') => showSiteResultView(initial ?? '2D');
    window.pryzmHideSiteResultToggle = () => removeResultToggle();
    // O.7.2.b — explicit generate-time teardown of the cream 2D plan map. The
    // onboarding "Generate" handler may call this directly; showSiteResultView()
    // also calls closeBoundaryMap2D() so the map is gone before the result view
    // mounts. Idempotent + double-dispose safe.
    window.pryzmCloseBoundaryMap2D = () => closeBoundaryMap2D();
    // §L-384 — RE-DRAW hook: the onboarding "← Back to drawing" action clears the
    // committed (immutable) boundary + re-arms the live 2D map for a fresh draw.
    window.pryzmRearmBoundaryDraw = () => rearmBoundaryDraw();

    // O.2 — onboarding step-controller GIS-activation handoff. The guided
    // first-run flow (OnboardingStepController) has no clean runtime hook to
    // toggle GIS, so expose the SAME window-hook idiom A.8.c established for
    // pryzmStartBoundaryDraw. Registered here (not inside the async Cesium mount)
    // so it works BEFORE Cesium has mounted — calling it kicks off the mount.
    window.pryzmToggleGIS = (active: boolean) => toggleGIS(active);

    // O.2 (zoom-to-address defect) — let the onboarding location step seed the SAME
    // `lastGeocodeFrame` the GIS-rail search box populates via onFlyTo. The
    // onboarding flow geocodes through its OWN path (OnboardingStepController.
    // handleGeocode), so without this the bbox is lost and getMapInitial() can only
    // return a coarse point — the 2D map opened at a flat point/world zoom and the
    // user had to zoom manually. Calling this BEFORE pryzmStartBoundaryDraw() makes
    // getMapInitial() carry the bbox → SiteBoundaryMap2D fitBounds to the plot.
    window.pryzmSetGeocodeFrame = (frame) => {
        if (!frame || !Number.isFinite(frame.lat) || !Number.isFinite(frame.lon)) {
            console.warn('[gis] pryzmSetGeocodeFrame: ignoring invalid frame', frame);
            return;
        }
        lastGeocodeFrame = { lat: frame.lat, lon: frame.lon, bbox: frame.bbox };
        console.log('[gis] pryzmSetGeocodeFrame: geocode frame set for 2D map fitBounds →', lastGeocodeFrame);
    };

    // A.8.c.f — register the 2D Hektar boundary-draw console hook HERE (not inside
    // the Cesium mount) so the 2D draw surface is independent of the Cesium viewer:
    // the user can draw a parcel on the clean cream plan-view map without first
    // mounting the 3D globe. (Re-registered inside the mount too, harmlessly.)
    window.pryzmStartBoundaryDraw = () => startBoundaryDraw();
    window.pryzmCancelBoundaryDraw = () => cancelBoundaryDraw();
    // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-70) — open the 2D map in OVERLAY-ONLY mode (draw
    // disarmed) for the PDF/image import path. The onboarding overlay branch calls this
    // instead of pryzmStartBoundaryDraw so no boundary can be traced + no generate is armed.
    window.pryzmStartSitePlanOverlayImport = () => startBoundaryDraw({ overlayOnly: true });
    // §FIX-SITE-OVERLAY-ENTER-CANVAS (L-78) — land the user in a BIM editor view (activateView
    // EXITS GIS first, then routes through ViewController) so the site-plan underlay they just
    // imported is actually on screen. The overlay-import "✓ Finish" calls this with 'Top' (plan
    // view). Returns the activateView promise so the caller can await the GIS-exit + switch,
    // then zoom-to-fit onto the underlay.
    window.pryzmActivateBimView = (mode) =>
        activateView((mode ?? 'Top') as 'Top' | '3D' | 'Front' | 'Back' | 'Left' | 'Right');

    // ════════════════════════════════════════════════════════════════════════
    // FORMA.3 — 3D Forma massing view + [Plan View][3D View] toggle (SPEC §3–§5)
    // ════════════════════════════════════════════════════════════════════════
    //
    // READ SOURCE (SPEC §4, NON-GOALS §8.2/§8.4 — read-only consumer):
    //   • Parcel boundary  ← runtime.siteModelStore.getParcelBoundary().polygon
    //                        (already scene-XZ metres, the SAME frame the
    //                        ParcelBoundarySceneRenderer + apartment generator use).
    //   • Authored massing ← storeRegistry.getStoreForType('wall').getAll()
    //                        each wall's baseLine (scene-XZ) + height + thickness.
    //   • ENU origin       ← siteModelStore.getLocation() lat/lon (the scene origin).
    //
    // The Cesium-side ENU bridge (eastNorthUpToFixedFrame at the site origin) +
    // the white extrusions + the NW oblique flyTo all live in CesiumViewport
    // (FORMA.3 methods). This layer only READS PRYZM domain state and forwards it.

    type XZ = { x: number; z: number };

    /** Read the site geographic origin (= the scene-XZ ENU anchor). null when 0,0.
     *
     * §FORMA-ORIGIN-IS-SCENE-FRAME (2026-06-05) — the parcel boundary AND the
     * authored walls are projected in the LTP-ENU frame: `boundaryProjection`
     * bakes the boundary XZ relative to the LTP origin, which the boundary commit
     * pins to the FIRST DRAWN VERTEX (`siteDispatch.setLtpOriginIfSafe` →
     * "LTPENURebase.setOrigin … from first vertex"). The Forma ENU frame MUST be
     * anchored at that SAME origin, or the boundary + massing render OFFSET from
     * where the user drew them (the founder-reported "placed slightly in a
     * different location"). `getCurrentSiteOrigin()` IS that scene-frame origin;
     * `siteModelStore.getLocation()` is the geocoded ADDRESS — a DIFFERENT point
     * once a boundary is committed (~10-15 m away). So resolve the LTP origin
     * FIRST and use the address only as a pre-boundary fallback. */
    const getFormaOrigin = (): { lat: number; lon: number } | null => {
        const ltp = getCurrentSiteOrigin();
        if (ltp && (ltp.lat !== 0 || ltp.lon !== 0)) {
            return { lat: ltp.lat, lon: ltp.lon };
        }
        // Pre-boundary fallback: no LTP origin set yet → the site location (address)
        // and the scene frame still coincide, so either is correct.
        const loc = (runtime?.siteModelStore as
            | { getLocation?: () => { latitude: number; longitude: number } | null }
            | undefined)?.getLocation?.();
        if (loc && (loc.latitude !== 0 || loc.longitude !== 0)) {
            return { lat: loc.latitude, lon: loc.longitude };
        }
        if (lastGeocodeFrame) return { lat: lastGeocodeFrame.lat, lon: lastGeocodeFrame.lon };
        return null;
    };

    /** Read the committed parcel boundary ring (scene-XZ), or null.
     *
     * §L-412 Bug-2 (boundary→3D-render handoff) — resolve the C19 `SiteModelStore`
     * the SAME way the draw/select commit does (`resolveSiteContext`:
     * `runtime ?? window.runtime`). The boundary is committed through `siteDispatch`
     * against `window.runtime`'s store whenever GISAreaLayout was handed a null/stale
     * `runtime` (the `createMainLayout(props, runtime=null)` legacy boot path,
     * Layout.ts:86/92). Reading ONLY the captured `runtime` here diverged from the
     * store the boundary actually landed in: the ORIGIN and ENVELOPE survived (they
     * read the `siteDispatch` module globals `getCurrentSiteOrigin` /
     * `getLastBuildableEnvelope`, populated on the same commit), but the boundary —
     * read straight off `runtime.siteModelStore` — came back null, so the 3D Site
     * logged "no parcel boundary yet" even though the plot committed and the envelope
     * computed. Resolving the store identically to the commit makes the ONE committed
     * boundary (drawn OR selected) reach the Forma render — same C19 spine, no second
     * store. */
    const getFormaBoundary = (): XZ[] | null => {
        type BoundaryStore = { getParcelBoundary?: () => { polygon?: ReadonlyArray<XZ> } | null };
        const captured = runtime?.siteModelStore as BoundaryStore | undefined;
        const store: BoundaryStore | undefined =
            (captured?.getParcelBoundary ? captured : undefined) ??
            (typeof window !== 'undefined'
                ? (window.runtime as unknown as { siteModelStore?: BoundaryStore } | undefined)?.siteModelStore
                : undefined);
        const b = store?.getParcelBoundary?.();
        const poly = b?.polygon;
        return poly && poly.length >= 3 ? poly.map((p) => ({ x: p.x, z: p.z })) : null;
    };

    /**
     * §A.21.D24 — read authored walls (the massing) from the wall store:
     * baseLine + h + t + the STOREY BASE ELEVATION.
     *
     * Per `packages/schemas/src/elements/Wall.ts`, a wall's `baseLine` is a pair
     * of Vec3 whose `y` carries the LEVEL ELEVATION (the §WALL-AUDIT-2026-M7
     * convention), and `baseOffset` is an extra vertical offset from the level
     * base. The earlier reader dropped `y`/`baseOffset` entirely → every storey
     * collapsed onto the ground and renderFormaMassing only ever showed one
     * ground-floor block. We now carry `baseElevation = baseLine[0].y +
     * baseOffset` (+ `levelId` for grouping) so the Cesium overlay can STACK each
     * storey at its true elevation. Single-storey / apartment models have y=0 on
     * every wall, so this is a no-op for them.
     */
    const getFormaWalls = (): Array<{
        a: XZ;
        b: XZ;
        height: number;
        thickness: number;
        baseElevation: number;
        levelId?: string;
        materialColor?: string;
    }> => {
        type WallRecord = {
            baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
            height?: number;
            thickness?: number;
            baseOffset?: number;
            levelId?: string;
            // §A.21.D-GLOBE3 — the SAME per-wall finish hex the three.js BIM scene
            // renders (WallFragmentBuilder: `wall.materialColor ?? '#d4c5b0'`), so the
            // house on the photoreal globe reads in its real app-scene colours.
            materialColor?: string;
        };
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as
            | { getAll?: () => WallRecord[] }
            | undefined;
        const all = wallStore?.getAll?.() ?? [];
        const out: Array<{
            a: XZ;
            b: XZ;
            height: number;
            thickness: number;
            baseElevation: number;
            levelId?: string;
            materialColor?: string;
        }> = [];
        for (const w of all) {
            const bl = w.baseLine;
            if (!bl || bl.length < 2 || !bl[0] || !bl[1]) continue;
            const yElev = typeof bl[0].y === 'number' && Number.isFinite(bl[0].y) ? bl[0].y : 0;
            const baseOffset =
                typeof w.baseOffset === 'number' && Number.isFinite(w.baseOffset) ? w.baseOffset : 0;
            out.push({
                a: { x: bl[0].x, z: bl[0].z },
                b: { x: bl[1].x, z: bl[1].z },
                height: typeof w.height === 'number' && w.height > 0 ? w.height : 2.5,
                thickness: typeof w.thickness === 'number' && w.thickness > 0 ? w.thickness : 0.1,
                baseElevation: yElev + baseOffset,
                levelId: typeof w.levelId === 'string' && w.levelId ? w.levelId : undefined,
                materialColor:
                    typeof w.materialColor === 'string' && w.materialColor ? w.materialColor : undefined,
            });
        }
        return out;
    };

    // ════════════════════════════════════════════════════════════════════════
    // §A.21.D25 — read the building's OTHER elements so the Forma globe view is
    // not WALLS-ONLY. Slabs/floors + the roof give the building its solidity and
    // a closed top (it reads as a real building, not floating wall blocks).
    // Furniture is an OPTIONAL coarse representation, hard-capped so it never
    // adds thousands of Cesium entities (perf). All three are READ-ONLY pulls
    // from the element stores (same idiom as getFormaWalls) and feed the SAME
    // massing path (footprint + elevation + height per band). Each reader is
    // tolerant of an absent store / empty model → returns [] (single-storey +
    // apartment models without slabs/roof simply contribute nothing extra).
    // ════════════════════════════════════════════════════════════════════════

    /**
     * §A.21.D25 — build a `levelId → baseElevation` map from the (working) wall
     * reader. The runtime slab/roof records do NOT carry their world elevation
     * (slab `position.y` is always 0 — world Y is resolved at projection time
     * from the level; roof elevation lives on the level too), so we borrow the
     * per-storey elevation the walls already resolve correctly. This is exactly
     * the elevation the wall massing stacks each storey at, so slabs/roofs line
     * up with their storey.
     *
     * §ROOF-FORMA (2026-06-09) — the house generator now mints a DEDICATED "Roof"
     * level ABOVE the top storey (§ROOF-LEVEL in HouseLayoutExecutor) and creates
     * the roof there with `baseOffset: 0`; the level's OWN `elevation` already
     * encodes the top-storey wall head. That roof level has NO WALLS, so the
     * walls-only map never contained it → the roof resolved to elevation 0 and
     * rendered buried at ground level (the founder's "roof disappeared from the
     * FORMA view"). FIX: SEED the map from the authoritative level store
     * (`bimManager.getLevels()`, elevation in metres — same unit + convention the
     * walls resolve to, see AddLevelCommand) so EVERY level — wall-less roof
     * levels included — has its true world elevation. Walls then OVERRIDE per
     * level (they take precedence, preserving the prior storey behaviour exactly
     * for levels that DO have walls). Levels still unknown fall back to ground (0).
     */
    const levelElevationFromWalls = (): Map<string, number> => {
        const map = new Map<string, number>();
        // Seed from the level store first (covers wall-less levels like the roof
        // level); units are metres, the same as the wall-derived elevations below.
        try {
            const levels: Array<{ id?: string; elevation?: number }> =
                (window.bimManager as { getLevels?: () => Array<{ id?: string; elevation?: number }> } | undefined)
                    ?.getLevels?.() ?? [];
            for (const l of levels) {
                if (typeof l.id === 'string' && l.id && typeof l.elevation === 'number' && Number.isFinite(l.elevation)) {
                    map.set(l.id, l.elevation);
                }
            }
        } catch { /* no level store yet → walls-only, prior behaviour */ }
        // Walls take precedence (unchanged behaviour for wall-bearing storeys).
        for (const w of getFormaWalls()) {
            if (w.levelId) map.set(w.levelId, w.baseElevation);
        }
        return map;
    };

    /**
     * §A.21.D25 (FIX A.21.D28#1) — read authored floor SLABS from the slab store.
     *
     * ROOT CAUSE of "0 slab(s)": the earlier reader looked for `s.boundary` as a
     * Vec3[] of {x, y, z} with y carrying the elevation — a shape NO slab store
     * actually uses → every slab was skipped. There are two slab record shapes in
     * play and this reader handles BOTH (whichever store is registered as 'slab'):
     *   • legacy `SlabData` (packages/geometry-slab/src/SlabTypes.ts): outer ring
     *     in `polygon: {x, y}[]` (2D, y === world Z); world elevation NOT on the
     *     record (`position.y` is always 0, resolved from the level at projection).
     *   • C11 plugin `SlabData` (= Zod Slab schema): outer ring in
     *     `boundary: {x, y, z}[]` where (per CreateSlab) x === worldX, y === worldZ,
     *     z === 0 — so the plan mapping is identical (second coord → scene Z).
     * In both cases the plan ring's two coords map to scene-XZ as {x, z: secondCoord}
     * and the storey elevation is resolved from the level (via the working walls)
     * plus the slab's `baseOffset` + `thickness`.
     */
    const getFormaSlabs = (): Array<{
        ring: XZ[];
        topElevation: number;
        thickness: number;
        levelId?: string;
        materialColor?: string;
    }> => {
        type SlabRecord = {
            // legacy SlabData: outer ring is `polygon` of 2D {x,y} where y === world Z.
            polygon?: ReadonlyArray<{ x: number; y: number }>;
            // C11 SlabData (Zod Slab): outer ring is `boundary` of {x,y,z} where y === world Z.
            boundary?: ReadonlyArray<{ x: number; y: number; z?: number }>;
            thickness?: number;
            baseOffset?: number;
            levelId?: string;
            // §A.21.D-GLOBE3 — the SAME slab finish the three.js BIM scene renders
            // (SlabFragmentBuilder: `data.materialColor || '#808080'`).
            materialColor?: string;
        };
        const slabStore = storeRegistry.getStoreForType('slab') as unknown as
            | { getAll?: () => SlabRecord[] }
            | undefined;
        const all = slabStore?.getAll?.() ?? [];
        const levelElev = levelElevationFromWalls();
        const out: Array<{ ring: XZ[]; topElevation: number; thickness: number; levelId?: string; materialColor?: string }> = [];
        for (const s of all) {
            // Accept legacy `polygon` or C11 `boundary`; both carry the plan ring
            // as {x, y} pairs where the SECOND coordinate is world Z.
            const poly = s.polygon ?? s.boundary;
            if (!poly || poly.length < 3) continue;
            const baseElev =
                typeof s.levelId === 'string' && levelElev.has(s.levelId) ? levelElev.get(s.levelId)! : 0;
            const baseOffset =
                typeof s.baseOffset === 'number' && Number.isFinite(s.baseOffset) ? s.baseOffset : 0;
            out.push({
                // Plan ring {x, y} → scene-XZ is {x, z: y}.
                ring: poly.map((p) => ({ x: p.x, z: p.y })),
                topElevation: baseElev + baseOffset,
                thickness: typeof s.thickness === 'number' && s.thickness > 0 ? s.thickness : 0.2,
                levelId: typeof s.levelId === 'string' && s.levelId ? s.levelId : undefined,
                materialColor:
                    typeof s.materialColor === 'string' && s.materialColor ? s.materialColor : undefined,
            });
        }
        return out;
    };

    /**
     * §A.21.D25 (FIX A.21.D28#1) — read authored ROOFS from the roof store.
     *
     * ROOT CAUSE of "0 roof(s)": the earlier reader looked for `r.boundary` (Vec3[]
     * with y = elevation) + `r.pitch` (radians). The registered runtime store holds
     * the legacy `RoofData` (packages/geometry-roof/src/RoofTypes.ts), which has
     * NEITHER — it carries the plan footprint in `footprint.polygon` as
     * `[number, number][]` (each `[x, z]`), the eave elevation in `baseOffset`, and
     * the slope as `slope` = rise/run (NOT radians) → every roof was skipped.
     * This reader handles BOTH shapes (whichever store is registered as 'roof'):
     *   • legacy RoofData: `footprint.polygon` ([x,z] pairs) + `slope` + `baseOffset`.
     *   • C11 plugin / Zod Roof schema: `boundary` (Vec3 {x,y,z}; plan = x,z) + `pitch`.
     */
    const getFormaRoofs = (): Array<{
        ring: XZ[];
        baseElevation: number;
        thickness: number;
        pitch: number;
        levelId?: string;
        materialColor?: string;
    }> => {
        type RoofRecord = {
            // legacy RoofData: plan footprint ring as [x, z] pairs. CRITICAL — per
            // RoofTool._normalisePolygon + HouseLayoutExecutor._createRoof, `polygon`
            // is CENTROID-LOCAL (each vertex relative to `centroid`) and `centroid`
            // carries the WORLD anchor. The RoofFragmentBuilder reconstructs the
            // world ring as centroid + local.
            footprint?: {
                polygon?: ReadonlyArray<readonly [number, number]>;
                centroid?: readonly [number, number];
            };
            // C11 RoofData (Zod Roof): plan ring as Vec3 {x,y,z}; plan coords are x,z.
            boundary?: ReadonlyArray<{ x: number; y?: number; z: number }>;
            thickness?: number;
            slope?: number;      // legacy: rise/run ratio (NOT radians)
            pitch?: number;      // C11: radians
            baseOffset?: number; // legacy: eave elevation relative to the level
            levelId?: string;
            // §A.21.D-GLOBE3 — the SAME roof finish the three.js BIM scene renders
            // (RoofFragmentBuilder: `data.materialColor || '#c8a46e'`).
            materialColor?: string;
        };
        const roofStore = storeRegistry.getStoreForType('roof') as unknown as
            | { getAll?: () => RoofRecord[] }
            | undefined;
        const all = roofStore?.getAll?.() ?? [];
        const levelElev = levelElevationFromWalls();
        const out: Array<{ ring: XZ[]; baseElevation: number; thickness: number; pitch: number; levelId?: string; materialColor?: string }> = [];
        for (const r of all) {
            // §A.21.D33(e) — ROOF FOOTPRINT ROOT CAUSE + FIX. The earlier reader read
            // the legacy `footprint.polygon` directly as if it were WORLD-XZ. It is
            // not: it is CENTROID-LOCAL (vertices relative to `footprint.centroid`,
            // the world anchor). Dropping the centroid rendered the roof centred on
            // the scene origin (0,0) — offset from the building by (cx, cz) and
            // reading as a small floating shape next to the house. We now ADD the
            // world centroid back, so world vertex = centroid + local (exactly what
            // the BIM RoofFragmentBuilder does). The C11 `boundary` Vec3 ring is
            // already world-XZ → no centroid offset for that branch.
            const fp = r.footprint;
            const centroid = fp?.centroid;
            const cx = Array.isArray(centroid) && typeof centroid[0] === 'number' ? centroid[0] : 0;
            const cz = Array.isArray(centroid) && typeof centroid[1] === 'number' ? centroid[1] : 0;
            const ring: XZ[] | null = fp?.polygon && fp.polygon.length >= 3
                ? fp.polygon.map((p) => ({ x: p[0] + cx, z: p[1] + cz }))
                : r.boundary && r.boundary.length >= 3
                    ? r.boundary.map((p) => ({ x: p.x, z: p.z }))
                    : null;
            if (!ring) continue;
            const baseElev =
                typeof r.levelId === 'string' && levelElev.has(r.levelId) ? levelElev.get(r.levelId)! : 0;
            // §ROOF-FORMA (2026-06-09) — roof inclusion decision. The roof now
            // lives on its own wall-less "Roof" level (§ROOF-LEVEL); its elevation
            // is resolved from the level store (seeded into levelElev above), NOT
            // from walls. Log whether the level resolved so a buried-roof
            // regression is diagnosable from the console.
            console.log(
                `[gis][forma] §ROOF-FORMA include roof: levelId=${r.levelId ?? '(none)'} ` +
                `resolved=${typeof r.levelId === 'string' && levelElev.has(r.levelId)} ` +
                `levelElev=${baseElev}m`,
            );
            const baseOffset =
                typeof r.baseOffset === 'number' && Number.isFinite(r.baseOffset) ? r.baseOffset : 0;
            // pitch radians: prefer the C11 `pitch`; else convert legacy `slope` (rise/run).
            const slope = typeof r.slope === 'number' && Number.isFinite(r.slope) && r.slope > 0 ? r.slope : 0;
            const pitch = typeof r.pitch === 'number' && Number.isFinite(r.pitch) && r.pitch > 0
                ? r.pitch
                : slope > 0 ? Math.atan(slope) : 0;
            out.push({
                ring,
                baseElevation: baseElev + baseOffset,
                thickness: typeof r.thickness === 'number' && r.thickness > 0 ? r.thickness : 0.2,
                pitch,
                levelId: typeof r.levelId === 'string' && r.levelId ? r.levelId : undefined,
                materialColor:
                    typeof r.materialColor === 'string' && r.materialColor ? r.materialColor : undefined,
            });
        }
        return out;
    };

    /**
     * §A.21.D25 (FIX A.21.D28#1) — read authored FURNITURE as a COARSE
     * representation (small boxes at each item's origin). OPTIONAL + HARD-CAPPED
     * (FORMA_FURNITURE_CAP) so a heavily-furnished model never floods the globe
     * with thousands of Cesium entities (perf). Each item carries its origin
     * (scene-XZ from `position`), a base elevation (levelElevation + baseOffset,
     * falling back to position.y), a coarse footprint (width × length), height,
     * and heading (rotation.y). At the massing scale furniture is a minor read.
     */
    const FORMA_FURNITURE_CAP = 400;
    const getFormaFurniture = (): Array<{
        origin: XZ;
        baseElevation: number;
        width: number;
        depth: number;
        height: number;
        rotation: number;
    }> => {
        // Runtime FurnitureData (packages/geometry-furniture/src/FurnitureTypes.ts):
        //   • position : Point3D  {x,y,z}  (scene-XZ origin; y = world Y when set)
        //   • rotation : EulerDTO {x,y,z}  (y = heading about the up axis)
        //   • width / length / height (metres) — NOT a `size` bbox
        //   • levelElevation + baseOffset — the world base elevation
        // ROOT CAUSE of "0 furniture": the earlier reader looked for `f.origin`,
        // `f.size`, `f.scale` and a numeric `f.rotation` — none of which exist on
        // FurnitureData → every item was skipped.
        type FurnitureRecord = {
            position?: { x: number; y?: number; z: number };
            rotation?: { x?: number; y?: number; z?: number };
            width?: number;
            length?: number;
            height?: number;
            levelElevation?: number;
            baseOffset?: number;
        };
        // §A.21.D33(e) — read the legacy FurnitureStore (the canonical read the
        // ProjectSerializer / schedules / every plan-symbol builder use). It is the
        // store the §FT-FURNITURE bus→legacy bridge mirrors generated furniture into.
        // Resolve via the registry, then DEFENSIVELY fall back to window.furnitureStore
        // (same instance in normal boot, but this guards a registry-vs-window divergence
        // and an early call before registration). Whichever yields the most records wins.
        const regStore = storeRegistry.getStoreForType('furniture') as unknown as
            | { getAll?: () => FurnitureRecord[] }
            | undefined;
        const winStore = (window as unknown as { furnitureStore?: { getAll?: () => FurnitureRecord[] } }).furnitureStore;
        const regAll = regStore?.getAll?.() ?? [];
        const winAll = winStore?.getAll?.() ?? [];
        const all = winAll.length > regAll.length ? winAll : regAll;
        const out: Array<{ origin: XZ; baseElevation: number; width: number; depth: number; height: number; rotation: number }> = [];
        for (const f of all) {
            if (out.length >= FORMA_FURNITURE_CAP) break;
            const p = f.position;
            if (!p || typeof p.x !== 'number' || typeof p.z !== 'number') continue;
            const width = typeof f.width === 'number' && f.width > 0 ? f.width : 0.6;
            const depth = typeof f.length === 'number' && f.length > 0 ? f.length : 0.6;
            const height = typeof f.height === 'number' && f.height > 0 ? f.height : 0.7;
            // §A.21.D33(e) — MULTI-STOREY ELEVATION FIX. `position.y` is the
            // authoritative WORLD Y (the furnish pipeline + the §FT-FURNITURE bridge
            // both bake the storey elevation into it). The bridge ZEROES
            // `levelElevation` when mirroring, so the prior "levelElevation+baseOffset
            // first" path collapsed every upper-storey item onto the ground floor.
            // Prefer a finite, non-ground `position.y`; only fall back to the
            // level fields (then ground) when world Y is absent/zero.
            const worldY = typeof p.y === 'number' && Number.isFinite(p.y) ? p.y : undefined;
            const levelElev =
                typeof f.levelElevation === 'number' && Number.isFinite(f.levelElevation) ? f.levelElevation : undefined;
            const baseOffset =
                typeof f.baseOffset === 'number' && Number.isFinite(f.baseOffset) ? f.baseOffset : 0;
            const baseElevation =
                worldY !== undefined && Math.abs(worldY) > 1e-6
                    ? worldY
                    : levelElev !== undefined
                        ? levelElev + baseOffset
                        : worldY ?? 0;
            out.push({
                origin: { x: p.x, z: p.z },
                baseElevation,
                width,
                depth,
                height,
                // EulerDTO.y is the heading (rotation about the up axis).
                rotation: typeof f.rotation?.y === 'number' && Number.isFinite(f.rotation.y) ? f.rotation.y : 0,
            });
        }
        if (all.length > FORMA_FURNITURE_CAP) {
            console.log(`[gis][forma] furniture capped at ${FORMA_FURNITURE_CAP} of ${all.length} items (perf).`);
        }
        return out;
    };

    /**
     * §A.21.D34(d) — read WINDOW + DOOR openings as coarse massing insets.
     *
     * SOURCE: the openings are carried DIRECTLY on each wall record
     * (`Wall.openings[]` per packages/schemas/src/elements/Wall.ts +
     * geometry-wall WallTypes.Opening) — the SAME opening data the BIM uses to
     * cut the wall + host the door/window element. Reading them off the walls (not
     * the separate window/door stores) means the offset/width/height/sill are
     * already resolved against the wall they pierce, so we can place each inset on
     * the shell at its true world position with no store-join.
     *
     * Each opening is projected to a world-XZ inset RECTANGLE on the wall plane:
     *   • along the wall baseline:  start = offset, end = offset + width
     *   • the inset's centreline runs along the baseline at those two points
     *   • `sill` + `height` give the vertical band (baseElevation + sill →
     *     baseElevation + sill + height)
     *   • `normal` is the wall's unit normal (so the Cesium side can recess the
     *     panel slightly into the façade for a darker reveal).
     * Walls with no openings contribute nothing. Fully guarded — a bad opening or
     * degenerate wall is skipped, never thrown.
     */
    const getFormaOpenings = (): Array<{
        kind: 'window' | 'door';
        /** Opening start point on the wall baseline (scene-XZ). */
        a: XZ;
        /** Opening end point on the wall baseline (scene-XZ). */
        b: XZ;
        /** Unit wall normal (scene-XZ) — the recess direction. */
        normal: XZ;
        thickness: number;
        /** World base elevation of the wall (storey floor). */
        baseElevation: number;
        sill: number;
        height: number;
    }> => {
        type OpeningRecord = {
            type?: 'window' | 'door';
            offset?: number;
            width?: number;
            height?: number;
            sillHeight?: number;
        };
        type WallRecord = {
            baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
            thickness?: number;
            baseOffset?: number;
            openings?: ReadonlyArray<OpeningRecord>;
        };
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as
            | { getAll?: () => WallRecord[] }
            | undefined;
        const all = wallStore?.getAll?.() ?? [];
        const out: Array<{
            kind: 'window' | 'door';
            a: XZ;
            b: XZ;
            normal: XZ;
            thickness: number;
            baseElevation: number;
            sill: number;
            height: number;
        }> = [];
        for (const w of all) {
            try {
                const ops = w.openings;
                if (!ops || ops.length === 0) continue;
                const bl = w.baseLine;
                if (!bl || bl.length < 2 || !bl[0] || !bl[1]) continue;
                const ax = bl[0].x, az = bl[0].z;
                const bx = bl[1].x, bz = bl[1].z;
                const dx = bx - ax, dz = bz - az;
                const len = Math.hypot(dx, dz);
                if (len < 1e-3) continue;
                const ux = dx / len, uz = dz / len; // unit along the baseline
                // Wall normal (perpendicular in XZ).
                const nx = -uz, nz = ux;
                const yElev = typeof bl[0].y === 'number' && Number.isFinite(bl[0].y) ? bl[0].y : 0;
                const baseOffset =
                    typeof w.baseOffset === 'number' && Number.isFinite(w.baseOffset) ? w.baseOffset : 0;
                const thickness =
                    typeof w.thickness === 'number' && w.thickness > 0 ? w.thickness : 0.1;
                for (const o of ops) {
                    const kind = o.type === 'door' ? 'door' : 'window';
                    const offset = typeof o.offset === 'number' && o.offset >= 0 ? o.offset : 0;
                    const width = typeof o.width === 'number' && o.width > 0 ? o.width : 0.9;
                    // Clamp the opening span to the wall so we never read past the end.
                    const start = Math.min(offset, len);
                    const end = Math.min(offset + width, len);
                    if (end - start < 1e-3) continue;
                    const height = typeof o.height === 'number' && o.height > 0 ? o.height : 1.2;
                    const sill =
                        kind === 'door'
                            ? 0
                            : typeof o.sillHeight === 'number' && o.sillHeight >= 0
                                ? o.sillHeight
                                : 0.9;
                    out.push({
                        kind,
                        a: { x: ax + ux * start, z: az + uz * start },
                        b: { x: ax + ux * end, z: az + uz * end },
                        normal: { x: nx, z: nz },
                        thickness,
                        baseElevation: yElev + baseOffset,
                        sill,
                        height,
                    });
                }
            } catch (e) {
                console.warn('[gis][forma] opening read failed for a wall — skipped:', e);
            }
        }
        return out;
    };

    /**
     * §A.21.D34(d) — read STAIRS as a coarse extruded volume so the stairwell
     * reads in the massing. SOURCE: the stair store (geometry-stair StairData):
     *   • startPosition : Vec3 (scene-XZ origin of the first flight)
     *   • flights[0].direction : Vec3 (run direction; XZ)
     *   • riserCount · treadDepth : total run length along the direction
     *   • riserCount · riserHeight : total rise (the storey band height)
     *   • width : flight width
     *   • baseOffset : world base elevation
     * We emit a rotated footprint rectangle (run × width) + a base elevation +
     * a total rise — the Cesium side extrudes it as a simple block. Coarse by
     * design (the true treads live in the BIM view). Guarded — a degenerate
     * stair is skipped.
     */
    const getFormaStairs = (): Array<{
        origin: XZ;
        /** Run direction unit vector (scene-XZ). */
        dir: XZ;
        run: number;
        width: number;
        baseElevation: number;
        rise: number;
    }> => {
        type Vec3Rec = { x?: number; y?: number; z?: number };
        type StairRecord = {
            startPosition?: Vec3Rec;
            flights?: ReadonlyArray<{ direction?: Vec3Rec; riserCount?: number; treadDepth?: number }>;
            width?: number;
            riserHeight?: number;
            treadDepth?: number;
            riserCount?: number;
            baseOffset?: number;
        };
        const stairStore = storeRegistry.getStoreForType('stair') as unknown as
            | { getAll?: () => StairRecord[] }
            | undefined;
        const all = stairStore?.getAll?.() ?? [];
        const out: Array<{ origin: XZ; dir: XZ; run: number; width: number; baseElevation: number; rise: number }> = [];
        for (const s of all) {
            try {
                const sp = s.startPosition;
                if (!sp || typeof sp.x !== 'number' || typeof sp.z !== 'number') continue;
                const f0 = s.flights && s.flights.length ? s.flights[0] : undefined;
                const d = f0?.direction;
                let dx = typeof d?.x === 'number' ? d.x : 1;
                let dz = typeof d?.z === 'number' ? d.z : 0;
                const dlen = Math.hypot(dx, dz);
                if (dlen < 1e-6) { dx = 1; dz = 0; }
                else { dx /= dlen; dz /= dlen; }
                const tread = typeof s.treadDepth === 'number' && s.treadDepth > 0 ? s.treadDepth : 0.27;
                const risers =
                    typeof s.riserCount === 'number' && s.riserCount > 0
                        ? s.riserCount
                        : typeof f0?.riserCount === 'number' && f0.riserCount > 0
                            ? f0.riserCount
                            : 16;
                const riserH = typeof s.riserHeight === 'number' && s.riserHeight > 0 ? s.riserHeight : 0.18;
                const width = typeof s.width === 'number' && s.width > 0 ? s.width : 1.0;
                const run = Math.max(0.5, risers * tread);
                const rise = Math.max(0.3, risers * riserH);
                const baseOffset =
                    typeof s.baseOffset === 'number' && Number.isFinite(s.baseOffset) ? s.baseOffset : 0;
                out.push({
                    origin: { x: sp.x, z: sp.z },
                    dir: { x: dx, z: dz },
                    run,
                    width,
                    baseElevation: baseOffset,
                    rise,
                });
            } catch (e) {
                console.warn('[gis][forma] stair read failed — skipped:', e);
            }
        }
        return out;
    };

    // ════════════════════════════════════════════════════════════════════════
    // C58 (L-402b) — buildable-envelope render + facts card + on/off toggle.
    // The envelope is computed on `site.parcel-boundary-set` (siteDispatch) and
    // cached; here we (a) feed its inset ring + max height into the SAME Forma
    // render path as the parcel (SPEC §4), and (b) draw a compact "Estimated"
    // facts card + a show/hide toggle (SPEC §2 steps 4–5). Default ON post-commit.
    // ════════════════════════════════════════════════════════════════════════
    let formaEnvelopeVisible = true;
    let envelopePanel: HTMLDivElement | null = null;

    /** Feed the cached envelope's inset ring + height to the render, when ON. */
    const resolveFormaEnvelope = ():
        | { ring: Array<{ x: number; z: number }>; maxHeightM: number | null }
        | null => {
        if (!formaEnvelopeVisible) return null;
        const env = getLastBuildableEnvelope();
        if (!env || env.status !== 'ok' || env.insetPolygon.length < 3) return null;
        return {
            ring: env.insetPolygon.map((p) => ({ x: p.x, z: p.z })),
            maxHeightM: env.maxHeight_m,
        };
    };

    /** §L-412 (C59 Phase 1b) — the DOM host for the 3D-Site chrome (envelope card).
     *  When the site-authoring split is live the 3D Site lives in the RIGHT pane, so
     *  the "Estimated" facts card + toggle must render ON THAT PANE (C59 §1.3 — chrome
     *  is scoped to its own pane), not floated over the whole `#container`. Falls back
     *  to `#container` for the classic single-view Forma. */
    const getForma3dHostEl = (): HTMLElement | null => {
        if (siteAuthoringPanes && !siteAuthoringPanes.isDisposed) {
            const right = siteAuthoringPanes.getPaneElement(RIGHT_PANE);
            if (right) return right;
        }
        return document.getElementById('container');
    };

    /** Mount/refresh the "Estimated" facts card + on/off toggle (SPEC §2). */
    const refreshEnvelopePanel = (): void => {
        const viewport = getForma3dHostEl();
        const env = getLastBuildableEnvelope();
        // No envelope (no parcel / cleared) → drop the card entirely.
        if (!viewport || !env || env.status === 'none') {
            if (envelopePanel?.parentElement) envelopePanel.parentElement.removeChild(envelopePanel);
            envelopePanel = null;
            return;
        }
        if (!envelopePanel) {
            envelopePanel = document.createElement('div');
            envelopePanel.setAttribute('data-testid', 'buildable-envelope-card');
            Object.assign(envelopePanel.style, {
                position: 'absolute', top: '108px', right: '16px', zIndex: '32',
                width: '232px', padding: '12px 14px', background: '#ffffff',
                borderRadius: '12px', border: '1px solid #ece7fb',
                boxShadow: '0 4px 18px rgba(20,10,60,0.18)',
                font: '500 12px/1.45 system-ui, sans-serif', color: '#2a2340',
            } satisfies Partial<CSSStyleDeclaration>);
            viewport.appendChild(envelopePanel);
        } else if (envelopePanel.parentElement !== viewport) {
            // The pane host changed (split mounted / disposed) — re-home the card.
            viewport.appendChild(envelopePanel);
        }
        const setback = (c: 'setback.front' | 'setback.side' | 'setback.rear'): string => {
            const e = env.derivation.find((d) => d.constraint === c);
            return typeof e?.value === 'number' ? `${e.value.toFixed(1)} m` : '—';
        };
        const badge =
            env.confidence === 'estimated-ruleset'
                ? '<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#f3eeff;color:#6600FF;font-weight:700;font-size:10px;letter-spacing:.03em;text-transform:uppercase;">Estimated</span>'
                : `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#eef7ee;color:#2e7d32;font-weight:700;font-size:10px;text-transform:uppercase;">${env.confidence}</span>`;
        const heightTxt = env.maxHeight_m !== null ? `${env.maxHeight_m.toFixed(1)} m` : '—';
        const farTxt = env.maxFAR !== null ? env.maxFAR.toFixed(2) : '—';
        const gfaTxt =
            env.maxVolumeM3 !== null
                ? `${Math.round(env.insetAreaM2).toLocaleString()} m² footprint`
                : env.status === 'degenerate'
                ? 'no buildable area'
                : '—';
        const rows =
            env.status === 'degenerate'
                ? `<div style="color:#b23b3b;font-weight:600;">Setbacks consume the whole parcel — no buildable envelope.</div>`
                : `<div style="display:flex;justify-content:space-between;"><span style="color:#6b6480;">Setbacks (F/S/R)</span><span style="font-weight:600;">${setback('setback.front')} / ${setback('setback.side')} / ${setback('setback.rear')}</span></div>
                   <div style="display:flex;justify-content:space-between;margin-top:3px;"><span style="color:#6b6480;">Max height</span><span style="font-weight:600;">${heightTxt}</span></div>
                   <div style="display:flex;justify-content:space-between;margin-top:3px;"><span style="color:#6b6480;">Max FAR</span><span style="font-weight:600;">${farTxt}</span></div>
                   <div style="display:flex;justify-content:space-between;margin-top:3px;"><span style="color:#6b6480;">Buildable</span><span style="font-weight:600;">${gfaTxt}</span></div>`;
        envelopePanel.innerHTML =
            `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;">
               <span style="font-weight:700;font-size:12.5px;color:#6600FF;">Buildable envelope</span>${badge}
             </div>
             ${rows}
             <div style="margin-top:9px;display:flex;align-items:center;justify-content:space-between;">
               <span style="color:#8a83a0;font-size:10.5px;">Default rule pack — real DK/ES zoning coming</span>
             </div>
             <button data-testid="envelope-toggle" style="margin-top:10px;width:100%;appearance:none;border:1px solid #6600FF;cursor:pointer;padding:7px 10px;border-radius:8px;font:600 12px system-ui;background:${formaEnvelopeVisible ? '#6600FF' : '#ffffff'};color:${formaEnvelopeVisible ? '#ffffff' : '#6600FF'};">
               Envelope: ${formaEnvelopeVisible ? 'ON' : 'OFF'}
             </button>`;
        const btn = envelopePanel.querySelector('[data-testid="envelope-toggle"]') as HTMLButtonElement | null;
        if (btn) {
            btn.onclick = () => {
                formaEnvelopeVisible = !formaEnvelopeVisible;
                // Re-place the massing (no re-fly) so the envelope appears/disappears.
                if (cesiumViewport?.renderFormaMassing && formaViewMode !== 'map2d') {
                    renderFormaMassing(false);
                } else {
                    refreshEnvelopePanel();
                }
            };
        }
    };

    /**
     * FORMA.3 — read PRYZM's authored geometry + boundary and render the white
     * massing into Cesium at the real-world site. `frame` flies the camera; the
     * optional `preset` chooses the NW '3D' oblique (default) or the near-top-
     * down 'plan' plan-oblique (FORMA-PLAN-OBLIQUE). Best-effort + public
     * CesiumViewport API only.
     */
    const renderFormaMassing = (frame: boolean, preset: 'oblique' | 'plan' = 'oblique'): void => {
        if (!cesiumViewport?.renderFormaMassing) {
            console.warn('[gis][forma] renderFormaMassing unavailable (Cesium not mounted yet).');
            return;
        }
        const origin = getFormaOrigin();
        if (!origin) {
            console.log('[gis][forma] no site location yet — cannot place massing.');
            runtime?.events?.emit('pryzm:toast', {
                message: 'Set a site location first, then switch to 3D View.',
                severity: 'info',
            });
            return;
        }
        const boundary = getFormaBoundary();
        const walls = getFormaWalls();
        // §A.21.D25 — the building's OTHER elements (floors + roof + coarse
        // furniture) so the globe reads as a real building, not walls-only.
        const slabs = getFormaSlabs();
        const roofs = getFormaRoofs();
        const furniture = getFormaFurniture();
        // §A.21.D34(d) — windows + doors (façade insets) + stairs (coarse
        // stairwell volume) so the building reads COMPLETE, not blank-white.
        const openings = getFormaOpenings();
        const stairs = getFormaStairs();
        if (walls.length === 0 && !boundary) {
            // Nothing authored yet — still render the (empty) Forma scene so the
            // flat warm-grey ground + Forma look is visibly engaged, and the user
            // sees they're in the massing study even with nothing built.
            console.log(
                `[gis][forma] no authored walls and no parcel boundary yet — showing the empty Forma scene ` +
                    `(flat ground, no massing) at origin LAT ${origin.lat} LON ${origin.lon}.`
            );
        } else {
            console.log(
                `[gis][forma] rendering massing: ${walls.length} wall(s), ${slabs.length} slab(s), ` +
                    `${roofs.length} roof(s), ${furniture.length} furniture, ${openings.length} opening(s), ` +
                    `${stairs.length} stair(s), boundary=${boundary ? 'yes' : 'no'}, ` +
                    `origin LAT ${origin.lat} LON ${origin.lon}.`
            );
        }
        // §FORMA-FULL-HEIGHT-EXPLICIT (founder 2026-07-01) — resolve the TRUE building
        // height and pass it so the Cesium massing tiles the shell + façade across the
        // WHOLE tower. ROOT CAUSE of "only the ground level gets façade colours": the
        // office's authored walls arrive at baseElevation 0 (all storeys collapsed), so
        // groupWallsIntoStoreyBands makes ONE 4 m band and the slab-derived height lift
        // never fires → the massing + façade rendered a single ground ring. Derive the
        // height here from the levels (max elevation + a storey height, or level COUNT ×
        // storey height when elevations aren't stamped — the office case) and the slabs'
        // topElevation, and take the max. When the authored bands already reach this
        // height (real multi-storey walls), the Cesium side no-ops (harmless).
        let fullBuildingHeightM = 0;
        try {
            const levels =
                (window.bimManager as { getLevels?: () => Array<{ elevation?: number }> } | undefined)
                    ?.getLevels?.() ?? [];
            let maxLevelElev = 0;
            for (const l of levels) {
                if (typeof l.elevation === 'number' && Number.isFinite(l.elevation) && l.elevation > maxLevelElev) {
                    maxLevelElev = l.elevation;
                }
            }
            let storeyH = 0;
            for (const w of walls) { if (w.height > storeyH) storeyH = w.height; }
            if (!(storeyH > 0.5)) storeyH = 4;
            // Accurate when levels carry elevations; else fall back to COUNT × storey
            // height (a 40-level office → ~40×4 = 160 m even with unstamped elevations).
            const fromLevels = maxLevelElev > 0.5 ? maxLevelElev + storeyH : levels.length * storeyH;
            let fromSlabs = 0;
            for (const s of slabs) { if (s.topElevation > fromSlabs) fromSlabs = s.topElevation; }
            fullBuildingHeightM = Math.max(fromLevels, fromSlabs);
        } catch { /* best-effort — Cesium still resolves height from its own signals */ }

        cesiumViewport.renderFormaMassing({
            originLat: origin.lat,
            originLon: origin.lon,
            boundary,
            walls,
            // §A.21.D25 — floors/roof/furniture alongside the wall massing (all
            // optional on the Cesium side → back-compat for older callers).
            slabs,
            roofs,
            furniture,
            // §A.21.D34(d) — façade window/door insets + coarse stair volumes.
            openings,
            stairs,
            // §FORMA-FULL-HEIGHT-EXPLICIT — the resolved true tower height (see above).
            ...(fullBuildingHeightM > 0 ? { fullBuildingHeightM } : {}),
            // C58 (L-402b) — the buildable-envelope study volume, when computed +
            // toggled ON. Reuses the SAME ENU projection as `boundary` above.
            envelope: resolveFormaEnvelope(),
            frameCentroid: frame,
            framePreset: preset,
        });
        // C58 — refresh the envelope facts card + toggle to match this render.
        refreshEnvelopePanel();
        // §A.21.D24 — rebuild the Floors selector from the storeys just placed.
        refreshFormaFloorSelector();

        // FORMA.6 — overlay the REAL full-fidelity PRYZM model (live BIM scene →
        // glTF) on the Forma study, replacing the abstract massing blocks. The
        // massing above is the SAFE FALLBACK + does the real work this depends on
        // (establishes the terrain clamp + storey-band floor selector). Best-effort,
        // off the critical path (deferred), cache-gated by geometry signature.
        if (formaBuildingFidelity === 'real') {
            // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the GLB export + primitive load is
            // part of "everything is loaded": register it with the in-flight activation so the
            // overlay does not lift while the real house is still being serialised.
            trackViewActivationPlacement(placeRealModelOnForma({ lat: origin.lat, lon: origin.lon }));
        }
    };

    // §A.21.D39#5 — place the SAME authored building massing on the PHOTOREAL globe
    // (real imagery + Google 3D tiles + sky), used by the "3D globe" result toggle.
    // Reuses every Forma input reader (walls/slabs/roof/openings/stairs/furniture/
    // boundary) but routes through renderBuildingOnGlobe (keepPhotoreal) so the
    // scene stays photoreal — the user's house sits inside the real-world city.
    // Best-effort + guarded; the camera is framed separately by reframeSiteIn3D.
    const placeBuildingOnGlobe = (): void => {
        if (!cesiumViewport?.renderBuildingOnGlobe) {
            console.warn('[gis][globe] renderBuildingOnGlobe unavailable (Cesium not mounted / old build).');
            return;
        }
        const origin = getFormaOrigin();
        if (!origin) {
            console.log('[gis][globe] no site location yet — cannot place building on the globe.');
            return;
        }
        const boundary = getFormaBoundary();
        const walls = getFormaWalls();
        const slabs = getFormaSlabs();
        const roofs = getFormaRoofs();
        const furniture = getFormaFurniture();
        const openings = getFormaOpenings();
        const stairs = getFormaStairs();
        if (walls.length === 0 && !boundary) {
            console.log('[gis][globe] nothing authored yet — no building to place on the photoreal globe.');
            return;
        }
        console.log(
            `[gis][globe] placing building on the PHOTOREAL globe: ${walls.length} wall(s), ` +
                `${slabs.length} slab(s), ${roofs.length} roof(s), ${openings.length} opening(s), ` +
                `${stairs.length} stair(s) at LAT ${origin.lat} LON ${origin.lon}.`
        );
        try {
            // STEP 1 — render the Forma massing on the photoreal globe. This is the
            // SAFE FALLBACK and ALSO does the real work the real-model path depends
            // on: it establishes the v50 tile clamp (`formaTerrainBaseHeight`) and
            // populates the storey-band floor selector. If the real-model overlay
            // (step 2) fails for any reason, this massing stays as the result.
            cesiumViewport.renderBuildingOnGlobe({
                originLat: origin.lat,
                originLon: origin.lon,
                boundary,
                walls,
                slabs,
                roofs,
                furniture,
                openings,
                stairs,
                // The camera is framed by reframeSiteIn3D() — don't double-fly here.
                frameCentroid: false,
            });
            refreshFormaFloorSelector();

            // §GLOBE-FIDELITY — when the user has chosen the abstract MASSING study on
            // the globe, STOP here: the massing blocks rendered above ARE the result.
            // Drop any previously-placed real model so the two don't double-render.
            if (globeBuildingFidelity === 'massing') {
                cesiumViewport.clearRealModelOnGlobe?.();
                // §CESIUM-PERF-GLOBE-GLB-CACHE — the real model is gone; the next flip to
                // 'real' must re-place it (don't let the cache short-circuit an empty globe).
                globeRealPlaced = false;
                console.log('[gis][globe] §GLOBE-FIDELITY fidelity="massing" — showing massing blocks on the tiles (no real-model overlay).');
                return;
            }

            // STEP 2 — §A.21.D49: overlay the REAL, FULL-FIDELITY PRYZM model (the
            // live BIM THREE scene serialised to glTF — real walls with their CSG
            // openings, windows, doors, roof, slabs, in the app's real materials) on
            // the tiles, replacing the pastel massing blocks. The detailed model is
            // the renderer-agnostic glTF bridge across the WebGPU(BIM)↔WebGL(Cesium)
            // split. Best-effort + deferred slightly so the async tile clamp has a
            // chance to seat `formaTerrainBaseHeight` before we read it for the model.
            // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — registered with the in-flight
            // globe activation: the overlay stays up until the real model has actually landed.
            trackViewActivationPlacement(placeRealModelOnGlobe(origin));
        } catch (err) {
            console.warn('[gis][globe] renderBuildingOnGlobe failed (non-fatal):', err);
        }
    };

    // §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY (L-193) — the SINGLE routine
    // that (re)establishes the photoreal "3D globe" content. Shared by the result-toggle
    // globe entry (applyResultView('3D')) AND the direct-toggle re-entry branch (Symptom B),
    // so every globe entry seats + frames identically + idempotently.
    //   1. EXIT Forma (setFormaMode(false)) so the real-world imagery shows (§GLOBE-EXIT-FORMA).
    //      This ALSO destroys the Forma study real-model primitive (restorePhotorealMode →
    //      clearRealModelOnForma) — so we INVALIDATE the GISAreaLayout Forma real-model cache
    //      (Symptom A): the next Forma "3D Site" entry must re-export + re-place the real house
    //      instead of reusing a destroyed model (which left the massing prism on screen).
    //   2. Arm the one-shot corrective re-frame that fires once the async tile-height clamp
    //      settles the real Google-tile ground (§FIX-GLOBE-AUTOFRAME-AND-SEAT, L-184).
    //   3. Place the building on the photoreal globe (renderBuildingOnGlobe → real-model
    //      overlay; L-186 liveness cache re-exports when the primitive was cleared, reuses
    //      when still live; L-179 clamp-to-photoreal-tiles preserved inside the viewport).
    //   4. Frame the camera to the placed building now (reframeSiteIn3D).
    const restorePhotorealGlobeContent = (): void => {
        try { cesiumViewport?.setFormaMode?.(false); }
        catch (e) { console.warn('[gis] 3D globe: setFormaMode(false) failed (non-fatal):', e); }
        // Symptom A — entering the photoreal globe destroyed any Forma study real model.
        const invalidated = invalidateFormaRealCacheOnPhotorealGlobeEntry();
        formaRealLastSig = invalidated.lastSig;
        formaRealPlaced = invalidated.placed;
        try { cesiumViewport?.armGlobeReframeOnBaseSettle?.('oblique'); }
        catch (e) { console.warn('[gis] 3D globe: armGlobeReframeOnBaseSettle failed (non-fatal):', e); }
        placeBuildingOnGlobe();
        // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — reframeSiteIn3D is a DETACHED promise; without a
        // .catch a rejected camera fly / getCesium becomes an unhandled rejection that can eject the
        // user. Contain it (the camera framing is best-effort — the globe stays open regardless).
        void reframeSiteIn3D().catch((err: unknown) => {
            console.error('[gis] §FIX-GLOBE-CLICK-NAVIGATES-OUT reframeSiteIn3D failed — contained (globe stays open):', err);
        });
    };

    // §A.21.D49 — export the live BIM scene to GLB and place it as the REAL detailed
    // model on the photoreal tiles. On success, hide the abstract Forma massing
    // blocks so only the real model shows. Any failure leaves the massing in place
    // (the fallback) — this never throws.
    const placeRealModelOnGlobe = async (origin: { lat: number; lon: number }): Promise<void> => {
        try {
            if (globeBuildingFidelity !== 'real') return; // §GLOBE-FIDELITY — massing study chosen.
            if (!cesiumViewport?.renderRealModelOnGlobe) {
                console.warn('[gis][globe] renderRealModelOnGlobe unavailable (old build) — keeping massing.');
                return;
            }
            // §CESIUM-PERF-GLOBE-GLB-CACHE (2026-07-01) — the 22 MB GLB was re-serialised
            // + re-uploaded on EVERY globe entry (every view switch re-ran this path),
            // even when nothing about the building changed — the single biggest cost of
            // entering the 3D globe. Mirror the Forma path's signature cache: skip the
            // whole export when the geometry signature is unchanged AND a real model is
            // ALREADY placed on the globe. The camera/metric/view-toggle no longer force
            // a re-export; only a real geometry edit (which bumps the signature) does.
            if (globeRealExporting) return;                          // an export is already in flight.
            const sig = computeBuildingSignature();
            // §FIX-GLOBE-REENTRY-MODEL-LOST (L-186) — reuse ONLY when the model is STILL LIVE on
            // the globe. Mirrors CesiumViewport.shouldReuseGlobeRealModel (the tested SSOT). The
            // Forma "3D Site" study path destroys the globe model (clearRealModelOnGlobe), so on
            // a globe→forma→globe round-trip `globeRealPlaced` is stale-true while the primitive
            // is GONE — the old cache short-circuited to an EMPTY globe (house lost). Gating on
            // the live presence check forces a re-place (re-export) when the model was cleared;
            // plain view/camera/metric switches (model still alive) still skip the re-export.
            const modelStillLive = (cesiumViewport.hasRealModelOnGlobe?.() ?? false) as boolean;
            if (sig === globeRealLastSig && globeRealPlaced && globeRealLastSig !== null && modelStillLive) {
                console.log('[gis][globe] §CESIUM-PERF-GLOBE-GLB-CACHE geometry unchanged + model still live — reusing placed real model (no re-export).');
                cesiumViewport.clearFormaMassingEntitiesOnly?.();
                return;
            }
            if (!modelStillLive && globeRealPlaced) {
                // The model was destroyed by a Forma round-trip; the perf flag was stale.
                // Reset it so the re-place path below runs cleanly.
                globeRealPlaced = false;
                console.log('[gis][globe] §FIX-GLOBE-REENTRY-MODEL-LOST real model was cleared (forma round-trip) — re-placing on globe re-entry.');
            }
            const scene = props.world?.scene?.three;
            if (!scene) {
                console.warn('[gis][globe] no BIM scene to serialise — keeping massing.');
                return;
            }
            globeRealExporting = true;
            const { exportFragmentsToGLB } = await import('@pryzm/file-format');
            const glbUrl = await exportFragmentsToGLB(scene as any);
            if (!glbUrl) {
                console.warn('[gis][globe] GLB export returned no url — keeping massing.');
                return;
            }
            const placed = await cesiumViewport.renderRealModelOnGlobe({
                glbUrl,
                originLat: origin.lat,
                originLon: origin.lon,
            });
            if (placed) {
                // Real model is on the tiles — hide the abstract massing blocks so the
                // two don't double-render (keep storey-band metadata + selector).
                cesiumViewport.clearFormaMassingEntitiesOnly?.();
                // §CESIUM-PERF-GLOBE-GLB-CACHE — remember the signature so a re-entry with
                // unchanged geometry short-circuits above (no re-export).
                globeRealLastSig = sig;
                globeRealPlaced = true;
                console.log('[gis][globe] §A.21.D49 REAL detailed model placed on tiles — massing blocks hidden.');
            } else {
                // Declined (fidelity flipped mid-export / load failed) — revoke the unused
                // blob so it doesn't leak, keep the massing fallback, clear the cache flag.
                try { URL.revokeObjectURL(glbUrl); } catch { /* not a blob */ }
                globeRealPlaced = false;
                console.log('[gis][globe] §A.21.D49 real-model placement declined — massing fallback kept.');
            }
        } catch (err) {
            console.warn('[gis][globe] §A.21.D49 real-model overlay failed (keeping massing fallback):', err);
        } finally {
            globeRealExporting = false;
        }
    };

    // §GLOBE-FIDELITY (founder) — flip the photoreal "3D globe" between the REAL
    // authored building (the full PRYZM model overlaid on the tiles) and the abstract
    // MASSING study (white/pastel volumes on the tiles). Mirrors the Forma view's
    // setFormaBuildingFidelity: switching to 'massing' drops the real-model primitive
    // and re-renders the massing blocks; switching to 'real' re-places the model. The
    // re-render is in place — the camera never re-flies. No-op unless the 3D globe is
    // the active result view.
    const setGlobeBuildingFidelity = (fidelity: 'massing' | 'real'): void => {
        if (fidelity !== 'massing' && fidelity !== 'real') {
            console.warn(`[gis][globe] setGlobeBuildingFidelity: bad value ${String(fidelity)} — ignored.`);
            return;
        }
        if (globeBuildingFidelity === fidelity) return;
        globeBuildingFidelity = fidelity;
        refreshGlobeFidelityButtons();
        console.log(`[gis][globe] §GLOBE-FIDELITY building fidelity → ${fidelity}.`);
        if (fidelity === 'massing') {
            // Drop the real model so only the (about-to-be-re-rendered) massing shows.
            cesiumViewport?.clearRealModelOnGlobe?.();
            // §CESIUM-PERF-GLOBE-GLB-CACHE — model dropped; a later flip to 'real' must
            // re-place it, so clear the "already placed" flag (keep the signature so an
            // UNCHANGED building still recognises the geometry and re-exports at most once).
            globeRealPlaced = false;
        }
        // Re-run the globe placement in place (no re-fly): renders the massing, then
        // — when fidelity is 'real' — overlays the real model + hides the blocks.
        // Only meaningful while the 3D globe is the active result view.
        if (resultViewMode === '3D') placeBuildingOnGlobe();
    };
    window.pryzmSetGlobeBuildingFidelity = setGlobeBuildingFidelity;

    // ════════════════════════════════════════════════════════════════════════
    // FORMA.6 — REAL full-fidelity building on the FORMA flat-ground study view
    // ════════════════════════════════════════════════════════════════════════
    //
    // The founder asked for "in Forma view the same as the 3D globe tiles view —
    // the building/elements coming from the PRYZM WebGPU scene", with FULL element
    // fidelity. We reuse the SAME glTF bridge the globe path uses: serialise the
    // live BIM THREE scene to GLB (`exportFragmentsToGLB`, @pryzm/file-format —
    // owns the THREE access, so apps/editor never imports THREE → P2-safe) and hand
    // the blob URL to `CesiumViewport.renderRealModelOnForma`, which places it as a
    // native Cesium.Model at the SAME ENU origin + terrain clamp the massing uses.
    //
    // Default fidelity is 'real' (the founder's ask). The abstract massing remains
    // reachable via setFormaBuildingFidelity('massing') (+ the console command).

    // Default 'real' per the founder; the toggle / console command flips it.
    let formaBuildingFidelity: 'massing' | 'real' = 'real';
    // Repaints the [Real][Massing] toggle buttons; assigned when the bar mounts,
    // no-op before then (e.g. a console-driven fidelity flip with no toggle bar).
    let refreshFormaFidelityButtons: () => void = () => { /* bar not mounted yet */ };

    // PERF (task #4) — cache the exported GLB keyed by a cheap geometry signature so
    // an unchanged building isn't re-serialised on every live-update re-place. The
    // signature folds element counts + a coarse hash of wall endpoints/openings; any
    // edit (move/add/remove) changes it. The blob URL is owned by the viewport once
    // placed (it revokes on replace/dispose), so we only cache the SIGNATURE here to
    // decide whether a re-export is needed — we do NOT hold a stale blob.
    let formaRealLastSig: string | null = null;
    let formaRealExporting = false;
    // True once a real model is actually placed on the Forma study (so the cache can
    // skip re-export only when something IS on screen). Reset on fidelity→massing.
    let formaRealPlaced = false;

    const computeBuildingSignature = (): string => {
        try {
            return buildingGeometrySignature({
                walls: getFormaWalls(),
                openings: getFormaOpenings(),
                slabCount: getFormaSlabs().length,
                roofCount: getFormaRoofs().length,
                stairCount: getFormaStairs().length,
                furnitureCount: getFormaFurniture().length,
            });
        } catch {
            // Any reader failure → a unique signature so we always re-export (safe).
            return `err-${Date.now()}`;
        }
    };

    // FORMA.6 — export the live BIM scene to GLB and place it as the REAL detailed
    // model on the FORMA flat-ground study. On success the viewport hides the
    // abstract massing blocks so only the real model shows. Any failure leaves the
    // massing in place (the fallback) — this never throws. Off the critical path
    // (the massing is already rendered when this runs) + skips the re-export when
    // the geometry signature is unchanged (task #4 perf).
    const placeRealModelOnForma = async (origin: { lat: number; lon: number }): Promise<void> => {
        try {
            const sig = computeBuildingSignature();
            // §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY (L-193, Symptom A) — the
            // reuse-vs-re-export decision. The cache flags (formaRealPlaced / formaRealLastSig)
            // are INVALIDATED when the photoreal globe destroys the Forma real-model primitive
            // (restorePhotorealGlobeContent → invalidateFormaRealCacheOnPhotorealGlobeEntry), so
            // after a globe→forma round-trip this returns 'export-and-place' (re-places the real
            // house) instead of a stale 'reuse-placed' (which left the massing prism on screen).
            const action = decideFormaRealPlacement({
                fidelity: formaBuildingFidelity,
                hasViewportApi: typeof cesiumViewport?.renderRealModelOnForma === 'function',
                exporting: formaRealExporting,
                currentSig: sig,
                cache: { lastSig: formaRealLastSig, placed: formaRealPlaced },
            });
            if (action === 'skip-massing-fidelity') return;           // massing study chosen.
            if (action === 'skip-no-viewport-api') {
                console.warn('[gis][forma6] renderRealModelOnForma unavailable (old build) — keeping massing.');
                return;
            }
            if (action === 'skip-export-in-flight') return;           // an export is already in flight.
            if (action === 'reuse-placed') {
                // Geometry unchanged AND the model is still placed — reuse it, no re-export.
                console.log('[gis][forma6] geometry unchanged — reusing placed real model (no re-export).');
                return;
            }
            // action === 'export-and-place'
            const scene = props.world?.scene?.three;
            if (!scene) {
                console.warn('[gis][forma6] no BIM scene to serialise — keeping massing.');
                return;
            }
            formaRealExporting = true;
            const { exportFragmentsToGLB } = await import('@pryzm/file-format');
            // §FORMA-WHITE-MATERIAL (ADR-0093) — on the Forma 3D-site STUDY view the
            // building reads as a clean WHITE architectural model (Spacio/Forma
            // reference): every element near-white, windows translucent glass. This
            // is Forma-VIEW-ONLY — the editor's WebGPU BIM view keeps real materials,
            // and the normal GLB download/export path (no option) is unchanged.
            const glbUrl = await exportFragmentsToGLB(scene as any, { formaWhite: true });
            if (!glbUrl) {
                console.warn('[gis][forma6] GLB export returned no url — keeping massing.');
                return;
            }
            const placed = await cesiumViewport.renderRealModelOnForma({
                glbUrl,
                originLat: origin.lat,
                originLon: origin.lon,
            });
            if (placed) {
                formaRealLastSig = sig;
                formaRealPlaced = true;
                console.log('[gis][forma6] REAL full-fidelity model placed on the Forma study — massing blocks hidden.');
            } else {
                // Declined (fidelity flipped mid-export, or load failed) — revoke the
                // blob we won't use so it doesn't leak, keep the massing fallback.
                try { URL.revokeObjectURL(glbUrl); } catch { /* not a blob */ }
                formaRealPlaced = false;
                console.log('[gis][forma6] real-model placement declined — massing fallback kept.');
            }
        } catch (err) {
            console.warn('[gis][forma6] real-model overlay failed (keeping massing fallback):', err);
        } finally {
            formaRealExporting = false;
        }
    };

    /**
     * §A.21.D24 — (re)populate the Floors <select> from the REAL storeys of the
     * placed massing. Shows "All floors" + one entry per storey (Ground, 1st, 2nd
     * …). Hidden when there's 0/1 storey (nothing to choose). Preserves the
     * current selection where possible. Safe before the selector is mounted.
     */
    const refreshFormaFloorSelector = (): void => {
        const sel = formaFloorSelect;
        if (!sel) return;
        const bands = cesiumViewport?.getFormaStoreyBands?.() ?? [];
        if (bands.length < 2) {
            sel.style.display = 'none';
            sel.innerHTML = '';
            return;
        }
        const prev = sel.value;
        const floorLabel = (i: number): string =>
            i === 0 ? '0 · Ground' : `${i} · ${i === 1 ? '1st' : i === 2 ? '2nd' : i === 3 ? '3rd' : `${i}th`} floor`;
        const opts: string[] = ['<option value="all">▤ All floors</option>'];
        for (const b of bands) opts.push(`<option value="${b.index}">${floorLabel(b.index)}</option>`);
        sel.innerHTML = opts.join('');
        // Restore prior choice if it still exists, else default to "all".
        sel.value = Array.from(sel.options).some((o) => o.value === prev) ? prev : 'all';
        sel.style.display = 'inline-block';
        console.log(`[gis][forma] floor selector rebuilt: ${bands.length} storeys.`);
    };

    // ── The floating [ 2D Map ][ Plan ][ 3D ] toggle (top-right; white + #6600FF) ──
    // FORMA-PLAN-OBLIQUE — a clean 3-way group. All three modes stay reachable:
    //   • 'map2d' — the MapLibre cream draw map (drop Cesium) for drawing/editing
    //               the boundary (the OLD "Plan View" behaviour, renamed "2D Map").
    //   • 'plan'  — Cesium plan-oblique (near-top-down, pitch −68°, heading N) —
    //               the Autodesk-Forma signature "plan" look (shadowed massing).
    //   • '3d'    — Cesium NW oblique (pitch −45°, heading 325°) — depth view.
    // 'plan' + '3d' are BOTH the Cesium-Forma canvas at different pitches; only
    // the camera angle differs (same setFormaMode + context + massing + shadows).
    type FormaViewMode = 'map2d' | 'plan' | '3d';
    let formaToggle: HTMLElement | null = null;
    let formaViewMode: FormaViewMode = 'map2d';
    let formaMap2dBtn: HTMLButtonElement | null = null;
    let formaPlanBtn: HTMLButtonElement | null = null;
    let formaThreeBtn: HTMLButtonElement | null = null;
    // §A.21.D24 — the multi-floor "Floors" selector (built lazily; hidden until
    // the placed massing has ≥2 storeys).
    let formaFloorSelect: HTMLSelectElement | null = null;

    // ── FORMA.5 — site-analysis chrome (sun scrubber + climate card + wind rose).
    // Mounted only while the 3D Forma view is active; disposed on view exit so
    // the controls never linger in the 2D plan view (SPEC §6 cleanup rule).
    let formaAnalysis: import('../geospatial/FormaSiteAnalysisControls').FormaSiteAnalysisControls | null = null;

    const mountFormaAnalysis = (): void => {
        if (!cesiumViewport?.setFormaSunTime) return; // Cesium not mounted / no FORMA.5 API.
        const viewportEl = document.getElementById('container');
        if (!viewportEl) return;
        // A.10.f — populate the ClimateStore for the site's lat/lon so the
        // FORMA.5 climate card + ClimatePanel show REAL data (offline bundled
        // normals by default; the controls re-render via their climateStore
        // subscription once this resolves). Fire-and-forget; never blocks.
        import('../climate/ensureSiteClimate')
            .then(({ ensureSiteClimate }) => ensureSiteClimate(runtime ?? null))
            .catch((e) => console.warn('[gis][forma] ensureSiteClimate failed:', e));
        import('../geospatial/FormaSiteAnalysisControls')
            .then(({ FormaSiteAnalysisControls }) => {
                // Re-check: the user may have flipped to the 2D map before this resolved.
                // The analysis chrome belongs to BOTH Cesium-Forma modes (plan + 3d).
                if (formaViewMode === 'map2d' || !cesiumViewport?.setFormaSunTime) return;
                formaAnalysis?.dispose();
                formaAnalysis = new FormaSiteAnalysisControls(cesiumViewport, runtime ?? null, viewportEl);
                formaAnalysis.mount();
            })
            .catch((e) => console.warn('[gis][forma] analysis controls load failed:', e));
    };
    const disposeFormaAnalysis = (): void => {
        try { formaAnalysis?.dispose(); } catch (e) { console.warn('[gis][forma] analysis dispose failed:', e); }
        formaAnalysis = null;
    };

    const styleFormaBtn = (el: HTMLButtonElement | null, active: boolean): void => {
        if (!el) return;
        el.style.background = active ? '#6600FF' : 'transparent';
        el.style.color = active ? '#ffffff' : '#6600FF';
    };
    const refreshFormaButtons = (): void => {
        styleFormaBtn(formaMap2dBtn, formaViewMode === 'map2d');
        styleFormaBtn(formaPlanBtn, formaViewMode === 'plan');
        styleFormaBtn(formaThreeBtn, formaViewMode === '3d');
    };

    // Await the Cesium viewer's real mount/ready signal (CesiumViewport.whenReady())
    // instead of guessing with a fixed setTimeout. toggleGIS(true) constructs the
    // viewport asynchronously, so `cesiumViewport` may still be null for a tick — we
    // poll briefly for the instance to exist, then await its ready promise. Falls
    // back to a longer timeout only if no ready signal is reachable. This fixes the
    // "Cesium not mounted yet → setFormaMode/renderFormaMassing no-op" race.
    const awaitCesiumReady = async (): Promise<void> => {
        // Wait for the CesiumViewport instance to be constructed (toggleGIS kicks
        // off the async mount; the closure var is assigned synchronously inside it
        // but the import()/mount() is async). Poll up to ~6s.
        const tStart = Date.now();
        while (!cesiumViewport && Date.now() - tStart < 6000) {
            await new Promise((r) => setTimeout(r, 50));
        }
        if (!cesiumViewport) {
            console.warn('[gis][forma] awaitCesiumReady: CesiumViewport never constructed (6s) — proceeding best-effort.');
            return;
        }
        if (typeof cesiumViewport.whenReady === 'function') {
            try {
                await cesiumViewport.whenReady();
                console.log('[gis][forma] Cesium viewer ready (awaited whenReady, no fixed timer).');
                return;
            } catch (err) {
                console.warn('[gis][forma] whenReady rejected — falling back to timeout:', err);
            }
        }
        // Fallback: no ready signal reachable → wait a generous beat.
        console.warn('[gis][forma] no whenReady() on CesiumViewport — falling back to 800ms timeout.');
        await new Promise((r) => setTimeout(r, 800));
    };

    // FORMA-PLAN-OBLIQUE — engage the Cesium-Forma canvas at the requested camera
    // preset. Shared by BOTH Cesium modes ('plan' = near-top-down plan-oblique,
    // '3d' = NW oblique): the ONLY difference is the fly preset passed to
    // renderFormaMassing. Cesium mounts async on first use, so we await its real
    // ready signal (whenReady) before forcing Forma + placing massing (no race).
    const engageFormaCesium = (preset: 'oblique' | 'plan'): void => {
        const targetMode: FormaViewMode = preset === 'plan' ? 'plan' : '3d';
        console.log(`[gis][forma] activating ${targetMode === 'plan' ? 'Plan (plan-oblique)' : '3D (NW oblique)'} → forcing Forma massing mode.`);
        // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the SHARED overlay goes up NOW
        // (synchronously, before the async mount), and the scene input stays gated until the
        // massing + real model are placed AND the terrain clamp has settled.
        const activation = startViewActivationLoading('site', () => engageFormaCesium(preset));
        // §FIX-GISLAYOUT-…-GLOBE-REENTRY (L-193, Symptom B) — entering the Forma "3D Site"
        // study self-places via renderFormaMassing (after awaitCesiumReady); suppress the
        // synchronous re-activation-branch globe placement so it never fights Forma mode.
        gisReactivationSelfPlaceSuppressed = true;
        try {
            toggleGIS(true);
        } catch (err) {
            // §FIX-GLOBE-CLICK-NAVIGATES-OUT (L-318) — contain a synchronous toggleGIS throw so a
            // "3D Site" activation failure stays IN-editor with retry, never escaping to the crash
            // guard's blind spot → router navigate-out / reload.
            console.error('[gis][forma] §FIX-GLOBE-CLICK-NAVIGATES-OUT Forma toggleGIS threw — contained (in-editor retry):', err);
            activation.fail(`The 3D Site view failed to open: ${String((err as Error)?.message ?? err)}`);
        } finally {
            gisReactivationSelfPlaceSuppressed = false;
        }
        // Force Forma look NOW (idempotent) so even an already-mounted viewer
        // (with a Cesium token → otherwise photoreal) flips to the massing study.
        window.pryzmSetCesiumFormaMode?.(true);
        void awaitCesiumReady().then(() => {
            // Re-check: the user may have flipped to another mode while we waited.
            if (formaViewMode !== targetMode) {
                console.log('[gis][forma] Cesium activation aborted — user switched mode while Cesium mounted.');
                activation.cancel('user switched mode while Cesium mounted');
                return;
            }
            // FORCE Forma mode even when a Cesium token IS present: these buttons
            // mean "Forma massing study", never photoreal. (Idempotent.)
            cesiumViewport?.setFormaMode?.(true);
            window.pryzmSetCesiumFormaMode?.(true);
            console.log('[gis][forma] Forma mode engaged on the live viewer.');
            renderFormaMassing(true, preset);
            // FORMA.5 — bring up the sun/shadow/climate/wind analysis chrome.
            mountFormaAnalysis();
            // L-270 — the placement is issued and the terrain clamp is armed; the overlay may
            // now await the ground-settle signal (and any real-model export it registered).
            activation.contentIssued();
        }).catch((err: unknown) => {
            console.error('[gis][forma] Cesium activation failed:', err);
            activation.fail(`The 3D Site view failed to open: ${String((err as Error)?.message ?? err)}`);
        });
    };

    /**
     * FORMA-PLAN-OBLIQUE — switch between the three Forma view modes. Layers
     * persist — the drawn boundary + authored massing stay placed; only
     * visibility + camera change.
     *   • 'map2d' — drop Cesium, reveal the MapLibre cream draw map (boundary
     *               drawing/editing). The old "Plan View" exit behaviour.
     *   • 'plan'  — Cesium plan-oblique (near-top-down, shadows = depth cue).
     *   • '3d'    — Cesium NW oblique (the depth view).
     */
    const applyFormaView = (mode: FormaViewMode): void => {
        formaViewMode = mode;
        if (mode === '3d') {
            engageFormaCesium('oblique');
        } else if (mode === 'plan') {
            engageFormaCesium('plan');
        } else {
            // 2D Map — drop the Cesium globe, reveal the 2D cream map. If the
            // committed cream map is still alive it stays; otherwise (re)open it.
            console.log('[gis][forma] switching to 2D Map (MapLibre cream draw map).');
            disposeFormaAnalysis(); // FORMA.5 — clean up analysis chrome on exit.
            if (_gisActive) toggleGIS(false);
            if (!map2dHandle) startBoundaryDraw();
        }
        refreshFormaButtons();
    };

    const mountFormaViewToggle = (initial: FormaViewMode = 'plan'): void => {
        const viewport = document.getElementById('container');
        if (!viewport) {
            console.error('[gis][forma] mountFormaViewToggle: #container not found');
            return;
        }
        if (viewport.style.position !== 'absolute' && viewport.style.position !== 'relative') {
            viewport.style.position = 'relative';
        }
        if (formaToggle?.parentElement) formaToggle.parentElement.removeChild(formaToggle);
        // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — the Forma view is NO LONGER a rival
        // bar that hides/replaces the segmented switch. Guarantee the ONE top-level
        // switch (◧ 3D + plan · ◉ 3D globe · ◉ 3D Site) is present + light up the
        // "3D Site" segment, then mount THIS bar as a SECONDARY contextual sub-bar
        // BELOW it. So the user always sees which of the three views is active AND can
        // swap freely from the switch above — no "‹ Views" dead-end, no covering.
        // (Supersedes §FORMA-TOGGLE-EXCLUSIVE, which hid the switch + added a back
        // button that vanished the whole panel when the switch had never been mounted
        // — the launcher path; that was the L-166 "clicking Views hides the panel" bug.)
        ensureResultToggle();
        activeSegment = 'forma';
        refreshResultButtons();

        const bar = document.createElement('div');
        bar.className = 'pryzm-forma-view-toggle';
        bar.setAttribute('data-testid', 'forma-view-toggle');
        Object.assign(bar.style, {
            // §A.10.h (founder) — CENTRED over the 3D view + width-adaptive (left:50%
            // + translateX(-50%)). §FIX-VIEWMODE-BAR-CONSOLIDATE — sits at top:108px, a
            // row BELOW the always-visible segmented switch (top:64px), as its secondary
            // contextual actions (no overlap, C06 §7 no-overlap intent). zIndex 31 keeps
            // it above the Cesium canvas, matching the switch's own stacking.
            position: 'absolute', top: '108px', left: '50%', transform: 'translateX(-50%)',
            zIndex: '31', display: 'flex', gap: '4px', padding: '4px',
            background: '#ffffff', borderRadius: '10px',
            boxShadow: '0 4px 18px rgba(20,10,60,0.18)', border: '1px solid #ece7fb',
            font: '600 12px/1 system-ui, sans-serif',
            whiteSpace: 'nowrap',
        } satisfies Partial<CSSStyleDeclaration>);

        const mkBtn = (mode: FormaViewMode, label: string, title: string): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pryzm-forma-view-btn';
            b.setAttribute('data-forma-mode', mode);
            b.textContent = label;
            b.title = title;
            Object.assign(b.style, {
                appearance: 'none', border: 'none', cursor: 'pointer',
                padding: '7px 14px', borderRadius: '7px', color: '#6600FF',
                background: 'transparent', font: 'inherit',
            } satisfies Partial<CSSStyleDeclaration>);
            b.addEventListener('mouseenter', () => { if (formaViewMode !== mode) b.style.background = '#f4f0ff'; });
            b.addEventListener('mouseleave', () => { if (formaViewMode !== mode) b.style.background = 'transparent'; });
            b.addEventListener('click', () => applyFormaView(mode));
            return b;
        };
        // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — a muted, non-interactive label so the
        // secondary bar reads as the "3D Site" view's OWN contextual actions (the user
        // returns to another view via the always-present segmented switch above, not a
        // back button). Replaces the old "‹ Views" back button (which dead-ended the
        // panel when the switch had never been mounted).
        const ctxLabel = document.createElement('span');
        ctxLabel.className = 'pryzm-forma-view-ctxlabel';
        ctxLabel.textContent = '3D Site';
        Object.assign(ctxLabel.style, {
            padding: '7px 10px 7px 4px', color: '#9b8fc7', font: 'inherit',
            borderRight: '1px solid #ece7fb', alignSelf: 'center', userSelect: 'none',
        } satisfies Partial<CSSStyleDeclaration>);
        bar.appendChild(ctxLabel);

        // FORMA-PLAN-OBLIQUE — 3-way group: [ 2D Map ] [ Plan ] [ 3D ]. "2D Map"
        // is the MapLibre exit (boundary drawing); "Plan" + "3D" are the Cesium-
        // Forma canvas at different pitches (plan-oblique vs NW oblique).
        formaMap2dBtn = mkBtn('map2d', '▦ 2D Map', 'Drop to the 2D draw map (MapLibre) to draw or edit the boundary');
        formaPlanBtn = mkBtn('plan', '◳ Plan', 'Forma plan-oblique — near-top-down shadowed massing (the Forma signature look)');
        formaThreeBtn = mkBtn('3d', '◉ 3D', 'Forma 3D — NW oblique massing study (depth view)');
        bar.appendChild(formaMap2dBtn);
        bar.appendChild(formaPlanBtn);
        bar.appendChild(formaThreeBtn);

        // "Zoom to Site" / reset affordance — repeats the flyTo for the active
        // Cesium preset (plan-oblique while in Plan, NW oblique while in 3D).
        const zoomBtn = document.createElement('button');
        zoomBtn.type = 'button';
        zoomBtn.className = 'pryzm-forma-zoom-btn';
        zoomBtn.setAttribute('data-testid', 'forma-zoom-to-site');
        zoomBtn.title = 'Zoom to site (re-frames the active Forma preset)';
        zoomBtn.textContent = '⤢ Zoom to Site';
        Object.assign(zoomBtn.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
        } satisfies Partial<CSSStyleDeclaration>);
        zoomBtn.addEventListener('mouseenter', () => { zoomBtn.style.background = '#f4f0ff'; });
        zoomBtn.addEventListener('mouseleave', () => { zoomBtn.style.background = 'transparent'; });
        zoomBtn.addEventListener('click', () => {
            if (formaViewMode === 'plan') cesiumViewport?.flyToFormaPlan?.();
            else cesiumViewport?.flyToFormaSite?.();
        });
        bar.appendChild(zoomBtn);

        // SITE-PANEL-UI — toggle the FORMA.5 site-analysis panel (sun/shadow ·
        // weather · wind rose · 3D overlays) open/closed. The panel is mounted by
        // mountFormaAnalysis() on Forma Plan/3D entry; this button + the panel's own
        // ✕ are the user show/hide controls. State persists across view re-mounts via
        // FormaSiteAnalysisControls._userHidden.
        const analysisBtn = document.createElement('button');
        analysisBtn.type = 'button';
        analysisBtn.className = 'pryzm-forma-analysis-toggle';
        analysisBtn.setAttribute('data-testid', 'forma-analysis-toggle');
        analysisBtn.title = 'Show / hide the site-analysis panel (sun · weather · wind)';
        analysisBtn.textContent = '☀ Analysis';
        Object.assign(analysisBtn.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
        } satisfies Partial<CSSStyleDeclaration>);
        const paintAnalysisBtn = (): void => {
            const on = !!formaAnalysis?.isVisible();
            analysisBtn.style.background = on ? '#6600FF' : 'transparent';
            analysisBtn.style.color = on ? '#ffffff' : '#6600FF';
        };
        analysisBtn.addEventListener('mouseenter', () => { if (!formaAnalysis?.isVisible()) analysisBtn.style.background = '#f4f0ff'; });
        analysisBtn.addEventListener('mouseleave', () => { paintAnalysisBtn(); });
        analysisBtn.addEventListener('click', () => {
            // The panel only exists in Forma Plan/3D. If it isn't mounted (e.g. on
            // 2D Map), bring up the Forma view first, which mounts it.
            if (!formaAnalysis) { applyFormaView('plan'); }
            else { formaAnalysis.toggle(); }
            paintAnalysisBtn();
        });
        bar.appendChild(analysisBtn);

        // FORMA.6 — building-fidelity toggle: [ ◉ Real ] [ ▢ Massing ]. "Real" (the
        // default, founder's ask) places the live PRYZM model (full elements:
        // windows/doors/roof/furniture/stairs) via the glTF bridge; "Massing" shows
        // the abstract pastel volume study. Flipping it re-renders in place (no
        // re-fly). Repainted by refreshFormaFidelityButton() when state changes.
        const mkFidelityBtn = (
            fidelity: 'real' | 'massing',
            label: string,
            title: string,
            leftBorder: boolean,
        ): HTMLButtonElement => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pryzm-forma-fidelity-btn';
            b.setAttribute('data-forma-fidelity', fidelity);
            b.setAttribute('data-testid', `forma-fidelity-${fidelity}`);
            b.textContent = label;
            b.title = title;
            Object.assign(b.style, {
                appearance: 'none', border: 'none', cursor: 'pointer',
                padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
                background: 'transparent', font: 'inherit',
                borderLeft: leftBorder ? '1px solid #ece7fb' : 'none',
            } satisfies Partial<CSSStyleDeclaration>);
            b.addEventListener('mouseenter', () => { if (formaBuildingFidelity !== fidelity) b.style.background = '#f4f0ff'; });
            b.addEventListener('mouseleave', () => { refreshFormaFidelityButtons(); });
            b.addEventListener('click', () => { setFormaBuildingFidelity(fidelity); refreshFormaFidelityButtons(); });
            return b;
        };
        const realBtn = mkFidelityBtn('real', '◉ Real', 'Show the real PRYZM building with full elements (windows · doors · roof · furniture)', true);
        const massingBtn = mkFidelityBtn('massing', '▢ Massing', 'Show the abstract Forma massing study (white/pastel volumes)', false);
        refreshFormaFidelityButtons = (): void => {
            for (const [b, f] of [[realBtn, 'real'], [massingBtn, 'massing']] as const) {
                const on = formaBuildingFidelity === f;
                b.style.background = on ? '#6600FF' : 'transparent';
                b.style.color = on ? '#ffffff' : '#6600FF';
            }
        };
        refreshFormaFidelityButtons();
        bar.appendChild(realBtn);
        bar.appendChild(massingBtn);

        // §A.21.D24 — Floors selector. A compact <select> populated from the REAL
        // storeys of the placed massing (CesiumViewport.getFormaStoreyBands()).
        // "All floors" (default) shows every storey stacked at its true elevation;
        // picking a single floor isolates it. Hidden until ≥2 storeys exist (a
        // single-storey house / apartment has nothing to choose). Rebuilt after
        // each massing render via refreshFormaFloorSelector().
        const floorSel = document.createElement('select');
        floorSel.className = 'pryzm-forma-floor-select';
        floorSel.setAttribute('data-testid', 'forma-floor-select');
        floorSel.title = 'Choose which floor(s) to show on the globe';
        Object.assign(floorSel.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 12px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
            display: 'none', // shown by refreshFormaFloorSelector when ≥2 storeys.
        } satisfies Partial<CSSStyleDeclaration>);
        floorSel.addEventListener('change', () => {
            const v = floorSel.value;
            if (v === 'all') cesiumViewport?.setVisibleFormaLevels?.(null);
            else cesiumViewport?.setVisibleFormaLevels?.([Number(v)]);
            console.log(`[gis][forma] floor selector → ${v === 'all' ? 'ALL floors' : `floor ${v}`}.`);
        });
        bar.appendChild(floorSel);
        formaFloorSelect = floorSel;

        viewport.appendChild(bar);
        formaToggle = bar;
        console.log(`[gis][forma] view toggle mounted (initial "${initial}").`);
        applyFormaView(initial);
    };

    const removeFormaViewToggle = (): void => {
        const wasMounted = formaToggle !== null;
        disposeFormaAnalysis(); // FORMA.5 — tear down analysis chrome with the toggle.
        if (formaToggle?.parentElement) formaToggle.parentElement.removeChild(formaToggle);
        formaToggle = null;
        // §FIX-VIEWMODE-BAR-CONSOLIDATE (L-166) — the segmented switch stays mounted
        // (it was never hidden), so there is nothing to "restore". If we were on the
        // "3D Site" segment, drop back to the underlying 2D/3D segment so the switch
        // no longer shows a Forma sub-bar as active. Guard on wasMounted so calling
        // this while already on a 2D/3D segment doesn't clobber that paint.
        if (wasMounted && activeSegment === 'forma') {
            activeSegment = resultViewMode;
            refreshResultButtons();
        }
        formaMap2dBtn = null;
        formaPlanBtn = null;
        formaThreeBtn = null;
        formaFloorSelect = null;
    };

    // ════════════════════════════════════════════════════════════════════════
    // FORMA.4 — live-update: re-place the massing on boundary/layout edits (§4.6)
    // ════════════════════════════════════════════════════════════════════════
    //
    // The drawn boundary AND the authored apartment massing change AFTER the 3D
    // view is up: the user commits a parcel (`site.parcel-boundary-set`) or the
    // generator authors walls/doors (`apartment.layout-executed`). On either, we
    // clear + re-place the Cesium entities from fresh PRYZM domain state.
    //
    // NO-RE-FLY GUARANTEE (task #2): live updates call renderFormaMassing(FALSE)
    // — the camera never moves. Only the explicit 3D-activation (applyFormaView
    // '3d') and the "Zoom to Site" button fly. The user stays at their current
    // viewpoint and watches the massing update in place. Terrain is re-sampled
    // by CesiumViewport ONLY when the centroid moves.
    //
    // Guard: only re-render when Cesium is mounted + a Cesium-Forma view (plan
    // OR 3d) is the active mode (no point rebuilding entities the user isn't
    // looking at; they get rebuilt on the next Cesium activation anyway, which
    // reads live state). The 2D-map mode is skipped.
    const liveUpdateFormaMassing = (source: string): void => {
        if (!cesiumViewport?.renderFormaMassing) return; // Cesium not mounted yet.
        // §L-412 (C59 Phase 1b) — pane-aware gate. In the single-view world the guard
        // skips the re-render when the user is on the 2D map (`formaViewMode==='map2d'`)
        // because Cesium isn't visible. But in the site-authoring SPLIT the 2D map is in
        // the LEFT pane while the 3D Site (Cesium) is LIVE in its OWN right pane — so a
        // draw/select on the left MUST re-render the boundary + envelope on the right
        // (the founder's live side-by-side). When the 3D Site is hosted in a pane the
        // gate therefore fires regardless of `formaViewMode` (the paned 3D Site is NOT
        // map2d — the pure model owns which view each pane holds).
        const site3dPaned =
            !!siteAuthoringPanes &&
            !siteAuthoringPanes.isDisposed &&
            siteAuthoringPanes.controller.hostsView('site-3d');
        if (formaViewMode === 'map2d' && !site3dPaned) return; // not looking at Cesium.
        // §L-412 (Req 2) — the FIRST parcel-boundary commit into the paned 3D Site frames
        // the plot ONCE (the pane opens at whole-city scale). Use the existing framing
        // primitive (renderFormaMassing(true) → §GLOBE-FIT-BUILDING flyToBoundingSphere);
        // every subsequent update (zoning recompute, layout edits) falls back to the
        // no-re-fly path below so continuous edits never yank the camera.
        if (shouldFramePanedSiteOnUpdate({ source, site3dPaned, alreadyFramed: siteAuthoringPaneFramed })) {
            siteAuthoringPaneFramed = true;
            console.log(
                `[gis][forma] live-update (${source}) → FIRST paned commit: framing the 3D Site to the plot (one-shot fly).`,
            );
            renderFormaMassing(true);
            return;
        }
        console.log(
            `[gis][forma] live-update (${source}) → re-placing massing (no re-fly)` +
            `${site3dPaned ? ' [paned 3D Site]' : ''}.`,
        );
        renderFormaMassing(false);
    };

    const formaLiveUpdateDisposers: Array<() => void> = [];
    const subscribeFormaLiveUpdate = (): void => {
        const events = runtime?.events;
        if (!events || formaLiveUpdateDisposers.length > 0) return;
        // §A.21.D34(d) — FURNITURE-0 TIMING FIX. The generation chain is
        // apartment → CEIL → furnish → light (see runtime types.ts +
        // MEMORY d-ce-deterministic-ceiling-engine). The Forma massing previously
        // only re-rendered on `apartment.layout-executed`, which fires BEFORE the
        // furnish/ceiling/lighting passes — so when the Forma reader pulled the
        // furniture store at that moment it was STILL EMPTY → "0 furniture again".
        // Subscribe to the DOWNSTREAM completion events too so the massing
        // re-renders (reading the stores FRESH each time — getFormaFurniture pulls
        // live) once furniture/ceilings/lights actually exist. renderFormaMassing
        // is idempotent (clearFormaMassing first), so the extra re-renders are safe.
        for (const evt of [
            'site.parcel-boundary-set',
            // C58 (L-402b) — re-render once the buildable envelope is computed +
            // cached (dispatched just AFTER parcel-boundary-set). renderFormaMassing
            // is idempotent (clearFormaMassing first), so this extra pass is safe
            // and mirrors the furniture-timing fix below.
            'site.zoning-updated',
            'apartment.layout-executed',
            'ceiling.layout-executed',
            'furnish.layout-executed',
            'lighting.layout-executed',
        ] as const) {
            try {
                const sub = events.on(evt, () => liveUpdateFormaMassing(evt));
                // EventSubscription is callable-as-disposer.
                formaLiveUpdateDisposers.push(() => { try { sub(); } catch { /* gone */ } });
            } catch (e) {
                console.warn(`[gis][forma] live-update subscribe to ${evt} failed:`, e);
            }
        }
        console.log('[gis][forma] live-update subscribed: site.parcel-boundary-set + apartment/ceiling/furnish/lighting.layout-executed (furniture-timing fix).');
    };
    // Subscribe eagerly so an edit made before the user ever opens 3D is still
    // reflected the next time 3D is shown (the guard short-circuits when not 3D).
    subscribeFormaLiveUpdate();

    // §A.10.g (2026-06-05) — AUTO-LOAD climate the moment a site location is set,
    // NOT only when the Forma view opens. The bundled regional default ingests
    // instantly (offline), so the climate card + wind rose are populated by the
    // time the user opens the climate card. Live measured normals upgrade in the
    // background. once-guarded (the first location set per session is enough; the
    // command is idempotent / skipIfPresent anyway).
    let _climateAutoLoaded = false;
    const ensureClimateNow = (): void => {
        if (_climateAutoLoaded) return;
        _climateAutoLoaded = true;
        import('../climate/ensureSiteClimate')
            .then(({ ensureSiteClimate }) => ensureSiteClimate(runtime ?? null))
            .catch((e) => console.warn('[gis] auto climate-load failed:', e));
    };
    try {
        const csub = runtime?.events?.on('site.location-changed', () => ensureClimateNow());
        if (csub) formaLiveUpdateDisposers.push(() => { try { csub(); } catch { /* gone */ } });
        // If a location is already set (e.g. returning to an existing project), load now.
        const existing = getFormaOrigin();
        if (existing && (existing.lat !== 0 || existing.lon !== 0)) ensureClimateNow();
    } catch (e) {
        console.warn('[gis] climate auto-load subscribe failed:', e);
    }
    window.pryzmDisposeFormaLiveUpdate = () => {
        for (const d of formaLiveUpdateDisposers.splice(0)) d();
    };

    // FORMA.4 — on-demand re-render hook (console + programmatic). `frame` flies
    // the NW oblique camera; live-update callers pass false (no re-fly).
    window.pryzmRenderFormaMassing = (frame?: boolean) => renderFormaMassing(frame ?? false);
    // FORMA.6 — toggle the Forma study building fidelity. 'real' (default) re-exports
    // the live BIM scene → glTF and places it; 'massing' drops the model + re-shows
    // the abstract pastel volumes. Syncs both the local flag AND the viewport flag,
    // then re-renders (no re-fly) so the switch is immediate.
    const setFormaBuildingFidelity = (fidelity: 'massing' | 'real'): void => {
        if (fidelity !== 'massing' && fidelity !== 'real') {
            console.warn(`[gis][forma6] setFormaBuildingFidelity: bad value ${String(fidelity)} — ignored.`);
            return;
        }
        formaBuildingFidelity = fidelity;
        if (fidelity === 'real') {
            formaRealLastSig = null; // force a re-export on next place.
        } else {
            formaRealPlaced = false; // model is dropped by the viewport on 'massing'.
        }
        cesiumViewport?.setFormaBuildingFidelity?.(fidelity);
        refreshFormaFidelityButtons();
        console.log(`[gis][forma6] Forma building fidelity → ${fidelity}.`);
        // Re-render the current massing (no re-fly); when 'real' this re-places the
        // model, when 'massing' the viewport already re-showed the blocks.
        if (cesiumViewport?.renderFormaMassing && formaViewMode !== 'map2d') {
            renderFormaMassing(false);
        }
    };
    window.pryzmSetFormaBuildingFidelity = setFormaBuildingFidelity;
    // FORMA.3 / FORMA-PLAN-OBLIQUE — mount the [2D Map][Plan][3D] toggle. Defaults
    // to the Forma PLAN-oblique (the signature look — near-top-down shadowed
    // massing) so the demo lands straight on the Forma "plan view". Mirrors
    // pryzmShowSiteResultView. Accepts 'map2d' | 'plan' | '3d'.
    window.pryzmShowFormaView = (initial?: 'map2d' | 'plan' | '3d') => mountFormaViewToggle(initial ?? 'plan');
    window.pryzmHideFormaView = () => removeFormaViewToggle();

    // §FEAT-SITE-VIEW-ALWAYS-ON (L-40, ADR-0114) — the 3D globe / 3D site view must be
    // reachable from ANY 3D view, at all times. Root cause of the founder's report: the
    // ONLY UI entry was the buried GIS-rail "3D Site" button, whose handler dead-ended
    // ("GIS area not mounted yet") when `pryzmShowFormaView` wasn't defined. This global
    // is a stable, self-bootstrapping entry (mountFormaViewToggle → applyFormaView →
    // engageFormaCesium → toggleGIS(true) mounts Cesium on demand, centred on a sensible
    // default even with NO site), plus an always-present floating launcher on the 3D
    // viewport so the user never has to hunt for it.
    window.pryzmEnterSiteView = (initial?: 'map2d' | 'plan' | '3d') => {
        try {
            mountFormaViewToggle(initial ?? 'plan');
        } catch (e) {
            console.error('[gis][site-view] pryzmEnterSiteView failed:', e);
        }
    };
    // §FEAT-PLAN-VIEW-GIS (L-104, ADR-0115) — the PLAN-VIEW analogue of pryzmEnterSiteView.
    // Switch to the orthographic Top (plan) view and composite the real-world GIS/aerial
    // context UNDER the authored building, rotated onto PROJECT NORTH. REUSE (no new engine):
    //   • the building "projected to plan" IS the BIM Top view (activateView('Top') →
    //     ViewController orthographic camera, C04);
    //   • the GIS context is a plan-canvas underlay built from ESRI World Imagery tiles
    //     (buildSiteGisContextRaster) placed via the EXISTING L-71 pipeline
    //     (createPlanCanvasUnderlayFromSiteOverlay), centred on the site origin;
    //   • project north is applied as the underlay mesh rotationZ = θ
    //     (computeGisContextUnderlayRotationZ, from SiteLocation.trueNorth — ADR-0115 dual
    //     north; θ = 0 ⇒ identity, so a north-aligned site is byte-identical to today).
    // Degrades gracefully: no site origin ⇒ just the plan view (building only, no context);
    // imagery/canvas failure ⇒ toast + building only. Never throws into the caller.
    const enterPlanViewGis = async (): Promise<void> => {
        try {
            const origin = getFormaOrigin();
            // θ = project→true-north (radians) from the model; 0 (identity) when unset.
            let theta = 0;
            const loc = (runtime?.siteModelStore as
                | { getSite?: () => { location?: { trueNorth?: number } } | null }
                | undefined)?.getSite?.()?.location;
            if (loc && typeof loc.trueNorth === 'number' && Number.isFinite(loc.trueNorth)) {
                theta = loc.trueNorth;
            }

            // Orthographic plan view — activateView exits GIS first, then routes through the
            // ViewController so the TSL pipeline rebuilds against the orthographic camera.
            await activateView('Top');

            if (!origin) {
                runtime?.events?.emit('pryzm:toast', {
                    message: 'Plan view ready. Set a site location to show the real-world context underneath.',
                    severity: 'info',
                });
                console.log('[gis][plan-gis] no site origin — plan view without GIS context underlay.');
                return;
            }

            runtime?.events?.emit('pryzm:toast', { message: 'Loading site GIS context…', severity: 'info' });
            const raster = await buildSiteGisContextRaster({ centerLat: origin.lat, centerLon: origin.lon });
            if (!raster) {
                runtime?.events?.emit('pryzm:toast', {
                    message: 'Could not load the GIS context imagery — showing the building only.',
                    severity: 'error',
                });
                return;
            }

            const ok = await createPlanCanvasUnderlayFromSiteOverlay({
                dataUrl: raster.dataUrl,
                fileName: 'Site GIS context',
                widthPx: raster.widthPx,
                heightPx: raster.heightPx,
                pxPerMeter: raster.pxPerMeter,
                // Composite is centred on the site origin (= scene origin) → E/N = 0.
                positionEast: 0,
                positionNorth: 0,
                // True-north imagery → project frame: rotationZ = θ (ADR-0115 dual north).
                rotationZ: computeGisContextUnderlayRotationZ(theta),
            });

            // Frame the plan on the building + context (best-effort).
            try { await props._viewController?.zoomToFit?.(); } catch { /* non-fatal */ }

            if (ok) {
                runtime?.events?.emit('pryzm:toast', {
                    message: 'Plan view on real-world GIS context (project north).',
                    severity: 'success',
                });
                console.log('[gis][plan-gis] plan-view GIS context underlay placed on project north (§FEAT-PLAN-VIEW-GIS).');
            }
        } catch (e) {
            console.error('[gis][plan-gis] enterPlanViewGis failed:', e);
        }
    };
    // Stable typed global entry (mirrors pryzmEnterSiteView) so any 3D/plan surface can open
    // the plan-view GIS context, registered at boot regardless of geospatial activation state.
    window.pryzmEnterPlanViewGis = () => { void enterPlanViewGis(); };

    const mountSiteViewLauncher = (): void => {
        try {
            const viewport = document.getElementById('container');
            if (!viewport) return;
            if (document.getElementById('pryzm-site-view-launcher')) return; // idempotent
            if (viewport.style.position !== 'absolute' && viewport.style.position !== 'relative') {
                viewport.style.position = 'relative';
            }
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'pryzm-site-view-launcher';
            btn.setAttribute('data-testid', 'site-view-launcher');
            btn.textContent = '◉ 3D Site / Globe';
            btn.title = 'Open the 3D site / globe view (true north + geolocation). Works from any 3D view.';
            // §FIX-UI-LAYERING-ZINDEX-CONTRACT (L-149, C06 §7) — ROOT-CAUSE FIX for the
            // founder's "launcher renders BELOW / overlapping other UI". The pill was
            // `position:absolute` inside `#container` at `zIndex:'20'`; since #container
            // (z:auto in BIM view) does not create a stacking context, the pill competed
            // at ROOT and lost to every chrome sibling (toolbar 9000, nav rail 9999),
            // so it painted underneath them. It is now `position:fixed` (escapes the
            // #container trap + Cesium's raised container z:15 + the overflow:hidden clip)
            // at the shared `launcher` layer (10000 — above canvas + panels + rails +
            // toolbar, below popovers/menus/modals/toasts/spinner), in the declared
            // collision-free bottom-left launcher rail (slot 0). Appended to <body> so
            // the fixed pill is never re-parented under a transformed ancestor.
            // (History: L-103 docked it to bottom:48/left:10 absolute — deliberate corner,
            // but still z-trapped; L-149 keeps the corner intent, fixes the stacking.)
            Object.assign(btn.style, {
                ...launcherRailStyle('siteView'),
                appearance: 'none', cursor: 'pointer',
                padding: '7px 12px', borderRadius: '9px',
                border: '1px solid #6600FF', background: '#ffffff', color: '#6600FF',
                font: '600 12px/1 system-ui, sans-serif',
                boxShadow: '0 3px 12px rgba(20,10,60,0.16)',
            } satisfies Partial<CSSStyleDeclaration>);
            btn.addEventListener('mouseenter', () => { btn.style.background = '#f4f0ff'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = '#ffffff'; });
            btn.addEventListener('click', () => window.pryzmEnterSiteView?.('plan'));
            document.body.appendChild(btn);
            console.log('[gis][site-view] always-on 3D Site launcher mounted (L-40, C06 §7 launcher layer).');

            // §FEAT-PLAN-VIEW-GIS (L-104) — the PLAN-VIEW companion launcher, stacked in the
            // SAME bottom-left corner column just ABOVE the 3D Site pill (bottom:48px) — so the
            // two site entries read as a deliberate pair: "◉ 3D Site / Globe" (3D) + "▦ Plan +
            // Site" (orthographic plan on real-world GIS context, project north). Always-on,
            // idempotent, brand-styled (white + #6600FF), no overlap with the GPU toggle.
            if (!document.getElementById('pryzm-plan-gis-launcher')) {
                const planBtn = document.createElement('button');
                planBtn.type = 'button';
                planBtn.id = 'pryzm-plan-gis-launcher';
                planBtn.setAttribute('data-testid', 'plan-gis-launcher');
                planBtn.textContent = '▦ Plan + Site';
                planBtn.title = 'Open the plan view on the real-world GIS context (project north, orthographic). Works from any view.';
                // §FIX-UI-LAYERING-ZINDEX-CONTRACT (L-149, C06 §7) — launcher rail slot 1
                // (directly above the "3D Site" pill). Same fixed / launcher-layer fix as
                // slot 0; the two GIS site pills now form a clean pair at the bottom of the
                // rail, with the graph pills (slots 2–3) stacked above — no interleaving.
                Object.assign(planBtn.style, {
                    ...launcherRailStyle('planGis'),
                    appearance: 'none', cursor: 'pointer',
                    padding: '7px 12px', borderRadius: '9px',
                    border: '1px solid #6600FF', background: '#ffffff', color: '#6600FF',
                    font: '600 12px/1 system-ui, sans-serif',
                    boxShadow: '0 3px 12px rgba(20,10,60,0.16)',
                } satisfies Partial<CSSStyleDeclaration>);
                planBtn.addEventListener('mouseenter', () => { planBtn.style.background = '#f4f0ff'; });
                planBtn.addEventListener('mouseleave', () => { planBtn.style.background = '#ffffff'; });
                planBtn.addEventListener('click', () => { void window.pryzmEnterPlanViewGis?.(); });
                document.body.appendChild(planBtn);
                console.log('[gis][plan-gis] always-on Plan + Site (GIS) launcher mounted (L-104, C06 §7 launcher layer).');
            }
        } catch (e) {
            console.warn('[gis][site-view] launcher mount failed (non-fatal):', e);
        }
    };
    mountSiteViewLauncher();

    // ════════════════════════════════════════════════════════════════════════
    // §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — the site-authoring split.
    //
    // Lands the founder default directly: LEFT pane = the 2D site map (draw/select),
    // RIGHT pane = the LIVE 3D Site (boundary + buildable envelope), assigned through
    // the pure `assignViewToPane` model (`siteAuthoringDefaultLayout()`), NOT a
    // hard-coded toggle. The SINGLE Cesium viewer is RE-TARGETED into the right pane
    // element (`reparentContainerTo` — never cloned / never a second device); the
    // MapLibre 2D map mounts into the left pane element. A draw/select on the LEFT
    // re-renders the boundary + envelope LIVE on the RIGHT via the pane-aware
    // `renderFormaMassing(false)` no-re-fly path — no "Not now → hunt the 3D button"
    // dance. Single rAF (P3): neither renderer spins a new loop — Cesium keeps its
    // request-render mode, the map its own; the host only re-parents + reflows.
    // ════════════════════════════════════════════════════════════════════════
    const mountSiteAuthoringPanes = (): void => {
        if (siteAuthoringPanes && !siteAuthoringPanes.isDisposed) {
            console.log('[gis][panes] §L-412 site-authoring split already mounted.');
            return;
        }
        const container = document.getElementById('container');
        if (!container) {
            console.error('[gis][panes] §L-412 #container not found — cannot mount the split.');
            return;
        }
        // Close any single-pane 2D-map overlay first — it re-opens INTO the left pane.
        if (map2dHandle) { try { map2dHandle.dispose(); } catch { /* gone */ } map2dHandle = null; }

        // §L-412 (Req 1) — the site-authoring split OWNS the screen: EXACTLY two panes
        // (2D map LEFT · 3D Site RIGHT). Suppress the legacy SplitViewManager Canvas2D
        // plan pane's project-load AUTO-open (and deactivate it if the idle callback
        // already opened it) so the redundant plan pane is NOT shown before any walls
        // exist. `suppressAutoOpen()` gates only the auto-open — the plan pane re-opens
        // for the BIM authoring stage via applyBimDualPane once site authoring ends.
        try {
            const svp = window.splitViewManager as
                | { suppressAutoOpen?: () => void } | undefined;
            svp?.suppressAutoOpen?.();
        } catch (e) {
            console.warn('[gis][panes] §L-412 SVP suppressAutoOpen failed (non-fatal):', e);
        }
        // §L-412 (Req 2) — fresh mount → the pane has not been framed yet; the first
        // parcel commit (or an already-committed boundary below) will frame it once.
        siteAuthoringPaneFramed = false;

        const shell = mountSiteAuthoringPaneShell({ parent: container, initialLeftFraction: 0.5 });
        siteAuthoringPanes = shell;

        // ── MapLibre mounter (LEFT pane) — the 2D draw/select surface ──
        const mapMounter: PaneRendererMounter = {
            rendererKind: 'maplibre',
            mount: (paneEl) => { startBoundaryDraw({ parent: paneEl }); },
            unmount: () => { if (map2dHandle) { try { map2dHandle.dispose(); } catch { /* gone */ } map2dHandle = null; } },
            // MapLibre auto-reflows via its own ResizeObserver (trackResize:true).
            resize: () => { /* auto */ },
        };

        // ── Cesium mounter (RIGHT pane) — the ONE 3D Site viewer, RE-TARGETED ──
        const cesiumMounter: PaneRendererMounter = {
            rendererKind: 'cesium',
            mount: async (paneEl) => {
                // Ensure the single Cesium viewer is constructed + visible. toggleGIS
                // mounts it lazily into #container on first use; we then MOVE its one
                // container node into the right pane (no second viewer). Suppress the
                // re-activation self-place (we render our own massing below).
                gisReactivationSelfPlaceSuppressed = true;
                try { toggleGIS(true); }
                catch (e) { console.error('[gis][panes] toggleGIS threw:', e); }
                finally { gisReactivationSelfPlaceSuppressed = false; }
                await awaitCesiumReady();
                if (!cesiumViewport) {
                    console.warn('[gis][panes] Cesium never constructed — right pane empty.');
                    return;
                }
                // RE-TARGET the single #cesium-viewport-container into the RIGHT pane.
                cesiumViewport.reparentContainerTo?.(paneEl);
                cesiumViewport.setVisible?.(true);
                cesiumViewport.reparentContainerTo?.(paneEl); // reflow now it is visible.
                // Force the Forma massing-study look + render the boundary/envelope in
                // place (no re-fly). The pane-aware live-update keeps it fresh on draw.
                cesiumViewport.setFormaMode?.(true);
                window.pryzmSetCesiumFormaMode?.(true);
                formaViewMode = '3d';
                // §L-412 (Req 2) — if a boundary is ALREADY committed (re-entering site
                // authoring with an existing plot), FRAME the pane to it ONCE now so the
                // user lands on THEIR plot, not the whole city; otherwise render the
                // (empty) scene in place and let the first parcel commit frame it. Either
                // way exactly one frame — subsequent live-updates use the no-re-fly path.
                if (!siteAuthoringPaneFramed && !!getFormaBoundary()) {
                    siteAuthoringPaneFramed = true;
                    renderFormaMassing(true);
                } else {
                    renderFormaMassing(false);
                }
                mountFormaAnalysis();
            },
            unmount: () => {
                // Re-home the single viewer back to #container + hide it (never disposed).
                const host = document.getElementById('container');
                if (host) { try { cesiumViewport?.reparentContainerTo?.(host); } catch { /* gone */ } }
                try { cesiumViewport?.setVisible?.(false); } catch { /* gone */ }
            },
            resize: () => { try { cesiumViewport?.reflowContainer?.(); } catch { /* gone */ } },
        };

        shell.controller.registerMounter(mapMounter);
        shell.controller.registerMounter(cesiumMounter);

        // Apply the founder default THROUGH the pure model (left=2d-map, right=3d-site).
        const layout = siteAuthoringDefaultLayout();
        try {
            const r = shell.controller.applyLayout(layout);
            if (r instanceof Promise) r.catch((err) => console.error('[gis][panes] applyLayout (async) failed:', err));
        } catch (err) {
            console.error('[gis][panes] applyLayout failed — tearing the split down:', err);
            unmountSiteAuthoringPanes();
            return;
        }
        console.log(
            '[gis][panes] §L-412 site-authoring split mounted — LEFT 2D map · RIGHT live 3D Site ' +
            '(single Cesium re-targeted; envelope live on draw/select).',
        );
    };

    /** Tear the split down: unmounts both renderers (Cesium re-homes to #container +
     *  hides; the map disposes) and removes the pane DOM. Idempotent. */
    const unmountSiteAuthoringPanes = (): void => {
        if (!siteAuthoringPanes) return;
        try { siteAuthoringPanes.dispose(); } catch (e) { console.warn('[gis][panes] dispose failed:', e); }
        siteAuthoringPanes = null;
        siteAuthoringPaneFramed = false;
        // §L-412 (Req 1) — site authoring ended: re-allow the legacy plan pane's
        // project-load auto-open for the BIM authoring stage (applyBimDualPane also
        // explicitly re-activates the plan pane at generate-time). We do NOT re-open it
        // here — only lift the suppression so the normal editor layout can return.
        try {
            const svp = window.splitViewManager as
                | { allowAutoOpen?: () => void } | undefined;
            svp?.allowAutoOpen?.();
        } catch (e) {
            console.warn('[gis][panes] §L-412 SVP allowAutoOpen failed (non-fatal):', e);
        }
        // Re-home the envelope card onto #container (getForma3dHostEl now returns it).
        try { refreshEnvelopePanel(); } catch { /* best-effort */ }
    };

    // O.2 / §L-412 — programmatic entry to the site-authoring split. The onboarding
    // site step + the GIS-rail launcher call this so entering the site lands directly
    // in 2D-left / 3D-right (the "Generate house?" confirm stays a SEPARATE choice,
    // never a blocker to seeing the site). Registered globally (typed in globals.d.ts).
    window.pryzmMountSiteAuthoringPanes = () => {
        try { mountSiteAuthoringPanes(); }
        catch (e) { console.error('[gis][panes] pryzmMountSiteAuthoringPanes failed:', e); }
    };
    window.pryzmUnmountSiteAuthoringPanes = () => {
        try { unmountSiteAuthoringPanes(); }
        catch (e) { console.error('[gis][panes] pryzmUnmountSiteAuthoringPanes failed:', e); }
    };

    return { toggleGIS, flyToCremornePoint, placeBimOnEarth, activateView, gizmoMode, startBoundaryDraw, cancelBoundaryDraw };
}
