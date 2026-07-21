# ADR-0274 — The tolerant block dissolve: repair a cadastral tiling by SPLITTING at the neighbour's own published vertex

**Status:** **ACCEPTED** · implemented and shipped (v266) as `§DISSOLVE-TJUNCTION-SPLIT` in
`packages/site-parcel-data/src/geometry/blockRing.ts`.
**Date:** 2026-07-21 · **Audit:** **L-539** (this decision); **L-535** (the probe that exposed the
blocker); **L-537** (the at-scale 64 % baseline this reproduces).
**Extends:** ADR-0271 (which requires a block ring and named its source as P4 "real work").
**Contracts:** **C57 §1.11 / §1.12** (this ADR is the decision those invariants record), C58
§1.1/§1.2/§1.4, C19 §7.3, C23 §11.1.
**Evidence:** `docs/04-reference/spain/SPAIN-DISSOLVE-FAILURE-TAXONOMY.md` ·
`docs/04-reference/spain/SPAIN-CADASTRAL-DISSOLVE-PROBE.md`.

> **ADR number note.** `ADR-0273` is *reserved* by
> `BARCELONA-COMPLETE-COVERAGE-PLAN.md` §3.9/Phase 3 and audit row L-538 for the **nucli-antic
> block-occupation rule kind**, which is not yet written. It is deliberately not taken here.

---

## 1. Context — one binding constraint under everything

`dissolveParcelsToBlockRing` cancels shared edges between the parcels of a *manzana* and chains the
survivors into one closed ring. It required a **CONFORMING** tiling: neighbours must share whole
edges vertex-for-vertex. Where they do not, unmatched fragments survive, the chain fails to close,
and the function returns `degenerate` — honestly, and with no envelope.

That refusal is load-bearing for the whole compliance stack: **no ring ⇒ no
*profunditat edificable* (ADR-0271) ⇒ no street-width measurement (ADR-0275) ⇒ no
*alçada reguladora* ⇒ a 0.5 m footprint slab.**

**How big the problem was, measured — twice, at two scales:**

| Sample | Result |
|---|---|
| 9 real addresses, 3 cities (L-535) | Barcelona **2/2**, Madrid **2/4**, Córdoba **0/3** |
| 1,437 candidate manzanas, 5 cities (L-537, incidental) | **926 dissolved = 64 %** |
| **956 COMPLETE manzanas, 5 cities (L-539, the gate)** | **607 = 63.5 %** — and Barcelona itself **81.5 %**, not the 100 % the 2-of-2 sample implied |

*A 2-of-2 sample cannot distinguish 100 % from 80 %.* Two independently-drawn samples reproducing
63.5 % and 64 % is what makes the baseline a measurement rather than an impression.

---

## 2. The decision, and the two things it refuses to do

**Before edge cancellation, split an edge at any EXISTING vertex lying within
`TJUNCTION_SPLIT_TOLERANCE_M = 0.10 m` of its interior. The exact pass runs FIRST and its result is
returned unchanged whenever it succeeds.**

Two refusals are as much of the decision as the split itself:

1. **No vertex is welded.** The brief this work started from — and `blockRing.ts`'s own header —
   expected near-coincident vertices to snap together. **There are none.** Measured over 250,646
   real parcel edges: **not one is shorter than 0.0835 m**, exactly one 1e-6° longitude step; and
   **0 of 177** break-vertex nearest-neighbour gaps fall below 0.05 m (p5 = 0.111 m, p50 = 0.784 m).
   A weld at ε ≤ 0.05 m was measured to move **0.0000 m** and change **0** outcomes. It is not
   implemented, and adding it would be adding a tunable that does nothing.
2. **No vertex is constructed or moved.** The split point is *the neighbour's own published
   vertex*. This is why a repaired ring may still feed a compliance number: the exactness guarantee
   is intact. What is given up is only that the ring may follow `p → r → q` instead of the straight
   `p → q`, departing by ≤ 0.10 m — **below the source's own 0.111 m coordinate resolution**.
   Measured over 267 repaired rings: max offset p50 **0.042 m**, p90 0.072 m, worst 0.096 m.

## 3. Why the cause is a publication quantum, not dirty data

Catastro INSPIRE GML publishes WGS84 coordinates rounded to **1e-6°** = **0.083 m east / 0.111 m
north** at Iberian latitudes (12,601 sampled vertices; 6 dp dominant). Two neighbours can therefore
record the SAME boundary with different vertex **counts**: A stores `p → q`, B stores `p → r → q`.
Nothing cancels; the survivors form the block outline **plus** the degenerate triangle `p-r-q`, the
chain finds two loops, and it refuses.

The failure distribution is the proof, over 349 failing manzanas:

| class | n | % |
|---|---|---|
| several closed loops (every vertex degree 2) | 233 | **66.8 %** |
| T-junction only | 82 | 23.5 % |
| T-junction + a nearby unmatched vertex | 28 | 8.0 % |
| genuine gap / overlap, non-manifold, near-coincident-only | 6 | 1.8 % |

…and **94.4 %** of the multi-loop cases are **NESTED**, with the extra loops enclosing **~0 %** of
the outer area (p95 < 0.05 %). They are not courtyards; they are hair-thin triangles — exactly what
an unmatched T-junction produces. **≈ 90 % of all failures are this one defect.**

## 4. Why 0.10 m — three independent bounds landing together

`TJUNCTION_SPLIT_TOLERANCE_M = 0.1` (`blockRing.ts:134`). It is derived, not tuned:

1. **The publisher's own quantum (upper bound).** 1e-6° = **0.111 m north**. At or below it, the
   repair *cannot introduce a positional error the input does not already contain*. Above it, we
   would be asserting more precision than the source has.
