# SPEC-01 — Geometry Kernel (L4)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `CRITICAL-REVIEW-2026-04-27.md §B1` |
| Phases | 1A (rails), 1B (wall), 1C (families), 2A (rooms/levels) |
| Required ADRs | ADR-020 (kernel robustness budget), ADR-024 (constraint solver) |

> The geometry kernel is `packages/geometry-kernel/`. It is **pure**: no THREE, no DOM, no I/O, no globals. Inputs are typed DTOs; outputs are `BufferGeometryDescriptor`s and analytic data. This spec defines what the kernel must guarantee, what it must not assume, and how robustness is measured.

---

## §1 Layer placement & purity

- Located at `packages/geometry-kernel/`. No transitive THREE imports — enforced by `forbiddenDependencies` lint (S01) and a CI test that runs `tsc --noEmit` against a Node-only tsconfig with no DOM lib.
- Only allowed deps: `gl-matrix`, `manifold-3d` (or replacement per ADR-020), `earcut`, internal `packages/schemas/`, internal `packages/ids/`.
- All exported functions are pure (no side effects, no mutable globals, no `Date.now()`, no `Math.random()`). Determinism is required: same input → same output, byte-identical, across Node and browser.
- Errors are `Result<T, KernelError>` not thrown exceptions. Throwing is reserved for invariant violations that must crash the worker.

---

## §2 Analytic vs display geometry split (closes B1 gap "no analytic vs display split")

Every BIM element produces **two** geometry families that the kernel keeps separate:

| Family | Purpose | Consumer |
|---|---|---|
| **Analytic** | The single mathematically correct representation: centerline / centerplane / centroid / axis. | Schedules (linear meters), IFC analytic representation context, structural export, MEP routing, AI reasoning. |
| **Display** | The render-ready swept solid / mesh / 2D symbol with material layers. | `scene-committer`, drawing engine, `glb` chunk bake, plan/section views. |

### §2.1 Per-element rule
- Wall: analytic = centerline polyline + height range; display = swept multi-layer solid.
- Slab/Floor: analytic = boundary polygon + level + thickness; display = capped extrusion with edge bevels.
- Column: analytic = axis line + cross-section; display = swept profile.
- Beam: analytic = axis curve + cross-section + orientation vector; display = swept profile with end cuts.
- Door/Window: analytic = host wall + offset + width/height + swing direction; display = panel + frame + symbol.
- Room: analytic = bounding loop + level + height; display = slab + ceiling + (optional) volume mesh.
- Roof: analytic = outline + slope plane(s) + thickness; display = capped solid.

### §2.2 Schedules and IFC use analytic only
The schedule subsystem (Phase 2C) and IFC export (Phase 3B) read **only** the analytic representation. Display data is reserved for the renderer and drawing engine. This is enforced by package boundary: `packages/schedules/` and `plugins/ifc-export/` may not import `BufferGeometryDescriptor` types.

### §2.3 Storage in L1 stores
The L1 store carries the analytic representation. The display representation is **derived** by the kernel on the path between L1 and the committer; it is cached in a per-element snapshot in `packages/scene-cache/` keyed by analytic-hash.

---

## §3 Robustness budget (closes B1 gap "no robustness contract"; ADR-020)

The kernel commits to surviving the following input space:

| Dimension | Lower | Upper | Notes |
|---|---|---|---|
| World coordinate range | −10 km | +10 km | Single-precision float-safe; further-out scenes shift origin (Phase 2A) |
| Minimum feature size | 0.1 mm | — | Below this, snapping rounds to the grid |
| Snapping epsilon | 0.5 mm | — | Two coordinates within ε are merged |
| Angular tolerance | 0.001° | — | Two normals within this are coplanar |
| Maximum vertex count per mesh | — | 2,000,000 | Hard fail above; soft warn at 500,000 |
| Maximum boolean operands | — | 64 | Hard fail above |
| Coplanar-face merge | required | — | Booleans must produce manifold output for coplanar inputs |
| Degenerate edge handling | "robust" | — | Edges below ε must be collapsed before boolean |
| Non-manifold input | rejected | — | `Result<_, KernelError.NonManifold>` |
| Self-intersecting input | rejected | — | `Result<_, KernelError.SelfIntersect>` |

### §3.1 Robustness suite
A property-test suite at `packages/geometry-kernel/__tests__/robustness/` runs **fast-check**-generated inputs against every public function. It must pass at PR-merge time. Suites:

- `wall-join.spec.ts` — generate two walls at angle θ ∈ [1°, 179°] with thickness t ∈ [50 mm, 600 mm]; assert miter joint is manifold and area is within 1% of analytic.
- `slab-boolean.spec.ts` — generate slab boundary polygons (convex, concave, multi-hole) and door/window cuts; assert boolean output is manifold and signed-volume-conserving.
- `coplanar-boolean.spec.ts` — generate two boxes sharing a face exactly; assert union has no T-junctions and no internal faces.
- `degenerate-edge.spec.ts` — generate inputs with edges in (0, ε); assert kernel collapses them, never crashes.

### §3.2 The CSG library decision (ADR-020)
**Default:** `manifold-3d` (Apache-2.0, manifold-by-construction, exact predicates option). Reasons:
- Manifold-by-construction guarantees no T-junctions or non-manifold output.
- Web-native (WASM build).
- Used by JSCAD; battle-tested at architectural scale.
- Active maintenance.

**Rejected:** `three-bvh-csg` — known robustness issues on coplanar faces; not manifold-by-construction; no exact predicates.

**Reserved for kernel-swap path (Phase 3+):** OpenCASCADE.js if D10 (parametric Family Editor) requires NURBS / b-rep operations beyond manifold-3d's polygonal model.

