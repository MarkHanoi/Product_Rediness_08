> # ⛔ SUPERSEDED — NOT A CONTRACT. A preserved SOURCE DRAFT.
>
> **The binding contract is [C84 — ELEMENT INTEGRITY](../../02-decisions/contracts/C84-ELEMENT-INTEGRITY.md).**
> Do not cite this file as normative and do not edit it to change policy. The `Status: CANONICAL` line
> immediately below is **this draft's own original header, left untouched** — it is no longer true.
>
> **Why it still exists.** C84 was minted twice on 2026-08-18 under the same number by two agents who
> had each been told to write it. The anti-duplication contract was itself duplicated, by the very
> mechanism it forbids: a number allocated in one place and consumed in another with no register
> between them. The drafts were merged into `C84-ELEMENT-INTEGRITY`, where this lane's thirteen
> invariants live as **EI-9…EI-13** plus the `[Z8]`-marked amendments, and where the three
> disagreements between the two derivations — **two of which this draft got wrong** — are recorded
> in **C84 §0**.
>
> This file is kept **verbatim and unedited below this banner**, so the record of two independent
> derivations survives the merge that reconciled them. That record is the evidence for **EI-10(b)**:
> the disagreements are how each error was caught. See the roadmap **§7.8a**.
>
> **Section numbers below are this draft's own and do NOT match C84's.** Mapping:
> §1.1→EI-9 · §1.2→EI-10 · §1.3→EI-11 · §1.4→EI-1/EI-1a · §1.4a→EI-1b · §1.5→EI-2 · §1.5a→EI-12 ·
> §1.5b→EI-4a · §1.6→EI-13 · §1.6a→EI-5a · §1.7→EI-8a · §2→C84 §3.5 · §4→C84 §8.

---

# C84 (SUPERSEDED DRAFT) — ONE ANSWER PER QUESTION: representation rivalry, and what a second implementation must earn

> **Stamp**: 2026-08-18 · **Status**: CANONICAL · **Owner**: Architecture
> **Minted because**: a repo-wide duplication audit (lane Z8) measured **two complete parallel geometry
> stacks**, **two element-store construction roots that never exchange references**, and a **9.774 m
> geometry divergence between what the viewport draws and what the bake worker bakes** — none of which
> any gate could see. The founder's instruction on reading the audit: *"this should never have happened."*
> **Subordinate to**: [STR-03](../../01-strategy/STR-03-engineering-vision.md) →
> [STR-04](../../01-strategy/STR-04-architecture.md).
> **Neighbours, not rivals**: **C03** (state), **C16 §5.1 `CA-17…CA-21`** (command liveness),
> **C69** (verb register), **C70** A-INV-1/A-INV-3, **C73** (geometry determinism & tolerance),
> **C78** §21 OQ7. C84 governs the axis none of them own: *how many implementations of one question are
> allowed to exist, and what the second one must prove.*
> **Decision record**: [ADR-0331](../adrs/ADR-0331-one-answer-per-question-and-the-decided-loser.md).
> **Evidence**: [`DUPLICATION-AUDIT-AND-CONVERGENCE-ROADMAP.md`](../../03-execution/plans/DUPLICATION-AUDIT-AND-CONVERGENCE-ROADMAP.md).

---

## §0 — The failure class this contract exists to name

C16 §5.1 named **the dead write** — a command that writes somewhere nothing reads. C84 names its
sibling, which is worse because it is silent in both directions:

> **THE RIVAL ANSWER.** Two implementations of one question, both alive, reached by different
> consumers. Neither is dead. Neither errors. They simply disagree, and the disagreement surfaces as a
> user's export not matching their screen, a colour that changes name between two sentences, or an
> undo that reverts a store the forward write never touched.

The measured instances at mint (every one carries a file:line in the audit):

