# L-609 — Click-weighted fill + the byggefelt footprint layer (Denmark)

> **Status:** measured live 2026-07-23 against Plandata.dk WFS 2.0. Two named next steps from
> L-608 §8, executed. **Tier every claim; failure ≠ empty (§CONTEXT-DATA-HONESTY).**
> **Convention line:** numbers below are VERIFIED-LIVE unless tagged otherwise.

---

## 0 — TL;DR (the three answers)

1. **Click-weighted fill is ≈ 87% by BYZONE area — but the prior "trends toward 77%" hypothesis is
   REFUTED.** Within the kommuneplanramme layer, area-weighting *lowers* the fill to **61.5%** (from a
   75.7% feature-count fill), because the biggest rammer are the dimensionless rural/green ones. The
   87% headline is higher than 61.5% only because the **byzone** denominator excludes those big empty
   rammer AND the local-plan layers fill gaps. Denominator matters more than any single layer.
2. **Byggefelt EXISTS and is well-populated (57,031 features, real footprint polygons), but it is NOT
   soundly wireable as "coverage" through the proxy+mapper path**, and adding it as a live dimensional
   layer buys ≈ 0% fill. It is a GEOMETRY gift, gated behind a schema + parcel-intersection + a
   bindingness rule. Verdict + exact wiring spec below.
3. **Honest distance to 100% (byzone dimensions): ≈ 13 pp** — byzone clicks where NO layer publishes a
   height/storeys/FAR. That is a source DATA-FILL gap (the plan omits the number), not an access wall,
   and not closable by us. **Footprint/coverage is a separate axis, currently 0% delivered.**

---

## 1 — METHOD (why these denominators, and the honesty guards)

- **Unfiltered counts first.** Every ratio below has its denominator counted with `resultType=hits`
  BEFORE any filter, so a zero can never masquerade as a fill (§CONTEXT-DATA-HONESTY, L-422 family).
- **"Feature-count fill" ≠ "click rate."** A random *click* lands in a feature with probability
  proportional to that feature's AREA, not 1-per-feature. Rammer are few-and-huge; lokalplaner are
  many-and-small; byggefelter are many-and-tiny. So area-weighting is mandatory to answer "what a
  random click gets," and it moves every number.
- **Two area-weighted measurements, two denominators:**
  - **(A) Area-weighted fill *within* the kommuneplanramme layer** — exact, from a full national
    geometry pass (all 50,627 rammer, shoelace area in EPSG:25832). Denominator = *all
    ramme-covered land*.
  - **(B) Byzone click-weighted fill** — Monte-Carlo: 300 points drawn uniformly by AREA from inside
    Denmark's byzone (the `zonekort_samlet_v` byzone polygons, 2,844 km², 3,480 patches), each point
    run live through the full selection rule (byggefelt → delområde → lokalplan → ramme, prefer the
    most-specific layer that publishes a usable dimension). Denominator = *a random buildable click in
    the urban zone* — the number the founder asked for ("byzone / the zone partition").

---

## 2 — RESULT A: area-weighted kommuneplanramme fill (exact, national)

Full pass over all **50,627** `kommuneplanramme_vedtaget_v` features, area by shoelace in EPSG:25832,
a feature counted "filled" if it publishes any of `maxbygnhjd`/`maxetager`/`bebygpct` > 0:

