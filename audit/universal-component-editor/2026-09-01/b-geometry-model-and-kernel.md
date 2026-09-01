# LANE B — THE GEOMETRY MODEL AND KERNEL

**Phase 0 repository archaeology** for `docs/01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md`
§4.4 · §17–22. Scope: `packages/geometry-kernel`, the `geometry-*` family, profiles/sketches,
exact-vs-mesh representation, booleans, the 3D/plan/elevation representation split,
`packages/drawing-primitives`.

**Lane rule (spec §1): DO NOT CODE. No production file was modified by this lane.**
Every claim below is `file:line` + the §-tag or contract § that governs it.

**Date:** 2026-09-01 · **Repo HEAD:** `6e15af2f` (branch `main`)

---

## §B0 — THE HEADLINE, STATED FIRST

**Is PRYZM mesh-first today? — YES for representation, NO for authoring. The two halves must not
be flattened, and the spec's §2 / §20 verdict differs for each.**

1. **There is no exact geometry anywhere in this repository.** No B-Rep, no NURBS, no
   half-edge / topology structure, no OCCT, no CGAL, no exact-arithmetic predicate library.
   The one and only geometric output type in the whole tree is
   `BufferGeometryDescriptor` — `position: Float32Array`, `normal`, `uv`,
   `index: Uint16Array|Uint32Array`, `groups`, `bounds`, `materialKeys`, `hash`
   (`packages/geometry-kernel/src/types/BufferGeometryDescriptor.ts:47-83`). It is
   **triangle soup, FROZEN at S08 D2 by ADR-009** (same file, line 3).
   The only three places in the codebase that say "B-Rep" say it is *absent*:
   `packages/core-app-model/src/drawing/HiddenLineRemoval.ts:118` — `❌ BRep/CSG — not used`;
   `packages/core-app-model/src/drawing/DrawingPipelineWorker.ts:23` — `❌ No BRep/CSG`;
   `packages/core-app-model/src/presentation/ViewRangeZoneApplicator.ts:11,277` — poché fill
   *"requires BRep CSG geometry — deferred"*. Rhino import **tessellates NURBS away** on the way
   in (`packages/file-format/src/import/rhino/RhinoImporter.ts:15` — *"NURBS → tessellated mesh"*).

2. **But the mesh is NOT authoritative and never has been.** The canonical persisted object is a
   semantic DTO (`WallData`, `SlabData`, …) and the mesh is *regenerated* from it by a pure
   producer with a deterministic content hash (`composeWallGeometryHash`,
   `composeSlabGeometryHash`, … one per element family). The mesh is already a **cache keyed by a
   hash of the parametric inputs** — precisely the §71–72 caching model the spec asks for. PRYZM
   is therefore **"parameters → triangles" with no intermediate exact stage**, not
   "mesh-with-BIM-metadata-attached". Spec §2's prohibition is *already honoured*; spec §20's
   `profile → curve → surface → B-Rep solid → render mesh` has its **first and last stages built
   and the middle two missing**.

3. **THE KERNEL-ADAPTER SEAM ALREADY EXISTS AND IS NAMED.** It is the
   `producer → BufferGeometryDescriptor → committer` boundary, declared verbatim in the
   descriptor header (`BufferGeometryDescriptor.ts:9-13,32-34`):
   > *"The DTO produced by `producers/<element>.ts` and consumed by
   > `plugins/<element>/committer.ts` … The committer reconstructs `THREE.BufferGeometry` on the
   > scenic side by wrapping each typed array in a `THREE.BufferAttribute`."*

   A kernel adapter (OCCT-WASM or otherwise) slots in **as a new producer implementation behind the
   same DTO**: `canonical DTO → adapter → kernel → tessellate → BufferGeometryDescriptor`. Nothing
   downstream of the descriptor need change. **This is the most valuable structural fact this lane
   found: the adapter boundary spec §20 demands is not a gap — it is a frozen ADR.**

4. **⚠ THE SEAM IS HONOURED IN THE KERNEL AND DARK IN THE BROWSER.** There are **TWO rival
   mesh-generation paths.** The descriptor path is fully built (26 kernel producers, 20 plugin
   committers, a `CommitterHost` with batching/coalescing) and **is never constructed in the
   editor** — `src/main.ts:421` boots with `canvas: null`, taking `bootstrapSceneIdle()`, so the
   only file that constructs committers never runs. The repo states this itself, measured:
   *"So the committer is never constructed and this dispatch reaches no mesh"*
   (`apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts:209`, `§L-1040`). What
   actually draws walls, slabs, roofs, beams, columns, handrails, lighting, plumbing and furniture
   is the `*FragmentBuilder` family, which imports THREE and builds `THREE.BufferGeometry`
   directly, never producing a descriptor. The kernel's producer half is reached in production
   **only by the headless bake worker**. See §1.10. **Any kernel-adapter plan that only replaces
   `geometry-kernel/src/producers/*` changes nothing the user sees.**

---

## §1 WHAT EXISTS

### §1.1 `packages/geometry-kernel` — NOT a kernel. A pure producer library.

| | |
|---|---|
| **Authority file** | `packages/geometry-kernel/src/index.ts` (394 lines — the frozen public surface) |
| **Contract** | `C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md`; ADR-009 freezes the DTO |
| **Layer** | CLAUDE.md places it **L2**; its own `package.json` description and `index.ts:3` both say **"L4"**. Both spellings are in the tree and they disagree — see §4 TRAPS. |
| **Shape** | ~100 source files: `producers/` (26 element producers), `pure/` (7 canonical 2-D predicates), `csg/`, `math/`, `dimensions/`, `hidden-line/`, `view-resolution/`, `structural/`, `runners/` |
| **Maturity** | High for what it is. `test:ci` deliberately omits `--passWithNoTests` because *"47 files / 820 tests are measured green here; if that collection ever resolves to nothing, the CI runner must FAIL rather than report a pass over an empty run"* (`package.json`, the `//test:ci` key, L-950) |
| **Reachable in production?** | **Partly.** Several element families never call it (§1.10); three solid producers are not even exported (§1.2). |

Its charter is **the absence of THREE**, enforced by the lint rule `pryzm/no-three-in-kernel`
(`index.ts:4-5`) — *"hard-fails any `three`, `@thatopen/*`, or `web-ifc*` import inside this tree"*.
That is what lets it run byte-identically in a browser worker, a Node `worker_thread` and the bake
service (`BufferGeometryDescriptor.ts:7-10`).

**What the kernel already owns that a universal parametric component editor needs:**

- **Solid producers — all four §4.4 sweep families are AUTHORED:**
  `producers/extrude.ts` (`produceExtrude(profile, depth, {worldY, material})`, S52 D1, labelled
  *"Family Creator producers"*), `producers/sweep.ts` (parallel-transport / Bishop frames; a
  closed 2-D `{u,v}` profile along a 3-D polyline), `producers/revolve.ts` (`{r,y}` silhouette
  about Y, partial sweep + `segments`), `producers/loft.ts` (N parallel sections, each with
  `worldOrigin` / `right` / `up`). Each carries a **FROZEN signature** and a deterministic hash.
- **3-D booleans — real, not fake.** `csg/KernelCSG.ts` (196 lines) — `union` / `subtract` /
  `intersect` backed by **`manifold-3d` WASM**, lazily `import()`ed so non-CSG consumers do not
  pull the ~600 KB blob (`KernelCSG.ts:4-8,19-21`). `producers/boolean.ts` wraps it as a
  descriptor→descriptor producer with `composeBooleanHash`. Its suite is a **30-shape pair suite**
  (`__tests__/produceBoolean.test.ts:1-3`). Operands are *"plain triangle soup `{position, index}`
  in metres"*; `Mesh.merge()` welds within Manifold's epsilon before lifting to a solid.
