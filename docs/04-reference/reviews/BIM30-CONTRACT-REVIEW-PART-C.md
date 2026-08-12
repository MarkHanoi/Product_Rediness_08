# BIM 3.0 Contract Review — PART C (empirical half): §1–§5 and §17

> **Stamp**: 2026-08-12 · **Branch**: `main` · **Scope**: founder-commissioned capability-completeness
> DISCOVERY over C70–C75. Sections owned here: **§1** product promise & user-level operations ·
> **§2** capability matrix · **§3** change-impact discovery · **§4** Story A (the stair change) ·
> **§5** the ten chains · **§17** the cascade matrix. §6–§16/§18–§19 and the verdict belong to a
> sibling review and the coordinator.
>
> **DISCOVERY ONLY.** Nothing was implemented; no contract was edited; this file is this agent's
> only repo write. No `git stash` was run.
>
> **Evidence vocabulary (binding, per C70 §0.1)** — every claim below carries one of:
> **EXECUTED** — a probe/grep/read was run in THIS session and its output is the evidence ·
> **EXECUTED-CITED** — an executed run recorded in the evidence corpus (EV-03/04/05, certification
> results, gate output) is cited, not re-run · **BY-READ** — source read at HEAD in this session;
> proves "this code exists and says X", never runtime behaviour · **UNPROVEN** — nobody looked ·
> **MISSING** — looked, and the machinery/answer does not exist · **PARTIAL** — some links hold,
> others do not · **AMBIGUOUS** — the contracts do not define "done" well enough to test it.
> **BY-READ never becomes a capability claim** (C70 §0.1).
>
> **Findings carry stable ids C-01…C-26** (ledger at the end, §F). Gap-type suggestions use the
> founder's taxonomy (IMPLEMENTATION / WIRING / EVIDENCE / CONTRACT / PRODUCT / OUT-OF-SCOPE);
> final classification is the coordinator's.

---

## §1 — Start with the PRODUCT

### §1.1 The smallest useful promise

> **"One conversation — or one session of direct manipulation — takes a user from a raw site to a
> coordinated building, and every change they or the AI makes afterwards leaves the building
> coordinated: everything affected is updated or named as invalid, nothing authored is silently
> rewritten, and the model can always say what changed, why, and what it now refuses."**

The load-bearing word is **coordinated**. PRYZM already creates (generation engines, EXECUTED-CITED:
capability model §12 — "complete and grep-confirmed AI-clean") and already renders. What BIM 3.0
adds, per C70 §1.1, is that a *change* keeps the whole building true. Every gap found below is a
gap in the *after-the-change* half of the promise, almost never in the *create* half.

### §1.2 The user-level operations the promise implies

The founder's list is a FLOOR. Status of the floor first, then the operations the floor misses.

| # | Founder-floor operation | Status | Evidence |
|---|---|---|---|
| 1 | create-from-brief | **PARTIAL** — deterministic engines ship (apartment/house/office, D-TGL/D-FLE/D-CE) but generation leaves the level permanently redetect-suppressed (PR-05) | EXECUTED-CITED: EV-03 §8.4, gap register PR-05 |
| 2 | edit | **PARTIAL** — commands exist per kind; several mutations strand dependents (see §3, §17) | EXECUTED-CITED: EV-03 |
| 3 | ask-what-is-affected | **MISSING** — no `graph.*` verbs (GR-16); the two code paths shaped to answer it return `[]` unconditionally: `SpeculativeEngine.getAffectedByDeletion` guards on a method that has never existed, `DependencyResolver` returns `[]` on delete | EXECUTED-CITED: EV-04 §5b, C72 §0 → **C-03** |
| 4 | ask-why | **PARTIAL** — refusal explanations exist (canPlace reasons, BuildableEnvelope unions, golden op "explanation" P0-8 CLOSED per capability model §13); *post-hoc* "why did X change" has no owner | BY-READ → **C-04** |
| 5 | regenerate-derived | **PARTIAL** — room redetect, wall joins, slab rebuild live; `_rebuildSemanticGraph` covers 5/25 types in two byte-identical copies (GR-06/08); schedules have no geometry subscription (PR-12, UNPROVEN at HEAD) | EXECUTED-CITED: EV-04 §3 |
| 6 | preserve-authored | **MISSING as an enforceable property** — no element carries provenance (PV-02), so no code path *can* distinguish authored from generated to preserve it; C75 §2.7 (REGENERATED carries prior) has zero implementations | BY-READ: C75 §0 Finding 2 → **C-13** |
| 7 | undo-a-cascade | **PARTIAL** — wall-family edge purge/restore is the reference shape (C71 §5.6, `3ee632f6`); whether undo of an *edit* reverses the graph edges the same command wrote is UNPROVEN (EV-03 §10.3); generation undo-as-one-gesture claimed by runBatch design, uncertified on the unified path (CE-04) | EXECUTED-CITED |
| 8 | save/reload | **PARTIAL** — identity HOLDS (17/17 kinds, `check-identity-roundtrip` 0 CLEAN, EXECUTED-CITED: gap register §10 row 2); state round-trip had open F-3/F-4/F-5 defects at corpus stamp; browser I/O never certified (CE-03) | EXECUTED-CITED |
| 9 | collaborate | **UNPROVEN by construction** — no transport deployed (CB-01, founder decision); conflict-surfacing has no gate (CB-04) | EXECUTED-CITED |
| 10 | export/import with identity | **PARTIAL** — GUID join key survives save/reload (EXECUTED-CITED); provenance export mapping does not exist and C75 §5 calls it its own largest open risk (PV-04) | EXECUTED-CITED |
| 11 | NL→governed commands | **PARTIAL/STRONG** — RAC ladder, read-only default, zero-token tiers (capability model §15); graph questions not chat-reachable because the verbs don't exist | EXECUTED-CITED |
| 12 | honest refusal | **PARTIAL** — strong precedents (planOpeningRefit, BaselineReversalError, roof collapse modes); three named `[]`-conflation sites; no gate asserts a refusal reaches the user (GE-09) | EXECUTED-CITED |

