<!--
  Recovered 2026-09-09 from workflow wf_a4f83f97-e65 (29 agents, 26 completed, 3 killed by the
  session rate limit). Every number below was MEASURED live by that fleet against the running
  system, not read from a note. Written to the repo immediately because the fleet is gone and
  this plan is the expensive part.
-->

# Delaware → R2: the measured dispatch plan

**Goal:** the founder's demo site `38.781987, -75.089744` (Lewes, Sussex County, DE) renders with
Barcelona-grade context. **Acceptance is `/api/context-tiles/tileset-manifest.json` gaining a
`delaware` key** — not a green bake. Publish, not code, is the bottleneck here.

---

## ⭐ EXECUTED 2026-09-09 (lane DELAWARE-R2) — what actually happened

**ACCEPTANCE MET.** The live manifest carries `delaware` (merge run `34400724320`, mergedAt
`2026-09-09T20:31:27Z`):

```
top-level regions: 47 keys · delaware present: YES
regions.delaware = { stagedSet: "delaware", bakedAt: "2026-09-09T20:02:05.470Z",
                     bakeRunId: "34397872497", bakeGitSha: "bcebb042", heightJoin: "usas" }
```

| step | run | result |
|---|---|---|
| bake + stage | `34397872497` | **success**, ~7.5 min. NINE layers staged (7 required + `furniture` 91,682 B + `sea` 305,642 B), `optionalLayersNotProduced: ["canopy"]`, `heightJoinRegions: ["delaware"]` |
| gate probe (`layer=trees`, `engine=js`, `publish=false`) | `34400307114` | refused exactly as predicted — **only** the trees no-loss gate, naming the nine orphans |
| **trees publish** | `34400724320` | **success** — `merge complete — 1 layer(s), 47 region(s) in the bytes (47 expected)` |
| **buildings publish** | `34402000894` | dispatched 20:36Z, merge step began 20:49Z |
| **terrain** | `34403193933` | **success — LIVE**, `tiles/terrain/delaware/layer.json` 200, z0–10 |

### Corrections to this plan, from executing it

1. **The bake is ~7.5 min, not 25–60.** The repo regression `25 + 30 × pbfGB` over-predicts by ~3.5×
   at this size. The USAS sweep ran two swathes and did not truncate.
2. **A layer-scoped merge+publish is ~13 min for a small layer**, not the 8–173 min band — the
   download filter pulls only that layer's staged bytes. Budget by LAYER SIZE, not by the band.
   Disk was never close: the trees run reported **97.8 GB free** after its download.
3. **The Step 3 table was exactly right.** `expect=all` + `allow_unknown_regions=true` resolved to
   **47 expected**, zero missing-region refusals on any layer, and the only refusal was
   trees/rail/parks' no-loss gate naming the nine orphans — cured by `allow_region_removal`.
4. **`sea` and `furniture` are NOT unstaged.** The `layer` input's comment claimed no region had
   ever staged one; measured today, **7 sets carry furniture and 6 carry sea** (+ delaware = 8/7).
   Corrected in the workflow.
5. **The top-level `regions` block is rewritten on EVERY merge** (`merge-tiles.mjs:814`,
   `shippedRegions` from `participating`), so acceptance was reached on the **first** publish, not
   the seventh.

### ⛔ AND THE THING THE PLAN COULD NOT HAVE KNOWN — see `USA-DELAWARE-DEMO-SOURCES.md`

`§USAS-IS-EMPTY-IN-SUSSEX`. The bake passed its height gate at 19.6 % statewide and
`context-bake.yml`'s CITIES spot-check passed **with `checked=0`** — no Delaware row existed, so it
skipped all 37 and measured nothing. Probing the archive at nine points N→S:
**`solidRenderFraction` spreads 0.000 → 0.947, and seven of nine points — the founder's demo site
among them — read `unmeasured`, every height fabricated at the 9 m default.** Wilmington is at
Barcelona parity (0.947 vs 0.958); Lewes is at zero. USA Structures carries Sussex footprints and
**no HEIGHT at all** there (1,198 structures, 0 heights, read off the source directly), so this is a
SOURCING gap, not a defect. **"Barcelona-grade context" is achieved in New Castle and Kent and is
NOT achievable at the demo site on this height source.**

