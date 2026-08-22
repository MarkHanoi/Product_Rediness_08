# ADR-0340 — A sheet viewport is NAVIGABLE, but it is not SELECTABLE

- **Status:** Accepted
- **Date:** 2026-08-21
- **Lane:** SHEET3
- **Tags:** `§SHEET-VIEWPORT-ALWAYS-REMOVABLE` (L-1862) · `§SHEET-VIEWPORT-SCALE-IS-LIVE` (L-1863) ·
  `§SHEET-VIEWPORT-CROP-UI` (L-1864) · `§SHEET-NAVIGATE-INSIDE-THE-VIEWPORT` (L-1865) ·
  `§SHEET-DBLCLICK-STAYS-ON-THE-SHEET` (L-1866) · `§SHEET-PDF-PLACES-THE-VIEWPORT` (L-1874) ·
  `§SHEET-3D-SNAPSHOT-IS-DATED` (L-1875)
- **Contracts:** C06 §13.3 (one producer per surface) · C03 (commands are the only mutation path) ·
  P2 (single THREE owner) · P6
- **Supersedes in part:** the `enterEditInPlace()` half of SC-11, and the double-click
  contract described in `activateViewForEditing.ts` (L-1842).

---

## ⚠ AMENDED 2026-08-22 (lane SHEET4) — THE TITLE SAYS THE OPPOSITE OF THE DECISION

**Status of the ruling: UPHELD. Status of the title: CORRECTED.**

The founder, 2026-08-22, listing it as a standing request:

> "Viewports must be selectable — select a viewport → see its properties →
> change the scale there → resize it → crop it in place → double-click to
> navigate inside it at full 3D quality, without leaving the sheet, for 3D
> **and** plan **and** elevation."

That reads as a direct contradiction of this ADR, and the lane was briefed to
overturn it if the reasoning no longer held. **It was measured first, and the
contradiction is not real — it is an artefact of this document's own title.**

### What the title says, and what the decision says

The title reads *"a sheet viewport is NAVIGABLE, but it is not SELECTABLE"*.
The decision underneath it says something much narrower: **elements INSIDE a
composed viewport cannot be selected**, because `SVGCompositeRenderer` emits
anonymous `<line>` elements from merged `THREE.LineSegments` buffers in which
per-element identity is already gone (§VG-LAYER-IDENTITY-IS-THE-ONLY-SURVIVOR,
L-1600). **The VIEWPORT ITSELF was always selectable** — §5 of this ADR is a
specification for a viewport properties panel with editable `position`, `scale`
and `crop`.

So the subject of "SELECTABLE" silently changed between the title and the body:
in the title it is the viewport, in the body it is the elements inside it. An
agent reading only the title — which is what a title is for — would refuse to
implement viewport selection. **That is this repo's recurring defect class
(a document asserting something the code does not do) with the polarity
inverted: a document REFUSING something the code already does.**

### Measured, 2026-08-22 — five of the six asks were already shipped

| Founder's ask | State | Evidence |
|---|---|---|
| Select a viewport | **SHIPPED** | `SheetEditorPanel._selectedVpId`, set by the viewport click handler |
| See its properties | **SHIPPED** | `SheetEditorSidebar.ts` §Viewport properties, per §5 below |
| Change the scale there | **SHIPPED** | `SheetEditorSidebar.ts:283` dispatches `UpdateViewportScaleCommand` |
| Crop it in place | **SHIPPED** | `SheetEditorSidebar.ts:332` dispatches `SetViewportCropCommand` |
| Double-click → navigate, without leaving the sheet | **SHIPPED** | §1 below (L-1866) |
| **Resize it** | **⛔ ABSENT** | see below |

**Resize was ABSENT, and absent in the most misleading way.** Measured with
`grep -rn "sh-resize-handle"` → **9 hits, every one of them in
`apps/editor/src/ui/styles/panels/sheetEditor.ts`** — eight cursor rules and a
base class, fully authored, for eight compass handles. **Zero DOM producers.**
The CSS existed and nothing ever created an element to wear it
[authored-but-unwired]: the feature looked present to anyone reading the
stylesheet and did not exist.

### What resizing a viewport MEANS — and why it is a crop

A viewport **has no size of its own**. `ViewportSvgComposer` is explicit: it is
exactly as big as the drawing it shows, at the scale it shows it at. So a
resize handle cannot simply set a width; it must change one of the things that
determines the size, and there are only three candidates:

1. **Change the scale.** Rejected — that is a different control, it already
   exists, and dragging a corner to restyle a drawing from 1:50 to 1:63 would
   produce scales no drafter would choose.
2. **Stretch the linework to the new rectangle.** Rejected outright: it
   falsifies the drawing, and it makes the printed "1:N" a lie. This is the
   same rejection this ADR already records for *"clamp the oversized viewport
   to the sheet"*.
