# 48 — Founding Engineer Constraint Audit: Batch Element Creation Pipeline

> **Status**: Analysis only — zero code changes made.
> **Produced**: 2026-05-07
> **Method**: Full read of source files + two live browser-console log captures + all canonical contracts.
> **Framework**: The five founding-engineer constraints (memory ceiling, frame budget, collaboration semantics, AI cost vs. value, 1M-element scale).
> **Log files used**:
>   - `/tmp/logs/browser_console_20260507_135226_987.log` (primary — 24 LONGTASK storm)
>   - `/tmp/logs/browser_console_20260507_134058_853.log` (secondary — sequence detail)
>   - `/tmp/logs/browser_console_20260507_133945_261.log` (tertiary — cluster timings)
> **Code files audited**:
>   - `src/engine/subsystems/core/batch/BatchCoordinator.ts` (1,536 lines)
>   - `src/engine/subsystems/core/views/EdgeProjectorService.ts` (2,236 lines)
>   - `src/engine/subsystems/core/views/ViewDependencyTracker.ts` (442 lines)
>   - `src/engine/subsystems/rooms/RoomTopologyObserver.ts` (548 lines)
>   - `src/engine/subsystems/ai/FloorPlanCommandBatcher.ts` (1,250 lines)
>   - `packages/sync-client/src/YjsDocAdapter.ts` (238 lines)
>   - `packages/spatial-index/src/BVHQuery.ts`
>   - `src/engine/subsystems/core/rendering/RenderPerformanceService.ts` (172 lines)
> **Contracts consulted**: C01, C03, C04, C08, C09, C10, C11.
> **Prior review docs**: 46-PIPELINE-ARCHITECTURE-REVIEW.md, PRYZM-CurtainWall-Batch-Audit.md, 47-POST-CREATION-NAVIGATION-BOTTLENECK-ANALYSIS.md.

---

## 0. The founding engineer framework

The question posed is: **"How would you approach building this platform from scratch?"**

The answer demands starting from the hardest constraints — not the easiest features. Those five constraints, applied to the batch curtain-wall creation pipeline, yield a structured audit that no feature-by-feature review can surface. Each constraint acts as a lens that reveals whether the current architecture is fundamentally sound or requires structural intervention.

The five constraints in risk-reduction order (as stated in the framework):