| # | Rival | Consumers that disagree | Status |
|---|---|---|---|
| 1 | `buildCurvedLayerGeometry` × 3 (`CurvedWallLayerBuilder.ts:36`, `WallFragmentBuilder.ts:1607`, `producers/_internal/buildCurvedLayer.ts:56`) | viewport vs bake worker | **DIVERGES 9.774 m** on a mitered curved wall — `tests/parity/wall/stackAB-miter-parity.test.ts` |
| 2 | element stores × 2 roots (`initBuilders.ts` vs `PluginRegistry.ts:228-465`) | renderer/serializer vs bus handlers | 19 families TWO LIVE |
| 3 | colour-name→hex × 6 (`colorRef.ts:24`, `QueryEngine.ts:726` + `:1138`, `PropertyInspectorApply.ts:49` + `:497`, `PropertyRenderer.ts:207`) | chat vs inspector vs panel | **DRIFTED** — `black` is `#333333` in one, `#000000` in five; `green` is `#008000` in one, `#00ff00` in four |
| 4 | style alias maps × 2 (`styleFinish.ts:237`, `StyleRegistry.ts:272`) | furniture finish vs glazing | **DRIFTED** — `rustic`→mediterranean vs →farmhouse |
| 5 | `ElementType` union × 4 (`schemas/Id.ts:79` 30 members · `CoreElement.ts:7` 18 · `AITypes.ts:16` 11 · `ai/types.ts:16` 11, byte-identical to the third) | IFC export vs everything | **DRIFTED** — `curtain-wall` vs `curtainwall` ⇒ curtain walls export as `IfcBuildingElementProxy` (`CoreElement.ts:102`) |

---

## §1 — The invariants

### §1.1 — ONE ANSWER PER QUESTION *(hard rule)*

**For any question the system answers — "where does this wall start vertically", "what hex is
'black'", "is this point inside this polygon", "which store holds walls" — there is exactly ONE
implementation, in exactly one file, and every consumer reaches it.**

A second implementation is a **CONTRACT VIOLATION** unless it satisfies §1.2 in full.

### §1.2 — WHAT A SECOND IMPLEMENTATION MUST EARN *(the four-part licence)*

A second implementation of one question is admissible **only** with all four of:

- **(a) A NAMED REASON** in the file header, stating what the first implementation cannot do —
  a layer boundary, a purity constraint, a runtime that cannot host the first. *"Convenience",
  *"it was easier here"*, and silence are not reasons.
  **Precedent that satisfies (a):** `packages/ai-host/src/intents/finishRef.ts:8-14` — transcribes 15
  material hexes because `materialLibrary.ts` constructs `THREE.Color` at module load and the resolver
  must stay pure. That is a real constraint, stated.
- **(b) AN EXECUTED EQUIVALENCE PROOF** — a test that feeds identical inputs to both and asserts they
  agree, or asserts and *names* the divergence. Reading two files and judging them equivalent does not
  satisfy (b); **C16 CA-21's rule applies unchanged — a declaration is not an execution.**
  **Precedent that satisfies (b):** `tests/parity/wall/stackAB-miter-parity.test.ts`.
- **(c) A DECLARED DIVERGENCE LIST** — every input on which the two legitimately differ, with the
  reason. An empty list means "byte-identical", and must be asserted, not assumed.
- **(d) A RETIREMENT CONDITION** — what would have to be true for the second copy to be deleted.
  A second implementation with no exit is permanent debt with a comment attached.

