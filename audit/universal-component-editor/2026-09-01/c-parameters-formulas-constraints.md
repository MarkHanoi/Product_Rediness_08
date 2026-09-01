# LANE C — PARAMETERS · FORMULAS · CONSTRAINTS · UNITS
### Repository archaeology for STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC §77 PHASE 0

**Lane scope:** master spec §4.3, §8–§15 (parameters, units, expressions, parametric-after-placement,
progressive parametrisation, constraints, design intent).
**Date:** 2026-09-01 · **HEAD at measurement:** `6e15af2f` · **Rule obeyed:** §1 — nothing was coded,
no production file was modified.

> ## HEADLINE ANSWER TO THE LANE QUESTION
>
> **1. A typed expression engine already exists and is production-quality: `packages/family-runtime`.**
> Unit-tagged literals, recursive-descent parser (no `eval`), 12 built-ins, Kahn topological sort with
> real cycle detection, `instance > type > default > expression` precedence, 14 typed diagnostic codes,
> OTel spans. It was written in S55 for the Family Creator; **the Family Creator never shipped**, so it is
> reachable only from `apps/bake-worker`, never from `apps/editor`. **Spec §11 is ~70 % already built.**
>
> **2. The constraint-solver is BOTH a dead end and a foundation — because it is two unrelated
> subsystems sharing one package name.** The *solver* half (5 constraint kinds, `MockSolver`, no
> `planegcs` dependency anywhere) is a dead end **by contract**: C74 §4.5 forbids building it until a
> named constraint family is proven to need SOLVING. The *advisory* half (`ConstraintEngine.ts`, 836 LOC
> at the `./compliance` subpath) is wired into nine live consequence planners and the AI host, and is the
> most reachable constraint machinery in the repo.
>
> **3. The largest reusable asset in the lane is `apps/component-editor` — 89 files of parametric
> sketcher, constraint tools, reference planes and an AI bridge — which the product cannot reach.**
> `apps/editor` routes "Create → Component" to a modal that says *"under construction"*.

**Fraction of spec §9–§15 with a real implementation: roughly 45 %** — itemised in §5 with the evidence.

---

# §1 — WHAT EXISTS

## 1.1 ⭐ `packages/family-runtime` — THE typed expression engine (spec §11)
### REAL · TESTED · NOT REACHABLE FROM THE MAIN EDITOR

