# LANE ME — MIDDLE EAST SWEEP (SA · AE-Dubai · AE-AbuDhabi · QA · KW · BH · OM · IL · JO · TR · EG)

> Lane: geo-expansion/middle-east · Probed 2026-09-02 · Method per the Europe sweep
> (`audit/europe-site-intel/2026-08-31/lanes/rest-of-europe-sweep.md` +
> `impl/e5-asis-national-sweep.md`), binding: every channel claim below is **PROBE-VERIFIED
> LIVE this session** (HTTP status + a real payload field, quoted verbatim) or marked
> **UNKNOWN** with the probe that would measure it. GetCapabilities is not an inventory;
> a bulk refusal is not a query refusal; SURVEYED ≠ NORMATIVE height; licence only from the
> actual licence page. UNKNOWN stays distinct from zero.
>
> ⚠ **VANTAGE.** All probes ran from a French consumer IP (Orange). Several findings below are
> *vantage findings* (TCP connect timeouts, WAF rejections). Where the block could be either a
> geo-fence or an outage, that ambiguity is stated and the disambiguation probe named
> (re-probe from an in-region vantage). This is exactly the L-606 lesson: measure the fence's
> SHAPE, never infer from one status.
>
> Verdict vocabulary (Europe sweep): **NATIONAL-NOW / NATIONAL-DERIVED / SUBNATIONAL(list) /
> GATED(gate named) / BLOCKED(reason)**.
>
> ⛔ Honesty rules applied: **MS GlobalML buildings stay EXCLUDED** (unlicensed for us until the
> founder clears it) — noted per country where it *would* help, relied on nowhere. EUBUCCO-class
> ML datasets never authoritative. **Mapterhorn terrain is planet-wide and ADOPTED — terrain is
> NOT a blocker in any row below**; only the per-country datum-lift constant is open (per-country
> note in §12). A gated source is reported with its exact gate, never as absent.

## §0 · Existing PRYZM state reused (read before this sweep; deltas only are reported)

- `packages/site-parcel-data/src/parcelProviders/registry.ts` — **SA row EXISTS**:
  `regionCode:'SA'`, `providerId:'footprint'`, `kind:'footprint-fallback'`, note: *"Balady /
  U-Maps cadastre is IP geo-fenced (WAF-blocks non-SA IPs, L-606). Not reachable from our
  environment → footprint fallback; a real SA parcel needs an in-SA proxy or a MOMRAH
  agreement."* → **the note's fence CLASS is now stale — see §1 delta.**
- `tools/context-bake/terrain.mjs` rows 922–923: `riyadh` / `jeddah` `blocked: 'SA — no open
  national DTM (GEOSA). Founder-gated.'` (unchanged by this sweep; Mapterhorn supersedes the
  need for a per-country DTM as the render terrain — the GEOSA row remains the *legal/normative*
  gap only).
- `docs/04-reference/jurisdictions/sa/findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md` (2026-07-24):
  the national MOMRAH residential decision (1/4500943139, 1446H) gives a **closed-form national
  footprint rule** (setbacks + coverage from street width + plot class) and national vertical
  ceilings (villa ≤14 m / apartment ≤23 m) — **rules for SA are NATIONAL and already extracted;
  nothing in this sweep changes that.** Also `SAUDI-UMAPS-API-ENUMERATION.md` (the old backend,
  enumerated) and `sa/sa-01/ruh-riyadh/findings/L-606-RIYADH-DEMO-PACK-AND-PROBES.md`.
- `tools/context-bake/bake.mjs` §BAKE-EUROPE-NATIONAL — the region-row shape any new ME country
  row lands into (whole-country pbf + bbox + optional heightJoin); no row is added by this
  read-only lane.

---

## §1 · SA — SAUDI ARABIA (delta-only; inherited state above)

**DELTA 1 — the U-Maps geo-fence CHANGED CLASS: IP-fence → token/SSO gate.**
The old hosts moved and the new host answers foreign IPs at transport level:

```
$ curl https://umaps.balady.gov.sa/            → HTTP/1.1 301 Moved Permanently
                                                 Location: https://umaps.momah.gov.sa   → 200 OK
$ curl https://umapsudp.momrah.gov.sa/server/rest/services?f=json
                                               → RC=6 (DNS: host no longer resolves)   ← old backend DEAD
$ curl https://umaps.momah.gov.sa/server/rest/services?f=json
  {"currentVersion":11.5,"folders":["Hosted","umaps","Utilities"],"services":[]}  HTTP=200
$ curl https://umaps.momah.gov.sa/server/rest/services/umaps?f=json
  {"error":{"code":499,"message":"Token Required","details":[]}}                  HTTP=200
$ curl https://umaps.momah.gov.sa/portal/sharing/rest?f=json
  {"currentVersion":"2025.1","enterpriseVersion":"11.5.0","enterpriseBuild":"56755"}  HTTP=200
```

The ArcGIS Enterprise 11.5 root and portal REST **answer a French IP** (they did not in the
L-606 era — the WAF killed the TCP/HTTP layer). But every data folder (`umaps`, `Hosted`)
returns **ArcGIS 499 "Token Required"**, and the viewer bundle (`main-N33JZO63.js`, fetched,
87,514 B) authenticates against **`https://ssoapp.balady.gov.sa`** (Balady SSO — Saudi national
identity class credential) with APIs at `umaps.momah.gov.sa/api/{App,App2,Config,Identity}.Api/`
(all 404 unauthenticated). Portal public item search (`search?q=parcel…` → `total: 5`) returns
only stock Esri Instant-App entries — **nothing shared publicly**.

- **Consequence for the registry row note:** *"IP geo-fenced… needs an in-SA proxy"* is no
  longer the accurate gate. The accurate gate is **credential-class: Balady SSO account
  (Saudi identity / Nafath) or a MOMRAH data agreement**; an in-SA proxy alone would no longer
  be sufficient. Registry row edit is owed (this lane is read-only — flagged here).
- `od.data.gov.sa` (open-data portal): TCP connect **timeout** (RC=28, t=21.6s) — still fenced
  or down from this vantage; unchanged from prior findings.
- **Verdict: GATED(Balady SSO / MOMRAH agreement — parcels+zoning; rules NATIONAL-NOW from the
  2024 decision, already banked).** Buildings: OSM via gcc-states extract (§11); GlobalML would
  help most here (desert-city OSM thinness, already on record) but stays excluded. Terrain:
  Mapterhorn ADOPTED; GEOSA remains the normative-DTM gap (terrain.mjs rows unchanged).

## §2 · AE — DUBAI (emirate competency)

**Parcels (Dubai Pulse / DM GIS): BLOCKED(vantage — TCP connect timeout on every data host).**

```
$ curl -v https://www.dubaipulse.gov.ae/        → connect to 91.73.143.12 port 443 … Timed out (RC=28, t=21.3s)
$ curl http://www.dubaipulse.gov.ae/  (port 80) → HTTP=000 t=21.3s RC=28
$ curl https://dubaipulse.gov.ae/               → HTTP=000 t=21.1s RC=28
$ curl -v https://geodubai.dm.gov.ae/arcgis/rest/services?f=json
                                                → connect to 213.42.55.155 port 443 … Timed out
$ curl https://gis.dm.gov.ae/                   → HTTP=000 t=25.0s RC=28  (DNS: gis.szwip.dm.gov.ae / 213.42.54.19)
$ curl https://www.dm.gov.ae/                   → HTTP=200 t=0.8s   (Azure Front Door CDN — corporate site only)
```

DNS resolves (dubaipulse via GSLB, geodubai/gis.dm on Etisalat 213.42.x), TCP never completes —
the data hosts drop foreign SYNs while the CDN-fronted corporate site serves fine. Same fence
shape as L-606-era Balady. **Cannot distinguish geo-fence from outage from one vantage** —
disambiguation probe: same four URLs from an in-UAE/GCC vantage. Dubai Pulse's own catalogue
gate (account login classes for `dm-gis` parcel datasets) is **UNKNOWN — unreachable, not
absent**. AGOL public search (`arcgis.com/sharing/rest/search`, HTTP 200, total: 2) finds only
third-party demo items ("Dubai Parcel Example", owner `Urban_Sydney`) — no official DM org
content public. `dubailand.gov.ae` answers 404 on root (server up, nothing public at /).
`gisservices.dm.gov.ae` is NXDOMAIN.

- **Envelope rules:** Dubai 2040 / DM zoning regulations are documents; the zoning GIS sits
  behind the same unreachable hosts. **UNKNOWN(vantage)** — probe from in-region.
