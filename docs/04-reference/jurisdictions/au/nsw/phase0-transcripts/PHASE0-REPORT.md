# NSW ENVELOPE — PHASE 0 REPORT (M1 · M2 · M3)

> Lane **ENVELOPE-NSW** · measured live **2026-09-03** against
> `https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/` (MapServer 10.91, EPSG:4283)
> and `https://portal.spatial.nsw.gov.au/.../NSW_Land_Parcel_Property_Theme/FeatureServer/8`.
> Answers `NSW-ENVELOPE-BUILD-PROMPT.md` §2. Raw transcripts and the exact scripts that produced
> every number are in this directory (`scripts/`). **Re-run the scripts; do not re-transcribe the
> numbers.**

---

## 0 — The headline, before the tables

The founder's §1.2 non-negotiable reads: *"The layers serve `LEGIS_REF_CLAUSE` and
`LEGIS_REF_VALUE`. A value in our output without them is a bug."*

**Measured, that premise is half wrong, and the wrong half is the citation, not the value.**

| Claim under test | Measured |
|---|---|
| `LEGIS_REF_VALUE` carries the numeric control | ❌ **2.5%** populated (LocalProvisions), **0%** (SEPP). Where non-null it holds the LEP **map-symbol code** (`"N1"`, `"B"`), not a number. |
| The numeric control is machine-readable | ✅ **100.0%** — but in **`LAY_CLASS`** (130,649 / 130,660 DIRECT-layer features). |
| `LEGIS_REF_CLAUSE` carries the citation | ⚠️ **94.9%** on Principal (HOB/FSR/lot size) but **0.0% on 10 of the 12 vertical overlay layers** — the exact layers precedence needs. |

> ⭐ **AMENDED 2026-09-04 — the table above is right and INCOMPLETE, and the missing row changes
> what follows.** A fourth claim was never tested here: **`LAY_NAME` is populated on 996 / 996
> vertical overlay features = 100.0%, across 19 distinct strings state-wide**
> (`layname-census.json`). It carries the **quantity, the direction and the datum** —
> `"Maximum Building Height (m)"` vs `"Minimum Level Australian Height Datum (AHD)"` vs
> `"Minimum Floor Height Restriction Heights shown on map in AHD (m)"`.
>
> **So the two questions this report conflated are separable, and only one of them is unanswered.**
> NSW does not serve the CITATION for its overlays. It DOES serve the VALUE SEMANTICS for every one
> of them. The fifty-metre units error of build prompt §6 is therefore **fully solvable from served
> attributes on a finite closed vocabulary**; only **PRECEDENCE** needs the clause registry.
> Treating "uncited" as "unreadable" gave away a 100%-populated field — and cost the §M3.4 error
> corrected below.

**Consequence for §5.** The precedence engine's designed input — *"resolve each control's
`LEGIS_REF_CLAUSE`"* — **does not exist in the data for the overlay family.** The base control is
well-cited; the overrides, uplifts and caps that compete with it are not cited at all. Precedence
cannot be resolved from feature attributes. It requires a **static, hand-extracted, signed
per-LGA clause registry** keyed on `EPI_NAME` + layer, which is the §8 "one-time clause
extraction" generalised from Height-Plane classes to essentially every overlay layer.

Applied literally, non-negotiable §1.2 would force PRYZM to refuse ~100% of NSW overlay controls.
The honest resolution is the clause registry, not a relaxation of the rule.

---

## M1 — Layer inventory and classification

`scripts/m1m2.mjs` (population) over the prior lane's `m1-classified.json` inventory.
Raw: `m1m2-population-raw.json`, `m1-inventory.json`, `m1-classified.json`.

### M1.1 — Counts

