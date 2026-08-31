# C101 — ELEMENT: ANNOTATION

- **Status**: CANONICAL — binding on every PR that touches the annotation family
- **Date**: 2026-08-22 (lane ANNO15)
- **Spawned by**: [C84 §6](C84-ELEMENT-INTEGRITY.md). The **twelve mandatory sections** below are
  C84 §6's, in C84 §6's order. C84 §6's own table lists fifteen families (C85–C99) and **does not
  list annotation** — that is the gap this contract closes, and it is the reason the family had no
  integrity treatment while every wall, door and beam had one.
- **Constrained by** (these own the mechanisms; C101 only APPLIES them per family, per C84 EI-9 —
  *one answer per question*): [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) ·
  [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) · [C24](C24-SHEET-COMPOSITION-ENGINE.md) and
  [C24.1](C24.1-AUTO-DOCUMENTATION-SHEETS-PROTOCOL.md) (what a sheet is) ·
  [C29](C29-PDF-VECTOR-EXPORT.md) (how a sheet becomes a PDF) ·
  [C34](C34-PRINT-AND-DRAWING-STANDARDS.md) (pens, weights, paper) ·
  [C09 §4](C09-AI-AND-VISIBILITY-INTENT.md) (what governs an annotation's appearance) ·
  [C82](C82-RIBBON-CAPABILITY-SURFACE.md) (the three legal states of a rendered control)
- **Evidence**: measured in the MAIN worktree on **2026-08-22** by `grep -n` / line-numbered read.
  Every claim carries `file:line`. Unverifiable cells read the literal string **NOT MEASURED** —
  a finding, not a gap. **No cell is blank** (C84 §6, EI-1b: a blank reads as *"fine"* and is
  indistinguishable from *"nobody looked"*).
- **Persistence pair measured**: `packages/persistence-client/src/loader/`. ⚠ **This is the OPPOSITE
  choice from [C85](C85-ELEMENT-WALL.md)**, which measured `apps/editor/src/engine/persistence/` and
  called the `packages/` copy *"the DEAD copy the app never builds"*. **C101 does not resolve which
  is live and does not claim to.** Both directories exist and both contain a
  `ViewTemplateToIntentMigration.ts` and a `ProjectSerializer.ts`; the annotation slices are
  byte-comparable at the lines cited. **Which pair the app builds is NOT MEASURED here** and is
  DELTA-9.

> ## THE THREE ONE-LINE VERDICTS
>
> **(1) THE PALETTE IS FULLY WIRED, AND THAT IS THE SMALLEST TRUE STATEMENT AVAILABLE.**
> All nineteen entries activate a real tool through a real method (§4, §7 column *activates*).
> **Not one of the nineteen is the "Create Stair" defect** ([L-4601](../../04-reference/ISSUE-LOG.md)
> — a palette entry that reports activation and activates nothing). The failures in this family are
> **downstream of activation**, which is why an activation-shaped audit would have declared the
> family healthy.
>
> **(2) FOUR KINDS ARE SELECTABLE AND INVISIBLE IN THE ONLY VIEW THAT PRINTS.**
> `spot-elevation`, `radius-dim`, `diameter-dim` and `level-tag` are listed in
> `PlanViewAnnotationRenderer.ts`'s own `DRAGGABLE_ANNOTATION_TYPES` (`:150, :153, :159, :160`) and
> have **no case** in its render switch (`:828-858`, `default: break`). The user can select and drag
> an annotation that is not drawn. **The inconsistency is inside ONE FILE**, which is the strongest
> available evidence that no reader ever compared the two lists.
>
> **(3) THE FAMILY HAS FOUR RENDERERS AND NO SHARED VOCABULARY.**
> Plan/section/elevation draws 20 kinds, the 3-D overlay 21, the SVG/PDF composer 24, the DXF bridge
> ~14 — **four hand-written switches over one 27-member enum, none of them generated, none gated.**
> Every disagreement between them is silent by construction. This is C84 §7's *"hand-written named
> subset"* mechanism, four times over.

---

## 1. IDENTITY

### AS-IS — measured

| Axis | Measured |
|---|---|
| L0 schema | `packages/schemas/src/elements/Annotation.ts` — the `kind` union at `:6-18`, **11 members** |
| Canonical record | `AnnotationElement` — `packages/core-app-model/src/annotations/AnnotationTypes.ts:138`; its `type` union at `:20-54`, **27 members** *(subsystem moved out of `plugins/annotations/src/subsystem/` by the F-P5-04 inversion, LANE A 2026-08-31 — same-path shims remain in the plugin)* |
| Parallel flat record | `DimensionElement` — `AnnotationTypes.ts:216`, single literal `type: 'linear-dimension'` |
| Canonical store | `packages/core-app-model/src/annotations/AnnotationStore.ts:86`, singleton `:440` |
| Flat "ledger" store | `plugins/annotations/src/store.ts` (class in `packages/stores/src/AnnotationStore.ts:24`), `kind` typed bare `string` at `store.ts:18` |
| Palette tool ids | **19** — `apps/editor/src/engine/initAnnotationTools.ts:5-23`, `section: 'ANNOTATION'` |
| Bus verb namespace | `annotation.*` — **9** handlers, `plugins/annotations/src/handlers/index.ts:14-24`; plus `dimension.*` |
| `createSnapshot` / undo keys | `annotation`, `annotations` → `window.annotationStore` — `apps/editor/src/engine/undo/performUndoRedo.ts:352` |

**FOUR VOCABULARIES, ONE FAMILY.** They are not nested and they are not aligned:

| Vocabulary | Size | Where | Is it the persisted one? |
|---|---|---|---|
| Schema `kind` | 11 | `packages/schemas/src/elements/Annotation.ts:6-18` (mirrored verbatim as `ANNOTATION_KINDS`, `plugins/annotations/src/intent.ts:16-28`) | **NO** |
| Canonical `AnnotationType` | 27 | `AnnotationTypes.ts:20-54` | **YES** |
| `DimensionElement.type` | 1 | `AnnotationTypes.ts:216` | YES, in a separate `_dims` array |
| Palette tool id | 19 | `initAnnotationTools.ts:5-23` | n/a — ids, not kinds |

⚠ **The tool id is NOT the kind.** `linear-dimension` (tool) → `linear-dim` (kind); `element-tag` →
`tag`. `DimensionElement.type` is spelled `'linear-dimension'` — **the tool id**, colliding by name
with a kind it is not. Three spellings, two of them identical strings meaning different things.

### TO-BE — normative

- **A-ID-1.** The canonical family vocabulary is the **27-member `AnnotationType`**. The 11-member
  schema `kind` union is a **SUBSET THAT DOES NOT DECLARE ITSELF ONE**, and it MUST either be
  widened to 27 or renamed to say what it actually governs. It may not stay an unlabelled subset:
  §12 R-1 records what that already cost.
- **A-ID-2.** No new annotation kind may be added to `AnnotationType` without a row in §3's
  consumer matrix stating, per renderer, *drawn* or *deliberately not drawn*. **Omission is
  forbidden** (C84 EI-2 applied to renderers).
- **A-ID-3.** `DimensionElement.type` MUST NOT be spelled with a tool id. Rename it or fold
  `_dims` into `_data`; DELTA-7.

---

## 2. STORES — and which is THE AUTHORITY

### AS-IS — measured. TWO representations, and one of them is declared dead in its own source.

| Store | Record | Persisted | Rendered | Undo-bound | Readers |
|---|---|---|---|---|---|
| `packages/core-app-model/src/annotations/AnnotationStore.ts:86` (singleton `:440`) | `AnnotationElement` | **YES** — `ProjectSerializer.ts:922-927` | **YES** — all four renderers | **YES** — `performUndoRedo.ts:352` | all |
| `plugins/annotations/src/store.ts` | `AnnotationData` (zod) | NO | NO | NO | **NONE** |

### THE AUTHORITY

**`packages/core-app-model/src/annotations/AnnotationStore.ts`, unambiguously.** This family is the repo's **cleanest** case of a
declared co-living pair, and it is worth recording as a positive: `canonicalAnnotationSink.ts:1-47`
states in source that the flat store *"is read by NOTHING… a DERIVED MIRROR, never a read source"*,
and `assertNotARead()` (`:255`) **throws** if anyone reads it.

⭐ **That is C84 §8.c handled correctly.** §8.c forbids *"mirroring state between two stores as an
end state, WHERE ONE SIDE HAS NO READERS"* — and the mirror here is not defended by a comment, it is
defended by a **throwing assertion**. Contrast C84 §8.d: *"a comment as the synchronisation
mechanism — measured to have failed twice."* Wall has five representations and a prose note; annotation
has two and a tripwire.

### TO-BE — normative

- **A-ST-1.** `packages/core-app-model/src/annotations/AnnotationStore` (formerly `plugins/annotations/src/subsystem/AnnotationStore`) is THE authority. New code MUST NOT read
  `plugins/annotations/src/store.ts`; `assertNotARead()` enforces it and MUST NOT be weakened.
- **A-ST-2.** Per C84 EI-5a the mirror's **WRITE** is retired when its reader count is provably
  zero repo-wide. It is zero today. **NOT MEASURED:** whether any external consumer (plugin SDK,
  marketplace plugin) reads it. Until that is measured the write stays. DELTA-8.

---

## 3. CONSUMERS — the split-brain, at the top as C84 §6 requires

### AS-IS — measured. FOUR renderers, FOUR hand-written switches, ZERO shared source.

| Consumer | Entry | Kinds drawn | Unknown-kind behaviour |
|---|---|---|---|
| Plan **+ section + elevation** | `packages/core-app-model/src/views/PlanViewAnnotationRenderer.ts:828` | **20** (`:829-857`) | `default: break` `:858` — **silent** |
| 3-D viewport overlay | `plugins/annotations/src/AnnotationRenderLayer.ts:487` | **21** (`:488-519`) | **no `default` arm at all** — silent |
| SVG → PDF | `packages/file-format/src/export/sheets/SVGCompositeRenderer.ts:381` | **24** | ~~2 mm X cross~~ **FIXED 2026-08-22, L-5010** — now omits and REPORTS via `unrenderedAnnotationKinds()` |
| DXF | `packages/file-format/src/export/sheets/AnnotationDxfBridge.ts:81` | **~14** (`:82-104`) | generic `default` |
| Persistence (write) | `ProjectSerializer.ts:922-927` → `annotationStore.serialize()` | **all 27** — membership-based, no kind filter | n/a |
| Persistence (read) | `ProjectLoader.ts:1397-1409` → `deserialize()` (`AnnotationStore.ts:272-290`) | **all 27** | n/a |
| Chat / RAC | — | **0** | class-B deferral, `ChatCommandClassification.ts:151-172` |

**⚠ THERE IS NO SEPARATE ELEVATION OR SECTION ANNOTATION RENDERER.** `packages/core-app-model/src/views/`
contains no `Elevation*Renderer` / `Section*Renderer`; `PlanViewCanvas.ts` serves all three view types
(`:211` `_viewType`, `:295` `setViewType`, `:328-336` `isVertical`, `:636` / `:2025` calling
`planViewAnnotationRenderer.render(...)`). **Elevation and section therefore inherit the plan
renderer's holes exactly** — including `level-tag`, the kind whose entire purpose is a vertical view.
`plugins/section-view/src/SectionViewRenderer.ts` contains **zero** annotation references.

### THE SPLIT-BRAIN, stated precisely

| Kind | Plan/Elev/Sect | 3-D | PDF | DXF |
|---|---|---|---|---|
| `spot-elevation` | **✗ :858** | ✓ `:493` | ✓ `:460` | default |
| `radius-dim` | **✗ :858** | ✓ `:496` | ✓ `:401` | ✓ `:83` |
| `diameter-dim` | **✗ :858** | ✓ `:497` | ✓ `:402` | ✓ `:84` |
| `level-tag` | **✗ :858** | ✓ `:502` | ✓ `:508` | default |
| `wall-tag` | ✓ `:835` | **✗** | **✗** (omitted+reported) | default |
| `north-arrow` | ✓ `:855` | **✗** | **✗** (omitted+reported) | default |
| `scale-bar` | ✓ `:856` | **✗** | **✗** (omitted+reported) | default |
| `matchline` | ✓ `:857` | **✗** | **✗** (omitted+reported) | default |
| `room-fill` | ✗ | stub `:513` | ✓ `:615` | ✓ `:99` |
| `text-note`, `tag`, `door-tag`, `window-tag`, `keynote`, `spot-elevation` | — | — | — | **default** — the DXF bridge has **no text/tag family cases at all** |

**Nine of twenty-seven kinds disagree across renderers.** None of the nine is detected by anything.

### TO-BE — normative

- **A-CN-1.** ⭐ **A KIND THAT ONE RENDERER DRAWS AND ANOTHER SILENTLY DROPS IS A DEFECT, NOT A
  CAPABILITY DIFFERENCE.** Where a renderer genuinely cannot draw a kind (a `north-arrow` has no
  meaning in a perspective 3-D view), it MUST **declare** the refusal in a named table, not fall
  through a `default`.
- **A-CN-2.** Every renderer's unknown-kind arm MUST be REPORTABLE, never silent, and MUST NOT
  substitute a mark. `SVGCompositeRenderer.unrenderedAnnotationKinds()` (L-5010) is the reference
  shape: *"dropped it"* and *"nothing to draw"* are different values. `AnnotationRenderLayer` has no
  `default` arm and `PlanViewAnnotationRenderer` has a bare `break` — DELTA-2, DELTA-3.
- **A-CN-3.** ⛔ **A KIND MAY NOT BE SELECTABLE IN A VIEW THAT DOES NOT DRAW IT.**
  `DRAGGABLE_ANNOTATION_TYPES` and the render switch are two lists over one vocabulary in one file
  and MUST be derived from one source. DELTA-1.
- **A-CN-4.** The four switches MUST become **one generated matrix** with a gate that fails when a
  member of `AnnotationType` has no declared disposition per renderer — C84 §7's ruling
  (*"the authority belongs in a generated map, gated by a check that fails when a source field has
  no declared destination"*) applied to renderers instead of fields. DELTA-4.

---

## 4. PLUGIN ↔ DTO ↔ COMMAND ↔ BUILDER

### AS-IS — the nineteen palette entries, end to end

Declared `initAnnotationTools.ts:5-23` → dispatched `AnnotationRailPanel._dispatchTool`
(`apps/editor/src/ui/tools-panel/panels/AnnotationRailPanel.ts:129-208`) → `ToolManager.activateX`
(`packages/input-host/src/ToolManager.ts:237, :706-895`) → tool instance set from
`AnnotationManager` (`apps/editor/src/engine/initTools.ts:2855-2877`).

**Seventeen of nineteen route through `ToolManager`. The two that do not are named in §12.**

⭐ **THE SET COMPARISON IS THE POINT.** On 2026-08-22 the palette declared **19** ids and
`_dispatchTool` carried **19** `case` labels. **19 == 19, and a count-based check would pass forever**
while one renamed id armed nothing — the identical trap PERF13's
`tools/ga-gate/check-tool-activator-coverage.ts` records for `railing`/`handrail`. Pinned as SETS by
`apps/editor/src/ui/__tests__/binding/annotationToolActivatorCoverage.spec.ts` (6 green, 2026-08-22):
declared ⊆ dispatched, dispatched ⊆ declared, and every `toolManager.activateX` named by the panel
exists on `ToolManager`.

⚠ **ANNOTATIONS CANNOT BE ENROLLED IN THAT GATE AS WRITTEN, and that is a measurement.** Its two
subjects are `elementCreationMatrix.ts` and `ToolsAreaLayout.ts`; neither mentions any annotation id,
and all nineteen sit in that matrix's *exclusion* list `NON_CREATION_PLAN_TOOLS`
(`elementCreationMatrix.ts:148-159`). Enrolment means an **ARM C** on that gate whose subjects are
`initAnnotationTools.ts` and `AnnotationRailPanel.ts`. DELTA-5.

⚠ **TWO IDS ARE IN NEITHER LIST.** `annotation-visibility` and `annotate-view-ai` are declared in
`initAnnotationTools.ts:22-23` and appear in **neither `ELEMENT_CREATION_MATRIX` nor its exclusion
list** — precisely the gap `elementCreationMatrix.ts:144-146` claims its spec closes.

### TO-BE — normative

- **A-PL-1.** Every palette id MUST have a dispatch case and every dispatch case MUST be a declared
  id — asserted as SETS, never as counts.
- **A-PL-2.** Every id MUST appear in `ELEMENT_CREATION_MATRIX` **or** its declared exclusion list.
  Membership of neither is an unclassified control and is forbidden.
- **A-PL-3.** Four tool classes exist with **no palette id** — `MatchlineTool`, `NorthArrowTool`,
  `ScaleBarTool`, and the `LevelDatumLineBuilder` / `SectionGridLineBuilder` pair. They are reachable
  only from `planToolHandlerRegistry.ts:153-155`. This is **recorded, not condemned**: reachable from
  one surface is a real answer. But it MUST be declared, because a tool reachable from nowhere and a
  tool reachable from one place are indistinguishable to a census that only reads the rail.

---

## 5. THE BRIDGE FIELD MAP

**NOT MEASURED — and this is the largest honest gap in this contract.**

C84 §6 §5 requires *every field of the payload* accounted for as carried, transformed, or
deliberately dropped. The annotation family has **no single bridge**: twelve of nineteen tools reach
the store through `plugins/annotations/src/tools/persistAnnotation.ts:44-60`, and seven build their
command directly. A field map therefore needs **seven** traversals plus one shared, and none was run.

**What WAS measured, and it is a finding on its own:**

> `ProjectSerializer.ts:328` types the snapshot annotation slice **`any[]`**. There is **no
> `ProjectSnapshot` zod schema anywhere in `packages/schemas/src`**, and `deserialize`
> (`AnnotationStore.ts:279-281`) checks only `ann?.id` before `Object.freeze`. **Annotations are
> unvalidated on write AND on read.** The one annotation zod schema that exists
> (`packages/schemas/src/elements/Annotation.ts`) describes the flat ledger record that is **never
> persisted** — so the family's only validation is applied to its only unused representation.

### TO-BE — normative

- **A-BR-1.** The persisted annotation slice MUST acquire an L0 schema and MUST be parsed on read.
  Until then, no claim of the form *"annotations round-trip correctly"* may be made. DELTA-6.
- **A-BR-2.** The seven direct-command tools MUST be brought onto `persistAnnotation` or their field
  maps declared individually. **Neither is done.**

---

## 6. VERBS

### AS-IS — measured

| Verb group | Where | Undo | Chat |
|---|---|---|---|
| `annotation.create` / `.delete` / `.move` / `.setColor` / `.setKind` / `.setRotation` / `.setText` / `.setTextHeight` / `.update` (**9**) | `plugins/annotations/src/handlers/index.ts:14-24` | `produceCommand()` forward/inverse patch pairs | **deferred class B** |
| `dimension.create` / `.createMany` | same family | ✓ | **deferred class B** |
| `section.mark.create` | `initBusHandlers.ts:2514-2521` | ✓ `CreateSectionMarkCommand` | not classified here |
| `elevation.create` | `initBusHandlers.ts:2502-2506` | ✓ ×4 | not classified here |

**Chat reachability of the family: 0 of 19 palette entries, and it is DECLARED, not accidental.**
`ChatCommandClassification.ts:151-172` names the reason:

> *"Documentation authoring (dimensions, annotations, schedules, sections, sheets) is view- and
> pointer-driven; chat has no way to reference a specific annotation, viewport or schedule column
> yet."* — `blockedBy: 'documentation-object reference resolution in the chat context'`

⭐ **THIS IS A CORRECT REFUSAL AND IT IS RECORDED AS ONE** (§12 R-2). It is the opposite of the
family's other failures: a named, reasoned, discoverable absence. `grep -c "annotation\."
ChatCapabilityRegistry.ts` → **0**, with no entry in `CHAT_UNAVAILABLE` either — which is the one
part that is wrong, because a user asking chat to dimension a wall gets no stated reason.

### TO-BE — normative

- **A-VB-1.** Class-B deferral is upheld. It MUST additionally appear in `CHAT_UNAVAILABLE` so the
  refusal is **spoken to the user**, not only recorded in a classification table. DELTA-10.
- **A-VB-2.** No `annotation.*` verb may be published to chat until *documentation-object reference
  resolution* exists. Publishing one earlier would let chat place an annotation it cannot then name,
  move or delete — [[refusing-half-needs-its-escape-hatch]] inverted.

---

## 7. UNDO / REDO — and the per-entry census the founder asked for

### AS-IS — the nineteen entries, measured 2026-08-22

**Column commands** — *palette* `initAnnotationTools.ts:5-23` · *activates*
`AnnotationRailPanel.ts:129-208` + `ToolManager.ts:706-895` · *places* the tool's own commit site ·
*persists* `ProjectSerializer.ts:922-927` (store-membership, all 27 kinds) · *plan* / *elev-sect*
`PlanViewAnnotationRenderer.ts:828-858` (one switch serves both) · *PDF*
`SVGCompositeRenderer.ts:381` · *undo* `CommandManagerImpl.ts:493-517` · *RAC*
`ChatCommandClassification.ts:151-172`.

| # | entry | button | activates | places | persists | plan | elev/sect | PDF | undo | RAC |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Linear Dimension | ✓ | ✓ | ✓ `LinearDimensionAnnotationTool.ts:829` | ✓ | ✓ `:829` | ✓ | ✓ `:384` | ✓ | ✗ B |
| 2 | Text Note | ✓ | ✓ | ✓ `TextNoteTool.ts:135` | ✓ | ✓ `:830` | ✓ | ✓ `:425` | ✓ | ✗ B |
| 3 | Tag Element | ✓ | ✓ | ✓ `ElementTagTool.ts:204` | ✓ | ✓ `:831` | ✓ | ✓ `:449` | ✓ | ✗ B |
| 4 | Angular Dim | ✓ | ✓ | ✓ `AngularDimensionAnnotationTool.ts:225` | ✓ | ✓ `:841` | ✓ | ✓ `:391` | ✓ | ✗ B |
| 5 | **Spot Elevation** | ✓ | ✓ | ✓ `SpotElevationAnnotationTool.ts:165` | ✓ | **✗** | **✗** | ✓ `:460` | ✓ | ✗ B |
| 6 | Keynote | ✓ | ✓ | ✓ `KeynoteTool.ts:185` | ✓ | ✓ `:839` | ✓ | ✓ `:473` | ✓ | ✗ B |
| 7 | **Radius Dim** | ✓ | ✓ | ✓ `RadiusDimensionTool.ts:202` | ✓ | **✗** | **✗** | ✓ `:401` | ✓ | ✗ B |
| 8 | **Diameter Dim** | ✓ | ✓ | ✓ `DiameterDimensionTool.ts:201` | ✓ | **✗** | **✗** | ✓ `:402` | ✓ | ✗ B |
| 9 | Slope Dim | ✓ | ✓ | ✓ `SlopeDimensionTool.ts:211` | ✓ | ✓ `:846` | ✓ | ✓ `:417` | ✓ | ✗ B |
| 10 | Door Tag | ✓ | ✓ | ✓ `DoorTagTool.ts:154` | ✓ | ✓ `:832` | ✓ | ✓ `:482` | ✓ | ✗ B |
| 11 | Window Tag | ✓ | ✓ | ✓ `WindowTagTool.ts:155` | ✓ | ✓ `:833` | ✓ | ✓ `:495` | ✓ | ✗ B |
| 12 | **Level Tag** | ✓ | ✓ | ✓ `LevelTagTool.ts:152` | ✓ | **✗** | **✗** | ✓ `:508` | ✓ | ✗ B |
| 13 | Grid Bubble | ✓ | ✓ | ✓ `GridBubbleTool.ts:107` **in a loop** | ✓ | ✓ `:837` | ✓ | ✓ `:522` | **⚠ N entries** | ✗ B |
| 14 | Section Mark | ✓ | ✓ | ✓ `SectionMarkTool.ts:155` | ✓ | ✓ `:843` | ✓ | ✓ `:537` | ✓ | ✗ B |
| 15 | Elevation Mark | ✓ | ✓ | ✓ `ElevationMarkTool.ts:152` | ✓ | ✓ `:844` | ✓ | ✓ `:553` | **⚠ 4 entries** | ✗ B |
| 16 | Callout Detail | ✓ | ✓ | ⚠ **two different records** — see below | ✓ | ✓ `:848` | ✓ | ✓ `:571` | ✓ | ✗ B |
| 17 | Revision Cloud | ✓ | ✓ | ✓ `RevisionCloudTool.ts:169` | ✓ | ✓ `:849` | ✓ | ✓ `:589` | ✓ | ✗ B |
| 18 | **Ann. Visibility** | ✓ | ✓ (opens a panel) | n/a | ✓ `ProjectSerializer.ts:938-941` | n/a | n/a | n/a | **✗ NO COMMAND** | ✗ |
| 19 | **AI Annotate** | ✓ | ✓ (fires a macro) | ⚠ **4 of 27 kinds** | ✓ | partial | partial | partial | ✓ per child | ✗ |

**Every ✗ in this table is UNREACHABLE or PARTIAL, never ABSENT** — the command, the tool and the
store all exist in each case. Per C01 §6 rule 6 that matters: **rows 5, 7, 8 and 12 are a
three-line render case each, not a build.**

### A-U-1 — the repo-wide undo inequality
`CommandManagerImpl.execute()` (`:301`) pushes history at `:493-517` unless `nonUndoable`. **No
annotation command sets it** (grep over `plugins/annotations/src` → only the interface declaration,
`legacy-command-protocol.ts:72`). Every annotation command implements a real inverse:
`CreateAnnotationCommand.ts:57-62` → `store.remove(id)`; likewise `CreateSectionMarkCommand.ts:99-107`,
`CreateElevationMarkCommand.ts:205`, `CreateCalloutDetailCommand.ts:91`,
`CreateManyAnnotationsCommand.ts:90`, `DeleteAnnotationCommand.ts:55`, `UpdateAnnotationCommand.ts:58`,
`LockAnnotationCommand.ts:74`, `UpdateAnnotationPresentationCommand.ts:113`.

### A-U-2 — ⛔ ONE ENTRY OF NINETEEN HAS NO COMMAND AT ALL
**Ann. Visibility.** `AnnotationVisibilityPanel.ts:129-131` calls `this._store.show()` / `.hide()`
**directly**. The state **is** persisted (`ProjectSerializer.ts:938-941`) and restored
(`ProjectLoader.ts:1434-1444`). **So hiding an annotation survives save and load, and Ctrl+Z cannot
reverse it.** That is a P6 breach (*commands are the only mutation path*) with a durability
guarantee attached, which is the worst combination available: the change is permanent and
un-undoable.

### A-U-3 — TWO ENTRIES BREAK ONE-GESTURE-ONE-UNDO
`GridBubbleTool.ts:75-112` auto-places N bubbles as N separate `CreateAnnotationCommand`s.
`ElevationPlanToolHandler.ts:109` fires **4** `CreateElevationMarkCommand`s (N/S/E/W). Both against
the stated contract three files away: *"one user click = exactly ONE undo entry"*
(`AnnotationPlanToolHandlers.ts:67`). A user who places a grid must press Ctrl+Z once per bubble.

### TO-BE — normative

- **A-U-4.** Annotation visibility MUST be a command. Until it is, the panel MUST say that the
  change is not undoable — a durable, un-undoable, silent mutation is the one state that may not
  ship unlabelled. DELTA-11.
- **A-U-5.** A tool that places N records for one gesture MUST use `CreateManyAnnotationsCommand`
  (it exists, `:90`, and already has the inverse). DELTA-12.

---

## 8. CASCADES

### AS-IS — measured

| Mutation | Cascade | Reversed by undo? |
|---|---|---|
| `section-mark` place | mints an annotation **+ a `ViewDefinition` + an intent** (`CreateSectionMarkCommand.ts:62-90`) | ✓ — `:99-107` removes all three |
| `elevation-mark` place (plan) | **4** marks + 4 `ViewDefinition`s | ✓ per entry, ✗ as one gesture (A-U-3) |
| `callout-detail` place (3-D) | annotation **+ a detail `ViewDefinition`** (`CreateCalloutDetailCommand.ts:62-90`) | ✓ |
| `callout-detail` place (**plan**) | plain `CreateAnnotationCommand`, `{ calloutLabel }`, **NO linked view** (`AnnotationPlanToolHandlers.ts:1102-1106`) | ✓ |
| any create | `annotationDependencyGraph.rebuild()` on load (`ProjectLoader.ts:1456-1471`) | n/a |

⚠ **`callout-detail` PRODUCES TWO DIFFERENT RECORDS DEPENDING ON WHICH SURFACE PLACED IT.** Same
palette entry, same tool id, same persisted `type` — one carries a detail view and one does not. A
user cannot tell which they made.

⚠ **Three restore steps are wrapped in `try/catch` that logs `(non-fatal)` and continues**
(`ProjectLoader.ts:1421-1454` — constraints, visibility, OBC map). **A failure there is silent to the
user**, and the annotations still load, so the drawing appears complete with its constraints gone.

### TO-BE — normative

- **A-CA-1.** One tool id MUST produce one record shape. DELTA-13.
- **A-CA-2.** A non-fatal restore failure MUST be surfaced as a load warning naming what was lost.
  §CONTEXT-DATA-HONESTY: a caught exception and a clean load may not present identically.

---

## 9. VOCABULARIES

Covered in §1 (four vocabularies) and §3 (per-renderer subsets). The additional finding:

**`AnnotateViewCommand._specToAnnotation` handles 4 of 27 kinds** — `linear-dim`, `text-note`,
`tag`, `spot-elevation` (`:315, :338, :350, :371`) — and `return null` otherwise (`:383`). The caller
does `if (!ann) continue` (`:284`) with **no user-visible refusal**. It also mints
`crypto.randomUUID()` (`:310`) rather than the branded `annotation_<ULID>` from `createId('annotation')`
— the exact defect `AnnotationPlanToolHandlers.ts:45-49` was written to eliminate elsewhere.

- **A-VC-1.** AI Annotate MUST report the kinds it declined. Silently dropping 23 of 27 while
  reporting *"AI has annotated the view"* is a false success. DELTA-14.

---

## 10. GEOMETRY

Annotation geometry is `geometry2D.modelPoints` on the canonical record, projected per view. There is
**no Stack A / Stack B rivalry** for this family: there is no kernel producer for annotations.

⚠ **NOT MEASURED:** whether the four renderers agree on the projection of the same `modelPoints`
under the same view transform. They implement it independently (`PlanViewAnnotationRenderer`,
`AnnotationRenderLayer` via `camera.project`, `SVGCompositeRenderer` via `sx`/`sy`,
`AnnotationDxfBridge`). **A positive control across all four has never been run**, and C09 §4.5.1 ¶4
is explicit that only a positive control proves a composed output moves. DELTA-15.

---

## 11. THE DELTA

| # | Item | Invariant | Proof required | Cost |
|---|---|---|---|---|
| 1 | Draw `spot-elevation`, `radius-dim`, `diameter-dim`, `level-tag` in `PlanViewAnnotationRenderer` | A-CN-3 | place each in a plan AND an elevation, assert drawn | **3 lines each** — WIRE |
| 2 | `PlanViewAnnotationRenderer` unknown-kind arm reports | A-CN-2 | a dropped kind is named | small |
| 3 | `AnnotationRenderLayer` acquires a `default` arm | A-CN-2 | ditto | small |
| 4 | ONE generated kind×renderer matrix + gate | A-CN-4 | gate fails on an undeclared member | medium |
| 5 | ARM C on `check-tool-activator-coverage.ts` for the palette | A-PL-1 | set comparison, not a count | small |
| 6 | L0 schema for the persisted annotation slice; parse on read | A-BR-1 | a corrupt record is refused | medium |
| 7 | Rename `DimensionElement.type` off the tool-id spelling | A-ID-3 | no string is both a tool id and a kind | small |
| 8 | Measure external readers of the flat store, then retire its write | A-ST-2 | reader census incl. plugin SDK | small |
| 9 | Establish which persistence pair the app builds | C85 vs C101 disagree | build-graph trace | small |
| 10 | `CHAT_UNAVAILABLE` entries for `annotation.*` | A-VB-1 | chat states the reason | small |
| 11 | `annotation-visibility` becomes a command | A-U-4 | Ctrl+Z reverses a hide | medium |
| 12 | Grid bubble / elevation mark → `CreateManyAnnotationsCommand` | A-U-5 | one gesture, one Ctrl+Z | small |
| 13 | `callout-detail` produces one record shape | A-CA-1 | plan and 3-D agree | small |
| 14 | AI Annotate reports declined kinds | A-VC-1 | the toast names them | small |
| 15 | Positive control: four renderers, one `modelPoints` | §10 | all four move together | medium |

---

## 12. REFUSALS

**R-1 — the 11-member schema `kind` enum refuses 16 real kinds, and it is NOT a documented refusal.**
`CreateAnnotationHandler.canExecute` (`plugins/annotations/src/handlers/CreateAnnotation.ts:38-40`)
rejects any `kind` outside the schema union. The file **states its own cost** at `:64-66`: *"its
`kind` enum has 11 members against the family's 28 … that rejection is why grid bubbles placed from
the plan grid tool were never created."* A rich-payload passthrough at `:68-76` is the escape hatch.
**This is a refusal that nobody chose** — it is a subset that was never labelled as one, and A-ID-1
exists to end it.

**R-2 — chat cannot author annotations, deliberately.** `ChatCommandClassification.ts:151-172`,
class B, `blockedBy: 'documentation-object reference resolution in the chat context'`. ⭐ **This is
the family's one exemplary refusal**: named, reasoned, and attached to the condition that would lift
it. It is upheld by A-VB-2. Its only fault is that it is not spoken to the user (DELTA-10).

**R-3 — `annotation-visibility` and `annotate-view-ai` are not tools, deliberately.** One opens a
panel; one fires a macro. Neither arms a pointer gesture, so `ToolManager` — which disables
`SelectionManager` on activate — is the wrong owner for both. Recorded so a future census does not
read them as unwired.

**R-4 — `MatchlineTool`, `NorthArrowTool`, `ScaleBarTool` are reachable from the plan registry only**
(`planToolHandlerRegistry.ts:153-155`), not from the annotation rail. Recorded per A-PL-3.

### Explicitly NOT REFUSED, and that is a finding

- **Nothing refuses an annotation whose kind no renderer draws.** A user can place a `north-arrow`
  in a 3-D view and it is stored, persisted and invisible everywhere except plan. There is no
  validity gate — cf. [C83](C83-SPATIAL-VALIDITY-AND-DESIGN-LOGIC.md), which governs exactly this
  question for model elements and has no annotation arm.
- **Nothing refuses a malformed persisted annotation** (§5).

---

## NOT MEASURED — the honest register for this family

⛔ **These are gaps, not clearances** (C84 EI-1b).

1. **Every "renders in plan / PDF" cell above is a SOURCE reading, not a screen.** The switch has a
   case; that the case draws something correct **has not been verified in a browser**. Lane ANNO15
   had no browser. **No cell in §7 may be read as visual confirmation.**
2. **The bridge field map (§5)** — eight traversals, none run.
3. **Renderer projection agreement (§10)** — no positive control.
4. **Which persistence pair the app builds** — C85 and C101 measured different ones.
5. **External readers of the flat ledger store** — repo-internal count is 0; plugin SDK / marketplace
   not swept.
6. **`annotation.*` verb liveness.** `tools/ga-gate/check-verb-liveness.ts:115-130` carries the seven
   annotation verbs on a **GROW-ONLY exemption list** — so the gate that would report them dead is
   the gate that exempts them.
7. **DXF fidelity.** The bridge's ~14 cases were enumerated; whether the emitted entities are
   correct DXF was not checked.
8. **Sheet-level annotation crop.** `SheetViewport` carries a per-viewport annotation crop
   (`SheetDefinitionTypes.ts:99`); whether it is honoured by `ViewportSvgComposer` is NOT MEASURED.

---

## Appendix — what this contract CONFIRMS, REFINES or REFUTES elsewhere

- **CONFIRMS C84 §7.** Four hand-written switches over one enum, nine disagreements, zero detection.
  This is the *"hand-written named subset"* mechanism, and the fix C84 prescribes — a generated map
  with a gate — is DELTA-4.
- **CONFIRMS C84 §8.d, by contrast.** `assertNotARead()` is what §8.d says a comment cannot be.
- **REFINES [C82](C82-RIBBON-CAPABILITY-SURFACE.md).** C82's three states (WIRED / DISABLED WITH
  REASON / ABSENT) are about *dispatch*. This family shows a **fourth**: a control that dispatches, a
  command that executes, a record that persists — and **nothing on the drawing**. C82 cannot see it,
  because everything C82 measures is green.
- **REFUTES the reading that an activation gate would have caught this family's defects.** All
  nineteen activate. Every defect here is downstream of activation.
