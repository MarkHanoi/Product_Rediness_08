# LANE 5 — REST-OF-EUROPE BREADTH SWEEP (AT, BE, BG, HR, CY, CZ, FI, GR, HU, IE, IT, LV, LU, MT, RO, SK, SI, SE, UK, NO)

> Lane: rest-of-europe · Date researched: 2026-08-31 · Method per BRIEF §5 + §32.
> Every row cites the URL and the date checked. PROBED = a live HTTP request was made this session.
> DOC = verified from official documentation page this session. INTERNAL = reuses prior PRYZM
> verified research (cited by repo path + its own verification date) — NOT re-probed unless marked.
>
> Classification letters (BRIEF §1): A existing data · B existing OSS · C existing API/service ·
> D existing standard · E derivable · F extractable (doc/AI) · G genuinely missing · H PRYZM IP.
> Licence colour: GREEN / YELLOW / RED (BRIEF §9). Access-vs-ownership option (BRIEF §10):
> 1 query dynamically · 2 cache · 3 mirror · 4 cloud-optimise · 5 store derived only · 6 metadata+on-demand.
> LEGAL FORM taxonomy (BRIEF §5): GIS-ATTR / XML-GML / JSON / RDF / API / PDF / HTML / SCANNED / DB / STRUCT-OBJ / LEGAL-TEXT.
>
> Heatmap axes (BRIEF §21): contextual3D / cadastre / planning-geometry / rules / automation /
> envelope / confidence — 0–100%, honest zeros welcome. These are LANE ESTIMATES for triage, not
> C63 scorecard outputs (C63 forbids hand-typed cells in RATE files; this audit file is not a RATE file).

## Existing PRYZM state reused (read before judging anything "new")

- `docs/04-reference/jurisdictions/GEO-DATA-SOURCING-MASTER.md` (founder-verified 2026-07-25):
  terrain+height sourcing rows already exist for SE, FI, NO, UK, BE (3 regions), IT — with auth
  class and licence per row. This lane does not re-derive those; it adds cadastre/planning/software.
- Master data-source studies exist for SE (2026-07-24), NO (2026-07-24), FI, IT (2026-07-23) at
  `docs/04-reference/jurisdictions/<cc>/findings/`. GB has `COUNTRY-DATA-STRATEGY.md` (2026-07-30)
  + `ENGLAND-CONTEXT-DATA-DEEP-DIVE-L516.md`. BE has Brussels/Flanders/Wallonia jurisdiction folders.
- C63 legacy structured-fill estimates on record: IT ~9–11% · SE ~40% post-2022 / ~20–30% weighted ·
  NO ~32% · FI ~55–65% Ryhti regions / ~30–35% non-Ryhti · GB discretionary (structurally capped).

---

## AT — AUSTRIA (priority)

