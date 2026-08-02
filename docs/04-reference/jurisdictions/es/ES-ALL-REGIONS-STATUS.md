# SPAIN — ALL REGIONS, PLANNING-DATA STATUS

**Status**: LIVE. **Every cell is labelled MEASURED, READ, or UNKNOWN.** Built 2026-08-02.
**Related**: [ENVELOPE-REACHABILITY-TRACKER](../../../03-execution/plans/ENVELOPE-REACHABILITY-TRACKER.md) · [ES-REGIONAL-PLANNING-DATA-STANDARDS](./ES-REGIONAL-PLANNING-DATA-STANDARDS.md) · [ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02](./ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02.md) · [ADR-0292](../../../02-decisions/adrs/ADR-0292-no-tool-reports-a-result-it-cannot-verify-against-external-ground-truth.md)

> **Evidence grades used throughout — a cell without one is a defect.**
> **MEASURED** = a non-null count over a real sample, from a re-runnable run · **READ** = a document or
> directory was read, **the service was NOT reached** · **UNKNOWN** = not established, and an unreached
> service is UNKNOWN, never absent.

## 0 · ⭐⭐ THE FINDING THAT EXPLAINS THE WHOLE MAP — the SIU model stops one level too high

The **SIU Working Group** (2008, every autonomous community; collaboration agreements with **ten** regions)
agreed **common minimum thematic contents** for the national model. What that model actually carries:

> **sector · land type · surface area · use · edificabilidad — at SECTOR level.** Graphic data covers **land
> classes, urban development areas and degrees of development.** And the SIU is **explicitly not a public
> planning registry.**

> ⭐ **So the national model carries buildability as AGGREGATE DEVELOPMENT CAPACITY PER SECTOR, not as a
> parcel-level ordinance parameter. Ten regions are feeding a spec that stops ONE LEVEL ABOVE what an
> envelope needs. They are not failing to publish — they are publishing to a spec never designed for this
> use case.**

That single fact explains why so many regions look identical and thin, and it means **a national SIU
adapter cannot produce envelopes** — only regime selection.

## 1 · ⛔ THE CHALLENGE TO R0 — "no instrument" may not mean terminal

The reachability tracker files **1,357 municipalities (16.7 %)** as **R0 — no planning instrument, envelope
never** — from the SIU census. **Galicia breaks that rule.**

**Plan Básico Autonómico (Decreto 83/2018)** *"applies in municipalities that lack general planning, and has
**complementary character** in municipalities that have it, to supply the possible indeterminations and gaps
of the municipal plan in force. It establishes general provisions on land and building uses applying
commonly to its **ordenanzas**."* Beneath it, **Planes Básicos Municipales** are drafted **by the regional
administration** for municipalities under 5,000 inhabitants without a general plan — *"so all Galician
municipalities end up with a basic urbanistic instrument."*

⚠ **Two consequences, and the second is larger:**
1. In Galicia, R0 municipalities are **not terminal** — a regional instrument supplies an applicable regime
   **with ordenanzas**.
2. ⭐ **The complementary clause is bigger:** where a Galician municipal plan is **silent or ambiguous**, the
   PBA fills the gap. That is **a regional gap-filler for exactly the class of failure that produces
   refusals in our engine.**

⚠ **Article 9, Decreto 83/2018 — a precedence rule that must be encoded:** sectoral changes are **directly
binding from entry into force and prevail over the PBA cartography.** Cartography updated at least annually,
currently six-monthly; latest **Resolución 1 June 2026**.

> ⛔ **ACTION: any region with a supletory regional plan breaks "no instrument = terminal". Aragón and
> Castilla y León both have provincial *normas subsidiarias* worth checking on the same logic.** Until that
> is done, **R0 is an upper bound on terminality, not a measurement of it.**

## 2 · THE REGION TABLE — 17 CCAAs + 2 autonomous cities = 19 territorial units

⚠ **Ceuta and Melilla are autonomous CITIES, not CCAAs.** The registry reports `ccaaTotal 17` **and**
`territorialUnitsTotal 19`; conflating them is why an earlier arithmetic never closed.

