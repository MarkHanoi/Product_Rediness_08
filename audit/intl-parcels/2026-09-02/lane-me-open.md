# LANE ME-OPEN — MIDDLE EAST (open channels): TURKEY · ISRAEL · QATAR

> Lane: intl-parcels/middle-east-open · Implemented 2026-09-03 · Live probes 2026-09-02
> UA on every foreground probe: `PRYZM-Research/1.0 (+https://pryzm.app; contact pryzmhello@gmail.com)`
> Binding doctrine: every channel claim is PROBE-VERIFIED LIVE (HTTP status + a real payload field
> quoted verbatim) or marked UNKNOWN. Failure ≠ absence. SURVEYED ≠ NORMATIVE. Licence only from the
> actual licence page — several are UNREAD and are flagged YELLOW, never assumed open.
> Source of endpoints: `audit/geo-expansion/2026-09-02/me-sweep.md` (§10 TR, §8 IL, §4 QA).

## Verdict — all three parcel channels WIRED and LIVE

| Country | Parcel channel | Live id (2026-09-02) | regionCode | Licence |
|---|---|---|---|---|
| Turkey | TKGM megsiswebapi.v3 GeoJSON, keyless | ada 3106 / parsel 258 (İstanbul/Kadıköy) | `TR` | UNREAD → YELLOW |
| Israel | govmap IdentifyByXY PARCEL_ALL, keyless (ITM) | gush 6952 / helka 139 (Tel Aviv) | `IL` | UNREAD → YELLOW |
| Qatar | CadastrePlots ArcGIS query, keyless | PIN 1010028 (Doha) | `QA` | UNREAD → YELLOW |

All three: keyless from a foreign IP (no in-region vantage needed), sub-second, real national parcel
identifier returned. This is the me-sweep's "TR + IL + QA are wireable now at the parcel axis"
conclusion, executed.

## The three LIVE clicks (transcripts under `transcripts-me-open/`)

**Turkey** — `GET https://cbsapi.tkgm.gov.tr/megsiswebapi.v3/api/parsel/40.9819/29.0576`
→ HTTP 200, t≈0.46 s. GeoJSON Feature, WGS84 Polygon, properties:
`adaNo="3106" · parselNo="258" · ilAd="Istanbul" · ilceAd="Kadiköy" · mahalleAd="Tuğlaci Başi" ·
alan="816.27" · pafta="151" · zeminKmdurum="Kat Mülkiyet" · nitelik="11 Katli Betonarme Mesken,Ofis,Işyeri Ve Arsasi"`.
The `nitelik` string carries the storey count in text ("11 Katli" = 11-storey) — a probe-verified,
extractable floor SIGNAL riding the parcel channel (carried as `storeyHint`, a description-derived
HINT, never a normative İmar height). A no-parcel point answers HTTP 404 `{"Message":"Parsel
Bulunamadı: …"}` — a SEMANTIC miss, classified `absent`, not a fence.
Transcript: `tr-tkgm-istanbul-kadikoy.json`.

**Israel** — `POST https://ags.govmap.gov.il/Identify/IdentifyByXY`
body `{"x":179254,"y":665111,"mapTolerance":10,"layers":[{"LayerType":0,"LayerName":"PARCEL_ALL","LayerFilter":""}]}`
→ HTTP 200, t≈0.56 s. `errorCode:0`, `data[0].LayerName="PARCEL_ALL"`, fields (Hebrew):
`מספר גוש="6952" · חלקה="139" · שטח רשום (מ"ר)="7404" · סטטוס="מוסדר"`, plus the registrar disclaimer
(area is NOT a legal reference — carried verbatim on `areaDisclaimer`) and the ITM centroid
`(179256.4375, 665120.5938)`. The API speaks Israeli TM Grid (ITM / EPSG:2039) ONLY — the WGS84 click
is projected to ITM in the leg (`ilItm.ts`), and the returned centroid/extent projected back to WGS84
`(32.0783, 34.7780)`. Transcript: `il-govmap-telaviv.json`.

**Qatar** — `GET https://services.gisqatar.org.qa/server/rest/services/Vector/CadastrePlots/MapServer/0/query?geometry=51.531,25.286&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&f=json`
→ HTTP 200, t≈0.76 s. `features[0].attributes`:
`PIN=1010028 · CDST_KEY=1010028 · PD_NO="PD/4693/2019" · PDAREA=183494 · GFCODE="PDGVCDST" ·
GLOBALID="{D9276B44-…}"`, geometry a 137-vertex WGS84 ring. The CadastrePlots layer is HIDDEN from the
`Vector` folder listing — it was addressed directly (GetCapabilities-is-not-an-inventory, ArcGIS
edition: enumerate the qmap webmap, not the folder). Transcript: `qa-cadastreplots-doha.json`.

## What was built

Three country adapters under `packages/site-parcel-data/src/countryAdapters/`, each mirroring the
proven EE/DK executor shape (FetchOutcome end-to-end; injectable `fetchImpl`; a pure parser separate
from the impure fetch; typed source rows validated through `SiteIntelSourceSchema`):

- `tr/` — `trJurisdiction.ts` (TURKEY_BBOX + isInTurkey) · `trTkgmClient.ts` (keyless GET, 404-as-absent) ·
  `trParcelProvider.ts` (`TrParsel` + `parseTrParselFeature` + `extractStoreyHintFromNitelik` +
  `resolveTrParselAtWgs84Point`) · `trSources.ts` · `index.ts`.
