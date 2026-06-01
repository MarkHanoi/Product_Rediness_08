# ADR-047 — Web Worker Geometry Build Pipeline

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-05-09 (implemented Task 4.2; §4.2-ROBUST-FALLBACK resilience layer added 2026-05-09) |
| Closes | Phase J.2 (45-CW-SLAB-BATCH-IMPLEMENTATION-PLAN.md) |
| Required by | 1M-element milestone (quarterly) |
| Owner | Engine lead |
| Constraint reference | C04 §3.5 (FrameScheduler), C10 NFT-4 (frame budget), C11 §5.2/§6.1 |

---

## Context

`CurtainWallBuilder._drainBuildQueue()`, `WallFragmentBuilder._drainBuildQueue()`, and `SlabFragmentBuilder._drainBuildQueue()` all run on the **main thread**. The adaptive drain budget (`_buildsPerFrame`, §PERF-ADAPTIVE-DRAIN) limits each frame to ≤12 walls at ≤10ms, but geometry computation (BufferGeometry attribute construction, EdgesGeometry) still runs synchronously within that budget.

At 1M elements, even ≤10ms/frame geometry work compounds:

- 1M walls ÷ 12 walls/frame = 83,333 frames needed = **1,389 seconds (23 minutes)** to drain.
- PerformanceObserver still detects 10ms tasks as LONGTASKs in some browser implementations.
- Main thread geometry work prevents GPU command submission, input processing, and UI updates.

Phase F.2 (`§F2-RESUME-ONLY`) addressed the immediate 53-LONGTASK regression (11s → <1.2s to interactive). Phase J.2 makes geometry build **frame-budget-proof at any scale** by moving it off the main thread.

### Current state

```
Main thread:
  FrameScheduler 'pre-render' tick
    → CurtainWallBuilder._drainBuildQueue()
      → _buildOne(element)  ← BufferGeometry + EdgesGeometry computation
        → scene.add(mesh)   ← must be main thread
```

The bottleneck is `_buildOne()` — specifically the typed-array assembly and attribute upload to GPU. The `scene.add()` call must remain on main thread.

### Options evaluated

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | `OffscreenCanvas` Worker: move full geometry computation to a dedicated worker; transfer `ArrayBuffer` to main thread via `postMessage({ buffer }, [buffer])` | Zero main-thread geometry work; zero-copy transfer | Requires THREE.js geometry reconstruction on main thread from raw buffers; worker cannot access scene |
| **B** | `ComputePipeline` WebGPU compute shader: generate geometry in GPU compute | Parallelises across GPU cores | WebGPU compute is not yet universally available; complex debug |
| **C** | SharedArrayBuffer geometry staging: write geometry into shared memory; main thread reads without copy | True zero-copy | Requires `Cross-Origin-Isolation` headers (COOP/COEP); breaks some third-party embeds |
| **D** | Incremental batching: split `_buildOne()` into micro-tasks using `scheduler.postTask()` | No worker overhead; works today | `scheduler.postTask()` not universally available; still main thread |

---

## Decision

**Option A — OffscreenCanvas Worker with zero-copy `ArrayBuffer` transfer**:

Architecture:

```
Worker thread (GeometryBuildWorker):
  receives: { element: SerializedElement, templateHash: string }
  computes: Float32Array positions, Float32Array normals, Uint32Array indices
  sends: postMessage({ wallId, buffers: { positions, normals, indices } }, [positions.buffer, normals.buffer, indices.buffer])

Main thread (CurtainWallBuilder):
  receives transferred ArrayBuffers
  constructs BufferGeometry from received attributes (zero allocation — arrays transferred)
  calls scene.add(mesh) ← remains main thread
```

**Worker contract**:
- `GeometryBuildWorker` receives `SerializedElement` (plain JSON — no THREE.js objects).
- Returns raw typed-array buffers via structured clone transfer (zero-copy ownership transfer).
- Main thread reconstructs `THREE.BufferGeometry` from received buffers:
  ```typescript
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  ```
- Panel material assignment and `scene.add()` remain on main thread (THREE.js requirement).

**FrameScheduler integration**: `_drainBuildQueue()` posts work to the worker and immediately yields. Results arrive via `worker.onmessage` — enqueued into `_pendingMainThreadWork[]`. On next `'pre-render'` tick, main thread processes `_pendingMainThreadWork` (geometry reconstruction + scene.add only — fast).

---

## Consequences

### Positive

- Main thread geometry time: `~8ms/wall → ~0.3ms/wall` (only `BufferGeometry` reconstruction + `scene.add`).
- Build drain no longer contributes to LONGTASKs at any batch size.
- Worker can run at full CPU speed without frame budget constraints.
- Parallelism: `navigator.hardwareConcurrency` workers → `N` walls built concurrently.

### Negative / constraints

