// LANE SK — SLOVAKIA (SK) · source discovery: the §J `sources(): SiteIntelSource[]` leg, typed as
// E1a `SiteIntelSource` rows and validated at module load by the registry's own loader
// (`defineSources` — a malformed row is a BUILD error naming its row, not a runtime surprise).
//
// ⚠ THIS IS A SELF-CONTAINED SOURCES FILE, like the EE/GR exemplars (`ee/eeSources.ts`,
// `gr/grSources.ts`), NOT a rival of `sourceRegistry/*` (C84 EI-9). There is no `sourceRegistry/sk.ts`
// yet — Slovakia is new — and `sourceRegistry/index.ts` is a SHARED file this lane may not edit under
// the barrel protocol. The migration of this row into `sourceRegistry/sk.ts` is queued for the
// orchestrator in audit/europe-adapters-2/2026-09-02/barrel-additions-sk.txt; when it lands, delete
// this and re-export the registry's — do NOT leave two.
//
// ONE PROBED ROW: the C-register parcel layer this adapter actually reads. The E-register parcels
// (former land-register, a sibling ESKN service) and the ZBGIS raster/DMR/ortho services are named
// in prose but NOT seeded — they were not individually probed this pass, and an unprobed row is an
// unverified claim (defineSources rejects an empty probe log by design).
//
// LICENCE HONESTY: the Slovak cadastral parcels are a formal EU HIGH-VALUE DATASET (Open Data
// Directive 2019/1024 + HVD Implementing Regulation (EU) 2023/138, Geospatial/Cadastral-parcels
// theme — mandated free + machine-readable) and are CC-BY-tagged on data.gov.sk (rest-of-europe
// sweep 2026-08-31). BUT the exact licence TEXT of THIS REST endpoint was not captured this pass.
// So `colour: YELLOW`, `verifiedDate: null` — an honest "the HVD mandate + CC-BY tag are strong but
// the endpoint terms are unread", never a GREEN this lane cannot back with a read licence.

import type { SiteIntelSource } from '@pryzm/schemas';
import { defineSources } from '../../sourceRegistry/defineSources.js';
import { SK_ESKN_KN_SERVICE, SK_PARCEL_C_LAYER_ID } from './skEsknClient.js';
import { SK_PARCEL_PROVIDER_ID } from './skParcelProvider.js';

/** The C-parcel source-row id — identical to the provider/provenance id (one spelling). */
export const SK_PARCEL_SOURCE_ID = SK_PARCEL_PROVIDER_ID;

/** Endpoint this adapter actually calls (layer-9 query). */
export const SK_PARCEL_ENDPOINT = `${SK_ESKN_KN_SERVICE}/${SK_PARCEL_C_LAYER_ID}`;

/**
 * Every source this adapter reads. Validated through `SiteIntelSourceSchema` at module load.
 */
