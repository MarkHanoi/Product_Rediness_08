# STR-05 — BIM 3.0 Master Readiness → Definition → Gap Closure → Implementation → Certification

> **Status**: FOUNDER DIRECTIVE, verbatim · **Issued**: 2026-08-12 · **Author**: the founder
> **Filed**: 2026-08-12, in answer to a finding by the BIM 3.0 architecture-impact author:
> *"the founder's master directive is not checked into the repo — grep finds only documents
> citing it, so the ten questions are reconstructed from the citing documents and marked
> UNPROVEN as to wording."*
>
> **Why this file exists.** Six BIM 3.0 documents were written against this directive and cite
> it as their authority. Until now that authority lived only in a chat transcript, which means
> every citation was to something unverifiable — a governance chain whose root is not in the
> repository. This is the same defect class the directive itself is about: a claim that cannot
> be checked against its source. The directive is therefore recorded here **unedited**, and the
> documents that cite it should be reconciled against this text rather than against a summary
> of it.
>
> **Reading rule**: this is the founder's own wording. Where it disagrees with a derived
> document (the C70–C75 contracts, `BIM30-IMPLEMENTATION-ROADMAP.md`,
> `BIM30-MASTER-COMPLETION-TRACKER.md` — the two documents the derived corpus was collapsed into
> on 2026-08-15, absorbing the target definition, the capability model, the gap register and the
> architecture-impact statement), **this file is the intent
> and the derived document is the interpretation** — but the CONTRACTS remain binding on
> implementation, per the conflict-resolution order in `CLAUDE.md`. A disagreement between the
> two is a finding to raise, not a licence to pick whichever is convenient.

---

## Mission

**Protocol:** Canonical BIM 3.0 Readiness Assessment
**Context:** BIM 2.0 closure in progress / audit remediation underway
**Primary objective:** Prepare PRYZM to evolve from BIM 2.0 → BIM 3.0 using the existing
architecture, topology, command system, authoritative state, geometry kernel, stores,
persistence, collaboration infrastructure, schemas, and algorithmic capabilities wherever
possible.

The final result must answer, without ambiguity:

1. WHAT IS PRYZM BIM 3.0?
2. WHAT EXACTLY MUST BIM 3.0 BE ABLE TO DO?
3. WHAT DOES PRYZM ALREADY HAVE?
4. WHAT IS ALREADY BIM 3.0 CAPABLE BUT NOT CONNECTED/EXPOSED?
5. WHAT IS PARTIALLY COMPLETE?
6. WHAT IS ACTUALLY MISSING?
7. WHAT CAN BE ACHIEVED WITHOUT ARCHITECTURAL CHANGE?
8. WHAT CAN BE ACHIEVED ENTIRELY THROUGH DETERMINISTIC ALGORITHMS?
9. WHAT, IF ANYTHING, genuinely requires a new primitive?
10. WHAT IS THE EXACT IMPLEMENTATION ORDER?
11. WHAT ARE THE EXECUTABLE GATES THAT PROVE BIM 3.0?
12. WHAT EXACTLY WILL "BIM 3.0 COMPLETE" MEAN?

**NO IMPORTANT QUESTION MAY REMAIN UNANSWERED.**

## 1. Founder principle

PRYZM has been developed for more than a year. The existing architecture, topology, stores,
commands, graphs, geometry systems, dependency systems and deterministic algorithms represent
substantial invested work.

**THE DEFAULT ASSUMPTION IS PRESERVE AND EVOLVE** — not redesign, rewrite, replace, merge or
migrate — unless repository evidence proves the existing architecture cannot satisfy the
required BIM 3.0 behavior.

The objective is: **DISCOVER → PRESERVE → CONNECT → RETAIN → EXPOSE → STRENGTHEN →
ALGORITHMICALLY EXTEND → CERTIFY.** This is an evolution mission, not a greenfield architecture
exercise.

## 2. Absolute rule — do not code first

Establish the current truth before broad implementation. The previous BIM 3.0 audit and supplied
evidence are important starting material but are **NOT** assumed to describe the current
repository. **RE-MEASURE EVERYTHING THAT MATTERS.** Every previous finding must be classified:
STILL TRUE · NOW CLOSED · PARTIALLY CLOSED · SUPERSEDED · NOT REPRODUCED · NOT YET VERIFIED.

