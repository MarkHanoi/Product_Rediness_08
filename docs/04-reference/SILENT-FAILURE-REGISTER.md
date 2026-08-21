# SILENT-FAILURE REGISTER

**Lane AUD-4 · Robustness & error handling · 2026-08-21 · read-only pass, no source changed.**

The founder's instruction was *"check the code — not the docs"*. Every number below was produced
by running a script or a `grep` over `HEAD` on this tree. Where a claim could not be traced to a
line of source it is marked **UNMEASURED** and left out of the ranking.

This register catalogues ONE defect class: **a failure and a legitimate result that are the same
value**, so nothing downstream — not the user, not a log, not a gate — can tell them apart.

> ⚠ **This document is a REGISTER, not an audit derivative.** Rows are appended as they are
> measured and struck as they are fixed. It is the companion artefact to ISSUE-LOG rows
> **L-2600 … L-2613**. When a row here and the ISSUE-LOG disagree, the ISSUE-LOG wins.

---

## 0. How to reproduce every number in this file

The five probes are throwaway scripts, deliberately not committed — each is ~40 lines and is
described precisely enough to rewrite. All of them share one helper: a single-pass tokenizer that
**blanks comments and string bodies while preserving byte offsets**, so an index found in the
blanked text is the same index in the raw text. That equivalence is what lets a probe locate a
`catch` block in stripped source and still quote the *raw* comment inside it.

> ⚠ **Two of this repo's own audit trails were corrupted by shell escaping today.** Writing these
> probes through a `bash` heredoc ate a backslash and produced `SyntaxError: Invalid or unexpected
> token` on the first run. They were rewritten through the file-write tool instead. `String.fromCharCode(92)`
> is used in place of a literal backslash inside the tokenizer for the same reason. **Do not
> regenerate these probes through a heredoc.**

| Probe | What it measures |
|---|---|
| `catch3.mjs` | every `catch` block in `apps/ src/ packages/ plugins/ server/`, classified by what its BODY does |
| `dispatch.mjs` | every optional-chained `?.bus?.executeCommand(`, classified by how a failure is handled |
| `clickguard.mjs` | every `addEventListener('click', …)` handler carrying a bare `if (…) return;` with NO user-visible surface anywhere in the handler |
| `gateblind.mjs` | what `tools/ga-gate/check-runtime-arg-omitted.ts` structurally cannot see |
| `eventdiv.mjs` | `runtime-composer`'s `PryzmRuntimeEvents` vs `event-bus`'s `EventCatalog`, key-set by key-set |

Denominator for every count: **4728 `.ts` / `.tsx` files** scanned (tests, `.d.ts`, `dist`,
`node_modules`, `__tests__`, `__mocks__` excluded).

---

## 1. Findings, ranked by blast radius

### ⛔ SF-01 — The IFC export silently drops elements, and for the one family that is instanced BY DEFAULT it exports an invisible pick-proxy BOX in place of the real geometry

**Blast radius: every IFC export of every project. IFC is the interoperability deliverable of a BIM
product; this is the file the client's consultant opens.**

**The drop points — 20 of them, across 10 of the 13 readers, with no diagnostic of any kind:**

```
packages/file-format/src/export/ifc/readers/BeamReader.ts:17         if (!mesh) continue;
packages/file-format/src/export/ifc/readers/BeamReader.ts:19         if (!geometry) continue;
packages/file-format/src/export/ifc/readers/ColumnReader.ts:17       if (!mesh) continue;
packages/file-format/src/export/ifc/readers/ColumnReader.ts:19       if (!geometry) continue;
packages/file-format/src/export/ifc/readers/CurtainWallReader.ts:17  if (!mesh) continue;
packages/file-format/src/export/ifc/readers/CurtainWallReader.ts:19  if (!geometry) continue;
packages/file-format/src/export/ifc/readers/FurnitureReader.ts:17    if (!mesh) continue;
packages/file-format/src/export/ifc/readers/FurnitureReader.ts:19    if (!geometry) continue;
packages/file-format/src/export/ifc/readers/HandrailReader.ts:17     if (!mesh) continue;
packages/file-format/src/export/ifc/readers/HandrailReader.ts:19     if (!geometry) continue;
packages/file-format/src/export/ifc/readers/PlumbingReader.ts:17     if (!mesh) continue;
packages/file-format/src/export/ifc/readers/PlumbingReader.ts:19     if (!geometry) continue;
packages/file-format/src/export/ifc/readers/SlabReader.ts:17         if (!mesh) continue;
packages/file-format/src/export/ifc/readers/SlabReader.ts:19         if (!geometry) continue;
packages/file-format/src/export/ifc/readers/StairReader.ts:17        if (!mesh) continue;
packages/file-format/src/export/ifc/readers/StairReader.ts:19        if (!geometry) continue;
packages/file-format/src/export/ifc/readers/WindowDoorReader.ts:17   if (!mesh) continue;    ← windows
packages/file-format/src/export/ifc/readers/WindowDoorReader.ts:19   if (!geometry) continue;
packages/file-format/src/export/ifc/readers/WindowDoorReader.ts:61   if (!mesh) continue;    ← doors
packages/file-format/src/export/ifc/readers/WindowDoorReader.ts:63   if (!geometry) continue;
```