| Service | Layers | Feature layers | DIRECT | GEOMETRIC | APPLICABILITY | TEXTUAL | IRRELEVANT |
|---|---:|---:|---:|---:|---:|---:|---:|
| `Planning_Portal_Principal_Planning` | 21 | 15 | 4 | 3 | 8 | 0 | 0 |
| `Planning_Portal_Local_Provisions` | 200 | 199 | 27 | 10 | 38 | 59 | 65 |
| `Planning_Portal_SEPP` | 348 | 288 | 34 | 13 | 114 | 74 | 53 |
| **Total** | **569** | **502** | **65** | **26** | **160** | **133** | **118** |

**Envelope-relevant (DIRECT + GEOMETRIC + APPLICABILITY) = 251 of 502 feature layers = 50.0%.**

> The founder's *">80% machine-readable"* estimate and the prior audit's *"198/199 layers serve
> CADID + clause + value"* both measured **field presence**. Presence is not population, and the
> service uses the **literal string `"Null"`** as a sentinel — so an `IS NOT NULL` test scores
> those as populated. Every figure below excludes `NULL`, empty string and `'Null'`.

### M1.2 — Population (the fact that replaces the estimate)

| Service | Features (relevant layers) | `LEGIS_REF_CLAUSE` populated | `LEGIS_REF_VALUE` populated | `CADID` populated |
|---|---:|---:|---:|---:|
| Principal | 246,908 | 157,319 / 165,769 = **94.9%** | 189 / 7,321 = **2.6%** | **field absent on all 15 layers** |
| LocalProvisions | 16,065 | 7,675 / 16,065 = **47.8%** | 409 / 16,065 = **2.5%** | 16,065 / 16,065 = **100.0%** |
| SEPP | 9,137 | 472 / 2,645 = **17.8%** | 0 / 2,219 = **0.0%** | 0 / 1,083 = **0.0%** |

**`LAY_CLASS` across all 57 DIRECT layers holding features: 130,649 / 130,660 = 100.0%**
(sole exception: Principal/25 Minimum Dwelling Density Area, 650/661). `scripts/layclass.mjs`.

### M1.3 — The vertical-control family, per layer

| Svc | Id | Layer | Features | clause pop | value pop | CADID pop |
|---|---:|---|---:|---:|---:|---:|
| Principal | 14 | Height of Buildings | 40,964 | **94.8%** | *no field* | *no field* |
| LP | 422 | Alternative Building Heights | 79 | **0.0%** | 100% *(symbol code)* | 100% |
| LP | 771 | Alternative Height of Buildings | 91 | **0.0%** | 0.0% | 100% |
| LP | 485 | Incentive Height of Buildings | 365 | 19.5% | 0.0% | 100% |
| LP | 509 | Macquarie Pk Incentive HOB | 54 | **0.0%** | 100% *(symbol)* | 100% |
| LP | 429 | Building Height Allowance | 203 | **0.0%** | 0.0% | 100% |
| LP | 430 | Building Height Plane | **9** | **0.0%** | 0.0% | 100% |
| LP | 469 | Floor Height Restriction | **14** | **0.0%** | 0.0% | 100% |
| LP | 572 | Sun Access Protection | 154 | 29.9% | 0.0% | 100% |
| LP | 573 | Sun Plane Protection | **9** | **0.0%** | 0.0% | 100% |
| LP | 763 | Overshadowing | 10 | **0.0%** | 0.0% | 100% |
| LP | 420 | Airport Buffer | **1** | **0.0%** | 0.0% | 100% |
| LP | 512 | Meteorological Station Height Limit | **7** | **0.0%** | 0.0% | 100% |

**The overlay layers are tiny.** Building Height Plane is **9 polygons, all in BURWOOD**, classes
A–E. Sun Plane Protection is **9 polygons, all in WOLLONGONG**. Floor Height Restriction is **14
polygons, all in SINGLETON**. That is *good news*: the §8 signed clause extraction is a **finite,
hand-completable corpus of ~32 polygons across 3 LEPs**, not an open-ended parsing programme.

### M1.4 — Where the value actually lives (dumped rows, `scripts/dump.mjs`)

