// §SITE-PLAN-OVERLAY (controller + panel) — the user-facing site-plan overlay surface.
//
// Ties the pure geometry/calibration/persistence helpers + the robust rasteriser + the
// MapLibre overlay layer into ONE controller mounted over the 2D boundary-draw map:
//
//   upload (PDF/image) → [PDF: pick page] → rasterise (size-capped) → place on map
//     → move / rotate / scale / opacity / lock  → 2-point calibrate (the accuracy key)
//     → persist per-project → reload with the project.
//
// The boundary tracing itself REUSES the existing SiteBoundaryMap2D draw tool unchanged —
// with the overlay calibrated + visible under the draw layers, the user traces the parcel
// against both the plan and the basemap. Snapping to overlay corners is a SPEC future
// phase (the plan raster has no vector features to query yet).
//
// Brand: white + #6600FF, no pure black (C18 §41). All async paths are guarded → a bad
// file shows a toast, never crashes the renderer (the link-then-crash class of bug).

import type { Map as MapLibreMap } from 'maplibre-gl';
import {
    rasterizeOverlaySource,
    classifyOverlayFile,
    probePageCount,
    type OverlaySourceKind,
} from './sitePlanRasterizer';
import { SitePlanOverlayLayer } from './SitePlanOverlayLayer';
import {
    defaultOverlayTransform,
    viewportAnchoredTransform,
    latLonToEastNorth,
    translateOverlay,
    setOverlayRotation,
    scaleOverlay,
    applyCalibration,
    computeCalibrationScale,
    type SitePlanOverlayTransform,
    type PixelPoint,
} from './sitePlanOverlayGeometry';
import {
    serializeOverlay,
    writePersistedOverlay,
    readPersistedOverlayMetadata,
    hasInlineRaster,
    clearPersistedOverlay,
    type PersistedSitePlanOverlay,
} from './sitePlanOverlayPersistence';
// §FIX-SITE-OVERLAY-RENDER-AND-FLOW (L-58) — the raster BYTES live in IndexedDB (per
// project), NOT localStorage: a multi-MB survey scan blew the ~5 MB localStorage quota
// → QuotaExceededError → the overlay never persisted → on reload it never repainted.
// Mirrors the L-45 floor-plan UnderlayRasterStore pattern; separate DB so the two
// overlays never clobber each other (C13 project isolation).
import { getSiteOverlayRasterStore } from './SiteOverlayRasterStore';
// §FEAT-PROJECT-TRUE-NORTH (ADR-0114) — capture the project→true-north angle θ from the
// committed underlay placement (the underlay's on-canvas rotation ON the true-north
// basemap = θ). Distinct from the underlay's own transform.rotationRad by design.
import { deriveProjectNorthAngle, computePlanUnderlayPlacement } from './projectTrueNorth';
// §UX1-PANEL-DEFAULTS — the start-up open/closed decision for this card lives in ONE
// table (`ui/layout/panelDefaults.ts`), not in this file's unconditional first paint.
import { panelDefaultOpen, setPanelOpen, isPanelOpen, onPanelLayoutReset } from '../../layout/panelDefaults';
// C06 §7.3 — no raw z-index literals in edited UI chrome (this was `zIndex: '22'`).
import { zCss } from '../../layout/zLayers';

const VIOLET = '#6600FF';
const INK = '#2a1a52';

type ToastFn = (message: string, severity: 'info' | 'success' | 'error') => void;

export interface SitePlanOverlayControllerInit {
    /** The MapLibre map of the 2D boundary-draw surface (the overlay's render host). */
    readonly map: MapLibreMap;
    /** Where to mount the floating control panel (the draw overlay element). */
    readonly parent: HTMLElement;
    /** Resolve the current site origin (lat/lon) — the overlay's geo-anchor. */
    readonly getOrigin: () => { lat: number; lon: number } | null;
    /** Active project id, for per-project persistence. Null disables persistence. */
    readonly projectId: string | null;
    /** Toast surface. */
    readonly toast?: ToastFn;
    /**
     * §FEAT-PROJECT-TRUE-NORTH (ADR-0114) — invoked when the user presses
     * "✓ Use this placement" with the captured project→true-north angle θ (radians).
     * The host wires this to `dispatchSiteTrueNorth` (the P6 command path) so θ lands
     * on `SiteLocation.trueNorth`. Absent ⇒ the OK button just persists locally.
     */
    readonly onCommitProjectNorth?: (thetaRad: number) => void;
    /**
     * §FIX-SITE-OVERLAY-RENDER-AND-FLOW (L-58) — invoked AFTER a successful "✓ Use this
     * placement" commit so the host can ADVANCE the wizard (onboarding Step 2 → the
     * boundary-trace / plot step). Distinct from onCommitProjectNorth (which only mirrors
     * θ onto the model): this is the "user is done placing → proceed" signal. Absent ⇒
     * the commit just sets Project North with no navigation.
     */
    readonly onPlacementCommitted?: () => void;
    /**
     * §FEAT-SITE-OVERLAY-PLAN-UNDERLAY (L-71) — invoked on "✓ Finish" with the raster +
     * its PROJECT-FRAME placement so the host can instantiate the calibrated plan as a live
     * underlay INSIDE the PRYZM editor canvas (plan + 3D), correctly located + sized + rotated
     * onto project north (orthogonal in plan view). The controller computes the placement
     * (scale from the calibration mpp, rotation removed to project north, centre re-expressed
     * in the project frame); the host does the THREE-scene creation via the existing
     * FloorPlanUnderlayTool + CREATE_UNDERLAY pipeline. Absent ⇒ no canvas underlay is created.
     */
    readonly onEnterCanvas?: (params: EnterCanvasUnderlayParams) => void | Promise<void>;
    /**
     * §FIX-IMPORT-FINISH-OPENS-EDITOR (L-311) — upper bound (ms) on the `onEnterCanvas`
     * (underlay-creation) await inside the "✓ Finish" commit BEFORE the terminal landing
     * (`onPlacementCommitted` → 3D + split view) proceeds regardless. Guards against a hung
     * texture decode leaving the user stranded on the map ("Finish does nothing"). Defaults to
     * 8000 ms. A normal creation resolves well under it; this is a safety net + a test seam.
     */
    readonly enterCanvasTimeoutMs?: number;
}

