# THE REGIONAL INTAKE LIST — the nine items every region needs

**Status**: ⭐ **NORMATIVE**, founder-authored 2026-08-02. **Owner**: the founder.
**Related**: [C64 ENVELOPE COMPILER](../../02-decisions/contracts/C64-ENVELOPE-COMPILER.md) ·
[ENVELOPE-REACHABILITY-TRACKER](../../03-execution/plans/ENVELOPE-REACHABILITY-TRACKER.md) ·
[BLOCKER-CLASSIFICATION-STANDARD](./BLOCKER-CLASSIFICATION-STANDARD.md) ·
[ES-REGIONAL-PLANNING-DATA-STANDARDS](../jurisdictions/es/ES-REGIONAL-PLANNING-DATA-STANDARDS.md)

> ⛔ **EVERY REGION NEEDS ALL NINE BEFORE IT CAN PRODUCE A LEGALLY DEFENSIBLE ENVELOPE.**
> This is the checklist a CCAA is scored against — and the thing Phase 5 actually measures.

**Standing target this serves:** *maximum envelopes possible in Spain, honest determinations
everywhere else. Unit: the autonomous community. Metric: municipalities where PRYZM can generate a
legally defensible envelope today.*

---

## 1 · Parcel geometry

**What:** the boundary you build inside.
**Source:** **Catastro INSPIRE — national, uniform. ALREADY SOLVED.**

⚠ **DGC code ≠ INE code and they COLLIDE.** DGC `46250` = **Turís**; INE `46250` = **València**.
**Three collisions found in one week.** Any municipality lookup must state which code it keys on.

⚠ *Exception:* **País Vasco and Navarra run foral cadastres** — a separate adapter, not a variation.

## 2 · Instrument selector

**What:** which plan governs this parcel, and **whether it is the general plan or a delegated one**.
**Catalunya:** `CLAU_URB` + the `PLAN` field (**`PD*` = derived plan**).

⭐ **Why it is FIRST:** if a *pla parcial* governs and you do not hold it, **you refuse — and no other
data matters.** This is **8–60 % of land** depending on the city
(Sant Climent **8.29 %** · Santa Coloma **32.23 %** · Barcelona **59.53 %**).

## 3 · Ordinance text

**What:** the articles themselves, **machine-readable, with a citation path per zone**.
**Catalunya:** PGM NNUU in repo.

⚠ **Barcelona's `NORMATIV` is the bare string `"Barcelona"` — no citation.** The other 26 publish
`num_pgm.titol_X.capitol_Y`. **The reference city is the WORST-cited of the 27.**

**Test:** ⭐ *can you name the article for every published number?*

## 4 · Footprint rules

Buildable **depth** · **alignment/setbacks** · **occupation**.
**Catalunya:** **Art. 242.2** depth from the block ring; occupation and setbacks per *clau*.
**Input needed:** **the block ring — dissolve at 96.2 %.**

## 5 · Height rule **and its inputs** — ⭐ WHERE REGIONS DIFFER MOST

| Route | Coverage (measured) | Input required |
|---|---|---|
| **OV** (*ordenació volumètrica*) | **38–58 %** | ⭐ **storeys→metres module** |
| **Ladder** (Arts. 320/327/328) | **3–6 %** | **street width** (*amplada de vial*) |

**Both missing outside Barcelona. ⭐ OV IS ~10× THE LEVER** — measured at Sant Climent 38.08 % /
5.87 % and Santa Coloma 58.33 % / 3.10 %.

⛔ **MEASURED BUILDING HEIGHTS DO NOT SUBSTITUTE. LiDAR tells you what EXISTS, not what is
PERMITTED.** The 87.2 % heights bake is context and terrain — it is **not** an ordinance input.

## 6 · Bulk

*Edificabilidad* / FAR / density — **and which of height, depth or bulk BINDS FIRST.**

⚠ **Andalucía's mandated schema has `EDIF_*` + `DENS` and NO `altura`** — which is why it **cannot
produce an envelope even when its corpus fills.** A schema can be complete and still not close.

## 7 · Constraint layers — ❌ **MISSING EVERYWHERE**

**Heritage · airport · flood · infrastructure · environmental.**

⛔ **THEY ONLY REDUCE.** Absent, **every published envelope is an upper bound with missing ceilings**
— *the exact defect Madrid was withheld for*, and the L-616 class. **Unmodelled in all five cities**,
including the one that is published.

## 8 · Deviation list

**What:** which municipalities **rewrite** the regional articles.
**Catalunya:** the **AMB compendium footnotes** — Arts. 320/327/328 rewritten by **Badalona and
Barcelona ONLY, 2 of 27.** The **base ladder governs the other 25.**

⚠ **Consolidated only to 31-12-2009**; supersession **`NOT_VERIFIED`**; the compendium is
**non-exhaustive** (*"NO HI FIGUREN TOTES LES MODIFICACIONS"*) and **non-official**.

⭐ **THIS IS WHAT MAKES ONE SIGNATURE COVER A REGION.**

## 9 · Validity field

**What:** **is this data in force?**

- **Balears:** `OBS` — ⚠ **Eivissa's rows self-declare NOT IN FORCE.**
- **Aragón:** `fiab_geom` **100 % present, only 21.8 % "Aprobada"** — ⭐ **presence as evidence
  AGAINST currency.**
- **Murcia:** `f_fin`; superseded editions published as **separate layers**.

⛔ **ABSENCE OF A FLAG IS NOT EVIDENCE OF CURRENCY. One publisher of seventeen exposes one.**

---

## Catalunya, scored

| Item | 1 parcel | 2 selector | 3 ordinance | 4 footprint | 5 height | 6 bulk | 7 constraints | 8 deviation | 9 validity |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| | ✅ | ✅ | ✅¹ | ✅ | ❌ | ✅ | ❌ | ✅ | ⚠ |

¹ *except Barcelona, whose `NORMATIV` carries no citation path.*

⭐ **SEVEN OF NINE, WITH THE HEIGHT MODULE AS THE BLOCKING GAP.**
Missing: **5 (both routes)** · **7 (all constraints)** · **9 (unverified)**.

## Madrid — the same nine, from scratch

`sitcm:VPLA_V_ORDENANZA` (93,839 features) gives **2**, **5 partially** (altura **70.2 %**, plantas
**72.9 %**) and **probably 6**. Still to find: **3, 4, 8, 9** — and **7 does not exist anywhere yet.**

> ⭐ **THAT IS WHAT PHASE 5 MEASURES: how long nine items take in a region where NONE are done. That
> number prices every remaining region in Spain** — and **Catalunya's number cannot, because its
> expensive half was paid before the count was tracked.**

⚠ **Report Madrid PER-MUNICIPALITY, never a regional mean** — capital **3.6 %** against Alcalá
**69.4 %**. **Target the periphery.**
