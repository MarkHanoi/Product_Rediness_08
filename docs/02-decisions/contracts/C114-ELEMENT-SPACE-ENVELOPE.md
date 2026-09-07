# C114 — ELEMENT: SPACE ENVELOPE

**Status:** CANONICAL · **Minted:** 2026-09-04 · **Lane:** ENVELOPE-ELEMENT
**Ratified by:** [`ADR-0380`](../adrs/ADR-0380-the-space-envelope-is-one-family-with-two-authored-roles.md)
(six rulings) · **Authority above it:**
[`STR-ENVELOPE-AS-FIRST-CLASS-ELEMENT`](../../01-strategy/STR-ENVELOPE-AS-FIRST-CLASS-ELEMENT.md)
(founder directive, `2ddfb560`).
**Binds:** every PR touching the `spaceEnvelope` family, per [`C84 §6`](C84-ELEMENT-INTEGRITY.md).
**Siblings:** [`C94`](C94-ELEMENT-ROOM-SPACE.md) (room/space — the nearest family, deliberately
kept separate by ADR-0380 D1) · [`C107`](C107-ELEMENT-ADAPTIVE-COMPONENT.md) (**the structural
template**, for the reason C84 §6.2b gives: it is the proof that a twelve-section contract written
*before* the code is useful rather than aspirational).

> ⛔ **WHY THIS DOCUMENT EXISTS AT ALL, STATED PLAINLY.** C84 §6 forbids the family without it:
> *"A new family may not be added while its per-element contract is absent."* `ADR-0380` was
> committed (`8f7d47e9`) naming this contract as its spawn, and **four source files cited `C114`
> while no `C114` was on disk** — the `UNMINTED-AND-CITED` shape that `L-7060` logs against `C103`
> and that CLAUDE.md's governance section records as a recurring defect. That gap is closed by this
> file. ⭐ **The citation was created before the contract, which is the wrong order, and it is
> recorded here rather than tidied away.**

---

## §0 — WHAT THIS IS, AND THE ONE SENTENCE IT DEFENDS

A **space envelope** is an AUTHORED spatial volume placed *before any wall exists* — the founder's
*"basic and initial representation of spaces as living entities, aware of their surroundings"*
(directive §3). Geometrically it is a prism: a footprint ring on a level's XZ plane, lifted by
`baseOffset`, extruded by `height`.

**The one sentence this contract defends:**

> **A space envelope states what a designer INTENDS to build. It never states what the law
> PERMITS, and no code path may widen the first into the second.**

Everything in §12 (refusals) and §9 (vocabularies) exists to hold that sentence.

### §0.1 — ⛔ THE HONEST STATUS OF THIS FAMILY, MEASURED 2026-09-04

Per C84 §6.2a — *"on the day it is written, almost every AS-IS cell will read `NOT MEASURED` or an
honest absence, and that is the correct content"* — and per C107 §0.1's worked precedent of a
contract that measures its own absence:

```
grep -rl "spaceEnvelope\|SpaceEnvelope" --include=*.ts --include=*.tsx \
     packages plugins apps src server tools
→ 4 files, ALL of them schema:
     packages/schemas/src/elements/SpaceEnvelope.ts     (the L0 record)
     packages/schemas/src/elements/index.ts             (barrel re-export)
     packages/schemas/src/registry.ts                   (SCHEMA_REGISTRY row)
     packages/schemas/src/types/Id.ts                   (brand + ElementType + IdFor)
```

⭐ **There is no store, no command, no handler, no plugin, no renderer, no UI control and no
persistence leg.** A registered schema is not an element — it is a *shape* an element could take.
This section is the guard against the exact misreport the lane brief forbids: **do not cite a
schema's existence as a working element.**

### §0.2 — THE NAMING-DISCLOSURE CLAUSE, INHERITED FROM C107 §0.2-a

*"A family named for a behaviour it does not have is the naming-vs-behaviour defect this repository
logs repeatedly."* ⛔ **This contract may not describe face-dragging, neighbour adaptation, solar
awareness, living-graph membership, profile editing, IFC identity or RAC authoring as capabilities
on the strength of an authored schema or a TO-BE cell.** Each is claimed only where §14 records it
SHIPPED with a proof. Everything else in this document is normative intent.

### §0.3 — THE THREE THINGS IT IS NOT

| Not this | Why the confusion is dangerous |
|---|---|
| **`BuildableEnvelope`** (`packages/schemas/src/site/zoning/`) | That is the SOLVED legal ceiling — a study with a mandatory `EnvelopeConfidence`, a derivation trace and a refusal vocabulary, produced by the zoning engine and never authored. ADR-0380 D2 refuses to promote it precisely so a user can never drag the thing the product calls the law |
| **`Room`** (`packages/schemas/src/elements/Room.ts`) | `RoomTopologyObserver` discharges suppressed commits on `resume()` (C84 EI-7e), so a wall-free volume in the room store would be **recomputed away by the room detector**. ADR-0380 D1 |
| **The parameter "envelope"** (`packages/schemas/src/apartment/ApartmentParameters.ts`, a `[min,max]` band) | Same English word, unrelated concept. The kind is spelled `spaceEnvelope`, **never bare `envelope`**, so a grep for one never returns the other (C84 EI-8) |

---

## §1 — IDENTITY

| Axis | AS-IS (measured 2026-09-04) | TO-BE (normative) |
|---|---|---|
| Canonical `elementType` tag | `'spaceEnvelope'` — `Id.ts:238` (`ElementType` union), `registry.ts:90` (`SCHEMA_REGISTRY`) | unchanged |
| Every spelling in use (§4E) | **exactly one**: `spaceEnvelope`. No rival spelling exists, because no second author has touched it yet | ⛔ **hold the count at one.** `envelope`, `spatialEnvelope`, `massEnvelope` and `volume` are all forbidden spellings for this family |
| L0 schema | `packages/schemas/src/elements/SpaceEnvelope.ts` — `defineElement('spaceEnvelope', …)` + three `.refine()` invariants | unchanged; §5 is its field map |
| Branded id | `SpaceEnvelopeId = Id<'spaceEnvelope'>` — `Id.ts:189`, in `AnyElementId` (`:248`) and `IdFor` (`:291`) | unchanged |
| Bus verb namespace | **ABSENT** — no verb exists | `spaceEnvelope.*`, per C69 §3.6 (the namespace is the kind, never an abbreviation). Roster in §6 |
| IFC identity | **NOT MEASURED.** `IfcSpatialZone` is the plausible candidate; `IfcSpace` is ruled OUT by ADR-0380 D1 because stamping a design study as building fabric exports intent as fact | resolve before any IFC export claim. ⛔ Until resolved, the family is **excluded** from IFC export rather than guessed into it |

---

## §2 — STORES, AND WHICH ONE IS THE AUTHORITY

**AS-IS: there are zero stores.** The record exists only as a Zod shape.

**TO-BE — normative, and deliberately minimal (EI-1: one authority per question):**

| Representation | Status | Authority? |
|---|---|---|
| **L0 `SpaceEnvelope` record** in the element store | TO BUILD | ⭐ **YES — the single authority.** Every other view of the family is derived |
| Scene `userData` on the rendered prism | TO BUILD | NO — carries `{ id, type }` for picking only |
| A plugin-side DTO | ⛔ **FORBIDDEN** | — |
| A `roomStore` mirror | ⛔ **FORBIDDEN** | — |

