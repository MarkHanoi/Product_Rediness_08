# ADR-0354 — A lift cabin part is not a slab, and a landing door is a door

**Status:** ACCEPTED
**Date:** 2026-08-22
**Lane:** LIFT22 · `§FEAT-LIFT-COMPOUND-SYSTEM` · L-5700..L-5713
**Contract:** [C104](../contracts/C104-ELEMENT-LIFT-COMPOUND-SYSTEM.md)
**Neighbours:** ADR-0124 (the pool assembly, whose argument this reuses), C103, C15, C87, C92

---

## Context

The founder asked for a LOD-300 lift compound: *"On creation will create the door,
lift and the cabine + shaft … the cabinet will be composed by structure, finishes
wall, floor ceiling etc.. all sub elements querible and selectable."*

A lift therefore decomposes into parts of **five** different natures, and each one
poses the same question: **does this part belong to an element family that already
exists, or does it need a new one?**

Getting that wrong in either direction is expensive. Inventing a new family for
something that already has one (a lift's shaft wall) makes it invisible to every
consumer of the real family — the schedule, the IFC exporter, the material
dispatcher, the wall-join resolver. Forcing something into a family it does not
belong to (a travelling car floor into the slab store) corrupts every consumer of
*that* family instead, and does it silently.

ADR-0124 settled exactly this question for the pool, and its ruling was
**asymmetric**: three of four parts reused existing families, and **exactly one**
(`water`) earned a new one. This ADR asks the same question of the lift's five parts
and reaches a similarly asymmetric answer — but the boundary falls in a different
place, and the reasoning for where it falls is the substance of this decision.

## Decision

### 1. The shaft enclosure REUSES `Wall` (and `CurtainWall` for the glass type)

A lift shaft's enclosure is a wall. It is built by the same trade, priced by the same
rate, drawn with the same hatch, fire-rated on the same schedule, and exported as the
same IFC class. It reuses `Wall` with no new fields.

For the standalone glass type, the three non-landing faces reuse `CurtainWall` — the
family C87 already governs — rather than a "glass wall" flag on `Wall`.

### 2. The landing doors ARE `Door` records — one per served level

⭐ **This is the ruling with the widest blast radius, and it is the one most likely
to be "simplified" later into a lift-specific sub-element.**

A lift landing door is a door. The questions asked of it are door questions:

- *How many doors does this building have?* — the door schedule (C28) must count it.
- *What is its fire rating?* — the fire strategy reads the door store.
- *Export the model.* — it is an `IfcDoor` in an `IfcOpeningElement`.
- *Change the ironmongery finish.* — the material dispatcher walks doors.

A lift-specific sub-element would be **invisible to all four**, and the invisibility
would be silent: every one of those consumers would return a confident, wrong answer
rather than an error.

**The enabling insight** is that this is *representable at all*: the shaft enclosure
spans **pit to overrun** as a single tall wall, and `Door` already carries `wallId`,
`sillHeight` and `offset`. So N landing doors host in ONE wall at N different sill
heights — which is exactly how a shaft is drawn in section. **The model matches the
drawing.** No new hosting mechanism was needed, and none was built.

### 3. The cabin parts are ONE new family, `liftPart`

The five car parts — structure, wall finish, floor, ceiling, car door — are a new
family. Two reasons, and the first is decisive:

**(a) A cabin part is not level-bound.** Every one of `Slab`, `Ceiling`, `Floor` and
`Wall` carries a `levelId` and is positioned relative to that level's datum. **A lift
car travels.** Its floor is at a different elevation on every storey it serves, and at
no storey at all while moving. There is no `levelId` that is true of it. Writing one
would be a lie that `bimManager.registerElement`, per-level visibility and plan-view
banding would all then believe.

**(b) A cabin floor is not floor area.** A `slab` record lands in every floor-area
schedule, every quantity take-off and every `IfcSlab` export. A ~1.5 m² car floor
counted once per storey served would inflate the gross floor area of a 10-storey
building by 15 m² **that does not exist**. This is the `Water` header's argument
verbatim — *"a blue slab would be counted as FLOOR AREA; that is a data-integrity
defect, not a cosmetic one"* — and it applies here with the same force.

**The modelling insight that makes the new family clean:** every cabin part is
expressed in **car-local space** (origin = the centre of the car floor's top face).
The car's world placement is one transform applied once. So "move the lift" moves one
number and every part follows, and **a part cannot drift out of the car**.

### 4. The shaft voids every slab it passes, and the delete heals every one

A shaft that does not penetrate the floors is not a shaft. Voids are appended to
`Slab.holes` — the field the pool already uses — by **whole-array replace, never
`push`**, because a deep patch does not survive the legacy undo adapter and would wipe
every hole on that slab.

`lift.delete` reverses all of it. The precedent is not flattering: `DeleteStairCommand`
contains zero references to openings, so deleting a stair leaves its void punched
through the floor plate forever. A lift makes that bug **one-per-storey** worse.

## Consequences

**Good.**
- A lift's doors are countable, schedulable and exportable on day one, with no work in
  any consumer.
- A lift's shaft walls participate in wall joins, materials and fire schedules for free.
- Cabin parts are individually addressable — the founder's "querible and selectable" —
  without corrupting the families they are not.
- One new family, not five. The store count grows by two (`lift`, `liftPart`), matching
  the pool's precedent of one parent plus one genuinely-new part family.

**Costs, accepted.**
- **Six stores in one command.** `lift.create` declares
  `['lift','liftPart','wall','curtainwall','door','slab']` and needs
  `produceMultiStoreCommand`. Declaring fewer would silently drop patches from undo
  routing. This is more machinery than a single-store create, and it is the price of
  the parts being real.
- **The landing side of a glass lift is opaque.** `Door.wallId` hosts in a *wall*, and
  `CurtainWall` has no opening list, so the landing face of the standalone type stays a
  `Wall`. The alternatives were to invent a lift-specific door (losing §2 entirely) or
  to widen the shared `Door` schema for one caller. Accepted the more readily because
  it is **also how observation lifts are really built**: doors and structure on the
  landing face, glass on the three faces people look out of.
- **`liftPart` is not yet an L0 family** (C104 §11), so it is absent from
  `SCHEMA_REGISTRY` and the branded-`Id` union. Deferred for a measured reason, not an
  architectural one, and recorded as L-5711.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| **Cabin parts as `Slab` / `Ceiling` records** | Inflates gross floor area by real, uncountable m², and requires a `levelId` that is not true of a travelling object |
| **Landing doors as lift sub-elements** | Invisible to the door schedule, the fire strategy, IFC export and the material dispatcher — all four of which would answer confidently and wrongly |
| **One door element with a "repeat per level" flag** | Makes a per-storey question ("is the level-7 door fire-rated?") unrepresentable, and cannot express a lift that skips a storey |
| **A new `LiftShaft` family for the enclosure** | A shaft wall is a wall; a new family loses wall joins, materials, fire ratings and IFC for nothing |
| **`CompositeCommand` for the aggregate undo** | L-2401: returns unconditionally `true` in both directions and counts children *attempted*. A half-landed lift would report success |
| **Extending the existing LOD-200 `verticalCirculation` in place** | Breaks the residential-building generator and changes the meaning of every already-generated building. Deferred as a migration of its own — C104 §7, L-5713 |
| **Storing `carWidth` alongside `shaftWidth`** | Two numbers that must agree, stored twice: widen the shaft, the car stays small, nothing complains |
| **Storing a storey COUNT rather than served level IDS** | Cannot survive inserting a level mid-stack, and cannot express a goods lift that skips the mezzanine |
