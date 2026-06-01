# Implementation log — `[strategic ADR-010]` 250 ms bake debounce

> Sprint: **S21** (Q4 M10–M12).  Spec: `docs/03-execution/plans/legacy/phases/PHASE-1/1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md` §S21.
> Code: `apps/bake-worker/src/coalescing/CoalesceWindow.ts`.
> Strategic ADR: `docs/02-decisions/adrs/ADR-010-bake-debounce.md`.

This document logs the **implementation choices** taken for the 250 ms
trailing-edge bake debounce ratified in strategic ADR-010.  It is a
companion to the strategic ADR — the strategic ADR captures the *why*;
this log captures the *how* + *what we measured*.

---

## 1.  Algorithm

```ts
class CoalesceWindow {
  // per-(projectId, levelId) bucket
  private pending = new Map<string, {
    events: BakeEventRecord[],
    timer: NodeJS.Timeout,
    windowOpenedAt: number,
  }>;

  enqueue({ projectId, levelId, events }) {
    const key = `${projectId}/${levelId}`;
    const bucket = this.pending.get(key);
    const now = Date.now();
    if (bucket) {
      bucket.events.push(...events);
      // Hard-cap check FIRST (1500 ms) — prevents starvation.
      if (now - bucket.windowOpenedAt >= HARD_CAP_MS) {
        clearTimeout(bucket.timer);
        this.flush(key);
        return;
      }
      // Reset the trailing-edge timer (250 ms).
      clearTimeout(bucket.timer);
      bucket.timer = setTimeout(() => this.flush(key), WINDOW_MS);
    } else {
      const timer = setTimeout(() => this.flush(key), WINDOW_MS);
      this.pending.set(key, { events: [...events], timer, windowOpenedAt: now });
    }
  }

  flush(key: string) {
    const bucket = this.pending.get(key);
    if (!bucket) return;
    this.pending.delete(key);
    bucket.events.sort((a, b) => a.id.localeCompare(b.id));   // ULID sort
    queue.add('rebake', { ..., eventBatch: bucket.events, previousChunkHash: null });
  }
}
```

### Constants

| Name                  | Value    | Source                                                     |
|-----------------------|----------|------------------------------------------------------------|
| `COALESCE_WINDOW_MS`  | `250`    | Strategic ADR-010 — derived from the 200 ms p95 typing-burst observation. |
| `COALESCE_HARD_CAP_MS`| `1500`   | Strategic ADR-010 — "Coalescing rules — Hard cap" — keeps long edit streams from starving the editor more than 1.5 s. |

---

## 2.  Decisions taken in S21

1. **Trailing-edge over leading-edge.**  Considered both; the spec
   explicitly mandates trailing-edge so the user sees the chunk reflect
   the *final* state of a typing burst, not the first keystroke.
2. **Per-`(projectId, levelId)` bucket key.**  Coalescing across levels
   would conflate edits the user perceives as independent.  The key is
   composite to keep multi-project tenancies isolated as well.
3. **Hard cap on the leading edge timestamp**, not on accumulated event
   count.  Counting events would penalise high-throughput formula edits
   (a single dimension change can fan out to 50+ patches under
   `[strategic ADR-014]` join cascade); the 1500 ms wall-clock bound
   gives consistent UX regardless of edit fan-out.
4. **ULID sort on flush.**  The sync server delivers events in arrival
   order; if two clients race, ULID lexicographic order wins (matches
   the L0 event log's tie-break rule from S04).
5. **`flushAll()` is synchronous-launching, async-awaiting.**  We
   clearTimeout each pending bucket up-front before kicking off any
   `flush(key)` calls; this guarantees no double-flush if a timer fires
   during the awaited Promise.all.

---

## 3.  Observability

The coalescer wraps `enqueue()` with `withSpan('pryzm.bake.enqueue', ...)`.
Attribute set:

* `pryzm.bake.projectId`
* `pryzm.bake.levelId`
* `pryzm.bake.eventCount`

The job that the flush eventually pushes onto the queue is wrapped by a
SECOND span (`pryzm.bake.chunk`) inside `RebakeChunkJob`.  These two
spans are deliberately NOT linked — coalescer enqueues are 1-to-many
with bake jobs, so a parent-child link would mis-state the relationship
in trace UIs.

A third span (`pryzm.bake.r2-upload`) wraps only the
`storageDriver.put()` call so the proportion of job time spent on
network egress is visible in flamegraphs.

---

## 4.  Test coverage

`apps/bake-worker/__tests__/CoalesceWindow.test.ts` — 4 tests:

1. **Exit gate #2 — 20 events / 500 ms ≤ 2 jobs.**  Uses fake timers to
   submit one event every 25 ms for 20 iterations, then advances past the
   trailing-edge timer.  Asserts `queue.added.length ≤ 2` AND the total
   event count across all jobs is `20` (no drops).
2. **ULID sort.**  Submits three out-of-order ULIDs, asserts the flush
   carries them in lexicographic order.
3. **Per-`(projectId, levelId)` partition.**  Three buckets across two
   projects + two levels, asserts three independent jobs.
4. **Hard cap.**  Submits 20 events at 100 ms intervals (2 s total).
   Asserts at least 2 flushes occurred — i.e. the 1500 ms cap fired.

`apps/bake-worker/__tests__/SigtermFlush.test.ts` — covers exit gate #3
(SIGTERM flush): two pending buckets → `flushAll()` → both jobs land in
the queue handler before `drain()` resolves.

---

## 5.  Open questions / follow-ups

* **Per-tenant rate limiting.**  S22 D3 tracks adding a Token-Bucket
  in front of `enqueue()` to protect the bake worker from a misbehaving
  client emitting 10K events / s.  Currently relies on the sync server's
  per-connection backpressure.
* **Cross-level coalescing for same-project edits.**  Considered but
  punted — would complicate the producer's per-level invariants (e.g.
  level elevation lookup in S22 D2).  Re-evaluate after the LevelStore
  lands.

---

## 6.  Cross-references

* Strategic: `docs/02-decisions/adrs/ADR-010-bake-debounce.md`
* Ops runbook: `docs/04-reference/architecture-detail/bake-worker.md` §5
* Bench gate: `apps/bench/src/benches/bake-incremental.bench.ts`
* Tests: `apps/bake-worker/__tests__/CoalesceWindow.test.ts`,
         `apps/bake-worker/__tests__/SigtermFlush.test.ts`
