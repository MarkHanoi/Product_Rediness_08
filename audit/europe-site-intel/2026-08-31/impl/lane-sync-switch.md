# LANE SYNC-SWITCH — per-region bake staging + merge/publish (§SYNC-SWITCH), 2026-09-02

The workflow switch `bake.mjs:57` designed in-comment ("switch the workflow to bake per-region and
`aws s3 sync` incrementally") and the §BAKE-TIMEOUT-RAISED note demanded instead of another timeout
raise ("per-region artifacts merged before a single publish"). Last code prerequisite before the
whole-country context tilesets can publish (25 national rows landed 5faa71ba; R2 billing resolved).

## 0 · The answer in five lines

- **Staging path shipped, ADDITIVE**: `context-bake.yml` grew a `stage` input (default false =
  today's behaviour byte-unchanged). `stage=true` uploads the run's tileset + a sha256'd
  `staging-manifest.json` to `s3://pryzm-assets/tiles-staging/<slug>/` — never the live prefix.
- **Merge+publish shipped**: new `context-merge-publish.yml` + `tools/context-bake/merge-tiles.mjs
  merge` — downloads all staged sets, **refuses BY NAME** on any missing expected region,
  ambiguous double-staging, layer gap, sha mismatch, or live-region loss; merges per layer
  (tile-join, the same Docker image); publishes ONCE with a `tileset-manifest.json` BESIDE the
  tiles so the next run knows what is live (the old design's blindness, cured).
- **Proven locally on real pmtiles bytes**: a dependency-free PMTiles v3 reader/writer + js merge
  engine in merge-tiles.mjs, pinned against the independent `pmtiles@4.4.1` npm library (13
  Hilbert constants + an end-to-end `getZxy` read of a merged archive by the exact library the
  client reader uses). 12 new vitest cases (`__tests__/mergeTiles.spec.ts`), all green; sibling
  specs still green (32/32 across the directory).
- **The refusal arm fired and was falsified**: real tool → RC=1 naming `latvia`; a deliberately
  neutered copy → RC=0 with latvia silently absent from the manifest — the exact silent-city-loss
  defect, demonstrated, with the gate proven load-bearing.
- **Nothing published, live prefix untouched, no commits**; root tsc RC=0; both YAMLs parse RC=0.

## 1 · The problem, measured (why neither existing lever worked)

- Each layer is ONE global `.pmtiles`; the publish is `aws s3 sync` → REPLACES the tileset. A
  `--region`-scoped publish deletes every other region (context-bake.yml's region input says so
  verbatim; bake.mjs §BAKE-BY-REGION prints the same warning at run time).
- The full table is now 35 regions / ~33 GB of pbf (`regions-full-bake-plan.json`). The buildings
  layer ALONE hit the old 180-min timeout at 99.9 % on a ~13.6 GB set (run 30706761446), and the
  ceiling is 330 (GitHub max 360). An unscoped full bake arithmetically cannot finish.
- Nothing records what the live tileset contains, so no merge could ever know what it must not
  lose. That blindness is the root defect; the published `tileset-manifest.json` is the cure.
- The GitHub artifact quota was hit 2026-09-01 (22 GB of expired artifacts purged) — so staging
  goes to R2, not run artifacts; and the remaining (non-staged) artifact upload drops retention
  14 → 3.

## 2 · What shipped (files touched — this lane's complete footprint)

| File | Change |
|---|---|
| `tools/context-bake/bake.mjs` | additive `--regions-json` (machine-readable region/layer tables on stdout, no side effects; banner suppressed in that mode). The merge resolves `expect=all` from THIS table — never a hand-copied list (the count/range-rot lesson). |
| `tools/context-bake/merge-tiles.mjs` | **new** — `stage-manifest` / `merge` / `write-fixture` subcommands; dependency-free PMTiles v3 reader/writer (spec-implemented, node builtins only); js merge engine (disjoint union, refuses collisions by z/x/y); tile-join engine (local binary or the pryzm-context-bake Docker image); all five refusal gates; writes `tileset-manifest.json`. |
| `tools/context-bake/__tests__/mergeTiles.spec.ts` | **new** — 12 cases; runs in the root vitest suite (include pattern `tools/context-bake/__tests__/**/*.spec.ts` already existed). CLI-driven child processes only (the heightSources.mjs vite-transform precedent); verifies the merged archive with the SPEC'S OWN independent decoder; Hilbert addressing pinned to `pmtiles@4.4.1` constants. |
| `.github/workflows/context-bake.yml` | additive `stage` input + two steps (Write staging manifest; Upload to R2 STAGING with `--delete` inside the slug prefix); `publish`/verify/next-steps gated on `!inputs.stage`; artifact upload skipped when staged and retention 14→3 (quota); region input description now points at stage=true as the safe scoped path. Blank-inputs behaviour unchanged. |
| `.github/workflows/context-merge-publish.yml` | **new** — download staged sets (layer-scopable for disk), fetch live manifest (bootstrap-tolerant, loud), merge with refusals, "tiles are real" assert, measured-height spot-check against the MERGED buildings (scope from the merged manifest, §MEASURED-SPOTCHECK-RESPECTS-REGION semantics), publish tiles immutable + manifest `no-cache`, 206 range-serve verify, step summary reminding the CONTEXT_TILESET_VERSION bump. Same `concurrency: context-bake` group as the bake — a bake and a publish can never interleave on R2. |

`packages/**` untouched by this lane (the other modified files in `git status` belong to the
concurrent family/component waves).

## 3 · Design decisions, with the measured reason each

1. **R2 staging, not run artifacts** — the quota was hit the day before; artifacts also expire,
   and a merge that depends on expiring inputs re-creates the timeout-cliff class of loss.
   Staged sets persist until deliberately deleted (`aws s3 rm --recursive …/tiles-staging/<slug>/`).
2. **The staging unit is the RUN's region-set, not one region.** A bake run may scope
   `--region a,b`; its per-layer pmtiles are already merged across those regions and cannot be
   split. The staging manifest records the exact region list; the merge is manifest-driven and
   refuses a region claimed by two different sets (double-bake hazard) — re-staging the SAME slug
   replaces it (sync `--delete` inside the slug prefix), which is the intended re-bake path.
3. **tile-join is the production engine.** It ships in the same Docker image CI already builds
   (felt tippecanoe's `make install` installs it; ≥2.17 reads/writes .pmtiles), and it re-merges
   vector features in tiles shared by two inputs. Real merges ALWAYS share tiles: adjacent
   countries share border tiles at low zooms, and the deliberate double-bake rows (koln⊂germany,
   paris/lyon⊂france) overlap wholesale. tile-join's feature-union on those overlaps reproduces
   exactly today's single-tippecanoe-call semantics (same footprints twice, client near-cap thins
   twins — the documented kept-exception behaviour). Flags: `-f -pk --no-tile-stats` — `-pk`
   because a merged border tile slightly over 500 KB must be KEPT, not silently skipped.
4. **The js engine is the proof + emergency path, deliberately disjoint-only.** An MVT tile must
   not carry two same-named layers (spec 4.1), and the client's `VectorTile.layers` is keyed by
   name — a blind concat would silently drop one region's features in every shared tile. So the
   js engine refuses collisions naming the tile (proven in test) and points at tile-join. It
   holds the merged layer in memory — fallback scale only, stated in its header.
5. **Sync-in-place publish, risk stated (constraint's option 2).** Read before choosing: the
   client (`apps/editor/src/ui/geospatial/contextTiles.ts`) builds
   `${base}${layer}.pmtiles?v=${CONTEXT_TILESET_VERSION}` over a fixed flat base
   (`VITE_CONTEXT_TILES_URL`, deployed as the `/api/context-tiles/` proxy). A `tiles-new/` flip
   would need a client change this lane must not make, and R2 has no atomic prefix rename. What
   holds instead: R2 PUTs (multipart included) are per-object atomic, tiles are `immutable,
   max-age=31536000`, and a re-bake only becomes visible after the CONTEXT_TILESET_VERSION bump
   (§CONTEXT-CACHE-BUST) — so live clients never see a torn tileset. Residual risk, accepted and
   documented in the workflow header: a cold-cache client during the minutes-wide sync window can
   see new buildings beside old roads (cosmetic cross-layer skew).
6. **The manifest describes the BYTES, not the intent.** A set staged as {lu,ee} merged under
   `--expect luxembourg` still ships Estonia's bytes — the manifest records the union of the
   participating sets' regions, so the next run's no-loss gate is never blind to shipped content.
7. **`expect=all` resolves from `bake.mjs --regions-json` at run time** — the region table has
   one home. `expect=staged` exists for deliberate phased publishes; the no-loss gate still
   refuses dropping anything the live manifest carries (unless named in `allow_region_removal`).
8. **Disk budget stated up front** (merge workflow header): runner holds staged + merged ≈ 2× the
   tileset; the 24–57 GB full-scope upper band exceeds a hosted runner. Escapes: the `layer`
   input (per-layer dispatches download only that layer's staged files) and the plan JSON's
   phases. Re-measure at the LU+EE calibration merge before the full-scope dispatch.

## 4 · Executed proof (verbatim, this box, 2026-09-02)

**`--regions-json` emits pure JSON in all modes:**
```
allRegions: 35 regions: 35 layers: buildings,roads,water,parks,landuse,rail,trees
scoped regions: ["estonia","luxembourg"]
scoped layers: ["buildings"]
```

**Hilbert addressing vs the independent `pmtiles@4.4.1` library** (constants computed by the real
lib in an isolated scratch install, then pinned into the spec):
```
ALL 13 pinned constants MATCH the independent pmtiles lib
round-trip z0..z6 exhaustive: 5461/5461 OK
```
(First implementation attempt had 3 mismatches — xy2d must rotate within the FULL grid `n`,
d2xy within `s`; the pinned constants caught it immediately, which is what they are for.)

**The test suite:**
```
npx vitest run tools/context-bake/__tests__/mergeTiles.spec.ts  →  Tests 12 passed (12)
npx vitest run tools/context-bake/__tests__/                    →  Test Files 3 passed (3) · Tests 32 passed (32)
```

**(c) The refusal arm, fired — REAL tool, region with no staged files:**
```
=== REAL TOOL: expect luxembourg,estonia,latvia (latvia NOT staged) ===
▶ staged sets: estonia[estonia] · luxembourg[luxembourg]
✖ MISSING REGION(S) — 1 expected region(s) have NO staged bake: [latvia].
  Refusing to merge: publishing this tileset would DELETE the missing region(s) from the live map
  (the R2 publish is a sync that REPLACES the tileset — §BAKE-BY-REGION). Stage a bake for each
  named region (context-bake.yml with region=<name>, stage=true), or pass --expect staged /
  --expect <csv> for a DELIBERATE subset.
RC=1
```

**Falsification control — the same scenario against a deliberately NEUTERED copy** (gate removed
in a temp file, deleted afterwards; repo file untouched — `git status` shows only the intended
files):
```
=== NEUTERED CONTROL: same scenario, gate removed ===
  ✔ buildings.pmtiles — 0.0 MB · 2 addressed tiles (inputs sum 2) · z2–2
✔ merge complete — 1 layer(s), 3 region(s) → merged-neutered
RC=0
--- regions in neutered manifest:
luxembourg,estonia
```
The neutered tool even reports "3 region(s)" while latvia is silently gone — the defect made
flesh; the spec's assertions (`status===1`, stderr contains `MISSING`+`latvia`) fail against it,
so the gate is load-bearing, not tautological.

**(b) Independent end-to-end read of a MERGED archive by the client's own library:**
```
independent pmtiles@4.4.1 read of the MERGED archive:
  specVersion 3 · clustered true · numAddressedTiles 2 · z 2-2
  getZxy(2,2,1) → "luxembourg" (expected luxembourg payload)
  getZxy(2,3,1) → "estonia" (expected estonia payload)
  getZxy(2,0,0) → undefined (honest absent tile)
  metadata pryzm:merged_from = ["luxembourg","estonia"]
```

**Other refusal arms, each proven in the spec (12 cases):** ambiguous double-staging (names
region + both slugs) · tile collision (names `2/2/1`, points at tile-join) · layer gap (names
set + layer) · sha256/byte drift ("truncated or stale download") · no-loss gate (refuses dropping
`denmark` from a live manifest; passes with `--allow-region-removal denmark`, logging the
deliberate removal) · stage-manifest typo guard (`atlantis` → RC=2).

**(a) Workflow YAML validation** (actionlint absent on this box; `yaml@2.6.1` parse + step-shape
assertions instead):
```
context-bake.yml → PARSE OK · jobs: bake · inputs: layer,region,publish,stage · steps: 15
context-merge-publish.yml → PARSE OK · jobs: merge-publish · inputs: expect,layer,engine,publish,allow_region_removal · steps: 12
RC=0 both workflows parse
```

**(d) Root tsc + lint + bake regressions:**
```
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tsconfig.json → RC=0
  (first attempt at the DEFAULT heap crashed V8 — the known memory-hungry root tsc, hence the
   documented 6144 build heap; not a type error)
npx eslint merge-tiles.mjs mergeTiles.spec.ts bake.mjs → clean (after removing 2 unused imports)
node bake.mjs --check --region atlantis → RC=2 fail-loud (unchanged)
node bake.mjs --check (12288 heap) → RC=0, height-stamp budget ✔ (unchanged)
merge --dry-run → RC=0, all gates evaluated, nothing written
```

**Fixture hygiene:** all fixtures were generated in tmp/scratch dirs; no repo fixture was
modified; the temp neutered copy was deleted; `git status tools/context-bake/` shows exactly
`M bake.mjs` + the two new files.

## 5 · What remains for the operational rollout (the dispatch order)

Prereqs already satisfied per the brief: R2 billing resolved. Remaining sequence (founder
dispatches; from `regions-full-bake-plan.json` phases):

1. **Calibration + first tile-join proof (cheap, no live risk):**
   a. `context-bake.yml` → `region=luxembourg`, `stage=true`; then `region=estonia`, `stage=true`
      (two sets, so the merge is a real multi-set union).
   b. `context-merge-publish.yml` → `expect=luxembourg,estonia`, `engine=tile-join`,
      **`publish=false`** — proves tile-join on real .pmtiles inputs on the runner (the ONE arm
      this box cannot execute: osmium/tippecanoe/docker all absent, measured). Re-measure the
      tiles-per-pbf weight and wall-clock models here (plan JSON `calibration`).
2. **Stage the "always" rows** (grouped to share pbf downloads):
   `spain` · `denmark,netherlands` · `paris,lyon,koln` · `newyork,sanfrancisco` ·
   `riyadh,jeddah` — each with `stage=true`.
3. **Stage phase 1** (MUST be in the next publish or their deduped cities vanish — lisbon/porto/
   rome/milan/berlin/munich/london/brussels/oslo/stockholm/helsinki/zurich/geneva/bern rows were
   deleted in favour of these national rows): one staged run each of
   `portugal, belgium, switzerland, italy, norway, sweden, finland, greatbritain, germany`
   (germany projected 75–125 min — fits comfortably per-run).
4. **First live publish:** `context-merge-publish.yml` with
   `expect=<csv of steps 1–3's regions>` (NOT `all` — phase 2 is not staged yet), `publish=true`.
   Bootstrap: no live manifest exists yet, the no-loss gate says so loudly and arms itself on
   this publish. If the full-set merge presses the runner's disk, dispatch per layer
   (`layer=buildings`, then the rest) — the download step only pulls that layer's staged files.
5. **Bump `CONTEXT_TILESET_VERSION`** in `apps/editor/src/ui/geospatial/contextTiles.ts` + deploy
   the client (§CONTEXT-CACHE-BUST — without it no client ever sees the new tileset).
6. **Stage phase 2** (`slovenia … france`, small→large), then `expect=all` merge+publish, then
   another version bump. From here the no-loss gate is armed by the live manifest: any future
   publish that would drop a live region refuses by name.

## 6 · Honest gaps

- **tile-join at multi-GB scale is CI-proven, not box-proven** — this box cannot run it (no
  binaries, no docker). Step 1b above is the designated proof, deliberately `publish=false`.
- **Disk at full scope**: staged+merged ≈ 2× 24–57 GB upper band may exceed a hosted runner even
  after cleanup; the per-layer dispatch escape is designed in, but the real ratio awaits the
  LU+EE calibration.
- **The js engine cannot merge real adjacent countries** (border-tile collisions → refusal by
  design). It is the proof/emergency path; nothing in the CI flow defaults to it.
- **The measured-height spot-check in the merge workflow** only bites when spain/koln are among
  the merged regions (scope from the merged manifest; vacuous-with-notice otherwise) — same
  semantics as the bake's §MEASURED-SPOTCHECK-RESPECTS-REGION.
- **`tiles-staging/` is publicly readable** under the same r2.dev public base as `tiles/` —
  harmless (the data is public OSM derivatives) but worth knowing.
- **actionlint** was not available locally; YAML validation was a real parse + step-shape
  assertions (RC=0), not GitHub's own linter.
