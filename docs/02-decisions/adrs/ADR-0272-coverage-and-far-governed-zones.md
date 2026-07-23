# ADR-0272 — Coverage- and FAR-governed zones: a rule kind for *ocupació màxima* + *índex d'edificabilitat neta*

**Status:** ACCEPTED (decision) · **implementation deferred to Phase 2** of
`docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/BARCELONA-COMPLETE-COVERAGE-PLAN.md`.
**Date:** 2026-07-21 · **Audit:** L-551 (this ADR); L-550 (the Phase-0/1b slice that precedes it).
**Supersedes / extends:** ADR-0270 (the geometric-rule model), ADR-0271 (block-derived depth).
**Contracts:** C58 §1.2/§1.3/§1.4/§1.7a/§1.11, C23, C19.

---

## 1. Context — a gap that decides a third of Barcelona

`packages/schemas/src/site/GeometricRule.ts` models a zone's geometry as a discriminated union of
four kinds: `setback`, `alignment`, `block-derived-alignment`, `explicit-area`. Three of them are
solved in `ZoningRulesEngine.ts`; `explicit-area` has a schema and **no engine branch**.

Separately, `JurisdictionZoningContract` carries `plotRatioFAR` and `maxCoverage` per zone. The
engine **resolves both** (`ZoningRulesEngine.ts` — `resolveNumber` for `maxFAR` and `maxCoverage`),
emits derivation rows for both, and returns both on the `BuildableEnvelope`. **Neither ever touches
the geometry.** `maxCoverage` is displayed and nothing else; `maxFAR` binds only downstream, in
`storeyCap.ts`, and only when a generator asks.

So a zone whose ordinance expresses intensity as *"90 % occupation, 2 m² sostre per m² sòl"* has, in
PRYZM today, **no way to shape an envelope at all**. It falls to the generic estimated pack and is
shown an invented front/side/rear triple.

**Measured consequence (L-538 probe, 2 907 grid points, 275 on private buildable land):**

| Family | claus | % of Barcelona's private buildable land |
|---|---|---|
| Industrial / activitats | `22a`, `22@` | 18.2 % |
| Edificació aïllada | `20a`, `20a/5,8,9,9b,9u,10,11,12` | 13.1 % |
| **Total blocked on this one missing capability** | | **31.3 %** |

That is the single largest win available in the plan, and it is larger than the entire currently
shipped coverage (`13a`, 24.0 %).

---

## 2. The legal justification for ONE capability serving TWO families

The founder's standing ranking is **legal fidelity first, standardisation second**: *"a shared
abstraction that flattens a real legal difference is worse than N specific packs."* So this ADR does
not claim `22a` and `20a` are the same zone. They are not — different articles, different ordination
types, different numbers, and they get **separate packs, separately sourced** (PGM Art. 350 vs the
*edificació aïllada* subzone table).

What is shared is narrower and is a fact about the ORDINANCE, not about our code:

> **Both zones state their building intensity in the same two legal quantities** — *ocupació
> màxima* (a fraction of the plot that may be covered) and *índex d'edificabilitat neta*
> (m² sostre per m² sòl). Those are the same two constraints in the same units answering the same
> two questions: how much of the ground, and how much floor area in total.

`13a` is the contrast that proves the distinction is real: PGM Art. 322.1 says that for
*densificació urbana* zones *"l'edificabilitat es defineix per l'envolupant màxima de volum"* —
**there is no per-parcel FAR in 13a at all**, which is exactly why `esBarcelonaEnsanche.ts` ships
`plotRatioFAR: null` as a FINDING rather than a gap. A zone that expresses intensity as an envelope
and a zone that expresses it as a ratio are genuinely different legal machinery, and this ADR keeps
them in different kinds.

---

## 3. Decision

### 3.1 A new `GeometricRule` kind: `coverage-and-far`

```ts
{
  kind: 'coverage-and-far',
  // The SHAPE. Separations are real distances in an edificació aïllada zone, so the
  // shape is genuinely a setback inset — not a coercion (contrast ADR-0270 §"coercing
  // alineación into front_m: 0").
  separations: { front_m, side_m, rear_m } | null,
  // The ground-plane CAP: the fraction of the PARCEL that may be occupied.
  maxCoverage: number (0,1],
  // The ground-floor allowance, where the ordinance grants one (Art. 350: 90% at
  // ground level, 70% above). null ⇒ no distinction is made by this zone.
  maxCoverageGroundFloor: number (0,1] | null,
  // m² sostre per m² sòl. Binds the STOREY COUNT, never the footprint.
  plotRatioFAR: number > 0 | null,
}
```

### 3.2 How `maxCoverage` shapes a polygon — **it does not**

This is the load-bearing decision of the ADR and it is the counter-intuitive one.

