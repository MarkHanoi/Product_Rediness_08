# Next-session prompt — PRYZM (hand-off, 2026-07-22, **v281 — FINAL**)

Paste this whole file to start the next Claude Code session.

> ## ⚠ FINAL-STATE CORRECTIONS — these OVERRIDE the body below wherever they disagree
>
> The body was written at **v280**, mid-session. Four things changed after it:
>
> 1. **LIVE IS v281, NOT v280.**
> 2. **THE R2 BUCKET CORS POLICY LANDED.** The body's *"delete the proxies WHEN CORS lands"* is now
>    simply *"delete the proxies"* — `server/contextTilesProxy.js` and `server/catalogAssetProxy.js`
>    are dead weight. ⚠ **But confirm from the founder's NETWORK TAB that R2 is read DIRECTLY first.**
>    A bundle grep **cannot** tell a dead fallback constant from an active code path — that exact
>    ambiguity is what let §L-570-BUNDLE-PROOF pass while every asset was being CORS-refused.
> 3. **L-577b IS FIXED.** The body may still describe *"on selection the card disappears"* as
>    unreproduced. It was root-caused (a `position: fixed` assumption in the SHARED `makeDraggable`
>    utility, never checked, against a `position: absolute` panel) and fixed at the utility, with 5
>    tests. See the L-577 audit row. **(c) "the parcel looked wrong" is still open.**
> 4. **L-583 IS NOW IN THE MASTER AUDIT.** It previously existed only as a standalone doc, so a
>    reader working from the audit alone would not have learned that **13b is unblocked**
>    (coverage **24.2% → 33.0%**), that **L-528 resolved in our favour**, or that **12b needs a
>    different SHAPE of rule**.
>
>
> 5. **⚠ TWO THINGS LANDED AFTER EVEN THESE CORRECTIONS — BOTH CHANGE THE PLAN BELOW:**
>
>    **(a) THE "clamp + monotonicity guard" PLAN IS NOW JUST "clamp".** The guard was BUILT and
>    MEASURED against the 65-block fixture: **3.1%, and ZERO detections that `insetDegenerate` did
>    not already make.** Structural, not tunable — **45/65 blocks collapse and STAY collapsed (0 → 0
>    is monotone, so the test is blind by construction), 11/65 recover, 9/65 never collapse.** The
>    offset does not sag on these blocks, it fails outright and everywhere. It ships as a cheap
>    always-honest tripwire for a rare second failure mode; **do not budget it as coverage.**
>    ⇒ **THE CLAMP IS THE WHOLE FIX.** ⚠ And the real number is worse than we thought: **63.1% of
>    blocks collapse AT THE 11 m ORDINANCE FLOOR** — the gentlest depth the solver is ever asked for.
>
>    **(b) L-584 — WE HAVE NO TERRAIN, AND IT IS A LEGAL DEFECT, NOT A VISUAL ONE.** PGM heights are
>    measured from the ***rasant*** (pavement reference level), with explicit ordinance machinery for
>    SLOPING frontages; we extrude from a FLAT plane at elevation 0. On sloping ground our published
>    height is wrong by the street's fall across the parcel — **metres in the Gotic** — and the
>    flat-ground assumption is nowhere stated. **Probe V6 (measure the fall across a sample of
>    frontages — DTM only, no LiDAR, no licence, no pipeline) is the cheapest high-information probe
>    on the board.** Its companion **V7** (how the ordinance fixes the reference level on a slope) is
>    NOT optional: a DTM tells you the ground shape, not which point the law measures from.
>    ⚠ **L-584 does NOT outrank L-581** — it moves correctness, not coverage. See
>    `docs/04-reference/spain/SPAIN-GEODATA-SOURCE-COVERAGE.md` and audit row L-584.
>
> Everything else in the body stands as written — in particular **§2 (the half-plane retraction)**
> and **§5 (the method note)**, which are the two sections most likely to save you a wasted session.


---

You are continuing PRYZM (a browser BIM SaaS; pnpm monorepo, mid-migration to "PRYZM 3"). Work with
the **"ship the probe before the fix"** discipline — and read the section on how that discipline
FAILED three times in the last session before trusting it blindly.

## THE GOAL LAST SESSION, AND WHERE IT LANDED

> *"When can I have a reliable 3D Site working fast and always? It is still not reliable!!"*

**The 3D Site is now wired end-to-end and every claim below was verified on production by direct
measurement, not inferred from a green job.** What remains is the founder's own judgement of speed
and completeness on screen — which is the one thing that could not be measured from the session.

