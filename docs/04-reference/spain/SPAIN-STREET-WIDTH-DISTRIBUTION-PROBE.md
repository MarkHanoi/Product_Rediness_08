# Are Spanish street widths QUANTISED? — the L-537 gate probe

**Run 2026-07-21 against the live Catastro WFS. 57 bbox fetches · 18,140 parcels · 1,437 candidate
*manzanas* · 926 dissolved block rings · 697 blocks with ≥ 1 measurable frontage · 6,819 measured
street widths · 5 cities.** Probe: `scratchpad/probe-street-widths.mts`, reusing the PRODUCTION
parsers (`server/parcelZoningProxy.js`), the PRODUCTION dissolve (`blockRing.ts`) and the
PRODUCTION measurement (`geometry/streetWidth.ts`) — so the probe cannot disagree with the path it
is diagnosing.

## WHY THE PROBE HAD TO COME FIRST

PGM Art. 327.2 keys the *alçada reguladora* on the **declared** street width (*ample oficial*), and
no such dataset is published — nationally or (probed 2026-07-21) by Barcelona. So the width must be
MEASURED, and a measured width lands on a table whose bands are STEPS: 19.99 m ⇒ 17.70 m, 20.00 m ⇒
20.75 m. The proposed remedy was to SNAP a measurement to the nearest "declared quantum".

**That is only legitimate if declared widths actually cluster on round values.** If they do not, the
snap set is a tunable standing between cadastral data and a compliance number — the exact failure
L-529 spent a whole session unwinding, where a confident root cause was recorded as confirmed in
three documents and was wrong. So the rule for this probe was fixed in advance: *cluster ⇒ ship the
snap; no cluster ⇒ do not ship it, fall back to the raw measured width and say so.*

## THE VERDICT

> **Widths DO cluster — decisively — but the quantum SET is CITY-SPECIFIC, and it is NOT the
> "obvious" one. Snapping is justified, narrowly: only on values that show a large local spike AND
> sit within the measurement's own error of the nominal figure.**

Two findings had to change the design, and both would have been missed by shipping the intuitive
snap set:

1. **Barcelona has no 10/15/25 m quantum at all** (×0.63, ×0.24, ×0.00 against local density). The
   obvious set `{10,15,20,25,30,…}` is *false* for the city we ship. Only **20 m and 30 m** are real
   Cerdà quanta.
2. **The Cerdà 50 m arteries measure 48 m, not 50** (a ×6.23 spike at 47.75–48.25, while 50 itself
   is ×0.90). The mass sits ~2 m below the nominal declared figure — **3× the measurement's own p90
   error bar of 0.63 m.** Snapping 48 → 50 would therefore be a *correction*, not a *resolution of
   noise*, and it is refused. (It costs nothing: 48 m and 50 m fall in the same Art. 327.2 band.)

## THE MEASUREMENTS

Spike test: count within **±0.6 m** of a candidate quantum, against the count expected from the
local ±5 m neighbourhood density. **×1.0 = no clustering whatsoever.**

| city | n | 6 m | 8 m | 10 m | 12 m | 15 m | 16 m | 20 m | 25 m | 30 m | 48 m | 50 m |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Barcelona** | 2,855 | ×4.10 | ×2.31 | ×0.63 | ×0.39 | ×0.24 | ×0.20 | **×7.55** | ×0.00 | **×7.51** | **×6.23** | ×0.90 |
| **Madrid** | 1,878 | ×1.19 | ×1.71 | ×1.08 | ×0.54 | **×3.79** | ×0.57 | ×0.44 | ×0.30 | **×5.76** | ×0.69 | ×1.19 |
| **Valencia** | 1,034 | ×0.88 | ×0.41 | ×1.14 | ×2.61 | ×0.48 | ×2.86 | ×0.11 | ×4.39 | ×0.00 | ×0.00 | **×6.77** |
| **Córdoba** | 527 | ×1.43 | ×0.98 | ×1.03 | ×0.96 | ×2.40 | ×1.08 | ×0.37 | ×0.93 | ×1.00 | ×1.39 | ×1.19 |
| **Sevilla** | 525 | ×1.48 | ×1.30 | ×1.59 | ×1.05 | ×0.56 | ×2.76 | ×0.54 | ×0.45 | ×1.85 | ×0.76 | ×2.78 |

Whole-sample sanity check against a null model — fraction of all 6,819 measurements within ±*t* of
*any* of `{8,10,12,15,20,25,30,40,50,60}`, versus what a uniform distribution over the observed
3.0–79.7 m range would give:

| ±t | observed | uniform null |
|---|---|---|
| 0.5 m | **47.1 %** | 13.0 % |
| 1.0 m | **60.9 %** | 26.1 % |
| 2.0 m | 74.2 % | 52.2 % |
| 3.0 m | 88.8 % | 78.2 % |

Clustering is 3.6× the null at ±0.5 m and washes out by ±3 m — i.e. it is a set of **narrow spikes**,
not a broad tendency. That shape is what licenses a *tight* snap and forbids a loose one.

