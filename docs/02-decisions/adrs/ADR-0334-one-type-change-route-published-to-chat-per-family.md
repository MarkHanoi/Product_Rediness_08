# ADR-0334 — ONE type-change route, published to chat per family: `element.changeType` is the executor, and a batch is ONE undo entry

> **Status**: ACCEPTED · **Date**: 2026-08-19 · **Lane**: RAC1
> **Supersedes**: nothing. **Refines**: [ADR-0313](ADR-0313-zero-token-chat-command-resolver.md)
> (the ladder + registry), [ADR-0314](ADR-0314-chat-capability-parity-and-semantic-batch-layer.md)
> (parity + undo-neutral `runBatch`), [ADR-0315](ADR-0315-universal-capability-architecture.md)
> (the universal capability architecture).
> **Binding contracts**: [C67](../contracts/C67-RAC-CAPABILITY-CONTROL-PLANE.md) §4 (the control
> plane), [C84](../contracts/C84-ELEMENT-INTEGRITY.md) **§4F** (the measurement this decision rests
> on) and its **EI-3 / EI-4a / EI-8 / EI-9**, [C16](../contracts/C16-COMMAND-AUTHORING-PROTOCOL.md)
> **CA-18 / CA-21**, [C65](../contracts/C65-ELEMENT-TYPE-SYSTEM.md), P6 (commands are the only mutation
> path).

---

## Context — the measurement, not the impression

The founder, 2026-08-19: *"IN THE RAC AT THE MOMENT I CAN SAY: 'CHANGE ALL WINDOWS TYPE TO ….' BUT
DOESN'T WORK FOR: 'CHANGE HANDRAIL TYPE TO FRAMELESS GLASS BALUSTRADE'. I WANT ALL ELEMENTS TO BE
CHANGEABLE — BY LEVEL, BY ROOM, ETC."*

C84 §4F measured what was actually there, and it inverted the expected shape of the work:

- **`element.changeType`** (`apps/editor/src/engine/initBusHandlers.ts:1518`) carries **sixteen
  family branches** — wall, furniture, floor, slab, door, window, ceiling, plumbing, stair, column,
  beam, stair-railing, **handrail**, roof, lighting, curtain-wall. Every branch writes the
  **geometry store the builders, the plan projector and persistence read**, and every branch has
  ring-buffer undo parity through `_swapWithRingParity`. The whole set is pinned executable by
  `elementChangeTypeCoverage.spec.ts:178-194`.
- **The chat publishes five type-change capabilities** — `set-wall-type`, `set-window-type`,
  `set-door-type`, `set-slab-type`, `set-ceiling-type` — through five *separate*
  `*.updateSystemTypeBatch` verbs that **do not use `element.changeType` at all**.

> ⭐ **So this is a PUBLICATION gap, not an implementation gap.** Eleven families have a live,
> panel-reachable, undoable, persisting type-change that chat cannot reach: a **C84 EI-3 breach**
> (*what the UI offers, the pipeline must accept*) on nine element families plus two railing
> variants. The work is registry wiring against proven executors — an order of magnitude smaller,
> and an order of magnitude less risky, than "build eleven capabilities".

Two architectural questions had to be answered before any of it could be wired, and both were
about to be answered *by accident*. This ADR answers them **deliberately**, because
[a decision recorded only in a commit body is not reachable by a concurrent lane](../contracts/C84-ELEMENT-INTEGRITY.md).

---

## Decision 1 — A BULK TYPE CHANGE IS **ONE COMMAND AND ONE UNDO ENTRY**. Fan-out is not the default, and `set-room-occupancy` is a migration target, not a precedent.

### The tension, stated honestly

The obvious cheap route was `fanOutPerId: true` on the `set-room-occupancy` precedent
(`CapabilityExecutionSpec.ts:651`): resolve the scope to N ids, emit N single-element commands. It
works today, it is already generated from a table, and `dispatchCommands` already *discloses* the
cost — `ZeroTokenChatBridge.ts:1190` prints **`undo with Ctrl+Z (N steps)`**.

**Disclosure is not the same as a good contract.** *"Change all handrails on level 2 to frameless
glass balustrade"* on a forty-railing level would leave **forty undo entries**. A user who says one
sentence and presses Ctrl+Z once expects one sentence to be undone. ADR-0314 already settled the
principle for the batch layer — **`runBatch` is undo-NEUTRAL: it is an event/geometry-storm gate,
NOT an undo coalescer**, and a batch capability must produce ONE entry by being ONE command.

### What was measured, and it decides the question

`PatchSide.ops` is **`readonly JsonPatchOp[]`** — an array
(`packages/runtime-undo-stack/src/RingBufferUndoStack.ts:33-35`). One `PatchPair` can therefore
carry **N whole-element `replace` ops against one store key** and remain **one** undo entry. The
ring buffer needed no extension; `_swapWithRingParity` simply pushes one pair *per element* because
it was written for a single-element verb.

