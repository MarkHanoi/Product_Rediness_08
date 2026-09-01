# LANE F — THE TWO EXISTING EDITORS AND THE VIEWPORT

**Archaeology for** `docs/01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md` **§77 PHASE 0**,
cluster: **§57–62 (editor UX / viewport / existing editors)** and **§63 (the Window vertical slice)**.
**Date:** 2026-09-01 · **Rule obeyed:** §1 — *no code was written, no production file modified.*
**Standing lesson applied throughout:** `[[authored-but-unwired-is-the-bottleneck]]` /
`[[committed-is-not-reachable]]` — every capability below is marked REACHABLE or NOT REACHABLE with the
static link that proves it.

---

## §F.0 — THE HEADLINE, BEFORE THE DETAIL

Three findings dominate this lane and each of them changes the plan in §81:

1. **There is no file called `WindowEditor`.** The grep fails (quoted in §F.3). What the founder calls
   "the Window Editor" is **not one editor** — it is a **four-surface federation**: a *mode picker*
   (`WindowModePicker.ts`), a *parametric property section* (`WindowSection.ts`), a *type-authoring
   modal registry* (`ElementTypeAuthoringRegistry.ts`), and an *elevation outline dialog*
   (`WindowOutlineEditorDialog.ts`). Naming it as one editor is the first thing a newcomer gets wrong.
2. **§57–62's central instruction — "the Wall Profile Editor's profile/sketch functionality becomes
   generic infrastructure" — HAS ALREADY BEEN DONE.** It happened on 2026-08-24/§OUTLINE81, and the
   generic surface is `apps/editor/src/ui/ElevationOutlineSurface.ts`, whose own header says it was
   *"EXTRACTED from `WallProfileEditor.ts` so the wall profile modal and the window outline section are
   two CALLERS of one surface rather than two implementations of one idea."* **Proposing this work is
   the single worst outcome this lane can produce.** It exists, it is wired, three callers use it.
3. **A far larger prior art exists that the spec does not mention at all: `apps/component-editor`** —
   a standalone app with a sketch canvas, five constraint commands, a solver runner, reference planes,
   a solid store, an AI tool registry with an approval queue, and a marketplace publish/signing flow.
   §77 phases 1–4 must be written against THIS, not against a blank page. (Full treatment is another
   lane's cluster; §F.6 records only the parts that collide with mine.)

---

## §F.1 — WHAT EXISTS · SUBSYSTEM BY SUBSYSTEM

### F.1.1 — "THE WINDOW EDITOR" IS FOUR SURFACES, NOT ONE

**⛔ The name is a trap. There is no `WindowEditor`.** The search that establishes it:

```
$ grep -rl "WindowEditor" apps/editor/src packages/geometry-window plugins/window --include=*.ts
(no output)
```

The founder's "existing Window Editor" (§57–62) is this federation:

| # | Surface | Authority file | LoC | What it is | Reachable? |
|---|---|---|---|---|---|
| 1 | **Placement mode bar** | `apps/editor/src/ui/WindowModePicker.ts` | 278 | Live while the window tool runs. Two axes: leaf count (S/D) and **opening profile** pills (`A` cycles). | LIVE |
| 2 | **Instance parameter surface** | `packages/geometry-window/src/WindowSection.ts` | 744 | The property-panel section for a **placed** window. Every field dispatches `UpdateWindowParameterCommand` on change — no draft/Apply. | LIVE — statically pinned, see below |
| 3 | **Type authoring modal** | `apps/editor/src/ui/property-panel/FinishTypeEditorModal.ts` | 1049 | The **generic** `finish-set` type editor (door + window). Finish slots + glazing + **3-D showroom** + **AI chat strip** + **elevation outline surface**. | LIVE via `FinishTypeAuthoringActions.ts:132` |
| 4 | **Instance outline dialog** | `apps/editor/src/ui/WindowOutlineEditorDialog.ts` | 201 | "Edit outline…" for a placed window: free-form ring at the instance's true `width × height`. | LIVE — `PropertyPanelBodyRenderer.ts:42` |

**The wire that proves #2 and #4 are reachable** (this repo demands the static link, not the file's
existence — `[[committed-is-not-reachable]]`):

- `apps/editor/src/ui/property-panel/PropertyPanelBodyRenderer.ts:37` — `import { buildWindowSection, setWindowOutlineEditorOpener } from '@pryzm/geometry-window';`
- `apps/editor/src/ui/property-panel/PropertyPanelBodyRenderer.ts:42` — `setWindowOutlineEditorOpener(openWindowOutlineEditorDialog);`
- and it is **asserted from source** by `apps/editor/src/ui/property-panel/__tests__/openingProfilePanelReachability.spec.ts:140,145`, which greps the importer's own text. That test exists because the port pattern used here (`setWindowSectionCommandManager`, `setWindowOutlineEditorOpener`) is a **dead-feature generator** when nobody supplies the implementation; `WindowSection.ts:63-66` says so in as many words.

### F.1.2 — THE PROFILE ARCHITECTURE (§4.4, §67) — `OpeningProfile.ts` IS THE ONE PRODUCER

**Authority:** `packages/geometry-wall/src/OpeningProfile.ts` (1015 LoC) · **Contract:** `C86 §10.1`
(+ `C86 §9` for the vocabulary) · **Spec:** `docs/03-execution/specs/SPEC-WINDOW-CUSTOM-OUTLINE.md`.

The shapes the founder listed in §57–62 map exactly, and there are **five, not four**
(`OpeningProfile.ts:82-95`):

```ts
export type OpeningProfileKind =
    | 'rectangular' | 'round-arch' | 'segmental-arch' | 'circular' | 'custom';
```

- **rectangular / arc** → `round-arch` (semicircular, r = width/2) and `segmental-arch` (shallow, rise = `SEGMENTAL_RISE_RATIO` = 1/6 of span).
- **polygon / rhomboid** → both are the **`'custom'`** kind: a free-form ring authored in elevation, carried on the companion field `customOutline`, with **presets** (`OPENING_OUTLINE_PRESET_IDS` in `CustomOutline.ts`, 359 LoC) — a rhomboid is a *preset*, not a shape class.
- The header states the design law spec §17–20 is asking for:
  *"This file is deliberately THREE-free … It takes plain numbers and returns plain numbers. That is what lets the outline be unit-tested without a renderer, **hashed for cache invalidation**, and consumed identically by the `THREE.Shape` arm, the gasket arm and **(one day) the kernel producer**."* (`OpeningProfile.ts:20-25`)
- **`C86 §10.1 PR-1` is binding: every wall-body arm consumes the outline this function returns. ⛔ No arm may re-derive an arc.** (`OpeningProfile.ts:14-15`)
- It is **honest about refusal**: the five-arm ruling table (`:29-36`) records arm D (curved wall) as **REFUSES** and arm F (single-volume CSG) as **PARKED, default OFF**. That is spec §71–73's "GeometryStatus = Invalid with structured diagnostics" behaviour, already practised.
- The **kind is an AXIS with a carrier**, and the rule is enforced twice — Zod `superRefine` on the runtime record (`WindowTypes.ts:190-207`) and on the host `Opening` record — so `'custom'` without a ring, or a ring without `'custom'`, cannot be persisted.

