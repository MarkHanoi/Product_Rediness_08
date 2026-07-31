# Portugal — DATA RECON (live endpoint probe)

> **What this file is.** The endpoint-level record for Portugal: every host, service, layer, field,
> CRS, auth requirement and licence **that was actually probed**, with the HTTP status observed.
> It is the evidence base under `PORTUGAL-MASTER-DATA-SOURCE-STUDY.md`; that file reasons, this
> file records.
>
> **Probe session:** 2026-07-31 · **Method:** live HTTP (curl, real User-Agent, rate-limited 1–3 s).
> **Prior state:** the 2026-07-23 research pass was explicitly *archival, no live endpoint probes*.
> This session is the first live probe of Portugal. Several prior assumptions are corrected below.
> **Client identity used:** `PRYZM-Research/1.0 (+https://pryzm.app; contact pryzmhello@gmail.com)`

---

## §0 — HONESTY CONTRACT FOR THIS FILE

Three states, never two:

| State | Meaning |
|---|---|
| **VERIFIED** | A live response was received **and read** this session, or a primary document was downloaded and its text extracted. The status code / quoted text is recorded. |
| **ASSERTED-UNVERIFIED** | Someone (a prior doc, a search result, a portal description) states it; no primary read was achieved this session. |
| **UNKNOWN** | Not investigated, or investigated without a conclusive result. |

Four outcomes that are **NOT the same thing** and are never collapsed (L-422/457/469):
**HTTP error** · **timeout** · **auth/bot wall** · **valid-but-empty result**.

A URL that I guessed and that returned 404 means **my guess was wrong** — it is *not* evidence
that the service is absent. Such rows are marked `GUESS-404`.

---

## §1 — HOST REACHABILITY (VERIFIED — measured 2026-07-31)

| Host | HTTP | Meaning |
|---|---|---|
| `snig.dgterritorio.gov.pt` | **200** | SNIG national geoportal (Drupal front end). Live. |
| `geo2.dgterritorio.gov.pt` | **200** | DGT GeoServer. Live. |
| `servicos.dgterritorio.pt` | **200** | IIS. **The actual SNIT service-delivery host.** Live. |
| `cdd.dgterritorio.gov.pt` | **307** → `/dgt-fe` | DGT Centro de Dados do Território. Live, redirects. |
| `www.dgterritorio.gov.pt` | **301** → `point.dgterritorio.gov.pt` | DGT moved to `point.` |
| **`snit-mais.dgterritorio.gov.pt`** | **401** | **AUTH WALL** — IIS `401 – Unauthorized: Access is denied due to invalid credentials`. See §2. |
| `snitmais.dgterritorio.gov.pt` | **000** | Connection failure (no such host / no route). Distinct from the 401 above. |
| `geodados.cm-lisboa.pt` | **403** | **Cloudflare bot challenge** (`Just a moment...`). NOT absence of data. |
| `sig.cm-porto.pt` | **200** | `Mipweb CMP` portal shell (iframe wrapper). |

### §1.1 — The `snit-mais` 401 corrects a load-bearing prior assumption

`pt/sources/SOURCES.md` and `pt/NEXT.md` §3.2 both record the SNIT endpoint as
`snit-mais.dgterritorio.gov.pt` and prescribe a `GetCapabilities` probe against
`https://snit-mais.dgterritorio.gov.pt/geoserver/wfs`.

**That host returns 401 to anonymous clients** (VERIFIED). It is not a GeoServer and there is no
anonymous WFS there. The resume step as written cannot succeed.

**However** — `snit-mais` is *not* dead, and this is the subtle part: it still serves **static
image assets** referenced by the live services. The `LEGENDLINK` attribute returned by the SNIT
WMS (§3.4) points at
`https://snit-mais.dgterritorio.gov.pt/SNIT/Imagens/PDM/Ordenamento/<file>_leg.jpg`.
So the host is partly public (image paths) and partly credential-gated (application root, `/api`).
Record it as **partially gated**, not "down".

**The real machine-readable SNIT delivery host is `servicos.dgterritorio.pt`** (§3).

---

## §2 — ACQUISITION SEQUENCE STEP 1: GIS SCHEMA INSPECTION

### §2.1 — DGT GeoServer `geo2.dgterritorio.gov.pt/geoserver` (VERIFIED)

| Probe | Result |
|---|---|
| `?service=WFS&version=2.0.0&request=GetCapabilities` | **200**, but body is an `ows:ExceptionReport`: `org.geoserver.platform.ServiceException: Service WFS is disabled` |
| `?service=WMS&version=1.3.0&request=GetCapabilities` | **200**, 130,701 bytes, `WMS_Capabilities` with `xmlns:inspire_vs` + `inspire_common` |
| `/geoserver/web/` | **403** Forbidden (admin UI blocked) |
| `/geoserver/rest/workspaces.json` | **401** Unauthorized (Tomcat 9.0.37) |

> **VERIFIED, and it is the single most consequential schema finding for Portugal:**
> **WFS is explicitly DISABLED on DGT's public GeoServer.** This is not a 404 and not a timeout —
> the server names the condition. **`DescribeFeatureType` — the Denmark-winning move — is
> therefore unavailable on the national GeoServer.** There is no anonymous vector-feature download
> from this host.

**What still works, and is the usable substitute:** `GetFeatureInfo` **with
`INFO_FORMAT=application/json`** is advertised and functional. It returns full GeoJSON including
geometry. This is a viable (if awkward, `FEATURE_COUNT`-limited, non-bulk) attribute + geometry
read path.

**Worked example (VERIFIED).** `caop_continente:cont_municipios` GetFeatureInfo returned a complete
municipality feature with these properties:

```
dtmn, municipio, distrito_ilha, nuts3_cod, nuts3, nuts2, nuts1,
area_ha, perimetro_km, n_freguesias      (geometry_name: "geometria")
```

### §2.2 — Layer inventory: what DGT's GeoServer does and does NOT carry (VERIFIED)

155 `<Name>` elements parsed from the WMS capabilities. Themes present:

| Workspace / prefix | Content |
|---|---|
| `caop_continente:` / `caop_raa:` / `caop_ram:` | CAOP administrative units — `cont_municipios`, `cont_freguesias`, `cont_distritos`, `cont_nuts1/2/3`, `cont_trocos`, `cont_areas_administrativas` (+ Azores `raa_`, Madeira `ram_`) |
| `COS-S1:` / `COS-S2:` / `CLC:` | Land cover — COS 1995/2007/2010/2015/2018/2025, Corine 1990–2012 |
| `altimetria:` | `Cota_altimetrica`, `Curva_de_nivel` |
| `MDT50m:MDT50m` | 50 m terrain model (see §5) |
| `RGN:` | Geodetic networks — `ReNEP`, `RedeGravimetrica`, `RedeMaregrafica`, `RedeNivelamento`, `VG`, `ModeloGeoide` |
| `AE:` / `CIAE2023_preverao:` | Áreas edificadas (built-up areas) 2018 / conjunctural 2025 |
| `DRFloresta:` / `MIAEV:` / `maf:` | Forest / fire / meteorological |
| `teste-ext:` / `ptceu:` / `fototeca:` | Orthophoto framing, grids, photo library |
| `au:AU.AdministrativeUnit(s)` / `AU.AdministrativeBoundary` | INSPIRE Administrative Units theme |

