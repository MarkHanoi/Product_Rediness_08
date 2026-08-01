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

### ⚠ The 33 % has a soft half — read this before planning work against it

Of the 24.800 km² PGOU-direct, **12.425 km² (16.5 % of buildable land) is calificación `RL`**,
whose ordinance (Art. 5.14.3) is headed *«Condiciones de edificación y usos **antes de la
aprobación de Planes Especiales**»*. Art. 5.14.2 remits the definitive ordering to a *Plan Especial
de Adecuación Urbanística*. Those numbers hold only while no PE has been approved for the ámbito —
and PRYZM cannot check that.

**The firm floor, excluding RL, is 12.375 km² = 16.5 %.** The honest range for this city is
therefore **16.5 %–33.0 %**, and RL is the single largest calificación on buildable land.

### Comparison — Murcia is COMPARABLE to Barcelona, not clearly better

| City | delegated | direct ceiling |
|---|---:|---:|
| Barcelona | 62.8 % (`PD*`, measured geometry) | ≈ 37 % |
| **Murcia**, census method, `US`+null resolved | **38.2 %** | **39.5–61.8 %** |
| **Murcia**, calificación-aware polygon area | **67.0 %** | **33.0 %** (16.5 % firm) |

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
lift ~4 % of buildable land out of refusal and is the highest-leverage next unit of work. Packing
one width would publish one street's answer for the whole zone — the L-526 failure verbatim, and
Córdoba's `MC` refuses on exactly this ground.

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
