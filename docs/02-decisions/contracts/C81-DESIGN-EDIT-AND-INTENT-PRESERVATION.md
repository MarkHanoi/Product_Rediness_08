# C81 — Design Edit & Intent Preservation

> **Stamp**: 2026-08-13 · **Status**: CANONICAL
> **Scope**: every pass whose subject is **an existing design** — *make this 2-bed a 3-bed*, *absorb the adjacent area*, *add two floors and keep the façade language*, *improve this layout without breaking it*. Owns what an **EDIT** is as distinct from a regeneration (§1), the **preserved set** and what intent means operationally (§2), the **edit pipeline** and where it diverges from C80's generation pipeline (§3), the edit's **refusal** obligations (§4), **authority per element** for a modifying pass (§5), the **one-edit-one-undo** rule (§6), the gates (§7), and the **hard dependency on bar 3** (§8). Does **not** own the provenance vocabulary (**C75**), the authority question itself (**C80 §2**), the consequence lifecycle (**C78**), reconciliation (**C72**), or the layout algorithms an edit calls (**C53**).
> **Key principle**: *An edit is a transformation that must be able to say, per element, what it preserved and why.* A pass that produces a better plan by discarding the user's decisions has not edited anything — it has replaced it, and calling that an edit is the misrepresentation this contract exists to forbid.
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`, to [C70](C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) (the BIM 3.0 target, the four-exit-code contract, §7.1's named-gap rule), and to [**ADR-0325**](../adrs/ADR-0325-the-edit-layer-is-a-distinct-pass.md), which decides the shape this contract governs. **Defers entirely to [C78](C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md)** on the consequence lifecycle, the typed-refusal union (§8) and plan/execution binding — C81 mints no rival reason vocabulary. **Defers entirely to [C80](C80-GENERATION-AND-REGENERATION.md)** on the authority question and its three answers, and to **[C75](C75-PROVENANCE.md)** on the five-value provenance vocabulary; C81 restates none of the three. Peers with **C72** (owns reconciliation and `RECONCILABLE_TYPES`, whose narrowness is §0.1(3)'s measured fact), **C53** (owns the algorithms C81 calls and MUST NOT rewrite), **C03**/**C16** (what a command is, how it refuses), **C69** (the verb register any edit verb joins the day it exists), **C67**/**C68** (chat reachability of any verb this contract mints). **Supersedes nothing.**
> **Relationship to C80.** C80 asks *may this pass replace this element?* C81 asks *what should change, and what must survive?* **They are not alternatives and neither may be satisfied by the other**: C80 governs the entitlement, C78 governs the lifecycle, **C81 governs the transformation**. An edit engine without C80 is a vandal with good taste; C80 without an edit engine is a very careful refusal to do the work.
> **Gate**: **no gate decides C81 today.** §7 names four, and **every one is a NAMED GAP, UNBUILT at stamp time**, whose honest status is **UNPROVEN** per C70 §7.1 — never an inherited green.
> **Changelog**: 2026-08-13 — created, after an inventory of the generation stack and the trust layer found that the product has engines that produce designs and instruments that keep them safe, and **nothing whose subject is changing one**.

---

## §0 — Why this contract exists: a hole with an exact shape

This section is **BY-READ**, and says so in its first line rather than its last. Nothing below was
executed for this contract; every fact is a file read or a gate ledger read at HEAD `4c7fc8d6`,
2026-08-13, cited to path. **C70 §0.1 binds: BY-READ is never an award** — these facts establish
that a *subject* is missing, which is the one claim reading can support. Where this section and a
run disagree, the run wins.

PRYZM has two of the three things a design tool needs.

It has **generation engines** — `packages/ai-host/src/workflows/` holds `apartmentLayout`,
`houseLayout`, `residentialBuilding`, `officeBuilding`, `officeFurnish`, `furnishLayout`,
`ceilingLayout`, `lightingLayout` and `daylight`, and `BIM30-DO-NOT-REBUILD.md` §6 calls that stack
*"the most-finished domain in the entire model"*.

It has a **trust layer** — the BIM 3.0 programme: the gap register's 82 classified rows, C78's
universal relationship rule, C80's authority question, and the three bars of
`BIM30-IMPLEMENTATION-ROADMAP.md` §3.1.

It has **no edit layer**. There is no workstream, no package, no verb and no contract whose subject
is *transforming an existing design while preserving intent*. That absence has never been written
down, which is why it has never been scheduled.

### §0.1 — The four measured facts

Each is cited, and each is a *different* missing thing.

**(1) Sixteen of the founder's thirty-two prompts are modification prompts, and all sixteen are
🔴 NO.** `BIM30-NEXT-SESSION-BRIEF.md` §9.2 scores 32 real prompts across eight categories. Four of
those categories are modification — apartments (5–8), housing (13–16), residential building
(21–24), office (29–32) — and **every one of the sixteen rows reads 🔴 NO**. Not partial. Not
"works with a named gap." No. The generation categories in the same table carry ✅ and 🟡 freely.
**The verdict column separates cleanly on one axis, and that axis is whether a design already
exists.**

**(2) The critique exists and nothing acts on it.** `packages/ai-host/src/workflows/PlanCritique.ts`
scores an existing plan and is **diagnostic by construction** — its own header cites
*"[strategic ADR-014] — diagnostic workflows do NOT mutate state; critique items surface as
zero-command proposals"*, and the impl enqueues each item with `proposedCommands: []`. That is a
correct design decision for a critique. **The defect is that there is no counterpart.** Nothing in
the repository consumes a `CritiqueItem` and produces a change. Worse, the critique is not even
reachable: `docs/compliance/ISO-READINESS-MATRIX.md` FA-17 records it as *"Registered on `AiPlane`
by nothing — tests only"*, and the only non-test registration is `apps/api-gateway/src/index.ts:71`
handing the descriptor to a **stub** port. The brief's prompt 7 states the consequence in one line:
*"It can tell you what is wrong and not fix it."*

**(3) The generators take a brief. They do not take a design.** Every executor's input is a
programme — area, room mix, sliders — and its output is a fresh set of elements. There is no seed
parameter anywhere in the workflows tree. C80 §0.1(1) measured the verb side of the same fact:
`grep -rn "\.regenerate'"` → **0 hits**, and every generator is a UI controller. The edit side is
the same shape: a search of the generated verb register
(`docs/04-reference/API-VERB-REGISTER.md`, 2026-08-13) for edit-shaped verbs — `.edit`, `.modify`,
`.convert`, `.transform`, `.remodel`, `.restructure`, `.adapt` — returns **exactly one**,
`wall.transform`, which is a geometric rotate/mirror on a single element and is **refused from chat
as unwired** (`ChatCapabilityRegistry.ts:2131`). ⚠ Per C69 §0.1 that register is the citable
artefact and this reading is a moment, not a constant; re-derive it rather than quoting this line.

**(4) The layer that would make an edit safe is measured, named, and RED.** Bar 3's instrument
`tools/rac-conformance/certification/gates/check-relationship-determination.ts` landed with its
ledger `relationship-determination.json`, pinned 2026-08-13 at its first honest reading:
**4,018 SILENT cells of a derived denominator of 4,100** (100 consequential verbs × 41
relationships), 134 findings, 11/11 controls proven, 13/13 floors met, exit 1 DECLARED-LEVEL.
Landing red at a named ledger is the deliverable, not a failure. But it is also the reason §8
exists: **an edit engine composed on top of that model today would be a confident vandal.**
And C72's reconciliation is the same fact at element grain —
`SpatialAuthority.RECONCILABLE_TYPES` is **`['Wall','Slab']`**
(`packages/core-app-model/src/__tests__/SpatialAuthority.reconcile.test.ts:138` asserts exactly
that pair), so on a changed plate every column, beam, stair, roof, door, window, curtain wall,
handrail and furniture item is classified **`DETERMINED-STRANDED`**
(`SpatialAuthority.ts:204–235`). PRYZM already tells you honestly that it did not move them. That
is correct behaviour and it is not the feature.

> ### §0.2 — What this contract does NOT conclude
>
> **(a) The generators are not the defect.** C80 §0.2 and `BIM30-DO-NOT-REBUILD.md` §6 protect the
> generation stack, and §6.2 below carries that protection forward as a MUST NOT. C81 asks for a
> pass that *calls* those engines under constraint. It does not ask for one line of D-TGL, D-FLE,
> D-CE or the ADR-0055 join pipeline to change.
>
> **(b) Bar 3 is not the edit layer, and this is the correction the brief's own §9.1 needs.**
> `BIM30-NEXT-SESSION-BRIEF.md` §9.1 states that shipping bar 3 *"converts 16 of these 32 prompts
> from 'no' to 'yes' at once"*. **It does not, and C81 disagrees with that sentence in writing
> rather than quietly.** Bar 3 makes a modification **SAFE** — every affected element is DETERMINED
> or refused with a typed reason, and nothing goes silently stale. It does not decide **WHAT to
> change**. *Convert this 2-bed to a 3-bed* means: split the larger bedroom, relocate a door,
> re-route the corridor, preserve the wet stack. **No cell of C78's 4,100-cell product contains
> that decision**, because it is not a relationship question. Bar 3 converts sixteen rows from
> *"silently wrong"* to *"honestly refused"* — a large and necessary gain, and not the same gain.
> ⚠ Amending that section is the BIM 3.0 planning lane's, not C81's; this clause records the
> disagreement so the two documents cannot both be read as settled.
>
> **(c) C81 does not re-open C80's open question.** Whether authored-protection lives in a verb
> family or in the stores is **0B OPEN QUESTION 8**, declined by C78 §18.3 and by C80 §9. C81
> declines it too, for the same reason: an edit layer is a *caller* of the authority question and
> is indifferent to where it is answered, so choosing here would settle someone else's question
> from the outside.

> ### §0.3 — Read the gate, not this section
>
> Every count above is a reading at a moment: 16/32, 4,018/4,100, `['Wall','Slab']`, one
> edit-shaped verb. The artefacts that compute them are the brief, the ledger, the test and the
> register. **C70 §0.2 governs** — where this section and a run disagree, the run wins and this
> section is stale.

---

## §1 — What an EDIT is

> **§1.1 — MUST. An edit has three inputs, and a pass missing any one of them is not an edit.**
>
> | Input | What it is | Consequence of absence |
> |---|---|---|
> | **the seed** | the existing model region the pass is transforming, identified by element ids — not by level, not by "the current project" | with no seed there is nothing to preserve, and the pass is a generation |
> | **the change request** | what the user asked to be different (a brief delta, a critique item, a direct instruction) | with no request the pass has no objective and cannot be validated |
> | **the preserved set** | the elements and decisions the pass MUST carry through unchanged (§2) | with no preserved set the pass is a regeneration wearing an edit's name — §1.2 |

> **§1.2 — MUST NOT. A regeneration that discards user intent MUST NOT be presented as an edit.**
> This is the misrepresentation clause and it is the reason the contract exists. The brief's prompt
> 6 records the current honest path — *"regenerate-with-new-brief, which discards your edits"* —
> and that path remains **legal**: a user may ask for a regeneration and get one. What is forbidden
> is offering it in answer to an edit request, in the UI, in chat, or in a report, **without saying
> that the existing design will be discarded**. A user who asked for a 3-bed and received a
> different apartment has been given a correct answer to a question they did not ask.

> **§1.3 — MUST. The discriminator is machine-checkable, and that is why §1.1 is stated as
> inputs rather than as intent.** A pass that names a seed is an edit; a pass that names none is a
> generation. This is deliberately a structural test rather than a semantic one, because a semantic
> test would be unenforceable and because **the failure mode is precisely a pass that believes it
> is editing.** §7's `check-edit-declares-a-seed` asserts exactly this and nothing more.

> **§1.4 — the four edit shapes, named so they are not conflated in planning.** These are a
> **taxonomy, not a schedule**, and C81 does not require all four to exist:
> **(a) refine** — same topology, better arrangement (brief prompt 7, 23);
> **(b) re-partition** — same envelope, different topology (prompts 6, 13, 24, 29);
> **(c) extend** — envelope grows (prompts 5, 14, 22, 32);
> **(d) merge/split** — unit boundaries move (prompt 8).
> They are ordered by how much of the seed survives, and **(a) is the one to build first** —
> not because it is most valuable, but because its preserved set is the whole seed, which makes
> §2 testable before §3 is hard.

> **§1.5 — MUST. An edit is a consequential operation.** C78 §1.1 applies without modification and
> C81 restates none of it. Everything an edit touches is either carried through the full safe-mode
> lifecycle or returned **UNDETERMINED with a typed reason from C78 §8's closed union.**

**Exit condition for §1**: at least one edit verb exists, is in the C69 register, declares a seed,
and `check-edit-declares-a-seed` reads ≥ 1 subject rather than 0.

---

## §2 — Intent preservation

Intent is not a mood. It is a set of elements and values with a provenance, and §2 makes it
operational.

> **§2.1 — MUST. The preserved set is resolved BEFORE the plan is computed, and it is an input to
> planning, not a filter applied to the result.** A pass that computes a new arrangement and then
> discards the parts that collide with authored work has already lost: it will produce an
> arrangement that was never designed around the constraint. **The preserved set constrains the
> solver; it does not clean up after it.**

> **§2.2 — MUST. Five classes are preserved by default.** Each is a distinct discovery problem and
> they are listed separately so that "preservation is implemented" cannot be claimed from one:
>
> | Class | What it means | Discovery today |
> |---|---|---|
> | **authored elements** | provenance `authored` per C75 — a human stated this element | **only rooms** carry an element-grain signal (`RoomBoundary.detectionMethod`, C80 §0.1(2)); everything else is `unknown-authority` |
> | **hand-placed elements** | placed by a user gesture rather than by a pass — a front door the user positioned | no signal; the apartment generator's known defect of ignoring a hand-placed front door is this class |
> | **named rooms** | a name a human typed is an authored value even on a generated room | requires value-grain provenance (C75), not element-grain |
> | **overridden dimensions** | a value a human changed away from the engine's output | same; C74 is the neighbouring contract on whether the override held |
> | **authored provenance itself** | the record of who decided what | C75; §2.3 |

> **§2.3 — MUST NOT. An edit MUST NOT silently downgrade `authored` to `regenerated`.** C75 owns
> the vocabulary and C80 §4.1–§4.2 owns its survival through a generation pass; **C81 states the
> edit-specific form because an edit is the pass most likely to commit this defect**: it touches
> authored elements *by design*, where a generator merely collides with them. Where an edit
> genuinely replaces an authored element with a computed one, C75's `regenerated` requires
> `replaced` to be carried — and per C80 §4.3 the pass must go through that constructor rather than
> minting a fresh provenance. A downgrade the user did not authorise, recorded as though they had,
> is worse than a refusal: it launders a loss into a decision.

> **§2.4 — MUST NOT. `preserved` and `undetermined` are not the same value.** C79 §5 already
> forbids this collapse for region-derived boundaries — *"same pixels, opposite facts"* — and it
> recurs here exactly. An element the edit **decided** to leave alone and an element the edit
> **could not reason about** look identical in the model and are opposite facts about the pass. The
> report (§2.5) MUST distinguish them, and a pass that cannot distinguish them has not preserved
> anything; it has merely not reached it.

> **§2.5 — MUST. Every edit produces a preservation report, per element, including a blind pass.**
> C80 §3.3 requires a generation report; C81 requires that an edit's report carry, for each element
> in the seed, which of **preserved / modified / replaced / removed / undetermined-with-reason** it
> received. The distinction between the first four is what makes the seventh stage of §3 auditable,
> and the fifth is §2.4.

> **§2.6 — MUST NOT. The preserved set MUST NOT be inferred from proximity, recency, or
> `metadata.createdBy`.** C79 §2 establishes by measurement that proximity is where a *wrong* host
> comes from and that **a wrong reference is strictly worse than none**; C80 §2.4 names
> `metadata.createdBy` as the obvious shortcut and forbids it, because it defaults to `'system'`
> and is stamped by stores. **A wrong preserved set is worse than an empty one** — an empty set
> yields a refusal, a wrong one yields a confident deletion of the thing the user cared about.

**Exit condition for §2**: an edit over a fixture holding authored and generated elements preserves
every authored one, reports all five dispositions per element, and does **not** refuse a fixture in
which nothing is authored (the control — §3.4 of C80, applied here).

---

## §3 — The edit pipeline

C80 §1.1 fixes the generation loop at seven stages. **An edit runs the same loop.** It is not a
second lifecycle, and C81 mints none — C78 owns plan hashing (§9), execution binding (§10),
reconciliation (§11), undo grouping (§12) and blind mode (§16).

> **§3.1 — MUST.** The edit loop is:
> **diagnose → resolve-preserved-set → plan → validate → preview → approve-or-blind →
> execute-the-same-plan → reconcile → report → undo.**
>
> | Stage | Same as C80's generation loop? | What differs, and why |
> |---|---|---|
> | **diagnose** | **NEW** | an edit may be *driven by* a critique (§0.1(2)). This stage is where `PlanCritique` output becomes a change request. **OPTIONAL** — a user instruction is an equally valid request, and §9 does not decide whether critique auto-triggers |
> | **resolve-preserved-set** | **NEW, and MUST NOT be skipped** | §2.1. A generation has no seed and therefore no such stage; this is the structural difference between the two loops |
> | **plan** | same | the plan MUST name the preserved set it was computed against, so a stale preservation invalidates the plan exactly as a stale state hash does (C78 §9/§10) |
> | **validate** | same | plus: the plan MUST NOT modify an element the preserved set protects — validation catches this before preview, not after execution |
> | **preview** | same | the preview MUST show what is preserved, not only what changes. A preview showing only the delta lets a user approve a loss they never saw |
> | **approve-or-blind** | same | C78 §16.1's `computeConfirmationPolicy(plan)` decides; C80 §1.3's *blind means the user was not asked, never that the user was not told* applies unchanged |
> | **execute-the-same-plan** | same | C78 §9/§10. An edit that re-solves at execution time has previewed nothing |
> | **reconcile** | same, and this is where bar 3 binds | C72. Today `RECONCILABLE_TYPES` is `['Wall','Slab']` (§0.1(4)); every other type on a changed plate is STRANDED, which for an edit is a **refusal condition** (§4.4), not a footnote |
> | **report** | same + §2.5 | the preservation report is an edit-specific section of the C78 report, not a second artefact |
> | **undo** | same | §6 |

> **§3.2 — MUST NOT. An edit MUST NOT mint a second consequence representation.** ADR-0322's
> singularity clause binds: *"the exact field shape may evolve; the singularity may not."* An
> `EditPlan` that is not a `ConsequencePlan` is the defect that ADR forbids by name, arriving
> through a new door.

> **§3.3 — MUST. Where an edit calls a generation engine, it calls it as a constrained
> sub-solver, and the engine's output is a proposal, not a commit.** The engine returns geometry;
> the **edit pass** decides what of it survives contact with the preserved set. This is the
> mechanism by which §6.2's MUST NOT is kept: the engines do not learn about preservation, the
> caller does.

**Exit condition for §3**: one edit runs all ten stages over one typology, its preview and its
execution consume the same plan object, and the plan names the preserved set it was computed
against.

---

## §4 — Refusal

> **§4.1 — MUST. An edit that cannot determine its consequences REFUSES.** C78 §1.1 admits exactly
> two outcomes and there is no third. An edit that guesses is worse than a generation that guesses,
> because the user has existing work in the blast radius.

> **§4.2 — MUST. The reason is typed, and it comes from C78 §8's closed union.** C81 mints **no**
> reason vocabulary. C78 §0.f measured what happens otherwise: two reasons encoded as **fake
> hashes** (`'UNVERIFIABLE:no-planner-for-type'`) because no typed reason existed, read downstream
> as `PLAN_STALE` — while the member that existed for the case, `UNSUPPORTED_ELEMENT_TYPE`, had
> zero production producers. An improvised sentinel is not a refusal; it is a lie with a
> distinctive spelling.

> **§4.3 — MUST NOT. `unknown-authority` is not permission.** C80 §2.3, without modification.
> Restated here only because the edit path is where a future implementer will meet it most often:
> **every element in every model today is `unknown-authority`** except rooms, so an edit layer
> built before GEN-GAP-2 lands will meet that answer on nearly every element it touches. The
> correct response is §4.4, not a default.

> **§4.4 — MUST. A partial edit is a refusal with a report, never a silent partial.** If the plan
> can transform the walls and slabs but leaves the columns, stairs and doors STRANDED (§0.1(4)),
> the pass MUST say so **before** execution, with both numbers in the house sense — how many
> elements it proposed to touch, and how many it could not account for. C80 §1.4 fixes that shape
> and `planRegenerationClear`'s sentence is the worked example. A user told *"I moved the walls and
> I do not know what happened to your columns"* can act. A user told nothing cannot.

> **§4.5 — MUST NOT. An edit MUST NOT fall back to regeneration when it refuses.** This is the
> §ENVELOPE-REJECT-SILENT-FALLBACK shape: a hard reject that quietly becomes a different, weaker
> answer, indistinguishable at the call site from success. A refusal that silently becomes a
> regeneration **destroys the exact work the refusal existed to protect**, and it does so at the
> moment the system had correctly identified the danger. Refusal is terminal; the user chooses what
> happens next.

> **§4.6 — MUST NOT. Over-refusal is also a failure.** C80 §3.4's control, applied here: a pass
> that refuses every edit is not safe, it is broken. The gate encodes this as a control fixture in
> which nothing is authored and the edit MUST proceed. A refusal rule with no control is
> indistinguishable from a hard-coded `refuse = true`.

**Exit condition for §4**: every edit refusal carries a C78 §8 member; zero improvised sentinels on
the edit path; the control fixture proceeds.

---

## §5 — Authority, per element

> **§5.1 — MUST. The authority question is C80 §2's, asked per element, and C81 adds no fourth
> answer.** `may` / `protected` / `unknown-authority`. An edit calls it; it does not re-derive it.

> **§5.2 — MUST. An edit additionally classifies every seed element by SCOPE, and scope is
> orthogonal to authority.** The two axes answer different questions and collapsing them is the
> §0.1(4) defect in a new place:
>
> | Scope class | Meaning | Obligation |
> |---|---|---|
> | **in-scope** | the change request intends to change this | authority decides (§5.1) |
> | **out-of-scope, determined-unaffected** | reasoned about and genuinely untouched | report it as preserved (§2.5), do not re-emit it |
> | **out-of-scope, consequentially affected** | not intended, but a related element the change reaches | C78's lifecycle: carry or UNDETERMINED |
> | **out-of-scope, undetermined** | the pass cannot tell which of the two above it is | §4.4 — counted, named, never absorbed into "preserved" |

> **§5.3 — MUST NOT. An element MUST NOT be modified because it was easy to reach.** The
> unfiltered-clear anti-pattern (C80 §10.a) has an edit-shaped sibling: `getByLevel()` → rebuild
> everything → declare the edit done. Every element the pass rebuilt is an element it replaced,
> whatever the geometry looks like afterwards, and the provenance consequence of that is §2.3.

> **§5.4 — UNPROVEN, named rather than left to silence.** Whether the preserved set survives
> **save → reload** is untested for every class in §2.2, for the same reason C80 §4.4 records for
> provenance. An intent that holds in memory and not on disk protects nothing across sessions, and
> an edit is a multi-session activity by nature.

**Exit condition for §5**: every seed element carries both an authority answer and a scope class in
the plan, and the counts reconcile against the seed's cardinality.

---

## §6 — One edit = one logical undo

> **§6.1 — MUST. An edit is one logical undo unit.** A user who runs an edit and dislikes it
> presses undo **once**, and lands on the design they had. The precedent is established and is not
> new machinery: a bus `*.batch.create` is **one** `produceCommand`, `runBatch` is
> **undo-NEUTRAL** (ADR-0314), and C80 §6.3 already requires that a clear half and a rebuild half
> share one unit.

> **§6.2 — MUST NOT. C81 does not require any generation engine to be rewritten.** C80 §6.4 and
> `BIM30-DO-NOT-REBUILD.md` §6 are carried forward verbatim in force. Every requirement in this
> contract is satisfiable by a **new caller**: a seed, a preserved set, a plan, a batch boundary,
> a report. Any proposal that reaches inside D-TGL, D-FLE, D-CE or the ADR-0055 join pipeline to
> satisfy C81 is **out of scope and MUST be refused.** The zero-token property of the deterministic
> tier (C70 §1.3) is likewise not C81's to spend.

> **§6.3 — MUST. Preserved elements MUST NOT appear in the undo diff.** A pass that deletes an
> authored element and recreates it identically has satisfied the pixels and violated §2: the
> element has a new id, a new provenance, and a place in the undo record it should not have. **The
> undo diff is the cheapest available proof that preservation was real** rather than cosmetic, and
> §7's gate uses it as such.

> **§6.4 — the measured starting point, BY-READ from C80 §6.2 and therefore UNPROVEN here.**
> D-TGL apartment layout is **2–3 undo units**, room detection is **explicitly non-undoable**.
> Both are on the edit path. Neither is C81's to fix — they are C80 §6's exit condition — but an
> edit built over them inherits their granularity, and §8 is the reason that matters.

**Exit condition for §6**: an edit over a seed is one undo step, and the undo diff contains no
element the preservation report called preserved.

---

## §7 — The gates

Per **C70 §7.1**, a gate named here that does not exist at HEAD is a **NAMED GAP** whose honest
status is **UNPROVEN** — never a blank row, never an inherited green. **All four are unbuilt.**
C81 claims no gate coverage of any kind at stamp time.

| Gate | Status at stamp | What it must assert | Exit condition |
|---|---|---|---|
| `check-edit-declares-a-seed` | **UNBUILT — NAMED GAP, UNPROVEN** | §1.3. Every verb classified as an edit names its seed as element ids; no edit verb accepts a brief alone; a pass without a seed is classified a generation and held to C80 instead | ≥ 1 edit verb discovered **and** its seed resolved. A run reading 0 edit verbs exits **2 MISCONFIGURED**, never 0 |
| `check-intent-preservation` | **UNBUILT — NAMED GAP, UNPROVEN** | §2. Over a fixture holding authored + generated elements, an edit preserves every authored one; the report carries all five dispositions (§2.5); `preserved` and `undetermined` are distinguishable (§2.4); provenance is not downgraded (§2.3). **CONTROL**: an all-generated fixture is **not** refused (§4.6) | the authored elements survive by id **and** by provenance, and the control proceeds |
| `check-edit-refusal-typed` | **UNBUILT — NAMED GAP, UNPROVEN** | §4. Every refusal on the edit path carries a C78 §8 member; **zero** improvised sentinel strings (C78 §0.f's shape); a STRANDED reconciliation is refused with both counts (§4.4); no refusal path reaches a regeneration (§4.5) | 0 sentinels, and the STRANDED case is refused rather than partially executed |
| `check-edit-one-undo` | **UNBUILT — NAMED GAP, UNPROVEN** | §6. An edit is one undo unit; the undo diff contains no preserved element (§6.3) | 1 unit measured, and the diff intersection with the preserved set is empty |

> **§7.1 — MUST. Every gate carries an exit-2 subject floor.** C69 §3.5 and C70's four-exit-code
> contract. A run that discovers fewer subjects than its floor is **MISCONFIGURED**, not passing —
> and for these four that is the live case, because **there are no edit verbs today**. A gate
> reading "0 edit verbs, all conformant" is the exact false green this suite has spent the session
> correcting.

> **§7.2 — MUST. Every gate is SATISFIABLE, and satisfiability is demonstrated before the gate is
> trusted.** ⭐ **L-716 is the standing incident**: a gate whose exit-0 state cannot exist is a
> defect, not a standard. Before any gate here is merged, its author MUST construct and record the
> state in which it exits 0 — a fixture, a fake, or a real path — and that construction is part of
> the gate, not a note about it. `check-relationship-determination` sets the bar: its own ledger
> records **11/11 controls proven, satisfiability included.** Ask *can this ever be true?* before
> *why is it red?*

> **§7.3 — MUST. Every gate is shrink-only, against a named ledger, and lands RED.** The pattern is
> `relationship-determination.json`: a derived denominator, a pinned first honest reading, and no
> tuning toward green. A gate that lands green has measured nothing.

> **§7.4 — MUST. Every arm is negative-tested before it is trusted.** C74 §0. An untested arm
> converts an unknown into a false green, which is worse than the unknown.

> **§7.5 — what these gates CANNOT see, stated so the table is never read as coverage.**
> **(a)** Three of §2.2's five preserved classes — hand-placed elements, named rooms, overridden
> dimensions — have **no subject** until value-grain provenance exists (C75, roadmap Phase 8); a
> gate over them today would measure its own fixture.
> **(b)** Nothing here says anything about a **concurrent** edit (C08/C66); every arm is
> single-client.
> **(c)** §5.4's save/reload axis is untested and no gate above covers it.
> **(d)** Whether an edit produced a *good* design is not a conformance question and no gate here
> will ever answer it. C81 governs whether an edit is **honest**, never whether it is skilful.

---

## §8 — The dependency on bar 3, stated as a precondition

> **§8.1 — MUST. The edit layer MUST NOT ship ahead of bar 3.** `BIM30-IMPLEMENTATION-ROADMAP.md`
> §3.1 bar 3 — C78 §19.1's no-partial-credit applied across the `element × relationship ×
> operation` product, instrumented by `check-relationship-determination` — is a **precondition of
> this contract, not an alternative to it.** You cannot build an edit engine on a model that does
> not know what its changes break. An edit is the operation that reaches furthest into existing
> work, so it is the operation with the most to lose from 4,018 silent cells.

> **§8.2 — and the converse, stated with equal force. Bar 3 does not deliver this contract.**
> §0.2(b). Bar 3 makes a modification **SAFE**; an edit engine decides **WHAT to change**. The
> sixteen 🔴 rows need both, and a plan that schedules only bar 3 and expects them to turn green
> has mis-scoped the work by exactly one layer.

> **§8.3 — MUST. The precondition is a THRESHOLD, and the threshold is not "bar 3 is green".**
> Requiring the whole 4,100-cell product to be determined before any edit may exist is
> unsatisfiable in practice and would make this contract a permanent no. The honest precondition is
> **per-scope**: an edit over a scope may proceed when **every relationship its plan touches** is
> determined-or-typed-refused for the verbs in that plan. That is measurable from the same ledger,
> at the same grain, and it is what makes an incremental edit layer possible — the first edit
> claims a small slice of the product, not the whole of it.

> **§8.4 — the dependency chain, so it is not rediscovered.** C81 §2 depends on **C80 GEN-GAP-2**
> (element provenance fields — without it, every non-room element answers `unknown-authority` and
> §2.2's classes have no discovery mechanism), which depends on **C75 §3's coverage ratchet**,
> which is itself unbuilt. C81 §3's reconcile stage depends on **C72 §5's exit** (a consumer for
> every type `RECONCILABLE_TYPES` names). C81 §6 inherits **C80 §6's** undo granularity. **None of
> these are C81's to close**, and none may be treated as closed by C81's existence.

**Exit condition for §8**: the per-scope threshold in §8.3 is computable from the bar-3 ledger, and
the first edit's scope is recorded against it in writing.

---

## §9 — What this contract does not decide

Stated so the boundaries are not inferred from silence.

- **Which typology gets the first edit.** §1.4 argues for a *refine* over apartments on
  preservation-testability grounds. That is an argument, not a decision; the reasoning-loop lane
  owns the sequencing.
- **Where the edit pass lives.** A new package, `ai-host`, or bus-adjacent alongside the
  consequence planners. ADR-0325 records that it is a distinct pass; it does not place it, for the
  same reason ADR-0322 left the planner's package to R1.
- **The verb shape.** `apartment.edit` vs `design.edit` vs a scoped `edit.run` is a C16/C69
  decision made when the first one is written, and it joins the register that day (C69 §1.1 — the
  name is a persistence fact, not a label).
- **Whether critique auto-triggers an edit.** §3.1's diagnose stage is optional and C81 does not
  say when it fires. Auto-triggering an edit from a critique before §4 and §7 exist would give a
  diagnostic the power to modify a model unattended — strictly worse than today, where it can do
  nothing.
- **The algorithms.** C53. An edit calls solvers; it does not contain them (§3.3).
- **How preservation is presented.** Modal, card, diff, or report line is UI. §2.5 constrains that
  the disposition is *stated per element*, never how it looks.
- **Whether authored-protection belongs in the stores.** 0B OPEN QUESTION 8. §0.2(c).
- **Whether an edit may be triggered by model change.** The C72 propagation question C80 §9 also
  declines. An automatic edit is an unattended transformation of existing work, and it is the last
  thing this layer should acquire, not the first.

---

## §10 — Anti-patterns

- **§10.a — Regenerate-and-call-it-an-edit.** §1.2. The contract's reason for existing.
- **§10.b — The preserved set as a post-filter.** §2.1. Produces an arrangement designed around
  nothing.
- **§10.c — Downgrading `authored` to `regenerated` in passing.** §2.3.
- **§10.d — Reporting `preserved` for an element the pass never reached.** §2.4.
- **§10.e — Inferring the preserved set from proximity or `createdBy`.** §2.6. A wrong preserved
  set is worse than an empty one.
- **§10.f — A second plan type for edits.** §3.2 / ADR-0322's singularity clause.
- **§10.g — Silent partial reconciliation.** §4.4. STRANDED is a refusal condition, not a log line.
- **§10.h — Falling back to regeneration when the edit refuses.** §4.5. The refusal destroys the
  work it existed to protect.
- **§10.i — Refusing everything and calling it safety.** §4.6.
- **§10.j — Rebuilding the level because it was easier than reasoning about it.** §5.3.
- **§10.k — Delete-and-recreate-identically as "preservation".** §6.3.
- **§10.l — Reaching inside a working engine to add preservation.** §6.2.
- **§10.m — Citing `PlanCritique`'s existence as evidence the edit half exists.** §0.1(2): it is
  diagnostic by design, registered by nothing, and it enqueues `proposedCommands: []` on purpose.
- **§10.n — Scheduling bar 3 and expecting the sixteen 🔴 rows to turn green.** §0.2(b), §8.2.
- **§10.o — Writing a gate whose exit-0 state nobody has constructed.** §7.2, L-716.

---

## §11 — Exit conditions, consolidated

1. **§1** — one edit verb exists, declares a seed, and is in the C69 register.
2. **§2** — an edit over a mixed fixture preserves every authored element, reports five
   dispositions per element, and does not refuse the all-generated control.
3. **§3** — one edit runs all ten stages; preview and execution consume the same plan; the plan
   names the preserved set it was computed against.
4. **§4** — every refusal carries a C78 §8 member; zero sentinels; no refusal reaches a
   regeneration.
5. **§5** — every seed element carries both an authority answer and a scope class, and the counts
   reconcile against the seed's cardinality.
6. **§6** — one edit is one undo unit, and the undo diff excludes the preserved set.
7. **§7** — the four gates exist, each with a demonstrated exit-0 state (§7.2), a named
   shrink-only ledger, and negative-tested arms.
8. **§8** — the per-scope bar-3 threshold is computable and the first edit's scope is recorded
   against it.
