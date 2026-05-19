# SPEC — The PRYZM Family Editor (a.k.a. the Component Editor)

| Field | Value |
|---|---|
| Status | Draft — design-of-record |
| Version | 1.0 |
| Date | 2026-04-28 |
| Owner | Architecture lead |
| Related specs | `SPEC-05-TYPE-CATALOG.md` (parameter model), `SPEC-01` (geometry kernel + constraint solver), `ADR-014` (AI host & approval queue), `ADR-017` (type catalog scope), `ADR-027` (parameter expression evaluator) |
| Phase deliverables | `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` (D10 — sketcher + first author flow), `phases/PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` (S55 parameter table & expressions, S59 marketplace) |
| Sprint owners | **S52 D10** (real solver + sketcher canvas), **S55** (parameter table + expressions + IFC binding), **S58** (component editor as separate SPA in `apps/component-editor`), **S59** (`.pryzm-family` marketplace publish flow) |
| Existing code | `src/component-editor/` (78-line bootstrap + 528-line workspace prototype with Three.js + `@thatopen/ui`), `packages/types-builtin/` (system-family starter catalog), `packages/constraint-solver/` (mock — real `planegcs` WASM lands at S52) |

> **One-line summary**
> The Family Editor is a self-contained sub-app inside PRYZM where a user (or a marketplace author) draws a 2D parametric profile, names some parameters, hits *extrude / sweep / revolve*, declares which slots are materials, and saves the result as a `.pryzm-family` file. The main editor can then *load* that family and place instances of its types on a project — the same way it places a built-in wall or door today.

---

## §1 What is a "family"?

PRYZM follows the well-known three-axis BIM model from `SPEC-05 §1.1`:

```
Family   (schema + behaviour)
  └─ Type   (named configuration; values for type-parameters)
       └─ Instance   (placed element; values for instance-parameters)
```

### §1.1 Two kinds of family

| Kind | Defined in | Author | Example |
|---|---|---|---|
| **System family** | TypeScript, in `packages/types-builtin/` | PRYZM team | `Wall`, `Floor`, `Roof`, `Ceiling`, `Stair`, `Railing`, `Curtain Wall`, `Curtain Grid` |
| **Loadable family** | Authored visually in the **Family Editor**; serialised as `.pryzm-family` | Anyone (user, consultant, marketplace) | `Door`, `Window`, `Furniture`, `Casework`, `Plumbing Fixture`, `Lighting Fixture`, `Generic Model` |

The Family Editor exists for the **loadable** axis. System families are out of scope — they ship in code because their behaviour (e.g. wall joins, slab edge conditions) cannot be expressed as a finite parametric profile.

### §1.2 Why this matters

Without a family editor:

- The product ships with whatever doors / windows / furniture the team had time to hard-code. Architects cannot adapt them.
- A marketplace is impossible — there is no portable representation for a third party to author and publish.
- IFC round-trip is incomplete — `IfcDoorType` instances coming in from a foreign authoring tool cannot be re-edited; they get downgraded to opaque proxies.

The family editor closes all three gaps with one artifact: a portable, versionable `.pryzm-family` file produced by an author and consumed by the main editor.

---

## §2 What the user actually does

End-to-end author journey, in order:

1. **Open the editor** from the main app (`File → New Family…`) or as a standalone SPA (`apps/component-editor`).
2. **Pick a domain template** — Door, Window, Furniture, Casework, Lighting, Plumbing, Generic. The template seeds reference planes, default parameters (`Width`, `Height`), and the IFC entity binding (`IfcDoor`, `IfcFurniture`, …).
3. **Sketch the profile** on a reference plane (Ref Level / Front / Side), using the 2D sketch tools (line, arc, rectangle, fillet, trim).
4. **Add geometric and dimensional constraints** (parallel, perpendicular, equal-length, distance, radius, angle). The constraint solver runs after every change and re-positions free points so the constraints are satisfied.
5. **Bind dimensions to parameters** — drag the `Width` parameter onto the horizontal distance constraint; the constraint becomes `= Width`.
6. **Generate 3D** — pick a profile, choose **Extrude / Sweep / Loft / Revolve**, specify start/end planes (or a path curve for sweep), assign a material slot.
7. **Declare parameters** in the parameter table — for each one, set `kind` (type vs instance), `dataType`, `defaultValue`, optional `expression` (e.g. `Width / 2`), `isExposed` (visible on placed instances), and the IFC `psetName` / `propertyName` it maps to.
8. **Define one or more types** — name a configuration ("Single Flush 900 mm"), pin values for every type-parameter; add as many types as you want in this family.
9. **Preview** — toggle Coarse / Medium / Fine detail level; flip between the sketch view, the 3D view, and the schedule preview.
10. **Save** — `Ctrl+S` writes a `.pryzm-family` file (and auto-versions it). The file is self-contained: profiles, constraints, parameters, types, materials, IFC bindings, and a thumbnail.
11. **Load into project** — back in the main editor, `Insert → Family…`, pick the file, drop instances on a level. Each instance carries a reference to a *type* in the family; the type can be swapped, parameters can be overridden per-instance.

Publish to marketplace (S59) is the same `Save`, plus a server upload + signing step.

---

## §3 Where the editor lives in the architecture

```
                            ┌─────────────────────────────┐
                            │   apps/component-editor     │  ◄── separate SPA at S58
                            │   (vanilla TS + Three.js)   │      During S52→S57 it lives
                            └──────────────┬──────────────┘      inside the main editor as
                                           │                     `src/component-editor/`
                                           │ produces/consumes
                                           ▼
                    ┌──────────────────────────────────────────┐
                    │        .pryzm-family file format         │
                    │   (Zod-validated; sub-format of .pryzm)  │
                    └──────────────────────┬───────────────────┘
                                           │
       ┌───────────────────────────────────┼───────────────────────────────────┐
       │                                   │                                   │
       ▼                                   ▼                                   ▼
┌─────────────┐                  ┌──────────────────┐                ┌──────────────────┐
│ marketplace │                  │  main editor     │                │  bake-worker     │
│  (S59 +)    │                  │  loads family,   │                │  bakes instance  │
└─────────────┘                  │  registers types │                │  geometry into   │
                                 │  with the type   │                │  the .pryzm file │
                                 │  catalog (L1)    │                │  on commit       │
                                 └──────────────────┘                └──────────────────┘
```

### §3.1 Layer placement

The editor itself is **L7 / chrome** — it is a React-free DOM app that talks to the same lower layers the main editor uses:

| Layer | What the family editor uses |
|---|---|
| L1 — Stores | A scoped `familyDocumentStore` that holds the in-progress profiles, constraints, parameters, types, and material slots. One store per open family document. |
| L2 — Command bus | Every author action (`addLine`, `addConstraint`, `bindParameter`, `extrude`, `addType`) goes through `@pryzm/command-bus` so undo/redo, audit, and AI batch-undo (see ADR-014 + S54) come for free. |
| L3 — Persistence | The store's patch stream is written into the family document via the same event-log machinery the main project uses; on save, it serialises to `.pryzm-family`. |
| L4 — Geometry kernel | `produceExtrude / produceSweep / produceLoft / produceRevolve` (added at S52 alongside the sketcher) are pure descriptor producers, just like `produceWall`. |
| L4.5 — Constraint solver | `@pryzm/constraint-solver` wraps `planegcs` WASM (S52). The sketcher sends `{ entities, constraints }` to the solver and receives back resolved point positions; rendering is decoupled from solving. |
| L5 — Committer | A `FamilyPreviewCommitter` translates the descriptor → `BufferGeometry` for the Three.js preview, exactly the way `WallCommitter` does for the main scene. |
| L7 — Chrome | Sketch toolbar, parameter table, types panel, view tabs (Ref Level / 3D / Front / Side), all DOM. |

Critically, **none of this code is allowed to bleed into the main editor's first-paint bundle**. The whole editor is loaded behind `await import('./component-editor/index.js')` triggered by `File → New Family…`. The K3-A static enforcer (the same one that protects the AI host from leaking into first-paint) will be extended to cover the family editor at S52 close.

---

## §4 The authoring model in detail

### §4.1 Profiles & sketch entities

A *profile* is a closed (or open, for sweep paths) loop of sketch entities on a single reference plane. Sketch entities:

| Entity | Schema (Zod, rough) |
|---|---|
| `Point` | `{ id, x, y, fixed?: boolean }` |
| `Line` | `{ id, startId, endId }` |
| `Arc` | `{ id, centerId, startId, endId, sweep: 'cw'\|'ccw' }` |
| `Circle` | `{ id, centerId, radius }` |
| `Spline` | `{ id, controlIds[], degree }` |

All entities reference points by id so constraints can lock either an entity or a single point.

### §4.2 Constraints

Two flavours:

| Geometric (no value) | Dimensional (value or expression) |
|---|---|
| `Coincident(p, q)` | `Distance(p, q, expr)` |
| `Parallel(L, M)` | `DistancePointLine(p, L, expr)` |
| `Perpendicular(L, M)` | `Radius(arc, expr)` |
| `Tangent(arc, line)` | `Angle(L, M, expr)` |
| `Equal(L, M)` (length) | `Diameter(circle, expr)` |
| `Horizontal(L)` / `Vertical(L)` | |
| `OnPlane(p, refPlane)` | |

`expr` is a string in the parameter expression DSL (ADR-027): literals, `+ - * /`, `min`, `max`, `if`, `sin`, `cos`, plus references to declared parameters by name. The evaluator is sandboxed (no global access, no I/O) and runs deterministic.

### §4.3 The constraint solver loop

Every command-bus mutation that changes an entity or a constraint triggers:

```
1. Snapshot pre-state (Immer patches, by command-bus).
2. Build solver problem from the new {entities, constraints}.
3. Evaluate every dimensional expression against the current parameter values.
4. Send to planegcs WASM. Result is one of:
     a. solved → write resolved point coordinates back into the store.
     b. over-constrained → command rejected; bus surfaces a typed error
        (`CommandBusError('over-constrained', { conflicting: [c1, c2] })`).
     c. under-constrained → command accepted but the editor decorates
        free DOFs with a yellow halo so the author sees them.
5. Re-emit the patches for the resolved positions.
6. The committer rebuilds the affected geometry descriptors.
```

The solver is wrapped in a porter (`SketchSolverPorter`) so the editor uses the mock implementation in tests and `planegcs` WASM in production — same pattern as `VoiceTranscriberPorter` from S52 voice work.

### §4.4 3D operations

Once a profile is closed and solved, the author picks one of:

| Op | Required inputs |
|---|---|
| **Extrude** | profile + (startPlane, endPlane) or (startPlane, lengthExpr) |
| **Sweep** | profile + path curve (which is a separate open profile) |
| **Loft** | ≥ 2 profiles on parallel planes + (optional) guide curves |
| **Revolve** | profile + axis line + sweepAngleExpr |
| **Boolean union / subtract / intersect** | two existing 3D solids |

Each op produces a *solid feature* that lives in the family document. Solids reference their inputs; if you change the profile, every dependent solid re-builds via the standard committer flow.

### §4.5 Parameters

The parameter table is the heart of what makes a family parametric. A `FamilyParameter` (from `apps/component-editor/src/panels/parameters.ts`, S55):

```ts
interface FamilyParameter {
  id: string;
  name: string;                                            // "Width", "Frame Depth"
  kind: 'type' | 'instance';                               // see SPEC-05 §2.1
  dataType: 'length' | 'angle' | 'area' | 'volume'
          | 'number' | 'text' | 'boolean' | 'material';
  defaultValue: string | number | boolean;
  expression?: string;                                     // e.g. "Width / 2"
  isExposed: boolean;                                      // shown on instances
  unit?: string;                                           // mm, m, deg, m²
  ifc?: { psetName: string; propertyName: string };        // for IFC mapping
}
```

Resolution order at any read site (matches SPEC-05 §2.3):

```
parameter value = instance.parameters[name]
              ?? type.parameters[name]
              ?? family.defaults[name]
              ?? evaluate(parameter.expression)        // last-resort derived
```

A *type* (within a family) is just a named freeze of the type-parameter values:

```ts
interface FamilyType {
  id: string;                            // "door.single-flush.900mm"
  name: string;                          // "Single Flush — 900 mm"
  parameters: Record<string, unknown>;   // values for every kind:'type' parameter
}
```

