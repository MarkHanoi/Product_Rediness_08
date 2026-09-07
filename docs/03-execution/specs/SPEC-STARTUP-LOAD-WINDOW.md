# SPEC — The start-up load window (§STARTUP-LOAD-ORDERING · §STARTUP-BUDGET)

> **What this pins:** that the site load starts on the GEOCODE and not on any UI event, and the
> measured verdicts on the three costs the founder's own Barcelona console shows inside the 18.5 s
> from `geocode:end` to `ready`.
>
> **Status:** RATIFIED-BY-TEST 2026-09-07 (lane STARTUP-PROVE · L-13109 / L-13110 / L-13111 / L-13112),
> **§1 and §2 AMENDED 2026-09-07 (lane NAME-CARD-OUT · L-13173) — the "Name your project" card this
> spec was written around HAS BEEN REMOVED at the founder's request.** §1 is enforced by three spec
> arms and was proven falsifiable by mutation. §2 is enforced. §3 and §4 are MEASURED VERDICTS with
> no code change — read them before opening either.
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

⛔ **THE CARD THAT USED TO SPEND THAT FIRST SLICE IS GONE (L-13173).** It only ever bought time if
the load was already running when it went up — and by the time §STARTUP-REVEAL-NOT-GATED-ON-CONTEXT
(`d1ecb2fe`) removed the reveal's wait on the context warm, there was little left to buy. See §1.

---

## 1 — THE LOAD-BEARING INVARIANT: the load starts on the GEOCODE, not on any UI event

> ⚠ **AMENDED 2026-09-07 (L-13173). THIS SECTION USED TO READ "the warm/load STARTS BEFORE THE CARD
> RESOLVES", and the card it names no longer exists.** The founder asked for it — *"Maybe add
> straight after a new modal asking for the name of the project — like that gives you time"* — when
> `geocode:end → split-mounted` was 22.8 s **because the reveal awaited the context warm**. That gate
> was removed, so the card became a step between him and his site and he asked for it back out:
> *"Remove / Exclude the project name — keep it as before — default name based on location — and a
> code"*. **The invariant did not go with it; it got stronger.** Nothing is raised between the
> geocode and the split at all, so there is no user event that COULD gate the load.