| Region | Level | Endpoint / system | Parameters **populated**? | Delivery norm | Grade |
|---|---|---|---|---|---|
| **Madrid** | ⭐ **L3** | `idem.comunidad.madrid/geoserver3/wfs` · `sitcm:VPLA_V_ORDENANZA` — **93,839 features**, full ordinance schema | ⭐ **MEASURED: altura 70.2 %, plantas 72.9 %, both 66.9 %** (n=4,000 / 17 munis) | none known ⇒ **L3 not L4** | **MEASURED** |
| **Región de Murcia** | L3 ⚠ | municipal GeoServer · `Edificabilidad` + `Enlace_ficha` | *observed in schema*; **populated + normative NOT established** | unknown | READ |
| **Catalunya** | ⚠ **L4 framework / L2 governing text** | AMB Refós `qualificacio_refos_3857`, 36 munis, **27 with `PGM='S'`** | not counted non-null | **YES** — Refós | MEASURED (extent) |
| **C. Valenciana** | L3 ⚠ | `terramapas.icv.gva.es` · `Zonificacion zon_suelo` | ordinance codes present | unknown | READ |
| **Illes Balears** | L3 ⚠ | MUIB · `CODIAJ` + per-feature normativa URL | ⚠ **`OBS` says Eivissa rows are NOT in force** | unknown | READ |
| **Canarias** | L3 ⚠ | `ZONIF`/`ZUSO` — **GetFeatureInfo point query only**, no bulk WFS found | not counted | unknown | READ |
| **Andalucía** | **L4 framework / L3-partial schema / corpus UNKNOWN** | SITUA / VITUA | ⭐ **MEASURED (schema): `EDIF_*` + `DENS` present; NO altura / plantas / profundidad / ocupación / retranqueos.** Template ships **0 rows** | **YES** — Normas Directoras, Orden 18-02-2026, in force **24-04-2026**, forward-only | **MEASURED** (schema) · corpus **UNKNOWN** |
| **Galicia** | **RU** — apparatus confirmed, content unknown | **SIOTUGA** — ⭐ **we already have a working `CODINE` query against layers 8/28/29 and never asked what they are** | **UNKNOWN** | ⭐ **YES — NNTTPP**, Orden 10-10-2019 → 08-04-2022 → **Resolución 18-12-2025**. **Annex 3 = *"Modelo de datos de los archivos vectoriales"*, PRECEPTIVE.** INE-keyed folders `01.ANX03`, **`11.ORDET` per *ámbito de ordenación detallada*** | READ |
| **Aragón** | **L1** | `icearagon.aragon.es` — no WFS; **WMS `GetFeatureInfo` returns the full row** | ⛔ **MEASURED: `edificab` non-zero 1.3 %, `aprove` 0.0 %, `densidad` 1.3 %** (n=78/16 munis). **Classification IS populated** (`clase` 100 %, `notepa` 97.4 %) | **YES** — NOTEPA, Decreto 78/2017 (Art. 7 defines *edificabilidad*) | **MEASURED** |
| **Extremadura** | **L1** | `mapas.ideex.es/CICTEX/urbanismo`, 36 layers | ⛔ **MEASURED: `CALIFICACION_*` returns `msGeometry` AND NOTHING ELSE** | unknown | **MEASURED** |
| **Castilla y León** | **RU** ⚠ **blocked on law, not data** | SIUCyL · `idecyl.jcyl.es/geoserver/lu/wms` + `/urbanismo/wms`, vector download | ⚠ **The region VECTORISES determinations from the PDFs itself** — georeferences, vectorises *recintos*, attaches alphanumeric data | ⛔ **metadata says «sin validez jurídica, carácter informativo»** | READ |
| **Castilla-La Mancha** | RU | `castillalamancha.maps.arcgis.com` · SIU shapefile layer | UNKNOWN | **YES in substance** — *«Instrucciones para generar el archivo de planeamiento urbanístico en formato shapefile»* | READ |
| **Cantabria** | RU | SIUCan + AUCan archive · **42 services** nationally registered | UNKNOWN | unknown | READ |
| **Asturias** | RU | *Visor del registro de planeamiento e xestión urbanística* · **52 services** | UNKNOWN | unknown | READ |
| **La Rioja** | RU | **15 regional + 173 local** services | UNKNOWN | unknown | READ |
| **Navarra** | **OUT OF SCOPE** | foral cadastre — separate adapter | — | — | — |
| **País Vasco** | **OUT OF SCOPE** | foral cadastre — separate adapter | — | — | — |
| **Ceuta** | RU | — | UNKNOWN | — | — |
| **Melilla** | RU | — | UNKNOWN | — | — |

