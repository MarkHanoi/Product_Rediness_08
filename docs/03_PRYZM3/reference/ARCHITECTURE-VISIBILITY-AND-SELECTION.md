# PRYZM — Visibility & Selection Architecture (plain-language explainer)

> **Status**: Reference / explainer (not a contract). **Created**: 2026-05-23.
> **Audience**: anyone touching how elements are *shown/hidden/isolated* (Project
> Browser) and how they are *picked/selected* (3D + plan). **Why this exists**: the
> architect asked for "an extremely deep document — explain in plain words the
> architecture, the orchestration, the structure" of this solution after the
> 2026-05-23 visibility/selection fixes (#146, #148, #149, #150).
> **Canonical contracts it references** (these win on conflict): the 8 principles in
> `CLAUDE.md`, `docs/00_Contracts/C0N-*`, P6 (commands are the only mutation path),
> P7 (visibility intent ≠ UI state), C15 (hosted elements). When this explainer and
> a contract disagree, the contract is right and this doc should be corrected.

---

## 0. The one-paragraph version

There are **two related questions** PRYZM answers constantly: *"should this element be
drawn?"* (visibility) and *"which element did the user click?"* (selection). They are
deliberately separate systems, but they meet at one rule: **a thing you cannot see, you
cannot select.** Visibility flows from the **Project Browser** (or a view's level/
category scope) down to (a) the **3D scene** (`Object3D.visible`) and (b) the **plan
projection** (which elements get projected for a level). Selection flows the other way:
a click is resolved to an element through a **pick** (GPU colour-id pick in 3D, BVH
raycast as fallback) that only ever considers elements which are **effectively
visible**. Hosted elements (doors/windows) are special: they have no level of their own
— they **inherit their host wall's level**, and that single fact is the source of two
of the recent bugs.

---

## 1. The layers (where each piece lives)

PRYZM's client obeys a strict layered import rule (lower may not import higher). The
visibility/selection story spans these layers:

```
L7.5 src/ , apps/editor/src/ui/ViewBrowser/  → Project Browser UI (the buttons)
L5   apps/editor/src/engine/                  → wiring: ToolManager routing, BimService,
                                                EdgeProjectorService (plan projection)
L3   packages/view-state, packages/stores     → ViewDefinition, element stores
L2   packages/geometry-* (door/window/wall…)  → element builders that stamp userData
L1   packages/input-host (SelectionManager,    → the selection brain + the pick context
        ToolManager),
     packages/picking (gpu-pick, bvh-pick),
     packages/visibility (the 11-wave model)
L0   packages/schemas                          → pure data shapes
```

Two things to hold onto:

- **`packages/visibility`** is the *pure domain model* of visibility (P7: it is a
  domain concept, not UI state). It is a set of pure functions; it touches no THREE,
  no DOM.
- **`packages/input-host/SelectionManager.ts`** is the *operational* heart of
  selection. It is large and legacy-ish, but everything funnels through it.

---

## 2. The visibility domain model (`packages/visibility`)

This is the "spec" of visibility, expressed as data + pure functions.

### 2.1 The data

- A **`VisibilityElement`** describes one element for visibility purposes:
  `{ id, category ('wall'|'door'|…), levelId, categoryOverride?, hostWallId?, openings?, … }`.
  Note `hostWallId` — doors/windows carry it; it is how the model knows a door belongs
  to a wall.
- A **`VisibilityView`** describes the rules in force for one view:
  `{ id, visibleLevels:Set<string>, unlevelScoped, categoryVisibility:Map<cat,'show'|'hide'|'halftone'>, viewTemplate?, hiddenElementIds?, temporaryIsolation?, … }`.
- A **`VisibilityResult`** is the answer: `{ visible:boolean, halftone?, reason? }`.

### 2.2 The "waves" (the orchestration of the *decision*)

Visibility is decided by a **chain of pure functions ("waves")**, each refining the
result. Conceptually, to decide if element *E* is visible in view *V*, you run E through
the chain and the first wave that says "hide" wins. The important ones:

- **Wave 1 — level scope**: is `E.levelId` in `V.visibleLevels`? If not → hidden
  (`reason:'level-out-of-scope'`).
- **Wave 2 — category visibility**: is `E.category` set to `hide` in `V.categoryVisibility`?
- **Wave 3 — template inheritance**: categories not set locally inherit from the view
  template chain.
- **Wave 5 — opening culling (hosted elements)**: if `E.hostWallId` is hidden, the
  door/window is hidden too (`reason:'host-wall-hidden'`). *This is the model's
  statement that doors/windows live and die with their host wall.*

The public entry point evaluates the whole chain for many elements at once and returns
a `Map<id, VisibilityResult>`.

> **Important nuance (and a current gap):** this pure model is the *intended* authority,
> but the Project Browser's runtime applicator (next section) does **not** route through
> it today — it queries element stores directly and toggles `Object3D.visible`. The
> 11-wave model is fully used by the view/projection layer; the Project-Browser quick
> actions are a more direct path. Unifying them is future work; for now, know that
> "visibility intent" exists in two flavours: the **pure model** and the **direct scene
> toggle**.

---

## 3. The orchestration of *hide / isolate* (Project Browser → scene)

This is the flow when you click "hide level", "isolate", or "hide Doors" in the Project
Browser.

```
Project Browser button
  → ProjectVisibilitySection.handleVisibilityCommand({ action, target, value, … })
       action ∈ {hide, isolate, highlight}
       target ∈ {level, category, type-in-category, all}
  → resolve element IDs for the target:
       BrowserDataHelpers.getElementsForLevel(levelId)  // level
       BrowserDataHelpers.getCategoryElements(label)    // category/type
  → apply to the 3D scene:
       applyLevelVisibility / applyElementVisibility / applyIsolate
       → scene.traverse(obj => obj.visible = …)         // PER-OBJECT toggle
  → remember state in the UI "bag" (levelVisible / elemVisible / catVisible / isolateMode)
  → bag.refresh()  (re-render the browser rows)
```

### 3.1 How visibility is *applied* to the 3D scene — the key structural fact

There is **no THREE.js "level group"** whose `.visible` cascades to its children. A
`Level` in the model is `{ id, elevation, height, childrenIds:string[], … }` — it stores
**element IDs**, not a scene node. Each element's root group is parented directly under
the scene with `userData.levelId` stamped on it (and on its child meshes).

So hiding a level is implemented as: *traverse the whole scene, and for every object
whose `userData.levelId === levelId`, set `obj.visible = false`.* Isolation is:
*set `obj.visible = (obj.userData.id ∈ targetSet)`.*

This "per-object, ID-driven" design is why the **selection** side must check visibility
carefully (Section 5): there is no parent flag to lean on, but there *can* be nested
meshes whose own `.visible` differs from their root.

---

## 4. The orchestration of *plan projection* (which elements a plan shows)

A floor plan is not "the 3D scene from above with hidden lines." It is a **projection**:
`EdgeProjectorService` takes the 3D meshes for the relevant elements and projects their
edges into 2D drawing space for a `ViewDefinition`.

```
plan view needs to render
  → EdgeProjectorService.exportForView(viewDef)
       resolve the view's vertical cut range (resolveEffectiveViewRange)
       gather candidate elements = every level whose vertical span overlaps
           [cut-depth … level.elevation]  → flatMap(level.childrenIds)
  → for each element group: project its edges (with the per-element projection cache,
       keyed by userData.version — see #60/#89)
```

The element-to-level decision here uses `level.elevation` and `level.childrenIds`.
**This is a different code path from the Project-Browser scene toggle** — plan
projection decides inclusion by *level membership + vertical overlap*, the browser
decides by *`userData.levelId` match*. Both must agree on "what level is this element
on," which brings us to hosted elements.

---

## 5. Hosted elements (doors / windows) — the subtle centre of gravity

A door/window does **not** own a level. Per C15 it is *hosted* on a wall, and its level
**is the host wall's level**. Concretely:

- `DoorBuilder` stamps the **mesh** `userData.levelId = wallData.levelId` (and throws
  loudly if the wall has no level — no silent orphans).
- BUT the door's **store record** (`DoorStore` / `WindowStore`) only has `wallId` +
  `openingId` — **no `levelId` field**.

That asymmetry (mesh has levelId, store record doesn't) is exactly what produced two
recent bugs:

- **#149 (isolate hides a level's own doors/windows).** `getElementsForLevel` matched
  `el.levelId === levelId`. For a door, `el.levelId` is `undefined` → it matched no
  level → isolation set it invisible. **Fix:** resolve a hosted element's level through
  its host wall (`wallStore.getById(el.wallId).levelId`). Now a level's doors/windows
  travel with the level.
- **(visibility model, wave 5)** uses `hostWallId` to cull a door when its wall hides —
  the same "hosted lives with host" rule, expressed in the pure model.

**Rule of thumb when you touch visibility/level code:** never assume a hosted element
knows its own level. Always be ready to resolve it via `wallId → wall.levelId`.

---

## 6. The selection pipeline (which element did the user click?)

Everything funnels through **`SelectionManager`** (`packages/input-host`). A click in
the main 3D canvas calls `performSelection(event)`:

```
performSelection(event)
  1. compute click x,y from the canvas rect
  2. HOVER-ANCHOR fast path: if the click is within 8px of the last GPU-confirmed
     hover point, select the last-hovered object directly (a "magnetic" affordance).
        ⚠ skipped for events tagged __pryzmForwarded (see split-view, §6.3)
  3. GPU pick: build a PickContext { camera, viewport, elementRegistry } and ask
     GpuPickStrategy for the element under the cursor.
  4. hit  → select(findSelectableRoot(obj))
     miss → unselectAll()   (GPU pick is authoritative; no BVH fallback when present)
```

### 6.1 The two pick strategies (`packages/picking`)

- **`gpu-pick` (primary).** It renders a *parallel "pick scene"* — clones of every
  candidate mesh, each painted a unique flat colour encoding its slot index — into an
  offscreen render target using the **same camera**, then reads back the pixel under the
  cursor and decodes the colour → element id. A small search radius makes near-misses
  forgiving. Because it uses real depth, the **front-most element at that pixel wins**.
- **`bvh-pick` (fallback).** A CPU raycast accelerated by a per-element BVH.

Both pick strategies, when they enumerate candidates, **skip anything not effectively
visible** (`isEffectivelyVisible` walks the parent chain). So a hidden element is never
painted into the pick scene and never raycast.

### 6.2 The selectable cache + the visibility rule (#148)

The candidate set comes from a **selectable cache** built by traversing the scene once
and keeping objects that are `selectable || isSemanticType(type) || type==='slab'` and
**not** helper/preview/underlay/hidden. The hidden check is the important part:

- Historically it tested **`!obj.visible`** (the object's *own* flag only).
- The GPU/BVH picks tested **cumulative ancestor visibility**.
- That mismatch meant an element whose *ancestor* was hidden (but whose own flag was
  still true) stayed in the cache → selectable-but-invisible.
- **#148 fix:** both cache builders now use **`isObjectEffectivelyVisible(obj)`**
  (cumulative), matching the pick. *You cannot select what you cannot see — now enforced
  consistently.*

### 6.3 `findSelectableRoot` + semantic types

A raw clicked mesh is usually a child fragment. `findSelectableRoot` walks up to the
"real" element root, recognising it by `id && (isSemanticType(type) || type==='slab')`,
with a fallback to the object's own `selectable` flag. The `SEMANTIC_TYPES` list must
name the **actual** `elementType` strings the builders stamp — a recent fix
(`§SELECT-SEMANTIC-TYPE-NAMES`) corrected `'stairs'→'stair'` and `'railing'→'handrail'`,
which were dead entries that never matched (stairs only worked via the `selectable`
fallback).

### 6.4 Split-view selection (why it was "reverting to the last selected")

The split-view's secondary pane is a **Canvas2D mirror** of the main 3D canvas (it draws
the main canvas 1:1 via `drawImage`). It has **no second renderer**. A click there is
**forwarded** to the main canvas as a synthetic event (`_forward3dClickToMain`). But the
pane forwards *clicks*, not *hover* — so while the cursor was over the pane, the main
canvas's last-hover state went stale. The hover-anchor fast path (§6, step 2) then
snapped the forwarded click back to the stale (last-selected) element. **#146 fix:**
forwarded events are tagged `__pryzmForwarded` and skip the hover-anchor, forcing a
fresh pick. (The coordinate mapping itself was verified correct: a full-canvas
`drawImage` stretch inverted by a proportional mapping.)

---

## 7. How the two halves meet — the single invariant

```
            VISIBILITY (top-down)                      SELECTION (bottom-up)
  Project Browser / view scope                 click → performSelection
        │                                              │
        ├─ 3D scene: obj.visible = …                   ├─ selectable cache
        │                                              │     (skips !effectivelyVisible)  ◄── #148
        └─ plan projection: level.childrenIds          ├─ pick (gpu/bvh) skips hidden
              + hosted via wall.levelId  ◄── #149      └─ findSelectableRoot → select
                                                   
   INVARIANT: an element that is not *effectively visible* is neither projected
   into the plan nor present in the pick scene nor in the selectable cache.
   → "What you can't see, you can't select."  (#148 closed the last leak.)
```

---

## 8. The recent fixes in context (2026-05-23)

| Fix | Where | One-liner |
|---|---|---|
| **#146** `§SELECT-SVP3D-ANCHOR-SKIP` | SelectionManager + SplitViewManager | forwarded split-view clicks skip the stale hover-anchor |
| **`§SELECT-SEMANTIC-TYPE-NAMES`** | SelectionManager | semantic-type whitelist named real element types (`stair`,`handrail`) |
| **#148** `HIDDEN-LEVEL-NOT-SELECTABLE` | SelectionManager | selectable cache uses cumulative visibility (matches the pick) |
| **#149** `ISOLATE-LEVEL-HOSTED-MISSING` | BrowserDataHelpers | a level's doors/windows resolve their level via the host wall |
| **#150** `SERVER-PG-DEGRADE` | projectStore | create/delete degrade to in-memory on a live DB error instead of 500 |

---

## 9. Gotchas / rules to remember when editing this area

1. **Mutate through commands (P6).** UI must dispatch through the command bus; don't
   write stores directly from UI.
2. **Visibility is a domain concept (P7).** Prefer the `packages/visibility` model over
   ad-hoc `.visible` toggles; if you must toggle the scene directly, mirror the model's
   intent and remember selection reads *cumulative* visibility.
3. **Hosted elements have no level of their own.** Resolve via `wallId → wall.levelId`
   (C15). This bit isolation (#149) and could bite plan projection / IFC export.
4. **Per-object, not per-group.** Levels are ID lists, not scene nodes. Hiding/showing
   walks the scene by `userData.levelId`/`id`; nested child meshes can carry their own
   `.visible`, so selection must check the whole ancestor chain (#148).
5. **The plan is a projection, not the 3D scene.** Plan inclusion is by level membership
   + vertical overlap (`EdgeProjectorService`), a different path from the browser's
   scene toggle. Keep the two notions of "what level is this on" in agreement.
6. **THREE only via the facade (P2).** Any THREE usage outside `renderer-three` fails CI.
7. **Split-view 3D is a mirror, not a renderer.** Anything synthesised onto the main
   canvas from another surface must behave like a real main-canvas event *except* it
   must skip main-canvas-only affordances (the hover anchor).
