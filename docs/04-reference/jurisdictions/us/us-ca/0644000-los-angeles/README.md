# Los Angeles (0644000, California, USA) — what is true now

**Level:** municipality · **ISO/statistical id:** `us-ca` state · `0644000` place FIPS (state 06 + place 44000) · **Pack id:** `us-ca-0644000-los-angeles`
**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

> Los Angeles is the **second US pilot city**: large market, significant architectural/BIM
> relevance, but heavier overlay use (California Coastal Commission, hillside overlays, specific
> plans) makes it structurally more complex than Chicago. Pilot after Chicago.

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → Los Angeles Municipal Code (LAMC) Chapter 1, Article 2 (Zoning) → zone district → development standard (FAR, height, setback, lot coverage) → overlay / specific plan (where applicable)`.
- **Legal basis:** California Government Code §65000 et seq. (Planning and Zoning Law) grants municipalities zoning authority. LA is a charter city with home-rule zoning authority. The primary instrument is the **Los Angeles Municipal Code (LAMC)** and the **General Plan** (which includes community plans).
- **Zone code vocabulary:** LA uses a layered system: base zone (e.g. `R1`, `RD1.5`, `R3`, `C1`, `C2`, `CM`, `M1`, `M2`) + height district suffix (e.g. `-1VL`, `-1`, `-2`, `-3`, `-4`) + supplemental use district. Example: `C2-1` = Community Commercial zone, Height District 1 (35 ft max). No national lookup table applies.
- **Rule KIND:** `coverage-and-far` for commercial/multi-family; `height-district` system governs maximum height. Height districts set the FAR ceiling in combination with base zone.
- **California Coastal Commission overlay:** LA contains the Coastal Zone (areas within ~1 mile of the Pacific coastline). Development within the Coastal Zone requires **California Coastal Commission (CCC)** approval in addition to city zoning. CCC jurisdiction supersedes city zoning in the Coastal Zone for development standards.
- **Specific Plans:** LA has dozens of active Specific Plans (Ventura/Cahuenga, Hollywood, Venice, etc.) that supersede the base LAMC zoning for their areas. Specific Plans are the LA equivalent of Chicago's Planned Developments — separately adopted instruments requiring individual reads.
- **Legal-structure trap watch (P1):** Specific Plans + Community Plan Implementation Overlays (CPIOs) + Q-conditions (Qualified conditions attached to zone change approvals) all supersede or modify the base zone. A parcel with a Q-condition has non-standard development limits that are not derivable from the base zone code alone. Fraction of parcels affected: significant in developed areas; not measured.

---

## 2 — Pack status

Not yet started. No zone, use code, FAR, or height has been sourced for any specific LA parcel.

| Zone / district | Kind | Disposition | Confidence | Note |
|---|---|---|---|---|
| All LA zones | — | `unregistered` | `null` | No pack implemented |

---

## 3 — Granularity

LA's zoning rules are applied at the **parcel level** via the LA Zoning Map. Height and FAR
are specified per zone + height district combination. Community plans provide additional
guidance at the neighbourhood level but the parcel-level rule comes from the zoning map.

---

## 4 — The number

**0%** of clicks return a full, cited envelope. No pack is implemented.

---

## 5 — Files in this folder

- `NEXT.md` — where we stopped, blockers, TRIP-WIRES, resume steps.
- `RATE.md` — city-level data readiness rate.
- `RATE-IMPLEMENTATION-PLAN.md` — phased plan from 0% to ceiling.
- `sources/SOURCES.md` — per-field citations (the trust gate).
- `sources/VERIFICATION.md` — the human sign-off.

---

## 6 — Open questions / unverified

- **LA open zoning dataset (geohub.lacity.org):** does the zoning layer include numeric FAR and max height attributes, or only the zone code string? The zone code alone (`C2-1`) encodes height district, but deriving the actual FAR requires reading LAMC tables.
- **Height district table:** LAMC Article 2 §12.21.1 defines height districts (1VL = 30 ft, 1 = 45 ft, 2 = 6 stories or 75 ft, 3 = as-of-right unlimited with FAR cap, 4 = unlimited). These are fixed tables — can be built as a static lookup from the ordinance.
- **Specific Plan coverage fraction:** what % of LA parcels (by area or count) fall within an active Specific Plan? This is the LA equivalent of Chicago's PD fraction.
- **California Coastal Commission boundary (GIS layer):** the CCC Coastal Zone boundary is published by CCC as a GIS layer. Whether it is queryable via an API or only as a bulk download needs confirmation.
- **Zoneomics field completeness for LA zones:** does Zoneomics handle the height-district-suffix system correctly (e.g. returning the correct FAR for `C2-1` vs `C2-2`)?
- **LARIAC (LA Region Imagery Acquisition Consortium):** LA participates in LARIAC, which periodically produces LiDAR-derived building heights and possibly LOD2 models for LA County. Confirm whether LARIAC products are freely available and current.