/** §FEAT-SITE-OVERLAY-PLAN-UNDERLAY (L-71) — the plan-canvas underlay params handed to the
 *  host on "✓ Finish". Pre-computed from the calibrated overlay transform (see
 *  computePlanUnderlayPlacement) so the host stays free of the dual-north math. */
export interface EnterCanvasUnderlayParams {
    readonly dataUrl: string;
    /** §FIX-IMPORT-MANAGER-SOUND (L-88) — the uploaded file's name (Import Manager label). */
    readonly fileName: string;
    readonly widthPx: number;
    readonly heightPx: number;
    /** Metric scale = 1 / metresPerPixel (correct real-world size). */
    readonly pxPerMeter: number;
    /** Project-frame centre, metres East/North of the site origin. */
    readonly positionEast: number;
    readonly positionNorth: number;
    /** Underlay rotation about world-Y (radians). 0 = axis-aligned / project north. */
    readonly rotationZ: number;
}

/** Live overlay state held by the controller. */
interface OverlayState {
    fileName: string;
    sourceKind: OverlaySourceKind;
    dataUrl: string;
    page: number;
    pageCount: number;
    transform: SitePlanOverlayTransform;
    opacity: number;
    locked: boolean;
    visible: boolean;
    calibrated: boolean;
    /** §FEAT-PROJECT-TRUE-NORTH — true once "Use this placement" committed θ. */
    projectNorthSet: boolean;
    layer: SitePlanOverlayLayer;
    /** The source file kept so a different page can be re-rasterised. */
    file: File | null;
}

/**
 * §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 A) — the site-plan overlay flow IS a
 * state machine; modelling it as one is the fix. See the `phase` declaration below.
 */
export type SitePlanOverlayPhase = 'locating' | 'placing' | 'finished';

export interface SitePlanOverlayControllerHandle {
    /**
     * Open the file picker. This is the USER'S OPT-IN, and the ONLY way an upload can start
     * (`locating` → `placing`). Nothing may call it on mode entry — that inversion is L-258 (A).
     */
    promptUpload(): void;
    /** The flow's current phase (`locating` until the user opts into an upload). */
    phase(): SitePlanOverlayPhase;
    /**
     * §FIX-SITE-OVERLAY-CALIBRATION-EXCLUSIVE (L-69) — true while the 2-point scale
     * calibration is capturing its two map clicks. The host boundary-DRAW tool queries
     * this to YIELD its click handling for the duration, so the two calibration clicks
     * land as points a & b instead of being consumed as parcel vertices (which then
     * committed a boundary + forced the generate flow). See SiteBoundaryMap2D.onClick.
     */
    isCalibrating(): boolean;
    /** Tear down the panel + layer (does NOT clear persistence). */
    dispose(): void;
    readonly element: HTMLElement;
}