And the one-command shape is already the proven idiom for exactly this job: every
`*.updateSystemTypeBatch` command (`UpdateWindowsSystemTypeBatchCommand.ts:248-259` and its four
siblings) is **one legacy `Command` whose `undo()` replays its children in reverse** — one legacy
entry for N elements.

### The decision

1. **A scoped type change dispatches ONE bus command.** The verb is **`element.changeTypeBatch`**,
   payload `{ elementIds: string[], elementType: string, newTypeId: string, …family fields }`.
2. **It produces exactly ONE undo entry on each stack it touches** — one legacy `Command` wrapping
   N children (the `UpdateWindowsSystemTypeBatchCommand` shape), mirrored by **ONE `PatchPair`
   carrying N `replace` ops** against the family's single store key.
3. **It reuses the sixteen existing `element.changeType` branches.** ⛔ It **MUST NOT** re-implement
   any family's swap — P6 (commands are the only mutation path) and **EI-4a** (one route per
   intent). The batch verb is a *loop plus one snapshot pair*, and nothing else.
4. **`fanOutPerId` becomes a DECLARED, EXCEPTIONAL property, never an accident.** A spec that sets
   it **MUST** state, in the table entry, *why this family cannot be one command* — and the only
   admissible reason is that the per-element commands are **genuinely different commands**, not the
   same command N times.
5. **`set-room-occupancy` is reclassified as a MIGRATION TARGET, not a precedent to copy.** Its
   fan-out exists because `planRoomOccupancyFanOut` computes a *different* rename per room
   (authored-name protection + next-free numbering), which is admissible under (4) — but its
   **undo** cost is not, and it should converge on one entry.

### Consequences

- **Positive.** One sentence, one Ctrl+Z. Eleven families join through a table entry each. The
  `(N steps)` disclosure becomes rare and meaningful instead of routine and ignored.
- **Negative, and named.** `element.changeTypeBatch` is a **new bus verb in a heavily shared file**
  (`initBusHandlers.ts`). It must be additive — `_swapWithRingParity` keeps its exact current
  behaviour and gains a sibling `_swapManyWithRingParity`; ⛔ **the single-element helper is not
  refactored**, because eleven live branches depend on it.
- **Risk, named rather than discovered later.** The legacy `CommandManager` and the ring buffer are
  two stacks reconciled by `§UNDO-CROSS-STACK-ORDER` / `§UNDO-GESTURE-ID` (C03 §4.6 U-10). A batch
  that pushed **one** ring entry and **N** legacy entries would leave the cursors out of step. This
  is why (2) requires ONE legacy `Command` too, and why the acceptance proof below is an
  **executed** double-undo, not a unit test.

### Proof required before this is claimed (C16 CA-21)

**Executed read-back**, at the layer the user experiences: an utterance retypes N elements; the
geometry store is read back and holds the new value on all N; **one** Ctrl+Z restores **all N**;
a **second** Ctrl+Z does **not** re-apply or half-apply. ⛔ Not a resolver unit test, and never a
`success: true`.

---

## Decision 2 — The handrail catalogue→fields projection lives BEHIND the bus verb, not in the caller

### The problem

`HandrailData` has **no `typeId`** — the only genuine one of the five reasons in
`CatalogueFamilies.ts` that survived re-measurement. A handrail type is **materialised whole** into
~13 fields. Today the **property panel** performs that projection
(`RailingTypeSelectorWidget.ts:117-145`) and passes all 13 fields into
`element.changeType`; the railing branch (`initBusHandlers.ts:1936-1978`) **does no resolution at
all** — it trusts the caller.

That leaves two bad options for chat, and one good one:

| Option | Verdict |
|---|---|
| Chat re-implements the 13-field projection in its payload | ⛔ **Two authorities computing the same 13 fields** — EI-4a. The panel and the chat would drift, and *"Timber Picket Railing"* would mean two different railings depending on how you asked. |
| Chat dispatches `{newTypeId}` alone | ⛔ **Silently changes nothing.** The branch applies only the fields present, so the command succeeds having done nothing — the exact L-995 false-`Done` class, re-minted. |
| **Projection moves behind the verb** | ✅ **Adopted.** |

### The decision

**Mirror `resolveStairRailingTypeFields`** (`initBusHandlers.ts:1923`) — the sibling family that
**already** resolves its fields from `newTypeId` alone. The projection moves into
`packages/geometry-handrail`, the `element.changeType` railing branch resolves from `newTypeId`,
and **the widget's duplicate projection is deleted**.

Reasons, for the record:

1. **One idiom** — handrail behaves exactly like stair-railing (EI-8: one vocabulary per concept).
2. **One authority** — panel and chat stop being two routes computing the same 13 fields (EI-4a,
   EI-9).
3. **The fragile half disappears** — the chat payload shrinks to
   `{ elementId, elementType: 'railing', newTypeId }`. Materialising 13 fields into a chat payload
   was the part most likely to rot.

### ⚠ THE CLEARING BEHAVIOUR MUST SURVIVE, AND MUST BE ASSERTED BY A TEST