`WallReader` is the only reader with a parametric fallback; `RoomReader` and `WallReader` are the
only two that log at all. **Nothing returns a skip count. Nothing aggregates one.**
`FragmentReader.read()` (`FragmentReader.ts:76-134`) concatenates the readers' arrays and prints
`Total elements gathered: ${elements.length}` — a count of what SURVIVED, with no denominator.

**The two states conflated:** *"this project has no beams"* and *"no beam had a scene mesh"* produce
the **same empty array**.

**And then the export announces success anyway:**

```
packages/file-format/src/export/ifc/ExportIFC.ts:126
    console.log('✅ IFC EXPORT SUCCESS — includes Pset_PRYZM_Spatial, …');
```

#### SF-01a — the mechanism that makes it LIVE today, not latent

`FragmentReader.findMesh` (`FragmentReader.ts:352-359`) is:

```ts
findMesh(id: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    this.sceneRegistry.scene.traverse((obj) => {
        if (obj.userData?.id === id && !found) { found = obj; }
    });
    return found;
}
```

An **InstancedMesh carries no per-element `userData.id`** — `InstancedElementRenderer.ts:480` stamps
`group.mesh.userData.id = 'instanced-group-<key>'` for the whole aggregate. And instancing is
**default-ON for three families** (`ElementInstanceBridge.ts:333-339`):

```ts
const _FAMILY_DEFAULTS = Object.freeze({
    window: true,  column: false,  beam: false,  handrail: true,  stairRailing: true,
});
```

Two distinct outcomes follow, and the second is worse than the first:

- **`handrail` → PARTIAL, silently.** `HandrailFragmentBuilder.ts:533-556` and `:574-594` register
  every baluster and post with the instance bridge and add **no mesh to the group** on that path.
  The rail (`:417`) and infill (`:473`) are still real meshes, so `extractGeometry` returns
  something and the `continue` never fires. **The exported `IfcRailing` is a rail with no balusters
  and no posts, and nothing says so.**
- **`window` → WRONG, silently, with a plausible shape.** `WindowBuilder.ts:801` stamps
  `group.userData.id = win.id`, so `findMesh` DOES find the group. `_convertGroupToInstances`
  (`WindowBuilder.ts:1091-1104`) then removes every real sub-mesh and adds **one invisible
  hit-proxy**:
  ```ts
  const proxyGeo = new THREE.BoxGeometry(win.width, win.height, (win.frameDepth ?? 0.2) + 0.02);
  const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  ```
  `FragmentReader.extractGeometry` (`:384-450`) filters on `child instanceof THREE.Mesh && child.geometry`
  and **applies no material filter**, so it triangulates the proxy. `extractColor` (`:365-382`)
  likewise takes the first material with a `color` — the proxy's default-white `MeshBasicMaterial`.

  **Every window in a default-configured project therefore exports to IFC as a solid white
  window-sized BOX.** Not missing — *wrong, and shaped plausibly enough that nobody checks.*

