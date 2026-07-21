# ADR-0271 — Block-derived *profunditat edificable*: when the ordinance states an ALGORITHM, not a number

- **Status:** **PROPOSED** *(the decision below stands; three of its supporting statements were
  measured wrong and are corrected in **§Corrections (2026-07-21)** at the end — read that before
  acting on anything in this record).*
  P1–P5 have all since landed for Barcelona `13a`; the phase table in §Phases is superseded by the
  §Corrections table.
  ⚠ This ADR was written **after** its P1 code landed — see "A process note against ourselves".
- **Date:** 2026-07-20 · **Amended:** 2026-07-21 (L-529, L-526, L-539)
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
> the block area as interior free space* — capped at 30 m, floored at ~~11 m~~ **12 m**.
>
> ⚠ **CORRECTED 2026-07-21 (L-526): the ordinance floor is 12 m, not 11 m.** Primary-source
> research on Art. 242 (`L-526-LEGAL-FINDINGS.md`) establishes the minimum depth as **12 m** and
> adds an **8 m inscribed-circle** interior check this ADR never modelled. The pack now ships
> `minDepth_m: 12` (`packages/site-parcel-data/src/rulepacks/esBarcelonaEnsanche.ts:112`). The
> same research corrected the *citation*: the depth authority is **Art. 242** applied via
> Art. 327.1 — **not Art. 322.1**, which is *edificabilitat* and states no depth number.

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

⚠ **CORRECTED 2026-07-20 — this section originally said `granularity: 'block'`. That was wrong,
and getting it backwards would have been consequential.**

The correct stamp is **`granularity: 'parcel'`**. C58 §1.11 discriminates what a number is
**ABOUT**, not what was used to compute it. Its motivating failure is Madrid VEDA: a real,
published *ámbito* FAR that is a fact **about the sector**, so presenting it as this plot's FAR is
a category error no confidence chip corrects.

Art. 242.2 is different in kind. It is a **parcel-level rule** that happens to take block geometry
as an INPUT, and the depth it yields is the correct legal depth **for this plot**. Two parcels on
one manzana share it because the ordinance makes it so — not because a coarser figure was
borrowed and spread across them.

Stamping `'block'` would have tripped §1.11.3, which forbids the generator from consuming
coarser-than-parcel numbers as hard constraints — so the engine would have computed a correct
Eixample depth and then refused to let anything use it.

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

---

# Corrections (2026-07-21) — three supporting statements measured wrong

> **Nothing above is deleted.** The DECISION — model Art. 242.2 as a construction, not a lookup —
> was and remains correct, and is now the template for the *alçada reguladora* too (C58 §1.12).
> What follows corrects the record's supporting claims, each with the measurement that corrected
> it, per the governance rule that a superseded assertion is marked and explained rather than
> quietly edited away.

## C-1 — ⛔ REFUTED: the "half-illa / masa-union" depth story (L-529)

**What was believed, and recorded as CONFIRMED in three separate documents** (this ADR's
downstream investigation `L-525-ENVELOPE-ACCURACY-INVESTIGATION.md`, `L-526-LEGAL-FINDINGS.md`,
and the launch audit): Barcelona masa 02309 dissolved to ~6,686 m² ≈ *half* a Cerdà illa
(~12,000 m²), so insetting it from all perimeter edges eroded the interior fast and floored the
depth at the ordinance minimum. The fix was called *turnkey*: union the masa with its sibling.

**What the probes measured, on live Catastro data, in about ten minutes and with no deploy:**

| # | Probe | Result |
|---|---|---|
| 1 | Group every parcel in a 444 m bbox into connected components by geometric adjacency | Masa 02309's bbox is **113.4 × 113.8 m** with **ZERO cross-masa adjacency links**. **There is no sibling masa to union with.** The premise is false. |
| 2 | Run the production `dissolveParcelsToBlockRing` and measure the ring | **Solid** ring — enclosed area = summed parcel area = 6,696 m², no courtyard hole — perimeter only **336 m** (a solid 113 m illa would be 452 m) ⇒ a genuine **~82 × 82 m block rotated ~45°** to the Eixample grid bearing. |
| 3 | Sweep `insetPolygonPerEdge` over d = 0…30 on that ring | Clean to d = 6 (70 % free); **degenerate at every d ≥ 8**. A clean 82 m control square insets fine to d = 25. |
| 4 | Instrument the inset's internal gates | The greedy self-intersection cleanup collapses **40 vertices → 2**; gate G5 (`< 3` verts) then declares the polygon degenerate. **ROOT CAUSE.** |
| 5 | Independent distance-field solve (validated to 2 dp against an analytic control) | Depth ≈ **17.4 m** — the block was never short of courtyard (48 % free at 12 m). |

