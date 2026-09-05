# Belverde (Seixal, PT) — does ANYONE publish the lot polygons? Source hunt, 2026-09-05

**Lane PT-BELVERDE-LOTS · founder's second report on the deployed §L-12912 fix:** *"Belverde Seixal
plot — parcel is still not correct — massive parcels incorrect."*

**Verdict — NO. Nobody publishes Belverde's lot polygons.** Six publishers, twenty-nine probes, all
transcribed below with URL · HTTP · bytes · attributes. The Câmara Municipal do Seixal comes
closest and is the only new finding: its ArcGIS server publishes, keylessly, the **loteamento
perimeter** (137 ha, alvará 6/70), the **lot NUMBER as a point** (1,331 in the study box) and the
**building outline** (1,482) — but never the lot polygon. DGT SNIC serves the 766 ha prédio, DGT's
OGC API `cadastro` collection and BUPi RGG hold **nothing** at the point, the AML publishes no
geoportal this probe could find, and INE's `mapas.ine.pt` is a viewer. So the ring that is
**wired** (deliverable B, same lane) is the honest best available: the OSM building outline as the
primary candidate, titled as a house outline and not a cadastral parcel, with the holding one
deliberate click away.

Every row is re-runnable with `curl -sS -m 20 "<URL>"`. Nothing below is quoted from a header or a
data catalogue — each number is what the service returned on 2026-09-05.

## 0. The brief point is NOT in Belverde — correct the coordinate before re-probing

The brief named **38.572, −9.144**. Seixal's own CAOP layers return **no concelho and no freguesia**
for that point (rows 3.10–3.11) and the `Belverde` lugar polygon's extent starts at
**lat 38.5737** (row 3.12); SNIC serves the **Sesimbra** prédio AAA000087942 (DICOFRE 151101) there
(`belverde-parcel-probe.log.txt`, ARM U). The founder's screenshot ring is **AAA000091722, DICOFRE
151002 (Seixal · Amora)** — so his click was inside Seixal. All Seixal-layer probes below therefore
use a REAL Belverde lot point taken from the município's own lot-number layer:

> **Lot point: lon −9.15011, lat 38.58370 — `LOTE_LOTEAMENTO` 797, `N_POLICIA` 36, `EDIFICADO_ID`
> 8233** (row 3.5, first feature). Seixal CAOP: concelho SEIXAL, freguesia Corroios 151005 (rows
> 3.10–3.11; SNIC files the same prédio under DICOFRE 151002 Amora — the freguesia line moved in the
> 2013 reform, the point did not). SNIC at this point: **AAA000091722, areavalue 7 662 344 m²,
> 500 vertices** (row 1.4) — the founder's ring, reproduced.

## 1. DGT — Sistema Nacional de Informação Cadastral (SNIC) WFS

