# The Planning Compiler — North Star

> **Stamp:** 2026-07-24 · **Status:** 🌟 ASPIRATION / MULTI-YEAR RESEARCH DIRECTION — **NOT current
> capability, NOT a roadmap commitment, NOT a shippable plan.** · **Kind:** vision framing
> **Read this first:** every number and capability below is a *destination*, not a claim about what
> PRYZM does today. What PRYZM does today is measured, per jurisdiction, in the `RATE.md` files (France
> ~22%, Barcelona ~48%, Denmark ~96%). This document exists so the day-to-day extraction work has a
> horizon to point at — it must never be cited as evidence of a present capability. If you are deciding
> what to build this quarter, read `RATE-IMPLEMENTATION-PLAN.md`, not this.

---

## 1 — The idea in one sentence

**Treat planning law as source code: compile each jurisdiction's written rules into a common, executable
*Planning Intermediate Representation* (Planning IR) — a rule graph a machine can evaluate against any
parcel — so that "what can I build here?" becomes a deterministic query over compiled law instead of a
human reading a PDF.**

The analogy is deliberate and load-bearing:

| Software compiler | Planning compiler |
|---|---|
| Source language (C, Rust, …) | A jurisdiction's plan text (PLU, PGOU, Bebauungsplan, kommuneplan…) |
| Front-end parser per language | One extraction *front-end* per jurisdiction (the article-grammar adapter) |
| **Intermediate Representation (IR)** | **Planning IR** — a jurisdiction-neutral rule graph (setback / height / coverage / overlay / precedence nodes) |
| Back-end / VM executes the IR | The **buildable-envelope engine** evaluates the IR against a parcel |
| Optimiser / verifier passes | Cross-checks, granularity typing, the L-449 human-verification pass |

One front-end per jurisdiction; **one shared IR and one shared engine** for all of them. The corpus cost
becomes N parsers, not N products — the same argument that already makes the per-city work in
`ORDINANCE-EXTRACTION-PIPELINE.md` horizontal, taken to its logical end.

---

## 2 — Why it is a North Star and not a plan

Three things are true at once, and the honesty of this document depends on holding all three:

1. **The direction is real and already visible in the codebase.** `GeometricRule` (setback / alignment /
   block-derived / explicit-area / tiered-occupation) is a nascent Planning IR — a discriminated union of
   executable rule kinds. `computeBuildableEnvelope` is a nascent Planning VM. `@pryzm/ordinance-extraction`
   is a nascent compiler front-end. The pieces of the analogy exist in miniature today.
2. **The distance is measured in years, not quarters.** A universal Planning IR must express rule kinds we
   have not built (Paris's reference-surface *gabarit* formula; Marseille's graphic-primacy precedence;
   discretionary sign-offs that are not numbers at all), across dozens of legal systems, each needing its
   own verified front-end and its own L-449 human gate. Every jurisdiction added is a research project.
3. **The ceiling is bounded below 100%, permanently and by nature — not by effort.** See §3.

Because of (2) and (3), this is a *horizon*, not a *deliverable*. It informs architecture (keep the rule
IR jurisdiction-neutral; keep extraction horizontal; keep the engine a pure evaluator) without ever being
promised to a user or a rate table.

---

## 3 — The honest ceiling: ~95–99%, never 100%

Even a mature Planning Compiler cannot reach 100% automation, and saying otherwise would be the exact
§CONTEXT-DATA-HONESTY dishonesty the `RATE.md` discipline forbids. Three residues stay human forever:

- **Discretionary judgement.** A heritage authority's sign-off (France's ABF inside a monument's 500 m
  perimeter; a conservation-area officer's opinion) is a case-by-case human decision, not a rule with a
  number. No compiler compiles a judgement.
- **Graphic / non-textual primacy.** Where a drawing legally overrides the written rule (Marseille/AMP's
  *règlement graphique prime sur le règlement écrit*), the authoritative source is a plan plate, and its
  machine-readability is itself uncertain.
- **Ambiguity and contestation.** Instruments under appeal, internally contradictory text, or genuinely
  ambiguous clauses resolve only by human (often judicial) interpretation.

So the realistic destination is **~95–99% of parcel questions answered by compiled law + verified
extraction, with the residuum resolved to a cited refusal ("this needs a human / a heritage sign-off / the
graphic plan")** — never a fabricated number. The Planning VM's most important output on the hard parcels
is an honest *"I decline, and here is why"*, exactly as the buildable-envelope engine's refusal vocabulary
already does today. **A claimed 100% is the tell of a dishonest system.**

---

## 4 — What this means for work happening now

- **Architecturally:** keep the rule representation (`GeometricRule` and successors) jurisdiction-neutral —
  every new rule kind is a candidate Planning IR node, so resist baking one country's mechanism into the
  engine (the C58 §1.11 flattening error). Keep extraction horizontal (one core, per-country front-ends).
  Keep the engine a pure evaluator of the IR.
- **Practically:** nothing in this document changes a quarter's plan. The next real step is always the next
  row of a `RATE-IMPLEMENTATION-PLAN.md`, measured into a `RATE.md`. The compiler is what those rows are
  quietly, incrementally building toward — not a thing to be scheduled or promised.

---

*Grounded in the shipped miniatures: `ADR-0270` (the GeometricRule union = nascent IR) ·
`docs/04-reference/ORDINANCE-EXTRACTION-PIPELINE.md` (the compiler front-end) · `C58` (the pure evaluator
+ the honesty rules) · `L-449` (the human-verification gate that caps automation). Measured reality lives
in `docs/04-reference/jurisdictions/*/RATE.md`; the country-agnostic evaluation method in
`jurisdictions/_TEMPLATE/COUNTRY-DATA-STRATEGY-TEMPLATE.md`. This file is the horizon those point toward,
and nothing more.*
