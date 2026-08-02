# COMUNIDAD DE MADRID — DATA INVENTORY

**Status**: ⭐ **REFERENCE HANDOFF**, founder-authored 2026-08-02. Supersedes the scattered findings of
six prior research passes. **Score: 1 of 9** against the
[REGIONAL-INTAKE-LIST](../../../standards/REGIONAL-INTAKE-LIST.md).
**Related**: [ADR-0293 per-dimension tiering](../../../../02-decisions/adrs/ADR-0293-envelope-tier-is-per-dimension-and-keyed-on-error-direction.md) ·
[ES-LEGAL-COUNSEL-QUESTIONS](../ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02.md) ·
[ENVELOPE-REACHABILITY-TRACKER](../../../../03-execution/plans/ENVELOPE-REACHABILITY-TRACKER.md)

> ⛔ **EVERY ROW IS MARKED `MEASURED` / `READ` / `UNKNOWN`. DO NOT TREAT `READ` AS `MEASURED`.**
> Six research passes converged, **produced no measurement**, and **the last two upgraded the score
> without evidence.** That is why the marking is mandatory here and not merely encouraged.

---

## 0 · ⛔ CORRECTION — the join key is **INE**, not DGC

**A prior Madrid spec said the opposite** — *"do not use INE… use DGC municipality identifiers"* — and
**that is inverted.** ⭐ **Every Spanish planning service in this corpus keys on INE**; SIU's field is
literally **`ProvINE`**. **Catastro's DGC code is the odd one out.**

**They collide, and the collisions are not exotic:**

| Code | DGC means | INE means |
|---|---|---|
| `46250` | **Turís** | **València** |
| `08196` | **Sant Andreu de Llavaneres** | **Sant Andreu de la Barca** |

⚠ **Three collisions found this month — and `08196` sits INSIDE A SINGLE AMB EXTENT, where the guards
passed cleanly.** A guard that passes on a known collision is not a guard.

> ⭐ **THE RULE:** **DGC only where Catastro requires it. INE everywhere else. An EXPLICIT MAPPING at
> the boundary, that FAILS LOUDLY.** A bare five-digit string must never cross that boundary.

⛔ **AND A THIRD VOCABULARY — MEASURED 2026-08-02. "INE not DGC" IS RIGHT THAT DGC IS WRONG AND
STILL NOT SUFFICIENT.** Madrid's own `CD_MUNICIPIO` is a **3-DIGIT ZERO-PADDED** code — the INE
municipality-within-province part **with the `28` province prefix STRIPPED**:

| query | features | resolves to |
|---|---:|---|
| `CD_MUNICIPIO='079'` | **22,181** | **MADRID** |
| `CD_MUNICIPIO='28079'` (INE-5) | **0** | — |
| `CD_MUNICIPIO='28900'` (DGC-5) | **0** | — |
| `CD_MUNICIPIO='048'` | 80 | CORPA |

Cross-checked against `Callejero:SIGI_V_MUNICIPIOS` (179 rows). ⚠ **A bare 5-digit string returns a
CLEAN HTTP 200 WITH ZERO FEATURES** — the exact silent-failure shape. ⭐ **`code-space truncation` is
now the SIXTH negative-proof condition**, after axis order, CRS family, alternate parameterisation,
bbox-vs-attribute, and path shape.

*Verified 2026-08-02: the inverted guidance never reached the repository — it existed only in an agent
prompt. It is recorded here so it cannot be re-derived.*

---

## 1 · Parcel geometry — ✅ **MEASURED**, solved

**Catastro INSPIRE**, national, uniform. `referencia_catastral` + polygon, **ETRS89/UTM**.

⚠ **ATOM GML is ETRS89/UTM across THREE ZONES.** Read as lat/lon, **6 of 6 Barcelona parcels scored
non-buildable behind a clean HTTP 200** — the failure was silent and the transport was healthy.

## 2 · Ordinance polygons — ✅ **MEASURED**

**`sitcm:VPLA_V_ORDENANZA`** at `idem.comunidad.madrid/geoserver3/wfs` — **93,839 features.**
Recovered from the viewer's `Config.js` **after 9 candidate hosts returned 404/DNS.**

**Attribute coverage (n=4,000, 17 municipalities)** — ⛔ **SUPERSEDED 2026-08-02 BY A FULL CENSUS. See §MEASURED below. These figures were a natural-order HEAD taken because paging was believed impossible; PAGING WORKS, so they are not a refined estimate of the truth — they are REPLACED BY IT.**

**The superseded head-sample:**

