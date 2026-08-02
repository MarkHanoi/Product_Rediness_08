# ENVELOPE — Murcia (INE 30030)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4).
> **Last updated:** 2026-08-01. **Maintainer:** UNASSIGNED.

## Status: PACK AUTHORED, GATE CLOSED — `MURCIA_ENVELOPE_VERIFIED = false`

> ⚠ **This file was materially wrong until 2026-08-01.** It recorded S2 / S3 / S5 as `❌ none`.
> All three had been wired on 2026-07-31 (`60d11aea`, corrected `7333374f`). The table below is
> re-derived from the code, not from the previous revision of this file.

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Catastro INSPIRE WFS (national) | ✅ live — refcat, boundary, official area, existing buildings + floor counts |
| **S2 — router predicate** | `providers/murciaBbox.ts` `isInMurcia` | ✅ wired in `siteDispatch.ts` |
| **S3 — zone source** | `Murcia:pgou_alineaciones` + `Murcia:pgou_sectores` via `/api/es/murcia-pgou` | ✅ **live** — `providers/resolveMurciaZoning.ts` |
| **S4 — rule pack** | `rulepacks/esMurciaPgou2012.ts` | ✅ **authored** — 14 zones, article + verbatim quote each. ⛔ gated |
| **S5 — registration** | `rulepacks/registry.ts` | ✅ `es-30030-murcia` registered (refusal-only `packsByZone`) |

---

## 1 — THE PRIMARY TEXT, AND ITS AUTHORITY STATUS

| Field | Value |
|---|---|
| **Document** | «PLAN GENERAL MUNICIPAL DE ORDENACIÓN DE MURCIA — Texto Refundido. diciembre 2012. VOLUMEN 11 — NORMAS URBANÍSTICAS» |
| **Authority** | Ayuntamiento de Murcia, Concejalía de Urbanismo y Vivienda |
| **URL** | `http://urbanismo.murcia.es/infourb/documentos/Normas_Urbanísticas_del_Plan_General_Texto_Refundido_diciembre_de_2012.pdf` |
| **Retrieved** | 2026-08-01, HTTP 200, 2 352 553 bytes, 205 pp, born-digital (not a scan) |
| **Embedded PDF title** | `TR PG vol_11 NN UU.signed.pdf` — the municipality's own **signed** consolidation artefact |
| **Consolidation** | *Texto Refundido*, December 2012 |
| **"Sin valor normativo" disclaimer** | **NONE.** Checked, not assumed: «sin valor normativo» and «valor normativo» appear **0 times** in 205 pp |
| **BORM approval reference** | **`not-located-in-source`** — see below |
| **Approval date of the PGOU revision** | **`not-located-in-source`** |

### ⚠ What we deliberately do NOT claim

The consolidated text contains the token `BORM` **exactly once**, in *Disposición Transitoria
Tercera*, referring to the publication of the **aprobación inicial** of the Revisión — not to this
document's own approval instrument. So we hold the **normative text** but not the **gazette act
that enacted it**.

That is recorded as `not-located-in-source`, **not** as "does not exist". Barcelona's citation was
once anachronistic and had to be re-signed; a confident citation to an approval instrument nobody
read is worse than none. Locating the BORM reference is a named pre-signature task (`NEXT.md`).

### A second, more recent consolidation exists

`https://www.murcia.es/documents/2423107/2455459/normas_urbanisticas_adaptadas_legislacion_regional.pdf`
— «NORMAS URBANÍSTICAS REFUNDIDAS ADAPTADAS A LS REG. act. 28_02_2017», 196 pp, *"Documento
adaptado al Decreto Legislativo 1/2005"*. It is the version linked from the municipality's public
*Normas Urbanísticas* page and was also retrieved (HTTP 200, 1 245 444 bytes).

**Every article quoted in the pack was read from the 2012 TR.** Whether the 2017 re-edition alters
any of them is **UNVERIFIED**. Do not assume concordance — that diff is a pre-signature task.

---

## 2 — 🔴 THE NUMBER THAT DECIDES THIS CITY

> **Base measurement:** the orchestrator's land-class census,
> [`findings/MURCIA-LAND-CLASS-AND-DERIVED-PLAN-SPLIT.md`](./findings/MURCIA-LAND-CLASS-AND-DERIVED-PLAN-SPLIT.md)
> (commit `45a8af74`) — all 3 611 `pgou_sectores` features, municipality 902.4 M m², *Urbano*
> **56.0 M m²** = the L-656 denominator. **Not re-derived here.**
>
> **Resolution of its four open items:**
> [`findings/MURCIA-DERIVED-PLAN-SPLIT-RESOLVED.md`](./findings/MURCIA-DERIVED-PLAN-SPLIT-RESOLVED.md).
> ⚠ **Its projected ~75 % ceiling does not survive**, for two reasons found in the PGOU text.