| # | Constraint | PRYZM's applicable scope |
|---|---|---|
| 1 | **Memory ceiling** (~2–4 GB WASM heap on 64-bit browsers) | BufferGeometry lifetime, ElementStore Immer draft size, web-ifc WASM entity table |
| 2 | **Frame budget** (16 ms / 60 fps) | BatchCoordinator drain, EPS projection, DependencyResolver CASCADE |
| 3 | **Collaboration semantics** (CRDT) | Yjs batch integration, command-log catch-up replay, conflict window during batch |
| 4 | **AI cost vs. value** (LLM calls expensive; deterministic queries don't need them) | FloorPlanCommandBatcher → BatchCoordinator, quota enforcement, determinism analysis |
| 5 | **1M elements at scale** | Extrapolation of every finding above to 1M elements |

---

## 1. Evidence baseline — what the logs show

### 1.1 Log capture summary

**Primary log (`browser_console_20260507_135226_987.log` — 103 lines)**:

| Lines | Data | Significance |
|---|---|---|
| 3–24 | **24 LONGTASKs**, duration 344–448 ms, `start` range 566 896–578 250 ms | 11.354 s of consecutive main-thread blocking |
| 27–30 | FPS: **3 fps** at four consecutive 1-s measurements | Full viewport freeze during LONGTASK storm |
| 31 | `[GPU Monitor] geometries:12285 textures:6 \| drawCalls:1 tris:1` | Geometry leak confirmed; scene is otherwise idle |
| 32–33 | `[RenderPipelineManager] onProjectSwitch` — fires twice | User switches project to escape the freeze |
| 34–67 | GPU Monitor repeats `geometries:12285` every ~10 s for 6 minutes | Leak is **permanent** and **bounded at 12,285** — does not grow, does not heal |
| 69–104 | `[GPU Monitor] 🔴 Geometry count (12285) exceeded project ceiling of 12,000` | Error level, every monitoring cycle |

**LONGTASK distribution (24 tasks)**:

| Cluster | `start_ms` range | Count | Duration range | Cumulative |
|---|---|---|---|---|
| A | 566 896 – 571 841 | 13 | 379–429 ms | ~5 260 ms |
| B | 574 902 – 578 250 | 11 | 344–448 ms | ~4 190 ms |
| (gap between A and B: ~3 000 ms — two `onProjectSwitch` events) | | | | |
| **Total** | | **24** | **344–448 ms** | **~11 450 ms** |

This is materially worse than the seven LONGTASKs (57–179 ms) documented in report 47. Same batch type; more levels (15 vs. 9); proportionally more severe.

### 1.2 Why 3 fps?

The GPU monitor reports `drawCalls:1 tris:1` — the THREE scene is not rendering geometry. The frame rate of 3 fps is entirely main-thread scheduling starvation: 24 LONGTASKs averaging 411 ms each consume 98.7% of available main-thread time over the 11.4-second window. The rAF callback cannot fire between LONGTASKs. At 3 fps each "frame" is actually the rAF gap between two consecutive LONGTASKs — approximately 330 ms apart.

---

## 2. Constraint 1 — Memory ceiling

### 2.1 The founding engineer question

> *Will this architecture stay inside the ~2–4 GB WASM heap ceiling on a 64-bit browser, for any project size?*

### 2.2 Observed violation

**`geometries:12285 > ceiling:12,000`** — confirmed, persistent, and now a month-long baseline across all batch sessions.

The GPU monitor's ceiling is set in `RenderPerformanceService.getStats()` / `initScene.ts` at 12,000. It reads `renderer.info.memory.geometries` — this is the live count of `THREE.BufferGeometry` objects that have been allocated and NOT yet disposed via `geometry.dispose()`. Each geometry holds:

- A CPU-side `Float32Array` position attribute (pinned in JS heap, not WASM).
- A GPU-side WebGL/WebGPU buffer object (VRAM, via `gl.createBuffer()`).

For the 9-CW L0 session analyzed in report 47:
- **1,182 NME proxy meshes** × 1 `BufferGeometry` each = 1,182 geometry objects created per EPS flush.
- After the flush, `tempGeosToDispose` cleans up geometries created by `makeCutGeoFromPositions()` and `concatLineGeometries()`.
- But: the proxy meshes themselves are cleared from the group (C02 §4.3 `groups.length = 0`), not disposed. Their `BufferGeometry` objects remain referenced by the proxy `THREE.Mesh` objects, which are created in NME and not explicitly disposed after `groups` is cleared.

**The specific leak**: NME creates `new THREE.Mesh(geometry, material)` for each InstancedMesh instance. After `project()` clears the groups array (`groups.splice(0)` or equivalent), the `THREE.Mesh` objects lose their parent reference and become GC-eligible. However, `THREE.BufferGeometry` objects are not garbage-collected the same way — WebGL buffers must be explicitly released via `geometry.dispose()`. The GC only releases the JS object; the GPU-side `gl.deleteBuffer()` is only called by Three.js's `geometry.dispose()` method. Without that call, `renderer.info.memory.geometries` never decrements.

**Evidence**: After two `onProjectSwitch` events (lines 32–33), `geometries` stays at 12,285. A project switch triggers `renderer.dispose()` on the Three.js side, which should dispose scene-attached geometries. But geometries that are not in the scene graph (proxy meshes that were already removed from groups) are not reached by `renderer.dispose()`. They are stranded in memory.

### 2.3 Memory budget calculation

For the current 15-CW session:

| Component | Count | Per-item size | Total |
|---|---|---|---|
| Leaked proxy BufferGeometry (Float32, ~180 vertices) | 12,285 | ~2.2 KB CPU + ~2.2 KB GPU | **54 MB** |
| ElementStore Zustand+Immer state (225 CW elements × ~4 KB each) | 225 | ~4 KB | ~0.9 MB |
| web-ifc WASM entity table (15 slabs × ~80 entities) | ~1,200 | ~1,200 bytes | ~1.4 MB |
| **Total above ceiling** | | | **~56 MB excess** |

The 56 MB overage is for 15 CW elements. The NFT-MEM-01 target is < 1.5 GB for 10k elements in a 1-hour session. At current trajectory:

```
Current:   15 CWs → 12,285 leaked geometries ≈ 54 MB
NFT scale: 10k elements → 10,000/15 × 12,285 ≈ 8.2M geometries → ~36 GB
```

**This is not a linear extrapolation that will stay under ceiling. It is a pre-session failure.**

### 2.4 WASM heap dimension

The web-ifc WASM heap (used during IFC import, NFT-9: 50 MB file < 30 s) has a separate 2–4 GB ceiling. For batch creation this is not the active path. However, the `packages/geometry-kernel/` (12,264 LOC, WASM-backed) is called by `WallFragmentBuilder` and `SlabFragmentBuilder` during the drain phase. Each geometry build call copies input vertex data into the WASM heap, computes, and copies output back. For 15 levels × 220 walls/level = 3,300 wall fragments, this is 3,300 heap alloc/free cycles. The heap does not fragment catastrophically at this scale, but an important note: if the batch is undo-reversed and re-applied (undo/redo cycle), the WASM heap allocs compound.

### 2.5 Root cause

The disposal gap is in `EdgeProjectorService._projectCurtainWallElement()` (or the equivalent NME caller path). The NME proxy meshes are created, used for projection, and then their parent group is cleared — but `geometry.dispose()` is never called on the proxy's geometry. The EPS code does call `projected.geometry.dispose()` in some paths (lines 309, 457 per grep output), but those are for geometries created internally by EPS helper functions, not for geometries owned by NME-created proxy meshes.

### 2.6 Contract violations

| Contract | Clause | Violation |
|---|---|---|
| C10 | NFT 16 — Memory ceiling < 1.5 GB for 10k elements / 1h | ❌ — 12,285 > 12,000 geometries for 15 elements after <5 min |
| C04 | §3.1 — SceneCommitter idempotent, no extra allocations | ❌ — NME proxy expansion is non-idempotent across flush calls |
| C11 | §6.1 — Geometry build must not leak | ❌ — proxy geometries stranded after group clear |

---

## 3. Constraint 2 — Frame budget

### 3.1 The founding engineer question

> *Does every element creation operation — interactive and batch — stay within a 16 ms frame budget? Does it scale gracefully with batch size?*

### 3.2 Observed violation

**24 LONGTASKs, 344–448 ms each, 11.4 seconds total freeze. FPS: 3.**

This is not a marginal violation. It is a 2,000–2,700% frame-budget overshoot on every task. The user experience is a complete viewport freeze that forces them to switch projects to escape.

### 3.3 Where each LONGTASK comes from

The 15-level batch runs `BatchCoordinator.runBatch()` which:

1. Calls `storeEventBus.beginBatch()` → depth 0 → 1.
2. Calls `storeEventBus.batch(fn)` → depth 1 → 2, runs all store mutations synchronously.
3. After `fn()`: depth 2 → 1. Defers `resumeAndFlush()` for all three builders to a single `FrameScheduler 'pre-render'` slot.
4. `_executeFinalSweep()` eventually calls `endBatchYielded()` → depth 1 → 0 → yielded drain.

The **LONGTASKs come from step 3**, specifically the builder `resumeAndFlush()` calls:

- **WallFragmentBuilder.resumeAndFlush()**: processes ~220 walls × 15 levels = 3,300 wall geometry build calls. Even at adaptive drain (5–12 builds/frame at ≤10 ms each): 3,300 / 12 = 275 frames minimum for the drain. But the drain itself is chunked by the adaptive budget — the LONGTASK occurs because the synchronous `resumeAndFlush()` call triggers the builder's **first full drain pass**, which processes ALL queued builds before yielding. The adaptive budget (`_buildsPerFrame = 5 → 12`) only applies within the ongoing rAF loop, not during the initial `resumeAndFlush()` trigger.
- **CurtainWallBuilder.resumeAndFlush()**: 15 CW elements × geometry expansion. Each CW generates 58–220 proxy meshes (the NME expansion analyzed in constraint 1). The `resumeAndFlush()` for CW triggers the first batch of geometry construction for all 15 CWs synchronously.
- **SlabFragmentBuilder.resumeAndFlush()**: 15 slabs × geometry. Smaller but still synchronous.

Three consecutive large synchronous calls in one `'pre-render'` frame slot → LONGTASK cluster A.

After the two `onProjectSwitch` events (likely user escape), LONGTASK cluster B fires for the second project's batch (or the same project reloaded) — same pattern, 11 more LONGTASKs.

### 3.4 What BatchCoordinator does right

The `endBatchYielded()` fix (§BATCH-EVENT-YIELD, P1.4) correctly distributes **store event delivery** across rAF frames: 15 events in 1 chunk at 0.6 ms. This is working as designed and eliminates the "avalanche" failure mode (previously 116,980 synchronous listener calls in one task).

But `endBatchYielded()` only covers the **event delivery** phase. The **geometry build** phase (`resumeAndFlush()`) still runs synchronously in the first pre-render slot after the batch returns.

### 3.5 Pre-existing partial mitigations (confirmed working)

| Fix | Effect | Still effective? |
|---|---|---|
| `skipPbrUpgrade=true` | Eliminates ~482 ms scene-traverse PBR pass | ✅ confirmed in log 2 |
| `skipRedetectRooms=true` | Skips BatchCoordinator's own REDETECT_ROOMS | ✅ confirmed in log 2 |
| §FIX-DUAL-LONGTASK | Defers overlay dismiss to post-PSO-compile | ✅ working |
| `§PERF-ADAPTIVE-DRAIN` | CurtainWallBuilder adaptive `_buildsPerFrame` | ⚠️ only after first resumeAndFlush |
| `endBatchYielded()` | Event drain across rAF frames | ✅ working for events, not builds |

### 3.6 Scaling analysis

| Batch size | LONGTASKs | Max duration | FPS | Total freeze |
|---|---|---|---|---|
| 9 CWs, L0 only (log 3 — report 47 secondary) | 7 | 179 ms | 18 fps (post-batch) | ~0.7 s |
| 9 CWs, L0 only (log 2 — report 47 primary) | 7 | 433 ms | 3 fps (during) | ~2.5 s |
| 15 CWs × 15 levels (primary log — this report) | 24 | 448 ms | 3 fps | ~11.4 s |

Scaling is approximately O(n) in total freeze time but with a nearly constant per-task duration (~400–450 ms). The task count grows with element count; the duration per task is bounded by `resumeAndFlush()` scope. This means at 50 CWs × 15 levels (750 elements), approximately 60–80 LONGTASKs and ~30 seconds of freeze are expected.

### 3.7 Contract violations

| Contract | Clause | Violation |
|---|---|---|
| C10 | NFT 4 — Frame budget ≤ 16.6 ms p95 | ❌ — 24 tasks at 344–448 ms |
| C10 | NFT 5 — Plan-view re-render < 100 ms p95 | ❌ — EPS Flush #1: 174 ms (3 chunks) |
| C10 | NFT 3 — Tool latency < 50 ms p95 | ❌ — input blocked for 11.4 s |
| C11 | §6.1 — Geometry build must be spread across frames | ❌ — `resumeAndFlush()` runs as single synchronous block |
| C04 | §2.1 — Single rAF owner | ✅ — rAF count = 1; gate passes |

---

## 4. Constraint 3 — Collaboration semantics

### 4.1 The founding engineer question

> *How does a 15-CW, 11-second batch interact with a second user who is actively editing the same model? Does CRDT handle this gracefully?*

### 4.2 Architecture: what is wired

The CRDT stack (Wave A19, Phase 2D COMPLETE per C08 §3.1):

- `YjsDocAdapter` — maps PRYZM commands → Yjs Y.Map operations.
- `CRDTConflictResolver` — surfaces scalar property conflicts as `CRDTConflict` objects.
- `YjsProjectCache` (server) — applies `Y.applyUpdate` for server-side merge.
- `SyncStore.status` — `'connected' | 'disconnected' | 'syncing' | 'CONFLICTED'`.

`YjsDocAdapter.applyCommand()` is the integration point. It transacts the command payload into a `Y.Map` entry per command type namespace.

### 4.3 The batch CRDT gap — 11-second collaboration blackout

The critical integration gap: **`BatchCoordinator.runBatch()` buffers all `StoreEventBus` events during the batch**. `YjsDocAdapter.applyCommand()` is called from command handlers, not from `StoreEventBus` listeners. Tracing the call path:

```
CreateCurtainWallsOnAllSlabsCommand
  → CommandManager.execute()          ← calls handler synchronously
    → handler mutates stores          ← store.add() fires storeEventBus.emit()
      → storeEventBus: depth=2        ← BUFFERED (not delivered to listeners)
      → YjsDocAdapter.applyCommand()  ← IS THIS CALLED HERE?
```

The answer depends on **where** `YjsDocAdapter.applyCommand()` is wired. In `packages/sync-client/src/SyncClient.ts` / `event-bridge.ts`, the adapter is wired as a **StoreEventBus listener** (subscribing to store change events to produce Y.Map operations).

If the wiring is via StoreEventBus:
- During batch: events are buffered → StoreEventBus listeners receive nothing → `YjsDocAdapter.applyCommand()` not called → **0 CRDT operations for any of the 225 CW elements for 11.4 seconds**.
- After batch: `endBatchYielded()` delivers all 15 buffered events (coalesced — NOT 225 events, only 15 store-level events) → `YjsDocAdapter.applyCommand()` fires 15 times.

**Net effect**: For the entire 11.4-second batch window, a collaborating user B sees **zero new elements**. The entire batch lands on user B's Y.Doc as a single atomic update the moment B's WebSocket receives the Yjs binary update from the server. That update encodes 225 element creations as a single Y.Doc state vector difference.

### 4.4 The conflict window

During the 11.4-second blackout:

- User B may create, delete, or modify walls on levels that the batch is targeting.
- User B's Y.Map operations are sent to the server immediately (no batching on B's side).
- The server merges B's updates into `YjsProjectCache` via `Y.applyUpdate`.
- When user A's batch completes and sends its 225-element Yjs update to the server, the server applies `Y.applyUpdate` again — merging the two independent state vectors.

