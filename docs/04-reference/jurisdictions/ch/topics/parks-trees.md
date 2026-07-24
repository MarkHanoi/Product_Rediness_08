# Switzerland — Parks / Trees (context layer)

> Part of L-511 (`../../../V1-LAUNCH-READINESS-AUDIT.md`). Research ground-truth:
> `../findings/SWITZERLAND-MASTER-DATA-SOURCE-STUDY.md`. **Gate d (parks/trees): PASSED with nuance**
> (2026-07-24).

## Sources (two swissTLM3D topic groups + swissSURFACE3D)

**swissTLM3D — "Areale"** (special-land-use areas): transport, nature, habitat, **Freizeit**/leisure.
Parks, recreation grounds, and sports facilities exist here as their own polygons, distinct from
generic ground cover.

**swissTLM3D — "Bodenbedeckung"** (ground cover, independent of land use): includes **individual tree
points** and **wooded-area (Gehölzflächen) polygons** as their own object class. Confirmed
production-use: City of Zürich's open-data documentation explicitly uses this swissTLM3D layer
("Bodenbedeckung – Einzelbäume & Gehölzflächen") to supplement its municipal Baumkataster — i.e.
this is a real, currently-used data source, not a theoretical schema entry.

**swissSURFACE3D (classified LiDAR)**: includes **Low / Medium / High vegetation** as distinct point
classes — usable to derive actual canopy height per tree/wooded area, beyond a bare point location.

| Property | Value |
|---|---|
| Coverage | Full national + Liechtenstein for both TLM3D and swissSURFACE3D |
| Object-level — parks/leisure areas | **YES** — via `Areale > Freizeit` (distinct polygon class) |
| Object-level — individual trees | **YES** — as point features via `Bodenbedeckung` |
| Tree height derivable | **YES** — from swissSURFACE3D Low/Med/High vegetation point classes |
| Format | FileGDB / SHP (TLM3D); LAZ/COPC (swissSURFACE3D) |
| Licence | Free OGD since 1 March 2021 |
| Download | `map.geo.admin.ch` selection UI or swisstopo documented API |

## Known limitation — tree data authority

swissTLM3D's tree points are a **periodic recalculation** (per swisstopo and Zürich documentation),
not a continuously field-verified municipal tree cadastre. The City of Zürich explicitly assigns
**greater authority to its own municipal Baumkataster** where one exists, and uses swissTLM3D only to
supplement gaps.

**Pattern to build against:** national fallback (swissTLM3D) + local municipal override where a city
publishes its own open-data tree cadastre. Whether cities other than Zürich (Geneva, Basel, Lausanne,
Bern) maintain open municipal tree cadastres is an **open item** (see below).

## Gate answer

| # | Question | Answer |
|---|---|---|
| d (parks/trees portion) | Object-level? | **YES, with nuance** — parks/leisure land use is a confirmed distinct object class; tree data is real and object-level but is explicitly secondary to a local municipal cadastre where one exists |

## Fallback condition

swissTLM3D is the national baseline. OSM/Overture fallback is not required. Municipal tree cadastre
overrides apply where available as open data.

## Open items

| Item | What to confirm | How |
|---|---|---|
| Major-city municipal tree cadastres | Do Geneva, Basel, Lausanne, Bern publish open-data tree cadastres analogous to Zürich's Baumkataster? | Check each city's opendata.swiss or city open-data portal for "Baumkataster" or "arbres" |
| Areale Freizeit sub-types | Does the 2.4 object catalogue sub-classify Freizeit as park vs. sports field vs. playground? | Read swissTLM3D 2.4 Objektkatalog, Areale section |
