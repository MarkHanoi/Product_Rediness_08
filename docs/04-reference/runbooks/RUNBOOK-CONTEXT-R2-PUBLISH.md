# Runbook — publishing whole-country context tiles to R2 (§SYNC-SWITCH, per layer)

> **Status:** AUTHORITATIVE for the context tileset (`buildings · roads · parks · water · landuse ·
> rail · trees`). **Established** 2026-09-04 from the first complete whole-country publish sequence.
> **Supersedes** the "Bake → Publish" shape in `RUNBOOK-CONTEXT-BAKE-RAIL-TREES.md` §2, which
> describes the pre-§SYNC-SWITCH unscoped path; that runbook remains correct for what the two layers
> ARE and is now the layer-specific appendix to this one.
>
> Every number here is measured on the date given. Where a claim is a rule, its scar is cited.
> **When this runbook and `.github/workflows/context-merge-publish.yml`'s header disagree, the
> workflow header wins** — it is the code that runs.

---

## 0. The shape, in one paragraph

Each context layer is **ONE global `<layer>.pmtiles`** in `s3://pryzm-assets/tiles/`, served publicly
from `https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/` with `Cache-Control: immutable,
max-age=31536000`. Regions are baked **separately** into `tiles-staging/<slug>/` (never touching
`tiles/`), then **one merge job per layer** downloads every staged set, refuses-by-name on anything
missing or inconsistent, tile-joins them into one archive, writes `tileset-manifest.json` beside it,
and syncs to `tiles/`. The client only sees new bytes after `CONTEXT_TILESET_VERSION` is bumped in a
deploy, because the URL is otherwise cached for a year.

```
context-bake.yml (region=X, stage=true)  ×49  →  tiles-staging/<slug>/{<layer>.pmtiles, staging-manifest.json}
context-merge-publish.yml (layer=L, expect=all)  →  tiles/L.pmtiles + tiles/tileset-manifest.json
verify bytes  →  bump CONTEXT_TILESET_VERSION  →  deploy-fly.yml (CI-gated)
```

---

## 1. Stage — bake every region

**Workflow:** `context-bake.yml`, `region=<slug>`, `stage=true`. Concurrency is **per-region**
(`context-bake-${region}`), so regions bake in **parallel** (~20 concurrent). Driver:
`scratchpad/stage-all.sh` (dispatch all, poll, auto-retry ≤3×).

- **The region table is `bake.mjs REGIONS`**, exposed machine-readably by `node bake.mjs
  --regions-json`. `merge-tiles.mjs` resolves `expect=all` from THAT — never from a hand-copied list
  (the CLAUDE.md count/range lesson, applied to regions).
- **Measured 2026-09-03:** 49 regions staged, **zero failures at latest attempt per region** (three
  Gulf regions needed retries; `ef682750` added 408/425/429/5xx backoff on the Geofabrik download).
- **Staged size, measured 2026-09-03: 82.1 GB across 7 layers** — buildings 22.3 · roads 23.7 · parks
  12.2 · landuse 11.4 · water 11.1 · rail 1.2 · trees 0.4 GB. ⚠ `regions-full-bake-plan.json`
  projected 24–57 GB; the weight model was **low by ~1.4× at its own upper bound** (measured tiles/pbf
  ratio 2.61 vs assumed 0.8–1.9).

## 2. Merge + publish — ONE DISPATCH PER LAYER

**Workflow:** `context-merge-publish.yml` on `main`. Inputs:

| input | value | why |
|---|---|---|
| `expect` | **`all`** | the publish MUST contain every `bake.mjs` region; a missing one is a **named refusal, never a silent loss** |
| `layer` | **ONE layer** (`roads`, `parks`, …) | ⛔ see §2.1 — an all-layer merge does not fit |
| `engine` | `tile-join` | production; re-merges shared border tiles between adjacent countries |
| `publish` | `true` | untick to merge and only inspect |
| `allow_region_removal` | blank | only to DELIBERATELY drop a live region |

Dispatch via the GitHub REST API (`POST …/actions/workflows/context-merge-publish.yml/dispatches`,
body `{"ref":"main","inputs":{…}}`; PAT from `git credential fill`). The POST **intermittently returns
500 yet still queues** — retry until 204. Concurrency group `context-bake` with
`cancel-in-progress: false` — **runs QUEUE serially**; watch each to its terminal `conclusion`
before dispatching the next.

