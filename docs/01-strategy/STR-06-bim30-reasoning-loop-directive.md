# STR-06 — The Reasoning-Loop Implementation Directive

> **Status**: FOUNDER DIRECTIVE, condensed faithful record · **Issued**: 2026-08-12 (two
> messages, same session) · **Author**: the founder · **Filed same-day** so the governance
> chain has a root before anything cites it (the STR-05 lesson).
>
> **Reading rule**: this file is the intent; ADR-0322/0323/0324 and
> [`BIM30-IMPLEMENTATION-ROADMAP.md`](../03-execution/plans/BIM30-IMPLEMENTATION-ROADMAP.md) §5
> — the R0–R9 loop, which absorbed `BIM30-REASONING-LOOP-PLAN.md` when that document was deleted
> 2026-08-15 — are the binding interpretation. Where they disagree, raise a finding — do not pick.

## The principle at the top

> **Build ONE reasoning loop around the existing command bus; do not build a parallel AI,
> preview, cascade, or impact architecture.** The repo already has pieces of almost every
> layer (command resolution, validation, `planOpeningRefit`, `SpeculativeEngine`,
> `CascadeRunner`, `CommandResult`, read-back certification, `AIApprovalRecord`, AI
> confirmation UI, undo, event bus). The problem is not that machinery is missing — it is
> that **the pieces do not form a single contractual lifecycle.**

**First milestone: close ONE golden operation end-to-end** — `wall.move 300 mm`:
predict → explain → confirm → execute → independently read back → report predicted-vs-actual
→ undo → prove parity through AI. Not "implement the impact engine."

## 1. The first implementation is a CONTRACT, not the reasoning engine

One authoritative object represents the consequence answer (shape may evolve; the decision is
its **existence and singularity**): direct/indirect · changed/untouched · topology
added/removed/modified · violations created/resolved · regeneration required/skipped-with-reason
· refused-with-reason · **undetermined-with-scope-and-reason**. This one object retires
`CommandResult.affectedElementIds` (legacy = minimum direct set, deprecated with a migration
path — never a flag-day break of ~300 commands), gives certification and production ONE
representation, gives preview and post-mutation reporting ONE representation, and denies AI a
special "AI impact" representation.

## 2. The central lifecycle

```
Intent → Resolve → Validate → PLAN/IMPACT → [confirmation] → EXECUTE → READ BACK →
RECONCILE/REVALIDATE → REPORT
```
- **PLAN must not mutate authoritative state.**
- **EXECUTE consumes the plan** — it may not recompute consequences under different rules.
- **REPORT describes what actually happened AND compares it with the plan.** The system can
  distinguish *what we predicted* from *what actually happened* — stronger than any
  `dryRun: true` flag.
- *"Preview says openings A/B/C will move; execution moves A/B/D"* is a **certification
  failure class**, by name.

## 3. `planOpeningRefit` is the implementation seed

The idiom already exists: input → deterministic consequence calculation → typed plan → caller
decides. **Generalise it; do not build a giant generic ImpactEngine first.** A
`ConsequencePlanner<TCommand, TPlan>` interface; per-operation planners composed by an
aggregate (`wall.move` = opening-refit + junction + room-boundary + topology + regeneration
planners). Incremental, without pretending every consequence family is already computable.

## 4. PROHIBITION: preview is never execute + undo

Execution triggers cascades, dirty flags, events, regeneration, suppression, side effects,
logging, async work. An identical final snapshot does not demonstrate non-mutation.
**Invariant: a successful preview leaves authoritative stores, event streams, undo state,
dirty state, and externally observable command state unchanged** — a stronger acceptance
criterion than `afterModel == beforeModel`.

## 5–6. Converge the five overlapping systems; test CascadeRunner before promoting it

`SpeculativeEngine` is finished, extracted-for-parts, or retired — **explicitly**. Five
overlapping consequence systems (`SpeculativeEngine`, `ImpactEngine`, `CascadeRunner`,
`ConsequencePreview`, `CommandImpact`) is the exact pattern the review uncovered; **the
implementation must converge, not add another orphan.** `CascadeRunner` is NOT wired merely
because it exists: first answer *is it the planner, or one mechanism the planner uses?* One
promotion test: `wall.move → CascadeRunner → deterministic predicted command set → no
mutation → stable result`. Pass → promote (likely as the cascade branch of the planner).
Fail → Option B/C: replace, or explicitly rename as test/dry-run infrastructure and delete
the eleven misleading "inert" headers.

## 7–8. AI provenance is invocation metadata, not a different path

All actors reach `executeCommand()` through one funnel — **do not break that**. Enrich the
envelope: `actor {kind: human|ai|system|remote}` · `origin {surface, proposalId}` ·
`gestureId`. And **two separate concepts, never merged**: WHO invoked (actor/origin) vs WHAT
was proposed-validated-approved (proposal/approval: `proposalId`, `approvedBy`, `rationale`,
`confidence`). An AI command reads `origin.actorKind=ai, approval.approvedBy=<human>` — far
more useful than stamping `actorId="ai"` everywhere.

