# ADR-0124 — The Pool is an ASSEMBLY, and WATER is an Element Family

- **Status:** Accepted
- **Date:** 2026-07-14
- **Tags:** §FEAT-SWIMMING-POOL-ELEMENT (L-292)
- **Contracts:** C03 (schemas), C11 (element creation pipeline), C15 (the compound/hosted pattern this follows), C16 §8.6 (one gesture = one undo entry), C28 (schedules)
- **Supersedes nothing. Governs:** `packages/geometry-pool`, `plugins/pool`, the `pool` + `water` L0 families, and the multi-store command routing convention in `@pryzm/command-bus`.

---

## 1. The finding, in one sentence

**A pool is not a primitive — it is one user gesture that COMPOSES four kinds of part, three of which already existed.** The hole is a slab hole, the pool walls are walls with a negative `baseOffset`, the pool floor is a slab. **Only the water is genuinely new.** The architecture must therefore say *assembly*, not *element*, and the ticket's real difficulty is not geometry — it is **undo**.

---

## 2. Context

The founder's brief: *"Create a swimming pool element — a new category. The user will define it ON A SLAB — like the HOLE ON SLAB element under Structure — and a hole will be created; WALLS under the level, 1.2 m high; a SLAB at the bottom of the walls, within the walls; and a NEW ELEMENT looking like WATER — transparent, blueish."*

Three of the four parts map onto shipped element families. The work is composition + one new family + the invariants that make four records behave as one thing.

---

## 3. Decision — the COMPOUND PATTERN: real child records, linked by `parentId` / `childrenIds`

PRYZM already has three distinct ways to model a compound thing. We audited all three rather than inventing a fourth:

| Pattern | Precedent | Parts are… | Verdict for the pool |
|---|---|---|---|
| **Derived geometry, no record** | curtain-wall MULLIONS (`bayWidth`/`bayHeight`); stair treads/risers/stringers | parametric fields on the parent; built at mesh time | ✗ — a pool wall must be a real, schedulable, IFC-exportable wall |
| **Inline sub-array on the parent** | `CurtainWall.panels[]` (a local `id`, addressed by `row`/`col`; **there is no panel store**) | objects *inside* the parent record | ✗ — same reason. Putting a `Wall` inside a `Pool` record also breaks C03 §3.2 (one owner per store slice) |
| **Real child records + `parentId`/`childrenIds`** | **door / window ↔ host wall (C15 §6)**; handrail ↔ stair (`hostId`) | first-class element records in their own stores | ✅ **This one.** |

**DECISION: the pool follows the C15 hosted/compound pattern, generalised.**

- A `pool` parent record carries **no geometry of its own** — it is identity + parametric intent + ownership.
- Its parts are **real records in their own stores**: `wall` (× N), `slab` (the pool floor), `water`.
- The link is the **L0 `parentId` / `childrenIds` fields of `BaseNodeShape`** — which *every* element already carries, and which C15 §6 already makes load-bearing (`WallStore.update()` asserts `wall.openings[*].elementId ≡ wall.childrenIds`). **This is not a fifth pattern. It is the blessed one.**

**Why real records and not the curtain-wall inline pattern.** The founder's own words decide it: the pool walls *are* walls and the pool floor *is* a slab. A record that is not in the wall store is invisible to the schedule (C28), the IFC exporter (C25), the material dispatcher, the wall-join resolver and the property panel. A curtain-wall panel can afford to be a sub-object because nobody schedules a panel independently. **A 40 m³ concrete pool wall is a quantity someone will be billed for.**

**Consequences (§3.1).** Selection promotion already exists for exactly this: `SelectionManager.PARENT_RESOLVED_ROLES` + `userData.parentId` resolves a click on a child to its parent (C15 §12). Pool parts stamp `parentId = poolId` and inherit it. **One thing to select, one thing to edit, one thing to delete.**

---

## 4. Decision — WATER IS ITS OWN ELEMENT FAMILY, not a slab with a blue material

The founder named this as the one real design decision, stated his instinct (own family), and — correctly — refused to trust it: *"my instinct is (a), but I have been refuted seventeen times this week. Decide it on the evidence."*

**The evidence says (a), and here it is. Three independent arguments, any one of which is sufficient.**

### 4.1 A slab's thickness grows DOWN from its top — so a blue slab COUPLES the water surface to the pool floor

This is the decisive, mechanical argument, and it is not a matter of taste.

A `Slab` is anchored by `baseOffset` (its TOP face, per the §03 `topReference: 'LEVEL'` semantic anchor) and extends downward by `thickness`. A "water slab" filling the pool therefore has exactly **two** degrees of freedom, and they are the wrong two: move its top and the whole body moves; change its thickness and its *underside* moves.

