# 0288 — Machine-readable is not publishable

**Status**: ACCEPTED (2026-08-02 — founder, promoted from Rule 6 of the Machine-Readable Evidence Register: *"I'd actually promote it to an ADR principle. Because it's universal."*)
**Date**: 2026-08-02
**Deciders**: founder (programme sponsor decision) + architecture team
**Related contracts**: [C58 — Zoning Rules & Buildable Envelope](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (§1.4), [C63 — City Completion & Dossier](../contracts/C63-CITY-COMPLETION-AND-DOSSIER.md)
**Related ADRs**: [ADR-0283](./ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md) (the parent — *incomplete **or legally insufficient** ⇒ Unknown*), [ADR-0284](./ADR-0284-derived-geometry-permissible-derived-law-is-not.md), [ADR-0286](./ADR-0286-every-derived-value-exposes-legal-computational-source-and-tier.md)
**Reference docs**: [MACHINE-READABLE-EVIDENCE-REGISTER.md](../../04-reference/standards/MACHINE-READABLE-EVIDENCE-REGISTER.md) (its Rule 6 and `Publishable` column are this ADR in operational form)

## Context

The register that inventories what PRYZM can *read* was approved as the programme's single source of truth.
The moment such a register exists, it invites a specific and dangerous inference:

> *"The geometry is there, it's queryable, therefore we can build on it."*

The founder named this as the most likely source of future failure:

> *"Future mistakes will almost certainly come from someone discovering geometry and assuming that
> geometry authorizes entitlement."*

The case that forced it is live. Madrid's `PG_ANALISIS_EDIFICACION` publishes layer 2
*«Fondo máximo para nueva planta o reestructuración general»* and layer 12 *«Fondo»* — the *fondo máximo
edificable*, as machine-readable geometry, over HTTP 200, right now. Every engineering instinct says bind
it. But Art. 8.3.1 may state that NZ 3's *aprovechamiento urbanístico* is already **exhausted** and that the
Plan consolidates earlier instruments *"sin imponer un nuevo modelo"*. If that governs, the ordinance has
**answered**, and its answer is "not by a zone envelope" — over 60.46 % of Madrid. **The data would be
readable, correct, official, and still not authority to publish an entitlement.**

Three distinct questions were being collapsed into one. They are independent and must be asked separately:

| Question | Answered by |
|---|---|
| **Can we read it?** | the Machine-Readable Evidence Register |
| **Have we already tried?** | the same register (`Closed` rows) |
| **May we publish from it?** | **this ADR + ADR-0283 — never the register** |

## Decision

> **Machine-readable is not publishable.**
>
> Discovering that a dataset is readable establishes only that it is readable. Authority to publish a legal
> determination from it is a **separate finding**, requiring a separate justification, and it is never
> implied by availability.

Publication requires **all** of:
1. the data is machine-readable and its provenance is recorded (the register);
2. the governing instrument **grants** the determination we intend to publish — it does not merely fail to
   forbid it (ADR-0283: *incomplete **or legally insufficient** ⇒ Unknown*);
3. the publication is within the data's **demonstrated spatial extent** (ADR-0283 — partial publication
   authorises nothing beyond it);
4. any human sign-off the gate requires is **recorded and dereferenceable** (L-449);
5. the output exposes legal source, computational source and confidence tier (ADR-0286).

Availability satisfies (1) only. **A readable dataset with no legal grant is `Unknown`, not an envelope.**

## Consequences

- **The register carries a `Publishable` column**, so the distinction is visible in every discussion rather
  than recalled from doctrine. Values: `Yes` (with the authority named) · `Pending` (with what is awaited) ·
  `No` (with the reason) · `N/A`.
- **"We found the data" is never a completion claim.** Córdoba's CUS sheets, if vectorised, become readable
  geometry — and ~50 % of whatever is vectorised remains legally delegated to a Plan Parcial / PERI / ED and
  correctly publishes nothing.
- **A negative legal answer is a successful outcome, not a blocked one.** If Art. 8.3.1 governs, NZ 3
  publishes *"NZ-3 intentionally has no computable municipal envelope"* — a determination covering 60.46 %
  of Madrid, terminal and correct.
- **Ordering follows.** Where the legal grant is unresolved, engineering on that dataset is frozen: measuring
  the extent of Madrid's layers 2/12 has value **only** in the branch where implementation is authorised.
  Do not spend engineering effort solving problems the ordinance may prohibit.
- **This ADR is cited, not re-argued**, by every city dossier and by the register itself.
