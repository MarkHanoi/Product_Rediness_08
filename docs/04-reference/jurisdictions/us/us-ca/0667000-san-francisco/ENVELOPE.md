# Buildable-envelope status — San Francisco (0667000)

> Feeds C63 **ENVELOPE** axis (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md` + C58). **Last updated:** 2026-07-30.
> **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | keyless US cadastre | ❌ none — `registry.ts` no US entry → footprint-fallback (SF Assessor parcels exist, NOT wired) |
| **S2 — router predicate** | SF bbox predicate | ❌ none |
| **S3 — zone source** | numeric zoning-GIS | ⚠️ DataSF zoning + height-and-bulk layers exist (free) but NOT wired into `siteDispatch.ts` |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none for SF |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

**Structural blocker (SF-specific).** SF's buildable envelope is a **use/zoning district × height-and-bulk
district** construction (a numeric height limit + bulk controls), not a citywide FAR. The numbers ARE published
on DataSF (unusually addressable for a US city), but they must be sourced + wired + verified, and the base answer
is incomplete where **area/specific plans** (Eastern Neighborhoods, Central SoMa …), the **Coastal Zone**, or
**Discretionary Review** apply. A dedicated pack + overlay handling is required before any SF parcel-level envelope.

No solver coverage can be measured until a pack exists. **Do NOT reuse another city's numbers** — SF's
height/bulk values are city-specific (C58 §1.2). A cited refusal is 100 % honest at 0 % complete (C63 §3.1).

## Refusal ledger (honesty)

Every SF parcel currently returns a `regime-undetermined` / `construction-incomplete` refusal (no pack). This is
a positive cited answer, never a fabricated figure.

## What would raise the ENVELOPE axis

`Wire the DataSF zoning + height-and-bulk layers as a zone source + build the height/bulk pack · unlocks SF's
published structured envelope · effort medium-high (overlay + DR handling)` — feeds `RATE-IMPLEMENTATION-PLAN.md`.

---
*Authority: C58 · ADR-0279 · C63 §3 Axis 4. Feeds: `RATE.md`.*
