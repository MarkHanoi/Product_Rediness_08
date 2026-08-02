# SPEC — The Envelope Compiler Programme (the operating model)

| Field | Value |
|---|---|
| Status | DRAFT — **normative (the method)**. Every number this method produces lives in the artefacts it names, never in this file |
| Version | 1.0 |
| Date | 2026-08-02 |
| Owner | Geospatial / envelope-compiler programme |
| Contract | [C64 — The Envelope Compiler](../../02-decisions/contracts/C64-ENVELOPE-COMPILER.md) |
| ADR | [ADR-0291](../../02-decisions/adrs/ADR-0291-pryzm-envelope-compiler-variable-first-architecture.md) over [ADR-0283](../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md)–[ADR-0290](../../02-decisions/adrs/ADR-0290-exhaust-authoritative-sources-before-engineering-a-derived-solution.md) |
| Composes | [BLOCKER-CLASSIFICATION-STANDARD](../../04-reference/standards/BLOCKER-CLASSIFICATION-STANDARD.md) (the classes + the gates + the release order) · [MACHINE-READABLE-EVIDENCE-REGISTER](../../04-reference/standards/MACHINE-READABLE-EVIDENCE-REGISTER.md) · [DECISION-REGISTER](../../04-reference/standards/DECISION-REGISTER.md) · [PROBE-DISCIPLINE](../../04-reference/standards/PROBE-DISCIPLINE.md) · [NATIONAL-CAPABILITY-REGISTER](../../04-reference/standards/NATIONAL-CAPABILITY-REGISTER.md) (the capability inventory, variable model, dependency ranking and roadmap this method *schedules*) |
| Reports into | [PEC-EXECUTION-DASHBOARD](../plans/PEC-EXECUTION-DASHBOARD.md) (the computed face) · [master-execution-tracker §PEC](../plans/master-execution-tracker.md) (the workstream) |
| Measurement records | `tools/city-completion/measurements/<city>.measurements.json` — **the only place a per-city figure is written** |
| Issue | audit **L-681 … L-687** |

> ⛔ **THIS SPEC CONTAINS NO MEASURED FIGURES, DELIBERATELY** (C64 §2.13). A previous programme document
> was written with correct numbers in hand and was wrong in **both directions** within weeks. Where this
> method needs a number it names the artefact that computes it. **Reference the run, never the value.**

---

## §1 — Purpose

C64 says *what the compiler owes a user*. This SPEC says **how the programme that builds it is run**:
how work enters the roadmap, how it is prioritised, how effort is measured, how progress is reported, and
how success is validated.

**Why a programme and not a backlog.** The five failure modes below have all already happened here,
inside one week, and none of them is an engineering mistake:

| Failure | What it looked like | The structural cure |
|---|---|---|
| Effort in the wrong category | a **legal** question worked as a data problem for days | §3 — classify before scheduling; `Legal` freezes its engineering |
| A blocker that silently migrated | a variable filed as *unobtainable data* was **published geometry** all along | §3.4 — migration is a claim and carries the same evidence burden |
| A ceiling asserted from a sample | a three-block sample became a P1 engineering ceiling that reached shipped code | §7.2 — state `N`; a sample is not a ceiling |
| A stale claim inherited across cities | one register's P0 froze work on cities that were never blocked | §7.3 — the `Superseded` sweep, and it is mandatory |
| A search with no stopping rule | an open-ended hunt is indistinguishable from an unstarted one | §5.3 — Stage 0 is one-shot and time-boxed with an exit criterion |

---

## §2 — The one objective, and the metric that judges it

> **A user selects any parcel and immediately receives the maximum legally defensible, fully explainable
> 3D buildable envelope — or a determination naming exactly what is missing.**

- **Primary metric — Envelope Completion Coverage (ECC).** The share of the denominator on which a 3D
  envelope is generated. This is the metric the programme is judged on.
- **Honesty metric — Determination Coverage.** Envelope **plus** cited refusal. Reported **always split by
  C64 §5 kind, never as a bare number** (C64 §2.12) — it is gameable by refusing, and drift needs no
  dishonesty. **Never the ranking metric.**
