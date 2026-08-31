# LANE 2 — GERMANY + DENMARK + SWITZERLAND (deep audit)

> Lane: de-dk-ch · Campaign: europe-site-intel 2026-08-31 · Written as-I-go.
> Classification letters per BRIEF §1 (A data · B OSS code · C API/service · D standard ·
> E derivable · F extractable · G missing · H PRYZM IP). Licence GREEN/YELLOW/RED per §9.
> Access-vs-ownership options 1–6 per §10 (1 query dynamically · 2 cache · 3 mirror ·
> 4 cloud-optimise · 5 store derived only · 6 metadata + on-demand).
> Every claim carries URL + date-checked. PROBED = live request made this lane (or a cited
> prior PRYZM probe with its date). Prior PRYZM evidence is cited, not re-transcribed.

## 0 — What PRYZM already holds on these three countries (do not re-buy)

| Country | Prior artefact | Verified | Key finding |
|---|---|---|---|
| DE | docs/04-reference/jurisdictions/de/findings/GERMANY-DATA-RECON-SPIKE.md | 2026-07-24 live probes | Hamburg + Berlin XPlanung WFS = plan outline + PDF link, NO GRZ/GFZ in schema; MV (demo.bauleitplaene-mv.de) serves FULL XPlanGML content model with populated grz (54/162), z (48/162), gfz (8/162), hoehenangabe 0/162. Gating variable = per-plan "content-vectorised" fraction, not platform. BauNVO §17 = Orientierungswerte (not ceilings), MU GRZ 0.8. |
| DK | docs/04-reference/jurisdictions/dk/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md | 2026-07-17 | Only validated jurisdiction with all four substrate layers open at national scale (Matriklen, Plandata structured fields, Danmark i 3D LoD2 CityGML, DHM LiDAR). Datafordeler = open-WITH-KEY (free self-service registration), key stays server-side. |
| CH | docs/04-reference/jurisdictions/ch/findings/SWITZERLAND-DATA-RECON-SPIKE.md | 2026-07-24 | geodienste.ch national NPL WFS `ms:grundnutzung` = zone ID + kanton + dokument string ONLY; NO nutzungsziffer/geschosszahl/gebaeudehoehe elements. Context axis ~85%; structured-rule axis ~20–25% (France-class). FAR is a typed OPTIONAL slot in the federal INTERLIS MGDM (per-canton harvest ceiling ~30–40%). |

(Findings below are NEW work for this audit: 2026-08-31 re-probes, per-Land numbers, OSS tooling, licences, parcel chains.)

---

# PART 1 — GERMANY

## DE-1 · XPlanung/XPlanGML actual availability per Land — PROBED + SOURCED 2026-08-31 · [A+C+D] · licence GREEN (DL-DE-BY-2.0 / Zero where served) · access option 1+2

**There is NO national census of "how many B-Plaene are XPlanGML-vectorised vs raster/PDF" as of
2026-08-31.** xleitstelle.de (checked 2026-08-31) publishes the standard, validator, test data —
no adoption statistics. The measurable facts, per probe:

| Land | Delivery probed | What it serves | Evidence (date) |
|---|---|---|---|
| **Berlin** | `gdi.berlin.de/services/wfs/bplan` | plan OUTLINE + `scan_www` PDF link; **no GRZ/GFZ/Hoehe in schema**; 2,839 festgesetzt (July probe) | HTTP 200 re-confirmed 2026-08-31 (97,188B caps, byte-identical to 2026-07-24); schema+feature: GERMANY-DATA-RECON-SPIKE.md §3 |
| **Hamburg** | `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` | plan outline + `planrecht` = literally a PDF URL; GRZ/GFZ absent from schema | live probe 2026-07-24 (spike §2), not re-run |
| **Mecklenburg-Vorpommern** | `demo.bauleitplaene-mv.de/ows/xplanung` | **FULL XPlanung content model** — `bp_baugebietsteilflaeche_polygons` with `grz`/`gfz`/`z`/`hoehenangabe`/`dachform` fields; RE-PROBED LIVE 2026-08-31: Cramonshagen Plan Nr. 4 `grz=0.4`, `z=1` populated | this lane, 2026-08-31; fill rates (July, 162 features): grz 33%, z 30%, gfz 5%, metric height 0% |
| **NRW** | `ogc-api.nrw.de/inspire-lu-bplan/v1` (OGC API Features) | **82,007 spatial plans** (numberMatched, probed 2026-08-31) at INSPIRE-PLU level: outline + status + `officialDocument`/`texturl` PDF links + municipality. No GRZ/GFZ. A superb PLAN INDEX + document-retrieval source, PDF-gated for numbers | this lane, 2026-08-31 |
| **Baden-Wuerttemberg** | `geoportal-raumordnung-bw.de/ows/services/org.1.…_wfs` "WFS XPlanung BPL landesweit" | XPlanung 6.0, but feature types are **BP_Plan + BP_Bereich only** (plan/scope level, not Baugebietsteilflaeche object level) → statewide index, not statewide numerics. Licence DL-DE-BY-2.0 | caps probed 2026-08-31 (32,930B) |
| **Sachsen-Anhalt** | `geodatenportal.sachsen-anhalt.de/wss-org3/service/INSPIRE_MLV_PLU_WFS/guest` | INSPIRE PLU WFS exists (endpoint recorded, NOT probed this lane); a commercial aggregator rates ST "richest XPlanung data" | search 2026-08-31 |

