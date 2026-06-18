# SPIKE — Corridor-as-routable-spine + graph-driven room swap/drag

**Date:** 2026-06-18 · **Status:** SPIKE (design + seams, not yet implemented)
**Founder ask:** *"I add connectors to the corridor but the corridor keeps being static…
I want the corridor to move as a spine depending on the rooms I want to connect.
Also: click a node and swap one room for another, or drag-drop it on the graph and the
layout adapts. Do a spike of this."*

---

## 1. The core finding (why "nothing happens today")

The engine (D-TGL) is a **pure 2D solver**. The corridor rectangle is **carved first**
(by area ratio / stair keep-out) and **frozen**; only AFTER that do doors get requested.
So every graph edit today is a **post-hoc door request on a frozen carve**:

- **`Connect to` / `addRoomAdjacency`** → `roomAdjacencyByName` → `bubbleGraph` adds a
  *door edge* **iff the pair is permitted AND the two rooms already share a wall**. If they
  don't touch, the door can't be placed.
- **`Direct corridor door` checkboxes** ARE wired (`s{i}.corridor_<type>` →
  `corridorDirectRoomTypes` → `forceCorridorDirectRoomTypes` → §FORCE-CORRIDOR-DIRECT pass).
  But that pass **skips** when the room is not geometrically against the corridor:
  `§DIAG-CORRIDOR-FORCE skipped (no circulation-adjacent wall)`.

**Conclusion:** the corridor never *moves* to reach the selected rooms — it only sprouts a
door when a wall happens to be shared. That is exactly the "static corridor" the founder sees.
Making the corridor a true spine requires the **subdivider's carve to become
spine-member-aware** (access-graph-first), not a new door pass.

---

## 2. The six seams (verified against code, 2026-06-18)

| # | Concern | File | Key symbols | Change needed |
|---|---------|------|-------------|---------------|
| 1 | **Corridor carve** (frozen) | `packages/ai-host/.../tgl/subdivide.ts` | `tryCarveCorridor`, `tryCarveDoubleLoadedCorridor`, `tryCarveSingleLoadedCorridorToKeepOut`, `SubdivideOptions` (`corridorWidthM`, `keepOutRects`) | Add `spineMemberRoomIds?: string[]`; carve the corridor strip to run the long axis of the **bbox of the requested member rooms** (and/or comb to reach each), not the shell. |
| 2 | **Spine membership** (type-based) | `packages/ai-host/.../tgl/bubbleGraph.ts` | `corridorId`, `link(spine, …)` (~L517-527), §ROOM-ADJACENCY (~L529-552) | Gate `link(spine, room)` on **ID membership** from the user, not on room TYPE (today *all* bedrooms link to spine). |
| 3 | **Door force** (skips) | `packages/ai-host/.../tgl/wallsAndDoors.ts` | `forceCorridorDirectRoomTypes`, §FORCE-CORRIDOR-DIRECT (~L1395-1479) | Becomes mostly a no-op *once seam 1 lands* — every member abuts the corridor, so the skip paths stop firing. |
| 4 | **UI → engine threading** | `apps/editor/.../house-layout/houseModalHtml.ts` (toggles ~L207-253), `HouseLayoutModal.ts` (parse ~L230-243) | `corridorDirectRoomTypes` | **Already wired** for the door case. For spine-routing, thread a new `spineMemberRoomIds` (per-storey or by-name) the SAME way. |
| 5 | **Room→rect order** (swap/drag) | `packages/ai-host/.../tgl/subdivide.ts` | `allocationOrder` (~L539-554), `adjacencySortForZone` (~L582-607, stable/idempotent on equal weights), `squarify` | Apply a `roomOrderOverride` BEFORE `allocationOrder`; squarify lays rooms in input order → swapped/moved rooms land in different rects. |
| 6 | **Regen plumbing** | `apps/editor/.../house-layout/HouseLayoutController.ts` (`_mergeOverrides` ~L412-438), `HouseLayoutModal.ts` (`_scheduleGraphEdit`/`_regenerate`) + stashes in `apps/editor/.../apartment-layout/active*Overrides.ts` | `getRoomAreaOverrides`, `getRoomAdjacencyOverrides`, … | Add new stashes `activeRoomSpineMembershipOverrides.ts` + `activeRoomOrderOverrides.ts` following the proven pattern; merge into the program; existing debounced regen handles the rest. |

---

## 3. Phased plan

**Phase 0 — make the existing door-force visible (cheap, already wired).** Confirm in-browser
that checking `Direct corridor door → Bedroom` fires §FORCE-CORRIDOR-DIRECT and adds the door
when a wall is shared. Add a toast/log when it *skips* so the user knows WHY (the
`§DIAG-CORRIDOR-FORCE skipped` reason is already logged; surface it in the UI). **No engine change.**

**Phase 1 — spine-member-aware carve (the real "corridor moves").** Seams 1+2+6.
- New override `spineMemberRoomIds` (by room name → engine room id).
- `subdivide`: after the public/private split, compute the bbox of member rooms and route the
  corridor strip to abut them (single-loaded comb that touches each member; fall back to
  today's carve when no members). Gate behind a flag → default byte-identical.
- `bubbleGraph`: link spine to the **member** rooms.
- **Verify:** `§DIAG-CORRIDOR-QUALITY directAccess` rises to N/N for members; no
  `§DIAG-CORRIDOR-FORCE skipped` for members.

**Phase 2 — graph swap / drag.** Seams 5+6.
- New override `roomOrder` (list of room ids in desired allocation order) OR a `swap[a,b]`.
- `subdivide`: reorder before `allocationOrder`.
- UI: drag node A onto node B → `setRoomOrderSwap(a,b)` → regen.
- **Verify:** swapping two rooms in the graph swaps their rects in the next preview, and the
  built result matches (the parity contract already guarantees built==previewed).

**Risk note:** seam 1 touches `subdivide.ts` — the single most regression-prone file in the
repo (4 prior regressions). It MUST land behind a default-off flag, gated, with the
`§DIAG-CORRIDOR-QUALITY` / `§DIAG-RECTS` metrics proving no change when the flag is off.

---

## 4. First verifiable slice

`spineMemberRoomIds` end-to-end on the GROUND floor only, single-loaded carve, flag-gated:
1. `activeRoomSpineMembershipOverrides.ts` stash (mirror `activeRoomAdjacencyOverrides.ts`).
2. Merge into `ApartmentProgram.spineMemberRoomIds` in `_mergeOverrides`.
3. `SubdivideOptions.spineMemberRoomIds` consumed only on the ground single-loaded carve.
4. Wire the existing `Direct corridor door` checkbox to ALSO set spine membership (so the same
   checkbox both routes the corridor AND requests the door).
5. Prove with `§DIAG-CORRIDOR-QUALITY` directAccess before/after + a default-off byte-identical test.

---

## 5. Cross-links
- Parity contract (built==previewed) — `docs/02-decisions/adrs/0075-preview-execution-parity-contract.md`
- Editable living graph (BIM 2/3) — the bidirectional edit-surface north star.
- §16 access-graph-first (corridor as routed spine driven by selected rooms).
