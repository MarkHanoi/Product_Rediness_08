# Editor chrome map — every control in the PRYZM editor shell, and whether it works

> **TL;DR.** The PRYZM editor shell is six regions of floating chrome around one 3-D canvas.
> This guide walks all six top→bottom, left→right, names every button with the file and line
> that defines it and the file and line that registers it, recurses into every flyout to the
> leaf, and — the reason it exists — gives each control a **STATE**: `ACTIVE`,
> `REFUSES-WITH-REASON`, `DECLARED-BUT-UNREACHABLE`, or `ABSENT`. **§11 is the one-page audit
> table.** Measured 2026-08-23, lane UIDOC39.

**Audience: developer.** It carries `file.ts:line` for every row and a state column backed by a
command you can re-run. It is filed under `05-guides/developer/` rather than `user/` because a
user guide would say what a button *does*; this one says what a button *is wired to*, which is an
engineering fact. Nothing here is softened for tone — a control that is unreachable is written as
unreachable.

---

## §0 — How to read this, and the rule the STATE column obeys

**C01 §6 rule 6 is binding here: "this button does nothing" is a MEASUREMENT, not an opinion.**
Every non-`ACTIVE` verdict below cites the command that establishes it, and the three failure
verdicts are kept apart because they have different fixes:

| STATE | Means | Fix shape |
|---|---|---|
| **ACTIVE** | A handler exists, something calls it, and the call site is on a mounted element. | — |
| **REFUSES-WITH-REASON** | A handler exists and declines under a stated condition, and the user is told the condition and the route back. **This is a correct state, not a defect.** | none |
| **DECLARED-BUT-UNREACHABLE** | A handler exists and nothing reaches it — the wire is missing, not the code. | one wire |
| **ABSENT** | No handler exists at all. | build it |

⚠ **Two search tools were used for every negative.** A single ripgrep pass is not proof: during
this lane the `Grep` tool reported 3 hits for `create-content` repo-wide and omitted
`apps/editor/src/engine/initUI.ts:3032`, which `grep -rn` found immediately. The file is not
gitignored (`git check-ignore` → rc 1), is not binary (`file` → *"JavaScript source, UTF-8"*), and
contains no NUL byte. **The discrepancy is unexplained and is recorded rather than papered over
(L-7509).** Every `DECLARED-BUT-UNREACHABLE` row below was confirmed with *both* `Grep` and
`grep -rn`.

**Scope, stated honestly.** This maps the **static wiring** of the shell — what is constructed,
what is mounted, and what a click calls. It does **not** establish that a canvas click places
geometry; that needs a browser and is out of scope (see §10).

---

## §1 — Corrections to the founder's six-region reading

The brief supplied a reading of the screenshot and asked for it to be corrected from the code.
**Thirteen glyph labels were wrong.** Each is listed here once and then used correctly throughout.

| # | Region | Founder's reading | What the code says | Source |
|---|---|---|---|---|
| 1 | Left rail | "settings/gear" | **Levels & Grids.** The asset really is a gear (`/icons/right/sETTINGS.svg`) but the section is `LEVELS_GRIDS`. The glyph is misleading, and it is the *only* rail icon that borrows another concept's asset. | `ProjectBrowserPanel.ts:85` |
| 2 | Left rail | "copy/duplicate" | **Views & Sheets** (`DOCUMENTS`). Two overlapping document rectangles, not a copy glyph. | `ProjectBrowserPanel.ts:72-82` |
| 3 | Left rail | "layers-with-magnifier" | **Visibility Intent.** Three bars + magnifier. | `ProjectBrowserPanel.ts:86-93` |
| 4 | Left rail | "search" | **Inspect** (Model Tree + Provenance). Tree lines + magnifier. | `ProjectBrowserPanel.ts:111-119` |
| 5 | Left rail | "compass/north" | **AI & Tools** (`/icons/left/AI.svg`). | `ProjectBrowserPanel.ts:83` |
| 6 | Left rail | 11 icons + logo | **12 controls** (logo, AI launcher, 10 sections) **+ a 13th dock-pin button** injected from outside the class. | `ProjectBrowserPanel.ts:240-276`, `DockingLayout.ts:136` |
| 7 | Top-centre | "the **Ground +0.000 m** level *selector*" | **Not a selector.** It is an indicator plus two arrows (▼/▲) that step one level down/up. The name and elevation are inert text. There is no dropdown. | `ActiveLevelHUD.ts:59-114` |
| 8 | Right rail | "the gear at top" | **Not a button.** `.tp-header` is a static `⚙` + the word "Tools". The only clickable thing in that header is the dock-pin appended by `DockingLayout.ts:139`. | `ToolsPanelController.ts:117-132` |
| 9 | Right rail | "stairs" | **Structure** (isometric frame). | `PryzmIconsPryzm.ts:714` |
| 10 | Right rail | "wall" | **Interiors** (axonometric room box with a partition). | `PryzmIconsSystem.ts:402` |
| 11 | Right rail | "roof/slab" | **Services** (isometric plant/duct block). | `PryzmIconsPryzm.ts:693` |
| 12 | Right rail | "furniture" | **Annotation** (`/icons/right/Annotate.svg`). | `ToolsPanelController.ts:102-107` |
| 13 | Bottom dock | "export/exit glyph" | **Import IFC.** The tray-with-up-arrow reads as export; it imports. It also carries an `IFC` badge. | `BottomActionMenu.ts:1256-1268` |

Two more, smaller:

* Bottom dock "layers glyph" is the **tool circle button**; it renders whichever structure tool is
  currently *selected* (default `wall`, restored from `localStorage`), so its glyph changes
  (`BottomActionMenu.ts:1155-1170`).
* Bottom dock "undo-arrow" is **Reset view controls**, not undo (`BottomActionMenu.ts:1229-1233`).
* Bottom-right "contrast/theme toggle" is **View properties — Environment & Camera**; the glyph is
  a literal `◑` character chosen because it "reads as sun / shading"
  (`ViewPropertiesLauncher.ts:102`). There is no theme toggle in the editor shell.

**Region 5 was under-counted, not mis-labelled.** The founder saw one split toggle above the GPU
strip. The corner is a *declared eight-slot rail* (`zLayers.ts:133-154`) — of which **seven slots
are empty**, because six GIS pills and the ⟲ reset button were deliberately removed into the GIS
panel (§6).

---

## §2 — REGION 1 · LEFT RAIL — the project's structure and its data

*What it is for: everything **about** the project — its browser, levels, views, visibility, site
and analysis panels. It never creates an element.*

**Root:** `.vb-panel` (52 px, always narrow) wrapping `.pb-container`.
Built at `NavigationAreaLayout.ts:259-261`; hosted at `Layout.ts:141` via
`DockingLayout.ts:91-94`. Clicking an icon opens a **floating panel to its right**
(`RailPanelController`, `rp-` prefix) — the rail never widens.

⚠ **`LeftNavRail.ts` (976 LOC, `lnr-` prefix, 8 panels) is NOT this rail and is not on screen.**
It is constructed at `NavigationAreaLayout.ts:251` and immediately discarded:
`void leftNavRail; // suppressed — not mounted` (`:256`). Confirmed with `Grep` and `grep -rn` —
there is exactly one construction site and no `appendChild`. Its stylesheet is still injected
(`AppTheme.ts:62`). **STATE: DECLARED-BUT-UNREACHABLE** (L-7500).

### 2.1 — The rail buttons, top to bottom

| # | Glyph | Name (id / class) | Defined | Registered | Does | Enabled when | Key | STATE |
|---|---|---|---|---|---|---|---|---|
| 1 | PRYZM pyramid | `LOGO` · `.pb-logo-btn` | `ProjectBrowserPanel.ts:278-304` | `:244` | Opens **Project Hub** panel (§2.2) | always | — | ACTIVE |
| 2 | chat bubble + sparkle | `.pb-ai-launcher` | `:322-345` | `:248` | Toggles the AI Design Assistant chat (`#ai-panel-container`) via `props.onToggleAIPanel` | always | — | ACTIVE |
| 3 | four squares | `BROWSER` | `:61-66` | `:255` | `UnifiedBrowserPanel` — Project + Elements cards | always | — | ACTIVE |
| 4 | **gear** | `LEVELS_GRIDS` | `:85` | `:256` | `LevelsGridsRailPanel` — level list, grid list, visibility rows, legend | always | — | ACTIVE |
| 5 | two documents | `DOCUMENTS` | `:72-82` | `:257` | `DocumentsBrowserPanel` — search + **Views / Sheets / Schedules** tab pills with live counts | always | — | ACTIVE |
| 6 | bars + magnifier | `VISIBILITY_INTENT` | `:86-93` | `:258` | `VisibilityIntentManagerPanel` | always | `Ctrl+Shift+I` opens it directly **only for `plan === 'owner'`** (`initUI.ts:3471-3484`) | ACTIVE |
| 7 | camera | `CAMERA` | `:84` | `:259` | `_buildCameraRenderPanel()` → `CameraRailPanel` + `RenderRailPanel` (§2.3) | always | — | ACTIVE |
| 8 | tree + magnifier | `INSPECT` | `:111-119` | `:260` | `buildInspectPanel(runtime)` — model tree, isolation, provenance | always | — | ACTIVE |
| 9 | globe | `GIS` | `:96` | `:261` | `_buildGISPanel()` → `renderGisActions()` + parcel section (§2.4) | always | — | ACTIVE |
| 10 | surveyed plot ring | `PARCEL` | `:103-109` | `:268` | `buildParcelRailPanel()` — the same `mountParcelSection` producer the GIS panel hosts, in its own slot | always | — | ACTIVE |
| 11 | AI mark | `AI` | `:83` | `:269` | `AIRailPanel` — 5 buttons (§2.5) | always | — | ACTIVE |
| 12 | lightning bolt | `PHYSICS` | `:68-70` | `:270` | `PhysicsRailPanel` — 4 exclusive modes: **Off / Thermal / Acoustic / Daylight** (`PhysicsRailPanel.ts:26,33,40,48`) | always | — | ACTIVE |
| 13 | pin | `.dck-pin-btn` | `DockingLayout.ts:79-83` | `DockingLayout.ts:136` | Pins the rail into `#dck-left-dock`; persisted in `localStorage['bim-layout-pinned']` | always | — | ACTIVE |

