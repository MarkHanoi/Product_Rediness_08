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

## B2. VERIFIED LIVE — the MUC *qualificació* endpoint (2026-07-20)

Found via the official IDE Catalunya catalogue record, **not** by guessing hostnames, then probed
live: **HTTP 200**. This closes the "which zone is this parcel in" gap for Catalonia (**L-443**'s
practical blocker).

| Item | Value |
|---|---|
| Base URL | `https://dtes.gencat.cat/webmap/MUC/service.svc/get` |
| Protocol | **WMS 1.3.0 only** (GeoMedia WebMap). No WFS on this host. |
| Qualificacions layer | **`MUC_4QUAL`** (`queryable="1"`) — **not** `MUC_QUALIFICACIONS` |
| Zone-code fields | `CODI_QUAL_AJUNT` (municipal *clau*, e.g. `13a`), `CODI_QUAL_MUC` (synthetic, e.g. `R2`), `DESC_QUAL_*`, `CODI_INE` |
| Per-point query | `GetFeatureInfo`, `INFO_FORMAT=text/xml` |
| CRS | EPSG:25831 / 3857 / 4326 / 23031 |
| Vintage | MUC v1.2 — in force **1 Jan 2025** for the Barcelona metro area |

**Two implementation gotchas, both live-observed:** WMS 1.3.0 with EPSG:4326 uses **lat,lon** axis
order (not lon,lat); and `MUC_4QUAL` has a `MinScaleDenominator` of 4000, so an over-tight bbox
returns nothing at all — a silent empty, not an error. The earlier failed probes used
`dtes.gencat.cat/muc/`; the service actually lives under `/webmap/MUC/service.svc/get`.

---

## C. ⚠ RULE VALUES REMAIN UNSHIPPABLE — the research did NOT clear them

Research completed 2026-07-20. It produced a great deal, and **none of it may be encoded yet.**
Recording the reasons precisely, because "we researched it" is exactly the moment the honesty gate
is most likely to be skipped.

### C.1 — THE HEADLINE FINDING: there is no fixed *profunditat edificable* for the Eixample

It is **derived per block, geometrically** — a figure similar to the block, equidistant from the
street frontages, leaving ≥30% of the block area as interior free space, with an absolute cap of
30 m and a floor of 11 m (PGM NNUU Art. 242). **The 20 m and 24 m figures repeated all over the
web are not the rule.** Hard-coding either would produce precisely the confidently-wrong envelope
ADR-0270 and C58 §1.4 exist to prevent — on the densest, highest-value parcels in Spain.

**Architectural consequence, and it is significant:** an `alignment` rule with a scalar
`buildableDepth_m` **cannot express this zone**. The depth is a function of the BLOCK, which the
engine never sees — it only receives one parcel ring. So ADR-0270's rule union, which we just
completed, is still not sufficient for the actual Barcelona case. This is a genuine new finding
and needs its own item before any pack is authored; it is **not** a value to look up harder.

### C.2 — `13a` vs `13E`: an unresolved contradiction between the DATA and the LAW

Live `MUC_4QUAL` queries returned **`13a` — "Densificació Urbana Intensiva"** consistently across
Dreta de l'Eixample, Esquerra, Sant Antoni and Sagrada Família (20+ block-interior hits, zero
`13E`). But the *Ordenança de rehabilitació i millora de l'Eixample* (Consell Plenari 22-11-2002),
Art. 2, states that **clau `13E` SUBSTITUTES clau 13** in that área, defining 13E as a subzone of
13 that inherits 13a's rules residually. **The service and the ordinance disagree and the reason
was not established.** Encoding either as settled would be a guess wearing a citation.

### C.3 — FAR: zone 13/13a is NOT a FAR zone (state this prominently in any pack)

PGM NNUU Art. 322.1: *"L'edificabilitat a les zones de densificació urbana **es defineix per
l'envolupant màxima de volum**"* — the envelope IS the rule; there is no per-parcel FAR
coefficient. Coefficients do exist (2,20 m²st/m²s, 1,20 m²st/m²s) but are **procedurally gated**
to PERI / estudi de detall actuacions (Art. 322.2/322.3). **Applying either as an ordinary
per-parcel check would over-constrain every plot in the district.** This is exactly the C58 §1.11
category error — a real number that answers a different question.

### C.4 — Height: a real table exists, but it is single-sourced

The *alçada reguladora màxima* is per-zone (PGM Art. 239.1), and for 13a lives in **Art. 327.2a**,
with a **Barcelona-specific variant** (3,35 m/floor vs the generic 3,05 m) giving 9,00 / 12,35 /
15,70 / 19,05 / 22,40 / 25,75 m across the street-width bands. **Single-sourced and font-decoded
from a scan — must be re-verified by eye before shipping.**

### C.5 — ⚠ THE PROVENANCE PROBLEM THAT BLOCKS EVERYTHING ABOVE

Every PGM NNUU article quoted (242, 237, 241, 322, 327) rests on **ONE secondary document**: the
AMB/MMAMB *Normativa Urbanística Metropolitana* (Dec 2010), which **disclaims its own authority
in its own words** — *"No es tracta d'una publicació oficial sinó merament divulgativa…
prevaldrà el redactat contingut en els textos oficialment aprovats"* — consolidates only to
**31 Dec 2009**, and had to be retrieved from a **commercial third-party site** because `amb.cat`
and BCNROC block automated access. **Under this folder's authoring contract that is SECONDARY, and
secondary never becomes a pack value.**

Also unresolved: **whether the Eixample Ordinance is still in force** (a Diputació aggregator shows
"Vigent" alongside two 2015 "Derogació" rows). Art. 9's rules depend on the answer.

### C.6 — What a human must do next (both merge-blocking, both WAF-blocked to automation)

1. Open `w123.bcn.cat/APPS/egaseta/` in a real browser and settle the 2015 derogation question.
2. Confirm Barcelona's modified Art. 327 height table against DOGC 4893 (29.5.2007) / DOGC 5224
   (29.9.2008) or portaljuridic.

**Excluded, but flagged because they dominate search results and are the obvious trap:**
`gramenet.cat/.../13arv.pdf` is **Santa Coloma**, and `geoportalplanejament.amb.cat/.../08015_13a.htm`
is **INE 08015 = Badalona** — Barcelona is **08019**. Santa Coloma's fitxa carries local overrides
(2,75 m/floor, 6,50 m façana) that contradict the general PGM. Using either would look perfectly
plausible and be wrong.

---

## D. Unverified / open

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
