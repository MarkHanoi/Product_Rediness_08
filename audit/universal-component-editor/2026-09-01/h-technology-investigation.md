# LANE H — TECHNOLOGY INVESTIGATION

**Spec authority:** `docs/01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md` §17–§20 (geometry
kernel · abstraction · exact-vs-mesh · topology), §29–33 (IFC/bSDD/IDS), §71–73 (performance/caching),
executed as §77 **PHASE 2 — Technology investigation**, under §1 (**DO NOT CODE — archaeology only**).

**Date:** 2026-09-01 · **Lane:** H (the one EXTERNAL lane) · **Status:** knowledge only. Zero
production files touched. Every external claim below was verified against the npm registry, the
project's own licence text, or its release history — **never a README badge**.

---

## 0 · THE HEADLINE

> **The spec asks "which geometry kernel?". The archaeology answers a different, better question.**
> PRYZM already runs a kernel — **its own**, `@pryzm/geometry-kernel` — with a **real WASM boolean
> engine (`manifold-3d`, Apache-2.0, 82k downloads/wk)** behind a **lint-enforced adapter boundary**
> that is precisely the boundary spec §18 asks to be built. The genuine decision is therefore **not
> "which kernel", it is "do we add an EXACT (B-Rep) evaluator ALONGSIDE the existing MESH one, and
> when?"** Every candidate below is scored against *that*, not against a greenfield.

> **The second headline is a MUST NOT, and it outranks this lane.** The spec's constraint half
> (§14–15) collides with a live contract. **`C74-CONSTRAINT-HONESTY` §4.1 forbids building, binding
> or budgeting a geometric constraint solver** on the argument that the product category implies one,
> and §4.5 records the standing verdict **UNPROVEN**. A recommendation of "adopt PlaneGCS" that does
> not first route through **C74 §4.2 (a) validation → (b) enforcement → (c) solving** is proposing a
> contract violation, not a technology choice. §5.3 gives the compliant route.

> **The third headline, found late and the largest of the three.** **The Universal Component Editor is
> not greenfield.** There is an entire family stack on disk — a typed expression DSL
> (`@pryzm/family-runtime`), a definition→type→instance bake into the geometry kernel
> (`@pryzm/family-instance`), a `.pryzm-family` ZIP loader, seven schema families, document
> migrations, and a **standalone SPA at `apps/component-editor`** with sketch constraint commands, an
> AI bridge and a marketplace publish flow. Most of it is real and tested; **the SPA is unreachable
> and the main editor shows an "under construction" modal.** §1.8, §4.7. *I nearly filed the
> expression engine as a gap — §3.3 records that near-miss deliberately.*

**Recommendation in one line:** keep `manifold-3d` as the mesh evaluator and **stage** an exact
evaluator behind the existing `BufferGeometryDescriptor` seam, adopting **OCCT via `replicad` /
`replicad-opencascadejs`** (MIT wrapper, LGPL-2.1 WASM, **licence YELLOW with a defined compliance
recipe**) **only when a named §57 operation — fillet, chamfer, shell/thicken — is actually required**.
Adopt **nothing** from the 2026 cohort (`occt-wasm`, `brepjs`, `opengeometry`): they are 5–7 months
old and the spec's own §17 says *"never auto-select the newest project."* Full reasoning in §5.

**And the cheapest win in the whole lane, which needs no technology at all:** test the hypothesis in
§4.6 that `sweep`/`loft`/`revolve` are blocked by a **curve-tessellation gap, not a solver gap**. The
kernel producers exist; `arcToPoints` exists. If the hypothesis holds, three of four §57 Solid tools
light up with **no new dependency, no WASM, and no C74 authorisation**.

---

## 1 · WHAT EXISTS — the technology PRYZM already ships

Every row was verified by opening the file, not by reading a manifest.

### 1.1 `@pryzm/geometry-kernel` — PRYZM's own kernel. THE authority. Reachable.

| | |
|---|---|
| **Authority file** | `packages/geometry-kernel/src/index.ts` — public surface **frozen by ADR-009** (S08 D2) |
| **Contract** | `C73-GEOMETRY-DETERMINISM-AND-TOLERANCE` (determinism + epsilon policy); `C04` downstream |
| **Layer** | **L4**, declared PURE |
| **Representation** | `BufferGeometryDescriptor` — indexed triangle soup + material groups. **MESH, not B-Rep.** |
| **Reachable in production?** | **YES** — ~20 element-family producers drive the shipped editor |

The barrel header states the isolation rule verbatim (`packages/geometry-kernel/src/index.ts:1-6`):

