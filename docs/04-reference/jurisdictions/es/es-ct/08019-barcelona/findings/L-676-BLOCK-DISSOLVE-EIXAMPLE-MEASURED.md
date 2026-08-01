# L-676 — Block dissolve on real Eixample parcels: MEASURED, and the row's own premise is REFUTED

**CLOSURE-REGISTER row 4 · closed 2026-08-01 · bucket A+B · was P1**

> **Tool:** `tools/block-dissolve-audit/audit.mts` (committed, re-runnable, seeded).
> `npx tsx tools/block-dissolve-audit/audit.mts [--city Barcelona|Barcelona-old|all] [--json]`
>
> **Corpus:** `scratchpad/dissolve-sample.json` — git-tracked, frozen 2026-07-21 from the live
> Catastro INSPIRE WFS. **108 complete Eixample/Dreta *manzanas*, 1 917 parcels**, each carrying its
> **published cadastral `areaM2`** (the INSPIRE `areaValue`, i.e. the OFFICIAL registry area — a
> number the dissolve never sees). Ciutat Vella measured alongside as a second Barcelona sample:
> **77 manzanas, 960 parcels.**
>
> The tool imports the PRODUCTION dissolve
> (`packages/site-parcel-data/src/geometry/blockRing.ts` — the same function
> `apps/editor/src/ui/site/siteDispatch.ts:4306` calls), so **it cannot disagree with the code path
> it measures.**

---

## THE HEADLINE — and it inverts the row

The register ranked row 4 second overall on the premise that it is
***"the only remaining item that can make an ALREADY-PUBLISHED number wrong"***.

> **Measured, that premise is FALSE, and it is false for a structural reason, not a lucky one.**
> A dissolve FAILURE cannot make a published number wrong: it reaches
> `refuseConstructionIncomplete('block-dissolve-refused')` (`siteDispatch.ts:4307`) and publishes
> **no envelope at all**. The ONLY channel that can publish a wrong number is a dissolve that
> **SUCCEEDS on the wrong ring** — and against the published cadastral areas, over both Barcelona
> samples, **that channel is measured at ZERO.**

**SIGN: UNDER-STATES.** Omitting the refused blocks removes envelopes; it never inflates one.

**This is the FOURTH time this register has had to record the same lesson** — after tribunes (11),
the Art. 238 residuals (12) and 12A. **Establish the SIGN before ranking the severity.** Ranking by
how alarming a gap sounds inverts the queue.

---

## 1 — THE MEASUREMENT

| | Eixample (`Barcelona`) | Ciutat Vella (`Barcelona-old`) |
|---|---:|---:|
| blocks measured | **108** | 77 |
| parcels | 1 917 | 960 |
| **dissolved** | **104 (96.3 %)** | **74 (96.1 %)** |
| — exact path | 93 | 68 |
| — t-junction-split path (ADR-0274) | 11 | 6 |
| **refused** | **4 (3.7 %)** | 3 (3.9 %) |

**The ≥100-block criterion the row wrote for itself is met at 108**, and Ciutat Vella is a second,
independent Barcelona sample that lands within 0.2 pp of it.

### Failure reason — the dissolve's own code

**Every** Barcelona failure, in both samples, is `open-or-disjoint`. Not one is
`self-intersecting`, `malformed-parcel` or `non-manifold`.

---

## 2 — CLUSTERED OR RANDOM? — answered by MECHANISM, because the statistic has no power

The row's test is *"clustered ⇒ engineering bug; random ⇒ robustness."*

⚠ **The tool refuses to answer this with a spatial statistic, and says so in its own output.** With
k = 4 failures out of n = 108 a permutation test has negligible power against anything but an
extreme cluster, so reporting *"not clustered, p > 0.05"* would be **absence of a detection dressed
up as detection of an absence** — the §CONTEXT-DATA-HONESTY collapse in statistical clothing. The
tool prints `INSUFFICIENT-POWER` below k = 8 and computes no p-value.

**What it does instead is a CENSUS of the failures**, which has no power problem: each failing block
is re-dissolved across a tolerance ladder (0.10 → 1.00 m) and, if it closes at no tolerance,
tested for spatial disjointness. That decides *what a fix would have to change*:

| mechanism | Eixample | Ciutat Vella | is it a PRYZM engineering bug? |
|---|---:|---:|---|
| **`tolerance-tail`** — closes at a WIDER tolerance | **0** | **0** | would be **yes** |
| **`disjoint-blocks-under-one-prefix`** — ≥2 spatially separated groups | **3** | 0 | **no** — the 5-char refcat prefix collected two REAL blocks. There is no single ring to produce; refusing is the correct answer |
| **`structural-input-defect`** — closes at no tolerance ≤ 1.0 m, one connected mass | **1** | 3 | **no** — a defect in the PUBLISHED tiling |
| `non-manifold-input` / `malformed-input` | 0 | 0 | no |

