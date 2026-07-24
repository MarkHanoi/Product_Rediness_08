# Los Angeles (0644000) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value has been verified. Scaffold only.

## What was checked, against which document version

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| Governing instrument (LAMC Title 1, Article 2) | Published code reference, 2026-07-24 | Secondary citation | ⚠ `corroborated` — existence confirmed; text not read |
| Zone code vocabulary (base + height district suffix) | LAMC structure research, 2026-07-24 | Secondary research | ⚠ `corroborated` — system confirmed from published sources |
| California Coastal Act authority | California Public Resources Code §30000 et seq. | Published statute reference | ✅ confirmed (legal basis published) |
| `geohub.lacity.org` existence | LA GeoHub portal, 2026-07-24 | Portal confirmed | ⚠ `corroborated` — portal exists; zoning layer field schema not probed |
| LARIAC programme existence | `gis.lacounty.gov/lariac/` | Secondary reference | ⚠ `corroborated` — programme confirmed; product currency/access not verified |

## What I could NOT confirm (and why it stays unshippable)

- **LAMC §12.21.1 height district FAR/height values** — table text not read; values cited in README are from secondary research, not primary source read.
- **Any numeric FAR, height, setback for any LA zone or parcel** — requires LAMC text read or Zoneomics probe.
- **Specific Plan boundary layer** — not searched on GeoHub.
- **Coastal Zone boundary as a queryable GIS API** — not probed.
- **LARIAC product access terms and currency** — not confirmed from the portal.

## Caveats that must remain visible in the product

- Specific Plan parcels supersede LAMC base zone rules — never serve a base-zone envelope
  for a parcel in an active Specific Plan. Flag and refuse pending SP-specific sourcing.
- Q-conditions (Qualified conditions from zone change approvals) modify base zone rules for
  individual parcels — not detectable from the zone code alone. Flag any parcel with a
  recorded Q-condition as requiring manual verification.
- California Coastal Zone parcels require CCC approval in addition to city zoning — this
  is a second legal authority layer, not just an overlay affecting numeric rules.
- LAMC height districts VL/1/2/3/4 must be resolved from the zone code suffix before any
  FAR or height value is derived — the base zone code alone is insufficient.

**Sign-off:** NOT SIGNED — awaiting Phase 0 probe results.
