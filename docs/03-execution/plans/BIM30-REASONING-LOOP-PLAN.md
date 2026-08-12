# BIM 3.0 Reasoning Loop — the implementation plan

> **Stamp**: 2026-08-12 · **Status**: ACTIVE · **Authority**: STR-06 → ADR-0322/0323/0324 →
> this plan. **Relation to [`BIM30-IMPLEMENTATION-ROADMAP.md`](BIM30-IMPLEMENTATION-ROADMAP.md)**:
> that roadmap closes the *substrate* (graph writers, propagation arms, epsilon, provenance
> fields, gates); this plan builds the *product loop* on top of it. They interleave — R-phases
> name their substrate dependencies explicitly. Neither supersedes the other.
>
> **The milestone that defines success**: `wall.move 300 mm` demonstrates, end to end:
> predict → explain → confirm → execute → independently read back → report predicted-vs-actual
> → undo → AI parity. **One golden operation closed beats generic machinery opened.**

## R0 — Disposition of dead machinery *(ADR-0323; cheap, first, noise-reducing)*

| Item | Disposition path | Exit |
|---|---|---|
| `CascadeRunner` | run THE test: `wall.move → deterministic predicted command set → no mutation → stable result` | a recorded PROMOTE / REPLACE / RECLASSIFY decision + the 11 "inert" headers corrected |
| `SpeculativeEngine` | assess ownership boundary against ADR-0322 | recorded finish / mine-for-parts / retire |
| Orphaned events (11) | per-event: what invariant needs this? | consumer identified OR dispatch+catalog entry deleted; `pryzm-render-registry-isolation-leak` removal needs founder sign-off |
| Orphaned packages (`pdf-to-bim` queue, `expr-eval`, `wcag-audit`, `ai-generative` descriptor, `legacy-shim`, `bench-visual-diff`) | wire-or-remove each | zero packages with 0 importers and no recorded disposition |
| Room edge/component queries (`getEdgesForRoom`, `getConnectedComponent`, `TemporalGraph.getEdgesForElement`) | these are impact-surface inputs — HOLD for R2, do not delete | marked WIRE-PENDING-R2 |

**Exit condition**: every review-discovered authored-but-unwired item carries a disposition
with an owner and date; the disposition docket is a committed artefact.

## R1 — The consequence contract *(ADR-0322 §1; types + envelope, no engine)*

Create in `packages/command-bus` (bus-adjacent, zero new package): `ConsequencePlan`,
`ConsequenceReport`, `ImpactDetermination` (with the four UNDETERMINED reasons),
`RefusalSet`, `ChangeSet`/`ElementSet`, `ConsequencePlanner<TCommand,TPlan>` — plus the
`CommandExecutionContext` envelope (ADR-0324: actor/origin/approval, riding beside the
existing `gestureId`). `CommandResult.affectedElementIds` documented as legacy
minimum-direct; `consequence?` added optionally. **SpeculativeEngine's disposition lands
here** — its clone-and-validate core is the leading candidate for mining.
**Exit**: types compile, envelope threads through `executeCommand` unused-but-carried, zero
behaviour change, root tsc clean.

## R2 — Generalise the planning idiom over `wall.move` *(ADR-0322 §7; the seed grows)*

