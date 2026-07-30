# United Kingdom — National Geospatial Architecture (Federation Atlas)

**Level:** country · **ISO 3166-1:** `GB` · **Join key:** ONS GSS codes (E/S/W/N + 8 digits) +
**UPRN** (Unique Property Reference Number) at property level ·
**Subdivision law:** four constituent countries (England / Scotland / Wales / Northern Ireland),
each with its OWN planning system + cadastre/registry + LiDAR programme · **Last updated:** 2026-07-30 ·
**Maintainer:** UNASSIGNED · **Status:** RESEARCH ATLAS — probe-gated

> **Confidence banner (§CONTEXT-DATA-HONESTY):** every claim in this atlas is
> **CONVERGENT-SECONDARY** (multiple official/expert sources, NOT live-probed in PRYZM). Ordnance
> Survey and the constituent-country services are **NOT yet wired in PRYZM** (the Phase-1 audit
> scored `gb` ≈ 51%). The ONE thing wired today is the EA LIDAR Composite DTM terrain probe used by
> the Greater London bake — see `gb/README.md` and the London RATE dossier. **Nothing here may move
> a `RATE.md` cell** until the specific service is probed live and wired. Failure and empty are the
> same value — ship the probe before the fix.

> **⚠ CRITICAL HONESTY POINT — HMLR ≠ cadastre.** HM Land Registry title polygons and the INSPIRE
> Index Polygons are **OWNERSHIP extents recorded with GENERAL boundaries** (Land Registration Act
> 2002, s.60 — the "general boundaries rule"). They are **NOT a survey-grade / engineering cadastre**
> and must **never** be described as survey-precise, boundary-determined, or a legal parcel edge.
> This is the single most important discipline in the whole GB atlas. The UK has **no national
> cadastre** in the sense that France (PCI), Spain (Catastro) or Denmark (Matriklen) do.

---

## 1 — The headline: world-class topography, NO national cadastre

The UK is the **inverse of the German problem and the inverse of the Spanish one**. Its topographic
mapping — **Ordnance Survey (OS)** — is arguably the best national mapping in the world: continuous,
consistent, feature-rich, nationally complete. But two things the continental leaders have, the UK
lacks:

| Dimension | UK position |
|---|---|
| National topographic mapping (buildings/roads/water/greenspace) | ✅ **WORLD-CLASS** — OS, national, continuous |
| National address/property spine (UPRN / AddressBase) | ✅ **WORLD-CLASS** — one identifier, national |
| National **cadastre** (survey-grade legal parcel edges) | ❌ **DOES NOT EXIST** — HMLR = ownership, general boundaries |
| National **numeric zoning envelope** (FAR/height by-right) | ❌ **DOES NOT EXIST** — planning is discretionary, per-LPA, PDF |
| One national planning-rule feed | ❌ NO — hundreds of LPAs, Local Plans as policy TEXT + PDF |

**Consequence for a completion scorecard:** the UK's weakness is **regulatory structure, not
mapping**. The physical context layers (buildings, roads, water, parks, terrain) can be
world-class; the *envelope* and the *legal parcel edge* are the structurally hard axes — exactly the
opposite failure mode from a data-poor country.

---

## 2 — The UK is a FEDERATION of four jurisdictions

Planning law, land registration, and LiDAR are **devolved** — each constituent country runs its own.
Structure `gb/` like `de/LANDS` and `us/CITIES`: a national umbrella + a `JURISDICTIONS/` folder.

| Jurisdiction | Planning framework | Registry / "parcel" (ownership, general bdy) | LiDAR programme | Heritage | Mapping |
|---|---|---|---|---|---|
| **England** | NPPF + per-LPA Local Plans | **HM Land Registry** (+ INSPIRE Index Polygons) | **Environment Agency** National LIDAR Programme | Historic England | OS (GB-wide) |
| **Scotland** | **NPF4** + Local Development Plans | **Registers of Scotland** (Land Register) | **Scottish Remote Sensing Portal** / SEPA | Historic Environment Scotland | OS (GB-wide) |
| **Wales** | **Planning Policy Wales (PPW)** + LDPs | HM Land Registry (Wales) | **Natural Resources Wales** LiDAR | Cadw | OS (GB-wide) |
| **Northern Ireland** | **SPPS** + Local Development Plans (Planning Portal NI) | **Land & Property Services (LPS)** | DAERA LiDAR | Historic Environment Division | **OSNI** (separate agency) |

