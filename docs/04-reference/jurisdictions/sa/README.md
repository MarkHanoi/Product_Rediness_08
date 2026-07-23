# Saudi Arabia (`sa`) — national data layer: what is true now

**Level:** country (ISO 3166-1 alpha-2 `sa`) · **Law shape:** national footprint + municipal/authority
vertical override · **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED ·
**Status:** national law read (`VERIFIED-LIVE` primary); Riyadh demo pack authored, not wired.

> Migrated from `docs/04-reference/saudi-arabia/` to the ISO tree on 2026-07-23 (L-606), matching
> `jurisdictions/es/`. The demo city is **Riyadh** — see [`sa-01/ruh-riyadh/`](sa-01/ruh-riyadh/README.md).

## 1 — What governs, nationally
- **Governing-instrument chain:** `plot → 2024 MOMRAH residential decision (national) → plot class
  (villa/apartment/apt-commercial/apt-administrative) → the setback formula + coverage table`.
  Then, for the VERTICAL extent only: `→ municipal approved plan (المخطط المعتمد) → development-authority
  regulations (override on conflict)`.
- **Rule KIND (ADR-0270 / C58 §2.2):** **`setback`** — the simplest kind. Footprint =
  `plot ⊖ max(streetWidth/5, {front 3, side/rear 2})`, capped by `coverage × plotArea`
  (villa 0.75 / apartment 0.65 ground). No block dissolve, no depth construction, no FAR.
- **Setback-governed, not alignment-governed** — the decision states real separation distances, so a
  per-edge inset is the native shape (unlike Barcelona's *alineació a vial*).
- **Legal-structure trap (P1): PRESENT, but on the VERTICAL axis only.** Floors + max height defer to
  the municipal plan (Ch. 4 §4.1) and development-authority regs prevail on conflict (Ch. 1 §1) — the
  "local plan silently governs" trap. Unlike Barcelona (62.8 % of the city on derived planning that
  sets the WHOLE envelope), here the FOOTPRINT stays nationally grounded; only height/floors defer.

## 2 — National data layer status
| Layer | Status | Source |
|---|---|---|
| Setbacks (formula) | ✅ `VERIFIED-LIVE` primary | 2024 MOMRAH decision Ch. 4 §4.2 |
| Ground coverage by class | ✅ `VERIFIED-LIVE` primary | Ch. 4 (villa p18 / apt p22) |
| Residential FAR | ⛔ **does not exist** in the residential regime (0 hits) | Ch. 2–7 |
| Floors / max height | 🔴 **not national** — municipal plan + authority override | Ch. 4 §4.1 / Ch. 1 §1 |
| Parcel geometry + classification | 🟡 exists (Balady `MapServer/28`) but **geo-fenced** | `SAUDI-UMAPS-API-ENUMERATION.md` |

## 3 — Granularity (C58 §1.11)
The national footprint values are **national** granularity (one formula/table for the whole Kingdom).
The demo applies them at **parcel** granularity via a user-drawn plot + user-supplied street width.
Height/floors would be **planning-zone** granularity (municipal) — not held.

## 4 — Files here
- `NEXT.md` — country overview: national blockers, TRIP-WIRES, resume steps.
- `SAUDI-ARABIA-ENTRY-ASSESSMENT.md` — the market-entry effort assessment (the reasoning of record).
- `SAUDI-PRIMARY-DECISION-EXTRACT.md` — the primary 2024 MOMRAH decision, read live, page-cited.
- `SAUDI-UMAPS-API-ENUMERATION.md` — the Balady parcel backend, enumerated (exists, geo-fenced).
- `sources/SOURCES.md` · `sources/VERIFICATION.md` — the national trust gate.
- `sa-01/ruh-riyadh/` — the **Riyadh demo** (the authored rule pack's provenance home).

## 5 — Open questions / unverified
- Per-city machine-readable floor/height by zone: every reachable candidate (trc.alriyadh.gov.sa,
  rcrc.gov.sa, istitlaa.ncc.gov.sa) is geo-fenced/WAF-blocked from outside SA — **measured negatives
  on shape, NOT proof of absence** (§CONTEXT-DATA-HONESTY). See the Riyadh `findings/`.
- The neighbour-waiver mechanic (side setback waivable by mutual agreement) — **not found** in the
  primary residential decision; do not carry as fact.