| Field | Non-null |
|---|---|
| `NM_ALTURA` | **70.2 %** |
| `NM_PLANTAS` | **72.9 %** |
| **both** | **66.9 %** |
| `NM_APRV_BC` | ~~0.0 % everywhere~~ — ⚠ **FALSE. 706 rows region-wide** (Arganda del Rey 19.3 %, Torrejón de Ardoz 7.5 %, Parla 3.0 %). Marginal, but not zero. |

⛔ **VARIANCE IS THE FINDING — NEVER REPORT A REGIONAL MEAN.**
**Madrid capital 3.6 %** against **Alcalá de Henares 69.4 %.** ⭐ **Target the periphery.**

⛔ **~~Paging unsupported~~ — THIS WAS FALSE, AND IT COST SIX RESEARCH PASSES.** The error reads,
in full: *"Cannot do natural order without a primary key, please add it **OR SPECIFY A MANUAL SORT
OVER EXISTING ATTRIBUTES**"*. ⭐ **Six passes read only the first half of that sentence.**
`sortBy=CDID` makes paging work — proven by a full walk with pages verified DISJOINT and COMPLETE
against an independent `resultType=hits` total: **0 duplicates, 0 failures, 7/7 layers reconciled.**

> ⭐ **STANDING RULE: READ THE WHOLE ERROR STRING BEFORE CONCLUDING A CAPABILITY IS ABSENT.**
> A truncated read of an error message is the same defect class as a truncated read of a dataset.

## 3 · Sectors and modifications — ⚠ **READ, NEVER QUERIED**

`spacm_ambitos` (general planning) · `spacm_ambitosmodif` (development planning and modifications) ·
`spacm_ordenanzas` · `spacm_ordenanzasref2023` (*refundido*).

**Catalogue entries read. NO schema, NO coverage, NO feature count measured.**

## 4 · Everything else — ❌ **UNKNOWN**

⛔ **~~Footprint~~ — CORRECTED 2026-08-02: THE FOOTPRINT FIELDS EXIST.** `NM_OCP_MX` (occupation) ·
`NM_RTR_FRNT` / `NM_RTR_LATL` / `NM_RTR_POST` (three setbacks) · **`NM_FDO_MX_ED` (buildable depth)** ·
`NM_FRTE_MIN` · `NM_OCP_PB`. This item was `Data acquisition` and is **CLOSED**; what remains is
COVERAGE, measured below.

Still UNKNOWN: **bulk denominator normalisation** · **height measurement reference** (rasant vs
façade) · **article provenance** · **validity lineage**.

**Bulk has one upgrade:** **Ley 9/2001** (*Suelo de la Comunidad de Madrid*) **REQUIRES** sectors to
define *uso* and *coeficiente de edificabilidad/aprovechamiento*. ⚠ **Existence is legally mandated;
normalisation and denominator are UNKNOWN.** *Mandated ≠ served* — the Galicia lesson, again.

**Constraints — ⛔ ENTIRELY ABSENT.** Barajas obstacle limitation surfaces (**AESA**), heritage,
flood, environmental, infrastructure. ⭐ **They only reduce, so their absence can ONLY OVER-STATE.**

---

## ⛔ THE BLOCKER THAT OUTRANKS ALL DATA WORK

**Both SIT layers disclaim legal force.** The *refundido* is *"a technical work without legal
validity."* The SIT viewer *"does not replace the approved planning instruments and has no binding
legal value."* **Confirmed independently across four separate research passes.**

⇒ ⭐ **SIT IS A ROUTING TABLE, NOT A CITABLE SOURCE.** Every parameter must resolve to the **approved
municipal instrument** — **179 PGOU families**, no regional corpus, **no `num_pgm.titol.capitol`
equivalent.**

⭐ **AND IT IS NOT MADRID-SPECIFIC:**

| Region | Its own disclaimer |
|---|---|
| **Madrid** | *"no binding legal value"* |
| **Castilla y León** (SIUCyL) | *«sin validez jurídica»* |
| **Balears** | `OBS` — rows say **not in force** |
| **Aragón** | `fiab_geom` reads *"Aprobada"* on **21.8 %** |

> ⛔ **FOUR OF SPAIN'S RICHEST REGIONAL DATASETS DISCLAIM THEIR OWN AUTHORITY. ONE COUNSEL QUESTION,
> NOT FOUR.**

---

## Score — **1 of 9**

| | Item |
|---|---|
| ✅ **Solved** | **1** parcel geometry |
| ⚠ **Partial** | **2** instrument selector · **5** height · **6** bulk · **9** validity |
| ❌ **Missing** | **3** ordinance text · **4** footprint · **7** constraints · **8** deviation list |