## 9. Parity is behavioral, not architectural

"Both call the same function" is intent, not proof. The gate:
`normalize(result.human) === normalize(result.ai)` for identical command+payload — same
validation, refusal, plan, mutation, affected set, undo semantics — where `normalize`
excludes only actor/origin/timestamp/proposal metadata. **Actor/channel may affect
authorization policy; it must not alter geometric, dependency, validation,
consequence-planning, or mutation semantics unless the command contract explicitly permits.**

## 10–11. Confirmation is downstream of prediction, and approval binds to a plan

Never `if (command.isDestructive) showConfirm()` — that reproduces the gap. The flow is
validate → **calculate consequences → classify severity → confirmation policy** → execute,
with `ConfirmationRequirement = none | recommended | required` plus reasons
(`removes_existing_elements`, `changes_hosted_elements`, `impact_partially_undetermined`).
The confirmation card states the consequence set, including *"nothing else expected to
change: N elements untouched"* and *"cannot determine: X"*. **Approval binds**: `planId` +
`planHash` + state hash generated together; execution verifies both; a model change between
approval and execution **invalidates the approval → re-plan → ask again**. Deterministic
consent semantics — one safety substrate for UI, AI, batch and future automation.

## 12. Batch semantics are explicit, not retrofitted

Two named modes: **Atomic** (plan all, validate all, execute all-or-none) and **Progressive**
(plan all, execute sequentially, report partials). Every batch report says
`completed / failed / notAttempted / undoUnits`. **No silent partial batch.**

## 14–15. Provenance is a separate stream; "untouched" is derived, never persisted

Impact answers *what happened because of this command*; provenance answers *why does this
element exist and where did it come from* — separate implementations, one lifecycle
(imported / authored / generated / regenerated / modified / split / merged / recreated), with
exporters consuming the authoritative provenance model rather than being patched per-field.
`ElementOrigin` (`user-authored | generated{generator, generationId} | imported{source}`)
must exist **before** regeneration is implemented — regeneration is an authority question
(*who owns this element, who may replace it, what if the user edited it*).
"Untouched" is computed as `scope − changed − excluded − undetermined`, where **excluded** =
considered-and-determined-not-to-change; never an exhaustive persisted array. Production
produces the semantic set; certification verifies it against independent read-back — never
two algorithms.

## 6-bis. UNDETERMINED is first-class

`{kind:'undetermined', reason: NO_DEPENDENCY_INDEX | ENGINE_NOT_AVAILABLE |
UNSUPPORTED_ELEMENT_TYPE | STALE_DERIVED_STATE}` — the system truthfully says *"I cannot
determine whether these room metrics change because the room dependency surface is
unavailable"*. **known + unknown = `[]` is the defect this whole session has hunted.**

## 17. The G-REASON gates

G-REASON-01 preview purity · 02 plan determinism (same state+command → same plan) ·
03 execution-plan agreement (predicted ≈ actual, with unexpected/missing/undetermined
handled explicitly) · 04 AI parity (behavioral, normalized) · 05 approval binding
(stale plan → refuse/replan) · 06 consequence-report completeness per declared contract ·
07 no silent partial batch. All under the four-exit-code contract with floors.

## 18. Explicitly NOT yet

Generic model-wide graph impact traversal · an AI-specific command router · execute→undo
preview · global CascadeRunner registration before its test · a second expression engine ·
exporter-wide provenance before provenance ownership exists · wiring every orphaned
event/package · 320-verb consequence coverage · a universal AI-approval system before the
consequence object exists. *Visible gaps, but not the shortest route to the reasoning loop.*

## The disposition rule (and the four-state ladder)

> **An authored capability may not remain indefinitely in the state "typed, tested, exported,
> but not reachable." Every such capability gets an explicit disposition: WIRE, REPLACE, or
> REMOVE.** Every event needs an identified consumer or an identified external contract —
> otherwise delete the dispatch and the catalog entry. An event with no consumer is not
> automatically a missing listener; sometimes it is dead architecture.

Measurement vocabulary, applied per capability: **AUTHORED** (exists in source) →
**REACHABLE** (production can invoke it) → **COMPOSABLE** (participates in the canonical
command/reasoning path) → **CERTIFIED** (an executable invariant proves it). A MISSING-WIRING
finding is AUTHORED✓/REACHABLE✗; a MISSING-CERTIFICATION finding is COMPOSABLE✓/CERTIFIED✗.

## The implementation arc

```
existing authored machinery → DISPOSITION (wire/replace/remove) → CONSEQUENCE CONTRACT →
PREVIEW → AUTHORIZATION → EXECUTION → CONSEQUENCE REPORT → PROVENANCE/REGENERATION → CERTIFICATION
```
The Golden Chain extends, at certification time, to: intent → validate → **predict** →
**authorize** → mutate → propagate → validate → readback → **explain** → provenance → undo →
persist → regenerate → export → **AI parity** → report.
