// @vitest-environment happy-dom
//
// §FIX-SITE-PLAN-OVERLAY-ORDER-AND-ENTER-CANVAS (L-258) — the site-plan overlay FLOW.
//
// Two distinct defects, two distinct root causes, guarded separately here.
//
// (A) THE ORDER WAS INVERTED. The onboarding auto-opened the file picker on MODE ENTRY
//     (startOverlayImportWhenReady → openOverlayPickerWhenReady → pryzmOpenSitePlanOverlay),
//     and the fresh raster was then placed by `defaultOverlayTransform` — centred on the SITE
//     ORIGIN (the geocoded pin) at a fixed 50 m span. So the plan appeared before the user had
//     navigated anywhere, at a location they never chose: the founder's "imports in a RANDOM,
//     not accurate location". The flow is now a real state machine —
//     locating (map free, NO upload) → placing (upload anchored to the CURRENT view) → finished.
//
// (B) "FINISH — ENTER CANVAS" DID NOT ENTER THE CANVAS. The commit path always ran and always
//     called back; its single side effect was `runtime.events.emit('site.overlay-placement-
//     committed')` — and the ONLY subscriber in the codebase was an ephemeral listener created
//     inside the onboarding wizard's overlay branch. From the always-on GIS launcher (C06 §7),
//     from the map's own "Overlay plan / PDF" button, or on re-entry to an onboarded project,
//     the event fired into an EMPTY BUS: underlay created, Import Manager row written, user
//     stranded on the map. The flow now owns its terminal transition.
//
// Post-Finish success criterion (founder, concrete + testable): the 3D BIM canvas, in SPLIT
// VIEW (3D + plan), with the plan committed as an underlay through CREATE_UNDERLAY (P6).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const _raster = 'data:image/png;base64,AAAA';
vi.mock('../src/ui/site/overlay/SiteOverlayRasterStore', () => ({
    getSiteOverlayRasterStore: () => ({
        get: vi.fn(async () => null),
        put: vi.fn(async () => true),
        delete: vi.fn(async () => {}),
    }),
}));
// The rasteriser touches PDF.js / canvas decode — stub it to a deterministic raster so the
// upload path is drivable headlessly.
vi.mock('../src/ui/site/overlay/sitePlanRasterizer', () => ({
    classifyOverlayFile: () => 'image' as const,
    probePageCount: async () => 1,
    rasterizeOverlaySource: async () => ({ dataUrl: _raster, page: 1, pageCount: 1, widthPx: 1000, heightPx: 800 }),
}));

import { mountSitePlanOverlayController, type SitePlanOverlayControllerHandle } from '../src/ui/site/overlay/SitePlanOverlayController';
import {
    enterCanvasWithSitePlanUnderlay,
    onSitePlanPlacementCommitted,
} from '../src/ui/site/overlay/enterCanvasWithSitePlan';
import { viewportAnchoredTransform, latLonToEastNorth } from '../src/ui/site/overlay/sitePlanOverlayGeometry';
import { key as persistenceKey } from '../src/ui/site/overlay/sitePlanOverlayPersistence';

// ── the site the user GEOCODED (the origin) vs the site they NAVIGATED to ────────────────
// ~1 km east + ~1 km north of the origin: the whole point of (A) is that the plan must land
// HERE (where the user is looking), not back at ORIGIN.
const ORIGIN = { lat: 51.5000, lon: -0.1200 };
const NAVIGATED = { lat: 51.5090, lon: -0.1056 }; // ≈ +1000 m E, +1000 m N
const PROJ = 'proj-l258';

