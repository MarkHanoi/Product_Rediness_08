# E5 LANE 1 — NATIONAL AS-IS PATTERN SWEEP (the rich-Catastro pattern across Europe)

> Lane: asis-pattern-sweep · E5 data-reuse investigation · researched 2026-09-01.
> Authority: `../E5-DATA-REUSE-BRIEF.md` §1 (A-vs-B separation binding: everything in this file
> is AS-IS CONTEXT — what physically exists; nothing here implies development-potential
> provision), §3 (the pattern question), §9 (no core expansion — every source below is an INPUT
> to the existing Source-Registry/adapter architecture, never a new canonical entity).
> Method: the ORIGINAL audit lanes (`../lanes/`) are cited by row wherever they already proved a
> fact — this file re-derives NOTHING they proved; net-new work is marked **E5-PROBED** (live
> request this lane, 2026-09-01) or **E5-SEARCHED** (web evidence read this lane, dated).
> NOT CONFIRMED stays NOT CONFIRMED.
>
> CLASS letters (per E5 brief lane-1 tasking, NOT the old audit's A–H letters):
> **A** authoritative-machine (open machine-readable from the authority) ·
> **B** access-constrained (exists at the authority, gated: key/identity/fee/agreement) ·
> **C** visual-only (viewer/WMS/PDF — consumable by eyes or extraction, not as data) ·
> **D** derivable (Pryzm computes it from open inputs: nDSM, floors×3m, conflation).
>
> The question asked per country (brief §3): does an equivalent of the rich-Catastro AS-IS
> pattern exist — cadastral BUILDING geometry (not just parcels) · FLOOR-LEVEL geometry ·
> LoD2/3D cadastral buildings · height · floor distribution · building use?

## Status: COMPLETE — see end-of-file summary.

---

# PART 1 — NET-NEW E5 PROBES (the gaps the audit lanes left)

## E5-1 · DE — the cadastre HAS a storey-count slot; it is EMPTY where probed — **E5-PROBED 2026-09-01**

- `DescribeFeatureType ave:GebaeudeBauwerk` on the wired NRW WFS
  (`https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht`, registry row `de-nrw-alkis-wfs`):
  the ALKIS-vereinfacht 2.0 schema carries **`anzahlgs` (integer, minOccurs=0)** = above-ground
  storey count, plus `funktion` (use, plain-text codelist values), `gebnutzbez`, `rellage`,
  MultiSurface geometry — i.e. the schema SHAPE of the rich-Catastro pattern (building geometry +
  use + floors) exists in the German cadastre product.
- **Fill measured: 0/500.** GetFeature Cologne centre bbox (200 features) + Düsseldorf residential
  bbox (300 features), 2026-09-01: `anzahlgs` populated **0 of 500**; `funktion` populated
  500/500 (values e.g. "Gemischt genutztes Gebäude mit Wohnen" 68, "Wohngebäude" 23…).
- **Verdict:** DE cadastral building geometry + USE = class **A** (same keyless WFS as parcels);
  floor DISTRIBUTION from the cadastre = **not delivered in NRW samples** — floors/heights stay
  class **D** via LoD2 `measuredHeight` (registry row `de-nrw-lod2-citygml-tiles`, lane 2 DE-5)
  ÷ ~3 m, or census joins. Do not claim ALKIS floors without probing the target Land's fill.

## E5-2 · IT — cadastral building geometry EXISTS but is WMS-only (visual) — **E5-PROBED 2026-09-01**

- `https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php?REQUEST=GetCapabilities`
  → layer **`fabbricati` (Fabbricati)** live alongside CP.CadastralParcel/CadastralZoning, acque,
  strade. The WFS twin serves **parcels + zoning ONLY** (L5 sweep IT re-probe 2026-08-31, cited).
- **Verdict:** IT cadastral BUILDING geometry = class **C (visual-only)** via WMS; machine
  building geometry for Italy remains OSM/Overture/EUBUCCO or regional LoD (class D conflation).
  The national bulk product (>85M parcels, Feb 2025) is parcels+addresses, not fabbricati
  (sweep IT row). Floor-level: `planimetrie catastali` (per-unit floor plans) exist but are
  owner/delegate-gated (Sister/Entratel) → class **B**, not a data channel — see E5-6.

## E5-3 · PL — the 3D entry point CAPTURED (lane 4 open item, partially closed) — **E5-PROBED 2026-09-01**

- `https://mapy.geoportal.gov.pl/wss/service/PZGIK/FOTO/WMS/ModeleBudynkow3D?REQUEST=GetCapabilities`
  → LIVE; layers **`Modele_3D_budynkow_LoD1_2024` / `_2022` / `_2021` / `_2019` +
  `Modele_3D_budynkow_LoD2_2017`** — the vintage set matches lane 4 PL-5's DOC claim
  (LoD1 4 vintages + LoD2). Candidate direct-bulk paths
  `opendata.geoportal.gov.pl/ModeleBudynkow3D/` and `/InneDaneUdostepniane/ModeleBudynkow3D/`
  both **404** — per GUGiK's own instruction PDF
  (`gugik.gov.pl/__data/assets/pdf_file/0011/94691/Instrukcja-pobierania-Modeli-3D.pdf`,
  E5-SEARCHED 2026-09-01) download links are exposed through the map UI "Identification" tool
  per area. **Verdict: class A data, UI-mediated bulk** — capture per-powiat URLs at bake time;
  the plain-URL GeoParquet story (registry row `pl-bdot10k-buildings-geoparquet`, HTTP 200,
  78.6 MB national) remains the machine channel for footprints+storeys attributes.

## E5-4 · FI — a national LoD2 CityGML product EXISTS, coverage PARTIAL — **E5-SEARCHED 2026-09-01**

- NLS/MML **"Buildings 3D"**: LoD2 CityGML (JHS210), produced from the national laser-scanning
  programme over KMTK 2D building vectors, **CC BY 4.0**, updated annually, download via MapSite
  + OGC API Processes file service
  (maanmittauslaitos.fi/en/…/product-descriptions/buildings-3d, fetched 2026-09-01).
- ⚠ The product page (last-updated **2022-01-27**) says coverage = "a few example areas",
  extending as the laser-scanning programme proceeds; live coverage map at
  `tilannekartta.maanmittauslaitos.fi/3drakennukset` — **current national coverage NOT
  CONFIRMED this lane; read the status map before relying.** Complements the sweep FI row
  (anonymous INSPIRE BU footprints + keyed DSM/DTM → derive).

## E5-5 · FR — cadastral BUILDING geometry is open BULK (Etalab), not just BD TOPO — **E5-PROBED 2026-09-01**

- `https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/33/33063/cadastre-33063-batiments.json.gz`
  → **HTTP 200, 4,676,262 bytes** (Bordeaux; `latest` redirects to vintage **2026-06-01** on the
  OVH mirror). The Etalab PCI-vector bundle serves a **`batiments`** layer per commune alongside
  parcelles/sections — cadastral building polygons, Licence Ouverte 2.0, plain-URL bulk.
  ⚠ Path shape is `/communes/{dep}/{insee}/…` — the department segment is REQUIRED (404 without).
- So FR building geometry has TWO open channels: Etalab cadastre bâtiments (cadastral, bulk) +
  BD TOPO `batiment` with `hauteur` + `nombre_d_etages` (registry row `fr-ign-bdtopo-batiment-wfs`,
  lane 3 FR-4). Plus the pre-computed **MNH LiDAR HD** height raster (lane 3 FR-4 UPGRADE).
  **FR = class A across geometry/height/floors** (floors via BD TOPO attribute where filled).

## E5-6 · CH — the GWR register bulk is OPEN, whole-country, refreshed DAILY — **E5-PROBED 2026-09-01**

- `https://public.madd.bfs.admin.ch/ch.zip` → HTTP 200 HEAD, **Content-Length 946,164,577,
  Last-Modified 2026-09-01 03:33 GMT** (today) — the federal Gebäude- und Wohnungsregister
  (BFS/MADD) whole-country CSV bulk, keyless. GWR carries per-building **EGID, floor count
  (GASTW), category/class (use), construction year, footprint area, dwelling records** —
  point-located, joinable to AV footprints / swissBUILDINGS3D by EGID.
  (Search trail: housing-stat.ch MADD csv page + opendata.swiss GWR datasets, 2026-09-01;
  the L5-era lead `liip/open-swiss-buildings-api` (lane 2 CH-4) is an OSS wrapper over exactly
  this.) **Verdict: CH floor-distribution + use = class A** — closes the one axis the lane 2
  CH verdict left implicit (its CONTEXT-GREEN verdict cited swisstopo products only).
  ⚠ Field-level licence/terms of public.madd not read this lane — GREEN-expected under the
  2021 OGD regime, confirm the MADD terms page when wiring.

## E5-7 · ⭐ SI — FLOOR-LEVEL GEOMETRY CONFIRMED LIVE: the second FXCC-class country — **E5-PROBED 2026-09-01**

The L5 sweep graded SI's building register "richest open register" at DOC level only. E5 probed it:

- `https://ipi.eprostor.gov.si/wfs-si-gurs-kn/ows?service=WFS&request=GetCapabilities` → **200,
  WFS 2.0.0, ~75 feature types** in the merged Kataster nepremičnin namespace, including
  **`SI.GURS.KN:STAVBE`** (buildings) · **`STAVBE_OBRIS`** (outline) · **`DELI_STAVB`**
  (building parts/units) · **`ETAZE`** (FLOORS) · `ETAZE_X_DELI_STAVB` · **`PROSTORI`** (rooms)
  · `PARCELE` · `NAMENSKE_RABE`/`DEJANSKE_RABE` (planned/actual use per parcel) · `_H` history
  twins of nearly everything (state-served temporal versioning).
- **`ETAZE` schema (DescribeFeatureType):** `EID_ETAZA`, `STEVILKA_ETAZE` (floor number),
  `EID_STAVBA` (building id), **`NADMORSKA_VISINA`** (floor altitude m), **`VISINA_ETAZE`**
  (floor height m), **`GEOM`** (GeometryPropertyType), `POVRSINA` (m²), ground-floor flag.
- **Live GetFeature (Ljubljana 1 km² bbox, EPSG:3794): numberMatched 2,307 ETAZE**; sample:
  floor 8 of building `100200000214377745` @ altitude 311.5 m, floor height 2.5 m, area
  317.3 m². ⚠ GEOM is nillable and was present on 1 of the 2 sampled features — floor
  geometry fill varies; measure fill before relying (context-data-honesty).
- **`STAVBE` schema:** `STEVILO_ETAZ` (floor count), `STEVILO_STANOVANJ` (dwellings),
  **`BRUTO_TLORISNA_POVRSINA`** (existing GFA!), `TIP_STAVBE` typology, utility connections.
- Licence: **CC BY 4.0** (podatki.gov.si/dataset/kataster-nepremicnin, fetched 2026-09-01);
  bulk via the JGP app (sweep SI row).
- **Verdict: Slovenia is the FIRST country outside Spain where per-FLOOR geometry + per-floor
  height + existing GFA are served openly, machine-readable, keyless — class A across the whole
  rich-Catastro pattern, ARGUABLY RICHER than Catastro (floor altitude + floor height are
  explicit numbers, not FXCC drawing extraction).** SI is not in the Source Registry (absence
  row cites "no dated endpoint probe" — this probe IS that endpoint evidence, dated).

## E5-8 · IT — no cadastre-3D programme; sheets are identity-gated — **E5-SEARCHED 2026-09-01**

- No "catasto 3D" programme found (search 2026-09-01: AdE 2025/2026 system documents describe
  vector cartography + orthoimagery integration, nothing 3D). **NOT FOUND ≠ proven absent, but
  nothing to consume today.**
- New since Nov 2025: per-sheet cadastral map download (CXF/CML/DXF/GeoJSON — full map content)
  via the AdE reserved area, **SPID/CIE/CNS identity-gated**, links expire in 5 days
  (gisinfrastrutture.it 2025/11 article, fetched 2026-09-01) → class **B**, not an ingest
  channel. The open whole-country CC BY 4.0 bulk remains parcels+addresses (sweep IT row).
- IT building geometry verdict stands: **C (WMS fabbricati, E5-2) / D (OSM/Overture/EUBUCCO
  conflation + regional LoD)**; floors/use: cadastral planimetrie are class B (owner/delegate).

## E5-9 · Aggregation projects — EUBUCCO v0.2 IS RELEASED; GlobalBuildingAtlas is new — **E5-SEARCHED 2026-09-01**

- **EUBUCCO v0.2 is OUT** (docs.eubucco.com/v0.2/, fetched 2026-09-01) — updates lane 1 §C.2's
  '"spring 2026" UNVERIFIED' row: **322M+ buildings, EU-27 + NO + CH + UK, 55 source datasets
  (govt registries 62.2% / OSM 17.4% / Microsoft 20.4%), Parquet on S3-compatible MinIO +
  Zenodo, CLI/Python/DuckDB access.** ⚠ The "100% attribute completeness" headline is
  ML-IMPUTATION: height ground-truth 43.2% (ML 56.7%), floors ground-truth 16.6% (ML 79.9%),
  type ground-truth 38.1% (ML 54.5%); construction year stays 15.9% total. **Never present
  EUBUCCO floors/heights as authoritative — provenance-tier the attribute (Ground Truth vs ML)
  exactly as its own schema does.** Licence field not restated on the v0.2 docs page — v0.1 was
  ODbL with RED pockets (lane 1 §C.2); re-read per-dataset licences before commercial reliance.
- **GlobalBuildingAtlas (TUM, ESSD 17-6647-2025)** — NEW since the audit: global **2.75B
  building polygons + LoD1 models (2.68B, height completeness >97%, RMSE 1.5–8.9 m by
  continent) + 3 m global height raster**; GeoJSON/GeoTIFF in 5°×5° tiles via mediaTUM
  (doi 10.14459/2025mp1782307) + source.coop mirror (`tge-labs/globalbuildingatlas-lod1`);
  code github.com/zhu-xlab/GlobalBuildingAtlas. **Class D-grade heights (satellite-ML), a
  fallback BELOW national LoD2/nDSM and BELOW EUBUCCO ground-truth tiers — useful only where
  national sources are absent (IT south, GR-class gaps). Licence not captured this lane —
  read before any use.**
- National harmonisation state (for the "3DBAG-class per country" question) — see PART 2 col.
  "3D/LoD2": the state itself already harmonises in NL (3DBAG + Kadaster 3D basisvoorziening),
  EE (Eesti 3D pre-linked to EHR), DK (Danmark i 3D), CH (swissBUILDINGS3D), PL (LoD1/LoD2
  national vintages); DE is the one federation-required country (15 Land downloads, no open
  national aggregate — lane 2 DE-5); IT/PT/GB/NO have NO open national LoD2 programme.

## E5-10 · NO + CZ side-probes — **E5-PROBED/SEARCHED 2026-09-01**

- **NO — FKB-Bygning restriction RE-CONFIRMED** (data.norge.no dataset a43ebac8, fetched
  2026-09-01): "Norge digitalt lisens", restricted — free for Norge-digitalt parties, private
  actors buy via reseller; continuously updated (last 2026-02-27); 2.5D with roof lines,
  1:1 matrikkel link. The internal do-NOT-license doctrine (§G / sweep NO) stands. A
  Kartverket forprosjekt (Volumgeometri) targets CityGML LoD products "by 2026" —
  WATCH, nothing consumable yet. NO buildings remain: bygningspunkt (A, points) +
  OSM/Overture footprints (D) + NDH nDSM heights (D).
- **CZ — INSPIRE BU WFS live, keyless** (`services.cuzk.gov.cz/wfs/inspire-bu-wfs.asp`,
  AccessConstraints "none"): `bu:Building` + `bu:BuildingPart`; live GetFeature @ Prague →
  building with `currentUse` populated (codelist xlink) + geometry; **`heightAboveGround`
  nil/Unpopulated**; no floors attribute observed on the WFS feature. Floors (pocet podlazi)
  remain the RUIAN VFR bulk claim — DOC-level (sweep CZ), one VFR parse owed before relying.

---

# PART 2 — THE 15-COUNTRY AS-IS PATTERN TABLE (registry countries + EE)

> CLASS: **A** authoritative-machine · **B** access-constrained · **C** visual-only ·
> **D** derivable. "Floor-geo" = per-FLOOR geometry openly served (the FXCC-class prize).
> Every cell carries its evidence: lane row, registry row id, or E5 section above.
> Licence colour is the AS-IS building stack's colour, not the country's planning stack.

| CC | Cadastral/authoritative building GEOMETRY | Floor-geo | 3D (LoD2-class) national | Height channel | Floors + use attributes | Scale access | Lic | Class |
|----|---|---|---|---|---|---|---|---|
| **ES** | Catastro INSPIRE BU footprints + BuildingParts, national, keyless (registry `es-catastro-inspire-buildings-wfs`, live) | ⭐ FXCC per-floor plans — **the concurrent ES-CATASTRO-3D memo owns this; not re-derived here** | none (BuildingParts×floors = LoD1-by-floors, lane 3 ES-1.2) | MDSnE nDSM raster pre-computed (registry `es-cnig-mds-edificacion-wcs`, live) + floors×3.2 m | per-part floors + per-unit use/GFA/year via DNPRC (lane 3 ES-1.1/1.2, probed) | WFS per-bbox + ATOM per-muni mirror | GREEN | **A** |
| **SI** | KN WFS `STAVBE`/`STAVBE_OBRIS`, keyless (E5-7, probed) | ⭐ **YES — `ETAZE` features w/ geometry+altitude+floor-height, live-probed** (E5-7) | none found (register-based; LiDAR legacy) | per-floor `VISINA_ETAZE`+`NADMORSKA_VISINA` (A!) + LiDAR (D) | `STEVILO_ETAZ`, dwellings, **GFA**, type, utilities (E5-7) | WFS + JGP bulk | GREEN (CC BY 4.0) | **A** |
| **NL** | BAG pand (PDOK WFS, lane 4 NL-2) + BGT pand (registry `nl-pdok-bgt-ogcapi`) | no | ⭐ 3DBAG LoD 0/1.2/1.3/2.2 (registry `nl-3dbag-ogcapi`, live) + Kadaster 3D basisvoorziening 8 collections incl. `hoogtestatistieken_gebouwen` (lane 4 NL-2) | 3DBAG b3_h_* (A) | **floor COUNT is the NL gap** — BAG has use+area, no storeys; derive height÷storey (D) | OGC APIs + 3D Tiles/ATOM bulk | GREEN (CC0/CC BY) | **A** |
| **EE** | ETAK footprints + `etak_ehr_hooned` state-conflated layer (lane 4 EE-2/EE-3) | not served (EHR holds unit data; not geometry — NOT CONFIRMED any floor-geo channel) | ⭐ Eesti 3D national: 856,360 LoD2 + 917,882 LoD1, **pre-linked to EHR register id** (lane 4 EE-3) | LoD2 heights + LiDAR (A/D) | EHR open CSV daily: floors (maxKorrusteArv), use, permits (lane 4 EE-3) | WFS + county bulk + daily CSV | GREEN (EE licence, read 2026-08-31) | **A** |
| **DK** | GeoDanmark gdk60:Bygning footprints — key-gated free (registry `dk-datafordeler-geodanmark-wfs`, live) | no (BBR is per-floor RECORDS, not geometry) | Danmark i 3D LoD2 CityGML (lane 2 §0 DK row; token flow not re-probed) | **no scalar on footprints — VERIFIED**; DHM nDSM P90 BUILT (same registry row) | BBR floors/use/year — free key, probed 403 without (lane 2 DK-3) | WFS + bulk w/ server key | GREEN (CC BY 4.0) | **A** (key-gated arms **B**) |
| **DE** | ALKIS GebaeudeBauwerk on the parcel WFS, keyless NRW (E5-1, probed) — per-Land federation ×16 | no (Aufteilungsplaene not public → B/C) | LoD2 CityGML FREE ×15 Laender, Saarland gap, national BKG product CLOSED (lane 2 DE-5; registry `de-nrw-lod2-citygml-tiles` live) | LoD2 measuredHeight (A, per Land) | `anzahlgs` schema slot EMPTY 0/500 (E5-1); `funktion` use 500/500; floors → LoD2÷3 m (D) | WFS + per-Land LoD2 ZIP mirror | GREEN ×15, BY gated | **A** (federated) |
| **CH** | AV cadastral footprints via cantons + OEREB (registry `ch-swisstopo-av-identify`, live) | no | swissBUILDINGS3D 3.0 OGD (lane 2 CH-4) | swissALTI3D/swissSURFACE3D STAC COGs → nDSM (registry `ch-swisstopo-stac-ndsm`; a BUILD, not a gate) | ⭐ GWR whole-country CSV keyless, DAILY, floors/use/year by EGID (E5-6, probed 946 MB) | STAC bulk + daily register zip | GREEN | **A** |
| **FR** | ⭐ Etalab cadastre `batiments` per-commune bulk (E5-5, probed 200) + BD TOPO batiment (registry `fr-ign-bdtopo-batiment-wfs`) | no | none national (MNH product line replaces it functionally) | BD TOPO `hauteur` (A) + MNH LiDAR HD pre-computed nDSM (lane 3 FR-4) | BD TOPO `nombre_d_etages` (A where filled) + use | WFS + plain-URL bulk | GREEN (Etalab 2.0) | **A** |
| **PL** | EGiB via KIEG GetFeatureInfo (registry `pl-gugik-kieg-cadastre-wms`) + BDOT10k OT_BUBD_A national GeoParquet (registry `pl-bdot10k-buildings-geoparquet`, 200) | no | LoD1 national ×4 vintages + LoD2 2017 — WMS live-probed, bulk UI-mediated (E5-3) | LoD1/LoD2 + NMT/NMPT LiDAR (A/D) | BDOT10k function+storeys attributes (DOC-only — one parquet read owed, lane 4 PL-5) | plain-URL GeoParquet + per-area 3D | GREEN | **A** |
| **BE** | GRB GBG keyless OGC API (sweep BE, feature-probed) + federal cadastral plan annual snapshot incl. buildings (registry `be-fed-cadastral-plan-snapshot`) | no | 3D GRB LoD1 (Flanders) + UrbIS 3D LoD2 CC0 (Brussels) — internal 2026-07-25 rows (sweep BE) | Wallonia MNH ready-made + regional LiDAR (A/D) | no open national floors register found (cadastral patrimony data gated → B) | OGC API + regional bulk | GREEN | **A** (regional trisection) |
| **FI** | NLS topo/INSPIRE BU footprints anonymous (sweep FI, internal 2026-07-25) | no | Buildings 3D LoD2 CityGML CC BY 4.0 — **partial coverage, status-map check owed** (E5-4) | keyed DSM/DTM → nDSM (D); LoD2 where covered (A) | RHR building register gated; Ryhti building info mandate from 2026 (sweep FI) → B today | OGC API + MapSite bulk | GREEN | **A** (floors **B**) |
| **LT** | GRPK topo footprints open; NTR building points on parcels (lane 4 LT-3, probed) | no | none open (Vilnius city model only, lane 4 LT-3) | LiDAR soft-gated (agreement) → D-gated; EUBUCCO/GBA fallback | per-object floors = PRICED RC product (B); parcel-level counts open | monthly dump + FeatureServer | GREEN (geometry) / B (attrs) | **A/B** |
| **NO** | bygningspunkt points (A); FKB-Bygning footprints Norge-digitalt/reseller — RE-CONFIRMED restricted (E5-10) | no | none open; Kartverket volumgeometri forprosjekt = WATCH (E5-10) | NDH nDSM keyless → derive (sweep NO) | matrikkel bygning attrs behind agreement gate (sweep NO) | WFS + hoydedata bulk | GREEN (chosen path) / RED (FKB, avoided) | **A/D** (footprints **B**) |
| **IT** | **no open machine channel** — WFS = parcels+zoning only (sweep IT re-probe); WMS `fabbricati` = visual (E5-2); DXF sheets SPID-gated (E5-8) | planimetrie owner-gated (B) | none; no catasto-3D programme found (E5-8); regional LoD patchwork | PST LiDAR partial → D; GBA/EUBUCCO ML heights (D, model-grade) | none open (cadastral floors in gated planimetrie/sheets) | bulk = parcels+addresses only | GREEN (what exists) | **C/D** (the lane's worst) |
| **PT** | none national (cadastro = parcels only, urban cores EMPTY — lane 3 PT-1 measured; municipal cartography C) | no | none | DGT LiDAR 2024-25 10 pts/m² → derive nDSM (heightSources `dgt_pt` documented; endpoint URL still uncaptured) | no open floors/use register found (matriz fiscal, not open — lane 3 PT-6) | bulk LiDAR when URL captured | GREEN (LiDAR) | **D** |
| **GB** | no cadastre by design; OS open/OSM footprints generalised (sweep UK) | no | none open (OS premium = RED skip, §G doctrine) | EA LiDAR DSM-DTM England → derive (sweep UK); Scotland/Wales/NI separate | none open (VOA/OS gated) | bulk LiDAR per nation | GREEN (derive path) | **D** |

**Bonus rows (brief-named, non-registry):** **CZ** — INSPIRE BU WFS keyless live w/ use, height
nil (E5-10); RUIAN floors DOC; daily-change cadastre feed (sweep CZ) → **A-leaning, floors
unverified**. **AT** — DKM footprints in CC BY 4.0 biannual snapshots + Vienna Baukoerpermodell
WFS probed; GWR register access-gated; no national LoD2; 1 m DTM/DSM open → derive (sweep AT)
→ **A geometry / B floors / D heights**.

---

# PART 3 — SYNTHESIS FOR THE E5 REPORT (§C input)

## 3.1 · Who has the rich-Catastro pattern?

- **FULL pattern (geometry + floors/use + 3D/height, open machine):** ES · SI · NL · EE · CH ·
  FR · DK(key) · DE(federated ×16, floors via LoD2) · PL. **Nine of fifteen.**
- **FLOOR-LEVEL GEOMETRY (the rare prize): exactly TWO countries — ES (FXCC, the Catastro
  memo's subject) and SI (ETAZE, E5-7, live-probed this lane).** Everywhere else floor
  geometry is either register-held-not-served (EE EHR, DK BBR), owner-gated drawings (IT
  planimetrie, DE Aufteilungsplaene), or absent. **Any Pryzm capability built on floor
  geometry generalises to exactly two countries today — scope accordingly.**
- **Register-side floor DISTRIBUTION (counts, not geometry) is far more common:** ES parts ·
  SI · CH GWR (daily bulk, E5-6) · FR BD TOPO · DK BBR (key) · EE EHR · CZ RUIAN (DOC) —
  and EUBUCCO v0.2 imputes the rest at ML-grade (E5-9). Floors×3 m stays the honest
  derived-height ladder rung (never tagged as measured — heightSources doctrine).
- **The gap tail is structural, not effort:** IT (no open building channel), PT (no buildings
  + empty urban cadastre), GB (no cadastre by design), NO (footprints licensed away by
  doctrine), LT (attrs priced). These five are where Overture/EUBUCCO/GBA conflation (D) is
  not a fallback but the PRIMARY plan — consistent with lane 1 §F's federation verdict.

## 3.2 · Do-not-build consequences (feeds brief §6)

1. **Do NOT build height differencing where the state pre-computed it**: ES MDSnE · FR MNH ·
   BE-Wallonia MNH · (CH swisstopo STAC = one stitch step). Zonal stats only.
2. **Do NOT conflate footprints↔registers where the state pre-joined**: EE (EHR id inside the
   3D model) · SI (EID_STAVBA keys floors↔buildings↔parts) · NL (BAG id spine) · CH (EGID).
3. **Do NOT recreate EU-wide harmonisation**: EUBUCCO v0.2 (attribute joins, provenance-tiered)
   + Overture (backbone) + GBA (last-resort heights) already exist — lane 1 §F.2's verdict
   stands, now with v0.2 CONFIRMED released (E5-9).
4. **DO build (nothing exists):** the IT/PT/GB/NO/LT fallback conflation quality layer, the
   floors×3 m provenance ladder — and everything on the B-side (out of this lane's scope).

## 3.3 · Corrections/updates this lane makes to standing artefacts

| Artefact | Standing claim | E5 finding |
|---|---|---|
| L5 sweep SI row | "richest open building register" (DOC-only) | CONFIRMED live + UPGRADED: floor GEOMETRY served (E5-7) |
| Lane 1 §C.2 | EUBUCCO "v0.2 spring 2026 UNVERIFIED" | v0.2 RELEASED; completeness is ML-imputed — provenance-tier it (E5-9) |
| Lane 4 PL-5 open item | 3D download URLs not captured | WMS entry captured; bulk stays UI-mediated (E5-3) |
| Lane 2 DE verdict | (implicit) ALKIS may carry floors | anzahlgs EMPTY 0/500 in NRW — floors stay LoD2-derived (E5-1) |
| Sweep NO / §G doctrine | FKB commercial, do not license | RE-CONFIRMED 2026-09-01 (Norge digitalt licence, reseller for private) (E5-10) |
| Lane 3 FR-3/FR-4 | cadastre = parcels via apicarto; buildings = BD TOPO | + Etalab `batiments` per-commune bulk, probed 200 (E5-5) |
| Lane 2 CH verdict | context via swisstopo products | + GWR national register bulk keyless DAILY (E5-6) |

## 3.4 · Honest gaps this lane leaves open

- SI: ETAZE geometry FILL not measured (1 of 2 sampled features carried GEOM); JGP bulk not
  downloaded; the WFS constraints field vs the CC BY 4.0 dataset licence not reconciled verbatim.
- FI: Buildings-3D current coverage unread (status map is an app; product page dated 2022).
- PL: BDOT10k storey-attribute fill still unmeasured (one DuckDB query over the probed parquet).
- CZ: RUIAN floors remain DOC-level; my BU probe showed height nil, floors unobserved.
- EUBUCCO v0.2 + GBA licences not read verbatim (v0.1 ODbL + RED pockets precedent; GBA unknown).
- ES FXCC deliberately NOT probed here (concurrent dedicated investigation owns it).
- DK Danmark-i-3D token flow, EE kitsendused GetFeature, NL Geometrieen-Omgevingswet endpoint —
  inherited open items from the audit lanes, unchanged.

## Status: COMPLETE — 15 registry countries + EE covered; 2 bonus (CZ/AT); 11 live probes + 8 web-verified sources this lane.