```
430 Building Height Plane   [BURWOOD]         LAY_CLASS="E"|"C"|"A"|"B"|"D"  CLAUSE=null VALUE=null
573 Sun Plane Protection    [WOLLONGONG]      LAY_CLASS="MacCabe Park 12-2pm 21 June"   CLAUSE=null
                                              LAY_CLASS="Civic Square 11-3pm 21 June"
469 Floor Height Restrict.  [SINGLETON]       LAY_CLASS="42.7"|"41.2"|"64.1" CLAUSE=null VALUE=null
                                              LAY_NAME="Minimum Floor Height Restriction Heights
                                                        shown on map in AHD (m)"   <- corrected 09-04:
                                              10 distinct levels, not 8 (43 and 78.1 were missed),
                                              and they are MINIMA, not caps.
431 Building Setback        [THE HILLS SHIRE] LAY_CLASS="10" LABEL="10m"     CLAUSE=null VALUE=null
422 Alt Building Heights    [RANDWICK]        LAY_CLASS="13" LABEL="N1"      CLAUSE=null VALUE="N1"
```

Three findings encoded there:

1. **`LAY_CLASS` = the control value; `LABEL` = the cartographic label; `LEGIS_REF_VALUE` = the
   map-symbol code.** Layer 422 is decisive: `LAY_CLASS="13"` (13 metres) with
   `LEGIS_REF_VALUE="N1"`. A reader that trusts the field *name* gets `"N1"` and no height.
2. **Sun Plane Protection serves its own time window** in `LAY_CLASS`
   (`"12-2pm 21 June"`, `"11-3pm 21 June"`). The plane **angle is therefore computable** from
   solar geometry at the site latitude for that window — it is *not* a clause lookup. Only the
   **origin line** still needs the clause. This is a materially better position than §8 assumed.
3. **Layer 431 Building Setback Map is 30 polygons in ONE council (The Hills Shire).** The
   founder's §4 note — *"the finding that changes NSW … setbacks without a DCP"* — is **not
   state-wide**. It is one council's arterial-road setback map. It does **not** substitute for
   DCP setbacks anywhere else, and must not be presented as doing so.

Layers **416 Active Street Frontages** and **471 Foreshore Scenic Protection** return **0
features** — they exist as empty published layers.

---

## M2 — `CADID` viability

