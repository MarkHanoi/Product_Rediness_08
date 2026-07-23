# Lyon Métropole (`69123`) — Jurisdiction Pack

**Country:** `fr` · **Region:** Auvergne-Rhône-Alpes (`fr-ara`) · **INSEE (commune centre):** `69123` ·
**Governing document:** PLU-H (Plan Local d'Urbanisme et de l'Habitat), intercommunal — covers all **58 communes** of the Métropole de Lyon (SIREN 200046977) · **In force:** June 2019 ·
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED

---

## Why Lyon first among the three metros

Lyon Métropole is the **cheapest first French city** if — and only if — the national GPU WFS
exposes the `HBCPRINC`/`HBCSEC`/`PLAFOND` height attributes directly on the zoning polygons.
If that probe returns those fields, the outer 56 communes are a config-style pack (existing
engine kind, ~5–7 dev-days). If not, a second data source integration against
`data.grandlyon.com` is required, adding ~3–5 dev-days and a new connector.

**The single most important pre-implementation action for all of France is to run the Lyon
GPU probe (see `NEXT.md §1`, exact command included).**

---

## Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Critical probe** — GPU WFS + `HBCPRINC` field | NOT RUN | Run it first; changes cost estimate by ~3–5 dev-days |
| **Zoning identification** | RESEARCH COMPLETE — GPU endpoint confirmed, not live-probed | Live GPU probe |
| **Context data (LOD1)** | RESEARCH COMPLETE — BD TOPO endpoint confirmed, not live-probed | Live BD TOPO probe |
| **Rule pack — outer 56 communes (PLU-H `HBCPRINC`/`PLAFOND` path)** | NOT STARTED | Critical probe returns field in GPU WFS |
| **Rule pack — Lyon + Villeurbanne (height-perimeter overlay)** | NOT STARTED | Overlay layer confirmed and sourced |
| **Overlay: SUP (flood, aviation)** | NOT STARTED | GPU SUP layer probe |
| **Overlay: ABF perimeters** | NOT STARTED | ABF SUP sub-type confirmed |

**Overall status: NOT STARTED (research phase complete; critical probe pending).**

---

## Scope: 58 communes, one PLU-H

The PLU-H is a single intercommunal planning document covering all communes of the Métropole de
Lyon, including the city of Lyon proper and 57 surrounding communes. This means **one sourcing
effort yields 58 communes' worth of coverage** — the best per-commune efficiency of any French
city studied.

However, the document is not uniform in height mechanism across all 58 communes:
- **Outer 56 communes:** height is expressed as a structured attribute on the GIS zoning polygon
  (`HBCPRINC`, `HBCSEC`, `PLAFOND`, + coefficient d'emprise au sol). This is the cheapest path.
- **Lyon + Villeurbanne (the 2 core communes):** height is NOT on the polygon attribute but is
  governed by separate **"périmètres de hauteurs de façades" overlay zones** — a distinct GIS
  layer that must be joined to the base zoning layer. This is a different sub-problem.

---

## Height mechanism — outer 56 communes

Lyon Métropole's PLU-H carries height as **structured GIS attributes on the zoning polygon**,
not as a prose table in a règlement article. The fields are:

| Field | Meaning | Notes |
|---|---|---|
| `HBCPRINC` | Hauteur de la bande constructible principale (m) — height limit in the primary buildable band | Numeric value, metres |
| `HBCSEC` | Hauteur de la bande constructible secondaire (m) — height limit in the secondary buildable band (set back from street, if applicable) | Numeric value or null |
| `PLAFOND` | Height cap/ceiling (m) — used where no band split is defined | Numeric value; alternative to HBCPRINC/HBCSEC |
| Coefficient d'emprise au sol | Footprint coverage percentage | Per zone or per block |

**If these fields are on the national GPU WFS response**, then implementing Lyon outer communes
is primarily a config exercise (read field value, apply as `maxHeight` for the relevant facade
band). No new engine kind is required — `alignment` or `block-derived-alignment` kinds already
handle banded height setups.

**CRITICAL UNRESOLVED:** are these fields on the **national** GPU WFS (`data.geopf.fr/...`) or
only on Lyon's own open-data portal (`data.grandlyon.com`)? This is the key probe.

---

## Height mechanism — Lyon and Villeurbanne (core 2 communes)

Inside Lyon and Villeurbanne, the PLU-H replaces the simple polygon attribute with a separate
**"périmètres de hauteurs de façades" layer** — overlay zones each carrying a specific facade
height constraint that overrides the base zone attribute.

This is a GIS layer join problem, not a new engine kind:
1. Identify the base zone from the GPU WFS result.
2. Join against the périmètres layer for the parcel bbox.
3. If a périmètre polygon intersects the parcel, its height value overrides the base zone attribute.
4. If not, fall back to `HBCPRINC`/`PLAFOND` from the base zone.

**Sourcing requirement:** the périmètres layer must be obtained, probed for machine-readability
and licence, and ingested before the Lyon/Villeurbanne pack can ship.

---

## Zone structure (PLU-H overview)

Lyon Métropole's PLU-H zone taxonomy is larger than Paris (reflecting an intercommunal document
covering diverse urban character across 58 communes):