```
// @pryzm/geometry-kernel — public surface (frozen by ADR-009 in S08 D2).
//
// L4 of the architecture stack — pure DTO → geometry producers.  Lint
// rule `pryzm/no-three-in-kernel` (real-enforced as of S07-T3) hard-fails
// any `three`, `@thatopen/*`, or `web-ifc*` import inside this tree.
```

⭐ **This is already the spec §18 adapter boundary.** §18 asks for
`canonical geometry → geometry adapter → kernel → exact geometry → tessellation → Three.js/WebGPU`,
with the kernel as a *replaceable evaluator*. PRYZM has exactly that seam, and it is **lint-enforced**
rather than merely documented: THREE, `@thatopen/*` and `web-ifc*` **cannot** cross into the kernel.
**Do not propose a new adapter layer. Propose a second evaluator behind the existing one.**

**General-purpose (non-element-family) producers already present** — `packages/geometry-kernel/src/producers/`:

| Producer | File | Lines | Substance (read, not assumed) |
|---|---|---|---|
| `produceExtrude` | `extrude.ts` | 324 | Closed XZ polyline → prism. Caps + sharp side normals; CW input auto-reversed, reported via `appliedReversal`. **FROZEN signature.** |
| `produceRevolve` | `revolve.ts` | 236 | `{r,y}` silhouette about world Y. End caps emitted **only** when the sweep is partial, so a full revolve stays watertight without a duplicated seam. |
| `produceSweep` | `sweep.ts` | 307 | Profile along a 3D polyline with **rotation-minimising (Bishop) parallel-transport frames** — the correct, non-naive formulation. |
| `produceLoft` | `loft.ts` | 256 | N sections in arbitrary planes with per-section `right`/`up`; closed-loop mode. |
| `produceBoolean` | `boolean.ts` | — | ∪ / − / ∩ via `manifold-3d` WASM. **FROZEN signature** `(op,a,b,opts) => Promise<Descriptor>`. |
| `produceWallWithVoids` | `wallVoids.ts` | — | Wall solid − N opening boxes → ONE manifold descriptor with clean voids. |
| `section-cut` | `section-cut.ts` | 134 | Pure DTO → 2D cut edges (moved from `plugins/section-view`, W-09). |
| `offsetPolygon` | `pure/polygonOffset.ts` | — | **§W2A-ONE-OFFSET** — THE polygon offset. A second implementation anywhere in the repo is blocked by `tools/ga-gate/check-offset-implementations.ts`. |
| `orthoConstrainXZ` | `math/orthoConstraint.ts` | — | **§RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT** (founder ruling 2026-08-24) — THE ortho constraint for the whole repo, in ONE function. Lives in the kernel because geometry-slab and geometry-wall depend on each other and the kernel depends on neither. |

⭐ **Read that table against spec §57's Solid toolgroup** (*extrude, revolve, sweep, loft, boolean
∪/−/∩, shell, thicken, pattern, array*). **Six of eleven already exist as real, tested, frozen
producers.** What is missing — **shell/thicken, fillet, chamfer, pattern/array** — is precisely the set
that is hard *without* B-Rep. That is the whole exact-kernel question, and §3.1 states it as such.

### 1.2 `manifold-3d` — the boolean engine. Real, WASM, and an excellent existing choice.

| | |
|---|---|
| **Authority file** | `packages/geometry-kernel/src/csg/KernelCSG.ts` |
| **Declared** | root `package.json:269` `"manifold-3d": "^3.4.1"`; **optional peer** of geometry-kernel (`packages/geometry-kernel/package.json:32,36`) |
| **Licence** | **Apache-2.0** — `npm view manifold-3d license` |
| **Currency** | registry **3.5.1**, last publish **2026-06-04**; **82,466 downloads/week** |
| **Reachable?** | **PARTIALLY** — engine wired end-to-end, but the wall consumer sits behind a default-OFF flag. See the trap in §4.2. |

The lazy load is the kernel's single sanctioned impurity, and the header says so (`KernelCSG.ts:18-21`):

```
// LAYER — L4 PURE.  No THREE, no DOM, no Node primitives.  The
// dynamic `import('manifold-3d')` is the kernel's *only* permitted
// non-pure boundary (the WASM module brings its own runtime).
```

**Manifold's production adoption is not a README claim.** Its published user list includes **Blender,
OpenSCAD (as the CSG backend replacing CGAL), Godot Engine, Babylon.js, BRL-CAD, IFC.js, trimesh,
bitbybit.dev and Arcol** (an AEC SaaS). At 82k downloads/week under Apache-2.0 this is the strongest
single technology position PRYZM currently holds. **Nothing in this lane recommends replacing it.**

### 1.3 `web-ifc` + `@thatopen/*` — what the EXISTING dependency actually gives us

The lane brief asks this specifically, because the answer decides whether a new kernel is needed at all.

| | |
|---|---|
| **`web-ifc`** | `^0.0.77` — root `package.json:290`, plus `packages/file-format`, `plugins/ifc-import`, `plugins/ifc-export`. Licence **MPL-2.0**. Registry 0.0.77, publish **2026-03-06**, **194,172 downloads/week**. |
| **`@thatopen/components` · `-front` · `fragments` · `ui` · `ui-obc`** | `^3.4.x`, root `package.json:242-246`. Licence **MIT**. components 3.4.8 / fragments 3.4.7, publish **2026-07-26**. |
| **How PRYZM uses them** | IFC **import** (`packages/file-format/src/import/ifc/IfcImporter.ts`, `IfcGeometryRenderer.ts`); IFC **export** (`packages/file-format/src/export/ifc/` — `IfcModelBuilder`, `IfcGeometryWriter`, `IfcSemanticWriter`, `IfcPropertyWriter`, `IfcSpatialStructure`, `IfcFileWriter`, `auditIfc`); a full **IFC4X3** exporter in `plugins/ifc-export/src/exporters/IFC4X3Exporter.ts`; and OBC for **viewer / camera / drawing** infrastructure (`core-app-model/src/BimWorld.ts`, `MultiViewCameraManager`, `HiddenLineRemoval`, `apps/editor/.../EdgeProjectorService.ts`). |

⭐ **The finding a reuse decision turns on.** `@thatopen/fragments` v3.4 ships a **`GeometryEngine`**
class exposing `getBooleanOperation()` (DIFFERENCE / UNION / INTERSECTION) plus high-level extrusion,
sweep, wall and profile builders over web-ifc's WASM geometry processor. **PRYZM does not use it.** A
scoped grep for `GeometryEngine|getBooleanOperation|@thatopen/fragments` across
`packages/ plugins/ apps/ src/` returns **no call site** — only *type* imports of `FRAGS` at
`packages/core-app-model/src/views/IFCProjectionStore.ts:17` and
`apps/editor/src/engine/views/EdgeProjectorService.ts:39`, plus `userData`-sealing workarounds.

**Verdict on the existing IFC dependency as a geometry source:** it gives **IFC parsing, IFC
authoring, and tessellation of IFC representation items**. It does **NOT** give an authoring kernel.
Its geometry is produced *from* IFC entities, its output is meshes, and its boolean exists to evaluate
`IfcBooleanClippingResult`. It is the right tool for spec §29–33 (interoperability projection) and the
**wrong** tool for §17–20 (canonical geometry) — which is exactly how PRYZM has it scoped today.
**Correctly scoped. Do not promote it to a kernel.** *(This also satisfies spec §31: the internal model
is not `IfcWindow`; IFC stays a projection.)*

### 1.4 `rhino3dm` — openNURBS is already in the tree, but READ-ONLY

| | |
|---|---|
| **Declared** | root `package.json:279` `"rhino3dm": "^8.17.0"`; `plugins/rhino-import/package.json:21` |
| **Licence** | **MIT**. Registry **8.32.2**, publish **2026-08-25** — actively maintained by McNeel. |
| **Authority files** | `plugins/rhino-import/src/reader.ts` (WASM, `await import('rhino3dm')`), `packages/renderer-three/src/addons/Rhino3dmLoader.ts`, `packages/file-format/src/import/rhino/RhinoImporter.ts` |
| **Reachable?** | **YES** — wired via `packages/runtime-composer/src/ImportExportSlots.ts:121-129` (`readRhino3dm(buffer)`), lazily so the ~7 MB WASM stays off first paint |
| **Capability actually used** | **Import only.** `Rhino3dmLoader` converts .3dm → THREE meshes; `reader.ts` normalises curves/meshes/layers/points into a `RhinoSceneDocument`. |

**This matters more than it looks.** `rhino3dm` *is* the openNURBS evaluator: it can represent and
evaluate NURBS curves and surfaces, it is **MIT**, PRYZM already ships it, already loads it in a
browser, and already pays its bundle cost on an import path. Spec §4.4 asks for *"NURBS where
supported"*. **If NURBS authoring is ever required, the cheapest honest path is widening existing
rhino3dm usage, not adopting a second kernel for it.** Recorded as a reuse opportunity in §2.4 — it is
**not** a recommendation to do so now: openNURBS is a geometry *library*, not a modelling kernel (no
booleans, no fillets, no topological solid modelling).

### 1.5 Constraint solving — `@pryzm/constraint-solver`. Honest, mock-only, CONTRACT-LOCKED.

| | |
|---|---|
| **Authority files** | `packages/constraint-solver/src/engine.ts` (`MockSolver`, `SolverPorter`, `loadSolver`); `packages/constraint-solver/src/PlanegcsAdapter.ts` |
| **Contract** | **`C74-CONSTRAINT-HONESTY`** — the contract exists *because of* this package |
| **Gates** | `tools/ga-gate/check-constraint-honesty.ts` · `check-solver-is-real.ts` · `check-no-hidden-mock.ts` |
| **Reachable?** | The **advisory** `ConstraintEngine` is wired (`apps/editor/src/engine/initDataPlatform.ts:50`; `StoreEventBus` with 800 ms debounce + load-quiet window; non-blocking by construction). The **solver** is `MockSolver` — five constraint kinds, projection arithmetic, **no simultaneous solve**. |

Its own `package.json` description is the most honest sentence in the repo:

> *"Ships a deterministic `MockSolver` (five first constraint kinds: distance-pp, parallel,
> perpendicular, coincident-pp, fixed) and an HONESTLY-LABELLED planegcs scaffold (`PlanegcsAdapter`,
> kind='mock', intendedEngine='planegcs'). **No real planegcs binding exists in this repo, and none is
> authorised until C74 §4.2(c) is answered for a named constraint family (C74 §4.5).**"*

`PlanegcsAdapter.ts` is worth reading in full before anyone proposes a solver. It carries `kind` =
what **actually executes** (`'mock'`), a separate `intendedEngine = 'planegcs'` for what it is **for**,
and a non-suppressible first-call `console.warn`. Its header records why the injection seam was
**deleted** rather than kept (C74 §3.5, 2026-08-14) and names its own retirement test.

**Live gate reading, measured in this lane (2026-09-01, foreground):**

```
npx tsx tools/ga-gate/check-solver-is-real.ts   → RC=0
  negative control (planted tree): 3 finding(s), arms fired = [R1, R2, R3]
  positive control (clean tree):   0 finding(s) — must be 0
  manifests read: 179 · source files scanned: 5151 · adapter-named classes declaring a kind: 2
    honest stand-in : MockSolver kind='mock'  packages/constraint-solver/src/engine.ts:94
  → [0] CLEAN — check-solver-is-real: 0 findings, hard-0, no baseline.
```

⭐ **C74's own front-matter is STALE — logged as a trap in §4.1.** It reads *"**Gate**:
`check-constraint-honesty.ts`, `check-solver-is-real.ts`, `check-no-hidden-mock.ts` — **all three
UNBUILT at stamp time** (§6)."* **All three now exist in `tools/ga-gate/`, and `check-solver-is-real`
runs green with executed positive AND negative controls.** Do not cite "UNBUILT".

### 1.6 Renderer / GPU — already decided, already shipped

| | |
|---|---|
| **THREE** | `three@^0.183.2`, pinned by root `pnpm.overrides` (`package.json:83,89`). Registry latest **0.185.1** (2026-07-01) — PRYZM is **two minors behind, deliberately pinned**. **MIT**. |
| **P2 — single THREE owner** | `packages/renderer-three/` only. `tools/ga-gate/check-three-imports.ts` **hard-fails at the invariant, 0 importers outside** (CLAUDE.md §P2). |
| **WebGPU** | **REAL and present** — `packages/renderer-three/src/adapters/WebGPURendererAdapter.ts` beside `WebGLRendererAdapter.ts`, selected through `packages/renderer/src/Renderer.ts` / `RenderPipelineManager.ts`. `@webgpu/types@^0.1.69` is a root devDependency. |
| **Related** | `three-mesh-bvh@^0.9.9` (picking · snapping · spatial-index), `three-gpu-pathtracer@^0.0.20` (Presentation tier), `cesium@^1.140` (Massing/context tier), `camera-controls@^3.1.2` |

**Standing memory that binds any WebGPU recommendation:** `[webgpu-heavy-scene-crash-and-instancing]`
(device loss fixed; instancing defeated by per-element unique materials) and
`[render-reconstruction-boundary-gpu-reset]` (*"WebGL = demo backend"*). **WebGPU is not a candidate to
evaluate — it is a shipped adapter with known, logged failure modes.**

### 1.7 Semantic standards — bSDD present-but-dark; IDS and OpenUSD absent

| Standard | State | Evidence |
|---|---|---|
| **IFC** | **SHIPPED, mature** — import + IFC4X3 export + audit (§1.3) | `packages/file-format/src/export/ifc/*`, `plugins/ifc-export/src/exporters/IFC4X3Exporter.ts` |
| **bSDD** | ⚠ **AUTHORED BUT UNREACHABLE.** A complete typed client exists — `BsddPropertyLookup`, `getBsddLookup()`, per-property cache, default base `https://api.bsdd.buildingsmart.org`, citing *"C07 §5, C05 §3 (Pset lookup from bSDD on selection)"*. Exported from the SDK barrel; **imported by nothing.** | `packages/plugin-sdk/src/bsdd.ts`; barrel `packages/plugin-sdk/src/index.ts:697-702`. Failed search quoted in §3.4. |
| **IDS** | **ABSENT.** Named only in a *legacy* roadmap as unbuilt: `SPEC-43 … (packages/ids-engine/) S99 D1`, and *"IDS … read + validate + author — **not shipped**"*. `ls packages/ids-engine` → `No such file or directory`. | `docs/03-execution/plans/legacy/plan-detail/05-POST-GA-ROADMAP.md:59,63,86,295` |
| **OpenUSD** | **ABSENT — zero hits** across `packages/ plugins/ apps/ docs/01-strategy/ docs/02-decisions/contracts/`. Failed search quoted in §3.4. | — |

### 1.8 ⭐⭐ THE BIGGEST FIND — the Universal Component Editor is NOT greenfield

I went looking for a geometry kernel and found **an entire Family/Component authoring stack**, most of
it real, most of it tested, and the user-facing half **unreachable**. This is outside lane H's nominal
scope; it is reported here because **it changes the technology recommendation**, and because filing a
"gap" that already exists is the worst outcome this lane could produce.

| Package / app | What it is | Reachable? |
|---|---|---|
| **`@pryzm/family-runtime`** `packages/family-runtime/` | ⭐ **Spec §11's typed expression engine.** `tokenizer.ts` → `parser.ts` → `evaluator.ts` → `functions.ts` (`BUILTIN_FUNCTIONS`) → `unit-coercion.ts` (`toCanonical`, `kindOf`, **`UnitMismatchError`**, `CanonicalKind`), plus `resolution/resolveParameter.ts` and `ResolverDiagnostic`. **Pure-Node, ZERO dependencies**, 6 test files. Its own description: *"the single source of truth for the family expression DSL, the parameter resolver, and the unit-coercion table … so the editor (browser), the bake-worker (Node), and the AI worker (Node) all import the SAME runtime."* | **YES** — consumed by family-instance, family-loader, and declared at root `package.json:138` |
| **`@pryzm/family-instance`** | ⭐ **Spec §12's definition→type→instance bake.** `bakeFamilyInstance({ family, typeId, instanceOverrides })` → resolves parameters → `profileToPolygon` → dispatches **`@pryzm/geometry-kernel` producers** → one `BufferGeometryDescriptor` per solid. **This is the spec §17–20 pipeline, already written.** | **YES, server-side** — `apps/bake-worker/src/jobs/RebakeFamilyInstanceJob.ts:23-24` |
| **`@pryzm/family-loader`** | Opens a **`.pryzm-family` ZIP** via `@pryzm/file-format`, validates manifest + document, runs a resolver pre-flight, caches by `(familyId, schemaHash)` | **YES** — bake-worker + `apps/bench/src/benches/family-load.bench.ts` |
| **`packages/schemas/src/family-*`** | **Seven** schema families: `family-definition`, `family-geometry`, `family-parametric`, `family-pipeline`, `family-registry`, `family-request`, `family-schemas` | **YES** (L0) |
| **`packages/file-format/src/family-migrations/`** | ⭐ **Spec §37 versioning** — document migrations including `ops/introduce-expression.ts` | **YES** |
| **`apps/component-editor`** (`@pryzm/component-editor`) | ⭐ **The standalone SPA.** Its own description: *"Family Creator standalone SPA. The Revit-Family-Editor analogue: 2D parametric profile sketcher → constraint solver → 3D extrude/sweep/loft/revolve → parameter table → typed authoring of `.pryzm-family` artefacts."* Present on disk: `sketch/buildConstraintSet.ts`, `commands/constraint/{addCoincident,addDistance,addFixed,addParallel,addPerpendicular}.ts`, `commands/solid/` (add/remove/setLodBitmask, with undo + per-verb OTel spans), `commands/referencePlane/`, `ai/{aiHostBridge,approvalQueue,toolRegistry}.ts`, `marketplace/{publishFlow,signing}.ts`, `a11y/`, `app/{AppShell,commandBus,familyEditorRuntime,deepLink,otel}.ts` | ⛔ **NO — see trap §4.9** |

**Why this belongs in a technology lane.** The spec asks *"which kernel and which solver?"*. The
answer is now much more specific: **PRYZM already chose.** `apps/component-editor`'s own sprint
roadmap records the plan verbatim — *"S52 (scaffold + **real planegcs solver** + extrude) → S53
(sketch tools + sweep/loft/revolve) → …"* — and it declares `@pryzm/constraint-solver`,
`@pryzm/geometry-kernel` and `@pryzm/file-format` as its only three dependencies. **The technology
selection this lane was asked to make was made in S52 and never executed**, and the one component
that never landed — the real PlaneGCS binding — is now **forbidden by C74** (§1.5, §5.3).

---

## 2 · WHAT IS REUSABLE — and how

### 2.1 The adapter boundary. Reuse it; do not rebuild it.

Spec §18 (*"the canonical model must NOT couple to one kernel … the kernel is an EVALUATOR"*) is
**already implemented** as `BufferGeometryDescriptor` + the `pryzm/no-three-in-kernel` lint rule
(`packages/geometry-kernel/src/index.ts:1-6`). Any exact-geometry evaluator adopted later plugs in
**behind this same seam**, emitting a descriptor after tessellation. Concretely: a second producer
family `producers/exact/*.ts` returning the same `BufferGeometryDescriptor`, with the exact B-Rep
handle held as a cached side-artefact keyed by the §73 cache identity — **no new layer, no new
boundary, no change to any consumer.**

### 2.2 `manifold-3d` — reuse as the MESH evaluator, permanently.

Even if OCCT is adopted for exact operations, Manifold remains the right engine for high-volume mesh
booleans (wall openings, site/context subtraction, slab voids). It is Apache-2.0 (**GREEN**), faster
than OCCT for mesh CSG, and already integrated with `KernelCSG.create()` / `produceBoolean`.
**A two-evaluator kernel is the recommendation, not a transition to a single new one.**

### 2.3 The six existing producers are the §57 Solid toolgroup's first delivery.

`produceExtrude`, `produceRevolve`, `produceSweep`, `produceLoft`, `produceBoolean`,
`produceWallWithVoids` — all pure, all frozen-signature, all snapshot-tested, all runnable in a Web
Worker (they are `L4 PURE`, which is exactly what spec §71 asks of a worker-offloadable geometry
stage). **The Universal Component Editor's Solid tools should call these, not new code.**

### 2.4 `rhino3dm` — the latent NURBS asset.

Already MIT, already WASM, already lazily loaded in the browser. If spec §4.4's *"NURBS where
supported"* is ever activated, widen this rather than adopt a kernel for it. **Caveat: openNURBS
evaluates and represents; it does not model.** It cannot deliver §57's fillet/chamfer/shell.

### 2.5 `web-ifc` / `@thatopen` — reuse for the §29–33 projection only.

The IFC4X3 exporter, the semantic/property/quantity writers and the Pset writers are the direct
implementation of spec §70's *"PRYZM Window → semantic mapping → IFC window"* test. **Reuse them as
the mapping target.** Do not route canonical geometry through them.

### 2.6 `C73` tolerance policy — reuse it as the kernel-adoption acceptance criterion.

`packages/geometry-kernel/src/tolerance.ts` exports the declared epsilons (`EPSILON_ZERO` = 1e-9,
`COINCIDENT_M`, `PARALLEL_RAD`, `RECOMPUTE_IDENTITY_M`) under C73 §2.1, gated by
`tools/ga-gate/check-epsilon-policy.ts`. **Any adopted kernel must be driven from these values, not
from its own defaults** — otherwise the repo acquires a second definition of "the same place", which
is the exact defect C73 was written to stop. Note the trap in §4.3: that gate is currently RED.

### 2.7 `PlanegcsAdapter` — reuse the SHAPE, not the engine.

The `SolverPorter` port + honest-`kind` pattern is the correct integration shape for *any* future
solver. If C74 §4.2(c) is ever answered, the binding replaces one line in the constructor. The port
already exists; **no new abstraction is needed for constraints — only an authorisation.**

---

## 3 · WHAT IS GENUINELY MISSING

### 3.1 EXACT geometry (B-Rep). The real gap, stated precisely.

PRYZM's canonical geometric artefact is `BufferGeometryDescriptor` — indexed triangle soup. Spec §19 is
explicit in the other direction:

> *"Prefer exact geometry as canonical-derived (`profile → curve → surface → B-Rep solid → render
> mesh`); **the mesh is a projection/cache, never authoritative.**"*

Today **the mesh IS authoritative.** The consequences are concrete and bounded — they are not "PRYZM
lacks a kernel":

| §57 operation | Mesh-feasible? | Status |
|---|---|---|
| extrude, revolve, sweep, loft | Yes | **SHIPPED** (§1.1) |
| boolean ∪ − ∩ | Yes | **SHIPPED** via manifold-3d |
| offset (2D) | Yes | **SHIPPED** — §W2A-ONE-OFFSET |
| pattern / array | Yes (transform-level) | **MISSING**, but no kernel needed |
| **shell / thicken** | Poorly — mesh offset self-intersects | **MISSING — wants B-Rep** |
| **fillet / chamfer** | Poorly — mesh filleting is approximate and fragile | **MISSING — wants B-Rep** |
| **exact curves (arcs, NURBS) as canonical** | No — tessellated at authoring time | **MISSING — wants B-Rep** |

**So the exact-kernel case rests on three things: fillet, chamfer, shell/thicken — plus exact curve
persistence.** That is a real case, and it is a *narrow* one. It does not justify replacing the kernel;
it justifies a **staged second evaluator** (§5.4).

### 3.2 A geometric constraint SOLVER. Missing, deliberately — and now measurable.

`MockSolver` performs sequential projection, not simultaneous solving. Spec §14 wants coincident,
tangent, symmetric, equal, concentric, distance, angle, radius, diameter as *persistent semantic
objects*, and §68 wants them **preserved across parameter changes** — the property that actually
requires a solver. **C74 §4.1/§4.5 forbids building one until §4.2(c) is answered.**

⭐ **The gap now has a number.** The persisted vocabulary and the executing vocabulary disagree:

| | Kinds | Source |
|---|---|---|
| **Persisted** in `.pryzm-family` | **12** — `coincident, parallel, perpendicular, horizontal, vertical, tangent, distance, radius, angle, diameter, equalLength, distancePointLine` | `packages/file-format/src/family-schema.ts:142-158` (`ProfileConstraintSchema`) |
| **Executed** by `MockSolver` | **5** — `distance-pp, parallel, perpendicular, coincident-pp, fixed` | `packages/constraint-solver/package.json` description; `engine.ts` |

**Seven persisted constraint kinds have no implementation at all** — `horizontal`, `vertical`,
`tangent`, `radius`, `angle`, `diameter`, `equalLength`, `distancePointLine`. `tangent`, `radius`,
`diameter` and `equalLength` in particular cannot be satisfied by sequential projection: they are the
textbook simultaneous cases. **A document can therefore be authored and saved carrying constraints
nothing can evaluate.** This is not a gap to close by adoption; it is a gap to close by **writing the
C74 §4.2 answer first** — and the evidence for it is now concrete rather than categorical. §5.3.

### 3.3 ⛔ A typed EXPRESSION engine (spec §11) — **NOT MISSING. I nearly filed it as a gap.**

**This lane's own near-miss, recorded because the method matters more than the result.** I had written
"no typed expression engine exists" from a first-pass grep. A second, differently-worded scoped grep
(`unitMismatch|circularDependenc|ExpressionEngine|FormulaEvaluator`) landed on
`packages/family-runtime/src/expression/unit-coercion.ts:21` — and behind it, a **complete, tested,
dependency-free expression DSL**. See §1.8. **Spec §11 is substantially already built.**

The trap for the next reader is that it is **not** named "expression-engine" and **not** in
`packages/schemas` or `packages/constraint-solver` — the two places one would look. It is inside a
package named for *families*. `resolveExpr` in `packages/constraint-solver/src/engine.ts` is a
scalar-or-parameter reference resolver and is **not** it; searching there and stopping produces
exactly the false gap I nearly filed.

### 3.4 Missing standards — the FAILED SEARCHES, quoted verbatim

**(a) OpenUSD — zero hits.**
```
$ grep -rniE "openusd|usdz|usda|UsdStage" packages/ plugins/ apps/ \
      docs/01-strategy/ docs/02-decisions/contracts/ --include='*.ts' --include='*.md'
packages/geometry-furniture/__tests__/landscapeCatalogue.test.ts:127:  ...not.toMatch(/zone|hardin|USDA|complian|permitted/i);
docs/01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md:292: ToubkalCAD, OpenZCAD, Three.js, WebGPU, OpenUSD concepts, IFC, bSDD, IDS — each with purpose,
```
The only two hits are the substring `USDA` in a landscape test and **the spec sentence that asked the
question**. OpenUSD has no presence in PRYZM.

**(b) buildingSMART IDS — no implementation.**
```
$ ls packages/ids-engine
ls: cannot access 'packages/ids-engine': No such file or directory
```
The only references are in a *legacy* roadmap marking it unbuilt
(`docs/03-execution/plans/legacy/plan-detail/05-POST-GA-ROADMAP.md:86`):
`| IDS (Information Delivery Specification) read + validate + author | not shipped | Phase 6 §3 |`

**(c) bSDD client has no consumers.**
```
$ grep -rn "getBsddLookup\|BsddPropertyLookup" packages/ plugins/ apps/ src/ server/ \
    | grep -v node_modules | grep -v "packages/plugin-sdk/src/bsdd.ts"
packages/plugin-sdk/src/index.ts:697:  BsddPropertyLookup,
packages/plugin-sdk/src/index.ts:698:  getBsddLookup,
```
**Two hits, both in the barrel that re-exports it. Zero call sites.** Authored, exported, dark.

**(d) `planegcs` is not a dependency of anything** — re-verified 2026-09-01, matching C74 §0:
```
$ grep -rn '"planegcs"\|"@salusoft89/planegcs"' --include=package.json . | grep -v node_modules
EXIT=1   (no matches)
```

**(e) No OCCT-family package is declared anywhere:**
```
$ grep -rniE '"(opencascade[a-z.-]*|occt[a-z-]*|replicad[a-z-]*|brepjs)"' --include=package.json . \
    | grep -v node_modules
EXIT=1   (no matches)
```

**(f) Two spec-named candidates do not exist as retrievable projects.**
`ToubkalCAD` and `OpenZCAD` both return `E404 Not Found` from the npm registry, and two web searches
(`"ToubkalCAD open source CAD kernel WebAssembly"`, `"OpenZCAD" OR "Toubkal CAD" geometry kernel
github`) surfaced **no matching project**. The nearest real things are `ZenCAD` (a Python/OCCT
scripting CAD on PyPI — **not browser-viable**) and `TauCad` (an OCCT→WASM port behind Archiyou).
**Treat both spec names as unverifiable and do not carry them forward.** Recorded rather than silently
dropped, per §75.

---

## 4 · TRAPS — what a newcomer will trip over

### 4.1 ⛔ C74's front-matter says its three gates are UNBUILT. All three now exist.

`docs/02-decisions/contracts/C74-CONSTRAINT-HONESTY.md:7` reads *"**Gate**: … — all three UNBUILT at
stamp time (§6)."* Measured 2026-09-01: `check-constraint-honesty.ts`, `check-solver-is-real.ts` and
`check-no-hidden-mock.ts` are all present in `tools/ga-gate/`, and `check-solver-is-real` exits **0**
with executed controls. **This is the same stale-front-matter defect C73 §7 documents about itself
(*"this line was written in the present tense and rotted"*). Run the gate; do not quote the contract.**

### 4.2 ⚠ The CSG boolean is wired but DEFAULT-OFF. "manifold works" ≠ "walls use it".

The chain `singleVolumeWallProducer → produceWallWithVoids → produceBoolean → KernelCSG → manifold-3d`
is complete and injected at boot, **but gated**:

- `apps/editor/src/engine/initTools.ts:929` — *"Inert until `window.__wallSingleVolume === true` flips it on (default-off)."*
- `packages/geometry-wall/src/WallFragmentBuilder.ts:3202` — *"testing ONLY by setting `window.__wallSingleVolume = true`. Do NOT flip the …"*
- `packages/geometry-wall/src/WallFragmentBuilder.ts:3236` — the runtime check.

And `packages/geometry-kernel/src/producers/wallVoids.ts:9-14` states the deferral in its own words:

> *"It is **intentionally NOT wired** into WallFragmentBuilder / LayeredWallOpeningBuilder — that is
> phase 3, which routes the booled descriptor on the async path behind a feature flag with the
> segmented mesh as a fallback."*

**This is the repo's standing `[committed-is-not-reachable]` lesson in live form.** Any plan that
assumes single-volume boolean walls in production is wrong today. *(Related: memory
`[wall-opening-seam-two-paths]` — plain→CSG single-volume vs LAYERED→grid.)*

### 4.3 ⚠ `check-epsilon-policy` is RED. Adopting a kernel with its own tolerances makes it worse.

`C73` §7 front-matter, corrected 2026-08-18: **`check-epsilon-policy` RATCHET EXCEEDED 322/318**,
`check-predicate-canonical` **139/138**, `check-deterministic-regeneration` **STALE LEDGER**. Per R7
none is absorbable via `gate-debt.json`. **A new kernel arrives with its own default tolerances and its
own predicates; wiring it without routing through `packages/geometry-kernel/src/tolerance.ts` adds
directly to a ratchet that is already breached.** This is an adoption *precondition*, not a footnote.

### 4.4 ⚠ `opencascade.js` looks alive on GitHub and is effectively dormant on npm.

Its releases page shows versions dated "September 24–27" with no year, which reads as recent. The
registry disagrees: `npm view opencascade.js time.modified` → **2023-03-23**. **Three and a half years
without a publish**, while still serving 41k downloads/week (people are pinned to it). The v1.1.0
release is itself flagged *"unusable due to an error during the initialization phase."* **Do not adopt
`opencascade.js` directly. If OCCT is wanted, take it through `replicad-opencascadejs` (§5.2).**

### 4.5 ⚠ Licence fields on npm are claims, not evidence — OCCT's especially.

`npm view occt-wasm license` returns **`MIT OR Apache-2.0`**. That is true only of the *build tooling
and TypeScript wrapper*. The project's own README is honest about the rest:

> *"Build tooling (xtask, scripts, TypeScript wrapper): MIT OR Apache-2.0 — **Compiled WASM output:
> LGPL-2.1-only (inherits from OCCT)**."*

**Anyone reading the npm metadata alone concludes "MIT" and is wrong.** OCCT is **LGPL-2.1-only plus
`OCCT-exception-1.0`** (SPDX), and the exception covers *header files* — *"you may distribute object
code incorporating material from header files … provided that you give prominent notice"* — not the
compiled library. See §5.5 for the compliance recipe.

### 4.6 ⛔ **THE HIGHEST-LEVERAGE TRAP — `sweep`/`loft`/`revolve` are blocked by a solver claim that is almost certainly FALSE.**

`packages/family-instance/src/bakeFamilyInstance.ts:15-21` refuses three of the four solid kinds:

> *"`sweep` / `loft` / `revolve` — return a structured `unsupported-feature` error per solid … Lighting
> up these producers **requires the constraint solver (S57)** so that path and section profiles can be
> evaluated; the BIM core team is scheduled to land that next sprint."*

and emits (`:265`):

```
`[bakeFamilyInstance] solid kind '${solid.kind}' requires the S57 constraint solver
 to evaluate path/section profiles; v1 supports 'extrude' only.`
```

`profileToPolygon.ts:8-15` repeats it, with error code `profile-needs-solver`:

> *"Lines / arcs / circles / splines and full constraint solving are deferred to S57 once the
> AssumeFlat solver lands … S57 will replace this function with a call into
> `@pryzm/constraint-solver`'s evaluator."*

**Three independent facts contradict this being a solver problem:**

1. ⭐ **The kernel producers already exist and are complete** — `produceSweep` (307 lines, Bishop
   parallel-transport frames), `produceLoft` (256), `produceRevolve` (236), all frozen-signature and
   snapshot-tested (§1.1). Nothing is waiting to be written.
2. ⭐ **Arc tessellation already exists in the kernel** —
   `packages/geometry-kernel/src/producers/_internal/WallPath.ts:37` exports `arcToPoints(start,
   control, end, segments)`, used by `buildCurvedLayer.ts:31`; and `resolveBoundarySegments`
   (`packages/geometry-slab/src/boundaryArc.ts:179`) recovers arcs from rings for
   `CreateWallsFromSlabCommand`. **Turning an arc/line/circle entity into a polyline is a closed-form
   evaluation that this repo already performs in two places.**
3. ⛔ **C74 §1.2 forbids the reasoning the comment uses:** *"A constraint may not be described as
   needing SOLVING because it is hard, because it is numeric, or because it involves several elements.
   SOLVING is reserved for **simultaneous** systems with **no closed form**."* Evaluating a
   fully-determined profile of ordered entities is not a simultaneous system. **C74 §5.f names this
   exact anti-pattern — "The solver-shaped roadmap: SOLVING assumed from the product category rather
   than proven per family."**

**And the milestone is stale in the way C74 §5.c ("the undated scaffold") predicts.** "S57" has
passed; C74 (2026-08-12) records the same shape for `PlanegcsAdapter` — *"two milestones, both of
which passed without the binding."* The `apps/component-editor` roadmap places versioning at S57 and
the *solver* at **S52**, so the two files do not even agree on which sprint owed the solver.

**⭐ I then read the schema, which SPLITS the claim in two — this is the precise version.**
`packages/file-format/src/family-schema.ts:136-170` (**not** `packages/schemas`, where I first looked
and wrongly found nothing):

```ts
export const ProfileEntitySchema = z.object({
  id: ULID,
  kind: z.enum(['point', 'line', 'arc', 'circle', 'spline']),
  data: z.record(...),
});
export const ProfileConstraintSchema = z.object({
  id: ULID,
  kind: z.enum(['coincident','parallel','perpendicular','horizontal','vertical','tangent',
                'distance','radius','angle','diameter','equalLength','distancePointLine']),
  entityIds: z.array(ULID), parameterRef: ..., value: ...,
});
export const ProfileSchema = z.object({ ..., entities: [...], constraints: [...] });
```

**So the file format already persists 12 constraint kinds and 5 entity kinds.** The blocker is
therefore **two** problems that the comment fuses into one:

| | Problem | Needs a solver? | Status |
|---|---|---|---|
| **A** | A **fully-determined** profile — explicit coordinates, `line`/`arc`/`circle` entities, no under-determining constraints — must be flattened to a polyline | ⛔ **NO.** Closed-form tessellation; `arcToPoints` already does it | **`profileToPolygon` refuses it anyway** — it throws `profile-needs-solver` on any non-`point` entity |
| **B** | An **under-determined** sketch whose shape is implied by simultaneous constraints (`tangent` + `radius` + `equalLength` …) | ✅ **YES.** Genuinely simultaneous, no closed form | Real gap. **This is the §4.2(c) candidate** — §5.3 |

> ⭐ **The actionable claim, offered as a hypothesis to TEST, not a verdict.** **Problem A is the one
> blocking sweep/loft/revolve today, and it is not a solver problem.** Extending `profileToPolygon`
> to flatten `line`/`arc`/`circle` through the existing `arcToPoints`, and routing `solid.kind` to
> the already-written `produceSweep`/`produceLoft`/`produceRevolve`, plausibly lights up three of
> four §57 Solid tools **with no new dependency, no WASM, and no C74 authorisation**. **Verify by
> execution before acting** — read `SolidFeatureSchema` for what `sweep`/`loft`/`revolve` actually
> require as path/section inputs, and confirm a fully-determined profile is expressible without any
> `constraints[]` entry.

⛔ **And the honest correction to my own first pass:** I initially grepped
`packages/schemas/src/family-geometry/` and `family-definition/` for `'arc'|'line'|'circle'|'spline'`,
got **no hits**, and nearly concluded the schema was point-only. **It is not** — the family document
schema lives in `packages/file-format/src/family-schema.ts`. Two packages carry "family" schemas and
they are not the same thing. Same defect shape as §3.3.

### 4.7 ⛔ `apps/component-editor` is AUTHORED AND UNREACHABLE. The editor shows a placeholder.

The main editor routes "Component" / "Generic Component" to a modal that says *"under construction"*.
`apps/editor/src/familyCreatorPlaceholder.ts` is a model C74 §3.4 scaffold declaration and says so:

> *"**WHAT IS FAKE, stated plainly** — this module is named for the Family Creator and creates no
> family. It is a DOM modal that says "under construction" and prints a path to a plan document.
> Clicking "Component" / "Generic Component" in the create rail reaches a dialog, not an editor:
> nothing is authored, nothing is persisted, no `.pryzm-family` artefact exists afterwards."*
>
> *"**EXIT CONDITION** — `apps/component-editor` reaches standalone deploy and the create rail hands
> off to it (S58) … ⚠ **MILESTONE HONESTY (C74 §4.2(c))**: the "S58" above is the PLAN's number,
> restated, not a fresh promise. The legacy `src/component-editor/` prototype was removed 2026-04-28
> and no replacement has shipped since; **treat S58 as UNSCHEDULED** until `apps/component-editor` has
> a deploy target."*

⚠ **Two files share this name and have different callers** — `apps/editor/src/familyCreatorPlaceholder.ts`
(the real modal, reached from `ui/tools-panel/panels/CreateRailPanel.ts:1105`) and
`apps/editor/src/ui/familyCreatorPlaceholder.ts` (a smaller `console.log` stub reached from
`ui/layout/CreatePanelLayout.ts:350`). A third copy was deleted 2026-08-15. **Grep returns all of
them; only one is the placeholder people mean.**

**Consequence for this lane:** the component editor's user-facing half is **unwired, not unwritten**.
Read `[authored-but-unwired-is-the-bottleneck]` and `[committed-is-not-reachable]` before estimating
anything here. The deploy target — not the kernel and not the solver — is the binding constraint on
the SPA.

### 4.8 ⚠ P2/P3 and the layer gate constrain where any new dependency may live.

- **P2** — `import * as THREE` only in `packages/renderer-three/`; `check-three-imports.ts` hard-fails.
- **`pryzm/no-three-in-kernel`** — `three`, `@thatopen/*`, `web-ifc*` cannot enter `geometry-kernel`.
- **Layer authority** is `tools/ga-gate/check-layer-boundaries.ts`, **not** `eslint-plugin-boundaries`
  (CLAUDE.md L-809: the eslint resolver silently checked nothing for `@pryzm/*` specifiers).

A geometry kernel therefore belongs **inside `geometry-kernel` as a lazily-imported WASM module** —
the pattern `KernelCSG` already establishes — and **nowhere else**.

### 4.9 ⚠ `three` is pinned two minors behind by a deliberate root override.

`pnpm.overrides.three = "^0.183.2"` (root `package.json:89`); registry latest is **0.185.1**. Anything
adopted must work against **r183**, and no candidate evaluation should assume a THREE upgrade.

### 4.10 ⚠ `manifold-3d` is an OPTIONAL peer of geometry-kernel.

`packages/geometry-kernel/package.json:32,36` declares it `"manifold-3d": "*"` with
`"manifold-3d": { "optional": true }`. It resolves in the app because the **root** manifest depends on
it. A consumer that installs `@pryzm/geometry-kernel` standalone gets a kernel whose `produceBoolean`
throws at first call. Relevant the moment the kernel is published or split.

---

## 5 · THE CANDIDATE TABLE, AND THE RECOMMENDATION

### 5.1 Verification method

Every external row was checked for: the actual repository, the actual licence text (not the npm
`license` field alone), **`npm view <pkg> time.created` / `time.modified`** for real first-publish and
last-publish dates, `api.npmjs.org` **weekly download counts** as adoption evidence, and whether a
**prebuilt WASM artefact** is published. Measured **2026-08-29 week / 2026-09-01**.

### 5.2 The table

| Technology | Purpose | Licence | Maturity (created · last publish · dl/wk) | Browser / WASM | Geometry capability | Constraint capability | Performance | Risks | Fit with PRYZM | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|
| **`manifold-3d`** *(ALREADY IN TREE)* | Mesh CSG solid modelling | **Apache-2.0** — GREEN | 2022-10-23 · **2026-06-04** (v3.5.1) · **82,466** | Yes, prebuilt WASM; lazy-loaded today | Booleans ∪ − ∩, guaranteed-manifold output; **no B-Rep, no fillet** | None | Excellent — the reason OpenSCAD replaced CGAL with it | Mesh-only; output is triangle soup | **Already the kernel's boolean engine** (`KernelCSG.ts`) | ⭐ **KEEP. Make it the permanent MESH evaluator.** Flip the §4.2 flag on its own merits. |
| **OCCT via `replicad` + `replicad-opencascadejs`** | Exact B-Rep kernel, browser-packaged | `replicad` **MIT**; WASM build **LGPL-2.1-only + OCCT-exception-1.0** — **YELLOW** | replicad 2021-11-01 · **2026-08-21** (v1.0.1) · **8,884**; occt build published **2026-08-14** | **Yes** — purpose-built browser OCCT distribution; the only OCCT path that is both current and pre-packaged | **Full exact B-Rep**: booleans, **fillet, chamfer, shell, offset, draft**, sweep/loft/pipe, STEP/BREP I/O, exact curves & surfaces | None (geometry only) | Heavier than Manifold; WASM blob is MBs; must be worker-offloaded | LGPL compliance (§5.5); WASM size; single-maintainer project; API is JS-flavoured, not raw OCCT | Plugs behind the **existing** `BufferGeometryDescriptor` seam; closes exactly the fillet/chamfer/shell gap in §3.1 | ⭐ **ADOPT — STAGED. The named kernel.** Only when a §57 op requires it. §5.4. |
| **`opencascade.js`** | Raw OCCT→WASM bindings | **LGPL-2.1-only** — YELLOW | 2020-05-09 · **2023-03-23** (v1.1.1) · 41,083 | Yes, but stale | Full OCCT | None | n/a | **Dormant 3.5 yr**; v1.1.0 self-declared *"unusable"*; huge unfiltered binding surface | Would need its own packaging work replicad has already done | ❌ **DO NOT ADOPT DIRECTLY.** Trap §4.4. |
| **`occt-wasm`** | OCCT→WASM, clean TS API, small bundle | Wrapper **MIT OR Apache-2.0**; **WASM output LGPL-2.1-only** — YELLOW | **created 2026-03-27** · 2026-08-23 (v4.3.2) · 4,086 | Yes, ~4.5 MB brotli — technically the nicest packaging seen | Full OCCT: fuse/cut/common/section, fillet, chamfer, shell, offset, draft, pipe/loft/sweep, XCAF, STEP/STL/BREP | None | Promising, unproven | **Five months old.** No production users named. Version 4.3.2 after 5 months implies an automated release train, not 4 years of stability | Genuinely good fit *technically* | ⚠ **WATCH-LIST, do not adopt.** Spec §17: *"never auto-select the newest project."* Re-evaluate 2027. |
| **`brepjs`** | Web CAD library, pluggable kernel over occt-wasm | Lib **Apache-2.0**; default kernel LGPL-2.1; alt `brepkit` **AGPL-3.0 or commercial** — **RED on the alt kernel** | **created 2026-02-02** · 2026-08-28 (v18.164.0) · 3,712 | Yes | Exact B-Rep + **a built-in sketcher** + booleans/fillets/shells | Sketcher present; no published simultaneous solver | Unproven | **Seven months old**; version `18.164.0` after 7 months = auto-release train; one named production user (a Gridfinity layout tool); `brepkit` is **AGPL** — a licence PRYZM must not touch for a SaaS | Sketcher is attractive for §57 | ⚠ **WATCH-LIST.** ⛔ **Never the `brepkit` kernel — AGPL is RED for commercial SaaS.** |
| **`opengeometry`** | Rust→WASM CAD kernel aimed at AEC/BIM + Three.js | **MPL-2.0** — GREEN-ish (file-level copyleft) | created 2025-05-02 · 2026-08-28 (v2.0.13) · **192** | Yes | Primitives, polygons, solids, extrusion, sweep, offset, booleans; STL/STEP/IFC/PDF export | None mentioned | Unknown/unmeasured | **192 downloads/week**; 120 commits; README admits *"APIs, examples, and package structure are evolving"*; no named production users | Closest in *ambition* to PRYZM's domain — worth watching for that reason alone | ⚠ **WATCH-LIST.** Adoption today would make PRYZM its largest user and de-facto maintainer. |
| **PlaneGCS (`@salusoft89/planegcs`)** | FreeCAD's 2D geometric constraint solver, WASM | **LGPL-2.0-or-later** — YELLOW (same recipe as §5.5) | created 2023-06-13 · **2026-07-06** (v1.2.0) · 3,917 | **Yes** — published WASM + full TS types | None (solver, not geometry) | ⭐ **The reference 2D GCS**: DogLeg / Levenberg-Marquardt / BFGS / SQP; the full FreeCAD Sketcher constraint set; diagnosis of under/over-constrained systems | Adequate for sketch-scale systems | LGPL; single-maintainer wrapper; **and above all: C74** | **The `SolverPorter` port and `PlanegcsAdapter` were written for exactly this package** | ⭐ **THE right solver — but BLOCKED by `C74 §4.1/§4.5`.** Adoption requires a written §4.2(c) answer FIRST. §5.3. |
| **SolveSpace-derived** | 2D/3D constraint solver | **GPL-3.0** — ⛔ **RED** | npm `solvespace` 0.1.1, **2022-06-26**, a self-declared *"port (attempt)"* | No maintained WASM build found | n/a | 3D constraints (its distinguishing feature vs PlaneGCS) | n/a | **GPL-3.0 is incompatible with commercial closed-source SaaS distribution**; no maintained browser build | — | ⛔ **REJECT on licence.** Recorded so the question is not re-opened. |
| **Three.js** | Rendering | **MIT** — GREEN | 2012 · 2026-07-01 (0.185.1) | Yes | Render meshes; `ExtrudeGeometry`/`Shape` are display-grade only | None | Excellent | Pinned at r183 (§4.7) | **Already the renderer, P2-owned** | ✅ **KEEP. Not a geometry kernel and must never become one.** |
| **`three-bvh-csg`** | Mesh CSG on three-mesh-bvh | **MIT** — GREEN | 2026-02-17 (v0.0.18) · **131,639** | Yes (JS, no WASM) | Booleans on THREE geometry | None | Good, but THREE-coupled | **Violates `pryzm/no-three-in-kernel`** — cannot live in the kernel | Would duplicate manifold-3d | ❌ **REJECT.** PRYZM already has the better, THREE-free option. |
| **WebGPU** | GPU backend | Web standard — GREEN | Shipped adapter in-repo | Native | n/a | n/a | Better than WebGL for heavy scenes | Device loss + instancing defeated by per-element materials (memory) | `WebGPURendererAdapter.ts` exists | ✅ **ALREADY ADOPTED.** Not an open decision. |
| **`web-ifc`** | IFC parse + geometry generation | **MPL-2.0** — GREEN | 2021-02-20 · 2026-03-06 · **194,172** | Yes, WASM | IFC representation items → meshes; boolean for `IfcBooleanClippingResult` | None | Good for IFC | Geometry is IFC-shaped, mesh output | **Already shipped for import/export** | ✅ **KEEP, SCOPE-LOCKED to §29–33.** Not a kernel. |
| **`@thatopen/*`** | BIM viewer/UI/fragments | **MIT** — GREEN | 2024-04-29 · 2026-07-26 | Yes | `fragments.GeometryEngine` (booleans, extrusion, sweep, profiles) — **unused by PRYZM** | None | Good | Dragging `@thatopen/ui` into a server bundle is a known repo hazard (memory `[server-safe-entry-can-import-browser-ui]`) | Viewer/camera/drawing infra | ✅ **KEEP.** ⚠ Note the unused `GeometryEngine` (§1.3) before anyone "discovers" it as a kernel. |
| **`rhino3dm`** | openNURBS read/eval | **MIT** — GREEN | 2018-10-26 · **2026-08-25** (8.32.2) | Yes, WASM (~7 MB, lazy) | NURBS curves/surfaces, meshes, layers — **evaluate, not model** | None | Fine on an import path | Bundle size; no booleans/fillets | **Already wired, import-only** | ✅ **KEEP.** Widen only if §4.4 NURBS authoring is activated. |
| **OpenUSD** | Scene interchange / composition (layers, references, variants) | Apache-2.0 (Tomorrow-modified) — GREEN | Mature upstream; **zero PRYZM presence** (§3.4a) | WASM builds exist but are heavy and immature | Scene graph + composition, **not** a modelling kernel | None | n/a | Would be a **second** scene-composition model beside PRYZM's canonical model — a §5 "divergent source of truth" risk | Its *concepts* (layers, variants, references, overrides) map onto §6 Definition→Type→Instance and §25 nesting | 💡 **ADOPT THE CONCEPTS, NOT THE RUNTIME.** Variant-set thinking informs `ComponentType`; do not add USD as a dependency. |
| **bSDD** | External semantic dictionary (§29–33) | Open API | Client **authored, unreachable** (§3.4c) | HTTP | n/a | n/a | n/a | An unused client rots | `packages/plugin-sdk/src/bsdd.ts` | ⭐ **WIRE WHAT EXISTS.** Cheapest §29–33 win in the estate — no new technology at all. |
| **IDS** | Machine-readable information requirements (§32) | buildingSMART open standard | **Not shipped** (§3.4b) | XML/XSD — parse in TS | n/a | n/a | n/a | Building an authoring UI is large; a *validator* is small | Spec §32 wants ✓Complete/⚠Missing **inside** the semantic system, not export-only | 💡 **BUILD SMALL, LATER.** An IDS *reader + validator* is a plain TS/XML job — **no external kernel, no WASM**. Do not build the authoring half yet. |

### 5.3 The constraint recommendation — the contract-compliant route

**PlaneGCS is the correct technology and it is currently forbidden.** Both halves are true, and the
order matters:

1. **Answer C74 §4.2 in writing, per constraint family**, in order: **(a)** does it need VALIDATION?
   **(b)** ENFORCEMENT? **(c)** geometric SOLVING — *"is there a simultaneous system with no closed
   form?"* The contract notes *"the first two are usually the end of it."*
2. ⭐ **The candidate family is now named and evidenced, not hypothetical.** It is the
   **`.pryzm-family` sketch profile** — `ProfileConstraintSchema`
   (`packages/file-format/src/family-schema.ts:142-158`). The (c) argument writes itself, and it is
   the strongest PRYZM has ever had: **the format already persists `tangent`, `radius`, `diameter`
   and `equalLength`; sequential projection cannot satisfy them; a document can be saved today whose
   constraints nothing can evaluate** (§3.2). That is a simultaneous system with no closed form,
   demonstrated from the schema rather than assumed from the product category. ⚠ **Still write it
   down as the §4.2 record** — this paragraph is the *argument*, not the authorisation, and C74 §1.3
   requires the classification per constraint, in writing, before any solver work.
   ⛔ **And answer (a) and (b) honestly first:** several of the 12 — `horizontal`, `vertical`,
   `distance` against a fixed reference — are VALIDATION or ENFORCEMENT, not SOLVING. C74 notes *"the
   first two are usually the end of it."* Authorisation attaches only to the sub-family that reaches
   (c), and **only to that sub-family**.
3. If and only if (c) is answered for that named family: adopt **`@salusoft89/planegcs`**, replacing
   `this.underlying = new MockSolver()` in `PlanegcsAdapter.ts`. **C74 §4.3 requires this to land in a
   SEPARATE commit from any honesty work**, and the retirement test
   (`__tests__/PlanegcsAdapter.test.ts` — *"scaffold retirement guard"*, asserting `kind === 'mock'`)
   **will fail on purpose**, forcing the scaffold header to be retired in the same change.
4. **Authorisation is per-family.** It does not generalise to walls, stairs or layout.

### 5.4 The geometry recommendation — the staged path, and the trigger

**Build nothing from scratch. Adopt nothing yet. Stage it.**

- **STAGE 0 — now, no new dependency.** Treat `@pryzm/geometry-kernel` + `manifold-3d` as the kernel.
  Deliver the §57 Solid toolgroup from the six existing producers. Add `pattern`/`array` as pure
  transform-level producers (no kernel needed). **Close the §4.2 flag question on its own merits.**
  ⭐ **And test the §4.6 hypothesis first** — extending `profileToPolygon` to handle `line`/`arc`/
  `circle` through the existing `arcToPoints`, and routing `solid.kind` to the already-written
  `produceSweep`/`produceLoft`/`produceRevolve`, is very likely the largest capability gain available
  anywhere in this lane, at zero dependency cost. **Do this before evaluating any kernel.**
- **STAGE 1 — the trigger, stated in advance so it cannot be rationalised later.** Adopt an exact
  evaluator when, and only when, **a §57 operation that mesh geometry cannot honestly deliver is
  actually required by a shipped component** — concretely **fillet, chamfer, or shell/thicken** on a
  real element family, or **exact curve persistence** demanded by §67. Spec §75 (*do not fake
  capabilities*) means the alternative to adopting is **not shipping the button**, not shipping an
  approximation labelled as a fillet.
- **STAGE 1 choice — `replicad` + `replicad-opencascadejs`.** It is the only OCCT path that is
  simultaneously **current** (published 2026-08-21 / 2026-08-14), **pre-packaged for browsers**,
  **years old** (2021) rather than months, and **MIT at the wrapper**. It is not the newest and not
  the fastest — it is the one with a track record, which is what §17 asks for.
- **STAGE 1 boundary — the EXISTING one.** New `producers/exact/*.ts` returning the same
  `BufferGeometryDescriptor`; the OCCT shape handle kept as a **cache side-artefact** keyed by spec
  §73's identity (`definition hash + parameter state + kernel version + representation settings`);
  the WASM lazily imported exactly as `KernelCSG` does it; all tolerances driven from
  `packages/geometry-kernel/src/tolerance.ts` (§2.6, §4.3). **No new layer. No new adapter.**
- **STAGE 1 preconditions:** worker-offload (spec §71 — the OCCT WASM must not run on the main
  thread), and `GeometryStatus = Invalid` with structured diagnostics on kernel failure (spec §73) —
  **never a silent approximation**.
- **NEVER:** `brepkit` (AGPL), SolveSpace (GPL-3.0), `three-bvh-csg` (duplicates manifold and violates
  the kernel's THREE ban), `opencascade.js` direct (dormant).

### 5.5 Licence colours, and the LGPL recipe

| Colour | Technologies | Basis |
|---|---|---|
| 🟢 **GREEN** — unrestricted commercial use | `manifold-3d` (Apache-2.0) · `three` (MIT) · `rhino3dm` (MIT) · `@thatopen/*` (MIT) · `web-ifc` (MPL-2.0) · `replicad` wrapper (MIT) · `three-mesh-bvh` (MIT) | Permissive, or file-level copyleft (MPL) that does not reach PRYZM's own files |
| 🟡 **YELLOW** — usable with a compliance recipe | **OCCT WASM** (LGPL-2.1-only + `OCCT-exception-1.0`) · **`@salusoft89/planegcs`** (LGPL-2.0-or-later) · `occt-wasm`/`brepjs` **compiled output** | LGPL §6 relinking obligation — see recipe below |
| 🔴 **RED** — do not use | **`brepkit`** (AGPL-3.0-only or commercial) · **SolveSpace** (GPL-3.0) | AGPL's network clause and GPL's reciprocity are incompatible with closed-source SaaS distribution |

**The YELLOW recipe — the four conditions that make LGPL WASM safe for PRYZM (and the one that fails):**

1. **Ship the `.wasm` as a separate, fetched artefact** — never inlined or bundled into application JS.
2. **Keep it replaceable by the end user** — expose the module URL as configuration. `occt-wasm`
   documents exactly this: *"For web applications, this is satisfied by loading the `.wasm` file from a
   URL (which users can override via `OcctKernel.init({ wasm: '…' })`)."* PRYZM already does this
   twice: `Rhino3dmLoader.setLibraryPath('/libs/rhino3dm/')`
   (`packages/file-format/src/import/rhino/RhinoImporter.ts:72`) and `PlanegcsAdapterOptions.wasmUrl`.
   **The pattern is in the repo already.**
3. **Give prominent notice** in the product's third-party licence page, and carry the LGPL text and
   the OCCT exception with the distributed artefact.
4. **Publish no modifications privately** — take upstream builds unmodified, or publish patches.

⛔ **The condition that fails it:** compiling the LGPL WASM *into* a single application bundle, or
statically linking it in a way the user cannot replace, converts an ordinary dependency into a
distribution problem. **Any Stage-1 adoption ticket must name conditions 1–4 as acceptance criteria.**

---

## 6 · ANSWERS TO THE SPEC'S §81 QUESTION 7, IN ONE PLACE

> *§81.7 — open-source technology recommendation.*

1. **Kernel:** none newly adopted now. `@pryzm/geometry-kernel` + `manifold-3d` **is** the kernel.
2. **Named staged kernel:** **OCCT via `replicad` / `replicad-opencascadejs`**, adopted **only** on the
   §5.4 Stage-1 trigger (fillet / chamfer / shell / exact curves).
3. **Adapter boundary (spec §18):** **already exists** — `BufferGeometryDescriptor` +
   `pryzm/no-three-in-kernel` in `packages/geometry-kernel/src/index.ts`. Reuse; do not rebuild.
4. **Licence colour:** existing stack **GREEN**; the staged OCCT addition **YELLOW** with the §5.5
   recipe; `brepkit`/SolveSpace **RED**.
5. **Solver:** **PlaneGCS is right and forbidden.** Route through **C74 §4.2(a)(b)(c)** first; the
   `SolverPorter` port and `PlanegcsAdapter` are already in place for the day it is authorised. The
   **named candidate family** is the `.pryzm-family` sketch profile, and the evidence is the
   **12-persisted vs 5-executed** constraint-vocabulary gap (§3.2) — `tangent`, `radius`, `diameter`
   and `equalLength` are persisted today with nothing able to evaluate them.
6. **Standards:** **wire the bSDD client that already exists** (cheapest win in the estate); build an
   **IDS reader + validator** as plain TS later; **take OpenUSD's concepts, not its runtime**.
7. **Reject outright:** `three-bvh-csg` (duplicate), `opencascade.js` direct (dormant), `brepkit`
   (AGPL), SolveSpace (GPL). **Watch-list, re-evaluate 2027:** `occt-wasm`, `brepjs`, `opengeometry`.
8. **Cannot be evaluated:** **ToubkalCAD** and **OpenZCAD** do not resolve to retrievable projects
   (§3.4f).
9. ⭐ **Before any of the above: the technology decision was already made and partly executed.**
   `apps/component-editor` selected `@pryzm/constraint-solver` + `@pryzm/geometry-kernel` +
   `@pryzm/file-format` at S52 and shipped everything except the PlaneGCS binding — which C74 now
   forbids. **The first deliverable is not a kernel evaluation; it is (a) testing the §4.6
   tessellation hypothesis and (b) writing the C74 §4.2 answer for the sketch family.** Both are
   cheap, and both must precede any adoption ticket.

---

## 7 · WHAT THIS LANE DID NOT ESTABLISH

Stated so nobody reads absence as clearance:

- **I did not run** `check-constraint-honesty.ts` or `check-no-hidden-mock.ts` — only
  `check-solver-is-real.ts` (RC=0, §1.5). The other two exist; their current readings are unmeasured.
- **I did not verify the §4.6 hypothesis by execution.** It rests on four read facts (the producers
  exist · `arcToPoints` exists · C74 §1.2 forbids the stated reasoning · `ProfileEntitySchema` carries
  `line`/`arc`/`circle`). **It is a hypothesis with strong evidence, not a measurement.** I did read
  `ProfileEntitySchema` and `ProfileConstraintSchema`; I did **not** read `SolidFeatureSchema`'s
  `sweep`/`loft`/`revolve` arms to confirm what path and section inputs they demand. **Read those
  before acting.**
- **I did not benchmark anything.** Every performance column in §5.2 is reputational, not measured.
  No OCCT-WASM load time, bundle size or boolean throughput was measured on PRYZM's own scenes.
- **I did not obtain legal review.** §5.5 is an engineering reading of LGPL §6 plus the OCCT
  exception, not advice. The Stage-1 ticket should carry it to whoever signs off licensing.
- **`replicad`'s detail page did not load** — its GitHub README gave licence (MIT), 676 stars and 478
  commits, but not a commit date; the **npm registry** supplied the currency evidence I relied on
  (v1.0.1, published **2026-08-21**; `replicad-opencascadejs` **2026-08-14**). It is a
  **single-maintainer** project (`sgenoud`), which is a real bus-factor risk on the Stage-1 path and
  is the strongest argument for keeping the adapter boundary strict.
- **Lane overlap:** §1.8 trespasses on lanes A–D (semantic/geometry/parameters/commands). Treat my
  account of the family stack as a **pointer to verify**, not as their finding.

---

## 8 · SOURCES

Registry facts via `npm view <pkg> version time.created time.modified license` and
`https://api.npmjs.org/downloads/point/last-week/<pkg>`, measured 2026-09-01 (download window
2026-08-23 → 2026-08-29).

- [donalffons/opencascade.js — releases](https://github.com/donalffons/opencascade.js/releases)
- [Open-Cascade-SAS/OCCT — LGPL exception](https://github.com/Open-Cascade-SAS/OCCT/blob/master/OCCT_LGPL_EXCEPTION.txt) · [SPDX OCCT-exception-1.0](https://spdx.org/licenses/OCCT-exception-1.0.html) · [OCCT licence wiki](https://github.com/Open-Cascade-SAS/OCCT/wiki/license)
- [andymai/occt-wasm](https://github.com/andymai/occt-wasm) · [andymai/brepjs](https://github.com/andymai/brepjs)
- [OpenGeometry-io/OpenGeometry](https://github.com/OpenGeometry-io/OpenGeometry) · [opengeometry.io](https://opengeometry.io/)
- [Salusoft89/planegcs](https://github.com/Salusoft89/planegcs) · [@salusoft89/planegcs on npm](https://www.npmjs.com/package/@salusoft89/planegcs)
- [Manifold docs + user list](https://manifoldcad.org/docs/html/) · [OpenSCAD PR #4533 — adopt Manifold](https://github.com/openscad/openscad/pull/4533)
- [@thatopen/fragments GeometryEngine API](https://docs.thatopen.com/api/@thatopen/fragments/classes/GeometryEngine)
- [solvespace/solvespace #1476 — Manifold discussion](https://github.com/solvespace/solvespace/issues/1476)