### §1.3 User-level operations MISSING from the founder's floor (findings)

1. **Preview-impact before commit** ("if I delete this wall, what breaks?") — distinct from #3,
   which is post-hoc. The machinery was authored (`SpeculativeEngine`) and is dead code
   (EXECUTED-CITED: EV-04 §5b). No contract names pre-commit impact preview. → **C-03**, PRODUCT half.
2. **Per-element history** ("who changed this, when, in what order") — L7 of the ladder names
   "per-element history"; `project_command_log` exists server-side (capability model §10) with no
   query surface. No C70–C75 section specifies the query. → **C-04**.
3. **Split a wall** — `wall.cut` exists and is opening-aware; a `wall.split` id does not (GE-10).
4. **Merge/union footprints** — not expressible; no 2-D boolean anywhere (GE-05, MISSING ALGORITHM).
5. **Run a clash check** — 12 registered ids, no handler, no detector (GE-06); today they silently
   no-op, violating L-INV-1.
6. **Validate the whole building on demand** — compliance registry is advisory/debounced;
   violations are log lines, not queryable state (CO-10); there is no "validate now, list all
   violations" verb. C70 G-INV-3 implies it; no contract specifies the user operation. → **C-21**.
7. **Select-by-dependency** ("select everything that sits on this slab") — requires the `sitsOn`
   reader that does not exist (GR-05 contested, see §5 chain 3).
8. **Resolve a conflict** — the K-INV-2 conflict artefact has no UI operation, no gate, no schema
   (CB-04).
9. **Choose typology constrained by zoning** — currently a silent 'apartment' default (recorded
   interim); no contract in C70–C75 touches it (OUT-OF-SCOPE for this suite, but the product
   promise implies it). → §5 chain 6.
10. **"What is now invalid?"** after any change — constraint re-check is not wired to mutation for
    most families (§3 Q9 column), so the question has no truthful answer surface. → **C-21**.

---

## §2 — The capability matrix

Fifteen columns: capability · user exercise · then the 11 Golden Chain links (intent, command,
state, geometry, topology, graph, propagation, persistence, undo/redo, collaboration, report) ·
constraints-rechecked · provenance. Cell values: ✓ (evidence cited) · ✗ (measured absent) ·
**U** (UNPROVEN) · **P** (PARTIAL) · **n/a**. **Collaboration is U on every row by construction**
(CB-01) and is omitted per-row; **provenance is ✗ on every element row** (PV-02) and is shown only
where it deviates. The discipline applied: never "the feature exists" — always *what happens when
something else depends on it*.

| Capability (verb-level) | Intent | Cmd | State | Geom | Topo | Graph | Propagation | Persist | Undo | Report | Constraints re-checked | Notes / evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| wall.create | ✓ | ✓ | **P** | ✓ | **✗** | ✗ | ✓ (joins) | ✓ | ✓ | P | ✓ len | writes ZERO graph edges (EXECUTED-CITED EV-04 §2); bus verb was readback-negative (MT-01) — state link contested |
| wall.updateBaseline (move) | ✓ | ✓ | ✓ | ✓ | **P** | ✗ | **P** | ✓ | ✓ | ✓ toast | P | openings translate (EXECUTED-CITED EV-03 §1); no graph edge rewrite on move; schedules stranded (PR-12) |
| wall shorten / height | ✓ | ✓ | ✓ | ✓ | U | ✗ | **contested** | ✓ | ✓ | U | **contested** | EV-03 R-1/R-2 EXECUTED-proved openings left outside the wall; capability model §7 says CLOSED via `planOpeningRefit` (`dcf646a0`) one day later — **the two artefacts disagree; neither may be carried forward** → **C-17** |
| wall.delete (element.delete) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **P** | ✓ | ✓ | P | n/a | edge purge closed same-day (EV-05 row 1); `boundingWallIds` dangle on suppressed levels (EV-03 §4.3.2); DependencyResolver delete→`[]` |
| wall.cut | ✓ | ✓ | ✓ | ✓ | U | ✗ | U | U | U | ✓ refuses naming opening ids | ✓ | opening-aware (gap register GE-10, re-verified at HEAD there); `wall.split` id MISSING |
| door/window create (opening) | ✓ | ✓ | ✓ | ✓ | ✓ hosts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ canPlace | the reference-shape chain (EV-05 row 1) — the strongest row in the product |
| door.setOffset (move) | ✓ | ✓ | ✓ | ✓ | U (edges not re-checked) | ✗ | ✓ (fast path fed since C72 §3.3 fix) | ✓ | ✓ | P | ✓ canPlace; **no swing check** (EV-03 R-9) | room graph invalidated (EV-03 §3.1 H6) |
| stair.create | ✓ | ✓ | ✓ | ✓ | ✓ sitsOn+connectedByStair+carve | **P** (edges write-only) | ✓ | ✓ | ✓ | P | ✓ riser/going both-numbers | BY-READ: CreateStairCommand:375–412, carve at :472 |
| stair.move | ✓ | ✓ (dual-store bridge) | **P** | ✓ | **✗** | ✗ | **P** (railing follows; slab opening does NOT) | ✓ | ✓ | P | **✗** | → §4 Story A; **C-02** slab-opening stranding, BY-READ |
| stair.updateParameters | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | P | ✓ | ✓ | ✓ refuses both-numbers | ✓ riser bounds only; **no headroom/slab recheck** | BY-READ UpdateStairParametersCommand.ts:71–86 |
| stair.delete | ✓ | ✓ | ✓ | ✓ | ✓ heals hole (L-298) | U | P | ✓ | ✓ (tests exist) | P | n/a | `stairDeleteHealsHole.test.ts` BY-READ; semantic-edge purge site not located in DeleteStairCommand this session — U → **C-19** |
| room detect/re-detect | n/a | ✓ | ✓ | ✓ | ✓ boundedBy/adjacentTo | ✓ | **P** (suppressed on generated levels) | ✓ | P | ✗ silent | n/a | identity survives only by 2.0 m centroid (GR-13) |
| room.setType / program edit | ✓ | ✓ | ✓ | n/a | ✗ | ✗ | **✗** — only room-store subscribers are parameter-propagation and naming (EXECUTED grep this session) | ✓ | U | ✗ | **✗** program rules not re-run | → **C-08** |
| slab.create | ✓ | ✓ | ✓ | ✓ | ✓ sitsOn + stair-carve direction B | P | ✓ | ✓ | ✓ | P | n/a | BY-READ CreateSlabCommand:188 |
| level elevation change | ✓ | ✓ | ✓ | **P** | U | ✗ | **✗ for 7 of 13 named types** | P (baseLine.y absolute → stale DTO, MT-07) | U | ✗ | ✗ | EXECUTED-CITED C72 §5.1 (PR-07) |
| roof footprint change | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | **✗ both directions** | ✓ | ✓ | ✗ | ✗ | EXECUTED-CITED EV-03 §6, MEASURED-ABSENT |
| generation (apartment/house) | ✓ | ✓ batch | ✓ | ✓ | ✓ at create | P | **✗ afterwards** (PR-05 permanent suppression) | ✓ | ✓ one-undo (design) | P | ✓ engine gates | provenance ✗ — output indistinguishable from authored (**C-13**) |
| graph query (any) | ✓ chat asks | **✗ no verb** | n/a | n/a | n/a | ✗ | n/a | n/a | n/a | ✗ `[]`-conflation | n/a | GR-14/16 |
| save/reload | ✓ | ✓ | ✓ ids/GUIDs | U (no headless meshes) | **P** (5/25 rebuilt; persist-or-lose unledgered) | P | P (pause without finally, PR-06) | — | n/a | P | n/a | EXECUTED-CITED cert results |
| undo/redo | ✓ | ✓ | ✓ | ✓ | P | U | P | ✓ | — | P | n/a | counters fixed (`8552de14`); unified path uncertified (CE-04) |
| IFC export/import | ✓ | ✓ | ✓ | ✓ | P (`contains` import-only) | P | n/a | ✓ GUID | U | P | n/a | provenance mapping MISSING (PV-04) |
| NL chat mutation | ✓ | ✓ same bus | ✓ | ✓ | inherits row above | inherits | inherits | ✓ | ✓ | ✓ refusals verbatim (capability model §15) | inherits | INFERRED stamping impossible until PV-02 closes |

