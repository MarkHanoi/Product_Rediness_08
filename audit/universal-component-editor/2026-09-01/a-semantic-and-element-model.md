# LANE A — THE SEMANTIC / ELEMENT MODEL
### Phase-0 repository archaeology for STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC §4.1, §6, §7, §8, §29–33

**Lane:** A-semantic-model · **Date:** 2026-09-01 · **Rule:** spec §1 — DO NOT CODE. No production
file was modified by this lane. This document is knowledge only.

> **THE HEADLINE.** The spec's §6 hierarchy (`ComponentDefinition → ComponentType →
> ComponentInstance`), its §7 identity rules, its §9–11 typed parameters with expressions, its §14
> persistent constraint objects and its §16 feature history are **NOT missing from PRYZM. They are
> already authored, as one coherent design, in `packages/file-format/src/family-schema.ts` (266
> lines) plus five satellite packages.** There is also **an entire second editor application** —
> `apps/component-editor`, "PRYZM Family Creator", 5,918 LoC — built for exactly this purpose, with
> an ADR blessing its own composition root. **The largest risk to this programme is proposing to
> build what sprints S52–S59 already built.** The second largest is assuming it works: two of its
> three view tabs render an "under construction" splash, and it is in no build.

---

## 1 · WHAT EXISTS

### 1.1 ⭐ THE FAMILY PLATFORM — the existing answer to §6, §7, §9–11, §14, §16

There are **two independent, non-communicating family stacks** in this repo. Telling them apart is
the first thing a newcomer must do, because they use overlapping words for different things. Both
are real; only one is a component-authoring model.

#### STACK 1 — `.pryzm-family` (the component-authoring model) — **THIS IS THE ONE**

**Authority file:** `packages/file-format/src/family-schema.ts`. Its header at line 4 already
claims the role spec §5 asks for:

> *"This file is the SINGLE source of truth for the on-disk shape; the editor's in-memory store
> types narrow it but never widen it. Any breaking change requires bumping `formatVersion` AND
> adding a migrator (see `family-migrations/`)."*

Clause by clause, what that one file already contains:

| Spec clause | State | Evidence |
|---|---|---|
| §7 stable identity for Definition·Type·Parameter·Feature·Geometry·Material·Reference | **YES — 8 prefixed ULID id spaces** | `family-schema.ts:15-22`: `fam_`, `typ_`, `par_`, `sol_`, `prof_`, `slot_`, `plane_`, plus bare `ULID` for sketch entities and constraints. Crockford-base32, 26 chars, regex-enforced at the schema boundary. |
| §7 *"never use renderer ids or mesh indices as semantic identity"* | **YES — structurally impossible** | The document schema is pure Zod with no THREE and no mesh. Geometry is produced downstream by `bakeFamilyInstance`, never stored in the document. |
| §6 Definition → Type → Instance, never collapsed | **YES — all three levels present** | `FamilyDocumentSchema:244` is the DEFINITION. `FamilyTypeSchema:234` — `{id, name, values: Record<ParameterId, …>, checksum}` — is the TYPE. The INSTANCE level is `InstanceOverrides` at `packages/family-runtime/src/types.ts:61`. |
| §9 parameters as first-class objects | **YES** | `FamilyParameterSchema:121-133`: `id`, `name` (regex `:25`), `kind`, `dataType`, `defaultValue`, `expression`, `ifcMapping`, `exposed`. |
| §10 typed semantic units | **YES, and canonicalised** | `FamilyParameterDataTypeSchema:111` = `length \| angle \| number \| count \| boolean \| string`. `packages/family-runtime/src/types.ts:9-13` fixes canonical units in prose: *"`'length'` parameters are stored in millimetres, `'angle'` in radians"*. |
| §11 typed expression engine + cycle detection | **YES — a real resolver, not string substitution** | `packages/family-runtime/src/expression/` and `resolution/`. `ResolverDiagnostic` (`types.ts:91-103`) codes: `unknown-identifier`, **`cycle`**, `expression-parse`, `expression-eval`, `invalid-default`, `invalid-override`, `duplicate-name`, `invalid-name`. `ResolverOk.order` (`types.ts:77`) is *"topologically-sorted resolution order"* — a real dependency graph. |
| §12 order definition-defaults → type → instance | **YES** | `ResolverInput` (`types.ts:64-68`) is literally `{parameters, type, instanceOverrides}` — the three tiers as one input bundle. |
| §14 constraints as persistent semantic objects | **YES — 12 kinds, persisted in the document** | `ProfileConstraintSchema:142-161`: `coincident, parallel, perpendicular, horizontal, vertical, tangent, distance, radius, angle, diameter, equalLength, distancePointLine`. Each carries `parameterRef: ParameterId \| null` — **a constraint may be DRIVEN BY A PARAMETER**, which is spec §15's "retain WHY" in schema form. |
| §16 replayable feature history | **PARTIAL — ordered list + event log, not a graph** | `FamilyDocumentSchema.solids` is an ordered array of `SolidFeatureSchema:172` (`extrude \| sweep \| loft \| revolve`), each naming a `profileId`, which names a `planeId`. Plus `event-log.ndjson` (`family-types.ts:11`; `FamilyEventSchema:260`). See §3.2. |
| §21/§28 representations and detail-level visibility | **PARTIAL — LOD booleans** | Every `SolidFeature` carries `lod: {coarse, medium, fine}` (e.g. `:178-182`). Real per-solid detail-level visibility, but boolean — not spec §28's semantic predicate (`visible when PanelCount > 2`). |
| §23 materials as semantic slots, not renderer colour | **YES** | `MaterialSlotSchema:227` = `{id, name, defaultCategory}`; solids reference `materialSlotId`. The family names a SLOT; binding happens downstream. |
| §26 hosting | **PARTIAL** | `ReferencePlaneSchema:102` carries `isHost: boolean` — one host plane per family. No host-type rules, no insertion rules, no handing/swing. |
| §29–31 IFC as a projection, never canonical | **YES, explicitly, and structurally** | IFC lives in a *separate ZIP entry*: `FAMILY_PATHS.ifcMapping = 'ifc-mapping.json'` (`family-types.ts:11`), schema `IfcMappingFileSchema:91`, per-parameter `IfcParameterMappingSchema:84` (`parameterId → psetName + propertyName`). The internal model is not `IfcPropertySet` — it is a mapping table pointing at one. Exactly spec §29's `PRYZM semantic model → standards mapping → IFC`. |
| §36 provenance | **PARTIAL** | `FamilyManifestSchema:60` has `author{id,displayName}`, `createdAt`, `lastModifiedAt`, `schemaHash`; plus the event log. No AI-vs-manual origin flag on this stack (Stack 2 has one — §1.2). |
| §37 versioning with migration | **YES — a real framework** | `formatVersion` literal + `packages/file-format/src/family-migrations/migrate-family.ts`. Envelope version is tracked *separately* from document version: `family-types.ts:19-23` is explicit that `FAMILY_FORMAT_SCHEMA_VERSION` (ZIP layout) ≠ in-document `formatVersion`. |
| §71–73 cache identity = definition hash + parameter state | **YES** | `schemaHash` is `sha256:<hex>` over **canonical(document) + canonical(ifc-mapping)** (`family-types.ts:77`), via `canonical-json.ts` and `zip-deterministic.ts`. Families are content-addressed and the ZIP is byte-deterministic. |
| *(not asked by the spec, but present)* | **Cryptographic signing** | Ed25519 over canonical manifest bytes; `signing/schema-hash` + `signing/signature` ZIP entries; `unpackFamily` refuses on `schema-hash-mismatch` / `signature-mismatch` (`family-types.ts:109-121`). |

**The satellite packages** (all real workspaces):

- `packages/family-runtime` — **zero runtime dependencies** (`package.json`: `"dependencies": {}`).
  Parameter resolver + expression engine. `types.ts:5-6`: *"every consumer must be able to import
  this file without paying for THREE, DOM, or any heavy dependency."*
- `packages/family-loader` — `loadFamily(path)`: unzip → validate manifest + document → resolver
  pre-flight → cache by `(familyId, schemaHash)`.
- `packages/family-instance` — `bakeFamilyInstance({family, typeId, instanceOverrides})` →
  `BufferGeometryDescriptor[]` via `@pryzm/geometry-kernel`. **No THREE** — descriptors only.
- `packages/file-format` — pack / unpack / migrate / canonical JSON / deterministic ZIP.
- `packages/constraint-solver` — the solver `apps/component-editor` depends on.

#### STACK 2 — `packages/schemas/src/family-*` (a DIFFERENT thing: furniture / AI ingestion)

**Do not confuse this with Stack 1.** Seven directories under `packages/schemas/src/` —
`family-request`, `family-definition`, `family-parametric`, `family-geometry`, `family-schemas`,
`family-pipeline`, `family-registry` — implement a **5-stage ingestion pipeline** for
*furniture-scale, AI- or JSON-authored* families, documented at
`family-definition/definition.ts:10-14`:

```
FamilyRequest ─[Stage 1 Ingestion]→ FamilyDefinition (canonical)
              ─[Stages 2-4]→        Generated*
              ─[Stage 5]→           RegisteredFamily
