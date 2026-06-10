# SPIKE — Dynamic Program Canvas (Phase 0)

**Status:** SPIKE PLAN (2026-06-10) — implementation NOT started.
**Spec:** [SPEC-DYNAMIC-PROGRAM-CANVAS](../specs/SPEC-DYNAMIC-PROGRAM-CANVAS.md) · **ADR:** [0069](../../02-decisions/adrs/0069-dynamic-program-canvas-as-primary-authoring-surface.md)
**Owner:** Generative design / editor UI.

> This is a **plan**, not code. It defines the smallest end-to-end slice that proves the founder's
> direction is buildable on the existing substrate, and names exactly which files to extend.

---

## §1 — The spike's question

> Can a board of **draggable rounded room cards**, bound to the program, re-run the **existing**
> deterministic house engine on a card edit and refresh a **live plan** in lock-step — with **no new
> engine, no new mutation path, and no geometry-store write** — within an instant (~120 ms)?

If yes, every later phase (cross-storey drag, add-level, multi-pane, brief-panel replacement) is
incremental wiring. If no, the founder needs to hear the latency/feasibility blocker before the
full build.

---

## §2 — The smallest end-to-end slice

A **single storey lane** of rounded room cards beside a **single live plan**, with **resize → area →
regenerate** as the only mutation:

1. Open a dev-only Program Canvas panel after a house generate (reuse the existing
   `HouseLayoutController` regenerate context — the spike rides the modal's already-cached
   `ShellAnalysis`).
2. Render the resolved ground-floor rooms as rounded cards (one card per room) in one lane, each
   showing name + area badge + type colour.
3. Render the ground-floor **plan** beside the lane from the same resolved result.
4. Drag a card's resize handle (or a per-card stepper) → write `setRoomAreaOverride(name, m²)` →
   call the existing synchronous regenerate → re-render BOTH the cards and the plan from the new
   result.

**Out of scope for Phase 0** (deferred to later phases, do NOT build): cross-storey drag, add-level,
add-room, the graph pane, multi-storey, the multi-pane window manager, removing the brief panel,
apartment/other typologies.

---

## §3 — Data flow (spike)

```
 resize card (drag / stepper)
        │
        ▼
 setRoomAreaOverride(roomName, m²)          ← activeRoomAreaOverrides.ts:30 (EXISTING)
        │  writes roomAreasByName via _mergeOverrides
        ▼
 HouseLayoutController._regenerateCurrent() ← HouseLayoutController.ts:354 (EXISTING)
        │  → _computeVariants → generateHouseLayoutOptions(shell, mergedProgram, …)  (EXISTING, synchronous)
        ▼
 ScoredHouseLayoutOption (variant[0])       ← perStoreyLayout[0] = ground storey
        │
        ├── buildHouseCardModel(variant,0).storeys[0].option   → re-resolve card sizes/labels (EXISTING houseCardModel.ts:96)
        └── buildLayoutThumbnailSvg(option)                    → live plan SVG (EXISTING layoutThumbnail.ts)
                 │
                 ▼
          re-render lane cards + plan pane (NEW spike renderer)
```

Everything except the final "re-render lane cards + plan pane" box already exists.

---

## §4 — Files to extend / add

| File | Action | Why |
|---|---|---|
| `apps/editor/src/ui/house-layout/HouseLayoutController.ts` | **Extend** — add a public hook so the spike panel can (a) read the current resolved variant and (b) call `_regenerateCurrent()`. Today `_regen` + `_regenerateCurrent:354` are private; expose a minimal `getResolvedGroundStorey()` + `regenerate()` facade. No change to the regenerate logic itself. | Reuses the cached `ShellAnalysis` + the synchronous engine call (`_computeVariants:249`) verbatim — the spike must NOT re-implement the regenerate loop. |
| `apps/editor/src/ui/apartment-layout/activeRoomAreaOverrides.ts` | **Reuse as-is** (`setRoomAreaOverride:30`). | The area-override stash + `_mergeOverrides:304` merge path already exist (C52 E1). |
| `apps/editor/src/ui/house-layout/houseCardModel.ts` | **Reuse as-is** (`buildHouseCardModel:96`, `StoreyCardSummary.option`). | Gives the per-room name/area/type for the cards, already pure + tested. |
| `apps/editor/src/ui/apartment-layout/layoutThumbnail.ts` | **Reuse as-is** (`buildLayoutThumbnailSvg`). | The live plan render. |
| `apps/editor/src/ui/living-graph/LivingGraphCanvas.ts` | **Reuse helpers** — `roundRect:344`, `ROOM_TYPE_COLOUR:356`. | Cards share the rounded-rect + colour source so they read as one look (SPEC §4). |
| `apps/editor/src/ui/program-canvas/ProgramCanvasPanel.ts` | **NEW** (spike) — the lane + cards renderer (Canvas2D or DOM), the resize handle, and the wiring to the controller hook. Dev-only / feature-flagged. | The genuinely-new piece: the card board UI. Keep it small + L5. |

