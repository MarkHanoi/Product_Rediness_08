# THE ARCHITECTURE & CONTRACT AUDIT
## PRYZM Universal AI-Native System & Component Editor

**Deliverable:** the founder's explicitly-ordered FIRST deliverable —
`docs/01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md` **§81**, the twelve items in order.
**Date:** 2026-09-01 · **HEAD:** `6e15af2f` (branch `main`) ·
**Rule obeyed:** spec **§1 — DO NOT CODE.** No production file was modified by this audit or by any of
the eight archaeology lanes that fed it. This document is knowledge and a plan; it is not a change.

**Inputs:** the master spec, read in full, and all eight Phase-0 lane files in this directory —
`a-semantic-and-element-model.md` · `b-geometry-model-and-kernel.md` ·
`c-parameters-formulas-constraints.md` · `d-commands-transactions-persistence.md` ·
`e-ai-rac-authoring.md` · `f-window-and-wall-editors.md` · `g-world-model-hosting-interop.md` ·
`h-technology-investigation.md`. Where two lanes disagreed, **I opened the code and settled it** — every
settlement is in §0.2 with the command that decided it.

---

## §0 — THE VERDICT, BEFORE THE TWELVE SECTIONS

### §0.1 — The one paragraph

**PRYZM already built the canonical parametric component model the spec asks for, and never connected
it to anything.** `packages/file-format/src/family-schema.ts` (266 lines, measured) is a Zod-pure,
content-addressed, signed, migrating, three-tier `Definition → Type → Instance` model with eight
prefixed-ULID identity spaces, typed parameters with canonical units, a real cycle-detecting expression
resolver (`packages/family-runtime`, zero dependencies), twelve persisted constraint kinds that can be
**driven by a parameter**, four solid features, material slots, reference planes, per-solid LOD and an
**authoring-time** IFC parameter binding. Beside it sits a 5,918-line editor application,
`apps/component-editor`, built across sprints S52–S59 for exactly this purpose. **The largest single
risk to this programme is proposing to build what S52–S59 already built.** The second is assuming it
works: two of its three view tabs render an "under construction" splash, it appears in **no** build, CI,
deploy or server config, it cannot open or save a `.pryzm-family` file, and **there is no bus verb
anywhere in this repository that places a component into a project.**

So Phase 1 is not a design exercise. It is **gap-closure against an existing 266-line schema, plus the
one thing that has never existed — the join between the component stack and the element stack.**

### §0.2 — Where the lanes disagreed, and what I found when I opened the code

Eight lanes worked in parallel and contradicted each other in six places. Each is settled below by a
command I ran in this tree today. **These settlements bind the rest of this document.**

**1. Persisted constraint kinds — 12, not 13.**
Lane A and Lane H say 12; Lane D says 13. `sed -n '142,158p' packages/file-format/src/family-schema.ts`
shows the enum: `coincident, parallel, perpendicular, horizontal, vertical, tangent, distance, radius,
angle, diameter, equalLength, distancePointLine`. **Twelve. I took Lane A/H.**

**2. `apps/component-editor` size — both lanes were right about different things.**
`find apps/component-editor/src -name '*.ts' | wc -l` → **52**; `cat` of those → **5,918 lines**;
`find apps/component-editor -name '*.ts' | wc -l` → **89** (Lane C counted its 37 test files too).
**I use 52 source files / 5,918 LoC.**

**3. ⛔ CI does NOT run its suites — Lane D is wrong.**
Lane D states *"`npm run test:ci` (`pnpm -r … run test:ci`) runs its suites and its bundle-budget gate."*
Measured: `node -e "console.log(require('./apps/component-editor/package.json').scripts)"` →
`dev, build, preview, test, test:watch, typecheck`. **There is no `test:ci`, so `pnpm -r run test:ci`
skips it silently** and its six quality gates (`no-three`, `no-react`, `no-window`, `loc-cap`,
`bundle-budget`, `a11y`) **never run in CI.** Lane B is right. This matters because "it is tested" is
true of a local `npm test` and false of the pipeline.

**4. ⭐ THE MOST CONSEQUENTIAL CORRECTION — is the kernel→descriptor→committer pipeline reachable in
the browser?**
Lane H says *"Reachable in production? **YES** — ~20 element-family producers drive the shipped
editor."* Lane B says *"DARK — `src/main.ts:421` boots `canvas: null`, committers are never
constructed."* **Lane B is right, and the point is sharper than Lane B put it.**

`sed -n '405,440p' src/main.ts` confirms `composeRuntime({ …, canvas: null, … })` with the comment
*"No canvas in the white-UI boot path — `scene.renderer` slot stays null until Phase D.3."* But
`composeRuntime.ts:1477-1521` also implements a **post-compose facade**, `runtime.scene.mount(canvas,
mode)`, which shares *"every byte of soft-fail / span / tornDown / event semantics"* with the
compose-time path. So the honest question is whether anything calls it:

```
$ grep -rn "scene\.mount(\|\.scene\.mount" --include=*.ts src apps/editor/src packages | grep -v __tests__
apps/editor/src/ui/platform/PlatformShell.ts:87   // F.5.1 Wave 14 — runtime.scene.mount wiring (canvas mount facade).
apps/editor/src/ui/platform/PlatformShell.ts:89   // the legacy `window.world` refs with runtime.scene.mount(canvas).
packages/runtime-composer/src/buildCameraControllerSlot.ts:13,48,62,71   (comments)
packages/runtime-composer/src/buildPickingSlot.ts:71,74                  (comments)
packages/runtime-composer/src/composeRuntime.ts:1462,1479                (comments)
packages/runtime-composer/src/types.ts:2733,3784,3919,4485               (comments)
```

**Every hit is a comment.** The only code at the named site is
`console.debug('[PlatformShell] Wave 14 runtime.scene wired — renderer:', typeof _sceneSlot.renderer)`
(`PlatformShell.ts:90-93`) — it inspects the slot and mounts nothing. **The descriptor pipeline is dark
on BOTH paths: compose-time (`canvas: null`) and post-compose (`scene.mount` has no caller).** Lane H is
right only about the kernel's *pure 2-D predicates and tolerance constants*, which ~70 browser sites do
import. **This constrains §5 and Phase 4 directly and is the reason §12 Phase 4 carries a dedicated
lane 4E.**

**5. Contract and ADR counts — CLAUDE.md is stale in both.**
`ls docs/02-decisions/contracts/ | grep -c '^C[0-9]'` → **108**; the C1xx block is
`C100, C101, C102, C104, C105, C106, C107, C108, C109` — **max id C109**, unminted slots **C61** and
**C103**. `ls docs/02-decisions/adrs/ADR-*.md | wc -l` → **311**, not CLAUDE.md's 285. Lane C is right.
⛔ **Do not transcribe either number, including these** — run
`npx tsx tools/ga-gate/check-contract-index-equivalence.ts`, which set-compares in both directions.

**6. Lane C's TRAP-1 and TRAP-2 — BOTH CONFIRMED, and composed they are a live defect.**
`sed -n '125,180p' packages/family-runtime/src/resolution/resolveParameter.ts` shows the resolution
order in code, not just in a header comment: an instance/type override returns first, then

```ts
if (p.defaultValue !== null) { …; values[p.name] = p.defaultValue; continue; }
if (c.ast !== null && p.dataType !== 'string') { … evaluateAst(…) … }
```

**The `continue` means a parameter carrying BOTH a default and an expression never evaluates the
expression, and emits no diagnostic.** And `grep -n "defaultValue"
packages/file-format/src/family-migrations/ops/introduce-expression.ts` returns **exactly one line —
line 3, a comment** that claims the op *"Replaces a parameter's constant `defaultValue` … with an
expression"*. It does not. **So the only progressive-parametrisation path in the repository (spec §13)
reports success, round-trips, validates — and leaves the formula inert forever.** That is spec §75's
exact prohibition, already shipped. It is §11 R7 and it is a Phase-4 blocker.

### §0.3 — Two findings no lane reported

**F1 — ⛔ The only CANONICAL contract governing `.pryzm-family` describes a format that does not exist.**
`C05-PERSISTENCE-AND-FILE-FORMAT.md §4` (line 697) states the family file *"contains a
`family-descriptor.json` (parameter table, geometry functions, label mappings)"* and is *"a valid
`.pryzm` file with `metadata.json.type = 'family'`"*.

```
$ grep -rn "family-descriptor" --include=*.ts --include=*.json packages apps plugins src
(no output)
```

The real envelope is `packages/file-format/src/family-types.ts:8-17` — `manifest.json` ·
`document.json` · `event-log.ndjson` · `ifc-mapping.json` · `thumbnail.webp` · `icon.svg` ·
`signing/schema-hash` · `signing/signature`. **There is no `family-descriptor.json` and no
`metadata.json.type='family'`.** The format's actual spec source, cited in its own header, is
`phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §5` — **a phase plan, which sits below SPECs in the
conflict-resolution order and is not in the contract suite at all.** Compounded with Lane C's GAP-1
(no contract governs parameters, formulas or units), **the component model is governed by nothing
correct.** This is §6's headline.

**F2 — ⭐ C107 (ELEMENT: ADAPTIVE COMPONENT) is CANONICAL, honestly unbuilt, and is the natural first
client of this engine.** Stamped 2026-08-24, ratified by ADR-0370, it encodes the founder's ask for *"a
flexible adaptive element … I define the points from walls, slabs and core systems and it creates a
'wall' which I can then customise and create layers."* Its §0.1 measures its own absence across all four
C84 §3.5.1 axes, and I re-verified it: `grep -rln "adaptiveComponent\|AdaptiveComponent" --include=*.ts
packages plugins apps src` → **no output**. **No lane mentioned it.** It matters twice: (a) it is a
second, already-contracted demand for exactly this machinery, so building the universal engine without
C107 as a named consumer risks minting a rival to a canonical contract; and (b) its **§0.2-a
naming-disclosure clause** — *"A family named for a behaviour it does not have is the naming-vs-behaviour
defect this repository logs repeatedly"* — is the template §11's honesty obligations follow.

---

# 1 · WHAT PRYZM ALREADY HAS

Every row names a file and, where one exists, its governing contract. **Reachability is stated on the
C84 §3.5.1 four-axis convention** (import/construction · bus verb · build graph · call), because in this
repository authored ≠ wired and that distinction decides reuse-vs-build.

## 1.1 — The component-authoring stack (Stack 1) — COMPLETE, CONTRACT-GRADE, UNREACHABLE

| Capability | Authority file | Spec § it answers | Reachable? |
|---|---|---|---|
| `Definition → Type → Instance` | `packages/file-format/src/family-schema.ts:244` (`FamilyDocument`), `:234` (`FamilyType`), `packages/family-runtime/src/types.ts:61` (`InstanceOverrides`) | §6 | **Library-reachable; NOT from `apps/editor`** |
| Eight prefixed-ULID identity spaces | `family-schema.ts:15-22` — `fam_ typ_ par_ sol_ prof_ slot_ plane_` + bare ULID | §7 | as above |
| Typed parameters, canonical units | `family-schema.ts:121-133`; `family-runtime/src/types.ts:9-13` (*"length in millimetres, angle in radians"*) | §9, §10 | as above |
| Cycle-detecting expression resolver | `packages/family-runtime/src/expression/{tokenizer,parser,evaluator,unit-coercion,functions}.ts` + `resolution/resolveParameter.ts` — recursive descent, **no `eval`**, Kahn topological sort, 8 diagnostic codes | §11 | **Reachable only from `apps/bake-worker`** |
| 12 persisted constraint kinds, parameter-drivable | `family-schema.ts:142-158`, each carrying `parameterRef: ParameterId \| null` | §14, §15 | persisted; **5 executable** (§3.4) |
| 4 solid features + per-solid LOD | `family-schema.ts:172-225` — `extrude \| sweep \| loft \| revolve`, each with `lod:{coarse,medium,fine}` | §16, §28 | **1 of 4 baked** (§3.5) |
| Material **slots**, not colours | `family-schema.ts:227-232` | §23 | as above |
| IFC as a **separate ZIP entry**, authored per parameter | `family-types.ts:11` (`ifc-mapping.json`), `family-schema.ts:82-99` | §29–§31 | as above |
| Versioning + a real migration framework | `formatVersion` literal + `packages/file-format/src/family-migrations/` (`MigratorRegistry`, cycle detection, typed `ChainResult`) with **8 parameter-level ops** | §37 | as above |
| Content addressing + Ed25519 signing | `schemaHash = sha256(canonical(document) + canonical(ifc-mapping))`, `canonical-json.ts`, `zip-deterministic.ts`, `signing/*` | §71–§72 (and more than §71 asked for) | as above |
| An NDJSON event log | `FamilyEventSchema:260` → `event-log.ndjson` | §38 | as above |

**Satellites, all real workspaces:** `packages/family-runtime` (zero dependencies),
`packages/family-loader` (unzip → validate → resolver pre-flight → cache by `(familyId, schemaHash)`),
`packages/family-instance` (`bakeFamilyInstance` → `BufferGeometryDescriptor[]`, **no THREE**),
`packages/file-format`, `packages/constraint-solver`.

## 1.2 — The second family stack (Stack 2) — DIFFERENT THING, and it is the LIVE one

`packages/schemas/src/family-{request,definition,parametric,geometry,schemas,pipeline,registry}` is a
five-stage ingestion pipeline for *furniture-scale, AI- or JSON-authored* families. It is **reachable in
production** — `packages/stores/src/familyRegistryStore.ts:55` with
`findById/findByCategory/findByOccupancy/findByMountClass/findByTag`, fed by `registerFamilyFromJson.ts`
and seeded with 59 core families. It has strict semver identity, an `ai-generated` provenance origin
(spec §36) and a `composite` primitive kind (spec §25 nesting) — **neither of which Stack 1 has.**

⛔ **The two stacks share the word "family" and nothing else** — different id formats
(`family/com.pryzm.core/desk` vs `fam_<ULID>`), different parameter models, different IFC mappings,
different category vocabularies, and (§3.7) **different canonical length units.** **The powerful stack
is the unreachable one, and the reachable one is the weaker one.**

## 1.3 — `apps/component-editor` — the previous build of this exact spec

52 source files, **5,918 LoC** (measured). Its own `package.json` describes it as *"the
Revit-Family-Editor analogue: 2D parametric profile sketcher → constraint solver → 3D
extrude/sweep/loft/revolve → parameter table → typed authoring of `.pryzm-family` artefacts."*

**What is real:** a working 2-D sketcher (`SketchCanvas.ts` + 7 tools — Line, Arc, Circle, Rectangle,
Fillet, Trim, Select), a live solver loop (`solverRunner.ts` + `buildConstraintSet.ts`), five constraint
commands, reference planes, a solid store, **an AI bridge with an approval queue and a replay test**, a
marketplace publish + Ed25519 signing flow, its own command bus, and six quality gates it holds itself
to (300-LoC file cap, 180 KB gzip first-paint budget, `no-three`, `no-react`, `no-window`, a11y).

**What is a placeholder — verified in this audit.** `sed -n '160,200p'
apps/component-editor/src/app/AppShell.ts` shows `renderActivePanel` mounting real UI **only** for
`active === 'sketch'`; every other tab falls through to `panel.appendChild(renderSplash(active))`, and
`appSplash.ts:13-17` gives those splashes their titles: *"3D preview — under construction"* and
*"Parameter table — under construction"*. **There is no 3-D viewport and no parameter table.**

**Reachability — zero on three of four axes.**
```
$ grep -rln "component-editor" package.json vite.config.ts fly.toml .github/workflows/ index.html server.js
EXIT=1     (no matches)
```
No root build input, no CI job, no Fly config, no server route, no `test:ci` (§0.2 item 3). Its own
`src/index.ts:9-19` records that even its deep link is inert. **ADR-0316 blesses its second composition
root; `check-single-compose.ts` tolerates it at `MAX_RIVALS = 1`.**

## 1.4 — The element stack — where placement, hosting, scheduling, undo and collaboration live

- **28 registered element kinds** (`packages/schemas/src/registry.ts`) declared through one helper,
  `defineElement` (`packages/schemas/src/base/BaseNode.ts:31`), governed by **C03 §1** and P5. ⚠ 32 files
  exist in `src/elements/`; the registry is not a census.
- **The same identity convention as Stack 1** — `<prefix>_<26-char Crockford ULID>`, branded
  (`types/Id.ts:14`), minted by `createId(prefix)` (ADR-0001).
- **A TYPE tier that exists 22 times over**, all in `packages/core-app-model/src/stores/` (`WallTypes`,
  `CeilingSystemTypeStore`, `WindowSystemTypeStore`, …). **C65** governs it; wall/door/window are DONE on
  all five axes (store · C13 project scope · C05 round-trip · commands · UI authoring).
- **Composition via `parentId`/`childrenIds`** — proven on `pool` (ADR-0124), `balcony` (C103) and
  `lift` (C104). Spec §25 nesting exists here and nowhere else in the element model.
- **The command seam** — `CommandBus.executeCommand(type, payload, {context, plan, gestureId})`
  (`packages/command-bus/src/CommandBus.ts:317`), **361 registered verbs**, C03 §2 / C16 / C69.
- **A typed refusal value, not a throw** — `CapabilityRefusal` (`consequence.ts:755-807`) forcing both
  numbers and a `protects` clause; `CapabilityRunReport` making `findings: []` mean *"zero within
  `checked`"* and never *"nothing ran"*.
- **One undo entry point** — `performUndoRedo.ts`, C03 §4.6 U-5, over a ring buffer and a legacy stack.
- **A relationship graph** — `SemanticGraphManager` (`packages/core-app-model/src/SemanticGraph.ts`,
  1,830 lines, 26 typed relationship kinds), persisted in the snapshot, cascade-deleted from 53 sites,
  gated green (`check-graph-write-coverage` RC=0), exposed on the bus as
  `graph.query / graph.neighbors / graph.path`. **C71 · C78 · C79.**
- **Hosting** — C15's wall `openings[]` (*"a hosted element's frame IS its host's frame"*, C15 §2.1) plus
  a **more general** mechanism Lane G found that C15 §0.1.1 wrongly declares UNBUILT: `OpeningData`
  (`packages/core-app-model/src/stores/OpeningTypes.ts:11`) carrying **an explicit `hostId` and a
  host-local 2-D `profile`**, live for slab and roof openings.
- **Semantic visibility** — `VisibilityRule` + `QueryExpression`
  (`packages/core-app-model/src/presentation/VisibilityRuleTypes.ts:63`), serialisable, AI-authorable,
  undo-able, applied at `VGSceneApplicator.ts:752`; plus an L0 `DetailLevel` axis with a five-tier
  resolver consumed by eight builders.
- **IFC as a projection** — `IfcElementMeta` side-car (ADR-008 tiers), and a live export pipeline
  (`packages/file-format/src/export/ifc/`) that already writes the SemanticGraph out as a
  `PRYZM_Relationships` pset and real `IfcRelSpaceBoundary` entities.

## 1.5 — The geometry stack

- **`BufferGeometryDescriptor`** (`packages/geometry-kernel/src/types/BufferGeometryDescriptor.ts:47-83`)
  — indexed triangle soup, **frozen by ADR-009**. The single geometric output type in the tree.
- **The adapter seam spec §18 asks for already exists and is lint-enforced:**
  `producer → BufferGeometryDescriptor → committer`, with `pryzm/no-three-in-kernel` hard-failing any
  `three` / `@thatopen/*` / `web-ifc*` import inside the kernel.