**Matrix reading**: only one row (hosted-opening create) approaches a complete chain. The dominant
break is columns **topology-on-mutation / graph / propagation / constraints-rechecked** — the
*coordination* columns — exactly where the product promise lives.

---

## §3 — CHANGE-IMPACT discovery

The fifteen questions, applied per mutation. Condensed here to the answers that are *missing or
wrong*; §17 carries the full grid. Question key: Q1 authoritative state moved? Q2 geometry? Q3
topology records updated? Q4 graph query sees it? Q5 dependents invalidated? Q6 engines re-run?
Q7 regenerable? Q8 authored-not-rewritten? Q9 constraints rechecked? Q10 provenance? Q11
persistence? Q12 undo? Q13 collaboration? Q14 what is the user told? Q15 what query answers
"what changed and why"?

**Three answers fail for EVERY mutation, and each failure is one finding, not fourteen:**

- **Q8 (authored-MUST-NOT-be-rewritten): unanswerable for all triggers.** No element carries an
  origin field (PV-02, EXECUTED-CITED: 0 hits for `originDetail`/`derivationStatus`/`detectionMethod`
  in `packages/schemas`), so no mutation path *can* check whether it is overwriting authored state.
  The one concrete casualty measured: room re-detect destroys the room (name, program, finishes,
  edges) when the centroid drifts past 2.0 m (GR-13) — authored state rewritten by a derived pass,
  invisibly. → **C-13**.
- **Q10 (provenance): ✗ for all triggers** — same root; plus the only provenance-bearing family is
  invented on load (PV-01) and stamped false by repair (PV-03).
- **Q15 (what query answers "what changed and why"): MISSING for all triggers.** No graph verbs
  (GR-16), no impact query, no per-element history surface, `prevState` reaches 6 of 23 subscribers
  and no query layer (EV-03 §7). → **C-18** (= C-03 + C-04 at matrix grain).

**Q13 (collaboration) is UNPROVEN for all triggers by construction** (CB-01).

Per-mutation deltas beyond those four (evidence class in brackets):

