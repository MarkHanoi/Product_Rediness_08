// LANE USA-PARCELS (2026-09-06) — HOW FAR A US PARCEL CLICK CAN ACTUALLY REACH.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS ADDS, AND WHY IT IS A SEPARATE FILE FROM `usJurisdiction.ts`
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `usJurisdiction.ts` carries lane US-EXPAND's four rows (MA · FL · WA-King · TX-Harris). This file
// carries lane USA-PARCELS' NINE — seven whole STATES and two large COUNTIES — because each lane's
// live-probe evidence should stay next to the configs that lane actually measured. The CLIENT is
// shared and unchanged (`usArcgisParcelClient.ts`): every one of these is the same keyless ArcGIS
// `…/query` point-intersect, so this file adds DATA ROWS, not a second idiom.
//
// ⛔ THE US HAS NO NATIONAL CADASTRE. Parcels are assessed COUNTY BY COUNTY in law; the federal NGDA
// "Cadastre" theme is the BLM PLSS survey grid (township/section), which contains zero private lots.
// So "complete US coverage" is not one wire — it is a per-state ladder, and the honest unit of
// progress is A NAMED STATE WITH A MEASURED COVERAGE DENOMINATOR. Every row below carries one.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// COVERAGE IS ENCODED IN THE regionCode AND MEASURED IN THE NOTE — never assumed from the title
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A service called "statewide" is not statewide until its own county denominator is counted. This
// lane counted all seven with `returnDistinctValues=true` against the county field, and TWO of the
// seven are NOT what their titles claim:
//   • US-NY  — the NYS "Tax Parcels Public" service publishes its OWN coverage footprint as layer 0,
//     and that layer holds **38 counties**, not New York's 62. The row is still `cadastral` (the 38
//     include all five NYC boroughs and Albany/Erie/Onondaga/Suffolk/Westchester), but the note names
//     the gap and a click in one of the other 24 counties is an honest `empty` → OSM footprint.
//   • US-VA  — VGIN serves **94 of Virginia's 95 counties** (Rappahannock County is absent) plus all
//     38 independent cities. Named, not rounded up.
// The other five measured CLEAN: NC 100/100 · OH 88/88 · WI 72/72 · MT 56/56 · UT 29/29.
//
// GEOMETRY + IDENTITY ONLY (C58 §1.4). These are assessor fabrics. Zoning, FAR and height in the US
// are municipal ordinance, and NO row here emits any of them — several of these layers carry a use
// code inline (NC `parusedesc`, LA `UseType`, MT `PropType`) and it is context, never an envelope.
//
// AREA IS ALWAYS GEOMETRY-DERIVED. The served area fields are assessment attributes in mixed and
// sometimes unlabelled units (NC `gisacres` acres, MT `GISAcres` acres, VA `SHAPE.STArea()` in the
// layer's own projected units, WI `GISACRES` acres) — passing any of them through as m² would be a
// unit error wearing a number's confidence, so `ringAreaM2` is used throughout, as AU/CH/US-EXPAND do.
//
// ⭐ AND THAT CHOICE IS INDEPENDENTLY VERIFIED, not merely asserted. Running the nine SERVER legs
// against the live upstreams on 2026-09-06 and comparing OUR shoelace area against each source's OWN
// area field — a value we never read and therefore cannot have fitted to — agrees to 3–4 significant
// figures at every one tested:
//     NC  3,346 m² = 0.8267 ac  vs served `gisacres`      0.82463669
//     OH    779 m² = 0.1925 ac  vs served `ASSR_ACRES`    0.19227437
//     NY 41,201 m² = 10.181 ac  vs served `CALC_ACRES`   10.17558228
//     MT    278 m² = 0.0687 ac  vs served `GISAcres`      0.06866983
//     VA 115,468 m²             vs served `SHAPE.STArea()` 183,644.73 Web-Mercator units ÷
//                                  sec²(37.54°N) = 115,646 m²  (0.15 % apart)
// Two INDEPENDENT sources for the same quantity is the only thing that distinguishes "the ring
// parsed" from "the ring is right": a wrong CRS, a lat/lon swap or a dropped vertex would all still
// produce a plausible-looking positive number (§PROBE-CAN-BE-WRONG-THREE-WAYS). It does not, which
// is also what rules out a silent Web-Mercator leak on the five layers whose native SR is 3857.

import {
    isInUsBbox,
    makeUsArcgisParcelProvider,
    type UsArcgisParcelConfig,
    type UsBbox,
} from './usArcgisParcelClient.js';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// NORTH CAROLINA — NC OneMap `NC1Map_Parcels` (US-NC) · 100 of 100 counties
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** North Carolina: Outer Banks east ~-75.40°E, Smokies west ~-84.33°E, VA line ~36.59°N. */
export const US_NC_BBOX: UsBbox = { minLat: 33.75, maxLat: 36.59, minLon: -84.33, maxLon: -75.40 };

/** True when a WGS84 point should route to NC OneMap parcels. Pure; never throws. */
export function isInNorthCarolina(lat: number, lon: number): boolean {
    return isInUsBbox(US_NC_BBOX, lat, lon);
}

