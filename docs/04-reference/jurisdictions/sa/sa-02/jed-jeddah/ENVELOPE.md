# ENVELOPE — Jeddah (UN/LOCODE JED)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: PACK REUSED (national), NOT WIRED — `not-assessed` (`pending-implementation`)

Jeddah reuses the national `saRiyadhDemo.ts` footprint pack unchanged (own bbox), plus a heritage
overlay it does not hold. Not registered, not signed → solver coverage unmeasured → Axis 4 `not-assessed`.

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Balady/U-Maps cadastre (national) | 🟡 registered but **footprint-fallback** (geo-fenced) |
| **S2 — router predicate** | Jeddah bbox in `providers/` | ❌ none (national pack, Riyadh-authored) |
| **S3 — zone source** | no wired regional zone-GIS | ❌ none (national law; no SA-02 instrument) |
| **S4 — rule pack** | `rulepacks/saRiyadhDemo.ts` (national, reused) | ✅ authored — reused unchanged with the Jeddah bbox |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ not registered |

**Al-Balad (Historic Jeddah) heritage overlay — an HONEST refusal surface.** Parcels inside the UNESCO
property + buffer (inscribed 2014, boundary public) are governed by a conservation regime the national
footprint does not contain; the detailed JHD 651-building GIS is not confirmed open. Such a parcel →
a **correct heritage refusal**, not the national footprint (which would over-state). This is a fill
REDUCER done honestly (C63 §3.1), not a defect.

**The vertical refuses** identically to the national pack (villa ≤14 m §5-1-5 cl.3 / apt ≤23 m §3-2 cited;
exact = Amanat Jeddah + Jeddah Development Authority, §4 cl.1 / §1 cl.3, geo-fenced). **Do NOT invent a
per-zone number.**

**What moves Axis 4:** wire the Jeddah bbox + sign the pack (L-449); wire the public UNESCO boundary as a
refuse/flag overlay; an in-SA read of the Jeddah Development Authority height tables. See
`RATE-IMPLEMENTATION-PLAN.md`.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `LEGISLATION-RATE.md` (Al-Balad row).*
