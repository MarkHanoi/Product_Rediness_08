// LANE USA-PARCELS · WAVE 2 (2026-09-06) — FIVE MORE WHOLE STATES, TWO OF THEM RECOVERED FROM A
// REFUSAL THAT NAMED THE WRONG HOST.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS, AND WHAT IT CORRECTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `usJurisdiction.ts` carries lane US-EXPAND's four rows (MA · FL · WA-King · TX-Harris);
// `usStatewideParcels.ts` carries wave 1's nine (NC · NY · OH · WI · MT · UT · VA + LA · Maricopa).
// This file carries wave 2's FIVE: NJ · VT · CT · IN · MD. The CLIENT is shared and unchanged
// (`usArcgisParcelClient.ts`) — every row is the same keyless ArcGIS `…/query` point-intersect, so
// this file adds DATA ROWS, not a second idiom.
//
// ⛔ TWO OF THESE FIVE OVERTURN A `USA_PARCEL_REFUSALS` ROW WRITTEN EARLIER THE SAME DAY, and the
// mechanism is the SAME defect both times: **the refusal probed the wrong HOST and recorded the 404
// as the state's answer.** That is the "bulk vs query endpoint false refusals" family
// (§BULK-VS-QUERY-ENDPOINT-FALSE-REFUSALS) met at state level, and it is worth naming precisely
// because the earlier rows were not lazy — they were enumerated, and enumeration of the WRONG HOST
// still yields a confident, wrong "this state has nothing":
//   • US-NJ — the refusal enumerated `mapsdep.nj.gov` (the NJ **DEP** mapping host), found no
//     Framework folder and no parcel service, and concluded correctly *about that host*. Its own
//     NEXT STEP named the right place. Followed: the NJGIN/NJOGIS ArcGIS Online org
//     (`services2.arcgis.com/XVOqAjTOJ5P6ngMu`) publishes `Parcels_Composite_NJ_WM` — **3,481,240
//     parcels across 21 of New Jersey's 21 counties.**
//   • US-MD — the refusal probed `geodata.md.gov`, got an HTTP 503 "Site Maintenance" page, and
//     called it an OUTAGE rather than an absence. That was the right call about the wrong hostname:
//     the live iMAP host is **`mdgeodata.md.gov`** (an `md` prefix, not the same name), and it
//     answers HTTP 200 today with `PlanningCadastre/MD_ParcelBoundaries` — **2,288,725 parcels
//     across 24 of 24 jurisdictions** (23 counties + Baltimore City).
// ⭐ THE LESSON, for the next lane: a 404/503 on ONE host is evidence about THAT HOST ONLY. Neither
// of these states was ever missing. Before writing a refusal, enumerate the STATE'S publisher — the
// ArcGIS Online org search (`arcgis.com/sharing/rest/search`) finds the org that actually owns the
// layer and cost this lane one request per state, which is cheaper than a wrong refusal.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// COVERAGE IS MEASURED AGAINST THE STATE'S OWN DENOMINATOR — never taken from the title
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Wave 1 caught two services whose titles overstated them (NY 38/62, VA 94/95). Every row here was
// counted the same way, with `returnDistinctValues=true` against the layer's own county/town field,
// and ALL FIVE MEASURED CLEAN:
//     NJ 21/21 counties · VT 256 towns (all 255 + the gores/grants) · CT 169/169 towns ·
//     IN 92/92 counties · MD 24/24 jurisdictions.
// This is the first wave in which nothing had to be rounded down. It is recorded as a measurement,
// not a boast: the same command is what caught NY and VA, and it must be re-run, never re-quoted.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE SERVED ACREAGE IS A TAX RECORD, NOT A GEOMETRY — the single most dangerous field here
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Wave 1 verified its rings by comparing OUR shoelace area against each source's own area field.
// Repeating that here produced ratios of 0.55–1.25, which looks like a broken parser and is NOT:
//     CT `Land_Acres` returned **exactly 1** for three parcels measuring 2561 / 3230 / 2357 m².
// `CALC_ACRE` (NJ), `ACRESGL` (VT — "acres from the Grand List") and `Land_Acres` (CT) are ASSESSMENT
// attributes off the tax roll: rounded, sometimes deeded rather than surveyed, and in CT's case
// integer-quantised. They are NOT the polygon's area and disagree with it by up to 45 %.
// ⛔ NEVER pass one through as an area. `ringAreaM2` is used throughout, as every other US row does.
//
// ⭐ THE RINGS ARE NEVERTHELESS INDEPENDENTLY VERIFIED — against the layers' GIS shape areas, which
// ARE geometry, once each layer's own unit is honoured. Measured 2026-09-06:
//     NJ  ours 233 m²      vs `Shape__Area` 405.48 Web-Mercator units ÷ sec²(40.73°N) = 233 m²
//                                                                          → ratio 1.0000
//     VT  ours 810 m²      vs `Shape__Area` 809.97   (EPSG:32145 is METRES)  → ratio 1.0001
//     CT  ours 787 m²      vs `Shape__Area` 8469.31  (EPSG:103016 is US survey FEET; 1 m² =
//                                            10.7639 ft²)  → ratio 0.0930 = 1/10.764, CONSTANT
//                                            across three parcels — an exact agreement in ft².
//     MD  ours 683 m²      vs `Shape.STArea()` 1141.05 Web-Mercator ÷ sec²(39.29°N) = 683 m²
//                                                                          → ratio 1.0000
// Two INDEPENDENT sources for one quantity is the only thing separating "the ring parsed" from "the
// ring is RIGHT" (§PROBE-CAN-BE-WRONG-THREE-WAYS): a lat/lon swap, a dropped vertex or a silent
// Web-Mercator leak would each still yield a plausible positive number. They do not.
// ⚠ ONE MD parcel in three read 2.96× its served area — a MULTI-RING parcel, where the client's
// outer-ring-only area overstates a polygon with holes. That is pre-existing client behaviour on
// EVERY US row, not a wave-2 defect, and it is named here rather than averaged away.
// ⚠ INDIANA IS THE EXCEPTION AND ITS AREA FIELD IS A TRAP: the layer is published natively in
// EPSG:4326, so `SHAPE__Area` is in SQUARE DEGREES (~1.2e-6 for a suburban lot). Passing it through
// would understate every Indiana parcel by ten orders of magnitude. Geometry-derived only.
//
// GEOMETRY + IDENTITY ONLY (C58 §1.4). These are assessor fabrics. US zoning, FAR and height are
// municipal ordinance and NO row here emits any of them — CT's layer carries a `Zone` string inline
// (e.g. "N3-1") and it is CONTEXT, never an envelope input.