**The wiring, in execution order** (`GlobeHeroSearch.descendAndHandOff` drives it, not the
controller's source order):

1. `warmContextCache(lat, lon)` fires at the **`city`** stage — `markStartupPhase('context-warm:start')`,
   `warmAllContextLayers()` for every non-building layer, and `this.contextWarm =
   fetchContextBuildingsNearAndFar(...)` **held, never awaited**.
2. `onParcelArrival(picked)` fires at the **`parcel`** stage. Inside it, in this order:
   a. `this.revealInFlight = this.revealSplitAtParcel({...})` — kicked off, **not awaited**;
   b. `this.retireLocationCard('parcel-arrival')` — the *"Where is your project?"* card comes down
      the instant its question is answered (§ONE-CARD-AT-A-TIME, L-13130), and **nothing replaces it**;
   c. `void this.applyProjectName(startupProjectName(picked.address, this.resolveProjectId())).catch(...)`
      — a real `persistence.client.rename`, fire-and-forget.

**The name:** `Barcelona — 8B34` — the geocoded place, the em dash the pre-location default already
uses, and **the last four alphanumerics of the project id**. ⚠ The incumbent `2026-09-07 18:31` stamp
was rejected on three readings of the hub grid: `.ph-card-meta` already prints a date one line below
the name; the two dates would disagree (`updatedAt` moves, a name does not); and `.ph-card-name` is
`nowrap` + `ellipsis`, so a long name is truncated **from the end** — exactly where a disambiguator
sits. Four characters survive that. The code is a literal substring of the id, so it is a real handle
rather than a decoration.

**Enforcement — `apps/editor/src/ui/onboarding/__tests__/startupLoadOrdering.spec.ts`:**

| Arm | What it observes | How it fails |
|---|---|---|
| **A — behavioural**, over the REAL `GlobeHeroSearch` | the warm is started from a port, its promise held; the reveal is kicked off from `onParcelArrival` before the name is written | ⭐ **the falsifying case**: the warm and the reveal both SETTLE while `document.body` holds **zero** children and no event has been dispatched. Re-add a card under any name and this goes red on the first line. A second arm gives the rename a promise that never settles and requires the reveal to complete anyway. |
| **B — source**, over the real `OnboardingStepController` | `this.revealSplitAtParcel(` before `this.applyProjectName(autoName)`; no `await` on the write; `markStartupPhase('context-warm:start')` still in `warmContextCache`; **no `showStartupProjectNameCard` / `onboardingCardSlot` anywhere, and no `createElement` in the arrival handler** | a reorder — or a re-added card — in the production file. Arm A drives fakes and by construction cannot see one. |
| **C — the two things the removal must not break** | the SKIP-LOCATION branch keeps its own *"Step 2 of 2 · Name"* step (with no location there is no place to name the project after); and the largest `setStepIndicator(n, …)` still equals the `N` the chip claims | a step added or removed without the denominator moving with it. |

**§MUTATION PROOF** (run before commit, all reverted):

- a `<div>` appended to `document.body` in the arrival handler → **2 failed | 16 passed**,
  *expected 1 to be +0*.
- the reveal's completion mark chained behind the rename promise → **2 failed | 16 passed**,
  *expected [ 'context-warm:start', …(4) ] to include 'reveal:split-mounted'*.
- the step chip's denominator changed to 5 in the real controller → **1 failed | 17 passed**,
  *expected 5 to be 4*.

> ⛔ **WHAT THIS REPLACED, because the shape recurs.** The original assertion built its OWN array,
> pushed `'context-warm:start'` and `'reveal:kicked-off'` into it two lines apart with no production
> code between them, and asserted that the literal pushed first had a lower index than the literal
> pushed third. It would have printed PASS with the load wired as a hard gate, with
> `warmContextCache` deleted, or with `GlobeHeroSearch` deleted. **Never restore a self-pushed-array
> ordering test here** (§COMMITTED-IS-NOT-REACHABLE, §L-851).

---

## 2 — The regression paths, each pinned

| # | Invariant | Where |
|---|---|---|
| 2.1 | **No step between the location and the site.** Nothing is raised on the location path — no modal, no field, no Enter-to-continue. Asserted as a CENSUS of `document.body`, not as the absence of one element id, so a replacement card fails it whatever it is called. | ordering spec, falsifying arm |
| 2.2 | **The name is a REAL write, best-effort.** `applyProjectName(name)` → `runtime.persistence.client.rename(projectId, name)` — the same path the hub's rename modal uses, never a second naming write. It is `void`-ed with a `.catch`, so a rename that hangs, throws or rejects cannot hold or break the reveal. An empty name is a NO-OP, not a write of `""`; no place ⇒ no write at all. | ordering spec Arm B + `startupProjectName.spec.ts` |
| 2.3 | **The descent is unchanged.** Every camera target the stage chain produces is issued before the name is written; the naming path knows nothing about the camera, and not one node is appended to `body`, so the globe stays visible AND interactive — which is what §STARTUP-SLOW-DESCENT was for. | ordering spec §STARTUP-SLOW-DESCENT block |
| 2.4 | **The SKIP-LOCATION naming step survives.** *"Step 2 of 2 · Name"* / *"No location, no plot"* still asks, still renames through `applyProjectName`, still ends in `landInCanvasWithUnderlay()`. The two steps share `applyProjectName`, so deleting the wrong one was the live risk in L-13173. | ordering spec Arm C |
| 2.5 | **`retireLocationCard()` still owns the location card, and `leaveLocationStep()` still owns the globe only.** Two halves, two moments (§REVEAL-FLIGHT-COMPLETE; releasing the globe early is the §22 black-3D-pane hazard). This is the surviving half of L-13130 — the slot module that sequenced it against the name card went with the card. | ordering spec Arm B |

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
