# ADR-033 — MEP System Propagation: Graph Traversal (not Constraint Solver)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-04-27 |
| Phase | 4 (M37–M42) |
| Deciders | Architecture lead, MEP domain lead |
| Related | SPEC-38, SPEC-31 §2 (bench targets) |

## Context

MEP system propagation (SPEC-38) computes flow direction, sizing, pressure drop, system inheritance across N elements. Two algorithmic approaches:

1. **Directed-graph traversal** — system is a DAG; sizing is a topological-order pass.
2. **Constraint solver** (e.g. integration of `[strategic ADR-024]` solver) — sizing is a global-optimisation problem.

## Decision

**Graph traversal** at Phase 4. Constraint solver may layer on later for advanced cases (loop systems, redundant supply paths) in Phase 7+.

## Consequences

**Positive**
- O(n) per propagation, predictable performance per SPEC-38 §5 NFTs.
- Incremental propagation on edit (only downstream re-evaluates).
- Industry-standard MEP behaviour (Revit MEP uses this model).
- Composes with worker pool (per ADR-005) trivially.

**Negative**
- Cannot natively express loop systems or redundant-supply optimisation.
- Sizing decisions are local-greedy, not globally-optimal.

**Risks**
- Customer demand for solver-grade optimisation. Mitigated by Phase 7 plan to add solver as second-pass refinement (not replacement).

## Alternatives considered

- **Constraint solver** — rejected for Phase 4: 10× perf cost, complex debugging, out-of-budget for the M37–M42 window.
- **Hybrid (traversal-then-refine)** — deferred to Phase 7; the hybrid composes naturally with ADR-024 solver.
