# SPEC-48 — Constraint Solver

**Status**: Active (S52 §4.1 — porter contract + MockSolver landed; real planegcs WASM lands at S53 D1).
**Cross-refs**: ADR-029 (PDF-to-BIM scope), `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` §4.1 (lines 1106-1294), §4 exit criteria (lines 1486-1490).

## §1 — Goals

The constraint solver underpins the Element Creator's 2D sketcher. Users define construction geometry by placing points + lines + arcs and tagging them with constraints (this segment is parallel to that one, this distance is 800 mm, this point is fixed at the origin). The solver iterates the sketch until all constraints are satisfied, reporting back well-constrained / under-constrained / over-constrained status per planegcs convention.

This spec pins the **porter contract** (`SolverPorter`), the **first five constraint kinds** that ship in S52 (the rest of planegcs's ~30-kind catalogue ships incrementally at S53–S55), the **Web Worker dispatch protocol**, and the **performance budgets**. The actual planegcs WASM binding ships at S53 D1 alongside the sketcher canvas in `apps/component-editor`; until then the `MockSolver` covers the porter contract and the snapshot test stubs.

## §2 — Constraint kinds

The first five constraint kinds, per spec exit criterion line 1486:

| Kind | Discriminator | Geometry |
|---|---|---|
| `distance-pp` | `{p1, p2, value}` | distance between two points equals `value` (literal mm OR parameter name) |
| `parallel` | `{l1, l2}` | two lines are parallel (cross product → 0) |
| `perpendicular` | `{l1, l2}` | two lines are perpendicular (dot product → 0) |
| `coincident-pp` | `{p1, p2}` | two points share the same position |
| `fixed` | `{p, x, y}` | point pinned to absolute coordinates |

`SketchConstraint` is a discriminated union — exhaustive matching is enforced at the type level. `ScalarOrParam` (used by `distance-pp.value`) is `number | string`; the solver resolves names via `resolveExpr(value, parameterValues)` per spec lines 1196-1200.

## §3 — Porter contract

```ts
interface SolverPorter {
  solve(set: ConstraintSet, hints?: SolveHints): Promise<SolveResult>;
  diagnose(set: ConstraintSet): Promise<DiagnoseResult>;
}
```

`ConstraintSet` carries:
- `variables: Record<VariableId, number>` — initial values (mm).
- `constraints: SketchConstraint[]` — the constraints to satisfy.
- `parameterValues?: Record<string, number>` — named parameters for `ScalarOrParam` lookups.
- `pointVariables?: Record<PointId, [VariableId, VariableId]>` — point → x/y pair mapping (defaults to `${pointId}-x` / `${pointId}-y`).
- `lineEndpoints?: Record<LineId, [PointId, PointId]>` — line → endpoint pair (defaults to `${lineId}-p0` / `${lineId}-p1`).

`SolveResult` is discriminated on `ok`:
- `{ok: true, values, status, dof, durationMs, iterations}` where `status` is `'well-constrained' | 'under-constrained' | 'over-constrained' | 'singular'`.
- `{ok: false, error: {code: 'Singular' | 'NoVariables' | 'InvalidConstraint', message}, durationMs}`.

`DiagnoseResult` reports `{redundant: string[], freeDOF: number, unconstrained: VariableId[]}` so the sketcher can highlight redundant constraints in red and report the running DOF in the status bar.

## §4 — Web Worker dispatch

The solver runs in a dedicated Web Worker so the UI thread stays free per spec lines 1218-1230. Inbound messages:

```ts
{ id: string, kind: 'solve',    payload: { set, hints?  } }
{ id: string, kind: 'diagnose', payload: { set         } }
```

Outbound messages:

```ts
{ id: string, result: SolveResult | DiagnoseResult }
{ id: string, error:  string }
```

`createWorkerHandler({solver})` returns a per-message handler that wraps the porter call and replies with the matching `id`. The actual Web Worker entry is a 3-line shim (S53 D1):

```ts
import { createWorkerHandler, MockSolver } from '@pryzm/constraint-solver';
const handler = createWorkerHandler({ solver: new MockSolver() });
self.addEventListener('message', (e) => handler(e.data, (m) => self.postMessage(m)));
```

Splitting the handler from the `self.*` attachment lets the engine tests exercise the protocol synchronously and lets the Node-side tests import the worker module without a `self` global.

## §5 — Performance budgets

| Scenario | Target | Source |
|---|---|---|
| 50-constraint sketch p95 | < 16 ms | spec exit criterion line 1488 |
| 200-constraint sketch p95 | < 100 ms | extrapolation; S53 D1 will tighten |
| Per-constraint solve overhead | < 0.5 ms | MockSolver baseline |

The 50-constraint baseline is held by `apps/bench/src/benches/constraint-solver.bench.ts` against the MockSolver — it proves the porter / iterator overhead is negligible. The real planegcs WASM bench (S53 D1) holds the actual 16 ms budget.

## §6 — Telemetry

Namespace `pryzm.solver.*` per spec line 2220:

| Metric | Type | Notes |
|---|---|---|
| `pryzm.solver.solve.duration_ms` | histogram | p50/p95/p99 |
| `pryzm.solver.diagnose.duration_ms` | histogram | p50/p95/p99 |
| `pryzm.solver.constraint.count` | histogram | input size |
| `pryzm.solver.iterations` | histogram | convergence speed |
| `pryzm.solver.status` | counter (attribute) | `'well-constrained' | 'under-constrained' | 'over-constrained' | 'singular'` |

Emitted by the Web Worker entry — wraps each `solve()` / `diagnose()` call in a span with the worker thread's clock as the source.

## §7 — Cross-refs

- **ADR-029 Part B** — PDF-to-BIM Stage 4 review queue uses the same solver for downstream consistency checks (S60).
- **SPEC-45** — vectorisation pipeline. Stage 2 wall classifier (S51) + Stage 2 openings (S52 §4.2) feed entities into the sketcher.
- **VI-AI-ELEMENT-CREATOR.md §4.1** — primary spec source.
- **VI-AI-ELEMENT-CREATOR.md §5** — sketcher canvas in `apps/component-editor` (lands S53 alongside the real planegcs adapter).

## §8 — Deferred items

- **Real planegcs WASM binding**: ships at S53 D1 (build/ops concern — needs an emscripten artifact pulled via the `PLANEGCS_WASM_URL` env. The selector `loadSolver({env})` is already wired to fall through to `MockSolver` until the adapter module ships).
- **20-canonical-sketch snapshot suite** (per spec line 1487): pinned to the real planegcs adapter; lands at S53 D1.
- **Construction-geometry kinds**: `tangent`, `equal`, `symmetric`, `point-on-line`, `point-on-circle`, `radius`, `angle-vv`, etc. — incremental landings at S53–S55.
