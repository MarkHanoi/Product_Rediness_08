# LANE REGIONS — 25 whole-country rows landed + the two-country local proof (2026-09-02)

> Executes `context-everywhere-assessment.md` (mtime 2026-09-01 23:38, read before consuming).
> Authority: E4 controls · E5 report (binding source verdicts) · E5-A sweep · L5 sweep · E3A
> Mapterhorn ADOPT. ⛔ Pipeline NOT redesigned — rows only. ⛔ Nothing published, nothing committed.

## 1 · What is in the tree (uncommitted, on `main`'s working tree)

- **`bake.mjs` §BAKE-EUROPE-NATIONAL** — 25 whole-country region rows (EE LT LV PL LU SE FI NO DE
  FR IT GB IE CH AT CZ PT BE HR SI GR HU RO SK BG), each following the spain/denmark/netherlands
  shape and citing its `ASSESS <CC>` verdict row. **NO new row declares a `heightJoin`** — no wired
  stamp exists for any of them (dispatch supports mds/dhm/lod2nrw only), and a declared join that
  produces nothing is a non-zero exit by design; this is the shipped `netherlands` precedent
  (honest OSM `assumed` defaults). CITY-FALLBACK rows: **none needed — the assessment graded 0
  countries CITY-FALLBACK and 0 BLOCKED**, so every country got a national row.
- **Dedup (Copenhagen precedent, lossless by measurement):** lisbon, porto, rome, milan, berlin,
  munich, london, brussels, oslo, stockholm, helsinki, zurich, geneva, bern city rows REMOVED —
  each fully contained in its new national row and none had a live height mapping. **Three kept
  exceptions, deliberately double-baked:** paris + lyon (`bdtopo` impl:'live' — real heights
  today) and koln (`lod2nrw` join; its stamp refuses a national bbox at its own maxSpanDeg guard).
  Fold-ins are named follow-ups (FR MNH stamp, DE per-Land router).
- **`heightSources.mjs`** — 8 new documented SOURCES rows (eesti3d_ee, bdot10k_pl, ruian_cz,
  gurs_si, geoland_at, ealidar_gb, buildings3d_fi, mnh_fr) + 25 REGION_SOURCE mappings (10 channel
  rows, 12 honest `no-source` rows with the per-country reason, 3 reusing existing rows: lidar_se,
  ndh_no, lod2de, swissbuildings3d, grb_be, dgt_pt, piedmont_it). SE row carries the probe note:
  the context height gate is a FREE download credential, NOT the NGP plan gate.
- **`terrain.mjs`** — TERRAIN_SOURCES `ee` (geoidSepM **18.2**, GeoidEval EGM2008 @ Tallinn) and
  `lu` (**48.0** @ Luxembourg City) — probe-computed, never guessed; both marked UNWIRED for the
  national/legal path (no scope expansion), visual bake via `--dtm-source mapterhorn` only.
  REGIONS rows `tallinn` + `luxembourgcity` added. 13 datum-lift constants remain owed
  (LT LV PL AT CZ IE HR SI GR HU RO SK BG — recipe on the row comment).

## 2 · Verification of the config (foreground, RC read immediately)

