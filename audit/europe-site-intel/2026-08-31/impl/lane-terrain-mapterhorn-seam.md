# LANE TERRAIN — THE MAPTERHORN INTEGRATION SEAM: IMPLEMENTED (default OFF)

Implements the E3a ADOPT verdict's §5 seam (`e3a-mapterhorn-verdict.md` — read first, implemented
as written, no re-design). Executed **2026-09-01**, foreground, live network, repo box
(Windows/Git Bash, Node 24.15.0). **Nothing committed** (per the lane brief). §L-1056 respected:
the switch is DEFAULT OFF and the old path is proven byte-identical below; the cutover is a later
superseding commit after visual verification on prod.

## 1 · What changed (two files, both at the verdict's named seam)

- **`tools/context-bake/terrain.mjs`**
  - `DTM_FETCH.mapterhorn` — the ONE new source kind (verdict §5.1):
    `{ kind: 'terrarium-zxy', endpoint: 'https://tiles.mapterhorn.com', z: 15, tileSize: 512,
    nativeCrs: 'EPSG:3857', maxExtentM: 22000, maxTiles: 512 }` (§E3A-MAPTERHORN;
    `maxExtentM` mirrors the `es` row so full-city clamps match the row it substitutes for).
  - `fetchTerrariumZxy()` (§8d) — fetch the clamped bbox's z/x/y tiles (bounded concurrency 6),
    decode the lossless WebP with `sharp` (lazy-imported — no existing path can reach it),
    terrarium-decode `(R·256 + G + B/256) − 32768` straight into the SAME
    `{ values, bboxNative, nativeCrs }` raster shape every adapter returns. Tile-grid-aligned crop
    window (no full-mosaic intermediate, no resample). Any non-200 tile, wrong-size decode, or
    tile-count over `maxTiles` THROWS honestly — never a filled/fabricated tile.
  - §E3A-DTM-SOURCE-SWITCH — `dtmSource` option on `bakeCity()` / `sampleCity()` + CLI
    `--dtm-source` on `--bake-city` / `--sample-city`. `undefined` → `region.source`, and with the
    flag absent the apikey/unwired guards, fetch key and messages are the same expressions as
    before. **The datum lift stays keyed to the NATIONAL row** (`TERRAIN_SOURCES[region.source]
    .geoidSepM`) regardless of fetch source — verdict §5.2. NL CLI branch warns loudly and ignores
    the flag (closed-form path is not switchable; out of E3a scope).
  - One log-honesty fix: the shared "fetched DTM" line said `(N STAC tiles)` for any tiled source;
    now `(N source tiles)` (it was printing "STAC" for Mapterhorn tiles in this lane's own bake).
- **`tools/context-bake/reproject.mjs`**
  - `PROJ_DEFS['EPSG:3857']` (spherical mercator) + a self-test control point whose expected
    values come from the INDEPENDENT closed form `X=R·lon, Y=R·ln(tan(π/4+lat/2))` — proj4 agrees
    to **0.18 m** (selftest 9/9 PASS).
  - **A demonstrated integration failure, fixed at the projector** (E4 control 2's demonstrated-
    failure clause; compiler untouched): proj4's mercator forward returns **NaN at exactly ±90°**,
    and the §8c warp's coarse ancestor tiles span ±90° — measured NaN rows in the z0/z1 grids and
    a z0 tile emitted at `h[0.0..0.0]` instead of the sea-level 51.0 (transcript §4). WebMercator
    is DEFINED on |lat| ≤ 85.05113°, so the 3857 projector clamps lat into its domain; a pole
    sample then forwards to the domain edge — far outside any city raster — and takes the
    compiler's existing §COARSE-TILE-SEALEVEL fill (L-639). After the fix the z0 tile is
    `h[51.0..51.0]`, byte-identical semantics to the national path. Only the EPSG:3857 branch is
    touched; every national CRS takes the unmodified return.
- **Dependency:** `sharp@0.33.5` added to the STANDALONE artefact only —
  `tools/context-bake/node_modules/` (gitignored), installed in a scratch dir and copied in
  (the `workspace:*` trap is real and was seen live: an in-place `npm i` with a temp package.json
  still hit `EUNSUPPORTEDPROTOCOL workspace:*` via the root `workspaces` field, and was aborted;
  the CI workflow `terrain-bake.yml` already uses the scratch-dir-copy pattern). Root
  `package.json` / `pnpm-lock.yaml` byte-identical before/after (sha256
  `d9fca6b7…` / `2ad3f549…` both times). **The pnpm workspace is untouched.**

What is deliberately NOT here (verdict §5.3): no REGIONS row routes to mapterhorn; no runtime
consumption (L-513); no change to the legal sampling path (L-584 `fitFootprintGroundPlane` +
datum sampling stay on the national DTM — terrarium has no per-tile vertical datum and no
UNKNOWN/nodata channel, E4 control 9); no deletion or demotion of any national adapter.

## 2 · Default-OFF proof (§L-1056) — checksummed, twice

Small Barcelona AOI `--bbox 2.15,41.38,2.174,41.398` (Eixample, ~2×2 km), full real pipeline
(live IGN WCS fetch → §8c warp → MARTINI → quantized-mesh → layer.json; 17 tiles z0..12).

- **Determinism control first:** two PRE-patch default bakes → `diff` of per-file sha256 = empty
  → the comparison instrument itself is sound.
- **Post-patch default bake (no flag) → byte-identical to pre-patch** (all 18 files, sha256).
- Re-proven AGAIN after the pole-clamp fix landed in reproject.mjs (the clamp branch is
  3857-only, and the checksums confirm it): `diff pre1.sha post2.sha` = empty.
- Mapterhorn-path determinism: two `--dtm-source mapterhorn` bakes → byte-identical (lossless
  tiles + deterministic pipeline).

## 3 · Executed proof — same AOI, both sources, real compiler, real gates

`--bake-city barcelona --bbox 2.15,41.38,2.174,41.398 --dtm-source mapterhorn`:
fetched **9 z15 tiles → 1204×1204 px @ EPSG:3857** → same 17-tile z0..12 chain with **IDENTICAL
tile keys** to the national bake. `terrain.verify.mjs --tileset` (independent @here decoder):
**PASS on both** tilesets, including the Cesium request path for lon/lat 2.163,41.39.

Checksums: **6 of 17 tiles byte-IDENTICAL across sources** (z0–z5 — both grids are constant
sea-level fill +51 lift there; where the inputs agree exactly, the encoder output agrees
bit-for-bit — a strong shared-pipeline control). The fine tiles differ, honestly:

| tile | national minH..maxH | mapterhorn minH..maxH | ΔmaxH | tris nat→mh |
|---|---|---|---|---|
| 6/64/46 | 51.0..101.9 | 51.0..102.5 | +0.60 | 81→81 |
| 8/259/186 | 51.0..107.0 | 51.0..107.4 | +0.41 | 213→221 |
| 9/518/373 | 51.0..110.7 | 51.0..113.5 | +2.87 | 461→463 |
| 10/1036/747 | 51.0..110.7 | 51.0..114.2 | +3.50 | 1124→1328 |
| 11/2072/1494 | 51.0..107.8 | 51.0..110.9 | +3.11 | 2550→3702 |
| 11/2072/1495 | 51.0..111.0 | 51.0..114.8 | +3.81 | 643→909 |
| 12/4144/2989 | 51.0..107.8 | 51.0..112.3 | +4.50 | 1646→2320 |
| 12/4144/2990 | 51.0..111.3 | 51.0..114.8 | +3.53 | 255→460 |
| 12/4145/2989 | 51.0..101.9 | 51.0..102.5 | +0.60 | 7240→9979 |
| 12/4145/2990 | 51.0..105.4 | 51.0..108.1 | +2.75 | 1276→1850 |

ΔminH = 0.00 on every tile (both hit the sea-level fill at tile edges). ΔmaxH +0.4..+4.5 m and
+0–80% triangles at the same 0.5 m error bound: the 1.8 m/px source resolves relief the 25 m WCS
smooths away — the verdict's Tibidabo-class smoothing, visible at Eixample scale. Tile bytes grow
~30–70% at the finest LODs (e.g. 73.1→100.6 KB); z0–z9 sizes are near-identical. layer.json
bounds differ by the adapter's 100 m pad (2.1491..2.1749 vs 2.1500..2.1740 — same pad class the
wcs2 adapters apply; the tile keys, which are global TMS, are unaffected).

