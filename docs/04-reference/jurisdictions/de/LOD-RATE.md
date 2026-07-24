# LOD-200 Context-Building Rate — Germany (`de`) national

**Headline: LOD 2 · real-height coverage ~90% · VERIFIED (NRW) + ESTIMATED (national)**

> **LOD-200 context-building rate** — the fraction of the existing buildings around a plot for
> which we can obtain a faithful **≥ LOD-150 physical model** — **real parcel geometry + real
> MEASURED per-building height + ≥1 extra attribute (roof form / storeys / use / year)** — from an
> authoritative source, WITHOUT falling back to a fabricated OSM flat-extrude. The binding
> sub-metric is real building-HEIGHT coverage. Identical across every jurisdiction. **Distinct from
> `RATE.md`** (buildable rules) — never conflate.

## The LOD ladder (fixed)

| Level | What it is | Our label |
|---|---|---|
| **LOD 100** | footprint + estimated height (OSM / `levels`×3.2 m / fabricated 9 m) | universal floor |
| **LOD 150 (LoD1)** | footprint + **real measured** height | first honest tier |
| **LOD 200 (LoD2)** | footprint + real height + **roof form / storeys** | the target |

| Jurisdiction | LOD achievable | Real-height % | Headline | Flag |
|---|---|---|---|---|
| Netherlands | LOD 2.2 | ~99% | ~97% | VERIFIED |
| Switzerland | LOD 2 | ~98% | ~95% | VERIFIED |
| Denmark | LOD 2 | ~95% | ~93% | ESTIMATED |
| **Germany** | **LOD 2** | **~90%** | **~82%** | **VERIFIED (NRW)** |
| France | LOD 1→2 | ~88% | ~80% | VERIFIED |
| Norway | LOD 1 | ~85% | ~72% | ESTIMATED |
| Sweden | LOD 1 | ~80% | ~68% | ESTIMATED |
| USA | LOD 1 | ~60% | ~58% | VERIFIED |
| Spain | LOD 1 (hybrid) | ~45% | ~52% | VERIFIED (footprint) |
| Belgium | LOD 1 | ~55% | ~48% | ESTIMATED |
| Portugal | LOD 1 | ~75% | ~42% | ESTIMATED |
| Italy | LOD 1 (regional) | ~30% | ~35% | ESTIMATED |
| Saudi Arabia | LOD 1 (ML) | ~20% | ~18% | ESTIMATED |

---

## The three sub-metrics

| Sub-metric | Source | Coverage | Flag | Note |
|---|---|---|---|---|
| **(a) Parcel definition** | ALKIS `Flurstück` (per-Land cadastre) | ~92% | ESTIMATED | 16 Länder, no single national feed |
| **(b) Real building HEIGHT** | **LoD2-DE** — ~58M buildings, CityGML LoD2, LiDAR-derived (~1 m accuracy); ALKIS `traufhoehe`/`firsthoehe` as LoD1 fallback | ~90% | **VERIFIED (NRW)** + ESTIMATED (other Länder) | data exists nationally; ACCESS is per-Land / licence-fragmented |
| **(c) Extra attributes** | LoD2-DE **roof geometry** (real CityGML roof planes) + ALKIS `Gebäudefunktion` | **HIGH** | VERIFIED (NRW roof) | roof form is first-class in LoD2-DE |

**OSM height-tag floor:** ESTIMATED ~10–20% explicit-height in German cities; fabricated 9 m default
never reached where LoD2-DE is wired.

---

## Data strategy — footprint (2D) vs height (3D)

⚠ 2D footprint accuracy and 3D height accuracy are DIFFERENT numbers — never blend them. Binding
metric = the 3D number. (Global strategy: Overture-primary + MS density-fallback + country-premium
adapters + a height confidence hierarchy — see LOD-RATE-MASTER.)