```

- `family-registry/identity.ts:44` — `FamilyIdentitySchema {id, name, version, author, license}`,
  **strict semver enforced** (`FAMILY_VERSION_PATTERN:33`), branded `FamilyId` (`:26`), dotted
  namespace ids (`family/com.pryzm.core/desk`).
- `family-parametric/family.ts:43` — `ParametricFamilySchema {identity, parameters, primitives,
  parametricHash, decomposedAt}`.
- `family-parametric/primitive.ts:36` — `PrimitiveKindSchema` = `box, cylinder, extrusion, sweep,
  revolve, loft, **composite**`. Note `composite`: **Stack 2 has nesting; Stack 1 does not.**
- `family-parametric/primitive.ts:92-106` — `ParameterRefSchema {paramName}` and
  `ParametricValueSchema = number | ParameterRef`: any primitive dimension may be a literal *or* a
  parameter reference.
- `family-registry/registered-family.ts:43` — `FamilyMountClassSchema` = `floor | wall | ceiling |
  embedded`, with per-member prose lifted straight from spec §26 territory: *"`wall` hosted in a
  wall (door / window / wall-mounted radiator)"*, *"`embedded` embedded into a host element (handle
  on a door, knob on a tap)"*.
- `family-registry/registered-family.ts:92` — `IfcMappingSchema {entityType, predefinedType,
  psets}` — again a *mapping*, not the canonical model.
- `family-registry/registered-family.ts:32` — `FamilyOriginSchema` = `core | plugin | user |
  **ai-generated**`. Spec §36's AI-provenance requirement, present.

**What Stack 2 does NOT have:** sketches, profiles, constraints, reference planes, or an expression
engine. Its parameter is `{range, constraint?}`, and `family-parametric/parameter.ts:28-32` is
explicit that the constraint is carried **verbatim as a string**: *"this schema does NOT validate
the DSL — the substrate is the contract surface only."*

### 1.2 ⭐ `apps/component-editor` — the Family Creator SPA (spec §57–62, half-built)

**Authority:** `apps/component-editor/README.md`, whose opening line is the spec's own framing:

> *"The Family Creator is PRYZM 2's standalone SPA for authoring parametric component families
> (the Revit-Family-Editor analogue). It produces `.pryzm-family` artefacts that the main editor
> and the marketplace consume."*

**Shape:** 5,918 LoC across 50 files, vanilla TS, no framework. Its own architectural rules
(README lines 33-40) are *stricter* than the repo's: no React/Vue/Svelte; `three` only in
`*Committer.ts`; one global rafScheduler; every mutation through `@pryzm/command-bus`; no
`(window as any)` outside two files; **300-LoC ceiling per file**; **180 KB gzip first-paint
budget**. Enforced by its own gate suite in `__tests__/quality-gates/`: `no-three.test.ts`,
`no-react.test.ts`, `no-window.test.ts`, `loc-cap.test.ts`, `bundle-budget.test.ts`,
`a11y.test.ts`.

The README also records the 8-sprint plan of record — S52 scaffold + planegcs + extrude · S53
sketch tools + sweep/loft/revolve + booleans · S54 AI host bridge · S55 parameter table +
expression DSL + IFC binding + `.pryzm-family` v1 · S56 main-editor integration · S57 versioning +
migration · S58 standalone deploy + a11y · S59 marketplace publish.

**What is REAL:**
- `src/sketch/` — a working 2D sketcher: `SketchCanvas.ts` (298 LoC), `sketchRender.ts`,
  `hitTest.ts`, `snap.ts`, `transform.ts`, `entities.ts`; tools `LineTool`, `ArcTool`,
  `CircleTool`, `RectangleTool`, `TrimTool`, `FilletTool`, `SelectTool`.
- `src/sketch/solverRunner.ts` (186) + `buildConstraintSet.ts` + `stores/constraintStore.ts` — a
  live constraint-solver loop against `@pryzm/constraint-solver`.
- `src/commands/constraint/` — `addCoincident`, `addParallel`, `addPerpendicular`, `addFixed`,
  `addDistance` (5 of the 12 kinds the schema defines).
- `src/commands/referencePlane/index.ts` (149) and `src/commands/solid/index.ts` (110).
- `src/ai/` — `toolRegistry.ts` (206), `aiHostBridge.ts` (173), `approvalQueue.ts` (97). Spec §39–45
  has a real implementation here, with a **replay test** (`__tests__/ai/replay.test.ts`).
- `src/marketplace/` — `publishFlow.ts` (220), `signing.ts` (93).
- `src/app/commandBus.ts` (281) — its own command bus.

**What is a PLACEHOLDER — the trap.** `src/app/AppShell.ts:164-194` (`renderActivePanel`) branches
on the active view tab. Only `'sketch'` mounts real UI; the other two fall through to
`panel.appendChild(renderSplash(active))`, and `src/app/appSplash.ts:13-17` says what that means:

```ts
const PANEL_TITLES: Readonly<Record<ViewTab, string>> = {
  sketch: 'Sketch — under construction',
  '3d': '3D preview — under construction',
  parameters: 'Parameter table — under construction',
};
```

**There is no 3D viewport and no parameter table in the Family Creator today.** S55's parameter
table and the 3D preview did not land. There is no `*Committer.ts` anywhere in `src/` — the file
class the `no-three` gate exists to permit does not yet exist. Note the consequence for spec §61,
which says *"the existing Window Editor 3D viewport is reused/evolved"*: **this app has no viewport
to reuse.**

**ADR-0316 — the second composition root is BLESSED, and fenced.**
`__tests__/app/secondCompositionRoot.invariants.test.ts:1-21`:

> *"P1 says 'production code obtains a runtime ONLY via composeRuntime()'.
> `createFamilyEditorRuntime()` does not, and ADR-0316 blesses that: the Family Creator is a
> genuinely different product surface (no project, no site, no collaboration, no renderer, 180 KB
> first-paint budget) and forcing it through composeRuntime() would drag ~281 KB gzip of THREE
> through the door before the first pixel. … The failure mode of a second composition root is not
> its existence — it is DRIFT: two subtly different mutation paths for the same conceptual
> operation, discovered years later by a user. This file turns that discovery into a test failure."*

The test pins a `FORBIDDEN_IMPORTS` list — persistence, collaboration, BIM aggregate stores, the
renderer — and its own comment calls that *"the single most important assertion in the file."*
**Any plan that merges the universal editor into `apps/editor`, or lets it reach the project
stores, contradicts ADR-0316 and fails this test. It must be argued, not assumed.**

### 1.3 REACHABILITY — the decisive measurement

The standing repo lesson is *authored ≠ wired*. Measured for this lane:

```
$ grep -rn "component-editor" --include=*.ts --include=*.js --include=*.json \
    --include=*.yml --include=*.toml --include=*.html \
    vite.config.ts server.js package.json fly.toml .github/workflows index.html