> **§1.2a — The licence is per-QUESTION, not per-FILE.** `CurtainPanelBuilder.ts:4` (*"thin façade over
> `CurtainPanelFactory.buildPanelObject()`"*) needs no licence: it answers a different question
> (assembly vs panel), and calls the other. See §2 for how to tell.

### §1.3 — VIEWPORT AND EXPORT/BAKE MUST BE THE SAME CODE *(hard rule, the mint case)*

> **The geometry a user SEES and the geometry the system EXPORTS, BAKES or PERSISTS must be produced
> by the SAME function, from the SAME inputs.**

Where two code paths exist today, an executed parity harness per element family is **mandatory**, and
its divergences are **defects with issue numbers**, not tolerances. A parity harness that snapshots one
stack against *itself* does not satisfy this clause — that is the exact hole `wall-snapshot.test.ts`
and `wall-headless-node.test.ts` left, and it is why a 9.774 m divergence shipped unseen.

**Corollary — a caller may not silently substitute inputs.**
`HeadlessBakeSession.ts:139` calls `produceWall(w, NO_JOINS, 0)`: neighbour joins discarded, level
elevation forced to zero, both self-documented as *"v0"*. Identical code with substituted inputs is
**not** the same answer. A substituted input must be declared under §1.2(c) and must refuse loudly
(C74 / STR-03 §12.3 invariant 1) rather than silently produce a plausible wall at the wrong height.

### §1.4 — ONE AUTHORITATIVE STORE PER ELEMENT KIND *(hard rule)*

**Per [ADR-0318](../adrs/ADR-0318-composeruntime-owns-authoritative-stores.md) I-1/I-2, the
authoritative store for a kind is the instance registered in `storeRegistry` — the one
`ProjectSerializer` reads.** A second store holding records of the same kind is a rival, and:

- **A rival store may not be WRITTEN by a command.** A handler writing a non-authoritative store is a
  **C16 CA-17 dead write** and a **C84 §1.4 violation**.
- **A store KEY must name the same object at every point in a command's lifecycle.** The measured
  violation: `affectedStores: ['wall']` resolves to the plugin DTO store at write time and to
  `window.wallStore` at undo time (`performUndoRedo.ts:308-353`). **One key, two objects, one
  command.** This restates C16 CA-19 as a store-side invariant so it binds the store owner and not
  only the command author.
- **A rival that exists only to satisfy a registration API must be declared and dated.**
  `plugins/rooms/src/store.ts:1-29` is the standard to copy: it names the winner, states its own
  reader and writer counts as zero, and carries a three-step retirement path.

### §1.5 — A BRIDGE COVERS MUTATIONS, OR IT IS NOT A BRIDGE *(hard rule)*

Measured at mint: **12 bridges in `initTools.ts`, every one a `.created` event; ONE mutation channel
in the entire repository** (`elementLevelChangedMirror.ts:241`, covering 2 verbs and 2 kinds); **zero
`*.deleted` events emitted or subscribed.** That asymmetry is L-946.

> **A bridge that mirrors CREATE without mirroring the mutations of the same family is INCOMPLETE, and
> must say so at its own definition site** — the list of verbs it does NOT carry, in the file, next to
> the ones it does.

Bridges are **transitional by definition** (§1.4, ADR-0318). A bridge may not be presented as an end
state, and a *new* bridge requires a retirement condition under §1.2(d).

### §1.6 — EMITTING AN EVENT NOBODY CONSUMES IS A DECLARED GAP, NOT A FEATURE

Nine events are emitted by `CommandEventBridge.ts` with zero subscribers (`slab.layer-updated:937`,
`ceiling.layer-updated:957`, `floor.layer-updated:977`, `room.created:689`, `grid.created:699`,
`plumbing.created:854`, `structural.created:864`, `annotation.created:874`, `dimension.created:884`).
Either wire the consumer or delete the emitter — the precedent already exists in the same file
(`CommandEventBridge.ts:627-631`, where `door.created` / `window.created` / `stair.created` were
deleted for exactly this reason). An unconsumed emitter that stays must carry the reason inline.

### §1.4a — PER-CONSUMER AUTHORITY MAY DIFFER, AND MUST THEN BE DECLARED *(hard rule)*

§1.4 says one authoritative store per kind. Measurement shows the repo does **not** hold that uniformly,
and pretending otherwise is how the wall split survived: the viewport reads the `geometry-wall`
singleton (`initBuilders.ts:77, 553`) while the bake worker reads a **plugin DTO `WallStore`**
(`HeadlessBakeSession.ts:31, 51`) populated only by in-job command replay (`:76-84`).

> **Where two consumers of ONE family read DIFFERENT stores, that fact MUST be declared in the family's
> store header, naming every consumer and its store.** An undeclared per-consumer split is a
> §1.4 violation. A family whose consumers all read one store is **CLEAN**, and must be recorded as
> clean — not left blank, because a blank reads as "fine" (§2).

The consumer set to answer for, every time: **renderer · plan view · persistence/snapshot · IFC export ·
GLB export · bake worker.**

### §1.5a — A REGISTERED TRIGGER MUST HAVE A PROVEN DISPATCHER *(hard rule)*

A cascade rule, consequence planner, event subscriber or trigger table keyed on a verb **must** name a
production dispatcher of that verb, proven by a call site — or declare itself dormant with the condition
under which it becomes live.

**The worked example, and it nearly cost a wrong fix:** `plugins/cross/src/wall-room.ts:53,61` registers
`wall.delete` as the wall→room cascade trigger. Nothing dispatches `wall.delete`. The obvious "fix" —
make the delete path dispatch it — **would have changed nothing**, because `new CascadeRunner()` occurs
only in tests and `buildWallRoomCascadeRule` has zero non-test call sites: there is no runner to run the
rule. The real gap is the unregistered cascade subsystem, dispositioned to BIM30 plan R2
(ADR-0322 / STR-06 §18, recorded at `plugins/rooms/src/handlers/RecomputeRoomBoundary.ts:39-45`).

> **A trigger with no dispatcher and a dispatcher with no runner fail the same way: silently, and they
> look identical to a reader. Name which one you have.**

### §1.5b — ONE ROUTE PER USER INTENT *(hard rule)*

**Two UI surfaces expressing the same user intent MUST reach the store by the same route.** A second
surface may not construct its own command, apply its own routing, or read a different field set.

**Measured instance:** `element.delete` routed `opening` → `DeleteOpeningCommand` and `lighting` →
`DeleteLightingCommand` on `elementType` (`plugins/view/src/handlers/DeleteElement.ts:51-57`), while
`BimService.deleteSelected()` read only `userData.id` and always built `DeleteElementCommand` — which
has no branch for either kind and returns `success:false` (`DeleteElementCommand.ts:651`). **Deleting a
light from the context menu deleted nothing; the Delete key worked.** Closed by
`§FIX-ONE-DELETE-PATH`, and the fix was to **delete the second route**, not to copy the routing table
into it — copying would have minted the second answer §1.1 forbids.

### §1.6a — A WRITE-ONLY SHADOW MUST BE DECLARED, NOT RECONCILED *(hard rule)*

A store that nothing authoritative reads is a **shadow**. Measured: the `.created` bridges are one-way
and create-only, every subsequent edit goes legacy-only with no write-back
(`PropertyInspectorApply.ts:446`, `initBusHandlers.ts:1136`), and `ProjectLoader.ts:743` reloads through
legacy commands with **no bus event** — so **after any project load every plugin DTO store is empty
while the legacy stores hold N records.**

> **Do NOT add a purge, a mirror, or a reconciliation to keep a shadow consistent.** That makes both
> copies look authoritative and neither trustworthy (§4.c). **Declare** it: the store header names the
> winner, states its reader and writer counts, and gives the retirement path — the
> `plugins/rooms/src/store.ts:1-29` form. **This clause is sound only while the reader count is zero.**
> If any consumer is found reading a shadow, the declaration inverts and reconciliation becomes
> mandatory — so the reader census must be re-run **on the bus axis as well as the import axis** (§2.3).

### §1.7 — A CONSTANT TABLE HAS ONE HOME; A COPY IS PINNED BY A TEST

Where §1.2 licenses a transcribed table (a layer boundary, a purity constraint), **the copy MUST be
pinned to its master by an executed test comparing every value.** A comment saying *"update the hex
here in the same commit"* (`finishRef.ts:14`) is the mechanism that has already failed twice — §0
rows 3 and 4.

---

## §2 — The classification a reviewer MUST apply *(the "duplicated vs co-living" test)*

⛔ **Nothing may be deleted, merged, or called a duplicate on a name match.** Apply the test and record
the evidence. This section exists because the audit's own value came from applying it: three candidates
that *looked* like rivals were measured and cleared.

| Verdict | The test | Evidence required | Action |
|---|---|---|---|
| **CO-LIVING** | Both reachable; they answer **different questions** | different inputs **or** different outputs, cited | none — record why |
| **STAGE** | One **calls** the other | the import + the call site | none |
| **LIVE FORK** | Both reachable, **same question**, selected by a branch | the branch condition, file:line | **§1.2 licence or converge** |
| **PARKED** | Behind a flag, default off, reason recorded | the flag + the recorded reason | loaded gun — log it, do not delete |
| **RENDER-DEAD / OTHER-HOST-LIVE** | No importer in host X, **live in host Y** | importer census **across all hosts** | ⛔ **NOT deletable** |
| **TRULY DEAD** | Zero importers **anywhere, including tests and non-editor hosts** | the full census | deletable |

> ### §2.1 — The importer census MUST include non-editor hosts *(hard rule)*
> `apps/bake-worker`, `apps/sync-server`, `apps/api-gateway`, `apps/marketplace-api`, `apps/headless`,
> `apps/bench`, `pryzm-selfhost/`, `server/`, `tools/`, `tests/`.
> **This clause is not hypothetical.** All 26 `geometry-kernel` producers have zero *editor* render
> call sites and read as dead; `apps/bake-worker/src/session/HeadlessBakeSession.ts:23,131` calls
> `produceWall` for real, and that worker ships in `pryzm-selfhost/docker-compose.yml:94`. **Deleting
> them on an editor-only census would have deleted the self-host bake pipeline.**

> ### §2.3 — THE REACHABILITY CENSUS HAS TWO AXES, AND ONE OF THEM IS USUALLY FORGOTTEN
> A write can arrive at a store **through a bus verb**, never touching an importable symbol. A census
> that greps for **callers of the store** therefore misses it entirely.
> **Measured instance:** a lane reported a plugin pipeline had *"no production call site"*. **False** —
> `RailingPlanToolHandler.ts:92` dispatches the bus verb `handrail.create`. The store had no callers;
> the verb had a dispatcher.
> **⇒ Every reachability claim MUST state which axis it measured, and a DELETION claim requires BOTH:**
> (a) the **import/construction** axis — who imports or `new`s it; and
> (b) the **bus** axis — which verbs write it, and whether any production surface dispatches those verbs.

> ### §2.2 — Worked verdicts, so the test is not abstract
> - `SlabFragmentBuilder` / `FloorPanelBuilder` / `CeilingPanelBuilder` → **CO-LIVING** (structural slab
>   vs floor finish vs ceiling finish; all three live at `initBuilders.ts:348, 422, 391`).
> - `CurtainPanelBuilder` → **STAGE** (`:4` calls itself a thin façade; imports the factory at `:30`).
> - `StairPreviewRenderer` / `CurvedStairRenderer` → **CO-LIVING** (Canvas2D overlay previews,
>   `getContext` at `:77`/`:49` — not 3-D geometry at all).
> - `buildCurvedLayerGeometry` #1 vs #2 → **LIVE FORK** (`WallFragmentBuilder.ts:1607` vs `:1844`,
>   split on layer count; identical output at `layerOffset=0`).
> - `<kind>.delete` × 10 → **dormant verbs, NOT latent bugs** — measured: no UI, chat, or collab path
>   dispatches any of them; every real delete reaches `DeleteElementCommand`. *This verdict downgraded
>   a finding the audit had ranked high. Measure before you rank.*

