# Session handoff — 2026-08-20

**Nine lanes, blocks `L-1410`–`L-1499`.** Ledger frontier: **`L-1499`, next free `L-1500`**
(`docs/04-reference/L-NUMBER-ALLOCATION-LEDGER.md`, committed).

> **Read this before re-deriving anything.** Every heading below is a founder-reported production
> symptom whose *first plausible explanation was wrong*. The measured cause is recorded next to it.

---

## 1 — The two rendering defects, and why they looked like one

The founder reported **three** viewport failures across the night. They resolve to **two** defects,
and neither is the one everyone assumed.

### 1.1 "Only outlines of walls and slabs" — a shadow sampler (L-1480, FIXED)

`§AUTO-WEBGL-HEAVY` swaps the renderer from the **same `tier:post-load` pass** that holds a shadow
freeze. `RenderPipelineManager._applyShadowFreezeState()` wrote the per-light
`light.shadow.autoUpdate = false` inside `if (this._webGpuActive)`, justified by the comment
*"WebGL2 fallback owns its own shadowMap and honours the renderer-level flag."*

⭐ **That comment is false in three's own source.** `WebGLShadowMap.js:95` gates on the
renderer-level flag **and `:170` gates on the per-light flag** — the classic `THREE.WebGLRenderer`
honours both. So `dispose()` zeroed the freeze *counters* without thawing the *lights*, `bind()`
skipped the per-light restore because `_webGpuActive` was now false, `light.shadow.map` was never
allocated, `WebGLLights` still counted the caster, every lit program declared
`sampler2DShadow directionalShadowMap[1]`, and three satisfied it with a 1×1 RGBA8 at
`TEXTURE_COMPARE_MODE = NONE` — **incomplete for that sampler ⇒ `INVALID_OPERATION` ⇒ every lit mesh
draw dropped.** `meshbasic.glsl.js` includes no shadow chunk, so `LineBasicMaterial` edge overlays
kept drawing.

**Fix: armed on the CONDITION, not the backend** — the L-1350 rule, twelve hours later, same file,
same class. Separating test verified **both directions** (2 of 6 fail reverted, 6 of 6 pass).

### 1.2 "All materials gone / flat white" — a SECOND surface at 0×0 (L-1470, FIXED)

The error flood was tagged `[.WebGL-…]` while the main renderer was **native WebGPU and healthy** —
**two surfaces, one broken.** The existing §L-328 gate reads `this._renderer` (the healthy one) and
therefore passed. OBC's `SimpleRenderer.resize` is
`setSize(container.clientWidth, container.clientHeight)` with **no `Math.max`, no `> 0`, no `||`**,
on a parent that `display:none` collapses — and OBC's `ResizeObserver` is the **last writer**, so
PRYZM's own guarded resize cannot win.

⭐ **`1 + 245 + 9 = 255` is Chrome's error cap, not a census.** The context then goes permanently
silent. **Fix is a refusal, never a clamp** (a 1×1 target still discards the image); pinned so
anyone attempting 1×1 fails. `packages/renderer-three/src/surfaceArea.ts` is the one authority,
read from the **backing store**, never `clientWidth`.

### 1.3 What was NOT the cause — do not re-run these

- ⛔ **The renderer retirement.** Measured on a real 3,181-mesh scene: meshes with a live material
  **3,181 → 3,181**. Only the dead renderer's 6,362 dispose listeners come off. No re-attach is
  missing and none can be.
- ⛔ **L-948's leaked-listener chain.** A classic `THREE.WebGLRenderer` has **no node system** — no
  `AnalyticLightNode`, no `ShadowNode`. The mechanism cannot fire on it.
- ⛔ **`untracked` retirement.** `trackRenderObjectsForRetirement()` runs unconditionally in
  `WebGPURendererAdapter.create()` for **both** `webgpu` and `webgl2`. **No factory path yields
  `untracked`.** The founder's `0 detached` is `mints-none` — **complete and correct**.
- ⛔ **`logarithmicDepthBuffer`.** Material-agnostic, from capabilities, symmetric between
  `meshbasic` and `meshphysical`. Relayed as the leading suspect; **cleared**.
- ⛔ **The material database.** A material defect cannot fix itself by swapping backend, and on the
  WebGPU path the composite alpha rule materials never participate in decides those pixels.

### 1.4 ⭐ The pin was destroyed on disk, not merely overridden (L-1483, FIXED)

