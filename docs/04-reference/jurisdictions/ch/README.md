# Switzerland (`ch`) — what is true now

**Level:** country · **ISO:** `ch` · **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED
**Status:** Context-data layer GATE PASSED · Legal/zoning layer NOT STARTED

---

## 1 — What governs here

Switzerland's planning law is **per-canton** (26 cantons). Each canton enacts its own
**Nutzungsplanung / plan d'affectation / piano delle zone** (land-use plan), implemented at
municipality level as **Bau- und Zonenordnung (BZO)**. The federal instrument is the
**ÖREB/RDPPF cadastre** (Cadastre des restrictions de droit public à la propriété) — a
standardized-schema cadastre of public-law restrictions, mandated by federal ordinance (V-ÖREB) and
rolled out canton-by-canton. Critically: **the ÖREB/RDPPF is a federal data model** — if canton
implementations expose zone + Ausnützungsziffer (floor area ratio) as structured fields, Switzerland
could approach Denmark's structured fill rate. This is the single most important unknown for the
legal layer.

**Key structural advantage vs. Germany / France / Belgium:** one federal licence regime (swisstopo /
BFS), one ÖREB data model, no per-Bundesland licence fragmentation. The context-data layer is
essentially one fetch, nationwide.

---

## 2 — Pack status

Legal/zoning layer: **NOT STARTED** — zero ÖREB/RDPPF queries run, zero canton Nutzungsplanung
endpoints verified. See `NEXT.md §3.1`.

---

## 3 — Context-data layer (L-511 Gate)

| # | Question | Answer | Confirmed in |
|---|---|---|---|
| a | Real footprint? | **YES** — swissBUILDINGS3D 2.0, nationwide since 2018, ±30–50cm | `topics/buildings-lod-height.md` |
| b | Real height? | **YES** — volumetric LOD2 solid + LiDAR (swissSURFACE3D) + GWR storey count (EGID-linked) | `topics/buildings-lod-height.md` |
| c | Real roof shape? | **YES** — manually stereo-photogrammetrically extracted, not generalized | `topics/buildings-lod-height.md` |
| d | Roads / water / parks / trees object-level? | **YES** — swissTLM3D nationwide, feature-class level with attributes | `topics/roads-pedestrian.md`, `topics/water.md`, `topics/parks-trees.md` |
| e | Known coverage gaps? | **ONE** — swissBUILDINGS3D 3.0 Beta (EGID in model) is live in 20/26 cantons + city of Zürich only; 2.0 is the national fallback (fidelity gap, not availability gap) | `regions/README.md` |

**GATE STATUS: PASSED.** Implementation of the context-data adapter may proceed for all cantons.
Legal/zoning spike must precede any permit-rule pack.

---

## 4 — The number

Context-data structured fill: **~85%** (all layers confirmed nationwide; see `RATE.md` for derivation).
Building-rule structured fill (zone + density metric + height rule): **NOT YET ASSESSED** — zero
canton legal layers probed. See `RATE.md` and `RATE-IMPLEMENTATION-PLAN.md`.

---

## 5 — Layout

```
ch/
  README.md                      ← this file
  NEXT.md                        ← where we stopped, blockers, resume steps
  RATE.md                        ← structured fill rate (context + legal layers)
  RATE-IMPLEMENTATION-PLAN.md    ← phased roadmap to raise the rate
  sources/
    SOURCES.md                   ← per-field citations
    VERIFICATION.md              ← human sign-off status
  findings/
    SWITZERLAND-MASTER-DATA-SOURCE-STUDY.md  ← full country study
  topics/
    buildings-lod-height.md      ← LOD2 buildings, heights, GWR join (GATE PASSED)
    roads-pedestrian.md          ← swissTLM3D roads (GATE PASSED)
    water.md                     ← swissTLM3D water (GATE PASSED)
    parks-trees.md               ← swissTLM3D parks + trees (GATE PASSED)
  regions/
    README.md                    ← 3.0 Beta canton coverage split + routing logic
```

---

## 6 — Open questions / unverified

Research notes that cannot yet be cited go here — never in `SOURCES.md`.

- **ÖREB/RDPPF structured fields:** Does a typical canton's ÖREB implementation expose zone code +
  Ausnützungsziffer + max height as structured query attributes, or only as linked PDF provisions?
  This single question decides Switzerland's realistic rate ceiling.
- **GWR Merkmalskatalog field schema:** Full field list (`housing-stat.ch/files/881-2200.pdf`) not
  yet read field-by-field — confirmed attributes exist and are public, full type/domain list not
  transcribed.
- **CityGML export level:** swissBUILDINGS3D CityGML conformance (2.0 vs. 3.0) not confirmed from a
  sample tile — check before committing an ingestion pipeline.
- **Municipal tree cadastres:** Only Zürich's Baumkataster confirmed as published open data.
  Geneva, Basel, Lausanne, Bern status unknown.
- **Pedestrian sub-classification:** swissTLM3D 2.4 "Wege" path sub-types for sidewalk/pedestrian
  distinction — full domain list not yet transcribed.