---

## §3 — Enforcement: what exists, what is owed

| Invariant | Gate | Reading at mint |
|---|---|---|
| §1.3 viewport ≡ bake | `tests/parity/wall/stackAB-miter-parity.test.ts` | **wall only** — 10 pass, 1 pinned `it.fails` (§Z8-CURVED-MITER-BAKE-DIVERGENCE). Slab/door/window **OWED** |
| §1.4 store authority | `mt05StoreIdentityHeap.spec.ts` (heap `toBe`, 15 kinds) | proves **Root A internally**; says nothing about Root A vs Root B — **the rival axis is UNGATED** |
| §1.4 write reaches authority | `check-verb-liveness.ts` (**GROW-ONLY** ratchet) | **PROVEN 7 / 326**; UNPROVABLE-NO-STORE 109; UNKNOWN 210 |
| §1.4a per-consumer authority declared | **NONE** | the 15×6 matrix in the roadmap §10.1 is the current census |
| §1.5 bridge completeness | **NONE** | — |
| §1.5a trigger has a dispatcher | **NONE** | — |
| §1.5b one route per user intent | `apps/editor/__tests__/OneDeletePathAcrossSurfaces.test.ts` | 5/5, delete only |
| §1.6 unconsumed emitters | **NONE** | 9 emitters, 0 subscribers |
| §1.6a shadow declared not reconciled | **NONE** | — |
| §1.7 pinned constant copies | **NONE** | — |
| §1.1 predicate bodies | `check-predicate-canonical.ts` | exit 1, 138/138 at declared level; **blind to correctness by design** |
| §1.1 tolerance literals | `check-epsilon-policy.ts` | **exit 3 — RATCHET EXCEEDED**, 319/318 |
| §2 classification | review judgement | **not gateable; the evidence rows are the audit trail** |

