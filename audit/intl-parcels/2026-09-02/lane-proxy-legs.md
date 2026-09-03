# LANE PROXY-LEGS — server parcel proxy legs for the 2026-09-02/03 adapter waves

> Lane: intl-parcels/proxy-legs · Wired + LIVE-probed **2026-09-03** · No commit (working-tree only).
> Scope fence honoured: edits ONLY in `server/jurisdiction/euCadastreProxy.js` +
> `server/__tests__/euCadastreProxy.test.ts` (no `server/jurisdiction/index.js` change needed — the
> route is the generic `GET /api/parcel/:cc`, already mounted). Package-side deltas queued in
> `proxy-legs-package-deltas.txt`, per the fence.
> UA on every live probe: `PRYZM-Research/1.0 (+https://pryzm.app; contact pryzmhello@gmail.com)`.

## ⭐ Headline

**13 legs wired, 13 live-proven THROUGH the new builders** (the full proxy resolution path:
builder → fetch → parser → normalise → pickCandidate), each returning the adapter lane's exact
live-proven parcel id. **1 deliberate skip (IL)** — the live-proven channel serves NO ring, and a
rectangle-as-boundary would be the L-616 overstatement family. `EU_CADASTRE_SOURCES` now has
**25 keys** (was 12).

## Per-jurisdiction verdicts

| cc | Wired | Live probe through the leg (2026-09-03) | Notes |
|---|---|---|---|
| `au-nsw` | ✅ | Sydney Town Hall (-33.87344,151.20658) → **`100//DP1048011`**, 21-vert ring, 1.2 s | ArcGIS point-intersect, explicit outFields |
| `au-vic` | ✅ | Melbourne (-37.8136,144.9631) → **`PC366537`** | WFS CQL `INTERSECTS(geom,POINT(lat lon))` — **LAT,LON** (lon,lat silently returns 0; pinned by test) |
| `au-qld` | ✅ | Brisbane CBD (-27.4705,153.0260) → **`47SP317615`**, "Brisbane City" | `select` drops the null-lotplan "Unlinked parcel" twin BEFORE point-in-polygon |
| `au-sa` | ✅ | Rundle Mall (-34.9235,138.6010) → **`C21367 F1`**, title `CT 5954/719` | `Referer: https://sappa.plan.sa.gov.au/` injected server-side (soft CloudFront WAF; documented PUBLIC value, not a secret; header injection pinned by test) |
| `au-tas` | ✅ | Hobart (-42.8821,147.3272) → **PID `3321248`**, "49-51 MURRAY ST HOBART TAS 7000", ring-derived 29 m² (cross-checks upstream COMP_AREA 28.678) | |
| `au-act` | ✅ | Civic (-35.2809,149.1300) → **block/section `44/19`**, CANBERRA CENTRAL | `select` drops RETIRED lifecycle + ranks CURRENT < APPROVED (a RETIRED block also contains the click — pinned by test) |
| `tr` | ✅ | Istanbul/Kadıköy (40.9819,29.0576) → **ada/parsel `3106/258`**, alan 816.27 m², "Tuğlaci Başi, Kadiköy, Istanbul", 0.46 s | Bare-GeoJSON-Feature body (parser extended); TKGM's no-parcel answer is a SEMANTIC HTTP 404 → `semantic404: true` classifies it `empty`, never `unreachable` (TR-only; pinned by test) |
| `il` | ⛔ SKIPPED | — | govmap IdentifyByXY serves **no ring** (centroid+extent only — the IL lane's own measured fact, "never fabricated here"). Wiring would either serve no geometry or draw the extent RECTANGLE as a legal boundary (L-616 family). The ring query (PARCEL_ALL by objectId) is the IL lane's recorded follow-up; `/api/parcel/il` 404s and the IL row self-corrects to the OSM footprint — its own documented honest state. Pinned by a test (`il` must stay un-keyed). |
| `qa` | ✅ | Doha (25.286,51.531) → **PIN `1010028`**, PDAREA 183494 m², 137-vert ring, 0.66 s | Mirrors the adapter's measured query verbatim (`outFields=*` is the adapter's own shape); no address field served → none invented |
| `lv` | ✅ | Rīga (56.9496,24.1052) → **code `01000070162`**, 5768 m² (served `area`), 41-vert ring | ⚠ NOT the LV lane's `01000070006` at the same point — and that is a FINDING, not a defect: the bbox holds 3 candidates and **the ring containing the click is 01000070162** (measured with a local point-in-polygon over the live response). The adapter's `count=1` first-feature pick is the divergent one — flagged in proxy-legs-package-deltas.txt §3. urn AUTHORITY form on BOTH srsName and bbox; ±0.0001 dense-parcel window (the LU lesson) |
| `hr` | ✅ | Zagreb Ban Jelačić (45.8132,15.9771) → **`k.č. 2379, k.o. 335240`** (the HR lane's exact parcel), 161-vert WGS84 ring | NEW MEASUREMENT beyond the HR lane: `srsName=EPSG:4326` IS honoured for OUTPUT on cp_wms (probed: crs echoed urn:…::4326, degrees, attrs intact) — the lane had only measured native-3765 output with no srsName. Without this fact the leg would have been unwireable (the proxy does no reprojection). Registry row flip queued (deltas §1) |
| `gr` | ✅ | Athens/Syntagma (37.9755,23.7348) → **KAEK `050095701001`**, AREA 10839.77 m², 0.22 s | Explicit GR outFields; DESCR (land-use text) deliberately NOT surfaced as an address |
| `si` | ✅ | Ljubljana (46.0569,14.5058) → **`1725 3274/13`**, POVRSINA 19141 m², "1725 AJDOVŠČINA" | The SI lane's queued B3 applied verbatim (guard uses the shipped SLOVENIA_BBOX minLon 13.35, not B3's draft 13.3) — orchestrator: mark B3 done (deltas §2) |
| `sk` | ✅ | Bratislava Old Town (48.1436,17.1077) → **`parc. č. 15, k.ú. 2933`**, DESCRIPTIVE_AREA 832 m² | Pure SPATIAL query — a test pins that NO `where=` param is ever sent (the ESKN WAF 403s any where clause) |

