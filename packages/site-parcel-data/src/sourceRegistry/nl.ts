// SOURCE REGISTRY — NETHERLANDS (NL). Seeded 2026-09-01 from the prose registries + the L4
// lane file, verbatim (supplement §7; REPORT §F NL row header: "the lane files are the
// authority for every underlying fact"): parcelProviders/registry.ts `pdok-nl` row, L4 lane
// NL-1 (Ozon v8.5.2 + RP v4 probes 2026-08-31), L4 lane NL-2 PDOK table, §G NL rows.
//
// LICENCE COLOURS per §G: PDOK stack "Public Domain / CC0 / CC BY 4.0 | GREEN"; DSO APIs
// "govt reuse + fair-use | YELLOW-GREEN | fair-use policy text UNREAD — read before
// production". YELLOW-GREEN is not a value of the closed colour set — the DSO rows carry the
// CONSERVATIVE projection YELLOW with the §G wording verbatim in the licence id, never a
// silent upgrade to GREEN.
//
// HONEST ABSENCE: Kadaster OWNERSHIP data — §G: "not open, priced — RED for redistribution,
// not needed for envelopes". Recorded here as an absence, not a row (no endpoint would be
// consumed).

import { defineSources } from './defineSources.js';

export const NL_SOURCES = defineSources('NL', [
    {
        id: 'nl-pdok-brk-kadastralekaart-wfs',
        country: 'NL',
        authority: 'Kadaster (PDOK)',
        dataset: 'kadastralekaart:Perceel (BRK), WFS v5_0',
        endpoint: 'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0',
        protocol: 'WFS2',
        licence: { id: 'open (PDOK), attribution — L4 lane NL-2 table', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-07-24',
                note: 'registry.ts pdok-nl (live-probe evidence 2026-07-24): HTTP 200 application/json, real Polygon (perceel ASD04 F 6685 @ Amsterdam), keyless.',
            },
            {
                date: '2026-08-31',
                note: 'L4 lane NL-2: GetCapabilities 200 — already WIRED in parcelProviders/registry.ts as pdok-nl.',
            },
        ],
        theme: 'cadastre',
        coverage: 'national',
        updateFrequency: null,
        adapterStatus: 'live', // wired, proxy /api/parcel/nl
    },
    {
        id: 'nl-3dbag-ogcapi',
        country: 'NL',
        authority: '3DBAG (TU Delft / BAG × AHN LiDAR)',
        dataset: 'collections/pand — CityJSON LoD 0/1.2/1.3/2.2, EPSG:7415; heights b3_h_dak_50p / b3_h_nok minus b3_h_maaiveld',
        endpoint: 'https://api.3dbag.nl/collections/pand/items',
        protocol: 'OGCAPI',
        licence: { id: 'CC-BY-4.0', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-07-25',
                note: 'heightSources.mjs 3dbag (impl:live): footprint ingest BUILT (LoD0 MultiSurface × metadata.transform → RD → WGS84; paginates 100/page via rel:next).',
            },
            {
                date: '2026-08-31',
                note: 'L4 lane NL-2: 200 LIVE re-confirmed; bbox item NL.IMBAG.Pand.0363100012243483, b3_dak_type slanted. ⚠ API drift: bbox-crs accepts the http://www.opengis.net/def/crs/EPSG/0/7415 form but 400s on the https:// form the July spike used — pin the API version.',
            },
        ],
        theme: 'buildings',
        coverage: 'full (heightSources coverage:full)',
        updateFrequency: null,
        adapterStatus: 'live',
    },
    {
        id: 'nl-pdok-bgt-ogcapi',
        country: 'NL',
        authority: 'Kadaster (PDOK)',
        dataset: 'BGT large-scale base topography — OGC API Features, 49 collections (pand, wegdeel, waterdeel, begroeidterreindeel, …)',
        endpoint: 'https://api.pdok.nl/lv/bgt/ogc/v1/collections',
        protocol: 'OGCAPI',
        licence: { id: 'CC0-1.0 (link in the API response itself — L4 lane NL-2)', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'L4 lane NL-2: 200 LIVE — 49 collections. The 2026-07-21 spike HTTP 000 was the spike env, NOT the service — L-511 BGT blocker can be closed. ATOM bulk exists for options 3/4.',
            },
        ],
        theme: 'context-topography',
        coverage: 'national',
        updateFrequency: null,
        adapterStatus: 'documented',
    },
    {
        id: 'nl-dso-ozon-presenteren-v8',
        country: 'NL',
        authority: 'DSO-LV (Omgevingswet / Ozon)',
        dataset: 'Omgevingsdocumenten Presenteren API v8.5.2 — typed norm objects (NormSpec "Bouwhoogte", NormwaardeSpec kwantitatieveWaarde / kwalitatieveWaarde / waardeInRegeltekst, locatieRefs), _zoek point/polygon queries in RD EPSG:28992',
        endpoint: 'https://service.omgevingswet.overheid.nl/publiek/omgevingsdocumenten/api/presenteren/v8/',
        protocol: 'REST',
        licence: {
            id: 'NL government reuse + fair-use — §G: YELLOW-GREEN, fair-use policy text UNREAD, read before production',
            colour: 'YELLOW',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: 'free DSO API key (form at developer.omgevingswet.overheid.nl — "gratis", open to third-party ICT vendors; fair-use, rate limit 200 req/s). Requesting it is the E1b week-1 probe register founder item.',
        probes: [
            {
                date: '2026-08-31',
                note: 'L4 lane NL-1a: openapi.json served KEYLESS (v8.5.2, 39 paths, 214 schemas); production base 503 "onderhoud Omgevingsloket" (maintenance window, not a gate verdict); pre-prod data endpoints 401 "Inloggegevens ontbreken" without x-api-key.',
            },
        ],
        theme: 'planning',
        coverage: 'IMOW-annotated (Normwaarde-bearing) coverage is a growing MINORITY layer in 2026 — most parcels ride the IMRO transitional layer (L4 lane NL-1c); consume BOTH APIs and merge by temporal validity',
        updateFrequency: null,
        adapterStatus: 'blocked', // real barrier today: the free key is not yet requested (founder item)
    },
    {
        id: 'nl-dso-ruimtelijke-plannen-v4',
        country: 'NL',
        authority: 'Kadaster (DSO transitional layer)',
        dataset: 'Ruimtelijke Plannen opvragen API v4 — IMRO2012 maatvoeringen ({naam: "maximum goothoogte (m)", waarde: "24"}), bouwvlakken, bestemmingsvlakken, _zoek spatial POSTs',
        endpoint: 'https://ruimte.omgevingswet.overheid.nl/ruimtelijke-plannen/api/opvragen/v4/',
        protocol: 'REST',
        licence: {
            id: 'NL government reuse + fair-use — §G: YELLOW-GREEN, fair-use policy text UNREAD, read before production',
            colour: 'YELLOW',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: 'same free DSO API key regime as Ozon (401 Missing API Key without it)',
        probes: [
            {
                date: '2026-08-31',
                note: 'L4 lane NL-1b: openapi.json keyless (61 paths); data endpoints 401 Missing API Key (Kadaster auth error on /plannen). IMRO2012 is ALSO structured — numeric maatvoering values carried per plan.',
            },
        ],
        theme: 'planning',
        coverage: 'the transitional (tijdelijk deel) layer governs most municipal territory in 2026 (L4 lane NL-1c)',
        updateFrequency: null,
        adapterStatus: 'blocked',
    },
]);
