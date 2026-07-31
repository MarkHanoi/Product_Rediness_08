# DK — tier 1 goes LIVE: multi-part `explicit-area` + the L5 wiring

> **Status: SHIPPED, 2026-07-31.** Commit on `worktree-agent-aa0ee3918e3332b72`.
> Package suite **1380 → 1416 green**; server suite +19; root `tsc` **88 errors before and after —
> zero net-new** (measured by reverting the changed paths to the parent commit and re-counting, not
> by eyeballing); `check:isolation` clean.
>
> Inputs: [`DK-BYGGEFELT-PRODUCER.md`](./DK-BYGGEFELT-PRODUCER.md) §8 (the ten stubs) and
> [`BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md`](./BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md).
> This document reports **S5** (multi-part), **S2/S3/S4/S8/S10** (the L5 wiring), and a **new,
> larger blocker** the end-to-end measurement exposed.

---

## §0 — TL;DR

1. **`explicit-area` now takes multi-part and holed footprints.** Jurisdiction-agnostic: Madrid NZ 1
   and Córdoba get it for free. The refusal moved from a property of the **source** to a property of
   the **answer** (§2).
2. **Adapter reach: 78.6 % → 100.0 %** of the 13,629 binding byggefelter (n = 1,000, 2026-07-31).
   The measurement independently reproduced the previously published 79–81 % before changing it (§3).
3. ⚠ **End-to-end reach moves far less: 44.0 % → 47.5 %.** Multi-part was **not** the binding
   constraint on a real user click. **The convex-clip contract is** — 47.2 % of binding byggefelter
   refuse `non-convex-both` against a real cadastral parcel. **A general concave clipper is now the
   single biggest tier-1 blocker, and it is a PRE-EXISTING limitation this work did not create** (§4).
4. **A real DK click reaches tier 1.** Four of the four named stubs are closed (S3 proxy route, S4
   projector, S8 pagination, S10 advisory evidence surfaced), plus S2 (L5 wiring) (§5).
5. **Parcel-side coverage is still UNCOMPUTED.** Tier 1 reaches **~0.8 % of Danish parcels**. Nothing
   here changes that first factor (§6).

---

## §1 — Denominators, with dates. Read this before quoting any number.

| Number | Denominator | Date | What it does NOT mean |
|---|---|---|---|
| **13,629** | adopted byggefelt **FEATURES** that are binding | 2026-07-31 (re-read live this run) | not parcels |
| **23.9 %** | of 57,035 adopted byggefelt **FEATURES** | 2026-07-31 | ⚠ **not** parcel coverage |
| **78.6 % → 100.0 %** | of the 13,629 **binding features** | 2026-07-31, n = 1,000 | not "of Danish parcels" |
| **44.0 % → 47.5 %** | of the 13,629 **binding features**, end-to-end on a real parcel | 2026-07-31, n = 1,000 | not "of Danish parcels" |
| **~1.00 %** | of Danish **PARCELS** intersect a binding byggefelt | n = 800, Wilson CI 0.51–1.96 % | the first factor; unchanged by this work |
| **~0.8 %** | of Danish **PARCELS** reachable at tier 1 | ≈ 1.00 % × placeability | still the operational figure |

> **The counts drift.** L-610 saw 57,031 / 13,627 on 2026-07-23; this run saw 57,035 / **13,629**.
> Eight days, four features. Any figure without a date is not a figure.

---

## §2 — S5: multi-part is supported, and the REFUSAL MOVED

### §2.1 — What was actually wrong

`ExplicitAreaSource.footprintRing` was a **single ring**, so the tier-1 adapter refused any
multi-part or holed byggefelt. That refusal was *correct for a single-ring implementation* — silently
taking part 0 would discard published buildable fields — but it was **a property of the SOURCE**, and
a plan feature that spans a whole lokalplan area is multi-part almost by definition. The user's
parcel usually sits under exactly one of those parts.

### §2.2 — The new shape

```
ExplicitAreaPart  { outer: Pt[]; holes?: Pt[][] }
ExplicitAreaSource{ footprintRing? | footprintParts?  ← MUTUALLY EXCLUSIVE }
solveExplicitArea({ parcelRing, footprintParts })
```

