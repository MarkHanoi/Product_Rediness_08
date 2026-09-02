# Lane U1 — the component placement flow (browser → tool → click → placed)

**Lane:** U1 (UI/UX wave) · **Date:** 2026-09-02 · **Authority:** UIUX-PLAN §U1 + §0.3/§4/§5 ·
lane-u0-definition-seam.md (the seam consumed) · ADR-0376 D5/D9/D10 · C16 CA-18/CA-21 ·
C111 §1.1-a/§3.1 · spec §59/§63/§75 · L-73 / L-1380 / L-5709 / L-7000..L-7005.
**Base:** U0 committed at `d2a01f29`; HEAD moved to `96cadcc4` mid-lane (Europe-wave commits —
none touching this lane's files). ⚠ **Lane U2 ran concurrently in this shared tree**
(`ComponentSection.ts`, `PropertyPanelBodyRenderer.ts`, its transcripts) — **zero file overlap**
with this lane's set; the serialize-only `PropertyPanelBodyRenderer.ts` was never touched here.

⚠ **HANDOVER — the shared-tree sweep, U0-§7 shape, repeated:** this lane made **no commits**
(per brief), but the orchestrator's `384e2b74` (*"feat(UCE/§U1+U2): the component UI ships"*,
2026-09-02 19:32) swept every U1 code file + most transcripts into history at their FINAL state
— all of this lane's code edits predate that commit, so **the committed tree IS the verified
tree** — and `94e0a3d3` took the three late transcripts (eslint / layer gate / root tsc). That
commit's message says *"the lane's final prose report was cut by session close"* — **it was
not: THIS file is that report**, written after the sweep, and it plus
`lane-u1-VERIFY-ui-layout-specs-PASSING.txt` are the only two U1 artefacts still uncommitted at
handover.

---

## §1 — What shipped

### §1.1 — The COMPONENT BROWSER (`apps/editor/src/ui/component-browser/` — new)

