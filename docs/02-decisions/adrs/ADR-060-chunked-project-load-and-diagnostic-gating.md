# ADR-060 — Chunked, frame-yielding project load + load-time diagnostic gating

- **Status:** ACCEPTED (2026-06-29) — IMPLEMENTED.
- **Owner:** editor engine (`apps/editor/src/engine/persistence`) + command-registry
  (`@pryzm/command-registry`); geometry-wall / geometry-slab diagnostic gates.
- **Affects:** `ProjectLoader`, `ImportProjectCommand`, `CommandManager` (`CommandManagerImpl`),
  `WallJoinResolver`, `SlabFragmentBuilder`, `CreateSlabCommand` call sites.
- **References:** C11 (element-creation pipeline — §6.1 "batch geometry build MUST be spread
  across multiple frames via the scheduler — not run as a single synchronous loop"), C04
  (rendering/scheduling, P3 single rAF). Builds on the existing `§WALL-JOIN-LOAD-SKIP`
  (WallRebuildCoordinator restore flush) and the `storeEventBus` batch wrap in `ProjectLoader`.

## Context

Opening a heavy saved project (a residential building: 793 elements — 192 walls, 127 doors,
87 windows, 26 slabs, 7 levels) **froze the screen mid-load** ("half opens then frozen").

Root cause: the default load path (`ImportProjectCommand`, dispatched by `ProjectLoader.load`)
runs the entire element-creation loop **synchronously in one JS task**. Element *data* writes
are individually cheap, but each store `add()` synchronously dispatches a **DOM `CustomEvent`**
(`bim-slab-added`, etc. via `DOMEventBus` → `window.dispatchEvent`) that drives the matching
fragment builder **inline**. The `storeEventBus.beginBatch()` wrap only buffers the *StoreEventBus*
events (consumed by the already-rAF-coalesced `DependencyResolver`); it does **not** gate the DOM
CustomEvents. So all 26 slab triangulations (`outset` + `triangulate` + `BUILD_COMPLETE`) run in
the same blocking task as the 793 element writes. (Wall bodies + door/window builds were already
deferred off this task by `§WALL-JOIN-LOAD-SKIP`'s restore flush; the slab build is the dominant
synchronous cost that remained.) The browser never gets to paint → frozen screen.

Compounding the freeze, the same hot loop emitted hundreds of **always-on console lines**:
- `CreateSlabCommand` logged `§2.6 C2: ifcGuid not injected` **once per slab, with a full stack
  trace**, because both load paths constructed `CreateSlabCommand` without an `ifcGuid`.
- `WallJoinResolver` emitted ungated `§PARTITION-SHELL-INNER-FACE REFUSED`, `§SHELL-ANCHOR-PRESERVE`,
  `§MULTI-CLUSTER cluster` summaries, and `§WJR-DIFF-THICKNESS` lines per join.
- `SlabFragmentBuilder` logged three timing lines per slab.

With DevTools open, console I/O (especially with stack traces) in a hot loop is itself real
main-thread cost — the same disease already fixed for the D-TGL `§DIAG` flood and the per-frame
wall diagnostic.

## Decision

1. **Chunk the import across frames.** `ImportProjectCommand` exposes the orchestration as a
   single generator (`*_orchestrate`) driven by two thin drivers: `execute()` (synchronous,
   run-to-completion — unchanged behaviour, flag-off fallback and the Command-interface entry
   point) and a new async `executeChunked(ctx, yieldFn)` that `await`s `yieldFn` at each
   generator checkpoint (between element steps and every `IMPORT_CHUNK_SIZE` = 120 elements in
   the heavy slab/wall/furniture/curtain-wall loops). Both drivers run **byte-identical**
   per-element semantics; only the cadence differs.

2. **Drive the yield from the single rAF owner (P3).** `CommandManager.executeChunked(command,
   yieldFn)` mirrors the `PROJECT_LOAD` fast path (no snapshot, no undo push, single post-command
   callback fan-out) but awaits the command's chunked path. `ProjectLoader.load` supplies a
   `yieldFn` that schedules one `FrameScheduler.scheduleOnce('project-load-chunk', …, 'post-render')`
   tick and resolves after it fires — the browser paints the frame in between. **No new
   `requestAnimationFrame`** is introduced.

3. **Default-on, reversible.** Chunked load is gated by `_useChunkedLoad()` (default true;
   `globalThis.__pryzmChunkedLoad = false` or `localStorage 'PRYZM_CHUNKED_LOAD'='false'` falls
   back to the original one-task `exec(importCmd)` path).

4. **Kill the load-time console flood.**
   - Both load paths now pass `ifcGuid: slab.ifcData?.guid ?? crypto.randomUUID()` to
     `CreateSlabCommand`, so the `§2.6 C2` warning-with-stack-trace never fires and the IFC GUID
     round-trips (parity with the ceiling/floor/curtain-wall restores).
   - `WallJoinResolver`'s four previously-ungated diagnostics are gated behind a single
     `wallJoinDiagOn()` helper (`globalThis.__pryzmWallJoinDiag`, default OFF; the legacy
     `__PRYZM_WALL_JOIN_DEBUG` is honoured as a back-compat alias). The `if (flag)` guard wraps
     the whole `console.*` call so the message string is never even built when off.
   - `SlabFragmentBuilder`'s three per-slab timing logs are gated behind `slabBuildDiagOn()`
     (`globalThis.__pryzmSlabBuildDiag`, default OFF).

## Consequences

- A 793-element load yields ~7+ frames during the element build; the loading overlay stays
  responsive and the scene appears progressively instead of freezing. `ProjectLoader` logs a
  `§LOAD-CHUNKED` summary (yield count + longest synchronous chunk) proving the main thread is
  released.
- A normal load pays **zero** console cost from the gated diagnostics; full diagnostic capability
  survives for debugging, one flag away.
- No semantic change: element creation order, stats bookkeeping, undo behaviour (empty after
  load per Contract 20 GAP-3), and the deferred wall-join resolve (`§WALL-JOIN-LOAD-SKIP`) are
  all unchanged. The synchronous `execute()` path is preserved verbatim as the fallback.

## Alternatives considered

- **Move geometry builds to a worker.** Out of scope and high-risk: the builders touch THREE /
  stores / DOM on the main thread by design. Chunking releases the thread without that rewrite.
- **`storeEventBus.endBatchYielded()` for the whole flush.** Already exists and chunks the
  *StoreEventBus* drain, but the slab build is driven by **DOM** CustomEvents emitted inside the
  command loop, not by the StoreEventBus flush — so yielding the command loop itself is the
  correct lever.
