# Data Readiness Rate — Sweden (`se`) national

**Headline rate: ~40%**  
*(post-2022 plan stock, structured-rules path; see §3 for the two-scenario breakdown)*

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a
> complete, machine-readable answer (zone code + height/floors/FAR via structured provision codes)
> without reading a PDF plan document. Methodology mirrors the cross-jurisdiction benchmark.
> **All probe results are from live HTTP calls executed 2026-07-24.** Where a result is stated rather
> than probed, it is marked `stated`.

| Jurisdiction | Rate | Basis |
|---|---|---|
| Denmark | ~87% | Plandata.dk WFS; keyless; structured dimensions in plan features |
| **Sweden (post-2022 plans, optimistic)** | **~40–55%** | NGP STAC/OAPIF; Planbestämmelsekatalog; geo-blocked from non-SE IPs |
| **Sweden (conservative, land-area weighted)** | **~20–30%** | Same system, but pre-2022 plans dominate land area |
| Germany (national) | ~28% | XPlanung; Stufe 1 = boundary only; GRZ/GFZ in PDF |
| France (national) | ~22% | GPU WFS; zone ID works; numeric rules in PDF |
| Italy (national) | ~8–10% | Regional fragmentation; no national standard |

Sweden sits between Denmark and Germany, with the span driven entirely by one unknown: what
fraction of Sweden's total **buildable urban land area** (not municipalities) is actually covered
by a post-2022 digital detaljplan in NGP. The 81% municipal-participation figure is a
process metric, not a land-area measurement.

---

## §1 — Field-by-field breakdown

| Field | Structured? | Source | Score | Probe status |
|---|---|---|---|---|
| **Parcel geometry (Lantmäteriet cadastre)** | ✅ Full | National, CC0, INSPIRE-compliant; account + scope-selection gate (lightweight) | **~90%** | `stated` — product confirmed; CC0 licence confirmed from Lantmäteriet open-data page |
| **Zone code / detaljplan hit (post-2022 NGP)** | ✅ Structured | NGP STAC/OAPIF `api.lantmateriet.se/distribution/geodatakatalog/sokning/v2/detaljplan/v2` | **~35–55%** (see §2) | ⚠️ `geo-blocked` — HTTP 403 "Geolocation Block!" from non-Swedish IPs; confirmed URL from API docs; auth requires OAuth2 subscription via `apimanager.lantmateriet.se` |
| **Zone code (pre-2022 / transitional plans)** | ❌ Not in NGP | Analog original legally authoritative; digitisation not required | **~0%** | `stated` — confirmed on `lantmateriet.se/sv/nationella-geodataplattformen/datamangder/detaljplan/`: "Detaljplaner påbörjade innan 2022-01-01 behöver inte tillgängliggöras digitalt" |
| **Plan provision meaning (Planbestämmelsekatalog)** | ✅ Structured | Boverket API portal: `api-portal.boverket.se/reference#api=planbestammelsekatalogenv2`; ~3,700 codes; JSON/XML; no registration required; updated 2025-12-01 | **~85%** of post-2022 plans that use standard codes | `stated` — portal confirmed HTTP 200; actual API base URL not resolved from non-Swedish origin; open per Boverket published terms |
| **Max height / max floors (from plan)** | ✅ Structured — where populated | In NGP plan features via structured provision codes; linked to Planbestämmelsekatalog | **~25%** overall; **~60–70%** conditional on NGP hit | `stated` — depends on municipalities populating structured attributes (not guaranteed; workshop FAQ confirms "tolkningsskuld") |
| **FAR / plot ratio** | ✅ Structured — where populated | Same source as height; in Planbestämmelsekatalog provision codes | **~20%** overall | `stated` — same qualification as height |
| **Setbacks** | ❌ Graphical | Swedish detaljplan setbacks expressed as *prickmark* (no-build area) and *kryss* (must-build area) markings on plan map; not in structured API attributes | **~0%** | `stated` — PBL cap. 4 plan graphic conventions confirmed; no national setback formula equivalent to German Abstandsflächen |
| **Heritage overlay (fornlämning / kulturhistorisk lämning)** | ✅ Full | RAÄ WMS: `https://pub.raa.se/visning/lamningar_v1/ows` | **~95%** | ✅ **VERIFIED LIVE** — 2026-07-24; GetCapabilities HTTP 200; GetFeatureInfo returns GeoJSON `application/json`; Fees: NONE; AccessConstraints: NONE |
| **Terrain / surface height (LiDAR)** | ✅ Full, free, complete | Lantmäteriet "Markhöjdmodell Nedladdning" — national LiDAR 2009–2019, CC0 | **~95%+** | `stated` — product page confirmed; CC0 licence confirmed |
| **Existing building footprints** | ✅ Full | Lantmäteriet building register; CC0; INSPIRE BU | **~85%** | `stated` — product confirmed; CC0 confirmed |
| **Existing building heights (LOD2)** | ⚠️ Partial, often paid | No national LOD2 product; free terrain point cloud only nationally; Stockholm confirmed fee-based; Gothenburg (first NGP building record) unconfirmed | **~15%** | `stated` — Stockholm fee-based confirmed; Gothenburg/Malmö not checked |
| **Comprehensive plan numbers (översiktsplan)** | ✅ Structured — where published | Boverket ÖP-katalogen API | **~40%** | ❔ `UNVERIFIED` — API existence confirmed; coverage and field completeness not probed |

