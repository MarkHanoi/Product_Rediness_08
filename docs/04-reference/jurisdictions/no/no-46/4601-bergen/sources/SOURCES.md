# Bergen (4601) — data sources

**Status:** OPEN — national mechanism confirmed applicable; Bergen-specific planregister WFS endpoint not located; no numeric rule values verified for any Bergen parcel.

> **Trust gate:** a field with NO citable source stays `null` in the pack. A pack may not ship
> confidence `structured` unless EVERY field it sets has a row in §A here.

---

## A — VERIFIED

| Field (pack key) | Value / endpoint | Governing instrument | URL / handle | Confidence |
|---|---|---|---|---|
| Parcel geometry | Matrikkelen — Eiendomskart Teig WFS: `https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig?Service=WFS&Request=GetCapabilities` — GML, daily update, no login | Matrikkellova / Kartverket | see URL | `published` — **CONFIRMED LIVE** |
| `heritage.overlay_mechanism` | Listing in Askeladden / Kulturminnesøk; hensynssone H570 or bevaringsområde in the reguleringsplan is the operative local trigger for facade-change search duty in Bergen | Bergen kommune guidance | `https://www.bergen.kommune.no/hvaskjer/tema/kulturminner-i-bergen/istandsetting-og-vedlikehold/hvilke-bygninger-er-fredete-eller-verneverdige` | `published` — **CONFIRMED LIVE** |
| Plan data model (SOSI Plan) | National SOSI Plan schema — same as all Norwegian kommuner; Bergen's planregister (once found) will use the same schema as Trondheim's | Forskrift 26.06.2009 nr. 861 | `kartverket.no` | `published` |
| § 29-4 height / setback default | gesimshøyde > 8 m or mønehøyde > 9 m requires an adopted plan; else setback = max(½ height, 4 m) | pbl. § 29-4, Rundskriv H-8/15 | `lovdata.no` / `regjeringen.no` | `published` |
| Grad av utnytting method | BYA / %-BYA / BRA / %-BRA / MUA — nationally defined, applies to Bergen unchanged | TEK17 §§5-1–5-7; H-2300 B veileder | `lovdata.no` / `dibk.no` | `published` |
| Terrain (NDH) | `høydedata.no` — ≥2 pts/m², complete nationwide 2016–2022, free, no login | Kartverket NDH | `https://hoydedata.no` | `published` — **CONFIRMED LIVE** |
| Heritage — Kulturminnesøk.no | ~220,000 objects, free, no login | Riksantikvaren | `https://kulturminnesok.no` | `published` — **CONFIRMED LIVE** |
| `BestemmelseUtnyttingsgrad` national schema slot | Confirmed as unfinished stub in national object catalog 2026-07-24 | Geonorge object register | `https://objektkatalog.geonorge.no/Objekttype/Index/EAID_C61C5D87_F899_44e5_8FEF_AD486BCD174F` | `verified (negative)` — **CONFIRMED STUB** |

---

## B — UNVERIFIED (stays `null` in the pack)

| Field | Why not verified | What would verify it |
|---|---|---|
| Bergen planregister WFS endpoint | Not located in this pass | Search Geonorge kartkatalog (`kartkatalog.geonorge.no/?text=planregister+bergen+kommune`) and Bergen's open-data portal |
| Bergen planregister WFS — layer names and attribute schema | Endpoint not found | GetCapabilities + DescribeFeatureType once endpoint is located |
| Arealformål code as structured WFS attribute | No WFS to probe | GetFeature with Bergen parcel BBOX once endpoint located |
| Bergen verneverdig-building list data format and access | Referenced in heritage guidance; format not confirmed | Check `byantikvar.bergen.kommune.no` or Bergen kulturminner pages for a machine-readable dataset |
| Any specific %-BYA / BRA / height value for any Bergen parcel | No bestemmelser document read | Run regime classifier → fetch plan → read bestemmelser text for target parcel |
| Actual zoning values for any Bergen zone | Out of scope for this pass | Bergen's planregister once located, per target parcel |

---

⚠ No numeric %-BYA, BRA, or height value has been verified from a primary source for any Bergen parcel. § 29-4 defaults may ship as `published` for parcels confirmed to be in the no-plan regime only. Bergen's WFS ingestion code is expected to be near-identical to Trondheim's once the endpoint is located — do not build a Bergen-specific reader; build a generic SOSI Plan reader parameterised by endpoint URL.