### ⭐ The decisive number is the ZERO

**Not one Barcelona failure is a `tolerance-tail` case.** Every one of them closes at NO tolerance
up to 1.0 m — ten times the shipped `TJUNCTION_SPLIT_TOLERANCE_M`, and far past the point where
`SPAIN-DISSOLVE-FAILURE-TAXONOMY.md` measured the success curve *falling* (over-splitting starts
destroying rings at 0.30 m). ⇒ **The shipped tolerance is not the binding constraint in Barcelona,
and no tolerance change could be.** The residual is a property of the INPUT, not of our geometry.

**Verdict: neither "engineering bug" nor "robustness".** The failures are **clustered on a
mechanism** — 6 of 7 across both samples share `open-or-disjoint`-with-no-tolerance-recovery — but
that mechanism sits in the **cadastre and in the block-identity heuristic**, not in the dissolve.

### The failing blocks, named

| sample | manzana | parcels | reason | mechanism | closes at | at |
|---|---|---:|---|---|---|---|
| Eixample | `03192` | 13 | open-or-disjoint | structural-input-defect | NEVER (≤ 1.0 m) | 41.38450, 2.16553 |
| Eixample | `06276` | 23 | open-or-disjoint | disjoint-blocks-under-one-prefix | NEVER | 41.39169, 2.16894 |
| Eixample | `93368` | 9 | open-or-disjoint | disjoint-blocks-under-one-prefix | NEVER | 41.39935, 2.15336 |
| Eixample | `97344` | 7 | open-or-disjoint | disjoint-blocks-under-one-prefix | NEVER | 41.39834, 2.15822 |
| Ciutat Vella | `06105` | 23 | open-or-disjoint | structural-input-defect | NEVER | 41.37601, 2.17054 |
| Ciutat Vella | `13195` | 19 | open-or-disjoint | structural-input-defect | NEVER | 41.38496, 2.17825 |
| Ciutat Vella | `14194` | 13 | open-or-disjoint | structural-input-defect | NEVER | 41.38483, 2.17915 |

⚠ **The 3 `disjoint-blocks-under-one-prefix` cases confirm a KNOWN, ALREADY-DOCUMENTED limit**,
not a new one: `SPAIN-DISSOLVE-FAILURE-TAXONOMY.md` records that *"the 5-char refcat prefix remains
an observed pattern, not a documented guarantee"*. **The manzana-prefix heuristic is where a fix
would go, and it is a block-IDENTITY problem, not a block-GEOMETRY one.**

---

## 3 — THE OVER-STATEMENT CHANNEL: the area oracle

*"It closed"* is not *"it closed correctly."* Every successful ring is compared with **Σ of the
published cadastral parcel areas**, which the dissolve never sees. A ring that closed around the
wrong loop, or swallowed a neighbour, misses that by **tens of percent**.

| | n | p50 | p90 | p95 | **max** | **alarms (> 2 %)** |
|---|---:|---:|---:|---:|---:|---:|
| **Eixample** | 104 | 0.15 % | 0.21 % | 0.23 % | **0.34 %** | **0** |
| **Ciutat Vella** | 74 | 0.15 % | 0.24 % | 0.32 % | **0.84 %** | **0** |

> **The worst ring in 178 real Barcelona blocks is 0.34 % / 0.84 % off the official registry area.**
> The 2 % alarm threshold sits in the empty space between the honest population (~0.15 %) and a
> wrong-loop failure (tens of %); nothing comes near it. **⇒ No already-published Barcelona number
> is wrong through this channel.**

### ⚠⚠ §NET-OF-VOIDS — a measurement bug THIS TOOL MADE FIRST, recorded so it is not remade

The oracle's first draft compared the OUTER ring with Σ parcel areas and **ignored
`BlockRingResult.voids`**. A block with a real interior courtyard that is not itself a parcel then
reads as an over-statement of exactly the courtyard's size.

**Ciutat Vella `12215` was flagged at 2.34 % by that draft** — and is at **0.20 %** once its
**101.9 m² courtyard** is subtracted. So the tool's own first verdict for Ciutat Vella was
`OVER-STATES`, **and it was an artefact of the INSTRUMENT, not a defect in the dissolve.** The
comparison is now `|outer| − Σ|voids|` vs Σ published areas (6 Eixample and 5 Ciutat Vella rings
carry a void).

