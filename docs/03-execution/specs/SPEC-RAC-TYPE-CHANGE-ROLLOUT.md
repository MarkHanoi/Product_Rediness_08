# SPEC — RAC type-change rollout: publishing the eleven dark families

> **Stamp**: 2026-08-19 · **Lane**: RAC1 · **Status**: IN FLIGHT
> **Authority**: subordinate to [C67](../../02-decisions/contracts/C67-RAC-CAPABILITY-CONTROL-PLANE.md)
> §1.8 / §4 rules 14–15 and [C84](../../02-decisions/contracts/C84-ELEMENT-INTEGRITY.md) §4F.
> **Decisions**: [ADR-0334](../../02-decisions/adrs/ADR-0334-one-type-change-route-published-to-chat-per-family.md).
> **Rows**: `L-1140 … L-1147` in [ISSUE-LOG](../../04-reference/ISSUE-LOG.md).
> **Per-family detail**: each family's **§RAC** section in its own C85–C99 contract.

---

## 0 — The founder's ask, and the one sentence that reframes the work

> *"IN THE RAC AT THE MOMENT I CAN SAY: 'CHANGE ALL WINDOWS TYPE TO ….' BUT DOESN'T WORK FOR:
> 'CHANGE HANDRAIL TYPE TO FRAMELESS GLASS BALUSTRADE'. I WANT ALL ELEMENTS TO BE CHANGEABLE — BY
> LEVEL, BY ROOM, ETC. DO AN AUDIT — DOCUMENT — PER ELEMENT CONTRACT — AND FIX IT."*

⭐ **THE MACHINERY IS NOT MISSING.** `element.changeType` (`initBusHandlers.ts:1518`) routes
**sixteen** families to the geometry stores the builders and persistence read, with ring-parity
undo, pinned by `elementChangeTypeCoverage.spec.ts:178-194`. **The chat publishes five.**

**This is a PUBLICATION gap — a C84 EI-3 breach — not an implementation gap.** Every phase below is
registry wiring against a proven executor, except the four families that need a catalogue minted.
**Size and risk follow from that framing; do not let a plan be written as if eleven commands were
missing.**

---

## 1 — Ordering, and why it is this order

Phases are ordered by **risk retired per unit of work**, not by family importance. Each phase is
independently shippable and independently testable.

| Phase | What | Families | Blocked by | State |
|---|---|---|---|---|
| **P0** | Inject the generic catalogue channel | slab, ceiling (existing) | — | ✅ **LANDED** |
| **P1** | Bus-boundary honesty | wall, window, door, ceiling | — | ⬜ |
| **P2** | Declare the scope modes already honoured | 9 capabilities | — | ⬜ |
| **P3** | The READY families | curtain-wall, floor, roof, lighting, stair-railing | P0 | ⬜ |
| **P4** | Handrail | handrail | P0 + HR2's projection | ⬜ |
| **P5** | Stair | stair | one method (L-1147) | ⬜ |
| **P6** | The batch verb | all | ADR-0334 D1 | ⬜ |
| **P7** | Selection as a geometry source | wall ← slab | — | ⬜ |
| **P8** | The deferral-blocker gate | — | — | ⬜ |
| **P9** | The catalogue-less families | furniture, plumbing, column, beam, CW panel | C65 decisions | ⬜ DEFERRED |

⛔ **P1 BEFORE P3.** Publishing more families onto a bus contract that reports success when it
changed nothing multiplies the L-995 surface. **Fix the lie before adding callers.**

---

## 2 — P0 · The generic catalogue channel ✅ LANDED

**`ResolverContext.catalogues` had no production writer.** `ZeroTokenChatBridge.buildContext()` —
**the only `ResolverContext` construction site in the repository** — never set the key, so
`set-slab-type` and `set-ceiling-type` ran the raw-string fallback and `element.changeType` sat in
Class B *blocked on this exact key*.

**Shipped:** `buildCatalogueChannel()` in `ZeroTokenChatBridge.ts` — one table row per family,
running the ONE `resolveCatalogueRef` ladder, wired for `slab` and `ceiling`.

**Two properties that make it safe to extend:**
- **A half-readable store is ABSENT, not empty.** Both `getById` and `getAll` must be functions or
  the family is skipped — a store that resolved some refs and silently missed others would be worse
  than no channel (§CONTEXT-DATA-HONESTY).
- **Nothing readable ⇒ the key is omitted entirely**, which is byte-for-byte today's behaviour. The
  change can only *add* resolution, never remove it.

⛔ **`StairTypeStore` is deliberately absent** — it exposes `get()` where the ladder requires
`getById()`. Listing it would declare a capability that cannot resolve: the `ElementCapabilities`
lie this repository has already paid for once. **P5.**

---

## 3 — P1 · Bus-boundary honesty (L-1141)

`window` / `door` / `ceiling` / `wall` `.updateSystemTypeBatch` end `execute()` with an
**unconditional** `return { forward: [], inverse: [] }` — reached identically when N changed, when
the command **refused everything**, when the bridge **threw**, and when there was no command
manager.