**Every opened panel adds three more controls** from `RailPanelController.ts`: a pin
(`.rp-pin-btn`, `:71`), a close `×` (`.rp-close-btn`, `:79-82`), and two resize handles
(`:95-101`). All ACTIVE.

⚠ **`SECTION_ICONS.RENDER` is declared at `ProjectBrowserPanel.ts:94` and no section id `RENDER`
exists** in the list at `:254-271`. Dead map entry; harmless (the render panel is reached through
`CAMERA`). **STATE: DECLARED-BUT-UNREACHABLE** — cosmetic, recorded for completeness.

### 2.2 — Sub-tree: LOGO → **Project Hub** (`.phub-container`)

Built by `ProjectBrowserPanel._buildHubPanel()` (`:382-537`). Seven collapsible sections; only
*Project* is open by default. Every action item emits `pryzm-hub-action { action }` on
`runtime.events` (`:386-400`) — **except** `back-hub` and `sign-out`, which additionally dispatch a
bare `window` event because the relay depends on `PlatformProjectBrowser` being constructed.

The single subscriber is `PlatformProjectBrowser.ts:194`. Its switch (`:560-628`) carries a `case`
for **all sixteen** hub actions, verified one-for-one.

| Section | Items (in order) | Action id | STATE |
|---|---|---|---|
| **Project** | Back to Projects · Save Project · Version History `ISO` | `back-hub` · `save` · `history` | ACTIVE ×3 |
| **Export & Print** | Export IFC · Export GLB · Import PDF / Image · Import DXF / DWG · Import Revit (via IFC) · Import Rhino (.3dm) · Print / Export PDF · Import Manager | `export-ifc` `export-glb` `import-pdf` `import-dxf` `import-revit-guided` `import-rhino` `print` `import-manager` | ACTIVE ×8 |
| **Portfolio & API** | Portfolio Analytics `E-4` · Webhook Subscriptions `E-2` | `portfolio` · `webhooks` | ACTIVE ×2 |
| **Team & Compliance** | Team Members `CDE` · CDE Document State `19650` | `members` · `cde-state` | ACTIVE ×2 |
| **Settings** | 4 toggles — Room Design Insights · Room Compliance Overlay · Server Save Warning · Room Volume Colour — + 1 slider (Volume Opacity, 0.05–0.60) | `UiPreferences` keys | ACTIVE ×5 |
| **Room Bounding** | Walls (**read-only, always ON, cannot be disabled**) · Columns toggle · Curtain Walls toggle | `roomBoundingColumns` / `roomBoundingCurtainWalls` | 1 read-only + 2 ACTIVE |
| **Session** | Sign Out (danger) | `sign-out` | ACTIVE |

⚠ The hub's own console instrumentation names the failure mode it fears: `§HUB-DISPATCH` logs
`runtimeEvents=false` when the bus is null (`:391-393`). That path is a *silent loss*, not a
refusal. Not observed in this lane; recorded as an unverified axis.

### 2.3 — Sub-tree: CAMERA → Camera & Render

`CameraRailPanel.ts` sections: **Camera Mode** (`:32`) · **View Controls** (`:61`) · **Saved
Viewpoints** (`:93`, with `+ Save Viewpoint` `:100`, per-row `▶` go `:151` and `×` delete `:171`,
and an explicit `No viewpoints saved yet.` empty state `:116`) · **Navigation** (`:205`, orbit
arrow-pad `:218`, a Walk-mode entry with a `⌛ Entering Walk Mode…` transitional label `:309`) ·
**Controls** hint (`:341`). Followed by `RenderRailPanel` (665 LOC). All ACTIVE.

### 2.4 — Sub-tree: GIS → the **declared action registry**

⭐ **This panel renders no button list of its own.** `renderGisActions()`
(`ui/gis/renderGisActions.ts`) derives every button from `GIS_ACTIONS`
(`ui/gis/gisActionRegistry.ts`) and refuses to accept a caller-supplied id list — a new action
appears with no panel edit. **An action whose entry point does not resolve is rendered disabled,
marked `data-gis-unavailable`, and shows its reason** (`renderGisActions.ts:11-16`).

| Group | Action | id | Entry point | STATE |
|---|---|---|---|---|
| Site views | PRYZM Earth | `site.earth` | `pryzmEnterSiteView` | ACTIVE |
| Site views | Plan (oblique) | `site.plan-oblique` | `pryzmEnterSiteView` | ACTIVE |
| Site views | 2D Map | `site.map-2d` | `pryzmEnterSiteView` | ACTIVE |
| Site views | 3D globe (photoreal) | `site.globe` | `pryzmShowSiteResultView` | ACTIVE |
| Site views | 3D + plan | `site.bim-split` | `pryzmShowSiteResultView` | ACTIVE |
| Site views | Plan + Site | `site.plan-gis` | `pryzmEnterPlanViewGis` | ACTIVE |
| Display | Real | `site.fidelity.real` | `pryzmSetFormaBuildingFidelity` / `…Globe…` | ACTIVE |
| Display | Massing | `site.fidelity.massing` | same pair | ACTIVE |
| Display | Zoom to Site | `site.zoom-to-site` | `pryzmZoomToSite` | ACTIVE |
| Display | Site Analysis | `site.analysis` | `pryzmToggleSiteAnalysis` | ACTIVE |
| Display | Buildable Envelope | `site.buildable-envelope` | `pryzmToggleEnvelopeCard` | ACTIVE |
| Display | **Floors shown** | `site.floor-filter` | **`entryPoints: []`** | **REFUSES-WITH-REASON** — renders disabled with *"Not yet re-hosted — the floor selector drives `CesiumViewport.setVisibleFormaLevels` through a closure with no registered entry point"* (`gisActionRegistry.ts:319-337`). The registry also records that its natural home is Levels & Grids (P7). |
| Utility | Reset panel layout | `panel.reset-layout` | `pryzmResetPanelLayout` | ACTIVE — **app-wide**, walks the whole `PANEL_REGISTRY`, not just GIS |

⚠ **The active highlight is a snapshot, not a subscription** — `renderGisActions.ts:38-42` says so
in its own header: a view changed from a legacy view-mode bar is not reflected until the panel is
reopened.

### 2.5 — Sub-tree: AI → AI & Tools

`AIRailPanel.ts`: *Pending AI Proposals* label + count (`:41`), **Review** (`:61`), **AI Chat**
(`:75`), **✦ AI Create** (`:84`), **PDF Import** (`:94`). All ACTIVE.

---

## §3 — REGION 2 · TOP-CENTRE BAR — save/history, workspace mode, active level

*What it is for: the three things that are true of the whole session — whether it is saved, which
workspace you are in, and which storey you are authoring on.*

**Root:** `.wmb-toplevel-wrapper`, a `position: fixed` flex row appended straight to `document.body`
at `DockingLayout.ts:234`. It holds **three** children, composed in one place on purpose
(`DockingLayout.ts:194-232`): `SaveUndoRedoHUD` → `WorkspaceModeBar` → an empty `#alh-modebar-slot`
filled later by the level pill.

⭐ **The wrapper clears a half-canvas panel by ONE published number, not by a per-mode rule.**
`.wmb-toplevel-wrapper` is `position: fixed; top: 6px; left: var(--shell-canvas-cx, 50%)`
(`styles/panels/platform-shell/workspaceModeBar.ts:19-30`), and `--shell-canvas-cx` is written by
`publishShellCanvasRegion()` and by nothing else. The level pill inherits the anchor, the 7 px gap,
the `pointer-events` discipline (`:31`), the two mobile breakpoints and the re-centre **by being a
child** — that is the whole point of §LEVEL-PILL-FOLLOWS-THE-MODE-BAR (L-3500), which moved it out
of `.plat-toolbar`.

⚠ **`DockingLayout.ts:213-216` describes the OLD mechanism in the present tense.** Its comment
says the wrapper *"is re-centred to `left: 25%` by `body.pryzm-mode-inspect .wmb-toplevel-wrapper`
(inspectModeShell.ts)"*. Measured 2026-08-23: **that rule no longer exists.** `inspectModeShell.ts`
now carries it only inside a comment block explaining its removal (`:194-224`), and
`analysisSurface.ts:985-1000` records the same for the analysis copy — both superseded by
§SHELL-FLOAT-BUDGET (L-4010..L-4016). The behaviour is unchanged and correct; the comment is stale
(L-7508).

### 3.1 — `.surh-bar` — Save / Undo / Redo (`SaveUndoRedoHUD.ts`)