Instruments added: `tools/context-height-probe/sweep.mjs` (the spread),
`tools/context-bake/verify-published-region.mjs` (did the merge carry the region's bytes),
and a `wilmington delaware` row in the CITIES table.

---

---

## ⭐⭐ THE FINDING THAT CHANGES THE PLAN — "46 regions × 7 layers" IS FALSE

The live manifest was last written by `mergeRunId 34121618245` at 2026-09-07T15:11:28.949Z, and
**that run merged ONE layer: `mergedLayers: ['buildings']`.** The top-level 46-region block is
byte-identical to `layers.buildings.regions` and describes **buildings coverage only**. The other
six layers are `carriedForward: true` from three earlier runs and cover a **different 49-region
set**.

⛔ **For the USA this matters enormously:**

| | Coverage |
|---|---|
| **buildings** | state-level rows — `california`, `illinois`, `massachusetts`, `newyork`, `texas` |
| **the other six** | **city bboxes only** — `newyork`, `sanfrancisco`, `chicago`, `austin`, `houston`, `boston` |

**So "it's a bake-and-publish, the pipeline already works" is established for Delaware BUILDINGS
only.** No US region has ever shipped state-level roads, water, parks, landuse, rail or trees.
That leg is **unproven work, not a repeat** — and the earlier framing in
`USA-DELAWARE-DEMO-SOURCES.md` overstated it. Delaware appears in **no** layer.

Verified independently at the demo point: 25 covering z16 tiles, **25 absent, 0 read, 0 footprints**;
a direct PMTiles sweep across every zoom of all seven archives returns no tile, while the same code
returns tiles at NYC and Barcelona in the same run.
⚠ **All seven archive HEADERS report the point as in-bounds** — merged bounds are the worldwide
union. Header bounds are not evidence of coverage; only per-tile reads are.

---

## THE DISPATCH SEQUENCE

### Step 1 — bake + stage (`context-bake.yml`)
```
region = delaware        stage = true         publish = false
layer  = (blank)         footprints = osm     catastro_national = false
```
Slug is `delaware`. **Stop condition:** `tiles-staging/delaware/staging-manifest.json` readable, and
the §MEASURED-HEIGHT-GATE prints `✔ delaware (usas)`.

**Runtime ≈ 25–60 min** (timeout 330, not in play). The pbf is 22,080,735 B — the smallest US row.
The repo's own regression `minutes ≈ 25 + 30 × pbfGB` gives ~26 min; the real driver is the USAS
sweep (bbox 0.81° × 1.40° ≈ 2,835 cells at the 0.02° grid, against `massachusetts`'s ~24,000 which
completed).

**`sea` comes free.** It is `optional` but not `optIn`, so a plain region bake emits it. The
§SEA-IS-NOT-ONE-WORLD-RUN tranche rule governs a *layer-scoped* `layer=sea` stage across many
regions and does **not** apply to a single full bake.

### Step 2 — cheap gate probe (`context-merge-publish.yml`)
```
expect = all · layer = trees · engine = js · publish = false
allow_unknown_regions = true
```
Run this first and read the disk-guard output before committing to a 52 GiB merge.

### Step 3 — one dispatch PER LAYER
`engine=tile-join`, `publish=true`, `expect=all`, `allow_unknown_regions=true`, plus:

| layer | `allow_region_removal` |
|---|---|
| buildings · landuse · water · roads | *(blank)* |
| **trees · rail · parks** | `sanfrancisco,chicago,austin,houston,boston,riyadh,jeddah,dubai,abudhabi` |

---

## ⛔ THE TWO REASONS A NAIVE `expect=all` EXITS 1 TODAY

**(a) §ORPHAN-STAGED-SET.** Nine staged sets are not `bake.mjs` rows (`chicago sanfrancisco austin
houston boston dubai abudhabi jeddah riyadh`). `merge-tiles.mjs:622-625` dies on unknown staged
regions → needs `allow_unknown_regions=true`.

**(b) The no-loss gate is PER-LAYER, and three layers carry a stale 49-region record.**
`trees`/`rail`/`parks` still list all nine orphans; `landuse`/`water`/`roads` have no `regions[]` and
fall back to the tileset-wide 46. The staleness persists because unmerged layer records are carried
forward verbatim, and the 2026-09-07 buildings-only merge left them untouched.

⚠ **`expect=staged` would be WRONG here** — it sets `expected = [...staged]`, pulling the nine
orphans *into* the expected set, the opposite of what is wanted.

---

## WHAT `pending: true` ACTUALLY GATES — and the correction worth keeping

Under `expect=all` a pending row is expected **only when staged**; an unstaged one is listed by name
and **never refuses**. `expect=all` with `delaware` staged resolves to **47 regions**, not 132:
40 non-pending + 6 live-but-still-flagged-pending (`california gccstates illinois massachusetts
southkorea texas`, all still staged — which is what keeps `expect=all` viable) + `delaware`.

⛔ **The correction:** `pending` gates only the *expected set*. It does **not** gate the no-loss
gate, which reads the live manifest and is deliberately not flag-aware.

---

## ⭐ YOU DO NOT NEED TO RE-BAKE THE OTHER 46

The merge reads **staged bytes only** — the live `.pmtiles` is never an input; only the *manifest*
carries forward. That sounds like "re-stage everything", and it is not: `tiles-staging/` is an
**accumulator** and nothing prunes it. **Measured: 55/55 slugs return HTTP 200 and all 55 carry the
seven required layers.** Cost of adding Delaware = **one ~26-minute bake**, not 46.

What it *does* cost is merge disk, per layer:

| layer | staged input | ×2 (in+out) |
|---|---|---|
| roads | 28.22 GiB | ~52 GiB |
| buildings | 26.36 GiB | ~52 GiB |
| water | 12.73 | 25.5 |
| parks | 12.68 | 25.4 |
| landuse | 11.99 | 24.0 |
| rail | 1.39 | 2.8 |
| trees | 0.41 | 0.8 |

The 2026-09-07 buildings run succeeded at ~52 GiB, a **new proven lower bound** above the 47.2 GiB
the repo records. `roads` sits right at that mark — run Step 2 first.

---

## `heightJoin: 'usas'` — no key, no extra input, and Delaware passes

**Keyless** (`heightSources.mjs:361`: anonymous ArcGIS FeatureServer — no API key, no repo secret).
Dispatched purely by the row's `heightJoin`; there is no separate sweep input to set.

**Probed live, 2026-09-09:**
```
USA_Structures_View/FeatureServer/0/query?where=HEIGHT IS NOT NULL
  &geometry=-75.79,38.45,-74.98,39.85 … &returnCountOnly=true
→ HTTP 200 · 30.8 s · {"count":176699}
```
Exactly matches the recorded 176,699 (27.8 % state coverage). **Delaware passes
§MEASURED-HEIGHT-GATE with margin.**

⚠ **Gap:** `USAS_SWEEP_CURSOR` is read from env but wired to **no dispatch input**, so a truncated
USAS sweep cannot be resumed from the Actions UI. Not expected to bite at Delaware's size.

---

## ⚠ TERRAIN — AND THE EXPECTATION THE FOUNDER NEEDS **BEFORE** THE DEMO

Delaware terrain is **NOT live** (404 at the demo point; `california`, `maryland`, `newjersey`,
`pennsylvania` also 404). The only live US terrain is `newyork` — a ~10 × 13 km **Manhattan** tileset,
not the state. But the route is proven at country scale (`spain` national terrain verifies clean at
a non-city point), and Delaware's row already exists at `terrain.mjs:2340` with `geoidSepM -33.81`.
**Terrain is a bake-and-publish, not a build.**

⛔ **The expectation-setting point, and it is the one most likely to embarrass the demo:**
Barcelona reads as high quality partly because it has **515 m of relief**. Sussex County is **0–20 m
coastal plain**, so this same pipeline at genuine Barcelona parity will render the Lewes parcel
essentially **FLAT — correctly**. If the demo needs visible parcel-scale ground, that requires the
USGS 3DEP QL1 (1 m) route, which is ~60× finer than the Barcelona bar and is **additional work, not
parity work**.

⚠ Mapterhorn (the national terrain source) is **visual-only** and explicitly barred from being the
L-584 legal sampling source — it cannot support any grading, rasant or legal-height claim.

---

## THE BARCELONA PARITY TARGET — quote the FRACTIONS, never the count

In the ±0.008° ring around the Barcelona site (20 of 20 covering z16 tiles read, 0 absent, 0 failed):
**5,092 of 5,183 pieces carry `pryzm:height_src=measured-lidar`** → `assumedFraction 0.004`,
`solidRenderFraction 0.983`, heights min 2.5 / **median 25** / max 79.5 m.

⛔ **The absolute count is not safe to quote.** Every feature in the shipped tiles has a **null id**,
so the probe's seam de-duplication never runs; measured inflation is 14–18.8 %, putting distinct
buildings at ~4,300–4,450. The **fractions and the median are unaffected** — they are the parity
target. Delaware will be probed with the same tool and the same inoperative dedup, so the
Barcelona↔Delaware comparison stays valid.

---

## LOCAL PATH — technically yes, practically no
A local Delaware bake+stage is realistic (`bake.mjs` auto-detects `osmium`/`tippecanoe`/`duckdb` and
falls back to Docker). A local **merge+publish** means pulling ~26–28 GiB per layer, ~52 GiB free
disk, Docker, and R2 write keys — and `--engine js` is a disjoint-only fallback that refuses border
collisions, so it cannot do a real merge. **Use Actions.**

⚠ But note: Actions **CI** is red across six jobs, which blocks `deploy-fly.yml` via the CI gate.
It does **not** block `context-bake.yml` or `context-merge-publish.yml` — those are separate
workflows with no CI gate. The publish path is open even while the deploy path is not.

---

## ⭐⭐ EXECUTED 2026-09-10 (lane DELAWARE-DETAIL) — the other five layers, and what the instruments got wrong

The 2026-09-09 lane published **trees** and **buildings** and ran out of turn. The founder tested the
site next morning: *"I don't see roads, I don't see green areas."* His console named the cause layer
by layer, from the SAME 81 baked tiles — `roads: 0 way(s)` · `rail: 0 track(s)` · `parks: 0 green
area(s)` · `landuse: 0 area(s)` · `water: 0 area(s)`, against `buildings: 777 footprint(s)`.
**The reader was fine. Five of seven archives contained no Delaware.**

### ⭐ THE BYTE-LEVEL "BEFORE", at the founder's OWN demo tile z16 19098/25097

| layer | staged in `tiles-staging/delaware/` | live archive |
|---|---|---|
| roads | **880 B** | **absent** |
| water | **87 B** | **absent** |
| parks | **185 B** | **absent** |
| landuse | 96 B (at Wilmington) | **absent** |

This is what made the diagnosis certain rather than probable: **the bytes were already on R2 and the
live archives carried none of them.** `tiles-staging/` is an accumulator, nothing prunes it, so the
fix was never a re-bake — it was five merge+publish dispatches against bytes staged by bake run
`34397872497` the day before.

### The dispatches — Step 3 of this plan, unmodified

| layer | run | staged | manifest BEFORE | manifest AFTER | `verify-published-region` |
|---|---|---|---|---|---|
| **rail** | `34444718242` ✅ | 1.39 GiB | `regions[49]`, no delaware | **`[47]` · delaware ✅** | ✔ CARRIED — 1066 B == 1066 B at Newark DE |
| **parks** | `34446143886` ✅ | 12.68 GiB | `regions[49]`, no delaware | **`[47]` · delaware ✅** | ✔ CARRIED — **3 of 3**, incl. the demo tile 185 B == 185 B |
| **landuse** | `34455438448` 🔄 | 11.99 GiB | **no `regions` key** | in flight | |
| **water** | *not dispatched* | 12.73 GiB | **no `regions` key** | — | |
| **roads** | *not dispatched* | 28.22 GiB | **no `regions` key** | — | |

Also re-verified at data-bearing points, because the earlier claim rested on uninformative samples:
**buildings** 430 B == 430 B · **trees** 182 B == 182 B (Wilmington) and 76 B == 76 B (Dover).

### ⛔ THREE CORRECTIONS FROM EXECUTING IT — each one cost real time

1. **THEY CANNOT BE DISPATCHED IN PARALLEL, AND THE REASON IS NOT DISK.** Both context workflows
   share `concurrency: { group: context-bake, cancel-in-progress: false }`, and GitHub allows
   **exactly one PENDING run per group** — a third arrival **cancels the one already queued**.
   Firing all five would have left run 1 running, run 5 pending and **runs 2–4 silently cancelled,
   with no error anyone would notice.** This plan's Step 3 says "one dispatch PER LAYER" for a DISK
   reason and is right for a second, unrelated reason it does not state.
2. **BUDGET BY MERGE TIME, NOT ONLY BY DISK — AND IT IS NOT LINEAR IN BYTES.** rail (1.39 GiB)
   completed end-to-end in **11 min**. parks (12.68 GiB, 9.1× the input) took **110 min**, of which
   ~100 was `tile-join` alone. The cost tracks FEATURES and TILE COUNT, not gigabytes. On that
   curve **roads at 28.22 GiB is a multi-hour run** and must be started with hours of headroom.
3. **`verify-published-region.mjs` NEEDS DATA-BEARING `--at` POINTS FOR A SPARSE LAYER.** Run bare
   on `rail`, all five default bbox samples came back `absent/absent` → **exit 2, "NO VERDICT —
   every sampled tile was absent in the staged archive too."** That is the tool working exactly as
   designed, and it is the shape a hurried reader books as a green. Rail needed the **Northeast
   Corridor** (Newark DE `39.6837,-75.7497`); trees needed **Wilmington / Dover**. For dense layers
   the demo point itself is informative. ⛔ **A default-sampled run of a sparse layer is not
   evidence** — it was read as one twice today, in both directions.

### ⭐⭐ AND THE VERIFIER ITSELF WAS BLIND ON THE WRONG AXIS — §ABSENCE-IS-A-FINDING (L-13271)

Run across five layers while four of them were unpublished, the tool printed
**`✔ CARRIED — 1 informative sample(s), 0 lost.` and exited 0** — on 35 samples of which **14 were
`not-published` and 6 `claim-unknown`**. That green line is why the founder was told the layers were
live when they were not.

Nothing in it was arithmetically wrong. `classify` is right, all 35 rows are right, and the question
it asks — *"did the merge LOSE anything?"* — was answered correctly, **because a layer that was never
published loses nothing.** The defect is that its `if (informative.length === 0)` guard aggregated
**every row of the whole run**, so a PER-RUN aggregate answered a PER-LAYER question and one layer's
evidence discharged every other layer's burden. Population, not arithmetic
(memory `gate-blind-on-the-wrong-axis`).

⛔ And it is the **L-581 / L-616 collapse committed by the instrument**: `agree-empty` (nothing baked,
so nothing can be missing) and `not-published` (**baked, staged, and NOT on the map**) are different
facts, exactly one of which is fine, and **they shared an exit code**. This tool's own header warns
about that defect in `merge-tiles.mjs`'s no-loss gate, then reproduced it one level up in its own
verdict block.

Fixed in `dc6464b2`: `layerVerdict()` + `exitCodeFor()`, verdict computed **per layer**, six named
states, **exit 4 = staged bytes with nothing live**, and the roll-up printed in the verdict rather
than buried in the detail. Exit 0 now requires **every** requested layer to have carried.
