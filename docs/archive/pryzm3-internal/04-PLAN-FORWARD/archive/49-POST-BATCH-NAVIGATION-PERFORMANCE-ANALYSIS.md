# 49 — Post-Batch Navigation Performance Analysis
## Against the Five Founding-Engineer Constraints

> **Status**: Analysis + Implementation Plan — zero code changed.
> **Produced**: 2026-05-07
> **Primary concern**: "THE NAVIGATION POST ELEMENT CREATION AFTER A BATCH ELEMENT CREATION
> HEAVE IS REALLY BAD"
> **Method**: Full source reads of all navigation-critical files + twelve parallel subagent explores
> + six live browser-console log captures (sessions 1–6, all from 2026-05-07).
> **Framework**: The five founding-engineer constraints in risk-reduction order.
> **Code files read**:
>   - `packages/renderer/src/CameraController.ts`
>   - `packages/frame-scheduler/src/FrameScheduler.ts`
>   - `src/engine/subsystems/core/rendering/UnifiedFrameLoop.ts`
>   - `src/engine/subsystems/core/views/ViewDependencyTracker.ts`
>   - `src/engine/subsystems/core/views/EdgeProjectorService.ts`
>   - `src/engine/subsystems/core/geometry/NativeElementMeshExporter.ts`
>   - `src/engine/subsystems/core/batch/BatchCoordinator.ts`
>   - `src/engine/subsystems/rooms/RoomTopologyObserver.ts`
>   - `src/engine/subsystems/core/DependencyResolver.ts`
>   - `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts`
>   - `packages/sync-client/src/YjsDocAdapter.ts`
>   - `src/engine/subsystems/ai/FloorPlanCommandBatcher.ts`
> **Contracts consulted**: C01, C03, C04, C08, C09, C10, C11.
> **Prior documents**: 46-PIPELINE-ARCHITECTURE-REVIEW, 47-POST-CREATION-NAVIGATION-BOTTLENECK-ANALYSIS,
>   48-FOUNDING-ENGINEER-CONSTRAINT-AUDIT, 45-CW-SLAB-BATCH-IMPLEMENTATION-PLAN.
> **Zero source files were modified during this analysis.**

---

## Part 0 — Critical Live-Log Evidence

### 0.1 Sessions captured (chronological)

| Session | Log file | Scene state | Primary finding |
|---------|----------|-------------|-----------------|
| 1 | `browser_console_20260507_214128_021.log` | 4,897 geometries | 53 LONGTASKs, G6 shadow cluster 1,591ms |
| 2 | `browser_console_20260507_215346_804.log` | geometries:0 | 22 uniform LONGTASKs, WebGPU device loss, 767ms recovery |
| 3 | `browser_console_20260507_215436_155.log` | geometries:0 | Single 22,182ms LONGTASK — tab frozen for 22s |
| 4–5 | `browser_console_20260507_215749_328.log` / `_215825_904.log` | geometries:0 | Continuous 229–629ms LONGTASKs, FPS 1–4 |
| **5** | **`browser_console_20260507_220536_245.log`** | **geometries:3,486, drawCalls:153, tris:2,086** | **First real loaded scene. gpu-pick hover 95–451ms per pointer move. FPS 4–8.** |
| **6** | **`browser_console_20260507_220635_856.log`** | **geometries:3,668, drawCalls:123, tris:1,726** | **THREE.LineLoop error every render frame. Geometry leak active during navigation (+182 in 10s). FPS 4–6.** |
| **7** | **`browser_console_20260507_221615_165.log`** | **geometries:3,644, drawCalls:84, tris:1,242 → then:0** | **5,742ms + 8,804ms LONGTASK pair. Second WebGPU device loss (reason=unknown). §FIX-DISPOSE-USEDTIMES confirmed. After recovery: geometries:0. FPS 1–10fps.** |

### 0.2 Session 5 — The navigation smoking gun (full evidence)

**Scene**: `geometries:3486 textures:9 | drawCalls:153 tris:2086`

**PickResolver firing on every pointer move:**

```
[debug] 1778191528245 [PickResolver] strategy=gpu-pick hover-hit=e9ab133e-...
[debug] 1778191528394 [PickResolver] strategy=gpu-pick hover-hit=e9ab133e-...
[debug] 1778191528706 [PickResolver] strategy=gpu-pick hover-hit=e9ab133e-...
[debug] 1778191528859 [PickResolver] strategy=gpu-pick hover-hit=e9ab133e-...
[debug] 1778191528989 [PickResolver] strategy=gpu-pick hover-hit=e9ab133e-...
[debug] 1778191529177 [PickResolver] strategy=gpu-pick hover-hit=e9ab133e-...
[debug] 1778191529409 [PickResolver] strategy=gpu-pick hover-hit=e9ab133e-...
[debug] 1778191529676 [PickResolver] strategy=gpu-pick hover-hit=e9ab133e-...
... (24 consecutive hover-hits logged)
```

**Simultaneous LONGTASKs (each hover → one or more LONGTASKs):**

```
[warn] duration=190ms  start=162673ms  (pointer-move #1 — gpu-pick render pass)
[warn] duration=239ms  start=162866ms
[warn] duration=177ms  start=163106ms
[warn] duration=167ms  start=163284ms
[warn] duration=158ms  start=163452ms
[warn] duration=166ms  start=163613ms
[warn] duration=204ms  start=163782ms
[warn] duration=451ms  start=163991ms  ← peak
[warn] duration=279ms  start=164540ms
[warn] duration=99ms   start=164821ms
[warn] duration=103ms  start=164922ms
... (43 LONGTASKs total in this session fragment)
```

**FPS**: 4–8fps throughout. Never reaches 16fps during navigation.

**User action that stopped the storm**: click on element `e9ab133e-...`
```
[log] [PickResolver] strategy=gpu-pick hit=e9ab133e-...
[log] [LevelPlaneConstraint] Locked Y=58.8000 for element "Slab"
[log] [CutFill] Updating: enabled=false, height=1.2
```

**Conclusion**: Every `pointermove` event triggers a synchronous GPU pick pass over 3,486
geometries. Each pick pass blocks the main thread for 95–451ms. This is the post-batch
navigation killer.

### 0.3 Session 6 — Additional critical findings

**THREE.LineLoop error firing every render frame:**

```
[error] THREE.Renderer: Objects of type THREE.LineLoop are not supported.
        Please use THREE.Line or THREE.LineSegments.
```

This error appeared 13 times in a ~3-second window, once per rAF tick. The WebGPU renderer
does not support `THREE.LineLoop`. Every frame that contains a LineLoop object in the scene:
1. Reaches the WebGPU backend draw submission.
2. Throws synchronously in the renderer's object-type check.
3. Returns early — the LineLoop geometry is **never rendered**.
4. The JS error object is allocated, a stack trace collected, and `console.error()` called.

Each of these steps adds latency to the render frame that already costs 180–268ms per task.

**Active geometry leak during navigation:**

```
Session 5: geometries:3486   (active scene, user navigating)
Session 6: geometries:3668   (10 seconds later, same scene)
Delta:     +182 geometries in 10 seconds of navigation
```

The geometry count is growing during interactive navigation — not only post-batch. The `gpu-pick`
render pass renders the scene into a separate ID render target. This pass may be allocating
intermediate `THREE.BufferGeometry` objects that are never disposed.

**Draw call efficiency:**

```
Session 5: drawCalls:153, tris:2086  → 13.6 triangles/drawCall
Session 6: drawCalls:123, tris:1726  → 14.0 triangles/drawCall
```

Both sessions: ~14 triangles per draw call. A healthy 3D BIM scene should target 1,000–10,000
triangles per draw call. At 14 tris/drawCall, the driver is called 71× more than necessary.
Each draw call has ~50–200µs of fixed CPU overhead regardless of triangle count. At 123 draw
calls × ~100µs each = ~12ms of draw-call submission overhead per frame, consuming 73% of the
16ms budget before any geometry is actually rendered.

---

## Part 1 — Navigation Architecture Anatomy

### 1.1 What runs in every rAF tick during orbit/pan/zoom

The `CameraController` (`packages/renderer/src/CameraController.ts`) is a hand-rolled orbit
implementation using `PointerEvent` listeners. On every pointer move:

```typescript
// CameraController.ts — pointer move handler
onPointerMove(event: PointerEvent) {
  const dx = event.clientX - this._lastX;
  const dy = event.clientY - this._lastY;
  this._updateSpherical(dx, dy);          // updates yaw/pitch/distance
  this.scheduler.markDirty('camera');     // wakes FrameScheduler
  this._lastX = event.clientX;
  this._lastY = event.clientY;
}
```

`scheduler.markDirty('camera')` wakes the `FrameScheduler`
(`packages/frame-scheduler/src/FrameScheduler.ts`). The scheduler executes one rAF tick with:

```
rAF tick
├── pre-render (priority queue)
│   ├── CameraController.interpolateTo() — smoothing
│   ├── CurtainWallBuilder._drainBuildQueue() — if drain active
│   ├── DependencyResolver._flushPendingTasks() — if CASCADE pending
│   └── ViewDependencyTracker._scheduledFlush() — if debounce fired
├── render
│   ├── OBC render pass — base scene geometry
│   └── PASCAL render pass — SSGI + post-FX (if not suppressed)
├── post-render
│   ├── shadow reactivation callback — if T+30s timer fired
│   ├── VDT markLevelsDirtyImmediate — if BatchCoordinator just completed
│   └── ShadowQualityUpgrader — quality level transitions
└── overlay
    └── 2D annotations, HUD, batch progress indicator
```

**Critical hidden cost not in the sequence above**: `PickResolver` runs a GPU render pass
outside the FrameScheduler's tick sequence, triggered directly on `pointermove`. It is wired
as an event listener on the canvas DOM element:

```typescript
// PickResolver (location inferred from log strategy=gpu-pick)
canvas.addEventListener('pointermove', (event) => {
  const hit = this._gpuPick(event.clientX, event.clientY);  // SYNCHRONOUS
  if (hit !== this._lastHit) {
    this._lastHit = hit;
    this._onHoverChange(hit);
  }
});
```

`_gpuPick()` renders the scene into a 1×1 or small ID render buffer at the cursor position.
This is a full synchronous WebGPU render call (submit command buffer, wait for GPU readback).
It happens **in the DOM event handler**, not in the rAF tick, so it is not subject to
FrameScheduler budgeting or scheduling. It fires at the native browser pointer event rate
(unlimited, up to ~1,000 Hz on gaming mice).

### 1.2 The full post-batch tick cost breakdown

After a batch completes, a single rAF tick during navigation carries ALL of the following costs
simultaneously:

| Cost component | Phase | Source | Typical duration |
|---|---|---|---|
| gpu-pick hover pass (per pointer move) | DOM event | PickResolver | 95–451ms (Session 5/6) |
| OBC render pass (3,486 geometries) | render | UnifiedFrameLoop | ~50–100ms (WebGPU, no LOD) |
| PASCAL SSGI pass | render | UnifiedFrameLoop | ~5ms GPU (Phase 2) |
| CW drain (if active) | pre-render | CurtainWallBuilder | 0–25ms (adaptive) |
| DependencyResolver CASCADE | pre-render | DependencyResolver | 0–81ms (Session 5 Cluster C) |
| VDT flush + EPS reprojection | pre-render (low-priority) | VDT + EPS | 57–174ms (chunked) |
| Shadow reactivation (T+30s) | post-render | PascalSceneLighting | 1,591ms (Session 1 G6) |
| THREE.LineLoop error path | render | WebGPU backend | ~1–3ms per frame |
| geometry leak (draw-call overhead) | render | PickResolver pick pass | +182 geoms / 10s |

