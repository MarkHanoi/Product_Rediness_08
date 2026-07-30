# ENVELOPE — Amsterdam (CBS 0363)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | Kadaster BRK via PDOK (`pdok-nl`) | ✅ national provider wired + live (`parcelProviders/registry.ts`) |
| **S2 — router predicate** | per-city bbox in `providers/` | ⚠️ national `isInNetherlands` only; none specific to 0363 |
| **S3 — zone source** | omgevingsplan via DSO / `ruimtelijkeplannen.nl` | ⚠️ national register known, NOT wired into `siteDispatch.ts` |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none for Amsterdam |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ none |

**Structural note (Amsterdam / NL).** Unlike Paris (gabarit KIND) or Brussels (RRU formula-in-PDF), the Dutch
omgevingsplan tends to express the envelope as **direct structured attributes** — *goothoogte* (eaves height),
*bouwhoogte* (building height), *bebouwingspercentage* (coverage %), and *functie* (use) per *gebied* — which,
if wired, is a Lyon-style structured-attribute case rather than a new engine KIND. The blocker is therefore
**sourcing + wiring the DSO omgevingsplan feed**, not inventing a mechanism. Two caveats: (1) the Omgevingswet
transition (in force 1 Jan 2024) means a parcel may still be governed by a legacy bestemmingsplan under
transitional law; (2) welstand (aesthetic) and heritage overlays apply on top.

No solver coverage can be measured until a pack exists. **Do NOT reuse another municipality's numbers**
(C58 §1.2) — omgevingsplan values are per-gemeente. See `LEGISLATION-RATE.md`.

*Cross-refs: C58, ADR-0279, C63 §3 Axis 4, `./LEGISLATION-RATE.md`, `../../README.md`.*
