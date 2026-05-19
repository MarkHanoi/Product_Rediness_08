# Tier-Streamed Loader

> **Status:** Implemented in S23 (PHASE-1D §S23, lines 1082-1260).
> **ADR:** [0020 — Tier-Streamed Loader](./adr/0020-tier-streamed-loader.md).
> **Source:** `packages/persistence-client/src/loader/`.
> **Public surface:** `import { TierStreamedLoader } from '@pryzm/persistence-client'`.

The tier-streamed loader is the cold-load path for opening a `.pryzm`
project.  It fans the work into three latency-budgeted tiers so the
editor reaches *first-interactive* in under 3 s p95 (5K-wall × 20-level
fixture) and finishes the full load in under 12 s p95.

## Pipeline

```
load(projectId, visibleLevelId?)
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Tier 1 — Manifest                                      │
│    fetchManifest(projectId) → JSON → Zod parse          │
│    span: pryzm.loader.tier1                             │
│    ETA: < 100 ms                                        │
└─────────────────────────────────────────────────────────┘
    │  manifest
    ▼
┌─────────────────────────────────────────────────────────┐
│  Tier 2 — Visible Level                                 │
│    resolveVisibleLevel(manifest, visibleLevelId)        │
│    fetchChunkBytes(visibleHash) → onChunkReady(...)     │
│    onFirstInteractive()  ← editor dismisses splash      │
│    span: pryzm.loader.tier2                             │
│    ETA: < 500 ms (200-wall level, post-Draco)           │
└─────────────────────────────────────────────────────────┘
    │  done!  load() resolves here.
    │  full = Promise< Tier 3 drain >
    ▼
┌─────────────────────────────────────────────────────────┐
│  Tier 3 — Background Levels (distance-ordered queue)    │
│    for each level !== visible, sorted by |level - vis|: │
│      requestFrame('tier3-background-load', 'background')│
│      → fetchChunkBytes(hash) → onChunkReady(...)        │
│    one chunk per background frame (FrameScheduler)      │
│    span (per chunk): pryzm.loader.tier3                 │
│    ETA: drains over ~12 s for 19 background levels      │
└─────────────────────────────────────────────────────────┘
```

The orchestrator (`TierStreamedLoader`) returns from `load()` once
**Tier 2 is committed** — the user can interact immediately.  The
returned `LoadResult.full` promise resolves when Tier 3 finishes
draining (or `dispose()` aborts).

## Files

| File                                | Responsibility                                                                 |
|-------------------------------------|--------------------------------------------------------------------------------|
| `loader/Tier1Manifest.ts`           | Fetch + Zod-parse the manifest.                                                |
| `loader/Tier2Visible.ts`            | Resolve the visible level, fetch its chunk, fire `onFirstInteractive`.         |
| `loader/Tier3Background.ts`         | Distance-ordered queue, FrameScheduler `'background'` integration.             |
| `loader/HistoryStreamer.ts`         | Paginated `loadHistorySegment(fromSeq, toSeq)` for the undo panel.             |
| `loader/TierStreamedLoader.ts`      | Orchestrator + LRU byte-cache (200 MiB).                                        |
| `loader/otel.ts`                    | Sub-tracer (`@pryzm/persistence-client/loader`) for the four spans.            |
| `loader/index.ts`                   | Public barrel — re-exported from `@pryzm/persistence-client`.                  |

## Eviction policy

* **Cap:** 200 MiB (`DEFAULT_MAX_LOADER_BYTES`).
* **Algorithm:** LRU via `Map` insertion order — `get` deletes +
  re-inserts the entry to bump it to "most recent"; `put` evicts
  from the front of the Map until the new entry fits.
* **Single-chunk-too-big:** if `bytes.byteLength > cap` the cache
  refuses the entry rather than evicting everything and still
  being over budget (avoids "poisoning" the cache).
* **Diagnostics:** `loader.cacheStats()` returns
  `{ entries, totalBytes, maxBytes }` for the M12 OTel dashboard.