> ⛔ **§2a — MUST: NO PLUGIN DTO, AND NO ROOM MIRROR.** C84 EI-5a is explicit that mirroring two
> representations where one has no readers *"makes both copies authoritative and neither
> trustworthy"*. This family is being built from zero, so it has the one chance no older family
> had: **it can decline the second store outright.** A future PR that adds a DTO must first amend
> this section.

> ⛔ **§2b — MUST: the derived cache fields are written by ONE function.** `footprintAreaM2` and
> `volumeM3` are caches of `footprint`/`height`. They are recomputed by
> `recomputeSpaceEnvelopeMetrics` in `@pryzm/geometry-space-envelope` and by nothing else. A second
> writer is EI-9's "two answers to one question" with a rounding difference attached.

---

## §3 — CONSUMERS

**AS-IS: zero consumers.** Renderer, plan view, persistence, IFC export, GLB export and the bake
worker each read **nothing**, because nothing exists to read.

**TO-BE:**

| Consumer | Obligation |
|---|---|
| 3D renderer | draws the prism, translucent, role-tinted; owns `materialColor`'s default |
| Plan view | draws the footprint ring at the owning level; ⭐ **must show `role`**, because a level and a room envelope are indistinguishable as outlines |
| Persistence | round-trips **every** field of §5 without loss. This is the axis §14 requires a passing test for before claiming "serialised" |
| IFC export | ⛔ **EXCLUDED until §1's IFC row resolves.** An unmapped family is skipped, never approximated |
| GLB export / bake worker | **NOT MEASURED** |
| `measureAuthoredDesign` | ⛔ **MUST NOT CONSUME IT.** ADR-0380 D5 — see §11 and the table below |

> ⭐ **§3a — THE GFA SEPARATION IS NORMATIVE AND IT IS THE MOST LOAD-BEARING RULE HERE.**
> Three questions, three authorities, never summed into one number:
>
> | question | authority |
> |---|---|
> | *"How much floor area has been BUILT?"* | `apps/editor/src/ui/site/designMeasurement.ts measureAuthoredDesign` — measured off REAL floor plates, refusing (`overlapping-floor-plates`, `unattributed-floor-plate`, `no-floor-plates`) rather than guessing |
> | *"How much is INTENDED?"* | this family's `footprintAreaM2` × membership — **a separate channel with a separate name** |
> | *"How much is PERMITTED?"* | `BuildableEnvelope` — unchanged, and neither of the above may restate it |
>
> Collapsing the first two makes the feasibility panel's headline built-area number **change when
> nothing was built** — `§CONTEXT-DATA-HONESTY` at the single number the panel turns on, and the
> defect `L-456` exists to stop, arriving through a new door.

---

## §4 — PLUGIN ↔ DTO ↔ COMMAND ↔ BUILDER, AND WHAT "REACHABLE" COSTS

**AS-IS:** no plugin, no handlers, no registration, no UI control. **Reachability: 0 of 0.**

**TO-BE — the wiring, with the C84 EI-3 rule stated up front:** a handler that is *registered* but
that **no UI control can reach** is dead code that measures as coverage. Each verb in §6 must name
its reaching control, or be recorded here as deliberately head-less (RAC/AI-only).

| Layer | Artefact | Status |
|---|---|---|
| L0 schema | `packages/schemas/src/elements/SpaceEnvelope.ts` | ✅ SHIPPED |
| L1/L2 geometry | `packages/geometry-space-envelope` — pure prism solver, face-move, containment, adjacency, stacking, refusals PLANNED — see §14 |
| Commands | `spaceEnvelope.*` handlers | see §14 |
| Plugin | `plugins/space-envelope` — tool, UI, registration PLANNED — see §14 |
| Renderer join | prism draw + pick | see §14 |

---

## §5 — THE BRIDGE FIELD MAP

⛔ **EVERY field of the payload, and for each: CARRIED, TRANSFORMED, or DELIBERATELY DROPPED.
Omission is forbidden (C84 EI-2).** This section is what the future `check-bridge-field-coverage`
gate consumes.

| Field | Type | Create payload → record | Record → renderer | Record → persistence | Note |
|---|---|---|---|---|---|
| `id` | `SpaceEnvelopeId` | minted | CARRIED (`userData.id`) | CARRIED | |
| `type` | `'spaceEnvelope'` | injected by `defineElement` | CARRIED | CARRIED | |
| `levelId` | `string` | CARRIED | TRANSFORMED → world Y via the level datum | CARRIED | ⚠ see §10a on terrain |
| `name` | `string` | CARRIED | CARRIED (label) | CARRIED | |
| `role` | `'level'\|'room'\|'maximumBuildable'` | CARRIED, **`maximumBuildable` REFUSED at create** | TRANSFORMED → tint + plan style | CARRIED | §9 |
| `footprint` | `Vec3[]` (y ≡ 0) | CARRIED | TRANSFORMED → prism side faces | CARRIED | invariant enforced by `.refine` |
| `baseOffset` | `number` | CARRIED | TRANSFORMED → prism base Y | CARRIED | |
| `height` | `number` > 0 | CARRIED | TRANSFORMED → prism top Y | CARRIED | |
| `withinId` | `SpaceEnvelopeId \| null` | CARRIED | **DELIBERATELY DROPPED** — the renderer draws volumes, not memberships | CARRIED | the ONE stored relation (§9a) |
| `occupancy` | `string?` | CARRIED | TRANSFORMED → colour when a room role | CARRIED | free string, pinned to `RoomOccupancyType` by test (§9) |
| `standing` | `'design-intent'` | forced, never read from payload | TRANSFORMED → the honesty badge | CARRIED | ⭐ §12 |
| `basis` | `{zoneCode, citedAtIso} \| null` | CARRIED | **DELIBERATELY DROPPED** from the solid; surfaced in the inspector | CARRIED | a CITATION, never a copy |
| `footprintAreaM2` | `number` | RECOMPUTED, never trusted from payload | DELIBERATELY DROPPED | CARRIED | cache — §2b |
| `volumeM3` | `number` | RECOMPUTED, never trusted from payload | DELIBERATELY DROPPED | CARRIED | cache — §2b |
| `materialColor` | `string?` | CARRIED | CARRIED | CARRIED | |
| `provenance` | `RetrofittedProvenance` | CARRIED | DROPPED | CARRIED | PV-04 / C75 §2.4 |
| `confidence` | `RetrofittedConfidence` | CARRIED | DROPPED | CARRIED | PV-06 / C75 §1.3 |

> ⭐ **The two `RECOMPUTED` rows are the interesting ones.** A create payload that supplies
> `footprintAreaM2` is **not** believed — the value is recomputed from `footprint`. A caller who
> could lie about the area of their own polygon is a caller who can make the intended-area channel
> disagree with the geometry it is drawn from.

---

## §6 — VERBS

Namespace `spaceEnvelope.*` (C69 §3.6). Lineage bands are C84 §4A's L1–L6.