**Order used 2026-09-04:** buildings → roads → parks → water → landuse → rail → trees.

### 2.1 ⛔ Why per layer — the disk budget (§MERGE-DISK-BUDGET-IS-NAMED, `b366162e`)
The merge holds inputs AND output on one hosted runner (~2× the downloaded bytes). Run
**`33764577747`** (all layers) downloaded 82 GB, sha-verified it, started tile-join, and **died ~35 min
in with nothing published** — a disk verdict wearing a merge failure's clothes. The guard now
**refuses in 4 minutes** when `avail < downloaded`, naming the `layer` input as the escape. The 1.3×
band warns, never fails. **The refusal is deliberately not a tuning knob.**

### 2.2 ⛔ The manifest and the two bugs that would have destroyed it
`tileset-manifest.json` (schema · mergedAt · mergeRunId · mergeGitSha · engine · layers · regions)
is written BESIDE the tiles so the next merge knows what is live. Two defects, both fixed in
`84e6a350` and **proven on the roads publish (`33845044576`)**:
- **§MANIFEST-LAYER-CARRY-FORWARD** — a per-layer publish used to REWRITE the manifest with only the
  layer it merged, **erasing its siblings**. Publishing roads would have deleted buildings from the
  manifest. Now prior layers ride forward as `carriedForward: true` with `producedBy`.
  **Regression check after EVERY publish: the manifest lists all previously published layers.**
- **§VERIFY-PROBES-WHAT-IT-PUBLISHED** — the verify step probed `buildings` regardless of which
  layer had just been written.

### 2.3 The no-loss gate — bootstrap vs armed
Until 2026-09-03 21:01Z **no manifest existed**, so the gate had nothing to compare against and
`expect=all` was the ONLY protection against a subset publish silently dropping a live region
(memory: *"merge = union of STAGED only, no carry-forward"*). **The buildings publish created the first
manifest; the gate is now ARMED.** Obey a refusal from it; never force past it with
`allow_region_removal` unless removing that region is the intent.

## 3. Verify — BEFORE touching any version constant

⛔ **A run's exit code is not the evidence. The bytes are.** Run **`33795775939`** (buildings) is
recorded as a **FAILURE** — step 11 *Publish to R2* succeeded, step 12 *Verify* exited 3 having probed
**`/api/context-tiles/buildings.pmtiles?v=L660a`**, a RELATIVE path: `vars.VITE_CONTEXT_TILES_URL` is
the CLIENT's same-origin proxy, so the `|| <r2.dev>` fallback never fired and curl had no host. It
condemned a publish that had landed. Fixed in **both** workflows (`c6d376e5`,
§VERIFY-PROBED-A-PATH-NOT-A-URL). **This is the probe-can-be-wrong-three-ways trap in its third form —
wrong SYSTEM.**

Verify independently, from the public host, for EACH layer published:

```bash
B=https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles
curl -sI "$B/<layer>.pmtiles?v=<CURRENT_STAMP>"          # 200, Content-Length ≈ staged size, Last-Modified = today
curl -s -o /tmp/r.bin -w '%{http_code}\n' -H 'Range: bytes=0-127' "$B/<layer>.pmtiles?v=<STAMP>"   # MUST be 206
head -c 7 /tmp/r.bin | xxd                                  # MUST be 504d 5469 6c65 73 = "PMTiles"
curl -s "$B/tileset-manifest.json" | python -c "import sys,json;m=json.load(sys.stdin);print(sorted(m['layers']),len(m['regions']))"
```
PMTiles is entirely range reads — **200-not-206 means the tileset is useless even though the bytes
are there.** Then run `tools/context-height-probe/probe.mjs --at <lat,lon> --name <site> --json` at
a known site: it reads the SAME URL with the SAME decoder the browser uses and reports
`measured / unmeasured / empty / not-baked / unreachable` as **distinct verdicts** — a fetch failure
and a genuine empty are different values (§CONTEXT-DATA-HONESTY).

## 4. Stamp — ONLY after §3 verifies, ONCE for the whole tileset

`apps/editor/src/ui/geospatial/contextTiles.ts` → `export const CONTEXT_TILESET_VERSION = '…'`.
Bump, with a scar-style comment carrying the per-layer table (size · Last-Modified · run id).