- **`ComponentBrowserPanel.ts`** — the panel over `componentCatalog.list()` (the ONE U0
  catalogue, never a copy — C84 EI-9): per definition a card with **name, semver, provenance
  chip** (Project / Marketplace / Built-in — the catalogue's recorded fact, worded for people)
  and its **types**, each type row carrying a **Place** button. **Honest empty state**
  ([[context-data-honesty-family]]): *"No Component definitions are loaded in this project"* +
  the live **file-open affordance** (`<input type=file accept=".pryzm-family">` →
  `catalog.loadFromFile` — the wire name is the frozen format extension, not user copy). A
  failed load renders the **LOADER's named refusal verbatim** in the panel's status line — the
  panel mints no vocabulary of its own (audit R1). **`subscribe()`-driven refresh** — a load
  while the panel is open re-renders without reopening (proven, ARM A). All user-facing copy
  says **Component** (D5; asserted in the test: the panel's textContent contains no `/family/i`).
- **`componentPlaceTool.ts`** — **`armComponentPlaceTool(sel)`, THE one arming function**
  (L-5709: one function, one path): records the `(definitionId, typeId [, semver, display
  names])` pair in the shared store, then arms via **`activatePlanOnlyToolOrExplain('component',
  'Component')`** — the SAME entry point pool / balcony / lift / bathroom-pod use, which arms
  **BOTH plan surfaces** (L-73/L-1380 parity), suppresses 3-D selection for the session
  (L-7003), and **refuses out loud** ("open a floor plan…") when no plan view is attached
  (C16 CA-18) instead of arming nothing.
- **`index.ts`** — the barrel both create surfaces dynamic-import.

### §1.2 — The PLACE TOOL (`apps/editor/src/engine/views/plantools/` — two new files + registry)

- **`activeComponentPlacement.ts`** — the surface-independent selection store (the
  `activeBalconyPlacement` idiom, the L-239-family lesson): two live create surfaces and two
  overlay-local handler instances all read ONE truth. IDs are deliberately NOT validated here —
  `component.place` owns the refusals; a second validator would be a rival refusal channel.
- **`ComponentPlanToolHandler.ts`** — single-click placement mirroring `FurniturePlanToolHandler`:
  crosshair + orientation tick + "definition · type" label preview, SPACE-to-rotate
  (`PrePlacementRotation`, the §FIX-PLAN-PREVIEW-YAW-SIGN sign rule), Escape cancels, tool stays
  armed for multi-placement. ⛔ **NO footprint rectangle is drawn** — this layer does not know
  the definition's geometry (the bake is 4E's, D10), and a plausible box would be the
  `ComponentCommitter` substitute-refusal rule (UIUX-PLAN §4 R-p) violated at the ghost. Commit:
  `componentId` minted ONCE via `createId('component')` (CA-2), `levelId` from
  `ctx.viewDef.spatial.levelId` (the same seam `FurniturePlanToolHandler._commit` reads — this
  is how "activeLevelId" reaches the payload on the plan surface), `origin` in world metres with
  `y: 0` + the storey on `levelId` (the furniture commit's exact shape), `rotation` in radians,
  `definitionVersion` as provenance. Dispatch via `ctx.runtime?.bus ?? window.runtime?.bus`.
  ⛔ **No fallback pair**: furniture falls back to `'bed'`; a guessed definition would be a
  fabricated reference — a missing selection **refuses by name** with the route back
  ("Open the Components browser…").
  **Refusals reach the screen** (brief item 4): a rejected dispatch surfaces the **bus's own
  sentence verbatim** on `runtime.toasts` — the ONE subscriber-backed channel (L-7005:
  `pryzm:toast` events reach nobody) — AND as red text on the overlay (the lift's `_refuse`
  idiom). Never a silent no-op click.
- **`planToolHandlerRegistry.ts`** — `'component'` added to `PLAN_TOOL_KEYS` + the factory, so
  BOTH plan surfaces get the tool by construction (L-73).
- **`elementCreationMatrix.ts`** — the `component` row: `views: ['plan']`, `modes: []`,
  `modeSource: 'n/a'`, with the **gap naming the exit** (4E viewport mount → ToolManager key +
  3-D tool → both views; `hostId` stays inert separately, D11 / refusal register R-d).
  **`elementCreationMatrix.spec.ts`** — the dual-view-gaps ledger GREW to
  `['balcony','bathroom-pod','boundary-line','component','pool']`, growth recorded with its
  reason per the ledger's own instruction.

### §1.3 — The rewires: the placeholder DIES (both surfaces, L-1380)

- `CreatePanelLayout.ts` — Interior → **"Components"** (was "Generic Component" →
  `familyCreatorPlaceholder` console.log) → dynamic-import `openComponentBrowser()`.
- `CreateRailPanel.ts` — Interiors → **"Components"** (was "Component" → the
  `familyCreatorPlaceholder` "under construction" modal) → the same opener.
- **DELETED:** `apps/editor/src/familyCreatorPlaceholder.ts`,
  `apps/editor/src/ui/familyCreatorPlaceholder.ts`, and
  `apps/editor/__tests__/FamilyCreatorPlaceholderScaffold.test.ts` — the scaffold's
  retiring-assertion fired exactly as its header designed (audit Phase 7C's mechanism, executed
  early for this seat as UIUX-PLAN §U7 records). Grep proof:
  `grep -rln familyCreatorPlaceholder apps src plugins packages --include='*.ts' …` → **3 files,
  all removal notes** (the two rewire comments + the browser header).
- `creationToolShortcuts.ts` — map key `'Component'` → `'Components'` in lock-step with the row
  (the 'Trees' label-follows-the-row precedent recorded in the suite itself).
- **`BimService.activateComponentTool(sel)`** (new method) — the plan-named service seam,
  delegating to `armComponentPlaceTool` so the service route and the browser route cannot drift.

### §1.4 — ⚠ DEVIATION FROM §U1's LETTER, stated with its reasons

UIUX-PLAN §U1 OWNS *"a `component` tool key in the ToolManager path · a
`ComponentPlanToolHandler`/**3-D placement tool**"*. This lane shipped the plan handler and
deliberately did **NOT** add a ToolManager `ToolName` key or a 3-D placement tool:

1. **D10 governs.** A placed component has **no 3-D mesh in the shipping viewport** (4E's own
   verdict: the descriptor path is proven on the evidence harness, the production call site is
   DESCOPED — `lane-4e-descriptor-path.md` §0). A 3-D placement arm would place elements the
   view cannot show — the founder's "reports activation, activates nothing" defect
   (`activatePlanOnlyTool.ts`'s founding reports), and a FurnitureTool-mirror with no pixels
   would be [[fake-more-capable-than-real]].
2. **The plan-only route is the CURRENT proven executor** for exactly this class: pool, balcony,
   lift (plan leg), boundary-line and bathroom-pod all arm through
   `activatePlanOnlyToolOrExplain`, whose session machinery (L-7000..L-7005) carries
   selection-suppression, the pane-naming refusal and two-surface parity that the ToolManager
   route does not provide for a plan-only tool.
3. **The exit is declared, not lost:** the matrix row's gap says verbatim — when 4E's mount
   lands, add the ToolManager key + 3-D tool and move the row to both views. The
   `elementCreationMatrix.spec.ts` ledger will force the row's honesty either way.

---

## §2 — Executed proof (all transcripts beside this file)

| Proof | Transcript | Verdict |
|---|---|---|
| ⭐ **ACCEPTANCE** — `componentPlacementFlowThroughComposedRuntime.test.ts`: real `composeRuntime()` + `bootstrapWithEverything`, real browser panel DOM, real `SvpPlanToolOverlay` attached, real DOM `MouseEvent`s. ARM A: honest empty state + load affordance + D5 copy + subscribe-driven loaded state (name / provenance chip / both types). ARM B: the REAL Place button → armed overlay (`isPlacing() === true`) → ONE mousedown at world (2,3) → **CA-21 read-back out of `rt.stores.component`**: `definitionId`/`typeId`/`levelId`/`origin {x:2,y:0,z:3}`/`definitionVersion`/branded `component_<ULID>` id; second click → second occurrence (multi-place). ARM C: catalogue emptied under the armed tool → the click REFUSES with **the bus's own sentence** (*"names no definition loaded … the catalogue is EMPTY"*, naming the id) on the live toast channel, store untouched. ARM D: nothing selected → refuses by name, store untouched | `lane-u1-VERIFY-acceptance-PASSING.txt` | **RC=0 · 4/4** |
| **FALSIFICATION** — the catalogue injection severed in `PluginRegistry.ts` (`buildComponentHandlerSet({})`) → ARM C **RED**: the refusal never reaches the UI (`saw: []` — the assertion names the missing sentence); restore **byte-identical** (sha256 `506ea163…` before == after) → 4/4 green again | `lane-u1-VERIFY-falsify-SEEN-FAILING.txt` · `lane-u1-VERIFY-falsify-sha256.txt` · `lane-u1-VERIFY-falsify-RESTORED-GREEN.txt` | **seen failing → restored green** |
| Matrix + pointer/session suites (elementCreationMatrix.spec with the grown ledger + component row · bathroomPodPointerReach · pointerReachesArmedHandler · planOnlyToolEscape · planOnlyToolFinishGesture) | `lane-u1-VERIFY-matrix-and-pointer-suites-PASSING.txt` | **RC=0 · 220/220** |
| Editor suites on the touched graph (component join · catalog seam · AI slice · 5 bootstrap suites · lift reachability · the new acceptance) | `lane-u1-VERIFY-editor-suites-PASSING.txt` | **RC=0 · 66/66** |
| Layout-scanning UI specs (elementAuthoringContext · lighting palette ×2 · lightingPlacementArming) + WallOrthoModeStringAngle | `lane-u1-VERIFY-ui-layout-specs-PASSING.txt` | **RC=0 · 33/33 + 4/4** |
| Root `tsc -p tsconfig.json --skipLibCheck --noEmit` at the 6 GB heap (the config `apps/editor`'s own `typecheck` script names) | `lane-u1-VERIFY-root-tsc.txt` | **RC=0, zero errors** (the default heap OOMs — the [[build-uses-stricter-root-tsc]] memory) |
| `check-layer-boundaries` | `lane-u1-VERIFY-gate-layers.txt` | **RC=0** — *"within baselines (violations 48/102, unclassified 13/13, sdk-bypass 159/182)"* — no ceiling moved |
| ESLint over every file this lane authored/edited | `lane-u1-VERIFY-eslint.txt` | **RC=0** |
| Placeholder grep | (in §1.3) | **3 hits, all removal notes** |

Zero edits to `packages/schemas/**`, `packages/input-host/**`, the serialize-only trio,
`PropertyPanelBodyRenderer.ts` (U2's hold), `packages/site-parcel-data/**`,
`apps/editor/src/ui/site/**`. No new verb, no schema change. **No commit** (per brief; the
orchestrator owns the commit).

## §3 — Pre-existing failures found, PROVEN at HEAD, not absorbed

1. **7 failures across 4 plantools specs** (`stairCreationModes` ×4, `stairByWalls`,
   `stairPlanCreation`, `planAutoModeReachability`'s CENSUS naming **`grid` — declares 3 modes,
   activator arity 0**) — reproduced **identically with this lane's three plantools edits
   reverted to HEAD**: `lane-u1-VERIFY-preexisting-stair-grid-failures-AT-HEAD.txt` (7 failed /
   42 passed, same arms). Not this lane's, not fixed here — **L-row candidates**.
2. **`creationToolShortcuts.test.ts` was already RED at HEAD**: `Bathroom Pod` has no entry in
   `CREATION_TOOL_SHORTCUTS` (`lane-u1-VERIFY-preexisting-shortcut-failure-AT-HEAD.txt`, missing
   = `['Bathroom Pod']` with `CreateRailPanel.ts` at HEAD). This lane's label rename briefly
   added `Components` to that list; the map rename (§1.3) removed it — the suite is back at
   **exact HEAD parity** (`lane-u1-VERIFY-shortcut-suite-at-HEAD-parity.txt`). The pod's missing
   shortcut is the pod lane's debt — **L-row candidate**; minting a combo for another family was
   not this lane's call.
3. **Doc nit in lane-u0-definition-seam.md §3 / PluginRegistry comment:** *"or
   `runtime.auxiliaries.componentCatalog` off the composed runtime"* — measured 2026-09-02,
   `composeRuntime()`'s returned runtime has **no `auxiliaries` key**; the bag lives on the
   BOOTSTRAP result only. The browser probes `window.runtime?.auxiliaries?.componentCatalog`
   as future-proofing and the process-default import is the live path (same instance).

## §4 — The render leg, stated honestly (D10)

The placed occurrence **does not paint in the shipping viewport**: `ComponentCommitter` is
committed and proven, but the production mount is DESCOPED (4E's pre-authorised D10 outcome —
wiring `runtime.scene.mount()` into `src/main.ts` would put a second renderer beside
`initScene.ts`'s, the ~544-file migration audit §5.4 refuses). The render-leg evidence for this
flow is lane 4E's evidence-harness run — the SAME `component.place` verb into the SAME store
driving the SAME committer: `phase4/lane-4e-VERIFY-rendered-instance.png` +
`lane-4e-VERIFY-render-EVIDENCE.json` (11,388 lit pixels; 5,505 after a type swap). This lane's
ARM B proves the missing junction (gesture → that verb, on the real bus); the union is stated
here rather than a pixel claim being faked. **Mirror-debt row:** production-viewport pixels +
the ToolManager/3-D arm land together with 4E's mount (matrix gap names it).

## §5 — What U2 (and later lanes) need from this lane

- **A placed occurrence to select:** dispatch `component.place` via the bus in fixtures, or
  drive the UI path exactly as `componentPlacementFlowThroughComposedRuntime.test.ts` ARM B does
  (copy its world-install + overlay-attach preamble; the 2-D-context proxy stub and
  `__pryzmInitComplete` are load-bearing).
- **The selection seam:** `armComponentPlaceTool` /
  `getActiveComponentPlacement()` (`@app/engine/views/plantools/activeComponentPlacement`) —
  U2's "place another of this type" affordances should route through the SAME one arming
  function, never a second path.
- **The chat deferral string** *"Place it with the Component tool"*
  (`ChatCommandClassification.ts:4050`) **is now TRUE** — the Component tool exists and is
  reachable (Create → Interior → Components → Place → plan click). The *"Properties panel"*
  string is U2's to make true (its files were landing concurrently — verify at your lane start).
- **U6/AI:** `BimService.activateComponentTool({definitionId, typeId, …})` is the service-level
  activation; refusals already ride `runtime.toasts` + the overlay.
- **U7:** the create-rail placeholder deletion is DONE here (both copies + scaffold test);
  U7's sweep should not expect to find it.
