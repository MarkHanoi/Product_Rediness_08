# SPEC-50 — RIBBON HANDLER BACKLOG (the mount decision's debt, per toolbar)

Status: **BACKLOG, NOT A PROMISE.** This document carries **no dates, no ordering commitments,
and no scheduling authority**. It exists because [ADR-0326](../../02-decisions/adrs/ADR-0326-mount-the-ribbon-disable-the-unbacked.md)
(mount the ribbon; the unbacked render disabled-with-reason) and
[C82](../../02-decisions/contracts/C82-RIBBON-CAPABILITY-SURFACE.md) §1.3 require every
DISABLED-WITH-REASON control's reason to resolve to a named backlog row — this file is where
those rows live. A row here obligates nobody to build anything; it obligates everyone who DOES
build it to the row's stated contract obligations.

Authored 2026-08-14 by the ribbon-governance lane. **Source of every count**: the Phase-1 verb
backing census (`ae659c96`, `tools/rac-conformance/gesture-reach/results/verb-census.json`) built
from the H6 probe (`b32d56ff`). Census totals: **280 verbs / 30 surfaces → 4 BACKED ·
0 REGISTER-ONLY · 276 UNBACKED; 29 surfaces NO-BACKED-VERB, 1 MOUNTABLE-PARTIAL** (MainToolbar,
4 of 12). The four backed verbs — `zoom-fit`, `zoom-selected`, `copy-selection`,
`paste-clipboard` — appear in no table below because they are not backlog.

## §0 — How to read this document

**§0.1 — Size classes.** Three, and they answer *"what kind of work is missing?"*, never
*"how long will it take?"*:

| Class | Meaning |
|---|---|
| **WIRING** | the capability exists in production code; the work is connecting the toolbar verb to it — a handler registration, an id mapping, a probe re-run. The GE-06 exemplar of the mismatch: *"12 declared command ids vs 12 toolbar ids with only 3 in common"* |
| **RULE-AUTHORING** | the machinery exists; what is missing is domain content — catalogue entries, rule rows, presets, mappings |
| **CONSTRUCTION** | the capability does not exist; a subsystem must be built before any wiring is possible |

**§0.2 — The honesty caveat that governs every "partially exists" claim below.** Partial-existence
citations here are **BY-READ** (a plugin directory, a package, a contract) — and this repository's
standing lesson (CE-05 in `BIM30-GAP-REGISTER.md`: *audit REACHABILITY, not existence*; C70 §4.2:
machinery-present ≠ capability-reachable) applies to this spec itself. **The census proved that 48
plugins and 30 green spec files coexisted with 0 reachable toolbar pairs.** Before scheduling any
WIRING row, execute a reachability check of the named artefact; a plugin with handlers is a
candidate, not a guarantee. Where this spec says "needs its own census", that is the row's first
task.

**§0.3 — Obligations attached to every row when it is built** (stated once, not repeated per
row). Wiring a verb makes it a registered bus command, so the PR that builds any row owes:

- **C82 §2.3/§3**: H6 probe re-run to EXECUTED-REACHED in the same PR; the census-pinned
  `BACKED_TOOLBAR_VERBS` follows the probe, never the hand.
- **C68 §4/§5**: the C69 register regenerated (C69 §3.3); a declaration in exactly one of three
  places (`ChatCapability` / `CHAT_UNAVAILABLE` / `ChatCommandClassification` with a falsifiable
  reason); `targets` proven both ways for element-targeted verbs (C68 §5.c); a true BATCH verb
  for anything mass-shaped (C68 §5.a — `runBatch` is undo-NEUTRAL, ADR-0314); refusals quote
  real values (C68 §5.g).
- **C16**: the handler authored to the command protocol; **C03** for state shape; **C69 §1.1**:
  the verb id is written into `project_command_log` — it is a persistence fact, chosen once.
- Where a handler **creates or replaces elements in bulk** (marked ⚠C80 below): C80's authority
  question applies — `may` / `protected` / `unknown-authority`, and `unknown-authority` is not
  permission.