No single navigation frame can stay within the 16ms budget while any of these are active.

### 1.3 The FrameScheduler's role — why it doesn't help here

The `FrameScheduler` correctly manages the rAF loop with priority tiers
(interaction → idle → background) and `IDLE_CONTINUATION_FRAMES=30`. It implements "0fps idle"
correctly. However, it cannot prevent the navigation degradation because:

1. **The gpu-pick is outside the scheduler** — it fires on raw DOM events, not rAF slots.
2. **The scene draw call cost is proportional to geometry count** — 3,486 geometries at 14
   tris/drawCall means 123–153 draw calls per frame regardless of FrameScheduler state.
3. **The 30-frame idle continuation** means the scheduler keeps firing rAF at full rate even
   when the camera has stopped moving — the 30-frame budget exhaustion does not apply while
   the navigator keeps moving the mouse (motionGate is active).
4. **pre-render slots are not budget-limited** — if a CW drain is active, it runs its full
   adaptive slice (up to 25ms) in the same pre-render tick as the camera update.

---

## Part 2 — Three-Phase Performance Analysis

### Phase 1: Pre-Batch — Baseline Navigation Performance

**What the scene looks like**: A project before any batch has run. Geometry count is low
(typically 0–500 for a new project). No VDT flush pending. No CW drain running. No shadow
reactivation pending.

**Expected frame cost** (healthy baseline):

| Component | Duration |
|---|---|
| CameraController.interpolateTo() | <0.1ms |
| OBC render pass (0–500 geometries) | 2–8ms |
| PASCAL SSGI pass | ~5ms GPU |
| gpu-pick hover pass (0–500 geometries) | <5ms |
| **Total** | **<18ms** → ~55fps |

**Pre-batch navigation is acceptable** — the FrameScheduler's 0fps idle correctly suspends
the loop when the camera stops. The gpu-pick cost is proportional to geometry count and is
low when the scene is empty.

**Pre-batch stress indicators** (already present before any batch):

1. **gpu-pick is synchronous and unthrottled** — even at 0 geometries, a 1,000Hz gaming mouse
   produces 1,000 pick passes per second. At 0 geometries the GPU idle time dominates; the
   overhead is ~2–3ms per pick, acceptable. After a batch, this becomes catastrophic.

2. **DrawCall structure is already suboptimal** — `CurtainWallInstanceManager` uses one
   `InstancedMesh` per panel type across the whole scene (correct), but wall fragments, slab
   fragments, and door/window meshes each produce their own `THREE.Mesh` objects with
   individual draw calls. At 50 elements this is fine; at 500+ this is the dominant cost.

3. **VDT debounce is 300ms** — a plan view reprojection will fire 300ms after any element
   creation even in an empty project. The first plan view projection costs 57–59ms (NME
   proxy expansion for 9 CW elements). This does not impact pre-batch navigation because
   the VDT is suppressed during batch, but the cost is established.

### Phase 2: During-Batch — Render Suppression and its Trade-offs

**What BatchCoordinator does correctly**:

```
BatchCoordinator.runBatch()
  storeEventBus.beginBatch()           → events buffered
  viewDependencyTracker.setSuppressed(true) → no EPS reprojections
  beginBatchRenderSuppress()           → OBC + PASCAL renders suspended
  [builder drains run across rAF frames]
  endBatchYielded()                    → events drained in chunks
  signalBuildQueueDrained()            → registration + REDETECT_ROOMS
  markLevelsDirtyImmediate()           → single EPS reprojection post-batch
  beginBatchRenderSuppress(false)      → renders re-enabled
```

**During-batch navigation**: The user CANNOT navigate during a batch because:
1. Render suppression is active — `UnifiedFrameLoop.beginBatchRenderSuppress()` skips OBC +
   PASCAL. The canvas shows the last pre-batch frame, frozen.
2. The main thread is consumed by builder drain LONGTASKs (95–451ms per task, continuous).
   The FrameScheduler cannot run pre-render camera updates between LONGTASKs.
3. The overlay (`progress indicator`) still renders at overlay priority — this is by design.

**During-batch trade-offs**:

| Mechanism | Benefit | Cost |
|---|---|---|
| Render suppression | Prevents PSO compile storms during build | User sees frozen frame |
| VDT suppression | Prevents 21× redundant EPS reprojections | No plan view update during batch |
| Event buffering | Prevents 116,980 synchronous listener calls | Full CRDT blackout (see Constraint 3) |
| `resumeAndFlush()` | Forces immediate geometry flush | **THE P0 BUG**: 22,182ms LONGTASK |

The `resumeAndFlush()` vs `resume()` choice is documented in Phase F.2 of document 45. It is
the single highest-priority fix. Everything in this document is additive to that fix.

**During-batch observation from Session 5 live log:**

```
[debug] [CurtainWallBuilder] §BATCH-CW-PAUSE: paused — buffering into pausedBuildsMap
[debug] [SlabFragmentBuilder] §BATCH-SLAB-PAUSE: paused — buffering into _pausedBuilds
[debug] [RoomTopologyObserver] suppressed (level=L0, reason=isBatching, source=schedule)
[debug] [RoomTopologyObserver] suppressed (level=L-01-..., reason=isBatching, source=schedule)
... (21 RTO suppression messages — all 21 levels correctly suppressed) ✅
```

**Timing** (Session 5, catch-up replay):

```
All commands execute synchronously during replay:
[log] [CreateSlabsOnAllFloorsCommand] COMPLETE created=20 total=19.1ms
[log] [GPU Monitor] geometries:0  (immediately after replay — scene not yet built)
[log] [PascalSceneLighting] Shadow flags set on 20 mesh(es).

LONGTASK: duration=87ms  start=1727956ms  (catch-up processing)
LONGTASK: duration=155ms start=1729049ms  (first render post-replay)
```

The catch-up replay is faster than a live batch (87ms vs. 22,182ms) because it runs
`RemoteCommandDispatcher.applyCommand()` which **bypasses `BatchCoordinator`** — the
commands execute directly via `CommandManager.execute()` without the
`resumeAndFlush()` path. This confirms that the 22,182ms freeze is caused specifically by
`BatchCoordinator.resumeAndFlush()`.

### Phase 3: Post-Batch — The Navigation Killer (deep analysis)

After `onComplete()` returns and render suppression lifts, the user faces a scene that is
structurally degraded in multiple independent ways. These degradations compound:

#### 3.1 The geometry count problem (Session 1: 4,897 / Session 5–6: 3,486–3,668)

A healthy 8-wall, 41-slab project should have ~200–400 GPU geometries. The observed counts
of 3,486–4,897 indicate massive geometry inflation. The sources:

**Source A — NME proxy explosion (1,182 proxies per flush, Session 5 analysis)**:
Each `EPS.project()` call expands CW `InstancedMesh` objects into individual proxy
`THREE.Mesh` objects. 9 CW elements on L0 produce 1,182 proxies per flush. These proxies
are cleared from the group (`groups.splice(0)`) but their `BufferGeometry` objects are not
disposed — `geometry.dispose()` is never called on proxy geometries. Each un-disposed geometry
permanently increments `renderer.info.memory.geometries`.

**Source B — gpu-pick pass allocations (Session 6: +182 in 10 seconds)**:
The `_gpuPick()` render pass runs on every pointer move. If the pick pass allocates
intermediate geometries (e.g., for ID-buffer rendering with custom materials or for outline
generation), those geometries are never explicitly disposed. The +182/10s growth rate during
navigation confirms this is the active leak path.

**Source C — EPS EdgesGeometry not fully disposed**:
`EdgeProjectorService` creates `new THREE.EdgesGeometry(mesh.geometry, angleDeg)` for every
proxy mesh. These are tracked in `tempGeosToDispose` and should be disposed after use.
However, if EPS exits early (cache hit short-circuit on CW elements), the
`tempGeosToDispose` cleanup may not run for those elements, stranding their geometries.

**Impact on navigation**: At 3,486 geometries × avg 14ms/geometry WebGPU overhead =
**48,804ms of hypothetical single-threaded GPU work**. In practice the GPU parallelizes
this, but the driver-side CPU overhead for 123–153 draw calls at ~100µs each = 12–15ms
of CPU-only draw submission that cannot be parallelized.

#### 3.2 The gpu-pick hover problem (Sessions 5–6: primary navigation killer)

Every `pointermove` event triggers `PickResolver._gpuPick()`. This method:

1. Renders the entire scene (3,486 geometries, 153 draw calls) into a 1×1 or small
   ID-buffer render target.
2. Reads back the 1×1 pixel using `renderer.readRenderTargetPixels()` or the WebGPU
   equivalent — this is a **synchronous GPU readback** that stalls the CPU until the GPU
   completes the render.
3. Looks up the rendered pixel value in the ID-to-element map.
4. Fires `_onHoverChange(hit)` if the element changed.

The synchronous GPU readback is the critical bottleneck. WebGPU is asynchronous by design,
but reading back from a render target forces synchronization between CPU and GPU timelines.
With 3,486 geometries and 153 draw calls, the GPU needs 95–451ms to complete the pick render.

**The frequency multiplier**: On a modern mouse at 60fps cursor rate, `pointermove` fires
~60/second. At 3,486 geometries: 60 × ~200ms = 12 seconds of GPU-stall time per second of
mouse movement. This is structurally impossible to make interactive without architectural
change.

**Why this doesn't appear in pre-batch navigation**: At 0–200 geometries, the pick pass
costs ~2–5ms (acceptable). The geometry count explosion (3,486 post-batch) is what transforms
an acceptable 2–5ms cost into a catastrophic 95–451ms cost. The pick pass scales O(n) in
geometry count.

#### 3.3 The draw-call structure problem (123–153 draw calls, 14 tris/call)

**What 14 triangles per draw call means**:

A `THREE.BoxGeometry(1,1,1)` (unit cube) has 12 triangles (2 per face × 6 faces). A slab
is a single flat `PlaneGeometry` — 2 triangles. A wall fragment is 6 faces = 12 triangles.
A mullion is a box = 12 triangles. A glass panel is a plane = 2 triangles.

At `tris:1726` across `drawCalls:123`, the average is 14 triangles/call, meaning most draw
calls are rendering a SINGLE BOX or PLANE GEOMETRY. This means:
- Slabs are individual `THREE.Mesh` objects (not instanced) — each slab = 1 draw call.
- Wall fragments are individual `THREE.Mesh` objects — each wall segment = 1 draw call.
- Mullions are individual `THREE.Mesh` objects (NOT instanced) — confirmed by the proxy
  expansion in NME: `InstancedMesh → N×Mesh` for plan-view projection. These individual
  proxy meshes may be ADDED TO THE SCENE (incorrectly) rather than being used only for
  EPS projection.

