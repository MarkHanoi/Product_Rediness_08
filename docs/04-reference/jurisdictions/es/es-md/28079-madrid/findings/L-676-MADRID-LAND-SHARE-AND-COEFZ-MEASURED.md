# L-676 — Madrid's land-share denominator is MEASURED, and `COEF_Z` is measurably NOT a FAR

> **What this is.** The evidence record for a live probe pass against `sigma.madrid.es` on
> **2026-08-01**. It retires four unknowns that every Madrid document to date carried as
> "UNSOURCED" or "asserted, unqueried", and it closes the `COEF_Z` quarantine question on
> **negative evidence** rather than on a precaution.
>
> Author: Madrid ENVELOPE/LEGISLATION agent, 2026-08-01. Governance: C58 §1.5/§1.9/§1.11, C63 §3
> Axis 2/Axis 4, L-449, L-616, L-656. Honesty rule: *failure and empty are the same VALUE, never
> the same ANSWER.* Raw response data: [`../extracted/nz-land-share-and-coefz-probe.json`](../extracted/nz-land-share-and-coefz-probe.json).

---

## 0 — TL;DR

| # | What was unknown before this pass | What it is now |
|---|---|---|
| 1 | The per-Norma-Zonal **land share** was UNSOURCED. `NEXT.md §2` carried a "~60–62 % ceiling" built from two unsourced fractions (0.65 × 0.96) and warned it must not be presented as measured. | **MEASURED, exhaustively**: 34/34 features, 149,577,170 m² of Norma-Zonal-governed land, per-code area from the server's own `SHAPE.STArea()`. The ~60–62 % ceiling is **DISPROVEN** — see §2. |
| 2 | `COEF_Z`'s meaning was unknown, so it was quarantined **as a precaution**. | Still not positively known — but **measurably NOT a FAR**. 57 distinct values, **100 % integers in 0–8**, **47.56 % of polygons carry a COMPOUND value** (`"0 / 5"`, `"0 / 6 / 7"`). A continuous m²/m² ratio cannot be multi-valued per polygon. The quarantine is now **evidence-backed and permanent** (§3). |
| 3 | `AMB_TX_DENOM` was "REQUESTED by the proxy but never verified to exist" (probe **P1**). | **EXISTS and is populated for all 34 codes** — `"ZONA 3 GRADO 1º - NIVEL a"` etc. **P1 RUN, CLOSED.** |
| 4 | Whether the *alineación oficial* — the legal datum for NZ 4's *fondo edificable* and for every *ancho de calle* height — is published anywhere (probe **P6**). | **PUBLISHED AS GEOMETRY**: `PG_ORDENACION/8 Alineaciones`, **22,584** `Alineación Oficial` polylines + 3,582 `Alineación en Volumetría Específica` + 2,066 `Trazado Indicativo (APR)`. **P6 RUN, CLOSED — and it re-buckets two blockers from Evidence to Engineering.** |

⚠ **Nothing here is a legal reading, and nothing here signs anything.** Every claim below is a
response shape from a named endpoint on a named date. `MADRID_ENVELOPE_VERIFIED` is untouched.

---

## 1 — Method (so it can be re-run and disputed)

All figures come from ArcGIS REST `outStatistics` **server-side** aggregation with
`where=1=1` and **no client-side filtering**, so they are census figures over the published layer,
not samples.

```
GET .../DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0/query
    where=1=1
    groupByFieldsForStatistics=AMB_TX_ETIQ,AMB_TX_DENOM
    outStatistics=[{sum: SHAPE.STArea() → area_m2}, {count: OBJECTID → n}]
```

Cross-check that it is a census, not a page: an unfiltered `returnCountOnly` on the same layer
returns **`{"count":34}`**, and the groupBy returns **34 groups with `n = 1` each**. ⇒ the layer holds
exactly one (multipart) feature per Norma-Zonal code and **the inventory is exhaustive**.

`SHAPE.STArea()` is declared by the layer as `esriFieldTypeDouble`, alias **"Superficie m²"**, in the
layer's own SR (EPSG:25830, metres).

---

## 2 — THE DENOMINATOR, MEASURED

**Total land governed by a Norma Zonal = 149,577,170 m² ≈ 149.58 km².**

⚠⚠ **STATE THE DENOMINATOR EVERY TIME.** This is **not** the municipal area (Madrid ≈ 604 km²) and it
is **not** the L-656 *private buildable land* denominator the C63 ENVELOPE axis requires. It is
*"land the PGOUM-97 zoning layer assigns a Norma Zonal to"*. Land in a derived ámbito (APR/APE/API),
public systems and non-urban land are **outside** it. Converting between the two is an open item
(register row **9**).

### 2.1 — By Norma-Zonal family