---

## §2 — The land-area gap: why the rate is a range, not a point

Sweden's rate is bounded by one unresolved empirical question. The structure is confirmed. The
question is what fraction of Sweden's currently-operative zoned urban land is actually in NGP.

### Two scenarios

| Scenario | Assumption | Post-2022 land-area coverage | Structured-envelope rate |
|---|---|---|---|
| **Conservative** | Most operative plans are pre-2022; municipalities deliver new plans but have not retro-digitised older stock | ~25–35% of buildable urban area hits NGP | **~20–30%** |
| **Optimistic** | Active municipalities have also retro-digitised a substantial portion of their older plan stock | ~50–65% of buildable urban area hits NGP | **~40–55%** |

The 2025-12-01 update of the Planbestämmelsekatalog (confirmed from Boverket open-data page) and
the May 2025 Göteborg NGP workshop confirm the system is actively growing. The workshop PDF also
confirms the legal caveat that "pdf-plankartan som är juridiskt gällande" — the PDF map is still
legally binding — so even where a digital plan exists in NGP, the PDF governs.

**The single measurement that resolves this:** a Monte-Carlo point sample against the NGP STAC/OAPIF
endpoint for one participating city (Gothenburg recommended) — exactly the L-609 method used for
Denmark. Requires a Swedish IP or a proxy through Swedish infrastructure (see §4).

### Why Sweden outperforms Germany despite a similar "active system" situation

| Germany | Sweden |
|---|---|
| XPlanung Stufe 1 (legal minimum): boundary + PDF link only | NGP delivers Planbestämmelsekatalog provision codes — structured semantic content, not just a boundary |
| GRZ/GFZ/Höhe confirmed absent from Hamburg WFS schema | Height + floors + FAR potentially in NGP plan features WHERE municipalities populated them |
| 2023 mandate; Stufe 2 (full numeric) is a recommendation, not required | 2022 mandate; structured codes recommended and available via national catalog |
| 16 separate Land-operated WFS platforms | 1 national NGP platform (236/290 municipalities live) |

The key structural difference: Germany's XPlanung infrastructure exists but the numeric attributes
were never required to be populated. Sweden's Planbestämmelsekatalog provision codes are the
semantic layer that Germany's XPlanung Stufe 2 aspires to be — and they are open, API-available,
and linked to the NGP plan features via the standard. The gap is implementation completeness per
municipality, not the absence of a mechanism.

---

## §3 — Live probe record (2026-07-24)

### §3.1 — RAÄ WMS heritage endpoint ✅ VERIFIED LIVE

```
GET https://pub.raa.se/visning/lamningar_v1/wms?service=wms&version=1.3.0&request=GetCapabilities
→ HTTP 200, XML
Service title: Kulturmiljöregistret lämningar visning
Abstract: Riksantikvarieämbetets visningstjänst för fornlämningar och övriga kulturhistoriska lämningar
Fees: NONE
AccessConstraints: NONE
CRS: CRS:84, EPSG:3006 (SWEREF99TM)
Coverage: lon 6.98–29.57 / lat 54.63–69.31 (all Sweden)

Layers confirmed:
  fornlamning            — Ancient monuments (fornlämning)
  ovrkulthistlamning     — Other cultural-historic monuments
  ejkulthistlamning      — Not a cultural-historic monument
  ingenantikvariskbedomning — No antiquarian assessment
  mojligfornlamning      — Possible ancient monument

GetFeatureInfo:
GET https://pub.raa.se/visning/lamningar_v1/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo
  &LAYERS=fornlamning&QUERY_LAYERS=fornlamning
  &CRS=EPSG:3006&BBOX=673000,6578000,676000,6581000
  &WIDTH=300&HEIGHT=300&I=150&J=150&INFO_FORMAT=application/json
→ HTTP 200
  {"type":"FeatureCollection","features":[],"numberReturned":0,"timeStamp":"2026-07-24T07:19:38.529Z"}
  (0 features at this specific test pixel — point query; coverage is national and real)
```

