# C104 — Element: Lift Compound System

**Status:** CANONICAL
**Minted:** 2026-08-22 (lane LIFT22, `§FEAT-LIFT-COMPOUND-SYSTEM`, L-5700..L-5712)
**Extends:** C103 (Balcony & Compound Systems) — the generic compound model
**Governs:** `packages/geometry-lift/**`, `plugins/lift/**`, the `lift` and `liftPart`
stores, and every consumer that reads a lift's members.

---

## §0 — What this contract owns, and what it explicitly does NOT

### §0.1 Refusal table — read this before adding a clause

| Question | Owner, not this contract |
|---|---|
| What a compound IS; member identity, ownership, aggregate undo, reachability | **C103** — this contract EXTENDS those clauses and does not restate them |
| Element creation pipeline | **C11** |
| Hosted elements (doors/windows in walls) | **C15**, **C86** |
| Slab openings and floor plates | **C92** |
| Curtain-wall geometry, panels, mullions | **C87** |
| Stair / vertical circulation by ramp or flight | **C98** |
| Command authoring, one-gesture-one-undo | **C16 §8.6** |
| Commands as the only mutation path | **C03**, P6 |
| Element integrity, per-family | **C84** and its C85–C99 block |
| Material assignment | **C100** |

This contract owns exactly **one** question those ten do not ask:
**what is a lift made of, and how does an architect get at the pieces?**

### §0.2 — C103 dependency, stated honestly

⚠ **C103 was NOT on disk when this contract was written.** Measured 2026-08-22:
`ls docs/02-decisions/contracts/ | grep -E 'C10[0-9]'` → `C100`, `C101`, `C102` only.
C103 is being minted in the same session by a sibling lane (BALC21), which
communicated its §2 selection clause directly. This contract is therefore written to
**extend** the C103 model as relayed, and every clause below that cites C103 is a
**forward reference that must be re-checked when C103 lands**. If C103 §2 turns out
not to admit two selection disciplines, **§2 of this contract is the clause that
changes**, and it should be corrected in place rather than defended.

This is stated rather than hidden because the alternative — writing as though C103
already said what I was told it would say — is precisely the defect
`docs/04-reference/ISSUE-LOG.md` records under "confident register rows are the
wrong ones".

> ⛔ **RE-CHECKED 2026-08-22, LANE TOOLS34 — C103 STILL DOES NOT EXIST, AND THE
> FORWARD REFERENCE IS NOW A PHANTOM CITATION.**
>
> ```
> ls docs/02-decisions/contracts/ | grep -E '^C10[0-9]'
>   ->  C100-MASTER-MATERIAL-DATABASE.md
>       C101-ELEMENT-ANNOTATION.md
>       C102-VIEW-AND-SHEET-INTEGRITY.md
>       C104-ELEMENT-LIFT-COMPOUND-SYSTEM.md
> ```
>
> The sibling lane shipped the balcony (`baf36857`) and never minted the contract. So
> the §0.2 warning above did exactly the job it was written for — it is the reason a
> later reader can tell a forward reference from a settled clause — and the gap is now
> **larger than C104**: `BalconyPlanToolHandler.ts`, `activeBalconyPlacement.ts`,
> `activatePlanOnlyTool.ts` and `elementCreationMatrix.ts` all cite **C103 §7 / §8**,
> and `packages/schemas/src/types/Id.ts` cites it for the `BalconyId` brand.
>
> ⚠ **`check-contract-index-equivalence.ts` cannot see this** (RC=0, arms B/C/D clean):
> C103 is absent from the files **and** from the README's row set, so there is neither
> a file without a row nor a row without a file. **A contract that is cited by code and
> exists nowhere is invisible to both arms of the equivalence gate.** That is the C68
> §6.3-G9 shape (`ADR-0315` cited by four artefacts and absent from disk), one layer up,
> and it is recorded as **L-7060, OPEN** rather than closed by minting a contract this
> lane did not have the subject-matter mandate to write.
>
> ⛔ **DO NOT "FIX" THIS BY DELETING THE C103 CITATIONS.** They name the right home for
> a real clause. The fix is to mint C103.

---

## §1 — Two lifts co-exist, deliberately. Do not merge them.

⛔ **The single most likely mistake a future agent will make in this subsystem is to
"clean up the duplication" between these two. It is not duplication.**

| | `verticalCirculation` (LOD 200) | `lift` (LOD 300) |
|---|---|---|
| Record | `LiftData`, `packages/geometry-lift/src/LiftTypes.ts` | `LiftCompound`, `LiftCompoundTypes.ts` |
| Store | `verticalCirculation` (via `liftStore`) | `lift` + `liftPart` |
| Written by | `CreateVerticalCirculationCommand` (command-registry) | `lift.create` (`plugins/lift`) |
| Geometry | `LiftMeshBuilder` — 2 placeholder boxes | real Wall / CurtainWall / Door / LiftPart records |
| Doors | none | one real `Door` per served level |
| Slab voids | none | one per penetrated slab |
| Driven by | the residential-building generator, and the `Lift` palette button | *(not yet wired to a tool — see §10)* |

