# ADR-121 — Solidity, Poché, Pen Hierarchy and Level of Detail ACROSS Plan, Elevation and Section

- **Status:** Accepted (study + normative definition); implementation partially landed, backlog enumerated below
- **Date:** 2026-07-13
- **Tags:** §STUDY-LOD-200-300-ACROSS-VIEW-TYPES (L-262), §FEAT-SOLID-OCCLUSION-AND-POCHE-ACROSS-ALL-VIEW-TYPES (L-264), §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261)
- **Contracts:** C09 §4.6 (the Solidity Rule — written by this ADR), Contract-23 (pen/graphics table), C24 / C24.1 (sheets), C15 (hosted elements), P7 (intent is a domain concept)
- **Supersedes nothing. Governs:** every symbol builder, `EdgeProjectorService`, `HiddenLineRemoval`, `PenWeightTable`, `PocheFillTable`, `DetailLevelResolver`.

---

## 1. The finding, in one sentence

**PRYZM's documentation layer is being built PLAN-FIRST and is not carried across to elevation
and section.** Three tickets raised on the same day, from three unrelated directions, are the
same defect: **L-262** (detail level is a plan-only story), **L-263** (auto-dimension is
plan-only), **L-264** (solidity, poché and pen hierarchy are plan-only). This is not three
bugs. It is one habit.

The founder said it first and said it plainly: *"when are you targeting the walls FILLED GREY
and the THICKNESS OF THE LINES in cut — plan view, but also in SECTION and ELEVATIONS — all in
the context of the VIEW INTENT?"* A cut wall in a section is exactly as cut as a cut wall in a
plan. The code currently pretends they are different concepts, and so it re-invents them —
badly, and only once.

---

## 2. Context — what we found in the code (evidence, not opinion)

### 2.1 The plan cut section was computed and THROWN AWAY

L-246 (`2fe5cf8b`) built `buildPlanCutSectionGeometry()` — a true plane∩triangle section of
the solid — and pushed the result into `perElemLayerCutGeos`. **The plan branch of
`EdgeProjectorService` never read that map.** It is read only inside `else if
(sectionDepthBands)`, a branch a plan view never enters. So the section was recomputed for
every wall on every projection and dropped.

`A-WALL:cut` therefore stayed **empty in plan** — as empty as before L-246. That single
dropped array is the common cause of three separately-reported founder defects:

| Reported as | Symptom | Actual cause |
|---|---|---|
| L-241 / L-261 | "the drawing reads flat", no poché | `_renderPocheFills` scans `:cut`; `:cut` was empty |
| L-260 C | "the cut line should be thicker, like Revit" | every wall line was `:proj`; the pen table never saw a CUT wall |
| L-260 B | "the slab shows through the wall" — log: `2 occluder(s), 0/1532 segments removed` | `HiddenLineRemoval` derives occluders from `:cut`; `:cut` was empty |

L-260 B/C (`3b67ec57`) fixed the HLR clipping algorithm and the pen hierarchy **correctly** —
but both sat downstream of an empty layer. Fixed in `§FEAT-WALL-POCHE-FILL-BY-INTENT`.

### 2.2 Occlusion: three view types, three different engines (and one of them is a guess)

| View type | Occluder source | Verb | Status |
|---|---|---|---|
| plan | `:cut` silhouettes only | `removeHiddenLines()` — **removes** the occluded span | works, *once `:cut` is populated* |
| section | `:cut` silhouettes only | `removeHiddenLines()` — **removes** | **runs** (the call is unconditional — the earlier suspicion that section had NO occlusion is REFUTED), but see the hole below |
| elevation | `:cut` + `:proj` silhouettes, **depth-ordered** | `reclassifyOccludedElevationLines()` — **demotes** to `:beyond` (light dashed) | works (L-190 / L-196) |

