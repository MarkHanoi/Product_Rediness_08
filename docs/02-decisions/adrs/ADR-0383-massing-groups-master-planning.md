# ADR-0383 — Massing groups: several independent buildings inside one parcel

**Status:** ACCEPTED · **Date:** 2026-09-09 · **Supersedes:** nothing · **Amends:** C114 §6a, §6d, §12
**Related:** C114 (space envelope) · ADR-0380 (the element ruling) · C58 §1.20 §ENVELOPE-NOT-A-GATE ·
C83 §2 (roles, not kinds) · C84 EI-1 / EI-8 / EI-9 · C16 CA-2 · P6

---

> ## ⛔⛔ READ THIS BEFORE ACTING ON D1 — **AMENDED SAME DAY BY [ADR-0385](./ADR-0385-massing-group-projects-into-the-hierarchy-store.md)**
>
> **`SpaceEnvelope.group` is the MASSING-STAGE AUTHORING axis. It is NOT the containment
> authority, and NOTHING downstream may read it to answer *"which building is this element in"*.**
>
> That question already has an owner: **`hierarchyStore.BuildingData`** — live, persisted, 143
> non-test reference sites across 30 files, and declared IFC-aligned in `HierarchyTypes.ts`'s own
> header (`Building → IfcBuilding`, `Level → IfcBuildingStorey` bridged by `bimLevelId`). **ADR-0328
> rules it the SOLE hierarchy source of truth** and forbids a second one. A group therefore
> **PROJECTS** into it, exactly as `partOf` does (`PartOfProjection.ts`) — re-derived at read,
> reconciled by diff, never accumulated.
>
> ⚠ **This does not re-open D1.** D1 rejected *a second store for massing groups* and that
> reasoning stands. What D1 did not consider is that `hierarchyStore` **already exists and already
> models N buildings**; ADR-0385 adds the projection edge D1 had no reason to name.
>
> **If you are the IFC lane, the inspect-tree lane, or any consumer asking which building an element
> belongs to: your blocker is resolved and the answer is `hierarchyStore`, via one three-valued
> resolver (`carried` / `derived` / `unknown` — an element in no building and an unreadable store
> must never share a value).**

---

---

## 1 · THE ASK

> *"Build PRYZM Master Planning: select a real/demo U.S. parcel, then create multiple independent
> envelope groups inside one parcel. … at the moment we are able to select a parcel and start
> creating a massing profile — fine — then add the levels and create all envelopes — when drag the
> faces etc… great — now i need to be able to do that for multiple envelopes on a single [parcel]
> for masterplanning — the UI and the engine needs to allow me to: **define multiple profiles first
> — i need to decide how many — then define the levels and create bulk all the envelopes for all
> the profiles** — then i need to be able to **select the envelopes (as a group for all the levels)
> get the level data and decide ad-hoc if i want to reduce or increase the levels** — this in 2d
> site / 3d site / site panel interface."*
> — founder, 2026-09-09

---

## 2 · ⭐⭐ THE MEASURED FINDING — THE GEOMETRY IS ALREADY THERE; WHAT IS MISSING IS **IDENTITY**

Read before proposing anything. Measured at HEAD `754bc8fb`:

| Capability | State |
|---|---|
| N envelopes from one gesture, ONE Ctrl+Z | ✅ `spaceEnvelope.batch.create` — C114 §6a: *"there is no singular `spaceEnvelope.create`"* |
| One envelope PER STOREY, each seated on its own `levelId` | ✅ `buildEnvelopeAuthoringPlan` already emits exactly this |
| Arbitrary drawn ring, on 2D site and 3D site | ✅ `envelopeDrawSurface.ts` + `drawnEnvelopeFootprintState.ts` |
| Face drag moving one face of one prism | ✅ `SpaceEnvelopeFaceDrag` / `FaceGizmo` / `FaceMove` |
| Choose which storey the stack starts on | ✅ `startStoreyId` (§ENVELOPE-PER-LEVEL) |
| Replace-not-accumulate on re-create | ✅ `supersedes` in the same `produceCommand` (§L-13038) |
| Polygon intersection (for overlap area) | ✅ `intersectPolygons2D`, oracle-pinned (§C73-POLY-BOOLEAN / GE-05) |
| **"Which building does this envelope belong to?"** | ⛔ **DOES NOT EXIST** |

`SpaceEnvelope` carries exactly two identity axes — `levelId` (which storey) and `role` (what it
means) — plus `withinId`, which is containment (room ⊂ level) and is *refined to be `null` for
`role: 'level'`*. There is no third axis, and every "is there already one here?" query in the
product is therefore **`levelId`-only**.

### ⛔ AND THAT IS NOT MERELY A GAP — IT ACTIVELY DESTROYS THE FEATURE TODAY

