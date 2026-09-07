# SPEC-ENVELOPE-WALLS-FOLLOW — the building inside the envelope follows the envelope

**Status:** SHIPPED (perimeter + partitions) · **Lane** WALLS-FOLLOW-WIRE, 2026-09-07
**Governs:** `apps/editor/src/engine/spaceEnvelopeWallFollow*.ts`, the `adapted` field on
`SpaceEnvelopeFaceMoveCommitted`, and the one install site in `initTools.ts`.
**Binds to:** C114 §6a / §8 · C80 · C16 · C84 EI-9 · P6 · P8 · L-13115 · L-13116 · L-13117 · L-13118

> Founder, verbatim: *"THE ENVLOPE BEING EXTENDED ON PRYSM 3D VIEW SHOULD MEANS THE CONTEXT WALLS -
> PERIMETER WALLS SHALL FOLLOW AND THEE INTERIOR PARTITIONS TOO - AS PER BIM3.0 PRINCIPALS"*

---

## §0 — WHAT THIS IS, IN ONE SENTENCE

A committed face drag on an authored space envelope moves the walls PRYZM derived from that
envelope — **and the walls it derived from every room the same commit moved** — in **one**
`wall.cascadeBaseline`, without overwriting anything the user authored by hand.

### §0.1 — ⛔ THE HONEST STATUS, so nothing here reads as more than it is

| Claim | State | Where it is proved |
|---|---|---|
| the perimeter follows a side-face drag | **SHIPPED** | `spaceEnvelopeWallFollow.spec.ts` |
| interior partitions follow when their ROOM moved | **SHIPPED** | same file, `§ENVELOPE-PARTITIONS-FOLLOW` block |
| one drag = one `wall.cascadeBaseline` | **SHIPPED** | same file, `toHaveLength(1)` at 13 envelopes |
| one drag = one **undo entry** | ⛔ **NO — two, on two stacks** | see §6, and C85 W-P-3 |
| walls get taller when the roof is dragged | ⛔ **NO** | L-13118, refused by name |
| walls follow on a building PRYZM did not build from a design | ⛔ **NO** | L-13117, refused by name |
| any of it works in a browser | ⛔ **NOT VERIFIED** | C114 §14d — nothing in this family is |

---

## §1 — THE SHAPE: FOUR FILES, ONE OF WHICH DECIDES EVERYTHING

```
spaceEnvelopeDragSurface.ts        the GESTURE. Raises ONE event per committed drag, carrying the
                                   subject's two rings AND every adapted room's two rings.
        │  pryzm:spaceEnvelope:faceMoved
        ▼
spaceEnvelopeWallFollow.ts         the WIRE. Reads links + wall baselines, calls the planner once
                                   per moved envelope, merges, dispatches ONE command. Decides
                                   nothing.
        │
        ▼
spaceEnvelopeWallFollowPlan.ts     ⭐ THE BEHAVIOUR. Pure: no store, no bus, no DOM, no THREE, no
                                   clock, no RNG. The C80 rule, the refusals, the merge, and the
                                   sentence the user reads all live here.

spaceEnvelopeWallFollowComposition.ts   the only file that knows the real singletons.
```

⭐ **The split is the point, not an organisational preference.** The C80 decision has to be
drivable with no graph, no store and no runtime, or it cannot be tested at all — and a decision
about destroying the user's work that is only tested through a renderer is not tested.

---

## §2 — THE INPUT: WHY THE EVENT CARRIES RINGS AND NOT A DELTA

`spaceEnvelope.moveFace`'s payload is `{face, deltaM}` — **relative** to whatever solid the store
holds when it runs. A consequence handler seeing only the delta could not compute where a derived
wall should land without re-deriving the subject's geometry, and a second derivation of one
geometry is the C84 EI-9 hazard. So both rings travel with the event, in the same project-frame
scene-XZ metres the record is authored in.

### §2.1 — ⭐ AND WHY IT ALSO CARRIES THE ROOMS (the finding this spec exists for)

**A partition is not bounded by the envelope the pointer grabbed.**
`buildFromDesignPlan.ts:631` writes `envelopeRole: 'room'` on every partition's `derivedFrom`;
shell walls carry `'level'`. ⇒ The subject's two rings can move the **perimeter** and can **never**
move a **partition**, however the cascade downstream is written.

The rooms *do* move — `SpaceEnvelopeContext` adapts every room a moved level would strand, and
`MutateSpaceEnvelope.ts:238-260` writes them in the **same patch pair** as the subject. Their new
rings were simply dying inside the gesture. `SpaceEnvelopeFaceMoveCommitted.adapted` carries them.

⚠ **`ringBefore` for a room is captured DURING the drag, not after it.** `deps.dispatch` runs
*before* the committed event is raised, so a read taken at commit time could already be the moved
ring — and a `ringBefore` equal to `ringAfter` reads as *"this room did not move"* rather than as a
bug. First sight wins, per room, and is never re-read.

