# UCE REACHABILITY AUDIT — is the Component Editor/Creator finished?

**Status:** MEASURED · **Date:** 2026-09-04 · **Lane:** UCE-FAMILY round 4 · **HEAD:** `4c8a0d56`
**Subject:** [`STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md`](../../01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md)
· [`ADR-0376`](../../02-decisions/adrs/ADR-0376-universal-component-editor-founding-rulings.md)
· [`C113`](../../02-decisions/contracts/C113-ELEMENT-PLACED-COMPONENT.md) · C84 §6.2 · C110 · C111

> **Why this document exists.** The founder asked directly: *"is the family editor/creator finished?"*
> Three previous rounds could not answer, because **the reachability audit had never been produced**.
> A file's existence is not a working feature. Every row below is classified by whether a **USER** can
> reach it, and every WIRED row names the caller chain that proves it.

---

## 0 · THE ANSWER

**NO — but the shape of the "no" has changed completely, and the old shape is what kept being
re-reported.**

ADR-0376's founding text (2026-09-01) says `family-runtime` is **"not yet reachable from the editor"**
and cites `grep '@pryzm/family-runtime' apps/editor` → **0**.

**That statement is now FALSE.** Re-measured 2026-09-04: **10 files** in `apps/editor/src` import
`@pryzm/family-runtime`, **7** import `@pryzm/family-instance`, and the whole authoring spine is
reachable from a button in the Tools rail. **Do not re-derive the programme's status from ADR-0376's
§D3 parenthetical — it is a snapshot of 2026-09-01 and it has been overtaken.**

What is true instead:

| | Verdict |
|---|---|
| **The MODEL layer** | ⭐ **WORKS, END TO END, THROUGH THE ORDINARY PIPELINE.** Author from zero → parameterise → formula → type → place → override → persist → undo. Through `composeRuntime`, the C16 bus and the C11 element pipeline. Not a side channel. |
| **The PRESENTATION layer** | ⛔ **A PLACED COMPONENT DRAWS NOTHING IN THE VIEWPORT.** `ComponentCommitter` is written and tested and **not registered on the production render path**. |
| **The DEFINITION's lifetime** | ⛔ **A COMPONENT YOU AUTHOR DIES ON PAGE RELOAD.** The catalogue is in-memory, process-lifetime. The only survival route is the manual `Export…` button. |
| **The GEOMETRY vocabulary** | ⚠ **ONE SOLID KIND BAKES.** `extrude` (along **+Y only**) and `box`. `sweep` / `loft` / `revolve` / `boolean` are in the schema and **refuse honestly** at bake. |
| **CONSTRAINTS** | ⛔ Five real constraint creators exist — **on an application no user can open.** |
| **CODE authoring (§46–56)** | ⛔ **ABSENT.** Zero implementation. |

**Two headline structural facts, both of which the previous rounds missed:**

1. **`apps/component-editor` — 52 files, 5,918 LoC, S52–S59, the second composition root — is
   UNREACHABLE.** Not "partly wired": it is absent from the production bundle, has no server route,
   no link, and **zero dependent workspaces**. Grepping all 105 files of `dist/assets/` for
   `mountAppShell`, `familyEditorRuntime`, `constraint.addCoincident`, `pryzm.family.command` yields
   **zero matches**, because `vite.config.ts:425-428` declares only `index.html` and `browser.html` as
   rollup inputs. `Dockerfile:251-280` never copies `apps/` into the runtime image. It is a
   dev-server-only app on port 5174 plus a vitest harness, and its `test:ci` is **silently skipped by
   CI** (baselined in `scripts/check/test-ci-coverage-baseline.json:20`).
2. **The working editor is somewhere else entirely.** The live authoring surface is
   `apps/editor/src/ui/component-browser` + `component-editor-workspace` + `component-type-catalog`,
   built by later lanes (U0–U8) on the **canonical** bus. ADR-0376 **D1** ruled *"RETIRE the rival,
   HARVEST its assets"* — **the retirement has not happened and the harvest is only partial.** The
   sketch surface, the constraint creators and the marketplace publish flow are still stranded on the
   rival, and are the largest single block of unharvested value in the programme.

---

## 1 · METHOD, AND WHAT EACH VERDICT MEANS

| Verdict | Definition |
|---|---|
| **EXISTS-AND-WIRED** | A chain runs from a user gesture to this code in production. The chain is named. |
| **EXISTS-BUT-UNWIRED** | Real code, often tested, with **no production caller** on a user-reachable path. |
| **PARTIAL** | Reachable, but materially narrower than the spec clause it answers. The narrowing is named. |
| **ABSENT** | No implementation. |

**The shared root chain**, cited below as **[RAIL]** — every WIRED authoring row descends from it:

```
index.html:429  <script src="/src/main.ts">
  → src/main.ts:211                                startEngine()
  → engine/engineLauncher.ts:1100                  initUI({...})
  → engine/initUI.ts:3254                          createMainLayout({...})
  → ui/Layout.ts:117                               mountDockingArea(...)
  → ui/layout/DockingLayout.ts:25,36               new ToolsPanelController(...)
  → ui/tools-panel/ToolsPanelController.ts:48,74   new CreateRailPanel(...) · CREATE_INTERIORS
  → ui/tools-panel/panels/CreateRailPanel.ts:1296  label: 'Components', disabled: () => false
  → :1299  import('../../component-browser/index').then(m => m.openComponentBrowser())
  → ui/component-browser/ComponentBrowserPanel.ts:651,121   openComponentBrowser() → open()
```

**Verification standard.** Four acceptance suites were run in the foreground at HEAD:

```
apps/editor $ npx vitest run __tests__/componentJoinThroughComposedRuntime.test.ts \
    __tests__/componentPlacementFlowThroughComposedRuntime.test.ts \
    __tests__/componentDefinitionWorkspaceThroughComposedRuntime.test.ts \
    __tests__/componentStarterLibraryAndNewComponent.test.ts
→ Test Files 4 passed (4) · Tests 30 passed (30)
```

These construct the **real composition root** and never build a store, a `stores` object or a bus of
their own (C113 §13.1) — a suite that supplies the thing that can break cannot observe it breaking.

---

## 2 · THE TABLE

### 2.1 — Creator half: authoring a component from nothing

