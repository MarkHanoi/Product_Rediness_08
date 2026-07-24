# New York City (3651000) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN.** No numeric rule value has been verified. Scaffold only.

## What was checked, against which document version

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| Governing instrument (NYC Zoning Resolution, in force 1961) | Published ZR reference, 2026-07-24 | Secondary citation | ⚠ `corroborated` — existence and continuity confirmed |
| Zone code vocabulary (R/C/M + Special Purpose Districts) | NYC ZR structure research, 2026-07-24 | Secondary research | ⚠ `corroborated` — vocabulary confirmed from published sources |
| BBL join key convention | NYC planning data documentation, 2026-07-24 | Standard convention read | ✅ confirmed |
| MapPLUTO dataset existence and field schema | NYC Open Data catalogue, 2026-07-24 | API metadata | ⚠ `corroborated` — dataset confirmed; `MaxAllwFAR` population not probed |
| ZOLA existence | `zola.planning.nyc.gov` accessible, 2026-07-24 | URL confirmed | ⚠ `corroborated` — web app exists; API not confirmed |
| NYC Landmarks Preservation Commission open data | `data.cityofnewyork.us` search | Secondary | ⚠ `corroborated` — dataset listed; field schema not probed |
| NYC 3D building model | `data.cityofnewyork.us` reference in research | Secondary | ⚠ `corroborated` — exists; format/currency/licence not checked |
| Microsoft Building Footprints (ODbL) | GitHub repository | Repository confirmed | ✅ confirmed |

## What I could NOT confirm (and why it stays unshippable)

- **MapPLUTO `MaxAllwFAR` is populated and reliable** — most critical unknown; requires direct API probe.
- **ZOLA REST API endpoint** — ZOLA web app exists; machine-readable API not confirmed.
- **Any numeric FAR, height, or setback for any NYC parcel** — requires MapPLUTO probe or ZR table read.
- **NYC 3D building model format, currency, and licence** — not checked on portal.
- **Special Purpose District rules for any specific SPD** — SPD-specific ZR articles not read.
- **Floor area bonus accounting in MapPLUTO `MaxAllwFAR`** — unknown whether field is as-of-right or includes bonus potential.

## Caveats that must remain visible in the product

- `MaxAllwFAR` in MapPLUTO (if populated) may include bonus FAR from inclusionary housing or POPS — never present this as the as-of-right FAR without confirming which it represents.
- Special Purpose District lots: the base Zoning Resolution FAR is NOT the governing rule — the SPD article supersedes it. Never serve base-zone FAR for an SPD lot without reading the SPD-specific rules.
- TDR (air rights transfers): a parcel that has purchased or sold air rights has a different effective FAR than MapPLUTO shows. No automated source captures this; flag any lot with a recorded TDR as requiring manual verification.
- NYC 3D building model heights, if used, must be dated — building stock changes; confirm the dataset vintage before use.

**Sign-off:** NOT SIGNED — awaiting Phase 0 probe results (MapPLUTO `MaxAllwFAR` probe is the mandatory first step).