import {
    isInUsBbox,
    makeUsArcgisParcelProvider,
    type UsArcgisParcelConfig,
    type UsBbox,
} from './usArcgisParcelClient.js';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// NEW JERSEY — NJGIN/NJOGIS `Parcels_Composite_NJ_WM` (US-NJ) · 21 of 21 counties
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** New Jersey: Cape May south ~38.79°N, NY line ~41.36°N, Delaware R. west ~-75.60°E. */
export const US_NJ_BBOX: UsBbox = { minLat: 38.79, maxLat: 41.36, minLon: -75.6, maxLon: -73.88 };

/** True when a WGS84 point should route to the NJ statewide composite. Pure; never throws. */
export function isInNewJersey(lat: number, lon: number): boolean {
    return isInUsBbox(US_NJ_BBOX, lat, lon);
}

export const US_NJ_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-NJ',
    providerId: 'us-nj-njgin-modiv-composite',
    label: 'NJ Parcels Composite / MOD-IV (New Jersey · statewide)',
    proxyPath: '/api/parcel/us-nj',
    upstreamQueryUrl:
        'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query',
    layerName: 'Cad_parcel_mod4',
    nativeWkid: 102100,
    idFields: ['PAMS_PIN'],
    altIdFields: ['GIS_PIN', 'PIN_NODUP'],
    addressFields: ['PROP_LOC'],
    localityFields: ['MUN_NAME', 'COUNTY'],
    licence:
        'NJ Office of GIS (NJOGIS) / NJGIN Open Data — New Jersey public records (OPRA), attribution "NJGIN / NJOGIS, MOD-IV via the county tax assessors"',
    bbox: US_NJ_BBOX,
    note: 'NJ statewide parcels composite — VERIFIED-LIVE 2026-09-06, and it OVERTURNS the US-NJ refusal recorded earlier the same day, which had enumerated the NJ DEP host mapsdep.nj.gov and correctly found no parcels THERE. The publisher is the NJGIN/NJOGIS ArcGIS Online org: keyless FeatureServer services2.arcgis.com/XVOqAjTOJ5P6ngMu/.../Parcels_Composite_NJ_WM/FeatureServer/0, layer "Cad_parcel_mod4", native EPSG:102100, 3,481,240 features. Point-intersect @ Newark (40.780885,-74.155224) → HTTP 200, 1692 bytes, application/json; charset=utf-8: PAMS_PIN 0714_835_7, PCLBLOCK 835, PCLLOT 7, PROP_LOC "916-918 BROADWAY", MUN_NAME "NEWARK CITY", COUNTY ESSEX, 5-vertex WGS84 ring. Second locality/county @ Jersey City (40.761628,-74.053565) → PAMS_PIN 0906_101_6_HM, "SECAUCUS RD", HUDSON, 26-vertex ring. COVERAGE MEASURED: returnDistinctValues on `COUNTY` = 21 DISTINCT COUNTIES — all 21 of New Jersey. PAMS_PIN (Property Assessment Management System pin, municipality_block_lot[_qualifier]) is the statewide-unique key. ⚠ FRESHNESS IS PER-ROW AND MUST NOT BE STATED AS ONE DATE: max(PCLLASTUPD) = 2026-03-25, but the Newark row above reads 2015-07-23, the Jersey City row reads NULL, and min(PCLLASTUPD) is a CORRUPT 0111-12-01 — so the layer is current in aggregate and stale in places; cite the per-row value, never the max. ⚠ `CALC_ACRE` is a TAX-ROLL acreage, not the polygon area — area is geometry-derived. Ring independently verified against `Shape__Area` (Web-Mercator ÷ sec²lat) at ratio 1.0000. Zoning/FAR are municipal (MLUL, N.J.S.A. 40:55D), NEVER inferred here. ⚠ ROUTING, MEASURED: NYC_BBOX (40.47–40.93 N, -74.28 – -73.68 E) OVERHANGS THE HUDSON and covers BOTH Newark and Jersey City, and at ≈0.28 deg² it is far smaller than this row (≈4.4 deg²), so specificity tries MapPLUTO FIRST on New Jersey soil. The OUTCOME is still correct — MapPLUTO holds only NYC tax lots, returns nothing at Newark, and `resolveParcelWithFallback` falls THROUGH to this row, which answers — but it costs ONE WASTED UPSTREAM CALL on every click in the two largest cities in New Jersey. Named, not hidden; tightening NYC_BBOX to the true shoreline is the fix, and it lives in a different file.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// VERMONT — VCGI statewide standardized parcels (US-VT) · 256 towns
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Vermont: MA line ~42.72°N, Canadian line ~45.02°N, CT R. east ~-71.46°E. */
export const US_VT_BBOX: UsBbox = { minLat: 42.72, maxLat: 45.02, minLon: -73.44, maxLon: -71.46 };