⛔ **THE RULE, in the file's own words: "BUMP THE STAMP WHEN THE BAKE PUBLISHES, NEVER WHEN IT IS
DISPATCHED."** L659a was bumped for run `30715958488`, which tiled 2.3 GB and then **published
nothing**; every browser that loaded in that window cached the OLD bytes under the NEW stamp **for a
year**. A premature bump is strictly worse than no bump.

**A stamp is a claim about the WHOLE tileset**, so bump once after the LAST layer of a sequence.
Publishing buildings alone and stamping L661a (2026-09-04) was a deliberate, stated exception — the
founder's ask was buildings, and cross-layer skew (buildings new, roads/parks/water stale) was the
accepted cost. Re-bump when the rest land.

## 5. Deploy — through CI, never manually while a fleet is mid-flight

The stamp is inlined into the client bundle; it reaches browsers only via a deploy. **`deploy-fly.yml`
is THE path** (`{"ref":"main"}`); it is gated by `§L-540-CI-GATE`, which refuses a SHA whose `ci.yml`
run is not green — **correctly**. Verify: `https://pryzm.fly.dev/version` shows the new sha, and the
served `assets/main-*.js` contains the new stamp string. ⚠ The manual Fly path (`DEPLOY-CONTRACT-
MANUAL-FLY.md`) builds from the WORKING TREE (`COPY . .`), bypasses both gates, and is for Actions
outages only — never use it with uncommitted lane work on disk.

## 6. Operational lessons, 2026-09-04

- **A lane that "completes" after an acknowledgment stops watching.** Four consecutive publish lanes
  ended their turn "standing by on a monitor" while a 2.5 h merge ran unwatched. **Poll in a blocking
  loop; re-issue the loop; ending the turn IS stopping.**
- **Actions jobs dying in ~3 s is BILLING, not code** (memory: `github-actions-billing-blocks-deploy`).
  Jobs sitting `queued` for 30+ min is a platform outage. Neither is a workflow bug.
- **`trees` and `rail` were 404 not because they were unbaked** (staged 49/49) **but because no publish
  had ever included them** — the July publishes predate the layers. Absence in `tiles/` ≠ absence in
  `tiles-staging/`.
- **`tiles-staging/` persists between publishes** and is the merge's input; a re-bake of one region
  replaces only its staged set.

## 7. State — COMPLETE, measured 2026-09-04 16:08Z

⭐ **All seven layers are live from the same 49 staged regions.** Every row was verified from the
public r2.dev host per §3 (200 with today's `Last-Modified` · `Range: bytes=0-127` → **206** ·
magic `504d 5469 6c65 73`), never from a run's exit code.

| Layer | Live bytes | Size | Last-Modified (UTC) | Merge run |
|---|---|---|---|---|
| buildings | 23,794,734,067 | **23.79 GB** | 2026-09-03 21:01:03 | `33795775939` |
| roads | 25,221,310,111 | **25.22 GB** | 2026-09-04 09:09:33 | `33845044576` |
| parks | 12,804,836,502 | **12.80 GB** | 2026-09-04 10:48:54 | `33857249739` |
| water | 11,684,305,420 | **11.68 GB** | 2026-09-04 12:24:36 | `33865278407` |
| landuse | 12,133,841,837 | **12.13 GB** | 2026-09-04 15:33:12 | `33882625166` |
| rail | 1,270,296,996 | **1.27 GB** | 2026-09-04 15:46:05 | `33890361140` |
| trees | 417,777,328 | **0.42 GB** | 2026-09-04 16:07:13 | `33892581306` |

**87.32 GB total.** Manifest: `layers: [buildings, landuse, parks, rail, roads, trees, water]` (7),
`regions: 49`, `mergeRunId: 33892581306`, `mergeGitSha d4cf09a4`. Carry-forward
(§MANIFEST-LAYER-CARRY-FORWARD) held across **all seven** publishes — the layer set only ever grew.

Independent decoder re-read (`tools/context-height-probe/probe.mjs`, Barcelona 41.3874,2.1686):
verdict **measured** · 6,332 footprints · 6,065 measured-LiDAR · assumed fraction 0.005 ·
**25/25 covering tiles read, 0 failed, 0 absent**.

Stamp **`L662a`** committed (`contextTiles.ts`). ⚠ **NOT YET DEPLOYED** — CI is red and
§L-540-CI-GATE correctly refuses the SHA; browsers keep reading `L661a` until a green deploy ships.