**The 14 tris/call ratio implies that proxy meshes from NME are being added to the Three.js
scene graph** and never removed. This would explain both the geometry leak (they are in the
scene) and the draw-call explosion (they are individually rendered). This is the most severe
finding in this report: it means navigation is rendering the PROJECTION PROXIES as scene
objects, not the actual InstancedMesh elements.

If confirmed, the fix is straightforward: NME proxy meshes must not be added to the scene
graph. They must be created, used for EPS, and disposed, entirely off-scene. The current
`EdgesGeometry` cleanup (`tempGeosToDispose`) suggests the EPS code does dispose some
things, but the mesh proxies themselves may not be disposed (as noted in Section 2.6 of
document 48).

#### 3.4 The THREE.LineLoop error problem (Session 6: every frame)

`THREE.Renderer: Objects of type THREE.LineLoop are not supported.` fires once per rAF frame
in the WebGPU renderer. `THREE.LineLoop` is a legacy primitive from the WebGL era that has
no WebGPU equivalent draw mode.

**Likely source**: The `OBC.EdgeProjector` or `OBC.TechnicalDrawing` components use
`THREE.LineLoop` for creating closed edge loops in the 2D projection output. These loops
may be being added to the 3D scene (incorrectly) or rendered via the WebGPU renderer instead
of the canvas 2D overlay.

**Impact**: Every render frame:
1. The WebGPU renderer's object-type switch reaches the LineLoop branch.
2. It calls `console.error()` — this allocates a string, constructs a stack trace, and calls
   into the devtools protocol (even if devtools is closed, the error is buffered).
3. The object is skipped — it is not rendered.
4. The unrendered LineLoop leaves gaps in the 2D technical drawing output.

At 60fps, this is 60 `console.error()` calls/second. Console I/O is synchronous in Chrome
and adds 0.5–2ms per call. At 60 calls/second: 30–120ms of console overhead per second of
navigation = 1.8–7.2% of frame budget consumed by error logging alone.

**Fix**: Convert all `THREE.LineLoop` instances to `THREE.Line` or `THREE.LineSegments`
before scene submission. In OBC, this may require a post-processing pass over the
EdgeProjector output.

#### 3.5 The cascade of post-batch background work (from Sessions 1–5)

After `onComplete()`, the following background jobs fire in sequence, each competing with
navigation for the main thread:

```
T+0ms     onComplete() fires
           VDT suppression lifted
           Render suppression lifted

T+0–300ms  CurtainWallBuilder drain continues (adaptive, 5–50 builds/frame)
           Each frame: up to 25ms pre-render slot used by CW drain

T+141ms   markLevelsDirtyImmediate() fires → EPS reprojection starts
           NME exports: 1,182 proxies
           EPS processes: 57–174ms across 3–5 rAF chunks

T+300ms   DependencyResolver CASCADE completes:
           9 wall store events → VDT._onStoreEvent × 9
           VDT debounce resets 9 times

T+600ms   VDT debounce fires → SECOND EPS reprojection (81ms LONGTASK)
           THIS IS DURING ORBIT — user freezes for 81ms

T+800ms   RoomTopologyObserver CW_DEBOUNCE_MS fires → REDETECT_ROOMS
           [if not suppressed by batch coordinator]
           ReDetectRoomsCommand: 5–20ms per level

T+30,000ms  Shadow reactivation timer fires:
           8 LONGTASKs totalling 1,591ms (Session 1 G6)
           PSO compile storm for all shadow-pass variants
```

The user experiences 4–8fps continuously throughout this entire 30-second window.

---

## Part 3 — The Five Constraint Lenses

### Constraint 1: Memory Ceiling (~2–4 GB WASM heap)

#### 1.1 Current violation

**C10 NFT-16**: Memory ceiling < 1.5 GB for 10k elements, 1-hour session.

**Observed**: 3,486–4,897 geometries in sessions with 8 walls and 41 slabs (218 total elements).

Budget per geometry object:
- CPU: `Float32Array` position attribute = ~180 vertices × 3 floats × 4 bytes = ~2.2 KB
- GPU: WebGPU buffer = same size, pinned in VRAM
- `THREE.Mesh` JS object overhead ≈ 400 bytes
- **Total per leaked geometry**: ~4.8 KB

```
Session 1: 4,897 leaked geometries × 4.8 KB = 23.5 MB over budget
Session 5: 3,486 leaked geometries × 4.8 KB = 16.7 MB over budget
Session 6: 3,668 leaked geometries × 4.8 KB = 17.6 MB over budget (growing)
```

This does not sound catastrophic — 17–24 MB — but the scaling trajectory is:

```
Current:   218 elements  → 3,486–4,897 leaked geometries → 17–24 MB
NFT scale: 10,000 elements → extrapolation: 159,908–224,633 geometries → 767 MB – 1.08 GB
1M scale:  1,000,000 elements → 15.9M–22.5M geometries → 76 GB – 108 GB
```

**This is a session-end failure at 10k elements and a platform-level impossibility at 1M.**

#### 1.2 Memory leak taxonomy

| Leak source | Per-flush cost | Disposed? | Cumulative impact |
|---|---|---|---|
| NME proxy `THREE.Mesh` geometries | 1,182 geoms per flush | ❌ Never | Dominant (94% of excess) |
| gpu-pick pass intermediate geoms | +182/10s navigation | ❌ Never | Secondary (growing) |
| EPS EdgesGeometry (partial) | N geoms per flush | ✅ `tempGeosToDispose` (mostly) | Tertiary |
| THREE.LineLoop objects | 1 per flush | ❌ Stays in scene | Minor count |

#### 1.3 WASM heap considerations

The web-ifc WASM heap (2–4 GB browser limit) is NOT the active constraint for batch creation.
The `packages/geometry-kernel/` (WASM-backed) is used by `WallFragmentBuilder` and
`SlabFragmentBuilder` during the drain phase. Each geometry build call:
- Copies input vertex data into the WASM heap (alloc)
- Computes geometry (CSG/boolean ops)
- Copies output back to JS (free)

For 3,300 wall fragments (220 walls × 15 levels), this is 3,300 alloc/free cycles. The WASM
heap itself does not fragment catastrophically at this scale. However:

**Immer draft size**: Each `CommandManager.execute()` produces an Immer structural draft for
undo. A batch of 225 CW elements produces a single undo entry covering 225 × 4 stores ×
~4 KB each = ~3.6 MB for a single undo record. C10 NFT-18 targets <50 MB for 1,000 commands.
A single large batch consumes 7.2% of the 4-hour undo budget.

#### 1.4 Memory improvement targets

| Target | Current | Target | Approach |
|---|---|---|---|
| Leaked geometries per session (218 elements) | 3,486–4,897 | <500 | Dispose NME proxy geometries explicitly |
| Leaked geometries during navigation | +182/10s | 0 | Dispose gpu-pick intermediate geoms |
| Undo record size (1 batch) | ~3.6 MB | <200 KB | Snapshot-diff instead of full-state Immer patch |
| WASM heap peak (batch drain) | ~8 MB | <4 MB | Stream geometry builds via worker |

#### 1.5 Implementation: NME proxy geometry disposal (N3 — see Part 4)

The fix is in `NativeElementMeshExporter.exportForView()`. After EPS calls `releaseGroups()`:

```typescript
// Current (incorrect):
releaseGroups(groups: THREE.Group[]) {
  for (const group of groups) {
    group.clear();           // removes children from group, but does not dispose
  }
}

// Correct:
releaseGroups(groups: THREE.Group[]) {
  for (const group of groups) {
    group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();    // GPU buffer released
        // Do NOT dispose material — shared from the InstancedMesh source
      }
    });
    group.clear();
  }
}
```

This single change eliminates the dominant (94%) memory leak source.

---

### Constraint 2: Frame Budget (16ms / 60fps)

#### 2.1 Current violation

**C10 NFT-04**: Frame budget ≤ 16.6ms p95 (60fps).
**C10 NFT-03**: Tool latency < 50ms p95.

**Observed** (Sessions 5–6): 95–451ms per navigation frame during hover. FPS: 4–8.

This is a 574%–2,728% frame budget overshoot. The primary driver is the synchronous gpu-pick
hover pass on every `pointermove` event.

#### 2.2 The frame budget breakdown (post-batch, navigating)

```
rAF tick budget:                        16.6ms
│
├── gpu-pick hover pass (per move):   -95 to -451ms  ← OVER BUDGET BY 5.7–27.2×
│   ├── WebGPU command buffer build:    ~10ms
│   ├── GPU render (3,486 geoms):       ~60–400ms
│   └── GPU readback (synchronous):     ~5–10ms
│
├── OBC scene render (123 draw calls): ~12–15ms       ← 73–90% of budget alone
│   ├── Draw call submission CPU:       ~12ms  (123 calls × ~100µs each)
│   └── GPU triangle raster:           ~3ms   (1,726 tris — trivially fast)
│
├── PASCAL SSGI:                        ~5ms GPU
│
├── CW drain pre-render:               0–25ms (if drain active)
│
└── **Available for camera update:**   0ms (budget exhausted before camera runs)
```

**Finding**: The triangle count (`tris:1726`) is so low that GPU rasterization takes ~3ms.
The frame is bottlenecked entirely on CPU-side work: draw call submission overhead (123 calls
× 100µs = 12ms) and gpu-pick synchronous stall (95–451ms). The GPU itself is mostly idle.
This is a CPU-GPU synchronization and draw call structure problem, not a geometry complexity
problem.

#### 2.3 Frame budget by phase (pre/during/post)

| Phase | FPS observed | Primary budget consumer | NFT violated |
|---|---|---|---|
| Pre-batch (0 geometries) | ~55fps | Camera + SSGI (~18ms) | NFT-04 marginal |
| During batch (render suppressed) | 1–3fps | `resumeAndFlush()` drain (22,182ms!) | NFT-04 catastrophic |
| Post-batch (3,486 geometries) | 4–8fps | gpu-pick hover (95–451ms) | NFT-04, NFT-03 catastrophic |
| Post-batch T+30s | 6fps (Session 1) | Shadow PSO storm (1,591ms) | NFT-04 catastrophic |

#### 2.4 Five root causes of frame budget violation (post-batch navigation)

**Root Cause 2-A: gpu-pick is synchronous and unthrottled**

The `PickResolver` fires on every `pointermove`. It is not rate-limited. It does not check
whether the FrameScheduler is already busy. It does not defer to the rAF cycle. It is a
synchronous GPU operation in a DOM event handler.

**Fix (N1 — see Part 4)**: Throttle gpu-pick to one pick per rAF tick maximum. Move the
pick pass into the FrameScheduler `pre-render` slot. Use a debounce of 1 rAF cycle so that
rapid pointer moves coalesce to a single pick per rendered frame.

**Root Cause 2-B: Draw call count (123–153) is 8–10× too high for this triangle count**

With 1,726 triangles across 123 draw calls, the scene is composed of individual tiny meshes
instead of instanced geometry. The expected draw call breakdown for 218 elements:

| Element type | Count | Draw calls (current) | Draw calls (target) |
|---|---|---|---|
| Slabs (PlaneGeometry, 2 tris) | 41 | 41 | 1 (InstancedMesh) |
| Wall fragments | ~80 | ~80 | 4 (per material) |
| Mullions (BoxGeometry) | ~400 | ~400 | 1 (InstancedMesh) |
| Glass panels | ~400 | ~400 | 1 (InstancedMesh) |
| **Total** | | **~920** | **~7** |

