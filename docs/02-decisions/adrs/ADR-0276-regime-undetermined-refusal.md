# ADR-0276 — `regime-undetermined`: when the ordinance answers twice and no source says which answer is yours

**Status:** ACCEPTED and IMPLEMENTED (schema + refusal + registry routing + tests) ·
**founder-ruled 2026-07-22** ("C now, B in parallel, hold A"), **option A explicitly ON HOLD.**
**Date:** 2026-07-22 · **Audit:** §L-590c (this ADR); L-590 (the sourcing), §L-590b / ADR-0273 (the
geometry), L-605 (the Track-B source finding).
**Extends:** L-550 (the refusal vocabulary), L-553 (the coverage gap), L-574 (the transient
refusal). **Contracts:** C58 **§1.13.7 (new)**, §1.4, §1.13.3, §1.13.4, **KG-6 (rewritten)**.

---

## 1. Context — a refusal category that did not exist, on 17.5 % of Barcelona

PGM NNUU **Art. 350** governs Barcelona clau `22a` (*zona industrial*) — **17.5 % of the city's
private buildable land** — and it governs it **twice**:

- **Art. 350.2.a–f** — for industrial land ***mancada de Pla Parcial***. Full conditions, including
  the 350.2.c street-width height table (9 / 13 / 17 m) and the 350.2.b concentric band.
- **Art. 350.1** — for land **with** a definitively-approved *Pla Parcial*. The PGM imposes only two
  ceilings; the height, the storeys and any band come from *that plan's own plànols and ordenances*
  — a document PRYZM does not hold.

**Neither the Catastro parcel nor the MUC records which regime applies.** The field does not exist
in either source. ADR-0273 closed the *modelling* blocker (`tiered-occupation` + `EnvelopeTier`);
this one is a legal fact, and no amount of engineering closes it.

So the pack sat authored, cited, solved and unregistered, and a `22a` parcel got the **coverage-gap**
card: *"PRYZM has not encoded this zone's building rules yet."* **That statement had been false since
the day the pack was written.** It is the same defect that had `13b` removed from
`coverageGapReasonFor` — a false statement about our own coverage, which is the mirror image of the
false statement about the law that the whole refusal vocabulary exists to prevent.

---

## 2. Decision

### 2.1 A fourth `EnvelopeRefusalCode`: `regime-undetermined`

> The zone is buildable, PRYZM **has** authored and solved its pack, every input we need is
> available — and the ordinance itself states **two regimes for the same clau**, keyed on a legal
> fact about the parcel that no public source records.

`legallyGrounded: false`: the LAW is fully known, both halves of it; what is missing is **which half
applies**, which is a statement about PRYZM's inputs.

**Rejected against each existing code, because "is this really a new kind?" is the question this
vocabulary exists to force:**

| Code | Why it is WRONG here |
|---|---|
| `no-rule-pack` | *"We have not encoded this zone yet."* **False.** The pack is authored from the primary PDF, schema-validated and solved end-to-end against a real block. More authoring moves it zero. Its card also places the zone on a roadmap — implying the remedy is our own work, which it is not. |
| `source-data-unavailable` | **False, and harmful in a specific way.** L-574 defines it as the *one TRANSIENT refusal* and the only one that earns a retry affordance; the card says *"Re-select the parcel to try again — this usually clears on a second attempt."* Nothing clears on a retry: the missing input is not a fetch that failed, it is a legal fact nobody publishes. It would loop a user for ever. |
| `derived-plan` | The closest legal cousin and **the most dangerous**. It asserts that the general plan DELEGATES buildability to another document *for this parcel*. That is true in exactly one of the two regimes — so asserting it would assert the very fact we cannot establish, on someone's land, under a citation. **L-526 verbatim.** |
| a caveat on the coverage gap | A caveat cannot change a chip, a remedy or a headline, and all three are wrong. §CONTEXT-DATA-HONESTY has been paid for four times (L-422 / L-457 / L-467 / L-469) precisely by treating distinguishable answers as one value. |

⇒ A coverage gap, a fetch failure and *"we cannot make this determination"* are **three different
answers**, and this is the third.

### 2.2 C58 §1.13.7 — a refusal MAY state the limits that survive its own uncertainty

C58 §1.13 assumed a refusal has nothing numeric to say. Here it does: some of Art. 350's limits are
stated **identically in both regimes**, and withholding them would be its own dishonesty — the user
would read *"we can tell you nothing"* while we hold the most load-bearing figure on the zone.

The permission is deliberately narrow, and each bound is load-bearing:

1. **§1.13.3 is NOT relaxed.** Every numeric field stays null, `insetPolygon` and `tiers` stay
   empty. `storeyCap`, the generators, the Cesium massing, the §1.8 generator bounds and
   `site.updateZoning` receive **nothing**. The facts reach only `detail` + `ordinanceRef`.
2. **Prose is not a workaround — it is the only form that can carry a CONDITION** (see §3).
3. **Not `knownFacts`**, whose contract is *facts only, never a constraint, never a number the user
   could mistake for an allowance*, and which renders as bare lines with nowhere to put a condition.
