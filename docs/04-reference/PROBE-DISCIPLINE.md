# Probe discipline — how to measure this system without measuring the wrong thing

**Written 2026-07-22, the day four separate probes were caught measuring something adjacent to the
thing they named.** Every number in the Barcelona programme comes from a probe, so **a probe defect
and a product defect are the same class of bug** — except a probe defect is worse, because it
survives review by producing a plausible number.

> **THE ONE-LINE RULE: the probe is part of the system and must be verified like the system.**

---

## §1 — The four artefacts, and their shared shape

| # | Probe | What it claimed | What it actually measured |
|---|---|---|---|
| 1 | layer-6 coverage | end-to-end 15.7% | **Tautological** — computed `maxVolume`, then compared it to itself |
| 2 | context-tile twin matcher | 47% of buildings "missing" | **Density, not identity** — centroid matching on 10 m-spaced Eixample buildings |
| 3 | L-581 conservatism check | "the clamp is conservative" | **The wrong invariant** — inset ≤ *parcel*, when the question was inset ≤ *true erosion*. 31/65 blocks were over-stating by up to 65% and it reported clean |
| 4 | layer-5 height rate | 78.3% | **Not the production chain** — skipped tier 2 entirely (48% of parcels) and took the narrowest street around the whole *manzana* instead of the edges the parcel fronts. Diverged on 60 of 83 |

**THE SHARED SHAPE: the probe RE-IMPLEMENTED or APPROXIMATED what production does, instead of
CALLING it.** Every one produced a plausible number, and three of the four were believed and
published before anyone checked.

⚠ Note #3 especially: **that probe was written specifically to catch the defect it then missed.**
Writing a check is not the same as writing the *right* check.

---

## §2 — The rules

### R1 · CALL THE PRODUCTION ENTRY POINT. Do not re-assemble the chain.
If you are measuring "the height layer", import what `siteDispatch.ts` imports and call it the way
`siteDispatch.ts` calls it — including every tier, fallback and restriction. A probe that rebuilds
the chain is measuring **your model of the chain**. *(Artefact #4.)*

### R2 · VALIDATE AGAINST A SOURCE THAT CANNOT SHARE THE BUG.
A second variant of the same algorithm is not an oracle. `probe-l586-oracle-65.mts` is the reference
pattern: **grid rasterisation** — a completely different algorithm — against which the offset was
checked. It caught a 12× error that every aggregate approved of. *(Artefacts #1, #3.)*

### R3 · STATE THE INVARIANT, THEN ASK WHETHER IT IS THE RIGHT ONE.
"Inset not larger than the parcel" and "inset not larger than the true erosion" are different
claims, and only the second was the safety property. **Write down what the invariant would fail to
catch** before you trust it holding. *(Artefact #3.)*

### R4 · NEVER LET AN AGGREGATE STAND ALONE. SPOT-CHECK NAMED INDIVIDUALS.
Report the worst individual cases by name alongside the rate. A 92.3% aggregate coexisted with one
block wrong by 12×. *(All four.)*

### R5 · COUNT FAILURES SEPARATELY FROM OUTCOMES.
Network errors, refusals and genuine empties are three different facts. Folding any of them into a
rate makes it a lie. *(§CONTEXT-DATA-HONESTY, L-422/457/467/469/579.)*

### R6 · A REPLICA MUST SELF-CHECK, AND MUST BE RETIRED WHEN IT DRIFTS.
If a probe must replicate production logic, it must **cross-check itself against the real function
and refuse to report on disagreement**. `probe-l581-failure-site.mts` did exactly this and correctly
refused twice today. ⚠ **But a replica that refuses is telling you to DELETE it, not to resync it** —
it now replicates an algorithm that no longer exists.

### R7 · ASK WHAT YOUR CHECK CANNOT SEE.
The context-tile bake asserted file size, PMTiles magic bytes and a range probe, passed — and a
third of the buildings were missing. **Enumerate the failure modes the check is blind to.**

### R8 · DO NOT QUOTE A FIGURE YOU HAVE NOT PERSONALLY RE-MEASURED.
Three figures were published, believed and retracted in one day: 15.7% end-to-end, the 92.3% clamp
result, and 78.3% height coverage.

---

## §3 — Canonical probes (use these; the others are superseded)

| measures | canonical | superseded |
|---|---|---|
| layer 6 geometry vs an independent oracle | `probe-l586-oracle-65.mts` | `probe-l581-failure-site.mts` ⚠ **RETIRE** |
| layer 6, prior code, for before/after | `probe-l586-oracle-65-BEFORE.mts` | — |
| layer 5 height, **true production chain** | `probe-l586-layer5-diagnose.mts` | `probe-l576-layer5.mts` ⚠ wrong chain |
| block dissolve acceptance | `probe-dissolve-accept.mts` | — |
| dissolve vs published cadastral area | `probe-l585-closure-and-oracle.mts` | — |
| clau distribution / coverage | `probe-bcn-clau-distribution.mts` | — |

⚠ **Coverage denominators are not interchangeable.** `32.7%` is of ALL private buildable land;
`42.3%` is of land a rule pack can ever govern (excludes clau 18, which is plan-defined). **Say which
one you mean, every time.**

---

## §4 — The checklist, for the next person

Before publishing any number from a probe:

- [ ] Does it call the **production** entry point, or rebuild the chain? *(R1)*
- [ ] Is there an **independent** oracle — a different algorithm, not a variant? *(R2)*
- [ ] What exactly is the invariant, and **what would it fail to catch**? *(R3)*
- [ ] Are the worst **named individuals** reported next to the rate? *(R4)*
- [ ] Are errors counted **separately** from outcomes? *(R5)*
- [ ] If it replicates logic, does it **self-check and refuse** on drift? *(R6)*
- [ ] What can this check **not** see? *(R7)*
- [ ] Which **denominator** is this, and did I say so? *(§3)*