**Datum agreement through the REAL sampler** (`--sample-city barcelona`, full city bbox — the
mapterhorn side fetched 266 z15 tiles → 6610×9404 px; city-wide orthometric mean **75.8 vs
75.9 m** over 62.2 M samples):

| probe | national (25 m WCS) | mapterhorn z15 | verdict §2 said |
|---|---|---|---|
| Port/beach | 4.0 | 3.9 | 3.85 |
| Montjuïc | 87.0 | 87.1 | 87.12 |
| Tibidabo | 485.0 | 495.6 | 495.63 (IGN 5 m anchor: 492; current 25 m reads low) |
| Eixample | 29.7 | 31.4 | 31.37 |

The production seam reproduces the trial's numbers to 0.1 m — same orthometric datum, same +51
lift, verdict §2's conclusion carried into the wired path unchanged.

## 4 · Falsification (each seen failing → byte-identical restore → seen passing)

1. **3857 def corrupted** (`+lon_0=3`): selftest `FAIL EPSG:3857 ctrlΔ=333958.62m` → restored,
   sha256 `866c998c…` = the saved good copy **as it stood at that moment** → 9/9 PASS.
   ⚠ That hash is the PRE-pole-clamp file — this falsification ran BEFORE fix 2 landed. It is
   NOT the final hash; see the corrected §5 line.
