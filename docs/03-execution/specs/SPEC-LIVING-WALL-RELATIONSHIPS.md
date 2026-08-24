# SPEC — The Living Wall: relationship propagation on move

> **Status**: EXECUTION PLAN, derived from a normative contract section. **Created**: 2026-08-24
> (lane GRAPH43). **Trigger**: founder, on moving a wall past two interior partitions —
> *"one interior partition adapted … but the other did not … we probably lost a room … **I was
> expecting the wall to extend** … we need a sound relationship graph and consciousness in all
> elements — and an architect human would have seen this — why not the algorithm?"* and, on the
> shape of the answer, *"this is not just a documentation exercise — is a documentation, **planned
> and implementation** … a living entity **without being a performance issue**."*
>
> **Governs**: `packages/geometry-wall/src/WallMoveReweld.ts`,
> `WallMoveReweldService.ts`, `packages/command-registry/src/walls/CascadeWallBaselineCommand.ts`,
> and the `joinedTo` writer in `WallRebuildCoordinator`.
>
> ⛔ **THE AUTHORITY IS [C85 §10.8](../../02-decisions/contracts/C85-ELEMENT-WALL.md) — "THE LIVING
> WALL".** W-L-1..W-L-8 and the undecided question live there and are **not restated here**. This
> file is the ordered execution plan for them: files, tests, costs, sequence and gates. When the two
> disagree, the contract wins (CLAUDE.md conflict order), and this file is the one that is wrong.
>
> **Contract alignment**: [C85 §10.8](../../02-decisions/contracts/C85-ELEMENT-WALL.md) (normative
> source) · [C85 §10.7](../../02-decisions/contracts/C85-ELEMENT-WALL.md) W-M-4 / W-M-12 / W-M-13 ·
> [C72 §9](../../02-decisions/contracts/C72-PROPAGATION-AND-PREVSTATE.md) (ADAPT or REFUSE, never
> SILENT) · [C71 §3](../../02-decisions/contracts/C71-GRAPH-AND-TOPOLOGY.md) (`joinedTo`) ·
> [C78 §6](../../02-decisions/contracts/C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) (dependency
> freshness) · [C83](../../02-decisions/contracts/C83-SPATIAL-VALIDITY-AND-DESIGN-LOGIC.md) ·
> [C10](../../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md) (the cost budget) ·
> C81 (one undo) · C73 §2.2 (declare the constant at its definition site).
>
> ⚠ **NOT `SPEC-WALL-MOVEMENT-STUDY.md`.** That file governs the *interaction* — endpoint handles,
> gizmos, drag isolation. This one governs what happens to the wall's **relationships** once a move
> is committed. They do not overlap and neither supersedes the other.

---

## §0 — Why this is a SPEC and not more contract

The founder asked for *"a documentation — planned and implementation"*. Those are two documents with
**two different rot rates**, and this repo has a standing defect family about mixing them:

- **C85 §10.8 states what must be TRUE.** It is durable, it is cited from source files, and it is
  ranked above ADRs and SPECs in the conflict order. Normative clauses and their costs belong there.
- **This file states what to DO, in what order, with which files and which tests.** Every one of
  those facts is a snapshot: file paths move, line numbers rot, effort estimates are wrong within a
  week. Putting them in C85 would guarantee a stale contract, which is the exact failure CLAUDE.md
  documents five times over for its own counts.

**The migration path in C85 §10.8.6 is the durable half (seven ordered steps and the reason for the
order). §2 below is its executable half.** If a step is dropped, C85 §10.8.6 is edited too — the
row and the plan move together.

---

## §1 — What is already done, and what is waiting on this lane

| | Landed | Where |
|---|---|---|
| ✅ **S1** | The conflated verdict is SPLIT. `SUBJECT_GUEST_JOIN_INTACT` / `..._BROKEN_BY_MOVE` / `..._RESTORED_BY_MOVE`, with `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE` narrowed to the one reading that may honestly mean *stale record*. **NO DECISION CHANGED** — same `continue`, new label and new number | `5c3434dc` · `WallMoveReweld.ts`, `WallMoveReweldService.ts`, `GRAPH43GuestSideTee.measure.test.ts` (9 assertions) |
| ✅ **S2** | C85 §10.8 — the TO BE, with a declared cost per capability; W-M-13; the R-16 correction box | `bd45650d` |
| ⏳ **Waiting on this lane** | `OpenedRegionDetector.ts:662–690` (lane ROOM44 / C94) already **stands the CREATE rung down** when a collinear donor exists, emits `reason: 'gap-closable-by-extending-an-existing-wall'`, **names the wall that should have grown**, and defers the extension itself to *"C85 §10.7 W-M-12"* — this contract, by name, in code. **Nothing performs the extension.** That is W3/W5 below | `packages/room-topology/src/OpenedRegionDetector.ts` |

