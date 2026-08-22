# C84 — ELEMENT INTEGRITY: the normative shape of every element family

- **Status**: CANONICAL — binding on every PR that touches an element family
- **Date**: 2026-08-18
- **Governs**: builders · commands · plugins · DTO stores · legacy stores · bridges ·
  persistence · export · undo — for all 15 element families
- **Evidence**: the four measured audits of 2026-08-18 (Q1 per-consumer store authority,
  Q2 lossy bridge translation, Q4 delete paths, Q7 material vocabularies), each cited
  inline by `file:line`. **Nothing in §4 is asserted; all of it was measured.**
- **Constrains**: [C03](C03-SCHEMAS-COMMANDS-STATE.md) · [C11](C11-ELEMENT-CREATION-PIPELINE.md) ·
  [C15](C15-HOSTED-ELEMENTS.md) · [C16](C16-COMMAND-AUTHORING.md) ·
  [C67](C67-RAC-CAPABILITY-CONTROL-PLANE.md) · [C68](C68-ELEMENT-ATTRIBUTE-CHAT-ONBOARDING.md)
- **Spawns**: the per-element contracts **C85–C99**, one per family (§6)
- **Merged 2026-08-18 from two independent derivations.** EI-1…EI-8 and §4 came from the four-audit
  sweep. **EI-9…EI-13, §3.5, §8 and every amendment marked `[Z8]` came from the lane Z8 repo-wide
  duplication audit**, whose draft is preserved verbatim at
  [`Z8-SOURCE-DRAFT-one-answer-per-question.md`](../../03-execution/plans/Z8-SOURCE-DRAFT-one-answer-per-question.md).
  Where the two disagreed, **both readings are recorded** (§0) rather than silently reconciled —
  which of two measurements is wrong is itself evidence.
- **Implemented by**: [SPEC-ELEMENT-INTEGRITY-CONVERGENCE](../../03-execution/specs/SPEC-ELEMENT-INTEGRITY-CONVERGENCE.md) ·
  **decided by** [ADR-0331](../adrs/ADR-0331-one-answer-per-question-and-the-decided-loser.md) ·
  **evidence** in [DUPLICATION-AUDIT-AND-CONVERGENCE-ROADMAP](../../03-execution/plans/DUPLICATION-AUDIT-AND-CONVERGENCE-ROADMAP.md)

---

## 0. The merge, and the two disagreements it resolved

> **This contract was minted TWICE on the same day, under the same number, by two agents who had each
> been told to write it.** The anti-duplication contract was itself duplicated. It is recorded here
> rather than tidied away, because it is a clean instance of the failure class C84 governs: **two
> derivations of one answer, both correct, neither aware of the other, and nothing in the process
> would have caught it.** The cause was the same as every defect in §4 — *no declared authority*: the
> number was allocated in one place and consumed in another with no register between them.

**Resolution:** `C84-ELEMENT-INTEGRITY` keeps the number (it was already on `main` and already cited by
two running fix lanes). Lane Z8's thirteen invariants were folded in; where Z8's was sharper it won.
ADR-0331, the SPEC and the roadmap keep their own identities and are **not** folded into a contract.

### The two disagreements, both resolved AGAINST the Z8 draft

Recorded because a merge that hides which side was wrong destroys the evidence.

| # | Claim | Z8 draft | Four-audit sweep | Verdict |
|---|---|---|---|---|
| 1 | `DeleteElementCommand`'s fall-through line | `:651` | `:650` | **Sweep correct.** Re-measured: `:650` is the `return { success:false … }`; `:651` is the closing brace. Z8 was off by one |
| 2 | Which kinds `DeleteElementCommand` lacks a branch for | "no `lighting`, no bare-`opening`" | "no `lighting`, `room` **or** `opening`" | **Sweep correct and more complete.** `grep -n roomStore packages/command-registry/src/walls/DeleteElementCommand.ts` → **zero matches**. Z8 never checked `room` |

### The one disagreement resolved IN FAVOUR of the Z8 draft

| Claim | Four-audit sweep | Z8 | Verdict |
|---|---|---|---|
| Lighting persistence | *"zero matches in **both** `ProjectSerializer.ts` and `ProjectLoader.ts`"* | `ProjectSerializer` **0**; `ProjectLoader` **18** | **Z8 correct.** `grep -ci "lighting"` on the serializer → `0`, and `grep -in "light"` → **0 matches**; the loader → **18**. **The LOAD half exists and the SAVE half does not** — which is precisely why it looks wired, and why a lane was about to write a loader that already exists. EI-6's citation is corrected below |

---

## 1. Why this contract exists

Four independent audits, run on the same day against the same tree, each found the same
class of defect in a different subsystem. Not a bug — **a missing invariant**.

The repository has, for every element family, up to five parallel representations:

| # | Representation | Who writes it | Who reads it |
|---|---|---|---|
| 1 | L0 Zod schema (`packages/schemas`) | the bus payload | `parse()` at the plugin handler |
| 2 | Plugin **DTO** store (`PluginRegistry` `storeKey`) | `*.create` verbs | **measured: almost nobody** |
| 3 | Legacy **geometry** store (`packages/geometry-*`, `core-app-model`) | the `.created` bridge + legacy commands | renderer, plan, persistence, IFC |
| 4 | THREE scene `userData` | fragment builders | GLB export, picking, delete routing |
| 5 | Kernel producer record (`geometry-kernel/producers`) | committers | the bake worker only |

Nothing declares which of these is authoritative for a given consumer, so **each hop
re-emits a hand-written named subset** and every omission is silent. `CommandEventBridge`
says so in its own comment at `:917-923`; the Roof schema names the enabling mechanism at
`:91-94` — *"Zod's default `strip` mode deleted it in transit while `parse()` reported
success"*.

**The three defects that make this urgent, all measured, all live:**

1. **Furniture is totally mangled and reports success.** The dispatched payload and the
   Zod record share no fields but `id`/`levelId`/`rotation`
   (`plugins/furniture/src/handlers/CreateFurniture.ts:64-77` vs `commands.ts:755`). Every
   `??` default fires, `Furniture.parse` **succeeds**, and the store receives
   `catalogId:''`, `origin:{0,0,0}`, `representations:{}` for every item. Four `as any`
   casts at the dispatch sites are why `tsc` never saw it.
2. **Lighting is never persisted.** `grep -ci "lighting"` over `ProjectSerializer.ts` returns
   **0** — and `grep -in "light"` over the same file returns **0 matches**, so it is not a
   spelling artefact. Every light the user places is destroyed on save.
   **`[Z8]` correction:** this bullet previously read *"zero matches in **both** … and
   `ProjectLoader.ts`"*. `ProjectLoader.ts` carries **18** `lighting` hits. **The LOAD half exists;
   the SAVE half does not** — which is exactly why the wiring looks complete from the loader end, and
   why a remediation lane was about to write a loader that already exists. See §0.
3. **Delete is path-dependent.** The keyboard path reads `elementType`
   (`initUI.ts:2449` → `DeleteElement.ts:51`); the delete **button** does not
   (`BimService.ts:159-179` constructs `DeleteElementCommand(id)` unconditionally, never
   reading `elementType`). So `opening` and `lighting` delete from the keyboard and
   silently return `success:false` from the button.

> **The governing sentence, from `packages/geometry-wall/src/WallRake.ts:50-62`:**
> *"no affordance without an implementation… A refusal is a correct answer; a
> silently-wrong wall is not."* C84 extends that from geometry to **every hop an element
> makes**. Silence is the defect. A refusal is not.

---

## 2. The canonical element pipeline — NORMATIVE

Every element family MUST travel exactly this path. Any other path is a violation.

```
  UI gesture ──▶ bus verb ──▶ plugin handler ──▶ L0 schema parse
                                    │
                                    ▼
                          ┌── DTO store (§3.2 — projection or nothing)
                          │
                          └── bridge ──▶ LEGACY store  ◀── THE AUTHORITY (§3.1)
                                              │
                    ┌─────────────┬───────────┼─────────────┬──────────────┐
                    ▼             ▼           ▼             ▼              ▼
                 renderer      plan view  persistence   IFC export     GLB export
                                              │
                                              ▼
                                        bake worker (§3.5)
```

---

## 3. The invariants

### EI-1 — ONE AUTHORITY PER FAMILY, AND IT IS NAMED

Each family's per-element contract (§6) MUST name exactly one authoritative store, and
**every** consumer MUST read it. Two consumers of one family reading different stores is a
**split-brain** and is a merge blocker.

> **The reader set this invariant answers to is NOT C84's own.** It is
> [C16 §5.1](C16-COMMAND-AUTHORING-PROTOCOL.md)'s AUTHORITATIVE-STATE table — **RENDER · PERSIST ·
> EXPORT** — and [C03 §4.4](C03-SCHEMAS-COMMANDS-AND-STATE.md)'s three store layers, whose
> *"Drives the 3D mesh?"* column already names the legacy store `Yes` and the L1 bus store `No`.
> EI-1 **adds two readers those tables do not enumerate** — the **plan view** and the **bake
> worker** — and requires the answer to be recorded *per family* rather than per repo. It does not
> re-decide which layer is authoritative; C03 §4.4 and its U-7 end-state (ADR-0251) already did.

*Measured violations:* `wall` (viewport reads the `geometry-wall` singleton at
`initBuilders.ts:77,553`; the bake worker reads a plugin DTO `WallStore` at
`HeadlessBakeSession.ts:31,51,131`).

`wall.opening` — persistence reads `doorStore`/`windowStore` at
`ProjectSerializer.ts:47-48,704-705`; IFC export reads openings embedded on the wall record at
`WindowDoorReader.ts:1,7,12`. **Two records for one door, read by two different consumers.**

> ⚠ **CORRECTED 2026-08-18 against C15 — this bullet previously ended *"and nothing reconciles
> them"*. That was FALSE, and the correction narrows the finding rather than dropping it.**
> [C15 §8.1](C15-HOSTED-ELEMENT-CONTRACT.md) (*Dual-Store Rule for Offset Mutations*, Fix DW-14)
> **mandates** the reconciliation verbatim: *"Every command that mutates a hosted element's
> `offset` MUST write to **both**"* — `wallStore.updateDoor()/updateWindow()` **and**
> `doorStore.update()/windowStore.update()` — and names the bug that occurs when a command forgets.
> **What is actually measured is narrower and still a defect:** the pairing is enforced by C15's
> own words as *"a code-review checklist item"* and by **no gate**, and the two consumers above
> pick **different sides of the pair**. The split-brain is therefore not *unreconciled*; it is
> *reconciled by review only, on the write path, and not at all on the read path.*
>
> **And the authority question is DECIDED, not open.** [C15 §1](C15-HOSTED-ELEMENT-CONTRACT.md)
> defines the host wall as *"the `Wall` entity (in `WallStore`) that contains the hosted element in
> its `openings[]` array"*, and **C15 §2** states a hosted element *"has no independent world-space
> coordinate in the store"*. `wall.openings[]` **is** the authority for `wall.opening`; `doorStore`
> / `windowStore` are the derived side that C15 §8.1 keeps in sync for `DoorBuilder`/`WindowBuilder`
> only. C84 may not re-open this — see the correction to §9.

**`[Z8]` EI-1a — a store KEY must name the SAME OBJECT for a command's whole lifecycle.**

> ⛔ **THE MECHANISM IS NOT C84's. DO NOT CITE C84 FOR IT.** It is
> [C03 §4.6 **U-2b**](C03-SCHEMAS-COMMANDS-AND-STATE.md) (*store IDENTITY, not just store NAME*),
> which states it canonically — *"the key is **overloaded across time**… the entry therefore passes
> the §4.5 step-2 coverage pre-check, the ring-buffer path runs, and **an inverse patch is applied
> to a store that never received the forward.** That is not a failed undo; it is a mutation of
> authoritative state derived from a different store's history"* — and fixes the two permitted
> exits: **(a)** route the write to the mapped store (C16 **CA-17**), or **(b)** declare
> `affectedStores: [] as const`. [C16 **CA-19**](C16-COMMAND-AUTHORING-PROTOCOL.md) is the same rule
> stated as an authoring obligation. Its gate is C16 §11.1's **G-CA-A3**, which does not exist yet.

**EI-1a is the third binding of that one rule, and the only one aimed at the STORE OWNER rather
than the command author.** C03 U-2b and C16 CA-19 both tell the author *"do not declare a key whose
undo target differs from your write target"*. Neither tells the **owner of a store key** that the
key is a shared name with two resolutions, so neither prevents the next key from being minted
overloaded. EI-1a: **a store key is part of the family's declared identity (§6 row 2); the family's
contract MUST state, for every key it declares, which object that key resolves to at WRITE time and
which at UNDO time, and they MUST be the same object or the divergence MUST be declared.**

*Measured:* `buildUndoStoreMap()` (`performUndoRedo.ts:308-353`) resolves 24 keys to 21 `window.*`
globals, all geometry, while the write side resolves the same keys to plugin DTO snapshots.

**`[Z8]` EI-1b — a CLEAN family must be RECORDED as clean.** The consumer set to answer for, every
time: **renderer · plan view · persistence · IFC export · GLB export · bake worker.** A family whose
consumers all read one store is conformant and is recorded `✅` — **never left blank**, because a blank
reads as *"fine"* and is indistinguishable from *"nobody looked"*. *Measured example:* `handrail` — 3-D,
plan, persistence, IFC, GLB and schedules **all read legacy**; its plugin store has **zero** production
readers; `produceHandrail` and `HandrailCommitter` are never instantiated. **CLEAN**, and the split is
therefore **per-family, not repo-wide.**

### EI-2 — NO SILENT NARROWING AT ANY HOP

When a source field cannot reach its destination, the code MUST either carry it or
**refuse in a way the user sees**. Dropping it by omission is forbidden.

This bans four specific mechanisms, each measured live:

- **a. Named-subset re-emit.** Hand-written field lists that omit fields both ends
  possess. *(`wall.materialId` `CEB:236-256`; `ceiling.materialId` read into the cast at
  `CEB:666` then dropped at `:673-682`; `roof.skylights` + `materialId` `CEB:895-924`;
  `slab.holes` `CEB:342-368`; all ten of `lighting`'s fields `CEB:841-848`.)*
- **b. Comparison against a value the source enum cannot produce.** Type-checks clean;
  the branch is a constant. *(`handrail` `initTools.ts:1942` tests `=== 'rectangular'`
  against `'round'|'square'|'flat'`, so **every** handrail is round.)*
- **c. `as any` at a dispatch or bridge site.** It is what blinds `tsc` to (a) and (b).
  *(`beam` `initTools.ts:1787` writes `i-section`/`t-section` into a
  `'rectangular'|'UB'|'UC'` union; `column` `:1664` the same; the four furniture dispatch
  sites.)*
- **d. Collapsing a sequence to its endpoints.** *(`handrail` `initTools.ts:1928-1938`
  keeps `path[0]` and `path[last]` and **discards the middle** — a 3-point L-rail becomes
  a diagonal across the corner it was drawn to guard. This is not truncation; it is
  collapse, and it is silent.)*

**Every field of every payload MUST have a declared destination — carried, or dropped
DELIBERATELY and named as dropped.** Never by omission.

### EI-3 — WHAT THE UI OFFERS, THE PIPELINE MUST ACCEPT

An enum member the UI can select and the pipeline cannot carry is an affordance without an
implementation.

*Measured:* the lighting plan tool offers 12 `LightingFixtureType` values and sends them as
`kind` (`LightingPlanToolHandler.ts:29,134`), but `LightingKind` has 5 members overlapping
in **two** — so **10 of 12 fixture types the tool's own UI offers cannot be placed**. This
one at least *refuses loudly* (`Lighting.parse` throws), which is why it is EI-3 and not
EI-2. It is still a violation.

### EI-4 — ONE DELETE PATH, AND IT IS `elementType`-AWARE

Every UI delete gesture MUST reach the same command with the same information. A delete
that succeeds from the keyboard and fails from the button is a violation.

*Measured:* `BimService.ts:159-179` never reads `elementType`. Additionally
`DeleteElementCommand` has **no** `lighting`, `room` or `opening` branch and falls to
`:650` `{success:false, info:['Element not found in any store']}`.

> **`[Z8]` EI-4a — CLOSED 2026-08-18 (`§FIX-ONE-DELETE-PATH`), and the SHAPE of the fix is normative.**
> The repair was to **delete the second route**, not to copy the `elementType` switch into it. Copying
> would have minted the second answer EI-9 forbids, and the next kind to gain a specialised command
> would have diverged again. `BimService.deleteSelected()` now dispatches the same `element.delete`
> verb the keyboard dispatches, resolving `elementType` by the same parent-walk `initUI.ts:2440-2442`
> uses; `DeleteElementHandler` remains the only place mapping a kind to a command. Pinned by
> `apps/editor/__tests__/OneDeletePathAcrossSurfaces.test.ts` (5/5), **watched RED first** — 3 failed
> against HEAD, and the 2 negative controls correctly passed both ways.
>
> **Generalised: ONE ROUTE PER USER INTENT.** Two UI surfaces expressing the same intent MUST reach the
> store by the same route. A second surface may not construct its own command, apply its own routing,
> or read a different field set.

### EI-PROP — WHEN A HOST MOVES, THE DEPENDENT ADAPTS OR REFUSES BY NAME

> **Added 2026-08-21 (lane PROP1), from the founder's ask: *"elements should propagate when one
> moves — all contexts. Audit all elements against this principle."* The governing contract is
> **C72 §9**; the 64-cell matrix and its evidence are **ADR-0344**; the ledger a gate reads is
> `tools/rac-conformance/certification/gates/host-move-propagation-matrix.json`.**

EI-4 and EI-5 make **delete** symmetric across stores. **Move has no equivalent rule**, and the
measurement says it needed one: of 64 (dependent family × moving host) cells, **39 are SILENT** —
the dependent neither adapts nor says why. A create/delete pair that is perfectly symmetric and a
move that strands the dependent are the same integrity defect at different verbs.

> **EI-PROP-a (NORMATIVE).** A PR that **adds an element family**, or that **adds a host
> relationship to an existing one**, MUST state that family's row in the host-move matrix. A new
> family whose dependents fall SILENT arrives as a **declared finding on the ledger**, never as
> silence. The three verdicts are C72 §9.1's: **PROPAGATES** (adapted through a command,
> composed as a `STRUCTURAL_CASCADE` child so it costs ONE undo — C81), **REFUSES** (not adapted,
> said by name with a reason and, for geometry, both numbers — C74), or **SILENT** (a finding).