**Nine of thirteen invariants have no gate.** C84 is therefore **CANONICAL, not ACTIVE**, and says so
rather than leaving it to inference (the C68 §6.3 idiom). ADR-0331's roadmap orders the gates.

### §3.1 — The three live data-loss findings this contract was minted over

Recorded here because a contract whose motivating defects are not named becomes abstract within a month.
All three are measured; see roadmap §10.0.

1. **Lighting is never persisted** — `grep -ci "lighting"` on `ProjectSerializer.ts` → **0**, while
   `ProjectLoader.ts` carries 18 hits. The load half exists, the save half does not, so it *looks*
   wired. Every light the user places is destroyed on save/reload. **§1.4a violation** (the persistence
   consumer has no store at all for this family).
2. **One door, two records** — persistence reads standalone `doorStore`/`windowStore`
   (`ProjectSerializer.ts:47-48, 704-705`); IFC export reads openings embedded on the wall record
   (`WindowDoorReader.ts:1,7,12` via `FragmentReader.ts:89`). **§1.1 + §1.4a violation.**
3. **Silent IFC absences** — no `CeilingReader`, `FloorReader` or `LightingReader` in
   `packages/file-format/src/export/ifc/readers/`. The export succeeds and the elements are gone:
   STR-03 §12.3 invariant 1 (*failure and emptiness are never the same value*) on the export path.

---

## §4 — Anti-patterns

- **§4.a — Counting files whose names are similar.** ADR-0327 refuted its own row this way: four
  "LevelStore" files were three different kinds of object. Apply §2.
- **§4.b — Deleting on an editor-only importer census.** §2.1.
- **§4.c — Mirroring state between two stores as an end state.** A mirror makes both copies
  authoritative and neither trustworthy; ADR-0318 I-1 forbids the copy. Retire the loser's *write*.
- **§4.d — A comment as the synchronisation mechanism.** §1.7. It has failed twice, measured.
- **§4.e — A parity test that compares a stack to itself.** §1.3.
- **§4.f — Reporting a tolerance where a defect belongs.** 9.774 m is not a tolerance.
- **§4.g — Inflating an unwired overlay into a live rivalry.** `RENDER_MATERIAL_LIBRARY` (16 entries,
  1 display-only importer, **0** call sites of its functional exports) is real but is **not** a rival
  master. Over-reporting it costs the audit its credibility on the findings that are real.