export const US_NC_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-NC',
    providerId: 'us-nc-onemap-parcels',
    label: 'NC OneMap Parcels (North Carolina · statewide)',
    proxyPath: '/api/parcel/us-nc',
    upstreamQueryUrl:
        'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/1/query',
    layerName: 'Parcels (polys)',
    nativeWkid: 2264,
    idFields: ['parno'],
    altIdFields: ['altparno'],
    addressFields: ['siteadd'],
    localityFields: ['scity', 'cntyname'],
    licence:
        'NC OneMap / NC Center for Geographic Information and Analysis (NCCGIA) — public records, attribution "NC OneMap, NCCGIA, NC county data producers"',
    bbox: US_NC_BBOX,
    note: 'NC OneMap statewide parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer, LAYER 1 "Parcels (polys)" — layer 0 is the parcel POINT layer, native EPSG:2264 NC State Plane feet, 5,938,900 features). Point-intersect @ Charlotte (35.226987,-80.844178) → HTTP 200, 2463 bytes, application/json;charset=UTF-8: parno 07301103A, ownname "FIRST-CITIZENS BANK & TR CO", siteadd "128 S TRYON ST CHARLOTTE NC", cntyname Mecklenburg, 7-vertex WGS84 ring. Second locality @ Asheville (35.596416,-82.550408) → parno 964940785500000, "10 SPRUCE ST", cntyname Buncombe. COVERAGE MEASURED, NOT ASSUMED: returnDistinctValues on `cntyname` = 100 DISTINCT COUNTIES — all 100 of North Carolina. ⚠ outFields must be EXACT: `city`, `county` and `sitezip` do NOT exist on this layer and a query naming them fails WHOLESALE with HTTP 200 + {"error":{"code":400,"message":"Failed to execute query."}}; the real names are `scity`, `cntyname`, `szip`. Zoning/FAR are municipal, NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// NEW YORK STATE — NYS ITS GIS `NYS_Tax_Parcels_Public` (US-NY) · 38 of 62 counties
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ NOT STATEWIDE, and the SERVICE ITSELF SAYS SO — layer 0 is a published county FOOTPRINT of the
// counties whose parcels layer 1 carries. It holds 38 rows. The row stays `cadastral` because those
// 38 include the five NYC boroughs and most of the population, and a click in the other 24 counties
// returns zero features — an honest `empty` → OSM footprint, never a wrong parcel.
// US-NY-NYC (MapPLUTO) has a far smaller box and therefore outranks this row inside the city by
// specificity, which is correct: MapPLUTO carries ZoneDist/FAR that this layer does not.

/** New York State: Montauk east ~-71.85°E, Chautauqua west ~-79.77°E, Canadian line ~45.02°N. */
export const US_NY_BBOX: UsBbox = { minLat: 40.47, maxLat: 45.02, minLon: -79.77, maxLon: -71.85 };

/** True when a WGS84 point should route to the NYS tax-parcel service. Pure; never throws. */
export function isInNewYorkState(lat: number, lon: number): boolean {
    return isInUsBbox(US_NY_BBOX, lat, lon);
}

export const US_NY_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-NY',
    providerId: 'us-ny-nysgis-taxparcels',
    label: 'NYS Tax Parcels Public (New York State · 38 counties)',
    proxyPath: '/api/parcel/us-ny',
    upstreamQueryUrl:
        'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcels_Public/MapServer/1/query',
    layerName: 'NYS_Tax_Parcels_Public',
    nativeWkid: 3857,
    idFields: ['PRINT_KEY', 'SBL'],
    altIdFields: ['SBL'],
    addressFields: ['PARCEL_ADDR'],
    localityFields: ['MUNI_NAME', 'COUNTY_NAME'],
    licence:
        'NYS Office of Information Technology Services Geospatial Services + NYS Dept. of Taxation and Finance (ORPTS) + contributing counties — public, attribution "NYS ITS GIS / ORPTS"',
    bbox: US_NY_BBOX,
    note: 'NYS Tax Parcels Public — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (gisservices.its.ny.gov/.../NYS_Tax_Parcels_Public/MapServer, LAYER 1 — layer 0 is the county coverage FOOTPRINT, native EPSG:3857, 3,827,530 parcels, service description "Publication Date: May 2026. Updated annually."). Point-intersect @ Albany (42.6523009,-73.7568442) → HTTP 200, 2383 bytes: PRINT_KEY 76.7-1-1, SBL 07600700010010000000, PARCEL_ADDR "Eagle St", COUNTY_NAME/MUNI_NAME Albany, PROP_CLASS 652, CALC_ACRES 10.17558228, ROLL_YR 2025, 29-vertex WGS84 ring. ⛔ COVERAGE IS 38 OF NEW YORK\'S 62 COUNTIES, MEASURED FROM THE SERVICE\'S OWN LAYER 0 FOOTPRINT (Albany, Bronx, Broome, Cayuga, Chautauqua, Cortland, Erie, Genesee, Greene, Hamilton, Kings, Lewis, Livingston, Montgomery, New York, Oneida, Onondaga, Ontario, Orange, Oswego, Otsego, Putnam, Queens, Rensselaer, Richmond, Rockland, Schuyler, St Lawrence, Steuben, Suffolk, Sullivan, Tioga, Tompkins, Ulster, Warren, Wayne, Westchester, Wyoming). A click in Monroe / Nassau / Dutchess / Saratoga / Schenectady / Niagara or any other of the 24 absent counties returns zero features — an honest `empty` → OSM footprint, NEVER a wrong parcel. NYC is inside this box but US-NY-NYC (MapPLUTO) has a far smaller box and outranks it by specificity, which is right: MapPLUTO carries ZoneDist1/ResidFAR that this layer does not. PRINT_KEY is the county tax-map key and is unique only WITHIN its SWIS district, so SBL rides as the secondary id. Zoning/FAR are municipal, NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// OHIO — ODNR `odnr_landbase` layer 4 "Statewide Parcels" (US-OH) · 88 of 88 counties
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Ohio: Lake Erie north ~42.33°N, Ohio River south ~38.39°N, Indiana line west ~-84.83°E. */
export const US_OH_BBOX: UsBbox = { minLat: 38.39, maxLat: 42.33, minLon: -84.83, maxLon: -80.51 };

/** True when a WGS84 point should route to the Ohio statewide parcel layer. Pure; never throws. */
export function isInOhio(lat: number, lon: number): boolean {
    return isInUsBbox(US_OH_BBOX, lat, lon);
}