**Verdict:** a canonical, kernel-free, hashable 2-D profile producer with a declared consumer law.
The single strongest asset in this lane for spec §18/§20.

### F.1.3 — THE WALL PROFILE EDITOR, AND THE FACT THAT §57–62's ASK IS ALREADY DONE

**⭐ THE MOST IMPORTANT FINDING IN LANE F.** §57–62 says: *"likewise the Wall Profile Editor, whose
profile/sketch functionality becomes generic infrastructure."*

**It became generic infrastructure on 2026-08-25**, ratified by the founder, under lane OUTLINE82, as
**`C86 §10.6`** + **`docs/02-decisions/adrs/ADR-0373-window-custom-outline-authored-in-elevation-via-the-wall-profile-editor.md`**.
`docs/02-decisions/contracts/C86-ELEMENT-WALL-OPENING.md:1686` is titled:

> ### §10.6 — **THE AUTHORING TECHNOLOGY FOR A FREE-FORM OUTLINE IS THE WALL PROFILE EDITOR, REUSED**

and its rule 4 reads:

> *"**L7 — generalise the SURFACE.** The SVG surface plus its `makeDraggable`/`makeResizable` wiring is EXTRACTED so the wall profile modal and the window outline section are two CALLERS of one surface … Mounted from `FinishTypeEditorModal.ts` next to the grid block (`:606-651`), declared in `ElementTypeAuthoringRegistry.ts` as capability `finishEditor.outline` — a declaration, never a family branch (C65 §3.5)."*

The three-file split that resulted is **exactly the L2-model / L7-surface separation the master spec
wants**, and it is done:

| Layer | File | LoC | Holds |
|---|---|---|---|
| **L2 model — subject/port** | `packages/geometry-wall/src/WallProfileEditor.ts` | 123 | `WallProfileEditorSubject` (`:49`), `WallProfileEditorCallbacks` (`:59`), `WallProfileEditorPort` (`:86`), `WALL_PROFILE_SNAP_M = 0.05` (`:104`), `wallProfileEditorSnap` (`:108`), `wallProfileEditorRectangle` (`:117`). **NO THREE, NO STORE, NO COMMAND BUS, NO DOM.** |
| **L2 model — sketch modes** | `packages/geometry-wall/src/OutlineAuthoring.ts` | 216 | Click-to-place polyline, 3-click arc, **absolute ortho**, and the metres↔unit-ring maps. Adapts the boundary-line tool's `{x,z}` primitives into the elevation `{u,v}` frame — *"same functions, a label change, **zero copied maths**."* |
| **L7 surface — generic SVG canvas** | `apps/editor/src/ui/ElevationOutlineSurface.ts` | 389 | The one drawing surface. **Three callers.** |

`ElevationOutlineSurface.ts:4-7` states it itself:

> *"THE one SVG elevation-drawing surface, **EXTRACTED from `WallProfileEditor.ts` so the wall profile modal and the window outline section are two CALLERS of one surface rather than two implementations of one idea.** Everything dimensional here is the wall profile editor's own proven machinery, moved verbatim."*

**Its dimensional contract is stated once and is invertible** (`ElevationOutlineSurface.ts:9-15`) —
reusable verbatim for any elevation-authoring surface in a universal editor:

```
x = pad + u * scale                 u = (x - pad) / scale
y = pad + (height - v) * scale      v = height - (y - pad) / scale
```
> *"`scale` is ONE number for BOTH axes, so the drawing's aspect ratio IS the subject's at every size … `toModel(toPx(p)) === p`. **RESIZING CHANGES `scale` AND `pad` AND NOTHING ELSE — the ring is metres, never pixels.**"*

**Editing operations it already ships:** vertex drag (snap unless Shift), midpoint insert,
double-click delete with a min-vertex guard, `refitTo` as pure arithmetic, plus the three modes
`select | polyline | arc` and **absolute ORTHO** (the founder's 2026-08-24 ruling, decided in the L2
helper `outlinePlacePoint` *"so the surface cannot have its own opinion"*).

**The three callers, all reachable:**
1. `apps/editor/src/ui/WallProfileEditor.ts` (L7 panel, 410 LoC) — wired at `apps/editor/src/engine/initTools.ts:894` → `createProfileEditor: () => new WallProfileEditor()`; entry is the **"Edit Profile"** button in `ContextualEditBar.ts:373-378`, whose visibility is **derived from tool capability, not hard-coded** (`_profileEditToolFor()`, `:158-166`) precisely so it can never become a dead button (`§FIX-DEAD-EDIT-PROFILE-BUTTON`).
2. `apps/editor/src/ui/property-panel/FinishTypeEditorModal.ts` — the **type-level** outline template.
3. `apps/editor/src/ui/WindowOutlineEditorDialog.ts` — the **instance-level** outline.

**Also already true and directly serving §61:** the P6 split is kept rigorously —
*"NO STORE, NO COMMAND BUS, NO THREE, NO rAF. The surface hands rings to callbacks; the CALLER
decides what a commit means."* (`ElevationOutlineSurface.ts:26-27`)

### F.1.4 — THE 3-D VIEWPORT: THERE IS NO "WINDOW EDITOR 3-D VIEWPORT" IN THE SENSE §57–62 IMPLIES

§57–62 says *"the existing Window Editor 3D viewport is reused/evolved (orbit, pan, zoom, section,
isolate, selection incl. face/edge/feature, parameter and dimension manipulation, material preview,
host preview)."* **Measured, that sentence describes two different things, and neither has that
feature set.**

**(a) The type editor's 3-D showroom** — `apps/editor/src/ui/element-preview/` (1920 LoC total):

| File | LoC | What it does |
|---|---|---|
| `ElementPreviewRenderer.ts` | 817 | **ONE offscreen WebGL context for every element preview in the application, ever.** Panels own a 2-D canvas; this blits into it. |
| `ElementPreviewCanvas.ts` | 366 | The mountable widget. `mountElementPreview(host, opts) -> { setSubject, dispose }`. |
| `OpeningPreviewSubject.ts` | 629 | The **THREE-free** declarative subject: axis-aligned boxes in metres, each **naming a material by `materialId`**. |

**Capability, measured:**
- **orbit** — yes. Yaw/pitch drag (`ElementPreviewCanvas.ts:280-281`); arrow keys too (`:308-311`).
- **zoom** — yes. Wheel + `+`/`-`, clamped `[0.45, 3]` (`:301`, `:312-313`).
- **pan** — **NO.** `OrbitState` is `{ yaw, pitch, zoom }` and nothing else (`ElementPreviewRenderer.ts:82-89`).
- **section / isolate / selection of any kind** — **NO.** `grep -n "raycast\|Raycaster" apps/editor/src/ui/element-preview/*.ts` returns no picking code. The preview is a *blit of an offscreen render*; there is nothing in it to click.
- **material preview** — yes, and C100-governed: `resolvePartMaterial` walks C100 §2.1's ladder and *"an id that names nothing renders the designated UNRESOLVED colour — deliberately not a plausible building material"* (`ElementPreviewRenderer.ts:47-50`).
- **host preview** — **NO**, and it is stated rather than implied (`OpeningPreviewSubject.ts:20-24`): *"this is a **schematic massing of the type**, not a pixel-identical copy of the placed element … It does not show the wall reveal, the swing arc, the ironmongery or the glazing bars' rebate profile."*