**Secondhand per-Land counts** (Minonexus GmbH — a commercial B-Plan aggregator — published table
"as of March 2026", minonexus.com/minonexus/bebauungsplaene, fetched 2026-08-31; treat as LEADS,
not measurements): NRW 79,494 plans / 74,625 doc URLs (consistent with our 82,007 probe incl.
FNP/regional plans); BW 31,382; RP 14,321 / 13,314 doc URLs; SH/ST/HB lowest at 597–1,482;
**only ~5 Laender serve structured Festsetzungen (GRZ/GFZ) centrally** — it names Bremen, SH, ST,
Bayern-pilot. Note their list does NOT include MV, which we live-proved DOES serve structured
fields — i.e. even the best commercial aggregator's coverage table under-counts; per-Land probing
remains mandatory.

**The July verdict is upheld and sharpened:** the gating variable is the per-plan
content-vectorisation fraction, not the platform. Germany-wide, the DELIVERED structured fraction
is small (MV-class Laender + pilot cities); the DOMINANT delivered artefact is plan outline +
status + PDF. Since 2023-02-01 XPlanung is mandatory for NEW plans in most Laender (NRW decree,
Nuernberg, etc. — search 2026-08-31), so the structured fraction grows at the rate of new planning,
~1–3%/yr of corpus — **decades to convergence without retro-vectorisation. Plan for PDF extraction
as the primary German rule path, with XPlanGML fast-path where objects exist.**

## DE-2 · GRZ/GFZ/height attribute completeness — MEASURED (July, re-anchored 2026-08-31) · [E/F]

Where the content model IS served (MV): `grz` 54/162 (33%), `z` storeys 48/162 (30%), `gfz` 8/162
(5%), `hoehenangabe` metres 0/162. **The German density regime is GRZ + Vollgeschosse (Z), not
GFZ + metres** — any cross-country ruler requiring "FAR + height-in-metres" systematically
under-counts Germany (GERMANY-DATA-RECON-SPIKE.md §1, verbatim numbers). Where only outlines are
served: BauNVO §17 gives a national per-Baugebiet table (WR/WA GRZ 0.4 GFZ 1.2 … MU 0.8/3.0,
MK 1.0/3.0) — but since 2017 these are **Orientierungswerte** (orientation values), not binding
caps (gesetze-im-internet.de/baunvo/__17.html, fetched 2026-07-24) → class E (DERIVABLE with
stated uncertainty), never DIRECT. §34 BauGB (unplanned inner areas, ~30% of parcels) = legal
floor: "Einfuegungsgebot" has NO numeric source at all — the honest answer is a reasoned refusal
or neighbourhood-derived inference (class E from context buildings — PRYZM's LoD2 assets make this
DERIVABLE, a real IP corner [H]).

## DE-3 · XPlanung OSS tooling — VERIFIED 2026-08-31 · [B]

| Tool | What | Licence | State | PRYZM action |
|---|---|---|---|---|
| **ozgxplanung / xPlanBox** — gitlab.opencode.de/diplanung/ozgxplanung | THE reference XPlanGML stack: manager, **xplan-validator** (API), WFS/WMS services, Docker; what Laender themselves run | **AGPL-3.0** (LICENSE.txt, fetched 2026-08-31) | 367 commits, 26 releases (xplanbox-7.x→9.1 tags), active; lat/lon GmbH origin, DiPlanung-hosted | **USE validator as an external service/CLI in ingestion QA; do NOT link AGPL code into PRYZM runtime** (AGPL = YELLOW for embedding, GREEN as standalone tool). Its schema mappings are the authoritative XPlanGML→DB reference — CONSULT, reimplement thin. |
| **SAGisXPlanung** — github.com/nti-de/SAGisXPlanung | QGIS plugin for XPlanung-conformant plan AUTHORING (capture, DB persist, XPlanGML 5.3/6.0 import/export) | **GPL-3.0** | v2.13.2, QGIS ≥3.22, maintained (NTI Deutschland) | NOT a consumption engine — it is how municipalities PRODUCE XPlanGML. MONITOR; irrelevant to runtime. |
| **XPLANUNG24-QGIS-Plugin** — github.com/Bau-Land-XPlanung | community QGIS plugin, XPlanung interaction | (repo licence not checked) | on plugins.qgis.org | MONITOR only |
| **xleitstelle test data** — via xleitstelle.de / OpenCoDE | XPlanGML fixtures per version | open | current | **CONSUME as adapter test fixtures** (real per-version XPlanGML samples) |

**Nothing in the German OSS landscape evaluates rules or builds envelopes** — the stack ends at
validate/store/serve. Rule extraction + applicability stays class G/H (missing / PRYZM IP).

## DE-4 · ALKIS cadastre access + licence per Land — VERIFIED 2026-08-31 · [A+C] · licence GREEN ×15, RED-ish ×1 · access option 1+2

- **15 of 16 Laender serve ALKIS parcels as open data** (full GeoInfoDok-without-owners or the
  "vereinfachtes Datenaustauschschema"), overwhelmingly **DL-DE-BY-2.0**; the forcing function is
  the **EU High-Value-Datasets Implementing Regulation (EU) 2023/138** (cadastral parcels =
  mandatory HVD). Sources: FOSSGIS 2025 talk "Open ALKIS?" (media.ccc.de/v/fossgis2025-58192…),
  geoobserver.de 2023-09-25 overview, FragDenStaat request — all checked 2026-08-31.
- **Bavaria is the holdout:** ALKIS Sachdaten NOT free; licence contract required (same sources).
  For DE-BY ship parcels via the paid/contract route or the BayernAtlas view services — mark
  DE-BY parcels **YELLOW/RED, verify current terms at ship time** (this has EU-law pressure on it
  and may flip).
