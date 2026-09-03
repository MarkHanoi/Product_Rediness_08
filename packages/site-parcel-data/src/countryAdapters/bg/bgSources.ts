// LANE BG — BULGARIA (BG) · source discovery: the §J `sources(): SiteIntelSource[]` leg, typed as
// E1a `SiteIntelSource` rows and validated at module load by the registry's own loader
// (`defineSources` — a malformed row is a BUILD error naming its row, not a runtime surprise).
//
// ⚠ THIS IS A SELF-CONTAINED SOURCES FILE, like the GR/EE exemplars, NOT a rival of
// `sourceRegistry/*` (C84 EI-9). There is no `sourceRegistry/bg.ts` yet — Bulgaria is new — and
// `sourceRegistry/index.ts` is a SHARED file this lane may not edit under the barrel protocol. The
// migration of these rows into `sourceRegistry/bg.ts` is queued for the orchestrator in
// audit/europe-adapters-2/2026-09-02/barrel-additions-bg.txt; when it lands, delete these and
// re-export the registry's — do NOT leave two.
//
// TWO ROWS, because Bulgaria genuinely splits its cadastral-parcel delivery across two channels of
// DIFFERENT access class, and collapsing them would misstate one:
//   (1) the KEYLESS GCCA/AGKK INSPIRE Cadastral-Parcels service (the one this adapter reads); and
//   (2) the PAID official cadastral extract (скица / удостоверение) via the KAIS portal — the
//       legally-authoritative document, fee-gated. It is NOT what a map-click reads, but it is the
//       honest reason the parcel axis is YELLOW rather than GREEN (free VIEW/query, paid EXTRACT).
//
// LICENCE HONESTY: the keyless service ANSWERS without a credential, but the exact data-REUSE
// licence TEXT was not read from a licence page this pass (the sweep flagged BG "licence/open-data
// status only partial"). So `colour: YELLOW`, `verifiedDate: null` — an honest "read the licence
// before relying on redistribution terms", never a GREEN this lane cannot back (the HU/GR/LU
// discipline: do not claim CC0/CC-BY without reading it).

import type { SiteIntelSource } from '@pryzm/schemas';
import { defineSources } from '../../sourceRegistry/defineSources.js';
import { BG_INSPIRE_CADASTRE_BASE, BG_INSPIRE_CADASTRE_WMS } from './bgCadastreClient.js';
import { BG_PARCEL_PROVIDER_ID } from './bgParcelProvider.js';

/** The keyless INSPIRE cadastral-parcel source-row id — identical to the provider/provenance id. */
export const BG_PARCEL_SOURCE_ID = BG_PARCEL_PROVIDER_ID;
/** The paid official-extract row id — the fee-gated legally-authoritative retirement target. */
export const BG_KAIS_EXTRACT_SOURCE_ID = 'bg-gcca-kais-official-extract';

/** The KAIS portal endpoint (SPA shell, HTTP 200) — where the paid extract is ordered. */
export const BG_KAIS_ENDPOINT = 'https://kais.cadastre.bg/';

/**
 * Every source this adapter knows. Validated through `SiteIntelSourceSchema` at module load.
 */
