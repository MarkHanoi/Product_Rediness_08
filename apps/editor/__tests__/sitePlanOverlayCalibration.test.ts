// @vitest-environment happy-dom
//
// §FIX-SITE-OVERLAY-CALIBRATION-EXCLUSIVE (L-69) — the 2-point scale calibration.
//
// Two root causes the founder hit ("the 2 point calibration doesn't work"):
//   1. RENDER/EVENT bug — the overlay's map-click listener read the MapMouseEvent AS the
//      lng/lat (`e.lng`/`e.lat`, undefined) instead of `e.lngLat`, so NO calibration point
//      was ever captured → mpp never computed.
//   2. CLICK THEFT — the boundary DRAW tool also listens on the map; its clicks committed a
//      parcel/rectangle (→ forced the generate flow) before/while calibration ran.
//
// These tests mount the real controller on a fake MapLibre map + drive the two calibration
// clicks, proving: the click coords flow through `e.lngLat`; a real metres-per-pixel scale
// is applied; and `isCalibrating()` (the flag the draw tool yields on) toggles correctly.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the IDB raster store so restore() can seed a placed overlay without real IndexedDB.
const _raster = 'data:image/png;base64,AAAA';
const _get = vi.fn(async () => _raster);
const _put = vi.fn(async () => true);
const _delete = vi.fn(async () => {});
vi.mock('../src/ui/site/overlay/SiteOverlayRasterStore', () => ({
    getSiteOverlayRasterStore: () => ({ get: _get, put: _put, delete: _delete }),
}));

import { mountSitePlanOverlayController, type SitePlanOverlayControllerHandle } from '../src/ui/site/overlay/SitePlanOverlayController';
import { serializeOverlay, writePersistedOverlay } from '../src/ui/site/overlay/sitePlanOverlayPersistence';
import { defaultOverlayTransform } from '../src/ui/site/overlay/sitePlanOverlayGeometry';

// A minimal fake MapLibre map covering what the controller + layer touch.
class FakeMap {
    handlers: Record<string, Array<(e?: unknown) => void>> = {};
    sources = new Map<string, Record<string, unknown>>();
    layers = new Map<string, { paint: Record<string, unknown>; layout: Record<string, unknown> }>();
    on(ev: string, fn: (e?: unknown) => void) { (this.handlers[ev] ??= []).push(fn); }
    off(ev: string, fn: (e?: unknown) => void) { this.handlers[ev] = (this.handlers[ev] ?? []).filter((h) => h !== fn); }
    fire(ev: string, e?: unknown) { (this.handlers[ev] ?? []).slice().forEach((h) => h(e)); }
    getSource(id: string) { return this.sources.get(id); }
    addSource(id: string, def: Record<string, unknown>) { this.sources.set(id, { ...def, setCoordinates() {}, updateImage() {} }); }
    getLayer(id: string) { return this.layers.get(id); }
    addLayer(def: { id: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }) {
        this.layers.set(def.id, { paint: { ...(def.paint ?? {}) }, layout: { ...(def.layout ?? {}) } });
    }
    setPaintProperty() {}
    setLayoutProperty() {}
    removeLayer(id: string) { this.layers.delete(id); }
    removeSource(id: string) { this.sources.delete(id); }
    getCenter() { return { lng: -0.12, lat: 51.5 }; }
    fitBounds() {}
}

const ORIGIN = { lat: 51.5, lon: -0.12 };
const PROJ = 'proj-cal';

function seedOverlay() {
    const rec = serializeOverlay({
        fileName: 'survey.png', sourceKind: 'image', imageDataUrl: _raster, page: 1,
        originLat: ORIGIN.lat, originLon: ORIGIN.lon,
        transform: defaultOverlayTransform(2000, 1400), // longest side → 50 m span
        opacity: 0.7, locked: false, visible: true, calibrated: false,
    });
    writePersistedOverlay(PROJ, rec); // lean metadata → localStorage; raster comes from mocked IDB
}

function findButton(root: HTMLElement, text: string): HTMLButtonElement {
    const btn = Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
    if (!btn) throw new Error(`button not found: ${text}`);
    return btn as HTMLButtonElement;
}

let handle: SitePlanOverlayControllerHandle | null = null;
let toasts: Array<{ msg: string; sev: string }> = [];
let onCommitNorth: ReturnType<typeof vi.fn>;
let onPlacementCommitted: ReturnType<typeof vi.fn>;

let onEnterCanvas: ReturnType<typeof vi.fn>;

beforeEach(() => {
    localStorage.clear();
    _get.mockClear(); _put.mockClear(); _delete.mockClear();
    toasts = [];
    onCommitNorth = vi.fn();
    onPlacementCommitted = vi.fn();
    onEnterCanvas = vi.fn();
    (window as unknown as { prompt: (m?: string, d?: string) => string | null }).prompt = () => '10';
});
afterEach(() => { try { handle?.dispose(); } catch { /* ignore */ } handle = null; });

async function mountWithSeededOverlay(map: FakeMap): Promise<HTMLElement> {
    seedOverlay();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    handle = mountSitePlanOverlayController({
        map: map as unknown as import('maplibre-gl').Map,
        parent,
        getOrigin: () => ORIGIN,
        projectId: PROJ,
        toast: (msg, sev) => { toasts.push({ msg, sev }); },
        onCommitProjectNorth: (theta) => onCommitNorth(theta),
        onPlacementCommitted: () => onPlacementCommitted(),
        onEnterCanvas: (params) => onEnterCanvas(params),
    });
    // restore() is async (awaits the mocked IDB get) — let the microtasks flush.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    return handle.element;
}