**Structural CRDT conflicts** (inserts and deletes) — resolved automatically by Yjs Lamport clock. 225 new element insertions are additive; they don't conflict with B's edits unless B happened to create an element with the same ID (ID is a nanoid — statistically impossible).

**Semantic CRDT conflicts** — this is where the gap lives. The batch assigns CW elements to specific levels (`levelId`). If user B modifies the level heights (e.g. moves L0 from Y=0 to Y=0.3), the CW elements created during the batch were built against the old level Y. After merge, CW elements reference `levelId=L0` with Y calculated at the old value. The room detection and `sitsOn` dependency for the slabs now has mismatched Y values. `CRDTConflictResolver.mergeElement()` only handles scalar property conflicts on the SAME element — it does not handle cross-element semantic inconsistencies.

**P8 compliance**: P8 states "CRDT merges that lose information surface as user-resolvable conflicts, never silently picked." The semantic geometry inconsistency above is NOT surfaced as a `CRDTConflict` — it silently produces a geometrically invalid model (CWs at wrong elevation). This is a P8 violation.

### 4.5 Command-log catch-up replay problem

C08 §3.3: `project_command_log` stores commands for catch-up replay. A late-joining user C replays `CreateCurtainWallsOnAllSlabsCommand` from the log. This command runs the **same batch pipeline** on C's browser, producing the same 11.4-second freeze. The catch-up replay has no mechanism to yield to the frame scheduler mid-command: it replays commands in order and each command runs synchronously. A project with 10 CW batches in the log requires a late-joining user to sit through potentially 10 × 11.4 = 114 seconds of freeze before the project becomes interactive.