- **Separate and never aggregated — Intervention-Ceiling Coverage.** Drawable volumes that are not
  envelopes (C64 §5.2).
- ⚠ **The denominator is being restated to the cadastral parcel** (founder, Addendum 1), replacing the
  incompatible area bases the five cities used. Until that lands, **cross-city aggregates are indicative,
  not measured**, and must carry that caveat wherever they are carried at all.

**Reporting rule (standing).** Never report documents written, ADRs created, investigations completed or
datasets found **unless they change a measurable capability**. Every entry answers: *did PRYZM become
capable of generating more envelopes?* If not, it is **support work** and is labelled as such — support
work is legitimate and is not hidden, it is just not progress.

---

## §3 — How work enters the roadmap

### §3.1 — The intake gate — five questions, in order
No item is scheduled, sized or discussed as work until all five are answered **in writing on the item**:

1. **Which C64 layer is it?** (§3 of C64.) An item that cannot be placed in exactly one layer is
   mis-scoped and is split.
2. **Which ordinance VARIABLE does it unblock?** Not which city. A city is a set of bindings
   (C64 §1.3); *"improve Madrid"* is not an item.
3. **What is its blocker class?** Exactly one of `Legal · Engineering · Data acquisition · External
   authority`, with one named owner and one third-party-checkable exit criterion.
4. **Has Stage 0 run?** For anything that *derives, constructs, reconstructs, approximates or digitises*,
   a dated Stage 0 record must exist in the affected cities' `findings/` with a **proven** negative
   (C64 §2.6). Without it the item is **unsized**, not ready.
5. **How many municipalities does it improve?** One is a red flag, not a disqualification — but a
   single-city capability must justify itself against the register's ranked national dependencies.

### §3.2 — Only `Engineering` enters sprints
Founder rule. `Legal`, `Data acquisition` and `External authority` items become **tracked dependencies**
on the External Dependency Board (§6.3) with a named owner and an exit criterion. They are reported every
cycle and they consume **zero** sprint capacity.

⚠ **This will remove most of the remaining opportunity from the sprint board, and that is the point, not
a problem.** The register's ranked dependency matrix (D5) is the evidence; read the ranking there, do not
restate it here.

### §3.3 — `Legal` freezes the engineering it gates
Per the blocker standard. Engineering effort is not spent solving a problem the ordinance may prohibit.
The freeze lifts on a verbatim reading of the primary source naming which provision governs — either
outcome unblocks, because a "no" is itself the product's answer.

### §3.4 — Category migration is a claim
Changing an item's blocker class requires cited, dated, inspectable evidence, and the record states the
**old** category and why it was wrong. Silent migration is how a solved question is re-opened and how a
false blocker survives.

---

## §4 — Prioritisation

Items are ranked by **national unlock**, not by city, not by size, not by readiness.

| Rank input | Definition | Source |
|---|---|---|
| **Blocked land** | measured land whose envelope this variable currently blocks, counted **once**, against its *binding* blocker | register D2 / D5 |
| **Municipality fan-out** | how many municipalities the same capability improves once shipped | register D5 |
| **Tier delta** | whether the item raises the confidence tier or only the coverage | C58 §1.6 ladder |
| **Class** | `Engineering` only, per §3.2 | the item's classification |
| **Stage 0 state** | `passed` (negative proven) / `pending` (⇒ unsized) | the city's `findings/` |

**The four disqualifiers.** An item is **not** scheduled if it: solves exactly one city with no fan-out
path; would construct what an unrun Stage 0 might find published; would raise a metric by redefinition
rather than by capability; or would publish an upper bound without its binding constraint (C64 §5.2).

**A release candidate never moves backwards.** Once a city ships it stays shipped; a later city's
findings become **new work on the next release**, never a rollback — unless the finding is a *correctness*
defect in what shipped, which is a defect event and is handled as one.

**Release order** (founder, ordered by *dependency*, not size — a city's position is a scheduling fact,
not a judgement on its work):