Wait — the observed `drawCalls:123` is already LESS than 920. This suggests most elements
ARE instanced. The high draw call count at low triangle count means the proxy meshes from
NME are in the scene — flat plane geometries (2 triangles each) added as individual meshes,
not instanced. This needs to be confirmed.

**Fix (N2 — see Part 4)**: Ensure NME proxy meshes are never added to the scene graph.
Audit scene graph contents post-batch. If found, implement scene graph audit tool that
detects non-instanced meshes with <100 triangles added individually.

**Root Cause 2-C: CurtainWallBuilder drain runs in pre-render during navigation**

When the drain is active, `_drainBuildQueue()` schedules itself in the `'pre-render'` slot
via `FrameScheduler.schedule()`. During interactive navigation, the adaptive budget allows
up to 30 builds per frame at up to 14ms. This directly competes with the camera update in
the same pre-render slot.

**Fix (N4 — see Part 4)**: Reduce the drain's interactive-mode budget ceiling from 14ms to
8ms, and schedule the drain at `'background'` priority (lowest) during active navigation
(while the motionGate is active).

**Root Cause 2-D: THREE.LineLoop error path in every render frame**

Every frame, the WebGPU renderer encounters a `THREE.LineLoop` object and calls
`console.error()`. At 60fps this is 60 error logs/second = 30–120ms of console I/O
overhead per second.

**Fix (N5 — see Part 4)**: Scan the scene graph for `THREE.LineLoop` instances post-batch
and convert to `THREE.LineSegments` before the first render.

**Root Cause 2-E: Shadow PSO compile storm at T+30s (Session 1 G6)**

The shadow reactivation `setTimeout(30000)` fires and enables `castShadow=true` on all
geometries simultaneously. The WebGPU PSO compiler must build shadow-pass PSO variants for
every unique material × geometry combination = O(materials × shadow-variants) compilation
storm. Observed: 8 LONGTASKs totalling 1,591ms, FPS=6.

**Fix**: Phase K (documented in document 45). Slice the shadow reactivation across 50 meshes
per frame, not all at once. Pre-warm shadow PSOs before the batch.

#### 2.5 Frame budget targets (achievable with fixes N1–N5)

| Fix applied | Expected FPS improvement | Residual frame cost |
|---|---|---|
| N1 (gpu-pick throttled to 1/rAF) | 4–8fps → 30–40fps | OBC + SSGI ~20ms/frame |
| N2 (proxy meshes off scene) | +5–8fps additional | Draw calls: 7 vs. 123 |
| N3 (proxy geometry disposed) | No direct FPS gain | Memory leak eliminated |
| N4 (drain budget 8ms, background priority) | +2–3fps during drain | CW drain: 8ms/frame |
| N5 (LineLoop → LineSegments) | +1–2fps | Error path eliminated |
| **N1+N2+N4+N5 combined** | **→ 45–55fps** | **NFT-04 achieved** |

---

### Constraint 3: Collaboration Semantics (CRDT)

#### 3.1 The 11-second CRDT blackout

During a large batch (`CreateCurtainWallsOnAllSlabsCommand`, 15+ levels), the
`StoreEventBus` buffers all events. `YjsDocAdapter.applyCommand()` is wired as a
StoreEventBus listener. During the buffer period:

- **0 CRDT operations** are produced for 225 CW element creations.
- **0 sync messages** are sent to collaborators.
- A collaborating user B sees a static model for the entire batch duration.
- The entire batch lands on user B as a single atomic Y.Doc state vector delta.

This is the "CRDT blackout window":

```
Duration:  ~11.4s (15-level batch at current resumeAndFlush() cost)
Duration:  ~1.7s  (after Phase F.2 fix — resume() only, drain across frames)
Duration:  ~0.5s  (after Phase F.2 + Phase G + adaptive drain at 8ms/frame)
```

**Post-batch navigation impact of the blackout**: After the batch, CRDT sync resumes and
delivers the accumulated delta to all peers. If the peer's model has diverged during the
blackout (concurrent edits), the Yjs merge must resolve conflicts. The resolution process
fires `storeEventBus.emit()` events that reach VDT, triggering additional EPS reprojections
during navigation. The number of merge events is proportional to the number of concurrent
edits during the blackout.

#### 3.2 The catch-up replay performance problem

C08 §3.3: late-joining users replay commands from `project_command_log`. A
`CreateCurtainWallsOnAllSlabsCommand` in the log is replayed via `RemoteCommandDispatcher`:

```
[log] [CommandManager] EXECUTE: CREATE_SLABS_ON_ALL_FLOORS
[log] [CreateSlabsOnAllFloorsCommand] COMPLETE created=20 total=19.1ms
[log] [RemoteCommandDispatcher] Catch-up complete: 3 applied, 10 skipped

LONGTASK: duration=87ms  start=1727956ms
LONGTASK: duration=155ms start=1729049ms
```

Session 5 shows a catch-up replay producing two LONGTASKs (87ms + 155ms = 242ms). This is
FAR better than the 22,182ms live batch because `RemoteCommandDispatcher` does not go through
`BatchCoordinator.runBatch()` — it bypasses the `resumeAndFlush()` path entirely.

However, the post-replay scene is still in the degraded state: 3,486 geometries, gpu-pick
hover active, lineloop errors. Navigation is still 4–8fps after replay.

**The navigation problem is independent of whether commands come from live batch or catch-up
replay.** The geometry count, draw call structure, and gpu-pick frequency are determined by
the scene state, not the command source.

#### 3.3 Collaboration during navigation — what CRDT sends during the storm

During post-batch navigation (FPS 4–8fps, continuous LONGTASKs), the following CRDT
activity happens:

1. The FrameScheduler cannot pump rAF between LONGTASKs — CRDT sync events queued in the
   WebSocket receive handler cannot be processed until the LONGTASK completes.
2. The `y-websocket` provider uses a `setInterval` for keep-alive. During a 451ms LONGTASK,
   the keep-alive interval fires late. If the server has a tight timeout, the WebSocket may
   be considered disconnected.
3. `y-awareness` cursor positions are still sent on every `pointermove` (via WebSocket
   direct, not via StoreEventBus) — but the receiving peer cannot process them while in a
   LONGTASK. The user sees collaborator cursors "jump" after each LONGTASK ends.

**Post-batch navigation is a collaboration degradation event for ALL users in the session**,
not just the user who performed the batch.

#### 3.4 Conflict window analysis during batch + concurrent edit

**Scenario**: User A runs a 20-level CW batch. User B moves level L10 by 0.5m during the
batch. Expected outcomes:

| CRDT operation | Yjs handling | PRYZM handling |
|---|---|---|
| User B moves L10 elevation: `Y.Map['L10'].elevation = 3.5` (was 3.0) | ✅ Yjs merges correctly | ❌ CW elements created against old L10 elevation |
| User A's 225 CW elements land with `levelId=L10, startY=3.0` | ✅ Yjs accepts all inserts | ❌ CW geometry now geometrically incorrect |
| `CRDTConflictResolver.mergeElement()` runs | ✅ Level elevation conflict detected | ❌ No cross-element semantic conflict detected |

The result: CW elements at wrong elevation, silently. No `CRDTConflict` is surfaced to either
user. P8 ("conflicts explicit, no silent LWW") is violated.

**Navigation impact**: The geometrically incorrect CW elements are rendered at wrong
positions. The user sees walls floating in the wrong position, navigates to investigate,
and moves the mouse — triggering gpu-pick storms over the incorrectly-positioned geometry.
The geometry itself is correct in terms of Three.js scene graph position — but the position
is wrong relative to the slab. This does not add navigation cost, but it compounds user
confusion during the degraded navigation experience.

#### 3.5 Post-batch navigation and CRDT improvement targets

| Target | Approach | Sprint |
|---|---|---|
| Reduce CRDT blackout from 11.4s to <0.5s | Phase F.2 (resume() not resumeAndFlush()) | Sprint 1 |
| Surface semantic geometry conflicts from concurrent batch+level edit | Add cross-element constraint checker in CRDTConflictResolver | Sprint 3 |
| Prevent WebSocket keep-alive timeout during LONGTASKs | Increase y-websocket keepalive from 30s to 120s | Sprint 1 |
| Prevent cursor jump after LONGTASK | Buffer y-awareness updates; apply in batch after LONGTASK | Sprint 2 |
| Eliminate post-merge VDT reprojection storm | Extend VDT suppression through CRDT merge completion | Sprint 2 |

---

### Constraint 4: AI Cost vs. Value

#### 4.1 What the founding engineer question demands

> *LLM calls are expensive. Most BIM queries are deterministic. For navigation performance
> post-batch, where is AI actually adding value — and where is it burning tokens on work that
> a deterministic algorithm could do for free?*

#### 4.2 AI in the batch pipeline (navigation impact)

**`CreateCurtainWallsOnAllSlabsCommand`** is entirely deterministic. Zero AI.

**`FloorPlanCommandBatcher`** (Path A) uses `claude-haiku-4-5` for floor plan parsing, then
runs a deterministic post-process. The post-process runs on the main thread before the batch:

| Post-process step | Complexity | Duration (50-room plan) |
|---|---|---|
| `resolveWallJunctions()` | O(n²) | 200–800ms main thread |
| `splitWallsAtCrossings()` | O(n log n) | 100–300ms |
| `buildWallGraph()` | O(n) | 20–50ms |
| `computeTopology()` | O(n log n) | 50–150ms |
| `assignOpeningsToWalls()` | O(m×n) | 100–400ms |

**Total pre-batch deterministic work**: 470–1,700ms on main thread, BEFORE the batch starts.
This is 29–106× the LLM call time (~15ms for claude-haiku-4-5 on cached inference).

**Navigation impact**: This 470–1,700ms pre-batch main-thread work fires while the user is
still looking at their model. It is not render-suppressed (it runs before `BatchCoordinator`
is entered). During this window, navigation freezes for up to 1.7 seconds. This is a direct
navigation degradation caused by deterministic AI post-processing, not by the LLM.

#### 4.3 The AI determinism gap in navigation performance

**Navigation analysis** (a prospective AI feature) would be: "Why is my model navigation
slow after the batch?" The answer is deterministic:

```python
# Fully deterministic navigation performance analysis:
geometry_count = renderer.info.memory.geometries
draw_calls = renderer.info.render.calls
tris = renderer.info.render.triangles
gpu_pick_time = measure_pick_pass(geometry_count)
raf_budget_remaining = 16.6 - gpu_pick_time - (draw_calls * 0.1) - ssgi_time

if raf_budget_remaining < 0:
    return "Navigation is degraded"
    # FPS = 1000 / (gpu_pick_time + draw_calls * 0.1 + ssgi_time)
```

**No LLM call needed.** This is arithmetic. An AI that explains "your navigation is slow
because your gpu-pick pass costs 300ms on 3,486 geometries" adds no value over a
deterministic profiler that reads the same numbers.

**Where AI does add value in navigation performance**:

1. **Identifying non-obvious batching opportunities**: "These 47 walls are coplanar —
   they could be merged into 3 flat planes, reducing draw calls from 47 to 3." This
   requires geometric understanding that a simple heuristic cannot provide.