**VERIFIED NEGATIVE — a keyword scan of all 155 layer names for**
`pdm · cadastr · predi · parcel · ordenamento · urban · condicionante · plano · snit · igt · zon`
**returned ZERO matches.**

> **There is no planning (PDM) layer and no cadastral parcel layer on DGT's public GeoServer.**
> Planning lives in a completely separate system (§3). Cadastre is separately gated (§6).
> This is a genuine structural finding, not a gap in the probe.

**CRS offered:** `EPSG:3763` (ETRS89 / Portugal TM06 — the national projected CRS), `4258`
(ETRS89), `4326`, `3857`, plus legacy `20790` / `20791` (Datum Lisboa Hayford Gauss) and
`27492` / `27493` (Datum 73).

---

## §3 — ACQUISITION SEQUENCE STEP 2: INSPIRE / ISO 19139 METADATA (SNIG RNDG)

### §3.1 — The catalogue is live and rich (VERIFIED)

`https://snig.dgterritorio.gov.pt/rndg/srv/por/csw` — **CSW 2.0.2 GetCapabilities = 200**, 19 KB.
(A GeoNetwork instance. Note the path: `/rndg/srv/por/csw`. My earlier guesses
`/csw`, `/geonetwork/srv/eng/csw`, `/geoserver/ows` all returned the Drupal 404 page — `GUESS-404`,
not evidence of absence.)

| Capability | Value (VERIFIED) |
|---|---|
| Operations | `GetCapabilities`, `DescribeRecord`, `GetRecords`, `GetRecordById`, `GetDomain`, `Harvest`, `Transaction` |
| `typeNames` | `csw:Record`, **`gmd:MD_Metadata`**, **`gfc:FC_FeatureCatalogue`**, `dcat` |
| `outputSchema` | `csw/2.0.2`, **`isotc211.org/2005/gmd`** (ISO 19139), **`isotc211.org/2005/gfc`** (feature catalogue), `w3.org/ns/dcat#` |

Full ISO 19139 **and** feature-catalogue output are supported — i.e. the catalogue is capable of
carrying field-level definitions. Whether any *planning* record actually populates a feature
catalogue is **UNKNOWN** (not sampled this session).

### §3.2 — ⚠ MEASURED SEARCH IMPRECISION — read before trusting any count below

GeoNetwork's `AnyText like '%…%'` is **tokenised full-text, not phrase-exact**. This produced a
textbook false positive that would have driven a wrong conclusion:

> Query `AnyText like '%índice de utilização%'` → **104 records matched**.
> Sampling the actual titles: they are **fisheries abundance indices** —
> *"Índice de Abundância de Pescada (Merluccius merluccius) em Junho 2013"* and similar.
> **Not one planning record among the sampled page.** The tokens `índice` + `de` + `utilização`
> matched loosely.

**Measured precision.** For `Formato Vetorial` I checked all 30 records on one page for the literal
string: **25 contained it, 5 did not → ~83 % precision on that page.** A record returned by the
`Formato Vetorial` query (Belmonte PDM) turned out to have `Formato Matricial` in its own abstract.

> **Therefore every count in §3.3 is an APPROXIMATE UPPER BOUND with ~83 % measured precision on a
> single sampled page, not a census.** Do not quote them as exact totals. Do not build a coverage
> claim on them without a per-record verification pass.

### §3.3 — Catalogue hit counts (VERIFIED as returned; see §3.2 caveat)

| Query term | `numberOfRecordsMatched` | Confidence in relevance |
|---|---|---|
| `sdisnit` | **1782** | High — a distinctive service-URL token |
| `condicionantes` | **1244** | High |
| `Formato Matricial` | **1188** | Medium-high (raster plan services) |
| `WFS` | **1011** | Medium |
| `Planta de Ordenamento` | **791** | High |
| `PDM` | **706** | High |
| `descarregamento` (download svc) | **536** | Medium |
| `modelo digital` | **503** | Medium |
| `plano diretor` | **417** | High |
| `Formato Vetorial` | **392** | Medium (~83 % precision measured) |
| `Planta de Implantação` | **322** | High |
| `cadastro` | **160** | Medium |
| `LiDAR` | **105** | Medium |
| `índice de utilização` | ~~104~~ | **FALSE POSITIVE — fisheries. See §3.2.** |
| `Formato Vectorial` (alt sp.) | **97** | Medium |
| `Carta Cadastral` | **40** | Medium |
| `edificabilidade` | **11** | High (rare, distinctive) |
| `SupplementaryRegulation` | **8** | High (INSPIRE PLU theme term) |
| `cércea` | **3** | **High — verified by reading all 3** (§3.5) |
| `SiNErGIC` | **2** | High |
| `uso do solo planeado` | **0** | Valid-but-empty |

### §3.4 — Ratio worth carrying forward, with its caveat

`Formato Matricial` (1188) vs `Formato Vetorial` + `Formato Vectorial` (392 + 97 = 489) suggests
**raster plan services outnumber vector roughly 2.4 : 1** across SNIT. Given §3.2 this is an
**indicative ratio, not a measurement**. What it is *consistent with* is the direct evidence in §4,
where **every one of the 3 PDM services actually opened was `Formato Matricial`.**

### §3.5 — The 3 `cércea` records, read in full (VERIFIED)

All three are genuine planning records, which is why the count is trustworthy where the big ones
are not:

1. *Cartografia Topográfica Vetorial 1:2 000 para o Plano de Urbanização da Cidade de Penafiel e
   Plano de Pormenor de Alinha…* — `dataset`
2. *Plano de Urbanização de Expansão Nascente de Vale de Cambra* — `dataset`
3. *Plano de Pormenor do Bairro das Sortes* — `series`, with service URI
   `https://servicos.dgterritorio.pt/sdisnitWMSPP6_0408_2721_1/wmservice.aspx`

Record 3 is what exposed the SNIT service-URL pattern (§4.1).

---

## §4 — SNIT: HOW PORTUGUESE PLANNING DATA IS ACTUALLY SERVED

### §4.1 — The service-URL pattern (VERIFIED)

```
https://servicos.dgterritorio.pt/SDISNITWMS<PLANTYPE>_<DICOFRE>_<IDIGT>_<VERSION>/wmservice.aspx
        ?service=WMS&request=GetCapabilities&VERSION=1.3.0
```