| # | Glyph | Name | Defined | Does | Key | STATE |
|---|---|---|---|---|---|---|
| 1 | floppy | `.surh-btn` Save | `:305-307` | Emits `pryzm-hub-action {action:'save'}` on `runtime.events` | Ctrl+S (label only — see below) | ACTIVE |
| — | divider | `.surh-divider` | `:309` | — | — | — |
| 2 | ↺ | Undo | `:320-322` | `performUndo()` — **the single unified undo path**, ring-buffer first with a `commandManager` fallback, identical to Ctrl+Z | Ctrl+Z | ACTIVE |
| 3 | ⌄ | `.surh-caret[data-surh-caret=undo]` | `:332`, `:382-397` | Opens the **Undo history** popover | — | ACTIVE |
| 4 | ↻ | Redo | `:324-326` | `performRedo()` | Ctrl+Y | ACTIVE |
| 5 | ⌄ | `.surh-caret[data-surh-caret=redo]` | `:333` | Opens the **Redo history** popover | — | ACTIVE |

**Popover leaves** (`_openPopover`, `:414-474`): a title, a permanent note stating the semantics in
words, up to `MAX_ROWS = 40` rows (`:291`), a truncation footer naming how many older steps exist,
and an explicit empty state (*"Nothing to undo yet."*).

⭐ Two honesty properties worth knowing when auditing:
* **It is sequential jump-back, not selective undo, and the UI says so.** Hovering row *k* marks
  rows 0..*k* (`.is-in-scope`, `:518-523`) so the scope is visible before the click.
* **It reports what it actually did.** `_runJump` (`:542-565`) compares `outcome.completed` against
  `outcome.requested` and raises a toast when they differ.

⚠ **Two small findings.** (a) The stylesheet defines `.surh-btn[disabled]` / `.surh-caret[disabled]`
(`:130-135`) and **no code ever sets `disabled`** — Save/Undo/Redo are always live even with an
empty stack; the empty popover is the only signal. (b) The `Ctrl+S` in the Save tooltip is a label;
this file installs no key handler. Neither is user-visible breakage; both recorded (L-7503).

### 3.2 — `.wmb-bar` — the workspace pill (`WorkspaceModeBar.ts`)

The bar hard-codes **no** mode. It renders `WORKSPACE_MODES` (`platform/workspaceModes.ts:72-105`),
the single frozen table introduced by §WORKSPACE-MODE-REGISTRY (L-3000) precisely so a new mode is
a row and not five hand-edits.

| # | Label | id | Canvas | Shortcut | What actually changes | STATE |
|---|---|---|---|---|---|---|
| 1 | Author | `author` | `full` | **F1** | DataWorkbench hidden; property panel shown | ACTIVE |
| 2 | Inspect | `inspect` | `half` (50 %) | **F2** | AuditStack right half; property panel hidden; **mounts 4 in-canvas HUDs** (§3.4) | ACTIVE |
| 3 | Analysis | `analysis` | `half` (50 %) | **F4** | `#anl-surface` right half; canvas stays visible so widgets can highlight | ACTIVE |
| 4 | Data | `data` | `hidden` | **F3** | `dataWorkbench.setMode('full')`; canvas `display:none` (hidden, **not** destroyed) | ACTIVE |

Registration: buttons at `WorkspaceModeBar.ts:56-70`; state at `WorkspaceController.setMode`
(`WorkspaceController.ts:91-103`); layout at `_applyLayout` (`:132-260`); shortcut lookup at
`workspaceModes.ts:119-121`.

Two derived behaviours to know: `_applyLayout` toggles a `body.pryzm-mode-<id>` class **for every
mode** (`:159`, was previously only `inspect` — L-3601), and it publishes the canvas region via
`publishShellCanvasRegion()` (`:213`) which is the one accounting every floating bar reads
as `var(--shell-canvas-cx)`.

⚠ **Note the F-key order: F1 · F2 · F4 · F3.** `analysis` was added between `inspect` and `data` in
pill order but took F4 so F3 would not move. Intentional; surprising when read aloud.

### 3.3 — `#alh-modebar-slot` — the active-level pill (`ActiveLevelHUD.ts`)

Slot created empty at `DockingLayout.ts:229-232`; filled at `CreatePanelLayout.ts:772-807` after a
`setTimeout(…, 600)`, with a **fallback chain** `#alh-modebar-slot` → `.plat-toolbar` →
`#alh-hud-mount` that `toolbar/__tests__/mountHost.spec.ts` requires.

| # | Glyph | Name | Defined | Does | Enabled when | STATE |
|---|---|---|---|---|---|---|
| 1 | ▼ | `.alh-arrow` down | `ActiveLevelHUD.ts:72-83` | Sets `projectContext.activeLevelId` to the next level **down** | `idx > 0`; otherwise `disabled` + title *"No lower level"* | ACTIVE / REFUSES-WITH-REASON |
| 2 | `Ground` `+0.000 m` | `.alh-info` (`.alh-name` + `.alh-elev`) | `:85-97` | **Nothing — it is not interactive.** | — | (inert label) |
| 3 | ▲ | `.alh-arrow` up | `:99-108` | Next level **up** | `idx < levels.length - 1`; otherwise disabled + *"No higher level"* | ACTIVE / REFUSES-WITH-REASON |

Levels are sorted by elevation (`:116-120`); the pill re-renders on `activeLevelChanged`,
`levelAdded`, `levelUpdated`, `levelRemoved` (`:126-138`). Both arrows carry an `aria-label` in
words, added by §ALH-BRAND (L-933), because otherwise they announce as the glyph "▼".

### 3.4 — Inspect-mode in-canvas HUDs (only in `inspect`)

Mounted by `WorkspaceController._setupInspectHUDs` (`:266-280`), torn down on mode exit (`:282-304`):

* **`.ins-lens-bar`** (`:306-325`) — 6 exclusive pills: `◌ Ghost` · `⊞ Area` · `⊡ Openings` ·
  `◫ Finishes` · `◎ X-Ray` · `⊕ Assets` (`WorkspaceController.ts:58-65`). Emits
  `pryzm-set-inspect-lens`.
* **`.ins-zslicer`** — a range input over the canvas.
* **level explode bar** — cycles `stacked` → `exploded` → `solo` (`LEVEL_MODE_ORDER`, `:56`).
* **Space key** — opens the lens picker radial, `inspect` only.

---

## §4 — REGION 3 · RIGHT RAIL — everything that creates an element

*What it is for: authoring. Five disciplines, plus grids/levels and annotation. Nothing in this
rail reads project data; everything arms a tool.*

**Root:** `.tp-panel` (52 px). Built at `ToolsPanelController.ts:117-135`; constructed at
`DockingLayout.ts:36-59`; hosted at `Layout.ts:189`. Clicking a section opens `.tpr-panel` to the
**left** (`ToolsRailController`), which carries its own pin (`:61-68`), close `×` (`:69-77`) and
resize handle (`:85-87`).

`.tp-header` is **not a control**: a static `⚙` span and the word "Tools"
(`ToolsPanelController.ts:117-132`). The dock-pin at `DockingLayout.ts:139` is appended into it.

### 4.1 — The seven section buttons

| # | Glyph | id | Defined | Registered | Opens | STATE |
|---|---|---|---|---|---|---|
| 1 | isometric house | `CREATE_ARCH` | `ToolsPanelController.ts:60-66` | `:109` | `CreateRailPanel` @ discipline `architecture` — **19 tools** | ACTIVE |
| 2 | isometric frame | `CREATE_STRUCT` | `:67-73` | `:109` | discipline `structure` — **8 tools** | ACTIVE |
| 3 | room box + partition | `CREATE_INTERIORS` | `:74-80` | `:109` | discipline `interiors` — **15 tools** | ACTIVE |
| 4 | tree | `CREATE_LANDSCAPE` | `:81-87` | `:109` | discipline `landscape` — **3 tools** | ACTIVE |
| 5 | plant/duct block | `CREATE_SERVICES` | `:88-94` | `:109` | discipline `services` — **4 tools** | ACTIVE |
| 6 | grid bubbles A/B/C + level line | `GRIDS_LEVELS` | `:95-101` | `:109` | `GridsLevelsRailPanel` — 2 tools | ACTIVE |
| 7 | annotate | `ANNOTATION` | `:102-107` | `:109` | `AnnotationRailPanel` — 19 tools | ACTIVE |

⚠ **Pill order ≠ accordion order.** The rail lists Architecture · Structure · Interiors ·
Landscape · Services; `CreateRailPanel._buildSections()` returns architecture · structure ·
services · interiors · landscape (`CreateRailPanel.ts:597,883,992,1033,1207`). The rail sets the
active discipline explicitly so the correct section opens, but a reader diffing the two files sees
two orders. Cosmetic.

### 4.2 — CREATE panel leaves — **49 creation tools**

Every row below is `label · shortcut · what the click calls · STATE`. All shortcuts come from the
single map `creationToolShortcuts.ts` (`CREATION_TOOL_SHORTCUTS`), which **overrides** any inline
`shortcut:` on the tool (`CreateRailPanel.ts:1280-1283`) so the tooltip and the key handler cannot
drift. `assertNoShortcutCollisions()` runs at import time.
✅ Measured: `pnpm --filter @pryzm/editor exec vitest run __tests__/creationToolShortcuts.test.ts`
→ **7 passed**, 2026-08-23.

Two gates fire before any of them:
`refuseElementAuthoring()` (`elementAuthoringContext.ts`) — *"is this a context where BIM elements
can be authored at all?"* — **and** `getLevels().length > 0` — *"does this model have somewhere to
put one?"*. They are asked side by side, deliberately (`CreateRailPanel.ts:205-207`).

#### ARCHITECTURE — 19