### §3.3 Behaviour outside the budget
- Inputs that violate §3 limits return `Result.err(KernelError)`. The L2 command handler catches this and surfaces a structured user error with the violating value.
- The kernel **never silently degrades**. No "best effort" paths.

---

## §4 Constraint solver (closes B1 gap "no constraint solver"; ADR-024)

Required for D10 (in-editor parametric component authoring / Family Editor).

### §4.1 Phase gating
- **Phase 1 (M1–M12):** No solver. Element families ship with hard-coded parameters only.
- **Phase 2A (S25–S30):** Light, per-element parametric expressions (length = a + b, angle = 90°). No multi-body solver.
- **Phase 3A (S49–S54):** Full 2D constraint solver in the Component Editor.

### §4.2 Solver choice (ADR-024)
- **Default:** `planegcs` (port of FreeCAD's solver, MIT, 2D, web-native).
- **Backup:** SolveSpace WASM build (more capable, GPL — license blocker for proprietary distribution).
- **Surface:** `packages/constraint-solver/` exposes `solve(constraints: ConstraintSet, vars: VarMap): Result<VarMap, SolverError>`.

### §4.3 Constraint types in v1 (Phase 3A)
- Distance (line–line, point–line, point–point).
- Angle (line–line).
- Parallel, perpendicular, equal-length, equal-radius.
- Coincident (point–point).
- Tangent (line–arc, arc–arc).
- Symmetric (about axis).
- Locked dimension (sealed user-set value).

### §4.4 Out of scope (post-GA)
- 3D constraints (assembly-level constraints between solids).
- Surface tangency / curvature continuity.
- Non-linear / inequality constraints.

---

## §5 Snapping policy

Snapping is **kernel-resident**, not tool-resident. Tools call `kernel.snap(point, hints)` and receive a normalised result.

| Snap source | Priority | Tolerance (screen px → world) |
|---|---|---|
| Lock (user-pinned) | 0 — wins all | ∞ |
| Endpoint | 1 | 8 px |
| Midpoint | 2 | 8 px |
| Intersection | 3 | 8 px |
| Perpendicular | 4 | 8 px |
| Tangent | 5 | 8 px |
| Extension | 6 | 8 px |
| Parallel | 7 | 8 px |
| Grid | 8 | grid spacing / 2 |
| Free | 9 — fallback | — |

The same priority table is used by every tool across every view. Tools cannot override the priorities; they may only restrict the allowed set via `hints`.

---

## §6 Determinism & cross-platform identity

The kernel must produce **byte-identical** output for the same input on Node 20 and the browser. Required because:
- `apps/bake-worker/` runs the kernel server-side and writes chunks consumed by browsers.
- Snapshot tests live at `packages/geometry-kernel/__tests__/snapshots/` and assert byte-identity.
- Multi-user CRDT integrity depends on every client computing the same display geometry from the same analytic data.

### §6.1 Sources of non-determinism that must not appear
- Floating-point reduction order: use `Kahan` summation for any sum of more than 8 terms.
- Hash-map iteration: never iterate `Map` insertion order for an output. Sort by stable key.
- `gl-matrix` SIMD path: feature-detect at boot; if SIMD path differs, fall back to scalar.
- WASM versions: the manifold-3d WASM is pinned to an exact SHA in `package.json`; bumps require re-baking the snapshot suite.

---

## §7 OpenTelemetry instrumentation

Required spans:
- `kernel.wall.geometry` — input `(wallId, vertices, height, layers)`; output `(triangles, durationMs)`.
- `kernel.slab.geometry` — input `(slabId, vertices, holes, thickness)`; output `(triangles, durationMs)`.
- `kernel.boolean` — input `(operandIds, operation)`; output `(triangles, durationMs, retries)`.
- `kernel.snap` — input `(point, allowedSources)`; output `(snapSource, distancePx)`.
- `kernel.error` — emitted on every `Result.err`; carries `KernelError.code` and the relevant input hash.

CI gate (P8): every new exported function in `packages/geometry-kernel/` has a corresponding span by S04 (warning-only) and S08 (error-level).

---

## §8 Performance budgets

| Operation | p50 | p95 | p99 | Bench |
|---|---|---|---|---|
| Single wall geometry (10-vertex centerline, 3 layers) | < 0.5 ms | < 1.5 ms | < 5 ms | `apps/bench/wall-geometry.ts` |
| Wall miter joint | < 0.3 ms | < 1 ms | < 3 ms | `apps/bench/wall-join.ts` |
| Slab boolean (boundary + 4 holes) | < 2 ms | < 6 ms | < 15 ms | `apps/bench/slab-boolean.ts` |
| 5,000-wall scene full re-bake | < 800 ms | < 1500 ms | < 3000 ms | `apps/bench/5k-walls.ts` |
| 10,000-wall scene full re-bake | < 1500 ms | < 3000 ms | < 6000 ms | `apps/bench/10k-walls.ts` |
| Snap query (per click) | < 0.1 ms | < 0.5 ms | < 1 ms | `apps/bench/snap.ts` |

These are gate-level numbers for M36 GA. Phase 1B (wall end-to-end) commits only to the wall and miter rows.

---

## §9 Cross-references
- Layer placement: `08-VISION §4` (L4).
- Purity / boundaries lint: `08-VISION §3` P1.
- Bench gates: `08-VISION §6`.
- Phase 1B wall walkthrough: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md`.
- Phase 1A rails: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md`.
- Conflict mapping: `CONFLICT-ANALYSIS.md §3.5`.
- ADR ledger: `adrs/ADR-020-kernel-robustness.md`, `adrs/ADR-024-constraint-solver.md`.
