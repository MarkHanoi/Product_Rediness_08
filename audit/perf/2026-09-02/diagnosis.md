# LANE DIAGNOSE — cost attribution for the four founder axes (2026-09-02)

Inputs: `baseline-inner.json` (BASE-INNER, axes A+B, headless composed runtime),
`baseline-outer.json` (BASE-OUTER, axes C+D, real Chromium vs local prod build + pryzm.fly.dev),
`axisD-cold-startup.cpuprofile` (16.2 s cold open, 300-wall project, local prod build,
HEAD c5d0109c dirty), and one new bisecting microbench written by this lane:
`tools/perf/diagnose-wallstore-add-bench.mts` (reproduce: `npx tsx tools/perf/diagnose-wallstore-add-bench.mts`).
Environment: Windows 11, node v24.15.0, AMD Ryzen 5 7235HS. All profile numbers below are
MEASURED from the cpuprofile (self = leaf time; incl = subtree time) or from the bench; nothing
in the attribution tables is a reading-only claim unless marked NOT-MEASURED.

File guard honoured: this lane created ONLY `tools/perf/diagnose-wallstore-add-bench.mts` and
`audit/perf/2026-09-02/diagnosis.md`. Every fix below is a recommendation, not an applied edit.

---

## AXIS A — single element creation

The command pipeline is NOT the cost. BASE-INNER: wall.create 1.17 ms med headless
(ctx 0.06 / execute 0.35 / emit 0.56 — of the emit, authoritative-mirror WallStore.add 0.34 ms);
wall.createOpening 0.25 ms. Anything the user feels on a single create is downstream of the bus:

| cost | attribution (file + function) | evidence |
|---|---|---|
| per-add authoritative mirror | `packages/runtime-composer/src/authoritativeElementMirror.ts:193` -> `packages/geometry-wall/src/WallStore.ts add()` — the two sibling scans below run on EVERY single create and grow with level size | bench arm A per-add 32 us at wall 1-100 -> 348 us at wall 901-1000 |
| per-create scene pass | `apps/editor/src/engine/initScene.ts:2950-2991` — every non-batched `bim-wall-added` runs `collectNewPbrMeshes(scene)` (full traverse) + `countMeshes` (second full traverse) + tier re-evaluation | §PERF-L03-TIER-TRAVERSE logs in baseline-outer run0: 300 events, `isBatching=false`; l03.collectNewPbrMeshes 0.8 ms/pass at small scene, O(meshes) each |
| render/scene-commit | not in the headless numbers by construction (canvas null) | declared in baseline-inner |

## AXIS B — bulk creation

Headline (BASE-INNER): 1000-wall `wall.batch.create` = 286 ms, of which **emit 265 ms, of which
authoritative-mirror replay 228 ms (80%)** — the mirror replays the batch as 1000 individual
`WallStore.add` calls, and add() is superlinear (0.077 ms/wall @100 -> 0.228 @1000).

**Root cause CONFIRMED BY MEASUREMENT this lane** (`diagnose-wallstore-add-bench.mts`, zero
listeners attached, fake level authority only — isolates store-internal cost; N=1000 disjoint
segments, one level):

```
A default            total= 259.3ms  per-add 32us->348us  growth 10.8x   (what the mirror pays)
B stamped+flagOff    total=  45.7ms  per-add 17us-> 42us  growth  2.4x   (both scans off — near-flat)
C derivationOnly     total= 151.8ms  per-add 30us->271us  growth  9.0x
D retreatOnly        total= 239.1ms  per-add 64us->384us  growth  6.0x
E hydration          total=  13.3ms  (the loader's designed suppressed path — 20x cheaper)
F +0.05ms listener   total= 380.2ms  (falsification control: planted delay appears, +121ms)
```

Attribution to lines:
1. `packages/geometry-wall/src/WallStore.ts` `add()` (~line 440): when `joinIntent === undefined`
   it collects ALL level siblings via `_levelIndex` and calls
   **`deriveJoinIntent` (`WallJoinIntentStamp.ts:60`)** — two full passes over every level wall's
   endpoints with `Math.hypot` per endpoint (L-927 chokepoint). O(levelWalls) per add => O(N^2)
   per batch. ~106 ms of the 214 ms delta.
2. Same block (~line 493): **`retreatOntoHostFaces(siblings, wall)` (`WallHostBodyRetreat.ts`,
   §FIX-WALL-CREATE-ON-HOST-FACE L-929)** — receives ALL siblings on every add, default ON
   (`__pryzmWallCreateOnHostFace !== false`). ~194 ms of the delta (the two overlap; each is
   independently superlinear).