LRU semantics are exercised by
`__tests__/loader/LruEviction.test.ts`:
* eviction when budget exhausted,
* re-fetch on access of an evicted hash,
* MRU bump on `get`,
* refusal of single oversized chunks,
* 100-load stress (spec exit criterion #4).

## FrameScheduler integration

Tier 3 owns a *distance-ordered queue* (built by
`buildQueue(manifest, visibleLevel)`): every level other than
visible, sorted by `|levelIndex - visibleIndex|` ascending, ties
broken by `levelId` for determinism.

Two execution modes:

### Scheduler mode (production editor)

```ts
const loader = new TierStreamedLoader({
  fetchManifest, fetchChunkBytes,
  onChunkReady, onFirstInteractive,
  scheduler: hostFrameScheduler,
});
```

* `Tier3Background.enqueue()` requests one
  `'background'` frame.
* The host's frame pump invokes `loader.processNextTier3()` which
  fetches one chunk, fires `onChunkReady`, and (if the queue is
  non-empty) requests the next background frame.
* Per ADR-0006, background frames are bounded by the 30-frame
  idle continuation budget — the loader yields after ~480 ms of
  background work to let any other background lane (TRAA, SSGI,
  GC) interleave.

### Scheduler-free mode (bench / Node CLI)

```ts
const loader = new TierStreamedLoader({
  fetchManifest, fetchChunkBytes,
  onChunkReady, onFirstInteractive,
  scheduler: null,                 // ← drains synchronously
});
```

* `enqueue()` recurses through the queue with `await
  Promise.resolve()` between chunks.
* Used by `apps/bench/src/benches/load-large.bench.ts` to measure
  end-to-end full-load timing without a frame loop.

## History on demand

`loader.loadHistorySegment(projectId, fromSeq, toSeq)`:

* Inclusive `fromSeq` / `toSeq`.
* Default page size 500 (`DEFAULT_HISTORY_PAGE_SIZE` —
  matches sync-server S22 `events.load`).
* Hard cap 1000 per page (`MAX_HISTORY_PAGE_SIZE`).
* Throws `HistorySequenceGapError` when the response is non-
  contiguous.
* Span: `pryzm.loader.history`.

The undo panel calls this when the user keeps pressing **Ctrl-Z**
past the in-memory undo stack.  The L0 event log is **never** part
of cold-load — empty `eventLogLength` projects skip the call
entirely.

## Cancellation

```ts
const r1 = await loader.load('p-a');           // tier3 starts draining
const r2 = await loader.load('p-b');           // disposes r1's tier3
loader.dispose();                              // disposes r2's tier3 too
```

* Calling `load()` while a previous load's Tier 3 is still draining
  invokes `Tier3Disposer.dispose()` on the previous queue:
  - clears the remaining queue,
  - cancels the active background-frame token via the scheduler,
  - resolves the previous `full` promise (so callers `await`ing
    it do not hang).
* In-flight `fetchChunkBytes` promises are *not* abortable today;
  their results are discarded once dispose is called.  Phase 2
  threads an `AbortSignal` through the chunk fetcher.

## Failure modes

| Failure                              | Behaviour                                                                            |
|--------------------------------------|--------------------------------------------------------------------------------------|
| Manifest invalid (Zod fails)         | Tier 1 throws; `load()` rejects with `ZodError`.                                     |
| Manifest has zero levels             | Tier 2 throws `TierLoaderError(code: 'manifest-no-levels')`.                          |
| Visible-level chunk missing          | Tier 2 fires `onFirstInteractive` immediately (empty grid view) — no error.          |
| Tier 2 fetch fails                   | Span records error; `load()` rejects.                                                |
| Tier 3 chunk fails                   | Span records error; queue continues; status bar shows "X of Y loaded (1 failed)".    |
| History fetch returns gap            | `HistorySequenceGapError` thrown; undo panel falls back to in-memory stack.          |
| Cache evicts on access               | Caller re-invokes `loader.load(level)`; LRU re-fetches and re-warms.                  |

The K1D-3 kill-switch (PHASE-1D §K-Switches) is wired to the
`pryzm.loader.tier3` span error rate — sustained failures flip the
loader back to "fetch all chunks synchronously" while ops
investigates.

## Performance gates

| Bench file                                     | What it asserts                                | Hard fail | Warn |
|------------------------------------------------|------------------------------------------------|-----------|------|
| `apps/bench/src/benches/load-large.bench.ts`   | 5K × 20 cold-load first-interactive p95        | 4 s       | 3 s  |
| same file                                      | 5K × 20 cold-load full-load p95                | 12 s      | —    |
| `apps/bench/src/benches/load-small-preview.bench.ts` | small fixture (50 walls, 1 level) cold-load p95 | 800 ms    | —    |

Both benches run 5 timed samples after 1 warmup, with a fresh
`TierStreamedLoader` per sample so the LRU is empty (cold).  They
measure **loader orchestration only** — chunk bytes are
synthesised, `onChunkReady` is a no-op.  Real decode cost
(Draco + gltf-transform) is gated by `pack-unpack.bench.ts` and
the editor's Playwright suite.

## OTel coverage

| Span name                | Emitted by              | Key attributes                                                              |
|--------------------------|-------------------------|------------------------------------------------------------------------------|
| `pryzm.loader.tier1`     | `Tier1Manifest`         | `pryzm.loader.tier1.duration_ms`, `chunk_count`, `level_count`, `event_log_length` |
| `pryzm.loader.tier2`     | `Tier2Visible`          | `pryzm.loader.tier2.duration_ms`, `levelId`, `chunk_hash`, `byte_length`, `empty_level` |
| `pryzm.loader.tier3`     | `Tier3Background`       | `pryzm.loader.tier3.levelId`, `chunk_hash`, `byte_length`, `distance`, `queue_remaining` |
| `pryzm.loader.history`   | `HistoryStreamer`       | `pryzm.loader.history.fromSeq`, `toSeq`, `event_count`, `next_from_seq`     |

All four spans live under the
`@pryzm/persistence-client/loader` tracer (sub-tracer of the
package's `@pryzm/persistence-client` namespace) so the Honeycomb
"loader" service tile is distinct from the chunk reader/writer
tile.

Spans are siblings (not parent/child) — Tier 3 latency MUST NOT
appear inside Tier 2's wall time, otherwise dashboards show
inflated first-interactive numbers.

## Testing

| Test file                                            | Coverage                                                                  |
|------------------------------------------------------|---------------------------------------------------------------------------|
| `__tests__/loader/TierStreamedLoader.test.ts`        | end-to-end orchestration; first-interactive callback; cancellation; ordering |
| `__tests__/loader/LruEviction.test.ts`               | 200 MiB budget; eviction order; MRU bump; oversize refusal                |
| `__tests__/loader/Tier3Background.test.ts`           | distance ordering; one-chunk-per-frame; scheduler integration; failure isolation |
| `__tests__/loader/HistoryStreamer.test.ts`           | inclusive fromSeq/toSeq; default 500 / hard-cap 1000; gap detection      |
| `__tests__/loader/Otel.test.ts`                      | all four spans emitted; duration_ms attributes set                       |

All five files run under `vitest` with no browser host (the loader
is node-portable).
