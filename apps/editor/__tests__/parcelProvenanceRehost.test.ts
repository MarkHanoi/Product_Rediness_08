// @vitest-environment happy-dom
//
// §L-1580 / §L-1581 / §L-1582 (C57 §1.4 / §1.5 / §1.9 / §2.4 · C06 §13.3 · C19 §2.6) —
// THE EXECUTABLE GUARD for the persisted parcel provenance and its ONE card.
//
// Modelled on `gisActionRegistry.test.ts`: the subject under test is the REAL schema, the
// REAL command handler, the REAL card producer and the REAL panel source. The only fakes
// are stores and a runtime — the environment, not the subject. A fake built from the
// header cannot falsify the header, so nothing here is built from one.
//
// The four things this file refuses to let regress:
//
//   1. Provenance SURVIVES the commit and a save/load round-trip. Before §L-1580 it was
//      dropped at `dispatchParcelBoundary`, so `grep -rn refcat packages/schemas/src`
//      returned zero hits and no committed parcel could say where it came from.
//   2. A FOOTPRINT is never labelled a cadastral parcel (C57 §1.5 / §1.13.4).
//   3. ABSENT provenance renders a STATED ABSENCE, never zeros and never a blank.
//   4. The GIS panel HOSTS the one producer rather than re-implementing it (C06 §13.3).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    ParcelProvenanceSchema,
    ParcelSchema,
    SiteModelSchema,
    isCadastralParcel,
    type ParcelProvenance,
} from '@pryzm/schemas';
import { siteSetParcelBoundary } from '@pryzm/stores';
import {
    buildParcelCard,
    parcelFeatureToProvenance,
    parcelFeatureToCardModel,
    parcelProvenanceToCardModel,
    PARCEL_FOOTPRINT_WARNING,
    PARCEL_PROVENANCE_ABSENT_TEXT,
    PARCEL_NO_BOUNDARY_TEXT,
    PARCEL_AREA_DERIVED_NOTE,
} from '../src/ui/site/parcel/parcelCard';
import {
    buildParcelSectionBody,
    buildOpenMapAction,
    mountParcelSection,
} from '../src/ui/site/parcel/parcelPanelSection';
import { GIS_ACTIONS } from '../src/ui/gis/gisActionRegistry';

const SRC_DIR = resolve(__dirname, '..', 'src');

// ── Fixtures ────────────────────────────────────────────────────────────────────
//
// A real-shaped Catastro parcel and a real-shaped OSM footprint, matching what
// `CatastroParcelProvider` / `footprintPick` actually emit (the `source` strings are
// verbatim from `parcelRegistry.ts`'s own header).

const CADASTRAL_FEATURE = {
    ring: [
        { lat: 41.3888, lon: 2.1590 },
        { lat: 41.3889, lon: 2.1592 },
        { lat: 41.3887, lon: 2.1593 },
    ],
    refcat: '9872023VH5797S',
    areaM2: 512,
    address: 'CL EXAMPLE 12, BARCELONA',
    source: 'catastro',
    confidence: {
        match: 'high' as const,
        areaSource: 'registry-declared' as const,
        areaOfficialM2: 512,
        areaSigM2: 508.4,
        areaDeltaPct: 0.7,
        pointToParcelM: 0,
        candidateMarginM: null,
        geometryComplete: true,
    },
};

const FOOTPRINT_FEATURE = {
    ring: CADASTRAL_FEATURE.ring,
    refcat: 'way/123456789',
    areaM2: 180,
    address: null,
    source: 'footprint (OSM)',
    confidence: {
        match: 'low' as const,
        areaSource: 'derived-from-ring' as const,
        areaOfficialM2: null,
        areaSigM2: 180.2,
        areaDeltaPct: null,
        pointToParcelM: null,
        candidateMarginM: null,
        geometryComplete: true,
    },
};

const SQUARE = [
    { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 25 }, { x: 0, z: 25 },
];
const EDGES = ['front', 'side', 'rear', 'side'] as const;

/** The minimal SiteModelStore surface `siteSetParcelBoundary` touches. */
function makeStore(site: unknown) {
    let current = site;
    const listeners = new Set<() => void>();
    return {
        getSite: () => current as never,
        set: (next: unknown) => { current = next; listeners.forEach((l) => l()); },
        subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
        current: () => current,
    };
}