⭐ **The founder's *"I was expecting an EXTENSION, however I got a NEW WALL"* is now blocked on
exactly one thing: nobody performs rung 1.** The detection, the stand-down and the donor naming all
exist and are correct.

---

## §2 — The work items, ordered

> Ordering rule, stated once: **instrument → honesty → substrate → policy → behaviour.** Nothing that
> moves a wall ships before the thing that can tell us whether it moved the right one.

### W1 — ✅ DONE. Split the verdict (`5c3434dc`)

Kept in the table because the order only makes sense with it at the top.

---

### W2 — ✅ DONE (`1bf3a790`). Publish the loss: dual counts on the verdict lines, and route a broken join to the user sink

**Gate:** none. **Contract:** C85 §10.8.3 W-L-3. **Risk:** minimal — no geometry.

| | |
|---|---|
| **Changes** | `WallMoveReweldService.ts` — the `§MOVE-REWELD-DISPATCH` line gains a second count; a non-zero broken-join count is routed to the sink `describeReweldRefusal` already drives |
| **Why it is separate from W1** | W1 makes the fact exist. W2 makes a human see it. Today `summariseNotApplicable` is console-only **and says so at its own definition** — a destroyed relationship is currently routed as a diagnostic |
| **The defect it closes** | `0 junction(s) refused` printed on the same gesture the AI told the user *"creates 1 problem(s) … that were not there before"*. `refusals` and `topology findings` are different sets; **no line carries both**, so a reader given only the first concludes the gesture was clean (C85 §10.8.2 AS-IS #17, #18) |
| **⚠ What it must NOT do** | It must **not** promote the broken join to a `refusal`. The engine has no arm that can act on a guest-side T; calling it a refusal claims a decision that was never taken. It must also **not** put a not-applicable census in front of the user — that buries the refusals that matter (§L-921 inverted). **Only the non-zero broken count is user-facing** |
| **Test — must fail on HEAD** | Assert the dispatch summary for the §THE-BREAK fixture contains **both** integers, and that the broken-join count reaches the consequence sink. Assert a gesture with only `INTACT` partners routes **nothing** to the user |
| **Cost** | Zero geometry. One integer already computed, one string, one routing decision |
| ⭐ **WHAT SHIPPING IT TAUGHT** | The first attempt patched `§MOVE-REWELD-DISPATCH` only, and the test went red because **that line never fires for this gesture**: an empty plan is the NORMAL outcome when every declared partner is guest-side, so the founder's case ends on `§MOVE-REWELD-EMPTY-PLAN`. ⛔ That branch closed with *"Every junction this move touched was left exactly as it was"* — true of the partners' geometry, **false of the relationships**. Both lines now carry the count and the false sentence is emitted only where it is true (C85 §10.8.2 AS-IS #19) |
| **⭐ ADOPTED FROM C94** | This item **IS lane ROOM44 / C94's P2.6**, routed here rather than done across the boundary. ROOM44 identified the per-gesture verdict emitter as `WallMoveReweldService.ts` — the `§MOVE-REWELD-DISPATCH` assembly and its `accounted !== partners.length` control — and correctly declined to edit a `geometry-wall` file. **CONFIRMED: it is the right site, it is this lane's, and W2 is where it lands.** The room layer needs it because a `§OPENED-REGION` finding and a `0 junction(s) refused` verdict currently describe the same gesture and cannot be reconciled by any reader |

---

### W3 — Fix the `joinedTo` staleness SOURCE

**Gate:** ⭐ **already founder-approved** — the SOURCE only. **Contract:** C71 §3.4, C85 §10.8.4.
**Risk:** medium — it changes when the graph is rewritten.

| | |
|---|---|
| **The rule it enforces** | C71 §3.4: *"Stale-edge removal is part of the writer, not a follow-up … idempotency prevents duplicates, never staleness."* |
| **Measured defect** (earlier lane) | `WallRebuildCoordinator.writeJoinedToEdgesForLevel` sits **after a no-progress guard's `return`**, so a gated-out flush never rewrites the graph. A level that is judged "no progress" keeps whatever edges it had |
| ⭐⭐ **RE-MEASURED 2026-08-24 BY THIS LANE — the mechanism is CONFIRMED and the FRAMING NEEDS SHARPENING** | ✅ **CONFIRMED by direct reading**: `§FIX-WALLFLUSH-NOPROGRESS-GUARD` returns at `WallRebuildCoordinator.ts:~1677`; the `joinedTo` writer is called at `:~1958` — **after it**. ⚠ **But the `return` ALONE is not yet a defect.** The guard fires only when the level's wall signature is **byte-identical to the last completed flush**, and if no wall moved then no junction moved either, so skipping the re-emit is *arguably correct*. ⭐ **THE ACTUAL RISK IS ONE LAYER DOWN: `_levelWallSig` (`:1495`) is a HAND-MAINTAINED FOLD, and it has already missed a rebuild-relevant input at least THREE times** — `§WALL-FINISH-RENDERS` (L-1670, a 59-wall paint edit left every signature identical and *"the ENTIRE flush returned at the top"*), `§WALL-RAKE-INVALIDATION` (ADR-0310), and `§WALL-JOIN-LOAD-DEFER` (L-1490, whose own comment states the rule: *"the gate must not judge a computation by a signal that cannot represent it"*). **A join-relevant change the signature does not capture produces a stale `joinedTo` edge, silently — that is the mechanism, not the `return` by itself.** ⚠ **And there is a SECOND early return**: the burst circuit-breaker at `:~1702` fires *while walls ARE changing*, so it skips the writer during genuine churn |
| ⭐ **WHAT THIS CHANGES ABOUT THE FIX** | Moving the writer above the guard is the obvious patch and is probably the **wrong** one — the guard exists to break a self-re-arming flush loop (L-97) and ADR-0129 records what resurrecting it costs. The better shape, on this evidence, is that **the `joinedTo` write should not be gated by a GEOMETRY signature at all**: it is graph maintenance, it is cheap, and it is idempotent by construction (remove-and-re-emit, C71 §3.4). ⚠ **NOT YET MEASURED**: whether any join-relevant input is actually missing from `_levelWallSig` today. **Measure that before writing the fix** — a third framing of this defect has now been offered and two of them were incomplete |
| **⭐ Why it is BEFORE the policy work** | Every disposition option in C85 §10.8.4 is being asked to compensate for this if it is real. **REPAIR on a stale edge drags a wall the user never touched — L-922's exact shape.** REFUSE on a stale edge is an unopenable door. Neither can be evaluated honestly while the writer can leave staleness behind |
| **⛔ BOUNDARY — founder-set, do not exceed** | This is the **source** only. It does **NOT** include amending the stored-degree rule (`isMutualCorner` letting a STORED `junctionDegree` override a live count). That needs a **C83 §10.6.3 amendment he has not granted**, and no lane may treat it as implied |
| **Test — must fail on HEAD** | A level whose rebuild is gated out by the no-progress guard, containing one wall that has STOPPED joining: assert the stale `joinedTo` edge is **removed**. Assert the edge count, not "no error" |
| **Cost** | One flush per gated-out level rebuild. Bounded by the same rebuild cadence, not per mousemove. ⚠ **MEASURE IT** — the guard exists for a reason (ADR-0129, the redetect no-progress loop), and moving the flush above the `return` must not resurrect that loop. **If it does, the fix is a separate flush call, not removing the guard.** |
| **⚠ Ownership** | `WallRebuildCoordinator` may be shared. **Confirm through main before editing.** |

---

### W4 — Write the REFUSE-BEFORE / REPORT-AFTER routing rule

**Gate:** ⚠ **founder ruling #2** (§3). **Contract:** C85 §10.8.3 W-L-6. **Risk:** low in code, high
in product feel.

| | |
|---|---|
| **Changes** | A single classification function over findings that already exist, keyed on C83's IMPOSSIBLE / INADVISABLE / FINE. No new findings, no new geometry |
| **What it fixes** | Today a user gets refuse-before or report-after depending on **which code path the gesture entered**. Both behaviours are correct and shipped; having both, unchosen, is not |
| **Blocked on** | Whether **losing a room** is IMPOSSIBLE or INADVISABLE. Geometry cannot tell a deliberate room merge from an accidental one; only intent can |
| **Test — must fail on HEAD** | For each of the three classes, assert the disposition **by name**. Assert the wall∩opening case still refuses before (a control: it works today and must not regress) |
| **Cost** | None. A routing rule over existing classifications |

---

### W5 — ⭐ Route a guest-side T into the existing stem path (the founder's headline complaint)

**Gate:** ⚠ **founder ruling #1** (§3). **Contract:** C85 §10.8.3 W-L-4, §10.7 W-M-12 / W-M-13.
**Risk:** ⛔ **highest in this plan — it moves a wall the user did not touch.**

| | |
|---|---|
| **⭐ The insight that makes it cheap** | **The EXTEND capability already exists and is correct.** `computeStemFollow` extends a partition to follow its host every day. It never runs for a guest-side T because the partner is binned as not-applicable **before `classifyWeldAuthorship` is reached**. The missing capability is an **ORDERING**, not a geometry primitive |
| **Changes** | One mirror-direction branch: a `SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE` partner is routed into the stem path with guest and host **swapped**, so the PARTNER extends to meet the moved wall |
| **⛔ Guards that MUST apply unchanged** | `MAX_FOLLOW_GAIN = 3` (§10.7 W-M-1 — without it a 2 m drag moved an untouched wall 14.14 m); `DEGENERATE_STUB_LENGTH`; the reversal test; and the §10.7 W-M-3 retraction if the subject cannot reach the same seat. **A half-closed corner is worse than an open one** |
| **⛔ And it must be a `STRUCTURAL_CASCADE` child** | C81 — one undo for the whole gesture. `CascadeWallBaselineCommand` already does this for existing entries and re-bases hosted openings through `planOpeningRebase`; the guest-side arm must reuse it and must not re-derive opening offsets |
| **Test — must fail on HEAD** | The §THE-BREAK fixture: assert the partner's baseline is **extended by 600 mm**, that the join measures **0 mm** after, and that the entry is emitted as a cascade child. Then the room-level test: **room count 5 → 5**, and the 85.7 m² room **survives** |
| **Cost** | One stem-follow solve per broken join. `O(broken joins)` — 0–2 in practice — once per **committed** move, inside `__wallDragInProgress`. No new traversal, no index |

---

### W6 — Raise the two-senses-of-REFUSE question to C72

**Gate:** platform. **Contract:** C85 §10.8.3 W-L-5. **Risk:** none (a document).

C72 §9.1's REFUSES describes **the dependent not adapting** while the host's move stands. The
shipped narration does something C72 §9 has no vocabulary for: it **refuses the subject's own
gesture on account of a dependent** — *"so I did neither. Nothing has changed."* ⛔ **Probable C72
amendment, not a C85 edit.** Sequenced last because W1–W5 are all legal under either reading.

---

### W7 — The finding ledger: make topology findings durable

**Gate:** needs persistence design. **Contract:** C85 §10.8.3 W-L-7, §10.7 W-M-10.

Findings must be **durable on the model or re-derived on load**, and the standing set must be either
a shrink-only obligation or an explicitly accepted debt list.
⛔ **DO NOT BUILD AN AUTOMATIC SWEEP.** A pass that repairs standing findings edits geometry the user
did not touch **in this gesture**, at N× the blast radius of L-922, without the one thing that makes
the re-weld defensible: a gesture to bound it by. **Cost of the ledger:** `O(findings)` per commit.
**Cost of a sweep:** unbounded and unattributable.

---

### W8 — The shared tolerance register (joint with lane ROOM44 / C94)

**Gate:** coordination only. **Contract:** C85 §10.8.5, C73.

#### ⭐ THE SEAM, ANSWERED — this lane's formal reply to lane ROOM44's claim

Measured independently here, not taken on report. **All three points CONFIRMED.**

| | ROOM44's claim | This lane's verdict |
|---|---|---|
| **(a)** | ROOM owns DETECTION of a lost loop and NARRATION of it; WALL owns REPAIR BY EXTENSION | ✅ **CONFIRMED.** `OpenedRegionDetector.ts:662–690` stands the CREATE rung down when a collinear donor exists, emits `reason: 'gap-closable-by-extending-an-existing-wall'`, names the donor, and defers the extension to *"C85 §10.7 W-M-12"* — **this contract, by name, in that file.** The wall side accepts the obligation; it is W5 |
| **(b)** | `§DIAG-PARTITION-REACH` correctly lives in room-topology and is **not** a rival to the weld | ✅ **CONFIRMED BY OWN MEASUREMENT.** `RoomDetectionEngine._reconnectDanglingEnds` operates on `walls.map(w => ({ wallUUID, start.clone(), end.clone() }))` feeding `buildWallGraph`, and writes **no `WallStore` record**. The weld mutates authored geometry. ⭐ **A READ-side graph repair may legitimately be MORE permissive (1.25 m) than a WRITE-side one (0.5 m), because it cannot corrupt the model.** The two numbers differ because the two acts differ — the arrangement is right by design |
| **(c)** | The real seam defect is that neither layer publishes its tolerance, so the combined competence envelope is unstatable | ✅ **CONFIRMED**, and it is this item |

> ⚠ **A framing this lane was briefed and now records as WRONG:** that `§DIAG-PARTITION-REACH` is
> *"a second subsystem quietly healing what the first one broke, with a different tolerance and no
> shared vocabulary"* — i.e. accidental architecture. **ROOM44's reading is better and is the one
> C85 §10.8.5 now carries.**
>
> ⭐ **On the wall-side numbers, which ROOM44 correctly left to this lane:** `MAX_FOLLOW_GAIN = 3` is
> **justified and measured** (§10.7 R-14 — without it a 2 m drag moved an untouched wall 14.14 m).
> `DEFAULT_SNAP_RADIUS = 0.5` is **NOT justified as a weld tolerance** — it is inherited from
> snapping, and nothing in C85 defends it as the right number for deciding whether two walls are
> joined. **That is a `NOT MEASURED`, not a proposal to change it**; changing a weld tolerance moves
> walls, and it would need the same ruling W5 needs.

Neither layer publishes its tolerance to the other, so **nobody can state the combined competence
envelope** — the band in which the room layer reports a closed loop that the wall layer would refuse
to weld. Wall side: `DEFAULT_SNAP_RADIUS = 0.5`, `MAX_FOLLOW_GAIN = 3`. Room side (read-only, and
**legitimately more permissive** because it cannot corrupt the model): `REACH_MAX_M = 1.25`,
`CORNER_CONNECTED_TOL_M = 0.30`, `REACH_COLLINEAR_MIN = 0.9`.
⚠ **`DEFAULT_SNAP_RADIUS = 0.5` is inherited from snapping and has never been justified as a WELD
tolerance.** That is a `NOT MEASURED`, not a proposal to change it.

---

## §3 — ⛔ STOP HERE. The two rulings only the founder can give

> His standing rule for spatial-validity decisions is **"always ASK, never auto-edit."** Both
> questions below are spatial-validity decisions and both are put to him, not decided here. The full
> option table with costs and failure modes is **C85 §10.8.4** and is not restated.

**RULING 1 — When a declared relationship and the geometry disagree, is the relationship the INTENT
to be restored, or a STALE RECORD to be discarded?**
⭐ **This question is now much smaller than it was this morning.** `5c3434dc` proves a large reading
on `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE` is compatible with a join closed to **0 mm** — so most of
what looked ambiguous was never ambiguous, it was **mismeasured**. What remains genuinely ambiguous
is only an edge with no join in **either** direction at **either** pose.
*Unlocks:* **W5**. *Options:* REPAIR · REFUSE · REPORT-AND-PROCEED · ASK.

**RULING 2 — Is the loss of a room IMPOSSIBLE (refuse before) or INADVISABLE (proceed and report)?**
A wall may legitimately be moved to merge two rooms — that is a normal design act. It may also
destroy 85.7 m² by accident. **The geometry cannot tell these apart; only intent can.**
*Unlocks:* **W4**, and it decides the shape of W5.

**Everything from W2 and W3 proceeds without either ruling** — they are honesty and substrate, not
behaviour.

---

## §4 — Sequence, risk, and what each step buys

| Step | Gate | Risk | Buys |
|---|---|---|---|
| **W1** ✅ | — | none | The instrument. Tells us which of the three the founder's case actually was |
| **W2** ✅ | none | minimal | A human can see a destroyed relationship. Closes C72 §9.2 at the reporting level |
| **W3** | approved | medium | Removes the confound under every option in Ruling 1 |
| **W4** | Ruling 2 | low | One stated rule instead of two behaviours chosen by code path |
| **W5** | Ruling 1 | ⛔ high | **The founder's headline complaint.** The room survives |
| **W6** | platform | none | C72 stops conflating two acts |
| **W7** | design | medium | The model stops degrading in one direction only |
| **W8** | coordination | none | The combined competence envelope becomes statable |

---

## §5 — ⛔ ANTI-SCOPE: what this plan must NOT do

1. ⛔ **No automatic sweep of standing topology findings** (W7).
2. ⛔ **No amendment to the stored-degree rule** — `isMutualCorner` letting a STORED `junctionDegree`
   override a live count needs a C83 §10.6.3 amendment the founder has not granted.
3. ⛔ **Do not raise `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE` to a refusal.**
   `L936ReweldEmitterHonesty.test.ts` refuted that within an hour of the first attempt: the
   `joinedTo` graph legitimately names walls joined AT THE LEVEL but not to the subject at that
   segment, and that fixture asserts `0 junction(s) refused` over exactly such a partner. **The graph
   over-reports by design.**
4. ⛔ **Do not touch the UNDECLARED level-scan arm.** It offers every wall on the level; a mirror test
   firing on all of them is §L-921 inverted — noise where there is no finding.
5. ⛔ **Do not remove `MAX_FOLLOW_GAIN` or the `1/sin θ` reach term** to "restore" a follow. §10.7
   R-14 records what each costs: without the gain bound, a 2 m drag moved an untouched wall 14.14 m
   with `0 refused`; without the `1/sin θ` term, every angled junction was silently dropped.
6. ⛔ **Not this lane's files:** `WallPlanToolHandler` / `WallTool` mode+ortho (lane ORTHO42),
   `Slab*` (lane SLAB41), `C94-ELEMENT-ROOM-SPACE.md` (lane ROOM44). Coordinate through main.
7. ⚠ **`wallMoveGateMutualCorner.spec.ts` has a PRE-EXISTING red case** (proven pre-existing against
   the live build `c2760644`). **Do not silence it and do not adopt it.**

---

## §6 — Test obligations

Every item above ships with a test that **fails on the HEAD it was written against** and asserts a
**measured quantity**. ⛔ *"No error thrown"* is not an acceptance criterion in this family: today's
gesture throws nothing and destroys an 85.7 m² room.

| Quantity | Unit | Used by |
|---|---|---|
| The gap a gesture opened at a declared join | **mm** | W1 ✅ (600 mm), W5 |
| The measured value against its limit (C83 §10.3 — **both** numbers) | **mm / mm** | all |
| Room count before and after the gesture | **integer** | W5 |
| The area of the room that must survive | **m²** | W5 |
| `joinedTo` edge count after a gated-out flush | **integer** | W3 |
| Disposition, **by name**, from the closed union | reason code | W2, W4 |
| Follow displacement against `MAX_FOLLOW_GAIN × drag` | **mm** | W5 |

**The existing suites are the regression control and must stay green unchanged:**
`WALLDEEP32DirectionInversion`, `L945PartnerOutcomeCensus`, `L936ReweldEmitterHonesty`,
`L926StemFollowAuthorship`, `L928StemFollowDegree` — **51 tests, all passing at `5c3434dc`.**

---

## §7 — NOT MEASURED

- **Whether the founder's two partitions WERE guest-side Ts.** His console signature was reproduced
  **exactly** from an ordinary valid T-junction — which proves the signature cannot be used as
  staleness evidence by anybody — but not that his geometry was that. **W1 answers it on his next
  gesture.** Until then the attribution is UNPROVEN and no work item may assume it.
- **How many production `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE` lines are guest-side Ts.** Zero
  sessions measured post-split.
- **The cost of W3's flush** against the ADR-0129 no-progress guard it sits behind.
- **The 3D-vs-plan divergence.** `PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT(0/500 mm)` is a **success** —
  the store is right — while an unadapted wall was reported in 3D and a correct one in plan. The
  engine's own text routes this *"DOWNSTREAM … render / invalidation / mesh cache"*. **Nobody has
  measured it there. It is not a weld defect and must not be chased as one.**
- **Curvature.** §10.7 W-M-6 records that this engine reasons about a curved wall's **chord**.
  Everything here inherits that blindness, so a guest-side T against a curved host is doubly
  unmeasured.