**The actual cause was a CODE defect, not a data one.** `insetPolygonPerEdge`'s
`removeSelfIntersections` truncated the ring on every fold; `solveBlockDerivedDepth` read the
resulting degenerate inset as zero interior free area, so Art. 242.2 was unsatisfiable at any
depth and the solver clamped to the ordinance floor. **Fixed by §INSET-LOOP-DECOMPOSE**
(`packages/site-parcel-data/src/geometry/insetPolygon.ts:192`). CL Pau Claris 155:
`12.0 m · min-floor · degenerate=true` → **`15.7 m · interior-ratio · achievedFreeRatio 0.300 ·
degenerate=false`**. Logged as **L-529**.

**The legal theory was wrong too.** The parallel hypothesis — that a stale citation, specifically
the un-reflected 2008 modification to Art. 327 §2, explained the depth — is refuted: that
modification amends the **height table** and does not touch depth (`L-526-LEGAL-FINDINGS.md`).

**And it was never Barcelona-specific.** The blast-radius sweep over **684 cases** found the same
greedy cleanup running on every `setback` inset: a flag/battle-axe lot reported *"no buildable
area"* at the DEFAULT **3 / 1.5 / 3 m** setbacks in **every** jurisdiction. What presented as an
ordinance-modelling problem on the densest land in Spain was a generic geometry bug.

**The invariant this ADR states was therefore violated in production.** *"The floor is not a
fallback — returning `minDepth_m` when the construction fails would publish a depth the ordinance
does not sanction for that block."* That is precisely what shipped. The invariant is right; it was
not enforced anywhere. Recorded against C58 §1.3/§1.4 as an open, un-gated violation.

**The lesson, stated as a rule:** *measure the geometry before theorising about the data.* Three
documents converged on a shared inference drawn from ONE number (6,686 m²) whose **shape** nobody
had measured. Cross-ref: memory `inset-collapse-was-the-depth-rootcause`.

## C-2 — CORRECTED: "the inputs already exist in the product" understated the block-ring problem by a third

**Consequences** says the block ring comes "from the same Catastro INSPIRE WFS that already
returns parcels … or by dissolving the parcels of a manzana", verified live on one refcat. **One
verified parcel does not measure a success rate.** Measured since:

- **9 real addresses / 3 cities** (`SPAIN-CADASTRAL-DISSOLVE-PROBE.md`, L-535): Barcelona 2/2,
  Madrid 2/4, **Córdoba 0/3**. Outside Barcelona the geometry stage failed *before any rule was
  consulted*.
- **956 COMPLETE real manzanas / 5 cities** (`SPAIN-DISSOLVE-FAILURE-TAXONOMY.md`, L-539):
  **63.5 %** baseline — and Barcelona itself is **81.5 %**, not the 100 % the 2-of-2 sample
  suggested. *A 2-of-2 sample cannot distinguish 100 % from 80 %.*
- After the tolerant dissolve (**ADR-0274**): **91.4 %** overall, Barcelona Eixample 96.3 %, with
  **0 pre-existing rings changed and 0 lost**.

So P4 ("block-ring SOURCE") was not merely "real work, not plumbing" as this ADR anticipated — it
was, until L-539, **the single binding constraint on buildable-envelope coverage in every city**.

## C-3 — SUPERSEDED: the phase table

| Phase | This ADR said | Actual, 2026-07-21 |
|---|---|---|
| P1 solver | ✅ 10 tests | ✅ shipped — but produced a floored depth on real blocks until L-529 (C-1) |
| P2 schema variant | open | ✅ `block-derived-alignment` is in the `GeometricRule` union, solved exhaustively |
| P3 engine plumbing | open | ✅ shipped |
| P4 block-ring source | open | ✅ shipped; success rate measured and then repaired — see C-2 and **ADR-0274** |
| P5 Barcelona pack | blocked on L-461 | ✅ `esBarcelonaEnsanche.ts` ships, `estimated-ruleset`/amber, founder source gate **re-signed** 2026-07-21 against the consolidated RPUC/NUMAMB refós after the first acceptance proved stale and anachronistic (L-449, L-526) |

⚠ **`granularity` (KG-2) is still absent from the schemas.** This ADR's granularity section remains
un-implemented, so the `'parcel'` stamp it argues for is asserted in prose only.

## C-4 — EXTENDED, not corrected: the construction principle generalised

The reasoning here — *the ordinance states an algorithm, so the answer is constructed and cited,
never looked up* — was applied a second time on 2026-07-21 to the **height**: PGM Art. 327.2 keys
the *alçada reguladora* on the declared street width, and **no declared-width dataset is published
in Spain**. That construction, and the graded provenance ladder its inputs require, is
**ADR-0275**; the principle is now normative as **C58 §1.12**.

**Cross-refs:** L-525, L-525a, L-526, L-529, L-535, L-537, L-539; ADR-0270, ADR-0272, ADR-0274,
ADR-0275; C57 §1.11/§1.12, C58 §1.12/§1.13.