⭐ **Two architectural rules here are worth more than the widget itself**, and transfer directly to a
universal-editor viewport:
- **P3 compliance without an animation loop.** *"THERE IS NO ANIMATION LOOP HERE AND THERE MUST NEVER BE ONE … an idle preview costs **zero** frames, zero draw calls and zero GPU time. It is not 'cheap'; it is not running."* (`ElementPreviewRenderer.ts:24-35`)
- **The one-context rule, with its reason.** *"browsers cap live WebGL contexts (commonly 8–16) and silently kill the OLDEST when a new one is created. **In this application the oldest is THE MAIN VIEWPORT.**"* (`:11-16`) — any universal editor that wants N viewports must obey this.

**(b) The main 3-D viewport** — `packages/renderer/src/Renderer.ts` + `packages/renderer/src/CameraController.ts`,
bootstrapped by `apps/editor/src/engine/initScene.ts`. `CameraController.ts:8-9`: *"Left-button drag =
orbit; right-button drag = pan; wheel = zoom."* Isolate exists
(`packages/renderer-three/src/IsolationAnimator.ts`); section exists (`plugins/section-view`).
**But its selection is ELEMENT-level only** — see next.

### F.1.5 — FACE / EDGE / FEATURE SELECTION — AUTHORED IN THE TYPE, CONSUMED BY NOBODY

`packages/picking/src/types.ts:59-70`:

```ts
/** Result of a single pick.  `faceIndex` is populated by BVH (it falls out
 *  of the raycast); gpu-pick can populate it via a second MRT slot — that
 *  optimisation lands when downstream tooling needs face-resolution. */
export interface PickResult {
  readonly elementId: ElementId;
  readonly elementKind: ElementKind;
  ...
  readonly faceIndex?: number;
}
```

It is **produced** — `packages/picking/src/bvh-pick.ts:206,225,235`. It is **consumed nowhere**:

```
$ grep -rn "faceIndex" apps/editor/src   → No matches found
$ grep -rn "faceIndex" plugins           → No matches found
```

**So: face selection is AUTHORED-BUT-UNREACHABLE at the seam, and edge/feature selection does not
exist at all.** There is no selection *mode* and no sub-object selection state —
`grep -rn "faceIndex|selectedFace|face-select|edge-select|selectionMode" packages/` returns exactly
two files, both inside `packages/picking` itself. `plugins/selection` (`store.ts`, `handlers/Select.ts`)
is an element-id set, nothing finer.

⚠ **And note what spec §20 says about this**: *"no canonical `Face 381`/`Edge 27` references."*
`faceIndex` is a transient topology index. If the universal editor consumes it as **identity** it
violates §7 and §20 directly. The right reading of this gap is *"sub-object PICKING is missing, and
sub-object IDENTITY must not be built on the thing that is missing."*

### F.1.6 — THE TYPE SYSTEM (§6, §12, §23–25) — `Definition → Type → Instance` EXISTS AS TWO OF THREE

**Authority:** `packages/geometry-window/src/WindowSystemTypeStore.ts` (395) ·
`packages/geometry-window/src/WindowDimensions.ts` · `packages/geometry-window/src/WindowTypeChange.ts` (146) ·
**Contract:** `C65-ELEMENT-TYPE-SYSTEM.md`, `C15-HOSTED-ELEMENT-CONTRACT.md`, `C11 §3`.

- **Type ← → Instance is real and complete.** `WindowSystemType` carries `isBuiltIn` (built-ins are immutable, `:347`), `dimensions` (a full member-size block: frame, sash, mullion, transom, glazing, rebate, sill), finish slots, and — since §OUTLINE81 D6 — a type-level `customOutline` **template** (`:154`).
- **The resolution ladder the spec's §12 demands already exists, in one function.** `resolveWindowDimensions()` (`WindowDimensions.ts:262`) resolves **instance → type → canonical default**, and its own comment states the ordering rule as law:
  > *"a PLACED window passes its record → `win.width` is set → it WINS. **The instance is the strongest authority** (the user may have resized it). a TOOL about to create one passes only `{ systemTypeId, windowType }` → no width exists yet → we fall through to the TYPE's standard opening, then to the canonical default. So the plan tool and the 3D tool cannot land on different widths … **Parity BY CONSTRUCTION, not by convention (C11 §3).**"*
  The same resolver is called by placement, by the plan symbol, and by the 3-D showroom — *"preview and placement MUST both call this so `preview ≡ placed door`"* (L-127).
- **Type change propagates, with an explicit override boundary.** `WindowTypeChange.ts:47-52` declares `PRESERVED_ON_TYPE_CHANGE = { id, openingId, wallId, offset, width, height, sillHeight, … }` and re-derives everything else from the target type by **re-running the record through the one creation chokepoint** (`buildWindowStoreRecord()`), *not* by patching fields. The reasoning is spec §12's, in the repo's own words: *"choosing a different window type and keeping the previous type's pane grid is precisely the 'type in name only' outcome the dropdown exists to avoid."*
- **Authoring is DECLARED, never inferred.** `apps/editor/src/ui/property-panel/ElementTypeAuthoringRegistry.ts` (385) is the model to copy for spec §59's category modal. It refuses to offer "New type…" for a family whose store is not `ProjectScopeRegistry`-registered (C13) or whose types do not round-trip `ProjectSerializer → ProjectLoader` (C05), because *"offering 'New type…' for those families would ship a control that appears to work and quietly loses the user's work at the next save."* Its `editorKind` union is already the universal-editor seed: `'layer-stack'` (wall/slab/floor/ceiling) and `'finish-set'` (door/window), with the explicit rule *"specialise in the declaration, never with a family branch (C65 §3.5)."*

**⛔ THE MISSING THIRD LEVEL:** there is **no `ComponentDefinition`**. PRYZM has `Type → Instance`.
The spec's §6 `ComponentDefinition → ComponentType → ComponentInstance` has no first term here: a
`WindowSystemType` is a *named bag of defaults*, not a *reusable design intent that generates
geometry*. The generator is hard-coded TypeScript (`WindowBuilder.ts`, 2086 LoC). That is the
single largest structural gap this lane found, and it is §F.3's headline.

### F.1.7 — AI/RAC ALREADY REACHES BOTH EDITORS (§39–45, §76 gate D)

This is not a gap. Two live surfaces:

- **`apps/editor/src/ui/property-panel/FinishTypeChatStrip.ts` (242 LoC)** — chat *inside* the window/door
  type editor. The founder's ask was *"the user could either do it via UI or chat"*, and the file's
  own header says the word **either** decided its shape: *"two ways in, ONE draft, one validation,
  one command, one read-back."* It **dispatches no command of its own** — *"Every ask lands as an
  edit to the SAME draft object the controls above edit"*, and Create still travels
  `FinishTypeAuthoringActions.onSave → bus.executeCommand('elementType.create')`. **That is spec §5
  and §76 gate D, already implemented and already reasoned about.** It also refuses two tempting
  shortcuts by name (registering as `chatPromptHost`; calling `tryHandleZeroToken`) with the reason
  written down.
- **`packages/ai-host/src/intents/OpeningShapeVocabulary.ts`** — the shape axis's *language* half.
  Its header is the cleanest statement in the repo of the distinction §39–45 needs:
  > *"the capability existed, the vocabulary did not … The founder's standing direction is **open language, never a narrowed vocabulary**: a capability that answers only the sentences someone remembered to type into a table is a capability that refuses most of its own users."*
  It ships a **token vocabulary with composition rules**, not a phrase list.
  Siblings: `OpeningShapeFamilies.ts`, `HostedOpeningScope.ts`, `FacadeOpeningProgram.ts`.

### F.1.8 — PERSISTENCE, MATERIALS, IFC — the window slice's back half

- **Persistence.** `WindowOpeningSchema` (Zod) is the persisted shape;
  `apps/editor/src/engine/persistence/hostedSystemTypeCodec.ts` (104) round-trips custom door/window
  types through `ProjectSerializer`/`ProjectLoader` via **one shared codec** (the registry demands
  this: *"a hand-written field list on one side is how `function` was silently dropped"*).
- **Materials are semantic, and governed.** `C100-MASTER-MATERIAL-DATABASE.md`;
  `packages/core-app-model/src/materialLibrary.ts`, `materials/MaterialResolver.ts`,
  `stores/UserMaterialStore.ts`. C100 §2.1: **a part REFERENCES a material by `materialId`**; a hex is
  the legacy/override case, marked as such, *"never as a rival authority"*
  (`OpeningPreviewSubject.ts:35-38`). §L-7701/§L-7702 record the exact defect spec §23 warns about —
  a free-text "Finish Material" box writing a display string — and its fix, a real library picker.
- **IFC is already an outbound mapping, not the internal model** (spec §29–33, §70):
  `plugins/ifc-export/src/exporters/window.ts`, `pset-window-common.ts`, and — notably —
  `opening-profile-declaration.ts`, i.e. the profile axis reaches IFC. Inbound:
  `packages/file-format/src/export/ifc/readers/WindowDoorReader.ts`.

### F.1.9 — THE PRIOR ART THE SPEC DOES NOT MENTION: `apps/component-editor`

`apps/component-editor/package.json` describes itself as *"PRYZM 2 — Family Creator standalone SPA.
**The Revit-Family-Editor analogue**: 2D parametric profile sketcher → constraint solver → 3D
extrude/sweep/loft/revolve → parameter table → typed authoring of `.pryzm-family` artefacts"*, with
an 8-sprint roadmap **S52 → S59**. What is actually on disk (~2400 LoC of source):

| Area | Files | State |
|---|---|---|
| Sketch | `SketchCanvas.ts` (298), `sketchRender.ts`, `hitTest.ts`, `snap.ts`, `entities.ts`, `transform.ts`, tools: Line / Arc / Circle / Rectangle / Fillet / Trim / Select | Real 2-D sketcher |
| Constraints | `commands/constraint/{addCoincident,addDistance,addFixed,addParallel,addPerpendicular}.ts`, `constraintStore.ts`, `buildConstraintSet.ts`, `solverRunner.ts` (186) | 5 constraint kinds, debounced solve loop |
| Reference planes | `referencePlaneStore.ts` (161), `commands/referencePlane/` | Exists (spec §14–15) |
| Solids | `solidStore.ts` (187), `commands/solid/` | **Records `SolidProducerKind = 'extrude' \| 'sweep' \| 'revolve' \| 'loft' \| 'boolean'` and an LOD bitmask — and produces NO geometry.** |
| AI | `ai/{aiHostBridge,approvalQueue,toolRegistry,types}.ts` | Tool registry + approval queue |
| Marketplace | `marketplace/{publishFlow,signing}.ts` | Publish + signing |
| Family artefact | `packages/file-format/src/family-{schema,types,pack,unpack}.ts` + `family-migrations/` | Real: `FamilyManifestSchema`, `FamilyIfcEntitySchema` (11 IFC entities), `FamilyCategorySchema` (8 categories), parameter schema, **migration ops** (`add-parameter`, `change-parameter-type`) |

**⛔ AND IT IS NOT REACHABLE.** `apps/editor/src/familyCreatorPlaceholder.ts` is the create rail's
answer for "Component" / "Generic Component", and its C74 §3.4 scaffold declaration is unusually blunt:

> *"**WHAT IS FAKE, stated plainly** — this module is named for the Family Creator and creates no family. It is a DOM modal that says 'under construction' … Clicking 'Component' / 'Generic Component' in the create rail reaches a dialog, not an editor: nothing is authored, nothing is persisted, no `.pryzm-family` artefact exists afterwards. **It is a dead-link guard wearing the name of the feature it stands in for.**"*
> *"**EXIT CONDITION** — `apps/component-editor` reaches standalone deploy and the create rail hands off to it (S58) … ⚠ **MILESTONE HONESTY (C74 §4.2(c))**: the 'S58' above is the PLAN's number, restated, not a fresh promise. The legacy `src/component-editor/` prototype was removed 2026-04-28 and no replacement has shipped since; **treat S58 as UNSCHEDULED until `apps/component-editor` has a deploy target.**"*

The eight `Component*Panel` / `Family*Panel` files in `apps/editor/src/ui/` (2193 LoC combined) are the
same story: `grep` for their names across `apps/editor/src` returns **only the files themselves and
their own binding specs** — no production constructor anywhere. `FamilyPreviewPanel.ts:28` carries
`TODO(Phase-F): replace placeholder canvas with an iframe bridge`. `plugins/family-editor/src/index.ts`
is a 27-line stub whose `activate()` body is `console.info(...)`.

---

## §F.2 — WHAT IS REUSABLE, AND HOW

Ranked by leverage for the Window vertical slice (§63).

### R1 — `ElevationOutlineSurface` + `OutlineAuthoring` + `WallProfileEditor` (L2 port) — **TAKE AS-IS**
The universal editor's **sketch-in-elevation** surface already exists, is generic across three
callers, has an invertible px↔metre contract, ships select/polyline/arc/ortho, and enforces the P6
split. **Do not rewrite it.** The generalisation §57–62 asks for is `C86 §10.6` rules 1–4, already
executed. What it needs to become spec-complete is *additive*: constraints and dimensions on the
ring, and a `{u,v}` **reference-plane** notion. Neither requires touching the surface's dimensional
core.

