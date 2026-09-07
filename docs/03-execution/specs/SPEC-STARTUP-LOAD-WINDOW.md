# SPEC — The start-up load window (§STARTUP-NAME-WHILE-IT-LOADS · §STARTUP-BUDGET)

> **What this pins:** the ONE invariant the "Name your project" card rests on, and the measured
> verdicts on the three costs the founder's own Barcelona console shows inside the 18.5 s from
> `geocode:end` to `ready`.
>
> **Status:** RATIFIED-BY-TEST 2026-09-07 (lane STARTUP-PROVE · L-13109 / L-13110 / L-13111 / L-13112). §1 is enforced by two spec arms and
> was proven falsifiable by mutation. §2 is enforced. §3 and §4 are MEASURED VERDICTS with no code
> change — read them before opening either.
>
> **Governance:** conflict order VISION → ARCHITECTURE → contracts → ADRs → SPECs. Authorities:
> C06 (UI shell / boot), C12 (context), C59 (view regions), `SPEC-PROJECT-OPEN-CREATE-PIPELINE.md`
> §f (the §STARTUP-BUDGET phase names). §CONTEXT-DATA-HONESTY governs every number below: a duration
> printed without its provenance reads as a price, and two of the three costs here are not prices.

---

## 0 — The founder's budget, verbatim

`geocode:end → ready` = **18.5 s**, of which:

| Slice | ms | What it is |
|---|---|---|
| deliberate slow descent | 11 800 | §STARTUP-SLOW-DESCENT — **asked for**, not waste. He wants to watch it. |
| tiles landing AFTER the descent settled | 4 400 | The tail worth attacking. |
| everything else | ~2 300 | geocode → warm kick-off → split mount. |

The card exists to spend the first slice on something useful. It only does that if **the load is
already running when the card goes up**.

---

## 1 — THE LOAD-BEARING INVARIANT: the warm/load STARTS BEFORE the card resolves

> ⛔ **If dismissing the card is what STARTS the load, wall-clock gets WORSE and only the
> perception moves.** The feature is then a lie with a nice animation.