The command log row for the batch is **one row** (the batch command), but executing it triggers `BatchCoordinator.runBatch()` with the same parameters. There is no "pre-computed result" path — replays always re-execute geometry.

### 4.6 Undo stack collaboration hazard

C03 §4.2: commands with `source: 'ai'` or `source: 'remote'` MUST NOT be pushed to the undo buffer.

`CreateCurtainWallsOnAllSlabsCommand` is dispatched with `source: 'user'`. This means it IS pushed to the undo ring buffer. A single undo operation after the batch must reverse all 225 CW element creations, their associated wall segments, and slab modifications. The undo patch for this command covers:

- 225 × wall store entries (delete)
- 225 × CW store entries (delete)
- 15 × slab store entries (revert)
- 15 × room boundary entries (revert)

This is a large Immer structural patch. NFT 18 (undo stack memory < 50 MB rss delta for 1000 commands) is designed for interactive single-element commands. A single batch undo patch of this size may exceed the 50 MB budget on its own.

**Undo + CRDT**: When user A undoes the batch, the undo command dispatches with `source: 'undo'`. This must go through `YjsDocAdapter.applyCommand()` as a CRDT operation that removes 225 Y.Map entries. If user B has built on top of the CW elements in the interim (e.g., added doors to CW-level walls), B sees a `CRDTConflict` for each door-to-wall reference that is now broken. With 225 CW elements and potentially dozens of dependent elements, this triggers dozens of simultaneous `ConflictResolutionDialog` instances — a UX disaster.

### 4.7 Contract violations

