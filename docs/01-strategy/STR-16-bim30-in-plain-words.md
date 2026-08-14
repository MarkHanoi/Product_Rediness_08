# STR-16 — BIM 3.0 in plain words: what it is, what it buys, and what it does not

> **Stamp**: 2026-08-14 · **Status**: CANONICAL
> **Authority**: subordinate to [STR-01-manifesto.md](./STR-01-manifesto.md), [STR-02-product-vision.md](./STR-02-product-vision.md) and [STR-03-engineering-vision.md](./STR-03-engineering-vision.md). **Defers entirely to [C70](../02-decisions/contracts/C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) on what BIM 3.0 IS** — this document restates none of C70's invariants, it translates them. Where this document and C70 disagree, **C70 wins**; where this document and a gate run disagree, **the run wins** (C70 §0.2).
> **Scope**: the founder-facing, non-engineer explanation of the BIM 3.0 programme — what the target means, why the reporting is worded the way it is, what the two halves of "100 %" buy, what a user can do today, and what the twelve pillars mean in one sentence each. It exists because that explanation was reconstructed from scratch three times in three sessions and lost each time.
> **What this document is NOT**: a status board. It carries **no counted figure**, by rule (§0.1). The counted figure lives in [`BIM30-GAP-REGISTER.md`](../04-reference/BIM30-GAP-REGISTER.md) §9.0 and in the gates.
> **Origin**: founder question, 2026-08-14 — *"in plain words, what has been done, what are we meant to do, what is in Half 1 and Half 2, and what would the user gain?"*

---

## §0 — How to read this document

> **§0.1 — MUST NOT transcribe a measured figure into this file.** C64 §2.13 and C69 §0.1 bind
> the whole `docs/` tree: no coverage, completion or capability count may be copied into a
> governed document — cite the artefact that computes it. This document therefore names
> *instruments*, never numbers. When a percentage is wanted, run the gate. The one exception is
> a figure quoted **as a dated example of a shape**, and every such quote below says so in place.
>
> The reason is not pedantry. This repository has measured the cost twice: a forecast of "~74 of
> 82 rows closable" was **23 rows high** because it counted rows for which *a lane had produced
> evidence* rather than rows for which *the recount had re-run the gate*
> ([`BIM30-NEXT-SESSION-BRIEF.md`](../03-execution/plans/BIM30-NEXT-SESSION-BRIEF.md) §12.7). A
> plain-words document is exactly where a stale number does the most damage, because it is the
> document a non-engineer quotes.

> **§0.2 — MUST.** This document is a translation layer. Every claim in it must be traceable to a
> contract clause or a named instrument. If a sentence here cannot be traced, it is an opinion and
> must be marked as one.

---

## §1 — What BIM 3.0 is, said once, plainly

**BIM 2.0 — Revit, ArchiCAD — is a very good database of a building.** It holds objects, and it
usually gets the relationships between them right, because those relationships are hard-coded into
the software. You trust it because it mostly works. When it does not work, it fails *quietly*: a
schedule shows a stale area, a door ends up in a wall that has moved, and nothing tells you.

**BIM 3.0 is a building model that can reason about itself and never bluffs.**

C70 §1.1 states it as a testable claim: a persistent, authoritative, identity-preserving model whose
topology is *explicit*, whose geometry is a deterministic *consequence* of model state, whose
relationships are computable by algorithms, whose changes propagate deterministically, whose every
datum knows how it came to be known — and which **refuses honestly** where it cannot answer.

> **The last clause is the whole personality of the thing.** In BIM 2.0, an empty answer and
> *"I don't know"* look identical. In BIM 3.0 they must never look alike. Nearly every defect this
> programme has closed is one instance of that single sentence.

### §1.1 — The unusual second rule: the AI sits beside you, above the model

C70 §1.3, from the founder: *"The LLM may sit above the computational model, not underneath it."*
Nothing an LLM emits becomes model truth until it passes through the same command path, the same
constraints, the same provenance and the same refusals as a human click.

