# BENCHMARK — Litehaus investment report on Murcia parcel `3481104XH6038S`

> **Provenance.** Founder-supplied competitor output, generated **2026-07-30 15:27:35 UTC**
> (`report@3.0`, ref `rpt_ms7o3k27_8xisal`). Captured because it is a **real competitor screening
> report on a real parcel we are now targeting** — the most direct benchmark available.
>
> **§A is their report as supplied. §B is mine.**
>
> ⚠ Every figure in §A is **their** claim. Nothing here is verified by this repo. Two of their facts
> are flagged in §B as worth independent verification because they would materially change an
> envelope.

---

## §A — The report, as supplied

### The parcel

| Field | Value | Their source |
|---|---|---|
| **Referencia catastral** | **`3481104XH6038S`** | Sede Electrónica del Catastro |
| Coordinates (WGS84) | **38.006100, −1.138028** | *listing pin — NOT cadastral* |
| **Official parcel area** | **935 m²** | Sede Electrónica del Catastro |
| Advertised area | 936 m² | *listing, "declarada por el anunciante, no catastral"* |
| Municipality | Murcia | Catastro |
| Land class | **Suelo urbano consolidado** | SIU / PGOU municipal |
| Governing plan | **PGOU Murcia 2001 — suelo urbano** | SIU / PGOU municipal |
| Classification confidence | **medium** | — |
| Estimated edificabilidad | **262 m² · ~2 viviendas** | *"DERIVADO — proxy PGOU, verificar ficha"* |

> **Their own caveat on parcel identity:** *"Ninguna parcela catastral plausible junto al pin —
> análisis basado en las coordenadas del anuncio (el resultado puede reflejar la parcela incorrecta)."*

### Opportunity score — 53/100 ("Medio"), and its published weights

| Axis | Weight | Score | Their drivers |
|---|---:|---:|---|
| Potencial urbanístico | 22% | 77 | +38 proximity to urban perimeter (0 m) · +23 urban fabric continuity (97% within 500 m) · +16 consolidated urban land |
| Viabilidad urbanística | 18% | 62 | +25 buildable area per PGOU (262 m²) · +12 classification confirmed |
| **Financiero** | 18% | **20** | −30 *"sin programa constructivo"* |
| **Mercado** | 15% | **0** | neutral signal — no price, no comparables |
| Condicionantes ambientales | 12% | 100 | no Red Natura 2000 / ENP at the point |
| Viabilidad técnica | 10% | 75 | 0 low slope (2.6%) · **−25 low bearing capacity** |
| **Catastro** | 8% | **45** | **−5 *"Correspondencia catastral no ejecutada"*** |
| Riesgo de licencias | 7% | 55 | **−30 flood-hazard area (SNCZI/EEA)** |

### Evidence completeness — **12/100**

> *"La base de evidencia es débil: las conclusiones de este documento son señales de screening,
> **no hechos verificados**."*

| Category | Weight | Score | Missing |
|---|---:|---:|---|
| Parcel identity | 18% | **25%** | coordinates · property/parcel id · **parcel match** |
| Planning | 22% | **33%** | PIP/loteamento doc · PDM planta/regulamento |
| Environmental | 15% | **0%** | REN/RAN status · topo/geotech |
| Infrastructure | 12% | **0%** | access/utilities |
| Registry / title | 18% | **0%** | caderneta · certidão permanente · ownership |
| Financial | 15% | **0%** | asking price · AVM · days on market · escritura |

### Planning & legal evidence

- **Flood risk — material.** *"Dentro de zona inundable oficial T=100 años (SNCZI/MITECO) — riesgo alto; edificación muy condicionada e informe de la Confederación Hidrográfica requerido."*
- **DPH deslinde: UNAVAILABLE** — *"el WMS MITECO DPHCartografico sigue caído (NullReferenceException)"*. Their screening substitutes SNCZI + IDEE HY.Network proximity and **explicitly labels it ≠ deslinde**.
- **DPMT (Ley de Costas): UNAVAILABLE** — same WMS failure. Coast distance ~36.8 km, labelled *not* DPMT.
- **Nota Simple: not connected** — no free API (~€9/finca). *"El Catastro NUNCA prueba la propiedad."*
- **Zonal ordinance:** *"ocupación/altura/retranqueos numéricos de cédula UNAVAILABLE si no hay atributo (nunca inventados)."*