| # | Probe | URL | Result |
|---|---|---|---|
| 1.1 | GetCapabilities, `inspire` workspace | `https://snicws.dgterritorio.gov.pt/geoserver/inspire/ows?service=WFS&version=2.0.0&request=GetCapabilities` | HTTP 200 · 91 548 B · **one** FeatureType: `inspire:cadastralparcel` |
| 1.2 | GetCapabilities, ALL workspaces | `https://snicws.dgterritorio.gov.pt/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities` | HTTP 200 · 92 311 B · **two** FeatureTypes: `inspire:cadastralparcel`, `bdncp:predios_dico_26` (title `predios_dico_pt1`, CC BY 4.0, DefaultCRS EPSG:3763). No secção / prédio urbano / lote / loteamento type exists. |
| 1.3 | WMS GetCapabilities | `https://snicws.dgterritorio.gov.pt/geoserver/ows?service=WMS&version=1.3.0&request=GetCapabilities` | HTTP 200 · 14 333 B · layers `bdncp:bdncp_predio`, `bdncp:predios_dico_26`, `inspire:cadastralparcel`. `bdncp:bdncp_predio` is WMS-only: WFS GetFeature on it → HTTP 400 `Feature type bdncp:bdncp_predio unknown` (540 B). |
| 1.4 | `cadastralparcel` at the LOT point (proxy's exact query shape, ±0.00035°) | `https://snicws.dgterritorio.gov.pt/geoserver/inspire/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=inspire:cadastralparcel&srsName=EPSG:4326&count=20&outputFormat=application/json&bbox=38.58335,-9.15046,38.58405,-9.14976,urn:ogc:def:crs:EPSG::4326` | HTTP 200 · 13 602 B · numberMatched **1** · `nationalcadastralreference` **AAA000091722** · `areavalue` **7 662 344** · `administrativeunit` **151002** · 500 outer vertices — **the founder's ring** |
| 1.5 | `bdncp:predios_dico_26` DescribeFeatureType | `https://snicws.dgterritorio.gov.pt/geoserver/ows?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=bdncp:predios_dico_26` | HTTP 200 · 1 598 B · fields `id, nic, nip, data, geom, dico, dicofre, anterior` — a prédio table keyed by NIC/NIP |
| 1.6 | `bdncp:predios_dico_26` at the brief bbox | `…request=GetFeature&typeNames=bdncp:predios_dico_26&srsName=EPSG:4326&count=20&outputFormat=application/json&bbox=38.57165,-9.14435,38.57235,-9.14365,urn:ogc:def:crs:EPSG::4326` | HTTP 200 · 147 B · numberMatched **0** |
| 1.7 | `bdncp:predios_dico_26` whole layer, count=3 | `…request=GetFeature&typeNames=bdncp:predios_dico_26&count=3&outputFormat=application/json&srsName=EPSG:4326` | HTTP 200 · `totalFeatures` **0**, `numberReturned` 0 — **the layer is EMPTY nationally**; a stub, not a source |

**SNIC verdict:** the only populated feature type is the one already wired (`inspire:cadastralparcel`),
and at Belverde it holds one prédio for the whole urbanisation. `predios_dico_26` is empty.

## 2. DGT — OGC API Features (`ogcapi.dgterritorio.gov.pt`)

| # | Probe | URL | Result |
|---|---|---|---|
| 2.1 | Collections | `https://ogcapi.dgterritorio.gov.pt/collections?f=json` | HTTP 200 · 370 884 B · **75** collections. Cadastre-shaped: `cadastro` only. Others are ortos, COS, CAOP (`municipios`, `freguesias`, `distritos`), `crus`, `srup_*` (servidões), `sgifr_*`, Sentinel mosaics. No lot / loteamento / secção collection. |
| 2.2 | `cadastro` items at the LOT point | `https://ogcapi.dgterritorio.gov.pt/collections/cadastro/items?bbox=-9.1505,38.5834,-9.1498,38.5840&limit=5&f=json` | HTTP 200 · 1 487 B · numberMatched **0** — nothing at the founder's lot (SNIC WFS returns the prédio at the same box; the two DGT channels do not carry the same set) |

## 3. Câmara Municipal do Seixal — ArcGIS Server `sig.cm-seixal.pt` (the new finding)

Discovery: `https://sig.cm-seixal.pt/` → HTTP 200 703 B (IIS default page); `websig.cm-seixal.pt`
and `geoportal.cm-seixal.pt` → HTTP 000 (no DNS). `https://www.cm-seixal.pt/` (HTTP 200, 225 717 B)
links `https://sig.cm-seixal.pt/WebApps/AppPLOCcms/` and two Portal apps. Services root
`https://sig.cm-seixal.pt/arcgis/rest/services?f=json` → HTTP 200 · 2 646 B · ArcGIS 11.3 · **49
services**, folders `FIELDMAPS` (empty), `Hosted` (29 FeatureServers: cartografia 10K, PDM, SIDS —
no lot layer), `Utilities`. `copyrightText` is empty on every service probed; all endpoints answered
**without a key**. Spatial reference of the data is EPSG:3763; `inSR=4326&outSR=4326` is honoured.
Portal item search `https://sig.cm-seixal.pt/portal/sharing/rest/search?q=lote OR loteamento OR
cadastro OR cadastral&num=30&f=json` → HTTP 200 · **total 0**.

Layers with lot/cadastre-shaped names across all 49 services (name-scan of every `MapServer?f=json`):

| # | Service / layer | Geometry · fields | At the LOT point (`geometry=-9.15011,38.58370&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&f=json`) |
|---|---|---|---|
| 3.1 | `SERV_GEST_MUNI_INTER/MapServer/957` **Loteamentos** | Polygon · `id_lot, alvara, ano_alvara, ORIGEM_INF_GRAFICA, ADITAM_ALVARA, AUGI, OBSERVACOES` | HTTP 200 · 7 670 B · **1 feature**: `id_lot` **88A69**, `alvara` **6/70**, `ano_alvara` 1970, `ADITAM_ALVARA` 4/94;1/00;23/05;4/15;3/21, `AUGI` 2, `Shape.STArea()` **1 367 750 m²** (137 ha), 143 vertices — **the loteamento PERIMETER, not the lot** |
| 3.2 | `INFORMACAO_BASE_2/MapServer/998` **Edificado** | Polygon · `EDIFICADO_ID, FONTE, DATA_ACTUALIZ` | HTTP 200 · 1 364 B · **1 feature**: `EDIFICADO_ID` 8233, `FONTE` Cartografia, `Shape.STArea()` **152.6 m²**, 9 vertices — **the house outline** (municipal cartography, 2002) |
| 3.3 | `INFORMACAO_BASE_2/MapServer/38` **Processo de Obras** | Polygon · `NUM_PROCESSO, ANO, TIPO_PROCESSO, N_PROCESSO, EDIFICADO_ID …` | HTTP 200 · 2 488 B · **1 feature**: `N_PROCESSO` **94/B/95**, same `EDIFICADO_ID` 8233 and the same 9-vertex building ring — a permit ATTACHED to the building outline, not a lot |
| 3.4 | `INFORMACAO_BASE_2/MapServer/17` **Processo sem Edificado** | Polygon · `NUMERO, TIPO_PROCESSO, INST_GESTAO, LOTE_LOTEAMENTO, LOTE_PLANO, ALVARA, ANO2` | HTTP 200 · 1 491 B · **0 features** at the built lot. Census over the 4×4 km box `-9.16,38.56,-9.12,38.60` grouped by `INST_GESTAO`: null **65** (avg 1 672 m²), **Loteamento 20** (avg 2 483 m², max 14 991), PDM 7, Plano de Reconversão 4, Plano Pormenor 7 — **103 polygons against 1 331 lot numbers**: these are UNBUILT-process polygons (a vacant lot with an open process), not a lot layer. Belverde-extent sample with geometry: lote 263 alv. 6/1970 1 483 m²; lote 681 959 m²; lote 75 alv. 27/07 170 m² … |
| 3.5 | `PLOC/MapServer/28` · `INFORMACAO_BASE_2/MapServer/37` · `SERV_INTER_INFO_BASE/MapServer/2` · `SERV_INTRA_INFO_BASE_PRO/MapServer/2` **Número de Lote** | **Point** · `NP_ID, LOTE_LOTEAMENTO, LOTE_PLANO, LOTE_ANTIGO, N_POLICIA, FONTE, EDIFICADO_ID` | Point-on-point query → 0 by construction. Envelope `-9.150,38.576,-9.138,38.590` → HTTP 200 · **5 of many** (`exceededTransferLimit` true): e.g. `LOTE_LOTEAMENTO` **797** · `N_POLICIA` **36** · `EDIFICADO_ID` 8233 · `FONTE` GPROC_EDICOES at (−9.15011, 38.58370); lote 798 · nº 38 at (−9.14982, 38.58355). Count over the 4×4 km box: **1 331**. **Lot NUMBERS exist, as points, linked to the building by `EDIFICADO_ID` — no lot polygon.** |
| 3.6 | `Área_Urbana_de_Génese_Ilegal/MapServer/2` · `PLOC/MapServer/30` · `SERV_GEST_MUNI_INTER/966` **AUGI** | Polygon · `AUGI_DESIGNACAO, NUM_ALVARA, AREA_PLANTA_SINTESE_M2, NUM_LOTES, NUM_FOGOS …` | HTTP 200 · 2 496 B · **0** at the lot point, 0 in the north box, 0 at the Seixal-centre control — Belverde is not an AUGI polygon here (the loteamento row says `AUGI=2`, a code, not a geometry) |
| 3.7 | `SERV_PAT_FUNDIARIO_WEBSERVICE/MapServer/602` **Património fundiário municipal** | Polygon · `Terr_ID, Dominialidade, VALIDACAO` | 0 at Belverde; 3 at the control (Domínio Privado Municipal, 124 589 m² …) — municipal land holdings only |
| 3.8 | `Edificado` count, 4×4 km box | `…/998/query?geometry=-9.16,38.56,-9.12,38.60&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json` | HTTP 200 · **1 482** building outlines |
| 3.9 | Control (Seixal centre, `-9.104,38.638,-9.100,38.642`) on 998 / 17 / 38 | same query shape | 998 → 5 (`exceededTransferLimit`), 17 → 1 (PDM, 26 700 m²), 38 → 5 — **the query shape reaches data**; the zeros at 38.572,−9.144 are location, not a CRS fault |
| 3.10 | `INFORMACAO_BASE_2/MapServer/1004` **Limite de Concelho** at the BRIEF point 38.572,−9.144 | point query | HTTP 200 · features **[]** — outside Seixal. At the LOT point → **SEIXAL** (1 feature, 1 767 vertices) |
| 3.11 | `INFORMACAO_BASE_2/MapServer/1002` **Limite de Freguesia** | point query | brief point → **[]**; lot point → **Corroios, FREGUESIA_ID 151005** |
| 3.12 | `INFORMACAO_BASE_2/MapServer/1003` **Limite estatístico de lugar** | `…/1003/query?where=DESIGNACAO='Belverde'&returnExtentOnly=true&outSR=4326&f=json` | HTTP 200 · Belverde extent **xmin −9.16522 · ymin 38.57368 · xmax −9.13004 · ymax 38.60823**; LUG11 023087, 4 636 680 m² |
| 3.13 | Remaining services name-scanned (`SERV_GEST_MUNI_INTER` 77 layers, `SERV_GEST_TERRITORIO_INTER` ~170 PDM/SARUP layers, `SERV_MAPA_BASE_PRO`, `SERV_SIG_VISUAL_SOCIAL`, `SERV_DASH_INTERV_EXECUTIVO`, `INTER_RAT`, `WFS_ENDERECO_SEIXAL`, `SERV_WMS_TOPONIMIA_N_POLICIA`, `Equipamentos_Seixal`, `CULTURA_AML`, `ENQUADRAMENTO_TML`, `SIDS_*`) | — | the only name hits are the rows above; `Processos de urbanismo` (959) / `Processo Urbanismo` (18) are group layers with **no geometry** (`geometryType null`, query → HTTP 400) |

**Seixal verdict:** the município holds the lot *identity* (number + loteamento alvará) and the
building outline, and publishes both keylessly — but the lot *polygon* is not on any public service.
That is exactly the shape of PARCEL-SELECT-COVERAGE's "the lots are not in the published cadastre",
now measured one level down at the municipal source.

## 4. BUPi — Balcão Único do Prédio (`geo.bupi.gov.pt`)

| # | Probe | URL | Result |
|---|---|---|---|
| 4.1 | Services root | `https://geo.bupi.gov.pt/gisbupi/rest/services?f=json` | HTTP 200 · 117 B · ArcGIS 11.5 · folders `Impressao, opendata, Parceiros, Teste, TesteCache, Utilities`, no root services |
| 4.2 | `opendata` folder | `https://geo.bupi.gov.pt/gisbupi/rest/services/opendata?f=json` | HTTP 200 · 378 B · `CAOP_atual, CAOP_Mad_atual, RGG_Consulta_Publica, RGG_DadosGovPT, RGG_DadosGovPT_Madeira, RGG_Query` — each a single layer `0: Dados Abertos - RGG Continente` |
| 4.3 | `Parceiros` folder | `…/services/Parceiros?f=json` | HTTP 200 · 944 B · `BUPi_v1, RGG_AIGP, RGG_APA, RGG_CCDR_Norte, RGG_IFAP_MADEIRA, RGG_IP, RGG_Madeira, RGG_Municipios, RGG_OSAE` (Feature+MapServer) — partner views of the same RGG |
| 4.4 | `RGG_DadosGovPT/0` at the LOT point | `https://geo.bupi.gov.pt/gisbupi/rest/services/opendata/RGG_DadosGovPT/MapServer/0/query?geometry=-9.15011,38.58370&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&f=json` | HTTP 200 · 1 322 B · **0 features** |
| 4.5 | `RGG_DadosGovPT/0` envelope at the brief box `-9.147,38.569,-9.141,38.575` | same shape, envelope | HTTP 200 · 1 234 B · **0 features** |

**BUPi verdict:** unchanged from L-12897 — the RGG is voluntary rústico/misto registration; nothing
at Belverde.

## 5. AML — Área Metropolitana de Lisboa

| # | Probe | URL | Result |
|---|---|---|---|
| 5.1 | `https://geoportal.aml.pt/` · `https://sig.aml.pt/` | — | HTTP 000 (no DNS) |
| 5.2 | `https://www.aml.pt/` | — | HTTP 200 · 264 589 B · outbound hosts: `documentacao.aml.pt`, `dev.aml.pt` only — no SIG/geoportal link on the site |
| 5.3 | Site search `https://www.aml.pt/?s=geoportal+SIG` | — | HTTP 200 · 167 143 B · no page linking a geoportal |
| 5.4 | Seixal's own server carries the AML-branded services `CULTURA_AML`, `HIDROGRAFIA_AML`, `QUALIDADE_VIDA_IDOSOS_AML` | row 3.13 | thematic (culture, hydrography, elderly quality-of-life) — no parcel layer |

## 6. INE / BGRI and dados.gov.pt

| # | Probe | URL | Result |
|---|---|---|---|
| 6.1 | `https://mapas.ine.pt/` | — | HTTP 302 → `https://mapas.ine.pt/map.phtml` (an interactive viewer); `…/arcgis/rest/services?f=json` → HTTP 404; `geo.ine.pt` → no DNS. BGRI subsecções are census blocks, never lots — recorded, not pursued. |
| 6.2 | dados.gov.pt search `loteamento seixal` | `https://dados.gov.pt/api/1/datasets/?q=loteamento%20seixal&page_size=5` | HTTP 200 · 93 B · total **0** |
| 6.3 | dados.gov.pt search `cadastro seixal` | `https://dados.gov.pt/api/1/datasets/?q=cadastro%20seixal&page_size=5` | HTTP 200 · 93 B · total **0** |

## 7. OSM footprint at the lot point (the premise of deliverable B)

Overpass (`overpass-api.de`, `overpass.kumi.systems`) → **curl (28) timed out after 20 s, three
attempts** from this lane's sandbox — so the OSM outline at the lot is **not probe-verified here**.
Independent evidence that a building stands at the point: Seixal `Edificado` returns a 152.6 m²
outline there (row 3.2). The product path does not depend on this probe: when no OSM footprint is
under the click, `chooseParcelCandidate` falls back to Draw-primary (the §L-12912 behaviour) —
tested in `parcelCandidateChoice.spec.ts`.

> ⛔ **SUPERSEDED 2026-09-05 by §9 — and Overpass was the WRONG SUBJECT.** This section probed
> Overpass. **Production does not read Overpass**: `footprintParcelProvider` →
> `fetchContextBuildings` → `readContextTileFeatures` reads the BAKED `buildings.pmtiles` on R2
> (§CTX-PMTILES-READER, L-513b), so an Overpass answer — had one arrived — would have proved
> nothing about the branch that ships. §9 probes the archive the product actually reads. Its answer
> at this exact point is **0 outlines contain the click**, and across the urbanisation the branch
> fires for **20.1%** of the município's own buildings. Read §9, not this section.

## 8. What this decides

1. **No new server leg.** Nothing answered with lot polygons, so nothing is wired; wiring Seixal's
   building outline as a "parcel" would be class (a) of L-12897 again (fallback-presented-as-parcel)
   in municipal clothing.
2. **Deliverable B ships on the honest ring.** Oversize cadastral answer + OSM footprint under the
   click → the footprint is the primary candidate, titled *"Your house outline (OSM footprint — not
   a cadastral parcel)"*, attributed `PARCEL_FOOTPRINT_ATTRIBUTION`, match `low` by construction
   (§L-640), with *"Use the 766 ha holding anyway"* and Draw as secondary actions; the holding's own
   size-review banner stays on the card. Files: `apps/editor/src/ui/site/parcel/parcelCandidateChoice.ts`,
   `parcelCard.ts` (`leadNotes`), `SiteBoundaryMap2D.ts` (`showParcelCard`).