No jurisdiction in the brief was lane-marked parcel-deferred except AU-WA / AU-NT (no proxyPath —
their registry rows are footprint deferrals; nothing to wire) and effectively IL (ring follow-up).

## What changed in `server/jurisdiction/euCadastreProxy.js`

- **13 new `EU_CADASTRE_SOURCES` rows** (`au-nsw`/`au-vic`/`au-qld`/`au-sa`/`au-tas`/`au-act`/
  `tr`/`qa`/`lv`/`hr`/`gr`/`si`/`sk`), `source` = each registry row's providerId (C84 EI-9 one
  spelling), guards = each adapter's measured routing bbox.
- **Three small row-shape extensions**, each carried by a real measured need and documented on the
  typedef: `headers` (AU-SA Referer — the only header any leg needs; all channels keyless, no
  secrets anywhere), `semantic404` (TR: 404 = durable absence; every other source keeps
  404 → `unreachable`), `select` (AU-QLD unlinked twins / AU-ACT RETIRED lifecycle — candidate
  pre-filtering so point-in-polygon can only choose an assertable parcel).
- `parseGeoJsonCandidates` accepts a bare GeoJSON `Feature` (TKGM's body shape) — backwards-
  compatible (FeatureCollection checked first).
- `fetchTextOnce` gained an `opts` param (per-source headers + the `SEMANTIC_404` sentinel);
  existing call behaviour unchanged for all prior sources.
- Header doc: the wired-cadastres table extended; an explicit ⚠ block explains WHY `il` is absent.

## Verification

- `npx vitest run server/__tests__/euCadastreProxy.test.ts --config vitest.server.config.ts`
  (test:server resolves to `vitest run --config vitest.server.config.ts`) → **RC=0, 47/47**
  (was 25; +22 new: per-leg normalisation, URL-builder pins incl. the VIC LAT,LON CQL axis, the
  LV urn bbox axis, the SK no-where WAF pin, the HR srsName pin, AU-SA header injection, TR
  semantic-404 vs FR 404, ArcGIS-error-body honesty on the new legs, out-of-area guards, the
  25-key exact set, and the IL absence pin). Offline — every test injects `fetchImpl`.
- Sibling suites exercising the same module: `eeParcelProxy` + `ltParcelProxy` + `plParcelProxy` +
  `jurisdictionRouter` → **RC=0, 19/19** (no regression on the pre-existing 12 legs).
- `node --check server/jurisdiction/euCadastreProxy.js` → clean.
- **13 live foreground probes through the real resolution path** (the three the brief required —
  Sydney, Istanbul, Rīga — plus all ten remaining legs), each `outcome=ok` with the real ids in
  the table above. The SA control (no Referer → 403) was probed by the AU lane 2026-09-02
  (`transcripts-au/live-sa-noreferer.txt`); this lane's probe went through the header-injecting
  leg and returned 200 + the parcel.

## Honesty ledger (kept, not smoothed)

- Licences: TR / IL / QA remain **UNREAD → YELLOW** (their lanes' finding — wiring the leg does
  not change it); TAS licence string UNKNOWN (reviewBy 2026-10-15); SA PlanSA live-endpoint terms
  owed a read (reviewBy 2026-12-01); HR WFS licence text YELLOW. The proxy serves these channels
  exactly as the registry rows already declare them; the licence reads are the owed follow-ups.
- Dormancy: wiring a leg does NOT make a click resolve end-to-end where the registry row is
  DORMANT on the resolver gate (LV/GR/SI/SK claimsNation false; HR row still footprint-fallback
  until the deltas §1 flip). The AU/TR/QA rows route TODAY (bbox idiom) — those clicks now
  resolve end-to-end in production once this tree deploys.
- `luParcelProxy.test.ts` is cited by the LU leg's comment but does not exist (pre-existing
  drift; deltas §5).