**The real hole, and it is shared by plan AND section:** their occluders are **CUT-zone only**.
A *projected* solid — a wall standing between the section plane and the stair behind it —
**does not occlude anything**. Only the elevation pass has a depth-ordered projection occluder.
So the elevation is, ironically, the most solid-aware view we have, and the section is the
least: a section shows you the far wall straight through the near one.

**The two verbs are both legitimate** (removing is the plan/section convention; dashed set-back
is the elevation convention the founder himself asked for in L-190). What is *not* legitimate
is that the verb is a hardcoded property of the view type instead of **the view's intent**.
C09 §4.6.5 now names it: `disposition: 'remove' | 'demote'`.

### 2.3 Detail Level: declared everywhere, consumed twice

`DetailLevel` (`coarse`/`medium`/`fine` = LOD 100/200/300) is the L0 source of truth
(`packages/schemas/src/view/detail-level.ts`, created by L-241 P1 to kill a three-way enum
fork). `DEFAULT_DETAIL_LEVEL` was raised to `'fine'` by L-252.

**And the fork grew back one layer up:** `DetailLevelResolver` (L4 drawing) declared its own
`DEFAULT_DETAIL_LEVEL = 'medium'`. Views stamped by `DefaultViewsManager` carry an explicit
level so tier 4 of the precedence chain hid it — but any view *without* one (imported, legacy,
plugin-created) silently resolved to a **different default from the one the schema declares**.
Fixed in this pass: the resolver now re-exports the L0 constant.

---

## 3. The conformance matrix (the deliverable)

**Legend:** ✅ honoured · ◐ partial · ✗ absent · — not applicable (an elevation has no cut) ·
🆕 landed in this pass.

### 3.1 SOLIDITY / POCHÉ / PEN — element × view type

| Element | plan: CUT poché | plan: cut pen | plan: occludes | section: CUT poché | section: cut pen | section: occludes | elev: proj pen | elev: occludes |
|---|---|---|---|---|---|---|---|---|
| **wall (plain)** | 🆕 ✅ | 🆕 ✅ | 🆕 ✅ | 🆕 ✅ | ✅ | ◐ cut-only | ✅ | ✅ demote |
| **wall (layered)** | 🆕 ✅ per layer | 🆕 ✅ | 🆕 ✅ | 🆕 ✅ per layer | ✅ | ◐ | ✅ | ✅ |
| **curtain wall** | ✗ | ◐ | ✗ | ✗ | ◐ | ✗ | ✅ | ✅ |
| **slab / floor** | — (below cut) | — | ✗ | ✗ | ◐ | ✗ | ✅ | ✅ |
| **ceiling** | — | — | ✗ | ✗ | ◐ | ✗ | ✅ | ✅ |
| **column** | ◐ table entry, no section geo | ◐ | ✗ | ✗ | ◐ | ✗ | ✅ | ✅ |
| **beam** | ✗ | ◐ | ✗ | ✗ | ◐ | ✗ | ✅ | ✅ |
| **stair** | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✅ | ✅ |
| **roof** | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✅ | ✅ |
| **door / window** | — (void, by construction) | ✅ (`A-DOOR-CUT`) | ✅ | ✗ | ✗ | ✗ | ✅ | ✅ |
| **pool** (walls) **(L-292)** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **water** **(L-292)** | ✗ (hatch is the convention) | — (not a solid) | — (never occludes) | ✗ (filled region) | — | — | ✗ | ✗ |
| **furniture / plumbing / lighting** | — | — | ✗ | — | ✗ | ✗ | ◐ plumbing only | ✅ |

**Read the column, not the row.** `plan: CUT poché` is now real for walls only because a wall
is the only element the projector sections in plan (`buildPlanCutSectionGeometry` is gated to
`A-WALL` — deliberately, since sectioning `A-FLOR` in plan would paint the whole plate). **A
column, a beam or a stair crossing the 1.2 m cut plane is still drawn as an outline, not a
solid.** They have a poché colour in the table and no section geometry to fill. That is the
next cell to close, and it is a small one: lift the `layerName === 'A-WALL'` gate to *any
solid the cut plane straddles* and let the AABB straddle-reject do its job.

