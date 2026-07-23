# ADR-0275 — The *amplada de vial* is a CONSTRUCTION, and a construction's inputs need a provenance LADDER

**Status:** **ACCEPTED** · implemented and shipped (v265):
`packages/site-parcel-data/src/geometry/streetWidth.ts` (pure measurement) +
`packages/site-parcel-data/src/rulepacks/ampladaDeVial.ts` (the tier ladder) +
`rulepacks/bcnAlcadaReguladora.ts` (the Art. 327.2 table) +
`rulepacks/bcnOfficialStreetWidths.ts` (the demoted curated list).
**Date:** 2026-07-21 · **Audit:** **L-537** (this decision); **L-525a** (the height table it feeds);
**L-528** (certification, still open); **L-529** (why the gate came first).
**Extends:** ADR-0271 (the construction-not-lookup principle, applied to depth) to the **height**.
**Contracts:** **C58 §1.12** (this ADR is the decision that invariant records), C58
§1.1/§1.2/§1.3/§1.4/§1.9, **C23 §11.1** (ladder 1), C12 §8 (no new fetch).
**Evidence:** `docs/04-reference/jurisdictions/es/SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md`.

> **ADR number note.** `ADR-0273` is *reserved* by `BARCELONA-COMPLETE-COVERAGE-PLAN.md` §3.9 /
> Phase 3 and audit row L-538 for the **nucli-antic block-occupation rule kind**, and `ADR-0274` is
> the tolerant block dissolve. Neither is taken here.

---

## 1. Context — the second field that has no lookup

ADR-0271 established that PGM Art. 242.2 states an **algorithm** for the *profunditat edificable*,
not a number. The *alçada reguladora* is the same shape of problem one field over:

**PGM Art. 327.2 keys the maximum regulated height on the DECLARED street width (*ample oficial*)**
(table confirmed by primary-source research, `L-526-LEGAL-FINDINGS.md`):

| Amplada de vial | Alçada reg. màxima | Plantes |
|---|---|---|
| < 8 m | 8.55 m | PB+1 |
| 8–12 m | 11.60 m | PB+2 |
| 12–15 m | 14.65 m | PB+3 |
| 15–20 m | 17.70 m | PB+4 |
| **20–30 m** | **20.75 m** | **PB+5** |
| ≥ 30 m | 23.80 m | PB+6 |

**No declared-width dataset is published** — not nationally, and (probed 2026-07-21) not by
Barcelona, whose only `vial` layer is a WMS raster with no width attribute. So the width must be
**measured**, and a measured width lands on a table whose bands are **STEPS**: 19.99 m ⇒ 17.70 m,
20.00 m ⇒ 20.75 m — a whole storey either side of a boundary the Cerdà grid sits exactly on.

**The defect this replaced.** The prior implementation was a hand-curated allow-list of ~26 Cerdà
streets. It was *honest* — unlisted streets produced `maxHeight: null` — but it did not scale, and
`null` height meant the massing path drew a **0.5 m footprint slab** on real Eixample parcels
(founder, on Enric Granados and Ronda de la Universitat: *"the envelope becomes almost null"*).

---

## 2. The gate that came before the code

The proposed remedy was to **SNAP** a measurement to the nearest "declared quantum". That is only
legitimate if declared widths actually cluster on round values. **Asserting that from intuition is
exactly the L-529 failure** — a confident root cause recorded as confirmed in three documents and
demolished by one probe. So the rule was fixed in advance, before a line was written:

> **Cluster ⇒ ship the snap. No cluster ⇒ do not ship it, fall back to the raw measured width and
> say so.**

**The probe:** 57 live Catastro bbox fetches · 18,140 parcels · 1,437 candidate manzanas · 926
dissolved block rings · **697 blocks · 6,819 measured street widths · 5 cities**, reusing the
PRODUCTION parsers, the PRODUCTION dissolve and the PRODUCTION measurement module — so the probe
cannot disagree with the path it diagnoses.

---

## 3. The verdict, and the two findings that changed the design

> **Widths DO cluster — decisively — but the quantum SET is CITY-SPECIFIC, and it is NOT the
> obvious one.**

Spike test: count within ±0.6 m of a candidate quantum against the count expected from the local
±5 m neighbourhood density. **×1.0 = no clustering whatsoever.**