**Why both are kept.** Deleting the massing lift breaks the residential-building
generator, which emits a cab per adjacent level pair and depends on the degenerate
`base === top` span (`§RESI-LIFT-TOP-CAB`). Folding the compound into it would change
what every already-generated building means. **§7 records the convergence path; this
lane does not take it.**

---

## §2 — Selection discipline: `drill-in` (C103 §2)

The lift **DECLARES `drill-in`**: a click selects the **lift**; **Tab descends** into
its members; **Escape** returns to the whole lift.

This is the founder's requirement verbatim — *"the lift is an element on its own, but
clicking tab allow the user to select sub systems within the lift system … like the
kitchen element"* — and per C103 §2 it is a **declared property of this compound**,
not a deviation from the balcony's `direct-member` model.

### §2.1 — What "the kitchen element" is, established by measurement

There is no `packages/kitchen` and no `plugins/kitchen`
(`ls packages/ | grep -i kitchen` → 0; `ls plugins/` → 49, no kitchen). The founder's
referent is:

- **the element** — kitchen cabinetry placed as **furniture**,
  `packages/geometry-furniture/src/KitchenTypes.ts`, identified by
  `userData.furnitureType` beginning `kitchen_`
  (`SelectionManager.isKitchenFurniture`, `:3267`);
- **the mechanism** — `SelectionManager.cycleKitchenUnit()` (`:3282`): Tab cycles
  *whole run → unit[0] → … → countertop → whole run*, with an amber highlight and a
  `§SELECT-TAB-CYCLE` precedence guard (`:1351`) that stops the generic
  overlapping-candidate cycle from stealing the key.

**Tab-to-subselect is therefore PRESENT, not absent** — curtain-wall and wardrobe use
the same shape. The lift is wired **into** it. Minting a rival would have been the
repo's most-repeated defect.

### §2.2 — The one place the kitchen mechanism could NOT be copied

⭐ **This is the clause worth reading twice.**

`_buildKcUnitList` discovers units with `root.traverse()`. That works because a
kitchen run is **one mesh tree**. A lift's members are **three families in three
stores** built by three builders — and its upper-storey landing doors sit on levels
that are routinely **not built**, because they are not the active level.

**A traverse-discovered member list silently drops every member whose builder has not
run.** For a multi-storey lift that is the *common* case, not the corner one.

**Binding rule.** The lift's Tab cycle order **MUST** come from the lift **record**
(`childrenIds` + the declared `LIFT_PART_CYCLE_ORDER`); the scene may be consulted
**only** to find the mesh for an already-known id. The sub-selection is published **by
id** even when no mesh exists — only the amber **box** needs geometry, the
**selection** does not.

---

## §3 — Dimensions: one chain, no literals

`resolveLiftDimensions()` (`LiftDimensions.ts`) is the **only** place a lift dimension
may be resolved: **record → systemType → documented default** (L-127).

No builder, no symbol, no command and no mesh may carry a lift dimensional constant of
its own. `LIFT_DIMENSION_DEFAULTS` and `BUILT_IN_LIFT_TYPES` are the only two places a
lift dimensional literal may appear.

---

## §4 — Derived vs stored (C103 §4)

| Value | Ruling | Reason |
|---|---|---|
| `shaftWidth` / `shaftDepth` | **STORED** | It is what gets drawn and built |
| `carWidth` / `carDepth` | **DERIVED** — `shaft − 2·(wallThickness + clearance)` | Storing both lets an architect widen the shaft and leave the car small, with **nothing complaining** — two numbers that must agree, stored twice, is this repo's most repeated defect shape |
| `servedLevelIds` | **STORED, as a SET OF IDS — never a count** | A count ("serves 5 storeys") cannot survive inserting a level mid-stack, deleting one, or a **non-contiguous** service (a goods lift skipping the mezzanine is a real building). Ids say *which* storeys have a door, so inserting a level leaves service unchanged instead of silently extending it |
| `landingSideId` | **STORED** | Not recoverable from the flat `childrenIds`, and `lift.delete` needs it. An **identity reference**, not a value that can disagree with itself — the derived-vs-stored rule is about values that can *drift* |
| `penetratedSlabIds` | **STORED** | So `lift.delete` heals **exactly** the voids it made |
| the void **loops** | **DERIVED at delete time**, by re-running the pure assembly | Storing a copy would let it drift from the geometry it must match. This is only sound because `buildLiftAssembly` is **deterministic**, which is pinned by a test |
| `shaftBaseOffset` / `shaftHeight` / `carParkOffsetY` | **STORED** *(added 2026-08-23, L-9400)* | ⚠ **These ARE derived from the served levels' elevations, and storing them is a deliberate exception argued rather than dodged.** The **enclosure already stores the same two numbers**: every side this assembly emits carries `height: shaftHeight` and `baseOffset: shaftBaseY − datumY`, persisted in the wall store, able to go stale in exactly the same way. Recomputing them in the render layer would create a **SECOND producer that could disagree with the walls** — strictly worse than one producer that can go stale. So this adds **no new drift class**; it names the one that was already there. Level-move re-resolution is a real gap for the whole compound and is **L-9406, OPEN** |
| the shaft **frame** and **guide rails** | **DERIVED, and their IDS are derived too** *(L-9400)* | Their count is a function of the served-level count (`4 × (n+1)` ring beams), so pre-minting them in the tool would make the tool re-derive the assembly's own arithmetic — two producers of one number. `derivedShaftPartId(liftId, tag)` is a **pure function**, which satisfies CA-2 *more strongly* than pre-minting: it cannot differ across redo because it is not random, and it cannot be forgotten by a caller because there is no caller |