**Reason 1 — the 19.3 % null `categoria` block is 100 % derived-plan ámbitos** (`PU` `PM` `UE` `PI`
`UD` `PC` `PH` `PE` `PERI` `PT` `PX` `PB` `PA` `PR` `PEI` `PP` `PEE` — every one a Plan Especial, a
Unidad de Actuación or an Estudio de Detalle, no residue). It is a *delegation marker*, not an
unknown. The census's 24.8 % delegated becomes **38.2 %** on its own method.

**Reason 2 — `US` (22.25 %) delegates, conditionally.** Art. 5.14.2: *«La ordenación de estos
espacios se llevará a cabo a través de **Planes Especiales de Adecuación Urbanística**»*; but
Art. 5.14.3 supplies a directly-applicable regime *«antes de la aprobación de Planes Especiales»* at
the same 0,25 m²/m² index. So it is **conditionally direct**, and cannot be counted as
unconditionally direct.

### On the census's method (published `superficie`, *Urbano* = 56.0 M m²)

| | share of Urbano |
|---|---:|
| Unconditionally DIRECT (`U` 36.9 % + `UR` 2.7 %) | **39.5 %** |
| CONDITIONALLY direct (`US`, Arts. 5.14.2 / 5.14.3) | **22.25 %** |
| DELEGATED (`UA` + `UM` + `UH` + the null block) | **38.2 %** |

**⇒ Ceiling 39.5 % – 61.8 %**, not ~75 %.

### On true polygon area, calificación-aware (census open item #3)

23 066 in-force `Murcia:pgou_alineaciones` polygons, shoelace areas in the layers' native
**EPSG:25830**, joined to `pgou_sectores` for `clase_suelo` (join rate **99.74 %**). Denominator =
**private buildable calificaciones, 75.145 km²** — wider than *Urbano*, because it also counts
buildable calificaciones inside *Urbanizable*.

| | km² | share of private buildable land |
|---|---:|---:|
| **PGOU-DIRECT** — Título 5 Caps. 2–23 fix the conditions | **24.800** | **33.0 %** |
| **DELEGATED** — a derived instrument fixes them | **50.345** | **67.0 %** |

Lower again because **41.4 pp of the delegation is published on the `calificacion` attribute**, not
on the sector code — invisible to a sectores-layer census. See the table below.

⚠ **Method differs between the two blocks**: the census's shares are the published `superficie`
attribute; these are measured geometry. Do not present them as like-for-like.

### Why each hectare is delegated — in the plan's own words

| Reason | Article | km² | share |
|---|---|---:|---:|
| *Calificación genérica* (RX, RJ, RS, UC, IP, TC, GP, AE) | Arts. 5.25.3.3 / 5.26.3.3 / 6.2.2.4 / 6.5.1 | 22.663 | 30.2 % |
| Suelo urbanizable → Plan Parcial | Art. 6.2.2.3 | 15.438 | 20.5 % |
| Remitted calificación (RR, TR, IR, GR) | Arts. 5.24.5 / 5.24.6 | 8.428 | 11.2 % |
| Delegating ámbito (UA, UH, UM, UE, UD, TA, TM, P*) | Arts. 5.24 / 5.25 / 5.26 / 6.6 | 3.816 | 5.1 % |

The decisive quote, from **Arts. 5.25.3.3 and 5.26.3.3**, identical in both:

> «…el alcance de los códigos de calificación zonal de los suelos edificables dentro del ámbito,
> reflejados en los planos, **se reduce a las condiciones de uso y tipología de las edificaciones,
> pero no a los parámetros definitorios de la altura o edificabilidad**. En ocasiones se recurre en
> los planos a indicaciones de calificación genérica (RX, RJ, RS, UC, IP, TC, GP, AE) con
> significación análoga a las definidas para el suelo urbanizable sectorizado en los artículos
> 6.2.2.4 y 6.5.1.»

And **Art. 6.5.1**:

> «Dentro de la ordenación **orientativa** que reflejan los planos de ordenación para el suelo
> urbanizable sectorizado, los terrenos genéricamente destinados a los usos globales y compatibles
> de las zonas ZG, ZI, ZT y ZP se califican respectivamente con los códigos GP, IP, TC y AE.»

### ⭐ 2.1 — THE CROSS-TAB: what a signature would actually render is **23.51 %**, not 33.0 %

