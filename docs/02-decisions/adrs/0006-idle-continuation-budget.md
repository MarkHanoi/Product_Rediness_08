# ADR-006 — Idle-continuation N-frame budget

| Field | Value |
|---|---|
| Status | **Accepted** (S02 D4 draft, locked S03 D1) |
| Decision owner | F (sign-off) |
| Drafters | Agent B (Track B) |
| Affects layers | L5 (frame-scheduler, renderer) |
| Supersedes | — |

## Context

The `idle` lane (ADR-003) needs a budget — without one, an aggressive
post-effect (TRAA accumulation, SSGI sample, BVH refit) starves the
`interaction` lane and the user feels jank.  We need a single tunable that:

- Caps how many *frames in a row* the idle lane is allowed to consume.
- Survives a render context change (camera move) — the budget resets when
  the dirty flag flips back on.
- Is debuggable — the user can see in the OTel trace why an idle task
  was deferred.

## Decision

The idle lane gets a **30-frame rolling budget** (~500 ms at 60 Hz).

- After 30 consecutive frames where the idle lane consumed ≥ 50 % of the
  frame budget, the scheduler skips the idle lane for the next 5 frames.
- The budget resets to 30 whenever:
  - any `interaction` request arrives, or
  - any dirty flag is set after being clear, or
  - a fresh project is loaded (S04 clear-on-load).

### Why 30

- Long enough to make TRAA + SSGI converge in the typical case (~16 samples
  for TRAA, ~20 for SSGI).
- Short enough that a stalled tab still recovers within a wall second.
- Round number that fits in 5 bits if we ever need to encode it on the
  wire (we don't today, but the bake worker may want to in S21).

### `pryzm.frame.tick` attributes added by S03

- `pryzm.frame.idle_budget_remaining` (0..30)
- `pryzm.frame.idle_throttled` (boolean)

## Consequences

**Good**

- `idle-cpu` bench has a deterministic ceiling (< 2 %).
- Renderer can ship TRAA + SSGI + Bloom in S15 without per-effect rate
  limiting — they all share one budget.

**Bad**

- A user who leaves the tab idle on a complex scene will see TRAA
  converge then *pause*; this is acceptable per UX review.

## Alternatives considered

- **No budget** — lost: rejected by F at S02 D1 review.
- **Per-effect budgets** — lost: triples the configuration surface and
  the OTel attribute count.
- **Wall-clock ms budget** — lost: identical complaints to the deadline-
  based scheduler (ADR-003) — non-portable across throttled tabs.

## References

- ADR-003 (priority lanes)
- `apps/bench/src/benches/idle-cpu.bench.ts` (skeleton, S02; full S03)
- `08-VISION.md` §6
