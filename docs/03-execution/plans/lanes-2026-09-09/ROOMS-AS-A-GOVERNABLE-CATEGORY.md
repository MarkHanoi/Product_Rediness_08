<!--
  LANE OUTPUT — Rooms have no Visibility Intent category — the row, the reader, and the three gates in series
  Workflow task wz6zn6r10. Produced 2026-09-09 and captured to the repo the same day.

  ⚠ THIS IS A LANE REPORT, NOT A CONTRACT. It is an audit's own words, verified by its
  own adversarial passes and no further. Where it and the code disagree, the code wins
  and this file is stale. Line numbers rot fast — re-read before acting on one.

  ⭐ Captured because the fixes it drove ship across several commits, and the REASONING
  behind a one-line change is the part that is expensive to reconstruct. Several findings
  here were deliberately NOT implemented; the commits say which and why.
-->

# Implementation plan — "rooms have no Visibility Intent category to modify the colours"

**Verified at HEAD `f1118f00`** (the dossier pins `632d57b9` / `aa119382` / `91a68920` — all three are behind; every line number below was re-read at `f1118f00`). Measurements marked ⚙ were produced by executing the code, not by reading it.

---

## 1. CAN THE FOUNDER EDIT ANYTHING AT ALL?

**No — and the blocker is not the one the brief expects. Three gates sit in series, and the *first* one silently disables the room-colour control he already has.**

### ⛔ GATE 0 — the room colour control he already owns REFUSES on its default setting (this is the live defect)

`RoomPropertySection.ts:660-668` builds the "Colour by" scope `<select>` with `['view','This view']` appended **first**, so `scopeSel.value === 'view'` on every open. The click handler at `:699-704`:

```ts
const viewId = getActiveRoomColourViewId() ?? undefined;
if (scope === 'view' && !viewId) {
    showFeedback(btn, '', '✗ no active view', label, origStyle, false);
    return;                                  // ← no dispatch, ever
}
```

`getActiveRoomColourViewId()` (`RoomColourIntent.ts:170-179`) returns **null for the entire life of a shipping session**, on both of its legs:

| leg | why it is null | measured |
|---|---|---|
| `window.addEventListener('view-selected')` (`RoomColourIntent.ts:165`) | `ViewController.ts:1585` emits on `window.runtime.events` — `runtime-composer/src/EventBus.ts`, whose `emit()` (`:47`) never calls `window.dispatchEvent`. **Two channels, no bridge.** The repo documents this exact break in the comment immediately below the emit, `ViewController.ts:1587-1604` (§VG-VIEW-IDENTITY-IS-A-CALL, L-1563) | ✅ `grep -n "emit\|dispatchEvent" EventBus.ts` → one hit, `emit` at `:47`; no `dispatchEvent` |
| fallback `runtime.viewRegistry.activeViewId` (`RoomColourIntent.ts:177-178`) | `viewRegistry.activate()` has **zero production callers** | ⚙ `grep -rn "viewRegistry\.activate("` → 3 comments + 5 lines in one test file. `composeRuntime.ts:1301-1307` says so in its own words: *"`activeViewId` is `null` for the entire life of a shipping session"* |
| `setActiveRoomColourViewId()` — the explicit escape hatch | **zero non-test callers** (2 barrel re-exports, 1 definition, 3 test lines) | ⚙ `grep -rn setActiveRoomColourViewId` |

**So: every click on every "Colour by" button today shows `✗ no active view` and changes nothing.** VGSceneApplicator was rescued from the identical break by a direct call (`ViewController.ts:1608-1611`); `RoomColourIntent` never got the equivalent — even though the setter's own docstring (`RoomColourIntent.ts:185-187`) names the missing caller by name: *"tests, **and the plan canvas, which knows its own view id**."*

This is very likely a large part of "THAT I DONT SEE". **Fix this first; it is one line in two places.**

### GATE 1 — the tab labelled "Visibility Intent" has no category rows for *any* family

`ProjectBrowserPanel.ts:276` registers `{ id: 'VISIBILITY_INTENT', label: 'Visibility Intent' }` → `VisibilityIntentManagerPanel` (constructed for real at `:223`). ⚙ `grep -n "elementRules|type=\"color\"|CATEGORIES"` over that 727-line file → **2 hits, both a `JSON.parse(JSON.stringify(from.elementRules))` clone at `:656-657`**. It is the intent **index**: name, description, usage, view seed. Its own comment at `:477-479` concedes the rules editor is a different file and that **L-5063 tracks linking them — there is no link.**

The panel with per-family rows and `<input type="color">` is `apps/editor/src/ui/VisibilityIntentPanel.ts`, reachable only by:
- **Ctrl+Shift+I**, gated on `plan === 'owner'` read from `localStorage` (`initUI.ts:3506-3519`), or
- **"Open Intent Editor"** on a view's Properties spine (`ViewPropertiesPanelBuilders.ts:190-196`).