### 3.2 LEVEL OF DETAIL — element × view type × LOD

| Element | plan 100 | plan 200 | plan 300 | elev 100/200/300 | sec 100/200/300 |
|---|---|---|---|---|---|
| **door** | ✅ jamb ticks + single-line leaf | ✅ + jamb lining profile + true leaf + arc | ✅ + rebate, lever **+ escutcheon**, closed-leaf ghost | ✅ **(L-266)** massing / +panelisation / +rebate, rail-and-stile leaf, escutcheon — the 3D mesh is the LOD consumer and elevation projects it | ✗ identical |
| **window** | ✅ | ✅ | ✅ **(L-278)** + jamb rebate, **MULLION/meeting-stile from the record's own `columnRatios` + `columnDividerThickness`**, glazing broken at the post | ✅ **(L-278)** massing / +pane grid + sill / +**SASH** + glazing bead — the 3D mesh is the LOD consumer and elevation projects it | ✗ identical |
| **wall** | ✗ | ✗ | ✗ layer lines always drawn | ✗ | ✗ |
| **pool / water (L-292)** | ✗ | ✗ | ✗ | ✗ | ✗ |
| **column** | ✗ | ✗ | ✗ | ✗ | ✗ |
| **stair** | ✗ (no plan symbol at all — raw mesh edges) | ✗ | ✗ | ✗ | ✗ |
| **furniture** (6 builders) | ✗ | ✗ | ✗ | ✗ | ✗ |
| **plumbing** | ✗ | ✗ | ✗ | ✗ (elevation symbol exists, ignores LOD) | ✗ |
| **lighting / grid / room** | ✗ | ✗ | ✗ | ✗ | ✗ |
| **slab / roof / beam / ceiling / curtain wall** | ✗ | ✗ | ✗ | ✗ | ✗ |

### 3.3 THE HEADLINE NUMBER

There are **14 element families × 3 view types = 42 (element × view-type) pairs**, each with 3
LOD tiers. **Exactly 2 pairs discriminate the detail level at all** — door×plan and
window×plan. **40 of 42 pairs (95%) draw identically at LOD 100, 200 and 300.**

> **UPDATE (L-292, §FEAT-SWIMMING-POOL-ELEMENT).** Two families join the matrix — **pool**
> and **water** — so the denominator is now **16 × 3 = 48 pairs**. Both rows are written
> **`✗` across the board, deliberately and honestly**: the pool's records and its undo are
> real, but **its geometry does not yet reach any view**, and it has no plan symbol, no
> section symbol and no water mesh. Per §5.3, that is exactly how an unfinished capability
> is supposed to enter this document — as a *written* empty cell, not a 43rd silent one.
>
> Two things about the pool's future rows are worth fixing now, while the reasoning is fresh:
>
> **(a) THE POOL WALLS ARE THE FIRST CUT SOLID THAT THE PLAN PLANE DOES NOT CUT.** A pool
> wall lives *below* the level datum (`baseOffset = −depth`, height = depth), so the 1.2 m
> plan cut plane **passes clean over it**. It is not a CUT element in plan — it is a
> **BEYOND / below-cut** element, like the slab. The plan convention for a pool is therefore
> **not poché**: it is the outline of the void plus a **water hatch**, with the pool walls read
> as edges below. Anyone closing this row by copying the wall's `A-WALL:cut` treatment will
> produce a wall that is poché'd where the plane never touched it. **This is the one element
> where "walls are cut in plan" is false.**
>
> **(b) WATER IS NEVER AN OCCLUDER AND NEVER A CUT SOLID.** It is a filled region in section
> and a hatch in plan (hence the `—` cells above, which mean *not applicable*, not *missing*).
> Feeding it to `HiddenLineRemoval` as a solid would have it hide the pool floor beneath it.