- **Live probe (NRW):** `wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht` GetCapabilities → HTTP 200,
  `AccessConstraints: NONE`, keyless; feature types `ave:Flurstueck`, `ave:GebaeudeBauwerk`,
  `ave:Nutzung`… GetFeature at Cologne (EPSG:25832 356700,5644500) → full parcel
  `DENW37AL1000qn2e`, flstkennz `05495800500898______`, Gemarkung Koeln Flur 005 Nr. 898,
  geometry + `aktualit 2024-10-19` freshness (2026-08-31). **The German national parcel ID
  (Flurstueckskennzeichen) is the identifier spine for a DE adapter.**
- 16 endpoints, not 1: there is no national ALKIS WFS. Federation per Land is mandatory (matches
  BRIEF §16's federation expectation).

## DE-5 · LoD2 CityGML availability — VERIFIED 2026-08-31 · [A] · licence GREEN ×15, Saarland UNCONFIRMED · access options 3–4

- **State-level FREE LoD2 CityGML downloads confirmed listed for 15 of 16 Laender**: BW, BY, BE
  (+mesh), BB, HB, HH, HE, MV, NI, NRW, RP, SN, ST, SH, TH — each with a working download link in
  the community catalogue **OloOcki/awesome-citygml** (README fetched raw 2026-08-31; NRW/ST/RP/HE
  portals independently confirmed via their own open-data pages in search). Cities add extras
  (Berlin mesh, Freiburg, Hannover DWG, Leipzig DXF, Ingolstadt/TUM LoD3).
- **Saarland: NO state open-data LoD2 found** (searched 2026-08-31 — the one Land absent from the
  catalogue and from search results). Do not claim "all 16 free".
- **The national aggregate LoD2-DE product (BKG, gdz.bkg.bund.de) is NOT open data** — restricted
  to federal/state authorities under V GeoBund/V GeoLaender, annual update (product page fetched
  2026-08-31). **Federation of 15 Land downloads + Saarland gap-fill (EUBUCCO/OSM height-derived)
  is the German buildings answer** — confirming BRIEF §16's federation-wins hypothesis for DE.

## DE-6 · DiPlanung — status upheld · [C, process-API only]

July verdict (spike §5) stands, nothing newer found 2026-08-31: DiPlanung is plan-authoring +
participation (XPlanverfahren/XBeteiligung process APIs), NOT a structured B-Plan data tap; the
data taps remain the per-Land XPlanung/INSPIRE services (DE-1 table). Bavaria migrating fully to
DiPlan "by end of 2026" (Minonexus claim, unverified) would grow the AUTHORED-structured corpus,
not retro-structure the old one.

## DE-7 · Country verdict (DE)

- CADASTRE: A+C, GREEN ×15 (DL-DE-BY-2.0, keyless WFS probed), Bavaria contract-gated. Option 1+2.
- BUILDINGS: A, GREEN ×15 Laender LoD2 CityGML + open DTMs; Saarland gap; national product closed.
  Option 3–4 (mirror/cloud-optimise per Land; these are bulk ZIP downloads, not query APIs).
- PLANNING GEOMETRY: A+C, GREEN — plan outlines + status + PDF links near-nationwide (NRW alone
  82k plans probed); XPlanung object level only in MV-class Laender.
- PLANNING NUMBERS: mostly F (PDF-extract; the doc URLs are already in the plan index) + E
  (BauNVO orientation values, §34 context inference). DIRECT numerics: MV-class only (~33% fill
  where present).
- LEGAL FORM: XPlanGML (D, excellent, versioned 5.3→6.0.1) for the vectorised sliver; PDF for the
  corpus. **Germany is the country where PRYZM's PDF-rule-extraction pipeline earns its keep; the
  XPlanung content model should be adopted as the canonical GERMAN rule vocabulary** (grz/gfz/z/
  hoehenangabe/baugrenze/baulinie map 1:1 onto PRYZM's Prescription model).
- STRUCTURAL: 16 Land adapters behind one DE country adapter; Baulinien/Baugrenzen (building
  lines/fields) are first-class XPlanung objects where vectorised — same concept as DK byggefelt
  and CH Baulinien; the canonical model MUST carry them.


# PART 2 — DENMARK

## DK-1 · Plandata.dk WFS — PROBED LIVE 2026-08-31 · [A+C] · licence GREEN · access option 1 (query dynamically)

**Endpoint:** `https://geoserver.plandata.dk/geoserver/wfs` (GeoServer, WFS 2.0.0). **KEYLESS** — no
registration, no token; every request below ran anonymously on 2026-08-31. **208 typed layers**
(`pdk:` namespace), each planning theme in `_forslag` (proposed) / `_vedtaget` (adopted) / `_aflyst`
(repealed) / `_med_historik` (versioned) variants — i.e. plan LIFECYCLE + HISTORY are first-class,
which answers BRIEF §15 versioning for Denmark at the source.

**Schema (DescribeFeatureType, verbatim field names) — `theme_pdk_lokalplan_vedtaget`:**
`bebygpct` (building %, the Danish FAR analogue) · `bebygpctaf` (what the % is computed OF — a
codelist, critical semantic) · `m3_m2` (volume/area) · `maxetager` · `maxbygnhjd` (max height m) ·
`anvgen`/`anvspec1..10` (general/specific use codes) · `eareal1..10` (per-sub-area max GFA m²!) ·
`boligenhed1..10` (dwelling-unit caps) · `minuds` (min plot size) · `maxuds` · `zonestatus` ·
`kompleks` (=rules too complex to structure, PDF-only flag) · `doklink` (plan PDF) · full date set
(datoforsl/vedt/ikraft/aflyst). Ten repeating sub-area attribute groups.

**Real features probed (Copenhagen bbox, CQL `bebygpct IS NOT NULL AND maxbygnhjd IS NOT NULL`):**
- Lokalplan 558 "Østergade 27" (København, in force 2018-05-02): `bebygpct=630` (%), `maxetager=8`,
  `maxbygnhjd=25.5`, use "Blandet bolig og erhverv", doklink → `dokument.plandata.dk/20_3154219_….pdf`.
- Lokalplan 078 "Ottiliavej" (1985): `bebygpct=110`, `m3_m2=4.5`, `maxetager=5`, `maxbygnhjd=20`.

**National fill rates — measured this lane via WFS `resulttype=hits` (2026-08-31):**

| Layer | total | `bebygpct` populated | share |
|---|---|---|---|
| `lokalplan_vedtaget` (plan level) | **37,990** | 11,616 | 30.6% |
| `lokalplandelomraade_vedtaget` (sub-areas) | **66,270** | 28,557 | 43.1% |
| `kommuneplanramme_vedtaget_v` (municipal-plan frames) | **50,605** | 30,773 | 60.8% |
| `byggefelt_vedtaget` (building fields) | **57,080** | n/a (carries `maxbygnhjd`/`maxetager`/`eareal`, no bebygpct field) | — |

Plan-level: `maxetager` 8,767/37,990 (23.1%) · `maxbygnhjd` 9,131/37,990 (24.0%) · `doklink`
37,990/37,990 (100%) · `kompleks=true` only 40. **Reading:** the plan-level 30% is NOT the honest
ceiling — rules live at delomraade/byggefelt/ramme level; the kommuneplanramme layer alone gives a
60.8%-filled national density fallback wherever a lokalplan is silent, and the union across the four
layers is the real number (a per-parcel resolver must check byggefelt → delområde → lokalplan → ramme,
in that precedence order — this IS the Danish applicability ladder). Where every layer is empty the
Bygningsreglement (BR18 §168-186: e.g. 30%/40%/60% by typology) is the statutory default — DERIVED, not MISSING.

**Byggefelt layer** (`theme_pdk_byggefelt_vedtaget`, 57,080 features): per-field `maxbygnhjd`,
`maxetager`, `eareal` (max GFA), `boligenhed`, `bygkunifelt` ("may build ONLY inside field"),
`bygvejledende` (indicative vs binding) — this is the building-line/building-field geometry the
brief asks for, as first-class national data. No other country in this lane has this.

**Classification:** A (data) + C (API) + D (the PlanDK2/PlanDK3 data model is a de-facto national
standard). **Denmark IS the reference structured-rule country — confirmed at schema level, feature
level, and national fill level.** Structured-rule coverage is not 100%: it is ~30-60% numeric fill
depending on layer + 100% document links + a `kompleks` honesty flag (only 40 plans nationally punt
entirely). The `bebygpctaf` denominator codelist is exactly the semantic trap PRYZM's C63
"denominator = buildable land" lesson predicts — the % may be of the individual plot, of the whole
plan area, etc. An adapter MUST read it, never assume.

**Licence:** Danish public-sector geodata under the Danish PSI/free-geodata regime; Plandata terms:
CC BY 4.0 via Datafordeler terms (see DK-4). GREEN.
**Access option: 1 (query dynamically) + 2 (cache)** — keyless WFS with history layers makes
mirroring unnecessary; cache per-bbox responses. PRYZM's existing `DkZoningProvider` design
(GEOGRAPHIC-ROLLOUT-MASTER-TRACKER §5 row) assumed KEYED — **correction: the Plandata GeoServer WFS
is keyless; only Datafordeler (cadastre/BBR) is keyed.**


## DK-2 · The `bebygpctaf` denominator codelist — RESOLVED THIS LANE (2026-08-31)

`pdk:theme_pdk_codelist_bygberegnaf_v` (same keyless WFS): **1 = "Omraadet som helhed"** (the plan
area as a whole) · **2 = "Den enkelte ejendom"** (the property/estate = BFE unit) · **3 = "Den
enkelte grund"** (the individual plot) · **4 = "Det enkelte jordstykke"** (the individual cadastral
parcel). **Live consequence from the chains below:** Noerrebro ramme `bebygpct=150, af=4` → per
parcel, safe to multiply; Aarhus ramme `bebygpct=180, af=1` → **of the area as a whole — a naive
per-parcel 180% GFA would be WRONG.** This is PRYZM's C63 denominator lesson appearing as a coded
field in national data; the DK adapter must branch on all four values.

## DK-3 · Datafordeler (Matriklen / BBR / DHM) — GATE PROBED 2026-08-31 · [A+C] · licence GREEN (CC BY 4.0) · access option 6 (metadata + on-demand via server-side key)

- BBR REST no-auth probe: `services.datafordeler.dk/BBR/BBRPublic/1/rest/bygning` → **HTTP 403
  "(403) Unauthorized access"** — the free-registration key gate is real and live (matches
  DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md §2.1, 2026-07-17: self-service web user →
  IT-system → service user → API key; MitID or email).
- Matriklen2 WFS `MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS` → **HTTP 503 "This service has
  been deliberately (and temporarily) taken out of service"** (2026-08-31) — re-pin the service
  path at adapter-ship time.
- BBR is the floors/use/year source (Product A building attributes) — key-gated but free;
  buildings LoD2 ("Danmark i 3D") + DHM terrain via Dataforsyningen token (July doc; not re-probed).

## DK-4 · Keyless side-doors + licence — PROBED/VERIFIED 2026-08-31 · [C] · licence GREEN

- **DAWA** `api.dataforsyningen.dk/jordstykker?x=&y=` — KEYLESS cadastral parcel lookup returning
  matrikelnr + ejerlav + kommune + **BFE number** (the Danish property spine) + geometry links;
  probed twice (CPH, Aarhus). The DK parcel step needs no key at all. ⚠ Its `bygninger` endpoint
  answered HTTP 200 with an EMPTY array at two central-CPH probes — recorded as NOT reliable;
  use BBR/GeoDanmark for buildings.
- **Licence:** free basic data via Datafordeleren under **CC BY 4.0** (attribution to the data
  register; commercial use explicitly permitted) — datafordeler.dk/vejledning/brugervilkaar/ +
  digst.dk licens-og-brugsvilkaar (checked 2026-08-31). Plandata purpose/terms:
  planinfo.erhvervsstyrelsen.dk/om-plandatadk. GREEN across the board.

## DK-5 · Country verdict (DK)

**Denmark is confirmed as THE reference structured-rule country** — the only one of the three
where the full §30 chain runs DIRECT end-to-end (parcel keyless → plan → numeric rules → derived
envelope) with plan lifecycle + history layers built into the source. It is the country to
calibrate the canonical Rule model against (bebygpct+af, maxetager, maxbygnhjd, m3_m2, byggefelt,
delomraade precedence, kompleks flag, BR18 statutory defaults). Adapter cost is the smallest of
the three; the subtleties are semantic (denominators, layer precedence), not access.

# PART 3 — SWITZERLAND

## CH-1 · ÖREB cadastre (PLR cadastre) M2M webservice — PROBED LIVE 2026-08-31 · [C+D] · licence GREEN (public-law cadastre, free) · access option 1

The federal standard M2M interface (`GetEGRID` + `GetExtractById`, XML/JSON/PDF; federal spec:
cadastre-manual.admin.ch/de/oereb-webservice-aufruf-eines-auszugs, checked 2026-08-31) is
implemented per canton on cantonal base URLs. Live probes this lane, both keyless:

- **GetEGRID (LU):** `https://svc.geo.lu.ch/oereb/getegrid/json/?EN=2666200,1211250` → HTTP 200,
  two EGRIDs incl. `CH873588275009` (Liegenschaft 3729) + a Baurecht parcel. Coordinates → EGRID
  is ONE call. (2026-08-31)
- **GetExtractById (LU):** `https://svc.geo.lu.ch/oereb/extract/json/?EGRID=CH873588275009` →
  HTTP 200, 74,962B. Parcel 3729, Luzern, **LandRegistryArea 2237 m2**, 6 concerned themes, 10
  restrictions: `ch.Nutzungsplanung` TypeCodes 4400/6300/9190 **WITH restriction geometry inline**,
  Laermempfindlichkeitsstufe 3, natural-hazard, cultural-monument, technical-hazard,
  soil-displacement themes — every restriction linked to its legal documents (Bau- und
  Zonenreglement Luzern; RPG SR 700; LSV; …). (2026-08-31)
- **GetExtractById (BS):** `https://api.oereb.bs.ch/extract/json/?EGRID=CH516702897010` → HTTP 200,
  101,963B. Parcel 0039, 10,338 m2, **17 restrictions**: Nutzungsplanung (Stadt- und
  Dorfbild-Schutzzone; Wohnanteil Innerstadt), **ch.BauStrassenWeglinien × 11** (Baulinien +
  Strassenlinien — building/street lines as per-parcel restrictions), Denkmalverzeichnis,
  Sicherheitszonenplan, Laermempfindlichkeitsstufen. Each restriction → typed `TypeCode` +
  `AreaShare`/`PartInPercent` + `Lawstatus` + `LegalProvisions` with resolvable doc URLs
  (fedlex.admin.ch ELI links, gesetzessammlung.bs.ch versioned-law API,
  **oereblex.bs.ch/api/attachments/NNN** per-decision PDFs). (2026-08-31)

**Findings that matter for the architecture:**
1. The ÖREB extract IS a working national instance of BRIEF §14's evidence graph: per-parcel
   restriction → typed code → law status → exact legal document (down to versioned law PDFs and
   per-decision attachments via the ÖREBlex API). PRYZM should MODEL its evidence chain on it
   (and for CH simply CONSUME it), not invent a rival.
2. **Geometry inclusion varies by canton** — LU inlines restriction geometry; BS returns
   `Geometry: []` + `AreaShare`/`PartInPercent` + a `ReferenceWMS` only. An adapter must fall back
   to the cantonal geodata service for restriction polygons in geometry-less cantons.
3. **Numeric rules (Ausnuetzungsziffer / Geschosszahl / Gebaeudehoehe) are NOT in the extract.**
   The extract names the zone + THE document (e.g. "Bau- und Zonenreglement (Luzern)"). Numbers
   stay Baureglement-PDF-bound → step class F (AI-EXTRACTED) per commune, exactly as the
   2026-07-24 PRYZM spike concluded. ÖREB does however hand the extraction problem its exact
   source document, which is half the battle (doc retrieval solved; parsing remains).
4. Response JSON shape differs per canton implementation (BS wraps in
   `GetExtractByIdResponse.extract`, LU in `Extract`) — one more per-canton seam, though both obey
   the same federal data model (OeREBKRSV).

## CH-2 · geodienste.ch national Nutzungsplanung WFS — RE-CONFIRMED LIVE 2026-08-31 · [A+C] · licence YELLOW (per-canton conditions mosaic) · access option 1+2

`https://geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu?SERVICE=WFS&REQUEST=GetCapabilities` →
HTTP 200 (2026-08-31), 4 feature types (`ms:grundnutzung` + 3 ueberlagernde layers). The 2026-07-24
PRYZM spike's schema verdict stands unrefuted: `grundnutzung` = zone codes (kommunal + kantonal +
harmonised `hauptnutzung_code`) + `dokument` string; **NO nutzungsziffer / geschosszahl /
gebaeudehoehe elements** (SWITZERLAND-DATA-RECON-SPIKE.md §1.1). The federal MGDM carries FAR as a
typed OPTIONAL slot → per-canton harvest ceiling ~30–40%, not delivered nationally today. Licence:
geodienste.ch terms are set PER CANTON per service ("frei erhaeltlich" vs registration vs contract)
— treat as YELLOW until the per-canton flag matrix is captured for the cantons PRYZM ships.

