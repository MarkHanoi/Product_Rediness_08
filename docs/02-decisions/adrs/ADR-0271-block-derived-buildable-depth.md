# ADR-0271 — Block-derived *profunditat edificable*: when the ordinance states an ALGORITHM, not a number

- **Status:** **PROPOSED.** P1 (solver) IMPLEMENTED + tested (10 tests, `blockDerivedDepth.ts`).
  P2 (schema variant), P3 (engine plumbing), P4 (block-ring source), P5 (pack) open.
  ⚠ This ADR was written **after** its P1 code landed — see "A process note against ourselves".
- **Date:** 2026-07-20
- **Tracker:** **L-460** (the finding), **L-462** (the geometry bug it exposed). Blocks the A1d
  Barcelona pack. Consumes **L-456** (capacity model). Depends on **L-461** (human curation gate).
- **Contracts:** **C58 §1.1** (byte-determinism — constrains the solver's iteration budget),
  **§1.3** (derivation), **§1.4** (never present a guess as a fact), **§1.11** (granularity —
  a block-derived number is BLOCK granularity, and that is load-bearing here), **§2.2** (the rule
  model — extended again), **§2.4** (inset). **ADR-0270** (extended; its scalar depth is the gap).

---

## Context

ADR-0270 closed the *shape* hole: dense European fabric is governed by **alineació a vial** plus
**profunditat edificable**, which is a different geometric operation from a setback inset, and it
gave the rule model an `alignment` variant carrying a scalar `buildableDepth_m`.

Authoring the first real *ensanche* pack — Barcelona, INE 08019 — showed that variant is still
insufficient, for a reason that is not a missing lookup.

**PGM NNUU Art. 242.2 does not state a buildable depth for the Eixample. It states how to derive
one:**

> *a figure similar to the block, equidistant from the street frontages, leaving at least 30% of
> the block area as interior free space* — capped at 30 m, floored at 11 m.

**That is a geometric algorithm with a unique solution, not a number.** The depth is a function of
the block, and it differs block to block. Every "20 m" / "24 m" figure repeated online is
someone's answer for one particular block, which is precisely why those figures contradict each
other in the sources.

### Why this is a rule-MODEL gap, not a data gap

Two independent facts make it unfixable at the pack level:

1. **A scalar cannot encode a function.** No value of `buildableDepth_m` expresses "solve for `d`
   such that 30% of the block stays free".
2. **The engine cannot see the block.** `computeBuildableEnvelope` receives **one parcel ring**.
   Even a richer scalar would have nothing to compute against.

Encoding a fixed depth would reproduce, one level up, exactly the lossy coercion ADR-0270 exists
to prevent: **the right SHAPE of rule fed the wrong KIND of input.** And it would do so on the
densest, highest-value land in Spain, where being confidently wrong is most expensive.

### Independent corroboration from the data side

`docs/04-reference/spain/SPAIN-ZONING-LIVE-VERIFICATION-2026-07-20.md` §7.2 reaches the same
conclusion from the opposite direction: numeric *edificabilidad* is published in Spain **only for
*suelo urbanizable*, never for consolidated *suelo urbano***, because urbano is governed by an
ordenanza applied per plot — **derived, not stored**. The Eixample is consolidated urbano. So the
absence of a lookup value is structural, and no amount of further searching produces one.

---

## Decision

**Add a fourth variant to the `GeometricRule` union: `block-derived-alignment`.**

It carries the same alignment fields as `alignment` — the geometric operation is identical — and
replaces the scalar depth with the **construction's parameters**:

```ts
{ kind: 'block-derived-alignment',
  alignTo, alignmentOffset_m, sideTreatment, side_m?, rear_m?,   // shared with `alignment`
  interiorFreeRatio: 0.30,   // Art. 242.2 — the >=30% interior free space
  minDepth_m: 11,            // ordinance floor
  maxDepth_m: 30 }           // ordinance cap
```

plus an **optional `blockRing` + `blockEdgeClassifications` input** to `computeBuildableEnvelope`.

### Why a new KIND and not a nested union on the depth field

A nested `{ source: 'fixed' | 'block-derived' }` inside `alignment` would avoid repeating five
fields, and it was seriously considered. It is rejected because **the two variants have different
INPUT REQUIREMENTS at the engine boundary**, not merely different field values. A
`block-derived-alignment` zone is unsolvable without a block ring; an `alignment` zone is solvable
without one. Making that a discriminated `kind` lets the solver's exhaustive switch — the union's
whole stated purpose (ADR-0270, reason 4) — carry the requirement *statically*, so a caller that
routes a block-derived zone through the parcel-only path is a compile error rather than a runtime
`undefined` on a compliance number.

The five shared fields are composed from one shared shape object, so there is no duplication in
the source; only in the type's surface, where it is the point.

### Why the largest admissible depth

The ordinance sets a **minimum** interior free space. The maximum depth consistent with that
minimum is therefore the permitted depth. `interiorFree(d)` is monotonically non-increasing in
`d` — eroding further can never enlarge the remainder — so the answer is found by bisection.

**Fixed 40-step budget, never a tolerance-based `while` loop.** A data-dependent iteration count
makes the last bit of the result input-sensitive, which breaks C58 §1.1 byte-determinism. 40
halvings of a ≤30 m span resolves far below a millimetre.

### `binding` is part of the answer, not a diagnostic

The result carries which rule actually bound: `interior-ratio` | `max-cap` | `min-floor`. This is
not telemetry. It is what lets the explain-why report say *"the 30% courtyard rule set this"*
versus *"the 30 m cap set this"* — **different legal statements about the same number**, and
C58 §1.3 requires the derivation, not just the value.

### Granularity

A block-derived depth is **`granularity: 'block'`**, and C58 §1.11.2 requires that it not be
presented as a parcel figure without saying so in the same sentence. This is not pedantry here:
the depth is genuinely a property of the manzana, and two parcels on the same block share it.

⚠ `granularity` is normative in C58 §1.11 but **absent from the schemas** (gap KG-2). This ADR
cannot be fully conformant until that lands; P2 adds it.

---

## Consequences

**Good.** The Barcelona pack becomes authorable without inventing a number. The construction is
computed per block, so it is right on every block rather than right on one. The inputs already
exist in the product: block geometry from the same Catastro INSPIRE WFS that already returns
parcels (verified live for `0229720DF3802G`), or by dissolving the parcels of a manzana; street
frontages from the OSM roads layer the context engine already fetches.

**Costly.** It adds a required input (`blockRing`) that nothing currently produces — P4 is real
work, not plumbing. It also means the engine's inputs are no longer "one parcel ring", which
widens `computeBuildableEnvelope`'s contract.

**Risk we are accepting.** Deriving frontage classification from OSM roads means a *compliance*
number depends on *context* data quality. Mitigation: the derived depth is labelled by its own
`fieldProvenance` and the block ring's source is recorded; where frontages cannot be classified
confidently the solver returns `degenerate` and the caller shows **no envelope**, never a
fallback depth. **The floor is not a fallback** — returning `minDepth_m` when the construction
fails would publish a depth the ordinance does not sanction for that block.

---

## A process note against ourselves

**The P1 solver was written and committed before this ADR existed**, citing "ADR-0271" as its
governing decision — a dangling reference for roughly a day. The code was good and the reasoning
in its header was sound, which is exactly what made the gap easy to miss: nothing looked wrong.

Governance order is contract → ADR → code, and the reason is not bureaucratic. An ADR is where a
decision gets **argued against** before it is depended upon; code that cites an unwritten ADR has
skipped the adversarial step while displaying the citation that implies it happened. Recorded per
the same discipline as L-I / L-L: the failure mode worth naming is **a reference that looks
discharged**.

---

## Phases

| Phase | Scope | Done when |
|---|---|---|
| **P1** | Pure solver (`solveBlockDerivedDepth`), bisection, `binding` | ✅ 10 tests; winding-agnostic; fixed iteration budget |
| **P2** | L0 schema: `block-derived-alignment` variant + `granularity` (closes C58 KG-2) | Zod round-trip; exhaustive-switch compile error proven |
| **P3** | L2 engine: optional block input; solver branch; `DerivationEntry` carries `binding` | An Eixample block yields a depth-limited ring; determinism test |
| **P4** | Block-ring SOURCE — dissolve Catastro parcels of a manzana / close rings from OSM roads; frontage classification | A real Barcelona block ring is produced from live data, with provenance |
| **P5** | Barcelona pack — **all numeric fields `null`** pending L-461 human gate | Pack parses, is labelled `estimated-ruleset`, ships no unverified number |

**P1 and P2 are safe now** (additive, no persisted data). **P5 is blocked on L-461** — two
WAF-blocked facts needing a human in a real browser.

---

## Status

**PROPOSED.** Not yet accepted. P1 landed ahead of this record (see the process note); P2–P5
await a decision on the union-variant question above.