| | |
|---|---|
| **Authority files** | `packages/family-runtime/src/expression/{tokenizer,parser,evaluator,unit-coercion,functions}.ts` + `src/resolution/resolveParameter.ts` |
| **Governing doc** | `docs/00_NEW_ARCHITECTURE/phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §7.5, cited in every file header. **No C-contract governs it** — see §3.1, this is a real gap. |
| **Size** | 1,610 LOC incl. 5 test files. `"dependencies": {}` — genuinely pure. |
| **Maturity** | Production-shaped: typed errors, span emission, no `eval`, no string substitution. |
| **Reachable?** | **PARTIALLY.** `apps/bake-worker/src/jobs/RebakeFamilyInstanceJob.ts:88` → `loadFamilyFromBytes` → `bakeFamilyInstance` (`packages/family-instance/src/bakeFamilyInstance.ts:136`) → `resolveParameter`. Also `packages/family-loader/src/loadFamily.ts:149` as a load-time pre-flight. **Zero importers anywhere in `apps/editor`.** |

### What it implements, measured against spec §9–§11

**Grammar** — `expression/parser.ts:5-17`, recursive descent, no `eval`, no `Function()`:

```
expr     := compare
compare  := addsub (CMP addsub)?      // single-comparison only
addsub   := muldiv (('+' | '-') muldiv)*
muldiv   := unary  (('*' | '/') unary )*
unary    := '-' unary | call
call     := IDENT '(' args? ')' | primary
primary  := NUMBER | IDENT | '(' expr ')'
```

The AST is a 6-arm discriminated union (`parser.ts:29-35`): `number | ident | neg | arith | cmp | call`.

**Unit-tagged numeric literals** — `tokenizer.ts:13` `export type Unit = 'mm' | 'm' | 'deg' | 'rad'`.
`unit-coercion.ts:38 toCanonical()` normalises at the **literal**, at tokenise time, so
`5 m + 200 mm` → `5200` mm. From the header (`unit-coercion.ts:14-17`):

> *"Mixing units inside an expression is fine — the literal converter runs at tokenise time, not at
> parameter-assignment time, so `5 m + 200 mm` resolves to `5200` mm cleanly."*

This is genuinely correct mixed-unit arithmetic, not coincidentally correct.

**12 built-in functions** — `functions.ts:26-45`: `min max if sin cos tan sqrt abs round floor ceil pow`.
Arity is range-checked at eval (`evaluator.ts:152-159`) against the function table as single source of truth,
and `lookupBuiltin` returns `null` rather than throwing *"so the evaluator can produce an
`unknown-function` diagnostic with the AST position context"* (`functions.ts:48-50`).

**Typed diagnostics — spec §45's "structured diagnostics" requirement, already met at the parameter layer.**
6 eval codes (`evaluator.ts:23-29`): `unknown-identifier · unknown-function · arity · div-by-zero ·
non-finite · parse`. 8 resolver codes (`types.ts:92-100`) add: `cycle · expression-parse ·
expression-eval · invalid-default · invalid-override · duplicate-name · invalid-name`.

**Circular-dependency detection** — a real Kahn topological sort (`resolveParameter.ts:88-125`).
Note the design quality: parameters *inside* a cycle get an `error` diagnostic, and **everything not in
the cycle still resolves**, so an editor can render useful values mid-edit. Header, `:10-15`:

> *"Cycle detection is performed at edit time (not save time) … Resolution proceeds for every parameter
> NOT involved in a cycle so the editor can still render useful values mid-edit."*

**Scope precedence** — `resolveParameter.ts:1-2` and `:130-176`:
`instance > type > family default > expression`. This maps directly onto spec §6's
`ComponentDefinition → ComponentType → ComponentInstance` and onto spec §12's ordering — **with one
inversion that is a genuine latent defect: see §4 TRAP-1.**

**Sandboxing** — `evaluator.ts:5`: *"Pure, sandboxed: no global access, no I/O, no DOM, no THREE."*
Verified by reading `walk()` (`evaluator.ts:103-168`): its only free variable is the injected
`EvalScope = Readonly<Record<string, number>>`. **Spec §11's "No unsafe arbitrary string substitution"
is satisfied outright.**

**Observability** — every evaluation emits `pryzm.family.parameter.evaluate` with the expression source
and identifier list as attributes; every resolution pass emits `pryzm.family.bake.resolveType`
(`resolveParameter.ts:178-192`). P8-compliant by construction.

### The parameter object (`family-runtime/src/types.ts:31-42`)

```ts
export interface FamilyParameter {
  readonly id: string;
  readonly name: string;
  readonly kind: FamilyParameterKind;        // 'type' | 'instance'
  readonly dataType: FamilyParameterDataType; // length|angle|number|count|boolean|string
  readonly defaultValue: number | string | null;  // canonical units (mm / rad)
  readonly expression: string | null;
  readonly ifcMapping: IfcMapping | null;    // { psetName, propertyName }
  readonly exposed: boolean;
}
```

Against spec §9's eleven demanded fields it already carries: **identity · name · datatype · unit
(via `dataType`) · default · formula · scope (`kind`) · visibility (`exposed`)** — 8 of 11.
**Missing: semantic meaning/classification · constraints · provenance.** See §3.

## 1.2 `packages/formula-library` — a formula CATALOGUE, not an expression engine
### REACHABLE via plugin SDK + api-gateway

- **Authority:** `packages/formula-library/src/{types,catalog,builtins,index}.ts` — 769 LOC incl. tests.
- **Governing docs:** ADR-027, ADR-0044 §A. Served at `GET /v1/formulas` and `GET /v1/formulas/:id`
  (`src/index.ts:6-7`).
- **Shape:** an immutable frozen registry of 12 named pure functions. `FormulaDescriptor`
  (`types.ts:41-52`) = `id · name · description · signature · version` where `version` is
  *"Pinned semver — bumped on any signature change"*. A 3-value type system
  (`types.ts:26 'number' | 'array<number>' | 'string'`) and three typed errors
  (`FormulaNotFoundError · FormulaArgumentError · FormulaArityError`, each carrying `formulaId`,
  `paramIndex`, `expected`, `received`).
- **What it is NOT:** it parses nothing. `invoke(id, args)` is lookup + arity/type check + call.
  Its own header (`types.ts:14`) says plugins call formulas *"without going through the expr-eval
  interpreter"* — it is deliberately the **non**-parsing sibling.
- **Reuse value for §11:** it is exactly the right shape for the **user-extensible function table** the
  family-runtime evaluator currently lacks — `functions.ts:26` hardcodes its 12 builtins in a frozen
  object literal with no registration path.

## 1.3 `packages/expr-eval` — a THIRD expression evaluator

`packages/expr-eval/src/{parser,evaluator,index}.ts`, declared in the **root** `package.json:134` as
`"@pryzm/expr-eval": "workspace:*"`. A separate lineage from `family-runtime/src/expression/`, whose
parser header (`parser.ts:6`) explicitly positions itself as *"tighter than expr-eval"*.
**Two expression engines coexist, plus `plugins/schedules/src/formula-evaluator.ts` as a third
formula path.** See §4 TRAP-4.

## 1.4 `packages/constraint-solver` — ONE package, TWO unrelated subsystems

**Governing contract: `C74-CONSTRAINT-HONESTY.md` (2026-08-12, CANONICAL, 283 lines).**
C74 is the single most important document for this lane. **Read it before proposing any constraint work.**

C74 §1.1 supplies the vocabulary the spec §14–§15 work must be written in — four *structurally different*
things this codebase calls "a constraint":

| Kind | Question it answers | Canonical example (C74 §2) |
|---|---|---|
| **VALIDATION** | *is this legal?* | `StairValidationAuthority` (riser/going/headroom) |
| **ENFORCEMENT** | *may this be committed?* | `WallOccupancyStore.canPlace()` at opening-commit |
| **ADVISORY** | *you may want to know* | the `./compliance` rule registry |
| **SOLVING** | *what geometry satisfies all of these at once?* | **nothing in this repo** |

> **C74 §1.2 — MUST NOT.** *"A constraint may not be described as needing SOLVING because it is hard,
> because it is numeric, or because it involves several elements. SOLVING is reserved for **simultaneous**
> systems with **no closed form**."*

### Half A — the SOLVER half. Honest, tiny, and by contract UNAUTHORISED to grow.

- `src/types.ts:21-25` — `ConstraintKind` has **exactly 5 members**:
  `distance-pp · parallel · perpendicular · coincident-pp · fixed`.
  Its own comment says the *"full planegcs catalogue (~30 kinds) lands incrementally at S53–S55"* —
  **S53–S55 have passed; it is still 5.**
- `src/engine.ts:93 MockSolver` — `kind = 'mock'`, projection-based iteration, and an honestly-labelled
  DOF counter: `|variables| − |constraints touching variables|`, described in its own header as
  *"the simplest possible DOF counter"*.
- `src/PlanegcsAdapter.ts` — **⭐ THE C74 HONESTY FIX HAS LANDED. Do not re-report it as a defect.**
  `:113 readonly kind: string` is now **derived from the underlying solver** (`:136 this.kind =
  this.underlying.kind ?? 'mock'`), and `:125 intendedEngine = 'planegcs'` is a **separate field so
  intent can never be read as capability**. The test-only `underlying?:` injection seam was **DELETED**
  2026-08-14 (header, "SEAM DELETED", C74 §3.5). `loadSolver()` now **throws** on
  configured-but-unbindable instead of silently returning the mock (`engine.ts:17-22`) — C74 §3.3 met.
- **`planegcs` is still not a dependency of anything.** Re-measured at HEAD 2026-09-01:
  `grep -rl '"planegcs"' --include=package.json --exclude-dir=node_modules .` → **0 files**. C74 §3.7:
  *"which settles the question without reading a line of adapter code."*
- **`createWorkerHandler` / `worker.ts` are GONE.** `ls packages/constraint-solver/src/` returns 8 files,
  none named `worker.ts`. **C74 §7 exit-condition 6 ("wired or deleted") is MET, by deletion.**

### Half B — the ADVISORY half. Large, real, and heavily wired into the live editor.

- `src/ConstraintEngine.ts` — **836 LOC, larger than the entire solver half** — exported at the
  `./compliance` subpath (`package.json:14`).
- **Production importers, measured (not test files):**
  `apps/editor/src/engine/initDataPlatform.ts:50`, plus **six** consequence-planner compositions —
  `wallCreatePlannerComposition.ts:22` · `wallMovePlannerComposition.ts:16` ·
  `wallDeletePlannerComposition.ts:57` · `wallBatchCreatePlannerComposition.ts:44` ·
  `openingMovePlannerComposition.ts:33` · `openingDeletePlannerComposition.ts:35` — and
  `packages/ai-host/src/WorldModelAdapter.ts:32` + `packages/ai-host/src/generative/LayoutGenerator.ts:35`.
  C74 §2 records it as auto-run on `StoreEventBus` with an 800 ms debounce, *"Non-blocking by construction."*
- **This is the most reachable constraint machinery in the repo. Spec §14–§15 work must build on it, not beside it.**

### Also in the package, related to neither half

`stair-constraint-engine.ts` (301 LOC — imported by `command-registry/src/plans/StairCommandPlan.ts:7`
and two stair commands), `wallRoomAdjacencyDetermination.ts` (236 LOC), `LevelTraversalPolicy.ts`.

## 1.5 ⭐ `apps/component-editor` — a whole parametric sketcher exists
### AUTHORED · TEST-COVERED · UNREACHABLE FROM THE PRODUCT

**89 TypeScript files.** `package.json:4` describes it as *"the Revit-Family-Editor analogue: 2D
parametric profile sketcher → constraint solver → 3D extrude/sweep/loft/revolve → parameter table →
typed authoring of `.pryzm-family` artefacts"*.

| Layer | Files | Spec section it serves |
|---|---|---|
| Sketch | `src/sketch/` — `SketchCanvas · sketchRender · entities · hitTest · snap · transform` + 7 tools (`Line · Arc · Circle · Rectangle · Fillet · Trim · Select`) | §57 Create/Modify tool groups |
| Constraint | `src/commands/constraint/{addCoincident,addDistance,addFixed,addParallel,addPerpendicular}.ts`, `src/sketch/ConstraintToolbar.ts`, `src/stores/constraintStore.ts`, `src/sketch/buildConstraintSet.ts`, `src/sketch/solverRunner.ts` | §14 constraints |
| Reference geometry | `src/stores/referencePlaneStore.ts`, `src/commands/referencePlane/` | §14 "reference planes/lines/points" |
| Solid | `src/stores/solidStore.ts`, `src/commands/solid/` | §4.4 / §57 Solid group |
| AI | `src/ai/{aiHostBridge,approvalQueue,toolRegistry,types}.ts` + a replay test suite | §39–§45 |
| Views | `src/stores/viewTabStore.ts` | §22 PLAN/FRONT/SIDE/SECTION/3D |
| Marketplace | `src/marketplace/{publishFlow,signing}.ts` (Ed25519) | §25 |

- **Its own composition root:** `src/app/familyEditorRuntime.ts:85 createFamilyEditorRuntime`, blessed by
  **ADR-0316** as the ONE tolerated P1 rival and *deliberately baselined rather than allowlisted so it
  stays named on every run* (`audit/element-creation/2026-08-29/cross-cutting.json:101`).
- **Quality gates it already carries:** `__tests__/quality-gates/` — `no-react · no-three · no-window ·
  a11y · bundle-budget · loc-cap`. It is architecturally clean by construction.

**⛔ REACHABILITY — the single most important negative finding in this lane.**
`apps/editor/src/familyCreatorPlaceholder.ts:11-15` is a C74 §3.4 scaffold declaration that says, verbatim:

> *"WHAT IS FAKE, stated plainly — this module is named for the Family Creator and creates no family. It is
> a DOM modal that says 'under construction' and prints a path to a plan document. Clicking 'Component' /
> 'Generic Component' in the create rail reaches a dialog, not an editor: nothing is authored, nothing is
> persisted, no `.pryzm-family` artefact exists afterwards. It is a dead-link guard wearing the name of the
> feature it stands in for."*

Its **EXIT CONDITION** (`:41-48`) is explicit and carries a milestone-honesty warning:

> *"EXIT CONDITION — `apps/component-editor` reaches standalone deploy and the create rail hands off to it
> (S58) … ⚠ MILESTONE HONESTY (C74 §4.2(c)): the 'S58' above is the PLAN's number, restated, not a fresh
> promise. The legacy `src/component-editor/` prototype was removed 2026-04-28 and no replacement has
> shipped since; **treat S58 as UNSCHEDULED until `apps/component-editor` has a deploy target**."*

Measured: `apps/component-editor` appears in **no** GitHub workflow, no `fly.toml`, and no root build
script. Its only non-self references are comments, audit JSON, and a `.claude` settings entry.

## 1.6 The `.pryzm-family` persistence + migration layer — REAL, and it already versions parameters

`packages/file-format/src/family-schema.ts` (266 LOC) is the persisted shape:
`:126 defaultValue`, `:127 expression: z.string().nullable().default(null)`, `:252 defaults: z.record(...)`.

`packages/file-format/src/family-migrations/ops/` ships **8 migration operators** — and this is
**spec §37 (versioning of definitions and types) already implemented for parameters**:

| Op | What it does |
|---|---|
| `add-parameter` | appends a parameter, optionally seeding `document.defaults[id]` |
| `delete-parameter` | removes one |
| `rename-parameter` | renames (identity-preserving) |
| `change-parameter-type` | datatype change |
| **`introduce-expression`** | **turns a constant into a formula — spec §13 "progressive parametrisation", implemented** |
| `split-type` | forks a `FamilyType` |
| `merge-material-slots` | material consolidation |
| `rebind-ifc` | re-point the `IfcMapping` |

`introduce-expression.ts:1-7` is the closest thing in the repo to spec §13:

> *"Replaces a parameter's constant `defaultValue` … with an expression source string that references
> other parameters by name. The expression itself is NOT evaluated here — that happens at bake time
> inside `@pryzm/family-runtime`."*

**⚠ It does not do what its header says.** See §4 TRAP-2.

## 1.7 Element-level parameters in the LIVE editor — a different, untyped world

The main editor does **not** use `FamilyParameter`. Its parameter path is:

- `packages/command-bus/src/commands.ts` — the `element.updateParameter` bus verb.
- `packages/command-registry/src/generic/UpdateElementParameterCommand.ts` — the generic handler.
- `packages/command-registry/src/generic/UpdateElementDimensionsBatchCommand.ts`,
  `UpdateOpeningProfileBatchCommand.ts`, `walls/UpdateWallsRakeBatchCommand.ts`,
  `stair/UpdateStairParametersCommand.ts` — family-specific parameter commands.
- `packages/command-registry/src/generic/ElementRebuildRegistry.ts` — the recompute hook.
- **Governing contracts:** C03 (schemas/commands/state), C16 (command authoring), C65 (element type
  system), C84 + the C85–C99 per-element block.

**AI already has a parameter vocabulary over this path:**
`packages/ai-host/src/intents/DimensionFamilies.ts` and `intents/PropertyVocabulary.ts` classify
`UpdateElementParameter` intents (`capabilities/ChatCommandClassification.ts`,
`capabilities/ChatCapabilityRegistry.ts`). **This is spec §45's "distinguish a value change from a rule
creation" seam — the value-change half exists; the rule-creation half does not.**

**These element parameters are plain typed fields on Zod element schemas. They have no unit type, no
formula, no dependency graph, and no scope hierarchy.** The gap between §1.7 and §1.1 is the central
architectural fact of this lane, and it is stated as §3.2.

## 1.8 The E1b declarative rule evaluator — a SECOND typed evaluator, newly landed

`packages/site-parcel-data/src/rulepacks/declarative/` — `evaluateDeclarative.ts` ·
`factVocabulary.ts` · `deriveC58Contract.ts` · `esBarcelona20aAillada.decl.{ts,json}`.
**Governing contracts: C58 (zoning rules & buildable envelope), C64 (envelope compiler).**
Assessed in §2.4 — it is the closest existing thing to a **typed fact vocabulary + JSON-Logic carrier**,
and it answers a different half of spec §11 than family-runtime does.

---

# §2 — WHAT IS REUSABLE, AND HOW

## 2.1 ⭐ THE BIGGEST REUSE INSIGHT OF THIS LANE

**PRYZM has built the two halves of a parametric component editor and has never joined them.**

| Half | Where | What it has | What it lacks |
|---|---|---|---|
| **The parameter/formula half** | `packages/family-runtime` (+ `family-instance`, `family-loader`, `file-format/family-migrations`) | typed expression DSL, units on literals, cycle detection, topological resolution, definition→type→instance precedence, 8 versioning migrators, `.pryzm-family` persistence | **any UI. Any sketch. Any geometry authoring.** |
| **The sketch/constraint half** | `apps/component-editor` (89 files) | sketch canvas, 7 drawing tools, 5 constraint commands, reference planes, solid store, AI bridge, view tabs, marketplace publish | **any parameter layer.** |

The join is *named but unbuilt* on both sides:

- `apps/component-editor/src/stores/viewTabStore.ts:14` — `export type ViewTab = 'sketch' | '3d' | 'parameters'`.
  **The `'parameters'` tab exists in the type. Nothing renders it.**
- `viewTabStore.ts:9-11` — *"we'll consolidate at S55 once `ParameterTable` and `TypeCatalog` arrive"*.
  **S55 passed. Measured: `grep -rn 'parameterStore|ParameterTable|FamilyParameter' apps/component-editor/src` →
  one hit, and it is that comment.**
- `apps/component-editor/package.json:4` advertises *"→ parameter table"* as a shipped stage. It is not built.

> **The single highest-leverage reuse move available to this programme is to import
> `@pryzm/family-runtime` into `apps/component-editor` and render the `'parameters'` tab.**
> Both packages already exist, both are tested, both are pure, and `apps/component-editor` already
> declares `@pryzm/constraint-solver`, `@pryzm/file-format` and `@pryzm/geometry-kernel` as
> dependencies — `@pryzm/family-runtime` is the missing fourth line in a `package.json`.

## 2.2 Reuse `packages/family-runtime` AS the spec §11 typed expression engine

**Do not write a new one.** Spec §11 asks for a typed expression engine that supports formulas and
detects *circular dependencies · undefined references · unit mismatch · invalid expressions/types*,
with **no unsafe arbitrary string substitution**. Measured against that sentence:

| Spec §11 requirement | family-runtime status | Evidence |
|---|---|---|
| typed expression engine | ✅ **BUILT** | `expression/parser.ts:29-35`, 6-arm AST |
| supports formulas | ✅ **BUILT** | `FamilyParameter.expression` + `resolveParameter` |
| detects circular dependencies | ✅ **BUILT** | Kahn sort, `resolveParameter.ts:88-125`, `code: 'cycle'` |
| detects undefined references | ✅ **BUILT** | `evaluator.ts:106-108` `unknown-identifier` |
| detects **unit mismatch** | ❌ **AUTHORED, NEVER THROWN** | §4 TRAP-3 |
| detects invalid expressions | ✅ **BUILT** | `ParseError` / `LexError` → `expression-parse` |
| detects invalid **types** | ⚠ **PARTIAL** | scope is `Record<string, number>`; strings are excluded from expressions, not type-checked in them |
| no unsafe string substitution | ✅ **BUILT** | no `eval`, no `Function()`, recursive descent only |

**How to extend it, in the order the spec implies:**

1. **Give the evaluator a typed scope.** Change `EvalScope = Readonly<Record<string, number>>`
   (`evaluator.ts:19`) to carry `{ value: number; kind: CanonicalKind }`. `kindOf()` already exists
   (`unit-coercion.ts:59`) and already returns `'length' | 'angle' | 'scalar'`. **This is the single
   change that turns spec §10 ("units are semantic and typed … never bare `Width = 1200`") from
   aspirational into enforced**, and it makes `UnitMismatchError` — which already exists and is
   already exported — throw for the first time.
2. **Widen `Unit` beyond `'mm' | 'm' | 'deg' | 'rad'`** (`tokenizer.ts:13`) toward spec §10's
   quantity kinds (area, volume, mass, temperature, pressure, energy, power). Note the widening must
   happen in **two** places or the family model forks further — see §4 TRAP-5.
3. **Make the function table extensible** by backing it with `@pryzm/formula-library`'s
   `FormulaCatalog` instead of the frozen literal at `functions.ts:26`. The catalogue already has
   descriptors, pinned semver, arity/type validation and three typed errors — it is the registration
   path `functions.ts` deliberately does not have.
4. **Add a `constraints` field to `FamilyParameter`** (`types.ts:31-42`). Spec §9 lists constraints as
   a first-class parameter field; the interface has 8 of the 11 fields and this is one of the 3 missing.

## 2.3 Reuse `ConstraintEngine` (the `./compliance` half) as the spec §14–§15 ADVISORY substrate

`packages/constraint-solver/src/ConstraintEngine.ts` is 836 LOC, wired into nine live call sites, and
**the C74 gate now enumerates 20 constraint families with their classification and an executable
evidence line each** (measured 2026-09-01, see §2.6). Seventeen of the twenty are ADVISORY. That is a
working rule-registry pattern the component editor should join rather than duplicate.

## 2.4 Reuse the E1b declarative rule evaluator's VOCABULARY discipline — not its evaluator

`packages/site-parcel-data/src/rulepacks/declarative/` (1,266 LOC, C58/C64). **Read it for the
pattern, and understand precisely what it does and does not do.**

**What it contributes to spec §11 — and it is genuinely valuable:**

- **`factVocabulary.ts` is a typed, FROZEN, unit-carrying vocabulary of evaluator inputs.** Each
  `DeclarativeFact` (`:46-68`) carries `name · unit · meaning · computedBy · space`. The `computedBy`
  field is the anti-`AUTHORED-BUT-UNWIRED` guard, stated in the file: *"a fact with no computing
  authority is not declared (authored-but-unwired lesson)."*
- **It separates INPUTS from OUTPUTS explicitly** (`:29-35`), and says why:
  > *"FACTS are evaluator INPUTS (what a predicate reads); PARAMETERS are rule OUTPUTS (what a rule
  > states)."*
  **This is exactly spec §8's PROPERTIES-vs-PARAMETERS distinction, already drawn and already
  enforced in a different subsystem.** `DECLARATIVE_PARAMETERS` (`:186-232`) carries
  `name · unit · c58Field · c58Calculation` — a canonical parameter vocabulary with a declared
  unit-conversion per entry (e.g. `maxCoveragePercent`: *"percent → fraction (÷ 100)"*).
- **`assertKnownFacts()` (`:147`) refuses an undeclared spelling** rather than silently evaluating a
  false predicate: *"a pack spelling `parcel_area` where the vocabulary says `parcelAreaM2` is a
  load-time/eval-time error, never a silently-false predicate."*
- **Frozen 2026-09-01** (`factVocabulary.ts:20-27`) — *"adding a fact is append-only; renaming/removing
  one is an ADR-level change."*

**⛔ What it does NOT do — and the brief's hypothesis needs correcting here.**
**It carries JSON-Logic; it does not evaluate JSON-Logic.** Measured:
`evaluateDeclarative.ts:200-202` defines the outcome
`{ kind: 'condition-not-evaluable'; ruleId; detail }`, and `:496-506` returns it for **every** rule
carrying a condition, even one whose facts are all declared. The file header says so at `:43-48`:

> *"Conditions whose facts ARE declared still refuse with a NAMED seam (`'condition-not-evaluable'`):
> the pilot migrates scalar rules only … a silently-skipped condition would convert a conditional rule
> into an unconditional one."*

**So the E1b evaluator is a rule-SELECTION and PRECEDENCE engine (rank resolution, temporal windows,
tie refusal, evidence chains), not an expression evaluator.** Spec §11 is **not** partly met by it in
the way the brief hypothesised — it is met by `packages/family-runtime`, which the brief did not know
about. What E1b contributes is the **vocabulary-freeze + refuse-on-unknown-spelling discipline**,
which family-runtime lacks entirely (family-runtime accepts any identifier that resolves in scope).

**Recommended synthesis:** family-runtime supplies the *evaluator*; the declarative pack supplies the
*governance model for the identifier namespace*. A universal component editor needs both.

## 2.5 Reuse `ConstraintRecord` + `StableReference` as the persisted-constraint precedent

`packages/core-app-model/src/annotations/ConstraintStore.ts:29-48` is **the only constraint family in
the repo that is written to the snapshot, read back, and checked** (C74 §2). Its shape is directly
reusable for spec §14's *"Constraints are persistent semantic objects"*:

```ts
export type ConstraintOperator = '>=' | '<=' | '==' | '>' | '<';
export interface ConstraintRecord {
  id: string;                                  // stable identity (spec §7)
  sourceAnnotationId: string;                  // provenance (spec §36)
  type: 'hard' | 'soft';                       // design-intent strength (spec §15)
  operator: ConstraintOperator;
  valueMetres: number;
  description: string;                         // human-readable, e.g. "A–B ≥ 1.200 m"
  references: [StableReference, StableReference];   // ⭐ spec §20
  lastResult: 'satisfied' | 'violated' | 'unknown'; // ⭐ three values, not two
  violationDeltaMetres: number;
}
```

**Two properties of this design are exactly what the spec demands and should be copied verbatim:**

1. **`StableReference` is spec §20's answer already implemented.** Spec §20: *"Topology matters but is
   NOT permanent identity — no canonical `Face 381`/`Edge 27` references; use stable feature lineage
   and semantic references. If a reference becomes ambiguous: FAIL CLOSED."* `ConstraintSolver.ts:36-52`
   defines `UnresolvedReference` carrying `index · elementType · elementId · subElement ·
   hadCachedPosition` — and the last field is documented as deliberately **not used**:
   > *"Whether a cached coordinate for this reference survives. It is REPORTED and DELIBERATELY NOT
   > USED … Carried so a reader can see that declining it was a decision, not an oversight."*
   **That is FAIL CLOSED, implemented, with the rationale in-code** (`§CONSTRAINT-STALE-CACHE-IS-NOT-SIGHT`).
2. **The third value.** `lastResult` is `'satisfied' | 'violated' | 'unknown'`, and
   `ConstraintSolver.ts:56-62` warns that the boolean `satisfied` is *"ONLY MEANINGFUL WHEN `error` IS
   ABSENT. A boolean cannot carry three values, and the third — 'I could not look' — is the one that
   matters."* This is the repo's `§CONTEXT-DATA-HONESTY` lesson applied to constraints, and spec §73
   (`GeometryStatus = Invalid` with structured diagnostics) needs the same shape.

## 2.6 ⭐ Reuse the C74 classification — and note that the gates C74 declared UNBUILT ARE NOW BUILT

**C74 §6 says all three gates are "UNBUILT at stamp time (2026-08-12)". That is STALE. Re-measured
2026-09-01 at HEAD `6e15af2f`:**

| Gate | Contract said | **Measured 2026-09-01** |
|---|---|---|
| `tools/ga-gate/check-constraint-honesty.ts` | UNBUILT | **BUILT · RC=0 · `CLEAN — 0 findings, hard-0, no baseline` · 3,013 evidence files read · 20 constraint families enumerated** |
| `tools/ga-gate/check-solver-is-real.ts` | UNBUILT | **BUILT · RC=0 · `CLEAN — 0 findings, hard-0, no baseline` · 179 manifests, 5,142 source files · negative-controlled (C74 §6.2): planted tree fired R1/R2/R3, clean tree 0** |
| `tools/ga-gate/check-no-hidden-mock.ts` | UNBUILT | **BUILT · RC=3 — RATCHET EXCEEDED · 2 findings against a declared level of 0** |

**`check-constraint-honesty.ts` has done C74 §7 exit-condition 7 for the whole repo** — *"Every
constraint family carries a §1.1 classification with its evidence."* Its `G-INV-2` arm prints the
complete table, and **this is the authoritative census of constraint work in PRYZM**:

| Classification (C74 §1.1) | Count | Families |
|---|---|---|
| **ADVISORY** | **17** | `ROOM_MIN_AREA · ROOM_NEEDS_DOOR · HABITABLE_NEEDS_WINDOW · STAIR_HEADROOM · DOOR_WIDTH_vs_CIRCULATION · ACCESSIBLE_ROUTE · ROOM_MAX_TRAVEL_DISTANCE · FIRE_COMPARTMENT_AREA · MEANS_OF_ESCAPE_COUNT · CORRIDOR_WIDTH · LIFT_ADJACENT_LOBBY · PLUMBING_ZONE · ACOUSTIC_RT60_HOSPITAL · ACOUSTIC_RT60_SCHOOL · ACOUSTIC_RT60_COURT · DAYLIGHT_HABITABLE · THERMAL_GLAZING_OVERHEATING` |
| **ENFORCEMENT** | **1** | `WallOccupancyStore.canPlace` |
| **VALIDATION** | **2** | `StairValidationAuthority` · `annotationConstraints` |
| **SOLVING** | **0** | — |

> **⛔ THE LANE QUESTION, ANSWERED BY A GATE RATHER THAN BY OPINION: twenty constraint families,
> zero of them SOLVING.** C74 §4.5's standing verdict — *"UNPROVEN — no constraint family in this
> repository has yet been shown to require SOLVING"* — is not stale. It is now **backed by an
> executable enumeration** that runs green.

**⚠ One C74 exit condition is now MET that the contract does not record:** §7 item 6,
*"`createWorkerHandler` is wired or deleted"*. Measured: `ls packages/constraint-solver/src/` returns
8 files and **`worker.ts` is not among them**. It was deleted.

## 2.7 Reuse D-TGL's "Living Design Parameters" as the §78 precedent — but not as a parameter model

`packages/ai-host/src/workflows/apartmentLayout/` is, per **C81 §0** quoting a deleted-but-citable
doc, *"the most-finished domain in the entire model"*. For this lane two pieces matter:

- **`designParamsToScoringWeights.ts`** — 8 normalised `0..1` design sliders (`daylight · privacy ·
  kitchen · compactness · adjacency · accessibility · climate · space`) mapped onto a deterministic
  scorer's weights. Its stated design rule is **ADR-0060: "bind, don't fork"** — *"Each biases ONE
  piece of EXISTING generation substrate"*, with `0.5` as the neutral midpoint that *"reproduces the
  legacy behaviour exactly (Pareto-equality invariant)."* **This is the working precedent for spec
  §78's "size shading by solar exposure … make the panel compatible with the grid".**
- **`rules/programRules.ts`** — a normative room database described in its own header as the
  *"SINGLE SOURCE OF TRUTH"*, plus **13 dimensional validators** in `dimensions/` (`validateRoomFit ·
  validateFrontage · validateKitchenTriangle · validateRoomDaylight · validateCorridorWidth ·
  validateEntrySightline · validateRoomShape · validateRoomHierarchy · validateApartmentEnvelope · …`).
  In C74 §1.1 terms these are **VALIDATION**, and they are the largest body of real constraint logic
  in the repo.

**⚠ Do not mistake these for spec §9 parameters.** See §4 TRAP-6.

## 2.8 Reuse the `.pryzm-family` migration operators as the spec §13 + §37 answer

`packages/file-format/src/family-migrations/ops/` already implements **progressive parametrisation as
a versioned, replayable operation** — spec §13's *"draw → extrude → parameterise → symmetry → formula
→ type"* has its `parameterise` and `formula` steps built (`add-parameter`, `introduce-expression`),
its `type` step built (`split-type`), and identity-preserving rename (`rename-parameter`).
**Spec §37's "versioning of definitions and types with explicit behaviour for existing instances"
is implemented for parameters and unimplemented for everything else.**

---

# §3 — WHAT IS GENUINELY MISSING
*(Each item is evidenced by a search that FAILED. The searches are quoted so they can be re-run.)*

## 3.1 GAP-1 — No contract governs parameters, formulas or units. **Highest-priority gap.**

The contract suite as measured 2026-09-01: `ls docs/02-decisions/contracts/ | grep -c '^C[0-9]'` → **108**,
max id **C109** (`C109-ELEMENT-BATHROOM-POD-COMPOUND-SYSTEM.md`). **⚠ CLAUDE.md's governance section
states the max as C108 — it has rotted again, for the seventh time in the count/range shape it
documents. Read `contracts/README.md` and `tools/ga-gate/check-contract-index-equivalence.ts`, never
either number, including this one.**
There is a contract for element types (**C65**), constraint honesty (**C74**), geometry determinism
(**C73**), design-intent preservation (**C81**), provenance (**C75**), relationships (**C78**), and
one per element family (**C84–C99, C101, C104, C106, C107, C109**).

**There is none for the parameter model.** `packages/family-runtime` — the most spec-relevant package
in this lane — cites only `PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §7.5` in every file header, a
phase plan, which sits **below SPECs** in the conflict-resolution order and is not in the suite at all.

> **Consequence, stated in the repo's own idiom: this subsystem has no authority to be wrong against.**
> Spec §77 Phase 3 ("Contract design") should mint the parameter/unit/expression contract, and
> `family-runtime` should be its first subject.

## 3.2 GAP-2 — The live editor's element parameters and the family parameter model are DISJOINT

The main editor mutates parameters through `element.updateParameter` →
`packages/command-registry/src/generic/UpdateElementParameterCommand.ts`, over plain Zod fields on
element schemas. **Measured: `grep -rn '@pryzm/family-runtime' apps/editor` → 0 hits.**
No element parameter in the shipping product has a unit type, a formula, a dependency edge, or a
definition/type/instance scope. Spec §12 ("parametric after placement — non-negotiable") is
**unimplemented for every element the user can currently place.**

## 3.3 GAP-3 — Ten of spec §14's fifteen constraint kinds do not exist anywhere

Spec §14 names: *coincident, horizontal, vertical, parallel, perpendicular, tangent, concentric,
equal, symmetric, aligned, fixed, distance, angle, radius, diameter*.

**FAILED SEARCH, quoted verbatim** — for each token, `grep -rn "'<token>'" packages/constraint-solver/src apps/component-editor/src | wc -l`:

```
symmetric   -> 0        horizontal -> 0        aligned  -> 0
equal       -> 0        vertical   -> 0        radius   -> 0
tangent     -> 0        concentric -> 0        diameter -> 0
                                               angle    -> 0