| Measure | Value |
|---|---|
| Feature-count fill | **75.68%** (cross-checks L-608's 76.9%) |
| **Area-weighted fill** | **61.46%** |
| Total ramme area | 6,177.5 km² |
| Dimension-bearing ramme area | 3,796.7 km² |

**Finding — the hypothesis is refuted.** L-608 §8 predicted the click rate would "trend toward 77%
because rammer are large." The opposite is true *within the ramme layer*: the large rammer are
disproportionately the ones with NO dimension (rural/recreational/green framework areas), so
area-weighting drags the ramme fill DOWN to 61.5%. This is the same count-vs-area trap that the whole
exercise is about, and it bites in the direction opposite to the guess. **Probe the geometry, not the
count.**

---

## 3 — RESULT B: byzone click-weighted fill (the headline D1)

Monte-Carlo, **N = 300** area-weighted points inside byzone, full selection rule queried live
(0 query errors; seed 20260723):

| Measure | Value | Denominator |
|---|---|---|
| **Byzone click-weighted fill (D1)** | **87.33%** (262/300; 95% CI ≈ ±3.8pp) | a random area-weighted point in Denmark's adopted **byzone** (2,844 km²) |
| Any plan feature at the click | 98.33% (295/300) | same — byzone is almost fully plan-covered |
| Byggefelt present at the click | 6.0% (18/300) | same |
| Byggefelt publishing a dimension | 1.67% (5/300) | same |

**Which layer supplied the winning dimension (most-specific-first):**

| Layer | Clicks | Share of 300 |
|---|---|---|
| kommuneplanramme (framework, fall-through floor) | 119 | 39.7% |
| lokalplan **delområde** | 101 | 33.7% |
| lokalplan (whole plan) | 37 | 12.3% |
| byggefelt | 5 | 1.7% |
| **none** (no dimension anywhere) | 38 | 12.7% |

Why 87% >> the 61.5% ramme number: the byzone denominator excludes the big dimensionless rural/green
rammer, and where a ramme is silent-on-a-number a lokalplan/delområde supplies it. **The delområde
layer alone supplies the winning dimension for 33.7% of byzone clicks** — hard proof that the
merged §USABLE-FALLBACK/delområde-first work (a3413cd0) is doing enormous work, not decoration.
Byggefelt's 1.7% is a top-of-chain artefact (those clicks would almost all be covered by a lower
layer too), so its true MARGINAL dimensional contribution is ≈0.

> ⚠ Denominator honesty: **61.5%** (all planned land) and **≈87%** (byzone only) are BOTH true and
> answer DIFFERENT questions. The product should quote byzone (that is where a user draws a plot);
> the founder should ratify that choice (see VERIFICATION.md open item).

---

## 4 — RESULT C: the byggefelt verdict

**Does it exist / populate?** YES, strongly. `theme_pdk_byggefelt_vedtaget` = **57,031** national
features — MORE than there are whole lokalplaner (37,974). Each is a real `geometri :: MultiPolygon`
FOOTPRINT (sampled: 4,303 / 749 / 288 m² building fields in Lyngby Stadion lokalplan 307), carrying
plan identity (`planid`, `lp_plannr`, `lp_plannavn`, `delnr`, `doklink`) via the SAME `lp_*` aliases
the mapper already reads for delområder.

**Can it be wired as most-specific to deliver footprint + coverage? Three blockers, in order of
severity:**

1. **Coverage is a ratio the pure mapper cannot compute.** `maxCoverage` ∈ [0,1] = footprint∩parcel /
   parcel. The byggefelt gives the footprint POLYGON; the parcel geometry lives downstream (C57), NOT
   in `mapPlandataToZoningRecord` (which sees only attributes). And `EnvelopeNumbers`/`ZoningRecord`
   has **no field for a footprint polygon**. So "deliver coverage from byggefelt" is a CROSS-LAYER
   change (proxy geometry passthrough + an L0 schema field + a downstream parcel-intersection step),
   not a proxy+mapper edit. Forcing a coverage number through the current path would fabricate.
2. **Bindingness varies — a footprint is not always a cap.** `bygvejledende` (advisory/illustrative),
   `bygkunifelt` (building ONLY within the field), `iomfangreg` (extent regulated) decide whether a
   byggefelt polygon is a hard footprint maximum or a placement guide. In the sampled features
   `bygkunifelt = false` (building NOT restricted to the field) — i.e. those fields are NOT coverage
   caps. Any coverage feature MUST gate on `bygkunifelt && !bygvejledende`. Needs planner sign-off
   (VERIFICATION.md).
3. **As a DIMENSIONAL layer it buys ≈ 0% marginal.** Byggefelt's `maxbygnhjd`/`maxetager` are almost
   always null: only 1.7% (5/300) of byzone clicks even had a byggefelt with a dimension, and because
   byggefelt sits top-of-chain those same clicks would almost all be covered by a lower layer anyway —
   so its true marginal fill contribution is ≈0. It carries no `bebygpct` at all. Adding it to the live
   query chain adds one WFS round-trip per click for essentially no fill gain — not warranted.

**Net verdict:** byggefelt is the RIGHT future source for a real footprint overlay (and thence a
geometric coverage), available at 6.0% of byzone clicks today. It is **not** a coverage source the
current proxy→mapper→ZoningRecord path can honestly express, and it is **not** worth wiring as a
dimensional layer. Ship the probe (this doc); gate the fix.

### 4.1 — Exact wiring spec (for whoever holds the delområde base — see §6)

