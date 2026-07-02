# ADR-0102 — Large-project open: kill the false-timeout, the autosave-mid-load freeze, and the O(N) clear storm

> **Status**: Accepted · **Date**: 2026-07-02
> **Supersedes/relates**: closes ADR-0098 finding **F2** (project-open freeze). Companion contracts: **C13** (project lifecycle — §5.3/§5.4/§5.5) and **C05** (persistence — §3.2a/§3.2b).
> **Scope**: the project OPEN path only. No change to the semantic model, command set, or the render path.

## Context

Opening a large persisted project — the 40-storey office (1300 elements, 1065 walls, 40 levels, 880 windows, 940 room-bounding-lines, **22.7 MB** snapshot) — failed with a "Load failed" toast and a frozen 3D view, even though the load actually completed underneath. Prod console (forced WebGL, WebGPU disabled) showed four distinct root causes:

1. **False-negative 30 s timeout.** `PlatformVersionController.loadVersion` raced the load against a fixed `setTimeout(30_000)`. The office load takes ~62 s of *steady* progress (`§LOAD-WATCHDOG load still running after 56.5s` → `PHASE_TIMINGS total=62831ms`), so the fixed cap fired mid-load, surfaced "Load failed", called `setLoading(false)`, and left the app half-initialised while work continued.
2. **Autosave storm DURING load (self-inflicted freeze).** ADR-0098 F2 root-caused the peg as a *post-load rebuild/re-anchor storm*. The caller-driven `SaveOrchestrator.setLoading(false)` fence closes the instant `loadAdapter.load()` resolves — but `ProjectLoader` continues a fire-and-forget post-load sweep (`§LOAD-REDETECT-CHUNKED` per-level redetect + deferred whole-level wall resolve) across later frames. Those deferred mutations fired the autosave debounce, which SERIALIZED the 22.7 MB snapshot to IndexedDB mid-load: `_drainBuildQueue → rebuild → emit → handleMutation → scheduleDebounce → onAutoSave → saveVersionInternal`.
3. **Clear-on-switch O(N) storm.** `ClearProjectCommand` removes every element one-by-one; each of 40 `bim-level-removed` events fired a full `SpatialTree` rebuild (+ 8-store scan), and per-element remove logs (`[StairStore] Removed stair …`, `[StairMeshBuilder] Removed group …`, 78×) flooded the console — measurable jank at this scale.
4. **940 room-bounding-lines, many degenerate.** Partial/legacy records with `placement.start/end` undefined were persisted, reloaded, and iterated for nothing; the count only grew.

## Decision

Fix each on the open path, tagged with `§`-markers, and codify the invariants in C13 + C05.

### 1 — Progress-aware load timeout (`§LOAD-TIMEOUT-PROGRESS`, C13 §5.3)

`ProjectLoader` emits a `pryzm-load-progress` tick on every `§LOAD-PHASE` boundary **and** every 5 s watchdog heartbeat. `PlatformVersionController.loadVersion` replaces the fixed `Promise.race(load, 30 s)` with a **stall** watchdog: each tick resets a `STALL_TIMEOUT_MS` (20 s) deadline, so failure is declared only on a genuine no-progress hang, regardless of total load time. The listener + timer are cleaned up on both success and error paths.

### 2 — Autosave suppressed for the whole load window (`§AUTOSAVE-SUPPRESS-DURING-LOAD`, C05 §3.2a)

`ProjectLoader` brackets the entire load — **including** the fire-and-forget post-load sweep — with `pryzm-load-suppress-begin` (at `load()` start) and `pryzm-load-suppress-end` (on the frame after the last per-level redetect drains; the finally-tail closes it for the sync-fallback / no-redetect / cancelled paths). `SaveOrchestrator` gains a boolean `_loadSuppressActive` latch that DEFERS the serialize while set and arms exactly ONE coalesced autosave on `-end`. Boolean (not ref-count) + reset by `setLoading(true)` so a cancelled load's `-end` can't re-enable saving for a fresher load (C13 §3.6 isolation). `beforeunload` emergency flush unchanged — no edit is lost.

### 3 — Batched clear-on-switch (`§CLEAR-PROJECT-BATCH`, C13 §5.4)

- `SpatialTree.refreshTree` coalesces a burst of `bim-level-removed`/`-added` events into ONE tree rebuild via a P3-safe microtask (no new rAF).
- The per-element stair remove logs are gated behind the existing `globalThis.__pryzmProjectLoadActive` flag (already set by `ProjectLoader` around the load/restore); live single-element deletes still log.
- `ClearProjectCommand` drops its per-store-category logging for one `§CLEAR-PROJECT-BATCH` summary line.

### 4 — Degenerate room-bounding-lines not persisted (`§RBL-NO-PERSIST-DEGENERATE`, C05 §3.2b)

`ProjectSerializer` filters records with undefined `placement.start/end` out of `snapshot.roomBoundingLines` on save; both load paths (`ProjectLoader` legacy + `ImportProjectCommand` fast path) SKIP them on load instead of recreating a bogus 1 m origin line. The snapshot self-heals on the next save.

## Consequences

- **Positive**: the office open no longer false-fails, no 22.7 MB serialize runs mid-load, project-switch teardown does one tree refresh + no per-element log flood, and the RBL count stops growing. ADR-0098 F2 is closed.
- **Scope guardrails honoured**: no edits to `renderer-three/**`, `core-app-model/src/rendering/**`, `WallRebuildCoordinator`, `DoorBuilder`/`WindowBuilder` re-anchor logic (sibling agents own those). Fixes live in `ProjectLoader`, `PlatformVersionController`, `SaveOrchestrator`, `ClearProjectCommand`, `ProjectSerializer`, `SpatialTree`, and the two stair log sites.
- **Principles**: P3 (coalescers use microtasks / the P3-owned FrameScheduler, no new `requestAnimationFrame`); P6 (all element teardown/creation still routes through commands).
- **Follow-ups (not in this ADR)**: the *underlying* post-load rebuild/re-anchor storm cost (ADR-0098 F1/F3 — per-wall `O(all-doors)` scan + whole-level plan re-projection) is a sibling agent's lane; this ADR removes the autosave amplifier and the false-failure, not the storm's own CPU cost.

## Tests

- `apps/editor/__tests__/SaveOrchestratorLoadSuppress.test.ts` — autosave does not fire during a load-suppress window; exactly one coalesced save fires on close; `setLoading(true)` clears a stale latch; a normal edit still autosaves.
- `apps/editor/__tests__/RblDegeneratePersistenceGuard.test.ts` — the degenerate-RBL keep-predicate shared across save + both load paths.