/** True when a WGS84 point should route to the VCGI statewide parcels. Pure; never throws. */
export function isInVermont(lat: number, lon: number): boolean {
    return isInUsBbox(US_VT_BBOX, lat, lon);
}

export const US_VT_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-VT',
    providerId: 'us-vt-vcgi-standardized-parcels',
    label: 'VCGI Standardized Parcels (Vermont · statewide)',
    proxyPath: '/api/parcel/us-vt',
    upstreamQueryUrl:
        'https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0/query',
    layerName: 'VT Data - Statewide Standardized Parcel Data - parcel polygons',
    nativeWkid: 32145,
    idFields: ['SPAN'],
    altIdFields: ['PARCID'],
    addressFields: ['LOCAPROP', 'DESCPROP'],
    localityFields: ['TNAME', 'TOWN'],
    licence:
        'Vermont Center for Geographic Information (VCGI) / VT Open Geodata Portal — open data, attribution "VCGI, Vermont Department of Taxes and the municipalities"',
    bbox: US_VT_BBOX,
    note: 'VCGI statewide standardized parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS Online FeatureServer (services1.arcgis.com/BkFxaEFNwHqX3tAw/.../FS_VCGI_OPENDATA_Cadastral_VTPARCELS_poly_standardized_parcels_SP_v1/FeatureServer/0, native EPSG:32145 = NAD83 Vermont State Plane METRES, 343,996 features). Point-intersect @ Burlington (44.522464,-73.266076) → HTTP 200, 9910 bytes: SPAN 114-035-10304, PARCID 023-1-016-000, PROPTYPE PARCEL, TOWN BURLINGTON, YEAR 2025, SOURCEDATE 20250922, OWNER1 "MCBEE ANNE L", 5-vertex WGS84 ring. COVERAGE MEASURED: returnDistinctValues on `TOWN` = 256 DISTINCT TOWNS — Vermont has 255 towns/cities plus the unorganised gores and grants (Averill, Averys Gore, Buels Gore … all present), so this is the full statewide tessellation. ⚠ SPAN IS NOT ONE-PER-POLYGON: the School Property Account Number is the STATEWIDE-unique tax id, but CONDOMINIUM units in one building share it — measured, SPAN C-535-8371 returns on two distinct polygons (PARCID 021-2-061-009 and -011, "RES CONDO (THE BLUFFS)" 1st and 2nd floor). PARCID (the municipal map-parcel id) therefore rides as the secondary id and is what distinguishes stacked units. ⚠ A parcel may legitimately carry a NULL SPAN — the layer includes PROPTYPE "WATER" and other EXEMPT polygons with no tax account (measured: OBJECTID 1, Hubbardton, MATCHSTAT EXEMPT), which the client refuses as `no-parcel-id` rather than keying on a surrogate. `ACRESGL` is Grand-List (tax-roll) acreage, NOT the polygon area — area is geometry-derived. Ring independently verified against `Shape__Area` (already m², EPSG:32145) at ratio 1.0001. Zoning is municipal (24 V.S.A. ch. 117) and Act 250 is a separate permit regime — NEITHER is inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// CONNECTICUT — CT GIS Office `Connecticut_CAMA_and_Parcel_Layer` (US-CT) · 169 of 169 towns
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Connecticut: Long Island Sound south ~40.95°N, MA line 42.05°N, NY line west ~-73.74°E. */
export const US_CT_BBOX: UsBbox = { minLat: 40.95, maxLat: 42.06, minLon: -73.74, maxLon: -71.78 };