`resolveLevelEnvelopeSupersession(onStorey, rule)` is handed every envelope on a storey and treats
each as a **rival to be replaced**. §L-13038 made that correct on the founder's own instruction —
*"WHEN I SELECT ANOTHER MASSING OPTION THE PREVIOUS ONE SHALL BE REMOVED."*

For a master plan it is exactly wrong. **Block A's Level 1 and Block B's Level 1 are peers, not
rivals.** Drawing the second building today either deletes the first (`kind: 'replace'`) or refuses
(`kind: 'blocked'`). So master planning is not a missing feature bolted on top of a working
one — it is a feature the current, deliberately-correct rule forbids.

⭐ **The whole of this ADR reduces to one sentence: give the envelope a third identity axis, and
make every "on this storey" question become "on this storey, IN THIS GROUP".**

---

## 3 · DECISIONS

### D1 — The group is a nested value on the member, **not** a new element kind and **not** a new store

**`group: { id, label } | null` on `SpaceEnvelope`. `null` ⇒ ungrouped, which is every envelope
that exists today.**

⛔ **A new element kind was rejected.** C83 §2.1 states the cost directly — *"a new element kind
must not require 30 new decisions"* — and a massing group has **no geometry of its own**. Its
"volume" would be a function of its members, i.e. a cache, i.e. C84 EI-9, i.e. two answers to
"where is Block A".

⛔ **A second store was rejected, and this is the load-bearing constraint, not a preference.**
`PluginRegistration` (`plugins/space-envelope/src/registration.ts`) binds **one plugin to one
`storeKey`** with one `buildStore`. A second store therefore means a **second plugin registration
for one element family** — which is C84 §1's *"five rival representations per family"* created
deliberately. It would also cost the one property this family is built around: C114 §2 notes that
`pool` spans four stores and MUST use `produceMultiStoreCommand` or its patches route to nothing.
Keeping groups in the SAME store keeps *"3 profiles × 5 storeys = 15 envelopes"* a single
`produceCommand` → **a single Immer patch pair → a single Ctrl+Z**, which is the entire reason
C114 §6a exists.

⚠ **THE COST IS NAMED, NOT HIDDEN: `label` is denormalised across the group's members.** N copies
of one string can drift. Three things close it, and none of them is discipline:
1. **`spaceEnvelope.group.rename` is the ONLY writer**, and it rewrites every member inside one
   `produceCommand` — so a rename is atomic and is one undo.
2. **A test asserts every `group.id` in a store resolves to exactly one distinct `label`.**
3. ⭐ **The READER refuses to paper over a disagreement.** `readMassingGroups` takes the label from
   the lowest-seated member and, when members disagree, **reports the disagreement** rather than
   silently picking one (§CONTEXT-DATA-HONESTY, L-581/L-616). A drift becomes visible, not invisible.

### D2 — "Define N profiles first" is a **transient authoring state**, not a persisted record

The founder defines the profiles, *then* the levels, *then* commits once. Between the first and the
last there is no building — there is an **exploration**. `drawnEnvelopeFootprintState.ts` already
holds exactly that for ONE ring and states the rule in its own header: *"SESSION-ONLY, NOT PERSISTED,
AND THAT IS A DECISION … A ring restored silently on the next load would sit on the ground as a
proposal nobody in that session drew."*

⭐ **That module is GENERALISED from a slot to a roster — not rivalled by a second module.** The
existing `getDrawnEnvelopeFootprint()` keeps its exact meaning ("the most recent profile"), so every
current caller is untouched, and a new `getDrawnEnvelopeProfiles()` returns the whole list.

⛔ **CONSEQUENCE, STATED PLAINLY: AN EMPTY GROUP IS NOT REPRESENTABLE.** A group exists because its
envelopes carry its id. Delete every member and the group is gone. **This is correct, not a
limitation** — a group with no envelopes is a profile you have not built, and that is precisely
what the transient roster is for.

### D3 — Supersession becomes group-scoped, and back-compatibility falls out **by construction**

The rule changes from *"the envelopes on this storey"* to *"the envelopes on this storey **whose
`group.id` equals the one being created**"*, where ungrouped (`null`) is its own bucket.

⭐ **The existing single-building flow is a master plan with exactly one (unnamed) group.** So:
* create ungrouped on a storey → supersedes only ungrouped envelopes → **byte-identical to today**;
* create in Block B → supersedes only Block B → Block A is untouched.

⛔ **This is the whole migration.** No data migration, no backfill, no file-format break: a record
written before today parses with `group: null` and behaves exactly as it did.

### D4 — Overlap between groups is **ADVISORY**, never a refusal — and it is measured, not guessed

