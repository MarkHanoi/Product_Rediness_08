# Why the block dissolve refuses real *manzanas* — the L-539 taxonomy

**Run 2026-07-21 against the live Catastro INSPIRE WFS. 125 bbox fetches · 33,865 parsed parcels ·
956 COMPLETE manzanas · 250,646 parcel edges · 7 sample areas in 5 cities.** Probes:
`scratchpad/probe-dissolve-{fetch,classify,deep,sweep,accept}.mts`, reusing the PRODUCTION parsers
(`server/parcelZoningProxy.js`), the PRODUCTION projection (`latLonToSceneXZ`) and the PRODUCTION
dissolve (`packages/site-parcel-data/src/geometry/blockRing.ts`) — so the probe cannot disagree
with the code path it diagnoses. Precedent: `SPAIN-CADASTRAL-DISSOLVE-PROBE.md` (L-535).

## THE RULE THIS PROBE WAS RUN UNDER

Fixed before any code was written, because L-529 is what happens otherwise (a root cause recorded
as confirmed in three documents, demolished by one probe): **characterise the failures and publish
the distribution FIRST; derive the tolerance from the data; do not tune a number until blocks
pass.** Everything below is in that order, including the finding that demolished the assumption
this task started with.

## THE HEADLINE

> **There are no slivers and no near-coincident vertices to weld.** The entire dominant failure is
> one defect with one cause: **Catastro publishes coordinates rounded to 1e-6 degrees**, so two
> neighbours can store the SAME boundary with different vertex COUNTS. The fix is to split an edge
> at the neighbour's existing vertex — which moves nothing and constructs nothing.

**63.5 % → 91.4 %** of real manzanas now dissolve. **Zero** previously-produced rings changed.

## METHOD — AND THE SAMPLING ARTEFACT IT REFUSES TO COMMIT

A WFS bbox returns every parcel that *intersects* it, so a manzana straddling the bbox edge arrives
TRUNCATED — parcels outside were never returned. Dissolving a truncated manzana fails for a reason
that is ours, not the cadastre's, and counting it would inflate the failure rate with an artefact.
Production never has this problem (it centres its bbox on the subject parcel). So a manzana is
admitted here **only if every one of its parcels lies strictly inside the bbox with a ~13 m
margin**: 1,682 straddling manzanas were dropped, along with 890 with < 3 parcels (production's own
refusal). 0 of 125 bbox responses were capped by the server, so no sample is silently partial.

Reassuringly, this independently-drawn sample reproduces the L-537 at-scale figure almost exactly:
**63.5 % here vs 64 % (926/1,437) there.** Two different samples, same baseline.

## THE BASELINE (production code, before L-539)

| city / area | manzanas | ring | rate |
|---|---|---|---|
| Barcelona (Eixample) | 108 | 88 | 81.5 % |
| Barcelona (Ciutat Vella) | 77 | 63 | 81.8 % |
| Madrid (Salamanca/Chamberí) | 95 | 72 | 75.8 % |
| Madrid (centro) | 101 | 78 | 77.2 % |
| Córdoba | 163 | 72 | 44.2 % |
| Valencia | 220 | 160 | 72.7 % |
| Sevilla | 192 | 74 | 38.5 % |
| **ALL** | **956** | **607** | **63.5 %** |

Note Barcelona is **81.5 %, not the 100 %** the 9-address L-535 sample suggested. A 2-of-2 sample
cannot distinguish 100 % from 80 %; this is why the at-scale run had to happen.

## THE FAILURE CLASSES — 349 failing manzanas

Primary class, assigned by a deterministic most-decisive-first rule:

