# Trondheim (5001) — data sources

**Status:** OPEN — planregister access terms confirmed; no live GetFeature probe run; no numeric rule values verified for any Trondheim parcel.

> **Trust gate:** a field with NO citable source stays `null` in the pack. A pack may not ship
> confidence `structured` unless EVERY field it sets has a row in §A here.

---

## A — VERIFIED

| Field (pack key) | Value / endpoint | Governing instrument | URL / handle | Confidence |
|---|---|---|---|---|
| Parcel geometry | Matrikkelen — Eiendomskart Teig WFS: `https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig?Service=WFS&Request=GetCapabilities` — GML, daily update, no login | Matrikkellova / Kartverket | see URL | `published` — **CONFIRMED LIVE** |
| Planregister — access terms | "Planregister Trondheim kommune" — "No conditions apply to access and use," ugradert, continuously updated. Contact: `kart.postmottak@trondheim.kommune.no`. Scale: 1:10000. | Trondheim kommune Kartavdelingen | `https://kartkatalog.geonorge.no/metadata/planregister-trondheim-kommune/21c83653-b9c2-4931-bad0-a67e4c0f6be6` | `published` — **CONFIRMED** |
| Plan data model (SOSI Plan) | National SOSI Plan schema — arealformål codes, hensynssone codes, planstatus codes are all national; Trondheim's WFS uses the same schema as every other Norwegian kommune | Forskrift 26.06.2009 nr. 861 | `kartverket.no` | `published` |
| § 29-4 height / setback default | gesimshøyde > 8 m or mønehøyde > 9 m requires an adopted plan; else setback = max(½ height, 4 m) from neighbour boundary | pbl. § 29-4, Rundskriv H-8/15 | `lovdata.no` / `regjeringen.no` Rundskriv H-8/15 | `published` |
| Grad av utnytting method | BYA / %-BYA / BRA / %-BRA / MUA — nationally defined | TEK17 §§5-1–5-7; H-2300 B veileder | `lovdata.no` / `dibk.no` | `published` |
| Reguleringsbestemmelser text — format (1 plan confirmed) | Brannkvartalet reguleringsplan (Trondheim, 2004): bestemmelser published as parseable HTML/text on Trondheim kommune's own site — not only scanned PDF | Trondheim kommune plan archive | `trondheim.kommune.no` | `corroborated` (confirmed for 1 plan; not surveyed broadly) |
| Terrain (NDH) | `høydedata.no` — ≥2 pts/m², complete nationwide 2016–2022, free, no login | Kartverket NDH | `https://hoydedata.no` | `published` — **CONFIRMED LIVE** |
| Heritage — Kulturminnesøk.no | ~220,000 objects, free, no login, map geometry + attributes | Riksantikvaren | `https://kulturminnesok.no` | `published` — **CONFIRMED LIVE** |
| `BestemmelseUtnyttingsgrad` national schema slot | Confirmed as unfinished stub in national object catalog 2026-07-24. Do not expect a structured attribute for %-BYA/BRA from a standard WFS call. | Geonorge object register | `https://objektkatalog.geonorge.no/Objekttype/Index/EAID_C61C5D87_F899_44e5_8FEF_AD486BCD174F` | `verified (negative)` — **CONFIRMED STUB** |

---

## B — UNVERIFIED (stays `null` in the pack)

| Field | Why not verified | What would verify it |
|---|---|---|
| Trondheim planregister WFS — live endpoint URL | Geonorge kartkatalog page confirmed; WFS distribution URL not fetched | Open kartkatalog UUID page, pull WFS URL from distribution/access section |
| Trondheim planregister WFS — layer names | No GetCapabilities probe run | Fetch GetCapabilities from live WFS endpoint |
| Arealformål code as structured WFS attribute | GetFeature not yet run | Run GetFeature with Trondheim parcel BBOX; check for `arealformål` attribute |
| Hensynssone code as structured WFS attribute | GetFeature not yet run | Same probe |
| Planstatus as structured WFS attribute | GetFeature not yet run | Same probe |
| Bestemmelser URL in WFS feature | GetFeature not yet run | Check WFS GetFeature response for a URL field linking to bestemmelser document |
| Any specific %-BYA / BRA / height value for any Trondheim parcel | No bestemmelser document read for any specific parcel | Run regime classifier → fetch plan → read bestemmelser text for target parcel |
| Trondheim-specific heritage overlay (Byantikvar) | Not checked | Trondheim kommune byantikvar/kulturminner guidance page |
| FKB-Bygning licence cost and approval timeline for commercial use | Licence gate existence confirmed; cost/timeline not checked | Contact Geodata or Norkart (`geodata.no` / `norkart.no`) |

---

⚠ No numeric %-BYA, BRA, or height value has been verified from a primary source for any Trondheim parcel. § 29-4 defaults (gesimshøyde 8 m / mønehøyde 9 m; setback max(½H, 4 m)) may ship as `published` for parcels confirmed to be in the no-plan regime only.