**The fix is already written**, in the one sibling that has it:
`plugins/slab/src/handlers/UpdateSlabsSystemTypeBatch.ts:167-209` — read `report.success`, keep
`report.info[0]` as `refusal`, **throw**.

| Apply to | Line |
|---|---|
| `plugins/window/src/handlers/UpdateWindowsSystemTypeBatch.ts` | `:161` |
| `plugins/door/src/handlers/UpdateDoorsSystemTypeBatch.ts` | `:161` |
| `plugins/ceiling/src/handlers/UpdateCeilingsSystemTypeBatch.ts` | `:145` |
| `plugins/wall/src/handlers/UpdateWallsSystemTypeBatch.ts` | `:169` ⚠ **lane WPE1/WJ1 territory — route it** |

**Proof**: a bus-level test that a refused batch **rejects**, dispatched **with no CustomEvent
subscriber**. ⛔ A test that subscribes proves the *transcript*, not the *contract* — and the
transcript already passes. That distinction is the whole defect.

---

## 4 — P2 · Declare the scope modes already honoured (L-1142)

The gate prints **26** spatial modes honoured without declaration, baseline 24. `set-window-type`,
`set-door-type`, `set-slab-type`, `set-ceiling-type` each honour `level`, `room` **and**
`orientation`; `set-wall-type` declares **no** `scopeModes` at all.

**The founder's "BY LEVEL, BY ROOM" ALREADY WORKS for every catalogue family** — the shared grammar
`makeHostedTypeParser` captures `on level N` and `in the <room>` for free. **The registry does not
say so**, and the registry is what the *"what I CAN do"* answer is generated from, so the system
**under-reports itself** (EI-9, the mirror of L-998).

**Change**: add the modes to `scopeModes`. **Proof**: the `undeclared spatial reach` ratchet falls
**26 → 0**. ⭐ **Cheapest founder-visible win in this SPEC** — the capability already exists; only
the answer about it is wrong.

---

## 5 — P3 · The READY families

Each is **one `CATALOGUE_FAMILIES` row + one `SpecDrivenIntentId` member + one
`ChatCapabilityRegistry` entry + one `buildCatalogueChannel` row.** No new command.

| Family | Catalogue | Executor | Note |
|---|---|---|---|
| **curtain-wall** | `CurtainWallTypeStore`, 20 | `element.changeType:2022` → `UpdateCurtainWallCommand` | record carries `systemTypeId`. ⚠ **C87 + `geometry-curtain-wall` are lane CW2's** |
| **floor** | `FloorSystemTypeStore`, 22 | `element.changeType:1600` → `UpdateFloorLayersCommand` | ⛔ **the floor-vs-slab noun decision gates this**, §7 |
| **roof** | 8 `{id,name}` at `ElementTypeCatalogRegistry.ts:115-124` | `element.changeType:1979` → `UpdateRoofCommand` | enum-valued; the refusal lists 8 fixed options |
| **lighting** | `BUILT_IN_LIGHTING_TYPES`, 12 | `element.changeType:1991` | ⛔ **measure V4 FIRST**, §6 |
| **stair-railing** | reuses `handrailTypeStore` | `element.changeType:1901` | ⭐ already resolves from `newTypeId` alone — **the reference implementation** |

---

## 6 — ⛔ THE V4 GATE ON LIGHTING, WHICH MUST NOT BE SKIPPED

C84 §4's AS-IS table records lighting as ***"renders, never saves · 10 fields dropped · EI-3
10-of-12 · DTO orphaned"***.

**A chat type-change published on lighting would be V3-TRUE and V4-FALSE**: the user watches the
fixture change and loses it on reload. That is **worse than the refusal it replaces**, because the
user has been shown a result.

⛔ **`fixtureType` must be proven to survive save → reload BEFORE the capability is published.**
Currently **NOT MEASURED**. It is the gating measurement for this family, and it is the one place in
this SPEC where "the executor works" is demonstrably not enough.

---

## 7 — The floor-vs-slab noun decision (gates floor)

Users say **"floor"** for both a `floor` and a `slab`. `CatalogueFamilies.ts` deferred floor for
exactly this reason and **the reasoning is correct** — *"change all floors to …"* on a project of
slabs must not silently retype slabs.

⛔ **MUST NOT be resolved by narrowing the vocabulary** (e.g. demanding *"floor slab"*). Founder
doctrine is **free-form language + hard stoppers**.

✅ **The correct shape already exists in C67 §4 rule 6**: ambiguity **refuses naming both
candidates**, with counts — *"12 slabs and 3 floors match 'floor' here — which did you mean?"* —
and a follow-up resolves it. That is a **hard stopper with both numbers**, not a narrower grammar.

---

## 8 — P6 · The batch verb (ADR-0334 D1)

`element.changeTypeBatch` — `{ elementIds, elementType, newTypeId, …family fields }` — producing
**ONE undo entry on BOTH stacks**: one legacy `Command` wrapping N children (the
`UpdateWindowsSystemTypeBatchCommand` shape) plus **ONE `PatchPair` carrying N `replace` ops**
(`PatchSide.ops` is an array, so the ring buffer needs no extension).