### 7.1 ⛔ A 200 is not currency (§LANDUSE-STALE-BEHIND-200)
`landuse` answered **HTTP 200 the whole time** — with **936,257,447 bytes dated 2026-07-29**, six
weeks stale, while `rail`/`trees` at least had the decency to 404. The loud failure got noticed
first; the quiet one was the older and larger lie. **Check `Last-Modified`, never the status code.**

## 8. Publishing the rest — the plan, and the three things that stop it (lane PUBLISH-THE-82, 2026-09-06)

⛔ **THE HEADLINE: the publish chain is BLOCKED at HEAD `607ab09c`, and it was blocked silently.**
Nothing in the repo said so; `merge-tiles.mjs` says so the moment you run it.

### 8.1 The arithmetic, corrected

The fleet brief and the ledger regeneration both read *"131 bake regions · **49 live** · **82 NOT
published**"*. That mixes two denominators, and the ledger disagrees with itself — §0 says 49 regions
in the live buildings tileset, §1 says 40 published. **Measured** (`bake.mjs --regions-json` × the
live `tileset-manifest.json`):

| set | count |
|---|---|
| `ALL_REGIONS` in `bake.mjs` | **131** |
| regions in the LIVE buildings tileset | **49** |
| — of those, still a `bake.mjs` row | **40** |
| — of those, ORPHANS the code no longer has | **9** |
| `bake.mjs` rows NOT live | **91** |
| rows carrying `pending: true` | **91** |

`pending` and `not-live` are the **same 91 rows** — the flag is exactly maintained today, which is
what makes `expect=all` usable at all. `82` is `131 − 49` and counts the 9 orphans as if they were
code rows. **The number a user feels is 91.**

**How many of the 91 can be published by a MERGE alone: ZERO.** Every one of the 49 staged slugs in
`tiles-staging/` is a region that is already live (probed 2026-09-06 against the public r2.dev host,
one `staging-manifest.json` per candidate slug: **49 × HTTP 200, 95 × HTTP 404** across all 131 rows
plus 13 layer-slug guesses). **All 91 need a bake first.**

### 8.2 ⛔ BLOCKER 1 — the merge refuses every run, and the workflow had no escape

`18bc20c7` (2026-09-06 09:46 UTC) renamed nine rows. `tiles-staging/` is an **accumulator** — each
bake syncs only its own slug prefix (`context-bake.yml:627`, `--delete` scoped to that prefix) and
nothing prunes a slug — so the nine old staged sets are **still in the bucket** (probed: HTTP 200).
`merge-tiles.mjs:622` refuses any staged region that is not a `bake.mjs` row. **Measured, at HEAD,
against the 49 real staged manifests and the real live manifest:**

```
node tools/context-bake/merge-tiles.mjs merge --staging <49 real manifests> --expect all \
  --engine js --live-manifest <real live manifest> --dry-run --no-verify   →  RC=1
✖ merge: staged region(s) [abudhabi, austin, boston, chicago, dubai, houston, jeddah, riyadh,
  sanfrancisco] are not in bake.mjs ALL_REGIONS — a renamed/deleted row or a typo.
  Pass --allow-unknown-regions only if this is deliberate.
```

The last merge ran **07:58 UTC**, 108 minutes *before* the rename, so nothing had exercised this.
`context-merge-publish.yml` **exposed no `--allow-unknown-regions` input**, so the refusal was
unsatisfiable from the UI — the §L-716 shape: *a gate whose "yes" branch cannot be reached.* Fixed
here by adding the `allow_unknown_regions` input (default `false`).

### 8.3 ⛔ BLOCKER 2 — the no-loss gate was asking the wrong question

`merge-tiles.mjs` tested `carrier(l, r)` — *"does SOME staged set hold this (layer, region)?"*. That
is a question about the **bucket**, not about the **tileset this run publishes**, and because the
bucket accumulates, every live region answers *yes* forever. **Measured before the fix:**

```
… --expect spain --allow-unknown-regions --dry-run    →  RC=0
▶ no-loss gate: every live region covered for [buildings, roads, water, parks, landuse, rail, trees]
  · buildings: 1 input(s) → merged/buildings.pmtiles
```

