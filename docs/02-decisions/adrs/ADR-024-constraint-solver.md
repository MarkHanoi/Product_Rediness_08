# ADR-024 — Constraint Solver

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `CONFLICT-ANALYSIS.md §6.10` (constraint-solver gap); `CRITICAL-REVIEW-2026-04-27.md §B1` follow-up |
| Required by | Sprint S49 (Phase 3A — Component Editor / D10 begins) |
| Owner | Architecture lead |
| Implementation | `packages/constraint-solver/`; consumed by Component Editor (`apps/component-editor/`) and Phase 2A light-parametric expressions. |
| Spec dependency | `SPEC-01-GEOMETRY-KERNEL.md` §4 |

---

## Context

D10 (in-editor parametric component / family authoring) is a v1 differentiator. Without a 2D geometric constraint solver, a user cannot author a parametric door, window, or furniture family with constraints like *parallel*, *equal-length*, *tangent*, *coincident*, or *symmetric* — which is the entire point of a component editor.

`SPEC-01 §4` proposes the solver shape, the phase gating, and the library choice. This ADR ratifies it before Phase 3A start.

> **Naming note.** `phases/PHASE-2B` uses the number ADR-024 informally for "Section view cut algorithm." That phase-doc usage is sprint-scoped working notation; the **canonical** ADR-024 in the strategic series (`docs/02-decisions/adrs/`) is this constraint-solver ADR, per SPEC-01 §4 and SPEC-01 §10's authoritative cross-reference.

---

## Decision

**`planegcs` (port of FreeCAD's solver, MIT) is the v1 constraint solver. It runs in `packages/constraint-solver/`. SolveSpace WASM is reserved as a backup. Phase gating: no solver in Phase 1; light per-element parametric expressions in Phase 2A; full 2D solver in Phase 3A.**

### Library choice

| Library | License | Capability | Decision |
|---|---|---|---|
| **`planegcs`** | MIT (port of FreeCAD GCS) | 2D geometric constraints, web-native | **Default** |
| SolveSpace WASM | GPL-2.0+ | More capable; 2D and (limited) 3D | **Reserved as backup** — *license blocker for proprietary distribution; would force a separate self-host channel.* |

### Phase gating (per SPEC-01 §4.1)
- **Phase 1 (M1–M12)** — No solver. Element families ship with hard-coded parameters only. (e.g. wall thickness is a number; not "thickness = a + b/2".)
- **Phase 2A (S25–S30)** — Light per-element parametric expressions: `length = a + b`, `angle = 90°`. Evaluated by a small expression evaluator (per ADR-027) — **not** the constraint solver. No multi-body coupling.
- **Phase 3A (S49–S54)** — Full 2D constraint solver in the Component Editor. Multi-entity, iterative, with under-/over-constrained detection.

### API surface
```ts
// packages/constraint-solver/
type ConstraintSet = { constraints: Constraint[], variables: VarSet };
type SolveResult =
  | { ok: true,  values: VarMap, status: 'well-constrained' | 'over-constrained' | 'under-constrained' }
  | { ok: false, error: SolverError };

function solve(set: ConstraintSet, hints?: SolveHints): Promise<SolveResult>;
function diagnose(set: ConstraintSet): Diagnosis;   // explains over-constraint redundancy or under-constraint DOF
```

### Constraint types in v1 (Phase 3A) — per SPEC-01 §4.3
- Distance (line–line, point–line, point–point).
- Angle (line–line).
- Parallel, perpendicular, equal-length, equal-radius.
- Coincident (point–point).
- Tangent (line–arc, arc–arc).
- Symmetric (about axis).
- Locked dimension (sealed user-set value).

### Out of v1 scope (post-GA)
- 3D constraints (assembly-level constraints between solids).
- Surface tangency / curvature continuity.
- Non-linear / inequality constraints.
- NURBS-based constraints (deferred with the OpenCASCADE.js kernel-swap, per ADR-020).

### Performance budget
- Solve a 50-constraint sketch in < 16 ms (one frame).
- Solve a 200-constraint sketch in < 100 ms.
- Solve in a Web Worker (per ADR-005) so the UI thread is free.
- Diagnostic mode (`diagnose`) may take longer; runs in background.

### Failure handling
- Over-constrained: solver returns `ok: true, status: 'over-constrained'` with the offending constraints flagged; UI highlights them in red.
- Under-constrained: returns `ok: true, status: 'under-constrained'` with remaining DOF count; UI shows the free dimensions.
- Numerically singular: returns `ok: false, error: { code: 'Singular' }`; UI prompts the user to relax a constraint.

### Determinism
- Solver outcomes must be deterministic given the same input + same library version.
- `planegcs` WASM is pinned to an exact SHA in `package.json`.
- Snapshot tests at `packages/constraint-solver/__tests__/snapshots/` cover the 20 canonical sketches.

### Integration with the Component Editor
- The Component Editor's sketcher emits `ConstraintSet` to the solver; solved values flow back as variable updates.
- Edits during solve: solver runs reactively on every constraint addition/edit; debounced via the same 250 ms policy as bake (ADR-010).
- Family parameters expose solver variables as user-editable inputs; the solver re-solves on every parameter change.

### OpenTelemetry
- `solver.solve { constraintCount, varCount, durationMs, status }`
- `solver.diagnose { constraintCount, durationMs, redundantCount, freeCount }`
- `solver.error { code }`

---

## Consequences

**Positive:**
- D10 (Component Editor) is unblocked at Phase 3A.
- MIT-licensed solver — no proprietary-distribution conflict.
- Phase gating means no constraint-solver code burdens Phases 1–2 unnecessarily.
- The Phase 2A "light expressions" path is clearly separate; users get parametric value-coupling without the solver's complexity.

**Negative:**
- `planegcs` is less battle-tested than SolveSpace; mitigated by the snapshot suite + the SolveSpace fallback path.
- Solver bugs surface as confusing UX (under/over-constrained states); mitigated by the diagnostic mode.
- Solver determinism depends on a pinned WASM SHA; bumps require re-snapshotting.

---

## Alternatives considered

### SolveSpace WASM (default)
- Rejected for v1 due to GPL-2.0 licensing — would force the editor to be GPL or to ship the solver separately. Acceptable as the *self-host* default if a customer mandates GPL provenance, but not the SaaS default.

### Custom solver
- Rejected — months of work to match `planegcs`; no upside.

### Defer constraint-solver to v2 entirely
- Considered as a Tier-2 cut (per ADR-018 T2.2). If exercised, D10 is deferred with it. Default plan keeps both in v1.

### Defer `Tangent` / `Symmetric` to v1.5
- Rejected — tangent is required for arc-based door swings and window glyphs; symmetric is required for casework. Both ship in v1.

### Use the solver for Phase 2A light expressions
- Rejected — overkill; expression evaluator (per ADR-027) is simpler, faster, and has no solver-state to worry about.

---

## Phase rollout
- S25 (Phase 2A) — light expression evaluator lands (per ADR-027); **no** solver yet.
- S49 (Phase 3A start) — `packages/constraint-solver/` lands with `planegcs` integrated; first 5 constraint types working.
- S51 — full v1 constraint type set live.
- S52 — diagnostic mode live; UI for under/over-constrained sketches.
- S54 (Phase 3A close) — Component Editor uses the solver end-to-end; family authoring viable.
- S60 — performance budgets verified at the 200-constraint case.
- S70 — snapshot suite green across Node 20 + Chrome + Safari + Firefox.
- S72 (M36 GA) — first launch-partner-authored loadable family ships with constraints.
