# THE UI/UX PLAN — Universal Component Editor
## The complete user-facing authoring surface over the model layer Phase 4 closed

**Lane:** UIUX-SCOUT · **Date:** 2026-09-02 · **HEAD at reading:** `c5d0109c` (branch `main`), with the
Phase-4 wave's work **UNCOMMITTED in the working tree** (see §0.2 — that fact shapes every WAITS-ON row).
**Rule obeyed:** strictly read-only on production code; this document is the lane's only write.
**Authority, in order:** `docs/01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md` (the spec) ·
`docs/02-decisions/adrs/ADR-0376-universal-component-editor-founding-rulings.md` (D1–D5, addendum D9/D10) ·
`audit/universal-component-editor/2026-09-01/ARCHITECTURE-AND-CONTRACT-AUDIT.md` (the audit) ·
C110 / C111 / C112 · C86 §10.6 + §10.6.1 · the Phase-4 lane transcripts under
`audit/universal-component-editor/2026-09-01/phase4/`.

---

# §0 — THE VERDICT, BEFORE THE PLAN

## §0.1 — One paragraph

**The UI/UX is much closer than "build the complete UI" suggests — and the remaining work is almost
entirely MOUNTING and JOINING, not building.** The three verbs are live and read back from the
authoritative store (`component.place` / `component.swapType` / `component.setInstanceParameter`,
API-VERB-REGISTER rows LIVE); the instance parameter table and the profile-authoring panel are **already
authored and tested inside `apps/editor`** (`apps/editor/src/ui/component/`, lane 4F) but have **zero
production importers** — lane 4F's own §7: reachable on three of four axes, **unmet on the build graph**.
The one SVG sketch surface already takes *a `Profile` on a declared `ReferencePlane`* as its subject
(`§SUBJECT-IS-A-PROFILE-ON-A-DECLARED-PLANE`, `ElevationOutlineSurface.ts:31`) with a constraint-glyph
layer. What is genuinely MISSING as UI is: the **component browser + click-to-place tool** (the palette's
"Generic Component" button routes to a `console.log` placeholder — `CreatePanelLayout.ts:427-431` →
`familyCreatorPlaceholder.ts`), the **instance property-panel section** (zero `component` hits in
`PropertyPanelBodyRenderer.ts`), the **definition-editor workspace** (parameter/formula editing, reference
planes, material slots, solids, save), the **type catalog** (whose type-CRUD verbs do not exist yet), and
the **definition catalogue seam** that all of them and the AI need — because *"THERE IS NO CORPUS"*
(C111 §3.1) and no project-level catalogue exists anywhere. `apps/component-editor` remains the D1
RETIRE-and-HARVEST asset: its sketch tabs' "3D preview / Parameter table" splashes are still splashes,
and its 12 AI verbs still have zero production callers.

## §0.2 — ⛔ The single most important scheduling fact

**The Phase-4 wave's output is sitting UNCOMMITTED in this working tree** (`git status` measured
2026-09-02): `plugins/component/` and `packages/schemas/src/elements/Component.ts` are untracked;
`apps/editor/src/PluginRegistry.ts`, `bootstrap.render.everything.ts`, `ProjectSerializer.ts` /
`ProjectLoader.ts`, `snapshotFamilyCoverage.ts`, `performUndoRedo.ts`, `ElevationOutlineSurface.ts`,
`ZeroTokenChatBridge.ts`, `RelationshipExplorerPanel.ts`, `packages/family-runtime/**`,
`packages/family-instance/**`, `packages/file-format/**`, `packages/ai-host/**`,
`packages/core-app-model/**` are all modified. Lane 4E is **in flight right now** (probe scripts
`lane4e-serve.mjs` / `lane4e-tmp-probe.mjs` at repo root; harness under
`audit/universal-component-editor/2026-09-01/phase4/harness/`). **No UI lane below may start until the
Phase-4 wave commits**, and every lane's WAITS-ON column names its specific holds. The audit §12.0
standing rules apply verbatim — including rule 3's serialize-only trio (`initBusHandlers.ts`,
`performUndoRedo.ts`, `packages/schemas/src/registry.ts`), rule 2 (⛔ never `git stash`), and rule 6
(four-axis claims only).

## §0.3 — The doctrine this plan is built on

- **Mirror proven executors, never reinvent** ([[reuse-residential-house-pipeline-patterns]]): the
  placement flow copies the furniture flow (`BimService.activateFurnitureTool` → ToolManager →
  plan/3-D tool → bus verb → property panel), the type flow copies
  `ElementTypeAuthoringRegistry` + `FinishTypeEditorModal`, the panel-port flow copies
  `setWindowOutlineEditorOpener` + `openingProfilePanelReachability.spec.ts` ARM B.
- **Audit R1 is the standing review rule:** any lane proposing a new sketch surface, expression engine,
  refusal vocabulary, AI tool schema or component-definition schema is rejected on spec-§1 grounds.
- **Spec §75:** every button is real or refuses by name. The UI plan therefore carries a **refusal
  register** (§4) of everything the model layer cannot yet do — the UI must state those, not fake them.
- **D5:** every user-facing string says **Component**, never Family. (`noFamilyElementGroupLabel.spec.ts`
  records the founder's one-vocabulary ruling pattern; C111 §0.4 records where "component" is already
  partly spent — `DetailComponentPanel` is a DIFFERENT concept and must not be conflated.)

---

# §1 — INVENTORY: WHAT UI EXISTS, FOUR-AXIS STYLE

Reachability convention: C84 §3.5.1 (a·import/construction · b·bus verb · c·build graph · d·call).

## §1.1 — `apps/component-editor` (the D1 harvest asset) — 52 src files / 5,918 LoC

**Verdict: a working 2-D sketcher with a live constraint loop and an AI bridge, wearing an app shell
whose other two tabs are splashes, reachable by nothing.** Zero on axes b/c/d at the app level (no root
build input, no CI (`no test:ci`), no deploy, no route — audit §1.3; its deep link is inert per its own
`src/index.ts`). D1 rules **RETIRE the runtime, HARVEST the assets**, sequenced behind the
`check-single-compose` L-12830 fix — so **no U-lane below touches this app**; harvest happens by
re-implementation against the canonical bus, and the assets to harvest are named per lane in §3.

