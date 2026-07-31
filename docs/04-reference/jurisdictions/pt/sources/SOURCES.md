# Portugal (`pt`) — national data sources

**Status:** RESEARCH COMPLETE 2026-07-23 — legal instruments fully cited from primary sources
(`dre.pt`); data-endpoint leads documented but **NOT live-probed this session**. Every URL,
coverage figure, licence term, and field name marked `VERIFIED-LEAD` must be re-probed live before
any pipeline or pack may ship `confidence: structured`.

> **Trust gate (C58 §1.6 / C57 §1.4):** a field with NO citable source stays `null` in the pack
> and is listed under §B. A pack may not ship `confidence: structured` unless EVERY field it sets
> has a row in §A here. Confidence tiers: `VERIFIED-LIVE` (live-probed this session) /
> `VERIFIED-PRIMARY` (primary legal source, text read directly) / `CONVERGENT-SECONDARY` (multiple
> corroborating research sources, not primary text) / `INFERRED` / `COULD-NOT-VERIFY`.

---

## A.0 — `VERIFIED-LIVE` (probed 2026-07-31) — endpoints, schemas, and primary-PDF values

> **These rows were obtained from a live HTTP response or an extracted primary PDF on 2026-07-31.**
> Full evidence: [`../findings/PORTUGAL-DATA-RECON.md`](../findings/PORTUGAL-DATA-RECON.md).
> Several rows **supersede** entries in §A.2 below — superseded rows are marked there.

### A.0.1 — Endpoints