> **EI-PROP-b (NORMATIVE).** *An honest refusal is a valid answer, and for a whole class of cells
> it is the TARGET state.* C83's `IMPOSSIBLE / INADVISABLE / FINE` split and the founder's
> standing *"always ASK, never auto-edit"* direction mean that adapting is not always correct.
> **Reducing a cell from SILENT to REFUSES closes the defect fully.**

> **EI-PROP-c (NORMATIVE) — the shape to copy, and the shape to never ship.**
> The reference implementation is the level-elevation reconcile: seven element kinds do **not**
> re-elevate, and each classifies `DETERMINED-STRANDED` with a named reason
> (`SpatialAuthority.classifyForReconcile`), with the roof's shortfall reaching the **user** as a
> toast rather than the console. The shape to never ship is
> `initWallLevelSubscribers.ts:51-52` — `const wall = store.getById(id); if (wall) { … }`, **no
> `else`, no log** — which silently drops the lighting, plumbing, ceiling, floor and standalone-
> opening ids that were *delivered to it*. ⭐ **A handler that early-returns without a line is
> worse than no handler: it reads as coverage.**

> **EI-PROP-d (NORMATIVE).** A propagation channel is not a substitute for a relationship. Six
> SILENT cells cannot be wired at all because the record holds no edge to walk — `FurnitureData`
> carries no `wallId`/`hostId`/`roomId`, `PlumbingFixtureData` none, `CurtainWallTypes` no host
> wall, `HandrailData.hostKind` cannot be `'wall'`. **The per-element contract owns the field
> before any lane owns the subscriber** (C97, C99, C87, C95 respectively).

### EI-5 — CREATE AND DELETE MUST BE SYMMETRIC ACROSS STORES

Whatever a create writes, the matching delete MUST remove — from every store it wrote.

*Measured:* **21 of 22** plugin `*.delete` verbs have **no production caller**; the DTO
record is orphaned by every user delete of every family. `plugins/floor` declares no
`floor.delete` verb at all. Only `room.delete` has callers, and only from the layout
generators — never from the Delete key or the delete button, both of which return
`success:false` for a room.

> ### `[Z8]` EI-5a — THE DISPOSITION: a write-only shadow is DECLARED, not reconciled
>
> EI-5 states the asymmetry. This states what to **do** about it, because the obvious repair is wrong.
>
> ⛔ **Do NOT add a purge, a mirror, or a reconciliation pass to keep the DTO record consistent with the
> legacy store.** That makes both copies look authoritative and neither trustworthy (§8.c), and it
> contradicts ADR-0318 I-1 (*"never a copy, never a rival"*) and ADR-0331 §D1.
>
> **And the DTO record is worth even less than "orphaned" suggests.** The `.created` bridges are
> one-way and create-only; every subsequent edit goes legacy-only with no write-back
> (`PropertyInspectorApply.ts:446`, `initBusHandlers.ts:1136`); and `ProjectLoader.ts:743` reloads a
> project through legacy commands **with no bus event**. **So after any project load, every plugin DTO
> store is EMPTY while the legacy stores hold N records.** Reconciling a store that is empty half the
> time is maintaining a fiction.
>
> **DECLARE instead.** Each `plugins/*/src/store.ts` header names the winner, states its reader and
> writer counts, and gives the retirement path — the `plugins/rooms/src/store.ts:1-29` form, which is
> already exemplary. The shadow stops being a shadow when ADR-0331 §D2 retires its write.
>
> ⚠ **This disposition is sound ONLY while the reader count is zero.** If any consumer is found reading
> a DTO store, it inverts and reconciliation becomes mandatory. The census must therefore be re-run on
> **both** axes of §3.5.1.

### EI-6 — PERSISTENCE IS NOT OPTIONAL, AND ABSENCE MUST BE LOUD

Every family that can be created MUST round-trip through save/load, or the creation
affordance MUST be removed. Silent non-persistence is the most severe defect this contract
governs: the user's work is destroyed with no error.

*Measured:* `lighting` — **`ProjectSerializer.ts` = 0 matches** for both `lighting` and the broader
`light`; **`ProjectLoader.ts` = 18**. The save half is absent, the load half is not (§0, `[Z8]`).
Also `ceiling`, `floor` and `lighting` have **no IFC reader** in
`packages/file-format/src/export/ifc/readers/` (directory listed: Beam, Column, CurtainWall, Furniture,
Handrail, Plumbing, Roof, Room, Slab, Stair, Wall, WindowDoor); they vanish from IFC export with no
refusal.

#### EI-6.1 — A FIELD IS PERSISTED ONLY IF THE RESTORE PATH THAT **SHIPS** READS IT — NORMATIVE

*Added 2026-08-19 (lane PERSIST1, L-1210…L-1220). Round-tripping is not a property of the
serialiser. It is a property of the WHOLE loop, and the loop's weak half is the loader.*

**THE RULE.** For every key a serialiser writes, ONE of the following must be true, and which one
must be written down at the field:

1. a restore path READS it and hands it to the create command; or
2. it is **DERIVED** — the restore re-establishes the value from something else, and the comment
   says **from what**; or
3. it is a **KNOWN LOSS** carrying an **L-number**. A known loss is a defect parked with a name,
   never "expected behaviour".

**⛔ THE ENUMERATION MUST BE DERIVED, NOT REMEMBERED.** Four separate lanes fixed four instances of
this defect in one week (slab `baseOffset`, handrail types, wall rake, curtain-wall types). Every one
was a hand-written field list that had drifted from another hand-written field list. A fifth
hand-written list — including a list in this contract — would rot the same way. The gate is
`apps/editor/__tests__/persistedFieldsReachTheRestorePath.test.ts`, which DERIVES the written key set
from each `serializeX()` object literal and the read key set from each restore block, and fails on
any key that is on no ledger.

**⛔ COUNT THE RESTORE PATHS BEFORE CLAIMING A FIX. THERE ARE THREE.**

| # | path | status |
|---|---|---|
| 1 | `packages/persistence-client/src/loader/ProjectLoader.ts` | never built by the app |
| 2 | `apps/editor/src/engine/persistence/ProjectLoader.ts` | LEGACY — the `else` branch |
| 3 | `packages/command-registry/src/project/ImportProjectCommand.ts` | ⭐ **DEFAULT-ON** |

`ProjectLoader._useImportCommandPath()` returns **true** unless `PRYZM_USE_IMPORT_COMMAND` is set
falsy. **A fix proved only against path 2 has not shipped** — that is L-1210, L-1211 and L-1212, and
it is why `L1178SlabAssemblySurvivesReload.test.ts` passed against a live defect: it hand-built
*"exactly the payload ProjectLoader builds"* and so supplied the very payload whose absence was the
bug. §COMMITTED-IS-NOT-REACHABLE, and *a fake built from the header cannot falsify the header*.

**⛔ THE TWO AXES ARE SEPARATE AND BOTH MUST BE CHECKED.** (A) the ELEMENT INSTANCE's fields, and
(B) the TYPE / SYSTEM-TYPE CATALOGUE. A catalogue's failure mode is its own: *a destructor with no
constructor* — a store registered on `projectScopeRegistry` with a `clear`, full CRUD, and no save
path, so switching project deletes every user-authored type. Recorded three times now: handrail types
(C95 §15.7, fixed), and **still open** for `CurtainWallTypeStore` and `PhaseFilterStore` (L-1218).

**⛔ A CATALOGUE RESTORE MUST BE THE INVERSE OF ITS WRITE.** Serialisers write custom types with
`structuredClone(t)` — every field. A loader that restores a hand-written include-list is not the
inverse and silently drops the difference (L-1214: slab `loadBearing`; and before it, wall
`function`). Restore by **spreading the saved definition minus the NAMED derived fields**, so a new
authored field reaches the store without anyone editing the loader. Reference implementations:
`HandrailTypeStore` (spread minus a named exclusion), `hostedSystemTypeCodec` (ONE codec shared by
save and load), `AnnotationSystemTypeStore` (store-owned `serialize`/`deserialize` pair).

**⚠ THE L0 ZOD SCHEMAS ARE NOT THE AUTHORITY HERE, AND MUST NOT BE MADE ONE BY ASSERTION.**
`packages/schemas/src/elements/*.ts` has **zero runtime importers** — no store and none of the four
serialiser/loader files (L-1220). A gate derived from them would measure a document, not the product.
The measured authority is the serialiser's emitted key set until those schemas are actually wired
into the stores.

### EI-7 — UNDO RESTORES EVERY STORE THE EDIT WROTE

A command's declared `affectedStores` MUST equal the set its execute path actually writes.
This is **L-947**, which silently corrupted a user's slab:
`UpdateElementParameterCommand` declared `["wall"]` while `resolveStore()` routed to 15.

> ⛔ **L-947 IS NOT AN INCIDENT. IT IS THE REPO'S DEFAULT STATE.** The Q3 audit measured
> the write set against the restore set for every family and every edit kind. The
> inequality is **systemic, not per-command**, and there are **six** mutation lineages,
> not two.

**EI-7a — the repo-wide inequality.** Every bus verb writes the **plugin DTO store**
(`attachStores`, `bootstrap.ts:94,103`); `performUndo()` routes the inverse patch through
`buildUndoStoreMap()` (`performUndoRedo.ts:308-353`), whose every entry is a **legacy
`window.*Store`**. **Nothing ever applies an inverse patch to a plugin DTO store.** So
`WRITES ⊋ RESTORES` on *every* bus verb. Undo a wall create: the wall leaves the viewport
and **stays in the plugin store forever**.

This is not inferred from silence — it is named "THE UNDO HAZARD" verbatim in **fourteen
handler headers**. Sixteen verbs were then made to **refuse in `canExecute`** rather than
have their routing fixed.

> ⚠ **CORRECTED 2026-08-18 against C16 §5.1. This paragraph previously read: *"Containing a hazard
> by disabling the verb is not conformance; those verbs are dead affordances and each one is an
> EI-3 violation."* As written, C84 called COMPLIANCE WITH A CORE CONTRACT a violation, and that
> is C84 being wrong, not C16.**
>
> [C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) is unambiguous and it outranks C84 on command
> authoring: *"A verb that cannot reach authoritative state MUST fail `canExecute` with a `reason`
> naming the mechanism"*, under `CA-DOCTRINE-A`: *"A refusal that names its reason is strictly
> better than a silent lie, and both are better than a `success: true` over nothing."* **The
> sixteen refusals are the REQUIRED interim state.** A lane that "fixes" them by restoring silent
> success regresses C16, and C84 must not be citable as licence for that.
>
> **What C84 adds — and it is the half C16 does not reach — is the OTHER END of the verb.**
> CA-18 binds the *command author*; it says nothing about the **UI control that still offers the
> gesture**. The residual defect is therefore precisely and only this: **a ribbon/gizmo/panel
> affordance that remains OFFERED while its verb refuses.** That is the EI-3 violation — the
> control, not the refusal. The two exits are (a) route the write (C16 **CA-17**) and re-enable the
> control, or (b) **disable or remove the control** for as long as the verb refuses, so the user is
> never offered a gesture the system will decline. Silence in the UI while the handler refuses in
> the log is the worst of the three states and is what is shipping today.
>
> *Sixteen refusing verbs is therefore SIXTEEN C16-CONFORMANT HANDLERS and an UNKNOWN number of
> still-offered controls.* The control census is **NOT MEASURED** (§9) and is owned by
> [C82](C82-RIBBON-CAPABILITY-SURFACE.md).

> ### `[Z8]` EI-7a is UNDERSTATED. `ctx.stores.wall` IS NOT A STORE.
>
> ⚠ **HALF OF THIS BLOCK IS C03's, NOT C84's, AND IS CITED RATHER THAN RE-DERIVED (2026-08-18).**
> [C03 §4.5](C03-SCHEMAS-COMMANDS-AND-STATE.md) — *"Why not `runtime.undoStack`?"* — already states
> the mechanism in the same terms: `bus.fetchStores` = `storesProvider` =
> `storesAsRecordView(stores)` = `Object.fromEntries(store.getState())` = *"plain **snapshot
> Records with no `applyPatch`**, and even if they had one they are the **L1** store, not the
> mesh-driving legacy store (§4.4)."* **C84 does not discover this and must never be read as the
> source of it.** [C03 §4.4](C03-SCHEMAS-COMMANDS-AND-STATE.md)'s three-layer table is the
> canonical statement that the L1 bus store does not drive the mesh; C03 **U-7** is the
> already-ratified end-state (ADR-0251) in which the split folds away.
>
> **What C84 adds, and C03 does not state, is the ROUTING half:** the plugin DTO stores do not
> appear on `runtime.stores` at all, so a fix cannot re-point them there. That is the measurement
> below, and it is the only part of this block C84 owns.
>
> `runtime.stores` is a `StoresSlot` — `{ elements, registerHydrator, hydrate, viewState, project }`
> (`composeRuntime.ts:1581-1583`). `elements` is the ADR-0318 live view over `storeRegistry`, and
> `composeRuntime.ts:1549-1559` registers the **geometry singletons** into it. **The plugin DTO stores
> never appear on `runtime.stores` at all.** They reach a handler by a different channel entirely:
> `CommandBus`'s `storesProvider` (`apps/editor/src/bootstrap.ts:94`) → `storesAsRecordView(stores)`.
>
> And `storesAsRecordView` (`apps/editor/src/bootstrap.ts:148-159`) is:
>
> ```ts
> out[key] = Object.fromEntries(store.getState());
> ```
>
> **So `ctx.stores.wall` is a plain-object SNAPSHOT of a DTO store's state, rebuilt on every
> dispatch.** A handler's `produceCommand(ctx.stores.wall, …)` does not produce patches against a
> store — it produces them against a **throwaway view**, which `attachStores` then replays into the
> real DTO `Store` instance.
>
> **Why this matters rather than being a curiosity.** "The DTO store is a write-only sink" implies the
> repair is *route the write to the other store*. But the object the handler is handed is not a store
> and has no identity to re-point: it is materialised per dispatch from whichever `Store` the
> `PluginRegistry` built. Any fix must change **what the provider hands the handler**, not merely
> which store a patch lands in. This is why ADR-0331 §D3 proposes routing the FORWARD patch through
> `elementUndoStoreAdapter` — the adapter is the only thing in the repo that already turns these exact
> patches into geometry-store mutations, and it already runs on the inverse side.
>
> **The code comments are not lying; they answer a different question.** `composeRuntime.ts:1540-1543`
> claims the registered instance IS the one `registerAllStores()` registers and `ProjectSerializer`
> reads — that is **Root A internal identity**, it is true, and it is heap-proven with `toBe` across
> 15 kinds by `mt05StoreIdentityHeap.spec.ts`. Nothing there ever claimed `ctx.stores.wall`
> unification. A reader scanning for reassurance would take it as such. **That is precisely why
> EI-10(b) requires an executed proof and not a comment.**

