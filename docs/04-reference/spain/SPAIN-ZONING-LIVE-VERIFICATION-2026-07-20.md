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