3. **Change what the viewport SHOWS.** ⭐ This is the correct one, and it is
   already a first-class, undoable, persisted concept: **`crop`**.

⭐ **So resize IS crop, expressed as a gesture rather than as four numbers.**
Dragging an edge changes the drawing-space rectangle the viewport frames; the
paper size follows, because paper size is a function of crop and scale. The
conversion is exact and was already established by §3 of this ADR — a crop
rectangle and a viewBox are both in metres, and `paperMm = worldM × 1000 /
scaleDenom`. Nothing is approximated, `1:N` stays true, and the gesture
dispatches the `SetViewportCropCommand` that L-1840 already built, so resize is
undoable and survives a save on its first day.

### The part of the reasoning that STILL HOLDS

**Element selection inside a viewport remains REFUSED, unchanged, for the
reason originally given.** The merged-buffer identity loss is real, measured and
not affected by anything above. "Navigate here, edit there, via a button that
says so" stands.

And one ask is **NOT delivered and cannot be, as stated**: *"navigate inside it
at full 3D quality"*. §7 below is still true — a 3D viewport is a raster
capture, so navigating inside one is a transform on a bitmap and it degrades as
you zoom. Delivering literal full 3D quality needs a live render pass at the
viewport's aspect, which does not exist: measured on `RendererHandleFactory`,
there is **no render-to-target-at-aspect entry point** (L-3802). Recorded as
refused-for-now, by name, rather than quietly approximated.

### Consequence for this document

The title is retained verbatim for link stability, but **it must be read as "a
sheet viewport is navigable and selectable; the ELEMENTS INSIDE IT are not"**.
Nothing in the decision below changes.

---

## Context

The founder, 2026-08-21, on production build `071a7b2c`:

> "When I select a view within the sheet I would like to be able to navigate in the view like
> if I am in the main scene, **still being in the sheet / view interface** — but now it brings
> me to the main pryzm view, which is **NOT** what I want. I would like to select a view in the
> sheet and have a panel — like the sheet panel — with information of the view, like the
> properties panel, and I can change the scale there directly and see how it looks, also crop
> the view on demand as I do with the elevations in floor plan."

Earlier the same day, lane SHEETS wrote `activateViewForEditing.ts` on the reasoning that
element editing inside a sheet viewport is impossible, and therefore double-click should
**leave the sheet** and open the source view in the main editor. The founder rejected that
outcome. The reasoning behind it, however, was correct — and this ADR exists because those two
facts are compatible only if the requirement is split in half.

## The distinction this ADR turns on

**Navigating and selecting are not the same capability, and they do not cost the same thing.**

| | needs element identity? | cost | verdict |
|---|---|---|---|
| **Navigate** (pan / zoom inside the viewport) | **No.** It is a `viewBox` or transform change on a mounted node. | One controller and a unit conversion. | **Delivered.** |
| **Select / edit elements** | **Yes.** Every pick must resolve to an element id. | A second picking stack over a representation that does not carry ids. | **Refused, and said so.** |

`SVGCompositeRenderer.setTechnicalDrawing()` traverses `drawing.three` and emits anonymous
`<line>` elements grouped by layer. It reads merged `THREE.LineSegments` buffers in which
per-element identity is **already gone** — the only thing that survives OBC's
`toDrawingSpace() → addProjectionLines()` hand-off is `userData.layer`, the layer NAME
(measured and written up in `DrawingLayerIdentity.ts`, §VG-LAYER-IDENTITY-IS-THE-ONLY-SURVIVOR,
L-1600). There is no per-element attribute to stamp, because there is no per-element object.

So a click inside a composed viewport can be resolved to a **layer**, and to nothing finer.

## Decision

### 1. Double-click ACTIVATES the viewport. It never leaves the sheet — for any view type.

Previously double-click branched on view type: 2D views entered SC-11 focus mode, and
`3d` / `render` / `walkthrough` called `enterEditInPlace()`, which **closes the sheet editor**
and switches the main viewport. That is the branch the founder hit. Since navigation needs no
element identity, there was never a reason for the 3D case to be the one that teleports.

### 2. Leaving the sheet is a NAMED BUTTON, not a gesture.

"↗ Open in main editor" sits in the viewport properties panel. It is the first and only call
site of `activateViewForEditing()`, which shipped with none — so the defective
`enterEditInPlace()` path (which passed a ViewDefinition id to `ViewController.activate()`, a
function that takes a `ViewMode`) was still the only one running.

### 3. `ViewportEditController` is THE owner of the per-viewport camera.

It was authored months ago with tests and a barrel export and had **zero construction sites
anywhere in the repo**, while `SheetEditorPanel` carried a private rival — `camOffset` /
`camZoom` on `VpFocusState` — that was discarded on every exit. The rival is gone.

**The controller stores DRAWING-SPACE METRES; the surface speaks CSS pixels.** They convert by

```
pxPerWorldM = scaleFactor × 1000 / scaleDenom
```