⛔ **Consequence: adding `room` to `ELEMENT_TYPES` puts the row in a panel the founder has plausibly never opened. "THAT I DONT SEE" stays literally true after that change lands.**

### GATE 2 — that panel is hard read-only on all five shipped intents

| gate | site | verified |
|---|---|---|
| every appearance input carries `disabled` | `renderAppearanceForm(appearance, intent.isSystem, …)` at `:264` | ✅ |
| `bind()` returns before wiring a single write handler | `if (intent.isSystem) return;` at `:772`; the `[data-appearance]` listener is at `:778` | ✅ |
| store refuses | `VisibilityIntentStore.ts:72` — keys on **map membership**, not the boolean, so flag-flipping cannot defeat it | ✅ |
| command refuses | `UpdateVisibilityIntentCommand.ts:48` | ✅ |
| all five shipped intents are system | `SystemIntents.ts:48` hard-codes `isSystem: true` inside `makeIntent`; five ids at `:275/:285/:303/:314/:327`; `getDefaultSystemIntentId()` (`:351`) returns `architecturalDocumentation` | ✅ |

**The Duplicate escape hatch is real and binds the copy to the view** (`:202` button, bound at `:738` — *above* the `:772` return; `duplicateIntent` at `:923`, `isSystem:false` at `:932`, `AssignViewIntentCommand` at `:950`). Caveat: all three writes go through `const cm = window.commandManager; cm?.execute?.(…)` (`:916`, `:936`, `:950`) — an optional-chained legacy global. If it is absent at that moment, Duplicate silently does nothing but a `persistIntent('POST', …)`.

### 🔴 THE PINCER

Adding `room` to `ELEMENT_TYPES` alone can never give the founder a working colour swatch:

- on a **system intent** (the default binding for every view) the new row **appears and every control on it is disabled**;
- on a **pre-existing user intent** the row is **absent** — `renderRules` enumerates `Object.keys(intent.elementRules)` (`:240`) and no migrator backfills (`CURRENT_INTENT_SCHEMA_VERSION = 5`; ⚙ v2→v3, v3→v4, v4→v5 all `return intent`);
- the one configuration where the row is both present *and* editable is a user intent **created after this change and bound to his view**, reached through an owner-only keyboard shortcut.

**Verdict: the `ELEMENT_TYPES` row is not the fix.** It is step 6 of a 7-step design, not step 1.

---

## 2. WHAT IS ACTUALLY MISSING

**Not the data. Not the readers. The WRITER and the SURFACE.**

`room` is already a first-class VG category — union `VGSceneApplicator.ts:65`, element-type map `:143` (`'room' | 'Room' | 'RoomVolume' → 'room'`), a dedicated `fillGovernedElsewhere` arm at `:786`/`:792`/`:917-921`, and a complete row **including `fillColor: '#ffffff'`** in all four `BUILT_IN_TEMPLATES` (`VGGovernanceStore.ts:148, 177, 206, 235`). ⚙ The only production writer of the `room` category is `SetRoomColourModeCommand` (`:95`, `:105`) and it writes exactly one property: `roomColourMode`.