```

Only **5 of 15** exist (`packages/constraint-solver/src/types.ts:21-25`):
`distance-pp · parallel · perpendicular · coincident-pp · fixed`.

**Two of the missing ten are named explicitly in the spec's own acceptance tests**:
§13 (*"make this symmetrical" creates a real symmetry/equality relationship*), §64 (*"make both side
frames equal"*), §68 (*"equal, symmetric, horizontal, vertical, tangent, distance, radius — preserved
across parameter changes"*). **`equal` and `symmetric` are the two the founder's test demands and the
two that need no solver** — see §5.

That file's own comment claims the *"full planegcs catalogue (~30 kinds) lands incrementally at
S53–S55"*. **S53–S55 have all passed and it is still 5.**

## 3.4 GAP-4 — There is no units package and no quantity-kind system

**FAILED SEARCHES, quoted:**

```
$ ls -d packages/units packages/quantity packages/measure
ls: cannot access 'packages/units': No such file or directory
ls: cannot access 'packages/quantity': No such file or directory
ls: cannot access 'packages/measure': No such file or directory

$ grep -rn "QuantityKind"    --include=*.ts packages apps plugins src   ->  0
$ grep -rn "assertSameUnit"  --include=*.ts packages apps plugins src   ->  0
$ grep -rn "'pressure'"      --include=*.ts packages apps plugins src   ->  0
```

Spec §10 demands *"length, area, volume, angle, mass, temperature, pressure, energy, power, …"*.
Instead, **units are re-declared independently in at least nine places with incompatible vocabularies**:

| Site | Vocabulary | Canonical base |
|---|---|---|
| `packages/family-runtime/src/expression/tokenizer.ts:13` | `mm · m · deg · rad` | **millimetres** |
| `packages/schemas/src/family-request/geometry.ts:33` | `m · mm · cm · in · ft · deg · rad · unitless` | **metres** |
| `packages/core-app-model/src/annotations/DimensionFormatter.ts:16` | `mm · cm · m` | — |
| `packages/core-app-model/src/annotations/AnnotationParametersSchema.ts:34` | `mm · cm · m` | — |
| `packages/core-app-model/src/annotations/AnnotationParametersSchema.ts:90` | `m · mm` | — |
| `packages/core-app-model/src/quantities/TakeoffTypes.ts:33` | `m · m2 · m3 · ud · kg` | — |
| `packages/schemas/src/sheet/widget-payloads.ts:87` | `m · mm · ft` | metres |
| `packages/schemas/src/materials/materialCarbon.ts:39` | `kgCO2e/kg · kgCO2e/m3` | — |
| `packages/site-parcel-data/.../factVocabulary.ts` | free strings: `m² · m · % · m²st/m²s` | — |

**None of these is a quantity-kind system.** They are display/serialisation enums. Nothing anywhere
answers *"is `length + angle` legal?"*.

**⭐ The one exception, and it is the pattern to copy:**
`packages/core-app-model/src/quantities/CostModel.ts:249,274-275` **does** perform a real unit-mismatch
refusal, reporting *"N rates were quoted in a different unit than the line measures and were refused."*
That is the only place in the repo where a unit mismatch causes a refusal — and it is in the 5D cost
model (C38), not in the parameter model.

## 3.5 GAP-5 — No parameter table UI exists anywhere in the product

**FAILED SEARCH, quoted:**
```
$ grep -rn "parameterStore\|ParameterTable\|parameterTable\|FamilyParameter" --include=*.ts apps/component-editor/src
apps/component-editor/src/stores/viewTabStore.ts:10:// `ParameterTable` and `TypeCatalog` arrive and the store count
```
**One hit, and it is a comment about a store that never arrived.** The `'parameters'` view tab is
declared at `viewTabStore.ts:14` and has nothing behind it.

**FAILED SEARCH for a formula authoring surface, quoted:**
```
$ grep -rln "formulaInput\|FormulaEditor\|formula-bar\|FormulaBar\|addFormula" --include=*.ts --include=*.tsx apps plugins packages src
apps/api-gateway/src/routes/formulas.ts
```
The only hit is a **read-only HTTP discovery endpoint** (`GET /v1/formulas`, `GET /v1/formulas/:id`,
mounted at `apps/api-gateway/src/app.ts:32`). **There is no surface in any editor where a human can
type a formula.** Spec §75 ("DO NOT FAKE CAPABILITIES") therefore has nothing to police here yet —
but also nothing to build on.

## 3.6 GAP-6 — Parameters carry no provenance and no semantic classification

`FamilyParameter` (`family-runtime/src/types.ts:31-42`) has 8 of spec §9's 11 fields.
**Missing: semantic meaning/classification, constraints, provenance.** The repo has a five-value
provenance vocabulary owned by **C75** and a confidence model owned by **C62**, and
`packages/ordinance-extraction`'s `ParameterEvidence` shows the pattern applied to a *different*
parameter family — **none of it reaches `FamilyParameter`.** Spec §36 (*"Provenance … critical for
AI-generated World Model content"*) is unimplemented at the parameter layer.

## 3.7 GAP-7 — No geometric SOLVING capability, and it is forbidden to build one on spec authority alone

`grep -rl '"planegcs"' --include=package.json --exclude-dir=node_modules .` → **0 files**
(re-measured 2026-09-01; identical to C74 §0's reading of 2026-08-12).
`check-solver-is-real.ts` runs green precisely because `PlanegcsAdapter` no longer claims otherwise.

**⛔ C74 §4.1 is a MUST NOT and it binds this programme:**
> *"No geometric constraint solver may be built, bound, or budgeted on the argument that the product
> category implies one. The founder's rule, recorded verbatim so it survives paraphrase: do not build
> a solver because 'BIM 3.0 sounds like it needs one.'"*

**The master spec §17 says the same thing in its own words** — *"Do not build a kernel from scratch
without compelling reason … Never auto-select the newest project; produce a recommendation before
committing."* The two documents agree. C74 §4.2 supplies the procedure: per constraint family, answer
**(a)** does it need VALIDATION? **(b)** ENFORCEMENT? **(c)** simultaneous system with no closed form?
*"and the first two are usually the end of it."*

---

# §4 — TRAPS
*(In-code corrections and §-tags a newcomer to this lane will trip over. Ordered by how expensive the trip is.)*

## TRAP-1 ⛔ `defaultValue` SILENTLY BEATS `expression`. A formula on a parameter that has a default NEVER RUNS.

`packages/family-runtime/src/resolution/resolveParameter.ts` resolves in this order (`:130-176`):

```
1. instance override      → return
2. type override          → return
3. p.defaultValue !== null → return          ← the expression is never reached
4. c.ast !== null          → evaluate
```

The header (`:1-2`) states it plainly: **`instance > type > family default > expression`**.

**Why this is a trap and not a design choice:** the spec's §64 AI acceptance test requires
*"make glass width always opening width − 2 × frame width"*. If `GlassWidth` already has a
`defaultValue` — which is the normal state of an authored parameter — assigning it an expression
**changes nothing, reports nothing, and produces no diagnostic.** The parameter keeps its constant.
Spec §75 (*"if AI says 'the width is now proportional to the height' a real formula exists"*) fails
silently at exactly this line.

**And the test suite cannot see it.** `packages/family-runtime/__tests__/resolveParameter.test.ts:50`
is titled — verbatim — **`'expression is used when no default and no override'`**. There is no test
for the both-present case. This is C74 §3.5's shape (*"the suite states which production
configuration is thereby not covered"*) in a file that is otherwise excellent.

**Spec §12's stated ordering is the opposite:** *"definition defaults → type values → instance
overrides → **derived parameters** → geometry"* — derived parameters come **last**, i.e. they
compute *from* the resolved inputs rather than being pre-empted by them. **Reconciling these two
orderings is a Phase-1 canonical-model decision, not an implementation detail.**

## TRAP-2 ⛔ The `introduce-expression` migrator does not do what its own header says.

`packages/file-format/src/family-migrations/ops/introduce-expression.ts:3-4` opens with:

> *"**Replaces a parameter's constant `defaultValue`** (and optionally clears per-type overrides for
> that parameter) with an expression source string…"*

**Measured — `grep -n "defaultValue" introduce-expression.ts` returns exactly ONE line: line 3, the
comment.** The `apply()` body (`:30-67`) sets `expression`, optionally strips `types[*].values[id]`,
and **never touches `defaultValue`**.

**Composed with TRAP-1, this is a live latent defect:** run `introduce-expression` on a parameter
that has a default and the migration reports success, the `.pryzm-family` document round-trips, the
schema validates (`family-schema.ts:126-127` permits both fields simultaneously) — and the formula is
inert forever. This is spec §13's progressive-parametrisation path and it is broken at its only
implementation.

*(Reported as archaeology per §1 — NOT fixed in this lane.)*

## TRAP-3 ⛔ `UnitMismatchError` is defined, exported, documented — and never thrown.

`packages/family-runtime/src/expression/unit-coercion.ts:14-16` promises:
> *"We DO NOT cross-convert: a `m` literal supplied where an angle parameter is expected raises
> `UnitMismatchError`."*

**FAILED SEARCH, quoted:**
```
$ grep -rn "UnitMismatchError" --include=*.ts packages apps plugins src
packages/family-runtime/src/expression/index.ts:13:  export { toCanonical, kindOf, UnitMismatchError, type CanonicalKind } from './unit-coercion.js';
packages/family-runtime/src/expression/unit-coercion.ts:14: // parameter is expected raises `UnitMismatchError`.
packages/family-runtime/src/expression/unit-coercion.ts:21: export class UnitMismatchError extends Error {
packages/family-runtime/src/expression/unit-coercion.ts:24:   this.name = 'UnitMismatchError';
```
**Four hits: the barrel re-export, the comment, the declaration, and the name assignment. No `throw`
site. No caller.** `kindOf()` and `CanonicalKind` likewise have zero consumers outside their own unit
test (`__tests__/unit-coercion.test.ts:29-33`).

**The mechanism:** `EvalScope = Readonly<Record<string, number>>` (`evaluator.ts:19`). The moment a
parameter's value enters scope its unit kind is erased, so `walk()` cannot compare kinds even in
principle. `toCanonical()` runs only on *literals* (`evaluator.ts:105`). Mixed-unit **literals** are
handled correctly; mixed-unit **parameters** are not checked at all.

**Do not report spec §11's unit-mismatch requirement as met.** It is authored, exported, and unwired
— the repo's own `§AUTHORED-BUT-UNWIRED` lesson, in the package that best implements everything else.

## TRAP-4 ⛔ THREE expression/formula engines coexist. Name the one you mean.

| Engine | Path | Nature |
|---|---|---|
| `@pryzm/family-runtime` | `packages/family-runtime/src/expression/` | recursive-descent parser + AST + unit-tagged literals. **The one this lane recommends.** |
| `@pryzm/expr-eval` | `packages/expr-eval/src/{parser,evaluator}.ts` | older; declared in the **root** `package.json:134` |
| `@pryzm/formula-library` | `packages/formula-library/` | not a parser at all — a frozen catalogue of 12 named functions |
| *(plus)* | `plugins/schedules/src/formula-evaluator.ts` | a fourth, schedule-column formula path |

`family-runtime/src/expression/parser.ts:6` positions itself relative to one of the others —
*"Grammar (tighter than expr-eval …)"* — which is the only cross-reference between any of them.
**A statement of the form "PRYZM has a formula engine" is ambiguous across four subjects.** Cite the
package.

## TRAP-5 ⛔ TWO rival family parameter models, disagreeing on the canonical unit.

| | `packages/family-runtime/src/types.ts` | `packages/schemas/src/family-parametric/` |
|---|---|---|
| Parameter type | `FamilyParameter` (`:31-42`) | `ParametricParameter` (`parameter.ts:34-37`) |
| Formula field | `expression: string \| null` | `constraint?: string` (e.g. `"depth >= width / 2"`) |
| Unit vocabulary | `'mm' \| 'm' \| 'deg' \| 'rad'` | `'m' \| 'mm' \| 'cm' \| 'in' \| 'ft' \| 'deg' \| 'rad' \| 'unitless'` |
| **Canonical base** | **millimetres** (`types.ts:11-13`) | **metres** (`family-request/geometry.ts:28` — *"engines convert internally to metres"*) |
| Layer | L2-ish, imperative | L0, Zod-pure |

`packages/schemas/src/family-parametric/parameter.ts:30-32` claims its constraint DSL is
*"Parsed by `@pryzm/family-runtime` at instance-bake time"*. **It is not.** `resolveParameter` reads
only `FamilyParameter.expression`; nothing reads `ParametricParameter.constraint`. Note also that
`ParametricParameter.constraint` is a **relational** expression (`>=`) while
`FamilyParameter.expression` is an **assignment** expression — they are different languages sharing
one claim of a parser.

**Spec §5 ("exactly one authoritative model") is already violated inside the family subsystem.**
Resolving this is Phase-1 work.

## TRAP-6 ⛔ "Parameter" means three unrelated things in this repo.

1. **`FamilyParameter`** — a dimensional variable with a unit, a default and a formula.
   (`packages/family-runtime`)
2. **`DesignParams`** — eight normalised `0..1` sliders that re-weight a layout scorer.
   (`ai-host/.../designParamsToScoringWeights.ts`) **Not dimensional. No units. No formulas.**
3. **`DeclarativeParameterSpec.parameter`** — the *output* of a zoning rule (`maxHeight_m`,
   `plotRatioFAR`). (`site-parcel-data/.../factVocabulary.ts:186`) The vocabulary file itself flags
   the collision under **C84 EI-9 NON-RIVALRY** (`:29-35`), distinguishing evaluator INPUTS (facts)
   from rule OUTPUTS (parameters).

A design that unifies (1) and (2) because they share a word will produce something that is neither.

## TRAP-7 ⛔ C74's own §6 "all three gates UNBUILT" is STALE, and two more of its facts have moved.

Re-measured 2026-09-01 (see §2.6 for the full readings):

- **All three gates are BUILT.** Two run **green, hard-0, negative-controlled**;
  `check-no-hidden-mock` runs **RC=3, RATCHET EXCEEDED**.
- **The `PlanegcsAdapter` honesty defect described in C74 §0 is FIXED** — `kind` derives from the
  underlying solver, `intendedEngine` is a separate field, the `underlying?:` injection seam was
  deleted 2026-08-14, and `loadSolver()` throws on configured-but-failed. **Do not re-report it.**
- **C74 §7 exit-condition 6 is MET by deletion** — `worker.ts` / `createWorkerHandler` are gone.
- **Still true and re-verified:** `planegcs` is a dependency of nothing (0 manifests); the solver
  vocabulary is still 5 kinds; C74 §4.5's UNPROVEN verdict stands.
- **⚠ Unchecked at HEAD:** C74 §2.2's duplicated `StairValidationAuthority`
  (`packages/geometry-stair/` = shipped, `packages/constraint-solver/` = zero production importers).
  The honesty gate's evidence line for that family points at the **geometry-stair** copy
  (`packages/geometry-stair/src/__tests__/StairValidationAuthority.spec.ts:38`), so the gate is
  binding the shipped one — but C74 §7 exit-condition 5 ("one owner") is not visibly met.

## TRAP-8 ⚠ `check-no-hidden-mock` is RED at HEAD, and one finding is in this lane's subsystem.

```
$ npx tsx tools/ga-gate/check-no-hidden-mock.ts > /tmp/nhm.txt 2>&1; echo "TRUE_RC=$?"
TRUE_RC=3
   FINDING M-B — packages/core-app-model/src/annotations/AnnotationStore.ts — scaffold header
   (TODO(TASK-) with date 2026-08-24 inside grace — but a date alone buys nothing
   (§CO-06-GRACE-FIX), no owner. A scaffold whose retirement date is untracked is permanent
   architecture that nobody chose (C74 §3.4).
   ⚠ NOT ON THE LEDGER — M-B::packages/core-app-model/src/annotations/AnnotationStore.ts
   → [3] RATCHET EXCEEDED — check-no-hidden-mock: 2 finding(s) against a declared level of 0.
```

`AnnotationStore` is the parent of `ConstraintStore` — the repo's **only** persisted constraint family
(§2.5). Per CLAUDE.md P4: *"RC=3 is SHRINK-ONLY RATCHET EXCEEDED, and `run-all.ts:1162` sets
`anyFailed=true` on code 3 UNCONDITIONALLY. It is NOT absorbable via `gate-debt.json`."*

**⚠ Measurement note for whoever re-runs this:** piping the gate to `tail` and reading `$?` gives
`tail`'s exit code, not the gate's. The first reading in this lane said `RC=0` for that reason.
**Redirect to a file and read `$?` immediately** — as done above.

## TRAP-9 ⚠ `annotationConstraints` is persisted as `any[]`.

`packages/persistence-client/src/loader/ProjectSerializer.ts:356-359`:
```ts
annotationConstraints?: {
    version: 1;
    records: any[];
};
```
The typed `ConstraintRecord` (`core-app-model/src/annotations/ConstraintStore.ts:29`) is erased at the
persistence boundary, in both the package copy and the `apps/editor/src/engine/persistence/` copy
(`:622`). Spec §14's *"Constraints are persistent semantic objects"* is met in the store and lost in
the snapshot. Compare the standing lesson **`fake-more-capable-than-real`** — *"`any` seams are defect
factories."*

## TRAP-10 ⚠ `apps/component-editor` is a blessed P1 rival — do not "fix" it by allowlisting.

`apps/component-editor/src/app/familyEditorRuntime.ts:85 createFamilyEditorRuntime` is a second
composition root, blessed by **ADR-0316** and **deliberately baselined rather than allowlisted** so it
stays named on every `check-single-compose.ts` run. Also note that gate's known reporting defect:
`check-single-compose.ts:216` prints the **string literal** `"0 rivals"` while the same run enumerates
one (`audit/element-creation/2026-08-29/gate-of-gates.json:431`). CLAUDE.md's P1 bullet quotes that
false line. **Read the gate body, not its terminal line, and not CLAUDE.md.**

## TRAP-11 ⚠ The `.pryzm-family` document has TWO places to put a default.

`packages/file-format/src/family-schema.ts:126` gives each parameter a `defaultValue`; `:252` gives
the document a separate `defaults: z.record(...)` map. `add-parameter.ts:32-38` writes the second
(`seedDefault` → `document.defaults[id]`) while `resolveParameter` reads only the first
(`FamilyParameter.defaultValue`). **A default seeded by the migrator is not a default the resolver
sees.** Which of the two is canonical is undecided; both are persisted.

---

# §5 — THE LANE'S TWO ANSWERS

## 5.1 What fraction of spec §9–§15 already has an implementation?

Scored per spec sub-requirement. **BUILT** = code exists and is tested. **PARTIAL** = the substrate
exists but a stated property is unmet. **ABSENT** = a failed search in §3.

| Spec | Requirement | Status | Where |
|---|---|---|---|
| §8 | Properties vs Parameters not collapsed | **BUILT (elsewhere)** | `factVocabulary.ts:29-35` draws it exactly, for zoning. Not drawn in `FamilyParameter`. |
| §9 | Parameters are first-class objects (11 attributes) | **PARTIAL — 8/11** | `family-runtime/src/types.ts:31-42`; missing semantics, constraints, provenance |
| §9 | Scopes = Definition/Type/Instance/Derived | **BUILT** | `resolveParameter.ts:130-176`; `FamilyType`, `InstanceOverrides` |
| §9 | Deterministic resolution | **BUILT** | Kahn topological sort + stable `order[]` output |
| §10 | Units are semantic and typed | **PARTIAL — literals only** | `tokenizer.ts:13` + `toCanonical`; **no quantity-kind system, GAP-4** |
| §11 | Typed expression engine | **BUILT** | `expression/parser.ts` + `evaluator.ts` |
| §11 | Detects circular dependencies | **BUILT** | `resolveParameter.ts:88-125`, `code: 'cycle'` |
| §11 | Detects undefined references | **BUILT** | `evaluator.ts:106-108` |
| §11 | Detects **unit mismatch** | **ABSENT** | TRAP-3 — authored, never thrown |
| §11 | Detects invalid expressions / types | **PARTIAL** | expressions yes; types only insofar as scope is numeric |
| §11 | No unsafe string substitution | **BUILT** | no `eval`; recursive descent |
| §12 | Parametric after placement (instance ≠ type) | **BUILT in family model / ABSENT in the product** | `bakeFamilyInstance.ts:136` honours `instanceOverrides`; **no shipping element uses it (GAP-2)** |
| §12 | Resolution order defaults→type→instance→derived | **CONTRADICTED** | TRAP-1 — derived is pre-empted by defaults |
| §13 | Progressive parametrisation | **PARTIAL** | `introduce-expression` exists; **it is broken (TRAP-2)** |
| §13 | "make this symmetrical" → real relationship | **ABSENT** | GAP-3 — `symmetric` has 0 hits |
| §14 | 15 constraint kinds | **PARTIAL — 5/15** | `constraint-solver/src/types.ts:21-25` |
| §14 | Reference planes/lines/points/axes | **PARTIAL** | `component-editor/src/stores/referencePlaneStore.ts` — planes only, and unreachable |
| §14 | Constraints are persistent semantic objects | **BUILT (one family)** | `ConstraintStore` + snapshot round-trip; **but `any[]` at the boundary (TRAP-9)** |
| §15 | Model retains WHY (design intent) | **PARTIAL** | `ConstraintRecord.type: 'hard'\|'soft'` + `description`; **C81 exists as a contract with all four gates UNBUILT** |

**Count: 9 BUILT · 7 PARTIAL · 3 ABSENT (+1 CONTRADICTED) across 20 scored requirements.**

> ### **≈ 45 % of spec §9–§15 has a real implementation; ≈ 35 % more has a usable substrate that is one wiring change away; ≈ 20 % is genuinely absent.**
>
> **The §9–§12 parameter/formula/unit block is the strong half — call it 70 % built, and 0 % reachable
> from the product.** The §14–§15 constraint/design-intent block is the weak half — 5 of 15 kinds,
> one persisted family, and a governing contract (C81) whose every gate is unbuilt.

## 5.2 Is the constraint-solver a foundation or a dead end?

**Both — because `packages/constraint-solver` is two unrelated subsystems wearing one package name.
Answer them separately or the answer is wrong.**

### The SOLVER half: a DEAD END, and deliberately so. Do not invest in it.

- 5 constraint kinds, of the 15 spec §14 names; **10 of the missing 10 return 0 grep hits** (§3.3).
- `MockSolver` is a projection iterator with a `|variables| − |constraints|` DOF counter that its own
  header calls *"the simplest possible DOF counter"*.
- `planegcs` is a dependency of **nothing** (0 of 179 manifests, re-measured 2026-09-01).
- **The honest thing about it is now its best feature.** `PlanegcsAdapter` reports `kind` derived from
  what actually executes and carries `intendedEngine` separately; `loadSolver()` throws rather than
  falling back. `check-solver-is-real.ts` runs **green, hard-0, negative-controlled**. There is no
  hidden capability here and no hidden absence — the package tells the truth about being empty.
- **C74 §4.1 forbids building the real one on product-category reasoning**, and C74 §4.5's verdict —
  *"UNPROVEN — no constraint family in this repository has yet been shown to require SOLVING"* — is
  now backed by `check-constraint-honesty.ts`'s enumeration: **20 families, 17 ADVISORY, 1
  ENFORCEMENT, 2 VALIDATION, 0 SOLVING.**

### The ADVISORY half: a FOUNDATION, and the most reachable one in the lane.

`ConstraintEngine.ts` is 836 LOC — larger than the entire solver half — exported at `./compliance`,
imported by `apps/editor/src/engine/initDataPlatform.ts:50`, six wall/opening consequence-planner
compositions, and both `ai-host` entry points. Seventeen named rule families with executable evidence.
**Spec §14–§15 should extend this registry, not stand up a rival.**

### The practical consequence for spec §68's constraint test

Spec §68 requires *"equal, symmetric, horizontal, vertical, tangent, distance, radius — preserved
across parameter changes."* Applying C74 §4.2's three-question procedure to that list:

- **`equal(A,B)`, `symmetric(A,B,axis)`, `horizontal`, `vertical`, `fixed`** — these are **closed-form
  assignments**, not simultaneous systems. `Equal(A,B)` is `B := A`. `Symmetric` about a declared
  reference plane is a reflection. **Each is expressible today as a `FamilyParameter.expression`
  referencing another parameter, with `resolveParameter`'s topological sort supplying the propagation
  order and its cycle detector supplying the over-constrained refusal.** They reach C74 §4.2(b) and stop.
- **`tangent`, `radius` on a coupled sketch** — these are the candidates that could reach §4.2(c), and
  **only** with a written per-family argument. That argument does not exist today.

> **⭐ The founder's §64 acceptance test — *"make both side frames equal"*, *"make glass width always
> opening width − 2 × frame width"* — is satisfiable with the expression engine that already exists,
> and needs no solver at all.** That is the most useful single finding in this lane: **the spec's
> headline parametric demo is a `family-runtime` problem, not a `constraint-solver` problem.**

---

# §6 — WHAT LANE C RECOMMENDS THE PHASE-1 / PHASE-3 WORK ADDRESS
*(Recommendations only. §1 binds: nothing here was implemented.)*

1. **Mint the missing contract.** No C-contract governs parameters, formulas or units (GAP-1).
   `packages/family-runtime` should be its first subject, and the contract must decide TRAP-1's
   `default`-vs-`expression` precedence and TRAP-5's two-rival-models question.
2. **Reconcile the two family parameter models before writing a third** (TRAP-5). They disagree on the
   canonical base unit (mm vs m), which is the kind of disagreement that produces a 1000× defect.
3. **Wire `@pryzm/family-runtime` into `apps/component-editor` and build the `'parameters'` tab.**
   One dependency line; both packages already exist and are tested (§2.1).
4. **Type the evaluator's scope with `CanonicalKind`** — this alone makes spec §10 enforced and makes
   the already-written `UnitMismatchError` throw (TRAP-3).
5. **Implement `equal` and `symmetric` as expressions, not as solver constraints** (§5.2), which
   satisfies the spec's own §13 and §64 tests without touching C74 §4.1.
6. **Do not delete `apps/component-editor`.** It is 89 files of exactly the sketch/constraint/reference-
   plane machinery spec §57 describes, it carries its own `no-three`/`no-react`/`no-window`/a11y/bundle
   quality gates, and spec §62 explicitly says the existing editors are *"the first migration/proving
   ground — do not throw it away."*
7. **Treat `familyCreatorPlaceholder.ts`'s retiring assertion as a live tripwire.**
   `apps/editor/__tests__/FamilyCreatorPlaceholderScaffold.test.ts` asserts the create rail still
   routes to the placeholder. **The first PR that wires the real editor will make that test fail — by
   design.** It is not a regression; it is the scaffold retiring itself.
