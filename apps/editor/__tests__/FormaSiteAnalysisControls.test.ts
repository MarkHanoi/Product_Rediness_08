// @vitest-environment happy-dom
//
// A.21.D40(#6) — FormaSiteAnalysisControls wind-rose repaint round-trip.
//
// The founder's recurring "empty Wind rose on the house → Forma flow" is an
// EDITOR-SIDE repaint bug, not a data bug (the offline ClimateDataset has a
// proven non-empty 16-sector rose). These tests drive the real controls against
// the REAL `ClimateStore` + `SiteModelStore` so the full
// ingest → store._notify → subscription → renderWindRose round-trip is exercised
// — exactly the link that was silently stale.
//
// No network: the controls' proactive ingest is forced to the bundled tier and
// we also exercise an explicit ingest into the live store.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClimateStore, SiteModelStore, siteCreate } from '@pryzm/stores';
import { buildFallbackClimateDataset } from '@pryzm/climate-host';
import { FormaSiteAnalysisControls, type FormaSunViewport } from '../src/ui/geospatial/FormaSiteAnalysisControls';

// ── A minimal FormaSunViewport stub (no Cesium) ────────────────────────────────

function makeViewport(): FormaSunViewport & { climateDatasets: unknown[]; windOn: boolean } {
    const state = { climateDatasets: [] as unknown[], windOn: false };
    let sunDate = new Date('2026-06-21T12:00:00.000Z');
    return {
        ...state,
        setFormaSunTime(d: Date) { sunDate = d; },
        getFormaSunTime() { return sunDate; },
        getFormaSunPosition() { return { altitudeDeg: 50, azimuthDeg: 180, isAboveHorizon: true }; },
        onFormaSunChange() { return () => undefined; },
        setClimateOverlayDataset(ds: unknown) { state.climateDatasets.push(ds); },
        setSunPathOverlay() { /* no-op */ },
        setWindOverlay(on: boolean) { state.windOn = on; },
        setHeatOverlay() { /* no-op */ },
    };
}

// A real runtime backed by REAL stores so getSite()/resolveSite() round-trip.
function makeRuntime(climate: ClimateStore, siteStore: SiteModelStore) {
    return {
        audit: { projectId: 'proj-forma-001', actorId: 'u', clientId: 'c' },
        siteModelStore: {
            getSite: () => siteStore.getSite(),
            getLocation: () => ({ latitude: 41.3874, longitude: 2.1686, elevationAsl: 12 }),
            subscribe: (fn: () => void) => siteStore.subscribe(fn),
            set: (s: unknown) => siteStore.set(s as never),
        },
        climateStore: climate,
        events: { emit: () => {}, on: () => () => {} },
    } as unknown as ConstructorParameters<typeof FormaSiteAnalysisControls>[1];
}

function windRoseHasBars(root: HTMLElement): boolean {
    // The populated rose draws stacked speed-band <line>s with a stroke-width of 6;
    // the empty rose draws only the grid (stroke-width 1) + axes.
    return Array.from(root.querySelectorAll('line'))
        .some((ln) => ln.getAttribute('stroke-width') === '6');
}

let host: HTMLElement;

beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
});

afterEach(() => {
    host.remove();
});

describe('FormaSiteAnalysisControls — wind rose repaint round-trip', () => {
    it('shows the empty state when the site has no climate dataset yet', () => {
        const climate = new ClimateStore();
        const siteStore = new SiteModelStore();
        // Author a Site WITHOUT a dataset.
        siteCreate({ projectId: 'proj-forma-001', location: { latitude: 41.39, longitude: 2.17 } }, siteStore);

        const controls = new FormaSiteAnalysisControls(makeViewport(), makeRuntime(climate, siteStore), host);
        controls.mount();

        expect(host.textContent).toContain('No wind data');
        expect(windRoseHasBars(host)).toBe(false);
        controls.dispose();
    });

    it('REPAINTS the rose when a dataset lands AFTER mount (the stale-rose bug)', () => {
        const climate = new ClimateStore();
        const siteStore = new SiteModelStore();
        siteCreate({ projectId: 'proj-forma-001', location: { latitude: 41.39, longitude: 2.17 } }, siteStore);
        const site = siteStore.getSite()!;

        const viewport = makeViewport();
        const controls = new FormaSiteAnalysisControls(viewport, makeRuntime(climate, siteStore), host);
        controls.mount();
        // Empty at mount.
        expect(windRoseHasBars(host)).toBe(false);

        // Simulate the async climate ingest settling AFTER the panel mounted (the
        // generate-house → Forma timing): a bundled dataset is ingested into the
        // SAME store the controls subscribed to. The subscription must repaint.
        const ds = buildFallbackClimateDataset({
            id: 'climate:TEST00000000FORMA',
            siteRef: site.id,
            lat: 41.3874,
            lon: 2.1686,
            nowIso: '2026-06-08T00:00:00.000Z',
        });
        climate.ingest(ds);

        // The rose now has speed-band bars …
        expect(windRoseHasBars(host)).toBe(true);
        // … and the 3D wind/heat overlay was re-fed the same dataset.
        expect(viewport.climateDatasets.some((d) => d === ds)).toBe(true);
        controls.dispose();
    });

    it('proactively ingests bundled climate on mount when a site+location exist', async () => {
        const climate = new ClimateStore();
        const siteStore = new SiteModelStore();
        siteCreate({ projectId: 'proj-forma-001', location: { latitude: 41.39, longitude: 2.17 } }, siteStore);

        const controls = new FormaSiteAnalysisControls(makeViewport(), makeRuntime(climate, siteStore), host);
        controls.mount();

        // ensureClimateIfMissing → ensureSiteClimate runs async (bundled stage is
        // network-free); wait a few microtasks for it to settle + repaint.
        for (let i = 0; i < 20 && !windRoseHasBars(host); i++) {
            await new Promise((r) => setTimeout(r, 0));
        }
        expect(climate.resolveSite(siteStore.getSite()!.id as never)).not.toBeNull();
        expect(windRoseHasBars(host)).toBe(true);
        controls.dispose();
    });
});