`footprintRing` and `footprintParts` are mutually exclusive **and the resolver refuses when both or
neither is set**. That is the load-bearing design choice: had `footprintRing` stayed required and
mirrored "part 0", every un-updated reader would have silently placed one of N published building
fields *and reported success*. Leaving it `undefined` on a multi-part source makes such a reader a
**compile error** instead. (`resolveExplicitAreaRing` returning `footprintParts` rather than
`footprintRing` did exactly that during this work: four call sites failed to compile, none failed
silently.) The same reasoning removed `DkByggefelt.ring` in favour of `DkByggefelt.parts` +
an explicit `dkByggefeltFromRing()` constructor.

### §2.3 — The algorithm

1. Every part's bounding box is tested against the parcel's. **Disjoint ⇒ the part is provably
   irrelevant and is skipped without a clip.** This is what makes a 95-part lokalplan feature cheap.
   The test is **one-sided and sound**: `true` proves separation; `false` proves nothing and the real
   clip still runs. (Pinned by a test that a *touching* bbox is not "disjoint" — sharing a frontage
   edge is the commonest case in dense fabric.)
2. The remaining parts are clipped to the parcel.
3. **Exactly one** surviving region ⇒ placed.
4. **Two or more** ⇒ refuse **`multi-region-on-parcel`**. Publishing the largest would under-state
   the permitted footprint while `insetAreaM2` and the study volume described a different solid.
5. A **hole** is decided **against the actual parcel**: outside the plot it says nothing and is
   ignored; inside it refuses **`hole-intersects-parcel`**, because a single-ring inset cannot carry
   it and dropping it OVER-states the buildable area (C58 §1.4, the L-616 direction).

> **§ANSWER-NOT-SOURCE.** The pinned test that matters is the pair: the *same* two-part source
> **refuses** on a parcel both parts reach and **solves** on a parcel only one reaches. If the
> implementation ever regresses to refusing on the source's part count, that test fails.

### §2.4 — §REFUSE-NEVER-REPAIR

New pure module `geometry/ringValidation.ts` **names** a defect and never returns a fixed ring:
`self-intersecting`, `zero-area`, `unclosed`, `non-finite-coordinate`, `too-few-vertices`.

The temptation with more third-party geometry flowing in is to "clean" it — snap a nearly-closed ring
shut, `buffer(0)` a self-intersection away. **A silent repair is a wrong answer with no error raised**
— the L-616 shape. A repaired ring yields a plausible number that nothing flags; a refusal is visible.

Two details worth keeping:

- **`unclosed` is contract-relative.** GeoJSON rings are closed; PRYZM `Pt[]` rings are open. The
  same rectangle is valid under one contract and defective under the other, so `requireClosed` is a
  parameter. Closing an unclosed GeoJSON ring would invent an edge the publisher never drew — and the
  ring may be *truncated* rather than merely open.
- **A zero-area hole is dropped; a defective hole with real area is fatal.** Dropping the first is
  provably neutral (it subtracts nothing); dropping the second inflates the footprint.

⚠ One recorded overlap: an exactly-balanced bow-tie is *both* zero-area and self-intersecting and is
reported `zero-area`, because that check runs first — which is what names an all-collinear sliver
correctly. The order changes the **label**, never the outcome; every caller refuses either way.

### §2.5 — Is it genuinely jurisdiction-agnostic, or quietly DK-shaped?

**Genuinely agnostic.** The test file `explicitAreaMultiPart.test.ts` uses plain metre rings and
mentions no country. Concretely:

- The capability lives in `geometry/explicitArea.ts` + `geometry/ringValidation.ts`, which import
  nothing DK-specific and are consumed by the Madrid NZ 1 path through the same functions.
- Madrid's existing single-ring `ExplicitAreaSource` still works **unchanged** through the
  `footprintRing` input; it simply became one part.
- The engine input is `explicitAreaFootprintParts`, not a DK field.

**The honest caveat:** DK supplied the *measured need* and DK is the only consumer exercising the
multi-part branch **in production** today. Madrid publishes per-manzana footprints that are usually
single-part, so the branch is proven by tests and by the DK corpus, not yet by a second live city.
The **holes** path in particular has only 10 real DK examples in the n = 1,000 sample.

---

## §3 — The measurement (A: adapter reach)