So to lower the water level you must either raise the pool floor, or leave a void between the water and the floor. **"The water level sits below the coping" — the founder's exact stated regret case — is not merely awkward under the slab model. It is UNREPRESENTABLE.**

`Water` carries `surfaceElevation` and `bottomElevation` as **independent absolute elevations**. Lowering the water leaves the floor exactly where it was. This is pinned by a guard (`poolAssembly.test.ts` W-1) that asserts precisely that: halve the freeboard, and `water.surfaceElevation` moves while `floorSlab.baseOffset` does not. *If that test can be made to pass with a blue slab, this decision was wrong.* It cannot.

### 4.2 Water is not construction — a blue slab is counted as FLOOR AREA

A `slab` record is a structural/finish element. It lands in every floor-area schedule, every quantity takeoff, and exports as `IfcSlab`. **A swimming pool modelled as a blue slab silently adds 8 m² of floor to the building's gross area** and ships a body of water to the contractor as a concrete deck. That is a data-integrity defect, not a cosmetic one, and it is exactly the class of bug C28 exists to prevent.

### 4.3 Water's quantity is a VOLUME, and the volume is only derivable because the surface is independent (C28)

"What is this pool's volume?" is the question the founder predicted would be asked. The answer is `planArea × (surfaceElevation − bottomElevation)` — and note that this is the **water** depth (1.1 m), not the **pool** depth (1.2 m). A blue slab has one thickness and cannot tell those apart; it would report 9.6 m³ where the truth is 8.8 m³ — 9 % out, in the direction that overfills the pool.

`waterVolumeOf()` (`@pryzm/geometry-pool`) is the ONE derivation, so the schedule, the IFC exporter and the property panel cannot disagree about it.

### 4.4 What we did NOT do

We did not give `Water` a `temperature`, a `chemistry` or a `flowRate`. Those are plausible and they are not needed, and a field nobody reads is a field that will be wrong. `surfaceElevation` / `bottomElevation` / `boundary` is the minimum set from which the founder's stated questions (level, volume) are answerable.

---

## 5. Decision — the multi-store command routing convention (and the bug it exposed)

**This section records a refutation of the ticket's central instruction, because it changed the implementation.**

The brief said to buy "one gesture = one undo entry" with the batch chokepoint: *"Use the batch chokepoint (`*.batch.create` → ONE `produceCommand` → ONE patch pair → ONE ring entry)."*

That is right for `wall.batch.create` — **because it is SINGLE-STORE.** Every wall lands in the wall store, so one `produceCommand(ctx.stores.wall, …)` covers the whole gesture.

**A pool spans FOUR stores, and the multi-store path was broken by construction:**

1. Both routers dispatch a multi-store patch by **`String(p.path[0]) === storeKey`** (`CommandBus.ts:327`; `applyRingBufferSide`), and the `§U-B6` guard hard-errors a handler whose `path[0]` is not a declared store. **So a multi-store handler MUST emit store-key-prefixed paths.**
2. But `produceWithPatchesPerStore()` emits **store-RELATIVE** paths (its own docstring says so). Its patches therefore match no store key, route to nothing, and `applyRingBufferSide` applies **zero** stores — whereupon `performUndo` falls silently through to `commandManager`, which has never heard of the command. **Ctrl+Z does nothing, and says nothing.**
3. And even a correctly-prefixed patch broke on arrival: neither router **stripped** the store key before handing the ops to their consumers (`elementUndoStoreAdapter` on the undo side; `attachStores` → `Store.applyPatch()` on the forward side), both of which read `path[0]` as the **element id**. Every op became a field-write on an element literally named `"wall"`.

**The trap had never been sprung because no bus handler had ever declared two stores** — every real multi-store command in the tree is a legacy Path-A `Command` with snapshot undo. The branch was dead code.

**Decision:** fix it at the seam, not in the pool.

- `produceMultiStoreCommand()` (`@pryzm/command-bus`) is the **one chokepoint** for a multi-store bus command. It runs one recipe per store and prefixes every patch path with its store key. Hand-rolling the prefixing is forbidden.
- `applyRingBufferSide` (undo) and `CommandBus`'s per-store envelopes (forward) both now **strip** the key symmetrically, so both consumers see the store-relative shape they have always expected. The flat `record.forward`/`inverse` **keep** the prefix — the ring buffer needs it to route.
- Single-store commands are untouched.

*A pool-shaped workaround would have left the next multi-store command to fall into the same hole.*

### 5.1 The related landmine: TWO `holes` fields, same name, different coordinate spaces

The ticket asserted *"THE HOLE IS SHIPPED… `SlabData.holes` carries hole polygons."* **It is half shipped, and the half that is shipped is not the half the bus writes.**