3. The mirror (`authoritativeElementMirror.ts:193`) has NO batch bracket — it neither suspends the
   scans (as `beginHydration()` does for the loader, arm E) nor amortizes them per batch. Note
   L-927's own rationale says batch producers "have no gesture to read" — deriving per-op against
   the dispatch-order prefix is exactly the coin-flip the comment condemns for the loader.

Secondary (BASE-INNER, measured): singles anti-pattern context tax — `storesAsRecordView`
(`apps/editor/src/bootstrap.ts` storesProvider) rebuilds `Object.fromEntries` over EVERY store on
EVERY dispatch: 0.117 -> 0.672 ms/dispatch as the wall store grows to 1000. Its own comment
promises "a memoised view if it shows up in the bench" — it showed up.

Also real, correctness-not-perf (BASE-INNER, measured refusals): generator `door.batch.create`
REFUSES on the composed bus (`dt-solid-timber` vs `@pryzm/types-builtin` vocabulary,
`CreateDoorBatch.canExecute`); composition-root `runtime.undoStack.undo()` silently restores
nothing for element stores (C03 §4.7 B1 — `bus.fetchStores` returns the plain-object
`storesAsRecordView` snapshot with no `applyPatch`). Production HUD/Ctrl+Z was already moved off
that slot (`SaveUndoRedoHUD.ts:313`, C03 §4.6 U-5), but `packages/runtime-undo-stack/src/UndoStack.ts:124`
still ADVERTISES the broken surface to Phase-C panels.

## AXIS C — project creation

BASE-OUTER: the server leg is negligible — local API create 12 ms med; live create 32 ms,
save of a 300-wall snapshot 68 ms, fetch-latest 57 ms. **Project creation cost == editor open
cost**: click-to-usable 7.2 s med locally (hydrateToCanvas 2.7 s, usable 7.2 s). All attribution
is Axis D's.

## AXIS D — project startup / load (the big one)

Cold open of a 300-wall project, local prod build: interactive 11.7 s med (profiled run 16.2 s).
Two scales: navigation+shell ~3-3.5 s, then STARTUP-BUDGET t0=runtime:composed -> first
interactive frame t+6.5 s. Attribution of the profiled 16.2 s (cpuprofile, self/incl ms):