- **Six general-purpose producers, all real and frozen:** `produceExtrude` (324 ln), `produceRevolve`
  (236), `produceSweep` (307, Bishop parallel-transport frames), `produceLoft` (256), `produceBoolean`
  (manifold-3d WASM, 30-shape pair suite), `produceWallWithVoids`.
- **Canonical predicates and a declared tolerance policy** — C73, gated by
  `check-offset-implementations`, `check-predicate-canonical`, `check-epsilon-policy`.
- **A shipped, generic, 2-D elevation sketch surface** — `apps/editor/src/ui/ElevationOutlineSurface.ts`
  (389 ln), extracted under **C86 §10.6 / ADR-0373** so the wall profile modal and the window outline
  section are *"two CALLERS of one surface rather than two implementations of one idea."* I verified the
  callers: `WallProfileEditor.ts`, `FinishTypeEditorModal.ts`, `WindowOutlineEditorDialog.ts` — **three,
  all in `apps/editor`, all reachable.**
- **One profile producer with a consumer law** — `OpeningProfile.ts` (1,015 ln), **C86 §10.1 PR-1**:
  *"every wall-body arm consumes the outline THIS function returns. ⛔ No arm may re-derive an arc."*

## 1.6 — The AI / RAC stack

**77 chat capabilities over 361 registered bus commands**, one IR (`SemanticIntent`), one semantic front
door (`applySemanticIntent`), one context construction site, and an LLM rung whose **entire vocabulary
and field shapes are generated from the capability registry** (`LlmPlanner.ts:28-43`). Governed by
**C67 / C68**, with `ChatCapability` carrying a **`probe`** the gate executes against every element kind
and a **`commandProof`** the gate opens and greps. Failure honesty is the best in the repository:
`classifyDispatch` → a five-member `DispatchOutcome` union with `indeterminate` as a first-class state.
Four propose→consent surfaces (`WallMoveClashProposal` and siblings) implement spec §45's *"with
options"* loop **for editor-triggered refusals**.

---

# 2 · WHAT CAN BE REUSED

Ordered by leverage. **Every row names a thing to reuse, not a thing to write.** This section is the
answer to spec §1: *"do not create duplicate concepts if PRYZM already has an equivalent."*

| # | Reuse | For | How, concretely |
|---|---|---|---|
| **R1** | ⭐⭐ `packages/file-format/src/family-schema.ts` | §6, §7, §9–§11, §14, §16, §23, §28, §29–33, §37 | **Write §77 Phase-1's canonical model as a DELTA against this file, not from scratch.** 14 of the 19 entities Phase 1 enumerates already have a Zod schema here. Extend through the existing `family-migrations/` framework with a `formatVersion` bump. ⛔ **Do not mint a rival `ComponentDefinitionSchema`** — §1 and C74 §2.2 both forbid it, and this repo has already deleted one byte-near rival (`StairValidationAuthority`, 2026-08-13) for exactly that reason. |
| **R2** | ⭐⭐ `packages/family-runtime` | §9–§12 | Take it **wholesale** as the parameter/expression engine. Zero dependencies, tested, span-emitting, `ResolverInput = {parameters, type, instanceOverrides}` *is* spec §12's ordering as a function signature. ⚠ Three fixes first: the TRAP-1 precedence inversion (§0.2 item 6), typing the eval scope with `CanonicalKind` so the already-written `UnitMismatchError` can throw, and widening `Unit` beyond `mm\|m\|deg\|rad`. ⛔ **Do not adopt `@pryzm/expr-eval` or `@pryzm/formula-library` as the engine** — three expression evaluators already coexist; a fourth is the exact §1 violation. |
| **R3** | ⭐⭐ `CommandBus.executeCommand` + `CommandHandler` + `HandlerResult` | §5, §40, §76 gate D | Author `component.*` / `parameter.*` / `constraint.*` / `feature.*` verbs as ordinary **C16 Path-B** handlers with `affectedStores`, `canExecute` and a patch pair. Nothing new is needed at the bus. ADR-0324 already decided the spec's §40 rule in PRYZM's favour: *"every actor kind reaches the SAME `executeCommand()`."* |
| **R4** | ⭐ `CapabilityRefusal` + `CapabilityRunReport` | §20 fail-closed · §44–45 diagnostics · §73 `GeometryStatus = Invalid` | The typed refusal value already exists, already rides `HandlerResult.refusal`, already forces two numbers and a `protects` clause, and is **a value the caller reads, not a throw a `catch {}` swallows**. ⛔ **Do not mint a `GeometryError` or `ComponentDiagnostic` type.** Its `reason` union is CLOSED at eleven members (C78 §8.1); per-family specificity goes in the typed `subReason`, never in prose. |
| **R5** | ⭐ `apps/editor/src/ui/ElevationOutlineSurface.ts` (+ `@pryzm/geometry-wall/outline-authoring`) | §57–§62 sketch surface | **The spec's instruction "the Wall Profile Editor's profile/sketch functionality becomes generic infrastructure" IS ALREADY DONE** (C86 §10.6, ADR-0373, 2026-08-25; three callers verified). Generalise its **subject** from `WallProfileVertex[]` in a `(u,v)` extents box to a `Profile` on a `ReferencePlane`, and add a constraint-glyph layer. Its invertible px↔metre contract, ortho ruling, arc mode and *"no store, no bus, no THREE, no rAF"* split are reusable verbatim. ⛔ **Proposing to build this is the single worst outcome available to this programme.** |
| **R6** | ⭐ `packages/geometry-kernel` producers + `manifold-3d` | §57 Solid group, §67 | Six of eleven §57 Solid operations already exist as frozen, tested, THREE-free producers. `produceSweep` / `produceLoft` / `produceRevolve` are **not exported from the barrel** — that is one re-export line each, not a build. |
| **R7** | ⭐ The `producer → BufferGeometryDescriptor → committer` seam | §17–§20 | **This IS the spec §18 adapter boundary**, and it is frozen by ADR-009 and lint-enforced. Any future exact evaluator plugs in **behind** it. ⛔ **Do not propose a new adapter layer.** |
| **R8** | `SemanticGraphManager` + the C71 §2.6 four-obligation addition rule | §34, §35 | Add `instantiates` / `specializes` / `dependsOnDefinition` as new `RelationshipType` members, each in one PR carrying writer + typed reader + rebuild disposition + delete behaviour. ⛔ **Do not build a component graph** — C71 §4 makes "the three graphs stay separate" normative and `@pryzm/building-graph` is the sanctioned projection, not a fourth graph. |
| **R9** | `ChatCapability` + the two proofs + the generated LLM vocabulary | §39–§45 | Component verbs become **registry rows** with `probe` + `commandProof`, and the AI's tool list is **generated** from `allChatCapabilities()`. ⛔ **Do not design a new AI tool-descriptor schema.** ⚠ Extend `check-chat-capability-coverage.ts`'s `HANDLER_GLOBS` **first**, or the new surface is born invisible to the one gate that exists to prevent that. |
| **R10** | `VisibilityRule` + `QueryExpression` + `DetailLevelResolver` | §28 | `{op:'gt', field:'PanelCount', value:2}` — **spec §28's own second example — typechecks today.** The work is two joins: widen `VisibilityRule['scope']` to include `'definition'`/`'type'`, and make `resolveEffectiveDetailLevel`'s answer addressable as a `field`. ⛔ **Do not mint a second LOD enum** (L-241 P1 exists to kill a three-way spelling fork). |
| **R11** | `OpeningData` (`hostId` + host-local 2-D `profile` + `properties.roofFace`) | §26 hosting | This is the **generic** hosting record the spec wants, already shipping for slabs and roofs. Generalise **this**, not `wall.openings[]`. Its `properties.roofFace` — the authored face-plane rectangle kept beside the projected one *"so the intent survives a slope change"* — is spec §15 design-intent retention, already implemented. |
| **R12** | `IfcElementMeta` + `FamilyParameter.ifcMapping` + Pipeline A | §29–§33, §70 | The mapping direction is already `PRYZM → IFC`. Extend the **authoring-time** binding (`family-schema.ts:128`), not the import-shaped side-car. ⛔ Extend **Pipeline A** (`packages/file-format/src/export/ifc/`); `plugins/ifc-export/**` is the dead one (C25 §1.7). |
| **R13** | `ElementTypeAuthoringRegistry.ts` (+ C65 §3.5) | §59 category modal | The **declaration-not-branch** pattern: a family gets a capability by declaring it, never by a branch in the editor — and the registry **gates the declaration on C05 persistence and C13 project scope**, with an `authoringUnavailableReason` so an absence is a sentence rather than a missing button. This is exactly §59's *"the category supplies semantic defaults/templates, not a separate geometry engine."* |
| **R14** | `FinishTypeChatStrip.ts` (242 ln) | §76 gate D | *"Two ways in, ONE draft, one validation, one command, one read-back."* Spec gate D, implemented, with the two shortcuts it refuses written down. **The AI/RAC integration template.** |
| **R15** | `snapshotFamilyCoverage.ts` + `UNMAPPED_BUS_STORE_KEYS` + `_reportStranded` | §37, §74 | The declared, closed-vocabulary, set-compared, shrink-only per-family tables for *"does this survive reload?"* and *"is Ctrl+Z covered?"*, with `UNPERSISTED` as a **work list, not an exemption**. The cheapest defence against the failure that has hit `ProjectSerializer` three times. ⚠ Note its own hard-won rule: *"a `persisted` row asserts the READ CHANNEL resolves"* (L-11530). |
| **R16** | The honesty machinery itself — C74 §3.4 scaffold declarations with **retiring assertions**, `refuseUnbacked`, refusal-with-both-numbers, `check-no-hidden-mock.ts` | §75 | This programme will make many claims of the form *"Sweep does a real sweep"*. **PRYZM already holds itself to an executable standard for exactly those claims** — Lane F records that two struck scaffold declarations were **REVERTED** because *"an assertion that cannot fail cannot retire anything."* **Reuse it; do not invent a second honesty mechanism.** |

---

# 3 · WHAT IS GENUINELY MISSING

**Every item carries the search that FAILED.** Where a lane's search was the evidence, it is quoted with
its lane; where I re-ran or extended it, that is said.

## 3.1 — ⭐ THE HEADLINE GAP: the join between the two stacks

The component stack can define, type, parameterise, constrain and bake. The element stack can place,
host, schedule, tag, undo, collaborate on and export. **Nothing connects them.** Measured on all four
C84 §3.5.1 axes; I re-ran axis (b), the decisive one:

```
$ grep -rnE "type:\s*'(family|component|definition|parameter|constraint|feature)\." \
      --include=*.ts packages/command-registry/src plugins apps/editor/src
(no output)

$ grep -cE "^\| \`(component|family|definition|feature)\." docs/04-reference/API-VERB-REGISTER.md
0

$ grep -rn "@pryzm/family-loader\|@pryzm/family-instance\|@pryzm/family-runtime" \
      --include=*.ts --include=package.json apps/editor
(no output)
```

**There is no bus verb that places a component into a project, no register row for one, and
`apps/editor` imports none of the three family packages.** Of the 361 registered verbs, zero are
`component.*`.

⚠ **And the test named for this does not prove it.**
`tests/family-load-into-project/family-load-into-project.test.ts` is titled *"end-to-end gate (S56 D4)"*.
Lane A greps it for `ElementStore|commandBus|elementStore|createId|SCHEMA_REGISTRY|@pryzm/stores` and
gets **nothing**. It proves the bake chain; its **name** claims project insertion. ⛔ **Do not read it as
evidence that S56 landed.**

## 3.2 — No DEFINITION tier for elements, and no INSTANCE identity in the family stack

Two halves of one gap.

```
$ grep -rl "ComponentDefinition" packages apps plugins --include=*.ts    →  0
$ grep -rl "ComponentInstance"   (same scope)                           →  0
$ grep -rl "SemanticClass"       (same scope)                           →  0
```

- **Elements have no runtime-authorable definition level at all.** An element kind *is* a compiled Zod
  schema — not data, not authorable, not versionable per project. Lane F states the cost precisely:
  the "definition" of a window is `WindowBuilder.ts`, **2,086 lines of hand-written TypeScript, one per
  family**, so *"a second family costs a second 2000-line builder."*
- **Conversely, Stack 1's instance tier is an override bag, not an identified object** —
  `InstanceOverrides` (`family-runtime/src/types.ts:61`) has values but no id, no level, no host, no
  provenance. **Neither stack has all three tiers.** §4 resolves this.

## 3.3 — Connectors (§27) — the one true greenfield subsystem

```
$ grep -rniE "\bconnector\b" --include=*.ts packages/ plugins/ apps/ src/ | grep -v __tests__
   -> ~30 hits, ZERO a building-object connector (NL grammar words; a corridor "connector spine"
      in the layout engines; one prose line about a lamp part)
$ grep -rniE "insertionPoint|attachmentPoint|\bports\b|anchorPoint" --include=*.ts packages/*/src plugins/*/src apps/*/src
   -> ZERO building-object hits
$ grep -rn "\bMEP\b" --include=*.ts packages/*/src plugins/*/src apps/*/src
   -> ZERO MEP elements. MEP is a discipline LABEL, a preview COLOUR and floor-plate zone text.
```
*(Lane G, re-stated.)* `servesZone` — the one relationship member that could carry a system edge — is
**PARKED** (C71 §2.2, writer 0 / reader 0), and C71 §2.5 makes shipping a writer for it *"a defect, not
progress"* until an ADR names its first consumer. **Everything else in this audit extends something.
Connectors are the exception.**

## 3.4 — Constraints: 12 persisted · 5 executable · 15 asked for

```
$ grep -rn "'symmetric'\|'equal'\|'concentric'\|'aligned'" packages/constraint-solver/src apps/component-editor/src | wc -l
0
$ grep -rl '"planegcs"' --include=package.json --exclude-dir=node_modules .
(no matches)
```
`ConstraintKind` (`packages/constraint-solver/src/types.ts:21-25`) has **five** members;
`ProfileConstraintSchema` persists **twelve** (§0.2 item 1); spec §14 names **fifteen**.
⛔ **A `.pryzm-family` document can be authored and saved today carrying `tangent`, `radius`, `diameter`
and `equalLength` constraints that nothing in this repository can evaluate.**

⛔ **And building the solver is forbidden, not merely unscheduled.** **C74 §4.1:** *"No geometric
constraint solver may be built, bound, or budgeted on the argument that the product category implies
one."* §4.5's standing verdict is **UNPROVEN**, and `check-constraint-honesty.ts` now backs it with an
executed enumeration: **20 constraint families — 17 ADVISORY, 1 ENFORCEMENT, 2 VALIDATION, 0 SOLVING.**
The route is C74 §4.2 (a) validation → (b) enforcement → (c) solving, in writing, per family. §7 and §12
Phase 8 follow that route and no other.

## 3.5 — Geometry: 3 of 4 solid features unbaked, no booleans, no feature graph

- `bakeFamilyInstance.ts:13-21` implements **one** of the four schema kinds; `sweep`/`loft`/`revolve`
  return a structured `unsupported-feature` error. *(That refusal is correct behaviour — §75 already
  satisfied. Do not "fix" it by substituting an extrude.)*
- **There is no boolean feature in the schema at all.** I verified `SolidFeatureSchema`:
  `grep -n "kind: z.literal(" packages/file-format/src/family-schema.ts` → **`extrude`, `sweep`, `loft`,
  `revolve`**, four members, despite the README's S53 row claiming booleans. **A window family literally
  cannot express "frame minus glazing void" as a feature** even though `produceBoolean` exists and works.
- No feature graph: `grep "FeatureGraph|featureGraph|GeometryStatus"` over geometry-kernel, schemas,
  file-format and component-editor → **0 hits each** (Lane B). `FamilyDocument.solids` is a **flat
  array** evaluated *"in document order"* — no dependency edges, no per-feature provenance or validation
  state, no incremental recomputation.
- No 3-D modify/pattern features: `produceFillet|produceChamfer|produceShell|produceThicken|
  producePattern|produceArray` over `geometry-kernel/src` → **0 hits for all six** (Lane B).
- **No exact geometry.** `grep -rn --include=*.ts -l "opencascade|occt|OpenCascade|B-Rep" packages apps
  plugins` → no matches; the only three "BRep" strings in the tree say it is absent. **There is no ADR
  adopting or rejecting a kernel** — §77 Phase 2 has a clean slate.

## 3.6 — Progressive parametrisation (§13) is BROKEN at its only implementation

Not merely missing — **shipped and inert.** See §0.2 item 6: `resolveParameter`'s `defaultValue` branch
`continue`s before the expression is reached, and `introduce-expression` never clears the default.
Spec §64's *"make glass width always opening width − 2 × frame width"* would report success and change
nothing. **This is the single most dangerous defect this audit found**, because it fails silently in the
exact demo the founder named.

## 3.7 — Units: no quantity-kind system, and two canonical length units

```
$ ls -d packages/units packages/quantity packages/measure   →  No such file or directory (all three)
$ grep -rn "QuantityKind"   --include=*.ts packages apps plugins src   →  0
$ grep -rn "assertSameUnit" --include=*.ts packages apps plugins src   →  0
$ grep -rn "UnitMismatchError" --include=*.ts packages apps plugins src
   -> 4 hits: the barrel re-export, a comment, the class declaration, the name assignment.
      NO THROW SITE. NO CALLER.
```
Units are re-declared in **at least nine places** with incompatible vocabularies, none of which is a
quantity-kind system. ⛔ **And the two family stacks disagree on the base unit:** `family-runtime`
stores lengths in **millimetres** (`types.ts:9-13`); `packages/schemas/src/family-request/geometry.ts:28`
says *"engines convert internally to **metres**"*; `Wall.height`/`thickness` are documented as metres in
a comment. **Two canonical length units, one repository.** This is a 1000× defect class and it must be
resolved before anything bakes across the boundary.

## 3.8 — Classification and information requirements (§32, §33)

```
$ grep -rniE "informationRequirement|requiredProperty|IdsSpecification" --include=*.ts packages/ plugins/ apps/ src/   → 0
$ ls packages/ids-engine    →  No such file or directory
$ grep -rn "getBsddLookup\|BsddPropertyLookup" packages/ plugins/ apps/ src/ server/ | grep -v "plugin-sdk/src/bsdd.ts"
   -> 2 hits, BOTH in the barrel that re-exports it. Zero call sites.
$ grep -rniE "uniclass|omniclass" --include=*.ts packages/ plugins/ apps/ src/  → 2 hits, both PROSE
```
**A complete typed bSDD client exists and nothing imports it.** IDS does not exist. There is no
`✓ Complete / ⚠ Missing required information` surface, and **nowhere to declare that a fire door
REQUIRES a `FireRating` drawn from `{EI30, EI60, EI90}`** — so *"components missing fire rating"*
(a spec §35 query) cannot distinguish "missing" from "not applicable".

## 3.9 — No PROPERTIES field on any L0 element schema (§8)