export const SK_SOURCES: readonly SiteIntelSource[] = defineSources('SK', [
    {
        id: SK_PARCEL_SOURCE_ID,
        country: 'SK',
        authority: 'Úrad geodézie, kartografie a katastra SR (ÚGKK) / Geodetický a kartografický ústav (GKÚ)',
        dataset:
            'ESKN (Elektronické služby katastra nehnuteľností) VRM/kn/MapServer layer 9 "Plocha ' +
            'parcely C" — C-register cadastral parcel AREA polygons (KN, kataster nehnuteľností), ' +
            'ArcGIS 10.91 MapServer, keyless. Identity: PARCEL_NUMBER (parcelné číslo) within ' +
            'CADASTRAL_UNIT_ID (katastrálne územie id); ID = register-C OID; FOLIO_ID = list ' +
            'vlastníctva (LV) id; DESCRIPTIVE_AREA_OF_PARCEL = register m² (Výmera SPI); ' +
            'NATURE_OF_LAND_USE_ID = druh pozemku code. Stored EPSG:3857 (national CRS S-JTSK ' +
            'EPSG:5514), reprojects server-side to any outSR. ⛔ WAF blocks attribute where= (HTTP ' +
            '403); objectIds= is allowed — the by-id lookup uses objectIds. E-register parcels are a ' +
            'sibling service, NOT consumed.',
        endpoint: `${SK_PARCEL_ENDPOINT}/query`,
        // ArcGIS-REST dialect — classed REST per the FROZEN protocol enum; dialect named in prose.
        protocol: 'REST',
        licence: {
            id: 'Slovak cadastral parcels — EU High-Value Dataset (ODD 2019/1024 + (EU) 2023/138), CC-BY-tagged on data.gov.sk (endpoint licence text not captured this pass)',
            colour: 'YELLOW',
            verifiedDate: null,
            textRef: null,
        },
        // Live keyless query; a nightly/HVD bulk mirror (option 3/4) is the SLA path, not exercised here.
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-09-03',
                note:
                    'LANE SK PROBED LIVE. Channel: kataster.skgeodesy.sk/eskn/rest/services/VRM/kn/MapServer ' +
                    '(ArcGIS 10.91, copyrightText "© Úrad geodézie, kartografie a katastra SR"). Layer 9 ' +
                    '"Plocha parcely C" ?f=json 200: Feature Layer, esriGeometryPolygon, capabilities ' +
                    'Map,Query,Data. LIVE CLICK PROOF: point query inSR=4326&outSR=4326 @ Bratislava Old ' +
                    'Town (48.1436,17.1077) -> 1 feature, register-C ID 2090872505, PARCEL_NUMBER "15", ' +
                    'CADASTRAL_UNIT_ID 2933, DESCRIPTIVE_AREA_OF_PARCEL 832 m², FOLIO_ID 335384911, 23-vertex ' +
                    'WGS84 ring, PROTECTED national cultural monument. objectIds=2090872505 -> same 1 feature. ' +
                    'Vienna (16.3738,48.2082, outside SK) -> HTTP 200, 0 features (durable absent). ⛔ where=1=1 ' +
                    '-> nginx HTTP 403 (WAF blocks SQL where; objectIds is not SQL and is allowed). Bodies at ' +
                    '__tests__/fixtures/sk-bratislava-2026-09-03/recorded-live-2026-09-03.json.',
            },
            {
                date: '2026-09-03',
                note:
                    'NEGATIVE PROBE (recorded so it is not re-attempted): the ZBGIS ArcGIS server ' +
                    'zbgis.skgeodesy.sk/zbgis/rest/services carries ONLY raster/basemap services (DMR, ' +
                    'Ortofoto, ZBGIS, RA_Adresne_body) — NO cadastre layer; the cadastre is the separate ' +
                    'kataster.skgeodesy.sk/eskn service above. The eskn REST *directory root* is nginx-403 ' +
                    '(WAF), but NAMED services answer normally. INSPIRE CP WFS not needed for the parcel leg ' +
                    '(the ESKN MapServer point query serves the click path keyless).',
            },
        ],
        theme: 'cadastre',
        coverage:
            'national — the KN (kataster nehnuteľností) C-register covers Slovakia; cadastral ' +
            'parcels are a formal HVD (rest-of-europe sweep 2026-08-31)',
        updateFrequency: 'daily (HVD cadastre, per the sweep; exact ESKN publish cadence not captured)',
        adapterStatus: 'live',
    },
]);

/**
 * Endpoints this adapter actually calls, paired with the registry row that documents each — the
 * assertion a test can make that no endpoint is reached without a registered, probed row behind it
 * (the "committed != reachable" discipline applied to sources).
 */
export const SK_ADAPTER_ENDPOINT_BINDINGS: readonly {
    readonly sourceId: string;
    readonly endpoint: string;
}[] = [{ sourceId: SK_PARCEL_SOURCE_ID, endpoint: `${SK_PARCEL_ENDPOINT}/query` }];