export const US_OH_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-OH',
    providerId: 'us-oh-odnr-statewide-parcels',
    label: 'Ohio Statewide Parcels (ODNR / OGRIP · statewide)',
    proxyPath: '/api/parcel/us-oh',
    upstreamQueryUrl:
        'https://gis.ohiodnr.gov/arcgis/rest/services/OIT_Services/odnr_landbase/MapServer/4/query',
    layerName: 'Statewide Parcels',
    nativeWkid: 3857,
    idFields: ['STATEWIDE_PIN', 'PIN'],
    altIdFields: ['PIN'],
    addressFields: [],
    localityFields: ['COUNTY'],
    licence:
        'Ohio DNR / OGRIP statewide parcel aggregation of county auditor data — public records (ORC 149.43), attribution "Ohio DNR / OGRIP"',
    bbox: US_OH_BBOX,
    note: 'Ohio statewide parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (gis.ohiodnr.gov/.../OIT_Services/odnr_landbase/MapServer, LAYER 4 "Statewide Parcels", native EPSG:3857). Point-intersect @ Columbus (39.960019,-82.999580) → HTTP 200, 2133 bytes: PIN 010-000602, STATEWIDE_PIN 39049-010-000602, COUNTY Franklin, OWNER1 "VS STATE STREET LLC", ASSR_ACRES 0.19227437, 16-vertex WGS84 ring. Second locality @ Cleveland (41.500372,-81.695567) → PIN 10107004, STATEWIDE_PIN 39035-10107004, COUNTY Cuyahoga. COVERAGE MEASURED: returnDistinctValues on `COUNTY` = 88 DISTINCT COUNTIES — all 88 of Ohio. ⚠ FRESHNESS IS PER-COUNTY AND MUST NOT BE STATED AS ONE DATE: the layer serves its own `CurrentTo` export date per row and it read 1709269200000 (2024-03-01) for Franklin but 1686628800000 (2023-06-13) for Cuyahoga in the same session. STATEWIDE_PIN (county FIPS + auditor PIN) is the statewide-unique key; the bare PIN is unique only within its county, hence the ordering. The layer carries NO site address (`AUD_LINK` is a per-county auditor deep link). Zoning/FAR are municipal, NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// WISCONSIN — DOA / SCO Statewide Parcel Map Initiative V12 (US-WI) · 72 of 72 counties
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Wisconsin: Superior north ~47.31°N, Illinois line south ~42.47°N, St Croix west ~-92.90°E. */
export const US_WI_BBOX: UsBbox = { minLat: 42.47, maxLat: 47.31, minLon: -92.90, maxLon: -86.24 };

/** True when a WGS84 point should route to the Wisconsin statewide parcel layer. Pure; never throws. */
export function isInWisconsin(lat: number, lon: number): boolean {
    return isInUsBbox(US_WI_BBOX, lat, lon);
}

export const US_WI_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-WI',
    providerId: 'us-wi-doa-statewide-parcels',
    label: 'Wisconsin Statewide Parcels V12 (DOA / WLIP · statewide)',
    proxyPath: '/api/parcel/us-wi',
    upstreamQueryUrl:
        'https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels_DB/FeatureServer/0/query',
    layerName: 'V1200_WisconsinParcels_2026',
    nativeWkid: 3857,
    idFields: ['STATEID'],
    altIdFields: ['PARCELID', 'TAXPARCELID'],
    addressFields: ['SITEADRESS'],
    localityFields: ['PLACENAME', 'CONAME'],
    licence:
        'Wisconsin Dept. of Administration / Wisconsin Land Information Program (WLIP) Statewide Parcel Map Initiative, aggregated from county land information offices — public records (Wis. Stat. § 19.35), attribution "Wisconsin DOA / WLIP"',
    bbox: US_WI_BBOX,
    note: 'Wisconsin Statewide Parcels V12 — VERIFIED-LIVE 2026-09-06: keyless ArcGIS Online FeatureServer (services3.arcgis.com/n6uYoouQZW75n5WI/.../Wisconsin_Statewide_Parcels_DB/FeatureServer/0, layer "V1200_WisconsinParcels_2026", native EPSG:3857). Point-intersect @ Madison (43.072297,-89.400247) → HTTP 200, 9091 bytes: STATEID 025070923208015, PARCELID 070923208015, SITEADRESS "821 UNIVERSITY AVE", PLACENAME "CITY OF MADISON", TAXROLLYEAR 2025, 25-vertex WGS84 ring. Second locality @ Green Bay (44.512734,-88.012291) → STATEID 00911-259, "434 E WALNUT ST", CONAME BROWN, LOADDATE "2/05/2026". COVERAGE MEASURED: returnDistinctValues on `CONAME` = 73 values covering all 72 Wisconsin counties (the 73rd, "MENOMONIE", is an upstream spelling artefact of Menominee/the City of Menomonie, not a 73rd county). ⚠ THE SERVICE NAME CARRIES A `_DB` SUFFIX: `…/Wisconsin_Statewide_Parcels/FeatureServer` answers HTTP 200 with {"error":{"code":400,"message":"Invalid URL"}} — the live one is `Wisconsin_Statewide_Parcels_DB`. ⚠ `CNTY_NAME` does not exist (the county field is `CONAME`) and naming it fails the whole query with "\'outFields\' parameter is invalid". STATEID is the statewide-unique (county-FIPS-prefixed) parcel id; PARCELID is unique only within its county. Zoning/FAR are municipal, NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// MONTANA — MSL / DOR Cadastral Framework (US-MT) · 56 of 56 counties
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Montana: Canadian line ~49.01°N, Wyoming line ~44.35°N, Idaho panhandle west ~-116.06°E. */
export const US_MT_BBOX: UsBbox = { minLat: 44.35, maxLat: 49.01, minLon: -116.06, maxLon: -104.03 };

/** True when a WGS84 point should route to the Montana cadastral framework. Pure; never throws. */
export function isInMontana(lat: number, lon: number): boolean {
    return isInUsBbox(US_MT_BBOX, lat, lon);
}