/** Minimal MapLibre double: the controller reads getCenter()/getBounds() and adds an image source. */
class FakeMap {
    handlers: Record<string, Array<(e?: unknown) => void>> = {};
    sources = new Map<string, Record<string, unknown>>();
    layers = new Map<string, unknown>();
    fitBoundsCalls = 0;
    centre = NAVIGATED;
    on(ev: string, fn: (e?: unknown) => void) { (this.handlers[ev] ??= []).push(fn); }
    off(ev: string, fn: (e?: unknown) => void) { this.handlers[ev] = (this.handlers[ev] ?? []).filter((h) => h !== fn); }
    getSource(id: string) { return this.sources.get(id); }
    addSource(id: string, def: Record<string, unknown>) { this.sources.set(id, { ...def, setCoordinates() {}, updateImage() {} }); }
    getLayer(id: string) { return this.layers.get(id); }
    addLayer(def: { id: string }) { this.layers.set(def.id, def); }
    setPaintProperty() {}
    setLayoutProperty() {}
    removeLayer(id: string) { this.layers.delete(id); }
    removeSource(id: string) { this.sources.delete(id); }
    getCenter() { return { lng: this.centre.lon, lat: this.centre.lat }; }
    // ~0.0057° lon ≈ 400 m at this latitude → a ~400 m-wide viewport.
    getBounds() {
        return {
            getWest: () => this.centre.lon - 0.00285,
            getEast: () => this.centre.lon + 0.00285,
            getNorth: () => this.centre.lat + 0.0018,
            getSouth: () => this.centre.lat - 0.0018,
        };
    }
    fitBounds() { this.fitBoundsCalls++; }
}

let handle: SitePlanOverlayControllerHandle | null = null;
let parent: HTMLElement;
let onEnterCanvas: ReturnType<typeof vi.fn>;
let onPlacementCommitted: ReturnType<typeof vi.fn>;
let onCommitNorth: ReturnType<typeof vi.fn>;

const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(map: FakeMap): HTMLElement {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    onEnterCanvas = vi.fn();
    onPlacementCommitted = vi.fn();
    onCommitNorth = vi.fn();
    handle = mountSitePlanOverlayController({
        map: map as unknown as import('maplibre-gl').Map,
        parent,
        getOrigin: () => ORIGIN,
        projectId: PROJ,
        onCommitProjectNorth: (t) => onCommitNorth(t),
        onPlacementCommitted: () => onPlacementCommitted(),
        onEnterCanvas: (p) => onEnterCanvas(p),
    });
    return handle.element;
}

/** Drive a real upload through the panel's own opt-in button (the ONLY legal entry). */
async function uploadViaPanel(panel: HTMLElement): Promise<void> {
    const input = parent.querySelector('input[type="file"]') as HTMLInputElement;
    const btn = panel.querySelector('[data-testid="site-overlay-upload"]') as HTMLButtonElement;
    // The button opens the picker; simulate the user choosing a file.
    btn.click();
    const file = new File(['x'], 'ground-floor.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    await flush();
}

function findButton(root: HTMLElement, text: string): HTMLButtonElement {
    const btn = Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
    if (!btn) throw new Error(`button not found: ${text}`);
    return btn as HTMLButtonElement;
}

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
});
afterEach(() => {
    try { handle?.dispose(); } catch { /* ignore */ }
    handle = null;
    for (const k of ['pryzmCloseBoundaryMap2D', 'pryzmActivateBimView', 'pryzmToggleGIS', 'splitViewManager', 'viewController']) {
        delete (window as unknown as Record<string, unknown>)[k];
    }
});