When footprint/coverage is greenlit (needs a C58/ADR decision for the schema field):

- **Proxy** (`server/plandataZoningProxy.js`): prepend
  `{ key: 'byggefelt', typeName: 'pdk:theme_pdk_byggefelt_vedtaget' }` to `PLANDATA_LAYERS`, and have
  `fetchZoningAtPoint` return the byggefelt **geometry** (not just `properties`) when
  `bygkunifelt && !bygvejledende`. `hasUsableDimension` already accepts `maxbygnhjd`/`maxetager`, so no
  change is needed for the (rare) dimensional case.
- **Schema** (L0, `EnvelopeNumbers`/`ZoningRecord`): add an optional `footprintPolygon` (a ring in the
  parcel's CRS) OR accept a pre-computed `maxCoverage` from a downstream step. This is the gating
  decision — do NOT do it silently.
- **Mapper** (`mapPlandataToZoningRecord.ts`): add `'byggefelt'` to `PlandataLayer` + a
  `'DK-BYGGEFELT'` `layerFallbackCode` branch (its identity already maps via the `lp_*` aliases). Keep
  `maxCoverage: null` UNTIL the downstream parcel-intersection supplies it.
- **Downstream** (scene-committer / envelope engine): coverage = area(footprint ∩ parcel) / area(parcel),
  computed where the parcel geometry exists.
- **Tests:** a byggefelt `PlandataZoningResponse` → correct identity + dims + `maxCoverage: null`; a
  bindingness-gate test (`bygvejledende` byggefelt is NOT treated as a cap).

---

## 5 — HONEST DISTANCE TO 100%

| Axis | Today (byzone) | The remaining gap | Closable by us? |
|---|---|---|---|
| **Dimensions** (height / storeys / FAR) | ≈ 87% | ≈ 13 pp of byzone clicks where NO layer publishes any dimension | **No** — the plan exists but omits the number (source DATA-FILL ceiling). Not an access wall; not fabricatable. |
| **Footprint / coverage** | 0% delivered | byggefelt could supply a real footprint at 6.0% of byzone clicks | **Partially** — but only via the gated cross-layer path in §4.1, and only where `bygkunifelt && !bygvejledende`. |
| **Setbacks** (byggelinjer) | 0% | separate Plandata dataset, not on the plan feature | Future: wire the byggelinjer layer. |

**So "100%" is not a single number.** Dimensions are ≈87% and near their honest ceiling (the last
~13pp is missing at source). Footprint/coverage and setbacks are separate axes that start near 0% and
have concrete, gated next steps. Quoting one blended "%" would hide which axis is which — don't.

---

## 6 — ⚠ BASE-STALENESS COORDINATION NOTE (why no code shipped from this worktree)

This worktree's base commit (`9bb79b8`) **predates** `a3413cd0`
("feat(dk): Plandata delområde + kommuneplanramme fallback"), which is already merged into `main`.
So in THIS worktree `PLANDATA_LAYERS` is still `[lokalplan, kommuneplanramme]` and the mapper's
`PlandataLayer` is still `'lokalplan' | 'kommuneplanramme'` — the delområde/§USABLE-FALLBACK work is
absent here. The vitest baseline here is **457 green** (main's is 500 — the difference is a3413cd0's
tests + others).

Editing `server/plandataZoningProxy.js` or `mapPlandataToZoningRecord.ts` from this stale base would
**clobber the merged delområde work** on merge-back — the exact multi-agent shared-tree collision the
project memory warns against ("agents commit scoped CODE only; the orchestrator owns docs"). Combined
with the honest verdict that byggefelt should NOT be live-wired (dims ≈0; coverage is gated
cross-layer work), **no code was mutated.** The measurement + the §4.1 spec are the deliverable; the
spec is written against the a3413cd0 (current-main) shape so it applies cleanly for whoever holds it.

**Resume step:** rebase this work onto current `main` (post-a3413cd0), then — only if the C58/ADR
schema decision in §4.1 is made — apply the byggefelt footprint spec there. Nothing here needs to be
re-measured.

---

## 7 — REPRODUCE

All queries + the two scripts (`area_weight.py` national area pass; byzone Monte-Carlo sampler +
live selection-rule pass) are in `SOURCES.md`. CRS EPSG:25832 throughout (metric → shoelace = m²).
Seed for the byzone sample: 20260723. Re-running is safe and keyless.