`materialColor: def.materialColor ?? null` — **the `null` is not a default, it is an instruction.**
It **explicitly CLEARS a user's hex override** so the newly-applied `materialId` is what renders.
Drop it and the old colour **permanently shadows** the new type's material (C100 §2.1 step 1).

⛔ **This behaviour MUST be pinned by an assertion, not preserved by luck.** A test must set a hex
override, retype, and assert the override is `null` afterwards. It is precisely the kind of
single-token semantic that survives a refactor by accident and dies in the one after.

### Ownership

`packages/geometry-handrail/**` and **C95** are lane **HR2**'s: HR2 builds the projection and owns
the clearing test. **RAC1 owns the chat-side wiring** — the `catalogues` injection, the
`CatalogueFamilies` entry, the `CapabilityExecutionSpec` entry. Neither lane edits the other's
files; this ADR is the contract between them.

---

## Decision 3 — A family with NO `{id, name}` catalogue is DEFERRED WITH ITS RETIRING CONDITION, never quietly excluded, and the vocabulary is never narrowed to hide it

`resolveCatalogueRef` requires `{ id, name }` — a refusal's whole value is that it **lists the real
names** (`§CONTEXT-DATA-HONESTY`). Four families cannot supply that: **furniture** and **plumbing**
(string unions with no display names), **column** and **beam** (closed profile/section enums), plus
**curtain-wall PANEL type** (a bare union whose command is `TODO(E.5.x): ORPHANED`).

**Decision.** These are **DEFERRED, in writing, each carrying the ONE condition that retires the
deferral** — *"mint an `{id,name}` catalogue for `<family>`"* — recorded in the family's own
C85–C99 §RAC section and in C67's TO-BE table.

⛔ **MUST NOT narrow the user's vocabulary to make the gap stop showing.** Founder doctrine is
**free-form language + hard stoppers**: safety comes from rule gates that refuse **with both
numbers** (what was asked vs what is available), never from a restricted grammar. A refusal for
these families **must name what IS available** for the family, and must not silently absorb the
sentence.

⭐ **And the deferral itself is now a liability with a known failure mode.** C84 §4F.1 measured that
`element.changeType` sat in Class B behind a `blockedBy` whose stated dependency **had already
shipped**, invisible to every gate — *and the same file records the same miss for
`room.setOccupancy` three lines above the offending entry, ending with the lesson that was then not
applied.* **Every deferral written under this decision MUST carry a machine-checkable retiring
condition**, and C84 §4F.9 item 8 raises the gate that re-validates them. A deferral without a
retiring condition is not a decision; it is a leak.

---

## Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| **Add eleven `*.updateSystemTypeBatch` verbs**, one per family, mirroring the existing five | Eleven new commands duplicating sixteen working branches. EI-4a (two routes per intent) and EI-10 (a second implementation must *earn* its existence). It also copies the CA-18 defect — see below. |
| **Route chat to the plugin `*.setType` handlers** | They write **detached DTO stores** nothing renders, exports or persists — the L-620 anti-pattern `CatalogueFamilies.ts`'s own header warns about. |
| **Route chat to `batchCatalogue`'s `dispatchBatchEntry`** | It **bypasses the resolver ladder entirely** (`AIPanel.ts:1279-1318`). It is already an EI-4a breach *inside the AI panel* — click works, typing the same sentence is refused. The fix is to feed its 17 `prompt` strings *to* the resolver, not to add a second dispatcher. |
| **`fanOutPerId` everywhere** | Decision 1. |
| **Leave the eleven families deferred** | The founder's ask, and an EI-3 breach measured on nine families. |

> ⚠ **And the "eleven new batch verbs" alternative would have copied a live defect.** C84 §4F.3
> measured that **four of the five existing batch handlers** (`window`, `door`, `ceiling`, `wall`)
> end `execute()` with an unconditional `{ forward: [], inverse: [] }`, reached identically when N
> elements changed, when the command **refused everything**, when the bridge **threw**, and when
> there was no command manager. **Only `slab` was fixed**, and its own header quotes C16 CA-18. The
> chat transcript is honest only because a *downstream* `CustomEvent` subscription rescues it —
> every other caller sees unconditional success. **Copying that shape eleven more times was the
> real cost of the obvious alternative.** Fixing the four siblings is C84 §4F.9 item 3.

---

## What this ADR does NOT decide (explicit, per EI-1b — a blank reads as "fine")

- **Whether a chat-driven `element.changeType` preserves V3/V4/V5 per family.** The panel's passing
  is **not** transferable evidence. **NOT MEASURED**, and each family's §RAC section must carry its
  own executed read-back.
- **`create-wall`'s missing subject axis** and the four rival slab→walls implementations
  (C84 §4F.5–4F.6). Related, separately decided.
- **The other 181 deferrals.** Only two `blockedBy` claims were re-validated out of
  **131 Class-B + 52 `CHAT_UNAVAILABLE`**. **NOT MEASURED** — a gap, not a clearance.
- **V6 SYNC**, for any family. Inherited FAIL from C67 §1.0; **not re-derived here.**
