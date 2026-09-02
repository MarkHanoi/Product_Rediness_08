# ENVELOPE GEOMETRY CENSUS — LANE SOUTH-EAST (IT · MT · GR · CY · HR · BA · RS · ME · MK · AL · RO · BG · TR · MD · UA · SM)

> Census per `docs/01-strategy/STR-EUROPEAN-ENVELOPE-SOURCES.md` §10 — "where does an authoritative
> source already publish the GEOMETRIC CONSEQUENCE of planning rules?" · Probed **2026-09-02**,
> UA `PRYZM-Research/1.0 (+https://pryzm.app; contact pryzmhello@gmail.com)` · Transcripts in
> `transcripts-south-east/` beside this file (per-country `*-probes.txt` + kept payloads).
> **PROBED** = live HTTP this session with status + payload field quoted. **REUSED** = a
> probe-verified row from `audit/europe-site-intel/2026-08-31/lanes/rest-of-europe-sweep.md` (L5),
> `impl/e5-asis-national-sweep.md` (E5) or `audit/geo-expansion/2026-09-02/me-sweep.md` (ME-lane,
> same-day), cited, not re-derived. UNKNOWN ≠ absent ≠ zero; a bulk gate is not a query gate.
>
> ⚠ **VANTAGE.** Probes ran from this workstation's consumer IP (non-EU). Several Balkan registries
> connect-timeout or textually geo-fence while sibling sites on the same national infra answer —
> those are marked **vantage findings** with the disambiguation probe named (re-probe from an EU/
> in-region vantage). L-606 lesson applied: the fence's SHAPE is measured, never inferred from one status.
>
> Type letters (strategy §8): **A** explicit envelope/field/line GEOMETRY · **B** explicit
> PARAMETERS as data · **C** derive. Verdicts: CONSUME-GEOMETRY / COMPILE-PARAMETERS /
> STRUCTURED-RULES / DOCUMENTS-ONLY / OPAQUE.

---

## ⭐ TYPE-A HEADLINE — explicit envelope/field/line geometry served, with live proof

**1 · CROATIA — national buildable-area (construction-area) polygons, keyless WFS, feature-proven.**
The NSDI register (`registri.nipp.hr/api/izvori/244/`, PROBED HTTP 200) names source 0246
**"Građevinska područja"** — construction-area polygons compiled from all county + municipal spatial
plans by the county planning institutes — formats GDB/SHP, access **"Nema uvjeta za pristup i
korištenje"** (no conditions), paired WFS = source 246 at
`https://gis4.mgipu.hr/srv1/GradjPodrucje_MGIPU_Public/wfs`.
- GetCapabilities **PROBED: HTTP 200**, WFS 2.0.0, 2 feature types: `Gradj_podrucje_naselje` +
  `Gradj_podrucje_izvan_naselja`.
- GetFeature count=1 **PROBED: HTTP 200**, `numberMatched="89911"` settlement construction-area
  polygons nationally; real member quoted: `gml:id="Gradj_podrucje_naselje.765566"`,
  `jls_ime>ŽUMBERAK`, municipality codes + plan reference riding each polygon
  (`transcripts-south-east/hr-gp-feature.xml`).
- ⚠ HONEST CAVEAT from the register itself: the layer is an **interpretation** of the plans
  (vintage: plans in force **September 2020**), *"ne smiju [se] koristiti u svrhu izdavanja akata"* —
  NOT for issuing legal acts. So: **CONSUME-GEOMETRY at screening grade** — a national buildable/
  non-buildable first gate, never the legal envelope. The register row also says "zahtjev mailom"
  for the izvan-naselja set, but the endpoint answered keyless this session.