EXIT=1        # zero matches, across all of them
```

**`apps/component-editor` is in no root build input, no server route, no Fly config and no CI
workflow.** It runs only under its own `npm --workspace=@pryzm/component-editor run dev`. The
`dist-gate/index.html` present (520 bytes, dated Aug 9) feeds the bundle-budget gate; it is not a
deployment.

Likewise, `@pryzm/family-loader` and `@pryzm/family-instance` are depended on by `apps/bake-worker`
and `apps/bench` only — **not by `apps/editor`**. Sprint S56 ("main-editor integration — load
family, place 200 instances, swap types") is on the roadmap and absent from the dependency graph.

**Verdict:** Stack 1 (`.pryzm-family` + Family Creator) is **AUTHORED, TESTED, AND UNREACHABLE FROM
PRODUCTION.** Stack 2 (`schemas/family-*` + `FamilyRegistryStore`) is **LIVE** —
`packages/stores/src/familyRegistryStore.ts:55` with `findById/findByCategory/findByOccupancy/
findByMountClass/findByTag`, fed by `registerFamilyFromJson.ts:10` (`raw JSON ─→ runFamilyPipeline
─→ RegisteredFamily ─→ store.register(...)`) and seeded with 59 core families
(`seedCoreFamilies.ts`; count cited in-code at `registered-family.ts:135`).
**The powerful model is the unreachable one.**

### 1.4 The bake pipeline is HONEST about what it cannot do (spec §75 already satisfied here)

`packages/family-instance/src/bakeFamilyInstance.ts:13-21`:

> *"v1 producer support (plan §19.5 D2): • `extrude` — fully wired. • `sweep` / `loft` / `revolve`
> — return a structured `unsupported-feature` error per solid; the bake completes the supported
> solids and reports the unsupported ones. Lighting up these producers requires the constraint
> solver (S57) so that path and section profiles can be evaluated…"*

The schema declares four solid features; the baker implements **one**. `UnsupportedSolid` carries
`reason: 'unsupported-feature' | 'profile-eval-failed' | 'invalid-length'`. This is spec §73's
"GeometryStatus = Invalid with structured diagnostics" **already implemented**. It also means the
spec §67 geometric test (sweep, revolve, boolean) is a real build, not a wiring job — and **there
is no boolean feature in the schema at all**: `SolidFeatureSchema:172` has exactly four members and
union/subtract/intersect is not among them, despite S53's roadmap line claiming booleans.

---

## 1B · THE ELEMENT MODEL (the OTHER half of §4.1, §6, §7, §8)

The Family Platform above is the *component* model. PRYZM's *element* model is a separate, much
older, much more heavily used system. **They share almost nothing.** Where they agree and where they
diverge is the whole reuse question.

### 1B.1 The kind declaration — `defineElement` (spec §4.1, "how is a kind declared")

**Authority:** `packages/schemas/src/base/BaseNode.ts:31`. Contract: **C03 §1** (Schemas Layer L0),
purity by **P5**.

```ts
export function defineElement<T extends ElementType, ExtShape extends z.ZodRawShape>(
  type: T, extension: ExtShape,
) {
  const idRe = new RegExp(`^${type}_[0-9A-HJKMNP-TV-Z]{26}$`);
  ...
  return z.object({ id: idField, type: elementType(type).default(type), ...BaseNodeShape, ...extension });
}
```

Every element kind is one call. `BaseNodeShape` (`:11-20`) gives every element four universal fields
and **only** four: `parentId`, `childrenIds`, `metadata`, `ifcData`.

- `Metadata` (`base/primitives.ts:40`) = `{createdAt, modifiedAt, createdBy, version, tags?,
  description?}`.
- `IfcData` (`base/primitives.ts:51`) = `{guid, ifcClass}` — the minimal round-trip anchor.
- `parentId` / `childrenIds` are the **composition mechanism** — spec §25 nesting, in the element
  model. Real and load-bearing: `types/Id.ts:41-60` documents `pool` and `balcony` as *COMPOUND
  parents* that own their members through exactly these fields (ADR-0124 §3; C103).

**The roster:** `packages/schemas/src/registry.ts` — `SCHEMA_REGISTRY` maps **28 element kinds**:
`wall, slab, door, window, roof, curtainwall, grid, column, beam, stair, verticalCirculation,
handrail, ceiling, floor, room, furniture, annotation, dimension, sheet, schedule, view, project,
structural, lighting, plumbing, projectOrigin, pool, water`. There are **32 files** in
`src/elements/` — `Balcony`, `BoundaryLine`, `CurtainPanelVocabulary` and `Section` define schemas
the registry does not list. **The registry is not a census of element kinds; do not use it as one.**

### 1B.2 IDENTITY — the same convention as `.pryzm-family`, and an uncontracted minting path

**The good news, and it is genuinely good:** both stacks converged independently on the *same*
identity convention — `<prefix>_<26-char Crockford ULID>`.
`packages/schemas/src/factory/createId.ts:13` mints element ids; `family-schema.ts:15-22` mints
family ids. `types/Id.ts:14` brands them (`Id<TPrefix> = string & {readonly __brand: TPrefix}`);
`family-registry/identity.ts:26` brands `FamilyId` the same way. **A universal component editor does
not need a new id scheme. It needs to pick one of two identical ones.**

⛔ **THE TRAP — id minting is UNCONTRACTED, and the contract says so about itself.** **C11 §7.6**
(`C11-ELEMENT-CREATION-PIPELINE.md:936`), verbatim:

> *"**⚠ This section records a gap in THIS contract, not only in the code.** §3.2 lists seven
> invariants for UI-initiated commands and **none of them concerns ids** — yet the §7.0 rows
> **FIX-WALL-ID** and **FIX-CW-ID** both cite "§3.2 (tools MUST pre-generate branded IDs…)".
> **C11 is being cited for a rule it does not state.** C03 is silent on id minting; the ONE factory
> is `createId(prefix)` … ratified by **ADR-0001**, whose own §4 records its enforcement as unbuilt
> ("`pryzm/no-id-casts` … scheduled for S07" — never written). Net effect: **any creation path may
> invent an id**, and the only check is the element schema's regex applied at COMMIT inside the
> handler — where a rejection surfaces to the user as a **dead click behind a perfect preview**."*

Three measured instances, all the same class: `crypto.randomUUID()` in `applyAutoDimensions`
(L-145); `` `kitchen_${Date.now()}_${n}` `` in `KitchenCabinetTool` (L-665); `` `wardrobe_cab_…` ``
in `WardrobeCabinetTool` — the last *"identical break, **never reported** — an invisible failure
generates no bug report."* And the kitchen id *"was introduced deliberately by ADR-0113 … i.e. an
ADR decision that silently contradicted ADR-0001."*

**Contract status: OPEN (L-666).** Spec §7 asks for identity stable across recomputation, save/load,
undo/redo and AI modification. **PRYZM has the factory and the brands; it does not have the rule or
the gate.** This is the cheapest high-value item in the programme, and C11 §7.6's own "Proposed"
paragraph already specifies it.

⛔ **A SECOND identity trap — there are THREE competing marks per element.**
`packages/core-app-model/src/annotations/elementMarks.ts:26-42` (C28, §FEAT-AUTO-TAG-BATCH-EXECUTOR
L-265) names them:

1. the ULID `id`;
2. the **INSTANCE mark** — `PREFIX-FF-NNN` (`WA-00-001`) minted by `generateMark()` and stored on
   the element as `wall.properties.mark` / `door.mark` / `window.mark`;
3. the **ElementCode** — *"a DIFFERENT, dash-free code (`WA001`)"* minted by `ElementCodeStore`.

Plus a fourth axis: `TagMarkSource = 'type' | 'instance'` (`:47`) — **the type/instance distinction
is live in the annotation path**, and a tag may display either.

The file records an unclosed defect in its own header:

> *"OPEN (recorded, not papered over): when an element has NO stored mark, `ScheduleExtractor` still
> falls back to a POSITIONAL `D-001` derived from the array index, while a tag falls back to the
> (stable) ElementCode. **Two different fallbacks = two different keys for an unmarked element.**"*

**Confirmed still true in code:** `packages/core-app-model/src/schedules/ScheduleExtractor.ts` uses
index-derived marks at `:247`, `:273`, `:310`, `:337`, `:343`, `:556`, `:577`, `:605`, `:630`,
`:650`, `:686`, `:714` — e.g. ``const mark = f.properties?.mark ?? `FL${String(idx+1).padStart(3,'0')}` ``.
**An index-derived mark is exactly the "transient index as semantic identity" spec §7 forbids.**
(`:573` also reads `window.columnStore // TODO(TASK-07)` — a P4 cast on the schedule path.)

