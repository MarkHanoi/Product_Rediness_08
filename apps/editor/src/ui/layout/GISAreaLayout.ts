import { getCesium, storeRegistry } from '@pryzm/core-app-model';
import type { CesiumThreeBridge } from '@pryzm/plugin-geospatial';
import type { UIProps } from '../Layout';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { getCurrentSiteOrigin } from '../site/siteDispatch';

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
    // A.8.c.f — the Hektar-style 2D cream/shadow boundary-draw map. This REPLACES
    // the Cesium-3D draw surface for the DRAW step (Cesium stays for 3D render):
    // startBoundaryDraw() opens THIS 2D map; the legacy Cesium `boundaryTool` is
    // retained for the console fallback (pryzmStartBoundaryDraw3D) only.
    let map2dHandle: { dispose: () => void } | null = null;
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
    const startBoundaryDraw = (): void => {
        if (map2dHandle) {
            console.log('[gis] map2d already open');
            return;
        }
        const viewport = document.getElementById('container');
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
        if (map2dHandle) {
            console.log('[gis] map2d: closeBoundaryMap2D() — tearing down the cream plan map at generate-time.');
            map2dHandle.dispose();
            map2dHandle = null;
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
                        cesiumViewport.setVisible(true);
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
    let btn2dRef: HTMLButtonElement | null = null;
    let btn3dRef: HTMLButtonElement | null = null;

    const removeResultToggle = (): void => {
        if (resultToggle?.parentElement) resultToggle.parentElement.removeChild(resultToggle);
        resultToggle = null;
        btn2dRef = null;
        btn3dRef = null;
    };

    // Active-state styling for the toggle buttons (no <style> injection — inline,
    // on-brand white / #6600FF).
    const styleResultBtn = (el: HTMLButtonElement | null, active: boolean): void => {
        if (!el) return;
        el.style.background = active ? '#6600FF' : 'transparent';
        el.style.color = active ? '#ffffff' : '#6600FF';
    };
    const refreshResultButtons = (): void => {
        styleResultBtn(btn2dRef, resultViewMode === '2D');
        styleResultBtn(btn3dRef, resultViewMode === '3D');
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

    const applyResultView = async (mode: '2D' | '3D'): Promise<void> => {
        resultViewMode = mode;
        if (mode === '3D') {
            // Show the Cesium globe with the site context and frame the plot.
            toggleGIS(true);
            // toggleGIS mounts Cesium async on first use; give it a beat, then frame.
            setTimeout(() => {
                // §GLOBE-EXIT-FORMA (2026-06-05) — the viewer force-mounts in FORMA
                // mode when there's no Cesium token (applyFormaMode hides ALL imagery
                // layers + darkens the sky), so the "3D globe" rendered BLACK even
                // though the keyless OSM basemap is installed. EXIT Forma here so the
                // real-world OSM globe shows. "Site 3D (Forma)" stays the massing
                // study (it forces Forma back on via mountFormaViewToggle → engage).
                try { cesiumViewport?.setFormaMode?.(false); }
                catch (e) { console.warn('[gis] 3D globe: setFormaMode(false) failed (non-fatal):', e); }
                void reframeSiteIn3D();
            }, 350);
        } else {
            // O.7.2.b — '2D' now means the BIM DUAL-PANE (LEFT 3D · RIGHT plan), the
            // founder-specified post-generate landing, not the Cesium globe.
            await applyBimDualPane();
        }
        refreshResultButtons();
    };

    /**
     * O.7.2 — mount the post-generate dual-view toggle + land on the chosen view.
     * Called by the onboarding generate-finish handoff (window.pryzmShowSiteResultView).
     * `initial` is the view to land on first ('2D' plan by default — the no-blank fix).
     */
    const showSiteResultView = (initial: '2D' | '3D' = '2D'): void => {
        const viewport = document.getElementById('container');
        if (!viewport) {
            console.error('[gis] showSiteResultView: #container not found');
            return;
        }
        // O.7.2.b — GENERATE-TIME teardown of the cream 2D plan map. After the
        // boundary commit the map stayed alive (so the confirm step rendered over a
        // live plan map); this is the ONLY place it is disposed — reached exclusively
        // via the onboarding "Generate" action's pryzmShowSiteResultView() handoff.
        closeBoundaryMap2D();
        if (viewport.style.position !== 'absolute' && viewport.style.position !== 'relative') {
            viewport.style.position = 'relative';
        }
        // (Re)build the floating control so it sits ABOVE the Cesium overlay (z 20).
        removeResultToggle();
        const bar = document.createElement('div');
        bar.className = 'pryzm-result-toggle';
        bar.setAttribute('data-testid', 'gis-result-view-toggle');
        Object.assign(bar.style, {
            // UI-FORMA-TOGGLE-POSITION — moved off the top-centre (was colliding
            // with the save/Author/Inspect/Data toolbar) down to the lower-left.
            position: 'absolute', top: '72px', left: '12px',
            zIndex: '30', display: 'flex', gap: '4px', padding: '4px',
            background: '#ffffff', borderRadius: '10px',
            boxShadow: '0 4px 18px rgba(20,10,60,0.18)', border: '1px solid #ece7fb',
            font: '600 12px/1 system-ui, sans-serif',
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
            b.addEventListener('mouseenter', () => { if (resultViewMode !== mode) b.style.background = '#f4f0ff'; });
            b.addEventListener('mouseleave', () => { if (resultViewMode !== mode) b.style.background = 'transparent'; });
            b.addEventListener('click', () => { void applyResultView(mode); });
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
        formaBtn.textContent = '◉ Site 3D (Forma)';
        formaBtn.title = 'Open the Cesium massing study — white extruded buildings on your real-world plot';
        Object.assign(formaBtn.style, {
            appearance: 'none', border: 'none', cursor: 'pointer',
            padding: '7px 14px', borderRadius: '7px', color: '#6600FF',
            background: 'transparent', font: 'inherit', borderLeft: '1px solid #ece7fb',
        } satisfies Partial<CSSStyleDeclaration>);
        formaBtn.addEventListener('mouseenter', () => { formaBtn.style.background = '#f4f0ff'; });
        formaBtn.addEventListener('mouseleave', () => { formaBtn.style.background = 'transparent'; });
        formaBtn.addEventListener('click', () => {
            console.log('[gis][forma] result-toggle: launching Forma massing view (Plan-oblique default).');
            mountFormaViewToggle('plan');
        });
        bar.appendChild(formaBtn);

        viewport.appendChild(bar);
        resultToggle = bar;

        console.log(`[gis] showSiteResultView: dual-view toggle mounted, landing on "${initial}".`);
        void applyResultView(initial);
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

    /** Read the committed parcel boundary ring (scene-XZ), or null. */
    const getFormaBoundary = (): XZ[] | null => {
        const b = (runtime?.siteModelStore as
            | { getParcelBoundary?: () => { polygon?: ReadonlyArray<XZ> } | null }
            | undefined)?.getParcelBoundary?.();
        const poly = b?.polygon;
        return poly && poly.length >= 3 ? poly.map((p) => ({ x: p.x, z: p.z })) : null;
    };

    /** Read authored walls (the massing) from the wall store: baseLine + h + t. */
    const getFormaWalls = (): Array<{ a: XZ; b: XZ; height: number; thickness: number }> => {
        type WallRecord = {
            baseLine?: ReadonlyArray<{ x: number; z: number }>;
            height?: number;
            thickness?: number;
        };
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as
            | { getAll?: () => WallRecord[] }
            | undefined;
        const all = wallStore?.getAll?.() ?? [];
        const out: Array<{ a: XZ; b: XZ; height: number; thickness: number }> = [];
        for (const w of all) {
            const bl = w.baseLine;
            if (!bl || bl.length < 2 || !bl[0] || !bl[1]) continue;
            out.push({
                a: { x: bl[0].x, z: bl[0].z },
                b: { x: bl[1].x, z: bl[1].z },
                height: typeof w.height === 'number' && w.height > 0 ? w.height : 2.5,
                thickness: typeof w.thickness === 'number' && w.thickness > 0 ? w.thickness : 0.1,
            });
        }
        return out;
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
                `[gis][forma] rendering massing: ${walls.length} wall(s), boundary=${boundary ? 'yes' : 'no'}, ` +
                    `origin LAT ${origin.lat} LON ${origin.lon}.`
            );
        }
        cesiumViewport.renderFormaMassing({
            originLat: origin.lat,
            originLon: origin.lon,
            boundary,
            walls,
            frameCentroid: frame,
            framePreset: preset,
        });
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
        toggleGIS(true);
        // Force Forma look NOW (idempotent) so even an already-mounted viewer
        // (with a Cesium token → otherwise photoreal) flips to the massing study.
        window.pryzmSetCesiumFormaMode?.(true);
        void awaitCesiumReady().then(() => {
            // Re-check: the user may have flipped to another mode while we waited.
            if (formaViewMode !== targetMode) {
                console.log('[gis][forma] Cesium activation aborted — user switched mode while Cesium mounted.');
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
        }).catch((err: unknown) => {
            console.error('[gis][forma] Cesium activation failed:', err);
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

        const bar = document.createElement('div');
        bar.className = 'pryzm-forma-view-toggle';
        bar.setAttribute('data-testid', 'forma-view-toggle');
        Object.assign(bar.style, {
            // UI-FORMA-TOGGLE-POSITION — moved off the top-right (was colliding
            // with the settings rail) to the lower-left, stacked under the result bar.
            position: 'absolute', top: '120px', left: '12px',
            zIndex: '31', display: 'flex', gap: '4px', padding: '4px',
            background: '#ffffff', borderRadius: '10px',
            boxShadow: '0 4px 18px rgba(20,10,60,0.18)', border: '1px solid #ece7fb',
            font: '600 12px/1 system-ui, sans-serif',
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

        viewport.appendChild(bar);
        formaToggle = bar;
        console.log(`[gis][forma] view toggle mounted (initial "${initial}").`);
        applyFormaView(initial);
    };

    const removeFormaViewToggle = (): void => {
        disposeFormaAnalysis(); // FORMA.5 — tear down analysis chrome with the toggle.
        if (formaToggle?.parentElement) formaToggle.parentElement.removeChild(formaToggle);
        formaToggle = null;
        formaMap2dBtn = null;
        formaPlanBtn = null;
        formaThreeBtn = null;
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
        if (formaViewMode === 'map2d') return;            // not looking at Cesium.
        console.log(`[gis][forma] live-update (${source}) → re-placing massing (no re-fly).`);
        renderFormaMassing(false);
    };

    const formaLiveUpdateDisposers: Array<() => void> = [];
    const subscribeFormaLiveUpdate = (): void => {
        const events = runtime?.events;
        if (!events || formaLiveUpdateDisposers.length > 0) return;
        for (const evt of ['site.parcel-boundary-set', 'apartment.layout-executed'] as const) {
            try {
                const sub = events.on(evt, () => liveUpdateFormaMassing(evt));
                // EventSubscription is callable-as-disposer.
                formaLiveUpdateDisposers.push(() => { try { sub(); } catch { /* gone */ } });
            } catch (e) {
                console.warn(`[gis][forma] live-update subscribe to ${evt} failed:`, e);
            }
        }
        console.log('[gis][forma] live-update subscribed: site.parcel-boundary-set + apartment.layout-executed.');
    };
    // Subscribe eagerly so an edit made before the user ever opens 3D is still
    // reflected the next time 3D is shown (the guard short-circuits when not 3D).
    subscribeFormaLiveUpdate();
    window.pryzmDisposeFormaLiveUpdate = () => {
        for (const d of formaLiveUpdateDisposers.splice(0)) d();
    };

    // FORMA.4 — on-demand re-render hook (console + programmatic). `frame` flies
    // the NW oblique camera; live-update callers pass false (no re-fly).
    window.pryzmRenderFormaMassing = (frame?: boolean) => renderFormaMassing(frame ?? false);
    // FORMA.3 / FORMA-PLAN-OBLIQUE — mount the [2D Map][Plan][3D] toggle. Defaults
    // to the Forma PLAN-oblique (the signature look — near-top-down shadowed
    // massing) so the demo lands straight on the Forma "plan view". Mirrors
    // pryzmShowSiteResultView. Accepts 'map2d' | 'plan' | '3d'.
    window.pryzmShowFormaView = (initial?: 'map2d' | 'plan' | '3d') => mountFormaViewToggle(initial ?? 'plan');
    window.pryzmHideFormaView = () => removeFormaViewToggle();

    return { toggleGIS, flyToCremornePoint, placeBimOnEarth, activateView, gizmoMode, startBoundaryDraw, cancelBoundaryDraw };
}
