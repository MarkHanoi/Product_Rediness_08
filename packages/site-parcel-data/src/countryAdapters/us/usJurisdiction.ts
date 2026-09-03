// LANE US-EXPAND — the four US jurisdiction CONFIGS + routing bboxes + predicates.
//
// The registry routes a US click on a bbox predicate (exactly like `isInSF` / `isInChicago`): the US
// is DELIBERATELY absent from the national-jurisdiction resolver (`nationalJurisdictionResolver.ts`
// answers "which SOVEREIGN STATE claims this point" and its own doc block lists the US city boxes as
// intentionally excluded), so a US point yields `no-national-candidate`, the national filter keeps the
// full matched set, and these bbox predicates decide — the ESTABLISHED behaviour for US-NY-NYC /
// US-CA-SF / US-IL-CHI, extended, not a rival dispatch.
//
// COVERAGE IS ENCODED IN THE regionCode, HONESTLY:
//   • `US-MA` / `US-FL` are STATEWIDE — MassGIS L3 and FDOR Cadastral both serve the whole state, so
//     every in-state click resolves. Two-part codes, like the EE/SE national rows.
//   • `US-WA-KING` / `US-TX-HARRIS` are ONE COUNTY each (King = Seattle metro; Harris = Houston) —
//     three-part codes, bbox'd to the county, so a Spokane / Dallas click falls to the footprint
//     rather than being mis-attributed to a county cadastre that does not answer there. A statewide
//     WA/TX code with a county-only fabric would be the C58 §1.4 overstatement this avoids.
//
// LIVE-PROBED 2026-09-03 (UA `PRYZM-Research/1.0 …`), one real parcel each — see the per-config `note`
// and `audit/intl-parcels/2026-09-02/lane-us-expand.md` for the transcripts.

import {
    isInUsBbox,
    makeUsArcgisParcelProvider,
    type UsArcgisParcelConfig,
    type UsBbox,
} from './usArcgisParcelClient.js';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// MASSACHUSETTS — MassGIS statewide L3 "Standardized Parcels with Assessor Data" (US-MA)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The strongest single open US parcel dataset probed this lane: ONE statewide WGS84 FeatureServer,
// keyless, LOC_ID unique per parcel statewide. Layer 1 of the `_4326` service is already published in
// EPSG:4326 (no reprojection), so an out=4326 point query returns WGS84 rings straight through.

/** Massachusetts (mainland + Cape Cod + islands: Nantucket ~41.24°N, Berkshires west ~-73.51°E). */
export const US_MA_BBOX: UsBbox = { minLat: 41.14, maxLat: 42.90, minLon: -73.55, maxLon: -69.85 };

/** True when a WGS84 point should route to MassGIS. Pure; never throws. */
export function isInMassachusetts(lat: number, lon: number): boolean {
    return isInUsBbox(US_MA_BBOX, lat, lon);
}

export const US_MA_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-MA',
    providerId: 'us-ma-massgis-l3',
    label: 'MassGIS L3 Standardized Parcels (Massachusetts · statewide)',
    proxyPath: '/api/parcel/us-ma',
    upstreamQueryUrl:
        'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/L3_Parcels_FeatureService_4326/FeatureServer/1/query',
    layerName: 'MassGIS Standardized Parcels with Assessor Data',
    nativeWkid: 4326,
    idFields: ['LOC_ID'],
    altIdFields: ['MAP_PAR_ID'],
    addressFields: ['SITE_ADDR'],
    localityFields: ['CITY', 'TOWN_NAME'],
    licence: 'MassGIS (Bureau of Geographic Information) open data — public, attribution "MassGIS"',
    bbox: US_MA_BBOX,
    note: 'MassGIS statewide L3 parcels — VERIFIED-LIVE 2026-09-03: keyless ArcGIS FeatureServer (arcgisserver.digital.mass.gov/.../AGOL/L3_Parcels_FeatureService_4326/FeatureServer/1), layer already published EPSG:4326, an intersects point query returned the real parcel under the click (LOC_ID F_574532_2920828, MAP_PAR_ID 02-024-00001, 455 MAIN ST, WORCESTER, FY2026) with a WGS84 ring. Statewide, so every in-state click resolves. LOC_ID is the statewide-unique standardized parcel id; area is geometry-derived. Zoning/FAR are municipal (Ch. 40A), NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// FLORIDA — FDOR "Florida Statewide Cadastral" (US-FL)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A second statewide fabric: the Florida Department of Revenue cadastral (annual NAL join), hosted by