| Mutation | Missing / defective answers beyond Q8/Q10/Q13/Q15 |
|---|---|
| **wall moved** | Q3: no edge rewrite on move — mutation-update-on-move UNPROVEN for every family (GR-12); Q5: schedules stranded [EXECUTED-CITED EV-03 §1.3]; Q6: redetect suppressed on generated levels [EXECUTED-CITED PR-05]; Q9: no re-validation of anything but length ≥0.1 m |
| **wall resized (shorter/lower)** | Q9: opening re-clamp **contested** — EV-03 R-1/R-2 EXECUTED-proved absent 2026-08-11; capability model records CLOSED via `planOpeningRefit` 2026-08-12 → re-measure required (**C-17**, EVIDENCE) |
| **wall deleted** | Q5: `DependencyResolver` delete→`[]` by design (PR-04); Q3: `boundingWallIds` dangle permanently on suppressed levels [EXECUTED-CITED EV-03 §4.3] |
| **wall split** | no verb (GE-10) — every question n/a until it exists; `wall.cut` answers Q1–Q4, Q14 well [gap-register re-verification] |
| **opening/door/window moved** | Q9: no swing-clearance model (EV-03 R-9); Q3: `hosts` edge assumed stable, never re-verified on move (GR-12) |
| **stair moved** | Q2: **slab opening stays at old footprint** (**C-02**, BY-READ); Q3: `connectedByStair`/`sitsOn` never updated [BY-READ: MoveStairCommand writes no edges]; Q6: rooms never re-detect (no stair subscriber in room-topology — EXECUTED grep: sole stairStore subscriber estate-wide is `StairSnapProvider.ts:60`, **C-20**); Q9: no headroom/landing re-validation |
| **stair height/run changed** | Q9: riser/going bounds re-checked with both numbers ✓ [BY-READ :71–86]; headroom, landing, slab-opening fit NOT re-checked; Q3: no edge updates |
| **stair deleted** | Q3: hole healed (L-298) ✓; semantic-edge purge site UNPROVEN this session (**C-19**) |
| **slab boundary/elevation** | Q5: slab→wall `supports` never written (EV-04 §2), so nothing that "sits on" the slab can be found to invalidate; stair-opening reconcile runs only on slab *create*, not boundary edit [BY-READ: callers list] |
| **room boundary/type** | boundary: full-level re-detect + identity fragile (GR-13); type: **no propagation at all** — only room subscribers are parameter propagation and auto-naming [EXECUTED grep] (**C-08**) |
| **level elevation** | Q5: 7 of 13 declared types stranded (PR-07); Q1/Q11: wall `baseLine[*].y` is absolute world-Y so the persisted DTO goes stale (MT-07) |
| **roof changed** | Q5/Q6: MEASURED-ABSENT in both directions [EXECUTED-CITED EV-03 §6]; the flat-roof/slab clash is structurally unpreventable (no subscriber could see it) |
| **site/parcel/zoning/envelope changed** | outside C70–C75 entirely; no trigger connects a zoning/envelope change to a loaded model's constraints — see §5 chain 6 (**C-09**) |
| **climate context changed** | same — pull-time analyses (solar C21); no invalidation trigger; UNPROVEN whether stale results are marked stale (**C-09**) |
| **constraint changed** | no model-space constraint store exists (CO-09); `annotationConstraints` is the only persisted family; a "constraint changed" trigger has no subject for 15 of 16 domains |
| **provenance-changing regeneration** | REGENERATED vocabulary defined (C75 §1.1), zero writers; the transition is unimplementable until PV-02 lands (**C-13**) |
| **undo** | Q3: wall-family verbatim edge restore ✓ (C71 §5.6); undo-of-an-edit reversing edges UNPROVEN (EV-03 §10.3); Q12 unified path uncertified (CE-04) |
| **redo** | identity/counters hold [EXECUTED-CITED: `8552de14`, cert 0 CLEAN]; graph-edge redo UNPROVEN |
| **collaborative merge** | everything UNPROVEN by construction; conflict artefact has no schema, no gate (CB-04) |
| **reload** | Q3: 5/25 rebuilt; `sitsOn`/`supports`/`connectedTo`/stair/lift edges silently lost from pre-graph snapshots with no report (GR-06, violates I-INV-3); Q5: pause-without-finally can deafen the session (PR-06) |

---

## §4 — STORY A: the stair change, twenty steps

The founder's 20-step enumeration is **not in the repo verbatim** — STR-05's filing note says the
derived documents carry the enumerations, and none of the nine BIM30 documents enumerates a
20-step stair story (**C-05, AMBIGUOUS/CONTRACT**). The reconstruction below follows the Golden
Chain plus the founder's three-questions-and-an-explanation emphasis; the coordinator should
reconcile numbering against the directive transcript.

Scenario: a two-level building; the user (or AI) moves the stair 1.5 m and raises its total rise
to meet a changed L1 elevation.