- **`SerializedElement` contract**: all geometry inputs must be serialisable (no THREE.js object references). Enforced at the worker boundary — compile-time type check.
- **I-5 compliance**: `_pendingMainThreadWork` processed exclusively via `getFrameScheduler()` `'pre-render'` tick. Worker `postMessage` never directly calls `scene.add()`.
- **I-6 compliance**: worker bootstrapping does NOT use `(window as any)` — worker receives all needed config via the initial `postMessage` handshake.
- **SharedArrayBuffer**: Option C (SharedArrayBuffer) is explicitly deferred to a separate ADR because it requires `Cross-Origin-Isolation` headers that may impact the plugin iframe sandbox (C07 §3.1).
- **Debugging**: Worker stack traces are harder to attribute. `otel.trace.startSpan()` in worker context requires OpenTelemetry propagation via `postMessage` context. Deferred to a follow-up observability ADR.

---

## §4.2-ROBUST-FALLBACK — Worker resilience layer (2026-05-09)

Root-cause analysis of the live curtain-wall silent-hang bug (168 requests dispatched; 0 meshes committed; 30 s BatchCoordinator watchdog fires) revealed three failure modes not covered by the original decision:

| # | Failure mode | Root cause |
|---|---|---|
| F1 | `dead`-before-dispatch race | Worker `error` fires before `pw.inflight` is populated; promise permanently unresolved |
| F2 | No per-request timeout | Dead worker leaves promises hanging until 30 s watchdog kills the batch |
| F3 | Worker exception silently swallowed | No `try/catch` around `processRequest`; unhandled throw exits the worker with no `postMessage` |

### Fixes applied

**`geometry.worker.ts`** — wraps the entire `processRequest` call in `try/catch`; on error posts back `{ error: message, fallbackPanels: [], ...nulls }` rather than silently dying.

**`GeometryWorkerTypes.ts`** — adds `error?: string` to `GeometryWorkerResult` (optional, backward-compatible with all existing consumers).

**`GeometryWorkerPool.ts`** — three-layer guard:
1. **`dead` flag + `allDead` fast-reject** — `PendingWorker.dead` is set on `error` or `messageerror` event; `dispatch()` fast-rejects before `postMessage` if every worker is dead.
2. **`messageerror` handler** — registered alongside `error`; marks worker dead and rejects inflight with `[messageerror]` prefix.
3. **`DISPATCH_TIMEOUT_MS = 10 000`** per-request `setTimeout` — if the worker never replies, the `settled` guard fires, rejects the promise with `timeout after 10000ms`, and clears itself. `terminate()` also calls `clearTimeout` on all pending timers.

### Invariant compliance

- **P2**: worker never imports `three`; error result uses only primitives. ✅
- **P3**: timeout uses `setTimeout`, not `requestAnimationFrame`. ✅
- **P8**: existing OTel `geo-worker.dispatch` spans cover error, timeout, and dead-pool paths via `span.setStatus(ERROR)` + `span.end()`. ✅
- **C11 §6.1**: fallback path (`CurtainWallBuilder.build()`) is unchanged; error result triggers the same `catch` that previously handled worker pool spawn failure. ✅

### New test coverage

`GeometryWorkerPool.test.ts` extended with 12 new specs covering all three failure modes:
- Dead worker via `error` event → inflight rejected, `dead=true`, next dispatch skips dead worker.
- Dead worker via `messageerror` event → same.
- All-dead pool fast-reject (no `postMessage` sent).
- Error result forwarded from worker → `dispatch()` rejects; worker remains alive for subsequent requests.
- Per-request timeout (`vi.useFakeTimers()`) → rejects after 10 001 ms.
- Timeout cleared on normal response (no double-reject, no timer leak).
- Two concurrent timeouts fire independently.
- Error result followed by normal request (worker not dead).

Total test count: `GeometryWorkerPool.test.ts` = 23 specs; `geometry-worker-math.test.ts` = 10 specs. All pass; `pnpm tsc --noEmit` → 0 errors.

---

## Implementation gate

ADR-047 is **Accepted** (2026-05-09). All five original gate criteria have been met:

1. ✅ Prototype `GeometryBuildWorker` for curtain wall geometry — `apps/editor/src/workers/geometry.worker.ts`.
2. ✅ Main-thread frame time measured; adaptive `_buildsPerFrame` drain budget (C11 §PERF-ADAPTIVE-DRAIN) confirmed < 10 ms per drain cycle.
3. ✅ `BufferGeometry` reconstructed from transferred typed arrays verified against synchronous path (vertex counts, face normals, UV layout) via `geometry-worker-math.test.ts`.
4. ✅ Worker terminates cleanly on `pryzm-project-switch`; `GeometryWorkerPool.terminate()` clears all inflight timers, rejects promises, and calls `Worker.terminate()` on each pool member.
5. ✅ ADR promoted to **Accepted** here.

---

## References

- doc 48 §6.2.2, §8 Step 5
- `src/engine/subsystems/curtainwalls/CurtainWallBuilder.ts` (`_buildOne`, `_drainBuildQueue`)
- `src/engine/subsystems/walls/WallFragmentBuilder.ts` (`_buildOne`, `_drainBuildQueue`)
- Phase F.2 (§F2-RESUME-ONLY) — immediate LONGTASK fix; J.2 is the long-term structural fix
- C04 §3.5 (FrameScheduler), C10 NFT-4 (frame budget ≤16.6ms p95)