| Label | Key | Calls | STATE |
|---|---|---|---|
| Wall | `Alt+W` | `wallToolbarContribution.activate(runtime)` if the `wall.tool` contribution is registered, else `runtime.tools.activate('wall','polyline_ortho')`, else `service.activateWallTool` | ACTIVE |
| Curtain Wall | `Alt+Q` | `tools.activate('curtain-wall','SINGLE')` → `toolManager.activateCurtainWall` | ACTIVE |
| Door | `Alt+D` | `tools.activate('door','single')` | ACTIVE |
| Window | `Alt+I` | `tools.activate('window','single')` | ACTIVE |
| Stair (I) | `Alt+T` | `tools.activate('stair','I')` | ACTIVE |
| Stair (L) | `Alt+Shift+T` | `…'L'` | ACTIVE |
| Stair (U) | `Alt+Ctrl+T` | `…'U'` | ACTIVE |
| Stair (C) | `Alt+Shift+Ctrl+T` | `…'C'` | ACTIVE — the curved shape had no palette icon until §FIX-STAIR-SHAPE-DESYNC; the shape set is now declared once in `STAIR_SHAPES` |
| Handrail | `Alt+H` | `tools.activate('handrail', selectedTypeId)` — **activates on the FIRST click**, exactly like Wall; the old blocking type-picker is gone (§FIX-HANDRAIL-PANEL-ORDER, L-1104) | ACTIVE |
| **Balcony** | `Alt+Shift+A` | `activatePlanOnlyToolOrExplain('balcony','Balcony')` — **plan-only** | **REFUSES-WITH-REASON** in 3-D (§4.5) |
| **Lift** | `Alt+Shift+V` | `activatePlanOnlyToolOrExplain('lift','Lift')` — arms `LiftPlanToolHandler`, the C104 **compound** | **REFUSES-WITH-REASON** in 3-D (§4.5) |
| Ramp | `Alt+P` | `tools.activate('ramp')` → `window.rampTool.activate()`; logs `[Ramp] rampTool not ready` if absent | ACTIVE (legacy global bridge) |
| Ceiling | `Alt+C` | `tools.activate('ceiling')` | ACTIVE |
| Auto Ceiling | `Alt+Shift+C` | `tools.activate('ceiling:auto')` — mode passed as an **activation argument**, not set on the 3-D tool instance | ACTIVE |
| Floor | `Alt+F` | `tools.activate('floor')` | ACTIVE |
| Auto Floor | `Alt+Shift+F` | `tools.activate('floor:auto')` — see §FIX-FINISH-MODE-PLAN-UNREACHABLE: setting the mode on the instance made AUTO 3-D-only | ACTIVE |
| Room | `Alt+R` | `tools.activate('room')` → `window.roomTool.activate()` | ACTIVE |
| Room (level) | `Alt+Shift+R` | `tools.activate('room:level')` → `roomTool.detectRoomsForLevel(...)` | ACTIVE |
| Room Bounding | `Alt+B` | `tools.activate('room-bounding')` → `window.roomBoundingLineTool` | ACTIVE |

#### STRUCTURE — 8

| Label | Key | Calls | Sub-controls | STATE |
|---|---|---|---|---|
| Column | `Alt+K` | opens **`ColumnModePicker`** first; its `onSelectType(config)` then `tools.activate('column', JSON.stringify({profile,width,depth,steelProfileName}))` | pre-flight profile picker | ACTIVE |
| Beam | `Alt+E` | **`BeamModePicker`** → `tools.activate('beam', …)` | pre-flight profile picker | ACTIVE |
| Slab | `Alt+S` | activates **immediately** in `resolveActiveSlabDrawMode()`; every mode reachable mid-draw from `DrawingModeBar` | 10-mode bar (§7.1) | ACTIVE |
| Roof (2pt) | `Alt+O` | `tools.activate('roof','2point')` | — | ACTIVE |
| Roof (poly) | `Alt+Shift+O` | `…'polyline'` | — | ACTIVE |
| Roof (region) | `Alt+Ctrl+O` | `…'region'` | — | ACTIVE |
| Roof (single slope) | `Alt+Shift+Ctrl+O` | `…'single_slope'` | — | ACTIVE |
| Slab Opening | `Alt+N` | **`OpeningModePicker`** → 2-Point / Polyline | 2-leaf picker | ACTIVE |

#### SERVICES — 4

Bath `Alt+J` · Toilet `Alt+L` · Sink `Alt+Y` · Shower `Alt+G` — all
`tools.activate('plumbing','<kind>')` → `service.activatePlumbingTool`. All ACTIVE. Shower routes
through the standard plumbing pipeline on purpose (Contract 39 §2, type-as-data) so it inherits the
variant picker and wall-snap preview.

#### INTERIORS — 15

Sofas `Alt+A` · Chairs `Alt+M` · Tables `Alt+U` · Beds `Alt+V` · Wardrobes `Alt+X` · Outdoor
`Alt+Z` · Kitchen `Alt+Shift+K` · Decor `Alt+Shift+D` · Soft Furnishings `Alt+Shift+S` · Bathroom
`Alt+Shift+B` · Storage `Alt+Shift+G` · Kids `Alt+Shift+I` · Teens `Alt+Shift+E` — each has
`action: () => {}` and a `subPanel { furniturePanel:true, furnitureCategory:'<id>' }` handled by
`FurnitureSidePanel`. **Lighting** `Alt+Shift+L` → `buildLightingPanel` (`CreateRailPanelLighting.ts`).
**Component** `Alt+Shift+M` → `openFamilyCreatorPlaceholder()` — a **placeholder**; the Family
Creator is under reconstruction (`CreateRailPanel.ts:1191-1200`). All ACTIVE as controls;
*Component* opens a placeholder by design, which is a shipped refusal, not a dead button.

#### LANDSCAPE — 3

| Label | Key | Calls | STATE |
|---|---|---|---|
| **Swimming Pool** | `Alt+Shift+Q` | `activatePlanOnlyToolOrExplain('pool','Swimming Pool')` | **REFUSES-WITH-REASON** in 3-D |
| Trees | `Alt+Shift+P` | sub-panel from `buildTreeCreateItems()` — **derived** from `LANDSCAPE_CATALOGUE`, not hand-typed (L-1380) | ACTIVE |
| Potted Plants | `Alt+Shift+W` | `buildPottedPlantCreateItems()` | ACTIVE |

⚠ **A stale comment inside `CreateRailPanel.ts:734-748`** (the Balcony row) still asserts *"there
is NO palette row for [the pool] anywhere — so the founder's original report is still live."* The
pool row is eleven lines below it at `:1245`. Comment only; no behavioural effect (L-7505).

### 4.3 — GRIDS & LEVELS — 2 tools, mutually exclusive

`GridsLevelsRailPanel.ts:63-107`.

| Label | Calls | Enabled when | STATE |
|---|---|---|---|
| **Grid** | `ToolManager.activateGrid` → `GridPlanToolHandler` | a **plan** pane is active (`activePlanPane()`) | REFUSES-WITH-REASON — hint reads *"Plan view active — Grid is enabled."* / the section/elevation variant (`:163-170`) |
| **Level** | `AddLevelCommand` via the active CommandManager (so it joins undo + persistence, §22-LEVELS-GRIDS) | a **section / elevation** pane is active | REFUSES-WITH-REASON |

⭐ The enabled state re-syncs on `view-activated` **and** on `split-view-activated` /
`-deactivated` / `-view-changed` (`:94-103`). Listening only to the former is exactly why the
button never woke up when the *right* split pane became the plan view (§FIX-SPLIT-VIEW-IS-PLURAL,
L-1107).

### 4.4 — ANNOTATION — 19 tools, registry-driven

`AnnotationRailPanel.build()` reads `toolRegistry.getBySection('ANNOTATION')` (`:44`) and renders
an explicit empty state if the registry is empty (`:46-52`). The 19 registrations are all in
`apps/editor/src/engine/initAnnotationTools.ts:5-23`:

Linear Dimension · Text Note · Tag Element · Angular Dim · Spot Elevation · Keynote · Radius Dim ·
Diameter Dim · Slope Dim · Door Tag · Window Tag · Level Tag · Grid Bubble · Section Mark ·
Elevation Mark · Callout Detail · Revision Cloud · **Ann. Visibility** (lazy-inits
`AnnotationVisibilityPanel` into `#ann-vg-panel-mount` on first use) · **AI Annotate** (fires
`AnnotateViewCommand` with a progress toast). All ACTIVE.

### 4.5 — What "plan-only" means, precisely

Three palette rows — **Balcony**, **Lift**, **Swimming Pool** — do **not** go through
`runtime.tools.activate`. `TOOL_MANAGER_TOOL_KEYS` has no key for `pool` or `balcony`
*by design*: a hosted compound is placed in plan. Calling the 3-D route would *report activation
and activate nothing*, which is the founder's original "Create Stair" defect.

`activatePlanOnlyToolOrExplain()` (`ui/create/activatePlanOnlyTool.ts:196-204`) instead:

1. arms the tool on **every attached plan overlay** — `window.planViewToolOverlay` and
   `window.svpPlanToolOverlay`, both built from the one `planToolHandlerRegistry` (L-73);
2. if **zero** surfaces accepted it, returns `ok:false` with the reason
   *"`<Label>` is placed in a PLAN view, and no plan view is open. Open a floor plan (or switch to
   split view) and choose `<Label>` again."* (`:118-127`) — delivered through `runtime.toasts`,
   **not** the `pryzm:toast` event, which had zero subscribers (`:157-183`, L-7005);
3. on success opens a **session** (`beginPlanOnlyToolSession`, `:355-424`) that owns: the shared
   `DrawingModeBar`, suppression of 3-D selection, an armed-selection snapshot taken *before* the
   suppression, an Escape teardown, and one sentence naming which pane owns the tool.

