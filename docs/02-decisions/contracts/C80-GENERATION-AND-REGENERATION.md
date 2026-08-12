# C80 — Generation & Regeneration Authority

> **Stamp**: 2026-08-12 · **Status**: CANONICAL
> **Scope**: every pass that produces model elements *the user did not draw one at a time* — the house / apartment / office / residential layout executors, the ceiling and furnish and lighting engines, room detection, roof generation, and any future `*.generate` / `*.regenerate` verb. Owns the **authority question** (*may this pass overwrite this element?*), the rule that **generation is a consequential operation**, already-generated awareness, and the one-generation-one-undo rule. Does **not** own the provenance vocabulary (**C75**), what an element *is* (**C65**), how a command is written (**C16**), or the layout algorithms themselves (**C53**).
> **Key principle**: *A generator may not destroy what it cannot account for.* The authority to replace an element is a question with three answers, and the third — **we do not know who owns this** — is not permission.
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`. **Defers to C75 on the provenance vocabulary and restates none of it** — C75 owns *where a value came from*, C80 owns *who may replace it*. Peers with **C70** (owns the BIM 3.0 target, the four-exit-code contract and §7.1's named-gap rule this contract's gate table obeys), **C71**/**C72** (own the graph and the propagation this contract's cascade rule rides on), **C74** (the behaviour-side sibling: C74 governs *did the work happen*, C80 governs *was the pass entitled to do it*), **C53** (owns the generative layout algorithms C80 explicitly protects), **C03**/**C16** (own what a command is and how it refuses), **C69** (owns the verb enumeration — the missing `*.regenerate` verb is a C69 register entry the day it exists), **C67**/**C68** (own chat reachability of any verb this contract mints). **C80 is the GENERATION specialisation of [C78](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md)** (minted the same day) and **defers to it entirely** on the shape of the consequence lifecycle — plan / UNDETERMINED semantics (C78 §8) / plan hashing (§9) / execution binding (§10) / reconciliation (§11) / undo grouping (§12) / blind mode (§16). **C78 §18 (axis Q — generated/regenerated relationships) states the same measured destruction from the relationship side; C80 does not overturn a line of it.** The division is: C78 §18 asks *does a generation carry its related elements or say UNDETERMINED*; **C80 asks who is entitled to replace an element at all** — the authority question, its three answers, already-generated awareness, and the protection of the working engines. Where the two touch, **C78 governs the lifecycle and C80 governs the entitlement**; neither may be satisfied by the other. Supersedes nothing.
> **Gate**: `tools/rac-conformance/certification/gates/check-authored-state-protection.ts` — **EXISTS and is RED by design** (§7). Four further gates are **NAMED GAPS, UNBUILT at stamp time** (§7).
> **Changelog**: 2026-08-12 — created, after an executed gate destroyed a human-authored room through the real store, the real bus and the real handler.

---

## §0 — Why this contract exists

Not an argument. A run.

`tools/rac-conformance/certification/gates/check-authored-state-protection.ts` (landed
`b0ca0c27`) seeds a level with **two rooms of different provenance** — one whose boundary a human
drew (`detectionMethod: 'manual-boundary'`, which is what the room draw tools stamp on the
polygon the user traced — `packages/room-topology/src/RoomTool.ts:199` and, independently,
`apps/editor/src/engine/views/plantools/RoomPlanToolHandler.ts:125`; see §7.4), one
flood-filled by topology — and then runs the **§GRAPH-CLEAR-FIRST loop transcribed
from `apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts:1757-1766`** against them, through
the **real `RoomStore`** (`packages/room-topology`), the **real `CommandBus`**
(`packages/command-bus`) and the **real `plugins/rooms` `room.delete` handler**.

Run for this contract, `2026-08-12`, HEAD `e6c8cb58` — clause (b), verbatim:

```
$ cd tools/rac-conformance/certification
$ npx tsx gates/check-authored-state-protection.ts

(b) LIVE §GRAPH-CLEAR-FIRST over a level holding 1 AUTHORED + 1 generated room
    → seeded=2 · remaining=0 · the authored room survived=false

→ [1] DECLARED-LEVEL — check-authored-state-protection: 7 finding(s),
      at or below the declared level of 7.