---

## §5 — What LOD 300 means here, concretely

Definition used: **BIMForum Level of Development Specification** — LOD 300 is *"a
graphic representation … as a specific system, object or assembly, in terms of
quantity, size, shape, location, and orientation. Non-graphic information may also be
attached."* LOD 350 adds interfaces with other systems; LOD 400 adds fabrication and
assembly detail.

**Assertable list — a lift at LOD 300 in PRYZM has:**

1. a shaft enclosure of **real, dimensioned, located** records in the families that
   own them (`Wall` / `CurtainWall`), spanning **pit to overrun**;
2. **one real `Door` record per served level**, at the correct storey, of the correct
   width and height, hosted in a named wall;
3. a **void in every slab the shaft passes through**, matching the shaft footprint;
4. a car decomposed into **five separately addressable, dimensioned parts** —
   structure, wall finish, floor, ceiling, car door;
5. a **type** (`passenger-6` / `passenger-8` / `accessible` / `goods`) and a **duty
   class**, both queryable;
6. every part carrying **`parentId`** and the parent carrying **`childrenIds`**.

**Explicitly OUT of scope at LOD 300, and named so nobody mistakes absence for a
defect:** brackets, the door operator, the counterweight, the machine and its room,
ropes, buffers as modelled objects, fixings, control panels, and any fire-rating
certification data. Those are LOD 350–400.

> ⭐ **AMENDED 2026-08-23 (lane LIFT56, §FEAT-LIFT-OBSERVATION-FRAME, L-9400).**
> This list used to open with **"guide rails and brackets"**. **Guide rails were
> removed from it, and the SHAFT STRUCTURAL FRAME was added to §5's assertable list
> as item 7.** The reason is a founder directive with a reference render attached —
> *"it should create similar to what you see in the image … it should be exactly the
> same"* — showing a **panoramic / observation lift**: a glazed shaft carried by a
> painted steel frame (four corner columns, a ring beam at every storey, cross-bracing
> in the top bay), with the car guide rails visible the full height.
>
> **This is not scope creep, and the distinction is worth stating because it is what
> keeps §5 meaningful.** LOD 350–400 is about **fabrication and interface detail** —
> a rail's *bracket spacing*, its *splice plates*, its *fixings*. A guide rail and a
> frame column at LOD 300 are what LOD 300 has always meant here: *"a specific system,
> object or assembly, in terms of quantity, size, shape, location, and orientation."*
> For an **observation** lift they are also not optional in the way they are for a
> lift inside a blockwork shaft: **they are the visible building.** A glazed shaft
> with no frame is a drawing of glass floating in the air.
>
> ⛔ **THE MEMBERS ARE `liftPart` RECORDS, NOT `column` / `beam` RECORDS**, and R-15
> below makes that binding. The short version: a lift's corner posts are supplied,
> priced and installed by the **lift contractor**, so counting them as building
> columns inflates the structural-steel tonnage by members the structural engineer
> never designed — the same data-integrity defect `LiftPartTypes.ts` records for a car
> floor counted as floor area. They also span **pit to overrun**, through every
> storey, so no `levelId` is true of them.
>
> **7.** a **shaft structural frame** — corner columns spanning pit to overrun, a ring
> beam per side at every served storey plus the head, and top-bay cross-bracing — plus
> **car guide rails**, all as separately addressable, dimensioned, materially-specified
> `liftPart` records.

---

## §6 — The 6-person default: ADDED, not substituted (L-5701)

The founder asked for *"default of standard lift for 6 people"*. The type that existed
was `passenger-8`, at 8 persons. **Both are real standard cars** — a genuine conflict
of two correct facts, not a bug.

**Ruling: `passenger-6` was ADDED and made the default of the LOD-300 compound.
`passenger-8` and `accessible` were left EXACTLY as they were.** Three reasons, each
measured:

1. ⛔ **`accessible` carries a REGULATORY citation.** `LiftTypeDefinitions.ts` cites
   **EN 81-70** for the 1.1 × 1.4 m clear car. An accessible lift that is not
   1.1 × 1.4 m **is not an accessible lift**. Rewriting a standards-cited definition to
   satisfy a default preference would be the worst available way to honour the request.
2. **`passenger-8` is load-bearing elsewhere.** `LiftToolPlacement.ts` pins
   `DEFAULT_TYPE_ID = 'passenger-8'` and the residential generator drives that path.
   Changing the value under it would silently resize every lift in every generated
   multi-family building.
3. **A 6-person car is itself standard** — 450 kg / 6 persons, ~1.0 × 1.25 m car, the
   common European residential size. It earns a row; it does not need to displace one.

`DEFAULT_LIFT_TYPE_ID = 'passenger-6'` applies to `lift.create` **only**. The legacy
massing path is untouched.

---

## §7 — Convergence path (NOT taken this lane)

The residential-building generator should eventually emit `lift.create` rather than
`CreateVerticalCirculationCommand`, at which point `verticalCirculation` becomes a
projection of `lift` rather than a rival record.