`PLAN_ONLY_MODE_STORES` (`:287-297`) covers **`pool`** (`Pool:` bar, 6 modes) and **`balcony`**
(`Balcony:` bar, 2 modes). **`lift` deliberately has no mode strip** — one click, and the only
varying axis (wall-hosted vs standalone) is resolved from the cursor, because
`LiftCompoundSchema` refuses `wall-hosted` without a `hostWallId`
(`elementCreationMatrix.ts:606-614`).

---

## §5 — REGION 4 · BOTTOM DOCK — view state, not authoring

*What it is for: how the model is being **shown** — camera, level stacking, cutaways, lighting,
labels — plus one creation shortcut row and one importer.*

**Root:** `.bam-container` (`BottomActionMenu.ts:183-197`), appended to `document.body` at
`DockingLayout.ts:246`. **Starts collapsed** (`bam-container--collapsed`, `:184`). Three rows:
`.bam-structure-row` (hidden), `.bam-control-row`, `.bam-toggle-row`.

### 5.1 — The chevron

| Glyph | Name | Defined | Does | STATE |
|---|---|---|---|---|
| `⌃`/`⌄` | `.bam-toggle-btn` | `:191-196`, handler `:258-264` | Expands/collapses the dock. Title flips `Show toolbar` ↔ `Hide toolbar`. Collapsing also closes the tool menu. | ACTIVE |

### 5.2 — `.bam-control-row`, left to right — **12 controls**

| # | Glyph | Name / title | Defined | Does | Enabled when | STATE |
|---|---|---|---|---|---|---|
| 1 | current tool icon (default wall) / `+` when open | `.bam-btn--circle-tool` | `:1157-1169` | Toggles `.bam-structure-row` (§5.3) | always | ACTIVE |
| — | `.bam-sep` | — | `:1170` | — | — | — |
| 2 | plan rect + `2D` badge | *Camera: Perspective / Orthographic* | `:1174-1185` | `_toggleCamera()` | always | ACTIVE |
| 3 | stacked / exploded / solo cubes | *Level Stack: Stacked \| Exploded \| Solo active level* | `:1187-1193` | `_cycleLevelMode()`, cycles the 3 modes | always | ACTIVE |
| 4 | rect + dashed midline | *Wall Cutaway* | `:1194-1199` | `_toggleWallCutaway()` | always | ACTIVE |
| 5 | short rect + studs | *Wall Low Height* | `:1200-1205` | `_toggleWallLowHeight()` | always | ACTIVE |
| 6 | sun ⇄ moon | *Day mode / Night mode* | `:1206-1211` | `_toggleDayNight()` | always | ACTIVE |
| 7 | eye | *Elements in View* | `:1212-1217` | `_toggleElementsInView()` | always | ACTIVE |
| 8 | tag + dot | *Room labels: On — click to hide / Off — click to show* | `:1218-1223` | `_toggleRoomLabels()` | always | ACTIVE |
| 9 | level stack + up-arrow | *Active Level Only* | `:1224-1229` | `_toggleActiveLevelOnly()` | always | ACTIVE |
| 10 | circular arrow | *Reset view controls* | `:1229-1233` | `_resetView()` | always | ACTIVE |
| 11 | corner brackets + dashed cross | **Section** | `:1234-1250` | `_toggleSectionBox()` | **capability-gated** | **REFUSES-WITH-REASON** — see below |
| — | `.bam-sep` | — | `:1252` | — | — | — |
| 12 | tray + up-arrow + `IFC` badge | **Import IFC model** | `:1256-1268` | emits `import-ifc` on `runtime.events` | always | ACTIVE |

⭐ **Control 11 is the cleanest refusal in the shell and worth copying.**
`resolveSectionClipCapability()` (`engine/inspect/SectionClipCapabilityResolver.ts:144-192`)
returns three distinct verdicts, and the button renders `disabled` with the reason as its title:

* renderer not yet built → *"Section: the 3D renderer is still starting up — try again in a moment."*
  (a state that resolves itself);
* WebGPU backend → *"Section: unavailable on WebGPU. The active GPU backend (`<name>`) draws
  through the WebGPU renderer, which provides no clipping-plane API. **Switch GPU to WebGL in the
  GPU control** to cut a 3D section."* — it names the remedy, and the remedy is Region 5's GPU pill;
* an exception → fails **closed**, with a reason.

`BottomActionMenu.ts:1240-1245` states the rule outright: *"a button that looks live while cutting
nothing is the C06 §13.5 defect"*.

### 5.3 — `.bam-structure-row` (revealed by control 1) — 7 tools

`STRUCTURE_TOOLS` (`:81-89`), each with a two-letter badge that is also its **keyboard combo**
(`_attachKeyboardShortcuts`, `:288`):

| Glyph | Label | Badge / key | Calls | STATE |
|---|---|---|---|---|
| wall | Wall | `WA` | `service.activateWallTool(POLYLINE_ORTHO)` | ACTIVE |
| curtain wall | Curtain Wall | `CW` | `toolManager.activateCurtainWall('SINGLE')` | ACTIVE |
| door | Door | `DO` | `activateDoor('single')` | ACTIVE |
| window | Window | `WN` | `activateWindow('single')` | ACTIVE |
| slab | Slab | `SL` | `service.activateSlabTool(resolveSlabReentryMode(resolveActiveSlabDrawMode()))` | ACTIVE |
| floor | Floor | `FL` | floor tool | ACTIVE |
| ceiling | Ceiling | `CE` | ceiling tool | ACTIVE |

The selected tool persists in `localStorage` (`TOOL_STORAGE_KEY`, `:180-181`) and becomes control
1's glyph. **Both** the click path and the two-letter combo pass one funnel,
`_activateStructureTool` (`:375`), which consults `refuseElementAuthoring()` first — because the
keydown listener is bound to `window` at construction and is live whether or not the bar is on
screen.

⚠ The slab re-entry line is itself a closed defect worth knowing (L-956): the comment promised
"every mode, including By Region / Hollow / Pick Walls" while passing a function whose return type
(`linear|ortho|curved`) could name none of them.

---

## §6 — REGION 5 · BOTTOM-LEFT — the launcher rail and the GPU escape hatch

*What it is for: the corner where always-on floating controls live. It is a **declared, slotted,
collision-free column** — not a place things are hand-positioned.*

The policy is `apps/editor/src/ui/layout/zLayers.ts:94-169`. Slot 0 sits at `bottom: 54px`,
`left: 12px`, pitch 44 px, at the `launcher` z-layer (10000). The GPU pill sits **below** it at
`bottom: 10px` on the `critical` layer (2147483000).

| Position | Control | Defined | Registered | Does | STATE |
|---|---|---|---|---|---|
| slot 0 | **Split View toggle** — two panels + dashed divider, `#svp-toggle-button` `.svp-toggle-btn` | `initUI.ts:3492-3541` | `initUI.ts:3507` (`launcherRailStyle('splitView')`) | `window.splitViewManager.toggle()`; title flips *Split View — 3D + Floor Plan* ↔ *Close Split View*; state re-synced on `split-view-activated` / `-deactivated` | ACTIVE. If `splitViewManager` is not yet ready it logs `[SplitView] splitViewManager not yet ready` and does nothing — a **console-only** refusal, not user-visible (L-7506) |
| below slot 0 | **GPU strip** — `GPU:` `Auto` `WebGPU` `WebGL` `· <active backend>` | `overlays/RendererBackendToggle.ts:60-127` | mounted by `initScene` after the backend is known (`:278`) | Live in-place renderer swap via `window.pryzmSwapRendererBackend` (ADR-0077). Persists the preference. | ACTIVE ×3 buttons; the `· webgl-only` suffix is a **read-only** status span (`:118-124`) |

**GPU strip leaves.** Each button carries a real tooltip: *Auto* — "WebGPU when available, else
WebGL"; *WebGPU* — "Force the full WebGPU pipeline (SSGI/TRAA/shadows)"; *WebGL* — "Force plain
WebGL2 — simpler & very stable, no post-FX". A failed swap **does not reload** — it rolls back and
raises an inline notice *"Couldn't switch to X — staying on Y. The viewport is unchanged."*
(`:212-236`), because a plain reload dumps the user at the project hub (§FIX-SWAP-WEBGL-TO-WEBGPU-CRASH,
L-153). The persist+reload path survives only for the case where no live-swap entry point exists
at all (`:186-188`).

### 6.1 — ⚠ Seven of the eight declared slots are empty

`LauncherSlot` declares eight names and `LAUNCHER_SLOT_INDEX` gives each an index
(`zLayers.ts:133-154`): `splitView` 0 · `siteView` 1 · `planGis` 2 · `graph` 3 · `livingGraph` 4 ·
`siteAnalysis` 5 · `envelopeCard` 6 · `resetLayout` 7.

**Measured 2026-08-23, two tools:** `launcherRailStyle(` has exactly **one** call site
(`initUI.ts:3507`, slot `splitView`). `GISAreaLayout.ts:15-17` records why: *"this file mounted six
launcher-rail pills and now mounts none"* (§GIS-ACTION-REGISTRY, L-1360) — the six moved into the
GIS panel's registry (§2.4), and the ⟲ reset button moved with them as `panel.reset-layout`
(`GISAreaLayout.ts:5047-5060`).

**This is a deliberate consolidation, not a lost capability**, and it is defended by a test:
`gisActionRegistry.test.ts` asserts by scanning production source that every entry point the
registry declares is still registered somewhere. **The seven unused slot names are stale
declaration.** STATE: **DECLARED-BUT-UNREACHABLE** (declaration only — no user-visible control is
missing) (L-7507).

---

## §7 — REGION 6 · BOTTOM-RIGHT — two stacked 36 × 36 buttons

*What it is for: the two panels that were made default-closed and therefore needed a visible route
back (C82 §1.1 — absence is legal, unreachability is not).*

