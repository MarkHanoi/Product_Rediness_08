# STR-ENVELOPE-AS-FIRST-CLASS-ELEMENT — the founder directive

> **PROVENANCE.** Founder-authored directive, received **2026-09-03**, in support of
> [`STR-RESIDENTIAL-DESIGN-ORCHESTRATOR`](STR-RESIDENTIAL-DESIGN-ORCHESTRATOR.md). Captured
> verbatim in substance per the standing rule *"founder research → repo docs same-turn"*.
>
> ⛔ **This document states INTENT, not repository state.** The measured inventory is
> [`RESI-ORCHESTRATOR-PLAN.md`](../03-execution/plans/RESI-ORCHESTRATOR-PLAN.md), whose §0 already
> named this exact gap independently: *"there is no spatial-envelope layer between the zoning
> envelope and the walls"*, with **no room ENVELOPE**, **no level envelope**, and
> `multiLevelSpan` hard-pinned to `null`. **This directive is the founder's answer to that
> finding.**
>
> **Status:** captured, not yet ratified as a contract. It touches `C84` (element integrity),
> `C11` (element creation pipeline), `C03` (schemas/commands/state), `C16` (command authoring),
> `C67`/`C68` (bus command + element kind + user-visible attribute registration) — **all five are
> mandatory reading before any code lands**, and `C67`+`C68` are mandatory *by their own terms*
> because this adds an element kind and bus commands.

---

## §1 — The directive

**The envelope must be a FIRST-CLASS ELEMENT — created the way a wall is created, following all
contracts.**

It exists today as a *representation*: PRYZM already draws the maximum buildable volume in the 3D
view, the plan view, the 3D Site and the 3D scene. That is a rendering of a solved zoning result.
**It is not an element.** The directive is to promote it — and to add two sibling kinds that were
never renderings at all.

---

## §2 — Why (the founder's reasoning, unabridged in substance)

### §2.1 — The envelope is not only the maximum buildable volume

It will also represent **initial space volumes for the initial design stage**. The same primitive
serves both the legal ceiling and the design intent underneath it.

### §2.2 — The new envelopes need everything an element has

Unlike today's maximum-buildable envelope, these must be:

- **undoable**
- **reasonable** *(as transmitted; read as: subject to reasoning / explainable)*
- **deletable**
- **movable**
- **BIM 3.0 ready**
- **with attributes**
- **serialised**
- **deterministic**
- **parametric**
- **conscious of the elements around them**
- **alive in the living graph, like a room is**

> *"so they will need to absolutely be a first class element."*

⚠ **This list is the acceptance criteria.** Each item maps to an existing PRYZM mechanism that
must be joined, not reinvented — see §5.

### §2.3 — Four editing surfaces, all of them

The envelope must be editable:

- on the **3D view**
- on the **2D view**
- **via footprint profile** — the way the wall/window profile edit works
- **via data, UI, RAC and AI**

### §2.4 — Direct 3D face manipulation

On selection in 3D (for the non-maximum-buildable kinds), the envelope is editable **as we move a
window**:

- **every face of the envelope is draggable in 3D** so it is movable — the way we move a wall in
  BIM 3.0 and the wall makes its surroundings adapt
- a **bidirectional gizmo** allows moving each face **in the direction perpendicular to that
  face**
- **connected faces adapt**, and **connected envelope faces adapt** too

> *"Similar context that today we have for perimeter walls and interior wall partitions around
> BIM 3.0."*

### §2.5 — Three envelope types

| | Type | Meaning | Today |
|---|---|---|---|
| **A** | **Maximum buildable volume** | the legal ceiling | **exists** (as a rendering) |
| **B** | **Level-Envelope** | the to-be-built area and volume **by level** — visually determines the gross to-be-built area per level | **does not exist** |
| **C** | **Room-Envelope** | envelopes for initial layout design that **behave like a room** — *"and maybe that ARE rooms"* | **does not exist** |