The test is brutal, and PRYZM already passes it: **remove the AI entirely and the system must lose
conversation and nothing else.** Production deploys carrying no AI key while every generation engine
still runs are the standing proof. C70 calls this *"a property to be kept, tested, not admired"* —
it is not a feature to build, it is a property to defend.

---

## §2 — The Golden Chain, and why nothing here ever reads "90 % done"

C70 §3.1 fixes eleven links. A capability is real only if it holds along **all** of them:

```
intent → command → state → geometry → topology → graph
      → propagation → persistence → undo/redo → collaboration → report
```

A wall-move that updates the drawing but strands the schedule is **not** "working with a known
issue". It is a broken chain (C70 §3.2, the no-partial-credit rule).

This is why the programme's own reporting sounds severe, and the severity is deliberate: it is the
rule that stops *"we have no collaboration server"* from quietly reading as *"collaboration is
fine"* (C70 §3.4). A link that has not been executed reads **UNPROVEN** — neither a pass nor a fail,
and it must look different from both (C70 §2.2).

---

## §3 — The two halves of "100 %"

The programme's own definition of done has two halves, and they buy different things. Conflating
them is the single most common misreading of the status.

### §3.1 — Half 1: "stop lying" — the register rows

The gap register is a list of specific places where the product was caught doing one of four things:

1. silently **guessing**;
2. silently **dropping** something;
3. returning an **empty answer that actually meant "I never checked"**;
4. **claiming a capability** nobody had ever run.

**What finishing it buys the user:** when you do something, PRYZM either does it correctly or tells
you exactly what it could not do and why. Areas in schedules match the geometry. Exports match the
model. A colleague's edit is never silently discarded. **You can sell from the model** — quote a
number to a client and defend it.

**What it does not buy: any new design ability.** A typology PRYZM cannot design today, it still
cannot design at 100 % of Half 1. That capability lives in the typology packs and the executors —
a different axis with its own roadmap ([typology-expansion-roadmap](../03-execution/plans/typology-expansion-roadmap.md)).

*Instrument*: [`BIM30-GAP-REGISTER.md`](../04-reference/BIM30-GAP-REGISTER.md) §9.0 — the counted
status distribution, re-stamped only from executed gate runs (its own §0.0 rule 2).

### §3.2 — Half 2: "know what your change breaks" — bar 3

There is a set of things a user can do that change the model (move a wall, delete a door, add a
floor, reshape a room), and a set of relationship kinds in the model (*this wall bounds this room*,
*this door is hosted in that wall*, *this slab sits on that level*). The product of the two is a grid
of questions of exactly one shape:

> **"When the user does X, what happens to relationship Y?"**

C78 §1.3 admits exactly three legal answers — **DETERMINED-affected**, **DETERMINED-unaffected**, or
**UNDETERMINED with a typed reason** — and no fourth. Today the overwhelming majority of that grid is
the fourth answer: **silence**. The system performs the change and simply does not consider what was
attached.

**Plainly: PRYZM can *make* a design far better than it can *change* one.**

That is why every *"improve this / convert this / extend this / combine these"* request is a no
today. The system cannot work out what the change breaks, so it either regenerates from scratch and
discards your work, or leaves stale artefacts behind.

*Instrument*: `tools/rac-conformance/certification/gates/check-relationship-determination.ts` and its
named ledger `relationship-determination.json`. C78 §19.1 forbids partial credit across the product,
so this lands **by verb family**, each family whole.

### §3.3 ⚠ The caveat that must travel with §3.2

**Bar 3 makes a modification SAFE. It does not decide WHAT to change.**

[C81 §0.2(b)](../02-decisions/contracts/C81-DESIGN-EDIT-AND-INTENT-PRESERVATION.md) states this as a
correction, in writing, to an earlier planning sentence that said finishing bar 3 would flip the
modification scenarios on its own. It would not. Knowing that *"convert this 2-bed to a 3-bed"* means
*split the larger bedroom, relocate one door, re-route the corridor, preserve the wet stack* is not a
relationship question and appears in **no cell** of the grid. It is a separate engine — C81's edit
layer — which is **blocked on bar 3** (C81 §8.1) and is not built.

