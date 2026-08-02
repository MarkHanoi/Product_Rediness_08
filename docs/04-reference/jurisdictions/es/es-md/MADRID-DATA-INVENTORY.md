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

**Attribute coverage (n=4,000, 17 municipalities):**

| Field | Non-null |
|---|---|
| `NM_ALTURA` | **70.2 %** |
| `NM_PLANTAS` | **72.9 %** |
| **both** | **66.9 %** |
| `NM_APRV_BC` | ⛔ **0.0 % EVERYWHERE** |

⛔ **VARIANCE IS THE FINDING — NEVER REPORT A REGIONAL MEAN.**
**Madrid capital 3.6 %** against **Alcalá de Henares 69.4 %.** ⭐ **Target the periphery.**

⚠ **Paging unsupported** (*"Cannot do natural order without a primary key"*) — this is the
**natural-order HEAD, not a random draw**. ⭐ **Therefore INDICATIVE, not MEASURED**, and it must not
be re-quoted as a measurement.

## 3 · Sectors and modifications — ⚠ **READ, NEVER QUERIED**

`spacm_ambitos` (general planning) · `spacm_ambitosmodif` (development planning and modifications) ·
`spacm_ordenanzas` · `spacm_ordenanzasref2023` (*refundido*).

**Catalogue entries read. NO schema, NO coverage, NO feature count measured.**

## 4 · Everything else — ❌ **UNKNOWN**

**Footprint** (occupation, depth, alignment, setbacks) · **bulk denominator** · **height measurement
reference** · **article provenance** · **validity lineage**.

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