- **2-D polygon booleans — GE-05, `pure/polygonBoolean.ts`.** Arrangement + midpoint
  classification, *not* Greiner–Hormann (rejected because *"entry/exit classification breaks on the
  shared street-frontage edge that real cadastral data always carries"*, `index.ts:129-133`).
  ⚠ **INTERSECTION AND UNION ONLY — difference `A minus B` is deliberately NOT delivered "because
  it is not oracle-pinned"** (`index.ts:139-141`).
- **Canonical 2-D predicates (C73 §3 "one family per PR" canonicalisation)** — each is THE one
  body for the whole repo, each gated: `pure/pointInPolygon.ts` (`§C73-PIP-CANONICAL`),
  `pure/pointToSegment.ts` (`§C73-P2S-CANONICAL`), `pure/segmentIntersection.ts`
  (`§C73-SEGSEG-CANONICAL` — four named boundary views including the unbounded `intersectLines2D`),
  `pure/polygonOffset.ts` (`§W2A-ONE-OFFSET` — *"there is deliberately no second implementation
  anywhere in the repo"*, gated by `tools/ga-gate/check-offset-implementations.ts`),
  `pure/triangulatePolygon.ts`, `pure/planarFaceWalk.ts`.
  C73 §0.2 is titled *"The same predicate, sixty-one times"* — this canonicalisation is the fix.
- **A DECLARED TOLERANCE POLICY** — `src/tolerance.ts`, `§C73-EPSILON-POLICY` (C73 §2.1):
  `EPSILON_ZERO`, `COINCIDENT_M`, `PARALLEL_RAD`, `RECOMPUTE_IDENTITY_M` plus
  `isNumericallyZero`, `arePointsCoincident2D`, `isParallel`. Gated by
  `tools/ga-gate/check-epsilon-policy.ts`: *"New or modified geometric predicates consume these;
  they do not invent a literal at the call site"* (`index.ts:22-25`).
- **One ortho constraint for the whole repo** — `math/orthoConstraint.ts`,
  `§RULING-ORTHO-IS-THE-PERPENDICULAR-FOOT` (founder ruling 2026-08-24). It lives in the kernel
  *"because `geometry-slab` and `geometry-wall` DEPEND ON EACH OTHER and the kernel depends on
  neither: this is the only home that is a tree, not a cycle"* (`index.ts:35-38`).
- **Deterministic content hashing per element family** — `compose*GeometryHash` +
  `*_HASH_SCHEMA_VERSION` for wall / slab / stair / handrail / ceiling / room / structural /
  curtain-wall / lighting / plumbing / furniture / dimension / roof / extrude / boolean.
- **A steel section catalogue** — `structural/SteelProfileLibrary.ts` (EN 10025 / BS4), moved
  *down* into the kernel 2026-08-31 (F-P5-04) because it is pure data with zero imports.
- **Off-thread runners** — `runners/headless-runner.ts`, `runners/browser-worker-runner.ts`,
  `runners/node-worker.ts`, `runners/worker-entry.ts`. The §71 Web-Worker story is scaffolded.

### §1.2 What in the kernel is AUTHORED BUT UNREACHABLE

This repo's standing lesson is *authored ≠ wired*. Three separate cases, each confirmed by a
search whose result is quoted:

- **`produceSweep` / `produceLoft` / `produceRevolve` ARE NOT EXPORTED FROM THE BARREL.**
  The only mention of them in `src/index.ts` is a comment at line 364:
  `// ── S52 D1: Family Creator producers (extrude first; sweep / loft / revolve at S53) ──`.
  A repo-wide `rg 'produceSweep|produceLoft|produceRevolve' --glob '**/*.{ts,tsx}'` returns hits
  **ONLY inside `packages/geometry-kernel/__tests__/`** (`produceSweep.test.ts`,
  `produceRevolve.test.ts`, `produceLoft.test.ts` all exist) — **zero hits in any `src/`, `apps/`
  or `plugins/` file.** Three fully-implemented, fully-tested, frozen-signature solid producers
  with **no public export and no production caller.** Wiring them is one `index.ts` re-export
  line each.
- **`canProduceRoofForm` — the roof-form pre-flight — declares its own unreachability in the
  barrel** (`index.ts:151-162`):
  > *"⚠ AUTHORED, REACHABLE, AND STILL UNWIRED — stated so it is not mistaken for a closed loop.
  > `canProduceRoofForm` has NO CALLER today. Until a roof command handler calls it, the only
  > honesty in the shipping path is after-the-fact … nothing refuses in front of the user, and
  > nothing reads `geo.userData.pryzmRoofDegraded` either."*

  This is spec §75 (*do not fake capabilities*) caught and documented in-tree: a mansard silently
  built as a hip. **Spec §73's `GeometryStatus = Invalid` requirement has a working prototype here
  that nobody calls.**
- **`produceWallWithVoids` (single-volume CSG wall) is behind a default-off `window` flag.**
  `index.ts:341-346`: *"Additive only — NOT wired into the wall builder yet."* The consumer seam
  exists — `WallFragmentBuilder.setSingleVolumeProducer()`
  (`packages/geometry-wall/src/WallFragmentBuilder.ts:466-473`) — and is gated on
  `window.__wallSingleVolume`, *"Default-off; the segmented mesh always renders first and remains
  the fallback."* `OpeningProfile.ts:33` records the arm as
  **`F single-volume CSG → PARKED, default OFF — unavailable`**.

### §1.3 The `geometry-*` family — 18 packages, 544 source files

Measured 2026-09-01 (`find packages/geometry-*/src -name '*.ts' | wc -l`, per package):

| package | src files | what it owns |
|---|---:|---|
| `geometry-kernel` | 100 | pure DTO→descriptor producers, canonical predicates, CSG, tolerance |
| `geometry-furniture` | 93 | furniture types, AI element config/validator, kitchen/wardrobe, **plan + elevation symbol builders** |
| `geometry-wall` | 71 | **THE profile / sketch / footprint / extrude stack** — see §1.4 |
| `geometry-stair` | 67 | types, builders, tools, `stairPath`, `StairValidationAuthority` |
| `geometry-slab` | 38 | store, fragment builder, validators, sketch resolver, `boundaryArc` |
| `geometry-handrail` | 25 | builder, tool, run generators |
| `geometry-roof` | 25 | types, snapshots, tools, fragment builder (re-exports the kernel's ONE `offsetPolygon`) |
| `geometry-curtain-wall` | 21 | types, store, panel builder, grid system, **worker pool** |
| `geometry-door` | 20 | types, store, system-type store, `DoorPlanSymbolBuilder` |
| `geometry-window` | 18 | types, store, system-type store, `WindowPlanSymbolBuilder`, `WindowReveal` |
| `geometry-lift` | 16 | types, stores, placeholder mesh builder (C104 compound system) |
| `geometry-plumbing` | 16 | fixture types; fragment + plan + elevation symbol builders |
| `geometry-column` | 11 | types, slab-column coupling, plan symbol builder |
| `geometry-lighting` | 8 | fixture types, room resolver, placement tool |
| `geometry-boundary-line` | 5 | C105/ADR-0348 setting-out lines, **parametric attachment anchors** + host-move propagation planner |
| `geometry-balcony` | 4 | C103/ADR-0333 **COMPOUND** assembly (cantilever slab + finish + railing runs) from ONE polygon |
| `geometry-beam` | 3 | fragment builder + level cleanup |
| `geometry-pool` | 3 | ADR-0124 pool ASSEMBLY (hole + walls + floor slab + water) |

**The organising principle is NOT "one package per solid kind" — it is "one package per BUILDING
ELEMENT FAMILY."** Each typically holds: a `*Data` type, a store, a `*FragmentBuilder` (THREE
mesh), a `*PlanSymbolBuilder` (2-D symbol), a `*Tool`, and validators.
`geometry-balcony`, `geometry-pool` and `geometry-lift` prove the family **already knows how to be
a COMPOUND / assembly element** — directly relevant to spec §25 (nesting/composition).

### §1.4 PROFILES AND SKETCHES — where they already live

They live in **`packages/geometry-wall`**, not in the kernel, and there are **five distinct profile
systems** in the tree:

1. **`WallProfile.ts` (1,092 lines) + `WallProfileVariants.ts` (281)** — the wall **ELEVATION
   profile**: a ring of `WallProfileVertex` in the wall's own `(u, v)` frame (`u` along the
   baseline, `v` above the base plane; `WallProfile.ts` *"fixes that convention and neither the
   editor file nor the panel re-derives it"*). `§FEAT-WALL-PROFILE-EDIT` — the founder's
   *"I REQUIRED A PROFILE EDIT FEATURE (MODE) for WALLS"*. Persisted on the wall, gated, and drawn
   by `WallProfileBodyBuilder.ts` (`§FEAT-WALL-PROFILE-BODY`, L-1067).
2. **`OpeningProfile.ts` (1,015 lines) + `CustomOutline.ts`** — `§OPENING-PROFILE` (L-1200),
   **THE ONE PRODUCER OF AN OPENING'S OUTLINE**, binding under **C86 §10.1 PR-1**:
   *"every wall-body arm consumes the outline THIS function returns. ⛔ No arm may re-derive an
   arc."* Kinds (`OpeningProfile.ts:78-91`):
   `'rectangular' | 'round-arch' | 'segmental-arch' | 'circular' | 'custom'`, with
   `DEFAULT_OPENING_PROFILE = 'rectangular'` because *"ABSENT MEANS RECTANGULAR, AND THAT IS
   LOAD-BEARING"* (`:95-99`) — the additive-migration trick a component format needs.
   `'custom'` is a **free-form ring authored in elevation** with named presets
   (`OPENING_OUTLINE_PRESET_IDS`, `§OUTLINE80`, SPEC-WINDOW-CUSTOM-OUTLINE D1).
   Deliberately THREE-free so the outline can be *"unit-tested without a renderer, hashed for cache
   invalidation, and consumed identically by the `THREE.Shape` arm, the gasket arm and (one day)
   the kernel producer"* (`:21-25`).
3. **`OutlineAuthoring.ts`** (`@pryzm/geometry-wall/outline-authoring`, L2) — the **authoring
   MODEL** for a sketch: `outlinePlacePoint` (with the absolute-ortho ruling decided *inside the
   L2 helper* so no surface "can have its own opinion"), `outlineArcSegment` (16-chord
   tessellation, `OUTLINE_ARC_SEGMENTS = BOUNDARY_ARC_SEGMENTS`),
   `normaliseOutlineToUnit` / `denormaliseOutline` — **a ring stored resolution-independently and
   replayed at any size**, which is spec §12's "parametric after placement" in miniature —
   and `outlineRectangle`.
4. **`WallFootprint2D.ts` (117) / `WallLayerFootprint2D.ts` (225)** — the **PLAN** footprint
   polygon (4/5/6-vertex, mitre-aware; the layered variant slices per-layer bands,
   `§L955-ONE-CORNER-RULE`).
5. **`Profile` in `@pryzm/file-format`'s family schema** — the *declarative, persisted,
   constraint-carrying* profile. See §1.6. **It is the only one of the five that carries
   constraints, and the only one that is data rather than code.**

**The ADR-0055 "Pascal wall pipeline" is real, wired, and default-ON.**
`packages/geometry-wall/src/WallPipelineV2.ts` (`WallPipelineV2.ts:5-9`) composes:

```
P1  JunctionResolverV2.resolveJunctions(walls)       — per-level ring-sweep mitres
P2  WallFootprint2D.buildWallFootprint(wall, miter)  — per-wall 4/5/6-vertex polygon
P3a WallPolygonExtruder.buildWallExtrusion(fp, opts) — per-wall THREE.BufferGeometry
```

plus a per-level mitre cache (`WallPipelineV2Cache`) and the `§WALL-RAKE-JOINT` (ADR-0312)
**twin-solve loft** for raked walls (a second junction solve at a probe elevation
`RAKE_JOINT_PROBE_H = 2e-5`, exploiting that every corner point is an *affine* function of the
sampling elevation). **This is a working `sketch → profile → extrude` chain in production today**
— it is simply hard-wired to walls rather than generic.
⚠ Its own header says *"Defaults to OFF"* (`:17`) while its code says otherwise (`:222-224`,
`!== false` ⇒ **default ON**), and `WallFragmentBuilder.ts:52` says *"default ON since
2026-05-27"*. See §4 TRAPS.

`resolveBoundarySegments` / `BOUNDARY_ARC_SEGMENTS` (§L965) — the boundary-arc segment resolver
named in the lane brief — lives with the slab arc machinery
(`packages/geometry-slab/src/boundaryArc.ts`, re-exported through `OutlineAuthoring.ts`). The
standing memory `grep-for-the-existing-solver-first` records a lane that re-invented it as a
`shellArcs` heuristic and failed on the real Bézier tessellation. **Grep before writing a
tessellator.**

### §1.5 A REAL 2-D SKETCH SURFACE ALREADY SHIPS IN THE MAIN EDITOR

`apps/editor/src/ui/ElevationOutlineSurface.ts` (389 lines) —
**"THE one SVG elevation-drawing surface"** (`§OUTLINE81`, **C86 §10.6 rule 4**), extracted from
`WallProfileEditor.ts` *"so the wall profile modal and the window outline section are two CALLERS
of one surface rather than two implementations of one idea."*

- **Three live callers**: the wall profile modal; the window **type** editor's outline section;
  and `WindowOutlineEditorDialog.ts` — the "Edit outline…" surface for a **placed** window,
  opened on *that instance's* own ring at *that instance's* `width × height`
  (D2: "true proportions"). That is spec §12 (instance-level parametric editing after placement)
  working today, for one attribute of one element.
- **Modes**: `select` (vertex drag with snap-unless-Shift, midpoint insert, double-click delete
  with a min-vertex guard, `refitTo` as pure arithmetic) · `polyline` (click-to-place, Enter
  closes) · `arc` (3-click start/through/end appending a 16-chord run) · presets ·
  **⛔ absolute ortho**.
- **It states its own dimensional contract in the header**: one `scale` for BOTH axes, so
  `toModel(toPx(p)) === p` and *"RESIZING CHANGES `scale` AND `pad` AND NOTHING ELSE — the ring is
  metres, never pixels."*
- **⛔ NO STORE, NO COMMAND BUS, NO THREE, NO rAF.** It hands rings to callbacks; the CALLER turns
  a ring into a command (P6). `WindowOutlineEditorDialog.ts:10-13`: *"A ring the predicate refuses
  NEVER leaves this dialog — the refusal is shown BY NAME (its own `reason`, C16 CA-18) and the
  dialog stays open."* This is **exactly** the §45 structured-diagnostic pattern, already built.

`WallProfileEditor.ts` carries `§WPE-CHROME-LAYER` (L-10200): a 359-line DOM dialog was moved OUT
of the L2 geometry package up to `apps/editor/src/ui/WallProfileEditor.ts` because *"L2 may not
import L7"* and the founder's ask (a resizable/draggable panel) was *"not expressible without
either a layer violation or a fifth hand-rolled copy of a dragger this repo already has two shared
versions of."* **What stayed at L2 is the SUBJECT, the CALLBACKS, the authoring grid and the PORT**
— a proven, reusable split for a universal editor's panel architecture.

### §1.6 ⭐ `.pryzm-family v1` — A CANONICAL PARAMETRIC COMPONENT FORMAT ALREADY EXISTS

**This is the largest "already done" in Lane B's scope, and it is not in the geometry packages at
all.** `packages/file-format/src/family-schema.ts` (266 lines) — *"the SINGLE source of truth for
the on-disk shape; the editor's in-memory store types narrow it but never widen it"* — S55
deliverable, Zod-validated, with `formatVersion` + a `family-migrations/` framework
(`migrate-family.ts`).

It already contains, one-for-one, most of the spec's §6 / §9 / §14 / §16 vocabulary:

| Spec asks for | `family-schema.ts` already has | line |
|---|---|---|
| §6 Definition → Type → Instance | `FamilyManifest` + `FamilyDocument` → `FamilyTypeSchema[]` → per-instance overrides in `bakeFamilyInstance` | `:244-254`, `:228-241` |
| §7 stable identity | typed ULID id spaces: `fam_` `typ_` `par_` `sol_` `prof_` `slot_` `plane_` — 26-char Crockford base-32, regex-validated | `:15-22` |
| §9 parameters as first-class objects | `FamilyParameterSchema` — `id`, `name`, `kind: 'type'\|'instance'`, `dataType`, `defaultValue`, `expression`, `ifcMapping`, `exposed` | `:118-132` |
| §10 typed / semantic units | `dataType: 'length'\|'angle'\|'number'\|'count'\|'boolean'\|'string'` | `:110-117` |
| §11 typed expression engine | `expression: string \| null` + `@pryzm/family-runtime` {tokenizer, parser, evaluator, functions, **unit-coercion**} | `:126` |
| §14 constraints as persistent objects | `ProfileConstraintSchema` — **12 kinds**: coincident, parallel, perpendicular, horizontal, vertical, tangent, distance, radius, angle, diameter, equalLength, distancePointLine — each with `entityIds`, `parameterRef`, `value` | `:139-158` |
| §14 reference planes | `ReferencePlaneSchema` — `id`, `name`, `origin`, `normal`, `isHost` | `:102-109` |
| §16 feature graph | `SolidFeatureSchema` — discriminated union `extrude \| sweep \| loft \| revolve`, each with `profileId`, `materialSlotId`, **`lod: {coarse, medium, fine}`** | `:172-225` |
| §23 semantic materials | `MaterialSlotSchema` (slot id + name + `defaultCategory`) — components expose material **slots**, never renderer colours | `:227-232` |
| §28 visibility per detail level | the `lod` triple on every solid | `:180-184` |
| §29–33 IFC as a MAPPING, not canonical | `IfcMappingFileSchema` + per-parameter `{psetName, propertyName}`; `FamilyIfcEntitySchema` enumerates 11 IFC entities; **`FamilyCategorySchema` is PRYZM-local** (`Door, Window, Furniture, Casework, Fixture, Lighting, Plumbing, Generic`) | `:82-99`, `:33-59` |
| §37 versioning | `formatVersion` literal + `semver` + `schemaHash` (`sha256:`) + per-type `checksum` + `family-migrations/` | `:60-79`, `:236-240` |
| §38 semantic events | `FamilyEventSchema` → `event-log.ndjson` | `:260-266` |

Supporting packages, all pure-Node, all reachable **as libraries**:

- **`@pryzm/family-runtime`** — *"expression DSL + resolver + unit coercion … used by the family
  editor (resolve at edit-time), the bake-worker (resolve at bake-time), and the AI worker
  (validate AI-proposed parameter values)"*. **That package description is spec §5's
  one-model-three-surfaces rule, already written as a charter.**
- **`@pryzm/family-loader`** — `loadFamily(path)` opens the `.pryzm-family` ZIP via
  `@pryzm/file-format`, validates manifest + document, runs a **resolver pre-flight**, and caches
  by `(familyId, schemaHash)`.
- **`@pryzm/family-instance`** — `bakeFamilyInstance({family, typeId, instanceOverrides})` → one
  `BufferGeometryDescriptor` per solid **in document order**, plus the resolved values map *"so
  the caller can attach instance parameters to the IFC export downstream"*, wrapped in an OTel span.
  `profileToPolygon.ts` converts a `Profile` to the closed XZ polygon `produceExtrude` expects.
- **`packages/file-format/src/family-pack.ts` / `family-unpack.ts`** — the ZIP container with
  canonical-JSON serialisation (so the `schemaHash` is stable).

**⚠ The schema is RICHER THAN THE IMPLEMENTATION, and the gap is stated in-code, honestly:**

- `bakeFamilyInstance.ts:14-21`: *"`extrude` — fully wired. `sweep` / `loft` / `revolve` — return
  a structured `unsupported-feature` error per solid; the bake completes the supported solids and
  reports the unsupported ones. Lighting up these producers requires the constraint solver (S57)
  so that path and section profiles can be evaluated."*
- `profileToPolygon.ts:5-16`: *"The profile's `entities` list is an ordered list of `point`
  entities … Lines / arcs / circles / splines and full constraint solving are deferred to S57."*
  A non-`point` entity throws `ProfileEvalError('profile-needs-solver')` — *"so callers fail loudly
  rather than silently dropping geometry."* **That is spec §73 behaviour, correctly implemented.**

So today: **a family can only be a polygon-of-points extrude.** Every other capability the schema
can express refuses by name. That refusal is a feature, and it is the honest baseline to build on.

### §1.7 ⭐ `apps/component-editor` — THE FAMILY CREATOR SPA EXISTS (5,918 LoC) AND DOES NOT SHIP

`apps/component-editor/` — *"PRYZM 2's standalone SPA for authoring parametric component families
(the Revit-Family-Editor analogue). It produces `.pryzm-family` artefacts that the main editor and
the marketplace consume."* (`README.md:1-5`). **52 TypeScript source files, 5,918 lines.**

What is authored there:

- `sketch/` — `SketchCanvas.ts`, `sketchRender.ts`, `entities.ts`, `hitTest.ts`, `snap.ts`,
  `transform.ts`, `SketchToolbar.ts`, `ConstraintToolbar.ts`, `buildConstraintSet.ts`,
  `solverRunner.ts`
- `sketch/tools/` — **LineTool, ArcTool, CircleTool, RectangleTool, FilletTool, TrimTool,
  SelectTool** (spec §57's Create + Modify tool groups, partially)
- `commands/constraint/` — `addCoincident`, `addDistance`, `addFixed`, `addParallel`,
  `addPerpendicular`; `commands/referencePlane/`; `commands/solid/`
- `stores/` — `sketchDocStore`, `constraintStore`, `referencePlaneStore`, `selectionStore`,
  `solidStore`, `viewTabStore`
- `ai/` — `aiHostBridge.ts`, `toolRegistry.ts`, `approvalQueue.ts`, `types.ts` — **the §39–45
  AI-as-author bridge, scaffolded, with an approval queue**
- `marketplace/` — `publishFlow.ts`, `signing.ts`
- `app/AppShell.ts` — three view tabs: **Sketch / 3D / Parameters**; `familyEditorRuntime.ts` is
  *"the single owner of these stores"*
- Its own quality gates: `no-three.test.ts`, `no-react.test.ts`, `loc-cap.test.ts` (300 LoC/file),
  `bundle-budget.test.ts` (≤180 KB gzip first paint), `a11y.test.ts`,
  `secondCompositionRoot.invariants.test.ts`

Its declared architectural rules (`README.md:38-45`) already match the spec: vanilla TS, only
`*Committer.ts` may import THREE (P2), one global `rafScheduler` (P3), every mutation through
`@pryzm/command-bus`, no `(window as any)`.

**REACHABILITY — the honest reading, taken from the repo's own scaffold declaration.**
`apps/editor/src/familyCreatorPlaceholder.ts:1-50` carries a **C74 §3.4 SCAFFOLD DECLARATION**:

> *"WHAT IS FAKE, stated plainly — this module is named for the Family Creator and creates no
> family. It is a DOM modal that says 'under construction' and prints a path to a plan document.
> Clicking 'Component' / 'Generic Component' in the create rail reaches a dialog, not an editor:
> nothing is authored, nothing is persisted, no `.pryzm-family` artefact exists afterwards."*
>
> *"EXIT CONDITION — `apps/component-editor` reaches standalone deploy and the create rail hands
> off to it (S58) … ⚠ MILESTONE HONESTY (C74 §4.2(c)): the 'S58' above is the PLAN's number,
> restated, not a fresh promise. The legacy `src/component-editor/` prototype was removed
> 2026-04-28 and no replacement has shipped since; **treat S58 as UNSCHEDULED until
> `apps/component-editor` has a deploy target**."*

Confirmed independently: `grep -rn "component-editor" --include=*.{json,js,ts,yml,toml,mjs}
--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=dist-gate .` returns **no CI workflow,
no `fly.toml`, no `server.js` route and no root Vite entry** — only the app's own files, its own
tests, four `apps/editor/src/ui/Family*Panel*.ts` files, `apps/marketplace-web/package.json`, and
audit JSON. **It builds and it tests; it does not ship.**

Two further stubs to not mistake for features:
- `plugins/family-editor/src/index.ts` (27 lines) — *"Stub — full implementation pending Phase F
  reference-plugin delivery"*; `activate()` `console.info`s and returns.
- `apps/editor/src/ui/familyCreatorPlaceholder.ts` (10 lines) — a **different** file with the
  **same name** as the one above, a bare `console.log`, reached from
  `ui/layout/CreatePanelLayout.ts:350`. The scaffold header warns about exactly this
  (*"Two files, same name, different callers"*). A third copy was deleted 2026-08-15 as dead.
- `apps/editor/src/ui/toolbar/FamilyToolbar.ts` declares 8 typed commands (`create-family`,
  `edit-family`, `place-family-instance`, `export-family`, …) routed through
  `applyCommandBacking` / `refuseUnbacked` — **buttons that refuse by name when no handler is
  registered.** Honest scaffolding, not a working feature.

### §1.8 CONSTRAINTS — the solver is a MOCK, and says so

`packages/constraint-solver/package.json` description, verbatim:

> *"2D sketch constraint engine behind a `SolverPorter` contract. Ships a deterministic
> `MockSolver` (five first constraint kinds: distance-pp, parallel, perpendicular, coincident-pp,
> fixed) and an **HONESTLY-LABELLED planegcs scaffold** (`PlanegcsAdapter`, kind='mock',
> intendedEngine='planegcs'). **No real planegcs binding exists in this repo, and none is
> authorised until C74 §4.2(c) is answered** for a named constraint family (C74 §4.5)."*

- `src/types.ts:22-27` — `ConstraintKind` is **five** kinds. The header promises *"The full
  planegcs catalogue (~30 kinds) lands incrementally at S53–S55"*. It did not.
- The **result contract is nonetheless the right shape**: `SolveResult` carries
  `status: 'well-constrained' | 'under-constrained' | 'over-constrained' | 'singular'` and a signed
  `dof` (`types.ts:88-119`). **Spec §68's under/over-constrained diagnostics are already in the
  type surface — they are simply not computed by a real solver.**
- Naming convention is already fixed: variables `${entityId}-x${i}` / `-y${i}`, points
  `${entityId}-${vertexIndex}`, plus `pointVariables` and `lineEndpoints` maps
  (`types.ts:28-77`) — a sketcher-to-solver wire format that exists and works.
- The off-thread worker was **DELETED** 2026-08-12 (C74 §3.8, ADR-0323 *wire-or-delete*) because it
  had zero production callers (`index.ts:39-43`). `StairValidationAuthority` was likewise deleted
  2026-08-13 (C74 §2.2) as a byte-near copy of the `geometry-stair` one.
- ⚠ **Three different arities for "constraint" coexist**: the solver's **5** kinds, the family
  schema's **12** (`family-schema.ts:141-155`), and the spec §14's **14**. *The persisted format can
  already express constraints nothing in this repo can solve.*
- ⚠ A **second, unrelated** thing is also called a constraint engine here: `ConstraintEngine.ts`
  (exported as `@pryzm/constraint-solver/compliance`) — *"the REAL advisory rule registry"* — plus
  `stair-constraint-engine.ts` and `LevelTraversalPolicy.ts`. **Building-code compliance rules are
  not geometric constraints. Do not conflate them.**

### §1.9 REPRESENTATIONS — the 3-D / plan / elevation split (spec §21–22)

**PRYZM already has three parallel representation pipelines, and they are three separate BUILDER
FAMILIES, not derivations of one geometry.** This is precisely the structure spec §22 forbids
(*"never separate independent geometry systems"*) — and it is what ships.

1. **3-D body — the `*FragmentBuilder` family (9 files, all THREE-importing):**
   `WallFragmentBuilder`, `SlabFragmentBuilder`, `RoofFragmentBuilder`, `BeamFragmentBuilder`,
   `ColumnFragmentBuilder`, `HandrailFragmentBuilder`, `LightingFragmentBuilder`,
   `PlumbingFragmentBuilder`, `FurnitureFragmentBuilder`.
2. **Plan symbol — the `*PlanSymbolBuilder` family:**
   `DoorPlanSymbolBuilder`, `WindowPlanSymbolBuilder`, `ColumnPlanSymbolBuilder`,
   `WallLayerPlanSymbolBuilder`, `PlumbingPlanSymbolBuilder`, `RoofSlopeSymbolBuilder`,
   `BoundaryLinePlanSymbolBuilder`, plus furniture's `Bed / Chair / Kitchen / Sofa / Tree /
   Wardrobe` builders — and `StairPlanSymbolRegistry`, which exists **twice**
   (`core-app-model/src/scene/` *and* `scene-committer/src/`).
3. **Elevation symbol —** `core-app-model/src/drawing/WallElevationSymbol.ts`,
   `OpeningElevationSymbol.ts` + `OpeningElevationSymbolBuilder.ts`,
   `geometry-plumbing/src/PlumbingElevationSymbolBuilder.ts`,
   `geometry-furniture/src/builders/TreeElevationSymbol*.ts`.

**The genuinely representation-neutral, reusable pieces:**

- **`packages/drawing-primitives`** (ADR-0029) — a backend-agnostic **2-D primitive stream**:
  `Line | Polyline | Polygon | Arc | Text | Hatch` with `Stroke` / `Fill` / `DashStyle`, and
  **four backends**: `Canvas2DBackend`, `SvgBackend`, `PdfBackend`, `PrintCanvasBackend`.
  `BackendNotImplementedError` means a backend **refuses by name** rather than drawing nothing.
  Plus a full **sheet composition layer** (C29 / C24): `Sheet`, `Viewport`, `ViewportContent`,
  `TitleBlock`, `PaperSize`, `SheetToSvg`, `ViewportToSvg`, `buildSheetFromViews`,
  `buildSheetFromRooms`. `classifierToPrimitives` bridges hidden-line output into the stream.
- **`geometry-kernel/src/edge-projection.ts`** (`projectWallEdges`) and **`poche.ts`**
  (`computePocheFills`) — S30, pure plan-view edge projection and poché fill.
- **`geometry-kernel/src/hidden-line/classifier.ts`** with
  `core-app-model/src/drawing/HiddenLineRemoval.ts` — hidden-line classification, explicitly
  **mesh-based, `❌ BRep/CSG — not used`**.
- **`geometry-kernel/src/producers/section-cut.ts`** — `produceSectionCut` (W-09, moved out of
  `plugin-section-view` into the kernel), returning `SectionEdge2D[]` + `SectionLine`.
- **`geometry-kernel/src/view-resolution/`** — `classifyElement`, `evaluateCondition`,
  `resolveElementInstructions`, `ResolvedViewRange`. **This is a real, pure implementation of spec
  §28's semantic "visible when …" visibility**, evaluated per element per view.
- **`geometry-kernel/src/dimensions/`** — `produceDimensions` / `evaluateDimensions` over a
  `DimensionString` schema for the headless plan-view auto-dim pipeline (S33/S34 Track C).
  ⚠ **This is a SECOND dimension system**, distinct from the `produceDimension` /
  `analyseDimension` pair for first-class 3-D Dimension elements — `index.ts:293-299` says so.

Governing contracts: **C102** (View & Sheet Integrity), **C30** (Drawing Set Management),
**C34** (Print & Drawing Standards), **C59** (Multi-Pane View System), **C04 §3** (Scene Committer).

### §1.10 ⚠ THE TWO RIVAL MESH PATHS — the most consequential finding for a kernel adapter

**PATH A (the kernel path — architecturally complete, and NOT CONSTRUCTED IN THE BROWSER).**
`producers/<element>.ts` → `BufferGeometryDescriptor` → a committer wraps the typed arrays in
`THREE.BufferAttribute`. THREE-free upstream of the committer; content-hashed; worker-capable.
Declared in `BufferGeometryDescriptor.ts:9-13,32-34`, governed by **C04 §3 (Scene Committer, L4)**.
It is fully built: **19 element committers** exist (`plugins/{wall,slab,door,window,roof,stair,column,
beam,ceiling,curtain-wall,dimensions,furniture,grid,handrail,lighting,plumbing,rooms,structural,
toy-cube}/src/committer/*.ts`), each calling its producer — e.g.
`plugins/wall/src/committer/wall-committer.ts:179` `produceWall(dto, NO_JOINS, …)`. Supporting
machinery in `packages/scene-committer/`: `CommitterHost`, `dispatcher` (per-tick batching +
add/update/remove coalescing matrix), `MaterialPool`, `InstancedMeshCoalescer`, `LODManager`,
`SceneRegistry`, `SceneLayers`, `SceneObjectClassifier`, `PreviewRegistry`.

**⛔ AND IT NEVER RUNS IN THE EDITOR. The repo says so itself, measured and pinned.**
`apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts:204-210` (`§L-1040`), verbatim:

> *"`DoorCommitter` is constructed only at `bootstrap.render.everything.ts:140`, reached only via
> `SceneBootstrap.bootstrapScene`, which requires a canvas (`SceneBootstrap.ts:61`).
> `src/main.ts:402` boots with `canvas: null` — the "idle" path (`SceneBootstrap.ts:226`).
> **So the committer is never constructed and this dispatch reaches no mesh.**"*

Verified independently: `src/main.ts:421` passes `canvas: null`;
`packages/renderer/src/SceneBootstrap.ts:~226` is `bootstrapSceneIdle()`, which returns
`renderer: null, scheduler: null`. And `bootstrap.render.everything.ts` — the only file that
constructs committers — wires **four** of the twenty (`WallCommitter`, `SlabCommitter`,
`DoorCommitter`, `WindowCommitter`, `:22-24`) and is imported by nothing outside itself and
`SceneBootstrap`'s dynamic `loadRenderEverything()`.

**Where the kernel's mesh producers ARE genuinely reached in production:** the **headless bake
worker**. `apps/bake-worker/src/session/HeadlessBakeSession.ts:23` imports `produceWall`, and
`apps/bake-worker/src/jobs/RebakeFamilyInstanceJob.ts` runs
`family-loader → family-instance → BufferGeometryDescriptor → content-addressed chunk → storage
driver → signed URL`. ⚠ That job too is **unfed**: its own header says *"The S22 sync server is
the producer side and **will start emitting `family.instance.placed` events after S56 D4 lands**."*

**What the browser actually imports from the kernel** — a survey of every
`from '@pryzm/geometry-kernel'` in a `src/` file (≈70 sites) shows the consumption is
**overwhelmingly the pure 2-D predicates and the tolerance constants**, not the producers:
`pointInPolygonXZ` / `pointInPolygonXY` / `pointInRingEvenOdd` (~35 sites across `ai-host`
workflows, `command-registry`, `apps/editor/src/ui`, `stores`, `street-analytics`),
`EPSILON_ZERO` / `COINCIDENT_M` / `RECOMPUTE_IDENTITY_M`, `intersectSegments2D` /
`segmentsProperlyCross2D`, `intersectPolygons2D`, `orthoConstrainXZ`, `planarFaceWalk`.
**The kernel ships today as a canonical-predicate-and-tolerance library. Its producer half is
exercised by tests, benches, and the bake worker — not by the editor.**

**PATH B (the shipping path, bypasses the descriptor entirely).** The `*FragmentBuilder` family
lives in the **L2 `geometry-*` packages** and imports THREE directly:

```ts
// packages/geometry-wall/src/WallFragmentBuilder.ts:4-11
import * as THREE from '@pryzm/renderer-three/three';
import { mergeGeometries, toCreasedNormals } from '@pryzm/renderer-three';
import { safeDisposeMaterial, safeDisposeMaterials } from '@pryzm/renderer-three';
import { detachAndReleaseChildren, scheduleGpuRelease } from '@pryzm/renderer-three';
```

`WallPipelineV2.ts:23` and `WallPolygonExtruder.ts` do the same. These build
`THREE.BufferGeometry` (via `THREE.Shape` + `Path` holes, `ExtrudeGeometry`, `BoxGeometry`,
`mergeGeometries`, `toCreasedNormals`) and hand meshes straight to the scene — **no
`BufferGeometryDescriptor` is ever constructed on this path.**

`OpeningProfile.ts:29-35` enumerates the five wall-body arms that ship, and **none of them is the
kernel**:

```
A  plain straight, no mitre + no rake cap-drift → THREE.Shape + Path holes   ✅ exact
B  plain straight, mitred / lofted end          → abutting BoxGeometry        ✅ via gasket
C  layered straight                             → break-grid rasteriser       ✅ via gasket
D  curved wall                                  → radial bands in ARC-LENGTH  ⛔ REFUSES
E  instanced                                    → unit box × T·R·S            ⛔ excluded
F  single-volume CSG                            → PARKED, default OFF         — unavailable
```

**Consequence for spec §17–20: the kernel adapter must be inserted at PATH B's inputs, or PATH B
must first be migrated onto PATH A.** Replacing `geometry-kernel/src/producers/wall.ts` with an
OCCT-backed producer would change nothing a user sees, because `WallFragmentBuilder` does not call
it. Sizing that migration is a prerequisite of any kernel decision — it is 9 fragment builders and
~544 files of `geometry-*`, not a swap.

**P2 nuance that makes PATH B legal.** `tools/ga-gate/check-three-imports.ts:70-71` matches
`/^\s*import\b.*\bfrom\s*['"]three(?:\/[^'"]+)?['"]/` and explicitly allows
`'@pryzm/renderer-three'` (the barrel) and `'@pryzm/renderer-three/three'` (the namespace
sub-path) (`:30-33`). So **"single THREE owner" means "single THREE *dependency* owner", not
"single place where meshes are built."** Meshes are built in at least 9 L2 packages. That is not a
violation; it is a fact a kernel plan must not mis-read.

---

## §2 WHAT IS REUSABLE FOR A UNIVERSAL PARAMETRIC COMPONENT EDITOR — AND HOW

Ordered by leverage. **"How" is stated concretely so a plan can cost it.**

### §2.1 REUSE, DO NOT RE-INVENT: `.pryzm-family v1` as the ComponentDefinition format

**`packages/file-format/src/family-schema.ts` is already ~70% of the spec §77 Phase-1 canonical
model.** The spec's §81 item 4 ("proposed canonical data model") should be written as a **DELTA
against this file**, not from scratch.

*How:* keep `formatVersion: '1.0'` and add the missing axes through the existing
`family-migrations/` framework (`migrate-family.ts` already bumps + validates). The gaps to close
are enumerated in §3 below. **⛔ Do not mint a rival `ComponentDefinition` schema** — spec §1 and
C74 §2.2 ("one owner per rule set") both forbid it, and this repo has already deleted one
byte-near rival (`StairValidationAuthority`, 2026-08-13) for exactly that reason.

⚠ One structural decision must be taken consciously: today `FamilyCategorySchema` is a closed
enum of **8** categories (`Door, Window, Furniture, Casework, Fixture, Lighting, Plumbing,
Generic`) while spec §61 lists **17** creation categories (Wall, Floor, Roof, Ceiling, Curtain
Wall, Column, Beam, Stair, Railing, Equipment, MEP Component, Custom System …). The format
currently cannot name a wall or a stair family. Widening that enum is the single smallest change
that makes `.pryzm-family` universal — and it is a `formatVersion` question, so it belongs in the
contract phase, not in code.

### §2.2 REUSE: the `producer → BufferGeometryDescriptor → committer` seam as THE kernel adapter slot

This is the answer to the lane's decisive question. *How:*

```
canonical FamilyDocument
  → parameter resolution        (@pryzm/family-runtime — EXISTS)
  → profile evaluation          (⛔ needs a real solver — §3.2)
  → GEOMETRY ADAPTER            (⛔ the new seam; today `produceExtrude` is called directly)
  → kernel (OCCT-WASM | native producers | manifold)
  → tessellation
  → BufferGeometryDescriptor    (FROZEN, ADR-009 — EXISTS)
  → committer → THREE           (EXISTS, 20 committers)
```

The **only new interface** is the adapter. `bakeFamilyInstance.ts:70-90` is where it goes: today
that function `switch`es on `SolidFeature.kind` and calls `produceExtrude` directly, returning a
structured `unsupported-feature` for the other three. Replacing that switch with an injected
`GeometryAdapter` port keeps the canonical model kernel-agnostic exactly as spec §20 requires,
and the existing `UnsupportedSolid` refusal shape becomes the adapter's "this kernel cannot do
that" channel — spec §73's `GeometryStatus = Invalid` with **structured diagnostics, already
typed** (`reason: 'unsupported-feature' | 'profile-eval-failed' | 'invalid-length'`).

### §2.3 REUSE: `ElevationOutlineSurface` as the universal 2-D sketch canvas

`apps/editor/src/ui/ElevationOutlineSurface.ts` is **already the shared surface for three callers**
and already carries: the metres↔pixels dimensional contract, vertex drag with snap, midpoint
insert, delete-with-guard, `refitTo`, polyline mode, 3-click arc mode, presets, absolute ortho, and
the "⛔ no store / no bus / no THREE / no rAF, hand rings to callbacks" separation.

*How:* generalise its **subject** from `WallProfileVertex[]` in a `(u,v)` extents box to a
`Profile` (`family-schema.ts:160-166`) on a `ReferencePlane`, and add a constraint-glyph layer.
It is ~389 lines and it is REACHABLE IN PRODUCTION TODAY, which the component-editor's
`SketchCanvas.ts` is not. **Prefer this one.** Its callers already prove the §12 pattern
(`WindowOutlineEditorDialog` edits ONE placed instance's ring at that instance's real size).

Complement it with the L2 model it already reads — `@pryzm/geometry-wall/outline-authoring`:
`outlinePlacePoint` (ortho ruling), `outlineArcSegment`, `normaliseOutlineToUnit` /
`denormaliseOutline` (a size-independent ring), `outlineRectangle`. That module is the honest
starting point for a generic `SketchModel`.

### §2.4 REUSE: `@pryzm/family-runtime` as the §9–§11 parameter/expression engine

Tokenizer + parser + evaluator + **unit-coercion** + `resolveParameter`, pure-Node, span-emitting,
already charter-bound to serve *"the family editor, the bake-worker and the AI worker"*. That is
spec §5's single-model-three-surfaces rule already implemented at the parameter layer.
*How:* extend its function library (`expression/functions.ts`) and add the derived-property scope
(§8) and dependency-cycle detection (§11) — **do not** adopt `@pryzm/expr-eval` (a smaller S25
evaluator whose own description says *"NO constraint solver"*) or `@pryzm/formula-library` (a
read-only catalogue for plugin-SDK exposure, ADR-027) as the engine. Three expression evaluators
already coexist; a fourth would be the exact §1 violation.

### §2.5 REUSE: the kernel's determinism apparatus, wholesale

- **`compose*GeometryHash` + `*_HASH_SCHEMA_VERSION`** is exactly spec §72's cache identity
  (*"canonical definition hash + parameter state + kernel version"*). The `SCHEMA_VERSION` suffix
  is already the "kernel version" term. `composeExtrudeHash` / `composeBooleanHash` show the
  pattern applied to generic features, not just element families.
- **`tolerance.ts` + `check-epsilon-policy`** answers spec §17's tolerance question without a new
  policy. C73 §2.5 / gate E4: **a declared tolerance's value may only shrink or stay** — a
  widening is a contract violation.
- **`assertValidDescriptor` / `DescriptorInvariantError`** is a ready-made "the geometry a feature
  produced is structurally invalid" refusal, with named invariants (unit normals within 1e-5,
  index in range, group counts sum to index length, finite everywhere, non-empty hash).
- **`check-deterministic-regeneration`** (D1: regenerate twice → byte-identical; D2: shuffle
  iteration order → byte-identical) is the spec §66 *"no stale derived geometry may overwrite
  newer state"* test, already written as a gate. ⚠ It is **currently RED at 137/134** (C73 §5
  banner) — a ratchet breach, and per `§RATCHET-EXCEEDED-IS-NEVER-DEBT (R7)` never absorbable.

### §2.6 REUSE: booleans — but know which one

- **3-D:** `KernelCSG` (manifold-3d WASM) + `produceBoolean`. Real, tested against a 30-shape pair
  suite, THREE-free, lazily loaded. **This is a working §57 "Solid → boolean ∪/−/∩" tool group
  backend today.** Its operand type is triangle soup, so it composes with anything that can
  tessellate — including a future OCCT adapter's output.
- **2-D:** `polygonBoolean2D` — **intersection and union ONLY**. Difference is refused by design
  (`index.ts:139-141`). A profile-level "subtract this ring" needs either the oracle-pinning work
  that unlocks difference, or a 3-D boolean after extrusion.

### §2.7 REUSE: the 2-D output stack for the §21 plan/elevation/section representations

`packages/drawing-primitives` (`Primitive` stream + 4 backends + the C29/C24 sheet layer) already
separates *what to draw* from *where it lands*. Combined with the kernel's
`produceSectionCut`, `projectWallEdges`, `computePocheFills`, `hidden-line/classifier` and
`classifierToPrimitives`, **a component's plan/elevation/section representation can be DERIVED
rather than authored** — the spec §21 requirement — for anything that produces a mesh.
*How:* a component's derived views become `descriptor → produceSectionCut / projectWallEdges →
classifierToPrimitives → PrimitiveStream`, and the `*PlanSymbolBuilder` family becomes the
*override* path (an authored symbol) rather than the only path.

### §2.8 REUSE: `view-resolution/` as the §28 semantic-visibility evaluator

`classifyElement` / `evaluateCondition` / `resolveElementInstructions` / `ResolvedViewRange` is a
pure, tested implementation of *"visible when <condition>"* per element per view. Together with
the family schema's per-solid `lod: {coarse, medium, fine}` this covers spec §28's
*"visible when DetailLevel ≥ Fine"* without inventing anything.
`selectActiveRepresentation` (`producers/furniture.ts:43-61`) additionally shows the
**representation fallback ladder** pattern — request LOD *n*, walk a declared preference order,
return `undefined` rather than an empty mesh.

### §2.9 REUSE: the compound-element precedent for §25 nesting

`geometry-balcony` (C103/ADR-0333 — cantilever slab + floor finish + railing runs from ONE
polygon), `geometry-pool` (ADR-0124 — hole + walls + floor slab + water), `geometry-lift`
(C104 compound system) and `packages/family-instance`'s *"one descriptor per solid, in document
order"* are four independent precedents for **one authored object producing many sub-solids with
inherited parameters**. C104 / C103 are the contracts to read before designing §25 nesting.

### §2.10 REUSE: the honest-scaffold and refusal patterns themselves

This repo has a *codified* way of shipping an unfinished capability without lying about it, and a
universal editor will need it constantly (spec §75):
- **C74 §3.4 SCAFFOLD DECLARATION** with a **retiring assertion** — a test that goes RED when the
  real thing lands, forcing the header and the stub to be removed in the same change
  (`familyCreatorPlaceholder.ts:29-41`).
- **`refuseUnbacked` / `applyCommandBacking`** — a toolbar button that refuses by name when no
  handler is registered (`apps/editor/src/ui/toolbar/FamilyToolbar.ts`).
- **Refusal-with-both-numbers** — `FilletTool`'s `§FILLET-SEGMENT-BOUNDS` refuses and *quotes the
  measured distance past each end*; `WindowOutlineEditorDialog` shows the predicate's own `reason`
  (C16 CA-18) and keeps the dialog open. This is spec §45's structured-diagnostic loop, already
  the house style.

---

## §3 WHAT IS GENUINELY MISSING

Each item is evidenced by a **search that returned nothing**, quoted.

### §3.1 EXACT GEOMETRY / B-Rep — absent, and absent by omission, not by decision

```
$ grep -rn --include=*.ts -l "opencascade|occt|OpenCascade|B-Rep" packages apps plugins
(no matches)
$ grep -rn --include=*.ts -l "NURBS" packages apps plugins
packages/file-format/src/import/rhino/RhinoImporter.ts      # ":15  NURBS → tessellated mesh"
$ grep -rn --include=*.ts "BRep" packages apps plugins
packages/core-app-model/src/drawing/HiddenLineRemoval.ts:118:  *   ❌ BRep/CSG — not used
packages/core-app-model/src/drawing/DrawingPipelineWorker.ts:23:  *   ❌ No BRep/CSG
packages/core-app-model/src/presentation/ViewRangeZoneApplicator.ts:277:  // (requires BRep cross-section geometry — deferred).
```

There is **no ADR rejecting a kernel** and no ADR adopting one. The absence is a default, not a
ruling — which means spec §77 Phase 2 (technology investigation) has a clean slate and **no prior
decision to overturn.** ⚠ Note what a kernel would *break*: `BufferGeometryDescriptor` is frozen
by ADR-009 and `check-deterministic-regeneration` D1/D2 demand **byte-identical** regeneration.
A WASM kernel's tessellation must therefore be deterministic across the browser/Node split the
kernel's runners already promise — C73 §5.4(b) already flags cross-machine determinism as
**UNPROVEN** even for the current pure-TS producers.

### §3.2 A REAL CONSTRAINT SOLVER — the single hardest blocker

```
$ grep -rn "planegcs" packages/constraint-solver/src
src/PlanegcsAdapter.ts  →  kind='mock', intendedEngine='planegcs'
```
and the package's own description: *"**No real planegcs binding exists in this repo, and none is
authorised until C74 §4.2(c) is answered** for a named constraint family (C74 §4.5)."*

Consequences, all stated in-code:
- `profileToPolygon.ts:11-16` — a profile may only be points; *"Lines / arcs / circles / splines
  and full constraint solving are deferred to S57."*
- `bakeFamilyInstance.ts:16-21` — sweep/loft/revolve are refused because *"Lighting up these
  producers requires the constraint solver (S57) so that path and section profiles can be
  evaluated."*
- The persisted format can express **12** constraint kinds; the solver implements **5**; the spec
  wants **14**.

**This is the item on the critical path.** Nothing in spec §13 (progressive parametrisation),
§14–15 (constraints/design intent), §64 (*"make both side frames equal"*) or §68 (the constraint
test) can be honestly delivered until it is answered — and answering it is *governed*, not merely
technical: **C74 §4.2(c) must be answered for a named constraint family before any binding is
authorised.**

### §3.3 A FEATURE / HISTORY GRAPH (spec §16) — absent

```
$ grep -rn --include=*.ts "FeatureGraph|featureGraph|GeometryStatus" \
      packages/geometry-kernel/src packages/schemas/src packages/file-format/src apps/component-editor/src
(0 hits for each)
```

`FamilyDocument.solids` is a **flat array** (`family-schema.ts:249`), evaluated *"in document
order"* (`bakeFamilyInstance.ts:8`). There is:
- no dependency edge between features,
- no per-feature provenance or validation state,
- no `GeometryStatus`,
- **no boolean/cut feature at all** in `SolidFeatureSchema` — the union is
  `extrude | sweep | loft | revolve`, so a window family literally cannot express
  "frame minus glazing void" as a feature even though `produceBoolean` exists,
- no incremental / dirty-subgraph recomputation (spec §71).

### §3.4 3-D MODIFY AND PATTERN FEATURES — absent

```
$ grep -rn --include=*.ts "produceFillet|produceChamfer|produceShell|produceThicken|producePattern|produceArray" \
      packages/geometry-kernel/src
(0 hits for all six)
```

Spec §57's **Solid** group asks for *shell, thicken, pattern, array* and its **Modify** group for
*offset, trim, extend, fillet, chamfer, join, split*. What exists:
- `offsetPolygon` — **2-D only** (`§W2A-ONE-OFFSET`), the one canonical implementation.
- `FilletTool` — **2-D sketch only**, in the unshipped SPA, and honest that it *"commits the ARC
  ONLY … `trimLine` has never been called from this file, so both segments keep their full
  length"*.
- `TrimTool` — 2-D sketch only, same app.
- Nothing at all for chamfer, shell, thicken, pattern or array, in 2-D or 3-D.

### §3.5 TOPOLOGY AND STABLE FACE/EDGE REFERENCES (spec §20) — one 2-D instance only

The only topological structure in the repository is a **planar 2-D half-edge graph** for room
detection: `packages/geometry-kernel/src/producers/room.ts:4` — *"Algorithm: topological half-edge
graph flood-fill from a user-supplied [seed]"* — plus `pure/planarFaceWalk.ts` and its consumer
`packages/auto-dimension/src/perimeter.ts`. There is **no 3-D topology**, and therefore no
face/edge references at all — which incidentally means spec §20's prohibition (*"no canonical
`Face 381` references … if a reference becomes ambiguous: FAIL CLOSED"*) is currently satisfied
**vacuously**. It becomes a live risk the moment a kernel is adopted.

### §3.6 THE UNIVERSAL EDITOR ITSELF IS UNREACHABLE — the gap is DELIVERY, not design

`apps/component-editor` (5,918 LoC) has no CI job, no deploy target, no route, and no entry in any
build. `grep -rn "component-editor\|family" .github/workflows/*.yml` returns **zero references to
the app** (only unrelated NFT/deploy-marker prose). Its `package.json` declares `test` but **not
`test:ci`**, so `pnpm -r run test:ci` — the repo's per-workspace CI test command — **skips it
silently**: its own five quality gates (`no-three`, `no-react`, `loc-cap`, `bundle-budget`,
`a11y`) do not run in CI either. `plugins/family-editor` is a 27-line stub. The main editor's
Component / Generic Component create-rail buttons open a modal that *"creates no family"*.
**The nearest thing to the spec's target already exists and nobody can open it.** Per its own
scaffold declaration, *"treat S58 as UNSCHEDULED until `apps/component-editor` has a deploy
target."*

⚠ Corollary for spec §62 (*"the existing Window Editor is the first migration/proving ground"*):
the surface that actually ships and must keep working (§76 gate J, §74 regression) is
**`ElevationOutlineSurface` + `WindowOutlineEditorDialog` + `WallProfileEditor` + `OpeningProfile`**
— NOT `apps/component-editor`. Migrating the SPA is a *second*, independent question.

### §3.7 THE BROWSER RUNS NO KERNEL-BACKED GEOMETRY AT ALL

See §1.10. `bootstrap.render.everything.ts` is the only constructor of committers, it is reached
only through `SceneBootstrap.bootstrapScene`, and `src/main.ts:421` boots `canvas: null` → the
idle path. **The entire descriptor pipeline is dark in the editor.** Any plan that says "a
component's geometry flows through the kernel to the viewport" is describing a pipeline that must
first be turned on — which is a large, separate PRYZM-3 migration, not a component-editor task.

### §3.8 Smaller, named gaps

| Gap | Evidence |
|---|---|
| 2-D polygon **difference** | `index.ts:139-141` — *"difference (A \ B) is deliberately NOT delivered, because it is not oracle-pinned"* |
| `sweep`/`loft`/`revolve` not exported | `index.ts:364` comment only; zero non-test references |
| Roof-form refusal not surfaced | `index.ts:151-162` — *"`canProduceRoofForm` has NO CALLER today"* |
| Single-volume CSG wall | `OpeningProfile.ts:33` — *"F single-volume CSG → PARKED, default OFF — unavailable"* |
| Curved-wall openings | `OpeningProfile.ts:32` — arm **D ⛔ REFUSES** |
| Family bake job unfed | `RebakeFamilyInstanceJob.ts:15-17` — *"will start emitting `family.instance.placed` events after S56 D4 lands"* |
| Poché on section | `ViewRangeZoneApplicator.ts:277` — *"requires BRep cross-section geometry — deferred"* |
| Kernel worker runners | only caller is `tests/parity/wall/wall-headless-node.test.ts` |
| C73 §5.4 blind spots | correctness of the surviving canonical body **(a)**; cross-machine determinism **(b)**; GPU-side geometry **(c)**; *"no gate asserts refusal reachability at the UI"* **(d)**; tolerance appropriateness **(e)** — all **UNPROVEN**, by the contract's own words |

---

## §4 TRAPS — what a newcomer will trip over

**T1 — `geometry-kernel` is L2 or L4 depending on which file you read.**
`CLAUDE.md` puts it at **L2**; `packages/geometry-kernel/package.json` and `src/index.ts:3` both
say **"L4 of the architecture stack"**. The authority for layering is
`tools/ga-gate/check-layer-boundaries.ts`, which reads workspace `package.json` paths — not either
prose. **Run the gate; do not quote either header.** (Same class of defect as L-809.)

**T2 — `WallPipelineV2`'s own header contradicts its own code about the default.**
`WallPipelineV2.ts:17` — *"Defaults to OFF"*.
`WallPipelineV2.ts:222-224` — `return (globalThis as {…}).__pryzmWallPipelineV2 !== false;`
i.e. **default ON**. `WallFragmentBuilder.ts:53` and `:4515` both say *"default ON since
2026-05-27"*, and they are right. **The ADR-0055 Pascal pipeline IS the shipping wall geometry.**

**T3 — "single THREE owner" (P2) does NOT mean "one place builds meshes".**
`tools/ga-gate/check-three-imports.ts:70-71` matches only
`/^\s*import\b.*\bfrom\s*['"]three(?:\/[^'"]+)?['"]/` and explicitly permits
`'@pryzm/renderer-three'` and `'@pryzm/renderer-three/three'` (`:30-33`). Nine L2 `geometry-*`
packages import THREE through that sub-path and build `THREE.BufferGeometry` directly. That is
legal and intended. A kernel plan that assumes mesh construction is centralised is wrong.

**T4 — the kernel has TWO dimension systems, and they are different subjects.**
`index.ts:293-299`: `produceDimension` / `analyseDimension` build THREE body-mesh primitives for
first-class 3-D Dimension *elements*; `produceDimensions` / `evaluateDimensions` operate on the
`DimensionString` schema for the headless plan-view **auto-dim** pipeline. Pluralisation is the
only difference in the names.

**T5 — `@pryzm/constraint-solver` contains two unrelated "constraint engines".**
The geometric one is `engine.ts` + `types.ts` + `PlanegcsAdapter.ts` (a **mock**).
`ConstraintEngine.ts`, exported as `@pryzm/constraint-solver/compliance`, is *"the REAL advisory
rule registry"* — **building-code compliance**, not geometry. `stair-constraint-engine.ts` and
`LevelTraversalPolicy.ts` are a third thing again. Naming a "constraint" here is ambiguous;
always say which.

**T6 — THREE files are named `familyCreatorPlaceholder.ts`, two of them still live.**
`apps/editor/src/familyCreatorPlaceholder.ts` (128 lines, the real "under construction" modal,
reached from `ui/tools-panel/panels/CreateRailPanel.ts:1105`) and
`apps/editor/src/ui/familyCreatorPlaceholder.ts` (10 lines, a bare `console.log`, reached from
`ui/layout/CreatePanelLayout.ts:350`). The third (`src/familyCreatorPlaceholder.ts`) was deleted
2026-08-15 as dead. The surviving header warns about exactly this confusion.

**T7 — "the Family Creator" names three different artefacts.**
`apps/component-editor` (the real SPA, 5,918 LoC, undeployed) ·
`plugins/family-editor` (a 27-line `console.info` stub) ·
`apps/editor/src/ui/toolbar/FamilyToolbar.ts` + the four `Family*Panel.ts` files (chrome bound to
commands that may have no handler). Establish which one a statement refers to before believing it.

**T8 — a `.pryzm-family` "supports" sweep/loft/revolve in the SCHEMA and refuses them at BAKE.**
`SolidFeatureSchema` validates all four kinds; `bakeFamilyInstance` returns
`UnsupportedSolid{reason:'unsupported-feature'}` for three of them. Reading the schema as a
capability inventory is the §75 mistake in reverse. **The refusal is correct behaviour — do not
"fix" it by silently substituting an extrude.**

**T9 — `OpeningProfile.openingOutline` is BINDING, and re-deriving an arc is a contract breach.**
C86 §10.1 PR-1, quoted in `OpeningProfile.ts:14-18`: *"every wall-body arm consumes the outline
THIS function returns. ⛔ No arm may re-derive an arc … Two arms that each sampled their own circle
would disagree in the 4th decimal and the frame would not fit the hole it was cut from."*
Also PR-2: **`rectangular` must stay byte-identical on every arm** — every consumer must take its
pre-existing path when `isRectangular` is true, and the gasket for a rectangle must never be
emitted.

**T10 — do not write a second polygon offset, point-in-polygon, segment intersection,
point-to-segment or triangulation.** Each is canonical, §-tagged and **gated**
(`check-offset-implementations.ts`, `check-predicate-canonical.ts`,
`check-triangulation-canonical.ts`, `check-epsilon-policy.ts`). C73 §0.2 is literally titled
*"The same predicate, sixty-one times"*. The point-in-polygon ratchet was pinned at **61**
non-canonical bodies.

**T11 — do not invent an epsilon.** `check-epsilon-policy` E3 hard-fails a new or modified
geometric predicate that does not import the declared tolerance; **E4 hard-fails a tolerance
whose value WIDENS.** Ratchet E2 (literals declared outside the module) was pinned at **267**.

**T12 — a ratchet breach is never absorbable as debt.** `check-deterministic-regeneration` was
read at **exit 3 (137/134)** (C73 §5 banner). Per `§RATCHET-EXCEEDED-IS-NEVER-DEBT (R7)` / L-836,
adding a `gate-debt.json` entry to swallow an exit-3 is the one forbidden fix.

**T13 — C73 §5's build-status headings were FALSE and are corrected by a banner above them.**
§5.1/§5.2/§5.3 are each headed *"~~SPECIFIED, NOT BUILT~~"*; **all three gates exist and run**
(215 KB of shipped enforcement). The contract itself warns: *"a roadmap or status document reading
these headings would report three unbuilt gates and schedule work to build them — duplicating
215 KB of shipped, running enforcement."* Logged as **L-954**. **Run the gate; read its exit code.**

**T14 — `grep -c requestAnimationFrame`-style counting reproduces documented defects.**
Two precedents inside Lane B's scope: the P3 gate counted comment lines until
`§RAF-GATE-COMMENT-BLIND`; `check-geometry-ceiling.ts` shelled out to `rg`, which is not installed,
so **ENOENT and a real violation produced the same exit code** while the gate sat on
`gate-debt.json` — *"MISSING PREREQUISITE and CLEAN CODE produced the same observable state"*
(§FIX-GATE-NEEDS-RIPGREP, L-811). Read what a gate scans before quoting its number.

**T15 — `check-three-imports` is not the only THREE-related rule.**
`packages/eslint-plugin-pryzm` also ships `no-three-in-kernel` (kernel tree: no `three`,
`@thatopen/*`, `web-ifc*`) and a "three-outside-committer" lint fixture pair. Three separate
mechanisms, three different scopes.

**T16 — the descriptor's `hash` is load-bearing and schema-versioned.** Every producer's hash has
a `*_HASH_SCHEMA_VERSION`. Changing a producer's output without bumping it makes a new geometry
hash-identical to an old one — precisely the failure `produceRoof` fixed by *"folding the
substitution into the geometry hash, so a degraded roof can no longer be hash-identical to a
faithful one"* (`index.ts:157-160`).

**T17 — `WallFragmentBuilder.ts` is ~4,800+ lines and is the true wall geometry authority.**
It carries at least a dozen §-tags that a newcomer will otherwise re-discover the hard way:
`§FIX-WALL-VERSION-CONTENT-HASH` (L-52, conditional version bump so the plan-projection cache
stays valid), `§NME-VERSION-FIX`, `§INSTANCE-MAT-SHARE` (per-colour material cache — without it
1,065 walls became ~1,065 draw calls), `§GPU-RESOURCE-LIFETIME` (ADR-0297 — *"DETACH now, RELEASE
at the boundary"*), `§WALL-Y-DATUM` (L-968 — this builder is the ONE writer of the wall base
plane), `§WALL-PLAIN-HOLE-EXTRUDE`, `§FEAT-WALL-PROFILE-BODY` (L-1067). Read the header before
touching wall geometry.

---

## §5 THE DECISIVE ANSWER, RESTATED FOR §81

> **Is PRYZM mesh-first today, and where exactly is the boundary a kernel adapter would slot into?**

**PRYZM is *triangle-only* but *parameter-authored*.** Its single geometric representation is a
triangle-indexed `BufferGeometryDescriptor` frozen by ADR-009; there is no exact geometry, no
B-Rep, no NURBS, no 3-D topology. But no mesh is ever authoritative: every mesh is regenerated
from a semantic DTO through a pure, deterministic, content-hashed producer, and two GA gates
(`check-deterministic-regeneration`, `check-predicate-canonical`) exist to keep it that way. Spec
§2's *"never a mesh-first system with BIM metadata attached after"* is **already satisfied**;
spec §20's exact-geometry stage is **simply absent**.

**The adapter slot is `producer → BufferGeometryDescriptor`**, and more precisely, for components,
it is the `switch (solid.kind)` inside
`packages/family-instance/src/bakeFamilyInstance.ts`. Everything downstream — descriptor
invariants, material keys, content hashing, the committers, the scene registry, the bake worker's
content-addressed chunking — already exists and is kernel-agnostic. Everything upstream —
`FamilyDocument` → `family-runtime` parameter resolution → `Profile` evaluation — already exists
except the **profile evaluator**, which needs the constraint solver that C74 §4.2(c) has not yet
authorised.

**Two structural facts must be carried into every downstream phase:**
1. **The browser does not run this pipeline.** Committers are never constructed
   (`src/main.ts:421` `canvas: null`); the shipping editor draws through the `*FragmentBuilder`
   family, which bypasses the descriptor entirely. A kernel adapter behind the descriptor is
   correct architecture **and invisible to users** until that migration lands.
2. **The universal editor already exists as 5,918 undeployed lines**, and the *shipping*
   proving-ground for spec §62 is `ElevationOutlineSurface` + `OpeningProfile` +
   `WallProfileEditor`, not `apps/component-editor`.