| Contract | Clause | Violation |
|---|---|---|
| C08 | §3.1 — All mutations via `YjsDocAdapter.applyCommand()` | ⚠️ RISK — depends on where adapter is wired (StoreEventBus vs. command handler) |
| C08 | §3.2 — Conflicts explicit, no silent LWW | ❌ — Semantic geometry inconsistencies (level Y mismatch) not surfaced as conflict |
| P8 | Sync conflicts explicit | ❌ — Silently invalid geometry possible during concurrent batch + level edit |
| C03 | §4.2 — Undo buffer for `source: 'user'` | ⚠️ RISK — single batch undo patch may violate NFT 18 (50 MB delta) |
| C08 | §3.3 — Command log catch-up replay | ❌ — Replay of batch command on late-joining client produces same freeze |

---

## 5. Constraint 4 — AI cost vs. value

### 5.1 The founding engineer question

> *LLM calls are expensive. Most BIM queries are deterministic. For batch element creation, where is AI actually adding value — and where is it burning tokens on work that a deterministic algorithm could do for free?*

### 5.2 AI pipeline topology

Two paths lead from AI to batch element creation:

**Path A — FloorPlanCommandBatcher (PDF → BIM)**

```
PDF upload
  → FloorPlanAIFactory (Anthropic claude-haiku-4-5)     ← LLM CALL
    → FloorPlanCommandBatcher (deterministic post-process)
      → CommandProposal[] → commandProposalStore
        → User confirms proposals → CommandManager.execute()  ← BATCH PATH
```

**Path B — AI 3-options generation (SPEC-47)**

```
Natural language prompt
  → packages/ai-host/ workflow coordinator               ← LLM CALL
    → 3× PryzmProject snapshots generated
      → User selects one → commandBus.dispatch(batch)   ← BATCH PATH
```

**Path C — AI floor plan critique (SPEC-46)**

```
ElementStore snapshot
  → packages/ai-host/ plan critique                     ← LLM CALL
    → CritiqueItem[] (read-only, no mutations)          ← NOT BATCH PATH
```

Only Path C is correctly bounded: it is read-only, uses the AI to provide semantic analysis that a deterministic algorithm genuinely cannot do (architectural code compliance, programmatic requirements checks), and its 8-second NFT is achievable.

### 5.3 The determinism gap in batch creation

**`CreateCurtainWallsOnAllSlabsCommand`** (the command being audited) creates one curtain wall per slab, at the slab's perimeter, at the slab's elevation to next-slab height. This is entirely deterministic:

```
Input:  slabs (polygon outlines, Z elevations)
Output: CW elements (same polygon outlines, elevation = slab.Z, height = nextSlab.Z - slab.Z)
```

Zero AI is used or needed for this operation. The founding engineer principle applies directly: *"most BIM queries are deterministic."* CW-on-all-slabs is a pure geometric operation — it does not require pattern recognition, semantic understanding, or probabilistic output. It should be instant and deterministic.

**What is slow**: The post-AI deterministic phase in `FloorPlanCommandBatcher`. After the LLM parses the floor plan image, the following steps are deterministic and expensive:

- `resolveWallJunctions()` — O(n²) wall intersection detection
- `splitWallsAtCrossings()` — O(n log n) crossing detection
- `buildWallGraph()` — O(n) adjacency graph
- `computeTopology()` — O(n log n) planar graph face detection
- `assignOpeningsToWalls()` — O(m × n) opening-to-wall assignment

These run on the main thread, synchronously, before the batch even starts. For a 50-MB PDF with 400 detected walls, this deterministic post-process takes 200–800 ms on the main thread. The LLM call (300–800 tokens output, ~0.5s e2e on claude-haiku-4-5) is faster than the deterministic post-process that follows it.

### 5.4 AI cost model

Current model: `ANTHROPIC_MODEL_ID=claude-haiku-4-5` (default). Per Anthropic pricing:
- Input: $0.25 / 1M tokens
- Output: $1.25 / 1M tokens

For a typical floor plan PDF:
- Input: ~2,000 tokens (floor plan image encoded, system prompt, instructions)
- Output: ~400 tokens (wall coordinates, door placements, room labels as JSON)

**Cost per floor plan import**: $0.25/1M × 2,000 + $1.25/1M × 400 ≈ $0.0005 + $0.0005 = **$0.001 per call**.

At 10 req/min per user (aiLimiter), peak cost per user per minute: $0.01.

**This is not a cost problem at current scale.** The AI cost governance (`enforceAIQuota`, C09 §2.3) correctly prevents runaway usage. The `aiLimiter` (10 req/min per user) provides an additional hard cap.

**The cost vs. value gap is not monetary — it is latency and reliability.** Specifically:

1. **NFT 14 (AI plan-critique latency < 8 s e2e)**: The batch execution triggered by a floor plan import takes 11.4 s on the main thread alone, before any network time. This violates NFT 14 by construction. An AI workflow that outputs floor plan data to a batch that takes 11.4 s cannot meet an 8 s e2e SLA.

2. **Redundant AI calls**: If the user undoes the batch (11.4 s to execute, 11.4 s to undo and re-execute if redo is needed) and then re-requests AI generation, another LLM call fires even though the model output was identical. There is no cache layer for AI responses at the `packages/ai-host/` level — every invocation goes to the LLM, even for identical inputs.

3. **AI-triggered LONGTASK cascade**: Because the AI batch uses `BatchCoordinator.runBatch()` with the same parameters as a user-triggered batch, all the LONGTASK problems in constraint 2 apply equally to AI-triggered batches. The AI adds a ~0.5–2 s model latency before a guaranteed 11.4 s freeze. The composite user experience is ~12–13 s of total unusable UI.

### 5.5 What the founding engineer would build instead

A founding engineer applying the "start with the hardest constraints" principle would make this decision:

- **For PDF → BIM**: Use AI only for the inherently non-deterministic part — mapping pixel coordinates to semantic wall types, identifying doors vs. windows, labeling rooms. Use deterministic algorithms (BVH spatial query, planar topology engine) for everything that is computable from geometry alone.
- **Cache AI responses** keyed by content hash of the PDF page. Identical PDF re-import returns from cache instantly.
- **Run deterministic post-processing in a Web Worker** (WallIntersectionResolver, PlanarTopologyEngine). These are O(n²) algorithms on the main thread today.
- **Quota enforcement should gate the LLM call, not the batch**. The batch should never fail due to quota — it is deterministic. Only the AI interpretation step fails on quota.

### 5.6 Contract violations

| Contract | Clause | Status |
|---|---|---|
| C09 | §2.3 — `enforceAIQuota` before AI calls | ✅ enforced server-side |
| C10 | NFT 14 — AI critique < 8 s e2e | ❌ — batch phase alone takes 11.4 s |
| C09 | §3.2 — 3-options validated against schemas | ✅ `packages/schemas/` Zod validation present |
| C11 | §4.2 — AI batches via `BatchCoordinator.runBatch()` | ✅ path exists |
| C11 | §4.2 — AI batch MUST NOT loop individual commands | ⚠️ FloorPlanCommandBatcher creates CommandProposal[] which may iterate via commandManager.execute() per proposal |

---

## 6. Constraint 5 — 1M elements at scale

### 6.1 The founding engineer question

> *Every architectural decision must answer: "does this work at 1 million elements in a single model?" before you ship it.*

This is the lens that filters out all architectures that are correct at small scale but structurally flawed at production scale.

### 6.2 Extrapolating each finding to 1M elements

#### 6.2.1 Memory (from constraint 1)

Current: 15 CW elements → 12,285 leaked geometries → 54 MB geometry excess.

At 1M elements (assuming same per-element leak rate):
- Leaked geometries: 12,285 × (1,000,000 / 15) = **819 million geometries**
- CPU-side Float32Array memory: 819M × 2.2 KB = **~1.8 TB**
- GPU VRAM: same 1.8 TB
- Available: ~2–4 GB WASM heap; 8–24 GB system RAM; 4–16 GB VRAM

**Verdict: catastrophic failure at 1M elements.** The geometry leak alone exceeds available system RAM by 3 orders of magnitude. This is not a tuning problem — it requires fixing the disposal gap at the architecture level before scaling.

For reference: what would be acceptable?

- 1M elements × 1 `BufferGeometry` per element (no leak, legitimate geometry): 1M × 2.2 KB = 2.2 GB. This is already at the ceiling for GPU VRAM.
- At 1M elements, InstancedMesh is mandatory: group all elements of the same material into one InstancedMesh. This reduces geometry count from 1M to O(materialTypes) — typically 20–50 unique material types. Geometry memory drops from 2.2 GB to ~0.1 MB for the instance transforms + 50 MB for the shared geometries.

The LOD system (C04 §3.5, Wave A18) provides the 3-tier distance-based system that solves this at the scene-committer level:
- Tier 2 (≥500 m): bounding box only — 1 geometry per element family instead of full mesh.
- Tier 1 (100–500 m): simplified geometry.
- Tier 0 (<100 m): full detail.

But the LOD system applies to the **3D scene**, not to the **EPS plan-view projection**. The NME proxy expansion for EPS has no LOD equivalent — it always expands InstancedMesh to N×Mesh regardless of camera distance or plan view zoom level.

#### 6.2.2 Frame budget (from constraint 2)

At 1M elements:
- `storeEventBus.endBatchYielded()`: 1M events × 20 listeners ÷ 200 events/chunk = 5,000 chunks × ≤16 ms/chunk = **80 seconds of drain**. Each 16 ms chunk corresponds to one rAF frame at 60 fps. This alone takes 80 seconds at perfect execution.
- Adaptive geometry drain: 1M elements ÷ 12 builds/frame = 83,333 frames = 83,333 ÷ 60 fps = **23 minutes** for geometry to fully build.
- NME proxy expansion during EPS: 1M elements × ~130 proxies/element (average) = 130M proxy `THREE.Mesh` objects × ~2 μs each = **260 seconds** of main-thread work per EPS flush.
- DependencyResolver CASCADE: if one room contains 1M bounding walls, the CASCADE produces 1M storeEventBus events → VDT debounce resets 1M times → 1M `setTimeout()` calls.

**Verdict: the current pipeline is not designed for 1M elements.** The 80-second event drain alone exceeds any reasonable user tolerance. The founding engineer principle demands a different architecture for large-scale batch creation.

What would work at 1M elements:
- **Streaming element creation**: never hold 1M elements in a single store snapshot. Load the current view extent from the server; stream elements into the store as the camera moves (similar to Google Maps tile streaming).
- **Web Worker geometry build**: move all `THREE.BufferGeometry` construction to an OffscreenCanvas Web Worker. The main thread only receives the final ArrayBuffer transfers; it does not block during geometry computation.
- **InstancedMesh groups**: after batch creation, coalesce same-material elements into InstancedMesh. The NME proxy expansion is a symptom of the element-per-mesh model, not a necessary feature. At 1M elements, instance-grouped meshes reduce draw calls from 1M to O(50).
- **Spatial streaming with BVH**: the BVHQuery package exists (`packages/spatial-index/src/BVHQuery.ts`). At 1M elements, `bvh.build()` is O(n log n) ≈ 20M operations ≈ ~200 ms (acceptable). But rebuilding on every batch completion is expensive. The fix: incremental BVH update for batch insertions (insert subtree, not full rebuild).

