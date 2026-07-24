# Oslo (0301) — data sources

**Status:** OPEN — Planinnsyn viewer and grad av utnytting faktaark confirmed live; standalone planregister WFS not confirmed; no numeric rule values verified for any Oslo parcel.

> **Trust gate:** a field with NO citable source stays `null` in the pack. A pack may not ship
> confidence `structured` unless EVERY field it sets has a row in §A here.

---

## A — VERIFIED

| Field (pack key) | Value / endpoint | Governing instrument | URL / handle | Confidence |
|---|---|---|---|---|
| Parcel geometry | Matrikkelen — Eiendomskart Teig WFS: `https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig?Service=WFS&Request=GetCapabilities` — GML, daily update, no login | Matrikkellova / Kartverket | see URL | `published` — **CONFIRMED LIVE** |
| `plan.viewer` | Planinnsyn — click-in-map tool resolving gnr/bnr, all overlapping kommuneplan/kommunedelplan/reguleringsplan/områderegulering layers, and reguleringsbestemmelser text on a further click | Oslo PBE | `https://od2.pbe.oslo.kommune.no/kart/` | `published` — **CONFIRMED LIVE** |
| `plan.update_cadence` | Reguleringsplan + områderegulering layers update nightly; other layers update on change | Oslo PBE | same | `published` |
| `utnytting.faktaark` | Oslo publishes a per-parcel "Grad av utnytting" fact sheet that identifies which historical calculation-method era applies (pre-/post-1 July 1987 break point named explicitly) | Oslo PBE | `https://od2.pbe.oslo.kommune.no/pages/faktaark/Grad%20av%20utnytting.html` | `published` — **CONFIRMED LIVE** |
| `heritage.overlay_mechanism` | hensynssone `H570` (bevaring av kulturmiljø) in Oslo kommuneplanens arealdel and/or reguleringsplan — national code, Oslo-specific application | Oslo kommuneplan; SOSI Plan national | — | `published` |
| `heritage.local_list` | Oslo "Gul liste" (Yellow List) of conservation-worthy buildings — maintained separately from Askeladden by Byantikvaren i Oslo | Byantikvaren i Oslo | — | `published` (existence); format/access not yet confirmed |
| `products.pricing` | PBE runs a priced ordering service for certain derived products (Regulerings- og eiendomsbekreftelse, byggesakskart etc.); new price list from 1 January 2026. Interactive viewer and base plan lookup appear free. | PBE gebyrforskrift | PBE ordering portal | `published` |
| Plan data model (SOSI Plan) | National SOSI Plan schema — same as all Norwegian kommuner | Forskrift 26.06.2009 nr. 861 | `kartverket.no` | `published` |
| § 29-4 height / setback default | gesimshøyde > 8 m or mønehøyde > 9 m requires an adopted plan; else setback = max(½ height, 4 m) | pbl. § 29-4, Rundskriv H-8/15 | `lovdata.no` / `regjeringen.no` | `published` |
| Grad av utnytting method (including historical-method switching) | BYA / %-BYA / BRA / %-BRA / MUA — nationally defined; pre-/post-1 July 1987 switching logic documented in H-2300 B appendix and named by Oslo PBE | TEK17 §§5-1–5-7; H-2300 B veileder; Oslo PBE faktaark | `lovdata.no` / `dibk.no` / Oslo PBE | `published` |
| Terrain (NDH) | `høydedata.no` — ≥2 pts/m², complete nationwide 2016–2022, free, no login | Kartverket NDH | `https://hoydedata.no` | `published` — **CONFIRMED LIVE** |
| Heritage — Kulturminnesøk.no | ~220,000 objects, free, no login | Riksantikvaren | `https://kulturminnesok.no` | `published` — **CONFIRMED LIVE** |
| `BestemmelseUtnyttingsgrad` national schema slot | Confirmed as unfinished stub in national object catalog 2026-07-24 | Geonorge object register | `https://objektkatalog.geonorge.no/Objekttype/Index/EAID_C61C5D87_F899_44e5_8FEF_AD486BCD174F` | `verified (negative)` — **CONFIRMED STUB** |

---

## B — UNVERIFIED (stays `null` in the pack)

| Field | Why not verified | What would verify it |
|---|---|---|
| `plan.wfs_endpoint` | Planinnsyn confirmed as click-viewer only; standalone WFS not located | Check `data.oslo.kommune.no` CKAN and Geonorge kartkatalog for "Planregister Oslo kommune" with WFS distribution |
| Faktaark per-parcel automation | Page confirmed live; whether it accepts gnr/bnr as URL parameter and returns parcel-specific output not tested | Load `od2.pbe.oslo.kommune.no/pages/faktaark/Grad%20av%20utnytting.html?gnr=XXX&bnr=YYY` and check if output is parcel-specific |
| Oslo Gul liste data format and access | Existence confirmed; format (GIS layer, CSV, PDF) not confirmed | Check `byantikvaren.oslo.kommune.no` for a machine-readable Gul liste dataset |
| PBE gebyrforskrift — full free vs. priced product boundary | Jan-2026 price list existence confirmed; full scope not read | Fetch/read the current PBE gebyrforskrift document |
| Any specific %-BYA / BRA / height value for any Oslo parcel | No bestemmelser document read | Run regime classifier → fetch plan → read bestemmelser text for target parcel |

---

⚠ No numeric %-BYA, BRA, or height value has been verified from a primary source for any Oslo parcel. § 29-4 defaults may ship as `published` for parcels confirmed to be in the no-plan regime only.