Run 2026-08-01 by [`tools/murcia-coverage-crosstab/`](../../../../../../tools/murcia-coverage-crosstab/README.md)
(artefact `out-crosstab.json`, pinned by `murciaCoverageCrosstab.test.ts`). The tool **reproduces
every figure above from the live layers** — 75.145 km², 33.00/67.00, all four delegation grounds, the
99.74 % join rate and each per-family share in §3.1 to two decimals — before computing anything new.

The 33.0 % (delegation test) and the 38.95 % (calificación-code test) are shares of **different
sets**. `murciaEnvelopeDisposition` applies delegation FIRST, so the answerable land is their
**intersection**:

| | km² | share of private buildable land |
|---|---:|---:|
| 14 packed calificaciones, by code | 29.270 | 38.95 % |
| — packed but sitting on **delegated** land (refuses anyway) | 11.607 | 15.45 % |
| **⭐ packed AND PGOU-direct — THE POINT VALUE** | **17.663** | **23.51 %** |
| … of which the expressly *interim* `RL` (Art. 5.14.3) | 12.425 | 16.53 % |
| **⇒ FIRM FLOOR excluding `RL`** | **5.238** | **6.97 %** |

⚠ **38.95 %, not the 38.7 % published on 2026-08-01 morning** — the difference is `RM1` (0.11 %) and
`RM2` (0.18 %), which were `UNMEASURED` inside the `RM` family and now are not.

### ⚠ The 33 % has a soft half — read this before planning work against it

Of the 24.800 km² PGOU-direct, **12.425 km² (16.53 % of buildable land) is calificación `RL`**,
whose ordinance (Art. 5.14.3) is headed *«Condiciones de edificación y usos **antes de la
aprobación de Planes Especiales**»*. Art. 5.14.2 remits the definitive ordering to a *Plan Especial
de Adecuación Urbanística*. Those numbers hold only while no PE has been approved for the ámbito —
and PRYZM cannot check that. Every square metre of `RL` measures as PGOU-direct, so `RL` is the
whole difference between the point value and the firm floor.

#### ⚠⚠ CORRECTION — "firm floor 16.5 %" was arithmetic on the wrong set

The earlier revision of this file computed the floor as `33.0 % − 16.5 % (RL) = 16.5 %`. That
subtraction leaves *PGOU-direct land that is not RL* — which is **not** *land a signature would
render*. 9.49 pp of it is `RB` `RC` `RM` `RN` `RT` `RU` `MZ` `MX`: codes refused in §3.2 on a
**CONSTRUCTED or UNKNOWN parameter**, which no signature touches.

**The firm floor is 5.238 km² = 6.97 %.** The honest range for this city is **6.97 % – 23.51 %**.

### 🔴 2.2 — AND THE CROSS-TAB FOUND A DEFECT IN OUR OWN DISPOSITION

`murciaEnvelopeDisposition` tests delegation on the sector prefix alone
(`REMITTED_AMBITO_PREFIXES` = `TA TM UA UH UM`). It applies **no clase-de-suelo test** and does not
know `UE` (Art. 5.25.1), `UD` (Art. 5.25.2) or `P*` (Art. 5.26.2). Measured consequence, were both
gates opened:

| | km² | pp of buildable |
|---|---:|---:|
| what the code would render on signature | 27.494 | **36.59 %** — ⚠ **above the 33.00 % ceiling** |
| … on *urbanizable* land (Art. 6.2.2.3, Plan Parcial) | 7.993 | 10.64 |
| … on a delegating ámbito the prefix list misses | 1.841 | 2.45 |
| **total published on delegated land** | **9.834** | **13.09** |

Not live — `MURCIA_ENVELOPE_VERIFIED = false` **and** L5 does not consume the `envelope` branch.
Registered as `RISK-REGISTER.md` **§R-7**, a named pre-signature blocker: **the disposition must
learn the full delegation test in the same change that opens either gate.**

### Comparison — Murcia is COMPARABLE to Barcelona, not clearly better

| City | delegated | direct ceiling |
|---|---:|---:|
| Barcelona | 62.8 % (`PD*`, measured geometry) | ≈ 37 % |
| **Murcia**, census method, `US`+null resolved | **38.2 %** | **39.5–61.8 %** |
| **Murcia**, calificación-aware polygon area | **67.0 %** | **33.0 %** — but what a signature RENDERS is **23.51 %** (6.97 % firm) |