## CH-3 · ARE "Bauzonen Schweiz (harmonisiert)" — PROBED LIVE 2026-08-31 · [A+C] · licence GREEN (opendata.swiss, geo.admin.ch) · access option 1

`https://api3.geo.admin.ch/rest/services/api/MapServer/identify?...layers=all:ch.are.bauzonen`
at LV95 (2666200,1211250) → HTTP 200: `ch_code_hn=12` "Arbeitszonen", municipality Luzern, BFS
1061, `flaeche=15428` — the nationally HARMONISED zone typology (`ch_code_hn`) as a keyless REST
identify. Dataset: opendata.swiss/en/dataset/bauzonen-schweiz-harmonisiert (checked 2026-08-31).
This is the correct national fallback/cross-check layer for zone TYPE (not for numeric rules; ARE
harmonisation is analytic, not legally binding — the binding layer is the cantonal NPL).

## CH-4 · swisstopo free geodata (OGD since 2021-03-01) — VERIFIED 2026-08-31 · [A] · licence GREEN (attribution required, commercial explicitly allowed) · access options 2–4

All swisstopo standard digital products free since 2021-03-01: swissALTI3D (0.5m DTM),
swissSURFACE3D (LiDAR), swissBUILDINGS3D 3.0 (LoD2-class), swissTLM3D, SWISSIMAGE, plus AV
cadastral products via cantons. Terms:
swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste — use/distribute/
enrich/process incl. COMMERCIAL, source attribution mandatory (checked 2026-08-31 via search;
terms page URL recorded). Buildings register (GWR) has an OSS wrapper: liip/open-swiss-buildings-api
(GitHub, surfaced 2026-08-31; maturity not audited this lane).