| Verb | Purpose | Stores written | Restored on undo | Equal? | Reaching control |
|---|---|---|---|---|---|
| `spaceEnvelope.batch.create` | ⭐ **the ONLY create path.** N envelopes, ONE undo entry; optionally REPLACES what it `supersedes` (§6d) | element store | element store | MUST be | 3D/2D draw tool; RAC |
| `spaceEnvelope.delete` | remove; clears dangling `withinId` on children | element store | element store | MUST be | selection → delete |
| `spaceEnvelope.move` | translate the whole prism | element store | element store | MUST be | 3D gizmo; 2D drag |
| `spaceEnvelope.moveFace` | ⭐ move ONE face along its own normal; neighbours adapt | element store | element store | MUST be | 3D face gizmo (§10) |
| `spaceEnvelope.setFootprint` | replace the ring (profile edit) | element store | element store | MUST be | profile editor (§10b) |
| `spaceEnvelope.setParameter` | `height`, `baseOffset`, `name`, `occupancy`, `materialColor` | element store | element store | MUST be | inspector; RAC |
| `spaceEnvelope.setWithin` | declare/clear membership | element store | element store | MUST be | inspector |
| `spaceEnvelope.changeLevel` | re-seat on another storey | element store | element store | MUST be | inspector (the C94 §L-1032 storey axis) |
| `spaceEnvelope.promoteToRoom` | ⛔ **DEFERRED to Stage H** | — | — | — | — |

> ⛔ **§6a — MUST: ONE GESTURE = ONE `*.batch.create`.** C16 §8.6 B-6. ⚠ `batchCoordinator.runBatch`
> is **undo-NEUTRAL** — N commands inside it produce N undo entries, which is RESI-ORCHESTRATOR-PLAN
> §6 risk 7 and the trap this family is most likely to fall into. There is **no** singular
> `spaceEnvelope.create`; the batch verb is the create path even for one envelope, so no caller can
> reach for the wrong one.

> ⛔ **§6b — MUST: `role: 'maximumBuildable'` is REFUSED by `spaceEnvelope.batch.create`,** with the
> exported sentence `MAXIMUM_BUILDABLE_IS_NOT_AUTHORED` and **never a re-typed copy** (C84 EI-8a: a
> licensed copy is pinned by a test, never by a comment — and the cheapest way to have no second
> copy is to have no second string). No UI surface offers the role, which is the half EI-3 polices.

> **§6c — MUST: every handler carries ≥1 OpenTelemetry span (P8 ZONE A, zero tolerance).**

> ⭐ **§6d — REPLACEMENT IS A CREATE WITH `supersedes`, NEVER A DELETE FOLLOWED BY A CREATE**
> (§KEEPING-A-MASSING-OPTION-ACCUMULATES-INSTEAD-OF-REPLACING, L-13038, 2026-09-07).
>
> Founder: *"WHEN I SELECT ANOTHER MASSING OPTION THE PREVIOUS ONE SHALL BE REMOVED."* Every press
> of "Keep this as a level envelope" minted a rival on the same storey, and `pickLevelEnvelope`
> then refused to guess which one the rooms belonged inside — **a correct refusal about a state the
> user never meant to create.** The fix is at the MINT.
>
> **Normative:**
> 1. **`CreateSpaceEnvelopeBatchPayload.supersedes?: readonly string[]`** — the envelopes this
>    batch REPLACES. They are removed in the **same `produceCommand`** as the creations, which is
>    the only thing that buys ONE undo entry: §6a's warning applies verbatim, `runBatch` is
>    undo-NEUTRAL, so a `delete` + `batch.create` pair is TWO ring entries and a torn empty-storey
>    state between them.
> 2. **Every id MUST exist, and one that does not is a REFUSAL** — asked by `canExecute` AND by
>    `execute`, from one producer, so the gate and the mutation cannot disagree (C84 EI-9.2). A
>    batch may not supersede an id it is also creating.
> 3. **Removal follows §8 exactly** — children naming a superseded envelope are **not** cascaded,
>    their `withinId` is cleared, and both halves are in the one patch pair. `spaceEnvelope.delete`
>    and this field share ONE implementation (`handlers/removeEnvelopes.ts`); two copies of §8
>    would be C84 EI-9.
> 4. ⛔ **THE HANDLER NEVER DECIDES *WHETHER* TO REPLACE.** It is handed ids. A create verb that
>    removed what it judged to be "the old one" would be the accumulation defect pointed the other
>    way — and its victim would be a volume the architect drew.
> 5. ⭐ **`CreateSpaceEnvelopeSpec.provenance?`** — carried through untouched onto the record
>    (C75). This is what makes clause 4 workable: the SURFACE stamps `computed` on a plate its
>    solver fitted, so a later press can tell that plate from a hand-drawn envelope
>    (`isReplaceableByGeneratedMassing`, C58 §1.19 clause 3). ⛔ **An UNKNOWN origin is treated as
>    the user's, never as PRYZM's** — C75 §1.4, and the §CONTEXT-DATA-HONESTY rule that a value
>    PRYZM cannot establish is not a value PRYZM may act destructively on. The handler itself
>    stamps nothing: `authored` is unrepresentable to a system pass (C75 §2.2) and a create verb
>    that defaulted an origin would defeat that by hand.

---

## §7 — UNDO / REDO

**AS-IS: NOT MEASURED — no verb exists.**

**TO-BE — normative:**

- **`affectedStores` MUST equal the measured write set** (C84 EI-7). This family writes exactly one
  store, which makes the declaration checkable by inspection — an advantage no older family has.
- **`createSnapshot` MUST cover every declared key** (EI-7d).
- ⭐ **Redo RESTORES; it does not RECOMPUTE (EI-7e).** This is the single most important row in the
  section and it is the reason ADR-0380 D1 kept this family out of `Room`: `RoomTopologyObserver`
  discharges suppressed commits on `resume()`, so room boundaries are *recomputed from the
  post-undo wall set*. **A space envelope has no detector and must never acquire one.** Its
  geometry is authored, so undo restores the authored value verbatim.
- **The two cache fields are restored, not recomputed on undo** — recomputation would be correct
  here by luck, and a rule that is right by luck is a rule that breaks when the cache gains a field.

---

## §8 — CASCADES

| Mutation | Cascade | Reversed by undo? |
|---|---|---|
| `moveFace` | the **four faces sharing an edge with the moved face adapt** (their shared vertices move); ⚠ **CORRECTED 2026-09-07 — this cell used to end *"neighbouring envelopes do **not** move"*, and that has been false since the contextual planner shipped.** `SpaceEnvelopeContext.ts` adapts (a) every ROOM a moved LEVEL would otherwise strand and (b) a sibling room sharing the moved face, and `MutateSpaceEnvelope.ts:238-260` writes them in the **same patch pair** — so it is still ONE undo entry, which is presumably what the old cell was reaching for. A neighbour that could not follow is in `plan.undetermined` with a typed C78 §8 reason and is left where it was. | MUST be — the whole ring, and every adapted neighbour, are captured in one patch |
| `delete` a level envelope | children naming it in `withinId` are **NOT deleted**; their `withinId` is cleared and the containment finding turns advisory | MUST be |
| any geometry change | `footprintAreaM2` / `volumeM3` recomputed in the same patch | MUST be |
| any geometry change | adjacency / stacking / containment findings are **recomputed on read, never stored** — so there is no cascade to reverse (ADR-0380 D3) | N/A by construction |
| any change | living-graph node/edge projection refreshes via `buildingGraphMaintainer` | MUST be |
| ⭐ `moveFace` (committed) | **§ENVELOPE-WALLS-FOLLOW / §ENVELOPE-PARTITIONS-FOLLOW (L-13116)** — every wall PRYZM recorded as derived from the moved envelope *or from any room the same commit adapted* follows, in ONE `wall.cascadeBaseline`. A wall that no longer spans the edge it was built from is treated as AUTHORED, is NOT moved, and is NAMED (C80). | ⚠ **NO — and this is a KNOWN, INHERITED violation, not a new one.** The cascade lands on the LEGACY stack (`CascadeWallBaseline.ts:35` declares `affectedStores: []`), so one drag is TWO entries on TWO stacks. That is the exact shape `C85-ELEMENT-WALL.md:305-307` (W-P-3) already carries for the wall-move pair and states *"This MUST become one entry"*; the normative form is W-V-2 (`:418`). Closing it is a wall-family change. |