**EI-7b — undo may never corrupt.** `elementUndoStoreAdapter.ts:289,337-338` takes
`field = p.path[1]` and writes `store.update(id, {[field]: p.value})` **for a patch of any
depth**. For `curtain-wall.addPanel`, Immer's inverse for an array append is
`{path:[id,'panels','length'], value:oldLen}` — so undo executes
`update(id, {panels: 3})` and **the panels array becomes a number**. Live, reachable,
non-refusing; same shape in `SetCurtainWallPanelType`, `AddCurtainGridLine`,
`RemoveCurtainGridLine`. A second trapdoor at `:295-297` turns a non-array `openings`
value into `[]` — **stripping every opening from a wall**.

**EI-7c — no family may be silently un-undoable.** Seven bus store keys —
`structural`, `dimension`, `section`, `sheet`, `schedule`, `view`, `selection` — have **no
entry** in `buildUndoStoreMap()`. `performUndo` returns `{status:'stranded'}`
(`:507-514`): correctly diagnosed, and **invisible to the user**. Their handlers *are*
registered in production (`engineLauncher.ts:588,606,619,622`). Ctrl+Z is a total no-op.
*(The `door`/`window`/`level` absences at `:345-352` are deliberate and documented — these
seven are not.)*

**EI-7d — a declared rollback must exist.** `CommandManagerImpl.createSnapshot()`
(`:578-638`) knows 16 store keys. A command declaring anything else takes
`scope !== null`, so the all-stores fallback at `:583-585` does **not** engage, and it
receives a snapshot of `{}` — `restoreSnapshot` then restores nothing, **with no warning**.
That is L-947's exact shape, still live, in the rollback table. Measured holes include
`curtainPanel`, `plumbing`, `schedule`, `sheet`, `view-template`, `annotation`, `catalog`,
`grid`, `hierarchy`. One test pins this invariant for **one** command; **~190 others are
unpinned**.

**EI-7e — undo restores; it does not recompute.** Only three services consult
`isReverting()` (`WallMoveReweldService.ts:298`, `SlabWallConnectivityService.ts:1047`,
`FinishHostDependencyTracker.ts:297`). `RoomTopologyObserver` is merely *paused* around
undo and **discharges the suppressed commits on `resume()`** (`:513-520`) — so after any
wall undo, room boundaries are **recomputed from the post-undo wall set, not restored**.
Whether user-authored room name/number/finish survive that recompute is **NOT MEASURED**
and is the single highest-value open question in this contract.

**EI-7f — DERIVED state is exempt from "restore set" ONLY if it is actually re-derived.**
*Added 2026-08-20, lane JOIN2 (L-1490), from the oldest live founder complaint in the queue.*

EI-7a is an inequality over the **write set**. State a family deliberately does NOT write —
recomputed at render time from state it does write — is legitimately outside it. ⭐ **But the
exemption is conditional, and the condition was never stated, so it was never met.**

> **EI-7f (NORMATIVE).** State that is deliberately DERIVED rather than persisted MUST be
> **unconditionally recomputed on restore**. A restore path MAY defer that recomputation off the
> critical load thread; it MAY NOT make it CONDITIONAL on a cache, signature or dirty-flag, and
> it MUST report completion. **"Deferred and then forgotten" is neither restored nor derived —
> it is a silent downgrade of what the user gets back, indistinguishable at every layer above
> the renderer from a successful load.**