### Construction cost bands — Región de Murcia (ex-VAT, `cces@2026-07c`)

| Scenario | Band | Applied midpoint | On 262 m² | VAT 10% |
|---|---|---|---|---|
| Basic | 800–890 €/m² | 850 | €222,700 | €22,270 |
| Premium | 940–1100 €/m² | 1020 | €267,240 | €26,724 |
| Luxury | 1100–1760 €/m² | 1430 | €374,660 | €37,466 |

Anchors cited: MIVAU *Boletín Estadístico* §09 (2025) — national 653.1 €/m² PEM over 23,955,595 m²; **Murcia index 0.772** (504.5 €/m² PEM over 709,579 m²) · IVE Comunitat Valenciana Jun-2024 · Sociedad de Tasación Sep-2025 · COACM 2026 / COA Cádiz 2026 coefficients. **Luxury band explicitly unanchored**: *"sin anclaje publicado — por encima de la parrilla de coeficientes colegiales."*
Revenue (GDV): **not available** in all three scenarios — *"requieren comparables locales de obra nueva."*

### Their source inventory (competitive intelligence)

| Source | Status | Note |
|---|---|---|
| Sede Electrónica del Catastro (INSPIRE) | **OK · HIGH** | refcat + official parcel geometry; common territory (foral PV/NC excluded) |
| **SIU Clases de Suelo** (Min. Vivienda, ArcGIS REST) | OK · MEDIUM | land class urbano/urbanizable/no urbanizable |
| Regional/municipal calificación geoportal | OK · MEDIUM | *"si no, clase SIU + rangos PGOU"* |
| Red Natura 2000 / ENP (EEA + MITECO) | OK · HIGH | |
| SNCZI zonas inundables (INSPIRE via IDEE) | OK · MEDIUM | *"servicio lento/intermitente → resultados cacheados"* |
| EEA flood screening | OK · MEDIUM | fallback when SNCZI unresponsive |
| **IGME GEODE 1:50,000** | OK · HIGH | geology; **bearing capacity is their labelled heuristic, not IGME data** |
| **EU-DEM 25 m** (Copernicus via opentopodata) | — | **their only elevation source** |
| PNOA ortofoto (IGN) | — | visual only |
| Catastro foral Navarra (IDENA) | — | WFS 2.0 |
| Catastro foral Bizkaia + Gipuzkoa | CONNECTED | **Álava UNAVAILABLE** |
| Vías pecuarias | OK · HIGH | **Comunidad de Madrid ONLY** — other CCAA not wired |
| DPH / Confederación Hidrográfica | **PARTIAL** | WMS down |
| DPMT (Costas) | **PARTIAL/UNAVAILABLE** | WMS `NullReferenceException` |
| Registro de la Propiedad | **NOT_CONNECTED** | ~€9/finca, no free API |
| Market listings aggregator | — | commercial token; *"pin aproximado"* |

---

## §B — Assessment (MINE, not the founder's, not Litehaus's)

### M-1 — Where they are weak, ranked by how cheaply we beat it

| # | Their gap | Their own words | Our position |
|---|---|---|---|
| **1** | **Catastro match never executed** — scored 45/100, **−5** | *"Correspondencia catastral no ejecutada"* | We hold the **refcat**. Catastro INSPIRE WFS is national and keyless, and `isInSpain` is already registered in our parcel registry. **Resolving by identifier instead of by pin is the single clearest win**, and it is nearly free. |
| **2** | **Parcel identity may be wrong** | *"Ninguna parcela catastral plausible junto al pin … puede reflejar la parcela incorrecta"* | Their whole report is anchored on a **listing pin**, not a cadastral reference. Every downstream number inherits that. Worth measuring the pin↔parcel-centroid offset as a finding about their method. |
| **3** | **No building heights at all** | absent | Catastro `BU`/`BuildingPart` `ALTURAS` is free and national. |
| **4** | **EU-DEM 25 m is their only elevation** | slope 2.6% | A 25 m posting across a ~30 m-wide plot is **one to two samples**. Spain publishes PNOA LiDAR/MDT far finer. Their 2.6% is not a measurement of this plot. |
| **5** | **Edificabilidad is an admitted proxy** | *"proxy PGOU — verificar ficha"* | A **cited** article beats a proxy. And a **cited refusal also beats a proxy** — it is the thing their report structurally cannot produce. |