A family with no types is invalid — the editor refuses to save until at least one type exists (this is what the main editor places).

### §4.6 Material slots

A material slot is a named extrusion- or face-attached binding, e.g. `Frame`, `Leaf`, `Glass`. The author creates the slot in the editor; placement-time, the consumer (main editor or marketplace user) can swap the actual material from the project's material library (SPEC-05 §4) without re-authoring the family.

### §4.7 Visibility per detail level

Every solid feature carries a bitmask `{ coarse: boolean, medium: boolean, fine: boolean }`. Coarse is what shows in plan from far away; fine is the full 3D in close section. The author toggles which solids appear at which level — a door at coarse might be just a swing arc, at fine the full hardware.

---

## §5 The `.pryzm-family` file format

A `.pryzm-family` is a deterministic, deflate-compressed JSON file with this structure (Zod-validated on load):

```jsonc
{
  "format": "pryzm-family",
  "version": 1,                               // bumps with breaking schema changes
  "id": "fam_01HXY…",                         // stable family id
  "name": "Standard Single-Flush Door",
  "domain": "Door",                           // one of: Door | Window | Furniture | …
  "ifcEntity": "IfcDoor",
  "thumbnail": "data:image/png;base64,…",

  "referencePlanes": [
    { "id": "ref-front", "name": "Front", "axis": "XZ", "isPrimary": true },
    { "id": "ref-side",  "name": "Side",  "axis": "YZ" }
  ],

  "parameters": [
    { "id": "p_width",  "name": "Width",  "kind": "type",     "dataType": "length",
      "defaultValue": 900, "unit": "mm", "isExposed": true,
      "ifc": { "psetName": "Pset_DoorCommon", "propertyName": "OverallWidth" } },
    { "id": "p_height", "name": "Height", "kind": "type",     "dataType": "length",
      "defaultValue": 2100, "unit": "mm", "isExposed": true,
      "ifc": { "psetName": "Pset_DoorCommon", "propertyName": "OverallHeight" } },
    { "id": "p_handing","name": "Handing","kind": "instance", "dataType": "text",
      "defaultValue": "left", "isExposed": true }
  ],

  "profiles": [
    { "id": "prof_leaf",
      "plane": "ref-front",
      "entities": [ /* points, lines, arcs … */ ],
      "constraints": [
        { "kind": "horizontal", "of": "ln_top" },
        { "kind": "distance",   "from": "p_tl", "to": "p_tr", "expr": "Width" },
        { "kind": "distance",   "from": "p_bl", "to": "p_tl", "expr": "Height" }
      ]
    }
  ],

  "solids": [
    { "id": "sol_leaf",
      "op": "extrude",
      "profile": "prof_leaf",
      "lengthExpr": "FrameThickness",
      "materialSlot": "Leaf",
      "lod": { "coarse": false, "medium": true, "fine": true } }
  ],

  "materialSlots": [
    { "id": "Leaf",  "defaultCategory": "wood" },
    { "id": "Frame", "defaultCategory": "wood" },
    { "id": "Glass", "defaultCategory": "glass" }
  ],

  "types": [
    { "id": "door.single-flush.900mm",
      "name": "Single Flush — 900 mm",
      "parameters": { "Width": 900, "Height": 2100, "FrameThickness": 45 } },
    { "id": "door.single-flush.1000mm",
      "name": "Single Flush — 1000 mm",
      "parameters": { "Width": 1000, "Height": 2100, "FrameThickness": 45 } }
  ],

  "audit": {
    "createdBy": "user_…",
    "createdAt": "2026-04-28T…",
    "lastModifiedBy": "user_…",
    "lastModifiedAt": "2026-04-28T…",
    "schemaHash": "sha256:…"
  }
}
```

Round-trip invariants:

- **Determinism**: writing the same in-memory document twice produces byte-identical files. Tested by a parity gate at S55 close.
- **Forward compatibility**: an unknown top-level field is preserved; an unknown entity inside a known list is rejected at parse time (no silent loss).
- **Schema versioning**: the loader supports the current `version` and one prior; older files run through migrators in `packages/family-format/src/migrations/`.