The census's conclusion that *"Murcia has a better starting position than the flagship"* rested on
its 24.8 % and **does not survive**. What does survive: Murcia's absolute buildable area is larger,
and **33 % of 75.1 km² is still a real, transcribable prize** — precisely the slice
`esMurciaPgou2012.ts` covers.

Same order of magnitude, same structural cause. **This is not a PRYZM coverage gap and no amount of
transcription closes it.** It is what Spanish general plans do.

---

## 3 — THE CALIFICACIÓN TABLE

Four-state classification per `EXTRACTION-PROTOCOL.md`: **STATED** · **CONSTRUCTED** ·
**NOT-THE-RULE-KIND** · **UNKNOWN**. Rule KIND per ADR-0270 / C58 §2.2 — *the wrong KIND is a wrong
SHAPE, not a wrong number*. Granularity is **parcel** for every row below. Shares are of the
75.145 km² private-buildable denominator.

### 3.1 — PACKED (14 zones): every envelope-determining parameter STATED

| Code | Designation | Share | KIND | Height | Depth / setback | FAR | Coverage | Article |
|---|---|---:|---|---|---|---|---|---|
| `RL` | Agrupaciones Lineales Residenciales | 16.53 % | setback | **7 m / 2 pl** | 5 m front & rear, 7,5 m sides | **0,25** | not-the-rule-kind | 5.14.3 ⚠ interim |
| `RD` | Vivienda Unifamiliar Adosada | 6.33 %¹ | setback | **7 m / 2 pl** | 3 m front, 3,5 m rear, medianera | **1,3** | not-the-rule-kind | 5.9.3 |
| `RD1` | …sin retranqueo de fachada | ¹ | **alignment** | **7 m / 2 pl** | **fondo 15 m**, party-wall | not-the-rule-kind² | not-the-rule-kind | 5.9.3 |
| `IX` | Parcela Industrial Exenta | 6.46 % | setback | **no-limit**³ | 5 m all | **0,7** | **0,70** | 5.19.3 |
| `RF` | Vivienda Unifamiliar Aislada | 3.42 % | setback | **7 m / 2 pl** | 4 m to road, 3 m rest | *constructed*⁴ | **0,40** | 5.10.3 |
| `RG` | …en Gran Parcela | 2.23 % | setback | **7 m / 2 pl** | 6 m to road, 5 m rest | *constructed*⁴ | **0,30** | 5.11.3 |
| `IC` | Parcela Industrial Compacta | 1.74 % | setback | **no-limit**³ | 4 m façade, then total | **1,0** | **1,00** | 5.18.3 |
| `RH` | Unifamiliar en Transición a Huerta | 0.60 % | setback | **7 m / 2 pl** | 5 m front & rear, ≥2 m sides | not-the-rule-kind | **0,20**⁵ | 5.12.3 |
| `MC` | Centro Histórico de Murcia | 0.59 % | **alignment** | **16 m / 5 pl** | **fondo 15 m**, party-wall | not-the-rule-kind | not-the-rule-kind | 5.2.3 |
| `IG` | Gran Parcela Industrial | 0.43 % | setback | **no-limit**³ | 10 m all | **0,6** | **0,60** | 5.20.3 |
| `AJ` | Usos Singulares en Parcela Ajardinada | 0.27 % | setback | **7 m / 2 pl** | 15 m all | **0,4** | **0,30** | 5.23.3 |
| `RM1` | Manzana Cerrada Tradicional, subzona 1 | ⁶ | **alignment** | **25 m / 8 pl** | **fondo 15 m**, party-wall | not-the-rule-kind | not-the-rule-kind | 5.5.3 |
| `RM2` | …subzona 2 | ⁶ | **alignment** | **16 m / 5 pl** | **fondo 15 m**, party-wall | not-the-rule-kind | not-the-rule-kind | 5.5.3 |
| `MG` | Zona Gran Vía | 0.06 % | **alignment** | **28 m / 9 pl**⁷ | **fondo 15 m**, party-wall | not-the-rule-kind | not-the-rule-kind | 5.4.3 |