*Measured, `wall`:* the wall MITRE is derived by construction — `§WALL-JOIN-SAVE-FIX`
(`ProjectSerializer.ts:576`) persists the **pre**-join baseline and
`§FIX-WALL-JOIN-BASELINE-IMMUTABLE` (L-44/46/47) forbids a join from ever persisting its trim, so
the join lives only in the ephemeral `JoinData`. `§WALL-JOIN-LOAD-SKIP` deferred its re-derivation
on restore and the deferral was then **discarded by a no-progress gate keyed on store geometry — a
signal a join provably never moves.** For two months every reopened project rendered square-cut,
overlapping, double-lined corners, repaired only when the user happened to create an element (which
moved the signature and released the gate). Full mechanism and the three derived rules:
[C85 §10.6](C85-ELEMENT-WALL.md#106-the-join-is-derived-not-persisted--and-a-derivation-that-is-deferred-must-be-guaranteed).

⚠ **This is a WHOLE-SUITE question, not a wall question.** Every family with render-time derived
geometry owes the same proof, and **none has been asked for it**: which state does this family
derive rather than store, and what guarantees it is re-derived on restore? Candidates visible from
here — slab weld seams, curtain-wall panel subdivision, stair stringer solves, room boundary
polygons (§LOAD-REDETECT-FREEZE skips their redetect on load, which is SAFE **only because rooms
ARE persisted and hydrated** — the same skip over an underived value is the wall defect exactly).
⭐ **The discriminating question is one line: _is the thing the load skips actually stored?_**
**NOT MEASURED for any family but `wall`.**

### EI-8 — ONE VOCABULARY PER CONCEPT

A material, a profile or a shape has ONE canonical vocabulary. Transcribed copies are
forbidden.

*Measured:* **five** material vocabularies — the 204-entry `STANDARD_MATERIAL_LIBRARY`; the
16-entry `RENDER_MATERIAL_LIBRARY` overlay; **18 independent** per-plugin
`material-bridge.ts` palettes (three of which take `_key` and **discard it**, so they
cannot express a material at all); the hand-transcribed 15-entry `FINISHES` in
`finishRef.ts`, whose own header at `:14` states the maintenance obligation *"If the
library recolours a finish, update the hex here in the same commit"*; and the 6-value
`materialName` enum in `HandrailTypeStore.ts:28`.

> ⚠ **`materialName` is the one vocabulary carrying PHYSICAL semantics, not hue** —
> `HandrailTypeStore.ts:19-26`: *"`materialColor` is a render tint; it is not a material…
> the name carries roughness / metalness / transparency"*. Any unification that collapses
> it to a hex **loses information** and is forbidden.

**`[Z8]` EI-8a — a licensed copy is pinned by a TEST, never by a comment.** Where EI-10 licenses a
transcribed table, that copy MUST be pinned to its master by an executed test comparing **every**
value. A comment stating the maintenance obligation — `finishRef.ts:14`, *"update the hex here in the
same commit"* — **is the mechanism that has already failed twice, measured**: colour names drifted
(`black` = `#333333` at `QueryEngine.ts:1139` vs `#000000` in five other tables; `green` = `#008000` at
`PropertyRenderer.ts:209` vs `#00ff00` in four), and style aliases drifted (`rustic` → mediterranean at
`styleFinish.ts:246` vs farmhouse at `StyleRegistry.ts:283`).
*The compliant example to copy:* the five `*Determination` modules
(`windowOpeningStoreDetermination.ts`, `boundingWallDetermination`, `wallRoomAdjacencyDetermination`,
`storeReadDetermination`, `roomStoreDetermination`) each restate one member of the closed
`UndeterminedReason` union because `@pryzm/command-bus` is not a declared dependency — **and each is
pinned by a companion test against the command-bus source.**

---

### `[Z8]` EI-9 — ONE ANSWER PER QUESTION

EI-1 governs **stores**. This governs **every other kind of answer**: a geometry function, a predicate,
a constant table, a routing decision.

> For any question the system answers — *"where does this wall start vertically"*, *"what hex is
> black"*, *"which command deletes this kind"* — there is exactly ONE implementation, and every
> consumer reaches it.

A second implementation is a violation unless it satisfies EI-10 in full.

*Measured violations:* `buildCurvedLayerGeometry` exists **three times**
(`CurvedWallLayerBuilder.ts:36`; an inline near-verbatim duplicate at `WallFragmentBuilder.ts:1607-1838`,
both live and split by a layer-count branch; and `producers/_internal/buildCurvedLayer.ts:56`) ·
`buildMiterPrism` twice (`MiterPrismBuilder.ts:53`, `producers/_internal/buildMiterPrism.ts:21`) ·
the `ElementType` union **four** times (`schemas/Id.ts:79` 30 members · `CoreElement.ts:7` 18 ·
`AITypes.ts:16` 11 · `ai/types.ts:16` 11, byte-identical to the third) · six colour-name tables ·
the wall's world-base-Y, computed at **ten** independent sites.

#### EI-9.1 — A HAND-WRITTEN LIST OF THE ELEMENT FAMILIES IS A SECOND ANSWER (normative; L-3540, 2026-08-22)

**"Which element families exist" is a question, and EI-9 applies to it. A surface that needs the
answer MUST DERIVE it from the one declared family table. A literal array of family names is a
second implementation and is a violation — even when it happens to be correct on the day it is
written, because its failure mode is not being wrong, it is falling BEHIND, silently.**

⭐ **THIS RULE IS WRITTEN FROM THREE RECURRENCES, NOT ONE.**

1. `ElementTypeSelectorZone.ts`'s `ELEMENT_TYPE_LABELS` declared **SIX** families while the engine
   published **TWENTY** element stores — fourteen families could not be inspected at all. Closed by
   §INSPECT-EVERY-CATEGORY (L-2032), which minted `inspectCategories.ts` as THE declaration and
   `__tests__/InspectCategoryCoverage.test.ts` as the gate that fails CI when a new
   `window.<x>Store` family has neither a row nor a written exclusion.
2. `LevelExplodeController`'s reconcile trigger was a hand-maintained allowlist of per-type
   `bim-<type>-added|updated|removed` events; it omitted rooms, labels, handrails, openings,
   plumbing and lighting (§FIX-LEVEL-EXPLODE-RECONCILE-ALL-TYPES, L-233).
3. `initUI.ts`'s `SEMANTIC_TYPES_FOR_ZOOM` — the double-click-to-frame allowlist — held **14**
   entries and was missing **NINE** real families (rooms, stairs, stair-railings, handrails, lifts,
   openings, curtain-panels, lighting, plumbing). Double-clicking any of them framed the whole
   level group instead of the element, which reads as *"zoom does nothing useful here"*. **The
   feature was not missing; its family list was.**

⚠ **THE DIAGNOSTIC VALUE OF THIS CLAUSE IS C01 §6 RULE 6.** All three presented to a user as
*"PRYZM cannot do X for family F"*, which is indistinguishable from *"PRYZM cannot do X"* — ABSENT
and UNREACHABLE again, and their fixes are opposite (build the feature vs. add F to a list). Before
building a family-facing capability, **grep the family list of the nearest existing one**: the
capability is more often present and narrow than absent.

**The derivation is cheap and it inherits the guard.** `SEMANTIC_TYPES_FOR_ZOOM` is now
`INSPECT_CATEGORIES.map(c => c.meshType)` plus three explicitly-reasoned non-family literals
(`ifc-element`, `ifc-model`, the legacy un-hyphenated `curtainwall`). The coverage test that already
protects the Inspect dropdown now protects the camera too, at zero extra cost — which is the point:
**deriving does not merely avoid a copy, it borrows the copy's gate.**

### `[Z8]` EI-10 — WHAT A SECOND IMPLEMENTATION MUST EARN

A second implementation of one question is admissible **only** with all four of:

- **(a) A NAMED REASON** in the file header, stating what the first cannot do — a layer boundary, a
  purity constraint, a runtime that cannot host it. *"Convenience"* and silence are not reasons.
  *Compliant:* `packages/ai-host/src/intents/finishRef.ts:8-14` — transcribes 15 hexes because
  `materialLibrary.ts` constructs `THREE.Color` at module load and the resolver must stay pure.
- **(b) AN EXECUTED EQUIVALENCE PROOF** — identical inputs into both, compared numerically. **Reading
  two files and judging them equivalent does not satisfy (b)**; C16 CA-21's rule applies unchanged.
  *Compliant:* `tests/parity/wall/stackAB-miter-parity.test.ts`.
- **(c) A DECLARED DIVERGENCE LIST** — every input on which they legitimately differ, and why. An empty
  list means byte-identical, and must be **asserted**, not assumed.
- **(d) A RETIREMENT CONDITION.** A second implementation with no exit is permanent debt with a comment
  attached.

> **EI-10a — the licence is per-QUESTION, not per-FILE.** `CurtainPanelBuilder.ts:4` (*"thin façade over
> `CurtainPanelFactory.buildPanelObject()`"*, importing it at `:30`) needs no licence: it answers a
> different question and calls the other. Use §3.5 to tell the cases apart.

### `[Z8]` EI-11 — WHAT THE USER SEES AND WHAT THE SYSTEM EXPORTS MUST BE THE SAME CODE

> The geometry a user SEES and the geometry the system EXPORTS, BAKES or PERSISTS must come from the
> **same function**, on the **same inputs**.

> **This sentence is [C73 §1.1](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) + [C73 §3.1](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md)
> specialised to one family, and it is cited, not coined.** C73 §1.1: *"Geometry is a **pure function
> of authoritative model state**. Given the same model, a regeneration produces the same geometry."*
> C73 §3.1: *"Each **predicate family** has exactly **one** implementation, in one named canonical
> file."* **What EI-11 adds is the CONSUMER axis** — C73 ranges over implementations of one
> *predicate*; EI-11 ranges over the *surfaces* (viewport vs bake vs export vs persist) that may each
> reach a different implementation. ⚠ C73 §3.1's enumerated in-scope family list does **not** contain
> the wall-layer or miter families, which is where the divergence below lives; that is a gap in
> C73's list, reported in §10.

This repository builds wall geometry twice: **Stack A** (`packages/geometry-wall` → `WallFragmentBuilder`
→ `initBuilders.ts` → the viewport) and **Stack B** (`packages/geometry-kernel/src/producers` →
`produceWall` → `HeadlessBakeSession.ts:124` → `RebakeChunkJob.ts:79`, shipped in
`pryzm-selfhost/docker-compose.yml:94`).

**Nothing compared them until 2026-08-18.** `tests/parity/wall/wall-snapshot.test.ts` snapshots Stack B
against *itself*; `wall-headless-node.test.ts` compares Stack B in-process to Stack B in a
`worker_thread`. **Both are Stack-B-only.** A parity harness that compares a stack to itself does not
satisfy this invariant.

*Measured on identical inputs* (`stackAB-miter-parity.test.ts`): 9 of 10 cases agree, with an
**observed worst spread of 2.2e-7 m** — float32 storage noise — and **`curved-MITERED-both-ends`
diverges by 9.774 m** on a 5 m-radius arc.

> ⚠ **`2.2e-7` IS AN OBSERVATION, NOT THE GATE. Corrected 2026-08-18.** This bullet previously read
> *"agree to ≤2.2e-7 m"*, which states an observed spread as though it were the accepted threshold.
> The harness's actual threshold is `const TOL = 1e-4` (`:107`) plus `toBeCloseTo(…, 4)` = 5e-5 —
> **three orders of magnitude looser than the number C84 quoted.** Reporting the tightest observation
> as the tolerance is the mirror image of §8.f (reporting a defect as a tolerance) and is equally
> misleading: it makes the harness look far stricter than it is. Neither number is
> [C73](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md)'s — C73 §5.1 **E1** records that the canonical
> tolerance module is **specified and not yet built**, so this harness had none to consume. **When
> it lands, it MUST consume C73's declared, unit-qualified tolerance and MUST NOT ship `TOL`.**
Stack A (`CurvedWallLayerBuilder.ts:69-83`, `§FIX-CURVED-WALL-MITER-WATERTIGHT`) projects the miter
plane and **writes back into the corner table its face loops consume**; Stack B
(`buildCurvedLayer.ts:133-137, 159-165`) projects the cap quad only and its face loops (`:95-118`)
consume unprojected stations. **9.774 m is a defect, not a tolerance** — and the compliant response
is the `it.fails` pin, because [C73 §2.5](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) forbids the
alternative: *"A tolerance may not be **widened** to make a test, a gate, or a user-visible artefact
pass."*

> ⛔ **[C73 §3.7](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) IS NOT YET SATISFIED HERE, AND C84 MUST
> NOT READ AS THOUGH IT WERE.** §3.7: *"Where copies **disagree**, the collapse states which
> behaviour is canonical and why. A silent pick is a behaviour change shipped as a refactor."*
> C84 records the divergence and pins it; **it never declares which stack is right.** Stack A carries
> `§FIX-CURVED-WALL-MITER-WATERTIGHT` and Stack B predates it, which is evidence but not a
> declaration. **The C73 §3.7 declaration is OWED** and is listed in §10.

> **EI-11a — a caller may not silently substitute inputs.** `HeadlessBakeSession.ts:139` calls
> `produceWall(w, NO_JOINS, 0)` — neighbour joins discarded, level elevation forced to zero, both
> self-documented *"v0"*. **Identical code with substituted inputs is not the same answer.** A
> substituted input must be declared under EI-10(c) and must refuse loudly rather than bake a plausible
> wall at the wrong height.

### `[Z8]` EI-12 — A REGISTERED TRIGGER MUST HAVE A PROVEN DISPATCHER

A cascade rule, consequence planner, event subscriber or trigger table keyed on a verb MUST name a
production dispatcher of that verb, proven by a call site — **or declare itself dormant** with the
condition under which it becomes live.

*The worked example, and it nearly bought a wrong fix.* `plugins/cross/src/wall-room.ts:53,61` registers
`wall.delete` as the wall→room cascade trigger, and nothing dispatches `wall.delete`. The obvious repair
— make the delete path dispatch it — **would have changed nothing**: `new CascadeRunner()` occurs only
in `packages/command-bus/__tests__/cascade.test.ts`, `cascade-promotion.test.ts` and
`plugins/cross/__tests__/handlers.test.ts`; `buildWallRoomCascadeRule` has **zero** non-test call sites;
the registration example at `wall-room.ts:45` is **commented out**. The real gap is the unregistered
cascade subsystem, already dispositioned to BIM30 plan R2 (ADR-0322 / STR-06 §18, recorded verbatim at
`plugins/rooms/src/handlers/RecomputeRoomBoundary.ts:39-45`).

> **A trigger with no dispatcher and a dispatcher with no runner fail identically — silently — and read
> the same to a reviewer. Name which one you have.**

### `[Z8]` EI-13 — AN EMITTER WITH NO CONSUMER IS A DECLARED GAP

Either wire the consumer or delete the emitter; an unconsumed emitter that stays must carry the reason
inline.

*Measured:* nine events emitted by `CommandEventBridge.ts` have **zero** `events.on` subscribers
repo-wide — `slab.layer-updated:937`, `ceiling.layer-updated:957`, `floor.layer-updated:977`,
`room.created:689`, `grid.created:699`, `plumbing.created:854`, `structural.created:864`,
`annotation.created:874`, `dimension.created:884`. The three `*.layer-updated` are the **only**
mutation-shaped events the bridge emits besides `element.level-changed`, and all three fall on the
floor. *The precedent for the fix is in the same file:* `CommandEventBridge.ts:627-631` records
`door.created` / `window.created` / `stair.created` being **deleted** for exactly this reason.

---

## 3.5 `[Z8]` The classification test — *"duplicated" or "CO-LIVING"?*

⛔ **Nothing may be deleted, merged, or called a duplicate on a name match.** Apply this test and record
the evidence. It exists because applying it **downgraded four findings** that a name-match census had
ranked as defects.

| Verdict | The test | Evidence required | Action |
|---|---|---|---|
| **CO-LIVING** | Both reachable; they answer **different questions** | different inputs **or** different outputs, cited | none — record why |
| **STAGE** | One **calls** the other | the import + the call site | none |
| **LIVE FORK** | Both reachable, **same question**, selected by a branch | the branch condition, `file:line` | EI-10 licence, or converge |
| **PARKED** | Behind a flag, default off, reason recorded | the flag + the recorded reason | loaded gun — log it, do not delete |
| **RENDER-DEAD / OTHER-HOST-LIVE** | No importer in host X, **live in host Y** | importer census **across all hosts** | ⛔ **NOT deletable** |
| **TRULY DEAD** | Zero reachability on **both** axes below | the full census | deletable |

### 3.5.1 — The reachability census has ~~TWO~~ **FOUR** axes, and a deletion requires ALL of them

> ⚠ **AMENDED 2026-08-18 — this section said TWO axes and was itself an instance of the defect it
> describes: an under-counted census, stated with confidence.** Two further axes were found by
> measurement, each by a claim that both original axes passed and that was still wrong.
>
> **(c) THE BUILD-GRAPH AXIS.** A package can be load-bearing through files that contain no import
> of it at all — a workspace manifest, a lint-config scope block, a gate's hardcoded exclusion
> list, a release config. *Measured instance:* [C14](C14-LEGACY-ELIMINATION-AND-PRYZM3-ENFORCEMENT.md)
> §3 LP-09 orders `legacy-shim` **DROPPED**, asserting *"Zero importers confirmed"* three separate
> times. It has **four live non-import references**: `package.json:158`
> (`"@pryzm/legacy-shim": "workspace:*"`), `eslint.config.js:561` (an active scope block whose own
> rationale at `:556` states it is *"a fixture for `pryzm/no-raf` — by design"*),
> `tools/scripts/check-no-raf-in-pryzm2.mjs:49` (a hardcoded exclusion path), and the
> `eslint-plugin-pryzm` integration test C14's own §3 quotes. **Neither axis (a) nor axis (b) can
> see any of these.**
> ⛔ **And the stakes are not academic:** `check-raf-count.ts` is the **P3 gate**, recorded in
> C01 §1 as *hard-fail and currently FAILING*. Executing C14's deletion order would remove the
> fixture two rAF-enforcement scripts carry hardcoded paths for — **perturbing the instrument
> while it is already red.**
>
> **(d) THE CALL AXIS, distinct from (a).** A symbol can be imported, constructed and bound in
> production and still never be *invoked*. *Measured instance:* `CommitterHost` is constructed at
> `apps/editor/src/bootstrap.ts:106`, so axis (a) reports it live — yet
> `CommitterHost.setViewDistance` has **zero call sites repo-wide** (three occurrences, all inside
> its own declaration file), so the LOD tier is constant for the whole session. [C04](C04-RENDERING-AND-SCHEDULING.md)
> §3.5.2 asserts it is *"called every frame by the render loop"*. **Axis (a) says live, axis (d)
> says dead, and both are correct about different questions.**
>
> ⭐ **The generalisation, which is the point:** *"is it constructed?"*, *"is it written?"*,
> *"is it invoked?"* and *"does the build depend on it?"* are FOUR questions. Answering one and
> reporting it as reachability is how a CANONICAL contract came to carry a standing deletion order
> for a live fixture, and how a per-frame system came to be documented as driven when nothing drives
> it. **State which axes you measured. Never infer the others.**

A write can arrive at a store **through a bus verb**, touching no importable symbol. A census that greps
for **callers of the store** misses it entirely.

A write can arrive at a store **through a bus verb**, touching no importable symbol. A census that greps
for **callers of the store** misses it entirely.

*Measured instance:* a lane reported a plugin pipeline had *"no production call site"*. **False** —
`RailingPlanToolHandler.ts:92` dispatches the bus verb `handrail.create`. The store had no callers; the
verb had a dispatcher.

> **Every reachability claim MUST state which axes it measured. A DELETION claim requires ALL FOUR:**
> **(a) the import/construction axis** — who imports or `new`s it; **(b) the bus axis** — which verbs
> write it, and whether any production surface dispatches those verbs; **(c) the build-graph axis** —
> workspace manifests, lint-config scope blocks, gate exclusion lists, release config; **(d) the call
> axis** — whether the symbol is actually *invoked*, not merely constructed.
>
> **A claim that names fewer than four axes is not a deletion claim.** It is a partial census, and it
> must say so.

### 3.5.2 — The census MUST include non-editor hosts

`apps/bake-worker` · `apps/sync-server` · `apps/api-gateway` · `apps/marketplace-api` · `apps/headless` ·
`apps/bench` · `pryzm-selfhost/` · `server/` · `tools/` · `tests/`.

**Not hypothetical.** All **26** `geometry-kernel/src/producers/*.ts` have zero *editor* render call
sites and read as dead — `bootstrapRenderEverything` is never invoked because `src/main.ts:407` passes
`canvas: null`, and no production `runtime.scene.mount(` call site exists. But
`HeadlessBakeSession.ts:23,131` calls `produceWall` for real, and that worker ships in
`pryzm-selfhost/docker-compose.yml:94`. **An editor-only census would have deleted the self-host bake
pipeline.**

⚠ **Membership is per-family, not blanket:** `produceHandrail` and `HandrailCommitter` **are** genuinely
dead — never instantiated, and handrail is absent from the bake worker entirely. Wall's answer does not
transfer.

### 3.5.3 — Worked verdicts, so the test is not abstract

- `SlabFragmentBuilder` / `FloorPanelBuilder` / `CeilingPanelBuilder` → **CO-LIVING** (structural slab vs
  floor finish vs ceiling finish; all live at `initBuilders.ts:348, 422, 391`).
- `CurtainPanelBuilder` → **STAGE** (`:4` self-describes as a façade; imports the factory at `:30`).
- `StairPreviewRenderer` / `CurvedStairRenderer` → **CO-LIVING** (Canvas2D overlay previews,
  `getContext` at `:77`/`:49` — not 3-D geometry).
- `buildCurvedLayerGeometry` #1 vs #2 → **LIVE FORK** (`WallFragmentBuilder.ts:1607` vs `:1844`, split on
  layer count; identical output at `layerOffset = 0`).
- **The ten `<kind>.delete` bus verbs → DORMANT, not latent bugs.** No UI, chat or collab path dispatches
  any; every real delete reaches `DeleteElementCommand`. ⛔ **Do not delete them** — they are the
  PRYZM 3 target vocabulary. *This verdict downgraded the audit's own highest-ranked finding.*
- `RENDER_MATERIAL_LIBRARY` → **UNWIRED OVERLAY, not a rival master** — 16 entries, one display-only
  importer (`MaterialsBucket.ts:16`), **zero** call sites for its functional exports. Inflating this into
  a rivalry costs the audit credibility on the findings that are real.

---

## 4. AS-IS conformance — measured 2026-08-18

`✅` conforms · `⚠️` violation · `—` capability absent · `?` NOT MEASURED

> ⛔ **CORRECTED 2026-08-19 — the curtain-wall EI-6 cell said `✅ persists` and the family's panel
> authority is NEVER PERSISTED AND NEVER LOADED.** `CurtainPanelStore` — the *declared* authority for
> panels — has **zero matches in both live persistence files**, and `ProjectStores` carries no member
> for it. Every `panelType`, every `materialOverride` and **all six `hostedDoor` fields** are destroyed
> on save. [L-1057](../../04-reference/ISSUE-LOG.md).
>
> **Why a `✅` survived here is the lesson, not the defect.** Panels are silently **REGENERATED** on
> load as `SystemPanel_Glass`, so a reloaded façade comes back with the **right cell count and a
> plausible appearance** — it simply is not the façade the user authored. A persistence check that
> asks *"did something come back?"* passes; only one that asks *"did the AUTHORED value come back?"*
> fails. **This is the second family with this exact shape** — `lighting` is the first — which makes
> it a class, not an incident: ⚠ **every other `✅` in this column was graded by the same question and
> none of them is safe until re-asked.**
>
> Not fixed by CW1, and correctly so: it is a file-format change (C05 `SNAPSHOT_SCHEMA_VERSION`)
> across two shared files, and unprovable by unit test.

| Family | EI-1 authority | EI-2 no silent loss | EI-4 delete | EI-5 symmetric | EI-6 persists |
|---|---|---|---|---|---|
| wall | ⚠️ split (viewport ／ bake) | ⚠️ `materialId` dropped | ✅ | ⚠️ DTO orphaned | ✅ |
| wall.opening | ⚠️ **two rival records** | ✅ refused upstream | ⚠️ button → `success:false` | ⚠️ DTO orphaned | ✅ |
| curtain-wall | ✅ legacy | ⚠️ **per-panel kind/material/rotation collapsed** | ✅ | ⚠️ DTO orphaned | ⛔ **VIOLATION — this cell read `✅` and it is FALSE** (measured 2026-08-19, lane CW1, [L-1057](../../04-reference/ISSUE-LOG.md)) |
| ceiling | ✅ legacy | ⚠️ per-vertex `y` flattened; colour dropped | ✅ | ⚠️ DTO orphaned | ⚠️ no IFC reader |
| roof | ✅ legacy | ⚠️ **skylights never cut**; `baseOffset` inert | ✅ | ⚠️ DTO orphaned | ✅ |
| column | ✅ legacy | ⚠️ `i-section` via `as any` | ✅ | ⚠️ DTO orphaned | ✅ |
| slab | ✅ legacy | ⚠️ **holes dropped**; batch extents → 1 m | ✅ | ⚠️ DTO orphaned | ✅ |
| beam | ✅ legacy | ⚠️ rotation has no field; shape via `as any` | ✅ | ⚠️ DTO orphaned | ✅ |
| floor | ✅ legacy | ✅ most complete of the twelve | ✅ | ⚠️ **no delete verb** | ⚠️ no IFC reader |
| handrail | ✅ legacy | ⚠️ **path collapsed**; profile constant | ✅ | ⚠️ DTO orphaned | ✅ |
| lighting | ⚠️ renders, never saves | ⚠️ 10 fields dropped; EI-3 10-of-12 | ⚠️ button → `success:false` | ⚠️ DTO orphaned | ⚠️ **NEVER** |
| furniture | ✅ legacy | ⚠️ **TOTAL — disjoint vocabularies** | ✅ | ⚠️ DTO orphaned | ✅ |
| stair | ✅ legacy | ? no `.created` bridge | ✅ | ⚠️ DTO orphaned | ✅ |
| room/space | ✅ legacy | ? `room.created` has no subscriber | ⚠️ `success:false` both paths | ⚠️ generators only | ✅ |
| plumbing | ✅ legacy | ? | ✅ | ⚠️ DTO orphaned | ✅ |

**Not one family conforms on all five axes.** That is the finding, and it is why this is a
contract rather than an issue-log entry.

**EI-7 has no column because it has no variation: every family fails it.** The
write-set ⊋ restore-set inequality (EI-7a) holds on *every* bus verb of *every* family. The
only family whose write and restore sets match is **room/space**, and only because all nine
of its verbs delegate to a legacy command that snapshots the full pre-edit record. That is
the shape the other fourteen must reach.

**Severity order for remediation** — by what a user loses, not by how many sites:

| # | Defect | Loses | Invariant |
|---|---|---|---|
| 1 | Lighting never persisted | **the work itself**, on every save | EI-6 |
| 2 | Curtain-wall undo writes a number into `panels` | **the model**, silently, on Ctrl+Z | EI-7b |
| 3 | Furniture payload totally mangled, `parse()` succeeds | every furniture item's identity | EI-2 |
| 4 | Roof skylights / slab holes dropped at the bridge | the hole the user drew | EI-2 |
| 5 | Delete button `elementType`-blind | nothing happens, no error | EI-4 |
| 6 | Seven families stranded from Ctrl+Z | undo silently no-ops | EI-7c |
| 7 | `createSnapshot` ignores 11 declared keys | rollback that was promised | EI-7d |

---

## 4A. THE MUTATION LINEAGES — there are SIX, not two

Every per-element contract MUST state which lineage each of its verbs travels. Measured:

| # | Lineage | Undo stack | Representative site |
|---|---|---|---|
| **L1** | Bus verb + `produceCommand` Immer patches | ring buffer | `plugins/wall/src/handlers/CreateWall.ts:329` |
| **L2** | Legacy `Command` on `commandManager` | `CommandManagerImpl.history:132` | `packages/command-registry/src/walls/CreateWallCommand.ts:59` |
| **L3** | Bus verb declaring `affectedStores: []`, bridging to L2 via `_cmExec` | L2's stack only | `initBusHandlers.ts:595` — **~30 handlers** |
| **L4** | Hand-forged `PatchPair` pushed straight to the ring buffer | ring buffer | `UpdateWallBaseline.ts:38-41` |
| **L5** | `CustomEvent` → PRYZM-1 command | **neither** | `plugins/rooms/src/handlers/RedetectRooms.ts:82-90` |
| **L6** | Direct store write, zero capture, `affectedStores: []` | **neither** | `plugins/curtain-wall/src/handlers/ReplacePanel.ts:137` |

**L5 and L6 are unconditional violations of EI-7.** Ctrl+Z skips straight over them. `ReplacePanel`
additionally produces its patches against a **fake 2-field literal** (`:114-127`) while the real
write goes elsewhere — patches that describe a mutation that did not happen.

> ⚠ **`ctx.stores.<key>` IS NOT A STORE — stated once, under EI-7a, and cited here.**
> The mechanism is [C03 §4.5](C03-SCHEMAS-COMMANDS-AND-STATE.md)'s (`storesAsRecordView` →
> `Object.fromEntries(store.getState())` → *"plain snapshot Records with no `applyPatch`"*); the
> routing consequence is the `[Z8]` block under **EI-7a**. *(This paragraph previously restated
> both in full — the third statement of one fact inside one contract. Removed 2026-08-18 under
> EI-9: **one answer per question** binds C84's own prose before it binds anyone's code.)*

---

## 4B. THE VERB AXES — per-verb conformance

Every per-element contract MUST carry this table for its family. Cross-cutting findings:

### CREATE
Bridged for **12** families via `.created` (`initTools.ts:1059, 1260, 1408, 1511, 1591, 1636,
1708, 1773, 1824, 1919, 1967, 2031`). **`stair` and `room/space` have no `.created` bridge** —
`CommandEventBridge.ts:626-631` deliberately removed door/window/stair; `room.created`
(`:687-694`) carries `levelId` and nothing else **and has no subscriber**. Every create writes
BOTH the DTO view and the legacy store; every undo restores only legacy.

### BATCH CREATE
CEB rewrites batch `commandType` to the single-create spelling (`:282, 397, 469, 540, 611, 675,
811`), so the `!== '*.batch.create'` guards in the wall/column/slab bridges are **dead code**.
Batch slabs lose `width`/`depth` and are forced to `position:{0,0,0}` (`:392-407`), then defaulted
to **1 m extents** at `initTools.ts:1728-1729`. One patch pair covers N elements — correct.

### DELETE
Two UI paths that disagree — see EI-4. `DeleteElementCommand` has **14 branches**, none for
`lighting`, `room` or bare `opening`; the fallback at `:650` returns `success:false`.
**21 of 22** plugin `*.delete` verbs have no production caller; `plugins/floor` declares none at
all. *(A fix landing this session removes the second route rather than duplicating its routing
table — the correct direction: one path, not two agreeing ones.)*

### MOVE / TRANSFORM
**Sixteen move-class verbs REFUSE in `canExecute`** rather than route correctly — `wall.move`,
`wall.transform`, `door.move`, `window.move`, `slab.move`, `roof.move`, `column.move`,
`beam.move`, `furniture.move`, `lighting.move` and more. **Each refusal SATISFIES
[C16 CA-18](C16-COMMAND-AUTHORING-PROTOCOL.md) and must not be "fixed" by restoring silent
success** — see the correction under EI-7a. The EI-3 violation is the **still-offered UI control**,
not the refusal. The live move paths are L4
(`UpdateWallBaseline`, `UpdateFurnitureParameters`) — correct by accident, not by design.
Their reweld cascade is a **separate L3 verb** (`CascadeWallBaseline.ts:35,58`,
`affectedStores: []`), so **one gesture produces two undo entries on two different stacks**.

### ROTATE
`Beam.rotation` exists in the payload and **`BeamData` has no rotation field at all**
(`CEB:572-584`) — a rotated beam un-rotates. A genuine representational gap, not an omission.
`stair.rotate` (L1) writes the DTO view only. `furniture.rotate` refuses.

### PARAMETER / DIMENSION CHANGE
`UpdateElementParameterCommand` post-L-947 routes by `ELEMENT_STORE_ROUTES:112-148` and restores
correctly — **but the audit-neutral restore covers `wall`/`door`/`window` ONLY**. Its own
`:213-218` concedes that slab, stair, roof and furniture **stamp a fresh `metadata.version` on
undo**, so undo is not audit-neutral for four families.

### MATERIAL / COLOUR
**Every `*.setMaterial` verb refuses** — six of them. The live paths are L2/L3. `wall.materialId`
is dropped at the bridge though both ends hold the field (`CEB:236-256`); `ceiling.materialId` is
read into the cast at `:666` then dropped at `:673-682`. Handrail's committer
(`material-bridge.ts:5-7`) returns a **constant hex** regardless of key.

### LEVEL CHANGE
`ChangeWallLevel` / `ChangeRoofLevel` (L1) write the DTO view; undo routes via `changeLevel()`
(`elementUndoStoreAdapter.ts:321-332`, §L-946) and re-registers `bimManager` + VDT. **Neither
writes a LevelStore** — stated in `ChangeWallLevel.ts:8-13`.

---

## 4C. CASCADES — what a mutation triggers, and whether undo reverses it

| Cascade | Reversed? | Evidence |
|---|---|---|
| hosted openings on wall delete (L2) | ✅ | `DeleteElementCommand.ts:243,250-267`; restored via `_restoreRelationships` |
| hosted openings on wall delete (**L1 bus verb**) | ⛔ **no cascade at all** | `DeleteWall.ts:14-17` — openings and `childrenIds` orphaned |
| slab openings on slab delete | ✅ | `DeleteSlabCommand.ts:85-92`, restored `:145-157` |
| wall joins on delete | ⚠ snapshot only | `:218-232`; header `:34-40` concedes the resolver "cannot guarantee the EXACT pre-delete trim" |
| ceiling holes on ceiling delete | ⚠ partial | `:586-591` unregisters, **no store removal** |
| ~~room `boundingWallIds` on wall delete~~ → **floor/ceiling** `boundingWallIds` | ✅ **CLOSED** | ⚠ **C84 WAS WRONG ON THE FAMILY AND STALE — see correction below.** [C79 §9.3](C79-REGION-SEMANTICS.md) |
| `joinedToRoofIds` back-refs on roof delete | ⛔ dangling | Same class as above; owner is [C79 §7.2](C79-REGION-SEMANTICS.md) — POPULATE, REMOVE or DECLARE. Still open |
| semantic graph edges | **? UNPROVEN** | ⚠ **was `✅ every family` — C84 awarded a pass BY READ. See correction below.** [C71 §5.8](C71-GRAPH-AND-TOPOLOGY.md) |
| stair → railing re-sample | ⛔ event-driven, never reversed | `MoveStair.ts:98-101` |
| curtain panel rebuild | ⛔ event-driven, never reversed | `ReplacePanel.ts:133-135` |
| room topology after ANY wall undo | ⛔ **recomputed, not restored** | `RoomTopologyObserver.ts:513-520` discharges on `resume()` |

> ### ⚠ TWO CELLS OF THIS TABLE WERE WRONG. Corrected 2026-08-18; the retractions are kept, per §0.
>
> **(a) `semantic graph edges | ✅ every family` was a PASS AWARDED BY READ, and the awarding
> contract forbids exactly that.** [C71 §5.8](C71-GRAPH-AND-TOPOLOGY.md): *"**UNPROVEN, and named as
> such.** … **whether undo of an edit reverses the SemanticGraph edges the same command wrote** …
> **no runtime probe has been executed against a live graph**."* C71 §6's
> `check-graph-delete-integrity` — which **does not exist at HEAD** — requires *"the undo half proven
> by **executed read-back rather than by the presence of a restore call**."* C84's whole evidence was
> the presence of a restore call. **That is the precise thing EI-10(b) and
> [C16 CA-21](C16-COMMAND-AUTHORING-PROTOCOL.md) forbid, committed by C84 in its own conformance
> table.**
> **And it is not merely unproven — it is measurably not universal:** `_captureRelationships` occurs
> in **seven** L2 `packages/command-registry` delete commands (`RemoveCeilingCommand`,
> `RemoveFloorCommand`, `DeleteHandrailCommand`, `DeleteLevelCommand`, `DeleteRoofCommand`,
> `DeleteStairCommand`, `DeleteElementCommand`) and in **zero** L1 plugin `*.delete` handlers — which
> the row two lines above already says (`DeleteWall.ts:14-17`, *"no cascade at all"*). `✅ every
> family` cannot hold across 15 families and six lineages when the mechanism lives in seven legacy
> commands.
> **Newly recorded, and C84 had missed it: those seven copies are themselves an EI-9 violation** —
> one question (*"what edges did this delete strand?"*), seven private implementations, no licence
> under EI-10.
>
> **(b) `room boundingWallIds … field has no writer anywhere` was wrong on the FAMILY, wrong on the
> CLAIM, and five days stale.** The header C84 cites — `boundingWallDetermination.ts:5-10` — names
> **`CreateFloorCommand` / `CreateCeilingCommand`**, not room. Room's array **is** populated by
> construction: `RoomDetectionEngine.ts:518`, `UpdateRoomBoundaryCommand.ts:61`, and
> `RoomDataSchema.ts:177` declares it **required**. [C79 §7.1](C79-REGION-SEMANTICS.md) says so
> verbatim — *"but only for rooms, whose array is populated"* — and **[C79 §9.3] records the floor and
> ceiling half CLOSED on 2026-08-13 via (a) POPULATE**, before C84 was written. C84 read a
> determination module's *reader* rationale as a *writer* census. **§8.a in a new costume: the file
> was named for the field, not for the family.**
> *The surviving, real finding from C79 §10.3, which C84 should have had:* the array **is** populated
> but as a `Set` — `PlanarTopologyEngine:174` does `[...new Set(face.wallIds.filter(Boolean))]`,
> **collapsing the ordered, index-aligned per-half-edge record the walk had into unordered
> membership.** That is an EI-2(d) *collapse-a-sequence* violation, and it is live.

**Only THREE services consult `isReverting()`** — `WallMoveReweldService.ts:298`,
`SlabWallConnectivityService.ts:1047`, `FinishHostDependencyTracker.ts:297`. Every other reactive
observer runs forward during an undo. **The suppression protocol itself is
[C72 §4](C72-PROPAGATION-AND-PREVSTATE.md)'s, not C84's** — see the EI-7e correction.

---

## 4D. BUILDERS AND THE TWO GEOMETRY STACKS

**Stack A** = `packages/geometry-*` fragment builders — live in the viewport.
**Stack B** = `packages/geometry-kernel/producers` + committers — **dead in the editor, live in
the bake worker** (`HeadlessBakeSession.ts:131`, shipped in `pryzm-selfhost/docker-compose.yml:94`).
Stack B is reachable only via `composeRuntime.ts:1391 bootstrapScene` inside `runScene(canvas,…)`;
production boot passes `canvas: null` (`src/main.ts:407`).

**First-ever A/B parity harness** (`tests/parity/wall/stackAB-miter-parity.test.ts`): **9 of 10
cases agree to ≤2.2e-7 m**; `curved-MITERED-both-ends` **diverges by 9.774 m** — Stack A projects
the miter plane into the corner table its loops consume
(`CurvedWallLayerBuilder.ts:69-83`); Stack B projects the cap quad only and its loops consume
unprojected stations (`buildCurvedLayer.ts:133-137,159-165`). **Stack B predates a fix Stack A
shipped.** Pinned `it.fails`.

> ⛔ **OPEN FOUNDER QUESTION — blocks every deletion in `geometry-kernel`:** *what is Stack B
> for?* Until answered, no producer may be deleted as "dead" — it is live for bake/export.

**The wall-Y datum** — `WallFragmentBuilder.ts:728` folds `wall.baseOffset` into `worldY`,
`:1097` puts that on the group, and every geometry site adds it **again**; `DoorBuilder.ts:498`
and `WindowBuilder.ts:818` omit `slabBaseOffset` entirely. Leaf-vs-hole delta =
`slabBaseOffset + 2×baseOffset`. **Latent** — measured: nothing assigns `slabBaseOffset`
non-zero and no wall path authors `baseOffset ≠ 0`. The fix is ONE wall-Y authority, not deduping
the extrusion builders — those were measured **bit-identical** and are mutually exclusive by
construction (`WallFragmentBuilder.ts:2301-2307`).

---

## 4E. ELEMENT-TYPE TAGGING — the delete routing depends on it

`userData.elementType` is what the keyboard delete path reads. Measured spellings are
**inconsistent and case-mixed**, surviving only because `DeleteElement.ts:51` lowercases:
`'wall'`, `'beam'`, `'Column'`, `'Handrail'`, `'Lighting'`, `'RoofPart'`, `'door'`/`'Door'`,
`'window'`, `'Furniture'`, and slab in **four** spellings — `'slab'`/`'Slab'`/`'SlabPart'`/
`'SlabEdges'`.

- **`'opening'` has NO producer.** The comparison exists (`DeleteElement.ts:52`) and three
  `storeEventBus.emit` calls use it (`OpeningStore.ts:29,37,48`), but **no fragment builder tags
  a mesh** `'opening'`. That branch has no measured producer.
- **ceiling, floor and curtain-wall**: NOT MEASURED — no `elementType` assignment surfaced.

> ⚠ **CORRECTED 2026-08-18 against C15 §12. This section previously ended *"and the spellings MUST
> converge."* C15 FORBIDS that for door and window, in those words, and C15 wins.**
>
> [C15 §12](C15-HOSTED-ELEMENT-CONTRACT.md) (*Casing note, §WINDOW-AUDIT-2026 W10*):
> *"The canonical `elementType` is PascalCase (`'Door'`, `'Window'`). All consumers that perform
> equality checks MUST normalise via `.toLowerCase()` before comparing… **Do NOT change the stored
> casing — it is frozen.**"* C15 therefore already decided the general mechanism, and it is
> **DECLARE + NORMALISE, not converge**: the producer freezes one spelling per family and every
> comparing consumer lowercases. `DeleteElement.ts:51`'s lowercase is not the accident C84 read it
> as — **it is the C15 §12 mechanism working as specified.**
>
> **The measured defect survives the correction, and is sharper for it.** C15 §12 requires *one*
> frozen canonical tag per family. Slab has **four** (`'slab'`/`'Slab'`/`'SlabPart'`/`'SlabEdges'`),
> which no amount of `.toLowerCase()` collapses — `'slabpart'` ≠ `'slab'`. Door already has two
> (`'door'`/`'Door'`) where C15 froze exactly one. **Restated normatively:**
>
> **Every family MUST declare exactly ONE canonical `userData.elementType` tag in its per-element
> contract, and every consumer MUST compare it case-insensitively per C15 §12. Multiple *spellings*
> of one family (slab's four, door's two) are the violation; multiple *casings* of one spelling are
> not.** Sub-part tags (`'SlabPart'`, `'SlabEdges'`, `'RoofPart'`) MUST be declared as sub-parts
> with their parent named — C15 §12's `userData.role = 'geometry'` + `parentId` is the existing
> mechanism for exactly this and MUST be used rather than a new tag.

---

## 4F. THE RAC AXIS — *"can the user ASK for this in chat?"* — measured 2026-08-19 (lane RAC1)

> **Why this section exists, verbatim from the founder (2026-08-19):**
> *"IN THE RAC AT THE MOMENT I CAN SAY: 'CHANGE ALL WINDOWS TYPE TO ….' BUT DOESN'T WORK FOR:
> 'CHANGE HANDRAIL TYPE TO FRAMELESS GLASS BALUSTRADE'. I WANT ALL ELEMENTS TO BE CHANGEABLE —
> BY LEVEL, BY ROOM, ETC. DO AN AUDIT — DOCUMENT — PER ELEMENT CONTRACT — AND FIX IT."*
>
> This is the cross-family summary; each family's own row-set lives in its C85–C99 **§RAC** section.
> Scored on the **C67 §1.0 seven-verdict vector** (V1 RESOLVE · V2 DISPATCH · V3 STATE · V4 PERSIST ·
> V5 UNDO · V6 SYNC · V7 REPORT), never as a boolean. `NOT MEASURED` is written out in full wherever
> it applies — **EI-1b: a blank reads as "fine".**

### 4F.0 — THE ONE-SENTENCE FINDING

> ⭐ **The type-change EXECUTOR is already universal. The RAC WIRING is not.**
> `element.changeType` (registered at `apps/editor/src/engine/initBusHandlers.ts:1518`) carries
> **SIXTEEN family branches** — wall `:1536` · furniture `:1549` · floor `:1600` · slab · door ·
> window · ceiling · plumbing `:1802` · stair `:1850` · column `:1858` · beam `:1883` ·
> stair-railing `:1901` · **handrail `:1936`** · roof `:1979` · lighting `:1991` ·
> curtain-wall `:2022` — each writing the **geometry store the builders, the plan projector and
> persistence read**, each with ring-buffer undo parity via `_swapWithRingParity`, and the whole set
> pinned executable by `apps/editor/src/engine/__tests__/elementChangeTypeCoverage.spec.ts:178-194`.
>
> **The chat reaches FIVE families** — wall, window, door, slab, ceiling — through five *separate*
> `*.updateSystemTypeBatch` verbs that **do not use `element.changeType` at all**.
>
> **Eleven families therefore have a live, panel-reachable, undoable, persisting type-change that the
> chat cannot reach.** That is a **C84 EI-3 breach at family scale** — *what the UI offers, the
> pipeline must accept* — and the founder's handrail sentence is one instance of it, not a
> one-family bug.

### 4F.1 — THE ROOT CAUSE: A DEFERRAL THAT INHERITED A REASON THAT IS NO LONGER TRUE

`element.changeType` is classified **Class B "needs design"** at
`packages/ai-host/src/capabilities/ChatCommandClassification.ts:98`, inside the family `B_CATALOGUE`
whose stated reason (`:76`) is:

> *"The value is a project-catalogue reference (type / section / rating / system). The set-wall-type
> pattern applies — an injected resolver per catalogue — but **those catalogues are not injected into
> the resolver context yet**."* · `blockedBy: 'catalogue value-source injection'` (`:101`)