Restated the way it will be seen: **a sheet at 1:200 and a sheet at 1:50 are the same drawing
at two scales.** That is not a drawing set.

**And ELEVATION and SECTION consume detail level in ZERO cells.** Not partially. Zero.

> **UPDATE (L-278, §FEAT-WINDOW-CUT-ZONE-AND-LOD).** The WINDOW row is closed the same way,
> so the count is **6 of 42**. Three findings are worth carrying, and the first is a
> **refutation of the ticket that commissioned it**:
>
> **(a) THE WINDOW WAS BRIEFED AS "THE OPPOSITE OF THE DOOR", AND IT IS NOT.** The brief ran:
> *a door is `skipInPlan` because at 1.2 m a door opening is EMPTY; a window is the opposite —
> the plane cuts its frame and glazing, so tagging it `skipInPlan` would DELETE the very lines
> that make it a window; therefore the window's MESH must contribute CUT and suppress
> PROJECTION.* **The premise is true and the conclusion is false.** The plane really does cut
> the frame, the mullion and the glazing — **but those cut lines do not come from the mesh.**
> They are authored, at the real dimensions, from the real record, by `WindowPlanSymbolBuilder`,
> which `EdgeProjectorService` injects into every plan (Phase 6), and which L-280 measured as
> dimensionally EXACT. So the mesh does not ADD the window's cut section — it **DUPLICATES** it
> from a second, un-LOD'd, un-penned source, and dumps on top of it the members a plan must not
> show at all (the head bar at ~2.2 m, the transoms, every pane outline). **`skipInPlan` is
> therefore right for the window too, and Contract 48 §5 is the RULE, not a door-shaped
> exception.** What is genuinely different about the window is not WHETHER it skips — it is
> **WHAT ITS SYMBOL MUST CONTAIN**: a true CUT SECTION PROFILE, because the plane passes through
> real members. That is where the work belongs, and that is where it was done.
>
> **(b) A "SECOND SOURCE OF TRUTH" REVERT THAT IS ONLY HALF DONE LEAVES THE PACKAGE RED.** An
> earlier draft of L-266 invented a `mullionThickness` field and it was rightly reverted — the
> record already carried `columnDividerThickness`. But the revert removed the field from the
> resolver's RETURN while leaving it REQUIRED on `WindowOpeningData`, and left the resolver's
> declared type promising three fields its body never returned. **`@pryzm/geometry-window` had
> not typechecked since.** A revert is a refactor and needs the same green bar as the thing it
> reverts.
>
> **(c) THE DOUBLE-WINDOW MEETING STILE WAS A LITERAL IN THE 3D BUILDER, SO THE PLAN DISAGREED
> WITH THE MODEL.** `Math.max(cdt, 0.06)` lived inside `WindowBuilder`, invisible to the symbol
> — so a `double` grew a 60 mm stile in 3D and drew a 30 mm one in plan. It (and the divider
> depth ratio, likewise a bare `fd * 0.5`) now resolve in `resolveWindowDimensions()`. **A rule
> that lives in ONE consumer of a shared dimension is a drift waiting to happen** — §4.4 said
> this about symbol builders; it is equally true of the 3D builder.

> **UPDATE (L-266, §FEAT-DOOR-3D-LOD).** The door row is closed: door×3D and door×elevation
> are now real consumers, so the count is **4 of 42**, and elevation is no longer zero. It was
> done WITHOUT a second symbol engine (§4.3): an elevation is a projection of the 3D meshes, so
> `DoorBuilder` resolves the tier through the SAME `resolveEffectiveDetailLevel()` — against the
> real `vd-sys-3d-1` ViewDefinition — and the elevation inherits the articulation. **Any element
> that projects its mesh into elevation can close its cell the same way; only elements whose
> elevation is a SYMBOL (plumbing) need an injected builder.**
>
> Two corrections to the plan-300 cell as it was written above. (1) **The "threshold" line is
> gone**: it ran across the door void on the wall centreline, and the founder's enumeration of
> the plan symbol is exhaustive — *"the FRAME, the LEAF (opened) and the CURVED LINE. That's
> all."* Its place at 300 is taken by the **closed-leaf ghost**, so 300 remains a strict superset
> of 200. (2) The frame at 200 is **two jamb linings, not a box around the doorway** — the two
> "frame face lines" that spanned the void were the WALL, re-drawn through the opening. See
> §FIX-DOOR-PLAN-SYMBOL-PURITY.