⛔ **Additive only.** `_swapWithRingParity` keeps its exact behaviour and gains a sibling; **eleven
live branches depend on it**.

⛔ **Never re-implement a family's swap.** The batch verb is *a loop plus one snapshot pair* (P6,
EI-4a).

**Proof — executed, and the second undo is the load-bearing half:** an utterance retypes N
elements → the geometry store reads back the new value on all N → **one** Ctrl+Z restores **all N**
→ **a second** Ctrl+Z does **not** re-apply or half-apply. *(Furniture is why: L-68 measured that a
swap with no ring entry made Ctrl+Z **delete the bed**, because the ring's top was still the
element's CREATE. Mismatched stacks re-open that at scale.)*

---

## 9 — P7 · Selection as a geometry source (L-1143, L-1144)

**"The RAC has no selection context" is FALSIFIED** — selection is non-optional, carries id **and**
kind, is rebuilt every message, and **36 of 57** capabilities are selection-reachable.
`create-wall` is the outlier: `scope: 'global'`, no subject axis, and the grammar never inspects the
token *"slab"*.

⛔ **AND THE TOOL MODE IT WOULD HAVE ROUTED TO IS BROKEN.** `ToolsAreaLayout.ts:285` sends
`{slabId}` to `wall.create-on-all-slabs`, whose payload has no `slabId`, whose handler ignores it,
and whose command calls `slabStore.getAll()` — **select one slab, press `S`, wall every slab.**

**Route to `wall.createFromSlab`** (`plugins/wall/src/handlers/CreateWallsFromSlab.ts`) — the only
bus-native, Immer, single-undo path — **and repoint the tool at the same verb in the same change**,
collapsing two of the **four** rival implementations. ⛔ **Mint no fifth** (P6, EI-4a).
Requires lifting `wall.createFromSlab` out of `C_BATCH` (`ChatCommandClassification.ts:241-250`).

---

## 10 — P8 · The deferral-blocker gate (C67 rule 15) — **the durable fix**

`element.changeType` sat behind `blockedBy: 'catalogue value-source injection'` while **both halves
had already shipped**, and `check-chat-capability-coverage.ts` was **green** — because
**a deferral is invisible to a coverage gate by construction.**

⭐ **And the same file records the same miss for `room.setOccupancy` three lines above the offending
entry**, ending with the lesson that was then not applied to line 98.

**TO BUILD — `tools/ga-gate/check-deferral-blockers.ts`**, shrink-only: for every Class-B /
`CHAT_UNAVAILABLE` entry whose `blockedBy` names a catalogue or an injection, assert the dependency
is **not** already satisfied. **P0–P7 are its backlog; this is the thing that stops the backlog
re-forming.**

⚠ **181 deferrals have NOT had their blockers re-validated** (131 Class-B + 52 `CHAT_UNAVAILABLE`,
minus the two this lane checked). **A gap, not a clearance.**

---

## 11 — P9 · The catalogue-less families ⛔ DEFERRED, with the retiring condition

| Family | Missing | Retires when |
|---|---|---|
| furniture | `{id,name}` — bare string union | an `{id,name}` furniture catalogue is minted (C65) |
| plumbing | `{id,name}` — unions + variant axes | a catalogue is minted **and** the fixture-vs-variant question is decided |
| column | `{id,name}` — `profile` enum | a section catalogue is minted |
| beam | `{id,name}` — `sectionType` enum | a section catalogue is minted |
| curtain-wall PANEL | **the executor itself** — `ReplacePanelTypeCommand.ts:1` is `TODO(E.5.x): ORPHANED` | CW2 lands the command |

⛔ **MUST NOT narrow the user's vocabulary to make these resolve.** Until a catalogue exists, the
sentence **refuses and names what IS available for that family** — never absorbed silently, never
guessed.

---

## 12 — Acceptance, for every phase

1. **Executed read-back of the geometry store** (C16 CA-21). ⛔ Never `success: true`, never a call
   count, never the plugin DTO store.
2. **Save → reload → still there** (V4).
3. **One Ctrl+Z, then a second** (V5, §8).
4. **A refusal names the real options** and quotes both numbers.
5. **The transcript is true** — partial says partial (V7), and the *bus* is honest independently of
   the transcript (§3).
6. ⛔ **A fake may not be more capable than the thing it stands in for.** L-995 was "proved" against
   a hand-written store whose `update` accepted every field, standing in for a real store that
   accepted twelve.

---

## 13 — NOT MEASURED (explicit — EI-1b)

- **No utterance has been typed into a live editor for any phase of this SPEC.** Every verdict is
  source-measured. **P0 has landed as CODE and is not yet PROVEN at the layer the user experiences.**
- **V3/V4/V5 under a chat driver, per family** — the panel's passing is **not transferable evidence**.
- **`fixtureType` persistence for lighting** — §6, the gating measurement.
- **`set-slab-type` / `set-ceiling-type` resolution quality now that P0 has landed** — the fallback
  path is no longer taken for these two; **the change in refusal copy and fuzzy-match behaviour has
  NOT been observed in a real project.**
- **V6 SYNC** — inherited FAIL from C67 §1.0, not re-derived.
- **181 other deferrals** — §10.
