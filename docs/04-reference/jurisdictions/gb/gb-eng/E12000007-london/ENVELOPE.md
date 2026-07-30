# Buildable-envelope status — Greater London (E12000007)

> Feeds C63 **ENVELOPE** axis (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md` + C58). **Last updated:** 2026-07-30.
> **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | keyless GB cadastre | ❌ none — `registry.ts` has no GB entry → footprint-fallback |
| **S2 — router predicate** | London bbox predicate | ❌ none |
| **S3 — zone source** | numeric zoning-GIS | ❌ none — GB planning is discretionary (no by-right zone) |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none for London |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

**Structural blocker (GB-specific).** London has **no as-of-right buildable envelope.** Development is decided by
discretionary determination against the **GLA London Plan** + the relevant **borough Local Plan**, weighed with
the NPPF and design review. There is no by-right FAR/height field to solve. Any London envelope would first need:
(1) modelling of **Permitted Development Rights** (the only genuinely by-right slice), and (2) mandatory refusal
overlays — **Conservation Areas** (many in inner London), **Listed Buildings**, **Article 4 Directions**, and the
**London View Management Framework (LVMF)** protected sight-lines. None is packed.

No solver coverage can be measured until a pack exists. **Do NOT synthesise a by-right envelope** from London Plan
density guidance — that guidance is indicative policy, not a binding parcel-level number (C58 §1.2). A cited
refusal ("requires discretionary planning permission") is 100 % honest at 0 % complete (C63 §3.1).

## Refusal ledger (honesty)

Every London parcel currently returns, in effect, a `regime-undetermined` / `legal` refusal: the envelope is not
as-of-right. This is a positive cited answer, never a fabricated figure.

## What would raise the ENVELOPE axis

`Model Permitted Development Rights as the by-right slice · unlocks the only computable London envelope · medium
effort` — feeds `RATE-IMPLEMENTATION-PLAN.md`.

---
*Authority: C58 · ADR-0279 · C63 §3 Axis 4. Feeds: `RATE.md`.*