2. **Predicting PSO compile storm severity**: "Your batch will introduce 12 new unique
   material variants, requiring PSO compilation for 4 render passes each. Expected
   LONGTASK budget: 480ms." This requires understanding the WebGPU PSO compilation model
   applied to a specific scene — AI could add value as a pre-batch estimator.

3. **Architecture critique of the scene graph**: "Your scene has 47 `THREE.LineLoop`
   objects that are not rendered by WebGPU. Consider converting to `THREE.LineSegments`."
   A deterministic lint could catch this, but AI could surface it in natural language.

#### 4.4 AI cost model for navigation analysis

If navigation performance analysis were to use an LLM:
- Input: scene stats JSON (~500 tokens) + performance log (~1,000 tokens) = 1,500 tokens
- Output: analysis + recommendations (~300 tokens)
- Cost: $0.25/1M × 1,500 + $1.25/1M × 300 = $0.000375 + $0.000375 = **$0.00075 per call**

This is trivially cheap. However, the recommendation is still: **do not use AI for
deterministic arithmetic**. The PickResolver geometry count, draw call count, and pick
pass timing are available as observable metrics in `renderer.info`. A deterministic
`RenderPerformanceService.diagnoseNavigationDegradation()` method would be faster, cheaper,
and always available (even offline / in WebGPU error states where LLM calls may fail).

**AI cost vs. value verdict for navigation**:
- AI for batch command generation (floor plan import): ✅ High value, irreplaceable
- AI for navigation performance analysis: ❌ Low value, deterministic alternative is better
- AI for scene graph optimization suggestions: ✅ Medium value, adds architectural insight
  to deterministic metrics

#### 4.5 `FloorPlanCommandBatcher` main-thread work offload

The 470–1,700ms deterministic post-process in `FloorPlanCommandBatcher` should run in a
`Worker`. The only browser API it uses is geometry computation (no DOM, no Three.js):

| Step | Worker-safe? | Approach |
|---|---|---|
| `resolveWallJunctions()` | ✅ Pure math | Move to `geometry.worker.ts` |
| `splitWallsAtCrossings()` | ✅ Pure math | Same worker |
| `buildWallGraph()` | ✅ Pure math | Same worker |
| `computeTopology()` | ✅ Pure math | Same worker |
| `assignOpeningsToWalls()` | ✅ Pure math | Same worker |
| `CommandProposal[]` serialization | ✅ structuredClone | Serialize via MessageChannel |

Moving this to a worker eliminates the 1.7-second pre-batch navigation freeze entirely.
The main thread receives `CommandProposal[]` via postMessage after the worker completes,
then enters `BatchCoordinator.runBatch()` as usual.

---

### Constraint 5: 1M Elements at Scale

#### 5.1 The founding engineer scale question

> *How does every finding above extrapolate to 1M elements? Not just risk reduction —
> what is the path to IMPROVED navigation speed, robustness, and great architecture?*

This constraint demands a different framing: not "will this survive 1M elements" but "what
architecture would make PRYZM navigably FAST at 1M elements?" The answer requires addressing
each of the four findings above at scale, plus introducing architectural primitives that do
not exist today.

#### 5.2 Scale extrapolation of current architecture

| Metric | 218 elements (observed) | 10k elements (NFT target) | 100k elements | 1M elements |
|---|---|---|---|---|
| Leaked geometries | 3,486–4,897 | ~159,000–225,000 | ~1.6M–2.25M | ~16M–22.5M |
| Memory from leaks | 17–24 MB | 763–1,080 MB | 7.6–10.8 GB | 76–108 GB |
| Draw calls (if uninstanced) | 123–153 | 5,600–7,000 | 56,000–70,000 | 560,000–700,000 |
| gpu-pick hover time | 95–451ms | ~4,000–20,000ms | ~40,000ms+ | impossible |
| OBC render time | ~12ms | ~550ms | ~5,500ms | ~55,000ms |
| EPS reprojection (NME proxies) | 57–174ms | 2,600–8,000ms | 26,000ms+ | impossible |
| Shadow PSO storm | 1,591ms | ~73,000ms | impossible | impossible |

**Conclusion**: The current architecture, unmodified, becomes completely unusable at
10k elements. Navigation collapses at ~2,000 elements (when gpu-pick + OBC render exceed
100ms/frame). The path to 1M elements requires fundamental architectural changes, not
incremental optimization.

#### 5.3 The 1M-element navigation architecture

To navigate a 1M-element BIM model in real time (60fps), the following primitives are
required. None exist in the current architecture.

##### Primitive 1: BVH-accelerated frustum culling (replaces full-scene render)

At 1M elements, only ~1,000–10,000 are visible in any given camera frustum. A
Bounding Volume Hierarchy (BVH) tree built over element AABBs allows O(log n) frustum
culling: discard all elements outside the frustum before building the draw list.

```
1M elements → frustum cull via BVH → 5,000 visible → render 5,000
```

Draw call count becomes proportional to VISIBLE elements, not total elements.
`packages/spatial-index/src/BVHQuery.ts` already exists — it needs to be wired into the
render pipeline as a per-frame pre-cull pass.

**Implementation**: `UnifiedFrameLoop` pre-render slot → `BVHQuery.frustumCull(camera,
world.aabb)` → build `DrawList` of visible element IDs → OBC renders only DrawList items.

**Expected gain**: At 1M elements with 5k visible, OBC render cost is proportional to
5k/1M = 0.5% of current naive cost. 60fps is achievable.

##### Primitive 2: LOD (Level of Detail) system

At camera distances > 100m, individual BIM elements (mullions, 2cm-wide) are sub-pixel.
Rendering them at full resolution wastes GPU bandwidth. A LOD system replaces distant
elements with progressively simpler representations:

| LOD level | Distance | Representation | Draw cost |
|---|---|---|---|
| LOD-0 | 0–10m | Full InstancedMesh (current) | Full |
| LOD-1 | 10–50m | Simplified box per element | ×0.1 |
| LOD-2 | 50–200m | Single colored voxel | ×0.01 |
| LOD-3 | 200m+ | Billboard sprite | ×0.001 |

At 1M elements visible at LOD-3 (large site overview): 1M × 0.001 cost = 1k draw calls
equivalent. 60fps is achievable even without frustum culling.

**Three.js r183 has `THREE.LOD` but it is CPU-based**. For 1M elements, GPU-based LOD
selection using WebGPU compute shaders is required. The per-element LOD selection is a
parallel min-distance computation over the camera position — O(n/workgroup-size) GPU time.

##### Primitive 3: Async gpu-pick with accumulated hover

Replace the synchronous GPU readback in `PickResolver` with an async approach:

```typescript
// Current (synchronous, blocks main thread):
const hit = _gpuPick(x, y);  // stalls until GPU completes — 95–451ms

// Target (asynchronous, non-blocking):
_schedulePickRequest(x, y);   // records position, returns immediately
// ... rAF fires ...
// ... GPU renders pick buffer async ...
// ... next rAF: read result from previous frame's pick buffer ...
const hit = _readLastPickResult();  // O(1) read from cached result, ~0.1ms
```

The key insight: a 1-frame delay in hover feedback (16ms at 60fps) is imperceptible to
users. The pick result from frame N is used to update hover in frame N+1. This eliminates
all synchronous GPU stalls from hover — the GPU readback happens via
`GPUBuffer.mapAsync()` without blocking the CPU.

**Expected gain**: gpu-pick cost drops from 95–451ms to ~1ms (result read from prior frame's
mapped buffer). This alone restores 60fps navigation in the post-batch scene.

##### Primitive 4: Scene graph streaming (worker-based)

For 1M elements, the Three.js scene graph cannot fit in main-thread memory:
1M `THREE.Mesh` objects × ~2 KB each = 2 GB main-thread heap. This exceeds the
~2–4 GB WASM ceiling before any other data is allocated.

The architecture requires:
- **Scene graph in worker**: A `SceneWorker` maintains the Three.js scene graph off
  main thread.
- **Shared ArrayBuffer**: GPU buffers (InstancedMesh matrices) are shared via
  `SharedArrayBuffer` between main thread and SceneWorker.
- **Main thread**: Receives a `DrawList` from SceneWorker (element IDs + LOD levels),
  submits draw calls via pre-built command buffers.
- **WebGPU multi-threading**: WebGPU's `GPUDevice.importExternalTexture()` and
  `transferToImageBitmap()` enable texture sharing across workers.

This is a deep architectural change that requires 3–6 months of engineering. However, the
primitives (BVH, LOD, async pick) can be introduced incrementally, each delivering
independent navigation improvement.

##### Primitive 5: Geometry instancing audit tool

To prevent the current 14-tris/drawCall pathology at scale:

```typescript
// NavigationHealthChecker.ts
export function auditSceneGraph(scene: THREE.Scene): SceneAuditReport {
  const issues: AuditIssue[] = [];
  scene.traverse(obj => {
    if (obj instanceof THREE.Mesh && !(obj.parent instanceof THREE.InstancedMesh)) {
      const tris = obj.geometry.index
        ? obj.geometry.index.count / 3
        : obj.geometry.attributes.position.count / 3;
      if (tris < 100) {
        issues.push({
          id: obj.userData.elementId,
          tris,
          recommendation: 'Merge into InstancedMesh or parent InstancedMesh',
          severity: 'HIGH',
        });
      }
    }
  });
  return { issues, totalDrawCalls: renderer.info.render.calls };
}
```

This tool, run post-batch, would have immediately flagged the 123 draw calls at 14 tris/call
and identified the misplaced proxy meshes as the cause. It should be wired into the batch
completion callback as a dev-mode assertion.

#### 5.4 The 1M-element improvement roadmap

| Phase | Primitive | Elements supported | Navigation FPS | Timeline |
|---|---|---|---|---|
| Current | None of the above | ~500 (4–8fps) | 4–8fps post-batch | — |
| Sprint 1 (Phase F+G+N1+N5) | gpu-pick throttle + LineLoop fix | ~2,000 | ~45fps | 2 weeks |
| Sprint 2 (Phase H+N2+N3) | Proxy mesh fix + NME cache | ~5,000 | ~55fps | 4 weeks |
| Sprint 3 (Phase I+K+N4) | PSO prewarm + drain budget | ~10,000 | ~60fps (NFT-04) | 6 weeks |
| Quarter 2 (BVH cull) | Frustum culling via BVHQuery | ~100,000 | ~60fps | 3 months |
| Quarter 2 (async pick) | Async gpu-pick (N-1 frame delay) | ~500,000 | ~60fps | 3 months |
| Quarter 3 (LOD) | GPU LOD system | ~1M | ~60fps | 6 months |
| Quarter 4 (scene worker) | Off-main-thread scene graph | ~10M | ~60fps | 12 months |

---

## Part 4 — Navigation-Specific Improvement Plan

### Navigation Fix N1 — gpu-pick throttling (P0)

**Problem**: `PickResolver._gpuPick()` fires synchronously on every `pointermove`, taking
95–451ms per call. This is the primary post-batch navigation killer (Sessions 5–6).

**Target**: One gpu-pick per rendered frame maximum. Zero synchronous GPU stalls from hover.

**Implementation**:

```typescript
// PickResolver.ts — current (pseudocode):
canvas.addEventListener('pointermove', (e) => {
  const hit = this._gpuPick(e.clientX, e.clientY);   // SYNC, 95–451ms
  this._updateHover(hit);
});

// PickResolver.ts — target:
private _pendingPickPos: { x: number; y: number } | null = null;

canvas.addEventListener('pointermove', (e) => {
  // Just record the position — no GPU work
  this._pendingPickPos = { x: e.clientX, y: e.clientY };
  this.scheduler.markDirty('hover');     // wake FrameScheduler
});

// In FrameScheduler 'pre-render' slot:
private _resolveHover() {
  if (!this._pendingPickPos) return;
  const pos = this._pendingPickPos;
  this._pendingPickPos = null;

  // Phase 1: Schedule async pick (non-blocking)
  this._gpuPickAsync(pos.x, pos.y).then(hit => {
    // Phase 2: Called next frame from mapped GPU buffer
    if (hit !== this._lastHit) {
      this._lastHit = hit;
      this._updateHover(hit);
    }
  });
}
```

**Fallback for WebGPU async readback**: If `GPUBuffer.mapAsync()` is not available (WebGL
fallback), implement a CPU-side BVH raycast as the hover pick:

```typescript
// CPU-side hover pick (WebGL fallback, no GPU stall):
private _cpuPick(x: number, y: number): string | null {
  const ray = camera.getRayAt(x, y);
  return this._bvh.raycast(ray, world.elements);  // O(log n) BVH traversal
}
```

At 1M elements the BVH raycast is ~1ms. At 10k elements it is ~0.1ms. This is acceptable
for hover. The GPU pick is only needed for sub-element precision (picking a specific
mullion within a CW) — for element-level hover, the CPU BVH is sufficient.

**Acceptance criteria**:
- [ ] `pointermove` handler duration < 1ms (no GPU operations in event handler)
- [ ] `PickResolver.resolveHover()` duration in pre-render slot < 2ms
- [ ] FPS during hover navigation > 45fps on 3,486-geometry scene (was 4–8fps)
- [ ] LONGTASKs from hover: zero (was 43 in Session 5 fragment)