2. **The empirical valley (both sides).** Over 1,057 candidate T-junction incidences surveyed to a
   deliberately over-wide 1.0 m radius, the defect population runs to ~0.075 m, the histogram then
   **collapses ten-fold across 0.1–0.3 m**, and above 0.3 m real unrelated geometry resumes. The
   valley floor is the boundary between "the same point, rounded differently" and "a different
   point".
3. **The success plateau.** 0.05 → 81.5 %, **0.10 → 91.6 %**, 0.20 → 93.4 %, 0.30 → **93.1 %
   (falling — over-splitting starts destroying rings)**. The curve is already flat at 0.10. The
   extra 1.8 points at 0.20 would double the deviation and breach bound 1, so it is refused.

> **A tolerance is only defensible on a plateau; on a slope it is a tuned number.**

**Cadastral positional accuracy is deliberately NOT the figure used**, though it was the obvious
candidate (Catastro's urban cartography derives from 1:500–1:1000 mapping with decimetric absolute
accuracy). Absolute accuracy is the wrong quantity: both sides of a shared boundary come from the
*same* digitisation, so what matters is the RELATIVE displacement between two representations of
one line, and the only process introducing it is the publication rounding. The measured
distributions — a hard 0.0835 m edge-length floor, a hard 0.05 m vertex-gap floor — show the grid
and nothing else.

## 5. Why the exact pass must win

Applying the repair unconditionally scores marginally better on the headline rate. It was measured
and **declined**: doing so **would have altered 137 of the 607 rings that already existed** — 137
silently moved *profunditats edificables* on parcels that were already working. Running the exact
pass first and returning it untouched makes "no regression" a property of the construction rather
than a hope. Verified on all 607: **0 rings changed, 0 lost.**

Three further refusals, for the same reason:
- **`non-manifold` and `malformed-parcel` are never repaired.** Those are wrong inputs, not
  digitisation artefacts; splitting edges would only make a fiction closable.
- **An edge shorter than 2× the tolerance can never be split**, which stops the tolerance
  reshaping the smallest features in the data.
- **A mis-split degrades to a REFUSAL, never to a plausible-but-wrong ring** — a fragment that
  should not exist simply fails to cancel.

## 6. Consequences

**Measured result** (same 956 manzanas, production code, before → after):

| city / area | n | before | after |
|---|---|---|---|
| Barcelona (Eixample) | 108 | 81.5 % | **96.3 %** |
| Barcelona (Ciutat Vella) | 77 | 81.8 % | **93.5 %** |
| Madrid (Salamanca/Chamberí) | 95 | 75.8 % | **92.6 %** |
| Madrid (centro) | 101 | 77.2 % | **99.0 %** |
| Córdoba | 163 | 44.2 % | **90.8 %** (L-535 measured 0/3) |
| Valencia | 220 | 72.7 % | **92.7 %** |
| Sevilla | 192 | 38.5 % | **82.3 %** |
| **ALL** | **956** | **63.5 %** | **91.4 %** |

**The independent check — "it closed" is not "it closed correctly".** Ring area against the **sum
of published cadastral parcel areas**, a number the dissolve never sees: repaired rings p50
**0.13 %** / p95 0.24 %, versus exact rings p50 0.15 % / p95 0.28 %. **The repaired rings agree
with the published areas slightly BETTER than the exact ones.** A ring that had closed around the
wrong loop, or swallowed a neighbour, would miss by tens of percent. Closure alone could never
establish this.

**Provenance obligation.** Every result carries `quality { path, splitCount, maxOffset_m,
tolerance_m }` so a consumer can tier the ring rather than infer it (C23 §11.1, ladder 2).

**What this does NOT do — stated so it cannot be over-claimed:**
- **It does not transfer the RULES.** A Sevilla block ring is a geometric fact; PGM Art. 242.2 is
  Barcelona law. Every city still needs its own height/depth tables and its own founder-signed
  source gate (the L-449 pattern).
- **It does not validate the manzana prefix.** The 5-char refcat prefix stays "an observed pattern,
  not a documented guarantee"; ~7 of the residual refusals are it collecting two separate blocks
  (C57 §1.12).
- **82 manzanas (8.6 %) still refuse and MUST keep refusing.** Sevilla at 82.3 % is where to look
  next.
- **It cannot see País Vasco / Navarra**, which run cadastres outside Catastro.
- **Two of 874 rings breach the C19 §7.3 200-vertex hard reject** (max 326). Correct rings, refused
  for size. Open — C19 §13 KV-3 / C57 §13 KV-1.

## 7. The process rule this decision was executed under

Fixed **before any code was written**, because L-529 is what happens otherwise — a root cause
recorded as confirmed in three documents and demolished by one probe:

> **Characterise the failures and publish the distribution FIRST; derive the tolerance from the
> data; do not tune a number until blocks pass.**

The taxonomy accordingly demolished the assumption the task began with (that slivers needed
welding), and that demolition is written into the record rather than quietly dropped. The probes
reuse the PRODUCTION parsers, the PRODUCTION projection and the PRODUCTION dissolve, **so the probe
cannot disagree with the code path it diagnoses** — the precedent set by L-535 and now standing
practice for this subsystem.

A methodological refusal worth preserving: a WFS bbox returns every parcel that merely *intersects*
it, so a manzana straddling the edge arrives TRUNCATED and fails for **our** reason, not the
cadastre's. **1,682 straddling manzanas were excluded** (plus 890 with < 3 parcels, production's own
refusal) rather than counted as failures — inflating the baseline with a sampling artefact would
have flattered the fix.