**That is not done here, and must not be done casually.** It changes the meaning of
every already-generated building and needs its own lane, its own migration for
persisted snapshots, and a decision about what happens to existing projects. Recorded
as **L-5713 (OPEN)**.

---

## §8 — Delete heals every floor plate

`lift.delete` removes the lift, its enclosure, its landing doors and its cabin parts,
**and closes the void in every slab the shaft passed through**, in ONE undo entry.

The precedent is not flattering: `DeleteStairCommand` contains **zero** references to
openings, so deleting a stair **leaves its void punched through the floor plate
forever** and nothing reaps it. A lift makes that bug **N times worse** — one hole per
storey, stacked, which is precisely a lift shaft with no lift in it.

**Binding rules:**
- voids are matched by **geometry**, never by index — "remove the last hole" is wrong
  the moment a slab carries a second lift, a stair void or a pool;
- the heal is a **whole-array replace**, never a `push` — a deep patch does not survive
  the legacy undo adapter and would wipe **every** hole on that slab;
- ⛔ the **host wall is NOT a child** and is never deleted. A wall-hosted lift
  **borrows** a wall.

---

## §9 — Two lessons this lane paid for (C103 §6 aggregate-undo neighbours)

### §9.1 — A type alias used as a value is fatal at runtime and can be invisible to `tsc`

`LiftTypes.ts` declares `export type LiftKind` — a **type**. The first draft of
`LiftCompoundTypes.ts` wrote `kind: LiftKind.default('passenger')` **at module scope**.
A type alias erases at runtime, so it threw
`TypeError: Cannot read properties of undefined (reading 'default')`.

⚠ **The blast radius was the whole editor, not the lift.** `command-registry` imports
`@pryzm/geometry-lift` as a **value** edge, and that barrel is reachable from
`bootstrap.everything` — so the throw killed **test collection for every suite under
`apps/editor`**, including a sibling lane's reachability proof, which is how it
surfaced. `[[scc-no-barrel-access-at-module-load]]`.

**Binding rule:** prefer **lazy / function-scope** construction for anything a barrel
re-exports. Module-scope evaluation inside a barrel-reachable file makes one package's
defect everyone's crash.

### §9.2 — `CompositeCommand` is not the aggregate-undo mechanism

L-2401 measured that `CompositeCommand` returns unconditionally `true` in **both**
directions and counts children **attempted**, not landed. A lift serving 10 storeys is
19 records plus 10 punched slabs; a half-landed compound reporting success is a shaft
with no doors, silently. **`produceMultiStoreCommand` is the only correct mechanism** —
one patch pair over all six stores, landing completely or not at all.

---

## §10 — Reachability: four axes, measured, per axis

C01 §6 rule 6. "Reachable" is four measurements, not one.

| Axis | State (2026-08-22) |
|---|---|
| **1 — store constructed** | ✅ `new LiftCompoundStore()` / `new LiftPartStore()` in `PluginRegistry.ts` |
| **2 — descriptor with `storeKey`** | ✅ both descriptors present; `lift` in `ELEMENT_PLUGIN_IDS`, `liftPart` in `STORE_ONLY_PLUGIN_IDS` with a written reason. **Proven by `apps/editor/__tests__/liftReachableThroughComposedRuntime.test.ts` — 12 cases, which read `rt.stores.lift` off the real composition root and never build a store** |
| **3 — something dispatches** | ✅ **CLOSED 2026-08-22 (lane TOOLS34, §FIX-LIFT-UNREACHABLE, L-7020).** `LiftPlanToolHandler` is in the shared `planToolHandlerRegistry`, so **both** plan surfaces have it, and it dispatches **`lift.create`**. An **Architecture** row on **both** live create surfaces (`CreateRailPanel` + `CreatePanelLayout`) arms it. Proven at the pointer layer, not at the bus: `pointerReachesArmedHandler.spec.ts` ARM A-3 dispatches a real DOM `mousedown` on a real plan overlay and asserts exactly one `lift.create` with `enclosureType: 'wall-hosted'`, a resolved `hostWallId`, **two** served storeys, **two** landing-door ids, **four** enclosure ids and **five** cabin-part ids. ⭐ **L-5709 / L-7040 CLOSED 2026-08-23 (lane LIFT42, §FIX-LIFT-TWO-COMMANDS-ONE-NAME, L-7840).** This cell used to read: *"L-5709 is NOT fully closed — it is narrowed and re-numbered L-7040: `ToolManager.activateLift` still drives the LEGACY massing command, so the 3-D arm and the plan arm create DIFFERENT THINGS."* It was **one line** — `ToolsAreaLayout.ts:332` registered `runtime.tools`' `lift` activator to `tm.activateLift()`, so the id `lift` named the **LOD-200 massing lift** in `runtime.tools` and the **LOD-300 compound** in `planToolHandlerRegistry` at the same time (C84 EI-9: one word, two results, decided by which surface the user happened to be on). It now calls `activatePlanOnlyToolOrExplain('lift', 'Lift')` — the SAME entry point both live create surfaces already use — so **one id names one element on every surface**. ⛔ The two ELEMENTS remain deliberately separate and §1 / R-8 still forbid merging them; only the NAME collision is closed, and the massing command keeps its real callers, which reach the COMMAND directly and never a tool key. **Measured before changing it:** `grep -rn "tools\.activate('lift'"` → **0 callers**, so nothing changes behaviour today — what changes is that the next caller (axis 4 below) gets the lift the architect sees rather than a massing box that looks like a bug. ⛔ The key stays REGISTERED rather than deleted: deleting it would also satisfy C84 EI-9 **and** break `check-tool-activator-coverage.ts`, putting `lift` alongside `pool`/`balcony` as UNCOVERED — "activate() records an active-tool id and arms NOTHING". ⚠ `ToolManager.activateLift` now has zero production callers and is left in place (`packages/input-host` is another lane's), recorded as **L-7841** |
| **4 — AI chat** | ⛔ `ChatCommandClassification.ts` classifies unknown verbs class B, so the chat route refuses `lift.create`. **L-5710, OPEN** |

