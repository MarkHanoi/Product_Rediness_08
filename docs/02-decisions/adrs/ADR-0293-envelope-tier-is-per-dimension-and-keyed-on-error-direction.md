# ADR-0293 — The envelope tier is PER DIMENSION, and the boundary is drawn on ERROR DIRECTION, not on legal provenance

**Status**: **ACCEPTED** 2026-08-02 · founder-authored · **supersedes nothing; refines
[ADR-0283](./ADR-0283-authoritative-publication-bounds-knowledge-unknown-is-valid.md)**
**Related**: [C64](../contracts/C64-ENVELOPE-COMPILER.md) ·
[REGIONAL-INTAKE-LIST](../../04-reference/standards/REGIONAL-INTAKE-LIST.md) ·
[MADRID-DATA-INVENTORY](../../04-reference/jurisdictions/es/es-md/MADRID-DATA-INVENTORY.md) ·
[ES-LEGAL-COUNSEL-QUESTIONS Q4](../../04-reference/jurisdictions/es/ES-LEGAL-COUNSEL-QUESTIONS-2026-08-02.md)

---

## Context

Four of Spain's richest regional datasets — **Madrid SIT, Castilla y León SIUCyL, Balears, Aragón** —
**disclaim their own legal authority.** The obvious response is a *tier*: ship them labelled
"indicative". The obvious response is **half right, and the half that is wrong is dangerous.**

⛔ **The tier boundary must be drawn on ERROR DIRECTION, not on legal provenance — because those are
two different blockers and only one of them a colour can fix.**

## The one a colour fixes — **MISSING CITATION**

SIT says **14 m**; **you cannot name the article.** The number is *probably right* — SIT extracted it
from the approved plan — **you just cannot prove which paragraph.**

⭐ **That is honest to ship as indicative:** *"14 m, source: SIT regional layer, no binding legal
value, verify against the municipal PGOU."* **Every Spanish planning viewer already ships exactly
this, with exactly that disclaimer.** It is a **recognised product category** and users know how to
read it.

## The one a colour does NOT fix — **MISSING CONSTRAINTS**

If **Barajas caps that parcel at 9 m** and you show **14 m**, ⛔ **the label does not help — because
the failure mode is someone BUILDING TO YOUR NUMBER.**

## ⭐ The distinction is DIRECTION

| | Symmetry | Can a caveat discharge it? |
|---|---|---|
| **Uncertain provenance** | **SYMMETRIC** — the number might be wrong *either way* | ✅ **Yes.** A caveat lets the user decide. |
| **Missing downward constraint** | ⛔ **ASYMMETRIC** — it can **only ever OVER-GRANT** | ❌ **No.** |

**Our own doctrine already settled this once.** ⭐ **Madrid capital was withheld with SIX computable
parameters** because its binding ceiling was unobtainable — *"an upper bound with no ceiling is the
L-616 defect verbatim."* **Shipping the region as indicative while the capital stays withheld for the
same defect would be INCONSISTENT — and the inconsistency is the thing that is hard to defend later.**

---

## Decision — **TIER PER DIMENSION, NOT PER ENVELOPE**

| Dimension | Source | Treatment |
|---|---|---|
| **Footprint** | SIT | **indicative — SHOWN** |
| **Height** | SIT | **indicative — SHOWN**, with an ⭐ **EXPLICIT UNBOUNDED MARKER** where airport / heritage / flood is **unchecked** |
| **Any dimension where a constraint is KNOWN TO APPLY and is UNMEASURED** | — | ⛔ **REFUSE THAT DIMENSION. DO NOT ESTIMATE IT.** |

⇒ ⭐ **Madrid renders as a FOOTPRINT WITH AN OPEN TOP and a STATED REASON — rather than a box that
looks complete.** That is **honest, VISUALLY OBVIOUS, and still far more useful than nothing.**

> ⛔ **A closed box is a claim. An open top is a statement of what we do not know.** The renderer must
> make the difference impossible to miss — this is the §CONTEXT-DATA-HONESTY rule applied to geometry
> rather than to a value.

## Consequences

⭐ **If the indicative tier is acceptable, this is NOT just Madrid.** **Castilla y León, Balears and
Aragón all become shippable at that tier**, since they carry the same disclaimer. **That is the
unlock**, and it is worth more than any single region.

⚠ **It does not lower the constraint bar anywhere.** Item 7 of the intake list —
heritage · airport · flood · infrastructure · environmental — is **missing in all five cities,
INCLUDING the one that is published.** Per-dimension tiering makes that absence **visible**; it does
not make it **acceptable**.

## ⭐ It rewrites the counsel question

**Not** *"can we cite this?"* — **but:**

> ⛔ **What liability attaches to a CLEARLY-LABELLED INDICATIVE envelope, and does labelling actually
> DISCHARGE it — particularly where a KNOWN CONSTRAINT CATEGORY IS UNMODELLED?**

⭐ **That is the question worth paying for, and it is now the highest-value one on the board.**