---

## §6 Integration with the main editor

### §6.1 Loading

`Insert → Family…` calls `loadFamily(path)`:

1. Reads the `.pryzm-family`, runs Zod validation.
2. Registers each `FamilyType` with the project's `systemTypeStore` under the family's id.
3. Caches the parsed document keyed by `(familyId, schemaHash)` so subsequent placements are instant.

### §6.2 Placement

The user picks a type and clicks on a level / a wall (depending on the `domain`). The main editor dispatches a normal command:

```ts
bus.executeCommand('door.create', {
  typeId: 'door.single-flush.900mm',
  hostWallId: 'wall_…',
  position: { …WallParametricPosition },
  parameters: { Handing: 'right' },          // instance overrides
});
```

The handler is plain — same shape as today's `door.create`, just dispatched against a *loaded* type id rather than a built-in catalog id.

### §6.3 Bake & render

When the user commits, `apps/bake-worker` reads the family document, resolves every parameter against the instance + type, runs the geometry kernel producers (`produceExtrude` etc.) to produce a `BufferGeometryDescriptor`, hashes it, and writes it into the project's bake cache. The main editor's `FamilyInstanceCommitter` reads the descriptor and hands a `BufferGeometry` to Three.js.

Cache keying uses `(familyId, typeId, instanceParametersHash)` so two instances with the same overrides share geometry.

### §6.4 Updates & versioning

If an author publishes a new version of a family, the main editor on next open prompts: "12 instances reference an older version of *Standard Single-Flush Door*. Migrate?" Migration runs the schema migrators against each instance's parameter map and re-bakes.

### §6.5 Inspector

When the user selects a placed instance, the property panel (S60) shows a section per `isExposed: true` parameter from the type/family. Read-only parameters are dimmed; editable ones write back through the normal command bus.

---

## §7 Phase rollout

Mapped against the master plan (`10-MASTER-IMPLEMENTATION-PLAN-36M.md` §6).

### §7.1 What ships now (M27, today)

`src/component-editor/` (78 + 528 LoC + 5 tools) is a working prototype:

- Three view tabs (Ref Level / 3D / Front).
- 2D sketch tool with mouse capture (`SketchToolEnhanced.ts`).
- Hardcoded `document` with `domain: "Furniture"` and two parameters.
- `MockSolver` from `packages/constraint-solver/` (no real planegcs).
- `Load into Project` button that dispatches a `component-editor-load` event the main editor listens to.

This is enough for internal demos. **It is not the production family editor.**

### §7.2 S52 D10 — sketcher canvas + real solver (M27)

| Deliverable | File |
|---|---|
| Replace `MockSolver` with real planegcs WASM via `SketchSolverPorter` | `packages/constraint-solver/src/planegcs-porter.ts` |
| Wire the sketch tool through the command bus (currently it edits store directly) | `src/component-editor/tools/SketchToolEnhanced.ts` |
| Add `produceExtrude / Sweep / Revolve` to the geometry kernel | `packages/geometry-kernel/src/producers/` |
| K3-A enforcer extension — Family Editor must not appear in editor first-paint | `scripts/check-component-editor-lazy.mjs` |

### §7.3 S55 — full parameter table + expressions + IFC binding (M28)

| Deliverable | File |
|---|---|
| `ParameterTable` panel (the table sketched in `apps/component-editor/src/panels/parameters.ts`) | `apps/component-editor/src/panels/parameters.ts` |
| Expression evaluator (ADR-027) | `packages/family-format/src/expression-evaluator.ts` |
| Pset binding UI in the parameter inspector | `apps/component-editor/src/panels/parameters.ts` |
| `.pryzm-family` v1 reader/writer + Zod schema | `packages/family-format/src/{reader,writer,schema}.ts` |
| Determinism parity gate | `packages/family-format/__tests__/round-trip.test.ts` |

### §7.4 S58 — extract to standalone SPA `apps/component-editor` (M30)

| Deliverable | Why |
|---|---|
| Move `src/component-editor/**` → `apps/component-editor/` | Keeps the editor's first-paint bundle clean even when authors deep-link into family editing. |
| Stand up Vite SPA build | Author can use the editor without spinning up the whole project. |
| Sharing protocol: family editor opens with a family preloaded via `?file=…` | Marketplace + reuse from main editor. |