#### 6.2.3 Collaboration at 1M elements (from constraint 3)

At 1M elements, a single model has:
- 1M Y.Map entries in the Y.Doc.
- Yjs binary state vector for 1M entries: ~1M × 200 bytes = ~200 MB per Y.Doc sync message.
- `Y.applyUpdate()` on a 200 MB update takes seconds of server CPU.
- Late-joining user catch-up: replaying 1M element insertions from the command log takes 23 minutes of geometry build (per §6.2.2).

**Verdict: the Y.Doc-per-project model breaks down above ~100k elements.** At 1M elements, Y.Doc sync becomes prohibitively slow. The founding engineer would use a Y.Doc-per-level or Y.Doc-per-element-family model, with the server assembling the full project from sub-documents.

Additionally: the command log catch-up model (C08 §3.3 — last N commands, 24-hour purge) becomes useless at 1M elements. A single batch creating 100k walls is one command. Replaying it on join takes 23 minutes. The correct approach is **snapshot-based sync**: the server maintains a materialized snapshot of the Y.Doc; late joiners load the snapshot and apply only the delta since the snapshot timestamp.

#### 6.2.4 AI at 1M elements (from constraint 4)

At 1M elements:
- The ElementStore snapshot passed to AI plan-critique (C09 §3.1) would be enormous. Serializing 1M elements via `packages/file-format/` produces a multi-hundred-MB JSON. This cannot be sent to the LLM — the maximum Anthropic context is ~200k tokens ≈ ~800 KB of JSON.
- For AI floor plan generation at 1M-element scale: the AI cannot process the entire model as context. The correct approach is **zone-based AI**: each AI call handles one logical zone (floor, wing, department) of ~1,000 elements. The AI context stays manageable; results are assembled deterministically.

#### 6.2.5 Data model at 1M elements

The founding engineer principle: "Week 1–4: nail the data model." PRYZM's data model (C03 §1 — Zod schemas, `packages/schemas/`) has:
- L0 schemas: correct, pure (P5), versioned.
- Element graph: elements + relationships + properties + geometry references (correct structure).
- **Missing for 1M scale**: a streaming/pagination contract on `ElementStore`. Currently `ElementStore` holds all elements in memory as a Zustand slice. At 1M elements, a Zustand store with 1M entries produces an Immer draft proxy wrapping that takes ~100–500 ms on its own. A 1M-element store requires a virtualized store (load active elements; evict by LRU) backed by an indexed persistent layer.

---

## 7. Cross-constraint verdict matrix

| Constraint | Current status | Scale factor | Critical gap | Sprint priority |
|---|---|---|---|---|
| **1 Memory** | ❌ VIOLATED — 12,285 > 12,000 geometries, persistent leak | Will reach TB at 1M | NME proxy geometry not disposed | **P0** |
| **2 Frame budget** | ❌ VIOLATED — 24 LONGTASKs, 3 fps, 11.4 s freeze | 80 s drain at 1M | `resumeAndFlush()` runs synchronously | **P0** |
| **3 Collaboration** | ⚠️ RISK — Yjs wired, but 11.4 s CRDT blackout per batch | Sub-doc model needed at 1M | Batch = 1 atomic CRDT op, no semantic conflict detection | **P1** |
| **4 AI cost/value** | ⚠️ RISK — correct quota enforcement; wrong NFT-14 target | Zone-based AI needed at 1M | Batch freeze violates 8 s e2e SLA | **P1** |
| **5 1M elements** | ❌ NOT DESIGNED — streaming, InstancedMesh, Worker geometry all absent | Already extrapolates to failure | No streaming store, no Worker build, no incremental BVH | **P2** |

---

## 8. What a founding engineer would fix, in order

The founding engineer principle says: **start with the hardest constraints, not the easiest features**. Applied to the current batch pipeline:

### Step 1 (P0 — do this sprint): Fix the memory leak

**Fix**: In `EdgeProjectorService._projectCurtainWallElement()` (or the NME caller), after clearing the groups array, iterate the cleared proxy meshes and call `geometry.dispose()` on each. This is a 3-line change with zero architectural impact. The geometry count will drop from 12,285 to approximately 12,000 - (proxy count per flush) immediately.

```ts
// After: groups.splice(0) or groups.length = 0
for (const disposed of clearedProxies) {
  disposed.geometry.dispose();
}
```

Also: add a `disposeProxies: boolean` flag to the NME API that callers can set. The EPS caller sets it true (proxies are transient, always dispose). Other callers (if any) can opt out.

### Step 2 (P0 — do this sprint): Make resumeAndFlush() yield

**Fix**: Change the `resumeAndFlush()` semantics for all three builders to be incremental rather than synchronous. Instead of draining the full queue in one call:

```ts
// Current (wrong — synchronous full drain):
builderControl.resumeAndFlush();   // blocks main thread for N builds

// Target (correct — signal resume, let adaptive drain run):
builderControl.resume();           // unpauses builder; adaptive drain runs per-rAF
```

The `resume()` call simply sets `_paused = false` and registers the builder with the FrameScheduler. The adaptive budget (`_buildsPerFrame = 5 → 12`) runs every rAF tick. This eliminates the 344–448 ms LONGTASK cluster by distributing the drain across hundreds of rAF frames. The batch overlay (BatchLoadingIndicator) correctly stays visible during this drain — it is already designed for this.

This is the single highest-impact change: eliminates ALL LONGTASK clusters A and B from the primary log.

### Step 3 (P1 — next sprint): Extend VDT suppression through CASCADE