## CH-5 · "Swiss Zoning API" + "BZOdigital" (named in BRIEF §8) — SEARCHED 2026-08-31: NOT FOUND as OSS projects · [G as named / C via substitutes]

Searched (WebSearch, 2026-08-31): no repo or product literally named "Swiss Zoning API" or
"BZOdigital" surfaced. What EXISTS in that slot: (a) the ARE harmonised Bauzonen REST layer (CH-3);
(b) commercial parcel/zoning APIs — **Popety.io** (HelveCAD, cad-export.popety.io — parcels,
EGRID, zones, development-potential scoring; commercial) and **Terrara.ch** (cadastral + zoning
data for architects, all 26 cantons; commercial); (c) Zuerich's BZO revision (public Auflage since
2026-03-18, bzo-zuerich.ch; the city publishes digital plan products for zone + Ergaenzungsplaene
— stadt-zuerich.ch). If the founder has concrete URLs behind these two names they should land in
this file; until then treat the names as leads that did not resolve, the capability as covered by
(a)+(b)+ÖREB. **Do not cite "Swiss Zoning API / BZOdigital exist" in the report — unverified.**

## CH-6 · Country verdict (CH)

- CONTEXT (Product A): GREEN and excellent — swisstopo OGD terrain/LiDAR/LoD2-class buildings +
  AV parcels + ÖREB. Nothing to build beyond adapters. Options 2–4 (cache/mirror/cloud-optimise).