`Murcia` → `Madrid RC-1 (SIG-M1)` → `Córdoba` → `Madrid NZ-3 (if legally authorised)` → `València`

---

## §5 — The Envelope Production Queue (EPQ)

The single ordered object the programme works from. One row per **capability**, never per city.

### §5.1 — The object
```ts
EnvelopeProductionQueueItem {
  id:                 string              // stable, cited in commits and in the dashboard
  capability:         string              // what is BUILT — e.g. "variable dependency graph"
  compilerLayer:      0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8      // C64 §3 — exactly one
  variables:          VariableId[]        // which ordinance variables this unblocks
  blockerClass:       'legal' | 'engineering' | 'data-acquisition' | 'external-authority'
  owner:              string              // a named party. `unassigned` is a defect
  exitCriterion:      string              // third-party-checkable; "investigate further" is not one
  stage0:             { state: 'passed' | 'pending' | 'not-applicable', evidence: RepoPath | null }
  municipalities:     JurisdictionId[]    // fan-out — the anti-one-off gate
  blockedLandRef:     RepoPath            // ⚠ a POINTER to the measurement, never a transcribed figure
  tierEffect:         'new-coverage' | 'tier-upgrade' | 'correctness' | 'none'
  state:              'queued' | 'in-sprint' | 'shipped' | 'tracked-dependency' | 'not-scheduled'
  notScheduledReason: string | null       // required whenever state === 'not-scheduled'
  measuredEffect:     RepoPath | null     // set ONLY after re-measurement (§8.1)
}
```

### §5.2 — Queue rules
- **R1** — `blockedLandRef` and `measuredEffect` are **repo paths**, never numbers. The queue is a
  scheduling object; measurements live in the measurement records (C64 §2.13).
- **R2** — `state: 'in-sprint'` requires `blockerClass === 'engineering'` **and** `stage0.state !== 'pending'`.
- **R3** — `state: 'not-scheduled'` requires a `notScheduledReason`. **A silently dropped item is the
  failure mode this queue exists to prevent** — an explicit *"not scheduled, because it solves one city"*
  is a decision; an empty row is drift.
- **R4** — `measuredEffect` is set **only** after §8.1 re-measurement. A shipped item with a null
  `measuredEffect` is `shipped` but **unproven**, and is reported that way.
- **R5** — Rows do not re-open without new evidence (the register rule), and a decision already in the
  DECISION-REGISTER is not re-litigated through the queue.

### §5.3 — The Stage 0 pass (the gate, not the protocol)
The **protocol and its tooling are specified separately** (Dataset Discovery Protocol, in authoring; C64
layer 4). This SPEC binds only the gate's shape:

- **one-shot and time-boxed**, with a written exit criterion, concluded **once**;
- every probe records **URL · HTTP status · content-type · byte count**;
- **failure ≠ empty** — a `403 / 499 / timeout / DNS error` is `Unknown`, never *"no data"*;
- **verify spatial extent before believing a service name** (an acronym collision put a candidate service
  on another continent);
- **an empty result must survive alternate axis orders and CRS** before it is believed;
- **a plausible proxy is not a source** — a believable number from the wrong legal object is the trap;
- **probe the artefact, not its container** — a directory index's status is not the document's status;
- the negative is **recorded with evidence** in the city's `findings/`, dated, and is what §3.1(4) reads.

---

## §6 — How progress is reported

### §6.1 — The dashboard is the face; this SPEC is the method
The [PEC-EXECUTION-DASHBOARD](../plans/PEC-EXECUTION-DASHBOARD.md) is the **single reporting surface**.
Rules that bind it:

- **Unmeasured is printed as `—`, never as a number**, with the reason. A dashboard carrying illustrative
  figures as if they were measurements is the exact failure this programme exists to prevent.
- **Determination is always split** by C64 §5 kind (C64 §2.12).
- **Every figure is cited to the artefact that computed it**, and every aggregate carries its denominator.
- **No document other than the dashboard and the measurement records holds a figure.** Contracts, specs,
  ADRs and master docs carry pointers.