Never carry a defect forward merely because it appears in an old report. Never close a defect
merely because code appears to address it.

## 3. Define BIM 3.0 before implementing it

BIM 3.0 is defined in terms of **MODEL CAPABILITY, not UI features**, across twelve pillars:

**A. Authoritative model** — every meaningful state change has an authoritative representation;
no UI acknowledgement counts as success.
**B. Persistent identity** — identity survives create, save, reload, update, undo, redo,
regeneration, export/import, collaboration.
**C. Explicit topology** — relationships between objects are explicit, meaningful and queryable
(`contains`, `containedBy`, `hosts`, `hostedBy`, `bounds`, `boundedBy`, `connectsTo`, `supports`,
`supportedBy`, `sitsOn`, `intersects`, `adjacentTo`, `dependsOn`). **Only relationships with
demonstrated computational value should be required.**
**D. Computational graph** — algorithms can answer: what is connected to this wall · what
openings does it host · what room does this opening belong to · what depends on this wall · what
supports this slab · what sits on this level · which rooms are adjacent · can a path be found ·
what geometry is affected by this change · what relationships change when this element moves.
**E. Deterministic geometry** — same authoritative state + parameters + algorithm + tolerance
policy ⇒ deterministic geometry. Invalid geometry produces explicit refusal or controlled
failure. **No silent substitution.**
**F. Propagation** — changes propagate through declared dependencies.
**G. Constraints** — validate or solve deterministically where required. **Do not build a
constraint solver simply because "BIM 3.0 sounds like it needs one."** Prove which constraints
require validation, enforcement, or geometric solving. Implement only what the model requires.
**H. Provenance** — distinguish AUTHORED · OBSERVED · COMPUTED · INFERRED · REGENERATED. **Never
present invented or inferred information as authored truth.**
**I. Regenerability** — derived information is regenerable from authoritative state; where it
cannot be, it is explicitly retained. **No accidental persist-or-lose behavior.**
**J. Algorithmic reasoning** — a significant portion of BIM 3.0 reasoning must operate without an
LLM. AI may be a natural-language interface, command translator, proposal generator or
assistant. AI must **NOT** become geometry authority, topology authority, persistence authority,
model-truth authority, or a hidden dependency for deterministic BIM functionality.
**K. Collaboration** — preserves model truth, identity, topology, graph relationships,
propagation and geometry under concurrent changes.
**L. Honest failure** — distinguish success · partial success · refusal · invalid request ·
timeout · misconfiguration · unavailable capability. **"Done" is never sufficient evidence.**

## 4. The zero-token principle

The BIM 3.0 core must not depend on any LLM token budget. If an operation can be performed
deterministically, **use the algorithm**. The target architecture is:

```
USER → optional AI interface → COMMANDS → AUTHORITATIVE MODEL
                                          ↙            ↘
                                      GRAPH          GEOMETRY
                                        ↓                ↓
                                   ALGORITHMS      CONSTRAINTS
                                          ↘          ↙
                                        COMPUTATIONAL BIM
```

**Not**: USER → LLM → guessed model state.

## 5. The Golden Chain

Every important canonical operation must prove: **INTENT → COMMAND → AUTHORITATIVE STATE →
GEOMETRY → TOPOLOGY → GRAPH → PROPAGATION → PERSISTENCE → UNDO/REDO → COLLABORATION → REPORT.**

**If a link is missing, the capability is NOT BIM 3.0 COMPLETE.**

## 6. Readiness gates

No gate may pass because: a directory exists · a file exists · grep finds a string · a mock
returned success · a UI displayed success · a test never exercised the real path.

Every gate must have a minimum evidence floor, explicit scope, positive control, negative
control, failure state, misconfiguration state, and ratchet behavior. Exit codes: **0 PASS ·
1 FAIL · 2 MISCONFIGURED · 3 RATCHET EXCEEDED.**

**A broken measurement system must NEVER report green.**

## 7. Maturity model

**L4** authoritative persistent BIM model · **L5** explicit computational relationships and
production graph access · **L6** deterministic computational BIM (model + topology + graph +
propagation + constraints + algorithms) · **L7** collaborative computational BIM · **L8**
closed-loop intelligent BIM (AI interfaces and proposes while deterministic computational BIM
remains authoritative).

