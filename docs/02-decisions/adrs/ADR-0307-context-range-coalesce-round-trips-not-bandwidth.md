# ADR-0307 — Context tile reads pay for round trips, not bandwidth: coalesce ranges, and never let coalescing cost a tile

| Field | Value |
|---|---|
| **Status** | Accepted — 2026-08-07 |
| **Tag** | `§CTX-RANGE-COALESCE` |
| **Owner** | GIS / context tiles (`RangeUrlFetchSource`, `contextTilesReader`) |
| **Closes** | Founder, fourth occurrence: the 27 s "Opening the 3D Site" overlay timing out at a 25 000 ms watchdog on work that was still running and about to succeed |
| **Constraints** | C06/C12 (transport only — addressing, crop, decode cache, honesty discriminators untouched), §CONTEXT-DATA-HONESTY / L-513b |
| **Implemented by** | `de39bbca` |

---

## Context — the measurement, and what it rules out

The previous three fixes targeted the readiness predicate (settled-is-not-stalled,
provider-ready, tiles-need-a-frame) and the symptom persisted. Measured against live R2
(Barcelona Eixample):

- one cold 3D-Site open issues **124 range requests** carrying **1 002 KiB**;
- one range request measured strictly serially costs **197 ms** (roads' 20 tiles:
  3 948 ms serial vs 613 ms concurrent, ×6.4);
- 124 × 197 ms = **24.4 s**, against the founder's observed 26–27 s.

**So it is neither bandwidth nor serialisation in our code — that distinction is the
finding.** One megabyte is 1.6 s even on a 5 Mbit/s link, and the reader already fans out
with `Promise.all`. What costs 27 s is paying a ROUND TRIP 124 times; any queueing
anywhere in the path multiplies straight into that count (which is why five independent
layers land together — they interleave in one queue). The durable answer is not "make 124
requests faster"; it is to stop making 124 requests.

## Decision

1. **Coalesce ranges.** PMTiles orders tile data by Hilbert tile id, so the tiles covering
   one bbox are nearly contiguous. `RangeUrlFetchSource` batches the ranges issued in one
   **macrotask** window and merges those separated by ≤ 64 KiB into a single span, slicing
   each caller its own bytes back. Measured end-to-end against live R2: **129 → 23
   fetches** across the five layers, features byte-identical.
2. **Coalescing must NEVER cost a tile.** A span bundles ~10 tiles, so a span failure
   would drop ten where today one fails alone — the exact §CONTEXT-DATA-HONESTY hole this
   subsystem exists to end. `flush()` re-issues every member of a failed span individually
   before giving up: the worst case degrades to precisely the pre-coalescing behaviour.
   Also pinned: the 4 MiB span ceiling (a sparse archive must not merge into a request
   that takes the tab down), members-are-input-indices (sorted positions would pair a tile
   with another tile's bytes), slice-back by value, abort-before-flush issuing no request,
   and the honest rejection when the individual re-issue also fails.
3. **The macrotask window is load-bearing.** `readContextTileFeatures` fans out with
   `Promise.all`, and each branch first awaits the cached header/directory promises, so
   the `getBytes` calls land on the MICROTASK queue — a `queueMicrotask` flush would fire
   after the first branch and coalesce almost nothing while appearing to work.

## The honest counter-measurement (recorded deliberately)

At the measured 197 ms serialised latency, the change is 25.4 s → 4.5 s. **On this
machine's unqueued, low-latency link the wall clock went 3 928 → 4 883 ms (+24 %)**,
because 272 KiB of skipped-over gap bytes is a real cost and there is no queue for the
saved round trips to pay it back. That is the trade, taken deliberately: **−106 round
trips for +272 KiB.** Any future revisit of this code must weigh both numbers, not just
the flattering one.

## Left deliberately undone (tracked in the V1 audit)

- `trees.pmtiles` / `rail.pmtiles` are 404 on R2. Both ARE declared in
  `tools/context-bake/bake.mjs` LAYERS with full consumers and renderers — the answer is
  BAKE them, not de-configure (see the context-bake runbook,
  `docs/04-reference/runbooks/RUNBOOK-CONTEXT-BAKE-RAIL-TREES.md`). The reader reports
  `unavailable` with the reason, neither consumer fabricates an empty layer, and the
  rejected header promise is cached so the 404 is paid once per session.
- The readiness overlay's own blocked-on signal at 25 s was not resolvable without a
  browser; test-verified and probe-verified against live R2, NOT browser-verified.