| Family | Share of NZ-governed land | Area (m²) | What PRYZM answers today |
|---|---:|---:|---|
| **NZ 3** *Volumetría Específica* | **60.458 %** | 90,431,315 | cited **legally-grounded** `derived-plan` refusal (Art. 8.3.1 — *aprovechamiento agotado*) |
| **NZ 1** *Protección del Patrimonio Histórico* | **11.695 %** | 17,493,655 | **a constructed envelope** — the published footprint clipped to the parcel (`estimated-ruleset`), or a cited refusal |
| NZ 8 | 9.620 % | 14,388,685 | gated refusal (`MADRID_ENVELOPE_VERIFIED = false`) |
| NZ 4 | 8.827 % | 13,203,046 | gated refusal |
| NZ 9 | 6.920 % | 10,351,077 | gated refusal |
| NZ 7 | 1.455 % | 2,176,513 | gated refusal |
| NZ 5 | 1.025 % | 1,532,879 | gated refusal |
| **Σ packed (4·5·7·8·9)** | **27.847 %** | 41,652,201 | all gated |

### 2.2 — The three findings this forces

**(a) NZ 3 is SIXTY PERCENT of Madrid's zoned land, and it is a refusal by law.** `3.1.a` alone is
**44.59 %** (66.69 km²) — the single largest object in the Madrid dossier. Under the ratified
definition of CLOSED this land is *closed*: it carries a cited delegation. Under the C63 ENVELOPE
tier ladder it scores **0.0**. Both are true, and the gap between them is register row **6**.

**(b) The "~60–62 % ceiling" is DISPROVEN.** `NEXT.md §2` and both L-608 findings state a ceiling of
≈60–62 % of Madrid residential parcel clicks "once the parametric NZs are sourced and NZ 1 is
wired", built from 0.65 × 0.96. Measured: the parametric NZs (4/5/7/8/9) govern **27.85 %** of
NZ-governed land and NZ 1 governs **11.70 %** — **39.5 % together**, with the remaining 60.5 %
legally refusing. Even allowing for the different denominator ("residential parcel clicks" vs
"NZ-governed land"), a 60–62 % *envelope* ceiling is not reachable while NZ 3 holds 60 % of the
land — the two fractions cannot both be true unless NZ 3 land is almost entirely non-residential,
which the ordinance contradicts (NZ 3 is the consolidated inner city). **The ceiling was an
estimate stacked on two estimates; it is withdrawn and replaced by §2.1.**

**(c) The founder's "NZ 4 ≈ 30–40 % of Madrid residential" is not supported at this denominator.**
NZ 4 measures **8.83 %** of NZ-governed land. It remains the largest *parametric* single code, so
"read NZ 4 first" survives as advice — but the **coverage** claim attached to it does not, and any
plan costed on "NZ 4 buys 30–40 %" is costed wrong. ⚠ Different denominators; recorded as a
conflict, not a correction of the founder's own basis.

### 2.3 — Zones 2 / 6 / 10 / 11 — the COVERAGE half is closed

The 34-group read is **exhaustive** (`count=34` unfiltered = 34 groups), and no code begins `2`,
`6`, `10` or `11`. The three candidate causes in `SOURCES.md §0.3` are still undetermined **as
nomenclature**, but the *coverage consequence* is now measured: those names govern **0 m²** of the
published layer, so **no parcel can route to them** from `resolveMadridNormaZonal`. Candidate (c)
— *"parcels exist that route nowhere"* — cannot arise from this layer's vocabulary. Severity drops.

---

## 3 — `COEF_Z`: the quarantine is now EVIDENCE, not caution

Census over `PG_CONDICIONES_EDIFICACION/6`: **15,907 polygons**, **57 distinct `COEF_Z` values**.

| Class | Polygons | Share | Examples |
|---|---:|---:|---|
| **coded** (compound / non-numeric) | 7,566 | **47.56 %** | `"0 / 5"` (1,498) · `"0 / 4"` (1,289) · `"0 / 6"` (1,135) · `"0 / 7"` (969) · `"0 / 6 / 7"` (409) · `"0 / 4 / 5 / 7"` |
| **numeric** (single clean value) | 7,138 | 44.87 % | `"4"` (2,709) · `"5"` (2,123) · `"7"` (1,107) · `"6"` (1,106) |
| **absent** (`"-"` / null) | 1,203 | 7.56 % | `"-"` (1,143) · `null` (60) |

### 3.1 — Three measured facts that settle the NEGATIVE

1. **Every observed value is an INTEGER in 0–8.** Not one decimal, not one Spanish comma-decimal, in
   15,907 rows. A genuine *edificabilidad* in m²/m² would be continuous (`1,20`, `2,75`, `3,10`).
