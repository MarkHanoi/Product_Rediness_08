# Buildable-envelope status — Bern (BFS 0351)

> Feeds C63 **ENVELOPE** axis. The axis score is COMPUTED from `rulepacks/registry.ts packsByZone` × each
> clau's buildable-land share (C63 §3 Axis 4) — never hand-typed. A cited **refusal** is 100 % honest even at
> 0 % complete (C63 §3.1). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: NO CITY PACK — `not-assessed` (`pending-implementation`)

| Slot | What it is | State |
|---|---|---|
| **S1 — parcel provider** | swisstopo AV (national, `swisstopo-av`) | ✅ national provider wired (all-canton) |
| **S2 — router predicate** | per-city bbox | ❌ none specific to BE (national `isInSwitzerland` only) |
| **S3 — zone source** | geodienste `ms:grundnutzung` (BE `incomplete`) / ÖREB BE | ⚠️ WFS partial for BE; ÖREB BE endpoint carries zone-ID; wiring unconfirmed |
| **S4 — rule pack** | `rulepacks/*.ts` | ❌ none for Bern (only Zürich has a city BZO pack) |
| **S5 — registration** | `rulepacks/registry.ts` | ❌ national `chZoning.ts` refusal pack only |

## Rule KIND (ADR-0270 / C58 §2.2)
`tiered-occupation` (Ausnützungsziffer / Baumassenziffer + max Gebäudehöhe) — the Swiss Nutzungsplanung norm;
confirm the City of Bern Bauordnung specifics before any pack.

## Coverage by zone / clau
| Zone / clau | Buildable-land share | Pack disposition | Confidence | Note |
|---|---|---|---|---|
| any BE zone | `not-measured` | **cited-refusal** (`chZoningEnvelopeRefusal`) | `null` | national pack: zone identified (partial for BE), density/height named as missing |

## Refusal ledger (honesty)
Every Bern parcel returns the national **cited refusal**: zone identity delivered (partial via ÖREB BE), the
buildable envelope refused because the Ausnützungsziffer + Gebäudehöhe are not published as structured data for
BE. Nothing fabricated — a positive cited answer (§CONTEXT-DATA-HONESTY).

## What would raise the ENVELOPE axis
`Transcribe + human-verify the City of Bern Bauordnung + BE BauG → register a BE city pack (the Zürich BZO
play) · unlocks a constructed envelope · effort High` — feeds `RATE-IMPLEMENTATION-PLAN.md`.

---
*Authority: C58 · ADR-0279 · ADR-0270 · C63 §3 Axis 4. Feeds: `RATE.md`. Pack: national
`packages/site-parcel-data/src/rulepacks/chZoning.ts` (cited-refusal); no BE city pack.*