### R2 — `OpeningProfile.ts` — **PROMOTE, do not replace**
It is already the shape the spec's §18 geometry-adapter wants: canonical intent in, plain numbers
out, THREE-free, hashable, with a *declared consumer law* (`C86 §10.1 PR-1`). Its own header names
the missing consumer — *"(one day) the kernel producer"*. **Generalising `OpeningProfileKind` into a
universal `Profile` is the highest-value single move in this cluster**, because the law that "no arm
may re-derive an arc" is the law spec §5 wants for every representation.

### R3 — The **declaration-not-branch** pattern — **COPY WHOLESALE for §59's category modal**
`ElementTypeAuthoringRegistry.ts` + `C65 §3.5`. A family gets a capability by *declaring* it
(`editorKind`, `finishEditor.outline`), never by a branch in the editor. The registry additionally
**gates the declaration on C05 persistence and C13 project-scoping**, with `authoringUnavailableReason`
so an absence is a sentence rather than a missing button. Spec §59's "the category supplies semantic
defaults/templates, not a separate geometry engine" is *this pattern*, and it is already load-bearing
for two `editorKind`s across six families.

### R4 — The **resolution ladder** `resolveWindowDimensions()` — **GENERALISE**
Instance → Type → default, in one function, called by placement, plan symbol and 3-D preview alike,
with parity guaranteed *by construction* (C11 §3). Spec §12's ordering (definition → type → instance
→ derived) is this ladder plus a definition level and a derived level.

### R5 — The **three-file editor split** (L2 subject/port · L2 pure model · L7 surface) — **THE TEMPLATE**
`WallProfileEditor.ts` (L2) / `OutlineAuthoring.ts` (L2) / `ElevationOutlineSurface.ts` + `WallProfileEditor.ts` (L7).
Every universal-editor surface should be built this way, and the L7 file's header (`:35-51`) already
records **which alternatives were refuted and why** — including the one a newcomer will propose first
(move the chrome helpers into `ui-base`), refuted **by measurement**: `ui-base` is L3, `geometry-wall`
is L2, so it swaps one violation for another.

### R6 — `ElementPreviewCanvas` / `ElementPreviewRenderer` — **REUSE for previews; DO NOT grow into the authoring viewport**
Take the one-context rule and the no-rAF rule as **constraints on any new viewport**. But the
showroom is a blit with no picking; making it the authoring viewport means adding pan, section,
isolate and a whole picking path to a widget explicitly designed not to have them. `C86 §10.6` has
already ruled on this: *"the 3-D viewer in the type editor stays the PREVIEW (D8), **never the
authoring surface**."*

### R7 — `FinishTypeChatStrip` — **THE AI/RAC INTEGRATION TEMPLATE**
One draft, two input methods, one validation, one command, one read-back. Spec §76 gate D in 242
lines, with the two shortcuts it refuses documented.

### R8 — `apps/component-editor` sketch + constraint + reference-plane stores — **HARVEST, then decide**
Real sketch tools and five real constraint kinds behind a `SolverPorter` contract. But read §F.4 T-4
before believing the solver claim, and note it is a *separate SPA with no deploy target* — harvesting
its stores into the main editor is a different project from finishing it.

### R9 — `packages/file-format/family-*` — **THE PERSISTENCE FORMAT ALREADY EXISTS**
`FamilyManifestSchema`, `FamilyIfcEntitySchema` (11 entities), `FamilyCategorySchema` (8 categories),
parameter schema, pack/unpack, **and a migration framework with typed ops**. Spec §37 (versioning
with explicit behaviour for existing instances) has a real starting point here, not a blank page.

---

## §F.3 — WHAT IS GENUINELY MISSING (each evidenced by a search that FAILED)

Every gap below is stated with the command and its output, per this lane's brief. Commands were run
from the repo root on 2026-09-01 at `HEAD` (`6e15af2f`).

### GAP-1 — **No `ComponentDefinition`. PRYZM has `Type → Instance`, not `Definition → Type → Instance`.**

```
$ grep -rn "ComponentDefinition" packages apps plugins --include=*.ts | wc -l
0
```
(For contrast, `ComponentType` returns 8 — all unrelated local aliases.)

A `WindowSystemType` is a **named bag of defaults**, not a *reusable design intent that generates
geometry*. The generator is hard-coded TypeScript: `packages/geometry-window/src/WindowBuilder.ts`,
**2086 LoC**, one per family. **This is the structural gap that decides the whole programme.** Spec §6
is "never collapsed" — here it is collapsed, and every other gap below is downstream of it.

### GAP-2 — **No typed units. Every parameter is a bare `number` in implicit metres.**

```
$ grep -rnE "unitType|UnitType|Quantity<|LengthUnit|typedUnit" packages/geometry-window/src packages/geometry-wall/src --include=*.ts | wc -l
0
```

`WindowOpeningSchema` is `z.number().positive()` throughout; the UI labels carry the unit
(`makeField('Width (m)', …)`, `WindowSection.ts:435`) and the *label* is the only place the unit
exists. Spec §10 forbids exactly this: *"never a bare `Width = 1200`."* The unit currently lives in
prose, in field-name conventions (`_M` suffixes) and in docstrings — not in the type system.

### GAP-3 — **No expression / formula engine. No derived parameters. No dependency graph.**

```
$ grep -rnE "evaluateExpression|ExpressionEngine|parseFormula|FormulaEngine" packages/ --include=*.ts | wc -l
0
```

Everything is a literal value. The nearest thing that exists is a **hand-written resolver ladder**
(`resolveWindowDimensions`) and a **hand-written derived read-out** — `WindowSection` shows a derived
glass size, but it obtains it by calling `resolveWindowReveal()`, i.e. *"the panel READS the model,
it does not restate it"* (`WindowSection.ts:20-22`). That is the right discipline and the wrong
mechanism: it does not generalise, because each derived value needs a bespoke resolver written by
hand. Spec §11's typed expression engine with circular-dependency / unit-mismatch detection has **no
counterpart at all**. Spec §64's *"make glass width always opening width − 2×frame width"* is
currently **unexpressible**.

### GAP-4 — **No feature / history graph (§16).**

```
$ grep -rnE "FeatureGraph|featureGraph|FeatureTree|historyGraph|replayFeatures" packages/ apps/editor/src --include=*.ts | wc -l
0
```

⚠ `apps/editor/src/ui/ComponentHistoryPanel.ts` is **not** this — it is a *revision/audit trail* of
commands, and it is unreachable (§F.1.9). There is no replayable
`plane → sketch → profile → extrude → boolean` graph anywhere in the repo. `apps/component-editor`'s
`solidStore` records a `SolidProducerKind` (`'extrude' | 'sweep' | 'revolve' | 'loft' | 'boolean'`)
and an LOD bitmask — a *label for* a feature, with no inputs, no dependencies and no evaluation.

### GAP-5 — **No exact geometry, no B-Rep, no CAD kernel. Mesh is authoritative today.**