---

## 4. Decision

### 4.1 The rule is written into the contract, not into a builder

C09 **§4.6 — the Solidity Rule** (added by this ADR) is now normative for all view types:
every element is a solid; it is CUT, PROJECTED or BEYOND; nothing behind a solid is drawn
through it, in any view type; and weight/fill/visibility per zone resolve from **view intent**
through the pen/graphics table. §4.6.2 makes CUT ⇒ POCHÉ; §4.6.3 makes a layered element poché
**per stored layer**; §4.6.4 fixes the pen ladder; §4.6.5 makes occlusion **one engine, three
consumers, with the disposition as intent**; §4.6.6 lists the merge-blocking guards.

*A rule that lives only in a builder gets re-invented per view type. That is exactly how we got
here.*

### 4.2 Normative definition of the tiers (per view type, NOT per element)

The tier definition is a **definition**, not a per-element opinion. An element's builder decides
*how* to express the tier for its geometry; it does not decide *what the tier means*.

| Tier | plan | elevation | section |
|---|---|---|---|
| **LOD 100 (`coarse`)** | schematic: the element's footprint/extent, single-line where a symbol convention exists. No internal articulation. Layered elements read as ONE poché region. | silhouette + opening extents. No frame/sash, no reveals, no panelisation. | cut outline + poché as ONE region. No layer build-up. |
| **LOD 200 (`medium`)** | **the standard symbol**: true outer dimensions from the record, the conventional glyph (door leaf + swing arc, window frame line, stair run + break line), layer build-up shown where stored. | frame outline, sash division, opening head/sill, panelisation of curtain walls. | cut outline + **poché per stored layer**, principal build-up lines, floor/ceiling assembly. |
| **LOD 300 (`fine`)** | **full construction detail**: reveals, rebates, thresholds, hardware, per-layer poché, frame/sash/mullion articulation — every dimension read from the element's record. | reveals/recesses, sill/head profile, glazing bead, ironmongery, material hatch. | full assembly: every stored layer with its own poché tone AND its own boundary pen, fixings, junction detail, insulation hatch. |

**Invariant (guardable):** for the same element and view, **LOD 300 emits a strict superset of
LOD 200's geometry, and LOD 200 of LOD 100's.** A tier may never *remove* a line another tier
draws; it may only add. And **every line a tier emits must resolve to a pen-table weight** —
detail is added with lines, never with an ad-hoc colour or a private line width.

### 4.3 One resolver, three consumers — NOT a second symbol engine per view type