| # | Registry / seam | has `room` today | needed? | what breaks without it |
|---|---|---|---|---|
| A | **A writer for the `room` category's `fillColor`** | ❌ nothing in the product | **✅ REQUIRED — this is the gap** | `normaliseUniform` (`RoomColourIntent.ts:147-150`) returns `DEFAULT_UNIFORM_ROOM_COLOUR = '#FFFFFF'` when `source === 'built-in-default'`. "All white" is hard-locked to white. **This is "MODIFY THE COLOURS".** |
| B | **`getActiveRoomColourViewId()` populated** | ❌ null all session | **✅ REQUIRED (Gate 0)** | Existing mode control refuses on its default scope; any new per-view writer inherits the identical break |
| C | **A surface the founder can find** | ❌ mode toolbar is behind a room selection in the Properties inspector; rail "Visibility Intent" tab has no rows | **✅ REQUIRED** | The fix ships and he reports it again |
| D | `VisibilityIntentDefaults.ELEMENT_TYPES` (⚙ **19** entries, not 18) | ❌ no `room` | ⚠️ **OPTIONAL, and hazardous alone** — see §6 | Nothing today; a *bad* row if added bare |
| E | `OverridePanel.CATEGORIES` (`:247-268`, **14** rows) | ❌ | ⚠️ **WRONG HOME.** Its only write is `view.setCategoryVisibility` → `SetCategoryVisibilityInViewCommand` → an **intent** `visibilityOverride`. `_renderRoomFills` gates on `intent.visible` from **vgGovernanceStore** (`PlanViewCanvas.ts:2552`). A room checkbox here is dead on arrival | — |
| F | `ELEMENT_TYPE_TO_PROJECTION_LAYER` (`apps/editor/src/engine/views/EdgeProjectorService.ts:203`) | ❌ | 🚫 **IRRELEVANT** — edge projection layer for **line-work** | — |
| G | `ISO_LAYER_TO_VG_CATEGORY` (`DrawingLayerIdentity.ts:96`) | ❌ | 🚫 **IRRELEVANT** — a room wash has no ISO layer | — |
| H | `penCategoryForLayerTag` / `SYSTEM_PEN_TABLE` (`PenWeightTable.ts`) | ❌ | 🚫 **IRRELEVANT to the wash** (relevant only if D is taken — see §6). `PenWeightTable.ts:464-467` records that `RoomBoundingLine` was **deliberately** excluded | — |
| I | `CATEGORY_TO_DXF_LAYER` (`VGSceneApplicator.ts:87`) | ❌ | 🚫 **IRRELEVANT** — DXF stroke layer. Also absent for grid/level/annotation/lighting/boundary-line, i.e. absence is normal for a non-line-work family | — |
| J | `SVGCompositeRenderer.ISO_LINE_WEIGHTS` | ❌ | 🚫 **IRRELEVANT** — keyed by ISO layer, carries stroke widths in mm | — |
| K | `VG_CATEGORY_TO_ISO_LAYER` (`PocheFillTable.ts:71-78`, 6 rows) | ❌ | 🚫 **IRRELEVANT to the wash**, decisive if D is taken (§6) | — |
| L | Intent schema migrator | v5, ⚙ all four migrators are no-ops | only if D is taken | old user intents get no row |

**Six of the twelve rows are genuinely irrelevant.** Every one of F, G, H, I, J, K governs a LINE — its layer, pen, dash, or export stroke. `RoomColourIntent.ts:35-36` already states the rule the code obeys: `edgeColor` / `lineWeight` / `halftone` have no meaning for a room wash and are not read.

---

## 3. THE READER — the intent tier is a rival authority. **Drop it.**

**Two live readers already consume the `room` VG category. Zero read `visibilityIntentStore` for rooms.**

| reader | what it reads | verified |
|---|---|---|
| **2-D plan** `PlanViewCanvas._renderRoomFills` (`:2535-2582`) | `resolveRoomColourIntent(getRoomColourModelId(), this._lastViewId ?? undefined)` at `:2551` → `intent.visible` (`:2552`), `intent.transparency` (`:2553`), `intent.mode` + `intent.uniformColour` (`:2559-2561`). Nothing else. Runs only when `isPlanLike` (`:407-412`) | ✅ read line by line |
| **3-D** `RoomBoundaryBuilder` | `activeRoomColourIntent()` via `_readIntentOrNull` (`:255`), `syncFromViewIntent` (`:234-238`); subscribes on `window` to `vg:view-style-set`, `vg:category-style-set` + 6 more (`:130-144`) | ✅ |

`resolveStyle` (`VGGovernanceStore.ts:571-617`) reads `this.models` / `this.templates` / `this.views` **and nothing else** — ⚙ the only occurrence of `visibilityIntentStore` in that entire file is line 25, inside a `@deprecated` doc block.

**Precedence rule — keep the ONE cascade rooms already have:** `built-in → template → model-override → view-override` (`resolveStyle` tail, `:611-615`).

⭐ **The measurement that makes the minimal fix work.** `setViewCategoryOverride` (`:499-511`) and `setModelCategoryOverride` set `overrideFlags[prop] = true` for every property written. `resolveStyle:611-615` promotes `source` to `'view-override'` / `'model-override'` on exactly that flag. Therefore `normaliseUniform`'s `if (source === 'built-in-default' || !fillColor) return '#FFFFFF'` **does not discard an authored colour** — the one thing that could have killed this route does not bite.

⛔ **Why NOT an intent tier.** `SetRoomColourModeCommand`'s own header (`:8-15`) states the ruling: *"the mode rides `vgGovernanceStore`'s existing four-tier cascade … No new store, no new schema, no new persistence code."* Putting the colour in `visibilityIntentStore` splits **one user-facing control across two stores, two persistence paths** (project snapshot via `vgGovernanceStore.serialize()` vs `persistIntent('PUT')` to the server) **and two invalidation channels** — VG dispatches on `window.dispatchEvent` (`VGGovernanceStore.ts:276-277`) and both room readers listen there; `RoomBoundaryBuilder`'s eight-event list (`:130-144`) contains **no `vi:intent-updated`**, so the 3-D rooms would go stale on an intent edit. Resetting the intent would leave the mode behind. **Move both halves or neither — and both already live in VG.**

