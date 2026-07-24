# New York City (3651000, New York, USA) — what is true now

**Level:** municipality · **ISO/statistical id:** `us-ny` state · `3651000` place FIPS (state 36 + place 51000) · **Pack id:** `us-ny-3651000-new-york-city`
**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

> NYC is the **third US pilot city** — most complex, most documented zoning code in the US,
> but also the most sources available (ZOLA, ZAP, city open data). Pilot after Chicago and LA.
> Analogous to Berlin in the Germany sequencing: richest data, highest complexity.

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → NYC Zoning Resolution (ZR) → zoning district → development standards (FAR, sky exposure plane, setback, lot coverage) → special purpose district / contextual overlay (where applicable)`.
- **Legal basis:** New York State Town Law and General City Law authorise municipal zoning. NYC Charter §200 et seq. establishes the City Planning Commission. The NYC Zoning Resolution (in force since 1961, continually amended) is the primary governing instrument. **This is one of the most studied and documented zoning codes in the US.**
- **Zone code vocabulary:** NYC uses its own system:
  - **Residential:** `R1-1` through `R10H` (low-density single-family to high-density tower)
  - **Commercial:** `C1-1` through `C8-4` (local retail to heavy commercial/industrial)
  - **Manufacturing:** `M1-1` through `M3-2` (light through heavy industrial)
  - **Special Purpose Districts:** dozens of overlaid districts (Special Hudson Yards District, Special Midtown District, Special Downtown Brooklyn District, etc.)
  - **Contextual suffix:** `-A`, `-B`, `-X` (contextual zoning limiting bulk regulations)
- **Rule KIND:** primarily `coverage-and-far` — FAR is the central density metric. Sky Exposure Plane (SEP) governs building envelope shape (setback above a certain height). Height regulations vary: some districts have absolute height limits; others use FAR + sky exposure plane without an absolute maximum.
- **Unique features:**
  - **Floor Area Bonus system:** bonus FAR available for affordable housing (Inclusionary Housing), POPS (Privately Owned Public Spaces), subway improvements, etc. FAR is not a single number but a base + potential bonus.
  - **Special Purpose Districts (SPDs):** 80+ SPDs overlay the base zoning with modified or additional rules. SPDs are the NYC analogue of LA's Specific Plans — individually adopted instruments superseding or supplementing the Zoning Resolution.
  - **Contextual zoning:** R districts with `-A`/`-B`/`-X` suffixes use street wall and height-factor rules rather than FAR+SEP.
  - **ULURP (Uniform Land Use Review Procedure):** major land use changes require ULURP — a multi-month public review. Not an automated data source.
- **Legal-structure trap watch (P1):** SPDs, floor area bonuses, and air rights transfers (TDR — Transfer of Development Rights) make any given parcel's actual available FAR non-derivable from the base zone code alone. SPD fraction of parcels: significant in Manhattan and major commercial corridors.
- **NYC-specific advantage:** NYC publishes structured open data via ZOLA, ZAP, and `data.cityofnewyork.us`. The NYC Department of City Planning provides a Zoning Data API (ZOLA) that may return structured FAR and height limit information — this is a potentially free structured source with no equivalent in Chicago or LA.

---

## 2 — Pack status

Not yet started. No zone, use code, FAR, or height has been sourced for any specific NYC parcel.

| Zone / district | Kind | Disposition | Confidence | Note |
|---|---|---|---|---|
| All NYC zones | — | `unregistered` | `null` | No pack implemented |

---

## 3 — Granularity

NYC's zoning rules are applied at the **tax lot (parcel) level** via the Zoning Map. FAR, lot
coverage, and sky exposure plane are specified per zoning district. Block-level patterns exist
but the parcel is the unit of regulation.

**BBL (Borough-Block-Lot):** NYC's unique parcel identifier. Every NYC tax lot has a 10-digit
BBL (1-digit borough + 5-digit block + 4-digit lot). BBL is the join key for all NYC planning
data systems (PLUTO, MapPLUTO, ZOLA, ZAP). Use BBL, not a lat/lon, as the primary NYC parcel
routing key.

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

- **ZOLA / ZAP structured FAR/height data:** NYC's ZOLA (Zoning and Land use Application) and ZAP (Zoning Application Portal) provide parcel-level zoning data. Whether these return structured FAR and height limits as machine-readable fields (not just zone code) needs direct probing. If yes, NYC may have a significantly higher free rate than Chicago or LA.
- **MapPLUTO:** NYC's MapPLUTO dataset (`data.cityofnewyork.us`) contains tax lot data including `ZoneDist1` (primary zone) and `BldgClass`, `NumFloors`, `MaxAllwFAR`, `ResidFAR`, `CommFAR`, `FacilFAR`, `BuiltFAR`. The `MaxAllwFAR` field may provide the structured FAR value directly. **This is potentially the most important free structured zoning data source in all three US pilot cities — probe immediately.**
- **Special Purpose District coverage fraction:** what % of NYC parcels (by area or count) are governed by one or more SPDs? SPD rules often supersede or add to base zone FAR/height — the base zone answer is wrong for SPD parcels.
- **NYC 3D building data:** NYC publishes 3D building models (LOD2) — the "NYC 3D Model" dataset. Confirm free access and currency.
- **Floor area bonus fraction:** in Manhattan, a significant fraction of new development uses inclusionary housing bonuses. MapPLUTO's `MaxAllwFAR` should reflect bonus potential, but confirming this is critical.
- **TDR (air rights transfers):** some NYC parcels have purchased air rights from adjacent landmarks or other parcels. These are recorded in the BSA (Board of Standards and Appeals) and ZAP databases but are parcel-specific — no automated query returns them.
