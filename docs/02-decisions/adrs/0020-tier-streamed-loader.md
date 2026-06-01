# ADR-0020 — Tier-Streamed Loader

* **Status:** Accepted
* **Date:** 2026-04-27
* **Sprint:** PHASE-1D §S23 (lines 1082-1260)
* **Owner:** Persistence
* **Spec source:** `docs/03_PRYZM3/reference/phases/PHASE-1/1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`

## Context

PRYZM 2's persistence model after S19 (chunked manifests) and S20
(`.pryzm` zip) loads an entire project synchronously: every level's
chunk is fetched, decoded, and committed before the editor draws
the first frame.  For the 5,000-wall × 20-level fixture this took
~9 s in the S22 baseline run — well above the K1-E budget of
3 s p95 first-interactive (PHASE-1D table line 1082).

Three architectural facts pin our hand:

1. **Users only ever look at one level at a time.**  The level-
   switcher dropdown in the editor (S15) means the visible level
   is always known the moment the manifest is parsed — every
   other level is *background work*.
2. **The frame budget is real.**  The editor runs the kernel,
   committer, renderer, and selection on the same main thread.
   Loading 19 background levels in a tight loop right after first-
   interactive starves the user's first scroll / first click.
3. **The R2 fetch latency dominates a small chunk's cost.**  A
   200-wall chunk is ~50 KB compressed; the network RTT is
   ~80 ms; the decode is ~30 ms.  Fan-out matters more than
   per-chunk speed.

We need a loader that:
* Returns first-interactive in under 3 s p95 on the 5K fixture.
* Loads the remaining 19 levels in the background without
  jank (FrameScheduler `'background'` priority — ADR-0006).
* Caches at most 200 MB per session (LRU) so a 100-load stress
  test does not OOM the tab.
* Keeps the L0 event log out of the cold-load path (history
  events are fetched on demand by the undo panel).

## Decision

Adopt a **three-tier streamed loader** living in
`packages/persistence-client/src/loader/`, exposed as the single
`TierStreamedLoader` class.

| Tier | What it loads                                  | Latency target | OTel span                |
|------|------------------------------------------------|----------------|--------------------------|
| 1    | Manifest JSON (small — a few KB)               | < 100 ms       | `pryzm.loader.tier1`     |
| 2    | Visible-level chunk → first-interactive        | < 500 ms       | `pryzm.loader.tier2`     |
| 3    | All other level chunks (distance-ordered)      | drains over ~12 s | `pryzm.loader.tier3`  |

Plus a **history streamer** (`HistoryStreamer.loadHistorySegment`)
exposed as a separate method on the loader; events are paged in
500 at a time on demand, matching the sync-server `events.load`
contract from S22.

### Architecture

The orchestrator is split into **four files** (per the audit
recommendation in
`phases/audits/PHASE-1-GAP-ANALYSIS-2026-04-27.md`):

```
packages/persistence-client/src/loader/
├── Tier1Manifest.ts       — manifest fetch + Zod parse
├── Tier2Visible.ts        — visible-level fetch + first-interactive
├── Tier3Background.ts     — distance-ordered queue, FrameScheduler bg
├── HistoryStreamer.ts     — paginated event-log loader
├── TierStreamedLoader.ts  — orchestrator + LRU
├── otel.ts                — sub-tracer for the four spans
└── index.ts               — barrel
```

`TierStreamedLoader` composes the four primitives and owns the
shared LRU.  Each primitive is independently unit-tested.

### LRU cache

* **Cap:** 200 MiB (`DEFAULT_MAX_LOADER_BYTES`).
* **Eviction order:** least-recently-used (Map insertion order;
  `get` bumps to MRU; `put` evicts from the front).
* **Single-chunk-too-big:** if an incoming chunk is larger than
  the cap we **refuse to cache** rather than evicting the entire
  cache and still being over budget.  This avoids "poisoning" the
  cache with a single oversized object.
* **Diagnostics:** `cacheStats()` exposes `entries`, `totalBytes`,
  `maxBytes` for the M12 OTel dashboard.

### Tier 3 scheduling

* Driven by a `FrameSchedulerLike` (loose interface — the loader
  does **not** depend on `@pryzm/frame-scheduler` at compile
  time; the host editor wires it).
* One chunk per `'background'` frame, gated by ADR-0006's 30-frame
  idle continuation budget.