export const US_MT_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-MT',
    providerId: 'us-mt-msl-cadastral',
    label: 'Montana Cadastral Framework (MSL / Dept. of Revenue · statewide)',
    proxyPath: '/api/parcel/us-mt',
    upstreamQueryUrl:
        'https://gisservice.mt.gov/arcgis/rest/services/msdi_cadastral_map_v1/MapServer/1/query',
    layerName: 'Montana Parcels',
    nativeWkid: 6514,
    idFields: ['PARCELID'],
    altIdFields: ['AssessmentCode', 'PropertyID'],
    addressFields: ['AddressLine1'],
    localityFields: ['CityStateZip', 'CountyName'],
    licence:
        'Montana State Library (MSDI Cadastral) + Montana Dept. of Revenue ORION — public, attribution "Montana State Library, Department of Revenue"',
    bbox: US_MT_BBOX,
    note: 'Montana Cadastral Framework — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (gisservice.mt.gov/.../msdi_cadastral_map_v1/MapServer, LAYER 1 "Montana Parcels", copyrightText "Montana State Library, Department of Revenue", native EPSG:6514 MT State Plane metres). Point-intersect @ Helena (46.589655,-112.038221) → HTTP 200, 6755 bytes: PARCELID 05188830321090000, CountyName "Lewis and Clark", AddressLine1 "330 N LAST CHANCE GULCH", CityStateZip "HELENA, MT 59601", TaxYear 2026, PropType "Improved Property", LegalDescriptionShort "HELENA TOWNSITE 1869, S30, T10 N, R03 W, BLOCK 411, Lot 4, PT 4,5", 10-vertex WGS84 ring. Second locality @ Billings (45.782413,-108.499330) → PARCELID 03092703134050000, CountyName Yellowstone, "2408 MINNESOTA AVE". COVERAGE MEASURED: returnDistinctValues on `CountyName` = 56 DISTINCT COUNTIES — all 56 of Montana. ⛔ THE HOST MOVED AND THE OLD ONE STILL ANSWERS: gisservicemt.gov/arcgis/rest/services now returns HTTP 200 with 4387 bytes of text/html (a portal page, not the REST catalogue) — a probe that only checked the status code would have read that as healthy. The live REST host is gisservice.mt.gov. Note the source\'s own scope caveat, "taxable and tax-exempt parcels for MOST of Montana" — tribal trust land in particular is not a DOR-assessed parcel, so an on-reservation click can be a truthful `empty` → footprint. Zoning is municipal/county, NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// UTAH — UGRC Utah Statewide Parcels (US-UT) · 29 of 29 counties
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Utah: the rectangle state — 36.99–42.01°N, -114.06–-108.99°E (the Arizona/Colorado corners). */
export const US_UT_BBOX: UsBbox = { minLat: 36.99, maxLat: 42.01, minLon: -114.06, maxLon: -108.99 };

/** True when a WGS84 point should route to the Utah statewide parcel layer. Pure; never throws. */
export function isInUtah(lat: number, lon: number): boolean {
    return isInUsBbox(US_UT_BBOX, lat, lon);
}

export const US_UT_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-UT',
    providerId: 'us-ut-ugrc-parcels',
    label: 'Utah Statewide Parcels (UGRC · statewide)',
    proxyPath: '/api/parcel/us-ut',
    upstreamQueryUrl:
        'https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/UtahStatewideParcels/FeatureServer/0/query',
    layerName: 'StateWideParcels',
    nativeWkid: 3857,
    idFields: ['PARCEL_ID'],
    altIdFields: ['ACCOUNT_NUM'],
    addressFields: ['PARCEL_ADD'],
    localityFields: ['PARCEL_CITY', 'County'],
    licence:
        'Utah Geospatial Resource Center (UGRC) / SGID, aggregated from county recorders — Utah GRAMA public records, attribution "UGRC / Utah SGID"',
    bbox: US_UT_BBOX,
    note: 'Utah Statewide Parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS Online FeatureServer (services1.arcgis.com/99lidPhWCzftIe9K/.../UtahStatewideParcels/FeatureServer/0, layer "StateWideParcels", native EPSG:3857, 1,596,196 parcels). Point-intersect @ Salt Lake City (40.761939,-111.891571) → HTTP 200, 2973 bytes: PARCEL_ID 15014300180000, PARCEL_ADD "18 W MARKET ST", PARCEL_CITY "Salt Lake City", County SaltLake, OWN_TYPE Private, ParcelsCur 1786492800000 (2026-08-11), 5-vertex WGS84 ring. Second locality @ Cedar City (37.678167,-113.062919) → PARCEL_ID B-0717-0002-0718, "95 W HARDING AVE", County Iron. COVERAGE MEASURED: returnDistinctValues on `County` = 29 DISTINCT COUNTIES — all 29 of Utah. ⚠ PARCEL_ID FORMAT IS PER-COUNTY, NOT STATEWIDE-NORMALISED (Salt Lake serves a 14-digit number, Iron serves "B-0717-0002-0718"), so it keys the parcel but must never be parsed as a uniform schema; `County` disambiguates. The layer serves its own `ParcelsCur` currency epoch per row, which is the honest freshness field. Zoning/FAR are municipal, NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// VIRGINIA — VGIN Virginia Parcels (US-VA) · 94 of 95 counties + all 38 independent cities
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Virginia: Eastern Shore east ~-75.16°E, Cumberland Gap west ~-83.68°E, NC line ~36.54°N. */
export const US_VA_BBOX: UsBbox = { minLat: 36.54, maxLat: 39.47, minLon: -83.68, maxLon: -75.16 };

/** True when a WGS84 point should route to the VGIN parcel layer. Pure; never throws. */
export function isInVirginia(lat: number, lon: number): boolean {
    return isInUsBbox(US_VA_BBOX, lat, lon);
}