---

## 4. THE SMALLEST INCREMENT THAT WORKS — ranked first

**Two commits. Roughly 6 files. Traced to the pixel.**

### Step A (blocking, ~2 lines) — make the writer and the reader name the same view

`PlanViewCanvas` already knows its view id and already assigns it (`_lastViewId = viewId` at `:385` and `:1961`). Add, at both sites, the call the setter's docstring was written for:

```ts
this._lastViewId = viewId;
setActiveRoomColourViewId(viewId);   // §ROOM-VIEW-IDENTITY-IS-A-CALL — same shape as
                                     // ViewController.ts:1608 rescuing VGSceneApplicator
```

This uses the **existing exported setter**, mints no event bridge, and makes both room readers and the writer resolve the *same* tier by construction (today `_renderRoomFills` reads the **view** tier while `RoomBoundaryBuilder` reads the **model** tier — an asymmetry that is harmless only because the view tier is unwritable).

**Founder-visible change on its own:** the "Colour by" toolbar stops saying `✗ no active view` and starts working on its default "This view" scope. **That alone may close a large part of the report.**

### Step B (the actual gap) — one bus verb that writes the colour, and cannot ship a no-op

⚠️ **The trap inside the obvious fix.** ⚙ `RoomColourSystem.resolveForMode` (`:222-240`) consumes `opts.uniformColour` **only in `case 'uniform'`**. The default mode is `DEFAULT_ROOM_COLOUR_MODE = 'detection'` (`RoomColourIntent.ts:84`), which is what all four built-in templates ship. **A picker that writes `fillColor` alone does nothing on a fresh project in 5 of 6 modes** — the exact dead control this lane exists to prevent, reintroduced inside its own fix.

So the write is **one payload, one command, one undo entry, two properties**:

1. `packages/command-bus/src/commands.ts` — extend the existing typed entry at `:815`:
   ```ts
   'room.setColourMode': {
       mode: 'detection' | 'occupancy' | 'area' | 'custom' | 'uniform' | 'sync-state';
       scope?: 'view' | 'project';
       viewId?: string;
       /** Only meaningful with mode 'uniform'; writes the room category's fillColor. */
       colour?: string;
   };
   ```
2. `packages/command-registry/src/rooms/SetRoomColourModeCommand.ts` — take `colour?: string`, and where it writes today (`:95`, `:104`) write `{ roomColourMode: this.mode, ...(this.colour ? { fillColor: this.colour } : {}) }`. Extend `undo()` to restore `fillColor` alongside `roomColourMode`, using the existing `previousWasOverridden` shape (`:114-137`) — `isViewPropOverridden` / `isPropOverridden` already exist per-property.
   > Reuse this command; do **not** reach for `SetVGViewCategoryStyleCommand`. ⚙ It has no `ensureModel`/`ensureView`, and `setViewCategoryOverride` returns `false` for an unregistered view — a silent no-op on the very first click. `SetRoomColourModeCommand` already solves that (`ensureModel` `:83`, `ensureView` `:94`).
3. `plugins/rooms/src/handlers/SetRoomColourMode.ts` — pass `cmd.colour` through at `:89`. Verb already registered (`handlers/index.ts:37`).

### Step C — the surface, in the card he already has open

`RoomPropertySection.ts:689-708` renders one button per `ROOM_COLOUR_MODE_CHOICES`. Change the **`uniform`** entry from a bare button into a **button + inline `<input type="color">`**: picking a colour dispatches `room.setColourMode` with `{ mode: 'uniform', colour, scope, viewId }` — one gesture, one undo, and the mode can never be left behind. Relabel `ROOM_COLOUR_MODE_CHOICES`'s `uniform` hint (`RoomColourIntent.ts:99`) from *"All white"* to *"One colour"*. Every other mode button keeps its current behaviour and sends no colour.

### 🔬 PIXEL TRACE (2-D)