**Three measurements say that reason is not true for the verb it is blocking:**

1. **The catalogues exist, in the `{id, name}` shape `resolveCatalogueRef` requires.**
   `HandrailTypeStore.ts` — **20 built-ins**, and `:227-241` is
   **`id: 'glass-frameless'`, `name: 'Frameless Glass Balustrade'`** — the founder's exact phrase,
   already resolvable by `resolveCatalogueRef` tier-2 (exact name) and tier-4 (word subset), **with
   zero adaptation**. `CurtainWallTypeStore.ts` — **20**. `FloorSystemTypeStore.ts` — **22**.
   `LightingTypeDefinitions.ts:54` — **12**. `StairTypeDefinitions.ts` — **5**.
   `ElementTypeCatalogRegistry.ts:112-126` — **8 roof types** with id+name.
2. **The injection CHANNEL exists too, and has NO production writer.**
   `ResolverContext.catalogues?: Readonly<Record<string, CatalogueLookup>>`
   (`packages/ai-host/src/intents/ZeroTokenResolver.ts:199`) is read by `CatalogueFamilies.ts:105-110`.
   Measured repo-wide, **its only writer is a test**
   (`packages/ai-host/__tests__/chat-capability-registry.test.ts:272`).
   `ZeroTokenChatBridge.buildContext()` (`apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:841-936`)
   injects wall/window/door through their **named legacy fields** and **never sets `catalogues` at
   all**. ⭐ **A repo-wide sweep confirms `ZeroTokenChatBridge.ts:922-954` is the ONLY
   `ResolverContext` construction site that exists** — there is no second builder that could
   silently miss the injection, and no third that already has it. The "not injected yet" blocker is
   **~6 lines in one function**.
3. **The file already documents this exact failure mode, three lines above the offending entry.**
   `ChatCommandClassification.ts:84-95` records that `room.setOccupancy` sat in this same family
   inheriting this same reason while the dependency *did not apply to it* — *"the founder's rooms read
   `unclassified` while a LIVE, undoable verb sat one sentence away"* — and ends:
   > *"The lesson generalises — when a deferral names a dependency, check the dependency is real for
   > THAT verb before inheriting the family's reason."*

   **`element.changeType` is on line 98.** The lesson was written and then not applied to the next
   entry of the same array.

⛔ **This is the [[unsatisfiable-gate-decomposition-is-the-fix]] / [[authored-but-unwired-is-the-bottleneck]]
shape, and NO GATE CAN SEE IT.** `npx tsx tools/ga-gate/check-chat-capability-coverage.ts` (run
2026-08-19) reports `explicitly deferred (CHAT_UNAVAILABLE): 52` and `B needs-design 131` and is
**green on both** — *a deferral is invisible to a coverage gate by construction*. **Nothing in this
repository asks whether a deferral's stated blocker is still true.**

### 4F.2 — THE CROSS-FAMILY MATRIX — TYPE CHANGE

Legend — **V1** RESOLVE · **V2** DISPATCH · **V3** STATE · **V4** PERSIST · **V5** UNDO · **V6** SYNC ·
**V7** REPORT. `—` = the question does not arise because V1 already fails.
**"Fails how"** is the load-bearing column: a family that refuses honestly is a missing feature; a
family that **reports success while changing nothing** is the L-995 class and outranks it.

| Family | RAC type-change today | V1 | V2 | V3 | V4 | V5 | V6 | V7 | Fails how | `element.changeType` branch |
|---|---|---|---|---|---|---|---|---|---|---|
| **wall** (C85) | ✅ `set-wall-type` → `wall.updateSystemTypeBatch` | PASS | PASS | PASS `wallStore` | PASS | PASS · 1 entry | FAIL¹ | PASS² | — | ✅ `:1536` |
| **window** (C86) | ✅ `set-window-type` | PASS | PASS | PASS `windowStore` | PASS | PASS · 1 entry | FAIL¹ | PASS² | — | ✅ |
| **door** (C86) | ✅ `set-door-type` | PASS | PASS | PASS `doorStore` | PASS | PASS · 1 entry | FAIL¹ | PASS² | — | ✅ |
| **slab** (C92) | ✅ `set-slab-type` | PASS | PASS | PASS `slabStore` | PASS | PASS · 1 entry | FAIL¹ | PASS² | — | ✅ |
| **ceiling** (C88) | ✅ `set-ceiling-type` | PASS | PASS | PASS `ceilingStore` | PASS | PASS · 1 entry | FAIL¹ | PASS² | — | ✅ |
| **handrail** (C95) | ⛔ **NONE** | **FAIL** | — | — | — | — | — | — | **refuses** (falls through to the topic table) | ✅ `:1936` → `UpdateHandrailCommand` → `handrailStore` · catalogue **20** |
| **curtain-wall** (C87) | ⛔ NONE | **FAIL** | — | — | — | — | — | — | refuses | ✅ `:2022` → `UpdateCurtainWallCommand` · catalogue **20** · record carries `systemTypeId` |
| **floor** (C89) | ⛔ NONE | **FAIL** | — | — | — | — | — | — | refuses | ✅ `:1600` → `UpdateFloorLayersCommand` · catalogue **22** · `systemTypeId` |
| **lighting** (C96) | ⛔ NONE | **FAIL** | — | — | — | — | — | — | refuses | ✅ `:1991` → `UpdateLightingParametersCommand` · catalogue **12** · **validates the id** at `:2004` |
| **stair** (C98) | ⛔ NONE | **FAIL** | — | — | — | — | — | — | refuses | ✅ `:1850` · catalogue **5** · ⚠ `StairTypeStore` exposes `get()` **not** `getById()` → fails `CatalogueReader` |
| **stair-railing** (C95/C98) | ⛔ NONE | **FAIL** | — | — | — | — | — | — | refuses | ✅ `:1901` · **resolves fields from `newTypeId` ALONE** (`resolveStairRailingTypeFields`) — the pattern to copy |
| **roof** (C90) | ⛔ NONE | **FAIL** | — | — | — | — | — | — | refuses | ✅ `:1979` · **8** {id,name} at `ElementTypeCatalogRegistry.ts:115-124` |
| **furniture** (C97) | ⛔ NONE | **FAIL** | — | — | — | — | — | — | refuses | ✅ `:1549` → `ChangeFurnitureTypeCommand` · ⛔ type is a bare **string union**, no display names |
| **plumbing** (C99) | ⛔ NONE | **FAIL** | — | — | — | — | — | — | refuses | ✅ `:1802` → `UpdatePlumbingParametersCommand` · ⛔ bare unions, no names |
| **column** (C91) | ⛔ NONE | **FAIL** | — | — | — | — | — | — | refuses | ✅ `:1858` · ⛔ `profile` enum, no catalogue |
| **beam** (C93) | ⛔ NONE | **FAIL** | — | — | — | — | — | — | refuses | ✅ `:1883` · ⛔ `sectionType` enum, no catalogue |
| **curtain-wall PANEL** (C87) | ⛔ NONE | **FAIL** | — | — | — | — | — | — | refuses | ❌ **none** — `ReplacePanelTypeCommand.ts:1` is literally `TODO(E.5.x): ORPHANED` |
| **room/space** (C94) | ✅ `set-room-occupancy` (occupancy, not type) | PASS | PASS | NOT MEASURED | NOT MEASURED | NOT MEASURED | FAIL¹ | NOT MEASURED | — | n/a — ⭐ **the ONE family where chat ≥ panel** (the panel declares `readOnlyReason`) |

¹ **V6 is FAIL on every row for ONE reason, and it is not this axis's**: the CRDT read-back leg does
not exist (`YjsDocAdapter` has zero `.observe`) and the transport defaults OFF — C67 §1.0 and the
cat-6-10 scorecard §1.7. Recorded so no blank reads as "fine"; **not** a per-family defect, and
**not re-derived by this lane**.
² V7 passes **for the chat transcript only**, via the `BATCH_REPORT_EVENTS` subscription. See 4F.3 —
**it does NOT pass at the bus boundary.**

### 4F.3 — ⛔ THE SILENT-SUCCESS FINDING: four of the five WORKING verbs lie at the bus boundary

**The L-995 defect class, still live, in the families the founder says work.**

`window` / `door` / `ceiling` / `wall` `.updateSystemTypeBatch` all end `execute()` with an
**unconditional** `return { forward: [], inverse: [] }`:

| Verb | Handler | Line |
|---|---|---|
| `window.updateSystemTypeBatch` | `plugins/window/src/handlers/UpdateWindowsSystemTypeBatch.ts` | `:161` |
| `door.updateSystemTypeBatch` | `plugins/door/src/handlers/UpdateDoorsSystemTypeBatch.ts` | `:161` |
| `ceiling.updateSystemTypeBatch` | `plugins/ceiling/src/handlers/UpdateCeilingsSystemTypeBatch.ts` | `:145` |
| `wall.updateSystemTypeBatch` | `plugins/wall/src/handlers/UpdateWallsSystemTypeBatch.ts` | `:169` |

That return is reached **identically** on four different outcomes: (a) N elements changed; (b) the
command **refused everything** — `CommandManagerImpl.execute()` returns `{success:false, info:[reason]}`
**without throwing**; (c) the bridge **threw** (caught, then only `console.error`); (d)
`window.commandManager` was **absent**. So `bus.executeCommand('window.updateSystemTypeBatch', …)`
**resolves successfully for *"there is no such window type"*, *"no windows exist"*, *"the bridge
threw"* and *"there is no command manager"* alike.** **FAILURE AND EMPTINESS ARE THE SAME VALUE.**

⭐ **`slab` is the ONE that was fixed, and its own header names the rule the other four break** —
`plugins/slab/src/handlers/UpdateSlabsSystemTypeBatch.ts:27-40`, quoting **C16 §5.1 CA-18**:
*"`{forward:[], inverse:[]}` returned as the outcome of a mutation the user asked for"*. It reads
`report.success`, keeps `report.info[0]` as `refusal`, and **throws** (`:192-194, 204-209`).
**The fix is already written. It was applied to one of five siblings.**

**Why the CHAT transcript is nevertheless honest — and why that is not a defence.** All five *also*
emit a `CustomEvent` carrying the command's real `{success, info}`, and all five rows are present in
`BATCH_REPORT_EVENTS` (`apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:1205, 1232, 1233, 1238, 1240`),
so `classifyDispatch` turns `success:false` into *"Nothing was changed — …"*. **The RAC is honest by
a downstream subscription, not by the bus contract.** Every other caller — plugin-SDK consumers,
`packages/sync-client/src/syncDisposition.ts:254-274` (which registers all five as `element-property`
mutations), tests, any future call site — sees an **unconditional success**. Note also
`affectedStores: [] as const` on all five: the bus records no store effect and no bus-level undo
entry. A truthful transcript layered over a lying verb is the arrangement that let L-995 survive a
week — see [[fake-more-capable-than-real]] and [[committed-is-not-reachable]].

### 4F.4 — THE SCOPING AXIS: all / by level / by room / by selection / by filter

**The scope ALGEBRA is strong and is NOT the gap.** `ScopeDescriptor.ts` defines six base forms —
`selection` · `ids` · `all` · `level` · `room` · `orientation` — plus a one-level `filter` wrapper
(`FilterScope.ts`: property and type predicates, with honest `filterStats` extrema). The shared type
grammar `makeHostedTypeParser` (`ZeroTokenResolver.ts:3340`) already captures **`on level N`** and
**`in the <room>`** for **every** catalogue family for free, and `parseFilterClauses` lifts filter
clauses out before the capability grammar runs.

**The gap is DECLARATION, not reach.** `check-chat-capability-coverage.ts` (2026-08-19, **RC=3**):

```
FAIL — 26 spatial mode(s) the ARM honours without declaring, baseline 24.
      set-window-type  honours "level" / "room" / "orientation" without declaring it
      set-door-type    honours "level" / "room" / "orientation" without declaring it
      set-slab-type    honours "level" / "room" / "orientation" without declaring it
      set-ceiling-type honours "level" / "room" / "orientation" without declaring it
      set-wall-type · set-wall-side-finish · add-wall-layer · create-windows-parametric ·
      delete-{furniture,windows,doors,columns}-scoped …                       (26 in total)
```

⭐ **So "by level" and "by room" ALREADY WORK for all four catalogue families and are NOT DECLARED.**
The registry is the source the *"what I CAN do"* answer is generated from, so the system
**under-reports its own capability to the user** — an **EI-9 violation in the reporting direction**,
and the mirror image of L-998 (*a refusal that advertised the capability it was refusing*). Both are
one-answer-per-question failures. **Fix = add the modes to `scopeModes`. No new machinery.**

### 4F.5 — THE SELECTION-CONTEXT AXIS — the claim *"the RAC has no selection context"* is **FALSIFIED**

Measured against the founder's report that *"CREATE WALLS BY SLAB"*, with a slab selected, was refused
with *"I need start and end coordinates to place a wall from chat"*
(`ZeroTokenResolver.ts:1992-2012`):

- **`ResolverContext.selection` is a first-class, non-optional field** carrying **both id and kind** —
  `ZeroTokenResolver.ts:143-145`, `:124-127`.
- **It is rebuilt on EVERY message** from the full multi-selection —
  `ZeroTokenChatBridge.ts:159-175` (`selectionBus.currentIds` → `elementTypeOf()`, unclassifiable ids
  **dropped rather than guessed**) → injected at `:923`.
- **36 of 57 capabilities are selection-reachable** — 24 with `scope:'selection'` as their default,
  12 more via `scopeModes`.
- The one genuine hole is cosmetic: `resolveScope({kind:'selection'})` is a stub returning
  *"That scope isn't wired into chat yet"* (`ZeroTokenChatBridge.ts:501-502`) — unreachable, because
  `CapabilityExecutionSpec.ts:759-762` pre-resolves a selection base to an `ids` descriptor first.

**The real defect is narrower and sharper.** `create-wall`'s `SemanticIntent`
(`ZeroTokenResolver.ts:678-684`) carries **`start` / `end` / `height` / `thickness` and no subject
axis at all** — no `scope`, no `sourceId`. Its registry entry declares **`scope: 'global'`**
(`ChatCapabilityRegistry.ts:2096`), the same bucket as `undo` and `zoom-fit`. The grammar never
inspects the token *"slab"* (`LocalNaturalLanguageResolver.ts:1081-1098` — the word is discarded and
the sentence is parsed as a bare create-wall-without-coordinates at confidence 0.82).
**`create-wall` is structurally incapable of expressing a geometry source**, while every sibling
creation capability that takes a subject (`create-windows-parametric`,
`scopeModes: ['all','selection','level']`) already accepts one.

⛔ **THE WRONG-REFUSAL DEFECT CLASS — a correct-looking refusal for a capability that EXISTS.**
It satisfies C16 CA-18 *in form* (it names an alternative and gives worked examples) while denying an
ask the system can satisfy. **Recorded as its own class**, because a well-formed refusal is *harder*
to spot than a broken one: it reads as a designed limit. Compare
[[refusing-half-needs-its-escape-hatch]] — *a gate whose "yes" branch awaits a decision is a
regression with a contract citation attached.*

### 4F.6 — ⛔ THE EXECUTOR IT SHOULD ROUTE TO EXISTS **FOUR TIMES OVER** (P6 / EI-4a, before the RAC adds anything)

| # | Path | Where | Mechanism |
|---|---|---|---|
| 1 | Legacy command — takes `slabId`, **recovers boundary ARCS** (§L965), full undo | `packages/command-registry/src/walls/CreateWallsFromSlabCommand.ts` | `CommandType.CREATE_WALLS_FROM_SLAB` (`apps/editor/src/engine/CommandRegistry.ts:255`) |
| 2 | Plugin handler — takes a pre-resolved `perimeter`, Immer, single-undo | `plugins/wall/src/handlers/CreateWallsFromSlab.ts` | bus **`wall.createFromSlab`** (`packages/command-bus/src/commands.ts:945`) |
| 3 | **The Wall tool's own "By Slab" button** | `apps/editor/src/ui/layout/ToolsAreaLayout.ts:285, 325` | bus `wall.create-on-all-slabs` |
| 4 | Legacy AI path | `packages/ai-host/src/AIService.ts:247` | constructs #1 directly |
| — | Batch-catalogue pills (UI) | `apps/editor/src/ui/create/batchCatalogue.ts:186` | constructs #1 directly |

Path #2 is fenced off from chat *by policy, not by absence*: `ChatCommandClassification.ts:241-250`
puts `wall.createFromSlab` in `C_BATCH` — *"exposing the raw batch verb to chat would be a footgun"*.