describe('(A) ORDER — locating → placing → finished (no upload before the user opts in)', () => {
    it('mounts in the `locating` phase: NOTHING is uploaded, NOTHING is placed on the map', () => {
        const map = new FakeMap();
        const panel = mount(map);
        expect(handle!.phase()).toBe('locating');
        // No raster source on the map, and no image layer — the map is FREE to navigate.
        expect(map.getSource('pryzm-site-plan-overlay')).toBeFalsy();
        // The only affordance is the explicit opt-in.
        expect(panel.querySelector('[data-testid="site-overlay-upload"]')).toBeTruthy();
        expect(panel.textContent).toContain('Pan and zoom the map to your site');
    });

    it('the file picker only ever opens on the USER\'S click — never on mount', () => {
        const map = new FakeMap();
        const panel = mount(map);
        const input = parent.querySelector('input[type="file"]') as HTMLInputElement;
        const click = vi.spyOn(input, 'click');
        expect(click).not.toHaveBeenCalled(); // mount did not auto-fire the picker
        (panel.querySelector('[data-testid="site-overlay-upload"]') as HTMLButtonElement).click();
        expect(click).toHaveBeenCalledTimes(1); // …only the opt-in does
    });

    it('an uploaded plan is anchored to the map view the user NAVIGATED to — not the site origin', async () => {
        const map = new FakeMap();
        const panel = mount(map);
        await uploadViaPanel(panel);
        expect(handle!.phase()).toBe('placing');

        // The overlay is now on the map …
        expect(map.getSource('pryzm-site-plan-overlay')).toBeTruthy();
        // … and the camera was NOT yanked away from the view the user chose.
        expect(map.fitBoundsCalls).toBe(0);

        // Its centre is the NAVIGATED map centre in LTP-ENU metres about the site origin
        // (C12) — ~1 km E / ~1 km N — NOT (0,0), the old origin-centred default.
        findButton(panel, 'Finish').click();
        await flush();
        const params = onEnterCanvas.mock.calls[0][0];
        const expected = latLonToEastNorth(NAVIGATED, ORIGIN.lat, ORIGIN.lon);
        expect(params.positionEast).toBeCloseTo(expected.east, 0);
        expect(params.positionNorth).toBeCloseTo(expected.north, 0);
        expect(Math.hypot(params.positionEast, params.positionNorth)).toBeGreaterThan(500); // ≠ origin
    });

    it('the plan is sized to the CURRENT viewport (not a fixed 50 m span)', async () => {
        const map = new FakeMap();
        const panel = mount(map);
        await uploadViaPanel(panel);
        findButton(panel, 'Finish').click();
        await flush();
        const params = onEnterCanvas.mock.calls[0][0];
        // Longest side (1000 px) spans ~60% of the ~400 m viewport → ~240 m → ~4.2 px/m.
        const longestSideM = params.widthPx / params.pxPerMeter;
        expect(longestSideM).toBeGreaterThan(150);
        expect(longestSideM).toBeLessThan(350);
    });

    it('viewportAnchoredTransform (pure) centres on the given ENU point and falls back safely', () => {
        const t = viewportAnchoredTransform(1000, 500, { east: 120, north: -80 }, 400);
        expect(t.centre).toEqual({ east: 120, north: -80 });
        expect(t.widthPx * t.metresPerPixel).toBeCloseTo(240, 6); // 60% of 400 m
        // No viewport span reported (a torn-down map) → the legacy 50 m default, still centred.
        const fb = viewportAnchoredTransform(1000, 500, { east: 5, north: 5 }, null);
        expect(fb.widthPx * fb.metresPerPixel).toBeCloseTo(50, 6);
        expect(fb.centre).toEqual({ east: 5, north: 5 });
    });
});

describe('(B) FINISH — the flow owns its terminal transition (no wizard required)', () => {
    function installHooks(splitActive = false) {
        const hooks = {
            closeMap: vi.fn(),
            activateBimView: vi.fn(async () => {}),
            toggleGIS: vi.fn(),
            splitActivate: vi.fn(),
            zoomToFit: vi.fn(async () => {}),
        };
        const w = window as unknown as Record<string, unknown>;
        w['pryzmCloseBoundaryMap2D'] = hooks.closeMap;
        w['pryzmActivateBimView'] = hooks.activateBimView;
        w['pryzmToggleGIS'] = hooks.toggleGIS;
        w['splitViewManager'] = { isActive: splitActive, activate: hooks.splitActivate };
        w['viewController'] = { zoomToFit: hooks.zoomToFit };
        return hooks;
    }

    it('lands in the 3D canvas + SPLIT VIEW (3D + plan), framed on the plan', async () => {
        const hooks = installHooks();
        await enterCanvasWithSitePlanUnderlay();
        expect(hooks.closeMap).toHaveBeenCalledTimes(1);          // the 2D map is gone
        expect(hooks.activateBimView).toHaveBeenCalledWith('3D');  // …exits GIS → 3D BIM canvas
        expect(hooks.splitActivate).toHaveBeenCalledTimes(1);      // …plan pane beside it
        expect(hooks.zoomToFit).toHaveBeenCalledTimes(1);          // …framed on the underlay
    });

    it('THE REGRESSION: Finish lands the user even when NOTHING is listening on the bus', async () => {
        const hooks = installHooks();
        // A runtime with an event bus that has ZERO subscribers — i.e. the user came from the
        // always-on GIS launcher or re-entered an onboarded project, so no onboarding wizard
        // exists. Before the fix this emitted into the void and the user stayed on the map.
        const runtime = { events: { emit: vi.fn() } };
        await onSitePlanPlacementCommitted(runtime);
        expect(runtime.events.emit).toHaveBeenCalledWith('site.overlay-placement-committed', {});
        expect(hooks.closeMap).toHaveBeenCalledTimes(1);
        expect(hooks.activateBimView).toHaveBeenCalledWith('3D');
        expect(hooks.splitActivate).toHaveBeenCalledTimes(1);
    });

    it('is IDEMPOTENT — the map host and the onboarding wizard landing in the same tick land ONCE', async () => {
        const hooks = installHooks();
        await Promise.all([enterCanvasWithSitePlanUnderlay(), enterCanvasWithSitePlanUnderlay()]);
        expect(hooks.closeMap).toHaveBeenCalledTimes(1);
        expect(hooks.zoomToFit).toHaveBeenCalledTimes(1);
    });

    it('does not re-activate an already-open split view', async () => {
        const hooks = installHooks(true);
        await enterCanvasWithSitePlanUnderlay();
        expect(hooks.splitActivate).not.toHaveBeenCalled();
        expect(hooks.activateBimView).toHaveBeenCalledWith('3D');
    });

    it('degrades to a plain GIS exit when the BIM-view hook is missing (never strands the user)', async () => {
        const hooks = installHooks();
        delete (window as unknown as Record<string, unknown>)['pryzmActivateBimView'];
        await enterCanvasWithSitePlanUnderlay();
        expect(hooks.toggleGIS).toHaveBeenCalledWith(false);
        expect(hooks.closeMap).toHaveBeenCalledTimes(1);
    });
});

