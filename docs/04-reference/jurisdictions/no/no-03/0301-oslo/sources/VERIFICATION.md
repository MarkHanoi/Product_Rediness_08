# Oslo (0301) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

## What was checked, against which document version

| Field | Verified against (doc + version/date) | Method | Verdict |
|---|---|---|---|
| Matrikkelen Eiendomskart Teig WFS | Live endpoint 2026-07-24 | GetCapabilities HTTP probe | ✅ confirmed open, no login |
| NDH / høydedata.no | Live endpoint 2026-07-24 | Page access + Geonorge catalogue | ✅ confirmed open, complete |
| Kulturminnesøk.no | Live endpoint 2026-07-24 | Page access | ✅ confirmed open, no login |
| Oslo Planinnsyn | od2.pbe.oslo.kommune.no/kart/ 2026-07-24 | Page access | ✅ confirmed live, click-viewer |
| Oslo Grad av utnytting faktaark | od2.pbe.oslo.kommune.no/pages/faktaark/Grad%20av%20utnytting.html 2026-07-24 | Page access | ✅ confirmed live; pre-/post-1987 era identification confirmed |
| pbl. § 29-4 + Rundskriv H-8/15 | lovdata.no current text | Text read | ✅ numeric defaults confirmed |
| TEK17 §§5-1–5-7 + H-2300 B | lovdata.no / dibk.no | Text read | ✅ method definitions + historical-method appendix confirmed |
| BestemmelseUtnyttingsgrad object register | Geonorge object register 2026-07-24 | Page access | ✅ confirmed as unfinished stub |
| Oslo Gul liste existence | Byantikvaren i Oslo references in Bergen and Oslo heritage guidance | Secondary reference | ⚠ existence confirmed; format/access not directly confirmed |
| PBE priced ordering service | PBE ordering portal reference 2026-07-24 | Page reference | ✅ existence confirmed; full price list not read |

## What I could NOT confirm (and why it stays unshippable)

- `plan.wfs_endpoint` — Planinnsyn confirmed as click-viewer; standalone WFS not located.
- Faktaark per-parcel automation — page confirmed live; gnr/bnr URL parameter not tested.
- Oslo Gul liste data format and access — existence confirmed; machine-readable access not found.
- Any numeric %-BYA, BRA, or height value for any Oslo parcel — no bestemmelser read.
- PBE gebyrforskrift full product boundary — existence of priced line confirmed; full scope not read.

## Caveats that must remain visible in the product

- All Oslo plan data is currently accessible only via the Planinnsyn click-viewer — no machine-readable WFS confirmed. Do not build an Oslo API pipeline without first confirming the WFS status via the search in `NEXT.md §3.B1`.
- `BestemmelseUtnyttingsgrad` is a confirmed stub — numeric values for plan-governed parcels must come from bestemmelser text.
- FKB-Bygning building footprints are not free for commercial entities.

**Sign-off:** this pack may ship the §A fields of `SOURCES.md` at the stated confidence; every numeric rule value remains `null` and refuses. § 29-4 defaults may ship as `published` for confirmed no-plan parcels. — UNASSIGNED, pending.