### 1B.3 TYPES vs INSTANCES for elements — **two levels exist, 22 times over, and only at L2**

Spec §6 wants one `Definition → Type → Instance` spine. The element model has:

- **No DEFINITION level at all.** An element kind's definition *is* its hand-written Zod schema. It
  is not data, cannot be authored at runtime, and cannot be versioned per project.
- **A TYPE level that exists 22 times over**, all in `packages/core-app-model/src/stores/`:
  `BeamTypes, CeilingSystemTypeStore, CeilingTypes, ColumnTypes, CurtainWallTypeStore,
  FloorSystemTypeStore, FloorTypes, FurnitureTypes, HandrailTypeStore, HandrailTypes, KitchenTypes,
  LightingTypes, OpeningTypes, PlumbingTypes, RoofTypes, RoomBoundingLineTypes, StairLandingTypes,
  StairRailingTypes, StairTypeStore, StairTypes, WardrobeCabinetTypes, WardrobeTypes`. Each is a
  bespoke store with its own shape. `CeilingSystemTypeStore.ts:1-5`: *"Registry of named ceiling
  assemblies. Built-in types are immutable factory presets. Custom types are user-defined."* — the
  right idea, implemented once per family.
- **An INSTANCE → TYPE reference that is untyped and optional.**
  `packages/schemas/src/elements/Wall.ts:108`:
  ```ts
  systemTypeId: z.string().optional(),
  ```
  A bare optional string. Compare `.pryzm-family`'s `TypeId` (`family-schema.ts:17`, `typ_` + ULID
  regex). **The element model's type reference carries no brand, no regex, no referential guarantee
  and no requirement.**
- The commands are per-family too: `UpdateWallSystemTypeCommand`, `UpdateDoorSystemTypeCommand`,
  `UpdateWindowSystemTypeCommand`, `UpdateCeilingsSystemTypeBatchCommand`,
  `UpdateSlabsSystemTypeBatchCommand`, `UpdateWallsSystemTypeBatchCommand`, … all under
  `packages/command-registry/src/`.

⛔ **TRAP:** `CeilingSystemTypeStore.ts:5` cites its contract as
`docs/01_ELEMENTS/12_Ceilings/05-CEILING-TYPE-SYSTEM-CONTRACT.md`. **That path does not resolve**
(`ls` → `No such file or directory`). The live authority is
`docs/02-decisions/contracts/C88-ELEMENT-CEILING.md`.

