# Barcelona — the reasoning record

**The single place where every Barcelona decision, measurement, retraction and open question is
written down.** Created 2026-07-22, the day end-to-end resolution went **5.8% → 46.9%**.

> **Why this file exists.** The founder asked *"where are all those reports documented?"* and the
> honest answer was: **not well enough.** L-585→L-593 had reached the audit; L-594 onward existed
> **only in git commit messages**, and the agent reports themselves lived in **temp files that will
> be deleted**. A commit message is not a tracking system — no status, no owner, not queryable — and
> a deleted temp file is not a record at all. **Everything substantive now lives here.**

---
---

# PART 1 — ⭐ WHAT THE NUMBER MEANS FOR A USER

**This is the section to read if you read nothing else.** "46.9%" is a *layer* metric and it is
**not** what a user experiences.

Measured over **1,014 sampled points inside Barcelona (INE 08019)**:

| What the user clicks | share of ALL clicks | what PRYZM says |
|---|---|---|
| **Public systems land** — parks, roads, rail, port, *equipaments* | **72.9%** | *"No envelope applies here"*, **cited**. ✅ **A correct answer** |
| Private land, **full envelope** | **12.7%** | depth · height · storeys · footprint · GFA · dwellings, **each with its article** |
| Private land, **clau 18** (plan-defined) | **6.1%** | *"Your parcel's envelope is set by its own approved plan"*, cited. ✅ **Correct** |
| Private land, **zone not yet encoded** | **6.5%** | *"Zone rules coming"* — honest gap. **22a is most of this** |
| Private land, rule exists but a layer failed | **1.8%** | *"Couldn't complete"*, naming the missing input |

### ⇒ **91.7% of clicks get a TRUE answer. 12.7% get a full buildable envelope.**

**Both numbers are real and neither should be quoted alone.**

- ⚠ **Most of Barcelona is not private buildable land.** 72.9% of the city is systems land, and
  *"no envelope applies"* there is **the correct legal answer**, not a failure. A competitor drawing
  a massing on a park is wrong; we are right, and quietly so.
- ⚠ **12.7% is the honest "it worked fully" number** and it is low. It is low because **27.1% of the
  city is private buildable at all**, and we cover 46.9% of that.
- ⚠ **Only 8.3% of clicks are a shortfall we own** (6.5% missing zone + 1.8% incomplete). Everything
  else is either an answer or a correct refusal.

### What "a full envelope" actually contains

