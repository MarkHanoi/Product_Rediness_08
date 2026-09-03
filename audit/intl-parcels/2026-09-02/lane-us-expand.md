# LANE US-EXPAND — US parcel jurisdictions beyond the three cities

**Date:** 2026-09-03 · **UA:** `PRYZM-Research/1.0 (+https://pryzm.app; contact pryzmhello@gmail.com)`
· **No commit** (scoped code applied in-worktree; shared-file edits mirrored in
`barrel-additions-us.txt`).

## Verdict — four MORE US jurisdictions, all live, all on the proven shape

The registry had `US-NY-NYC` / `US-CA-SF` / `US-IL-CHI`. This lane adds four more on the SAME
`US-<STATE>[-<COUNTY>]` idiom (bbox `contains` predicate + same-origin proxy), served by ONE shared
ArcGIS client parameterised by a per-jurisdiction config — DRY without hiding provenance (each
endpoint / CRS / id field / licence / probe verdict is a legible DATA row in `usJurisdiction.ts`):

| regionCode | Source | Scope | Native CRS | Live parcel id (2026-09-03) | Where |
|---|---|---|---|---|---|
| **US-MA** | MassGIS L3 Standardized Parcels | **STATEWIDE** | EPSG:4326 | `LOC_ID F_574532_2920828` | 455 Main St, Worcester |
| **US-FL** | FDOR Statewide Cadastral (DOR/FGIO) | **STATEWIDE** | EPSG:3086 | `PARCEL_ID 1829244ZI000075000020A` | 325 N Florida Ave, Tampa |
| **US-WA-KING** | King County Parcels | 1 county (Seattle) | EPSG:3857 | `PIN 9831200275` | Capitol Hill, Seattle |
| **US-TX-HARRIS** | Harris County / HCAD | 1 county (Houston) | EPSG:2278 | `HCAD_NUM 0261520000043` | 3217 Montrose Blvd, Houston |

All four are **keyless**, returned **HTTP 200** and a **real parcel under the click with a WGS84
ring** (an `outSR=4326` intersects point query). MassGIS was probed first per the brief and is the
strongest single open US parcel dataset found: one statewide FeatureServer already published in
EPSG:4326.

## MassGIS is the standout (probed first, as briefed)

`https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/L3_Parcels_FeatureService_4326/FeatureServer/1/query`
— layer 1 = *"MassGIS Standardized Parcels with Assessor Data"*, **statewide**, already in EPSG:4326,
keyless. `LOC_ID` is the statewide-unique standardized parcel id; the layer also carries assessor
context inline (`MAP_PAR_ID`, `SITE_ADDR`, `USE_CODE`, `CITY`, FY value) — surfaced only as optional
context, never as an envelope. Every in-state click resolves.

## Florida is a second statewide fabric (a bonus over "county appraisers")

The FGIO/DOR org (`services9.arcgis.com/Gh9awoU677aKree0`) publishes **`Florida_Statewide_Cadastral`**
(layer *"FDOR Cadastral 2025"*, the annual NAL join), so FL is wired **statewide** rather than
county-by-county. ⚠ **The hosted service is strict:** a bare `geometry=x,y` string returns HTTP 400 /
occasional connection resets; a **JSON point geometry**
(`{"x":lon,"y":lat,"spatialReference":{"wkid":4326}}`) works in ~2–3 s. `buildUsArcgisPointQueryUrl`
therefore always emits JSON geometry, and the note tells the proxy author the same.

## Washington + Texas are wired county-first, honestly scoped

- **King County (WA)** — `gismaps.kingcounty.gov/.../Property/KingCo_Parcels/MapServer/0`. The parcel
  layer carries **geometry + PIN only** (assessor attributes live in a separate `KingCo_PropertyInfo`
  layer) — which is exactly the SF strong case (geometry + id). Bbox'd to King County; a Spokane click
  falls to the footprint, not a mis-attributed cadastre. Code `US-WA-KING`, **not** `US-WA` — using a
  statewide code for a one-county fabric would be the C58 §1.4 overstatement.
- **Harris County / HCAD (TX)** — `www.gis.hctx.net/.../HCAD/Parcels/MapServer/0`, native State-Plane
  feet (EPSG:2278). Rich HCAD attributes (owner, site address components, values, `land_sqft`). Code
  `US-TX-HARRIS`, county-scoped.

### Texas: what did NOT work (recorded so nobody re-chases it)

- **Travis County (Austin) host `gis.traviscountytx.gov`** — did **not resolve** keylessly (HTTP 000,
  connection failure). The City-of-Austin AGOL layer `BOUNDARIES_city_of_austin_parcel` exists and is
  live, but it is **"City of Austin OWNED Parcels"** only — a city-property layer, **not** a general
  cadastre. Not registered.
- **TxGIO/TNRIS statewide `2025_Land_Parcels`** (org `KTcxiTD9dsQw4r7Z`, layer 328) — metadata is a
  polygon layer, but intersects point queries at both an **Austin** and a **Dallas** point returned
  **nothing** (empty body). Not a usable statewide point service. So TX has **no usable statewide open
  parcel service**, which is why TX is wired county-first (Harris = the largest metro). Adding Travis
  later is a one-config addition the moment a live TCAD endpoint is found.