## 3 · ⚠ THE ARAGÓN RESULT IS THE METHODOLOGICAL ONE — read it before trusting any "populated" figure

Every numeric field in Aragón's vectors is **100 % non-null**. **That number is meaningless.**

> **70 of 78 rows carry `shape_area > 0` AND `perimeter == 0` — geometrically impossible.**
> ⇒ **`0` is this schema's null substitute**, proven by **internal contradiction**, not asserted.

**Reporting "100 % non-null" would have been TRUE AND COMPLETELY MISLEADING.** This is why the standing rule
is **populated, never present**, and why five values must be sampled: *a column of `0`, `"NULL"` or `-9999`
is populated and meaningless.*

⚠ **And Aragón publishes a currency field:** `fiab_geom` is **100 % present** and only **21.8 %** reads
*"Aprobada"*. **Presence of a validity flag can be evidence AGAINST currency.**

## 4 · ⚠ MADRID'S VARIANCE — do not average it away

`NM_ALTURA` populated: **Madrid capital 3.6 %** · **Alcalá de Henares 69.4 %**. The **worst** municipality in
the sample is the capital. `NM_APRV_BC` is non-null on **0.0 %** everywhere — *a field name proves nothing.*

⚠ Paging is unsupported (*"Cannot do natural order without a primary key"*), so the draw is the
**natural-order head, not a random sample** — rates are **indicative**. Rated **L3 and deliberately not L4**:
it reaches L3 through a regional **service**, not a known delivery standard.

## 5 · WHAT CHANGED, AND THE BINDING QUESTION

- **SEVEN regions have a delivery standard or submission instruction** — Catalunya, Aragón, Andalucía,
  **Galicia**, Castilla-La Mancha, plus whatever the SIU *convenios* bind on ten. **Not three.**
- ⭐ **ZERO regions are confirmed absent. The "eight regions cannot do envelopes" filing has no survivors.**
- ⛔ **THE BINDING QUESTION MOVED.** It is no longer *"does data exist"*. It is:

> **"Does published regional data have LEGAL FORCE?"**
>
> Castilla y León disclaims it explicitly. Illes Balears flags it and says **no**. Regional viewers generally
> state their data is **merely informative, with no legally binding effects derivable from it.**

**That is counsel Q4, not an agent task — and it could reclassify half the map in either direction at once.**

## 6 · NEXT ACTIONS — cheapest first, all binary

| # | Action | Decides |
|---|---|---|
| **1** | ⭐ `DescribeFeatureType` on **SIOTUGA layers 8 / 28 / 29** — **we already hold a working `CODINE` query** | Galicia, in minutes |
| **2** | Read **Galicia NNTTPP Annex 3** (Apr-2022 consolidated, `territorioeurbanismo.xunta.gal`) | whether the mandated model carries ordinance parameters |
| **3** | Download the **PBA normativa** from the *Registro de Ordenación do Territorio* | whether **R0 municipalities are determinable** — and whether the whole R0 category is wrong |
| **4** | Andalucía **corpus count** — *Registro de Instrumentos Urbanísticos* by approval date | whether the 2026 schema has anything in it yet |
| **5** | Aragón ***fichas*** route (`fichaDescarga/` is a JS app; guessed endpoints 404'd) | **L1 vs L2** — ⚠ currently **cannot be distinguished**, and is recorded as such |

⚠ **A note on scope that must not be lost:** *"Galicia is not a single planning jurisdiction."* It contains
**313 municipalities**, each with its own PXOM / normas subsidiarias, zoning codes, FAR, heights, setbacks
and effective dates. **No regional instrument supplies parcel-level buildability for all of Galicia** — the
PBA supplies a *supletory and complementary* regime, which is a different and narrower claim.
