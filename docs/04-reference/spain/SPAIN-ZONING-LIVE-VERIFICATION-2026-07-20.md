# Spain regional zoning — LIVE verification pass

> **Stamp** 2026-07-20 · **Status** RESEARCH FINDINGS (no code, no adapters built)
> **Governs nothing** — this is evidence. The decisions it forces live in **C58 §1.2/§1.11**
> and **ADR-0269**. Audit rows: **L-438** (this pass) and **L-439** (granularity gap).
> **Supersedes** the region-by-region claims in `PARCEL-ZONING-FEATURE-SCOPING.md` and in the
> two externally-supplied Spain research documents, **wherever they conflict** — those were
> written from portal descriptions; this was written from endpoint responses.

---

## §0 — Why this document exists, and the discipline it enforces

Two prior research documents rated Spain's zoning sources MEDIUM to MEDIUM-HIGH for numeric
envelope data. Live endpoint inspection contradicts them on specifics. One claim in
particular — that Madrid's `PGOUM97/PG_CONDICIONES_EDIFICACION` publishes *"coeficiente
ponderado de edificabilidad — real numeric coefficient"* — turned out to be a phrase in the
service's **prose description**, not a field the layer returns.

**That is the failure mode this document exists to correct: plausible, well-structured
research that is factually wrong.** It is also exactly the failure C58 §1.4 and the L-373
credibility discipline exist to prevent one layer further down — so allowing it in at the
research layer would defeat the guard rails we already built.

### Confidence legend (used on every claim below)

| Tag | Meaning |
|---|---|
| **VERIFIED-LIVE** | The endpoint was fetched this session and this is what came back. |
| **VERIFIED-VIA-SEARCH-CACHE** | An indexed snapshot of the endpoint's **own output** (an ArcGIS `?f=json` page, a raw WFS `GetFeature` CSV) gave real field names or data rows; the exact URL could not be independently re-fetched this session. |
| **UNVERIFIED** | Not confirmed. Always accompanied by the specific reason. |

### Tooling limits hit this session — stated up front because they shape verdicts

1. **WFS XML is opaque to the fetch tool.** `GetCapabilities` / `DescribeFeatureType`
   responses return correct MIME (`application/xml`) but extract as `[binary data]` with zero
   text. Hit on `ideandalucia.es`; likely generic to XML, not host-specific.
2. **Murcia's GeoServer returned HTTP 400** on every `GetCapabilities` /
   `DescribeFeatureType` variant tried, including spec-valid parameter orderings. Could be
   the server rejecting the fetcher's headers, or a genuine config fault — **not
   distinguishable from outside.**

Where these blocked a direct fetch, the gap was **not** papered over by inferring from
documentation prose. A second channel was used (search-engine cache of the endpoint's own
output), and `NUMERIC-FIELDS` was reported **only** where actual field names or data values
were seen — never from a service description.

---

## §1 — The finding that matters most

> **There is no region in Spain where a live geometry service alone yields a parcel-level,
> legally-usable buildable envelope.**

Every service checked live stops at one of three places:

1. **Zone code + description only** (Catalonia, Valencia zonification) — no numbers at all.
2. **Codes + a document reference** (Madrid PGOUM97: `COND_EDIF` SmallInt, `COEF_Z` String,
   `FESPECIFICA` ficha ref) — the numbers exist, behind a code.
3. **Real numbers at the WRONG GRANULARITY** (Madrid VEDA: *ámbito*; Valencia
   `InventarioSuSuz`: *sector*) — genuinely numeric, but not per-parcel.

**Consequence for the roadmap:** the PDF-curation pipeline is **not the fallback for weak
regions. It is the primary mechanism everywhere**, including in the two strongest numeric
services found. Phase planning that scopes "API integration effort per region" is measuring
the wrong variable; the variable is **curation cost per SEED municipality**.

---

## §2 — Region findings

### §2.1 Madrid (city) — the correction, and a genuinely new numeric service