## Routing — how a US click resolves (the "extend the resolver, no rival bbox" requirement)

The US is **deliberately absent from the national-jurisdiction resolver**
(`nationalJurisdictionResolver.ts` answers "which SOVEREIGN STATE claims this point" and its own doc
block lists the US city boxes as intentionally excluded — the within-country refinement is the
registry's specificity walk). So for any US point `resolveNationalJurisdiction` returns
`no-national-candidate`; `resolveParcelCandidates` sees `verdict.ok === false` and keeps the full
bbox-matched set; and the new rows' bbox `contains` predicates decide — **exactly** the established
`isInSF` / `isInChicago` behaviour, extended with four more rows and four `REGION_BBOX` specificity
entries. No `claimsNation`, no second dispatch, no rival bbox mechanism. No US box overlaps any other
registered row (Western hemisphere, and the four new boxes are mutually disjoint), so each US click is
the **sole** candidate at its own points (asserted in the tests).

This matches the concurrent AU-OPEN and ME-OPEN lanes, which added their rows the same way (bbox
`contains`, not `claimsNation`, because those regions are likewise not in the national boundary set).

## Honesty posture (mirrors SF, ADR-0270 / C58 §1.4)

Geometry-first: **id + WGS84 ring + geometry-derived area** (equirectangular shoelace — a geometry
fact, never a trusted upstream area field). **No `farRatio`, no height** is ever emitted: US bulk is
governed by per-municipal zoning ordinances (Houston has none at all) that no open point service
serves. A CRS honesty guard **refuses** a projected (State-Plane feet / Albers metre) ring
(`crs-unprojected`) rather than plot it as degrees. Empty / unreachable / malformed / no-id are
**distinct** typed refusals (§CONTEXT-DATA-HONESTY); the resolver never throws, so a miss falls to the
OSM footprint, never a crash and never a guess.

## Proxy state (same as IT / BE-VLG / GB-ENG / US-NY-NYC)

The four same-origin proxy routes (`/api/parcel/us-ma`, `/api/parcel/us-fl`, `/api/parcel/us-wa-king`,
`/api/parcel/us-tx-harris`) are **not yet wired server-side** → the editor's `fetchFor` returns null →
OSM footprint until the orchestrator adds each proxy. The upstream query each proxy must run is
recorded verbatim in each config's `upstreamQueryUrl` + reproducible via `buildUsArcgisPointQueryUrl`
(and the FL JSON-geometry requirement is called out). Wiring them is a server change, not a package
change.

## Files

**New (this lane's own):**
- `packages/site-parcel-data/src/countryAdapters/us/usArcgisParcelClient.ts` — the shared ArcGIS
  client (config type, pure parser + id/CRS/area gates, `buildUsArcgisPointQueryUrl`, the never-throw
  `fetchUsParcelAtPoint` with OTel span `pryzm.parcel.usArcgis`).
- `packages/site-parcel-data/src/countryAdapters/us/usJurisdiction.ts` — the four configs + bboxes +
  `isInMassachusetts` / `isInFlorida` / `isInKingCountyWa` / `isInHarrisCountyTx` + provider handles.
- `packages/site-parcel-data/src/countryAdapters/us/index.ts` — barrel.
- `packages/site-parcel-data/__tests__/usParcelProviders.test.ts` — 28 tests, recorded-live fixtures.
- `audit/intl-parcels/2026-09-02/transcripts-us/live-us-{ma,fl,wa,tx}.json` — the four live responses.

**Shared (edited in place; mirrored in `barrel-additions-us.txt`):**
- `packages/site-parcel-data/src/parcelProviders/registry.ts` — import block + four rows + four
  `REGION_BBOX` entries.
- `packages/site-parcel-data/src/index.ts` — one `export *` block.

## Verification

- `npx vitest run __tests__/usParcelProviders.test.ts` → **28 passed** (parser, honesty gates, bbox
  predicates, registry reachability/exclusivity, upstream-query shape, fetch seam, area math).
- `npx vitest run` on the three existing registry suites (`parcelRegistry` + `parcelRegistryWiring` +
  `parcelRegistryNationalWiring`) → **134 passed** (no regression; the existing three US cities still
  resolve).
- `npx tsc -p tsconfig.json --noEmit` → **ZERO errors in any US-EXPAND file**. (The package's tsc has
  ONE unrelated error, `frPrescriptionGeometry.test.ts: Module '../src/index.js' has no exported
  member 'Pt'` — a **concurrent FR lane's** in-progress barrel: `fr/index.ts` is modified and
  `frPrescriptionGeometry.ts` is untracked; not caused by and not touched by this lane.)
- **Live-click proof (2026-09-03):** all four upstream queries returned HTTP 200 + a real parcel id
  (transcripts saved). This is the exact query `buildUsArcgisPointQueryUrl` builds — i.e. what each
  proxy will run.
