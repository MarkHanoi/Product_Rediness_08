// SOURCE REGISTRY — SWITZERLAND (CH). Seeded 2026-09-01 from the prose registries, verbatim
// (supplement §7): parcelProviders/registry.ts `swisstopo-av` row (L-627) + heightSources.mjs
// `swissbuildings3d` row + REPORT §G CH rows ("CH swisstopo OGD | attribution, commercial
// OK | GREEN").
//
// HONEST ABSENCES: geodienste.ch NPL (nutzungsplanung) — §G grades it YELLOW ("capture the
// per-canton flag matrix before shipping a canton — NOT done, L2 gap") but no probed endpoint
// URL exists in the prose registries; ÖREB extracts (§G GREEN, "never cache stale law —
// option 1 strictly") likewise carry no probed URL here. Both wait for their probe, not for
// an invented row.

import { defineSources } from './defineSources.js';

export const CH_SOURCES = defineSources('CH', [
    {
        id: 'ch-swisstopo-av-identify',
        country: 'CH',
        authority: 'swisstopo + cantons (Amtliche Vermessung)',
        dataset: 'ch.kantone.cadastralwebmap-farbe identify (ArcGIS-REST dialect) — Grundstück with EGRID + local parcel number + canton',
        endpoint: 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify',
        protocol: 'REST',
        licence: {
            id: 'geo.admin.ch FSDI terms — free, commercial OK, fair-use ~20 req/min avg, attribution © swisstopo + canton',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-07-26',
                note: 'registry.ts swisstopo-av (L-627 flip footprint→cadastral): Esri-JSON rings, real Grundstück egris_egrid CH119192997709 @ Zürich, local number AA8048, canton ak — keyless, all-canton (ZH + GE live-verified). See ch/findings/ZURICH-PARCEL-SOURCE.md.',
            },
        ],
        theme: 'cadastre',
        coverage: 'all-canton',
        updateFrequency: null,
        adapterStatus: 'live', // wired, proxy /api/parcel/ch
    },
    {
        id: 'ch-swisstopo-stac-ndsm',
        country: 'CH',
        authority: 'swisstopo (data.geo.admin.ch STAC)',
        dataset: 'ch.swisstopo.swissalti3d (DTM) + ch.swisstopo.swisssurface3d-raster (DSM) — per-1km COG GeoTIFF, EPSG:2056 (LV95), 0.5 m/2 m; nDSM = DSM−DTM P90 per footprint',
        endpoint: 'https://data.geo.admin.ch',
        protocol: 'REST',
        licence: {
            id: 'swisstopo OpenData / CC-BY, commercial OK (open since 2021)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 2,
        gate: null,
        probes: [
            {
                date: '2026-07-27',
                note: 'heightSources.mjs swissbuildings3d (impl:documented) — VERDICT REVISED by live probe: the plain WCS-2 GetCoverage-in-4326 shape is FALSE (HTTP 404 NoSuchKey — data.geo.admin.ch is an object store, no WCS); BOTH STAC collections HTTP 200, per-1km COG tiles via /items?bbox=. Real wiring = STAC→COG-stitch + LV95↔WGS84 projector — a BUILD, not a credential gate.',
            },
        ],
        theme: 'heights',
        coverage: 'full (heightSources coverage:full)',
        updateFrequency: null,
        adapterStatus: 'documented',
    },
]);