**The prior claim was wrong.** `PGOUM97/PG_CONDICIONES_EDIFICACION` layer 6 returns
`CODMANZANA, NUMORD, COND_EDIF (SmallInt), COEF_Z (String)`; layer 1 returns
`NNUMORD, FESPECIFICA`. `COND_EDIF` is a **code**, not a coefficient. `PG_ORDENACION`'s
ordenación layers (2 Ámbitos, 5 Norma Zonal) return **no fields at all**. *(VERIFIED-LIVE)*

**But Madrid does publish real numbers — in a different, newer service:**

`https://sigma.madrid.es/hosted/rest/services/ANALISIS_URBANO/Visor_Edificabilidad/MapServer`
— **VEDA** ("Visor de Edificabilidad Disponible en Ámbitos"), a 2025 replacement for a PDF
report series. *(VERIFIED-LIVE)*

- 1 polygon layer (`Distritos`, id 6 — district boundaries) + 1 **non-spatial table**
  (`Datos_2024`, id 3).
- `Datos_2024` fields:
  `Id, AMB_ID, Ambito, Amb_Denominacion, Distrito, Superficie, Situacion, Protegida_,
  Tipo_Amb, Etapa, Plan_Colectiva, Plan_Unifamiliar, Plan_Industrial, Plan_Terciario,
  Edif_Colectiva, Edif_Unifamiliar, Edif_Industrial, Edif_Terciario, Proteg_Colectiva,
  Proteg_Unifamiliar, Uso_Caracteristico`
- `Plan_*` / `Edif_*` / `Proteg_*` are `esriFieldTypeDouble` — **genuine buildable-m² values**,
  split by use (colectiva / unifamiliar / industrial / terciario) and by status
  (planned vs built vs protected).

**Caveat that decides its usefulness:** granularity is **`Ambito`** (a planning sector), not
a cadastral parcel. Press material claims VEDA also exposes a parcel-level layer; that layer
was **not** in this service. *(UNVERIFIED — sibling service not fetched.)*

**Verdict: NUMERIC-FIELDS (ámbito-level).** The strongest numeric finding in Spain — and
narrower than the prior document implied.

**Open sub-question:** does `FESPECIFICA` resolve to a fetchable document URL, or is it a
plain-text code into scanned PGOUM97 exhibits? *(UNVERIFIED — needs a sample-feature query.)*

### §2.2 Comunidad Valenciana — reconfirmed with a real computed value

A live `GetFeature` **CSV pull** (actual data rows, stronger than a field list):
`terramapas.icv.gva.es/0702_Planeamiento?request=GetFeature&typename=InventarioSuSuz&outputformat=csv`
*(VERIFIED-VIA-SEARCH-CACHE — real data, effectively direct-fetch confidence.)*

Real row — **Almassora (INE 12009)**: `sup_m2 = 21 848.69`, `edif_m2 = 16 514.9`
→ **FAR = 0.756**, computed from published data.

**Two corrections to earlier notes:**
- `url_abs` is **not** on `InventarioSuSuz`; it belongs to `Zonificacion`/`Clasificacion`.
- The claim that `url_abs` "solves PDF enumeration for Valencia" is **not yet closed** — no
  `url_abs` value was resolved, so whether it yields HTML, text-native PDF or a scan is
  **UNVERIFIED**. Carried as an open item.

**Verdict: NUMERIC-FIELDS (sector-level, *suelo urbanizable* only).**

### §2.3 Cataluña — the document-access question, closed