/** True when a WGS84 point should route to the CT statewide CAMA+parcel layer. Pure; never throws. */
export function isInConnecticut(lat: number, lon: number): boolean {
    return isInUsBbox(US_CT_BBOX, lat, lon);
}

export const US_CT_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-CT',
    providerId: 'us-ct-ctgis-cama-parcels',
    label: 'CT Statewide CAMA and Parcel Layer (Connecticut · statewide)',
    proxyPath: '/api/parcel/us-ct',
    upstreamQueryUrl:
        'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0/query',
    layerName: 'Connecticut_CAMA_and_Parcel_Layer',
    nativeWkid: 103016,
    idFields: ['Parcel_ID'],
    altIdFields: ['CAMA_Link'],
    addressFields: ['Location'],
    localityFields: ['Town_Name', 'Property_City'],
    licence:
        'Connecticut Office of Policy and Management (OPM) / CT GIS Office — Connecticut open data (FOIA public records), attribution "CT GIS Office, OPM and the 169 municipalities"',
    bbox: US_CT_BBOX,
    note: 'Connecticut statewide CAMA + parcel layer — VERIFIED-LIVE 2026-09-06: keyless ArcGIS Online FeatureServer (services3.arcgis.com/3FL1kr7L4LvwA2Kb/.../Connecticut_CAMA_and_Parcel_Layer/FeatureServer/0, owner ctgisoffice, native EPSG:103016 = NAD83(2011) CT State Plane US survey FEET, 1,320,686 features). Point-intersect @ Andover (41.697994,-72.387870) → HTTP 200, 10956 bytes: Parcel_ID "25/022/000019", Location "GILEAD RD", Town_Name Andover, Parcel_Type PARCEL, 7-vertex WGS84 ring. COVERAGE MEASURED: returnDistinctValues on `Town_Name` = 169 DISTINCT TOWNS — all 169 of Connecticut (the state has no county government; the TOWN is the assessing unit, so 169/169 is the correct statewide denominator, not 8 counties). FRESHNESS: returnDistinctValues on `Parcel_Collection_Year` = a SINGLE value, "2026" — the whole layer is one annual vintage, which is unusually clean for a US parcel fabric and is why no per-row date caveat is needed here. ⚠ `Location` (site address) IS NULL for whole towns — measured null across Hartford — so the parcel card must tolerate an address-less parcel; `Property_City` carries the locality. ⛔ DO NOT USE `Mailing_Address`: it is the OWNER\'S mailing address, frequently out of state, and rendering it as the site address would be a wrong answer wearing a real field name. ⚠ The layer carries a `Zone` string inline (measured "N3-1" in Hartford) plus `State_Use_Description` — CONTEXT ONLY, a DRAFT lead at most: Connecticut zoning is municipal (C.G.S. ch. 124) and NO FAR or height is inferred here. `Land_Acres` is an assessment figure quantised to whole acres (measured: exactly 1 for parcels of 2561/3230/2357 m²) and is NEVER used — area is geometry-derived. Ring independently verified against `Shape__Area` (ft²) at a CONSTANT ratio 0.0930 = 1/10.764.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// INDIANA — IndianaMap / IGIO `Parcel_Boundaries_of_Indiana_Current` (US-IN) · 92 of 92 counties
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Indiana: Ohio R. south ~37.77°N, MI line ~41.77°N, Wabash west ~-88.10°E. */
export const US_IN_BBOX: UsBbox = { minLat: 37.77, maxLat: 41.77, minLon: -88.1, maxLon: -84.78 };