**§0.4 — Groups.** Surfaces are grouped by the census's shape: **A** — a production counterpart
exists in-tree (wiring-dominant); **B** — an engine slice exists, the rest is construction;
**C** — no capability located (construction-dominant). Within a group, order is census surface
order. Per-surface headers carry the census line verbatim: `total / backed / unbacked`.

---

## §A — Wiring-dominant: a production counterpart exists in-tree

### A.1 MainToolbar — 12 / 4 / 8

| Verbs | Capability needed | Partially exists? | Class |
|---|---|---|---|
| `undo`, `redo` | dispatch onto the unified undo path | **yes** — `performUndoRedo` unified path (C03 §4.5–4.8); it is not a bus verb today | WIRING |
| `save-project`, `open-project` | project persistence round-trip | **yes** — the BFF persistence path and save/load UI exist (C05) | WIRING |
| `delete-selection` | delete with cascade | **yes** — `DeleteElementCommand` §CASCADE-DELETE (protected wiring, C72 §2) | WIRING |
| `cut-selection` | copy + delete composition | **yes** — `CopySelectionHandler` is one of the four backed verbs; compose with delete | WIRING |
| `toggle-layer-panel`, `toggle-property-panel` | panel visibility toggles | **yes** — the panels render today | WIRING |

### A.2 DrawingToolbar — 18 / 0 / 18

| Verbs | Capability needed | Partially exists? | Class |
|---|---|---|---|
| `draw-wall`, `draw-door`, `draw-window`, `draw-room`, `draw-slab`, `draw-stair`, `draw-roof`, `draw-curtain-wall`, `draw-ramp`, `draw-area`, `add-beam`, `add-column`, `place-furniture`, `place-grid`, `place-level`, `place-camera` | tool activation from a command gesture | **yes for most** — production tools live in `plugins/{wall,door,window,rooms,slab,stair,roof,curtain-wall,beam,column,furniture,grid,levels}`; the probe's own not-measured note records the seam: *the CREATE rail activates TOOLS, not commands*, so these verbs need a command→tool-activation bridge, not new tools. `draw-ramp`, `draw-area`, `place-camera`: no tool located — needs its own census | WIRING (bridge); C11/C16 govern; unlocated three: CONSTRUCTION until censused |
| `add-annotation`, `add-elevation-mark` | annotation entities | see A.9 / A.6 — same capability, listed there | follows A.9 / A.6 |

### A.3 RoomToolbar — 6 / 0 / 6

`room-place`, `room-from-enclosed-area`, `room-properties` — **yes**: `plugins/rooms`, the room
tool and detection engine are among the most exercised code in the product (C80 §7.4 names two
independent producers). WIRING. `room-separator`, `room-area-boundary` — boundary sub-entities;
partial (room boundaries exist; separator-as-element does not) — CONSTRUCTION-lite.
`room-tag` — follows the tag system (A.9).

### A.4 ViewToolbar — 9 / 0 / 9

`view-plan`, `view-3d`, `view-section`, `view-elevation` — **yes**: `plugins/{view,plan-view,section-view}`,
C59 multi-pane view system. WIRING. `toggle-shadows`, `toggle-ambient-occlusion` — renderer
settings exist (C04). WIRING. `screenshot-view`, `print-view` — partial (capture paths exist in
the render stack; needs its own census). `view-walkthrough` — no walkthrough capability located.
CONSTRUCTION.

### A.5 PlanToolbar — 7 / 0 / 7 · A.6 SectionToolbar — 7 / 0 / 7 · ElevationToolbar — 7 / 0 / 7

`section-new`, `section-open-view`, `elevation-open-view`, `plan-floor` — **yes**:
`plugins/section-view`, `plugins/plan-view`; plan/section/elevation views render today
(§RHINO-PLAN landed linework into all three, `141f5d67`). WIRING. The rest — callouts, crop
regions, scope boxes, underlays, flip, framing/interior/exterior elevation marks, `plan-area`,
`plan-structural` — are **view-annotation entities that do not exist**: CONSTRUCTION (C24/C34
are the governing drawing-standards contracts).