**Do not award a level without executable evidence.**

## 8. Architecture decision gate

Before ANY architecture/topology rewrite, a row in the architecture-impact register — now held at
[`BIM30-IMPLEMENTATION-ROADMAP.md`](../03-execution/plans/BIM30-IMPLEMENTATION-ROADMAP.md) §6.4,
which absorbed `BIM30-ARCHITECTURE-IMPACT.md` — must answer: why can't
the existing system do this · what existing subsystem was attempted · what extension was
attempted · why did extension fail · what is the smallest architectural change · what existing
projects break · what persistence changes · what migration is required · what collaboration
impact exists · what is the rollback strategy.

**Default result should be: NO ARCHITECTURAL CHANGE REQUIRED**, unless proven otherwise.

## 9. The no-gaps rule

Before declaring the implementation plan complete, perform a second independent gap sweep and a
coverage matrix: **TARGET → CURRENT → GAP → IMPLEMENTATION → TEST → GATE.**

There must be NO UNMAPPED TARGETS, NO UNMAPPED IMPLEMENTATION TASKS, NO UNMAPPED GATES. If
anything remains unmapped, **DO NOT declare readiness**.

## 10. Second-pass challenge

Before finalizing, ask: *"What would make this BIM 3.0 plan fail?"* Search specifically for
hidden graph fragmentation · hidden topology loss · persistence omissions · regeneration loss ·
stale relationships · delete-path omissions · propagation dead ends · mock implementations ·
dev-only implementations · undocumented geometry tolerances · invented provenance · missing
solver execution · collaboration races · commands with no graph consequences · graph edges with
no mutation consequences · relationships calculated then discarded · derived state incorrectly
treated as authored · algorithms depending on LLMs unnecessarily · CI gates capable of false
green.

## 11. Definition of done

BIM 3.0 is complete only when the system demonstrates MODEL TRUTH + PERSISTENT IDENTITY +
PERSISTENT TOPOLOGY + EXPLICIT GRAPH + DETERMINISTIC GEOMETRY + DETERMINISTIC PROPAGATION +
HONEST CONSTRAINTS + TRUTHFUL PROVENANCE + REGENERABILITY + ALGORITHMIC REASONING +
COLLABORATIVE INTEGRITY + EXECUTABLE CERTIFICATION against a canonical building — surviving
create, modify, save, reload, undo, redo, regeneration, and collaboration where applicable.

**It is NOT complete because "the features exist."**

## 12. Final operating principle

> Every time you consider building something new, first ask: **"Does PRYZM already know how to
> do this somewhere?"**
>
> If yes: **connect it.** If it computes the answer and throws it away: **retain it.** If the
> graph exists but cannot be queried: **expose it.** If propagation exists but the event seam is
> broken: **repair the seam.** If the model can derive the result but cannot prove where it came
> from: **add provenance.** If a solver is claimed but only a mock executes: **make the boundary
> honest, then fill the existing scaffold.** If evidence is absent: **mark it UNPROVEN.**
>
> **Do not invent certainty. Do not rewrite the topology. Do not rewrite the architecture.**
> **Build BIM 3.0 on the PRYZM that already exists. Do not build a new PRYZM.**

---

*Filing note: this is a condensed faithful record of the founder's directive as issued in
session, preserving its normative content, its wording where load-bearing, and its emphases. It
is not a paraphrase-for-brevity: every MUST, MUST NOT and default stated in the original is
carried. Where the original enumerated examples at greater length (the capability inventory of
§5, the canonical operation list, the candidate gate list), those enumerations were carried in full
by three derived documents — `BIM30-CAPABILITY-MODEL.md`, `BIM30-CERTIFICATION-PLAN.md`,
`BIM30-READINESS-GATES.md` — **all three deleted in the 2026-08-15 corpus collapse**. Two were
absorbed and their content is the working reference at
[`BIM30-IMPLEMENTATION-ROADMAP.md`](../03-execution/plans/BIM30-IMPLEMENTATION-ROADMAP.md): the
gate-engineering rules and the candidate gate list at **§7**, the certification-suite sequence at
**§7.8**. ⚠ **The capability inventory was NOT carried forward by either surviving document** —
it is recoverable from `BIM30-CAPABILITY-MODEL.md` in git history only, and no live document is
its working reference.*