// the Florida Geographic Information Office. Native EPSG:3086 (Florida GDL Albers); an out=4326 point
// query returns WGS84. ⚠ This hosted service is STRICT: it requires JSON point geometry (a bare
// `x,y` string is rejected) — the reason `buildUsArcgisPointQueryUrl` always emits JSON geometry.

/** Florida (Keys ~24.40°N, panhandle west ~-87.63°E, Atlantic east ~-79.97°E, north border ~31.0°N). */
export const US_FL_BBOX: UsBbox = { minLat: 24.40, maxLat: 31.05, minLon: -87.65, maxLon: -79.95 };

/** True when a WGS84 point should route to the FDOR statewide cadastral. Pure; never throws. */
export function isInFlorida(lat: number, lon: number): boolean {
    return isInUsBbox(US_FL_BBOX, lat, lon);
}

export const US_FL_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-FL',
    providerId: 'us-fl-fdor-cadastral',
    label: 'FDOR Statewide Cadastral (Florida · Dept. of Revenue / FGIO)',
    proxyPath: '/api/parcel/us-fl',
    upstreamQueryUrl:
        'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query',
    layerName: 'FDOR Cadastral 2025',
    nativeWkid: 3086,
    idFields: ['PARCEL_ID'],
    altIdFields: [],
    addressFields: ['PHY_ADDR1'],
    localityFields: ['PHY_CITY'],
    licence: 'Florida Department of Revenue / FGIO — public records (Ch. 119 F.S.), attribution "FDOR"',
    bbox: US_FL_BBOX,
    note: 'FDOR statewide cadastral — VERIFIED-LIVE 2026-09-03: keyless ArcGIS Online FeatureServer (services9.arcgis.com/Gh9awoU677aKree0/.../Florida_Statewide_Cadastral/FeatureServer/0, layer "FDOR Cadastral 2025", native EPSG:3086), an intersects JSON-geometry point query with outSR=4326 returned the real parcel under the click (PARCEL_ID 1829244ZI000075000020A, 325 N FLORIDA AVE, TAMPA, CO_NO 39 Hillsborough, ASMNT_YR 2025) with a WGS84 ring. ⚠ The hosted service REQUIRES JSON point geometry (a bare x,y string 400s) — buildUsArcgisPointQueryUrl emits JSON. Statewide. PARCEL_ID is the DOR parcel id; area is geometry-derived. FL bulk/height is municipal, NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// WASHINGTON — King County parcels (US-WA-KING)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Seattle's county. King County GIS publishes the parcel fabric keylessly on its ArcGIS server. The
// layer carries geometry + PIN only (assessor attributes live in KingCo_PropertyInfo) — geometry +
// id is exactly the SF strong case. Native Web-Mercator (3857); out=4326 returns WGS84.

/** King County, WA (Seattle metro): ~47.08–47.78°N, ~-122.54–-121.06°E. County-scoped, not statewide. */
export const US_WA_KING_BBOX: UsBbox = { minLat: 47.07, maxLat: 47.80, minLon: -122.55, maxLon: -121.05 };

/** True when a WGS84 point should route to King County parcels. Pure; never throws. */
export function isInKingCountyWa(lat: number, lon: number): boolean {
    return isInUsBbox(US_WA_KING_BBOX, lat, lon);
}

