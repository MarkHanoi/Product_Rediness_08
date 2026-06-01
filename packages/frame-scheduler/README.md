# `@pryzm/frame-scheduler`

PRYZM 2 frame scheduler — L5 of the architecture stack (S02–S03).

Owns the **single `requestAnimationFrame` loop** for the PRYZM 2 render path.
Every subsystem that needs a render frame calls `scheduler.requestFrame()` —
no direct `requestAnimationFrame()` calls are allowed outside this package
(enforced by the `pryzm/no-raf` ESLint rule).

## API surface

```ts
import {
  FrameScheduler,
  WorkerPool, WorkerPoolExhaustedError, WORKER_POOL_CAP,
  IdleContinuation, IDLE_CONTINUATION_FRAMES,
  FakeRafAdapter,
  type Priority, type TickPriority, type TickListenerDisposer,
} from '@pryzm/frame-scheduler';
```

### `FrameScheduler`

```ts
const scheduler = new FrameScheduler({ adapter: GlobalRafAdapter });

// Queue a frame-request in the priority queue.
scheduler.requestFrame('camera-move', 'interaction');  // runs next rAF

// Mark a named dirty flag (survives across ticks until cleared by owner).
scheduler.markDirty('wall-store');
scheduler.clearDirty('wall-store');
scheduler.isDirty('wall-store'); // → boolean

// Register a tick listener (runs every tick, in TickPriority order).
const dispose: TickListenerDisposer = scheduler.addTickListener({
  id: 'my-subsystem',
  priority: 'render',
  callback: (nowMs, deltaMs) => { /* draw */ },
});
dispose(); // unregister

// Lifecycle.
scheduler.start();
scheduler.stop();
```

**Priority queue** (S02-T7): frames are dequeued in order
`interaction` → `idle` → `background`.

**Idle-continuation budget** (ADR-006, S03-T2): after all dirty flags clear,
the scheduler continues for `IDLE_CONTINUATION_FRAMES` (30) more frames before
calling `stop()`. This lets SSAO/TRAA settle without keeping the loop alive
indefinitely ("0 fps idle" property).

### `WorkerPool` — hard cap of 4 (S03-T2a)

Per `[strategic ADR-005]`, the frame scheduler enforces a **hard cap of 4**
browser Web Workers across the PRYZM 2 instance.

```ts
const pool = new WorkerPool();         // default cap = 4

const w = pool.spawn(() => new Worker(url));  // OK if count < 4
// 5th spawn throws WorkerPoolExhaustedError:
//   e.code === 'worker.pool.exhausted'
//   e.cap  === 4

pool.release(w);   // terminates + deregisters
pool.count;        // current live workers
pool.available;    // remaining slots
pool.exhausted;    // true when count >= cap
pool.dispose();    // terminate all
```

`WorkerPoolExhaustedError` has a machine-readable `code` field:
`'worker.pool.exhausted'`.  Log it to OTel and surface as a user-visible
toast in the editor.

### `FakeRafAdapter` — test harness

```ts
const fake = new FakeRafAdapter();
const scheduler = new FrameScheduler({ adapter: fake });
scheduler.start();

scheduler.requestFrame('test', 'interaction');
fake.flush(performance.now());   // runs one tick synchronously
```

## Architecture

| Concept | Owner | Source |
|---|---|---|
| `Priority` (`interaction`/`idle`/`background`) | S02-T7 | Queue-class — *when* the frame is scheduled |
| `TickPriority` (`pre-render`/`render`/`post-render`/`overlay`) | S02-T7 | Render-phase ordering — *where* inside one rAF a listener runs |
| Idle-continuation budget | ADR-006 (S03-T2) | 30 frames after motion stops |
| Worker pool cap | ADR-005 (S03-T2a) | 4 browser Web Workers maximum |

See `docs/04-reference/architecture-detail/frame-scheduler.md` for the full design brief.

## Sprint citations

| Sprint | Sub-phase | Deliverable |
|---|---|---|
| S02 | T7 | `Priority` enum + `requestFrame` + `drainSync` priority queue |
| S02 | T8 | `markDirty/isDirty` + OTel `pryzm.frame.tick` span |
| S03 | T1 | Real rAF pump (`start`/`stop`/`cancelFrame`), `addTickListener` |
| S03 | T2 | `IdleContinuation` 30-frame budget; `pryzm.frame.idle-continuation` OTel event |
| S03 | T2a | `WorkerPool` hard cap of 4; `WorkerPoolExhaustedError` |