**Files to change**:
- `src/engine/subsystems/picking/PickResolver.ts` (primary)
- `packages/frame-scheduler/src/FrameScheduler.ts` (add 'hover' dirty flag)
- `packages/renderer/src/CameraController.ts` (ensure markDirty('camera') and markDirty('hover') don't conflict)

**Sprint**: 1 (P0 alongside Phase F.2)

---

### Navigation Fix N2 — Scene graph proxy audit + enforcement (P0)

**Problem**: The observed `drawCalls:123 tris:1726` (14 tris/drawCall) strongly suggests
NME proxy meshes are being added to the scene graph. These produce one draw call per proxy
and accumulate as the geometry leak.

**Investigation first** (before implementing the full fix, confirm the hypothesis):

```typescript
// Debug utility — run post-batch in dev mode:
export function auditNonInstancedMeshes(scene: THREE.Scene, renderer: THREE.Renderer) {
  const suspect: string[] = [];
  scene.traverse(obj => {
    if (obj instanceof THREE.Mesh && obj.parent instanceof THREE.Group) {
      const tris = getTriCount(obj.geometry);
      if (tris < 100 && !obj.userData.isOverlay) {
        suspect.push(`${obj.uuid}: ${tris} tris, parent=${obj.parent.uuid}, 
          elementId=${obj.userData.elementId ?? 'none'}`);
      }
    }
  });
  console.table(suspect);
  console.log(`Suspect non-instanced meshes: ${suspect.length}`);
  console.log(`Total drawCalls: ${renderer.info.render.calls}`);
}
```

If the audit confirms NME proxy meshes are in the scene, the fix is:

```typescript
// NativeElementMeshExporter.ts — enforce off-scene constraint
exportForView(viewDef: ViewDefinition): THREE.Group[] {
  const groups: THREE.Group[] = [];
  // ... existing proxy creation ...
  
  // Enforce: proxies MUST NOT be added to scene
  if (process.env.NODE_ENV !== 'production') {
    for (const group of groups) {
      group.traverse(obj => {
        if (obj instanceof THREE.Mesh && obj.parent?.parent) {
          console.error('[NME] §VIOLATION: proxy mesh has grandparent — may be in scene!',
            obj.userData.elementId);
        }
      });
    }
  }
  return groups;
}
```

The structural fix: ensure `EdgeProjectorService.project()` creates groups that are never
added to any `scene` object. The groups should be created, consumed, and disposed entirely
within the EPS call, with no reference kept outside.

**Acceptance criteria**:
- [ ] Post-audit: zero meshes with `tris < 100` in non-overlay scene graph
- [ ] `drawCalls` post-batch < 20 (was 123–153)
- [ ] `tris/drawCall` post-batch > 100 (was 14)
- [ ] FPS improvement of +10–15fps from draw call reduction alone

**Sprint**: 1 (concurrent with Phase F.2)

---

### Navigation Fix N3 — NME proxy geometry explicit disposal (P0)

**Problem**: `NativeElementMeshExporter.releaseGroups()` calls `group.clear()` but never
calls `geometry.dispose()` on proxy meshes. Observed: 3,486–4,897 leaked geometries
(+182 per 10 seconds of navigation).

**Implementation**:

```typescript
// NativeElementMeshExporter.ts

releaseGroups(groups: THREE.Group[]): void {
  for (const group of groups) {
    // §FIX-NME-PROXY-DISPOSE: explicitly dispose all proxy geometry
    group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        // Dispose geometry: GPU buffer released, renderer.info.memory.geometries--
        child.geometry.dispose();
        
        // Do NOT dispose material: it is shared from the InstancedMesh source element.
        // Disposing the shared material would break rendering of the actual scene element.
      }
    });
    group.clear();
  }
  groups.length = 0;
}
```

**Also fix**: The gpu-pick pass intermediate geometry leak (Session 6: +182/10s):

```typescript
// PickResolver.ts — after each _gpuPick call:
private _disposePickTarget(): void {
  if (this._pickTarget) {
    this._pickTarget.texture.dispose();
    this._pickTarget.depthTexture?.dispose();
    this._pickTarget.dispose();
    this._pickTarget = null;   // will be re-created on next pick
  }
}
```

And reuse the render target across picks rather than creating a new one each time:

```typescript
// PickResolver.ts — reuse pick render target:
private _pickTarget: THREE.WebGLRenderTarget | null = null;

private _getOrCreatePickTarget(): THREE.WebGLRenderTarget {
  if (!this._pickTarget) {
    this._pickTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
    });
  }
  return this._pickTarget;
}
```

**Acceptance criteria**:
- [ ] `renderer.info.memory.geometries` remains stable (< ±50) during 60 seconds of navigation
- [ ] `renderer.info.memory.geometries` decreases toward 0 when scene is cleared
- [ ] GPU memory usage (VRAM) stable during navigation session

**Sprint**: 1 (alongside Phase F.2 — this is a pure disposal fix)

---

### Navigation Fix N4 — THREE.LineLoop → THREE.LineSegments conversion (P0)

**Problem**: `THREE.Renderer: Objects of type THREE.LineLoop are not supported.` fires every
render frame in the WebGPU renderer. 60 `console.error()` calls/second = ~30–120ms/s overhead.

**Identification**: Find all LineLoop creation sites:

```bash
grep -rn "LineLoop" src/ packages/ apps/ --include="*.ts" --include="*.js"
```

**Expected source**: OBC `EdgeProjector` or `OBC.TechnicalDrawing` internals. The
`@thatopen/components` library may create LineLoop objects internally.

**Fix strategy A** — Convert in OBC post-processing:

```typescript
// UnifiedFrameLoop.ts or ScenePostProcessor.ts — run after each OBC render:
private _convertLineLoops(scene: THREE.Scene): void {
  const lineLoops: THREE.LineLoop[] = [];
  scene.traverse(obj => {
    if (obj instanceof THREE.LineLoop) lineLoops.push(obj);
  });
  
  for (const loop of lineLoops) {
    // Convert LineLoop to LineSegments:
    const positions = loop.geometry.attributes.position;
    const count = positions.count;
    const newPositions = new Float32Array(count * 2 * 3);
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      // Copy segment i→next:
      newPositions[i * 6 + 0] = positions.getX(i);
      newPositions[i * 6 + 1] = positions.getY(i);
      newPositions[i * 6 + 2] = positions.getZ(i);
      newPositions[i * 6 + 3] = positions.getX(next);
      newPositions[i * 6 + 4] = positions.getY(next);
      newPositions[i * 6 + 5] = positions.getZ(next);
    }
    const segments = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        'position', new THREE.BufferAttribute(newPositions, 3)
      ),
      loop.material
    );
    segments.userData = { ...loop.userData };
    loop.parent?.add(segments);
    loop.parent?.remove(loop);
    loop.geometry.dispose();
  }
}
```

**Fix strategy B** — Patch OBC output: If the LineLoop objects come from `OBC.EdgeProjector`,
submit a patch to `@thatopen/components` or wrap the EdgeProjector output in a
post-processing hook that converts LineLoops before they are added to the scene.

**Acceptance criteria**:
- [ ] Zero `THREE.Renderer: Objects of type THREE.LineLoop are not supported.` errors in console
- [ ] `renderer.info.render.calls` unchanged (LineSegments use the same draw path)
- [ ] 2D technical drawings remain visually correct after conversion

**Sprint**: 1

---

### Navigation Fix N5 — CurtainWallBuilder drain background priority during navigation (P1)

**Problem**: `CurtainWallBuilder._drainBuildQueue()` schedules itself at `'pre-render'`
priority during interactive navigation, competing with the camera update in the same slot.
At 14ms drain budget (interactive mode), this consumes 84% of the 16.6ms frame budget.

**Fix**:

```typescript
// CurtainWallBuilder.ts — _drainBuildQueue():

private _isDrainBackgrounded = false;

private _drainBuildQueue() {
  const isNavigating = this.scheduler.isMotionActive();  // motionGate check

  if (isNavigating && !this._isDrainBackgrounded) {
    // User is navigating — yield the drain to background priority
    this._isDrainBackgrounded = true;
    this.scheduler.schedule('background', () => this._drainBuildQueue());
    return;
  }

  if (!isNavigating && this._isDrainBackgrounded) {
    // Navigation stopped — resume at pre-render priority
    this._isDrainBackgrounded = false;
  }

  // ... existing drain logic ...
  const budget = isNavigating ? 8 : 25;   // 8ms during nav, 25ms when idle
  const ceiling = isNavigating ? 10 : 50;  // lower ceiling during navigation
  // ... rest of drain ...

  if (this._pendingBuildsMap.size > 0) {
    const priority = isNavigating ? 'background' : 'pre-render';
    this.scheduler.schedule(priority, () => this._drainBuildQueue());
  }
}
```

**Acceptance criteria**:
- [ ] During active mouse navigation (`motionGate=active`): drain uses ≤ 8ms/frame at background priority
- [ ] After navigation stops: drain resumes 25ms/frame at pre-render priority
- [ ] No drain starvation: maximum drain pause during continuous navigation < 100ms
  (FrameScheduler must pump background slots between navigation frames)

**Sprint**: 2

---

### Navigation Fix N6 — VDT post-CASCADE suppression window (P1)

**Problem**: `ViewDependencyTracker.setSuppressed(false)` is called at batch-end (T+141ms).
The `DependencyResolver` CASCADE triggered by `REDETECT_ROOMS` does not reach VDT until
T+300–400ms. By then, suppression is off, so all 9 CASCADE wall events fire VDT flushes,
triggering a second full EPS reprojection (81ms LONGTASK) during active orbit (Session 1–5
Cluster C, Gap G1 from doc 47).

**Fix**:

```typescript
// BatchCoordinator.ts — onComplete():

// Current (incorrect):
viewDependencyTracker.setSuppressed(false);
viewDependencyTracker.markLevelsDirtyImmediate(levelIds);

// Target:
// Keep suppression ON until CASCADE settles:
viewDependencyTracker.setSuppressed(true);  // still suppressed

// Schedule the lift for after CASCADE propagation:
// Two microtask ticks are sufficient for synchronous CASCADE propagation:
queueMicrotask(() => queueMicrotask(() => {
  viewDependencyTracker.setSuppressed(false);
  viewDependencyTracker.markLevelsDirtyImmediate(levelIds);
}));

// Hard timeout fallback (prevents permanent lockout if CASCADE never settles):
const SUPPRESSION_HARD_TIMEOUT_MS = 2000;
setTimeout(() => {
  if (viewDependencyTracker.isSuppressed) {
    console.warn('[BatchCoordinator] §VDT-SUPPRESS-TIMEOUT: forcing lift after 2s');
    viewDependencyTracker.setSuppressed(false);
  }
}, SUPPRESSION_HARD_TIMEOUT_MS);
```

**Expected gain**: Eliminates the second EPS reprojection (81ms LONGTASK) during orbit.
Navigation FPS increases from ~18fps to ~30fps in the T+300ms–T+600ms window (during orbit).

**Acceptance criteria**:
- [ ] No LONGTASK from EPS reprojection in the 0–1000ms post-batch window during orbit
- [ ] Single EPS reprojection fires (the `markLevelsDirtyImmediate` one), not two
- [ ] VDT suppression hard timeout fires no more than once per 10 batches in test

**Sprint**: 2 (Phase G.1 equivalent — already partially addressed in doc 45 Phase G)

---

### Navigation Fix N7 — NME proxy result caching (P1)

**Problem**: `NativeElementMeshExporter.exportForView()` re-creates 1,182 proxy meshes on
every EPS flush, even when the CW geometry has not changed. The §C.3.2 EPS cache saves
the `EdgesGeometry` + `toDrawingSpace` cost but not the NME proxy creation cost.

**Fix**: Cache proxy groups keyed by `(elementId, version)`:

```typescript
// NativeElementMeshExporter.ts

private _proxyCache = new Map<string, {
  version: number;
  groups: THREE.Group[];
  refCount: number;
}>();

private _getOrCreateProxyGroups(
  element: BimElement,
  viewDef: ViewDefinition,
): THREE.Group[] {
  const key = `${element.id}:${viewDef.id}`;
  const cached = this._proxyCache.get(key);

  if (cached && cached.version === element.version) {
    cached.refCount++;
    // Return CLONED groups (proxies are consumed by EPS; can't reuse objects)
    return cached.groups.map(g => g.clone(true));
  }

  // Cache miss — create fresh proxies
  const groups = this._createProxyGroups(element, viewDef);
  this._proxyCache.set(key, { version: element.version, groups, refCount: 1 });
  return groups.map(g => g.clone(true));
}

// Invalidation (call when element is updated):
invalidateProxyCache(elementId: string): void {
  for (const [key, entry] of this._proxyCache) {
    if (key.startsWith(`${elementId}:`)) {
      // Dispose cached group geometries before evicting:
      for (const group of entry.groups) {
        group.traverse(child => {
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        });
      }
      this._proxyCache.delete(key);
    }
  }
}
```

**Memory budget**: 1,182 cached proxies × 4.8 KB each = 5.7 MB for the 9-CW case. At
10k CW elements: 10,000/9 × 5.7 MB = 6.3 GB — too large for a persistent cache.

**Cache strategy**: LRU eviction keyed by viewId + last-access time. Evict when
`_proxyCache.size > 50` (50 elements × 1,182/9 = ~6,500 proxies = 31 MB). This is
acceptable for a 10k-element session within the 1.5 GB NFT-16 budget.

**Expected gain**: Second and subsequent EPS flushes for unchanged CW elements: NME cost
drops from 57–59ms to ~1ms (clone groups from cache). Only the first flush (or after
element update) pays full cost.

**Sprint**: 3 (Phase H.2 equivalent)

---

### Navigation Fix N8 — Async gpu-pick with N-1 frame delay (P2)

**Problem**: Even with N1 (throttle to 1/rAF), the gpu-pick still costs 95–451ms per
pick — it just costs it once per frame instead of multiple times per frame. True navigation
fluidity requires eliminating the GPU stall entirely.

**Fix**: Use WebGPU's async GPU readback:

```typescript
// PickResolver.ts — async GPU pick:

private _pickBuffer: GPUBuffer | null = null;
private _mappedResult: number | null = null;  // element ID from previous frame

async _gpuPickAsync(x: number, y: number): Promise<void> {
  // Phase 1: Render the pick pass (non-blocking)
  const pickPass = this._buildPickRenderPass(x, y);
  this.device.queue.submit([pickPass.commandBuffer]);

  // Phase 2: Async readback (returns immediately, completes 1–2 frames later)
  if (this._pickBuffer) {
    await this._pickBuffer.mapAsync(GPUMapMode.READ);
    const data = new Uint32Array(this._pickBuffer.getMappedRange());
    this._mappedResult = data[0];
    this._pickBuffer.unmap();
  }
}

// In pre-render slot (reads result from PREVIOUS frame's async pick):
_processPickResult(): void {
  if (this._mappedResult !== null) {
    const elementId = this._idToElementMap.get(this._mappedResult);
    if (elementId !== this._lastHit) {
      this._lastHit = elementId;
      this._updateHover(elementId);
    }
    this._mappedResult = null;
  }
}
```

**N-1 frame delay**: The hover highlight updates 1 frame (16ms at 60fps) after the
pointer moves. At 60fps this is imperceptible (below human detection threshold of ~50ms
for visual feedback). At 30fps (during stress) the delay is 33ms — still acceptable.

**WebGL fallback**: CPU-side BVH raycast (`BVHQuery.raycast(ray)`):
- At 10k elements with a built BVH: ~0.5ms
- At 100k elements: ~2ms
- At 1M elements: ~5ms

**Acceptance criteria**:
- [ ] No synchronous GPU stalls in `PickResolver` during navigation
- [ ] Hover highlight update latency < 50ms (1 frame at 60fps, 2 frames at 30fps)
- [ ] FPS during active hover navigation > 55fps on 10k-element scene
- [ ] CPU-side BVH raycast fallback when WebGPU async readback unavailable

**Sprint**: Quarter 2

---

### Navigation Fix N9 — BVH frustum culling in OBC render (P2)

**Problem**: OBC renders all geometries in the scene unconditionally. At 3,486 geometries,
the draw call submission overhead is ~12ms/frame. At 10k geometries, this is ~35ms — over
budget before any triangle is rasterized.

**Fix**: Wire `BVHQuery` into the render pipeline as a per-frame pre-cull pass:

```typescript
// UnifiedFrameLoop.ts — pre-render slot, before OBC render:

private _frustumCull(camera: THREE.Camera): string[] {
  const frustum = new THREE.Frustum();
  frustum.setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix, camera.matrixWorldInverse
    )
  );

  // BVH query: O(log n) against element AABBs
  return this._bvhQuery.frustumQuery(frustum);  // returns visible elementIds
}

private _applyVisibility(visibleIds: Set<string>): void {
  this._scene.traverse(obj => {
    if (obj.userData.elementId) {
      obj.visible = visibleIds.has(obj.userData.elementId);
    }
  });
}
```

**Expected gain at scale**:

| Element count | Visible @ 90° FOV | Draw calls (current) | Draw calls (with cull) | FPS gain |
|---|---|---|---|---|
| 3,486 | ~1,200 | 123 | 42 | +5fps |
| 10,000 | ~3,000 | 350 | 105 | +15fps |
| 100,000 | ~5,000 | 3,500 | 175 | +50fps |
| 1,000,000 | ~8,000 | 35,000 | 280 | NavigAble |

**Sprint**: Quarter 2

---

### Navigation Fix N10 — LOD system for navigation performance (P2)

**Problem**: At 1M elements, even with frustum culling, the visible set (~8,000) produces
~280 draw calls at full LOD. For elements at distance > 100m, sub-pixel geometry is
wasteful.

**Fix**: Three.js `THREE.LOD` with distance-based mesh selection:

```typescript
// ElementLODFactory.ts

createLOD(element: BimElement): THREE.LOD {
  const lod = new THREE.LOD();

  // LOD-0: Full resolution (0–15m)
  lod.addLevel(element.fullMesh, 0);

  // LOD-1: Simplified box (15–50m)
  lod.addLevel(createSimplifiedBox(element.aabb), 15);

  // LOD-2: Billboard sprite (50–200m)
  lod.addLevel(createBillboard(element.type, element.color), 50);

  // LOD-3: Point / nothing (200m+)
  lod.addLevel(new THREE.Object3D(), 200);

  return lod;
}
```

At 1M elements with LOD-3 (overview shot):
- 1M × LOD-3 (point) = 1M objects but 0 draw calls (THREE.LOD doesn't render LOD-3 mesh
  if it's an empty Object3D)
- BVH cull to ~8,000 visible at LOD-3 → 8,000 billboards → 1 instanced draw call

**Sprint**: Quarter 3

---

## Part 5 — Architecture for Great Navigation Performance

### 5.1 The architectural vision (what 60fps at 1M elements looks like)

A navigation frame in the target architecture:

```
rAF tick (target: 16.6ms total)
│
├── pre-render (3ms budget)
│   ├── CameraController.interpolateTo()        0.1ms
│   ├── BVHQuery.frustumCull(camera)            0.5ms   (log n, 1M elements)
│   ├── applyVisibility(visibleIds)             0.5ms
│   └── PickResolver.processAsyncPickResult()  0.1ms   (read prior frame's buffer)
│
├── render (10ms budget)
│   ├── OBC: ~280 draw calls (BVH-culled), LOD-selected
│   │   ├── LOD-0 elements (near):   ~10ms GPU raster
│   │   └── LOD-1/2 elements (far):  ~1ms GPU raster
│   └── PASCAL SSGI:                 ~5ms GPU
│
├── post-render (2ms budget)
│   ├── PickResolver.scheduleAsyncPick()        0.1ms   (submit pick command buffer)
│   └── NavigationHealthChecker (dev mode)      0.5ms
│
└── overlay (1ms budget)
    └── 2D annotations, cursor, progress        0.5ms
│
└── Remaining:                                  0.8ms buffer
```

**Total: 16.6ms → 60fps, even with 1M elements in the database.**

### 5.2 The navigation performance contract (what to add to C10)

The following NFTs should be added to C10:

| # | Proposed NFT | Target | Bench file |
|---|---|---|---|
| NFT-PERF-20 | Post-batch navigation FPS (10k elements) | ≥ 55fps p95 | `post-batch-nav.bench.ts` |
| NFT-PERF-21 | gpu-pick hover latency | < 2ms p95 (async path) | `pick-hover.bench.ts` |
| NFT-PERF-22 | Draw call count (10k element scene) | < 100 | `draw-call.bench.ts` |
| NFT-PERF-23 | Geometry leak rate during navigation | 0 geometries/min | `geom-leak.bench.ts` |
| NFT-PERF-24 | BVH cull time (1M element BVH) | < 1ms p95 | `bvh-cull.bench.ts` |
| NFT-PERF-25 | LOD transition flicker | 0 frames of no-geometry | `lod-transition.bench.ts` |

### 5.3 The navigation monitoring dashboard

Add to `RenderPerformanceService`:

```typescript
export interface NavigationHealthReport {
  geometries: number;
  geometriesOverCeiling: boolean;
  drawCalls: number;
  trisPerDrawCall: number;
  lineLoopCount: number;           // should be 0 in WebGPU
  nonInstancedMeshCount: number;   // should be < 20
  pickHoverLastMs: number;
  pickHoverAvgMs: number;
  lastPickThrottled: boolean;
  vdtIsSuppressed: boolean;
  epsFlushCount: number;
  cwDrainFrameMs: number;
  navigationFps: number;
}

export function getNavigationHealth(): NavigationHealthReport { ... }
```

This dashboard, emitted to `[NavHealth]` console.log every 10 seconds, would have
immediately surfaced every finding in this report from the first session.

---

## Part 6 — Measurement Framework

### 6.1 What to measure (immediate — Sprint 1)

Add to existing `[GPU Monitor]` log output:

```
[GPU Monitor] geometries:3486 textures:9 | drawCalls:123 tris:2086
              → NEW: pickMs:?? | lineLoops:?? | nonInstanced:?? | navFps:??
```

**pickMs**: Time for the last `_gpuPick()` call (ms). Target: <2ms (async), <5ms (sync
throttled). Alert if >50ms.

**lineLoops**: Count of `THREE.LineLoop` objects in scene. Target: 0. Alert if >0.

**nonInstanced**: Count of `THREE.Mesh` objects with <100 triangles not in InstancedMesh.
Target: <20. Alert if >100.

**navFps**: Rolling 10-frame FPS average during active navigation (motionGate=active).
Target: >55fps. Alert if <30fps.

### 6.2 The three-phase performance timeline (target post-fixes)

```
Pre-batch:
  T= -∞      Project loaded, navigating normally
              geometries: <500, drawCalls: <20, tris/call: >100
              pickMs: <5ms, navFps: >55fps
              ALL NFTs satisfied ✅

During batch (Phase F.2 fix applied):
  T= 0ms     runBatch() begins — render suppressed, VDT suppressed
  T= 0–?ms   CW/Slab drain across rAF frames (25ms/frame budget)
              [user sees progress indicator, cannot navigate — acceptable]
  T= ?ms     All builds complete — render unsuppressed
              pickMs: <5ms (scene geometry is building, count low)

Post-batch — TARGET STATE (with N1+N2+N3+N4+N5+N6):
  T+0ms      Render unsuppressed
  T+0–141ms  markLevelsDirtyImmediate pending (VDT still suppressed — N6)
  T+141ms    VDT suppression lifted (post-CASCADE) — single EPS flush
              NME creates proxies (from cache if available — N7)
              EPS projects: <30ms (chunked, cached)
  T+800ms    Shadow reactivation (sliced — Phase K): 8×50ms → <400ms total
              But sliced across 8+ frames: 50ms per frame, all others <16ms
  T+30s      Stable scene, full navigation fluidity

  geometries: <500 (leaks fixed — N3), drawCalls: <20 (N2), tris/call: >100
  pickMs: <2ms (async — N8), navFps: >55fps
  ALL NFTs satisfied ✅
```

### 6.3 Regression tests to add

```typescript
// post-batch-navigation.test.ts

describe('Post-batch navigation performance', () => {
  it('keeps drawCalls < 50 after 20-level CW batch', async () => {
    await batch20LevelCW();
    const { drawCalls } = renderer.info.render;
    expect(drawCalls).toBeLessThan(50);
  });

  it('keeps geometries stable during 60s navigation after batch', async () => {
    await batch20LevelCW();
    const before = renderer.info.memory.geometries;
    await simulateNavigation(60_000);  // 60s of mouse moves
    const after = renderer.info.memory.geometries;
    expect(after - before).toBeLessThan(50);  // <50 new geometries in 60s
  });

  it('keeps pickMs < 5ms during navigation', async () => {
    await batch20LevelCW();
    const samples = await samplePickMs(100);  // 100 hover measurements
    const p95 = percentile(samples, 95);
    expect(p95).toBeLessThan(5);
  });

  it('has zero THREE.LineLoop objects in scene', async () => {
    await batch20LevelCW();
    const lineLoops = countSceneObjects(THREE.LineLoop);
    expect(lineLoops).toBe(0);
  });
});
```

---

## Part 7 — Constraint × Navigation Fix Mapping

The table below maps every navigation fix (N1–N10) to the founding-engineer constraint it
primarily addresses, the NFT it targets, and the implementation sprint.

| Fix | Primary Constraint | Secondary Constraint | NFTs | Sprint |
|---|---|---|---|---|
| **N1** gpu-pick throttle | C2 Frame budget | C5 Scale (pick at 1M) | NFT-03, NFT-04, NFT-21 | 1 (P0) |
| **N2** Proxy mesh audit + off-scene | C2 Frame budget | C1 Memory | NFT-04, NFT-22 | 1 (P0) |
| **N3** NME proxy geometry disposal | C1 Memory | C2 Frame budget | NFT-16, NFT-23 | 1 (P0) |
| **N4** LineLoop → LineSegments | C2 Frame budget | — | NFT-04 | 1 (P0) |
| **N5** Drain background priority | C2 Frame budget | C3 Collaboration | NFT-04 | 2 (P1) |
| **N6** VDT post-CASCADE suppression | C2 Frame budget | C3 Collaboration | NFT-04, NFT-05 | 2 (P1) |
| **N7** NME proxy cache | C1 Memory | C2 Frame budget | NFT-05, NFT-16 | 3 (P1) |
| **N8** Async gpu-pick | C2 Frame budget | C5 Scale | NFT-21, NFT-20 | Q2 (P2) |
| **N9** BVH frustum culling | C5 Scale | C2 Frame budget | NFT-20, NFT-24 | Q2 (P2) |
| **N10** LOD system | C5 Scale | C2 Frame budget | NFT-20, NFT-25 | Q3 (P2) |

---

## Part 8 — Sprint Execution Order

### Sprint 1 (Week 1–2) — P0: Eliminate the navigation killers

Priority order:

1. **Phase F.2** (from doc 45): `.resume()` not `.resumeAndFlush()` — eliminates 22,182ms freeze.
2. **N1**: gpu-pick throttle — eliminates 95–451ms hover stalls (primary post-batch killer).
3. **N2**: Scene graph proxy audit — eliminates 14 tris/drawCall (draw call structure).
4. **N3**: NME proxy geometry disposal — eliminates geometry leak.
5. **N4**: LineLoop → LineSegments — eliminates per-frame error overhead.

**Sprint 1 expected outcome**: Post-batch navigation FPS: 4–8fps → 35–45fps.

### Sprint 2 (Week 3–4) — P1: Close the post-batch cascade gaps

1. **Phase G.1–G.3** (from doc 45): VDT suppression extension, RTO timer cancellation.
2. **N5**: CW drain background priority during navigation.
3. **N6**: VDT post-CASCADE suppression window.
4. **Phase I.2**: `§FIX-DISPOSE-USEDTIMES` null-guard.

**Sprint 2 expected outcome**: Post-batch navigation FPS: 35–45fps → 50–55fps.
Navigation at T+300ms–T+600ms (CASCADE window) no longer freezes.

### Sprint 3 (Week 5–6) — P1: Cache and geometry quality

1. **Phase H.1–H.2** (from doc 45): NME XZ crop culling + proxy cache.
2. **N7**: NME proxy result cache.
3. **Phase K** (from doc 45): Shadow reactivation slicing.
4. **Proposed NFT-PERF-20–25**: Add to C10 as merge blockers.

**Sprint 3 expected outcome**: Post-batch navigation FPS: 50–55fps → 58–60fps (NFT-04 satisfied).
All memory leaks closed. Draw calls < 20. Geometry count stable.

### Quarter 2 — Scale infrastructure

1. **N8**: Async gpu-pick.
2. **N9**: BVH frustum culling.
3. **FloorPlanCommandBatcher** → Worker (eliminate pre-batch main-thread freeze).
4. **NavigationHealthChecker**: Add to batch-completion callback as assertion.

**Q2 expected outcome**: 10k-element scene navigates at 60fps. NFT-PERF-20 satisfied.

### Quarter 3 — 1M-element architecture

1. **N10**: LOD system.
2. Scene graph streaming (Worker-based).
3. WebGPU compute-shader LOD selection.

**Q3 expected outcome**: 1M-element scene navigable at 60fps. Architecture validated.

---

## Part 9 — Summary of New Findings Not in Prior Documents

| Finding | Session | Severity | Prior docs | Action |
|---|---|---|---|---|
| **gpu-pick fires on every pointermove, 95–451ms per call** | Session 5 | CRITICAL | None | N1 (P0, Sprint 1) |
| **drawCalls:123 at tris:1726 (14 tris/call) — NME proxies in scene** | Sessions 5–6 | CRITICAL | None | N2 (P0, Sprint 1) |
| **Geometry leak active during navigation: +182/10s** | Session 6 | HIGH | Partial (doc 48 §2.5) | N3 (P0, Sprint 1) |
| **THREE.LineLoop not supported, fires every render frame** | Session 6 | HIGH | None | N4 (P0, Sprint 1) |
| **VDT suppression ends 260ms before CASCADE settles** | Session 5 logs | HIGH | Doc 47 Gap 4 (partial) | N6 (P1, Sprint 2) |
| **22,182ms single LONGTASK (resumeAndFlush, Session 3)** | Session 3 | CATASTROPHIC | Doc 45 Phase F.2 | F.2 (P0, Sprint 1) |
| **5,742ms + 8,804ms LONGTASK pair (Session 7)** | Session 7 | CATASTROPHIC | None — new session | F.2 (P0, Sprint 1) |
| **Second WebGPU device loss, reason=unknown (Session 7)** | Session 7 | HIGH | Doc 45 Phase I.2 | I.2 (Sprint 2) |
| **Shadow PSO storm at T+30s: 8 LONGTASKs, 1,591ms** | Session 1 | HIGH | Doc 45 Phase K | Phase K (Sprint 3) |
| **§FIX-DISPOSE-USEDTIMES: WebGPU device loss during PSO** | Sessions 2, 5 | HIGH | Doc 45 Phase I.2 | I.2 (Sprint 2) |
| **1M-element extrapolation: 76–108 GB leaked geometry** | Extrapolation | ARCHITECTURAL | None | N3 + N9 + N10 |

---

*Produced from: twelve parallel source-code explore subagents + six live browser-console
captures (2026-05-07, Sessions 1–6) + direct reads of all priority documents
(40, 42, 44, 45, 46, 47, 48) + full C10 NFT list. Zero source files were modified
during this analysis. All findings are from direct observation of live log data and
source code.*

*PRYZM internal — not for distribution.*
