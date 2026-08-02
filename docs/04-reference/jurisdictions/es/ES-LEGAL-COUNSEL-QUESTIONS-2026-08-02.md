# QUESTIONS FOR SPANISH URBANISMO COUNSEL — 2026-08-02

**Status**: OPEN — awaiting external legal opinion. Owner: **the founder**. Category: **External authority**
([BLOCKER-CLASSIFICATION-STANDARD](../../standards/BLOCKER-CLASSIFICATION-STANDARD.md)).
**Related**: [C64 §5](../../../02-decisions/contracts/C64-ENVELOPE-COMPILER.md) · [ADR-0283](../../../02-decisions/adrs/ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) · [ADR-0286](../../../02-decisions/adrs/ADR-0286-every-derived-value-exposes-legal-computational-source-and-tier.md) · [DECISION-REGISTER](../../standards/DECISION-REGISTER.md) · [ES-REGIONAL-PLANNING-DATA-STANDARDS](./ES-REGIONAL-PLANNING-DATA-STANDARDS.md)

> ⛔ **THE FRAMING, VERBATIM — it is the reason these three are the only questions asked:**
> **"We are not asking whether our envelopes are correct. We are asking what a signature can cover."**

**Why they matter, in the founder's words:** *"Question 1 decides your roadmap. Question 3 decides whether
the regional-standards thread is worth anything before 2027."*

---

## The brief, as sent

We generate 3D buildable envelopes from published planning data, with **each dimension cited to its
governing article**. Our certification is currently **scoped to one municipality at a time**.

### 1 · Can one certification cover one ordinance corpus across many municipalities?

> Barcelona's certification interprets the **PGM metropolitana** — a single ordinance corpus that governs
> **25+ municipalities in the AMB**. Can a professional certification of that interpretation extend to other
> municipalities under the same corpus, **with declared per-municipality deviations**, or must each
> municipality be certified separately? **What determines the answer — the corpus, the approving authority,
> or the municipal *modificacions*?**

### 2 · What must a refusal contain to be relied upon — and what is the exposure when the citation is wrong?

> Where our output is a **refusal** rather than an envelope — *"not buildable, per Art. X"* — **what must
> that refusal contain to be relied upon by a professional?** And **what is our exposure where the
> conclusion is right but the article cited is wrong?**

### 3 · Does data submitted under Andalucía's Normas Directoras carry normative status?

> Andalucía's **Orden of 18 Feb 2026** (*Normas Directoras*) makes electronic spatial-data submission
> **obligatory** for instruments approved after **24 April 2026**. Does the data submitted under that regime
> **carry any normative status**, or is it **dissemination of a document that remains authoritative only in
> its written form**?

### 4 · ⛔ Does «sin validez jurídica» disqualify regional vector data for a legally defensible envelope?

> Several regional planning viewers publish **vectorised urbanistic determinations** — Castilla y León's
> SIUCyL georeferences the plan PDFs, vectorises the *recintos* that define each determination, and
> attaches the alphanumeric data — while the accompanying metadata states **«sin validez jurídica,
> carácter informativo»**: no legal validity, informative character only. The same disclaimer appears
> across regional urbanistic viewers generally.
>
> **Does that disclaimer disqualify the data as a basis for a professional determination — or does it mean
> the vector is a routing hint to an instrument that remains authoritative only in its written form?**
>
> If the latter: **is a determination computed from the vector, but cited to the written instrument,
> relied-upon-able?**

---

## Why Q4 was added (2026-08-02, second research pass)

⚠ **This question can reclassify several regions in either direction at once**, which is why it belongs to
counsel rather than to a probe. Castilla y León is the sharpest case: **the region is already doing the
vectorisation work we would otherwise face** — PDF plans converted to polygons with determinations
attached — **and disclaims legal force over the result.** Under our own doctrine that is the L-616 problem
at regional scale: data that exists, is structured, and may not be publishable.

**The answer decides whether Castilla y León is Level 3 or Level 0 for our purposes** — and, because the
disclaimer is near-universal across regional viewers, it likely decides the same for most of the regional
layer. See [ES-REGIONAL-PLANNING-DATA-STANDARDS §6.3](./ES-REGIONAL-PLANNING-DATA-STANDARDS.md).

---

## Internal context — what we already measured, and what it constrains

**Recorded so the answers can be interpreted against evidence rather than assumption. None of it is part of
the brief sent to counsel.**

**On Q1 — the question is live in code, not merely in law.** Whether the signature keys on the *municipality
identifier* or on the *ordinance corpus it interprets* is currently being read out of
`l449CertificationGates.ts` and the SIG-2/3/4 signature blocks. If it binds to the corpus, a regional
signature is a **scoping change, not a new legal instrument**.

⚠ **And the ceiling is already known to be lower than "25 municipalities".** 25 of 36 AMB municipalities
carry `PGM=S`, but that means only that the metropolitan plan **applies** — not that each municipality's
*modificacions* and *plans especials* sit inside the signed reading. Barcelona register row 19 measures
**`PD*` across 70.69 % of Barcelona's own buildable land**, flagged *"the clau we read is a translation, not
the governing text"* — **unresolved in Barcelona, therefore unresolved in all 25.** The honest ceiling is
**general PGM articles minus whatever each municipality's derived instruments displace**, and that
displacement is **unmeasured**.

**On Q2 — this is not hypothetical; it is measured and it is our largest live defect.** A refusal audit of
143 sampled refusals found **39 incorrect**, of which **33 are wrong-citation / right-outcome** — precisely
the case Q2 asks about. Separately, **17.15 pp of Barcelona's and 6.38 pp of València's refusals carry
`legallyGrounded: false` in shipped code** while the measurement record counts them as determinations.
⚠ **If Tier 2 (determination-only) is the national product, then the citation *is* the product** — which is
what makes the exposure question load-bearing rather than academic.

**On Q3 — the timing is the whole point.** The mandate is **forward-only**: it binds instruments approved
after 24 April 2026, roughly fourteen weeks ago. Across ~785 Andalusian municipalities the count of *general*
instruments approved in that window is **plausibly zero to a handful**. **The pipeline is mandated; the
corpus today may be empty.** A schema specifying ordinance parameters against an empty corpus is a strong
signal about 2027 and a weak one about this quarter — and **schema scope** and **instruments actually
submitted** must be reported as two separate numbers, never conflated.

⚠ **Nothing in the regional-standards thread has yet been verified by query.** Documents were read; services
were not reached. See [ES-REGIONAL-PLANNING-DATA-STANDARDS §0.1](./ES-REGIONAL-PLANNING-DATA-STANDARDS.md).
