// SOURCE REGISTRY — PORTUGAL (PT). Seeded 2026-09-01 from the prose registries, verbatim
// (supplement §7): parcelProviders/registry.ts `dgt-cadastro-predial` row + REPORT §F PT /
// §G PT row ("PT DGT / SNIC / CRUS | CC BY 4.0 | GREEN | BUPi RGG polygon openness NOT
// CONFIRMED — treat as identity gate, not missing").
//
// HONEST ABSENCE: the DGT national LiDAR nDSM (heightSources.mjs dgt_pt, impl:documented)
// carries no service URL in the prose registries — endpoint prose only ("DGT CDD LiDAR
// 2024–25, 10 pts/m², open"); a row without a real endpoint would be invented. It waits for
// the probe that captures the URL.

import { defineSources } from './defineSources.js';

export const PT_SOURCES = defineSources('PT', [
    {
        id: 'pt-dgt-snic-inspire-wfs',
        country: 'PT',
        authority: 'DGT / SNIC',
        dataset: 'inspire:cadastralparcel (Cadastro Predial), native EPSG:3763, srsName=EPSG:4326 honoured server-side',
        endpoint: 'https://snicws.dgterritorio.gov.pt/geoserver/inspire/ows',
        protocol: 'WFS2',
        licence: {
            id: 'CC-BY-4.0 (declared on GetCapabilities — registry.ts probe)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-07-31',
                note: 'registry.ts dgt-cadastro-predial VERIFIED-LIVE: HTTP 200 application/json, real WGS84 MultiPolygon (cadastralparcel.1108210701 @ −7.5566,39.6702). Survey-grade, but national coverage INCOMPLETE (mainland only, per-município) — an unmapped município returns an honest no-parcel-here, NEVER a fabricated ring. ⚠ REPORT §F PT row: central Lisbon = 0 parcels (measured).',
            },
        ],
        theme: 'cadastre',
        coverage: 'mainland only, built out per-município; central Lisbon 0 parcels (measured, §F PT row); rural 34% BUPi fill',
        updateFrequency: null,
        adapterStatus: 'live', // wired, proxy /api/parcel/pt
    },
]);
