# Trondheim (5001) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

## What was checked, against which document version

| Field | Verified against (doc + version/date) | Method | Verdict |
|---|---|---|---|
| Matrikkelen Eiendomskart Teig WFS | Live endpoint 2026-07-24 | GetCapabilities HTTP probe | ✅ confirmed open, no login |
| NDH / høydedata.no | Live endpoint 2026-07-24 | Page access + Geonorge catalogue | ✅ confirmed open, complete |
| Kulturminnesøk.no | Live endpoint 2026-07-24 | Page access | ✅ confirmed open, no login |
| Trondheim planregister — access terms | Geonorge kartkatalog UUID 21c83653-b9c2-4931-bad0-a67e4c0f6be6, 2026-07-24 | Page access | ✅ "No conditions apply to access and use" confirmed |
| pbl. § 29-4 + Rundskriv H-8/15 | lovdata.no current text; regjeringen.no Rundskriv H-8/15 | Text read | ✅ numeric defaults confirmed |
| TEK17 §§5-1–5-7 + H-2300 B | lovdata.no / dibk.no current versions | Text read | ✅ method definitions confirmed |
| BestemmelseUtnyttingsgrad object register | Geonorge object register 2026-07-24, EAID_C61C5D87… | Page access | ✅ confirmed as unfinished stub |
| Reguleringsbestemmelser — Brannkvartalet plan | Trondheim municipality plan archive, 2004 plan | Page access | ✅ bestemmelser as HTML/text paragraphs; no structured BYA/height field found |

## What I could NOT confirm (and why it stays unshippable)

- `plan.wfs_endpoint` — planregister access terms confirmed; live WFS endpoint URL not fetched from the kartkatalog distribution section.
- Arealformål/hensynssone/planstatus as populated WFS attributes — GetFeature probe not run.
- Any numeric %-BYA, BRA, or height value for any Trondheim parcel — no bestemmelser document read for a specific parcel.
- FKB-Bygning commercial licence terms — gate existence confirmed; cost/approval timeline not confirmed.

## Caveats that must remain visible in the product

- Trondheim planregister WFS access terms confirmed (open, no conditions). Live WFS endpoint URL and attribute schema must be confirmed via the GetFeature probe in `NEXT.md §8` before any Trondheim pack is built.
- `BestemmelseUtnyttingsgrad` is a confirmed stub — numeric utilisation values for plan-governed parcels must come from bestemmelser text, not a structured WFS attribute.
- FKB-Bygning building footprints are not free for commercial entities — a licence step is required.

**Sign-off:** this pack may ship the §A fields of `SOURCES.md` at the stated confidence; every numeric rule value remains `null` and refuses. § 29-4 defaults may ship as `published` for confirmed no-plan parcels. — UNASSIGNED, pending.