The only **new** code is `ProgramCanvasPanel.ts` + a tiny facade on the controller. Everything else
is reuse.

---

## §5 — Genuinely new vs. already-present

| Concern | Status |
|---|---|
| Synchronous live regenerate loop | **Already present** — `HouseLayoutController._regenerate:328` / `_computeVariants:249`. |
| Area override → engine input | **Already present** — `activeRoomAreaOverrides.ts:30` → `roomAreasByName` → `_mergeOverrides:304`. |
| Resolved per-room data for cards | **Already present** — `buildHouseCardModel:96`. |
| Live plan render | **Already present** — `buildLayoutThumbnailSvg`. |
| Rounded-rect + type-colour | **Already present** — `LivingGraphCanvas.roundRect:344`, `ROOM_TYPE_COLOUR:356`. |
| **Card board UI (lane + draggable rounded cards + resize handle)** | **NEW** — `ProgramCanvasPanel.ts`. |
| **Public controller facade for read-resolved + regenerate** | **NEW** — small addition to `HouseLayoutController`. |
| Cross-storey drag, add-level, add-room, multi-pane, brief-panel removal | **Deferred** (Phases 1–3). The floor-move stash (`activeRoomFloorOverrides.ts:40`) and storey split (`storeyAllocation.ts:44`) already exist for Phase 2 — confirmed, not built here. |

---

## §6 — Acceptance check (the spike passes iff ALL hold)

1. **Live resize.** Resize a ground-floor bedroom card larger → on the next regenerate the plan's
   bedroom polygon visibly grows **and** the card's area badge updates to the engine-**resolved**
   area (clamped, never the raw requested value).
2. **Latency.** The cards + plan refresh within ~120 ms of the edit settling (debounced) — the
   synchronous engine path, no async/network.
3. **No geometry write.** The edit produces NO command-bus mutation and NO element-store write — it
   only writes the area stash and re-runs the pure engine (verify via console: the edit logs
   `[room-area-override] set …` and a `[house-layout] controller: regenerated …` line, NO scene
   mutation).
4. **Baseline identity.** With the override cleared (resize back to blank), the regenerated plan is
   identical to the un-edited baseline (C52 I2 — `_mergeOverrides:307` returns the same program ref).
5. **Brand.** Cards render white + `#6600FF`, rounded, compact, no black.

---

## §7 — Risks the spike must surface for the founder

- **R-A (the big one):** an over-resize that the shell can't hold. The engine HARD-rejects
  (`validateApartmentEnvelope`, memory `envelope-reject-silent-fallback`) → the regenerate can return
  no/clamped layout. The spike should **observe** what happens (does the card snap back? does the
  plan blank?) and report it — this feeds SPEC §11 OQ1 (clamp-and-snap vs. red "won't fit" card vs.
  soft warning), the central UX decision of the whole feature.
- **R-B:** regenerate latency for a worst-case program (many rooms / 3 storeys) — confirm the ~120 ms
  budget holds, or report the real number.
- **R-C:** the spike rides the modal's cached `ShellAnalysis`; the dockable [tools]-area panel
  (Phase 3) will need its own shell-analysis lifecycle (the user can redraw the boundary while the
  canvas is open). Note it; don't solve it in Phase 0.
- **R-D (BLOCKER for the naïve plan — found 2026-06-10 by code inspection):** the controller's
  regenerate context **`_regen` is set to `null` on build** (`HouseLayoutController.ts:385`, in
  `_build`). So a canvas that edits the **built** (post-generate) layout can NOT call
  `_regenerateCurrent()` — the cached `ShellAnalysis` + program is already torn down. §3's data flow
  (`setRoomAreaOverride → _regenerateCurrent`) only works **while the modal is still open** (pre-build).
  **Design implication for Phase 0** — pick ONE:
  1. **Live-while-modal-open** (smallest, true to §2): mount the canvas as the modal's body (replacing
     the static form) so it operates entirely within the open-modal lifecycle where `_regen` is alive;
     the "Build" action commits and tears it down — no post-build editing yet. This is the honest
     Phase-0 and matches §26.5's "replace the modal".
  2. **Persist the context past build**: stop nulling `_regen` in `_build` (or snapshot it), so the
     canvas can regenerate after build. Larger surface (build/undo interaction, stale-shell risk).
  3. **Re-analyse + regenerate per edit** post-build: the canvas re-runs `analyseActiveShell` +
     `generateHouseLayoutOptions` itself on each edit (its own lifecycle). Heaviest; effectively the
     Phase-3 dockable-panel design pulled early.
  **Recommendation:** Phase 0 = option 1 (canvas IS the modal body, pre-build). It needs no controller
  facade beyond exposing the open-modal's resolved variant + a `regenerate()` that calls the existing
  `_regenerateCurrent`, and it directly realises §26.5 (plan LEFT / graph CENTER / tools RIGHT as the
  modal). Post-build editing (option 2/3) is a later phase.