**Method.** `tools/dk-byggefelt-probe/measure-tier1-reach.ts`, run 2026-07-31. Systematic sample over
`startIndex` strata — **40 strata × 25 = n 1,000**, 0 discards — the *same sampling design* as the
79–81 % figure, so the before/after is like-for-like. It drives the **real** pipeline
(`byggefeltCollectionToEvidence` → `groupEvidenceByFeature` → `dkByggefeltFromFeatureEvidence`), not a
re-implementation.

| | share of the 1,000 | ⇒ of 13,629 |
|---|---:|---:|
| multi-part | **20.4 %** (max **95** parts) | — |
| has ≥ 1 hole | **1.0 %** | — |
| **BEFORE** — single-part AND hole-free | **78.6 %** | **≈ 10,712** |
| **AFTER** — feature-level adapter | **100.0 %** | **≈ 13,629** |

The 78.6 % / 20.4 % / 1.0 % triple independently **reproduces** the previously published
79.4–80.6 % / 19.4 % / 1.2 % on a fresh sample. The max part count is **95**, higher than the 55
previously recorded — the tail is longer than one sample showed.

⚠ **Systematic over WFS storage order is not a random permutation.** Treat every share as a good
estimate, not an exact proportion.

---

## §4 — ⚠ The measurement that matters more (B: end-to-end), and the NEW top blocker

Adapter reach is *necessary and not sufficient*. What a user gets is the **geometric solve against
their actual parcel**, so the probe also fetches the real cadastral parcel under each sampled
byggefelt from **DAWA** and runs `solveExplicitArea`.

| outcome on a real DAWA parcel (n = 1,000, 0 discards) | count | share |
|---|---:|---:|
| **PLACED — after** | **475** | **47.5 %** |
| **PLACED — before** (same sample, old adapter) | **440** | **44.0 %** |
| refused **`non-convex-both`** | **472** | **47.2 %** |
| refused `multi-region-on-parcel` | 41 | 4.1 % |
| refused `no-parcel` (DAWA answered: no parcel at the point) | 9 | 0.9 % |
| refused `hole-intersects-parcel` | 2 | 0.2 % |
| refused `no-overlap` | 1 | 0.1 % |

### The finding

> **Multi-part was not the binding constraint on a real click. The convex clipper is.**
>
> `polygonClip.ts` uses Sutherland–Hodgman, which is exact only when **one** of the two rings is
> convex. Real Danish cadastral parcels and real byggefelter are frequently **both** concave, and the
> primitive then refuses rather than fabricate a region (correctly — C58 §1.4). That accounts for
> **47.2 %** of binding byggefelter, more than ten times the multi-region residue this work
> introduced, and it is **pre-existing**: it limited the old single-ring path identically.

**Reporting only "78.6 % → 100 %" would be true and misleading.** The adapter bottleneck is gone; the
*user-visible* bottleneck moved to a different, larger, older limitation. **A general
(concave-vs-concave) polygon clipper — Greiner–Hormann / Weiler–Atherton, or a vetted library — is
now the single highest-leverage tier-1 investment**, worth roughly 47 pp of binding byggefelter
against ~3.5 pp for the work in this document. It is a self-contained, jurisdiction-agnostic geometry
task; the DK measurement is only where it happened to become visible.

⚠ The `no-parcel` cases (0.9 %) are a **clean** DAWA answer ("no cadastral parcel at this point"),
distinct from a **discard** (a fetch that failed or a body that would not parse). There were **0**
discards in this run; the code counts them separately regardless, because an HTTP error during
sampling is not "no byggefelt here".

### The DAWA trap, re-verified

The **global bulk** `jordstykker` endpoint returns **HTTP 200, curl exit 0**, and a payload silently
truncated mid-field at ~288 MB. **The status code is not the answer; the parse is.** The probe issues
only per-point lookups and `JSON.parse`-validates every body. The same discipline is now enforced
server-side: the new byggefelt proxy answers **502** for a 200-with-unparseable-body, never 200 with
an empty collection.

---

## §5 — What a real user click now produces (S2/S3/S4/S8/S10)

### §5.1 — The four stubs