`swatch change` → `bus.executeCommand('room.setColourMode', {mode:'uniform', colour:'#c8102e', scope:'view', viewId})` → `SetRoomColourModeHandler.execute` (`:80`) → `SetRoomColourModeCommand.execute` → `ensureModel('model-default')` `:83` + `ensureView(viewId)` `:94` → `setViewCategoryOverride(viewId,'room',{roomColourMode:'uniform', fillColor:'#c8102e'})` → sets `overrideFlags.fillColor = true` (`:504`) → `dispatch('vg:view-style-set')` → `window.dispatchEvent` (`:277`).
**Repaint 2-D:** `PlanViewManager._registerTick` (`:770-780`) calls `_render()` at 30 fps → `PlanViewCanvas.render` `:412` `if (isPlanLike) this._renderRoomFills(ctx)` → `:2551` re-resolves → `resolveStyle` returns `source:'view-override'` → `normaliseUniform` **keeps** `#c8102e` → `:2559` `resolveForMode(room,'uniform',…,{uniformColour:'#c8102e'})` → `RoomColourSystem.ts:240` returns it → `ctx.fillStyle = color` (`:2568`) → `ctx.fill()` (`:2574`). **Red rooms.**
**Repaint 3-D:** `RoomBoundaryBuilder` `window.addEventListener('vg:view-style-set')` (`:130-144`) → `syncFromViewIntent()` (`:234`) → `activeRoomColourIntent()` → `getActiveRoomColourViewId()` now returns the same id **because of Step A** → `setVisualisationMode('uniform',{uniformColour:'#c8102e'})` → `_fillFor` (`:206`). **Red room meshes.**
**Persist:** `ProjectSerializer` `vgGovernance: vgGovernanceStore.serialize()`; restored by `ProjectLoader`. Zero new persistence code.

⛔ **Scope honesty to put on the control:** `_renderRoomFills` runs only under `isPlanLike` (`:407-412` — plan / structural-plan / ceiling-plan / detail). **There is no room wash in section or elevation in 2-D at all.** Say so on the row, or L-1610's original *"for all view types, elevation etc."* gets reported unfixed the next day.

---

## 5. THE FULL DESIGN — ordered, each step with its founder-visible change

| # | Step | Founder-visible change | Justification if none |
|---|---|---|---|
| **1** | **Step A** above — `setActiveRoomColourViewId` from `PlanViewCanvas:385/:1961` | "Colour by" stops refusing; mode changes take effect per view | — |
| **2** | Probe first (per [[context-data-honesty-family]]): replace the bare `catch {}` at `_renderRoomFills:2578-2580` with a **once-per-view `console.warn`** naming the store/intent that failed | none | Today, when the wash does not appear, this path **cannot tell you why** — and the dead twin swallows identically at `PlanViewFillRenderer.ts:68-70`. Ship the probe before the fix |
| **3** | **Step B** — `colour?` on the `room.setColourMode` payload + command + handler, with undo | none yet | Unblocks 4; a verb with no surface is deliberately one commit ahead of its UI |
| **4** | **Step C** — swatch on the `uniform` mode button in `RoomPropertySection`, relabelled "One colour" | **He can change the room colour and see it, in plan and 3-D, and undo it** ← *this is the ask* | — |
| **5** | Fix `check-verb-register.ts:425` in the same commit: its comment says `room.setColourMode` *"writes the rooms plugin store"*; ⚙ the handler declares `affectedStores = [] as const` (`SetRoomColourMode.ts:64`) and the command declares `['vg-governance']` (`SetRoomColourModeCommand.ts:49`) | none | A gate comment confidently wrong about the exact verb this lane extends. Correct it rather than inherit it |
| **6** | **The surface he named.** Put a **Rooms** section on the rail "Visibility Intent" tab (`VisibilityIntentManagerPanel`) carrying *Visible*, *Transparency* and the mode+colour control — all four fields the readers actually consume — dispatching the same verb. Alternatively close **L-5063** (link the index to the rules editor), which the panel itself asks for at `:477-479` | **"Rooms" appears where he looked for it** | — |
| **7** | *Only if still wanted:* `room` in `ELEMENT_TYPES` — and **never bare**. Requires: an explicit fill-only seed bypassing `resolvePen`/`fillFor` (§6), a v5→v6 migrator merging missing default keys into saved intents, a decision on which `ElementState` the reader queries (`STATES` = cut/beyond/hidden/projection, `selectedState` defaults to `'cut'` — `VisibilityIntentPanel.ts:26/:53`), and a `vi:intent-updated` subscription in `RoomBoundaryBuilder` | A `room` row in the owner-only rules editor whose `surface3D.colour` repaints 3-D rooms | ⚠️ On a system intent it is **disabled**; on a saved user intent it is **absent**. Do not do this before step 6 |

**Deliberately NOT in scope:** `room` in `OverridePanel.CATEGORIES` (dead on arrival, §2/E); room boundary **line-work** governance (needs an `A-ROOM` ISO row + a pen arm, and `PenWeightTable.ts:464-467` records the current exclusion as a **decision**); deleting the dead twins (register them, §6).

---

## 6. WHAT WOULD BREAK

### (a) ⚙ What a `room` rules record is seeded to — MEASURED, not read

`npx tsx` over `defaultRulesForElementType('room')` at HEAD:

```
cut         line {solid, 0.18mm, #000000, opacity 1}   fill {none, 0}
projection  line {solid, 0.18mm, #000000, opacity 1}   fill {none, 0}
beyond      line {solid, 0.18mm, #000000, opacity 1}   fill {none, 0}
hidden      line {solid, 0.18mm, #000000, opacity 1}   fill {none, 0}
```