- `<PLANTYPE>` — observed `PDM1` (Plano Diretor Municipal), `PP6` (Plano de Pormenor).
  The full plan-type code list is **UNKNOWN**.
- `<DICOFRE>` — the municipality code. **This makes the URL space enumerable by municipality.**
- `<IDIGT>` — the SNIT internal plan identifier, also returned as the `IDIGT` attribute.
- `<VERSION>` — an integer that increments with republication.

The three PDM services opened advertise **only** `GetCapabilities`, `GetMap`, `GetFeatureInfo` — no
WFS operations. Underlying software: **Hexagon/Intergraph** (`PostSupportNode
xmlns="http://www.hexagongeospatial.com/WMS"`, GML namespace `intergraph.com/geomedia/gml`).

**I guessed a WFS sibling at `.../sdisnitWFSPP6_0408_2721_1/wfservice.aspx` → 404 (`GUESS-404`).
That guess was wrong, and — as §4.7 now shows — the conclusion it tempted me toward would have been
wrong too. SNIT *does* publish a national WFS, under a different service family entirely.**

### §4.7 — CRUS: SNIT's national VECTOR zoning WFS (VERIFIED — corrects §4.1)

```
https://servicos.dgterritorio.pt/SDISNITWFSCRUS_<DICOFRE>_1/WFService.aspx
  ?service=WFS&request=getcapabilities
```

**CRUS = Carta do Regime de Uso do Solo.** A separate SNIT service family from the `SDISNITWMS…`
plan rasters — and it is **vector**.

| Probe | Result |
|---|---|
| `SDISNITWFSCRUS_1312_1` (Porto) | **200**, 17,083 bytes, **148.5 s** — FeatureType **`gmgml:CRUS_Porto_V`** |
| `SDISNITWFSCRUS_1106_1` (Lisboa) | **200**, 17,088 bytes — FeatureType **`gmgml:CRUS_Lisboa_V`** |
| `SDISNITWFSCRUS_0303_1` (Braga) | **502** after 200.5 s — **gateway error, NOT 404, NOT absence.** No conclusion may be drawn about Braga. |

- **DefaultCRS:** `EPSG:3763` (+ 4326 / 3857 / 4258)
- **Output formats:** GML 2.1.2 / 3.0.0 / 3.1.1 / 3.2, **`application/vnd.geo+json`**, CSV, KML, protobuf
- **WFS versions:** 1.1.0, 2.0.0

**Schema (`DescribeFeatureType`, `gmgml:CRUS_Lisboa_V`):**

```
ID (int) · DTCC (str4) · Municipio · Classe · Categoria · Area_Ha (double)
· Designacao_PlantaOrdenamento · Escala_PlantaOrdenamento
· Data_PublicacaoPDM (dateTime) · Fonte · Autor · Geometry
```

**Live rows returned (Lisboa):**
```
344221 | 1.766 ha | Classe=Solo Urbano | Categoria=Espaço de Uso Especial Equipamentos e Infraestruturas
       | "Solo Urbano - Espaço de Uso Especial de Equipamentos Consolidado" | 1/10000 | 2020-10-16 | DGT
344222 | 1.235 ha | Classe=Solo Urbano | Categoria=Espaço Verde
       | "Solo Urbano - Espaço Verde de Recreio e Produção Consolidado"
```

> **This materially improves Portugal's picture and corrects the impression left by §4.4.**
> You **do** get national **vector zoning polygons** carrying the DR 15/2015 `Classe`
> (solo urbano / rústico) and `Categoria`, with a `Data_PublicacaoPDM` currency stamp.
> **You do not have to OCR a TIFF to obtain zone boundaries.**
>
> **What survives unchanged:** `Area_Ha` is polygon area, not a planning parameter. There is **no
> índice, no cércea, no número de pisos, no afastamento** — the 11 fields are wholly
> categorical/administrative. **The numeric envelope is still PDF-only.**
>
> The correct statement is therefore: **geometry + category are structured and national;
> the numbers are not.** That is the France pattern, not the "even the boundary is a picture"
> pattern §4.4 alone implies.

**⚠ Performance warning — this is a real operational finding.** `servicos.dgterritorio.pt` is
**severely slow**: 148 s for a GetCapabilities, 132–172 s observed for `DescribeFeatureType` /
`GetFeature`, and one hard **502** after 204 s. **A 30 s client timeout will report this endpoint as
dead when it is merely slow.** Any pipeline needs long timeouts plus retry. Several `000`s in my own
earlier logs are explained by this, not by my rate-limiting alone.

### §4.2 — Services opened this session (VERIFIED)

| City | DICOFRE | Service | Format declared in `<Abstract>` |
|---|---|---|---|
| **Lisboa** | `1106` | `SDISNITWMSPDM1_1106_1815_2` | **`Formato Matricial`** |
| **Porto** | `1312` | `SDISNITWMSPDM1_1312_3027_3` | **`Formato Matricial`** |
| Belmonte | `0501` | `SDISNITWMSPDM1_0501_4144_2` | **`Formato Matricial`** |
| Mogadouro (PP Bairro das Sortes) | `0408` | `sdisnitWMSPP6_0408_2721_1` | **`Formato Matricial`** |

CSW metadata date for both Lisboa and Porto records: **2026-03-06**.

> **HEADLINE: the PDMs of Portugal's two largest cities are published on the national portal as
> georeferenced RASTER images.** Not vector zoning polygons. This is VERIFIED from each service's
> own `<Abstract>` and confirmed by the `IMAGENAME` attribute (§4.4) resolving to a `.tif`.

### §4.3 — Layer naming is uniform at the PREFIX, per-municipal at the SUFFIX (VERIFIED)

I initially read Belmonte's `1.1 / 1.2 / 2.1…2.4` numbering as a national standard.
**Opening Lisboa and Porto disproves that.** Correcting it here:

| City | Zoning layer (the one that matters) | Other layers |
|---|---|---|
| **Belmonte** | `Planta_de_Ordenamento_-_1_1_-_Classificacao_e_Qualificacao_do_Solo` | `1_2 Sistemas_de_Salvaguarda`, `1_3 Infraestruturas…`, `2_1…2_4 Condicionantes` (Outras, Perigosidade de Incêndio, RAN, REN) |
| **Lisboa** | `Planta_de_Ordenamento_-_1_-_Qualificacao_do_Espaco_Urbano` | `2 Estrutura_Ecologica_Municipal`, `3 Sistema_de_Vistas`, `4/5 Riscos_Naturais_e_Antropicos_I/II`, `6 Condicionantes_de_Infraestruturas`, `7 Acessibilidades_e_Transportes`, `8/9 Servidoes_Administrativas…_I/II`, `Planta_do_Anexo_I_do_Regulamento` |
| **Porto** | `Planta_de_Ordenamento_-_1A_-_Qualificacao_do_Solo` | `1B Estrutura_Ecologica_Municipal`, `1C Riscos_Naturais`, `1D Zonamento_Acustico`, `1E/1F Patrimonio_I/II`, `1G Estrutura_Viaria_e_Estacionamento`, `2A Condicionantes_Geral`, `2B Perigosidade_de_Incendio_Florestal` |

