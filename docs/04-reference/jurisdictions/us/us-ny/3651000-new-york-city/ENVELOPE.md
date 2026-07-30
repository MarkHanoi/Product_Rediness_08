# Buildable-envelope status — New York City (3651000)

> Feeds C63 **ENVELOPE** axis (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md` + C58). **Last updated:** 2026-07-30.
> **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | keyless US cadastre | ❌ none — `registry.ts` has no US entry → footprint-fallback (MapPLUTO exists but is NOT wired) |
| **S2 — router predicate** | NYC bbox predicate | ❌ none |
| **S3 — zone source** | numeric zoning-GIS | ⚠️ MapPLUTO `ZoneDist1`/`MaxAllwFAR` exist (free) but NOT wired into `siteDispatch.ts` |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none for NYC |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

**Structural blocker (NYC-specific).** The NYC Zoning Resolution is `coverage-and-far` KIND at core (FAR is the
central density metric) but the buildable envelope is a multi-layer construction: (1) base-district FAR +
**sky-exposure-plane** setback geometry, (2) **Special Purpose Districts** (80+ SPDs overlay/supersede base
numerics), (3) **floor-area bonuses** (Inclusionary Housing, POPS), and (4) **TDR / air-rights transfers** (per
parcel, recorded in BSA/ZAP — not derivable from the base zone). So even the rich MapPLUTO `MaxAllwFAR` is not a
final per-parcel envelope. A dedicated pack + SPD/air-rights handling is required before any NYC parcel-level
envelope is possible.

No solver coverage can be measured until a pack exists. **Do NOT reuse another city's numbers** — NYC's FAR/SEP
values are city-specific (C58 §1.2). A cited refusal is 100 % honest at 0 % complete (C63 §3.1).

## Refusal ledger (honesty)

Every NYC parcel currently returns a `regime-undetermined` / `construction-incomplete` refusal (no pack). This is
a positive cited answer, never a fabricated figure.

## What would raise the ENVELOPE axis

`Wire MapPLUTO (ZoneDist1 + MaxAllwFAR) as a zone source + build the FAR/SEP + SPD pack · unlocks NYC's rich free
FAR · effort high (SPD + air-rights complexity)` — feeds `RATE-IMPLEMENTATION-PLAN.md`.

---
*Authority: C58 · ADR-0279 · C63 §3 Axis 4. Feeds: `RATE.md`.*