| Zone family | Character | Note |
|---|---|---|
| `UA` | Dense historic urban fabric | City-centre commercial streets |
| `UB` | Mixed urban residential | Transition zones |
| `UC` | Residential, lower density | Suburbs, pavilions |
| `UD` | Residential, large plots | Outer suburban |
| `UE` | Economic / commercial zones | Business parks, retail |
| `UF` | Institutional / university | Campuses |
| `N` | Natural | Green corridors, hillsides |
| `A` | Agricultural | Outer communes |

Each zone/subzone carries its own `HBCPRINC`/`PLAFOND` values in the GIS layer. The zone codes
are defined by the PLU-H règlement; unlike Paris, there are many subzones (e.g., `UCe1a`,
`UCe1b` distinguish sub-sectors even within the same basic zone). The GIS attribute approach means
these are config values, not free-text interpretations.

---

## FAR and emprise au sol

| Field | Value | Instrument |
|---|---|---|
| **COS (FAR)** | `n/a — abolished nationwide (loi ALUR 2014)` | Loi n° 2014-366 |
| **Emprise au sol** | Numeric coefficient per zone/block — structured attribute in GIS (outside Lyon/Villeurbanne) | PLU-H règlement + GIS attribute |

---

## Overlays

| Overlay | Source | Status | Risk |
|---|---|---|---|
| SUP flood / aviation | GPU SUP layer | NOT probed | LOW — structurally queryable |
| ABF perimeters | GPU SUP layer | NOT probed | MEDIUM — Lyon has significant historic fabric but fewer monuments than Paris |
| Lyon/Villeurbanne height-perimeter overlay | Métropole de Lyon GIS layer (or national GPU?) | NOT sourced | MEDIUM — changes cost for core city |
| OAP (Orientations d'Aménagement et de Programmation) | GPU or Métropole portal | NOT sourced | LOW — project-level guidance, not parcel-level numeric rules |

---

## Source hierarchy

| Data needed | Source | Confidence |
|---|---|---|
| Parcel geometry | IGN PCI Express / API Carto | `corroborated` |
| Zone code + governing doc | GPU API (`apicarto.ign.fr/api/gpu`) | `corroborated` |
| Zone height attributes (`HBCPRINC`/`PLAFOND`) | **National GPU WFS** (if confirmed) or **`data.grandlyon.com`** (fallback) | **UNRESOLVED — the critical probe** |
| Height-perimeter overlay (Lyon/Villeurbanne) | Métropole de Lyon open data — layer name TBD | NOT YET |
| Context buildings + height | BD TOPO `data.geopf.fr/wfs` | `corroborated` |
| PLU-H règlement text (for verification) | PDF via GPU-returned link | NOT YET |

---

## Development estimate

| Scenario | Work item | Dev-days |
|---|---|---|
| **Best case** — `HBCPRINC`/`PLAFOND` on national GPU WFS | Source + config outer 56 communes | ~5–7 |
| **Best case** — Lyon/Villeurbanne height-perimeter overlay | Overlay layer integration | ~8–10 |
| **Best case total** | | **~13–17 d** |
| **Worst case** — fields only on `data.grandlyon.com` | Add second data source connector | +3–5 d additional |
| **Worst case total** | | **~16–22 d** |

**Note:** the outer-communes pack (56 communes, config-only) can ship before the
Lyon/Villeurbanne overlay integration is complete — these are independent delivery items.

---

## Open questions

1. **Do `HBCPRINC`/`HBCSEC`/`PLAFOND` appear in the national GPU WFS response for a Lyon parcel?**
   This is the single most important pre-implementation probe for France. See `NEXT.md §1`.
2. **What is the layer name for "périmètres de hauteurs de façades" in the Métropole de Lyon
   open-data portal?** Search `data.grandlyon.com` for `hauteur`, `facade`, `perimetre` keywords.
3. **Are the 58 PLU-H communes all individually listed in the GPU registry, or is the EPCI entry
   a single record with all 58 commune geometries?** This affects how the zone lookup is keyed
   (by parcel bbox, returning the correct EPCI document).
4. **Has the PLU-H been amended since June 2019?** Check GPU for the current consolidated version
   date before sourcing any article values.

---

**Related files:** `../../README.md` (country umbrella) · `../../NEXT.md` (blockers + resume) ·
`../../findings/FRANCE-MASTER-DATA-SOURCE-STUDY.md §B.2` (full Lyon analysis) ·
`sources/SOURCES.md` · `NEXT.md`
