# Chicago (1714000, Illinois, USA) — what is true now

**Level:** municipality · **ISO/statistical id:** `us-il` state · `1714000` place FIPS (state 17 + place 14000) · **Pack id:** `us-il-1714000-chicago`
**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

> Chicago is the **recommended first US pilot city**: strong open-data tradition, confirmed
> Overture/USGS height pilot coverage (one of the three original pilot cities in the
> Overture/USGS height model), and a likely high Zoneomics coverage city.

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → Chicago Zoning Ordinance (Title 17, Chicago Municipal Code) → zoning district → development standard (FAR, height, setback, lot coverage)`.
- **Legal basis:** Illinois Municipal Code (65 ILCS 5/) grants home-rule municipalities the power to enact zoning ordinances. Chicago is a home-rule city. The Chicago Zoning Ordinance (Title 17) is the governing instrument for all parcels within city limits.
- **Zone code vocabulary:** Chicago uses a proprietary zone code system: `RS-1` through `RS-3` (Residential Single-Family), `RT-3.5` / `RT-4` (Two-Flat/Townhouse), `RM-4.5` through `RM-6.5` (Multi-Family), `B1` through `B3` (Neighborhood/Community/Regional Business), `C1`–`C3` (Commercial), `M1`–`M3` (Manufacturing), `DX`, `DS`, `DC`, `DR`, `D` (Downtown/Planned Manufacturing). No national lookup table applies.
- **Rule KIND:** primarily `coverage-and-far` — Chicago's downtown zones use FAR (Floor Area Ratio) as the primary density metric; residential zones use lot area per unit (LA/DU) and coverage. Height is regulated separately.
- **Special purposes / overlays:** Chicago has numerous Special Character Overlay Districts, Planned Developments (PDs), Lakefront Protection Ordinance overlay (in Lakefront Protection District — 600 ft from lake), Airport Overlay Districts (O'Hare / Midway approach zones).
- **Legal-structure trap watch (P1):** Planned Developments (PDs) are a significant share of downtown and major redevelopment sites. A PD supersedes the base zone — the base zone district code on a parcel does not give the governing rule for PD-governed parcels. Regrid/Zoneomics may or may not flag this correctly.

---

## 2 — Pack status

Not yet started. No zone, use code, FAR, or height has been sourced for any specific Chicago parcel.

| Zone / district | Kind | Disposition | Confidence | Note |
|---|---|---|---|---|
| All Chicago zones | — | `unregistered` | `null` | No pack implemented |

---

## 3 — Granularity

Chicago's zoning rules are applied at the **parcel level** via the Chicago Zoning Map. FAR, height limits, and setbacks are specified per zone district (parcel → zone district → ordinance table). Downtown zones (D-series) may have parcel-specific FAR credits via floor area bonuses.

---

## 4 — The number

**0%** of clicks return a full, cited envelope. No pack is implemented. Denominator: all private-buildable parcels within the Chicago municipal boundary (~600,000 parcels).

---

## 5 — Files in this folder

- `NEXT.md` — where we stopped, blockers, TRIP-WIRES, resume steps.
- `RATE.md` — city-level data readiness rate.
- `RATE-IMPLEMENTATION-PLAN.md` — phased plan from 0% to ceiling.
- `sources/SOURCES.md` — per-field citations (the trust gate).
- `sources/VERIFICATION.md` — the human sign-off.

---

## 6 — Open questions / unverified

- **Chicago open zoning dataset (data.cityofchicago.org):** does the zoning district shapefile include numeric FAR, max_height, and setback attributes, or only zone district codes? This is the single highest-value free probe for Chicago.
- **Planned Development coverage fraction:** what % of Chicago parcels (by area or count) are governed by a PD rather than the base zone? PD parcels require individual ordinance reads.
- **Zoneomics field completeness for Chicago:** does Zoneomics return non-null FAR and max_height for a sample of Chicago zone types (RS-1, RT-4, B3, D-DX)?
- **Overture/USGS height coverage for Chicago bbox:** Chicago was named in the original Overture/USGS pilot (Santa Clara, Boston, Chicago) — confirm the coverage extent and whether it covers the full city or a downtown-only bbox.
- **Chicago 3D building data:** Chicago publishes 3D building data on its open-data portal (`data.cityofchicago.org`) — "Building Footprints (current)"  and possibly a 3D layer. Confirm whether height attributes are included.
- **Lakefront Protection Ordinance boundary:** the LPO applies within 600 ft of the Lake Michigan shoreline. Does Zoneomics flag this overlay, or must it be sourced separately?