```

The two `room.delete` dispatches are visible in the run's own log above that line
(`[CommandManager] EXECUTE: DELETE_ROOM` ×2, `[BimManager] Unregistered element …`), so the
deletion is not inferred from a counter: **the authored room was unregistered by the real
handler.** All twelve floors pass — including the five executed ones — which is the point: this
is not a broken harness reporting a broken world. **It is a working harness reporting a working
destruction.**

**A room whose boundary a human drew was destroyed by the clear pattern the shipping house
executor uses.** That is the founder's own scenario — *"regenerate and my hand edits survive"* —
failing, reproduced rather than described. It is not a lint finding and it is not a code smell: it
is the user's work, gone, with the deletion fire-and-forget (`void`, never awaited), the failure
path swallowed (`catch { /* non-fatal */ }`), and **the user never told**.

### §0.1 — The four measured facts that explain why nothing stopped it

Each is cited, and each is a *different* missing thing, because each closes differently.

**(1) Every generator is a UI controller. No `*.regenerate` bus verb exists anywhere.**
`docs/04-reference/BIM30-PHASE0-RELATIONSHIP-INVENTORY.md` §6 enumerates nine generators — house,
apartment, office, residential, ceiling, furnish, lighting layout executors plus two `ai-host`
services — and every row reads **UI controller**, `protects authored?` **NO**. Re-measured at
HEAD: `grep -rn "\.regenerate'"` across `packages/`, `plugins/`, `apps/` → **0 hits**; the verb
register `docs/04-reference/API-VERB-REGISTER.md` contains **0 `apartment.` verbs**. The only
generate-shaped verbs are `GENERATE_STAIR_GEOMETRY` and `ai.floorplan.generate`, *neither of which
regenerates an area*. **This is why nothing can enforce clear-then-rebuild centrally — there is no
central place**, and it is also why a generation cannot be previewed, refused, or undone as one
unit: none of those are properties a UI controller has.

**(2) No element carries provenance.** C75 §0 Finding 2, re-measured today and still true: every
`origin:` in `packages/schemas/src/elements/*` is a geometric `Vec3` — a point, not a provenance.
`generationId` / `generatedBy` / `isGenerated` / `sourceGenerator` return **zero first-party
element hits** (the only matches are `packages/schemas/src/site/completion/CityCompletionScorecard.ts`,
which is a city scorecard and not an element, and `ElementProvenanceIndex.ts`'s own prose about
their absence). **`RoomBoundary.detectionMethod`** (`packages/room-topology/src/RoomTypes.ts:100`)
is the **only** element-grain provenance signal in the repository — which is exactly why the gate's
executable arms are all about rooms, and why walls, doors, windows and AI-proposed elements have
no subject to test at all.

**(3) The vocabulary already exists at L0, and it is not this contract's to redefine.**
`packages/schemas/src/provenance/ValueOrigin.ts` (`57f2b539`) carries C75's five —
`authored | observed | computed | inferred | regenerated` — with `SystemWritableOrigin =
Exclude<ValueOrigin, 'authored'>` making *a generator claiming a human acted a compile error*, and
unknown modelled as `origin: null` plus a typed `ProvenanceUnknownReason` rather than a sixth
union member. **C80 restates none of this** (C75 §1.2; C69 §3.2 — a second copy becomes a rival
list). C80 asks the *next* question, which C75 deliberately does not answer: given an origin, who
may replace the element?

**(4) The refusable form already exists and already refuses. Nothing calls it.** This is the most
important fact in §0 for anyone planning work.
`apps/editor/src/engine/provenance/ElementProvenanceIndex.ts` (`b0ca0c27`) exposes
`mayRegenerate` with three answers, `planRegenerationClear` (the reported/refusable form), and
`queryPriorGeneration` (which returns `undetermined`, never `[]`). The same gate run that produced
the destruction above also produced, over **the same fixture**:

```
(c) planRegenerationClear over the SAME set
    → refuse=true · clearable=1 · PROTECTED=1 · unknown-authority=0
(c) sentence: the house layout generator proposed clearing 2 element(s): 1 clearable ·
    1 AUTHORED (a human stated them) · 0 of unknown provenance. Clearing cannot proceed
    unreviewed — an authored element removed he…          [truncated by the gate's line width]
(c·control) the same function over 2 system-produced rooms
    → refuse=false · clearable=2 — refusal is a decision, not a constant.
```

**Arms (b) and (c) run over one fixture and disagree**, because (b) is the production pattern and
(c) is the reported form nothing has been wired to. **The gap is not that nothing can refuse. The
gap is that the live generator path does not ask.**

> ### §0.2 — What this contract does NOT conclude from the above
>
> **The generators are not the defect.** D-TGL apartment layout (67 tests, run-twice determinism
> asserted at `ai-host/__tests__/tglRunDeterministicLayout.test.ts:85`), D-FLE furnish, D-CE
> ceilings, room detection, roof generation — `BIM30-DO-NOT-REBUILD.md` §6 calls the generation
> stack *"the most-finished domain in the entire model"*, *"the bulk of BIM 3.0's delivered
> value"*, and records that it came through **both** audit downgrades **strengthened**. Its own
> extension plan is *"two wiring changes and **no engine change**"*. C80 asks for the consequence
> system these engines run inside. **It does not ask for one line of any engine to be rewritten,
> and §6 states that as a MUST NOT.**

> ### §0.3 — Read the gate, not this section
>
> Every count and every quoted line above is a reading at a moment. The artefact that computes
> them is the gate; this section cites it so the argument is checkable, and **C70 §0.2 governs**:
> where this document and a gate run disagree, **the run wins** and this section is stale.

---

## §1 — Generation is a consequential operation

> **§1.1 — MUST.** A generation or regeneration pass is a **consequential operation** and MUST run
> the full loop: **plan → validate → preview → approve-or-blind → execute-the-same-plan →
> reconcile → undo**. Not one of those seven is optional because the pass is "just a generator":
> a pass that mints a hundred elements and deletes twenty is the *most* consequential thing the
> product does, not the least.
>
> ⚠ **Measured reason this is not true today, stated as a MUST NOT be read as a description**:
> per §0.1(1), **every generator is a UI controller and no `*.regenerate` verb exists**, so there
> is no object to plan, no plan to preview, and nothing to approve. This clause is **NOT-YET-TRUE**
> and its named gap is §8's **GEN-GAP-1**.

> **§1.2 — DEFERRED to C78 §9/§10.** *Execute must consume the plan it previewed* — a pass that
> previews one thing and then recomputes at execution time has previewed nothing, and the user
> approved a picture rather than an action. **C78 owns plan hashing and execution binding; C80
> restates neither** and cites this only so a generation-lane reader does not conclude the rule is
> unowned because it is not spelled out here.

> **§1.3 — MUST NOT. "Blind" is a declared mode, never a silent one.** A generation may run
> without approval — the founder's flow is a fast one and a confirmation card on every furnish
> pass would be intolerable — but **blind execution MUST be a stated property of the call**, and
> the pass MUST still produce the report (§3.3). Blind means *the user was not asked*, never *the
> user was not told*. ⚠ **Whether a given generation needs confirmation is NOT C80's to decide**:
> C78 §16.1 establishes by measurement that the requirement is a pure function of the plan
> (`computeConfirmationPolicy(plan)`, `confirmationPolicy.ts:124`), and C78 §16.2 forbids the
> `if (command.isDestructive)` shortcut **by name**. C80 adds only that a generation is not exempt
> from producing a plan for that function to read.

> **§1.4 — MUST. Refusal is a legal outcome and a first-class one.** A generator that cannot
> proceed safely refuses, **with both numbers** (how many elements it proposed to touch, and how
> many it could not account for) in the house sense. `planRegenerationClear`'s sentence is the
> shape, measured live in §0.1(4): *"…proposed clearing 2 element(s): 1 clearable · 1 AUTHORED (a
> human stated them) · 0 of unknown provenance."*

> **§1.5 — MUST NOT.** A generator MUST NOT dispatch destructive commands fire-and-forget.
> `void bus.executeCommand(...)` inside an empty `catch {}` — `HouseLayoutExecutor.ts:1757-1766`
> — means the pass cannot know whether the deletion happened, cannot report what it did, and
> cannot roll it back. A destruction whose outcome the caller never reads is not an operation; it
> is a hope.

**Exit condition for §1**: one generator runs as a bus verb consuming a plan object, the plan is
previewable, and `check-generation-is-consequential` (§7) reads ≥ 1 generation verb rather than 0.

---

## §2 — The authority question

> **§2.1 — MUST.** Before clearing, overwriting or replacing **any** element, a generation pass
> MUST determine, **per element**, whether it may do so. Per element, not per level, not per
> pass: the founder's scenario is a level holding a mix, and any coarser grain answers a question
> nobody asked.

> **§2.2 — MUST. The question has exactly THREE legal answers.** The shape is live in
> `ElementProvenanceIndex.ts`'s `RegenerationAuthority` and is measured to discriminate — the
> gate asserts three *distinct* kinds over three fixtures as a CONTROL, so that a function
> returning one constant cannot pass:
>
> | Answer | When | What the pass may do |
> |---|---|---|
> | **`may`** (`allowed`) | provenance is known and is **not** `authored` — `computed`, `inferred`, `regenerated`, `observed` | replace it, recording the replacement (§4) |
> | **`protected`** (`refused`) | provenance is **`authored`** — a human stated it | **MUST NOT** silently replace it; the conflict becomes a reported, refusable decision (§3) |
> | **`unknown-authority`** | provenance is **not known** (C75's `origin: null` + reason) | **neither protected nor free.** The caller MUST decide **in the open** and MUST record what it decided |

> **§2.3 — MUST NOT. `unknown-authority` MUST NOT be treated as permission.** This is the exact
> defect §0 reproduced, and it is worth naming why the third answer cannot be folded into either
> neighbour: **collapse it to `may` and a generator silently destroys the user's work** (what
> `§GRAPH-CLEAR-FIRST` does today); **collapse it to `protected` and no generator can ever run on
> a legacy model** — and every model in existence today is a legacy model, because no element
> carries provenance (§0.1(2)). Both collapses are catastrophic and they are catastrophic in
> opposite directions, which is precisely why the third answer must be a *decision surface*
> rather than a default.

> **§2.4 — MUST NOT. Authority may not be inferred from metadata that was never about
> authorship.** `Metadata.createdBy` defaults to the literal string `'system'`
> (`packages/schemas/src/base/primitives.ts:43`) and is stamped **by stores, not by users** —
> reading `createdBy !== 'system'` as "a human authored this" mints `authored` out of a store's
> default. C75 §2.2 forbids it and `systemProvenance`'s type makes it unrepresentable. Named here
> because it is the *obvious* shortcut a future implementer will reach for.

> **§2.5 — MUST.** The comment `// pre-existing (detection) room(s)` at
> `HouseLayoutExecutor.ts:1751-1756` **asserts a provenance the code cannot know.** A comment that
> claims an origin is not evidence of one. Any clear-set whose membership rests on an assertion no
> field supports is `unknown-authority` by definition (§2.2), and MUST be treated as such.

**Exit condition for §2**: `mayRegenerate` (or its successor) is called on the live path of every
generator in the §0.1(1) inventory, and the gate's arm (b) and arm (c) **agree** over one fixture.

---

## §3 — Authored elements are protected by default

> **§3.1 — MUST.** Authored is the **default-protected** class. A regeneration that would destroy
> an authored element MUST become a **reported, refusable consequence** — never a silent
> overwrite. R8's exit condition names exactly this: *"the house executor's silent room deletion
> becomes a reported, refusable consequence."*

> **§3.2 — MUST.** The refusal MUST **name what it is protecting**. A refusal that cannot say
> which element it is protecting cannot be acted on — the user is told "something is in the way"
> and has no move to make. The gate asserts this arm separately from the refusal itself, and it
> passes today.

> **§3.3 — MUST.** Every generation pass produces a **report stating which elements it touched
> and why** — including a blind pass (§1.3), and including the elements it *declined* to touch.
> This is the seventh of the founder's seven verifications and the only one of the four
> structurally-missing ones that needs no new schema field.

> **§3.4 — MUST NOT. Over-protection is also a failure.** A pass that refuses everything is not
> safe, it is broken, and it stops the product working. The gate encodes this as a **control**:
> the same function over an all-system-produced set must NOT refuse. A protection rule with no
> control is indistinguishable from a hard-coded `refuse = true`.

> **§3.5 — MUST. The user's decision is recorded, not just taken.** Where a user resolves a
> conflict by permitting the overwrite of an authored element, that permission is part of the
> operation's record. Otherwise the next reader of the model — an exporter, a chat answer, a
> second regeneration — sees an authored element replaced by a generated one with no trace, which
> is §4's subject.

**Exit condition for §3**: the live executors call the refusable form; arm (b) of
`check-authored-state-protection` reports `the authored room survived = true`; and the gate's
`declared` finding level drops by that finding rather than the finding being reclassified.

---

## §4 — Provenance MUST survive the cascade

> **§4.1 — MUST. C75 owns the vocabulary; C80 requires that it survive a generation pass.**
> Generated stays generated, AI-proposed stays AI-proposed (`inferred`), authored stays authored,
> imported stays imported. C75 §1.1's five values are cited, never restated here.

> **§4.2 — MUST NOT. A generation pass MUST NOT default a provenance in either direction.**
> Never default to `authored` — that is C75 §2.2's forbidden move, and it launders machine output
> into a user decision. **And never default to `generated`** — that licenses the *next*
> regeneration to destroy it, which turns one absent field into permanent data loss on the second
> run. ⭐ **A wrong provenance is worse than an absent one, because regeneration ACTS on it.**
> An absent provenance yields `unknown-authority` and a decision; a wrong one yields a confident
> deletion. The correct value for "we do not know" is C75's `origin: null` plus a
> `ProvenanceUnknownReason`, and `producer-not-instrumented` is the member that exists for exactly
> the state every generator is in today.

> **§4.3 — MUST. An overwrite carries what it replaced.** C75 §2.7 and
> `ValueProvenanceSchema`'s own refinement already make `regenerated` unconstructible without
> `replaced`. C80 adds the *behavioural* requirement C75 §6.3(d) says a static gate cannot see:
> the pass must actually go through that constructor rather than minting a fresh provenance.

> **§4.4 — UNPROVEN, and named rather than left to silence.** Whether provenance survives
> **save → reload** across any generator is untested: `BIM30-CONTRACT-REVIEW-PART-E` §7's
> "After save/reload?" column reads **NO test exists** / **NO** for D-TGL, D-FLE, D-CE and roof
> generation alike. A provenance that survives the cascade in memory and not on disk protects
> nothing across sessions.

**Exit condition for §4**: element schemas carry a `ValueProvenance` field (roadmap Phase 8 /
C75 §3's coverage ratchet), the generators write it, and a round-trip test reads it back.

---

## §5 — Already-generated awareness

> **§5.1 — MUST.** A generator MUST be able to ask **what a prior run produced**, before it
> produces anything.

> **§5.2 — MUST. The answer MUST be UNDETERMINED-with-reason when no index exists — never `[]`.**
> An empty list reads as *"nothing was generated"* and licenses a duplicate; "we have no way to
> know" and "there is nothing there" are the **same value** under an empty return, which is the
> §CONTEXT-DATA-HONESTY defect (C69 §2.2, C75 §1.4) at its own doorstep. `queryPriorGeneration`
> already has this shape and the gate proves it is a reading rather than a stub via a control:
> with a run declared it returns `determined` and finds the survivor.

> **§5.3 — the measured consequence of not having this, so the clause is not abstract.** From the
> gate's own declared finding: `HouseLayoutExecutor` mints fresh levels per run with
> `Date.now()`+`Math.random()` ids and **clears only ROOMS** — walls, doors, windows, slabs,
> stairs, roofs, furniture and lighting from a previous run are **never removed**, so a second run
> **stacks a whole building on the first**. The clear pattern is simultaneously too aggressive
> (it deletes authored rooms) and too narrow (it deletes nothing else). Those are two different
> defects with two different fixes and they must not be filed as one.

> **§5.4 — MUST NOT. Caller-declared awareness MUST NOT be reported as a model fact.**
> `DeclaredGenerationRun` is named `declared` deliberately: it is a caller's claim, it survives no
> reload, and a generator re-run in a fresh session has **none**. It is the interface the persisted
> field will feed, not a substitute for it. Any status document describing awareness as present
> because this interface exists is making the C74 error — reporting a capability whose subject is
> a stand-in.

> **§5.5 — OPEN, and the largest open question in this contract.** *How should a generator
> DISCOVER prior-run output given no index exists today?* Four candidate substrates are visible
> and **none is chosen here** (§9 records why choosing would be premature). Deciding this is
> GEN-GAP-3's first task, not C80's.

**Exit condition for §5**: a generator re-run in a **fresh session** returns `determined`, and the
duplicate-on-rerun defect is reproduced by a gate and then closed.

---

## §6 — One generation = one logical undo

> **§6.1 — MUST.** A generation pass is **one logical undo unit**. A user who runs a generator and
> dislikes the result presses undo **once**.

> **§6.2 — the measured state, per engine** (BY-READ from `BIM30-CONTRACT-REVIEW-PART-E` §7 —
> **not re-executed here**, and therefore UNPROVEN in this contract by C70 §0.2):
>
> | Engine | One undo unit? |
> |---|---|
> | D-TGL apartment layout | **NO — 2–3 units** (`ApartmentLayoutExecutor.ts:178`, `:378`, naming `:473`); never opens `beginBuildingGeneration` |
> | D-FLE furnish | YES — one `runBatch` (`FurnishLayoutExecutor.ts:499`) |
> | D-CE ceilings | YES — one `runBatch` (`CeilingLayoutExecutor.ts:198-206`) |
> | Roof generation | YES — folded into the house structural batch (`HouseLayoutExecutor.ts:1430`) |
> | Room detection | **ZERO — explicitly non-undoable** (`ReDetectRoomsCommand` header `:31`) |

> **§6.3 — MUST.** The **clear half and the rebuild half are the same undo unit.** A pass that
> deletes twenty rooms in one unit and creates twenty-two in another leaves a reachable
> intermediate state in which the user has lost twenty rooms and gained nothing — and an undo
> from there is a second decision the user never asked to make.

> **§6.4 — MUST NOT. C80 does not require any engine to be rewritten.** Per §0.2 and
> `BIM30-DO-NOT-REBUILD.md` §6, the generation stack is protected. Every requirement in this
> contract is satisfiable by **wiring** — an authority call before the clear, a plan object around
> the pass, a batch boundary, a provenance stamp — and any proposal that reaches inside D-TGL,
> D-FLE, D-CE or the ADR-0055 join pipeline to satisfy C80 is **out of scope and MUST be
> refused**. The zero-token property of the deterministic tier (C70 §1.3) is likewise not
> C80's to spend.

**Exit condition for §6**: every engine in §6.2 reads YES, or its NO is founder-signed by name
with a reason (room detection's deliberate non-undoability is the candidate for the second path).

---

## §7 — The gates

Per **C70 §7.1**: a gate named here that does not exist at HEAD is a **NAMED GAP** whose honest
status is **UNPROVEN** — never a blank row, never an inherited green.

| Gate | Status at stamp | What it must assert | Exit condition |
|---|---|---|---|
| `check-authored-state-protection` | **EXISTS** — `tools/rac-conformance/certification/gates/`, landed `b0ca0c27`. **Run for this contract 2026-08-12: exit `[1] DECLARED-LEVEL — 7 finding(s), at or below the declared level of 7`**, all 12 floors green. RED by design, pinned in `gate-newly-measured.json` at `declared: 7` | §2 (three distinct authority answers, with a control) · §3 (the refusable form refuses, names the element, carries both counts, and does **not** refuse an all-generated set) · §5.2 (UNDETERMINED is not `[]`, with a control) · and the live §GRAPH-CLEAR-FIRST arm | arm (b) reports `the authored room survived = true`, and the declared level drops with the finding rather than the finding being reclassified |
| `check-generation-is-consequential` | **UNBUILT — NAMED GAP, UNPROVEN** | §1. At least one generation runs as a bus verb over a plan object; execute consumes the previewed plan; no destructive dispatch is fire-and-forget (§1.5) | ≥ 1 generation verb discovered (a run reading 0 is **misconfigured**, not passing), and 0 `void bus.executeCommand` sites inside generator clear loops |
| `check-generation-provenance-stamped` | **UNBUILT — NAMED GAP, UNPROVEN** | §4. Every element a generator emits carries a `ValueProvenance`; no path defaults to `authored` **or** to a generated member; overwrites go through `regeneratedProvenance` | blocked on roadmap Phase 8 (element provenance fields); until then it MUST report UNPROVEN rather than green |
| `check-already-generated-awareness` | **UNBUILT — NAMED GAP, UNPROVEN** | §5. A second run over a model containing the first run's output does not duplicate; the query answers `determined` **across a reload**, not only in-process | a fresh-session re-run is `determined`; §5.3's stacking defect is reproduced, then closed |
| `check-generation-one-undo` | **UNBUILT — NAMED GAP, UNPROVEN** | §6. Each generator's pass is one undo unit, and clear+rebuild share it | §6.2's table reads YES throughout, or each NO is founder-signed |

> **§7.1 — MUST.** Every gate carries an **exit-2 subject floor** (C69 §3.5, C70's four-exit-code
> contract). A run that discovers fewer subjects than its floor is **MISCONFIGURED**, not passing.
> `check-authored-state-protection` already does this — a clear loop that deleted nothing fails
> its own floor, because *"an arm that deleted nothing proves nothing."*

> **§7.2 — MUST.** Every arm is **negative-tested before it is trusted** (C74 §0's standing
> evidence). An untested gate is worse than no gate: it converts an unknown into a false green.

> **§7.3 — what these gates CANNOT see**, stated so the table is never read as coverage:
> **(a)** `check-authored-state-protection` transcribes the §GRAPH-CLEAR-FIRST loop rather than
> importing the executor — the gate's own header names this **its weakest link**: it proves the
> *pattern* destroys authored rooms, **not that this exact executor instance does**;
> **(b)** **4 of the founder's 7 verifications have NO SUBJECT** and the gate prints each as
> **NOT EVALUATED** with its reason, stating in its own output *"This gate does NOT claim the
> scenario passes"* — authored wall byte-intact, authored/generated opening, generated wall
> UPDATED, and the AI element still marked INFERRED, all for want of element provenance and a
> `*.regenerate` verb; **(c)** every arm is single-client — nothing here says anything about a
> concurrent regeneration (C08/C66); **(d)** `auto-topology` is **both** a real detection method
> and `roomSnapshotUtils.ts:156`'s `|| ` default (C75's PV-01, live at HEAD), so a room reading it
> is genuinely ambiguous between *flood-filled* and *origin-not-recorded* — the gate reports this
> as a named finding rather than letting the translation launder a default into a determination.

> **§7.4 — the `manual-boundary` stamp has TWO independent production producers, and an authoring
> near-miss is recorded rather than erased.** The gate cites
> `packages/room-topology/src/RoomTool.ts:199`; a second, independent producer is
> `apps/editor/src/engine/views/plantools/RoomPlanToolHandler.ts:125` (the plan-tool draw path,
> dispatching `room.create` with the polygon the user traced). Both are genuine human-draw paths,
> so the `manual-boundary → authored` mapping rests on two real sites, not one. ⚠ An early draft
> of this section declared `RoomTool.ts` nonexistent and its citation dead — **that finding was
> itself wrong**: it came from a repo search that timed out plus two scoped greps that never
> covered `packages/room-topology`, and a full sweep overturned it
> (§PROBE-CAN-BE-WRONG-THREE-WAYS — the probe was wrong about its own coverage). It is recorded
> here because a contract that quietly deleted its own overturned finding would be exercising the
> exact laundering §7.3(d) forbids in the gate.

---

## §8 — The named gaps, with owners and roadmap placement

C80 states an END STATE. It does **not** demand a rewrite (§6.4). The distance between the two is
these four gaps, named so they can be owned rather than rediscovered.

| Gap | What is missing | Owner | Roadmap placement | Blocks on |
|---|---|---|---|---|
| **GEN-GAP-1** — generation-as-verb | No `*.regenerate` verb; every generator is a UI controller (§0.1(1)). Until this exists there is **no central place** to enforce anything in §1–§3 | the BIM 3.0 reasoning-loop lane (R8 → R9) | `BIM30-REASONING-LOOP-PLAN.md`'s golden-operation matrix, **`room.regenerate` row** — currently empty across all six columns | nothing. **This is the unblocked one**, and per §0.1(4) the first task is *wiring the existing refusal, not designing one* |
| **GEN-GAP-2** — element provenance fields | No element carries provenance (§0.1(2)), so §2's authority question answers `unknown-authority` for everything except rooms | C75 §3's per-kind coverage ratchet | roadmap **Phase 8**; R8 declares itself blocked on it | C75's `check-provenance-coverage`, itself UNBUILT |
| **GEN-GAP-3** — prior-run discovery | §5.5 / §9: no persisted generation marker, and the substrate is **enumerated, not chosen** | undecided — **this is the open question §8 flags** | after GEN-GAP-2 lands the field, so a chosen substrate does not become a rival index | GEN-GAP-2 |
| **GEN-GAP-4** — the four NOT-EVALUATED verifications | Authored wall byte-intact · authored/generated opening · generated wall UPDATED · AI element still INFERRED (§7.3(b)) | the gate's own enumeration floor | closes incrementally as GEN-GAP-1 and -2 land | both |

> **§8.1 — MUST.** A gap closing is a **deliberate floor change in the commit that adds the real
> arm** (`check-authored-state-protection`'s enumeration floor is asserted as a COUNT precisely so
> the list cannot quietly shrink to flatter the gate). A gap MUST NOT close by reclassification.

---

## §9 — What this contract does not decide

Stated so the boundaries are not inferred from silence.

- **Which verb shape a generation takes.** `house.regenerate` vs `level.regenerate` vs a generic
  `generation.run` is a C16/C69 decision, made when the first one is written.
- **Whether regeneration becomes a verb family at all, or authored-protection moves into the
  STORES instead.** This is **0B OPEN QUESTION 8**, and C78 §18.3 explicitly declines to settle
  it. C80 declines too, and the reason is worth stating: §2's authority question is answerable
  from either site, and choosing the site before one generator has been wired to the *existing*
  refusal (§0.1(4)) would be designing against an unmeasured surface. **The store route is not
  obviously wrong** — it would protect authored elements against *every* deletion path rather
  than only the generators, which is broader than C80 requires and could be cheaper than nine
  executor rewrites. It is also riskier, because it puts a refusal in the path of every delete in
  the product. **Neither is chosen here.**
- **How a conflict is presented.** Whether an authored-element conflict is a modal, a card, or a
  line in a report is UI. §3 constrains that the decision is *offered and recorded*, never how it
  looks.
- **How prior-run output is DISCOVERED.** §5.5. The four visible substrates —
  (i) a persisted `generationId` on the element (roadmap Phase 8's field, the end state);
  (ii) the `project_command_log` (exists, unexposed — `BIM30-CONTRACT-REVIEW-PART-C` C-04);
  (iii) the level-scoped `markGraphAuthoritative` marker the house executor already sets
  (`ADR-0069` GR1) which is *level*-grain and cannot answer an element question;
  (iv) `DeclaredGenerationRun`, which §5.4 disqualifies as a model fact — are **enumerated, not
  chosen**. Choosing before the Phase 8 field lands would mint a second index that the field then
  has to displace, which is the C69 rival-list defect.
- **The provenance vocabulary.** C75. Entirely.
- **The layout algorithms.** C53, and §6.4's MUST NOT.
- **Whether regeneration should be triggered by model change at all.** Measured today: **only
  room detection is reactive**; every other engine runs manual-or-chain-only
  (`BIM30-CONTRACT-REVIEW-PART-E` §7's trigger column). Whether a wall move *should* re-run the
  furnish pass is a C72 propagation question, and answering it before §1 exists would give a
  cascade the power to run an unaccountable generator automatically — strictly worse than today.

---

## §10 — Anti-patterns

- **§10.a — The unfiltered clear.** `getByLevel()` → delete every id. §0, §2.1.
- **§10.b — Treating `unknown-authority` as permission.** §2.3. The defect, in one line.
- **§10.c — A comment asserting provenance the code cannot know.** §2.5.
- **§10.d — Defaulting provenance to `generated` "so regeneration works".** §4.2. It converts a
  missing field into permanent data loss on run two.
- **§10.e — Returning `[]` for "we have no index".** §5.2.
- **§10.f — Fire-and-forget destruction.** `void bus.executeCommand(...)` + `catch {}`. §1.5.
- **§10.g — Clearing in one undo unit and rebuilding in another.** §6.3.
- **§10.h — Refusing everything and calling it safety.** §3.4.
- **§10.i — Rewriting a working engine to satisfy this contract.** §6.4.
- **§10.j — Reading `metadata.createdBy` as authorship.** §2.4.
- **§10.k — Citing `planRegenerationClear`'s existence as evidence the defect is fixed.** §0.1(4):
  the module ships as *the answer the executor should be asking*. The gate says so on every run.

---

## §11 — Exit conditions, consolidated

1. **§1** — one generation runs as a bus verb over a plan object that preview and execute share.
2. **§2** — the live generator paths call the authority question; arms (b) and (c) agree.
3. **§3** — `the authored room survived = true`, measured, on the live path.
4. **§4** — elements carry `ValueProvenance`; generators write it; it survives save/reload (§4.4).
5. **§5** — a fresh-session re-run answers `determined`; the stacking defect (§5.3) is closed.
6. **§6** — §6.2's table reads YES throughout, or each NO is founder-signed by name.
7. **§7** — the four unbuilt gates exist and are negative-tested; the four NOT-EVALUATED
   verifications gain subjects and the gate's enumeration floor is lowered **deliberately, in the
   commit that adds the real arm**.
8. **§5.5 / §9** — the prior-run discovery substrate is chosen, in writing, with its reason.