⚠ **A stale claim corrected.** The brief for this lane stated that `lift` is one of
four declared tool families "whose activator arms nothing". That is a **pre-fix
historical reading**: the gate's own header says *"measured BEFORE the fix"*, and
`§FIX-DECLARED-TOOL-WITH-NO-ACTIVATOR` closed `lift` in the same commit that produced
the number. A live re-run of `tools/ga-gate/check-tool-activator-coverage.ts` exits 1
on **`pool`**, not `lift`.

---

## §11 — L0 promotion: ✅ **DONE 2026-08-22** (was DEFERRED — L-5711 → L-7021)

> ⭐ **`LiftId` and `LiftPartId` are now branded L0 ids.** `packages/schemas/src/types/Id.ts`
> carries `'lift'` and `'liftPart'` in `ElementType`, in `AnyElementId` and in `IdFor<T>`,
> so `createId('lift')` and `createId('liftPart')` type-check and the ONE id factory can
> mint the ONE id the compound needs.
>
> **What forced it, and it was not tidiness:** `LiftPlanToolHandler` must pre-mint every
> id (CA-2 — `execute()` runs again on REDO, so minting inside the handler produces a
> DIFFERENT lift the second time). With no `'lift'` member, `createId('lift')` was a
> **`tsc` error**, and the only alternatives were a hand-built string — a second id
> vocabulary, C84 EI-8 — or a cast. The root gate found it (`RC=2` → `RC=0`).
>
> ⚠ **`LiftId` is deliberately NOT `VerticalCirculationId`.** That brand belongs to the
> LOD-200 massing lift of §1. Collapsing the two brands would let a massing shaft be
> handed to a command that expects a compound, which is the confusion the brands exist to
> prevent — and it would be §1's forbidden merge arriving by the back door.
>
> The paragraphs below are the DEFERRAL as it was recorded, kept because the *reason*
> (another lane's uncommitted work in the same two files) is the durable finding.

### §11.1 — The deferral as it stood (historical)

`Pool` and `Water` live in `packages/schemas` (L0) and are named in `registry.ts` and
`types/Id.ts`. `LiftCompound` and `LiftPart` **should** join them, and do not yet.

**Reason, measured, not preference:** `packages/schemas/src/types/Id.ts` and
`packages/schemas/src/elements/index.ts` both carried **another lane's uncommitted
work** at the time (`git status --short` showed both ` M` while
`packages/schemas/src/elements/Balcony.ts` was still `??`). Read-modify-writing either
would have silently destroyed that lane's edits —
`[[multi-agent-shared-tree-collisions]]`.

Both new shapes are therefore declared together in `packages/geometry-lift/` and are
**drop-in** for promotion: they use the same `z.object` shape the L0 families use, so
promotion is a move plus three registry lines, not a rewrite.

**Consequence, stated:** until promoted, `liftPart` and `lift` are absent from
`SCHEMA_REGISTRY` and from the branded-`Id` union, so they do not participate in
whatever those two drive.

⚠ **HALF of that consequence is still live.** The **`Id` union half is closed** (above).
The **`SCHEMA_REGISTRY` half is NOT** — `LiftCompoundSchema` / `LiftPartSchema` still live
in `packages/geometry-lift/` and are not registered in `packages/schemas/src/elements/`.
Splitting the promotion is deliberate: the id brands are additive and cannot break a
consumer, whereas moving the Zod schemas changes what validates a persisted project, which
is a C47 format question and needs its own blast radius. **Recorded as L-7061, OPEN.**

---

## §12 — Conformance rules

- **R-1** A lift is created and destroyed **only** by `lift.create` / `lift.delete`.
  There is no `liftPart.*` verb and none may be minted (§0 of the `liftPart`
  descriptor).
- **R-2** Every part of a lift is a **real record in the family that owns that kind of
  thing**. A lift landing door **is** a door and lives in the door store, so the
  schedule (C28), the IFC exporter (C25) and the material dispatcher find it.
- **R-3** The cabin parts are the **one** new family. If a sixth kind of part fits an
  existing family, it belongs in that family's store.
- **R-4** One gesture is one undo entry, via `produceMultiStoreCommand` over all six
  declared stores. Declaring fewer stores drops the undeclared store's patches from
  undo routing.
- **R-5** The Tab cycle order comes from the **record**, never from `traverse()` (§2.2).
- **R-6** No lift dimensional literal outside `LIFT_DIMENSION_DEFAULTS` and
  `BUILT_IN_LIFT_TYPES` (§3).
- **R-7** `lift.delete` heals **every** penetrated slab, matched by geometry (§8).
- **R-8** ⛔ Do not merge the LOD-200 and LOD-300 lifts without executing §7.
- **R-9** A test that asserts a lift dimension **equals a documented default** is
  forbidden: it goes red on a deliberate change and green on a silently-ignored
  override. Assert an explicit value is **honoured**, or assert a **relationship**.
- **R-10** ⭐ **A reachability claim for this family is not admissible without a
  POINTER-LAYER proof.** *(Added 2026-08-22, lane TOOLS34.)* §10 axis 3 was reported
  PARTIAL for a day on the strength of a dispatch-layer suite, and the founder's report
  — *"Lift — it should be under Architecture, but could not see it!"* — was about a
  **palette section**, which no dispatch-layer test can see. Axis 3 is CLOSED only while
  `pointerReachesArmedHandler.spec.ts` proves that arming the tool through the REAL
  palette function and dispatching a REAL DOM `MouseEvent` at a REAL plan overlay
  produces exactly one `lift.create`. **Proving the runtime CAN dispatch is axis 2's
  job, and it is not this one.**
- **R-11** ⛔ **A palette row for this family names ONE object.** The LOD-200 massing lift
  and the LOD-300 compound are both real (§1) and both reachable in code, but a palette
  that offers the word "Lift" twice, for two different results, is worse than §1's
  co-existence — it makes the merge §1 forbids happen in the user's head. Until §7 is
  executed, **the palette offers the COMPOUND** and the massing command is reached only
  by the batch executors that need it.

---

## §13 — What a lift RENDERS, and what it does not (⭐ NEW 2026-08-23, lane LIFT42, L-7820..L-7824)

> ⭐⭐ **The founder placed a lift. The command ran. No element landed, and nothing said so.**
> His console: the status bar read *"Lift: standalone glass · 1.50 × 1.60 m · serves 2 storeys
> from this level up · click to place"*, the dashed preview drew, `lift.create` reached the
> **sync adapter** — which is what emits the W5-3 warning, so the command really was
> dispatched — and then `[ProjectSerializer] Snapshot created: **14 elements**`, unchanged
> from 14 before the click.

### §13.1 — Where it was lost

**`CommandEventBridge` is the ONLY relay** from a command's committed patches to the legacy
mirrors that feed the 3-D scene *and* the element census. It carried a case for
`balcony.create` — which is why the balcony works and lands five elements — and **none** for
`lift.create`. So the lift fell to `default: break;`: **a silent drop wearing exhaustiveness
as a disguise.** Measured 2026-08-23: `grep -in lift CommandEventBridge.ts` → **0**.

⚠ **THE SECOND HALF OF THE TRAP, and it is §1's table read as a runtime fact.** *"But there
IS a `LiftMeshBuilder`"* is not a rebuttal: `LiftMeshBuilder` is real, is constructed
(`initBuilders.ts:985`) and is driven by `bim-lift-added` from **`LiftStore` — the LOD-200
massing lift**. `lift.create` writes **`LiftCompoundStore`**. A mesh builder exists, runs, and
watches the other store. UNDO37 hit the identical trap for undo (L-7311) and correctly refused
to alias them — *"mapping it is C03 §4.6 U-2b corruption"*. **Aliasing them to make the
compound draw would be that same corruption with a renderer attached, and is forbidden by
R-8.**

### §13.2 — The mirror census — ⛔ read this before claiming a lift renders

Measured 2026-08-23 with **both** ripgrep and `grep -rn` (they have disagreed in this repo):

| member store | route | subscribers | verdict |
|---|---|---|---|
| `wall` (enclosure sides of `kind:'wall'`) | `wall.created` | **2** | ✅ **MIRRORS AND RENDERS** |
| `curtainwall` (glass sides) | — | **0** | ⛔ **no `curtainwall.created` event is DECLARED at all** |
| `door` (landing doors) | `door.created` | **0** | ⚠ event declared, **nothing listens** |
| `liftPart` (cabin) | — | — | ⛔ no legacy family, no fragment builder |
| `slab` (voids) | — | — | ⚠ a REPLACE on existing slabs, not a create |

> ⛔⛔ **THREE OF THOSE FIVE ROWS WERE WRONG, AND TWO OF THEM WERE WRONG BECAUSE OF ONE
> MISSING HYPHEN. CORRECTED 2026-08-23 (lane LIFT56, L-9401/L-9402).**
>
> The table above is **kept verbatim** because the correction is worth more than the
> table: it is a textbook `[[grep-silence-has-three-causes]]`, and the wrong reading was
> propagated into a contract, a console message, an ISSUE-LOG row *and* a test's
> assertions, where it then read as settled fact for a day.
>
> | member store | **actual** route | verdict, re-measured 2026-08-23 |
> |---|---|---|
> | `wall` | `wall.created` → initTools §P2.1 | ✅ correct as written |
> | `curtainwall` | **`curtain-wall.created`** → initTools **§P3.1-CW** | ⭐ **DECLARED, EMITTED AND MIRRORED SINCE §P3.1-CW.** The census grepped `curtainwall.created`, **unhyphenated**. The mirror runs `curtainWallRecordFromCreatedEvent` → `curtainWallStoreInstance.add` → `bim-curtainwall-added` → the curtain-wall builder |
> | `door` | **`wall.opening.created`** → initTools **§P2.3** | ⭐ **`door.created` WAS NEVER THE CHANNEL.** It is a bare count event (`{commandId, commandType, levelId, elementCount}`) whose CEB case **TASK-13 removed deliberately** — doors use the Committer architecture. §P2.3 does both halves a landing door needs: `addOpening()` on the legacy wall (**the hole**) and `doorStore.add(buildDoorStoreRecord(…))` (**the leaf and the plan swing arc**), through the one chokepoint a hand-placed door uses |
> | `liftPart` | **`lift.created`** → initTools **§FT-LIFT** → `LiftCompoundMeshBuilder` | ⭐ **THIS ROW WAS RIGHT.** There genuinely was no family and no builder, so this is the **one** place something was **BUILT** rather than connected |
> | `slab` | — | ⚠ **STILL OPEN — L-9403.** Unchanged and correct as written |
>
> ⚠ **THE OLD PRESCRIPTION WOULD HAVE MADE THINGS WORSE, NOT MERELY BEEN REDUNDANT.**
> It said *"closing it means declaring `curtainwall.created` + a mirror, and giving
> `door.created` a subscriber."* Following it literally would have minted a **second**
> curtain-wall event beside the live hyphenated one, and a **second** door channel beside
> `wall.opening.created` — **two rival vocabularies for two concepts that each already
> had one, which is C84 EI-9**: the very rule the same paragraph invoked to forbid
> mirroring glass as walls. ⭐ *A correctly-reasoned conclusion drawn from a
> mis-measured premise is still wrong, and it arrives wearing the contract citation.*

**Therefore, and this is the sentence to quote rather than "the lift renders"
(REWRITTEN 2026-08-23):**

- a **WALL-HOSTED** lift mirrors completely: four `kind:'wall'` sides;
- a **STANDALONE-GLASS** lift **also mirrors completely**: the landing side as a wall,
  the three glass sides as curtain walls, one C15 opening per served storey in the
  landing side, and the cabin + frame + rails through `lift.created`. ⭐ *That is the
  type the founder placed, and it was the type that showed him one wall.*
- **the SLAB VOIDS still do not reach the 3-D floor plate** (L-9403). The shaft is a
  real penetration in the model and is absent from the rendered slab.

### §13.3 — R-12 · R-13 · R-14 (binding)

- **R-12** ⛔ **A lift member is NEVER mirrored as a member of a different family to make it
  draw.** Emitting `wall.created` for a curtain-wall enclosure side would put a lift on
  screen and is forbidden: it is C84 EI-9 (one id, one meaning) and it would make the ELEMENT
  merge §1 forbids happen in the render store. ~~**The correct closure is to declare
  `curtainwall.created` and give it a mirror (L-7822), and to give `door.created` a
  subscriber (L-7823).**~~
  > ⭐ **THE RULE STANDS; ITS PRESCRIPTION WAS STRUCK 2026-08-23 (L-9401/L-9402).** Both
  > channels already existed — `curtain-wall.created` (hyphenated) and
  > `wall.opening.created` — so the correct closure was to **EMIT INTO THEM**, and
  > following the struck sentence would have minted two rival vocabularies, breaking the
  > very rule it is attached to. See the correction box in §13.2. **R-12 held throughout
  > and was never breached: nothing was mirrored as a family it is not, because nothing
  > had to be.**
- **R-15** ⭐ **A lift's structural frame and guide rails are `liftPart` records, NEVER
  `column` / `beam` records.** *(Added 2026-08-23, L-9400.)* `Column` and `Beam` already
  render, so emitting them is the cheap answer and it is wrong three ways: (a) the
  structural schedule, the load take-down and the `IfcColumn`/`IfcBeam` export would count
  lift-contractor members as **building structure**, inflating the steel tonnage by members
  the structural engineer never designed; (b) a corner column spans **pit to overrun**, so
  no `levelId` is true of it and per-level plan banding would lie about it; (c) `lift.delete`
  reaps by `childrenIds` (§8), and members sprayed into two more stores are two more chances
  to leave an orphan. This is C104 R-3 applied, not a new rule — *"if a sixth kind of part
  fits an existing family, it belongs in that family's store"* cuts **both** ways, and a
  building column is not what a lift's corner post is.
- **R-16** ⭐ **A lift part's placement is SHAFT-LOCAL or CAR-LOCAL. NEVER world.**
  *(Added 2026-08-23, L-9400.)* `LiftPart.axis` is a segment in shaft-local space and
  `offsetY` is measured from the parked car floor; the ONE world transform is applied by the
  consumer, from `lift.origin` + `lift.rotation`. Baking a world placement into a frame
  member would mean moving the lift left the steel behind while the glass, the doors and the
  car followed — **with nothing complaining, because both values would be individually
  valid.** That is `LiftPartTypes.ts` header point 3, and it is the reason the field could be
  added at all. The linear/box discriminator is **the presence of `axis`**, read through
  `isLinearLiftPart()`, never a switch on `kind`: keying on `kind` means every new kind must
  be added to a switch in every consumer, and the consumer that is missed draws the part in
  the wrong space, silently.
- **R-17** ⭐ **The un-mirrored-members diagnostic MUST go quiet when there is nothing to
  report, and MUST NOT be deleted when the last row closes.** *(Added 2026-08-23, L-9404.)*
  R-13 has two halves and only one of them is ever tested. A warning that fires on every
  successful lift is a warning nobody reads, which fails in **exactly** the way silence
  does — and a diagnostic removed because "it does not fire any more" is how the *next*
  member kind arrives unannounced. Both halves are pinned by
  `liftReachesTheRenderMirror.test.ts` B-3, which asserts the message names the remaining
  gap **and** that a lift with nothing outstanding produces no message at all.
- **R-13** ⭐ **A create that produces no visible element MUST SAY SO, at the layer that
  knows.** `CommandEventBridge`'s `lift.create` case reports the un-mirrored members **by
  store, by count and by reason**, once per lift, and it refuses the comfortable word: it
  says **PARTIAL create**, because the record is real, undoable and schedulable while part of
  it is invisible — *"failed"* and *"created"* are both wrong. Silence is the defect; a
  cheerful success message is the same defect with better manners.
- **R-14** ⭐ **`default:` in that bridge is not allowed to be silent for a COMPOUND.** The
  balcony case had already stated *in prose* that the pool had this exact defect (*"⚠ THAT IS
  NOT HYPOTHETICAL — IT IS THE SWIMMING POOL'S LIVE STATE"*) — and the lift then shipped with
  the identical defect and the identical silence. **A comment is not a detector.** `default:`
  now detects the mechanical signature — a multi-store patch (`path.length === 2`, the
  `produceMultiStoreCommand` routing convention) with no case — and warns once per command
  TYPE, naming the stores it wrote. Once per TYPE, never per dispatch: a line per click is
  noise nobody reads, which fails exactly as silence does.

### §13.4 — The reachability axis this adds

§10's four axes measure whether a lift can be **dispatched**. **They cannot see whether it
can be *seen*** — `liftReachableThroughComposedRuntime.test.ts` says so in its own header
(*"It does NOT prove that a person can click a Lift button and get one"*) and was green
throughout the founder's session.

~~**Axis 5 — RENDER MIRROR:** ⚠ **PARTIAL.** Closed for `wall-hosted`, open for
`standalone-glass` (L-7822).~~

> ⭐ **AXIS 5 RE-MEASURED 2026-08-23 (lane LIFT56).** **CLOSED for BOTH enclosure types,
> for every member except the slab voids.** Proven by
> `apps/editor/__tests__/liftReachesTheRenderMirror.test.ts` (8 cases), which asserts at
> `runtime.events` — the layer the mirrors actually consume — and **not** at the plugin
> store the older suite reads: A-1/A-2 wall sides · **B-1 three `curtain-wall.created`** ·
> **B-1b one `wall.opening.created` per served storey** · **B-1c one `lift.created`
> carrying the cabin, the frame and the rails** · **B-3 the diagnostic both ways** ·
> C-1 the generic detector.
>
> ⚠ **AND AXIS 5 IS STILL NOT "IT RENDERS", WHICH IS WHY AXIS 6 EXISTS.** A mirror event
> proves the record reached the channel a builder listens on. It does not prove a builder
> turned it into a mesh — the failure `[[committed-is-not-reachable]]` names, one layer up.

**Axis 6 — MESH** *(⭐ NEW 2026-08-23, L-9400)*: ✅ **CLOSED for the cabin, the frame and
the guide rails**, by `packages/geometry-lift/__tests__/LiftCompoundReachesTheMesh.test.ts`
(15 cases). It drives the **production** `LiftCompoundMeshBuilder` over the **production**
`buildLiftAssembly` output and reads the answers off the `THREE.Mesh` objects the renderer
puts in the scene: every part kind reaches a mesh, the frame wears the **master's**
`steel-painted-red-oxide` (read from `MATERIAL_CATALOG`, never transcribed), two materials
give two colours, a top-bay brace is genuinely **diagonal**, the ring beams **track the
served storeys**, the frame **follows the shaft footprint**, the car parks at the lowest
served level, materials are shared **by colour** so instancing survives, and every child is
non-selectable so the pick resolves to the lift (C15 §12).

⛔ **What axis 6 deliberately does NOT cover:** the glazed enclosure and the landing doors.
Those are drawn by the **curtain-wall** and **door** families' own builders from their own
records — drawing them a second time in the lift builder would put two producers of one
surface in the scene (z-fighting, doubled transmission cost on the WebGL backend, one id
meaning two objects). Their proof is at the bridge, in axis 5.

### §13.5 — Sync: `lift.create` is now declared (C08 §3.2, L-7810)

`lift.create` is `element-property` on subject `liftId`; **`lift.delete` is NOT-SYNCED with
the blocker named**, and its cascade is the widest of the three compounds and the only one
that **restores** state on other elements — it heals a void in every slab the shaft
penetrated (§8). A tombstone that replicated the removals and dropped the heal would leave
every collaborator with a full-height hole through every floor plate and no lift in it, which
is strictly worse than not replicating the delete at all. See C08 §3.2.
