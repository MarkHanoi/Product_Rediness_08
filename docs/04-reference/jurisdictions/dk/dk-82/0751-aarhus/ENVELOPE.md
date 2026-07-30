# ENVELOPE — Aarhus (kommune 0751)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: STRUCTURED-FROM-PROVIDER (national), no city-specific pack — Axis 4 `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | `matrikel-dk` (Datafordeler `mat:Jordstykke`) | ⚠️ wired nationally, **credential-gated** |
| **S2 — zone source** | Plandata national WFS | ✅ **live, keyless** (`DkZoningProvider`) |
| **S3 — rule shape** | structured-from-provider | ✅ `ZoningRulesEngine` (FAR × height inset; no registry pack — DK is provider-resolved) |
| **S4 — city STUDY default** | *karré* / perimeter band | ❌ none for 0751 (`dkPerimeterBlock` is Copenhagen-specific, L-619) |
| **S5 — honest refusal** | cited "numbers-in-the-PDF" refusal | ✅ `rulepacks/dkPlandataRefusal.ts` (national) |

**Why `not-assessed`, not a %:** Axis 4 is `Σ (buildable_land_share × pack_tier_weight)`, and **no per-city
coverage measurement exists** for Aarhus. DK publishes no structured setbacks/ground-coverage (byggelinjer are
a separate dataset), so a certified envelope needs the per-plan legal source + the PENDING L-449 sign-off.
**Do NOT** reuse Copenhagen's or another plan's numbers — every FAR/height value is per-plan (C58 §1.2).

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `dk/ENVELOPE-RULES.md`.*
