// SOURCE REGISTRY — SPAIN (ES). Seeded 2026-09-01 from the prose registries, verbatim
// (supplement §7): parcelProviders/registry.ts `catastro` row + server/jurisdiction/
// parcelZoningProxy.js (endpoint, wired since the L-380 pilot), heightSources.mjs
// `catastro` + `mds_edificacion` rows, REPORT §F ES / §G ES rows. Licence colour per §G:
// "ES Catastro | CC BY 4.0 (resolution 2023) | GREEN | Licencia.pdf located but NOT fetched
// verbatim (READ-level) — fetch before shipping reliance. No massive scraping on OVC query
// services; ATOM = the mirror product." — hence verifiedDate:null on the Catastro rows.

import { defineSources } from './defineSources.js';

export const ES_SOURCES = defineSources('ES', [
    {
        id: 'es-catastro-inspire-parcel-wfs',
        country: 'ES',
        authority: 'Dirección General del Catastro',
        dataset: 'OVC reverse-geocode (Consulta_RCCOOR_Distancia) + INSPIRE WFS GetParcel (wfsCP.aspx)',
        endpoint: 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx',
        protocol: 'WFS2',
        licence: {
            id: 'CC-BY-4.0 (Catastro resolution 2023) — Licencia.pdf located, NOT fetched verbatim (§G: fetch before shipping reliance)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1, // §G: no massive scraping on OVC query services; ATOM = the mirror product
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'registry.ts catastro row (the original L-380 pilot): keyless, live, wired as /api/catastro/parcel. §F ES row (L3 lane 2026-08-31): Catastro national keyless, foral seams (Navarra/Basque own systems).',
            },
        ],
        theme: 'cadastre',
        coverage: 'national, foral seams (REPORT §F ES row)',
        updateFrequency: null,
        adapterStatus: 'live',
    },
    {
        id: 'es-catastro-inspire-buildings-wfs',
        country: 'ES',
        authority: 'Dirección General del Catastro',
        dataset: 'INSPIRE Buildings (wfsBU.aspx) — BuildingPart numberOfFloorsAboveGround (a COUNT ×3.2 m, provenance derived-levels, NEVER tagged)',
        endpoint: 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx',
        protocol: 'WFS2',
        licence: {
            id: 'CC-BY-4.0 (Catastro resolution 2023) — Licencia.pdf located, NOT fetched verbatim (§G)',
            colour: 'GREEN',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-07-25',
                note: 'heightSources.mjs catastro (impl:live): footprint ingest BUILT — server returns EXACT WGS84 via srsName=4326; startIndex IGNORED (single-shot per bbox); whole-country/large bbox refused → tile per-city; full city = INSPIRE ATOM bulk.',
            },
        ],
        theme: 'buildings',
        coverage: 'full (heightSources coverage:full)',
        updateFrequency: null,
        adapterStatus: 'live',
    },
    {
        id: 'es-cnig-mds-edificacion-wcs',
        country: 'ES',
        authority: 'CNIG / IGN (idee.es)',
        dataset: 'MDS Edificación (mdsn_e025) — building-class nDSM raster 2.5 m, WCS 2.0.1 dialect, native EPSG:3042; pixel value IS building height above ground',
        endpoint: 'https://wcs-mds.idee.es/mds',
        protocol: 'REST',
        licence: { id: 'CC-BY (INSPIRE, keyless — heightSources.mjs mds_edificacion row)', colour: 'GREEN', verifiedDate: null, textRef: null },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-07-26',
                note: 'heightSources.mjs mds_edificacion (impl:live) LIVE-VERIFIED: GetCoverage EPSG:4326 SUBSET → image/tiff; measured heights BUILT (P90 over eroded footprint): Barcelona Eixample ~31 m, Madrid centro ~28 m, Córdoba centro ~17 m. Whole-country bbox refused per-tile; city bbox resolves exactly.',
            },
        ],
        theme: 'heights',
        coverage: 'full (heightSources coverage:full; one projection EPSG:3042 covers all of Spain)',
        updateFrequency: null,
        adapterStatus: 'live',
    },
]);