> ⭐ **§8a — THE ABSENT CASCADE IS THE DESIGN.** Adjacency and stacking are *functions* of two
> prisms. Storing them would be a cache, and a cache is a second answer to a question the geometry
> already answers (C84 EI-9). Every row above that reads "recomputed on read" is a cascade that
> **cannot** fall out of sync, which is why C71 §2.5's *"writing edges nothing reads"* warning does
> not apply to this family.

---

## §9 — VOCABULARIES

| Vocabulary | Members | Rule |
|---|---|---|
| `SPACE_ENVELOPE_ROLES` | `level` · `room` · `maximumBuildable` | CLOSED union with a value roster; a new member is a compile error at every exhaustive switch |
| `AUTHORABLE_SPACE_ENVELOPE_ROLES` | `level` · `room` | the authorable subset; `isAuthorableSpaceEnvelopeRole` is the ONE predicate |
| `SPACE_ENVELOPE_STANDING` | `design-intent` — **one member** | ⭐ a one-member literal so no code path can widen intent into permission without a schema edit a reviewer sees |
| `occupancy` | free `string` | ⚠ **a LICENSED COPY of `RoomOccupancyType`** (~55 members, `@pryzm/room-topology`, L2 — which L0 may not import). Pinned by a test against the room-topology source, the `BoundaryLine.drawMode` pattern, per C84 EI-8a |
| `SpaceEnvelopeRefusalCode` | see §12 | CLOSED union + compile-time completeness assertion + `Record<>`-typed sentence per member |
| Material vocabulary | **NOT MEASURED** — `materialColor` is a raw string today | resolve against C100 before claiming a material story |

> ⛔ **§9a — `UBG_EDGE_TYPES` IS NOT EXTENDED.** ADR-0380 D3, and the measurement that makes it
> cheap: **`UbgNodeSchema.kind` is a free `z.string()`** — *"adapters own the vocabulary, the UBG
> core does not constrain it"*. A new element kind costs the graph **zero schema edits**. What it
> costs is three small rows in the EDITOR: `kindFromId`'s `KNOWN` set (omit it and every envelope
> node renders as the generic label `"Element"`), a `FAMILY_DISCIPLINE` row (bucket `spatial`,
> **both singular and plural keys**), and `CONNECTIVITY_TYPES` **only if** the kind changes room
> connectivity — which an envelope does not.
>
> | relation | kind of fact | home |
> |---|---|---|
> | **within** | AUTHORED | `withinId`, projected onto the **existing `bounds`** edge |
> | **around** (adjacent) | DERIVED | the **existing `adjacentTo`**, projected from geometry |
> | **on top of** | DERIVED | ⛔ **no edge.** Computed on demand |

---

## §10 — GEOMETRY

| Axis | Statement |
|---|---|
| Primitive | a **prism** and only a prism: ring + `baseOffset` + `height`. Not a general solid, not a b-rep |
| Ring convention | OPEN (closing vertex implied), counter-clockwise, `y ≡ 0` **enforced** by `.refine`, not documented — an ignored component is the silent-narrowing landmine C84 EI-2.d names |
| Datum | **level-relative.** `baseOffset` and `height` are measured from the owning level's datum |
| Stack A builder | `@pryzm/geometry-space-envelope` — pure, deterministic, no THREE |
| Stack B producer | the renderer's prism mesh, built from the same ring |
| Proven to agree? | **NOT MEASURED** until both exist. §11 carries it |

> ⚠ **§10a — L-584 IS NOT RE-IMPORTED, AND THE OMISSION IS DELIBERATE.** The ordinance measures the
> rasante **at the façade**; PRYZM samples **one terrain point at the centroid**. A space envelope
> therefore records **no terrain relationship at all** — it is level-relative and says so. Whatever
> answers *"what does this mean against the ground"* must state which datum it used
> (`HEIGHT_DATUM_CAVEAT`, ADR-0377), and that answer does not belong in a field that would make a
> single sampled point look like a measured one. ⛔ **Do not add a `terrainOffset` field.**

> **§10b — THE PROFILE EDITOR IS JOINED, NOT REBUILT.** `WallProfileEditorPort` /
> `WallProfileEditorSubject` are **already generic by port**; the shared surface
> `apps/editor/src/ui/ElevationOutlineSurface.ts` is already reused by `ComponentProfilePanel`; the
> resolver is `ui/ContextualEditBar.ts _profileEditToolFor(type)` over `{slab, floor, ceiling,
> wall}`. The envelope adds a row to that resolver. ⛔ **A new outline surface is forbidden.**

