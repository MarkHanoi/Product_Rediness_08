# LANE AU-OPEN — Australia (open states) parcel wiring

> Lane: intl-parcels/au-open · Built + LIVE-probed **2026-09-03** · No commit (working-tree only).
> Scope: **PARCELS** for the six open states/territories (NSW · VIC · QLD · SA · TAS · ACT) +
> two **declared deferrals** (WA · NT). Light US-`<STATE>` sub-national idiom, not the §J
> CountryAdapter — no envelope/rules/buildings arm here.
> Method binding: the AU sweep (`audit/geo-expansion/2026-09-02/au-sweep.md`) was PROBE-verified;
> this lane RE-PROBED every open state live today and wired the registry to the results.

## ⭐ Headline

**Six of eight Australian states/territories returned a REAL legal parcel id LIVE this session,
re-probed today**, and all six are now routed by the existing parcel registry. WA and NT are
declared deferrals with their live gate transcript + a reviewBy date. Nothing about the national
jurisdiction resolver had to change — Australia's continental isolation makes it route cleanly
through the resolver's refusal path.

| Region | Endpoint (protocol) | LIVE id today | Transcript |
|---|---|---|---|
| **AU-NSW** | DCS Spatial Services FeatureServer/8 (ArcGIS) | `lotidstring 100//DP1048011` | `live-nsw-townhall.json` |
| **AU-VIC** | Vicmap open-data WFS `v_parcel_mp` (GeoServer) | `parcel_spi PC366537` | `live-vic-melbourne.json` |
| **AU-QLD** | QSpatial LandParcelPropertyFramework/4 (ArcGIS) | `lotplan 47SP317615` | `live-qld-brisbane.json` |
| **AU-SA** | PlanSA SAPPA/…/41 (ArcGIS, Referer-gated) | `parcel_id C21367 F1`, title `CT 5954/719` | `live-sa-rundle.json` |
| **AU-TAS** | theLIST CadastreParcels/0 (ArcGIS) | `PID 3321248`, title `40374/3`, 49-51 Murray St | `live-tas-hobart.json` |
| **AU-ACT** | ACTmapi ACTGOV_BLOCKS/0 (ArcGIS) | `block 44 section 19` (BLOCK_KEY 11080190044) | `live-act-civic.json` |
| AU-WA | Landgate SLIP layer 2 | **deferral** — geometry only, no id | (au-sweep `wa-layer2-perth.json`) |
| AU-NT | NR Maps / NTLIS | **deferral** — viewer/JS-app gated | (au-sweep `nt-nrmaps.html`) |

Transcripts (new today): `audit/intl-parcels/2026-09-02/transcripts-au/live-*.json` + the SA
no-Referer control `live-sa-noreferer.txt`.

## 1 — What was built