| city | n | 6 m | 8 m | 10 m | 15 m | 20 m | 25 m | 30 m | 48 m | 50 m |
|---|---|---|---|---|---|---|---|---|---|---|
| **Barcelona** | 2,855 | ×4.10 | ×2.31 | ×0.63 | ×0.24 | **×7.55** | ×0.00 | **×7.51** | **×6.23** | ×0.90 |
| Madrid | 1,878 | ×1.19 | ×1.71 | ×1.08 | **×3.79** | ×0.44 | ×0.30 | **×5.76** | ×0.69 | ×1.19 |
| Valencia | 1,034 | ×0.88 | ×0.41 | ×1.14 | ×0.48 | ×0.11 | ×4.39 | ×0.00 | ×0.00 | **×6.77** |
| Córdoba | 527 | ×1.43 | ×0.98 | ×1.03 | ×2.40 | ×0.37 | ×0.93 | ×1.00 | ×1.39 | ×1.19 |
| Sevilla | 525 | ×1.48 | ×1.30 | ×1.59 | ×0.56 | ×0.54 | ×0.45 | ×1.85 | ×0.76 | ×2.78 |

**Both findings below would have been missed by shipping the intuitive snap set:**

1. **Barcelona has NO 10 / 15 / 25 m quantum at all** (×0.63, ×0.24, ×0.00). The obvious set
   `{10,15,20,25,30,…}` is simply **false for the city we ship**. Only **20 m and 30 m** are real
   Cerdà quanta — and both are Art. 327.2 **band edges**, which is the entire reason snapping
   matters: away from a band edge a snap changes no answer.
2. **The nominal "50 m" Cerdà arteries MEASURE 48 m** (×6.23 at 47.75–48.25, while 50 m itself is
   ×0.90). The mass sits ~2 m below the nominal declared figure — **3× the measurement's own p90
   error bar of 0.63 m**. Snapping 48 → 50 would therefore be a **correction**, not a resolution of
   noise, and it is refused. It costs nothing: 48 m and 50 m fall in the same band.

Whole-sample sanity check against a uniform null over the observed 3.0–79.7 m range: **47.1 %** of
all 6,819 measurements within ±0.5 m of a round value vs **13.0 %** expected — 3.6× the null — and
the excess washes out by ±3 m. **The clustering is a set of narrow spikes, not a broad tendency.**
That shape is what licenses a *tight* snap and forbids a loose one.

---

## 4. The decision

### 4.1 Construct the width; never invent it

`geometry/streetWidth.ts` measures the frontage-to-frontage distance by perpendicular ray-cast from
each block-ring edge to the surrounding blocks — **5 samples per edge, with the max−min spread
carried as the measurement's OWN error bar**. Plus `blockEdgesFacingParcel` (per-façade selection)
and `governingStreetWidth` (narrowest wins — conservative on corners). PURE, region-agnostic,
deterministic (C58 §1.1/§1.9).

**Zero extra network.** §STREET-WIDTH-NEIGHBOURS returns the opposing parcels the block bbox
**already fetched** and previously discarded via the manzana filter, halo-filtered to 100 m and
cached with the block per manzana ⇒ O(1) per parcel.

### 4.2 Return the TIER with the value, always

Flattening four unequal sources into one `width_m` erases the only thing that keeps the panel
honest. The ladder, strongest first:

| Tier | Meaning | Disarms the band-edge guard? |
|---|---|---|
| `declared-municipal-gis` | a real planning street database | yes — **reserved; none exists in Spain that we have probed** |
| `curated-cerda-nominal` | the hand-verified allow-list — **DEMOTED, not deleted**: it is still the best figure for its ~26 streets, because it is the nominal declared value rather than an inference from geometry | yes |
| `snapped-to-declared-quantum` | a measurement close enough to a demonstrated quantum | no |
| `measured-cadastral` | the raw frontage-to-frontage distance | no |
| *(none)* | **the correct answer when we do not know** — costs a flat study volume instead of a wrong building | — |

### 4.3 The snap is bounded by the measurement's own error