| block | ms (measured) | attribution |
|---|---|---|
| JS parse/compile + native `(program)` | 5777 self, spread over all 16 s | ~25 MB of JS on the boot path: main 8.5 MB + engineLauncher 4.4 + domain-engine 4.4 + vendor-web-ifc 3.5 (statically imported via `packages/file-format/src/export/ifc/*` — `import * as WEBIFC from 'web-ifc'`) + thatopen 2.2 + three 1.8. web-ifc and the IFC exporter are pure dead weight at startup. |
| thatopen BUI panel churn | 693 self bundle-wide; 488 self in ONE anon frame | `updateCamera` -> **default-viewpoint snapshot at boot**: `apps/editor/src/engine/initViewpointsPanel.ts:133-135` — `viewpoints.create()` + `await defaultViewpoint.updateCamera()` costs 560 ms incl during boot. Plus bim-table renders (sec 4-5 and 13 of the timeline, ~1.5 s combined) and `setupLogo` 63 ms. |
| eager DataWorkbench build | `_buildDOM` 448 incl + `Rce` 263 incl + `C2` 84 + `_buildFilterBar` 50 = ~850 ms | `DataWorkbench._buildDOM` builds 9+ hidden panels at construction; constructed in `engineLauncher.ts` (~line 286, BEFORE initScene). `Rce` = the system-type schedule HTML builder (Wall/Door/Window "Types" sections from three stores' getAll()); `C2` = the materials-usage matrix (`DataSchedulesBucket.ts` / `MaterialsBucket.ts`). All of it lands in `dw--hidden` DOM nobody has opened. |
| theme CSS scaling | t6 147 self + UP 115 self + BP 175 self = ~437 ms | `apps/editor/src/ui/styles/AppTheme.ts` (`app-master-theme-v3`): concatenates ~150 CSS chunks then walks the WHOLE string char-by-char (UP) regex-scaling every px literal (BP). Pure function of (static string x scale) — sampled at 2.3 s AND again ~8.4 s, uncached. |
| shader/pipeline compile | node-builder `build`/`getNodeBuilderState` ~400 incl + `_completeCompile` 418 self + `A` (program ctor) 363 self = ~1.2 s | three.js program build for the 300-wall scene (WebGPU node system + fallback). Consistent with the per-element-unique-materials instancing defeat (see suspects) — program-count probe still owed. |
| render loop during boot | frame `tick` 2218 incl; `render` 1432 incl; `renderObject` 656 incl | frames burned while boot work floods the main thread; `_renderScene` 950 incl. |
| engine boot orchestration | `M8e` (engine boot entry) 1069+693 incl; `y$e` = `initUI` 587 incl; `Mze` (toolbar/panels compose) 404 incl; `G1e` = `initTools` 375 incl | matches STARTUP-BUDGET deltas: scene-done +869, builders-done +1647, ui-done +663. |
| hydrate leg (300 walls) | version-read-done -> snapshot-loaded = 988 ms; redetect `executeChunked`/`_executeRedetect` 279 incl; wall deep-clone `Li`/`Mz` 85 self | `ProjectLoader` replays walls with `isBatching=false` (logged 300x) so the L03 double-traverse + tier pass at `initScene.ts:2950` runs per wall; wall-clone = `cloneWallData` freeze path; room-label `_makeSprite` 97 self (`packages/room-topology/src/RoomLabelRenderer.ts`) at sec 11.4-14.5. |
| GC | 273 self | allocation churn from the above (string/DOM/clone). |
| Cesium pre-warm | 165 self | `eagerGlobeStart.ts`/`cesiumWarmup` — DELIBERATE (documented 122 ms warm); acquit. |
| DOM churn | appendChild 112 + querySelector 90 + querySelectorAll 53 + selector-engine `query` 203 = ~460 self | DataWorkbench + toolbar + BUI table builds above. |

Live-site deltas (BASE-OUTER): cold shell DCL 3.46 s vs warm 0.78 s — network dominates the WAN
shell; SW serves 32/36 assets warm yet warm interactive did NOT improve => local D is CPU-bound.

---

## KNOWN SUSPECTS — verdicts (measured, or honestly not)

| suspect | verdict | evidence |
|---|---|---|
| `*.batch.create` = ONE produceCommand exists; do all bulk paths use it? | **CONFIRMED pattern, one refusing path** | B3: 1000-batch = ONE ring entry (measured every rep). B4: D-TGL generator uses batch verbs (measured). Census: zero non-test `dispatch('wall.create')` loops; 61 files use batch verbs. BUT the generator's `door.batch.create` REFUSES on vocabulary and the live editor survives only via the LEGACY `CreateWallOpeningsBatchCommand` (measured refusal, BASE-INNER F6). Anti-pattern penalty when hit: 2.7-8x (measured). |
| ADR-0257 door-move: setOffset rebuilds whole level | **NOT RE-MEASURED — status from ADR + code** | ADR-0257 header: P1 (single-wall openings-only rebuild, OI-053h) IMPLEMENTED; P2-P5 backlogged — its own text still admits "O(walls-per-level) work per door nudge" in one variant. Neither baseline drove a door drag (render-side). Owed probe: browser-layer drag-to-commit timing in the outer harness. |
| instancing defeated by per-element unique materials | **CONSISTENT-WITH, direct count owed** | 1.2 s measured in three program build/compile for a 300-wall scene (above). Direct probe owed: `renderer.info.programs.length` vs element count in the browser. |
| O(n) scene.traverse (Scene Registry) | **ACQUITTED for startup — 26.4 ms total self** in the whole 16 s profile | BUT the L03 pass runs TWO full traverses per single element add (`initScene.ts:2950`), so it re-indicts at high mesh counts and high add rates; per-pass cost measured 0.8 ms small-scene. |
| §SCC barrel-at-module-load | perf analogue CONFIRMED | (program) 5.8 s; web-ifc + IFC exporter + full main monolith evaluated on the boot path (bundle table above). |
| project-switch full GPU reset | **NOT MEASURED** — no project-switch scenario in either baseline | Owed: a switch-project cell in the outer harness. |
| house post-gen DEAD-WAIT watchdogs still fixed? | **runtime layer clean; L7 not re-driven** | B4: generator end-to-end 32.6 ms med, dispatch 8.9 ms — zero dead-wait at the measured layer. The L7 executor (browser) was not driven by either lane. |

---

## RANKED FIXES — (user-felt ms saved x confidence) / blast radius

1. **Defer the DataWorkbench/SchedulePanel DOM build to first open** — saves ~850 ms of every
   editor boot (measured: _buildDOM 448 + Rce 263 + C2 84 + filter 50); it currently builds 9+
   panels into `dw--hidden`. Files: `apps/editor/src/ui/dataworkbench/*` + construction site in
   `apps/editor/src/engine/engineLauncher.ts` (~286). High confidence, small blast radius
   (lazy-init on `toggle()`/`show()`). **EXECUTABLE-NOW** (files unheld).
2. **Batch-bracket the authoritative mirror replay / index the sibling scans** — saves ~200 ms per
   1000-wall batch (80% of B2) and caps the per-single-create growth (348 us/add at 1000 walls).
   Two independent halves:
   a. `packages/geometry-wall/src/WallStore.ts`: maintain a quantized endpoint hash
      (respecting `JOIN_INTENT_EPS_M`) so `deriveJoinIntent` + `retreatOntoHostFaces` stop
      scanning all level walls per add. Measured bisect: derivation ~106 ms, retreat ~194 ms per
      1000. **EXECUTABLE-NOW** (geometry-wall unheld); C83/L-927/L-929 semantics must be
      answer-preserving (same stamps, faster lookup).
   b. `packages/runtime-composer/src/authoritativeElementMirror.ts`: per-batch bracket
      (hydration-style suspend, or derive against the pre-batch set once) — arm E measured the
      suppressed path at 13 ms vs 259. **PLANNED — runtime-composer HELD by the UCE wave** (owner:
      runtime-composer). Contract note: L-927's own text says batch producers have no gesture to
      read, so per-op derivation inside a batch is already the condemned coin flip.
3. **Batch the loader replay** — the hydrate leg is 988 ms/300 walls and the per-wall
   `isBatching=false` L03 double-traverse makes it O(N^2) in elements; wrap ProjectLoader's element
   replay in the batch coordinator so L03/tier runs once at batch end. Files:
   `apps/editor/src/engine/persistence/ProjectLoader.ts` (**HELD — UCE wave**, owner: persistence)
   + `apps/editor/src/engine/initScene.ts:2950` (unheld). **PLANNED**; expected saving several
   hundred ms at 300 walls, seconds at 1000+.
4. **Cache the scaled theme CSS** — ~437 ms measured (t6+UP+BP), pure function of a static string x
   scale; memoize by scale factor (or precompute at build). File:
   `apps/editor/src/ui/styles/AppTheme.ts`. High confidence, tiny blast radius. **EXECUTABLE-NOW**.
5. **Defer the boot default-viewpoint snapshot** — 560 ms measured inside
   `initViewpointsPanel.ts:133-135` (`await defaultViewpoint.updateCamera()` at boot). Create it
   on first panel open (or after first-interactive-frame). **EXECUTABLE-NOW** (file unheld).
6. **Memoize `storesAsRecordView`** — measured 0.117 -> 0.672 ms/dispatch tax on EVERY verb at 1000
   elements; dirty-flag per store, rebuild on change. File: `apps/editor/src/bootstrap.ts`
   (storesProvider). Not in today's porcelain held-set, but the UCE wave owns apps/editor
   bootstrap halves — **EXECUTABLE-NOW by file-guard, coordinate with UCE before applying**.
7. **Take web-ifc + the IFC exporter off the boot graph** — `import * as WEBIFC` in
   `packages/file-format/src/export/ifc/*` drags 3.5 MB into startup parse; make the exporter
   entry a dynamic import. **PLANNED — file-format HELD by the UCE wave.** Saving: parse share of
   (program) 5.8 s (est. 200-400 ms) + memory.
8. **Shader/pipeline compile (~1.2 s) + material sharing** — renderer-side; needs the
   program-count probe first, then shared-material/program cache. `packages/renderer` **HELD**
   (SceneBootstrap.ts modified) — **PLANNED**, owner: render wave.
9. **Correctness riders** (no ms, user-trust): unify the door-type vocabulary
   (`plugins/door` / `executePlan.ts` — EXECUTABLE-NOW); stop advertising the broken
   `runtime.undoStack.undo()` element-store path (`packages/runtime-undo-stack/src/UndoStack.ts:124`
   comment + `command-bus` fetchStores — command-bus unheld, runtime-composer held).

## Methods / falsification

- Bench falsification: arm F planted a 0.05 ms listener delay -> +121 ms appeared (>=40 ms
  threshold); arm B (both scans off) is the negative control and went near-flat (10.8x -> 2.4x
  growth); arm E reproduced the designed hydration fast path (13 ms). A false hypothesis would
  have shown A ~ B.
- Profile de-minification: no sourcemaps in dist; every minified frame named above was identified
  by extracting the bundle text at the profile's line/column and matching verbatim strings back to
  source (Rce -> type-schedule builder, C2 -> DataSchedulesBucket matrix, t6/UP/BP -> AppTheme,
  y$e -> initUI, G1e -> initTools, M8e -> engine boot entry, Li -> cloneWallData,
  n8e -> initViewpointsPanel wiring).
- Not measured here (declared): door-drag rebuild scope, project-switch GPU reset, GPU program
  count, live-WAN authed editor (auth gate, BASE-OUTER F1/F2).