The aggregate `wall.move` planner composes: opening-refit (**exists** — `planOpeningRefit`,
wrapped not rewritten) · junction (**exists** — the retained junction index, `joinedTo`
pending roadmap Phase 3) · room-boundary (RoomTopologyObserver's knowledge, read-only) ·
regeneration (UNDETERMINED `NO_DEPENDENCY_INDEX` until the substrate lands — **declared, not
faked**) · violations (the compliance registry, advisory). Every branch the substrate cannot
support yet returns a typed UNDETERMINED — the plan is honest about its own blind spots from
day one.
**Exit**: `plan(wall.move)` returns a populated `ConsequencePlan` with G-REASON-02
determinism proven (same state+command → same plan, twice, byte-equal).

## R3 — Preview *(ADR-0322 §3; wire the overlay at last)*

`executeCommand(type, payload, {mode:'preview'})` (or an explicit `plan()` API — R1 decides)
returns the plan WITHOUT mutation. **G-REASON-01 preview purity** proven the strong way:
stores byte-identical AND event streams silent AND undo stacks untouched AND dirty flags
unchanged — with a positive control proving the harness could detect each. The
consequence-preview overlay trigger surface (zero callers today) is wired to this — the R0
disposition of the overlay executes here.
**Exit**: G-REASON-01 green with negative controls; a hover/tool path actually displays a
preview in the editor.

## R4 — Execution consumes the plan *(ADR-0322 §2)*

`wall.move` execution accepts the plan, executes it, and the independent read-back
(CA-21 discipline) feeds **G-REASON-03 execution-plan agreement**: predicted ≈ actual with
`unexpected / missing / undetermined` explicitly categorised. Plan-fidelity divergence is
the named failure class.
**Exit**: G-REASON-03 lands (red or green — honest either way) with its ledger.

## R5 — The consequence report *(ADR-0322 §6; STR-06 §15)*

`ConsequenceReport` produced from the actual execution record + the original plan — never a
second inference pass. Sections: changed / excluded / undetermined / regenerated / refused /
validation / provenance(actor+origin) / **predicted-vs-actual**. `untouched` derived at
report time. Surfaced: on the command result, and through chat as the answer to *"what did
that change?"* — the first governed answer surface for a post-mutation question.
**Exit**: G-REASON-06 completeness per declared contract, for `wall.move`.

## R6 — Confirmation policy + approval binding *(ADR-0322 §10, ADR-0324 §4–5)*

`ConfirmationRequirement` computed from the plan (severity classification + reasons);
`planHash` + state-hash binding; stale approval → refuse/replan (**G-REASON-05**). The AI
confirmation card upgrades from proposal-text to consequence-set (including untouched count
and undetermined items).
**Exit**: G-REASON-05 green; the card renders the plan.

## R7 — AI parity *(ADR-0324 §3)*

**G-REASON-04**: `normalize(human) === normalize(ai)` for `wall.move`, excluding exactly
actor/origin/timestamp/proposal. Batch semantics declared (Atomic|Progressive) with
G-REASON-07 no-silent-partial.
**Exit**: both gates green for the golden operation.

## R8 — Provenance & regeneration authority *(STR-06 §14; blocks on roadmap Phase 8)*

`ElementOrigin` lands in schemas (the roadmap's provenance fields ARE this — one stream, not
two); regeneration becomes an authority question over it; the report's provenance section
goes from actor-metadata to element-grain. Generation engines gain already-generated
awareness (the duplicate-on-rerun defects) and the house executor's silent room deletion
becomes a reported, refusable consequence.
**Exit**: the authored-state-protection scenario (review §6) passes as an executed test.

## R9 — Certification *(ADR-0322's gate family, complete)*

All seven G-REASON gates built, negative-tested, registered per the residency rule; the
Golden Chain extended (predict · authorize · explain · AI-parity links); the golden-operation
matrix opens its second row.
**Exit**: `wall.move` row fully green; matrix backlog ordered.

## The golden-operation matrix (the backlog — horizontal expansion AFTER the loop closes)

| Operation | Planner | Preview | Confirm | Execute | Report | AI parity |
|---|---|---|---|---|---|---|
| **wall.move** | R2 | R3 | R6 | R4 | R5 | R7 |
| wall.create | — | — | — | — | — | — |
| opening.move | — | — | — | — | — | — |
| room.regenerate | — | — | — | — | — | — |
| furniture.generate | — | — | — | — | — | — |

## Explicitly NOT in this plan *(STR-06 §18 — visible gaps, wrong route)*

Generic model-wide impact traversal · AI-specific router · execute→undo preview · global
CascadeRunner registration before its test · second expression engine · exporter-wide
provenance before ownership · wiring every orphan reflexively · 320-verb coverage · a
universal approval system before the consequence object exists.

## Substrate dependencies on the existing roadmap

R2's junction branch ← roadmap Phase 3 (`joinedTo` writer) · R2's regeneration branch ←
Phase 5 (dependency wiring) · R8 ← Phase 8 (provenance fields) · everything ← Phase 2's
readback-positive verbs (**landed**). Where substrate is missing, the planner declares
UNDETERMINED rather than waiting — the loop closes with honest blind spots and tightens as
the substrate lands.