⚠ **"and maybe that are rooms" is an OPEN QUESTION the founder deliberately left open.** It is the
single largest design decision in this directive: whether type C is a new element kind or an
extension of the existing `Room` element (`packages/schemas/src/elements/Room.ts`, already carrying
`boundary`, `area`, `volume`, `occupancy`, `boundingElementIds`, `levelId`, an `IfcSpace` identity,
and a `boundaryMode` that is today `'wallBound'`). **Resolve it in an ADR before writing schema —
do not decide it implicitly in code.**

---

## §3 — What an envelope IS (the founder's definition — this is the product thesis)

> *"Envelopes are the basic and initial representation of spaces as living entities, aware of their
> surroundings."*

An envelope is a **ready world-model space volume**. It knows:

- the **surrounding buildings' solar impact on each of its faces**
- **which level it is in**, and what that means with regard to **the terrain**
- its **distance to the perimeter boundaries**
- **which other envelopes are within it, around it, and on top of it**

and on top of that it is:

- **adaptable**
- **re-computable**
- **intelligent**
- **semantic in nature**

⭐ **Read this list carefully: it is not a wish list, it is a JOIN list.** Every one of those four
awareness axes already has a shipped PRYZM subsystem that computes it for some other subject. The
envelope element's job is to be the subject they attach to.

---

## §4 — Why this is the keystone of the residential orchestrator

`RESI-ORCHESTRATOR-PLAN.md` §0 measured the gap independently and found it concentrated in **one
theme, not eleven**:

1. **No massing OPTIONS** — one `BuildableEnvelope` per parcel; the N-candidates-with-reasons
   pattern exists fully built one level down (`generateHouseLayoutOptions` →
   `ScoredHouseLayoutOption[]`), never lifted to the parcel.
2. **No room ENVELOPE** — `Room` is wall-derived or hand-sketched; `multiLevelSpan` pinned `null`.
3. **No envelope → BIM conversion** — nothing named `envelopeToBim` / `createHouse`; the envelope
   contributes exactly a 2-D footprint (`resolveBuildableFootprint`) and a storey cap
   (`capStoreysToEnvelope`). **Its 3-D form never reaches geometry.**

**This directive closes (2) directly and unblocks (1) and (3).** Spec sections §10 (generate
spatial envelopes, not walls), §11 (fully editable, neighbours adapt), §12 (direct 3D profile
editing) and §16 (envelope → BIM) are all downstream of it — the plan records each as **ABSENT**
solely for want of *"an envelope subject for it to act on"*.

---

## §5 — The join list: what already exists per requirement

⛔ **Standing rule: `grep for the existing solver first`.** The dominant risk here is rebuilding
what is already there. Every row below is a citation from the measured plan — **re-verify before
relying on it**; these rot.

