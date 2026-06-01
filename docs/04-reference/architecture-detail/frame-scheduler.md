# L5 frame-scheduler — API reference

> Status: API frozen at S02 (data-structure skeleton only).  S03 adds
> `requestAnimationFrame` + idle-continuation pump per ADR-006.
>
> Owner package: `packages/frame-scheduler/`.

## Why this package exists

Exactly **one** module in the entire codebase is allowed to call
`requestAnimationFrame`.  The `pryzm/no-raf` ESLint rule (ships hard-fail
in S02) blocks every other location in PRYZM 2 packages, and the
`tools/scripts/check-raf-count.mjs` snapshot-diff blocks new rAF call
sites in PRYZM 1's `src/` tree.  This is the module.

This separation exists because:

- The renderer, committer, and post-effects pipeline all need to share
  a single rAF callback so the browser only paints once per frame.
- Plugins must not be able to spawn their own animation loops — every
  visible mutation must go through `requestFrame(reason, priority)`.
- The `idle-cpu` bench (S03 hard-fail at < 2 %) needs a single observation
  point to attribute CPU time across lanes.

## API surface

```ts
import { FrameScheduler } from '@pryzm/frame-scheduler';

const scheduler = new FrameScheduler();

// 1. Dirty-flag set — coarse "something changed" markers.
scheduler.markDirty('camera');
scheduler.isDirty('camera');         // → true
scheduler.isDirty();                 // → true (any flag set)
scheduler.clearDirty('camera');
scheduler.dirtyFlagsSnapshot();      // sorted snapshot for tests

// 2. Frame requests — priority queue.
const id = scheduler.requestFrame('wall.create:committed', 'interaction');
scheduler.getPending();              // readonly snapshot
scheduler.pendingByPriority();       // counts per lane

// 3. Drain (S02 = sync hook for tests; S03 wires to rAF).
const result = scheduler.drainSync();
result.drained;                      // FrameRequest[] in priority order
result.remaining;                    // count not drained

// `drainSync(maxLanes)` allows the rAF pump to drain only some lanes
// (e.g. skip 'idle' when the budget is exhausted per ADR-006).
scheduler.drainSync(['interaction', 'background']);

// 4. Reset — used by the project loader (S04 clear-on-load).
scheduler.reset();
```

### Queue-class priority (`Priority`)

Three values per `§S02-T7` (line 299).  Strictly ordered; lower index
drains first.  Inside a lane: FIFO by ULID.

| Lane          | When to use |
|---------------|-------------|
| `interaction` | Pointer/keyboard input, camera tween, gizmo follow, every-frame work that must paint within 16 ms. |
| `idle`        | TRAA, BVH refit, SSGI accumulation — eligible only inside the idle budget (ADR-006). |
| `background`  | Bake-worker progress UI, telemetry flush. |

### Render-phase ordering (`TickPriority`)

Orthogonal to `Priority`.  Copied verbatim from
`src/core/rendering/UnifiedFrameLoop.ts:95-98`:

| Phase         | When it runs |
|---------------|-------------|
| `pre-render`  | Camera updates, dirty-flag clear, input-state snapshot. |
| `render`      | THREE.js renderer call. |
| `post-render` | Post-effects (TRAA accumulation, SSGI sample, Bloom). |
| `overlay`     | Selection highlight, gizmo HUD, pointer ghost. |

Used by `addTickListener({ id, priority, callback })` in S03.  At S02
the enum is exported but the listener API itself ships in S03.

### OTel

Each `drainSync()` opens a `pryzm.frame.tick` span with attributes
(locked S02 D1, extended for S03 R1A-04):

- `pryzm.frame.queue_depth` (pre-drain count)
- `pryzm.frame.dirty_reasons` (comma-joined dirty-flag set, sorted)
- `pryzm.frame.dirty_count` (size of the dirty set)

S03 will add `pryzm.frame.duration_ms` plus per-lane drain counts and
the idle-budget attributes from ADR-006.

## What S02 does NOT include

- The `requestAnimationFrame` pump itself.  Tests call `drainSync()`
  directly; the renderer is not yet wired in.
- `addTickListener({ priority: TickPriority })` — the data type is
  exported but the registration API ships S03.
- Cancellation (`cancelFrame(id)`) — lands S03 alongside the pump.
- The 30-frame idle budget enforcement — the data structures are in
  place; the budget logic lands in S03.
- The `idle-cpu` bench's full implementation — only a skeleton ships
  in S02 (`apps/bench/src/benches/idle-cpu.bench.ts`).

## File layout

```
packages/frame-scheduler/
  src/
    index.ts            # public surface (re-exports)
    types.ts            # Priority + TickPriority + FrameRequest contract
    otel.ts             # `pryzm.frame.tick` wrapper
    FrameScheduler.ts   # the class
  __tests__/
    frame-scheduler.test.ts
  package.json
  tsconfig.json
  vitest.config.ts
```

## References

- `docs/02-decisions/adrs/0003-frame-scheduler-priority-vs-deadline.md`
- `docs/02-decisions/adrs/0006-idle-continuation-budget.md`
- `tools/eslint-plugin-pryzm/src/rules/no-raf.js`
- `tools/scripts/check-raf-count.mjs` (rAF-count snapshot-diff for src/)
- `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S02 / §S03
