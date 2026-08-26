# C109 — Element: Bathroom Pod Compound System

**Status:** CANONICAL
**Minted:** 2026-08-25 (lane BATH98, `§FEAT-BATHROOM-POD-COMPOUND`, L-11400..L-11412)
**Extends:** the compound model as it exists **on disk** — see §0.2, which is the clause to
read before anything else in this file.
**Parent:** [C84 §6](C84-ELEMENT-INTEGRITY.md) — EI-1…EI-13 are **applied, not restated**.
**Sibling:** [C99 — Element: Plumbing](C99-ELEMENT-PLUMBING.md) — the family every member of
a pod belongs to. C99's findings about that family are **inherited, not re-measured**.
**Governs:** `packages/geometry-plumbing/src/BathroomPod*.ts`, the `bathroomPod` store and
its handlers in `plugins/plumbing/`, and every consumer that reads a pod's members.

---

## §0 — What this contract owns, and what it explicitly does NOT

### §0.1 Refusal table — read this before adding a clause

| Question | Owner, not this contract |
|---|---|
| The plumbing family itself — its stores, its two `elementType` spellings, its fixture-vs-pipe verb split | **C99**. ⛔ This contract inherits **every** C99 finding, including the ones that are still open. A pod does not fix them and must not pretend to |
| Element creation pipeline | **C11** |
| Hosted elements (doors/windows in walls) | **C15**, **C86** |
| Command authoring, one-gesture-one-undo | **C16 §8.6** |
| Commands as the only mutation path | **C03**, P6 |
| Element integrity, per-family | **C84** and its C85–C99 block |
| Material assignment | **C100** |
| A refusal must name the reason AND the route back | **C16 CA-18**, **C74** |
| Room minima as a HABITABILITY claim, with provenance | **`packages/ai-host/src/workflows/apartmentLayout/rules/habitability/`** and its `provenanceSentence()`. ⛔ §5.4 below is a **fit** rule, not a habitability floor, and it says so |
| The lift compound | **C104** — the precedent this contract copies, one family over |

This contract owns exactly **one** question those ten do not ask:
**what is a bathroom module made of, and how does it fit itself to the room it lands in?**

### §0.2 — ⛔ THE C103 PHANTOM, AND WHY THIS CONTRACT DOES **NOT** CITE IT

**C103 — "Balcony & Compound Systems", the generic compound model — DOES NOT EXIST.**
Measured 2026-08-25, this lane, before a line of this file was written:

```
npx tsx tools/ga-gate/check-contract-index-equivalence.ts
  [contract-index-equivalence] contract FILES on disk : 107
  [contract-index-equivalence] index ROWS in README   : 90  (max id C108)
  [contract-index-equivalence] declared RESERVED ids  : C103, C61
  [contract-index-equivalence]   A FILE WITHOUT ROW   : 18  (baseline 18)
  [contract-index-equivalence]   D GAP NOT RESERVED   : 0  (hard 0)
  [contract-index-equivalence] OK: arm A 18 = baseline; arms B/C/D clean.
```

`C103` is **declared RESERVED and is not on disk**, while
`BalconyPlanToolHandler.ts`, `activeBalconyPlacement.ts`, `activatePlanOnlyTool.ts`,
`elementCreationMatrix.ts`, `packages/schemas/src/types/Id.ts` **and C104 itself** cite it as
though it were. That is **L-7060, OPEN**, and C104 §0.2 records the whole history in place:
the sibling lane shipped the balcony (`baf36857`) and never minted the contract.

**⭐ THIS CONTRACT'S DECISION, AND IT IS DELIBERATELY NOT C104'S.**

C104 handled the same gap by writing *"extends C103"* and flagging every C103 citation as a
forward reference to re-check. That was the honest move **at the time**, because C103 was
being minted in the same session by a named lane. Three days later it was not, and the effect
is that C104 — a CANONICAL contract — now derives its §2, §4 and §6 from a document that has
never existed. **The forward reference did not decay into a wrong statement; it decayed into
an unfalsifiable one**, which is worse, because there is no version of C103 that can prove
C104's §2 wrong.

So this contract **binds only to clauses that are on disk**:

| What a compound contract would owe me | Where this contract gets it INSTEAD |
|---|---|
| member identity + ownership (`parentId` / `childrenIds`) | **C104 §4** (the `landingSideId` / `penetratedSlabIds` rulings) and **ADR-0124 §3** (the pool's link), both on disk |
| a member list that is not discovered from the scene | **C104 §2.2** — the `root.traverse()` clause, verbatim and binding here (§3.2) |
| aggregate undo | **C16 §8.6 B-6** + **C104 §9.2** (`CompositeCommand` is not the mechanism) |
| "every part is a real record in the family that owns it" | **C104 R-2 / R-3**, applied in §2 |
| delete heals what it cut | **C104 §8** |
| a reachability claim needs a pointer-layer proof | **C104 R-10**, adopted verbatim as **R-9** here |

⛔ **THERE IS NO `C103 §n` CITATION ANYWHERE BELOW THIS LINE, AND NONE MAY BE ADDED.**
Adding one would make this the **seventh** artefact citing a document that does not exist,
and the gate **cannot see it** — C103 is absent from the files *and* from the README row set,
so neither arm A (file without row) nor arm B (row without file) fires. A contract cited by
code and existing nowhere is invisible to both arms of the equivalence gate.

⛔ **AND THE FIX IS STILL TO MINT C103 — NOT TO DELETE THE SIX EXISTING CITATIONS.** They name
the right home for a real clause. **This lane did not mint it**, for the reason C104's lane
gave and this lane re-endorses after measuring: minting a thin generic-compound contract from
one family's experience would **close L-7060 with a document the five citing files' clauses do
not actually match**, converting an honest, visible gap into a false settlement. That is the
`[[confident-register-row-are-the-wrong-ones]]` defect with a contract id attached. **L-7060
stays OPEN**, and this contract's §0.2 is now the second in-place record of it.

**When C103 lands**, §0.2 is the clause that changes: the table above becomes a set of
forward citations, and each row should be checked against what C103 actually says rather than
assumed to agree.

---

## §1 — What a bathroom pod IS, and the one thing it is not

The founder, verbatim (2026-08-25):

> *"I WANT YOU TO CREATE LOD 300 TOILET COMPOUNDS - MODULES - PARAMETRIC - MEANS THAT I CAN
> ADAPT THE MODULE TO THE ROOM DIMENSIONS: SINK (LOD200) + TOILET + SHOWER + PANEL ETC... AS
> PER THE PHOTO. ADD THIS NEW CATEGORY IN SERVICES AND CREATE NEW CATEGORY - SOUND AS PER THE
> CONTRACTS!"*

A **bathroom pod** is a parent record that owns a set of **plumbing fixture** records and
decides, from the room's real dimensions, **which wall each one takes, in what order, and how
far apart**. It carries no geometry of its own beyond its placement and its room envelope.

### ⛔ §1.1 — "PARAMETRIC" MEANS THE **LAYOUT** ADAPTS. THE FIXTURES DO NOT SCALE.

This is the single most likely mistake a future agent will make in this subsystem, and it is
worth a heading of its own.

**A WC is ~700 mm deep in a 1.6 m room and ~700 mm deep in a 4 m room.** So is a shower tray;
so is a basin. Sanitaryware is manufactured to a small number of real sizes. A module that
"adapts to the room" by multiplying every fixture footprint by `roomWidth / referenceWidth`
produces a 1.4 m-deep toilet in a large bathroom and a 400 mm one in a small one, and **both
are unbuildable**. It is the same defect class as an envelope drawn as a scaled block —
correct arithmetic, wrong object.

**What adapts, and it is the whole of the parametric model:**

| Adapts | Fixed |
|---|---|
| which **wall** each fixture is anchored on | each fixture's **footprint** (from the existing `*_FOOTPRINTS` tables) |
| the **order** of fixtures along that wall | each fixture's **required clearances** |
| the **gap** between adjacent fixtures (never below the clearance floor) | the **set** of fixtures the pod declares |
| the **arrangement** — single-wall, L-shaped, or a refusal | — |
| the shower's **extent along its wall**, within its variant's declared size | the shower **tray depth** |

⭐ **A fixture footprint may be OVERRIDDEN by the author** (the schema carries optional
per-member dimension fields, §4). What it may not be is **silently rescaled by the solver**.
An override is a stated intent; a rescale is an invented one.

### §1.2 — The pod is NOT a room, and does not create one

A pod is placed **inside** a room the architect has already made (or against a wall in a space
that will become one). It does not create walls, does not create a floor, does not create a
door, and does not punch anything. Its `room` field is an **envelope it was fitted to**, not a
room record it owns. ⛔ Making the pod emit its own enclosure would put a second producer of
walls in the model beside the wall tool, and every one of them would be un-editable by the
wall tool that did not make it.

---

## §2 — Members: ONE new family, and it is the PARENT

**C104 R-3 cuts both ways** — *"if a kind of part fits an existing family, it belongs in that
family's store"* — and for a bathroom pod it cuts almost all the way.

| Member | Family | Store | New? |
|---|---|---|---|
| the pod itself | `bathroomPod` | `bathroomPod` | ⭐ **the one new family** |
| WC | plumbing fixture, `fixtureType: 'toilet'` | `plumbing` | no |
| basin / vanity | plumbing fixture, `fixtureType: 'sink'` | `plumbing` | no |
| shower **including its glass panel** | plumbing fixture, `fixtureType: 'shower'`, a **walk-in** variant | `plumbing` | no |
| bath (optional, in place of the shower) | plumbing fixture, `fixtureType: 'bath'` | `plumbing` | no |
| accessories (TP holder, towel rail…) | plumbing fixture, `fixtureType: 'accessory'` | `plumbing` | no |

**So the pod mints exactly ONE new family — itself — and every member is a record in the
family that already owns sanitaryware.** That is the pool's shape (one new family, `water`)
rather than the lift's (two).

### ⭐ §2.1 — The glass PANEL is not a member. It is part of the shower, and that is measured.

The founder listed *"SHOWER + PANEL"* as two things. In this codebase they are one:
`ShowerGeometry.ts` declares `shower_walkin_left` / `shower_walkin_right` /
`shower_walkin_corner`, `isWalkInShower()` and `walkInGlassSide()`, and the walk-in builder
emits the tray, the gutter, the **frameless glass side panel (and its return, for the corner
variant)**, the slim frame, the rain head and the controls — as **one fixture**.

⛔ **Minting a `panel` member would be C84 EI-9**: two records for one object, with the glass
drawn twice — once by the shower's own builder and once by the pod's — which is z-fighting,
doubled transmission cost on the WebGL backend, and one id meaning two things. **The panel is
a PARAMETER of the shower member** (`glassSide: 'left' | 'right' | 'corner'`), decoded from
the variant slug by the function that already exists for it.

### §2.2 — Why the basin is a `plumbing` fixture and NOT a `furniture` `vanity_unit`

⚠ **This was measured and it is not the obvious answer.**
`packages/geometry-furniture/src/builders/BathroomVanityBuilder.ts` already exports a
`VanityUnitBuilder` that is **richer** than the plumbing family's basin: a 1.0 × 0.5 × 0.85 m
wall-anchored cabinet with a stone-look countertop, a **real cut circular basin recess**
(`§SINK-REAL-HOLE`, founder #8, 2026-06-12 — `THREE.Shape` minus a `Path` through
`ExtrudeGeometry`, no CSG, deterministic), drawer reveals and chrome pulls. That is very
nearly the founder's reference photo.

**The pod uses the plumbing `'sink'` fixture anyway, for three measured reasons:**

1. ⛔ **One object may not belong to two families depending on how it was placed.** A basin
   placed by hand is a `plumbing` fixture; a basin placed by the pod would be a `furniture`
   record. C99 already exports plumbing fixtures as `IfcSanitaryTerminal`
   (`FragmentReader.ts:119-122` → `PlumbingReader`), and furniture exports as furnishing.
   The same porcelain object would appear in two different IFC classes in two different
   projects. **C84 EI-9, exactly.**
2. **Every downstream consumer of a pod member already reads the plumbing store.**
   `PlumbingFragmentBuilder` (3-D), `PlumbingPlanSymbolBuilder`, `PlumbingElevationSymbolBuilder`
   (the richest 2-D answer of the five families C99 measured), `ProjectSerializer.ts:1023`
   and `PlumbingReader` all read it. A member in `furniture` gets the 3-D mesh and **loses the
   plan and elevation symbols**, which for a bathroom pod is most of the drawing.
3. ⭐ **The founder said `SINK (LOD200)`.** He is describing what he expects, and the plumbing
   `'sink'` is exactly that (§5). Substituting a richer object for the one he named would be
   answering a different question.

**The upgrade path is real and is recorded rather than pretended away.** The correct way to
raise the basin member to LOD 300 is to give the **plumbing** family the geometry the
furniture family already has — a `SinkGeometry.ts` beside `ToiletGeometry.ts`, with a variants
table and footprints, built the way the toilet and the shower were. That raises it for
**hand-placed basins too**, which a pod-only fix would not. **L-11408, OPEN.**

### §2.3 — Ownership link

`parentId` on every member, `childrenIds` on the pod — the mechanism the pool uses
(ADR-0124 §3), the host wall uses for its hosted doors (C15), and C104 §4 rules on. Not a new
compound pattern; the blessed one.

---

## §3 — Selection discipline: `drill-in`

The pod **DECLARES `drill-in`**: a click selects the **pod**; **Tab descends** into its
members; **Escape** returns to the whole pod.

This is the same discipline C104 §2 declares for the lift, and it is wired **INTO** the
existing mechanism — `SelectionManager.cycleKitchenUnit()`, shared with the kitchen run,
the curtain wall and the wardrobe — not beside it. ⛔ **Minting a rival Tab cycle is this
repo's most-repeated defect** and C104 §2.1 records it by name.

### ⭐ §3.2 — The member list comes from the RECORD. Never from `traverse()`.

**C104 §2.2, adopted verbatim and binding here**, and the reason is *stronger* for a pod than
for a lift:

`_buildKcUnitList` discovers kitchen units with `root.traverse()`. That works because a
kitchen run is **one mesh tree**. A pod's members are **N separate `plumbing` records**, each
built by `PlumbingFragmentBuilder` as its own fragment, on a level that may not be the active
one — and **C99 measured that after any project load the plugin DTO store is EMPTY while the
legacy store holds N** (C84 EI-5a). A traverse-discovered member list therefore silently drops
every member whose fragment has not been built, which for a freshly-loaded project is the
common case, not the corner one.

**Binding rule (R-5).** The pod's cycle order **MUST** come from the pod **record**
(`childrenIds` + the declared `BATHROOM_POD_MEMBER_ORDER`); the scene may be consulted **only**
to find the mesh for an already-known id. The sub-selection is published **by id** even when
no mesh exists.

---

## §4 — Derived vs stored

| Value | Ruling | Reason |
|---|---|---|
| `room` (clear width, clear depth, origin, rotation) | **STORED** | It is the **question the solver was asked**. Recomputing it from the surrounding walls at read time would make a pod change shape when a wall it was never attached to moves — and would make the answer depend on which walls happen to be loaded |
| `arrangement` (`single-wall` / `l-shaped`) | **DERIVED**, by re-running the pure solver | Storing it lets an architect widen the room and leave the arrangement stale, with **nothing complaining**. The solver is deterministic — pinned by a test — which is the only thing that makes this sound |
| each member's **position / rotation** | **STORED on the member record**, in the **`PlumbingFixtureFrame` convention** — origin at the **wall-contact edge**, local **+Z into the room** | The member is a real `plumbing` record that the move tool, the plan symbol builder and the IFC exporter all read directly. A position that lived only on the parent would be invisible to every one of them. ⚠ **Amended 2026-08-26 (§PLUMBFRAME, L-11490):** the solver emitted the footprint **centre** while every consumer reads the **contact edge**, so each member landed half its own depth further into the room. `packages/geometry-plumbing/src/PlumbingFixtureFrame.ts` is now the ONE declaration of both the anchor and the facing, and no arm may carry a compensating offset |
| `members[]` — the member records themselves | **STORED on the pod** | This is the C104 §2.2 / §3.2 list, and it must survive a level whose fragments have not been built. It is the SINGLE statement of what the pod contains |
| `childrenIds` | ⭐ **DERIVED** — `bathroomPodChildIds(pod)` | ⚠ **AMENDED 2026-08-25, in the same lane, before it shipped as a wrong claim.** This row read **STORED**. Building the model exposed that a stored flat id array beside `members[]` would be **TWO STATEMENTS OF ONE FACT on one record** — the exact drift class this whole section exists to forbid, committed by the section itself. `bathroomPodChildIds()` is a pure read of `members`, so the two cannot disagree because there is only one. **The §3.2 / R-5 requirement is unchanged and is fully satisfied**: the list still comes from the RECORD and never from `root.traverse()`, which is the property that clause was ever about — *stored* was never the requirement, *not-from-the-scene* was |
| `memberKinds` (which member is the WC, which the basin…) | **DERIVED from the member records** — never a parallel array | The member record already carries `fixtureType`. A second copy on the parent is two statements of one fact, and the pod is the one that would go stale |
| the fixture **footprints** | **DERIVED** — `TOILET_FOOTPRINTS` / `SHOWER_FOOTPRINTS` / `ACCESSORY_FOOTPRINTS` / the `resolveFixtureFootprint` fallbacks | ⛔ **The pod may not carry a sanitaryware dimension of its own.** C99's family owns those tables and `PlumbingSymbolGeometry.resolveFixtureFootprint` is the ONE resolver. A pod-local copy would let the plan symbol and the mesh disagree, which is the defect that resolver exists to prevent |
| the **clearances** | **DECLARED CONSTANTS in `BathroomPodRules.ts`**, and nowhere else | §5.2 argues this one rather than dodging it |
| `variantOverrides` (toilet / shower / accessory variant per member) | **STORED, optional** | Unset means *resolve me* — the family's `DEFAULT_*_VARIANT`. The L-127 chain, applied |

---

## §5 — The parametric layout model

### §5.1 — The three inputs, and only three

1. **The room envelope** — `clearWidth` × `clearDepth` in metres, an `origin` and a
   `rotation`. Local **+X** runs along the room's width; local **−Z** is the **primary wall**
   (the wet wall, where drainage is assumed).
2. **The declared member set** — which of `wc` / `basin` / `shower` / `bath` / `accessory` the
   pod contains.
3. **Handedness** — `'left'` or `'right'`: which end of the primary wall the shower takes.

Everything else is computed.

### §5.2 — The clearance table, and where its numbers come from

⛔ **NO NEW VOCABULARY IS MINTED.** The numbers below are the repo's existing bathroom
clearances, translated from the **furniture** kind vocabulary
(`packages/ai-host/src/workflows/furnishLayout/footprints.ts` — `clearFront` / `clearSides`,
in metres, themselves pinned to `programRules.ts`'s `clearFoot` / `clearSide` in mm) into the
**plumbing** `fixtureType` vocabulary this family speaks:

| pod member | source row in `footprints.ts` | `clearFront` (m) | `clearSides` (m) |
|---|---|---|---|
| `wc` | `toilet_radiator` | **0.60** | **0.10** |
| `basin` | `vanity_unit` | **0.70** | **0.05** |
| `shower` | `shower_glass_panel` | **0.20** | **0.00** |
| `bath` | `bath` | **0.45** | **0.05** |
| `accessory` | `towel_rail` | **0.00** | **0.00** |

⚠ **THIS IS A COPY, AND THE COPY IS DELIBERATE — WITH ITS COST STATED.**
`packages/ai-host` is L2 and `footprints.ts` is **package-internal** (not on the
`@pryzm/ai-host` barrel). The established precedent for exactly this situation is to **copy
the values with a pointer comment rather than create the edge** —
`apps/editor/src/ui/house-layout/houseExecDiagnostics.ts:54-70` and
`packages/data-engine/src/predicates/builtins.ts:1-12` both do it, both say why. This contract
follows it, and **names the cost**: there is no gate pinning `BATHROOM_POD_CLEARANCES` to
`footprints.ts`, so the two can drift. **L-11409, OPEN.** ⛔ The fix is a shared L0 vocabulary,
**not** a geometry package reaching into another package's internals.

### §5.3 — The arrangement rules, stated so they can be argued with

Let `W` = room clear width, `D` = room clear depth, and for each member `w` = footprint width
along its wall, `d` = footprint depth from its wall.

**Rule A — SINGLE-WALL.** Every member takes the **primary wall**, in the fixed order
`shower · wc · basin` (reversed for `handedness: 'right'`). The order is not arbitrary:

- the **shower** takes an **end**, because it is the deepest member and a walk-in enclosure
  wants two walls, not one;
- the **WC** sits between them, because it carries the largest side clearance and putting it
  at an end wastes that clearance against a wall;
- the **basin** takes the other end, because it is the shallowest and is the member an
  architect most often wants beside the door.

Required wall run: `Σ w_i + Σ gap_i`, where `gap_i = max(clearSides_i, clearSides_{i+1})`
between adjacent members. **Rule A applies iff** that sum `≤ W` **and** for every member
`d_i + clearFront_i ≤ D`.

**Rule B — L-SHAPED.** The **shower** moves to the **left or right return wall** (per
handedness), and `wc · basin` remain on the primary wall. **Rule B applies iff** Rule A does
not, **and** `w_wc + gap + w_basin ≤ W_remaining` where `W_remaining = W − d_shower`, **and**
`w_shower + clearFront_shower ≤ D`.

**Rule C — REFUSE.** Neither fits. §5.4.

⭐ **Rule A is tried first and Rule B is the fallback, never the reverse.** A single-wall pod
puts every drain on one wall, which is what makes a bathroom cheap to build; an L-shaped pod
needs drainage on two. Preferring the L-shape because it "fits more" would silently choose the
more expensive building every time both fit.

### §5.4 — ⛔ THE REFUSAL, AND IT NAMES BOTH NUMBERS

**C74 / C16 CA-18.** When neither arrangement fits, the pod is **not created**, and the reason
carries **the number required and the number available**, in metres, to 2 dp:

> *"This bathroom pod needs 1.80 m of clear wall (shower 0.90 + 0.05 + WC 0.42 + 0.10 + basin
> 0.65, including clearances); this room offers 1.40 m. Widen the room to 1.80 m, or remove
> the shower from the module."*

and, for the depth arm:

> *"This bathroom pod needs 1.30 m of clear depth (WC 0.72 + 0.60 activity space); this room
> offers 1.10 m. Deepen the room to 1.30 m, or choose a wall-hung WC (0.58 m deep)."*

⛔ **BINDING (R-3):** the pod **NEVER** silently overlaps fixtures, **NEVER** shrinks a
fixture below its footprint, and **NEVER** drops a declared member to make the rest fit. Each
of those three produces a module that looks placed and is unbuildable, which is strictly worse
than not placing it — the pool's *"worse than no feature"* property, one family over.

⚠ **THIS IS A FIT RULE, NOT A HABITABILITY FLOOR, AND THE DISTINCTION IS BINDING.** The
numbers above say *"these objects do not fit in this rectangle"*. They do **not** say *"this
room is not a legal bathroom"* — that claim belongs to
`packages/ai-host/src/workflows/apartmentLayout/rules/habitability/` and must go through `provenanceSentence()`, because
`programRules.ts:266-298` records in its own ⛔ header (L-4400) that its BS 8300 bathroom rows
are *"an accessibility design standard, not a habitability floor … THE PRYZM ENGINEERING
BASELINE — the ONE named fallback, and law nowhere."* A pod that refused with the word
"minimum" would be making a legal claim it has no authority for.

---

## §6 — What LOD 300 means here, concretely — and why the LODs are MIXED

Definition used: **BIMForum Level of Development Specification**. LOD 200 is *"a generic
placeholder … approximate quantities, size, shape, location and orientation"*; LOD 300 is *"a
specific system, object or assembly, in terms of quantity, size, shape, location, and
orientation"*; LOD 350 adds interfaces with other systems; LOD 400 adds fabrication detail.

⭐ **THE FOUNDER'S ASK IS EXPLICITLY MIXED — `SINK (LOD200) + TOILET + SHOWER + PANEL` — AND
THIS SECTION SAYS WHICH IS WHICH AND WHY, RATHER THAN CLAIMING ONE NUMBER FOR ALL OF IT.**

| Member | LOD | Why, measured |
|---|---|---|
| **the POD as an assembly** | **300** | A specific assembly with resolved quantity, size, shape, location and orientation, whose arrangement is derived from the room it is in |
| **WC** | **300** | `ToiletGeometry.createToiletGeometry` builds a per-variant D-silhouette bowl with a carved rim aperture, a seat, a cistern and a flush plate, from a **four-row dimensioned footprint table**. Four specific objects, not one generic one |
| **shower + glass panel** | **300** | `ShowerGeometry` walk-in variants build the tray, the gutter, the **frameless glass side panel and its return**, the slim frame, the rain head and the thermostatic controls — a specific enclosure with a specific glass hand |
| **basin / vanity** | **200** ⭐ | ⛔ **Measured, and stated rather than dressed up.** `PlumbingFragmentBuilder.createSinkMesh` is a `BoxGeometry(0.6, 0.2, 0.45)` basin on a box counter, with **no variant table**. That is a generic placeholder of the right size in the right place — **LOD 200, exactly the founder's own reading.** The LOD-300 upgrade path is real, exists in another family, and is L-11408 (§2.2) |
| **accessories** | **200** | `BathroomAccessoryGeometry` gives correct footprints and simple massing per variant |

**Assertable list — a bathroom pod at LOD 300 in PRYZM has:**

1. a **parent record** carrying the room envelope it was fitted to, its arrangement inputs and
   its `childrenIds`;
2. **one real `plumbing` fixture record per member**, in the store the whole plumbing pipeline
   already reads — so each appears in the 3-D scene, the **plan symbol**, the **elevation
   symbol**, the saved project and the **IFC export** with no pod-specific plumbing;
3. every member **positioned and rotated** by a deterministic solver from the room's real
   dimensions, against the repo's existing clearance figures;
4. a **declared arrangement** (`single-wall` / `l-shaped`) that is **re-derivable** from the
   record, and a **refusal with both numbers** when neither fits;
5. every member carrying **`parentId`** and the parent carrying **`childrenIds`**;
6. a **stated LOD per member** (the table above), so a member at LOD 200 is a **declared
   position**, not an unnoticed gap.

**Explicitly OUT of scope at LOD 300, named so nobody mistakes absence for a defect:** waste
and supply pipe **runs**, traps, valves, isolators and stopcocks; fixings, brackets and
carrier frames; the waterproofing membrane and its upstands; tile setting-out and grout lines;
extract ventilation; underfloor heating; product, manufacturer or model data; and any
water-regulation certification. Those are LOD 350–400 and belong to the **pipe** half of C99,
which is a different element (C99's opening table) and is not what this contract builds.

---

## §7 — Delete removes exactly what the pod made, and nothing it borrowed

`bathroomPod.delete` removes the pod **and every member named in `childrenIds`**, in ONE undo
entry.

**Binding rules:**
- members are reaped **by `childrenIds`**, never by a spatial query — *"delete the fixtures
  inside this rectangle"* is wrong the moment an architect hand-places a bidet in the same
  room;
- ⛔ **the ROOM is not a child** and is never deleted. A pod **borrows** a room the way a
  wall-hosted lift borrows a wall (C104 §8);
- ⛔ **the WALLS are not children.** A pod creates none (§1.2) and deletes none;
- a member an architect has **re-parented or moved out** is still reaped if it is still in
  `childrenIds` — the record is the authority (§3.2), and a member that should survive must be
  **removed from `childrenIds` by a command**, not by moving its mesh.

⚠ **The precedent is not flattering and is worth naming:** `DeleteStairCommand` contains zero
references to openings, so deleting a stair leaves its void punched through the floor plate
forever (C104 §8). A pod punches nothing, so it cannot commit that defect — but it can commit
the mirror of it, which is **leaving orphan fixtures standing in an empty room with a
`parentId` pointing at a record that no longer exists**. R-4 is what forbids that.

---

## §8 — One gesture, one undo entry

`bathroomPod.create` writes **one** store — `bathroomPod` — through **`produceCommand`**, ONE
patch pair, landing completely or not at all. Every member rides **inside** that patch, because
`members[]` is a field of the pod record (§4).

> ⭐ **AMENDED 2026-08-26, lane BATH102, while implementing the dispatch half.** This section
> read: *"writes **two** stores … **`affectedStores` MUST be `['bathroomPod', 'plumbing']`** —
> the measured write set, no more and no less"*, with the ⚠ paragraph below it inheriting C99's
> EI-1a hazard. **Two measurements taken before a line of the handler was written make the
> two-store declaration wrong, not merely hazardous:**
>
> 1. ⛔ **`ctx.stores.plumbing` IS NOT THE FIXTURE STORE.** It is the plugin DTO store
>    `plugins/plumbing/src/store.ts` — `Store<Plumbing>`, whose Zod shape is a **pipe**
>    (`kind` / `diameter` / `bendRadius`). `plugins/plumbing/src/handlers/CreatePlumbingFixture.ts`
>    states it in as many words: *"the `plumbing.create` target is the **pipe** handler … it
>    silently dropped every fixture field (fixtureType, position, variants)."* Members written
>    there would be sanitaryware in the **pipe** half of the family, where
>    `PlumbingFragmentBuilder`, `PlumbingPlanSymbolBuilder`, `PlumbingElevationSymbolBuilder`,
>    `ProjectSerializer` and `PlumbingReader` — the five consumers §2 reason 2 names — do not
>    look. Invisible in 3-D, absent from plan, elevation and IFC.
> 2. ⛔ **AND UNDO RESOLVES THE SAME KEY TO A THIRD STORE.** `buildUndoStoreMap()`
>    (`apps/editor/src/engine/undo/performUndoRedo.ts`) maps `plumbing: window.plumbingStore` —
>    the **legacy `@pryzm/geometry-plumbing` FIXTURE store**. So `'plumbing'` writes the PIPE DTO
>    store forward and applies its inverse to the LEGACY FIXTURE store back. That is
>    **C03 §4.6 U-2b verbatim** — a declared key that does not resolve to the store the handler
>    wrote is satisfied by the **corrupting** case — and `liftUndoAdapter.ts` forbids exactly this
>    aliasing by name, one family over.
>
> **So the declaration is `['bathroomPod']`, and it is the truthful one.** ⚠ **The cost is named
> rather than hidden:** the members are materialised into the legacy fixture store by a mirror
> subscribed to the pod store's `subscribeDirty()`, so create / undo / redo / delete all travel
> **one** road; and a saved-and-reloaded project still keeps every **member** and loses the
> **parent** (**L-11405**, OPEN, §12).

⛔ **NOT a `CompositeCommand`.** C104 §9.2 records that L-2401 measured `CompositeCommand`
returning unconditionally `true` in **both** directions and counting children **attempted**,
not landed. A pod that half-created would be a room with a shower and no WC, reported as a
success.

⛔ **NOT `runBatch()`.** C16 §8.6 B-6: `runBatch` is **undo-NEUTRAL**. One gesture is one undo
entry because it is **one command**, never because a batch was held open.

**`affectedStores` MUST be `['bathroomPod']`** — the measured write set of this command's
**patches**, no more and no less. The rule it satisfies is unchanged: an **undeclared** store
has its patches dropped from undo routing, and a **declared** store that does not resolve to
the one the handler wrote is C03 §4.6 U-2b's corrupting case. This command produces patches for
exactly one store, so exactly one is declared.

⚠ **AND C99 §2's EI-1a HAZARD IS INHERITED, NOT SOLVED** — it is the reason the declaration is
one key rather than two (see the amendment box above). C99 measured that `'plumbing'` resolves
to the **plugin DTO snapshot** on WRITE and to `window.plumbingStore` (**the legacy store**) on
UNDO, via `buildUndoStoreMap()`. That is a live, pre-existing family defect. A pod does not fix
it and **must not claim to**; §11's census records the undo axis as measured separately for that
reason, and the un-mirrored-member case is **L-11406**.

---

## §9 — Reachability is measured on SEVEN axes, per axis

C01 §6 rule 6. "Reachable" is never one measurement. §11 carries the live table; this section
declares what each axis means so a future reading cannot quietly redefine one.

| Axis | The question it answers |
|---|---|
| 1 — **store constructed** | does `runtime.stores.bathroomPod` exist off the real composition root? |
| 2 — **descriptor + dispatch** | can the runtime execute `bathroomPod.create` at all? |
| 3 — **create surface** | is there a row a person can see, in the section they would look in? |
| 4 — **pointer** | does a real DOM event on the real overlay produce the command? (**R-9**) |
| 5 — **undo / redo** | does one Ctrl+Z take the whole pod back, and one Ctrl+Y put it back? |
| 6 — **delete** | does deleting the pod reap every member and orphan none? |
| 7 — **drawing + export** | do the members reach the plan symbol, the elevation symbol and IFC? |

⭐ **AXES 3 AND 4 ARE DIFFERENT QUESTIONS AND MUST NOT BE COLLAPSED.** C104 R-10 exists because
axis 3 was reported closed on the strength of a dispatch-layer suite, and the founder's actual
report — *"Lift — it should be under Architecture, but could not see it!"* — was about a
**palette section**, which no dispatch-layer test can see.

---

## §10 — Conformance rules

- **R-1** A pod is created and destroyed **only** by `bathroomPod.create` /
  `bathroomPod.delete`. There is no `bathroomPodMember.*` verb and none may be minted — a
  member is a `plumbing` fixture and is edited by the `plumbing.*` verbs that already exist.
- **R-2** Every member is a **real record in the family that owns that kind of thing** — for
  every member of a pod, that family is `plumbing` (§2). A member added later that genuinely
  does not fit the plumbing family joins the family that does own it, or justifies a new one
  in this contract; it does **not** get copied into the pod record.
- **R-3** ⛔ **The solver never overlaps, never shrinks a fixture, and never drops a declared
  member.** It fits or it **refuses with both numbers** (§5.4).
- **R-4** `bathroomPod.delete` reaps **by `childrenIds`**, never spatially, and leaves no
  member carrying a `parentId` to a record that is gone (§7).
- **R-5** The member cycle order comes from the **record**, never from `traverse()` (§3.2).
- **R-6** ⛔ **No sanitaryware dimensional literal outside the plumbing family's own tables.**
  `TOILET_FOOTPRINTS`, `SHOWER_FOOTPRINTS`, `ACCESSORY_FOOTPRINTS` and
  `resolveFixtureFootprint`'s fallbacks are the only places one may appear. The pod's own
  constants file may carry **clearances and gaps** (§5.2) and nothing else.
- **R-7** One gesture is one undo entry, via `produceCommand` over the **one** declared store
  `bathroomPod` (§8 and its 2026-08-26 amendment). ⛔ Not `CompositeCommand` (C104 §9.2), not
  `runBatch()` (C16 §8.6 B-6), and ⛔ **not `['bathroomPod','plumbing']`** — that key resolves to
  the PIPE DTO store on write and the LEGACY FIXTURE store on undo.
- **R-8** ⛔ **The glass panel is a PARAMETER of the shower member, never a member of its own**
  (§2.1).
- **R-9** ⭐ **A reachability claim for this family is NOT admissible without a POINTER-LAYER
  proof** — C104 R-10, adopted. Axis 3 is closed only while a test arms the tool through the
  **real palette function** and dispatches a **real DOM `MouseEvent`** at a **real plan
  overlay**, producing exactly one `bathroomPod.create`. Proving the runtime *can* dispatch is
  axis 2's job and it is not this one.
- **R-10** A test that asserts a pod dimension **equals a documented default** is forbidden:
  it goes red on a deliberate change and green on a silently-ignored override. Assert that an
  explicit value is **honoured**, or assert a **relationship** (C104 R-9).
- **R-11** ⛔ **A palette row for this family names ONE object.** The SERVICES section already
  offers `Bath`, `Toilet`, `Sink` and `Shower` as individual fixtures. The pod row is a
  **fifth, differently-named** row (`Bathroom Pod`) that produces a **compound**; it does not
  rename, replace or shadow the four single-fixture rows, which remain the way an architect
  places one basin.
- **R-12** ⛔ **No `C103 §n` citation may be added to this contract** (§0.2), and the six
  existing C103 citations elsewhere in the repo **may not be deleted** to make the gap go
  away. L-7060 is closed by minting C103, and by nothing else.

---

## §11 — Reachability census — LIVE, per axis

⛔ **THIS TABLE IS THE HONEST ONE. An axis that is open is NAMED, not rounded up.**
See `§13` of C104 for why a family with a green dispatch test can still be invisible.

*(measured 2026-08-25, lane BATH98 — see the lane report for the verbatim gate lines)*

| Axis | State |
|---|---|
| 1 — store constructed | see the lane's census |
| 2 — descriptor + dispatch | see the lane's census |
| 3 — create surface (SERVICES) | see the lane's census |
| 4 — pointer (R-9) | see the lane's census |
| 5 — undo / redo | see the lane's census |
| 6 — delete | see the lane's census |
| 7 — plan + elevation symbol, IFC | see the lane's census |
| 8 — AI chat / RAC | ⛔ `ChatCommandClassification.ts` classifies unknown verbs class B, so the chat route refuses `bathroomPod.create` — the identical state C104 §10 axis 4 records for the lift (**L-5710**). **L-11407, OPEN.** |

---

## §12 — L0 promotion: DEFERRED, with the reason recorded

`BathroomPodSchema` is declared in `packages/geometry-plumbing/` and is **not** in
`packages/schemas/src/elements/` or `SCHEMA_REGISTRY`.

> ⚠ **AMENDED 2026-08-26, lane BATH102 — THIS CLAUSE CONFLATED TWO PROMOTIONS AND ONLY ONE OF
> THEM CARRIES THE COST IT DESCRIBES.** It read: *"…and `'bathroomPod'` is **not** in the
> branded-`Id` union."* **The brand is now in the union** (`packages/schemas/src/types/Id.ts`:
> `BathroomPodId = Id<'bathroomPod'>`, plus its `ElementType` / `IdFor` / `AnyElementId` rows).
>
> **The two halves are not the same question:**
> - **The Zod SCHEMA's promotion — still DEFERRED, for the reason below.** It changes *what
>   validates a persisted project*, a C47 format question with its own blast radius.
> - **The BRAND's promotion — TAKEN, and it costs nothing that argument names.** A string
>   literal in a type union has no I/O, no runtime and no persistence consequence. Without it
>   `createId('bathroomPod')` is a compile error, and the plan tool's only remaining options are
>   a hand-built id string — a second vocabulary, **C84 EI-8** — or a cast. `LiftId`'s own
>   docstring makes exactly this argument (*"the factory could not mint the ONE id the compound
>   needs, and a caller's only options were a hand-built string … or a cast"*), and it is why
>   `lift` / `liftPart` / `water` are in the union while their schemas are not.
>
> The clause below is unchanged and still correct.

**This is the same split C104 §11 made, for the same measured reason and one more:**

- moving the Zod schema changes **what validates a persisted project**, which is a **C47**
  format question and deserves its own blast radius (C104's L-7061, still OPEN);
- ⭐ and a pod is **not persisted as a pod today**. C99 measured that `ProjectSerializer`
  serialises the **legacy plumbing store** and `ProjectLoader` reconstructs fixtures through
  `new CreatePlumbingFixtureCommand(...)`, with **no bus event**. So a saved-and-reloaded
  project keeps every **member** and loses the **parent**, which means it loses
  `childrenIds`, the drill-in and the delete-reap. **That is a real, named gap — L-11405,
  OPEN** — and it is the first thing to fix if a pod is to survive a reload.

⚠ **Stated consequence:** until the SCHEMA is promoted, `bathroomPod` is absent from
`SCHEMA_REGISTRY`, so it does not participate in whatever that drives. The **brand** is present
(see the amendment above), so `createId('bathroomPod')` is the one id factory for a pod.