Same right edge (`right: 14px`), 36 × 36, 6 px apart, both at `z-index: 1200`.

| Position | Glyph | Name | Defined | Registered | Does | Enabled when | STATE |
|---|---|---|---|---|---|---|---|
| upper (`bottom: 122px`) | `◑` | **View properties — Environment & Camera** · `#pryzm-view-properties-launcher` · testid `view-properties-launcher` | `layout/ViewPropertiesLauncher.ts:94-145` | `installViewPropertiesLauncher()`, called from `GISAreaLayout.ts:35` | `setPanelOpen('view-properties', !open)`; `phaseChrome` does the DOM | **Not mounted at all** on `onboarding-globe` (`panelAbsent('view-properties-launcher')`, `:160-164`) — skip-mount, so it is not in the accessibility tree either | ACTIVE on canvas; ABSENT-by-design on the globe |
| lower (`bottom: 80px`) | `⚡` | **Render Performance Settings** · `#perf-mode-trigger` | `rendering/PerformanceModePanel.ts:82-116` | mounted by `RenderAreaLayout` | Toggles the render-settings popover | always | ACTIVE |

⚠ **The `◑` glyph is a text character, not an icon**, chosen so the file adds no dependency
(`ViewPropertiesLauncher.ts:100-102`). Its colours come from tokens; `#perf-mode-trigger` is painted
`rgba(18,24,38,0.92)` — near-black — which `ViewPropertiesLauncher.ts:30-36` **records as a known
divergence from the white+purple palette** rather than copying it.

### 7.1 — `⚡` popover leaves (`PerformanceModePanel.ts:143-222`)

| Control | id | Does |
|---|---|---|
| **⚡ Performance Mode** master switch | `#pmp-perf-toggle` | `_enablePerfMode()` / `_disablePerfMode()` — "Disables shadows, ambient occlusion, and anti-aliasing for faster navigation with heavy models" |
| Shadows | `#pmp-shadows-toggle` | `_setShadows()` — "Real-time shadow maps" |
| Ambient Occlusion | `#pmp-ssgi-toggle` | `_setSsgi()` — "SSGI / screen-space AO" |
| Anti-aliasing (TRAA) | `#pmp-traa-toggle` | `_setTraa()` — "Temporal smoothing" |
| **Restore Full Quality** | `#pmp-restore-btn` | `_restoreQuality()` |

All ACTIVE. The trigger's title flips to *"Performance Mode Active — click to adjust"* while on
(`:425`), and a badge reading `⚡ PERF MODE — loading model` appears during heavy loads (`:359`).
The panel closes on outside click (`:227-232`).

---

## §8 — Cross-cutting surfaces the six regions summon

These are not in any bubbled region; they appear *over* the canvas in response to a selection or an
armed tool. An audit of the six regions is incomplete without them.

### 8.1 — `.ceb-bar` — the Contextual Edit Bar (selection-driven)

`ContextualEditBar.ts` (1464 LOC), constructed at `DockingLayout.ts:159`. Fixed at `top: 56px`,
`left: var(--shell-canvas-cx)` — i.e. centred on the **canvas region**, not the viewport
(`styles/panels/platform-shell/contextualEditBar.ts:25-42`). Hidden by default; `setVisible(true)`
adds `.ceb-bar--visible` (`:1453-1459`).

| Group | Button | id | Key | Notes | STATE |
|---|---|---|---|---|---|
| History | Undo | `undo` | `Ctrl+Z` | `service.undo()` | ACTIVE |
| History | Redo | `redo` | `Ctrl+Y` | `service.redo()` | ACTIVE |
| Transform | Move | `move` | `MV` | operation `move` | ACTIVE |
| Transform | Rotate | `rotate` | `R` | **capability-gated (`canDo`)** — shows only on elements that actually rotate (furniture / column / underlay); on line and area elements the gizmo rotation never committed (§EDIT-MODE-ROTATE) | ACTIVE / hidden-with-reason |
| Transform | Copy | `copy` | `Ctrl+C` | operation `copy` | ACTIVE |
| Edit | Delete | `delete` | `Del` | multi-select ⇒ **one** undo entry (§MULTI-SELECT-SHIFT, L-1552) | ACTIVE |
| Edit | Edit Profile | `edit-profile` | `P` | live only when the selected type's tool exposes `enterProfileEditMode` — `slab`/`floor`/`ceiling`/`wall`, checked at runtime (`:1433-1451`) | REFUSES-WITH-REASON (disabled) |
| Ops | Join | `join` | `J` | `JoinTool` | ACTIVE |
| Ops | Cut / Trim | `cut` | `X` | `CutTool` | ACTIVE |
| Ops | Mirror | `mirror` | `F` | `MirrorTool` | ACTIVE |
| Ops | Scale | `scale` | `S` | `ScaleTool` | ACTIVE |
| Ops | Aligned | `align` | `L` | align op | ACTIVE |
| Ops | Offset / Parallel | `offset` | `O` | `OffsetTool` | ACTIVE |
| Ops | Reference Edit | `reference-edit` | `E` | `ReferenceEditTool` | ACTIVE |

The seven operation tools are **injected** from `DockingLayout.ts:163-171`, with a
`bim-engine-ready` fallback (`:173-187`) for the case where the command manager is not yet up. If
neither path runs, the seven ops would be inert — not observed, recorded as an unverified axis.

### 8.2 — `.wdh-bar` — the persistent DrawingModeBar

`DrawingModeBar.ts` (200 LOC) is **the one mode strip every drawing tool shares**. It replaced four
near-identical HUDs (`WallDrawingHUD`, `FloorDrawingHUD`, `CeilingDrawingHUD`,
`CurtainWallDrawingHUD`) that had already drifted apart.

Three properties an auditor should check for in any new tool:

1. **The mode list is not hard-coded** — it comes from `creationModes(tool)` in
   `elementCreationMatrix.ts`, the same declaration the matrix spec asserts against, so a launcher
   and its in-draw bar cannot offer different sets.
2. **A pill click writes the shared mode store and never re-activates the tool** (`:195-199`) —
   re-activation runs `deactivateAllInternal()` and destroys the in-progress polyline, which was
   the whole of the founder's slab complaint.
3. **It refuses to render outside an authoring context** — `refuseElementAuthoring()` at
   `:103`, one line at the one constructor, covering wall / curtain wall / slab / floor / ceiling /
   pool / balcony in a single place.