/** True when a WGS84 point should route to the IndianaMap parcels. Pure; never throws. */
export function isInIndiana(lat: number, lon: number): boolean {
    return isInUsBbox(US_IN_BBOX, lat, lon);
}

export const US_IN_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-IN',
    providerId: 'us-in-indianamap-parcels',
    label: 'IndianaMap Parcel Boundaries (Indiana · statewide)',
    proxyPath: '/api/parcel/us-in',
    upstreamQueryUrl:
        'https://gisdata.in.gov/server/rest/services/Hosted/Parcel_Boundaries_of_Indiana_Current/FeatureServer/0/query',
    layerName: 'Parcel Boundaries of Indiana Current',
    nativeWkid: 4326,
    idFields: ['state_parcel_id'],
    altIdFields: ['parcel_id', 'local_id'],
    addressFields: ['prop_add', 'dlgf_prop_address'],
    localityFields: ['prop_city', 'esri_poname', 'tax_county'],
    licence:
        'IndianaMap / Indiana Geographic Information Office (IGIO), Indiana Office of Technology — open data, attribution "IndianaMap, IGIO and the county assessors/auditors"',
    bbox: US_IN_BBOX,
    note: 'IndianaMap statewide parcel boundaries — VERIFIED-LIVE 2026-09-06: keyless ArcGIS FeatureServer (gisdata.in.gov/server/rest/services/Hosted/Parcel_Boundaries_of_Indiana_Current/FeatureServer/0, native EPSG:4326 — already WGS84, 3,682,675 features). Point-intersect @ Lake Village, Newton Co. (41.141519,-87.350124) → HTTP 200, 8537 bytes, application/json;charset=UTF-8: state_parcel_id 564130801801, nguid "urn:emergency:uid:gis:PCL:821117010081481701:newtoncounty.in.gov", esri_poname "Lake Village", esri_zip 46349, 37-vertex WGS84 ring. COVERAGE MEASURED: returnDistinctValues on `county_fips` = 92 DISTINCT COUNTIES — all 92 of Indiana. FRESHNESS: max(`loaddate`) = 2025-10-27; the field is per-row and per-county, so cite the row. `state_parcel_id` (the DLGF statewide parcel number) is the statewide-unique key; the county-local `parcel_id`/`local_id` ride as secondary. ⛔ `SHAPE__Area` IS IN SQUARE DEGREES, NOT SQUARE METRES — because the layer is served natively in EPSG:4326 the value reads ~1.6e-6 for a 18,643 m² lot; passing it through would understate every Indiana parcel by ~10 orders of magnitude. Area is geometry-derived, as everywhere else. ⚠ The point-intersect can return MORE THAN ONE feature (measured: 2 at the seed centroid) where county fabrics overlap at a shared boundary or a condo/right-of-way polygon is stacked; the client takes the first, which is the same first-wins rule every other US row uses. Zoning/FAR are municipal (IC 36-7-4), NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// MARYLAND — MD iMAP `PlanningCadastre/MD_ParcelBoundaries` (US-MD) · 24 of 24 jurisdictions
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Maryland: Potomac south ~37.88°N, Mason-Dixon 39.72°N, Garrett Co. west ~-79.49°E. */
export const US_MD_BBOX: UsBbox = { minLat: 37.88, maxLat: 39.73, minLon: -79.49, maxLon: -74.99 };

/** True when a WGS84 point should route to the MD iMAP parcel boundaries. Pure; never throws. */
export function isInMaryland(lat: number, lon: number): boolean {
    return isInUsBbox(US_MD_BBOX, lat, lon);
}

