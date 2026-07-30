# Buildable-envelope status — Genève (BFS 6621)

> Feeds C63 **ENVELOPE** axis. The axis score is COMPUTED from `rulepacks/registry.ts packsByZone` × each
> clau's buildable-land share (C63 §3 Axis 4) — never hand-typed. A cited **refusal** is 100 % honest even at
> 0 % complete (C63 §3.1). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO CITY PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | swisstopo AV (national, `swisstopo-av`) | ✅ national provider wired; GE live-verified |
| **S2 — router predicate** | per-city bbox | ❌ none specific to GE (national `isInSwitzerland` only) |
| **S3 — zone source** | geodienste `ms:grundnutzung` (GE `full`) / ÖREB GE RDPPF | ⚠️ endpoints live, `siteDispatch.ts` wiring unconfirmed |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none for Genève (only Zürich has a city BZO pack) |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ national `chZoning.ts` refusal pack only |

## Rule KIND (ADR-0270 / C58 §2.2)
`tiered-occupation` (indice d'utilisation + gabarit height) — the Swiss Nutzungsplanung norm; confirm the
canton GE LCI/PLQ specifics before any pack.

## Coverage by zone / clau
| Zone / clau | Buildable-land share | Pack disposition | Confidence | Note |
|---|---|---|---|---|
| any GE zone | `not-measured` | **cited-refusal** (`chZoningEnvelopeRefusal`) | `null` | national pack: zone identified, density/height named as missing |

## Refusal ledger (honesty)
Every Genève parcel returns the national **cited refusal**: the zone identity is delivered (structured, from
geodienste/RDPPF) and the buildable envelope is refused because the indice d'utilisation + gabarit are not
published as structured data for GE. `regime` / `legal` / `coverage-gap`: none fabricated — a positive cited
answer, per §CONTEXT-DATA-HONESTY.

## What would raise the ENVELOPE axis
`Transcribe + human-verify the canton GE LCI/PLQ gabarit + indice → register a GE city pack (the Zürich BZO
play) · unlocks a constructed envelope · effort High` — feeds `RATE-IMPLEMENTATION-PLAN.md`.

---
*Authority: C58 · ADR-0279 · ADR-0270 · C63 §3 Axis 4. Feeds: `RATE.md`. Pack: national
`packages/site-parcel-data/src/rulepacks/chZoning.ts` (cited-refusal); no GE city pack.*