```
$ grep -rniE "opencascade|occt|\bbrep\b" packages/ apps/ --include=*.ts | wc -l
18
```
**All 18 hits are negations or an import type-tag**, not a capability:
- `packages/core-app-model/src/drawing/DrawingPipelineWorker.ts:23` — `❌ No BRep/CSG`
- `packages/core-app-model/src/drawing/HiddenLineRemoval.ts:118` — `❌ BRep/CSG — not used`
- `packages/core-app-model/src/presentation/ViewRangeZoneApplicator.ts:11,277` — *"Poche fill … requires BRep CSG geometry"* / *"(requires BRep cross-section geometry — deferred)"*
- `packages/file-format/src/import/rhino/RhinoImporter.ts:190` — reading a Rhino `objectType === 'Brep'` **tag** on import.

So spec §17's *"evaluate OpenCascade/OCCT (+WASM) … produce a recommendation before committing"* is a
**genuinely open decision**, with one important qualification: the *adapter seam* §18 asks for
partially exists already, because `OpeningProfile.ts` is THREE-free and its header names the future
kernel arm explicitly. **And there is already a downstream customer waiting**: poche fill and
hidden-line section geometry are deferred *pending exactly this*.

### GAP-6 — **The outline ring carries no constraints and no dimensions.**

```
$ grep -rnE "constraint|Constraint" packages/geometry-wall/src/OutlineAuthoring.ts \
      packages/geometry-wall/src/CustomOutline.ts \
      apps/editor/src/ui/ElevationOutlineSurface.ts | wc -l
0
```

`CustomOutlineVertex` is `{ readonly u: number; readonly v: number }`
(`CustomOutline.ts:62-65`) and nothing else. Dragging a vertex moves a number. **There is no
`Equal(A,B)`, no symmetry, no tangency, no persistent dimension** — so spec §13's *"make this
symmetrical → creates a real symmetry relationship, never nudged vertices"* and §68's constraint test
would today be answered by nudged vertices. The validator that *does* exist
(`validateCustomOutline`) checks min-vertices, min-area, self-intersection and bbox tolerance —
**validity, not intent**.

⚠ Note the asymmetry that makes this gap tractable: `apps/component-editor` **has** five real
constraint kinds and a solver loop, and `ElevationOutlineSurface` **has** the reachable, generic
authoring surface. **Neither half is where the other is.**

### GAP-7 — **No sub-object (face / edge / feature) selection anywhere in the product.**

```
$ grep -rn "faceIndex" apps/editor/src   → No matches found
$ grep -rn "faceIndex" plugins           → No matches found
```

Produced by `packages/picking/src/bvh-pick.ts`, typed in `packages/picking/src/types.ts:69`, consumed
by nobody. See §F.1.5 — **and see TRAP T-6 before building on it.**

### GAP-8 — **No universal Component API / DSL, and the family-authoring path is not reachable.**

The format exists (`packages/file-format/src/family-schema.ts`, `family-pack.ts`, `family-migrations/`)
and the editor exists (`apps/component-editor`), but the create rail reaches
`familyCreatorPlaceholder.ts`, whose own header says *"creates no family … nothing is authored,
nothing is persisted, no `.pryzm-family` artefact exists afterwards."* Spec §46–56's code-authoring
surface has **no counterpart** — no component DSL, no parser, no capability-based API.

### GAP-9 — **The type editor's 3-D viewport is not an authoring surface, and that is a ratified decision, not an oversight.**
No pan, no section, no isolate, no picking (§F.1.4). `C86 §10.6` states the rule: *"the 3-D viewer in
the type editor stays the PREVIEW (D8), never the authoring surface"*, with the reason recorded in
`packages/geometry-wall/src/WallProfileEditor.ts:26-38` — *"there is no camera in this repo guaranteed
to be looking at that plane."* **Spec §57–62's "3D is a first-class authoring environment" therefore
contradicts a live, founder-ratified contract clause and must be resolved explicitly in §81 item 11
(unresolved decisions), not assumed.**

---

## §F.4 — TRAPS · what a newcomer to this cluster will get wrong

**T-1 — "We need to make the Wall Profile Editor generic."** ⛔ **DONE, 2026-08-25.** `C86 §10.6` +
ADR-0373 + `ElevationOutlineSurface.ts`. Three callers. Proposing this is the worst outcome available
to this lane.

**T-2 — "Grep for `WindowEditor`."** Returns nothing. The Window Editor is four surfaces (§F.1.1).
Its parametric heart is in `packages/geometry-window/` (L2), **not** in `apps/editor/src/ui/`, and its
2-D profile authority is in `packages/geometry-wall/` — the *wall* package, not the window one.

**T-3 — "`apps/component-editor` is the Component Editor, so we build on it."** It is a **separate
SPA with no deploy target**, unreachable from the product, and the create rail routes to an
"under construction" modal instead. `familyCreatorPlaceholder.ts:41-49` says treat its S58 milestone
as **UNSCHEDULED**. Its 2400 LoC is a *harvest*, not a *foundation*, until someone decides where it runs.

**T-4 — "PRYZM already has a real PlaneGCS solver, so §17 is settled for constraints."** ⛔ **FALSE,
and the two sources disagree in the repo itself.** `apps/component-editor/README.md`'s roadmap says
*"S52 | Scaffold, **real planegcs constraint solver**"*. `packages/constraint-solver/package.json`
says the opposite, and it is the truthful one:
> *"Ships a deterministic `MockSolver` … and an **HONESTLY-LABELLED planegcs scaffold** (`PlanegcsAdapter`, kind='mock', intendedEngine='planegcs'). **No real planegcs binding exists in this repo, and none is authorised** until C74 §4.2(c) is answered for a named constraint family (C74 §4.5)."*
`PlanegcsAdapter.ts:18-27` records that the class *"previously declared `readonly kind = 'planegcs'`
while delegating 100% of its work to `MockSolver`. That was the defect C74 was written for."* It now
reports `kind = 'mock'` with `intendedEngine = 'planegcs'` as a **separate** field, *"so intent can
never be read as capability"*, plus a non-suppressible first-call warning and a **retirement guard
test** that fails the moment a real engine lands. **Read `packages/constraint-solver`, never the app
README.** This is spec §75 ("do not fake capabilities") already enforced by machinery — and the
authorisation gate C74 §4.2(c) means *a real solver may not simply be built*: some constraint family
must first be shown in writing to need **solving** (a simultaneous system with no closed form).

**T-5 — "The `Component*Panel` / `Family*Panel` files mean parameters/constraints/history are done."**
Eight files, 2193 LoC, referenced **only** by their own binding specs. `FamilyPreviewPanel.ts:28`:
`TODO(Phase-F): replace placeholder canvas with an iframe bridge`. `plugins/family-editor` is a
27-line stub. **Authored, never wired.**

**T-6 — "`faceIndex` exists, so wire face selection to it."** Two problems. (a) It is a **transient
topology index**, and spec §20 forbids canonical `Face 381` references — using it as identity
violates §7 and §20 on day one. (b) It is populated by **bvh-pick only**; `gpu-pick` (the production
strategy on capable devices) does not populate it — `types.ts:60-61`: *"gpu-pick **can** populate it
via a second MRT slot — that optimisation lands when downstream tooling needs face-resolution."* So
face selection would work on one strategy and silently not on the other.