### §6.2 — The weekly delta — five questions, answered every cycle
1. What new envelopes became generatable?
2. Which variables became resolved — and at which tier?
3. Which capability improved, and in how many municipalities?
4. Which blockers disappeared — **engineering only**, and which were `Superseded` rather than `Closed`?
5. What is the next biggest unlock, and what is its blocker class?

### §6.3 — The External Dependency Board
Every `Legal` / `Data` / `External authority` item, with owner, exit criterion, and the land it locks
(**by pointer**). Reported every cycle precisely so it is visible **without** consuming sprint capacity.
An item's presence here is not a failure — three of the programme's own top dependencies live here, and
no amount of engineering accelerates them.

### §6.4 — Gates closed, not percentages moved
> *"Judge progress by **gates closed**, not by lines of code, datasets found, or percentages. Every week
> should permanently eliminate one decision from the board."*

**The five release gates** (owners and exit criteria: BLOCKER-CLASSIFICATION-STANDARD):
**1** Murcia — engineering completion · **2** Madrid — SIG-M1 certification · **3** Madrid — the article
memorandum, a **binary** legal outcome · **4** Córdoba — the one-shot GIS sweep, a one-page conclusion ·
**5** València — the authority response on annotation semantics, **no intermediate reviews**.

⚠ **No gate has a percentage in its exit criterion, deliberately.** Coverage is an output; a gate is a
decision. The programme completes when the decisions are gone.

---

## §7 — How effort is measured

### §7.1 — Effort is measured in capability, not in cities or in output volume
- **Capability Reuse** — municipalities improved per capability shipped. This is the anti-one-off gate and
  it is the number that decides whether a capability belonged in the core.
- **Engineering ROI** — Δ ECC per engineering month. ⚠ Where the measured cities' remaining engineering
  headroom is small, **the correct response is to measure city N+1, not to keep optimising the five.**
  The metric is designed to force the programme outward.
- **Support work is labelled, not hidden.** ADRs, registers, standards and probes that change no
  capability are reported as support — and one of them (the Stage 0 invariant) paid for itself repeatedly
  before it was built, which is exactly why the category exists rather than being suppressed.

### §7.2 — Every claim states its `N`
A ceiling, a rate or a distribution asserted from a sample states the sample size, and says so in the row
if it is small. **A ceiling asserted from a sample is not a ceiling** — one such claim reached shipped
code and blocked a capability that was not blocked.

### §7.3 — The `Superseded` sweep (mandatory, every cycle)
Per the blocker standard's formal distinction: **Closed** = the investigation reached its expected
conclusion; **Superseded** = the investigation showed the original assumption was false.

> **"Superseded generates institutional learning. Closed does not."**

Every cycle, for each `Superseded` item: (a) record it explicitly as superseded, with the refuted premise
verbatim; (b) **grep the repo for the refuted claim and fix every copy**, including code comments and
resolver docstrings; (c) name the artefacts corrected. A refuted claim that survives in one artefact
**will** be re-inherited — each of this programme's stale claims propagated across multiple artefacts and
at least one was still live in a production resolver's comment after the refutation was published
(audit **L-685**).

---

## §8 — How success is validated

### §8.1 — Ship → re-measure → publish, in that order
No capability is `shipped` in the queue until it has been **re-run across every affected municipality**
and re-measured through the **production** resolvers against the live sources. The measurement record is
updated; the dashboard reads it. **Publish the measured realised share, never the arithmetic maximum** —
upper bounds are internal planning numbers.

### §8.2 — Migration parity is a hard gate
A city's published determinations must reproduce **byte-identically** through any new compiler layer
before that city is migrated (C64 §1.4). A moved number is a correctness event.

### §8.3 — Refusal correctness is audited, not asserted
A refusal audit is run on a stated sample per city: verify that the cited article actually terminates
that parcel; report sample · correct · incorrect · unverifiable. **An incorrect refusal is a defect of the
same class as an over-granted envelope.** Refusal correctness has never been measured in this programme —
it has only been asserted (dashboard §REFUSAL CORRECTNESS).