> ⭐ **§10c — THE FACE-MOVE FORKS `WallMoveReweld`'s SHAPE AND THIS IS A FINDING, NOT A PREFERENCE**
> (ADR-0380 D6). Measured: `packages/geometry-wall/src/WallMoveReweld.ts` (2207 lines) has **no type
> parameter anywhere**, its entry field is `wallId`, its authorship bands derive from **wall
> thickness** (`cornerBandM = t/2 + COINCIDENT_M`). The repository's own precedent is decisive:
> curtain walls needed the whole engine **forked** — `CurtainWallMoveReweld.ts` declares a parallel
> vocabulary, and `engineLauncher.ts:1027` states it in its own comment (*"no `CurtainWall`
> reference anywhere in `WallMoveReweld`"*).
>
> **What is REUSED is the CONTRACT**: one command per gesture · a census separating `entries` /
> `refusals` / `notApplicable` · `IMPOSSIBLE | INCUMBENT` refusal grounds · a service that latches
> re-entrancy and coalesces drags. ⛔ **What this forbids is a THIRD shape** — so the next family
> to need this has two matching precedents to generalise from, not two dialects.
>
> **The owed fix, recorded:** give `WallMoveReweld` a real type parameter over `{id, geometry}` and
> prove it on curtain walls first. That is strictly larger than this lane.

---

## §11 — THE DELTA

Ordered. Each item names its invariant and its proof.

| # | Item | Invariant | Proof |
|---|---|---|---|
| **1** | ✅ L0 record + registration | the kind exists in `SCHEMA_REGISTRY`, `ElementType`, `IdFor` | `SpaceEnvelope.parse({})` succeeds; provenance/confidence sweeps pass |
| **2** | ✅ **this contract** | C84 §6 — the family may not be added while its contract is absent | this file + its README row |
| **3** | pure solver `@pryzm/geometry-space-envelope` | prism math, face-move, containment/adjacency/stacking, closed refusal union | unit tests |
| **4** | `spaceEnvelope.batch.create` / `delete` / `move` | ⭐ **one gesture = one undo entry** | a round-trip test that asserts the undo-stack DEPTH, not just the final state |
| **5** | persistence round-trip | every §5 field survives save→load | a test that diffs the full record |
| **6** | `moveFace` + the 3D gizmo | neighbours adapt; inverting the solid REFUSES with both numbers | census test + an interaction |
| **7** | profile edit via `_profileEditToolFor` | reuses `ElevationOutlineSurface`; no new surface | the resolver row |
| **8** | living-graph projection | `bounds` + `adjacentTo`, **no new edge type** | graph test |
| **9** | ⭐ per-face solar via `accumulateRoomHeatGain` | the highest-value unwired asset for this family | a test that the faces receive distinct values |
| **10** | boundary distance + containment findings | ADVISORY, both numbers | test |
| **11** | IFC disposition | §1's open row | an ADR |
| **12** | the INTENDED-area channel, presented beside BUILT | ⚠ **owed to lane RESI-ORCH** — it lives under `apps/editor/src/ui/site/**`, which this lane does not own | — |
| **13** | `WallMoveReweld` type parameter | §10c's owed fix; larger than this lane | — |

---

## §12 — REFUSALS

⛔ **A refusal is a correct answer — an undocumented one is not** (C84 §6). The framework is C83:
the test is **"can context reverse it?"**, never severity, and C83 §1.3 forbids inferring the
verdict from magnitude.

| State | Verdict | Why |
|---|---|---|
| A face move that would **invert or collapse the solid** | ⛔ **IMPOSSIBLE / ENFORCEMENT** — refuses at the command seam | Two mutually exclusive claims about one volume. No site, no brief and no user preference makes a negative-thickness prism correct. C83 §1.2's exact test: *"A rule that can never be wrong may refuse"* |
| `role: 'maximumBuildable'` at create | ⛔ **IMPOSSIBLE / ENFORCEMENT** | An editable legal ceiling is a study a user can drag. `MAXIMUM_BUILDABLE_IS_NOT_AUTHORED` carries the sentence |
| `height <= 0` | ⛔ **IMPOSSIBLE** — schema-level | a zero-height envelope is a footprint pretending to be a volume, and every consumer that divides by it produces a confidently wrong number |
| A **room envelope outside its level envelope** | **INADVISABLE / ADVISORY** — reported, never refused | Buildable and internally consistent. It usually means *the level envelope needs to grow*, which is a design act, not an error. Refusing it makes the containment field a cage instead of a relationship |
| A **level envelope outside the maximum buildable volume** | **INADVISABLE / ADVISORY** — reported, never refused | ⭐ **the decisive one.** The maximum buildable volume is a **STUDY, not a permit** (C58/C74/C75). Refusing an architect's edit on the authority of a study PRYZM computed would tell a professional they may not draw something they may well be entitled to build — and is *"the fastest route to being muted"* (C83 §5) |
| Envelopes overlapping in space | **FINE** | overlapping study volumes are a normal design state |
| `promoteToRoom` | **NOT SUPPORTED (deferred)** | C80's *"may this pass replace this?"* question; Stage H |
| IFC export | **EXCLUDED** | §1's IFC row is unresolved; an unmapped family is skipped, never approximated |

> ⭐ **§12a — EVERY REFUSAL AND EVERY ADVISORY CARRIES BOTH NUMBERS**, read from the geometry and
> never re-typed — the founder's standing direction and C74's requirement:
> *"this face would put the envelope **1.42 m** outside the level envelope, whose nearest face is at
> **8.10 m**."*

> ⛔ **§12b — THE ENFORCEMENT ROW IS A C74 §2 CONTRACT EDIT.** C83 §1.1.1: *"C74 §2's protected
> table names exactly one ENFORCEMENT row today … A second one is a C74 §2 contract edit, in the
> same PR — it is not a code change with a doc follow-up."* Recorded here as owed; see §14.

> **§12c — the refusal vocabulary EXTENDS, it does not rival** (C83 §1.4). `SpaceEnvelopeRefusalCode`
> is a separate closed union rather than new `CanPlaceRefusalCode` members, because `canPlace` is
> about **wall occupancy**, and a code about envelope solidity in that union would widen a wall
> concept to mean "any spatial refusal".

---

## §13 — GATES

| Gate | Applies how |
|---|---|
| `check-domain-purity.ts` (P5) | `SpaceEnvelope.ts` is L0-pure: Zod + plain TS, zero I/O, zero THREE, zero DOM, **no OTel span** (a span is I/O) |
| `check-three-imports.ts` (P2) | `@pryzm/geometry-space-envelope` MUST NOT import THREE |
| `check-otel-spans.ts` (P8 ZONE A) | every `spaceEnvelope.*` CommandBus handler carries ≥1 span — zero tolerance |
| `check-layer-boundaries.ts` | the geometry package sits at L1/L2 and may not import L3+ |
| `check-no-direct-store-writes.ts` (P6) | UI dispatches through `commandBus`; ⛔ this family adds **zero** new tolerated direct writes |
| `check-contract-index-equivalence.ts` | ⭐ this file needs a **README row in the same commit** — arm A (FILE-WITHOUT-ROW) is a shrink-only ratchet and a row-less file breaches it |
| `check-provenance-coverage` | satisfied by `provenance` + `confidence` declared at the point of use in the `defineElement` call |

---

## §14 — STATUS (living record — appended, never rewritten)

### 2026-09-04 · lane ENVELOPE-ELEMENT

| Delta item | State |
|---|---|
| 1 — L0 record + registration | ✅ **SHIPPED** (`8f7d47e9`) |
| 2 — this contract + README row | ✅ **SHIPPED** |
| 3–13 | see the commits that follow this one; **anything not listed as shipped here is NOT shipped** |

⛔ **§14a — THE REPORTING RULE FOR THIS FAMILY.** Per §0.1 and §0.2: a schema, a contract and a
TO-BE table are **not** an element. Until §11 item 4 has a test asserting undo-stack DEPTH and item
5 has a persistence diff, the honest sentence is *"the family is contracted and its record is
registered"* — never *"the envelope is a first-class element"*.

⛔ **§14b — OWED TO OTHER LANES, recorded so it is not silently dropped:** delta item 12 (the
INTENDED-vs-BUILT presentation) lives under `apps/editor/src/ui/site/**` and belongs to lane
RESI-ORCH; delta item 13 (`WallMoveReweld` type parameter) is larger than this lane; §12b (the
C74 §2 ENFORCEMENT row) must land with the `moveFace` handler.

### 2026-09-05 · lane RESI-STAGE-G — rooms become a first-class part of the family

Appended per §14's own rule (*living record — appended, never rewritten*). Every row below
names its commit and its measurement; **anything not listed here is NOT shipped.**

| Delta item | State | Commit | Proof |
|---|---|---|---|
| 6 — `moveFace` neighbours adapt · containment refuses | ✅ **SHIPPED** | `4ad339c1` | `packages/geometry-space-envelope` 64/64 · `plugins/space-envelope` 34/34 |
| 10 — containment findings, both numbers | ✅ **SHIPPED, and NO LONGER ADVISORY for `room ⊂ level`** — see §14c | `4ad339c1` | the refusal carries the excursion asked and the permitted delta, the latter BISECTED against the real planner |
| 12 — the INTENDED-area channel | ✅ **EXTENDED** — rooms listed by name under their level, never summed | `8dd10fce` | `designStageWire.spec.ts` 38/38, incl. `intendedAreaM2 === 180` with 46 m² of rooms present |
| 3 (render) — per-room colour + label, translucent level | ✅ **SHIPPED (resolver measured, meshes NOT)** | `9f4140c0` | `spaceEnvelopeAppearance.spec.ts` 12/12 |
| 7 (plan) — §3's *zero consumers* row is now WRONG for plan | ✅ **SHIPPED (geometry measured, injection NOT)** | `d2c3748f` | `spaceEnvelopePlanGeometry.spec.ts` 9/9 |
| 7 (profile edit via `_profileEditToolFor`) | ⛔ **NOT SHIPPED** | — | no `spaceEnvelopeTool`, no double-click, no resolver row |
| 11 (IFC) · 13 (`WallMoveReweld` type parameter) · §12b (the C74 §2 ENFORCEMENT row) | ⛔ **STILL OWED** | — | — |

#### §14c — ⚠ THE `room ⊂ level` ROW OF §12 IS SUPERSEDED. THE DECISIVE ROW IS NOT.

§12 lists *"a room envelope outside its level envelope"* as **INADVISABLE / ADVISORY —
reported, never refused**, and the L0 schema says the same on `withinId`. The founder's
`STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §12` rules that a room *"stays constrained within the
level envelope"*, so **that one row is now ENFORCEMENT**: six verbs (`batch.create`,
`move`, `moveFace`, `setFootprint`, `setParameter`, `setWithin`) refuse through one gate,
with both numbers, and **never clamp**. Ground `INCUMBENT`, not `IMPOSSIBLE` — grow the
level and the same request is legal.