**What IS nationally uniform (VERIFIED across all 4 services):**
- The two document families `Planta de Ordenamento -` and `Planta de Condicionantes -` as layer-name prefixes.
- A `Limite_do_IGT` layer on every service (the plan's own boundary).
- All layers carry `queryable="1"`.

**What is NOT uniform:** the sub-plan numbering (`1.1` vs `1` vs `1A`), and the zoning layer's own
name — *Classificação e Qualificação do Solo* / *Qualificação do Espaço Urbano* / *Qualificação do
Solo*. **An adapter must resolve the zoning layer per municipality; it cannot hard-code the name.**

### §4.4 — GetFeatureInfo returns RASTER-TILE METADATA, not zoning attributes (VERIFIED)

This is the decisive test and it was run on all three PDMs. Every one returns the **same 11-attribute
envelope**, and **none of the attributes describes the zone under the cursor**:

| Attribute | Lisboa (`1106`) | Porto (`1312`) | Belmonte (`0501`) |
|---|---|---|---|
| `IDRASTER` | `10096` | `9217` | `12239` |
| `IDIGT` | `1815` | `3027` | `4144` |
| `NAME` | *Planta de Ordenamento - 1 - Qualificação do Espaço Urbano* | *…- 1A - Qualificação do Solo* | *…- 1.1 - Classificação e Qualificação do Solo* |
| `LEGENDLINK` | `…/pdm1106_1142023_or_1_leg.jpg` | `…/pdm1312_932021_or_1a_leg.jpg` | `…/pdm0501_1312025_or_11_leg.jpg` |
| **`IMAGENAME`** | **`PDM1106_1142023_Or_1.tif`** | **`PDM1312_932021_Or_1A.tif`** | **`PDM0501_1312025_Or_11.tif`** |
| `IDMETADATA` | `c9137771-94b8-…` (UUID) | `11b3932f-b338-…` (UUID) | `02.05.01/PDM/03/2025/131_Or_11` (path-style) |
| **`IDDEPOSITO`** | `03.11.06/PDM/02/2023/114` | `01.13.12/PDM/03/2021/93` | `02.05.01/PDM/03/2025/131` |
| **`IDESTADO`** | `2` | `2` | `2` |
| **`VALIDADE`** | `1` | `1` | `1` |
| `OBSERVACOES` | *(empty)* | *(empty)* | *(empty)* |
| `IdValidade` | `1` | `1` | `1` |

`INFO_FORMAT` supported: `text/xml`, `text/html`, `application/gml+xml; version=3.1`.
**`application/json` is NOT offered** by the SNIT WMS (unlike DGT's GeoServer).

> **Consequence, scoped to THESE services:** the `SDISNITWMS…` plan services let you ask *"which plan
> governs this point, is it in force, and what is its legal deposit reference"* and get a machine
> answer. They **cannot** tell you the categoria de espaço or any numeric parameter — on this
> service family that is **coloured pixels in a TIFF**, decodable only against a **legend JPEG**.
>
> **⚠ Do NOT generalise this to "Portugal has no vector zoning" — see §4.7.** A different SNIT
> service family, **CRUS**, publishes the same zoning as **vector polygons** with `Classe` and
> `Categoria`, nationally. The correct summary is: **the plan PLATES are raster; the zoning
> GEOMETRY + CATEGORY are vector and national; only the NUMBERS are PDF-only.**

**Honesty note on one probe.** Porto's first GetFeatureInfo returned **valid-but-empty**; a retry at
the same layer with a slightly different bbox returned the full attribute set above. The empty
result was transient, **not** absence. Subsequent `000`s in my log were **my own client timeouts
from querying too fast** — my failure, not the server's. Recorded so nobody re-reads the raw log as
"Porto is broken".

### §4.5 — The legal-status attributes — Portugal's answer to the Denmark question

The brief asked whether Portugal encodes **binding vs indicative** in published metadata, as
Denmark does with `bygkunifelt` / `bygvejledende`. The verified answer is **partly, and at a
different granularity**:

| Field | Reading | Status |
|---|---|---|
| **`IDESTADO`** | Plan *state*. Observed value `2` on all three in-force PDMs. The codelist is **NOT published at the endpoint**. | **VERIFIED as present; semantics UNKNOWN** |
| **`VALIDADE`** / `IdValidade` | Plan *validity*. Observed `1` on all three. Codelist **not published at the endpoint**. | **VERIFIED as present; semantics UNKNOWN** |
| **`IDDEPOSITO`** | **Legal deposit reference** — the DGT registration of the plan instrument, e.g. `01.13.12/PDM/03/2021/93`. Structure appears to be `<?>.<district>.<municipality>/<plantype>/<seq>/<year>/<number>`; Porto `01.13.12` and Lisboa `03.11.06` both embed their DICOFRE (`1312`, `1106`) as `.13.12` / `.11.06`. | **VERIFIED as present; leading segment + full grammar UNKNOWN** |

> **The honest verdict.** Portugal **does** encode legal authority in published metadata —
> `IDESTADO`, `VALIDADE` and above all `IDDEPOSITO` are a real provenance/authority chain, and
> `IDDEPOSITO` is a genuinely valuable evidence-chain anchor (it ties a rendered pixel back to a
> registered legal instrument).
>
> **But it operates at PLAN level, not ZONE level** — and that is the crucial difference from
> Denmark. Denmark's flags tell you whether *this polygon's* provision binds. Portugal's tell you
> whether *this plan document* is in force. **Because the payload is a raster, there is no zone
> object for a status flag to attach to.** Portugal cannot answer the binding-vs-indicative
> question per zone through metadata, because Portugal has no published zone objects here at all.
>
> **The codelists are the cheapest open question in this whole file.** `IDESTADO=2` and
> `VALIDADE=1` are almost certainly "em vigor / válido", but that is **ASSERTED-UNVERIFIED** —
> I did not find the codelist. One email to `snit.web@dgterritorio.pt` (the contact address
> published in every SNIT `GetCapabilities`) should resolve both. **Do not assume `2` = in force
> in code until it is confirmed.**

### §4.6 — Braga: a "0 results" that must NOT be read as "no PDM"

`AnyText like '%SDISNITWMSPDM1_0303%'` → **0 records**.

This means **no catalogue record contains that URL substring**. Braga may publish under a different
`<PLANTYPE>` code, a different service-name convention, or its record may not embed the URL in an
indexed field. **`0` here is a valid-but-empty search result about a URL pattern — it is NOT
evidence that Braga lacks a PDM.** Braga's PDM is in force per the prior research pass.
Resolve by listing services per DICOFRE rather than by URL-substring search.

---

## §5 — TERRAIN / ELEVATION (partial — see companion note)

**Correction to `pt/COUNTRY-RATE.md`.** That file marks the TERRAIN axis
`(blk)` = `license-restriction`, on the stated grounds of "no open national bare-earth DTM
published by DGT".

**VERIFIED this session:** DGT's public GeoServer **does** publish `MDT50m:MDT50m`, plus
`altimetria:Curva_de_nivel` and `altimetria:Cota_altimetrica`, all reachable anonymously over
WMS 1.3.0.

**What that does and does not establish.** It establishes that a national terrain **product exists
and is anonymously viewable**. It does **not** establish that a **downloadable, licence-clear,
bare-earth DEM at usable resolution** exists — a 50 m WMS raster is a *picture of* terrain, not an
elevation grid, and 50 m is far too coarse for parcel-level work regardless. The `blocked` marking
may still be right about *download*; it is **demonstrably wrong about publication**.

**Status: the axis marking needs revisiting, not flipping.** The precise question —
whether the 2024–25 PRR LiDAR campaign products (MDT 50 cm / MDS 2 m / classified LAZ) are
downloadable and under what licence and whether registration is required — was delegated to a
parallel probe whose result is recorded in `PORTUGAL-MASTER-DATA-SOURCE-STUDY.md` §Terrain.
Until that lands, this file records: **`MDT50m` viewable = VERIFIED; LiDAR download terms =
UNKNOWN at time of writing this section.**

---

## §6 — CADASTRE (parcel geometry)

| Finding | State |
|---|---|
| No cadastral layer on DGT's public GeoServer (155-layer keyword scan) | **VERIFIED NEGATIVE** |
| SNIG catalogue holds ~160 `cadastro` + ~40 `Carta Cadastral` records | **VERIFIED** (counts approximate, §3.2) |
| `SiNErGIC` → 2 catalogue records | **VERIFIED** |
| Whether any of those records resolves to an anonymously queryable parcel-geometry service | **UNKNOWN** — not resolved this session |
| CGPR 127 / SiNErGIC 7 / no-cadastre 174 municipality split | **ASSERTED-UNVERIFIED** — carried from the 2026-07-23 pass; no primary DGT source read |
| Cadastral coverage for Lisboa (1106) / Porto (1312) / Braga (0303) | **UNKNOWN** — still the #1 gate, unchanged |

**The prior study's headline — that parcel geometry, not zoning, is Portugal's hard problem —
is not contradicted by anything found this session, and is mildly reinforced:** cadastre is absent
from the one national GeoServer that anonymous clients can actually read.

---

## §7 — MUNICIPAL PORTALS

### §7.1 — Porto (1312) — municipal GIS is wide open (VERIFIED)

| Endpoint | HTTP | Finding |
|---|---|---|
| `fedservergeo.cm-porto.pt/arcgis/rest/services?f=json` | **200** | **ArcGIS Server 11.5, anonymous.** 23 folders incl. `PDM2021`, `Urbanismo`, `PDM_Monitorizacao`, `SRU_Publicacao` |
| `.../PDM2021?f=json` | **200** | 18 services (`PO1A_QS`, `CCGD_PUBLICACAO`, `ISZI`, `POCZA`, `POCRN`, `PC2`, `CAEC`…) |
| `.../PDM2021/PO1A_QS/MapServer?f=json` | **200** | *"Planta de Ordenamento – Carta de Qualificação do Solo"*, **EPSG:3763**, caps `Map,Query,Data`, layers 0–8 |
| `.../PO1A_QS/MapServer/8?f=json` | **200** | **"Qualificação do solo funcional"** — 36 fields: `c_espaco`, `sc_espaco`, `designacao_po`, `cod_dmpu`, `tema_dmpu`. **Zero numeric planning fields** |
| `.../MapServer/8/query?where=1=1&f=json` | **200** | Live records: `sc_espaco` = `TE2AH`, `TE2AFUCT1`, `TE2AFUCT2`, `TE2AETM`, `TE2ABIIL`, `TE2AE`. `exceededTransferLimit:true` (maxRecordCount 2000) |
| `.../PDM2021/CZP/MapServer?f=json` | 200 body, **ArcGIS error 500** | `"Service PDM2021/CZP/MapServer not started"` — **service EXISTS but is STOPPED.** Not a 404, not a wrong guess |
| `geopdm.cm-porto.pt/services/pdm/wms?…GetCapabilities` | **200** | GeoServer WMS 1.3.0, **361 named layers**, 142 queryable. `<Fees>none</Fees>`, `<AccessConstraints>none</AccessConstraints>` |
| `geopdm.cm-porto.pt/geoserver/PDM_2021mai_RDP/ows?service=WFS` | **200** (97,972 B) | **`<FeatureTypeList>` is EMPTY — 0 feature types.** A valid-but-empty result: WFS advertised, publishes nothing |
| `opendata.porto.digital/api/3/action/package_search?q=pdm` | **200** | CKAN, **count = 21** PDM datasets. Licences `cc-zero` (most) + `odc-odbl` |

**The one numeric hit — and its limits (VERIFIED).** `cc_czp.gpkg` (*Carta de Zonamento
Perequativo*, **CC-Zero**, 136,052,736 bytes), opened as SQLite, EPSG:3763. Table
**`CC_UTPEREQUATIVAS_PL`**:

| designacao | area_impla | **edificab_m** | area_edif |
|---|---|---|---|
| Área Central | 4,317,036.141 | **1.18** | 19,613,082.925 |
| Área Ocidental e Arco Exterior | 2,585,107.71 | **0.67** | 14,082,895.743 |
| Área Oriental | 112,554.901 | **0.25** | 509,363.249 |

`edificab_m` is an **edificabilidade média** — and the table has **only 3 rows**, three city-wide
perequação macro-zones. **It is the equity/compensation reference index, NOT a per-parcel or
per-zone binding envelope.** Do not wire it as a FAR. Companion `CC_ACBIOFISICAS_PL` (68 rows)
holds only 0/1 flags.

### §7.2 — Lisboa (1106) — municipal zoning is behind a token wall (VERIFIED)

| Endpoint | HTTP | Finding |
|---|---|---|
| **`gisbase.cm-lisboa.pt/arcgisbase/rest/services/MuniSIG_Secure/WS_Planeamento_PDM2011_TESTE_FGC/MapServer?f=json`** | 200 body, **ArcGIS error 499** | **`{"error":{"code":499,"message":"Token Required"}}` — AUTH WALL.** The `MuniSIG_Secure` folder is not listed in the anonymous root at all |
| `services.arcgis.com/1dSrzEWVQn5kHHyK/…/services?f=json` | **200** | CML AGOL org, ~105 public FeatureServers. **No PDM zoning layer among them** |
| `.../services/Planeamento/FeatureServer?f=json` | **200** | Only 2 layers — *Limite de Planos de Pormenor*, *Limite de Planos de Urbanização*. **PP/PU boundaries, not zoning** |
| `gisbase.cm-lisboa.pt/arcgis/rest/services/OpenDataLX?f=json` | **200** | `"services":[]` — **valid but empty** |
| `websig.cm-lisboa.pt/MuniSIG/REST/sites/LxInterativa/map?f=json` | **200** (3,215,068 B) | Public viewer config — exposes the secured service's URL and its field schema |
| `dados.cm-lisboa.pt/api/3/action/package_search?q=pdm` | **200** | **count = 0.** Control with empty `q` → **count = 407**. The portal works; it genuinely holds **no** PDM dataset |

**Lisboa municipal zoning field schema (VERIFIED from the PUBLIC viewer config, not from behind the
wall)** — layer *"Planta de Ordenamento – Qualificação do Espaço Urbano"*:

```
OBJECTID · NOME · COD_SIG · INFOPDM · ART_RPDM · SE_ANNO_CAD_DATA · SHAPE · SHAPE.AREA · SHAPE.LEN
```

**`ART_RPDM` is a pointer to a Regulamento article — not a value.** A regex sweep of the whole
3.2 MB config for `índice|utiliza|edificab|cércea|altura|piso|volumetr|densidade` **as field names**
returned only `OCUPACAO`, `TIPOUTILIZ`, `VOLUME_OBRA` — permit-tracking fields on unrelated layers.
**No índice, no cércea, no número de pisos anywhere.**

### §7.3 — Two honesty notes on the municipal probes

1. **The Cloudflare 403 on `geodados.cm-lisboa.pt` did NOT reproduce.** A later probe the same day
   got **302 → 200** to `geodados-cml.hub.arcgis.com`. **Both observations are real; neither is
   settled.** Bot challenges are intermittent and client-dependent. Do not record "Lisboa is
   bot-walled" as a stable fact — and equally, do not record it as open.
2. **What the token-protected Lisboa service actually exposes is UNKNOWN.** The viewer config shows
   9 fields; the service behind the token may expose more. **No attempt was made to obtain a token.**

### §7.4 — Municipal endpoints NOT verified

- `fedservergeo.cm-porto.pt/arcgis/services/PDM2021/CCGD_PUBLICACAO/MapServer/WFSServer` — appears in CKAN metadata only, **never fetched. ASSERTED-UNVERIFIED.**
- `po_cqs.gpkg` (Porto Qualificação do Solo GeoPackage) — **not downloaded**; its field list is asserted from the ArcGIS REST schema of what should be the same source. The distribution could differ.
- 6 remaining Porto CKAN datasets — **not inspected.** The "only CZP carries numbers" claim covers only what was opened.
- Porto `CRUS_1312` `DescribeFeatureType` — **HTTP 502** after 204 s; its schema is *inferred* symmetric with Lisboa's. **UNVERIFIED.**
- `sig.cm-porto.pt` — 200, `Mipweb CMP` iframe shell; inner endpoints not enumerated.

---

## §8 — PRIMARY LEGAL DOCUMENTS: THE PDFs ARE TEXT, NOT SCANS (VERIFIED)

This is the finding that changes Portugal's cost structure, and it is the direct analogue of the
Berlin "text-PDF" probe verdict.

### §8.1 — Porto PDM Regulamento

- **URL:** `https://pdm.cm-porto.pt/documents/121/Regulamento_PDMPorto.pdf` — **HTTP 200**, 1,641,985 bytes
- **Document:** *Plano Diretor Municipal — Regulamento — Janeiro 2023*
- **Structure probe:** 100 pages · 100 `/Font` refs · **only 2 `/DCTDecode`** (i.e. 2 JPEGs, not 100 scanned pages)
- **Text extraction:** succeeded — **319,459 characters** of real, searchable Portuguese text.

> **VERIFIED: the Porto PDM regulamento is a TEXT PDF. No OCR is required.**
> Definitions and numeric parameters are directly extractable. See §9.

### §8.2 — Lisboa

| Document | URL | HTTP | Pages | Chars | Type |
|---|---|---|---|---|---|
| *Regulamento Municipal … Sistema de Incentivos a Operações Urbanísticas com Interesse Municipal* | `lisboa.pt/fileadmin/info_administrativa/normativas/regulamentos/urbanismo/Regulamento_Municipal_que_aprova_o_Sistema_de_Incentivos…pdf` | **200** | 58 | 107,700 | **Text PDF** |
| *Aviso n.º 11549/2021* — Alteração do Plano de Pormenor da Avenida José Malhoa | `files.dre.pt/2s/2021/06/119000000/0023900251.pdf` | **200** | 13 | 32,655 | **Text PDF** |

Both extract cleanly. **Note:** the DRE document is a *Plano de Pormenor* alteration, **not** the
Lisboa PDM regulamento — I had expected the PDM and record the mismatch rather than paper over it.
The **Lisboa PDM regulamento (RPDML) itself was NOT retrieved this session** — its numeric
parameter tables remain **UNKNOWN**.

### §8.3 — What this means

Portugal's planning numbers are locked in PDFs — but they are **machine-readable PDFs**, and the
plan-to-PDF linkage is discoverable through SNIT (`IDDEPOSITO`) and the municipal PDM sites.
**The engineering problem is text extraction + rule authoring, not OCR.** That is a materially
cheaper problem than the raster finding in §4 alone would suggest, and the two findings must
always be reported together or the cost estimate will be wrong in one direction or the other.

---

## §9 — NUMERIC PARAMETERS READ FROM PRIMARY SOURCE (VERIFIED — Porto)

Extracted from the Porto PDM Regulamento (Janeiro 2023). **Term frequencies across the whole
regulamento** — these are counts I measured, not estimates:

| Term | Count | Note |
|---|---|---|
| `edificabilidade` | **116** | The umbrella concept; has its own article series |
| `alinhamento` | 29 | |
| `cércea` | 20 | |
| `qualificação do solo` | 20 | |
| `ocupação` | 19 | |
| `área de edificação` | 18 | |
| `solo urbano` | 9 | |
| `colmatação` | 7 | |
| `índice de edificação` | 5 | Porto's FAR term |
| `moda da cércea` | 5 | |
| `profundidade` | 3 | |
| `afastamento` | 1 | |
| `solo rústico` | 1 | |
| **`índice de utilização`** | **0** | **Porto does not use this term** |
| **`altura da edificação`** | **0** | **Porto does not use this term** |

> The two zeroes **confirm from primary source** what the 2026-07-23 pass could only assert:
> Porto uses *índice de edificação* + *cércea*, not *índice de utilização* + *altura da edificação*.

### §9.1 — Definitions, verbatim (Artigo 3.º — Definições)

| Alínea | Term | Verbatim definition (abridged where marked …) |
|---|---|---|
| **d)** | **Área de edificação** (*"também designada ae"*) | *"o somatório da área de cada um dos pisos, expresso em metros quadrados (m2), de todos os edifícios que existem ou podem ser realizados na(s) parcela(s), com exclusão de: i. Terraços descobertos, varandas, desde que não envidraçadas, e balcões abertos para o exterior; ii. Espaços livres de uso público cobertos pelas edificações; iii. Sótão sem pé-direito regulamentar para fins…"* |
| **g)** | **Cércea (acima do solo)** | *"a dimensão vertical da construção, medida a partir do ponto de cota média do terreno marginal ao alinhamento da fachada até à linha superior do beirado, platibanda ou guarda do terraço, incluindo andares recuados mas excluindo acessórios: chaminés, casa de máquinas de ascensores, depósitos de água, etc."* |
| **l)** | **Frente urbana** | *"plano definido pelo conjunto das fachadas dos edifícios confinantes com uma dada via pública e compreendido entre duas vias públicas sucessivas que o intersetam"* |
| **m)** | **Índice de edificação** | *"razão entre área de edificação, excluídas dos equipamentos de utilização coletiva a ceder ao domínio municipal, e a área da(s) parcela(s), ou a área do plano (categoria de espaço, unidade operativa de planeamento e gestão, plano de urbanização, plano de pormenor ou unidade de execução) a que se reporta"* |
| **o)** | **Moda da cércea** | *"é a cércea que apresenta maior extensão ao longo de uma frente urbana edificada"* |
| **p)** | **Parcela** | *"Área de território delimitada física, jurídica ou topologicamente, não resultante de uma operação de loteamento, e que corresponde ao prédio ou conjunto de prédios objeto de uma operação urbanística"* |
| **c)** | **Altura dominante das fachadas** | *"é a que apresenta maior extensão ao longo do alinhamento urbano entre arruamentos concorrentes"* |
| **f)** | **Cedência média** | quotient of land ceded to the Município over área de edificação |