3. **Follow-on worth a lane (NOT done here):** Seixal's `Número de Lote` point + `Loteamentos`
   perimeter give the *identity* a user needs to request the lot plan from the Câmara — `lote 797,
   loteamento 88A69, alvará 6/70, nº de polícia 36`. A "what to ask the Câmara for" line on the PT
   card, sourced from rows 3.1/3.5, would turn the refusal into an instruction. It needs a server
   leg (same-origin proxy, no key) and a C57 §1.9 attribution row for CM Seixal (copyrightText is
   empty on the services; terms must be confirmed before shipping).
4. **Coverage doc rows to move:** PT row of `PARCEL-SELECT-COVERAGE.md` may cite this file for
   "Setúbal lots: municipal source probed, no polygons"; the ISSUE-LOG row is returned by the lane,
   not written by it.

## 9. Is deliverable B REACHABLE at Belverde? The measurement §7 could not make (2026-09-05, §L-12942)

§8.2 shipped the honest ring: oversize cadastral answer + an OSM footprint under the click → the
footprint leads. **That "+" is a premise, and it had never been measured at Belverde.** §7 probed
Overpass and timed out; but production never reads Overpass — `footprintParcelProvider` →
`fetchContextBuildings` → `readContextTileFeatures` reads the **baked `buildings.pmtiles` on R2**
(§CTX-PMTILES-READER, L-513b). So the branch's real hit-rate is a property of a PMTiles archive,
and it is directly measurable over HTTP Range without a browser.