### 1B.4 PROPERTIES vs PARAMETERS — **not distinguished, and the repo has already been bitten**

This is spec §8, and it is the element model's weakest point.

**There is no `properties` field on any L0 element schema.** Measured:

```
$ grep -rn "properties" packages/schemas/src/elements/
packages/schemas/src/elements/Lighting.ts:28: * properties-panel type picker shows the user.
```

**One hit across all 32 element schema files, and it is a comment.** The canonical L0 element
carries `metadata` and `ifcData` and nothing else descriptive. Yet `properties.mark` is the key the
schedule and every tag join on (§1B.2). **The join key of the entire scheduling system lives outside
the canonical schema.**

Where the bag actually lives is per-family and inconsistent:

- **Wall** — `packages/geometry-wall/src/WallStore.ts:535` spreads an undeclared bag and guarantees
  exactly one member:
  `properties: { ...(wall.properties ?? {}), mark: wall.properties?.mark ?? \`WA-XX-…\` }`.
  No interface declares its shape.
- **Ceiling** — `packages/core-app-model/src/stores/CeilingDataSchema.ts:127` *does* declare one,
  and it is the best existing model of a §8 property set:
  ```ts
  const CeilingPropertiesSchema = z.object({
    mark, comments, manufacturer, productCode, installationDate,
    fireRating, acousticRating, cleanroomClass,
    humidityZone: z.enum(['dry','wet','intermittent']),
    thermalTransmittance: z.number(),
  }).passthrough();
  ```
  ⭐ Note `fireRating` — **spec §32's own IDS example already exists as a field.** But note the two
  defects: `.passthrough()` makes it an uncontrolled bag (spec §33: *"never uncontrolled text"*),
  and `thermalTransmittance: z.number()` is **a bare number with no unit** — exactly what spec §10
  forbids. The family stack got this right and the element stack did not.

**The parameter path is a flat untyped map.**
`packages/command-registry/src/generic/UpdateElementParameterCommand.ts` (1,272 LoC) is the generic
mutation entry point:

```ts
export interface UpdateElementParameterInput {
    elementId: string;
    elementType: string;
    parameters: Record<string, any>;   // no type, no unit, no scope, no property/parameter split
}
```

Everything is a "parameter": `height`, `materialColor`, `mark`. There is no notion of a parameter
being derived, formula-driven, type-scoped or instance-scoped — all of which
`packages/family-runtime` has.

⭐ **AND THE REPO HAS ALREADY PAID FOR THIS.** **C03 §4.10** — *"⛔ A STOREY IS NOT A PROPERTY:
`levelId` IS REFUSED ON THE GENERIC PARAMETER PATH"* (2026-08-23, L-10061). The founder, on a slab
that changed storey during a material edit: *"make that impossible by construction, not by a guard
on one path."* Because the arms are `store.update(id, {...existing, ...parameters})`, a partial
merge carrying `levelId` re-filed an element onto another storey **with none of the four effects a
storey move owes it** (the legacy-store move, the world-Y re-seat from the destination elevation,
the `element.level-changed` emit, and an undo inverse routed through `changeLevel`). The fix was a
**refusal**, not a validator tightening. The contract's own note:

> *"⚠ Measured safe before adding … `grep -c levelId ChatCapabilityRegistry.ts` → 0; every
> descriptor family marks it READONLY. **There was no legitimate caller to break — which is exactly
> why the hole stayed open and unnoticed.**"*

**This is the strongest argument in the repository for spec §8.** A flat `Record<string, any>` of
"parameters" cannot tell a dimension from a routing key from a description, so it silently accepted
all three. The universal component editor need not reproduce it: `FamilyParameter`
(`family-schema.ts:121`) already carries `kind` and `dataType`.

### 1B.5 CLASSIFICATION / IFC / bSDD (spec §29–33)

**IFC is correctly modelled as a projection — this part is done, and done well.**

- `packages/schemas/src/ifc/IfcElementMeta.ts:47` — the L0 durable **side-car**: `{pryzmElementId,
  globalId, typeName, name?, description?, objectType?, psets, quantities?, tier}`. Its header
  (`:14-17`) states the layering exactly as spec §29 asks: *"an element's inline `ifc` field is the
  minimal round-trip anchor (guid≡globalId, ifcClass≡typeName); this richer meta carries the
  psets/quantities/tier the exporter needs to reconstruct the original IFC entity."*
- `IfcElementTier` (`:39`) — ADR-008 round-trip fidelity tiers: `1` native editable, `2`
  transform-only proxy, `3` dropped. **An honest capability declaration, per spec §75.**
- `packages/stores/src/IfcMetaStore.ts` is the L3 durable store; it serialises into `.pryzm`.
- `plugins/ifc-export/` is **REACHABLE in the main editor** — `psets.ts` writes
  `IfcPropertySingleValue` → `IfcPropertySet` → `IfcRelDefinesByProperties`; `guid-provider.ts`,
  `provenance.ts`, `owner-history.ts`, `hierarchy.ts` all present;
  `apps/editor/src/engine/initUI.ts:303-353` drives a live progress overlay.
  `plugins/ifc-import/` and `plugins/ifc-inspector/` also exist.

⛔ **But the IFC meta is IMPORT-shaped, not AUTHORING-shaped.** `IfcElementMeta.psets` is documented
as *"Every `IfcPropertySet` that referenced this element **on import**"* (`:58`). There is no way to
*author* a property against a standardised definition inside PRYZM and project it out — spec §31's
requirement. The `.pryzm-family` stack is the one that has this:
`FamilyParameterSchema.ifcMapping` (`family-schema.ts:128`) binds an authored parameter to
`{psetName, propertyName}` **at authoring time**. Again: the capability lives in the unreachable
stack.

**Classification beyond IFC is ABSENT.** Measured (scope: `packages/schemas/src`,
`packages/core-app-model/src`, `plugins/ifc-export/src`, `plugins/ifc-import/src`,
`packages/file-format/src`, `packages/family-runtime/src`; value = matching files):

| Pattern | Files |
|---|---|
| `bSDD` | **0** |
| `buildingSMART Data Dictionary` | **0** |
| `IfcClassification` | **0** |
| `IfcClassificationReference` | **0** |
| `OmniClass` | **0** |
| `Uniclass` | **1 — and it is a comment** |
| `InformationDeliverySpecification` | **0** |

The single `Uniclass` hit is `packages/core-app-model/src/annotations/AnnotationTypes.ts:129` —
*"Free-form structured data (e.g. IFC classification codes, Uniclass references)"*, a doc comment on
a free-form bag — plus `plugins/annotations/src/tools/KeynoteTool.ts:10`, which scopes keynotes to
*"CSI MasterFormat, Uniclass, NRM"* **as keynote text**, explicitly *"rather than live element
parameters."*

