# ADR-003 — Frame scheduler priority vs deadline API

| Field | Value |
|---|---|
| Status | **Accepted** (S02 D1, 2026-04-26 — revised in the S02 audit pass) |
| Decision owner | F (sign-off) |
| Drafters | Agent B (Track B) |
| Affects layers | L5 (frame-scheduler, renderer, committer), L7 (editor) |
| Supersedes | — |

## Context

The L5 scheduler is the single owner of `requestAnimationFrame` for the
entire app (see `pryzm/no-raf` lint rule, this sprint).  Two competing API
shapes were considered:

1. **Priority lanes** — `requestFrame(reason, priority)` with a fixed
   ordered enum.  Drain: lane-by-lane until the budget is exhausted.
2. **Deadline-based** — `requestFrame(reason, deadlineMs)` with a numeric
   target wall-clock; `requestIdleCallback`-style heuristics decide what
   runs when.

There is also a SECOND, ORTHOGONAL ordering question: inside a single
rAF tick, who runs first — the camera updater, the renderer, or a
post-render overlay?  The PRYZM 1 codebase already answered this with
`UnifiedFrameLoop.ts:95-98` (`TickPriority`), and we adopt that verbatim.

## Decision

### Queue-class priority (`Priority`)

Per `§S02-T7` (line 299) the queue-class enum is:

```ts
type Priority = 'interaction' | 'idle' | 'background';
```

Strict ordering, lowest index drains first.  Inside a lane, FIFO by ULID.

| Lane          | Frame budget | Examples |
|---------------|--------------|----------|
| `interaction` | must complete in current rAF | gizmo follow on pointer-move, tool preview, camera tween, every-frame work |
| `idle`        | only inside idle budget (ADR-006) | TRAA accumulation, BVH refit, post-effects |
| `background`  | yields to all of the above | bake worker progress UI, telemetry flush |

PRYZM 1 used a four-lane enum that included a separate `animation` lane
between `interaction` and `idle`.  S02 collapses `animation` into
`interaction` because both have the same budget (must complete in current
rAF) and the OTel histograms were measuring identical p95s.  The fifth
lane is reserved for re-introduction in S03 if the idle-budget telemetry
shows the merged lane needs splitting.

### Render-phase ordering (`TickPriority`)

Orthogonal to `Priority`, the render-phase enum is copied verbatim from
`src/core/rendering/UnifiedFrameLoop.ts:95-98`:

```ts
type TickPriority = 'pre-render' | 'render' | 'post-render' | 'overlay';
```

This controls the order of `addTickListener` callbacks INSIDE a single
rAF tick (S03 wires it).  `Priority` decides WHICH rAF tick handles a
request; `TickPriority` decides WHERE inside that tick a callback runs.

### Why not deadlines

- `performance.now()` deadlines fight the browser's own scheduler when
  the page is throttled (background tab) — cannon-fodder for race conditions.
- The renderer (S15) and committer (S05) both need a stable, *typed*
  notion of "this is high-priority work" so the bench gates can attribute
  CPU correctly.  A numeric deadline collapses every gate into a single
  histogram.
- We can layer a deadline on top later (e.g. `idle` lane gets an explicit
  budget per ADR-006) without breaking the API.

### `requestFrame` returns a request id

The id is a ULID + monotonic counter — sortable across processes and stable
across reloads of the scheduler.  Required by the cancellation API that
ships in S03 (`cancelFrame(id)`).

### `markDirty` / `clearDirty` / `isDirty`

Independent of the queue — flags are coarse-grained "the editor needs to
re-render *something*" markers used by the renderer's `renderIfDirty()`
inner loop.  Drains do **not** clear dirty flags; the consumer that reads
the flag is responsible for clearing it (typical "clear-then-paint" idiom).

### OTel — `pryzm.frame.tick` per drain

Attributes (locked S02 D1, extended for S03 R1A-04):

- `pryzm.frame.queue_depth` (pre-drain count)
- `pryzm.frame.dirty_reasons` (comma-joined dirty-flag set, sorted)
- `pryzm.frame.dirty_count` (size of the dirty set)

S03 will add `pryzm.frame.duration_ms`, `pryzm.frame.idle_budget_remaining`
(0..30, ADR-006), and `pryzm.frame.idle_throttled` (boolean).

## Consequences

**Good**

- Bench `idle-cpu` (< 2% target, S03) can attribute time per lane.
- The renderer can short-circuit the entire pipeline when only `background`
  lane requests are queued + the dirty set is empty.
- `pryzm.frame.dirty_reasons` makes "why did the renderer wake up?" a
  one-line trace question (R1A-04 mitigation).

**Bad**

- Plugins must learn the three-lane mental model (documented in the SDK
  reference page that ships in S61).
- Adding a fourth lane later (re-splitting `interaction` / `animation`)
  is a breaking change for plugin authors — we accept this as a deliberate
  constraint and gate the decision on the S03 idle-budget telemetry.

## Alternatives considered

- **`requestIdleCallback` directly** — lost: Safari support was only
  added in 17.4; we still target 16.4+ at GA per `08-VISION.md` §10.
- **Cooperative `yield` generator** — lost: the bench harness can't
  measure time inside a generator without invasive instrumentation.
- **Four-lane enum (with `animation`)** — lost: identical histograms to
  `interaction`; will revisit in S03.

## References

- `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S02-T7
- ADR-006 (idle 30-frame budget)
- `packages/frame-scheduler/src/FrameScheduler.ts`
- `src/core/rendering/UnifiedFrameLoop.ts:95-98` (TickPriority source)