- **Buildings:** OSM (§11). GlobalML would help (tower forest, OSM thin in suburbs) — excluded.
- **Verdict: BLOCKED(network-level vantage block on all data hosts; gates unmeasurable from here).**

## §3 · AE — ABU DHABI (emirate competency)

**Parcels/portal: GATED(WAF) at the data layer; SDI hosts dead.**

```
$ curl https://data.abudhabi/opendata           → 301 → 200 OK (Drupal/DKAN UI loads)
$ curl https://data.abudhabi/opendata/data.json → HTTP=200 but body =
  "<html><head><title>Request Rejected</title></head><body>The requested URL was rejected.
   Please consult with your administrator.<br><br>Your support ID is: 11709459135059724451…"
$ …/opendata/search/type/dataset?query=parcel   → same "Request Rejected" (support ID 11709459134987005422)
$ …/opendata/api/1/metastore/…                  → HTTP=000 RC=28 (timeout)
$ geoportal.dmt.gov.ae / sdi.gsec.abudhabi / geoportal.abudhabi.ae / www.abudhabimaps.ae /
  adgeospatial.gov.ae                           → RC=6 / DoH NXDOMAIN (all five)
```

The F5 BIG-IP WAF serves the human UI but rejects every machine path (data.json, search, DKAN
API) from this vantage — **the catalogue exists; its API layer is WAF-fenced**. The legacy
AD-SDI hostnames no longer resolve at all. Abu Dhabi services generally sit behind **UAE PASS**
(Emirates-ID-bound national identity) — that credential class is the expected gate but was
**not measured this session** (nothing reachable enough to present a login).
**Verdict: GATED(WAF on the open-data API; portal hosts NXDOMAIN; credential class unmeasured).**
Disambiguation probe: `data.json` + DKAN API from an in-UAE vantage; then read dataset licences.

## §4 · QA — QATAR ⭐ the GCC exception: live keyless cadastre + zoning

**Parcels: NATIONAL-NOW (keyless ArcGIS query, real parcel returned).**
Discovery chain (recorded because the folder listing HIDES the data): `geoportal.gisqatar.org.qa`
→ meta-refresh to `/qmap/index.html` (WAB app) → `env.js` names the portal
`https://aldeera.gisqatar.org.qa/portal/jsapi/jsapi` (Enterprise **11.3** / `{"currentVersion":
"2024.1","enterpriseVersion":"11.3.0","enterpriseBuild":"51575"}`, sharing REST HTTP 200) →
WAB `config.json` names webmap `itemId d0c262cbda444afe897f45f117504a59` → its `data?f=json`
(55,557 B) lists the operational layers on **`services.gisqatar.org.qa`**. The
`/server/rest/services` root shows folders `[Collector, Imagery, MobileMapping, Routing,
Tafteesh, Utilities, Vector, Vectors]` and the `Vector` folder publicly lists only **6 services
— none of them the cadastre** — yet the cadastre layers answer when addressed directly.
**GetCapabilities-is-not-an-inventory, ArcGIS edition: enumerate the WEBMAP, not the folder.**

```
$ …/Vector/CadastrePlots/MapServer?f=json  → layer 0 "حدود الأراضي المساحية المعتمدة", wkid 2932  HTTP=200
$ …/Vector/CadastrePlots/MapServer/0/query?geometry=51.531,25.286&inSR=4326&…&f=json
  features: 1 → PIN = 1010028 · CDST_KEY = 1010028 · PD_NO = "PD/4693/2019" · PDAREA = 183494
                · GFCODE = PDGVCDST · GLOBALID {37D80A50-6D7F-45C9-AA67-44430CB5A67B}          HTTP=200
```

**Envelope rules: zoning geometry NATIONAL-NOW; numeric rules document-only.**

```
$ …/Vector/Zoning/MapServer/0/query?geometry=51.531,25.286&…  → features: 1
  ZONING = "MUC" · CODE = 59 · RULEID = 28 · STARTDATE = 1716681600000                        HTTP=200
  (service layers: 0 Zoning · 1 Khor_Wakra_Zoning)
```