### A.7 IfcInspectorToolbar — 8 / 0 / 8 · IfcFilterToolbar — 7 / 0 / 7

`ifc-open-file`, `ifc-inspect-element`, `ifc-show-properties`, `ifc-toggle-spatial-tree`,
`ifc-copy-guid`, `ifc-validate`, `ifc-export-subset` — **yes**:
`plugins/{ifc-import,ifc-export,ifc-inspector}` (C25 owns export production; `IfcSemanticWriter`
is a cited production reader in ADR-0325's census). WIRING-leaning. The seven `ifc-filter-*`
verbs — filter persistence (`save`/`load`) and spatial/storey/type/property filtering — partial:
inspection exists, a persisted filter model does not. CONSTRUCTION-lite.

### A.8 DimensionToolbar — 11 / 0 / 11

`dimension-aligned`, `dimension-linear` — **yes**: `plugins/dimensions` (tool, committer,
handlers); C56 (AUTODIMENSION) is the governing contract. WIRING-leaning, pending a census of
which dimension kinds the tool actually commits. `dimension-angular`, `-radial`, `-diameter`,
`-arc-length` — kind coverage unknown: needs its own census; RULE-AUTHORING if the committer is
kind-generic, CONSTRUCTION per kind if not. `dimension-lock`, `-override`, `-reset`,
`-witness-gap`, `-witness-show` — dimension-property editing: CONSTRUCTION-lite (⚠ C74 for
`lock` — a lock that does not hold is a solve reported and not performed).

### A.9 AnnotationToolbar — 10 / 0 / 10

`annotation-symbol`, `tag-leader`, `tag-multi-leader`, `spot-elevation`, `spot-coordinate`,
`filled-region-place`, `revision-cloud-place` — partial: `plugins/annotations`
(`AnnotationManager`, commands, render layer) exists; per-entity support needs its own census.
WIRING where the entity exists, CONSTRUCTION where not. `tag-by-category`, `tag-all-elements`,
`tag-keynote` — a tag/keynote **system** (category→tag mapping, keynote table): CONSTRUCTION +
RULE-AUTHORING (the keynote table is content). ⚠C80 on `tag-all-elements` (bulk creation).

### A.10 SheetToolbar — 7 / 0 / 7 · SheetSetsToolbar — 7 / 0 / 7 · PrintSetupToolbar — 7 / 0 / 7

`sheet-new`, `sheet-from-template`, `sheet-title-block`, `sheet-view-add`, `sheet-export-pdf`,
`sheet-print`, `print-plot-execute`, `print-plot-preview` — **yes**: `plugins/sheets` (handlers,
store, title-block, sheet-list, book/) and `plugins/export-pdf`; C24/C24.1 own sheet
composition, C29 PDF export, C34 print standards. WIRING-leaning, reachability needs its own
census. `sheet-revision-add` — revision model: CONSTRUCTION-lite. The seven `sheet-set-*` verbs
(C30 drawing-set management) — a sheet-SET model over the sheet store: CONSTRUCTION-lite. The
five `print-setup-*` preset verbs — print presets: RULE-AUTHORING over C34 once a settings
surface exists.

### A.11 ScheduleToolbar — 8 / 0 / 8 · QuantityToolbar — 10 / 0 / 10

`schedule-new`, `schedule-from-template`, `schedule-field-add`, `schedule-filter-add`,
`schedule-sort-add`, `schedule-edit-cells`, `schedule-export-csv` — **yes**: `plugins/schedules`
(evaluate-schedule, formula-evaluator, sort, export/, import/); `ScheduleExtractor` is a cited
production reader (ADR-0325 census). WIRING-leaning. `schedule-export-ifc`,
`quantity-export-ifc` — ride C25's export path: WIRING. `quantity-element-count`,
`quantity-area-calculate`, `quantity-volume-calculate`, `quantity-material-takeoff`,
`quantity-schedule-create`, `quantity-filter-apply`, `quantity-export-csv/-excel`,
`quantity-report-print` — C38 (cost/5D) territory: quantity extraction partially exists inside
schedules; takeoff-grade quantities (material volumes per element) are CONSTRUCTION. ⚠ honesty
rule for every quantity verb: a quantity the engine did not compute is refused by name, never
reported as 0 (the `[]`-means-unknown class, ADR-0322 §5).

### A.12 FamilyToolbar — 8 / 0 / 8

`load-family`, `place-family-instance`, `browse-family-types`, `reload-family` — **yes**:
`packages/{family-instance,family-loader,family-runtime}` + `plugins/family-editor`; C65 owns
the element type system; C76 is RESERVED for the element-family register (COORD-01). WIRING-
leaning. `create-family`, `edit-family`, `edit-family-type`, `export-family` — the family
EDITOR: partial (`plugins/family-editor` exists; ADR-0316 records the family creator as a second
composition root, so this wiring has architectural strings). WIRING + CONSTRUCTION mix; needs
its own census first.

### A.13 BCFToolbar — 11 / 0 / 11

All eleven (`bcf-import`, `bcf-export`, `bcf-filter`, `bcf-viewpoint-save`, and the seven
`bcf-issue-*` lifecycle verbs) — **yes, substantially**: `plugins/bcf` carries handlers, store,
tool, reader, ifc-bridge and a panel contribution. This is the census's starkest
authored-vs-reachable case outside the ribbon itself: an apparently complete plugin, and the
toolbar reached none of it. WIRING-leaning across the board — **after** a reachability census of
the plugin's own registrations (§0.2 applies with full force).

### A.14 EditToolbar — 14 / 0 / 14

`move-selection` — **yes**: the move tool and `MovePlanToolHandler` exist (C78 §0 cites them).
WIRING. `rotate-selection`, `mirror-selection` — partial: `wall.transform` is a geometric
rotate/mirror on a single element, chat-refused as unwired (C81 §0.1(3)); generalising to a
selection is CONSTRUCTION-lite. `scale-selection` — no scale capability located: CONSTRUCTION.
`align-left/right/top/bottom` — alignment solver over selection bounds: CONSTRUCTION.
`group-elements`, `ungroup-elements` — a group model: CONSTRUCTION (⚠ C71 — a group is a
relationship; it lands with writer + reader + rebuild disposition + delete behaviour in ONE PR).
`pin-element`, `unpin-element`, `lock-element`, `unlock-element` — a pin/lock model:
CONSTRUCTION (⚠ C74 — a lock the mutation path does not honour is worse than no lock; the
enforcement point is the command path, P6).

---

## §B — An engine slice exists; the rest is construction

### B.1 ClashDetectionToolbar — 12 / 0 / 12

Governing plan: [`GE-06-CLASH-ENGINE-DECOMPOSITION.md`](../plans/GE-06-CLASH-ENGINE-DECOMPOSITION.md)
(the L-RESPEC decomposition — read it before touching any row here; this spec defers to it
entirely on order and cost).

- **What exists**: the `clash-run` command id is one of only 3 ids the declared command set and
  the toolbar set share (GE-06 §0: *12 declared ids vs 12 toolbar ids, 3 in common* — the other
  two are `clash-filter-new`, `clash-report-export`); one real detector slice landed —
  roof-vs-walls-beneath, `packages/geometry-roof/src/pure/roofWallClash.ts` (`83c82c02`, 13
  oracle tests, kernel epsilon). **No handler in any plugin; no general engine.**
- **The backlog**: (1) the GE-06 §1 interim handler — pair-coverage manifest,
  `{findings, checkedPairs, uncheckedPairs}`, typed `ENGINE_NOT_AVAILABLE` refusal when zero
  detectors are registered, and refusal for the ten unhandled ids — **WIRING**, and GE-06 says
  do it FIRST; (2) per-pair detectors on GE-06 §2's costed ladder (wall×wall ≈1×, column/beam×slab
  ≈0.7×, stair×slab ≈1×, furniture×clearance ≈0.7× advisory, wall/window×opening ≈0.3× exposure
  of `WallOccupancyStore.canPlace`) — **CONSTRUCTION** per pair; (3) the remaining toolbar verbs
  (`clash-select-a/b`, `clash-tolerance-set`, `clash-group-clashes`, `clash-highlight-toggle`,
  `clash-approve-selected`, `clash-resolve-selected`, `clash-reset`, `clash-filter-save`) —
  result-set UI over (1)'s report shape: **WIRING** once (1) exists. ⚠ `clash-tolerance-set`
  consumes C73's declared tolerance policy, never a new literal.