Two probes, both re-runnable, both keyless, both committed beside this file:
`belverde-footprint-tile-probe.mjs` (the point) and `belverde-footprint-coverage-probe.mjs` (the
rate). Their raw output is the `.json` beside each.

| # | Probe | Result |
|---|---|---|
| 9.1 | `buildings.pmtiles` header · `https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/buildings.pmtiles?v=L662a` (the R2 origin `contextTilesProxy.js` forwards to; `v` = `CONTEXT_TILESET_VERSION`) | HTTP 206 on Range · **z12–16 · 14 822 228 addressed tiles** · bounds −122.51995,−43.657029 → 153.636675,71.17004 |
| 9.2 | The tile under the **lot point** (−9.15011, 38.58370 — lote 797, nº 36), read at z16 (`LAYER_ZOOM.buildings`) | z16/**31102/25143** · tile present · **1 108 B** · layers `[buildings]` · **28 features** · **CONTAINING the click: 0** · nearest building vertex **56.5 m** |
| 9.3 | Same, at the **brief's** point (38.572, −9.144 — Sesimbra, not Belverde; see §0) | z16/31103/25146 · **87 B** · **1 feature** · containing **0** · nearest vertex **294.7 m** |
| 9.4 | Control: Barcelona Eixample (2.16, 41.39) | z16/33161/24476 · **19 924 B** · **328 features** · **containing 1** (230 m², 5 pts) · nearest vertex **6.2 m** — **the reader, the projection and the point-in-ring test are sound**; the Belverde zeros are coverage, not a decoding fault |
| 9.5 | **Hit-rate over the urbanisation.** Ground truth = Seixal `Edificado` (row 3.2/3.8 — the município's own cartography). Every polygon centroid that lies inside its own outline is a point where a building provably stands; ask the baked tiles whether an OSM footprint contains it. Box `-9.1560,38.5790 → -9.1440,38.5890`. | Seixal: HTTP 200 · 258 694 B · **480 buildings**; **453 tested** · OSM footprint present **91** · absent **362** · **HIT RATE 20.1%**. Missed-building areas min/median/max **58 / 224 / 66 502 m²** — the misses are ordinary houses, not slivers |
| 9.6 | Same method, control box `-9.1060,38.6360 → -9.0980,38.6420` (Seixal centre) | 313 buildings · **246 tested** · present **215** · absent **31** · **HIT RATE 87.4%** — 12 tiles, 15 range requests, 60 505 B for both boxes |
| 9.7 | SNIC re-verification of the holding, same query shape as row 1.4, re-run for this section | HTTP 200 · 13 602 B · numberMatched **1** · **AAA000091722** · areavalue **7 662 344** · admin **151002** · **500** vertices — unchanged |
| 9.8 | Licence of the município's `Edificado` layer (the only source that would close the 80%) | `…/INFORMACAO_BASE_2/MapServer?f=json` HTTP 200 · 5 019 B and `…/998?f=json` HTTP 200 · 4 781 B — **`copyrightText: ""`, `serviceDescription: ""`, `description: ""`** on both; `capabilities: "Map,Query,Data"`, `maxRecordCount 1000`. `https://dados.gov.pt/api/1/datasets/?q=seixal` → HTTP 200 · 9 104 B · total **2**: *Rede ciclável do Seixal* (**cc-zero**, Município do Seixal) and *Carta do Regime de Uso do Solo — Seixal* (cc-by, DGT). **The município does publish openly — but not this layer, and it declares no terms on it.** |

### 9.9 What the measurement changes

1. **Deliverable B is correct and it is mostly INACTIVE here.** At Belverde the cadastral answer is
   oversize on every click, so the card is decided entirely by the footprint premise — and that
   premise holds for **one click in five** (20.1%). Four times in five the founder gets the
   §L-12912 Draw-primary card, which is honest and is not his lot. **Nothing about this is a bug in
   the helper**: `chooseParcelCandidate` is doing exactly what it says, on data that is not there.
   The 87.4% control says this is Belverde's OSM coverage, not the product.
2. **The 80% has a known filler, and it is licence-blocked, not technically blocked.** Seixal's
   `Edificado` **is** the ground truth used above: it answers keylessly, by point, with the
   building outline, at 100% by construction. Wiring it as a second footprint source — under the
   SAME honest title deliverable B already ships (*a building outline, never a cadastral parcel*),
   with its own C57 §1.9 attribution row — would take the branch from 20.1% to the município's own
   inventory. **It is NOT wired by this lane, and must not be, until the terms are confirmed**:
   row 9.8 shows the service declares none. This is a founder/legal decision with a measured
   payoff attached, not an engineering question. §8.1's *"wiring Seixal's building outline as a
   'parcel' would be class (a) of L-12897 again"* remains right about calling it a parcel and is
   **beside the point** for calling it what it is — the product already offers exactly this object
   from OSM.
3. **A coverage number is not a promise.** 20.1% is the rate for the município's building
   inventory in one box on one day against tileset `L662a`. Re-run
   `belverde-footprint-coverage-probe.mjs` after any re-bake; the version is in its output.
4. **NOT browser-verified.** Every number in §9 was read from the R2 archive and the Seixal service
   by Node/curl. No one has clicked Belverde in a deployed browser and watched which card appears.