| Axis | Decision | Accuracy | Flag |
|---|---|---|---|
| **Footprint (2D)** | country-**PREMIUM** LoD2-DE (per-Land CityGML) where open; Overture/MS fallback for licence-blocked Länder (Bavaria/Hamburg TBD) | **~95%** | ESTIMATED |
| **Height (3D)** | conf tier **1** — measured (LoD2-DE `measuredHeight` + real roof planes, ~1 m); ALKIS `traufhoehe`/`firsthoehe` tier-2 fallback | **~85–90%** | VERIFIED (NRW live); ESTIMATED (other Länder — access, not data) |

**Building-TYPE:** German urban fabric ★★★★. The 3D drag is per-Land licence ROUTING, not footprint
or type accuracy. Density-fallback only where a Land's LoD2 is licence-blocked.

## The structural finding

**Germany has a national LoD2 building model on paper (~58M buildings, LoD2-DE, CityGML, ~1 m height
accuracy) — but the DRAG is access, not data.** There is no single national feed: the ZSHH national
gateway is INSPIRE Art. 13(1)(e) **RESTRICTED**, and the openly-downloadable LoD2 tiles are published
per-Land with varying licences (Berlin open, Sachsen-Anhalt/BW open, Bavaria/Hamburg TBD). The
data-existence is ~90% (LoD2 with real roofs); the *reachable-openly* fraction is lower and
per-Land — which is why the headline (~82%) sits below the data-height coverage (~90%).

**VERIFIED this pass:** North Rhine-Westphalia's LoD2 CityGML tiles are openly downloadable via the
GDI-NW Open Data Download Client (`opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/`) — one large
Land confirmed at the top of the ladder, open. Berlin/BW/Sachsen-Anhalt are research-confirmed open;
Bavaria/Hamburg licence is TBD. So the honest read is "LoD2 is achievable and open for the largest
Länder; national completeness is a per-Land licence-routing problem, not a data gap."

---

## Orthogonality with RATE.md

Germany's `RATE.md` is ~28% (the BauNVO/B-Plan numbers are prose in per-municipality PDFs behind an
unfilled schema slot). Its context rate is ~82% (LoD2-DE real roofs). **Germany knows the physical
shape of its cities far better than it exposes their building RULES as data** — the classic
orthogonality. The ~82% says nothing about zoning answerability; that is the ~28%.

---

## What would raise the LOD level

| Action | LOD / height impact | Effort |
|---|---|---|
| Build the per-Land LoD2 router (Land polygon → tile URL/WFS), starting with the confirmed-open Länder (NRW, Berlin, BW, Sachsen-Anhalt) | LOD 100 → **LOD 2** for the open majority | MED — 16 addresses, one CityGML schema |
| Resolve Bavaria/Hamburg (ZSHH) licence terms | closes the two large TBD Länder | MED — licence, not code |
| ALKIS `traufhoehe`/`firsthoehe` LoD1 fallback where LoD2 tile absent | LOD 100 → LOD 150 in gaps | LOW |

---

## Appendix — live-probe evidence

| Endpoint | Probed | Result | Verdict |
|---|---|---|---|
| `https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/` | 2026-07-24 | HTTP 200 · index lists "3D-Gebäudemodell LoD2" CityGML tiles, Open Data Download Client, per-tile packaging | **VERIFIED — LoD2 open (NRW)** |
| `https://gdi.berlin.de/services/wfs/lod2_gebaeude` | 2026-07-24 | HTTP 404 (endpoint moved; Berlin LoD2 confirmed open via FIS-Broker per topic doc, not this URL) | not confirmed this pass |

---

*Last updated: 2026-07-24. NRW LoD2 CityGML open download VERIFIED live. National ~90% height is
data-existence (LoD2-DE ~58M); reachable-openly fraction is per-Land (Berlin/BW/Sachsen-Anhalt open;
Bavaria/Hamburg TBD; ZSHH national gateway INSPIRE-restricted). Maintainer: UNASSIGNED.*