### B.2 CoordinationToolbar — 12 / 0 / 12

`coordination-clash-detect`, `-clash-filter`, `-clash-group` — the same capability as B.1; rows
follow GE-06, not a second engine. `coordination-bcf-export` — rides `plugins/bcf` (A.13):
WIRING after A.13's census. `coordination-model-compare`, `-model-overlay` — model diff/overlay:
CONSTRUCTION (C36 owns coordination; C26 adjacent for linked models). The six
`coordination-review-*` verbs — a review/assignment workflow: CONSTRUCTION (overlaps the BCF
issue lifecycle; decide ONE issue model before building either — a second issue store beside
`plugins/bcf`'s would be the C72 rival-machinery shape).

### B.3 AnalysisToolbar — 11 / 0 / 11

- **What exists**: `packages/solar-analysis` (shipped, C21); a `daylight` workflow in
  `packages/ai-host/src/workflows/` (C81 §0 lists it); SPEC-42 (analysis bridge protocol),
  SPEC-43 (LCA/carbon), C54/SPEC-WIND-CFD-LBM (wind).
- `analysis-daylighting-run` — WIRING-leaning onto the existing workflow (needs its own census).
  `analysis-view-results`, `analysis-report-generate`, `analysis-reset-params`,
  `analysis-compare` — result-surface verbs: WIRING once any engine is reachable, meaningless
  before. `analysis-energy-run`, `analysis-structural-run`, `analysis-mep-run`,
  `analysis-export-idf`, `analysis-gbxml-export`, `analysis-carbon-calculate` — engines and
  exporters that do not exist in-tree: CONSTRUCTION (SPEC-42's bridge is the declared shape —
  an external-engine bridge, not an in-browser solver, is the intended construction).

---

## §C — No capability located: construction-dominant

### C.1 CDEToolbar — 11 / 0 / 11

No CDE (common data environment) subsystem located anywhere in-tree: no plugin, no package, no
register verbs, no gap-register row. All eleven verbs (check-in/out, folder browse, upload/
download, revisions, transmittals, model links, status) are CONSTRUCTION. **Finding, recorded
per the C77 pattern (the gap is that nothing owns the question): no contract owns the CDE today**
— C35 owns COBie/FM handover, C30 owns drawing sets; document control, transmittals and
check-in/check-out have no owner. Building any of this starts with minting that contract, not
with a handler.

### C.2 ModelManagementToolbar — 10 / 0 / 10

Linked models (`model-link-add/-reload/-unload/-remove/-bind`), worksets (`model-workset-new/
-settings`), phases (`model-phase-set`), design options (`model-design-option-new/-primary`) —
four subsystems, none located in-tree. CONSTRUCTION ×4. ⚠ worksets and phases are
collaboration-and-persistence features first (C08, C05, C47 — a phase stamp is a format
change); the toolbar is the last mile of each, not the feature.

### C.3 LayerToolbar — 7 / 0 / 7

No layer subsystem located. CONSTRUCTION — behind a **design decision that must precede it**:
PRYZM's visibility model is *visibility intent* (`packages/visibility`, C09, P7 — intent ≠ UI
state), and MainToolbar already has `toggle-layer-panel`. Whether "layers" are a distinct
CAD-style model or a presentation of visibility intent + element categories is a C09 question;
building a rival visibility store without answering it would violate P7's direction of travel.

