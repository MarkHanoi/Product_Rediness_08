// SOURCE REGISTRY — POLAND (PL). Seeded 2026-09-01 from the L4 lane file, verbatim
// (supplement §7; REPORT §F PL row: "ULDK/KIEG keyless; national GeoParquet buildings; POG
// GML … landing via RU by 2026-11-30; MPZP = raster+text"). Licence colour per §G:
// "PL (ULDK/KIEG/BDOT10k/3D) | free for any use (2020 Prawo geodezyjne) | GREEN".
//
// HONEST ABSENCES:
//   • Rejestr Urbanistyczny (RU, live since 2026-07-01) — the L4 lane OPEN ITEM stands: the
//     WMS/WFS endpoint URLs are not yet discoverable on the public pages ("harvest from
//     eziudp or the SPA network calls once past the transition"); no row until then.
//   • KIMPZP national MPZP WMS — probed live 2026-08-31 (GetCapabilities 200) but carries NO
//     licence colour of its own in the lane files (§G's PL row names ULDK/KIEG/BDOT10k/3D
//     only); a colour here would be inferred, not copied. Row deferred to the licence read.
//   • POG sample GML — a ministry TEST file, not a service endpoint.

import { defineSources } from './defineSources.js';

export const PL_SOURCES = defineSources('PL', [
    {
        id: 'pl-gugik-uldk-parcel-locator',
        country: 'PL',
        authority: 'GUGiK (ULDK)',
        dataset: 'GetParcelByXY — national parcel locator, WKT geometry in native EPSG:2180 (measure here, never after reprojection)',
        endpoint: 'https://uldk.gugik.gov.pl/',
        protocol: 'REST',
        licence: {
            id: 'public service, geodetic open regime (L4 lane PL-4: CLASS C · GREEN) / free for any use since the 2020 Prawo geodezyjne amendment (§G PL row)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'L4 lane PL-4 PROBED: keyless, instant, national — parcel 146510_8.0309.24/35 (Warszawa, obręb 5-03-09) with full WKT polygon; second probe Kraków Rynek 126105_9.0001.311.',
            },
        ],
        theme: 'cadastre',
        coverage: 'national',
        updateFrequency: null,
        adapterStatus: 'documented', // not yet wired in parcelProviders/registry.ts
    },
    {
        id: 'pl-gugik-kieg-cadastre-wms',
        country: 'PL',
        authority: 'GUGiK (KIEG — Krajowa Integracja Ewidencji Gruntów)',
        dataset: 'national cadastre WMS dialect, INSPIRE-annotated — parcel + building outlines via GetFeatureInfo',
        endpoint: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow',
        protocol: 'REST',
        licence: {
            id: 'free for any use (2020 Prawo geodezyjne) — §G PL row names KIEG explicitly',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'L4 lane PL-4 PROBED: GetCapabilities 200, INSPIRE-annotated. Authoritative EGiB registers stay at POWIAT level (380 counties) — attribute completeness varies by powiat; ownership (subject data) gated at powiat level, fee + legal-interest test.',
            },
        ],
        theme: 'cadastre',
        coverage: 'national view; attribute completeness varies by powiat (L4 lane PL-4)',
        updateFrequency: null,
        adapterStatus: 'documented',
    },
    {
        id: 'pl-bdot10k-buildings-geoparquet',
        country: 'PL',
        authority: 'GUGiK (BDOT10k)',
        dataset: 'OT_BUBD_A national buildings GeoParquet (function + storey attributes; attribute claim DOC-ONLY, dataset probe DIRECT)',
        endpoint: 'https://opendata.geoportal.gov.pl/bdot10k/schemat2021/GeoParquet/OT_BUBD_A.parquet',
        protocol: 'bulk',
        licence: {
            id: 'free for any use incl. commercial (2020 Prawo geodezyjne — L4 lane PL-5: CLASS A · GREEN)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 3,
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'L4 lane PL-5 PROBED: HTTP 200, Content-Length 78,643,200 — a cloud-optimised national buildings file served from a plain URL (Poland natively publishes GeoParquet; DuckDB can query it in place). The cheapest EU buildings feed probed in the lane.',
            },
        ],
        theme: 'buildings',
        coverage: 'national',
        updateFrequency: null,
        adapterStatus: 'documented',
    },
]);