⛔ **The decisive row — a LEVEL envelope outside the permitted STUDY — is UNCHANGED and
stays ADVISORY.** That volume is a study and not a permit (C58/C74/C75); no code in this
lane reads a `BuildableEnvelope`. §12b's C74 §2 contract edit is still owed and is
**not** discharged by this entry.

#### §14d — WHAT IS **NOT** TRUE TODAY, STATED SO A GREEN SUITE IS NOT MISREAD (§0.2)

- ⛔ **NOTHING IN THIS LANE IS BROWSER-VERIFIED.** No prism, colour, label, plan stroke,
  refusal toast or adapted neighbour has been seen on screen. Every claim above rests on
  unit tests over pure modules and handler seams.
- ⛔ **The plan INJECTION path is unmeasured.** `spaceEnvelopePlanGeometry` is pinned;
  `EdgeProjectorService` → `TechnicalDrawing` → `PlanViewCanvas` is not driven by any test.
- ⚠ **`penCategoryForLayerTag` has no `A-AREA` arm**, so plan linework takes the generic
  fallback pen. The ISO row exists (`ISO_LAYER_TO_VG_CATEGORY` → `spaceEnvelope`); the pen
  does not.
- ⚠ **The per-room colour does not reach plan.** The pen table is the one style authority
  for a drawing (Contract 23 §7.1), so *"fills"* in plan are a HATCH, not a colour wash.
- ⚠ **The plan reader resolves `baseElevation: null`** (harmless top-down; a future
  SECTION producer must not inherit it) because `initTools` owns the elevation lookup and
  another lane held that file.
- ⚠ **The mesh and sprite half of the render commit has no test** — only the appearance
  resolver does. No WebGL context was stood up.
- ⚠ **Neighbour adaptation is ROOM subject + SIDE face only.** A level face refuses on
  orphaning and adapts nothing; top/bottom faces have no shared-face path. A neighbour
  that could not follow is reported on the span and in `console.warn` — **there is no
  user-facing surface for `undetermined`.**
- ⚠ **Envelope labels cannot be switched off** — no toggle, no per-level filter, unlike
  `RoomLabelRenderer`.

⭐ **THE MEASUREMENT THAT CORRECTED ITSELF, RECORDED RATHER THAN TIDIED.** Two containment
assertions were authored reading `94.00 m` / `96.00 m` — hand-derived per-axis overhangs —
and FAILED. The excursion is `checkEnvelopeContainment(...).worstExcursionM`, a **Euclidean
distance to the ring** (94·√2 = 132.94 m; 100·√2 = 141.42 m), because C84 EI-9.2 forbids a
second containment test. **The assertions were corrected to the measured number; the
geometry was not tuned to the expectation** ([[tolerance-from-measured-error-not-the-test]]).

### 2026-09-06 · lane RESI-STAGE-G — **item 7 (profile edit) closes; §11 is now 7 of 13**

Appended per §14's own rule (*living record — appended, never rewritten*). The
2026-09-05 entry above recorded item 7 as ⛔ **NOT SHIPPED** with the reason *"no
`spaceEnvelopeTool`, no double-click, no resolver row"*. **All three now exist.** Every
row below names its commit and its measurement; **anything not listed here is NOT
shipped**, and §14a's reporting rule applies to this entry in full.

| Delta item | State | Commit | Proof |
|---|---|---|---|
| 7 — the footprint ↔ authoring-frame map | ✅ **SHIPPED** | `c0649f6c` | `pnpm --filter @pryzm/geometry-space-envelope test` → **5 files, 77 passed** (64 before; 13 new) |
| 7 — `SpaceEnvelopeProfileEditTool` + the `setFootprint` write-back | ✅ **SHIPPED** | `bcf8a9a6` | `spaceEnvelopeProfileEditTool.spec.ts` **17/17**; `pnpm --filter @pryzm/plugin-space-envelope test` → **3 files, 39 passed** (34 before; 5 new) |
| 7 — REACHABILITY: resolver row · `window.spaceEnvelopeTool` · double-click | ✅ **SHIPPED** | `e6395f8b` | `spaceEnvelopeProfileEditWire.spec.ts` **9/9**, asserting each static link from source |

**What the three commits actually did, stated so the claim can be checked rather than
believed.** §10b's rule — *"THE PROFILE EDITOR IS JOINED, NOT REBUILT … ⛔ A new outline
surface is forbidden"* — was honoured: **no surface, no dialog and no drawing code was
written.** `ElevationOutlineSurface` and `WallProfileEditor` are reached through the
existing `WallProfileEditorPort`, and the whole of the new drawing-side code is an affine
map between a world X/Z footprint and the surface's clamped `u`/`v` box, plus a tool that
opens the port and dispatches one command. The commit path is
**`spaceEnvelope.setFootprint`**, which already re-asks `containmentGate` — so *"rooms
re-check containment after a level edit"* is discharged by the handler that existed, not
by a second test here (C84 EI-9.2).

**⭐ TWO DEFECTS WERE DESIGNED OUT THAT WOULD HAVE BEEN IN-BOUNDS AND SILENT**, and they
are recorded because both are the shape this contract keeps logging:
- **The `v` axis is FLIPPED against world Z.** The surface paints `v` upward; a plan reads
  with +Z down the page. Without the flip every vertex is still inside the box and the
  author edits a **mirrored** footprint — a well-formed wrong answer with no symptom.
- **The drawing box is the bbox GROWN by a headroom rule**, because the surface *clamps*
  every dragged vertex to the extents. A box fitted to the bbox makes the editor
  **shrink-only** with nothing anywhere saying why. ⛔ **Headroom is not permission:** the
  command still refuses a ring that leaves its level, with both numbers.

#### §14e — ⛔ WHAT IS **NOT** TRUE OF ITEM 7 TODAY

- ⛔ **NOTHING IN THIS LANE IS BROWSER-VERIFIED, AND THAT IS UNCHANGED FROM §14d.** No
  dialog has been opened on screen, no face has been double-clicked, no refusal has been
  seen in a toast or a status line. The port is a **fake** in the tool spec, and the wire
  spec reads **source**, not behaviour. A green suite here is evidence that the pieces
  agree with each other, not that a user can do this.