### §8.4 — The Envelope Completion Index (ECI) — per parcel
The per-parcel diagnostic that makes §1.2 of C64 checkable. Every stage is set for every compiled parcel;
a stage that cannot be evaluated is `unknown` with a typed reason, never silently skipped.

```
EnvelopeCompletionIndex {
  parcelContext:      'resolved' | 'partial' | 'failed'                   // layer 0
  legalStack:         'resolved' | 'ambiguous' | 'unresolved'             // layer 1
  variablesResolved:  { n: int, of: int, blocking: VariableId[] }         // layers 2-3  ⟵ the payload
  constraintsApplied: { n: int, of: int, unknownOverlays: OverlayId[] }   // layer 6
  envelopeGenerated:  'yes' | 'no' | 'intervention-ceiling-only'          // layer 7  ⚠ THREE states
  evidenceComplete:   boolean   // every numeric constraint has a DerivationEntry with an ordinanceRef
  explainability:     'per-constraint' | 'per-face'                       // layer 8
  determination:      EnvelopeDetermination | null                        // C64 §5, null iff envelope
}
```

**The rule that makes it worth building.** The product output must be *"blocked ONLY by `storeys`, which
is blocked by `streetWidth`, which is blocked by `alignment`, for which no authoritative layer is
published"* — **never** *"cannot compute"*. That chain is compiler layer 2, and it is the single most
user-visible thing missing.

⚠ **`envelopeGenerated` has three states, not two**, and `intervention-ceiling-only` **never** aggregates
into ECC (C64 §5.2).

### §8.5 — The KPI set
Tracked every cycle, defined in the register (D8) and computed onto the dashboard. Where a KPI is not yet
measurable, it is printed `—` with the reason and the capability that would make it computable —
**never estimated**:

`Envelope Completion Coverage` ⭐ · `Determination Coverage` (split) · `Variable Resolution Coverage`
(needs layer 2) · `Dataset Discovery Success` (needs layer 4) · `Capability Reuse` · `Engineering ROI` ·
`Unknown Reduction` · *`Intervention-Ceiling Coverage`* (separate, gated on an ADR).

⚠ **`Unknown Reduction` must fall for the right reason.** One city's *data-unavailable* bucket was
correctly emptied without the envelope metric moving at all — the finding was real, the coverage was not.
A metric that improves without a capability improving is a reporting artefact.

---

## §9 — The sprint loop

> *select the highest national-impact dependency → classify → design **one generic resolver** → validate
> in **one reference city** → integrate into core → **re-run every municipality** → measure → repeat.*

⚠ **A reference city is not a target.** Its remaining derivable work is worth what it is worth; score it
that way and do not let familiarity substitute for national impact.

**Phase shape** (capability-ordered, never city-ordered; the ranked content lives in register D9):
`Phase 0` stop-and-correct — zero engineering, correct what is known wrong ·
`Phase 1` the discovery gate (layer 4) ·
`Phase 2` the missing compiler layers (3, then 2) ·
`Phase 3` the top-ranked national rate limiter ·
`Phase 4` the fan-out node ·
`Phase 5` correctness on what is already drawn ·
`Phase 6` scale beyond the measured cities — **the whole national thesis** ·
`Phase 7` product honesty on terminal land (the missing `legally-delegated` tier).

---

## §10 — Acceptance criteria for this SPEC

1. Every queue item carries all five §3.1 answers, or it is not on the queue.
2. No item is in a sprint whose class is not `Engineering` and whose Stage 0 is `pending`.
3. Every shipped item has a `measuredEffect` pointer, or is reported as **unproven**.
4. Every cycle publishes the §6.2 five questions and the §7.3 `Superseded` sweep.
5. No figure appears in this SPEC, in C64, or in any master document — only pointers (C64 §2.13).
6. Every non-envelope outcome in every reported territory is classified into exactly one C64 §5 kind, and
   the five sum to the whole non-envelope denominator with no residual.
