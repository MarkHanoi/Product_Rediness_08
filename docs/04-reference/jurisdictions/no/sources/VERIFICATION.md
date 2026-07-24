# Norway (`no`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

## What was checked, against which document version

| Field | Verified against (doc + version/date) | Method | Verdict |
|---|---|---|---|
| Matrikkelen Eiendomskart Teig WFS | Live endpoint 2026-07-24 | GetCapabilities HTTP probe | ✅ confirmed open, no login |
| NDH / høydedata.no | Live endpoint 2026-07-24 | Page access + Geonorge catalogue | ✅ confirmed open, complete, no login |
| Kulturminnesøk.no | Live endpoint 2026-07-24 | Page access | ✅ confirmed open, no login |
| BestemmelseUtnyttingsgrad national object register | Geonorge object register 2026-07-24 | Page access — object EAID_C61C5D87_F899_44e5_8FEF_AD486BCD174F | ✅ confirmed as unfinished stub |
| Trondheim planregister access terms | Geonorge kartkatalog UUID 21c83653-b9c2-4931-bad0-a67e4c0f6be6 | Page access | ✅ confirmed open, no conditions |
| Oslo Planinnsyn viewer | od2.pbe.oslo.kommune.no/kart/ 2026-07-24 | Page access | ✅ confirmed live |
| Oslo Grad av utnytting faktaark | od2.pbe.oslo.kommune.no/pages/faktaark/Grad%20av%20utnytting.html 2026-07-24 | Page access | ✅ confirmed live |
| Bergen heritage guidance page | bergen.kommune.no 2026-07-24 | Page access | ✅ confirmed live |
| pbl. § 29-4 height/setback default | lovdata.no current consolidated text; Rundskriv H-8/15 | Text read | ✅ gesimshøyde 8 m / mønehøyde 9 m; setback max(½H, 4 m) confirmed |
| TEK17 §§5-1–5-7 | lovdata.no current consolidated text | Text read | ✅ grad av utnytting method definitions confirmed |
| H-2300 B / historical method switching | dibk.no veileder | Text read | ✅ historical-methods appendix confirmed; 1 July 1987 break point named by Oslo PBE |
| SOSI Plan Forskrift 2009 nr. 861 | lovdata.no | Text read | ✅ national mandate confirmed, in force since 2009 |

## What I could NOT confirm (and why it stays unshippable)

- `plan.wfs_endpoint` (Oslo, Bergen) — click-viewer or guidance page confirmed; standalone WFS URL not located in this pass.
- Any numeric %-BYA / BRA / height value for any parcel — no reguleringsbestemmelser document has been read for a specific parcel.
- `BestemmelseUtnyttingsgrad` population in any live WFS feed — national stub confirmed; per-kommune population not checked.
- FKB-Bygning commercial licence terms — licence gate existence confirmed; cost and approval timeline not confirmed.

## Caveats that must remain visible in the product

- Trondheim planregister WFS access terms confirmed (open, no conditions); live GetCapabilities URL and attribute schema not yet pulled — do not build against this endpoint without first running the GetFeature probe in `NEXT.md §8`.
- `BestemmelseUtnyttingsgrad` is a confirmed unfinished stub in the national spec — any numeric utilisation value for a plan-governed parcel must come from the bestemmelser text, not from a structured WFS attribute.
- Kulturminnesøk.no geolocation accuracy: Riksantikvaren's own caveat states that older entries were geolocated decades ago and should not be used as the sole basis for detailed planning.
- FKB-Bygning building footprints are NOT free for commercial entities — a licence step is required before any use in a commercial engine.

**Sign-off:** this pack may ship the §A fields of `SOURCES.md` at the stated confidence; every numeric rule value (%-BYA, BRA, height, setback where a plan governs) remains `null` and refuses. § 29-4 default values (gesimshøyde 8 m / mønehøyde 9 m; setback max(½H, 4 m)) may ship as `published` for parcels confirmed to be in the no-plan regime. — UNASSIGNED, pending.