> **The `área de edificação` definition closes a gap the prior study flagged as open.** That study
> stated Portugal has *no national decree defining what counts toward área de edificação, so even
> the formula must be sourced per PDM*. That remains true nationally — **and here is Porto's
> formula, now sourced.**

### §9.2 — Numeric envelope rules (VERIFIED, Porto)

| Article | Rule | Value |
|---|---|---|
| **Art. 32.º — Edificabilidade** | Existing buildings with `índice de edificação < 1` may extend **up to 1**, provided `índice de impermeabilização ≤ 0,6` of parcel area | **IE ≤ 1** |
| **Art. 32.º** | New buildings: área de edificação may not exceed that resulting from an `índice de edificação` of **1** | **IE = 1** |
| **Art. 36.º** | Área de Atividades Económicas Tipo I — `índice de edificação máximo` **1,8**; impermeable area ≤ **70 %** | **IE ≤ 1,8** |
| **Art. 38.º** | Área de Atividades Económicas Tipo II — `índice de edificação máximo` **1,4**; impermeable area ≤ **70 %** | **IE ≤ 1,4** |
| (Espaços Centrais) | **Cércea ≤ width of the confronting arruamento**, measured between the limits of the dominant/established public space | **cércea ≤ street width** |
| (Espaços Centrais) | Where the public-space cross-section **> 21 m**, `cércea máxima = 21 m` — **unless the moda da cércea is higher, in which case the moda prevails** | **cap 21 m, moda overrides** |
| (Espaços Centrais) | Where a frontage widens only locally, the cércea is that admitted for the rest of the frontage | fabric-derived |
| | **Building depth**: constructive extension at logradouro level may not exceed **25 m** from the alinhamento da frente urbana (a second subcategory states **30 m**), and must not push `índice de impermeabilização` above **0,7** | **profundidade ≤ 25 m / 30 m** |
| | **Setback**: upper storeys must keep an `afastamento` to plot limits **≥ half their height, minimum 3 m**, except where closing a party wall (colmatação de empena) | **afastamento ≥ H/2, min 3 m** |
| | Max **3 storeys** above ground in the stated subcategory, except in *colmatação* of consolidated ensembles where storey count is set by the **moda da cércea** | 3 storeys / fabric-derived |
| | Logradouros/block interiors must be permeable; `índice de permeabilidade ≥ 0,3` of parcel; ancillary structure max **10 m²** | permeability 0,3 |
| | Parcels **> 2000 m²** are exempted from the frontage-implantation constraint | threshold |
| | Pitched roofs: eaves slab aligns with facade/top-floor ceiling junction; pitch **≤ 30°** | roof form |