| Piece | State | Evidence |
|---|---|---|
| Tab bar: `Sketch · 3D · Parameters` | 3 declared, **1 real** | `viewTabStore.ts:15`; `AppShell.ts renderActivePanel` mounts real UI only for `active === 'sketch'`, else `renderSplash(active)` |
| "3D preview" tab | ⛔ **SPLASH** — *"3D preview — under construction"* | `appSplash.ts PANEL_TITLES` |
| "Parameter table" tab | ⛔ **SPLASH** — *"Parameter table — under construction"* (⭐ its body now exists — in the CANONICAL editor, `ComponentParameterTable.ts`, §1.2) | `appSplash.ts`; lane 4F §4.1 |
| Sketch surface | ✅ REAL: `SketchCanvas.ts` + 7 tools — Select, Line, Rectangle, Circle, Arc, Fillet, Trim (`SketchToolbar.ts:24-32` `DEFAULT_TOOL_LIST`), snap, hit-test, transform | files under `src/sketch/` |
| Constraint loop | ✅ live `solverRunner.ts` + `buildConstraintSet.ts` + `ConstraintToolbar` + `StatusBar` (DOF/status) — but the solver binding is a **MockSolver**; PlaneGCS remains C74-forbidden until §4.2(c) is written | audit §3.4, §7.1 item 4 |
| Reference planes / solids | ✅ commands + stores (`commands/referencePlane/`, `commands/solid/`, `stores/referencePlaneStore.ts`, `solidStore.ts`) | files listed |
| **The 12 AI verbs** | ✅ authored, ⛔ `createAiHostBridge` has **zero production call sites** (audit §9.3 item 6) | `ai/toolRegistry.ts:170-181`: `constraint.addCoincident/.addDistance/.addFixed/.addParallel/.addPerpendicular` · `referencePlane.add/.update/.reorient/.remove` · `solid.add/.remove/.setLodBitmask` — with `addDistance` accepting a **parameter NAME in place of a number** (the one reference-not-literal site in PRYZM, audit §9.1 §41-42 row) |
| AI approval queue + replay tests | ✅ authored | `ai/approvalQueue.ts`, `__tests__/ai/replay.test.ts` |
| Marketplace publish + Ed25519 signing | ✅ authored, DARK (rival bus, no build) | `marketplace/publishFlow.ts`, C111 §3.1 census row |
| Its command bus | ⛔ **no redo** (pops and discards), no patch pairs, no CRDT hook — the ADR-0316 blessing clause that D1 voids | audit §4.2 table, ADR-0376 D1 |
| Can it open/save `.pryzm-family`? | ⛔ **NO** — *"does not read `document.json` at all — it has no open path"* | C111 §3.3 |

## §1.2 — `apps/editor` — component/family surfaces, live and dead

### §1.2.1 — ⭐ The Phase-4F surfaces: AUTHORED + TESTED, **EXISTS-UNWIRED** (build-graph axis unmet)

`apps/editor/src/ui/component/` — uncommitted, held by the wave:

- **`ComponentParameterTable.ts`** — the parameter table (the body the rival's splash never got). Every
  row names its **value source** per C110 §2.2 (`instance > type > expression > default`), renders
  `§SUPERSEDED-DEFAULT` warns and unattached diagnostics, derives the unit label from
  `RUNTIME_LENGTH_UNITS_PER_METRE` (never hard-codes "m" — C110 §3.3's owed D3 delta), computes nothing
  the resolver computes (P6: callback out, caller dispatches).
- **`ComponentProfilePanel.ts`** — the profile authoring surface: a COMPOSITION of
  `ElevationOutlineSurface` + `profileSurfaceAdapter` (all flattening delegated to
  `@pryzm/family-instance`'s `profileToPolygon`) + `profileConstraints`. Three named refusals reach the
  screen (C16 CA-18).
- **`profileConstraints.ts`** — the constraint-vocabulary split: `EVALUABLE_CONSTRAINT_KINDS` vs
  `PERSISTED_CONSTRAINT_KINDS`; **refuses by name the eight kinds nothing evaluates**.
- **`ElevationOutlineSurface.ts`** (modified in place) — subject generalised to a `Profile` on a declared
  `ReferencePlane` (`§SUBJECT-IS-A-PROFILE-ON-A-DECLARED-PLANE`, C86 §10.6.1c honoured) + constraint
  glyph layer. **Gate J GREEN** — all three existing callers (`WallProfileEditor`,
  `FinishTypeEditorModal`, `WindowOutlineEditorDialog`) at pre-change counts; PR-2 byte-fixture held
  (lane 4F §1).

**Reachability (lane 4F §7, verbatim):** axis 1 ✅ · axis 2 ⛔ none-by-design (P6) · **axis 3 ⛔ UNMET —
zero production importers** · axis 4 ✅ tests only. **The named mount seam:** a
`setComponentProfileEditorOpener` of the `setWindowOutlineEditorOpener` shape
(`PropertyPanelBodyRenderer.ts:37-41` wires the window's), landed **with** its
`openingProfilePanelReachability.spec.ts`-style ARM B. That is lane 4F's owed **O-1** and it is lanes
U2/U3's first job.

### §1.2.2 — The create rail: a placeholder where the entry point belongs

- `apps/editor/src/ui/layout/CreatePanelLayout.ts:427-431` — palette item **"Generic Component"**
  (Interior group) → dynamic-imports `../familyCreatorPlaceholder` → `openFamilyCreatorPlaceholder()`
  → **`console.log` no-op** ("intentionally silent in production"). Two same-named placeholder files
  exist (`src/familyCreatorPlaceholder.ts`, `src/ui/familyCreatorPlaceholder.ts`);
  `FamilyCreatorPlaceholderScaffold.test.ts` asserts the routing and is **designed to go RED** when the
  real editor wires in (audit §12 Phase 7C — the scaffold retiring itself).
- The furniture browser two rows above it (`carouselMode: true`) is the in-palette catalogue-browser
  pattern the component browser mirrors.

### §1.2.3 — ⛔ The Wave-6 relics: refuse-on-click, wrong vocabulary — RETIRE, harvest the bindings

- **`apps/editor/src/ui/FamilyBrowserPanel.ts`** — 9 hard-coded categories, dispatches kebab-case verbs
  (`place-family-instance`, `edit-family`) that are among the **276 unbacked verbs that now REFUSE**
  (commits `4bfe86f0`, `4304630d` — every refusal cites its SPEC-50 backlog row via
  `refuseUnbacked`/`applyCommandBacking`).
- **`apps/editor/src/ui/toolbar/FamilyToolbar.ts`** — 8 buttons (`browse-family-types`, `load-family`,
  `create-family`, `reload-family`, `export-family`, `edit-family`, `edit-family-type`,
  `place-family-instance`), all refusing.
- **`apps/editor/src/ui/FamilyPropertiesPanel.ts`** — a **mock** parameter list (its own header:
  *"TODO(Phase-F): replace mock parameter list"*).

All three carry the vocabulary D5 forbids on user-facing surfaces and verbs C69 would freeze if ever
backed. **Verdict: none of these becomes the component UI.** What survives is their
activatePanel/deactivatePanel binding pattern and the grid layout idea. Their retirement (or re-pointing)
is lane U7.

⚠ **Disambiguation (C111 §0.4):** `apps/editor/src/ui/DetailComponentPanel.ts` is **2-D drafting detail
patterns** (repeating details, filled regions, insulation) — a third meaning of "component" that the
contract forbids widening. No U-lane touches it; no copy borrows its name.

### §1.2.4 — The proven element-creation UX the placement flow MUST mirror

The click sequence that already works for ~20 families, measured end to end:

1. **Palette** — `CreatePanelLayout.ts` item → `service.activate<X>Tool(type)` (`BimService.ts:313`
   `activateFurnitureTool` stores the active type, routes through `ToolManager` so
   `PlanViewToolOverlay` receives the tool key and arms the plan handler; 3-D fallback via the tool
   object).
2. **Click-to-place** — the armed handler places at the click; dispatch goes to the bus
   (`furniture.create` at `FurnitureTool.ts:619/700/747`).
3. **Property panel** — `PropertyPanelBodyRenderer.ts` mounts the per-kind section
   (`buildWindowSection` from `@pryzm/geometry-window` at `:37`, `buildDoorSection`…), the type-swap
   widget (`_buildTypeSelector` / `PropertyPanelTypeSelector`), spatial + relationships sections, apply
   footer.
4. **Type authoring** — `ElementTypeAuthoringRegistry.ts` (385 ln): **declaration-not-branch**, gates
   "New type…" on C05 round-trip + C13 project scope, absence is a sentence
   (`authoringUnavailableReason`). Editor: `FinishTypeEditorModal.ts` (1,049 ln) with
   `FinishTypeChatStrip.ts` (242 ln) — *"two ways in, ONE draft, one validation, one command, one
   read-back"* (the §76 gate-D template).
5. **Previews** — `ElementPreviewCanvas`/`ElementPreviewRenderer` (1,920 ln): ONE offscreen WebGL
   context, **no rAF ever**; audit §8.2: reuse for previews, ⛔ never grow into the authoring viewport.

⚠ **The lift lesson (L-5709), inherited verbatim:** a palette button can be armed and drive a LEGACY
command. The component palette button must drive **`component.place`** — and the acceptance reads the
occurrence back out of `rt.stores.component`, never a `success: true` (C16 CA-21).

### §1.2.5 — AI/chat state for `component.*`

- `packages/ai-host/src/capabilities/ChatCommandClassification.ts:4050-4052` — the three verbs are
  **honest deferrals** with named reasons (no project-level catalogue; overrides keyed by `par_` ULID).
- ⚠ **The deferral strings promise UI that does not exist yet:** *"Place it with the Component tool"* /
  *"Edit it in the Properties panel with the component selected."* There is no Component tool and no
  component Properties section at this reading. Until lanes U1/U2 land, those strings overstate —
  **flag for the ISSUE-LOG as an L-row candidate** (this lane is read-only and logs nothing itself).
- `apps/editor/__tests__/aiReachesComponentSliceThroughComposedRuntime.test.ts` (lane 4H): the chat's own
  executor lands `component.place` on the real composed runtime, actor stamped on the EventRecord
  (gate D-i and D-ii both TRUE as of that lane).
- `RelationshipExplorerPanel.ts` (dataworkbench) — read-only SemanticGraph viewer; the wave (lane 4G)
  added the definition-axis edges (`instantiates`/`specializes`/`dependsOnDefinition`) — the panel's
  label map is where those become user-visible.

## §1.3 — `plugins/component` (Phase 4C/4E, untracked in the working tree)

**Declares NO UI seats — deliberately.** The P6 split: handlers + one store + committer; the editor owns
every surface.

- `store.ts` — `ComponentStore` (`super('component')`), one authority (C84 EI-1), queries `byLevel`,
  `byDefinition`; **no resolved values, no geometry stored** (spec §66 F-2 depends on that absence);
  dirty channel with — at this reading — **no subscriber** (the 3-D leg is 4E's).
- `handlers/` — `component.place` / `component.swapType` / `component.setInstanceParameter`, C16 Path-B,
  `affectedStores: ['component']`, ULID-regex refusals for definition/type refs
  (`PlaceComponentPayload`: `definitionId` `fam_`, `typeId` `typ_`, `origin` **world metres**,
  `rotation` rad, `hostId` **⛔ INERT — "nothing resolves it (D11 is OPEN)"**, `instanceParameters` keyed
  by `par_` ULID). Registered via the `component` descriptor in `apps/editor/src/PluginRegistry.ts:538`.
  API-VERB-REGISTER rows **LIVE** (lines 96-98). Join proven by
  `componentJoinThroughComposedRuntime.test.ts` (real `composeRuntime()`, read-back from
  `rt.stores.component`, save→reload).
- `committer/` — `ComponentCommitter` (async bake seam `§COMPONENT-RENDER-ASYNC-SEAM`; monotonic
  generation guard against stale bakes; **refuses to draw substitutes** — empty marked group with a
  counted reason, never a placeholder cube). Mount path: `bootstrap.render.everything.ts`
  `§COMPONENT-RENDER-MOUNT-ADOPTS-INNER` — **lane 4E in flight; D10's descope is pre-authorised**, so the
  UI plan treats "instance visible in viewport" as *expected but severable* acceptance.

## §1.4 — The model layer's UI-relevant capability rows (post-Phase-4, verified in this tree)

| Capability | State | Evidence |
|---|---|---|
| Parameter resolution order (D4) | ✅ REPAIRED — instance > type > expression > default; both-present is a `warn` | C110 §2.2/§2.4; `resolveParameter.ts` modified by 4A; `formulaRecompute.test.ts` |
| Solid features at the bake | ✅ extrude/sweep/loft/revolve via injected `GeometryAdapter` (`geometryAdapter.ts:126-129`) | lane 4D; `adapterCapabilities` |
| `boolean` feature | ⛔ **persisted (schema kind exists, `family-schema.ts:468`) and bake-INERT — deliberately absent from the adapter port while D7 (feature graph vs undo) is OPEN** | `geometryAdapter.ts:40-47` |
| Profile flattening | ✅ point/line/arc/circle closed-form; ⛔ `spline` REFUSED (no determined control-point spelling anywhere) | `profileToPolygon.ts:73,283-293` |
| Constraints | 12 persisted; **4 evaluable** on this surface; 8 refused by name; solver FORBIDDEN (C74 §4.1) until §4.2(c) | `profileConstraints.ts`; C74 §4.6 |
| Definition catalogue | ⛔ **NONE.** No corpus (`find . -name "*.pryzm-family"` → none, C111 §3.1); marketplace transport LIVE (`server/familyMarketplaceRoutes.js`, `POST/GET /api/v1/families`); `apps/editor` had no family-package imports before 4F |
| Type CRUD | ⛔ no `component`-namespace type-authoring verbs exist (only the three instance verbs) | API-VERB-REGISTER |
| Sub-object picking | ⛔ `faceIndex` produced by bvh-pick, consumed by nobody, **not populated by gpu-pick** | audit §3.10 |

---

# §2 — THE SPEC'S UI/UX REQUIREMENT SET, AS A CHECKLIST

Marking: **EXISTS** (reachable by a user today) · **EXISTS-UNWIRED** (authored+tested, no production
mount) · **HARVEST** (real inside `apps/component-editor`; re-seat onto the canonical bus per D1) ·
**MISSING**. Where a row is split, both halves are stated.

### A — Placement & instance UX

| # | Requirement | § | State |
|---|---|---|---|
| 1 | Create → System/Component entry point | §59 | **MISSING** (a `console.log` placeholder holds the seat — `CreatePanelLayout.ts:427`) |
| 2 | Category modal, category supplies templates not a geometry engine | §59–§61 | **MISSING** — template is `ElementTypeAuthoringRegistry`'s declaration-and-gate pattern (audit R13); ⚠ the spec names 16 categories, the audit's 4B row says "17" — count from the spec text when built, not from either citation |
| 3 | Component browser (definitions + types, searchable) | §59, §24 | **MISSING**; visual pattern harvestable from the furniture carousel + `FamilyBrowserPanel`'s grid (bindings only — its verbs and vocabulary are dead, §1.2.3) |
| 4 | Click-to-place tool dispatching a real verb | §63 | **MISSING** (verb ✅ LIVE; no tool arms it) |
| 5 | Instance property section (identity, definition/type, parameters) | §63, §12 | **MISSING** in `PropertyPanelBodyRenderer`; the parameter table itself **EXISTS-UNWIRED** (`ComponentParameterTable`) |
| 6 | Type swap on a placed instance | §12, §24 | verb ✅ LIVE (`component.swapType`); widget pattern ✅ (`PropertyPanelTypeSelector`); the join **MISSING** |
| 7 | Instance parameter override (this one, not the other 19) | §12, §66 | verb ✅ LIVE; UI **EXISTS-UNWIRED** (table's callback seam) |
| 8 | Placed instance visible in 3-D | §63 | **IN FLIGHT** (lane 4E; D10 descope pre-authorised — acceptance is a rendered instance, and "not rendered" is reportable) |
| 9 | Undo / persistence of placement | §63 | ✅ EXISTS at model (4C: patch pairs, `snapshotFamilyCoverage` row, save→reload proven) |
| 10 | Host-aware placement (window into wall…) | §26 | ⛔ **MUST NOT SHIP** — `hostId` is INERT, D11 OPEN (§4 R-d) |

### B — The authoring surface (definition editor)

| # | Requirement | § | State |
|---|---|---|---|
| 11 | Sketch tools: line/polyline/arc/circle/rectangle + select | §57 Create | **EXISTS** as surface capability (`ElevationOutlineSurface`: polyline, 3-click arc, presets, ortho-absolute, vertex drag, midpoint insert, delete-with-guard); tool-button chrome for a component profile **EXISTS-UNWIRED** (`ComponentProfilePanel`); richer per-tool UX (fillet/trim on sketch entities) **HARVEST** (`sketch/tools/*.ts`) |
| 12 | Ellipse/polygon/spline/NURBS/point/plane tools | §57 | **MISSING**, and spline is model-refused (`profileToPolygon.ts:283`) — do not ship the buttons (§4 R-b) |
| 13 | Modify group (move/rotate/scale/mirror/offset/trim/extend/fillet/chamfer/join/split) | §57 | **MISSING** as component-profile UX; trim/fillet **HARVEST**; vertex-level move ✅ in the surface |
| 14 | Solid group: extrude/sweep/loft/revolve | §57 | model ✅ REAL (adapter, §1.4); feature-list/creation UI **MISSING**; `solid.add/remove/setLodBitmask` **HARVEST** (3 of the 12 verbs) |
| 15 | Solid group: boolean ∪/−/∩ | §57 | ⛔ **MUST NOT SHIP** (bake-inert, D7 — §4 R-a) |
| 16 | Solid group: shell/thicken/pattern/array | §57 | **MISSING** at model (audit §3.5; Stage-0/Stage-1 triggers, audit §7.2) — no buttons |
| 17 | Parameter table (definition scope) with per-source display | §57 Parametric, §9 | **EXISTS-UNWIRED** (`ComponentParameterTable` — source column is C110 §2.2 on screen) |
| 18 | Formula editing with typed diagnostics | §11, §13, §64 | model ✅ (grammar C110 §4.2, closed diagnostic set §4.4; D4 repaired; `introduce-expression` migrator fixed by 4B); **edit UI MISSING** (the table renders; nothing yet writes an expression) |
| 19 | "Make this a formula / make these equal" progressive-parametrisation gestures | §13, §64 | **MISSING** as UI; model path repaired; `equal`-class constraints are expression-engine work, no solver needed (audit §4.3 entity 8) |
| 20 | Constraint authoring + glyphs on the sketch | §14–§15, §57 | **EXISTS-UNWIRED** (glyph layer + `authorableConstraintKinds`; authors 4 kinds, refuses 8 by name); `constraint.add*` × 5 **HARVEST** (AI verbs) |
| 21 | Reference-plane UI (list, add, reorient) | §14, §57 | **MISSING** in canonical editor; **HARVEST** (`referencePlaneStore` + 4 `referencePlane.*` verbs) |
| 22 | Material slots UI | §23, §57 Semantic | **MISSING** (schema ✅ `MaterialSlotSchema`; binding must go through C100's ladder — audit B4) |
| 23 | Type catalog: list/create/duplicate/edit types per definition | §24 | **MISSING**, and ⛔ **model-blocked**: no type-CRUD verbs exist (§4 R-f); behaviour spec = `PRESERVED_ON_TYPE_CHANGE` (audit §8.2) |
| 24 | Views: PLAN/FRONT/SIDE/SECTION/3D of one model | §21–§22 | **MISSING** (derived 2-D representations absent from Stack 1 — audit §3.10); the rival's tabs prove only the pattern |
| 25 | 3-D preview of the definition/type | §58, §62 | **MISSING**; constraints named: reuse `ElementPreviewCanvas`'s one-context/no-rAF rules; ⛔ do not grow it into the authoring viewport (audit §8.2) |
| 26 | 3-D first-class: selection, face/edge/feature picking, parameter+dimension manipulation, material/host preview | §58 / D2 / C86 §10.6.1 | element-level selection ✅ in main viewport; **face/edge/feature picking MISSING repo-wide** (§4 R-h); dimension-handle manipulation **MISSING**; ⛔ 3-D sketch input **FORBIDDEN** until the §10.6.1b camera-plane mechanism exists |
| 27 | Profile preset library (rect/round-arch/segmental-arch/circular/custom) | §67, C86 §10.1 | presets **EXIST** for window outlines (`OpeningProfile.ts`); promotion to generic `Profile` presets **MISSING** (audit §8.2 "PROMOTE, do not replace") |
| 28 | Definition open/save (`.pryzm-family`) in the editor | §63, C111 | **MISSING** (pack/unpack ✅ in `@pryzm/file-format`; HTTP transport ✅ LIVE; no editor surface reads `document.json` — C111 §3.3) |
| 29 | Marketplace publish from the editor | §59 ecosystem | **HARVEST** (`publishFlow.ts` + signing) — after D1 executes; not before |

### C — AI, diagnostics, semantics

| # | Requirement | § | State |
|---|---|---|---|
| 30 | AI creates values AND rules through the same bus | §39–§45, §64 | executor path ✅ proven (4H test, actor stamped); chat *placement* honestly DEFERRED on the missing catalogue (`ChatCommandClassification.ts:4050-4052`); rule-creation verbs (`parameter.setFormula`, `constraint.*`) **MISSING** at bus, **HARVEST** at validator level |
| 31 | The 12 harvested AI verbs live as `ChatCapability` rows with probe + commandProof | audit §9.3-6 | **MISSING** (registry rows do not exist; `createAiHostBridge` has zero callers) |
| 32 | Structured-diagnostic repair loop (Confirm card over a plan) | §44–§45 | substrate ✅ **BUILT-UNCONSUMED** (`ConsequencePlan` + seven gates — audit §9.3-5); UI **MISSING** |
| 33 | Refusals reach the screen with both numbers and the live alternative | §75, C16 CA-18 | **EXISTS-UNWIRED** in the 4F surfaces; pattern ✅ shipped elsewhere (`refuseUnbacked` toolbars) |
| 34 | `✓ Complete / ⚠ Missing required information` (IDS-style) | §32 | ⛔ **DEFERRED by contract** — C113 minted only when the validator exists (Phase 6) |
| 35 | Relationship visibility (`instantiates` etc. in Inspect) | §34–§35 | graph edges ✅ landing (lane 4G); `RelationshipExplorerPanel` label rows **MISSING** for the three new kinds |
| 36 | D5 vocabulary sweep — user-facing "Component", never "Family" | D5, C111 §0.4 | **MISSING** as a guard; three Wave-6 `Family*` panels still mounted-refusing (§1.2.3) |

---

# §3 — THE DELIVERY PLAN: THE UI/UX BUILD WAVE

**Phase order within the wave:** U0 → (U1 ∥ U2) → U3 → (U4 ∥ U5 ∥ U6) → U7. Every lane: OWNS ·
REUSES · ACCEPTANCE **at the layer the user experiences** (a real click sequence, read back per C16
CA-21 where a store is the truth) · WAITS-ON. Standing rules: audit §12.0 (all six), plus: **no lane
touches `apps/component-editor/**`** (D1's Phase-7B owns it) and **no lane touches the serialize-only
trio without declaring it**.

## Lane U0 — the definition-catalogue seam (the one genuinely new service, and every other lane's feed)

The blocker every surface shares, in the chat deferral's own words: *"there is no project-level
catalogue for me to look a name like 'window' up in."* The committer (4E), the browser (U1), the
property section (U2), the definition editor (U3) and the AI (U6) all need **one** resolver from
`(familyId, schemaHash)` → validated `FamilyDocument`, and one enumerable list of available
definitions+types.

- **OWNS:** `apps/editor/src/services/componentCatalog/**` *(new)*.
- **REUSES:** `@pryzm/family-loader` (unzip → validate → resolver pre-flight → cache by
  `(familyId, schemaHash)` — exactly the required key, C111 §4.3-b) · the LIVE marketplace transport
  (`GET /api/v1/families`, `GET /api/v1/families/:id/download` — C111 §3.1's one LIVE row) · a local
  file-open leg (`<input type=file>` → `unpackFamily`). ⛔ **One resolver:** lane 4E's committer wiring
  already resolves definitions to bake; U0 must WRAP THE SAME SEAM lane 4E lands
  (`bootstrap.render.everything.ts` `§COMPONENT-RENDER-MOUNT-ADOPTS-INNER` names it), never a second
  loader-cache beside it (C84 EI-9). Read lane 4E's transcript before writing a line.
- **⚠ Open model question, surfaced not assumed:** *where do a project's definitions persist?*
  C111 §4.3-a rules the split (definitions in the envelope, instances in the snapshot) but nothing yet
  rules how a project references its definition set. U0 ships the in-memory catalogue + explicit
  load; project-scoped definition persistence is flagged for a founder/ADR ruling — the UI must not
  silently invent a storage location.
- **ACCEPTANCE:** boot the editor → open the catalogue → load a signed fixture `.pryzm-family` (via the
  marketplace route or file-open) → its name + types enumerate; a second load of the same
  `(familyId, schemaHash)` hits the cache; a tampered file refuses with the loader's named error.
  ⚠ There is no corpus (C111 §3.1) — the fixture is authored by the lane through `packFamily` and that
  is stated, not hidden.
- **WAITS-ON:** the Phase-4 wave commit (file-format, family-loader graph); lane 4E's seam name.

## Lane U1 — the placement flow (browser → tool → click → placed)

- **OWNS:** `apps/editor/src/ui/component-browser/**` *(new)* · the "Generic Component" palette rewire
  in `CreatePanelLayout.ts` (and its twin surface if L-1380's two-surface rule bites — check
  `CreateRailPanel.ts`) · a `component` tool key in the ToolManager path · a
  `ComponentPlanToolHandler`/3-D placement tool *(new, mirroring `FurniturePlanToolHandler` /
  `FurnitureTool`)* · `BimService.activateComponentTool` *(new method)*.
- **REUSES:** the §1.2.4 furniture flow verbatim (palette → `activate<X>Tool` → ToolManager → armed
  handler → bus verb) · the furniture carousel browser pattern · `component.place` (LIVE) ·
  U0's catalogue for the definition/type list with thumbnails deferred to U5.
- **⛔ The lift lesson is the acceptance's spine (L-5709):** the button must drive `component.place`,
  and BOTH create surfaces must learn the tool (L-1380).
- **ACCEPTANCE (user layer):** Create → Interior → **Components** → browser lists the loaded
  definition → pick type **W-1200** → cursor becomes the place tool → click in plan at a point →
  `rt.stores.component.getState()` holds one occurrence with that `definitionRef`+`typeId` and the
  click's world metres (CA-21 read-back) → Ctrl+Z removes it (read-back again) → place, save, reload →
  still there. If lane 4E landed its mount: the instance is visible in the 3-D viewport; if 4E
  descoped: the browser row and the plan glyph still prove placement, and the absence of 3-D is
  REPORTED, not worked around (D10).
- **WAITS-ON:** wave commit; U0. `CreatePanelLayout.ts` / `BimService.ts` / ToolManager files are not
  in the wave's held set (verified against `git status` 2026-09-02) but re-verify at lane start.

## Lane U2 — the instance property panel (type swap + overrides on the two live verbs)

- **OWNS:** `apps/editor/src/ui/property-panel/ComponentSection.ts` *(new)* · the mount edit in
  `PropertyPanelBodyRenderer.ts` · the opener-port wiring + ARM B spec.
- **REUSES:** `ComponentParameterTable` (**the whole point — it is built**; instance-scope rows,
  source column, superseded-default warns) · `PropertyPanelTypeSelector` for the type dropdown →
  `component.swapType` · the `setWindowOutlineEditorOpener` port pattern + ARM B
  (`openingProfilePanelReachability.spec.ts`) for every port this section adds · `resolveParameter` for
  display values (never a stored copy — the store deliberately holds none).
- **ACCEPTANCE (user layer):** select a placed component → panel shows Component section: definition
  name, type dropdown, parameter table with per-row source labels → change the type → the instance
  re-reads (CA-21 on `component.swapType`'s store write) and — with 4E — the mesh regenerates; edit one
  parameter on ONE of two placed instances → only that instance's row shows source `instance`, the
  other still `type` (spec §66 F-2 at the panel); a refused edit (bad unit, cycle) renders the
  diagnostic against its row, not a silent no-op.
- **ALSO CLOSES:** the overstating chat deferral string *"Edit it in the Properties panel…"*
  (`ChatCommandClassification.ts:4051`) becomes true; lane updates nothing in ai-host itself (that
  file is wave-held; the string is already written as if U2 exists).
- **WAITS-ON:** wave commit (the `ui/component/` tables and `ElevationOutlineSurface` are IN the held
  set); U1 for a placed instance to select (test fixtures can pre-place via the bus).

## Lane U3 — the definition editor (authoring workspace)

The largest lane; the spec's §57 tool groups land here, scoped to what the model does.

- **OWNS:** `apps/editor/src/ui/component-editor-workspace/**` *(new — a modal-or-workspace shell:
  definition header, parameter table in definition/type scope, profile list + `ComponentProfilePanel`
  mount, reference-plane list, material-slot list, solid-feature list, save/pack action)* ·
  `setComponentProfileEditorOpener` wiring + ARM B (lane 4F's O-1, discharged here for the profile
  surface).
- **REUSES:** `ComponentProfilePanel` + glyph layer (built) · `ElevationOutlineSurface` (extended;
  ⛔ serialize-only — it is gate J's regression surface; C86 §10.1 PR-1/PR-2 hold) ·
  `FinishTypeEditorModal`'s draft-then-one-commit shape and its `makeDraggable`/`makeResizable`
  chrome · the `family-migrations` ops (`introduce-expression` — now actually clearing the superseded
  default) for formula introduction · `packFamily`/Ed25519 for save · C110 §4.2's closed grammar +
  §4.4's closed diagnostic set for the formula editor's error surface.
- **Mutation shape, stated before anyone asks:** a definition is a DOCUMENT, not project state — the
  editor holds a draft `FamilyDocument`, validates through the one Zod schema, and SAVE packs the
  envelope (and re-signs). Instance/project state is untouched; no new bus verbs are minted for
  document-internal edits in this lane. ⚠ If review rules that definition edits must also be bus
  verbs (C69), that is a model-lane decision to request — **not** something U3 improvises.
- **Solid tools scope:** extrude/sweep/loft/revolve ONLY (adapter-real). ⛔ No boolean button (R-a),
  no shell/thicken/pattern/array (R-n), no spline (R-b).
- **ACCEPTANCE (user layer):** open the loaded definition from the browser's "Edit definition…" →
  edit `FrameWidth` default 75→100 → preview parameter table recomputes dependents (4A's
  `formulaRecompute` visible on screen) → open a profile → drag a vertex, add an `equal` constraint
  (glyph appears; a `tangent` attempt refuses by name) → introduce `GlassWidth = Width - 2*FrameWidth`
  via the formula editor → the superseded default renders its C110 §2.4 warn → save → re-place from
  the browser → the placed instance reflects the edit; the §64 sequence "make the frame 100 → make
  glass width always opening width − 2×frame width" is executable by clicks end to end.
- **WAITS-ON:** wave commit; U0 (open path); U2's port pattern (shared ARM-B idiom, avoid divergence).

## Lane U4 — type catalog management

- **⛔ MODEL PREREQUISITE, NAMED FIRST:** there are no type-CRUD verbs (§1.4). Creating/duplicating/
  renaming a type from the UI needs either (a) document-draft editing inside U3's workspace (types are
  document content — `FamilyTypeSchema`, `types.min(1)`), or (b) minted `component.*` type verbs with
  C69 rows. **Recommendation: (a) inside U3's draft-save shape** — it needs no new wire names and
  respects C111 §4.1-b. If review chooses (b), the verbs are a model lane's deliverable first.
- **OWNS:** the type-list panel inside U3's workspace · the browser's type sub-list refinement.
- **REUSES:** `ElementTypeAuthoringRegistry`'s gate pattern (a definition whose store/persistence gates
  fail gets `authoringUnavailableReason`, never a broken button) · `PRESERVED_ON_TYPE_CHANGE`'s
  behaviour spec via the resolver ladder (it IS `instanceOverrides` — audit §8.2) ·
  `FinishTypeChatStrip` as the gate-D chat template when U6 arrives.
- **ACCEPTANCE:** in the definition editor, duplicate **W-1200** → **W-1500**, edit its `Width` value,
  save → the browser lists both types → place one of each → swap a placed instance between them (U2's
  dropdown) → twenty-instance semantics hold (change the TYPE value → its instances follow; the
  instance-overridden one does not — spec §66 read at the panel and the store).
- **WAITS-ON:** U3.

## Lane U5 — 3-D per D2's split (preview + admissible authoring gestures)

- **OWNS:** definition/type thumbnail rendering for the browser + workspace preview panel *(new,
  offscreen)* · selection/highlight polish for placed components in the main viewport.
- **REUSES:** `ElementPreviewCanvas`/`ElementPreviewRenderer`'s **one-context + no-rAF rules as
  binding constraints** (audit §8.2 — reuse for previews, never grow into the authoring viewport) ·
  the 4E bake seam for geometry (one resolver, U0).
- **D2 scope, drawn exactly (C86 §10.6.1):** ✅ selection, parameter/dimension display, material/host
  preview in 3-D. ⛔ NO 3-D sketch input (until §10.6.1b's named camera-plane mechanism exists — a
  rendering/interaction ADR, not a UI-lane side effect). ⛔ face/edge/feature picking DEFERRED —
  `faceIndex` is unpopulated on the production pick path (audit §3.10); building on it would violate
  §7/§20 on day one. Dimension-HANDLE manipulation (dragging a scalar whose axis the model owns) is
  admissible per §10.6.1 but lands only after sub-object anchoring exists; not promised in this wave.
- **ACCEPTANCE:** the browser shows a real baked thumbnail per type (or the honest UNRESOLVED/empty
  state — never a placeholder cube, `ComponentCommitter`'s own refusal rule); clicking a placed
  component in 3-D selects it and opens U2's section; an idle preview costs zero frames (no rAF —
  provable by the existing no-rAF gate).
- **WAITS-ON:** lane 4E's outcome (rendered-or-descoped); U0; U1.

## Lane U6 — AI-assisted authoring (the 12 harvested verbs, reused not re-invented)

- **OWNS:** `ChatCapability` rows for the component surface (in the ai-host registry files once the
  wave releases them) · the deferral-string updates for `component.place`/`swapType`/
  `setInstanceParameter` the moment U1/U2 make their promises true · a chat strip in U3's workspace.
- **REUSES:** the audit §9.3 order **verbatim** — `HANDLER_GLOBS` first (extended by 4H; keep
  `UNDECLARED` at baseline), rows with `probe` + `commandProof` (R9), the actor stamp (landed, 4H),
  `resolveCatalogueRef`'s ladder over U0's catalogue for name→id (closing the honest "no catalogue"
  deferral) · the 12 `apps/component-editor` verb VALIDATORS as the starting shapes for
  `constraint.*`/`referencePlane.*`/`solid.*` capabilities — re-seated against U3's document-draft
  seam, with `addDistance`'s parameter-name-as-value carried over (the §41–42 unlock) ·
  `FinishTypeChatStrip` (gate D: two ways in, ONE draft, one command, one read-back) · `AiPlane`'s
  approval queue, ⛔ never the rival's (`approvalQueue.ts` is reference material only).
- **ACCEPTANCE:** in the workspace chat strip: *"make both side frames equal"* → a REAL persisted
  constraint appears in the glyph layer (never nudged values — spec §13); *"make glass width always
  opening width − 2×frame width"* → the formula lands and the superseded default warns (§64, F-3);
  in the main chat: *"place a W-1200 at …"* resolves through the catalogue or refuses with both the
  reason and the live alternative; every capability row's `probe`+`commandProof` green in
  `check-chat-capability-coverage` with `UNDECLARED` at baseline.
- **WAITS-ON:** wave commit (ai-host files held); U0 (catalogue); U3 (the draft seam its verbs write).

## Lane U7 — vocabulary & retirement sweep (D5 on screen)

- **OWNS:** retiring or re-pointing `FamilyBrowserPanel.ts`, `FamilyToolbar.ts`,
  `FamilyPropertiesPanel.ts` (all refuse-on-click today; whatever survives is renamed Component and
  driven by the real verbs — most likely nothing survives but the binding pattern) · a user-facing-copy
  guard in the `noFamilyElementGroupLabel.spec.ts` style, scoped to the NEW component surfaces
  (⚠ narrow, per that spec's own header — "family" is legitimate for graph edge-families and the
  frozen legacy package/format names) · the `RelationshipExplorerPanel` label rows for
  `instantiates`/`specializes`/`dependsOnDefinition` (making 4G's edges user-visible).
- **⛔ NOT owned:** `apps/component-editor/**` (Phase 7B, gated on D1's ADR + the L-12830 gate fix) ·
  the create-rail placeholder deletion is shared with U1 (U1 rewires the button; the scaffold test
  `FamilyCreatorPlaceholderScaffold.test.ts` goes RED **by design** in U1's commit and is retired
  there — audit Phase 7C's mechanism, executed early for this one seat).
- **ACCEPTANCE:** no mounted user-facing surface dispatches a `*-family-*` verb or titles itself
  "Family"; the Inspect panel names the instantiation edges; the copy guard is green.
- **WAITS-ON:** U1/U2 (so retirement never removes a capability before its replacement exists —
  [[refusing-half-needs-its-escape-hatch]]).

---

# §4 — THE REFUSAL REGISTER: WHAT THE UI MUST NOT PROMISE

Spec §75 applied to this plan. Each row: the temptation, the measured block, the honest UI behaviour.

| # | UI temptation | The model's state | Honest UI |
|---|---|---|---|
| **R-a** | A Boolean (∪/−/∩) tool | `boolean` feature persisted (`family-schema.ts:468`) but **deliberately absent from the adapter port** while D7 (feature graph vs undo) is OPEN — `geometryAdapter.ts:40-47` | No button. If a loaded document carries one, the feature list shows it with its `unsupported-feature` refusal, verbatim |
| **R-b** | Spline/NURBS/ellipse tools | `spline` REFUSED at flattening — *"no determined control-point spelling exists"* (`profileToPolygon.ts:283-293`); NURBS/ellipse have no schema entity | No buttons; a document spline renders the named refusal |
| **R-c** | Authoring all 12 persisted constraint kinds | 4 evaluable on this surface; 8 refused by name; the solver is C74 §4.1-FORBIDDEN until the §4.2(c) record names a sub-family | `profileConstraints` already does this — keep its split; never grey-out silently |
| **R-d** | "Place into wall" / hosted placement | `PlaceComponentPayload.hostId` is **INERT — "nothing resolves it (D11 is OPEN)"** | Free placement only; no host-snap affordance, no host row in the property section |
| **R-e** | Nested components (frame/glass/mullion as children) | **D6 UNRULED** (three rival nesting answers — ADR-0376 lists D6 as open; Phase 8D) | No nesting UI; the browser shows flat definitions |
| **R-f** | "New type…" via a bus verb | No type-CRUD verbs exist; C69 makes any minted name permanent | U4's document-draft route, or wait for a model lane's verbs |
| **R-g** | Sketching in the 3-D viewport | C86 §10.6.1: plane-inferring input is NOT a 3-D surface until the §10.6.1b camera-plane mechanism exists (its own ADR) | Sketch stays on the SVG elevation surface and plan tools |
| **R-h** | Face/edge/feature selection in 3-D | `faceIndex` produced by bvh-pick, consumed by nobody, **not populated by gpu-pick** (audit §3.10) | Element-level selection only; the D2 face-picking column waits for a model lane |
| **R-i** | A code/DSL tab | Phase 5 (`packages/component-api` does not exist) | No tab; nothing hints at one |
| **R-j** | `✓ Complete / ⚠ Missing information` badges | C113 deliberately unminted until the IDS validator exists (Phase 6) | No badges; property rows show what IS declared |
| **R-k** | Printing "m" because C110 §3.1 says metres | The engine stores mm today; the D3 delta is OWED and its window is decaying (C110 §3.3) | Derive every unit label from `RUNTIME_LENGTH_UNITS_PER_METRE` (the `ComponentParameterTable` rule, made binding for all U-lanes) |
| **R-l** | Leaving the chat deferral strings as-is | `ChatCommandClassification.ts:4050-4052` names a "Component tool" and a component Properties panel that do not exist yet | U1/U2 make them true; until merged, this is an open overstatement — L-row candidate for the ISSUE-LOG |
| **R-m** | Authoring a `fixed` constraint | LATENT — nowhere to persist (lane 4F O-6) | Stays in the refused set until the schema gap closes |
| **R-n** | Fillet/chamfer/shell/thicken/pattern/array solids | No producers (audit §3.5); Stage-1 kernel adoption has a written trigger (audit §7.2) that has not fired | No buttons; adding one IS the Stage-1 trigger and goes through its ADR |
| **R-o** | A Publish button in the canonical editor | `publishFlow.ts` lives on the retiring rival; D1's execution (Phase 7B) has not happened | Publish waits; the marketplace transport being LIVE is a U0 *read* leg only |
| **R-p** | Auto-filling a thumbnail with a plausible box | `ComponentCommitter` refuses substitutes — empty marked group with a counted reason | Previews show the honest empty/UNRESOLVED state (C100's deliberately-implausible colour) |

---

# §5 — STANDING RULES FOR THE U-WAVE (inherited, restated once)

1. ⛔ **Nothing starts before the Phase-4 wave commits** (§0.2). Re-run `git status` at every lane
   start; a lane that edits a file another lane holds is a collision, not a merge problem.
2. ⛔ **Never `git stash`** ([[multi-agent-shared-tree-collisions]]); agents commit scoped CODE, the
   orchestrator owns docs.
3. **Serialize-only:** `apps/editor/src/engine/initBusHandlers.ts` ·
   `apps/editor/src/engine/undo/performUndoRedo.ts` · `packages/schemas/src/registry.ts` ·
   **plus, for this wave:** `apps/editor/src/ui/ElevationOutlineSurface.ts` (gate J's regression
   surface) and `PropertyPanelBodyRenderer.ts` (U2's mount point; one lane holds it at a time).
4. **Acceptance is at the layer the user experiences** ([[committed-is-not-reachable]]): a click
   sequence, a CA-21 read-back from `rt.stores.component`, a rendered pixel where 4E permits — never
   `success: true`, a spy, or a DTO-store echo.
5. **Every §76 gate named by a reused pattern keeps passing:** gate J
   (`openingProfilePanelReachability.spec.ts` + the three outline callers + PR-2 byte-fixture), gate D
   (one draft, one command), gate B (no second catalogue, no second resolver, no second parameter
   model).
6. **Foreground gates, `$?` from a redirect, never a pipe** (audit §12.0 rule 5).
7. **Cite §-tags and symbols, never line numbers**, in every lane report (audit §12.0 rule 4).

---

> **Closing judgement.** The founder asked for "the complete UI/UX". The complete UI/UX is: one new
> service (the catalogue seam), two new panels (browser, instance section), one new workspace
> (definition editor), one rewired palette button, one retirement sweep — **assembled almost entirely
> from surfaces that already exist and patterns that already ship**: the parameter table and profile
> panel lane 4F built and could not mount, the elevation surface C86 §10.6 already generalised, the
> furniture placement flow, the type-authoring registry, the preview renderer's discipline, and the
> twelve AI verbs S54 wrote for exactly this editor. The plan's risk is not construction; it is
> **promising what the model refuses** — which is why §4 is as long as §3 — and **starting before the
> Phase-4 wave's uncommitted tree lands**, which is why §0.2 comes first.