**Verdict:** the classification half of §33 (multiple classification REFERENCES with external URIs)
and the whole of §32 (IDS-style machine-readable requirements with ✓Complete / ⚠Missing) are
**genuinely absent**. IFC entity + pset mapping is the only external-standard binding that exists.

### 1B.6 The existing profile editors (spec §62's named proving grounds)

Spec §62 says *"the existing Window Editor … do not throw it away"* and names a **Wall Profile
Editor**. Both exist and **both are reachable in the main editor** — but neither is named what the
spec calls it:

| Spec name | Actual file | LoC | Reached from |
|---|---|---|---|
| "Window Editor" | `apps/editor/src/ui/WindowOutlineEditorDialog.ts` | 201 | `ui/property-panel/PropertyPanelBodyRenderer.ts:41` |
| "Wall Profile Editor" | `apps/editor/src/ui/WallProfileEditor.ts` | 410 | `engine/initTools.ts:61` |
| *(shared surface)* | `apps/editor/src/ui/ElevationOutlineSurface.ts` | 389 | both |

⚠ **There is no file or symbol named `WindowEditor` anywhere** — grep for `WindowEditor|window-editor`
over `plugins`, `apps/editor/src`, `packages` → **0 hits**. Anyone searching the spec's term will
conclude it does not exist. It does; it is `WindowOutlineEditorDialog`. The deeper UX analysis
belongs to the editor lane; **the semantic finding here is that ~1,000 LoC of outline/profile editing
already lives in the main editor, entirely separate from `apps/component-editor`'s 5,918-LoC
sketcher. That is already two profile-editing systems, and the universal editor would be the third**
— an EI-9 ("one answer per question") exposure that must be decided, not inherited.

---

## 2 · WHAT IS REUSABLE, AND HOW

Ordered by leverage. Every row names a thing to reuse, not a thing to write.

### 2.1 ⭐⭐ REUSE `family-schema.ts` AS THE CANONICAL COMPONENT MODEL — do not design a new one

Spec §77 Phase 1 asks for a *"canonical model proposal … across ComponentDefinition, ComponentType,
ComponentInstance, SemanticClass, Property, Parameter, Formula, Constraint, Feature, Geometry,
Representation, Material, Relationship, Host, Connector, Visibility, Provenance, Version."*
**Fourteen of those nineteen already have a Zod schema in one 266-line file** (§1.1). Phase 1 is
therefore not a design exercise but a **gap-closure exercise against an existing file** — a much
smaller and much safer job.

The renaming question is real but shallow: PRYZM says `FamilyDocument / FamilyType /
InstanceOverrides` where the spec says `ComponentDefinition / ComponentType / ComponentInstance`.
**C84 EI-8 ("ONE VOCABULARY PER CONCEPT") makes choosing one mandatory, and C107 §1.1 makes it
urgent** — that contract mints its family with *"ONE spelling, decided now"* precisely because
*"C101 §1 records **four vocabularies over one family** as the annotation family's headline
defect."* Decide `family` vs `component` in Phase 1 and never again.

### 2.2 ⭐⭐ REUSE `@pryzm/family-runtime` FOR §9–§12 WHOLESALE

Zero dependencies, already tested. It has typed parameters with canonical units; `type` vs
`instance` scope; expressions; **topological resolution order**; **cycle detection**; eight
structured diagnostic codes; and `ResolverInput = {parameters, type, instanceOverrides}`, which *is*
spec §12's resolution order expressed as a function signature. Spec §66's parametric test (20
instances; one changes alone; type change propagates; formula recomputes dependents) is a test
**against this resolver**, not a build.

### 2.3 ⭐ REUSE THE `.pryzm-family` ENVELOPE FOR §36–§37 AND §71

`formatVersion` + a migration framework + canonical JSON + deterministic ZIP + `sha256` schema hash
+ Ed25519 signing + an NDJSON event log. Spec §71's *"cache identity = canonical definition hash +
parameter state + kernel version + representation settings"* — the first two terms already exist as
`schemaHash` and the resolver output; only kernel version and representation settings need adding.

### 2.4 ⭐ REUSE THE IDENTITY CONVENTION — then close L-666

`createId(prefix)` and the family schema's prefixed-ULID regexes are the same design. **Then close
C11 §7.6 / L-666** by writing the clause and the static gate ADR-0001 §4 promised. That makes spec
§7 true rather than conventional, and it is small, already-scoped work.

### 2.5 ⭐ REUSE `IfcElementMeta` + `plugins/ifc-export` AS THE §29–31 PROJECTION

The side-car pattern is exactly the shape the spec asks for. Extend `FamilyParameter.ifcMapping`
(authoring-time binding) rather than teaching `IfcElementMeta` to be authored. Reuse
`IfcElementTier` as the honest declaration of what actually round-trips.

### 2.6 REUSE `parentId` / `childrenIds` FOR §25 NESTING

The compound-parent pattern is proven on two shipped families — `pool` (ADR-0124 §3, L-292) and
`balcony` (C103, L-5600) — with `lift` following (C104, L-5711). `types/Id.ts:41-60` documents the
ownership semantics. **A nested component is a compound parent.** ⚠ Note the asymmetry to resolve
first: Stack 2 has a `composite` primitive kind (`family-parametric/primitive.ts:36`), Stack 1 has
no nesting at all, and the element model nests through ids. **Three answers to one question — an
EI-9 violation waiting to be minted.**

### 2.7 REUSE `CeilingPropertiesSchema` AS THE §8 PROPERTY TEMPLATE — with two fixes

It already names `mark, comments, manufacturer, productCode, installationDate, fireRating,
acousticRating, cleanroomClass, humidityZone, thermalTransmittance` — a real, domain-correct
property set including spec §32's own `fireRating` example. Promote it to L0, **drop
`.passthrough()`**, and **give every numeric field a unit** (`thermalTransmittance` is W/m²K and the
schema does not say so).

### 2.8 REUSE THE SKETCHER AND SOLVER IN `apps/component-editor/src/sketch/`

Seven tools, a hit-tester, a snapper, a renderer and a live solver loop against
`@pryzm/constraint-solver`. Spec §68's constraint test targets code that exists. **What is missing is
the 3D tab and the parameter table, not the sketch.**

### 2.9 REUSE THE FOUR-AXIS REACHABILITY METHOD (C84 §3.5.1)

Not a component — a method, and this programme needs it more than most, because C107 §0.1 records
that **"fifteen built-but-unreachable surfaces were found in the session preceding this contract."**
Every reachability claim must state which axes it measured: (a) import/construction, (b) bus verb,
(c) build graph, (d) call. *"A claim that names fewer than four axes is not a deletion claim."*

---

## 3 · WHAT IS GENUINELY MISSING

Each row is evidenced by a **search that failed**, quoted.

### 3.1 The spec's own names — and, more importantly, a DEFINITION level for elements