| Founder requirement | Existing PRYZM mechanism to JOIN (not rebuild) |
|---|---|
| undoable · one gesture = one undo | `commandBus`; **one `*.batch.create`** (C16 §8.6 B-6). ⚠ `batchCoordinator.runBatch` is undo-**NEUTRAL** — N commands inside it are N undo entries |
| deletable · movable · attributes · serialised | the element pipeline `C11` + `C03`; `C84` element integrity + its `C85`–`C99` per-element block |
| deterministic · parametric | `ZoningRulesEngine` / `computeBuildableEnvelope` for type A; the profile/extrude primitives for B and C |
| **conscious of elements around** | `neighbourFootprintStore` → `resolveBlindFacades` (SPEC-PARTY-WALL-AWARENESS) — *the only proximity inference in the app*; `packages/spatial-index` |
| **alive in the living graph** | `packages/building-graph` (`BuildingGraph`, `UBG_EDGE_TYPES` — a **closed 10-member tuple**, so adding envelope edges is a deliberate contract change), `buildingGraphMaintainer` (incremental, L-3251), `LivingGraphOverlay` |
| **solar impact per face** | `@pryzm/solar-analysis` (`accumulateSunHours`, `buildOccluderIndex`); ⭐ **`accumulateRoomHeatGain` / `RoomGlazing` / `RoomHeatGain` are EXISTS-BUT-UNWIRED — zero consumers.** The envelope is their natural caller |
| **which level · meaning vs terrain** | `levelId` on `Room`; terrain datum caveat `HEIGHT_DATUM_CAVEAT`; ⚠ **L-584: the ordinance measures at the façade, PRYZM samples one point at the centroid** — do not re-import that defect |
| **distance to perimeter boundaries** | `envelopeContainment.ts`, `insetPolygon` / `insetAreaM2` |
| **face-drag with neighbours adapting** | `packages/geometry-wall/src/WallMoveReweld.ts` — `computeMoveReweld`, `computeMoveReweldPlan`, `moveRefusalGround: IMPOSSIBLE\|INCUMBENT`; dispatcher `WallMoveReweldService.ts`; wired `engineLauncher.ts:992`. **This is the exact Move → Replace → Recompute the founder names, already shipped for walls** |
| **footprint profile edit** | `WallProfileEditorPort` / `WallProfileEditorSubject` — **already generic by port**; shared surface `ui/ElevationOutlineSurface.ts` (already reused by `ComponentProfilePanel`); resolver `ContextualEditBar.ts _profileEditToolFor(type)` over `{slab, floor, ceiling, wall}` |
| **RAC / AI editing** | the `ZeroTokenChatBridge` → `applySemanticIntent` → `bus.executeCommand` chain; `FilterScope` / `HostedOpeningScope` for room + compass scoping; `C67` capability control plane |
| **3D gizmo** | the existing transform/move gizmos; the window-move interaction the founder cites as the model |
| type C "maybe they ARE rooms" | `Room` + `packages/room-topology` (`RoomOccupancyType` ~55, `RoomColourSystem`, `RoomLabelRenderer`, `RoomRelationshipService`); ⭐ `ProgrammeRoomSpec` / `RoomProgrammeTemplate` at `RoomTypes.ts:431` are **EXISTS-BUT-UNWIRED, zero consumers — an empty shell shaped exactly like this** |

---

## §6 — The open questions that must NOT be decided implicitly

1. **Is type C a new element kind, or is it `Room` with a new `boundaryMode`?** The founder left
   this open on purpose (*"and maybe that are rooms"*). An ADR decides it. Consequences reach
   `IfcSpace` identity, `C84`'s per-element block, and whether `multiLevelSpan` un-pins.
2. **Does type A get promoted, or does it stay a rendering with B and C as the new elements?** The
   directive says *"the envelope … should be created as a first class element"* and separately
   scopes the 3D face-dragging to *"not the maximum buildable volume envelope but other kinds"* —
   so A is at minimum **not** face-draggable. Whether A becomes an element at all is a decision.
3. **`UBG_EDGE_TYPES` is a closed 10-member tuple.** Envelope-in-envelope, envelope-on-envelope and
   envelope-adjacent-envelope are new relations. Extending a closed tuple is a contract change.
4. **What refuses?** A room-envelope dragged outside its level envelope, a level envelope dragged
   outside the maximum buildable volume, an envelope face that would invert the solid. The founder's
   own standing direction applies: **IMPOSSIBLE vs INADVISABLE vs FINE, keyed on SEMANTIC ROLE, and
   always ASK** — and a refusal must carry **both numbers**.
5. **Does the level envelope's per-level gross area feed the existing GFA authority**
   (`designMeasurement.ts measureAuthoredDesign`, which already refuses with
   `overlapping-floor-plates` / `unattributed-floor-plate` / `no-floor-plates`) or compute its own?
   Two GFA authorities would be a defect factory.

---

## §7 — The honesty constraint that survives all of this

An envelope of type B or C is a **design intent**, not a permission. Type A is a **study**, not a
permit. PRYZM already has the ratified vocabulary for exactly this distinction — `FieldProvenance`,
`EnvelopeConfidence` (6 tiers, `capEnvelopeConfidenceToPackDefault` is a *min* so a pack can demote
but never certify itself), `CONTEXT_DERIVED_STUDY_STATUS`, the `NOT_DERIVED` sentinel and
*"A STUDY, not a permit"*.

⛔ **Do not mint a rival vocabulary for envelope-element provenance. Extend the ratified one.**