| # | Stub | State | How |
|---|---|---|---|
| **S3** | no same-origin proxy route | ✅ **CLOSED** | `GET /api/plandata/byggefelt` in `server/plandataZoningProxy.js`, registered in `server.js` behind `apiLimiter`. |
| **S4** | no projector supplied | ✅ **CLOSED** | `siteDispatch.ts` supplies one — see §5.3, the CRS decision. |
| **S8** | pagination detected, not followed | ✅ **CLOSED** | The producer follows `startIndex` to `numberMatched`, bounded by `maxPages`. |
| **S10** | advisory/unknown evidence unconsumed | ✅ **CLOSED** | Surfaced as envelope caveats — see §5.4. |
| **S2** | no L5 wiring | ✅ **CLOSED** | `resolveDkByggefeltPlacement()` runs inside the live DK dispatch path. |

Still open from §8 of the producer doc: **S1** (parcel-side coverage — the single most important open
number), **S6** (O1 not fully closed), **S7** (tier 2 unsourceable — see §7), **S9** (`PlacementEvidence`
not yet promoted to L0).

### §5.2 — S3, and why it is not a CORS convenience

**`User-Agent` is a forbidden header in browser `fetch` and is silently dropped.** A browser calling
`geoserver.plandata.dk` directly is an **anonymous** client hammering a public, taxpayer-funded
endpoint Erhvervsstyrelsen cannot attribute or contact — and CORS + CSP `connect-src 'self'` block it
anyway. Routing through our origin is what makes the identifying UA and the rate limit *real*, and
enforces them **once for the product** instead of once per browser tab.

The route **takes a bbox, never a URL and never a CQL filter**; the upstream query is rebuilt
server-side from validated numbers. A proxy that forwarded a caller-supplied string would be an open
forwarder. Pinned by a test that injects `CQL_FILTER=1=1 OR …` and `typeNames=evil:layer` and asserts
neither reaches upstream.

**§FAILURE-IS-NOT-ABSENCE, four outcomes:**

| upstream | route | why |
|---|---|---|
| features | 200 + `numberMatched` passed through | the client can tell a complete read from a partial one |
| clean empty | 200, 0 features | a DURABLE "nothing here" |
| 5xx / network / timeout | **502** | a 200-empty would be read downstream as a **cacheable coverage fact** manufactured out of one bad minute |
| **200 with a truncated / non-JSON body** | **502** | the DAWA trap in another costume — the parse is the answer |
| bad bbox | 400, **no upstream call** | a caller error, not an absence |

An unrecognised `crs` is a **400**, never a silent coercion to the default: coercing would
reinterpret the caller's coordinates in a frame they were not written in, which is the CRS-interlock
failure mode server-side.

### §5.3 — S4, and the CRS decision that removed a failure class

The producer is asked for **EPSG:4326**, not Plandata's native EPSG:25832, and the bbox filter is
sent in 4326 too. **Axis order lon/lat, VERIFIED LIVE 2026-07-31** — a swapped bbox lands off-map and
returns zero features, which would masquerade as "no byggefelt here".

The alternative — 25832 metres — needs a UTM inverse in the L5 path, and a projection bug there
produces a **plausible-looking building in the wrong place** rather than an error. In 4326 the
projector is the *existing* `latLonToSceneXZ` + θ transform, the exact one the parcel ring and the
Madrid footprint already use. There is no second projection to get wrong.

⚠ Two frame details, spelled out in the code because inferring them is how this breaks:
- In 4326 a point arrives as `{ x: LONGITUDE, z: LATITUDE }` — **GeoJSON order, not lat/lon order**.
- The parcel ring lives in the **project-north** frame, so θ is undone before the lat/lon inverse and
  re-applied on the way back. Skipping either direction on a rotated site yields a correctly-sized
  byggefelt rotated off the plot — a failure that reads as a render bug.

The CRS interlock is **unchanged and still armed**: a test pins that unprojected 4326 geometry
refuses exactly as unprojected 25832 did. Degrees are not metres.

### §5.4 — S10, and why dropping advisory evidence is not neutral

Advisory / not-declared / metadata-unavailable / self-contradictory byggefelter were produced, ranked
and returned — and consumed by nothing.