`initScene.ts` persisted `'webgl'` on top of an explicit `'webgpu'` pin, because `'webgl-classic'`
is not round-trippable. **The next boot then resolved `'webgl'` before the heuristic ran at all.**
That is why the founder kept landing on the broken path. Fixed through the **existing** non-persisting
`backendOverride` (`§DIAG-FIX-WEBGPU-BACKEND-OSCILLATION`) — the mechanism was built for this and the
call site simply did not use it. **An explicit user toggle persists exactly as before.**

⚠ **C04 §1.4's "an explicit selection is ALWAYS respected" was STALE, not violated** — ADR-0267 §Fix-3
deliberately removed that gate for device-loss-risk scenes. The record was corrected, not the code.

---

## 2 — The globe: a hard-coded Sydney anchor (L-1420, FIXED)

`GISAreaLayout.ts:556` called `setAnchor()` **unconditionally at GIS init** with a hard-coded default
of **lon 151.2153 / lat −33.8568**. ECEF **Y** of that point is **2,553,076.920 m**; the founder's
export logged `minY = 2,553,068.999`. The 7.921 m residual is his building's own ~9 m footprint.
*(Independently re-derived by the orchestrator: matches to the metre.)*

The exporter baked `matrixWorld`, inherited the ECEF frame, then subtracted **Y only** — leaving the
model **5.8 Mm from its own GLB origin**. Fix derives the frame boundary two ways (declared
`userData.pryzmSceneFrame` + measured ≥100 km) and **refuses rather than emits** when still
globe-scale.

⚠ **C12 §1.5 had the call path WRONG** — it recorded `setAnchor()` as *"NOT verified that it ran"*
while a second, init-time call site always runs, for every project in every city. **L-1423 remains
OPEN**: every project is still anchored to Sydney at GIS init; closes only via C12 §9 item 3.

---

## 3 — Materials never reach the pixel (C100 §9.10)

**The founder's hypothesis was inverted: yesterday's C100 work did not cause this. C100 §9 is the
document that MEASURED it.** A draft contract cannot alter what renders.

- ⭐ **Furniture: the census measured a path production does not travel.** The live route is
  bus → `furniture.created` → legacy `FurnitureStore` → `FurnitureFragmentBuilder` → 62 builders.
  `materialId` existed on **none of those five layers** — *never reachable*, not lost. **FIXED.**
- ⭐ **Walls: NOT-ASSIGNED, not assigned-and-dropped.** No creation path sets a top-level
  `materialId`, and the default `wt-monolithic` has no such field; its layer carries `#e8e8e8`,
  which **is** `WALL_SCHEMATIC_MATERIAL` — the "no material" grey.
- ⛔ **"door/window have no `materialId`" is STALE** — S17 shipped 2026-08-19, ARM A reads 0/0.
  The founder's *"often show, often don't"* is **intermittency**; material resolution is
  deterministic. It belongs with **L-1401** (past the 512-instance cap, window frames drawn by
  nobody).
- ⭐ **`composeFamilyMaterialKey` was DELETED, not given callers.** It mandates one key layout, which
  §9.6.b forbids. It was a rival, not the unfinished half.

**OPEN / founder decision:** should Plain Wall name a master row? The safe negative is banked —
**15/15 wall-layer transcriptions still agree with the master**, so routing `layer.materialId` is
zero-repaint whenever a lane owns `WallFragmentBuilder`.

---

## 4 — Stairs

| Finding | State |
|---|---|
| Tool blessed a stair the command threw away — **and the two layers measured DIFFERENT QUANTITIES** (per-run vs averaged tread). That is why 218 vs 222, four apart, not thirty | ✅ FIXED, one authority |
| Auto-opening pierced the **slab only** — the void set is now DERIVED across families **and** levels | ✅ FIXED (floor + ceiling) |
| ⭐ Floor's void mechanism (`serviceHoles[]`) was fully built with **zero callers, ever**. Ceiling the same, a third time | recorded |
| Four "modes" (I/L/U/C) were four **SHAPES** occupying the MODE slot of a table five families read | ✅ FIXED |
| Linear/Ortho were **already built on both surfaces**, reachable by nobody; plan and 3-D had **opposite defaults** | ✅ FIXED, unified on ortho (wall-tool parity) |
| ⛔ **L-1433 — the SLAB's level axis is still top-level-only.** Founder-reachable via the Top-level dropdown | OPEN |
| ⛔ **L-1434 — `MAX_RISERS_PER_FLIGHT: 16` declared in three files, read by nobody.** ~86 risers pass | OPEN |
| ⛔ **250 mm vs 220 mm tread — FOUNDER DECISION.** CTE DB-SUA permits 220 mm in dwellings. ⭐ `STAIR_CONSTRAINTS_REGIONS` is **decorative**: `AS-1657`/`EUROPEAN` alias one object and `IBC-USA` "overrides" to the default's own value | OPEN |
| `bywall` planner + four both-numbers refusals ship; ⭐ **`NO_SHARED_CORNER`** — two perpendicular walls at opposite ends still intersect as *lines* | planner ✅, strip member withheld |

