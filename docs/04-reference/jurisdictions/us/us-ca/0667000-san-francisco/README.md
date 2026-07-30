# San Francisco (0667000 san-francisco, California, USA) — city dossier

**Level:** municipality (consolidated city-county) · **id:** `us-ca` · `0667000` (FIPS place = state 06 + place
67000) · **Pack id (== folder identity):** `us-0667000-san-francisco`
**Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

> Scorecard face = **[`RATE.md`](./RATE.md)** (composite master, C63). SF is **bake-covered** (`bake.mjs` REGIONS
> `sanfrancisco`, California extract, bbox `-122.52,37.70,-122.36,37.83`; `terrain.mjs` `us` = USGS 3DEP) but was
> previously unscaffolded — added this pass per governance. SF is a consolidated city-county (city == county).

## 1 — What governs here

- **Governing-instrument chain:** `parcel → SF Planning Code (zoning district) → height-and-bulk district (numeric
  height + bulk) → overlays (Coastal Zone, specific/area plans) → discretionary review (DR) / conditional use`.
- **Rule KIND (ADR-0270 / C58 §2.2):** closest to **tiered-occupation + explicit height** — SF pairs a
  **use/zoning district** with a separate **height-and-bulk district** (a numeric height limit + bulk envelope),
  rather than a citywide FAR. ⚠ Do not force a NYC-style FAR KIND onto SF.
- **Setback- vs alignment-governed:** bulk-district-governed (rear-yard + bulk controls), not a simple setback.
- **Legal-structure trap watch (P1):** Discretionary Review + conditional-use + numerous area/specific plans
  (e.g. Eastern Neighborhoods, Central SoMa) overlay the base district — the base answer is incomplete for them.

## 2 — Pack status

| Zone / district | Kind | Disposition | Confidence | Note |
|---|---|---|---|---|
| All SF | — | `unregistered` | `null` | No pack implemented |

## 3 — Granularity (C58 §1.11)

Regulation is per **parcel (assessor block-lot)** via the zoning map + the height-and-bulk map. SF is a single
city-county, so there is one Planning Code (no multi-jurisdiction routing within the city). The bake/terrain bbox
covers the SF peninsula city core.

## 4 — The number

**0 %** of clicks return a full, cited envelope. No pack implemented. The honest answer is a footprint + a
"requires SF Planning review" statement, never an invented height/FAR.

## 5 — Files in this folder

`RATE.md` (composite master) · `LEGISLATION-RATE.md` · `ENVELOPE.md` · `HEIGHT.md` · `RISK-REGISTER.md` ·
`NEXT.md` · `RATE-IMPLEMENTATION-PLAN.md` · `README.md` (this) · `sources/`.

## 6 — Open questions / unverified

- DataSF **height-and-bulk district** layer schema + coverage (the strongest SF structured lever) — probe.
- DataSF zoning-district layer numeric attributes vs code-only.
- SF Assessor parcel layer as a wired parcel provider (currently footprint-fallback).
- Overture/3DEP nDSM height join for SF (steep hills make relief + real height load-bearing).