`scripts/m1m2.mjs`, predicate `CADID IS NOT NULL AND CADID <> 0`, across all DIRECT + GEOMETRIC +
APPLICABILITY layers (not the prior lane's 38-layer subset).

| Service | CADID field present | Populated | Verdict |
|---|---|---|---|
| **Principal** (HOB, FSR, zoning, lot size) | **absent on all 15 layers** | n/a | ❌ **key join impossible** |
| **LocalProvisions** | 16,065 features | **16,065 = 100.0%** | ✅ key join viable |
| **SEPP** | 1,083 features | **0 = 0.0%** | ❌ present but empty |

**Answer: the CADID key join is NOT the primary strategy.** It is unavailable on precisely the
layers that carry the base controls (Principal HOB/FSR/zoning) and empty on SEPP. **Spatial
intersection is mandatory and must be the primary join.** CADID is a *useful optimisation and
cross-check for the Local Provisions overlay tail only*.

> ⚠️ This **corrects** `NSW-DATA-GAP-AUDIT.md` §4, which reported *"CADID fill is very high
> (≈99–100%) on nearly every DIRECT/GEOMETRIC layer → the key join is the primary strategy"*.
> The 99–100% reading is right **for Local Provisions and only there**; the audit generalised it
> across the service family, and Principal — the most important service — has no CADID column at
> all. The audit's own caveat (*"a CADID names A cadastral object"*) survives.

---

## M3 — The precedence census

`scripts/m3.mjs` (uniform random) and `scripts/m3urban.mjs` (urban-weighted). Parcel frame:
**3,354,831** NSW parcels, objectid 1…4,134,385. Sample drawn with a seeded mulberry32 PRNG
(seed `20260903`) → reproducible. Controls counted by MapServer `identify` against
Principal `{14 HOB, 11 FSR}` and LocalProvisions vertical
`{422,771,485,509,429,430,469,572,573,763,420,512}` + floor-space
`{423,772,773,484,470,508,532,1027,758,757}`.

### M3.1 — Uniform random sample, n = 2,000, 0 errors

| Controls on parcel | 0 | 1 | 2 | 3 | 4+ |
|---|---:|---:|---:|---:|---:|
| **Vertical** | **783 (39.2%)** | 1,211 (60.6%) | **6 (0.30%)** | 0 | 0 |
| **Floor-space** | 1,383 (69.2%) | 614 (30.7%) | 2 | 1 | 0 |

- **>1 vertical control: 6 / 2,000 = 0.30%.** **>1 floor-space: 3 / 2,000 = 0.15%.**
- HOB `UNITS`: `m` 1,212 · **`m(RL)` 1**. `m(RL)` is ~0.08% state-wide but **real**.
- HOB `LEGIS_REF_CLAUSE` populated on the sample: **1,161 / 1,213 = 95.7%**.

### M3.2 — Urban-weighted sample, n = 600 (60 parcels × 10 centres)

| Controls on parcel | 0 | 1 | 2 | 3 | 4+ |
|---|---:|---:|---:|---:|---:|
| **Vertical** | 70 (11.7%) | 474 (79.0%) | **56 (9.3%)** | 0 | 0 |
| **Floor-space** | 188 | 404 | 5 | 3 | 0 |

| Centre | n | >1 vertical | 0 vertical |
|---|---:|---:|---:|
| **Sydney CBD** | 60 | **41 (68.3%)** | 8 |
| Macquarie Park | 60 | 7 | 24 |
| Parramatta | 60 | 4 | 4 |
| Chatswood | 60 | 3 | 0 |
| Wollongong | 60 | 1 | 2 |
| North Sydney / Newcastle / Burwood / Randwick / Singleton | 300 | 0 | 32 |

*Sampling bias stated: centres chosen by hand for CBD/centre character; within each bbox parcels
are taken at an even stride over the service's return order. This is a deliberately biased sample
and is reported separately from M3.1 for exactly that reason.*

### M3.3 — What the sizing means

**The precedence engine is a CBD instrument.** It fires on **0.3% of NSW parcels** but on
**68% of Sydney CBD parcels** — i.e. on almost exactly the sites where a yield error is worth the
most money. It earns its keep; it is not the common path.

**The common path is the F1/F2 decision.** **39.2%** of NSW parcels carry **no vertical control
at all**. That is 130× more common than a precedence conflict. Sydney Town Hall
(`151.2073,-33.8731`) is itself such a parcel — verified: a point query returns zero HOB features
while the surrounding CBD envelope returns 238. **F1-vs-F2 discipline is the dominant behaviour of
this engine, not an edge case**, and it must ship in the first commit.

### M3.4 — Every multi-control parcel found (the fixture corpus)

```
2//DP782292     HOB 31 m   + 485 Incentive HOB = 36        + FSR + 484 Incentive FSR = 2
5//DP240402     HOB 12 m   + 771 Alternative HOB = 25
                           + FSR + 772 Alt FSR Affordable 2.5 + 773 Alt FSR Employment 3.5
152//DP877246   HOB 8.5 m  + 429 Building Height Allowance = 2.1
54//DP1259000   HOB 110 m  + 572 Sun Access Protection (Cl 6.17 & 6.18)
//SP36957       HOB 60 m   + 572 Sun Access Protection (Cl 6.17 & 6.18)
291//DP1287257  HOB 24 m   + 572 Sun Access Protection ("Experiment Farm")
2//DP579335     FSR        + 758 Underground FSR
```

**`152//DP877246` is the proof of §1.3.** HOB = 8.5 m, Building Height Allowance = **2.1**.
`min()` over those two returns **2.1 m** — a garage. Any tightest-number-wins resolver produces a
building a quarter of the legal height, confidently, with a plausible face. This parcel is
fixture #1.

> ⛔ **CORRECTED 2026-09-04 — the CONCLUSION above survives and the REASON did not.** This
> paragraph originally continued: *"The 2.1 is not a competing height at all; it is an **additive
> allowance** granted under condition."* **Measured live, that is wrong on 203 of 203 rows.**
> Layer 429's `LAY_NAME` is **`"Minimum Level Australian Height Datum (AHD)"`**, in **BALLINA and
> BYRON** — coastal flood LGAs where 1.8–2.1 m AHD is a credible minimum habitable floor level and
> an absurd height bonus. The 2.1 is a **MINIMUM**, it is **ABSOLUTE**, and it is on the **FLOOR
> axis**. It was never additive. Transcript: `layname-census.json`; script:
> `scripts/laynamecensus.mjs`.
>
> ⚠ **Why this correction is worth more than the number it fixes.** A guard was written around the
> additive reading (`NSW_ADDITIVE_ALLOWANCE_LAYERS`, described in code as *"the single most
> important guard in the pack"*). It got the right answer **on this parcel from a false premise** —
> and a false premise generalises. The real exclusion is axis-based: a minimum-floor-level control
> is not on the envelope-top axis and never enters height precedence at all. That property is
> checkable from a field populated on **996/996** features; "is this layer additive?" was checkable
> from nothing but a layer title. §CONFIDENT-REGISTER-ROWS-ARE-THE-WRONG-ONES — the prose read
> fluently and the verdict was wrong.
>
> ⚠ **And a second trap on the same rows:** `SUGGESTED_CATEGORY` looks like a served role hint. It
> reads **`"HOB exception"`** on all 203 of those minimum-level rows. The government's own
> categorisation is wrong here. ⛔ **Do not key legal roles off it.**

**`5//DP240402` is the proof of §5.5.** Base HOB 12 m, Alternative HOB 25 m; base FSR plus *two*
mutually exclusive conditional alternatives (affordable-housing 2.5, employment 3.5). A resolver
that reports 25 m / FSR 3.5 has invented an entitlement worth roughly double the site's actual
yield. Correct output: base 12 m cited, two uplifts listed and **NOT applied**, each with its
condition.

---

## Blockers and corrections raised by Phase 0

1. **§5 step 2 is not executable as specified** — `LEGIS_REF_CLAUSE` is 0.0% on 10 of 12 vertical
   overlay layers. Requires the per-LGA signed clause registry. **This is the lane's top finding.**
2. **§1.2 as written would refuse ~100% of overlay controls.** The value is in `LAY_CLASS`, not
   `LEGIS_REF_VALUE`.
3. **§4's "Building Setback Map = setbacks without a DCP"** is 30 polygons in one LGA. Do not
   publish it as a state-wide DCP substitute.
4. **M2 inverts the join strategy** — spatial intersection is primary; CADID is an optimisation
   for Local Provisions only.
5. **Sun-plane angles are computable** from the served time window + latitude; only origin lines
   need clause text. Better than §8 assumed.
6. **`identify` returns attributes keyed by field ALIAS**, not field name (`MAX_B_H` arrives as
   `"Maximum Building Height"`). A name-keyed reader silently returns `undefined` for every value
   — this defect produced a false "0 controls everywhere" reading during this lane and was caught
   only by a self-validating probe (`scripts/selfcheck2.mjs`). Any future consumer must read
   alias-tolerantly.
7. **The cadastre FeatureServer returns centroids in Web Mercator unless `outSR=4283` is passed**,
   even though the layer's own SR is 4283. Same false-zero class of defect.
8. **Two rival service families** (`Planning/EPI_Primary_Planning_Layers` vs
   `ePlanning/Planning_Portal_*`) serve the same principal controls. This lane used and recommends
   the **Portal family** — it alone has the Local Provisions + SEPP siblings.
9. **Data-broker email** (`data.broker@environment.nsw.gov.au`, §3) — **not sent**; founder-channel
   action, outside this lane's authority.
10. **ELVIS / Spatial Services LiDAR licence — NOT verified.** No terrain was ingested and no
    envelope produced by this lane is vertically placed against ground.