Two profiles overlapping **on the same storey** is reported with **both numbers** (the overlap area
in m², via the kernel's `intersectPolygons2D` — never an estimate). Two profiles overlapping **on
different storeys** is **not a finding at all**: that is a podium with towers on it, which is a
normal master-planning scheme, and flagging it would train the user to ignore the warning.

⛔ **It is not a refusal.** C114 §12's decisive row: *"Refusing an architect's edit on the authority
of a study PRYZM computed would tell a professional they may not draw something they may well be
entitled to build."* At massing stage an architect deliberately overlaps volumes while studying
options. [[spatial-validity-rules-founder-direction]] — IMPOSSIBLE vs INADVISABLE vs FINE — puts
this in INADVISABLE, and the founder's standing direction there is **always ASK, never silently
correct**.

### D5 — A per-group refusal must not kill the batch; a project-wide one must

Two genuinely different failures were being conflated, so they are separated by kind:

| Refusal | Scope | Verdict |
|---|---|---|
| *"you asked for 4 storeys, this project has 1"* | **project-wide** — identical for every group | **refuse the whole batch** — proceeding would build every block wrong |
| *"this ring is degenerate / self-crossing"* | **this profile only** | **build the others, NAME the one skipped** |

⛔ Refusing all three blocks because one ring was drawn badly is the failure
[[refusing-half-needs-its-escape-hatch]] names: a gate whose "no" branch discards work the user
already did. Silently dropping it is worse — the user counts three blocks and gets two.

### D6 — One group-selection state with ONE owner, read by all three surfaces

2D site, 3D site and the site panel share **one** module-owned selection slot with a subscribe
channel — the `drawnEnvelopeFootprintState` pattern again.

⛔ **Three independent selections is not a hypothetical risk here; it is this repo's measured
recurring defect.** [[view-region-one-owner]]: the split-view "mixed up" report was **six writers of
`#container.style.width`** oscillating. C59 §2.10 rules one owner per view region. The same rule is
adopted here before the second writer exists rather than after.

### D7 — Every mutation is a command (P6)

Add/remove a storey from a group, rename a group, dissolve a group: all `commandBus` verbs, no
direct store writes from UI. Ids minted by the CALLER (C16 CA-2) — `execute()` runs again on redo,
so minting inside a handler produces a different id the second time and orphans every reference.

---

## 4 · THE VERBS

| Verb | Payload | Undo |
|---|---|---|
| `spaceEnvelope.batch.create` *(existing, extended)* | each spec gains optional `group` | 1 |
| `spaceEnvelope.group.setStoreys` | `{ groupId, targetStoreys, mintedIds[], startStoreyId? }` | 1 |
| `spaceEnvelope.group.rename` | `{ groupId, label }` | 1 |
| `spaceEnvelope.group.dissolve` | `{ groupId }` — clears `group`, **keeps the envelopes** | 1 |

⛔ `setStoreys` is ONE verb for both directions, not `addStorey` + `removeStorey`. The founder's
words are *"decide ad-hoc if i want to reduce or increase the levels"* — one control, one intent,
one undo. Two verbs would let a surface implement "go from 3 to 6" as three dispatches and spend
three Ctrl+Zs on one gesture, which is exactly RESI-ORCHESTRATOR-PLAN §6 risk 7.

⛔ `dissolve` does **not** delete. Deleting is `spaceEnvelope.delete`, which already exists; a verb
whose name says "ungroup" and whose effect is "destroy three buildings" is the worst kind of
irreversible surprise.

---

## 5 · STAGES

| # | Stage | Files |
|---|---|---|
| **S1** | `group` on the schema + the store index `byGroup()` | `packages/schemas/src/elements/SpaceEnvelope.ts`, `plugins/space-envelope/src/store.ts` |
| **S2** | Group-scoped supersession | `apps/editor/src/ui/site/levelEnvelopeSupersession.ts` |
| **S3** | The multi-profile plan — **composes `buildEnvelopeAuthoringPlan` per group, never copies it** | new `masterPlanAuthoringPlan.ts` |
| **S4** | The three group verbs | `plugins/space-envelope/src/handlers/` |
| **S5** | Transient profile roster | `drawnEnvelopeFootprintState.ts` |
| **S6** | Group selection channel (one owner) | new `massingGroupSelectionState.ts` |
| **S7** | Site-panel section: roster, per-group storey control, overlap advisory | `apps/editor/src/ui/site/` |
| **S8** | 2D + 3D rendering: per-group tint, click-selects-group | `SiteBoundaryMap2D.ts`, `CesiumViewport.ts` |

⭐ **S3 is where the dominant defect would land.** `buildEnvelopeAuthoringPlan` is 979 lines holding
the storey ladder, the height ladder, the ordinance advisory and the seatability rules. A
multi-profile planner that re-implements any of that is
[[same-rule-two-implementations]] — the shape that has now recurred **seven times** in this repo. S3
**calls** it once per profile and composes the results into one payload.