### §9.3 — Perequação: Portugal's equalisation machinery (VERIFIED — article headings)

Porto's regulamento carries a dedicated article series:

- **Art. 131.º** — Disposições base relativas à edificabilidade
- **Art. 132.º** — Conceitos associados à edificabilidade
- **Art. 133.º** — UT para efeitos de perequação da edificabilidade
- **Art. 134.º** — **Edificabilidade média e edificabilidade abstrata**
- **Art. 135.º** — **Edificabilidade concreta e compensações**

Plus 13 further `Artigo N.º — Edificabilidade` articles (20, 24, 27, 30, 32, 36, 38, 47, 51, 54, 91, 95).

> **`edificabilidade média` / `abstrata` / `concreta` is a land-value-equalisation system** — the
> abstract development right attaching to land vs the concrete one realised on it, with
> compensation for the difference. This is the same conceptual family as Lisboa's *créditos de
> construção* (§10) and has **no analogue in the C58 schema**. The article text was not read in
> full — the **headings** are verified; the mechanics are **UNKNOWN**.

---

## §10 — LISBOA: CRÉDITOS DE CONSTRUÇÃO — CORRECTED (VERIFIED)

**Source:** *Regulamento Municipal que aprova o Sistema de Incentivos a Operações Urbanísticas com
Interesse Municipal*, approved by **Deliberações n.os 53/AM/2013 e 60/AM/2013, de 21 de maio**,
published in the **3.º Suplemento do Boletim Municipal n.º 1006, de 30 de maio de 2013**.
`créditos de construção` occurs **132 times**.