4. **The citation MUST be narrowed to what is actually claimed** — the card cites Arts. 350.1.1r /
   350.1.2n / 350.2.a and *explicitly disclaims* 350.2.b and 350.2.c. Carrying the pack's full ref
   would attach an authoritative-looking reference to paragraphs the card declines to apply.

⚠ This licenses stating a limit **the ordinance states in every branch of the refusal's own
uncertainty**. It does not license a *typical*, *likely* or *neighbouring-zone* value — §1.4
forbids those in every context.

### 2.3 Routed through `refusalFor`, NOT by registering the pack

`barcelonaZoneRefusalFor` answers `22a` before `noRulePackRefusal` runs. **`packsByZone` is
unchanged.** That is the safety property, not an implementation detail: registering the pack would
send `22a` through `computeBuildableEnvelope` with the `tiered-occupation` rule, cutting an
Art. 350.2.b band and publishing an Art. 350.2.e 5 m tier as the principal one — **both
regime-gated, on parcels Art. 350.1 may govern.** Guarded by a named test.

---

## 3. ⚠ A CORRECTION TO THE FINDING THIS ADR WAS COMMISSIONED ON

The brief, ADR-0273 §6 and C58 KG-6 all stated that **the FAR *and* the occupation** are restated by
Art. 350.1.1r and are therefore regime-neutral. Art. 350 was re-extracted glyph-by-glyph from p. 116
and re-assembled in reading order to verify it. The result:

| Paragraph | Applies to | FAR | Occupation |
|---|---|---|---|
| **350.1.1r** | Pla Parcial · sector ordered *segons alineacions a vial* | **2 m²st/m²s** | **90 %** |
| **350.1.2n** | Pla Parcial · sector ordered *edificació aïllada* | **2 m²st/m²s** | **70 %** |
| **350.2.a** | *mancada de Pla Parcial* | **2 m²st/m²s** | **90 %** |

- ✅ **The FAR is UNCONDITIONAL** — all three paragraphs state it, so it survives the regime question
  *and* the ordering-type question. That is a stronger claim than the brief made.
- ⚠ **The occupation is NOT.** Art. 349.1 makes *segons alineacions de vial* the ordering type only
  *"si no n'hi ha"* a Pla Parcial — *with* one, the type is *"l'establert a l'indicat Pla Parcial"*,
  which may be *aïllada*; and Art. 349.2 lets a PERI or Estudi de Detall convert sectors to
  *aïllada*. A bare "90 %" would **over-state occupation by 20 percentage points** on such a sector
  — the one error direction C58 §1.4 forbids outright.

⇒ The track does not collapse; it narrows and sharpens. The condition now travels **in the same
sentence as the number**, everywhere, and `BCN_22A_REGIME_NEUTRAL_LIMITS.maxCoverageCondition` is
the single place it is written. **This is also why the figures are prose:** `maxCoverage: 0.9` in a
schema field is unconditional by construction and cannot be made otherwise.

---

## 4. Consequences

**Positive.** 17.5 % of Barcelona's private buildable land moves from *"we haven't encoded this"*
(false) to *"here are the two figures that are certain, here is what we cannot determine, and here is
the exact missing input"* (true, cited, actionable). The refusal names a **specific legal fact**, so
the remedy is identifiable — which is what made Track B answerable at all.

**Negative / accepted.**
- **The chip is wrong until the UI catches up.** `apps/editor/src/ui/layout/GISAreaLayout.ts`
  branches `isTransient → isGap → legal`, so `regime-undetermined` currently wears the coverage
  gap's *"Zone rules coming"* pill. That is the **least-wrong** of the three that exist (the legal
  chip would say *"No envelope applies"* — a false negative about someone's land, which L-553 ranks
  as the worst error in the set), and the headline and detail carry the truth. A fourth chip is owed;
  it was not taken in this pass because another agent held that file. **Follow-up, listed in the
  L-590c report as "re-apply by hand".**
- The zone still publishes no envelope, so the click-distribution "full envelope" rate is unchanged
  by this ADR. That is honest: nothing here is an envelope.
- A future consumer wanting the two figures *structurally* must read
  `BCN_22A_REGIME_NEUTRAL_LIMITS`, not the envelope. Deliberate — see §2.2.1.

---

## 5. NOT decided here

- **Option A — defaulting the Pla-Parcial regime to `'none'` inside the municipality — is ON HOLD**
  by founder ruling. `resolveAlcadaIndustrial` keeps refusing on `unknown`; no permissive default
  anywhere. Track B has since produced evidence it would be *actively wrong* on real land: Zona
  Franca 22a is governed by a definitively-approved Pla Parcial whose own heights are **18,30 m /
  24,40 m**, against Art. 350.2.c's 9 / 13 / 17 m.
- **Wiring Barcelona's municipal planning WMS** as a regime source (L-605). It answers the question,
  keylessly, at a point — but wiring it changes the answer to a decision that is currently on hold,
  and the founder gets to re-decide with the evidence in hand.
- **A fourth chip / card treatment** in the facts panel (see §4).
- Whether `regime-undetermined` generalises beyond Barcelona. It almost certainly does — a general
  plan that defers to a derived instrument *where one exists* is a European pattern, not a Catalan
  one — but nothing outside `22a` uses it yet, and claiming otherwise would be speculation in a
  contract.