`resolveEffectiveDetailLevel(elementId, viewId)` (`DetailLevelResolver`, C09 precedence: element
override → element-type override → category override → the view's own setting → the L0 default)
is the ONE answer to *"at what detail level must element E be drawn in view V?"*. Elevation and
section builders call the SAME function. **There must not be a `resolveElevationDetailLevel`.**

The detail level is **intent** (P7/C09): a sheet at 1:200 and a sheet at 1:50 differ **by
intent**, not by a code branch. A view template carries it; a view overrides it; an element
override wins over both.

### 4.4 The symbol is derived from the RECORD, never from literals

L-266 names the trap precisely, and it is worth writing down as a rule rather than a ticket:

> **A richer HARDCODED glyph is the same bug at higher resolution.**

A door's rebate, leaf thickness and swing come from `DoorDimensions` + its system type. A
window's frame/sash/mullion/glazing come from the window's **real layers** —
`packages/geometry-window/src/WindowDimensions.ts` already resolves `frameThickness` /
`glazingThickness` through a record → systemType → defaults chain with no magic numbers. A
symbol builder that invents its own offsets has forked the dimensional truth (L-127), and it
will disagree with the 3D geometry the moment anyone edits the record.

---

## 5. Consequences

### 5.1 Landed in this pass (`§FEAT-WALL-POCHE-FILL-BY-INTENT`)

- Plan `:cut` is **populated** — poché, cut lineweight and HLR occluders all begin working.
- Wall poché: **light grey by default, from the intent**, seeded from `ISO_CUT_LAYER_TO_POCHE_FILL`
  (the near-black default nobody had ever seen is now an explicit `construction-docs` purpose).
- **Layered walls poché per stored layer**, in **plan AND section**, toned by each layer's
  stored `function` as a deterministic spread of the intent-resolved colour.
- Wall-layer meshes with no `elementType` no longer fall off the ISO layer system.
- `DEFAULT_DETAIL_LEVEL` de-forked back to the L0 schema.

### 5.2 The backlog — the empty cells, in priority order

1. ~~**L-266 — door/window symbol parity + LOD-300 fidelity.**~~ **DOOR: DONE** (parity 9dff8721;
   fidelity §FIX-DOOR-PLAN-SYMBOL-PURITY + §FEAT-DOOR-3D-LOD). Two findings worth carrying:
   **(a) an element with a plan SYMBOL must not also emit its MESH EDGES in plan** — the door's
   3D head bar, hinges, threshold and glazing were dumping their outlines across the void on top
   of the symbol; the fix is the Contract 48 §5 `skipInPlan` convention, and **stair, column and
   every furniture family should be audited for the same double-draw.** **(b) A per-part ROLE
   allowlist in the projector is a bug generator** (the door had three, and the head bar was the
   part nobody had thought of) — the tag belongs on the builder, not the allowlist.
   ~~**WINDOW: still open**~~ **WINDOW: DONE** (L-278, §FEAT-WINDOW-CUT-ZONE-AND-LOD). The
   mullion/meeting-stile now derives from the record's own `columnRatios` +
   `columnDividerThickness` (no new field), the glazing breaks at the post, and the 3D/elevation
   cells are closed with a sash + glazing bead at LOD-300.
   **AND THE CAVEAT PRINTED HERE WAS WRONG, WHICH IS WHY IT IS LEFT VISIBLE:** it read *"the
   window is NOT the same case as the door in plan: a window's frame and glazing ARE cut by the
   plan plane, so its spanning lines are real cut geometry and must stay."* The first clause is
   true; **the inference is not.** Those cut lines are drawn by `WindowPlanSymbolBuilder`, not by
   the mesh — so the mesh's edges are a DUPLICATE of the symbol, not the source of it, and the
   window takes `skipInPlan` exactly as the door does. See the L-278 update in §3.3.
2. **Section/plan projection occluders** — give `removeHiddenLines` a depth-ordered PROJECTION
   occluder so a near solid hides a far one, and make the disposition (`remove` | `demote`) an
   intent property. This is the "one engine, three consumers" of C09 §4.6.5.
3. **Poché for every cut solid, not just walls** — lift the `A-WALL` gate on
   `buildPlanCutSectionGeometry` to any solid straddling the plane (column, beam, stair, roof),
   and give **section** the same per-layer treatment for slabs/ceilings (they store `layers` too).
4. **LOD for the other 12 element families**, plan first, then elevation and section, against
   §4.2 — reusing `DoorPlanSymbolBuilder` as the reference implementation.
5. **Elevation + section symbol builders** — today only plumbing has an elevation symbol, and
   nothing has a section symbol; everything else is a raw mesh edge-dump at every LOD.

### 5.3 The rule we are adopting, so this does not recur

**No documentation feature is "done" when it works in plan.** A drawing capability lands in
plan, elevation and section together, or it lands with its empty cells written into this
matrix. The matrix in §3 is the backlog; keep it honest.