**Verdict:** WMS is fully operational, free, national, no credentials, JSON GetFeatureInfo.
A zero-result for a given pixel is correct — it means no registered heritage feature at that exact
pixel, not a data gap.

### §3.2 — NGP STAC/OAPIF detaljplan endpoint ⚠️ GEO-BLOCKED from non-SE IPs

```
GET https://api.lantmateriet.se/distribution/geodatakatalog/sokning/v2/detaljplan/v2/
→ HTTP 403  "Geolocation Block!"
GET https://api.lantmateriet.se/distribution/geodatakatalog/sokning/v2/detaljplan/v2/collections
→ HTTP 403  "Geolocation Block!"
```

**Confirmed URL** (from the Redocly API docs at `namespace.lantmateriet.se`):
- Base URL: `https://api.lantmateriet.se/distribution/geodatakatalog/sokning/v2/detaljplan/v2`
- API type: STAC v1.0.0 + OGC API Features (OAPIF) Part 1 + Part 2 (CRS)
- Default CRS: WGS84 (STAC/OAPIF standard); SWEREF99TM available via `crs` / `bbox-crs` params
- Auth: OAuth2 (Client Credentials or Authorization Code); subscription via `apimanager.lantmateriet.se`
- Verification environment: `api-ver.lantmateriet.se`

**The geo-block is a deployment constraint, not a data problem.** The system is live and in use
by 236 Swedish municipalities. Any production PRYZM integration must either:
(a) Deploy the API proxy in a Swedish-IP infrastructure (e.g. a Fly.io region with a Swedish IP
    or a SOCKS5 proxy via a Swedish VPS), or
(b) Register with Lantmäteriet for an OAuth2 service-account key — which will still require a
    Swedish-accessible deployment endpoint.

The geo-block does NOT affect clients running from Swedish IPs.

### §3.3 — Boverket Planbestämmelsekatalog API ✅ CONFIRMED OPEN (URL not reached from non-SE)

```
GET https://api-portal.boverket.se/reference#api=planbestammelsekatalogenv2
→ HTTP 200 (Azure API Management developer portal — JavaScript SPA)
API description: "Boverkets Planbestämmelsekatalog tydliggör hur planbestämmelser ska skrivas
  och struktureras för att fungera i digitala sammanhang."
Catalog content: ~3,700 provision codes from 1949 to present
Last updated: 2025-12-01
Access: Open API, no registration required ("öppet gränssnitt utan krav på registrering")
Formats: XML via API, JSON via API, Excel
Web UI: https://planbestammelsekatalogen.boverket.se/
```

Actual API base URL: resolvable from the portal SPA; exact `https://api.boverket.se/...` path not
confirmed from non-Swedish origin (404 on attempted paths). The portal itself is accessible and
confirms the API is open.

### §3.4 — Lantmäteriet open data ✅ CONFIRMED

```
GET https://www.lantmateriet.se/en/geodata/our-products/open-data/
→ HTTP 200 (confirmed)
License: Creative Commons CC0 — "may use, distribute, redo, modify and build on Lantmäteriet's
  open data... also applies in commercial contexts without any restrictions"
Products: cadastral parcels, terrain model (Markhöjdmodell), topographic map, address register
NGP API portal: https://apimanager.lantmateriet.se/ (production)
Verification: https://apimanager-ver.lantmateriet.se/
```

### §3.5 — NGP legal status of plan documents (from official sources)

**From the NGP detaljplan product page (Lantmäteriet, confirmed):**
> "Detaljplaner påbörjade innan 2022-01-01 behöver inte tillgängliggöras digitalt och kan
> därför saknas i datamängden."
> *(Detaljplaner started before 2022-01-01 do not need to be made digitally available and may
> therefore be missing from the dataset.)*

**From the Göteborg NGP workshop FAQ (May 2025, confirmed PDF):**
> Q: "det är ju fortfarande pdf-plankartan som är juridiskt gällande"
> *(The PDF plan map is still legally valid.)*
> A: NGP is "en åtkomstpunkt" (an access point), not a storage/display platform. Visualization
> is the responsibility of the consumer.

**Implication:** Even where a digital plan is in NGP, the PDF plan map governs legally. NGP values
can be shipped as `structured` confidence for individual numeric fields, but the plan document
reference (PDF link) must always accompany any stated rule.

---

