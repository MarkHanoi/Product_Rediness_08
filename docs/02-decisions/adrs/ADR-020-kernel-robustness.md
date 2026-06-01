# ADR-020 — Geometry Kernel Robustness Budget

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `CONFLICT-ANALYSIS.md §6.9`; `CRITICAL-REVIEW-2026-04-27.md §B1` |
| Required by | Sprint S07 (Phase 1B start — wall producer/committer) |
| Owner | Architecture lead |
| Implementation | `packages/geometry-kernel/`; CSG library `manifold-3d` (default), kernel-swap path for OpenCASCADE.js. |
| Spec dependency | `SPEC-01-GEOMETRY-KERNEL.md` §3 |

---

## Context

The geometry kernel is what holds the architecture together: every element family runs through it, every drawing is projected from it, every IFC export reads it. A non-robust kernel produces non-manifold meshes (broken IFC), self-intersecting volumes (broken schedules), and crashes the bake worker (broken SaaS).

`CRITICAL-REVIEW-2026-04-27.md §B1` and `CONFLICT-ANALYSIS.md §6.9` flag the absence of a *robustness contract* — the input space the kernel commits to surviving, the CSG-library decision, and the property-test discipline. SPEC-01 §3 proposes the budget. This ADR ratifies it before S07 (when the wall producer/committer starts using the kernel for real geometry).

---

## Decision

**The kernel guarantees robust output across a defined input budget. Out-of-budget inputs return structured errors, never crashes. `manifold-3d` is the default CSG library; OpenCASCADE.js is reserved for the kernel-swap path. Property-test suite is a PR-merge gate.**

### Robustness budget (per SPEC-01 §3)

| Dimension | Lower | Upper | Notes |
|---|---|---|---|
| World coordinate range | −10 km | +10 km | Single-precision float-safe; further-out scenes shift origin (Phase 2A). |
| Minimum feature size | 0.1 mm | — | Below this, snapping rounds to grid. |
| Snapping epsilon | 0.5 mm | — | Two coordinates within ε are merged. |
| Angular tolerance | 0.001° | — | Two normals within this are coplanar. |
| Maximum vertex count per mesh | — | 2,000,000 | Hard fail above; soft warn at 500,000. |
| Maximum boolean operands | — | 64 | Hard fail above. |
| Coplanar-face merge | required | — | Booleans MUST produce manifold output for coplanar inputs. |
| Degenerate edge handling | "robust" | — | Edges below ε MUST be collapsed before boolean. |
| Non-manifold input | rejected | — | Returns `Result.err(KernelError.NonManifold)`. |
| Self-intersecting input | rejected | — | Returns `Result.err(KernelError.SelfIntersect)`. |

### Behaviour outside the budget
- Inputs that violate the table return `Result.err(KernelError)` carrying the violating value and a diagnostic context.
- The L2 command handler catches and surfaces a structured user error.
- The kernel **never silently degrades**. No "best effort" paths.
- The kernel **never throws** at the API surface; throws are reserved for invariant violations that must crash the worker.

### CSG library (default): `manifold-3d`
- Apache-2.0; manifold-by-construction; exact predicates option; web-native (WASM).
- Used by JSCAD; battle-tested at architectural scale.
- Active maintenance.
- Pinned to an exact SHA in `package.json`; bumps require re-baking the snapshot suite (per SPEC-01 §6.1).

### CSG library (rejected for v1): `three-bvh-csg`
- Known robustness issues on coplanar faces; not manifold-by-construction; no exact predicates.

### Reserved kernel-swap path (Phase 3+): `OpenCASCADE.js`
- If D10 (Component Editor) requires NURBS / b-rep operations beyond manifold-3d's polygonal model, OpenCASCADE.js becomes a second backing kernel **for parametric authoring only** (not for interactive baking).
- The kernel API stays the same; the backing implementation is selected per call site.
- Decision deferred to S49 (Phase 3A start); not in v1 scope.

### Property-test suite (PR-merge gate)
At `packages/geometry-kernel/__tests__/robustness/`, using `fast-check`:

- `wall-join.spec.ts` — two walls at angle θ ∈ [1°, 179°] with thickness t ∈ [50 mm, 600 mm]; assert miter joint is manifold and area within 1% of analytic.
- `slab-boolean.spec.ts` — slab boundaries (convex, concave, multi-hole) with door/window cuts; assert manifold + signed-volume-conserving.
- `coplanar-boolean.spec.ts` — two boxes sharing a face; assert union has no T-junctions or internal faces.
- `degenerate-edge.spec.ts` — inputs with edges in (0, ε); assert kernel collapses, never crashes.

Each suite runs at PR merge; failure blocks the merge.

### Determinism (per SPEC-01 §6)
- Byte-identical output on Node 20 and the browser for the same input.
- Required because: bake-worker runs server-side and writes chunks consumed by browsers; multi-user CRDT integrity depends on every client computing the same display geometry from the same analytic data.
- Sources of non-determinism explicitly handled:
  - Float reduction order: Kahan summation for any sum > 8 terms.
  - Hash-map iteration: never iterate insertion order for output; sort by stable key.
  - `gl-matrix` SIMD path: feature-detect; if SIMD differs, fall back to scalar.
  - WASM versions: pinned to exact SHA.

### Error taxonomy
```ts
type KernelError =
  | { code: 'OutOfRange',     dimension: string, value: number, bound: number }
  | { code: 'NonManifold',    elementId: ElementId, hint: string }
  | { code: 'SelfIntersect',  elementId: ElementId, region: Bbox3 }
  | { code: 'TooManyVertices',count: number, limit: number }
  | { code: 'TooManyBoolean', count: number, limit: number }
  | { code: 'HostTooShort',   hostId: ElementId, requestedAt: number, available: number }
  | { code: 'Internal',       trace: string };
```
`Internal` is reserved for unexpected library failures (e.g. WASM crash) and is the only category that may indicate a kernel bug.

### OpenTelemetry
- `kernel.<op>` spans for every public function (per SPEC-01 §7).
- `kernel.error { code, ... }` emitted on every `Result.err`.
- Aggregate dashboards track error rates per `code`; spike on any code other than `OutOfRange` triggers an on-call alert.

---

## Consequences

**Positive:**
- The integration surface (committer, schedules, IFC export) can rely on manifold output unconditionally.
- Failures are structured and surfaced to the user with actionable context.
- Property-test discipline catches regressions at PR time, not at customer time.
- Determinism guarantees enable cross-platform CRDT integrity.

**Negative:**
- The 2 M-vertex hard cap and 64-operand boolean cap will surprise some power users; documented in operations notes; mitigated by the soft-warn at 500 k vertices showing a UI hint earlier.
- Property-test suite adds ~3 minutes to PR time; mitigated by parallel CI runners.
- Pinning manifold-3d slows security updates; mitigated by quarterly review + snapshot re-bake process.

---

## Alternatives considered

### `three-bvh-csg`
- Rejected — robustness issues per SPEC-01 §3.2.

### `csg.js` (the original)
- Rejected — abandoned; not manifold-by-construction.

### Custom CSG implementation
- Rejected — months of work to match manifold-3d's robustness; no upside.

### "Best-effort" degradation on out-of-budget inputs
- Rejected — silent corruption is worse than structured failure for a CAD product.

### Throw on errors (no `Result` type)
- Rejected — error handling discipline degrades; structured errors are part of the contract surface.

---

## Phase rollout
- S04 — `packages/geometry-kernel/` skeleton; manifold-3d wired; first wall geometry.
- S07 — wall miter property test passes (`wall-join.spec.ts`); wall producer/committer starts using kernel for real.
- S08 — robustness suite at PR-merge gate.
- S11–S22 — per-family tests added as families ship in Phase 1C.
- S25 — slab + coplanar tests for Phase 2A rooms/levels.
- S43 — determinism snapshot suite green across Node 20 + Chrome + Safari + Firefox.
- S49 (Phase 3A start) — go/no-go on OpenCASCADE.js kernel-swap path for the Component Editor.
- S72 (M36 GA) — full robustness budget held; published support matrix; unsupported corners documented.
