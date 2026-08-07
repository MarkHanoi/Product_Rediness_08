# ADR-0304 — `invalidate()` conflates staleness and release; a view keeps its drawing until the replacement is ready

| Field | Value |
|---|---|
| **Status** | Accepted — 2026-08-07 |
| **Tags** | `§FIX-PLAN-GEN-SELF-SUPERSEDE` (L-705) · `§FIX-PLAN-COMPUTE-THEN-SWAP` |
| **Owner** | Views / technical-drawing pipeline (`ViewTechnicalDrawingCache`, `ViewDependencyTracker`, `PlanViewManager`) |
| **Closes** | Founder, 2026-08-07: *"EVERY SINGLE TIME I CREATE AN ELEMENT … THE COMPLETE PLAN VIEW OR ELEVATION DOES A SHORT COMPLETE REFRESH: IT GOES WHITE AND RENDERS AGAIN. IS THIS INTENDED?"* — plus the `§FIX-PLAN-BLANK-STALEGEN` recovery firing on EVERY edit for hours |
| **Constraints** | C04 §3.3, SPEC-30 §2/§9, ADR-0292 (measure first), ADR-0297 L2, ADR-0299 (§RECOVERY-MUST-REFUSE) |
| **Implemented by** | `387d03c9` (self-supersede) · `5a6d82ed` (compute-then-swap) |

---

## The lesson (one sentence)

**`invalidate()` performed two unrelated operations under one name — "my generation is
stale" and "throw the current drawing away" — and every defect in this family came from a
caller needing one and getting both.**

## Context

### Defect 1 — a driver superseding ITSELF (`387d03c9`)

`§FIX-PLAN-BLANK-STALEGEN` ("accepting a stale projection into an EMPTY cache to avoid a
blank view") logged on every edit, for hours, across sessions — a recovery whose steady
state is "always on" is masking a broken normal path (ADR-0299). The arithmetic was the
fingerprint: gap of EXACTLY ONE, every time (`staleGen=54 currentGen=55 lastAcceptedGen=53`).
A genuine two-driver race (L-307) produces a gap of two or more, and a varying one.

`ViewDependencyTracker._flush()` took a generation via `beginProjection()`; when the
incremental-graft fast path fell through, the handler called `invalidate(viewId)` — which
**bumps the generation and empties the cache** — and then carried on with the generation it
was already holding. The full fallback pass was born stale-by-one into a cache the handler
had itself just emptied. Cost: a duplicated full projection on every edit, the loss of
INVARIANT D's protection, and a recovery permanently masking a broken commit path (the
stale-accepted drawing WAS current-content, so nothing looked wrong on screen).

### Defect 2 — the blank window is structural (`5a6d82ed`)

The white flash on every element create was a **paired-operation gap**: `invalidate()`
DISCARDED the drawing, and only then did the pipeline export and project the replacement.
Every frame in between had nothing to render. Making the projection faster only narrows
the window; it cannot close it.

## Decision

1. **A view MUST NOT discard its current drawing until the replacement is ready.** The
   default edit path is `beginSwap(viewId)`: take a generation, KEEP the drawing on
   screen, swap atomically on commit.
2. **A driver that throws the drawing away MUST re-declare its generation atomically.**
   `restartProjection(viewId): number` = invalidate + take a fresh generation in ONE call;
   two calls give the caller an ordering to get wrong.
3. **The choice is now a named family, chosen deliberately:**
   - `beginProjection()` — take a generation; say nothing about the drawing.
   - `restartProjection()` — DISCARD the drawing, then take a generation (L-705).
   - `beginSwap()` — KEEP the drawing, swap on commit ← **the default for edits**.
4. **The one case where holding is wrong is explicit.** When there is nothing to project,
   the correct content is NOTHING; both "nothing to project" early returns invalidate
   deliberately. (Previously they were silently correct only as a side effect of the
   coarse invalidate — correctness that survives only as a side effect must be made a
   statement.)
5. **A recovery must get LOUD when it stops being rare** (ADR-0299 applied). Consecutive
   stale-accepts are counted per view, reset only by a generation-matching accept; past 3
   in a row the log escalates to `console.error`, names the DEFECT class, and prints the
   diagnostic that separates the two causes (gap == 1 ⇒ self-supersede; larger/varying ⇒
   the L-307 race). The guard is NOT widened, and the cold-cache anti-blank guarantee is
   untouched.
6. **Measure the symptom before claiming it** (ADR-0292). `blankWindowStats(viewId)` times
   every window in which a view has no drawing to render (count/avg/max, OTel span). The
   acceptance criterion: N consecutive creates on a busy plan leave count at 0. The probe
   falls silent by construction once compute-then-swap is universal.
7. **Declining a fast path must say why** (`§DIAG-GRAFT-FALLTHROUGH`): each graft gate
   names itself (no-graft-ids, not-a-plan-view, ifc-models-present, flag-off,
   no-warm-drawing, graft-produced-nothing), so "why did an edit take the full pass?" is
   answerable from the log.

## Consequences

- Three suites that pinned "the coarse path calls `invalidate()`" were updated to assert
  the NEW contract — the pinned behaviour is the one this ADR removes.
- `§PERF-PROJECTION-CANCEL-SUPERSEDED` cancels only while work REMAINS (the chunk-boundary
  predicate was also true after the last group, discarding complete drawings).
- NOT claimed: the rebuild is still O(scene) per edit — that is ADR-0302's territory
  (`§EDIT-COST-IS-PROPORTIONAL`); reason codes make each fall-through attributable, and
  the fix is deferred and reported separately.
