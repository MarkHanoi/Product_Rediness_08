# Barcelona (INE 08019) — per-field sources

**Status: OPEN — no rule values verified yet. The pack MUST NOT ship values from this file
until the rows below carry real citations.**

Per the authoring contract (`../../../README.md`), every value the pack sets needs a row here:
value · unit · governing article · document · URL. **A field with no citable source stays
`null` in the pack** and is listed under *Unverified* below. Never interpolate or infer.

---

## A. VERIFIED LIVE — parcel identity + geometry (Tier A)

Captured 2026-07-20 by direct endpoint call. Per **L-438**, endpoint claims are citable only
from an endpoint RESPONSE, never from portal prose — these are responses.

| Item | Value | Source |
|---|---|---|
| Parcel identity service | HTTP 200 | `ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR_Distancia?SRS=EPSG:4326&Coordenada_X=2.1650&Coordenada_Y=41.3925` |
| Pilot parcel refcat | `0229720DF3802G` | ↑ same response |
| Pilot parcel address | `PS GRACIA 56 BARCELONA (BARCELONA)` | ↑ same response |
| Parcel geometry service | HTTP 200, `gml:posList` present, 32 points | `ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0&request=GetFeature&STOREDQUERIE_ID=GetParcel&refcat=0229720DF3802G&srsname=EPSG::4326` |
| Pilot parcel area | `1046` m² (`cp:areaValue uom="m2"`) | ↑ same response |
| Parcel `gml:id` | `ES.SDGC.CP.0229720DF3802G` | ↑ same response |

**Operational note worth keeping:** the plain `Consulta_RCCOOR` (non-distance) variant returned
`cod 16 — PARA ESAS COORDENADAS NO HAY REFERENCIA DISPONIBLE` for the same coordinate, which had
landed in the street. Production already uses `_Distancia`; in dense urban fabric that choice is
load-bearing, not a convenience.

### Pilot parcel ring (EPSG:4326, lat lon pairs, 32 pts)

```
41.392927 2.165278  41.392908 2.165304  41.392889 2.165329  41.392881 2.165341
41.392863 2.165364  41.392843 2.165391  41.392790 2.165461  41.392580 2.165179
41.392577 2.165181  41.392551 2.165104  41.392554 2.165102  41.392554 2.165066
41.392551 2.165065  41.392552 2.164999  41.392555 2.164998  41.392559 2.164960
41.392556 2.164958  41.392580 2.164889  41.392583 2.164889  41.392623 2.164838
41.392673 2.164909  41.392692 2.164936  41.392727 2.164982  41.392732 2.164989
41.392746 2.165011  41.392779 2.165060  41.392804 2.165098  41.392818 2.165118
41.392826 2.165129  41.392878 2.165206  41.392918 2.165264  41.392927 2.165278
```

Chosen as the pilot fixture because it is a real Cerdà-grid plot with a clear street alignment
(the *alineació a vial* case a setback triple cannot express), and because at 32 points it is
genuinely irregular — it exercises the non-convex inset path (**L-403**) rather than the
easy-rectangle case that has hidden defects here before (**L-453**).

---

## B. RULE VALUES — **NONE VERIFIED**

| Field | Value | Unit | Article | Document | URL |
|---|---|---|---|---|---|
| `alignment.buildableDepth_m` (*profunditat edificable*) | — | m | — | — | — |
| `alignment.alignTo` | — | — | — | — | — |
| `alignment.sideTreatment` (*mitgera*) | — | — | — | — | — |
| `maxHeight_m` (*alçada reguladora màxima*) | — | m | — | — | — |
| `maxFloors` | — | — | — | — | — |
| `plotRatioFAR` / *edificabilitat* | — | — | — | — | — |
| zone code (*clau de qualificació*) | — | — | — | — | — |

**Nothing above may be filled from memory or from a secondary source.** Barcelona is governed by
the **PGM-1976** plus the **Ordenances Metropolitanes d'Edificació**, whose operative numbers sit
in normative prose and raster *plànols*. Per **L-438** no Spanish service publishes them, so each
row requires reading the primary document — that is the curation cost **L-450** scoped, and the
reason the human gate in **L-449** exists.

⚠ **A number that appears only in a blog, a lecture slide or a paper is SECONDARY and does not
qualify.** Mark such findings explicitly as secondary in the research notes; do not promote them
into this table. The Eixample's parameters are widely repeated online and frequently wrong or
version-stale (PGM-1976 has been modified many times), which is precisely the trap.

---

## C. Unverified / open

- The *clau* (zone code) that applies to Eixample blocks — **not established**. Without it a
  correct rule library cannot be applied to a parcel (**L-443**: this is the practical blocker,
  not the rule schema).
- The Catalonia **MUC** `MUC_QUALIFICACIONS` service endpoint — **not established.** Six
  candidate hosts were probed live on 2026-07-20 and all failed
  (`geoserveis.icgc.cat/servei/catalunya/muc/wfs` 404; `geoserveis.icgc.cat/icc_mapesbase/wms/service`
  404; `sig.gencat.cat/arcgis/rest/services` 404; `serveis.territori.gencat.cat`,
  `serveisrest.gencat.cat`, `mapaurbanistic.gencat.cat` DNS failure; `dtes.gencat.cat/muc/` 403).
  **None of this is evidence the service does not exist — only that these guesses are wrong.**
  The real endpoint must come from a catalogue record, not from hostname pattern-matching.
- MUC data currency for the Barcelona metro area is **1 Jan 2025** (region-wide: 1 Jan 2026) —
  per the research doc; re-confirm from the service itself before relying on it.
