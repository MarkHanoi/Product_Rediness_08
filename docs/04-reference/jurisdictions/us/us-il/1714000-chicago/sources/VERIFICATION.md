# Chicago (1714000) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value has been verified. Scaffold only.

## What was checked, against which document version

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| Governing instrument (Chicago Municipal Code Title 17) | Published ordinance reference, 2026-07-24 | Secondary citation | ⚠ `corroborated` — existence confirmed; text not read |
| Zone code vocabulary | Chicago Zoning Ordinance research, 2026-07-24 | Secondary research | ⚠ `corroborated` — zone code list confirmed from published sources |
| Open zoning dataset existence (`5s3e-9pji`) | Chicago Open Data Portal catalogue, 2026-07-24 | Portal search | ⚠ `corroborated` — dataset listed; field schema not probed |
| Overture/USGS Chicago pilot | Overture Maps Foundation announcement | Secondary | ⚠ `corroborated` — Chicago named; coverage extent not probed |

## What I could NOT confirm (and why it stays unshippable)

- **FAR, height, setback for any Chicago zone district** — requires live ordinance read or Zoneomics API probe.
- **Whether Chicago open zoning dataset includes numeric attributes** — requires `curl` probe.
- **Planned Development boundary layer** — not searched on data.cityofchicago.org yet.

## Caveats that must remain visible in the product

- Planned Development (PD) parcels supersede the base zone — never serve a base-zone envelope
  for a PD parcel. Flag and refuse pending PD-specific ordinance sourcing.
- Chicago's D-series (downtown) zones have floor area bonus systems — FAR is not a single
  number per zone but can vary based on bonuses. Any Zoneomics-derived downtown FAR must carry
  this caveat.

**Sign-off:** NOT SIGNED — awaiting Phase 0 probe results.