**2 · ALBANIA — the geometric parameter carrier of the lane: 91,939 structural-unit polygons with
height/FAR/coverage as FIELDS, keyless, national.** Via `planifikimi.gov.al` (PROBED 200) → AKPT
ArcGIS Online webmap (enumerated via the sharing API) → FeatureServer
`services8.arcgis.com/iSbQO7EghMNBB1Un/.../Njesite_Strukturore_Azhornim__ok_/FeatureServer/0`:
- Layer schema **PROBED: HTTP 200** — fields include `lartesia_k` (max height in STOREYS),
  `lartesia_m` (max height in METRES), `intesitet` (intensity/FAR), `ksht`/`KSHR`/`KSHP`
  (coverage + public/green coefficients), `Parcela_Minimale`, `Perdorime_Te_Lejuara/Ndaluara`
  (permitted/prohibited uses), `Rregullore` (regulation ref), `Kufizime_Ligjore`.
- Real feature **PROBED**: `{'bashkia':'Berat','njesia':'1/22','sistemi':'UB_Urban','lartesia_k':'2',
  'lartesia_m':'6','intesitet':'K1=0.5','ksht':'K1=50%','KSHR':'10.47 %','KSHP':'20 %',
  'Parcela_Minimale':'10000 m2'}` · returnCountOnly → `{"count":91939}`.
- This is Type **B riding on Type-A-shaped polygons**: the unit polygon IS the drawn scope of the
  numbers. Values are semi-structured strings (`K1=0.5`, `PA` = not applicable, prose escapes like
  *"Sipas legjislacionit…"*) — a tolerant parser + refusal path is required, not assumed clean.
- The same webmap serves drawn CONSTRAINT geometry: `Fasha Mbrojtëse e Rrugës` (road protective
  strips), railway buffers, TAP pipeline security corridor + 4 m strip, coastal 300 m belt,
  heritage/archaeology polygons — explicit restriction geometry (Type A objects for the
  restriction axis). Item access `public`, `licenseInfo` EMPTY → licence UNSTATED (probe: AKPT
  terms / direct ask before production).

**3 · BULGARIA (Sofia city island) — a drawn construction boundary line + coded zone polygons.**
`gis.sofiaplan.bg/server/rest/services` **PROBED: HTTP 200** (root 404s at `/arcgis/` — the
instance lives at `/server/`). `oup_2009/oup_2009` FeatureServer enumerates 90+ layers incl.
**layer 25 "Строителна граница на град София"** (the construction boundary of Sofia — an explicit
drawn Type-A line) and layer 2 "Урбанизирани територии" — feature **PROBED**:
`{'new_end':'Оо','type_':'зона за обществено обслужване',…}` — zone CODE on the polygon, numbers
NOT on the layer: the numeric envelope (плътност, КИНТ, кота корниз) is keyed by that code in the
**ЗУЗСО annex tables, which are LAW with fixed numeric tables** → a highly automatable
code→table join, Sofia only.

**Nowhere else in this lane does an authority serve explicit building-field/building-line/envelope
geometry as data.** DK-byggefelt-class channels: none found in 16 countries. Italian building
lines (fili edilizi/allineamenti), Greek ρυμοτομικές/οικοδομικές γραμμές and Turkish imar hattı
all EXIST as legal objects — served as PDF/scanned plan sheets only.

---

## PER-COUNTRY TABLE (founder's columns; cells compact — details + proofs in the blocks below)

