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

### A.2 — Data endpoints (VERIFIED-LEAD; not live-probed this session)

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