¹ `RD` + `RD1` share the 6.33 % row (the layer publishes them as separate codes).
² Expressly disapplied: *«sin aplicación del anterior índice de edificabilidad»*.
³ **NO-LIMIT FINDING**, not UNKNOWN — *«La altura será libre y sujeta a las necesidades de la propia
industria»* (5.18.3) / *«La altura de las edificaciones será libre…»* (5.19.3, 5.20.3). Encoded
`null`; never a large number, never 0.
⁴ **CONSTRUCTED**: *«Edificabilidad neta: La que resulte de los parámetros de ocupación y altura»* —
a procedure, not a figure. Left `null`; the engine derives it. Transcribing `0,80` would be
engineering wearing a transcription's clothes.
⁵ Plus an absolute 200 m² footprint cap and a 0,5 m²/m² rule for sub-800 m² parcels — parcel-SIZE
conditional, recorded in `MURCIA_PARCEL_SIZE_CONDITIONS`, **not** folded into the scalar.
⁶ Inside the 7.77 % `RM` family; only the two named subzones escape the street-width table.
⁷ The Gran-Vía-frontage case. Art. 5.4.3.2's reduced heights for corner parcels and façades opposite
the Centro Histórico depend on which frontage a parcel presents — not resolved.

### 3.2 — REFUSED, and why each refusal is a *correct answer*

| Code | Share | Why refused | Four-state |
|---|---:|---|---|
| `GP` `RX` `RJ` `IP` `UC` `AE` `TC` `RS` | 30.16 % | **Calificación genérica.** Arts. 5.25.3.3 / 5.26.3.3 / 6.5.1 — scope reduced to use + typology | height/far = **not-the-rule-kind** |
| `RR` | 8.48 % | **Remitted by name.** Art. 5.24.5.1: *«sus condiciones de edificación son enteramente concordantes con las definidas en los anteriores instrumentos convalidados»* | not-the-rule-kind (wrong instrument) |
| `RB` | 5.34 % | **Existing-building-derived.** Both permitted routes are measured against the standing building; a vacant RB parcel has no stated buildability. Cap 8 plantas | depth/far/coverage = not-the-rule-kind |
| `RC` | 3.24 % | **Street-width table.** 2 pl/7 m (<4 m) · 3 pl/10 m (4–8 m) · 4 pl/13 m (≥8 m). Depth 15 m *is* stated | height = **CONSTRUCTED** |
| `TR` `IR` `GR` | 2.73 % | Remitted economic-industrial codes, Art. 5.24.6 | not-the-rule-kind |
| `RT` | 1.98 % | Three cases, none packable: existing-use; **neighbour-derived** (*«las mismas que las de las fincas colindantes»*); or FAR 1,3 *«se ordenará a través de Estudio de Detalle»* | coverage/depth = UNKNOWN |
| `RU` | 0.99 % | **Preservation regime** — *«respetará los parámetros de la edificación preexistente»* | all = not-the-rule-kind |
| `RM` (base) | ⁶ | Same street-width table as RC, plus a 5 pl/16 m Ejes Comerciales case keyed to a graphed line | height = **CONSTRUCTED** |
| `RN` | 0.26 % | Street-width table (2 pl ≤4 m / 3 pl >4 m with a 3 m top-floor setback) | height = **CONSTRUCTED** |
| `MZ` | 0.21 % | ⚠ **The most tempting refusal.** Height *is* stated (8 pl / 25 m). But FAR is an algorithm — *«2'66 m2/m2 de superficie de parcela más semiancho de calles contiguas limitadas a un ancho máximo de 10 metros»* — over a street width we do not hold; and the footprint is expressly delegated: *«La ocupación, la separación a linderos … se determinarán mediante … Estudio de Detalle.»* **A height with no footprint is not an envelope.** | far = CONSTRUCTED, coverage = UNKNOWN |
| `MX` | 0.18 % | Height depends on **which frontage** a parcel presents (5 pl/16 m principal vs 3 pl/10 m secundaria); sub-case (b) states storey counts with **no metre equivalent** | height = CONSTRUCTED / UNKNOWN |

### 3.3 — The street-width blocker, named once

`RC`, `RM` (base), `RN`, `RD1`'s third storey, `MZ`'s FAR and `MX`'s frontage rule all reduce to
**one missing input: a Murcia street-width / frontage-class source.** That single resolver would
lift **8.81 % of buildable land** (6.620 km², = `RC` 1.650 + `RM` 4.790 + `RN` 0.180 on PGOU-direct
land) out of refusal, and is the highest-leverage next unit of work.

⚠ **This was published as "~4 %" and that was too low** — it counted `RC` + `RN` + `MZ` + `MX` and
omitted the **`RM` base zone**, which is 7.48 % of buildable land and refuses on the *same*
street-width table as `RC`. Measured 2026-08-01 by `tools/murcia-coverage-crosstab/`. The gap sits
entirely **inside** the 33.00 % PGOU-direct ceiling and entirely **outside** the 23.51 % a signature
renders — so it is strictly additive to signature coverage, which is the question §CLOSURE could not
answer before the cross-tab was run. Packing
one width would publish one street's answer for the whole zone — the L-526 failure verbatim, and
Córdoba's `MC` refuses on exactly this ground.

