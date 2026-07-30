# Buildable-envelope status — Zürich (BFS 0261)

> Feeds C63 **ENVELOPE** axis. The axis score is COMPUTED from `rulepacks/registry.ts packsByZone` × each
> clau's buildable-land share (C63 §3 Axis 4) — never hand-typed. A cited **refusal** is 100 % honest even at
> 0 % complete (C63 §3.1). `certified` needs a signed `sources/VERIFICATION.md` (L-449). **Last updated:**
> 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: PACK EXISTS — `not-assessed` (`not-queried` — coverage unmeasured)

Unlike Genève/Bern (national cited-refusal only), Zürich holds a **registered City-of-Zürich BZO rule pack**.

## Rule KIND (ADR-0270 / C58 §2.2)
**`tiered-occupation` / density-and-height model** (Ausnützungsziffer + Vollgeschosse + max Gebäudehöhe) —
NOT alignment-governed. The Swiss Nutzungsplanung norm; confirmed for Zürich BZO 700.100.

## Coverage by zone / clau
| Zone / clau | Buildable-land share | Pack disposition | Confidence | Note |
|---|---|---|---|---|
| BZO residential `W2b…W6` | `not-measured` | `constructed` envelope | `estimated-ruleset` | AZ × area → GFA → floors (Vollgeschosse) → height, per `chZurichBzoCatalogue.ts` (91/99 + 2016 regimes) |
| BZO centre `Z5–Z7` | `not-measured` | `constructed` envelope | `estimated-ruleset` | AZ 200/230/260 %, identical across regimes |
| Any parcel — regime unresolved | `not-measured` | **cited-refusal** (`regime-ambiguous`) | `null` | the honest floor — a guessed regime is a fabricated height |
| Non-ZH-catalogued zones / cantons | `not-measured` | cited-refusal (national `chZoning.ts`) | `null` | zone-ID + named missing density |

## Refusal ledger (honesty)
- **`regime-ambiguous`** (`construction-incomplete` / `regime-undetermined`) — the W2bIII 8.5 m vs 9.0 m
  height split means the governing BZO regime must be resolved BEFORE a height is emitted; the crosswalk
  (`ZURICH_BZO_REGIME_BY_DOC`) is populated from 12 real docs but the most frequent docid (6808, image-only)
  is unclassifiable → those parcels refuse. `resolveZurichBzoRegime` refuses rather than guess.
- **National cited-refusal** (`chZoningEnvelopeRefusal`) — for any CH parcel the ZH catalogue does not cover,
  the national pack identifies the zone (structured) and names the missing density/height (§CONTEXT-DATA-HONESTY).

## Why the axis is `not-assessed` (not a number)
A pack IS implemented and produces `estimated-ruleset` envelopes — so this is NOT `pending-implementation`.
But (1) no C58 **coverage survey** has measured what share of Zürich buildable land resolves to a
constructed envelope vs a cited refusal, and (2) `estimated-ruleset` is below `certified`; `human-reviewed`
needs the un-contradicted signed `VERIFICATION.md`, whose per-parcel Zürich sign-off line is still UNSIGNED
(RISK R3). The scorecard function will compute the number once the coverage sample is drawn.

## What would raise the ENVELOPE axis
`Run the C58 buildable-land coverage survey for the ZH BZO zones · unlocks the measured ENVELOPE % · effort
Medium` — feeds `RATE-IMPLEMENTATION-PLAN.md`. Then resolve the docid-6808 regime ambiguity + sign the
per-parcel VERIFICATION line to lift the tier toward `certified`.

---
*Authority: C58 · ADR-0279 (`ENVELOPE-REPLICATION-STANDARD.md`) · ADR-0270 · C63 §3 Axis 4. Feeds: `RATE.md`.
Pack: `packages/site-parcel-data/src/rulepacks/chZurichBzo.ts` + `providers/chZurichBzoCatalogue.ts`.*