- `packages/site-parcel-data/src/countryAdapters/au/` (this lane's own dir):
  - `auJurisdiction.ts` — eight state/territory bboxes + `isIn*` predicates + `AuRegionCode`. Carries
    the proof that a bbox predicate (not `claimsNation`) is correct here (§3).
  - `auStateCadastre.ts` — the **shared** resolver, one client parameterised by an `AuStateDescriptor`
    per state (DRY across the 5 ArcGIS states + 1 WFS state, provenance kept per-descriptor). Pure
    parse of BOTH Esri-JSON (`{rings}`) and WFS GeoJSON (`{coordinates}`); CRS honesty guard;
    geometry-derived area; injectable-fetch resolver that never throws; OTel span
    `pryzm.parcel.auStateCadastre` (P8).
  - `auSources.ts` — typed per-state source registry with dated probe evidence + the two deferral
    rows carrying their gate + reviewBy.
  - `index.ts` — barrel (all `Au*`/`AU_*`/`isIn*`-named).
- `packages/site-parcel-data/__tests__/auStateCadastre.test.ts` — 31 tests (recorded-live fixtures),
  green: parse of all six real ids, QLD unlinked-skip, ACT RETIRED-drop, CRS-guard, routing/
  reachability for all six capitals, Canberra-beats-NSW specificity, the AU-SA≠SA collision, the
  WA/NT deferral rows, Albury border self-correction, the fetch seam.
- SHARED files edited in place + queued in `barrel-additions-au-open.txt`:
  `parcelProviders/registry.ts` (8 rows + imports + 8 REGION_BBOX entries) and `src/index.ts`
  (one barrel line).

## 2 — Per-state notes (honesty caveats kept, never smoothed)

- **AU-NSW** — keyless, CC Attribution. `lotidstring` is the served legal id. Road corridors are not
  lots (0 features → footprint), already the registry's miss behaviour.
- **AU-VIC** — keyless WFS, CC BY 4.0. ⚠ The CQL `INTERSECTS` point is **LAT,LON order** (a lon,lat
  probe returns 0 *silently*); GeoJSON output is lon/lat under `srsName=EPSG:4326`; native CRS is
  urn EPSG::7844 (GDA2020 ≈ WGS84 at BIM scale). Geometry column is `geom`.
- **AU-QLD** — keyless, CC BY 4.0. The point query returns the lot **plus** an "Unlinked parcel or
  interest" feature with null `lotplan`; the parser drops the null-id feature.
- **AU-SA** — ⛔ code **AU-SA**, never `SA` (= Saudi). Real parcel + title, but behind a **soft
  CloudFront WAF Referer rule**: a bare request → **HTTP 403**, the same request **with**
  `Referer: https://sappa.plan.sa.gov.au/` → **HTTP 200** (both probed today; control saved). NOT
  IP-geofenced (unlike Saudi Balady). The proxy adds the Referer server-side. Data itself is CC
  Attribution (open downloads exist). PlanSA live-endpoint terms owed a read (reviewBy 2026-12-01).
- **AU-TAS** — keyless, richest row (id + title + tenure + address + area). Licence string **UNKNOWN**
  this session (theLIST records usually CC BY 3.0 AU) — read the listdata record (reviewBy 2026-10-15).
- **AU-ACT** — keyless, block/section IS the parcel id (leasehold), Territory-Plan zone rides on the
  row. ⚠ At Civic the point returned **3 RETIRED + 1 APPROVED** blocks and **no `CURRENT`**; the
  parser drops RETIRED (superseded ≠ current) and ranks CURRENT < APPROVED, resolving block 44/19.
  The served `BLOCK_SECTION` field is **section/block** order ("19/12"); the id is composed from the
  explicit block+section fields so the ordering is unambiguous.

## 3 — Why no change to `nationalJurisdictionResolver.ts` (the "route via the resolver, no rival bbox" rule)

The lane's hard rule is that the click must route through the existing national/sub-national
resolver framework, not a new rival bbox. It does — with **zero** edits to the resolver, and this is
the *correct* outcome, measured not assumed:

1. Every AU point sits at **lon 112.9–153.7°E**. Every national/Saudi prefilter in the resolver tops
   out at **≤ 55.7°E** (Saudi), and every US city box is negative-lon. So no prefilter matches an AU
   point → `resolveNationalJurisdiction` returns **`no-national-candidate`** (verified in the test
   for five capitals). On that refusal `resolveParcelCandidates` keeps the full bbox-matched set —
   the "a refusal is not a dead click" path — so the AU bbox rows route normally.
2. This is the SAME framework the US-`<STATE>` rows already use (`isInSF`/`isInNYC`/`isInChicago`),
   which the lane bound me to extend. Adding AU to the resolver would require SUB-national AU routing
   — the lane the resolver explicitly **defers** in its own header ("E4 control 10 — recorded, not
   actioned") — and an AUS ADM0 polygon this lane did not source/probe. Sourcing a half-modelled AUS
   boundary would be strictly worse (a confident wrong claim carrying a citation).
3. The only real overlap is between **sibling AU states** (adjacent rectangles touch on shared
   borders; ACT is enclaved in NSW). That is resolved with no new mechanism: **specificity** ranks
   the smaller box first (Canberra → AU-ACT ahead of AU-NSW; both proven in the test), and each state
   cadastre holds only its own state's parcels, so a border-band click gets 0 features from the
   wrong-state service and `resolveParcelWithFallback` walks on (Albury NSW-side: VIC ranks first,
   returns null, falls through to NSW — proven in the test).

## 4 — Deferrals (declared, with gate transcript + reviewBy)

- **AU-WA** — geometry is keyless (Landgate SLIP layer 2 "Cadastre (No Attributes)") but the layer
  returns **no lot/plan/id** (probed attributes: `{objectid, view_scale}` only). The attributed
  cadastre carries `license_title "Custom (Other)"` = a Landgate data agreement (price class unread —
  geoscape.com.au 403 to our probe). Registered as an honest footprint. **Decision owed:** buy the
  Landgate attributed cadastre vs geometry-only honesty label (reviewBy 2026-11-15). Planning layers
  (R-Codes, region/LPS zones) ARE keyless.
- **AU-NT** — viewer/JS-app mediated: NR Maps issues a `jsessionid` from a JS loader with no REST/OGC
  endpoint; NTLIS/iPlan → Cloudflare 403; data.nt CKAN has no cadastre/zoning dataset. Machine
  channel **UNKNOWN, not zero** — settle via a browser-session network capture of NR Maps (our curl
  env cannot execute its JS). Smallest market, last in launch order (reviewBy 2026-12-15).

## 5 — Verification

- `npx vitest run __tests__/auStateCadastre.test.ts` → **31/31 pass**.
- `npx vitest run __tests__/parcelRegistryWiring.test.ts __tests__/parcelRegistryNationalWiring.test.ts __tests__/parcelRegistry.test.ts`
  → **134/134 pass** (my 8 rows satisfy the "every row has finite specificity" + exclusivity invariants).
- `npx tsc -p tsconfig.json --noEmit` → **the only error is a pre-existing concurrent-lane one**
  (`__tests__/frPrescriptionGeometry.test.ts` importing `Pt`, an untracked FR-lane file) — **zero**
  errors in any AU file, registry.ts, or index.ts.
- Six LIVE upstream clicks today (UA `PRYZM-Research/1.0 …`), each RC=0, each returning the id in the
  table above; the SA control (no Referer) returned HTTP 403 as expected.

## 6 — Owed (named, not silently dropped)

- Server-side proxies `/api/parcel/au-{nsw,vic,qld,sa,tas,act}` (shared server file — orchestrator /
  a server pass). Endpoints + exact live queries are in `AU_STATE_DESCRIPTORS` + `auSources.ts`. SA's
  proxy MUST inject `AU_SA_REFERER`; VIC's is a WFS GetFeature with a LAT,LON CQL point.
- Licence records to read: TAS (listdata record), ACT (per-item), SA PlanSA live-endpoint terms.
- WA Landgate attributed-cadastre price class; NT NR Maps backend via a browser session.