| | Status | Evidence |
|---|---|---|
| Context buildings from baked R2 PMTiles, **zero live Overpass** | ✅ | `content-type: application/vnd.pmtiles`, `PMTiles` magic, real byte-ranges, measured on prod |
| Furniture GLB catalogue from R2 | ✅ | `model/gltf-binary`, `glTF` magic, measured on prod |
| Abort no longer falls back to Overpass (and gets 429'd) | ✅ v278 | founder console line eliminated by design |
| Refusal chip no longer truncates | ✅ v278 | `flex:none` + wrapping header row |
| Far-ring cap → whole-scene budget | ✅ v279 | Eixample **54% → 81%** of OSM rendered |
| Relation buildings restored to the bake | ✅ re-baked | Gòtic **79% → 121%** vs OSM ground truth |
| Proxied tiles no longer served stale for a week | ✅ v280 | `max-age=3600, must-revalidate` live |

---

## ⚠⚠ READ THIS FIRST — HOW "PROBE BEFORE FIX" FAILED THREE TIMES IN ONE SESSION

The discipline is right. It is **not sufficient**, and each failure had a different shape. All three
produced a confident, plausible, WRONG answer that survived until a second, differently-designed
probe killed it.

1. **THE PROBE WAS IN THE WRONG RUNTIME.** The R2 bucket sends **no CORS headers**, so a browser may
   not read any object in it. `curl`, `aws s3 ls`, the upload probe, the Range probe and every Node
   probe returned a clean `200`/`206` — **none of them enforce CORS. Only a browser does.** Four
   deploys were defeated by this. ⇒ *Ask which runtime the failure lives in before choosing the
   instrument.*
2. **THE PROBE MEASURED THE WRONG PROPERTY.** Matching tile linestrings to polygons by CENTROID gave
   "47% of buildings are being deleted" — terrifying and false. Eixample neighbours sit ~10 m apart,
   exactly the matching tolerance, so proximity could not distinguish a twin from a neighbour.
   Footprint **overlap** (bounding-box IoU) settled it: 743 twin / 58 distinct. ⇒ *A near-miss metric
   on dense data measures density, not identity.*
3. **THE PROBE MEASURED A DIFFERENT SYSTEM.** The first layer-5 sweep called
   `resolveAlcadaReguladora` on the RAW measured width, bypassing `resolveAmpladaDeVial` — the tier
   chain production actually applies. Every Cerdà street (19.5–19.9 m) came back as a band-edge
   refusal. Production snaps those to the 20 m declared quantum and answers. ⇒ *Import the production
   entry point, not the leaf function it happens to call.*

**The rule that survived all three:** a probe is only evidence if a DIFFERENTLY-DESIGNED probe agrees.
Where possible, check against an INDEPENDENT source (OSM ground truth via `/api/overpass` settled
both the tile-coverage questions outright).

---

## STATE OF THE 3D SITE — the four causes, in the order they were found

1. **L-578 — CORS.** CSP is OUR header on OUR document (which origins the page may ASK); CORS is
   THEIR header on THEIR response (whether the answer may be READ). v273 fixed the first; the second
   had never been set. **Worked around** with same-origin proxies (`server/contextTilesProxy.js`,
   `server/catalogAssetProxy.js`) — CORS is a browser policy and does not apply server-to-server.
2. **L-579 — a fixed far-ring cap of 900**, chosen when Overpass under-delivered and made binding the
   instant the tiles delivered the complete set. Replaced by `CONTEXT_TOTAL_MAX_BUILDINGS = 6000`.
3. **L-580 — `w/building` took WAYS ONLY**, dropping every multipolygon-relation building. Gòtic
   ground truth is 3,872 ways + **1,973 relations**; those are the courtyard blocks. Now `wr/`.
4. **§L-580-CACHE — a self-inflicted one.** The proxy marked the tiles immutable; a re-bake replaces
   them in place, so the fix would have been invisible for a day (a week while revalidating).

### ⇒ THE ONE THING STILL OWED TO THE FOUNDER, AND IT NEEDS THEIR EYES
`CONTEXT_TOTAL_MAX_BUILDINGS = 6000` is **NOT a measured frame-time budget** — no GPU capture was
taken, the same caveat already recorded on `CONTEXT_NEAR_MAX_BUILDINGS`. v279 raised the budget and
the re-bake raised how many footprints EXIST to fill it. **If the founder reports stutter while
panning dense fabric, that is this trade** — re-derive it from profiler evidence rather than nudging
the number.

### ⇒ DELETE THE PROXIES WHEN THE BUCKET CORS POLICY LANDS
`.github/workflows/r2-cors.yml` applies it via `PutBucketCors` **and replays a browser-shaped
request, failing the job if the header does not come back**. It is blocked ONLY because the repo's
R2 token is object-scoped (`AccessDenied`); it needs Admin Read & Write, or two minutes in the
Cloudflare dashboard. Exit criterion is written into `docs/04-reference/OBJECT-STORAGE-R2-DECISION.md`
§CORS. Both clients PREFER a configured direct base, so this is a **variable change, no code change**.

---

## THE SIX-LAYER DEFINITION OF DONE — now mostly measured

| # | Layer | Barcelona | Measured? |
|---|---|---|---|
| 1 | Zone identified | 100% of city ground gets constructed-or-refused | ✅ L-553 |
| 2 | No fabrication | fabricated setback triples 141 → 0 | ✅ L-553 |
| 3 | Rule pack exists | 24.2% of private buildable land (13a/13E) | ✅ n=273 |
| 4 | **Depth constructed** | **83.0%** | ✅ **L-576 live, n=100** |
| 5 | **Height constructed** | **78.3%** of the parcels that got a depth | ✅ **live, n=83** |
| 6 | **Geometry sound** | **36.9%** — dominated by L-581, our own bug | ✅ **live, n=65** |
| ⇒ | **ALL SIX LAYERS** | **5.8%** of parcels clear every layer today | ✅ composed from the above |

**LAYER 4 IS NOW A REAL NUMBER (live, n=100 Eixample manzanas through the production path):**
depth constructed **83.0%** · `block-dissolve-refused` 7.0% (6 `open-or-disjoint`, 1 `non-manifold`)
· `too-few-parcels` 7.0% · upstream error 3.0%.

- Both founder-reported refcats reproduce as `open-or-disjoint` — those two parcels genuinely fail,
  but the aggregate is 83%, **not** the ~8% a three-for-three streak implied.
- ⚠ The bbox-TRUNCATION hypothesis was stated BEFORE the run so it could lose, and it **lost**:
  failing manzanas sat 33–58 m clear of the window edge.
- ⚠ **A SEPARATE BUG SURFACED:** 7% match only ONE parcel for the manzana prefix out of ~300 in the
  bbox. That is a **grouping** failure, not a dissolve failure, and needs a different fix.
- ⇒ With layer 5 below: 24.2% × 83.0% × 78.3% = **15.7%** live end-to-end, before layer 6.
- ⚠ **NO tolerance was loosened** and the L-576 dissolve fix itself is **still OPEN**.

**LAYER 5 IS NOW A REAL NUMBER (live, n=83 — the manzanas that already have a depth):**
height constructed **78.3%** · band-edge REFUSAL **20.5%** · no measurable width **0.0%** · error 1.2%.

Provenance tier — which source actually decided each height:
`snapped-to-declared-quantum` **55.4%** · `measured-cadastral` **43.4%** · none 1.2%.
Height distribution: 20.75 m ×46 · 17.7 m ×15 · 14.65 m ×2 · 8.55 m ×2.

⚠ **THE 20.5% BAND-EDGE REFUSALS ARE THE GUARD WORKING, NOT A BUG** — count them separately. And
they are **not scattered**: they cluster on exactly two widths — ~7.6–8.0 m (straddling 8.55/11.6)
and ~15.3–15.5 m (straddling 14.65/17.7). **A declared-width source for just those two bands would
convert most of them into answers**, which makes this the highest-leverage remaining item on the
legal side.

⚠ **"no measurable street width" is 0.0%** — the ray-casting width measurement resolved EVERY block.
The long-standing assumption that *amplada de vial* availability was the blocker is **refuted**; the
blocker is band-edge ambiguity, which is a different fix (a declared source, not better geometry).

⇒ **LIVE END-TO-END = 24.2% × 83.0% × 78.3% × 36.9% = 5.8%.**

⚠ **5.8% SUPERSEDES the 15.7% quoted earlier the same day.** That figure stopped at layer 5 and never
checked whether the depth it counted was geometrically real; layer 6 then showed ~3 in 4 of those
depths are under-reported or refused for a reason that is NOT the ordinance (L-581). **Do not quote
15.7%.** ⇒ Fixing L-581 alone returns the same measurement to **~15.7%** — a 2.7× gain from one
geometry fix, with no new legal sourcing.

**LAYER 6 — GEOMETRY SOUND, LIVE (n=65 that cleared BOTH depth and height):** sound **36.9%** ·
`min-floor` degenerate **61.5%** · NOT-CONTAINED 1.5%. Binding: `min-floor` 61.5% · `interior-ratio`
24.6% · `max-cap` 13.8%. The 61.5% and ~10 of the 13 `interior-ratio` rows are **the same defect**
(L-581), so it is the DOMINANT behaviour of the depth solver on real Eixample geometry, not an edge
case. ⚠ The volume identity is **NOT MEASURED** — it needs `computeBuildableEnvelope`, which the
sweep does not run; the first draft "checked" it by comparing `insetArea × height` to
`insetArea × height`, a tautology that would have reported 100% and meant nothing.

**⇒ THE FULL PHASED PLAN TO MAXIMUM COVERAGE IS IN `V1-LAUNCH-IMPLEMENTATION-PLAN.md`** (last
section). Headline: 100% is the WRONG target — layer 3's ceiling is 75.8% because 24.2% of private
buildable land legally has NO private envelope and a refusal is the correct answer. The feasible end
state is **~88% definitive** (≈64% constructed + ≈24% correctly refused). The layers MULTIPLY, so
every layer needs ≥95% before the composed number moves.

**LAYER 6 IS STILL UNMEASURED** and needs `computeBuildableEnvelope` wired into the sweep (parcel
ring + block ring + clau + rule pack). Minimum check: the dispatched `insetPolygon` is
non-degenerate, is contained in the parcel ring (`checkEnvelopeContainment`, invertible by passing
the parcel ring as the "envelope"), and `maxVolumeM3 = insetAreaM2 × maxHeight`.

---

## OPEN, IN PRIORITY ORDER

1. **Founder judgement on the 3D Site** — speed and completeness on a Gòtic/Born parcel. Everything
   else in this list is subordinate to that answer.
2. **L-576 dissolve fix** — measured at 7% `open-or-disjoint`; the dominant geometry class is not yet
   root-caused. ⚠ **Do NOT loosen the tolerance**: a partial ring yields a confidently wrong depth.
3. **The manzana-prefix grouping bug** (7%, new) — one parcel matched of ~300.
4. **Layer 6** — the render check above.
5. **L-577b** — "card disappears on selection", founder-reported, **NOT reproduced**. Three causes
   need opposite fixes. **Ask which before writing code**; the founder has not yet answered.
6. **command-manager CI debt** — 64 calls vs threshold 55. Every deploy this session used
   `workflow_dispatch` + `bypass_ci_gate: true`. ⚠ The 9 calls are the documented dual-write pattern
   (`E.5.x P2`); removing one half silently breaks undo.
7. **Art. 328 / Art. 316 sourcing** — still blocked on the founder's RPUC session.

---

## STANDING RULES — do not drop these

- **Architectural soundness**: every change contract/spec/ADR-mapped. Put it in every subagent brief.
- **Commit with EXPLICIT pathspecs.** NEVER `git stash` / `git reset --hard` / `git add -A`.
- Root `npx tsc --skipLibCheck --noEmit` clean before committing (Fly build adds `noUnusedLocals`).
- **DEPLOY = push, THEN `workflow_dispatch` with `bypass_ci_gate: true`.** ⚠ A bare push
  auto-triggers a deploy that dies on the CI gate — that happened this session and v277 never
  shipped. Pushing is not deploying.
- **Legal fidelity outranks standardisation.** A wrong SHAPE is a confident answer to a different
  question, not an imprecise answer to the right one (C58 §1.11).
- Test on **https://pryzm.fly.dev**; **hard-refresh** (SW is network-first).
- **Say plainly what is unverified.** "Wired but not observed" ≠ "working".

---

# ⇒ END-OF-SESSION ADDENDUM (2026-07-22 late) — READ THIS BEFORE THE TABLE ABOVE

The body of this file was written mid-session. Four things changed after it, and two of them
**invert** advice given earlier in this same document.

## 1. ⚠ THE ORDERING FLIPPED — L-581 NOW OUTRANKS THE RPUC SESSION

Earlier this file says *"start the RPUC session, it is the long pole"*. **That was correct when
layer 6 was unmeasured. It is no longer correct.**

| | end-to-end |
|---|---|
| today | **5.8%** |
| + 13b ships | 7.9% |
| **+ L-581 fixed** | **20.4%** ⭐ |
| + full coverage | 63.6% |

**L-581 alone is a 2.6× gain, with zero external dependency**, and while it is open PRYZM states
*"Art. 242.2 cannot be satisfied on this block"* on the strength of our own offset failing. It is
also a **multi-city** fix — Madrid 2/4 and Córdoba 0/3 were blocked by the same depth path.
**Start here.**

## 2. ⚠ THE L-581 REMEDY IS NOT THE HALF-PLANE SWAP — THAT RECOMMENDATION WAS RETRACTED

An adversarial second opinion (`L-581-SECOND-OPINION-PROMPT.md`) demolished it, and the fixture
confirmed the reviewer was right:

- The load-bearing claim — *"47–89% free area after eroding 30 m from every frontage is physically
  impossible"* — **was wrong.** The call is `{front: d, side: 0}`, so **only front edges erode**. The
  outlier blocks have **25–36% front-edge fraction**; the control where both methods agreed to 0.2 m
  has **71%**. Large remaining area is the *expected* behaviour of an anisotropic offset.
- Half-plane intersection **over-states** free area at convex front–front corners (the true offset
  rounds the corner), i.e. it can **over-state buildable depth** — fabrication in the direction
  C58 §1.4 exists to prevent.

**THE PLAN INSTEAD:** in `insetPolygonPerEdge`, **CLAMP a reversed edge's contribution instead of
DROPPING its line** (dropping abandons the constraint and cascades), **plus a monotonicity guard in
`solveBlockDerivedDepth` that REFUSES** with an honest reason when `interiorFreeAt` is measured
non-monotone across the bisection's own sample points. Fixture for offline verification:
`scratchpad/l581-blocks.fixture.json` (65 blocks, front/total edge counts, convexity recorded).

⚠ **All 65 blocks carry 10–43 REFLEX vertices — ZERO are convex.** An earlier claim that Eixample
illes are "convex-ish" was wrong; weigh the measurements, not that rationale.

## 3. CLOSED SINCE THE BODY OF THIS FILE WAS WRITTEN

- **L-528 — RESOLVED, our 20,75 m was CORRECT.** 22,40 m is the *alçada reguladora incrementada*
  (Art. 21, Ordenança de l'Eixample, Barcelona's own). Fixed in code — see L-583 §3.
- **L-577b — founder REPRODUCED it, and it was NONE of the three candidates**: clicking the panel
  HEADER (a drag handle) on a `position: absolute` panel whose `left` was written in viewport space.
  Fixed at `makeDraggable`.
- **A3 — ANSWERED. `13b` INHERITS Art. 242's 30%**, on a *structural* argument (L-583 §9). ⇒ **13b is
  the week-of-config branch and is now unblocked.**
- **L-578 — CORS is live**; both clients read R2 direct again (v281). The proxies are unused and can
  be deleted.

## 4. STILL OPEN, IN ORDER

1. **L-581** — per §1/§2 above.
2. **Estimated-card render race** — the generic default pack SOLVES AND PAINTS before the Barcelona
   resolver refuses (`§ENVELOPE-RESOLVE-DIAG … maxHeight=12 m` precedes `§L-553 REFUSAL` in the
   founder's own console). L-553 removed the estimated fallback from the FINAL answer, not the
   INTERMEDIATE one, and `§ENVELOPE-REINSET` can re-derive it from PERSISTED generic setbacks.
3. **13b rule pack** — unblocked; cite **Art. 242 via Art. 326**, never Art. 328 (which has no depth
   rule — citing it would be a fabricated attribution of the L-526 kind).
4. **13E gap** — the *Conjunt Especial de l'Eixample* overlay is not encoded.
5. **12b** — a NEIGHBOUR-SURVEY rule, not a table. ⚠ **BLOCKED on surveyed heights**: our context
   layer is **0,9% surveyed** (L-582), so averaging it into a legal height would be fabrication.
6. **Founder-gated:** the A3 verbatim scoping sentence (upgrades tier, does not change the answer).

## 5. THE METHOD NOTE THAT OUTLIVES ALL OF THE ABOVE

**Six confident hypotheses died in one session**, one of them killed by a review written to invite
demolition. The three failure shapes are in §"HOW PROBE BEFORE FIX FAILED THREE TIMES" above; the
fourth, fifth and sixth were the mixed-vs-uniform root cause, the convexity rationale, and the
half-plane recommendation. **A probe is evidence only once a differently-designed probe agrees, and
an INDEPENDENT source beats a cleverer version of the same one.**