| Probe | Result |
|---|---|
| `bake.mjs --check` (heap 12288) | **RC=0** — 35 regions planned (25 new national + spain/denmark/netherlands + paris/lyon/koln + US/SA); budget: spain 9 bboxes / denmark 4 / koln whole-city — “✔ every height join has a bounded working set and enough heap” |
| REGION_SOURCE integrity (node import) | **RC=0** — 25/25 mappings resolve, 0 dangling keys, **0 impl:'live' among new regions** (no join can arm silently) |
| `resolveHeights('luxembourg')` | `no-source` — “ACT PCN footprints CC0; national LiDAR 2019 reported NOT verified …” (the honest per-country reason, logged at bake time) |
| `resolveHeights('estonia')` | `documented` — Eesti 3D LoD2 channel + owed stamp named |
| `--dry-run --region luxembourg,estonia` (×7 layers) | **RC=0** — full command chain generated (download → osmium clip → tags-filter → export → merged tippecanoe per layer) |
| removed-region references | `grep clip-<removed-city>` over tools/.github/src/apps → **0 hits**; CI workflow takes `region` as an input, no hard-coded city list |
| `npx eslint` on the three files | **RC=0** |
| root `npx tsc --noEmit` | **RC=2 — NOT this lane**: 10 TS6133 errors in 4 files (`SemanticGraph.ts` M, `ordinance-extraction/readers.ts` ?? — other lanes' in-flight edits, one untracked-new during this session). Tree measured RC=0 at 2026-09-01 23:30 before those edits; this lane touched only `.mjs` files outside tsc scope |

## 3 · The two-country proof — what COULD run locally, and the named blocker

⛔ **The buildings bake cannot run end-to-end on this box — measured, not assumed:** `osmium`,
`tippecanoe`, `duckdb`, `docker` all absent (`command -v` → missing ×4) and **WSL is not
installed** (`wsl --status` → “not installed”); no admin path to any of them in-session. This is
the same PROBE-1 state the assessment recorded; bake.mjs's own header says the heavy run happens
“anywhere Docker OR the tools exist (dev / CI / Fly)”. **The proof therefore ran every layer of
the pipeline that is executable here, and the first two CI `--region` bakes (LU, EE) are the
designated completion** — they run behind the armed §MEASURED-HEIGHT-GATE.

**Executed (foreground, wall-clock measured):**
1. **pbf downloads to the pipeline's exact paths** — `luxembourg-latest.osm.pbf` **47,420,269 B in
   2.4 s**, `estonia-latest.osm.pbf` **122,684,556 B in 3.2 s** (both byte-identical to the
   assessment's range-GET totals); re-run `--dry-run` → the pipeline's own `download()` step
   reports “skip — exists 47/123 MB” at both paths. The row URLs are real files, not doc claims.
2. **Terrain, END-TO-END LOCAL (pure Node, Mapterhorn switch):**
   - `terrain.mjs --bake-city tallinn --dtm-source mapterhorn` → **RC=0 in 28.1 s** — 494 z15
     terrarium source tiles (12669×9255 px native 3857) → **11 quantized-mesh tiles z0..9**,
     finest h 17.1..72.7 m ellipsoidal; sea level reads **18.2 m = exactly EE's probe-computed
     geoid lift** (the datum boundary observed working).
   - `--bake-city luxembourgcity` → **RC=0 in 16.1 s** — 224 source tiles → **15 tiles z0..10**,
     finest h 48.0..471.3 m; floor **48.0 = exactly LU's lift**.
   - `terrain.verify.mjs --tileset` on BOTH → **RC=0**: every declared tile exists at its exact
     layer.json path and **decodes with the independent @here decoder**; the Cesium request path
     for each city centre resolves at every zoom. (“✅ tileset is Cesium-loadable” ×2.)
3. **Terrain throughput calibration (measured):** ~0.06–0.07 s per Mapterhorn source tile,
   network-bound — a per-city visual-terrain bake is seconds-to-a-minute.

## 4 · Falsification (each fired, each restored byte-identically — sha256-verified)

- **Height-gate family, on a proof country:** temporarily declared `heightJoin:'eelod2'` on the
  `estonia` row → `--check --region estonia` → **RC=5**: “✖ estonia: whole-country region
  (15.4 deg²) declares heightJoin 'eelod2' but NO stamp bboxes … Refusing to start.” The
  preflight refuses a declared-but-unproducible national join BEFORE any download, naming the
  country. (The runtime §MEASURED-HEIGHT-GATE at bake:885 is the second tier of the same family
  and fires on the CI bake if a declared join stamps nothing.) Restored → `sha256sum -c` **OK**.
- **Severed terrain source:** endpoint → `tiles.mapterhorn.invalid` → luxembourgcity bake
  **RC=1** naming the severed hostname (`getaddrinfo`), **no output dir created** (no fake
  tiles). Restored → `sha256sum -c` **OK**.
- **Cap-refusal observed live (unplanned, kept as evidence):** the first tallinn bbox was
  REFUSED at **580 z15 tiles > maxTiles 512** — fixed by SHRINKING the bbox (24.65..24.92 ×
  59.40..59.50 → 494 tiles), **never by raising the cap**. The row comment records the refusal.

## 5 · The full-bake plan (data)

**`regions-full-bake-plan.json`** (same directory) — ordered 25-row country table (⚠ CORRECTED by the adversarial verifier 2026-09-02: this line and the file said 24 — **bulgaria was missing from BOTH the countries array and the phase lists** while the file's own totals row said new_countries: 25 and bake.mjs/REGION_SOURCE/the assessment all carry BG. A plan sequenced from it would have silently baked 24 of the founder's 25 "everywhere" countries. Fixed: bulgaria inserted at order 15 / phase 2, orders 15..24 renumbered 16..25) (phase 0
calibration LU→EE · phase 1 the nine countries whose cities the dedup removed from city rows ·
phase 2 rest small→large), per-country pbf GB (measured vs est. flagged), projected tiles GB
(0.8–1.9× pbf, Spain calibration, 7-layer caveat), projected CI minutes (~15–25 min/GB + fixed
overhead, anchored to run 30706761446's 180-min buildings-only datapoint — PROJECTED, replaced by
the LU/EE calibration bakes), plus the prerequisites:
1. **R2 budget decision** (24–57 GB vs 10 GB free tier) — founder, before any publish.
2. **Workflow switch is now arithmetically FORCED**: ALL_REGIONS ≈ 33 GB pbf; the old ~13.6 GB
   set hit 180 min on ONE layer and the job ceiling is 330 min — an unscoped full bake cannot
   finish. Per-region bakes + merged artifacts/incremental sync (bake.mjs:57's own design) is a
   hard prerequisite for the next publish.
3. **Dedup consequence:** the next published tileset must include phase-1 countries or the
   removed cities vanish from the map (publish REPLACES the tileset).
4. 15 pbf sizes still UNMEASURED (Geofabrik throttle) — re-probe before scheduling.
5. Overture flips need the per-country count probe first; Europe default stays OSM.

## 6 · Honest gaps

- Buildings-side wall-clock/tile-weight for LU/EE is **UNMEASURED** (toolchain blocker above) —
  the plan's first two CI bakes are the calibration runs; every projection cell says PROJECTED.
- 13 datum-lift constants and all 9 stamp builds (EE FR SE NO AT GB SI DE-router BE×3) remain
  owed exactly as the assessment's §6 cost table prices them; CH stays wire-not-build.
- The dead REGION_SOURCE rows of removed cities (london, helsinki, …) were left in place —
  harmless (resolveHeights is keyed by live region names) and they document the channels.