export const US_VA_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-VA',
    providerId: 'us-va-vgin-parcels',
    label: 'Virginia Parcels (VGIN · 94 counties + 38 cities)',
    proxyPath: '/api/parcel/us-va',
    upstreamQueryUrl:
        'https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/MapServer/0/query',
    layerName: 'Virginia Parcels',
    nativeWkid: 3857,
    idFields: ['VGIN_QPID'],
    altIdFields: ['PARCELID'],
    addressFields: [],
    localityFields: ['LOCALITY'],
    licence:
        'Virginia Geographic Information Network (VGIN) / VDEM, aggregated from local jurisdictions — Virginia FOIA public records, attribution "VGIN"',
    bbox: US_VA_BBOX,
    note: 'VGIN Virginia Parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (vginmaps.vdem.virginia.gov/.../VA_Base_Layers/VA_Parcels/MapServer/0, copyrightText "Virginia Geographic Information Network (VGIN)", native EPSG:3857). Point-intersect @ Richmond (37.538326,-77.431270) → HTTP 200, 3970 bytes: VGIN_QPID 5176000025467, PARCELID 517466, LOCALITY "Richmond City", FIPS 51760, LASTUPDATE 1775433600000 (2026-04-06), 64-vertex WGS84 ring. Second locality @ Pittsylvania County (36.654887,-79.391766) → VGIN_QPID 5114300000997, PARCELID 2329-19-0015, LASTUPDATE 1778112000000 (2026-05-07). ⛔ COVERAGE IS 94 OF VIRGINIA\'S 95 COUNTIES — MEASURED, NOT ROUNDED UP: returnDistinctValues on `LOCALITY` = 136 values = 94 counties + all 38 independent cities + 4 town rows (Bedford, Colonial Beach, Culpeper, Farmville); RAPPAHANNOCK COUNTY IS ABSENT, so a Washington-VA click is an honest `empty` → OSM footprint. ⚠ VGIN_QPID arrives as a JSON FLOAT (5176000025467.0) and is stringified, not parsed as a schema; PARCELID is the local jurisdiction\'s own id and is unique only within its LOCALITY. The source\'s own description states the boundaries are "for cartographic use and spatial analysis only, and not for use as legal descriptions or property surveys" and are NOT edge-matched across municipal boundaries — so this is an assessment fabric, never a survey. Zoning/FAR are municipal, NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LOS ANGELES COUNTY, CA — Assessor parcel fabric (US-CA-LA) · ONE COUNTY
// ══════════════════════════════════════════════════════════════════════════════════════════════
// California has NO open statewide parcel service (parcels are county assessor products and the
// statewide compilations are commercial), so CA is wired county-first — LA County first, because it
// is the largest county in the United States by population (~2.4 M parcels).

/** Los Angeles County, CA: ~32.75–34.83°N, ~-118.96–-117.64°E (incl. Catalina + San Clemente Is.). */
export const US_CA_LA_BBOX: UsBbox = { minLat: 32.75, maxLat: 34.83, minLon: -118.96, maxLon: -117.64 };

/** True when a WGS84 point should route to LA County parcels. Pure; never throws. */
export function isInLosAngelesCounty(lat: number, lon: number): boolean {
    return isInUsBbox(US_CA_LA_BBOX, lat, lon);
}

export const US_CA_LA_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-CA-LA',
    providerId: 'us-ca-la-county-parcels',
    label: 'LA County Assessor Parcels (California · Los Angeles County)',
    proxyPath: '/api/parcel/us-ca-la',
    upstreamQueryUrl:
        'https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0/query',
    layerName: 'LACounty_Parcel',
    nativeWkid: 3857,
    idFields: ['AIN'],
    altIdFields: ['APN'],
    addressFields: ['SitusAddress'],
    localityFields: ['SitusCity', 'TaxRateCity'],
    licence:
        'Los Angeles County Office of the Assessor / LA County eGIS — public records (CA Gov. Code § 7920 et seq.), attribution "Los Angeles County Office of the Assessor"',
    bbox: US_CA_LA_BBOX,
    note: 'LA County Assessor parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0, copyrightText "Los Angeles County Office of the Assessor", native EPSG:3857). Point-intersect @ downtown LA (34.054737,-118.241866) → HTTP 200, 2630 bytes: AIN 5161005902, APN 5161-005-902, SitusAddress "312 N SPRING ST", SitusCity "LOS ANGELES CA", SitusZIP 90012-4701, UseType Government, 32-vertex WGS84 ring. ⚠ THE FOLDER MATTERS: public.gis.lacounty.gov/public/rest/services/LACounty_Dynamic/Parcel/MapServer answers HTTP 200 with {"error":{"code":404,"message":"Service LACounty_Dynamic/Parcel/MapServer not found "}} — the live layer is in the LACounty_Cache folder, not LACounty_Dynamic. ONE COUNTY, not statewide: the bbox is the county (plus Catalina and San Clemente Island), and an Orange-County / Ventura / San Bernardino click inside the rectangle returns zero features — a truthful `empty` → footprint, never a mis-attributed parcel. AIN is the 10-digit Assessor Identification Number (the routing key); APN is the same value dash-formatted. California has NO open statewide parcel service, which is why CA is wired county-first. LA\'s zoning is City/County ordinance and is NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// MARICOPA COUNTY, AZ — Assessor parcel fabric (US-AZ-MARICOPA) · ONE COUNTY
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Phoenix's county — the fourth-largest US county by population. Arizona has no open statewide
// parcel service (the State Land Department serves TRUST land, not private lots), so AZ is
// wired county-first.

/** Maricopa County, AZ (Phoenix metro): ~32.50–34.05°N, ~-113.34–-111.04°E. County-scoped. */
export const US_AZ_MARICOPA_BBOX: UsBbox = {
    minLat: 32.50,
    maxLat: 34.05,
    minLon: -113.34,
    maxLon: -111.04,
};

/** True when a WGS84 point should route to Maricopa County parcels. Pure; never throws. */
export function isInMaricopaCountyAz(lat: number, lon: number): boolean {
    return isInUsBbox(US_AZ_MARICOPA_BBOX, lat, lon);
}