which is exact and independent of the drawing, because the composer lays a viewport out at
`worldM × 1000 / scaleDenom` millimetres of paper and the canvas renders a paper millimetre as
`scaleFactor` pixels. Neither representation is an approximation of the other. Metres are the
authority because **a crop rectangle and a viewBox are both in metres** — which makes
"crop to what I am looking at" a copy rather than a conversion.

### 4. Deletion is guaranteed by a route that has no geometry.

The founder could not reach a viewport's `✕` because the viewport was 8020 mm wide on an
1189 mm sheet, putting its own close control roughly seven sheet-widths off-canvas. Three
independent guarantees now apply, in order of robustness:

1. **`Delete` / `Backspace` removes the selection** (guarded against typing targets). A key
   binding cannot be pushed off the paper.
2. **`✕ Remove from sheet` in the properties panel**, which is always on screen.
3. **The `✕` itself is pinned back onto the paper** when the viewport overflows.

Only (1) and (2) are unconditional. (3) is a positional argument and positional arguments are
defeated by the next oversized drawing, which is why it is third and not first.

### 5. Editable where the property belongs to the PLACEMENT; read-only where it belongs to the VIEW.

`position`, `scale` and `crop` are per-placement and editable in the panel. `level`,
`discipline`, `detailLevel`, view range and the view-wide crop belong to the `ViewDefinition`
and are shown read-only: editing them from one sheet would silently re-document every other
sheet the view appears on.

### 6. `SheetViewport.position` is the BOTTOM-LEFT CORNER.

Not the centre. Every writer in the product already wrote a corner; only `PdfExportService` and
a doc comment believed otherwise, and the PDF therefore placed every viewport off by half its
own size in both axes. `viewportPaperRect()` in `@pryzm/file-format/sheets` is now the one
definition, and `composeForPlacement()` the one composition call, so an export surface cannot
forget an option the screen applies.

### 7. A 3D viewport is a dated SNAPSHOT, and says so.

There is no vector path for `3d` / `render` / `walkthrough` — they are excluded from projection
by design — so a 3D viewport is a raster capture and always will be. When the live surface is
unusable (the sheet editor is open ⇒ the 3D container is `display:none` ⇒ the render pass is
refused, §SURFACE-WITH-NO-AREA-REFUSES-THE-PASS, L-1470) the last good frame is shown **with a
badge naming it a snapshot and giving its age**. `capturedAt` is a required parameter on the
paint function so a future call site cannot default its way into presenting a snapshot as live.

## Consequences

**Gained.** Navigation inside a viewport that survives a rebuild, a deselect and a jump to
another viewport and back. A properties panel that describes the drawing and not only its
placement. Crop dispatchable at last — L-1840 landed the field, the store method, the undoable
command and the composer branch, and nothing dispatched any of it. A PDF that agrees with the
sheet about where things are.

**Given up.** Element selection inside a sheet viewport. **This is stated as a refusal, not
deferred quietly.** Delivering it requires per-element identity in the composed SVG, which
requires `SVGCompositeRenderer` to emit one `<g data-element-id>` per element, which requires
the projection pipeline to keep elements unmerged — a change to `EdgeProjectorService` and to
the fourteen `*SymbolBuilder` files, weighed against the merged-buffer performance those exist
to provide. Until that trade is made deliberately, the honest UX is: **navigate here, edit
there, via a button that says so.**

**A structural debt was surfaced, not created.** Wiring the controller put `plugins/sheets` into
the root `tsconfig` program for the first time and surfaced nine never-compiled type errors,
four of them in `plugins/plan-view`. Root cause: `view-source.ts` type-imports
`sheet-editor-host.ts`, which value-imports `@pryzm/plugin-plan-view` — precisely what
`view-source.ts`'s own header forbids in its first paragraph. `EditCamera` and `Disposer` now
live in a dependency-free leaf (`view-camera.ts`) and the controller has its own package
subpath. **The rest of `plugins/sheets` still reaches plan-view**; that is recorded, not fixed.

## Alternatives rejected

- **Keep double-click → open the main editor.** Rejected by the founder in the words quoted above.
- **Shrink `LevelDatumLineBuilder.HALF_EXTENT`** so the 8020 mm viewport fits. Rejected: a datum
  rule that runs past the building is what a datum rule *is*, and any constant is wrong for a
  building wider than the guess. Fixed at the measurement instead (L-1854).
- **Clamp the oversized viewport to the sheet.** Rejected, and the existing code comment saying
  so is correct: shrinking would make the printed "1:N" a lie.
- **Re-compose the SVG on every wheel tick** so navigation drives a real `viewBox`. Rejected for
  now — a synchronous re-compose plus `DOMParser` per frame on a large drawing is not free, and
  a CSS transform on vector DOM stays crisp. The camera is stored in metres precisely so this
  can be swapped in later without a unit change.