Notes:
- **OS covers GB (England, Scotland, Wales)**; **Northern Ireland is OSNI** (Ordnance Survey of
  Northern Ireland, part of LPS) — a *separate* mapping agency with its own products, a common trap.
- **Registration is devolved and differs in KIND:** Scotland's Land Register (Registers of Scotland)
  is a **map-based** register migrating from the older Sasine register; England & Wales use HMLR;
  NI uses LPS. **All are ownership registers with general boundaries — none is a survey cadastre.**
- **LiDAR is multi-agency and per-jurisdiction** (EA / NRW / SRSP / DAERA), project-based, varying
  resolution / year / point density — every source carries acquisition metadata.

```
lon/lat  →  UKJurisdictionResolver (ONS GSS boundary → E/S/W/N)
         →  jurisdiction registry  →  { EnglandProvider, ScotlandProvider, WalesProvider, NIProvider }
             each →  { registry(ownership), planningFramework, lidarProgramme, heritage }
         →  OS layers (GB-wide: buildings/roads/water/greenspace)  [OSNI for NI]
         →  UPRN / AddressBase (national property spine)
```

---

## 3 — National vs devolved split (what is genuinely UK-wide)

| Genuinely national (UK/GB-wide) | Devolved (per-jurisdiction) |
|---|---|
| **Ordnance Survey** topographic mapping (GB; OSNI for NI) | **Planning law** (NPPF / NPF4 / PPW / SPPS) |
| **UPRN / AddressBase** property-identifier ecosystem | **Land registration** (HMLR / RoS / LPS) |
| **ONS GSS** geography codes (the join key) | **LiDAR** (EA / SRSP / NRW / DAERA) |
| **British National Grid** CRS (EPSG:27700) | **Heritage** (Historic England / HES / Cadw / HED) |
| **National Forest Inventory** (Forest Research, GB) | **Local Plans / LDPs** (per-LPA, PDF) |

**Reading:** the *plumbing* (grid, mapping, address spine) is national and strong; the *rules* and
the *ownership edge* are devolved. A GB implementation builds **one** OS/AddressBase pipeline and
**four** planning/registry adapters.

---

## 4 — CRS: British National Grid (one clean national grid)

| Zone | EPSG | Where | Notes |
|---|---|---|---|
| **OSGB36 / British National Grid** | **27700** | GB (England, Scotland, Wales) | THE native OS grid; single national projected CRS |
| **Irish Grid / ITM** | 29903 / 2157 | Northern Ireland (OSNI) | NI uses Irish Grid (legacy) / Irish Transverse Mercator |
| WGS84 lat/lon | 4326 | ingest / web | transform on ingest |

- Height datum: **ODN (Ordnance Datum Newlyn)** for GB; **Malin Head** datum for NI. Transform chain:
  native BNG → WGS84 → ENU.
- BNG (EPSG:27700) is a *clean* single national grid — no per-region zone assignment problem like
  Germany's 25832/25833. NI's Irish Grid is the one exception to watch.

---

## 5 — The parcel / ownership honesty model (read before any "parcel" claim)

The UK has three "parcel-like" things, and only the honest description keeps them straight:

| Thing | What it actually is | What it is NOT |
|---|---|---|
| **HMLR registered title + title plan** | The extent of a registered **ownership** interest, drawn on the OS base map, with **general boundaries** (s.60 LRA 2002) | NOT a surveyed legal boundary; NOT a cadastral parcel; NOT survey-grade |
| **INSPIRE Index Polygons** | A free, machine-readable, national index of **freehold** registered extents (ownership), general boundaries | NOT the full register; NOT ownership *identity*; NOT a legal parcel edge |
| **OS MasterMap Topography** | **Topographic** polygons (building/land features), the physical base map | NOT ownership; NOT a title extent |

**The structural gap:** there is **no dataset that is BOTH a surveyed edge AND ownership**. Continental
cadastres fuse those; the UK deliberately does not (the general-boundaries rule is policy, not a data
defect). Any GB "parcel" layer is therefore *ownership-general-boundary* (HMLR/INSPIRE) **or**
*topographic* (OS) — never a survey cadastre. Badge it accordingly, every time.

---