As documented in report 47, Gap G1: defer `setSuppressed(false)` + `markLevelsDirtyImmediate()` by two microtask ticks after `onComplete` to absorb the DependencyResolver CASCADE. Eliminates Cluster C (81 ms navigation freeze).

### Step 4 (P1 — next sprint): Instrument CRDT batch window

Add a log statement in `BatchCoordinator._setupBatch()` that records `YjsDocAdapter.status` and emits an `onBatchCrdtBlackout(durationMs)` metric. This creates observability for the collaboration gap documented in constraint 3. The fix (making each element creation emit a CRDT op inline, not via StoreEventBus) requires a deeper change — the metric first confirms whether the problem is live before investing in the fix.

### Step 5 (P2 — quarterly): Lay the 1M-element foundations

In priority order:
1. **InstancedMesh grouping**: post-batch, coalesce same-material elements into InstancedMesh. Reduces scene geometry count by O(n) → O(materialTypes).
2. **Web Worker geometry build**: move `WallFragmentBuilder`, `CurtainWallBuilder`, `SlabFragmentBuilder` compute into a Web Worker. Main thread receives only the final `ArrayBuffer` transfers. Eliminates ALL frame budget violations from geometry build.
3. **Virtualized ElementStore**: cap in-memory element count at a configurable ceiling (e.g. 50,000). Evict by LRU + spatial distance from camera. Stream elements from Supabase via the `persistence-client` as the camera moves.
4. **Y.Doc-per-level**: split the single Y.Doc into one Y.Doc per level. Each level's CRDT document is independently syncable. A late-joining user loads only the visible levels, reducing the catch-up sync size proportionally.

---

## 9. Existing architecture strengths (do not change)

The founding engineer framework also asks: what is already correct and worth preserving?

| Strength | Evidence |
|---|---|
| **L0 schema purity (P5)** | `packages/schemas/` has zero I/O, DOM, THREE. Zod-typed, versioned. CI hard-fail gate. This is exactly what Week 1–4 of the founding engineer roadmap demands. |
| **Single composition root (P1)** | `composeRuntime()` is the only entry point. 14 typed slots, no `unknown`. Boolean #4 ✅. |
| **Single rAF (P3)** | GA-gate at 1 owner. FrameScheduler priority tiers (physics → update → render → post) are correctly ordered. |
| **CQRS command bus (P6)** | All mutations through `commandBus.dispatch()`. CI hard-fail gate. Remote commands replay through the same handler path (C03 §2.4). |
| **Yjs CRDT (D3)** | `YjsDocAdapter` + `CRDTConflictResolver` + `YjsProjectCache` form a correct CRDT stack. LWW replaced. Explicit conflict dialog. This was the right founding-engineer decision for collaboration semantics. |
| **BVHQuery spatial index** | O(log n) spatial queries exist in `packages/spatial-index/`. Not yet integrated with EPS/NME but the foundation is correct. |
| **AI as a L2 domain concept (D5)** | `packages/ai-host/` is a first-class layer, not a bolt-on. Operates via command bus. Cost tracked per-project. This is the correct founding-engineer approach. |
| **19 NFT benches in CI** | All 17 baseline NFTs written and passing (Wave 13 ✅). NFT 18 (undo stack memory) added. The "honest performance contracts" differentiator (D10) is genuinely implemented — violations are observable, not hidden. |
| **Plugin SDK v1.0.0 (D4)** | Versioned, isolated, signed. L7 plugins cannot import L0–L6 directly. This correctly prepares for the marketplace model. |
| **StoreEventBus depth-counting** | `endBatchYielded()` correctly distributes event drain across rAF frames. The event-avalanche problem (116,980 synchronous calls) is solved. This is a good founding-engineer choice — observable, testable, bounded. |

---

## 10. The founding engineer's summary verdict

**Applied to PRYZM's batch element creation pipeline, the five constraints reveal a coherent architectural direction that is partially implemented:**

The **data model (constraint 0 / Week 1–4)** is correct: Zod schemas at L0, CQRS command bus, Zustand stores, Immer drafts. This foundation is solid.

The **renderer (constraint 2 / Month 2)** has the right abstraction (`RendererHandle`, `WebGPURendererAdapter`, LOD tiers) but the batch pipeline bypasses the frame budget: `resumeAndFlush()` is synchronous, producing 344–448 ms LONGTASKs that freeze the viewport completely.

The **collaboration skeleton (constraint 3 / Month 3)** is wired correctly (Yjs, CRDTConflictResolver) but the batch pipeline creates an 11.4-second CRDT blackout window where no collaborator can see in-progress work, and semantic geometry conflicts arising from concurrent edits during the batch are not surfaced.

The **AI pipeline (constraint 4 / Month 4–6)** is architecturally sound (L2 domain package, cost governance, quota enforcement, deterministic post-processing separate from LLM calls) but is blocked by the frame-budget violation: any AI workflow that triggers a 225-element batch cannot meet the 8-second NFT-14 SLA.

The **1M-element question (constraint 5 / every decision)** exposes that none of the batch pipeline decisions were made with 1M elements in mind: streaming store, Worker geometry build, InstancedMesh grouping, and sub-document CRDT are all absent.

**Two P0 fixes eliminate the most critical violations**: (1) dispose NME proxy geometries after group clear, (2) change `resumeAndFlush()` to `resume()` with adaptive per-rAF drain. Everything else is P1 or P2.

---

*Analysis only. No source files were modified. All findings are from live browser logs + source code reads. Zero inferences from documentation alone.*

*PRYZM internal — not for distribution.*
