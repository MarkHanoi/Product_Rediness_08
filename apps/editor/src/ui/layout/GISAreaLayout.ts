import { getCesium } from '@pryzm/core-app-model';
import type { CesiumThreeBridge } from '@pryzm/plugin-geospatial';
import type { UIProps } from '../Layout';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export interface GISCallbacks {
    toggleGIS: (active: boolean) => void;
    flyToCremornePoint: () => Promise<void>;
    placeBimOnEarth: () => Promise<void>;
    activateView: (mode: '3D' | 'Top' | 'Front' | 'Back' | 'Left' | 'Right') => Promise<void>;
    /** Delegate to cesiumViewport.gizmo.setMode(mode) when GIS is active. */
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
    // A.8.a/A.8.c — GIS site-authoring surfaces, created when Cesium mounts.
    let geocodeBox: import('../site/siteGeocodeSearchBox').SiteGeocodeSearchBox | null = null;
    let boundaryTool: import('../geospatial/SiteBoundaryDrawTool').SiteBoundaryDrawTool | null = null;

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

    const startBoundaryDraw = (): void => {
        if (!boundaryTool) {
            console.warn('[gis] boundary-draw: GIS view not mounted yet — activate GIS first.');
            runtime?.events?.emit('pryzm:toast', { message: 'Activate the GIS view first.', severity: 'error' });
            return;
        }
        boundaryTool.start();
    };
    const cancelBoundaryDraw = (): void => {
        boundaryTool?.cancel();
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
                        console.log("GIS: Cesium viewer mounted successfully");
                        const viewer = cesiumViewport.getViewer();
                        if (viewer) {
                            bridge = new CesiumThreeBridge(viewer, props.world);
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
                            // A.8.c — DevTools console entry point (mirrors the
                            // pryzmCreateSiteFromRect / …FromBoundary console flow).
                            window.pryzmStartBoundaryDraw = () => startBoundaryDraw();
                            window.pryzmCancelBoundaryDraw = () => cancelBoundaryDraw();
                            console.log('[gis] site-authoring surfaces ready (geocode search + boundary draw). Run pryzmStartBoundaryDraw() to draw a parcel.');
                        }
                    }
                }).catch((err: any) => {
                    console.error("GIS: Error mounting Cesium viewer:", err);
                });
            } else {
                console.log("GIS: Re-activating existing Cesium viewer");
                // A.8.a — re-show the geocode search box overlay with the GIS view.
                if (geocodeBox) geocodeBox.element.style.display = '';
                if (cesiumViewport) {
                    cesiumViewport.setVisible(true);

                    // 🔄 SYNC UPDATE (Only After Placement Exists)
                    if (isBimPlacedOnEarth) {
                        import('@pryzm/file-format').then(async ({ exportFragmentsToGLB }) => {
                            const url = await exportFragmentsToGLB(props.world.scene.three as any);
                            // Load without flying camera to preserve current view
                            await cesiumViewport.loadBimGltf(url, {}, 1.0, false);
                            console.log("GIS: Sync update completed (no camera fly)");
                        });
                    }
                }
                if (bridge) {
                    bridge.activate();
                }
            }
        } else {
            console.log("GIS: Deactivating geospatial view (preserving state)");

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

    const gizmoMode = (mode: string) => {
        if (cesiumViewport?.gizmo) cesiumViewport.gizmo.setMode(mode);
    };

    // O.2 — onboarding step-controller GIS-activation handoff. The guided
    // first-run flow (OnboardingStepController) has no clean runtime hook to
    // toggle GIS, so expose the SAME window-hook idiom A.8.c established for
    // pryzmStartBoundaryDraw. Registered here (not inside the async Cesium mount)
    // so it works BEFORE Cesium has mounted — calling it kicks off the mount.
    window.pryzmToggleGIS = (active: boolean) => toggleGIS(active);

    return { toggleGIS, flyToCremornePoint, placeBimOnEarth, activateView, gizmoMode, startBoundaryDraw, cancelBoundaryDraw };
}