A parcel with three *vejledende* building fields drawn across it is **not** the same as a parcel with
none. A user who can see those fields on the municipality's own map is owed the statement that PRYZM
saw them too and why they did not shape the envelope. Showing nothing reads as *"PRYZM found no
data"* — §CONTEXT-DATA-HONESTY one level up: a **refusal rendered as an absence**. They now reach the
envelope's `caveats`, each naming its own remedy, plus the `pryzm-limitation:` records, which say
explicitly that the gap is **ours, not the register's**.

### §5.5 — End to end, for a real binding parcel

A Danish click now runs: parcel ring → lon/lat bbox (+25 m) → same-origin proxy → paged WFS read →
classifier → G6 resolver → `explicit-area` clip **inside the same engine call** (via
`input.geometricRule` + `input.explicitAreaFootprintParts`, the ADR-0279 §2 slot — the engine never
learns it is serving Denmark) → `applyDkPlacement` re-validates through the L0 refinements.

| field | before this work | after |
|---|---|---|
| `placement` | `null` | `{ source: 'byggefelt' }` |
| `openSpace` | `null` | `{ courtyard: true, source: 'byggefelt-hole' }` |
| `insetPolygon` | the whole parcel | `parcel ∩ published byggefelt` |
| `caveats` | plan numbers only | + parts examined, + advisory/unknown evidence, + citation |

⚠ **A byggefelt that cannot be clipped does NOT delete the envelope.** The explicit-area branch
hard-fails (`status: 'degenerate'`) when the clip cannot be computed exactly — a disjoint result, a
hole that bites, or the convex limitation of §4. That is the right answer about the **footprint** and
the wrong answer about the **parcel**: the published height and FAR are still real. So the path falls
back to the unplaced envelope and **says why**, rather than turning a placement limitation into "no
envelope here". Given §4, this branch is the *common* one today — roughly half of binding parcels.

---

## §6 — What this does NOT change

**Tier 1 reaches ~0.8 % of Danish parcels.** That is `P(parcel intersects a binding byggefelt)`
≈ 1.00 % (n = 800, Wilson CI 0.51–1.96 %) × `P(placeable)`. **This work raises only the second
factor**, and §4 shows it raises it by ~3.5 pp end-to-end, not by the 21.4 pp the adapter number
suggests. The first factor is a property of Danish planning practice and no amount of engineering
moves it.

**Do not let the 23.9 % feature share be read as parcel coverage.** Different denominator, different
question, and the parcel figure is expected to be far lower. **S1 remains uncomputed** — but it is no
longer *blocked*: DAWA supplies free, keyless, account-free cadastral polygons already in EPSG:25832,
so the repo's record of Matriklen/MitID as a blocker was **wrong for this purpose**. The probe in
`tools/dk-byggefelt-probe/` already does the byggefelt→parcel join; S1 needs the *inverse*
(parcel-count-uniform sampling), which is a different query, not a different capability.

---

## §7 — Tier 2 remains unsourceable (not touched, deliberately)

There is **no byggelinje layer in Plandata at all** — 198 `pdk:` layers, zero building lines. Danish
*byggelinjer* are road-authority **vejbyggelinjer** under the Road Act, held by Vejdirektoratet / the
kommune. The L5 wiring passes `byggelinjer: null`, which the resolver keeps distinct from "asked and
found nothing". No time was spent wiring tier 2.

---

## §8 — Reproducing

```bash
# The full measurement (n = 1,000; ~10 min, polite rate limits). Re-reads the denominator live.
npx tsx tools/dk-byggefelt-probe/measure-tier1-reach.ts --strata 40 --per 25

# A fast smoke run
npx tsx tools/dk-byggefelt-probe/measure-tier1-reach.ts --strata 8 --per 2

# The live axis-order + pagination facts this depends on
U="https://geoserver.plandata.dk/geoserver/wfs"
UA="PRYZM-BIM/1.0 (site-feasibility research; pryzmhello@gmail.com)"
# 4326 bbox is lon,lat — returns Silkeborg features with lon/lat coordinates
curl -sS -A "$UA" "$U?service=WFS&version=2.0.0&request=GetFeature\
&typeNames=theme_pdk_byggefelt_vedtaget&outputFormat=application/json&srsName=EPSG:4326&count=2\
&CQL_FILTER=BBOX(geometri,9.528,56.170,9.535,56.176,'EPSG:4326')"
# startIndex really pages
curl -sS -A "$UA" "$U?...&startIndex=1&CQL_FILTER=BBOX(geometri,531400,6224400,531600,6224600,'EPSG:25832')"

# DAWA — free, keyless, account-free, already EPSG:25832
curl -sS "https://api.dataforsyningen.dk/jordstykker?x=531460&y=6224480&srid=25832&format=geojson"
```

