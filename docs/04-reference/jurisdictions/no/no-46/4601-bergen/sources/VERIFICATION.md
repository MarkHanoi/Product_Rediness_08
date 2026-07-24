# Bergen (4601) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

## What was checked, against which document version

| Field | Verified against (doc + version/date) | Method | Verdict |
|---|---|---|---|
| Matrikkelen Eiendomskart Teig WFS | Live endpoint 2026-07-24 | GetCapabilities HTTP probe | ✅ confirmed open, no login |
| NDH / høydedata.no | Live endpoint 2026-07-24 | Page access | ✅ confirmed open, complete |
| Kulturminnesøk.no | Live endpoint 2026-07-24 | Page access | ✅ confirmed open, no login |
| Bergen heritage guidance page | bergen.kommune.no 2026-07-24 | Page access | ✅ confirmed live; H570 / bevaringsområde mechanism confirmed applicable |
| pbl. § 29-4 + Rundskriv H-8/15 | lovdata.no current text | Text read | ✅ numeric defaults confirmed |
| TEK17 §§5-1–5-7 + H-2300 B | lovdata.no / dibk.no | Text read | ✅ method definitions confirmed |
| BestemmelseUtnyttingsgrad object register | Geonorge object register 2026-07-24 | Page access | ✅ confirmed as unfinished stub |

## What I could NOT confirm (and why it stays unshippable)

- `plan.wfs_endpoint` — Bergen planregister WFS not located in this pass; endpoint search not run.
- Bergen verneverdig-building list format and access — referenced generically; not directly confirmed.
- Any numeric %-BYA, BRA, or height value for any Bergen parcel — no bestemmelser read.
- Bergen-specific legal mechanism deviations — assumed absent (same national model as Trondheim) but not confirmed via Bergen's own plan documents.

## Caveats that must remain visible in the product

- Bergen's planregister WFS has not been located. Do not build a Bergen integration without first running the Geonorge kartkatalog search in `NEXT.md §3.B1`. Bergen is expected to be near-identical to Trondheim once confirmed.
- `BestemmelseUtnyttingsgrad` is a confirmed stub nationally — Bergen will be the same.
- FKB-Bygning building footprints are not free for commercial entities.

**Sign-off:** this pack may ship the §A fields of `SOURCES.md` at the stated confidence; every numeric rule value remains `null` and refuses. § 29-4 defaults may ship as `published` for confirmed no-plan parcels. — UNASSIGNED, pending.