function baseSite() {
    return SiteModelSchema.parse({
        id: 'site_00000000-0000-7000-8000-000000000001',
        projectId: 'proj_00000000-0000-7000-8000-000000000002',
        name: 'Site',
        location: { latitude: 41.3888, longitude: 2.1590 },
        parcel: {},
        provenance: { source: 'user-authored' },
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. THE PERSISTENCE GAP — C57 §1.4 "Provenance is not optional"
// ═══════════════════════════════════════════════════════════════════════════════

describe('§L-1580 — the committed parcel carries its cadastral provenance', () => {
    it('gives the C19 Parcel somewhere to put refcat at all', () => {
        // The measurement that named the breach: before §L-1580 the schema layer had no
        // field of this shape anywhere, so the seam could not have been fixed downstream.
        const parcel = ParcelSchema.parse({});
        expect(parcel.provenance).toBeNull();
        expect('provenance' in parcel).toBe(true);
    });

    it('survives site.setParcelBoundary and lands on the store', () => {
        const store = makeStore(baseSite());
        const provenance = parcelFeatureToProvenance(CADASTRAL_FEATURE, {
            providerLabel: 'Dirección General del Catastro',
            sourceCrs: 'EPSG:25831',
            license: 'CC-BY-4.0',
            jurisdictionId: 'es-barcelona',
            now: () => '2026-08-20T10:00:00.000Z',
        });

        const res = siteSetParcelBoundary({
            siteId: (store.getSite() as { id: string }).id,
            boundary: { polygon: SQUARE, edgeClassifications: [...EDGES] },
            provenance,
        }, store as never);

        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.site.parcel.provenance?.refcat).toBe('9872023VH5797S');
        expect(res.site.parcel.provenance?.kind).toBe('cadastral');
        expect(res.site.parcel.provenance?.sourceCrs).toBe('EPSG:25831');
        expect(res.site.parcel.provenance?.confidence?.areaSource).toBe('registry-declared');
        // The event carries it too — a subscriber must not have to re-read the store.
        expect(res.event.provenance?.refcat).toBe('9872023VH5797S');
    });

    it('records NOTHING rather than inventing a source when the caller supplies none', () => {
        // The hand-drawn path. A fabricated `source` reads exactly like a real one, so the
        // honest value is null — which the UI then renders in words.
        const store = makeStore(baseSite());
        const res = siteSetParcelBoundary({
            siteId: (store.getSite() as { id: string }).id,
            boundary: { polygon: SQUARE, edgeClassifications: [...EDGES] },
        }, store as never);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.site.parcel.provenance).toBeNull();
        expect(res.event.provenance).toBeNull();
    });

    it('round-trips through save/load (JSON → SiteModelSchema.parse), losing nothing', () => {
        // `ProjectSerializer` structuredClones the SiteModel and `restoreSiteState` re-parses
        // it with SiteModelSchema — so a field that survives THIS survives the file.
        const store = makeStore(baseSite());
        const provenance = parcelFeatureToProvenance(CADASTRAL_FEATURE, {
            providerLabel: 'Dirección General del Catastro',
            sourceCrs: 'EPSG:25831',
            license: 'CC-BY-4.0',
            jurisdictionId: 'es-barcelona',
            now: () => '2026-08-20T10:00:00.000Z',
        });
        const res = siteSetParcelBoundary({
            siteId: (store.getSite() as { id: string }).id,
            boundary: { polygon: SQUARE, edgeClassifications: [...EDGES] },
            provenance,
        }, store as never);
        expect(res.ok).toBe(true);
        if (!res.ok) return;

        const rehydrated = SiteModelSchema.parse(JSON.parse(JSON.stringify(res.site)));
        expect(rehydrated.parcel.provenance).toEqual(res.site.parcel.provenance);
        expect(rehydrated.parcel.provenance?.label).toBe('Dirección General del Catastro');
        expect(rehydrated.parcel.provenance?.ingestTimestamp).toBe('2026-08-20T10:00:00.000Z');
    });

    it('reads a PRE-§L-1580 snapshot (no provenance key) as NOT RECORDED, not as a crash', () => {
        const legacy = JSON.parse(JSON.stringify(baseSite())) as Record<string, unknown>;
        (legacy['parcel'] as Record<string, unknown>) = {
            boundary: { polygon: SQUARE, edgeClassifications: [...EDGES] },
            area: 500,
        };
        const parsed = SiteModelSchema.parse(legacy);
        expect(parsed.parcel.provenance).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. FOOTPRINT IS NEVER A CADASTRAL PARCEL — C57 §1.5 / §1.13.4
// ═══════════════════════════════════════════════════════════════════════════════

describe('§L-1581 — a footprint is never presented as a legal cadastral parcel', () => {
    it('classifies the OSM footprint as kind "footprint" at the commit seam', () => {
        const p = parcelFeatureToProvenance(FOOTPRINT_FEATURE, { providerLabel: 'OSM' });
        expect(p.kind).toBe('footprint');
        expect(isCadastralParcel(p)).toBe(false);
    });

    it('classifies a real cadastre as kind "cadastral"', () => {
        const p = parcelFeatureToProvenance(CADASTRAL_FEATURE, { providerLabel: 'Catastro' });
        expect(p.kind).toBe('cadastral');
        expect(isCadastralParcel(p)).toBe(true);
    });

    it('renders the footprint warning and labels the id "OSM id", never "Ref"', () => {
        const card = buildParcelCard(parcelFeatureToCardModel(FOOTPRINT_FEATURE, 'OSM'));
        expect(card.getAttribute('data-parcel-kind')).toBe('footprint');
        expect(card.textContent).toContain(PARCEL_FOOTPRINT_WARNING);
        expect(card.textContent).toContain('OSM id');
        // The key column must not call an OSM way id a cadastral reference.
        const keys = [...card.querySelectorAll('.pryzm-parcel-card-key')].map((n) => n.textContent);
        expect(keys).not.toContain('Ref');
    });

    it('does NOT warn on a real cadastral parcel', () => {
        const card = buildParcelCard(parcelFeatureToCardModel(CADASTRAL_FEATURE, 'Catastro'));
        expect(card.getAttribute('data-parcel-kind')).toBe('cadastral');
        expect(card.querySelector('[data-testid="parcel-footprint-warning"]')).toBeNull();
    });

    it('cannot be defeated by renaming the provider away from the substring "footprint"', () => {
        // The pre-§L-1581 map card tested `/footprint/i.test(parcel.source)`. That predicate
        // is one rename away from silently reclassifying a building outline as a legal
        // parcel — which is why the KIND is a stored field the card reads, not a regex the
        // card re-runs. Here the kind is stamped 'footprint' while the source says otherwise.
        const renamed: ParcelProvenance = ParcelProvenanceSchema.parse({
            ...parcelFeatureToProvenance(FOOTPRINT_FEATURE, { providerLabel: 'Overture buildings' }),
            kind: 'footprint',
            source: 'overture-buildings',
        });
        const card = buildParcelCard(parcelProvenanceToCardModel(renamed));
        expect(card.textContent).toContain(PARCEL_FOOTPRINT_WARNING);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. AREA HONESTY (KV-3 / §L-640) and ABSENCE (C84 EI-1b)
// ═══════════════════════════════════════════════════════════════════════════════

describe('§L-1581 — registry-declared and ring-derived area stay distinct', () => {
    it('labels a registry-declared area as such and shows the ring area alongside it', () => {
        const card = buildParcelCard(parcelFeatureToCardModel(CADASTRAL_FEATURE, 'Catastro'));
        const keys = [...card.querySelectorAll('.pryzm-parcel-card-key')].map((n) => n.textContent);
        expect(keys).toContain('Area (registry)');
        expect(keys).toContain('Area (from ring)');
        // ⛔ A bare "Area" row would be the KV-3 collapse re-created in the UI.
        expect(keys).not.toContain('Area');
    });

    it('says so, in words, when the area is shoelace-derived', () => {
        const card = buildParcelCard(parcelFeatureToCardModel(FOOTPRINT_FEATURE, 'OSM'));
        expect(card.textContent).toContain(PARCEL_AREA_DERIVED_NOTE);
    });
});

describe('§L-1582 — absence is a sentence, never zeros and never a blank', () => {
    it('renders the stated-absence card when there is no provenance', () => {
        const card = buildParcelCard(null);
        expect(card.getAttribute('data-parcel-provenance')).toBe('absent');
        expect(card.querySelector('[data-testid="parcel-info-absent"]')?.textContent)
            .toBe(PARCEL_PROVENANCE_ABSENT_TEXT);
        // The two failures this arm exists to prevent, asserted directly.
        expect(card.textContent?.trim().length ?? 0).toBeGreaterThan(80);
        expect(card.textContent).not.toMatch(/\b0 m²/);
    });

    it('distinguishes "no boundary yet" from "boundary committed, provenance not recorded"', () => {
        const noBoundary = buildParcelSectionBody(null);
        expect(noBoundary.textContent).toContain(PARCEL_NO_BOUNDARY_TEXT);

        const legacy = SiteModelSchema.parse({
            ...JSON.parse(JSON.stringify(baseSite())),
            parcel: { boundary: { polygon: SQUARE, edgeClassifications: [...EDGES] }, area: 500 },
        });
        const committed = buildParcelSectionBody(legacy);
        expect(committed.textContent).toContain(PARCEL_PROVENANCE_ABSENT_TEXT);
        expect(committed.textContent).not.toContain(PARCEL_NO_BOUNDARY_TEXT);
        // The area IS known and is shown; what is unknown is where the ring came from.
        expect(committed.textContent).toContain('500 m²');
    });

    it('renders the FULL card for a site whose parcel does carry provenance', () => {
        const store = makeStore(baseSite());
        const res = siteSetParcelBoundary({
            siteId: (store.getSite() as { id: string }).id,
            boundary: { polygon: SQUARE, edgeClassifications: [...EDGES] },
            provenance: parcelFeatureToProvenance(CADASTRAL_FEATURE, {
                providerLabel: 'Dirección General del Catastro',
                now: () => '2026-08-20T10:00:00.000Z',
            }),
        }, store as never);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const body = buildParcelSectionBody(res.site);
        expect(body.getAttribute('data-parcel-provenance')).toBe('present');
        expect(body.textContent).toContain('9872023VH5797S');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3b. §L-1585 — THE BUTTON. Founder: "just bring visible AGAIN VIA BUTTON ON THE GIS PANEL"
//
// A section that can only say "not recorded" and offers nothing to press is the L-942 shape:
// a refusing branch whose escape hatch was never built. Every state must carry the route.
// ═══════════════════════════════════════════════════════════════════════════════

describe('§L-1585 — the section carries a labelled button in EVERY state', () => {
    // ⚠ UPDATED 2026-09-06 (§VIEW-PANEL-PER-PANE). `site.map-2d` now declares TWO entry
    // points — it opens the 2D map AND forces the pastel vector basemap — because the
    // founder's view panel offers `2D Site Map` and `2D Satellite` as siblings, and a
    // "2D Site Map" press from satellite that only re-entered a view the user is already in
    // would change nothing on screen. `resolveGisAction` refuses an action with ANY missing
    // entry point, so a host fake built from the OLD shape now renders this button disabled.
    // The fake is the ENVIRONMENT, not the subject: production registers both hooks in the
    // same `mountGISArea` pass, and `gisActionRegistry.test.ts` asserts every declared entry
    // point has an assignment in production source.
    const liveHost = {
        pryzmEnterSiteView: () => { /* recorded below */ },
        pryzmSetSiteBasemap: () => { /* recorded below */ },
    };

    it('renders the button when there is no boundary at all', () => {
        const body = buildParcelSectionBody(null, [buildOpenMapAction(liveHost)]);
        const btn = body.querySelector('[data-testid="parcel-open-map-btn"]');
        expect(btn, 'the "no boundary" state has no way to get a parcel').not.toBeNull();
        expect((btn as HTMLButtonElement).disabled).toBe(false);
    });

    it('renders the button on the "provenance not recorded" state — the L-942 arm', () => {
        const legacy = SiteModelSchema.parse({
            ...JSON.parse(JSON.stringify(baseSite())),
            parcel: { boundary: { polygon: SQUARE, edgeClassifications: [...EDGES] }, area: 500 },
        });
        const body = buildParcelSectionBody(legacy, [buildOpenMapAction(liveHost)]);
        expect(body.textContent).toContain(PARCEL_PROVENANCE_ABSENT_TEXT);
        expect(
            body.querySelector('[data-testid="parcel-open-map-btn"]'),
            'a refusal with no escape hatch — the founder cannot act on this panel',
        ).not.toBeNull();
    });

    it('dispatches the DECLARED site.map-2d action, not a hand-written handler', () => {
        const calls: string[] = [];
        const host = {
            pryzmEnterSiteView: (v?: string) => { calls.push(`enter(${v})`); },
            pryzmSetSiteBasemap: (v?: string) => { calls.push(`basemap(${v})`); },
        };
        const action = buildOpenMapAction(host);
        action.onClick();
        // The declared action's own dispatch is what runs — asserted against the registry.
        const decl = GIS_ACTIONS.find((a) => a.id === 'site.map-2d');
        expect(decl, 'site.map-2d is no longer declared — the button lost its authority').toBeDefined();
        // ⭐ BOTH declared halves run. The basemap half is what makes "open the 2D map" mean
        // the pastel vector map rather than "whatever style was last left up" (§VIEW-PANEL-PER-PANE).
        expect(calls).toEqual(['enter(map2d)', 'basemap(map)']);
        expect(decl!.entryPoints).toEqual(['pryzmEnterSiteView', 'pryzmSetSiteBasemap']);
    });

    it('mountParcelSection puts the card AND the button into a real host element', () => {
        // The end-to-end reachability arm: a host div + a runtime-shaped store, mounted by
        // the same function the GIS panel calls. Asserted on the DOM, not on a return value.
        (globalThis as unknown as { window: unknown }).window = Object.assign(
            (globalThis as unknown as { window: Record<string, unknown> }).window ?? {},
            { pryzmEnterSiteView: () => { /* live entry point */ } },
        );
        const store = makeStore(SiteModelSchema.parse({
            ...JSON.parse(JSON.stringify(baseSite())),
            parcel: { boundary: { polygon: SQUARE, edgeClassifications: [...EDGES] }, area: 500 },
        }));
        const hostEl = document.createElement('div');
        document.body.appendChild(hostEl);
        const handle = mountParcelSection(
            hostEl,
            { siteModelStore: store } as never,
        );
        expect(hostEl.querySelector('[data-testid="parcel-info-card"]')).not.toBeNull();
        expect(hostEl.querySelector('[data-testid="parcel-open-map-btn"]')).not.toBeNull();
        handle.dispose();
        hostEl.remove();
    });

    it('renders DISABLED with a reason when the entry point is not registered', () => {
        const action = buildOpenMapAction({});
        expect(action.disabled).toBe(true);
        expect(action.title ?? '').toContain('not registered');
        const body = buildParcelSectionBody(null, [action]);
        const btn = body.querySelector('[data-testid="parcel-open-map-btn"]') as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        expect(btn.getAttribute('aria-disabled')).toBe('true');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. C57 §1.9 — ATTRIBUTION IS MANDATORY
// ═══════════════════════════════════════════════════════════════════════════════

describe('§L-1581 — the provider attribution is shown wherever its data is (C57 §1.9)', () => {
    it('renders the provider label on every non-absent card', () => {
        for (const [feature, label] of [
            [CADASTRAL_FEATURE, 'Dirección General del Catastro'],
            [FOOTPRINT_FEATURE, 'Building footprint (OSM) — not a cadastral parcel'],
        ] as const) {
            const card = buildParcelCard(parcelFeatureToCardModel(feature, label));
            const attr = card.querySelector('[data-testid="parcel-source-attribution"]');
            expect(attr, `no attribution rendered for ${label}`).not.toBeNull();
            expect(attr?.textContent).toContain(label);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. C06 §13.3 — ONE PRODUCER, RE-HOSTED, NEVER RE-IMPLEMENTED
// ═══════════════════════════════════════════════════════════════════════════════

describe('§GIS-PARCEL-REHOST (L-1582) — the panel hosts the card, it does not rebuild it', () => {
    const PANEL_SRC = readFileSync(
        resolve(SRC_DIR, 'ui', 'ViewBrowser', 'ProjectBrowserPanel.ts'), 'utf8');
    const MAP_SRC = readFileSync(
        resolve(SRC_DIR, 'ui', 'geospatial', 'SiteBoundaryMap2D.ts'), 'utf8');

    it('the GIS panel offers a parcel slot and mounts the shared producer into it', () => {
        expect(PANEL_SRC).toContain('mountParcelSection');
        expect(PANEL_SRC).toContain('pb-gis-parcel-slot');
    });

    it('the MAP mounts the same producer — a re-host is only a re-host if both sides move', () => {
        // §GIS-ENVELOPE-REHOST's failure mode, restated: extracting a card and leaving the
        // original in place produces two producers, which is the thing being fixed.
        expect(MAP_SRC).toContain('buildParcelCard');
        expect(MAP_SRC).toContain('parcelFeatureToCardModel');
    });

    it('neither surface hand-builds parcel fact rows of its own', () => {
        for (const [name, src] of [['ProjectBrowserPanel', PANEL_SRC], ['SiteBoundaryMap2D', MAP_SRC]] as const) {
            // The pre-§L-1581 map built `row('Ref', …)` / `row('Area', …)` inline. Either
            // spelling reappearing means a second card has started to grow.
            expect(
                /row\(\s*'(Ref|Addr|Area|Zone)'/.test(src),
                `${name} hand-builds a parcel fact row. The card has ONE producer (parcelCard.ts).`,
            ).toBe(false);
        }
    });

    it('the map no longer renders SAMPLE parcel values behind a warning banner', () => {
        // §L-1584 — `showStubParcelCard` used to print `Ref: —— sample ——` and `Area: ≈ 500 m²`.
        // A fabricated number under a banner is still a fabricated number on screen.
        expect(MAP_SRC).not.toContain('—— sample ——');
        expect(MAP_SRC).not.toContain('≈ 500 m²');
    });

    it('the map still commits provenance with the ring (the seam that was dropping it)', () => {
        expect(MAP_SRC).toContain('parcelFeatureToProvenance');
        expect(MAP_SRC).toContain('provenanceForCommit');
    });
});
