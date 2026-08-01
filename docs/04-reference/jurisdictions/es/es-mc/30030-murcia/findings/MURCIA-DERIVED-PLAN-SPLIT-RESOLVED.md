# Murcia — the derived-plan split, RESOLVED against the PGOU text

> **Follow-on to [`MURCIA-LAND-CLASS-AND-DERIVED-PLAN-SPLIT.md`](./MURCIA-LAND-CLASS-AND-DERIVED-PLAN-SPLIT.md)**
> (the orchestrator's land-class census, commit `45a8af74`). That census is the BASE and is not
> re-derived here. This file closes its four open items using the PGOU *Normas Urbanísticas*, which
> have now been sourced.
>
> **⚠ HEADLINE CHANGE: the census's projected ceiling of ~75 % does not survive.** On the census's
> own denominator and method it becomes **39.5 %–61.8 %**. On a calificación-layer measurement it is
> **33.0 %**. Both methods agree in direction. Details and reconciliation below.

## 0 — The four open items, closed

| Census §5 open item | Status |
|---|---|
| 1. Verify `US` against the PGOU text | ✅ **RESOLVED** — §1. `US` delegates, *with* a directly-applicable interim regime |
| 2. Source the *Normas Urbanísticas*, record authority status | ✅ **DONE** — see [`../ENVELOPE.md`](../ENVELOPE.md) §1 |
| 3. Re-measure by true polygon area | ✅ **DONE** — §3, and it reveals a delegation layer the sectores layer cannot see |
| 4. Explain the 19.3 % null `categoria` | ✅ **RESOLVED** — §2. Not an unknown: it is **100 % derived-plan ámbitos** |

---

## 1 — `US` (Urbano Especial, 22.25 % of urban land): the census's instinct was RIGHT

The census flagged this as the number to distrust — *"an 'especial' regime plausibly delegates, and
if it does the ceiling drops from ~75 % to ~53 %."* The PGOU settles it, and the answer is a third
thing neither "direct" nor "delegated" captures.

**Art. 5.14.1** ties `US` to calificación `RL` in the plan's own words:

> «Constituyen espacios lineales en **suelo urbano especial** de caminos de huerta con edificación
> residencial y de otros usos relativamente densa…»

**Art. 5.14.2 «Ordenación» — it DELEGATES:**

> «La ordenación de estos espacios se llevará a cabo a través de **Planes Especiales de Adecuación
> Urbanística**, que incorporarán la propuesta de delimitación del ámbito a ordenar.»

**Art. 5.14.3 — but the PGOU supplies an INTERIM regime that applies until such a plan exists.**
Its heading is explicit:

> «Condiciones de edificación y usos **antes de la aprobación de Planes Especiales**»

and it states real, directly-applicable scalars: índice **0,25 m²/m²** capped at 300 m² built;
altura **2 plantas (7 m)**; retranqueos 5 m front, 5 m rear, 7,5 m lateral; parcela mínima 1 tahúlla
with 30 m of frontage; plus a cesión leaving the boundary 7 m from the camino axis.

### ⇒ `US` is CONDITIONALLY DIRECT, and the FAR ceiling is stable across the transition

The **0,25 m²/m² index is the same under both regimes** — Art. 5.14.2(a) sets the Plan Especial's
own ceiling at «0,25 m2/m2», and a second article confirms it for US land absorbed into a wider PE:
«Si el Plan Especial incorpora espacios de suelo urbano especial el índice correspondiente a éstos
será de **0'25 m2/m2**.» What the Plan Especial changes is the detailed ordering — viario widths,
retranqueos, dotaciones — not the buildable index.

So `US` must not be counted as unconditionally direct (the census was right to distrust it), but
neither is it lost: it is packed here as an interim regime with the conditionality declared, and
PRYZM cannot check whether a PE has been approved for a given ámbito.

---

## 2 — The 19.3 % null `categoria` is NOT an unknown. It is a delegation marker.

The census correctly refused to score it zero. Characterised against the same payload (sector
prefix of every `clase_suelo = Urbano` feature whose `categoria` is null):

| Prefix | M m² | share of the null block | instrument |
|---|---:|---:|---|
| `PU` | 2.512 | 23.3 % | Plan Especial de Regularización (Art. 5.26.2) |
| `PM` | 1.358 | 12.6 % | PERI adecuación residencial rural, densidad media |
| `UE` | 1.232 | 11.4 % | Unidad de Actuación (Art. 5.25.1) |
| `PI` | 1.210 | 11.2 % | PE Rehabilitación conjuntos económico-industriales |
| `UD` | 1.167 | 10.8 % | Estudio de Detalle (Art. 5.25.2) |
| `PC` `PH` `PE` `PERI` `PT` `PX` `PB` `PA` `PR` `PEI` `PP` `PEE` | 3.311 | 30.7 % | Planes Especiales, Art. 5.26.2 |

**Every prefix in the block is a Plan Especial, a Unidad de Actuación or an Estudio de Detalle.
There is no residue.** Murcia leaves `categoria` null precisely for the ámbitos whose category the
*derived instrument* fixes rather than the general plan — so the null is a third delegation marker,
alongside the sector code and the calificación.

**⇒ The census's 24.8 % delegated becomes 38.2 %**, on its own denominator and its own method, with
no re-measurement — purely by reclassifying a block it had already measured and honestly flagged.

---

## 3 — The reconciled picture

### 3a — On the census's method (published `superficie`, sectores layer, *Urbano* = 56.0 M m²)

| | M m² | share of Urbano |
|---|---:|---:|
| **Unconditionally DIRECT** (`U` 36.86 % + `UR` 2.66 %) | 22.12 | **39.5 %** |
| **CONDITIONALLY direct** (`US`, Arts. 5.14.2 / 5.14.3) | 12.45 | **22.25 %** |
| **DELEGATED** (`UA` 13.65 % + `UM` 4.51 % + `UH` 0.59 % + the null block 19.27 %) | 21.41 | **38.2 %** |

### → **Ceiling on the census's own method: 39.5 % – 61.8 %.** Not ~75 %.

### 3b — On true polygon area, calificación layer (census open item #3)

Measured over all **23 066** in-force `Murcia:pgou_alineaciones` polygons, shoelace areas in the
layer's native **EPSG:25830**, joined to `pgou_sectores` for `clase_suelo` (join rate 99.74 %).
Denominator = **private buildable calificaciones, 75.145 M m²** — a *different and wider*
denominator than the census's *Urbano* class, because it also counts buildable calificaciones
sitting inside *Urbanizable*.

| | M m² | share |
|---|---:|---:|
| **PGOU-DIRECT** | 24.800 | **33.0 %** |
| **DELEGATED** | 50.345 | **67.0 %** |

### ⚠ 3c — Why this is LOWER again: a delegation layer the sectores layer cannot see

**41.4 pp of the delegation is published on the `calificacion` attribute, not on the sector code.**
A census over `pgou_sectores` is structurally blind to it:

| Delegation published on… | Article | share of buildable land |
|---|---|---:|
| the **calificación** — *genérica* `RX RJ RS UC IP TC GP AE` | Arts. 5.25.3.3 / 5.26.3.3 / 6.2.2.4 / 6.5.1 | **30.2 %** |
| the **calificación** — *remitted* `RR TR IR GR` | Arts. 5.24.5 / 5.24.6 | **11.2 %** |
| the **clase de suelo** — urbanizable → Plan Parcial | Art. 6.2.2.3 | 20.5 % |
| the **sector code** — `UA UH UM UE UD TA TM P*` | Arts. 5.24 / 5.25 / 5.26 / 6.6 | 5.1 % |

Arts. 5.25.3.3 and 5.26.3.3, verbatim and identical:

> «…el alcance de los códigos de calificación zonal de los suelos edificables dentro del ámbito,
> reflejados en los planos, **se reduce a las condiciones de uso y tipología de las edificaciones,
> pero no a los parámetros definitorios de la altura o edificabilidad**. En ocasiones se recurre en
> los planos a indicaciones de calificación genérica (RX, RJ, RS, UC, IP, TC, GP, AE)…»

> **This is GENOME TEST 01 §4.2 again, in a THIRD shape.** Madrid publishes derived plans as a
> LAYER; València as a FIELD VALUE; Murcia publishes them on the **cadastral address string**
> (already handled by `detectDerivedPlanMarkers`) **and** on the **calificación attribute**. A
> layer-shaped or sector-shaped discovery engine cannot see an attribute-shaped concept — the
> finding already written into `esMurciaEnvelope.ts`, now confirmed with a number attached.

### 3d — The honest summary

| Method | denominator | direct | delegated |
|---|---|---:|---:|
| Census, sector-code test | Urbano 56.0 M m² | ~75 % | 24.8 % |
| Census method + `US` + null block resolved | Urbano 56.0 M m² | **39.5–61.8 %** | **38.2 %** |
| True polygon area, calificación-aware | buildable 75.1 M m² | **33.0 %** | **67.0 %** |

**The two corrected rows do not contradict each other** — they use different denominators and the
lower one applies a delegation test the higher one cannot express. Both refute ~75 %.

Against Barcelona (62.8 % delegated, ceiling ~70 %): Murcia is **comparable, not clearly better**.
The census's conclusion that *"Murcia has a better starting position than the flagship"* rested on
the 24.8 %, and does not survive. What *does* survive is that Murcia's absolute buildable area is
larger, and that **33 % of 75.1 M m² (24.8 M m²) is still a real, transcribable prize** — the
transcription in `esMurciaPgou2012.ts` covers exactly that slice.

---

## 4 — Method notes (so this is challengeable, not believed)

- Endpoint `https://geoserver.murcia.es/geoserver/wfs` — ⚠ **https**; the http host 301-redirects
  and `curl` without `-L` returns the redirect page, not GeoJSON.
- `DescribeFeatureType` on `pgou_alineaciones` confirms **no numeric buildable attribute** exists:
  `wkb_geometry, id, calificacion, descripcion, uso_global, sector, actuacion, url, url2,
  f_inicial, f_fin, text`. Checked against the SCHEMA, not against one response.
- §3b areas are measured geometry; §3a shares are the census's published `superficie` attribute.
  **Do not present the two as like-for-like** — the census's caveat 1 applies to this file too.
- ⚠ **A first pass of §3b returned 52.8 % direct and was WRONG.** It read the `Z*` and `UD` sector
  prefixes as ordinary urban. The sectores layer says otherwise: `ZU-SB-BM5` → *Urbanizable
  Sectorizado*; `UD-146-ZB-CH7` → *Urbanizable Sectorizado*; `ZG-SG-VJ2` → *Urbanizable sin
  Sectorizar*. **Join on the publisher's own attribute, never on a code whose meaning you inferred.**
- These are live services. Every figure here is a 2026-08-01 snapshot; re-run before quoting
  externally.

## 5 — What would still change the answer

- A per-ámbito check of whether a Plan Especial has been approved over the `US`/`RL` land — that is
  what collapses the 39.5 %–61.8 % range to a point.
- Nothing else in PRYZM. The delegated share is the plan's design, not our coverage.

*Cross-refs: [`./MURCIA-LAND-CLASS-AND-DERIVED-PLAN-SPLIT.md`](./MURCIA-LAND-CLASS-AND-DERIVED-PLAN-SPLIT.md),
[`../ENVELOPE.md`](../ENVELOPE.md), [`../LEGISLATION-RATE.md`](../LEGISLATION-RATE.md),
[`../RATE.md`](../RATE.md), C63, C58 §1.11, L-656.*