### §7.5 S59 — `.pryzm-family` marketplace publish flow (M30)

| Deliverable | File |
|---|---|
| `Publish to marketplace` button in editor | `apps/component-editor/src/menus/publish.ts` |
| Server upload route (`POST /v1/families`) | `server/familyMarketplaceRoutes.js` |
| Author signing (HMAC over `schemaHash` with author key) | `packages/family-format/src/signing.ts` |
| Marketplace landing page (browse / search / download) | `client/marketplace/` (Phase 3C) |

### §7.6 Phase 3B end (M30) — done means

- Author can build a fully-parametric door from scratch in ≤ 10 minutes.
- Save → reload yields byte-identical `.pryzm-family`.
- Place 200 instances on a project, swap the family for a v2, all instances re-bake without errors.
- IFC export of those 200 instances populates `Pset_DoorCommon` from the parameter `ifc:` bindings; round-trip through Solibri preserves them.
- The editor never appears in the main app's first-paint bundle (K3-A gate).

---

## §8 What it is NOT (scope guardrails)

To prevent perpetual scope creep, v1 deliberately excludes:

| Excluded | Why | Where it might land |
|---|---|---|
| Scripted families (Python / JS in family definitions) | Security + sandboxing burden too high for v1; expressions cover ~95% of real cases | Phase 4 (post-GA), only after a real demand signal |
| Nested families deeper than depth 2 | Families embedded in families embedded in families is a footgun | Phase 4, with cycle detection |
| Structural-analytical model authoring | Analytical model is its own spec; coupling them blocks both | Phase 5+ (BIM-3) |
| MEP families (pipe / duct / conduit fittings with flow direction) | MEP needs a flow-graph layer the kernel doesn't have yet | Phase 4 |
| Site / planting families with seasonal LOD | Site is L7 chrome territory, not parametric solids | Phase 4 |
| Real-time collaborative family editing | Family files are atomic units; collab on the *project* using the family is enough | Never in v1 — file lock + last-write-wins |

If a request lands inside one of these rows, the answer is "yes, in Phase 4+", not "let's bolt it on now".

---

## §9 OpenTelemetry instrumentation

| Span | Inputs | Outputs |
|---|---|---|
| `family.editor.open` | `(familyId?, source: 'menu'\|'marketplace'\|'cli')` | `(durationMs)` |
| `family.solver.run` | `(profileId, entityCount, constraintCount)` | `(status, durationMs)` |
| `family.geometry.bake` | `(familyId, typeId, parameterHash)` | `(triangleCount, durationMs, cacheHit)` |
| `family.file.read` | `(path, byteLength)` | `(version, schemaHash, durationMs)` |
| `family.file.write` | `(path, profileCount, solidCount, typeCount)` | `(byteLength, durationMs)` |
| `family.marketplace.publish` | `(familyId, schemaHash)` | `(httpStatus, durationMs)` |

All spans inherit the `pryzm.family.*` prefix and follow the same envelope as the AI host's `pryzm.ai.*` spans (ADR-014).

---

## §10 Cross-references

- Family / Type / Instance model: `SPEC-05-TYPE-CATALOG.md §1, §2`.
- Geometry kernel + producer pattern: `SPEC-01` and `packages/geometry-kernel/src/producers/`.
- Plugin descriptor pattern (analogous registration): `plugins/ai-floorplan/src/descriptor.ts`.
- Command-bus contract: `packages/command-bus/src/CommandBus.ts`.
- Existing prototype: `src/component-editor/{ComponentEditor.ts, workspace/EditorWorkspace.ts, tools/}`.
- IFC binding & round-trip: `phases/PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §1.3, §3`.
- AI batched-undo (which this editor inherits for free): `packages/ai-host/src/AiPlane.ts` (S54 D1).
- Constraint solver porter: `packages/constraint-solver/` (real planegcs binding lands at S52).
- ADRs: `ADR-014` (AI host), `ADR-017` (type catalog scope), `ADR-027` (parameter expression evaluator).