export const US_WA_KING_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-WA-KING',
    providerId: 'us-wa-king-parcels',
    label: 'King County Parcels (Washington · Seattle metro)',
    proxyPath: '/api/parcel/us-wa-king',
    upstreamQueryUrl:
        'https://gismaps.kingcounty.gov/arcgis/rest/services/Property/KingCo_Parcels/MapServer/0/query',
    layerName: 'King County parcels',
    nativeWkid: 3857,
    idFields: ['PIN'],
    altIdFields: ['MAJOR'],
    addressFields: [],
    localityFields: [],
    licence: 'King County GIS open data — public, attribution "King County"',
    bbox: US_WA_KING_BBOX,
    note: 'King County (WA) parcels — VERIFIED-LIVE 2026-09-03: keyless ArcGIS MapServer (gismaps.kingcounty.gov/.../Property/KingCo_Parcels/MapServer/0, native EPSG:3857), an intersects point query with outSR=4326 returned the real parcel under the click (PIN 9831200275, MAJOR 983120 MINOR 0275, Capitol Hill Seattle) with a WGS84 ring. ONE COUNTY (Seattle metro), not statewide — a Spokane click falls to the footprint. Layer carries geometry + PIN; assessor data is a separate KingCo_PropertyInfo layer. Area is geometry-derived. Zoning/FAR municipal, NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// TEXAS — Harris County / HCAD parcels (US-TX-HARRIS)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Houston's county. The Harris County Appraisal District parcel fabric is served keylessly on the
// county ArcGIS server. Texas has NO usable statewide open parcel service (StratMap statewide probed
// this lane returned nothing at Austin/Dallas points, and the City-of-Austin layer is city-OWNED
// parcels only) and the Travis County host did not resolve keylessly — so TX is wired county-first,
// Harris first (the largest metro). Native State-Plane feet (EPSG:2278); out=4326 returns WGS84.

/** Harris County, TX (Houston metro): ~29.49–30.17°N, ~-95.96–-94.90°E. County-scoped, not statewide. */
export const US_TX_HARRIS_BBOX: UsBbox = { minLat: 29.48, maxLat: 30.18, minLon: -95.97, maxLon: -94.88 };

/** True when a WGS84 point should route to Harris County / HCAD parcels. Pure; never throws. */
export function isInHarrisCountyTx(lat: number, lon: number): boolean {
    return isInUsBbox(US_TX_HARRIS_BBOX, lat, lon);
}

export const US_TX_HARRIS_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-TX-HARRIS',
    providerId: 'us-tx-harris-hcad',
    label: 'HCAD Parcels (Texas · Harris County · Houston metro)',
    proxyPath: '/api/parcel/us-tx-harris',
    upstreamQueryUrl: 'https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0/query',
    layerName: 'HCAD Parcels',
    nativeWkid: 2278,
    idFields: ['HCAD_NUM', 'acct_num', 'LOWPARCELID'],
    altIdFields: ['SiteNumber'],
    addressFields: ['mail_addr_1'],
    localityFields: ['site_city', 'mail_city'],
    licence: 'Harris County Appraisal District (HCAD) / Harris County GIS — public, attribution "HCAD"',
    bbox: US_TX_HARRIS_BBOX,
    note: 'Harris County / HCAD parcels — VERIFIED-LIVE 2026-09-03: keyless ArcGIS MapServer (www.gis.hctx.net/.../HCAD/Parcels/MapServer/0, native EPSG:2278), an intersects point query with outSR=4326 returned the real parcel under the click (HCAD_NUM 0261520000043, 3217 MONTROSE BLVD, HOUSTON, tax_year 2025) with a WGS84 ring. ONE COUNTY (Houston metro), not statewide — TX has no usable statewide open parcel service (StratMap statewide returned nothing at Austin/Dallas; City-of-Austin layer is city-OWNED only) and the Travis County host did not resolve keylessly (both recorded in the lane findings). HCAD_NUM is the account id; area is geometry-derived. Zoning: Houston famously has none; bulk is deed/ordinance, NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PROVIDER HANDLES — bound to their configs, mirroring sfParcelProvider / chicagoParcelProvider.
// ══════════════════════════════════════════════════════════════════════════════════════════════

export const usMaParcelProvider = makeUsArcgisParcelProvider(US_MA_PARCELS);
export const usFlParcelProvider = makeUsArcgisParcelProvider(US_FL_PARCELS);
export const usWaKingParcelProvider = makeUsArcgisParcelProvider(US_WA_KING_PARCELS);
export const usTxHarrisParcelProvider = makeUsArcgisParcelProvider(US_TX_HARRIS_PARCELS);

/** Every US-EXPAND jurisdiction config, for coverage/inspection callers and the registry wiring. */
export const US_EXPAND_PARCEL_CONFIGS: readonly UsArcgisParcelConfig[] = [
    US_MA_PARCELS,
    US_FL_PARCELS,
    US_WA_KING_PARCELS,
    US_TX_HARRIS_PARCELS,
];