**Verification run this session:** `pnpm --filter @pryzm/site-parcel-data test` → **1416 passed**
(was 1380); `npm run test:server` → +19 new, one **pre-existing** unrelated failure in
`catastroBlock.test.ts` (verified failing on the parent commit too); root `npx tsc --noEmit` →
**88 = 88**; `npm run check:isolation` → clean; `eslint` on every changed path → clean.

⚠ **Two honest verification limits.**
1. **The `apps/editor` vitest suite could not be run** — this worktree has no `node_modules`, so
   every editor test fails at import (`Cannot find package '@pryzm/climate-host'`), unrelated to this
   change. The L5 edit is therefore covered by typecheck and review, **not** by its own suite.
2. For the same reason the ROOT `tsc` cannot resolve `@pryzm/site-parcel-data`, so it was silently
   **skipping** the new `siteDispatch.ts` calls rather than checking them. That hole was closed by
   typechecking the exact call shapes against the real package types through a temporary
   path-mapped `tsconfig` (clean; the only error was an unrelated missing `ulid` dev dependency).
   Without that step the "88 = 88" figure would have been a measurement of nothing.

---

## §9 — Evidence chain (G11)

| # | Claim | How obtained | Date | State |
|---|---|---|---|---|
| T1 | Binding denominator 13,629 | live `resultType=hits`, re-read at the top of the measurement run | 2026-07-31 | **VERIFIED-LIVE** |
| T2 | 20.4 % multi-part / 1.0 % holed / 78.6 % old-adaptable | n = 1,000 systematic, real pipeline | 2026-07-31 | **MEASURED** (systematic, not random) |
| T3 | Adapter reach 78.6 % → 100.0 % | same run, same sample | 2026-07-31 | **MEASURED** |
| T4 | **End-to-end 44.0 % → 47.5 %; `non-convex-both` = 47.2 %** | same run, joined to real DAWA parcels | 2026-07-31 | **MEASURED** — ⚠ the load-bearing finding |
| T5 | 4326 bbox axis order is lon/lat; `startIndex` pages | live WFS requests | 2026-07-31 | **VERIFIED-LIVE** |
| T6 | DAWA gives free keyless 25832 parcel polygons | 1,000 live per-point lookups, 0 discards | 2026-07-31 | **VERIFIED-LIVE** |
| T7 | Multi-part / hole / degeneracy behaviour | 23 new behavioural tests, each with a passing CONTROL before the mutation | 2026-07-31 | **VERIFIED (test)** |
| T8 | Proxy keeps failure ≠ absence ≠ truncation apart | 19 new server tests incl. a truncated-200 case | 2026-07-31 | **VERIFIED (test)** |
| T9 | A real DK click places a footprint | code path wired; **not yet exercised against production** | 2026-07-31 | ⚠ **UNVERIFIED-LIVE** — needs a deploy + a Danish plot click |
| T10 | Parcel-side coverage | — nothing computed — | — | **UNKNOWN** → S1 |

⚠ **T9 is the honest gap in this document.** Every layer is unit-tested and the data facts are
verified live, but nobody has yet clicked a Danish parcel on `pryzm.fly.dev` and seen a byggefelt
footprint render. Until that happens this is *wired*, not *proven in production*.

---

*Related: [`DK-BYGGEFELT-PRODUCER.md`](./DK-BYGGEFELT-PRODUCER.md) §8 (S2/S3/S4/S5/S8/S10) ·
[`BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md`](./BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md) ·
`DENMARK-GAP-ROADMAP.md` G2/G3/G6/G11 · ADR-0270 (the `GeometricRule` union) · ADR-0279 §2 ·
C58 §1.4/§1.9/§2.2 (KG-4) · L-449 · L-585 · L-610 · L-616 · L-619 ·
[[context-data-honesty-family]] · [[probe-can-be-wrong-three-ways]] ·
[[identity-bootstrap-gate-offline-legislation-pattern]].*