**Mechanism (verbatim, abridged):** credits are used *"pelo acréscimo dos metros quadrados que
correspondem à **superfície de pavimento** determinada por aplicação dos índices previstos no
RPDML, até ao limite correspondente ao **índice de edificabilidade** máximo que possa resultar da
utilização de tais créditos, aplicável às diversas **categorias de espaço e traçados urbanos**
definidos no RPDML"*. Credits are represented by transferable **Títulos**, may be used across one
or more operations, and approval orders must identify the credits and the Títulos they came from.

### §10.1 — ⚠ The suspension — and the misreading I nearly committed

The document carries, as a **running header on many pages**:
`*(Suspenso pela Deliberação 415/AML/2022 publicado no 2º Suplemento do Boletim Municipal n.º 1486, de 11 de agosto de 2022)`

Read alone, that says **the whole regime is suspended**. **It does not.** The cover page states the
scope precisely:

> *"**Alínea g) do n.º 1 do artigo 2.º e da alínea i) do n.º 2 do artigo 5.º suspensas** pela
> Deliberação 415/AML/2022 publicado no 2º Suplemento do Boletim Municipal n.º 1486, de 11 de
> agosto de 2022"*

> **VERIFIED: the suspension is PARTIAL — two specific alíneas (Art. 2(1)(g) and Art. 5(2)(i)),
> suspended since 11 August 2022. The créditos de construção regime as a whole remains in force.**
>
> I record my own near-error deliberately: the asterisked running header is genuinely ambiguous and
> I first read it as a total suspension. Anyone re-reading this document will hit the same trap.