**Cadastre.** BEV (Bundesamt für Eich- und Vermessungswesen) DKM "Kataster Stichtagsdaten" —
biannual snapshots (1 Apr / 1 Oct) per Bundesland, SHP/GPKG/DXF, keyless download, **CC BY 4.0**.
Verified 2026-08-31 via data.bev.gv.at GeoNetwork records (e.g.
https://data.bev.gv.at/geonetwork/srv/api/records/09e3c4a9-3cc2-40a9-955d-da668b2747f0 — "Kataster
Grafik Grundstücksverzeichnis GPKG Stichtag 01.04.2024") and
https://www.bev.gv.at/Services/Produkte/Kataster-und-Verzeichnisse/Kataster-Stichtagsdaten.html.
The data.bev.gv.at landing page is a JS catalog (direct fetch returned title only — probe the
GeoNetwork API, not the SPA). INSPIRE CP also via geoportal.inspire.gv.at. **Ownership (Grundbuch)
is a separate, PAID system** (justiz online / resellers) — an identity/fee gate, not missing data.
→ Class **A** (snapshots) + **D** (INSPIRE CP) · geometry **GREEN**, ownership **YELLOW** (paid
reseller) · access option **3/4** (mirror biannual snapshots, cloud-optimise to FlatGeobuf/PMTiles).
No live query API for parcel geometry found this pass (snapshots only) — flag for adapter design.

**Buildings.** DKM snapshot includes building/use polygons (Nutzungsflächen). No national LoD2.
Nationwide open ALS DTM+DSM 1 m via geoland.at (CC BY 4.0) → **derive nDSM** (class **E**), same
pattern as NO/UK rows in `GEO-DATA-SOURCING-MASTER.md`. Vienna publishes a city Baukörpermodell —
**PROBED 2026-08-31**: `ogdwien:FMZKBKMOGD` ("Baukörpermodell") + `GEBAEUDEINFOOGD` +
`GEBAEUDETYPOGD` live on `https://data.wien.gv.at/daten/geo?service=WFS` (CC BY 3.0 AT). GWR
(national building & dwelling register, floors/use — Statistik Austria) is **access-gated**, not
open. → **GREEN** for footprints+derived heights; GWR **YELLOW**.

**Planning.** Competence of the **9 Bundesländer — no national standard, no XPlanung analogue**.
- Vienna: Flächenwidmung as WFS **PROBED 2026-08-31** — `GENFLWIDMUNGOGD` (generalised zoning),
  `GRPZONENOGD` (Schutzzone/Wohnzone), Bausperre layers; ~350+ feature types on the OGD WFS;
  licence CC BY 3.0 AT. Numeric Bebauungsbestimmungen (Bauklasse heights, Baulinien) are NOT
  separate WFS feature types on this endpoint — the legally binding Flächenwidmungs- und
  Bebauungsplan sits in the plan documents (PDF) behind the viewer.
- Upper Austria (DORIS): Flächenwidmung as INSPIRE WFS incl. a **"Flächenwidmung
  Geschossbezogen"** (storey-related) dataset — DOC 2026-08-31
  (https://geometadatensuche.inspire.gv.at/metadatensuche/inspire/api/records/D79DED93-416A-4997-B4F7-12E5DC41EA98,
  https://www.data.gv.at/katalog/dataset/land-ooe_flachenwidmung-einrichtungen-oberosterreich).
- Salzburg SAGIS / Styria / Tyrol / Lower Austria: viewers exist in every Land (DOC via
  https://www.infina.at/ratgeber/flaechenwidmung/ round-up); WFS/download availability VARIES per
  Land — NOT individually probed this pass, do not assume OÖ/Vienna pattern generalises.
→ LEGAL FORM: **GIS-ATTR** for Widmung in probed Länder; **PDF/LEGAL-TEXT** for numeric building
rules (Bebauungsplan) almost everywhere. Class **A** (Widmung, some Länder) + **F** (numeric rules)
· **GREEN/YELLOW** patchwork · option **2** (cache per-Land WFS) + **6** for plan PDFs.

**Software note.** No Austrian zoning-rule-engine OSS/startup found this pass; adjacent: PlanRadar
(Vienna; construction docs, not site intel), IMMOunited (Grundbuch data reseller — the paid
ownership gate productised). INSPIRE metadata search (geometadatensuche.inspire.gv.at) is the
working discovery layer.

**Heatmap (lane estimate).** contextual3D **70%** (open 1 m DTM/DSM nationwide + DKM footprints +
Vienna 3D model) · cadastre **85%** (CC BY 4.0 national snapshots, keyless; minus: no live geometry
API, ownership paid) · planning-geometry **40%** (Vienna+OÖ GIS-live; other 7 Länder unprobed
viewers) · rules **15%** (numeric Bebauungsplan values PDF-locked outside Vienna's viewer) ·
automation **25%** (9 adapters needed, 2 verified consumable) · envelope **20%** (Widmung category
+ derived heights only; setback/Bauklasse extraction = F work) · confidence **55%** (2 live probes
+ catalog verification; 7 Länder unprobed).

## BE — BELGIUM (priority)

**Cadastre.** Two-tier, both open:
- Federal FPS Finance "Cadastral Plan / Plan parcellaire cadastral" — **PROBED (page) 2026-08-31**
  https://financien.belgium.be/nl/experten_partners/open-patrimoniumdata/datasets — CC BY 2.0 with
  an explicit public-domain-style rights transfer, **commercial use expressly allowed**; annual
  situation-01/01 snapshot; download portal + web services + CadGIS viewer.
- Flanders GRB via OGC API Features — **PROBED 2026-08-31**:
  `https://geo.api.vlaanderen.be/GRB/ogc/features/collections` live, keyless; collection **ADP**
  (administrative/cadastral parcels), GeoJSON/GML/GPKG out, EPSG:31370. **FEATURE-LEVEL probe
  same session**: `/collections/ADP/items?limit=1` returned a real parcel, keyless — attribute
  schema CAPAKEY (parcel key), CANU, NISCODE (municipality), FISCDATUM, BHRDR/LBLBHRDR,
  BGNINV/LBLBGNINV, VERSIE/BEGINDATUM/VERSDATUM. Matches the keyless verdict
  already on record in `GEO-DATA-SOURCING-MASTER.md` (2026-07-25).
- Brussels UrbIS CC0 + Wallonia via WalOnMap — INTERNAL (verified 2026-07-25), not re-probed.
→ Class **A+C** · **GREEN** across all three regions · option **1/2** (query GRB live; cache the
federal annual snapshot).

**Buildings.** GRB **GBG** (building at ground level) collection live on the same OGC API —
**PROBED 2026-08-31**, keyless. 3D GRB LoD1 + UrbIS 3D (LoD2-equivalent, CC0) + Wallonia **MNH
ready-made height raster** — all INTERNAL (GEO-DATA-SOURCING-MASTER, verified 2026-07-25). →
Class **A/E** · **GREEN** · option **2/5**.

**Planning.** Three regional systems, all with real GIS:
- **Flanders DSI** (Digitale Stedenbouwkundige Informatie): all valid plans (gewestplan, APA/BPA,
  RUPs) as WFS **plus an RDF dump and a public SPARQL endpoint**
  (`https://data.dsi.omgeving.vlaanderen.be/sparql`,
  `datasets.omgeving.vlaanderen.be/...dsi.publiek.ttl`) — DOC 2026-08-31 via
  metadata.vlaanderen.be records + milieuinfo.be DSI wiki. This is the ONLY linked-open-data
  planning register found in this lane's 20 countries — evaluate as a rule-graph source before
  building extraction for Flanders.
- **Wallonia**: plan de secteur open on geoportail.wallonie.be (WMS/WFS, SPW licence) — DOC.
- **Brussels**: PRAS/affectation on datastore.brussels (CC0 family) — INTERNAL jurisdiction folder
  (`be/be-bru/`) + prior verification.
Numeric prescriptions (RUP voorschriften, Brussels RRU) remain **LEGAL-TEXT/PDF** attached to the
GIS objects. → LEGAL FORM: **GIS-ATTR + RDF** (Flanders), **GIS-ATTR** (Wallonia/Brussels), **PDF**
for numeric rules · Class **A/C/D** + **F** (rules) · **GREEN** · option **1/2**.

**Software note.** DSI itself is the platform story (government-run, SPARQL-queryable);
no Belgian parcel-to-envelope startup identified this pass. PRYZM already has be-bru/be-vlg
jurisdiction folders with Brussels/Antwerp city work — reuse, do not restart.

**Heatmap (lane estimate).** contextual3D **80%** (keyless DTM/DSM all regions + LoD1/LoD2 models)
· cadastre **90%** (open, keyless, live API in Flanders; annual federal snapshot) ·
planning-geometry **75%** (all three regions GIS-served) · rules **35%** (zone codes structured;
numeric values in prescription text; Flanders RDF raises the ceiling) · automation **50%** (3
adapters, all consumable; DSI SPARQL is genuinely automatable) · envelope **30%** (gewestplan/PRAS
category + heights derivable; setbacks/gabarits = F work) · confidence **70%** (2 live probes
today + founder-verified 2026-07-25 rows + existing city folders).

## IT — ITALY (priority)

**Cadastre.** Agenzia delle Entrate INSPIRE WFS — **PROBED 2026-08-31**:
`https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php?service=WFS&request=GetCapabilities`
live, WFS 2.0.0, **CC BY 4.0**, feature types `CP:CadastralParcel` + `CP:CadastralZoning` ONLY (no
buildings/addresses on the WFS), default CRS EPSG:6706, coverage national EXCEPT autonomous
provinces Trento/Bolzano (own systems — hard exclusion, separate adapters). Bulk download of
parcels+addresses nationwide since Feb 2025 (INTERNAL: it/findings/ITALY-MASTER-DATA-SOURCE-STUDY.md,
2026-07-23; >85M parcels). Geometry not survey-grade (internal caveat).
- Class **A+C+D** - **GREEN** - option **1/2** (WFS query + cache; bulk mirror for scale). NOTE for
the C63 register: the WFS is verified-live but still documented/unwired in
parcelProviders/registry.ts (INTERNAL it/COUNTRY-RATE.md).

**Buildings.** Cadastral fabbricati exist in the cadastre but are NOT served by the INSPIRE WFS
(probe above). No national LoD1/LoD2 product. Heights: PST LiDAR DSM-DTM partial national coverage
expanding (PNRR-funded), regional geoportal patchwork — INTERNAL row GEO-DATA-SOURCING-MASTER.md
verdict **IMPROVING**, re-check quarterly. Footprint fallback: OSM/Overture/EUBUCCO. - Class
**E** (heights) + **A** (footprints via cadastre bulk/OSM) - **GREEN** - option **5** (store
derived nDSM only).

**Planning.** Regional competence (Title V) — 19 regional laws + 2 autonomous provinces; the
operative planning INSTRUMENT differs by region (INTERNAL study headline). Machine-readable zoning
exists as REGIONAL/METRO mosaics, verified DOC 2026-08-31:
- Lombardy: PGT mosaic + MISURC (https://www.dati.lombardia.it/Territorio/PGT-Piani-di-governo-del-territorio/ijqk-ahfp)
- Piedmont: PRG mosaics per province, shp/gdb/dxf + Turin PRG zones WMS/WFS
  (https://www.geoportale.piemonte.it/geonetwork/srv/api/records/r_piemon:8092e59a-2bd2-4fed-a01d-b5376c3a3ecc)
- Metro Rome PRG mosaic (https://geoportale.cittametropolitanaroma.it/progetti/mosaico-dei-piani-regolatori)
Numeric parameters (indici di edificabilita, altezze, distanze) live in NTA PDFs per comune —
**PDF-locked**; national structured-fill est. **~9-11%** (INTERNAL it/LEGISLATION-RATE.md).
Heritage overlays (SITAP/Vincoli in Rete) are NATIONAL and one legal code — the one nationally
uniform layer (INTERNAL). - LEGAL FORM: **GIS-ATTR** (zone polygons, northern mosaics) +
**PDF/LEGAL-TEXT** (all numeric rules) - Class **A** (zones, where mosaicked) + **F** (rules) -
**GREEN** (CC BY / IODL regional) - option **2**.

**Software note.** No Italian parcel-to-envelope OSS/startup found this pass; the consumables are
the regional mosaics + dati.gov.it PRG datasets. Existing PRYZM city folders: Rome, Milan (+
CITIES notes for Bologna/Firenze/Torino) — reuse.

**Heatmap (lane estimate).** contextual3D **55%** (Tinitaly 10 m + partial PST 1 m; no national
building-height product — IMPROVING) - cadastre **80%** (live CC BY WFS + national bulk; minus
Trento/Bolzano + precision caveat) - planning-geometry **35%** (strong northern mosaics, patchy
centre/south) - rules **10%** (NTA PDFs; internal ~9-11% structured fill) - automation **15%**
(21 legal mechanisms = 21 adapter behaviours, internal) - envelope **15%** (zone + derived height
only where PST covers) - confidence **65%** (live cadastre probe + deep internal study).

## SE — SWEDEN (priority)

**Cadastre.** Lantmateriet fastighetsindelning became an **open HVD dataset in early 2025** — CC
BY 4.0, API + bulk download; the access gate is FREE registration (API key / OAuth2 client-creds),
not identity/BankID — checked 2026-08-31
(https://www.lantmateriet.se/sv/om-lantmateriet/press/nyheter/lantmateriets-arbete-mot-oppna-data-i-full-gang/,
https://giss.se/wp-content/uploads/2025/03/Oppna-data_HVD-Lantmateriet-20250304.pdf). This
CONFIRMS and extends the internal 2026-07-25 finding (STAC public / assets OAuth-gated / org
onboarding = the blocker; GEO-DATA-SOURCING-MASTER.md founder-action #1 still stands as the
transport). The "akt" (deed instrument) digital-access closure noted in the internal study remains
a live caveat for plan documents. - Class **A+C** - **GREEN** (registration gate recorded per
SE/DK lesson — the data is NOT missing) - option **2/4**.

**Buildings.** National Byggnad footprints (no height attribute) + derive LiDAR DSM-DTM (CC0) —
INTERNAL verified 2026-07-25. No national LoD2; city models exist per municipality (not assessed
this pass). - Class **A/E** - **GREEN** - option **5**.

**Planning.** MAJOR 2025 UPDATE over the internal 2026-07-24 study: digital detaljplaner are now
served to EVERYONE via Lantmateriet's **Nationella geodataplattformen (NGP)** — API + STAC, **CC
BY 4.0, free**, Basic Auth/OAuth2; **236 municipalities / 11,662 plans accessible as of Apr 2025**
(of 290 kommuner; pre-2022 stock stays scanned/PDF until converted) — checked 2026-08-31
(https://via.tt.se/pressmeddelande/3314956/digitala-detaljplaner-tillgangliga-for-alla-i-den-nationella-geodataplattformen,
https://www.lantmateriet.se/globalassets/temawebbar/ngp/datamangder/fragor-och-svar-om-detaljplaner-i-ngp.pdf,
https://www.lantmateriet.se/sv/kartor/vara-karttjanster/detaljplaner/). New plans are mandated
digital per BFS 2020:5 since 2022-01-01 and use Boverket's national
**Planbestammelsekatalogen** (machine-readable regulation catalogue WITH an open API —
https://www.boverket.se/sv/om-boverket/oppna-data/api-tjanst-for-andamalskatalogen/).
- LEGAL FORM: **STRUCT-OBJ + GIS-ATTR** (post-2022 plans — authoritative machine-readable, BRIEF
S3 class (1)) - **SCANNED/PDF** (older stock) - Class **A+C+D** - **GREEN** - option **1/2**.
Sweden is the second candidate (after DK) for the "structured-rule reference implementation" in
BRIEF S6 — answer the brief's DK question jointly with SE.

**Software note.** Metria (state-owned geodata services) is the incumbent integrator; Boverket's
catalogue API is the rule-vocabulary consumable. No SE parcel-to-envelope startup verified this
pass.

**Heatmap (lane estimate).** contextual3D **70%** (1 m LiDAR COG via STAC; OAuth org-onboarding
still the gate) - cadastre **80%** (open HVD 2025; registration + onboarding friction) -
planning-geometry **50%** (11.6k plans / 236 of 290 kommuner via one national API; stock scanned)
- rules **45%** (post-2022 plans carry structured bestammelser incl. numeric values, national
catalogue) - automation **55%** (ONE national API + STAC once onboarded) - envelope **35%**
(structured values where digital plans exist; else F-work) - confidence **65%** (2025 press+docs
verified today; API itself not probed — OAuth-gated).

## NO — NORWAY (priority)

**Cadastre.** Matrikkelen (one national register, Kartverket). Parcel geometry (Eiendomskart Teig)
WFS keyless, NLOD — INTERNAL verified live 2026-07-24 (no/findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md)
and wired live in parcelProviders/registry.ts (INTERNAL no/COUNTRY-RATE.md). **RE-PROBED LIVE
2026-08-31 (later same session)**: GetCapabilities returned WFS 2.0.0, title "Matrikkelen -
Eiendomskart Teig", 7 feature types (Teig, Eiendomsgrense, Teiggrensepunkt, Hjelpelinje,
Anleggsprojeksjonsflate/-grense/-punkt), response count limit 1,000,000 — the two earlier
HTTP 504s this session were TRANSIENT, as suspected; the keyless verdict stands. Full ownership/attribute API = free but
agreement-gated (matrikkel.no; INTERNAL). - Class **A+C** - **GREEN** (geometry), **YELLOW**
(ownership: agreement gate) - option **1/2**.

**Buildings.** Bygningspunkt (building points w/ matrikkel number) open; **FKB building footprints
are commercial — internal doctrine: do NOT license**; heights derived NDH DOM-DTM keyless NLOD
(INTERNAL GEO-DATA-SOURCING-MASTER.md). Footprints via OSM/Overture. - Class **A/E** - **GREEN**
(chosen path) / **RED** (FKB, avoided) - option **5**.

**Planning.** Strongest structural story in the Nordic set (INTERNAL study) — national SOSI plan
object catalogue legally mandated since 2009: plan types, hensynssone codes, density-calculation
method all national. NEW since the internal study, checked 2026-08-31: (a) from **1 July 2025**
every kommune MUST run a digital planregister available online with search/view/download services
(https://www.kartverket.no/en/geodataarbeid/planarbeid/forvaltning-av-planregister); (b) from
**1.1.2026** Direktoratet for byggkvalitet operates the national arealplankartlosning (NAP) with
reguleringsplan datasets; (c) "Reguleringsplaner (landsdekkende kopi)" exists as a nationwide
dataset (https://data.norge.no/en/datasets/44e7a49f-cd0c-363d-8030-0e58aa219239/) — access for
Norge digitalt parties via download/geosync/WMS/WFS (an AGREEMENT gate for the aggregated copy —
record the gate). Numeric values (%-BYA, heights) are per-plan but carried in the national SOSI
attribute model. - LEGAL FORM: **GIS-ATTR/STRUCT-OBJ** (SOSI plan) + **PDF** (bestemmelser text) -
Class **A+D** - **GREEN/YELLOW** (NLOD open vs Norge-digitalt agreement for the national copy) -
option **1/2**.

**Software note.** Norway produced the category-defining envelope startup: **Spacemaker (Oslo) →
acquired by Autodesk → Autodesk Forma** — the competitor benchmark for PRYZM Product B. Norkart =
dominant kommune-GIS SaaS. Treat Forma as the incumbent to differentiate against (massing/
optimisation, NOT rule-provenance or legal evidence chains).

**Heatmap (lane estimate).** contextual3D **80%** (NDH keyless + derive; Oslo already wired in
PRYZM) - cadastre **85%** (keyless geometry WFS, live-wired, re-probed live today; agreement-gated
ownership) - planning-geometry **70%** (national spec + mandatory online registers since 2025-07;
NAP 2026) - rules **40%** (national code lists + SOSI attrs; values per-plan, bestemmelser PDF) -
automation **55%** (one spec, ~357 municipal delivery points, NAP consolidating) - envelope
**40%** (utnytting/height attrs structured where plans digital) - confidence **75%** (deep
internal study + 2025/2026 regulatory changes verified today; WFS re-probed live after transient 504s).

## UK — UNITED KINGDOM (priority)

**Cadastre.** **No parcel cadastre.** HM Land Registry INSPIRE index polygons (OGL) are index
extents, not a legal parcel fabric; title data is paid; OS MasterMap is commercial (**RED — skip**,
internal doctrine). Scotland (ScotLIS/RoS) and NI (LPS) are separate estates. INTERNAL:
gb/COUNTRY-DATA-STRATEGY.md (2026-07-30). - Class **A** (index polygons) - **YELLOW** overall -
option **2**.

**Buildings.** OS open products + OSM footprints (OGL/ODbL); heights DERIVED EA DSM-DTM
(GBDEM pattern; England) — INTERNAL GEO-DATA-SOURCING-MASTER.md keyless row; OS Building Height
Attribute commercial (skip). Scotland/Wales/NI need their own LiDAR portal rows (internal). -
Class **E** - **GREEN** - option **5**.

**Planning.** Discretionary system — **no by-right numeric envelope exists to extract; the
LEGISLATION/ENVELOPE ceiling is structural** (INTERNAL, unchanged). What IS machine-readable:
**planning.data.gov.uk PROBED 2026-08-31** — live, **108 datasets** (conservation areas, green
belt, listed buildings, article 4, TPOs, local plan boundaries, design codes...), API + bulk, OGL
v3, England-only and self-declared incomplete. **FEATURE-LEVEL probe same session**:
`entity.json?dataset=conservation-area&limit=1` returned a real entity (Napsbury, designated
1996) with MULTIPOLYGON geometry + point + a `quality` field ("authoritative") — dataset total
10,994 conservation areas. Local plan POLICIES remain PDF/HTML documents.
- LEGAL FORM: **GIS-ATTR** (designations) + **PDF/HTML** (policy) - Class **A+C** (designations),
**F/G** (numeric rules: extractable constraints; by-right values genuinely missing) - **GREEN**
(OGL) - option **1/2**.

**Software note.** The most crowded commercial site-intel market in this lane — verified current
2026-08-31: LandTech/LandInsight (https://land.tech/), Searchland (https://searchland.co.uk/),
Nimbus Maps (https://www.nimbusmaps.co.uk/), LandLens, Urban Intelligence. They sell sourcing/
constraints/ownership aggregation — none produce a deterministic buildable envelope (the
discretionary system prevents it). Do NOT try to out-data these incumbents in the UK; the UK is a
Product-A market with a structurally capped Product B.

**Heatmap (lane estimate).** contextual3D **75%** (EA LiDAR + open footprints, England; 4 separate
estates) - cadastre **40%** (index polygons only; no open legal fabric) - planning-geometry
**55%** (one national designations API — probed; incomplete coverage) - rules **10%**
(discretionary; only Permitted Development is by-right) - automation **40%** (single API for
England designations) - envelope **10%** (structurally capped — internal doctrine confirmed) -
confidence **75%** (probed today + prior L516 deep dive).

## FI — FINLAND (priority)

**Cadastre.** MML (NLS) OGC API Features, open tier CC BY 4.0, free self-service API key; INSPIRE
buildings WFS is fully ANONYMOUS — INTERNAL verified 2026-07-25 (GEO-DATA-SOURCING-MASTER.md
founder-action #2) + fi/findings/FINLAND-MASTER-DATA-SOURCE-STUDY.md. Aland is a separate
jurisdiction (own registry — internal caveat). - Class **A+C** - **GREEN** - option **1/2**.

**Buildings.** Maastotietokanta footprints (anonymous INSPIRE WFS) + derive DSM-DTM (keyed WCS) —
INTERNAL. Ryhti: building information must be produced machine-readable from **1.1.2026**, stored
in the national system by 1.1.2029 — checked 2026-08-31 (ryhti.syke.fi). - Class **A/E** -
**GREEN** - option **5**.

**Planning.** **Ryhti** (SYKE) national built-environment information system: all new plans in the
national kaavatietomalli; **plan data served as OPEN DATA via an OGC API Features interface**
(https://ckan.ymparisto.fi/dataset/rakennetun-ympariston-tietojarjestelman-kaavatiedot — checked
2026-08-31); **VOOKA** converts the existing plan stock (vector index map of all valid plans +
retrieval of original documents); rollout phased through 2026
(https://ryhti.syke.fi/tietoa-jarjestelmasta/aikataulu-ja-kehittaminen/). INTERNAL estimate
stands: ~55-65% structured fill in Ryhti-live regions vs ~30-35% elsewhere (fi/LEGISLATION-RATE.md).
**PROBED 2026-08-31**: `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1/collections`
LIVE, ANONYMOUS, CC BY 4.0 — but the four open collections are plan INDEX layers
(asemakaava/yleiskaava hakemisto + in-preparation indexes), NOT the structured kaavatietomalli
plan objects; regulation-level open serving is not yet claimable from this channel — non-open
products sit behind a data-permit route (ryhti@syke.fi).
- LEGAL FORM: **STRUCT-OBJ** (kaavatietomalli, ISO 19109-based) + **SCANNED/PDF** (unconverted
stock) - Class **A+C+D** - **GREEN** - option **1**.

**Software note.** SYKE's Liiteri (built-environment analytics service) is the state analytics
layer; no Finnish parcel-to-envelope startup verified this pass. FI+SE+DK+NO together argue for
ONE "Nordic structured-plan adapter family" rather than four bespoke adapters.

**Heatmap (lane estimate).** contextual3D **75%** (2 m/10 m DEM keyed + anonymous footprints; city
LoD2 later) - cadastre **90%** (open, modern OGC API, nightly refresh — internal) -
planning-geometry **55%** (Ryhti live + VOOKA converting; phased) - rules **50%** (kaavatietomalli
structured regulations for new plans; legacy stock unconverted) - automation **55%** (one national
API, one data model) - envelope **35%** - confidence **70%** (docs verified today + internal
study + Ryhti OGC API probed live/anonymous — open collections are index-level only so far).

## CZ — CZECHIA (priority)

**Cadastre.** CUZK — **PROBED (page) 2026-08-31**
(https://cuzk.gov.cz/Uvod/Produkty-a-sluzby/Otevrena-data/Sady-otevrenych-dat.aspx): cadastral map
download per cadastral territory (SHP weekly, DGN/DXF daily, VFK monthly); **RUIAN** VFR monthly +
DAILY change files, nationwide; INSPIRE CP/BU/AD GML daily-on-change; INSPIRE WFS at
services.cuzk.gov.cz (https://services.cuzk.gov.cz/doc/inspire-cp-download.pdf). Free viewing at
nahlizenidokn.cuzk.cz. **Licence text NOT captured by the probe** — access is open/free and the
datasets are published as open data, but do not claim CC BY 4.0 for cadastral map/RUIAN until the
licence page is read at implementation. - Class **A+C+D** - **GREEN** (licence caveat recorded) -
option **2/3** (weekly SHP mirror + daily RUIAN change feed — the best incremental-update design
found in this lane).

**Buildings.** **RUIAN stavebni objekty carry technical attributes: pocet podlazi (floor count),
completion date, dwelling count, built-up area, floor area, structure type, utility connections** —
DOC 2026-08-31 (cuzk.gov.cz VFR structure docs + VDP building detail pages). Elevation: DMR5G
(DTM) / DMP1G (DSM) reported open — NOT verified this pass, confirm before wiring. - Class **A**
(floors = derived-levels input per the PRYZM honesty frame, NOT measured height) + **E** (nDSM
once DMR5G/DMP1G licence confirmed) - **GREEN** - option **3/5**.

**Planning.** **NGUP (Narodni geoportal uzemniho planovani)** launched 1 July (MMR;
https://uzemniplanovani.gov.cz/en/) — consolidates zasady uzemniho rozvoje, regulacni + uzemni
plany; built progressively since 2024; UAP layers deployed Jan 2026 (pilot); viewer mapy.gov.cz;
data models for submitted plans standardized, amended by Act 249/2025 Sb. (incl. acceleration
zones) — checked 2026-08-31 (Wikipedia NGUP + mmr.gov.cz + pupo.kr-vysocina.cz). New/changed plans
must follow the unified national standard; legacy stock is heterogeneous per municipality.
- LEGAL FORM: **GIS-ATTR** (standardized layers, new plans) + **PDF/LEGAL-TEXT** (older stock +
textual regulations) - Class **A+C** (emerging) + **F** (numeric rules) - **GREEN** - option **1/2**.

**Software note.** T-MAPY (municipal GIS/plan-portal vendor) dominates delivery; no CZ
parcel-to-envelope startup found this pass. Adapter against NGUP, do not scrape municipalities.

**Heatmap (lane estimate).** contextual3D **65%** (RUIAN buildings w/ floors + reported-open
national LiDAR DTM/DSM) - cadastre **90%** (open, daily-change feed, WFS; unconfirmed licence
text) - planning-geometry **45%** (NGUP consolidating; standard mandatory going forward) - rules
**25%** (standardized categories; numeric indices largely in text parts) - automation **45%** -
envelope **25%** - confidence **60%** (page probe + multi-source doc check; no WFS feature request).

## SI — SLOVENIA

**Cadastre.** GURS Kataster nepremicnin (merged land+building cadastre) — **CC BY 4.0, free
download via the Public Geodetic Data (JGP) app + public web services** — DOC 2026-08-31
(https://www.e-prostor.gov.si/en/access-to-geodetic-data/,
https://www.e-prostor.gov.si/podrocja/parcele-in-stavbe/kataster-nepremicnin/). - Class **A+C** -
**GREEN** - option **3**.

**Buildings.** The RICHEST open building register found in this 20-country lane: footprint,
**number of floors, floor geometry, lowest/highest elevation + characteristic height, gross floor
area, construction year, permitted use, utility connections** — DOC 2026-08-31 (same e-prostor
pages). Per the PRYZM honesty frame: register heights are surveyed/administrative — check
per-attribute provenance before classing as measured. National LiDAR (2011-2015 programme) NOT
re-verified this pass. - Class **A** - **GREEN** - option **3**.

**Planning.** National aggregated **namenska raba prostora (land use from all municipal OPNs) as
open WFS + SHP + WMS** — DOC 2026-08-31 (https://podatki.gov.si/dataset/namenska-raba-prostora,
https://eprostor.gov.si/imps/srv/api/records/c621af69-132f-47c0-80f0-0e03ad37ab12); PIS portal
(pis.eprostor.gov.si) catalogues prostorski akti. Numeric rules (prostorski izvedbeni pogoji: FZ,
FI, heights, setbacks) remain municipal act TEXT. - LEGAL FORM: **GIS-ATTR** (national land-use
WFS) + **PDF/LEGAL-TEXT** (PIP numerics) - Class **A+C** + **F** (rules) - **GREEN** - option **1/2**.

**Software note.** SiKataster QGIS plugin (https://plugins.qgis.org/plugins/si_kataster/) is the
community consumable; no SI envelope startup found. Small country + national WFS = one of the two
cheapest full-country adapters in this lane (with LU).

**Heatmap (lane estimate).** contextual3D **75%** (rich building register + LiDAR legacy) -
cadastre **95%** (free, CC BY, parcels+buildings in one register, web services) -
planning-geometry **65%** (national aggregated land-use WFS) - rules **25%** (PIP text-locked) -
automation **55%** (one register, one WFS, ~212 municipalities behind one aggregation) - envelope
**30%** - confidence **65%** (multi-page doc verification; WFS not feature-probed).

## LV — LATVIA

**Cadastre.** VZD Kadastrs — **open spatial data, SHP, updated WEEKLY** on data.gov.lv
(https://data.gov.lv/dati/dataset/kadastra-informacijas-sistemas-atvertie-dati) + HVD via
geolatvija.lv as **WMS/WFS + Atom GML bulk** — DOC 2026-08-31
(https://www.vzd.gov.lv/lv/kadastra-telpisko-datu-atversana). Licence: national open-data terms;
exact licence id not captured — confirm at implementation. - Class **A+C** - **GREEN** - option **2/3**.

**Buildings.** Cadastre includes building footprints; LGIA national LiDAR exists (reported open) —
NOT verified this pass; floors/height attribute presence unconfirmed. - Class **A/E** (candidate)
- **GREEN** (expected) - option **5** - honest gap: attribute schema unverified.

**Planning.** **TAPIS** — the single state territorial-development planning information system
(VARAM), published through geolatvija.lv; all municipal teritorijas planojumi flow through it, and
functional zoning follows a NATIONALLY UNIFIED classification; binding regulations (saistosie
noteikumi) publish as structured legal text on likumi.lv (HTML) — DOC 2026-08-31 (vzd.gov.lv +
geolatvija sources above). LV is the strongest "one national planning system" story among the
small countries in this lane. - LEGAL FORM: **GIS-ATTR** (functional zones, national codes) +
**HTML/LEGAL-TEXT** (numeric parameters per zone) - Class **A+C** + **F** - **GREEN** - option **1/2**.

**Software note.** None found this pass; TAPIS/geolatvija is itself the platform.

**Heatmap (lane estimate).** contextual3D **60%** (LiDAR reported + cadastre footprints;
unverified attrs) - cadastre **85%** (weekly open SHP + WFS/Atom) - planning-geometry **70%** (one
national system, national zone codes) - rules **35%** (parameters in structured-ish HTML legal
text — a good F-extraction target) - automation **55%** - envelope **30%** - confidence **55%**
(doc-verified, nothing feature-probed).

## LU — LUXEMBOURG

**Cadastre.** ACT PCN (Plan cadastral numerise) — WMS/WMTS **CC0**
(https://geocatalogue.geoportail.lu/geonetwork/geoportail-lu/api/records/cd6fd37d-afc8-4911-9641-e050650e39a9),
WFS services documented, geoportail.lu API — DOC 2026-08-31. Full vector parcel bulk-download tier
not confirmed this pass (historic shop products existed) — record the gap. - Class **A+C** -
**GREEN** (CC0 services) - option **1/2**.

**Buildings.** Cadastral building footprints via PCN; national LiDAR 2019 on data.public.lu
(reported; not verified this pass). - Class **A/E** - **GREEN** - option **5**.

**Planning.** Every commune's **PAG published as GML in a NATIONAL data model** (ministerial
regulation of 1 July 2016) on data.public.lu as per-commune open datasets (e.g.
https://data.public.lu/en/datasets/pag-ville-de-luxembourg/) + INSPIRE Land Use dataset — DOC
2026-08-31. The PAG model standardizes zone types and degree-of-land-use coefficients (COS/CUS
family); VERIFY attribute presence in a sample GML before claiming numeric-rule coverage. Written
parts (partie ecrite) per commune are PDF. - LEGAL FORM: **XML-GML** (national model) + **PDF**
(written parts) - Class **A+D** + **F** - **GREEN** - option **2/3**. LU is the only country in
this lane publishing plan GEOMETRY in one national GML model as per-commune open datasets — a tiny
market, but the cheapest possible "structured-rule country" pilot.

**Software note.** geoportail.lu API is the state platform; no startup found this pass.

**Heatmap (lane estimate).** contextual3D **70%** - cadastre **85%** (CC0 services; bulk-vector
question open) - planning-geometry **80%** (all communes, one GML model) - rules **45%**
(standardized model likely carries coefficients — unverified sample) - automation **60%** (one
model, ~100 communes) - envelope **40%** - confidence **55%** (doc-verified; no GML sample pulled).

## IE — IRELAND

**Cadastre.** **No parcel cadastre** — deeds/title system: Tailte Eireann (OSi + Property
Registration Authority + Valuation Office merged 2023). Registry boundaries are NON-CONCLUSIVE and
paid; OSi Prime2 large-scale mapping is commercial. No open parcel fabric found this pass. -
Class **A** (paid) - **RED/YELLOW** (commercial + non-conclusive boundaries) - option **6**.

**Buildings.** No national open footprint+height product found; OSM/Overture fallback; national
LiDAR is PARTIAL (OPW flood programmes). Honest low. - Class **E/G** - **YELLOW** - option **5**.

**Planning.** The genuine bright spot: **national harmonized zoning GIS is OPEN** — "Development
Plan (Land Use) Zoning, Ireland" + "Generalised Zoning Types (GZT)" composite across all local
authorities, WMS/Shapefile/GeoJSON/CSV via opendata.housing.gov.ie + Myplan.ie — DOC 2026-08-31
(https://opendata.housing.gov.ie/dataset/development-plan-land-use-zoning-ireland1,
https://www.myplan.ie/zoning-map-viewer/). GZT is a HARMONIZED overlay complementing (not
replacing) statutory zoning — treat as BRIEF S3 class (3) deterministic-inference input, not class
(1) authoritative. Numeric development standards (heights, plot ratio) live in development-plan
PDFs; Irish decisions are part-discretionary. - LEGAL FORM: **GIS-ATTR** (harmonized zoning) +
**PDF** (standards) - Class **A+C** + **F** - **GREEN** (zoning, CC-BY-family on data.gov.ie) -
option **2**.

**Software note.** UK incumbents (LandTech etc.) partially cover IE planning applications; no
IE-native envelope startup found this pass.

**Heatmap (lane estimate).** contextual3D **40%** (no full national open LiDAR; OSM footprints) -
cadastre **30%** (paid, non-conclusive; no open fabric) - planning-geometry **65%** (national open
harmonized zoning) - rules **15%** (PDF standards + discretion) - automation **30%** - envelope
**15%** - confidence **55%**.

## SK — SLOVAKIA

**Cadastre.** UGKK/GKU — cadastral map in open-data mode via **INSPIRE WMS + WFS (vector), daily
updated; cadastral parcels formally an HVD**; ZBGIS map client integrates cadastre + address
register (https://zbgis.skgeodesy.sk/mapka/sk/kataster); CC-BY-tagged datasets on data.gov.sk —
DOC 2026-08-31 (egako.eu UGKK paper + data.gov.sk + mirri.gov.sk). - Class **A+C** - **GREEN** -
option **1/2**.

**Buildings.** ZBGIS buildings layer; national LiDAR DMR 5.0 programme (2017-2023) reported open —
NOT verified this pass; no floors-rich open register confirmed (no CZ-RUIAN analogue found for
SK). - Class **A/E** (candidate) - **GREEN** (expected) - option **5**.

**Planning.** WEAKEST axis: no national machine-readable plan register live. The 2022-2025
construction-law reform created the Office for Spatial Planning and Construction with an
information-system digitization programme (~2028 horizon); municipal uzemne plany today =
per-municipality PDFs + scattered GIS. NOT probed beyond search this pass. - LEGAL FORM:
**PDF/SCANNED** (stock), reform in flight - Class **F/G** today - **YELLOW** - option **6**.

**Software note.** None found this pass; watch the state IS rollout (2026-2028) before building
any SK extraction pipeline.

**Heatmap (lane estimate).** contextual3D **60%** (ZBGIS + reported LiDAR) - cadastre **85%**
(HVD WFS daily) - planning-geometry **20%** (no national aggregation live) - rules **10%** -
automation **25%** - envelope **15%** - confidence **50%** (search-verified only; no probes).

## HR — CROATIA

**Cadastre.** DGU — Digitalni katastarski plan (DKP) as **WFS** per cadastral municipality
(https://catalog.uredjenazemlja.hr/katalogpodataka/digitalnikatastarskiplanwfs) incl. parcels,
land-use method AND cadastral buildings; **INSPIRE ATOM free bulk downloads since June 2023**
(addresses, DKP, land use) — DOC 2026-08-31 (dgu.gov.hr + catalog + LinkedIn DGU announcement).
Licence id not captured — confirm at implementation. - Class **A+C** - **GREEN** (expected) -
option **2/3**.

**Buildings.** DKP cadastral buildings (footprints); no national open height product confirmed;
LiDAR partial. OSM/Overture/EUBUCCO fallback + heights honest gap. - Class **A** (footprints) +
**G** (heights, pending national LiDAR verification) - option **5**.

**Planning.** **ISPU (Informacijski sustav prostornog uredenja)** — the national spatial-planning
information system (https://ispu.mgipu.hr/) connecting geoportal + cadastre + prostorni planovi;
**WMS + WFS network services for ISPU layers** — DOC 2026-08-31 (nipp.hr record 244 + mpgi.gov.hr).
National aggregation exists (rare in the Balkans); numeric provisions (odredbe za provodenje)
remain per-plan PDF. - LEGAL FORM: **GIS-ATTR** (namjena via ISPU) + **PDF** (provisions) - Class
**A+C** + **F** - **GREEN/YELLOW** - option **1/2**.

**Software note.** IGEA (Croatian GIS-portal vendor behind many county portals). No envelope
startup found.

**Heatmap (lane estimate).** contextual3D **50%** - cadastre **75%** (WFS + ATOM open; licence id
unconfirmed) - planning-geometry **60%** (ISPU national WMS/WFS) - rules **15%** (PDF provisions)
- automation **40%** - envelope **20%** - confidence **50%** (doc-verified; no probes).

## GR — GREECE

**Cadastre.** Hellenic Cadastre (Ktimatologio) INSPIRE geoportal (launched 2020): free discovery,
viewing, WMTS AND download of cadastral parcels (1:1000/1:5000) + open-data portal
data.ktimatologio.gr — DOC 2026-08-31 (gov.gr + eurogeographics + INSPIRE geoportal record).
**CAVEAT: national cadastre compilation is still INCOMPLETE** — coverage varies by area; the
forest-map and registration programmes are ongoing. Licence id not captured. - Class **A+C** -
**YELLOW-GREEN** (open access, incomplete fabric) - option **2**.

**Buildings.** No national open footprint+height product confirmed; DTM/orthophotos via
Ktimatologio; OSM/Overture/EUBUCCO fallback. - Class **E/G** - option **5**.

**Planning.** The weakest planning axis of the lane's larger countries: building terms (oroi
domisis — building coefficient, coverage, height) are set by decree published in the Government
Gazette (FEK) as **PDF/SCANNED text + diagrams**; no national machine-readable zoning register;
digitization programmes (e-Poleodomia family) in progress; geoportal.ypen.gr holds partial layers.
NOT probed beyond search this pass. - LEGAL FORM: **SCANNED/PDF/LEGAL-TEXT** - Class **F/G** -
**YELLOW** - option **6**.

**Software note.** None found this pass; Greek proptech focuses on transactions, not envelopes.

**Heatmap (lane estimate).** contextual3D **35%** - cadastre **55%** (open INSPIRE portal but
incomplete fabric + licence unconfirmed) - planning-geometry **15%** - rules **10%** (FEK
text-locked; a large future F/AI-extraction market, LL-quality Greek legal text) - automation
**15%** - envelope **10%** - confidence **45%**.

## HU — HUNGARY

**Cadastre.** **NOT open.** Cadastral map via Lechner Geoshop / TAKARNET — PAID, quarterly
updates, SHP/DXF/WMS (https://lechnerkozpont.hu/cikk/meg-tobb-formaban-erheto-el-az-ingatlan-nyilvantartasi-terkep);
the E-ING electronic land-registry transition is troubled (16 bn HUF, functions inaccessible,
"ready by 2026" per telex.hu 2025-10-25). Lechner announced NEW spatial data from the real-estate
registry (building geometry + block boundaries, countrywide) — openness/licence UNVERIFIED
(https://lechnerkozpont.hu/cikk/uj-teradatok-az-ingatlan-nyilvantartasbol). INSPIRE view service
exists. - Class **A** (paid) - **YELLOW/RED** - option **6** - record the FEE GATE, not "missing"
(SE/DK lesson).

**Buildings.** Registry building geometry per the Lechner release (licence unverified); no open
national heights. - Class **A?/G** - option **6**.

**Planning.** E-TER (Lechner's national spatial-planning e-system) holds telepulesrendezesi
tervek nationally; OTEK provides the national framework regulation; public machine-readable
access UNVERIFIED this pass — plans are documents + local decrees (HEK/onkormanyzati rendelet
text). - LEGAL FORM: **PDF/LEGAL-TEXT** (+ system-internal GIS) - Class **F** - **YELLOW** -
option **6**.

**Software note.** Lechner Tudaskozpont is the state monopolist for both cadastre AND planning
delivery — the country adapter is effectively a Lechner-relationship problem, not a scraping
problem.

**Heatmap (lane estimate).** contextual3D **30%** - cadastre **35%** (paid gate; E-ING turbulence)
- planning-geometry **30%** (E-TER exists; access unverified) - rules **10%** - automation **20%**
- envelope **10%** - confidence **40%** (search-verified only).

## RO — ROMANIA

**Cadastre.** ANCPI geoportal — ArcGIS Server REST + INSPIRE view/download services; parcels
(Parcele cadastrale) and buildings (Constructii) queryable via REST returning GeoJSON — DOC
2026-08-31 (https://github.com/tangojo/ancpi-wrapper-cli/blob/main/ancpi-gis-endpoints.md — a
community wrapper documenting the endpoints — + eurogeographics + geoportal.ancpi.ro). **CAVEAT:
systematic land registration is INCOMPLETE nationally** — queryable does not mean complete; check
per-AOI coverage. Licence terms not captured. - Class **A+C** - **YELLOW-GREEN** - option **1/6**
(query dynamically; do not mirror an incomplete fabric).

**Buildings.** Constructii layer on the same REST services (footprints); no open national heights.
- Class **A** + **G** (heights) - option **5**.

**Planning.** In transition, with a REAL 2024 standard: MDLPA's **Date Locale platform publishes
technical norms for GIS-format PUG/PUZ (v1.1, 15.07.2024)** —
https://datelocale.mdlpa.ro/ro/about/tehnic_planurb/ (checked 2026-08-31); new/updated plans move
to interoperable GIS; the STOCK is CAD/PDF per municipality. - LEGAL FORM: **PDF/SCANNED** (stock)
moving to **GIS-ATTR** (2024+ standard) - Class **F** today, **A** emerging - **YELLOW** - option
**6→2**.

**Software note.** **QMAP (qmap.ro)** converts PUG/PUZ/PUD from CAD/PDF/analog into
georeferenced, thematically-stratified GIS — a Romanian company doing exactly the
document-to-GIS extraction PRYZM's Product B needs; evaluate PARTNER/CONSUME before building RO
extraction in-house.

**Heatmap (lane estimate).** contextual3D **35%** - cadastre **55%** (live REST; incomplete
registration) - planning-geometry **25%** (standard exists since 2024-07; stock PDF) - rules
**10%** - automation **25%** - envelope **15%** - confidence **50%**.

## BG — BULGARIA

**Cadastre.** GCCA (AGKK) KAIS portal (https://kais.cadastre.bg/) — free map viewing + free
queries/auto-generated PDF reports; INSPIRE services for admin units, parcels, buildings (WMS
confirmed; WFS confirmed only for geographic names this pass); official extracts are PAID
services. Urban coverage of the KKR is substantially complete; licence/open-data status only
partial. - Class **A+C** - **YELLOW** - option **6** (metadata + on-demand; no open bulk found).

**Buildings.** Cadastre includes buildings (KAIS layers); no open national heights. - Class **A**
(gated) + **G** (heights) - option **6**.

**Planning.** Ustroystveni planove (OUP/PUP) per municipality; **no national machine-readable
register**; Sofia has its own planning GIS (Sofiaplan/sofia-agk); elsewhere PDF/DWG per
municipality. - LEGAL FORM: **PDF/SCANNED** + city GIS islands - Class **F/G** - **YELLOW** -
option **6**.

**Software note.** None found this pass.

**Heatmap (lane estimate).** contextual3D **30%** - cadastre **50%** (free viewing + INSPIRE WMS;
paid extracts, no confirmed open bulk) - planning-geometry **15%** (Sofia island only) - rules
**5%** - automation **15%** - envelope **10%** - confidence **45%**.

## MT — MALTA

**Cadastre.** **No complete cadastre** — land registration is compulsory only in designated areas;
no open parcel fabric exists. The Planning Authority is the INSPIRE competent authority (MSDI,
https://msdi.data.gov.mt/). This is an honest structural zero for the parcel axis. - Class **G**
(parcel fabric) - **RED** (unavailable, not merely gated) - option **6**.

**Buildings.** PA mapserver (https://pamapserver.pa.org.mt/) layers; no LoD/height open product
confirmed. OSM fallback. - Class **E/G** - option **5**.

**Planning.** The 7 Local Plans + policy maps are served through the PA map server; Maltese local
plans DO specify per-area height limitations (storeys) on policy maps — i.e. numeric-ish zoning
exists; MSDI lists 15 planning-cadastre records incl. land use + area-management zones — DOC
2026-08-31. Open DOWNLOAD/licence unverified. - LEGAL FORM: **GIS-ATTR** (viewer) + **PDF**
(policies) - Class **A** (gated viewer) + **F** - **YELLOW** - option **6**.

**Software note.** None found; the PA is both regulator and data platform.

**Heatmap (lane estimate).** contextual3D **25%** - cadastre **10%** (no complete cadastre — the
lane's honest near-zero) - planning-geometry **40%** (PA mapserver national by construction —
tiny territory) - rules **20%** (height-in-storeys on policy maps) - automation **15%** - envelope
**15%** - confidence **40%**.

## CY — CYPRUS

**Cadastre.** DLS Portal (https://portal.dls.moi.gov.cy/) — national digital cadastre with
parcels + buildings + INSPIRE geoportal; free viewing; bulk/extract terms historically paid —
tiers not verified this pass. - Class **A+C** - **YELLOW-GREEN** - option **6/1**.

**Planning (the CY headline).** The DLS portal serves **planning zones (poleodomikes zones) as
GIS layers**, and Cypriot planning zones carry NUMERIC parameters per zone code (building
coefficient, coverage, storeys, height) in the published zone tables — the zone-polygon +
zone-code -> coefficient-table join is one of the most automatable numeric-envelope paths among
this lane's small countries. Attribute sample NOT pulled this pass — verify whether coefficients
ride ON the layer or only in companion tables. - LEGAL FORM: **GIS-ATTR** (zones) +
**STRUCT-OBJ/PDF** (coefficient tables) - Class **A+E** - **YELLOW** (access tiers) - option **2**.

**Buildings/heights.** DLS building layers; no open LiDAR/nDSM confirmed. - Class **A/G** -
option **6**.

**Software note.** DLS-Portal itself is showcased as a national model (Eurogeographics case
study); no local startup found.

**Heatmap (lane estimate).** contextual3D **30%** - cadastre **65%** (national digital cadastre
incl. buildings; access tiers) - planning-geometry **55%** (zones GIS national) - rules **40%**
(zone->coefficient join; sample unverified) - automation **40%** - envelope **35%** - confidence
**45%**.

---

## LANE SUMMARY — 20-country heatmap (lane estimates, 2026-08-31)

| CC | ctx3D | cadastre | plan-geo | rules | autom. | envelope | conf. | One-line verdict |
|----|------|----------|----------|-------|--------|----------|-------|------------------|
| AT | 70 | 85 | 40 | 15 | 25 | 20 | 55 | Open CC BY cadastre snapshots; planning = 9-Lander patchwork, rules PDF |
| BE | 80 | 90 | 75 | 35 | 50 | 30 | 70 | Keyless everything; Flanders DSI has RDF+SPARQL plans |
| BG | 30 | 50 | 15 | 5 | 15 | 10 | 45 | Free viewing, paid extracts; planning per-municipality PDF |
| HR | 50 | 75 | 60 | 15 | 40 | 20 | 50 | INSPIRE ATOM bulk since 2023; ISPU national plan WMS/WFS |
| CY | 30 | 65 | 55 | 40 | 40 | 35 | 45 | Zones GIS + numeric coefficient tables = automatable join |
| CZ | 65 | 90 | 45 | 25 | 45 | 25 | 60 | Daily-change cadastre feed; RUIAN floors; NGUP consolidating |
| FI | 75 | 90 | 55 | 50 | 55 | 35 | 70 | Ryhti/kaavatietomalli = structured-rule country in rollout |
| GR | 35 | 55 | 15 | 10 | 15 | 10 | 45 | Incomplete cadastre; rules FEK-scanned; big AI-extraction market later |
| HU | 30 | 35 | 30 | 10 | 20 | 10 | 40 | Paid Lechner gate on cadastre; E-ING transition troubled |
| IE | 40 | 30 | 65 | 15 | 30 | 15 | 55 | No cadastre; national harmonized zoning GIS is open |
| IT | 55 | 80 | 35 | 10 | 15 | 15 | 65 | Live CC BY cadastre WFS; rules NTA-PDF, 21 mechanisms |
| LV | 60 | 85 | 70 | 35 | 55 | 30 | 55 | Weekly open cadastre + TAPIS single national plan system |
| LU | 70 | 85 | 80 | 45 | 60 | 40 | 55 | All PAGs in ONE national GML model — cheapest pilot |
| MT | 25 | 10 | 40 | 20 | 15 | 15 | 40 | No complete cadastre (honest zero); PA mapserver plans |
| NO | 80 | 85 | 70 | 40 | 55 | 40 | 75 | SOSI-standardized plans; registers mandatory online 2025-07 |
| RO | 35 | 55 | 25 | 10 | 25 | 15 | 50 | REST cadastre, incomplete fabric; 2024 GIS-PUG standard; QMAP |
| SI | 75 | 95 | 65 | 25 | 55 | 30 | 65 | Richest open building register (floors+heights+GFA+use) |
| SK | 60 | 85 | 20 | 10 | 25 | 15 | 50 | HVD cadastre WFS; planning digitization only ~2028 |
| SE | 70 | 80 | 50 | 45 | 55 | 35 | 65 | HVD cadastre 2025 + NGP detaljplan API open to all |
| UK | 75 | 40 | 55 | 10 | 40 | 10 | 75 | Product-A market; envelope structurally capped (discretionary) |

## CROSS-COUNTRY SYNTHESIS (what the REPORT should carry from this lane)

1. **Tiering by adapter economics, not by market size.**
   - **Tier 1 (structured-rule, consume now):** SE (NGP API + planbestammelsekatalog), FI (Ryhti),
     NO (SOSI + NAP 2026), LU (PAG national GML), LV (TAPIS), SI (national land-use WFS). All six
     publish plan GEOMETRY through ONE national channel; four of six standardize the rule
     vocabulary nationally. One "Nordic+Baltic structured-plan adapter family" covers them.
   - **Tier 2 (GIS zoning, text rules — F-extraction):** BE, AT (Vienna/OO), CZ (NGUP), HR (ISPU),
     IE (GZT), CY (zone-coefficient join). Zone polygons machine-readable; numeric values need
     document extraction with evidence provenance.
   - **Tier 3 (document-locked or gated):** IT (NTA PDFs x ~7,900 comuni), UK (discretionary —
     cap, don't fight it), GR/BG/RO/SK (PDF stock; RO+SK reforms in flight), HU (fee gate), MT
     (no cadastre).
2. **2024-2026 is a step change, not drift.** Five NEW national machine-readable planning channels
   in/for this lane's countries: SE NGP open-to-all (2025), CZ NGUP (2024-2026), NO planregister
   mandate (2025-07) + NAP (2026-01), RO GIS-PUG standard (2024-07), FI Ryhti rollout
   (2024-2029). Any architecture PRYZM fixes must assume country machine-readability IMPROVES
   mid-life — the adapter interface needs a "source class upgrade" path (BRIEF S3 classes 1-6 per
   rule, versioned).
3. **The cadastre axis is basically SOLVED for 15 of 20 countries** (open or registration-gated
   API/bulk). The exceptions are structural, not technical: UK/IE (no cadastre by design), MT
   (incomplete), HU (fee gate), GR/RO/BG (incomplete fabric or paid extracts). Do not budget
   cadastre acquisition work outside those six.
4. **The rules axis is where every country converges on the same honest number: 5-50%.** No
   country in this lane serves complete numeric envelope parameters as class-(1) authoritative
   machine-readable data. The countries closest: CY (zone-coefficient tables), SE/FI (new-plan
   structured bestammelser/kaavamaaraykset), LU (PAG model). This is exactly PRYZM's H-class IP
   territory per the BRIEF: rule extraction + evidence graph + applicability engine.
5. **Incumbent watch:** Autodesk Forma (ex-Spacemaker, NO) owns the massing/optimisation category;
   UK aggregators (LandTech/Searchland/Nimbus) own constraint aggregation. NONE ship rule-level
   provenance ("why is max height 18 m, per which article"). QMAP (RO) is a potential
   partner/model for document-to-GIS conversion at scale.
6. **Licence pattern:** CC BY 4.0 dominates (AT, IT, SI, SE, FI cadastres); CC0 in BE-Brussels +
   LU; national open licences (NLOD, OGL) equivalent-GREEN; the RED items are consistently
   COMMERCIAL SURVEY PRODUCTS (OS MasterMap, NO FKB, HU Geoshop, OSi Prime2) — the internal
   doctrine "derive from open LiDAR instead of licensing survey products" generalises across the
   whole lane.

## PROBE LEDGER (live HTTP this session, 2026-08-31)

| Endpoint | Result |
|---|---|
| data.wien.gv.at/daten/geo WFS GetCapabilities | LIVE — ~350+ FTs incl. zoning + Baukorpermodell, CC BY 3.0 AT |
| geo.api.vlaanderen.be/GRB/ogc/features/collections | LIVE keyless — ADP + GBG collections, GeoJSON/GML/GPKG |
| financien.belgium.be open-patrimoniumdata page | LIVE — CC BY + public-domain-style transfer, commercial OK |
| wfs.cartografia.agenziaentrate.gov.it INSPIRE WFS GetCapabilities | LIVE — CP:CadastralParcel/Zoning, CC BY 4.0 |
| planning.data.gov.uk/dataset/ | LIVE — 108 datasets, OGL v3, API; England-only, incomplete |
| wfs.geonorge.no matrikkelen-eiendomskart-teig GetCapabilities | LIVE on re-probe (same session) — WFS 2.0.0, 7 FTs incl. Teig; two earlier 504s were transient |
| geo.api.vlaanderen.be GRB /collections/ADP/items?limit=1 | LIVE keyless — real parcel feature, CAPAKEY/NISCODE schema (FEATURE-LEVEL) |
| planning.data.gov.uk entity.json?dataset=conservation-area&limit=1 | LIVE — real entity w/ MULTIPOLYGON + quality field; 10,994 total (FEATURE-LEVEL) |
| paikkatiedot.ymparisto.fi ryhti_plan OGC API /collections | LIVE anonymous, CC BY 4.0 — 4 collections, all plan INDEX layers (not plan objects) |
| cuzk.gov.cz open-data page | LIVE — dataset/format/update matrix captured; licence text not on page |
| data.bev.gv.at (SPA landing) | Fetch returned title only — use GeoNetwork API records instead |
| ryhti.syke.fi/en/ | LIVE — system overview; API details only in Finnish docs |

## HONEST GAPS (what this lane did NOT do)

- FEATURE-LEVEL probes (items requests returning real geometry/attributes) were run for BE (GRB
  ADP) and UK (planning.data.gov.uk entity API) only; all other countries remain at
  capabilities/catalog level. Per the GetCapabilities-is-not-an-inventory lesson, a
  DescribeLayer/feature sweep per country is the next depth step.
- Licence IDs unconfirmed for: CZ (cadastral map/RUIAN), HR, LV, GR, RO, BG, CY, MT — marked
  inline; none blocked on plausibility, all blocked on verbatim licence text.
- Gated APIs not exercised: SE NGP (OAuth), NGUP WFS, TAPIS WFS, ISPU WFS. (Ryhti OGC API WAS
  exercised — anonymous — but its open collections are index-level only; the plan-object channel
  remains unexercised.)
- CH is NOT in this lane (other lane covers DE/DK/CH/ES/FR/PT/LT/EE/NL/PL per BRIEF S6).
- Pan-European fallbacks (EUBUCCO, Overture, Microsoft footprints, Copernicus) referenced but not
  audited here — BRIEF S7-8 lane owns them.
- Startup scan was one-line-deep per country by design; only UK produced a verified competitive
  set. A 2025-2026 GitHub/CORDIS sweep for the smaller countries was not run.