export const US_MD_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-MD',
    providerId: 'us-md-sdat-parcel-boundaries',
    label: 'MD iMAP Parcel Boundaries (Maryland · statewide, SDAT)',
    proxyPath: '/api/parcel/us-md',
    upstreamQueryUrl:
        'https://mdgeodata.md.gov/imap/rest/services/PlanningCadastre/MD_ParcelBoundaries/MapServer/0/query',
    layerName: 'Parcel Boundaries',
    nativeWkid: 102100,
    idFields: ['ACCTID'],
    altIdFields: ['GEOGCODE'],
    addressFields: ['ADDRESS'],
    localityFields: ['CITY', 'DESCTOWN', 'JURSCODE'],
    licence:
        'Maryland iMAP / MD Department of Planning with the State Department of Assessments and Taxation (SDAT) — Maryland open data (PIA public records), attribution "MD iMAP, MDP/SDAT"',
    bbox: US_MD_BBOX,
    note: 'Maryland statewide parcel boundaries — VERIFIED-LIVE 2026-09-06, and it OVERTURNS the US-MD refusal recorded earlier the same day, which read HTTP 503 "Site Maintenance" from geodata.md.gov and called Maryland an OUTAGE. The live iMAP host is mdgeodata.md.gov (an `md` PREFIX — a different hostname, not the same host recovering): keyless ArcGIS MapServer PlanningCadastre/MD_ParcelBoundaries/MapServer/0, its own serviceDescription "parcel polygons of the entire state attributed with data from the State Department of Assessments and Taxation", native EPSG:102100, 2,288,725 features. ⚠ geodata.md.gov IS STILL 503 as of this probe — both facts are true at once, which is exactly why a host-level 503 must never be recorded as a state-level absence. Point-intersect @ Baltimore City (39.291530,-76.587071) → HTTP 200, 16196 bytes: ACCTID "0301011738 004", JURSCODE BACI, ADDRESS "2107 E BALTIMORE ST", CITY BALTIMORE, RESITYP TH, CT2020 24510010500, 6-vertex WGS84 ring. COVERAGE MEASURED: returnDistinctValues on `JURSCODE` = 24 DISTINCT JURISDICTIONS (ALLE ANNE BACI BACO CALV CARO CARR CECI CHAR DORC FRED GARR HARF HOWA KENT MONT PRIN QUEE SOME STMA TALB WASH WICO WORC) — Maryland\'s 23 counties plus Baltimore City, i.e. all 24. FRESHNESS: max(`POLYDATE`) = "2026JAN" (the field is a YYYYMON string, not an epoch). ⚠ ACCTID (the SDAT account identifier) IS UNIQUE ONLY WITHIN ITS JURISDICTION — the statewide-unique key is the PAIR JURSCODE+ACCTID, the same shape as Ohio\'s PIN vs STATEWIDE_PIN and NY\'s PRINT_KEY vs SBL, so JURSCODE rides in the locality fields and must be shown beside the id. Area is geometry-derived; ring independently verified against `Shape.STArea()` (Web-Mercator ÷ sec²lat) at ratio 1.0000 on two of three sampled parcels — the third read 2.96× because it is a MULTI-RING parcel and the client areas the outer ring only (pre-existing on every US row, named not averaged). Zoning/FAR are municipal (Land Use Article), NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PROVIDER HANDLES — bound to their configs, mirroring usJurisdiction.ts / usStatewideParcels.ts.
// ══════════════════════════════════════════════════════════════════════════════════════════════

export const usNjParcelProvider = makeUsArcgisParcelProvider(US_NJ_PARCELS);
export const usVtParcelProvider = makeUsArcgisParcelProvider(US_VT_PARCELS);
export const usCtParcelProvider = makeUsArcgisParcelProvider(US_CT_PARCELS);
export const usInParcelProvider = makeUsArcgisParcelProvider(US_IN_PARCELS);
export const usMdParcelProvider = makeUsArcgisParcelProvider(US_MD_PARCELS);

/**
 * Every lane-USA-PARCELS WAVE 2 jurisdiction config. Kept SEPARATE from `USA_PARCELS_CONFIGS` and
 * `US_EXPAND_PARCEL_CONFIGS` so each wave's live-probe evidence stays legible next to the rows it
 * actually measured; `US_ALL_PARCEL_CONFIGS` in `index.ts` is the union for callers wanting every US row.
 */
export const USA_PARCELS_WAVE2_CONFIGS: readonly UsArcgisParcelConfig[] = [
    US_NJ_PARCELS,
    US_VT_PARCELS,
    US_CT_PARCELS,
    US_IN_PARCELS,
    US_MD_PARCELS,
];