2. **47.56 % of polygons carry MULTIPLE values in one field.** A single polygon cannot have three
   simultaneous plot ratios. It can perfectly well enumerate three permitted **storey counts** or
   three catalogue **grados** across portions of the manzana.
3. **The compound values are drawn from the same 0–8 alphabet as the singletons**, with `0` by far
   the most common leading token — consistent with "no building / ground level" in an ordinal
   sequence, and inconsistent with a ratio.

⇒ **`COEF_Z` is not a floor-area ratio.** That is a *negative* closure: it does **not** tell us what
`COEF_Z` **is** (storeys? grados? a catalogue coefficient?), and only the Compendio Cap. 8.1 can.
But it permanently removes the option that made this dangerous.

### 3.2 — The trap, quantified

A naïve `parseFloat` over this field would:

- read **`"0 / 5"` as `0`** on **47.56 %** of polygons — publishing a **zero-buildability** envelope
  where the source says nothing of the kind (the silent-zero defect §CONTEXT-DATA-HONESTY exists to
  stop); **and**
- read **`"8"` as FAR 8.0** on the numeric 44.87 % — a **~8× volume over-statement**. This is
  **L-616 exactly**: the Barcelona massing that ignored the FAR ceiling and over-stated ~5×.

**Current state is SAFE and was verified, not assumed.** `resolveMadridNZ1Ring.ts` populates
`edificabilidad` only from a single clean positive number, and `siteDispatch.ts`
`applyMadridNZ1ExplicitArea` builds its `ZoningRecord` with **`structuredFields: {}`** — the parsed
`edificabilidad` reaches a `console.log` and a caveat string, and **nothing else**. No Madrid code
path binds `COEF_Z` to `farRatio` / `plotRatioFAR`. See register row **2** for the residual risk:
the value is parsed and exposed on the resolver's return type, so the binding is prevented by
call-site convention rather than by the type system.

---

## 4 — `Alineaciones` is published — and it re-buckets two blockers

`PGOUM97/PG_ORDENACION/MapServer/8` — **`esriGeometryPolyline`**, fields `TIPOALIN` +
`ALIN_DESC`, live 2026-08-01 (the service's older *"Service not started"* record is stale; the
whole 17-layer service answered).

| `ALIN_DESC` | Features |
|---|---:|
| **`Alineación Oficial`** | **22,584** |
| `Alineación en Volumetría Específica` | 3,582 |
| `Trazado Indicativo (APR)` | 2,066 |
| `---` (unlabelled) | 873 |

Also live: `PG_ORDENACION/16 Fondo` (polygon, **1** multipart feature, **no attributes beyond
`OBJECTID`**) and `PG_ORDENACION/7 Norma Zonal 1.5`.

**Why this matters twice:**

1. **NZ 4's *fondo edificable*.** `MADRID_NZ4_RULE` ships `alignTo: 'street'`, which the engine
   measures from the **C19-classified cadastral front edge**, with the substitution honestly
   disclosed in the pack. The **legal** datum (Art. 8.4.9.1) is the *alineación oficial* — and it is
   now known to be **published geometry we can fetch**. The blocker moves **A → B**.
2. **The *ancho de calle* height tables.** `madridAnchoDeCalle.ts` already holds the transcribed NZ
   1/4/9 band tables; what it lacks is a width to key them on, and L-537 found no Spanish
   municipality publishing a *declared* width. A width **constructed** by measuring between opposing
   `Alineación Oficial` lines is now possible. ⚠ **It is not an *ample oficial*** — it is a
   measurement between official lines, and must be labelled `measured-alignment`, never `official`
   (Barcelona's `measured-cadastral` precedent, register row **7**).

⚠ **Measured negative in the same pass:** `PG_ORDENACION/4 Ámbitos de Ordenación` is
**polyline with `OBJECTID` only** — so the derived-ámbito (APR/APE/API) land area, which is what
would convert §2's denominator into the L-656 one, **cannot be measured from this service**.
Recorded as `MEASURED-NEGATIVE`, not as absence.

---

## 5 — What this pass did NOT establish (explicit non-confirmations)

- **No number was verified and no gate was flipped.** `MADRID_ENVELOPE_VERIFIED` is still `false`.
- **The Compendio was not opened.** Nothing here is a reading of the primary text.
- **`COEF_Z`'s positive meaning is still unknown**, as is its denominator (manzana vs parcela). Only
  the "it is a FAR" hypothesis is eliminated.
- **The `Alineación Oficial` geometry was not fetched for any parcel** — only its existence,
  attribute schema and feature counts were read.
- **`SHAPE.STArea()` was trusted as published.** No independent re-projection or overlap audit was
  run, so the 34 polygons are assumed non-overlapping. If any overlap, §2's shares shift.
- **The L-656 private-buildable denominator for Madrid remains unmeasured.**
- **Supersession is still unexamined** for every article Madrid cites.
