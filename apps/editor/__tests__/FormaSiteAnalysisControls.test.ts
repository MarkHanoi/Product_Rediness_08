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
// §SITE-METRIC-WIND-CONTRAST (12c60615, LATER than the first cut of this file)
// changed the mount contract on purpose: with a site LOCATION but no ingested
// dataset, the rose no longer latches on an empty "Wind data loading…" state —
// it paints the bundled regional normals, badged "Estimated ·". That estimated
// rose is DISPLAY-ONLY: `resolveDatasetOrFallback()` mints it with a synthetic
// `site-bundled-<token>` siteRef and NEVER ingests it, and `syncOverlayDataset()`
// feeds the 3D overlays from `resolveDataset()` (the STORE) alone. These tests
// pin BOTH halves of that split, because collapsing them would be a real keying
// defect: a display dataset that leaked into the store under a fake site id, or
// a 3D overlay fed a dataset that no Site can resolve.
//
// No network: `globalThis.fetch` is stubbed to reject, so `makeLiveClimateFetch`
// degrades to the bundled tier (C21 §7.4) and CI never touches Open-Meteo/PVGIS.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

type Runtime = ConstructorParameters<typeof FormaSiteAnalysisControls>[1];

// A real runtime backed by REAL stores so getSite()/resolveSite() round-trip.
function makeRuntime(climate: ClimateStore, siteStore: SiteModelStore): Runtime {
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
    } as unknown as Runtime;
}

/** A runtime with NO site and NO location — the genuinely-empty state. */
function makeLocationlessRuntime(climate: ClimateStore): Runtime {
    return {
        audit: { projectId: 'proj-forma-001', actorId: 'u', clientId: 'c' },
        siteModelStore: {
            getSite: () => null,
            getLocation: () => ({ latitude: 0, longitude: 0, elevationAsl: 0 }),
            subscribe: () => () => undefined,
            set: () => undefined,
        },
        climateStore: climate,
        events: { emit: () => {}, on: () => () => {} },
    } as unknown as Runtime;
}

function windRoseHasBars(root: HTMLElement): boolean {
    // The populated rose draws stacked speed-band <line>s with a stroke-width of 6;
    // the empty rose draws only the grid (stroke-width 1) + axes.
    return Array.from(root.querySelectorAll('line'))
        .some((ln) => ln.getAttribute('stroke-width') === '6');
}

/** Poll a predicate across macrotasks (the proactive ingest is async: a dynamic
 *  import + an awaited command). Returns as soon as it holds. */
async function waitFor(pred: () => boolean, ticks = 200): Promise<void> {
    for (let i = 0; i < ticks && !pred(); i++) {
        await new Promise((r) => setTimeout(r, 5));
    }
}

let host: HTMLElement;

beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    // Force the bundled (offline) tier — no network in CI. The live upgrade in
    // ensureSiteClimate is best-effort and swallows this rejection by design.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline (test)'))));
});

afterEach(() => {
    host.remove();
    vi.unstubAllGlobals();
});

describe('FormaSiteAnalysisControls — wind rose repaint round-trip', () => {
    it('shows the empty state when there is no site AND no location to derive one from', () => {
        const climate = new ClimateStore();

        const controls = new FormaSiteAnalysisControls(makeViewport(), makeLocationlessRuntime(climate), host);
        controls.mount();

        // No location → no bundled fallback is derivable → the honest transient.
        expect(host.textContent).toContain('Wind data loading');
        expect(windRoseHasBars(host)).toBe(false);
        // …and nothing was ingested: with no Site there is nothing to key to.
        expect(climate.size()).toBe(0);
        controls.dispose();
    });

    it('§SITE-METRIC-WIND-CONTRAST — paints the ESTIMATED regional rose at mount, and never leaks it into the store', () => {
        const climate = new ClimateStore();
        const siteStore = new SiteModelStore();
        siteCreate({ projectId: 'proj-forma-001', location: { latitude: 41.39, longitude: 2.17 } }, siteStore);

        const viewport = makeViewport();
        const controls = new FormaSiteAnalysisControls(viewport, makeRuntime(climate, siteStore), host);
        controls.mount();

        // A location exists → the rose paints bundled regional normals immediately,
        // badged as an estimate (the founder's "empty rose" complaint, fixed).
        expect(windRoseHasBars(host)).toBe(true);
        expect(host.textContent).toContain('Estimated');

        // But it is DISPLAY-ONLY. Synchronously at mount (before the async ingest
        // settles) the store is still empty — the estimated dataset is NOT ingested
        // under its synthetic `site-bundled-<token>` siteRef, which would be exactly
        // the keying defect that makes `resolveSite(site.id)` lie.
        expect(climate.size()).toBe(0);
        expect(climate.archive().some((d) => String(d.siteRef).startsWith('site-bundled-'))).toBe(false);
        // …and the 3D overlays are fed from the STORE only — never the estimate.
        expect(viewport.climateDatasets.every((d) => d === null || d === undefined)).toBe(true);
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
        // At mount the overlay has NOT been fed a dataset (the rose is the estimate).
        expect(viewport.climateDatasets.every((d) => d === null || d === undefined)).toBe(true);

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

        // The rose has speed-band bars …
        expect(windRoseHasBars(host)).toBe(true);
        // … it now resolves under the SITE's own id (no keying mismatch) …
        expect(climate.resolveSite(site.id as never)).toBe(ds);
        // … and the 3D wind/heat overlay was re-fed the same dataset.
        expect(viewport.climateDatasets.some((d) => d === ds)).toBe(true);
        controls.dispose();
    });

    it('proactively ingests bundled climate on mount when a site+location exist', async () => {
        const climate = new ClimateStore();
        const siteStore = new SiteModelStore();
        siteCreate({ projectId: 'proj-forma-001', location: { latitude: 41.39, longitude: 2.17 } }, siteStore);
        const siteId = siteStore.getSite()!.id;

        const viewport = makeViewport();
        const controls = new FormaSiteAnalysisControls(viewport, makeRuntime(climate, siteStore), host);
        controls.mount();

        // ensureClimateIfMissing → ensureSiteClimate runs async (dynamic import +
        // awaited command; the bundled stage is network-free). Poll on the REAL
        // invariant — the dataset resolving under the site's own id. (Polling on
        // "the rose has bars" would short-circuit instantly on the ESTIMATED rose
        // and never actually await the ingest.)
        await waitFor(() => climate.resolveSite(siteId as never) !== null);

        const resolved = climate.resolveSite(siteId as never);
        expect(resolved).not.toBeNull();
        // Keyed to the SITE — not to a synthetic bundled token.
        expect(resolved!.siteRef).toBe(siteId);
        expect(windRoseHasBars(host)).toBe(true);
        // The store dataset reached the 3D overlays via the post-ingest repaint.
        expect(viewport.climateDatasets.some((d) => d === resolved)).toBe(true);
        controls.dispose();
    });
});