> ### ⛔⛔ AND #3 — THE ONE CALLED "WORKING" — IS ITSELF BROKEN, SILENTLY
> `_execWallBySlab` resolves the selected slab and dispatches
> `executeCommand('wall.create-on-all-slabs', { slabId })`. **`wall.create-on-all-slabs` has no
> `slabId` in its payload** (`packages/command-bus/src/commands.ts:1134-1137` —
> `{ wallHeight?, wallThickness? }`); its handler reads only height/thickness
> (`plugins/wall/src/handlers/CreateWallsOnAllSlabs.ts:43-63`); and
> `CreateWallsOnAllSlabsCommand.ts:40` does `slabStore.getAll()`.
> **`slabId` is dropped at three layers. Select ONE slab, press `S`, get perimeter walls on EVERY
> slab in the project.**
>
> ⭐ **The RAC MUST NOT be routed to path #3.** Had the RAC been wired to "the working tool mode"
> without measuring it, chat would have inherited a silent over-application — the
> [[committed-is-not-reachable]] lesson applied to a *fix* rather than to a feature.
>
> **Normative:** the RAC routes to **#2 `wall.createFromSlab`** — the only bus-native, Immer,
> single-undo path — and **#3 is repointed at the same verb in the same change**, collapsing two of
> the four paths. ⛔ **MUST NOT mint a fifth implementation** (P6; EI-4a: ONE route per intent).

### 4F.7 — THE SECOND DISPATCH ROUTE **INSIDE THE AI PANEL ITSELF** (EI-4a)

`apps/editor/src/ui/create/batchCatalogue.ts` holds **23 batch entries, 17 of them `status:'live'`**,
each carrying a natural-language `prompt` string — *"Create walls from the selected slab"*,
*"Create walls on all slabs"*, *"Create curtain walls from the selected slab"* — and a `precondition`
that **reads the selection** (`resolveSelectedSlabId(d)`).

`AIPanel.ts:1279-1318` surfaces them as **clickable pills** whose `action` calls
`dispatchBatchEntry(e, batchDeps)` — **bypassing the resolver ladder entirely**.

⛔ **So inside ONE panel: CLICK *"Create walls from the selected slab"* and it works; TYPE the same
sentence and it is refused.** Two authorities for one intent, in one surface — the exact EI-4a shape,
and an EI-3 breach with the offered affordance and the refusing verb **rendered side by side**. The
`prompt` strings are already written natural language; **nothing consumes them as language.**

### 4F.8 — NOT MEASURED (explicit, per EI-1b)

- **V6 SYNC for every family** — inherited from C67 §1.0, **not re-derived by this lane**.
- **V3 / V4 / V5 for the eleven dark families through the CHAT** — unmeasurable while V1 fails.
  They are measured *through the panel* in each family's own contract; whether the **same** verdict
  holds once chat drives `element.changeType` is **NOT MEASURED** and must be proven by **executed
  read-back** (C16 CA-21), never inferred from the panel's passing.
- **No utterance was typed into a live editor by this lane.** Every verdict above is source-measured.
- **`room/space` V3–V7** — `set-room-occupancy` was not traced.
- **The other 181 deferrals.** Only `element.changeType`'s and `wall.createFromSlab`'s stated
  blockers were re-checked, out of **131 Class-B + 52 CHAT_UNAVAILABLE**. 4F.1 establishes that a
  stale blocker is invisible to every gate, so **this is a gap, not a clearance.**
- **Whether `set-slab-type` / `set-ceiling-type` fuzzy-match correctly in production.** Because
  `ctx.catalogues` has no writer, both take the raw-string fallback (`CatalogueFamilies.ts:209-214`)
  and are resolved command-side. That refuses honestly rather than no-opping — but the family's own
  `mismatchPrefix` / `suggestions` copy is **dead code at runtime**, and a near-miss ref that
  `resolveCatalogueRef` fuzzy-matches will retype elements to a name **the user never said, with no
  chat-side confirmation of the resolved name**. NOT MEASURED against a real project.

### 4F.9 — THE DELTA (ordered; each item names its invariant and its proof)

1. **Route `element.changeType` to the chat for the eleven dark families** — EI-3, EI-4a.
   Proof: **executed read-back of the geometry store per family** (C16 CA-21), never `success:true`.
   Start with **handrail** — the founder's named case.
   ⚠ **The handrail branch does NOT resolve `newTypeId` → fields; the CALLER materialises the type
   whole** (13 fields; the pattern is `RailingTypeSelectorWidget.ts:117-145`, including
   `materialColor: def.materialColor ?? null`, which **clears** a user hex override — omit it and the
   old colour shadows the new `materialId` forever, C100 §2.1). **A RAC dispatch carrying only
   `newTypeId` would run `UpdateHandrailCommand` with no field changes and report success having
   changed nothing** — 4F.3's defect, re-minted at a new site.
   ⚠ **And the catalogue injection (item 2) is LOAD-BEARING for handrail specifically, not merely
   nice-to-have.** Slab and ceiling survive its absence because their batch COMMANDS re-resolve the
   raw string and refuse by listing real names; `element.changeType`'s railing branch has **no name
   ladder at all** — it trusts the caller's materialised fields. Skipping item 2 would make *"change
   all handrails to frameless glass balustrade"* die on a `console.warn` instead of refusing with
   the 20 real names. **Items 1 and 2 ship together or not at all.**
   ⭐ **Preferred shape:** mirror `resolveStairRailingTypeFields` (`initBusHandlers.ts:1923`) — put the
   catalogue→fields projection in `packages/geometry-handrail` so the branch resolves from
   `newTypeId` alone. That makes handrail behave exactly like stair-railing, deletes the widget's
   duplicate projection (EI-9), and reduces the chat payload to `{elementId, elementType, newTypeId}`.
   **`packages/geometry-handrail/**` and C95 are lane HR2's — coordinate, do not edit.**
2. **Write `ctx.catalogues` in `ZeroTokenChatBridge.buildContext()`** — unblocks the stated
   `blockedBy` for the whole `B_CATALOGUE` family and makes `set-slab-type` / `set-ceiling-type`
   refuse with their *own* declared copy. ~6 lines.
3. **Apply the slab CA-18 fix to its four siblings** — C16 CA-18, EI-9. Proof: a bus-level test that
   a refused batch **rejects**, dispatched with **no** CustomEvent subscriber.
4. **Declare the spatial modes the arms already honour** — EI-9. Proof: the gate's
   `undeclared spatial reach` ratchet falls **26 → 0**.
