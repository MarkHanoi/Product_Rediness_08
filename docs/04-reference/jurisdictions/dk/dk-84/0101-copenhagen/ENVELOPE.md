# ENVELOPE — Copenhagen / København (kommune 0101)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: STRUCTURED-FROM-PROVIDER + a Copenhagen STUDY default — Axis 4 `not-assessed` (`pending-implementation`)

Unlike a no-pack city, Copenhagen has a **working buildable-envelope path** — but the *completion*
coverage % has not been measured, so the axis is honestly `not-assessed`.

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | `matrikel-dk` (Datafordeler `mat:Jordstykke`) | ⚠️ wired, **credential-gated** (`DATAFORDELER_USERNAME/PASSWORD`) |
| **S2 — zone source** | Plandata national WFS | ✅ **live, keyless** (`DkZoningProvider` + `server/plandataZoningProxy.js`) |
| **S3 — rule shape** | structured-from-provider | ✅ `ZoningRulesEngine` (FAR × height inset, no registry pack — DK is provider-resolved) |
| **S4 — city STUDY default** | *karré* courtyard depth band | ⚠️ `rulepacks/dkPerimeterBlock.ts` (L-619) — **STUDY, human-gated, NOT certified** |
| **S5 — honest refusal** | cited "numbers-in-the-PDF" refusal | ✅ `rulepacks/dkPlandataRefusal.ts` (never the generic estimate) |

**Why `not-assessed`, not a %:** Axis 4 is `Σ (buildable_land_share × pack_tier_weight)`, and **no
per-city coverage measurement exists**. The perimeter-band default is a **constructed STUDY** number
(`constructed-amber` at best), deliberately under-stating the building (C58 §1.4) — it must NOT be
counted as `certified`. The `certified` tier requires the PENDING L-449 sign-off (`dk/sources/VERIFICATION.md`).
DK publishes **no** structured setbacks/ground-coverage (byggelinjer live in a separate dataset + the plan PDF),
which is exactly why the karré courtyard needed the block-derived band rather than a real inset.

**Do NOT** promote the STUDY band to a certified envelope or reuse another plan's numbers — every FAR/height
value is per-plan (C58 §1.2).

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `dk/ENVELOPE-RULES.md`, `rulepacks/dkPerimeterBlock.ts` (L-619).*