⭐ **NO DEVIATION LIST MEANS THERE IS NOTHING FOR A REGIONAL SIGNATURE TO BE SCOPED AGAINST.** That is
**precisely** what makes Catalunya *one signature over 26 municipalities* and Madrid **not**.

---

## The two actions, in order

**1 · COUNSEL.** *Does «sin validez jurídica» disqualify these layers as a citation source, or are
they a routing layer to instruments that do bind?* **One answer covers Madrid, CyL, Balears and
Aragón.** ⭐ **Now reframed on liability — see [ADR-0293] and counsel Q4.**

**2 · ONE MEASUREMENT PASS.** Full schema on **all four `spacm_*` datasets** — every field, **non-null
PER MUNICIPALITY, never a mean** — plus ⭐ **the DEVELOPMENT OVERRIDE RATIO**: parcels controlled by
*Plan Parcial / Especial / modificación* over all urban parcels. **Madrid's equivalent of Barcelona's
`PD*` at 59.53 %. Unmeasured, and probably the largest number in the region.**

> ⛔ **DO NOT COMMISSION MORE MADRID RESEARCH.** Six passes have converged, produced no measurement,
> and the last two **upgraded the score without evidence**. **Everything remaining needs ONE QUERY and
> ONE LEGAL OPINION.**

---

## Sequencing

⭐ **Catalunya is three hardcodes and an onboarding runner away from 26 municipalities. Madrid is a
LARGER PROJECT than Catalunya, and nothing in this inventory changes that.**

---

# MEASURED 2026-08-02 - FULL CENSUS. `P` is now `proven`; `R` is still `blocked`.

All figures from a seeded, re-runnable probe in `tools/madrid-spacm-probe/`. **No sampling** - paging
works, so these are **COUNT/COUNT censuses**, not draws.

## The four datasets - they were queryable all along

| catalogue alias | typeName | features | fields |
|---|---|---:|---:|
| `spacm_ambitos` | `sitcm:VPLA_V_AMBITO` | 5,937 | 94 |
| **`spacm_ambitosmodif`** | `sitcm:VPLA_V_AMBITO_MODIF` | 3,724 | 94 |
| `spacm_ordenanzas` | `sitcm:VPLA_V_ORDENANZA` | 93,839 | 59 |
| `spacm_ordenanzasref2023` | `sitcm:VPLA_V_ORDENANZA_REF_23` | 70,344 | 55 |

**No count lands on a round cap.** Ten further layers discovered, including `VPLA_V_CLASIFICACION`
(13,920 - the soil-class denominator), `VPLA_V_ORDENANZA_MODIF` (70,748), and **`REF_25` - a 2025
refundido NEWER than the catalogued 2023**, but with only 4,017 ordenanza features, so it is partial.

## Coverage - full census, per municipality, never a mean

Valid := non-null **AND > 0**; zero treated as absence, **justified** because `NM_RTR_FRNT` carries
**7,225 explicit zeros**.

| | ALTURA | PLANTAS | OCP_MX | FDO_MX | any footprint |
|---|---:|---:|---:|---:|---:|
| **MADRID capital** (n=22,181) | **8.9 %** | 17.9 % | 20.1 % | 12.9 % | 38.8 % |
| Las Rozas | 83.0 % | 71.1 % | 80.8 % | 6.9 % | 95.3 % |
| Alcala de Henares | 75.7 % | 39.2 % | **93.6 %** | 6.4 % | 93.8 % |
| Colmenar Viejo | **97.4 %** | 99.5 % | 74.0 % | 9.1 % | 82.2 % |

`NM_ALTURA` across 179 municipalities: **min 0.0 - p25 53.0 - median 79.4 - p90 100.0 - max 100.0.**
**10 municipalities at 0 %, 21 at 100 %.**

> **"TARGET THE PERIPHERY" IS CONFIRMED AND IS STRONGER THAN STATED. Madrid capital is 8.9 %; the
> MEDIAN MUNICIPALITY IS 79.4 %.** (The earlier 3.6 % was a head-sample artefact.)

The feature-weighted regional figure is **55.70 % and describes NO municipality** - recorded only to
show what a mean conceals.

**Internal contradiction, populated != present:** on the 45,179 rows carrying both height and storeys,
**97.29 %** give a plausible 2.2-5.0 m/storey and **1,224 rows CONTRADICT**. Worst named:
**MAJADAHONDA, "VIVIENDA UNIFAMILIAR AISLADA", `NM_ALTURA=85` with `NM_PLANTAS=2`** - **42.5 m per
storey on a detached house.** That corrupt value sat inside the "70.2 % populated" previously quoted
as coverage.

