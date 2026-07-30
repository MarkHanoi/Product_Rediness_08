# USA — National Architecture (`us/USA.md`)

**Level:** country · **ISO 3166-1:** `US` · **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED
**Status:** RESEARCH COMPLETE — city atlas scaffolded, no rule pack implemented
**Confidence (whole file):** CONVERGENT-SECONDARY — every claim below is corroborated across
secondary sources but **not live-probed**. Per §CONTEXT-DATA-HONESTY, treat each as
**pending-probe**; no readiness or RATE % is asserted here.

> This file is the **national architecture** companion to the country umbrella
> [`README.md`](./README.md). The umbrella characterises the legal hierarchy and national
> data sources; this file states the **single governing insight** for the US and the
> **adapter architecture** it forces, then indexes the two structural children of that insight:
> the national fallback [`DATASETS/`](./DATASETS/) and the primary [`CITIES/`](./CITIES/) atlas.

---

## 1 — The governing insight: the US is the INVERSE of Germany

| | Germany | USA |
|---|---|---|
| Technical geodata (parcels, cadastre) | **Land** owns it (ALKIS, one schema per Land) | **County / city** owns it directly — **no national cadastre**, no ALKIS/Catastro equivalent |
| Planning authority (zoning) | Municipality owns the Bebauungsplan; national BauNVO fixes the zone taxonomy | **County / city** owns the ordinance; **no national zone taxonomy** — each of ~33,000 authorities invents its own codes |
| Where PRYZM documents depth | `de/<Land>/` — the Land is the atlas unit | **`us/CITIES/<CITY>` — the city is the atlas unit** |
| National layer answering "which rules govern this parcel?" | Land cadastre + BauNVO | **None.** Commercial routers (Regrid, Zoneomics) only |

**Consequence:** the US cannot be onboarded with a single `USParcelProvider` /
`USZoningProvider` the way Germany is onboarded per-Land. There is no national parcel or zoning
service to wrap. PRYZM documents and wires the US **city by city**, and the flagship cities
(NYC, San Francisco) each carry a self-contained dataset that a **city-scoped** adapter wraps.

The national datasets in [`DATASETS/`](./DATASETS/) are **fallbacks / context only** — terrain,
roads, water, flood overlays. They never carry the parcel + zoning + envelope payload; that
always comes from a city source.

---

## 2 — Adapter architecture: city-scoped, not nation-scoped

Because ownership is municipal, the provider interfaces are **city-scoped**. The contract is the
same trio everywhere; only the concrete implementation and its source differ per city.

```
CityParcelProvider     — coord | parcel-id → parcel polygon + area + parcel-id
CityZoningProvider     — parcel → zoning district code + numeric metrics (FAR / coverage / height)
CityEnvelopeProvider   — zoning district + parcel → buildable-envelope massing (per city rule pack)
```

**Concrete implementations are named per city — NEVER `USParcelProvider`:**

| Interface | NYC | San Francisco | Seattle | Boston | … |
|---|---|---|---|---|---|
| `CityParcelProvider` | `NYCParcelProvider` (MapPLUTO, BBL) | `SFParcelProvider` (APN) | `SeattleParcelProvider` | `BostonParcelProvider` | one per city |
| `CityZoningProvider` | `NYCZoningProvider` (ZoneDist + FAR fields) | `SFZoningProvider` (zoning + height-and-bulk) | `SeattleZoningProvider` | `BostonZoningProvider` | one per city |
| `CityEnvelopeProvider` | `NYCEnvelopeProvider` (FAR + SEP rule pack) | `SFEnvelopeProvider` (height-and-bulk rule pack) | … | … | per-city rule pack |

Routing key differs per city too: NYC routes on **BBL** (Borough-Block-Lot), SF on **APN**
(assessor block-lot). A national coord→jurisdiction router does not exist for free; the
per-city provider owns its own coord→parcel-id reverse lookup.

**Anti-pattern (do not do):** a single national adapter that switches on state/city internally.
Ownership is municipal; the adapter boundary must be municipal too, so each city's data model,
CRS, and rule pack stays isolated and independently probe-gated.

---

## 3 — National fallback datasets (context, never the parcel/zoning payload)

Full stubs in [`DATASETS/`](./DATASETS/). Summary:

| Dataset | Role | Licence | Doc |
|---|---|---|---|
| **TIGER/Line** (Census) | Administrative boundaries, roads, place/county polygons — national context + FIPS routing | Public Domain | [`DATASETS/TIGER.md`](./DATASETS/TIGER.md) |
| **USGS 3DEP** | National LiDAR terrain (DTM/DSM); building-height fallback via DSM−DTM | Public Domain | [`DATASETS/USGS_3DEP.md`](./DATASETS/USGS_3DEP.md) |
| **National Hydrography Dataset (NHD)** | Water bodies, rivers, coastline context | Public Domain | [`DATASETS/NATIONAL_HYDROGRAPHY.md`](./DATASETS/NATIONAL_HYDROGRAPHY.md) |
| **FEMA National Flood Hazard Layer** | Flood-zone (SFHA) overlay — HIGH development-restriction risk | Public Domain (federal) | [`DATASETS/FEMA_FLOOD.md`](./DATASETS/FEMA_FLOOD.md) |

These are the US analogue of "everything except the rule pack is free": terrain, roads, water,
and flood are nationally free; the parcel + zoning + envelope payload is per-city and is the
whole cost.

---

## 4 — The primary atlas: [`CITIES/`](./CITIES/)

The city docs are the US equivalent of the German Land files in depth. Two are written in full;
eight are Tier-1 stubs pending probe.

| Doc | Depth | Analogue |
|---|---|---|
| [`CITIES/NEW_YORK_CITY.md`](./CITIES/NEW_YORK_CITY.md) | **FULL** | Berlin — richest data (MapPLUTO ≈ complete PRYZM dataset), highest complexity |
| [`CITIES/SAN_FRANCISCO.md`](./CITIES/SAN_FRANCISCO.md) | **FULL** | Barcelona — accurate parcels (APN) + detailed zoning + height districts + LiDAR |
| Seattle · Denver · Boston · Austin · Chicago · Philadelphia · Washington DC · Portland | STUB | Tier-1 readiness table + `status: unprobed` |

The city docs link **into** the existing `us/us-<state>/<FIPS>-<slug>/` RATE dossiers (the
scorecard faces). The CITIES atlas is the architecture/data-source layer; the dossiers are the
scored layer. This mirrors `de`: the atlas describes the data, the dossier scores it.

---

## 5 — Readiness ranking + implementation waves

See [`CITIES/README.md`](./CITIES/README.md) for the ranked table and waves (reproduced there
as the atlas index). All scores are **CONVERGENT-SECONDARY / unprobed** and inform sequencing
only — they do not move any RATE cell until the city's parcel + zoning sources are probed live
and wired as `City*Provider`s.

---

## 6 — Honesty (§CONTEXT-DATA-HONESTY)

- Every claim in this file and its children is **CONVERGENT-SECONDARY (not probed)**.
- **Failure and empty are the same value:** a city marked "unprobed" is not "has no data" — it
  is "we have not looked." Do not read absence of a probe as absence of a source.
- **No RATE % cell is asserted or changed by this atlas.** The dossier RATE files remain the
  sole scorecard; this atlas is architecture + source documentation only.
- A city moves off "unprobed" only when its MapPLUTO/APN + zoning layer is probed live and wired
  as a `CityParcelProvider` / `CityZoningProvider`. The envelope stays not-assessed until a
  per-city rule pack exists (and L-449).