| # | Step | Verdict | Evidence |
|---|---|---|---|
| 1 | Intent resolves to a typed command (NL or gizmo) | **PASS** | BY-READ: `stair.move` bus id, `MOVE_COMMAND_BY_TYPE.stair`, RAC intent path (capability model §15) |
| 2 | `canExecute` validates and refuses honestly | **PARTIAL** | BY-READ: MoveStairCommand.ts:65–74 checks finite delta + existence only. Riser bounds refuse with both numbers on the parameters path (UpdateStairParametersCommand.ts:71–86) — but a *move* is validated against nothing spatial. Note the handler itself was dead until §FIX-STAIR-MOVE-DETACHED-STORE (plugins/stair/src/handlers/MoveStair.ts header): the plugin's detached-DTO handler shadowed the real bridge and every stair move was rejected — the L-220 one-bus-type-two-stores disease, now bridged dual-store |
| 3 | Authoritative state moves (startPosition, flight anchors, landing centres) | **PASS (BY-READ)** | MoveStairCommand.ts:87–99; store is the geometry `StairStore` the builders/persistence read |
| 4 | Stair geometry rebuilds deterministically | **PASS (BY-READ)** | `bim-stair-updated` → `StairMeshBuilder.updateStair` (MoveStair.ts header) |
| 5 | Hosted handrail follows | **PASS (BY-READ)** | `StairRailingBuilder` re-samples the rail path on `bim-stair-updated` (`StairRailingBuilder.ts:114–129` per handler header) — the C15 derived-from-host model |
| 6 | The slab opening above follows the stair | **MISSING** | **C-02.** The carve is create-time only: callers of `carveStairOpening` are `CreateStairCommand:472`, `CreateSlabCommand:188` (direction B), Import [EXECUTED grep]. `MoveStairCommand` and `UpdateStairParametersCommand` never re-carve; the idempotency guard (`StairSlabOpeningReconciler.ts:115–118`, skip `already-present`) keys on `opening-stair-<id>`, so after a move the void stays at the OLD footprint — a hole where no stair is, a solid slab over the stair's new head. The reconciler's own invariant ("exactly ONE opening whose profile is that stair's plan footprint") is violated by the move path and no gate can see it |
| 7 | Wall/room fabric around the stair reacts | **MISSING** | **C-20.** EXECUTED grep: the only `stairStore.subscribe` in the estate is `StairSnapProvider.ts:60`. `RoomTopologyObserver` subscribes wall/line/slab/column/curtain-wall — not stair. Rooms, plates and corridors never learn the stair moved |
| 8 | Topology records update (`sitsOn` base level, `connectedByStair` floor↔floor) | **MISSING** | BY-READ: edges are written at create only (CreateStairCommand:375–412); no stair command updates or re-emits them; mutation-update-on-move UNPROVEN for every family (GR-12) |
| 9 | Graph queries see the change | **MISSING** | no `graph.*` verbs (GR-16); and `connectedByStair` has **no reader anywhere** (EXECUTED-CITED EV-05 row 10 — WRITE-ONLY), so even a direct read has no consumer to be wrong |
| 10 | Dependents invalidated with `prevState` in hand | **PARTIAL** | StairStore is not among the 5 `prevState` emitters (EXECUTED-CITED EV-03 §7.1 — stair listener is 2-arg); railing/snap rebuild wholesale; nothing diff-based is possible |
| 11 | Constraints rechecked at the new position (headroom under the stranded slab, landing clearances) | **MISSING** | `StairValidationAuthority` runs via `ValidateStairCommand` and create-path; no re-validation on move [BY-READ]; and the authority exists in two copies, production importing geometry-stair's while constraint-solver's has zero importers (CO-07) — whichever the tests bind, drift is green |
| 12 | Height change re-plans risers honestly | **PARTIAL** | riser/going bounds refuse with both numbers ✓; total-rise vs level-elevation consistency and slab-opening length re-fit not re-checked [BY-READ] |
| 13 | Provenance updated (COMPUTED rebuild vs AUTHORED move) | **MISSING** | PV-02: stairs carry no origin field at all |
| 14 | **User asks: "what did this change?"** | **MISSING** | **C-03/C-18.** No impact surface exists. The one authored answer path (`SpeculativeEngine.getAffectedByDeletion`) returns `[]` unconditionally via a guard on a method that has never existed [EXECUTED-CITED EV-04 §5b] — the question is answered with the signature failure-as-emptiness defect |
| 15 | **User asks: "what is now invalid?"** | **MISSING** | **C-21.** Violations are log lines, not queryable state (CO-10); the compliance registry is advisory-debounced and its rule set is unenumerated by any gate (CO-12). Nothing re-ran at step 11, so there is also nothing true to report |
| 16 | **User asks: "why is the slab open there?"** | **MISSING** | no per-element history/derivation query; the opening's `parentId` points at the slab, not the stair that caused it; `decidedBy` is write-only (EV-05 row 13); provenance graph (`ProvenanceEdge.ts`) exists in schemas for AI artefacts, unused for elements |
| 17 | Undo returns the whole change as one gesture | **PARTIAL** | stair snapshot restore ✓ (BY-READ :109–117); but step 6's stranded opening means there is no coupled mutation to undo — the *defect* is what undo faithfully preserves; graph-edge reversal UNPROVEN (EV-03 §10.3); unified undo path uncertified (CE-04) |
| 18 | Save → reload preserves the changed stair with identity | **PASS (EXECUTED-CITED)** for id/GUID (cert 0 CLEAN); **PARTIAL** overall: `connectedByStair` is persist-or-lose — a pre-graph snapshot loses it silently (GR-06), violating I-INV-3 |
| 19 | Concurrent edit converges, conflicts explicit | **UNPROVEN** by construction (CB-01/CB-04) |
| 20 | **The explanation**: the system states what happened, what it refused, and why | **MISSING** | the report link exists per-command (`CommandResult.info`, toasts) but there is no post-mutation explanation object, no query, and no contract defines what the explanation must contain — C70's "explanation" golden operation is currently satisfied by *refusal* explanations only (**C-04, AMBIGUOUS**) |

**Score: 3 PASS (all BY-READ or cited) · 5 PARTIAL · 9 MISSING · 2 UNPROVEN · 1 AMBIGUOUS.**
The founder's suspicion is confirmed and localised: steps 14–16 and 20 are not thin — they are
**absent as a class**, and the absence has a single root: no impact/explanation query surface
exists anywhere above the stores (C-03/C-04/C-18/C-21). One working downstream update (the
handrail, step 5) must not be allowed to stand in for the cascade: of the four physical dependents
of a stair (railing, slab void, rooms/plate, floor-connectivity edges), **exactly one follows**.

---

## §5 — The ten chains

Each chain traced link-by-link; each ends with the required question: **specified by C70–C75, or
only implied by the product definition?**

### 5.1 HOSTING (wall ↔ door/window/opening)
Create: intent→…→report near-complete — the product's reference chain (EV-05 row 1 HEALTHY,
EXECUTED-CITED). Host-mutation re-validation: **contested** — EV-03 R-1/R-2 EXECUTED-proved the
shrink hole on 2026-08-11; capability model §7 and C73 §4.2 record `planOpeningRefit` shipped
(`dcf646a0`) by 2026-08-12 (**C-17**: re-measure, carry neither claim). Opening move re-checks
occupancy ✓, swing clearance ✗ (R-9). Hosting edge under collaboration: proven code-side only.
**Specified? YES** — the best-specified chain: C70 F-INV-3, C71 §2.1 row 1, C72 §3, C73 §4.2.

### 5.2 SPATIAL (rooms, adjacency, containment)
Detection ✓ (G4/G5); identity fragile at 2.0 m centroid (GR-13, C-INV-3 violated); `contains` has
no first-party writer so containment queries conflate "empty" with "never written" (GR-01);
furniture never re-parented (EV-03 §5.3); generated levels frozen (PR-05); move-time edge
invalidation UNPROVEN for every family (GR-12). **Specified? MOSTLY** — C71 owns the families and
names GR-12 as its own first gap; room *identity* is specified only as one invariant line
(C-INV-3) with no gate arm that measures the centroid mechanism.