**One region merged, forty-eight live regions deleted, "every live region covered" printed.** That is
the exact loss the gate is named after, and it answers the standing question *"can a scoped run
silently shrink the map?"* — **it could.** The merged output for a layer is exactly
`expected.filter(r => carrier(l, r))`, so the gate now asks `expectedSet.has(r) && carrier(l, r)`, and
names the two causes apart (never staged → bake it; staged-but-unexpected → widen `expect=`). After
the fix the same command exits **1**, and `expect=all` names the nine orphans. Pinned by
`mergeTiles.spec.ts` *"no-loss gate: refuses a live region that IS staged but is outside the run
expect= set"*. The pre-existing no-loss test could not catch this: it dropped a region by never
staging it at all, which is the one case the old predicate did handle.

### 8.4 §3c — the nine orphans are RENAMES, every one. Evidence, not judgement

All nine were removed by ONE commit, `18bc20c7`, and each successor is drawn from the **same
Geofabrik extract** with a **strictly containing bbox** (checked numerically, old bboxes transcribed
from the commit's own removed lines):

| orphan (live tiles today) | successor row | same `pbfUrl` | bbox contains | successor state |
|---|---|---|---|---|
| `sanfrancisco` | `california` | yes | yes | `pending`, never baked |
| `chicago` | `illinois` | yes | yes | `pending`, never baked |
| `austin` · `houston` | `texas` | yes | yes | `pending`, never baked |
| `boston` | `massachusetts` | yes | yes | `pending`, never baked |
| `riyadh` · `jeddah` · `dubai` · `abudhabi` | `gccstates` | yes | yes | `pending`, never baked |

Height provenance **improves** across the rename: `chicago`/`austin`/`houston` had no join at all and
`illinois`/`texas` declare `usas` (**WHOLE-COUNTRY**); `sanfrancisco`/`boston` move `us_open` →
`usas`; `abudhabi`'s `ad_ndsm` moves onto `gccstates` unchanged. The Gulf rows keep
`buildingsSource: 'overture'`.

⛔ **So there is no deletion to decide — but the re-point is NOT SATISFIED YET.** Dropping the nine
before their successors are staged deletes San Francisco, Chicago, Austin, Houston, Boston, Riyadh,
Jeddah, Dubai and Abu Dhabi from a live map and puts nothing back. **`allow_region_removal` for these
nine is legitimate in exactly one dispatch: the merge that also carries `california`, `illinois`,
`texas`, `massachusetts` and `gccstates`.**

⚠ **`newyork` is a tenth, different case, and it is NOT an orphan.** Its row survived but its bbox
widened from the Manhattan clip (`-74.03,40.70,-73.91,40.82`) to the whole state
(`-79.77,40.43,-71.66,45.02`) and its join moved `us_open` → `usas`; the live tiles are the OLD narrow
bake (ledger §3, *JOIN DRIFT*). The merge compares neither bbox nor join, so an `expect=all` run
**re-publishes the stale narrow set and stamps `heightJoin: "usas"` on it** (the merged manifest reads
the CURRENT table, gated only on whether the staged set claimed *a* join). **Re-bake `newyork` in the
same wave, or the manifest lies.** `spain` is the milder version of the same thing — its deciding
tables changed after its 2026-09-03 bake.

### 8.5 ⛔ BLOCKER 3 — the disk cliff, and why phasing does not solve it

The merge is a **full rebuild of each layer's global archive from every staged region**. Its disk cost
therefore grows with the **whole tileset**, not with the increment: *a phased publish does not make a
phase cheaper.* `layer` is already the only escape, and `roads` is already the largest layer.

Measured today (49 staged sets, sizes summed from their real manifests — total **82.11 GiB**, which
independently reproduces §1's recorded 82.1 GB):

| layer | staged | merged live |
|---|---|---|
| roads | 23.68 GiB | 23.49 GiB |
| buildings | 22.22 GiB | 22.13 GiB |
| parks · landuse · water | 12.15 · 11.42 · 11.06 GiB | — |
| rail · trees | 1.20 · 0.40 GiB | — |

The roads publish (`33845044576`) held 23.68 GiB in + 23.49 GiB out, so free space at that step was
**≥ 47.2 GiB — and that inference is the only bound anyone has.** Nobody has written the actual `df`
down.

Projected additions for the 91, from **measured** `Content-Length` on every Geofabrik extract
(24.8 GB of pbf) × a tiles/pbf ratio **calibrated on ten live whole-country rows** (aggregate 2.80,
median 2.70, band **1.99 – 4.93**; §1's earlier global 2.61 sits inside it):

| phase | regions | pbf | projected tiles @2.8× | roads share |
|---|---|---|---|---|
| **A** re-point the orphans — `california illinois texas massachusetts gccstates` | 5 | 2.97 GB | 8.3 GB | ~2.4 GB |
| **B** large single markets — `japan mexico turkey newzealand israel jordan lebanon` | 7 | 4.41 GB | 12.3 GB | ~3.6 GB |
| **C** Canada (13 provinces/territories) | 13 | 6.49 GB | 18.2 GB | ~5.2 GB |
| **D** remaining Europe (17 pending rows) | 17 | 2.01 GB | 5.6 GB | ~1.6 GB |
| **E** remaining US states/territories | 49 | 8.94 GB | 25.0 GB | ~7.2 GB |
| **all 91** | 91 | 24.8 GB | **69 GB** (band 50–122) | **~20 GB** |

⚠ The ratio is **modelled, not measured**, and it is biased LOW for huge sparse regions — exactly the
ones phases C and E are full of (`finland` measures 4.93×; `nunavut`, `alaska` and `northwest
territories` are the same shape). Phase ordering here is by *unblocking live coverage first*, then by
pbf weight as a measured proxy for mapped built environment; **this repo holds no population table**,
so no phase order below is claimed to be population-optimal.

**Roads ends at ~44 GiB staged, needing ~88 GiB on one runner.** Against a proven-fitting 23.68 GiB
that is not a phasing problem, it is a ceiling problem. **Phase A alone takes roads to ~26 GiB, which
is already outside anything this repo has proven fits.**

### 8.6 The ordered dispatch list — and the first item is a MEASUREMENT

⭐ **Do not dispatch a publish until the headroom is a reading.** `context-merge-publish.yml`'s
disk-guard step now prints the surplus and `df -h / /mnt`, so one cheap run answers it.

1. **`context-merge-publish.yml` · `layer=trees` · `expect=all` · `engine=js` · `publish=false` ·
   `allow_unknown_regions=true`** — 0.4 GiB downloaded, changes nothing on R2, and `engine=js` skips
   the Docker toolchain build (`if: inputs.engine != 'js'`) that is the run's slowest step. The
   disk-guard step runs BEFORE the merge, so it prints even though the merge then refuses. **Read three
   lines from the log:** the surplus, `/`'s free space, and whether **`/mnt`** exists and how big it
   is (GitHub-hosted Ubuntu carries a second volume there; moving staging + merged output onto it is
   the cheap ceiling raise, and it must be measured before it is coded). This run will also **refuse
   by name** at the no-loss gate, listing the nine orphans — that refusal is the fix working.
2. **Bake phase A** — 5 dispatches of `context-bake.yml` (`stage=true`, `publish=false`, `region=` one
   name each; concurrency is per-region so they run concurrently): `california` · `texas` ·
   `illinois` · `massachusetts` · `gccstates`. Largest extract 1.33 GB (`california`); the
   330-minute ceiling is not in danger for any of them. **Plus a 6th, `newyork`** (§8.4), so the state
   bbox and the `usas` join reach the tiles the manifest describes.
3. **Only if step 1 showed the headroom** — merge + publish phase A, **one dispatch per layer**, in
   the 2026-09-04 order (buildings → roads → parks → water → landuse → rail → trees), each with
   `expect=all`, `engine=tile-join`, `publish=true`, `allow_unknown_regions=true`, and
   `allow_region_removal=sanfrancisco,chicago,austin,houston,boston,riyadh,jeddah,dubai,abudhabi`.
   ⛔ **That removal list is only safe in a run that carries the five phase-A successors** — it is the
   re-point completing, not a deletion. Watch each run to a terminal conclusion (§2, serial queue).
4. **Verify per §3 from the public host** (`Last-Modified` = today · `Range: bytes=0-127` → **206** ·
   PMTiles magic), then run `tools/context-height-probe/probe.mjs` at a **re-pointed** site —
   Chicago `41.8781,-87.6298` and Riyadh `24.7136,46.6753` are the two that prove the rename landed
   rather than removed coverage.
5. **Stamp once** after the last layer (§4), then deploy through `deploy-fly.yml` (§5).
6. **Phases B → E are NOT dispatchable today.** They are gated on the ceiling raise, not on baking.
   Bake them by all means — a staged set costs only runner time and is the input the merge will need —
   but do not queue a publish for them until §8.5's arithmetic has an answer.