---

## 5 — Chat / RAC

⭐ **The definite article was breaking FIVE families.** `makeHostedTypeParser` did not accept
*"all **the** windows"* — so `make all the windows type X`, `…the doors…`, `…the slabs…`,
`…the ceilings…` **had never worked.** Nobody reported it because **every existing test was written
by someone who already knew the grammar** and therefore wrote *"make all windows"*. The founder's
idiom was the falsifier the suite could not contain. Pinned as an **EQUIVALENCE** between the two
grammars, not as the one reported sentence.

⭐ **The vocabulary cannot address a SUB-PART of an element at all** — only whole elements. Railings
are the sole exception, and only because they are separate *elements*. Recorded as a stated NOT-YET.

---

## 6 — Wall joins (JOIN2, in flight at handoff)

`§WALL-JOIN-LOAD-SKIP` restores walls *"from persisted baselines (NO load-time resolveLevel);
deferring one whole-level resolve per level off the critical path."* ⭐ **The founder's own control
case is the diagnosis: creating any element on the level makes every join snap correct.** The
architectural question is C84 **EI-7a (write set = restore set)** — mitred geometry is currently
**derived-but-not-derived**, which is neither persisted nor reliably recomputed.

⚠ Also measured, unfixed: **`element_import = 21,654 ms`** for a 306-element project, with a
watchdog firing at 11 s.

---

## 7 — Process findings that outlive tonight

1. ⭐⭐ **`apps/editor/__tests__/**` is excluded from the only vitest config anyone runs.** It hid a
   live failure for **two weeks**, hid a second the same night, and masks a measured baseline of
   **18 red suites / 52 red tests**. **Deliberately not fixed with lanes live** — flipping it drops
   52 invisible failures on everyone mid-flight. L-851's protocol is the close.
2. ⭐ **`depth-buffer.test.ts` was red all session and quoted as "known RED, not yours" in six lane
   briefs.** Its mock could not be called with `new`, so **it never reached a single assertion**.
   A test that cannot reach an assertion is not a weak guard — it is no guard.
3. ⭐ **A gate that classifies by NAME can be satisfied by RENAMING.** Two instances tonight: a
   registry gate asserting a command's *suffix* under a comment about *where it writes*; and a
   coverage proof aimed at a **dead file** (a wrong path can be satisfied without touching the
   product — strictly worse than a wrong spelling).
4. ⭐ **`git commit --only` scopes PATHS, not AUTHORS.** Two lanes had rows clobbered; one lane
   truncated the shared ledger to 0 bytes and restored it. **The ledger and ISSUE-LOG are now
   committed early and often, not at fleet close.**
5. ⭐ **A truncated `grep | head` produced a confidently wrong "exactly ONE call site" claim** that
   the orchestrator relayed to two lanes before checking. The full grep showed **three**.

---

## 8 — Open, ranked

| # | Item | Why it matters |
|---|---|---|
| 1 | **L-1487** — `PBRSceneUpgrader` stamps `envMap` per-material from a dead renderer's PMREM | ⭐ **Live landmine.** Inert only because Phase 5 pins `hdriPresetId:'none'`. The founder has an HDRI picker; one click arms it, and per-material binding means restoring `scene.environment` **cannot undo it** |
| 2 | **L-1433** — slab void still top-level-only | Founder-reachable by hand today |
| 3 | **Tread 250 vs 220** | Founder decision; blocks legal Spanish residential stairs |
| 4 | **L-1423** — every project anchored to Sydney at GIS init | Closes via C12 §9 item 3 |
| 5 | **L-1454** — the excluded test directory | 52 invisible failures |
| 6 | **L-1434** — 16-riser limit read by nobody | ~86-riser flights accepted |
| 7 | **L-1486** — nine renderer-caching services never rebound | ⭐ Several are bound to the OBC renderer Phase 5 silences — they may never have written to the live renderer at all |
| 8 | **49 local-only projects** | Sign-out or account-switch deletes them |
| 9 | A command barrel reaching `@thatopen/ui` at **module load** (`document is not defined`) | Breaks unrelated suites at import |

⚠ **The 412 on `PUT /api/projects/…/versions` is NOT data loss** — `ServerSyncQueue` reconciles,
retries once, then preserves as `local-only` and keeps it queued. It indicates a second live writer.