RPUC exposes a **documented, per-municipality, INE-code-keyed** URL pattern:
`dtes.gencat.cat/rpucportal/AppJava/cercaExpedient.do?reqCode=cerca&municipiSel={INE}&fromPage=load`
*(VERIFIED-LIVE via the official manual's own worked example, Aiguaviva INE 17002.)*

Returns each municipality's planning expedients with instrument type, bulletin date and
topic; each links to **PDF** memòria / normes urbanístiques / plànols.

**Answer to "scripted or manual":** **scriptable at the discovery layer** (enumerate
expedients by INE code, get structured metadata), **PDF at the payload layer**. So the
pipeline is scripted download + parse/curate — not a data API.
Document quality (text-native vs scanned) **UNVERIFIED**.

Also confirmed live: **MUC** is current to **1 Jan 2026** region-wide (1 Jan 2025 for the
Barcelona metro area) and its viewer resolves an address / cadastral reference to the
affecting expedients — a genuine parcel → document path, distinct from the
`MUC_QUALIFICACIONS` WFS (zone code + description only).

**Verdict: GEOMETRY + ZONE-CODE via WFS; numbers only in PDF, reachable via scriptable
INE-keyed discovery.**

### §2.4 Andalucía (57 SEED — highest) — no unified numeric service found

- IDEAndalucía catalogue: **VERIFIED-LIVE**, readable.
- DERA G7 "Sistema Urbano" is described in its own catalogue record as *asentamientos,
  manzanas, parques y jardines, **edificación*** — building footprints and urban fabric,
  **not** parcel zoning or envelope parameters.
- The catalogue surfaces dozens of **"LocalGIS Planeamiento Urbanístico de `<municipio>`"
  WMS** records — one per municipality — each carrying *"carácter exclusivamente
  informativo"*. **WMS carries no queryable attributes at all.**
- `dea100/wfs` responds HTTP 200 `application/xml` but content unreadable (tooling limit).
- `DERA_g7_sistema_urbano/wfs` returned HTTP 400 on every variant. **UNVERIFIED.**

**Verdict: DOCUMENT-REGISTRY / FRAGMENTED per-municipality WMS.** No unified region-wide WFS
with numeric envelope fields found.

**Important epistemic caveat:** this is *not found in a targeted search*, **not** *proven
absent* — ~200 IDEAndalucía services could not be exhaustively enumerated in one session.

### §2.5 Murcia — downgraded from the prior pass

`mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wfs` — **HTTP 400 on every variant**;
`sitmurcia.carm.es/wfs-descarga` (VERIFIED-LIVE) lists this exact URL as active, so the
service is published even though it could not be queried.

Its **own metadata record** (VERIFIED-LIVE) states the layers were digitized over 1:5 000
reference cartography and instructs users to consult the original planning documents rather
than rely on the WFS — the source self-describing as reference-quality, not authoritative.

**Verdict: GEOMETRY-ONLY per its own metadata. Field schema UNVERIFIED (400s).** This
**downgrades** the prior "WFS confirmed live" from field-level to metadata-level confidence.

### §2.6 Canarias — WMS + a report tool, no confirmed attribute API

GRAFCAN/IDECanarias publishes planeamiento as **WMS**, *"a título informativo sin carácter
vinculante"* *(VERIFIED-LIVE)*. A companion **GeoBDP** powers a point-query "informe de
consulta urbanística", implying richer attributes exist **behind** the WMS — but exposed via
report generation, not a WFS. Output format (structured vs rendered) **UNVERIFIED**.

**Verdict: GEOMETRY-ONLY (WMS).**

### §2.7 Galicia — per-instrument WMS; WFS existence unconfirmed

Via the IDEE national services monitor *(VERIFIED-LIVE)*: SIOTUGA publishes
per-municipality / per-instrument **WMS**, e.g.
`ideg.xunta.es/servizos/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer/WmsServer`.
**No WFS for general municipal planeamiento was confirmed either way. UNVERIFIED.**

**Verdict: GEOMETRY-ONLY (WMS).**

---

## §3 — NOT reached this session (explicitly, rather than rephrased from prior docs)

| Region | Status |
|---|---|
| País Vasco (UDALPLAN + **foral cadastre**) | UNVERIFIED — not reached |
| Navarra (SIUN + **foral cadastre**) | UNVERIFIED — not reached |
| Castilla y León (incl. the "SIUCyL does not resolve parcel queries" claim) | UNVERIFIED — not reached |
| Castilla-La Mancha · Illes Balears · Asturias · Extremadura · Cantabria · Aragón · La Rioja | UNVERIFIED — not reached |
| Comunidad de Madrid region-wide (VISOR Planea, ~178 non-capital municipios) | UNVERIFIED — not reached |
| Ceuta · Melilla | UNVERIFIED — not reached |

**This is the most important table in the document.** The prior plan presents all 17 CCAA
plus both autonomous cities as "confirmed" with specific verdicts. Of the claims actually
spot-checked, **at least one was concretely wrong** (Madrid), and the true finding was both
*better* (real numbers exist) and *narrower* (ámbito-level, different service) than asserted.

**There is no basis to assume the unverified rows are more reliable than the one that
failed.** Every region above needs the same live-fetch discipline before it informs any
business-critical decision.

---

## §4 — Summary

| Region | Verdict | Confidence |
|---|---|---|
| Madrid city — **VEDA** | **NUMERIC-FIELDS (ámbito-level)** | VERIFIED-LIVE |
| Madrid city — PGOUM97 | codes + ficha ref only | VERIFIED-LIVE |
| Valencia — `InventarioSuSuz` | **NUMERIC-FIELDS (sector-level)**, FAR 0.756 computed | VERIFIED-VIA-SEARCH-CACHE (real data) |
| Valencia — zonification | zone code + description | VERIFIED-LIVE |
| Cataluña — `MUC_QUALIFICACIONS` | zone code + description | VERIFIED-LIVE |
| Cataluña — RPUC | document registry, scriptable discovery, PDF payload | VERIFIED-LIVE |
| Andalucía | document registry / fragmented WMS | catalogue VERIFIED-LIVE; absence unproven |
| Murcia | geometry-only per own metadata | metadata VERIFIED-LIVE; schema UNREACHABLE |
| Canarias | geometry-only (WMS) | VERIFIED-LIVE |
| Galicia | geometry-only (WMS) | VERIFIED-LIVE |
| 11 remaining regions + Ceuta/Melilla | — | **UNVERIFIED — not reached** |

---

## §5 — What this forces

1. **C58 §1.2's two-fidelity model is validated but lopsided.** `structured` is the
   exception; `estimated-ruleset` from curated PDF is the default. See **C58 §1.11**
   (granularity), added as a result of this pass.
2. **A third axis is missing from C58: GRANULARITY.** A source can be numeric and still
   unusable because it answers at ámbito/sector level while the envelope is per-parcel. This
   is not the same as confidence, and conflating them would let a sector FAR be presented as
   a parcel FAR. → **L-439**.
3. **The C58 envelope MODEL may not fit Spain.** Madrid publishes *Fondo de la Edificación*
   as a **polyline with no attributes** — buildable depth as a line you build up to, not a
   setback number. `setbacks + height + FAR` cannot represent it. → ADR-0269 open decision.
4. **Sequencing should follow curation cost per SEED municipality**, not API quality —
   because API quality is uniformly insufficient.
5. **A second verification pass is required** for the 11 unverified regions before any of
   their existing "confirmed" claims are relied on.

---

# §6 — SECOND PASS (2026-07-20, same day) — Tier B sweep with `curl`

**Method change that matters:** this pass used **`curl` via the shell**, not an agent
`web_fetch`. The previous pass reported WFS XML arriving as opaque `[binary data]` and
Murcia returning HTTP 400 on every variant. **Both were tooling artefacts.** With curl, the
same endpoints return readable XML and HTTP 200. Several prior negatives are therefore
**wrong and are corrected below.**

> **Lesson worth keeping:** an "endpoint is broken" finding is only as good as the client.
> Two of the regions written off in the first pass are in fact serving exactly the data we
> need.

## §6.1 Castilla y León — **CORRECTED: has a classification WFS**

Prior verdict (both research docs): *"PDF/cédula only — NONE at service level."*
**That is wrong.** GeoServer serves WFS at the same path as the documented WMS:

`https://idecyl.jcyl.es/geoserver/urbanismo/wfs` — **VERIFIED-LIVE**

Feature types include `urbanismo:plau_cyl_clasificacion`,
`plau_cyl_categorias_desagrupa`, `plau_cyl_grado_ejecucion`, `ot_cyl_instrumentos_ambito`.

`DescribeFeatureType` on **`plau_cyl_clasificacion`** — **VERIFIED-LIVE**:

| field | type | meaning |
|---|---|---|
| `c_clase_sue` | string | **clase de suelo CODE** (urbano / urbanizable / rústico) |
| `n_clase_sue` | string | its name |
| `c_mun`, `n_mun` | string | **municipality code + name — the join key** |
| `n_prov` | string | province |
| `c_instrum` | string | governing planning instrument |
| `m_sup_m` | **double** | surface area m² |
| `geometry` | Geometry | the polygon |

**Verdict: GEOMETRY + CLASSIFICATION CODE + municipality key — full Tier B, for a region of
2,248 municipalities (28% of Spain).**

**Reconciling with CyL's own disclaimer:** SIUCyL genuinely does state it "does not resolve
the detailed query of an urban certificate for a specific parcel". That remains true — and
is about **Tier C** (parcel-level envelope). The prior research conflated *"no parcel-level
envelope"* with *"no data"*. For Tier B, CyL is one of the better sources in Spain.

## §6.2 Región de Murcia — **CORRECTED: reachable, and it publishes classification**

`https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLA_URB_CARM/wfs` — **HTTP 200 with
curl** (prior pass: 400 on every variant → the 400 was the client, not the server).

Feature types include `plu_clasific_tipos_urbanizable`,
`plu_clasific_tipos_no_urbanizable`, `plu_clasific_tipos_sin_clasificar`,
`plu_ze_37_mun_uso_suelo`.

**Verdict: classification layers present. Tier B capable.** Field-level `DescribeFeatureType`
still to run.

## §6.3 Andalucía — negative CONFIRMED, with a better endpoint

`https://www.ideandalucia.es/services/DERA_g7_sistema_urbano/wfs` — **HTTP 200 with curl**
(prior pass: 400/binary). Feature types: `g07_01_Poblaciones`, `g07_02_EntidadSingular`,
`g07_03_EntidadColectiva`, `g07_04_Manzana`.

These are **settlement and block geometry — urban fabric, not planning classification.** So
the earlier verdict survives contact with a working client: **Andalucía publishes no
classification/calificación WFS in the DERA G7 group.** Other DERA groups and any
planeamiento-specific service remain unchecked.

**Verdict: still the weakest large region — and it carries the most SEED municipalities (57).**

## §6.4 Others probed

| Region | Result |
|---|---|
| **Navarra** (`idena.navarra.es/ogc/wfs`) | **HTTP 200**, WFS live; layers incl. `CARTO1_Pol_41SueloU`, `CARTO1_Txt_57SueloR` (suelo urbano / rústico). Tier B looks reachable — fields pending. |
| **Aragón** (`idearagon.aragon.es`) | HTTP 200, WFS capabilities returned — layers pending. |
| **Euskadi** (`geo.euskadi.eus/geoserver/wfs`) | HTTP 404 — wrong path; UDALPLAN endpoint still to find. |
| **Galicia** (ArcGIS `WFSServer`) | HTTP 400 — ArcGIS WFS needs different params; retry pending. |
| **La Rioja** (`ide.larioja.org/geoserver/wfs`) | connection failed (000) — retry pending. |
| **Asturias** (`ideas.asturias.es/wfs`) | HTTP 404 — wrong path. |

## §6.5 Running Tier-B picture

| Region | SEED | Tier B (classification WFS) |
|---|---|---|
| Cataluña | 52 | ✅ `MUC_CLASSIFICACIONS` |
| Valencia | 50 | ✅ `Planeamiento.Clasificacion` |
| **Castilla y León** | 13 | ✅ **CORRECTED — `plau_cyl_clasificacion`** |
| **Murcia** | 14 | ✅ **CORRECTED — `plu_clasific_tipos_*`** |
| Navarra | 2 | ✅ likely (`CARTO1_Pol_41SueloU`) |
| Madrid | 31 | ⚠️ city geometry yes; region-wide unchecked |
| **Andalucía** | **57** | ❌ **not found — biggest region, biggest gap** |
| Canarias, Galicia, Euskadi, Aragón, CLM, Balears, Asturias, Extremadura, Cantabria, La Rioja | — | pending |

**Direction of travel: Tier B is looking MORE achievable than either research document
suggested — the failures were client-side, not server-side. Andalucía is the real hole.**

---

# §7 — THE PATTERN (third pass) — *urbanizable* is numeric; *urbano* is not

## §7.1 Murcia — a third numeric source, with a document link

`DescribeFeatureType` on `SIT_USU_PLA_URB_CARM:plu_clasific_tipos_urbanizable`
— **VERIFIED-LIVE**:

| field | type | note |
|---|---|---|
| `Clasificacion` | string | clase de suelo |
| `Municipio` | string | join key |
| `Ambito` | string | **granularity: sector/ámbito** |
| `Uso_global`, `Uso_especifico` | string | permitted use |
| **`Edificabilidad`** | **double** | **numeric buildable quantum** |
| `Area_m2` | decimal | sector area → FAR is computable |
| `Sistema_general` | string | |
| `Area_suspendida`, `Fecha_acuerdo_suspension` | string/date | plan suspension status |
| **`Enlace_ficha`** | string | **link to the governing ficha** |
| `geom` | MultiSurface | |

**Verdict: NUMERIC-FIELDS (ámbito-level) + a document link.** Murcia joins Madrid VEDA and
Valencia `InventarioSuSuz`.

## §7.2 The pattern — and it is the most useful finding of the whole exercise

Three independent regions, three different portals, **the same shape**:

| Region | Layer | Numeric? | Granularity | Land type |
|---|---|---|---|---|
| Madrid | VEDA `Datos_2024` | ✅ `Edif_*` Double | **Ámbito** | development ámbitos |
| Valencia | `InventarioSuSuz` | ✅ `edif_m2`/`sup_m2` | **Sector** | ***suelo urbanizable*** |
| Murcia | `plu_clasific_tipos_urbanizable` | ✅ `Edificabilidad` | **Ámbito** | ***suelo urbanizable*** |

> **Numeric edificabilidad IS published in Spain — but only for land that is being
> DEVELOPED (*suelo urbanizable* / ámbitos de ordenación), never for consolidated
> *suelo urbano*.**

**Why this is structural, not accidental:** *urbanizable* land is planned as **sectors with
an assigned buildable quantum** — the number is the planning instrument's own output, so it
has to be published. Consolidated *urbano* is governed by an **ordenanza applied per plot**
(zone code → normativa → geometry-dependent rules), so there is no per-parcel number to
publish; it is *derived*, not *stored*.

### What this changes

1. **Two different products, not one pipeline.**
   - **Development land** (*urbanizable*): numeric edificabilidad is **available now**, from
     live services, in at least 3 regions. Sector granularity, but that is the *correct*
     granularity for that land — a development sector genuinely is the unit of account.
   - **Consolidated urban plots**: no number exists anywhere. Curation-only, and the
     C58 granularity rule (§1.11) forbids borrowing the sector figure.
2. **The "no numeric edificabilidad in Spain" headline (§1) needs qualifying**, and this
   document corrects itself: it is true **for suelo urbano**, and false for **suelo
   urbanizable**. The earlier statement was drawn from parcel-oriented services only.
3. **A near-term product exists that needs no curation at all**: development-land feasibility
   over *suelo urbanizable*, using published numeric edificabilidad + `Enlace_ficha` /
   `url_abs` for provenance. That is a real Archistar-shaped answer on a subset of the
   market, shippable without the PDF pipeline.

## §7.3 Corrections to this document's own earlier claims

- **Navarra — my "likely Tier B" was wrong.** `IDENA:CARTO1_Pol_41SueloU` fields are
  `C1MOBJECT, C1MFEATURE, C1MMSTABLE, C1MDGN, ALTITUD, GEOM_AREA, GEOM_PERI…` — MicroStation
  DGN cartography artefacts, **not planning attributes**. That layer is base cartography whose
  *name* mentions suelo. **Navarra Tier B: UNVERIFIED, correct layer not yet found.** Naming
  a layer by its title rather than its fields is precisely the error this document exists to
  avoid, and it recurred here.
- **Andalucía — negative stands, hunt abandoned honestly.** Guessed service names
  (`DERA_g13_planeamiento`, `urbanismo`, `planeamiento`, two GeoServer roots) all 404;
  the `servicios-ogc` portal page returned no DERA service names. Only `DERA_g1_relieve`
  resolved of the guessed set. **Not found by targeted probing — needs the CSW catalogue or
  local knowledge, NOT more URL guessing.**

---

# §8 — DECISIVE: a NATIONAL clasificación-del-suelo service exists (SIU)

**This supersedes the "17 regional integrations" premise for Tier B.** Both research
documents, this document's own §1–§7, and the acquisition plan all assumed classification had
to be assembled region by region. **It does not.**

## §8.1 The service

`https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Servicios_OGC/MapServer`
— **SIU (Sistema de Información Urbana), Ministerio de Vivienda y Agenda Urbana.**
OGC endpoints also published (`.../MapServer/WFSServer`, `WMSServer`). **VERIFIED-LIVE.**

**Layer 15 — `OGC_Clases_Suelo`** (polygon), fields via ArcGIS REST:

| field | type | meaning |
|---|---|---|
| `ProvINE` | String | **MISNAMED — it is the 5-digit MUNICIPALITY INE code** (`48080` Bilbao, `08053`, `31232`). This is our join key to `priority_318.csv` and to Catastro. |
| `ClaseSuelo` | String | the classification itself |
| `NuclRural` | String | rural-settlement flag |
| `FechaBaja` | String | supersession date; `99999999` = currently in force |

Sibling layers: **L14 `OGC_Recintos`** (`UsoSuelo`, `IdSector`) and **L13 `OGC_Sectores`**
(`IdSector`) — sector geometry keyed to the same municipality code.

## §8.2 Real values (queried live, not inferred)

`ClaseSuelo` is the full legal taxonomy, not a simplified flag:

- `SUELO URBANO`
- `SUELO URBANO NO CONSOLIDADO`
- `SUELO URBANIZABLE DELIMITADO O SECTORIZADO`
- `SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO`
- `SUELO NO URBANIZABLE`
- `SISTEMAS GENERALES Y OTROS`

**21 791 polygons total.**

## §8.3 Coverage — tested, not assumed

`returnDistinctValues` hit the service's 2 000-record page cap, so it proves nothing about
totals. Coverage was therefore measured by per-province counts:

| Prov | Count | | Prov | Count |
|---|---|---|---|---|
| 08 Barcelona | 1 208 | | 33 Asturias | 366 |
| 46 Valencia | 777 | | 30 Murcia | 252 |
| 28 Madrid | 701 | | 35 Las Palmas | 194 |
| 50 Zaragoza | 485 | | 52 Melilla | 6 |
| 41 Sevilla | 448 | | | |
| 15 A Coruña | 440 | | | |

**Every province tested returns data**, spanning the full numbering range and including the
regions where the region-by-region hunt failed — **Andalucía (448), Canarias (194), Galicia
(440), Asturias (366)** — and both foral regions (`48080` Bilbao, `31232` Navarra).

## §8.4 Why this was nearly missed — the third client-side artefact today

1. The ministry directory returned **HTTP 403** to a default curl UA; a **browser
   User-Agent** returned 200 and the full portal index. The directory is where SIU was found.
2. The SIU **WFS** projection of layer 15 returns only `OBJECTID, Shape, AreaLambert` — the
   `ClaseSuelo` attribute is **absent**. Only the **ArcGIS REST** view exposes it. Judging
   this service by its WFS alone would have recorded a national source as empty.

Together with Murcia's HTTP 400s (a header artefact) and the first pass's `[binary data]` XML,
**three of this exercise's most consequential "negatives" were properties of the client, not
the data.** Any future verification MUST vary client and protocol before recording a negative.

## §8.5 What this changes

1. **Tier B is ONE national integration, not seventeen.** Municipality-keyed, ministry-
   published, covering all 8 132 municipalities including País Vasco and Navarra.
2. **Andalucía's gap is closed for Tier B.** It has no regional classification WFS, but SIU
   carries it (448 polygons in prov 41). The biggest SEED region is unblocked.
3. **`FechaBaja` gives a currency signal** — a per-polygon "still in force" test, which is
   exactly what C58 §1.6 wants for rule-pack freshness.
4. **Granularity (C58 §1.11)** is `municipality`→sub-municipal polygons, **not parcel**. It
   answers *"what class of land is this plot on"* — the Tier B question — and must NOT be
   presented as a parcel envelope.
5. **Regional services remain valuable for Tier C**, where they carry `Edificabilidad`
   (Murcia), `edif_m2` (Valencia), `Edif_*` (Madrid VEDA) at ámbito/sector granularity.
   SIU replaces them for classification only.

## §8.6 Still open

- **SIU currency/provenance**: how often refreshed, and does it lag regional sources? Every
  row sampled shows `FechaBaja = 99999999`, so no superseded rows were observed —
  **UNVERIFIED** whether the layer retains history.
- **Precision**: 21 791 polygons across 8 132 municipalities (~2.7 each) is **coarse**.
  Whether SIU polygons are detailed enough to classify an individual plot, or are generalised
  municipal envelopes, is **UNVERIFIED and is the next thing to test** — overlay a SIU polygon
  against a known Catastro parcel and check the boundary agrees.

---

# §9 — PRECISION TEST: SIU is plot-scale, not a generalised envelope

§8.6 flagged precision as the open question that decides whether SIU is a product or a
backdrop. **Tested and answered — positively.**

## §9.1 The misleading first signal

Feature counts per municipality look alarmingly low:

| Municipality | SIU features |
|---|---|
| Barcelona `08019` | **4** |
| Madrid `28079` | 6 |
| Valencia `46250` | 5 |
| Murcia `30030` | 7 |

**This does NOT mean coarse.** SIU stores **one MultiSurface per clase de suelo per
municipality** — Barcelona has 4 features because 4 land classes are present, each a single
multipolygon. Feature count measures *how many classes exist*, not *how detailed they are*.
Reading it as precision would have produced exactly the wrong conclusion.

## §9.2 The actual measurement (Barcelona, `outSR=4326`, VERIFIED-LIVE)

| `ClaseSuelo` | rings | vertices |
|---|---|---|
| `SUELO URBANO` | **93** | **18 208** |
| `SUELO URBANO NO CONSOLIDADO` | 77 | 3 097 |
| `SUELO NO URBANIZABLE` | 15 | 10 973 |
| `SUELO URBANIZABLE DELIMITADO O SECTORIZADO` | 1 | 257 |

**18 208 vertices describing Barcelona's urban land is plot-scale geometry.** The 93 rings on
`SUELO URBANO` are the disjoint urban areas plus interior holes — the shape of the real
fabric, not a bounding envelope.

**Verdict: SIU is fit for the Tier B question** — *"is this plot urbano / urbanizable /
rústico?"* — by point-in-polygon against a Catastro parcel centroid.

## §9.3 Storage implication (feeds the PostGIS sizing question)

Barcelona's 4 features returned **1.3 MB of GeoJSON**. Barcelona is among the most complex
municipalities, so it is an upper bound rather than an average — but the national corpus is
plainly **multi-gigabyte as GeoJSON**, materially less in PostGIS binary geometry with a
GiST index.

This makes the earlier infrastructure finding concrete: **the current per-request proxy
cannot serve this**, and a national mirror needs real spatial storage. It is not a
"large JSON file" problem.

## §9.4 Remaining caveat — one thing still NOT verified

Precision is confirmed; **positional agreement with Catastro is not.** SIU is published by the
Ministerio and Catastro by the Dirección General del Catastro — two agencies, two
digitisation lineages. A plot near a class boundary could be classified differently depending
on which geometry is authoritative.

**Next test (not yet run):** take a known Catastro parcel, point-in-polygon it against SIU,
and check the answer agrees with the municipal planning viewer for that same plot. Until then,
edge-of-boundary plots carry an unquantified risk and should be labelled accordingly under
C58 §1.4.