#### 3.3.1 — §MURCIA-STREET-WIDTH-SOURCE-SURVEY: every candidate probed, and the typed refusal

Probed live 2026-08-01/02 against `geoserver.murcia.es` (statuses in
[`corpus/RETRIEVAL-LOG.md`](./corpus/RETRIEVAL-LOG.md) §3). **No published Murcia layer carries a
width.** ADR-0275 already established that no *declared*-width dataset exists anywhere in Spain and
that the width must be **constructed**; this records what Murcia specifically does and does not
publish, so the next attempt does not re-probe the same four dead ends.

| candidate | what it actually is | verdict |
|---|---|---|
| `Murcia:viales` | MultiLineString street **centrelines**; `cod_padron · cod_ine · tipo_via · nombre · matricula` | ❌ **no width attribute.** A street-name gazetteer, not a section. |
| `Murcia:comunicaciones_poligonos` | MultiPolygon road **surfaces**, classified by `elemento` | ❌ **not urban.** A 350 × 440 m box over the Casco Antiguo returns **4 features: 1 `Carretera Secundaria` + 3 `Carril Bicicleta`**. This is the 1:5 000 topographic *carretera* network; the historic centre's streets — precisely the `RC`/`RM` land that needs a width — are **absent**. |
| `Murcia:pgou_eje_comercial` | LineString axes of the *Ejes Comerciales* | ⚠ **useful but insufficient.** It resolves the *categorical* half of Art. 5.5.3's 5-plantas case, but the article's own test is *«Ejes Comerciales con **sección mayor de 12 metros**»* — still width-dependent. |
| `Murcia:pgou_ejes` | LineString, DXF-derived axes | ❌ no width. Candidate for `MX`'s *eje viario principal* vs *vía secundaria* classification only. |
| per-zone fiche PDFs (`url` = `MC.pdf` on `pgou_alineaciones`) | — | ❌ **HTTP 404** at the `infourb/documentos/` path. Not located; not proven absent. |

**TYPED REFUSAL — what is missing, named precisely:**
`missing-input: street-section-width` · `granularity: per-street-segment` · `blocks:` Arts. 5.3.3
(`RC`), 5.5.3 base (`RM`), 5.7.3 (`RN`), 5.9.3 (`RD1` 3rd storey), 5.6.3.2 (`MZ` FAR), 5.22.3 (`MX`
frontage) · `share: 8.81 pp of buildable land` · `published source: NONE — probed, not assumed`.

**THE ONE VIABLE ROUTE, and its preconditions.** The PGOU measures *ancho de calle* between
**alineaciones**, not between kerbs — so the input is the **void between facing
`Murcia:pgou_alineaciones` polygons**, a layer PRYZM already fetches on every Murcia click. That is
ADR-0275's construction (`geometry/streetWidth.ts` + the dissolve) applied to a layer we hold,
rather than a new feed. It is therefore **engineering, not sourcing**. Three preconditions, none
discharged:

1. **ADR-0275's snap gate applies unchanged.** *Cluster ⇒ ship the snap; no cluster ⇒ ship the raw
   measured width and say so.* Murcia is **not** in the 5-city probe
   ([`../../SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md`](../../SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md)),
   and the quantum set is CITY-SPECIFIC — so the probe must be re-run for Murcia before any snap.
2. **The band edges are STEPS.** Art. 5.3.3 jumps 2→3→4 plantas at exactly 4 m and 8 m. A measured
   width either side of a boundary is a whole storey, so the measurement's error bar has to be
   stated, not the width alone.
3. **⚠ IT NEEDS A NEW SIGNATURE, AND SIG-MU1 IS NOT IT.** SIG-MU1 authorises publication for *the
   14 transcribed calificaciones on non-delegated soil* and expressly does **not** authorise
   *"resolving the street-width blocker"* or *"any number for the … REFUSED calificaciones"*. So
   even a correct resolver moves **0 pp** on this axis until a founder signs SIG-MU2. Building it
   first and signing after is the right order — but the ENVELOPE number does not move on build.

#### 3.3.2 — ⭐ BUILT 2026-08-02: the TABLE half of the unlock is done, cited and tested

`packages/site-parcel-data/src/rulepacks/esMurciaAnchoDeCalle.ts` — **9 bands across 4 tables**
(Arts. **5.3.3** `RC` · **5.5.3** base `RM` · **5.7.3** `RN` · **5.9.3** `RD1`+1), each carrying its
article and a **verbatim quote read from the filed PDF**, all four articles byte-identical across
both consolidations. 20 tests. Exported from the package index; **not wired, not authorised.**