export const US_AZ_MARICOPA_PARCELS: UsArcgisParcelConfig = {
    regionCode: 'US-AZ-MARICOPA',
    providerId: 'us-az-maricopa-parcels',
    label: 'Maricopa County Assessor Parcels (Arizona · Phoenix metro)',
    proxyPath: '/api/parcel/us-az-maricopa',
    upstreamQueryUrl:
        'https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0/query',
    layerName: 'Parcels',
    nativeWkid: 3857,
    idFields: ['APN'],
    altIdFields: ['APN_DASH'],
    addressFields: ['PHYSICAL_ADDRESS'],
    localityFields: ['PHYSICAL_CITY'],
    licence:
        "Maricopa County Assessor's Office — Arizona public records (A.R.S. § 39-121), attribution \"Maricopa County Assessor's Office\"",
    bbox: US_AZ_MARICOPA_BBOX,
    note: 'Maricopa County (AZ) Assessor parcels — VERIFIED-LIVE 2026-09-06: keyless ArcGIS MapServer (gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0, copyrightText "Maricopa County Assessor\'s Office", serviceDescription "Dynamic parcel boundaries", native EPSG:3857). Point-intersect @ Phoenix (33.449177,-112.074098) → HTTP 200, 1372 bytes: APN 11221001, APN_DASH 112-21-001, PHYSICAL_ADDRESS "50 N CENTRAL AVE   PHOENIX  85004", PHYSICAL_CITY PHOENIX, OWNER_NAME "PHOENIX CITY OF (LEASED OUT)", 7-vertex WGS84 ring. ONE COUNTY (Phoenix metro), not statewide — Arizona has no open statewide parcel service (the State Land Department publishes TRUST land, not private lots), so AZ is wired county-first and a Tucson / Flagstaff click falls to the OSM footprint rather than a mis-attributed cadastre. APN is the 8-digit book-map-item id; APN_DASH is the same value formatted. Zoning is municipal ordinance, NEVER inferred here.',
};

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PROVIDER HANDLES — bound to their configs, mirroring usJurisdiction.ts.
// ══════════════════════════════════════════════════════════════════════════════════════════════

export const usNcParcelProvider = makeUsArcgisParcelProvider(US_NC_PARCELS);
export const usNyParcelProvider = makeUsArcgisParcelProvider(US_NY_PARCELS);
export const usOhParcelProvider = makeUsArcgisParcelProvider(US_OH_PARCELS);
export const usWiParcelProvider = makeUsArcgisParcelProvider(US_WI_PARCELS);
export const usMtParcelProvider = makeUsArcgisParcelProvider(US_MT_PARCELS);
export const usUtParcelProvider = makeUsArcgisParcelProvider(US_UT_PARCELS);
export const usVaParcelProvider = makeUsArcgisParcelProvider(US_VA_PARCELS);
export const usCaLaParcelProvider = makeUsArcgisParcelProvider(US_CA_LA_PARCELS);
export const usAzMaricopaParcelProvider = makeUsArcgisParcelProvider(US_AZ_MARICOPA_PARCELS);

/**
 * Every lane-USA-PARCELS jurisdiction config, for coverage/inspection callers and the registry
 * wiring. Kept SEPARATE from `US_EXPAND_PARCEL_CONFIGS` so each lane's evidence set stays legible;
 * `US_ALL_PARCEL_CONFIGS` in `index.ts` is the union for callers that want every US row.
 */
export const USA_PARCELS_CONFIGS: readonly UsArcgisParcelConfig[] = [
    US_NC_PARCELS,
    US_NY_PARCELS,
    US_OH_PARCELS,
    US_WI_PARCELS,
    US_MT_PARCELS,
    US_UT_PARCELS,
    US_VA_PARCELS,
    US_CA_LA_PARCELS,
    US_AZ_MARICOPA_PARCELS,
];

// ══════════════════════════════════════════════════════════════════════════════════════════════
// NAMED REFUSALS — states and services this lane REACHED and could not wire (C57 §1.5 / §1.9).
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ These are DATA, deliberately, not prose in a doc that rots: a refusal that is not enumerated is
// indistinguishable from a state nobody looked at, and "we tried and it answered X" is the single
// most expensive fact to re-derive. Every entry records the EXACT HTTP answer.

/** A US parcel channel this lane probed and did NOT wire, with the verbatim upstream answer. */
export interface UsParcelRefusal {
    /** ISO-ish region the refusal is about, e.g. `US-TX` (statewide), `US-IL-COOK`. */
    readonly regionCode: string;
    /** The endpoint probed, verbatim. */
    readonly endpoint: string;
    /** The exact answer: status, bytes, content-type and the leading body text. */
    readonly answer: string;
    /** Why it is not wired, and what would unblock it. */
    readonly verdict: string;
}

// ==============================================================================================
// THE COMMERCIAL OPTION — recorded for the founder's decision, DELIBERATELY NOT INTEGRATED.
// ==============================================================================================
// The lane brief asked for this to be stated honestly rather than quietly skipped, because "the US
// has no national cadastre" is TRUE of open data and FALSE of the market: a national point-to-parcel
// API exists and is bought, not built. Recording it here as DATA keeps the trade-off in front of
// whoever next asks "why is Idaho a footprint?" — the answer is a PRICE, not an impossibility.
//
// NOTHING BELOW IS WIRED. There is no Regrid client, no key, no leg, and no registry row. This is a
// decision record with its evidence attached.

/** A commercial US parcel channel evaluated but NOT integrated. */
export interface UsCommercialParcelOption {
    readonly vendor: string;
    /** What was PROBED, with the exact HTTP answer. */
    readonly probe: string;
    /** What it would close that the open ladder cannot. */
    readonly closes: string;
    /** What it would cost to EVALUATE (not to run at scale) — the next decision, not the last one. */
    readonly costToEvaluate: string;
    /** Which wired rows it would make redundant, and which it would NOT. */
    readonly redundancy: string;
    /** The open questions that must be answered before anyone signs anything. */
    readonly openQuestions: readonly string[];
}

