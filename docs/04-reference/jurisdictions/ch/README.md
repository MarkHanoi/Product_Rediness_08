# Switzerland (`ch`) — what is true now

**Level:** country · **ISO:** `ch` · **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED
**Status:** Context-data GATE PASSED · ÖREB legal-layer PARTIALLY PROBED (zone code CONFIRMED
STRUCTURED; FAR/height UNCONFIRMED) · Rate: ~85% (context) / ~25–35% estimated (building-rule)

---

## 1 — What governs here

Switzerland's planning law is **per-canton** (26 cantons). Each canton enacts its own
**Nutzungsplanung / plan d'affectation / piano delle zone** (land-use plan), implemented at
municipality level as **Bau- und Zonenordnung (BZO)**. The federal coordination instrument is the
**ÖREB/RDPPF cadastre** (Cadastre des restrictions de droit public à la propriété) — a
V-ÖREB-ordinance-standardized cadastre of public-law restrictions, with endpoints confirmed live for
25/26 cantons (NE has no public URL).

**Key structural finding — DECIDING PROBE RESOLVED (2026-07-24):** The ÖREB 2.0 data model includes
zone `TypeCode` as a **structured** machine-readable field, and the national Nutzungsplanung WFS
(`ms:grundnutzung`, 19+ cantons) delivers structured **zone identification** (type code + label +
national main-use). But numeric parameters are **not** in the national delivery: the WFS carries no
`Nutzungsziffer`/height element (DescribeFeatureType + GetFeature, verbatim); the federal INTERLIS
model has only an **optional** `Typ.Nutzungsziffer 0..9` slot it does not surface; **height is not
modelled at all**. ⇒ **Outcome B — building-rule dimensional fill ~20–25% (France-class), NOT the
aspirational ~88%.** geodienste.ch was NOT geo-blocked (only ZG's cantonal WFS was). Full transcript:
`findings/SWITZERLAND-DATA-RECON-SPIKE.md`.

**Governing rule kind (ADR-0270):** Swiss Nutzungsplanung typically uses a **density-and-height
model** (Ausnützungsziffer/GFZ + max Gebäudehöhe), NOT an alignment-governed model. Confirm per
canton before applying alignment-governed logic.

---

## 2 — Pack status

Legal/zoning layer: **NOT STARTED** — zero municipality packs created; zero ÖREB data extract read
for a specific parcel. Awaiting WFS GetFeature probe result before scoping Phase 1.

---

## 3 — Context-data layer (L-511 Gate)

| # | Question | Answer | Status |
|---|---|---|---|
| a | Real footprint? | **YES** — swissBUILDINGS3D 2.0, nationwide since 2018, ±30–50cm | `document` |
| b | Real height? | **YES** — LOD2 volumetric + swissSURFACE3D LiDAR + GWR GASTW (storey count) | `document` + `VERIFIED-LIVE` |
| c | Real roof shape? | **YES** — manually stereo-photogrammetrically extracted, not generalized | `document` |
| d | Roads/water/parks/trees object-level? | **YES** — swissTLM3D nationwide, feature-class level with attributes | `document` |
| e | Coverage gaps? | **ONE** — swissBUILDINGS3D 3.0 Beta (EGID in model) live in 20/26 cantons + city ZH; 2.0 nationwide fallback. **Fidelity gap, not availability gap.** | `document` |

**CONTEXT-DATA GATE: PASSED.** Context-data adapter may proceed for all cantons.

New confirmed items from 2026-07-24 pass:
- **CityGML 2.0** confirmed from official swisstopo product page
- **GWR API** VERIFIED LIVE; full Stufe A field schema confirmed from PDF v4.2
- **ÖREB endpoints** VERIFIED LIVE for AG, ZH, GE, VD

---

## 4 — Legal-layer finding summary

**ÖREB probing result (2026-07-24):**
- All 25 canton endpoints with URLs confirmed from federal M2M page
- Zone type code (`TypeCode`): STRUCTURED ✅ — in ÖREB 2.0 schema
- Ausnützungsziffer/max height: NOT STRUCTURED in ÖREB base schema — in linked PDF provisions
- National Nutzungsplanung WFS (geodienste.ch): LIVE for 19+ cantons; attribute schema unconfirmed

**This puts Switzerland in the ~25–35% range** for full building-rule structured fill — better than
Belgium/France but not Denmark. The single probe that changes this: WFS GetFeature from a DACH IP
(see `NEXT.md §3.1`).

---

## 5 — The number

| Layer | Rate | Denominator |
|---|---|---|
| Context-data | ~85% | Confirmed four topic layers; open items on TLM3D sub-classifications and municipal tree cadastres |
| Building-rule (zone code) | ~70% | ÖREB TypeCode structured; all 25 canton endpoints live |
| Building-rule (zone + FAR + height, full 3-field) | ~15–35% estimated | Zone code confirmed; FAR/height WFS attribute unconfirmed; typically in PDF |

---

## 6 — Layout

```
ch/
  README.md                      ← this file
  NEXT.md                        ← where we stopped, blockers, resume steps
  RATE.md                        ← full rate with live probe record
  RATE-IMPLEMENTATION-PLAN.md    ← phased roadmap
  sources/
    SOURCES.md                   ← per-field citations (live probe results + document refs)
    VERIFICATION.md              ← human sign-off status
  findings/
    SWITZERLAND-MASTER-DATA-SOURCE-STUDY.md  ← full country study (Part 1–9)
    SWITZERLAND-FORENSIC-RESEARCH-2026-07-31.md  ← L1/L2/L3 model + Zürich BZO + Stadt-Zürich WFS live probe
  topics/
    buildings-lod-height.md      ← LOD2, GWR schema confirmed, CityGML 2.0 confirmed
    roads-pedestrian.md          ← swissTLM3D (GATE PASSED)
    water.md                     ← swissTLM3D (GATE PASSED)
    parks-trees.md               ← swissTLM3D (GATE PASSED, nuance on tree authority)
  regions/
    README.md                    ← 3.0 Beta routing + ÖREB endpoint table + WFS canton coverage
```

---

## 7 — Open questions / unverified

- **Nutzungsplanung WFS Nutzungsziffer:** does `ms:grundnutzung` at geodienste.ch include a
  structured FAR attribute? Probe from DACH IP needed (see `NEXT.md §3.1`).
- **ÖREB extract Information fields:** do canton-specific key-value pairs carry AZ/height? Probe one
  ÖREB extract for a real parcel (see `NEXT.md §3.2`).
- **NE ÖREB endpoint URL:** not found on federal M2M page; email sitn@ne.ch.
- **Geodienste.ch licensing:** "fees may apply" — confirm per-canton access cost before production.
- **Cantonal Denkmalschutz WFS:** not probed; swisstopo federal WMS confirmed live.
- **GWR GKAT/GKLAS domain codes:** field names confirmed; code value tables not transcribed.
- **swissTLM3D 2.4 pedestrian sub-classification + Areale Freizeit sub-types:** not transcribed.
- **Municipal tree cadastres (GE, BS, Lausanne, Bern):** only Zürich confirmed open data.