### C.4 ColorToolbar — 6 / 0 / 6

`color-override-element`, `color-reset-element` — partial: per-element visual override machinery
exists in the RAC capability layer (ADR-0314's semantic batch layer; its measured caveat — the
DTO-store dead ends it documents — applies). WIRING after a liveness census of the setVisuals
path. `color-fill-by-category`, `color-fill-by-parameter`, `color-fill-scheme`,
`color-fill-legend` — a color-scheme system (category/parameter → color mapping + legend
rendering): CONSTRUCTION + RULE-AUTHORING (the schemes are content). ⚠C80 on scheme
application (bulk visual replacement).

### C.5 TextToolbar — 8 / 0 / 8

`text-place`, `text-place-model`, `text-style` — a text-note entity: partial at best
(`plugins/annotations` may carry text primitives — needs its own census); CONSTRUCTION
otherwise. `text-bold`, `text-italic`, `text-underline`, `text-find-replace`,
`text-spellcheck` — formatting/search over an entity that does not exist yet: blocked on the
entity; the formatting trio is WIRING once it exists, find-replace/spellcheck CONSTRUCTION-lite.

### C.6 AreaToolbar — 5 / 0 / 5

`area-place`, `area-boundary`, `area-scheme`, `area-color-fill`, `area-tag` — areas as
first-class elements (gross/rentable schemes distinct from rooms): CONSTRUCTION (C20 is the
neighbouring aggregate contract; rooms exist, area schemes do not). `area-color-fill` follows
C.4's scheme system; `area-tag` follows A.9's tag system.