**The wiring, in execution order** (`GlobeHeroSearch.descendAndHandOff` drives it, not the
controller's source order):

1. `warmContextCache(lat, lon)` fires at the **`city`** stage — `markStartupPhase('context-warm:start')`,
   `warmAllContextLayers()` for every non-building layer, and `this.contextWarm =
   fetchContextBuildingsNearAndFar(...)` **held, never awaited**.
2. `onParcelArrival(picked)` fires at the **`parcel`** stage. Inside it, in this order:
   a. `this.revealInFlight = this.revealSplitAtParcel({...})` — kicked off, **not awaited**;
   b. **only then** `showStartupProjectNameCard({...})`, which returns `void`.

**Enforcement — `apps/editor/src/ui/onboarding/__tests__/startupNameCardLoadOrdering.spec.ts`:**

| Arm | What it observes | How it fails |
|---|---|---|
| **A — behavioural**, over the REAL `GlobeHeroSearch` | the warm is started from a port, its promise held; the card is raised from `onParcelArrival` | ⭐ **the falsifying case**: the test resolves the warm **without touching the card** and requires that it SETTLED while the card was still mounted and uncommitted. A card that gated the load cannot reach that line — the warm would still be pending. |
| **B — source**, over `OnboardingStepController.onParcelArrival`'s real body | `this.revealSplitAtParcel(` appears BEFORE `showStartupProjectNameCard(`; no `await` / `return` on the card; `markStartupPhase('context-warm:start')` lives in `warmContextCache`, not in the arrival handler | a reorder in the production file. Arm A drives fakes and by construction cannot see one. |

**§MUTATION PROOF** (run before commit, both reverted):

- warm moved so it starts from `onCommit` (the "card gates the load" shape) → Arm A's falsifying
  case FAILED: *expected [ 'flight:parcel-arrival', …(2) ] to include 'context-warm:done'*.
- the two statements in the real `onParcelArrival` swapped → Arm B FAILED: *expected 825 to be less
  than 733*.

> ⛔ **WHAT THIS REPLACED, because the shape recurs.** The original assertion built its OWN array,
> pushed `'context-warm:start'` and `'reveal:kicked-off'` into it two lines apart with no production
> code between them, and asserted that the literal pushed first had a lower index than the literal
> pushed third. It would have printed PASS with the card wired as a hard gate, with
> `warmContextCache` deleted, or with `GlobeHeroSearch` deleted. **Never restore a self-pushed-array
> ordering test here** (§COMMITTED-IS-NOT-REACHABLE, §L-851).

---

## 2 — The four regression paths, each pinned

| # | Invariant | Where |
|---|---|---|
| 2.1 | **Enter AND Escape both commit a default.** Enter commits what is typed (empty → the geocoded default); Escape / Skip / close commit the default. Escape is bound at the DOCUMENT in CAPTURE, so it works when focus has moved to the globe and nothing downstream can swallow it. A naming card that can refuse to close is a NEW GATE on the start-up path — §REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH (L-942). | both specs |
| 2.2 | **The name is a REAL write, best-effort.** `onCommit` → `this.applyProjectName(name)` → `runtime.persistence.client.rename(projectId, name)` — the same path the hub's rename modal uses, never a second naming write. It is `void`-ed with a `.catch`. A rename that THROWS synchronously and one that REJECTS asynchronously both still close the card. An empty name is a NO-OP, not a write of `""`. | ordering spec §L-942 block |
| 2.3 | **The descent is NOT paused while the card is up.** Every camera target the stage chain produces is issued before the card exists; the card knows nothing about the camera. Dismissing it issues NO further flight (no resume, no catch-up). No backdrop element exists at all — the card is the ONLY node appended to `body`, so the globe stays visible AND interactive, which is what §STARTUP-SLOW-DESCENT was for. | ordering spec §STARTUP-SLOW-DESCENT block |
| 2.4 | **The card is NEVER auto-dismissed when the load wins the race.** With half-typed text in the field, both the warm and the split mount are resolved and the card must still be mounted with the text intact. Yanking a focused text field out from under a cursor is worse than the wait it saves. | ordering spec |

---

## 3 — VERDICT: the duplicate baked reads are a HIT and a MISS, at two different layers

The founder's first Barcelona load prints, on one page load:

```
§CTX-PMTILES-READER parks:   800 green area(s) from 81 baked tile(s)   ×3 — 5672 / 3401 / 3400 ms
§CTX-PMTILES-READER landuse: 2265 area(s)      from 30 baked tile(s)   ×3 — 3754 / 1486 / 1486 ms
buildings 5440 near + 8560 far of 15775                                 ×3
```

> ⚠ **IT IS NEITHER "THREE CACHE MISSES" NOR "THREE REDUNDANT DECODES OF HITS". It is BOTH, one
> layer apart — and either verdict alone leads to the wrong fix.**

- **At the TILE layer it is a HIT.** `contextTiles.tileInFlight` registers each tile's promise
  BEFORE it settles, so callers 2 and 3 share caller 1's download. The three **equal END times**
  (5672 − 3401 ≈ 5672 − 3400 ≈ 2.27 s of stagger) are the signature of one download, not three.
  **No duplicate bytes.** That is §CTX-READ-PROVENANCE's finding and it stands.
- **At the COLLECTION layer it was a MISS.** `fetchContextParks` / `fetchContextLanduse` had a
  RESOLVED-VALUE cache and **no in-flight map**, so each of the three ran a full
  `readContextTileFeatures`: a tile-list computation, a `Promise.all` over 81 (resp. 30) tiles, a
  **per-read bbox CROP of every feature in them**, and a full collection build (800 rings / 2,265
  areas). The cache is populated on COMPLETION, so it cannot help callers issued while the first
  read is still in flight — and on the onboarding flow they always are (`warmAllContextLayers` at
  the `city` stage, `CesiumViewport.loadContext*` at pane mount, the re-render after the terrain
  sample lands).
- **Buildings ×3 is a PRINTING artefact only.** `contextBuildings.fetchForBbox` has carried the
  guard since **§CTX-ONE-READ-PER-BBOX (L-585)**; the three lines are three callers each printing
  their own near+far aggregate over one shared read.

**THE ROOT CAUSE: L-585 was applied to buildings and never propagated.** `contextRoads` /
`contextWater` carry the older §L-323 FIX B form. **Parks, landuse, rail, trees, furniture and
canopy carried neither.**

**FIXED (2026-09-07, L-13110):** parks + landuse now de-duplicate **above** the tile read, in the
L-585 shape — the shared read takes **no** `AbortSignal` (one caller's abort must not hand the
others an empty result for a read that was nearly done) and each caller honours its own signal
after the await, so an abort cancels the RENDER, which is what it was always for (§L-579).

**Enforced by `apps/editor/src/ui/geospatial/__tests__/contextOneReadPerBbox.spec.ts`** — the
subject is the NUMBER of `readContextTileFeatures` calls for N concurrent callers of one bbox: was
3, must be 1. §MUTATION PROOF: removing the parks guard turned two cases red with
*expected [ 'parks', 'parks', 'parks' ] to deeply equal [ 'parks' ]*.

**STILL OPEN — the same gap, four layers over:** `contextRail`, `contextTrees`,
`contextFurniture`, `contextCanopyBaked` have no bbox-level guard. Furniture and canopy currently
404 (see §4), so their marginal cost is ~0 today; rail and trees are baked and real. Same fix, same
shape.

---

## 4 — VERDICT: the three 404 layers — the manifest cure is BLOCKED ON REACHABILITY

`canopy`, `sea` and `furniture` each 404 on the archive HEADER read, and §CTX-RANGE-COALESCE
re-issues individually first, so each costs **~2 requests before §CTX-KNOWN-MISSING memoises it**
— ~6 requests, once per session, on the hot path where they queue behind Cesium's terrain stream.

The proposed cure is sound and the artefact exists: `tileset-manifest.json` is published BESIDE the
tiles by `tools/context-bake/merge-tiles.mjs`, carries `layers: {…}`, and §MANIFEST-LAYER-CARRY-FORWARD
is what makes "not named ⇒ not live" a true statement rather than an accident. Measured against the
last snapshot (`tools/coverage-ledger/manifest-snapshot.json`, probed 2026-09-06):
`layers = [trees, rail, parks, buildings, landuse, water, roads]` — **exactly the seven that answer,
and none of the three that 404.** Reading it once would make an unbaked layer cost **zero**
requests.

> ⛔ **IT CANNOT BE IMPLEMENTED CLIENT-SIDE ALONE TODAY, AND SHIPPING THE CLIENT HALF WOULD BE DEAD
> CODE.** `VITE_CONTEXT_TILES_URL` is the **same-origin proxy path** in this repo
> (`contextTiles.ts` L661a note; `terrain-bake.yml:268`), and
> `server/context-delivery/contextTilesProxy.js` is an **allowlist, not a pass-through**: it accepts
> `CONTEXT_TILE_LAYERS` only, so `tileset-manifest.json` gets OUR 404. A client that fetched it
> would fail open on every load and change nothing (§AUTHORED-BUT-UNWIRED — audit REACHABILITY, not
> existence).

**What unblocks it, precisely:**

1. `contextTilesProxy.js` — serve `tileset-manifest.json` from the upstream base (a second route or
   an allowlist entry). ⚠ `server/__tests__/contextDeliveryRouter.test.ts` asserts exact per-path
   route counts and must move in the same commit.
2. A client module that reads it ONCE per session and pre-seeds the §CTX-KNOWN-MISSING memo for
   layers the manifest does not name.
3. ⛔ **KEEP THE HONEST `unavailable` VALUE — only the round-trip goes.** An absent layer must stay
   distinguishable from a failed one (§CONTEXT-DATA-HONESTY: failure and empty are different
   values), and the memo's `reason` must NAME the manifest as its source so a wrong manifest is
   diagnosable rather than silent. A manifest that is unreadable or unparseable must change
   **nothing**.

**Adjacent finding, same file:** `canopy` is not in `CONTEXT_TILE_LAYERS` at all, so a canopy read
through the proxy gets **our** 404, not the upstream's — the exact allowlist-drift defect that
file's own header documents for `rail`/`trees` ("our own 404 is indistinguishable from *never
baked*"). It does not change what renders; it changes who is blamed.

---

## 5 — VERDICT: FIFO ordering — measure, do not reorder

§DRAPE-COST-ATTRIBUTION shows **parks spent 8 414 ms waiting for terrain and 18 ms on its own
work**, queued behind a 22 793-point / 7 056 ms buildings sample.

**The single shared flight is the right fix and works.** `maxConcurrentFlights` **MUST stay 1** —
two in the air re-download the same tiles, which is the whole §STARTUP-GROUND-SAMPLE-COALESCE
finding (`sampleTerrainMostDetailed` does not read the globe tile cache and does not share tiles
between calls). That invariant is **already pinned** in
`apps/editor/src/ui/geospatial/__tests__/groundSampleBatcher.spec.ts` — `maxConcurrentFlights`
must be 1 in the four-layer case AND in the founder's four-layers-plus-split-pieces shape, with the
`serializeMaxWaitMs` degradation the one case that may exceed it and must SAY so. **No new guard is
needed; do not weaken those.**

**On the open question — can a small later batch jump the queue, or the big sample be split?**
NOT ANSWERED, and deliberately not attempted, because both plausible changes are unmeasured:

- **Priority-jumping** moves time-to-FIRST-drape earlier and moves the big sample's completion
  later. It does not reduce total tile downloads at all. Whether that trade is a win depends on
  whether the founder reads "the parks appeared" as progress — a product question, not a perf one.
- **Splitting the 22 793-point sample** is the more promising axis (the first drape need not wait
  for all 12 tiles), but N sequential sub-flights serialise N tile downloads through the same FIFO
  and can make total wall-clock WORSE, while N concurrent sub-flights **break the max-1 invariant**
  and reintroduce the duplicate-download defect the batcher exists to remove.

**The decision criterion, so the next lane does not guess:** neither change may land without a
per-flight reading of *tiles requested* vs *tiles served from the browser HTTP cache*. The batcher's
`onFlush` already carries `sampled` / `resolved` / tile count and level; what it does not carry — and
what the batcher's own comment says is **NOT MEASURED and must not be asserted** — is whether the
second round-trip's tiles were cheap. Until that is instrumented, "split the sample" is a guess
with a plausible story attached.