* A scheduler-free fast path (`scheduler: null`) drains the queue
  synchronously inside `enqueue()` — used by the bench harness and
  any Node CLI tools.
* Failed chunks log to the span and **do not** abort the rest of
  the queue (status bar shows "X of Y loaded (1 failed)").

### History on demand

`loadHistorySegment(projectId, fromSeq, toSeq)`:
* Inclusive `fromSeq` / `toSeq`.
* Default page size 500 (matches sync-server S22).
* Hard cap 1000 per page.
* Throws `HistorySequenceGapError` when the response is non-
  contiguous (defends against a buggy server).

### Cancellation

Calling `load()` while a previous load's Tier 3 is still draining
disposes the previous queue (`Tier3Disposer.dispose()`) and starts
a fresh one.  In-flight `fetchChunkBytes` promises are not
abortable (the editor's `AbortSignal` plumbing lands in M12) but
their results are discarded.

## Alternatives considered

### A. Stream the entire project as one large chunk

Rejected.  No point in tiering if we ship one ZIP — we'd just be
back to the S20 model with a different packaging.  Also defeats
LRU because the entire project is one cache entry.

### B. Per-element streaming (one chunk per wall)

Rejected.  Per-chunk cost (signed URL, fetch RTT, GLB header) is
~80 ms on R2; 5,000 walls × 80 ms = 400 s.  Per-level chunking
batches related geometry into one fetch.

### C. Service-worker prefetch on idle

Considered.  The editor will use a service worker for offline
caching in Phase 2D, but the cold-load path in Phase 1D is
in-process so the same orchestrator works in browser, bench, and
bake worker.  Service worker is additive, not a replacement.

### D. Single combined `loader.ts` file

Rejected per audit.  The four-file split keeps each tier's logic
testable in isolation (`LruEviction.test.ts`, `Tier3Background.
test.ts`, `HistoryStreamer.test.ts`).  The orchestrator file
stays under 250 lines.

## Consequences

### Positive

* **Spec exit-criterion #1 met.**  Bench
  `apps/bench/src/benches/load-large.bench.ts` measures p50/p95
  of first-interactive and full-load; CI fails when first-
  interactive p95 > 4 s or full-load p95 > 12 s, warns at 3 s.
* **K1-E preview gate met.**  `load-small-preview.bench.ts`
  asserts < 800 ms p95.
* **OTel cold-load coverage.**  Honeycomb / Tempo dashboards can
  filter on `pryzm.loader.tier1/2/3/history` and see first-
  interactive vs full-load p95 side by side.
* **Editor stays responsive.**  Tier 3 chunks are fetched in
  background frames, never blocking input or render.
* **Memory ceiling.**  200 MiB LRU caps a session even after
  100 project switches.

### Negative

* **Two-stage UX.**  Users see the visible level first, then
  watch the level-switcher icons "fill in" as background levels
  land.  The editor's status bar already shows "X of Y levels
  loaded" so this is communicated, but it is a behaviour change
  from the synchronous load.
* **Failed background chunk → silent re-bake on access.**  If a
  Tier 3 chunk fails (e.g. R2 throttling) the user only notices
  when they switch to that level; the loader then refetches via
  `load()` again.  This is acceptable for Phase 1D; Phase 2D adds
  retry-with-backoff inside Tier 3.
* **Bench measures orchestration only.**  The Node-side bench
  uses synthesised bytes and a no-op `onChunkReady`.  Real decode
  cost (Draco + gltf-transform) is gated by `pack-unpack.bench.
  ts` and the `apps/editor` Playwright suite.  CI must read both
  numbers to assess true cold-load p95.

### Neutral

* `DEFAULT_MAX_LOADER_BYTES` may need tuning once we have field
  data (Phase 2A telemetry).  The constructor option lets the
  bench shrink it for the eviction stress test without changing
  production behaviour.
* The `FrameSchedulerLike` interface is loose by design.  When
  the FrameScheduler API stabilises in Phase 2 we may switch to
  a direct import; today the loose interface keeps the loader
  package's compile-time deps minimal.

## References

* PHASE-1D §S23 (lines 1082-1260) — sprint spec.
* `phases/audits/PHASE-1-GAP-ANALYSIS-2026-04-27.md` — four-file
  split recommendation.
* ADR-0006 — idle continuation budget (Tier 3 scheduling).
* ADR-0019 — sync-server linearisation (history pagination
  contract).
* `docs/architecture/loader.md` — runtime design doc.
