# Application Performance Ledger — measured, end to end

> **Status**: LIVING · **Owner**: performance · **Opened**: 2026-08-21 (lane AUD-3) ·
> **Companion**: [ADR-0338](../02-decisions/adrs/ADR-0338-interaction-cost-is-proportional-to-the-answer.md)
> (`§NAV-PICK-QUADRATIC`, the interaction clock) and [ADR-0302](../02-decisions/adrs/) (`§EDIT-COST-IS-PROPORTIONAL`, the edit clock).
> **Issue rows**: ISSUE-LOG `L-2500 … L-2599`.
>
> **Governance.** This is a measured ledger, not a `*-AUDIT.md` contract-derivative. It redefines no
> contract. Where it touches rendering it defers to **C04**; where it touches element creation, **C11**
> and **C16**.

---

## §0 — The one rule this document is written under

⛔ **A performance claim without a number is not a finding.** Every row below is either

- **MEASURED** — with the number, and the exact command or probe that produced it, or
- **UNMEASURED** — said so, plainly, and left unranked.

Where a thing cannot be measured headlessly, the row carries **the exact browser console command the
founder should run** and **what each outcome would prove**. A row with neither is a bug in this
document.

**Scope note.** Lane PERF1 (ISSUE-LOG `L-2150 … L-2152`, commit `46b14397`, ADR-0338) owns the frame
loop and the pick path. This ledger starts from its findings and covers **the rest of the
application**. Where it re-ranks PERF1's backlog it says so; where it **corrects** PERF1's brief it
says that too, with the measurement that forced the correction.

---

## §1 — ⭐ THE HEADLINE: the scene is drawn **six times per frame**, and two of those six draw the whole model in order to outline **nothing**

### §1.1 — Verdict on the OutlineNode hypothesis: **CONFIRMED**, and it is worse than "when nothing is selected"

PERF1 named this as its #1 unresolved suspect, verified in the `three@0.183.2` source but **not
verified in the pipeline**. It is now verified — by driving the real `OutlineNode` class from the
real vendored `three` build with a stub renderer that counts what a real renderer would submit.

**Probe** (throwaway, scratchpad only — nothing was written into the repo):

```
node outline-probe2.mjs      # imports the vendored
                             # three/examples/jsm/tsl/display/OutlineNode.js directly,
                             # builds an N-mesh THREE.Scene, and calls updateBefore()
                             # 60× with selectedObjects = []
```

**MEASURED — one `OutlineNode`, empty selection, per `updateBefore()` call:**