**T-7 — Adding a field to a window and forgetting the Zod schema DELETES IT ON SAVE.** Stated three
times in `WindowTypes.ts` because it has bitten repeatedly:
> *"⛔ **THIS FIELD IS NOT OPTIONAL POLISH — WITHOUT IT THE PROFILE IS DELETED ON EVERY LOAD.** `WindowStore.add` does `Object.freeze({ ...WindowOpeningSchema.safeParse(w).data })`, and **Zod STRIPS keys the schema does not declare.** A field written to the store and absent here survives exactly as long as the session. That is the same save/load hole three other subsystems hit in one week."*
Any universal parameter system that writes onto element records inherits this hazard directly.

**T-8 — The barrel-import cycle. Import the PURE SUBPATH, never `@pryzm/geometry-wall`.**
`§OUTLINE80-CYCLE-FIX` / L-11261. The bare barrel drags `WallTool.ts → @pryzm/command-registry →
geometry-window → the barrel again`, mid-load, and `SlabTool → @thatopen/ui` at module scope. The
established subpaths are `@pryzm/geometry-wall/opening-profile`, `/profile-editor`,
`/outline-authoring`. `WindowSection.ts:16-18` even flags its own surviving bare-barrel import as
predating the finding.

**T-9 — Don't put DOM in an L2 package "because DOM isn't an upward import."** `§WPE-CHROME-LAYER`
(L-10200) is the cautionary tale, and its lesson is subtle: 359 lines of `document.createElement`
inside `packages/geometry-wall` was **not a layer violation**, *"which is exactly why it survived — the
layer gate cannot see it."* What it did instead was make the panel **unreachable by the app's own
chrome**, so *"make the panel resizable and draggable"* became **not expressible** without either a
violation or a sixth rival dragger. (The repo already had five.)

**T-10 — Two different files named `familyCreatorPlaceholder.ts`.**
`apps/editor/src/familyCreatorPlaceholder.ts` (the real modal, reached from
`ui/tools-panel/panels/CreateRailPanel.ts:1105`) and `apps/editor/src/ui/familyCreatorPlaceholder.ts`
(a smaller `console.log` stub reached from `ui/layout/CreatePanelLayout.ts:350`). A third copy was
deleted 2026-08-15 as dead. Its header warns about this explicitly.

**T-11 — ORTHO IS ABSOLUTE.** Founder ruling 2026-08-24: ortho never yields to a snap. It is decided
inside the L2 helper `outlinePlacePoint` **on purpose**, *"so the surface cannot have its own
opinion."* Do not restore snap-beats-ortho from an in-code rationale that predates the ruling.

**T-12 — The segmental arch's rise has no authored source, and that is recorded as NOT MEASURED.**
`C86 §10.1 PR-8` forbids a rise field beside `width`/`height`, so it takes a declared default of
1/6 span. `WindowModePicker.ts:35-42` puts the number in the tooltip precisely so the founder can
correct it in one sentence rather than discovering it in a drawing months later. **A universal
parametric editor that adds a rise parameter is amending C86 §10.1 PR-8** — that is a contract change,
not a feature.

**T-13 — `revealDirection` is AUTHORED, not inferred, and the reason is a measurement.**
`WindowTypes.ts:106-124`: the slot for "which face is outdoors" exists (`WallData.frontSide` /
`backSide`) and *"`grep -rnE "(frontSide|backSide)\s*[:=]"` … returns **ZERO writers**. So the
capability is UNREACHABLE, never MISSING (C01 §6 rule 6)."* Any World-Model orientation work
(spec §26, §34) hits this same wall.

**T-14 — ⛔ THERE ARE TWO `WindowStore`s, AND ONE OF THEM IS DEAD.** This is the single most
dangerous trap in the cluster and it bears directly on spec **§76 gate B (no duplicate source of
truth)**:

| Store | Path | Status |
|---|---|---|
| **THE LIVE ONE** | `packages/geometry-window/src/WindowStore.ts` (205 LoC) | Geometry store. `WindowBuilder` subscribes to it; it renders, exports and persists. |
| **THE DEAD ONE** | `plugins/window/src/store.ts` | *"pure DTO store … THREE-free, self-contained"* (S11). |

`plugins/window/src/handlers/UpdateWindowsSystemTypeBatch.ts:9-15` states the consequence outright:

> *"**WHY THIS BRIDGES instead of `window.setType` (same plugin)**: that handler `produceCommand`s the plugin's **DETACHED DTO store** — the **§FIX-MATERIAL-DEAD-DISPATCH disease; nothing that renders, exports or persists reads it** (§FIX-HOSTED-TYPE-CHANGE, L-620). The geometry `windowStore` that `WindowBuilder` subscribes to is only reachable through the legacy command path."*

The `plugins/window` README still advertises itself as *"PRYZM 2 window element — **full vertical
slice**"*. **It is not the vertical slice.** A universal editor built against `plugins/window` would
dispatch commands that change nothing the user can see. This is the memory note
`[[rac-capability-parity-architecture]]`'s "DEAD DTO stores" finding, in this family.

---

## §F.5 — WHAT THE TWO EDITORS PROVE PRYZM CAN ALREADY DO (§63, the first vertical slice)

The spec makes the **Window** the first vertical slice. Scored against §63's own enumeration, using
only what is **reachable in production today**:

| §63 requirement | State | Evidence |
|---|---|---|
| **semantic definition** | 🟡 PARTIAL | Zod-schema'd record + IFC entity mapping; **no `ComponentDefinition`** (GAP-1) |
| **type** | ✅ REAL | `WindowSystemTypeStore` — built-in immutable + user-authored, duplicable, persisted through a shared codec |
| **instance** | ✅ REAL | `WindowOpening`, `id == Opening.elementId`, identity survives type change (`PRESERVED_ON_TYPE_CHANGE`) |
| **parameters** | ✅ REAL (untyped) | ~30 parameters, live-dispatching through `UpdateWindowParameterCommand`; **bare numbers** (GAP-2) |
| **formulas** | ❌ ABSENT | GAP-3 |
| **profile** | ✅ **STRONG** | `OpeningProfile.ts` — 5 kinds, one producer, `C86 §10.1 PR-1` consumer law |
| **sketch** | ✅ **STRONG** | `ElevationOutlineSurface` — select / polyline / arc / ortho / presets, three callers |
| **constraints** | ❌ ABSENT on the ring | GAP-6 (five kinds exist, but in the unreachable SPA) |
| **exact geometry** | ❌ ABSENT | GAP-5 — mesh is authoritative |
| **materials** | ✅ REAL | C100 master material DB, `materialId` references, UNRESOLVED colour on a dangling id |
| **visibility** | 🟡 PARTIAL | Detail-level driven (`Window3dDetailLevel.test.ts`, `WindowMeshSkipInPlan.test.ts`); not the semantic predicate language of §28 |
| **host** | ✅ **STRONG** | C15 hosted-element contract; the void is inviolate; window follows host rake (`L1271`), host arc (`CurvedHostGlassFollowsWallArc`), level move (`L2050`) |
| **placement** | ✅ REAL | `WindowTool` + plan tool, both through `resolveWindowDimensions` — **parity by construction** |
| **2-D representation** | ✅ **STRONG** | `WindowPlanSymbolBuilder` — LOD-300, dimensionally true from the type, *never* an invented literal (L-127) |
| **3-D representation** | ✅ REAL | `WindowBuilder` (2086 LoC) incl. reveal, splay, curved host, instancing |
| **persistence** | ✅ REAL | Zod round-trip + `hostedSystemTypeCodec` |
| **AI creation** | ✅ REAL | `CreateWindowsParametricBatch` — *"a 1×2m window every 3 metres in the ground-floor walls"*, with a count-preview Confirm card and **one undo entry** |
| **AI modification** | ✅ REAL | `UpdateWindowsSystemTypeBatch` (`windowIds: 'all' \| string[]`), `OpeningShapeVocabulary`, `FinishTypeChatStrip` |
| **World Model registration** | 🟡 PARTIAL | `packages/building-graph` + `graphQueryBusHandlers.ts` exist; §34's relationship vocabulary is not the model's own |
| **code representation** | ❌ ABSENT | GAP-8 |