| class | n | % of failures |
|---|---|---|
| **several closed loops** (every vertex degree 2 — nothing is "broken", the perimeter simply is not ONE loop) | 233 | **66.8 %** |
| **T-junction only** (a vertex of one parcel on the interior of another's edge) | 82 | 23.5 % |
| T-junction + a nearby unmatched vertex | 28 | 8.0 % |
| genuine gap / overlap with no near feature | 2 | 0.6 % |
| near-coincident vertices only | 2 | 0.6 % |
| non-manifold (3+ parcels on one edge) | 2 | 0.6 % |

Defects are not exclusive; presence across the same 349:

| defect | manzanas | % |
|---|---|---|
| ≥1 T-junction within 0.25 m | 301 | 86.2 % |
| >1 perimeter component | 323 | 92.6 % |
| non-manifold edge | 2 | 0.6 % |

### The two classes are the SAME defect

The multi-loop class looked like a courtyard parcel missing from the masa. It is not. Of the 233:

| shape | n | % |
|---|---|---|
| **NESTED** (every extra loop inside the largest) | 220 | **94.4 %** |
| side by side (genuinely two blocks) | 7 | 3.0 % |
| mixed | 6 | 2.6 % |

…and the nested loops enclose **~0 % of the outer loop's area** (p95 < 0.05 %). They are not
courtyards; they are hair-thin triangles. That is exactly what an unmatched T-junction produces:
parcel A stores `p → q`, parcel B stores `p → r → q`, so `p→q`, `p→r` and `r→q` all survive
cancellation and the survivors form the block outline **plus** the degenerate triangle `p-r-q`. The
chain then finds two loops and refuses. **≈ 90 % of all failures are this one defect.**

(Ruled out along the way: our own parser discarding `<gml:interior>` rings. It does — `parseParcelGml`
keeps only the first `<posList>` — but only **30 of 33,865** features (0.1 %) have an interior ring,
and **0 of the 220** nested-loop manzanas contains one. Real but negligible; logged as a separate
latent defect, not this one.)

## WHY IT HAPPENS — AND WHERE THE TOLERANCE COMES FROM

**Catastro INSPIRE GML publishes WGS84 coordinates rounded to 6 decimal places** (12,601 sampled
vertices: 6 dp dominant, the rest trailing-zero artefacts of the same grid). At Iberian latitudes
1e-6° is **0.083 m east / 0.111 m north**.

The data proves the grid rather than assuming it. Across **250,646 real parcel edges**:

| shortest-edge percentile | p0.01 | p0.1 | p0.5 | p1 | p5 | p50 |
|---|---|---|---|---|---|---|
| length (m) | 0.0835 | 0.0847 | 0.0884 | 0.1113 | 0.2813 | 2.7710 |

**Not one edge is shorter than 0.083 m** — precisely one longitude grid step. There is no continuum
below it, therefore there are no slivers.

Same conclusion from the other side: the nearest-neighbour distance of every break vertex in every
failing manzana — **0 of 177 below 0.05 m** (p5 = 0.111 m, p50 = 0.784 m). Coincident vertices are
*bit-identical* after rounding; distinct ones are ≥ a grid step apart. **A vertex weld — the fix
this task was briefed to expect, and the one `blockRing.ts`'s own header implied — has nothing to
do. Measured directly: at ε ≤ 0.05 m a weld moves 0.0000 m and changes 0 outcomes.** It is not
implemented.

### The perpendicular-offset distribution — two populations with a valley between them

1,057 candidate T-junction incidences, surveyed to a deliberately over-wide 1.0 m radius:

| offset (m) | n | cumulative |
|---|---|---|
| 0 – 0.005 | 58 | 7.4 % |
| 0.005 – 0.01 | 71 | 14.1 % |
| 0.01 – 0.02 | 154 | 28.7 % |
| 0.02 – 0.03 | 157 | 43.5 % |
| 0.03 – 0.05 | 199 | 62.3 % |
| 0.05 – 0.075 | 137 | 75.3 % |
| 0.075 – 0.1 | 33 | 78.4 % |
| **0.1 – 0.15** | **9** | 79.3 % |
| **0.15 – 0.2** | **9** | 80.1 % |
| **0.2 – 0.3** | **28** | 82.8 % |
| 0.3 – 0.5 | 69 | 89.3 % |
| 0.5 – 1.0 | 113 | 100.0 % |

The defect population runs to ~0.075 m, the histogram then **collapses ten-fold across 0.1–0.3 m**,
and above 0.3 m real, unrelated geometry resumes (a corner that happens to be near an edge). The
valley is the boundary between "the same point, rounded differently" and "a different point".

## THE TOLERANCE — 0.10 m, BOUNDED FROM BOTH SIDES

`TJUNCTION_SPLIT_TOLERANCE_M = 0.1`. Three independent derivations land in the same place:

1. **The publisher's own quantum (upper bound).** 1e-6° = **0.111 m north**. At or below that, the
   repair *cannot introduce a positional error the input does not already contain*. Above it, we
   would be asserting more precision than the source has.
2. **The empirical valley (both sides).** ≥ 0.075 m to cover the defect population; ≤ ~0.2 m before
   genuine geometry starts being swept in. 0.10 m is the floor of the valley.
3. **The success curve's plateau.** 0.05 → 81.5 %, **0.10 → 91.6 %**, 0.20 → 93.4 %, 0.30 → 93.1 %
   (falling — over-splitting starts destroying rings). These are all-manzana rates with the repair
   applied *unconditionally*, which is what isolates the tolerance's own effect; the shipped
   exact-first code scores 91.4 % at 0.10 m. The curve is already flat at 0.10. The extra
   1.8 points at 0.20 would double the deviation and breach bound 1, so it is refused. *A tolerance
   is only defensible on a plateau; on a slope it is a tuned number.*

**Cadastral positional accuracy is deliberately NOT the number used.** Catastro's urban cartography
derives from 1:500–1:1000 mapping whose absolute accuracy is decimetric — but absolute accuracy is
the wrong quantity here. Both sides of a shared boundary come from the *same* digitisation, so what
matters is the RELATIVE displacement between two representations of one line, and the only process
that introduces it is the publication rounding. That is why the bound is the grid step and not a
survey-accuracy figure: the measured distributions (a hard 0.083 m edge-length floor, a hard 0.05 m
vertex-gap floor) show the grid, and show nothing else.

## WHAT THE FIX DOES — AND WHAT IT GIVES UP

Before cancelling, split an edge at any **existing** vertex lying within 0.10 m of its interior.

- **No vertex is constructed and none is moved.** The split point is the neighbour's own published
  vertex. The exactness guarantee that lets this ring feed a compliance number survives intact —
  this is a *smaller* weakening than the brief anticipated, because welding proved unnecessary.
- **What IS given up:** the ring may follow `p → r → q` instead of the straight `p → q`, departing
  from it by ≤ 0.10 m — below the source's own 0.111 m coordinate resolution. Measured over 267
  repaired rings: max offset p50 **0.042 m**, p90 0.072 m, worst 0.096 m.
- **The exact pass runs FIRST and its result is returned unchanged whenever it succeeds.** Applying
  the repair unconditionally would have altered **137 of the 607 rings that already existed** — 137
  silently moved *profunditats edificables*. Declined.
- **`non-manifold` and `malformed-parcel` are never repaired.** Those are wrong inputs, not a
  digitisation artefact; splitting edges would only make a fiction closable.
- **A mis-split degrades to a refusal, never to a plausible-but-wrong ring** — a fragment that
  should not exist simply fails to cancel. And an edge shorter than 2× the tolerance can never be
  split at all, which is what stops the tolerance reshaping the smallest features in the data.

## THE ACCEPTANCE RUN (same 956 manzanas, production code, before vs after)

| city / area | n | before | after |
|---|---|---|---|
| **Barcelona (Eixample)** | 108 | 88 (81.5 %) | **104 (96.3 %)** |
| **Barcelona (Ciutat Vella)** | 77 | 63 (81.8 %) | **72 (93.5 %)** |
| **Madrid (Salamanca/Chamberí)** | 95 | 72 (75.8 %) | **88 (92.6 %)** |
| **Madrid (centro)** | 101 | 78 (77.2 %) | **100 (99.0 %)** |
| **Córdoba** | 163 | 72 (44.2 %) | **148 (90.8 %)** |
| Valencia | 220 | 160 (72.7 %) | **204 (92.7 %)** |
| Sevilla | 192 | 74 (38.5 %) | **158 (82.3 %)** |
| **ALL** | **956** | **607 (63.5 %)** | **874 (91.4 %)** |

Brief's target (Barcelona ≥ 90 %) met at 96.3 %. L-535's 0/3 Córdoba is now 90.8 %.

**Pre-existing rings that CHANGED: 0. Rings LOST: 0.** Guaranteed by construction (exact pass
first), and verified on every one of the 607.

### The independent check — "it closed" is not "it closed correctly"

Ring area against the **sum of the published cadastral parcel areas**, a number the dissolve never
sees:

| path | n | p50 | p90 | p95 |
|---|---|---|---|---|
| exact | 607 | 0.15 % | 0.24 % | 0.28 % |
| **repaired** | 267 | **0.13 %** | **0.22 %** | **0.24 %** |

The repaired rings agree with the published areas **slightly better** than the exact ones do. A
ring that had closed around the wrong loop, or swallowed a neighbour, would miss by tens of percent.

## WHAT IS STILL REFUSED — 82 manzanas (8.6 %)

80 `open-or-disjoint`, 2 `non-manifold`. This residue includes the ~7 genuinely-two-blocks cases
(the 5-char manzana prefix collecting two separate polygons — a *prefix* defect, not a geometry
one), the genuine gaps, and blocks whose offsets exceed the valley. **They must keep refusing.**
Sevilla is the worst city at 82.3 % and would be the place to look next.

## WHAT THIS DOCUMENT DOES *NOT* SHOW

- **It does not show the RULES transfer.** A block ring in Sevilla is a geometric fact; PGM
  Art. 242.2 is Barcelona law. Every city still needs its own height/depth table and its own
  founder-signed source gate (the L-449 pattern). This removes the *geometry* blocker only.
- **It does not validate the manzana prefix.** The 5-char refcat prefix remains "an observed
  pattern, not a documented guarantee"; the 7 side-by-side blocks are its measured failure.
- **It cannot see País Vasco / Navarra**, which run cadastres outside Catastro.
- **Two of 874 rings exceed the C19 §7.3 200-vertex hard-reject** (max 326; the exact path already
  reached 192). Those refuse downstream — honestly, but they refuse.
- **`parseParcelGml` still discards `<gml:interior>` rings** (30 of 33,865 features). Latent, tiny,
  and unrelated to this failure — but real, and now written down.

**Cross-refs:** L-539 (audit), L-535 (`SPAIN-CADASTRAL-DISSOLVE-PROBE.md`), L-537
(`SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md` — the 64 % baseline this reproduces), `blockRing.ts`
§DISSOLVE-TJUNCTION-SPLIT, C58 §1.1/§1.2/§1.4, C19 §7.3, ADR-0270, ADR-0271, L-462, L-465,
L-529 (why the gate came before the fix).