| # | Capability (spec §) | Verdict | Evidence / caller chain |
|---|---|---|---|
| A1 | Open a component library (§59 creation flow) | **WIRED** | [RAIL] → `ComponentBrowserPanel.open()`. Second gesture: AI chat → `ai/ZeroTokenChatBridge.ts:1883` → `chatPlacementActivation.ts` |
| A2 | **Author from zero** (§13 progressive parametrisation) | **WIRED** | [RAIL] → "New Component" `ComponentBrowserPanel.ts:238,244` → `_newComponent():631` → `newComponent.ts:240` `createBlankComponentDefinition` → mints a **minimal valid** doc via `makeAddParameterMigrator`, packs through the one packer, loads through the one catalogue, opens the workspace |
| A3 | Load an existing `.pryzm-family` | **WIRED** | "Load Component…" `ComponentBrowserPanel.ts:225,231` → file input → `catalog.loadFromBytes` → `@pryzm/family-loader` (unzip → Zod → resolver pre-flight → `(familyId, schemaHash)` cache) |
| A4 | Starter library | **WIRED** | "Starter Components" `ComponentBrowserPanel.ts:333,366,372` → `_loadStarter(offer.id)` |
| A5 | Marketplace install | **WIRED (transport)** | `ComponentCatalog.ts:310` — `GET /api/v1/families/:id/download` → bytes → the one loader. C111 §3.1's one LIVE transport row |
| A6 | **Parameters** — add / rename / delete / retype (§9) | **WIRED** | "Edit definition…" `ComponentBrowserPanel.ts:436,442` → `openComponentDefinitionWorkspace` → `applyOp()` `ComponentDefinitionWorkspace.ts:463,605` → `makeAddParameter` / `Rename` / `Delete` / `ChangeParameterType` migrators |
| A7 | **Formulas** — introduce / delete, live typed diagnostics (§11) | **WIRED** | `ComponentDefinitionWorkspace.ts:741,774` → `makeIntroduceExpressionMigrator` (both ops in ONE `applyOp` so the draft only commits if the whole apply re-validates) / `makeDeleteExpressionMigrator`. **ADR-0376 D4 is implemented**: the superseded default is carried as provenance, not silently kept |
| A8 | **Reference planes** (§14) | **WIRED** | `ComponentDefinitionWorkspace.ts:788` → `makeAddReferencePlaneMigrator` |
| A9 | **Solids** — add box, set dimensions, delete (§4.4) | **WIRED, NARROW** | `ComponentDefinitionWorkspace.ts:805,820` → `makeAddBoxSolidMigrator` / `makeSetBoxDimensionsMigrator` / `makeDeleteSolidMigrator`. **Box is the only solid a user can create.** See G1 |
| A10 | **Profile edit + write-back** (§4.4 sketches/profiles) | **WIRED** | Workspace canvas → `ComponentDefinitionWorkspace.ts:1011` → `makeUpdateProfileMigrator`. Also from a placed instance: property panel → `ComponentProfileEditorDialog` (`PropertyPanelBodyRenderer.ts:49,364,370`). **A dragged vertex round-trips.** |
| A11 | **Types** — create/split, set per-type values (§24) | **WIRED** | "Types…" `ComponentBrowserPanel.ts:454,460` → `openComponentTypeCatalog` → `makeSplitTypeMigrator` / `makeSetTypeValuesMigrator` |
| A12 | Material slots (§23) | **PARTIAL** | `MaterialSlotSchema` + `makeMergeMaterialSlotsMigrator` exist and are reachable as an op; **no material authoring UI, and no renderer projection** (there is no committer — see R1). Semantic material properties per §23 are ABSENT |
| A13 | IFC rebinding (§29–31) | **PARTIAL** | `makeRebindIfcMigrator` + `FamilyIfcEntitySchema` + `IfcParameterMappingSchema` exist. **No exporter emits a placed component** — grep of the IFC packages for the `component` kind → 0 |
| A14 | **Save** the definition | **PARTIAL — THIS IS THE CREATOR HALF'S BIGGEST HOLE** | `ComponentDefinitionWorkspace.save()` → `packFamily` (Zod-validates, canonicalises) → `componentCatalog.loadFromBytes` → rebases the draft on the reloaded doc. ⛔ **The catalogue is IN-MEMORY, process-lifetime.** `ComponentCatalog.ts:36-41`, verbatim: *"project-scoped definition persistence is flagged for a founder/ADR ruling."* **An authored component does not survive F5.** |
| A15 | Export the definition as a file | **WIRED** | "Export…" `ComponentBrowserPanel.ts:481,490` → `_export` → `catalog.exportBytes` → Blob download. `ComponentBrowserPanel.ts:466` calls itself *"the ONLY way an authored definition"* leaves the process — **this is the mitigation for A14, and it is manual** |
| A16 | Live 3-D preview while authoring (§58) | **WIRED** | `ComponentDefinitionWorkspace.ts:124-129,439` → `mountComponentPreview(previewHost, { views: COMPONENT_FAMILY_EDITOR_VIEWS })` — 2×2 grid: orbitable 3-D, plan, two elevations, ONE model (§22). Thumbnails: `ComponentBrowserPanel.ts:128,547` |
| A17 | **AI authoring** — expression chat (§39–45) | **WIRED** | `ComponentDefinitionWorkspace.ts:116,414` → `mountComponentChat(chatHost, makeComponentExpressionController(...))`. AI creates **intent** (a formula), never geometry |
| A18 | **Constraints** — coincident/parallel/perpendicular/distance/fixed (§14) | **EXISTS-BUT-UNWIRED** ⛔ | Five **real** creators: `apps/component-editor/src/commands/constraint/*.ts`, registered `commands/constraint/index.ts:50-66`, driving `@pryzm/constraint-solver` (planegcs, lazily upgraded from `MockSolver`, `familyEditorRuntime.ts:110-125`). **On the unreachable rival bus.** The live workspace has no constraint authoring; `profileToPolygon` refuses with `profile-needs-solver` |
| A19 | **Sketch tools** — line, arc, circle, rectangle, polygon, fillet, trim, select, snap (§57 *Create*/*Modify*) | **EXISTS-BUT-UNWIRED** ⛔ | `apps/component-editor/src/sketch/**` — 11 tool/geometry modules with 11 passing unit suites. **On the unreachable rival.** ⚠ Its last recorded run had `FilletTool` and `TrimTool` **failing** |
| A20 | Marketplace publish + Ed25519 signing | **EXISTS-BUT-UNWIRED** ⛔ | `apps/component-editor/src/marketplace/{publishFlow,signing}.ts` — **zero importers even inside its own `src/`**; only their own tests |
| A21 | **Code / DSL authoring** (§46–56) | **ABSENT** | Zero implementation. No Component API, no DSL, no parser, no capability sandbox. Spec §77 Phase 5 not started |

### 2.2 — The JOIN: a component becoming an element

⭐ This is the audit's original headline gap (*"there is no bus verb anywhere in this repository that
places a component into a project"*). **It is closed at the model layer.** Governed by
[C113](../../02-decisions/contracts/C113-ELEMENT-PLACED-COMPONENT.md), ratified by ADR-0376 **D9**.

| # | Capability | Verdict | Evidence |
|---|---|---|---|
| J1 | `component` **element kind** (D9) | **WIRED** | `packages/schemas/src/elements/Component.ts:139` `defineElement('component', …)`; `Id.ts:76,224,281`. C84 census row moved in the same commit (`C84 §1788-1790`) |
| J2 | Store + handlers on the **canonical** bus (C11/C16) | **WIRED** | `apps/editor/src/PluginRegistry.ts:554-561` — descriptor `{ id:'component', storeKey:'component', buildStore: new ComponentStore, buildHandlers: buildComponentHandlerSet({definitions: componentCatalog}), buildAuxiliaries }`. Reached at boot by the `ALL_PLUGINS` loop, `bootstrap.everything.ts:136-137` ← `src/main.ts:407,411` |
| J3 | **`component.place`** | **WIRED (PLAN ONLY)** | Browser card "Place" `ComponentBrowserPanel.ts:508,514` → `armComponentPlaceTool` (`componentPlaceTool.ts:30-33`) → `setActiveComponentPlacement` + `activatePlanOnlyToolOrExplain('component', …)` → `ComponentPlanToolHandler.ts:156` `rt.bus.executeCommand('component.place', payload)`. ⚠ **Plan only, deliberately** — see R1 |
| J4 | **`component.setInstanceParameter`** | **WIRED** | Select a placed component → `PropertyPanel` → `PropertyPanelBodyRenderer.ts:370` `buildComponentSection` → `ComponentSection.ts:247,252` (SET leg / `clear:true` leg — different acts, different payloads, C113 §6.3). **C16 CA-21 executed read-back from the AUTHORITATIVE store** |
| J5 | **`component.swapType`** | **WIRED** | `ComponentSection.ts:257` type dropdown. Writes `typeId` **and nothing else** (C113 §2.4) |
| J6 | **The definition resolver** — one resolver, no rival | **WIRED** | `services/componentCatalog/` — `component.place` refuses a `definitionId` naming no LOADED definition; `swapType` enforces type membership; `setInstanceParameter` enforces declared/instance-kind/value-shape. The SAME instance rides `runtime.auxiliaries.componentCatalog` to the UI and the bake seam (C84 EI-9, one-resolver rule) |
| J7 | **Parametric after placement** (§12, §66) | **WIRED — by construction** | The record holds **no resolved values, no geometry, no baked profile**. Place twenty, override one, swap all twenty types: nineteen follow because they hold no copy to go stale; the twentieth does not because its key is in `instanceParameters`. **Executed as ARM F, twenty occurrences read back one by one** |
| J8 | **Persistence** of the occurrence | **WIRED** | Save: `ProjectSerializer.ts:1570` `readPluginStore('component')` → `StoresSlot.component` → snapshot `components[]` (additive-optional per C47). Load: `restoreCompoundFamilies.ts` component leg, called ONCE from the loader's **common tail** so both load paths get it by construction. Applies an `add` patch of the serialized record — deliberately **not** a `component.place` re-dispatch, which would refuse legacy `definitionId`s and drop the occurrence |
| J9 | **Undo / redo** | **WIRED** | `composedStoreUndoAdapter('component', …)` in `performUndoRedo.ts` `buildUndoStoreMap()`, lazy-resolved so a recomposed runtime cannot write into a stale store |
| J10 | **AI drives the same verbs** (§76 gate D) | **WIRED** | `ChatCapabilityRegistry.ts:4063-4065` declares all three; instance chat mounts in the property panel `ComponentSection.ts:87,240`. Placement **arms the tool** and the user clicks — no coordinate is ever guessed |
| J11 | Selection / picking of a placed component | **PARTIAL** | The record is selectable **by id** and drives the property panel. **Viewport picking cannot work — there is nothing to pick** (R1) |
| J12 | **Rendering** | **EXISTS-BUT-UNWIRED** ⛔⛔ | See R1 |
| J13 | Hosting (`hostId`) (§26) | **ABSENT-BY-RULING** | The payload field is **carried and INERT**. ADR-0376 **D11 OPEN**; C15 §0.1.1's closing rule says *sibling*, so writing a host resolver would pre-empt an untaken ruling |
| J14 | Nesting (§25) | **ABSENT-BY-RULING** | ADR-0376 **D6 OPEN**. C113 §12 warns: *a reader must not infer sub-component ownership from the empty `childrenIds` every element carries* |
| J15 | Connectors (§27) | **ABSENT** | `ConnectorSchema` + `ConnectorKindSchema` + `DemandedVoidSchema` are in the document schema. **No authoring op, no runtime, no reasoning.** Schema-only |

### 2.3 — Editor half: editing an existing component, and what placed instances do

| # | Capability | Verdict | Evidence |
|---|---|---|---|
| E1 | Open an existing definition and edit it | **WIRED** | A6–A11 all operate on a loaded definition |
| E2 | Every edit goes through **one** mutation gateway | **WIRED** ⭐ | `applyOp()` `ComponentDefinitionWorkspace.ts:463` — every mutation is a **family-migrations op**; a migrator's typed error surfaces **verbatim** (one refusal vocabulary, audit R1). The draft commits only if the whole apply returns and the document re-validates |
| E3 | Placed instances re-read after a definition edit | **PARTIAL** | `ComponentCatalog` has a real subscription (`subscribe():249`, `_notify():424`, fired on load/replace/remove). Because the record stores no derived values, a re-read **is** the update — the property panel and previews refresh. ⛔ **The viewport does not, because it never drew anything** (R1) |
| E4 | Refuse honestly rather than substitute (§75) | **WIRED** ⭐⭐ | This is the strongest property in the subsystem. `bakeFamilyInstance.ts:338` refuses a directed extrude with a full explanation rather than *"SILENTLY produce a vertical extrusion instead"*; sweep/loft/revolve refuse naming what the document cannot describe; `save()` surfaces the packer's Zod refusal verbatim; the catalogue keeps **failure and empty as different values** (`list() === []` vs typed `ok:false`) |
| E5 | Stale geometry never overwrites newer state (§66, §72) | **WIRED (in the committer)** | `ComponentCommitter` carries a monotonic **generation guard**; a bake resolving under a superseded generation discards its own result. ⚠ Correct code on an unmounted path |
| E6 | Feature/history graph (§16) | **PARTIAL** | `FeatureEdgeSchema` + `FeatureEdgeKindSchema` + a `family-events` log exist in the document and are packed. **No history UI is wired** (`ComponentHistoryPanel` is test-only, U1 below). ADR-0376 **D7** (feature-graph-vs-undo) OPEN |
| E7 | Versioning + migration chain (§37) | **WIRED** | `MigratorRegistry`, `migrateFamily`, `v1_0→v1_1`, `assertVersionCoherent`, `identityMigrator`. **14 authoring ops.** `formatVersion` comparability is ADR-0376 **D12**, OPEN |

### 2.4 — EXISTS-BUT-UNWIRED register (the harvest debt)

| # | Asset | Size | Why it is unreachable |
|---|---|---|---|
| **R1** | ⛔⛔ **`ComponentCommitter`** — `plugins/component/src/committer/**` (+ `geometry-bridge`, `material-bridge`, `ports`) | 5 modules, own test suite | **Committed but not registered on the production render path.** Stated by the code itself, `elementCreationMatrix.ts:768`. Nothing subscribes the component store's `subscribeDirty`; there is no `ComponentFragmentBuilder`. Three `UNMIRRORED` rows in `mirror-debt.json`. C113 §10.2 **refuses** the easier `no-render` green (that classification claims a family reaches no builder *by design*, and a component is meant to be seen) and §10.3 refuses to invent a `CommandEventBridge` consumer to buy it. Owner: Phase 4E under **D10, whose descope is PRE-AUTHORISED** |
| **R2** | ⛔ **`apps/component-editor`** — the whole second composition root | 52 files / 5,918 LoC | Not a rollup input; not copied into the runtime image; no route; no link; **zero dependent workspaces**; `test:ci` silently skipped by CI. Holds A18 (5 constraint creators + planegcs), A19 (11 sketch modules), A20 (publish + signing), 12 verbs, 6 quality gates incl. a real bundle-budget build. **ADR-0376 D1 ordered RETIRE + HARVEST; neither has happened.** ⚠ D1's own sequencing clause required fixing `check-single-compose.ts`'s false `"0 rivals"` literal **first** — that literal was removed on 2026-08-30 (`4a4b35c0`) and the gate now reads **1/1 rival**, so **D1's blocker is cleared and the retirement is executable** |
| **R3** | **11 `wave-6` surfaces** — panels `ComponentHistoryPanel`, `ComponentParameterPanel`, `ComponentRelationshipPanel`, `ComponentValidationPanel`, `DetailComponentPanel`, `FamilyBrowserPanel`, `FamilyConstraintPanel`, `FamilyPreviewPanel`, `FamilyPropertiesPanel` — **plus `ui/toolbar/FamilyToolbar.ts`** | 11 files + 11 binding specs | **Test-only.** None appears in `PANEL_REGISTRY` (`panelDefaults.ts:193`, 15 ids, zero Component/Family), in `PanelManager` (`PanelManager.ts:38-55`), or in any barrel — `ui/toolbar/` has **no `index.ts` at all**. Each binds `runtime.viewRegistry.activatePanel` inside a `show()` **nothing ever calls**. ⛔ **Two are DOUBLY unreachable, which is the finding worth keeping:** (a) `FamilyToolbar`'s 8 buttons (Browse/Load/New/Reload/Export/Edit/Type/Place) are none of them in `BACKED_TOOLBAR_VERBS` (`toolbar/commandBacking.ts:54-58`, which holds **four** verbs against the directory's **280** declared pairs), so all 8 would render `disabled` **even if mounted**; (b) `DetailComponentPanel:225` emits `pryzm:detail-component:place`, and that key has **exactly two hits repo-wide — the emitter and its type declaration. No subscriber.** ⭐ All 11 are also the **superseded vocabulary generation** (ADR-0376 D5): they say *Family* on user-facing surfaces, which the live browser's own suite forbids (`componentPlacementFlowThroughComposedRuntime.test.ts:232` asserts the browser's text `.not.toMatch(/family/i)`) |
| **R4** | `plugins/family-editor` | 1 file | A `console.info` stub: *"Stub — full implementation pending Phase F reference-plugin delivery."* |
| **R5** | `CreatePanelLayout.ts:434` "Components" entry | — | **Dead surface.** `renderCreateContent()` (`:650-651`) returns immediately when `getElementById('create-navigation-container')` is null, and repo-wide that id appears at **exactly one site — that lookup**. Nothing creates the node. `mountCreatePanel` *is* called (`Layout.ts:106`), so the file executes and its palette never paints. ⚠ **This is a live L-1380 trap**: a lane adding a component affordance here would ship nothing |
| **R6** | `BimService.activateComponentTool` (`BimService.ts:347-355`) | 1 method | Zero production callers; both real entries call `armComponentPlaceTool` directly. Dangling public API — the *capability* is fine |

### 2.5 — Spec clauses with no implementation

| Spec § | Capability | Verdict |
|---|---|---|
| §46–56 | Code-native authoring: Component API / DSL, parser, determinism, capability sandbox | **ABSENT** (Phase 5 not started) |
| §17–20 | Exact geometry / B-Rep / topology; OCCT-class kernel evaluation | **ABSENT.** Tessellated producers only. §77 Phase 2's technology recommendation is **not on disk** |
| §21–22 | Derived **2-D** representations (plan / elevation / section symbols) from the definition | **ABSENT.** `RepresentationSchema` + `RepresentationKindSchema` exist; nothing derives them |
| §28 | **Semantic visibility** (`visible when DetailLevel ≥ Fine`) | **ABSENT.** `solid.setLodBitmask` exists — on the unreachable rival (R2) |
| §30–33 | bSDD URIs, IDS information requirements, *✓ Complete / ⚠ Missing required information* | **ABSENT** |
| §34–35 | World-Model queryability (*which windows on Level 02 use Large?*) | **ABSENT as a query surface.** The data is queryable in principle — the record carries no mesh dependency (§69's real property) — but no query API answers the spec's list |
| §10 | **Typed semantic units** — one canonical length unit | **PARTIAL, and it is an OWED FOUNDING RULING.** The typed unit system is real (unit-tagged literals, `unit-coercion.ts`, radians canonical for angle and explicitly *"NOT a knob"*). But **ADR-0376 D3 is not executed**: the runtime is `'mm'`, the document is metres, and the two are bridged by the single `runtimeLengthToMetres` seam. See §6 and rank 6 |
| §62, §77 Phase 7 | Window Editor / Wall Profile Editor migration into the universal engine | **NOT STARTED** |
| §67 | sweep · loft · revolve · boolean | **PARTIAL** — schema yes, authoring op no, bake **refuses** (see G1) |

---

## 3 · THE GEOMETRY GAP, PRECISELY (G1)

The document schema (`packages/file-format/src/family-schema.ts:387-494`) is **rich**:
`SolidFeatureSchema` is a discriminated union over `extrude` · `sweep` · `loft` · `revolve` ·
`boolean`. Two independent narrowings sit under it:

**Narrowing 1 — the authoring ops.** 14 migration ops exist; the solid-producing ones are
`add-box-solid`, `set-box-dimensions`, `delete-solid`, `update-profile`, `add-reference-plane`.
**No op mints a sweep, loft, revolve or boolean.** A user cannot author one.

**Narrowing 2 — the bake.** `packages/family-instance/src/bakeFamilyInstance.ts` (448 LoC):

- `extrude` — **bakes**, and only along **+Y**. A document asking for a direction is **refused**, with
  the reason named: closing it needs a direction/axis on `ExtrudeOptions` in `@pryzm/geometry-kernel`.
- `sweep` — refused: the adapter *provides* sweep, the **document cannot describe the path**
  (`produceSweep` wants `Point3D[]` in world 3-D).
- `loft` — refused: `section.right` / `section.up` (the in-plane basis) are missing from the schema.
- `revolve` — refused: the **axis** is missing.
- Profiles needing a solver → `profile-needs-solver`, refused rather than approximated.

⭐ **Every refusal is structured, cites §75, and names what would close it.** This is exactly the
behaviour the spec demands and it is why the gap is *safe* rather than *dangerous* — but it means
**"Sweep" must not appear in any UI** until the schema delta lands. Ops and schema deltas are
tracked in `bakeFamilyInstance.ts` §4D-SCHEMA-DELTA.

**The two narrowings are deliberately kept in lock-step**, and this is the design rule to preserve:
`family-schema.ts` exports `BAKEABLE_SOLID_KINDS = ['extrude']`, and `box-solid.ts` mints one shape
*because* of it — *"Authoring a kind the bake cannot evaluate would produce a definition that
validates, packs, loads — and shows a refusal instead of a shape."* **An op must never outrun the
bake.** A box's width/depth are expression-valued profile coordinates read and written by **one**
authority (`readBoxSolid` ships in the same file as the writer, so a UI cannot become a second parser
of that spelling — §76 gate B).

⛔ **Three declared absences under G1, none of them "later":** **voids/cuts** — `produceBoolean` works
and the kind is refused **pending ADR-0376 D7** (feature-graph evaluation order), so minting a void op
would decide D7 by accident; **rotation/placement** — there is no per-solid transform in the schema;
**non-rectangular profiles** — the sketch surface that draws them already exists, stranded on the
unreachable rival (R2), which is rank 3's argument in one line.

---

## 4 · WHAT "COMPLETE" COSTS — ranked, with causes

Ranked by **(founder-visible impact) ÷ (cost)**, causes named.

| Rank | Work | Why it ranks here | Cause of the gap |
|---|---|---|---|
| **1** | ⛔⛔ **Mount `ComponentCommitter` on the production render path** (R1) | **A placed component is invisible.** Everything else in §2.2 works and the user cannot see any of it. This single gap is what makes the honest answer "no" to a founder who looks at the screen | Phase 4E was descoped under **D10 — a PRE-AUTHORISED failure**, correctly taken. The committer was written anyway. The remaining work is the **mount**, not the committer. ⚠ `PrimitiveCommitter` is synchronous and the bake is async: `onAdd` must return an empty `Group` and fill it via `onGeometryReady` — anything counting children immediately after dispatch reads 0 and is right |
| **2** | ⛔ **Project-scoped definition persistence** (A14) | **An authored component dies on F5.** The creator half cannot be called finished while its output is process-lifetime | **Blocked on a founder/ADR ruling, not on code.** C111 §4.3-a rules the split (definitions in the envelope, instances in the snapshot) but **nothing rules how a project references its definition set**. The catalogue refuses to invent a storage location — correct. ⭐ **This needs a decision, and it is the cheapest high-value decision available** |
| **3** | ⛔ **Execute ADR-0376 D1: retire the rival, harvest sketching + constraints** (R2, A18, A19) | The largest block of built-and-stranded value in the programme: 5 real constraint creators + planegcs + 11 sketch modules. §14 and §57's *Create*/*Modify* groups are unreachable **and already written** | D1's own sequencing clause blocked on `check-single-compose.ts`'s false `"0 rivals"` literal. ⭐ **That literal was removed 2026-08-30 (`4a4b35c0`); the gate reads 1/1. The blocker is cleared.** ⚠ Harvest ≠ port: the rival's bus has **no redo, no validation gate, no persistence**, so the verbs must be re-authored to C16, not moved |
| **4** | **Geometry vocabulary: schema deltas + ops for revolve → sweep → loft → boolean** (G1) | §67's geometric test cannot pass with one solid kind. Directed extrude is the cheapest first step | Schema deltas named precisely in `bakeFamilyInstance.ts` §4D-SCHEMA-DELTA: extrude needs a direction on `ExtrudeOptions`; revolve an axis; loft an in-plane basis; sweep a describable path. **Each is a bounded, named change** |
| **5** | **Delete R3–R6** (9 dead panels, the stub plugin, the dead create surface, the dangling service method) | Pure risk reduction. R3 is a **duplicate-vocabulary rival surface** in the *superseded* spelling (C84 EI-9 + D5); R5 is a live trap that silently ships nothing | Accretion across waves. Cheap, and it removes the main way a future lane wires the wrong thing |
| **6** | ⭐ **Execute ADR-0376 D3 — flip `CANONICAL_LENGTH_UNIT` to metres** | D3 was *"ruled first: it blocks everything"* and calls two canonical length units in one repo **"a 1000× defect class."** It is **NOT EXECUTED** | `packages/family-instance/src/units.ts` §4D-ONE-LENGTH-SEAM states it plainly: *"Lane 4A executed the D4 half of its row and **deliberately did NOT execute D3** — `family-runtime`'s `CANONICAL_LENGTH_UNIT` is still `'mm'` and its own guard test asserts that OWED state."* ⭐ **The cost is now one line**, because the seam was deliberately funnelled: `RUNTIME_LENGTH_UNITS_PER_METRE = 1000 → 1` and both consumers are correct untouched. ⛔ **Do not inline a second ÷1000 at a new call site** — the file exists because two hand-written ones is how a 1000× defect survives a migration. D3's cost rises with every new consumer, which is exactly the reason D3 gave for ruling it early |
| **7** | **3-D placement arm** for the component tool | Plan-only placement is a real limitation | **Correctly gated on rank 1.** `elementCreationMatrix.ts:757` states it: a 3-D arm today *"would place invisible elements — the founder's 'reports activation, activates nothing' defect with extra steps."* Needs a `ToolManager` key + activator, **after** the mount |
| **8** | **Close D6 / D11** — nesting, hosting (J13, J14) | §25/§26 are core spec, and hosting is what makes a window a window | **Blocked on rulings**, and correctly refused meanwhile: `hostId` is carried and inert rather than half-resolved |
| **9** | **Connectors** (J15), **semantic visibility** (§28), **semantic materials** (§23) | Schema-present, runtime-absent | Never scheduled |
| **10** | **IFC / bSDD / IDS** (A13, §29–33) | §70's test cannot run | The mapping ops exist; **no exporter knows the `component` kind** |
| **11** | **Code / DSL authoring** (A21, §46–56) | Whole spec phase | Phase 5 not started. ⚠ §77 Phase 2's **technology recommendation** (OCCT/planegcs/…) is also not on disk, and §17 forbids adopting a kernel without it — so ranks 4 and 11 share an unmet prerequisite |
| **12** | **Window / Wall Profile Editor migration** (§62, Phase 7) | The spec's own proving ground | Not started. §76 gate J (*existing Window and Wall functionality still works*) is currently satisfied trivially, by not having touched them |

---

## 5 · WHAT IS GENUINELY EXCELLENT HERE

Recorded because the next reader will otherwise re-litigate settled decisions:

1. **The refusal discipline is the best in the repository.** §75 is honoured everywhere: the bake
   refuses a directed extrude rather than silently building a vertical one; the catalogue keeps
   *failure* and *empty* as different values; C113 §10.2 **declined the easier `no-render` green**.
2. **The one-gateway rule holds.** Every document mutation is a family-migrations op. There is no
   second validation pipeline and no `registerDocument(document)` seam — bytes or nothing.
3. **§12/§66 hold by construction, not by propagation.** The record stores **no resolved values**, so
   "the instance collapsed into the type" cannot happen. Executed, twenty occurrences read back.
4. **The acceptance suites cannot lie.** They build the real composition root and never supply the
   store, bus or `stores` object that could break — the defect that let a thorough pool suite stay
   green while `pool.create` was undispatchable.
5. **ADR-0376 D4 shipped.** The founder's §64 demo (*"glass width always the opening width minus twice
   the frame width"*) no longer fails silently: expression beats `defaultValue`, and the superseded
   default is carried as provenance.

---

## 6 · CORRECTIONS THIS AUDIT MAKES TO EXISTING DOCS

| Doc | Said | Measured 2026-09-04 |
|---|---|---|
| `ADR-0376` D3 | *"`family-runtime` is **not yet reachable from the editor** (`grep '@pryzm/family-runtime' apps/editor` → 0)"* | **10 files** import it; **7** import `@pryzm/family-instance`; `ComponentCatalog.ts` imports `@pryzm/family-loader`. The parenthetical is a 2026-09-01 snapshot and is **overtaken** |
| `ADR-0376` D1 sequencing | *"`check-single-compose.ts` prints the literal `\"0 rivals\"` … **Fix the gate first**"* | The literal was removed 2026-08-30 (`4a4b35c0`); the gate reads **1/1 rival**. **D1's blocker is cleared** |
| The programme's headline gap | *"no bus verb anywhere places a component into a project"* | **Closed at the model layer.** Three verbs, one store, one resolver, persistence, undo — all through `composeRuntime`. The headline gap is now **the render path**, which is a different gap |
| `C113` §12.4 | *"`check-chat-capability-coverage` read **UNDECLARED 13 (baseline 0)** at HEAD and reads **17** with these verbs … OWED, not acceptable"* | ⭐ **PAID, and the debt row is stale.** Re-run 2026-09-04: `[check-chat-capability-coverage] UNDECLARED: 0 (baseline 0)`. The three component verbs are declared at `ChatCapabilityRegistry.ts:4063-4065`. ⚠ **The gate still exits non-zero, on OTHER arms that are not this family's**: unresolvable parameter sources 3 · scope mode declared-not-honoured 1 · undeclared spatial reach **5/2** · unreachable panel properties **47/42**. **Do not read this family's UNDECLARED number off the gate's exit code**, and do not quote the "17" |
| `ADR-0376` **D3** (metres canonical) | Ruled first, *"it blocks everything"* | ⛔ **NOT EXECUTED — the ruling is OWED and says so.** `packages/family-instance/src/units.ts`: *"Lane 4A executed the D4 half of its row and **deliberately did NOT execute D3**."* `family-runtime`'s `CANONICAL_LENGTH_UNIT` is still `'mm'`, with a guard test asserting that owed state. A number out of the parameter runtime is **millimetres**; a number authored in the document is **metres**. ⭐ Contained to ONE seam (`runtimeLengthToMetres`) so the fix is one constant — see rank 6 |

⚠ **Do not transcribe the numbers in this document.** Re-run the greps and the four suites in §1.
This file records a *measurement*, and measurements rot — that is the standing lesson of the
CLAUDE.md correction boxes, and it applies here.