Buildable **depth** (constructed per Art. 242.2, not looked up), **height** and **storeys** (from the
street-width table for the parcel's own clau), **footprint**, **GFA**, **max dwellings**, per-storey
breakdown, and the parcel's own dimensions — **every one with the article that produced it**, plus a
`DerivationTrace` and a confidence tier. **Nothing is `certified`.**

---
---

# PART 2 — WHERE THE NUMBERS COME FROM

```
end-to-end  =  clau coverage  ×  layers 1–3  ×  layer 5 (height)  ×  layer 6 (geometry)
            =      53.5%      ×     94.7%    ×      94.0%         ×      98.5%
            =      46.9%
```

**Denominators are not interchangeable — say which you mean, every time:**

| | value | meaning |
|---|---|---|
| coverage of **all private buildable** land | **53.5%** | what the user meets |
| coverage of **packable** land (excl. clau 18) | **69.0%** | what measures our progress |
| **full envelope, of ALL clicks** | **12.7%** | the honest product number |
| **true-or-correct answer, of all clicks** | **91.7%** | the honesty number |

### The day's movement

| | end-to-end | what moved it |
|---|---|---|
| morning | **5.8%** | — |
| L-581 clamp | 6.5% | +0.7 |
| 13b pack | 8.8% | +2.3 |
| **L-586 geometry rewrite** | 20.9% | **+12.1** |
| layer-5 dead allow-list entries | 24.8% | +3.9 |
| dissolve (11 folded rings → 0) | 28.7% | +3.9 |
| 20a family | 38.6% | +9.9 |
| **clau 12** | **46.9%** | +8.3 |
| *22a solver (agent running)* | *~62.2%* | *+15.3* |

---
---

# PART 3 — EVERY FINDING OF THE DAY

## 3.1 — The three over-statements (all in C58 §1.4's forbidden direction)

**Over-stating tells a client they may build MORE than the law allows.** Three were found in one day.

1. **L-586 — the miter offset over-stated buildable area on 31 of 65 real blocks, worst by 65%.**
   Every soundness gate was blind to it because they compared the inset to the **parcel**, never to
   the **true erosion** — a fold can inflate area 65% and still sit inside the parcel. Fixed by
   replacing the miter with the **capsule-union boundary**; 0/65 over-statements after.
   ⚠ **My own verification probe inherited the same blind spot** and called "not larger than the
   parcel" a conservatism check. **The invariant was wrong, not merely unmet.**
2. **L-591 — street width used the MEDIAN of ray samples; Art. 238.1.b/c requires the MINIMUM.**
   `median ≥ min` ⇒ wider street ⇒ higher band ⇒ over-stated height.
3. **L-594 — `minDepth_m` was 12 m; Art. 242.4 says 11 m.** A floor raises the answer.

## 3.2 — ⚠⚠ Four probes measured something other than what they named

**A probe defect is worse than a product defect: it survives review by producing a plausible number.**

| probe | claimed | actually measured |
|---|---|---|
| layer-6 coverage | end-to-end 15.7% | **tautological** — computed the volume, compared it to itself |
| context-tile twin matcher | 47% of buildings "missing" | **density, not identity** (10 m-spaced Eixample buildings) |
| L-581 conservatism check | "the clamp is conservative" | **the wrong invariant** (parcel, not erosion) |
| layer-5 height rate | 78.3% | **not the production chain** — skipped tier 2 entirely; diverged on 60 of 83 parcels. True rate **92.8%** |

**Shared shape: the probe RE-IMPLEMENTED what production does instead of CALLING it.** Rules in
`docs/04-reference/standards/PROBE-DISCIPLINE.md`.

⚠ **And I then built a fifth**: the debt gate used ESLint's `--format unix`, which no longer exists —
the command errors, emits no violations, every counter read 0, and **the gate passed while measuring
nothing** on a repo with 126 violations. **A false pass is worse than no gate.**

## 3.3 — The sourcing breakthrough

**Three research rounds concluded, at 98% confidence, that the Art. 340.1 and 350.c tables were
*"missing pixels"* recoverable only from a printed volume. Both came out of a public PDF in five
minutes.**

The document is a **text PDF, not a scan** — every glyph carries an `(x, y)`. Naive `extract_text()`
concatenates in stream order and the columns dissolve; **the positions were never lost, they were
never read.** The 98% measured agreement between mirrors **all descended from one digital source**.

⇒ **"We are missing pixels" was a statement about the TOOL, not the DOCUMENT.**

The PDF is now committed: `PGM-NNUU-metropolitana.pdf` (512 pp). Recovered from it: **Art. 340.1**
(20a indices), **Art. 350.2.c** (22a heights — *three* bands, open-ended top), **Art. 339.2** (the
*estudi de detall* cap), **Art. 238** (the definition of *amplada de vial*), **Art. 242.4** (the 11 m
floor), **Art. 306** (clau 18), and the **Barcelona-exclusive article set** (p. 185, DOGC 4277).

⚠ **clau 12's table needed a SECOND decoding layer**: the DOGC annexes use Identity-H subset fonts
with broken `ToUnicode`, so pypdf renders them ASCII-shifted by +29 and drops digits into raw GIDs.

## 3.4 — The retractions

| claimed | reality |
|---|---|
| "the ring drains below 3 lines" (L-581's documented mechanism) | that gate fires **zero** times |
| the clamp gives **92.3%** sound | artefact of over-erosion; real figure 55.4% offline |
| "the dissolve blocks Madrid/Córdoba" | dissolve is **91.4%** nationally |
| "L-581 unblocks Madrid/Córdoba" | **structurally impossible** — not in the import closure |
| "we have no terrain" | we sample Cesium World Terrain; the defect is narrower |
| "clau 12 does not apply to Barcelona" | it governs the **annexed** nuclis antics — ~10% of the city |
| end-to-end **15.7%** | tautological probe |
| height coverage **78.3%** | wrong chain; true 92.8% |

⚠ **Several were mine, made the same day.** Each was caught by an **independent** check, never by
the thing that produced it.

## 3.5 — Clau-by-clau state

| clau | share of private land | state |
|---|---|---|
| **13a / 13E** | 24.0% | ✅ packed (Art. 242 via 326; Art. 327) |
| **13b** | 8.7% | ✅ packed (Art. 328). ⚠ Registering it without touching `siteDispatch` would have given it **Art. 327's ladder under Art. 327's citation** — 20.75 m instead of 16.70 on a 25 m street |
| **12** | 9.5% | ✅ packed. **Art. 320.3a (DOGC 4893, 2007)**, four bands at **8/12/15** — differing from Art. 328's 8/11/15, so between 11 and 12 m the two disagree by a storey. Depth = the same solver at ratio **0.40** |
| **20a** family (10 subzones) | 11.3% | ✅ packed. **Fits `kind:'setback'` natively** — the first clau where C58's original model is the ordinance's own shape |
| **22a** | 17.5% | 🔴 **sourced, deliberately NOT registered** — see §3.6 |
| **18** | 22.5% | ⏸ **correct refusal** — Art. 306 delegates to a per-site plan |
| **12b** | 1.8% | ⏸ refused — height is the *mean of existing neighbours*, an input we do not hold |
| bare **20a** | 1.8% | ⏸ refused — names the zone, not the subzone (the ten span 0,25–1,50) |

## 3.6 — 🔴 The largest open item: 22a's two-tier envelope

**17.5% of private buildable land, fully sourced, worth zero.** Art. 350.2 describes a **two-tier
solid** — a **parcel**-scoped podium (≤90% of the parcel; 5 m in the block interior) **plus** a
**block**-scoped tower confined to a band equal to 70% *of the block*. `GeometricRule` has four kinds,
none coverage-driven or per-storey; `BuildableEnvelope` carries **one prism**.

**Registering it would print a 100% envelope beside the 90% cap read from the same article** —
strictly worse than today's refusal. The near-miss (`block-derived-alignment` + `interiorFreeRatio`)
was rejected because the schema requires depth bounds Art. 350 never states (supplying Art. 242's
would be the L-526 error verbatim), because it drops the podium, and because 350.2.b is an
**equality** where 242.2 is a **minimum**.

⇒ **A schema + solver gap, not research. Worth ~+15 points — more than 20a and clau 12 combined.**
Guarded by `BCN_22A_ENVELOPE_BLOCKER` with a test that fails loudly if anyone shortcuts it.

## 3.7 — Open, unverified, deliberately not acted on

- **L-597 — DOGC 4893 may also supersede Arts. 327 and 328**, making our 13a/13b height tables
  pre-2007 values wrong for 08019 (Art. 327 → 25,75 m; we ship 23,80). Both **under-state**, the safe
  direction. ⚠ **One agent report is not enough for a legal number — L-594 proved that hours
  earlier.** Verify against pp. 274–277 first.
- **Art. 238's three unimplemented clauses**: the *tram*-between-cross-streets partition, the
  uniform-storey averaging (238.1.d), and *real afectació a l'ús públic* (238.2).
- **Art. 255's slope reduction** for 20a (30–50% → −20%, >100% → *inedificable*) — unmodellable
  without a DTM, and Barcelona's 20a fabric is **disproportionately hillside**. Over-states on slopes.
- **The rasant datum (L-584)** — one terrain sample at the block centroid, while the ordinance
  measures from the *rasant* at the façade. **Lowers no metric**, which is why it is named here.

---
---

# PART 4 — HOW WE WORK, LEARNED THE EXPENSIVE WAY

1. **Never accept an aggregate as proof of a geometry change.** Validate against a source that
   **cannot share the bug**. A 92.3% aggregate coexisted with one block wrong by **12×**.
2. **State the invariant, then ask whether it is the RIGHT one.** "Not larger than the parcel" and
   "not larger than the true erosion" are different claims; only the second was the safety property.
3. **When two sources disagree about a legal number, READ THE LAW** — do not pick the more confident
   sentence. That is exactly how the 12 m depth floor shipped.
4. **A failure and an empty result are the same VALUE and must never be the same ANSWER.**
5. **Grep the codebase before commissioning research.** Clau 18 was already solved in our own rule
   pack, with Art. 306 cited — after three research rounds re-deriving it.
6. **Probe the code before writing a defect down**, especially when it feels obviously true.
7. **A replica that refuses is telling you to DELETE it, not resync it.**
8. **Agent worktrees branch at different bases** — copy pack files, **re-apply shared wiring by
   hand**. Copying it wholesale reverted 22a and reddened five tests.

---

## Where else to look

| | |
|---|---|
| status per jurisdiction, phases | `../../GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` |
| how the system works, what a city costs | `../../SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md` |
| issue log L-NN | `../../ISSUE-LOG.md` (L-576 → L-598) |
| probe rules | `../../PROBE-DISCIPLINE.md` |
| the primary ordinance | `./PGM-NNUU-metropolitana.pdf` |
| what the PDF yielded | `./L-590-NNUU-PRIMARY-SOURCE-RECOVERED.md` |
| legal parameters + confidence tiers | `./L-583-LEGAL-PARAMETERS-SOURCED.md` |
| ⚠ read before assuming a dataset exists | `./BARCELONA-DATA-PIPELINE.md` |

**Maintenance rule: edit this file in place. Never write a derivative `*-AUDIT.md`.** Do not quote a
figure here you have not personally re-measured — three were published, believed and retracted today.