- RULES (Product B): zone + restriction + building-line layers DIRECT via ÖREB/cantonal WFS;
  numeric envelope values (AZ/UEZ, floors, heights, setback distances) are commune-Reglement-bound
  → class F, with the ÖREB extract handing you the exact source document per parcel. CH is the
  best country in this lane for the EVIDENCE-GRAPH pattern and the worst of the three for
  structured numerics.
- PRYZM stance: CONSUME the ÖREB webservice per canton (26 adapters share one federal schema,
  modulo CH-1.4 wrapper variance); CONSUME geodienste.ch NPL for zone geometry; CONSUME ARE
  bauzonen as harmonised cross-check; BUILD the Reglement-PDF rule extractor (that IS the IP,
  per-commune, and it generalises to DE §34/PDF-plans and every document-rule country).


# PART 4 — PARCEL CHAINS (BRIEF §30) — six parcels, all steps live-probed this lane except where dated otherwise

Step legend: parcel → buildings → zone → plan → restrictions → rules(numbers) → envelope → GFA.
Grades: DIRECT (machine-readable authoritative) / DERIVED (deterministic from authoritative) /
AI-EXTRACTED (doc-bound) / MISSING. All probes 2026-08-31 unless noted.

## Chain DE-A — Cologne, Flurstueck 05495800500898 (Gemarkung Koeln, Flur 005, Nr. 898)
| Step | Grade | Evidence |
|---|---|---|
| Parcel | **DIRECT** | NRW ALKIS WFS keyless, full polygon + flstkennz (probe above) |
| Buildings | **DIRECT** | `ave:GebaeudeBauwerk` same WFS + NRW LoD2 CityGML open download (not fetched this lane; catalogued) |
| Zone/plan | **DIRECT** | NRW OGC API: 5 B-Plaene intersect the cathedral-area bbox, e.g. "Domkloster, Am Hof…" In Kraft, each with `officialDocument` PDF URL (geoportal.stadt-koeln.de/pdf/bplan-public/67453.16.000.00.pdf) |
| Restrictions | DIRECT (plan status, type) / MISSING (no structured Festsetzungen) | same probe |
| Rules (GRZ/GFZ/H) | **AI-EXTRACTED** | numbers live in the linked PDFs; no structured source exists for Cologne |
| Envelope | DERIVED after extraction | PRYZM engine; Baugrenzen would also be in-PDF |
| GFA | DERIVED | GRZ×area / GFZ×area after extraction |