describe('§FIX-SITE-OVERLAY-CALIBRATION-EXCLUSIVE — 2-point scale calibration', () => {
    it('restores a placed overlay and renders the calibrate control', async () => {
        const map = new FakeMap();
        const panel = await mountWithSeededOverlay(map);
        expect(map.getSource('pryzm-site-plan-overlay')).toBeTruthy();
        expect(() => findButton(panel, 'calibrate')).not.toThrow();
        expect(handle!.isCalibrating()).toBe(false);
    });

    it('isCalibrating() is false until the user starts, true between the two clicks', async () => {
        const map = new FakeMap();
        const panel = await mountWithSeededOverlay(map);
        expect(handle!.isCalibrating()).toBe(false);
        findButton(panel, 'calibrate').click();
        expect(handle!.isCalibrating()).toBe(true); // draw tool must yield now
        // First calibration click (via e.lngLat — the fixed event shape).
        map.fire('click', { lngLat: { lng: -0.1199, lat: 51.5001 } });
        expect(handle!.isCalibrating()).toBe(true); // still waiting for point b
    });

    it('captures BOTH clicks via e.lngLat, applies a real scale, and ends calibration', async () => {
        const map = new FakeMap();
        const panel = await mountWithSeededOverlay(map);
        findButton(panel, 'calibrate').click();
        map.fire('click', { lngLat: { lng: -0.1199, lat: 51.5001 } }); // point a
        map.fire('click', { lngLat: { lng: -0.1198, lat: 51.5002 } }); // point b → prompt('10') → apply
        // Success toast proves the coords flowed through e.lngLat (else a null point →
        // "Calibration needs two distinct points" error) and a scale was applied.
        expect(toasts.some((t) => t.sev === 'success' && /calibrat/i.test(t.msg))).toBe(true);
        expect(handle!.isCalibrating()).toBe(false);
    });

    it('a map click while NOT calibrating records nothing (no accidental calibration)', async () => {
        const map = new FakeMap();
        await mountWithSeededOverlay(map);
        map.fire('click', { lngLat: { lng: -0.1199, lat: 51.5001 } });
        expect(handle!.isCalibrating()).toBe(false);
        expect(toasts.some((t) => /calibrat/i.test(t.msg))).toBe(false);
    });
});

describe('§FIX-SITE-OVERLAY-IMPORT-TERMINAL — the explicit "Finish — enter canvas" CTA', () => {
    it('renders an obvious terminal CTA once the plan is placed', async () => {
        const map = new FakeMap();
        const panel = await mountWithSeededOverlay(map);
        const cta = findButton(panel, 'Finish');
        expect(cta.textContent).toContain('enter canvas');
        expect(cta.getAttribute('data-testid-alt')).toBe('site-overlay-finish');
    });

    it('clicking Finish COMMITS (sets Project North + signals placement) — the single proceed action', async () => {
        const map = new FakeMap();
        const panel = await mountWithSeededOverlay(map);
        findButton(panel, 'Finish').click();
        // Sets Project North (θ, a finite radian) …
        expect(onCommitNorth).toHaveBeenCalledTimes(1);
        expect(Number.isFinite(onCommitNorth.mock.calls[0][0])).toBe(true);
        // … and signals the host to land in the canvas (the terminal "proceed").
        expect(onPlacementCommitted).toHaveBeenCalledTimes(1);
    });

    it('Finish does NOT emit any boundary/generate — import is decoupled from generation', async () => {
        const map = new FakeMap();
        const panel = await mountWithSeededOverlay(map);
        // The controller has NO parcel-boundary / generate path: the only outward effects of
        // the commit are the two placement callbacks. (SiteBoundaryMap2D turns
        // onPlacementCommitted into `site.overlay-placement-committed`, which the onboarding
        // maps to dispose-into-canvas — never a boundary-set or generate.)
        findButton(panel, 'Finish').click();
        expect(onCommitNorth).toHaveBeenCalledTimes(1);
        expect(onPlacementCommitted).toHaveBeenCalledTimes(1);
        // No parcel-boundary was drawn on the map (no ring source/layer added by the commit).
        expect(map.getSource('pryzm-boundary')).toBeFalsy();
        expect(map.getLayer('pryzm-boundary-fill')).toBeFalsy();
    });
});

describe('§FEAT-SITE-OVERLAY-PLAN-UNDERLAY — Finish hands an axis-aligned underlay to the canvas', () => {
    it('Finish calls onEnterCanvas with the raster + a project-north (axis-aligned) placement', async () => {
        const map = new FakeMap();
        const panel = await mountWithSeededOverlay(map);
        findButton(panel, 'Finish').click();
        expect(onEnterCanvas).toHaveBeenCalledTimes(1);
        const params = onEnterCanvas.mock.calls[0][0];
        // The raster is carried through …
        expect(typeof params.dataUrl).toBe('string');
        expect(params.dataUrl.length).toBeGreaterThan(0);
        // … at correct real-world scale (pxPerMeter = 1/mpp > 0) …
        expect(params.pxPerMeter).toBeGreaterThan(0);
        expect(Number.isFinite(params.pxPerMeter)).toBe(true);
        // … and AXIS-ALIGNED in plan view (project north) — the whole point.
        expect(params.rotationZ).toBe(0);
        expect(params.widthPx).toBeGreaterThan(0);
        expect(params.heightPx).toBeGreaterThan(0);
    });

    it('onEnterCanvas fires BEFORE the placement-committed (canvas underlay ready as the wizard lands)', async () => {
        const order: string[] = [];
        onEnterCanvas.mockImplementation(() => order.push('enter-canvas'));
        onPlacementCommitted.mockImplementation(() => order.push('committed'));
        const map = new FakeMap();
        const panel = await mountWithSeededOverlay(map);
        findButton(panel, 'Finish').click();
        expect(order).toEqual(['enter-canvas', 'committed']);
    });
});