The obvious implementation is to shrink the inset ring until its area equals
`maxCoverage × parcelArea` — a proportional inset, or an occupancy-constrained band. **We reject
that**, because it manufactures a shape the ordinance does not state:

- A coverage limit constrains **how much** ground is occupied, not **where**. Two buildings of the
  same area in different positions are equally compliant. Choosing a position is a DESIGN act, and
  presenting one as the legal envelope is a C58 §1.11 category error — a real number answering a
  different question — dressed as geometry.
- The inset that a proportional shrink produces is not reproducible from the ordinance by anyone
  checking our work. It would be a PRYZM invention wearing an ordinance citation, which is the
  L-459 defect class (a constructed number rendering as a surveyed one) at polygon scale.

**Therefore:** the envelope RING for a `coverage-and-far` zone is the **separations inset only** —
the *área de implantación máxima*, the region within which building is permitted. `maxCoverage` is
carried as a **quantitative cap on the area used inside that ring**, surfaced as a first-class
derivation row and enforced against a PROPOSED design (`capacityComparison.ts` already models
proposed-vs-permitted), not as a boundary.

⚠ **The UI must therefore say something different for these zones**, and this is a hard
requirement, not a nicety: *"the constraint is a floor-area / ground-coverage cap, not a boundary."*
An envelope ring that the user may not fully cover, rendered identically to one they may, is a
wrong answer that looks right — the same failure mode as `13a`'s null setbacks reading as
"not filled in" (L-518c).

### 3.3 How FAR binds — through `storeyCap`, and only there

`plotRatioFAR` binds the STOREY COUNT, never the footprint. `capStoreysToEnvelope` already
implements exactly this (`farAllowedStoreys`, `binding: 'far'`) and already carries the two honesty
rules this ADR needs and must not re-litigate:

1. **FAR is defined against SITE area, not the buildable footprint** — the function refuses the cap
   outright when `siteAreaM2` is absent rather than approximating with the footprint.
2. **An estimate advises, it never blocks** (`isEstimate` ⇒ `advisory: true`). Under-building is
   not a "safe" error in a feasibility tool.

So the engine's job is only to RESOLVE `maxFAR` and `maxCoverage` onto the envelope (it already
does) and to emit their derivation rows (it already does). **No new FAR maths is introduced by this
ADR.** That is deliberate: a second FAR implementation would be free to drift from the first, on a
compliance number.

### 3.4 The ground-floor / upper-floor distinction

PGM Art. 350 grants 90 % occupation at ground level and 70 % above in the *aïllada* case. This is
carried as `maxCoverageGroundFloor`, and where it is `null` the zone makes no distinction. It is
**explicitly not averaged** into a single figure: an average is a number neither article contains.

### 3.5 What this ADR does NOT decide

- **The `22a` "70 % concentric strip to the block alignments" rule.** Art. 350's alignment case puts
  building above the ground floor within a strip concentric to the block alignments covering 70 % of
  the block. If that survives primary sourcing it is **block-derived**, and it belongs with
  ADR-0271's machinery, not here. Unresolved from the text seen (plan §6 item 10).
- **`22@`.** Governed by the MPGM 22@ (2000) — a different instrument with its own vintage problem.
  Separate pack, separate sourcing, separate founder gate. Phase 4.
- **Any number.** No parameter in §3.1 is filled in by this ADR. Art. 350 and the `20a/*` subzone
  table (~40 numbers across 8 subzones) must be primary-sourced and founder-signed under the L-449
  gate before either pack ships. §3.6 of the plan is explicit that transcription risk, not modelling
  risk, is the dominant risk for `20a`.

---

## 4. Consequences

**Positive.** Unlocks 31.3 % of Barcelona's private buildable land with one capability. Closes a
standing inconsistency where the engine resolved and displayed two constraints it never applied.
Reuses `storeyCap`'s already-tested FAR path rather than forking it. Adding a kind to the
discriminated union makes an unhandled kind a **compile error** in the exhaustive solver switch —
the union's stated purpose (ADR-0270 reason 4).

**Negative / accepted.** The envelope for these zones is a weaker object than `13a`'s: a permitted
REGION plus caps, not a determined volume. The UI must carry that distinction or it becomes a
misrepresentation. And a `coverage-and-far` envelope's `insetAreaM2` is **not** the buildable
footprint — every consumer that multiplies `insetAreaM2 × maxHeight` for a study volume (the facts
card does) will over-state it unless it applies `maxCoverage`. That is a migration obligation on
Phase 2, listed here so it cannot be discovered late.

**Confidence tier.** `estimated-ruleset` (amber) on completion, per C58 §1.2/§1.4 — an ordinance
transcription does not become green by being cleaner. Green requires per-parcel certification
against the *fitxa urbanística* (the L-528 track), which runs behind implementation and never
blocks it.