## Chain DE-B — Cramonshagen (MV), B-Plan Nr. 4 Baugebietsteilflaeche
| Step | Grade | Evidence |
|---|---|---|
| Parcel | DIRECT (MV ALKIS open, not probed this lane — DE-4 15/16 finding) | geoobserver/FOSSGIS sources |
| Zone/plan | **DIRECT** | MV XPlanung WFS re-probed 2026-08-31 |
| Rules | **DIRECT**: `grz=0.4`, `z=1`, Wohnbauflaeche, Satteldach/Walmdach/Krueppelwalmdach; `gfz`,`hoehenangabe` empty | live GetFeature this lane |
| Envelope | **DERIVED** deterministically (GRZ+Z+Dachform+Baugrenze objects in same service) | — |
| GFA | DERIVED (GRZ×A footprint cap; Z storeys; GFZ absent → storey-count route) | — |

## Chain DK-A — Copenhagen Noerrebro, matr. 4801 Udenbys Klaedebo Kvarter (BFE 6021259)
| Step | Grade | Evidence |
|---|---|---|
| Parcel | **DIRECT, keyless** | DAWA `api.dataforsyningen.dk/jordstykker?x=12.5530&y=55.6940` → matrikelnr 4801, ejerlav, BFE |
| Buildings | DIRECT but **KEY-GATED** | BBR REST probed no-auth → `403 Unauthorized access`; free self-service key (Datafordeler; DENMARK docs 2026-07-17). DAWA `bygninger` endpoint answered 200 but EMPTY at two CPH points — do NOT rely on it |
| Zone | **DIRECT** | Plandata: no lokalplan at point (genuine 0 — axis-order verified via ramme discriminator) |
| Plan/rules | **DIRECT** | Kommuneplanramme R24.B.3.40 (in force 2024-12-12): `bebygpct=150` (**`bebygpctaf=4` — read the denominator code!**), `maxbygnhjd=24`, Boligomraade, doklink PDF |
| Envelope | **DERIVED** deterministically | bebygpct+height+use, all machine-readable |
| GFA | **DERIVED** | 150% × parcel area (denominator per bebygpctaf) |

## Chain DK-B — Aarhus Midtby, point 10.2107,56.1572 (hit matr. 7000ad = road parcel; chain still resolves)
| Step | Grade | Evidence |
|---|---|---|
| Parcel | **DIRECT, keyless** | DAWA → matr. 7000ad Aarhus Bygrunde, BFE 5625716 |
| Plan | **DIRECT** | Lokalplan 591 (theme plan, facades/signage) — all numeric fields null, `kompleks=false`, doklink PDF |
| Rules | **DIRECT via fallback layer** | Kommuneplanramme 010109CY: `bebygpct=180` (af=1), `maxetager=4`, Centeromraade |
| Envelope/GFA | **DERIVED** | ramme numbers + theme-plan PDF constraints (AI-EXTRACTED for facade rules) |

## Chain CH-A — Luzern parcel 3729 (EGRID CH873588275009), from raw coordinates
| Step | Grade | Evidence |
|---|---|---|
| Parcel | **DIRECT, keyless** | OEREB GetEGRID by EN coords → EGRID + Baurecht sibling; area 2,237 m2 in extract |
| Buildings | DIRECT | swissBUILDINGS3D/GWR (OGD, CH-4) — not fetched this lane |
| Zone | **DIRECT** | extract: ch.Nutzungsplanung TypeCodes 4400/6300/9190 WITH geometry |
| Restrictions | **DIRECT** | noise level ES3, hazard, monument, soil themes, each with law refs |
| Rules (AZ/floors/height) | **AI-EXTRACTED** | extract names "Bau- und Zonenreglement (Luzern)" as THE doc; numbers not in any structured layer |
| Envelope | DERIVED after extraction (+ Baulinien where present) | — |

## Chain CH-B — Basel parcel 0039 (EGRID CH516702897010)
| Step | Grade | Evidence |
|---|---|---|
| Parcel | **DIRECT** | extract: 10,338 m2, municipality, land-registry plan refs |
| Zone | **DIRECT** | Stadt- und Dorfbild-Schutzzone + Wohnanteil overlay (TypeCodes) |
| Building lines | **DIRECT as applicability, geometry via cantonal WFS** | 11 × ch.BauStrassenWeglinien restrictions; extract has AreaShare/ReferenceWMS, `Geometry: []` in BS |
| Rules | **AI-EXTRACTED** | Bau- und Planungsgesetz/-verordnung via versioned-law API + OEREBlex attachment PDFs — the doc chain is fully machine-resolvable |
| Envelope | DERIVED after extraction | — |