**Kill switch, no redeploy** (from the builder's own comment): `__pryzmElementInstancing = { window: false }`
in the browser console, then force a rebuild. That is a diagnostic aid, **not** the fix.

**Not measured here:** whether `column`/`beam`/`furniture`/`plumbing`/`curtain-wall` are ever
instanced in practice (defaults are `false`), and whether a hidden level or culled LOD removes an
element from `scene.traverse`. Both are plausible additional triggers and neither was traced.

---

### ⛔ SF-02 — The repo's own named cure for silent command rejection covers 4 of 33 dispatches IN THE FILE THAT DEFINES IT, and 0 anywhere else

`apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts` is the Property panel's Apply
path. Its header docblock is unambiguous:

```
 * §FIX-COMMAND-REJECTION-SURFACED (Gate G7, P8 / C11 §5) — a rejected command must SURFACE.
 *
 * Every dispatch in this file used to end in `.catch(e => console.error(...))`. That is how
 * `wall.setColor` stayed broken: … the rejection went to a console nobody reads, and the
 * inspector's live mesh repaint told the user it had worked. …
 * Now every failure reaches the user on the same `pryzm:toast` channel …
```

**Measured at HEAD:**

```
$ grep -c "^function surfaceCommandFailure" …/PropertyInspectorApply.ts   → 1   (the declaration)
$ grep -o "surfaceCommandFailure(" …/PropertyInspectorApply.ts | wc -l    → 5   (⇒ 4 call sites)
$ grep -o "=> console\.error(" …/PropertyInspectorApply.ts | wc -l        → 29
$ grep -rn "surfaceCommandFailure" --include=*.ts apps src packages plugins
      → 1 hit outside this file, and it is a COMMENT (initBusHandlers.ts:1310)
```

*"Now every failure reaches the user"* is true of **4 of 33** dispatches. The helper is not
exported and is used by no other module.

**Estate-wide, the same shape (probe `dispatch.mjs`):**

```
optional-chained executeCommand sites : 188
  awaited (caller can see result)     :   8
  .catch(console.*) LOG-ONLY          : 143      ← the defect
  .catch(real handling)               :   9
  .then(...)                          :   0
  FIRE-AND-FORGET (no handling)       :  28      ← SF-03
```

**Where the 143 live (top files):**

| n | file |
|---:|---|
| 28 | `apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts` |
| 13 | `apps/editor/src/ui/property-panel/PropertyPanelTypeSelector.ts` |
| 13 | `apps/editor/src/engine/views/plantools/CopyPlanToolHandler.ts` |
| 10 | `apps/editor/src/ui/property-inspector/RoomPropertySection.ts` |
| 10 | `apps/editor/src/engine/views/PlanViewInteraction.ts` |
| 8 | `apps/editor/src/engine/views/plantools/AlignPlanToolHandler.ts` |

**Two states conflated:** *"the parameter was applied"* and *"the command bus threw"* — and
`CommandBus.executeCommand` **throws** `CommandBusError` on an unregistered type
(`packages/command-bus/src/CommandBus.ts:346-349`), which is precisely the wiring defect this class
of bug is made of. The panel repaints regardless.

---

### ⛔ SF-03 — Five element-creation plan tools dispatch fire-and-forget: no `await`, no `.catch`, no refusal

```
apps/editor/src/engine/views/plantools/ElevationPlanToolHandler.ts:109   elevation.create
apps/editor/src/engine/views/plantools/FloorPlanToolHandler.ts:497       floor.create
apps/editor/src/engine/views/plantools/RoofPlanToolHandler.ts:284        roof.create
apps/editor/src/engine/views/plantools/RoomPlanToolHandler.ts:114        room.create
apps/editor/src/engine/views/plantools/SlabPlanToolHandler.ts:419        slab.create
```

All five are `window.runtime?.bus?.executeCommand('<kind>.create', { … })` with nothing attached.
The user draws a room / slab / roof / floor / elevation; if the command rejects, the rejection is an
unhandled promise and **the tool resets its overlay as though the element was created**. The full
28-site list is in probe output `dispatch.mjs fireForget`; the remaining 23 are panels
(`OverridePanel` ×10, kitchen/wardrobe inspectors, `ViewPropertiesPanel`, `AIPanel:1360`).

---

### ⛔ SF-04 — Save paints "Saved" thirteen lines before it learns the index did not persist — and clears the dirty flag on the way, disarming the `beforeunload` flush

`apps/editor/src/ui/platform/PlatformSaveController.ts`:

```
:343    this.markCleanLabel(label, serialisedHash);          ← status pill = "Saved <label>", dot clean
                                                              ← orchestrator.markClean() ⇒ hasDirtyChanges = false
…
:356    if (!outcome.indexPersisted) {
:357        this._reportStorageQuotaFailure(label);           ← the L-269 honesty gate, 13 lines LATE
:358        return;
```

`markClean` (`SaveOrchestrator.ts`) sets `hasDirtyChanges = false`, `pendingSave = false`, cancels
the debounce and sets status `idle`. `flushBeforeUnload` opens with `if (!this.hasDirtyChanges) return;`.

**Consequence.** On a storage-quota index failure the user sees the pill say **Saved**, then a
banner. Between those two paints the autosave engine has been told the document is clean, so the
emergency `beforeunload` flush **will not fire**. The L-269 gate is real and its message is honest;
it simply runs after the success UI and after the state that would have protected the work.

**Related, same file, unmeasured consequence:** `flushBeforeUnload` also returns silently when
`isLoading` is true (`SaveOrchestrator.ts:355-359`) with a `console.log` only — closing the tab
during a project load drops unsaved work with no user-visible signal. Recorded, not ranked: the
window is narrow and was not traced to a reproduction.

---

### ⛔ SF-05 — The gate built for this exact defect class is COMMITTED AND REGISTERED NOWHERE

```
$ git ls-files tools/ga-gate/ | grep -oE "check-[a-z0-9-]+\.ts$" | sort -u | wc -l   → 67
$ grep -oE "check-[a-z0-9-]+\.ts" tools/ga-gate/run-all.ts | sort -u | wc -l         → 91
$ comm -23 tracked registered
    check-material-maps-tiling.ts      ← materials lane, NOT MINE — named for its owner
    check-runtime-arg-omitted.ts       ← §RUNTIME-ARG-OMITTED (L-1893), built 2026-08-21
$ grep -n "runtime-arg" tools/ga-gate/run-all.ts .github/workflows/ci.yml package.json  → (no output)
```

`check-runtime-arg-omitted.ts` is tracked, passes (`RC=0`, ARM A `21 / 21`), and appears in **no**
runner, **no** CI job and **no** npm script. `run-all.ts:837-869` has an orphan-gate detector
written for exactly this — §GATE-AUTHORED-BUT-UNWIRED — and it fires only when someone runs
`run-all`, which nothing in this lane's brief did.

**This is the class the gate polices, applied to the gate:** authored, committed, reads as coverage,
runs nowhere.

---

### ⚠ SF-06 — The gate's blind spot is the dominant form of the defect — and the evasions it *could* have had are NOT real

Ran the gate at HEAD:

```
[runtime-arg-omitted] scanned 4798 files · 214 classes with an optional trailing runtime param
[runtime-arg-omitted] ARM A … : 21 / 21     RC=0
```

Probe `gateblind.mjs`, on the same tree:

```
classes matching the GATE's shape (runtime: T | null = null) + behavioural chain : 105
classes using the OPTIONAL-MARKER shape (runtime?: T)        + behavioural chain :   0
  of those, BARE construction sites the gate cannot see                          :   0
MULTI-LINE bare constructions (gate scans line-by-line)                          :   0
```

**Honest negative, stated as a negative:** the two regex evasions I expected — `runtime?: T`
instead of `runtime: T | null = null`, and `new X(\n)` split across lines — **do not exist in this
tree**. The gate's pattern is not currently being dodged.

**The real gap is SCOPE, and the gate says so in its own header.** It reports on constructor
injection only. The dispatch volume is not there:

| shape | sites | gate sees |
|---|---:|---|
| class ctor `runtime: T \| null = null`, constructed bare | **21** | ✅ ARM A |
| module-scope `window.runtime?.bus?.executeCommand(…)` | **188** | ❌ no class, no constructor |
| `runtime?.events?.on(…)` subscriptions | **224** | ❌ (23 of them capture `?? null`) |

And the deeper gap: **the gate counts ARGUMENTS, never OUTCOMES.** All 21 ARM-A entries could be
fixed and all 143 log-only dispatches would still be silent, because passing a runtime says nothing
about whether the command it dispatched was accepted.

**The 21 ARM-A entries at HEAD, verbatim** (six were independently confirmed dead by code audit the
same day, per the gate's own baseline comment):

```
AmbientIndicator            initDataPlatform.ts:438        FloatingObjectCarousel     initTools.ts:649
AuditStack                  AuditStack.ts:436              FurnitureDragDropHandler   initTools.ts:653
DataVisualizerService       DataVisualizerService.ts:465   KitchenRunInspector        KitchenRunInspector.ts:458
KitchenUnitInspector        KitchenUnitInspector.ts:565    PanoramaPanel              PanoramaPanel.ts:627
PropertyPanel               PropertyPanelAdapter.ts:42     RenderPanel                RenderPanel.ts:377
RenderQueuePanel            RenderQueuePanel.ts:405        SaveUndoRedoHUD            DockingLayout.ts:181
SheetEditorPanel            initUI.ts:847                  StairLevelRequiredPanel    BimService.ts:512
SyncStateDetailDrawer       SyncStateDetailDrawer.ts:547   VideoExportPanel           VideoExportPanel.ts:525
ViewPropertiesSection       PropertyPanel.ts:746           VisualizationEnginePanel   VisualizationEnginePanel.ts:1072
WardrobeRunInspector        WardrobeRunInspector.ts:400    WardrobeSectionInspector   WardrobeSectionInspector.ts:422
WorkspaceModeBar            DockingLayout.ts:180
```

---

### ⚠ SF-07 — Two rival event-payload catalogues; 34 of the 83 names they share DISAGREE about the payload keys

Probe `eventdiv.mjs`:

```
packages/runtime-composer/src/types.ts (PryzmRuntimeEvents) declares : 212 event names
packages/event-bus/src/catalog.ts      (EventCatalog)       declares : 201 event names
declared in BOTH                                                    :  83
   of those, KEY SETS DIFFER                                        :  34
declared ONLY in runtime-composer                                   : 129
declared ONLY in event-bus                                          : 118
```

`catalog.ts:1-5` states: *"This is the **single source of truth** for typed event communication."*
**84 production files import `@pryzm/event-bus`.** Neither file imports the other; nothing compares
them.

Sample divergences, all verbatim from the probe:

```
pryzm-element-selected   runtime-composer {annotationId, elementId, elementType, source}
                         event-bus        {id}
view-activated           runtime-composer {camera, mode, source, type, view}
                         event-bus        {viewId}
view-selected            runtime-composer {view, viewId}
                         event-bus        {view}
vi:instance-remote-synced runtime-composer {intentId, projectId, viewId}
                          event-bus        {instanceId}
rq-job-start             runtime-composer {id, name, type}
                         event-bus        {jobId}
rq-job-progress          runtime-composer {id, pct, status}
                         event-bus        {jobId, progress}
```

**Traced at HEAD: every live producer and consumer of `pryzm-element-selected` and `rq-job-*` uses
the `runtime-composer` shape.** The `event-bus` rows have zero producers and zero consumers — so
this is a **latent** defect, not a live one, and it is recorded as latent.

**Why it still ranks.** The dead half is the half that self-describes as authoritative. A listener
written tomorrow against `EventCatalog` reads `p.jobId` → `undefined`, `p.progress` → `undefined`,
does nothing, throws nothing, and **type-checks green**. That is L-1563 — *two channels, no
bridge* — pre-loaded, with 34 rounds in it.

---

### ⚠ SF-08 — `element.changeType` has no route for most element types and answers with `console.warn(… ignored)`

```
apps/editor/src/engine/initBusHandlers.ts:2204
    console.warn(`[element.changeType] no change-type route for elementType="${elType}" — ignored.`);
```

The user changes an element's TYPE in the Property panel. For any `elementType` without a route the
command resolves normally, the panel does not refuse, and the only trace is a `console.warn` with
the word *"ignored"* in it.

**Two states conflated:** *"the type was changed"* and *"this element family has no change-type
route"*. Same shape the file's own neighbouring comment (`:2233-2245`, §FIX-ELEMENT-MARK-UNHANDLED)
describes for `element.updateMark`, which **was** fixed — *"the panel showed '✓ Applied' and the
mark went nowhere"*. The cure was applied one handler over and not here.

---

### ⚠ SF-09 — `ScheduleExtractor` launders "not computed" into `"0.00"` in four columns, one line above two columns that get it right

`packages/core-app-model/src/schedules/ScheduleExtractor.ts:238-249`:

```ts
grossArea:   (r.computed?.area      ?? 0).toFixed(2),
perimeter:   (r.computed?.perimeter ?? 0).toFixed(2),
volume:      (r.computed?.volume    ?? 0).toFixed(2),
height:      (r.boundary?.height    ?? 0).toFixed(2),
…
// §FIX-BOUNDING-WALLS-UNDETERMINED — a count derived through an
// UNREAD relationship is not zero, it is unknown (C71 §4.4).
doorCount:   wallsUndetermined ? FINISH_UNDETERMINED : doorCount,
windowCount: wallsUndetermined ? FINISH_UNDETERMINED : windowCount,
```

**The rule is stated, cited to a contract, and applied — in the two lines immediately BELOW the four
that violate it.** A room whose area has never been computed appears on the room schedule as
`0.00 m²`, indistinguishable from a genuinely degenerate room.

The same file carries **26 `(x ?? 0).toFixed(n)` sites** across walls, doors, curtain walls,
columns, beams, slabs, furniture, handrails and plumbing. Repo-wide:

```
?? 0  /  || 0  sites in source                     : 2059
   … feeding a formatter (.toFixed/.toLocaleString) :   72
   … assigned straight to textContent/innerHTML     :    2
```

`ScheduleExtractor` rows are rendered by `apps/editor/src/ui/SchedulePanel/SchedulePanel.ts:181`.
**Not measured:** whether schedule rows also reach a sheet or a PDF/DXF export.

---

### ⚠ SF-10 — An undo/redo jump that THROWS is silent; one that partially succeeds toasts

`apps/editor/src/ui/SaveUndoRedoHUD.ts:542-549`:

```ts
private _runJump(direction: 'undo' | 'redo', index: number): void {
    let outcome: UndoJumpOutcome;
    try {
        outcome = direction === 'undo' ? undoThrough(index) : redoThrough(index);
    } catch (err) {
        console.error(`[SaveUndoRedoHUD] ${direction} jump threw`, err);
        return;                                     // ← the user is told NOTHING
    }
    …
    const msg = `${outcome.completed} of ${outcome.requested} step…`;   // ← toast, 'error', 6000ms
```

The partial-success path is exemplary — it reports `completed`, not `requested`, and the docblock
explains why. **The worse outcome gets the weaker treatment:** the jump exploding is the one state
with no toast at all. The user clicks a step in the undo popover and the popover simply closes.

---

### ⚠ SF-11 — 28 click handlers carry a bare guard-return with no user-visible surface anywhere in the handler

Probe `clickguard.mjs`: **702** click handlers scanned; **28** contain at least one
`if (…) return;` and contain **no** toast, decline, throw, status write, `textContent`/`innerHTML`
write, `console.warn` or `console.error` anywhere in the handler body.

Highest blast radius of the 28, read in source:

```
apps/editor/src/ui/rendering/VisualizationEnginePanel.ts:772
    const enable  = window.enableViewportRenderMode;
    const disable = window.disableViewportRenderMode;
    if (!enable || !disable) return;      ← the Start/Exit RENDER button. If the legacy globals
                                            are not installed the primary render control is inert
                                            for the whole session, with no signal.

apps/editor/src/ui/rendering/VisualizationEnginePanel.ts:760
    const dataUrl = vpt.captureCurrentFrame();
    if (!dataUrl) return;                 ← Screenshot. A failed capture and a successful one
                                            both end with no file and no message.

apps/editor/src/ui/OverridePanel.ts:288, 311   if (!this.activeViewId) return;
apps/editor/src/ui/rendering/VideoExportPanel.ts:276, 488
apps/editor/src/ui/property-inspector/RoomPathfinderPanel.ts:168
apps/editor/src/ui/rooms/EvacuationSimulatorPanel.ts:172
```

**The counter-example, and the standard the rest should be held to** —
`apps/editor/src/ui/ContextualEditBar.ts:1009-1051`, `_resolveOperationTarget`: five refusal arms,
**every one of them** calling `_declineOperation(opLabel, <reason>)` with a sentence a user can act
on, including one that exists purely to stop a keyboard shortcut bypassing a disabled button.
That function is what "robust" looks like in this codebase, and it was written here.

---

### ⚠ SF-12 — The IFC export's only error channel below a throw is `console.debug`, and the alert it *does* show names a log that is OFF by default

```
packages/file-format/src/export/ifc/ExportIFC.ts:221-223
    } catch (err) {
        debug(`[ExportIFC] Semantic data assembly error: ${err}`);      ← rooms array left PARTIAL
    }
    return { rooms, relationships, schemaVersion: 3 };
```

`debug` resolves to `packages/core-app-model/src/debugOverlay.ts:5-11`:

```ts
export function debug(message: any) {
    const text = …;
    if (window.__PRYZM_SHOW_DEBUG_OVERLAY !== true) { console.debug(text); return; }
    …
}
```

`console.debug` is Chrome DevTools' **Verbose** level, **hidden by default even with DevTools open**.
So a mid-loop crash in room-semantic assembly is invisible at every level of user attention, and
`buildSemanticData` returns the partial array as though it were complete.

**The sibling arm 60 lines up got this right and the fix was not carried down** —
`ExportIFC.ts:156-160`:

```ts
} catch (err) {
    // §HONESTY — this used to be silent. An empty `relationships` array is what a
    // project with no semantic graph produces AND what a crashed read produces;
    console.warn('[ExportIFC] SemanticGraph read FAILED — exported IFC will carry NO relationships.', err);
}
```

Same file. Same function. Same defect. Fixed once.

**And the refusal that DOES reach the user names a hatch that does not exist** —
`apps/editor/src/engine/initUI.ts:1037-1039`:

```ts
} catch (err) {
    console.error('[export-ifc] Export failed', err);
    alert('IFC export failed. See the on-screen log for details.');
}
```

There is no on-screen log unless `window.__PRYZM_SHOW_DEBUG_OVERLAY === true`. This is the
**CHAT_UNAVAILABLE shape**: a refusal whose stated escape hatch is not reachable.

Repo-wide: **24** `debug(...)` calls whose own text says *fail / error / could not / cannot /
missing / skip / abort / invalid*, and **147** `console.debug(` sites.

---

### 📋 SF-13 — The catch census

Probe `catch3.mjs`, **4728 files**, **3865 `catch` blocks**:

| classification | n | reading |
|---|---:|---|
| BARE empty (`catch {}`, no comment at all) | **0** | ⭐ genuinely good — every swallow is annotated |
| empty, comment only (`catch { /* non-fatal */ }`) | 1194 | intent recorded; correctness unverified |
| `return`-only, no log | 243 | **failure and empty result are the same value** |
| log-only (`console.*`, no rethrow, no return) | 1071 | caller proceeds as if it succeeded |
| log then return | 86 | |
| substantive body | 1271 | |

Against that: **275** `showToast(` / `toasts.*` / `notify(` call sites in the entire client.

**The ratio is the finding.** `243 + 1071 = 1314` catch blocks end without the caller learning
anything and without the user learning anything, against 275 places in the whole product where a
user can be told something went wrong. Production is minified with `esbuild`
(`vite.config.ts:219`), which does **not** strip `console` — so the information exists; it exists
in a place the founder does not look.

---

## 2. Honest negatives — things I expected to find and did NOT

These are recorded because a clean result is only worth having if it is stated as loudly as a dirty
one.

| Checked | Result |
|---|---|
| **`aria-disabled` without a real `disabled`** (the L-1554 shape, flagged as *"worth grepping estate-wide"* and never done) | **CLOSED.** 15 sites. `BottomActionMenu:1066`, `renderGisActions:111`, `parcelCard:295`, `commandBacking:172`, `TypologyPickerPanel:214`, `envelopeCardSections:367` — **every one** pairs it with `btn.disabled = true`. `ContextualEditBar:511` explicitly re-checks the attribute in the listener. **Zero new instances.** |
| **`CHAT_UNAVAILABLE` refusals naming a tool that does not exist** (`ChatCapabilityRegistry.ts:2953-3005`) | **ALL PRESENT.** *"use the Move tool"* → `operationId:'move'` (`ContextualEditBar.ts:266`); *"Join tool"* → `:360`; *"Cut tool"* → `:375` (`title: 'Cut / Trim'`); *"Modify tools"* → `rotate` `:277`, `mirror` `:390`. Not one dangling hatch in that table. |
| **The runtime-arg gate being evaded by shape** | **0 and 0.** No `runtime?: T` ctor form, no multi-line `new X(\n)`. |
| **Counts of calls rather than records** | **No new instance measured.** 40+ user-facing `N of M` strings sampled; the ones read in source (`SaveUndoRedoHUD:555`, `programNotice:143`, `ElementTypeSelectorZone:725`, `capacityPanelSection:169`) all carry a real denominator, and several go out of their way to distinguish *unknown* from *zero*. |
| **`RenderQueuePanel` progress being fake** | **Real state.** `updateJobProgress` / `completeJob` / `errorJob` are all driven by `rq-job-*` events, and all four events have live emitters (`PanoramaPanel`, `RenderPanel`, `VideoExportPanel`), including `rq-job-error` on both the failure and the user-cancel path. |

---

## 3. The proposed gate — `check-dispatch-outcome-surfaced.ts`

**DESIGN ONLY. Not built. Do not treat this section as coverage.**

### The invariant it would enforce

> Every dispatch of a mutating command from a UI surface must have exactly one of:
> **(a)** an `await` inside a `try` whose `catch` reaches a user-visible surface, **(b)** a
> `.catch(…)` whose body reaches a user-visible surface, or **(c)** a `// §SILENT-BY-DESIGN: <reason>`
> annotation naming why the user must not be told.
>
> `console.*` is **not** a user-visible surface.

### Shape

Three arms, because the three failure modes have different denominators and folding them together
makes all three unreadable — the mistake `CLAUDE.md` records for the `commandManager` counters.

- **ARM A — hard-0, no baseline: FIRE-AND-FORGET.** A `bus.executeCommand(` / `?.bus?.executeCommand(`
  with no `await`, no `.catch`, no `.then`. Today: **28**. These are unhandled promise rejections at
  user-triggered controls; there is no honest reason for one, so the arm has no baseline and the
  fix is mechanical. Start it as a shrink-only ratchet at 28 and drive it to 0.
- **ARM B — shrink-only ratchet: LOG-ONLY.** `.catch` whose body's only effect is `console.*` /
  `logger.*` / `debug(`. Today: **143**. Baseline 143, and the arm's message must name
  `surfaceCommandFailure` (`PropertyInspectorApply.ts:39-47`) as the existing repair, so nobody
  writes a second one.
- **ARM C — census, gates nothing, PRINTS THE DENOMINATOR.** Every `catch` block in the tree
  classified as in §SF-13, with the `log-only` and `return-only` totals and the repo-wide
  `showToast` count printed side by side. Gating this would be dishonest — most of the 1194
  annotated empty catches are legitimately non-fatal. **Printing it is not.** The number moving in
  the wrong direction is the signal.

### The escape hatch, and why it must exist

`// §SILENT-BY-DESIGN: <reason>` on the line above the dispatch. Without it the gate would be
unsatisfiable for the genuinely-fire-and-forget cases (telemetry, a best-effort thumbnail upload,
a toast about a toast bus) and an unsatisfiable gate is one people disable —
[[unsatisfiable-gate-decomposition-is-the-fix]]. The annotation is grep-able, so the set of
deliberate silences becomes a **list somebody can read**, which is the actual product of the gate.

### Registration — the part SF-05 says will be skipped

The gate must be added to `tools/ga-gate/run-all.ts`'s `GATES` array **in the same commit as the
file**. `run-all.ts:837-869` will otherwise report it as a committed-but-unregistered orphan — the
state `check-runtime-arg-omitted.ts` is in right now.

### ⛔ What this gate structurally CANNOT see — stated so nobody reads a green as "failures surface"

1. **Whether the surface is TRUE.** A `.catch` that calls `showToast('Something went wrong')` passes.
   A toast that names the wrong cause is worse than none, and no static check can tell.
2. **Whether the toast is REACHED.** `surfaceCommandFailure` emits on `window.runtime?.events?.emit('pryzm:toast', …)`
   — the optional chain this whole register is about. If the toast bus is unwired, every "surfaced"
   failure is silent and the gate is green. **The gate cannot check its own escape route.**
3. **A command that RESOLVES with a refusal.** The gate keys on rejection handling. A handler that
   returns `{ ok: false }` and resolves normally passes every arm and tells the user nothing. This
   is the `previewMoveReweld` laundering shape (L-1571) and it is invisible here.
4. **The consequence not happening.** A dispatch can be accepted, undone by a later cascade, and
   never appear on screen. [[committed-is-not-reachable]] — proving it needs a browser, not a regex.
5. **Non-bus mutation paths.** Direct store writes, `commandManager.execute`, DOM events. P6's own
   gate tolerates 37 direct writes; this gate sees none of them.
6. **Silence upstream of the dispatch.** SF-11's 28 guard-returns never reach a dispatch at all —
   the button returns before there is anything for this gate to inspect. **That needs a second,
   different gate, and it is the harder one**, because distinguishing "this guard is a refusal the
   user needs" from "this guard is a re-entrancy check" is a judgement, not a pattern.
7. **The IFC-reader shape (SF-01) entirely.** A `continue` inside an export loop is not a dispatch.
   The general form — *a loop that skips a record and returns a shorter array with no count* —
   is a real and separate gate, and it is the one that would have caught the highest-blast-radius
   finding in this document. It is not this gate.

---

## 4. What was NOT swept

Stated plainly so the coverage of this pass is not overstated.

- **`server/` and `server.js`** — the ~240 KB Express BFF was included in the `catch3.mjs` census
  only. No route, auth, Stripe, Socket.io or DB-error path was read.
- **`apps/` other than `editor`** — `ai-worker`, `marketplace`, `api-gateway`, `docs-site`,
  `component-editor` and the rest appear in the counts and were not read.
- **`plugins/*` (48)** — included in every count, individually unread.
- **DXF, PDF, sheet, glTF and Rhino export paths** — only IFC was traced end to end.
- **The collaboration / CRDT merge path** — `sync-client`, `YjsDocAdapter`, `RemoteCommandDispatcher`.
  P8's conflict half has its own gate and its own lane.
- **Any runtime behaviour.** This was a source read. Nothing was executed in a browser; no claim
  here rests on an observed screen. Where a claim needed runtime evidence it is marked UNMEASURED.
- **Cross-domain finds handed to their owners, not pursued here:**
  `tools/ga-gate/check-material-maps-tiling.ts` is the second unregistered orphan gate (materials
  lane); `packages/render-pipeline/` orphan copy (render lane, already L-1514);
  `versionCount: countVersions(…) + 1` in `PlatformSaveController.ts:326` assumes the save it is
  about to attempt will land (persistence lane).

---

*Register opened 2026-08-21 by lane AUD-4. ISSUE-LOG block L-2600 … L-2699.*