Legend: PL=parcel linkage · ZG=zoning geometry · BF=building-field geom · BL=building-line geom ·
H=height · FAR · COV=coverage ratio · SB=setbacks · VAL=validity/temporal · LIC=licence ·
TC=territorial coverage · MRQ=machine-readable quality (0–5, this lane's honest estimate).

| CC | Authority | Dataset | API/download | PL | ZG | BF | BL | H | FAR | COV | SB | VAL | LIC | TC | MRQ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IT | AdE + 19 regions | INSPIRE cadastre WFS; regional PGT/PRG mosaics | WFS live (REUSED); Socrata/CKAN PROBED | cadastral key only, no plan-join std | regional mosaics (GIS-ATTR) | ✗ | ✗ (PDF tavole) | PDF NTA | PDF NTA | PDF NTA | PDF NTA | plan-register dates (Socrata PROBED) | CC BY 4.0 (cadastre); IODL regional | national parcels; mosaics north-heavy | 2 |
| MT | Planning Authority | Local Plans via PA mapserver; MSDI | **Cloudflare bot-walled** (PROBED 403 ×2 UAs) | no complete cadastre (REUSED) | viewer-only | ✗ | ✗ | storeys on policy maps (PDF) | ✗ | ✗ | PDF | UNKNOWN | UNKNOWN | national (tiny) | 0 (from this vantage) |
| GR | YPEN / Ktimatologio | FEK decrees; e-Poleodomia | gis.epoleodomia = dead stub (PROBED); geoportal.ypen unreachable | cadastre incomplete (REUSED) | ✗ national | ✗ | legal objects, SCANNED only | FEK PDF | FEK PDF | FEK PDF | FEK PDF | FEK numbers | UNKNOWN | partial | 0–1 |
| CY | DLS + DTPH | Planning zones GIS + zone tables | ArcGIS REST root PROBED 200; **DTPH folder 403** | DLS parcels (REUSED) | behind gate | ✗ | ✗ | zone-code table | zone-code table (συντελεστής) | zone-code table | PDF | UNKNOWN | UNKNOWN | national | 2 (gated) |
| HR | MPGI (ISPU) + DGU | **Građevinska područja WFS**; county plan WMS (raster) | keyless WFS PROBED, feature-proven | jls codes on polygons; DKP ATOM (REUSED) | ISPU namjena WMS | **✓ construction-area polygons (89,911+)** | ✗ | PDF odredbe | PDF | PDF | PDF | vintage 2020, plan ref on feature | "no conditions" (register) | national | 3 |
| BA | FGU / RGURS / entities | katastar.ba viewer | root PROBED 200; RS geoportal timeout (vantage) | viewer only | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | UNKNOWN | entity-split | 0 |
| RS | RGZ / MGSI | GeoSrbija; CRPD plan register | **geosrbija.rs + a3 + opendata connect-timeout; rgz.gov.rs 200** → fence-shaped | UNKNOWN-VANTAGE | UNKNOWN-VANTAGE | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | — | n/a |
| ME | Uprava za katastar; MEPPU | geoportal.co.me; PGR CG programme | viewer PROBED 200; WMS link = INTERNAL IP 10.x (leak) | viewer only | ✗ | ✗ | ✗ | PDF DUP/PUP | PDF | PDF | PDF | ✗ | UNKNOWN | national viewer | 0–1 |
| MK | AKN; e-urbanizam | e-urbanizam (national e-planning) | portal PROBED 200 = **login wall**; katastar.gov.mk timeout (vantage) | UNKNOWN | behind login | UNKNOWN (DUP gradežna linija exists in-system) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | — | n/a |
| AL | AKPT (planifikimi.gov.al) | **Njësitë Strukturore** + PPV layers + protective strips | keyless ArcGIS FS PROBED, feature-proven | bashkia+njesia ids (no parcel key) | ✓ PPV land-use FS | unit polygons (B-on-geometry) | ✗ | **✓ field (storeys+m)** | **✓ field** | **✓ field (KSHT)** | strips only | Rregullore ref field; no dates on layer | UNSTATED (public item, empty licenseInfo) | national (91,939 units) | **4** |
| RO | ANCPI; MDLPA | parcels REST (REUSED); **GIS-PUG norms v1.1/2024** | datelocale.mdlpa.ro norms page PROBED 200 | ANCPI REST GeoJSON (REUSED) | stock CAD/PDF; 2024+ standardized | ✗ | ✗ (aliniament in PUG-GIS std, future) | PDF RLU | POT/CUT in PDF RLU (std slots exist) | PDF | PDF | std has validity slots | UNKNOWN | incomplete fabric | 1→3 (standard live, stock PDF) |
| BG | AGKK; Sofiaplan | KAIS (REUSED); **Sofia OUP FeatureServer** | Sofiaplan REST PROBED, feature-proven | KAIS gated (REUSED) | ✓ Sofia zone-code polygons | ✗ | **✓ Sofia construction boundary (city)** | ЗУЗСО table via code | ЗУЗСО table (КИНТ) | ЗУЗСО table | PDF | OUP-2009 vintage | UNKNOWN | Sofia island only | 3 (Sofia) / 0 (national) |
| TR | TKGM; municipalities | parsel query API (REUSED ME-lane, same-day) | keyless GeoJSON point→parcel | ada/parsel national | ✗ served | ✗ | ✗ (imar hattı in PDF plans) | storey text in `nitelik` (as-built, not normative) | ✗ | ✗ | ✗ | ✗ | UNKNOWN (SPA shell) | national parcels | 1 (envelope axes) |
| MD | ARFC (cadastru.md) | eCadastru; geodata.gov.md shell | **explicit textual geo-fence PROBED**: "not available in Your region/country" | fenced | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | UNKNOWN | — | n/a (fenced) |
| UA | StateGeoCadastre; Minregion (EDESSB) | НГП (login), ДЗК map (timeout), **e-construction + data.gov.ua УМО registers** | data.gov.ua CKAN PROBED: **106 УМО datasets**, XLS/CSV | cadastral no. in УМО rows | wartime-closed | ✗ | ✗ | per-permit УМО rows (tabular) | per-permit | per-permit | per-permit УМО | per-permit dates | open-data (data.gov.ua) | municipal patchwork | 2 (tabular per-permit, not per-zone) |
| SM | Segreteria Territorio | PRG (new plan) | gov.sm PROBED 200; no GIS channel found | ✗ | ✗ | ✗ | ✗ | PDF | PDF | PDF | PDF | ✗ | UNKNOWN | micro-state | 0 |

---

## PER-COUNTRY DETAIL + VERDICTS

### IT — ITALY · verdict: **DOCUMENTS-ONLY for the numeric envelope; regional zone-geometry mosaics consumable; no Type A found**
- Cadastre: AdE INSPIRE WFS `CP:CadastralParcel` CC BY 4.0, national minus Trento/Bolzano —
  REUSED (L5 probe 2026-08-31); building geometry WMS-only — REUSED (E5-2 probe 2026-09-01).
- PROBED this session: `dati.lombardia.it/api/views/ijqk-ahfp.json` HTTP 200 — the "PGT" Socrata
  dataset is a **plan-DOCUMENT/procedure register** (columns quoted in `it-probes.txt`:
  `STATO_PGT, FASE_PGT, DATA_VIGORE, NUM_BURL…`), i.e. plan VALIDITY data machine-readable — not
  zone geometry. `cartografia.servizirl.it/arcgis{,2}/rest/services` HTTP 200 both — **no
  urbanistica folder public** on either instance; Lombardia's TPP/PGT mosaic ships via geoportale
  download + MISURC standard (REUSED, doc-verified L5). Emilia-Romagna: `geoags/rest/services`
  HTTP 200 (no planning folders); `dati.emilia-romagna.it` CKAN PROBED — **PUG "Scheda dei
  Vincoli" served in 13 formats (SHP/GeoJSON/PARQUET…)** but count=1: constraint schedules, not
  the zone mosaic; the `wms/mosaico_psc` guess returned 401 (exists-or-auth, undistinguished).
  Milan CKAN PROBED: NIL boundaries only, no PGT zones.
- The envelope numbers (indici, altezze, distanze — incl. building lines/fili edilizi on the
  tavole) are NTA-PDF per comune, ~9–11% structured fill nationally (REUSED internal study).
  21 regional legal mechanisms = 21 adapter behaviours (REUSED). Lombardia+Emilia first per the
  brief: Lombardia gives MISURC-standardized zone polygons + the probed validity register;
  Emilia gives standardized PUG vincoli exports — both are the right first two adapters, neither
  yields a byggefelt.

### MT — MALTA · verdict: **OPAQUE (bot-walled) — behind the wall, viewer-grade at best**
PROBED: `msdi.data.gov.mt/geoserver/ows` → **HTTP 403 Cloudflare "Just a moment"**, identical
with a browser UA (fence is JS-challenge/IP-reputation, not UA) — the `/geoserver/` path itself
is a VERIFIED-LEAD that MSDI runs GeoServer. `pamapserver.pa.org.mt/arcgis/rest/services` →
same 403 wall. No complete cadastre (REUSED honest zero). Disambiguation probe: browser session
or EU vantage, then re-run the WFS GetCapabilities.

### GR — GREECE · verdict: **DOCUMENTS-ONLY — the lane's weakest large country**
PROBED: `gis.epoleodomia.gov.gr` HTTP 200 = a **dead stub page** (4 image tags, zero links —
extraction in `gr-probes.txt`); `geoportal.ypen.gr` connect-fail; `www.epoleodomia.gov.gr`
connect-fail. Building terms (όροι δόμησης: συντελεστής δόμησης=FAR, κάλυψη=coverage, ύψος)
are FEK gazette PDFs/scans; the ρυμοτομικές + οικοδομικές γραμμές — street-alignment and
BUILDING LINES, exactly the founder's Type-A objects — exist in every approved street plan as
scanned diagrams only. Cadastre open but incomplete (REUSED). Big future AI-extraction market;
nothing to consume today.

### CY — CYPRUS · verdict: **COMPILE-PARAMETERS (lead) — gate confirmed, not absence**
PROBED: `eservices.dls.moi.gov.cy/arcgis/rest/services` HTTP 200 root with folders
`["BASEMAPS","DTPH","GP","National",…]` — **DTPH (Town Planning & Housing) exists** — but
`DTPH?f=json` and layer guesses → **IIS 403** (anonymous blocked at folder level; root
enumerable = a permissions gate, not an empty server). data.gov.cy: both CKAN and uData API
shapes 404 (platform is Drupal-family; catalog API not found this pass). The zone-polygon +
zone-code → coefficient-table join (REUSED L5) remains the automatable path; whether
coefficients ride ON the layer is still UNVERIFIED — probe named: trace the DLS portal viewer's
network calls in a browser session, or request DTPH open-data access.

### HR — CROATIA · verdict: **CONSUME-GEOMETRY (screening-grade) + DOCUMENTS-ONLY (provisions)** ⭐
See TYPE-A HEADLINE #1 (live WFS + feature proof). Additional PROBED findings: the NIPP registry
API itself (`registri.nipp.hr/api/izvori/`, 1,686 sources, DRF JSON) is the enumeration tool —
`?search=prostorni plan` → 341 hits: per-county "WMS - prostorni planovi" services
(e.g. Zagreb rec 183 → `gis1..4.mgipu.hr/srv1/PPRasterZ21_Public/wms`, "no conditions") are
**PPRaster\* = scanned plan sheets** — visual only. ISPU root PROBED 200 (Angular SPA; backend
URLs not embedded — config loads at runtime). So Croatia = national buildable-area polygons as
data + plan CONTENT as raster + odredbe as PDF. Parcel linkage: DKP WFS + INSPIRE ATOM bulk
(REUSED). The 2020 vintage means: use as a first-gate mask + refuse-with-both-numbers where the
mask and a newer plan could disagree.

### BA — BOSNIA & HERZEGOVINA · verdict: **DOCUMENTS-ONLY**
PROBED: `katastar.ba` HTTP 200 (FBiH cadastre viewer); `geoportal.rgurs.org` (Republika Srpska)
connect-timeout (vantage finding — the RS geoportal is known to exist; disambiguation: EU
vantage). Planning is entity/canton/municipal; no machine-readable plan channel found at any
level this pass. Honest near-zero.

### RS — SERBIA · verdict: **OPAQUE-FROM-VANTAGE (fence-shaped) — do not record as absent**
PROBED: `geosrbija.rs`, `a3.geosrbija.rs`, `opendata.geosrbija.rs` all **connect-timeout**, while
`rgz.gov.rs` and `mgsi.gov.rs` (same state, different infra) answer HTTP 200 — the geoportal
cluster specifically is unreachable = geo-fence-shaped. `crpd.gov.rs`, `eprostor.gov.rs`,
`planskadokumenta.gov.rs` NXDOMAIN (the plan register's current domain unknown from here).
Serbia HAS a central register of planning documents (CRPD) and GeoSrbija plan layers per public
record — every envelope axis is **UNKNOWN-VANTAGE**, disambiguation probe: re-run the four
probes from an EU IP, then DescribeFeatureType the plan layers.

### ME — MONTENEGRO · verdict: **DOCUMENTS-ONLY**
PROBED: `geoportal.co.me` HTTP 200; its services page links a WMS at **`http://10.10.206.210/…`
(an internal RFC-1918 address leaked into the public page — unusable)**, a GeoNetwork at :8443,
and two viewer apps. `nekretnine.co.me` NXDOMAIN (superseded). The single-national-plan reform
(PGR CG) publishes documents, not data. No plan-geometry channel found.

### MK — NORTH MACEDONIA · verdict: **OPAQUE (login-walled e-planning; cadastre unreachable from vantage)**
PROBED: `e-urbanizam.mk` HTTP 200 → **title "Најава" = login page** — the national e-urbanism
system (which internally holds DUPs with gradežna linija/building-line objects) is
professional-login-gated. `katastar.gov.mk` + `ossp.katastar.gov.mk` connect-timeout (vantage),
`geoportal.katastar.gov.mk` NXDOMAIN. Probe named: EU-vantage re-run + check AKN's INSPIRE
services; ask for e-urbanizam read access.

### AL — ALBANIA · verdict: **COMPILE-PARAMETERS — national, live, feature-proven; the lane's best consume target** ⭐⭐
See TYPE-A HEADLINE #2. The chain planifikimi.gov.al → AKPT ArcGIS webmap → keyless
FeatureServers also serves proposed land-use per PPV, PDV (detailed plans) boundaries,
reconstruction zones, coastal PINS belt, municipality boundaries (VKM 360). Missing: parcel
fabric linkage (ASIG geoportal redirect-looped this session — RC=47 after 50 redirects; probe:
`geoportal.asig.gov.al` from a browser / its WMS endpoints directly) and licence text (item
public, licenseInfo empty). Values need a tolerant parser (`K1=…`, `PA`, prose escapes) with a
refusal path — never assume numeric.

### RO — ROMANIA · verdict: **DOCUMENTS-ONLY today → STRUCTURED-RULES emerging (2024 GIS-PUG standard)**
PROBED: `datelocale.mdlpa.ro/ro/about/tehnic_planurb/` HTTP 200 (the v1.1/15.07.2024 GIS norms
for PUG/PUZ — the standard prescribes structured slots incl. regim de înălțime/POT/CUT and
aliniament objects for NEW plans). ANCPI parcels/constructions REST — REUSED (L5, incomplete
fabric caveat). Stock plans CAD/PDF; QMAP (qmap.ro) is the evaluate-partner for stock conversion
(REUSED). Watch axis: the first published standard-conformant PUG-GIS packages become consumable.

### BG — BULGARIA · verdict: **Sofia: COMPILE-PARAMETERS (code→ЗУЗСО-table join) · national: DOCUMENTS-ONLY**
See TYPE-A HEADLINE #3 (Sofia). Also PROBED: `parametrichno_planirane` folder exists on
Sofiaplan's server (currently one kindergarten-catchment service — the parametric-planning slot
is there, thin). National: KAIS cadastre free-view/paid-extract, OUP/PUP per municipality PDF —
REUSED (L5). Sofia's `Строителна граница` line + zone-coded polygons + a LAW whose annex is a
fixed numeric table is the most automatable single-city join in the lane after Albania.

### TR — TURKEY · verdict: **DOCUMENTS-ONLY for envelope axes; parcels NATIONAL-NOW (REUSED same-day)**
REUSED from `audit/geo-expansion/2026-09-02/me-sweep.md` §10 (probed 2026-09-02, same day, not
re-derived): TKGM keyless point→parcel GeoJSON national (`ilAd/adaNo/parselNo/alan` quoted
there), licence UNKNOWN; **imar plans + imar durumu are municipal e-Devlet-gated documents; no
national plan-geometry channel; `mpvs.csb.gov.tr`/`tucbs.csb.gov.tr` NXDOMAIN**. The `nitelik`
storey-count text is AS-BUILT (condominium register), not normative height — never conflate
(SURVEYED ≠ NORMATIVE). Nothing new this session; no TR probes re-run.

### MD — MOLDOVA · verdict: **OPAQUE (explicit geo-fence) — the cleanest fence proof in the lane**
PROBED: `cadastru.md` HTTP 200 serving the literal text **"We are sorry, this content is not
available in Your region/country."** — a textual geo-fence, no ambiguity. `geoportal.md` is a
PARKED DOMAIN ("Ce domaine est peut-être à vendre" — record this: the old NSDI domain lapsed);
`geodata.gov.md` HTTP 200 but is a redirect shell to sector viewers (geology/roads/soils +
fenced eCadastru — 4 targets extracted in `ua-md-probes.txt`). No planning channel found.
Disambiguation: EU/MD vantage re-probe of `cadastru.md/ecadastru`.

### UA — UKRAINE · verdict: **GATED (wartime) + a real tabular per-permit channel (open data)**
PROBED: `nsdi.gov.ua` HTTP 200 → **authorization page** (national geoportal login-gated);
`map.land.gov.ua` connect-timeout (public cadastre map restricted); `e-construction.gov.ua`
HTTP 200 (EDESSB portal live; API path not found unauthenticated — `api_portal`, `opendata` 404).
**`data.gov.ua` CKAN PROBED: HTTP 200, count=106 datasets for "містобудівні умови та обмеження"**
(urban-planning conditions + restrictions = per-permit max height/density/setback document
extracts) in XLS/CSV per municipality — tabular, per-PERMIT not per-zone, quality varies. Zoning
plans (функціональні зони) themselves: closed for wartime security. Verdict axis by axis:
parcels GATED · zoning BLOCKED(war) · parameters: fragmentary tabular via open data.

### SM — SAN MARINO · one-liner
PROBED: `gov.sm` HTTP 200; `prg.sm` NXDOMAIN. The new PRG programme publishes documents through
gov.sm; no cadastre/plan data channel found. **DOCUMENTS-ONLY** — treat as a per-request micro
jurisdiction, zero engineering.

---

## LANE SYNTHESIS (what the census REPORT should carry)

1. **Two live consume targets came out of a region written off as PDF-land:** Croatia's national
   construction-area WFS (Type A, screening-grade, 89,911+ polygons, keyless) and Albania's
   national structural-unit FeatureServer (Type B on polygons, 91,939 units, height in storeys AND
   metres + FAR + coverage as fields, keyless). Both are one-adapter wins; both need a licence
   confirmation email before production (HR register says "no conditions"; AL licence is unstated).
2. **The gate map matters more than the data map here.** Malta (Cloudflare JS wall), Serbia +
   North-Macedonia cadastre + Moldova (geo-fences/timeouts, one textual), Ukraine (wartime logins),
   Cyprus (IIS folder 403): six of sixteen countries are gate-shaped, not absent. Every one has a
   named disambiguation probe; an EU-vantage re-run pass would settle four of them in an hour.
3. **Building LINES exist everywhere and are served nowhere.** IT fili edilizi, GR οικοδομικές
   γραμμές, TR imar hattı, MK gradežna linija — all legal objects, all locked in scanned/PDF plan
   sheets (or behind MK's login). The Baulinie-class Type-A channel this census hunts does not
   exist in the south-east yet; Romania's 2024 GIS-PUG standard (aliniament slots) is the only
   codified path toward one.
4. **Per-permit ≠ per-zone:** Ukraine's 106 УМО open-data registers are real machine-readable
   envelope parameters — but attached to issued permits, not to zones; useful as an evidence/
   calibration corpus, not as an envelope source.
5. **Validity/temporal is the sleeper axis:** Lombardia's probed Socrata register carries
   DATA_VIGORE/BURL per plan — plan-validity graphs are machine-readable in Italy even where
   geometry isn't.

## PROBE LEDGER (all live HTTP this session, 2026-09-02; full transcripts in `transcripts-south-east/`)

| Endpoint | Result |
|---|---|
| dati.lombardia.it/api/views/ijqk-ahfp.json | 200 — PGT plan-procedure register, columns quoted |
| cartografia.servizirl.it/arcgis + arcgis2 /rest/services | 200 ×2 — folder census, no public urbanistica |
| servizigis.regione.emilia-romagna.it/geoags/rest/services | 200 — no planning folders; wms/mosaico_psc → 401 |
| dati.emilia-romagna.it package_search PUG | 200 — 1 dataset (Scheda dei Vincoli, 13 formats) |
| dati.comune.milano.it package_search PGT | 200 — NIL boundaries only |
| ispu.mgipu.hr | 200 — Angular SPA (runtime config; no embedded backends) |
| registri.nipp.hr/api/izvori/{,244,246,183} | 200 — 1,686-source register; 244=Građevinska područja GDB/SHP "no conditions"; 246=WFS endpoint; 183=raster county WMS |
| gis4.mgipu.hr GradjPodrucje WFS GetCapabilities | 200 — WFS 2.0.0, 2 FTs, keyless |
| gis4.mgipu.hr GradjPodrucje GetFeature count=1 | 200 — numberMatched=89911, real member (FEATURE-LEVEL) |
| geosrbija.rs · a3 · opendata.geosrbija.rs | connect-timeout ×3 (rgz.gov.rs + mgsi.gov.rs 200 → fence-shaped) |
| eservices.dls.moi.gov.cy /rest/services | 200 root; DTPH/National folders → IIS 403 |
| msdi.data.gov.mt geoserver/ows + pamapserver | 403 Cloudflare ×2 UAs (JS challenge) |
| gis.epoleodomia.gov.gr | 200 — dead stub; ypen + www.epoleodomia unreachable |
| planifikimi.gov.al → akpt.maps.arcgis.com item data | 200 — webmap enumerated, 37 operational layers |
| services8.arcgis.com Njesite_Strukturore /0 + /query | 200 — schema + real Berat feature + count 91939 (FEATURE-LEVEL) |
| arcgis.com item ea575423d763452e… | 200 — access public, licenseInfo EMPTY |
| e-urbanizam.mk | 200 — login page (Најава) |
| katastar.gov.mk · ossp | timeout ×2 (vantage) |
| geoportal.co.me + /geoportal_eng.html | 200 — internal-IP WMS leak (10.10.206.210) |
| katastar.ba | 200 — viewer; geoportal.rgurs.org timeout |
| gis.sofiaplan.bg/server/rest/services (+oup_2009 FS, layer 2 meta+feature) | 200 — 90+ layers incl. Строителна граница; zone-code feature quoted (FEATURE-LEVEL) |
| datelocale.mdlpa.ro tehnic_planurb | 200 — 2024 GIS-PUG norms page live |
| nsdi.gov.ua | 200 — authorization wall |
| map.land.gov.ua | connect-timeout |
| e-construction.gov.ua (+api_portal, opendata) | 200 / 404 / 404 |
| data.gov.ua package_search містобудівні умови | 200 — count=106, XLS/CSV |
| cadastru.md | 200 — textual geo-fence quoted |
| geoportal.md | 200 — PARKED DOMAIN |
| geodata.gov.md | 200 — redirect shell (4 sector targets extracted) |
| gov.sm | 200; prg.sm NXDOMAIN |

## HONEST GAPS

- Feature-level proof exists for HR, AL, BG(Sofia) only; CY/MT/RS/MK/MD/UA remain gate-blocked
  with disambiguation probes named — an EU-vantage pass is the single highest-value follow-up.
- Licence text verbatim captured for NONE of the three consume targets (HR register phrase
  captured, licence ID absent; AL empty; BG Sofiaplan terms not read) — all three need the
  licence page/email before any adapter ships.
- IT was surveyed at region-census depth for Lombardia+Emilia only (per brief); the other 17
  regions' mosaic channels are REUSED doc-verified rows, not probed.
- ISPU's own WMS/WFS backends (vs the MGIPU gis1-4 satellites) were not extracted from the SPA;
  the NIPP register substitutes as the authoritative enumeration.
- No probe was made of TR this session (same-day ME-lane rows reused verbatim).