### The four capabilities the founder should know PRYZM already has

1. **A ratified, reused, generic elevation-sketch surface with an invertible metric contract.**
   Not a plan. Shipped, three callers, contract clause `C86 §10.6`, ADR-0373. **§57–62's Wall-Profile
   instruction is complete.**
2. **A single-producer profile architecture with an enforced no-re-derivation law.** `OpeningProfile.ts`
   + `C86 §10.1 PR-1`. This is spec §5's "exactly one authoritative model" already practised for one
   axis, THREE-free and hash-ready — and its own header already names the kernel arm as the next
   consumer.
3. **A working "either UI or chat, one draft, one command" authoring loop.** `FinishTypeChatStrip` is
   spec §76 gate D, implemented, with the two shortcuts it refuses written down.
4. **A declaration-driven, persistence-gated type-authoring registry.** `ElementTypeAuthoringRegistry`
   refuses to offer authoring a family cannot persist or scope. This is the mechanism §59's category
   modal needs, already load-bearing across six families and two `editorKind`s.

### The one thing they prove PRYZM CANNOT yet do

**Generate geometry from an authored definition.** In every case above, the *shape* is authored
(a ring, a kind, a parameter set) and the *geometry* is produced by hand-written TypeScript compiled
into the app — `WindowBuilder.ts`, 2086 LoC, one per family. There is no definition, no feature graph,
no formula, no kernel and no code surface. **A second family costs a second 2000-line builder.**

That is precisely spec §77 phase 6's test — *"if the second category needs excessive special cases,
refactor the architecture before continuing"* — and this lane's answer is that **the current
architecture would need a full special-case builder per category**, which is the strongest possible
argument for doing §77 phases 1–3 (canonical model → technology → contracts) before any UI.

> **The founder's closing risk in §81 lands exactly here.** PRYZM's editors are *better than their
> model deserves*: a genuinely reusable sketch surface, a disciplined profile producer, honest
> refusals, and a real AI authoring loop — sitting on top of `Type → Instance` with hard-coded
> generators and no units, formulas, features or constraints. **The beautiful editor already exists.
> The weak internal model is the work.**

---

## §F.6 — CROSS-LANE HANDOFFS

- **To the canonical-model lane (§77 phase 1):** GAP-1 is the pivot. `resolveWindowDimensions()` is
  the ladder to generalise; `PRESERVED_ON_TYPE_CHANGE` is the hand-written override boundary that a
  real parameter-scope model replaces.
- **To the technology lane (§77 phase 2):** §17's kernel question is genuinely open (GAP-5) — and
  `packages/constraint-solver`'s **C74 §4.2(c) authorisation gate** means the constraint-solver half
  of that question is *procedurally blocked* until a constraint family is shown in writing to need
  solving. Read T-4 first.
- **To the AI/RAC lane (§77 §39–45):** `FinishTypeChatStrip` and `OpeningShapeVocabulary` are the two
  templates; `ZeroTokenChatBridge`'s module-global conversation is the seam that stops a second chat
  surface from being added naively.
- **To the contracts lane (§77 phase 3):** any universal profile work amends **`C86 §10.1`** (the
  kind/carrier axis and PR-8's no-rise rule) and **`C86 §10.6`** (the authoring technology). Any
  universal type work amends **`C65`**. Element-family work is bound by **`C84`** and the `C85`–`C99`
  block. `C74` governs scaffold truthfulness and will bind every "is this real yet?" claim the
  programme makes.

---

## §F.7 — ADDENDUM: THE MEASURED MATURITY OF `apps/component-editor`

Added after §F.1.9 was written, because the GA gates carry a sharper account of this app than its own
README does — and the difference matters for R8 ("harvest, then decide").

**It is maintained but not shipped.** It appears in **zero** GitHub workflows:

```
$ grep -rn "component-editor" .github/workflows/*.yml
(no output)
```

…yet it is watched by at least three GA gates — `check-cast-count.ts:189,213`,
`check-no-hidden-mock.ts:257-290`, `check-refusal-identity.ts:312`. So it is *governed* code that
nothing builds for production and nothing deploys. That is an unusual state and it should be named
explicitly in §81 item 11: **someone is paying maintenance on an app with no delivery path.**

**Three scaffold declarations in `check-no-hidden-mock.ts`, all now struck, tell you what the sketch
half actually does:**

- `SketchCanvas.ts` — *"the app has **not** adopted the frame bus"*; it still calls `queueMicrotask`
  rather than `@pryzm/frame-scheduler`. So the sketch canvas is **not P3-integrated** with the main
  editor's frame ownership. Any harvest into `apps/editor` must cross that seam.
- `TrimTool.ts` — *"circles are NOT trimmable (S55)"*, with the refusal asserted **byte-identical**
  to the empty-sketch refusal. The trim tool is real and honestly partial.
- `FilletTool.ts` — real, with a rejects-parallel-lines assertion.

⭐ **And the gate's own commentary is the best available lesson for this whole programme.** Lane F9
proposed struck declarations for TrimTool and FilletTool and they were **REVERTED**, because:

> *"TrimTool's cited retiring assertion … **DID NOT EXIST**… and FilletTool cited 'rejects parallel lines', which is real but **STAYS GREEN after the trim/extend variant lands** … — **an assertion that cannot fail cannot retire anything.** `RETIREMENT_RE` is a prose regex and is structurally blind to both defects."*

They were struck only on 2026-08-17, once *"each assertion was planted against, seen RED, and the
source reverted byte-identical (`git diff` empty)"*.

**That is the standard this repo already holds itself to for "is this capability real yet?", and it is
exactly spec §75 ("DO NOT FAKE CAPABILITIES") with executable teeth.** The universal component editor
will make many such claims — *Sweep does a real sweep*, *Constraint Equal makes a real constraint* —
and `tools/ga-gate/check-no-hidden-mock.ts` + `C74` is the machinery that already exists to hold them.
**Reuse it; do not invent a second honesty mechanism.**