2. **Pole NaN (the real defect found):** pre-fix transcript shows `proj.forward(10, ±90) →
   [null,null]` (JSON for NaN), z0-rect warp grid = `[NaN×5, 0…]`, z0 tile emitted
   `h[0.0..0.0]`; post-fix grids have 0 NaN and z0 = `h[51.0..51.0]` — and the national bake
   stayed byte-identical.
3. **Terrarium decode corrupted** (−32768 dropped): city sample → orthometric mean **32,843.9 m**,
   Eixample 32,799.4 m — absurd, seen failing → restored, sha256 `72555e75…` = saved good copy →
   Eixample 31.4 m again.
4. **z pinned above served max** (in-process `z=17`, Barcelona): `HTTP 404 "Tile not found"` →
   honest throw, no fill (verdict §1: max zoom varies by place; the row pins z15).
5. **maxTiles=4** vs full city (266 tiles): honest refusal naming both numbers.
6. **Bogus `--dtm-source`**: `bakeCity` → `skip-unwired` "no DTM fetch adapter for source
   'bogus-source'" (loud skip, exit 0 — CI semantics preserved).

## 5 · Session-standard checks

- Root tsc: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` →
  **RC=0** (captured directly).
- `node tools/context-bake/reproject.mjs --selftest` → **9/9 PASS** (8 existing rows unchanged).
- `git status`: this lane modified ONLY `tools/context-bake/terrain.mjs` +
  `tools/context-bake/reproject.mjs` (concurrent Wave-E lanes' files — `packages/site-parcel-data/**`,
  other `impl/` docs — present and untouched). Root manifests byte-identical. Nothing committed.
- No ceiling raised, no gate touched, no gate-debt entry, no rival built (no existing
  terrarium/slippy/WebP solver in the repo — grepped first; mercator reprojection goes through
  the ONE shared `reproject.mjs` path, per the verdict).
- Final file hashes: `terrain.mjs` `72555e7543842e60aace84f99a742c5e14d1f781a6af0a8c9dfd2db9e2b49ca8`,
  `reproject.mjs` `b75af09860639a44982e3be3d7c3da5b4b69f5bb9c76d535345ee6a58a2e94be`.
  > ⚠ **Corrected 2026-09-01 (second-pass re-verification).** This line read
  > `866c998cb2e18b199ba829d6d70c90837823ac342211355e1545dd7d78d81949` — **stale, and stale in the
  > way this repo keeps getting bitten by**: it is the hash of the file BEFORE the pole-clamp fix,
  > captured during falsification 1 and re-transcribed into §5 as "final" without re-measuring.
  > **Proven, not guessed:** `sed '85,97d' reproject.mjs | sha256sum` → `866c998c…` exactly — i.e.
  > deleting the clamp block (lines 85–97) reproduces the recorded hash. The CODE was always
  > correct (clamp present, selftest 9/9, pole NaN proven load-bearing); only the RECORD was wrong.
  > **Re-measure, never re-transcribe:** `sha256sum tools/context-bake/*.mjs`.

## 6 · Discoveries recorded, not acted on (E4 control 10)

- **The root `workspaces` field makes ANY in-repo `npm i` under tools/ dangerous** — npm resolves
  the workspace root even with a local package.json present and dies on `workspace:*` (or worse,
  could mutate the root). The scratch-dir-copy pattern (already what `terrain-bake.yml` does) is
  the only safe install path for the standalone artefact; the terrain.mjs header's "in a scratch
  dir" note is load-bearing, not stylistic.
- **proj4's EPSG:3857 pole behaviour (NaN at ±90°) would bite ANY future z/x/y raster source**,
  not just Mapterhorn — the clamp in `getProjector` now covers all of them, but if a future
  geographic-but-bounded CRS is added, the same "domain-clamp at the projector" pattern applies.
- Cutover gates (verdict §5.4) remain OPEN and are NOT claimed here: (a) full `--bake-city` for
  BOTH cities + verify PASS (only the Barcelona AOI + full-city sample ran in this lane; Madrid
  full-city sample was not run — ~432 z15 tiles, deferred to the gate run), (b) attribution
  shipping, (c) founder direct-fetch vs pmtiles-mirror choice, (d) per-city max-zoom probe if a
  z>15 pin is ever wanted.
- CI (`terrain-bake-all.yml`) needs NO change for this lane — it never passes `--dtm-source`, and
  the sharp dep is unreachable on the default path (lazy import). If the cutover later wants
  mapterhorn in CI, the workflow's scratch-dir install list gains `sharp@0.33`.

Transcripts/artifacts: session scratchpad `e3a-seam/` (pre/post/mh bakes + .sha files + cmp.mjs +
saved good copies). Not in the repo tree.

---

## 7 · Independent re-verification, second pass (2026-09-01, foreground, live network)

The lane was re-opened and every load-bearing claim above was **re-executed from scratch** rather
than re-read. One defect was found and is fixed above (the §5 `reproject.mjs` hash). Everything
else reproduced. Node 24.15.0, Windows/Git Bash, `sharp@0.33.5` present in
`tools/context-bake/node_modules/` (standalone artefact; pnpm workspace untouched).

**Endpoint liveness first (a dead endpoint would have faked a pass):** `tiles.mapterhorn.com/tilejson.json`
→ **200**; a real BCN z15 tile `15/16580/12238.webp` → **200, 117,678 B**; IGN WCS GetCapabilities
→ **200**. Negative control retained: a *computed-wrong* tile coord `15/16575/12290` → **404**.

### 7.1 Default-OFF, proven against HEAD itself (not against a memory of HEAD)

The pristine compiler was reconstructed from git (`git show HEAD:…` for **both** files, with the
pristine terrain re-pointed at the pristine reproject so the control shares **no** patched byte —
verified `grep -c 'mapterhorn|terrarium'` → **0/0** in both). Same AOI, both compilers, live IGN:

```
pristine HEAD compiler  → 18 files (17 tiles + layer.json)
patched compiler, NO flag → 18 files
diff pre.sha post.sha  →  (empty)   DIFF_RC=0        # 18/18 sha256 byte-identical
```

Because the two runs are independent live fetches, this single result proves **both** the
default-OFF invariant **and** the determinism of the instrument. §L-1056 satisfied.

Structural corroboration (the switch cannot fire by accident):
- `grep "source: 'mapterhorn'"` in `terrain.mjs` → **0 matches** — **no REGIONS row routes here**.
- Repo-wide (ripgrep, excluding node_modules): `mapterhorn|terrarium` appears in exactly **two code
  files** — `tools/context-bake/terrain.mjs` and `tools/context-bake/reproject.mjs` (comments) —
  everything else is docs/audit. **Zero client, zero runtime, zero package code.**
- **L-584 legal path byte-unchanged:** `fitFootprintGroundPlane` extracted from HEAD and from the
  working tree hash **identically** (`a7094da0…` both) — the legal sampler is untouched.

### 7.2 Executed proof — same AOI, both sources, real compiler, real verifier

`--bake-city barcelona --bbox 2.15,41.38,2.174,41.398`, national vs `--dtm-source mapterhorn`:
Mapterhorn fetched **9 z15 tiles → 1204×1204 px @ EPSG:3857**; national fetched **107×80 px @
EPSG:4326**. Both produced the **same 17 tile keys, z0..12**. `terrain.verify.mjs --tileset`
(independent decoder) → **RC=0, "tileset is Cesium-loadable"** on **both**.

| file | national B | mapterhorn B | Δ | sha256 |
|---|---|---|---|---|
| 0/1/0 · 1/2/1 · 2/4/2 · 3/8/5 · 4/16/11 · 5/32/23 | 177 each | 177 each | +0 | **IDENTICAL ×6** |
| 6/64/46 | 1009 | 1009 | +0 | differs |
| 7/129/93 | 1789 | 1789 | +0 | differs |
| 8/259/186 | 2353 | 2433 | +80 | differs |
| 9/518/373 | 4833 | 4853 | +20 | differs |
| 10/1036/747 | 11457 | 13497 | +2040 | differs |
| 11/2072/1494 | 25933 | 37477 | +11544 | differs |
| 11/2072/1495 | 6869 | 9565 | +2696 | differs |
| 12/4144/2989 | 17001 | 23813 | +6812 | differs |
| 12/4144/2990 | 2869 | 4937 | +2068 | differs |
| 12/4145/2989 | 73145 | 100637 | +27492 | differs |
| 12/4145/2990 | 13325 | 19101 | +5776 | differs |
| layer.json | 1874 | 1976 | +102 | differs |
| | | | | **byte-identical 6 / 18** |

**6/18 identical** reproduces §3 exactly. Note the honest nuance the earlier pass glossed: at
z6/z7 the tiles are the *same size* yet **differ** — identical byte-count is not identical
content. Only z0–z5 (constant sea-level fill, where the two inputs agree exactly) are truly
bit-equal; that they ARE bit-equal is the strong control that the shared encoder is untouched.

### 7.3 Datum agreement re-measured through the REAL sampler (full city bbox)

| probe | national 25 m WCS | mapterhorn z15 | Δ |
|---|---|---|---|
| Port/beach | 4.0 | 3.9 | 0.1 |
| Montjuïc | 87.0 | 87.1 | 0.1 |
| Tibidabo | 485.0 | 495.6 | 10.6 † |
| Eixample | 29.7 | 31.4 | 1.7 |
| city-wide mean | 75.8 (622×666 px) | 75.9 (6610×9404 px, 62,160,440 samples) | 0.1 |

† verdict §2's IGN 5 m anchor reads **492 m** — the *current* 25 m fetch is the low one.
Header line printed by the run: `(MAPTERHORN EPSG:3857, geoid lift +51 m — --dtm-source override,
lift stays ES's)` — **the datum lift is keyed to the national row, exactly as verdict §5.2 requires.**
Arithmetic cross-check: raw AOI terrarium max **64.07 m** orthometric ↔ baked tile max **114.8 m**
ellipsoidal = 63.8 + 51. The lift is applied once, from the ES row.

### 7.4 Falsifications re-executed (each seen failing → byte-identical restore → seen passing)

1. **3857 def corrupted** (`+lon_0=0`→`3`): `FAIL EPSG:3857 ctrlΔ=333958.62m`, **RC=1** → restored
   → `sha256 b75af098…` matches saved good copy → **9/9 PASS, RC=0**.
2. **Pole-NaN defect is REAL and the clamp is load-bearing** — measured on raw proj4:
   `lat=90 → [null,null] isNaN=true`; `lat=-90 → [null,null] isNaN=true`;
   `lat=85.05112877980659 → y=20037508.34` (finite); `lat=41.39 → y=5070037.89` (finite).
   Control: the **pristine** reproject has no 3857 def at all (`throws: no proj4 def registered`),
   so this projector is new surface, not a modified national one.
3. **Terrarium decode corrupted** (`−32768` dropped): AOI stats went
   `min 5.75 / mean 27.49 / max 64.07` → **`min 32773.75 / mean 32795.49 / max 32832.07`** —
   absurd, seen failing → restored → `sha256 72555e75…` matches → correct stats returned.
4. **z pinned above what the place serves** (in-process `z=17`, Barcelona):
   `HTTP 404 ct=text/plain body="Tile not found"` → honest throw, **no fabricated tile**.
5. **maxTiles=4** vs a 9-tile bbox: `terrarium-zxy: bbox needs 9 z15 tiles > maxTiles 4 — refusing
   honestly` — **both numbers named** in the refusal.
6. **Bogus `--dtm-source bogus-source`**: `::warning::SKIP barcelona: no DTM fetch adapter for
   source 'bogus-source'`, **exit 0**, and **0 files written** to the out dir (checked) — CI
   semantics preserved, no fake tile.
   *Restore control after 4+5:* config returned to `z=15 / maxTiles=512` → raster `1204x1204`,
   `EPSG:3857`, 9 tiles. The falsification harness itself was proven reversible.

### 7.5 Gate readings (this pass, captured directly)

- Root tsc: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → **RC=0**.
- `node reproject.mjs --selftest` → **9/9 PASS, RC=0** (8 national rows unchanged; the 3857 row
  agrees with the independent closed form to **0.18 m**).
- `terrain.verify.mjs --tileset` → **RC=0 on both** tilesets.
- No ceiling raised, no gate disabled, no gate-debt entry, no rival solver, nothing committed.
- Temp control files (`__pristine_*.mjs`) were created inside `tools/context-bake/` so Node could
  resolve the standalone `node_modules`, and **deleted afterwards**; `git status` confirms this lane
  leaves only `tools/context-bake/terrain.mjs`, `tools/context-bake/reproject.mjs` and this findings
  file. Other modified paths belong to concurrent Wave-E lanes and were not touched.

### 7.6 What this pass did NOT establish (unchanged from §6 — still OPEN)

Madrid was **not** baked or sampled this pass. Full-city `--bake-city` for both cities, attribution
shipping, the founder's direct-fetch-vs-mirror choice, and the per-city max-zoom probe remain the
**open cutover gates** (verdict §5.4). Nothing here authorises a cutover; the switch stays OFF.