Zone code + rule id are served; the numeric content behind `RULEID` (FAR/height/setback tables
in the MME zoning regulations) is **PDF/LEGAL-TEXT** — extraction work (Europe class **F**), same
shape as Vienna. **Licence: UNKNOWN** — no licence statement found on the REST endpoints; probe:
read gisqatar.org.qa terms + MME open-data policy pages before any production use (keyless ≠
licensed). Open-data portal `www.data.gov.qa` (ODS, `total_count: 1723` datasets, HTTP 200;
legacy search API live: `nhits: 0` for "parcel") carries **no cadastre geometry** — the GIS
centre is the channel. Also present in the webmap: `QP_Cadastral`, `ZonesA`, `MunicipalityA`,
`QARS` (addresses), `ROADFlowlnA` (roads — street-width construction input).
**Buildings:** no open footprint/height programme found this pass (`Vector` folder greps for
build/3d/height → 0 among listed; hidden building layers possible — probe: enumerate more
webmaps). OSM via gcc-states (§11); GlobalML would help; excluded.
**Verdict: parcels NATIONAL-NOW (licence UNKNOWN) · zoning-geometry NATIONAL-NOW · rules
document-only (F-work) · buildings OSM.**

## §5 · KW — KUWAIT

**BLOCKED(vantage + no open channel proven).**

```
$ https://kuwaitportal.paci.gov.kw/arcgisportal/sharing/rest?f=json → HTTP=000 t=21.2s (TCP timeout, IP 91.102.145.80)
$ https://www.paci.gov.kw/                                          → HTTP=000 t=21.3s RC=28
$ https://kuwaitfinder.paci.gov.kw/            → HTTP=502 Bad Gateway (Microsoft-Azure-Application-Gateway/v2,
                                                 IP 52.157.218.202 — edge answers, backend refuses)
$ https://services.paci.gov.kw/                → HTTP=200 (portal shell)
$ https://services.paci.gov.kw/arcgis/rest/services?f=json → 302 → /error/404  (same for
  /KFRestAPI, /KFAPI, /arcgisportal/sharing/rest, /server/rest/services — all 302→404)
$ DoH: mapapi/restpublic/geoportal/arcgis/data .paci.gov.kw → NXDOMAIN (all)
```