---

## §3 — ⭐ THE C80 DECISION: FOLLOW, STAY, OR CONTEST — never a silent overwrite

> **A WALL FOLLOWS IFF ITS CURRENT BASELINE IS STILL THE WHOLE OF THE EDGE IT CAME FROM**, compared
> against that envelope's ring **as it stood at the start of this drag**, in either direction,
> within `toleranceM` (declared 0.05 m, injectable).

| Situation | Answer | The user is told |
|---|---|---|
| baseline still spans its edge | **FOLLOW** | counted in the summary |
| drifted / split / trimmed / welded | **STAY** — `authored-since-generation` | ⭐ named, **with both numbers** (the drift and the threshold) |
| the wall is gone (an undone batch leaves rows behind) | STAY — `wall-no-longer-exists` | named |
| `edgeIndex: -1`, or out of range | STAY — `edge-index-*` | named |
| that edge did not move | STAY — `edge-did-not-move` | not counted as a problem |
| ⭐ **two moved envelopes place it DIFFERENTLY** | **STAY** — `contested-by-two-envelopes` | named **and toasted** |
| no link row at all | not touched, not counted | — outside the clear-set entirely |

### §3.1 — the three rules that make the above safe

1. **A drifted wall does not refuse the whole gesture.** Blocking a face drag because one of forty
   walls was hand-moved would make the founder's main gesture hostage to a single edit. The
   thirty-nine follow, the one stays, and the user is told which.
2. **A contested wall is DROPPED, never resolved by ordering.** `CascadeWallBaselineCommand`
   applies its entries in order, so two entries for one wall would be a silent last-write-wins —
   C80's forbidden outcome arriving through the back door.
3. ⭐ **Only a `'primary'` link claim may move a wall.** `buildFromDesignPlan.ts:641-643` records a
   room's claim on a shell wall *"it only PARTLY covers"* as `'also'`. Planning that would find the
   wall does not span the room's edge and would report `authored-since-generation` — i.e. tell the
   user *"you moved this by hand"* about a wall nobody has touched. An **absent** claim still
   passes: unstated is not secondary.

### §3.2 — ⚠ where this is a PROXY, said out loud

Drift is a proxy for provenance, not provenance. C80 §10.c is explicit that an assertion no field
supports is `unknown-authority` (§2.5), and this planner resolves that toward **protection**, which
is the direction §2.3/§10.b require. The real instrument is `mayRegenerate` /
`planRegenerationClear` in `ElementProvenanceIndex.ts` — which **exists and which nothing calls**
(C80 §0.1(4)) — and it is blocked on walls having no durable per-element provenance (L-13117).

---

## §4 — WHICH PARTITIONS MOVE, AND WHICH DO NOT (the model's answer, not a gap)

A room enters `plan.adapted` **only when the moved level would otherwise strand it** —
`SpaceEnvelopeContext.ts:422` skips every room still contained. Therefore:

| Gesture | Perimeter | Partitions |
|---|---|---|
| level face pulled **OUTWARD** | follows | **do not move — because no room moved** |
| level face pushed **INWARD past a room** | follows | that room's partitions follow |
| a ROOM's own face dragged | (unchanged) | that room's partitions follow; a sibling sharing the face adapts too |
| **top / bottom** face dragged | nothing moves | nothing moves — L-13118 |

⛔ **Partitions track ROOMS.** That is what BIM 3.0 provenance means, and wiring them to the level
directly would be a well-formed wrong answer: it would move a partition the room it belongs to did
not move.

---

## §5 — PERFORMANCE — MEASURED, with the real markers

⛔ **First, a citation correction that keeps being needed: there is no `§REALTIME-EDIT-PERF` in
this repo, and `ADR-057` is a dangling number.** The live markers are
`§PERF-WALL-MOVE-INCREMENTAL-REBUILD` (L-234 / L-250, `WallRebuildCoordinator.ts:1834`) and
`§PERF-WALL-DRAG-DEFER` (ADR-061).

| Quantity | Reading |
|---|---|
| walls rebuilt **per pointer-move** | **0** — structurally: the cascade runs on `SPACE_ENVELOPE_FACE_MOVED_EVENT`, raised in `finish` (the pointer-UP handler), and the rooms are read inside the drag's **existing** neighbour-preview loop |
| cascades per drag | exactly **1** |
| commands per drag | exactly **1** |
| ⭐ **plan + merge, 13 envelopes / 112 link rows / 112 entries** | **0.55 ms**, once, at pointer-up (measured in `spaceEnvelopeWallFollow.spec.ts`; the in-test bound is a loose 50 ms **regression tripwire**, not a bench) |
| the one `WallJoinResolver.resolveLevel` the cascade then triggers | ~207 ms at 200 walls on the level — ⚠ **L-234's bench, NOT re-measured here** |