| scene meshes | full-scene `renderer.render()` | `renderObject()` submissions | fullscreen-quad renders | render-target switches |
|---|---|---|---|---|
| 500 | 2 | 500 | 7 | 10 |
| 1 000 | 2 | 1 000 | 7 | 10 |
| 2 000 | 2 | 2 000 | 7 | 10 |
| **3 898** (the founder's `sceneMeshes`) | **2** | **3 898** | **7** | **10** |
| 8 000 | 2 | 8 000 | 7 | 10 |

`updateBefore` returned `undefined` — **no bail signal** — at every N.
`updateBeforeType` reads `'frame'`, i.e. `NodeUpdateType.FRAME`.

**PRYZM wires TWO of these nodes** — `packages/renderer-three/src/pipeline/OutlinePass.ts:112`
(selected) and `:137` (hover) — so **double every row above**.

### §1.2 — ⭐ TWO CORRECTIONS to the brief that sent this lane

Reported as instructed: only what was observed.

**(a) It is 2×N extra draw calls, not 4×N.** The brief said *"4 extra full-scene render passes per
frame"* and read that as ~4×3898 submissions. Four full-scene **graph walks** is right. But
`OutlineNode.updateBefore` runs two passes with **opposite predicates**
(`node_modules/.pnpm/three@0.183.2/node_modules/three/examples/jsm/tsl/display/OutlineNode.js:466-494`):

- pass 1 (depth buffer) submits every object **not** in the selection cache → with an empty
  selection that is **all 3 898**;
- pass 2 (mask buffer) submits every object **in** the selection cache → with an empty selection that
  is **0**.

So per node: 2 graph walks, **1 walk's worth of submissions**. Two nodes ⇒ **4 full scene-graph walks
and 7 796 wasted object submissions per frame**, plus 14 fullscreen-quad passes and 20
render-target switches. The waste is real and large; the multiplier is 2, not 4.

**(b) `7591 ≈ 2 × 3898` is numerology, and the reason is a mislabelled instrument.** See §2 — on a
WebGPU session the number PRYZM prints as `drawCalls` is not a draw-call count at all, so it cannot
corroborate anything. **The hypothesis is confirmed on its own probe, not on that arithmetic.**

### §1.3 — The outline pass is on **from boot**, and nothing turns it off

`apps/editor/src/engine/initScene.ts:3377-3379`:

```
if (renderPipelineManager.status.webGpuActive) {
    await renderPipelineManager.activateOutlines();
```

Unconditional on every real-WebGPU session (and again at `:309` on the legacy bind path). There is no
`deactivateOutlines()` on any idle/empty-selection path. **So the cost above is paid from the first
frame after boot, for the whole session, selection or no selection.**

Scope: **WebGPU only.** `RenderPipelineManager.isRealWebGPUBackend()`
(`packages/renderer-three/src/pipeline/RenderPipelineManager.ts:632-643`) gates the whole TSL
pipeline on `renderer.backend.isWebGPUBackend === true`, so `webgl-classic` and the forced-WebGL
path do not pay this.

### §1.4 — The full per-frame pass census (phase 4, nothing selected)

From `_buildPipeline()` (`RenderPipelineManager.ts:3466-3532`) and `_buildPhase3Pipeline`:

| pass | full scene-graph walks | objects submitted @ 3 898 meshes | needed? |
|---|---|---|---|
| `createScenePass(scene, camera)` — `pass()` | 1 | ~3 898 | ✅ this is the picture |
| `createZonePass(scene, camera)` — `pass()` + `setLayers(ZONE_LAYER)` | 1 | only zone-layer objects | ✅ (walks all, submits few) |
| selected outline — depth pass | 1 | **3 898** | ❌ **pure waste when idle** |
| selected outline — mask pass | 1 | 0 | ❌ walk only |
| hover outline — depth pass | 1 | **3 898** | ❌ **pure waste when idle** |
| hover outline — mask pass | 1 | 0 | ❌ walk only |
| **+ 14 fullscreen quad passes** (7 per outline node: downsample, edge-detect, 4 blurs, composite) | — | 14 | ❌ when idle |
| **TOTAL** | **6** | **~11 694** | **7 796 of them (67 %) are outlines around an empty selection** |

⭐ **Two-thirds of everything this application submits to the GPU on an idle WebGPU frame exists to
draw a violet edge around nothing.** That is the founder's *"not flowing, it gets stuck sometimes."*

### §1.5 — The fix, and why it is safe (no 15 s recompile)

PERF1 deliberately did not touch this because the obvious fix risks the documented ~15 s
all-material recompile (`7dbc0685`, the `localClippingEnabled` incident). **That risk does not apply
to the fix below**, and the reason is mechanical:

`three`'s node dispatcher already has a bail contract — `NodeFrame.updateBeforeNode`, in
`three.webgpu.js`:

```
if ( node.updateBefore( this ) === false ) {
    nodeUpdateBeforeMap.frameId = previousFrameId;     // "I did not update" — roll back
}
```

**Returning `false` is a supported, first-class skip.** It touches no material, no shader, no
pipeline layout, and no render-target allocation — it is a JS property read on the node instance.
Nothing recompiles.

**MEASURED — the same probe, with a bail that renders one final clearing pass and then stops:**

| scene meshes | mode | full renders | submissions | quad renders | RT switches |
|---|---|---|---|---|---|
| 3 898 | **shipped (no bail)** | 2 | 3 898 | 7 | 10 |
| 3 898 | **bail (proposed)** | **0** | **0** | **0** | **0** |

Same at every N from 500 to 8 000. The saving is the entire row.

The bail must be **one frame late**, not immediate — the composite reads the outline render target
every frame, so bailing on the very frame the selection empties would leave the *previous* outline
frozen in the buffer as a ghost. Render one final (now-empty) pass, then bail:

```ts
const empty = this.selectedObjects.length === 0;
if (empty && lastWasEmpty) return false;   // second consecutive empty frame onward: skip
lastWasEmpty = empty;
return originalUpdateBefore.call(this, frame);
```

⚠ **NOT MEASURED:** the GPU-side saving. The probe counts CPU-side submissions with a stub renderer;
it does not model render-list construction, frustum culling, pipeline binding, or actual GPU work.
**7 796 submissions is the load-bearing number; the millisecond figure the probe prints is a lower
bound on the CPU half only and is deliberately not quoted here as a frame-time saving.** The founder's
A/B in §7.1 is what turns it into a millisecond number.

### §1.6 — ⭐ A second defect found on the way: the view-switch outline guard is a **no-op**

`RenderPipelineManager.ts:1279-1310`, in the per-frame render path:

```
// Do NOT render outlines while a view switch is in progress.
// … Temporarily masking _outlinesActive via the flag avoids this.
const outlinesWereActive = this._outlinesActive;
if (this._viewSwitchInProgress) { this._outlinesActive = false; }
…
rp.render();
…
if (this._viewSwitchInProgress) { this._outlinesActive = outlinesWereActive; }
```

**MEASURED — every read of `_outlinesActive` in the file:**

```
grep -n "_outlinesActive" packages/renderer-three/src/pipeline/RenderPipelineManager.ts
```
→ 15 hits. The three that *consume* the flag are at `:3505`, `:3649`, `:4927`, and all three are
inside **pipeline BUILD** methods — `_buildPipeline()` (`:3466`), the phase-3 composite (`:3629`),
and `_rebuildPipelineGraphOnly()` (`:4863`). They decide whether the outline nodes are **composited
into the output node graph**: a one-time build decision.

**Nothing reads `_outlinesActive` during `rp.render()`.** `OutlineNode` has never heard of it. Setting
a private boolean and restoring it around a render call cannot suppress a node that is already in the
compiled graph. **The guard suppresses nothing, and its own comment asserts that it works** — three
lines below a large corrected comment in the same method warning about exactly this class of defect
(the declared-but-never-called axis, C84 §3.5.1 (d), and the L-809/L-812 shape).

The correct suppression is the same bail as §1.5, keyed on `_viewSwitchInProgress` as well as on an
empty selection.

---

## §2 — ⭐ The instrument is mislabelled: on WebGPU, PRYZM's `drawCalls` is not a draw-call count

This is the reason §1.2(b) had to correct the brief's arithmetic, and it invalidates a number that
has been quoted in an ADR.

**MEASURED, from the vendored `three@0.183.2` source:**

| field | file:line | meaning | reset per frame? |
|---|---|---|---|
| `info.render.calls` | `three.webgpu.js:58179` (`this.info.render.calls++`) | *"The number of render calls **since the app has been started**"* (the class's own JSDoc, `:30900`) | **NO** — `Info.reset()` at `:30988-30998` zeroes `drawCalls`, `frameCalls`, `triangles`, `points`, `lines`. It does **not** zero `calls`. Only `Info.dispose()` does. |
| `info.render.frameCalls` | `three.webgpu.js:58180` | render calls **this frame** | yes |
| `info.render.drawCalls` | `three.webgpu.js:30959` (`Info.update()`) | **draw calls this frame** — the real one | yes |

**PRYZM reads the wrong one, in both places:**

- `apps/editor/src/engine/initScene.ts:3695-3696` — `?.info?.render?.calls ?? -1`, logged as
  `§PERF-L02-DRAWCALLS drawCalls=…`
- `apps/editor/src/engine/pryzmPerfConsole.ts:138` — `drawCalls: info.render?.calls ?? 0`, printed at
  `:724` as `draw calls … ← LAST RENDERED FRAME`

So on a WebGPU session, **`drawCalls=7591` means 7 591 `renderer.render()` invocations since page
load** — and given §1.4's six-passes-plus-fourteen-quads, that is roughly 380 frames' worth, which is
about 6 s at 60 Hz or a good deal longer at the rate the founder is actually seeing. The label
`← LAST RENDERED FRAME` is false for that row.

On `webgl-classic` (a genuine `THREE.WebGLRenderer`) the same field *does* mean per-frame draw calls
(`three.module.js:17483`, `if (this.info.autoReset === true) this.info.reset()` inside `render()`),
so **the same line means two different things on two backends** and nothing labels which.

⚠ **This does not weaken PERF1's conclusion.** "The scene is draw-call bound, not geometry-bound" is
still right — §1.4 puts ~11 694 submissions on an idle frame against 470 720 triangles. It means the
specific number **7591** should stop being quoted, and ADR-0338 §1's *"7589 draw calls"* row should be
re-measured with `info.render.drawCalls`.

The one-line command that settles it live is in §7.1.

---

## §3 — Algorithmic complexity sweep

### §3.1 — Method

A static scanner over `apps/editor/src`, `packages/**/src`, `plugins/**/src` and `src` (tests, `dist`,
`node_modules` excluded) flagged every loop header naming an element-like collection whose body
contains a `.find` / `.filter` / `.some` / `.every` / `.includes` / `.indexOf` over another
element-like collection, within the loop's own brace depth.

**MEASURED: 123 candidate nested-scan sites across 77 files.**

The count alone is not a finding. **Call frequency is the finding**, and each candidate below was
then traced to its clock by hand.

### §3.2 — ⭐ The per-frame clock is CLEAN, and saying so is a result

```
grep -n "\.traverse(\|traverseVisible(" packages/core-app-model/src/rendering/UnifiedFrameLoop.ts
grep -n "\.traverse(\|traverseVisible(" packages/core-app-model/src/rendering/RenderPerformanceService.ts
```
→ **zero hits in both.** The frame loop itself performs no scene traversal.

The seven traversals in `RenderPipelineManager` were traced to their enclosing methods —
`scheduleShadowRebuild` (`:1796`), `_applyShadowFreezeState` (`:2062`), `auditShadowCasters` (`:2238`),
`_neutralizeTransmissionForWebGPU` (`:2419`), `logShadowDiagnostics` (`:2552` ×2),
`_recreateLightOwnedShadowMaps` (`:4412`) — **all event-driven, none per-frame.**

**Repo-wide census — and a worked example of why it must be re-run, never transcribed.** Three
figures were produced for this one quantity in a single session:

```
grep -rn "\.traverse(\|traverseVisible(" --include=*.ts apps packages plugins src | grep -v "__tests__\|\.test\.ts\|\.spec\.ts" | wc -l
  -> 316 sites / 147 files          (this lane, tests excluded)
grep -rn "traverse(" ...            (no leading dot, tests excluded)
  -> 332 sites / 153 files
  ... including tests               -> 479 sites
```

A sibling sub-lane in this same audit reported **363 / 186** for "the same" quantity, and ADR-0302
reported **~120**. **Four numbers, one subject.** ⭐ **The pattern and the root are part of the
measurement.** Quote the command or do not quote the number. Top holders (this lane's pattern):
`packages/core-app-model` (33 files), `apps/editor` (30), `packages/geometry-furniture` (25),
`plugins/annotations` (10), `packages/file-format` (10).

⭐ **The conclusion this sharpens:** navigation stutter is **not** `scene.traverse` on the frame
clock. It is §1's six scene draws, plus PERF1's five O(model) reads on the **pointer** clock. The 316
traversals live on the **edit** clock, which is ADR-0302's territory. Three clocks, three owners —
they should stop being discussed as one problem.

### §3.3 — The candidates, ranked by clock

| site | shape | complexity | clock / frequency | verdict |
|---|---|---|---|---|
| `apps/editor/src/ui/SpatialTree.ts:220-224`, `:387-390` | `types.forEach(t => allElements.filter(e => e.type === t))` | `O(T · E)`, T ≈ 8 stores × types | **`model-updated`, i.e. after any bus-dispatched mutation** | ⭐ **REAL — see §3.4.** The `filter` is the small half; the DOM rebuild is the cost. |
| `packages/spatial-index/src/RoomGraphService.ts:320-325` | `for i / for j>i` + `a.boundingWallIds.some(w => b.boundingWallIds.includes(w))` | `O(R² · B²)` | lazy rebuild after `invalidate(levelId)` | 🟡 **Real quadratic, immaterial N.** R = rooms *per level* (tens), B ≈ 8. R=50 ⇒ ~80 k ops, sub-millisecond. **Not worth fixing. Recorded so the next sweep does not re-open it.** |
| `apps/editor/src/ui/property-panel/PropertyPanelStoreEnricher.ts:67-68`, `:80-81` | `for (wall of ws.getAll())` + `wall.openings.find(...)` | `O(W · O)` | **selection** (`PropertyPanel.showElement` → `enrichFromStores`) | 🟡 low — it is a **fallback** only, reached when `ws.getWindow(id)` / `getDoor(id)` miss. |
| `packages/geometry-wall/src/WallMergeDetector.ts:401-421` | `for (wallId of scope)` + `walls.find(...)` + `recorded.filter(r => r.boundingWallIds.includes(wallId))` | `O(S · (W + R·B))` | wall move / merge | 🟡 UNMEASURED at scale — worth a probe if wall-move latency is reported again. |
| `packages/core-app-model/src/sync/SyncStateEngine.ts:860`, `:948` | per-element lookup walking all rooms / all walls | `O(R + W·O)` per lookup | sync event → per edit | 🟡 UNMEASURED. |
| `packages/geometry-wall/src/WallFragmentBuilder.ts:1672`, `:3760` | `for (op of wall.openings)` + `wallGroup.children.find(...)` | `O(Op · C)` | per wall rebuild | 🟢 bounded — openings per wall is small. |
| `packages/geometry-wall/src/WallJunctionInfill.ts:170-171` | `for (wallId of cluster)` + `endpoints.find(...)` | `O(C · E)` | junction resolve | 🟢 bounded by cluster size. |
| `packages/command-registry/src/rooms/{DetectAll,ReDetect}RoomsCommand.ts:~194` | `for (room)` × `for (wallId)` × `wall.openings.some(...)` | `O(R · B · Op)` | explicit user command | 🟢 acceptable for a one-shot command. |
| `packages/ai-host/src/workflows/apartmentLayout/tgl/*` (7 + 5 + 3 + 2 sites) | nested scans in the layout engine | quadratic in **rooms per apartment** | generation, once | 🟢 N is ~10. **Not a defect.** |

**Honest summary: the sweep did NOT find a second 550 ms-class quadratic.** The one that shipped
(ADR-0338) detonated because a module-level singleton made N the *whole project* rather than one
family. **The generalisable rule is not "avoid nested loops" — it is "never let a per-item question be
answered by a scan of a GLOBAL registry."** That is the shape to grep for, and `_elements` was the
only instance of it on an interaction clock that this sweep found.

### §3.4 — ⭐ `SpatialTree.refreshTreeNow()` rebuilds ~27 400 DOM nodes on every model mutation, visible or not

`apps/editor/src/ui/SpatialTree.ts:145` opens with `treeContent.innerHTML = ''` — a **full teardown**
— and rebuilds the entire tree from the stores.

**MEASURED, per element** (`createTreeNode` at `:467-500` plus the per-element eye toggle at `:241-263`):

- **6 DOM elements** — `item` div, `header` div, icon span, label span, `children` div, toggle button
- **4 event handlers** — `onmouseenter`, `onmouseleave`, `onclick` (collapse), `onclick` (select)
  — plus a fifth on the toggle
- **1 `innerHTML` assignment of a 117-character SVG string** (`EYE_ON`, `:4`) — an HTML parse per
  element, the most expensive of the three in a real browser
- and each hosted window/door under a wall repeats the whole set again (`:265-300`)

A happy-dom replica of the exact node shape built **27 400 DOM elements for a 3 898-element model**.
⚠ **The happy-dom *milliseconds* are NOT quoted** — happy-dom's own style/selector handling is
super-linear and its timings went non-monotonic (10 000 elements measured *faster* than 3 898), which
is proof the clock was measuring happy-dom and not the DOM. **The node count is the reliable
measurement; the real cost needs the browser command in §7.4.**

**Frequency — MEASURED:** the listeners are `SpatialTree.ts:502-508` —
`runtime.events.on('model-updated')`, `bim-level-added`, `bim-level-removed`,
`pryzm-ifc-tree-updated`, plus `pryzm-import-model-remove`. `PropertyInspector.ts:202` records the
contract: *"`model-updated` fires after any element mutation dispatched through the bus."*

**Two mitigations exist and one gap remains:**
- ✅ bursts are coalesced to one rebuild per microtask (`:319-336`, §CLEAR-PROJECT-BATCH) — so a
  40-level teardown is 1 rebuild, not 40.
- ❌ **there is no guard on whether the panel is open or on screen.** `grep -n "isOpen\|collapsed"
  apps/editor/src/ui/SpatialTree.ts` → no such guard exists. The tree is behind a toggle
  (`AIAreaLayout.ts:451 toggleSpatialTree`), so for a founder who never opens it, **100 % of this work
  is invisible and wasted.**

**Fix (cheap, no risk):** an `if (!isPanelVisible()) { _dirty = true; return; }` at the top of
`refreshTreeNow`, with a rebuild on open. **Expected saving: the whole row whenever the panel is
closed.**

---

## §4 — Project load: decomposing the 31.9 s

### §4.1 — The load is 17 phases and **three timers**, two of which measure the wrong thing

> ⭐ **CORRECTED 2026-08-21 (lane LOAD1, L-3051) — the heading is UNDERSTATED. The third timer
> measured NOTHING, and it is the one whose output both lanes quoted.**
>
> `__phase(name)` computed `if (__phase_starts[name] !== undefined) __phase_ms[name] = now -
> __phase_starts[name]` and wrote `__phase_starts[name] = now` *after* the read. There are exactly
> **five** phase names and **each fires exactly once per load**, so the key was ALWAYS undefined
> when it was read, `__phase_ms[name]` was NEVER assigned, and every `§LOAD-PHASE` line printed the
> `?? 0` fallback. The founder's 47 397.8 ms load printed
> `PHASE_TIMINGS setup=0.0ms hydrate=0.0ms event_flush=0.0ms`. **Only `total=` was ever real.**
>
> Note the direction of the failure: it did not report a *wrong* number, it reported **zero** — which
> reads as *"this phase is free"* rather than *"this phase is unmeasured"*. FIXED in `1b6c1bc1`
> (rolling boundary cursor), together with:
> - **`§LOAD-IMPORT-STEPS` (L-3050)** — the `element_import` bucket is now 20 named steps with
>   per-step ms and element count, printed heaviest-first.
> - **`§LOAD-YIELD-WAIT` (L-3054)** — COMPUTE vs WAITING split. `_maxGapMs` never timed the time
>   spent *inside* `yieldForProgress`, so a load parked behind a slow frame bus was invisible; and
>   it was only updated at the TOP of `yieldFrame`, so everything after the generator's LAST yield
>   (rooms, room bounding lines) was outside every timer.
> - **the watchdog (L-3052)** now names the running import step, not the last completed boundary —
>   `setup` is the boundary *before* the import, so all 20 steps reported as `"setup"`.
> - **`load_setup` (L-3053)** — `element_import` began at the top of the instrumentation block, so
>   it also contained the watchdog install, the pauses, `beginBatch()` and the path select.
>   **`element_import=47168.2ms` never meant "the import took 47.2 s".**
>
> ⚠ **And the checksum verify + the decompress/JSON.parse of the 16.6 MB payload are outside
> `total` ALTOGETHER** — `verifySnapshotChecksum` runs at `:385-401`, before `__t_load_start` at
> `:413`. The founder's felt open time is **≥** the number the loader prints.

`apps/editor/src/engine/persistence/ProjectLoader.ts` is 2 853 lines. `__mark(name)` (`:469-473`)
accumulates **`now - __mark_last`** — *everything since the previous mark* — and there are only
**three marks in 1 700 lines of body.**

| # | phase | lines | instrumented? |
|---|---|---|---|
| 0 | checksum verify | 385-401 | ❌ dark |
| 1 | instrumentation + 5 s watchdog | 413-520 | ❌ dark |
| 2 | suppress-begin, observer pause, wall-rebuild pause, `storeEventBus.beginBatch()` | 550-627 | ❌ dark |
| 3 | **`setup` boundary** | 630 | ✅ `§LOAD-PHASE name=setup` |
| 4 | path select | 638-674 | ❌ dark |
| **5** | **⭐ ELEMENT IMPORT** — `executeChunked(importCmd, yieldFrame)` | **705-714** | ⚠ **one opaque bucket** |
| 5b | chunk-yield summary | 715-723 | ✅ `§LOAD-CHUNKED … longest synchronous chunk=…ms` |
| 6 | legacy per-command path | 754-1631 | dead by default |
| 7 | 7 × system-type restore loops (slab/wall/handrail/ceiling/floor/door/window) | 1638-1943 | ❌ **misattributed into `migrations`** |
| 8 | VG governance, IFC meta, semantic index, viewDefs, visibility, intents | 1947-2010 | ❌ same misattribution |
| 9 | the actual migrations | 2013-2043 | ⚠ `__mark('migrations')` |
| 10 | **19 subsystems in one bucket** — sheets, schedules, materials, hierarchy, site, templates, codes, semanticGraph, provenance, temporalGraph, decisions, requirements, assetCatalog, DXF (`await import` @2332), annotations, constraints, OBC adapter, dependency-graph rebuild | 2058-2423 | ⚠ `__mark('nonelement_stores')` |
| 11 | **`hydrate` boundary** | 2427 | ✅ |
| 12 | `storeEventBus.endBatch()` — builder fan-out | 2447 | ✅ `event_flush` |
| 13 | `wallRebuildControl.resumeAndFlush()` | 2473-2481 | ✅ `wall_rebuild_flush` |
| 14 | per-level redetect **scheduling** (one level/frame, fire-and-forget) | 2497-2632 | ⚠ **only the dispatch is timed — the redetects themselves run after `load()` resolves and are UNMEASURED** |
| 15-17 | `clearHistory`, expected-id set build, summary | 2643-2755 | ❌ dark / ✅ total |

⚠ **Two instrumentation defects, in the instrumentation:**
1. **`migrations` does not measure migrations.** It measures lines 727 → 2045 — the seven
   system-type restore loops, IFC meta, semantic index, view definitions, visibility rules and
   intents, *and then* the two migrations. `migrations=4200ms` sends the reader to the wrong file.
2. **`element_import` starts too early** — `__mark_last` is initialised at `:468`, so the bucket also
   contains the watchdog, the pauses and `beginBatch()`.

### §4.2 — ⭐ `CreateWallCommand` deep-clones the **entire wall store, once per wall**, for an undo path that cannot run

**This is the strongest single load finding of the whole lane, and it lives entirely inside the
opaque `element_import` bucket.**

`packages/command-registry/src/walls/CreateWallCommand.ts:446`:

```ts
this._neighbourSnapshot = ctx.stores.wallStore.getAll()
    .filter(w => w.levelId === this.wallData.levelId)
    .map(w => ({ id: w.id, baseLine: […], _sourceBaseLine: […] }));
```

and `packages/geometry-wall/src/WallStore.ts:340-342`:

```ts
getAll(): WallData[] { return Array.from(this.walls.values()).map(cloneWallData); }
```

`cloneWallData` (`WallStore.ts:63-96`) is **not** a reference copy: object spread + 4 fresh Vec3s +
`openings.map(cloneOpening)` + `layers.map(l => Object.freeze({...l}))` + ≥4 `Object.freeze` calls.
**Creating N walls therefore performs `N(N−1)/2` full deep clones.**

**Three facts make it pure waste during a load:**
1. `_neighbourSnapshot` is read **only** inside `undo()` (`:627-628`; `grep -n _neighbourSnapshot` →
   4 hits: `:72` decl, `:446` write, `:627/628` read).
2. `CommandManagerImpl.ts:655` — *"PROJECT_LOAD: no undo push (Contract 20 GAP-3)"* — and
   `ProjectLoader.ts:2643` calls `clearHistory()` at the end regardless. **The command instance is
   discarded.**
3. ⭐ **The precedent is 200 lines above it.** The C83 spatial gate at `CreateWallCommand.ts:245`
   calls `wallStore.getAll()` for the same reason and **is** suppressed —
   `_c83Suppressed = __pryzmProjectLoadActive || __pryzmBuildingGenActive` (`:240-246`). Someone
   already knew to guard the sibling call.

And `WallStore` is the **only** store that deep-clones in `getAll()`:
`packages/geometry-slab/src/SlabStore.ts` carries the comment *"O(N) array construction only, no
per-element deep clone"*; `StairStore.getAll` is a plain `Array.from(...)`.

**MEASURED** — a faithful replica of the `WallStore.ts:63-96` body, node v24.15.0, 20 reps ×
2 000-wall store, 4 runs:

```
plain wall   (0 layers, 0 openings): 1.36 – 7.63 us/clone   (median ~1.5 us)
layered wall (4 layers, 1 opening) : 3.98 – 17.34 us/clone  (median ~4.5 us)
```

**PROJECTED** total at `CreateWallCommand:446` (`clones = N(N−1)/2`):

| N walls | clones | @1.5 µs (plain) | @4.5 µs (layered) |
|---|---|---|---|
| 500 | 124 750 | 0.19 s | 0.56 s |
| 1 000 | 499 500 | 0.75 s | 2.2 s |
| 1 500 | 1 124 250 | 1.7 s | 5.1 s |
| 2 112 (192 × 11 levels) | 2 229 216 | 3.3 s | **10.0 s** |
| 3 000 | 4 498 500 | 6.7 s | **20.2 s** |

**Status: mechanism MEASURED · magnitude PROJECTED · the founder's N UNMEASURED.** It is one guard
line from zero, it sits inside the 29 s bucket, and it grows **quadratically** — which is exactly the
shape a chunked loader cannot chunk away.

### §4.3 — `_debouncedGeomAdded`: **CONFIRMED as unguarded · REFUTED as "per yield window" · the 14 950 ms belongs to a DELETED call site**

`apps/editor/src/engine/initScene.ts:3984-3999` — the guard is `if (batchCoordinator.isBatching) return;`
and nothing else.

**CONFIRMED — the asymmetry is real and its fix is 40 lines away.** The sibling handler at
`initScene.ts:2975` reads `if (shouldDeferPerAddGeometryPass(batchCoordinator.isBatching)) return;`,
which consults **both** `isBatching` **and** `isProjectLoadActive()`
(`apps/editor/src/engine/perAddGeometryGate.ts:32,45`). `grep -n "isProjectLoadActive" initScene.ts`
→ **2 hits (`:169` import, `:2968` log)** — **none at `:3984`**.

**MEASURED event surface:** `_debouncedGeomAdded` is registered on **41 events**
(`GEOMETRY_CASTER_MUTATION_EVENTS`, `apps/editor/src/engine/geometryMutationEvents.ts:58`); the gated
handler on **22**. **18 events arm only the ungated one**, including `bim-door-added`,
`bim-window-added`, `bim-opening-added`, `bim-handrail-added`, `bim-plumbing-added` — all fired
per element during a load. Body cost: `pascalSceneLighting.onGeometryAdded` → `_enableShadowsOnScene`
(`packages/core-app-model/src/rendering/PascalSceneLighting.ts:455-537`) = **one full
`scene.traverse()`** with per-mesh `userData` reads, `toLowerCase()`, three `.includes()`, a
first-sight `computeBoundingSphere()`, and `castShadow`/`receiveShadow` writes.

⭐ **REFUTED — "fires per yield window."** The 100 ms `setTimeout` is `clearTimeout`-ed by every
subsequent event. During a chunked import the next chunk resumes ~16 ms later and clears the timer.
The pass fires only when a **≥100 ms gap with no geometry event** opens. Upper bound `loadMs / 100`;
**the realistic figure could be 1**, and nothing in this repo has measured it.

> ⭐ **UPDATE 2026-08-21 (lane LOAD1, L-3056) — the guard is IN, with its escape hatch.**
> `_debouncedGeomAdded` now returns early on `isProjectLoadActive()`. **The pass is MOVED, not
> dropped**: nothing else sets shadow flags on a restored project (the post-batch call site below is
> deleted), so a one-shot runs it EXACTLY ONCE at load end on either of two independent "load is
> over" signals — `pryzm-project-loaded` (runtime bus, successful loads) and
> `pryzm-load-suppress-end` (window, dispatched by `ProjectLoader` on EVERY exit including a
> cancelled or failed load). The early return sits BEFORE `_armWallCommitShadowFreeze()`
> deliberately: arming with no debounce callback to release it would latch
> `setShadowReallocFrozen(true)` for the session.
>
> ⛔ **The size is STILL not claimed**, exactly as this section insists. **The fix carries its own
> counter** — the one-shot prints how many caster-mutation events it stood in for and how long the
> single pass took, so the next load reports the saving instead of a lane asserting it. That closes
> §10.5 without needing `pryzmPerf`.

⭐ **The 14 950 ms is misattributed.** `initScene.ts:3105-3111`, verbatim:

> `//   pascalSceneLighting.onGeometryAdded(scene) is NO LONGER called here.`
> `//   … producing the observed ~14,950ms LONGTASK (measured 2026-05-04 console log session).`

That number was measured for the **post-batch callback** call site, and `§FIX-POST-BATCH-SHADOW`
**deleted that call**. It has never been measured for `_debouncedGeomAdded`. Carrying it forward is
the `[[confident-register-rows-are-the-wrong-ones]]` shape — **so this lane does not carry it.**

**Settled by one command** (the counter already ships —
`bumpPerf(PERF_KEYS.TRAVERSE_SCENE_LIGHTING)` is the first line of `_enableShadowsOnScene`): see §10.5.

### §4.4 — ⭐ Three suppression mechanisms, and the channel every listener uses honours **none** of them

`ProjectLoader.ts:627` opens `storeEventBus.beginBatch()`. But `WallStore.emit()`
(`WallStore.ts:1757-1804`) has **three channels** and the batch covers only the middle one:

1. `this.listeners` — direct subscribers → **NOT batched**
2. `storeEventBus.emit(...)` → **batched** ✅
3. `_bus.emit('bim-wall-added', …)` where `_bus = new DOMEventBus()` (`WallStore.ts:14`) →
   `window.dispatchEvent(new CustomEvent(...))` **synchronously, with no batch awareness at all**
   (`packages/event-bus/src/DOMEventBus.ts:46-53`)

**So every one of the N elements fires a synchronous `window` CustomEvent during the load, and every
listener on it runs.** `beginBatch()`, `batchCoordinator.isBatching` and `__pryzmProjectLoadActive`
are **three different mechanisms**, no subscriber honours all three, and the DOM bridge is covered by
none.

**Subscribers that ignore both guards and do O(scene) work per event — MEASURED:**

| subscriber | file:line | per-event work | guard |
|---|---|---|---|
| `_debouncedGeomAdded` | `initScene.ts:3984` ×41 events | full `scene.traverse()` + shadow-caster mutation | `isBatching` only ❌ |
| **`WallEdgeVisibilityService`** | `apps/editor/src/ui/WallEdgeVisibilityService.ts:88` ×4 events | `queueMicrotask(() => this._apply())` → **full `scene.traverse()` (`:173`), no debounce at all** | **none** ❌ |
| **`_reapplyFloorHatch`** | `initScene.ts:946-949` | `queueMicrotask` → full `scene.traverse()` | **none** ❌ |
| **`_reapplyRoomOverlay`** | `initScene.ts:1005-1008` | `queueMicrotask` → full `scene.traverse()` | **none** ❌ |
| **`HierarchyTreePanel`** | `apps/editor/src/ui/dataworkbench/HierarchyTreePanel.ts:1330-1343` ×18 events | `_elementCache.clear(); this._render();` — full DOM re-render, no debounce | **none** ❌ (mount-dependent) |
| `ViewportPreviewRenderer` | `packages/core-app-model/src/presentation/ViewportPreviewRenderer.ts:173-179` ×15 | `_rerenderPlanViews()` → `wallStore.getAll()` — **another §4.2 deep clone** | early-returns with no canvas ⚠ |
| `DataPanelRenderer` | `packages/core-app-model/src/presentation/DataPanelRenderer.ts:114-115` | `rerender()` → `wallStore.getAll().length` — **deep clone to read a length** | registry-size only ⚠ |

### §4.4b — ⭐ "Guarded by the load flag" means two different things, and conflating them is a trap

`grep -rn "isProjectLoadActive|__pryzmProjectLoadActive"` → **82 hits / 27 files** (21 source, the
rest docs, tests and two `dist/assets/*.js` artefacts). The 21 source sites split into **two
populations that a single grep makes look identical**:

**WORK gates — the flag changes what EXECUTES (5 sites):**

| site | what it skips during load |
|---|---|
| `CreateWallCommand.ts:245` | C83 `evaluateWallPlacement` — **and its `wallStore.getAll()` deep clone** |
| `CascadeWallBaselineCommand.ts:323` | the whole wall-crossing check, incl. `wallStore.getAll()` |
| `CreateFloorCommand.ts:210` | `_resolveBoundary()` + `floorStore.getAll()` overlap check |
| `RoomTopologyObserver.ts:718,856` | redetect scheduling |
| `perAddGeometryGate.ts:32,45` | two full `scene.traverse()` per add |

**LOG gates ONLY — the flag suppresses a `console.log` and nothing else (6 sites):**
`BimKernel.ts:267,331` · `StairStore.ts:126` · `StairMeshBuilder.ts:284` ·
`CreateStairCommand.ts:208,518,560` · `WallFragmentBuilder.ts:776` ·
`RoomFinishSyncService.ts:86,105,113`.
**Their per-element work runs at full cost during a load.** This lane's own first pass listed three of
them in the "suppressed" column; that was wrong, and correcting it is the point — *a file that
mentions the load flag is not a file that is cheap during a load.*

⭐ **And this sharpens §4.2 rather than softening it.** The three C83 work gates are the *same pattern
applied to the same problem in the same file family*: each guards a `*Store.getAll()` behind
`__pryzmProjectLoadActive`. `CreateWallCommand.ts:245` does it. **`CreateWallCommand.ts:446` — 200
lines below, in the same function, calling the same deep-cloning `wallStore.getAll()` — does not.**
The precedent for the fix is not hypothetical; it is already in the file, above the defect.

Correctly guarded, for contrast: `initScene.ts:2975` (both guards), `RoomTopologyObserver`,
`RoomFinishSyncService` (redetect arm), `SaveOrchestrator`, `WallRebuildCoordinator`.

⚠ **One stale comment in the loader.** `ProjectLoader.ts:597` names
`[WallOccupancyStore] canPlace OK: wall=…` as one of two per-element floods the load flag suppresses.
**That predicate was deleted 2026-08-19** — `WallOccupancyStore.ts:86-99` carries the tombstone. The
log now sits behind `__pryzmDebugWalls` (off by default), so the *outcome* is unchanged and this is
not a perf defect — but the loader's stated mechanism names a guard that no longer exists.

### §4.5 — Only **4 of 20** import steps chunk at all

`packages/command-registry/src/project/ImportProjectCommand.ts`, `IMPORT_CHUNK_SIZE = 120` (`:143`).
**MEASURED:** the generator contains **7 `yield` statements** — `:569, 665, 987, 990, 1019, 1126, 1129`.
Only **walls, slabs, furniture and curtain walls** chunk internally.

Never yield, and are the heaviest per-element geometry in the file:
- **Stairs** (`:859-983`) — per-tread mesh build
- **Handrails** (`:1035-1057`) — per-baluster meshes; C95 §15.5 measures **279 meshes / 93 materials
  for ONE 31-segment run**. ⭐ **BUT NOW MEASURED FOR WALL-CLOCK, and it is small** — lane LOAD1,
  L-3055, `packages/geometry-handrail/src/__tests__/HandrailLoadBuildCost.spec.ts`, driving the REAL
  builder through the REAL `InstancedElementRenderer` into a REAL `THREE.Scene` at the founder's
  exact N=137: **instancing OFF 42.4 ms** (0.31 ms/el, 3151 meshes) · **instancing ON 98.5 ms**
  (0.72 ms/el, 151 meshes) · per-element cost **LINEAR** (N=200 / N=50 = **1.01×**). CPU only, so a
  lower bound — but ON uploads 20× fewer meshes, so the GPU half favours ON.
  **All 137 handrails cost ~0.1 s of a 47.2 s import on either regime**, which REFUTES "restoring
  railing instancing (`46b14397`) caused the 32 s → 47 s regression" as an explanation for the
  +15 s (it does explain the founder's mesh count falling 3898 → 1843, and the new
  `scene.foreignElement×37`).
- **Lighting** (`:1086-1122`) — each `PointLight` triggers a shader-permutation rebuild
- plus levels, grids, columns, ceilings, floors, standalone openings, roofs, plumbing, beams, rooms

**Per-element `await` inside a for-loop: none** — L-108 already removed those; the only remaining
`await import()` in `ProjectLoader.ts` is `:2332` (DXF), once per load. That is clean, and worth
saying.

---

## §5 — Documentation pipeline: `EdgeProjectorService`

`apps/editor/src/engine/views/EdgeProjectorService.ts` (4 041 lines).

### §5.1 — What one re-projection costs — MEASURED

A **group** is one `THREE.Group` per BIM element. Per group the inner loop runs `group.traverse()` →
section-box drop gate → **`new THREE.EdgesGeometry(mesh.geometry, angleDeg)`** (`:2735`, `O(F log F)`)
→ `applyMatrix4` → plane-intersection triangle loop → `mergeGeometries` → classification →
`OBC.TechnicalDrawing.toDrawingSpace` per sub-layer → the opening suppressors.

Driving stages 1-7 against the repo's real `three@0.183.2` (stages 8-10 need an `OBC.World` and are
**excluded — so every number below is a LOWER BOUND**):

```
 tris/group   msPerGroup   ms @ 359 groups
        288        1.929               693
        648        3.699              1328
       1152        6.634              2382
       2592       19.346              6945
       4608       32.204             11561
```

Calibrating against the file's own figure — `:2458` *"Wall groups (~12ms/group)"* — puts a real PRYZM
wall group at **~1 800 tris**, i.e. **~13.8 ms/group ⇒ ~4.9 s per full 359-group re-projection.**
The probe's independent estimate at that tri-count is **13.81 ms/group**, within 15 % of the file's
own number.

**Chunk arithmetic reproduces the founder's log exactly.** `CHUNK_SIZE = _hasCWElements ? 1 : 4`
(`:2493`); the summary prints `Math.ceil(359 / 4)` = **90** (`:3320`). Each boundary awaits one rAF
(`:3263`), so the 90 chunks add **~1.5 s of pure yield latency** on top of the CPU.

### §5.2 — ⭐ CROP-INVARIANCE VERDICT: **99.6 % of the recomputed work is provably identical**

The instinct in the brief was right, and the mechanism is worse than "100 % waste" — it is *partial*
invariance with the cache keyed at the wrong stage, which is harder to see and just as expensive.

`computeClipSignature` (`:1837`) sees only `sectionVolumeBox` and `near`/`far`. And
`resolveSectionVolumeBox` (`:1134`) **returns `null` on its first line for anything that is not
`section` or `elevation`** (`:1140`), and in its own branch reads only
`viewDef.crop?.region?.min?.[1]` / `max?.[1]` — index **1**, the **vertical**.

| view family | what the crop does to the projection |
|---|---|
| plan / structural-plan / ceiling-plan | **the crop is entirely absent from the pipeline — 100 % projection-invariant.** All 359 groups still walk the loop and take the cache-HIT branch (`:2555-2588`: `geo.clone()` + `new LineSegments` + `new LineBasicMaterial` + `layers.create` + `registerSegmentUUID`, per sub-layer per group), plus 90 rAF yields. |
| elevation / section — **horizontal** crop | read by no branch, in no signature term — **100 % invariant**; it is a canvas-level clip |
| elevation / section — **vertical** crop | **a genuine input** — sets `minY`/`maxY`, which drops meshes at `:2707` *before* `EdgesGeometry` |

Crop handles are corners (`'nw'|'ne'|'se'|'sw'`, `PlanViewInteraction.ts:1724`), so every drag moves
both axes and the vertical half alone busts the signature.

**MEASURED split at the calibrated 1 800 tris/group, N = 359:**

```
CROP-INVARIANT (EdgesGeometry + applyMatrix4 + merge) : 4936.7 ms  (99.6%)
CROP-DEPENDENT (classification banding)               :   21.7 ms  ( 0.4%)
TOTAL per re-projection                               : 4958.4 ms  (13.81 ms/group)

If merged world-space edges were cached and only banding redone:
ONE crop step = 186.8 ms  vs  4958.4 ms today  ->  26.5x cheaper
```

(26.5× is the **conservative** end — timed against a crop that keeps every edge. A crop that drops
storey-below edges measured 21.7 ms, i.e. **228×**. Real range **26× – 228×**.)

**The defect is the cache key, not the cancellation.** `_cwProjectionCache` (`:1883`) stores
**post-classification, post-`toDrawingSpace`, post-suppressor** geometry, so a `clipSignature` flip
discards the crop-invariant edge extraction along with the crop-dependent banding. **Fix: two caches
— world-space merged `EdgesGeometry` keyed on `(elementId, version)`, classified drawing-space
geometry keyed on `(elementId, version, clipSignature)`.**

### §5.3 — The 20 `CANCEL-SUPERSEDED` messages are the system working, not the bug

`:3283-3315`. Cancellation polls only at `_chunkGroupIdx % 4 === 0` (`:3262`), so the earliest cancel
is after 4 groups; on cancel the half-built `TechnicalDrawing` is destroyed and **nothing is grafted
forward**. But the per-element cache writes at `:3222` run *before* the cancel check, so work is
reused whenever `clipSignature` holds.

**Quantified:** chunk wall-time ≈ 4 × 13.8 ms + 16.7 ms rAF ≈ **72 ms**; crop events arrive every
**80 ms** (`PlanViewInteraction.ts:1696`, an 80 ms throttle = 12.5 Hz). A pass survives ~1 chunk ⇒
each cancelled pass completes **~4 of 359 groups (1.1 %)**. Twenty consecutive cancels waste ~80
groups (~1.1 s) — **not** 20 × 359 = 7 180 groups (~99 s).

⭐ **So the founder's 20 cancel messages are evidence of a healthy guard.** The bug is that a
*successful* pass costs 4.9 s and the invalidation policy demands one every 80 ms. The exact waste is
already printed in his own log — `after ${_chunkGroupIdx}/${nativeMeshGroups.length} group(s)`
(`:3286`). **Read the N in those 20 lines; that is the measurement.**

### §5.4 — ⭐ Two caches in series with **exactly opposite** crop policies

`nativeElementMeshExporter.exportForView(viewDef)` runs **before** `project()` on every reproject
(`PlanViewManager.ts:993`, `:839`, `:1098`) and is **not behind any supersede check** — a cancelled
pass has already paid for it in full. Its key is
`` `${elementId}:${viewId}:${version}:${cropKey}` `` (`NativeElementMeshExporter.ts:395`), where
`cropKey` is the plan crop rectangle at 2 cm precision, or `'full'` otherwise (`:359-364`).

| | plan family | elevation / section |
|---|---|---|
| **NME proxy cache** (`cropKey`) | crop-**SENSITIVE** → 100 % MISS on drag | crop-**INDEPENDENT** → HIT |
| **EPS projection cache** (`clipSignature`) | crop-**INDEPENDENT** → HIT | crop-**SENSITIVE** → 100 % MISS |

⭐ **Whichever view family the founder drags a crop in, exactly one of the two caches goes fully
cold** — and neither team can see the other's policy from its own file. This is
`[[three-invalidation-gates-in-series]]` again, with the gates in opposition rather than in series.

**Re-projection triggers are not gated on geometry either.** `PlanViewManager._onViewUpdated`
(`:916`) listens on **`vd:view-updated`** and fires for **any** view-definition change — its own
comment at `:927` names them: *"crop / scope drag, range edit, rename …"*. **A rename re-projects 359
groups.**

---

## §6 — Save, serialise, and what is actually in a snapshot

### §6.1 — The serialiser is **not** the problem: it copies parameters, not geometry

- **Debounce: 2 500 ms** — `apps/editor/src/ui/platform/SaveOrchestrator.ts:189`, armed at `:266`,
  widened from 1 s by `§PERF-AUTOSAVE-DEBOUNCE` (`:179-188`).
- **Triggers: 39 window events** (`MUTATION_EVENTS`, `:59-81`), plus `beforeunload` (`:218`).
  Suppressed during load (`:224-225`) and during batches (`:220-221`). **This is correct.**
- **Geometry is NOT deep-cloned.** `serializeWall` (`ProjectSerializer.ts:575-660`) emits parameters
  only — no vertices, no `BufferGeometry`. Deep copies are narrow and explicit (`openings.map`,
  `layers.map`, `wallProfile.ring.map`, three `structuredClone`s). Geometry is rebuilt from
  parameters on load.
- The old "serialises TWICE per fire" is fixed — `getHash()` stashes the result in
  `_autosaveSerialization` (`PlatformSaveController.ts:99-116`) and `saveVersionInternal`
  take-and-clears it (`:245`).

**MEASURED per-element bytes** (`Buffer.byteLength(JSON.stringify(serializeWall(...)), 'utf8')`):

```
0 openings, 0 layers:  523 B      1 opening, 0 layers:  711 B
0 openings, 3 layers:  945 B      2 openings, 3 layers: 1322 B
representative (1 opening, 3 layers): 1133 B/element
  259 elements  -> 287 KB      5000 elements -> 5.40 MB
```

### §6.2 — ⭐ Snapshot size tracks **EDIT HISTORY**, not the model — and the brief's `:1387` claim was wrong in an instructive way

**REFUTED as written.** `apps/editor/src/engine/persistence/ProjectSerializer.ts:1387` is
`temporalGraph: temporalGraphManager.serialize(),`. It embeds nothing in 20 snapshots, and there is no
`20` anywhere in that file.

**But it named the right line.** `TemporalGraphManager.serialize()`
(`packages/core-app-model/src/TemporalGraph.ts:324-330`) returns `mutations: [...this._mutations]` —
a full copy of an **append-only log** — into **every snapshot**. And `MAX_MUTATIONS = 200_000`
(`:71`) is **warn-only** (`:391-394`): it logs *"Consider archiving old project versions"* and keeps
pushing. No trim, no eviction.

**MEASURED** (267 B per `MutationRecord`, from the field list at `:378-390`):

| mutations | per snapshot | × 20 retained versions |
|---|---|---|
| 1 000 | 0.25 MB | 5.1 MB |
| 10 000 | 2.55 MB | 50.9 MB |
| 100 000 | 25.46 MB | **509.3 MB** |
| 200 000 (the "cap") | 50.93 MB | **1 018.5 MB** |

⭐ **This explains the founder's own number.** `SaveOrchestrator.ts:180` records **793 elements →
~16.6 MB** = 20.9 KB/element, against §6.1's measured **1.1 KB/element** of real element data.
**~15.7 MB — 95 % of that snapshot — is not his building.** 15.7 MB ÷ 267 B ≈ **59 000 mutation
records.** And because each of the 20 retained versions carries its own prefix of the same log, the
stored total is **O(n²) in log length.**

Corroborating data points already in the repo: `ProjectRepository.ts:844,1357` — *"204 elements /
7 levels / 145 handrails; 20 versions ≈ 13.2 MB compressed, 23.9 MB raw"*; `VersionCacheStore.ts:8` —
*"785 elements produced a 5.4 MB compressed version snapshot"*.

**The "20" is CONFIRMED and they are 20 independent copies, not 20 references.**
`MAX_VERSIONS_STORED = 20` (`ProjectRepository.ts:141`, enforced by `versions.slice(-20)` at `:1201`
and `:1228`); each save builds a fresh `VersionRecord` from an **independent `serialize()` walk**
(`PlatformSaveController.ts:272-280`).

⚠ **Resident-memory nuance — the 20× is on disk/IDB, not in the live heap.** What is resident is
**two string copies of the compressed history per project**: `_versionMirror` (§6.3) and
`_versionBlobCache` (`ProjectRepository.ts:184`). Per project ≈ **2 × compressed-history bytes** —
~26 MB for the founder's 13.2 MB history, and JS strings are UTF-16. The 20× shows up on storage and
inside each transient `getVersions()` inflate, **measured at 503 ms** (`ProjectRepository.ts:845`).

### §6.3 — `_versionMirror`: PERF1's finding **CONFIRMED**, and it is worse — it warms **every project**

`apps/editor/src/ui/platform/VersionCacheStore.ts:52` —
`const _versionMirror = new Map<string, string>();` — **module-level, outside the class.**

**Complete mutation inventory (grep, tests excluded):**

| op | line | when |
|---|---|---|
| `.set` | **:127** | **`warm()` — `store.openCursor()` walks the ENTIRE `versions` object store and sets EVERY project** (`:123-128`) |
| `.set` | :174 / :183 | `putVersionsMirrorOnly` / `putVersions` |
| `.get` | :157 | `getVersionsSync` |
| `.delete` | **:203** | `deleteVersions(projectId)` — **the only removal** |
| `.clear()` | — | **DOES NOT EXIST** |

**Evicts on:** project *deletion*, only. **Does NOT evict on:** project switch, project close, view
change, sign-out, `bim-project-cleared`.

⭐ **And it is not merely un-evicted — it is eagerly populated for all projects.**
`warmVersionCache()` (`ProjectRepository.ts:376-377`) is documented to run *"once on hub mount … and
again right before opening a project"* (`:363-365`), and `warm()` cursors the whole store.
**Opening the hub loads every project the user has ever saved, in full compressed version history,
into a module-level Map — and it stays for the session.** `_versionBlobCache`
(`ProjectRepository.ts:184`) has the identical shape.

**Retention = Σ over ALL projects of that project's compressed 20-version history, × 2 (mirror +
blob cache), held for the whole session.**

⭐ **`VersionCacheStore` is the outlier, and the fix pattern already exists in this repo.**
`EdgeProjectorService.clearCwProjectionCache()` (`:2170`) and
`NativeElementMeshExporter.clearCache()` (`:195`) **are** wired to project teardown. The fix is a
`pryzm-project-switch` listener calling a new `VersionCacheStore.evictExcept(activeProjectId)`.

The live measurement command is §10.7.

---

## §7 — Element creation and batch generation

### §7.1 — The batch **is** real — for three of six things

Path traced for `wall.batch.create` (the shape every generator uses):

| # | hop | file:line | runs per batch of N |
|---|---|---|---|
| 1 | dispatch | `apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts:1365`; `.../ResidentialBuildingExecutor.ts:1677` | **1** |
| 2-3 | `canExecute` + `resolveWallSystemType` | `plugins/wall/src/handlers/CreateWallBatch.ts:66-94`, `:155` | N |
| 4 | **`Wall.parse()` — Zod #1** | `CreateWallBatch.ts:159` | **N** |
| 5 | **`produceCommand` (Immer)** | `CreateWallBatch.ts:167` | **1** ✅ |
| 6 | **`wall.created` event fan-out** | `packages/runtime-composer/src/CommandEventBridge.ts:343-388` | **N** ❌ |
| 7-8 | VDT + bimManager register, **plus a `console.log` per wall** | `apps/editor/src/engine/initTools.ts:1275,1277,1288` | **N** ❌ |
| 9 | **`WallDataAddSchema.safeParse` — Zod #2** | `packages/geometry-wall/src/WallStore.ts:353` | **N** ❌ |
| 10-12 | **sibling array + `deriveJoinIntent` + `retreatOntoHostFaces`** | `WallStore.ts:437-442`, `:445`, `:494` | **N × k** ❌ |
| 13 | `_scheduleFlush` accumulate | `apps/editor/src/engine/WallRebuildCoordinator.ts:522,1207` | N → 1 Map ✅ |
| 14 | `store.getAll().filter(levelId)` | `WallRebuildCoordinator.ts:1851` | 1/level/flush — **deep-clones ALL walls** ❌ |
| 15-16 | `WallJoinResolver.resolveLevel`, mesh build | `:1862`, `WallFragmentBuilder.ts` | 1/level/flush, N |

**Genuinely collapsed:** the Immer produce, the undo entry, the store-event flush
(`BatchCoordinator` → `storeEventBus.beginBatch` + `endBatchYielded`, chunk 200), render suppression,
and REDETECT_ROOMS.
**Not collapsed:** the `wall.created` fan-out (one emit per element, deliberate, `CommandEventBridge.ts:343`)
and therefore N × (VDT register + bimManager register + `getById` + legacy `WallStore.add()` +
`console.log`).

⭐ **`WallStore.add()` is where a batch stops being a batch.**

### §7.2 — ⭐ The `WallStore.add()` quadratic — MEASURED against the real helpers

With `k` = walls already on that level, every `add()` rebuilds a `siblings[]` array (`:437-442`) and
runs **two O(k) geometric scans** — `deriveJoinIntent` (`:445`) and `retreatOntoHostFaces` (`:494`).
Over N adds on one level that is `Σk = N(N−1)/2`.

Probe with real imports of both helpers, via `tsx`:

```
N=  50  TOTAL     5.2 ms | siblings  0.2 | deriveJoinIntent   1.4 | retreatOntoHostFaces   3.5 | copies=1225   | 0.103 ms/el
N= 200  TOTAL    32.1 ms | siblings  7.9 | deriveJoinIntent   8.2 | retreatOntoHostFaces  15.5 | copies=19900  | 0.161 ms/el
N=1000  TOTAL   368.0 ms | siblings  5.5 | deriveJoinIntent 144.2 | retreatOntoHostFaces 216.6 | copies=499500 | 0.368 ms/el
```

`499 500 = N(N−1)/2` exactly, and **ms/element rises linearly with N** — the signature of a
quadratic. **368 ms for 1 000 walls before any Zod, mesh or join-resolve work.** The source comment
at `WallStore.ts:429` states the per-call cost (*"Cost: O(k)"*) honestly but never notes the
aggregate.

**Fix: a `WallStore.addMany()`** that builds `siblings[]` once and runs both scans against an
incrementally-maintained index. `CurtainWallStore.addMany()` is cited in the archived docs as exactly
this pattern, so the precedent exists in-repo.

### §7.3 — `WallJoinResolver.resolveLevel` is superlinear, and the memo hid it

First measurements were cache hits — `WallJoinResolveMemo.ts:180` is a content-addressed memo
consulted at `WallJoinResolver.ts:295-309`. Re-measured with unique geometry per rep so every call
misses (5 reps):

```
N= 250  COLD  min  26.5 ms  median  27.5 ms  max   46.1 ms
N= 500  COLD  min  61.6 ms  median  65.2 ms  max   83.3 ms
N=1000  COLD  min 455.1 ms  median 485.9 ms  max  624.4 ms
N=2000  COLD  min 887.3 ms  median 900.4 ms  max 1024.8 ms
```

×8 in N → ×32.7 in time. **One cold `resolveLevel` on a 1 000-wall level ≈ 0.5 s.**
⚠ **Exact complexity class UNMEASURED** — the 500 → 1 000 step (×7.5) is out of line with its
neighbours and deserves its own probe before anyone quotes an exponent.

⭐ **And the coalesce window that exists to stop repeat resolves has ONE production caller.**
`beginGenerationResolveCoalesce` is opened only by `ResidentialBuildingExecutor.ts:808`.
`HouseLayoutExecutor.ts` — 3 595 lines — **never opens it**, so house generation pays the
un-coalesced ~3× whole-level resolves the flag exists to prevent. And **no executor ever calls
`endGenerationResolveCoalesce`**; closure happens only via an internal debounce,
`_GEN_TERMINAL_QUIET_MS = 1_500` (`WallRebuildCoordinator.ts:414`) — **a fixed 1.5 s dead-wait at the
end of every residential generation.**

### §7.4 — Every element allocates fresh geometry. There is no runtime geometry cache in the repo.

| element | fresh Materials | fresh Geometries | cache consulted? |
|---|---|---|---|
| instanced simple wall | 1 (`MeshBasicMaterial` hit-proxy, `WallFragmentBuilder.ts:1481`) | 2 `BoxGeometry` (`:1480`, `WallInstanceBridge.ts:100` — latter disposed at once) | body material via colour-keyed cache `:410`/`:4731` ✅ |
| **non-instanced wall** | **2** | **2-3** | **none at all** (`:4814/4829/4841` via `:4339`) ❌ |
| **layered wall** | **2 per layer** (3-layer = 6) | **2 per layer** (6) | ❌ |
| wall with openings | base + `material.clone()` at **7 sites** (`:2751-2929`) | — | ❌ |
| slab | 2 per layer | 2 per layer | ❌ |
| column / beam | 1 + 1 | — | **instancing default OFF** (`ElementInstanceBridge.ts:332-338`) |
| furniture | — | — | **instancing default OFF** (`FurnitureInstanceBridge.ts:125-128`); `ChairBuilder.ts` alone has **28 material / 45 geometry** allocation sites per placed item |

⭐ **This localises the long-standing "instancing defeated by per-element unique materials" finding.**
`SharedMaterialCache` (`packages/core-app-model/src/rendering/SharedMaterialCache.ts:85`) is a
**post-hoc uuid collapser** invoked at `InstancedElementRenderer.register()` — it cuts *draw calls*,
not *allocations*, and it is **unreachable from the fragment arms** that column, beam, furniture, slab
and joined/layered walls all take. The one correct ref-counted pool
(`packages/scene-committer/src/MaterialPool.ts:33`) is used only by the `plugins/*` committer
pipeline, **not** by `apps/editor`.

### §7.5 — Two Zod parses per wall, and the redundant one costs 5× the real one

`Wall.parse` (`CreateWallBatch.ts:159`) then `WallDataAddSchema.safeParse` (`WallStore.ts:353`) — the
legacy store re-validates what the handler has just validated. Schemas **are** module-level
singletons, not rebuilt per call (probe asserted identity — that part is clean).

```
N=  50  Wall.parse   1.0 ms | WallDataAddSchema.safeParse   5.4 ms | TOTAL   6.3 ms
N= 200  Wall.parse   4.1 ms | WallDataAddSchema.safeParse  83.5 ms | TOTAL  87.6 ms  (GC outlier)
N=1000  Wall.parse  20.6 ms | WallDataAddSchema.safeParse  98.1 ms | TOTAL 118.7 ms  (118.7 us/element)
```

### §7.6 — Corrections from this sub-lane

- The O(N²) adjacency scan `_findAdjacentWallIds` (`WallRebuildCoordinator.ts:1260`, called `:1766`)
  is guarded by `if (!prevState) continue;` — it is on the **move** path, **not** create. A previous
  reading of it as a creation cost would have been wrong.
- `resolveLevel` is **not pure**, contrary to the comment at `WallRebuildCoordinator.ts:395` — it
  reads `window.__pryzmDebugWalls` at `WallJoinResolver.ts:2817, 2841, 3279`. The probe threw
  `window is not defined` until shimmed, which is how this was found.
- **No `scene.traverse` is on the wall creation path.** The coordinator uses store queries, not scene
  walks. (See §3.2's note on the census discrepancy.)

### §7.7 — ⭐ The `getAll().filter(levelId)` shape is repo-wide

`WallRebuildCoordinator.ts:1851` calls `store.getAll().filter(w => w.levelId === levelId)` — which
deep-clones **every wall in the project** to keep one level, while the indexed `getByLevel()`
(`WallStore.ts:1180`, `O(k)`) sits right beside it. **The same shape appears at 60+ sites across the
stores.** Combined with §4.2 (`WallStore.getAll()` is the only store that deep-clones), this is one
defect with many faces: **`getAll()` on `WallStore` is a deep copy, and the whole codebase treats it
as a cheap read.**

---

## §8 — Startup, and memory over time

### §8.1 — ⭐ A 5.9 MB parser-blocking `<script>` sits **above** the landing skeleton

**Verified directly, by reading the emitted artefact:**

```
$ head -6 dist/index.html
<!DOCTYPE html>
<html lang="en">
  <head>
    <link rel="stylesheet" href="/cesium/Widgets/widgets.css">
    <script src="/cesium/Cesium.js"></script>

$ ls -l dist/cesium/Cesium.js | awk '{print $5}'   ->  5909848
$ gzip -c dist/cesium/Cesium.js | wc -c            ->  1728354
```

**No `defer`. No `async`. No `type="module"`. Line 5 — above the inline boot CSS at line 21 and
above the entire landing skeleton.** A classic script tag in `<head>` blocks the parser, so the
"paint-on-first-byte" skeleton documented at `index.html:66-77` **cannot paint until 5.9 MB has
downloaded, parsed and executed.**

**It is not in the source `index.html`** — `head -8 index.html` shows no such tag. It is injected at
build time by `vite-plugin-cesium` (`vite.config.ts:5`, `:181` — `plugins: [cesium(), …]`), whose
`transformIndexHtml()` pushes a bare `<script>` that Vite head-prepends.

Two aggravating facts:
- ⚠ **It only exists in production.** The plugin guards with `if (isBuild && !rebuildCesium)`.
  **Profiling `npm run dev` on localhost will never show it** — which is consistent with the standing
  note that localhost dev is unusable for perf work anyway, and is a second reason.
- ⭐ **The `vendor-cesium` manualChunk at `vite.config.ts:293` is dead code.** The same plugin sets
  `rollupOptions.external: ["cesium"]` plus `rollup-plugin-external-globals({cesium:"Cesium"})`, so
  `node_modules/cesium/` never enters the module graph. `ls dist/assets/ | grep -i cesium` → **one
  file, `CesiumViewport-8p4xKXDc.js` (231 857 B)** — PRYZM's own wrapper. **No `vendor-cesium` chunk
  was ever emitted**, and the comment claiming Cesium is *"only loaded when the geospatial viewport
  is opened"* is false: it is loaded on every page view, including the marketing landing page.

⚠ **Freshness caveat, stated because it matters:** `dist/index.html` is dated **2026-08-18**; the
source `index.html` is 2026-08-10 and `vite.config.ts` still registers `cesium()` today. The artefact
is a real production build under the current configuration, but **it is 3 days old — re-check
`dist/index.html` after the next build before treating the byte count as current.**

### §8.2 — 24.5 MB raw / 5.9 MB gzip is paid before first paint

```
$ du -sb dist/assets  ->  37,615,092      $ ls dist/assets/*.js | wc -l  ->  90
```

Eager/lazy was proved from the emitted bytes, not inferred —
`head -c 3000 dist/assets/main-D2Ap4tqs.js` shows the entry chunk **statically** importing
`domain-engine`, `vendor-three`, `vendor-thatopen`, `vendor-web-ifc`, `vendor-three-bvh`.

| paid before first paint | raw | gzip |
|---|---|---|
| `dist/cesium/Cesium.js` (**parser-blocking, not a Vite chunk**) | 5 909 848 | 1 728 354 |
| `main-D2Ap4tqs.js` (entry) | 7 007 279 | 1 580 880 |
| `domain-engine-KcM9-Sdj.js` | 3 757 777 | 1 015 086 |
| `vendor-web-ifc-zl-EjlDS.js` | 3 556 771 | 400 621 |
| `vendor-thatopen-D3jN48Jc.js` | 2 285 651 | 654 359 |
| `vendor-three-DNFOmyLg.js` | 1 865 565 | 531 005 |
| `vendor-three-bvh`, `app-shell-boot`, `modulepreload-polyfill` | 74 600 | 25 499 |
| **TOTAL** | **24 457 491** | **5 935 804** |

That is **65 % of the entire `dist/assets` tree, plus a 5.9 MB extra**, before anything paints.
(`engineLauncher-DdUgmuE5.js`, 3.85 MB, is correctly lazy.)

⭐ **The doc comment at `src/main.ts:9-11` is false.** It states *"Only platform-layer imports here.
The engine bundle (Three.js, @thatopen, web-ifc, Cesium, …) is deferred via dynamic import."*
**Measured: three of those four are static imports of the entry chunk, and Cesium is worse than
static — it is a blocking `<script>`.** Same class as L-809/L-812: a comment asserting an architecture
property that the artefact contradicts.

**And the Spanish planning-law corpus is on the pre-paint path.** String-literal census of the entry
chunk:

```
$ grep -oF "jurisdiction" dist/assets/main-D2Ap4tqs.js | wc -l   ->  330
132 "pipeline-extracted"   46 "ordinance-pdf"      27 "pgm-metropolitan"
 63 "endpoint-unreachable" 41 "not-the-rule-kind"  23 "amb-pgm-corpus"
 53 "explicit-area"        33 "estimated-ruleset"  12 "es-08019-barcelona"
```

From `packages/schemas/src/site/zoning/*`, `packages/site-parcel-data/src/*` and
`packages/ordinance-extraction/src/*`, plus `marketingPages.ts`. **Site-feasibility domain data is
downloaded and parsed before the landing page paints.**

### §8.3 — Top-level side effects: mostly clean, with three real offenders

**Honest negatives first** — measured, so they do not get re-audited:

```
$ grep -rnE '^(const|let|var) .* = await |^await ' apps/editor/src packages/*/src plugins/*/src src
  -> 0            ZERO top-level await. Nothing serialises the module graph.
$ grep -rn '^window.addEventListener(\|^document.addEventListener('  ...   -> 4
```
The `init*` files' listeners (28 in `initBuilders.ts`, 21 in `initScene.ts`) are **inside functions**
and cost nothing at import.

**The offenders:**
1. `apps/editor/src/engine/views/PlanViewInteraction.ts:77-86` — three **module-scope**
   `window.addEventListener` registrations at module evaluation, with no removal path.
2. **162 module-scope singletons construct inside the EAGER `domain-engine` chunk** —
   `core-app-model` 112, `geometry-curtain-wall` 10, `plugins/annotations` 9, `geometry-stair` 8,
   `room-topology` 7, `geometry-wall` 6, `geometry-door` 5, `spatial-index` 5. Every one runs before
   first paint.
3. **17 module-scope THREE material/geometry constructions** across those eager packages
   (`new THREE.MeshStandardMaterial`, `new THREE.BoxGeometry(1,1,1)`) — GPU-adjacent objects
   allocated at import time.

⛔ **`const _bus = new DOMEventBus()` × 80 at module scope in `packages/command-registry/src/**` is
NOT a finding** — the constructor stores one reference to `window`
(`packages/event-bus/src/DOMEventBus.ts:16-20`) and `grep -rn "_bus\.on("` → **0**, so none registers
a listener. Recorded so nobody re-discovers it as a scare.

### §8.4 — The 2 401 ms LONGTASK is a hardcoded string, and it was the **smallest** of its family

`apps/editor/src/engine/initScene.ts:2157` prints
`'Phase 5: pre-warmed renderer consumed — 2,401 ms LONGTASK skipped.'` **unconditionally on the fast
path.** It is a historical constant, not a live measurement.

What it was: `createRenderer(canvas)` → `WebGPURenderer.init()` = adapter request + device creation +
initial shader compilation (`apps/editor/src/rendering/rendererPrewarm.ts:14-15`, `:79`), absorbed by
`prewarmRenderer()` from `src/main.ts:604-607`. Four pre-warms exist: renderer, `engineLauncher`
chunk, `CesiumViewport` chunk, and the eager globe.

⭐ **Comparable things still UN-warmed — every one larger, and every number is the repo's own:**

| recorded LONGTASK | source |
|---|---|
| **~14 950 ms** shadow-depth PSO recompile | `initScene.ts:3111` |
| **14 619 ms** + **6 169 ms**, *"no source attribution"*, inside the ~30 s load | `ProjectLoader.ts:405-406` |
| **14 175 ms** cold-PSO after context loss | `initScene.ts:1971` |
| **14 000 ms** cold-PSO | `initScene.ts:1960` |
| **12 635 ms** — 9 461 edge geometries, *"observed in production"* | `initScene.ts:1250` |
| **7 046 ms** — one LONGTASK freezing the main thread after the batch | `EdgeProjectorService.ts:2450` |
| 2 401 ms renderer init | ✅ **the only one that got a warm** |

`grep -rn "psoPrewarm\|prewarmPSO\|compileAsync\|renderer.compile"` finds only a
**curtain-wall-specific** PSO prewarm (`CreateCurtainWallsOnAllSlabsCommand.ts:761-878`). **There is no
general scene-content PSO prewarm.** And no pre-warm can touch §8.2's 24.5 MB — that needs splitting,
not warming.

### §8.5 — Memory over time: `setInterval`, observers and `.subscribe()` are CLEAN. **`.on()` is the leak.**

**Honest negatives, measured, so these three axes stop being re-audited:**
- **`setInterval` is perfectly balanced** — 17 construct sites, and **every file containing a
  `setInterval(` also contains a `clearInterval(`**, checked file by file across all 17.
- **Observers are near-balanced** — 11 constructed (`ResizeObserver` 6, `MutationObserver` 3,
  `IntersectionObserver` 2) vs **20** `.disconnect()`. Three construct sites lack a `disconnect()` in
  their file, and **all three are one-shot at boot, not per-switch**:
  `DockingLayout.ts:142` (fully anonymous — no reference retained, so disconnecting is structurally
  impossible), `ProjectBrowserPanel.ts:335` (anonymous), `initScene.ts:1827` (`roObserver` held but
  never disconnected).
- **`.subscribe(` is disciplined** — 49 / 75 / 8 sites in editor / packages / plugins, disposer
  captured at every site sampled.
- **The `init*` files are NOT a per-switch leak.** They run once, via a one-shot `ensure()`
  (`src/main.ts:442`; `buildPersistence.ts:294-299` documents *"lazy-starts the legacy engine on
  first"*). Their 68 net window listeners are **boot cost, not retention**.

**The raw asymmetry:**

```
DIR              addEventListener  removeEventListener
apps/editor/src        2227               269        8.3 : 1
packages                381               199        1.9 : 1
plugins                  92                71        1.3 : 1
```

Narrowed to **long-lived targets** (a listener on a DOM node dies with the node; one on `window`
never does):

```
apps/editor/src : window.add 362 / window.remove 119   -> +243 net
                  document.add 84 / document.remove 76 -> +8 net
packages+plugins: window.add 149 / window.remove  77   -> +72 net
                  document.add 45 / document.remove 46 -> -1
```

**The `document` axis is clean. `window` is the surface, concentrated in `apps/editor/src`** — worst
files by net window listeners: `UnifiedBrowserPanel.ts` 29/0, `initBuilders.ts` 28/0,
`initScene.ts` 21/0, `LeftNavRail.ts` 14/0, `DocumentsBrowserPanel.ts` 11/0, `initUI.ts` 11/0.

⭐ **But the real asymmetry is the typed event bus, and it is invisible to `addEventListener` audits:**

```
apps/editor/src :  x.on(  = 260   (63 files)
apps/editor/src :  .off(  =   8
```

**All 8 `.off(` calls are maplibre** (`SiteBoundaryMap2D.ts:2120-2124`, `SitePlanOverlayController.ts:940`,
`SitePlanOverlayLayer.ts:193`). **There are ZERO `.off()` calls against the PRYZM runtime event bus
anywhere in `apps/editor/src`.** Every one of the 260 discards the returned `Disposable`:

```ts
window.runtime?.events?.on('pryzm-project-loaded', () => { … });   // ImportManagerPanel.ts:112-342
window.runtime?.events?.on('model-updated', () => refresh());      // UnifiedBrowserPanel.ts:130
```

Note `ImportManagerPanel.ts:120` subscribes to **`pryzm-project-switch` itself** — a handler for the
switch event that survives the switch.

### §8.6 — ⭐ `closeProject()` frees nothing at all

`packages/runtime-composer/src/buildPersistence.ts:342-345`, in full:

```ts
const closeProject = async (): Promise<void> => {
  opts.projectContext.clear();
  setStatus({ kind: 'idle', isDirty: false });
};
```

**That is the entire close lifecycle.** No dispose, no abort, no listener removal, no scope clear.
All project-scoped teardown is keyed off **`pryzm-project-switch`** (`PlatformShell.ts:174`) and
**`bim-project-cleared`** (`ClearProjectCommand.ts:265`). **So close-without-reopen frees nothing** —
builders, scene roots and Canvas2D surfaces stay alive until a *different* project is opened.

⚠ **This is a caveat on the standing "GPU disposal is strong (ADR-0297)" position**, not a refutation
of it: the switch path *is* covered (`ProjectLifecycleController._handleProjectSwitch:104-144`,
`initScene.ts:3503-3541`, `initTools.ts:2722-2783`, `initBuilders.ts:1107`). **Close-without-reopen is
a category that position may not cover.** Cross-domain — flagged for whoever owns the lifecycle.

**View switch and tool activation are clean and this lane says so.** `ViewController.activate()`
(`:1389`) calls `deactivate()` (`:1442`) → `_cleanupAllListeners()` (`:2542`), which genuinely
iterates `_activeListeners` calling `removeEventListener` then `.clear()` (`:1298-1303`).
`ToolManager.activateTool()` (`packages/input-host/src/ToolManager.ts:528`) calls
`deactivateAllInternal()` **before** activating (`:543` → `:1129-1132`), and `BaseTool.onDeactivate()`
does `detachAllListeners()` + `clearAllPreviews()`. `PlanViewInteraction.ts` looks worst on the raw
count (20 add / 7 remove) but is a **false positive** — `attach()` (`:233-238`) registers exactly 6
and `detach()` (`:251-256`) removes exactly those 6; the rest are on per-interaction DOM inputs that
die with the node. Its only genuine issue is §8.3's three module-scope listeners.

---

## §9 — The re-ranked backlog

**Ranked by `expected saving × confidence × blast radius`, highest first.** PERF1's not-done list is
the starting set; every row is re-ranked against this lane's own evidence, and eight rows are new.

**Legend.** *Saving* — with the clock it is on. *Confidence*: 🟢 measured on this tree · 🟡 mechanism
measured, magnitude projected · 🔴 asserted, needs the founder's probe. *Blast* — how much can break.

| # | fix | clock | expected saving | conf. | blast | evidence |
|---|---|---|---|---|---|---|
| **1** | **Bail `OutlineNode.updateBefore` when the selection has been empty for ≥1 frame** (both nodes) | **every frame** | **4 scene-graph walks + 7 796 object submissions + 14 quad passes + 20 RT switches per frame — 67 % of everything submitted on an idle WebGPU frame** | 🟢 | **LOW** — a supported `return false` in three's own dispatcher; touches no material, no shader, no pipeline layout. **Not** the `localClippingEnabled` recompile class. | §1 |
| **2** | **Split the `EdgeProjectorService` cache by stage** — world-space merged `EdgesGeometry` on `(elementId, version)`; classified geometry on `(elementId, version, clipSignature)` | **every crop-drag frame (12.5 Hz)** | **4 958 ms → 187 ms per crop step (26×), up to 228×; 99.6 % of the recomputed work is provably identical** | 🟢 | MED — a cache-key change inside one file; correctness is testable by comparing output linework | §5.2 |
| **3** | ✅ **DONE 2026-08-21 (LOAD1, L-3057, `68724847`) — guarded on `__pryzmProjectLoadActive` ONLY, NOT on `__pryzmBuildingGenActive`: only the load path has a written guarantee that no undo entry is pushed, and a generated building IS undoable. At the founder's 59 walls this is 1 711 clones — SMALL; it is taken to remove a quadratic before the model grows into it, not as a fix for his 47 s load.** ~~Guard `CreateWallCommand.ts:446` `_neighbourSnapshot` on `__pryzmProjectLoadActive` / `__pryzmBuildingGenActive`~~ | **load + generation** | **`N(N−1)/2` deep clones removed — projected 3.3-20 s at 2 000-3 000 walls** | 🟡 | **LOWEST OF ALL** — one line, and the identical guard already exists 200 lines above at `:245`. The snapshot is read only by `undo()`, and load pushes no undo. | §4.2, §4.4b |
| **4** | **`WallStore.addMany()`** — build `siblings[]` once, run `deriveJoinIntent` + `retreatOntoHostFaces` against an incremental index | **generation + load** | **368 ms per 1 000 walls, quadratic — grows as N²** | 🟢 | MED — join semantics must be preserved; `CurtainWallStore.addMany()` is the in-repo precedent | §7.2 |
| **5** | **Move `<script src="/cesium/Cesium.js">` off the critical path** — `defer`, or drop `vite-plugin-cesium` and dynamic-`import()` Cesium from `CesiumViewport` | **every page load, incl. the marketing landing page** | **5.9 MB raw / 1.73 MB gzip of parser-blocking script removed from above the skeleton** | 🟢 | MED — must verify the Cesium global is still present when `CesiumViewport` mounts; the `vendor-cesium` chunk it *should* have used is dead code today | §8.1 |
| **6** | **Bound `TemporalGraph._mutations`** — the 200 000 cap at `TemporalGraph.ts:71` is warn-only | **every save, every version** | **~95 % of a 16.6 MB snapshot; up to 1 018 MB stored at the cap; storage is O(n²) in log length** | 🟢 | MED-HIGH — trimming an append-only log is a **data** decision (what history may be dropped?), not only a perf one. Needs a policy, not just a `splice`. | §6.2 |
| **7** | **Visibility guard on `SpatialTree.refreshTreeNow()`** | every bus-dispatched mutation | **~27 400 DOM elements + ~19 500 handlers + 3 898 SVG `innerHTML` parses, per mutation, while the panel is closed** | 🟢 (count) / 🔴 (ms) | **LOW** — an early return plus a dirty flag | §3.4, §10.4 |
| **8** | **Open the generation coalesce window in `HouseLayoutExecutor`** (one call, mirroring `ResidentialBuildingExecutor.ts:808`) **and call `endGenerationResolveCoalesce()` explicitly** | house/building generation | **~2 cold `resolveLevel` × ~0.5 s per 1 000-wall level, plus a fixed 1.5 s dead-wait per generation** | 🟢 | LOW — one call site each | §7.3 |
| **9** | **Evict `VersionCacheStore._versionMirror` + `_versionBlobCache` on project switch** | session-long | **Σ over ALL projects of a 20-version compressed history, ×2, held for the session** (13.2 MB history ⇒ ~26 MB, per project) | 🟢 (mechanism) / 🔴 (bytes) | **LOW** — the pattern already exists twice in-repo (`EdgeProjectorService.clearCwProjectionCache()`, `NativeElementMeshExporter.clearCache()`) | §6.3, §10.7 |
| **10** | **Reconcile the two crop cache policies** (`computeClipSignature` vs NME `cropKey`) and move `exportForView` **inside** the supersede check | crop drag | one of the two caches is **always 100 % cold**; a cancelled pass pays `exportForView` in full | 🟢 | MED — needs both owners in the room | §5.4 |
| **11** | ✅ **DONE 2026-08-21 (LOAD1, L-3056, `68724847`)** — gated on `isProjectLoadActive()`, **and the pass is MOVED not dropped**: a one-shot runs it once at load end on either `pryzm-project-loaded` or `pryzm-load-suppress-end`, because nothing else sets shadow flags on a restored project. **The fix carries its own counter**, so the next load prints the saving rather than a lane claiming it. | load | **UNKNOWN — could be 1 full-scene walk, could be tens.** ⛔ The 14 950 ms belongs to a deleted call site. | 🔴 | **LOWEST** — reuse the sibling's one-line guard | §4.3, §10.5 |
| **12** | **`.off()` the 260 discarded `runtime.events.on()` subscriptions**, starting with the panels that subscribe to `pryzm-project-switch` | project switch, repeated | 260 `.on(` against **8** `.off(`, and all 8 are maplibre | 🟢 (count) / 🔴 (heap) | MED — 63 files; do the switch-listening panels first | §8.5, §10.9 |
| **13** | **Give `closeProject()` a real teardown** | project close | **frees nothing today** — builders, scene roots, Canvas2D surfaces survive a close | 🟢 (code) / 🔴 (bytes) | HIGH — lifecycle change; ⚠ **cross-domain**, belongs to whoever owns `ProjectLifecycleController` | §8.6 |
| **14** | **Chunk the 16 non-yielding import steps** — stairs, handrails and lighting are the heaviest per-element geometry in the file and none of them yields | load | removes synchronous blocks of unknown size; **makes the load interruptible, which is the felt fix** | 🟡 | MED | §4.5 |
| **15** | **Read `info.render.drawCalls`, not `info.render.calls`**, in both perf readers; label the backend | instrument | **no runtime saving — it makes every future measurement true** | 🟢 | **LOWEST** — two field names | §2 |
| **16** | ✅ **DONE 2026-08-21 (LOAD1, L-3050…L-3054, `1b6c1bc1`)** — 20 named steps (`§LOAD-IMPORT-STEPS`), `load_setup` re-seat, watchdog names the RUNNING step, `§LOAD-YIELD-WAIT` compute-vs-waiting split, and the `§LOAD-PHASE` `elapsed=0.0ms` defect (L-3051) fixed — **that last one was not in this table because nobody had read the `if`**. | instrument | **no runtime saving — it is what turns 29 s of dark into a ranked list** | 🟢 | LOW | §4.1 |
| **17** | **Skip the redundant `WallDataAddSchema.safeParse` for bus-originated walls; drop the per-element `console.log` at `initTools.ts:1288`** | creation | 98 ms per 1 000 walls + N console writes | 🟢 | LOW | §7.5, §7.1 |
| **18** | **`WallRebuildCoordinator.ts:1851` → `getByLevel()`** instead of `getAll().filter()`; sweep the other 60+ sites | flush, per level | a whole-project deep clone per level per flush | 🟢 | MED at scale (60+ sites); LOW for the one site | §7.7 |
| **19** | **Make `_outlinesActive` actually suppress at render time** (fold into #1's bail) | view switch | the guard at `RenderPipelineManager.ts:1283-1310` **suppresses nothing today** | 🟢 | LOW — subsumed by #1 | §1.6 |
| **20** | **Split the eager 24.5 MB** — the jurisdiction corpus and `domain-engine` do not belong before first paint | page load | up to **~18.5 MB raw / 4.2 MB gzip** movable off the pre-paint path | 🟡 | **HIGH** — a chunking change touches the whole graph; do it after #5 | §8.2 |
| **21** | **A general scene-content PSO prewarm** | first interaction after load | six recorded LONGTASKs of **7-15 s** have no warm; the 2 401 ms one that got a warm was the smallest | 🔴 | HIGH | §8.4 |

### §9.1 — What changed against PERF1's list, and why

| PERF1 item | this lane's rank | why it moved |
|---|---|---|
| OutlineNode bail | **#1, unchanged** | now **MEASURED** rather than suspected, and the recompile risk is **refuted** — three's dispatcher has a first-class `return false` skip |
| dirty-gate `syncPickScene` | **not re-ranked — PERF1 owns it** | pointer clock; this lane deliberately did not duplicate the measurement |
| satisfiable WebGL shadow freeze | **not re-ranked — PERF1 owns it**, and ⛔ L-1480/L-1482 stand | WebGL-only; §1 is WebGPU-only, so the two do not compete for the same session |
| incremental selectable-cache | **not re-ranked — PERF1 owns it** | pointer clock |
| evict `_versionMirror` | **#9** — dropped from PERF1's implied position | **CONFIRMED and worse** (it warms *every* project), but it is a **memory** fix, not a smoothness fix. The founder's complaint is smoothness. |
| gate `_debouncedGeomAdded` on load | **#11 — dropped hard** | the 14 950 ms that made it look big **belongs to a deleted call site**, and the 100 ms debounce means it may fire **once** per load. Still worth the one-line guard; **not** worth a budget until §10.5 returns a number. |
| Scene Registry (the Pascal pattern) | **not on this list** | it is the right long-term architecture and it is **not** the answer to "why is navigation stuttering today" — §3.2 measured **zero** `scene.traverse` on the frame clock |

**Three of the four largest rows here are new to this audit** (#2 EdgeProjector, #3 `CreateWallCommand`,
#5 Cesium), and #3 and #5 are each a **one-line-to-one-file** change.

### §9.2 — The honest shape of the answer to the founder's question

> *"Is the elements well created towards maximum performance? Are there any performance gaps that
> could be avoided?"*

**No, and yes — but the gaps are not where "element creation quality" would suggest.** The elements
themselves are modelled sensibly; the parameters serialise compactly (§6.1, 1.1 KB/element) and the
frame loop is clean (§3.2). **Four repeated shapes account for nearly every row above:**

1. **A per-item question answered by a scan of a GLOBAL collection** — ADR-0338's `_elements`,
   §4.2's `wallStore.getAll()`, §7.2's `siblings[]`, §7.7's 60+ `getAll().filter()`.
2. **A cache keyed at the wrong stage, or two caches with opposite policies** — §5.2, §5.4.
3. **Work that runs because nobody told it not to** — §1 (outline around nothing), §3.4 (a closed
   panel), §4.4 (a DOM bridge that no batch flag reaches), §8.1 (Cesium on the landing page).
4. **An instrument that reads the wrong field or a comment that asserts an architecture the artefact
   contradicts** — §2, §4.1, §4.3, §8.2's `main.ts:9-11`, §1.6's no-op guard.

⭐ **Shape 3 is the one to internalise.** Six of the top ten rows are not "make it faster" — they are
**"don't do it at all."**

---

## §10 — Exact commands for the founder

Each command says **what each outcome would prove**. Run them in the editor's browser console with a
project open.

### §10.1 — ⭐ Settle §1 and §2 in one paste: is the instrument lying, and is the outline pass the cost?

```js
(() => {
  const r = window.pryzmRenderer, i = r?.info?.render;
  console.log('backend.isWebGPUBackend =', r?.backend?.isWebGPUBackend);
  console.log('render.calls      (CUMULATIVE since page load) =', i?.calls);
  console.log('render.frameCalls (THIS frame)                 =', i?.frameCalls);
  console.log('render.drawCalls  (THIS frame — the REAL one)  =', i?.drawCalls);
  console.log('render.triangles  (THIS frame)                 =', i?.triangles);
  let m = 0; window.pryzmRenderer && (window.selectionManager?.world?.scene?.three)
    ?.traverse(o => { if (o.isMesh) m++; });
  console.log('scene meshes =', m);
})();
```

**What it proves.**
- `frameCalls === 6` with nothing selected ⇒ **§1.4's six-passes census is confirmed live.**
  `frameCalls === 2` ⇒ the outline nodes are **not** updating and §1 does not apply to this session
  (say so — that would refute this lane).
- `drawCalls ≈ 3 × meshes` ⇒ **§1.1 confirmed live**: two of the three model-sized submissions are
  outline depth passes.
- `calls` being far larger than `drawCalls` and growing every second ⇒ **§2 confirmed**: the number
  the perf report calls "draw calls" is a cumulative render-invocation counter.

### §10.2 — ⭐ A/B the outline fix live, with no code change and no recompile

```js
// ARM: make both outline nodes bail one frame after the selection empties.
(() => {
  const find = (o, d = 0) => {
    if (!o || d > 6) return null;
    if (typeof o.updateBefore === 'function' && '_selectionCache' in o) return o;
    for (const k of Object.keys(o)) { try { const r = find(o[k], d + 1); if (r) return r; } catch {} }
    return null;
  };
  const raw = window.renderPipelineManager?._outlineNodes?.rawInstances;
  const node = find(raw?.selected) || find(raw?.hover);
  if (!node) return console.warn('outline node not reachable — report this, it is itself a finding');
  const proto = Object.getPrototypeOf(node);       // patching the PROTOTYPE covers BOTH nodes
  if (proto.__pryzmOrigUpdateBefore) return console.log('already armed');
  proto.__pryzmOrigUpdateBefore = proto.updateBefore;
  proto.updateBefore = function (frame) {
    const empty = this.selectedObjects.length === 0;
    if (empty && this.__wasEmpty) return false;    // three rolls frameId back — a supported skip
    this.__wasEmpty = empty;
    return proto.__pryzmOrigUpdateBefore.call(this, frame);
  };
  console.log('ARMED. Navigate for 30 s, then re-run §7.1 and compare.');
})();
```

To disarm: `(p => { p.updateBefore = p.__pryzmOrigUpdateBefore; delete p.__pryzmOrigUpdateBefore; })(Object.getPrototypeOf(node))`.

**What it proves.** Navigate for 30 s armed and disarmed and compare `frameCalls` / `drawCalls` and
the felt smoothness.
- Armed: `frameCalls` drops **6 → 2** and `drawCalls` drops by ~2× the mesh count, and navigation
  feels materially better ⇒ **ship the bail; it is the single largest available win.**
- `frameCalls` drops but the feel does not change ⇒ the outline pass was **not** the binding
  constraint on this machine, and this lane over-ranked it. **Say so — that is the more valuable
  outcome.**
- Selecting an element still draws a violet outline, and deselecting clears it with no ghost ⇒ the
  one-frame-late bail is correct and safe to ship.

### §10.3 — Boot profile

```js
copy(JSON.stringify({
  nav: performance.getEntriesByType('navigation')[0],
  slowest: performance.getEntriesByType('resource')
    .sort((a, b) => b.duration - a.duration).slice(0, 20)
    .map(r => ({ n: r.name.split('/').pop(), ms: Math.round(r.duration), kb: Math.round((r.transferSize || 0) / 1024) })),
}, null, 2));
new PerformanceObserver(l => l.getEntries().forEach(e =>
  console.log('LONGTASK', Math.round(e.duration), 'ms', e.attribution?.[0]?.name || ''))).observe({ entryTypes: ['longtask'] });
```

**What it proves.** A single resource dominating `slowest` ⇒ a bundle-splitting problem. Many
LONGTASKs after all resources have landed ⇒ the cost is module-evaluation side effects, not download.

### §10.4 — The `SpatialTree` rebuild cost, in the real DOM

```js
(() => {
  const t = performance.now(); let n = 0;
  const obs = new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.duration > 16) n++; }));
  obs.observe({ entryTypes: ['longtask'] });
  window.runtime?.events?.emit('model-updated', {});
  queueMicrotask(() => setTimeout(() => {
    console.log('model-updated → tree refresh:', Math.round(performance.now() - t), 'ms;',
      document.querySelectorAll('*').length, 'DOM nodes in document');
    obs.disconnect();
  }, 0));
})();
```

Run it once with the Spatial Tree panel **open** and once **closed**.
**What it proves.** If the two timings are the same, §3.4 is confirmed — the panel rebuilds while
invisible, and the visibility guard is free money. If closing the panel already makes it free, §3.4 is
refuted and should be struck.

---

### §10.5 — Settle §4.3 (`_debouncedGeomAdded`) with the counter that already ships

`bumpPerf(PERF_KEYS.TRAVERSE_SCENE_LIGHTING)` is the **first line** of `_enableShadowsOnScene`
(`PascalSceneLighting.ts:456`), so no code change is needed.

```js
globalThis.__pryzmPerfTrace = true;   // arms §PERF-L03-PHASE + §PERF-L03-TIER-TRAVERSE
window.pryzmPerf.on();                // arms the traversal counters and ZEROES them
// …now open the project, wait for "Load complete"…
window.pryzmPerf.report();
```

**What each outcome proves.**
- `traverse.pascalSceneLighting` **= 1-2** ⇒ §4.3 **REFUTED**. Close the suspect and spend the budget
  on §4.2 instead.
- `traverse.pascalSceneLighting` **= tens** ⇒ **CONFIRMED**; each unit is one full-scene walk plus a
  shadow-caster-set mutation on a live WebGPU renderer.
- `traverse.perAdd.deferredSkipped` on the same report proves the *gated* handler engaged, i.e. the
  report is armed and not mis-read.
- ⛔ If the report prints **"NOT ARMED — unmeasured, not zero"**, do not read the zeros as evidence.
  `PerfCounters.ts:47-55` exists precisely for this.

Then read, in order: `§LOAD-HYDRATE-STEPS` (which bucket), `§LOAD-CHUNKED … longest synchronous
chunk=…ms` (if this exceeds 100 ms the debounce in §4.3 *can* fire mid-load), then the two counters.

### §10.6 — Measure the EdgeProjector waste during a real crop drag

```js
(() => {
  const eps = window.edgeProjectorService, orig = eps.project.bind(eps);
  const s = { n:0, ok:0, cancelled:0, msOk:0, msCancel:0 }; window.__epsStats = s;
  eps.project = function (vd, models, groups, ...rest) {
    const t0 = performance.now(), g = groups?.length ?? 0; s.n++;
    return orig(vd, models, groups, ...rest).then(
      d => { s.ok++; s.msOk += performance.now()-t0;
             console.log(`[EPS] OK ${vd.viewType} ${g} groups ${(performance.now()-t0).toFixed(0)}ms`); return d; },
      e => { s.cancelled++; s.msCancel += performance.now()-t0;
             console.log(`[EPS] CANCEL ${vd.viewType} of ${g} after ${(performance.now()-t0).toFixed(0)}ms`); throw e; });
  };
  console.log('[EPS] armed — drag a crop for ~5 s, then read  __epsStats');
})();
```

**What it proves.**
- `msCancel / cancelled ≈ 80 ms` ⇒ the 80 ms throttle is the driver and cancellation is healthy —
  **the fix is the cache key (§5.2), not the cancel.**
- `msCancel / cancelled ≫ 300 ms` ⇒ the chunk boundary is too coarse; lower `CHUNK_SIZE` or poll
  `isSuperseded` per **mesh** rather than per 4 groups.
- `ok > 0` with `msOk` in seconds ⇒ confirms the ~4.9 s per-pass figure in the browser.

Cheaper still: his existing log already prints `after ${_chunkGroupIdx}/${nativeMeshGroups.length}
group(s)` on every cancel (`EdgeProjectorService.ts:3286`). **Reading the N in those 20 lines is the
measurement, with nothing pasted at all.**

### §10.7 — Measure the `_versionMirror` retention live (§6.3)

```js
(() => {
  const metas = window.projectRepository?.listProjects?.() ?? [];
  const rows = []; let total = 0;
  for (const m of metas) {
    const p = window.__vcs?.getVersionsSync?.(m.id);
    if (p == null) { rows.push({ project: m.name, resident: 'NOT IN MIRROR' }); continue; }
    const bytes = p.length * 2;                      // JS strings are UTF-16
    let n = null; try { if (p.charCodeAt(0) === 0) n = JSON.parse(p.slice(10)).length; } catch {}
    total += bytes; rows.push({ project: m.name, versions: n, MB: +(bytes/1048576).toFixed(2) });
  }
  console.table(rows);
  console.log(`TOTAL RESIDENT (mirror only): ${(total/1048576).toFixed(2)} MB`);
  console.log(`≈ DOUBLE for _versionBlobCache: ${(2*total/1048576).toFixed(2)} MB`);
  if (performance.memory) console.log('JS heap used:', (performance.memory.usedJSHeapSize/1048576).toFixed(1), 'MB');
})();
```

If `window.__vcs` is not exposed, read the IDB side the mirror is a verbatim copy of:

```js
indexedDB.open('pryzm-project-versions').onsuccess = e => {
  const db = e.target.result;
  db.transaction('versions','readonly').objectStore('versions').openCursor().onsuccess = ev => {
    const c = ev.target.result; if (!c) return console.log('--- end ---');
    console.log(c.key, (String(c.value).length*2/1048576).toFixed(2), 'MB'); c.continue();
  };
};
```

**What each outcome proves.**
- **Rows ≈ project count, total in the tens of MB** ⇒ **CONFIRMS** unbounded cross-project retention.
- **Exactly 1 row** ⇒ `warm()` was never reached (IDB disabled) and the localStorage fallback is
  live — the 5-10 MB origin-cap failure mode `§VERSION-QUOTA-INDEXEDDB` exists to escape.
- **`versions` > 20 on any row** ⇒ the `slice(-20)` trim is not reaching that project.
- **One row's MB ≫ its element count × 1.1 KB × 20** ⇒ **confirms §6.2**: the payload is dominated by
  the append-only `temporalGraph`, not by the building.

### §10.8 — Prove the generation quadratic and the missing coalesce window

```js
window.__pryzmPerfTrace = true;              // enables §PERF-GEN-INSTRUMENT logging
// …generate a building / a house…
// then grep the console for:
//   §PERF-GEN-INSTRUMENT _flush resolveLevel level=… walls=… elapsedMs=… resolveCountThisGen=N
```

`resolveCountThisGen > 1` for a level **proves the coalesce window did not cover that pipeline** —
expect exactly that on **house** generation, which never opens it (§7.3).

```js
window.__pryzmWallCreateOnHostFace = false;  // disables retreatOntoHostFaces (WallStore.ts:493)
// re-run the SAME generation and compare wall-clock
```

**What it proves.** A large improvement ⇒ the `add()`-path quadratic (§7.2) is the dominant in-browser
cost and `addMany()` is the right fix. **No change ⇒ mesh building dominates and the quadratic is
masked — which would mean §7.2 is over-ranked here, and that is the more useful answer.**

---

### §10.9 — Prove or disprove the leak across 20 view switches

⚠ Needs the **Chrome DevTools console** — `getEventListeners` is a console-only utility, unavailable
to page script. Open a project first, and click **Memory → 🗑 Collect garbage** before the baseline.

```js
const snap = () => ({
  heapMB: +(performance.memory.usedJSHeapSize/1048576).toFixed(1),
  windowListeners: Object.values(getEventListeners(window)).reduce((a,v)=>a+v.length,0),
  docListeners:    Object.values(getEventListeners(document)).reduce((a,v)=>a+v.length,0),
  canvases: document.querySelectorAll('canvas').length,
});
window.__base = snap(); console.table(window.__base);
window.__baseByType = Object.fromEntries(
  Object.entries(getEventListeners(window)).map(([k,v])=>[k,v.length]).sort((a,b)=>b[1]-a[1]));
console.table(window.__baseByType);
```

Now **switch 2D ⇄ 3D ⇄ split 20 times by hand**, collect garbage again, then:

```js
const after = snap();
console.table({ base: window.__base, after,
  deltaHeapMB: +(after.heapMB - window.__base.heapMB).toFixed(1),
  deltaWindowListeners: after.windowListeners - window.__base.windowListeners });
const now = Object.fromEntries(Object.entries(getEventListeners(window)).map(([k,v])=>[k,v.length]));
console.table(Object.keys(now).filter(k => (now[k]||0) !== (window.__baseByType[k]||0))
  .map(k => ({ event:k, before:window.__baseByType[k]||0, after:now[k],
               delta:now[k]-(window.__baseByType[k]||0) })));
```

**What each outcome proves.**
- `deltaWindowListeners ≈ 0` **and** `deltaHeapMB ≈ 0` ⇒ the view-switch path is clean — **which is
  what §8.5's static read predicts** — and the retention is §6.3's caches instead.
- `deltaWindowListeners ≈ 0` but `deltaHeapMB` grows monotonically ⇒ the leak is **not** DOM
  listeners; it is the typed bus (§8.5), which `getEventListeners` cannot see.
- `deltaWindowListeners` grows ~linearly ⇒ a per-switch `addEventListener` this lane did not find,
  and the per-event-name table names it directly.
- `canvases` grows ⇒ a Canvas2D surface is not being disposed despite `PlanViewManager.ts:260`.

For the **project-switch** axis, repeat with **10 project opens from the hub**. Prediction from
`ImportManagerPanel.ts:120`: the `pryzm-project-switch` handler count grows by one per panel per open
and never shrinks, because `buildPersistence.ts:342` frees nothing and no `.off()` exists.

⚠ For a heap number trustworthy across runs, prefer `await performance.measureUserAgentSpecificMemory()`
over `performance.memory` — the latter is bucketed and will under-report small deltas. It requires
`crossOriginIsolated === true`; check that first.

---

## §11 — What this lane did NOT reach

Recorded so nobody reads silence as a clean bill of health.

- **The GPU half of §1.** Every outline number here is a CPU-side submission count from a stub
  renderer. The actual millisecond saving needs §7.2 on the founder's machine.
- **The founder's session backend.** §1 applies only to real-WebGPU sessions. Which backend produced
  the `7591` log line was not determined; §7.1 line 1 answers it.
- **ADR-0338 §1's `7589 draw calls` row** — flagged in §2 as needing re-measurement, **not**
  re-measured here.
- **`renderer.info` is reset by three's OWN `requestAnimationFrame` loop** (`three.webgpu.js:28916`,
  started unconditionally by `Renderer.init()` at `:57559`). That is a second rAF that PRYZM does not
  own and that P3's gate cannot see, because `check-raf-count.ts` scans PRYZM sources, not
  `node_modules`. It does no rendering, so the perf impact is believed nil — **UNMEASURED**, and it
  belongs to whoever owns P3, not to this lane.
- **Every millisecond in §5 (`EdgeProjectorService`) is a LOWER BOUND.** The probe drove stages 1-7;
  stages 8-10 (`toDrawingSpace`, `addProjectionLines`, `applyOcclusion`) need a live `OBC.World` and
  were **not measured**. The `_suppressWallOpeningSeams` multiplier — **16 `toDrawingSpace`
  round-trips per opening per sub-layer**, ~3 200 extra calls across 100 opening-bearing walls — is
  **UNMEASURED in ms** and sits entirely inside that unmeasured range.
- **`WallJoinResolver.resolveLevel`'s exact complexity class.** The 500 → 1 000 step (×7.5) is out of
  line with its neighbours; the curve is superlinear but **the exponent was not established.**
- **The founder's N.** Every projection in §4.2 and §7 is parameterised on wall count. **His actual
  wall count was not measured**, so the 3.3 s / 10 s / 20 s figures are a table, not a claim.
- **`WallMergeDetector.ts:401-421` and `SyncStateEngine.ts:860,948`** — flagged in §3.3 as real nested
  scans on the edit clock, **UNMEASURED at scale**. Worth a probe if wall-move latency is reported.
- **`dist/` freshness.** §8.1 and §8.2 read an artefact built **2026-08-18**. The config still
  produces it, but re-check after the next build.
- **`ADR-0338 §1`'s `7589 draw calls` row** — §2 shows why it needs re-measuring with
  `info.render.drawCalls`. **It was not re-measured here**, and this lane did not edit that ADR.
- **Whether any of this is what the founder actually feels.** Every ranking above is a
  cost measurement. **§10.2 is the only thing that converts one into a felt improvement, and it has
  not been run.** If it comes back flat, row #1 is over-ranked and this document should say so.

---

## §9 — ⭐ THE HEADLINE IN §1 DOES NOT APPLY TO THE BACKEND THE FOUNDER IS ACTUALLY ON

**Measured 2026-08-22, from the founder's own console.**

§1 is correct and it is the largest single waste in this repository — **on WebGPU**. Its own scope
line says so: *"Scope: **WebGPU only.** `isRealWebGPUBackend()` gates the whole TSL pipeline … so
`webgl-classic` and the forced-WebGL path do not pay this."*

The founder's session prints:

```
[initScene] §FRAME-STARTS-CLEAN-ON-EVERY-BACKEND … on backend 'webgl-fallback'
[RenderPipelineManager] §PERF-WEBGL2-NO-TSL non-WebGPU backend — TSL pipeline OFF …
                        SSGI / outlines / post-FX stay OFF.
[autoWebGLHeavyScene] §AUTO-WEBGL-HEAVY — scene is device-loss-risk
                      (331 elems / 1848 meshes / 7 levels; reason=tier:post-load);
                      Auto mode switching WebGPU→WebGL to avoid heavy-scene device loss.
```

⛔ **So the fix §1.5 argues for would have changed nothing for the person who reported the
problem.** A ledger headline that is true and inapplicable is the same failure mode as a stale
count: it sends the next reader to the wrong file. §1 stands; **this section is the WebGL half.**

### §9.1 — What the founder's numbers actually decompose to

```
§SWAP-PAINTS-THE-BUILDING  sceneMeshes=1947  drawCalls=3685  triangles=480010
[PascalSceneLighting] Shadow flags set on 1366 mesh(es).
```

`1947 + 1366 = 3313`, against a reported **3685**. The residue is the ground catcher, grids, gizmos
and the site overlay. **The shadow depth pass is ~37 % of every frame's draw calls**, and it is
re-run **every frame**, including frames in which only the camera moved.

### §9.2 — The mechanism, and why it was off precisely when it was needed

`RenderPipelineManager.setShadowPassSuppressed()` — the nav shadow freeze, in the file since L-25 —
was disarmed **twice over**, and either alone was sufficient:

1. **It had ZERO production callers.** Measured: every reference outside the class was a test.
   The camera-motion lifecycle in `initScene.ts` (`controlstart` → `beginMotion`, `rest`/`sleep` →
   `endMotion`) was correct and complete, and simply never told the pipeline manager about it.
2. **It returned early on WebGL** — `if (!this._webGpuActive) return;` — justified in its own
   comment as *"the WebGL2 fallback drives its own shadowMap and is out of this lane."*

⭐ **Claim (2) is the third recurrence of one disproven belief, and it is disproven THIRTY LINES
BELOW ITSELF.** `_applyShadowFreezeState` carries the L-1480 correction verbatim: the classic
`WebGLShadowMap` reads the **per-light** `autoUpdate` flags too
(`three@0.183.2/…/webgl/WebGLShadowMap.js:95` renderer-level, **`:170` per-light**). The same
inversion was corrected for `§FRAME-STARTS-CLEAN-ON-EVERY-BACKEND` (L-1350) twelve hours before
that. A test — `shadowFreeze.test.ts` — stood guard over the belief and voted green each time.

⭐ **And the two compose into the worst possible shape:** `autoWebGLHeavyScene` forces
WebGPU → WebGL **because the scene is heavy**. So the optimisation for heavy scenes switched itself
off exactly when a scene got heavy. *The heavier the model, the more certainly it was disabled.*

### §9.3 — Why freezing during navigation is LOSSLESS, and the condition under which it stops being

A shadow map is a function of the **lights** and the **geometry**. It is not a function of the view
camera — and here that is not an assumption, it is checked: both shadow cameras are **fixed ortho
boxes fixed at configuration time**, never fitted to the view frustum.

| light | file | box |
|---|---|---|
| sun key light | `RealSunService.ts:469-472` | near 1 · far 500 · **±80 m** |
| Pascal key light | `PascalSceneLighting.ts:296-301` | near 1 · far 100 · **±`cfg.shadowCameraSize`** |

Orbiting cannot change a single texel. Re-rendering per frame reproduces a **bit-identical** texture.

⛔ **This stops holding the moment a shadow camera follows the view** — cascades, a fitted frustum,
or a per-frame `shadow.camera` write. There is none today (measured: no `shadow.camera.*` assignment
occurs inside a frame callback). Anyone adding one must re-read this section first.

### §9.4 — What shipped (L-3310)

- The `_webGpuActive` early return is **gone**, citing L-1480 in place.
- `initScene.ts` wires the missing caller onto the **existing** motion lifecycle —
  `controlstart` → freeze; `rest`/`sleep` → thaw + exactly one refresh. Deliberately **not**
  `controlend`: camera-controls fires `update` through a damping tail of several hundred ms, and a
  private timer would have rediscovered that bug.
- The tab-hidden backstop thaws too. Without it a drag interrupted by backgrounding the tab would
  leave the map frozen for the session — the same silent-lockup shape that backstop already exists
  to prevent for `isCameraDragging`.
- Kill switch `window.__pryzmShadowFreezeOnNav = false`, declared in `globals.d.ts` (P4 holds), so a
  suspected staleness report is confirmed or cleared in one step rather than a redeploy.
- The guard test is **inverted, not deleted** — a green test standing over a defect is worth more as
  a record of how the defect survived three times.

**Expected: ~37 % fewer draw calls per frame while navigating, scaling with caster count.** At the
10–20× the founder is planning for, this is 13 660–27 320 avoided mesh submissions per frame.
⚠ **Not yet measured in a browser. `drawCalls` as printed is not a reliable instrument (§2) — A/B
with the kill switch and `renderer.info.render.calls` read across two frames.**

### §9.5 — What is NOT closed, ranked for the 10–20× target

1. **~5.9 meshes per element** (1947 meshes / 331 elements). This, not the shadow pass, is the
   term that decides the 20× case: it multiplies *everything* downstream. **Unmeasured — no
   per-family mesh census exists.** That census is the next thing to build.
2. **`InstancedMeshCoalescer` reports `mergedGroups=0 totalInstances=0`** on every batch. Its key is
   `levelId:geometry.uuid:material.uuid`, and §7.4 records that *every element allocates fresh
   geometry* — so two elements can never share a UUID. **Whether 0 is "nothing left to merge"
   (`InstancedElementRenderer` already groups by geo×mat×level) or "structurally cannot merge" is
   NOT SETTLED, and the two have opposite fixes.** Do not act on this line without settling it.
3. **`SpatialTree.refreshTreeNow()` rebuilds ~27 400 DOM nodes on every model mutation** (§3.4),
   visible or not. Not a navigation cost; a mutation cost.
4. **The WebGL fallback is itself the constraint.** §PERF-WEBGL2-NO-TSL turns off the entire node
   pipeline. The device-loss forcing is correct — but it means the heavy-scene path is also the
   least capable path, and that trade has never been re-measured since the instancing fixes landed.
