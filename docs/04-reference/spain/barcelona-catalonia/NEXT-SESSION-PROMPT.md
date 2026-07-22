# Next-session prompt — PRYZM (hand-off, 2026-07-22, v280)

Paste this whole file to start the next Claude Code session.

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
| 6 | Renders correctly | — | ❌ still unmeasured |

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

⇒ **LIVE END-TO-END = 24.2% × 83.0% × 78.3% = 15.7%**, before layer 6. Quote this, not 24.2%.

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