- ⚠ **The "Edit Profile" BUTTON path is only half measured.** The resolver row and the
  window handle are asserted; whether a selected envelope reaches `ContextualEditBar` with
  `elementType === 'spaceEnvelope'` is **NOT MEASURED**. `SpaceEnvelopeMeshBuilder` stamps
  `elementType: 'spaceEnvelope'` and `selectable: true` on the group and `selectable:
  false` on the faces, so it is *plausible* — and plausible is what §15 is for. **The
  double-click is the path that does not depend on it.**
- ⚠ **"Reset to rectangle" GROWS the outline.** The modal's button fills the drawing box,
  which for a footprint is the bbox **plus the headroom**. The result is legal and is still
  judged by containment, but it does not restore anything. Recorded rather than hidden.
- ⚠ **`WallProfileEditorSubject.wallId` still carries a space-envelope id**, and the panel
  still stamps `data-wall-id`. The port is generic in every way that matters except that
  NAME. Renaming it touches L2, `WallTool`, the modal and its byte-pinned chrome test —
  **the same shape as §10c's owed `WallMoveReweld` type parameter**, and larger than this
  lane. ⛔ Do not read the name as evidence a wall is involved; ⛔ do not add a second port.
- ⚠ **`title` was added to `WallProfileEditorSubject` (optional, L2).** Absent means the
  wall sentence **byte for byte** — `wallProfileEditorChrome.test.ts` still reads
  **30/30**, including its exact-string assertion at `:285`. The envelope supplies its own
  because a footprint is *wide and deep*, not *long and high*, and a dialog that calls a
  storey outline a wall is the §0.2 naming defect one layer out.
- ⛔ **There is no plan-view or elevation entry to the editor, and no keyboard shortcut.**
  The two ways in are the 3-D double-click and the toolbar button.

⭐ **§11 IS NOW 7 OF 13, NOT DONE.** Items **8** (living-graph projection), **9** (per-face
solar), **11** (IFC disposition), **12** (the INTENDED-vs-BUILT *presentation* — the
channel shipped, the presentation did not) and **13** (`WallMoveReweld` type parameter)
remain, and §12b's C74 §2 ENFORCEMENT row is **still owed**.

### 2026-09-06 · lane PL-ENVELOPE-AUTHORING — the family acquires a CREATE surface, and its footprint acquires the three authoring modes

Appended per §14's own rule (*living record — appended, never rewritten*). Every row names its
commit and its measurement; **anything not listed here is NOT shipped**, and §14a's reporting rule
applies to this entry in full.

| Delta item | State | Commit | Proof |
|---|---|---|---|
| ⭐ A USER-REACHABLE CREATE GESTURE — footprint × N storeys → ONE `spaceEnvelope.batch.create` | ✅ **SHIPPED** | `9d4ee67f` | `envelopeAuthoringPlan.spec.ts` **21/21** · `parcelLawEnvelopeAuthoring.spec.ts` **18/18** |
| The storey-count verdict against `maxFloors` — **ADVISORY, per §12's decisive row** | ✅ **SHIPPED** | `9d4ee67f` | asserted BOTH ways: the plan is produced, the envelope count is NOT clamped, and both numbers are carried as values |
| The LIVE law check — implantation used · GFA used · remainder per floor · BRUT/NET | ✅ **SHIPPED** | `9d4ee67f` | the founder's 1,200 / 200 / 320 worked example reads *"allocated 200 of the 320 total, so 120 m² remains for the floors above"* |
| 7 (profile edit) — **the three DRAWING modes reach the envelope**: straight · orthogonal · curved | ✅ **SHIPPED** | `8279e0d0` | `wallProfileEditorDrawModes.spec.ts` **7/7** · `wallProfileEditorChrome.test.ts` **30/30 unchanged** · `spaceEnvelopeProfileEditTool.spec.ts` **18/18** (17 before) |

**§14f — ⭐ THE MODES EXISTED AND WERE UNREACHABLE, WHICH IS NOT THE SAME AS MISSING.**
`ElevationOutlineSurface` has declared `'polyline'`, `'arc'` and ABSOLUTE `orthoOn` since
§OUTLINE81 (its header, `:18-24`), and `WindowOutlineEditorDialog` builds all three controls
(`:100-101`, `:131`). The wall modal — the one §14's item 7 joined this family to — *"simply never
leaves `select` mode, which is how it keeps byte-identical behaviour"*. So the founder's
*"CURVED LINES, STRAIGHT LINES, OR ORTHOGONALS"* was present in the surface and could not be
reached through the only dialog that opens it. The fix is **one optional subject flag**
(`WallProfileEditorSubject.drawModes`, the exact precedent of `title` recorded in §14e), a mode bar
built only when it is set, and `drawModes: true` on the envelope's subject. ⛔ **No outline surface
was written — §10b is honoured to the letter.** ⛔ **And it grants nothing:** an arc-authored ring
is still judged by `spaceEnvelope.setFootprint` and `containmentGate`, with both numbers.