Mechanism: `resolvePen(zone,'room')` misses `SYSTEM_PEN_TABLE` in **all four** zones → `FALLBACK_PEN` (`PenWeightTable.ts:307`, `pen(0.18,'#000000')`). `fillFor('room','cut')` → `defaultPocheFillForCategory('room')` → `VG_CATEGORY_TO_ISO_LAYER` (⚙ **6 rows**: wall/column/slab/beam/stair/roof) misses → `null` → `{style:'none',opacity:0}`.

**Two independent breaks:**
1. **A C09 §4.6.4 breach nothing would catch.** C09:703 requires strict `weight(CUT) > weight(PROJECTION) > weight(BEYOND) ≥ weight(HIDDEN)`; C09:1136 requires **only** `hidden` to dash; C09:724-727 closes the datum exemption at grid/level/annotation. A flat 0.18 ladder with a **solid, opacity-1 hidden** state violates all three. The two guards that police this (`DrawingZone.test.ts:165`, `PenWeightByFunction.test.ts:190`) iterate a hand-typed `SOLID_CATEGORIES` of ten families — **the row ships in breach, silently.** (The `lighting` precedent does not transfer: ⚙ lighting measures `0.18 > 0.13 > 0.09 ≥ 0.09` with `hidden` **dashed**, because the pen table already carried a lighting row. Room has none.)
2. **The colour control would open colourless** — Fill style `none`, Fill opacity `0`, a fallback swatch. The founder must change three controls to change one colour, with no hint.

### (b) ⭐ The regression is INVERTED from what the brief fears — and it is real

⚙ `rulesFor` (`IntentRuleResolver.ts:105-107`) ends `?? intent.elementRules.__default__`, and `__default__` measures **`cut fill {poche, #c9c9c9, opacity 1}`, `line {solid, 0.5mm}`**. **So anything asking the intent chain for `'room'` today is already handed a wall poché.** Adding the row does not introduce it — it **removes** it.

Does anything ask? **In plan, no** — `_renderPocheFills` keys on `vgCat` from `ISO_LAYER_TO_VG_CATEGORY`, which has no room row. **In 3-D, YES:** `VGSceneApplicator.applyToMesh3D:1085-1090` resolves on the **raw** `mesh.userData.elementType`, `RoomBoundaryBuilder` stamps `'room'` on the floor fill and the volume, and `threeDAppearanceResolver.resolveForView` falls through `rulesFor` to `__default__`. **⚠ Therefore, if any intent declares `surface3D` on `__default__`, it already repaints room meshes today, and adding a `room` row would CHANGE that appearance the moment it lands** — via `applyToMaterial` on a material builders **share per (levelId, colour)**, whose blast radius the code's own comment warns about at `:1095-1103`.

**This is the regression most likely to be missed and most likely to be noticed. It is a reason to keep step 7 last, behind a test.**

### (c) Old/new snapshot skew, if step 7 lands with a no-op migrator

`CURRENT_INTENT_SCHEMA_VERSION = 5`; ⚙ all four migrators are shape no-ops. Old snapshot in new build → no `room` key → falls to `__default__` → **wall poché on a room**. New snapshot in old build → an inert extra row. **Same project, two answers, keyed on save date.** Unlike `ifc-element` (whose v3 no-op is the cited precedent), the `__default__` fallback for room is *visibly wrong*, so copying that precedent reproduces the defect.

### (d) The system-intent sweeps touch the new key

`SystemIntents.ts:318` (`for (const rule of Object.values(rules))`) and `:332` (`Object.entries`) — Clean Presentation would pin room's projection weight, Structural Coordination would ghost it at opacity 0.35. No crash; a silently altered row.

### (e) ⛔ FIVE dead twins that will absorb a room fix and look correct in review

| file | status | verified |
|---|---|---|
| `apps/editor/src/engine/views/plan-canvas/PlanViewFillRenderer.ts` | **zero code importers** — a full copy of `_renderRoomFills` (`resolveRoomColourIntent` at `:40`) and of `_renderPocheFills` (`resolveIntentStyle` at `:114`); self-instantiates at `:268` | ⚙ repo-wide grep → **3 hits, all comments**: `initScene.ts:1003`, `DrawingLayerIdentity.ts:14`, `RoomStore.ts:29`. ⚠ `initScene.ts:1003` actively points a reader **at** the dead file |
| `apps/editor/src/ui/visibility/VisibilityIntentPanel.ts` | 50-line Phase-F stub, zero importers. **The shorter, more plausible path is the dead one** — edit the one *without* the `visibility/` segment | ✅ |
| `apps/editor/src/ui/ColorFillPanel.ts` | per-category `fillColor`/`lineColor`/`transparency`/`visible` editor; ⚙ only importer is its own spec. **"Color Fill" is Revit's name for the ROOM colour-scheme feature** — an implementer searching for the room-colour surface lands here first | ⚙ |
| `packages/ai-host/src/vg/VGIntentMapper.ts` | twin of the `command-registry` copy; the only constructors of `SetVGCategoryStyleCommand` | ✅ |
| `ViewTemplateToIntentMigration.ts` × 2 (`apps/editor/src/engine/persistence/migrations/` and `packages/persistence-client/src/loader/migrations/`) | duplicated; both call `cloneDefaultElementGraphicsRules()` — **step 7's migrator hits this pair immediately** | ✅ |

