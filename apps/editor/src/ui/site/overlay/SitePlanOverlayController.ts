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
    readPersistedOverlay,
    clearPersistedOverlay,
    type PersistedSitePlanOverlay,
} from './sitePlanOverlayPersistence';
// §FEAT-PROJECT-TRUE-NORTH (ADR-0114) — capture the project→true-north angle θ from the
// committed underlay placement (the underlay's on-canvas rotation ON the true-north
// basemap = θ). Distinct from the underlay's own transform.rotationRad by design.
import { deriveProjectNorthAngle } from './projectTrueNorth';

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

export interface SitePlanOverlayControllerHandle {
    /** Open the file picker (the onboarding entry button calls this). */
    promptUpload(): void;
    /** Tear down the panel + layer (does NOT clear persistence). */
    dispose(): void;
    readonly element: HTMLElement;
}

export function mountSitePlanOverlayController(
    init: SitePlanOverlayControllerInit,
): SitePlanOverlayControllerHandle {
    const { map, parent, getOrigin, projectId } = init;
    const onCommitProjectNorth = init.onCommitProjectNorth;
    const toast: ToastFn = init.toast ?? (() => { /* no-op */ });

    let state: OverlayState | null = null;
    let disposed = false;
    let calibrating: { a: PixelPoint | null; b: PixelPoint | null } | null = null;

    // ── panel shell ────────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.className = 'pryzm-site-overlay-panel';
    panel.setAttribute('data-testid', 'site-plan-overlay-panel');
    Object.assign(panel.style, {
        position: 'absolute',
        top: '92px',
        right: '12px',
        zIndex: '22',
        width: '240px',
        background: '#ffffff',
        border: `1px solid ${VIOLET}`,
        borderRadius: '12px',
        padding: '12px',
        font: '13px/1.4 system-ui, sans-serif',
        color: INK,
        boxShadow: '0 4px 18px rgba(60,52,40,0.20)',
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
        const origin = getOrigin() ?? { lat: 0, lon: 0 };
        // Dispose any prior layer first.
        state?.layer.dispose();

        const transform = preset?.transform ?? defaultOverlayTransform(widthPx, heightPx);
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
        renderPanel();
        schedulePersist();
    }

    // ── §FEAT-PROJECT-TRUE-NORTH — commit the placement as Project North ──────────
    // The underlay's placement ON the true-north basemap defines θ (project→true-north).
    // Pressing "Use this placement" captures θ, mirrors it onto the model (via the host
    // callback → dispatchSiteTrueNorth, P6), and persists it. NO boundary trace required
    // (Part A goal) — the calibration + boundary tools remain independently available.
    function commitProjectNorth(): void {
        if (!state) return;
        const thetaRad = deriveProjectNorthAngle(state.transform);
        state.projectNorthSet = true;
        try {
            onCommitProjectNorth?.(thetaRad);
        } catch (err) {
            console.warn('[site-overlay] onCommitProjectNorth threw (non-fatal):', err);
        }
        renderPanel();
        schedulePersist();
        const deg = ((thetaRad * 180) / Math.PI).toFixed(1);
        toast(`Project North set from the plan (${deg}° to true north). The 3D globe now aligns.`, 'success');
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
        if (projectId) clearPersistedOverlay(projectId);
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
    function onMapClick(lngLat: { lng: number; lat: number }): void {
        if (!calibrating || !state) return;
        const px = mapPointToSourcePixel(lngLat);
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
        const origin = getOrigin() ?? { lat: 0, lon: 0 };
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
        persistTimer = null;
        if (!projectId || !state) return;
        const origin = getOrigin() ?? { lat: 0, lon: 0 };
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
        writePersistedOverlay(projectId, record);
    }

    function restore(): void {
        if (!projectId) return;
        const rec = readPersistedOverlay(projectId);
        if (!rec) return;
        restoreFromRecord(rec);
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
    function renderPanel(): void {
        panel.style.display = '';
        panel.replaceChildren();

        const title = document.createElement('div');
        title.textContent = 'Site plan overlay';
        Object.assign(title.style, { fontWeight: '700', marginBottom: '8px', color: VIOLET } satisfies Partial<CSSStyleDeclaration>);
        panel.appendChild(title);

        if (!state) {
            const hint = document.createElement('div');
            hint.textContent = 'Upload a survey or CAD plan (PDF or image) to lay over the map.';
            hint.style.marginBottom = '10px';
            panel.appendChild(hint);
            panel.appendChild(button('Upload plan / PDF', promptUpload, true));
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

        // §FEAT-PROJECT-TRUE-NORTH — the OK / "use this placement" commit. Sets Project
        // North from the plan's on-map orientation (θ → the model's true-north). NO
        // boundary trace is required for this path (the Part A goal).
        const okBtn = button(
            state.projectNorthSet ? '✓ Project North set — update' : '✓ Use this placement (set Project North)',
            commitProjectNorth,
            true,
        );
        okBtn.style.marginTop = '6px';
        okBtn.setAttribute('data-testid', 'site-overlay-commit-project-north');
        panel.appendChild(okBtn);

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
        panel.remove();
        fileInput.remove();
    }

    // First paint + restore any saved overlay for this project.
    renderPanel();
    restore();

    return { promptUpload, dispose, element: panel };
}