An **action** (`isAction: true`, e.g. Wall's *By Slab*) is placed after a separator and never takes
the active highlight (`:118-125`). The bar also claims its accelerator key with
`stopImmediatePropagation` so it cannot also reach a focused toolbar button (`:159-172`).

Declared mode sets (`elementCreationMatrix.ts`), for reference when auditing a bar:

| Tool | Modes | AUTO in | Mode store |
|---|---|---|---|
| `wall` | wall-draw trio + **By Slab** (action) + Rectangular `Q` / Circular `I` / Elliptical `E` | plan, 3d | shared |
| `slab` | trio + 2-Point `2` / Circular `I` / Elliptical `E` / By Region `R` / Hollow `H` / Pick Walls `W` | plan, 3d | `activeSlabDrawMode.ts` |
| `floor` | trio + Rectangle `R` / Circular `I` / Elliptical `E` / **Auto `A`** | plan, 3d | `floorModePicker` + `FloorToolConfigStore` |
| `ceiling` | same as floor | plan, 3d | shared |
| `curtain-wall` | Single `S` / Orthogonal `O` / Linear `L` | — (declared gap: no unambiguous host to infer) | shared |
| `column` | Rectangular `R` / Round `O` | — (declared gap: no grid-intersection auto-place) | shared |
| `pool` | trio + Rectangular `Q` / Circular `I` / Elliptical `E` | — (not applicable) | `activePoolDrawMode.ts` |
| `balcony` | 2 modes | — | `activeBalconyPlacement.ts` |
| `lift` | **none, deliberately** | — | n/a |

⭐ The matrix distinguishes *"not applicable"* from *"not implemented"* and says which each is —
that distinction is what makes the `gap:` field auditable rather than decorative.

---

## §9 — The matrix-vs-registry diff (the check the brief asked for)

Three id sets must agree:

* **the matrix** — `tool:` ids in `ELEMENT_CREATION_MATRIX`
  (`apps/editor/src/engine/views/plantools/elementCreationMatrix.ts`), **22 ids**;
* **the plan registry** — keys of `createPlanToolHandlers()`
  (`planToolHandlerRegistry.ts:116-185`), consumed by *both* plan overlays;
* **the 3-D registry** — `TOOL_MANAGER_TOOL_KEYS` (`packages/input-host/src/ToolManager.ts:58-65`),
  **36 keys**;

plus **the activators** — `runtime.tools.register('<id>', …)`, **51 ids** across
`ToolsAreaLayout.ts` (24 calls, `:173-332`) and `PluginRegistry.ts`.

### 9.1 — ✅ The `railing` / `handrail` mismatch PERF13 found is CLOSED

`ToolsAreaLayout.ts:217-218` now registers **both** spellings against one activator:

```
runtime.tools.register('handrail', activateRailingFamily);
runtime.tools.register('railing',  activateRailingFamily);
```

The palette calls `_activateTool('handrail', …)`; the matrix declares `railing`; both resolve.
✅ Measured: `npx vitest run apps/editor/src/engine/views/plantools/__tests__/elementCreationMatrix.spec.ts`
→ **144 tests passed**, 2026-08-23.

### 9.2 — ⛔ `check-tool-activator-coverage` is RED, ARM A = 2 against a baseline of 0

```
npx tsx tools/ga-gate/check-tool-activator-coverage.ts > /tmp/tac.txt 2>&1; echo "RC=$?"
```
→ **RC=1**, 2026-08-23:

```
[tool-activator-coverage] 22 declared matrix tool id(s) · 51 registered activator id(s)
  · 0 named exemption(s) · ARM A uncovered 2/0 · ARM B phantom 0/0
[tool-activator-coverage] ARM A FAIL — 2 declared tool id(s) have NO registered activator (baseline 0):
    · balcony
    · pool
```

**What this does and does not mean, precisely.**

* It does **not** mean the palette rows are broken. Balcony and Swimming Pool route through
  `activatePlanOnlyToolOrExplain`, which never touches `runtime.tools` (§4.5). Those two rows are
  `REFUSES-WITH-REASON`, correctly.
* It **does** mean that any *other* caller of `runtime.tools.activate('pool')` or `('balcony')` —
  the AI chat route, a plugin, a future toolbar — records an active tool id and arms nothing. That
  is the exact silent-success shape the gate was built to catch.
* ⚠ **And a comment in the matrix asserts the opposite.** `elementCreationMatrix.ts:270-273`
  states: *"The activator id `pool` is already registered in PluginRegistry so
  check-tool-activator-coverage ARM A stays at 0."* The gate scans `REGISTER_FILES`
  (`ToolsAreaLayout.ts` + `PluginRegistry.ts`) for the literal `tools.register('<id>'`
  (`check-tool-activator-coverage.ts:215-223`). `PluginRegistry.ts` carries a plugin **descriptor**
  `id: 'pool'` (`:291`), which is a different thing. **The comment is false as written.** (L-7501)

### 9.3 — Declared 3-D gaps that are named, not hidden

| Tool | Matrix `views` | 3-D key present? | Named gap |
|---|---|---|---|
| `pool` | `['plan']` | no | *"No 3-D arm yet … NOT a missing handler — `pool.create` is fully dispatchable and the plan arm drives it."* |
| `balcony` | `['plan']` | no | same shape — a hosted compound is placed against a façade in plan |
| `lift` | `['plan','3d']` | **yes** | ⛔ *"THE 3-D ARM AND THE PLAN ARM CREATE DIFFERENT THINGS."* `ToolManager.activateLift` drives the legacy massing `CreateVerticalCirculationCommand`; the plan arm drives the C104 **compound** `lift.create`. `runtime.tools.register('lift', …)` at `ToolsAreaLayout.ts:332` binds the **legacy** one. The palette offers the compound only. Collapsing them is L-7040. |
| `lighting` | `['plan']` | no | matrix row `:651-652` |

⭐ **Declaring `'3d'` to look complete is the C84 EI-3 defect**, and the matrix spec asserts the
negative as hard as the positive — a declared-but-absent 3-D arm fails **by name**. That is why
these rows read as gaps rather than as coverage.

---

## §10 — What could not be determined, and why

Named blanks, not guesses.

1. **Whether any control actually places geometry.** This map is static wiring. `pointer →
   handler → command → mesh` needs a browser. The repo's own gate says the same
   (`check-tool-activator-coverage.ts`: *"THIS GATE PROVES WIRING, NOT BEHAVIOUR"*).
2. **Whether the Project Hub's sixteen actions reach `PlatformProjectBrowser` at runtime.** The
   subscriber exists (`:194`) and every action has a `case`, but the relay depends on that class
   being constructed and its listener being live — the hub's own `§HUB-DISPATCH` log exists to
   detect exactly that. Not exercised here.
3. **Whether `ContextualEditBar`'s seven operation tools are injected in every boot path.**
   `DockingLayout.ts` has a primary path and a `bim-engine-ready` fallback; which one fires in
   production was not measured.
4. **What `.plat-toolbar` contains in the canvas phase.** It is a *fallback* host for the level
   pill and may be phase-hidden. Not bubbled by the founder, not mapped here.
5. **The ViewCube** (`ViewCube.mountOrReplace`, `NavigationAreaLayout.ts:265`) — top-right
   navigation HUD, present in the shell, outside all six bubbles. Not mapped.
6. **`SiteViewQuickToggle`** (`.svq-bar`, `engine/views/SiteViewQuickToggle.ts`) — a top-centre
   `2D Site Map | 3D Site | 3D Globe | Split` bar that exists **only in the site-authoring
   context**, so it is not in the editor screenshot. It enrols in the same
   `var(--shell-canvas-cx)` budget as Region 2. Its `⊕ 3D Globe` control is
   **REFUSES-WITH-REASON when no camera port is injected** (`:90-95`) — *"a bar that quietly grows
   and shrinks is how a control becomes untestable."* Worth a map of its own.
7. **Why `Grep` missed `initUI.ts`.** Reproduced, not explained (§0).

---

## §11 — SUMMARY TABLE — every control, one row, with its state

*This is the audit page. `n×` means n sibling controls sharing one row.*

| # | Region | Control | Source | STATE |
|---|---|---|---|---|
| 1 | 1 Left rail | PRYZM logo → Project Hub | `ProjectBrowserPanel.ts:278` | ACTIVE |
| 2 | 1 | AI chat launcher | `:326` | ACTIVE |
| 3 | 1 | Project Browser | `:255` | ACTIVE |
| 4 | 1 | Levels & Grids *(gear glyph — mislabelled asset)* | `:256` | ACTIVE |
| 5 | 1 | Views & Sheets | `:257` | ACTIVE |
| 6 | 1 | Visibility Intent | `:258` | ACTIVE |
| 7 | 1 | Camera & Render | `:259` | ACTIVE |
| 8 | 1 | Inspect | `:260` | ACTIVE |
| 9 | 1 | GIS | `:261` | ACTIVE |
| 10 | 1 | Parcel | `:268` | ACTIVE |
| 11 | 1 | AI & Tools | `:269` | ACTIVE |
| 12 | 1 | Physics | `:270` | ACTIVE |
| 13 | 1 | Dock pin | `DockingLayout.ts:136` | ACTIVE |
| 14–16 | 1 | Rail panel pin / close / 2× resize | `RailPanelController.ts:71,79,95,100` | ACTIVE |
| 17–32 | 1 → Hub | 16 hub action items | `ProjectBrowserPanel.ts:470-530` | ACTIVE ×16 |
| 33–37 | 1 → Hub | 4 setting toggles + 1 opacity slider | `:500-512` | ACTIVE ×5 |
| 38 | 1 → Hub | Room Bounding · Walls | `:522` | **read-only by design** ("always participates — cannot be disabled") |
| 39–40 | 1 → Hub | Room Bounding · Columns / Curtain Walls | `:523-524` | ACTIVE ×2 |
| 41–43 | 1 → AI | Review · AI Chat · ✦ AI Create | `AIRailPanel.ts:61,75,84` | ACTIVE ×3 |
| 44 | 1 → AI | PDF Import | `AIRailPanel.ts:94` | ACTIVE |
| 45–48 | 1 → Physics | Off / Thermal / Acoustic / Daylight | `PhysicsRailPanel.ts:26,33,40,48` | ACTIVE ×4 |
| 49–51 | 1 → Documents | Views / Sheets / Schedules tabs | `DocumentsBrowserPanel.ts:168-172` | ACTIVE ×3 |
| 52–53 | 1 → Browser | Project / Elements cards | `UnifiedBrowserPanel.ts:248-249` | ACTIVE ×2 |
| 54–64 | 1 → GIS | 11 live registry actions | `gisActionRegistry.ts:159-315` | ACTIVE ×11 |
| 65 | 1 → GIS | **Floors shown** | `gisActionRegistry.ts:319-337` | **REFUSES-WITH-REASON** — `entryPoints: []`, renders disabled with the reason |
| 66 | 1 → GIS | Reset panel layout | `:377-382` | ACTIVE (app-wide) |
| — | 1 | **`LeftNavRail` — 8 panels, 976 LOC** | `NavigationAreaLayout.ts:251` | **DECLARED-BUT-UNREACHABLE** — `void leftNavRail; // suppressed — not mounted` (`:256`) |
| — | 1 | `SECTION_ICONS.RENDER` | `ProjectBrowserPanel.ts:94` | **DECLARED-BUT-UNREACHABLE** — no `RENDER` section id exists |
| 67 | 2 Top bar | Save | `SaveUndoRedoHUD.ts:305` | ACTIVE |
| 68 | 2 | Undo | `:320` | ACTIVE |
| 69 | 2 | Undo history caret | `:332` | ACTIVE |
| 70 | 2 | Redo | `:324` | ACTIVE |
| 71 | 2 | Redo history caret | `:333` | ACTIVE |
| 72–75 | 2 | Author / Inspect / Analysis / Data | `workspaceModes.ts:72-105` | ACTIVE ×4 (F1 / F2 / F4 / F3) |
| 76 | 2 | Level ▼ | `ActiveLevelHUD.ts:72` | ACTIVE; disabled + *"No lower level"* at the bottom |
| 77 | 2 | Level name + elevation | `:85-97` | **inert label — not a selector** |
| 78 | 2 | Level ▲ | `:99` | ACTIVE; disabled + *"No higher level"* at the top |
| 79–84 | 2 (inspect) | 6 lens pills | `WorkspaceController.ts:59-66` | ACTIVE ×6 |
| 85–87 | 2 (inspect) | Z-slicer · explode bar · Space radial | `:266-280` | ACTIVE ×3 |
| 88–94 | 3 Right rail | 7 section buttons | `ToolsPanelController.ts:60-107` | ACTIVE ×7 |
| 95–97 | 3 | `.tpr-panel` pin / close / resize | `ToolsRailController.ts:61,69,85` | ACTIVE ×3 |
| — | 3 | `.tp-header` ⚙ + "Tools" | `ToolsPanelController.ts:126-130` | **not a control** (static label) |
| 98–113 | 3 → Architecture | 16 directly-arming tools | `CreateRailPanel.ts:602-878` | ACTIVE ×16 |
| 114 | 3 → Architecture | **Balcony** | `:734-748` | **REFUSES-WITH-REASON** — plan-only; toast names the pane and the route back |
| 115 | 3 → Architecture | **Lift** | `:768-775` | **REFUSES-WITH-REASON** — same; arms the C104 compound, **not** the legacy massing command |
| 116 | 3 → Architecture | Ramp | `:776-787` | ACTIVE via `window.rampTool` legacy bridge |
| 117–124 | 3 → Structure | Column · Beam · Slab · Roof ×4 · Slab Opening | `:888-983` | ACTIVE ×8 (Column/Beam/Opening open a pre-flight picker first) |
| 125–128 | 3 → Services | Bath · Toilet · Sink · Shower | `:997-1026` | ACTIVE ×4 |
| 129–142 | 3 → Interiors | 13 furniture categories + Lighting | `:1038-1189` | ACTIVE ×14 |
| 143 | 3 → Interiors | **Component** | `:1190-1200` | ACTIVE control → opens `openFamilyCreatorPlaceholder()`; **the Family Creator itself is under reconstruction** |
| 144 | 3 → Landscape | **Swimming Pool** | `:1245-1250` | **REFUSES-WITH-REASON** — plan-only |
| 145–146 | 3 → Landscape | Trees · Potted Plants | `:1252-1268` | ACTIVE ×2 (catalogue-derived) |
| 147 | 3 → Grids&Levels | Grid | `GridsLevelsRailPanel.ts:67-72` | **REFUSES-WITH-REASON** — plan pane required |
| 148 | 3 → Grids&Levels | Level | `:77-82` | **REFUSES-WITH-REASON** — section/elevation pane required |
| 149–167 | 3 → Annotation | 19 registry tools | `initAnnotationTools.ts:5-23` | ACTIVE ×19 |
| 168 | 4 Bottom dock | Collapse chevron | `BottomActionMenu.ts:191` | ACTIVE |
| 169 | 4 | Tool circle (+) | `:1157` | ACTIVE |
| 170 | 4 | Camera 2D / perspective | `:1174` | ACTIVE |
| 171 | 4 | Level stack (3-way cycle) | `:1187` | ACTIVE |
| 172 | 4 | Wall cutaway | `:1194` | ACTIVE |
| 173 | 4 | Wall low height | `:1200` | ACTIVE |
| 174 | 4 | Day / night | `:1206` | ACTIVE |
| 175 | 4 | Elements in view | `:1212` | ACTIVE |
| 176 | 4 | Room labels | `:1218` | ACTIVE |
| 177 | 4 | Active level only | `:1224` | ACTIVE |
| 178 | 4 | Reset view controls | `:1229` | ACTIVE |
| 179 | 4 | **Section** | `:1234-1250` | **REFUSES-WITH-REASON** — three distinct verdicts from `resolveSectionClipCapability`; names the remedy (switch GPU to WebGL) |
| 180 | 4 | **Import IFC** *(not export)* | `:1256` | ACTIVE |
| 181–187 | 4 | 7 structure tools (WA CW DO WN SL FL CE) | `:81-89` | ACTIVE ×7 |
| 188 | 5 Bottom-left | Split View toggle (slot 0) | `initUI.ts:3492` | ACTIVE; console-only refusal if `splitViewManager` is not ready |
| 189–191 | 5 | GPU · Auto / WebGPU / WebGL | `RendererBackendToggle.ts:114-116` | ACTIVE ×3 |
| 192 | 5 | `· <active backend>` | `:118-124` | **read-only status**, not a control |
| — | 5 | Launcher slots 1–7 (`siteView`, `planGis`, `graph`, `livingGraph`, `siteAnalysis`, `envelopeCard`, `resetLayout`) | `zLayers.ts:145-154` | **DECLARED-BUT-UNREACHABLE** — one `launcherRailStyle(` call site repo-wide; the capabilities moved into the GIS panel |
| 193 | 6 Bottom-right | `◑` View properties | `ViewPropertiesLauncher.ts:94` | ACTIVE on canvas; **skip-mounted** (absent, by design) on `onboarding-globe` |
| 194 | 6 | `⚡` Render performance | `PerformanceModePanel.ts:82` | ACTIVE |
| 195–199 | 6 → ⚡ | Perf master + Shadows + AO + TRAA + Restore | `:143-222` | ACTIVE ×5 |
| 200–213 | cross | `.ceb-bar` 14 buttons | `ContextualEditBar.ts:235-462` | ACTIVE ×13 + **Edit Profile REFUSES-WITH-REASON** (disabled unless the type's tool exposes `enterProfileEditMode`) |
| — | cross | `.wdh-bar` mode pills | `DrawingModeBar.ts:117-149` | ACTIVE — data-driven from `elementCreationMatrix`; refuses to render outside an authoring context |

### Totals

* **6 regions.** Control counts: **1 →** 12 rail buttons (+1 dock pin, +4 panel-chrome, and 50
  leaves across the panels) · **2 →** 8 bar controls (+1 inert label, +9 inspect-mode HUDs) ·
  **3 →** 7 sections (+3 panel-chrome) opening **70 tool leaves** (49 create + 2 grids/levels +
  19 annotation) · **4 →** 12 dock controls + 1 chevron + 7 structure tools · **5 →** 2 real
  controls (+1 status span, +7 empty slots) · **6 →** 2 buttons + 5 popover leaves.
* **Not ACTIVE: 12 rows, plus 4 rows that are not controls.**
  * **8 × REFUSES-WITH-REASON** — GIS *Floors shown* · Balcony · Lift · Swimming Pool · Grid ·
    Level · bottom-dock *Section* · CEB *Edit Profile*. **All eight are correct**: each states its
    condition and, in six cases, the route back.
  * **4 × DECLARED-BUT-UNREACHABLE** — `LeftNavRail` (976 LOC, 8 panels) · `SECTION_ICONS.RENDER` ·
    launcher slots 1–7 · **the whole `CREATE_CONFIG` tree** (below).
  * **Not controls, listed so an auditor does not chase them:** the level name/elevation label ·
    the `· <backend>` status span · the `.tp-header` ⚙ · Room Bounding *Walls* (read-only by design).
* **0 × ABSENT** — no bubbled control was found to have no handler at all.
* **Also not ACTIVE but outside the six bubbles:** the `⊕ 3D Globe` control on `.svq-bar`
  (REFUSES-WITH-REASON when no camera port is injected) — see §10.6.

### ⛔ The largest single finding is not in any bubble

**`CreatePanelLayout.ts`'s entire `CREATE_CONFIG` tree — the second create surface — renders into
a DOM node that nothing creates.**

`renderCreateContent()` (`CreatePanelLayout.ts:617-619`) begins:

```ts
const container = document.getElementById('create-navigation-container');
if (!container) return;
```

Measured 2026-08-23 with **two** tools (`Grep` and `grep -rn`, excluding `node_modules`, `dist`,
`docs`): `create-navigation-container` appears at **exactly one site in the repository** — that
`getElementById`. Nothing creates it. The sibling id `create-content` (read at
`CreatePanelLayout.ts:47,71` and `initUI.ts:3032`) is likewise **never created**.

So `renderCreateContent()` returns on its first statement, every time, and everything it would have
drawn is unreachable:

* the five-discipline `CREATE_CONFIG` tree (Architecture / Structure / Plumbing / Interior /
  Outdoor, `:81-450`), including sub-menus the right rail does *not* offer — the Room submenu's
  *Detect All Rooms*, *Detect on Level*, *Auto-Organise (tag by type)*, *Clear All Rooms*
  (`:194-237`);
* the **entire C17 `⚡ Batch` catalogue injection** (`:585-616`) — one `Batch` submenu per
  discipline, parameterised entries rendering a form layer, phase-gated entries rendering disabled
  with their precondition reason.

⭐ **The batch catalogue itself is NOT stranded**: `AIPanel.ts:1279-1305` builds a
`batchCatalogueNode` from the same `groupCatalogue()` and dispatches through the same
`dispatchBatchEntry()`, so C17 has one live surface. **It is the panel that is dead, not the
capability.** STATE: **DECLARED-BUT-UNREACHABLE** (L-7502).

---

## §12 — Cross-references

* **C06** — UI Shell & Tools (§7 layering, §7.2 declared screen regions, §13 GIS action registry,
  §15 the site quick toggle)
* **C11** — Element Creation Pipeline · **C16** — Command Authoring (CA-18: name the reason *and*
  the route back) · **C17** — Batch Creation Catalogue & Panel Binding
* **C82 §1.1** — absence is legal, unreachability is not (the rule both bottom-right launchers exist
  to satisfy) · **C84 EI-1b / EI-3 / EI-8** — "nothing happened" ≠ "not available, because X"
* **C103** (balcony) · **C104** (lift) · **ADR-0341** (undo history dropdown) · **ADR-0343 §D.1**
  (the Analysis mode and the mode registry it required)
* Gates worth re-running before trusting any row here:
  `npx tsx tools/ga-gate/check-tool-activator-coverage.ts` ·
  `npx vitest run apps/editor/src/engine/views/plantools/__tests__/elementCreationMatrix.spec.ts` ·
  `pnpm --filter @pryzm/editor exec vitest run __tests__/creationToolShortcuts.test.ts`
* Defects opened by this map: **ISSUE-LOG L-7500 … L-7510**.