PACI (the civil-information authority that owns Kuwait's parcel/address layer) is
TCP-unreachable at its portal hosts, its KuwaitFinder Azure edge answers 502, and the one
responsive host exposes no REST surface at guessable paths. **No parcel, zoning, or building
channel proven; gate class unmeasurable from this vantage.** Disambiguation probe: PACI hosts
from an in-GCC vantage; then KuwaitFinder API terms (its public mobile app implies a queryable
backend exists). **Verdict: BLOCKED(vantage; nothing proven either way).**

## §6 · BH — BAHRAIN

**Parcels: GATED(SLRB services behind bahrain.bh eKey identity); no public GIS endpoint found.**

```
$ bahrainmaps.bh / www.bahrainmaps.bh    → DoH Status 3 (NXDOMAIN — domain does not exist globally;
                                           local-resolver "hits" earlier were router NXDOMAIN-hijack)
$ gisbahrain.bh · arcgis/maps/gis.slrb.gov.bh · bsdi.bh · locator/maps/gis/geoportal.bahrain.bh
                                         → DoH Status 3 (all NXDOMAIN)
$ https://www.slrb.gov.bh/               → HTTP=200 (192,496 B; page text contains "cadastral" ×10,
                                           "cadastralsurveys" ×3, "eKey" ×2 — services route through eKey login)
$ https://www.benayat.bh/                → HTTP=200 (SPA shell "Home || Benayat.bh", building-permit
                                           platform, AWS eu-west-1 ELB)
$ https://www.data.gov.bh/api/datasets/1.0/search/?q=parcel → HTTP=200 nhits:4 — best hit
  "02-parcels-subdivision-regulations" (Parcels Subdivision Regulations — a STATISTICS table,
  not geometry); q=cadastral → nhits:0; q=building → census tables only (ODS portal, 514 datasets)
```

The SLRB (Survey & Land Registration Bureau) exists and names cadastral services, but every
guessable GIS hostname is NXDOMAIN and the open-data portal holds statistics only. **Gate: SLRB
e-services via the national eKey identity (fee schedule unread — probe: SLRB services catalogue
while authenticated, or their fees PDF).** Zoning: no served-as-data channel found this pass.
Buildings: census counts only → OSM (§11). **Verdict: GATED(eKey/SLRB) for parcels · UNKNOWN for
zoning (no channel found — probe benayat's authenticated APIs) · buildings OSM.**

## §7 · OM — OMAN

**BLOCKED(vantage) at the NSDI; open-data portal is statistics-only.**

```
$ nsdi.gov.om / geoportal.gov.om / maps.gov.om → DoH NXDOMAIN
$ onsdi.ncsi.gov.om  → DoH resolves (185.64.24.173) but ALL paths TCP-timeout:
  "/", /arcgis/rest/…, /server/rest/…, /portal/sharing/… → HTTP=000 t≈21s each
$ https://ncsi.gov.om/          → HTTP=200 (statistics centre site)
$ https://data.gov.om/          → HTTP=200 (statistics portal — no GIS)
$ https://www.housing.gov.om/   → HTTP=403 (WAF refusal — Ministry of Housing & Urban Planning,
                                   the krooki/parcel authority)
```

The Oman NSDI host exists and drops foreign traffic; the ministry that issues krookis (plot
certificates) WAF-403s. **No parcel/zoning/building channel measurable from this vantage; gate
class (registration vs geo-fence) UNKNOWN** — NSDI access is agency/registration-based per its
public materials, but that was NOT verified this session. Disambiguation probe: onsdi +
housing.gov.om from an in-region vantage. **Verdict: BLOCKED(vantage; NSDI drops foreign TCP,
ministry WAF-403s) — re-probe before classifying the gate.**

## §8 · IL — ISRAEL ⭐ the most open ME stack, with one vantage surprise

**Parcels: NATIONAL-NOW live query · bulk GATED(403 from foreign IP).**

Live point→parcel, keyless (govmap identify API, POST JSON):

```
$ POST https://ags.govmap.gov.il/Identify/IdentifyByXY
  {"x":179254,"y":665111,"mapTolerance":10,"layers":[{"LayerType":0,"LayerName":"PARCEL_ALL","LayerFilter":""}]}
  → HTTP=200: LayerCaption "חלקות" → מספר גוש = 6952 · חלקה = 139 · שטח רשום = 7404 מ"ר ·
    סטטוס = "מוסדר" · centroid 179256.4,665120.6 (ITM/EPSG:2039) · plus the registrar disclaimer
    ("…לאסמכתה חוקית… יש לפנות ללשכות המרשם במשרד המשפטים")
```

National bulk (Survey of Israel via data.gov.il CKAN — API reachable, payload fenced):

```
$ package_search?q=חלקות → count:3 · "חלקות shape", org "המרכז למיפוי ישראל", license "Other (Open)"
$ package_show → resource "parcel_all.zip" @ aws-e.data.gov.il/…/download/parcel_all.zip
  (siblings: cancel_parcel.dbf.zip · last_parcel.zip · מבנה החלקות)
$ GET that ZIP (range 0-15, and full GET w/ browser UA) → HTTP/1.1 403 Forbidden (both attempts)
```

The CKAN **metadata** API answers foreign IPs; the **S3 payload host refuses them** (403 with no
challenge — data.gov.il's geo-restriction shape). Gate: **IL-IP (or authenticated) download;
the licence field itself reads "Other (Open)" — the licence is open, the pipe is fenced.**
Probe: fetch via an IL vantage; the file is a full national `parcel_all` shapefile.

**Envelope rules: plan GEOMETRY NATIONAL-NOW; numeric rights document-only (mavat).**

```
$ https://ags.iplan.gov.il/arcgisiplan/rest/services?f=json → HTTP=200, folder PlanningPublic
  (47 MapServers: Xplan, Xplan_6991, Xplan_77_78, XplanNoKanam, xplan_background, entities,
   plan_index, tama/tmm series, vatmal_mitchamim_muchrazim…)
$ …/PlanningPublic/Xplan/MapServer?f=json → layers: 0 ישויות נקודתיות · 1 קוים כחולים-תכניות
  מקוונות · 2 ישויות קוויות · 3 ישויות פוליגונליות · 4 יעודי קרקע
$ …/Xplan/MapServer/4/query?geometry=34.7818,32.0853&inSR=4326&…&returnGeometry=false
  → features: 13; e.g. pl_number = "507-0643890" · pl_name = "תא/4562 התחדשות רחוב אבן גבירול" ·
    mavat_name = "תחנת תחבורה ציבורית" · mavat_code = 902 · station_desc = "אישור" · legal_area = 7.4434
```

Every approved plan's land-use polygons, plan ids and approval state are served keylessly.
The NUMERIC rights (FAR, heights, units — the takanon) live in mavat plan documents
(PDF/LEGAL-TEXT) linked by `pl_number` — Europe-class **F** extraction with a perfect join key.
**Buildings:** no national open footprint bulk found via CKAN this pass (`מבנים` → municipal
GeoJSONs, e.g. עיריית באר שבע; govmap has a buildings display layer — bulk channel **UNKNOWN**,
probe: govmap layer export terms / MAPI BNTL licence). OSM: israel-and-palestine 119 MB (§11).
**Terrain:** Mapterhorn; MAPI DTM exists but NOT probed (not needed for render).
**Verdict: parcels NATIONAL-NOW (query) + GATED(IL-IP) (bulk) · plan-geometry NATIONAL-NOW ·
numeric rules document-only(F) · buildings SUBNATIONAL(municipal GeoJSONs)+OSM.**

## §9 · JO — JORDAN — endpoint open, attributes empty: a fill finding

**Parcels: the DLS ArcGIS answers keylessly, but parcel-id fill was EMPTY at both probed points.**

```
$ https://www.dls.gov.jo/ → 302 /Default/Ar → links to https://maps.dls.gov.jo/dlsweb/
$ dlsweb viewer → HTTP=200; loads a CAPTCHA check iframe (maps.dls.gov.jo/CaptchaCheckTest/)
$ https://maps.dls.gov.jo/arcgis/rest/services?f=json
  → {"folders":["Utilities"],"services":[{"name":"DLS_Layers_Service","type":"MapServer"}],"currentVersion":12}
$ DLS_Layers_Service/MapServer?f=json → 15 layers incl. 3 "قطع الاراضي" (parcels), 21 "قطع
  الاراضي1", 2 "اضلاع الاراضي", 0 "زوايا قطعة الارض", sr wkid 102100
$ layer 3 point-query (Amman 35.9106,31.9539) → features:1 BUT PARCEL_ID='' · VILL_CODE=' ' ·
  DLS_KEY='' · ORGANIZATION="بلدية الشوبك" (a Shobak-municipality edit artefact under downtown Amman)
$ layer 3 point-query (Irbid 35.85,32.5556)   → PARCEL_ID=None · all codes blank
$ layer 21 point/envelope queries (Amman)     → features: 0 (and "Pagination is not supported"
  on resultRecordCount — capability-limited server)
```

Mechanically open, semantically not: the keyless endpoint serves geometry whose identifying
attributes were **blank at 2/2 probed points** — the id-bearing flow runs through the
captcha-gated viewer (and the paid DLS land-info services). **Context-data-honesty: fill is the
finding — measure fill more widely before wiring anything** (probe: envelope queries across 5+
governorates counting non-null PARCEL_ID). Zoning: Amman GM host NXDOMAIN (`gis.amman.jo` RC=6);
no plan-geometry channel found. **Verdict: GATED(captcha viewer; open endpoint has empty-id
geometry — fill probe owed) · zoning UNKNOWN · buildings OSM (jordan extract is tiny: 30 MB, §11
— GlobalML would help most in JO/EG of the non-GCC set; excluded).**

## §10 · TR — TURKEY ⭐ the best parcel API in the lane

**Parcels: NATIONAL-NOW — TKGM's keyless point→parcel GeoJSON, national, instant.**

```
$ https://cbsapi.tkgm.gov.tr/megsiswebapi.v3/api/parsel/40.9819/29.0576
  → HTTP=200 GeoJSON Feature: Polygon + properties:
    ilAd="Istanbul" · ilceAd="Kadiköy" · mahalleAd="Tuğlaci Başi" · adaNo="3106" · parselNo="258" ·
    alan="816.27" · pafta="151" · zeminKmdurum="Kat Mülkiyet" ·
    nitelik="11 Katli Betonarme Mesken,Ofis,Işyeri Ve Arsasi"
$ …/parsel/39.9042/32.8560 → HTTP=200: Ankara/Çankaya ada 4454 parsel 6, alan "57,509.00",
    nitelik "Ma Müştemilat Sefarethane"
$ …/parsel/41.0369/28.9855 → HTTP=404 {"Message":"Parsel Bulunamadı: Enlem = 41,0369 - Boylam=28,9855"}
    (a real miss answer — the 404 is semantic, not a fence)
```

Ada/parsel id, area, quarter, sheet and the `nitelik` character string — which for condominium
parcels **carries the storey count in text ("11 Katli" = 11-storey)**: a probe-verified,
extractable floor signal riding the parcel channel. **Licence: UNKNOWN** — `parselsorgu.tkgm.gov.tr`
is an SPA shell (1,787 B, no terms text served statically); probe: read the app's usage-terms
modal / TKGM's protocol terms before production use (TKGM's bulk/WMS products are normally
priced+protocol-gated; the *query* endpoint being keyless is exactly the
bulk-vs-query-endpoint lesson — do not conflate the two in either direction).

**Envelope rules: document-only + municipal gates; no national served-as-data channel found.**
`mpvs.csb.gov.tr` RC=6 NXDOMAIN · `tucbs.csb.gov.tr` RC=6 · `atlas.harita.gov.tr` HTTP=200 (base
maps, not plans) · Istanbul IBB CKAN live (`data.ibb.gov.tr`, HTTP 200): q=imar → count:1
irrelevant hit (population projection); q=plan → transport plans; q=bina → counts, not geometry.
İmar durumu (parcel zoning status) is served per-municipality behind e-Devlet logins
(document/viewer class — not probed individually this pass). **Rules verdict: document-only(F)
with municipal e-imar GATED(e-Devlet) — same structural shape as Austria's Bebauungsplan PDFs.**
**Buildings:** no open national footprint/height product found this pass (TKGM 3D Kadastro is a
programme, not an open product — UNKNOWN, probe when scoping TR context). OSM turkey extract
614 MB — the densest in this lane (§11). **Verdict: parcels NATIONAL-NOW(licence UNKNOWN) ·
rules document-only + GATED(e-Devlet) · buildings OSM.**

## §11 · EG — EGYPT

```
$ https://data.gov.eg/  → RC=6 (NXDOMAIN — no national open-data portal at the obvious domain)
$ https://www.esa.gov.eg/ → HTTP=200 (Egyptian Survey Authority corporate site; no data services found)
$ https://msa.gov.eg/   → RC=6
```

No machine-readable cadastre, zoning, or building channel found; the ESA sells maps over the
counter. **Verdict: BLOCKED(no open channel found; probes above).** Buildings: OSM egypt extract
170 MB (Nile-valley density is decent in Cairo/Alexandria); GlobalML would help; excluded.

## §12 · BUILDINGS / OSM DENSITY — Geofabrik range-GETs (all PROBED 2026-09-02)

```
$ curl -sL -r 0-15 -D - <url> | grep -i "content-range|last-modified"   (HTTP/1.1 206 each)
asia/gcc-states-latest.osm.pbf              253,643,828 B  (241 MB)  Last-Modified 2026-09-02 05:12
   — ONE extract for the whole peninsula: Geofabrik serves NO per-country BH/KW/OM/QA/SA/AE
     extracts; the gcc-states.poly bbox measures lon 34.43..60.95, lat 15.25..32.20 (52 verts,
     fetched). A per-country ME bake row therefore clips gcc-states by country bbox — the
     bake.mjs `clipped:` mechanism already does exactly this per row.
asia/israel-and-palestine-latest.osm.pbf    119,187,439 B  (114 MB)  2026-09-02 05:26
asia/jordan-latest.osm.pbf                   31,017,135 B  ( 30 MB)  2026-09-02 05:12
europe/turkey-latest.osm.pbf                643,938,756 B  (614 MB)  2026-09-01 03:11
africa/egypt-latest.osm.pbf                 178,080,476 B  (170 MB)  2026-09-02 05:00
australia-oceania/australia-latest.osm.pbf  960,789,435 B  (916 MB)  2026-09-02 05:09  (the AU
   lane's number, measured here because the founder's directive names both regions — courtesy row)
```

Density signal (size as proxy, qualitative): TR dense · IL dense · EG moderate (Nile valley) ·
gcc-states thin for six countries (desert dominance — matches the repo's "Saudi OSM
building-desert finding") · JO thin. **Where MS GlobalML WOULD help (stays EXCLUDED, unlicensed
for us):** SA, AE, QA, KW, BH, OM suburbs + JO + EG — everywhere south of TR/IL. No open
NATIONAL footprint programme was found in ANY of the ten countries this pass (IL municipal
GeoJSONs are subnational; QA/KW/BH/OM/AE nothing public; EG nothing). LoD200 context in the ME
therefore ships as OSM-footprint + honest assumed heights everywhere until a gated source is
unlocked — the `netherlands`-precedent row shape (no heightJoin declared, no fake join).

## §13 · TERRAIN — datum note (Mapterhorn ADOPTED, not a blocker)

Mapterhorn is planet-wide; none of the ten countries is terrain-blocked for rendering. The open
per-country item is the **datum-lift constant** (local vertical datum vs the tileset's
ellipsoid/EGM basis) — all **UNVERIFIED-DOC this session** (no live probe measures a datum):
SA (Jeddah 1969) · AE (Dubai Municipality datum; AD separate) · QA (QND95-associated MSL) ·
KW (Kuwait MSL) · BH (BMSL) · OM (MSL Muscat/PDO) · IL (Israel Vertical Datum, Yafo MSL) ·
JO (MSL, Aqaba-referenced) · TR (TUDKA — Antalya tide gauge) · EG (Alexandria 1906 MSL).
Treat every name above as a lead, not a fact: verify per country when a site first loads there
(fetch one national geodesy/benchmark note, set the constant), exactly as the Europe rows did.
GEOSA (SA) remains the only *founder-gated* national DTM row (terrain.mjs, unchanged).

## §14 · VERDICT TABLE (Europe vocabulary) + where rows would land

| Country | Parcels | Envelope rules | Buildings | One-line gate |
|---|---|---|---|---|
| SA | GATED(Balady SSO/MOMRAH — **delta: was IP-fence, now token gate**) | NATIONAL-NOW (2024 decision, banked) | OSM (thin) | registry note stale → update owed |
| AE-Dubai | BLOCKED(vantage TCP-timeout, all data hosts) | UNKNOWN(vantage) | OSM | re-probe in-region |
| AE-AbuDhabi | GATED(WAF "Request Rejected" on data API) | UNKNOWN | OSM | UAE PASS expected, unmeasured |
| QA | **NATIONAL-NOW** (keyless query; licence UNKNOWN) | zone-geometry NATIONAL-NOW; numbers doc-only(F) | OSM | read licence before wiring |
| KW | BLOCKED(vantage + 502; nothing proven) | UNKNOWN | OSM | re-probe in-region |
| BH | GATED(SLRB eKey) | UNKNOWN (no channel found) | OSM | fee schedule unread |
| OM | BLOCKED(vantage; NSDI drops TCP, ministry 403) | UNKNOWN | OSM | re-probe in-region |
| IL | **NATIONAL-NOW**(query) + GATED(IL-IP bulk 403) | geometry NATIONAL-NOW; numbers doc-only(F, mavat join key) | SUBNATIONAL(municipal)+OSM | bulk needs IL vantage |
| JO | GATED(captcha; open endpoint id-fill EMPTY 2/2) | UNKNOWN | OSM (30 MB) | fill probe owed |
| TR | **NATIONAL-NOW** (TKGM GeoJSON; licence UNKNOWN) | doc-only(F) + GATED(e-Devlet municipal) | OSM (614 MB) | read TKGM terms |
| EG | BLOCKED(data.gov.eg NXDOMAIN; ESA site 200, no channel) | UNKNOWN | OSM | no machine channel found |

**Where new rows land (no edits made — read-only lane):** parcel providers →
`packages/site-parcel-data/src/parcelProviders/registry.ts` (TR/IL/QA each qualify for a
`kind:'cadastral'` row with a proxy, on the SA/DK row shape; SA's row note needs the §1 delta);
context bake → `tools/context-bake/bake.mjs` §BAKE-EUROPE-NATIONAL row shape (ME rows clip
`gcc-states`/per-country pbfs; **no heightJoin anywhere** — no measured-height source exists
yet); jurisdiction docs → `docs/04-reference/jurisdictions/<cc>/` (only `sa/` exists today).

**Priority read of this lane:** TR + IL + QA are wireable *now* at the parcel axis (pending two
licence reads and the IL-bulk vantage fetch); the envelope-rules axis is document-extraction (F)
everywhere except SA (banked national closed-form); the GCC ex-QA is a vantage/identity problem,
not a data-absence problem — book one in-region probe session before concluding anything further.