**Cross-chain reading:** the SHAPE is identical everywhere — parcel/zone/plan/restrictions are
DIRECT in all three countries; the numeric-rule step is the fork: DK DIRECT (with a 4-layer
precedence ladder), DE DIRECT-only-in-MV-class / else AI-EXTRACTED with doc URL served, CH
AI-EXTRACTED with doc URL served. **Envelope + GFA are DERIVED everywhere once rules resolve —
no country ships an envelope engine. That layer is PRYZM IP in all three.**


# PART 5 — LANE VERDICTS + CORRECTIONS + GAPS

## 5.1 Cross-country matrix (this lane's three countries)

| Axis | DE | DK | CH |
|---|---|---|---|
| Cadastre | GREEN 15/16 keyless WFS (BY gated) | GREEN keyless (DAWA) / CC BY 4.0; Datafordeler key for bulk | GREEN via OEREB/AV (canton services) |
| Buildings 3D | GREEN LoD2 15/16 (federated ZIPs; SL gap; national product closed) | GREEN LoD2 "Danmark i 3D" + DHM (key-gated bulk) | GREEN swissBUILDINGS3D OGD |
| Plan geometry | GREEN near-national (indexes + outlines) | GREEN national (Plandata, versioned) | GREEN national (geodienste NPL + OEREB) |
| Structured numerics | MV-class only (~33% fill where served) | **~31% plan-level, 61% ramme-level, 4-layer union higher — best in lane** | ~0% delivered nationally (typed slot exists) |
| Doc links machine-served | YES (82k NRW alone) | YES (100% doklink) | YES (OEREB → exact law/decision, best-in-class) |
| Numeric-rule path | F (PDF) + E (§17/§34 context) | DIRECT + BR18 defaults | F (Reglement PDF, doc handed to you) |
| Licence colour | GREEN (DL-DE) ×15; BY YELLOW/RED | GREEN (CC BY 4.0) | GREEN federal; geodienste YELLOW per-canton mosaic |

## 5.2 Access-vs-ownership recommendation (BRIEF §10)

- DK: **option 1** (query Plandata WFS live; keyless, versioned) + 2 (bbox cache). Server-side key
  for Datafordeler bulk (BBR/Matriklen/DHM) = option 6 for buildings detail.
- DE: plans **option 1+2** against per-Land services; LoD2/DTM **option 3–4** (mirror +
  cloud-optimise, they are ZIP dumps); ALKIS **option 1** (WFS) with per-Land adapter table.
- CH: OEREB **option 1** strictly (it is a legal extract — never cache stale law); swisstopo bulk
  **option 3–4**; geodienste NPL **option 1+2**.

## 5.3 Corrections to existing PRYZM docs surfaced by this lane

1. GEOGRAPHIC-ROLLOUT-MASTER-TRACKER §5 says Denmark is "**Keyed** — the template for every keyed
   source". **Half-stale:** the Plandata zoning WFS is KEYLESS (probed), and parcels are keyless
   via DAWA; only Datafordeler services (BBR/Matriklen bulk/WFS) are keyed. The DK adapter's
   critical path needs NO key.
2. DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE §2 "WFS/WMS/WMTS, REST, FTP … all gated behind this
   [key]" — true for Datafordeler hosts, but the Plandata GeoServer + DAWA sit OUTSIDE the gate.
3. Matriklen2 WFS path `MATRIKLEN2/MatGaeldendeOgForeloebigWFS/1.0.0/WFS` returned **503 "This
   service has been deliberately (and temporarily) taken out of service"** (2026-08-31) — the DK
   doc's service inventory needs a re-pin when the adapter ships.
4. Switzerland tracker row "zone-ID only (numbers model+PDF-bound)" **confirmed** — and
   strengthened: OEREB hands the exact source document per parcel, so the CH extraction pipeline
   should be seeded from OEREB doc refs, not from a canton-by-canton document hunt.

## 5.4 What is GENUINELY MISSING (class G) across all three — the PRYZM IP surface (class H)

1. **Envelope engine** — no government or OSS artefact in DE/DK/CH computes a buildable envelope
   from these sources. (DK byggefelter are the closest thing to envelope INPUT geometry.)
2. **Rule normalisation across regimes** — bebygpct(af-coded denominators) vs GRZ/GFZ/Z vs
   AZ/Ausnuetzungsziffer: no existing mapping standard; the per-country semantics ARE the moat.
3. **PDF→structured-rule extraction at corpus scale** — DE (80k+ linked PDFs in NRW alone) and CH
   (per-commune Reglemente) both reduce to this one capability; ozgxplanung explicitly does not do it.
4. **§34/context-derived inference** (DE) — LoD2 + parcel fabric → Einfuegung envelope; nobody does it.

## 5.5 Verification debts this lane leaves open (honest gaps)

- Sachsen-Anhalt INSPIRE PLU WFS recorded but NOT probed; "richest XPlanung data" claim unverified.
- Saarland LoD2: absence-of-evidence after search, not proven closed — one email/portal check owed.
- Bavaria ALKIS terms: re-verify at DE-BY ship time (EU HVD pressure may have flipped it).
- geodienste.ch per-canton licence flag matrix not captured (YELLOW until done).
- Danmark i 3D / DHM download mechanics (token flow) taken from the 2026-07-17 doc, not re-probed.
- Minonexus per-Land table is a competitor's marketing-adjacent page; numbers used as leads only.