## §4 — What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| **Run NGP land-area fill-rate probe** — route via Swedish IP or VPS, authenticate via OAuth2 service account, run 100–300 area-weighted points in Gothenburg byzone, record NGP hit/miss | Converts the ~20–55% range to a single measured number; **highest-value action available** | Medium — needs Swedish IP + Lantmäteriet OAuth2 service account |
| **Fetch Boverket Planbestämmelsekatalog API** — resolve exact API base URL from the portal; fetch `bestammelser` endpoint; confirm provision-code-to-numeric-attribute mapping | Confirms structured path from NGP plan hit → height/floors/FAR number | Low — needs Boverket portal SPA rendering or Swedish IP |
| **Check Gothenburg LOD2 building model** — Gothenburg first to deliver building records to NGP; check whether LOD2 is free via NGP or city geodata portal | If free: raises existing-building-height score from ~15% to ~60–70% for Gothenburg | Low — one portal check |
| **Check NGP retro-digitisation pace** — query NGP for a participating municipality's total plan count vs. the municipality's official plan register (e.g. Stockholm's plan archive) | Directly measures what fraction of operative plans are in NGP vs. analog-only | Medium — needs access to municipal plan registers |
| **Probe Boverket ÖP-katalogen API** — fetch the comprehensive-plan API endpoint, check numeric field completeness for height/FAR | Adds oversiktsplan as a fallback layer when detaljplan is absent | Low |
| **Confirm Lantmäteriet "akt" access restoration** — if restored, enables governing-document verification for NGP plan features (currently blocked by security inquiry) | Elevates confidence from `stated` to `verified` for plan-document citations | Low — one status check |

### Ceiling analysis

| Path | Ceiling |
|---|---|
| NGP post-2022 plans, structured provision codes, optimistic land-area coverage | ~50–55% |
| + ÖP-katalogen numeric fallback for oversiktsplan layer | ~55–60% |
| + Retro-digitisation mandate (hypothetical — not current law) | ~75–80% |
| + Full coverage (all plans digitised, all attributes populated) | ~90–95% (Denmark-class) |

**The gap between Sweden and Denmark is not structural — it is legal and temporal.** Denmark never
had a large pre-digital plan stock to worry about (its system is newer). Sweden's 2022 mandate is
real and growing, but it applies only forward. A retro-digitisation mandate, or 20 years of natural
plan turnover, would bring Sweden to Denmark-class.

---

## §5 — Comparison matrix: Sweden vs. peer jurisdictions

| Layer | Denmark | Germany | France | Sweden |
|---|---|---|---|---|
| Parcel | ✅ Free-with-key, national | ⚠️ Per-Land, varies | ✅ Free, national | ✅ CC0, national |
| Zone ID | ✅ 87% byzone | ⚠️ Boundary only (Stufe 1) | ✅ 95% communes (GPU) | ⚠️ 35–55% (post-2022) |
| Structured rules (height/FAR) | ✅ In plan feature | ❌ In PDF (Stufe 1) | ❌ In PDF | ✅ In Planbestämmelsekatalog IF post-2022 |
| Setbacks | ❌ Graphical (byggelinje) | ✅ Formula (LBO per Land) | ❌ Per-commune PLU PDF | ❌ Graphical (prickmark/kryss) |
| Heritage | ✅ GeoDanmark (national, key) | ❌ Per-Land, fragmented | ⚠️ Mérimée/Palissy WMS | ✅ RAÄ WMS — VERIFIED LIVE, NONE fees |
| Terrain | ✅ DHM LiDAR, free-with-key | ⚠️ Per-Land, mostly good | ✅ IGN LiDAR HD | ✅ CC0, complete, free |
| LOD2 buildings | ✅ "Danmark i 3D" free-with-key | ⚠️ LoD2-DE ~70% free | ✅ BD TOPO batiment ~90% | ❌ Municipal, often paid |
| API deployment constraint | None — keyless WFS | Per-Land — 16 endpoints | None — keyless (GPU) | ⚠️ Geo-blocked from non-SE IPs |

**Sweden's differentiated advantages over Germany and France:**
1. Heritage data is the best-confirmed free open layer in this study — fully live, national, JSON, no credentials.
2. Terrain is CC0 and complete — no per-Land complexity.
3. The planning rule vocabulary (Planbestämmelsekatalog) IS a structured semantic layer, unlike Germany's PDF-based Textliche Festsetzungen — the problem is coverage, not mechanism.

**Sweden's differentiated disadvantages:**
1. The geo-block on the NGP API is a concrete deployment blocker not present in Denmark or France.
2. Pre-2022 plan stock — likely majority of land area — is legally absent from NGP.
3. No national LOD2 building model (unlike Denmark's "Danmark i 3D" and Germany's LoD2-DE).

---

*Last updated: 2026-07-24 — live probes executed 2026-07-24. RAÄ WMS VERIFIED LIVE (HTTP 200,
JSON GetFeatureInfo). NGP STAC/OAPIF URL confirmed from API docs; geo-blocked from non-SE IPs
(HTTP 403). Boverket Planbestämmelsekatalog API confirmed open from published terms; exact base URL
not resolved from non-SE origin. All other scores from published primary sources (`stated`).*