export const US_COMMERCIAL_PARCEL_OPTION: UsCommercialParcelOption = {
    vendor: 'Regrid (regrid.com) — nationwide parcel / zoning / building data',
    probe:
        'PROBED 2026-09-06, two surfaces. (1) The point-to-parcel API: GET https://app.regrid.com/api/v2/parcels/point?lat=34.0537&lon=-118.2427 -> HTTP 401, 59 bytes, application/json; charset=utf-8, body {"status":"error","message":"An access token is required."}. That is the ONLY thing this lane can assert about the API: it exists at that path and it is token-gated. NO parcel was retrieved, no schema was seen, and NO coverage claim was verified. (2) The vendor page: GET https://regrid.com/api -> HTTP 200, 629,585 bytes, text/html. Its own marketing copy states "160M+ Parcel Records" and "100% U.S. Parcel data coverage"; it names an "Interactive API Sandbox ... Free for 30 days" and a self-serve plan page at https://app.regrid.com/api/plans; it states NO price, NO county count, and does NOT reproduce its redistribution terms. VENDOR CLAIMS ARE NOT MEASUREMENTS -- "100% coverage" is Regrid asserting it, exactly as five of the state services this lane probed asserted "statewide" and two of them were not (NY 38/62, VA 94/95).',
    closes:
        'It would close the COVERAGE HOLE, not a capability gap. The open ladder now answers a click in 9 states + 4 counties with a real ring and a real id; the other ~41 states fall to the OSM building footprint. Regrid would replace that footprint with a parcel boundary EVERYWHERE, in one integration instead of ~41, and would remove the per-state maintenance tail this lane just demonstrated is real (the Montana host moved, the Texas host was retired, the Wisconsin service name gained a suffix -- three breakages found in a single afternoon across seven states). It would NOT close the ENVELOPE gap: US bulk and height are municipal ordinance, and a parcel vendor does not make a zoning ordinance machine-readable. Buying it buys geometry + identity at national scale, which is precisely what the open rows already give -- so the purchase is about REACH, and must never be sold internally as "US zoning".',
    costToEvaluate:
        'The 30-day free API sandbox is the whole evaluation cost in cash: EUR 0. The real cost is ENGINEERING TIME plus a LEGAL READ. Engineering: one keyed leg on the pattern this repo already has (the New Zealand LINZ_API_KEY leg is the exact precedent -- requiresEnv + readKey + an `unconfigured` outcome, so a missing key is a 503 and never a wrong parcel), which is roughly the same size as ONE of the nine legs in this file. Legal: the redistribution terms are NOT published on the vendor page and MUST be read before anything is shipped -- a parcel boundary rendered in a customer-facing 3D scene is redistribution, not internal analysis, and that is the clause that decides whether this is usable at all. Recurring cost is UNKNOWN: no price is stated publicly and app.regrid.com/api/plans was not opened by this lane.',
    redundancy:
        'It would make the SEVEN statewide rows redundant as coverage -- US-NC, US-NY, US-OH, US-WI, US-MT, US-UT, US-VA -- plus the three county rows US-CA-LA, US-AZ-MARICOPA, US-WA-KING, and MassGIS/FDOR/HCAD from lane US-EXPAND. It would NOT make US-NY-NYC redundant: MapPLUTO carries ZoneDist1 / ResidFAR / CommFAR / FacilFAR, which is zoning entitlement, not a parcel boundary, and no parcel vendor substitutes for it. ' +
        'STRONG COUNTER-ARGUMENT, recorded so the decision is not made on convenience: the open rows are AUTHORITATIVE (the county assessor, or the state aggregation of it) and CITABLE; a commercial redistribution is a copy whose provenance chain to the assessor is the vendor\'s to guarantee, not ours to verify. This repo already refuses to state a number it cannot source (C57 SS1.9). The honest architecture is therefore NOT "replace the open rows" but "keep every open row as the authority where it exists and use the commercial channel ONLY as the fall-through for the states that have none" -- which is the same specificity ladder that already puts MapPLUTO ahead of the NY statewide layer.',
    openQuestions: [
        'What are the redistribution terms? A boundary rendered in a customer scene is redistribution. Not published on the vendor page; must be read before any integration.',
        'What is the actual recurring price at our expected call volume? No figure is stated publicly and this lane did not open app.regrid.com/api/plans.',
        'Does the API return a real parcel RING (not a centroid or an extent rectangle)? The 401 means this lane saw NO geometry. An extent-rectangle answer would fail the same bar that keeps the Israeli leg unwired.',
        'What is the per-state FRESHNESS, and does the vendor expose it per row? The open rows do (OH `CurrentTo`, UT `ParcelsCur`, VA `LASTUPDATE`, WI `LOADDATE`), and losing that would be a downgrade, not an upgrade.',
        'Is the "100% coverage" claim measured the way this lane measured NY and VA -- against a county denominator? Two of seven state services this lane probed overstated their own coverage in their own titles.',
    ],
};