## 6 — Planning envelope layer (the expensive, discretionary one)

GB planning is **DISCRETIONARY, not as-of-right** — there is no codified numeric zoning envelope
(no FAR table, no by-right height) equivalent to Spain's ordenanzas or Germany's BauNVO. The
permitted envelope is an *outcome of discretion*, not a lookup.

```
UK Parliament (TCPA 1990 + Levelling-up and Regeneration Act 2023)
  → constituent-country framework (England NPPF · Scotland NPF4 · Wales PPW · NI SPPS)
    → Local Planning Authority Local Plan / LDP (policy TEXT + Policies Map)  ← THE governing instrument
      → discretionary determination (material considerations, framework, s.106)  ← NOT a numeric rule
      → Permitted Development Rights (the narrow as-of-right slice; devolved variations)
    → Conservation Areas + Listed Buildings (Historic England / HES / Cadw / HED overlays)
    → Article 4 Directions / Green Belt / flood zones (discretionary refusal overlays)
```

Envelope rules score ★☆☆☆☆ — LPA-by-LPA, mostly PDF, hundreds of authorities. This is the whole
expensive phase. Full national legal structure is in `README.md §1`; per-city legal work lives in the
`gb-eng/…` city RATE dossiers.

---

## 7 — Overall verdict

The UK = **strongest topographic mapping in the world (OS) + a national address spine (UPRN)**,
undercut by **no national cadastre (HMLR = ownership, general boundaries)** and **LPA-fragmented,
PDF-based, discretionary planning**. The technical context pipeline can be world-class once OS is
wired; the *legal* rule pack and the *survey* parcel edge are the structural ceilings.

Reference comparison — cadastre / mapping:
- **ES** cadastre ★★★★★ (Catastro, survey-linked) / mapping ★★★★☆
- **FR** cadastre ★★★★★ (PCI, national id) / mapping ★★★★★ (IGN)
- **DE** cadastre ★★★☆☆ (ALKIS, no national API) / mapping ★★★★☆
- **UK** cadastre **✗ none** (HMLR = ownership general-boundaries) / **mapping ★★★★★ (OS — best-in-class)**

---

## 8 — Files in this atlas

```
gb/
├── UNITED-KINGDOM.md                       ← this file (national federation architecture)
├── GEOSPATIAL-DATA-INVENTORY.md            ← the [Layer|Authority|Access|API|Licence|CRS|…] tables
├── JURISDICTIONS/                          ← per-constituent-country technical + planning profiles
│   ├── ENGLAND.md                          ← FULL (HMLR / OS / EA LiDAR / NPPF / LPAs / Historic England / Natural England)
│   ├── SCOTLAND.md                         ← structured stub (RoS / SEPA / SRSP / NPF4 / HES) — status: unprobed
│   ├── WALES.md                            ← structured stub (Welsh Gov / PPW / NRW LiDAR / Cadw / LDPs) — status: unprobed
│   └── NORTHERN-IRELAND.md                 ← structured stub (LPS / Planning Portal NI / DAERA / OSNI / HED) — status: unprobed
├── findings/
│   └── ENGLAND-CONTEXT-DATA-DEEP-DIVE-L516.md   ← per-layer hierarchies + 3-tier badging + comparison
├── README.md                               ← country legal umbrella (discretionary planning, wired-state)
├── COUNTRY-RATE.md · LEGISLATION-RATE.md · LOD-RATE.md   ← scorecard faces (NOT touched by this atlas)
├── sources/SOURCES.md                      ← national data-source citations
└── gb-eng/E12000007-london/                ← existing Greater London RATE dossier (LINKED, not edited)
```

**Linked, not edited:** the Greater London RATE dossier lives at
[`gb-eng/E12000007-london/`](./gb-eng/E12000007-london/README.md) (scorecard face
[`RATE.md`](./gb-eng/E12000007-london/RATE.md)). This atlas **links** to it; it does not modify any
RATE / LEGISLATION-RATE / COUNTRY-RATE cell.

---

*Confidence: CONVERGENT-SECONDARY throughout (OS + constituent services NOT wired in PRYZM; audit
`gb` ≈ 51%). HMLR/INSPIRE = ownership, general boundaries — NEVER survey-grade cadastre. This atlas
changes NO RATE % cell. Maintainer: UNASSIGNED.*
