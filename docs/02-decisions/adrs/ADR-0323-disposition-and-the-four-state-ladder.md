# ADR-0323 — Disposition (wire / replace / remove) and the four-state ladder

- **Status**: ACCEPTED — ratified by STR-06 (founder directive, 2026-08-12)
- **Evidence**: the review's authored-but-unwired haul — the consequence-preview trigger
  surface with zero callers · `CascadeRunner` inert with eleven self-documenting headers ·
  five orphaned packages (`pdf-to-bim`, `expr-eval`, `wcag-audit`, `legacy-shim`,
  `bench-visual-diff`) · ≥11 dispatched events with no listener, including a **C13
  isolation-leak alarm nobody hears** · `TemporalGraph.getEdgesForElement` with zero callers
  including tests · dead cascade events typed in the catalog. This repo's signature hazard,
  now with a rule instead of a recurring discovery.

## Decision

1. **The disposition rule.** *An authored capability may not remain indefinitely in the
   state "typed, tested, exported, but not reachable."* Every capability found in that state
   receives an explicit, recorded disposition: **WIRE** (with an owner and a target phase),
   **REPLACE** (name the successor; delete the loser in the same change), or **REMOVE**
   (delete the code, exports, catalog entries and misleading comments together). "Later"
   is not a disposition.
2. **Events need consumers or contracts.** Every dispatched event has an identified consumer
   or an identified external contract, or the dispatch AND its catalog entry are deleted. An
   event with no consumer is not automatically a missing listener — **sometimes it is dead
   architecture**, and a typed catalog entry that reads like wiring to a grep is how the dead
   cascade survived undetected.
3. **The four-state ladder is the measurement vocabulary** for every capability claim:
   **AUTHORED** (exists in source) → **REACHABLE** (production can invoke it) →
   **COMPOSABLE** (participates in the canonical command/reasoning path) → **CERTIFIED**
   (an executable invariant proves its behaviour). Findings state their rung: MISSING WIRING
   = AUTHORED✓/REACHABLE✗; MISSING CERTIFICATION = COMPOSABLE✓/CERTIFIED✗. No capability may
   be claimed at a rung above its evidence — this is C70 §4.2 ("machinery-present ≠
   capability-reachable") given a ladder.
4. **Dispositions are time-bounded**, in the `gate-newly-measured.json` idiom: each carries
   its decision, owner, and a review date; an expired undecided disposition fails the run
   that discovers it. The founder owns only escalations (a REMOVE of something user-facing,
   a WIRE that changes behaviour) — starting to *decide* requires no sign-off, per the same
   reasoning that instrumenting requires none.
5. **First disposition docket** (from the review, decisions per STR-06):
   consequence-preview trigger surface → **WIRE** (R3 of the reasoning-loop plan) ·
   `CascadeRunner` → **TEST-THEN-DECIDE** (the one named promotion test; not wired merely
   because it exists) · `SpeculativeEngine` → **finish / mine / retire**, decided in R1 by
   whether its ownership boundary fits the consequence contract · provenance export →
   **WIRE, after ownership** (lifecycle first, exporters consume; never a per-field patch) ·
   `pdf-to-bim` review-queue, `expr-eval`, `wcag-audit`, `ai-generative` descriptor,
   orphaned events (`switch-tab`, `dim-*`, `bim-wall-system-error`,
   `pryzm-render-registry-isolation-leak`, `bim-model-healed`, `pryzm-ambient-observation`)
   → **per-item wire-or-remove**, each by rule 2, none wired reflexively. The isolation-leak
   alarm is flagged as the one whose *removal* would need founder sign-off — deleting an
   alarm is a policy statement.

## Consequences

`check-no-hidden-mock` (C74) and the future reachability gate gain a shared vocabulary. The
gap register's implementation-type taxonomy maps onto the ladder mechanically. And every
future "we already have X" claim must state X's rung — which would have prevented the mock
solver, the dead cascade, and the unreachable preview from ever being cited as capability.
