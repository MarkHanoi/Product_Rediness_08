# AUDIT-C — SCENE · BUILDERS · RENDERING · SPEED

**Pascal editor (`pascalorg/editor`, MIT) vs PRYZM — geometry builders, scene-graph robustness, render loop, instancing, WebGPU, speed, and the render/capture product surface.**

Lane C of five. Written to contract standard for **C107**.
Date of measurement: **2026-08-23**. Pascal tree at commit `45a8cce` (single squashed commit; `git -C <pascal> log --oneline` → 1 line).

> ⚠ **Read the commands, not the prose.** Every count below carries the command that produced it. Both trees move; a number transcribed without its command rots (this repo's own `CLAUDE.md` records that failure five times).

---

## 1. Scope and method

### 1.1 What I read

**Pascal** — full read of the wall pipeline (`packages/core/src/systems/wall/*`, `packages/viewer/src/systems/wall/*`, `packages/nodes/src/wall/*`), the scene registry, the render-loop driver, the WebGPU init/capability path, the snapshot/capture pipeline, the post-processing pipeline, the wall batching system, and the wall/scene schemas. Two Explore agents ran read-only sweeps over the 2D/print/documentation layer and the open/persistence/collaboration path; their findings are folded in and attributed.

**PRYZM** — `packages/geometry-wall/**` (69 src files, 36 458 LOC), `packages/frame-scheduler/**`, `packages/core-app-model/src/{rendering,views,drawing,persistence,geometry}/**`, `packages/renderer-three/src/{adapters,pipeline}/**`, `packages/scene-committer/src/InstancedMeshCoalescer.ts`, `apps/editor/src/engine/{initScene,initPersistence}.ts`, `packages/file-format/src/export/**`.

### 1.2 What I ran

```bash
# both trees, source census (non-test)
find packages plugins apps src -name node_modules -prune -o -name dist -prune -o \
  -type f \( -name '*.ts' -o -name '*.tsx' \) -print | grep -v '\.test\.\|__tests__\|\.spec\.\|/dist/' \
  | xargs wc -l | awk '$2!="total"{s+=$1} END{print s}'

# PRYZM P3 gate, live
npx tsx tools/ga-gate/check-raf-count.ts     # → RC=0, 1 owner, 5267 files scanned
```

Everything else is inline in §2.

### 1.3 What I could NOT reach — stated up front

- **Pascal's hosted Studio AI-render pipeline is NOT in the MIT repo.** Confirmed by the coordinator (`grep -rn "nano.banana|banana|credits|generateRender|/api/render"` over `packages`+`apps` → two hits, both test fixtures using "banana" as an invalid-input string). I therefore describe the **product shape** (observable) and the **capture half** (readable) and say nothing about how generation works. ⛔ Inferring the backend from a screenshot is exactly the failure mode this audit exists to avoid.
- **No runtime benchmark was executed on either tree.** Every timing claim below is either (a) quoted from a comment in the source that reports its own measurement, or (b) *structural arithmetic* from published constants, and is labelled as such.
- **PRYZM's live instanced-wall ratio was not measured.** `window.__instancedElementRenderer` publishes it at runtime; I did not run the app. See §8.

### 1.4 Read-only discipline

Neither tree was modified. `apps/editor/src/ui/element-preview/**` (a sibling lane's live work) was **read** for the capture sub-axis and not touched.

---

## 2. Measured facts

### 2.1 Corpus size

| Fact | Pascal | PRYZM | Command |
|---|---|---|---|
| Non-test TS/TSX files | **1 470** | **5 008** | `find … -print \| grep -v '\.test\.\|__tests__' \| wc -l` |
| Non-test LOC | **356 851** | **1 249 179** | `… \| xargs wc -l \| awk '$2!="total"{s+=$1} END{print s}'` |
| Test files | **459** | **2 657** | `find … -name '*.test.ts*' -o -name '*.spec.ts*' \| wc -l` |
| `expect(` call sites | **9 824** | **71 914** | `grep -rhoI --include=*.test.ts* "expect(" … \| wc -l` |
| Element-geometry packages | n/a (one `nodes` package, 60 kinds) | **18** `packages/geometry-*` | `ls -d packages/geometry-* \| wc -l` |

PRYZM is **3.5× the source and 5.8× the tests**. That is context for every "Pascal is simpler" observation below — simpler is sometimes better and sometimes just smaller.

### 2.2 Wall subsystem

| Fact | Pascal | PRYZM | Evidence |
|---|---|---|---|
| Wall miter solver | `packages/core/src/systems/wall/wall-mitering.ts` — **536 lines** | `packages/geometry-wall/src/JunctionResolverV2.ts` — **1 522 lines**, *plus* legacy `WallJoinResolver.ts` **3 338** | `wc -l` |
| Wall geometry builder | `packages/viewer/src/systems/wall/wall-system.tsx` — **1 309 lines** | `packages/geometry-wall/src/WallFragmentBuilder.ts` — **5 129 lines** | `wc -l` |
| Whole wall subsystem | **18 754** lines incl. tests (core+viewer+nodes wall dirs) | **66 783** (36 458 src + 30 325 in `__tests__`, 112 test files) | `wc -l` on the dirs |
| Boolean CSG library | `three-bvh-csg` — used **synchronously, per opening, per rebuild** | **none** — `grep -rn "three-bvh-csg" .` → **0 hits**. `manifold-3d` is an *optional, lazy, default-OFF* async upgrade | `packages/viewer/src/systems/wall/wall-system.tsx:41,52,1179`; `packages/geometry-wall/src/OpeningProfile.ts:32` |
| Wall layers (construction assembly) | **absent** — `WallNode` has one `thickness` | present — `WallLayer[]`, per-layer thickness/material | `packages/core/src/schema/nodes/wall.ts:159`; `packages/geometry-wall/src/LayeredWallOpeningBuilder.ts` |
| Wall rake (leaning wall) | **absent** — `grep -rn "rake" packages/core/src packages/viewer/src` returns only **roof** rake | present — `packages/geometry-wall/src/WallRake.ts` (529 lines) | grep |
| Non-rectangular wall silhouette (profile) | **absent** | present — `WallProfile.ts` (1 092), `WallProfileEditor.ts` (359) | grep |
| Curved (arc) walls | present — `curveOffset` sagitta | present — `WallArcParam.ts`, `CurvedWallLayerBuilder.ts` | both |
| Non-rectangular **openings** (arches, circles) | **absent** — opening cutout is a box/extrusion from width×height | present — 4 kinds, 5-arm capability matrix with declared refusals | `packages/viewer/src/systems/wall/opening-cutout-geometry.ts`; `packages/geometry-wall/src/OpeningProfile.ts:28-34` |
| Interior trim geometry (skirting / crown / chair rail) | **present, geometric** — `WallTrimConfig` with `height`, `proud`, `profile` | **absent as geometry** — `skirtingHeight` exists only as room-finish *data* | `packages/core/src/schema/nodes/wall.ts:34-72`; `packages/room-topology/src/RoomDataSchema.ts:98` |
| Wall face bands (wainscot / 4-band material split) | **present** — up to 4 horizontal bands per side, geometry split at band planes | **absent** — `grep -rn "faceBand\|wainscot"` → **0** | `packages/core/src/schema/nodes/wall.ts:75-97`, `wall-system.tsx:60-72`; grep |

### 2.3 Render loop

| Fact | Pascal | PRYZM | Evidence |
|---|---|---|---|
| `requestAnimationFrame` call sites (non-test) | **63**, across ~30 files | **1** | `grep -rn "requestAnimationFrame(" … \| grep -v test \| wc -l`; `npx tsx tools/ga-gate/check-raf-count.ts` → RC=0, `[raf-tripwire] OK: 1 owner`, 5 267 files scanned |
| Canvas frameloop mode | `frameloop="never"` + hand-rolled rAF that **advances unconditionally at 50 fps** | rAF **stops entirely** after 30 idle frames | `packages/viewer/src/components/viewer/index.tsx:524,576`; `frame-limiter.tsx:82-91,101` · `packages/frame-scheduler/src/IdleContinuation.ts:13` |
| `useFrame` systems ticking every frame | **80** (viewer 29, editor 29, nodes 22) | n/a — priority-ordered tick listeners on one scheduler | `grep -rn "useFrame(" … \| grep -v test \| wc -l` |
| Idle CPU | **non-zero by construction** — 80 callbacks × 50 Hz forever | **zero** — `"0 fps idle"` is the stated S03 win | `frame-limiter.tsx` (no dirty gate anywhere in `tick`) · `packages/frame-scheduler/src/FrameScheduler.ts:14` |
| Background-tab behaviour | rAF pauses (browser); `visibilitychange`/`focus`/`pageshow` force one `kick()` | `BackgroundHeartbeat` (unthrottled MessageChannel pulse) keeps work draining when `document.hidden` | `frame-limiter.tsx:96-98,110-113` · `FrameScheduler.ts:83-93` |

### 2.4 Scene-graph provenance

| Fact | Pascal | PRYZM | Evidence |
|---|---|---|---|
| Imperative `scene.add(` sites | **11 total**; **1** touches the live scene (a light helper). The other 10 are tests (7) and throwaway export scenes (3) | **138** non-test, across **78 files** | `grep -rn "scene\.add(" --include=*.ts* packages apps` both trees |
| `.traverse(` sites | **119** | **501** | same grep shape |
| Registry writers | **exactly one** — `useRegistry()`, a `useLayoutEffect` bound to the node's React lifetime | many; `sceneRegistry` is not the only path into the graph | `packages/core/src/hooks/scene-registry/scene-registry.ts:89-110` |
| Provenance of a scene object | **structural** — every registry entry was written by `useRegistry(id, type, ref)` and is deleted on unmount | **audited, not structural** — `ProjectIsolationAudit` reports **28 of 153 scene roots UNATTRIBUTED**, "neither proven clean nor proven leaked", plus 849 descendants attributed only by inheritance | `scene-registry.ts:89`; `packages/core-app-model/src/persistence/ProjectIsolationAudit.derivedElementLevelArm.test.ts:12` |
| Scene graphs the audit cannot see | Pascal has **one** R3F scene per `<Canvas>`; **0** audit tooling exists (`grep -rln "isolation\|provenance\|orphan"` returns only unrelated geometry/spatial code) | ≥4 declared: `window.scene`, Cesium `viewer.scene.primitives`, the furniture-carousel private scene, the drag-drop `indicatorScene` — declared in `SCENE_GRAPHS_NOT_TRAVERSED` and printed next to **every** verdict | `ProjectIsolationAudit.ts:48-56` |

### 2.5 Instancing / draw calls

| Fact | Pascal | PRYZM | Evidence |
|---|---|---|---|
| `InstancedMesh` for primary building elements | **essentially none** — one `<instancedMesh>` (elevator rails) + raycast helpers | primary strategy: instance per (geometry × material × level) | `grep -rn "InstancedMesh\|instancedMesh" … ` → elevator/renderer.tsx:599 only; `packages/core-app-model/src/rendering/InstanceGroup.ts:42` |
| Draw-call reduction strategy | **geometry MERGE, settle-based** — `buildWallBatch` concatenates finished wall geometries material-major into one buffer, one draw per material | **GPU instancing**, gated on 7 conditions; a `InstancedMeshCoalescer` merges *already-instanced* meshes sharing geometry+material | `packages/nodes/src/wall/wall-batch.ts:59-70`; `packages/scene-committer/src/InstancedMeshCoalescer.ts:1-6` |
| Merge trigger | ≥ **8** walls on a level, after **180 ms** quiet | n/a | `packages/nodes/src/wall/wall-batch-system.tsx:26,29` |
| Can a *unique-geometry* wall join the fast path? | **YES** — merge does not care that each wall's geometry is unique | **NO** — instancing requires identical geometry; the coalescer only merges identical (geometry, material) | by construction, both sides |
| Instanced-wall eligibility conditions | n/a | **7**: bridge injected, no openings, not curved, **no miter join data**, vertical rake, ≤1 layer, no wall profile | `packages/geometry-wall/src/WallFragmentBuilder.ts:1394-1402` |

### 2.6 WebGPU / backend

| Fact | Pascal | PRYZM | Evidence |
|---|---|---|---|
| Renderer class | `THREE.WebGPURenderer` | `THREE.WebGPURenderer` | `viewer/index.tsx:536`; `packages/renderer-three/src/adapters/WebGPURendererAdapter.ts` |
| WebGL2 fallback | **yes** — same `WebGPURenderer` with `forceWebGL: true` | **yes** — same `WebGPURenderer` with `forceWebGL2: true` (`'webgl-fallback'`) | `packages/viewer/src/lib/renderer-capability.ts:157-166`; `packages/renderer-three/src/RendererHandleFactory.ts:189-195` |
| Third rung (classic `WebGLRenderer`) | **absent** — init failure renders `<UnsupportedGpuViewerFallback />` | **present** — `'webgl-only'`, chosen deliberately for heavy generation to kill the TSL node-compile tail | `viewer/index.tsx:517-519`; `RendererHandleFactory.ts:155-176` |
| Adapter/device request timeout | **4 000 ms**, with orphaned-device reclamation | **not found** — no timeout on the adapter request in the factory chain | `renderer-capability.ts:36,105-112`; grep of `RendererHandleFactory.ts` |
| Device-loss recovery | **log only** — *"The page must be reloaded to recover the GPU context."* | full swap/reset path (`RendererSwapOverlay`, `safeDispose`, device-loss cascade into `webgl-fallback`) | `viewer/index.tsx:192-197`; `packages/renderer-three/src/pipeline/RenderPipelineManager.ts:4804` |
| Empty-draw guard (skip zero-vertex draws that poison the WebGPU encoder) | **present** — `setRenderObjectFunction` filter | **absent** — `grep -rn "setRenderObjectFunction\|hasDrawableGeometry"` → **0 hits** | `viewer/index.tsx:109-144`; grep |
| Automatic quality de-scaling on heavy scenes | **absent** — one fixed pipeline, user toggles + `?disable=` URL flags | **present** — 4 tiers with hysteresis; hard cap to `performance` at ≥1 200 meshes | `post-processing.tsx:64-90`; `packages/core-app-model/src/rendering/SceneQualityTierManager.ts:60-128` |

### 2.7 Open path / persistence / collaboration *(measured by the Explore sweep; commands reproduced from its report)*

| Fact | Pascal | PRYZM |
|---|---|---|
| Scene storage | one `graph_json TEXT` blob in SQLite (`~/.pascal/data/pascal.db`), 10 MB hard cap (`sqlite-scene-store.ts:27,633`) | server-authoritative PostgreSQL + chunked `.glb` geometry (`packages/persistence-client/src/chunks/ChunkReader.ts`) |
| Chunking / streaming / lazy level load | **none** — one blob in, one blob out | present (chunk reader) |
| After load | `setScene` marks **every node dirty** (`use-scene.ts:1374-1377`), then 5 O(n) migration passes (`use-scene.ts:683-1064`, 20 migration fns) | `ProjectLoader` publishes an expectation set; batch coordinator + progress scheduler |
| Undo | zundo **full snapshot per step**, `limit: 50`, plus a recursive deep-equality scan **on every tracked write** (`use-scene.ts:1582-1593`; `history-control.ts:90-123`) | three-layer store undo via `performUndoRedo.ts` (C03 §4.5–4.8) |
| Autosave tax | `JSON.stringify(state.nodes)` **on every store subscription fire** (`use-auto-save.ts:223`) | server PATCH + IndexedDB thumbnail cache |
| Real-time collaboration | **absent.** `y-websocket`, `crdt`, `socket.io`, `multiplayer`, `liveblocks`, `partykit`, `automerge` → **0 hits each**. What exists is SSE polling SQLite every 250 ms and replacing the **whole graph**; conflicts are `If-Match` → HTTP 409 → *"Another session saved first — refresh?"* | Yjs CRDT, `YjsDocAdapter`, 126 merges under a conflict-surfacing gate (`tools/rac-conformance/certification/gates/check-conflict-surfacing.ts`) |
| Multi-tenant backend in the OSS repo | **none** — `next-auth`/`clerk`/`auth0`/`prisma`/`drizzle` → 0 hits; `owner_id`/`project_id` columns exist but are unenforced | full BFF (`server.js`, ~240 KB) |

### 2.8 2D documentation output *(measured by the Explore sweep)*

| Capability | Pascal | PRYZM |
|---|---|---|
| Hidden-line removal from 3D solids | **ABSENT.** `hiddenLine`, `hidden-line`, `HLR`, `occlusionCull`, `projectToPlane`, `project3DTo2D`, `worldToPlan` → **0 hits each**. The 2D view is an **independent SVG renderer reading node data** (`floorplan-registry-layer.tsx:127-148`) | **PRESENT** — `packages/core-app-model/src/drawing/HiddenLineRemoval.ts`, **954 lines**, one occlusion engine × three consumers (plan/section/elevation), 6 dedicated test files |
| Material hatching / poché | **ABSENT** — `poche`/`material hatch` → 0 hits; `kind:'hatch'` exists in 3 places, **all gated on `isSelected`** | `PocheFillTable.ts` (219), `HatchPatternLibrary.ts` (227) |
| Pen weights / graphics rules | not as a table | `PenWeightTable.ts` (415), `GraphicsRulesEngine.ts` (415), `SymbolicRuleRenderer.ts` (337) |
| Sheets / titleblock / printed scale | **ABSENT** — `titleblock`, `paper space`, `sheetNumber`, `1:50`, `1:100`, `scaleBar`, `northArrow` → 0 relevant hits. Output is **A4 landscape, fit-to-page**, one page per level, title = one string | `CreateSheetCommand`, `AddViewportToSheetCommand`, `SheetStore`, `SheetIndexService`; `scaleDenominator` drives paper-space dimension gaps (`packages/auto-dimension/src/tiers.ts:101`) |
| DXF / DWG export | **ABSENT** — 0 hits | `packages/file-format/src/export/sheets/DxfExportService.ts` |
| IFC | import + convert app | import **and** export (`packages/file-format/src/{import,export}/ifc/**`) |
| Automatic dimensioning | **substantial** — `construction-dimensions.ts` **1 613 lines**, **9 tiers**, real datum policies (`centerline`/`wall-face`/`structural-face`/`finish-face`), architectural ticks, extension gap+overshoot, facade-occlusion suppression | `packages/auto-dimension` — **4 830 lines**, LOD-tiered by drawing scale |
| Plan symbology | door swings (fixed 90° arc), window pane+mullion, grid bubbles, room tags, stair break lines, door/window/room **schedules** | door/window elevation symbols, `OpeningElevationSymbolBuilder.ts` (698), `WallElevationSymbol.ts` (326), `DrawingZone`, `DetailLevelResolver` |
| `print-*.ts` | **3D PRINTING** (STL/3MF via `manifold-3d@3.5.1`), *not* documentation printing | documentation printing is `PdfExportService.ts` + `ViewportSvgComposer.ts` |

---

## 3. Pascal's design

### 3.1 The wall miter solver — one file, one thickness, four points

`packages/core/src/systems/wall/wall-mitering.ts` is the whole join story. It is 536 lines and it is very good code for what it does.

**Junction detection is two passes.** Endpoints are hashed to a 1 mm grid key (`pointToKey`, `TOLERANCE = 0.001`, `:36`), which groups L/Y/X corners for free. T-junctions ("passthrough") are found by testing whether a junction point lies strictly interior to another wall's segment. That second pass was the hot spot and the fix is worth quoting because it is the same class of fix PRYZM keeps making:

```ts
// wall-mitering.ts:170-183
// The naive form of this pass is `for each junction: for each wall` — O(J×N).
// On a real imported floor (1081 walls, 2047 endpoint keys) that is ~2.2M
// pointOnWallSegment calls and measured 584 ms per findJunctions() call, which
// WallSystem then repeats every frame while progressively rebuilding.
// … Bucketing walls by the grid cells their AABB covers therefore loses nothing …
// measured 11 ms on the same geometry.
```

`JUNCTION_GRID_CELL = 2.0` m, `JUNCTION_GRID_MAX_CELLS_PER_WALL = 64` with an `oversized` fallback list (`:101-105`). **584 ms → 11 ms, self-reported.**

**The ring sweep.** Every wall-end at a junction becomes a `ProcessedWall` carrying two edge lines (left/right) offset by `halfThickness`; passthrough walls are pushed **twice** (forward and reversed) so a T looks like a cross to the sweep. Entries sort by `atan2` with a **wall-id tiebreak** for determinism (`:352-357`), then each adjacent pair intersects `curr.edgeA ∩ next.edgeB`. Adjacent walls therefore **share** the corner point by construction — no void, no infill prism.

**The spike guard.** `MITER_LIMIT = 10` half-thicknesses (`:44`). Beyond it, butt joint. The comment names the exact user gesture that produced the defect ("a room-preset preview dragged on top of an existing wall").

**What it cannot do:** `const getThickness = (wall) => wall.thickness ?? 0.1` (`calculateLevelMiters`). One thickness. There is no per-layer miter, no layer continuity across a corner, no differing-thickness policy beyond the shared-corner geometry falling out of the line intersection. It returns exactly four points — `startLeft`, `startRight`, `endLeft`, `endRight` — and that is the wall's plan footprint.

### 3.2 The wall geometry builder — extrude, then CSG

`packages/viewer/src/systems/wall/wall-system.tsx:generateExtrudedWall` (`:958`):

1. Get the 4 miter points → `getWallPlanFootprint` (straight) or `getWallSurfacePolygon(wall, 24, …)` (curved, 24 samples).
2. Transform world → wall-local, build a `THREE.Shape`, `new THREE.ExtrudeGeometry(footprint, { depth: height, bevelEnabled: false })`, `rotateX(-π/2)`.
3. Subtract every opening with `three-bvh-csg`:

```ts
// wall-system.tsx:1176-1183
let resultBrush = wallBrush
for (const cutoutBrush of cutoutBrushes) {
  prepareBrushForCSG(cutoutBrush)
  const newResult = csgEvaluator.evaluate(resultBrush, cutoutBrush, SUBTRACTION)
  …
}
```

4. Split at horizontal band planes, assign material groups by face + band, re-project UVs in **world** space so finishes tile continuously across adjacent walls (`applyWorldPlanarWallUVs`, `:840-880` — de-indexes so every triangle projects by its own face normal).
5. **Build the collision mesh a second time**, from scratch, with `childrenNodes = []` (`:806-816`).

That last point is a real cost: **every wall rebuild runs the extrusion twice** — once with openings + CSG for render, once without for collision.

### 3.3 Dirty tracking — a budgeted drain with a trailing-edge flush

This is the part Pascal's README advertises and it is genuinely well built. `wall-system.tsx:479-483`:

```ts
const DRAG_FLUSH_MS = 80
const MAX_WALL_REBUILDS_PER_FRAME = 8
const WALL_PROGRESSIVE_DIRTY_THRESHOLD = MAX_WALL_REBUILDS_PER_FRAME
const WALL_PROGRESSIVE_TIME_BUDGET_MS = 8
```

Per frame (`useFrame(…, 4)`, `:528`):
- Collect dirty walls, group by level.
- If `dirtyWallCount > 8`, enter **progressive** mode: rebuild at most 8 walls and stop at 8 ms elapsed — but always ≥1 wall (`:604` requires `rebuiltWallsThisFrame > 0` before the time check), so progress is guaranteed.
- Compute `getAdjacentWallIds(levelWalls, rebuiltWallIds)` and **defer** those neighbours to `pendingAdjacentByLevel`.
- Flush the deferred neighbours only when `!hasDirtyWalls && now - lastWallDirtyAtMs >= 80` — i.e. the drag stopped.

The stated payoff (`:466-478`): *"Speeds up t-junction drags ~3×, 4-corner-room drags ~4×."*

**Three supporting mechanisms, each of which is a good idea:**

**(a) The level miter cache** — `packages/viewer/src/systems/wall/level-miter-cache.ts`. The miter solve is level-global, so a progressive rebuild would otherwise redo it 136 times for a 1 081-wall import. The cache key is an **exact field-by-field compare of 7 fields** (`id, start[0], start[1], end[0], end[1], thickness, curveOffset`), not a hash:

```ts
// level-miter-cache.ts:8-10
// The comparison is exact (no hashing): a stale hit would silently render wrong
// joints, and 7 numeric compares × N walls is microseconds — far cheaper than
// the risk.
```

**(b) The placeholder sweep** — `wall-placeholder-sweep.ts`, run every 30 frames. Any registered wall still carrying the mount-time 3-vertex placeholder geometry **and** not dirty gets re-marked. Its docstring names the incident: *"a live session … surfaced all 24 walls stuck on their degenerate placeholder collision meshes indefinitely … The renderer marks a wall dirty exactly once, on mount — if that one mark is consumed while the rebuild loop isn't looking … nothing ever re-marks it."* This is a **self-healing convergence guarantee**, and PRYZM has no structural equivalent.

**(c) Live overrides** — `useLiveNodeOverrides` / `useLiveTransforms`. A 2D drag publishes `{start, end, curveOffset}` to an override store; `getEffectiveWall` merges it, so the 3D mesh follows the cursor **without any Zustand scene write** — which matters enormously given §2.7's finding that every tracked write costs a full O(n) snapshot + a deep-equality scan.

**The honest limit of Pascal's dirty tracking:** it bounds the **geometry rebuild**, not the **join solve**. `calculateLevelMiters(levelWalls)` recomputes *every junction on the level* whenever any one of the 7 cached fields changes on any wall. The cache prevents redundant recomputation across frames; it does not make the solve incremental. And `getAdjacentWallIds` is **O(dirty × N)** with `allWalls.find()` inside the loop (`wall-mitering.ts:~500`) — no grid, unlike `findJunctions`.

### 3.4 The scene graph — provenance by construction

```ts
// packages/core/src/hooks/scene-registry/scene-registry.ts:89-110
export function useRegistry(id: string, type: string, ref: React.RefObject<THREE.Object3D>) {
  useLayoutEffect(() => {
    const obj = ref.current
    if (!obj) return
    sceneRegistry.nodes.set(id, obj)
    sceneRegistry.byType[type]!.add(id)
    return () => {
      sceneRegistry.nodes.delete(id)
      sceneRegistry.byType[type]!.delete(id)
    }
  }, [id, type, ref])
}
```

This is the **only** writer. `byType` is a `Proxy` that auto-creates a `Set` per kind, so plugin-contributed kinds participate with no seed list. `nodes` is a `RevisionedMap` that bumps a revision on every real change, giving cheap change detection without traversal.

**The structural claim, and it holds:** R3F owns attach/detach. A node's Object3D exists exactly as long as its React component is mounted, and the registry entry is created and destroyed by that same lifetime. There is **no path** by which an object enters the registry without an id and a kind, and **no path** by which it survives its node's unmount. Measured: `scene.add(` appears **11 times** in the whole repo, and exactly **one** touches the live scene — `packages/viewer/src/components/viewer/lights.tsx:193`, `state.scene.add(helper)`, a debug light helper.

⚠ **But this is a claim about the registry, not about the scene.** R3F's declarative tree is authoritative for *nodes*; it says nothing about drei helpers, post-processing render targets, or the 14 internal render targets the merged-outline node allocates (`post-processing.tsx:78`). Pascal has **zero** tooling that would tell you whether the scene contains something unaccounted for — `grep -rln "isolation\|provenance\|orphan"` over `packages`+`apps` returns only unrelated geometry code. The correct statement is: **Pascal's architecture makes the leak class much rarer, and Pascal has no instrument that would detect it if it happened.**

### 3.5 The render loop — `frameloop="never"` plus an unconditional 50 Hz pump

This is the finding most likely to be misread from the README. Pascal does **not** use R3F's `frameloop="demand"`.

```tsx
// packages/viewer/src/components/viewer/index.tsx:518,524
<Canvas … frameloop="never" … >
// :576
  <FrameLimiter fps={maxFps} paused={renderPaused} />
```

```ts
// packages/viewer/src/components/viewer/frame-limiter.tsx:82-91,101
function tick(t: DOMHighResTimeStamp) {
  raf = requestAnimationFrame(tick)
  syncSize()
  const frameTime = clock.sample(t, interval)   // interval = 1000/50
  if (frameTime === null) return
  advance(frameTime)                            // ← unconditional
}
set({ frameloop: 'never' })
raf = requestAnimationFrame(tick)
```

`clock.sample` returns `null` only to **throttle** to 50 fps; there is no dirty check anywhere. So the editor renders and runs all **80** `useFrame` systems 50 times a second, forever, whether or not anything changed. The only pauses are `renderPaused` (canvas fully covered, e.g. the studio gallery) and the browser suspending rAF on a hidden tab.

`invalidate()` is called in 6 places, but with `frameloop: 'never'` it does not drive anything — the pump does. The 6 sites are vestigial or belt-and-braces.

There is one clever detail: when `?disable=draw` is set (the headless bake worker), rAF is replaced by `setInterval`, because Chromium throttles rAF to 1 Hz on a page with no damage (`frame-limiter.tsx:45-49`). That is a real, measured platform trap.

### 3.6 Draw calls — settle-based geometry merge, not instancing

Pascal cannot instance walls: every wall's geometry is unique (mitered footprint × openings). So it **merges** instead:

```ts
// packages/nodes/src/wall/wall-batch.ts:59-66
// Concatenates wall geometries into one buffer laid out material-major,
// wall-minor: every triangle sharing a material index ends up in a single
// contiguous run, so the merged mesh costs one draw call per material
// instead of one per wall per material.
```

Governed by `wall-batch-system.tsx:26,29` — `MIN_BATCH_WALLS = 8`, `BATCH_SETTLE_MS = 180`. The design details that make it usable:

- Every wall's **slice** of every run is recorded (`WallBatchSlice { nodeId, start, count }`), so `applyWallBatchGroups(batch, hidden)` can pull one wall back out **by rewriting group ranges — not by rebuilding buffers**.
- The merged mesh has `raycast = skipRaycast` (a no-op): picking, measuring and highlighting still go through each wall's own (now invisible) mesh. So batching is invisible to every interaction path.
- It re-sews on four **appearance** inputs that never go through a node — `shading`, `textures`, `colorPreset`, `sceneTheme`, `materials` (`wall-batch-system.tsx:37-83`). That is a correctness detail most implementations miss.

### 3.7 WebGPU

`packages/viewer/src/lib/renderer-capability.ts` is a small, careful file:

- `WEBGPU_INITIALIZATION_TIMEOUT_MS = 4000` on both the adapter/device request and `renderer.init()` (`:36,105,158`). A hung adapter cannot hang the app.
- `releaseDevice()` reclaims a device that arrives after the timeout raced — *"Any device we request and then abandon has to be released here or it counts against the browser's concurrent-device limit for the rest of the page's life."* (`:47-52`)
- `featureLevel: 'compatibility'` on `requestAdapter` (`:73`) — widens device support.
- Fallback: `createRenderer({ forceWebGL: true })` on the **same** `WebGPURenderer` class. Two rungs, then `{ status: 'unsupported' }` → `<UnsupportedGpuViewerFallback />`.

`installEmptyDrawGuard` (`viewer/index.tsx:109-144`) intercepts `setRenderObjectFunction` and skips any draw whose geometry has an empty position buffer, *"which would poison the WebGPU command encoder"* — one degenerate mesh flickers the **entire canvas**, not just itself.

Device loss (`viewer/index.tsx:192-197`) is **observed and logged, not recovered**: *"The page must be reloaded to recover the GPU context."*

### 3.8 Realtime render quality

`packages/viewer/src/components/viewer/post-processing.tsx` — 788 lines of TSL:
- **SSGI** (`three/addons/tsl/display/SSGINode.js`) with a tuned parameter block (`SSGI_PARAMS`, `:44-58`: `sliceCount 1, stepCount 4, radius 1, aoIntensity 1.5, giIntensity 0`) — i.e. it is being used primarily as **screen-space AO**, GI off.
- **Denoise** (`DenoiseNode`), **FXAA**, **MRT** (`diffuseColor`, `normalView` packed to RGB), **ink edges** (`lib/ink-edges.ts`), **merged outline** (14 internal RTs), **AgX tone mapping** + a scene-referred grade (`contrast 1.05, saturation 1.1`, `:39-42`).
- Backdrop is a world-ray sky gradient with a horizon haze term, driven by uniforms so the same pipeline serves opaque and transparent captures.
- Lighting is 3 directional lights (`lights.tsx`, 317 lines) — PRYZM's `PascalSceneLighting.ts` is named after it and reproduces the same rig (`packages/core-app-model/src/BimWorld.ts:199-213` cites Pascal's positions and intensities verbatim).
- Diagnostic `?disable=ao,denoise,outline,postFx,draw` flags for thermal A/B testing (`:64-90`). Simple and excellent.

**There is no automatic quality scaling.** DPR is capped (1.5 desktop / 1.25 coarse-pointer, `viewer/index.tsx:506-509`) and `maxFps` is a prop, but nothing measures the scene and steps down.

### 3.9 Capture — readable; generation — not in the repo

`packages/viewer/src/lib/snapshot-pipeline.ts` (402 lines) builds a **second, dedicated `RenderPipeline`** with the same SSGI/denoise/FXAA/ink/backdrop stack, rendering into its own `RenderTarget`, then:

```ts
// snapshot-pipeline.ts:277-282
const pixels = (await (renderer as any).readRenderTargetPixelsAsync(
  renderTarget, 0, 0, captureWidth, captureHeight)) as Uint8Array
```

then handles **two readback shapes** — WebGPU `copyTextureToBuffer` (top-down, rows padded to 256 bytes) and WebGL2 (tight, bottom-up, needs a row flip) — with a correct backend detection note: *"`isWebGPURenderer` lies — it stays true even when the renderer falls back to the WebGL backend"* (`:296-298`).

Constants (`:29-42`): `THUMBNAIL_WIDTH/HEIGHT = 1920×1080`, `SNAPSHOT_MIME = 'image/webp'`, `SNAPSHOT_QUALITY = 0.9`, `SNAPSHOT_MAX_EDGE = 2048`.

`snapshot-capture-overlay.tsx` (691 lines) is the framing UI: 5 aspect presets (`16:9, 9:16, 4:3, 3:4, 1:1` at `:32-38`), three crop modes (`standard` centre-crop / `viewport` / dragged `area`), a rule-of-thirds grid, corner accents, a live resolution HUD, and a `preset` mode that auto-stages a centred square at 75 % of the shorter side.

**Three honest limits I must state, because the screenshot invites the opposite reading:**

1. **Capture renders at the live canvas size**, not at a requested output resolution: `const { width, height } = renderer.domElement` (`:256`). "Standard 1920×1080" then **centre-crops and rescales** that buffer. On a 1400 px-wide canvas, 1920 is an **upscale**. There is no supersampled offscreen render.
2. The `0.5K / 1K / 2K / 4K` selector in the founder's screenshot belongs to the **generation** half, which is not in this repo. It is not this code.
3. Encoding is **one shot** — `convertToBlob({ type: 'image/webp', quality: 0.9 })`, no size check, no retry ladder. There is no byte budget anywhere in the capture path.

**The product shape (observable, not readable):** capture → attach reference images (a snapshot locks layout, a past render carries style) → choose variations 1–4 → choose resolution → generate against a credit ledger → history (v1) → share. That flow is a coherent answer to *"turn my model into a presentable image"* and it lives **inside the editor**, not in an export dialog.

### 3.10 Structural open cost

From the Explore sweep, with the arithmetic stated:

- `setScene` runs **5 full O(n) passes** (heal, retired-node removal, migration pass 0, pass 1, pass 2 — `use-scene.ts:683-1064`, 20 distinct migration/normalisation functions, several running Zod `safeParse` **per node**), then marks **every node dirty** (`:1374-1377`).
- The wall drip is 8 walls/frame. **1 000 walls ⇒ 125 frames ⇒ ≈2.1 s at 60 fps** in the best case where the 8 ms budget never binds; **≈16.7 s** in the worst case where each rebuild exceeds 8 ms (1 wall/frame). Roofs are slower still — `MAX_ROOFS_PER_FRAME = 1` (`roof-system.tsx:161`); stairs `MAX_STAIRS_PER_FRAME = 2`.
- **Miter joins are wrong for the whole of that window.** Adjacent-wall rebuilds only flush when `!hasDirtyWalls && quiet ≥ 80 ms` (`wall-system.tsx:642`), and during a bulk load `hasDirtyWalls` is continuously true. So the load shows butt-jointed corners, then a *second* 8-per-frame drain corrects them.

**Verdict on speed: Pascal's open is fast because its scenes are small and its model is thin, not because its load path is clever.** A single 10 MB JSON blob, 5 O(n) migration passes, every node dirtied, and an 8-per-frame drip is not a design that scales to a BIM model — it is a design that is fine at 1 000 walls and has a 10 MB hard ceiling (`sqlite-scene-store.ts:27`).

---

## 4. PRYZM's design

### 4.1 The wall builder — and the fact that PRYZM already read this exact Pascal file

⭐ **`JunctionResolverV2` is an explicit, attributed port of Pascal's `wall-mitering.ts`.** Its header says so:

```
// JunctionResolverV2 — Pascal-style per-wall miter trimming (ADR-0055 P1).
…
// Algorithm (port of pascalorg/editor `packages/core/src/systems/wall/wall-mitering.ts`):
//   1. JUNCTION DETECTION — two passes: (a) endpoint cluster … (b) T-projection …
//   2. RING SWEEP — … push the passthrough wall TWICE … sort entries CCW by
//      `atan2(dir.z, dir.x)` … intersect curr.LEFT_edge_line ∩ next.RIGHT_edge_line
//      … Parallel guard: |det| < 1e-9 → fall back to the perpendicular cap.
```
— `packages/geometry-wall/src/JunctionResolverV2.ts:1-32`

The borrowing is broader than the walls. `grep -rin "pascal" --include=*.ts packages plugins apps` finds Pascal-attributed design in the **lighting rig** (`BimWorld.ts:199-213`, positions and intensities cited one-to-one), the **camera controls** (`BimWorld.ts:294`, *"Exact Pascal parity — matches custom-camera-controls.tsx props 1-to-1"*), the **first-person controller** (`FirstPersonController.ts:19,289,326`), and the **orbit/top-view navigation** (`ViewNavigationManager.ts:83,261,281,298`). Pascal is already a design reference inside PRYZM. The relevant question for C107 is therefore not *"should we look at Pascal"* — it is *"what did we not take, and why."*

**What PRYZM added on top of the port** — each with its own §-tag and its own defect:

- `systemTypeId` — a differently-typed newcomer joining an existing same-type L-corner is **frozen out** of the corner miter and adapts instead (`JunctionResolverV2.ts:46-56`, §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE / L-130).
- `joinIntent: { start?: 'butt', end?: 'butt' }` — **creation-time incumbency**, stamped at the single element-creation chokepoint. The rationale is the strongest paragraph in the file: *"incumbency is not recoverable from the figure: an incumbent L plus a newcomer landing on its vertex and three arms drawn as one fresh Y are the SAME three segments"* (`:58-77`, L-923 / C83 §10.2.1). **Pascal has no concept of this and cannot express the distinction.**
- Arc tangents at the join. Pascal's `getWallDirectionFromJunction` *does* use the curve frame for endpoints (`wall-mitering.ts:~250`), so this one is closer than it looks — but PRYZM's block records the measurement: an arc `(0,0)→(4,0)` with control `(2,3)` has end-tangent `(0.5547, −0.8321)` vs chord `(1,0)` — **56° apart** (`JunctionResolverV2.ts:79-90`).

**Beyond the port,** the legacy `WallJoinResolver.ts` (3 338 lines) carries policy Pascal has no analogue for: `§MULTI-CLUSTER` (3+ endpoints), `§PARTITION-SHELL-INNER-FACE` (a partition clamps to the shell's inner face with a deliberate 1 mm overlap — `:780`, *"NOT a tolerance: a deliberate 1 mm overlap DIMENSION"*), `§SHELL-ANCHOR-PRESERVE`, `§FIX-WALL-FACE-TRIM-NO-CLASH`, `§NEAR-CORNER-L`, `§RESOLVED-STUB-SWEEP`, `§WJR-INVALID`.

### 4.2 Openings — no boolean CSG, by decision

**Measured: `grep -rn "three-bvh-csg" .` (excluding node_modules) → 0 hits.** PRYZM punches openings **analytically**, and the arms are enumerated:

```
// packages/geometry-wall/src/OpeningProfile.ts:28-34
//   A  plain straight, no mitre + no rake cap-drift → `THREE.Shape` + `Path` holes  ✅ exact
//   B  plain straight, mitred / lofted end          → abutting `BoxGeometry`        ✅ via gasket
//   C  layered straight                             → break-grid rasteriser         ✅ via gasket
//   D  curved wall                                  → radial bands in ARC-LENGTH    ⛔ REFUSES
//   E  instanced                                    → unit box × T·R·S              ⛔ excluded
//   F  single-volume CSG                            → PARKED, default OFF           — unavailable
```

Arm F is `manifold-3d` (lazy WASM), an **async upgrade** that replaces a segmented wall with one boolean-void volume, with the segmented mesh as an always-available fallback (`WallFragmentBuilder.ts:3292-3381`, *"CSG failed — keep the segmented mesh (SPEC §4: never an empty wall)"*). It is default-OFF because *"a prior §96-DEFAULT-ON experiment shipped a malformed cut in production"* (`:3137`).

This is the single largest architectural divergence in the wall pipeline, and **PRYZM's choice is the better one for a per-frame path**: no boolean evaluator on the interactive rebuild loop, no BVH build per wall per frame, no dependency on a CSG library's robustness for a wall to exist. The cost is that PRYZM had to build five arms where Pascal built one, and that arm D **refuses** (a curved wall cannot yet take a non-rectangular opening).

### 4.3 What PRYZM's wall models that Pascal's does not

| Property | PRYZM | Pascal |
|---|---|---|
| Layer stack (per-layer thickness + material) | `WallLayer[]`, `LayeredWallOpeningBuilder`, `WallSideFinishResolver`, `WallLayerPlanLines` | one `thickness` number |
| Rake (leaning wall) | `WallRake.ts` — sign convention pinned to `leftPerp`, plan-vs-perpendicular thickness derived and **proved** in the header, authorable band [15°, 165°] | absent |
| Non-rectangular silhouette | `WallProfile.ts` + a live authoring path (`WallTool.enterProfileEditMode` → `WallProfileEditor` → `_commitWallProfile`, reachable from the Contextual Edit Bar) | absent |
| Non-rectangular openings | 4 profile kinds (`rectangular`, `round-arch`, `segmental-arch`, `circular`), orthogonal to leaf count | absent |
| Junction infill / miter prisms | `WallJunctionInfill.ts`, `MiterPrismBuilder.ts` | not needed — the ring sweep shares corners so there is no void |
| Occupancy / placement conflict | `WallOccupancyStore.ts` (1 186 lines) | `spatialGridManager.canPlaceOnWall` |
| Move-reweld | `WallMoveReweld.ts` (1 436) + `WallMoveReweldService.ts` (738) | `wall-move.ts` (323) |
| Topology integrity check | `WallTopologyIntegrity.ts` (507) | `wall-topology.ts` (545) |

### 4.4 Instancing — and the condition that probably defeats it

```ts
// packages/geometry-wall/src/WallFragmentBuilder.ts:1394-1402
const isSimpleWall = (
    this._instanceBridge !== null &&
    !_hasOpenings &&
    !wall.curve &&
    !joinData?.startMN &&
    !joinData?.endMN &&
    isVerticalRake((wall as { rakeAngleDeg?: number }).rakeAngleDeg) &&
    _layerCount <= 1 &&
    !_hasWallProfile
);
```

The `~70–85 %` figure at `:1304` is stated for *"a typical office building"*. **The file's own next paragraph doubts it:**

```
// WallFragmentBuilder.ts:1409-1418
// ⭐ THE DECISIVE COUNTER. A 367-element "create walls by slab" batch froze
// the viewport for 32.7 s at 2069 scene meshes. … 367 groups means instancing
// collapsed NOTHING and the freeze has an obvious cause …
// A generated building MITRES ITS CORNERS, so the live hypothesis is that
// `joinData.startMN` / `endMN` disqualify most of the batch. That is a guess
// until it is counted, which is what these lines do.
```

Two of those seven conditions (`_layerCount <= 1`, `!_hasWallProfile`) and a third (`isVerticalRake`) are **correctness** exclusions, added by three separate lanes that each independently measured the same root: *a T·R·S matrix cannot express a shear, a non-rectangular silhouette, or a multi-colour stack.* They are right, and they are not removable.

⭐ **The consequence is structural and it is the headline of this audit's perf half: PRYZM's ONLY draw-call reduction mechanism is one that a real BIM wall is disqualified from.** `InstancedMeshCoalescer` does not close the gap — it merges *InstancedMeshes that already share geometry and material* (`InstancedMeshCoalescer.ts:1-6`), so a wall with unique mitered geometry is out of scope for both arms.

Pascal solved the same problem with the mechanism that does not care about geometry uniqueness. See §6 row 1.

### 4.5 The render loop — P3, verified today

```
$ npx tsx tools/ga-gate/check-raf-count.ts
[raf-tripwire] files scanned: 5267 (excluded 2577)
  Owners (code lines only):
      packages/frame-scheduler/src/RafAdapter.ts
[raf-tripwire] OK: 1 owner.
RC=0
```

One rAF owner across 5 267 files. Behind it:
- `FrameScheduler` with priority-ordered tick listeners (`pre-render → render → post-render → overlay`), a `dirtyFlags` set, per-frame **shared budget tokens** (`setBatchBudget(key, { budgetMs })`, `FrameScheduler.ts:279`), and `scheduleOnce(reason, cb, priority)` as the sanctioned replacement for one-shot rAF.
- `IdleContinuation` — 30-frame post-motion grace, then **`stop()`**: the rAF loop is cancelled. `markDirty()` / `requestFrame()` / `addTickListener()` wake it (`FrameScheduler.ts:135-137,172-174`).
- `BackgroundHeartbeat` — an unthrottled MessageChannel pulse for `document.hidden`, so deferred work still drains when the browser has paused rAF (`FrameScheduler.ts:83-93`).
- OTel per tick: `pryzm.frame.dirty_reasons`, `dirty_count`, `idle_budget_remaining`, `idle_throttled` (`:223-231`).

**This is strictly better than Pascal's loop on idle cost and strictly better on observability.** It is the clearest PRYZM win in this audit.

### 4.6 Incremental invalidation — deeper than Pascal's, and it says why it declined

`ViewDependencyTracker` (1 103 lines) maps element → level → view and marks only affected views dirty. Two debounce envelopes, chosen by *what changed*:

```ts
// ViewDependencyTracker.ts:66-70,86
export const PLAN_INCREMENTAL_SAFE_TYPES: ReadonlySet<string> =
    new Set(['wall', 'slab', 'beam', 'ceiling', 'floor']);
const DEBOUNCE_MS = 300;
const FAST_DEBOUNCE_MS = 48;   // ~3 frames — graft-eligible flush only
```

The graft path (`apps/editor/src/engine/initScene.ts:1345-1365`) projects **only the dirtied elements** and grafts their lines onto the warm cached drawing — O(dirty) instead of O(N). Three things about it are notable:

1. **Every decline names itself.** `§DIAG-GRAFT-FALLTHROUGH` (`initScene.ts:1307-1337`) is a ladder of five reasons — `no-graft-ids`, `not-a-plan-view`, `ifc-models-present`, `EDGE_PROJECTOR_NATIVE flag OFF`, `no-warm-drawing` — each printed with the specific cause. It exists because *"the full path and the declined fast path are indistinguishable, because declining was silent."* Pascal has no equivalent instrumentation anywhere.
2. **The fall-through keeps the last good drawing on screen** (`§FIX-PLAN-COMPUTE-THEN-SWAP`), and the *throw* path deliberately does not, because a partial graft is a drawing that cannot be vouched for. Two failure modes, two different choices, both argued.
3. `NativeElementMeshExporter` backs it with a proxy-descriptor LRU keyed `elementId:viewId:version:cropKey`, with **adaptive capacity** (`ceil(elementCount × 1.25)` per view, summed across views) after the L-114/L-117 thrash defect.

### 4.7 Scene-graph provenance — audited, not structural

`ProjectIsolationAudit` (`packages/core-app-model/src/persistence/ProjectIsolationAudit.ts`) is the instrument Pascal does not have. Six surfaces, including a declared-PROBE mechanism (§L-676) for state the scene sweep structurally cannot reach — Cesium, the site model store, the neighbour-footprint snapshot. The reason it exists is recorded exactly: *"a brand-new, zero-element project reported `✓ loaded clean` while Cesium was still framing the PREVIOUS project's placed building 697 km away. An audit that cannot fail on a real leak manufactures confidence."*

And it refuses to overstate:

```
// ProjectIsolationAudit.ts:48-59
// §C13-AUDIT-BLIND-CLASSES — WHAT THIS AUDIT STRUCTURALLY CANNOT SEE. The scene
// half of this audit traverses exactly ONE graph, `window.scene`. The running app
// holds at least three more … printed next to EVERY verdict, clean or violating,
// so no count of "scene roots" can be read as a count of everything on screen.
// Attribution below a scene root is by INHERITANCE and is counted, never asserted …
```

Current reading: **28 / 153 roots UNATTRIBUTED**, 849 descendants by inheritance (`ProjectIsolationAudit.derivedElementLevelArm.test.ts:12`).

⭐ **The honest comparison is this: PRYZM's number is worse than Pascal's *because PRYZM measured it*.** Pascal's equivalent number does not exist. But that is not an excuse — PRYZM's 138 non-test `scene.add(` sites across 78 files are the actual reason the number is 28 and not 0, and that is a real architectural difference, not a measurement artefact.

### 4.8 WebGPU — three rungs, a user toggle, and real recovery

`RendererHandleFactory.create(canvas, forceWebGL, preferClassicWebGL)`:
1. `WebGPURenderer` with native WebGPU → `'webgpu'`
2. `WebGPURenderer` with `forceWebGL2` → `'webgl-fallback'` (TSL transpiled to GLSL)
3. plain `THREE.WebGLRenderer` → `'webgl-only'` — **deliberately preferred for heavy generation**, because the forceWebGL2 path *"still lazily node-compiles every material's shader ('Compiling GPU shaders' — the L-382 symptom)"* (`RendererHandleFactory.ts:138-146`).

⚠ **Correcting the brief's framing:** the founder's session showing `webgl-fallback` does **not** mean PRYZM is "on WebGL while Pascal is on WebGPU". Both apps run `THREE.WebGPURenderer`; both fall back to a WebGL2 backend of the same renderer by the same mechanism. Pascal's fallback is `initializeGpuRenderer` → `createRenderer({ forceWebGL: true })` (`renderer-capability.ts:157-166`). The difference is that **PRYZM has a third rung and a user-facing toggle, and Pascal does not** — and that PRYZM *chose* to be on the fallback for heavy scenes.

Plus `SceneQualityTierManager`: 4 tiers with symmetric hysteresis, and a hard cap to `performance` at **1 200 meshes** because *"SSGI + TRAA + high shadows is unaffordable on a 1200+-mesh building"* (`:97-116`). The founder's `2892 meshes → tier=performance` line is this system working as designed.

### 4.9 Capture — the byte budget is real

`packages/core-app-model/src/preview/thumbnailBudget.ts` (139 lines):

```ts
export const THUMBNAIL_MAX_CHARS = 65_536;
export const THUMBNAIL_ENCODE_LADDER: readonly ThumbnailEncodeAttempt[] = [
    { quality: 0.72, scale: 1 },  { quality: 0.55, scale: 1 },  { quality: 0.40, scale: 1 },
    { quality: 0.55, scale: 0.7 },{ quality: 0.40, scale: 0.5 },{ quality: 0.30, scale: 0.35 },
];
```

with a test that **reads `server.js` and asserts the two literals agree**, so drift fails CI. The header records the actual bug: the server 413s over 65 536 chars, the upload leg is fire-and-forget and only `console.warn`s, and the local IndexedDB cache accepted the oversized payload happily — *"the preview looked correct for the whole session and was then permanently lost the moment the client cache was cleared."* Failure is never conflated with emptiness (`ThumbnailFitFailure` carries a `reason`).

**Direct answer to the coordinator's question 2: PRYZM's byte-budgeted retrying encoder is real and Pascal has no equivalent.** Pascal writes one WebP at fixed quality 0.9 and does not check the result's size (`snapshot-pipeline.ts:352`).

**Direct answer to question 3 (render tiers):** the "Massing tier (Cesium) / Presentation tier (WebGPU + studio env)" memory maps onto code that is **BUILT and REACHABLE, but is not a product surface**. `NeutralStudioEnvironment.ts` (179 lines) is imported and used by `PascalSceneLighting.ts:33-35,264` — it is wired. `RealEnvironmentService.ts` (553) is wired. Cesium's near-ring render tiers are live (`CesiumViewport.ts:8213-8217`, `contextBuildings.ts:356`). What does **not** exist is anything a user would call "render this view": no capture overlay, no aspect presets, no output-resolution choice, no history, no share. `ViewportThumbnailRenderer` is a Canvas-2D **linework** thumbnail for sheet viewports, not an image renderer. So: **the ingredients are reachable, the product is absent.**

---

## 5. Head-to-head

| Sub-axis | Pascal (file:line) | PRYZM (file:line) | Winner | Why, in one sentence | Evidence |
|---|---|---|---|---|---|
| **Wall miter algorithm (core)** | `core/systems/wall/wall-mitering.ts:1-536` | `geometry-wall/src/JunctionResolverV2.ts:1-32` | **EQUAL** | PRYZM's V2 is an attributed port of Pascal's file and shares its algorithm exactly. | `JunctionResolverV2.ts:10` names the source path |
| **Junction detection perf** | 2 m uniform grid + oversized fallback, self-reported 584 ms → 11 ms on 1 081 walls (`wall-mitering.ts:99-183`) | `WallJoinResolveMemo.ts` (254) + `§WJ2-JOIN-MEMO` content-addressed entry (`WallJoinResolver.ts:273`) | **DIFFERENT-BY-DESIGN** | Pascal prefilters spatially and recomputes; PRYZM memoises by content — both bound the cost, neither is incremental. | both files |
| **Adjacency query for dirty walls** | `getAdjacentWallIds` is O(dirty × N) with `allWalls.find()` inside (`wall-mitering.ts:~495`) | `WallDeltaClassifier.ts` (324) + spatial index | **PRYZM** | Pascal grid-indexed `findJunctions` and left the sibling adjacency scan naive. | grep of both |
| **Join policy richness (incumbency, type immutability, partition→shell)** | none — geometry only | `joinIntent` (`JunctionResolverV2.ts:58-77`), `systemTypeId` (`:46-56`), `§PARTITION-SHELL-INNER-FACE` (`WallJoinResolver.ts:652-861`) | **PRYZM** | Pascal cannot distinguish an incumbent L + newcomer from a fresh Y; those are the same three segments. | `JunctionResolverV2.ts:64-70` |
| **Opening cutout mechanism** | `three-bvh-csg` `Evaluator.evaluate(…, SUBTRACTION)` per opening, per rebuild (`wall-system.tsx:1176-1183`) | analytic 5-arm construction; `manifold-3d` optional, lazy, default OFF (`OpeningProfile.ts:28-34`, `WallFragmentBuilder.ts:3292`) | **PRYZM** | A boolean evaluator on the interactive rebuild path is a per-frame robustness and cost liability; PRYZM keeps it off the loop with a declared fallback. | both |
| **Opening shapes** | rectangular only (`opening-cutout-geometry.ts`) | 4 profile kinds with a declared refusal for arm D | **PRYZM** | Round windows and arched doors exist in one and not the other. | `OpeningProfile.ts:47-56` |
| **Wall layers / rake / profile** | absent (`core/schema/nodes/wall.ts:131-180` — one `thickness`) | `LayeredWallOpeningBuilder`, `WallRake.ts`, `WallProfile.ts` | **PRYZM** | Pascal's wall is a finish-decorated solid; PRYZM's is a construction assembly. | schema vs 3 files |
| **Wall interior trim + face bands** | `WallTrimConfig` (skirting/crown/chair rail with `proud`/`profile`) + 4-band face split, both **geometric** (`schema/nodes/wall.ts:34-97`) | absent as geometry; `skirtingHeight` is room-finish data (`RoomDataSchema.ts:98`); `grep "faceBand\|wainscot"` → **0** | **PASCAL** | Pascal renders skirting, crown, chair rail and wainscot bands; PRYZM stores a number. | grep, both trees |
| **Dirty-node budgeting** | 8 walls/frame + 8 ms + 80 ms trailing flush (`wall-system.tsx:479-483`) | `setBatchBudget` shared per-rAF budget tokens (`FrameScheduler.ts:279`) + per-builder budgets | **EQUAL** | Both budget; Pascal's numbers are tuned per subsystem, PRYZM's are a general mechanism. | both |
| **Self-healing convergence** | placeholder sweep every 30 frames re-marks any wall stuck on mount-time geometry (`wall-placeholder-sweep.ts`) | **no structural equivalent found** | **PASCAL** | Pascal guarantees a lost dirty mark cannot strand geometry forever; PRYZM has no such backstop. | grep for a re-mark sweep → none |
| **Invalidation granularity for 2D views** | n/a — the 2D view is a separate SVG renderer that re-renders from node data | `ViewDependencyTracker` + O(dirty) graft + NME LRU + `§DIAG-GRAFT-FALLTHROUGH` decline ladder | **PRYZM** | PRYZM invalidates per element per view and prints why when it can't. | `initScene.ts:1307-1365` |
| **Idle CPU** | 80 `useFrame` systems × 50 Hz, unconditional, forever (`frame-limiter.tsx:82-91`) | rAF **stopped** after 30 idle frames (`IdleContinuation.ts:13`; gate RC=0, 1 owner) | **PRYZM** | Pascal's `frameloop="never"` is a *manual pump*, not demand rendering; it never idles. | both, verified by gate |
| **rAF ownership** | 63 non-test call sites | 1, gate-enforced across 5 267 files | **PRYZM** | P3 is enforced at the invariant, not aspirational. | `check-raf-count.ts` RC=0 |
| **Scene-graph provenance** | one registry writer; 11 `scene.add(` total, 1 live (`scene-registry.ts:89`) | 138 non-test `scene.add(` across 78 files; 28/153 roots unattributed | **PASCAL** | R3F's declarative tree makes the leak class structurally rare; PRYZM's imperative graph makes it a live defect class. | grep both |
| **Leak *detection*** | none — 0 audit tooling | `ProjectIsolationAudit` with 6 surfaces, declared blind classes, planted-leak tests | **PRYZM** | Pascal would not know; PRYZM knows and publishes the floor. | grep vs `ProjectIsolationAudit.ts` |
| **Draw-call reduction for unique-geometry walls** | settle-based **geometry merge**, material-major, per-wall release without buffer rebuild (`wall-batch.ts:59-70`) | **none** — instancing excludes mitred/layered/raked/profiled/opening-bearing walls (`WallFragmentBuilder.ts:1394-1402`) | **PASCAL** | Pascal's mechanism works on exactly the walls PRYZM's cannot touch. | both, plus PRYZM's own doubt at `:1409-1418` |
| **Instancing for repeated geometry** | none (one `<instancedMesh>`, elevator) | `InstanceGroup`, `WallInstanceBridge`, `FurnitureInstanceBridge`, `InstancedMeshCoalescer` | **PRYZM** | For genuinely repeated geometry (furniture, curtain panels) PRYZM has the better mechanism. | grep both |
| **WebGPU init robustness** | 4 s timeout on adapter+init, orphaned-device reclamation, `featureLevel:'compatibility'` (`renderer-capability.ts:36,47-52,73`) | 3-rung chain, no timeout found on adapter acquisition | **PASCAL** (on this narrow point) | A hung adapter cannot hang Pascal; PRYZM has no equivalent guard in the factory. | both |
| **Backend strategy overall** | 2 rungs, then an error page | 3 rungs + user toggle + deliberate classic-GL target for heavy generation | **PRYZM** | PRYZM can trade the TSL node-compile tail away; Pascal cannot. | `RendererHandleFactory.ts:138-195` |
| **Device-loss recovery** | log + *"the page must be reloaded"* (`viewer/index.tsx:192-197`) | swap/reset cascade into `webgl-fallback` (`RenderPipelineManager.ts:4804`) | **PRYZM** | One recovers, one tells you to reload. | both |
| **Empty-draw guard** | `setRenderObjectFunction` filter — one degenerate mesh would flicker the whole canvas (`viewer/index.tsx:109-144`) | **absent** — 0 hits | **PASCAL** | A cheap, high-value WebGPU safety net PRYZM does not have. | grep |
| **Automatic quality scaling** | none; DPR cap + `?disable=` flags only | 4 tiers, hysteresis, 1 200-mesh hard cap (`SceneQualityTierManager.ts:97-128`) | **PRYZM** | PRYZM degrades an overloaded scene; Pascal asks the user to. | both |
| **Realtime render quality (pipeline)** | SSGI+denoise+FXAA+ink+outline+AgX+grade, 788 lines, tuned (`post-processing.tsx`) | same stack, but tier-gated OFF above 1 200 meshes | **DIFFERENT-BY-DESIGN** | Pascal always looks its best on small scenes; PRYZM chooses to stay interactive on large ones. | both |
| **Capture framing UX** | 5 aspects, 3 crop modes, thirds grid, live resolution HUD, dedicated capture RenderPipeline (`snapshot-capture-overlay.tsx`, `snapshot-pipeline.ts`) | none — `ViewportThumbnailRenderer` is Canvas-2D linework for sheets | **PASCAL** | Pascal has an in-editor capture product; PRYZM has a thumbnail utility. | both |
| **Capture encode discipline** | one WebP at q=0.9, no size check (`snapshot-pipeline.ts:352`) | 6-rung byte-budget ladder, server literal pinned by CI (`thumbnailBudget.ts:47,68-75`) | **PRYZM** | PRYZM guarantees the artefact survives the transport; Pascal does not check. | both |
| **Capture output resolution** | renders at **live canvas size**, then crops/rescales to the preset (`snapshot-pipeline.ts:256`) | 400×225 max (`initPersistence.ts:192-194`) | **PASCAL** | Both are viewport-bound, but Pascal's is 1080p-class with post-FX and PRYZM's is a card thumbnail. | both |
| **AI render generation** | **not in the MIT repo** — unreadable | absent | **NOT ESTABLISHED** | Only the product shape is observable. | coordinator's grep: 2 hits, both test fixtures |
| **Hidden-line removal** | **absent** — 0 hits for every HLR term; 2D is a symbolic redraw from node data | `HiddenLineRemoval.ts` 954 lines, one engine × 3 consumers, 6 test files, occlusion vs depth deliberately un-conflated | **PRYZM** | PRYZM resolves occlusion from solids; Pascal redraws symbols. | grep vs file |
| **Material poché / hatching** | 0 hits; the only hatch is a selection overlay | `PocheFillTable`, `HatchPatternLibrary`, `PenWeightTable`, `GraphicsRulesEngine` | **PRYZM** | Pascal's plan has no material poché at all. | grep vs 4 files |
| **Sheets / titleblock / printed scale** | 0 hits; A4 landscape fit-to-page, title = one string | `CreateSheetCommand`, `SheetStore`, `scaleDenominator`-driven paper-space tiers | **PRYZM** | Pascal has no paper space; PRYZM has a sheet layer. | grep vs files |
| **Automatic dimensioning** | 9 tiers, datum policies, occlusion-aware, **1 613 lines** (`construction-dimensions.ts`) | LOD-tiered by scale, **4 830 lines** (`packages/auto-dimension`) | **PRYZM** (narrowly) | Both are real drafting engines; PRYZM's is scale-aware and larger, Pascal's tier collapse and datum policy set are excellent. | both |
| **CAD interchange (DXF/DWG/IFC-out)** | none (IFC **in** only) | DXF + PDF + IFC out, IFC in | **PRYZM** | Pascal's only vector output is an A4 PDF. | `packages/file-format/src/export/**` |
| **Collaboration** | **absent** — 0 hits for yjs/crdt/socket.io/liveblocks/partykit/automerge; SSE polling + `If-Match` 409 → "refresh?" | Yjs CRDT + conflict-surfacing gate at hard-0 | **PRYZM** | Two simultaneous Pascal editors means one reloads and loses work. | Explore sweep, both |
| **Open-path scalability** | one `graph_json` blob, **10 MB cap**, 5 O(n) migration passes, every node dirtied, 8 walls/frame | chunked `.glb` geometry + server-authoritative state | **PRYZM** | Pascal's storage model has a hard ceiling PRYZM does not. | `sqlite-scene-store.ts:27,633` vs `ChunkReader.ts` |
| **Undo cost model** | full snapshot + recursive deep-equality **per tracked write**, `limit:50` (`use-scene.ts:1582-1593`) | three-store `performUndoRedo` | **PRYZM** | Pascal pays O(n) twice on every edit; that is why it needs live-override stores to dodge the scene store during drags. | `history-control.ts:90-123` |
| **Declarative vs imperative scene** | R3F reconciler owns the tree | imperative THREE with an 8-layer boundary gate | **DIFFERENT-BY-DESIGN** | R3F buys provenance and loses direct control of allocation and update order; PRYZM bought the opposite trade deliberately, and P2/P3 are how it pays for it. | both |

---

## 6. What PRYZM should adopt

Ranked by value-over-cost. ⛔ Every row is written to be executable by a lane that has not read this audit.

| # | Change | Files to touch | Effort | Value | Risk | Blast radius | Contract/ADR impact | Prerequisite |
|---|---|---|---|---|---|---|---|---|
| **1** | ⭐ **Settle-based geometry MERGE batcher for walls (and slabs), modelled on Pascal `wall-batch.ts`.** Concatenate finished per-wall geometries into one material-major buffer per (level × material) after a quiet window; record each wall's slice so one wall can be released by rewriting group ranges, never by rebuilding buffers; keep every wall's own mesh in the graph, invisible, for picking/measure/highlight. This is the **only** mechanism that helps the mitred/layered/raked/profiled/opening-bearing wall — i.e. the majority of a real building, which PRYZM's own instancing router says it cannot touch. | NEW `packages/scene-committer/src/GeometryMergeBatcher.ts`; wire from `packages/geometry-wall/src/WallFragmentBuilder.ts` (post-build hook) and `apps/editor/src/engine/initScene.ts`; must NOT touch `packages/geometry-wall/src/WallInstanceBridge.ts` | **L** | **Very high** — directly addresses the 367-wall / 32.7 s freeze at 2 069 meshes that `WallFragmentBuilder.ts:1409-1418` names as unexplained | Medium — picking, section-box clipping and per-element visibility must keep working | Wide (rendering + picking + visibility) | C04 §3.5 (LOD/draw-call), ADR-046 (extend, don't replace, `InstancedMeshCoalescer`); likely a new ADR | **First measure**: run the founder's 367-wall gesture and read `window.__instancedElementRenderer` + the `PERF_KEYS.WALL_INSTANCED` vs per-clause reject counters already in `WallFragmentBuilder.ts:1420-1440`. If mitre is not the dominant reject clause, this row is wrong and must be re-ranked. |
| **2** | **Empty-draw guard.** Install a `renderer.setRenderObjectFunction` wrapper that skips any draw whose geometry has a zero-count `position` attribute. Pascal's note is the whole justification: one degenerate mesh *"would poison the WebGPU command encoder"* and flickers the **entire canvas**, not just itself. PRYZM already mints degenerate/NaN-hidden geometry deliberately (`WallFragmentBuilder.ts:1160,1183,1205-1225`), so it has exactly the inputs this guard exists for. | `packages/renderer-three/src/pipeline/RenderPipelineManager.ts` (single install point, P2-safe — this package already owns THREE) | **S** | **High** — cheap, and it converts a whole-canvas flicker into one skipped draw + one warn | Low — must save/restore the function around any pass that installs its own (Pascal records that its outline node does exactly this) | Narrow (renderer only) | C04 §1.4; no new contract | Confirm PRYZM's post-FX passes do not already override `setRenderObjectFunction` — `grep -rn "setRenderObjectFunction"` currently returns **0**, so the slot is free. |
| **3** | ⭐ **Self-healing "unbuilt geometry" sweep**, modelled on `wall-placeholder-sweep.ts`. Every N frames, scan registered elements whose mesh still carries mount-time/placeholder geometry **and** carries no pending rebuild, and re-mark them. Pascal's docstring names the exact incident class — a dirty mark consumed by a late-mounting system strands geometry **forever**, and no amount of correct rebuild logic recovers it. PRYZM's `§DIAG-GRAFT-FALLTHROUGH` proves PRYZM has the same "why did the fast path not run" class; this is its geometry-side twin. | NEW `packages/scene-committer/src/UnbuiltGeometrySweep.ts`; register as a low-priority `addTickListener` on `getFrameScheduler()`; read the element registry, not `window.scene` | **M** | **High** — turns an unrecoverable stuck state into an eventually-consistent one | Low — idempotent by construction; must be rate-limited (Pascal uses every 30 frames) | Medium | C04; ADR for the convergence guarantee | Needs a single canonical "this element's geometry has never been built" predicate. Define it as a `userData` stamp at build time, not a vertex-count heuristic (Pascal keeps the vertex count only as a legacy fallback). |
| **4** | **Adapter/device-request timeout + orphaned-device reclamation.** Wrap `WebGPURendererAdapter.create()`'s adapter/device acquisition in a `Promise.race` with a ~4 s timeout, and `device.destroy()` any device that arrives after the race is lost — Pascal: *"Any device we request and then abandon has to be released here or it counts against the browser's concurrent-device limit for the rest of the page's life."* Also consider `featureLevel: 'compatibility'` on `requestAdapter`. | `packages/renderer-three/src/adapters/WebGPURendererAdapter.ts`; `packages/renderer-three/src/RendererHandleFactory.ts` | **S** | **Medium-high** — removes a class of indefinite boot hang, and a real device leak across the 3-rung fallback chain (PRYZM walks that chain more than Pascal does, so it leaks more) | Low | Narrow (boot) | C04 §1.4 | None. Model on `packages/viewer/src/lib/renderer-capability.ts:36,47-52,63-70` in the Pascal tree. |
| **5** | ⭐ **A "Render this view" product surface** — the *shape*, not the model. Capture overlay with aspect presets + viewport/area crop, an explicit output size, and a dedicated offscreen `RenderTarget` at that size (⛔ **do better than Pascal here: render at the requested resolution, do not upscale a viewport buffer** — `snapshot-pipeline.ts:256` reads `renderer.domElement` and is Pascal's weakest link). Keep PRYZM's byte-budget ladder for the *thumbnail* path; use a separate, un-budgeted path for a user-requested export. Ship capture + history + share first; leave generation as a later, separately-decided question. | NEW `apps/editor/src/ui/capture/**`; `packages/renderer-three/src/pipeline/RenderPipelineManager.ts` (offscreen RT render); reuse `packages/core-app-model/src/rendering/{NeutralStudioEnvironment,RealEnvironmentService}.ts` (already wired via `PascalSceneLighting.ts:264`); ⚠ **coordinate with the live lane in `apps/editor/src/ui/element-preview/**`** | **L** | **High (product)** — PRYZM has the ingredients wired and no surface; this is the largest gap between capability and user-visible value in this audit | Medium — a supersampled offscreen render at 4K on a heavy scene needs its own tier decision (reuse `SceneQualityTierManager`, pinned UP for capture) | Medium (UI + renderer) | New contract section (C107); touches C04 §3.5 | Decide the tier policy for capture: a capture should render at `cinematic` regardless of the live tier, which means `SceneQualityTierManager.pin()` (`:527`, `§RENDER-QUALITY-USER-PIN`) already exists to do it. |
| **6** | **Live-override store for drag paths, generalised.** Pascal publishes `{start, end, curveOffset}` to `useLiveNodeOverrides` during a drag and merges it in `getEffectiveWall`, so the 3D mesh follows the cursor with **zero store writes**. PRYZM should audit whether its drag paths write through the command bus per pointermove; if they do, this is the pattern. | `packages/geometry-wall/src/WallTool.ts`, `WallMoveReweldService.ts`; a new `packages/stores/src/LiveOverrideStore.ts` | **M** | **Medium** — depends entirely on what the audit finds; ⛔ **do not implement before measuring** | Medium — a second source of truth for element state is exactly the kind of thing P6 exists to prevent; it must be transient-only and never persist | Medium | P6 (commands are the only mutation path) — this needs an explicit, contract-level carve-out for *transient, non-persisted, render-only* overrides, or it is a P6 violation | **Measure first**: count store writes per pointermove during a wall drag. If already coalesced, drop this row. |
| **7** | **Wall interior trim + face bands as geometry** (skirting, crown, chair rail, wainscot). Pascal models these with `height`/`proud`/`profile` per side and splits the wall geometry at band planes for per-band materials. PRYZM stores `skirtingHeight` as room-finish data and renders nothing. For residential/interior work this is a visible quality gap. | `packages/geometry-wall/src/WallProfileVariants.ts`, `WallSideFinishResolver.ts`, `WallDataSchema.ts`; `packages/room-topology/src/RoomDataSchema.ts` (already holds the number) | **M** | **Medium** — pure visual quality; high value for interior/residential typologies | Low-medium — adds geometry per wall, so it must respect row 1's batcher and the layer-mesh cap (`LayeredWallOpeningBuilder.ts:37`, `MAX_WALL_LAYER_SEGMENTS = 4`) | Narrow (wall family) | **C84 + C86 are MANDATORY** — this adds a user-visible attribute to an element family; C67/C68 apply | Row 1 first, or this multiplies draw calls. |
| **8** | **Make the adjacency query for dirty walls spatial.** Pascal grid-indexed `findJunctions` and left `getAdjacentWallIds` at O(dirty × N) with a linear `find()` inside the loop — a real remaining hot spot in *their* tree. PRYZM should verify its own equivalent (`WallDeltaClassifier` + `WallJoinResolveMemo`) is not the same shape, using the same 2 m-cell prefilter. | `packages/geometry-wall/src/WallDeltaClassifier.ts`, `WallJunctionClustering.ts` | **S** | **Medium** — only if the measurement says so | Low | Narrow | none | Profile a 1 000-wall level's wall-move first. This is a "check, then maybe fix" row. |
| **9** | **Publish the instanced-vs-standard ratio as a first-class perf counter surfaced in the UI**, not only via `window.__instancedElementRenderer`. `WallFragmentBuilder.ts:1420-1440` already bumps a per-clause reject counter; it just needs a readout. Without it, row 1's prerequisite cannot be satisfied by anyone but the founder. | `packages/frame-scheduler/src/PerfCounters.ts`; `apps/editor/src/ui/overlays/**` | **S** | **Medium** — unlocks row 1 and closes the "guess until it is counted" note the code itself leaves open | Low | Narrow | ADR-0292 (name your decline) | None. Do this **first**; it is the cheapest row and it is the prerequisite for the most expensive one. |
| **10** | **Adopt Pascal's `?disable=` diagnostic flag pattern for post-FX A/B.** `?disable=ao,denoise,outline,postFx,draw` each prevents *allocation* as well as per-frame work, so temperature/frame-time deltas across combos isolate the culprit pass. PRYZM's tier system decides *for* the user; this lets an engineer bisect. Note the second-order finding embedded in Pascal's version: `?disable=draw` must switch rAF to `setInterval`, because Chromium throttles rAF to 1 Hz on a page with no damage. | `packages/renderer-three/src/pipeline/RenderPipelineManager.ts` | **S** | **Low-medium** — diagnostic leverage, not user value | Low | Narrow | none | ⚠ P3: the `setInterval` variant must live **inside** `packages/frame-scheduler/` or the rAF gate breaks. Pascal's version puts it in the component; PRYZM's cannot. |

⚠ **Two invariants every row above must respect, called out because they are the easiest to break here:**
- **P2 — single THREE owner.** Rows 1, 2, 4, 5, 10 all touch rendering. `import * as THREE` is legal **only** in `packages/renderer-three/`; everywhere else goes through `@pryzm/renderer-three/three`. Gate: `tools/ga-gate/check-three-imports.ts`.
- **P3 — single rAF.** Rows 3, 5, 10 all want to schedule work. There is exactly **one** `requestAnimationFrame` call site and it is `packages/frame-scheduler/src/RafAdapter.ts`. Use `addTickListener` / `scheduleOnce`. Gate: `tools/ga-gate/check-raf-count.ts` (currently RC=0, 1 owner — do not be the change that makes it 2).

---

## 7. What PRYZM does BETTER — and must keep deliberately

Each with the measurement, not the impression.

**7.1 — Hidden-line removal is a category Pascal does not have.**
`packages/core-app-model/src/drawing/HiddenLineRemoval.ts` is 954 lines, one occlusion engine serving plan, section and elevation, with six dedicated test files (`elevationOcclusion`, `facadeSilhouette`, `familyCensus`, `hostReachesTheDrawing`, `planPoche`, `trueProjection`). Its central design decision is one Pascal never had to make and would not survive without: **occlusion and distance are different questions and must not share a layer.**

> *"v2 conflated those two questions … a wall that was merely FAR drew exactly like a wall that was BEHIND something."* — `HiddenLineRemoval.ts:17-22`

Pascal's measured position: `hiddenLine`, `hidden-line`, `HLR`, `occlusionCull`, `projectToPlane`, `project3DTo2D`, `worldToPlan` → **0 hits each**. Its 2D view is an **independent SVG renderer reading node data** (`floorplan-registry-layer.tsx:127-148`; the geometry contract at `packages/core/src/registry/types.ts:1139` returns *"plain FloorplanGeometry data (SVG-renderable) rather than three.js"*). Its only occlusion resolution is 2D-in-2D: clipping roof linework against footprint polygons (`nodes/roof/floorplan.ts:90`) and suppressing dimension strings on hidden facades (`nodes/wall/construction-dimensions.ts:852`).

⚠ **State the trade honestly:** a symbolic redraw is *faster and more legible* than a projection, which is why Pascal's plan looks clean, and Pascal even exaggerates plan wall thickness by 1.18× for legibility (`nodes/wall/floorplan.ts:29-32`). But it cannot draw what is behind something, cannot section an arbitrary plane through real solids, and cannot ever be Revit. PRYZM's engine can.

**7.2 — Drafting output is a different product tier.**
PRYZM: `PocheFillTable.ts` (219), `HatchPatternLibrary.ts` (227), `PenWeightTable.ts` (415), `GraphicsRulesEngine.ts` (415), `SymbolicRuleRenderer.ts` (337), `DrawingZone.ts` (294), `DetailLevelResolver.ts` (168) — 6 983 lines in `drawing/` alone. Plus **sheets** (`CreateSheetCommand`, `AddViewportToSheetCommand`, `SheetStore`, `SheetIndexService`), **printed scale** (`scaleDenominator` converts paper-space dimension tiers to world metres — `packages/auto-dimension/src/tiers.ts:95-101`), and **DXF + PDF + IFC** export (`packages/file-format/src/export/**`, 9 625 lines).

Pascal: `poche`/`material hatch` → 0 hits; `kind:'hatch'` exists in 3 files and **all three are gated on `isSelected`**; `titleblock`/`paper space`/`sheetNumber`/`1:50`/`1:100`/`scaleBar`/`northArrow` → 0 relevant hits; DXF/DWG → 0 hits. Output is an **A4 landscape PDF, fit-to-page, one page per level, title = one concatenated string** (`floorplan-export.tsx:79-80,206,314-322`). Its `print-*.ts` files are **3D printing** (STL/3MF via `manifold-3d@3.5.1`), not documentation.

⚠ **Where Pascal is genuinely strong here and PRYZM should not be smug:** `construction-dimensions.ts` (1 613 lines) is a real drafting engine — 9 tiers that **collapse when empty so no gaps appear**, four datum policies (`centerline`/`wall-face`/`structural-face`/`finish-face`), `intersectionReferencePolicy: 'single' | 'both-faces'`, architectural ticks, extension-line gap **and** overshoot, facade-occlusion suppression, and door/window/room **schedules** with duplicate-mark validation. That is more drafting-standard fidelity per line than most viewers have, and the tier-collapse behaviour in particular is worth copying.

**7.3 — The render loop idles at zero.**
Gate-verified today: `npx tsx tools/ga-gate/check-raf-count.ts` → RC=0, **1 owner across 5 267 files**. `IdleContinuation` stops the loop after 30 quiet frames; `markDirty` wakes it. Pascal runs 80 `useFrame` systems at 50 Hz forever. ⭐ **This is the clearest structural win in the audit and it must not be traded away** — rows 1, 3, 5 and 10 of §6 all want to schedule work, and every one of them must go through `addTickListener`/`scheduleOnce`.

**7.4 — PRYZM knows what it cannot see.**
`ProjectIsolationAudit` publishes `SCENE_GRAPHS_NOT_TRAVERSED` **next to every verdict, clean or violating** (`ProjectIsolationAudit.ts:48-56`), and reports the unattributed floor rather than a clean bill. Pascal has **zero** such tooling. The 28/153 number is bad; the fact that it exists at all is the thing to keep. ⛔ Do not "fix" it by narrowing what the audit looks at.

**7.5 — Every decline names itself.**
`§DIAG-GRAFT-FALLTHROUGH` prints one of five specific reasons the O(dirty) path was not taken (`initScene.ts:1307-1337`); `§PRYZM-PERF` counts per failing instancing clause and explicitly warns *"Read each clause against `notInstanced`, never against the other clauses"* (`WallFragmentBuilder.ts:1420-1440`); `check-cast-count`, `check-otel-spans`, `check-layer-boundaries` all publish their own denominators. Pascal's comments are excellent prose but its runtime is silent about why a fast path did not fire. **Keep this. It is the reason this audit could measure PRYZM's weaknesses precisely and could only infer Pascal's.**

**7.6 — Robustness under real failure.**
Device loss recovers (PRYZM) vs *"the page must be reloaded"* (Pascal, `viewer/index.tsx:196`). Quality de-scales automatically at 1 200 meshes (PRYZM) vs a fixed pipeline (Pascal). The thumbnail encode ladder guarantees the artefact survives its transport, with the server's 65 536-char literal **pinned by a CI test that reads `server.js`** (`thumbnailBudget.ts:43-47`) vs one un-checked WebP.

**7.7 — Collaboration exists.**
Yjs CRDT with a hard-0 conflict-surfacing gate driving 126 real merges with 0 silent losses. Pascal: `y-websocket`, `crdt`, `socket.io`, `multiplayer`, `liveblocks`, `partykit`, `automerge` → **0 hits each**; what exists is SSE polling SQLite every 250 ms, replacing the **whole graph**, with `If-Match` → HTTP 409 → *"Another session saved first — refresh?"*. Two simultaneous Pascal editors means one of them loses work.

**7.8 — The data model is a BIM model.**
Pascal's wall is a single-thickness solid with face treatments. PRYZM's is a construction assembly with layers, rake, profile, arc, and non-rectangular openings, backed by 18 `geometry-*` packages and a per-element contract block (C84 + C85–C99). Pascal's storage is a single `graph_json` blob with a **10 MB hard cap** (`sqlite-scene-store.ts:27`).

---

## 8. Not established

Each of these is a *measurement I did not take*, not a guess I declined to write down.

1. **PRYZM's live instanced-wall ratio.** `WallFragmentBuilder.ts:1409-1418` states the hypothesis (mitred corners disqualify most of a generated building) and calls it *"a guess until it is counted"*. The counters exist (`PERF_KEYS.WALL_INSTANCED` + per-clause rejects, `window.__instancedElementRenderer`); I did not run the app. **§6 row 1 is ranked #1 on the strength of the code's own reasoning, and its prerequisite is exactly this measurement.** If the count says mitre is not the dominant reject clause, row 1 must be re-ranked.

2. **Pascal's actual frame time on a real model.** All Pascal timing figures quoted here (584 ms → 11 ms; "~3× t-junction drags") are **self-reported in Pascal's own comments**. I did not verify them. They are consistent with the code and with the constants, which is the most I can honestly say.

3. **Pascal's Studio AI-render generation.** Not in the MIT repo (coordinator's measurement: `grep -rn "nano.banana|banana|credits|generateRender|/api/render"` → 2 hits, both test fixtures). I describe the observable product shape and the readable capture half only. ⛔ Nothing in §3.9 or §6 row 5 infers how generation works.

4. **Whether PRYZM's drag paths already coalesce store writes.** §6 row 6 is conditional on this and says so. I read `WallMoveReweldService.ts`'s header but did not trace a pointermove to a store write.

5. **The founder's "project opens take minutes."** I established Pascal's open cost *structurally* (§3.10) and PRYZM's open *architecture* (chunked `.glb`, expectation-set publication), but I did not profile a PRYZM open. The known contributors are documented in `ISSUE-LOG` (L-114/L-117 NME cache thrash on multi-view elevations, since fixed by `§FIX-LAZY-INACTIVE-VIEW-PROJECTION`), but **which** phase dominates today is unmeasured by me. Lane assignments for the open path belong to whichever lane profiled it; I did not.

6. **Visual quality comparison at equal backend.** The founder's screenshots show Pascal on native WebGPU and PRYZM on `webgl-fallback` at `tier=performance` (SSGI off, TRAA off). ⚠ Those are **not the same pipeline**, and I explicitly refuse to score image quality across them. What I can say is structural: both run `THREE.WebGPURenderer`; both have the same TSL post-FX vocabulary available; PRYZM *chose* to turn SSGI/TRAA off above 1 200 meshes and Pascal has no such switch. A like-for-like comparison requires PRYZM pinned to `cinematic` on native WebGPU with a scene under the cap — one command (`SceneQualityTierManager.pin()`, `:527`) and worth running.

7. **Whether R3F's declarative tree actually prevents scene leaks in Pascal, or merely makes them undetectable.** I established that `useRegistry` is the sole registry writer and that `scene.add(` appears once in live code. I did **not** establish that no drei/postprocessing/helper object escapes lifecycle — and Pascal has **no instrument** that could tell either of us. The correct verdict is the narrow one I gave in §5: R3F makes the leak class structurally rare *for registered nodes*, and Pascal would not know if it happened.

8. **Pascal's `pointerTransparency` / cutaway / hidden-wall interaction quality.** Read enough to know it exists (`nodes/wall/pointer-transparency.ts`, 198 lines; `core/events/hidden-wall-pointer-hold.ts`) and to know it is a real feature with tests; not audited against PRYZM's section box. Out of my axis; flagging it for whichever lane owns interaction.

---

*End of AUDIT-C. All measurements dated 2026-08-23 and reproducible from the commands inline. Pascal tree read-only at `45a8cce`; PRYZM tree read-only on `main` with four sibling lanes in flight.*
