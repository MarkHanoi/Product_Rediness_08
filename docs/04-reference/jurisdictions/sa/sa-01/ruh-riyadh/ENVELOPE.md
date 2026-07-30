# ENVELOPE — Riyadh (UN/LOCODE RUH)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: PACK AUTHORED, NOT WIRED — `not-assessed` (`pending-implementation`)

Unlike a bare no-pack city, Riyadh has an **authored** national-footprint rule pack — but it is not
registered, not signed, and solver coverage is therefore unmeasured. Axis 4 stays `not-assessed`.

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Balady/U-Maps cadastre (national) | 🟡 registered but **footprint-fallback** (geo-fenced, L-606) |
| **S2 — router predicate** | Riyadh bbox in `providers/` | ❌ `providers/riyadhBbox.ts` is a WIRING TODO |
| **S3 — zone source** | no wired regional zone-GIS | ❌ none (national law; no SA-01 instrument) |
| **S4 — rule pack** | `rulepacks/saRiyadhDemo.ts` | ✅ **authored** (`sa-villa` 0.75 §4-1 cl.1 / `sa-apartment` 0.65 §4-2 cl.1 + `resolveSaudiSetbacks` `max(w/5,{3,2,2})`) |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ **not registered** (WIRING TODO in the pack) |

**The vertical is an HONEST refusal, not a gap (C63 §3.1).** Height/floors are a field-level BOUNDED
cited-null refusal — the national CEILING is cited (villa ≤14 m §5-1-5 cl.3 & ≤G+1+annex §3-1; apt
≤23 m §3-2) but the exact value beneath it defers to the Amanat Riyadh approved plan (§4 cl.1) and
RCRC/ROSHN/ADA development-authority overrides (§1 cl.3), every reachable source geo-fenced. Rendering
a maxHeight below the cap would OVER-STATE (C58 §1.4) — so it refuses. **Do NOT invent a per-zone number.**

**What moves Axis 4:** (1) wire + sign the pack (L-449) → the 66.7 % national footprint becomes a
*certified* envelope; (2) an in-SA read of the RCRC/ADA per-corridor height tables converts the vertical
refusal to a cited value. See `RATE-IMPLEMENTATION-PLAN.md` Phases 1–2.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `findings/L-606-RIYADH-DEMO-PACK-AND-PROBES.md`.*
