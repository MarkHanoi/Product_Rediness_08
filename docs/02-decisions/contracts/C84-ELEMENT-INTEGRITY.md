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
2. **Lighting is never SAVED — and that is worse than "never persisted".**
   `grep -ci "lighting"` on `ProjectSerializer.ts` → **0**. The same grep on
   `ProjectLoader.ts` → **18**. ⚠ *This corrects an earlier reading in this very document
   that claimed zero in both files.* **The load half exists and the save half does not**,
   which is precisely why the feature looks wired: every code-reading review finds lighting
   in the persistence layer and stops. Nothing is ever written for the loader to find.
   Every light the user places is destroyed on save. **An asymmetric pipeline reads as a
   complete one — check both halves, never one.**
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

*Measured violations:* `wall` (viewport reads the `geometry-wall` singleton at
`initBuilders.ts:77,553`; the bake worker reads a plugin DTO `WallStore` at
`HeadlessBakeSession.ts:31,51,131`) · `wall.opening` (persistence reads
`doorStore`/`windowStore` at `ProjectSerializer.ts:47-48,704-705`; IFC export reads
openings embedded on the wall record at `WindowDoorReader.ts:1,7,12`). **Two records for
one door, and nothing reconciles them.**

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

### EI-5 — CREATE AND DELETE MUST BE SYMMETRIC ACROSS STORES

Whatever a create writes, the matching delete MUST remove — from every store it wrote.

*Measured:* **21 of 22** plugin `*.delete` verbs have **no production caller**; the DTO
record is orphaned by every user delete of every family. `plugins/floor` declares no
`floor.delete` verb at all. Only `room.delete` has callers, and only from the layout
generators — never from the Delete key or the delete button, both of which return
`success:false` for a room.

### EI-6 — PERSISTENCE IS NOT OPTIONAL, AND ABSENCE MUST BE LOUD

Every family that can be created MUST round-trip through save/load, or the creation
affordance MUST be removed. Silent non-persistence is the most severe defect this contract
governs: the user's work is destroyed with no error.

*Measured:* `lighting` — zero matches in `ProjectSerializer.ts` and `ProjectLoader.ts`.
Also `ceiling`, `floor` and `lighting` have **no IFC reader** in
`packages/file-format/src/export/ifc/readers/`; they vanish from IFC export with no refusal.

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
have their routing fixed. **Containing a hazard by disabling the verb is not conformance**;
those verbs are dead affordances and each one is an EI-3 violation.

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

---

## 4. AS-IS conformance — measured 2026-08-18

`✅` conforms · `⚠️` violation · `—` capability absent · `?` NOT MEASURED

| Family | EI-1 authority | EI-2 no silent loss | EI-4 delete | EI-5 symmetric | EI-6 persists |
|---|---|---|---|---|---|
| wall | ⚠️ split (viewport ／ bake) | ⚠️ `materialId` dropped | ✅ | ⚠️ DTO orphaned | ✅ |
| wall.opening | ⚠️ **two rival records** | ✅ refused upstream | ⚠️ button → `success:false` | ⚠️ DTO orphaned | ✅ |
| curtain-wall | ✅ legacy | ⚠️ **per-panel kind/material/rotation collapsed** | ✅ | ⚠️ DTO orphaned | ✅ |
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

## 5. Gates

| Gate | Enforces | Status |
|---|---|---|
| `check-element-authority.ts` | EI-1 | TO BUILD — hard-0 on new split-brains, ratchet on the 3 known |
| `check-bridge-field-coverage.ts` | EI-2 | TO BUILD — **the load-bearing one** (§7) |
| `check-delete-symmetry.ts` | EI-4 / EI-5 | TO BUILD |
| `check-persistence-coverage.ts` | EI-6 | TO BUILD — hard-0; no family may be unsaved |
| `check-affected-stores.ts` | EI-7d | TO BUILD — **highest value single check.** Table-driven sweep asserting every `affectedStores` key declared anywhere in `packages/command-registry/src/**` and `plugins/**/commands/**` appears in `createSnapshot`'s `optionalStores` (`CommandManagerImpl.ts:609-625`). Generalises the one existing test from 1 command to ~190 |
| `check-undo-store-coverage.ts` | EI-7c | TO BUILD — hard-0: every registered bus store key has a `buildUndoStoreMap` entry, or a DECLARED, documented exemption |

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

Each family gets its own contract, structured identically:

1. **AS-IS** — measured, `file:line`, every representation the family actually has
2. **MUST-BE** — the authority, the full field map, the delete path, the undo set
3. **THE DELTA** — a numbered, ordered fix list
4. **REFUSALS** — what this family deliberately does not support, and why

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
