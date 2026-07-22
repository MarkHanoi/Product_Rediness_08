# ADR-0273 — Tiered-occupation envelopes: when one ordinance grants two heights over one parcel

**Status:** ACCEPTED and IMPLEMENTED (schema + solver + geometry + tests) · **the clau `22a`
registration it unblocks is NOT taken — see §6.**
**Date:** 2026-07-22 · **Audit:** §L-590b (this ADR); L-590 (the sourcing that produced the pack).
**Extends:** ADR-0270 (the geometric-rule model), ADR-0271 (block-derived depth), ADR-0272 §3.5
(which explicitly deferred *this* rule and said it belonged with ADR-0271's machinery).
**Contracts:** C58 §1.1/§1.3/§1.4/§1.7a/**§1.7b (new)**/§1.8/§1.11/§1.12/**§2.4a (new)**, C19 §2.3/§4.1.

---

## 1. Context — the shape our model could not draw

`BuildableEnvelope` carried **one** `insetPolygon`, **one** `maxHeight_m`, **one** `maxVolumeM3`.
`GeometricRule` had four kinds and none of them changed the footprint with height.

PGM NNUU **Art. 350.2** (Barcelona clau `22a`, *zona industrial* — **17.5 % of the city's private
buildable land**, fully sourced from the primary text in L-590) describes something that model
cannot hold:

- **350.2.b** — *"l'edificació **per damunt de la planta baixa** haurà de situar-se dins de la
  franja concèntrica a les alineacions de l'illa **de superfície igual al 70 per 100** d'aquesta"*.
- **350.2.c** (closing sentence) — the street-width height table (9 / 13 / 17 m, PB+1…PB+3) applies
  **only inside that band**.
- **350.2.e** — *"Alçada de l'edificació a **l'interior de l'illa**: es fixa en **5 m**
  (corresponents a una única planta indivisible)"*.
- **350.2.a** — occupation ≤ **90 % of the PARCEL**; FAR 2 m² sostre/m² sòl.

⇒ **Two heights over two disjoint parts of one parcel**, and the line between them is drawn on the
**BLOCK**, by an algorithm, not by a designer.

The pack was authored, tested, cited — and deliberately **unregistered**, because
`geometricRule: null` means "legacy per-edge inset", which on this zone's (correctly) all-null
setbacks erodes nothing. Registering it would have published an envelope covering **100 %** of the
plot on the same card as the **90 %** occupation cap read from the same article.

---

## 2. Decision

### 2.1 A fifth `GeometricRule` kind: `tiered-occupation`

```ts
{
  kind: 'tiered-occupation',
  ...alignmentCore,               // alignTo, alignmentOffset_m, sideTreatment, side_m?, rear_m?
  bandAreaRatioOfBlock: number,   // (0,1) — Art. 350.2.b. AN EQUALITY.
  interiorTierHeight_m: number,   // >0    — Art. 350.2.e (22a ⇒ 5)
  interiorTierFloors: number,     // int>0 — Art. 350.2.e ("una única planta indivisible" ⇒ 1)
}
```

**Rejected against each existing kind, because "is this really a new kind?" is the question this
union exists to force:**

- `setback` — erodes by STATED distances. Art. 350 states none, and Art. 349 orders the zone
  *segons alineacions de vial*, so there is no honest front/side/rear triple (C58 §1.7a).
- `alignment` — carries a scalar depth. Art. 350 states no depth; it states an area equality on the
  block from which a depth must be constructed.
- `block-derived-alignment` — **the near-miss, rejected on three independent grounds:**
  1. it REQUIRES `minDepth_m` + `maxDepth_m`, both strictly positive. **Art. 350 states neither.**
     Supplying Art. 242's 11 m / 30 m imposes the Eixample article's clamps under a citation to
     Art. 350 — **L-526 verbatim**; any other pair is synthesised (C58 §1.7a).
  2. `interiorFreeRatio` is a **MINIMUM** (*"com a mínim el 30 per 100"*). Art. 350.2.b is an
     **EQUALITY** (*"de superfície igual al 70 per 100"*). Same digits, different quantifier: a
     minimum admits an interval of lawful depths and needs clamps to pick one; an equality picks
     itself and must not be clamped.
  3. it yields ONE region and ONE height, so it silently drops the block-interior tier — frequently
     most of the parcel on industrial fabric.
- `explicit-area` — the ordinance publishes no polygon here.
- ADR-0272's proposed `coverage-and-far` — that kind is for *edificació aïllada* (`20a`), where
  separations are real distances. ADR-0272 §3.5 explicitly excluded the 22a concentric strip from
  its own scope and said it was block-derived and belonged with ADR-0271's machinery. This is that.

**⚠ MEASURED, and recorded because it looks like an argument against the decision:** on a Cerdà
113 m block the two constructions give the **same** depth, because Art. 242's ratio genuinely binds
there and a minimum bound by its ratio lands where the equality does. They diverge **at Art. 242's
bounds** — on a 30 m block Art. 242 returns `min-floor` degenerate ("the ordinance cannot be
satisfied") where Art. 350.2.b answers cleanly at 6.78 m; on a 400 m block Art. 242 caps at 30 m
where Art. 350.2.b gives 90.5 m. Coinciding on the unclamped interior is exactly what two rules
sharing an erosion and differing in their bounds should do, and it is why the difference is
asserted at the bounds rather than in the middle (`blockConcentricBand.test.ts`).

**Deliberately NOT in the rule:** the 90 % occupation. It is already `ZoningRule.maxCoverage`;
duplicating it would give one legal quantity two homes free to disagree on a compliance number.
And per ADR-0272 §3.2 a coverage cap does not shape a polygon.

### 2.2 `BuildableEnvelope.tiers` + the PRINCIPAL-TIER rule

`tiers: EnvelopeTier[]` (C58 §2.4a). **Empty is the identity** — every zone before this ADR yields
one prism, exactly as `kind: 'setback'` is the identity for a pre-ADR-0270 pack.

When `tiers` is non-empty, `insetPolygon` / `insetAreaM2` / `maxHeight_m` / `maxFloors` **MUST**
mirror the **principal tier** — tallest, ties on area, null height ranking below any stated one —
and `BuildableEnvelopeSchema` **refuses to parse** an envelope where they disagree.

**This is the load-bearing decision, and the reason is migration risk, not tidiness.** Every
consumer that predates this ADR reads the legacy prism: the facts panel
(`GISAreaLayout.ts`), the Cesium massing and scene renderer, the C58 §1.8 generator bounds,
`site.updateZoning` (C19 §4.1), `capacityComparison`, `complianceReport`. Pinning the legacy fields
to a real tier means every one of them renders something that **genuinely fits inside the
envelope** — under-stated (the other tiers are invisible to it), never over-stated, which is the
only direction C58 §1.4 permits. A merged or averaged prism would be a volume no article grants.

A tier's `maxHeight_m` is **nullable, and the null is a finding**: Art. 350.2.c is keyed on the
*amplada de vial* and gated on a legal regime, so the tall tier's REGION can be determined while
its HEIGHT honestly refuses. When it does, the 5 m tier becomes the principal one and the envelope
publishes a height the ordinance states outright instead of a null.

### 2.3 The solver: a COMPOSITION, not a second envelope solver

```
insetPolygonPerEdge(parcel, …)                       ← unchanged, L-586 capsule-union erosion
  d = solveBlockConcentricBandDepth(block, 0.70)     ← NEW: the Art. 350.2.b equality
  tier 'block-band'     = clipToDepthBand(inset, frontEdge, d)
  tier 'block-interior' = clipBeyondDepthBand(inset, frontEdge, d)   ← NEW, same module
```

Both clips share one inward normal and one Sutherland–Hodgman pass, so the tiers **tile** the
footprint exactly — asserted. `solveBlockConcentricBandDepth` reuses the *same*
`insetPolygonPerEdge` that `solveBlockDerivedDepth` uses, so a change to the erosion moves both
constructions together and two compliance numbers derived from one geometry cannot drift apart.

**No ordinance bounds anywhere.** The bisection bracket is derived from the block's own geometry
(0 → half the bounding-box diagonal, where the band ratio is 0 and 1 respectively), which is a fact
about polygons, not about Art. 350.

**The equality verifies itself.** Our erosion is not continuous on a dissolved cadastral ring
(L-581: it drops a different set of lines at different depths), and a bisection on a discontinuous
function converges to a jump, not to the target. So the achieved ratio is measured at the answer
and the result is **refused** when it misses — citing OUR geometry, never "Art. 350.2.b cannot be
satisfied on this block". This is the property Art. 242.2's *minimum* does not have, and it is why
that construction needed a separate monotonicity tripwire (L-581) to catch the same failure class.

### 2.4 Coverage binds the tiered VOLUME (partially closing C58 KG-3)

`maxVolumeM3 = min(area(principal tier), maxCoverage × parcelArea) × height`, **on tiered
envelopes only**. Without it, a parcel shallower than the tier boundary publishes a footprint
covering 100 % of the plot beside the same article's 90 % cap — the exact over-statement that kept
the pack unregistered. It is **not** retro-fitted to every coverage-carrying zone here: that
silently moves the published volume of every shipped envelope and is a product decision owed its
own before/after measurement.

---

## 3. Validation — against an INDEPENDENT oracle, block by block

`scratchpad/probe-l590b-band-oracle.mts`, 65 **real dissolved Eixample manzanas**. The oracle is a
different algorithm, not a variant: rasterise the block, take each interior cell's distance to the
nearest street frontage, and read the **70th percentile of that distance field** — which IS the
band depth by Art. 350.2.b's own definition. No offsetting, no bisection, no polygon area.

| | |
|---|---|
| answered (passed the self-check) | **58 / 65** (89.2 %) |
| refused (own equality check failed) | 7 |
| \|code − oracle\| depth, median / p90 / max | **0.327 m** / 0.767 m / 1.424 m |
| code/oracle depth ratio, min / med / max | 0.9377 / **0.9873** / 0.9983 |
| ⚠ DEEPER than the oracle (C58 §1.4 direction) | **0 / 58** |

Worst named individuals (per L-581: an aggregate is not evidence) — `1836401DF3813F` code 21.42 m
vs oracle 22.85 m; `1634401DF3813D` 23.00 vs 24.32; `1435804DF3813E` 24.91 vs 26.21. All shallower.

**The direction is not luck.** The band is where the TALL tier stands, so a too-deep band
over-states volume. Every block comes out shallower *because* §INSET-ROUND-JOIN guarantees the
erosion is never larger than the exact one (L-586): an under-stated interior is reached at a
shallower depth, so the solver stops early. **The erosion's conservatism propagates into this
construction as depth conservatism** — anything that made the erosion "tighter" without preserving
that one-sidedness would silently flip the sign of the error on the tall tier.

**The refusal threshold is measured, not chosen.** Achieved ratios cluster: accepted 69.8–70.0 %
(58 blocks), refused 66.0–69.4 % (7), with **nothing between 69.4 % and 69.8 %**. The 0.5 pp
tolerance sits in that gap, so it is not slicing a distribution.

**One honest blemish, recorded rather than rounded away:** measured as an AREA at the code's own
depth, the BLOCK band comes out 2–5 % larger than the oracle on 9 of 58 blocks. That is the same
fact with the opposite sign — the band is `block − erosion`, so an under-stated erosion inflates
its complement. It does not reach the published envelope, because the engine consumes the DEPTH
(conservative on 58/58) and cuts the parcel tier at that depth.

---

## 4. Consequences

**Positive.** The two-tier solid is expressible, solvable, explainable (three first-class
derivation rows) and safe for every tier-unaware consumer. Adding the kind made the unhandled case
a compile error in `complianceReport.ts` — the union's stated purpose (ADR-0270 reason 4) working
as designed. `clipBeyondDepthBand` and `solveBlockConcentricBandDepth` are reusable for any
ordinance that draws a height line on the block, which is a European pattern, not a Barcelona one.

**Negative / accepted.**
- The legacy prism now UNDER-states on tiered zones. A caveat says so in words, but ADR-0272 §4 is
  right that under-building is not a "safe" error in a feasibility tool — the real fix is
  tier-aware rendering (§5).
- 7/65 real blocks refuse. That is the honest consequence of making the equality verify itself, and
  it is visible rather than silent.
- KG-3 is only partially closed (§2.4).

---

## 5. NOT decided here — the tier-aware consumers

Everything below reads the principal tier today and is therefore **correct but incomplete**. None
of it can over-state; all of it under-states a tiered envelope.

| Consumer | Today | Owed |
|---|---|---|
| Facts panel `GISAreaLayout.ts` | principal tier's footprint / study volume | a per-tier breakdown; the §1.7b.4 "this is one of N tiers" statement |
| `ParcelBoundarySceneRenderer` + Cesium massing | extrudes the principal tier | one extrusion per tier at its own height |
| C58 §1.8 generator bounds | principal tier as the buildable boundary | a tiered vertical cap, so a generated building fits the real solid |
| `site.updateZoning` (C19 §4.1) | persists the principal ring (§1.7a) | unchanged — but a tiered envelope's other tiers are not persisted, so a reopened session sees the summary only |
| `capacityComparison` | compares against the principal tier | per-tier proposed-vs-permitted |

---

## 6. ⚠ WHAT THIS ADR DOES **NOT** UNBLOCK — clau `22a` stays unregistered

The modelling blocker is closed. **The other one is untouched and no amount of engineering closes
it.** Arts. 350.2.a–f govern only industrial land *mancada de Pla Parcial*; land with a
definitively-approved *Pla Parcial* falls under Art. 350.1, where only the FAR and occupation are
the PGM's. Neither Catastro nor the MUC says which regime a parcel is in.

⚠ **It gates the FOOTPRINT, not only the height.** The FAR and the occupation are restated verbatim
by Art. 350.1.1r and are regime-neutral; **Art. 350.2.b's band is not.** Registering today applies
that band, cited to Art. 350.2.b, to parcels Art. 350.1 may govern. The error is conservative — a
band only restricts — and conservative is not the test: a confident mis-citation is the harm L-526
named, and an under-stated envelope over 17.5 % of the city is a real cost.

Unblocking is (i) a Pla-Parcial coverage layer for Barcelona's industrial land, or (ii) a founder
ruling that 22a inside the municipality is `'none'` by default. Both are determinations about the
law, and this project's discipline is that those are not made silently by an implementer.
Tracked as **C58 KG-6**, and guarded by a test in `esBarcelonaIndustrialPack.test.ts` that fails
with the reason attached if anyone registers the pack.