`SNAP_TOLERANCE_M = 0.60` — the p90 of the measurement's own error (0.63 m, rounded down). It is
**one fifth of the narrowest Art. 327.2 band (3 m)**, so a snap can never cross a band on its own,
and the observed 20 m cluster's own p10–p90 half-width (0.45 m) sits inside it. **A measurement
whose own spread exceeds the tolerance is REFUSED rather than snapped — the error bar gates its own
use.** Refusals also fire on `too-far` and `ambiguous`; the ambiguity check is retained though
currently unreachable with `{20, 30}` (0 cases in 2,855), because a future region's set may be
denser and a refusal must not be added retroactively.

### 4.4 Do not snap inside a continuum

**6 m and 8 m are EXCLUDED despite ×4.10 / ×2.31.** The Barcelona 5.5–8.5 m mass is a *continuous*
ridge of narrow pre-Cerdà streets (0.25 m bins: 5.50:61, 5.75:275, 6.00:182, 6.25:47 …), not a spike
on a declared value. Snapping inside a continuous distribution manufactures precision the data does
not contain — and the 8 m band edge separates 8.55 m from 11.60 m, a whole storey, so a wrong snap
there is expensive.

### 4.5 Quanta live in the REGION pack, never in the measurement code

The probe is the proof that this separation is real rather than tidy-minded: Barcelona `{20, 30}`,
Madrid `{15, 30}`, Valencia `{25, 50}`, and **Córdoba and Sevilla quantise on nothing above ×2.8 —
for them the honest configuration is `quanta: []`.** A region supplies (a) its own height table,
(b) its own `StreetWidthQuantisation` **derived from its own probe, never copied**, and
(c) optionally a declared-width override list. It supplies **no geometry**.

### 4.6 No width ⇒ no height ⇒ a flat FOOTPRINT SLAB, never an invented prism

The removed `: 9` metre fallback is the anti-pattern this closes: it produced a ~9 m study volume
next to real ~25 m Eixample neighbours and read as an answer (L-525a, L-459 defect class).

---

## 5. Consequences

**Coverage, Barcelona, measured on the probe sample:**

| | frontages resolving a height |
|---|---|
| measured width + band-edge guard only | 1,260 / 2,855 (**44.1 %**) |
| + snapping to `{20, 30}` within 0.6 m | 2,467 / 2,855 (**86.4 %**) |

The 55.9 % previously refused were not refused at random: **38.2 % of all Barcelona frontages sit
within 0.5 m of the 20 m band edge** — the Cerdà grid lands exactly on the step, which *is* the
defect. The residual ~13.6 % is dominated by the 8 m band edge (11.4 %), which §4.4 says must NOT be
snapped. Those still refuse, correctly.

**Live acceptance on the production chain (real Catastro):** Ronda Universitat 16 — unlisted,
previously a slab — resolves 30.00 m ⇒ **PB+6 = 23.8 m**. The construction **cross-validates against
the curated list**: Aribau 60 and Pau Claris 174 independently measure→snap to **20.00 m ⇒ PB+5 =
20.75 m**, the same answer the hand-curated Cerdà value gives. Gran Via 509 measures 50.10 m, is
correctly NOT snapped, and resolves as `measured-cadastral` with the guard armed.

**What this does NOT establish:**
- **It does not prove any measured width equals the legal *ample oficial*.** The clustering is
  strong circumstantial evidence that a declared grid exists behind the measurements — nothing
  more. That is why the snapped value is carried as `snapped-to-declared-quantum`, one tier below
  the curated nominal and two below a real municipal GIS figure. **Certification remains L-528**,
  and it is interactive-GIS work, not web search.
- **It says nothing about non-Barcelona RULES.** Madrid's `{15, 30}` quanta are a fact about its
  streets, not a licence to run Art. 327.2 there.
- **An unresolved legal discrepancy rides underneath:** an official Ajuntament *Certificat
  Urbanístic* for a 20 m street gives **22.40 m** (PB+5) via Arts. 238/240/327, against 20.75 m in
  the transcribed table. The Barcelona certificate is the more authoritative for Barcelona.
  Unreconciled — L-528.

**Inherited blocker, not fixed here (and deliberately not attempted in the same change):** the
measurement needs a dissolved block ring, and at the time of this decision
`dissolveParcelsToBlockRing` succeeded on ~64 % of candidate manzanas nationally. No ring ⇒ no
width ⇒ no height ⇒ the footprint slab. That degradation is honest; the repair is **ADR-0274**.