⚠ **`scratchpad/probe-dissolve-accept.mts` still has this defect** and its published area figures
are therefore mildly pessimistic. Superseded by this tool; not re-run.

**The transferable lesson, one level down from the register's own:** *establish the sign before
ranking the severity — including the sign your own instrument reports.*

---

## 4 — WHAT THE AUDIT FOUND THAT NOBODY HAD FILED

**One Eixample ring succeeds and is then hard-rejected downstream for being LARGE.**

`manzana 00329` dissolves cleanly on the **exact** path to **326 vertices**, breaching the
**C19 §7.3** 200-vertex hard reject. The ring is *correct*; it is refused for its size. This is
**already recorded as C19 KV-3 (L-539) with status OPEN** and is not a new defect — but this is the
first time it has been attributed to a **named Barcelona block**.

**SIGN: UNDER-STATES** (the block gets no envelope). ⚠ **It MUST NOT be closed by silently
simplifying a ring that feeds a compliance number** (C19 KV-3's own words). Left open, in C19, where
it belongs — it is a contract-budget question, not a Barcelona one.

---

## 5 — WHAT THIS DOES **NOT** SHOW

- **It does not cover all of Barcelona.** The corpus is a **census of every complete manzana inside
  two sampled bboxes** (Eixample/Dreta and Ciutat Vella). For the clustered-vs-random question a
  census is STRONGER than a random draw — a random 100 could miss a cluster entirely, a census
  inside a bbox sees every member of any cluster it contains. But it is **geographically bounded**
  and cannot rule out a cluster in an unsampled Eixample bbox. Extending it is
  `scratchpad/probe-dissolve-fetch.mts` with new bboxes, then re-running this tool.
- **It does not validate the manzana prefix** — it MEASURES its failure rate at 3/108 in the
  Eixample.
- **The oracle is Σ of published parcel areas.** It catches a wrong loop or a swallowed neighbour.
  It cannot catch an error that preserves area.
- **It says nothing about the RULES.** A block ring is a geometric fact; PGM Art. 242.2 is law.

---

## 6 — DECISION

**Row 4 CLOSES.** The measurement the row demanded exists, is committed, is re-runnable, and
answers every question the row asked:

| the row asked | measured |
|---|---|
| ≥100 random Eixample blocks | **108** (+77 Ciutat Vella) |
| success / failure | **104 / 4 = 96.3 %** |
| failure REASON | **4/4 `open-or-disjoint`** |
| clustered or random? | **clustered on a MECHANISM that is not ours** — 0 tolerance-tail, 3 prefix-identity, 1 published-tiling |
| *"56 % may not be realisable"* | **it is** — the geometry layer delivers 96.3 %, and the ENVELOPE ceiling arithmetic never assumed more |
| *"can make an ALREADY-PUBLISHED number wrong"* | **REFUTED** — 0 area-oracle alarms in 178 blocks; failures publish nothing |

**Alternatives rejected:**

1. **Raise `TJUNCTION_SPLIT_TOLERANCE_M`.** Refused — **0** Barcelona failures are tolerance-tail
   cases, so it would buy nothing, and the taxonomy measured the curve already flat at 0.10 and
   *falling* by 0.30. A tolerance is only defensible on a plateau.
2. **Repair `non-manifold` / force a ring out of a disjoint pair.** Refused — that converts a
   correct refusal into a plausible-but-wrong ring, which is strictly worse than no answer (C58
   §1.1). Three of the four Eixample failures are TWO REAL BLOCKS; there is no single correct ring.
3. **Fix the 5-char manzana prefix now.** Deferred, not refused — it is the one real lever
   (3/108 in the Eixample) but it is a **shared, cross-city** identity heuristic in
   `server/parcelZoningProxy.js` (`manzanaPrefix`), and Madrid/Córdoba/València are live on the same
   path. It must be measured against live Catastro across cities before it lands — the same
   discipline `8e590846` was held to. Sized, named, and **UNDER-stating** while it waits.
4. **Close row 4 on the existing `SPAIN-DISSOLVE-FAILURE-TAXONOMY.md` numbers.** Refused — that
   document measures the RATE, and the row turns on the SIGN, which it never measured.

---

**Cross-refs:** `CLOSURE-REGISTER.md` row 4 · `SPAIN-DISSOLVE-FAILURE-TAXONOMY.md` (L-539, the
rate + the taxonomy this builds on) · `ADR-0274` (tolerant dissolve) · `ADR-0271` (Art. 242.2 depth,
the consumer) · C19 §7.3 + KV-3 (the vertex budget) · C58 §1.1/§1.7a ·
`GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` §4.