export const BG_SOURCES: readonly SiteIntelSource[] = defineSources('BG', [
    {
        id: BG_PARCEL_SOURCE_ID,
        country: 'BG',
        authority: 'ГКГК/АГКК — Агенция по геодезия, картография и кадастър (GCCA)',
        dataset:
            'INSPIRE Cadastral Parcels — Cadastral_Parcel/MapServer, ArcGIS REST (capabilities ' +
            'Data,Map,Query) + WMS 1.3.0 view service, keyless. Layer 0 = CP.CadastralParcel ' +
            '(esriGeometryPolygon). Fields: nationalcadastralref (the идентификатор, e.g. ' +
            '"68134.100.5" — EKATTE settlement code + кадастрален район + parcel; the id) · ' +
            'id_localid · id_namespace ("BG.CP") · areavalue (register m²) + areavalue_uom · label · ' +
            'admunit · validfrom / beginlifespanversion. Stored EPSG:4258 (ETRS89); reprojects ' +
            'server-side to any outSR (WGS84 rings via outSR=4326). ⚠ The INSPIRE download (WFS) ' +
            'extension is DISABLED for parcels (GetCapabilities → ExceptionReport "No operation"), ' +
            'so the REST query + the WMS GetFeatureInfo are the two working keyless channels (WFS is ' +
            'served only for Geographical Names — sweep 2026-08-31).',
        endpoint: `${BG_INSPIRE_CADASTRE_BASE}/0`,
        // ArcGIS-REST + WMS dialect — classed REST per the FROZEN protocol enum; dialect named in prose.
        protocol: 'REST',
        licence: {
            id: 'GCCA INSPIRE keyless service access (exact data-reuse licence text NOT read from a page this pass; sweep 2026-08-31 flagged "licence/open-data status only partial")',
            colour: 'YELLOW',
            verifiedDate: null,
            textRef: null,
        },
        // Live keyless query; a nightly mirror (option 3/4) is the SLA path, not exercised here.
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-09-03',
                note:
                    'LANE BG PROBED LIVE from this machine. Channel discovered via the national ' +
                    'INSPIRE geoportal inspire.egov.bg → GeoNetwork catalog record "Cadastral parcels ' +
                    '- GCCA" (inspire.cadastre.bg). REST layer ?f=json → HTTP 200, capabilities ' +
                    'Data,Map,Query, esriGeometryPolygon, SR 4258. WMS GetCapabilities → HTTP 200, ' +
                    'layer 0 CP.CadastralParcel queryable="1", GetFeatureInfo formats incl. ' +
                    'application/geo+json, CRS incl. EPSG:7801 (BGS2005). LIVE CLICK PROOF — Sofia ' +
                    'capital (42.6975,23.3223): REST 0/query point → 1 feature, ' +
                    'nationalcadastralref="68134.100.5", areavalue=3499 m², id_namespace="BG.CP", ' +
                    '51-vertex WGS84 ring (spatialReference wkid 4326). WMS GetFeatureInfo geo+json at ' +
                    'the same point → same nationalCadastralReference "68134.100.5" (geometry null). ' +
                    'where nationalcadastralref=\'68134.100.5\' → the same parcel. Black Sea point ' +
                    '(43.20,28.90) → HTTP 200, 0 features (durable absent). Invalid field → HTTP 200 ' +
                    '{"error":{"code":400,"message":"Failed to execute query."}} (classified ' +
                    'transient). Robustness: REST query answers the DEFAULT (non-browser) UA — the ' +
                    'container Node fetch reaches it (inspire.cadastre.bg is NOT WAF-guarded, unlike ' +
                    'the arcgis.cadastre.bg app backend). Bodies: __tests__/fixtures/bg-sofia-2026-09-03/; ' +
                    'transcript audit/europe-adapters-2/2026-09-02/lane-bg-transcripts/01-inspire-cadastre-probe.md.',
            },
        ],
        theme: 'cadastre',
        coverage:
            'national but the digital cadastral map (КККР) is substantially complete for URBAN ' +
            'areas and still being extended elsewhere — a point outside the mapped fabric returns 0 ' +
            'features (sweep 2026-08-31)',
        updateFrequency: 'continuous (KAIS live register; exact publication cadence for the INSPIRE service not captured)',
        adapterStatus: 'live',
    },
    {
        id: BG_KAIS_EXTRACT_SOURCE_ID,
        country: 'BG',
        authority: 'ГКГК/АГКК (GCCA) — KAIS portal (kais.cadastre.bg)',
        dataset:
            'Official cadastral extract — скица на поземлен имот / удостоверение (the ' +
            'legally-authoritative parcel document), ordered through the KAIS portal. Free map ' +
            'VIEWING and free auto-generated preview reports exist, but the OFFICIAL EXTRACT is a ' +
            'PAID service (a per-document fee). This is the source that carries legal authority for a ' +
            'Bulgarian parcel; the keyless INSPIRE service above serves the geometry+identifier for a ' +
            'map click. Recorded so the parcel axis is honestly YELLOW (free view/query, paid ' +
            'extract), not GREEN.',
        endpoint: BG_KAIS_ENDPOINT,
        // The paid extract is an ordered document, not a live keyless query — 'bulk' is the closest
        // closed-enum class; no keyless service is pretended (defineSources PROTOCOL POLICY).
        protocol: 'bulk',
        licence: {
            id: 'KAIS official-extract commercial/administrative fee terms (PAID) — not read from a licence page this pass',
            colour: 'RED',
            verifiedDate: null,
            textRef: null,
        },
        accessOption: 6,
        gate: 'paid — KAIS official-extract per-document fee (skица/удостоверение)',
        probes: [
            {
                date: '2026-09-03',
                note:
                    'REACHABILITY + characterisation probe. https://kais.cadastre.bg/ → HTTP 200 ' +
                    '(free map viewing + /bg/OpenData + service application forms). The free/paid ' +
                    'split (free VIEW + free preview reports; PAID official extract) is from the ' +
                    'rest-of-europe sweep §BG (search-verified) + the KAIS service pages, NOT a ' +
                    'byte-level price observation of my own. The KAIS map app backend arcgis.cadastre.bg ' +
                    'is WAF-guarded (F5 "Request Rejected"; /export allowed, /query·/identify·/<layer>· ' +
                    'WFSServer·WMSServer → HTTP 403) — so the KEYLESS machine-readable channel is the ' +
                    'inspire.cadastre.bg INSPIRE service (row 1), not this app backend.',
            },
        ],
        theme: 'cadastre',
        coverage: 'national (fee-gated; not fetched)',
        updateFrequency: 'on-demand (per-order document)',
        adapterStatus: 'deferred-stub',
    },
]);

/**
 * Endpoints this adapter actually calls, paired with the registry row that documents each — the
 * assertion a test can make that no endpoint is reached without a registered, probed row behind it
 * (the "committed != reachable" discipline applied to sources). Only the keyless INSPIRE service is
 * CALLED; the paid-extract row is documentation of the fee-gate, so it is not bound to a client call.
 */
export const BG_ADAPTER_ENDPOINT_BINDINGS: readonly {
    readonly sourceId: string;
    readonly endpoint: string;
}[] = [{ sourceId: BG_PARCEL_SOURCE_ID, endpoint: `${BG_INSPIRE_CADASTRE_BASE}/0` }];

/** The WMS view endpoint, exported so a test can assert the GetFeatureInfo builder targets it. */
export const BG_WMS_ENDPOINT = BG_INSPIRE_CADASTRE_WMS;