**Both are needed. Neither substitutes for the other.** A plan that schedules only bar 3 and expects
the modification scenarios to turn green has mis-scoped the work by exactly one layer (C81 §10.n).

---

## §4 — What the user actually gains

### §4.1 — Working today, in production

- **Pick a real plot** anywhere there is a rule pack — real terrain, real neighbours, real cadastral
  parcel (C57, C60).
- **Get a legally reasoned building envelope**, or an honest refusal naming the missing instrument.
  Per C58 §1.4 and C63, **a refusal is a correct answer here, not a failure.**
- **Generate** a house, an apartment, a residential building or an office inside it — with
  rule-checked rooms, furniture, ceilings and lighting (C50, C53).
- **Real analysis, computed not estimated** — daylight and solar hours (C21 §10).
- **Move a wall and the slab follows** — both the drawn mesh and the recorded area.
- **Move a wall carrying a floor finish or ceiling and it re-projects, once.**
- **A house that ships with a sealed room raises a blocking banner naming the rooms**, instead of a
  green success toast (SPEC-49 CI-1).
- **Two people editing**: a merge that would discard someone's authored change produces a visible
  conflict rather than a silent overwrite (C08 §3.2, P8).
- **A ribbon button that is not backed by anything is visibly disabled with a reason**, never a
  silent no-op (C82 §1.1).

### §4.2 — What Half 1 at 100 % adds

Trust, everywhere. Every edit propagates or refuses honestly. Every number knows whether a human
typed it, a source of record supplied it, or the machine computed it — and C75 §1.2 forbids merging
the last two. Nothing is silently wrong anywhere in the model.

### §4.3 — What Half 2 at 100 % adds — the commercial half

These stop being "no":

- *"Make this 2-bed a 3-bed in the same envelope."*
- *"Extend this house 25 m² into the garden."*
- *"Add two floors and keep the façade language."*
- *"Combine these two apartments and reuse the wet areas."*
- *"Improve this layout without breaking the core and grid."*

**An architect's week is mostly modification, not generation.** You do not design a building once;
you iterate it fifty times. That is the difference between a product that wins a demo and one that
wins a renewal. The full scenario-by-scenario assessment is
[`BIM30-NEXT-SESSION-BRIEF.md`](../03-execution/plans/BIM30-NEXT-SESSION-BRIEF.md) §9 — read it there
rather than restating its verdicts here.

### §4.4 — Collaboration is a purchase decision, not an engineering one

Measured 2026-08-14, and it surprised everyone: **the code half is done.** The client provider seam
is wired end to end, the WebSocket-upgrade auth is fail-closed, `PgAuthz` is written, wired, tested
and fail-closed, and a two-client convergence gate runs green over real crossings.

What is missing is **one always-on process** and **one environment-variable flip**
(`PRYZM_AUTHZ_MODE` off its permissive default, plus `DATABASE_URL` on the sync-server). It is the
cheapest capability on the board by an order of magnitude, and it waits on a decision, not a sprint.

⚠ Until it runs, the correct word is **UNPROVEN, not failing** — and
[C66 §1.1](../02-decisions/contracts/C66-CONCURRENCY-AND-SCALE.md) explicitly forbids describing any
user-count tier as *supported* while its status is CLAIMED.

---

## §5 — The twelve pillars, one sentence each

C70 §2 owns the invariants; this table owns the translation. **It carries no standing** — the
standing is measured, and a status column here would rot within the week (C70 §0.2). To read the
current standing, run the gate named in C70 §7's table.