```
$ grep -rl "ComponentDefinition"  <schemas|core-app-model|family-runtime|file-format|component-editor>/src  →  0
$ grep -rl "ComponentInstance"    (same scope)                                                              →  0
$ grep -rl "SemanticClass"        (same scope)                                                              →  0
$ grep -rl "ComponentType"        (same scope)  →  1  (WardrobeTypes.ts:13 `InteriorComponentType` — unrelated)
```

The *concepts* exist (§1.1); the *names* do not. And one level is genuinely absent: **the element
model has no runtime-authorable definition level at all** — an element kind is a compiled Zod schema.
That is the deepest structural gap between the element model and the spec, and it is exactly why the
Family Platform was built. The two were never joined (§3.4).

### 3.2 Connectors (spec §27) — absent

```
$ grep -rl "Connector"    <same scope>  →  1
   packages/core-app-model/src/stores/ShowerGeometry.ts:177:    // Connector hub on top
$ grep -rl "connectorId"  <same scope>  →  0
```

One comment about shower plumbing geometry. **There is no first-class connector object anywhere** —
no identity, position, orientation, type, allowed connections or compatibility. Spec §27's "machine
reasoning over systems" has no substrate.

### 3.3 Classification references and IDS requirements (spec §32, §33) — absent

See the table in §1B.5: `bSDD` 0 · `IfcClassification` 0 · `IfcClassificationReference` 0 ·
`OmniClass` 0 · `InformationDeliverySpecification` 0 · `Uniclass` 1 (a comment). There is no
`✓ Complete / ⚠ Missing required information` surface, and nowhere to declare that a fire door
*requires* a `FireRating` drawn from `{EI30, EI60, EI90}`.

### 3.4 ⭐ THE JOIN BETWEEN THE TWO STACKS — absent, and this is the real headline gap

The `.pryzm-family` stack can define, type, parameterise, constrain and bake a component. The element
stack can place, host, schedule, tag, undo, collaborate on and export one. **Nothing connects them.**
Measured on all four C84 §3.5.1 axes:

- **(a) import/construction** — no source file outside `apps/bake-worker`, `apps/bench`,
  `tests/family-load-into-project` and `packages/family-*` itself imports `@pryzm/family-loader` /
  `family-instance` / `family-runtime`. **`apps/editor` imports none of them.**
- **(b) bus verb** — a scoped grep over `packages/command-bus/src`, `packages/command-registry/src`,
  `plugins` and `apps/editor/src` returned **no matches**:
  ```
  $ grep -rn "'family\.|\"family\.|familyInstance\.|family\.place|family\.load" \
      packages/command-bus/src packages/command-registry/src plugins apps/editor/src
  (no output)
  ```
  **There is no bus verb that places a `.pryzm-family` into a project.**
- **(c) build graph** — root `package.json:136-138` declares all three as workspace deps, and
  `apps/bake-worker/package.json:27-28` / `apps/bench/package.json:38` consume them. The packages are
  *built*; nothing in the editor's graph needs them.
- **(d) call** — `apps/component-editor/src/index.ts:10` and `src/app/deepLink.ts:8` both state in
  comments that *"the actual `loadFamily` wiring lands when `@pryzm/family-loader` is [wired in]"*.
  **The Family Creator cannot open or save a `.pryzm-family` file today.**

⚠ **AND THE TEST NAMED FOR THIS DOES NOT PROVE IT.**
`tests/family-load-into-project/family-load-into-project.test.ts` is titled *"end-to-end gate (S56
D4)"* and claims to prove that *"a real `.pryzm-family` … round-trips … [and] the bake-worker
`processFamilyInstanceJob` accepts the same bytes."* Its imports are exactly:

```ts
} from '@pryzm/file-format';   … '@pryzm/family-loader';   '@pryzm/family-instance';
import { InMemoryStorageDriver } from '@pryzm/storage-driver';
import { processFamilyInstanceJob } from '@pryzm/bake-worker/jobs/family-instance';
```

A scoped grep of that file for `ElementStore|commandBus|command-bus|elementStore|createId|SCHEMA_REGISTRY|@pryzm/stores`
returns **nothing**. **It never touches a project, a store, an element or the command bus.** It
proves the *bake chain*; its name claims *project insertion*. Per the repo's own "committed ≠
reachable" lesson: **do not read this test as evidence that S56 landed.**

### 3.5 Booleans, and three of the four solid features

`SolidFeatureSchema` (`family-schema.ts:172`) has exactly four members — `extrude`, `sweep`, `loft`,
`revolve`. **Union / subtract / intersect are not among them**, despite the README's S53 row reading
*"sketch tools + sweep / loft / revolve + booleans"*. Of the four that do exist,
`bakeFamilyInstance.ts:13-21` implements **one**. Spec §67's geometric test is a build, not a wiring
job.

### 3.6 Semantic visibility (spec §28) and derived 2D representations (spec §21)

`lod: {coarse, medium, fine}` booleans exist per solid; `visible when PanelCount > 2` does not. There
is no plan / elevation / section *representation* in the family document at all — Stack 2 has a
`plan-symbol-ref` (`packages/schemas/src/family-geometry/plan-symbol-ref.ts`); Stack 1 has nothing.

### 3.7 Units in the element model — and the two stacks disagree

`CeilingPropertiesSchema.thermalTransmittance: z.number()` carries no unit. `Wall.height` and
`Wall.thickness` are documented as **metres in a comment** (`Wall.ts:100,102`), while
`family-runtime` stores lengths in **millimetres** (`types.ts:9-13`). **Two canonical length units,
one repository.** Spec §10 requires typed units; only the family stack has them, and the two stacks
disagree on the unit. **This must be resolved before anything is baked across the boundary.**

---

## 4 · TRAPS — what a newcomer will trip over

**T1 · "Family" means two different things.** `packages/schemas/src/family-*` (Stack 2, furniture
ingestion, LIVE) and `packages/file-format/family-schema.ts` + `packages/family-*` (Stack 1,
component authoring, UNREACHABLE) share the word and nothing else: different id formats
(`family/com.pryzm.core/desk` vs `fam_<ULID>`), different parameter models, different IFC mappings
(`{entityType, predefinedType, psets}` vs `{psetName, propertyName}`), different category
vocabularies. **Always say which stack.**

**T2 · `apps/component-editor` looks finished and is not.** 5,918 LoC, 12 test suites, 6 quality
gates, an AI bridge and a marketplace publish flow — but `AppShell.ts:164-194` routes two of three
tabs to `appSplash.ts`, whose titles are literally *"3D preview — under construction"* and
*"Parameter table — under construction"*. **Read `renderActivePanel` before believing a screenshot.**