This is deliberately Murcia's **"(b) height table keyed on street width"** and nothing more —
`geometry/streetWidth.ts` states that regional-scope contract in its own header, and the measurement
half is already region-agnostic and shipped (ADR-0275). **No Murcia branch was added to
`ZoningRulesEngine`**; per-city special-casing in the engine is the parallel wiring P1 forbids.
`effectiveBandEdgeGuard_m` is **reused, not re-declared** — that constant prices GIS-measured vs
legally-declared width, a property of the technique, not of Barcelona.

Three findings the transcription produced, none of which a paraphrased table would have kept:

1. **The 4 m boundary flips inclusivity between articles.** Art. 5.3.3 says *«calles **menores de**
   4 metros»*; Art. 5.7.3 says *«calles **menores o iguales a** 4 metros»*. **At exactly 4.00 m an
   `RC` street gives 3 plantas and an `RN` street gives 2.** Normalising the comparison would
   publish a storey too many on every 4 m street in the pedanías.
2. **The ordinance OVERLAPS at exactly 8.00 m.** *«de 4 a 8 metros»* and *«de 8 metros o mayor
   ancho»* both claim it. We do not invent a tie-break — **Art. 1.1.4 supplies one**
   (*«la interpretación más favorable a la menor edificabilidad»*), so 8.00 m resolves **down** to
   3 plantas and the resolution says it did.
3. **Two of the nine bands grant a RECESSED top storey**, not a full floor (`RN`'s third, set back
   3 m; `RD1`'s third, set back 3 m). Reported as `topStoreySetback_m` so a consumer cannot extrude
   `floors × footprint` and overstate the GFA.

#### 3.3.3 — ⭐⭐ SHIPPED 2026-08-02: SIG-MU2 SIGNED, WIRED, AND **MEASURED**

All three blockers named in §3.3.2 are discharged.

**1 · The bbox fetch LANDED.** `/api/es/murcia-pgou?extent=neighbourhood` returns the surrounding
`Murcia:pgou_alineaciones` polygons (half-extent 0.002° ≈ 222 m, the same figure Barcelona's
`BLOCK_BBOX_HALF_DEG` uses for the identical job). `resolveMurciaStreetWidth` projects them to a
local metric frame and feeds the **unmodified, region-agnostic** `measureStreetWidths` /
`blockEdgesFacingParcel` / `governingStreetWidth`. **No dissolve is involved** — Murcia publishes
block-level alineación polygons directly, which is exactly why this works here and not in Madrid
(2/4 blocks) or Córdoba (0/3).

**2 · 🔴 THE SNAP GATE RAN, AND IT REFUSES. Murcia gets NO snap.**
`tools/murcia-street-width-probe/snapGate.mts` — **18 854 measurements across 3 693 blocks in 20
tiles**, ADR-0275 §3's exact test (hits within ±0.6 m of a quantum ÷ the count expected from the
local ±5 m density; **×1.0 = no clustering**):

| quantum | 4 | 5 | 6 | 8 | 10 | 12 | 15 | 16 | 20 | 25 | 30 | 40 | 48 | 50 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Murcia** | ×0.33 | ×0.58 | ×0.43 | ×0.45 | ×0.36 | ×0.34 | ×0.36 | ×0.28 | ×0.29 | ×0.23 | ×0.46 | ×0.38 | ×0.20 | ×0.41 |
| *Barcelona (ADR-0275)* | — | — | ×4.10 | ×2.31 | ×0.63 | — | ×0.24 | — | **×7.55** | ×0.00 | **×7.51** | — | **×6.23** | ×0.90 |

**Not one candidate reaches ×1.0. The highest is ×0.58.** Where Barcelona shows ×7.55 spikes at
real Cerdà quanta, Murcia's widths *avoid* round values — the signature of an organically grown
historic street network rather than a designed grid. ADR-0275's rule is explicit: *"No cluster ⇒ do
not ship it, fall back to the raw measured width and say so."* **So we ship the raw measured width,
and this is where we say so.** Nothing snaps; the band-edge guard is the only tolerance in the path.

⚠ Consequence, stated plainly: **the 44.6 % band-edge refusal rate below cannot be recovered by
snapping.** That was the one available upside and the data has removed it.

**3 · ✅ SIG-MU2 SIGNED (founder, 2026-08-02)** — text, rationale, scope and the four binding
conditions are recorded verbatim in [`sources/VERIFICATION.md`](./sources/VERIFICATION.md), each
condition pinned by a named `describe` block in
`packages/site-parcel-data/__tests__/murciaStreetWidth.test.ts`.