### 5.3 VERTICAL (levels, stairs, lifts, floor-to-floor)
Level elevation reconcile covers walls+slabs; **7 of 13 named types stranded** (PR-07,
EXECUTED-CITED). Stair chain: §4 — one of four dependents follows. `connectedByStair` /
`connectedByLift` are WRITE-ONLY, un-rebuilt, persist-or-lose (EV-05 rows 10–11).
**Specified? NO — and this is a contract hole, not just an implementation one (C-01):**
`connectedByStair`, `connectedByLift`, `measuredAt`, `decidedBy` are **neither in C71 §2.1's
REQUIRED nine nor in §2.2's PARKED twelve**. The C71 vocabulary does not partition the 25 declared
types: four families with production writers (one broken, three unread) sit outside both lists,
so the coverage ratchet cannot count them, `check-graph-write-coverage` arm (b) ("no family has a
writer without a reader — writer-first exits 3") would trip on them the day it is built — or worse,
ignore them as unclassified. Vertical circulation — the spine of a multi-storey product — has no
owning row in the graph contract.

### 5.4 STRUCTURAL (support, load path)
`supports` beam-only; slab→wall declared-never-written (EV-04 §2); no clash engine behind 12 dead
ids (GE-06); columns/beams stranded on level re-elevation (PR-07); `RECONCILABLE_TYPES` exported
with zero consumers (C72 §5.2). **Specified? PARTIALLY** — C71 row 6 names the family; nothing in
C70–C75 specifies what structural *reasoning* must answer (load path, bearing, what-supports-what
transitively). Implied by pillar J only.

### 5.5 GENERATIVE (brief → building; regenerate; preserve authored)
Engines deterministic, AI-clean, EXECUTED-CITED (capability model §12 — most-finished domain).
The chain breaks *after* generation: permanent redetect suppression (PR-05); no provenance on
output (PV-02) so generated≡authored to every downstream pass (**C-13**); regeneration that
overwrites authored state cannot record REGENERATED-with-prior because nothing implements C75
§2.7; the end-of-generation sweep is a no-op by construction (EV-03 §8.4). **Specified? PARTIALLY**
— C75 specifies the vocabulary precisely; **no contract specifies the regenerate-derived /
preserve-authored *operation*** (which passes may rewrite what, at which provenance). That is a
CONTRACT gap distinct from the schema gap (**C-22**).

### 5.6 PLANNING (site, parcel, zoning, buildable envelope → model constraints)
Envelope/zoning machinery is rich (C58/C63/C64, refusal unions — the honesty idioms C74/C75 copy).
But the *chain into the model* does not exist: no trigger connects a zoning-rule or envelope
change to a loaded project's constraints; envelope is resolved at site-feasibility time and never
re-validated against the evolving building; no `violates`-style edge ties an element to an
envelope breach (CO-10 general form). **Specified? NO — only implied.** C70–C75 never mention
zoning, parcel or envelope; the founder's product promise ("raw site to coordinated building")
implies the chain end-to-end. → **C-09** (CONTRACT/PRODUCT).

### 5.7 ENVIRONMENTAL (climate, solar, context)
Solar/heat shipped (C21, EXECUTED-CITED memory + capability model §12); climate provenance schemas
exemplary (C75 §0 Finding 3). No invalidation: a model change does not mark prior solar results
stale; a climate-context change re-runs nothing; results carry no staleness marker analogous to
the `Room.area` cache finding. UNPROVEN whether any consumer distinguishes fresh from stale.
**Specified? NO — only implied** (pillar J's "outputs carry COMPUTED provenance" is the nearest
line). → folded into **C-09**.

### 5.8 EDIT/REGENERATION (the inner loop)
The best-evidenced chain in the corpus (EV-03 end-to-end). Working: openings translate on wall
move; join/rebuild coordination with prevState; delete cascade for hosted kinds. Broken/at-risk:
mutation-update-on-move UNPROVEN for every edge family (GR-12); suppression outlives its reason
(PR-05/06); bespoke trackers — the only working propagation — are **ungated** (PR-09); duplicated
stores mean any cascade wired to one is blind to the other (PR-13). **Specified? YES** — C72+C73
are the strongest pair in the suite, and they specify the *gaps* by name. Residual: C72 governs
the generic cascade and prevState but **no contract specifies which dependencies MUST exist**
(the dependency *catalogue* — wall→schedule, stair→slab-void, roof→wall — is nowhere normative;
each pair exists or not by history). → **C-23** (CONTRACT).

### 5.9 COLLABORATION
Code-side convergence proven locally (hosting edge, `d2730a0c`); transport absent by founder
decision (CB-01); conflict artefact unspecified anywhere — K-INV-2 names the requirement, no
contract defines the artefact's schema, lifecycle, or UI operation, and no gate exists even in
specification (CB-04). **Specified? PARTIALLY** — C70 pillar K states invariants; the *mechanics*
are delegated to C08 (outside this suite); the conflict artefact is specified by nobody (**C-24**).

### 5.10 INTERCHANGE (IFC/DXF/Revit round-trip with identity)
GUID join key holds through save/reload (EXECUTED-CITED, cert 0 CLEAN); IFC import is the sole
`contains` writer; `IfcRelSpaceBoundary` export exists. Not measured anywhere: an actual
export→import→re-export round-trip on the GUID key (B-INV-3 is asserted at the snapshot level,
not the IFC level — UNPROVEN); provenance export mapping MISSING (PV-04 — C75 calls it its own
largest risk); graph-edge export beyond space boundaries UNPROVEN. **Specified? PARTIALLY** —
B-INV-3 names the key; no contract specifies the round-trip *test* or the edge/provenance mapping
(**C-25**).

**Chain summary**: fully specified 2 (HOSTING, EDIT/REGEN) · mostly 1 (SPATIAL) · partially 4
(STRUCTURAL, GENERATIVE, COLLABORATION, INTERCHANGE) · not specified, implied only 3 (VERTICAL as
a graph subject, PLANNING, ENVIRONMENTAL).

---

## §17 — The cascade matrix

Fourteen triggers × thirteen columns. Column key — **1** authoritative state moves · **2** geometry
follows · **3** topology records updated · **4** graph query would see it · **5** dependents
invalidated · **6** engines re-run · **7** constraints rechecked · **8** provenance recorded ·
**9** persists · **10** undo restores all of it · **11** collaboration converges · **12** user told
truthfully · **13** query answers "what changed & why".
Values: **Y** (cited) · **N** (measured absent) · **P** partial · **U** UNPROVEN · **C** contested
evidence · **–** no subject exists. **Any N/U/– cell is a finding, not a blank** — the three
all-column findings (8→C-13, 11→CB-01, 13→C-18) apply to every row and are not repeated per cell.

| Trigger | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| wall moved | Y | Y | **N** (no edge rewrite; GR-12) | N (no verbs) | P (joins+openings Y; schedules N; graph N) | P (redetect; suppressed levels N) | **N** (length only) | N | Y | Y | U | P (toast on refusal) | N |
| wall resized | Y | Y | N | N | **C** (opening refit — C-17) | P | **C** | N | Y | Y | U | C | N |
| wall deleted | Y | Y | Y (purge closed; EV-05 r1) | N | P (delete cascade→`[]` PR-04; boundingWallIds dangle) | P | – | N | Y | Y | U | P | N |
| wall split | – (no verb, GE-10; `wall.cut`: Y) | Y | U | N | U | U | Y (cut refuses naming opening ids) | N | U | U | U | Y | N |
| door/window moved | Y | Y | U (hosts not re-verified) | N | Y (room graph invalidated; fast path fed) | Y | P (canPlace Y; swing N) | N | Y | Y | U | P | N |
| stair moved | Y | Y | **N** (edges create-only) | N | **P** (railing Y; slab void **N** C-02; rooms **N** C-20) | **N** | **N** | N | Y | P | U | P | N |
| stair height/run | Y | Y | N | N | P (void length not re-fit) | N | P (riser bounds Y-both-numbers; headroom N) | N | Y | Y | U | Y (refusal) | N |
| stair deleted | Y | Y | P (hole healed; edge purge U — C-19) | N | P | P | – | N | Y | Y (tests) | U | P | N |
| slab boundary/elevation | Y | Y | N (`supports` slab→wall never written) | N | **N** (nothing sits-on-queryable to invalidate) | P (room redetect via slab sub) | N | N | Y | Y | U | P | N |
| room boundary/type | Y | Y/– | P (boundary: full redetect, identity fragile GR-13; type: **N** C-08) | N | P/N | P/N | **N** (program rules not re-run) | N (worse: invented on load, PV-01) | Y | P | U | **N** (silent) | N |
| level elevation | Y | P | U | N | **N for 7 of 13 types** (PR-07) | P | N | N | P (absolute-Y DTO staleness MT-07) | U | U | N | N |
| roof changed | Y | Y | **N** | N | **N both directions** (EV-03 §6) | **N** | **N** (clash structurally unpreventable) | N | Y | Y | U | N | N |
| zoning/envelope/site changed | – (no model-side subject; C-09) | – | – | – | **N** | **N** | **N** | N | – | – | U | N | N |
| collaborative merge | U | U | U | U | U | U | U | U | U | U | **U by construction** | **N** (no conflict artefact, CB-04) | N |

Cross-checks the matrix demands (each already a named finding): column 3 is N/U on **every
mutation row** — this is GR-12 stated fourteen times, and it means C71 §1.2 semantic 5 is the
single highest-leverage unbuilt gate arm. Column 13 is N on all fourteen — C-18. Column 7 has
exactly two honest Y cells (opening placement, stair riser bounds) — constraint re-check on
mutation is effectively a two-cell capability in a fourteen-row product.

---

## §F — Findings ledger

| ID | Finding | What the product needs | What the contracts say (or don't) | Evidence class | Suggested gap class |
|---|---|---|---|---|---|
| **C-01** | **C71's vocabulary is not a partition.** `connectedByStair`, `connectedByLift`, `measuredAt`, `decidedBy` are neither REQUIRED (§2.1) nor PARKED (§2.2); three have production writers, two are persist-or-lose, one writer is broken | vertical-circulation and history edges owned by the ratchet | C71 §2 silently omits them; `check-graph-write-coverage` arms (a)/(b)/(d) cannot classify them | BY-READ (C71 §2 vs EV-05 rows 10–13) | CONTRACT |
| **C-02** | **Stair move/param-change strands its slab opening.** Carve is create/import/slab-create only; idempotency-by-id makes the move path a silent invariant breach (void at old footprint, solid slab over the new head) | F-INV-3-class host/hosted re-validation for the stair↔slab pair | C72 protects bespoke trackers but no contract names the stair→slab-void dependency as required | BY-READ (`StairSlabOpeningReconciler.ts:115–118`; `MoveStairCommand.ts`; EXECUTED grep of carve callers) — runtime UNPROVEN | IMPLEMENTATION |
| **C-03** | **"What is affected?" has no surface.** No `graph.*`/impact verbs; both authored answer paths return `[]` unconditionally | pre- and post-commit impact query | C70 D-INV-1 implies verbs; nothing specifies an *impact* operation | EXECUTED-CITED (EV-04 §5b, C72 §0) | PRODUCT + WIRING |
| **C-04** | **"What changed and why" has no owner.** No per-element history query; `project_command_log` unexposed; golden op "explanation" satisfied today by refusal text only | post-mutation explanation object + history query | C70 §6.2 names "explanation" without defining its content — untestable as written | BY-READ | CONTRACT + PRODUCT (**AMBIGUOUS**) |
| **C-05** | The founder's 20-step story and 15-question list exist nowhere in the repo verbatim; STR-05's filing note defers enumerations to derived docs that do not carry them | a canonical enumeration to test against | — | EXECUTED (grep of BIM30 corpus) | CONTRACT (EVIDENCE) |
| **C-06** | Stair constraints re-checked only on the parameters path; a move re-validates nothing spatial (headroom, landing, void fit) | constraint re-check on geometric mutation | C74 classifies constraint *kinds*; no contract requires re-check-on-mutation per family | BY-READ | IMPLEMENTATION + CONTRACT |
| **C-07** | `connectedByStair`/`connectedByLift` write-only, un-rebuilt, persist-or-lose — floor-connectivity is unqueryable and silently lost on pre-graph reload | the level-connectivity reader + rebuild | outside C71's lists (C-01) | EXECUTED-CITED (EV-05 rows 10–11, EV-04 §3) | WIRING |
| **C-08** | **Room type/program change propagates to nothing** — sole room-store subscribers are parameter propagation and auto-naming; program validators are generation-time only | type change re-runs program/adjacency validation | no contract treats room *semantics* (vs boundary) as a cascade trigger | EXECUTED (grep this session) + EV-03 §7.2 | IMPLEMENTATION + CONTRACT |
| **C-09** | **PLANNING and ENVIRONMENTAL chains are outside C70–C75 entirely** — no trigger from zoning/envelope/climate change into a loaded model; no staleness marking on analysis results | site-to-building coordination per the product promise | C70–C75 never mention zoning/envelope/climate; C58/C63/C64 stop at feasibility | BY-READ + UNPROVEN | CONTRACT + PRODUCT |
| **C-10** | Undo-reverses-graph-edges proven only for wall-family delete; UNPROVEN for edits and all other kinds | executed read-back per kind | C71 §6 `check-graph-delete-integrity` covers delete only | EXECUTED-CITED (EV-03 §10.3, C71 §5.6) | EVIDENCE |
| **C-11** | Level elevation strands 7 of 13 declared types; the 13-type whitelist has zero consumers | full-type reconcile or a truthful list | C72 §5 specifies it exactly | EXECUTED-CITED (PR-07) | WIRING |
| **C-12** | Collaboration column UNPROVEN by construction; conflict artefact unspecified and ungated | transport (founder) + artefact spec | C70 K-INV-2 states the rule; no schema/gate anywhere | EXECUTED-CITED (CB-01/04) | OUT-OF-SCOPE (founder) + CONTRACT |
| **C-13** | **Q8 "authored-must-not-be-rewritten" is unanswerable for every trigger** — zero element provenance (PV-02); GR-13 is the measured casualty; C75 §2.7 has zero implementations | provenance fields before any preserve-authored claim | C75 specifies the schema; nothing specifies the *operation-level* guarantee | EXECUTED-CITED | IMPLEMENTATION (schema) + CONTRACT (C-22) |
| **C-14** | No gate asserts a refusal reaches the user; report link is per-command toast at best | refusal-reachability arm | C73 §5.4(d) names it CANNOT-SEE; GE-09 | EXECUTED-CITED | EVIDENCE |
| **C-15** | Schedules/QTO have no geometry subscription — "regenerate-derived" silently stale | subscription or staleness marker | C72 §1.1 general form; PR-12 UNPROVEN at HEAD | EXECUTED-CITED (BY-READ origin) | WIRING + EVIDENCE |
| **C-16** | `wall.split` missing; `merge footprints` inexpressible; clash ids silently no-op | the named user operations | GE-10/GE-05/GE-06 carry them | EXECUTED-CITED | MISSING VERB / ALGORITHM |
| **C-17** | **Opening re-clamp evidence is contested across one day** — EV-03 EXECUTED-proved the hole (08-11); capability model/C73 record `planOpeningRefit` shipped (08-12). Same shape as GR-05's rule: carry neither claim, re-measure | one executed re-measure at HEAD | the corpus itself demands this (GR-05 precedent) | EXECUTED-CITED both sides | EVIDENCE |
| **C-18** | Q15 fails for all fourteen triggers — no query in the product answers "what changed and why" after any mutation | the impact/history/explanation surface (C-03+C-04 at matrix grain) | unspecified | derived | PRODUCT |
| **C-19** | Stair semantic-edge purge site not located in `DeleteStairCommand` this session; EV-05 grades MU-delete ✓ all kinds via the DeleteElementCommand path — the delegate split leaves the purge location UNPROVEN | one executed delete→edge read-back for stair | C71 §6 gate would decide it | UNPROVEN | EVIDENCE |
| **C-20** | Estate-wide, exactly ONE `stairStore` subscriber (snap provider). Stairs are propagation-invisible to rooms, slabs, schedules, graph | stair as a first-class cascade source | no contract names stair dependents | EXECUTED (grep) | WIRING + CONTRACT (C-23) |
| **C-21** | "What is now invalid?" unanswerable: violations are logs (CO-10), registry rules unenumerated (CO-12), no validate-now verb | queryable violation state + on-demand run | C70 G-INV-3 implies; no operation specified | EXECUTED-CITED | WIRING + PRODUCT |
| **C-22** | No contract specifies the regenerate/preserve-authored **operation** — which passes may rewrite which provenance classes | an operation-level rewrite policy (the enforcement of C75 §2.7) | C75 stops at the label | BY-READ | CONTRACT |
| **C-23** | **The dependency catalogue is nowhere normative.** C72 governs *how* propagation works, never *which* dependencies must exist (wall→schedule, stair→void, roof→wall). Every §17 N-cell in column 5 is legal under C70–C75 as written | a REQUIRED-dependencies table with the C71 six-semantics treatment | absent | BY-READ | CONTRACT — the largest contract gap this review found |
| **C-24** | Conflict artefact (K-INV-2) has no schema, lifecycle, or user operation defined in any contract | the artefact specification | C70 states the invariant only | BY-READ | CONTRACT |
| **C-25** | IFC round-trip on the GUID key is asserted at snapshot level, never executed at the IFC boundary; edge/provenance export mapping absent | an export→import→diff executed run | C70 B-INV-3 names the key; C75 §5 names the mapping absent | UNPROVEN / EXECUTED-CITED (PV-04) | EVIDENCE + MISSING PERSISTENCE |
| **C-26** | Only one row of the §2 matrix (hosted-opening create) approaches a full Golden Chain; the systematic break is the coordination columns (3/4/5/7) — consistent with the gap register's wiring-dominant distribution, and it means C70 §3.2's no-partial-credit rule currently scores essentially every capability "incomplete" | — (synthesis) | — | derived | — |

### The §17 bottom line for the governing question

**Are C70–C75 together complete enough to specify and test the change behaviour?** Not yet, in
three specific ways this empirical half can name: **(a)** the relationship vocabulary does not
partition its own union (C-01); **(b)** no contract enumerates the *required dependencies* whose
propagation the matrix tests — so thirteen of fourteen triggers can strand dependents without
violating any written invariant (C-23); **(c)** the three user questions and the explanation —
the product's face — are implied by one golden-operation word ("explanation") that no contract
defines well enough to test (C-04/C-18, AMBIGUOUS). Everything else found here is implementation,
wiring or evidence debt already owned, named, or nameable by the existing six contracts.