**Where the mass actually sits** (all cities, ±1.5 m windows): near 20 m → median **19.85**, p10
19.56, p90 20.08. Near 30 m → median **29.94**, p10 29.31, p90 30.26. So the measurement runs a few
centimetres *under* the declared figure — consistent with the cadastral boundary being the façade
line — and the deficit is comfortably inside the error bar.

**The measurement's own error bar** (max − min across the 5 rays cast per block edge): p50 **0.06 m**,
p75 0.16 m, p90 **0.63 m**, p99 2.43 m. This is what bounds the snap tolerance; it is not a chosen
number.

## WHAT WAS DERIVED FROM THIS, AND SHIPPED

- **`BCN_STREET_WIDTH_QUANTA = [20, 30]`** — the only two values with a ≥ ×5 Barcelona spike whose
  cluster centre is within the error bar of the nominal figure. Both are Art. 327.2 **band edges**,
  which is the entire reason snapping matters: away from a band edge a snap changes no answer.
- **48 m EXCLUDED** despite a ×6.23 spike — the offset to the nominal 50 m exceeds the error bar
  (see the verdict above). Free to exclude: same band.
- **6 m and 8 m EXCLUDED** despite ×4.10 / ×2.31. The Barcelona 5.5–8.5 m mass is a *continuous*
  ridge of narrow pre-Cerdà streets (0.25 m bins: 5.50:61, 5.75:275, 6.00:182, 6.25:47 …), not a
  spike on a declared value. Snapping inside a continuous distribution manufactures precision that
  is not in the data — and the 8 m band edge separates 8.55 m from 11.60 m, a whole storey.
- **`SNAP_TOLERANCE_M = 0.6`** — the p90 of the measurement's own error (0.63, rounded down). It is
  one fifth of the narrowest Art. 327.2 band (3 m), so a snap can never cross a band on its own.
  A measurement whose *own* spread exceeds this is refused rather than snapped.
- **Ambiguity refusal is retained though currently unreachable:** with `{20, 30}` no width can be
  within 0.6 m of two quanta (0 cases in 2,855). The check stays, because a future region's set
  may be denser and the refusal must not be added retroactively.
- **Quanta live in the REGION pack, never in the measurement code.** The table above is the proof:
  Barcelona is `{20, 30}`, Madrid is `{15, 30}`, Valencia is `{25, 50}` and Córdoba/Sevilla have
  nothing above ×2.8 — i.e. **for those two cities the honest answer is no snapping at all.**

## COVERAGE IMPACT (Barcelona, measured on this sample)

| | frontages resolving a height |
|---|---|
| measured width + band-edge guard only | 1,260 / 2,855 (**44.1 %**) |
| \+ snapping to `{20, 30}` within 0.6 m | 2,467 / 2,855 (**86.4 %**) |

The 55.9 % previously refused were not refused at random: **38.2 % of all Barcelona frontages sit
within 0.5 m of the 20 m band edge** — the Cerdà grid lands exactly on the step, which is precisely
the defect that made `maxHeight` null and drew a 0.5 m footprint slab on Enric Granados and Ronda de
la Universitat. The residual ~13.6 % is dominated by the 8 m band edge (11.4 %), which this probe
says we must *not* snap. Those still refuse, correctly.

## THE DEPENDENCY THIS INHERITS — AND DOES NOT FIX

The width is measured from **our** block's ring, so it inherits the `dissolveParcelsToBlockRing`
blocker documented in `SPAIN-CADASTRAL-DISSOLVE-PROBE.md`. This run puts a number on it at scale:
**926 / 1,437 candidate manzanas dissolved (64 %)** — better than the 9-address sample suggested,
but still one block in three producing nothing. No ring ⇒ no width ⇒ no height ⇒ the footprint slab.
That degradation is honest and deliberate; **fixing the dissolve is a separate task and was not
attempted here.**

## WHAT THIS PROBE DOES *NOT* SHOW

- **It does not prove any measured width equals the *ample oficial*.** It shows the measurements
  pile up on round values, which is strong circumstantial evidence that a declared grid exists
  behind them. The snapped value is therefore carried as `snapped-to-declared-quantum` — an
  inference, one tier below the curated Cerdà list and two below a real municipal GIS figure.
  Certification against MUC/RPUC remains **L-528**.
- **It says nothing about non-Barcelona RULES.** Madrid's 15/30 m quanta are a fact about its
  streets, not a licence to run Art. 327.2 there. Each city needs its own height table and its own
  founder-signed source gate (the L-449 pattern).
- **It cannot see País Vasco / Navarra**, which run cadastres outside Catastro.

**Cross-refs:** L-537 (audit), `geometry/streetWidth.ts`, `rulepacks/ampladaDeVial.ts`,
`rulepacks/bcnAlcadaReguladora.ts`, `SPAIN-CADASTRAL-DISSOLVE-PROBE.md`, C58 §1.2/§1.4, C23,
ADR-0271, L-528, L-529 (why this probe exists at all).