**Name all five in the commit message.** [[same-rule-two-implementations]], five ways.

### (f) Not a regression, but adjacent and worth one ISSUE-LOG row

`OverridePanel.CATEGORIES:258` offers `{ id: 'railing' }`; ⚙ `registerSemantic` counts across `packages/command-registry/src` + `plugins`: `room` **9** (the most of any family), `curtainwall` **3**, `stair-railing` **2**, bare **`railing` 0**. `targetMatches` is exact equality (`IntentRuleResolver.ts:80`). **`railing` is a dead checkbox; `curtainwall` is NOT** — the inherited audit was half wrong, and repeating "two dead checkboxes" damages the credibility of everything else. Separately, `curtainwall` (panel + plugin store key) vs `'curtain-wall'` (`VGSceneApplicator.ts:121`) vs `'CurtainWall'` (builders) is a **three-way spelling split** against an exact-equality matcher — its own lane.

---

## 7. THE ANTI-DRIFT TEST — `tools/ga-gate/check-family-vocabulary-agreement.ts`

Seventh recurrence. Model it on `tools/ga-gate/check-snapshot-family-coverage.ts`, whose arm discipline is already written down there (`:44-63`) and whose central rule is the one that matters here: **compare SETS in BOTH directions, because a count can be right while the membership is wrong.**

**The load-bearing design choice — a KIND, declared per family.** A naive "every family in every table" gate would force **six wrong rows** onto `room`. Each family declares one of:

- **`linework`** — owes a `SYSTEM_PEN_TABLE` row, an `ISO_LAYER_TO_VG_CATEGORY` row, an `ELEMENT_TYPE_TO_PROJECTION_LAYER` row, a `penCategoryForLayerTag` arm, a `CATEGORY_TO_DXF_LAYER` row;
- **`fill-only`** (`room`, `spaceEnvelope`) — owes an `ELEMENT_TYPE_TO_VG_CATEGORY` row **and a named reader**; owes **no** layer, pen or DXF row;
- **`datum`** (`grid`, `level`, `annotation`, `boundary-line`) — dash-exempt.

| arm | compares | direction | severity |
|---|---|---|---|
| **A — every family has a KIND** | the measured family set → the declared table | one-way, tripwire | hard-0. Silence is the one answer it will not accept |
| **B — every declared row has a family** | declared table → measured set | one-way | hard-0. Catches `railing`: a row for an id nothing registers |
| **C — a KIND's obligations are met** | per family, per its KIND's owed tables | **SETS, both directions** | hard-0 |
| **D — the C09 ladder holds for every non-datum family** | ⚙ `defaultRulesForElementType(f)` **executed**, not read | — | hard-0. Would have caught `room`'s flat 0.18 and `ifc-element`'s existing breach |
| **E — named, shrink-only ledger** | known-bad rows, each with a reason | — | shrink-only |

**Subjects, measured never enumerated:**
- family set — `Object.keys(DEFAULT_ELEMENT_GRAPHICS_RULES)` (⚙ **exported**, `VisibilityIntentDefaults.ts:135`; note `ELEMENT_TYPES` at `:15` is **not** exported, so the gate must go through the derived record) **∪** every `registerSemantic*('<id>')` literal under `packages/command-registry/src` and `plugins/`;
- vocabularies — parsed from their defining files.

⛔ **Every source-text arm MUST run against COMMENT-STRIPPED source.** This repo has shipped arms that matched their own comment — §RAF-GATE-COMMENT-BLIND (2026-08-10) counted 1 owner + **4 comment lines, three of them doc comments asserting P3 compliance**. There is already a helper: `stripComments` in `tools/ga-gate/lib/writeRouteScan.ts`, used by `check-layer-boundaries.ts:74/:498`. **Use it; do not hand-roll a regex.** Concretely, `room` appears in `PenWeightTable.ts` exactly once — in a **comment** at `:465` — so an un-stripped arm would score room as *present* in the pen table and pass.