| Source / layer | Provides | Endpoint | HTTP | Auth | Licence | Confidence |
|---|---|---|---|---|---|---|
| **SNIC cadastral parcels** | INSPIRE CadastralParcel — `inspireid`, `geometry` (MultiSurface), `referencepoint`, `label`, `nationalcadastralreference`, `areavalue`, `validfrom`, `validto`, `beginlifespanversion`, `endlifespanversion`, `administrativeunit`, `id`. **`numberMatched=1789404`**, EPSG:3763 | `snicws.dgterritorio.gov.pt/geoserver/inspire/ows` (WFS 2.0; `DescribeFeatureType` **works**) | **200** | **NONE** | open | `VERIFIED-LIVE` |
| **CRUS — Carta do Regime de Uso do Solo** | **National VECTOR zoning polygons.** `ID · DTCC · Municipio · Classe · Categoria · Area_Ha · Designacao_PlantaOrdenamento · Escala_PlantaOrdenamento · Data_PublicacaoPDM · Fonte · Autor · Geometry`. EPSG:3763; GeoJSON/GML/CSV/KML/protobuf | `servicos.dgterritorio.pt/SDISNITWFSCRUS_<DICOFRE>_1/WFService.aspx` — verified `1312` (`gmgml:CRUS_Porto_V`) + `1106` (`gmgml:CRUS_Lisboa_V`); `0303` → **502** | **200** (148 s!) | NONE | CC-BY (`dados.gov.pt`) | `VERIFIED-LIVE` |
| **SNIT plan services (PDM/PP)** | Per-plan **RASTER** WMS 1.3.0. `GetFeatureInfo` returns 11 raster-metadata attrs incl. **`IDESTADO`, `VALIDADE`, `IDDEPOSITO`, `IMAGENAME`(.tif), `LEGENDLINK`(.jpg)`** — **no zoning attributes** | `servicos.dgterritorio.pt/SDISNITWMS<TYPE>_<DICOFRE>_<IDIGT>_<v>/wmservice.aspx` | **200** | NONE | open | `VERIFIED-LIVE` |
| **SNIG RNDG catalogue** | CSW 2.0.2 — `GetRecords`, `GetRecordById`, `DescribeRecord`, `GetDomain`, `Harvest`; outputSchemas incl. **ISO 19139 (`gmd:MD_Metadata`)** + **`gfc:FC_FeatureCatalogue`** + DCAT | `snig.dgterritorio.gov.pt/rndg/srv/por/csw` | **200** | NONE | open | `VERIFIED-LIVE` |
| **DGT GeoServer (base/thematic)** | CAOP (`cont_municipios` → `dtmn`, `municipio`, `nuts1/2/3`, `area_ha`, `n_freguesias`), COS, CLC, `altimetria:*`, `MDT50m:MDT50m`, RGN. **WFS *and* WCS DISABLED**; WMS + `GetFeatureInfo`→`application/json` work. **Zero planning + zero cadastral layers** (155-layer keyword scan) | `geo2.dgterritorio.gov.pt/geoserver/wms` | **200** | NONE | CC-BY 4.0 | `VERIFIED-LIVE` |
| **DGT CDD — national LiDAR / DTM** | 2024–25 campaign: 10 pts/m²; **exatidão planimétrica 30 cm, altimétrica 10 cm**; MDT+MDS at 0.5/2/10 m GeoTIFF; LAZ LAS 1.4 R15 pt-format 8, 1 km tiles; classes 2=Terreno, **6=Construções**, 9=Água, 26=Pontes. 13 STAC collections, `location:["continente"]` only | `cdd.dgterritorio.gov.pt/dgt-be/v1/collections` + `/search` (**open**); `/download/{sha256}` → **302 Keycloak** | **200** / **302** | STAC open; **tiles need free self-service account** (no key/secret) | **CC-BY 4.0** — quoted verbatim at `dgterritorio.gov.pt/dados-abertos` | `VERIFIED-LIVE` |
| **MDT10m national (zero-auth)** | Whole-country bare-earth 10 m DTM, single file **3,545,398,706 B** | `dgterritorio.gov.pt/sites/default/files/ficheiros-cartografia/MDT10m2024_PTcontinente.zip` | **200** | **NONE** | CC-BY 4.0 | `VERIFIED-LIVE` |
| **Porto municipal ArcGIS** | **ArcGIS Server 11.5, anonymous.** `PDM2021` folder (18 services); `PO1A_QS/MapServer/8` = *Qualificação do solo funcional*, 36 fields (`c_espaco`, `sc_espaco`, `designacao_po`…), EPSG:3763, queryable. **Zero numeric planning fields** | `fedservergeo.cm-porto.pt/arcgis/rest/services` | **200** | NONE | — | `VERIFIED-LIVE` |
| **Porto municipal WMS / CKAN** | GeoServer WMS 1.3.0, **361 layers**, `<Fees>none</Fees>`; CKAN **21 PDM datasets**, mostly **CC-Zero** | `geopdm.cm-porto.pt` · `opendata.porto.digital` | **200** | NONE | CC-Zero / ODbL | `VERIFIED-LIVE` |
| **Lisboa municipal zoning** | `MuniSIG_Secure/WS_Planeamento_PDM2011_TESTE_FGC/MapServer` | — | **ArcGIS 499 `Token Required`** | **TOKEN WALL** | — | `VERIFIED-LIVE` (as gated) |
| **BUPi RGG** | **3,471,456** polygons — **owner-declared, voluntary, NOT authoritative** | `geo.bupi.gov.pt/gisbupi/rest/services/opendata/RGG_DadosGovPT/MapServer/0/query` | **200** | NONE | — | `VERIFIED-LIVE` |
| `snit-mais.dgterritorio.gov.pt` | App root + `/api` gated; **static legend images remain public** | — | **401** (IIS) | CREDENTIAL WALL | — | `VERIFIED-LIVE` (as gated) |

### A.0.2 — Measured cadastral coverage (bbox `numberMatched`, `inspire:cadastralparcel`)

| Area | Parcels | Area | Parcels |
|---|---|---|---|
| **Porto (1312) municipality** | **0** | Porto *district* (wide) | 66,973 |
| **Braga (0303) municipality** | **0** | Braga *district* (wide) | 1 |
| **Lisboa (1106) municipality** | **1,747** | **Lisboa Baixa core** | **0** |
| Loulé (SiNErGIC) | 63,834 | Penafiel (SiNErGIC) | 23,906 |
| Tavira (SiNErGIC) | 11,015 | Algarve (wide) | 321,579 |
| Belmonte (0501) | 0 | North PT (very wide) | 164,906 |

> Zeros are **measured emptiness**, not query failure — identical query construction returns 66,973
> for the Porto district and 321,579 for the Algarve.

### A.0.3 — Porto PDM numeric values (`VERIFIED-PRIMARY`, text extracted 2026-07-31)

Source: *Plano Diretor Municipal — Regulamento — Janeiro 2023*,
`pdm.cm-porto.pt/documents/121/Regulamento_PDMPorto.pdf` (HTTP 200, 1,641,985 B, 100 pp, **text PDF**,
319,459 chars extracted).

| Field | Value | Article | Confidence |
|---|---|---|---|
| `índice de edificação` — new buildings (Espaços Centrais family) | **1** | **Art. 32.º** | `VERIFIED-PRIMARY` |
| `índice de edificação` — existing below 1 may extend to 1, if `índice de impermeabilização ≤ 0,6` | **1 / 0,6** | **Art. 32.º** | `VERIFIED-PRIMARY` |
| `índice de edificação` máximo — Área de Atividades Económicas **Tipo I**; impermeável ≤ 70 % | **1,8** | **Art. 36.º** | `VERIFIED-PRIMARY` |
| `índice de edificação` máximo — **Tipo II**; impermeável ≤ 70 % | **1,4** | **Art. 38.º** | `VERIFIED-PRIMARY` |
| **Cércea ≤ largura do arruamento** confrontante | street width | Espaços Centrais | `VERIFIED-PRIMARY` |
| Where public-space cross-section **> 21 m** → cércea máx **21 m**, *unless moda da cércea is higher* | **21 m** | Espaços Centrais | `VERIFIED-PRIMARY` |
| **Profundidade** máx from alinhamento (two subcategories) | **25 m / 30 m** | Espaços Centrais | `VERIFIED-PRIMARY` |
| **Afastamento** of upper storeys to plot limits | **≥ H/2, min 3 m** | (waived for colmatação de empena) | `VERIFIED-PRIMARY` |
| Max storeys above ground (stated subcategory); in colmatação set by moda da cércea | **3** | — | `VERIFIED-PRIMARY` |
| `índice de permeabilidade` (logradouros); ancillary max | **0,3** / **10 m²** | Art. 25.º | `VERIFIED-PRIMARY` |
| Roof pitch max | **30°** | — | `VERIFIED-PRIMARY` |
| Parcel-size exemption from frontage implantation | **> 2000 m²** | — | `VERIFIED-PRIMARY` |
| **`área de edificação` (ae) definition** | sum of all storey areas, **excluding** uncovered terraces, non-glazed balconies, balconies open to exterior, publicly-usable covered open space, attics without regulation headroom | **Art. 3.º d)** | `VERIFIED-PRIMARY` |
| **`cércea` definition** | vertical dimension from **mean ground level at the façade alignment** to top of eave/parapet/terrace guard, **including** recessed storeys, **excluding** chimneys, lift machine rooms, water tanks | **Art. 3.º g)** | `VERIFIED-PRIMARY` |
| **`índice de edificação` definition** | ratio of `área de edificação` (excluding collective-equipment areas ceded to the município) to parcel area or plan area | **Art. 3.º m)** | `VERIFIED-PRIMARY` |
| **`moda da cércea` definition** | the cércea with the greatest extent along a built urban frontage | **Art. 3.º o)** | `VERIFIED-PRIMARY` |
| **`frente urbana` definition** | plane of façades fronting a public way, between two successive intersecting public ways | **Art. 3.º l)** | `VERIFIED-PRIMARY` |
| Perequação article series | `edificabilidade média / abstrata / concreta`; UT for perequação | **Arts. 131–135** (headings verified; **text NOT read**) | `VERIFIED-PRIMARY` (headings only) |
| `índice de utilização` in Porto regulamento | **0 occurrences** | — | `VERIFIED-PRIMARY` (measured absence) |
| `altura da edificação` in Porto regulamento | **0 occurrences** | — | `VERIFIED-PRIMARY` (measured absence) |

> ⚠ **`edificab_m` in Porto's `cc_czp.gpkg` (1.18 / 0.67 / 0.25) is an `edificabilidade média` over
> exactly THREE city-wide perequação macro-zones.** It is a compensation reference index, **NOT** a
> per-parcel FAR. **Do not wire it as an envelope value.**

### A.0.4 — Lisboa créditos de construção (`VERIFIED-PRIMARY`)

| Field | Value | Confidence |
|---|---|---|
| Instrument | *Regulamento Municipal que aprova o Sistema de Incentivos a Operações Urbanísticas com Interesse Municipal* — Deliberações **53/AM/2013** + **60/AM/2013** of 21 May; **3.º Suplemento do Boletim Municipal n.º 1006, 30 May 2013** (58 pp, text PDF) | `VERIFIED-PRIMARY` |
| Mechanism | Credits add m² of **`superfície de pavimento`**, capped by the max **`índice de edificabilidade`** per `categoria de espaço` + `traçado urbano` in the **RPDML**; represented by transferable **Títulos** | `VERIFIED-PRIMARY` |
| **Suspension (PARTIAL)** | **Art. 2.º n.º 1 alínea g) and Art. 5.º n.º 2 alínea i) SUSPENDED** by **Deliberação 415/AML/2022**, 2.º Supl. Boletim Municipal n.º 1486, **11 Aug 2022**. **The regime as a whole remains in force.** | `VERIFIED-PRIMARY` |
| "PDM Arts. 84/88/89" (prior claim) | **NOT confirmed** in the document read | **downgraded to `ASSERTED-UNVERIFIED`** |
| Lisboa vocabulary | `índice de edificabilidade` · `superfície de pavimento` · `traçados urbanos` | `VERIFIED-PRIMARY` |

### A.0.5 — DICOFRE (`VERIFIED-LIVE`, DGT CAOP `cont_municipios`)

| City | `dtmn` | area_ha | n_freguesias |
|---|---|---|---|
| **Porto** | **1312** (repo says `1315` — **defect**) | 4142.02 | 7 |
| Lisboa | 1106 ✓ | 10005.43 | 24 |
| Braga | 0303 ✓ | 18339.95 | 37 |

---

## A — VERIFIED / CITED

### A.1 — Legal instruments (primary; `dre.pt`)

| Field (pack key / legal rule) | Value | Unit | Governing instrument | Document title + date | URL / handle | Confidence |
|---|---|---|---|---|---|---|
| National IGT hierarchy | RJIGT — Regime Jurídico dos Instrumentos de Gestão Territorial | — | Decreto-Lei n.º 80/2015, 14 Apr 2015 | "Aprova o Regime Jurídico dos Instrumentos de Gestão Territorial" | `dre.pt` — search DL 80/2015 | `VERIFIED-PRIMARY` |
| National solo classification criteria | DR 15/2015 — criteria for solo urbano / rústico qualification; uniform national application per Art. 74(4) RJIGT | — | Decreto Regulamentar n.º 15/2015, 19 Aug 2015 | "Critérios de classificação e reclassificação do solo e critérios de qualificação" | `dre.pt` — search DR 15/2015 | `VERIFIED-PRIMARY` |
| Abolition of solo urbanizável | Post-2015 reform eliminates "solo urbanizável" as an operative category nationwide | — | DR 15/2015 (implementing Lei n.º 31/2014) | Same document | `dre.pt` | `VERIFIED-PRIMARY` |
| Top-level solo categories (hard-code) | Only **solo urbano** and **solo rústico** — no intermediate class post-2015 | — | DR 15/2015 | Same | `dre.pt` | `VERIFIED-PRIMARY` |
| Art. 74(4) RJIGT uniform criteria mandate | Dominant-use definitions and categories of solo urbano/rústico MUST obey uniform criteria applicable to the whole national territory | — | RJIGT Art. 74(4), DL 80/2015 | Same | `dre.pt` | `VERIFIED-PRIMARY` |
| Licensing-track split (§34/RNU analogue) | Comunicação prévia → áreas cujos parâmetros urbanísticos se encontrem efetivamente definidos; Full licenciamento prévio → areas without precise urbanistic instruments | — | RJUE Art. [relevant article], DL 555/99 as reformed by DL 10/2024 | "Regime Jurídico da Urbanização e Edificação" | `dre.pt` — DL 555/99 + DL 10/2024 | `VERIFIED-PRIMARY` |
| Unified cadastro predial regime | DL 72/2023 unifies CGPR and SiNErGIC into one "cadastro predial" regime; operative 21 Nov 2023; every prédio receives a NIC (Número de Identificação do Prédio) | — | Decreto-Lei n.º 72/2023, 21 Nov 2023 | "Regime jurídico da constituição e atualização do cadastro predial" | `dre.pt` — DL 72/2023 | `VERIFIED-PRIMARY` |
| Cadastral data as rebuttable presumption | Data on a cadastred prédio "constitute a presumption of its real location, geometric configuration, and area for all legal purposes, without prejudice to the right of rectification" | — | DL 72/2023 | Same | `dre.pt` | `VERIFIED-PRIMARY` |
| Heritage ZGP radius | 50 m automatic general protection zone from the external limits of any pending-classification immovable heritage asset | m | Lei n.º 107/2001 + DL n.º 309/2009 | "Lei de Bases do Património Cultural" + "Procedimentos de classificação de bens imóveis" | `dre.pt` | `VERIFIED-PRIMARY` |
| Heritage ZEP | Must be fixed simultaneously with classification or within 18 months; variable extent (not a fixed radius); may include ZNA (non aedificandi subzone) | — | DL 309/2009 | Same | `dre.pt` | `VERIFIED-PRIMARY` |
| RGEU habitability baseline | Nationwide habitability minimums (natural light, room dimensions, ventilation); referenced by PDMs as minimum habitability floor | — | Regulamento Geral das Edificações Urbanas (RGEU), 1951, Decreto-Lei n.º 38382 | Still partially in force | `dre.pt` | `VERIFIED-PRIMARY` |
| RGEU does NOT set a national setback formula | RGEU does not define a height-proportional setback from boundary (unlike Germany's LBO Abstandsflächen) — setbacks (afastamentos) are per PDM only | — | RGEU (1951) — absence confirmed by research | Same | — | `VERIFIED-PRIMARY` |
| CGPR coverage (cadastral) | 127 municípios (118 mainland + 9 autonomous regions) under Cadastro Geométrico da Propriedade Rústica — primarily rural (rústico) land; some urban parcels lacking independent economic/legal standing | count | CGPR regime (DL pre-2023) / DL 72/2023 Art. X | DGT SNIC documentation | `snig.dgterritorio.gov.pt` | `CONVERGENT-SECONDARY` |
| SiNErGIC pilot coverage | 7 municípios: Loulé, Oliveira do Hospital, Paredes, Penafiel, São Brás de Alportel, Seia, Tavira | list | SiNErGIC / CPE regime, unified under DL 72/2023 | DGT documentation | `dgterritorio.gov.pt` | `CONVERGENT-SECONDARY` |
| No-cadastro municípios | ~174 municípios have no cadastro predial; rely on BUPi voluntary/citizen-submitted graphic representation (RGG) | count | Research finding | Multiple corroborating sources | — | `CONVERGENT-SECONDARY` |
| BUPi is NOT a parcel-geometry source | BUPi (Balcão Único do Prédio) = rural/mixed ownership registration; voluntary, citizen-submitted; NOT authoritative parcel geometry | — | Research finding | Confirmed by multiple sources | `bupi.gov.pt` | `VERIFIED-PRIMARY` (negative) |

### A.2 — Data endpoints (VERIFIED-LEAD; **superseded in part by §A.0 — live-probed 2026-07-31**)

> **⚠ SUPERSEDED ROWS — do not use these without reading §A.0 first:**
> - **SNIT row** — the endpoint `snit-mais.dgterritorio.gov.pt` is **401** to anonymous clients and is
>   **not** a GeoServer. The real hosts are `servicos.dgterritorio.pt` (WMS rasters + **CRUS WFS**).
>   *"PDM zone polygons + WFS"* is wrong as stated: plan services are **raster**; the vector route is **CRUS**,
>   and it carries **no numeric attributes**. The row's own caveat — *"numeric rules likely PDF-only"* —
>   is now **CONFIRMED**.
> - **SNIC / Carta Cadastral row** — a live open INSPIRE WFS **does** exist (§A.0.1) and needs no
>   registration. Its warning *"do NOT assume Lisbon/Porto city-centre coverage"* is **CONFIRMED with
>   numbers** (§A.0.2): Porto **0**, Lisboa **1,747** / **0** in core.
> - **DGT CDD row** — CONFIRMED and extended: accuracy is **30 cm planimetric / 10 cm altimetric**
>   (DGT *Ficha Técnica*), licence **CC-BY 4.0**, class **6 = Construções**. A **zero-auth national
>   MDT10m** exists. High-res tiles need a **free account (no key/secret)**. Continental only.
> - **CAOP / COS / CRUS / Orthophoto "OGC API platform" rows** — the *platform* framing is **not**
>   what was found. CAOP/COS/altimetria are served from `geo2.dgterritorio.gov.pt/geoserver` where
>   **WFS and WCS are both DISABLED** (WMS + `GetFeatureInfo`→JSON only). **CRUS is a separate SNIT
>   WFS**, not a collection on a unified OGC API. **No OGC API base URL was found.**
> - **Lisbon CML 3D model row** — licence still `COULD-NOT-VERIFY`; additionally the municipal PDM
>   zoning service returns **ArcGIS 499 Token Required**.

> **DGT OGC API platform (2026-07-30 expert review — `CONVERGENT-SECONDARY`, pending-probe).** The
> review reports that DGT delivers its national layers through a coherent **OGC API platform**
> (`dgterritorio.gov.pt` / `snig.dgterritorio.gov.pt`), **CC BY 4.0 platform-wide**. This upgrades
> several rows below from `VERIFIED-LEAD` to `CONVERGENT-SECONDARY` (corroborated by an expert
> second source, still not live-probed). See `../PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md` for the full
> inventory + §Probe steps. **A corroborated source is not a wired/probed source — confirm the OGC
> API base URL + each collection by direct probe before any row gates production or a RATE cell.**

| Source / layer | Provides | Endpoint / locator | Access | Confidence | Licence / attribution | Currency | Notes |
|---|---|---|---|---|---|---|---|
| **SNIC / DGT** — Carta Cadastral (parcel geometry + NIC) | Parcel geometry + area + NIC identifier, per-prédio | INSPIRE WMS/WFS via SNIG (`snig.dgterritorio.gov.pt`); per-parcel download Shapefile / GeoPackage / DXF / GeoJSON | Open (EU High-Value Dataset, Reg. 2023/138); keyless or registration TBD | `VERIFIED-LEAD` | Open (HVD mandate — specific attribution string TBD) | In-progress national update under DL 72/2023 | OGC API planned 2025 — verify if live. Urban parcel coverage limited to CGPR/SiNErGIC munis (~134). Do NOT assume Lisbon/Porto city-centre coverage. |
| **SNIT** — national PDM portal | PDM zone polygons + regulation PDF links for all mainland PDMs since Jan 2008 | `snit-mais.dgterritorio.gov.pt` — WMS/WFS | Open (INSPIRE) | `VERIFIED-LEAD` | Open | Living dataset; PDM amendments appear as they are published | WFS field names NOT confirmed. Numeric rules (índice/cércea) likely PDF-only — probe WFS attributes. |
| **DGT CDD** — national LiDAR (PRR 2024–2025) | LAZ point cloud (10 pts/m², classified); DTM 50 cm GeoTIFF; DSM 2 m GeoTIFF; ~90% continental coverage | `cdd.dgterritorio.gov.pt` | Open — "sem qualquer tipo de restrição" | `VERIFIED-LEAD` | No restrictions stated | Apr 2024 – Mar 2025 campaign; NW mainland gap (~10%, rolling completion) | RMSE-Z NOT published by DGT — do not quote PNOA parity. Class codes vs ASPRS mapping NOT confirmed — verify before wiring CHM extraction. DGT CDD Downloader QGIS plugin available. |
| **BGE (INE)** — Base Geográfica de Edifícios | National vector building footprints; mainland + Madeira/Azores; 1:10,000 | INE open data portal (`ine.pt`) | CC-BY-4.0 | `VERIFIED-LEAD` | CC-BY-4.0 — "Instituto Nacional de Estatística" | Census-vintage; exact year to confirm | Built for census population/dwelling counting. Height / storey attribute NOT confirmed — verify before assuming a `HAUTEUR`-equivalent field. |
| **DGPC Atlas do Património Classificado** | ZGP / ZEP / ZNA / Restrições — 4 distinct queryable heritage layers | `patrimoniocultural.gov.pt` — DGPC geoportal | Open | `VERIFIED-LEAD` | Open; attribution "Direção-Geral do Património Cultural (DGPC)" | Living dataset | Variable ZEP radius per asset — NOT a fixed circle. National single service, no per-region gating. |
| **SNIRH + DGT hydrography** | National water-resources system + hydrography network | `snirh.apambiente.pt` / SNIG INSPIRE | Open (INSPIRE) | `VERIFIED-LEAD` | Open | Living | Do NOT derive water surfaces from LiDAR (NIR absorption) — use SNIRH geometry + DTM elevation referencing. |
| **COS / COSc (DGT)** — land cover | National land-cover (Carta de Uso e Ocupação do Solo); COSc = AI/ML-derived, more frequent | **DGT OGC API platform** (`dgterritorio.gov.pt` / `snig.dgterritorio.gov.pt`) — *review upgrades from SNIG WMS/WFS lead* | Open | `CONVERGENT-SECONDARY` — 2026-07-30 review upgrade; pending-probe | **CC BY 4.0** *(review; DGT platform-wide — pending-probe)* | Multi-year; COSc more frequent | Too coarse for individual park boundaries — use as fallback/district-scale context only. Confirm OGC API + CC BY 4.0 by direct probe before it gates production. |
| **CAOP (DGT)** — administrative boundaries | distrito + concelho + freguesia polygons + DICOFRE — jurisdiction routing (== DE AGS / FR INSEE) | **DGT OGC API platform** — *base URL + FeatureType pending-probe* | Open | `CONVERGENT-SECONDARY` — 2026-07-30 review; pending-probe | **CC BY 4.0** *(review — pending-probe)* | Living | Reviewer ★★★★★ "easiest win". Probe: FeatureType + DICOFRE attribute name. Confirm by direct probe before it gates production. |
| **CRUS (DGT)** — Classificação e Uso do Solo | territorial classification polygons — planning context | **DGT OGC API platform** — *collection name pending-probe* | Open | `CONVERGENT-SECONDARY` — 2026-07-30 review; pending-probe | **CC BY 4.0** *(review — pending-probe)* | Living | Reviewer ★★★★★. Probe: CRUS collection + classification attribute schema. Confirm by direct probe before it gates production. |
| **Orthophotos 30 cm (DGT)** — national imagery | 30 cm national orthoimagery base (== PNOA for ES) | **DGT OGC API platform** / tiled imagery — *pending-probe* | Open | `CONVERGENT-SECONDARY` — 2026-07-30 review; pending-probe | **CC BY 4.0** *(review — pending-probe)* | National | Reviewer ★★★★★. Confirm OGC API access + CC BY 4.0 by direct probe before it gates production. |
| **Copernicus DEM (~30 m)** — terrain fallback | GLO-30 terrain, fills the NW-mainland ~10% gap outside DGT LiDAR | Copernicus Data Space — GLO-30 tiles | Open | `CONVERGENT-SECONDARY` — 2026-07-30 review; pending-probe | Copernicus open licence | Global | **Terrain fallback, NOT a building-height source** — do NOT conflate. Confirm gap boundary by direct probe before it gates production. |
| **Lisbon CML — "Modelo Tridimensional"** | Council-wide 3D model, 1:1,000, LOD2/3-ish (balconies, setbacks, sidewalks, tunnel entries, walls >0.5 m) | `geodados-cml.hub.arcgis.com` | **LICENCE UNVERIFIED** | `COULD-NOT-VERIFY` (licence) | **MUST NOT redistribute until licence confirmed** | Phase 2 adds 1:5,000 tree clusters | Check redistribution licence before any integration. |
| **Lisbon CML — "Arvoredo"** | Per-tree dataset; legally-mandated municipal register (Regulamento Municipal do Arvoredo) | Lisboa Aberta / `dados.gov.pt` | CC-BY | `VERIFIED-LEAD` | CC-BY (Lisa-Aberta / dados.gov.pt terms) | Actively maintained | |
| **Infraestruturas de Portugal (IP)** | National road network | UNCONFIRMED | Open-data status **UNCONFIRMED** | `COULD-NOT-VERIFY` | UNVERIFIED | — | Do NOT use until licence and access confirmed. |

### A.3 — Braga PDM numeric values (CONVERGENT-SECONDARY; not primary-source verified)

| Field | Value | Unit | Governing instrument (approx) | Source | Confidence |
|---|---|---|---|---|---|
| Braga PDM — índice de utilização máximo (espaços residenciais) | 1.20 (0.80 above cota de soleira) | ratio | Braga PDM regulamento — specific article NOT confirmed | Research citation | `CONVERGENT-SECONDARY` — upgrade to `VERIFIED-PRIMARY` by reading Art. [X] of Braga PDM directly |
| Braga PDM — cércea máxima (espaços residenciais) | 7.5 m | m | Braga PDM regulamento — specific article NOT confirmed | Research citation | `CONVERGENT-SECONDARY` — upgrade by reading primary PDM text |
| Porto PDM — Art. 11 urban space categories | Two operative categories of urban space, delimited on Planta de Ordenamento by degree of urbanization | — | PDMP — Aviso n.º 12773/2021 (8 Jul 2021) | Research citation from Aviso n.º 12773/2021 | `CONVERGENT-SECONDARY` |
| Lisbon PDM — operative date | In force since revision published 30 Aug 2012, DR 2.ª série, n.º 168 | — | PDM Lisboa | Research citation | `CONVERGENT-SECONDARY` |

### A.4 — National labs & environmental providers (CONVERGENT-SECONDARY; 2026-07-30 review)

> Two similarly-named national labs are **distinct bodies** and must not be conflated.

| Source / layer | Body | Provides | Endpoint / locator | Access | Licence | Confidence |
|---|---|---|---|---|---|---|
| **LNEG** — geology | Laboratório Nacional de **Energia e Geologia** (energy + geology lab) | Geological mapping | LNEG geoportal — **modern OGC API** *(pending-probe)* | Open | *pending-probe* | `CONVERGENT-SECONDARY` — 2026-07-30 review; reviewer ★★★★★. Probe: LNEG OGC API base URL + one collection. |
| **LNEC** — civil engineering / geotech | Laboratório Nacional de **Engenharia Civil** | Civil-engineering / geotechnical data (distinct from LNEG) | LNEC — *pending-probe* | *pending-probe* | *pending-probe* | `CONVERGENT-SECONDARY` — listed to keep it **distinct from LNEG**; do NOT conflate. |
| **Environmental (REN / RAN / Natura 2000 / Protected / Flood)** | APA / LNEG / CCDR (scattered) | Environmental restriction layers | Multiple portals — **no single portal** | Open *(pending-probe)* | *pending-probe* | `CONVERGENT-SECONDARY` — reviewer ★★★★☆ "available but scattered". Each layer traces to a different provider. |

---

## B — UNVERIFIED / OPEN (stays `null` in the pack)

| Field | Why not verified | What would verify it (the exact source to read) |
|---|---|---|
| SNIT WFS field names and attribute schema | GetCapabilities + GetFeature not run | Run probe in `NEXT.md §3.2` — check whether "categoria de espaço", índice, cércea appear as structured WFS attributes or only as PDF reference links |
| SNIT WFS coverage completeness | Unknown — are all 308 PDMs queryable, or only a subset? | GetCapabilities → count FeatureTypes; GetFeature for 3 cities → verify zone polygon is returned |
| DGT LiDAR RMSE-Z (vertical accuracy) | DGT has published no formal RMSE-Z spec | Request from DGT; alternatively check the PRR project documentation at `fundoseuropeus.gov.pt` |
| DGT LiDAR class codes (integer mapping) | The 7 stated classes are named but integer codes are not confirmed vs ASPRS convention | Download one LAZ tile → run `lasinfo` or `pdal info --metadata` → record integer class values |
| DGT LiDAR ~90% coverage current state | Reported from founder deep-dive as "mid-2025 ~90%" but not independently verified | Check DGT CDD coverage map live; record NW gap boundary municipalities |
| Carta Cadastral OGC API status | Planned for 2025 but not confirmed live | Navigate `snig.dgterritorio.gov.pt` → check for OGC API endpoint for cadastral parcels |
| Lisbon CML 3D model redistribution licence | Licence at geodados-cml.hub.arcgis.com unread | Navigate hub URL → click dataset → read Terms of Use tab; if unclear, email CML data team |
| CGPR / SiNErGIC specific coverage per target city | The 127 CGPR + 7 SiNErGIC list is approximate; specific confirmation for Braga / Lisboa / Porto not done | Check DGT SNIC portal or SNIG coverage layer for Braga DICOFRE 0303, Lisboa 1106, Porto 1315 |
| Braga PDM regulamento governing article numbers | Article numbers for índice, cércea, afastamentos not confirmed | Read Braga PDM regulamento directly from SNIT PDF link |
| Lisbon PDM "categorias de espaço" full list + numeric values | Named in research ("Espaços centrais e residenciais consolidados") but index/cércea not sourced | Read Lisboa PDM regulamento from SNIT; specifically the tabela de parâmetros urbanísticos per categoria |
| Porto PDM "índice de edificação" definition (what counts toward area) | Confirmed that Porto uses Art. 11 definition but exact formula text not read | Read PDMP Arts. 11–12 from SNIT/SNIG PDF; record the exact "área de edificação" definition |
| Moda da cércea — Porto PDMP governing article | Named mechanism confirmed; specific article number and formula text not read | Read Porto PDMP regulamento — search for "moda da cércea" term |
| Lisbon "créditos de construção" — Arts. 84/88/89 | Named and article numbers stated in research; full text not read | Read Lisbon incentives regulation Arts. 84/88/89; confirm the mechanism works as stated |
| Lisbon seismic-risk overlay — spatial extent | Mentioned in PDM environmental components; no spatial data sourced | Check Lisboa PDM cartografia de condicionantes for seismic-risk overlay layer |
| Any numeric value for any Portuguese parcel (index, cércea, setback) | No PDM regulamento has been read directly in this research pass | Read target PDM regulamento from SNIT link; add row per value to the relevant municipality SOURCES.md |
| Infraestruturas de Portugal road network — access terms | IP portal not visited | Navigate `infraestruturasdeportugal.pt` → data/open-data section; check licence terms |

---

> ⚠ No numeric índice, cércea, or afastamento value has been verified from a primary PDM source
> for any Portuguese parcel. The Braga figures (índice 1.20, cércea 7.5 m) are cited in research
> but their governing article has not been read directly. They may not be used in any pack at
> `confidence: structured` until the governing article is read and cited here.