| Pillar | In plain words |
|---|---|
| **A — Authoritative model** | There is one truth, not five copies of it |
| **B — Persistent identity** | Your wall is still the same wall after a save, a reload and an undo |
| **C — Explicit topology** | The model *knows* this wall bounds this room; it does not re-guess it |
| **D — Computational graph** | You can ask the model questions and get typed answers or typed refusals |
| **E — Deterministic geometry** | The same model produces the same geometry, every time, on any machine |
| **F — Propagation** | Change something and its dependents follow — or say, by name, that they cannot |
| **G — Constraints** | The rules are real rules, and a refusal names the rule and **both numbers** |
| **H — Provenance** | Every number knows where it came from, and a guess is never dressed as a fact |
| **I — Regenerability** | Throw away every drawing and rebuild from the model — nothing is lost silently |
| **J — Algorithmic reasoning** | Remove the AI and you lose conversation, nothing else |
| **K — Collaboration** | Two people edit and nothing is silently lost |
| **L — Honest failure** | An empty answer never means *"I don't know"* |

---

## §6 — The ordering, and why it is this ordering

This section is **opinion derived from measurement**, and says so. It records *why* the work is
sequenced as it is, so the reasoning is not re-derived every session.

1. **Enforcement before capability.** A gate that runs only when a human remembers is not
   enforcement. This repository has paid for that lesson more than once — a whole gate suite that
   executed nothing for a day, and committed gates registered in no runner at all. Registering an
   existing gate is hours of work and it retroactively hardens every claim already made against it.
2. **Bar 3 as a standing programme, by verb family** — not as opportunistic row-closing. It is the
   gate to the product the founder actually wants, and C81's edit layer is blocked on it entirely.
3. **The cheap decisions early.** Collaboration (§4.4) and the generative-quality ledger are both
   decisions rather than sprints, and both are currently the difference between *measured* and
   *enforced*.
4. **The edit layer last** — it cannot be built before bar 3, and building it earlier would multiply
   one defect across every typology (C81 §8.1).
5. **Standing rule: re-measure before building against a row.** Five row headlines were overturned
   in one session in the healthy direction, and one forecast was 23 rows high. **The register
   describes the past; the gate describes the present.**

---

## §7 — The one-paragraph version

PRYZM already generates a real building, on real land, under real law — and it has largely stopped
lying about what it did. What it cannot yet do is let you **change** that building and know what the
change broke. **Half 1 is trust. Half 2 is the product.** Half 1 makes the model worth selling from;
Half 2 makes it worth working in.

---

## §8 — Cross-references

- [C70 — BIM 3.0 target & Golden Chain](../02-decisions/contracts/C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) — the binding definition, the twelve pillars, the four-exit-code contract.
- [C78 — Universal relationship & consequence contract](../02-decisions/contracts/C78-UNIVERSAL-RELATIONSHIP-CONTRACT.md) — the three legal answers; bar 3's subject.
- [C81 — Design edit & intent preservation](../02-decisions/contracts/C81-DESIGN-EDIT-AND-INTENT-PRESERVATION.md) — the edit layer, and §0.2(b)'s correction that bar 3 is necessary but not sufficient.
- [C75 — Provenance](../02-decisions/contracts/C75-PROVENANCE.md) · [C66 — Concurrency & scale](../02-decisions/contracts/C66-CONCURRENCY-AND-SCALE.md) · [C82 — Ribbon capability surface](../02-decisions/contracts/C82-RIBBON-CAPABILITY-SURFACE.md).
- [`BIM30-GAP-REGISTER.md`](../04-reference/BIM30-GAP-REGISTER.md) — the counted status. **The number lives there, not here.**
- [`BIM30-NEXT-SESSION-BRIEF.md`](../03-execution/plans/BIM30-NEXT-SESSION-BRIEF.md) §9 — the 32-scenario assessment; §13 — the strategic path.
- [STR-05-bim30-founder-directive.md](./STR-05-bim30-founder-directive.md) · [STR-06-bim30-reasoning-loop-directive.md](./STR-06-bim30-reasoning-loop-directive.md) — the two founder directives this document explains the shape of.
