// SOURCE REGISTRY — BELGIUM (BE). Seeded 2026-09-01 from the prose registries + the L5
// sweep lane, verbatim (supplement §7). Sweep BE grading: "Class A+C · GREEN across all
// three regions · option 1/2".
//
// HONEST ABSENCES (the registry.ts Belgium block is the authority — three regions, three
// verdicts, never one):
//   • Brussels-Capital — NO reachable keyless parcel endpoint (registry.ts be-bru probe
//     2026-07-31, four surfaces all negative: GAPD:AGDP_CAPA catalogued-but-not-served;
//     datastore.brussels serves a downloadable GeoPackage = sync-first infrastructure,
//     not a queryable source row).
//   • Wallonia — the documented cadastral endpoint DOES NOT EXIST (registry.ts be-wal probe
//     2026-07-31: geoservices.wallonie.be advertises 18 ortho layers, no parcel layer);
//     access-deferred pending a sourcing pass.
//   • Federal CADMAP WFS — identity-bootstrap-gated (302 → idp.iamfas.belgium.be), same
//     access class as SE BankID / DK MitID; the OPEN federal product is the annual snapshot
//     row below.
//   • Flanders DSI SPARQL plan register — DOC-level in the sweep, no dated endpoint probe.

import { defineSources } from './defineSources.js';

export const BE_SOURCES = defineSources('BE', [
    {
        id: 'be-vlg-grb-ogcapi',
        country: 'BE',
        authority: 'Digitaal Vlaanderen (GRB)',
        dataset: 'GRB OGC API Features — collection ADP (administrative/cadastral parcels: CAPAKEY, CANU, NISCODE, VERSIE/BEGINDATUM/VERSDATUM), GeoJSON/GML/GPKG, EPSG:31370; GBG (building at ground level) live on the same API',
        endpoint: 'https://geo.api.vlaanderen.be/GRB/ogc/features/collections',
        protocol: 'OGCAPI',
        licence: {
            id: 'Flanders open data, keyless (sweep BE: GREEN across all three regions)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'L5 sweep BE PROBED: collections live, keyless; FEATURE-LEVEL probe /collections/ADP/items?limit=1 returned a real parcel. Matches the keyless verdict on record in GEO-DATA-SOURCING-MASTER.md (2026-07-25).',
            },
        ],
        theme: 'cadastre',
        coverage: 'Flanders only — Brussels (CoBAT/UrbIS) + Wallonia (CoDT/PICC) are different legal systems (registry.ts Belgium block)',
        updateFrequency: null,
        adapterStatus: 'documented', // registry.ts flanders-grb row exists but proxy /api/parcel/be-vlg not yet wired server-side
    },
    {
        id: 'be-fed-cadastral-plan-snapshot',
        country: 'BE',
        authority: 'FPS Finance (open patrimony data)',
        dataset: 'Cadastral Plan / Plan parcellaire cadastral — annual 01/01 situation snapshot; download portal + web services + CadGIS viewer',
        endpoint: 'https://financien.belgium.be/nl/experten_partners/open-patrimoniumdata/datasets',
        protocol: 'bulk',
        licence: {
            id: 'CC-BY-2.0 with an explicit public-domain-style rights transfer — commercial use expressly allowed (L5 sweep BE, page probed)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 3,
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'L5 sweep BE PROBED (page): dataset page live. NOTE the live per-click QUERY path for the federal cadastre (CADMAP WFS) remains identity-gated (registry.ts Belgium block, probed 2026-07-31) — this row is the open ANNUAL SNAPSHOT product, cache it (option 3), never claim live-query.',
            },
        ],
        theme: 'cadastre',
        coverage: 'national (annual snapshot)',
        updateFrequency: 'annual (situation 01/01)',
        adapterStatus: 'documented',
    },
]);