| | L1 / schema `Slab.holes` | LEGACY `SlabData.holes` |
|---|---|---|
| type | `Vec3[][]` — `{x, y: ELEVATION, z}` | `{x, y}[][]` — **`y` is `worldZ`** |
| written by | `slab.addHole` / `slab.removeHole` (bus) | `SlabTool` HOLLOW_SLAB; `openingStore` |
| **renders?** | **NO. Nothing bridges it to the mesh.** | **YES** — `SlabFragmentBuilder` triangulates it |

Feeding an L1 loop straight into the legacy field collapses every vertex onto `z = elevation` — a **zero-area hole that punches nothing, silently**. That is what a naive "just compose `SlabData.holes`" pool would have shipped. The conversion now has a name, a home and a test (`geometry-slab/src/SlabHoleCoords.ts`, ADDITIVE).

---

## 6. Decision — DELETION IS A RECONCILIATION, NOT A FIRE-AND-FORGET

Deleting a pool removes its walls, its floor and its water **and closes the hole in the host slab**, in one undo entry. There is no generic "when X is deleted also delete Y" registry in PRYZM to lean on (`plugins/cross` explicitly refuses delete cascades), so the cascade is written explicitly in `pool.delete`, which owns it.

The pool's children are read from **its own `childrenIds`** — not from an O(N) scan of every wall looking for `parentId === poolId`. That is why the link is stored on both ends.

The hole is matched **by geometry** against the pool's own boundary (one polygon, one source of truth). Removing "the last hole" or `holes[i]` would be wrong the moment a slab carries a second pool or a stair void.

### 6.1 This is not hypothetical — the stair does exactly this wrong, TODAY

`CreateStairCommand` punches an opening in the slab above it (`openingStore.add(...)`, line 473) and its `undo()` correctly removes it. **But `DeleteStairCommand` contains zero references to openings** — it removes railings, landings and the stair, and leaves the void punched through the floor plate forever. Nothing reaps it: `OpeningCleanupHandler` listens only for `bim-level-removed` / `bim-slab-removed`, never `bim-stair-removed`.

**Delete a stair in PRYZM today and you are left with a hole in your floor.** Tracked separately; the pool is not permitted to repeat it, and its `D-1` guard is the reproduction.

---

## 7. Decision — NO LITERALS. 1.2 m is a DEFAULT, not a CONSTANT (L-127)

Every pool dimension resolves through **exactly one** chokepoint, `resolvePoolDimensions()`, in a three-tier chain — **record → systemType → documented default** — mirroring `resolveWindowDimensions()`.

`POOL_DIMENSION_DEFAULTS` is the **only** place in the tree where a pool dimension may be written as a number, and every value in it is justified (a default nobody can justify is a literal wearing a hat). Dimensional fields on the `Pool` record are **optional** — "unset" is a first-class state meaning *resolve me* — so a `.default()` in L0 cannot destroy the systemType tier.

Enforced at SOURCE level by `poolNoLiterals.test.ts`: the founder's `1.2` appears **exactly once** in `@pryzm/geometry-pool`, in the default table. ADR-0265 §4.4 states the law this implements: *a richer hardcoded glyph is the same bug at higher resolution.*

---

## 8. Consequences

### 8.1 Landed

- L0 `Pool` + `Water` families (brands, registry, schema refines).
- `@pryzm/geometry-pool` — **pure** (no THREE, no DOM; the vitest env is `node`, which is itself the guard that a mesh can never smuggle a dimension back in). 17 tests.
- `plugins/pool` — `pool.create` / `pool.delete`, one undo entry each. 6 tests.
- `produceMultiStoreCommand()` + the two router strips — multi-store bus commands now work **for everyone**, not just the pool.
- `SlabHoleCoords` (additive) — the L1⇄legacy hole coordinate contract.

### 8.2 The correction to the ticket's arithmetic, kept visible because it matters

The ticket says *"produces EXACTLY FOUR elements"*. **It produces four PART KINDS, not four records.** A rectangular pool is 1 pool + **4 walls** + 1 floor + 1 water = **7 records**, plus 1 hole on the host slab. The guard asserts the real invariant — one hole, **one wall per boundary edge** (a pentagon gives five), one floor, one water — because a hard-coded `4` is precisely the bug a "four elements" assertion would wave through.

### 8.3 Open — the render bridge (C11 §11.2 steps 2–5)

The record reaches the store and the undo ring; **it does not yet reach the mesh.** A new element type needs a `CommandEventBridge` case, an `initTools` bridge into the legacy stores, `GEOMETRY_ELEMENT_TYPES` membership, and a `water` mesh in the renderer. Until those land, the pool is correct and invisible — and *correct geometry that reaches nothing, declared fixed* is the exact failure this project has spent a week naming. **It is called out here rather than left as an empty cell.** Tracked in the L-292 report and in ADR-0265 §3 (the pool's LOD row is written and honest: it is `✗` where it is absent).