### M-2 — Where they are ahead of us, and it is not close

Intellectual honesty requires stating this: **they ship, we do not.** Murcia is a stub in this repo with no rule pack and no findings until today; Barcelona is our only production city. They have a working multi-source pipeline across ES **and** PT with cost bands, environmental screening, geology, flood, and a scored output.

They also do several things we should copy:

- **Published axis weights** for their opportunity score — auditable, unlike a single opaque number.
- **A completeness score with category weights**, printed alongside the conclusions and used to caveat them. That is the same instinct as C63, applied at report level.
- **Explicit `UNAVAILABLE` with the reason** (*"WMS caído — NullReferenceException"*) rather than silent omission. **That is our own failure-≠-absence discipline, and they got there first.**
- **Labelling derived heuristics as heuristics** — *"capacidad portante = heurística etiquetada (no dato IGME)"*.

### M-3 — The defect in their report worth learning from

> §06: *"El motor pro-forma determinístico de Litehaus incorpora el modelo fiscal **PORTUGUÉS** (IMT, Imposto do Selo, IVA 23%) y **NO se aplica a inmuebles en España**."*

A **Portuguese tax model reached a Spanish property report and shipped**. They caught it and printed a disclaimer rather than routing correctly — the whole §06 is voided in-place.

⇒ **Never build anything whose correctness depends on the caller passing the right jurisdiction. Route from the data.** This is the same class as the version traps hit three times today (Madrid, Germany, Paris): a value that is correct *somewhere* arriving where it does not apply. It is precisely what the **attribution layer** exists to prevent — and it is now an observed production failure in a competing product, not a hypothetical.

Their ITP row shows the same shape: *"comunidad autónoma no identificada … 6–11% según comunidad autónoma — verificar."* They could not resolve the CCAA for a parcel whose refcat encodes Murcia.

### M-4 — Two of their facts that would change an envelope, so verify independently

1. **Flood.** *Inside* an official SNCZI **T=100** zone, *"edificación muy condicionada"* + Confederación Hidrográfica report required. If true this is a **hard envelope constraint**, not a scoring penalty. Verify against SNCZI/MITECO directly — noting they record the DPH WMS as **down**, so any deslinde claim is unverified by them too.
2. **Bearing capacity −25.** Explicitly **their heuristic over IGME GEODE**, not an IGME datum. Do not inherit it as fact.

### M-5 — What "rate as high as possible" honestly means here

The founder's instruction is to score as high as we can. The honest reading: **maximise what we can defend, not the number.**

Their 53/100 sits on **12/100 completeness** — the score is mostly weighting assumptions applied to absent evidence. We can beat them on **parcel identity, building heights, terrain resolution, and citation quality**, because those are data we can actually fetch. We cannot beat them on **market, financial, or registry** — no price, no AVM, and the Nota Simple has no free API (~€9/finca), and inventing any of it would be the L-616 failure with a euro sign.

⇒ **The defensible claim is: fewer axes, each one cited and verified, with the gaps named.** That is a different product from a 53/100 built on 12% evidence — and it is the only one consistent with this repo's own rules.

*Related: [`MURCIA-DATA-RECON.md`](./MURCIA-DATA-RECON.md) · [`MURCIA-TERRAIN-AND-HEIGHTS.md`](./MURCIA-TERRAIN-AND-HEIGHTS.md) ·
[`../../../../standards/LEGAL-ATTRIBUTION-MODEL.md`](../../../../standards/LEGAL-ATTRIBUTION-MODEL.md) ·
[`../../../../standards/PARCEL-IDENTIFIER-RESOLUTION.md`](../../../../standards/PARCEL-IDENTIFIER-RESOLUTION.md)*