5. **Give `create-wall` a subject axis and route it to `wall.createFromSlab`** — EI-4a. Proof: the
   selected-slab utterance creates walls **and** the tool button (#3) is repointed at the same verb in
   the same change.
6. **Feed `batchCatalogue`'s 17 live `prompt` strings to the resolver** — EI-4a, EI-3.
7. **Fix the four families whose type is a NAMELESS union** — furniture, plumbing, column, beam. A
   refusal cannot list options that have no display names, so these need `{id,name}` catalogues
   *before* they can join, and that is a C65 element-type question, not a RAC one. **Declared, not
   silently missing.**
8. ⭐ **A gate that RE-VALIDATES DEFERRAL BLOCKERS.** ⛔ *Nothing today asks whether a Class-B
   `blockedBy` is still true.* 4F.1 is what that costs, and the same file records the same miss for
   `room.setOccupancy`. **This is the durable fix; items 1–7 are its backlog.**

### 4F.10 — STALE CLAIMS CORRECTED IN `CatalogueFamilies.ts:39-57`

That header is this repository's own honest register of *"families the chat cannot drive, said out
loud"* — and **four of its five stated reasons have expired**. Recorded here rather than silently
edited, because the retraction is the finding (C84 §6 authoring rules):

| Claim (`CatalogueFamilies.ts`) | Measured 2026-08-19 |
|---|---|
| `:46` curtain-wall — *"its command is marked ORPHANED, and `element.changeType` has no curtain-wall branch"* | **FALSE since L-958.** Branch at `initBusHandlers.ts:2022`; catalogue `CurtainWallTypeStore.ts` (20); record carries `systemTypeId`. The ORPHANED command is `ReplacePanelTypeCommand` — **panel-level, a different capability** |
| `:47` floor — *"`floorSystemTypeStore`, 14 built-ins"* | **22** built-ins |
| `:41-44` *"roof, column, beam — no named type CATALOGUE exists at all"* | **True for column and beam. FALSE for roof** — 8 {id,name} entries at `ElementTypeCatalogRegistry.ts:115-124` |
| `:52-54` furniture — *"a string UNION with no display names … a refusal could not list anything"* | **ACCURATE** |
| `:55` handrail — *"the catalogue exists but `HandrailData` has no typeId: a type must be MATERIALISED whole into its fields"* | **ACCURATE, and the only one whose reason fully holds** — but materialisation is a *payload* question, not a blocker: the panel does it today in 13 lines |

---

## 5. Gates

> ⛔ **CORRECTED 2026-08-18 — "EXISTS" IN THIS TABLE WAS WORKTREE-SCOPED AND READ AS HEAD-SCOPED.**
> Measured in the main tree (`Product_Rediness_08`) on 2026-08-18:
> `tests/parity/wall/stackAB-miter-parity.test.ts` → **ABSENT**;
> `apps/editor/__tests__/OneDeletePathAcrossSurfaces.test.ts` → **ABSENT**. Both exist only in the
> lane worktree `C:/ClaudeWorktrees/Product_Rediness_08/z8-dupaudit`. Their rows now read
> **EXISTS (lane worktree — NOT ON `main`)**.
>
> **This is C84's own governed defect class, committed by C84.** It is §8.b's shape — a census taken
> in one host and reported as universal — and it is the reason [C72 §0.1](C72-PROPAGATION-AND-PREVSTATE.md)
> says *"a typed declaration is not wiring"*. A gate that exists in a worktree gates nothing at HEAD.
> **A row may read `EXISTS` only after the file is on `main`.** Recorded rather than quietly amended,
> per §0.

| Gate | Enforces | Status |
|---|---|---|
| `check-element-authority.ts` | EI-1 | TO BUILD — hard-0 on new split-brains, ratchet on the 3 known |
| `check-bridge-field-coverage.ts` | EI-2 | TO BUILD — **the load-bearing one** (§7) |
| `check-delete-symmetry.ts` | EI-4 / EI-5 | TO BUILD |
| `check-persistence-coverage.ts` | EI-6 | TO BUILD — hard-0; no family may be unsaved |
| `check-affected-stores.ts` | EI-7d | TO BUILD — **highest value single check.** Table-driven sweep asserting every `affectedStores` key declared anywhere in `packages/command-registry/src/**` and `plugins/**/commands/**` appears in `createSnapshot`'s `optionalStores` (`CommandManagerImpl.ts:609-625`). Generalises the one existing test from 1 command to ~190. ⚠ **DISTINCT FROM [C16 §11.1 G-CA-A3](C16-COMMAND-AUTHORING-PROTOCOL.md)** — G-CA-A3 compares a declared key to the store the handler WROTE (EI-1a / C03 U-2b); this compares it to the store `createSnapshot` can ROLL BACK. Two different tables, two different failures. Build both; do not merge them |
| `check-undo-store-coverage.ts` | EI-7c | TO BUILD — hard-0: every registered bus store key has a `buildUndoStoreMap` entry, or a DECLARED, documented exemption. Extends the existing coverage test [C03 §4.8](C03-SCHEMAS-COMMANDS-AND-STATE.md) names from *create-handler* keys to **every** registered key |
| `[Z8]` `tests/parity/wall/stackAB-miter-parity.test.ts` | **EI-11** | **EXISTS (lane worktree `z8-dupaudit` — NOT ON `main`, measured 2026-08-18)** — 10 pass, 1 pinned `it.fails` (`§Z8-CURVED-MITER-BAKE-DIVERGENCE`). ⚠ Its threshold is a bare `const TOL = 1e-4` at `:107` — an unnamed, unit-unqualified call-site literal, which is precisely what [C73 §2.2/§2.3](C73-GEOMETRY-DETERMINISM-AND-TOLERANCE.md) forbids and what C73 §5.1 **E2**'s shrink-only ratchet counts. **This gate violates the contract it is evidence for, and must consume C73's declared tolerance before it lands on `main`.** Slab / door / window harnesses **OWED** |
| `[Z8]` `apps/editor/__tests__/OneDeletePathAcrossSurfaces.test.ts` | **EI-4a** | **EXISTS (lane worktree `z8-dupaudit` — NOT ON `main`, measured 2026-08-18)** — 5/5, watched RED. Delete only |
| `[Z8]` `tools/ga-gate/check-verb-liveness.ts` | EI-1 / EI-7a route liveness | **EXISTS — GROW-ONLY ratchet.** Reading: **PROVEN 7 / 326**; UNPROVABLE-NO-STORE 109; UNKNOWN 210. Its own words: *"Neither is a pass; both are the work"* |
| `[Z8]` `check-emitter-has-consumer` | **EI-13** | TO BUILD — hard-0 once the nine are resolved |
| `[Z8]` `check-constant-copy-pinned` | **EI-8a** | TO BUILD — hard-0 |
| `[Z8]` `check-trigger-has-dispatcher` | **EI-12** | TO BUILD — ratchet |
| `[Z8]` `check-verb-register.ts` **fix** | instrument correctness | **BUG**: `TYPE_DECL_RE` (`:135-139`) anchors on `type\s*` and so misses `{ type: '…'`. `stair.batch.create` is declared at `CreateStairBatch.ts:61` **and** `initBusHandlers.ts:445`, so **SHADOWED reads 0 and should read 1.** Every step graded by this gate inherits the error |

> **`[Z8]` Nine of the eighteen invariants have no gate.** Stated rather than left to inference (the
> C68 §6.3 idiom): EI-1b, EI-5a, EI-8a, EI-9, EI-10, EI-11a, EI-12, EI-13 and §3.5 are **review
> judgements today**. C84 is therefore **CANONICAL, not ACTIVE**.

**Three tests are named here because they were specified by measurement and do not yet
exist.** Each must be watched failing before it is believed — a control that cannot fail
is not a control:

1. `busCreateUndoLeavesPluginStore.test.ts` — dispatch `wall.create`, `performUndo()`,
   assert `runtime.stores.wall` no longer holds the id. **It will be `true` today.** Pins EI-7a.
2. `curtainWallPanelUndoDepth.test.ts` — feed the adapter
   `{op:'replace', path:[id,'panels','length'], value:0}` and assert `panels` is still an
   array. Pins EI-7b.
3. `roomIdentitySurvivesUndoRedetect.test.ts` — rename a room, delete a bounding wall,
   undo, assert id and name survive `RoomTopologyObserver.resume()`. Settles EI-7e.

**A new family may not be added while its per-element contract is absent.**
Per `§RATCHET-EXCEEDED-IS-NEVER-DEBT (R7)`: **never raise a threshold to pass.**

---

## 6. The per-element contracts — C85–C99

Each family gets its own contract. **The structure below is MANDATORY and identical across all
fifteen** — a contract that omits a section is incomplete, and a cell that is unknown must read
`NOT MEASURED`, never blank. *A blank reads as "fine"; that is how every defect in §4 survived.*

Each section carries **AS-IS** (measured, `file:line`) and **TO-BE** (normative), side by side.

| § | Section | Must state |
|---|---|---|
| **1** | **Identity** | canonical `elementType` tag(s) and every spelling in use (§4E); the L0 schema; the bus verb namespace |
| **2** | **Stores** | every representation the family has — L0 schema, plugin DTO, legacy geometry, scene `userData`, kernel producer — and **which one is the AUTHORITY** (EI-1) |
| **3** | **Consumers** | what renderer, plan view, persistence, IFC export, GLB export and bake worker each read. Any two differing = split-brain, and it goes at the top |
| **4** | **Plugin ↔ DTO ↔ command ↔ builder** | the full wiring: which handlers exist, which are registered in production, which are **reachable from a UI control**, and which are dead |
| **5** | **The bridge field map** | **EVERY field of the payload**, and for each: carried, transformed, or DELIBERATELY DROPPED. Omission is forbidden (EI-2). This section is the one the future `check-bridge-field-coverage` gate consumes |
| **6** | **Verbs** | one row per verb — create · batch create · delete · move · transform · **rotate** · parameter/**dimension** change · **material** · **colour** · level change · family-specific. Each row: lineage L1–L6 (§4A), stores WRITTEN, stores RESTORED on undo, and whether those two sets are **equal** |
| **7** | **Undo / redo** | the `affectedStores` declaration vs the measured write set (EI-7); whether `createSnapshot` covers every declared key (EI-7d); whether redo restores or **recomputes** (EI-7e) |
| **8** | **Cascades** | what each mutation triggers, and whether undo reverses it (§4C). Event-driven cascades outside patch capture MUST be named |
| **9** | **Vocabularies** | material vocabulary (which of V1–V5, §EI-8), profile/shape enums, and every enum whose members the pipeline cannot carry (EI-3) |
| **10** | **Geometry** | Stack A builder, Stack B producer, whether they are proven to agree, and the datum convention |
| **11** | **THE DELTA** | a numbered, ordered fix list, each item naming its invariant and its proof |
| **12** | **REFUSALS** | what this family deliberately does NOT support, and why. A refusal is a correct answer — an undocumented one is not |

**Authoring rules, binding:**

- **Measure, do not infer.** Every claim carries `file:line`. A claim you could not verify is
  `NOT MEASURED` — which is a finding, not a gap in the document.
- **Record retractions.** Four audits retracted claims after measuring; each retraction was more
  valuable than the claim. Keep them.
- **Grep both halves.** Lighting survived because the loader existed and the serializer did not,
  so one grep found it and stopped (§1.2).
- **Beware the name-based census.** A reachability census that greps for *store* callers misses

| # | Family | # | Family | # | Family |
|---|---|---|---|---|---|
| C85 | wall | C90 | roof | C95 | handrail |
| C86 | wall.opening | C91 | column | C96 | lighting |
| C87 | curtain-wall | C92 | slab | C97 | furniture |
| C88 | ceiling | C93 | beam | C98 | stair |
| C89 | floor | C94 | room/space | C99 | plumbing |

---

## 7. Where the authority belongs

The recurring mechanism is the hand-written named subset. The fix is **not** more careful
review — review is what failed, seventeen times, across four years of commits.

**The authority belongs in a generated payload↔record field map per family, gated by a
check that fails when a source field has no declared destination.** Same shape as
`tools/ga-gate/check-layer-boundaries.ts`, which reads workspace manifests rather than
trusting prose — and which was adopted precisely because the prose-based rule
"silently checked nothing" (L-809).

A field must be **carried** or **declared dropped**. Never omitted.

---

## 8. `[Z8]` Anti-patterns

- **§8.a — Counting files whose names are similar.** ADR-0327 refuted its own row this way: four
  "LevelStore" files were three different kinds of object. Apply §3.5.
- **§8.b — Deleting on an editor-only importer census.** §3.5.2 — it would have deleted the bake
  pipeline.
- **§8.c — Mirroring state between two stores as an end state, WHERE ONE SIDE HAS NO READERS.**
  A mirror makes both copies authoritative and neither trustworthy. Retire the loser's **write**
  (EI-5a).
  > ⚠ **SCOPED 2026-08-18. As first written this bullet was unqualified, and unqualified it
  > forbids what [C15 §8.1](C15-HOSTED-ELEMENT-CONTRACT.md) MANDATES** — *"Every command that
  > mutates a hosted element's `offset` MUST write to **both**"* `wall.openings[i].offset` **and**
  > `doorStore`/`windowStore`. C15 wins, and it is right to: **both** of its stores have live
  > readers (`WallFragmentBuilder` reads `wall.openings` for the void; `DoorBuilder`/`WindowBuilder`
  > read the standalone store for the frame), so retiring either write breaks a renderer. That is
  > the **inversion EI-5a already anticipates** — *"sound ONLY while the reader count is zero"*.
  > **The anti-pattern is a mirror maintained to keep a ZERO-READER shadow plausible.** A mirror
  > between two stores that each have a live reader is not this anti-pattern; it is a **declared
  > co-living pair** under §3.5, and its obligation is a **gate**, not a retirement — C15 §8.1's
  > own enforcement is *"a code-review checklist item"*, which is §8.d in another costume.
- **§8.d — A comment as the synchronisation mechanism.** EI-8a. Measured to have failed twice.
- **§8.e — A parity test that compares a stack to itself.** EI-11.
- **§8.f — Reporting a tolerance where a defect belongs.** 9.774 m is not a tolerance.
- **§8.g — Inflating an unwired overlay into a live rivalry.** §3.5.3. Over-reporting costs the audit
  its credibility on the findings that are real.
- **§8.h — Fixing a symptom whose mechanism you have not measured.** Dispatching `wall.delete` to
  "repair" the room cascade would have shipped a no-op with a success report — the exact defect class
  this contract governs (EI-12).

- **§8.i — A DERIVED value that stops following the value it was derived FROM.**
  §MINTED-NAME-FOLLOWS-NUMBER (L-4510). `RoomNumbering.assignUniqueRoomNumbers` mints
  `Room ${roomNumber}` as a room's NAME, then renumbers the room and leaves the name behind — its
  "may I overwrite this?" test recognised `''`, `'Room'` and the bare number, but **not the shape it
  had minted one line earlier**. Result: two rooms on one level both labelled `Room 01-002`, with
  different areas, on the founder's Level 1 plan (and once before, at L-896, as `Room 00-001`).
  > **The rule, general to this contract:** a value the SYSTEM derives must be re-derived whenever
  > its input changes, and the predicate that decides *"is this system-derived or AUTHORED?"*
  > **MUST recognise the system's own output**. A predicate that cannot recognise what its own
  > module emits is EI-8a in a new costume — it is a comment about intent, enforced by nothing.
  > The AUTHORED case is untouched, per §3 and EI-7e: a human name and a human number are kept
  > verbatim.
  > ⚠ Its companion defect is the one that makes it survive: `roomTagIdempotency.roomTagNeedsRefresh`
  > **stored** `roomNumber` on every tag and **never compared it** (L-4515), and the room label is
  > `name || roomNumber`, so a NAMED room's number never reached the label at all. **A drift test
  > that omits a field the artefact carries reports "already correct" forever.**
  > ⚠ And the counter that looked like the guard was not one: `RoomTagAutoPopulator`'s
  > `N duplicate(s) removed` counts duplicate **TAGS keyed by room GUID**, so two rooms sharing a
  > NAME can never be counted (L-4516). Its confident `0` was the number to distrust.

---

## 9. `[Z8]` NOT MEASURED — the honest register

⛔ **These are gaps, not clearances. None may be recorded as `✅` until measured** (EI-1b: a blank reads
as *"fine"* and is indistinguishable from *"nobody looked"*).

- ~~**The eleven unread `.created` bridge bodies**~~ — **MEASURED 2026-08-18 (lane EB1, `bd1ccdbb`).**
  All eleven read in full against EI-2 (a)–(d); per-bridge verdicts are in that commit body.

  **Two live defects, both fixed RED-first at the deciding store:**
  - **roof** — `roofCreatedMirror.ts:89` `ev.baseOffset ?? 2.7` was a **constant**: no `baseOffset` on
    the L0 `Roof` schema, and none on `CommandEventBridge.ts:905-925`, its sole emitter. Every
    plan-drawn roof seated 0.8 m clear of its own 3.5 m walls while the 3-D path landed. **EI-2b, and
    the same shape as the handrail defect that motivated this audit** — invisible to `tsc` and to
    review alike. [L-969](../../04-reference/ISSUE-LOG.md).
  - **beam** — `loadBearing: false` hardcoded against `CreateBeamCommand.ts:190`'s `?? true`, reaching
    the IFC `LoadBearing` pset, the beam schedule and the fire-rating rule. **EI-2a.**
    [L-970](../../04-reference/ISSUE-LOG.md).

  Both mappings were **extracted from their closures** so the suites execute production code rather
  than a transcription of it — that reachability gap is precisely why both survived earlier review.

  **Four defects remain OPEN and were correctly not fixed by this lane** (each needs a decision at L0
  or in `runtime-composer`, not at the bridge): [L-971](../../04-reference/ISSUE-LOG.md) beam geometry
  dropped for the beam plugin's own tool (`baseLine` vs `startPoint`) — **a beam that renders nothing,
  silently**; [L-972](../../04-reference/ISSUE-LOG.md) curtain-wall's five constant-false reads and
  dropped `panels[]`/`materialId`; [L-973](../../04-reference/ISSUE-LOG.md) ceiling's hardcoded
  `finishSpec`; [L-974](../../04-reference/ISSUE-LOG.md) the copy tool's silent steel→concrete beam
  downgrade. Plus one **latent** cast: `column`'s `i-section` → box, unreachable today because no UI
  emits it.

  Four `*.batch.create` accept-arms (wall, slab, column, curtain-wall) are **provably dead** — CEB
  rewrites every batch fan-out to the single-create literal. Harmless, but **their comments claim live
  behaviour**, which is how a dead arm survives a reading.

- ~~**Six of the ten wall Y-datum sites** — unmeasured.~~ ⚠ **MEASURED 2026-08-18 (lane YD1) — and the
  row's verdict was WRONG, not merely incomplete. See [L-968](../../04-reference/ISSUE-LOG.md).**

  This row previously called the leaf-vs-body delta **LATENT**, on the stated ground that *"nothing
  authors either offset non-zero"*. **Nobody had tested that ground.** It was an assumption recorded
  in the NOT-MEASURED register as though it were a measurement — the exact failure EI-1b names, and
  the reason this register exists.

  **The delta is LIVE.** `wall.baseOffset` and `slab.baseOffset` are both editable from the property
  panel (`PropertyDescriptorGenerator.ts:64` wall, `:89` slab — argument 4 of `NUMBER` is `editable`,
  `:30`, and both pass `true`; committed via `PropertyPanel.ts:953` → `element.updateParameters`) and
  from the shipped `set-base-offset` chat capability (`ChatCapabilityRegistry.ts:1097`). Both reach
  authoritative state through `UpdateElementParameterCommand.ts:113-114`, and both serializers persist
  the value. **One "set the base offset to 150 mm" displaces every door and window on that wall from
  its own hole.**

  Measured datums: wall bodies render at `elevation + slabBaseOffset + 2 × wall.baseOffset` —
  `WallFragmentBuilder.ts:745` computes the GROUP ORIGIN (`:1114`) and every body arm re-applies
  `wall.baseOffset` in group-local space. Hosted leaves use `elevation + sillHeight + height/2`
  (`DoorBuilder.ts:600`, `WindowBuilder.ts:927`; `slabBaseOffset` occurrences across
  `geometry-door/src` + `geometry-window/src` = **0**). Leaf-vs-hole delta =
  `slabBaseOffset + 2 × wall.baseOffset`.

  Two defects that were on no register: **(A)** `wall.baseOffset` is applied **twice** — this is why
  the delta carries a factor of 2, and the doubling itself had never been named; **(B)** junction
  infill sits on a **fourth** datum (`WallJunctionInfillManager.ts:122-123` reads the wall BASELINE
  Y), and that baseline means different things depending on creation route —
  `CreateWallCommand.ts:341` stamps `elevation + baseOffset`, the plugin bridge stamps `0`.

  Pinned by `packages/geometry-wall/__tests__/WallYDatumAgreement.test.ts` (`9c090971`) — a
  **characterisation ledger, not an approval**: it records the numbers as they are so a real fix must
  come here and change them deliberately. Its CONTROL case pins that **at zero offsets every datum
  collapses to one value**, which is precisely why this went unseen for so long.

  ✅ **CLOSED 2026-08-18 — `8f63fb6f`.** `WallVerticalDatum.ts` now declares the two planes (SEAT =
  `elevation + slabBaseOffset`, the group origin; BASE = SEAT + `wall.baseOffset`, the body
  underside). Eleven datums agree and the leaf-vs-hole delta is **0**. A **fourth** defect surfaced
  and was fixed: both dependency trackers omitted `baseOffset` from `_wallGeometryChanged`, so the
  edit that moved a hole never re-anchored what fills it. Four divergences remain, each named with
  its delta in `§STILL-DIVERGENT`; the largest is `SpatialAuthority.ts:159`, which cannot see
  `slabBaseOffset` and whose closure is a design decision (may the spatial authority read the slab
  store?), not a patch.

  ⛔ **The single-volume CSG arm (`WallFragmentBuilder.ts:2666-2689`) STAYS OFF.** One of its two
  cited blockers is closed; the other — whether the `geometry-kernel` producer honours `baseOffset`
  the way `WallHoleBodyBuilder` does — is **unmeasured**. Re-enabling on the strength of the closed
  half is exactly the inference this contract exists to prevent. **Founder's call.**

- **`ADR-0331 §D5 — "what is Stack B for?"`** — ⛔ **A FOUNDER QUESTION, escalated, not to be resolved
  by any lane.** Three coherent end-states are costed in ADR-0331. **Until it is decided, NOTHING in
  `packages/geometry-kernel/src/producers/` or `plugins/*/src/committer/` may be deleted** (§3.5.2).
- ~~**Which door representation wins** (EI-1, `wall.opening`) — a persistence-format decision with a
  migration; needs the founder.~~
  ⚠ **RETRACTED 2026-08-18 — this was ESCALATED TO THE FOUNDER A QUESTION C15 HAS ALREADY
  ANSWERED**, which is the §8.h failure mode applied to governance instead of to code.
  [C15 §1 + §2](C15-HOSTED-ELEMENT-CONTRACT.md) decide it: the opening lives in `wall.openings[]`
  on the host `Wall`, and a hosted element *"has no independent world-space coordinate in the
  store"*. **The authority is the wall record.** What remains open is strictly narrower and is an
  engineering question, not a founder one: **`ProjectSerializer.ts:47-48,704-705` persists the
  DERIVED side** (`doorStore`/`windowStore`) rather than the authority, so a save/load round-trip
  is authoritative-by-accident via C15 §8.1's mandated paired write. The open item is the
  **persistence migration to serialise `wall.openings[]`**, and it is owned by C05, not by C84.
- ~~**EI-7e** — whether user-authored room name / number / finish survive
  `RoomTopologyObserver.resume()`'s post-undo recompute.~~ **MEASURED 2026-08-18, `7bab78ff`.**
  `name` and `finishes` survived (`RoomDetectionEngine.ts:962,968`); **`roomNumber` did not** —
  `assignUniqueRoomNumbers` (`RoomNumbering.ts`) inferred authorship **by regex** and overwrote a
  user's `'101'` / `'G.04'` with a generated `'00-001'` on any undo. The inference was wrong in both
  directions: generator seeds fail the same pattern and must be renumbered, so the two cases are
  indistinguishable by shape. Fixed by RECORDING authorship (`metadata.roomNumberAuthored`) rather
  than inferring it. [L-975](../../04-reference/ISSUE-LOG.md).
- ~~**Plan-view store authority, per family** — unmeasured for every family.~~ **MEASURED
  STRUCTURALLY 2026-08-18 for all 16.** Two genuine divergences: **window** (plan reads
  `wallStore.getAllWindows()`, 3D/persistence read `windowStore` — and **C15 makes the PLAN VIEW
  the correct one**, so this does not get "fixed" by aligning plan to 3D) and **stair** (plan reads a
  THREE-object registry, not a DTO store). Six families read `window.*` globals while the **MT-05
  guard covers only two of them**; the other four are same-instance by construction but unenforced.
  Five families read no store at all in plan — mesh projection only. Four items NOT reached, and
  **no runtime session was observed** — this is structural evidence only.
  [L-976](../../04-reference/ISSUE-LOG.md).
- **Runtime divergence of store CONTENTS** — the two construction roots and 19 TWO-LIVE families are
  proven **structurally**; no live browser session observed two stores holding different records. So
  **C78 §21 OQ7 is answered structurally, not by a runtime probe.**
- ~~**ADR-0331 §D3 has never been executed**~~ — **EXECUTED 2026-08-18 (lane AD1, `4a812180` +
  `cb773834`), and the premise is REFUTED.** The patch *shape* is store-relative as the adapter's
  header claims; the *surface analysis* that claim rests on is false. `SlabStore.update` is a
  whole-record **REPLACE**, so the adapter's one-key partial annihilates the legacy slab;
  `roof.setPitch` writes the L1 name `pitch` onto a record whose geometry field is `slope`; and the
  L1 create value is refused outright by `RoofDataAddSchema` on four fields. **Two of the three are
  silent**, and the absent-id branch is silent too.

  **§D3 acquires two prerequisites before any wiring** (SPEC S7.2a/S7.2b): a per-family L1→legacy
  shape translator, and a **merge-vs-replace declaration per store**.

  ⚠ **This is not only §D3's future — the mechanism already reaches Ctrl+Z today.**
  [L-977](../../04-reference/ISSUE-LOG.md): a slab move's ring entry leaves the record as
  `{holes: []}` through the real `performUndo`.

  **Why it survived:** `elementUndoStoreAdapter.test.ts` is green against hand-written Maps that
  merge and validate nothing — **a fake built from the header cannot falsify the header.** The fake
  was more capable than the real store.

  **Still NOT MEASURED:** eleven of the thirteen stores' `update` semantics, and any browser session.

- **Gates 14–83 of `run-all.ts`** — the run was killed at ~11 min on gate 13.