describe('end-to-end: locate → upload → place → finish', () => {
    it('drives the whole flow and ends committed, in the 3D + plan split view', async () => {
        const hooks = (() => {
            const h = {
                closeMap: vi.fn(), activateBimView: vi.fn(async () => {}), toggleGIS: vi.fn(),
                splitActivate: vi.fn(), zoomToFit: vi.fn(async () => {}),
            };
            const w = window as unknown as Record<string, unknown>;
            w['pryzmCloseBoundaryMap2D'] = h.closeMap;
            w['pryzmActivateBimView'] = h.activateBimView;
            w['pryzmToggleGIS'] = h.toggleGIS;
            w['splitViewManager'] = { isActive: false, activate: h.splitActivate };
            w['viewController'] = { zoomToFit: h.zoomToFit };
            return h;
        })();

        const map = new FakeMap();
        const panel = mount(map);

        // 1) LOCATE — the user pans/zooms. No upload has fired.
        expect(handle!.phase()).toBe('locating');
        map.centre = NAVIGATED;

        // 2) OPT IN + UPLOAD → placed against the view they chose.
        await uploadViaPanel(panel);
        expect(handle!.phase()).toBe('placing');

        // 3) FINISH — this is the host wiring SiteBoundaryMap2D uses (emit + land), driven with
        //    a runtime whose bus has no subscribers (the no-wizard case).
        onPlacementCommitted.mockImplementation(() => { void onSitePlanPlacementCommitted({ events: { emit: () => {} } }); });
        findButton(panel, 'Finish').click();
        await flush(); await flush();

        // The plan was handed to the canvas underlay pipeline (→ CREATE_UNDERLAY, P6) …
        expect(onEnterCanvas).toHaveBeenCalledTimes(1);
        expect(onEnterCanvas.mock.calls[0][0].dataUrl).toBe(_raster);
        expect(onEnterCanvas.mock.calls[0][0].rotationZ).toBe(0); // axis-aligned to project north
        // … Project North was committed (P6 path) …
        expect(onCommitNorth).toHaveBeenCalledTimes(1);
        // … the overlay is persisted per-project (survives reload) …
        expect(localStorage.getItem(persistenceKey(PROJ))).toBeTruthy();
        // … and the user is IN THE CANVAS: 3D + plan split, framed.
        expect(handle!.phase()).toBe('finished');
        expect(hooks.closeMap).toHaveBeenCalledTimes(1);
        expect(hooks.activateBimView).toHaveBeenCalledWith('3D');
        expect(hooks.splitActivate).toHaveBeenCalledTimes(1);
        expect(hooks.zoomToFit).toHaveBeenCalledTimes(1);
    });
});