**Engineering consequence.** The prior study's call — that Lisboa needs a C58 `transferableRights`
overlay before a pack can be authored — **stands**, but with two corrections: (a) the instrument is
a **separate municipal regulation, not PDM Arts. 84/88/89** as previously recorded (those article
numbers were **not** confirmed in the document read this session — treat as
**ASSERTED-UNVERIFIED**); (b) two alíneas are suspended and a pack must not grant credits under them.

### §10.2 — Lisboa's vocabulary differs from Porto's (VERIFIED)

`índice de edificabilidade` (3 occurrences) and `superfície de pavimento` are Lisboa's terms —
**not** Porto's `índice de edificação` / `área de edificação`, and **not** the generic
`índice de utilização`. `RPDML` = Regulamento do PDM de Lisboa. Lisboa also uses
**`traçados urbanos`** as a classification axis alongside `categorias de espaço`. See the
genome table in `PORTUGAL-MASTER-DATA-SOURCE-STUDY.md` §Genome.

---

## §11 — DICOFRE CORRECTION (VERIFIED — defect in existing repo docs)

Queried DGT's own authoritative `caop_continente:cont_municipios` by point:

| City | Probe point | Returned `dtmn` | `municipio` | area_ha | n_freguesias |
|---|---|---|---|---|---|
| Porto | 41.1446, −8.6159 | **`1312`** | **Porto** | 4142.02 | 7 |
| Lisboa | 38.7173, −9.1443 | **`1106`** | Lisboa | 10005.43 | 24 |
| Braga | 41.5450, −8.4265 | **`0303`** | Braga | 18339.95 | 37 |

> **DEFECT: the repo uses `pt/pt-13/1315-porto/` — but Porto's DICOFRE is `1312`, not `1315`.**
>
> Independently corroborated: Porto's SNIT PDM service is `SDISNITWMSPDM1_**1312**_3027_3`
> (titled *Plano Diretor Municipal do Porto*), and its `IDDEPOSITO` is `01.**13.12**/PDM/03/2021/93`.
> Three independent sources agree on 1312.
>
> `1315` is **some other municipality** in the Porto district — I did **not** verify which, and do
> not guess it here.
>
> Affected paths: `pt/pt-13/1315-porto/**` (8 files) and the `Porto (1315)` row in
> `pt/COUNTRY-RATE.md`. **I have NOT renamed these** — the folder is referenced from
> `COUNTRY-RATE.md` and possibly from code registries outside my ownership boundary. Logged for the
> owner; see `NEXT.md`.

---

## §12 — WHAT IS GATED, AND WHAT I DID NOT ATTEMPT

| Gate | Nature | Action taken |
|---|---|---|
| `snit-mais.dgterritorio.gov.pt` | **IIS 401** credential wall on app root + `/api` | Documented. **No credential attempt.** |
| `geo2…/geoserver/rest/*` | **401** Tomcat admin API | Documented. **No credential attempt.** |
| `geo2…/geoserver/web/` | **403** admin UI | Documented. |
| `geodados.cm-lisboa.pt` | **Cloudflare bot challenge** | Documented as a challenge, not absence. **No bypass, no CAPTCHA solving.** |
| DGT CDD download / registration | Delegated probe | **No account created.** Result folded into the master study. |

Per the standing instruction: **a clearly documented gate is a valid deliverable.** No account was
created, no credential was supplied, and no bot protection was circumvented anywhere in this session.

---

## §13 — OPEN QUESTIONS RANKED BY VALUE-PER-EFFORT

| # | Question | Cost | Why it matters |
|---|---|---|---|
| 1 | **`IDESTADO` / `VALIDADE` codelists** | One email to `snit.web@dgterritorio.pt` | Turns a verified-but-opaque field into a usable in-force test. Cheapest high-value item in this file. |
| 2 | **`IDDEPOSITO` grammar** (what is the leading `01.` / `02.` / `03.` segment?) | Same email | It is the evidence-chain key linking pixel → registered instrument. |
| 3 | **Does ANY Portuguese municipality publish vector PDM zoning with NUMERIC attributes?** *(vector zoning itself is answered — CRUS, §4.7. Only 2 municipalities were checked in depth, and in both the attributes were categorical.)* | Municipal ArcGIS/WFS sweep | If yes, that municipality becomes the correct first target. **Absence in 2 municipalities is not absence nationally.** |
| 4 | **Cadastral regime for 1106 / 1312 / 0303** | DGT/SNIC query | Unchanged as the #1 gate on any parcel pipeline. |
| 5 | **Lisboa RPDML regulamento** — retrieve and extract | One download | Lisboa's numeric tables are entirely unknown; Porto's are now known. |
| 6 | Full SNIT `<PLANTYPE>` code list + enumeration by DICOFRE | Catalogue paging | Would yield a true national coverage census instead of §3.3's approximations. |
| 7 | ~~Whether SNIT publishes **any** WFS anywhere~~ — **ANSWERED: yes, CRUS (§4.7).** Remaining: the full `<PLANTYPE>` code list and whether CRUS covers all 308 municipalities (Braga returned **502**, not a 404 — unresolved). | Catalogue paging | Would yield a true national census. |

---

*Probe session 2026-07-31. All HTTP statuses recorded as observed. Counts in §3.3 are approximate
upper bounds with measured ~83 % precision (§3.2) and must not be quoted as exact. Where this file
says UNKNOWN it means nobody has looked, not that the answer is zero (L-616).*