## The development override ratio - MEASURED

> ### **37.11 % by area, region-wide**
> 499.1 km2 of development ambitos on urban/urbanizable soil / 1,345.1 km2 classified urban+urbanizable.

**Madrid capital: 48.43 %.** Per-municipality: **median 20.7 - p75 39.9 - p90 61.7 - max 91.0**
(Torrejon de Velasco); **47 municipalities at exactly 0 % - `proven`, the run succeeded and the answer
was zero.**

Lower-bound cross-check on a different basis: **18.94 %** of urban-classed ordinance polygons
(17,535 / 92,580) sit inside a named development ambito.

**Caveat stated, not buried:** numerator and denominator come from **DIFFERENT LAYERS**, so this is
**not a strict subset relation**. The internal-consistency control passes - **no municipality exceeds
100 %** (max 91.0), which a mismatched pairing would have broken.

`DS_FIG_DES` domain, exact: Plan Parcial **1,504** (356.0 km2) - Estudio Detalle 649 - Plan Especial
287 - PERI 235 - Programa Actuacion Urbanistica 106 - **null 3,137**.

**Against Barcelona's `PD*` 59.53 %, Madrid is 37.11 % - LOWER, but not the whole story:**
`VPLA_V_ORDENANZA_MODIF` carries **70,748 rows, 75.39 % the size of the base layer**, and
`AMBITO_MODIF` keys are **54.83 % NOT present in `AMBITO`** - a substantially DIFFERENT population,
not a re-statement.

## `R` remains `blocked` - and `AMBITO_MODIF` does NOT close it

It answers *which* instrument (`DS_NOMB_AMB` 100 %), *when* approved (`FC_AC` 99.97 %) and its
general-plan lineage (99.97 %). **It fails on the two that decide an envelope:**

- **`DS_FIG_DES` - the instrument CLASS - is 60.58 %.** For **39 % of ambitos the corpus cannot say
  whether a Plan Parcial or an Estudio de Detalle governs.**
- **`DS_LEY` - the statute - is 3.20 %** on `AMBITO_MODIF` (89.14 % on `AMBITO`).
- **NOT UNIQUE: 30.66 % of `(municipality, name)` keys carry MORE THAN ONE ROW.** **A selector
  returning two instruments has not selected.**

**Bulk (Ley 9/2001) - mandated != served, now MEASURED:** `NM_C_ED` **33.27 % / 34.37 %**,
`NM_APRO_TIPO` 26.70 % / 32.65 %, `DS_US_PRED` **0.00 % on both**. And where the coefficient exists it
is **not internally consistent**: `NM_C_ED x NM_S_TOT ~= NM_S_MAX_ED` (+/-10 %) holds on only
**73.07 %** (AMBITO) and **61.38 %** (AMBITO_MODIF) of testable rows.
> **The Ley 9/2001 "bulk upgrade" recorded in this inventory DOES NOT SURVIVE CONTACT WITH THE DATA.**

**The 179-corpus problem, measured: 235 distinct (municipality, planeamiento, doc-type) corpora, and
34 municipalities carry MORE THAN ONE.** Doc types: PLAN GENERAL 62.65 %, NORMAS SUBSIDIARIAS 33.44 %.
Statutes: **16 distinct `DS_LEY` combinations, top one only 29.28 %, 11.82 % null.**

## Status

| | |
|---|---|
| **R (instrument selector)** | `blocked` - **Data acquisition.** Exit: `DS_FIG_DES` >= ~95 % **and** a unique `(muni, name)` key, or an accepted geometric point-in-ambito selector replacing the name join. |
| **R (citability)** | `blocked` - **Legal, and it OUTRANKS.** Both SIT layers disclaim legal force. Nothing here is quoted as citable. |
| **P (parameters)** | **`proven`** - schema complete, coverage measured per municipality on the FULL CENSUS. **Rich in the periphery, thin in the capital.** |
| **Parcel geometry** | unchanged - MEASURED, Catastro |

## Still UNKNOWN, and why

- **Parcel-weighted override ratio** - **this corpus contains NO PARCELS.** Needs a Catastro
  DGC <-> 3-digit-code join across an identifier boundary.
- **Whether 37.11 % is a strict subset relation** - different layers; only a geometric intersection settles it.
- **Height measurement reference** (rasant vs facade), **bulk denominator normalisation**,
  **constraints** (AESA / heritage / flood) - none are in these four datasets.
- **Whether `REF_25` supersedes `REF_23`** - REF_25 exists with only 4,017 ordenanza features;
  publisher intent unread.