export function mountSitePlanOverlayController(
    init: SitePlanOverlayControllerInit,
): SitePlanOverlayControllerHandle {
    const { map, parent, getOrigin, projectId } = init;
    const onCommitProjectNorth = init.onCommitProjectNorth;
    const onPlacementCommitted = init.onPlacementCommitted;
    const onEnterCanvas = init.onEnterCanvas;
    // §FIX-IMPORT-FINISH-OPENS-EDITOR (L-311) — bound the underlay-creation await (see below).
    const enterCanvasTimeoutMs = init.enterCanvasTimeoutMs ?? 8000;
    const toast: ToastFn = init.toast ?? (() => { /* no-op */ });

    // §FIX-SITE-OVERLAY-RENDER-AND-FLOW — resolve the geo-anchor for the overlay. Prefer
    // the committed Site origin; when unset (the user hasn't geocoded a location yet) fall
    // back to the MAP'S CURRENT CENTRE rather than lat/lon (0,0). The old (0,0) fallback
    // dropped the raster in the Gulf of Guinea — thousands of km off-view — so it was
    // "placed" but never visible. Centring on the current view guarantees the freshly
    // uploaded plan lands under the user's eyes.
    function resolveOrigin(): { lat: number; lon: number } {
        const o = getOrigin();
        if (o && Number.isFinite(o.lat) && Number.isFinite(o.lon) && (o.lat !== 0 || o.lon !== 0)) {
            return o;
        }
        try {
            const c = map.getCenter();
            if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) return { lat: c.lat, lon: c.lng };
        } catch { /* map gone */ }
        return { lat: 0, lon: 0 };
    }

    // §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 A) — the visible map width in
    // metres, used to size a freshly uploaded plan against the view the user chose. Null
    // when the map handle cannot report bounds (a test double / a torn-down map).
    function viewportSpanMetres(): number | null {
        try {
            const b = (map as unknown as { getBounds?: () => { getWest(): number; getEast(): number; getNorth(): number; getSouth(): number } }).getBounds?.();
            if (!b) return null;
            const west = b.getWest();
            const east = b.getEast();
            const lat = (b.getNorth() + b.getSouth()) / 2;
            if (![west, east, lat].every(Number.isFinite)) return null;
            const DEG2RAD = Math.PI / 180;
            const R = 6_378_137;
            const span = Math.abs(east - west) * DEG2RAD * R * Math.max(1e-6, Math.cos(lat * DEG2RAD));
            return Number.isFinite(span) && span > 0 ? span : null;
        } catch {
            return null;
        }
    }

    /**
     * §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 A) — the initial placement of a
     * FRESH upload: centred on the map viewport THE USER NAVIGATED TO, sized to ~60% of the
     * visible width, expressed in LTP-ENU metres about the site origin (C12) so it survives
     * a re-centre / reload. Falls back to the legacy origin-centred 50 m default only when
     * the map cannot report a centre (never a silent "somewhere else" jump).
     */
    function initialTransform(widthPx: number, heightPx: number, origin: { lat: number; lon: number }): SitePlanOverlayTransform {
        try {
            const c = map.getCenter?.();
            if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
                const centre = latLonToEastNorth({ lat: c.lat, lon: c.lng }, origin.lat, origin.lon);
                return viewportAnchoredTransform(widthPx, heightPx, centre, viewportSpanMetres());
            }
        } catch { /* map gone — fall through */ }
        return defaultOverlayTransform(widthPx, heightPx);
    }

    let state: OverlayState | null = null;
    let disposed = false;
    let calibrating: { a: PixelPoint | null; b: PixelPoint | null } | null = null;
    // §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 A) — the flow's REAL state machine.
    //   locating → the map is free: the user pans/zooms to their actual site. NO overlay, NO
    //              upload, nothing placed. The ONLY affordance is "upload a plan" (opt-in).
    //   placing  → a raster exists and is anchored to the view the user chose; they move /
    //              rotate / scale / 2-point-calibrate it.
    //   finished → committed: Project North set, the underlay created on the canvas (P6,
    //              CREATE_UNDERLAY), the host landed in the 3D + plan split view.
    // The upload used to fire on MODE ENTRY (the onboarding auto-opened the file picker), so
    // the raster was placed before the user had navigated anywhere — the founder's "imports
    // in a RANDOM, not accurate location". Entry now lands in `locating` and STAYS there
    // until the user explicitly asks for the plan.
    let phase: SitePlanOverlayPhase = 'locating';

    // ── panel shell ────────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.className = 'pryzm-site-overlay-panel';
    panel.setAttribute('data-testid', 'site-plan-overlay-panel');
    // §UX1-PANEL-CHROME (C06 §6/§7.3) — density literals replaced by the shared
    // `--pryzm-panel-*` tokens, and the raw `zIndex: '22'` by the named `panel` band.
    // The full-saturation `1px solid #6600FF` outline is also gone: a card that is not
    // the user's current task should not shout louder than the map it sits on.
    Object.assign(panel.style, {
        position: 'absolute',
        top: '92px',
        right: '12px',
        zIndex: zCss('panel'),
        width: 'var(--pryzm-panel-width)',
        background: 'var(--pryzm-panel-surface)',
        border: 'var(--pryzm-panel-border)',
        borderRadius: 'var(--pryzm-panel-radius)',
        padding: 'var(--pryzm-panel-pad)',
        font: 'var(--pryzm-panel-font-size-body)/1.4 system-ui, sans-serif',
        color: INK,
        boxShadow: 'var(--pryzm-panel-shadow)',
        display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(panel);

    // hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
        const f = fileInput.files?.[0];
        fileInput.value = ''; // allow re-pick of the same file
        if (f) void onFile(f);
    });
    parent.appendChild(fileInput);

    function promptUpload(): void {
        // An explicit request for this tool is an explicit request to see its controls —
        // the collapsed default is about the STARTING state, not about hiding the surface
        // from a user who just invoked it.
        if (!expanded) setExpanded(true);
        fileInput.click();
    }

    // ── upload → rasterise → place ───────────────────────────────────────────────
    async function onFile(file: File): Promise<void> {
        const kind = classifyOverlayFile(file);
        if (!kind) {
            toast('Unsupported file — upload a PDF, PNG or JPG plan.', 'error');
            return;
        }
        toast('Loading plan…', 'info');
        let pageCount = 1;
        try {
            pageCount = await probePageCount(file, kind);
        } catch {
            pageCount = 1;
        }
        const page = 1;
        try {
            const raster = await rasterizeOverlaySource(file, kind, page);
            placeOverlay(file, file.name, kind, raster.dataUrl, raster.page, raster.pageCount || pageCount, raster.widthPx, raster.heightPx);
            toast('Plan placed — drag, scale, rotate, then calibrate for true scale.', 'success');
        } catch (err) {
            console.error('[site-overlay] rasterise failed:', err);
            toast(`Could not load that plan: ${(err as Error)?.message ?? 'unknown error'}`, 'error');
        }
    }

    function placeOverlay(
        file: File | null,
        fileName: string,
        sourceKind: OverlaySourceKind,
        dataUrl: string,
        page: number,
        pageCount: number,
        widthPx: number,
        heightPx: number,
        preset?: { transform: SitePlanOverlayTransform; opacity: number; locked: boolean; visible: boolean; calibrated: boolean; projectNorthSet?: boolean },
    ): void {
        const origin = resolveOrigin();
        // Dispose any prior layer first.
        state?.layer.dispose();

        // §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 A) — a FRESH upload is anchored
        // to the map view the user navigated to (not the site origin at a fixed 50 m span);
        // a RESTORE keeps its persisted, geo-anchored (LTP-ENU) transform verbatim.
        const transform = preset?.transform ?? initialTransform(widthPx, heightPx, origin);
        const opacity = preset?.opacity ?? 0.7;
        const visible = preset?.visible ?? true;
        const locked = preset?.locked ?? false;
        const calibrated = preset?.calibrated ?? false;
        const projectNorthSet = preset?.projectNorthSet ?? false;

        const layer = new SitePlanOverlayLayer({
            map,
            dataUrl,
            transform,
            originLat: origin.lat,
            originLon: origin.lon,
            opacity,
            visible,
        });

        state = {
            fileName, sourceKind, dataUrl, page, pageCount,
            transform, opacity, locked, visible, calibrated, projectNorthSet, layer, file,
        };
        // locating → placing. A restored overlay that was already committed re-enters as
        // `finished` (its CTA reads "update & re-enter canvas"), otherwise it is `placing`.
        phase = projectNorthSet ? 'finished' : 'placing';
        renderPanel();
        schedulePersist();
        // NOTE (L-258 A): we deliberately do NOT move the camera on a fresh upload. The plan
        // is now centred in the CURRENT viewport at ~60% of its width, so it is already under
        // the user's eyes — and yanking the map (the old fitBounds) would throw away the very
        // navigation the user did to find their site.
    }

    // ── §FEAT-PROJECT-TRUE-NORTH — commit the placement as Project North ──────────
    // The underlay's placement ON the true-north basemap defines θ (project→true-north).
    // Pressing "Use this placement" captures θ, mirrors it onto the model (via the host
    // callback → dispatchSiteTrueNorth, P6), and persists it. NO boundary trace required
    // (Part A goal) — the calibration + boundary tools remain independently available.
    async function commitProjectNorth(): Promise<void> {
        if (!state) return;
        const thetaRad = deriveProjectNorthAngle(state.transform);
        state.projectNorthSet = true;
        phase = 'finished';
        try {
            onCommitProjectNorth?.(thetaRad);
        } catch (err) {
            console.warn('[site-overlay] onCommitProjectNorth threw (non-fatal):', err);
        }
        renderPanel();
        // §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 B) — persist NOW, not on the
        // 300 ms debounce: the host tears this controller (and its pending timer) down as
        // part of landing in the canvas, which silently dropped the committed placement.
        persistNow();
        const deg = ((thetaRad * 180) / Math.PI).toFixed(1);
        toast(`Project North set from the plan (${deg}° to true north). Opening it on the canvas, axis-aligned.`, 'success');

        // §FEAT-SITE-OVERLAY-PLAN-UNDERLAY (L-71) — instantiate the calibrated plan as a live
        // underlay INSIDE the editor canvas: correct real size (mpp), correct location
        // (project-frame centre), and AXIS-ALIGNED (project north) so it shows orthogonally
        // in plan view for tracing walls. The controller does the pure dual-north math; the
        // host performs the THREE-scene creation via the existing FloorPlanUnderlayTool +
        // CREATE_UNDERLAY pipeline.
        // §FIX-SITE-OVERLAY-ENTER-CANVAS (L-78) — AWAIT the underlay creation so the mesh +
        // texture actually exist BEFORE we tell the host to switch to the canvas + frame the
        // camera on it. Without the await, the host exited GIS / zoom-to-fit ran against an
        // empty scene and the founder saw "nothing".
        try {
            const placement = computePlanUnderlayPlacement(state.transform);
            const entering = onEnterCanvas?.({
                dataUrl: state.dataUrl,
                fileName: state.fileName,
                widthPx: state.transform.widthPx,
                heightPx: state.transform.heightPx,
                pxPerMeter: placement.pxPerMeter,
                positionEast: placement.positionEast,
                positionNorth: placement.positionNorth,
                rotationZ: placement.rotationZ,
            });
            // §FIX-IMPORT-FINISH-OPENS-EDITOR (L-311) — BOUND this await. The terminal landing
            // (onPlacementCommitted → 3D + split view) runs AFTER it, so an unbounded await on a
            // hung texture decode would strand the user on the map forever — the founder's "Finish
            // does nothing". Race the creation against a timeout: a normal creation resolves first;
            // a stuck one degrades to "enter the editor now, the plan repaints when it arrives".
            if (entering && typeof (entering as PromiseLike<unknown>).then === 'function') {
                let timer: ReturnType<typeof setTimeout> | undefined;
                await Promise.race([
                    Promise.resolve(entering).finally(() => { if (timer) clearTimeout(timer); }),
                    new Promise<void>((resolve) => { timer = setTimeout(resolve, enterCanvasTimeoutMs); }),
                ]);
            }
        } catch (err) {
            // §FIX-IMPORT-FINISH-OPENS-EDITOR (L-311) — SURFACE the failure (a toast), never
            // swallow it silently. The plan could not be dropped on the canvas, but we still fall
            // through to the landing so the user is taken into the editor rather than stranded.
            console.warn('[site-overlay] onEnterCanvas failed:', err);
            toast('Could not place the plan on the canvas — opening the editor without it.', 'error');
        }

        // §FIX-SITE-OVERLAY-IMPORT-TERMINAL — the commit is the terminal "proceed" action:
        // tell the host to land in the canvas (dispose the wizard, close the map, frame the
        // plan). Guarded so a throwing host never blocks the (already-applied) placement.
        // §FIX-IMPORT-FINISH-OPENS-EDITOR (L-311) — this sits OUTSIDE the onEnterCanvas try/catch
        // AND past the bounded race, so the 3D + split-view landing can never be gated on the
        // underlay creation succeeding OR resolving.
        try {
            onPlacementCommitted?.();
        } catch (err) {
            console.warn('[site-overlay] onPlacementCommitted threw (non-fatal):', err);
        }
    }

    // ── transform mutations ──────────────────────────────────────────────────────
    function mutate(next: SitePlanOverlayTransform): void {
        if (!state || state.locked) return;
        state.transform = next;
        state.layer.setTransform(next);
        schedulePersist();
    }
    function nudge(dEast: number, dNorth: number): void {
        if (!state) return;
        // Step ∝ the overlay's own size so the nudge feels proportional at any scale.
        const step = Math.max(0.25, state.transform.widthPx * state.transform.metresPerPixel * 0.02);
        mutate(translateOverlay(state.transform, dEast * step, dNorth * step));
    }
    function rotateBy(deg: number): void {
        if (!state) return;
        mutate(setOverlayRotation(state.transform, state.transform.rotationRad + (deg * Math.PI) / 180));
    }
    function zoomBy(factor: number): void {
        if (!state) return;
        mutate(scaleOverlay(state.transform, factor));
    }
    function setOpacity(o: number): void {
        if (!state) return;
        state.opacity = Math.min(1, Math.max(0, o));
        state.layer.setOpacity(state.opacity);
        schedulePersist();
    }
    function toggleLock(): void {
        if (!state) return;
        state.locked = !state.locked;
        renderPanel();
        schedulePersist();
    }
    function toggleVisible(): void {
        if (!state) return;
        state.visible = !state.visible;
        state.layer.setVisible(state.visible);
        renderPanel();
        schedulePersist();
    }
    function removeOverlay(): void {
        state?.layer.dispose();
        state = null;
        calibrating = null;
        // Back to `locating`: the map is free again and nothing is placed.
        phase = 'locating';
        if (projectId) {
            clearPersistedOverlay(projectId);
            // §FIX-SITE-OVERLAY-RENDER-AND-FLOW — drop the raster from IDB too (isolation).
            void getSiteOverlayRasterStore().delete(projectId);
        }
        renderPanel();
        toast('Plan overlay removed.', 'info');
    }

    async function changePage(delta: number): Promise<void> {
        if (!state || state.sourceKind !== 'pdf' || !state.file) return;
        const nextPage = Math.min(Math.max(1, state.page + delta), state.pageCount);
        if (nextPage === state.page) return;
        try {
            const raster = await rasterizeOverlaySource(state.file, 'pdf', nextPage);
            // Keep the current placement; just swap the image + source size.
            const t: SitePlanOverlayTransform = {
                ...state.transform,
                widthPx: raster.widthPx,
                heightPx: raster.heightPx,
            };
            state.dataUrl = raster.dataUrl;
            state.page = raster.page;
            state.transform = t;
            state.layer.setImage(raster.dataUrl, t);
            renderPanel();
            schedulePersist();
        } catch (err) {
            toast(`Could not load page ${nextPage}.`, 'error');
            console.warn('[site-overlay] changePage failed:', err);
        }
    }

    // ── 2-point calibration ──────────────────────────────────────────────────────
    // The user clicks two points ON THE MAP that correspond to two points on the plan
    // a known real distance apart. We convert each clicked map point into the overlay's
    // SOURCE-PIXEL space (inverse of the current transform) so the computed scale is
    // independent of the on-screen zoom, then enter the real distance and apply.
    function startCalibration(): void {
        if (!state) return;
        if (state.locked) { toast('Unlock the plan to calibrate.', 'info'); return; }
        calibrating = { a: null, b: null };
        toast('Calibrate: click the first point of a known distance on the plan.', 'info');
        renderPanel();
    }
    function cancelCalibration(): void {
        calibrating = null;
        renderPanel();
    }

    // Map click → record a calibration point (in source pixels) when calibrating.
    // §FIX-SITE-OVERLAY-CALIBRATION-EXCLUSIVE (L-69) — MapLibre hands the listener a
    // MapMouseEvent whose geographic point is `e.lngLat` (NOT the event itself). The old
    // signature treated the event AS the lng/lat, so `e.lng`/`e.lat` were undefined →
    // NaN → mapPointToSourcePixel returned null → NO calibration point was ever captured
    // (the second, silent, root cause of "calibration doesn't work"). Read `e.lngLat`.
    function onMapClick(e: { lngLat: { lng: number; lat: number } }): void {
        if (!calibrating || !state) return;
        const px = mapPointToSourcePixel(e.lngLat);
        if (!px) return;
        if (!calibrating.a) {
            calibrating.a = px;
            toast('Now click the second point of the known distance.', 'info');
            renderPanel();
            return;
        }
        calibrating.b = px;
        // Prompt for the real distance.
        const entered = window.prompt('Real distance between the two points (metres):', '');
        const realM = entered ? Number(entered) : NaN;
        const a = calibrating.a;
        const b = calibrating.b;
        const mpp = computeCalibrationScale(a, b, realM);
        calibrating = null;
        if (mpp === null) {
            toast('Calibration needs two distinct points and a positive distance.', 'error');
            renderPanel();
            return;
        }
        mutate(applyCalibration(state.transform, mpp));
        state.calibrated = true;
        renderPanel();
        schedulePersist();
        toast('Calibrated — the plan is now at true real-world scale.', 'success');
    }

    /**
     * Convert a clicked map lng/lat into the overlay's source-pixel coordinate, by
     * inverting the current placement transform. Returns null when the click is wildly
     * outside (so a stray click doesn't produce a garbage scale).
     */
    function mapPointToSourcePixel(lngLat: { lng: number; lat: number }): PixelPoint | null {
        if (!state) return null;
        const origin = resolveOrigin();
        // map point → metres East/North about origin (local equirectangular, same frame).
        const DEG2RAD = Math.PI / 180;
        const R = 6_378_137;
        const cosLat0 = Math.cos(origin.lat * DEG2RAD) || 1e-12;
        const east = (lngLat.lng - origin.lon) * DEG2RAD * R * cosLat0;
        const north = (lngLat.lat - origin.lat) * DEG2RAD * R;
        // metres relative to overlay centre, un-rotated back to the image axes.
        const t = state.transform;
        const dE = east - t.centre.east;
        const dN = north - t.centre.north;
        const cos = Math.cos(t.rotationRad);
        const sin = Math.sin(t.rotationRad);
        // inverse of the clockwise rotation used in overlayCornersEastNorth
        const localE = dE * cos - dN * sin;
        const localN = dE * sin + dN * cos;
        // metres → source pixels. Image-Y is down; +North is up → invert N.
        const mpp = t.metresPerPixel || 1e-9;
        const px = localE / mpp + t.widthPx / 2;
        const py = -localN / mpp + t.heightPx / 2;
        if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
        return { x: px, y: py };
    }

    map.on('click', onMapClick);

    // ── persistence ──────────────────────────────────────────────────────────────
    let persistTimer: ReturnType<typeof setTimeout> | null = null;
    function schedulePersist(): void {
        if (!projectId) return;
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(persistNow, 300);
    }
    function persistNow(): void {
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = null;
        if (!projectId || !state) return;
        const origin = resolveOrigin();
        const record = serializeOverlay({
            fileName: state.fileName,
            sourceKind: state.sourceKind,
            imageDataUrl: state.dataUrl,
            page: state.page,
            originLat: origin.lat,
            originLon: origin.lon,
            transform: state.transform,
            opacity: state.opacity,
            locked: state.locked,
            visible: state.visible,
            calibrated: state.calibrated,
            // §FEAT-PROJECT-TRUE-NORTH — persist θ (distinct from transform.rotationRad).
            projectNorthRad: state.projectNorthSet ? deriveProjectNorthAngle(state.transform) : undefined,
            projectNorthSet: state.projectNorthSet,
        });
        // §FIX-SITE-OVERLAY-RENDER-AND-FLOW — lean metadata → localStorage (raster stripped
        // by writePersistedOverlay), raster BYTES → IndexedDB. The IDB write is async +
        // best-effort (never throws); the metadata write is the source of truth for restore.
        writePersistedOverlay(projectId, record);
        void getSiteOverlayRasterStore().put(projectId, state.dataUrl);
    }

    // §FIX-SITE-OVERLAY-RENDER-AND-FLOW — async restore: metadata from localStorage, raster
    // from IndexedDB. A LEGACY v1 record whose raster is still inline in localStorage is
    // used directly AND migrated to IDB (then the localStorage record is re-written lean),
    // so old projects self-heal on first open.
    async function restore(): Promise<void> {
        if (!projectId || disposed) return;
        const rec = readPersistedOverlayMetadata(projectId);
        if (!rec) return;
        let dataUrl: string | null = null;
        let migrated = false;
        if (hasInlineRaster(rec)) {
            dataUrl = rec.imageDataUrl;
            migrated = true; // legacy inline raster — migrate to IDB below.
        } else {
            dataUrl = await getSiteOverlayRasterStore().get(projectId);
        }
        if (disposed) return;
        if (!dataUrl) {
            // Metadata present but the raster is gone (cold IDB / cleared) — nothing to paint.
            console.warn('[site-overlay] restore: metadata present but no raster found (IDB miss).');
            return;
        }
        restoreFromRecord({ ...rec, imageDataUrl: dataUrl });
        if (migrated) {
            void getSiteOverlayRasterStore().put(projectId, dataUrl).then((ok) => {
                // Re-write the localStorage record LEAN (raster stripped) once the raster is
                // safely in IDB, so the legacy oversized key stops risking the quota.
                if (ok) writePersistedOverlay(projectId, { ...rec, imageDataUrl: dataUrl! });
            });
        }
    }
    function restoreFromRecord(rec: PersistedSitePlanOverlay): void {
        placeOverlay(
            null,
            rec.fileName,
            rec.sourceKind,
            rec.imageDataUrl,
            rec.page,
            1,
            rec.transform.widthPx,
            rec.transform.heightPx,
            { transform: rec.transform, opacity: rec.opacity, locked: rec.locked, visible: rec.visible, calibrated: rec.calibrated, projectNorthSet: !!rec.projectNorthSet },
        );
        toast('Restored your saved site plan overlay.', 'info');
    }

    // ── panel UI ──────────────────────────────────────────────────────────────────
    //
    // §UX1-PANEL-DEFAULTS — this card USED to paint its full body unconditionally on
    // mount (the `renderPanel()` at the bottom of this factory), which is why a fresh
    // project opened with an upload form sitting in the middle of the map the form
    // exists to sit UNDER. It now starts COLLAPSED to its header row.
    //
    // Collapsed — not removed — deliberately. This surface has no launcher-rail pill of
    // its own (it only exists while the 2D boundary-draw map is mounted, so an always-on
    // pill would be a control that leads nowhere for most of the session — C82 §1.2). The
    // header row IS the reopen affordance: it is on screen, it is one click, and it is
    // anchored in its own region so it occludes nothing. `site-overlay-reopen` is the
    // control named in the panel registry.
    let expanded = panelDefaultOpen('site-plan-overlay');

    function setExpanded(next: boolean): void {
        expanded = next;
        setPanelOpen('site-plan-overlay', next);
        renderPanel();
    }

    /**
     * The always-present header row: the title, a one-line state summary, and the
     * disclosure control that is this card's reopen route.
     *
     * The summary line matters as much as the control. Collapsed, the card must still
     * distinguish "no plan has been uploaded" from "a plan IS placed under this map" —
     * those are different facts and a bare title would render them identically, which is
     * the failure-and-emptiness-are-the-same-value defect. A user who never expands the
     * card can still see that their survey scan is loaded.
     */
    function buildHeaderRow(): HTMLElement {
        const row = document.createElement('div');
        Object.assign(row.style, {
            display: 'flex', alignItems: 'center', gap: '6px',
            marginBottom: expanded ? '8px' : '0',
        } satisfies Partial<CSSStyleDeclaration>);

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.setAttribute('data-testid', 'site-overlay-reopen');
        toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        toggle.setAttribute('aria-label', expanded ? 'Collapse site plan overlay' : 'Open site plan overlay');
        toggle.title = expanded ? 'Collapse' : 'Open the site plan overlay tools';
        toggle.textContent = expanded ? '▾' : '▸';
        Object.assign(toggle.style, {
            appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer',
            color: VIOLET, font: '600 12px/1 system-ui, sans-serif',
            // C43 / WCAG 2.2 AA SC 2.5.8 — this is the ONLY route back into the card, so
            // it carries the 24px target floor as a hard literal, not a scaled token.
            minWidth: '24px', minHeight: '24px', padding: '0',
        } satisfies Partial<CSSStyleDeclaration>);
        toggle.addEventListener('click', () => setExpanded(!expanded));
        row.appendChild(toggle);

        const title = document.createElement('div');
        title.textContent = 'Site plan overlay';
        Object.assign(title.style, {
            fontWeight: '600', color: VIOLET, flex: 'none',
            fontSize: 'var(--pryzm-panel-font-size-title)',
        } satisfies Partial<CSSStyleDeclaration>);
        row.appendChild(title);

        if (!expanded) {
            const summary = document.createElement('div');
            summary.setAttribute('data-testid', 'site-overlay-summary');
            summary.textContent = state ? `· ${state.fileName}` : '· no plan added';
            Object.assign(summary.style, {
                color: 'var(--pryzm-panel-ink-faint)',
                fontSize: 'var(--pryzm-panel-font-size-meta)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            } satisfies Partial<CSSStyleDeclaration>);
            row.appendChild(summary);
        }
        return row;
    }

    // §UX1-PANEL-DEFAULTS — `Reset panel layout` collapses this card again.
    const disposePanelReset = onPanelLayoutReset(() => {
        expanded = isPanelOpen('site-plan-overlay');
        renderPanel();
    });

    function renderPanel(): void {
        panel.style.display = '';
        panel.replaceChildren();
        panel.appendChild(buildHeaderRow());
        if (!expanded) return;

        if (!state) {
            // §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258 A) — the `locating` phase.
            // The map is FREE: pan/zoom to the real site first. Nothing is uploaded and nothing
            // is placed until the user presses this button — that opt-in IS the state transition.
            const hint = document.createElement('div');
            hint.textContent = '1 · Pan and zoom the map to your site. 2 · Then add your plan — it drops onto the view you chose.';
            hint.style.marginBottom = '10px';
            panel.appendChild(hint);
            const up = button('Upload plan / PDF', promptUpload, true);
            up.setAttribute('data-testid', 'site-overlay-upload');
            panel.appendChild(up);
            return;
        }

        const name = document.createElement('div');
        name.textContent = state.fileName + (state.sourceKind === 'pdf' ? ` · p${state.page}/${state.pageCount}` : '');
        Object.assign(name.style, { fontSize: '12px', opacity: '0.8', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } satisfies Partial<CSSStyleDeclaration>);
        panel.appendChild(name);

        if (calibrating) {
            const cal = document.createElement('div');
            cal.textContent = calibrating.a ? 'Click the second point…' : 'Click the first point of a known distance…';
            Object.assign(cal.style, { color: VIOLET, fontWeight: '600', marginBottom: '8px' } satisfies Partial<CSSStyleDeclaration>);
            panel.appendChild(cal);
            panel.appendChild(button('Cancel calibration', cancelCalibration));
            return;
        }

        // move pad
        panel.appendChild(label('Move'));
        const pad = document.createElement('div');
        Object.assign(pad.style, { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px', marginBottom: '8px' } satisfies Partial<CSSStyleDeclaration>);
        pad.appendChild(spacer());
        pad.appendChild(button('↑', () => nudge(0, 1)));
        pad.appendChild(spacer());
        pad.appendChild(button('←', () => nudge(-1, 0)));
        pad.appendChild(spacer());
        pad.appendChild(button('→', () => nudge(1, 0)));
        pad.appendChild(spacer());
        pad.appendChild(button('↓', () => nudge(0, -1)));
        pad.appendChild(spacer());
        panel.appendChild(pad);

        // rotate + scale row
        panel.appendChild(label('Rotate / scale'));
        const rs = document.createElement('div');
        Object.assign(rs.style, { display: 'flex', gap: '3px', marginBottom: '8px', flexWrap: 'wrap' } satisfies Partial<CSSStyleDeclaration>);
        rs.appendChild(button('⟲ 5°', () => rotateBy(-5)));
        rs.appendChild(button('⟳ 5°', () => rotateBy(5)));
        rs.appendChild(button('− size', () => zoomBy(1 / 1.05)));
        rs.appendChild(button('+ size', () => zoomBy(1.05)));
        panel.appendChild(rs);

        // opacity
        panel.appendChild(label(`Opacity ${(state.opacity * 100).toFixed(0)}%`));
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = String(Math.round(state.opacity * 100));
        slider.style.width = '100%';
        slider.style.accentColor = VIOLET;
        slider.addEventListener('input', () => setOpacity(Number(slider.value) / 100));
        panel.appendChild(slider);

        // PDF page nav
        if (state.sourceKind === 'pdf' && state.pageCount > 1) {
            const pg = document.createElement('div');
            Object.assign(pg.style, { display: 'flex', gap: '3px', margin: '8px 0' } satisfies Partial<CSSStyleDeclaration>);
            pg.appendChild(button('◀ page', () => void changePage(-1)));
            pg.appendChild(button('page ▶', () => void changePage(1)));
            panel.appendChild(pg);
        }

        // calibrate (the accuracy key) — scale method, still available (Part A: optional)
        const calBtn = button(state.calibrated ? 'Re-calibrate scale' : '2-point calibrate scale', startCalibration, true);
        calBtn.style.marginTop = '8px';
        panel.appendChild(calBtn);

        // §FIX-SITE-OVERLAY-IMPORT-TERMINAL (L-69) — the explicit terminal CTA. Founder ask:
        // once the plan is placed + (optionally) calibrated and it lines up, ONE obvious
        // "everything is good → proceed" button. Clicking it is the single commit action:
        // set Project North (θ, ADR-0115), keep the calibrated plan as the durable canvas
        // reference, dispose the wizard, and land in the PRYZM editor canvas — NO boundary
        // trace, NO auto-generate. Replaces the ambient "Use this placement" text with a
        // clear CTA. Calibration stays OPTIONAL (Part A / L-38), so this is never gated on it.
        const finishHint = label('When the plan lines up, finish to keep it as a reference and start working.');
        finishHint.style.marginTop = '10px';
        panel.appendChild(finishHint);

        const finishBtn = button(
            state.projectNorthSet ? '✓ Finished — update & re-enter canvas' : '✓ Finish — enter canvas',
            commitProjectNorth,
            true,
        );
        Object.assign(finishBtn.style, { marginTop: '4px', padding: '10px 8px', fontSize: '13px' } satisfies Partial<CSSStyleDeclaration>);
        // Keep the historical testid (existing wiring) + add the intent-named one.
        finishBtn.setAttribute('data-testid', 'site-overlay-commit-project-north');
        finishBtn.setAttribute('data-testid-alt', 'site-overlay-finish');
        panel.appendChild(finishBtn);

        // toggles + remove
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', gap: '3px', marginTop: '8px', flexWrap: 'wrap' } satisfies Partial<CSSStyleDeclaration>);
        row.appendChild(button(state.locked ? '🔒 Locked' : '🔓 Unlock', toggleLock));
        row.appendChild(button(state.visible ? 'Hide' : 'Show', toggleVisible));
        panel.appendChild(row);

        const remove = button('Remove plan', removeOverlay);
        remove.style.marginTop = '6px';
        remove.style.color = '#a11';
        panel.appendChild(remove);
    }

    // ── small UI builders (brand: white + violet, no black) ─────────────────────
    function button(text: string, onClick: () => void, primary = false): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        Object.assign(b.style, {
            appearance: 'none',
            border: `1px solid ${VIOLET}`,
            borderRadius: '7px',
            cursor: 'pointer',
            padding: '6px 8px',
            font: '600 12px/1 system-ui, sans-serif',
            background: primary ? VIOLET : '#ffffff',
            color: primary ? '#ffffff' : VIOLET,
            width: '100%',
        } satisfies Partial<CSSStyleDeclaration>);
        b.addEventListener('click', onClick);
        return b;
    }
    function label(text: string): HTMLDivElement {
        const d = document.createElement('div');
        d.textContent = text;
        Object.assign(d.style, { fontSize: '11px', opacity: '0.7', margin: '2px 0 4px' } satisfies Partial<CSSStyleDeclaration>);
        return d;
    }
    function spacer(): HTMLDivElement {
        return document.createElement('div');
    }

    function dispose(): void {
        if (disposed) return;
        disposed = true;
        if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
        try { map.off('click', onMapClick); } catch { /* map gone */ }
        state?.layer.dispose();
        state = null;
        try { disposePanelReset(); } catch { /* already gone */ }
        panel.remove();
        fileInput.remove();
    }

    // First paint + restore any saved overlay for this project.
    renderPanel();
    void restore();

    // §FIX-SITE-OVERLAY-CALIBRATION-EXCLUSIVE (L-69) — expose the calibration state so the
    // host draw tool can yield its clicks while the user is picking the two scale points.
    function isCalibrating(): boolean {
        return calibrating != null;
    }

    return { promptUpload, phase: () => phase, isCalibrating, dispose, element: panel };
}