**§14g — WHAT THE CREATE SURFACE IS AND IS NOT.** It is on the **Parcel Law tab**
(`apps/editor/src/ui/analysis/parcelLawEnvelopeAuthoring.ts`), between the fact section and the
live quantities, which is the founder's own stage ladder. It COMPUTES NOTHING: the parcel and
ordinance figures come from `resolveParcelLawModel` (§25.11 clause 1's ONE model), the permitted
RING from `resolveParcelLawEnvelope` (extracted from that same reader, so no second *"which
envelope is current"* rule exists), the BRUT/NET arithmetic from `brutAreaAllocation.ts` — **which
had ZERO production callers before this commit** — and what is drawn from `collectIntendedAreas`.
⛔ It is not a generator: it extrudes a ring the user chose over storeys the user typed, which is
STR §25.0's *"guide this process WITHOUT BUILDING THE HOUSE IN ONE CLICK"*.

#### §14h — ⛔ WHAT IS **NOT** TRUE OF THIS ENTRY

- ⛔ **NOTHING IN THIS LANE IS BROWSER-VERIFIED, unchanged from §14d and §14e.** No envelope has
  been created on screen, no arc drawn with a pointer, no remainder watched to move. The bus, the
  store and the profile-edit port are FAKES OF THE SEAM. What the draw-mode cases add over §14e's
  source-reading wire spec is real clicks on real buttons in happy-dom — stronger, still not a browser.
- ⚠ **EACH STOREY IS ITS OWN ELEMENT, so editing one storey's perimeter does NOT move the others.**
  There is no linked-footprint concept in this family and none was invented. The section says so
  where the buttons are, rather than letting a user discover it.
- ⚠ **THE LAW-CHECK TABLE'S WORDING WAS WRITTEN FOR A TYPED TARGET, NOT A DRAWN ONE.**
  `buildBrutAllocation` says *"Nothing was allocated here"* on a refused row; here the "request" is
  an area the user already DREW, so the honest reading is *"this storey is outside the allowance"* —
  the envelope is neither deleted nor clamped. A lede sentence states that in the open; the
  underlying strings are unchanged, and the seam is logged rather than tidied away.
- ⛔ **`spaceEnvelopeReachableThroughComposedRuntime.test.ts` ARM F and ARM G are RED at HEAD, and
  they PREDATE this lane.** Its fixture creates a room ring at x 1…5 / z 1…5 inside a level ring at
  x 0…4 / z 0…4, which §14c's `room ⊂ level` ENFORCEMENT (landed `4ad339c1`, gate last touched
  `224cfeff`) now refuses at `canExecute` with *"asks for 1.41 m; the limit is 0.00 m"* — the gate is
  behaving exactly as this contract says it must, and the FIXTURE is what is stale. Neither file is
  touched by this lane's commits. **The persistence half of §11 item 5 is therefore currently
  unproven by a running test, and that is worse than it looks: ARM G is the SAVE→RELOAD arm.**
- ⚠ **The create surface reads `maxFloors` from the parcel-law model, so it inherits that model's
  silence.** Where the ordinance is untranscribed (the founder's Córdoba parcel) the section is
  fully authorable and every compliance figure reports UNKNOWN with its named reason — never zero,
  never unbounded (C58 §1.4 / L-616).

---

### 2026-09-07 · lane MASSING-REPLACE — choosing another massing option REPLACES (L-13038)

Appended per §14's own rule. **Anything not listed here is NOT shipped.**

| Delta | State | Proof |
|---|---|---|
| `supersedes` on `spaceEnvelope.batch.create` (§6d) | ✅ **SHIPPED** | `spaceEnvelopeRoundTrip.test.ts` — *"replaces the previous envelope and spends exactly ONE undo entry"* asserts `undoStack.size` **2, not 3**, then undoes ONCE and finds the previous envelope back and the new one gone |
| `provenance` passthrough on the create spec (§6d clause 5) | ✅ **SHIPPED** | same suite: a caller's `computed` reaches the record; a caller that says nothing lands on `predates-provenance`, never an invented origin |
| Removal shares ONE implementation with `spaceEnvelope.delete` (§8) | ✅ **SHIPPED** | `removeEnvelopesFromDraft`; the room survives its level being superseded with `withinId` cleared |
| The REPLACE-vs-REFUSE judgement | ✅ **SHIPPED (surface side)** | `apps/editor/src/ui/site/levelEnvelopeSupersession.ts` + its spec: generated ⇒ replace · authored ⇒ **refuse, delete nothing** · unknown origin ⇒ **refuse** · other storeys untouched · unreadable store ⇒ refuse |
| The card states the consequence BEFORE the click | ✅ **SHIPPED** | `designStageWire.spec.ts` — the `replace` intent line, and the `refuse` arm that WITHHOLDS the button and prints the reason |

⚠ **NOT SHIPPED, and named so it is not mistaken for done:**

- **The multi-storey authoring control (`parcelLawEnvelopeAuthoring.ts` → `envelopeAuthoringPlan.ts`)
  still ACCUMULATES.** It dispatches the same verb and now *could* pass `supersedes`, but it does
  not: pressing "Create" twice leaves two level envelopes per storey. Same founder ruling, same
  plumbing, different surface — logged rather than half-done.
- **`spaceEnvelope.setFootprint` / `moveFace` / `move` do NOT stamp `authored`.** So an envelope
  PRYZM generated and the user then hand-edited still reads `computed` and **is replaceable**. The
  §6d clause-4 protection is therefore complete only for envelopes the user *created*, not for ones
  they *edited*. ⛔ Until those verbs record the human decision (C75 §2.2), a hand-edited plate can
  be replaced by a later massing option, which is precisely the loss §6d exists to prevent.

---

---

---

### 2026-09-07 · lane WALLS-FOLLOW-WIRE — **the envelope stops being a drawing: the building inside it follows**

Founder: *"THE ENVLOPE BEING EXTENDED ON PRYSM 3D VIEW SHOULD MEANS THE CONTEXT WALLS - PERIMETER
WALLS SHALL FOLLOW AND THEE INTERIOR PARTITIONS TOO - AS PER BIM3.0 PRINCIPALS"*

`3c04d040` landed the PLANNER and said, in its own message, that whether the founder could drag a
face and watch his partitions move was **not established**. This lane is that join. SPEC:
`docs/03-execution/specs/SPEC-ENVELOPE-WALLS-FOLLOW.md`. Rows: **L-13115 · L-13116 · L-13117 ·
L-13118**.

⭐ **THE ONE FINDING WORTH CARRYING FORWARD: A PARTITION IS NOT BOUNDED BY THE THING THE POINTER
GRABBED.** `buildFromDesignPlan.ts:631` writes `envelopeRole: 'room'` on every partition's
`derivedFrom`; shell walls carry `'level'`. So the committed event's two rings — the SUBJECT's —
could move the perimeter and could **never** move a partition, however the cascade downstream was
written. The rooms *do* move, in the same patch pair (§8's corrected `moveFace` row); their new
rings were dying inside the gesture. `SpaceEnvelopeFaceMoveCommitted.adapted` now carries them, and
`mergeSpaceEnvelopeWallFollowPlans` folds N per-envelope plans into ONE dispatch — which is what
keeps **§6a** (one gesture, one undo entry) true at thirteen envelopes instead of thirteen commands.

⛔ **AND ONE REACHABILITY DEFECT THE UNIT TESTS COULD NOT SEE (L-13115).** The consumer was armed
BELOW `attachSpaceEnvelopeRender`, which derefs `world.renderer.three` with no `try` — so on any
boot where the THREE viewport was not up, the 3-D Site's face drag raised its event into an empty
listener set and the founder would have been told nothing. Hoisted, and the ORDER is now pinned
**together with its premise** in `spaceEnvelopeWallFollowWire.spec.ts`.

**C80 — the decision, stated so it is not re-litigated:** a wall follows **iff its current baseline
still spans the whole of the edge it came from**, within a declared 0.05 m. Anything else — hand
moved, split, trimmed, welded at generation — is treated as `protected`, left alone, and **named
with both numbers**. Two new rules join it: a wall two moved envelopes place *differently* is
DROPPED as `contested-by-two-envelopes` (never resolved by entry order, which is C80's forbidden
silent overwrite through the back door), and only a `'primary'` link claim may move a wall — an
`'also'` claim planned would have told the user *"you moved this by hand"* about a wall nobody
touched.

**Measured, not asserted:** 13 envelopes / 112 link rows / 112 entries → **0.55 ms**, once, at
pointer-up; **0 ms per pointer-move**, structurally (the cascade runs on the pointer-UP handler and
the rooms are read inside the drag's existing preview loop). §PERF-WALL-MOVE-INCREMENTAL-REBUILD
(L-234/L-250) is avoided by shape.

⚠ **STILL NOT TRUE, AND NAMED:** dragging the TOP face does not make the walls taller (L-13118 —
the verb exists, the event field does not); walls follow only where the semantic graph RECORDED
them, and `recordEnvelopeWallLinks` has exactly ONE caller (L-13117 — the durable fix is C80's own
`ElementProvenanceIndex`, which nothing calls); and **nothing here is browser-verified** (§14d).

---

## §15 — NOT MEASURED

Recorded as findings, per C84 §6's rule that an unverified claim is a finding rather than a gap:

1. **The IFC mapping.** `IfcSpatialZone` is plausible; nothing is measured. The family is excluded
   from IFC export until an ADR resolves it.
2. **GLB export and the bake worker** — no disposition measured.
3. **Whether Stack A and Stack B agree** — neither exists yet.
4. **The material vocabulary** (C100) against `materialColor`.
5. **Whether `RoomOccupancyType`'s ~55 members are all meaningful for an envelope.** The licensed
   copy is pinned by a test for *equality*, which does not establish *fitness*.
6. **Performance at scale.** C66 §1's rule applies: no capacity tier may be described as supported
   while it is CLAIMED. No envelope count has been measured.