```
$ grep -rn "properties" packages/schemas/src/elements/
packages/schemas/src/elements/Lighting.ts:28: * properties-panel type picker shows the user.
```
**One hit across all 32 element schema files, and it is a comment.** Yet `properties.mark` is the join
key of the entire scheduling and tagging system. The bag lives at L2, per family, and only
`CeilingPropertiesSchema` declares a shape for it — with `.passthrough()` (spec §33: *"never
uncontrolled text"*) and `thermalTransmittance: z.number()` **with no unit** (spec §10).

## 3.10 — Smaller, named gaps

| Gap | Evidence |
|---|---|
| Semantic visibility at DEFINITION scope | `VisibilityRule['scope']` is `'template' \| 'model' \| 'view'` (`VisibilityRuleTypes.ts:63`) — verified; no `'definition'`, no `'type'` |
| Derived 2-D representations in the family document | Stack 2 has `plan-symbol-ref.ts`; **Stack 1 has nothing** |
| Sub-object (face/edge/feature) selection | `grep -rn "faceIndex" apps/editor/src` → no matches; `plugins` → no matches. Produced by `bvh-pick`, consumed by nobody — **and gpu-pick, the production strategy, does not populate it** |
| Nine of spec §34's sixteen relationship kinds | `instantiates`, `specializes`, `classifiedAs`, `composedOf`, `opensIn`, `fills`, `locatedIn`, `references`, `derivedFrom` have **no member** in the 26-member union |
| A persisted `EventRecord` / per-object command history | `grep -rn "eventLogEndpoint"` → 7 hits, **all the declaration itself; zero call sites supply it**. `project_command_log` is a 24-hour collaboration buffer, not a history |
| Element-level provenance producers | The L0 vocabulary is live and gated; `elementProvenance.test.ts:28-33` states *"NOT asserted here … that any PRODUCER actually writes a real origin"* |
| A code/DSL authoring surface | No component API, no parser, no capability-based sandbox. Spec §46–56 has no counterpart |

---

# 4 · PROPOSED CANONICAL DATA MODEL

**Framing, per spec §2 and §5.** A PRYZM component is not geometry. The model below is a **semantic
spine with geometry hanging off it as one derived representation among several**. If a reader can delete
the geometry half and still answer *"what is this, what does it mean, what does it relate to, what
governs it"*, the model is semantic-first. That is the test §11 restates as a falsifier.

**Method, per spec §1.** This is a **DELTA against `packages/file-format/src/family-schema.ts`**, not a
new schema. Every row says whether it EXISTS, is EXTENDED, or is NEW.

## 4.1 — The spine, in one line

```
SemanticClass  ──classifies──▶  ComponentDefinition  ──specialises──▶  ComponentType
                                        │                                    │
                                        │                                    ▼
                                        └────────── instantiates ──▶  ComponentInstance  (= an ELEMENT)
                                                                              │
                                                                    hostedBy / containedIn / connectedTo
                                                                              ▼
                                                                        THE WORLD MODEL
```

Four questions: *what kind of thing is this?* (SemanticClass) · *what is the reusable design intent?*
(Definition) · *which named configuration?* (Type) · *which occurrence, where, hosted by what?*
(Instance).

## 4.2 — ⭐ THE DECISIVE DECISION: the ComponentInstance IS an element

**Proposal: `ComponentInstance` is not a new object. It is an element kind `component` in
`SCHEMA_REGISTRY`, whose record carries `definitionRef` + `typeId` + `instanceOverrides`.**

Why this and not the alternative:

| | Instance in the FAMILY stack (the alternative) | ⭐ Instance as an ELEMENT (proposed) |
|---|---|---|
| Placement, host, level | must be re-invented | **C15 / `OpeningData` / `levelId` / `SpatialAuthority`, already built** |
| Undo | a second stack — and `apps/component-editor`'s closure undo has **no redo at all** (`commandBus.ts:259-273` pops and discards) | **`performUndoRedo`, C03 §4.6 U-5, one entry point** |
| Collaboration | closure inverses cannot be CRDT-merged — ADR-0316 §4.2.1 says so itself | **patch pairs, already merged** |
| Persistence | a new serializer leg | **`ProjectSerializer` + one `snapshotFamilyCoverage` row** |
| Scheduling · tagging · IFC export | a second join key | **`properties.mark`, `IfcElementMeta`, Pipeline A** |
| World-Model queryability | invisible to `SemanticGraph` | **a graph node on day one** |
| §76 gate B | two instance registries | **one** |

**This is the join §3.1 says has never existed, expressed as a model decision rather than a wiring
task.** It also decides where the halves live: **definitions live in the content-addressed family
envelope; instances live in the project snapshot.** One registry each, no overlap.

⚠ **It requires ratification, not assumption** — it adds an element family, so it is bound by **C84 §6's
twelve mandatory sections** and needs an ADR. **C107 is the worked template** (462 lines; AS-IS/TO-BE
tables per axis; a measured absence census in §0.1; a naming-disclosure clause in §0.2-a).

## 4.3 — The nineteen entities of §77 Phase 1, mapped

| # | Entity | State | Where it lives / what changes |
|---|---|---|---|
| 1 | **SemanticClass** | **NEW (L0)** | `{id, name, definition, parentClassId?, externalRefs: ClassificationRef[], requiredProperties: PropertyRequirement[]}`. Carries §33's *multiple classification REFERENCES* (IFC entity · bSDD URI · Uniclass · OmniClass · PRYZM-local) and §32's IDS-style requirements (`{propertyKey, quantityKind, required, enumeration?}`). **This is the "what is this?" layer the spec asks for and the repo does not have.** ⛔ It replaces nothing — `FamilyCategorySchema`'s 8-member enum becomes a *default SemanticClass reference*, never a rival vocabulary. |
| 2 | **ComponentDefinition** | **EXISTS, EXTENDED** | `FamilyDocument` (`family-schema.ts:244`). Add: `semanticClassId` · a `boolean` solid-feature kind · `Representation[]` · `Connector[]` · a `PropertySet` · and `featureEdges[]` beside the flat `solids` array. `formatVersion` bump + migrator. |
| 3 | **ComponentType** | **EXISTS, unchanged** | `FamilyTypeSchema:234` — `{id, name, values: Record<ParameterId,…>, checksum}`. |
| 4 | **ComponentInstance** | **NEW, in the ELEMENT model** | §4.2. `defineElement('component', { definitionRef: {familyId, schemaHash}, typeId, instanceOverrides, properties })`, reusing `BaseNodeShape`'s `parentId`/`childrenIds` for §25 nesting and `ifcData` as the round-trip anchor. |
| 5 | **Property** | **NEW (L0) — but the template EXISTS** | Promote `CeilingPropertiesSchema` (`CeilingDataSchema.ts:127`): it already names `mark, comments, manufacturer, productCode, installationDate, fireRating, acousticRating, cleanroomClass, humidityZone, thermalTransmittance` — **including spec §32's own `fireRating` example** — with **two fixes: drop `.passthrough()`** (§33 forbids uncontrolled text) **and give every numeric field a `quantityKind`** (`thermalTransmittance` is W/m²K and the schema does not say so). ⛔ Properties are NOT parameters (§8): a property describes, a parameter drives generation. That line is already drawn, correctly, in a different subsystem — `factVocabulary.ts:29-35` separates evaluator INPUTS from rule OUTPUTS for exactly this reason. |
| 6 | **Parameter** | **EXISTS, EXTENDED** | `FamilyParameterSchema:121` carries 8 of §9's 11 fields. Add the three it lacks: `semanticRef` (to a standardised property definition), `constraints`, `provenance`. |
| 7 | **Formula** | **EXISTS, MUST BE REPAIRED IN THE CONTRACT FIRST** | `FamilyParameter.expression` + `packages/family-runtime`. ⛔ **The precedence inversion (§0.2 item 6) is a canonical-model decision, not an implementation detail.** Spec §12's order is *defaults → type → instance → **derived***, i.e. derived computes **from** the resolved inputs; today `defaultValue` **pre-empts** the expression and says nothing. C110 must state which ordering is canonical before a line is changed. |
| 8 | **Constraint** | **EXISTS (12 persisted), 5 EXECUTABLE** | `ProfileConstraintSchema:142`, each carrying `parameterRef` — *"the model retains WHY"* (§15) already in schema form. ⭐ **`equal`, `symmetric`, `horizontal`, `vertical`, `fixed` are closed-form assignments and belong in the EXPRESSION engine, not the solver**: `Equal(A,B)` is `B := A`; `Symmetric` about a declared reference plane is a reflection; `resolveParameter`'s topological sort supplies the propagation order and its cycle detector supplies the over-constrained refusal. **So spec §64's headline demo — "make both side frames equal", "make glass width always opening width − 2 × frame width" — needs NO SOLVER AT ALL.** Only `tangent` / `radius` / `diameter` / `equalLength` on a coupled sketch reach C74 §4.2(c). |
| 9 | **Feature** | **EXISTS (flat) → EXTENDED to a GRAPH** | `SolidFeatureSchema:172` plus NEW `featureEdges: {fromFeatureId, toFeatureId, role}[]`, per-feature `provenance`, and `status: 'valid' \| 'invalid'` with a structured diagnostic. ⛔ **Do NOT implement the feature graph "on the undo stack."** C03 §4.6 **U-12** forbids selective/out-of-order undo and `undoHistoryTimeline.ts:1-55` gives three measured reasons — *"the inverse is a positional patch, not a commutable operation"*; *"the legacy half is a snapshot, which is strictly worse"*; *"hosted and derived elements make the result undefined, not merely wrong."* **A CAD history tree is a different mechanism from a positional patch timeline.** §11 D7. |
| 10 | **Geometry** | **EXISTS, FROZEN** | `BufferGeometryDescriptor`, ADR-009. **Derived, never authored, never stored in the definition.** |
| 11 | **Representation** | **PARTIAL → EXTENDED** | Today only `lod:{coarse,medium,fine}` booleans. Add `Representation[] = {kind: 'mesh'\|'plan'\|'elevation'\|'section'\|'symbolic'\|'analysis', source: 'derived'\|'authored', visibleWhen?: QueryExpression}`. **Derived is the default** (`produceSectionCut` / `projectWallEdges` / hidden-line → `drawing-primitives`); an authored `*PlanSymbolBuilder` becomes the *override*, never the only path. |
| 12 | **Material** | **EXISTS** | `MaterialSlotSchema:227` — the definition names a **slot**; binding resolves downstream through **C100 §2.1's `materialId` ladder**. ⚠ C84 EI-8 counts **five** existing material vocabularies; a sixth is the default outcome unless the slot binds through C100. |
| 13 | **Relationship** | **EXISTS (26) → EXTENDED by 3 members + 1 node kind** | `SemanticGraph` + `instantiates` (instance→type), `specializes` (type→definition), `dependsOnDefinition` (definition→definition), plus a **`definition`/`type` NODE KIND** so a type id is a graph node at all (`ElementRegistry.ts:36` already carries the precedent with its `slabSystemType` / `ceilingSystemType` members). ⛔ C71 §2.6's four obligations per member, in one PR each; **writer-first is a defect, not progress** (§2.5). |
| 14 | **Host** | **THREE MECHANISMS → ONE CAPABILITY OBJECT** | NEW `HostingCapability {hostClasses, insertion: 'opening'\|'surface'\|'point'\|'slot', orientation: 'host-normal'\|'free'\|'fixed', requiresVoid, handing?}` declared on the **Definition** and resolved against C15's wall `openings[]`, `OpeningData{hostId, profile}` and the curtain-wall cell. ⭐ **C15 §2.1 is lifted verbatim as the universal invariant:** *"A hosted element's frame IS its host's frame. Every transform the host carries, the hosted element carries — the arc tangent, the base datum, and the RAKE. There is no hosted-element frame that is a plumb approximation of a leaning host."* |
| 15 | **Connector** | **NEW — the only greenfield entity** | `{id, name, position, orientation, kind: 'mep'\|'structural'\|'facade'\|'attachment'\|'opening'\|'insertion', dimensions, allowedConnections: SemanticClassRef[], compatibility}`. ⚠ Its graph edge `connectsVia(connector)` **must be `authoredBy`-keyed from day one**: `§FIX-CONNECTEDBY-EDGE-KEYING` records that `addRelationship` collapses on `(sourceId, targetId, type)`, so an edge whose *endpoints are not its subject* merges two connections into one and strands the survivor on delete. **`instantiates` passes that membership test; `connectsVia` does not.** |
| 16 | **Visibility** | **EXISTS in two systems → JOINED** | `lod` triple (definition-local) + `VisibilityRule.condition: QueryExpression` (project-level, serialisable, AI-authorable, undo-able, applied at `VGSceneApplicator.ts:752`). Two joins: widen `VisibilityRule['scope']` — verified today as `'template' \| 'model' \| 'view'` — with `'definition'` and `'type'`; and make `resolveEffectiveDetailLevel`'s answer addressable as a `field`. **Then both of spec §28's own examples are expressible.** |
| 17 | **Provenance** | **VOCABULARY EXISTS, PRODUCERS DO NOT** | `packages/schemas/src/provenance/` (`ValueOrigin`, `ProvenanceEdge` — *"derivation is a relationship, not a label"*), `AIArtefact` (C23), `CommandExecutionContext` (ADR-0324). ⛔ All three are **carried and written by nobody** — `elementProvenance.test.ts:28-33` says so verbatim. The model declares the field; §9 wires the producer. |
| 18 | **Version** | **EXISTS** | `formatVersion` + manifest `semver` + `schemaHash` + `MigratorRegistry` (cycle detection, typed `ChainResult`). ⚠ `formatVersion` is a Zod **literal**, i.e. not comparable — C47 §0.0's finding one level down. **Decide before minting version two** (§11 D-VERSION). |
| 19 | **Instance-override precedence** | **EXISTS as a function signature** | `ResolverInput = {parameters, type, instanceOverrides}` **is** spec §12's ordering. Only the derived-parameter position is wrong (entity 7). |

**Score: 8 exist as-is · 6 exist and are extended · 5 are new** (SemanticClass · ComponentInstance ·
Property · Connector · the feature-graph edges). §77 Phase 1 is therefore a **gap-closure exercise
against a 266-line file**, exactly as §0.1 claims.

## 4.4 — ⛔ §76 GATE B: where this proposal WOULD create a second source of truth, and how it does not

The spec forbids a rival to PRYZM's stores, schemas, command bus and World Model. **Five places where
this design could mint one, named explicitly, each with its avoidance:**

| # | The rivalry risk | How the proposal avoids it |
|---|---|---|
| **B1** | **A `ComponentDefinitionSchema` beside `family-schema.ts`** — the obvious move, and the one §1 forbids. | The model **is** `family-schema.ts`, extended through its own `family-migrations/` framework. Its line 4 already claims the role: *"the SINGLE source of truth for the on-disk shape; the editor's in-memory store types narrow it but never widen it."* **No new schema file is created for entities 2, 3, 6, 7, 8, 9, 12, 18.** Precedent for the cost of getting this wrong: this repo deleted a byte-near rival (`StairValidationAuthority`) on 2026-08-13 for exactly this reason (C74 §2.2). |
| **B2** | **A second instance registry** — if `ComponentInstance` lived in the family stack, an occurrence would exist in two places. | §4.2 — the instance **is** an element. `elementRegistry.registerSemantic(id, StoreType)` remains *"the single authoritative ID→store routing table for all PRYZM data."* |
| **B3** | **A fourth graph.** C71 §4 makes *"the three graphs stay separate"* normative, and two of them expose a method with the **same name** answering with different data. | **No component graph.** Three new `RelationshipType` members and one node kind on `SemanticGraphManager`, under C71 §2.6's four obligations. `@pryzm/building-graph` stays the sanctioned *projection*, not a fourth graph. |
| **B4** | **A sixth material vocabulary** (C84 EI-8 counts five, and warns that `materialName` is *"the one vocabulary carrying PHYSICAL semantics, not hue … any unification that collapses it to a hex loses information and is forbidden"*). | `MaterialSlot` names a slot; the **binding** resolves through C100 §2.1's ladder, whose unresolved case already renders *"the designated UNRESOLVED colour — deliberately not a plausible building material."* |
| **B5** | **A rival to Stack 2's LIVE `FamilyRegistryStore`** (59 seeded families, `findByMountClass`, AI ingestion, `ai-generated` provenance). | Stack 2 is **re-cast as an ingestion adapter and a catalogue index**, not a rival definition: `runFamilyPipeline` emits a Stack-1 `FamilyDocument`, and `FamilyRegistryStore` keeps its real job — *the searchable index of available definitions*. ⚠ This is a genuine migration with a real cost; it is sequenced in Phase 6, not assumed away. |

⚠ **And one rivalry this proposal does NOT resolve, stated rather than hidden.** `apps/component-editor`
is a second command bus, a second undo stack (with **no redo**) and a second composition root. **That is
decision D1 in §11 and it is the founder's to take.** No section of this audit assumes an answer.

## 4.5 — Naming, decided once (C84 EI-8 · C107 §0.2-a)

The spec says `ComponentDefinition / ComponentType / ComponentInstance`. PRYZM says
`FamilyDocument / FamilyType / InstanceOverrides`. **§1 gives precedence to PRYZM's existing equivalent,
and C69 §1.1 makes on-disk and wire names permanent from first commit.** Therefore:

- **On disk and on the wire — unchanged:** `.pryzm-family`, `FamilyDocument`, `FamilyType`,
  `fam_`/`typ_`/`par_`. Renaming a wire identifier is a persistence-breaking change governed by C47,
  not a refactor.
- **In the domain and in new code — ONE spelling**, chosen in Phase 3 and never revisited, with the
  spec-name → PRYZM-name mapping recorded as a **naming-disclosure clause** on C107 §0.2-a's model.
- **The word "component" is reserved for the EDITOR and the element kind**, never for a second model
  type. ⚠ C107 §1.1 makes this urgent: it minted its family with *"ONE spelling, decided now"* precisely
  because *"C101 §1 records four vocabularies over one family as the annotation family's headline
  defect."*

---

# 5 · PROPOSED GEOMETRIC MODEL

## 5.1 — The pipeline, with every stage's real state

```
SemanticClass + ComponentDefinition             ← §4, the canonical model
        │
        ▼  parameter resolution                 @pryzm/family-runtime                    ✅ EXISTS
        │
        ▼  profile evaluation                   profileToPolygon                         ⚠ POINT-ONLY (§5.3)
        │
        ▼  feature evaluation (graph)           bakeFamilyInstance switch                ⚠ 1 of 4 kinds
        │
        ▼  ▓▓ GEOMETRY ADAPTER — the ONE new interface ▓▓                                🔨 NEW, small
        │
        ▼  kernel evaluator      mesh:  @pryzm/geometry-kernel + manifold-3d             ✅ EXISTS
        │                        exact: staged, §7                                       ⏳ LATER
        ▼  tessellation
        │
        ▼  BufferGeometryDescriptor             FROZEN by ADR-009                        ✅ EXISTS
        │
        ├──▶ committer → THREE (3-D)            20 committers exist                      ⛔ NEVER CONSTRUCTED
        ├──▶ produceSectionCut / projectWallEdges / hidden-line → drawing-primitives      ✅ EXISTS
        └──▶ IFC geometry writer (Pipeline A)                                            ✅ EXISTS
```

**Spec §2's prohibition is already honoured.** PRYZM is *triangle-only* but *parameter-authored*: no mesh
is ever authoritative, every mesh is regenerated from a semantic DTO by a pure content-hashed producer,
and two GA gates exist to keep it that way. **Spec §20's exact-geometry stage is simply absent** — and
absent by *omission*, not by decision: there is no ADR adopting or rejecting a kernel, so §77 Phase 2 has
a clean slate and nothing to overturn.

## 5.2 — The adapter boundary (§18) already exists; do not build one

The **only new interface** is a `GeometryAdapter` port replacing the direct `switch (solid.kind)` inside
`packages/family-instance/src/bakeFamilyInstance.ts:70-90`. Everything downstream — descriptor
invariants (`assertValidDescriptor`, unit normals within 1e-5, index in range, group counts summing to
index length, non-empty hash), material keys, content hashing (`compose*GeometryHash` +
`*_HASH_SCHEMA_VERSION`), the committers, the scene registry, the bake worker's content-addressed
chunking — **already exists and is already kernel-agnostic.**

And the adapter's failure channel already has a type:
`UnsupportedSolid{reason: 'unsupported-feature' | 'profile-eval-failed' | 'invalid-length'}`
**is spec §73's `GeometryStatus = Invalid` with structured diagnostics, already implemented.**

**Three properties this seam inherits for free, and they are the reason not to invent a second one:**
`pryzm/no-three-in-kernel` (so an evaluator runs byte-identically in a browser worker, a Node worker and
the bake service) · `check-deterministic-regeneration` (regenerate twice → byte-identical; shuffle
iteration order → byte-identical) · **C73's declared tolerance policy**, whose gate E4 hard-fails a
tolerance whose value *widens*. ⛔ **An adopted kernel must be driven from
`packages/geometry-kernel/src/tolerance.ts`, never from its own defaults** — otherwise the repo acquires
a second definition of *"the same place"*, the exact defect C73 exists to stop.

## 5.3 — ⭐ The cheapest capability gain in the programme, and it needs no technology

Lane H's §4.6 hypothesis, endorsed here **as a hypothesis to test first, not as a verdict.**
`bakeFamilyInstance` refuses `sweep`/`loft`/`revolve` on the stated grounds that they *"require the
constraint solver (S57) so that path and section profiles can be evaluated."* **Three facts contradict
that being a solver problem:** the three producers already exist, complete and snapshot-tested
(`produceSweep` 307 ln with Bishop parallel-transport frames, `produceLoft` 256, `produceRevolve` 236);
`arcToPoints` already exists in the kernel and is used by `buildCurvedLayer`; and **C74 §1.2 forbids the
reasoning** — *"A constraint may not be described as needing SOLVING because it is hard, because it is
numeric, or because it involves several elements. SOLVING is reserved for simultaneous systems with no
closed form."*

The claim splits cleanly in two:

| | Problem | Needs a solver? | Status |
|---|---|---|---|
| **A** | A **fully-determined** profile — explicit coordinates, `line`/`arc`/`circle` entities, no under-determining constraints — flattened to a polyline | ⛔ **NO.** Closed-form tessellation the repo already performs in two places | **This is what blocks sweep/loft/revolve today**, and `profileToPolygon` throws `profile-needs-solver` on any non-`point` entity |
| **B** | An **under-determined** sketch whose shape is implied by simultaneous constraints (`tangent` + `radius` + `equalLength`) | ✅ **YES** | The real gap, and the named C74 §4.2(c) candidate (§7) |

**Test A by execution before acting** — read `SolidFeatureSchema`'s `sweep`/`loft`/`revolve` arms for the
path and section inputs they actually demand, and confirm a fully-determined profile is expressible with
an empty `constraints[]`. If it holds, **three of four §57 Solid tools light up with no new dependency,
no WASM and no C74 authorisation.** That is Phase 4 lane 4D.

## 5.4 — ⛔ The constraint the browser imposes, and the minimal honest answer

**The descriptor pipeline is dark (§0.2 item 4).** The shipping editor draws through the
`*FragmentBuilder` family, which imports THREE and bypasses the descriptor entirely; the kernel's
producer half is reached in production **only by `apps/bake-worker`** — and that job is itself unfed
(*"will start emitting `family.instance.placed` events after S56 D4 lands"*). So a kernel adapter behind
the descriptor is correct architecture **and invisible to users** until something turns the path on.

**Two options; the recommendation is the narrow one.**

- ❌ **Migrate the nine `*FragmentBuilder`s onto the descriptor path.** Architecturally right, and it is
  a large separate PRYZM-3 migration across ~544 files of `geometry-*`. **Not this programme's job, and
  pretending otherwise would sink it.**
- ⭐ **RECOMMENDED — mount ONE committer, for the `component` family only.**
  `composeRuntime.ts:1477-1521` already implements `runtime.scene.mount(canvas, mode)` sharing *"every
  byte of soft-fail / span / tornDown / event semantics"* with the compose-time path; it simply **has no
  caller**. The component family becomes its **first production caller**, and `ComponentCommitter`
  becomes the first committer ever constructed in a browser. A bounded, provable, single-family change
  that makes the descriptor path real for exactly the family that needs it and leaves the wall/slab
  migration to whoever owns it.

⚠ **Stated as a risk, not smuggled as a detail:** Phase 4 turns on a rendering path that has never run in
production. Lane 4E carries it alone, and its acceptance is **a rendered component instance**, not a
passing unit test — C16 **CA-21** is explicit that `success: true`, a spy, a patch-pair shape and a
read-back from the same DTO store the handler wrote are all **not** evidence.

## 5.5 — Exact geometry: staged, with the trigger written in advance

**Do not build a kernel** (§7 carries the recommendation). The geometric-model consequence is only this:
the model must be able to *express* exact geometry before any evaluator can supply it — and it already
can. `ProfileEntitySchema` carries `point | line | arc | circle | spline`, so **the canonical model is
already exact-capable and only the evaluator is not.** The mesh stays *"a projection/cache, never
authoritative"* (§19) because it already is.

⛔ **And §20's prohibition must be kept true as it stops being vacuous.** There is no 3-D topology today,
so *"no canonical `Face 381` / `Edge 27` references"* holds **vacuously**. It becomes live the moment a
kernel arrives: references must be **stable feature lineage plus semantic references**, and an ambiguous
reference must **FAIL CLOSED**. ⚠ `PickResult.faceIndex` exists, is produced by `bvh-pick`, is consumed
by nobody (`grep -rn "faceIndex" apps/editor/src` → no matches; `plugins` → no matches), **and is not
populated by `gpu-pick`, the production strategy on capable devices** — so building sub-object identity
on it would violate §7 and §20 on day one *and* work on only one pick backend.

---

# 6 · PROPOSED CONTRACT CHANGES

⛔ **The binding procedural rule, first, because it has failed six times.** Minting a contract requires
the **C00 index row to move in the same commit.** CLAUDE.md records this shape failing at
C67 → C81 → C84/C85–C99 → C100 → C76 → the C101–C107 block, and notes that *"the fifth recurrence landed
inside the correction notice for the fourth."* It is now enforced by
`tools/ga-gate/check-contract-index-equivalence.ts`, which compares the file SET against the README's
row SET **in both directions** — sets, never a count, precisely because a count can be right while the
range is wrong. **Every Phase-3 lane below runs that gate as its acceptance test.**

## 6.1 — CORRECTIONS to existing contracts (highest priority: these are wrong *today*)

| Contract | Change | Evidence |
|---|---|---|
| **C05 §4** | ⛔ **CORRECT the `.pryzm-family` description in place.** It names a `family-descriptor.json` and a `metadata.json.type='family'` that do not exist. | §0.3 F1 — `grep -rn "family-descriptor"` → **no output**; the real layout is `family-types.ts:8-17` |
| **C15 §0.1.1** | ⛔ **CORRECT the slab and roof rows.** They read *"No opening model exists … UNBUILT, not routed elsewhere"* and are marked **declared absences, not clearances (C84 EI-6)** — but `OpeningData` exists, and `CreateOpeningCommand` / `CreateRoofOpeningCommand` are registered and bus-reachable. The contract's own grep searched `packages/schemas/src` for `penetration\|shaftOpening\|slabOpening`; **the grep was correct and the vocabulary was wrong.** | Lane G §G.1.5 |
| **C74 §6 front-matter** | **CORRECT** *"all three gates UNBUILT at stamp time"* — all three exist; two run green with executed positive **and** negative controls. | Lanes C §2.6, H §4.1 |
| **C25 §1.7** | **RESOLVE before any component IFC mapping is designed.** Two export pipelines; the contract governed the dead one until 2026-08-23, and §1.1's *"every export targets IFC4X3"* is **false of the path users actually use** (L-8560, OPEN). | Lane G T-2 |
| **C67 §1.2** | **RE-MEASURE.** Its numbers are stale in both directions: capabilities 56 → **77**, commands 325 → **361**, and `UNDECLARED` 0 → **13 against a baseline of 0** — a breached hard-0 ratchet, with two whole element families and one compound system shipped chat-invisible. | Lane E §E.1.0 |

## 6.2 — EXTENSIONS to existing contracts

| Contract | Extension | Why an extension, not a mint |
|---|---|---|
| **C65 — Element Type System** | Add the **T0 / DEFINITION tier** above T1–T4, or state explicitly that ComponentDefinition is a separate contract. C65 §2 already declares four tiers and says T3/T4 are *"DECLARED HERE so the architecture leaves room for them"* — the same courtesy is owed upward. | The Type tier is C65's subject; the Definition tier sits directly above it |
| **C71 — Graph & Topology** | Add `instantiates`, `specializes`, `dependsOnDefinition` to §2.1 REQUIRED, each with a named first consumer under §2.6's four obligations; extend §1.2's six semantics with a **node-kind axis** (the graph is instance-id-only today). | C71 owns the vocabulary; §2.6 is the addition rule it wrote for exactly this |
| **C15 — Hosted Elements** | Add the generalised `HostingCapability`, lifting §2.1's host-frame rule as the universal invariant. ⚠ §0.1.1's closing rule — *"a surface missing any one of the four gets a sibling mechanism, not an amendment to this contract"* — must be **consciously overturned or consciously kept**. It is a decision (§11 D-HOST), not an oversight. | C15 owns hosting |
| **C86 §10.1 / §10.6** | Any universal profile work amends these: §10.1 **PR-1** (*"every wall-body arm consumes the outline THIS function returns. ⛔ No arm may re-derive an arc"*), **PR-2** (`rectangular` stays byte-identical on every arm), **PR-8** (no rise field), and §10.6 (the authoring technology). ⚠ **Adding a `rise` parameter to a segmental arch amends PR-8 — a contract change, not a feature.** | C86 owns the opening profile and the outline surface |
| **C73** | State that an adopted kernel is **driven from `tolerance.ts`**; gate E4's shrink-only rule extends to it. | C73 owns tolerance and determinism |
| **C74** | Record the **§4.2 (a)/(b)/(c) answer for the `.pryzm-family` sketch-profile family** — a record *inside* C74, not a new contract. ⛔ Answer (a) and (b) honestly first: `horizontal`, `vertical`, and distance against a fixed reference are VALIDATION or ENFORCEMENT, not SOLVING; C74 notes *"the first two are usually the end of it."* **Authorisation attaches only to the sub-family that reaches (c), and only to that sub-family.** | C74 owns the classification and the authorisation gate |
| **C69** | Register every `component.*` verb from its first commit. **A verb is a wire identifier** — written into `project_command_log` and replayed in collaboration history — so it is permanent, and renaming it is governed by C47. | C69 owns the register |
| **C84 §6** | The `component` element family needs the twelve mandatory sections. **C107 is the worked template.** | C84 binds every PR touching an element family |
| **C100** | The `MaterialSlot` → `materialId` binding joins C100's ladder rather than minting a sixth vocabulary (C84 EI-8). | C100 owns materials |
| **C03 §4.10** | The `levelId`-refusal precedent extends to any component parameter that is really a **routing key** rather than a value. ⚠ Do not "tidy" the deliberate `baseLevelId`/`topLevelId` asymmetry — a span is not a routing key. | C03 owns the generic parameter path |

## 6.3 — NEWLY MINTED contracts (⛔ each moves its C00 index row in the same commit)

| New | Subject | Why nothing existing can absorb it |
|---|---|---|
| **C110 — PARAMETER, UNIT & EXPRESSION MODEL** | The parameter object; quantity kinds; the expression grammar and its diagnostics; the resolution order. **Must decide three open questions in its first version:** (1) `defaultValue`-vs-`expression` precedence (§0.2 item 6); (2) the mm-vs-m canonical length unit (§3.7); (3) whether `FamilyParameter` and `ParametricParameter` are one model or two. | **Lane C's GAP-1 and the highest-priority gap in the audit.** No contract governs parameters, formulas or units. `packages/family-runtime` — the most spec-relevant package in the programme — cites only `PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §7.5`, **a phase plan, which sits below SPECs and is not in the suite at all.** In the repo's own idiom: *this subsystem has no authority to be wrong against.* |
| **C111 — COMPONENT DEFINITION & THE `.pryzm-family` MODEL** | The §4 canonical model: SemanticClass · Definition · Type · the instance-is-an-element ruling · the feature graph · representations · hosting capability · the envelope and its versioning. **Supersedes C05 §4's description**, which then cross-references it rather than restating it. | C05 governs persistence and file format generally and is **wrong about this one** (§0.3 F1). The component model is a subject in its own right — and it is the subject the entire programme turns on. |
| **C112 — CONNECTORS** | Identity, position, orientation, kind, allowed connections, dimensions, compatibility; the `connectsVia` edge and its `authoredBy` keying. | **Nothing to amend.** §3.3 — the one true greenfield subsystem in the audit. |
| **C113 — CLASSIFICATION & INFORMATION REQUIREMENTS** ⏳ *Phase 6, not Phase 3* | Multiple classification REFERENCES (§33) and IDS-style requirement declarations with the `✓ Complete / ⚠ Missing` surface (§32). | §3.8 — bSDD 0 consumers, IDS absent, Uniclass 2 prose hits. **Deliberately deferred**: mint it when the reader/validator exists, so the contract describes something real rather than becoming the next `C103`-shaped unminted-and-cited slot. |

## 6.4 — ADRs required

1. ⭐ **The ADR-0316 verdict** — merge / bridge / retire `apps/component-editor`. **It must supersede
   ADR-0316 explicitly**, because ADR-0316 §5 names in advance the six conditions that void its own
   blessing and **this spec triggers at least four**: the Family Creator gains a project (§34) · two
   users edit one family (collaboration) · the 3-D view stops being lazy (§57–62) · the editor embeds it
   in-process (§61) · family verbs become durable. ⛔ **And it must be taken against a working
   instrument:** `check-single-compose.ts:216` prints the **string literal** `"0 rivals"` while the same
   run enumerates one and names `familyEditorRuntime.ts` (**L-12830, OPEN, P0**). **The gate this
   programme most needs to trust about second composition roots is currently printing a false green
   about exactly this application. Fix it before the decision, not after.**
2. **The instance-is-an-element ruling** (§4.2) — it adds an element family and changes C84's census.
3. **The kernel-staging ADR** (§7) — recording the Stage-1 trigger *in advance* so it cannot be
   rationalised later, with the LGPL four-condition recipe as acceptance criteria.

---

# 7 · OPEN-SOURCE TECHNOLOGY RECOMMENDATION

**⛔ Do not build a kernel.** Spec §17 says so, and Lane H's evidence says PRYZM already runs one.
**ONE staged recommendation, with its adapter boundary and its trigger:**

## 7.1 — The recommendation in five lines

1. **Kernel: none newly adopted.** `@pryzm/geometry-kernel` + **`manifold-3d`** (Apache-2.0; 82,466
   downloads/week; the CSG backend that replaced CGAL in OpenSCAD, and shipping in Blender, Godot,
   Babylon.js, BRL-CAD and IFC.js) **is** the kernel. Keep it as the permanent **mesh** evaluator. This
   is the strongest technology position PRYZM currently holds and nothing here recommends replacing it.
2. **Named staged exact evaluator: OCCT via `replicad` + `replicad-opencascadejs`** — MIT wrapper,
   LGPL-2.1-only + `OCCT-exception-1.0` WASM. The only OCCT path that is simultaneously **current**
   (published 2026-08-21 / 2026-08-14), **pre-packaged for browsers**, and **years old (2021) rather
   than months**. *It is not the newest and not the fastest; it is the one with a track record, which is
   what §17 asks for.*
3. **Adapter boundary: the existing one** — `producer → BufferGeometryDescriptor → committer`, frozen by
   ADR-009, lint-enforced by `pryzm/no-three-in-kernel`. A second evaluator becomes
   `producers/exact/*.ts` returning the same descriptor, with the exact shape handle kept as a **cache
   side-artefact** keyed by spec §73's identity (`definition hash + parameter state + kernel version +
   representation settings` — the first two of which already exist as `schemaHash` and the resolver
   output). **No new layer. No new adapter.**
4. **Solver: PlaneGCS (`@salusoft89/planegcs`) is the right technology and is currently FORBIDDEN.**
   Both halves are true and the order matters. Route through **C74 §4.2 (a) → (b) → (c)** in writing,
   per family, first. The `SolverPorter` port and `PlanegcsAdapter` were written for exactly this
   package: on the day it is authorised the binding replaces **one line in a constructor**, and the
   retirement test (*"scaffold retirement guard"*, asserting `kind === 'mock'`) **fails on purpose**,
   forcing the scaffold header out in the same change.
5. **Standards: wire the bSDD client that already exists** (`packages/plugin-sdk/src/bsdd.ts`, exported
   from the barrel, **zero call sites**) — the cheapest §29–33 win in the estate, no new technology at
   all. Build an **IDS reader + validator** in plain TypeScript later; **do not build the authoring
   half yet.** **Take OpenUSD's concepts — layers, variants, references, overrides map cleanly onto §6's
   Definition→Type→Instance and §25's nesting — but NOT its runtime**, which would be a second
   scene-composition model beside the canonical one, i.e. a §5 violation.

## 7.2 — The staged trigger, written in advance so it cannot be rationalised later

- **STAGE 0 — now, no new dependency.** Deliver the §57 Solid group from the six existing producers; add
  `pattern`/`array` as pure transform-level producers (no kernel needed). **Test the §5.3 tessellation
  hypothesis first** — very likely the largest capability gain available anywhere in this programme, at
  zero dependency cost.
- **STAGE 1 — adopt an exact evaluator when, and only when, a §57 operation that mesh geometry cannot
  honestly deliver is actually required by a shipped component**: concretely **fillet, chamfer, or
  shell/thicken** on a real element family, or **exact curve persistence** demanded by §67.
  ⛔ **Spec §75 means the alternative to adopting is NOT SHIPPING THE BUTTON** — never shipping an
  approximation labelled as a fillet.
- **STAGE 1 preconditions, as acceptance criteria on the adoption ticket:** worker-offload (§71 — the
  WASM must not run on the main thread) · `GeometryStatus = Invalid` with structured diagnostics on
  kernel failure (§73) · **all tolerances driven from `tolerance.ts`** (C73) · the four LGPL conditions
  in §7.4. ⚠ **And note what a kernel would strain:** `check-deterministic-regeneration` demands
  **byte-identical** regeneration, while C73 §5.4(b) already flags cross-machine determinism as
  **UNPROVEN even for today's pure-TS producers.** A WASM evaluator makes that question urgent.

## 7.3 — Rejected outright, recorded so the questions are not re-opened

| Rejected | Reason |
|---|---|
| **`brepkit`** | 🔴 **AGPL-3.0-only or commercial.** The network clause is incompatible with closed-source SaaS. |
| **SolveSpace-derived** | 🔴 **GPL-3.0.** Same class. No maintained browser build; the npm package is a self-declared *"port (attempt)"* last published 2022. |
| **`three-bvh-csg`** | Duplicates `manifold-3d`, and being THREE-coupled it **cannot live in the kernel** (`pryzm/no-three-in-kernel`). PRYZM already has the better, THREE-free option. |
| **`opencascade.js` direct** | **Dormant** — `time.modified` 2023-03-23, three and a half years without a publish; v1.1.0 self-declared *"unusable due to an error during the initialization phase."* ⚠ Its GitHub releases page shows dates without years and reads as recent — a trap. |
| **`@thatopen/fragments`' `GeometryEngine` as a kernel** | It exists (booleans, extrusion, sweep, profile builders), PRYZM does not call it, and it is **IFC-shaped**: its geometry is produced *from* IFC entities and its boolean exists to evaluate `IfcBooleanClippingResult`. Right tool for §29–33, wrong tool for §17–20 — which is exactly how PRYZM has it scoped today. **Do not promote it.** |
| **ToubkalCAD · OpenZCAD** | Both return `E404` from the npm registry and no matching project surfaced in search. **Unverifiable — do not carry the spec's two names forward as candidates.** Recorded rather than silently dropped, per §75. |

**Watch-list, re-evaluate 2027 — `occt-wasm`, `brepjs`, `opengeometry`.** All technically interesting;
all **five to seven months old** with auto-release version trains and no named production users. Spec
§17: *"never auto-select the newest project."* ⚠ `opengeometry` has **192 downloads/week** — adopting it
today would make PRYZM its largest user and de-facto maintainer.

## 7.4 — Licence colours, and the LGPL recipe

🟢 **GREEN** — `manifold-3d` (Apache-2.0) · `three` (MIT) · `rhino3dm` (MIT) · `@thatopen/*` (MIT) ·
`web-ifc` (MPL-2.0) · `replicad` wrapper (MIT) · `three-mesh-bvh` (MIT).
🟡 **YELLOW** — OCCT WASM (LGPL-2.1-only + `OCCT-exception-1.0`) · `@salusoft89/planegcs`
(LGPL-2.0-or-later). Usable **with the recipe below.**
🔴 **RED** — `brepkit` (AGPL-3.0) · SolveSpace (GPL-3.0).

⚠ **`npm view <pkg> license` is a claim, not evidence.** `occt-wasm` reports `MIT OR Apache-2.0`; that is
true only of its build tooling and TS wrapper — its own README says *"Compiled WASM output:
LGPL-2.1-only (inherits from OCCT)."* **Anyone reading the npm metadata alone concludes MIT and is
wrong.**

**The four conditions that make an LGPL WASM artefact safe here — and the one that fails it:**
1. Ship the `.wasm` as a **separate, fetched artefact** — never inlined into application JS.
2. Keep it **replaceable by the end user** — expose the module URL as configuration. ⭐ **PRYZM already
   does this twice**: `Rhino3dmLoader.setLibraryPath('/libs/rhino3dm/')` and
   `PlanegcsAdapterOptions.wasmUrl`. The pattern is already in the repo.
3. **Prominent notice** in the third-party licence page; carry the LGPL text and the OCCT exception with
   the distributed artefact.
4. **Publish no private modifications** — take upstream builds unmodified, or publish the patches.
⛔ **The failing condition:** compiling the LGPL WASM *into* a single application bundle, or statically
linking it so the user cannot replace it, turns an ordinary dependency into a distribution problem.

⚠ **Not established, stated so a blank is not read as clearance:** nothing was benchmarked — every
performance judgement above is reputational, not measured on PRYZM's own scenes; §7.4 is an engineering
reading of LGPL §6 plus the OCCT exception, **not legal advice**; and `replicad` is a
**single-maintainer** project, a real bus-factor risk on the Stage-1 path and the strongest argument for
keeping the adapter boundary strict.

---

# 8 · HOW THE WINDOW EDITOR AND THE WALL PROFILE EDITOR MAP INTO IT

## 8.1 — ⛔ Two naming traps that must be cleared before anything else

**Trap 1 — there is no file called `WindowEditor`.**
```
$ grep -rl "WindowEditor" apps/editor/src packages/geometry-window plugins/window --include=*.ts
(no output)
```
What the founder calls "the Window Editor" is a **four-surface federation**:

| # | Surface | File | LoC | Reachable via |
|---|---|---|---|---|
| 1 | Placement mode bar | `apps/editor/src/ui/WindowModePicker.ts` | 278 | live while the window tool runs |
| 2 | Instance parameter surface | `packages/geometry-window/src/WindowSection.ts` | 744 | `PropertyPanelBodyRenderer.ts:37` |
| 3 | Type authoring modal | `apps/editor/src/ui/property-panel/FinishTypeEditorModal.ts` | 1,049 | `FinishTypeAuthoringActions.ts:132` |
| 4 | Instance outline dialog | `apps/editor/src/ui/WindowOutlineEditorDialog.ts` | 201 | `PropertyPanelBodyRenderer.ts:42` |

**Trap 2 — ⭐ the spec's central instruction for the Wall Profile Editor has ALREADY BEEN EXECUTED.**
§57–62 says *"likewise the Wall Profile Editor, whose profile/sketch functionality becomes generic
infrastructure."* It became generic infrastructure on **2026-08-25**, ratified by the founder, under
**C86 §10.6** and **ADR-0373**. `ElevationOutlineSurface.ts:4-7` says so in its own words:

> *"THE one SVG elevation-drawing surface, **EXTRACTED from `WallProfileEditor.ts` so the wall profile
> modal and the window outline section are two CALLERS of one surface rather than two implementations of
> one idea.**"*

I verified the callers myself: `grep -rln "ElevationOutlineSurface" --include=*.ts apps packages plugins`
(excluding tests) → the definition plus **`WallProfileEditor.ts`, `FinishTypeEditorModal.ts`,
`WindowOutlineEditorDialog.ts`**. ⛔ **Proposing to build this is the single worst outcome available to
this programme.**

## 8.2 — The mapping, surface by surface

| Existing | Becomes, in the universal engine | Cost |
|---|---|---|
| **`ElevationOutlineSurface.ts`** (389 ln, L7) — the one SVG sketch surface: select / polyline / 3-click arc / presets / **absolute ortho** / vertex drag with snap / midpoint insert / delete-with-guard / `refitTo`, and an invertible dimensional contract (*"`scale` is ONE number for BOTH axes … `toModel(toPx(p)) === p` … RESIZING CHANGES `scale` AND `pad` AND NOTHING ELSE — the ring is metres, never pixels"*) | ⭐ **THE universal sketch surface.** Generalise its **SUBJECT** from `WallProfileVertex[]` in a `(u,v)` extents box to a **`Profile` on a `ReferencePlane`**, and add a **constraint-glyph layer**. Its dimensional core, its ortho ruling and its *"no store, no bus, no THREE, no rAF — hand rings to callbacks"* split are reusable **verbatim**. | **Additive.** Neither constraints nor reference planes require touching the dimensional core. |
| **`WallProfileEditor.ts`** — the **three-file split**: L2 subject/port (123 ln) · L2 pure sketch model `OutlineAuthoring.ts` (216) · L7 surface | ⭐ **THE TEMPLATE for every universal-editor surface.** ⚠ Its L7 header already records which alternatives were refuted and why — including the one a newcomer proposes first (move the chrome helpers into `ui-base`), refuted **by measurement**: `ui-base` is L3, `geometry-wall` is L2, so it swaps one violation for another (`§WPE-CHROME-LAYER`, L-10200). | **Zero.** Copy the pattern. |
| **`OpeningProfile.ts`** (1,015 ln) — five kinds (`rectangular \| round-arch \| segmental-arch \| circular \| custom`), THREE-free, hashable, with a **declared consumer law** (C86 §10.1 PR-1: *"every wall-body arm consumes the outline THIS function returns. ⛔ No arm may re-derive an arc"*) | **PROMOTE, do not replace.** It becomes the **Profile PRESET LIBRARY** of the universal `Profile` type — the five kinds become named presets producing `ProfileEntity[]`, and PR-1's law generalises into §5's *"one producer per representation"* rule. ⭐ Its own header already names the missing consumer: *"(one day) the kernel producer."* | Medium — the generalisation is real work, but the law and the tests already exist. |
| **`resolveWindowDimensions()`** (`WindowDimensions.ts:262`) — instance → type → canonical default, in ONE function called by placement, the plan symbol **and** the 3-D preview, *"Parity BY CONSTRUCTION, not by convention (C11 §3)"* | **GENERALISE into the resolver ladder — which `family-runtime`'s `resolveParameter` already is.** Spec §12's ordering is this ladder **plus a definition level and a derived level**. The window's hand-written ladder becomes one instantiation of the generic one. | The ladder exists on both sides; this is a merge, not a build. |
| **`WindowSystemTypeStore`** + `WindowTypeChange.ts` (`PRESERVED_ON_TYPE_CHANGE`, re-running the record through the one creation chokepoint rather than patching fields, *"choosing a different window type and keeping the previous type's pane grid is precisely the 'type in name only' outcome the dropdown exists to avoid"*) | **BECOMES the ComponentType tier's behaviour spec.** `PRESERVED_ON_TYPE_CHANGE` is the **hand-written override boundary that a real parameter-scope model replaces** — it is exactly `instanceOverrides`. | Direct translation. |
| **`ElementTypeAuthoringRegistry.ts`** (385 ln) — declaration-not-branch, with `editorKind: 'layer-stack' \| 'finish-set'`, and it **refuses to offer "New type…" for a family whose store is not project-scoped (C13) or does not round-trip (C05)**, because *"offering 'New type…' for those families would ship a control that appears to work and quietly loses the user's work at the next save"* | ⭐ **BECOMES §59's category modal.** *"The category supplies semantic defaults/templates, not a separate geometry engine"* **is this pattern**, already load-bearing across six families and two `editorKind`s. Its persistence/scoping gate is the honesty mechanism §75 needs for the 17-category creation flow. | **Zero to extend, one row per category.** |
| **`FinishTypeChatStrip.ts`** (242 ln) — chat *inside* the type editor; *"two ways in, ONE draft, one validation, one command, one read-back"*; it **dispatches no command of its own** and Create still travels `onSave → bus.executeCommand('elementType.create')` | ⭐ **THE §76 gate-D template**, already implemented, with the two shortcuts it refuses documented by name. | Zero. |
| **`ElementPreviewCanvas` / `ElementPreviewRenderer`** (1,920 ln) — ONE offscreen WebGL context for every preview in the application, **no animation loop ever** (*"an idle preview costs zero frames … it is not 'cheap'; it is not running"*), C100 material resolution with an UNRESOLVED colour | **REUSE for previews. ⛔ DO NOT grow it into the authoring viewport.** It has **no pan, no section, no isolate and no picking at all** (`grep -n "raycast\|Raycaster"` over `element-preview/*.ts` → nothing; it is a *blit of an offscreen render*, so there is nothing in it to click). Take its **one-context rule** and its **no-rAF rule** as constraints on any new viewport. | Zero to reuse; **large** to convert — which is why the recommendation is not to. |

## 8.3 — ⛔ The direct contradiction §11 must resolve, not paper over

Spec §57–62: *"the existing Window Editor 3D viewport is reused/evolved … 3D is a first-class authoring
environment"*, listing orbit, pan, zoom, section, isolate, **selection incl. face/edge/feature**,
parameter and dimension manipulation, material preview and host preview.

**Measured, that sentence describes two different things and neither has that feature set.** The type
editor's showroom has orbit and zoom but **no pan** (`OrbitState` is `{yaw, pitch, zoom}` and nothing
else), no section, no isolate, no picking and no host preview — *"a schematic massing of the type, not a
pixel-identical copy of the placed element."* The **main** viewport has orbit/pan/zoom, isolate and
section, but its **selection is element-level only** (§3.10).

⛔ **And C86 §10.6 has already ruled on the question, the other way:** *"the 3-D viewer in the type
editor stays the PREVIEW (D8), **never the authoring surface**"* — with the reason recorded in
`WallProfileEditor.ts:26-38`: *"there is no camera in this repo guaranteed to be looking at that plane."*

**So spec §57–62 contradicts a live, founder-ratified contract clause.** That is **decision D2 in §11.**
It must be taken explicitly, not assumed by a lane that reads only the spec.

## 8.4 — §76 gate J: what "still works" means, concretely

Gate J is *"existing Window and Wall functionality still works"*, and §74 makes it a **regression
requirement**. The regression surface is named and testable today:

- `apps/editor/src/ui/property-panel/__tests__/openingProfilePanelReachability.spec.ts:140,145` — which
  **greps the importer's own source text** to assert the port is supplied, because the port pattern used
  here (`setWindowSectionCommandManager`, `setWindowOutlineEditorOpener`) is a **dead-feature generator**
  when nobody supplies the implementation. `WindowSection.ts:63-66` says so in as many words.
- The three `ElevationOutlineSurface` callers must keep rendering and committing.
- **C86 §10.1 PR-2** — `rectangular` must stay **byte-identical on every arm**; a gasket for a rectangle
  must never be emitted.
- ⛔ **T14 — there are TWO `WindowStore`s and one is dead.** The live one is
  `packages/geometry-window/src/WindowStore.ts` (205 ln, what `WindowBuilder` subscribes to, what
  renders, exports and persists). `plugins/window/src/store.ts` is a *"pure DTO store"* that
  **nothing that renders, exports or persists reads** (§FIX-HOSTED-TYPE-CHANGE, L-620) — and its README
  still advertises itself as *"full vertical slice"*. **A universal editor built against
  `plugins/window` would dispatch commands that change nothing the user can see.**
- ⚠ **T7 — adding a field to a window and forgetting the Zod schema DELETES IT ON SAVE.** Stated three
  times in `WindowTypes.ts` because it has bitten repeatedly: `WindowStore.add` does
  `Object.freeze({ ...WindowOpeningSchema.safeParse(w).data })` and **Zod strips keys the schema does not
  declare.** Any universal parameter system that writes onto element records inherits this hazard.
- ⚠ **T8 — import the pure subpath, never the bare barrel.** `§OUTLINE80-CYCLE-FIX` / L-11261: the bare
  `@pryzm/geometry-wall` barrel drags `WallTool → @pryzm/command-registry → geometry-window → the barrel
  again`, mid-load. Use `@pryzm/geometry-wall/opening-profile`, `/profile-editor`, `/outline-authoring`.

## 8.5 — What the two editors prove PRYZM already has — and the one thing they prove it cannot do

**Already has, all reachable:** a ratified, reused, generic elevation-sketch surface with an invertible
metric contract · a single-producer profile architecture with an enforced no-re-derivation law · a
working *"either UI or chat, one draft, one command"* authoring loop · a declaration-driven,
persistence-gated type-authoring registry · **and, scored against §63's own enumeration: type ✅ ·
instance ✅ · parameters ✅ (untyped) · profile ✅ strong · sketch ✅ strong · materials ✅ · host ✅ strong ·
placement ✅ · 2-D representation ✅ strong · 3-D representation ✅ · persistence ✅ · AI creation ✅ · AI
modification ✅.**

**Cannot do — and it is one thing, not thirteen: GENERATE GEOMETRY FROM AN AUTHORED DEFINITION.**
In every case above the *shape* is authored (a ring, a kind, a parameter set) and the *geometry* is
produced by hand-written TypeScript compiled into the app — `WindowBuilder.ts`, **2,086 LoC, one per
family.** No definition, no feature graph, no formula, no kernel evaluator behind the seam, no code
surface. **A second family costs a second 2,000-line builder.**

> That is precisely §77 Phase 6's own test — *"if the second category needs excessive special cases,
> refactor the architecture before continuing"* — and it is the strongest possible argument for doing
> §77 Phases 1–3 (canonical model → technology → contracts) **before any UI.**

---

# 9 · AI / RAC INTEGRATION ARCHITECTURE

**Nothing in this section is a new concept.** Every arrow already exists somewhere in the tree. The
architecture is a set of **connections**, and it is stated that way deliberately: §1 forbids a rival, and
Lane E found that PRYZM has **two** AI authoring systems already, one of which nothing calls.

## 9.1 — Where PRYZM actually stands against §39–§45

| Spec | Question | Verdict | The code that decides it |
|---|---|---|---|
| **§40** | Does AI dispatch **only** through the command bus? | **YES for every model mutation; NO for two declared view-state escapes** | Every mutating path is `bus.executeCommand` at `ZeroTokenChatBridge.ts:1629`/`:1644`. The exceptions are `localAction: 'setActiveLevel'` (a direct `projectContext.activeLevelId =` assignment) and `'applyVisibilityIntent'` (a bus dispatch **plus** a direct THREE-scene projection). ⛔ **But the dispatch carries NO ACTOR** — ADR-0324's `CommandExecutionContext` is accepted by `CommandBus.ts:331` and **never passed**, so an AI-authored and a hand-authored command are byte-identical in the event record. |
| **§41–42** | Can AI create **INTENT** (constraints, formulas), or only **values**? | **VALUES ONLY, in production** | `grep -ic "formula"` over `ChatCapabilityRegistry.ts`, `ZeroTokenResolver.ts`, `LocalNaturalLanguageResolver.ts` → **0, 0, 0**; and `grep -rnE "type\s*[:=]\s*'[a-z][\w-]*\.(addConstraint\|constraint)"` over `plugins` and `apps/editor/src/engine` → **no output**. ⭐ **The two things that WOULD satisfy §41 are already written and unwired:** `apps/component-editor/src/ai/toolRegistry.ts:171-184` declares five real `constraint.*` AI verbs where **`addDistance` already accepts a parameter NAME in place of a number** — the only place in PRYZM where an authored value may be a reference rather than a literal — and `packages/family-runtime`'s expression engine. |
| **§43** | What context does AI receive? | **The resolver gets 17 typed fields. The LLM gets THREE LINES.** | `ResolverContext` (`ZeroTokenResolver.ts:256-273`), built at exactly one site. `ResolverSelection` is **two fields** — `elementId`, `elementType`. `buildPlannerFacts()` renders a selection count, the level list, and **wall type names only** — the window, door, slab, ceiling, stair, handrail, lighting and curtain-wall catalogues sit in the context and are **never rendered into the prompt**. No parameters, constraints, feature graph, materials, host, geometry status or relationships reach the model. |
| **§44–45** | Are diagnostics structured enough for a repair loop? | **The OUTCOME classification is excellent; the DIAGNOSTIC CONTENT is prose; and the AI-as-proposer loop does not exist** | Structured: `DispatchOutcome`'s five-member union + the pure, separately-tested `classifyDispatch`, with `indeterminate` as a first-class state and an **exhaustive** switch (*"adding a sixth engine state must break the build here rather than fall through to 'Done'"*). Prose: `{kind:'refusal', reason: string, suggestions: string[]}`. ⭐ **A real repair loop exists — for EDITOR-triggered refusals**: `WallMoveClashProposal.ts` re-runs every candidate through the whole placement predicate *"before it may be offered"* and **"IT ASKS. IT NEVER AUTO-APPLIES."** Absent: any path from a failed chat command back into `LlmPlanner`. |

## 9.2 — The architecture (every arrow exists; the two dashed boxes are the work)

```
   utterance (chat)   ·   visual gesture   ·   component code (§46-56)
           │                    │                        │
           └────────── ONE resolution ladder ────────────┘
              ZeroTokenResolver: §PLAN → t0 → t1 → NL → LlmPlanner
              (LLM vocabulary AND field shapes GENERATED from the registry)
                              │
                  SemanticIntent ∪ ScopeDescriptor ∪ ValueRefs
                              │
                   applySemanticIntent   ← THE ONE semantic authority
                              │
        ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┴ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
        ┆  MISSING: a ConsequencePlanner call BEFORE dispatch  ┆
        ┆  ADR-0322 ConsequencePlan{planId, planHash,          ┆
        ┆  stateHash, impact, undetermined, refusals}          ┆
        └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┬ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
                              │
   Confirm card over the PLAN (not a prose string)  ← ADR-0324 §4/§5
                              │            ▲
                              │            └─ repair: a STRUCTURED diagnostic
                              │               (ResolverDiagnostic | ConsequenceRefusal)
                              │               → re-plan → re-ask
                              ▼
  bus.executeCommand(type, payload, { context:{actor:{kind:'ai'}, origin, approval}, plan })
                              │              ▲
                              │              └─ ADR-0324 §1-2 ACCEPTED, implemented, UNUSED
                              ▼
                 authoritative stores (ADR-0318 elements slot)
                              │
    ┌────────────┬────────────┴────────────┬──────────────────────┐
 geometry   ProvenanceStore          GraphQueryService      BATCH_REPORT_EVENTS
            (C23 AIArtefact —        (graph.query/… —        → classifyDispatch
             wired, never written)    not a capability)        → five honest states
```

## 9.3 — Seven wiring jobs, in dependency order. All seven are connections, not inventions.

1. ⛔ **Extend `check-chat-capability-coverage.ts`'s `HANDLER_GLOBS` FIRST** (`:203-207` scans exactly
   **three files**). A component surface registered outside those three would be **born invisible to the
   one gate that exists to prevent that**, and the gate's own §R5-FLOOR comment anticipates the class:
   *"a `HANDLER_GLOBS` typo … would print 'UNDECLARED: 0' over a repository it never read."* Its floors
   catch a *total* miss, not a *partial* one. ⚠ Today's reading is **RC=3, `UNDECLARED: 13` against a
   baseline of 0** — get it back to 0 before adding a surface to it.
2. **Stamp the actor.** Pass `{ context: { actor: {kind:'ai'}, origin: {surface:'chat'} } }` at
   `ZeroTokenChatBridge.ts:1629`/`:1644`. Closes C09 §1 and half of ADR-0324 §1. **~2 lines.**
3. **Write the artefact.** One `ProvenanceStore` append per chat turn — the store is already composed,
   serialized and hydrated. Closes **C23 §1.1**, which has been NOT-YET-TRUE since it was written.
4. **Build `check-deferral-blockers.ts`** (C67 §4 rule 15, still `No such file or directory`).
   **192 deferrals (131 Class-B + 61 `CHAT_UNAVAILABLE`) whose reasons nothing re-validates**; C67
   §1.8.4 measured the cost once — eleven element families dark behind a blocker already satisfied.
5. ⭐ **Make the Confirm card take a `ConsequencePlan`.** Change `ZeroTokenUiHooks.confirm` from
   `(summary: string)` to a plan, and bind approval to `planHash`. **This is the single
   highest-leverage item**, because the repair loop becomes possible only when there is something to
   re-plan *against*. ADR-0324 §4: *"A proposal card without the consequence set is the specification
   gap, not a confirmation."* The substrate — `ConsequencePlan`, `PredictedVsActual`,
   `PlanStaleRefusal`, `PlanDivergenceVerdict`, plus **seven certification gates** — is **built and
   consumed by nothing.**
6. **Give the component-editor AI bridge a production caller and merge its tool registry into C67's.**
   `createAiHostBridge` has **zero production call sites**. Its 12 verbs become `ChatCapability` rows
   with `probe` + `commandProof`; its hand-rolled validators become `CapabilityValueSource` members
   (the union has 21 today; add `component-definitions`, `component-types`, `parameters`, `materials`).
   ⚠ **Two reconciliations are owed first:** its `executeBatch` collapses a proposal to **ONE** undo
   entry while the main editor's `runBatch` is **undo-NEUTRAL** (N commands = N entries) — ADR-0324 §6
   names the resolution (batches declare **Atomic** or **Progressive**); and two rival tool registries
   are a second source of chat truth, which C67 §4 rule 4 forbids.
7. **Only then add `constraint.*` and `parameter.setFormula` verbs**, pointed at
   `packages/family-runtime`'s already-built resolver. ⭐ **This is the §41–42 answer**: the value-change
   half exists (`intents/DimensionFamilies.ts`, `PropertyVocabulary.ts`); the **rule-creation** half is a
   new `SemanticIntent` member plus a bus verb — **not a new engine.**

## 9.4 — ⛔ What this section recommends AGAINST, on §1 grounds

A new AI tool-descriptor schema (use `ChatCapability` + its two proofs) · a new refusal vocabulary (use
`ChatResolutionState` + `DispatchOutcome`) · a new catalogue matcher (use `resolveCatalogueRef` — *"exact
id → exact name → case-insensitive name → unambiguous word subset; ambiguity returns null, never a
coin-flip"*) · a new place-phrase parser (use `SpatialScopeTail`; C67 §4 rule 16 forbids a second one,
and a **fifth** spelling is already deliberately left on disk) · a new expression engine (use
`family-runtime`) · a new approval queue (use `AiPlane`'s) · **and a fifth propose→consent surface** —
C83 §4.1 already counted four and named `ConsequencePlan` / `ConfirmationFlow` / `ConfirmationCard`
canonical.

## 9.5 — Two AI traps that will bite this programme specifically

- ⛔ **`§FEAT-CHAT-SYMMETRY` has NOTHING to do with geometric symmetry.** Twenty hits across the registry
  and resolvers, all meaning *capability-surface* symmetry (*"the chat can set a wall's height, so it
  should be able to set a ceiling's height"*). **A lane implementing spec §13's *"make this
  symmetrical"* will grep "symmetry", find twenty hits, and conclude the feature exists. It does not** —
  `symmetric` has **zero** hits in the solver and the sketcher.
- ⛔ **The AI cannot CREATE any element directly**, except through five named exceptions and four
  generative controllers. `ChatCommandClassification.ts:59-72` defers **every** `*.create` verb behind
  ONE `blockedBy`: *"per-family placement grammar (coordinates/host references) in the resolver
  context."* ⭐ **The executors all exist — this is a GRAMMAR gap, not an executor gap**, and therefore a
  materially cheaper job than it looks. It is also the load-bearing gap for §64's *"create a 1200×1500
  window with a 75 mm aluminium frame."*

---

# 10 · CODE API / DSL RECOMMENDATION

## 10.1 — The recommendation: **TypeScript, and no new language** — with one existing DSL kept

Spec §47 requires evaluating TypeScript / JavaScript / Python / a constrained DSL / a declarative
geometry language, and forbids inventing a language *"without compelling architectural reason."*
**There is no compelling reason. There are three reasons against.**

1. **PRYZM is a TypeScript monorepo** — 97 workspace packages, a Zod-typed L0, and a build that already
   typechecks every surface. A new language means a new parser, a new type system, new tooling, new
   errors and a new thing to version — **against a contract suite that already has 108 members.**
2. **The runtime already exists for the half that genuinely needs a DSL.**
   `packages/family-runtime/src/expression/` is a **constrained expression DSL with an AST, no `eval`,
   unit-tagged literals and typed diagnostics.** Formulas are already a small language and should stay
   one. **Do not fold expressions into TypeScript** — they must be persisted, diffed, migrated
   (`introduce-expression`), AI-authored and validated, and a persisted `string` expression does all of
   that; a persisted closure does none of it.
3. **A DSL would be a second authoring model**, and §46 forbids exactly that: *"no separate Visual/AI/Code
   component architectures."*

**So: two layers, one of which already ships.**

| Layer | Language | Status |
|---|---|---|
| **Expressions** — `FrameWidth * 2`, `Width − 2 * FrameWidth` | ⭐ **The existing constrained DSL** (`family-runtime`) — recursive descent, 12 built-ins, unit-tagged literals, Kahn cycle detection, 8 diagnostic codes | **BUILT.** Extend the function table by backing it with `@pryzm/formula-library`'s `FormulaCatalog` (descriptors, pinned semver, arity/type validation, three typed errors) — the registration path `functions.ts:26`'s frozen literal deliberately lacks. |
| **Component code** — `component Window { … }` | **TypeScript**, executed in a capability-sandboxed Web Worker | **NEW** — `packages/component-api` |

## 10.2 — The shape

```ts
// The ONLY import a component module gets. There is no other module resolution.
export default defineComponent((c: ComponentApi) => {
  c.semanticClass('pryzm:opening.window');
  const width  = c.parameter('Width',      { kind: 'instance', quantity: 'length', default: c.mm(1200) });
  const height = c.parameter('Height',     { kind: 'instance', quantity: 'length', default: c.mm(1500) });
  const frame  = c.parameter('FrameWidth', { kind: 'type',     quantity: 'length', default: c.mm(75)   });

  // INTENT, not a number. Compiles to FamilyParameter.expression — the SAME
  // string the parameter table writes and the AI writes.
  c.derived('GlassWidth', 'Width - 2 * FrameWidth');

  const plane   = c.referencePlane('Elevation', { origin: [0,0,0], normal: [0,0,1] });
  const outline = c.profile(plane, c.presets.roundArch({ width, height }));
  c.constrain.equal(outline.edge('left'), outline.edge('right'));   // a REAL persisted constraint

  c.extrude(outline, { length: frame, materialSlot: c.materialSlot('Frame') });
  c.property('FireRating', 'EI30');
  c.host({ hostClasses: ['pryzm:wall'], insertion: 'opening', orientation: 'host-normal', requiresVoid: true });
});
```

**Every call is a contract emitter.** `c.parameter` emits a `FamilyParameter`; `c.derived` emits an
`expression` **string**, not a closure; `c.constrain.equal` emits a `ProfileConstraint`; `c.extrude`
emits a `SolidFeature`. **The output is a `FamilyDocument` — the same artefact the visual editor and the
AI produce.** ⭐ **That is §46's "one canonical component, three authoring surfaces" made structural
rather than aspirational:** the code path cannot produce anything the other two cannot, because it
produces the same document through the same Zod schema.

## 10.3 — ⛔ The capability-based security boundary (§55), concretely

**The worker gets exactly one capability object and nothing else.** Denied, and denied by
*construction* rather than by review:

| Denied | Mechanism |
|---|---|
| Network | no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon` in the worker realm |
| Filesystem / storage | no `localStorage`, `sessionStorage`, `indexedDB`, `caches`, OPFS |
| Arbitrary code loading | no `importScripts`; module specifiers other than the injected api are rejected at compile time |
| App internals | no THREE, no stores, no command bus, no DB, no renderer, no kernel objects — **none of them exist in the realm** |
| Credentials / secrets | nothing is injected but `ComponentApi` |
| Ambient non-determinism | `Date.now`, `Math.random`, `performance.now`, `crypto.getRandomValues` are **replaced with refusing stubs** (§10.4) |

⭐ **The precedent is already in the repo and should be followed rather than re-argued:**
`family-runtime`'s `evaluator.ts:5` — *"Pure, sandboxed: no global access, no I/O, no DOM, no THREE"*,
whose `walk()` has exactly one free variable, the injected scope; and `LlmPlanner.ts:60` — *"PURITY: no
DOM, no stores, no fetch. The transport is INJECTED, so ai-host stays pure and the editor owns the
relay."* **Injection at the boundary is how this codebase already does capability control.**

⚠ **A worker is an isolation boundary, not a security boundary against a determined attacker sharing an
origin.** Marketplace-distributed component code must **also** be signed (the Ed25519 machinery already
exists — `signing/schema-hash`, `signing/signature`, and `unpackFamily` already refuses on
`schema-hash-mismatch` / `signature-mismatch`) and **compile-time-validated before execution**. Say this
plainly in C111 rather than implying the sandbox is sufficient alone.

## 10.4 — The determinism contract (§54), stated as an enforceable equation

> **Same code + same inputs + same `apiVersion` ⇒ byte-identical `FamilyDocument` ⇒ byte-identical
> `BufferGeometryDescriptor`.**

Both halves are **already enforceable with machinery that exists**:
- The document half by **`schemaHash`** — `sha256(canonical(document) + canonical(ifc-mapping))` over
  `canonical-json.ts`, with a deterministic ZIP writer. Compile twice, compare the hash.
- The geometry half by **`check-deterministic-regeneration`** — D1: regenerate twice → byte-identical;
  D2: shuffle iteration order → byte-identical. ⚠ **It is currently RED** (Lane B reads it at
  **137/134**, a ratchet breach), and per `§RATCHET-EXCEEDED-IS-NEVER-DEBT` (R7 / L-836) it is **never
  absorbable via `gate-debt.json`.** **Phase 5 cannot claim determinism while its own gate is breached.**

**What determinism forbids in the API surface, and it must be forbidden by construction:** ambient time,
randomness, locale-dependent formatting, iteration over a `Set`/`Map` whose insertion order depends on
input order, and floating-point that varies by engine. ⛔ **A refusing stub is the right answer, not a
seeded shim** — a component that "needs" randomness should declare a `seed` **parameter**, which is data,
versioned, diffable and AI-inspectable. ⚠ And note C73 §5.4(b) already flags **cross-machine
determinism as UNPROVEN even for today's pure-TS producers** — so the contract must say *deterministic
on one engine version* until that is measured, rather than overstating.

## 10.5 — Versioning (§56) and round-trip honesty (§51)

- **`apiVersion` is pinned in the manifest**, exactly as `formatVersion` is, and the internal packages
  are **not** the public surface. A component targets `ComponentApi@1`; breaking it means `@2` plus a
  migrator, through the existing `MigratorRegistry`.
- ⛔ **Do not promise textual round-trip fidelity.** §51 demands the three equivalences be
  distinguished, and the honest answer is: **semantic equivalence only.**
  - **Textual** — ❌ never. A visual edit does not regenerate the author's source.
  - **Structural** — ⚠ only for documents the compiler produced and nothing has since edited.
  - **Semantic** — ✅ always. Code and visual authoring produce the same `FamilyDocument`, so every
    downstream consumer sees one artefact.
  ⭐ **And the UI must SAY so** (§75): a code-authored definition edited visually is **detached from its
  source**, and that must be a visible state with a name — not a silent divergence. The repo already has
  the idiom for this in `C74 §3.4` scaffold declarations and in `IfcElementTier`'s honest
  round-trip-fidelity tiers (`1` native editable · `2` transform-only proxy · `3` dropped).

## 10.6 — Why not the alternatives

| Alternative | Rejected because |
|---|---|
| **Python (Pyodide)** | ~10 MB WASM runtime against a repo whose nearest analogous surface holds a **180 KB gzip first-paint budget**; a second language in the toolchain; and **no gain** — the API surface is the design, not the syntax. |
| **A bespoke DSL** | §47 forbids it absent compelling reason. It would need a parser, a type system, an LSP, error messages, a formatter and a versioning story — **and the AI would have to learn it**, whereas §51 explicitly contemplates AI generating component code as an intermediate representation, which is far safer in a language with a public grammar and existing tooling. |
| **A declarative geometry language (JSON/YAML)** | This is what `FamilyDocument` **already is.** Adding a hand-written surface syntax over it duplicates the schema (**gate B**) without adding expressiveness. |
| **JavaScript rather than TypeScript** | Loses the compile-time validation that makes the capability boundary checkable before execution. |

---

# 11 · RISKS AND UNRESOLVED ARCHITECTURAL DECISIONS

**This is a first-class deliverable, not an appendix.** §11.1 answers the founder's stated top risk
directly and says what would falsify the answer. §11.2 lists decisions that are **not engineering
choices** — each needs a ruling before the phase that depends on it. §11.3 lists measured risks.

## 11.1 — ⭐ THE FOUNDER'S TOP RISK, ANSWERED

> *"The biggest risk here isn't that the editor won't be powerful enough; it's that you accidentally
> create a beautiful editor whose internal model is too weak to become the PRYZM World Model."*

**On this audit's evidence the risk runs the other way, and that is the most useful thing in this
document.** Lane F puts it exactly: *"PRYZM's editors are better than their model deserves — a genuinely
reusable sketch surface, a disciplined profile producer, honest refusals, and a real AI authoring loop —
sitting on top of `Type → Instance` with hard-coded generators and no units, formulas, features or
constraints. **The beautiful editor already exists. The weak internal model is the work.**"*

**How this proposal avoids the founder's risk — four structural commitments, not intentions:**

1. **The model ships before the UI.** §12 puts **Phase 3 (contracts) before Phase 4 (the vertical
   slice)** and Phase 4 before any editor migration. The founder's own §77 ordering says the same and
   §77 Phase 3 says *"no UI before the model/contract architecture is clear."*
2. **The instance is an element** (§4.2), so a component is a World-Model participant **on the day it is
   placed** — hosted, levelled, scheduled, tagged, undone, collaborated on, exported — rather than a
   foreign object the World Model has to be taught about later. **This is the single decision that most
   directly answers the founder's fear.**
3. **The model is semantic-first by construction, not by intention.** `SemanticClass` sits *above*
   `ComponentDefinition`; geometry is entity #10 of nineteen and is **derived, never authored, never
   persisted in the definition**; and the descriptor is frozen by ADR-009 so it cannot quietly become
   the source of truth.
4. **Every "is this real?" claim is held by machinery that already exists** — C74 §3.4 scaffold
   declarations with **retiring assertions**, `check-no-hidden-mock`, `refuseUnbacked`, the four-axis
   reachability method. §75 is enforced, not promised.

### ⭐ What would FALSIFY the claim that the model is strong enough

Stated as executable tests so the claim can be *checked*, not argued:

| Falsifier | The test | Where it comes from |
|---|---|---|
| **F-1 — the model cannot answer without geometry** | Take a placed component instance and ask for identity, category, definition, type, parameters, properties, materials, host, location, orientation, relationships, geometry status, representations and provenance. **If ANY of the fourteen must be read off a mesh, the model is too weak.** | Spec **§69** |
| **F-2 — the instance has collapsed into the type** | Place 20 instances; change ONE to `Width = 1800`; the other 19 must be unchanged. Then change the TYPE to 1600 and the 19 must follow while the overridden one does not. | Spec **§66**, §12 |
| **F-3 — intent is not retained** | *"Make glass width always opening width − 2 × frame width."* **A real, persisted formula must exist afterwards**, and changing `FrameWidth` must recompute `GlassWidth`. ⛔ **This is exactly what §0.2 item 6 shows failing silently today.** | Spec **§64**, §75 |
| **F-4 — relationships are strings** | `graph.query(typeId, 'instantiates')` must return the instances, not refuse with `unsupported-relationship`. | Spec **§34–35** |
| **F-5 — the second category needs special cases** | Deliver Door through the same engine and **count the branches**. §77 Phase 6's own instruction: *"if the second category needs excessive special cases, refactor the architecture before continuing."* | Spec **§77 Phase 6** |
| **F-6 — geometry failure destroys the component** | Force `GeometryStatus = Invalid`. **The semantic/parametric component must survive**, with a structured diagnostic, and nothing may render an approximation marked valid. | Spec **§73**, §75 |

**If F-1 through F-6 all pass on the Window slice, the model is strong enough to be the World Model. If
any fails, stop and fix the model — not the editor.**

## 11.2 — UNRESOLVED DECISIONS (each needs a ruling; none is an engineering preference)

| # | Decision | Why it cannot be taken by a lane | Blocks |
|---|---|---|---|
| **D1** | ⭐ **`apps/component-editor`: MERGE onto the canonical bus · BRIDGE via `.pryzm-family` · or RETIRE the SPA and keep its assets?** | **ADR-0316 §5 names, in advance, six conditions that void its own blessing, and this spec triggers at least four.** The rival bus has no redo, no validation gate, no store declaration, no patch pairs, no event record, no CRDT hook, no refusal values and no persistence — and §4.2.1 permitted every one of those omissions **only because family state is *"in-memory and never CRDT-merged or replayed from a persisted log."*** The spec makes the component a first-class World-Model participant, **which is precisely the clause that expires.** ⛔ **And the instrument is broken:** `check-single-compose.ts:216` prints the literal `"0 rivals"` while naming one (L-12830, P0). **Fix the gate, then decide.** Lane D's evidence points at MERGE or RETIRE. | Phases 4E, 7 |
| **D2** | **Is 3-D a first-class authoring surface (spec §57–62) or a preview (C86 §10.6 D8)?** | A **live, founder-ratified contract clause says the opposite of the spec**, with a recorded reason: *"there is no camera in this repo guaranteed to be looking at that plane."* One of the two must yield, in writing. | Phase 4F, Phase 7 |
| **D3** | **The canonical length unit: millimetres or metres?** | `family-runtime` says **mm**; `schemas/family-request/geometry.ts:28` says *"engines convert internally to metres"*; `Wall.ts:100,102` documents metres in a comment. **Two canonical length units in one repository is a 1000× defect class.** | **Everything.** Must be ruled before Phase 4A. |
| **D4** | **`defaultValue` vs `expression` precedence.** | Spec §12 says derived comes **last** (computed from resolved inputs). The code says defaults **pre-empt** derived, silently (§0.2 item 6). **Reconciling them is a canonical-model decision.** ⚠ And the test suite cannot see it: `resolveParameter.test.ts:50` is titled *"expression is used when no default and no override"* — the both-present case is untested. | Phase 3A (C110), Phase 4A |
| **D5** | **Vocabulary: `Family*` or `Component*`?** | C84 **EI-8** ("one vocabulary per concept") makes choosing mandatory; C69 §1.1 makes wire names permanent; C107 §1.1 records *"four vocabularies over one family"* as another family's headline defect. **Decide in Phase 3 and never again.** | Phase 3 |
| **D6** | **Nesting (§25): which of the three existing answers?** | `parentId`/`childrenIds` compound parents (proven on pool, balcony, lift) · Stack 2's `composite` primitive kind · Stack 1 has **none**. **Three answers to one question is an EI-9 violation waiting to be minted.** | Phase 6, Phase 8D |
| **D7** | **How is the §16 feature graph reconciled with an undo model that forbids selective undo?** | C03 §4.6 **U-12**: *"SELECTIVE / OUT-OF-ORDER UNDO IS NOT SUPPORTED AND MUST NOT BE OFFERED"*, for three measured reasons. **A CAD history tree you can re-open at feature 3 is a different mechanism, not a feature of the undo stack.** The named exit is **ADR-0251** (one store, derived geometry, one timeline). ⛔ **Do not plan the feature graph "on the undo stack."** | Phase 4B, Phase 8 |
| **D8** | **Is the sketch profile a C74 §4.2(c) SOLVING family?** | The evidence is strong — the format persists `tangent`, `radius`, `diameter`, `equalLength`, and sequential projection cannot satisfy them — **but C74 §1.3 requires the classification IN WRITING, per constraint, before any solver work**, and (a)/(b) must be answered honestly first. **This is a governance gate, not a technical one.** | Phase 8A |
| **D9** | **Does the `component` element kind get created?** (the §4.2 ruling) | It adds an element family, so it is bound by **C84 §6's twelve mandatory sections** and changes the family census. Needs an ADR. | Phase 4C |
| **D10** | **Do we turn on the descriptor path for one family?** (§5.4) | It makes the component family the **first production caller of `runtime.scene.mount`** and constructs the first committer ever built in a browser. Bounded, but it is a rendering-architecture decision. | Phase 4E |
| **D11** | **Does a new host surface amend C15 or get a sibling mechanism?** | C15 §0.1.1's closing rule says **sibling**: *"A surface missing any one of the four gets a sibling mechanism, not an amendment to this contract."* A generalised `HostingCapability` **overturns that rule**, so it must be overturned deliberately. | Phase 6C |
| **D12** | **Is `formatVersion` made comparable before version two?** | It is a Zod **literal**, i.e. neither SemVer nor comparable — C47 §0.0's finding one level down. **A component definition must survive decades of instances (§37: "never silently destroy historical meaning").** Decide before minting v2. | Phase 4B |

## 11.3 — MEASURED RISKS

| # | Risk | Evidence | Mitigation |
|---|---|---|---|
| **R1** | ⭐ **Rebuilding what S52–S59 already built.** | §0.1, §1.1, §1.3 | **This audit.** Every phase in §12 states what it EXTENDS. Any lane proposing a new `ComponentDefinitionSchema`, a new sketch surface, a new expression engine, a new refusal vocabulary or a new AI tool schema is **rejected at review on §1 grounds.** |
| **R2** | **Assuming the existing SPA works.** 2 of 3 tabs are splashes (verified: `AppShell.ts:164-194`); no build, CI, deploy or route; **no `test:ci`, so its six quality gates never run in CI**; it cannot open or save a family file. | §0.2 item 3, §1.3 | Treat it as a **harvest**, not a foundation, until D1 is ruled. |
| **R3** | ⛔ **The gate that polices second composition roots prints a FALSE GREEN about this exact application.** | `check-single-compose.ts:216` prints the string literal `"0 rivals"` while the run enumerates one and names `familyEditorRuntime.ts`. **L-12830, OPEN, P0.** CI logs show the terminal line. | **Fix before D1.** ⛔ Do not "fix" it by editing CLAUDE.md's quoted line — the false green is in the place CI reads. |
| **R4** | **Several ratchets are RED at HEAD, and a ratchet breach is NEVER absorbable as debt.** `check-no-hidden-mock` **RC=3** (one finding in `AnnotationStore`, parent of the repo's only persisted constraint family) · `check-chat-capability-coverage` **UNDECLARED 13/0** · `check-epsilon-policy` 322/318 · `check-predicate-canonical` 139/138 · `check-deterministic-regeneration` 137/134 · `check-cast-count` RC=3. | Lanes B, C, E, H | `§RATCHET-EXCEEDED-IS-NEVER-DEBT` (R7 / L-836): `run-all.ts:1162` sets `anyFailed=true` on code 3 **unconditionally**. ⛔ **Phase 5 cannot claim determinism while `check-deterministic-regeneration` is breached.** Each phase's entry condition names the gates it must find green. ⚠ **Measurement hazard:** piping a gate to `tail` returns `tail`'s exit code — redirect to a file and read `$?` immediately. |
| **R5** | ⛔ **The governing contract for the component format describes a format that does not exist**, and the real format's only spec source is a **phase plan** below SPECs in the conflict order. | §0.3 F1 | Phase 3B corrects C05 §4; Phase 3A mints C111. **Until then, cite the code, not the contract.** |
| **R6** | **A `.pryzm-family` can be SAVED today carrying constraints nothing can evaluate** — 12 persisted, 5 executable, and `tangent`/`radius`/`diameter`/`equalLength` are the textbook simultaneous cases. | §3.4 | Phase 3D writes the C74 §4.2 record; **until it is written, the editor must REFUSE to author the seven unimplemented kinds** rather than persisting them (§75). |
| **R7** | ⛔ **The only progressive-parametrisation path is BROKEN and reports success.** `introduce-expression` never clears `defaultValue`; `resolveParameter` returns before the expression. **Spec §64's headline demo fails silently.** | §0.2 item 6 — I read both files | **Phase 4A, before anything else in Phase 4.** And add the both-present test case the suite does not have. |
| **R8** | **Two canonical length units.** | §3.7 | D3, before Phase 4A. |
| **R9** | ⚠ **Live workstream collision.** The Europe waves own `packages/schemas/src/siteintel/` — **FROZEN** (`ruleformat.ts:1`: *"§RULEFORMAT-RATIFIED (2026-09-01, Wave E4 close) — FROZEN per verdict §H"*) — and `packages/site-parcel-data/**`, which has **uncommitted changes at HEAD**. | `git status` | ⛔ **No universal-editor lane may touch either path.** §12 marks every lane's file ownership and flags the three shared high-traffic files. ⛔ And the standing rule: **NEVER `git stash`** — the stack is global across worktrees. |
| **R10** | **Element id minting is uncontracted**, and **C11 is cited for a rule it does not state** (C11 §7.6, verbatim). Three measured violations exist; ADR-0001 §4's gate *"scheduled for S07"* was never written. **L-666, OPEN.** | Lane A | Spec §7 demands identity stable across recomputation, save/load, undo/redo and AI modification. **Close L-666 in Phase 3** — it is small, already scoped by C11 §7.6's own proposal, and it is the cheapest high-value item in the programme. |
| **R11** | **A `persisted` row can be a lie in the dangerous direction.** The `balcony` row read `persisted` **for four days while the family was destroyed on every reload** (L-11530). `ProjectSerializer` has lost an entire element family **three times**. | Lane D | Phase 4C's acceptance requires a `snapshotFamilyCoverage` row **plus** a proven read channel — *"a `persisted` row asserts the READ CHANNEL resolves, not merely that a key and a writer exist."* |
| **R12** | **`UNKNOWN` is nearly half the verb surface** (174 of 361), **211 verbs have no known authoritative store**, and executed read-back was **PROVEN 7 of 326** at the last recorded reading. | Lane D | Every `component.*` verb ships with a C69 register row and a **C16 CA-21 executed read-back** from the *authoritative* store — never from the DTO store the handler wrote. ⚠ *"Had I probed the DTO store, all fifteen would have shown a correct patch and returned a FALSE PASS."* |
| **R13** | **Turning on a rendering path that has never run in production.** | §0.2 item 4, §5.4 | Lane 4E carries it **alone**, its acceptance is a rendered instance rather than a passing test, and the fallback is explicit: if `scene.mount` cannot be made to work for one family, the slice ships its 3-D through the `*FragmentBuilder` path and the descriptor migration is **descoped, not faked.** |
| **R14** | **Trusting a test's name.** `tests/family-load-into-project/` touches no project, no store, no element and no bus. C107 §0.1 records **fifteen built-but-unreachable surfaces found in one session.** | §3.1, Lane A T14 | Every phase's acceptance test in §12 names the **layer at which the property is read back**, never the function that returned it. |

---

# 12 · THE IMPLEMENTATION PLAN

**Executable by this session's wave protocol.** Phases follow **§77** exactly. Phase 0 (archaeology),
Phase 1 (canonical model proposal, §4) and Phase 2 (technology investigation, §7) are **COMPLETE** —
they are the eight lane files plus this document. Execution begins at **Phase 3**.

Every lane below states: **OWNS** (its exclusive file set) · **ENTRY** (what must be true before it
starts) · **ACCEPTANCE** (a test drawn from spec §63–§70, read back at the layer the user experiences) ·
**GATE** (the §76 gate it must pass).

## 12.0 — Standing rules for every lane in this programme

1. ⛔ **NO LANE MAY TOUCH `packages/schemas/src/siteintel/**` OR `packages/site-parcel-data/**`.**
   The Europe waves are live there; `siteintel/ruleformat.ts:1` is **FROZEN per verdict §H**, and
   `site-parcel-data` has uncommitted changes at HEAD. Not a preference — a collision.
2. ⛔ **NEVER `git stash`.** The stack is global across worktrees. Agents commit scoped CODE; the
   orchestrator owns docs and cherry-picks.
3. **THREE SHARED HIGH-TRAFFIC FILES ARE SERIALIZE-ONLY** — at most one lane may hold each at a time,
   and it must be stated in the lane brief: `apps/editor/src/engine/initBusHandlers.ts` (3,096 lines;
   ⚠ its registration-skip guard is at **four** sites — `:476`, `:524`, `:2902`, `:3053` — not the
   single `:2202` C16 CA-20 cites) · `apps/editor/src/engine/undo/performUndoRedo.ts` (1,254 lines;
   ⚠ `buildUndoStoreMap()` is at **`:402`**, not the `:271` two contracts cite) ·
   `packages/schemas/src/registry.ts`.
4. **Cite the §-tag or the symbol, never the line number.** Lane D measured two contract line citations
   pointing at the wrong code. The rule text is reliable; the line numbers are not.
5. **Every phase re-runs its gates in the FOREGROUND and reads `$?` from a redirect**, never from a
   pipe. Backgrounded results die with the turn.
6. **Every capability claim carries its four-axis reachability** (import/construction · bus verb · build
   graph · call). *A claim naming fewer than four axes is not a claim.*

---

## PHASE 3 — CONTRACT DESIGN · **no code, no UI**

> §77: *"define/extend canonical contracts; **no UI before the model/contract architecture is clear**."*

**PHASE ENTRY:** this audit accepted, and **D1, D3, D4, D5 ruled by the founder** (§11.2). D3 and D4
block Phase 4A directly; D1 blocks Phase 7; D5 blocks every file named in Phase 3.

**⛔ THE MINT/EXTEND SPLIT, STATED EXPLICITLY** (the §81 requirement, because minting moves the C00 row):

| **NEWLY MINTED — 3 now, 1 deferred** | **EXTENDED — 10** | **CORRECTED — 5** |
|---|---|---|
| **C110** Parameter, Unit & Expression Model | C65 (T0 Definition tier) | **C05 §4** (describes a format that does not exist) |
| **C111** Component Definition & the `.pryzm-family` Model | C71 (+3 edges, +1 node kind) | **C15 §0.1.1** (slab/roof rows are false) |
| **C112** Connectors | C15 (`HostingCapability`) | **C74 §6** front-matter ("gates UNBUILT") |
| ⏳ *C113 Classification & Information Requirements — **Phase 6**, minted when the validator exists* | C86 §10.1/§10.6 · C73 · C74 · C69 · C84 §6 · C100 · C03 §4.10 | **C25 §1.7** · **C67 §1.2** |

| Lane | OWNS (exclusive) | ENTRY | ACCEPTANCE | GATE |
|---|---|---|---|---|
| **3A — MINT** | `docs/02-decisions/contracts/C110-*.md`, `C111-*.md`, `C112-*.md` **and `contracts/README.md`** *(one lane owns the index so the rows move once)* | D3, D4, D5 ruled | `npx tsx tools/ga-gate/check-contract-index-equivalence.ts` → **RC=0**, arms B/C/D clean, arm A not grown. `check-contract-cited-paths.ts` adds **no new UNRESOLVED**. C110 answers D3 and D4 in normative text; C111 carries C84 §6's twelve sections. | **§76 A** (existing contracts reused) · **B** (no duplicate source of truth) · **C** (semantic/parametric/geometric distinguishable) |
| **3B — CORRECT the persistence + type contracts** | `contracts/C05-*.md`, `contracts/C65-*.md` | 3A's C111 drafted (C05 §4 cross-references it) | C05 §4 describes the **real** envelope (`family-types.ts:8-17`) and defers the model to C111. C65 gains the **T0 Definition tier** or an explicit statement that it is C111's subject. | **§76 A** |
| **3C — EXTEND the graph + hosting contracts** | `contracts/C71-*.md`, `contracts/C15-*.md` | 3A's C111 drafted | C71 §2.1 gains `instantiates` / `specializes` / `dependsOnDefinition`, **each with a named first consumer** and the §2.6 four obligations spelled out; §1.2 gains a node-kind axis. C15 §0.1.1's slab/roof rows corrected against `OpeningData`; §2.1's host-frame rule marked as the universal invariant. **D11 recorded.** | **§76 B** · **H** (World Model understands components without meshes) |
| **3D — the constraint + tolerance record** | `contracts/C74-*.md`, `contracts/C73-*.md` | — | **C74 carries the §4.2 (a)/(b)/(c) answer for the `.pryzm-family` sketch-profile family**, with (a) and (b) answered first and authorisation scoped to the sub-family that reaches (c). C74 §6 front-matter corrected. C73 states that an adopted evaluator is driven from `tolerance.ts`. | **§76 A** |
| **3E — ADRs** | `docs/02-decisions/adrs/ADR-03xx-*.md` (three new files) | ⛔ **`check-single-compose.ts`'s hard-coded `"0 rivals"` FIXED first (L-12830)** | Three ADRs: the **D1 verdict superseding ADR-0316 explicitly**; the instance-is-an-element ruling (D9); the kernel-staging ADR with the Stage-1 trigger and the LGPL four conditions. | **§76 B** |
| **3F — close L-666** | `docs/02-decisions/contracts/C11-*.md` (§7.6 only) + `tools/ga-gate/check-id-minting.ts` *(new file)* | — | C11 §7.6's own "Proposed" clause becomes normative, and the static gate ADR-0001 §4 promised is written. Three known violations (`crypto.randomUUID` in `applyAutoDimensions`; `kitchen_${Date.now()}`; `wardrobe_cab_…`) are named in its baseline. | **§76 A** |

⚠ **3A owns `contracts/README.md` alone.** Every other Phase-3 lane amends an existing contract and
therefore moves **no** row. This is the whole point: the count/range shape has failed six times because
the row and the range moved separately.

---

## PHASE 4 — THE WINDOW VERTICAL SLICE

> §77: *"create → parameterise → constrain → generate geometry → materialise → type → place → modify
> instance → modify type → AI → World Model."*

**PHASE ENTRY:** Phase 3 stamped (`check-contract-index-equivalence` RC=0). D3, D4, D9, D10 ruled.
`check-no-hidden-mock` and `check-deterministic-regeneration` **read green or their breach is owned by a
named lane** — a phase that claims determinism while its own ratchet is exceeded is claiming what R7 /
L-836 forbids.

| Lane | OWNS (exclusive) | ENTRY | ACCEPTANCE (§63–§70) | GATE |
|---|---|---|---|---|
| **4A — the parameter engine** ⭐ *do this first; everything downstream is wrong until it is right* | `packages/family-runtime/**` | C110 stamped; **D3 + D4 ruled** | ⛔ **Fix the precedence inversion** per C110, and **add the both-present test case the suite lacks** (`resolveParameter.test.ts:50` covers only "no default and no override"). Type `EvalScope` with `CanonicalKind` so the already-exported `UnitMismatchError` **throws for the first time**. Widen `Unit` toward §10's quantity kinds. **§66 partial: a formula change recomputes its dependents.** | **§76 C** |
| **4B — the schema delta + migrators** | `packages/file-format/src/family-schema.ts`, `family-types.ts`, `family-migrations/**` *(including `ops/introduce-expression.ts`)* | C111 stamped; 4A's precedence decision landed | ⛔ **Fix `introduce-expression` so the migrator actually does what its header claims** (§0.2 item 6). Add: `semanticClassId` · a **`boolean` solid-feature kind** · `Representation[]` · `Connector[]` · `PropertySet` · `featureEdges[]`; widen `FamilyCategorySchema` from 8 toward §61's 17 creation categories; reconcile `document.defaults` with `FamilyParameter.defaultValue` (**two places for one default today**). `formatVersion` bump + a registered migrator. **Round-trip test: pack → unpack → identical `schemaHash`.** | **§76 B** · **C** |
| **4C — ⭐ THE JOIN: the `component` element kind and its verbs** | `packages/schemas/src/elements/Component.ts` *(new)* · `packages/command-registry/src/component/**` *(new)* · `apps/editor/src/engine/persistence/snapshotFamilyCoverage.ts` · ⚠ **`packages/schemas/src/registry.ts` (serialize-only)** · ⚠ **`apps/editor/src/engine/undo/performUndoRedo.ts` (serialize-only)** | **D9 ruled**; 4B's schema landed | **§63's placement + persistence legs.** Mint `component.place`, `component.swapType`, `component.setInstanceParameter` as **C16 Path-B** handlers with `affectedStores`, `canExecute` and a patch pair; **C69 register rows from the first commit**; a `snapshotFamilyCoverage` row **whose read channel is proven to resolve** (L-11530); an `UNMAPPED_BUS_STORE_KEYS` row or a real undo adapter. ⛔ **Acceptance is C16 CA-21: dispatch the verb, then read the property back out of the AUTHORITATIVE store** — never `success: true`, never a spy, never a read-back from the DTO store the handler wrote. **Save → reload → the component is still there.** | **§76 B** · **G** (placed instances remain parametric) |
| **4D — profile evaluation + the geometry adapter** | `packages/family-instance/**` · `packages/geometry-kernel/src/index.ts` *(barrel re-exports only)* | Phase 3D's C74 record written | ⭐ **Test §5.3's hypothesis by execution FIRST.** Extend `profileToPolygon` to flatten `line`/`arc`/`circle` through the existing `arcToPoints`; export `produceSweep`/`produceLoft`/`produceRevolve`; replace `bakeFamilyInstance`'s `switch (solid.kind)` with an injected `GeometryAdapter` port. ⛔ **If the hypothesis fails, say so and stop** — do not build a solver to rescue it (C74 §4.1). **§67 partial: rectangular, arched, polygon and rhomboid profiles regenerate from parameters.** | **§76 F** (geometry derived from canonical intent) |
| **4E — ⚠ HIGH RISK: turn the descriptor path on for ONE family** | `plugins/component/src/committer/**` *(new)* · ⚠ the canvas-mount call site *(serialize-only, exact file follows D10)* | **D10 ruled**; 4D producing descriptors | **A component instance is VISIBLE IN THE VIEWPORT.** Becomes the **first production caller of `runtime.scene.mount`** and the first committer constructed in a browser. ⛔ **Acceptance is a rendered instance, not a passing test.** **Named fallback, decided in advance:** if `scene.mount` cannot be made to work for one family, the slice ships its 3-D through the `*FragmentBuilder` path and **the descriptor migration is DESCOPED, not faked** (§75). | **§76 F** |
| **4F — the authoring UI** | `apps/editor/src/ui/component/**` *(new)* · ⚠ `apps/editor/src/ui/ElevationOutlineSurface.ts` **(serialize-only — it is §76 gate J's regression surface)** | **D2 ruled**; 4A + 4B landed | Generalise `ElevationOutlineSurface`'s **subject** to a `Profile` on a `ReferencePlane`; add the constraint-glyph layer; build the **parameter table** (`apps/component-editor`'s `'parameters'` tab has existed as a type with nothing behind it since S55). ⛔ **§76 gate J: `openingProfilePanelReachability.spec.ts` and all three existing `ElevationOutlineSurface` callers must stay green**, and C86 §10.1 **PR-2** (rectangular byte-identical on every arm) must hold. | **§76 J** (existing Window and Wall functionality still works) |
| **4G — World Model registration** | `packages/core-app-model/src/SemanticGraph.ts` · `packages/ai-host/src/graph/GraphQueryService.ts` | 3C stamped; 4C's element kind exists | Add `instantiates` / `specializes` / `dependsOnDefinition` **under C71 §2.6's four obligations each — writer AND typed reader AND rebuild disposition AND delete behaviour, in one PR** (writer-first is a defect, §2.5). **§69: an instance exposes identity, category, definition, type, parameters, properties, materials, host, location, orientation, relationships, geometry, representations and provenance — WITHOUT inspecting a mesh.** `graph.query(typeId,'instantiates')` returns instances instead of refusing. | **§76 H** |
| **4H — AI reaches the slice** | `packages/ai-host/src/capabilities/**` · `apps/editor/src/ui/ai/ZeroTokenChatBridge.ts` · ⚠ `tools/ga-gate/check-chat-capability-coverage.ts` **(serialize-only)** | 4C's verbs registered | ⛔ **Extend `HANDLER_GLOBS` FIRST**, then get `UNDECLARED` back to its **0** baseline. Add `component.*` as `ChatCapability` rows with `probe` + `commandProof`; **stamp the actor** (`{context:{actor:{kind:'ai'}}}`, ~2 lines); write the `AIArtefact`. **§64, first half: "create a 1200×1500 window with a 75 mm aluminium frame."** | **§76 D** (AI uses the same command/contract system as the UI) |

**PHASE 4 EXIT — the six falsifiers of §11.1 must pass on the Window slice.** Specifically **§66's
twenty-instance test**: place 20, change ONE to 1800 (the other 19 unchanged), change the TYPE to 1600
(the 19 follow, the overridden one does not), change a formula (dependents recompute), **and no stale
derived geometry overwrites newer state.** ⛔ **If F-1 or F-2 fails, stop and fix the model — not the
editor.**

---

## PHASE 5 — CODE AUTHORING

> §77: *"`code → contract → canonical model → geometry → World Model`."*

**PHASE ENTRY:** Phase 4 exit green, **including §66**. ⛔ **`check-deterministic-regeneration` READS
GREEN** — this phase's central claim is determinism and it cannot be made over a breached ratchet
(R7 / L-836; the gate was read at 137/134).

| Lane | OWNS (exclusive) | ENTRY | ACCEPTANCE (§65) | GATE |
|---|---|---|---|---|
| **5A — the `ComponentApi` surface** | `packages/component-api/src/api/**` *(new package)* | Phase 4 exit | Every call is a **contract emitter** (§10.2): `c.parameter` → `FamilyParameter`; `c.derived` → an `expression` **string**, not a closure; `c.constrain.equal` → a `ProfileConstraint`; `c.extrude` → a `SolidFeature`. `apiVersion` pinned in the manifest. ⛔ **The API cannot express anything the visual editor cannot** — same document, same Zod schema. | **§76 E** (code uses the same Component API/contracts) |
| **5B — the capability sandbox** | `packages/component-api/src/worker/**` | 5A's types frozen | The worker realm has **no** `fetch`/`XHR`/`WebSocket`/`importScripts`/`localStorage`/`indexedDB`/THREE/stores/bus/DB, and `Date.now`/`Math.random`/`performance.now`/`crypto.getRandomValues` are **refusing stubs** (§10.3). **A negative-control test: a module attempting each of the eight denied capabilities must fail, and the failure must be a named refusal.** ⚠ State plainly in C111 that a worker is an isolation boundary, not a security boundary — marketplace code is **also** signed and compile-validated. | **§76 E** |
| **5C — the compiler + determinism harness** | `packages/component-api/src/compile/**` · `packages/component-api/__tests__/**` | 5B green | ⭐ **The determinism equation, executed:** same code + same inputs + same `apiVersion` → **byte-identical `FamilyDocument` (equal `schemaHash`) → byte-identical descriptor** (D1 regenerate twice; D2 shuffle iteration order). ⚠ C73 §5.4(b) flags cross-machine determinism as UNPROVEN even for pure-TS producers — **claim "deterministic on one engine version" until measured otherwise**, and say so. **§51: declare SEMANTIC equivalence only**, and make a code-authored definition edited visually a **visible, named, detached state.** | **§76 E** · **B** |

---

## PHASE 6 — THE SECOND CATEGORY (the architecture's real exam)

> §77: *"prove with Door or Generic; **if the second category needs excessive special cases, refactor
> the architecture before continuing.**"*

**PHASE ENTRY:** Phase 5 green. ⛔ **This phase has a STOP condition, and it is the founder's, not a
lane's.**

| Lane | OWNS (exclusive) | ENTRY | ACCEPTANCE | GATE |
|---|---|---|---|---|
| **6A — Door through the same engine** | `packages/component-definitions/door/**` *(new — data, not code)* | Phase 5 | Door is delivered as a **ComponentDefinition**, adding **zero new geometry engine code**. ⚠ Its handing and swing exercise `HostingCapability` for the first time. | **§76 F** · **G** |
| **6B — ⛔ THE REFACTOR GATE** | `audit/universal-component-editor/phase6-special-case-census.md` *(a measurement, not code)* | 6A merged | **COUNT the special-case branches Door required.** Publish the census. **If it exceeds the threshold C111 declares in advance, PHASE 6 STOPS and the architecture is refactored before Phase 7.** ⛔ Declaring the threshold *after* seeing the number is the failure this gate exists to prevent. | **§77 Phase 6's own rule** |
| **6C — Connectors** | `packages/schemas/src/connectors/**` *(new)* · `packages/core-app-model/src/SemanticGraph.ts` *(serialize-only vs 4G — sequence after it)* | C112 stamped; **D11 ruled** | **§35 query 7 — *"components connected to this MEP connector"* — is answerable.** ⚠ The `connectsVia` edge is **`authoredBy`-keyed from day one**; `authoredBy` **must survive `serialize()`/`deserialize()`** or edges re-collapse on reload (`§FIX-CONNECTEDBY-EDGE-KEYING`). | **§76 H** |
| **6D — classification + information requirements** | `packages/schemas/src/classification/**` *(new)* · `packages/plugin-sdk/src/bsdd.ts` *(wiring only)* · `contracts/C113-*.md` + `contracts/README.md` **(the deferred mint)** | 6B passed | ⭐ **Wire the bSDD client that already exists and has zero call sites.** Build the **IDS reader + validator** in plain TS. **§35 query 5 — *"components missing fire rating"* — becomes answerable**, i.e. `⚠ Missing required information` is distinguishable from *"not applicable"*. **§70: `PRYZM Window → semantic mapping → IFC window`, properties mapped to standardised definitions, IFC never internal.** ⚠ Extend **Pipeline A**; `plugins/ifc-export/**` is the dead one (C25 §1.7). | **§76 I** (IFC stays an interoperability mapping) |

---

## PHASE 7 — EXISTING EDITOR MIGRATION

> §77: *"Window Editor + Wall Profile Editor into the universal engine."*

**PHASE ENTRY:** **D1 ruled AND executed as an ADR superseding ADR-0316**; `check-single-compose`'s
false green fixed (L-12830); Phase 6B passed.

| Lane | OWNS (exclusive) | ENTRY | ACCEPTANCE (§74) | GATE |
|---|---|---|---|---|
| **7A — the two profile surfaces converge** | `apps/editor/src/ui/WindowOutlineEditorDialog.ts` · `apps/editor/src/ui/WallProfileEditor.ts` · `packages/geometry-wall/src/OutlineAuthoring.ts` | Phase 6B | Both become callers of the **universal** surface with a `Profile`/`ReferencePlane` subject. ⛔ **C86 §10.1 PR-1 still holds — no arm re-derives an arc** — and **PR-2** keeps `rectangular` byte-identical. ⛔ Import the **pure subpaths**, never the bare `@pryzm/geometry-wall` barrel (`§OUTLINE80-CYCLE-FIX`, L-11261). | **§76 J** |
| **7B — the D1 verdict executed** | `apps/component-editor/**` · `tools/ga-gate/check-single-compose.ts` | D1's ADR merged | Whatever D1 ruled, **executed and measured**: on MERGE or RETIRE, `MAX_RIVALS` drops to **0** and the gate proves it; on BRIDGE, the SPA gains a deploy target and a `test:ci` script so its six quality gates actually run. ⛔ **No option leaves it as it is today** — governed code with no delivery path is the state §11 R2 names. | **§76 B** |
| **7C — the scaffolds retire themselves** | `apps/editor/src/familyCreatorPlaceholder.ts` · `apps/editor/src/ui/familyCreatorPlaceholder.ts` · `apps/editor/__tests__/FamilyCreatorPlaceholderScaffold.test.ts` | 7B merged | ⭐ **`FamilyCreatorPlaceholderScaffold.test.ts` goes RED — by design.** It asserts the create rail still routes to the placeholder; the first PR that wires the real editor **must** break it. **That is the scaffold retiring itself, not a regression.** Both same-named files are resolved (a third was already deleted 2026-08-15). | **§76 J** |

---

## PHASE 8 — ADVANCED GEOMETRY

> §77: *"sweeps, lofts, booleans, complex profiles, nested components, patterns, advanced constraints,
> surface modelling."*

**PHASE ENTRY — two gates, both external to this programme's discretion:**
**(i)** for 8A, the **C74 §4.2(c) record is WRITTEN and names the sub-family** (Phase 3D) — ⛔ *no solver
work begins without it*; **(ii)** for 8B, **the §7.2 Stage-1 trigger has actually fired** — a named §57
operation (fillet, chamfer, shell/thicken) is required by a **shipped** component. ⛔ **Neither may be
satisfied retroactively.**

| Lane | OWNS (exclusive) | ENTRY | ACCEPTANCE (§67, §68) | GATE |
|---|---|---|---|---|
| **8A — the solver binding** | `packages/constraint-solver/**` | **(i)** above | Replace `new MockSolver()` in `PlanegcsAdapter`'s constructor with the authorised binding. ⛔ **In a SEPARATE commit from any honesty work** (C74 §4.3); the retirement test **fails on purpose** and its scaffold header goes out in the same change. **§68: equal, symmetric, horizontal, vertical, tangent, distance, radius preserved across parameter changes.** ⭐ **Note that `equal`, `symmetric`, `horizontal`, `vertical` and `fixed` should ALREADY be green from Phase 4A as expressions** — this lane owns only what genuinely needs simultaneous solving. | **§76 C** · **F** |
| **8B — the exact evaluator** | `packages/geometry-kernel/src/producers/exact/**` *(new)* | **(ii)** above | `replicad` + `replicad-opencascadejs` behind the **existing** descriptor seam, WASM lazily imported exactly as `KernelCSG` does it, worker-offloaded, **all tolerances from `tolerance.ts`**, `GeometryStatus = Invalid` on failure. **The four LGPL conditions (§7.4) are acceptance criteria on the ticket, not footnotes.** | **§76 F** · C73 |
| **8C — booleans, patterns, arrays** | `packages/geometry-kernel/src/producers/{boolean,pattern,array}.ts` · `packages/family-instance/**` *(after 4D)* | 4B's `boolean` feature kind exists | **§67: a window family can express "frame minus glazing void" as a FEATURE.** `produceBoolean` already works against a 30-shape pair suite; pattern/array are pure transform-level producers needing **no kernel**. | **§76 F** |
| **8D — nested components** | `packages/schemas/src/elements/Component.ts` *(after 4C)* · `packages/command-registry/src/component/**` | **D6 ruled** | **§25: Window → frame, glass, mullion, handle, seal, with parameter and material inheritance and NEVER copied mesh geometry.** ⛔ **One dispatch → one `HandlerResult` → one `PatchPair` → one Ctrl+Z across all five**, via `produceMultiStoreCommand()` (the store-key-prefixed helper). ⚠ **`runBatch` is UNDO-NEUTRAL** — N dispatches inside a batch give N undo entries (C16 §8.6 B-6); the undo unit is bought by **one dispatch**, never by opening a batch. | **§76 G** |

---

## 12.9 — The five things to do first, if only five are done

1. ⛔ **Fix `check-single-compose.ts`'s hard-coded `"0 rivals"` (L-12830).** Every judgement about
   `apps/component-editor` is currently taken against an instrument printing a false green **about that
   exact application**.
2. ⛔ **Fix the `defaultValue`-beats-`expression` inversion and the `introduce-expression` migrator.**
   The founder's own §64 demo fails **silently** today, in the only progressive-parametrisation path
   that exists. Two small files; the largest honesty win available.
3. **Rule D3 — millimetres or metres.** Two canonical length units in one repository is a 1000× defect
   waiting for the first bake across the boundary.
4. **Mint C110.** The most spec-relevant package in the programme cites a **phase plan** as its only
   authority. *This subsystem has no authority to be wrong against.*
5. ⭐ **Test the §5.3 tessellation hypothesis.** If it holds — and three independent facts say it will —
   **three of four §57 Solid tools light up with no new dependency, no WASM and no C74 authorisation.**
   It is the cheapest capability gain anywhere in this audit, and it costs one afternoon to falsify.

---

## §13 — WHAT THIS AUDIT DID NOT ESTABLISH

*Stated so a blank is never read as "fine" — the standing rule this repository holds itself to.*

- **No utterance was typed into a live editor, and no component was placed.** Every verdict is
  source-measured or derived from a gate run in this tree. **V3/V4/V5/V6 liveness for any component verb
  is UNPROVEN by this audit** — necessarily, since none exists.
- **I ran no GA gate myself.** Every gate reading in this document is **attributed to the lane that ran
  it, with its date.** ⛔ Re-run before quoting: `check-contract-index-equivalence` ·
  `check-deterministic-regeneration` · `check-no-hidden-mock` · `check-chat-capability-coverage` ·
  `check-single-compose` · `check-verb-liveness`. ⚠ Redirect to a file and read `$?` immediately — a
  pipe to `tail` returns `tail`'s exit code, which is how one lane first reported RC=0 for a gate at
  RC=3.
- **The §5.3 tessellation hypothesis is NOT verified by execution.** It rests on four read facts. Lane H
  is explicit that it did **not** read `SolidFeatureSchema`'s `sweep`/`loft`/`revolve` arms to confirm
  what path and section inputs they demand. **Read those before acting.**
- **Nothing was benchmarked.** Every performance judgement in §7 is reputational. No OCCT-WASM load time,
  bundle size or boolean throughput was measured on PRYZM's own scenes.
- **§7.4 is not legal advice.** It is an engineering reading of LGPL §6 plus the OCCT exception, and the
  Stage-1 ticket must carry it to whoever signs off licensing.
- **The cost of the Stack-2 → Stack-1 migration (§4.4 B5) was not sized.** It touches a **live** store
  with 59 seeded families and an AI ingestion pipeline. Phase 6 sequences it; nobody has costed it.
- **`apps/component-editor`'s test suite was not run.** Its AI bridge and its sketch tools are asserted
  unreachable on the strength of call-site greps — sound for **reachability**, silent about
  **correctness**.
- **I did not re-verify every lane claim.** I settled the six disagreements in §0.2 and independently
  confirmed the claims this document's recommendations rest on: the family schema's shape and its 12
  constraint kinds · `resolveParameter`'s precedence · `introduce-expression`'s no-op ·
  `apps/component-editor`'s size, scripts and splash routing · the absent `component.*` verbs ·
  `ElevationOutlineSurface`'s three callers · `scene.mount`'s zero callers · `OpeningData`'s shape ·
  `VisibilityRule['scope']` · the contract and ADR counts · C05 §4's phantom format · C107's existence
  and unbuilt state. **Everything else is a lane's claim, attributed to that lane, and should be
  re-measured before it is spent.**

---

> **The closing judgement.** The founder's stated fear is *"a beautiful editor whose internal model is
> too weak to become the PRYZM World Model."* This audit's evidence is that PRYZM already built a strong
> internal model, built a capable editor on top of a *different* and weaker one, and **never joined
> them.** The work is not to design the canonical model. It is to close about six named gaps in an
> existing 266-line schema, repair one silent defect in the only path that makes a formula real, and
> then build the one thing that has never existed anywhere in this repository — **the bus verb, the
> command, the store route and the committer that place a component into a project as a first-class,
> still-parametric, World-Model-visible element.**