- `il/` — `ilJurisdiction.ts` (ISRAEL_BBOX + isInIsrael) · `ilItm.ts` (the ITM↔WGS84 transform,
  EPSG:2039, self-contained Krüger n-series with lat-of-origin + non-UTM k0/false-E/N) ·
  `ilGovmapClient.ts` (keyless POST) · `ilParcelProvider.ts` (`IlParcel` + `parseIlGovmapParcel` +
  `resolveIlParcelAtWgs84Point`) · `ilSources.ts` · `index.ts`.
- `qa/` — `qaJurisdiction.ts` (QATAR_BBOX + isInQatar) · `qaCadastreClient.ts` (keyless ArcGIS query,
  error-object-as-transient) · `qaParcelProvider.ts` (`QaCadastrePlot` + `parseQaCadastrePlot` +
  `resolveQaCadastrePlotAtWgs84Point`) · `qaSources.ts` · `index.ts`.

Registry rows (TR/IL/QA) + REGION_BBOX entries + barrel exports — recorded in
`barrel-additions-me-open.txt`. Tests (47, all green): `ilItm.test.ts`, `ilParcelProvider.test.ts`,
`qaParcelProvider.test.ts`, `trParcelProvider.test.ts`, `meOpenRegistryWiring.test.ts` (the
routing/reachability test that starts from `resolveParcelCandidates`). Existing registry suites
(223 tests) stay green. Package `tsc --noEmit`: 0 errors in ME-OPEN files (the one repo error is the
parallel FR lane's untracked `frPrescriptionGeometry.test.ts`, not this lane).

## The routing decision — bbox predicates (SA idiom), NOT `claimsNation`

The EE/LT/PL/LU/SE rows route on `claimsNation(cc)` because their rectangles overlap each other's
SOVEREIGN soil. That idiom is UNAVAILABLE to TR/IL/QA: `nationalJurisdictionResolver` bundles polygons
for 16 countries + 16 un-modelled neighbours, and none of the three is in either set — so
`claimsNation('TR'|'IL'|'QA')` can never be true and would make the rows dead code. They route on a
rectangle, exactly like SA (`isInSaudiArabia`) and the AU states, and the service's own empty answer
is the real "no parcel here". This was FALSIFIED, not assumed — the national resolver's behaviour at
each golden point was measured (2026-09-02, `resolveNationalJurisdiction`):

- Istanbul, Ankara → REFUSE `no-national-candidate` (`cands=[]`) — no modelled box reaches Turkey.
- Tel Aviv, Jerusalem, Eilat → REFUSE `outside-every-candidate-polygon` (`cands=[SAU]`) — the Saudi
  BBOX pre-filters, but the Israeli point is not inside the Saudi POLYGON and the nearest Saudi
  boundary is hundreds of km away.
- Doha → REFUSE `outside-every-candidate-polygon` (`cands=[SAU]`) — Qatar is a separate country;
  nearest Saudi boundary ~80 km.
- Riyadh, Jeddah → CLAIM SA (`polygon-containment`) — UNCHANGED; the ME rows take no Saudi soil.

On every ME refusal `resolveParcelCandidates` keeps the full bbox-matched set (the "a refusal is not a
dead click" contract), so the rows route with NO change to the national resolver. The Saudi-box
overlap (QATAR_BBOX ⊂ SAUDI_ARABIA_BBOX; ISRAEL_BBOX's south half ⊂ it) is resolved by SPECIFICITY:
QA/IL boxes are far smaller than SA's, so the live cadastre is tried first and the SA footprint is the
honest fall-through — measured `codes(Doha)=['QA','SA']`, `codes(TelAviv)=['IL','SA']`. A genuine Saudi
point in the overlap band is inside the Saudi polygon, so the resolver CLAIMS SA and the claim-filter
drops the ME row — the overlap is decided by geometry, never by which rectangle is smaller.

## Honesty / deferrals

- **Licences UNREAD → YELLOW on all three** (brief: "flag, do not assume open"). TKGM
  parselsorgu serves no static terms (bulk/WMS is priced+protocol-gated — the query endpoint being
  keyless is the bulk-vs-query distinction, not a grant); the govmap query-API terms are unread (the
  BULK CKAN field reads "Other (Open)", a DIFFERENT product, and its payload host IP-fences foreign
  IPs); the CadastrePlots REST endpoint carries no licence statement. Each `*Sources.ts` names the
  exact probe that would flip it GREEN.
- **Server proxies `/api/parcel/{tr,il,qa}` NOT wired** — the CHANNEL is live and probed and the
  package-side parsers are built + tested, but the server proxy seat is the named remaining wiring
  (the row notes say so verbatim; same honest state as US-NY-NYC / IT today). Until wired, a real
  click resolves null → OSM footprint, never a fabricated parcel.
- **Envelope RULES not minted anywhere.** TR: document-only + municipal e-Devlet gate (me-sweep §10).
  IL: plan GEOMETRY is NATIONAL-NOW at iplan, but the numeric rights live in mavat plan PDFs
  (Europe-class F, perfect `pl_number` join key). QA: zone GEOMETRY is NATIONAL-NOW (Vector/Zoning,
  recorded as a documented source row), numbers behind RULEID are MME zoning-regulation PDFs (F). None
  is asserted as data.
- **IL national bulk shapefile** (`parcel_all.zip`): licence "Other (Open)" but the S3 payload host
  403s foreign IPs — recorded as a `blocked` source row (the licence is open, the pipe is fenced;
  probe: fetch via an IL vantage). The QUERY endpoint this lane wires is NOT the fenced product.

## Region-code collision note (inherited from the AU lane, respected here)

Australian South Australia is `AU-SA`; Saudi Arabia is `SA`. This lane's Qatar/Israel rows are the
`QA`/`IL` codes and the QA/IL boxes overlap the Saudi (`SA`) box — the overlap is with the SAUDI row,
resolved as documented above. No ME code collides with any AU code.