**T3 · ADR-0316 fences the second composition root, and a test enforces the fence.**
`__tests__/app/secondCompositionRoot.invariants.test.ts` pins `FORBIDDEN_IMPORTS` (persistence,
collaboration, BIM aggregate stores, renderer) and calls that *"the single most important assertion
in the file."* Its header warns: *"If one fails, the answer is NOT to relax the assertion."* Any
architecture that merges the component editor into the main editor, or lets it read project stores,
**must reopen ADR-0316 explicitly.** The 180 KB first-paint budget is the stated reason and it is
real.

**T4 · Element id minting is uncontracted — and C11 is cited for a rule it does not state.**
C11 §7.6, verbatim: *"C11 is being cited for a rule it does not state."* Do not cite C11 §3.2 for id
minting. The factory is `createId(prefix)` (ADR-0001); its gate *"scheduled for S07"* was **never
written**; ADR-0113 minted a contradicting id deliberately. Status **OPEN (L-666)**.

**T5 · Three marks per element, and two different fallbacks.** ULID `id` · `properties.mark`
(`WA-00-001`) · `ElementCodeStore` code (`WA001`), plus a `'type' | 'instance'` display axis.
`ScheduleExtractor` falls back to an **array index** (`FL001` from `idx+1`) while a tag falls back to
the ElementCode. `elementMarks.ts:18-23` records this as OPEN. **An index-derived mark violates spec
§7 directly.**

**T6 · `properties` is not in the canonical schema.** One grep hit across all 32 element schema
files, and it is a comment. The bag lives at L2, per family, and only Ceiling declares a shape for it
— with `.passthrough()`. Anyone who assumes `element.properties` is canonical will be wrong.

**T7 · The generic parameter path merges blindly, and C03 §4.10 is the scar.**
`store.update(id, {...existing, ...parameters})` accepted `levelId` and silently re-filed elements
between storeys *"with none of the four effects a storey move owes it."* The fix was a **refusal**.
⚠ Note the subtlety recorded there: `baseLevelId` / `topLevelId` are **deliberately NOT refused**,
because they are a span rather than a routing key. **Do not "tidy" that asymmetry.**

**T8 · In-code contract paths rot.** `CeilingSystemTypeStore.ts:5` cites
`docs/01_ELEMENTS/12_Ceilings/05-CEILING-TYPE-SYSTEM-CONTRACT.md`, which **does not exist**; the live
authority is `C88-ELEMENT-CEILING.md`. `check-contract-cited-paths.ts` (L-960) exists for this class,
and its first reading was **491 UNRESOLVED of 1,528 citations**. Verify before following.

**T9 · `SCHEMA_REGISTRY` is not a census of element kinds.** 28 registry entries, 32 files in
`src/elements/`. `Balcony`, `BoundaryLine`, `Section` and `CurtainPanelVocabulary` define schemas the
registry omits — and `Balcony` / `BoundaryLine` are governed by real contracts (C103, C106).

**T10 · The spec's "Window Editor" has a different name.** `grep -rl "WindowEditor|window-editor"`
over `plugins`, `apps/editor/src`, `packages` → **0 hits**. It is
`apps/editor/src/ui/WindowOutlineEditorDialog.ts` (201 LoC), reached from
`PropertyPanelBodyRenderer.ts:41`. `WallProfileEditor.ts` (410 LoC) does exist under that name,
reached from `initTools.ts:61`.

**T11 · There are already five material vocabularies (C84 EI-8).** The 204-entry
`STANDARD_MATERIAL_LIBRARY`, a 16-entry render overlay, **18 per-plugin `material-bridge.ts`
palettes** (three of which *"take `_key` and discard it, so they cannot express a material at all"*),
a hand-transcribed 15-entry `FINISHES`, and a 6-value `materialName` enum. Spec §23 wants semantic
materials; **a sixth vocabulary is the default outcome unless it is designed against EI-8.** Note
EI-8's warning: `HandrailTypeStore.ts:19-26`'s `materialName` *"is the one vocabulary carrying
PHYSICAL semantics, not hue … Any unification that collapses it to a hex **loses information** and is
forbidden."*

**T12 · Hosting from a plan-view gesture cannot capture a host id today (C107 §2.3).** Measured at
`f159ed7a`: `PlanSnapEngine` constructs **eleven** snap candidates and exactly **two** carry a
`sourceId` (`:461` grid-line, `:475` grid-intersection). *"The engine walks the wall to compute the
endpoint and discards which wall it was before returning."* The 3-D `SnapManager` does carry
`sourceId` / `sourceType` / `levelId`. **Shipping spec §26 hosting in 3-D only would produce a family
whose two creation paths yield structurally different records — C11's signature failure, which C107
records this repo has hit eight times.**

**T13 · C84 §6 requires twelve mandatory sections for any new element-family contract**, and C107 is
the worked template (462 lines; AS-IS/TO-BE tables per axis; a measured absence census in §0.1; a
naming-disclosure clause in §0.2-a). A universal component *kind* will need one.

**T14 · Do not trust a test's name.** §3.4: `family-load-into-project` touches no project. C107
§0.1's fifteen-unreachable-surfaces finding and the standing "committed ≠ reachable" lesson are the
same warning.

---

## 5 · THE ONE-PARAGRAPH ANSWER TO §81 ITEMS 1–3, FOR THIS LANE'S SCOPE

**What PRYZM already has:** a complete, contract-grade, L0 canonical component model
(`family-schema.ts`) with three-level definition/type/instance, prefixed-ULID identity across eight
id spaces, typed parameters with canonical units and a real cycle-detecting expression resolver,
twelve persisted constraint kinds that can be parameter-driven, four solid features, material slots,
reference planes with a host flag, per-solid LOD, an authoring-time IFC parameter binding, and a
versioned, migrating, signed, content-addressed envelope — plus a 5,918-LoC editor app with a working
sketcher and constraint solver; and, separately, a 28-kind element model with branded ULID identity,
compound-parent nesting, a reachable IFC side-car and exporter, and 22 per-family type registries.
**What is reusable:** essentially all of the first list as-is, plus the element model's
compound-parent nesting and IFC projection. **What is genuinely missing:** connectors; classification
references and IDS requirements; booleans and three of four solid producers; semantic (non-LOD)
visibility; derived 2D representations; a runtime-authorable definition level for *elements*; unit
declarations in the element model; and — above all — **any join at all between the component stack
and the element stack**, which is absent on all four C84 §3.5.1 reachability axes.

> **The lane's closing judgement.** The founder's warning is *"you accidentally create a beautiful
> editor whose internal model is too weak to become the PRYZM World Model."* On this lane's evidence
> the risk runs the other way: **PRYZM already built a strong internal model and never connected it
> to anything.** The work is not to design the canonical model. It is to close about six named gaps
> in an existing 266-line schema, and then to build the one thing that has never existed — the bus
> verb, the command and the store route that place a `.pryzm-family` into a project as a first-class
> element.