**Honest starting baseline is RED, and that is the point:** ARM B fails on `railing`; ARM A/C fail on `spaceEnvelope` (`'A-AREA': 'spaceEnvelope'`, `DrawingLayerIdentity.ts:128`, whose own comment at `:126-127` self-declares *"`penCategoryForLayerTag` has NO arm for this tag yet"*); ARM D fails on `ifc-element`. Baseline them by name with reasons; do not weaken the arms.

**One contract conflict the gate must resolve before it can have a baseline:** ⚙ `DATUM_CATEGORIES` (`DrawingZone.ts:262`) has **four** members including `boundary-line`, while C09 §4.6.4:724-727 names the exemption as grid/level/annotation *"and no others"*. Per CLAUDE.md's conflict order the contract is stronger — so either C09 gets an amendment or the set does. Decide it in the same PR as the gate.

---

## 8. UNKNOWNS — and the cheapest probe for each

| # | Unknown | Cheapest probe | Blocks |
|---|---|---|---|
| 1 | **Which surface the founder had open.** "Visibility Intent" names three files; only one has colour pickers, and it is owner-keyboard-gated. His prior verbatim (`RoomColourIntent.ts:6-8`, *"colour code by room type, size, or colour defined, all white etc."*) is the **mode** reading — which **shipped** — so asking again is weak evidence he now means the literal RGB, or means *"put it where I look."* | **Ask him, or send two screenshots.** One question, and it decides step 6 vs step 7 | 6, 7 |
| 2 | **Does step A alone close the report?** If Gate 0 was the whole thing, the mode toolbar starts working and he may not need a colour picker at all | Ship step A, hand him the deploy, ask. **~10 minutes** | 3, 4 |
| 3 | **Does an intent's `__default__.surface3D` already repaint 3-D rooms?** §6(b) says yes structurally; unmeasured on screen | ⚙ In the browser: bind a duplicated intent to a view, set `__default__` surface3D colour, open 3-D, watch the room volumes. **Or** a vitest driving `applyToMesh3D` with a `userData.elementType='room'` mesh | 7 |
| 4 | **Does a `room` surface3D override fight `roomColourMode` in 3-D?** Both run inside `applyToMesh3D` — the room branch enters via `fillGovernedElsewhere=true` (`:917-921`), then `:1088-1104` sets `material.color` unconditionally when a descriptor exists. Which wins is unmeasured | Same harness as #3, with both set. **Needed before a `room` row ships with a surface3D editor** | 7 |
| 5 | **Do real projects hold saved user intents that would miss a `room` row?** Server data | `SELECT count(*) FROM <intents table> WHERE is_system = false;` — the panel persists via `persistIntent('POST'/'PUT')`, and the server stores `rules: source.rules ?? source.elementRules ?? {}` into jsonb | 7 (migrator) |
| 6 | **Is `window.commandManager` present when Duplicate fires?** All three writes are `cm?.execute?.()` (`:916/:936/:950`) | `typeof window.commandManager?.execute` in the console with the panel open | the Duplicate advice in §1 |
| 7 | **Do rooms actually reach the edge projector?** `CACHEABLE_ELEMENT_TYPES` includes `'room'` (`EdgeProjectorService.ts:2031`) but `ELEMENT_TYPE_TO_PROJECTION_LAYER` has no room key, so any root falls to `FALLBACK_NATIVE_LAYER = 'projection-visible'` (`:271`) | One `console.count` in the projector on a plan with rooms | whether table F is IRRELEVANT or merely deferred |
| 8 | **I ran no test suite and no GA gate.** Everything above is source read at `f1118f00` plus the ⚙ `tsx` execution of `defaultRulesForElementType` | `npx vitest run packages/room-topology/src/__tests__/roomColourModes.test.ts` and `npx tsx tools/ga-gate/run-all.ts` before merging | all |

---

### Corrections to the dossier, so they are not re-transcribed

- ⚙ `VisibilityIntentDefaults.ELEMENT_TYPES` is **19** entries, not 18 (three traces said 18 while listing nineteen). `ISO_LAYER_TO_VG_CATEGORY` is 19 rows; `CATEGORY_TO_DXF_LAYER` is 14; `OverridePanel.CATEGORIES` is 14. Every substantive "no `room` key" claim resting on them is correct.
- `EdgeProjectorService.ts` lives at **`apps/editor/src/engine/views/EdgeProjectorService.ts`**, not under `packages/core-app-model/src/drawing/`.
- `curtainwall` is **not** a dead id (⚙ 3 `registerSemantic` calls). Only `railing` is. Report **one** dead checkbox.
- `SetVGCategoryStyleCommand` **is** constructed — by the two `VGIntentMapper` twins. `SetVGViewCategoryStyleCommand` is constructed **nowhere**. So `SetRoomColourModeCommand.ts:21-23`'s claim of *"zero non-test call sites"* for both is half stale — worth a one-line correction alongside step 5.