⇒ The planning half this lane added is noise against the solve the cascade was always going to pay.
If a drag ever feels slow, that solve is where to look — it is the same one the Move tool already
pays on every neighbour-carrying move, and `resolveLevel` being incremental is deferred (ADR-0099).

---

## §6 — ⚠ THE UNDO COUNT IS **TWO**, AND THAT IS AN INHERITED VIOLATION

| | entry |
|---|---|
| `spaceEnvelope.moveFace` | ONE ring-buffer entry — subject **and** every adapted room in the same patch pair |
| `wall.cascadeBaseline` | a SECOND entry, on the **LEGACY** stack (`CascadeWallBaseline.ts:35` declares `affectedStores: []`) |

So Ctrl+Z once puts the walls back, twice puts the envelope back.

⛔ **This is exactly the defect `C85-ELEMENT-WALL.md` already carries and names.** W-P-3
(`:305-307`) states it for the wall-move pair — *"One user gesture, two lineages, two undo stacks
(C84 §4B). **This MUST become one entry.**"* — and the normative form is W-V-2 (`:418`). This
cascade reproduces that shape with `spaceEnvelope.moveFace` in the role `wall.updateBaseline` plays
there. **It is not new and it is not fixed here**: closing it means giving
`CascadeWallBaselineHandler` a real patch pair, a wall-family change under W-V-2.

⭐ **What C114 §6a actually forbids is FORTY entries for forty walls**, and that is what the merge
buys: thirteen envelopes moving is still ONE `wall.cascadeBaseline`.

---

## §7 — REACHABILITY (L-13115), and why it has its own section

The consumer is installed **once, on the runtime** — not once per surface. The event is raised by
the GESTURE, on whichever surface it ran, so one registration covers the BIM 3-D viewport and the
3-D Site, and a third surface needs no wiring. Installing per surface would be N copies of the C80
decision (C84 EI-9) and N cascades for one drag.

⛔ **AND ITS POSITION IN `initTools` IS LOAD-BEARING.** It must be armed **before**
`attachSpaceEnvelopeRender`, which derefs `world.scene.three` / `world.renderer.three.domElement` /
`world.camera.three` with no `try`. Armed after it, any boot where the THREE world is not up left
the 3-D Site raising `pryzm:spaceEnvelope:faceMoved` into an **empty listener set** — the founder
drags a face, the envelope moves, the building does not follow, and he is told nothing.
`spaceEnvelopeWallFollowWire.spec.ts` pins the order **and its premise**.

---

## §8 — REFUSALS (C83 — a refusal is a correct answer)

| Code | When | Surfaced how |
|---|---|---|
| `link-graph-unreadable` | the semantic graph could not be read | ⛔ **toasted** — never read as "there are no walls"; `null ≠ []` |
| `ring-arity-changed` | the vertex count changed, so an edge index means a different edge | toasted |
| `ring-too-small` | fewer than 3 vertices | toasted |
| `ring-unchanged` | top/bottom drag, or a no-op | ⭐ **logged, NOT toasted** — a warning on every roof-height drag would be noise (L-13118) |
| the cascade refuses atomically | one wall's new baseline would cross a door or window | toasted, with the command's own words — **every wall stays**, and the user is told it is all-or-nothing |

⚠ **The atomic refusal is a real failure mode, not a theoretical one.** And this caller supplies no
`movedSubject` (§L-990) because it *has* none — the subject is an ENVELOPE, and nominating an
arbitrary perimeter wall would feed the attribution arm a false premise. ⇒ On a building with a
**pre-existing** opening crossing, a face drag moves the envelope and no wall, and the user is told.
That is the honest outcome; silently moving some walls and dropping others is the one that is not.

---

## §9 — WHAT WOULD CLOSE THE REMAINING GAPS

| Gap | Row | The fix, and why it is not "just add a caller" |
|---|---|---|
| walls do not get taller | L-13118 | `wall.updateHeightBatch` **already exists** and costs one entry. What is missing is `height`/`baseOffset` on the event. ⚠ Two verbs in one gesture is two undo entries unless they merge, and no verb here commits a baseline batch and a height batch together. |
| only build-from-design buildings follow | L-13117 | `recordEnvelopeWallLinks` has exactly **one** caller. Adding a second per generator ships four rival recorders, three of which rot. The durable answer is wiring walls into `ElementProvenanceIndex` (C80 §0.1(4)) — blocked on `serializeWall` not persisting wall provenance at all. |
| one gesture, two undo stacks | §6 | Give `CascadeWallBaselineHandler` a real patch pair (C85 W-V-2). Wall-family work. |
| the 0.05 m tolerance is declared, not measured | — | Measure the p95 baseline-vs-edge error across real `buildFromDesign` output (welded and unwelded) and set it from that ([[tolerance-from-measured-error-not-the-test]]). Until then the failure direction is the safe one: too tight makes a wall STAY **and say so**. |
| none of it is browser-verified | C114 §14d | A session on the 3-D Site. Source is not behaviour. |