##### THE MEASURED RESULT — this is the number to quote

Founder, same day: *"Publish measured coverage only. Never publish theoretical maximums. Upper
bounds remain internal planning numbers."*

`tools/murcia-street-width-probe/probe.mts`, area-weighted sample of the live layer (n = 150 rings,
0.590 km² of the 7.845 km² in-force RC/RM/RN population, seed 20260802), run end-to-end through the
**production** resolvers:

| outcome | share of sampled RC/RM/RN land |
|---|---:|
| **RESOLVES — an envelope publishes** | **51.3 %** |
| refused `band-edge` — condition 4 / **ADR-0287** working | 44.6 % |
| refused `no-opposing-frontage` | 3.4 % |
| refused `needs-eje-comercial` | 0.7 % |

⇒ **8.81 pp × 0.513 = 4.52 pp of new buildable-land coverage**, taking Murcia from **23.51 % →
28.03 %** and the ENVELOPE axis from **9.40 % → 11.21 %**.
*(Assumption stated rather than buried: the resolve rate is measured over ALL in-force RC/RM/RN
geometry, and applied to the PGOU-direct subset the dispatch actually reaches. The rate is a
property of street geometry, not of delegation status, so this is reasonable — but it is an
inference, and re-measuring on the direct subset alone would tighten it.)*

⭐ **Why 44.6 % refuses is a fact about MURCIA, not about the code.** Art. 5.3.3's decisive
threshold is **8 m**, and the median *governing* street section on RC/RM/RN land measures
**8.78 m** — the ordinance's band edge sits in the middle of the city's own street-width
distribution, the worst possible place for it. A city whose streets cluster away from its
thresholds would lose far less to the same guard.

⚠ **AND THIS IS THE LAST LARGE MOVE MURCIA HAS UNDER THE CURRENT SIGNATURE BASIS.** SIG-MU1 records
`authoritative` as UNREACHABLE for this ruleset, so every Murcia envelope publishes at
`estimated-ruleset` (weight **0.4**) and **ADR-0285** confirms a signature on methodology does not
promote the tier. Even at the full 33.00 % of buildable land the PGOU orders directly, the axis
caps at **13.2 %**. 11.21 % is 85 % of that ceiling. Raising it further needs a different
*signature basis*, not more engineering.

---

## 4 — WHAT SHIPS TODAY

`MURCIA_ENVELOPE_VERIFIED = false`, so **every Murcia parcel still renders a cited refusal and no
number reaches the panel or the massing.** What changed is *which* refusal:

- **PGOU-direct land** → a refusal that **names its governing article** and says the missing
  ingredient is the *signature*, not the law and not the data.
- **Delegated land** → unchanged: the legally-grounded `derived-plan` refusal naming the instrument
  the user must obtain.
- **Unclassified** → the generic coverage refusal, `ordinanceRef: null`.

A test pins that the transcribed scalars do **not** leak into the refusal prose — a gate you can
read around is not a gate.

### The founder's own parcel stays refused

`3481104XH6038S` — 935 m², calificación **RR**, ámbito **TA-379**, inside **Plan Parcial CR-5**.
Arts. 6.6.2 and 5.24.5.1 delegate its parameters to that partial plan. **Transcribing the PGOU does
not unlock it**, and a test pins that (`murciaPgou2012.test.ts`).

---

## 5 — WHAT MUST HAPPEN BEFORE THE GATE OPENS

1. Human verification of the 14 transcriptions against the source PDF → sign `sources/VERIFICATION.md`.
2. Locate the **BORM** approval reference (currently `not-located-in-source`).
3. Diff the **2017** re-edition against the 2012 TR for the 14 packed articles.
4. Teach L5 (`applyMurciaZoningThenFallback`) to consume the `envelope` disposition. Until then the
   `envelope` branch carries a `reason` string so it **degrades to a refusal** rather than rendering
   nothing (safety interlock, tested).
5. Register `ES_MURCIA_PGOU2012_PACK` in `rulepacks/registry.ts` — snippet in `NEXT.md`.

**Do NOT reuse another municipality's numbers.** Barcelona's Arts. 242 / 322 / 327 have no force
here; a test asserts the pack mentions no Catalan instrument.

*Cross-refs: C58 §1.2/§1.4/§1.7a/§1.11, C60, C63 §3 Axis 4, L-656, ADR-0270, ADR-0279,
`../../es-ct/08019-barcelona/claus/EXTRACTION-PROTOCOL.md`.*