export const USA_PARCEL_REFUSALS: readonly UsParcelRefusal[] = [
    {
        regionCode: 'US-TX',
        endpoint:
            'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0/query',
        answer:
            'HTTP 200, 172 bytes, application/json; charset=UTF-8 — {"error":{"code":400,"extendedCode":-2147220222,"message":"Requested operation is not supported by this service.","details":["The requested capability is not supported."]}} for EVERY query form tried, including the trivial where=1%3D1&returnCountOnly=true. The service metadata advertises capabilities "Query,Map" and supportedQueryFormats "JSON, geoJSON, PBF" — the advertisement is FALSE at runtime. (The predecessor host feature.tnris.org no longer resolves at all: curl "Could not resolve host: feature.tnris.org".)',
        verdict:
            'NOT WIRED. The Texas StratMap statewide aggregate (245+ appraisal districts) IS live at the new geographic.texas.gov host — this corrects the 2026-09-03 record, which concluded Texas had no statewide service because it was probing a host that had since been retired — but its REST query capability is refused. Its WMS DOES answer: GET …/arcgis/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/WMSServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&INFO_FORMAT=application/geo%2Bjson at Dallas (32.7767,-96.7970) → HTTP 200, 1661 bytes, application/geo+json, PROP_ID 00000101154000000, OWNER_NAME "DALLAS CITY OF", SITUS_ADDR "1400  YOUNG ST   ,DALLAS, TX 75201" — but every feature carries "geometry": null. IDENTITY WITHOUT A RING. Wiring it would put a parcel card on screen with no boundary, or tempt the extent-rectangle substitution that keeps the Israeli leg unwired (L-616 overstatement family). UNBLOCK BY: asking TxGIO to enable the REST Query capability on the layer, or finding a per-appraisal-district service for the large metros (Harris/HCAD is already wired as US-TX-HARRIS). Until then Texas outside Harris County falls to the OSM footprint.',
    },
    {
        regionCode: 'US-NJ',
        endpoint: 'https://mapsdep.nj.gov/arcgis/rest/services/Framework/Parcels_Composite/MapServer?f=json',
        answer:
            'HTTP 200, 104 bytes, application/json — {"error":{"code":404,"message":"Service Framework/Parcels_Composite/MapServer not found ","details":[]}}. THEN ENUMERATED rather than left as a guess: GET https://mapsdep.nj.gov/arcgis/rest/services?f=json → HTTP 200, 174 bytes, folders ["Applications","Cached_Layers","Features","Tasks","Tech_Support","Utilities"] — there is no "Framework" folder on this host at all. GET …/services/Features?f=json → HTTP 200, 1115 bytes, 20 services (Elevation, Environmental_*, Geodetic, Geology, Government, Grids, Hydrography, Land_CAFRA_coast, Land_lu, Land, Structures, Transportation, Utilities) — NOT ONE carries parcels.',
        verdict:
            'NOT WIRED, and now a MEASURED absence rather than a stale path. mapsdep.nj.gov is the NJ DEP mapping host and it does not publish the parcel composite; New Jersey\'s statewide parcels (NJGIN / MOD-IV) live under a DIFFERENT publisher. NEXT STEP: the NJGIN Open Data hub (njogis-newjersey.opendata.arcgis.com) and the NJOIT/OGIS ArcGIS Online org, NOT this host — re-probing mapsdep is now known to be wasted effort.',
    },
    {
        regionCode: 'US-KY',
        endpoint:
            'https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_Parcel_Data_WGS84WM/MapServer?f=json',
        answer:
            'HTTP 200, 116 bytes, application/json — {"error":{"code":404,"message":"Service WGS84WM_Services/Ky_Parcel_Data_WGS84WM/MapServer not found ","details":[]}}. THEN ENUMERATED: GET https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services?f=json → HTTP 200, 13,099 bytes, 170 services, of which EXACTLY ONE matches parcel/PVA — "WGS84WM_Services/Ky_PVA_Webster_Parcels_WGS84WM", a SINGLE COUNTY (Webster, pop. ~13k).',
        verdict:
            'NOT WIRED, and the enumeration changes the verdict: this is not a moved path, it is a host that publishes ONE county\'s PVA parcels out of Kentucky\'s 120. Wiring it would add a county the size of a small town while the label said Kentucky. NEXT STEP: the KyFromAbove / kygeoportal statewide parcel product (a download, last checked), or leave KY as an OSM footprint — a one-county leg is not worth a registry row.',
    },
    {
        regionCode: 'US-TN',
        endpoint: 'https://tnmap.tn.gov/arcgis/rest/services/BASEMAPS/Parcels/MapServer?f=json',
        answer: 'HTTP 000 — no response within the 25 s probe timeout (no status line, 0 bytes).',
        verdict:
            'NOT WIRED — host did not answer. Distinguish this from a 404: the endpoint may be correct and merely unreachable from this vantage. NEXT STEP: re-probe from the production egress before concluding anything about Tennessee.',
    },
    {
        regionCode: 'US-MD',
        endpoint:
            'https://geodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer?f=json',
        answer:
            'HTTP 503, 19405 bytes, text/html — "<!doctype html> <title>Site Maintenance</title> …"',
        verdict:
            'NOT WIRED — the whole MD iMAP host is serving a maintenance page. This is an OUTAGE, not an absence: Maryland MDProperty View is a real statewide open parcel product. NEXT STEP: re-probe; wire on this pattern when the host returns.',
    },
    {
        regionCode: 'US-OR',
        endpoint: 'https://navigator.state.or.us/arcgis/rest/services/Framework/Taxlot_Feature/MapServer?f=json',
        answer:
            'HTTP 200, 101 bytes, application/json — {"error":{"code":404,"message":"Service Framework/Taxlot_Feature/MapServer not found ","details":[]}}. THEN ENUMERATED: GET https://navigator.state.or.us/arcgis/rest/services/Framework?f=json → HTTP 200, 728 bytes, 12 services, of which the only cadastral-sounding two are "Framework/Cadastral_PLSS" and "Framework/Cadastral_PLSS_WM".',
        verdict:
            'NOT WIRED, and the enumeration is the interesting part: what this host calls "Cadastral" is the PLSS SURVEY GRID — township/range/section — which contains ZERO private lots. That is the exact trap the federal NGDA "Cadastre" theme sets, met again at state level: a layer named cadastral that is not a parcel fabric. Wiring it would draw section squares and call them parcels. NEXT STEP: the Oregon statewide taxlot product is a DOWNLOAD published through the Oregon Spatial Data Library / Dept. of Revenue, not this REST host.',
    },
    {
        regionCode: 'US-IL-COOK',
        endpoint: 'https://gis.cookcountyil.gov/traditional/rest/services/cookVwrDynmc/MapServer?f=json',
        answer: 'HTTP 000 — connection failed, 0 bytes (unchanged from the 2026-07-31 finding).',
        verdict:
            'NO CHANGE NEEDED. The Cook County ArcGIS host is still dead, and the existing US-IL-CHI row already routes around it through Socrata — RE-CONFIRMED LIVE this lane: GET https://datacatalog.cookcountyil.gov/resource/77tz-riq7.json?$limit=1 → HTTP 200, 3388 bytes, application/json, [{"pin10":"0101100119","municipality":"Barrington",…}]. Recorded so the next lane does not re-probe a host that has been down for five weeks.',
    },
];