### C.7 PluginManagerToolbar — 12 / 0 / 12

`plugin-browse-marketplace`, `plugin-install`, `plugin-uninstall`, `plugin-update` — partial:
the marketplace API exists server-side (C07; the BFF owns the plugin marketplace API). WIRING
of client surface onto existing API, after a census of what the API actually serves.
`plugin-enable/-disable/-reload`, `plugin-sandbox-start`, `plugin-devtools-open`,
`plugin-logs-show`, `plugin-settings-open`, `plugin-api-explorer` — client-side plugin runtime
management (dynamic enable/disable/reload of L6 plugins in the composed runtime): CONSTRUCTION
— and P1-sensitive (a plugin reload path that re-wires the runtime outside `composeRuntime()`
is a P1 violation by definition; this row cannot be built casually).

### C.8 SettingsToolbar — 12 / 0 / 12

`settings-snapping` — **yes**: `packages/snapping` exists (L1). WIRING to a settings surface.
`settings-units` — units exist implicitly everywhere; a units SETTING with model-wide meaning is
C47-adjacent (format): CONSTRUCTION-lite. `settings-open`, `-display`, `-shortcuts`,
`-project-info`, `-about`, `-license` — settings/info panels: WIRING-to-CONSTRUCTION-lite
(surfaces exist partially). `settings-purge-unused`, `-transfer-standards`, `-shared-params`,
`-warnings` — model-maintenance operations that do not exist: CONSTRUCTION (⚠C80 on
purge-unused — bulk deletion under an authority question, and `unknown-authority` is not
permission).

---

## §D — Totals reconciliation (against the census, not by addition of prose)

`ae659c96` totals: **280 pairs · 4 backed · 276 unbacked · 30 surfaces**. The tables above cover
all 30 surfaces; MainToolbar contributes 8 of its 12 (the 4 backed excluded); every other
surface contributes all of its verbs. Per-surface counts are carried in each header verbatim
from the census. **If a recount of this document disagrees with the census, the census wins and
this document is stale** (C70 §0.2; C69 §0.1's citation discipline applied to gesture pairs).

## §E — What this backlog is not

- **Not a promise, not a roadmap, not an ordering.** Stated in the header; restated here because
  backlogs rot into roadmaps by being read twice.
- **Not a capability audit.** Size classes and partial-existence claims are BY-READ triage
  (§0.2). The row's first act, when picked up, is to execute the reachability check its class
  was guessed from.
- **Not the register.** No verb here exists as an API verb until its handler lands and the C69
  register regenerates. Nothing in this file may be cited as "the product has N verbs".
- **Not C82.** The contract owns the states and the instrument; this file owns only the
  per-verb "what is missing". Where they disagree, C82 wins.
